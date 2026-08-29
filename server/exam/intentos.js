'use strict';

const { db, ahora } = require('../db');
const { armarSimulacro } = require('./selection');
const { DURACION_MINUTOS, MODULOS, NOMBRES_MODULO, nombreCompetencia } = require('./blueprint');
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

// Cierra de forma perezosa cualquier intento cuyo plazo ya vencio. Se llama en
// cada request autenticado: por eso cerrar el navegador no regala tiempo y el
// examen se autoentrega cuando se acaba el reloj.
function cerrarVencidos(userId) {
  const vencidos = db
    .prepare("SELECT id FROM intentos WHERE user_id = ? AND estado = 'en_curso' AND vence_en <= ?")
    .all(userId, ahora());
  for (const v of vencidos) {
    finalizarIntento(v.id, userId, 'tiempo_agotado');
  }
  return vencidos.length;
}

function intentoActivoDe(userId) {
  return db.prepare("SELECT * FROM intentos WHERE user_id = ? AND estado = 'en_curso'").get(userId) || null;
}

function obtenerIntento(id, userId) {
  const intento = db.prepare('SELECT * FROM intentos WHERE id = ?').get(Number(id));
  if (!intento) throw new ErrorApp(404, 'NO_ENCONTRADO', 'Ese intento no existe.');
  if (intento.user_id !== userId) {
    throw new ErrorApp(403, 'AJENO', 'Ese intento pertenece a otro usuario.');
  }
  return intento;
}

function crearIntento(userId) {
  cerrarVencidos(userId);
  if (intentoActivoDe(userId)) {
    throw new ErrorApp(
      409,
      'INTENTO_EN_CURSO',
      'Ya tienes un simulacro en curso. Debes terminarlo antes de iniciar otro.'
    );
  }

  const preguntas = armarSimulacro(userId);
  const inicio = new Date();
  const vence = new Date(inicio.getTime() + DURACION_MINUTOS * 60 * 1000);

  db.exec('BEGIN');
  try {
    const info = db
      .prepare(
        "INSERT INTO intentos (user_id, estado, iniciado_en, vence_en) VALUES (?, 'en_curso', ?, ?)"
      )
      .run(userId, inicio.toISOString(), vence.toISOString());
    const intentoId = Number(info.lastInsertRowid);

    const ins = db.prepare(
      'INSERT INTO intento_preguntas (intento_id, orden, pregunta_id, modulo) VALUES (?, ?, ?, ?)'
    );
    preguntas.forEach((p, i) => ins.run(intentoId, i + 1, p.pregunta_id, p.modulo));
    db.exec('COMMIT');
    return intentoId;
  } catch (e) {
    db.exec('ROLLBACK');
    // El indice unico parcial es la ultima defensa contra dos intentos activos.
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
   WHERE ip.intento_id = ?
   ORDER BY ip.orden
`;

// Cuadernillo para presentar el examen. NUNCA incluye la respuesta correcta ni
// las justificaciones: eso solo aparece en la revision posterior.
function cuadernillo(intento) {
  const filas = db.prepare(SQL_PREGUNTAS_EXAMEN).all(intento.id);
  return {
    intento_id: intento.id,
    estado: intento.estado,
    iniciado_en: intento.iniciado_en,
    vence_en: intento.vence_en,
    duracion_minutos: DURACION_MINUTOS,
    segundos_restantes: segundosRestantes(intento),
    modulos: MODULOS.map((m) => ({
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

function guardarRespuesta(intentoId, userId, preguntaId, opcion, revisar) {
  const intento = obtenerIntento(intentoId, userId);
  if (intento.estado !== 'en_curso') {
    throw new ErrorApp(409, 'INTENTO_FINALIZADO', 'Este simulacro ya fue finalizado.');
  }
  if (new Date(intento.vence_en).getTime() <= Date.now()) {
    finalizarIntento(intento.id, userId, 'tiempo_agotado');
    throw new ErrorApp(409, 'TIEMPO_AGOTADO', 'Se acabo el tiempo: el simulacro se entrego solo.');
  }

  const pertenece = db
    .prepare('SELECT 1 AS ok FROM intento_preguntas WHERE intento_id = ? AND pregunta_id = ?')
    .get(intento.id, preguntaId);
  if (!pertenece) {
    throw new ErrorApp(404, 'NO_ENCONTRADO', 'Esa pregunta no esta en este simulacro.');
  }

  const validas = JSON.parse(
    db.prepare('SELECT opciones FROM preguntas WHERE id = ?').get(preguntaId).opciones
  ).map((o) => o.clave);
  if (opcion !== null && !validas.includes(opcion)) {
    throw new ErrorApp(400, 'OPCION_INVALIDA', 'Esa opcion no existe en la pregunta.');
  }

  db.prepare(
    `INSERT INTO respuestas (intento_id, pregunta_id, opcion, marcada, respondido_en)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(intento_id, pregunta_id) DO UPDATE SET
       opcion = excluded.opcion,
       marcada = excluded.marcada,
       respondido_en = excluded.respondido_en`
  ).run(intento.id, preguntaId, opcion, revisar ? 1 : 0, ahora());

  return { segundos_restantes: segundosRestantes(intento) };
}

function finalizarIntento(intentoId, userId, motivo = 'entregado') {
  const intento = obtenerIntento(intentoId, userId);
  if (intento.estado === 'finalizado') return intento.id;

  const filas = db
    .prepare(
      `SELECT ip.modulo, p.correcta, r.opcion AS marcada
         FROM intento_preguntas ip
         JOIN preguntas p ON p.id = ip.pregunta_id
         LEFT JOIN respuestas r ON r.intento_id = ip.intento_id AND r.pregunta_id = p.id
        WHERE ip.intento_id = ?`
    )
    .all(intento.id);

  const acumulado = new Map();
  for (const f of filas) {
    if (!acumulado.has(f.modulo)) acumulado.set(f.modulo, { aciertos: 0, total: 0 });
    const a = acumulado.get(f.modulo);
    a.total++;
    if (f.marcada != null && f.marcada === f.correcta) a.aciertos++;
  }

  db.exec('BEGIN');
  try {
    const ins = db.prepare(
      `INSERT INTO resultados (intento_id, modulo, aciertos, total, puntaje, nivel)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(intento_id, modulo) DO UPDATE SET
         aciertos = excluded.aciertos, total = excluded.total,
         puntaje = excluded.puntaje, nivel = excluded.nivel`
    );
    for (const m of MODULOS) {
      const a = acumulado.get(m.id) || { aciertos: 0, total: 0 };
      const r = calificarModulo(m.id, a.aciertos, a.total);
      ins.run(intento.id, m.id, r.aciertos, r.total, r.puntaje, r.nivel);
    }
    db.prepare(
      "UPDATE intentos SET estado = 'finalizado', finalizado_en = ?, motivo_cierre = ? WHERE id = ?"
    ).run(ahora(), motivo, intento.id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return intento.id;
}

function resultadosDe(intentoId) {
  const intento = db.prepare('SELECT * FROM intentos WHERE id = ?').get(intentoId);
  const filas = db
    .prepare('SELECT * FROM resultados WHERE intento_id = ?')
    .all(intentoId)
    .map((r) => ({
      modulo: r.modulo,
      modulo_nombre: NOMBRES_MODULO[r.modulo] || r.modulo,
      aciertos: r.aciertos,
      total: r.total,
      porcentaje: r.total ? Math.round((r.aciertos / r.total) * 100) : 0,
      puntaje: r.puntaje,
      nivel: r.nivel,
      descripcion_nivel: DESCRIPCION_NIVEL[r.nivel] || '',
    }));
  // Se respeta el orden del blueprint, no el de la base de datos.
  filas.sort(
    (a, b) =>
      MODULOS.findIndex((m) => m.id === a.modulo) - MODULOS.findIndex((m) => m.id === b.modulo)
  );

  const respondidas = db
    .prepare('SELECT COUNT(*) AS n FROM respuestas WHERE intento_id = ? AND opcion IS NOT NULL')
    .get(intentoId).n;

  const duracionSeg = intento.finalizado_en
    ? Math.round(
        (new Date(intento.finalizado_en).getTime() - new Date(intento.iniciado_en).getTime()) / 1000
      )
    : null;

  return {
    intento_id: intentoId,
    iniciado_en: intento.iniciado_en,
    finalizado_en: intento.finalizado_en,
    motivo_cierre: intento.motivo_cierre,
    duracion_segundos: duracionSeg,
    duracion_minutos_permitidos: DURACION_MINUTOS,
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
   WHERE ip.intento_id = ?
   ORDER BY ip.orden
`;

function revisionDe(intentoId) {
  return db
    .prepare(SQL_REVISION)
    .all(intentoId)
    .map((f) => ({
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

function historialDe(userId) {
  return db
    .prepare(
      `SELECT i.id, i.estado, i.iniciado_en, i.finalizado_en, i.motivo_cierre,
              (SELECT SUM(aciertos) FROM resultados WHERE intento_id = i.id) AS aciertos,
              (SELECT SUM(total) FROM resultados WHERE intento_id = i.id) AS total
         FROM intentos i
        WHERE i.user_id = ?
        ORDER BY i.iniciado_en DESC`
    )
    .all(userId)
    .map((i) => {
      const puntajes = db.prepare('SELECT puntaje FROM resultados WHERE intento_id = ?').all(i.id);
      return { ...i, puntaje_global: promedioGlobal(puntajes) };
    });
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
