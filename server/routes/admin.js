'use strict';

const express = require('express');
const { exigirUsuario, exigirAdmin } = require('../auth');
const { consulta, uno } = require('../db');
const { ErrorApp, resultadosDe } = require('../exam/intentos');
const { analizarIntento } = require('../exam/analysis');
const {
  prueba,
  NOMBRES_MODULO,
  nombreVersion,
  nombrePrueba,
  pruebaDe,
  modulosDe,
  VERSIONES,
  VERSIONES_ACTIVAS,
} = require('../exam/blueprint');
const { cerrarIntentosVencidos, exigirSinIntentoEnCurso } = require('./middleware');

const router = express.Router();

router.use(exigirUsuario);
router.use(exigirAdmin);
router.use(cerrarIntentosVencidos);
// El diagnóstico expone respuestas correctas, así que rige el mismo bloqueo que
// para la revisión propia. Ver el comentario en middleware.js.
router.use(exigirSinIntentoEnCurso);

// Ninguna consulta de este router selecciona pass_hash ni pass_salt.

router.get('/usuarios', async (_req, res, next) => {
  try {
    const filas = await consulta(
      `SELECT u.id, u.usuario, u.nombre, u.rol, u.creado_en,
              COUNT(i.id) FILTER (WHERE i.estado = 'finalizado')::int AS intentos_finalizados,
              COUNT(i.id) FILTER (WHERE i.estado = 'en_curso')::int  AS intentos_en_curso,
              MAX(i.iniciado_en) AS ultimo_intento
         FROM usuarios u
         LEFT JOIN intentos i ON i.user_id = u.id
        GROUP BY u.id, u.usuario, u.nombre, u.rol, u.creado_en
        ORDER BY u.creado_en DESC`
    );

    // El mejor puntaje se calcula por prueba: la escala del Saber Pro (0-300) y
    // la de enfermería (porcentaje) no son comparables entre sí.
    const mejores = await consulta(
      `SELECT user_id, prueba, MAX(prom)::int AS puntaje
         FROM (
           SELECT i.user_id, i.prueba, r.intento_id, ROUND(AVG(r.puntaje))::int AS prom
             FROM resultados r
             JOIN intentos i ON i.id = r.intento_id
            WHERE i.estado = 'finalizado'
            GROUP BY i.user_id, i.prueba, r.intento_id
         ) AS por_intento
        GROUP BY user_id, prueba`
    );

    res.json({
      usuarios: filas.map((u) => ({
        ...u,
        mejores_puntajes: mejores
          .filter((m) => m.user_id === u.id)
          .map((m) => ({
            prueba: m.prueba,
            prueba_nombre: nombrePrueba(m.prueba),
            escala: prueba(m.prueba)?.escala || 'icfes',
            puntaje: m.puntaje,
          })),
      })),
    });
  } catch (e) {
    next(e);
  }
});

router.get('/intentos', async (req, res, next) => {
  try {
    const usuario = req.query.usuario ? String(req.query.usuario) : null;
    const filas = await consulta(
      `SELECT i.id, i.prueba, i.version, i.estado, i.motivo_cierre, i.iniciado_en, i.finalizado_en,
              u.id AS user_id, u.usuario, u.nombre,
              (SELECT SUM(aciertos)::int FROM resultados WHERE intento_id = i.id) AS aciertos,
              (SELECT SUM(total)::int    FROM resultados WHERE intento_id = i.id) AS total,
              COALESCE((SELECT ROUND(AVG(puntaje))::int FROM resultados WHERE intento_id = i.id), 0)
                AS puntaje_global,
              (SELECT COUNT(*)::int FROM respuestas
                WHERE intento_id = i.id AND opcion IS NOT NULL) AS respondidas
         FROM intentos i
         JOIN usuarios u ON u.id = i.user_id
        WHERE ($1::text IS NULL OR u.usuario = $1)
        ORDER BY i.iniciado_en DESC`,
      [usuario]
    );

    res.json({
      intentos: filas.map((i) => ({
        ...i,
        version_nombre: nombreVersion(i.version),
        prueba_nombre: nombrePrueba(i.prueba || pruebaDe(i.version)),
        duracion_segundos:
          i.finalizado_en
            ? Math.round(
                (new Date(i.finalizado_en).getTime() - new Date(i.iniciado_en).getTime()) / 1000
              )
            : null,
      })),
    });
  } catch (e) {
    next(e);
  }
});

router.get('/intentos/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      throw new ErrorApp(404, 'NO_ENCONTRADO', 'Ese intento no existe.');
    }
    const intento = await uno(
      `SELECT i.id, i.version, i.estado, u.usuario, u.nombre
         FROM intentos i JOIN usuarios u ON u.id = i.user_id
        WHERE i.id = $1`,
      [id]
    );
    if (!intento) throw new ErrorApp(404, 'NO_ENCONTRADO', 'Ese intento no existe.');
    if (intento.estado !== 'finalizado') {
      throw new ErrorApp(409, 'INTENTO_EN_CURSO', 'Ese simulacro todavía no ha terminado.');
    }

    res.json({
      intento_id: intento.id,
      estudiante: { usuario: intento.usuario, nombre: intento.nombre },
      resultados: await resultadosDe(intento.id),
      analisis: await analizarIntento(intento.id),
    });
  } catch (e) {
    next(e);
  }
});

router.get('/resumen', async (_req, res, next) => {
  try {
    const generales = await uno(
      `SELECT (SELECT COUNT(*)::int FROM usuarios) AS usuarios,
              (SELECT COUNT(*)::int FROM intentos WHERE estado = 'finalizado') AS finalizados,
              (SELECT COUNT(*)::int FROM intentos WHERE estado = 'en_curso')   AS en_curso`
    );

    const porModulo = await consulta(
      `SELECT i.version, r.modulo,
              COUNT(*)::int AS intentos,
              ROUND(AVG(r.puntaje))::int AS puntaje_promedio,
              ROUND(AVG(r.aciertos::numeric / NULLIF(r.total, 0)) * 100)::int AS porcentaje_promedio
         FROM resultados r
         JOIN intentos i ON i.id = r.intento_id
        WHERE i.estado = 'finalizado'
        GROUP BY i.version, r.modulo`
    );

    // Se ordena según el blueprint de cada versión, no como salga de la base.
    const orden = (version, modulo) =>
      modulosDe(version).findIndex((m) => m.id === modulo);

    res.json({
      ...generales,
      versiones: VERSIONES.map((v) => ({
        id: v.id,
        nombre: `${nombrePrueba(v.prueba)} · ${v.nombre}`,
        // Hay una versión activa por prueba, no una sola en total.
        activa: VERSIONES_ACTIVAS.includes(v.id),
        modulos: porModulo
          .filter((r) => r.version === v.id)
          .sort((a, b) => orden(v.id, a.modulo) - orden(v.id, b.modulo))
          .map((r) => ({ ...r, modulo_nombre: NOMBRES_MODULO[r.modulo] || r.modulo })),
      })),
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
