'use strict';

// Conversion de aciertos a la escala ICFES 0-300 (media 150, desviacion 30).
//
// IMPORTANTE: el ICFES real califica con Teoria de Respuesta al Item, cuyos
// parametros no son publicos. Esta es una aproximacion lineal por tramos anclada
// en las fronteras de los niveles de desempeno: sirve para medir progreso, no
// para predecir el puntaje oficial exacto. La app lo advierte en pantalla.

const ANCLAS = [
  [0.0, 0],
  [0.25, 100], // acertar al azar entre 4 opciones
  [0.4, 126], // frontera nivel 1 / nivel 2
  [0.55, 156], // frontera nivel 2 / nivel 3
  [0.75, 191], // frontera nivel 3 / nivel 4
  [1.0, 300],
];

function puntajeDesdeProporcion(p) {
  const x = Math.min(1, Math.max(0, p));
  for (let i = 1; i < ANCLAS.length; i++) {
    const [x0, y0] = ANCLAS[i - 1];
    const [x1, y1] = ANCLAS[i];
    if (x <= x1) {
      const t = x1 === x0 ? 0 : (x - x0) / (x1 - x0);
      return Math.round(y0 + t * (y1 - y0));
    }
  }
  return 300;
}

// Puntos de corte oficiales de los niveles de desempeno por modulo.
const CORTES = {
  lectura_critica: [
    [126, 'Nivel 1'],
    [156, 'Nivel 2'],
    [191, 'Nivel 3'],
    [Infinity, 'Nivel 4'],
  ],
  competencias_ciudadanas: [
    [126, 'Nivel 1'],
    [156, 'Nivel 2'],
    [191, 'Nivel 3'],
    [Infinity, 'Nivel 4'],
  ],
  // El módulo oficial de Comunicación escrita es una pregunta abierta calificada
  // con rúbrica, así que no existen puntos de corte para una versión de
  // selección múltiple. Se usan los mismos cuatro niveles que Lectura crítica.
  comunicacion_escrita: [
    [126, 'Nivel 1'],
    [156, 'Nivel 2'],
    [191, 'Nivel 3'],
    [Infinity, 'Nivel 4'],
  ],
  razonamiento_cuantitativo: [
    [126, 'Nivel 1'],
    [156, 'Nivel 2'],
    [196, 'Nivel 3'],
    [Infinity, 'Nivel 4'],
  ],
  ingles: [
    [126, '-A1'],
    [156, 'A1'],
    [181, 'A2'],
    [201, 'B1'],
    [Infinity, 'B2'],
  ],
};

function nivel(moduloId, puntaje) {
  const tabla = CORTES[moduloId] || CORTES.lectura_critica;
  for (const [tope, etiqueta] of tabla) {
    if (puntaje < tope) return etiqueta;
  }
  return tabla[tabla.length - 1][1];
}

// La prueba de enfermeria no tiene equivalente oficial ni escala publicada, asi
// que se reporta en porcentaje de acierto, con cuatro niveles propios.
const CORTES_PORCENTAJE = [
  [60, 'Insuficiente'],
  [75, 'Aceptable'],
  [90, 'Bueno'],
  [Infinity, 'Sobresaliente'],
];

function nivelPorcentaje(puntaje) {
  for (const [tope, etiqueta] of CORTES_PORCENTAJE) {
    if (puntaje < tope) return etiqueta;
  }
  return 'Sobresaliente';
}

const DESCRIPCION_NIVEL = {
  'Nivel 1': 'Desempeño mínimo. Solo resuelve tareas muy sencillas y directas.',
  'Nivel 2': 'Desempeño básico. Resuelve tareas rutinarias, falla con las que exigen inferir o argumentar.',
  'Nivel 3': 'Desempeño satisfactorio. Maneja tareas complejas y relaciona información.',
  'Nivel 4': 'Desempeño avanzado. Evalúa, argumenta y resuelve situaciones no rutinarias.',
  '-A1': 'No alcanza el nivel A1 del Marco Común Europeo.',
  A1: 'Nivel A1: comprende expresiones muy básicas y de uso cotidiano.',
  A2: 'Nivel A2: comprende frases y vocabulario frecuente sobre temas conocidos.',
  B1: 'Nivel B1: comprende textos claros sobre temas familiares y de actualidad.',
  B2: 'Nivel B2: comprende textos complejos y detalles implícitos.',
  Insuficiente:
    'Menos del 60 % de acierto. Hay vacíos de fundamentación que conviene cerrar antes de aplicar estos cuidados.',
  Aceptable:
    'Entre 60 % y 74 %. Domina lo básico del módulo, pero falla en los casos que exigen decidir con varios datos a la vez.',
  Bueno: 'Entre 75 % y 89 %. Maneja el módulo con solvencia y falla solo en situaciones poco frecuentes.',
  Sobresaliente: '90 % o más. Domina el módulo, incluidas las situaciones complejas.',
};

// `escala` viene de la prueba a la que pertenece el intento (ver blueprint.js):
// 'icfes' reporta en la escala 0-300 y 'porcentaje', en porcentaje de acierto.
function calificarModulo(moduloId, aciertos, total, escala = 'icfes') {
  const porcentaje = total > 0 ? Math.round((aciertos / total) * 100) : 0;
  const puntaje =
    escala === 'porcentaje' ? porcentaje : total > 0 ? puntajeDesdeProporcion(aciertos / total) : 0;
  return {
    modulo: moduloId,
    aciertos,
    total,
    porcentaje,
    puntaje,
    nivel: escala === 'porcentaje' ? nivelPorcentaje(puntaje) : nivel(moduloId, puntaje),
  };
}

// El ICFES reporta el promedio de las competencias genericas como puntaje global.
function promedioGlobal(resultados) {
  if (!resultados.length) return 0;
  return Math.round(resultados.reduce((s, r) => s + r.puntaje, 0) / resultados.length);
}

module.exports = {
  puntajeDesdeProporcion,
  nivel,
  nivelPorcentaje,
  calificarModulo,
  promedioGlobal,
  DESCRIPCION_NIVEL,
};
