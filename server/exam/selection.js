'use strict';

const { consulta, uno } = require('../db');
const { MODULOS } = require('./blueprint');

// Preguntas del módulo/competencia ordenadas: primero las que este usuario nunca
// ha visto, y al azar dentro de cada grupo.
const SQL_CANDIDATAS = `
  SELECT p.id,
         (SELECT COUNT(*)
            FROM intento_preguntas ip
            JOIN intentos i ON i.id = ip.intento_id
           WHERE ip.pregunta_id = p.id AND i.user_id = $1) AS vistas
    FROM preguntas p
   WHERE p.modulo = $2 AND p.competencia = $3
   ORDER BY vistas ASC, random()
`;

const SQL_RELLENO = `
  SELECT p.id,
         (SELECT COUNT(*)
            FROM intento_preguntas ip
            JOIN intentos i ON i.id = ip.intento_id
           WHERE ip.pregunta_id = p.id AND i.user_id = $1) AS vistas
    FROM preguntas p
   WHERE p.modulo = $2
   ORDER BY vistas ASC, random()
`;

async function faltantesPorModulo() {
  const faltan = [];
  for (const m of MODULOS) {
    const fila = await uno('SELECT COUNT(*)::int AS n FROM preguntas WHERE modulo = $1', [m.id]);
    if (fila.n < m.preguntas) {
      faltan.push({ modulo: m.id, nombre: m.nombre, hay: fila.n, necesita: m.preguntas });
    }
  }
  return faltan;
}

// Agrupa las preguntas que comparten contexto para que aparezcan seguidas,
// igual que en el cuadernillo real (un texto con sus 3-5 preguntas).
async function ordenarPorBloques(ids, moduloId) {
  if (!ids.length) return [];
  const filas = await consulta(
    'SELECT id, contexto_id FROM preguntas WHERE id = ANY($1)',
    [ids]
  );

  const bloques = new Map();
  for (const f of filas) {
    const clave = f.contexto_id || `solo:${f.id}`;
    if (!bloques.has(clave)) bloques.set(clave, []);
    bloques.get(clave).push(f.id);
  }

  const salida = [];
  for (const grupo of bloques.values()) {
    for (const id of grupo) salida.push({ pregunta_id: id, modulo: moduloId });
  }
  return salida;
}

// Devuelve la lista ordenada de preguntas del simulacro según el blueprint,
// respetando la cobertura por competencia de cada módulo.
async function armarSimulacro(userId) {
  const faltan = await faltantesPorModulo();
  if (faltan.length) {
    const detalle = faltan
      .map((f) => `${f.nombre}: hay ${f.hay}, se necesitan ${f.necesita}`)
      .join('; ');
    const err = new Error(`El banco de preguntas es insuficiente (${detalle}). Ejecuta: npm run seed`);
    err.codigo = 'BANCO_INSUFICIENTE';
    throw err;
  }

  const seleccion = [];

  for (const m of MODULOS) {
    const elegidas = new Set();

    for (const [competencia, cuantas] of Object.entries(m.competencias)) {
      const candidatas = await consulta(SQL_CANDIDATAS, [userId, m.id, competencia]);
      let n = 0;
      for (const fila of candidatas) {
        if (n >= cuantas) break;
        if (elegidas.has(fila.id)) continue;
        elegidas.add(fila.id);
        n++;
      }
    }

    // Si alguna competencia no tenía suficientes preguntas, se completa el
    // módulo con lo que haya para no dejar el simulacro corto.
    if (elegidas.size < m.preguntas) {
      for (const fila of await consulta(SQL_RELLENO, [userId, m.id])) {
        if (elegidas.size >= m.preguntas) break;
        elegidas.add(fila.id);
      }
    }

    seleccion.push(...(await ordenarPorBloques([...elegidas].slice(0, m.preguntas), m.id)));
  }

  return seleccion; // [{pregunta_id, modulo}] en el orden final del cuadernillo
}

module.exports = { armarSimulacro, faltantesPorModulo };
