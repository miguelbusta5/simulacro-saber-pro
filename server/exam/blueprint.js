'use strict';

// Estructura de las pruebas que ofrece la aplicación.
//
// Hay dos niveles. Una PRUEBA es lo que el estudiante elige en el menú de
// inicio (el simulacro Saber Pro, la prueba de enfermería) y define cómo se
// califica. Una VERSIÓN es una forma concreta de esa prueba: qué módulos trae,
// cuánto dura y de qué banco de preguntas se arma. Los intentos guardan la
// versión con la que se presentaron, porque su revisión debe seguir mostrando
// exactamente lo que el estudiante vio.

// ---------- módulos del Saber Pro ----------
//
// Los cuatro módulos de selección múltiple oficiales conservan sus cifras
// exactas. Comunicación escrita se incluye también en selección múltiple, que
// NO es su formato real: en el examen oficial es una única pregunta abierta que
// califican lectores humanos. Aquí se evalúan las mismas competencias que ese
// módulo mide, pero el formato es una adaptación, y la app lo advierte en los
// resultados.

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

// ---------- módulos de la prueba de enfermería ----------

const CARDIOLOGIA = {
  id: 'cardiologia',
  nombre: 'Cardiología clínica',
  preguntas: 12,
  competencias: { valoracion: 4, intervencion: 4, fundamentacion: 4 },
};

const ELECTROCARDIOGRAFIA = {
  id: 'electrocardiografia',
  nombre: 'Electrocardiografía',
  preguntas: 12,
  competencias: { reconocimiento: 5, interpretacion_clinica: 4, conducta: 3 },
};

const HEMODINAMIA = {
  id: 'hemodinamia',
  nombre: 'Hemodinamia y monitoría invasiva',
  preguntas: 12,
  competencias: { monitoria_invasiva: 5, procedimientos: 4, cuidado_post: 3 },
};

const NEUROLOGIA = {
  id: 'neurologia',
  nombre: 'Neurología: ACV y edema cerebral',
  preguntas: 12,
  competencias: { clasificacion: 5, valoracion_neuro: 4, manejo_neuro: 3 },
};

const URGENCIAS_METABOLICAS = {
  id: 'urgencias_metabolicas',
  nombre: 'Urgencias metabólicas',
  preguntas: 8,
  competencias: { diagnostico_metabolico: 3, manejo_hidroelectrolitico: 3, complicaciones: 2 },
};

const PEDIATRIA = {
  id: 'pediatria',
  nombre: 'Pediatría: convulsiones y epilepsia',
  preguntas: 8,
  competencias: { convulsion_febril: 3, epilepsia: 3, educacion_familiar: 2 },
};

// ---------- pruebas ----------
//
// `escala` decide cómo se convierten los aciertos en puntaje y en nivel de
// desempeño (ver scoring.js): el Saber Pro se reporta en la escala ICFES
// 0–300 y la prueba de enfermería, que no tiene equivalente oficial, en
// porcentaje de acierto.

const PRUEBAS = [
  {
    id: 'saber_pro',
    nombre: 'Simulacro Saber Pro',
    descripcion:
      'Competencias genéricas de selección múltiple del Saber Pro (ICFES): lectura crítica, ' +
      'razonamiento cuantitativo, competencias ciudadanas, comunicación escrita e inglés.',
    escala: 'icfes',
  },
  {
    id: 'enfermeria',
    nombre: 'Prueba de enfermería',
    descripcion:
      'Prueba de conocimientos de enfermería en cuidado cardiovascular, neurocrítico, ' +
      'metabólico y pediátrico, con trazados electrocardiográficos y curvas de presión.',
    escala: 'porcentaje',
  },
];

const PRUEBA_POR_DEFECTO = PRUEBAS[0].id;

// Cada versión declara su propia estructura, porque los intentos ya presentados
// deben poder consultarse tal como se presentaron.
const VERSIONES = [
  {
    id: 'v1',
    prueba: 'saber_pro',
    nombre: 'Versión 1',
    descripcion: 'Primera forma del simulacro, con cuatro módulos de selección múltiple.',
    duracion_minutos: 270,
    modulos: [LECTURA_CRITICA, RAZONAMIENTO_CUANTITATIVO, COMPETENCIAS_CIUDADANAS, INGLES],
  },
  {
    id: 'v2',
    prueba: 'saber_pro',
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
  {
    id: 'v2.1',
    prueba: 'saber_pro',
    nombre: 'Versión 2.1',
    descripcion:
      'Misma estructura de la Versión 2 con textos mucho más extensos en lectura crítica, ' +
      'competencias ciudadanas, comunicación escrita e inglés.',
    duracion_minutos: 270,
    modulos: [
      LECTURA_CRITICA,
      RAZONAMIENTO_CUANTITATIVO,
      COMPETENCIAS_CIUDADANAS,
      COMUNICACION_ESCRITA,
      INGLES,
    ],
  },
  {
    id: 'enf_v1',
    prueba: 'enfermeria',
    nombre: 'Enfermería — Versión 1',
    descripcion:
      'Cardiología, electrocardiografía con imágenes, hemodinamia (línea arterial, cateterismo, ' +
      'angioplastia y stent), ACV y edema cerebral, cetoacidosis diabética y pediatría.',
    duracion_minutos: 100,
    modulos: [
      CARDIOLOGIA,
      ELECTROCARDIOGRAFIA,
      HEMODINAMIA,
      NEUROLOGIA,
      URGENCIAS_METABOLICAS,
      PEDIATRIA,
    ],
  },
];

function prueba(id) {
  return PRUEBAS.find((p) => p.id === id) || null;
}

function version(id) {
  return VERSIONES.find((v) => v.id === id) || null;
}

function versionesDe(pruebaId) {
  return VERSIONES.filter((v) => v.prueba === pruebaId);
}

// Los simulacros nuevos siempre usan la versión más reciente de su prueba.
function versionActivaDe(pruebaId = PRUEBA_POR_DEFECTO) {
  const lista = versionesDe(pruebaId);
  return lista.length ? lista[lista.length - 1].id : null;
}

function pruebaDe(versionId) {
  return version(versionId)?.prueba || PRUEBA_POR_DEFECTO;
}

function nombrePrueba(pruebaId) {
  return prueba(pruebaId)?.nombre || pruebaId;
}

function escalaDe(versionId) {
  return prueba(pruebaDe(versionId))?.escala || 'icfes';
}

const VERSION_ACTIVA = versionActivaDe(PRUEBA_POR_DEFECTO);
// Una por prueba: son las que necesitan banco completo.
const VERSIONES_ACTIVAS = PRUEBAS.map((p) => versionActivaDe(p.id)).filter(Boolean);

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
  valoracion: 'Valoración del paciente cardiovascular',
  intervencion: 'Intervención y administración de tratamiento',
  fundamentacion: 'Fundamentación fisiopatológica y farmacológica',
  reconocimiento: 'Reconocimiento del trazado electrocardiográfico',
  interpretacion_clinica: 'Correlación entre el trazado y la clínica',
  conducta: 'Conducta inmediata ante el trazado',
  monitoria_invasiva: 'Monitoría invasiva y línea arterial',
  procedimientos: 'Cateterismo, angioplastia y stent',
  cuidado_post: 'Cuidado posterior al procedimiento',
  clasificacion: 'Clasificación del ACV y del edema cerebral',
  valoracion_neuro: 'Valoración neurológica',
  manejo_neuro: 'Manejo del paciente neurocrítico',
  diagnostico_metabolico: 'Reconocimiento de la descompensación metabólica',
  manejo_hidroelectrolitico: 'Manejo hídrico, insulínico y electrolítico',
  complicaciones: 'Prevención de complicaciones del tratamiento',
  convulsion_febril: 'Convulsión febril',
  epilepsia: 'Epilepsia y estado epiléptico',
  educacion_familiar: 'Educación a la familia y cuidado en casa',
};

const TODOS_LOS_MODULOS = [
  LECTURA_CRITICA,
  RAZONAMIENTO_CUANTITATIVO,
  COMPETENCIAS_CIUDADANAS,
  COMUNICACION_ESCRITA,
  INGLES,
  CARDIOLOGIA,
  ELECTROCARDIOGRAFIA,
  HEMODINAMIA,
  NEUROLOGIA,
  URGENCIAS_METABOLICAS,
  PEDIATRIA,
];

const NOMBRES_MODULO = Object.fromEntries(TODOS_LOS_MODULOS.map((m) => [m.id, m.nombre]));

// Las funciones que dependen de la versión caen en la activa de la prueba por
// defecto si no se indica otra, para que quien solo quiera armar un simulacro
// del Saber Pro no tenga que pasarla en cada llamada.
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
  PRUEBAS,
  PRUEBA_POR_DEFECTO,
  VERSIONES,
  VERSION_ACTIVA,
  VERSIONES_ACTIVAS,
  NOMBRES_MODULO,
  NOMBRES_COMPETENCIA,
  prueba,
  pruebaDe,
  nombrePrueba,
  escalaDe,
  version,
  versionesDe,
  versionActivaDe,
  modulosDe,
  duracionDe,
  totalPreguntasDe,
  moduloDe,
  nombreVersion,
  nombreCompetencia,
};
