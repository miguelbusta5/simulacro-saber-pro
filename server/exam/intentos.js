'use strict';

const { consulta, uno, ejecutar, enTransaccion, ahora } = require('../db');
const { armarSimulacro } = require('./selection');
const {
  VERSION_ACTIVA,
  NOMBRES_MODULO,
  modulosDe,
  duracionDe,
  nombreVersion,
  nombreCompetencia,
} = require('./blueprint');
const { calificarModulo, promedioGlobal, DESCRIPCION_NIVEL } = require('./scoring');

class ErrorApp extends Error {
  constructor(status, codigo, mensaje) {
    super(mensaje);
    this.status = status;
    this.codigo = codigo;
  }
}

function segundosRestantes(intento) {
  return Math.max(0, Math.round((new Date(intento.vence_en).getTime() - Date.now()) / 1000));
}

// Cierra de forma perezosa cualquier intento cuyo plazo ya venció. Se llama en
// cada petición autenticada: por eso cerrar el navegador no regala tiempo y el
// examen se autoentrega cuando se acaba el reloj.
async function cerrarVencidos(userId) {
  const vencidos = await consulta(
    "SELECT id FROM intentos WHERE user_id = $1 AND estado = 'en_curso' AND vence_en <= $2",
    [userId, ahora()]
  );
  for (const v of vencidos) {
    await finalizarIntento(v.id, userId, 'tiempo_agotado');
  }
  return vencidos.length;
}

async function intentoActivoDe(userId) {
  return uno("SELECT * FROM intentos WHERE user_id = $1 AND estado = 'en_curso'", [userId]);
}

async function obtenerIntento(id, userId) {
  const numero = Number(id);
  if (!Number.isInteger(numero)) {
    throw new ErrorApp(404, 'NO_ENCONTRADO', 'Ese intento no existe.');
  }
  const intento = await uno('SELECT * FROM intentos WHERE id = $1', [numero]);
  if (!intento) throw new ErrorApp(404, 'NO_ENCONTRADO', 'Ese intento no existe.');
  if (intento.user_id !== userId) {
    throw new ErrorApp(403, 'AJENO', 'Ese intento pertenece a otro usuario.');
  }
  return intento;
}

async function crearIntento(userId) {
  await cerrarVencidos(userId);
  if (await intentoActivoDe(userId)) {
    throw new ErrorApp(
      409,
      'INTENTO_EN_CURSO',
      'Ya tienes un simulacro en curso. Debes terminarlo antes de iniciar otro.'
    );
  }

  // Los simulacros nuevos siempre se arman con la versión más reciente.
  const version = VERSION_ACTIVA;
  const preguntas = await armarSimulacro(userId, version);
  const inicio = new Date();
  const vence = new Date(inicio.getTime() + duracionDe(version) * 60 * 1000);

  try {
    return await enTransaccion(async (cliente) => {
      const filas = await consulta(
        `INSERT INTO intentos (user_id, estado, version, iniciado_en, vence_en)
         VALUES ($1, 'en_curso', $2, $3, $4) RETURNING id`,
        [userId, version, inicio.toISOString(), vence.toISOString()],
        cliente
      );
      const intentoId = filas[0].id;

      // Una sola inserción con arreglos paralelos: 160 viajes de ida y vuelta
      // a la base serían muy lentos contra un Postgres remoto.
      await ejecutar(
        `INSERT INTO intento_preguntas (intento_id, orden, pregunta_id, modulo)
         SELECT $1::int, orden, pregunta_id, modulo
           FROM unnest($2::int[], $3::text[], $4::text[]) AS t(orden, pregunta_id, modulo)`,
        [
          intentoId,
          preguntas.map((_, i) => i + 1),
          preguntas.map((p) => p.pregunta_id),
          preguntas.map((p) => p.modulo),
        ],
        cliente
      );

      return intentoId;
    });
  } catch (e) {
    // El índice único parcial es la última defensa contra dos intentos activos.
    if (String(e.message).includes('idx_un_intento_activo')) {
      throw new ErrorApp(409, 'INTENTO_EN_CURSO', 'Ya tienes un simulacro en curso.');
    }
    throw e;
  }
}

const SQL_PREGUNTAS_EXAMEN = `
  SELECT ip.orden, p.id, p.modulo, p.enunciado, p.opciones, p.contexto_id,
         c.titulo AS contexto_titulo, c.contenido AS contexto_contenido, c.fuente AS contexto_fuente,
         r.opcion AS marcada, r.marcada AS revisar
    FROM intento_preguntas ip
    JOIN preguntas p ON p.id = ip.pregunta_id
    LEFT JOIN contextos c ON c.id = p.contexto_id
    LEFT JOIN respuestas r ON r.intento_id = ip.intento_id AND r.pregunta_id = p.id
   WHERE ip.intento_id = $1
   ORDER BY ip.orden
`;

// Cuadernillo para presentar el examen. NUNCA incluye la respuesta correcta ni
// las justificaciones: eso solo aparece en la revisión posterior.
async function cuadernillo(intento) {
  const filas = await consulta(SQL_PREGUNTAS_EXAMEN, [intento.id]);
  return {
    intento_id: intento.id,
    estado: intento.estado,
    version: intento.version,
    version_nombre: nombreVersion(intento.version),
    iniciado_en: intento.iniciado_en,
    vence_en: intento.vence_en,
    duracion_minutos: duracionDe(intento.version),
    segundos_restantes: segundosRestantes(intento),
    modulos: modulosDe(intento.version).map((m) => ({
      id: m.id,
      nombre: m.nombre,
      preguntas: filas.filter((f) => f.modulo === m.id).length,
    })),
    preguntas: filas.map((f) => ({
      numero: f.orden,
      id: f.id,
      modulo: f.modulo,
      modulo_nombre: NOMBRES_MODULO[f.modulo] || f.modulo,
      enunciado: f.enunciado,
      opciones: JSON.parse(f.opciones),
      contexto: f.contexto_id
        ? {
            id: f.contexto_id,
            titulo: f.contexto_titulo,
            contenido: f.contexto_contenido,
            fuente: f.contexto_fuente,
          }
        : null,
      marcada: f.marcada ?? null,
      revisar: !!f.revisar,
    })),
  };
}

async function guardarRespuesta(intentoId, userId, preguntaId, opcion, revisar) {
  const intento = await obtenerIntento(intentoId, userId);
  if (intento.estado !== 'en_curso') {
    throw new ErrorApp(409, 'INTENTO_FINALIZADO', 'Este simulacro ya fue finalizado.');
  }
  if (new Date(intento.vence_en).getTime() <= Date.now()) {
    await finalizarIntento(intento.id, userId, 'tiempo_agotado');
    throw new ErrorApp(409, 'TIEMPO_AGOTADO', 'Se acabó el tiempo: el simulacro se entregó solo.');
  }

  const pertenece = await uno(
    'SELECT 1 AS ok FROM intento_preguntas WHERE intento_id = $1 AND pregunta_id = $2',
    [intento.id, preguntaId]
  );
  if (!pertenece) {
    throw new ErrorApp(404, 'NO_ENCONTRADO', 'Esa pregunta no está en este simulacro.');
  }

  const pregunta = await uno('SELECT opciones FROM preguntas WHERE id = $1', [preguntaId]);
  const validas = JSON.parse(pregunta.opciones).map((o) => o.clave);
  if (opcion !== null && !validas.includes(opcion)) {
    throw new ErrorApp(400, 'OPCION_INVALIDA', 'Esa opción no existe en la pregunta.');
  }

  await ejecutar(
    `INSERT INTO respuestas (intento_id, pregunta_id, opcion, marcada, respondido_en)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (intento_id, pregunta_id) DO UPDATE SET
       opcion = EXCLUDED.opcion,
       marcada = EXCLUDED.marcada,
       respondido_en = EXCLUDED.respondido_en`,
    [intento.id, preguntaId, opcion, revisar ? 1 : 0, ahora()]
  );

  return { segundos_restantes: segundosRestantes(intento) };
}

async function finalizarIntento(intentoId, userId, motivo = 'entregado') {
  const intento = await obtenerIntento(intentoId, userId);
  if (intento.estado === 'finalizado') return intento.id;

  const filas = await consulta(
    `SELECT ip.modulo, p.correcta, r.opcion AS marcada
       FROM intento_preguntas ip
       JOIN preguntas p ON p.id = ip.pregunta_id
       LEFT JOIN respuestas r ON r.intento_id = ip.intento_id AND r.pregunta_id = p.id
      WHERE ip.intento_id = $1`,
    [intento.id]
  );

  const acumulado = new Map();
  for (const f of filas) {
    if (!acumulado.has(f.modulo)) acumulado.set(f.modulo, { aciertos: 0, total: 0 });
    const a = acumulado.get(f.modulo);
    a.total++;
    if (f.marcada != null && f.marcada === f.correcta) a.aciertos++;
  }

  await enTransaccion(async (cliente) => {
    for (const m of modulosDe(intento.version)) {
      const a = acumulado.get(m.id) || { aciertos: 0, total: 0 };
      const r = calificarModulo(m.id, a.aciertos, a.total);
      await ejecutar(
        `INSERT INTO resultados (intento_id, modulo, aciertos, total, puntaje, nivel)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (intento_id, modulo) DO UPDATE SET
           aciertos = EXCLUDED.aciertos, total = EXCLUDED.total,
           puntaje = EXCLUDED.puntaje, nivel = EXCLUDED.nivel`,
        [intento.id, m.id, r.aciertos, r.total, r.puntaje, r.nivel],
        cliente
      );
    }
    await ejecutar(
      "UPDATE intentos SET estado = 'finalizado', finalizado_en = $1, motivo_cierre = $2 WHERE id = $3",
      [ahora(), motivo, intento.id],
      cliente
    );
  });

  return intento.id;
}

async function resultadosDe(intentoId) {
  const intento = await uno('SELECT * FROM intentos WHERE id = $1', [intentoId]);
  const filas = (await consulta('SELECT * FROM resultados WHERE intento_id = $1', [intentoId])).map(
    (r) => ({
      modulo: r.modulo,
      modulo_nombre: NOMBRES_MODULO[r.modulo] || r.modulo,
      aciertos: r.aciertos,
      total: r.total,
      porcentaje: r.total ? Math.round((r.aciertos / r.total) * 100) : 0,
      puntaje: r.puntaje,
      nivel: r.nivel,
      descripcion_nivel: DESCRIPCION_NIVEL[r.nivel] || '',
    })
  );
  // Se respeta el orden del blueprint de la versión con la que se presentó el
  // intento, no el de la base de datos.
  const modulos = modulosDe(intento.version);
  filas.sort(
    (a, b) =>
      modulos.findIndex((m) => m.id === a.modulo) - modulos.findIndex((m) => m.id === b.modulo)
  );

  const { n: respondidas } = await uno(
    'SELECT COUNT(*)::int AS n FROM respuestas WHERE intento_id = $1 AND opcion IS NOT NULL',
    [intentoId]
  );

  const duracionSeg = intento.finalizado_en
    ? Math.round(
        (new Date(intento.finalizado_en).getTime() - new Date(intento.iniciado_en).getTime()) / 1000
      )
    : null;

  return {
    intento_id: intentoId,
    version: intento.version,
    version_nombre: nombreVersion(intento.version),
    iniciado_en: intento.iniciado_en,
    finalizado_en: intento.finalizado_en,
    motivo_cierre: intento.motivo_cierre,
    duracion_segundos: duracionSeg,
    duracion_minutos_permitidos: duracionDe(intento.version),
    respondidas,
    aciertos: filas.reduce((s, r) => s + r.aciertos, 0),
    total: filas.reduce((s, r) => s + r.total, 0),
    puntaje_global: promedioGlobal(filas),
    modulos: filas,
  };
}

const SQL_REVISION = `
  SELECT ip.orden, p.id, p.modulo, p.competencia, p.tema, p.enunciado, p.opciones,
         p.correcta, p.justificacion, p.justificaciones_incorrectas, p.contexto_id,
         c.titulo AS contexto_titulo, c.contenido AS contexto_contenido, c.fuente AS contexto_fuente,
         r.opcion AS marcada
    FROM intento_preguntas ip
    JOIN preguntas p ON p.id = ip.pregunta_id
    LEFT JOIN contextos c ON c.id = p.contexto_id
    LEFT JOIN respuestas r ON r.intento_id = ip.intento_id AND r.pregunta_id = p.id
   WHERE ip.intento_id = $1
   ORDER BY ip.orden
`;

async function revisionDe(intentoId) {
  const filas = await consulta(SQL_REVISION, [intentoId]);
  return filas.map((f) => ({
    numero: f.orden,
    id: f.id,
    modulo: f.modulo,
    modulo_nombre: NOMBRES_MODULO[f.modulo] || f.modulo,
    competencia: f.competencia,
    competencia_nombre: nombreCompetencia(f.competencia),
    tema: f.tema,
    enunciado: f.enunciado,
    opciones: JSON.parse(f.opciones),
    contexto: f.contexto_id
      ? { titulo: f.contexto_titulo, contenido: f.contexto_contenido, fuente: f.contexto_fuente }
      : null,
    marcada: f.marcada ?? null,
    correcta: f.correcta,
    estado:
      f.marcada == null ? 'sin_responder' : f.marcada === f.correcta ? 'correcta' : 'incorrecta',
    justificacion: f.justificacion,
    justificacion_error:
      f.marcada && f.marcada !== f.correcta
        ? JSON.parse(f.justificaciones_incorrectas)[f.marcada] || ''
        : '',
  }));
}

async function historialDe(userId) {
  const filas = await consulta(
    `SELECT i.id, i.estado, i.version, i.iniciado_en, i.finalizado_en, i.motivo_cierre,
            (SELECT SUM(aciertos)::int FROM resultados WHERE intento_id = i.id) AS aciertos,
            (SELECT SUM(total)::int FROM resultados WHERE intento_id = i.id) AS total,
            COALESCE((SELECT ROUND(AVG(puntaje))::int FROM resultados WHERE intento_id = i.id), 0)
              AS puntaje_global
       FROM intentos i
      WHERE i.user_id = $1
      ORDER BY i.iniciado_en DESC`,
    [userId]
  );
  return filas.map((i) => ({ ...i, version_nombre: nombreVersion(i.version) }));
}

module.exports = {
  ErrorApp,
  cerrarVencidos,
  intentoActivoDe,
  obtenerIntento,
  crearIntento,
  cuadernillo,
  guardarRespuesta,
  finalizarIntento,
  resultadosDe,
  revisionDe,
  historialDe,
  segundosRestantes,
};
