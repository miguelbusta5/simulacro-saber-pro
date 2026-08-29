'use strict';

// Estructura oficial de la sesion de competencias genericas de seleccion multiple
// del Saber Pro. Comunicacion escrita y los modulos especificos quedan fuera
// porque no son calificables automaticamente / dependen del programa academico.

const DURACION_MINUTOS = 270; // 4 h 30 min, igual que una sesion real

const MODULOS = [
  {
    id: 'lectura_critica',
    nombre: 'Lectura crítica',
    preguntas: 35,
    // La suma de las competencias debe dar el total de preguntas del modulo.
    competencias: {
      literal: 9,
      articulacion: 13,
      reflexion: 13,
    },
  },
  {
    id: 'razonamiento_cuantitativo',
    nombre: 'Razonamiento cuantitativo',
    preguntas: 35,
    competencias: {
      interpretacion: 13,
      formulacion: 13,
      argumentacion: 9,
    },
  },
  {
    id: 'competencias_ciudadanas',
    nombre: 'Competencias ciudadanas',
    preguntas: 35,
    competencias: {
      conocimientos: 9,
      argumentacion: 9,
      multiperspectivismo: 9,
      pensamiento_sistemico: 8,
    },
  },
  {
    id: 'ingles',
    nombre: 'Inglés',
    preguntas: 55,
    competencias: {
      part1: 5,
      part2: 5,
      part3: 5,
      part4: 10,
      part5: 10,
      part6: 10,
      part7: 10,
    },
  },
];

// Nombres legibles para resultados, revision y analisis.
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
  part1: 'Part 1 — Avisos y letreros',
  part2: 'Part 2 — Definiciones y vocabulario',
  part3: 'Part 3 — Conversaciones cortas',
  part4: 'Part 4 — Texto informativo',
  part5: 'Part 5 — Completar texto (cloze)',
  part6: 'Part 6 — Lectura de texto largo',
  part7: 'Part 7 — Completar con lista de palabras',
};

const NOMBRES_MODULO = Object.fromEntries(MODULOS.map((m) => [m.id, m.nombre]));

const TOTAL_PREGUNTAS = MODULOS.reduce((n, m) => n + m.preguntas, 0);

function modulo(id) {
  return MODULOS.find((m) => m.id === id) || null;
}

function nombreCompetencia(clave) {
  return NOMBRES_COMPETENCIA[clave] || clave;
}

module.exports = {
  DURACION_MINUTOS,
  MODULOS,
  NOMBRES_MODULO,
  NOMBRES_COMPETENCIA,
  TOTAL_PREGUNTAS,
  modulo,
  nombreCompetencia,
};
