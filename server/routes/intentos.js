'use strict';

const express = require('express');
const { exigirUsuario } = require('../auth');
const {
  ErrorApp,
  cerrarVencidos,
  intentoActivoDe,
  obtenerIntento,
  crearIntento,
  cuadernillo,
  guardarRespuesta,
  finalizarIntento,
  resultadosDe,
  revisionDe,
  historialDe,
  segundosRestantes,
} = require('../exam/intentos');
const { analizarIntento } = require('../exam/analysis');

const router = express.Router();

router.use(exigirUsuario);

// Todo lo que sigue depende del reloj: antes de responder nada, se cierran los
// intentos cuyo plazo ya venció.
router.use(async (req, _res, next) => {
  try {
    await cerrarVencidos(req.usuario.id);
    next();
  } catch (e) {
    next(e);
  }
});

// Bloqueo central: mientras haya un simulacro corriendo no se pueden ver
// respuestas buenas/malas ni el análisis de ningún intento anterior.
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

// Exige que el intento exista, sea del usuario y esté finalizado.
async function intentoFinalizado(req) {
  const intento = await obtenerIntento(req.params.id, req.usuario.id);
  if (intento.estado !== 'finalizado') {
    throw new ErrorApp(409, 'INTENTO_EN_CURSO', 'Este simulacro todavía no ha terminado.');
  }
  return intento;
}

router.get('/', async (req, res, next) => {
  try {
    res.json({
      intentos: await historialDe(req.usuario.id),
      revision_bloqueada: !!(await intentoActivoDe(req.usuario.id)),
    });
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const id = await crearIntento(req.usuario.id);
    res.status(201).json({ intento_id: id });
  } catch (e) {
    next(e);
  }
});

router.get('/activo', async (req, res, next) => {
  try {
    const activo = await intentoActivoDe(req.usuario.id);
    res.json(
      activo
        ? {
            intento_id: activo.id,
            iniciado_en: activo.iniciado_en,
            vence_en: activo.vence_en,
            segundos_restantes: segundosRestantes(activo),
          }
        : { intento_id: null }
    );
  } catch (e) {
    next(e);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const intento = await obtenerIntento(req.params.id, req.usuario.id);
    if (intento.estado !== 'en_curso') {
      throw new ErrorApp(
        409,
        'INTENTO_FINALIZADO',
        'Este simulacro ya fue finalizado. Consulta sus resultados.'
      );
    }
    res.json(await cuadernillo(intento));
  } catch (e) {
    next(e);
  }
});

router.put('/:id/respuestas/:preguntaId', async (req, res, next) => {
  try {
    const { opcion = null, revisar = false } = req.body || {};
    res.json(
      await guardarRespuesta(
        req.params.id,
        req.usuario.id,
        req.params.preguntaId,
        opcion === '' ? null : opcion,
        revisar
      )
    );
  } catch (e) {
    next(e);
  }
});

router.post('/:id/finalizar', async (req, res, next) => {
  try {
    const intento = await obtenerIntento(req.params.id, req.usuario.id);
    await finalizarIntento(intento.id, req.usuario.id, 'entregado');
    res.json({ intento_id: intento.id });
  } catch (e) {
    next(e);
  }
});

router.get('/:id/resultados', exigirSinIntentoEnCurso, async (req, res, next) => {
  try {
    const intento = await intentoFinalizado(req);
    res.json(await resultadosDe(intento.id));
  } catch (e) {
    next(e);
  }
});

router.get('/:id/revision', exigirSinIntentoEnCurso, async (req, res, next) => {
  try {
    const intento = await intentoFinalizado(req);
    res.json({ intento_id: intento.id, preguntas: await revisionDe(intento.id) });
  } catch (e) {
    next(e);
  }
});

router.get('/:id/analisis', exigirSinIntentoEnCurso, async (req, res, next) => {
  try {
    const intento = await intentoFinalizado(req);
    res.json(await analizarIntento(intento.id));
  } catch (e) {
    next(e);
  }
});

module.exports = router;
