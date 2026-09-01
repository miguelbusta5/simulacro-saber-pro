'use strict';

// Carga los bancos de data/banco/<version>/*.json a la base de datos.
// Valida todo antes de escribir: si algo falla, no toca la base.

const fs = require('node:fs');
const path = require('node:path');
const { consulta, uno, ejecutar, enTransaccion, inicializar, cerrar, ESQUEMA } = require('../server/db');
const {
  VERSIONES,
  VERSION_ACTIVA,
  modulosDe,
  moduloDe,
  version: buscarVersion,
} = require('../server/exam/blueprint');

const DIR = path.join(__dirname, '..', 'data', 'banco');
const CLAVES_OPCION = ['A', 'B', 'C', 'D'];

// Cada subdirectorio de data/banco es una versión de la prueba.
function cargarArchivos() {
  if (!fs.existsSync(DIR)) return [];
  const salida = [];
  for (const version of fs.readdirSync(DIR)) {
    const dirVersion = path.join(DIR, version);
    if (!fs.statSync(dirVersion).isDirectory()) continue;
    for (const archivo of fs.readdirSync(dirVersion).filter((f) => f.endsWith('.json'))) {
      salida.push({
        version,
        archivo: `${version}/${archivo}`,
        datos: JSON.parse(fs.readFileSync(path.join(dirVersion, archivo), 'utf8')),
      });
    }
  }
  return salida;
}

function validar(archivos) {
  const errores = [];
  const idsPregunta = new Map();
  const idsContexto = new Map();

  for (const { version, archivo, datos } of archivos) {
    if (!buscarVersion(version)) {
      errores.push(
        `${archivo}: la versión "${version}" no está declarada en blueprint.js (válidas: ${VERSIONES.map((v) => v.id).join(', ')})`
      );
      continue;
    }
    const m = moduloDe(version, datos.modulo);
    if (!m) {
      errores.push(
        `${archivo}: el módulo "${datos.modulo}" no pertenece a la ${version} (válidos: ${modulosDe(version).map((x) => x.id).join(', ')})`
      );
      continue;
    }
    const competenciasValidas = Object.keys(m.competencias);

    for (const c of datos.contextos || []) {
      if (!c.id || !c.contenido) errores.push(`${archivo}: contexto sin id o sin contenido`);
      if (idsContexto.has(c.id)) {
        errores.push(`${archivo}: contexto duplicado "${c.id}" (ya está en ${idsContexto.get(c.id)})`);
      }
      idsContexto.set(c.id, archivo);
    }

    for (const p of datos.preguntas || []) {
      const donde = `${archivo}:${p.id || '(sin id)'}`;
      if (!p.id) errores.push(`${donde}: falta id`);
      if (idsPregunta.has(p.id)) {
        errores.push(`${donde}: id duplicado (ya está en ${idsPregunta.get(p.id)})`);
      }
      idsPregunta.set(p.id, archivo);

      if (!competenciasValidas.includes(p.competencia)) {
        errores.push(
          `${donde}: competencia "${p.competencia}" no existe en ${datos.modulo} (válidas: ${competenciasValidas.join(', ')})`
        );
      }
      if (!p.tema) errores.push(`${donde}: falta tema`);
      if (!p.enunciado) errores.push(`${donde}: falta enunciado`);

      const claves = (p.opciones || []).map((o) => o.clave);
      if (claves.length !== 4 || CLAVES_OPCION.some((c, i) => claves[i] !== c)) {
        errores.push(`${donde}: debe tener exactamente 4 opciones con claves A, B, C, D`);
      }
      if ((p.opciones || []).some((o) => !o.texto)) errores.push(`${donde}: hay una opción sin texto`);
      if (!claves.includes(p.correcta)) {
        errores.push(`${donde}: la respuesta correcta "${p.correcta}" no está entre las opciones`);
      }
      if (!p.justificacion) errores.push(`${donde}: falta justificación de la respuesta correcta`);

      const incorrectas = p.justificaciones_incorrectas || {};
      for (const clave of claves) {
        if (clave !== p.correcta && !incorrectas[clave]) {
          errores.push(`${donde}: falta la justificación del distractor ${clave}`);
        }
      }
      if (p.contexto_id && !idsContexto.has(p.contexto_id)) {
        errores.push(`${donde}: contexto_id "${p.contexto_id}" no está declarado`);
      }
    }
  }

  return errores;
}

// Inserta todo en dos sentencias con arreglos, en vez de una por fila: contra un
// Postgres remoto la diferencia es de minutos a menos de un segundo.
async function escribir(archivos) {
  const contextos = archivos.flatMap(({ version, datos }) =>
    (datos.contextos || []).map((c) => ({ ...c, version, modulo: datos.modulo }))
  );
  const preguntas = archivos.flatMap(({ version, datos }) =>
    (datos.preguntas || []).map((p) => ({ ...p, version, modulo: datos.modulo }))
  );

  await enTransaccion(async (cliente) => {
    await ejecutar(
      `INSERT INTO contextos (id, modulo, version, titulo, contenido, fuente)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[])
       ON CONFLICT (id) DO UPDATE SET
         modulo = EXCLUDED.modulo, version = EXCLUDED.version, titulo = EXCLUDED.titulo,
         contenido = EXCLUDED.contenido, fuente = EXCLUDED.fuente`,
      [
        contextos.map((c) => c.id),
        contextos.map((c) => c.modulo),
        contextos.map((c) => c.version),
        contextos.map((c) => c.titulo || ''),
        contextos.map((c) => c.contenido),
        contextos.map((c) => c.fuente || ''),
      ],
      cliente
    );

    await ejecutar(
      `INSERT INTO preguntas (id, modulo, version, competencia, tema, dificultad, contexto_id,
                              enunciado, opciones, correcta, justificacion,
                              justificaciones_incorrectas)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[],
                            $6::int[], $7::text[], $8::text[], $9::text[], $10::text[],
                            $11::text[], $12::text[])
       ON CONFLICT (id) DO UPDATE SET
         modulo = EXCLUDED.modulo, version = EXCLUDED.version,
         competencia = EXCLUDED.competencia, tema = EXCLUDED.tema,
         dificultad = EXCLUDED.dificultad, contexto_id = EXCLUDED.contexto_id,
         enunciado = EXCLUDED.enunciado, opciones = EXCLUDED.opciones,
         correcta = EXCLUDED.correcta, justificacion = EXCLUDED.justificacion,
         justificaciones_incorrectas = EXCLUDED.justificaciones_incorrectas`,
      [
        preguntas.map((p) => p.id),
        preguntas.map((p) => p.modulo),
        preguntas.map((p) => p.version),
        preguntas.map((p) => p.competencia),
        preguntas.map((p) => p.tema),
        preguntas.map((p) => p.dificultad || 2),
        preguntas.map((p) => p.contexto_id || null),
        preguntas.map((p) => p.enunciado),
        preguntas.map((p) => JSON.stringify(p.opciones)),
        preguntas.map((p) => p.correcta),
        preguntas.map((p) => p.justificacion),
        preguntas.map((p) => JSON.stringify(p.justificaciones_incorrectas || {})),
      ],
      cliente
    );
  });

  return { contextos: contextos.length, preguntas: preguntas.length };
}

async function reporte() {
  console.log('\nCobertura de los bancos frente al blueprint:');
  let activaCompleta = true;

  for (const v of VERSIONES) {
    const esActiva = v.id === VERSION_ACTIVA;
    console.log(`\n${v.nombre} (${v.id})${esActiva ? '  <- versión activa' : '  (solo historial)'}`);

    for (const m of modulosDe(v.id)) {
      const { n: total } = await uno(
        'SELECT COUNT(*)::int AS n FROM preguntas WHERE version = $1 AND modulo = $2',
        [v.id, m.id]
      );
      const ok = total >= m.preguntas;
      if (!ok && esActiva) activaCompleta = false;
      console.log(
        `  ${m.nombre}: ${total} en banco / ${m.preguntas} por simulacro ${ok ? 'OK' : 'INSUFICIENTE'}`
      );

      const porCompetencia = await consulta(
        `SELECT competencia, COUNT(*)::int AS n FROM preguntas
          WHERE version = $1 AND modulo = $2 GROUP BY competencia`,
        [v.id, m.id]
      );
      const conteo = Object.fromEntries(porCompetencia.map((c) => [c.competencia, c.n]));
      for (const [comp, need] of Object.entries(m.competencias)) {
        const n = conteo[comp] || 0;
        const okc = n >= need;
        if (!okc && esActiva) activaCompleta = false;
        console.log(
          `      ${comp.padEnd(22)} ${String(n).padStart(3)} / ${String(need).padStart(3)} ${okc ? '' : '<-- faltan'}`
        );
      }
    }
  }

  console.log(
    activaCompleta
      ? `\nEl banco de la versión activa (${VERSION_ACTIVA}) cubre un simulacro completo.\n`
      : `\nATENCION: el banco de la versión activa (${VERSION_ACTIVA}) no alcanza para un simulacro completo.\n`
  );
}

async function main() {
  const archivos = cargarArchivos();
  if (!archivos.length) {
    console.error(`No hay archivos .json en los subdirectorios de ${DIR}`);
    process.exit(1);
  }

  const errores = validar(archivos);
  if (errores.length) {
    console.error(
      `Se encontraron ${errores.length} errores. No se escribió nada en la base de datos:\n`
    );
    for (const e of errores.slice(0, 40)) console.error(`  - ${e}`);
    if (errores.length > 40) console.error(`  ... y ${errores.length - 40} más`);
    process.exit(1);
  }

  await inicializar();
  const { contextos, preguntas } = await escribir(archivos);
  const versiones = [...new Set(archivos.map((a) => a.version))].join(', ');
  console.log(
    `Cargadas ${preguntas} preguntas y ${contextos} contextos de ${archivos.length} archivos (versiones: ${versiones}, esquema "${ESQUEMA}").`
  );
  await reporte();
}

if (require.main === module) {
  main()
    .catch((e) => {
      console.error(e.message);
      process.exitCode = 1;
    })
    .finally(cerrar);
}

module.exports = { main, cargarArchivos, validar, escribir };
