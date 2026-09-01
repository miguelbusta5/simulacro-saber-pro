'use strict';

// Middlewares compartidos por los routers que tocan intentos.

const { cerrarVencidos, intentoActivoDe, segundosRestantes } = require('../exam/intentos');

// Todo lo que dependa del reloj debe pasar por aquí primero: cierra los
// intentos cuyo plazo ya venció antes de responder nada.
async function cerrarIntentosVencidos(req, _res, next) {
  try {
    await cerrarVencidos(req.usuario.id);
    next();
  } catch (e) {
    next(e);
  }
}

// Bloqueo central: mientras el usuario tenga un simulacro corriendo no puede ver
// respuestas correctas de ningún intento.
//
// Se aplica también al panel de administración: el diagnóstico incluye los
// errores con su enunciado y su respuesta correcta, y como todos los
// estudiantes comparten banco, un administrador que estuviera presentando su
// propio simulacro podría leer ahí respuestas de preguntas que tiene delante.
async function exigirSinIntentoEnCurso(req, res, next) {
  try {
    const activo = await intentoActivoDe(req.usuario.id);
    if (activo) {
      return res.status(409).json({
        error: 'REVISION_BLOQUEADA',
        mensaje:
          'No puedes ver las respuestas mientras tengas un simulacro en curso. Termínalo o espera a que se acabe el tiempo.',
        intento_activo: { id: activo.id, segundos_restantes: segundosRestantes(activo) },
      });
    }
    next();
  } catch (e) {
    next(e);
  }
}

module.exports = { cerrarIntentosVencidos, exigirSinIntentoEnCurso };
