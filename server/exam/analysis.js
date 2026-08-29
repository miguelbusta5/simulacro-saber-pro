'use strict';

const { consulta } = require('../db');
const estudio = require('../../data/estudio.json');
const { NOMBRES_MODULO, nombreCompetencia } = require('./blueprint');

const MINIMO_PREGUNTAS = 3; // por debajo de esto el porcentaje no es informativo
const UMBRAL_ALTA = 50;
const UMBRAL_MEDIA = 70;

function prioridad(porcentaje) {
  if (porcentaje < UMBRAL_ALTA) return 'alta';
  if (porcentaje < UMBRAL_MEDIA) return 'media';
  return 'consolidado';
}

const SQL_DETALLE = `
  SELECT ip.orden, p.id, p.modulo, p.competencia, p.tema, p.enunciado, p.correcta,
         r.opcion AS marcada
    FROM intento_preguntas ip
    JOIN preguntas p ON p.id = ip.pregunta_id
    LEFT JOIN respuestas r ON r.intento_id = ip.intento_id AND r.pregunta_id = p.id
   WHERE ip.intento_id = $1
   ORDER BY ip.orden
`;

function recorte(texto, max = 140) {
  const limpio = String(texto).replace(/\s+/g, ' ').trim();
  return limpio.length > max ? `${limpio.slice(0, max - 1)}…` : limpio;
}

function agrupar(filas, clave) {
  const grupos = new Map();
  for (const f of filas) {
    const k = clave(f);
    if (!grupos.has(k)) grupos.set(k, { total: 0, aciertos: 0, sinResponder: 0, errores: [] });
    const g = grupos.get(k);
    g.total++;
    if (f.marcada == null) {
      g.sinResponder++;
    } else if (f.marcada === f.correcta) {
      g.aciertos++;
    }
    if (f.marcada !== f.correcta) {
      g.errores.push({
        numero: f.orden,
        enunciado: recorte(f.enunciado),
        marcada: f.marcada,
        correcta: f.correcta,
      });
    }
  }
  return grupos;
}

// Diagnóstico completo de un intento finalizado: en qué competencias y temas
// está fallando y qué debe estudiar.
async function analizarIntento(intentoId) {
  const filas = await consulta(SQL_DETALLE, [intentoId]);

  const porCompetencia = [];
  for (const [clave, g] of agrupar(filas, (f) => `${f.modulo}.${f.competencia}`)) {
    if (g.total < MINIMO_PREGUNTAS) continue;
    const porcentaje = Math.round((g.aciertos / g.total) * 100);
    const guia = estudio.competencias[clave] || null;
    const [moduloId] = clave.split('.');
    porCompetencia.push({
      clave,
      modulo: moduloId,
      modulo_nombre: NOMBRES_MODULO[moduloId] || moduloId,
      competencia: nombreCompetencia(clave.split('.')[1]),
      aciertos: g.aciertos,
      total: g.total,
      sin_responder: g.sinResponder,
      porcentaje,
      prioridad: prioridad(porcentaje),
      que_mide: guia?.que_mide || '',
      que_estudiar: guia?.que_estudiar || [],
      como_practicar: guia?.como_practicar || '',
      errores: g.errores.slice(0, 5),
    });
  }
  porCompetencia.sort((a, b) => a.porcentaje - b.porcentaje);

  const porTema = [];
  for (const [clave, g] of agrupar(filas, (f) => `${f.modulo}|${f.tema}`)) {
    if (g.total < MINIMO_PREGUNTAS) continue;
    const [moduloId, tema] = clave.split('|');
    const porcentaje = Math.round((g.aciertos / g.total) * 100);
    porTema.push({
      modulo: moduloId,
      modulo_nombre: NOMBRES_MODULO[moduloId] || moduloId,
      tema,
      descripcion: estudio.temas[tema] || '',
      aciertos: g.aciertos,
      total: g.total,
      porcentaje,
      prioridad: prioridad(porcentaje),
    });
  }
  porTema.sort((a, b) => a.porcentaje - b.porcentaje);

  // Señal de gestión del tiempo: dónde quedaron preguntas en blanco.
  const sinResponderPorModulo = {};
  let sinResponder = 0;
  for (const f of filas) {
    if (f.marcada == null) {
      sinResponder++;
      sinResponderPorModulo[f.modulo] = (sinResponderPorModulo[f.modulo] || 0) + 1;
    }
  }

  const foco = porCompetencia.filter((c) => c.prioridad !== 'consolidado').slice(0, 4);

  return {
    total_preguntas: filas.length,
    sin_responder: sinResponder,
    sin_responder_por_modulo: Object.entries(sinResponderPorModulo).map(([modulo, n]) => ({
      modulo,
      modulo_nombre: NOMBRES_MODULO[modulo] || modulo,
      cantidad: n,
    })),
    gestion_tiempo: mensajeTiempo(sinResponder, filas.length),
    por_competencia: porCompetencia,
    por_tema: porTema,
    plan_de_estudio: foco.map((c, i) => ({
      orden: i + 1,
      titulo: `${c.modulo_nombre} — ${c.competencia}`,
      porcentaje: c.porcentaje,
      prioridad: c.prioridad,
      que_estudiar: c.que_estudiar,
      como_practicar: c.como_practicar,
    })),
  };
}

function mensajeTiempo(sinResponder, total) {
  if (sinResponder === 0) {
    return 'Respondiste todas las preguntas: el tiempo no fue un problema en este simulacro.';
  }
  const pct = Math.round((sinResponder / total) * 100);
  if (pct >= 10) {
    return `Dejaste ${sinResponder} preguntas en blanco (${pct} % de la prueba). El tiempo te está costando más que el contenido: practica descartar rápido y responder siempre, aunque sea por eliminación, porque no hay penalización por error.`;
  }
  return `Dejaste ${sinResponder} preguntas en blanco. Recuerda que no hay penalización por responder mal: nunca dejes una en blanco.`;
}

module.exports = { analizarIntento };
