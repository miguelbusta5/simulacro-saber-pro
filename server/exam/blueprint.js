'use strict';

// Estructura de las competencias genéricas del Saber Pro.
//
// Los cuatro módulos de selección múltiple oficiales conservan sus cifras
// exactas. Comunicación escrita se incluye también en selección múltiple, que
// NO es su formato real: en el examen oficial es una única pregunta abierta que
// califican lectores humanos. Aquí se evalúan las mismas competencias que ese
// módulo mide, pero el formato es una adaptación, y la app lo advierte en los
// resultados.

// Los módulos se declaran una sola vez y las versiones los componen: la
// estructura del ICFES es la misma para todas, lo único que cambia entre una
// versión y otra son las preguntas del banco.

const LECTURA_CRITICA = {
  id: 'lectura_critica',
  nombre: 'Lectura crítica',
  preguntas: 35,
  // La suma de las competencias debe dar el total de preguntas del módulo.
  competencias: { literal: 9, articulacion: 13, reflexion: 13 },
};

const RAZONAMIENTO_CUANTITATIVO = {
  id: 'razonamiento_cuantitativo',
  nombre: 'Razonamiento cuantitativo',
  preguntas: 35,
  competencias: { interpretacion: 13, formulacion: 13, argumentacion: 9 },
};

const COMPETENCIAS_CIUDADANAS = {
  id: 'competencias_ciudadanas',
  nombre: 'Competencias ciudadanas',
  preguntas: 35,
  competencias: {
    conocimientos: 9,
    argumentacion: 9,
    multiperspectivismo: 9,
    pensamiento_sistemico: 8,
  },
};

const COMUNICACION_ESCRITA = {
  id: 'comunicacion_escrita',
  nombre: 'Comunicación escrita',
  preguntas: 35,
  competencias: { planteamiento: 11, organizacion: 13, uso_lenguaje: 11 },
};

const INGLES = {
  id: 'ingles',
  nombre: 'Inglés',
  preguntas: 55,
  competencias: { part1: 5, part2: 5, part3: 5, part4: 10, part5: 10, part6: 10, part7: 10 },
};

// Cada versión declara su propia estructura, porque los intentos ya presentados
// deben poder consultarse tal como se presentaron.
const VERSIONES = [
  {
    id: 'v1',
    nombre: 'Versión 1',
    descripcion: 'Primera forma del simulacro, con cuatro módulos de selección múltiple.',
    duracion_minutos: 270,
    modulos: [LECTURA_CRITICA, RAZONAMIENTO_CUANTITATIVO, COMPETENCIAS_CIUDADANAS, INGLES],
  },
  {
    id: 'v2',
    nombre: 'Versión 2',
    descripcion:
      'Segunda forma, con cinco módulos y textos de mayor extensión en varias preguntas.',
    duracion_minutos: 270,
    modulos: [
      LECTURA_CRITICA,
      RAZONAMIENTO_CUANTITATIVO,
      COMPETENCIAS_CIUDADANAS,
      COMUNICACION_ESCRITA,
      INGLES,
    ],
  },
];

// Los simulacros nuevos siempre usan la versión más reciente.
const VERSION_ACTIVA = VERSIONES[VERSIONES.length - 1].id;

// Nombres legibles para resultados, revisión y análisis.
const NOMBRES_COMPETENCIA = {
  literal: 'Identificar contenidos explícitos del texto',
  articulacion: 'Comprender la articulación y el sentido global del texto',
  reflexion: 'Reflexionar y evaluar el contenido del texto',
  interpretacion: 'Interpretación y representación de datos',
  formulacion: 'Formulación y ejecución de procedimientos',
  argumentacion: 'Argumentación y validación de conclusiones',
  conocimientos: 'Conocimientos de la Constitución y el Estado',
  multiperspectivismo: 'Multiperspectivismo (reconocer varias posturas)',
  pensamiento_sistemico: 'Pensamiento sistémico (causas y consecuencias)',
  planteamiento: 'Planteamiento: tesis, propósito y destinatario',
  organizacion: 'Organización: estructura, coherencia y cohesión',
  uso_lenguaje: 'Uso del lenguaje: léxico, registro y corrección',
  part1: 'Part 1 — Avisos y letreros',
  part2: 'Part 2 — Definiciones y vocabulario',
  part3: 'Part 3 — Conversaciones cortas',
  part4: 'Part 4 — Texto informativo',
  part5: 'Part 5 — Completar texto (cloze)',
  part6: 'Part 6 — Lectura de texto largo',
  part7: 'Part 7 — Completar con lista de palabras',
};

const TODOS_LOS_MODULOS = [
  LECTURA_CRITICA,
  RAZONAMIENTO_CUANTITATIVO,
  COMPETENCIAS_CIUDADANAS,
  COMUNICACION_ESCRITA,
  INGLES,
];

const NOMBRES_MODULO = Object.fromEntries(TODOS_LOS_MODULOS.map((m) => [m.id, m.nombre]));

function version(id) {
  return VERSIONES.find((v) => v.id === id) || null;
}

// Las funciones que dependen de la versión caen en la activa si no se indica
// otra, para que quien solo quiera armar un simulacro nuevo no tenga que
// pasarla en cada llamada.
function modulosDe(versionId = VERSION_ACTIVA) {
  return version(versionId)?.modulos || [];
}

function duracionDe(versionId = VERSION_ACTIVA) {
  return version(versionId)?.duracion_minutos || 0;
}

function totalPreguntasDe(versionId = VERSION_ACTIVA) {
  return modulosDe(versionId).reduce((n, m) => n + m.preguntas, 0);
}

function moduloDe(versionId, moduloId) {
  return modulosDe(versionId).find((m) => m.id === moduloId) || null;
}

function nombreVersion(versionId) {
  return version(versionId)?.nombre || versionId;
}

function nombreCompetencia(clave) {
  return NOMBRES_COMPETENCIA[clave] || clave;
}

module.exports = {
  VERSIONES,
  VERSION_ACTIVA,
  NOMBRES_MODULO,
  NOMBRES_COMPETENCIA,
  version,
  modulosDe,
  duracionDe,
  totalPreguntasDe,
  moduloDe,
  nombreVersion,
  nombreCompetencia,
};
