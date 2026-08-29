'use strict';

// Carga el banco de data/banco/*.json a la base de datos.
// Valida todo antes de escribir: si algo falla, no toca la BD.

const fs = require('node:fs');
const path = require('node:path');
const { db } = require('../server/db');
const { MODULOS, modulo: buscarModulo } = require('../server/exam/blueprint');

const DIR = path.join(__dirname, '..', 'data', 'banco');
const CLAVES_OPCION = ['A', 'B', 'C', 'D'];

function cargarArchivos() {
  if (!fs.existsSync(DIR)) return [];
  return fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ archivo: f, datos: JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')) }));
}

function validar(archivos) {
  const errores = [];
  const idsPregunta = new Map();
  const idsContexto = new Map();

  for (const { archivo, datos } of archivos) {
    const m = buscarModulo(datos.modulo);
    if (!m) {
      errores.push(`${archivo}: modulo desconocido "${datos.modulo}"`);
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

function escribir(archivos) {
  const insContexto = db.prepare(
    `INSERT INTO contextos (id, modulo, titulo, contenido, fuente) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       modulo = excluded.modulo, titulo = excluded.titulo,
       contenido = excluded.contenido, fuente = excluded.fuente`
  );
  const insPregunta = db.prepare(
    `INSERT INTO preguntas
       (id, modulo, competencia, tema, dificultad, contexto_id, enunciado, opciones,
        correcta, justificacion, justificaciones_incorrectas)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       modulo = excluded.modulo, competencia = excluded.competencia, tema = excluded.tema,
       dificultad = excluded.dificultad, contexto_id = excluded.contexto_id,
       enunciado = excluded.enunciado, opciones = excluded.opciones,
       correcta = excluded.correcta, justificacion = excluded.justificacion,
       justificaciones_incorrectas = excluded.justificaciones_incorrectas`
  );

  let contextos = 0;
  let preguntas = 0;

  db.exec('BEGIN');
  try {
    for (const { datos } of archivos) {
      for (const c of datos.contextos || []) {
        insContexto.run(c.id, datos.modulo, c.titulo || '', c.contenido, c.fuente || '');
        contextos++;
      }
      for (const p of datos.preguntas || []) {
        insPregunta.run(
          p.id,
          datos.modulo,
          p.competencia,
          p.tema,
          p.dificultad || 2,
          p.contexto_id || null,
          p.enunciado,
          JSON.stringify(p.opciones),
          p.correcta,
          p.justificacion,
          JSON.stringify(p.justificaciones_incorrectas || {})
        );
        preguntas++;
      }
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return { contextos, preguntas };
}

function reporte() {
  console.log('\nCobertura del banco frente al blueprint:');
  let completo = true;
  for (const m of MODULOS) {
    const total = db.prepare('SELECT COUNT(*) AS n FROM preguntas WHERE modulo = ?').get(m.id).n;
    const ok = total >= m.preguntas;
    if (!ok) completo = false;
    console.log(`\n  ${m.nombre}: ${total} en banco / ${m.preguntas} por simulacro ${ok ? 'OK' : 'INSUFICIENTE'}`);
    for (const [comp, need] of Object.entries(m.competencias)) {
      const n = db
        .prepare('SELECT COUNT(*) AS n FROM preguntas WHERE modulo = ? AND competencia = ?')
        .get(m.id, comp).n;
      const okc = n >= need;
      if (!okc) completo = false;
      console.log(`      ${comp.padEnd(22)} ${String(n).padStart(3)} / ${String(need).padStart(3)} ${okc ? '' : '<-- faltan'}`);
    }
  }
  console.log(
    completo
      ? '\nEl banco cubre un simulacro completo.\n'
      : '\nATENCION: el banco no alcanza para un simulacro completo.\n'
  );
}

function main() {
  const archivos = cargarArchivos();
  if (!archivos.length) {
    console.error(`No hay archivos .json en ${DIR}`);
    process.exit(1);
  }

  const errores = validar(archivos);
  if (errores.length) {
    console.error(`Se encontraron ${errores.length} errores. No se escribió nada en la base de datos:\n`);
    for (const e of errores.slice(0, 40)) console.error(`  - ${e}`);
    if (errores.length > 40) console.error(`  ... y ${errores.length - 40} más`);
    process.exit(1);
  }

  const { contextos, preguntas } = escribir(archivos);
  console.log(`Cargados ${preguntas} preguntas y ${contextos} contextos desde ${archivos.length} archivos.`);
  reporte();
}

main();
