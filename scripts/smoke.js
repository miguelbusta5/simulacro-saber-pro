'use strict';

// Prueba de extremo a extremo del flujo completo, contra un esquema temporal de
// la misma base de Postgres, que se crea al empezar y se borra al terminar.
// Nunca toca los datos reales del esquema "public".
//
// Verifica sobre todo las dos reglas que gobiernan la app:
//   1. un usuario no puede tener dos simulacros corriendo;
//   2. no se pueden ver respuestas mientras haya un simulacro en curso.
//
// Uso: npm run smoke

const ESQUEMA = `smoke_${process.pid}_${Date.now().toString(36)}`;
process.env.SIMULACRO_ESQUEMA = ESQUEMA;

// Esta prueba crea un esquema propio y lo fija en la conexión, que es una
// operación de sesión. Las conexiones agrupadas (PgBouncer en modo transacción,
// como el endpoint "-pooler" de Neon) no las admiten, así que si hay una URL
// directa disponible se usa esa. La app en producción sí usa la agrupada.
if (process.env.DATABASE_URL_UNPOOLED) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;
}

if (!process.env.DATABASE_URL) {
  console.error(
    'Falta DATABASE_URL. Copia .env.example a .env y pega ahí la cadena de conexión de tu Postgres.'
  );
  process.exit(1);
}

const { consulta, ejecutar, pool, cerrar } = require('../server/db');
const {
  VERSION_ACTIVA,
  modulosDe,
  duracionDe,
  totalPreguntasDe,
} = require('../server/exam/blueprint');
const seed = require('./seed.js');

const TOTAL = totalPreguntasDe(VERSION_ACTIVA);
const MODULOS = modulosDe(VERSION_ACTIVA);
const DURACION = duracionDe(VERSION_ACTIVA);

let fallos = 0;
let pruebas = 0;

function check(nombre, condicion, detalle = '') {
  pruebas++;
  if (condicion) {
    console.log(`  ok   ${nombre}`);
  } else {
    fallos++;
    console.error(`  FALLA ${nombre}${detalle ? ` — ${detalle}` : ''}`);
  }
}

let cookie = '';
let base = '';

async function pedir(ruta, opciones = {}) {
  const res = await fetch(base + ruta, {
    method: opciones.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: opciones.body ? JSON.stringify(opciones.body) : undefined,
  });
  const nuevas = res.headers.getSetCookie?.() || [];
  if (nuevas.length) cookie = nuevas.map((c) => c.split(';')[0]).join('; ');
  let datos = null;
  try {
    datos = await res.json();
  } catch {
    /* respuesta sin cuerpo */
  }
  return { status: res.status, datos };
}

async function main() {
  console.log(`Esquema temporal: ${ESQUEMA}\n`);
  await seed.main();

  const app = require('../server/index');
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  console.log(`Servidor de prueba en ${base}\n`);

  console.log('Autenticación');
  const usuario = `smoke_${Date.now()}`;
  let r = await pedir('/api/auth/register', {
    method: 'POST',
    body: { usuario, nombre: 'Usuario de prueba', password: 'secreta123' },
  });
  check('registro devuelve 201', r.status === 201, `status ${r.status}`);

  r = await pedir('/api/auth/register', {
    method: 'POST',
    body: { usuario: usuario.toUpperCase(), password: 'secreta123' },
  });
  check(
    'registro duplicado devuelve 409 sin distinguir mayúsculas',
    r.status === 409,
    `status ${r.status}`
  );

  r = await pedir('/api/auth/login', { method: 'POST', body: { usuario, password: 'incorrecta' } });
  check('login con clave errada devuelve 401', r.status === 401, `status ${r.status}`);

  r = await pedir('/api/auth/login', { method: 'POST', body: { usuario, password: 'secreta123' } });
  check('login correcto devuelve 200', r.status === 200, `status ${r.status}`);

  console.log('\nCreación del intento');
  r = await pedir('/api/intentos', { method: 'POST' });
  check('crear simulacro devuelve 201', r.status === 201, `status ${r.status}`);
  const intentoId = r.datos.intento_id;

  r = await pedir('/api/intentos', { method: 'POST' });
  check(
    'un segundo simulacro se rechaza con 409 INTENTO_EN_CURSO',
    r.status === 409 && r.datos.error === 'INTENTO_EN_CURSO',
    `status ${r.status}, error ${r.datos?.error}`
  );

  console.log('\nBloqueo de la revisión mientras hay un simulacro corriendo');
  for (const ruta of ['revision', 'resultados', 'analisis']) {
    r = await pedir(`/api/intentos/${intentoId}/${ruta}`);
    check(
      `GET /${ruta} se bloquea con 409 REVISION_BLOQUEADA`,
      r.status === 409 && r.datos.error === 'REVISION_BLOQUEADA',
      `status ${r.status}, error ${r.datos?.error}`
    );
  }

  console.log('\nCuadernillo del examen');
  r = await pedir(`/api/intentos/${intentoId}`);
  const examen = r.datos;
  check(
    `el cuadernillo trae ${TOTAL} preguntas`,
    examen.preguntas.length === TOTAL,
    `trae ${examen.preguntas?.length}`
  );
  check(
    `el cuadernillo trae los ${MODULOS.length} módulos de la versión activa`,
    MODULOS.every((m) => examen.preguntas.filter((p) => p.modulo === m.id).length === m.preguntas),
    MODULOS.map((m) => `${m.id}:${examen.preguntas.filter((p) => p.modulo === m.id).length}`).join(' ')
  );
  check(
    'el cuadernillo informa la versión que se está presentando',
    examen.version === VERSION_ACTIVA && !!examen.version_nombre,
    `version ${examen.version}, nombre ${examen.version_nombre}`
  );

  const serializado = JSON.stringify(examen);
  check(
    'el cuadernillo NO expone la respuesta correcta',
    !serializado.includes('"correcta"'),
    'aparece el campo "correcta" en el payload del examen'
  );
  check(
    'el cuadernillo NO expone las justificaciones',
    !serializado.includes('justificacion'),
    'aparece una justificación en el payload del examen'
  );
  check(
    `quedan alrededor de ${DURACION} minutos`,
    examen.segundos_restantes > (DURACION - 1) * 60 && examen.segundos_restantes <= DURACION * 60,
    `${examen.segundos_restantes} s`
  );

  console.log('\nRespuestas');
  // Responde correctamente la mitad y deja unas cuantas en blanco, para que el
  // análisis tenga aciertos, errores y preguntas sin responder.
  const correctasReales = new Map(
    (await consulta('SELECT id, correcta FROM preguntas')).map((p) => [p.id, p.correcta])
  );

  let esperadas = 0;
  let enBlanco = 0;
  let errorAlGuardar = null;
  for (const [i, p] of examen.preguntas.entries()) {
    if (i % 10 === 9) {
      enBlanco++;
      continue;
    }
    const correcta = correctasReales.get(p.id);
    const otra = p.opciones.find((o) => o.clave !== correcta).clave;
    const elegida = i % 2 === 0 ? correcta : otra;
    if (elegida === correcta) esperadas++;
    const res = await pedir(`/api/intentos/${intentoId}/respuestas/${p.id}`, {
      method: 'PUT',
      body: { opcion: elegida, revisar: i % 25 === 0 },
    });
    if (res.status !== 200) {
      errorAlGuardar = `pregunta ${p.numero}: status ${res.status}`;
      break;
    }
  }
  check('todas las respuestas se guardaron', errorAlGuardar === null, errorAlGuardar || '');

  r = await pedir(`/api/intentos/${intentoId}/respuestas/${examen.preguntas[0].id}`, {
    method: 'PUT',
    body: { opcion: 'Z' },
  });
  check('una opción inexistente se rechaza con 400', r.status === 400, `status ${r.status}`);

  console.log('\nFinalización');
  r = await pedir(`/api/intentos/${intentoId}/finalizar`, { method: 'POST' });
  check('finalizar devuelve 200', r.status === 200, `status ${r.status}`);

  r = await pedir('/api/auth/me');
  check('tras finalizar ya no hay intento activo', r.datos.intento_activo === null);

  console.log('\nResultados, revisión y análisis');
  r = await pedir(`/api/intentos/${intentoId}/resultados`);
  check('resultados devuelve 200', r.status === 200, `status ${r.status}`);
  const resultados = r.datos;
  check(
    'los aciertos calculados coinciden con lo respondido',
    resultados.aciertos === esperadas,
    `servidor ${resultados.aciertos}, esperado ${esperadas}`
  );
  check(
    `los módulos suman ${TOTAL} preguntas`,
    resultados.total === TOTAL,
    `total ${resultados.total}`
  );
  check(
    'los resultados informan la versión y las fechas',
    resultados.version === VERSION_ACTIVA &&
      !!resultados.version_nombre &&
      !!resultados.iniciado_en &&
      !!resultados.finalizado_en,
    JSON.stringify({
      version: resultados.version,
      iniciado: resultados.iniciado_en,
      finalizado: resultados.finalizado_en,
    })
  );
  check(
    'el puntaje global está en la escala 0-300',
    resultados.puntaje_global >= 0 && resultados.puntaje_global <= 300,
    `puntaje ${resultados.puntaje_global}`
  );

  r = await pedir(`/api/intentos/${intentoId}/revision`);
  check('revisión devuelve 200 al no haber intento en curso', r.status === 200, `status ${r.status}`);
  const revision = r.datos.preguntas;
  check(
    'la revisión sí expone la respuesta correcta y su justificación',
    revision.every((p) => p.correcta && p.justificacion)
  );
  check(
    `la revisión marca ${enBlanco} preguntas sin responder`,
    revision.filter((p) => p.estado === 'sin_responder').length === enBlanco,
    `${revision.filter((p) => p.estado === 'sin_responder').length} sin responder`
  );

  r = await pedir(`/api/intentos/${intentoId}/analisis`);
  check('análisis devuelve 200', r.status === 200, `status ${r.status}`);
  const analisis = r.datos;
  check('el análisis agrupa por competencia', analisis.por_competencia.length > 0);
  check('el análisis agrupa por tema', analisis.por_tema.length > 0);
  check(
    'el análisis reporta las preguntas en blanco',
    analisis.sin_responder === enBlanco,
    `reporta ${analisis.sin_responder}`
  );
  check(
    'el plan de estudio trae recomendaciones concretas',
    analisis.plan_de_estudio.every((p) => p.que_estudiar.length > 0 && p.como_practicar)
  );

  console.log('\nHistorial');
  r = await pedir('/api/intentos');
  check('el historial lista el intento finalizado', r.datos.intentos.length === 1);
  check(
    'el historial calcula el puntaje global',
    r.datos.intentos[0].puntaje_global === resultados.puntaje_global,
    `historial ${r.datos.intentos[0].puntaje_global}, resultados ${resultados.puntaje_global}`
  );

  console.log('\nVencimiento del tiempo');
  r = await pedir('/api/intentos', { method: 'POST' });
  check('se puede iniciar otro simulacro tras finalizar', r.status === 201, `status ${r.status}`);
  const segundoId = r.datos.intento_id;

  // Se fuerza el vencimiento en la base: la siguiente petición debe cerrarlo solo.
  await ejecutar('UPDATE intentos SET vence_en = $1 WHERE id = $2', [
    new Date(Date.now() - 1000).toISOString(),
    segundoId,
  ]);

  r = await pedir('/api/auth/me');
  check(
    'un intento vencido se cierra solo en la siguiente petición',
    r.datos.intento_activo === null,
    `intento_activo ${JSON.stringify(r.datos.intento_activo)}`
  );

  r = await pedir(`/api/intentos/${segundoId}/respuestas/${examen.preguntas[0].id}`, {
    method: 'PUT',
    body: { opcion: 'A' },
  });
  check('ya no se aceptan respuestas en un intento vencido', r.status === 409, `status ${r.status}`);

  r = await pedir(`/api/intentos/${segundoId}/resultados`);
  check(
    'el intento vencido quedó marcado como entregado por tiempo',
    r.status === 200 && r.datos.motivo_cierre === 'tiempo_agotado',
    `motivo ${r.datos?.motivo_cierre}`
  );
  check('el intento vencido se calificó igual', r.datos.total === TOTAL, `total ${r.datos?.total}`);

  console.log('\nAislamiento entre usuarios');
  const otro = `smoke_otro_${Date.now()}`;
  await pedir('/api/auth/register', {
    method: 'POST',
    body: { usuario: otro, password: 'secreta123' },
  });
  r = await pedir(`/api/intentos/${intentoId}/revision`);
  check(
    'otro usuario no puede ver el intento ajeno',
    r.status === 403 && r.datos.error === 'AJENO',
    `status ${r.status}, error ${r.datos?.error}`
  );

  server.close();
  console.log(`\n${pruebas - fallos}/${pruebas} verificaciones pasaron.`);
  if (fallos) process.exitCode = 1;
}

async function limpiar() {
  try {
    await pool.query(`DROP SCHEMA IF EXISTS ${ESQUEMA} CASCADE`);
    console.log(`Esquema temporal ${ESQUEMA} eliminado.`);
  } catch (e) {
    console.error(`No se pudo eliminar el esquema ${ESQUEMA}: ${e.message}`);
  }
  await cerrar();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(limpiar);
