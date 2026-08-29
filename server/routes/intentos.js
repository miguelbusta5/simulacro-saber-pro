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
// intentos cuyo plazo ya vencio.
router.use((req, _res, next) => {
  cerrarVencidos(req.usuario.id);
  next();
});

// Bloqueo central: mientras haya un simulacro corriendo no se pueden ver
// respuestas buenas/malas ni el analisis de ningun intento anterior.
function exigirSinIntentoEnCurso(req, res, next) {
  const activo = intentoActivoDe(req.usuario.id);
  if (activo) {
    return res.status(409).json({
      error: 'REVISION_BLOQUEADA',
      mensaje:
        'No puedes ver las respuestas mientras tengas un simulacro en curso. Termínalo o espera a que se acabe el tiempo.',
      intento_activo: { id: activo.id, segundos_restantes: segundosRestantes(activo) },
    });
  }
  next();
}

router.get('/', (req, res) => {
  res.json({
    intentos: historialDe(req.usuario.id),
    revision_bloqueada: !!intentoActivoDe(req.usuario.id),
  });
});

router.post('/', (req, res, next) => {
  try {
    const id = crearIntento(req.usuario.id);
    res.status(201).json({ intento_id: id });
  } catch (e) {
    next(e);
  }
});

router.get('/activo', (req, res) => {
  const activo = intentoActivoDe(req.usuario.id);
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
});

router.get('/:id', (req, res, next) => {
  try {
    const intento = obtenerIntento(req.params.id, req.usuario.id);
    if (intento.estado !== 'en_curso') {
      throw new ErrorApp(
        409,
        'INTENTO_FINALIZADO',
        'Este simulacro ya fue finalizado. Consulta sus resultados.'
      );
    }
    res.json(cuadernillo(intento));
  } catch (e) {
    next(e);
  }
});

router.put('/:id/respuestas/:preguntaId', (req, res, next) => {
  try {
    const { opcion = null, revisar = false } = req.body || {};
    const r = guardarRespuesta(
      req.params.id,
      req.usuario.id,
      req.params.preguntaId,
      opcion === '' ? null : opcion,
      revisar
    );
    res.json(r);
  } catch (e) {
    next(e);
  }
});

router.post('/:id/finalizar', (req, res, next) => {
  try {
    const intento = obtenerIntento(req.params.id, req.usuario.id);
    finalizarIntento(intento.id, req.usuario.id, 'entregado');
    res.json({ intento_id: intento.id });
  } catch (e) {
    next(e);
  }
});

router.get('/:id/resultados', exigirSinIntentoEnCurso, (req, res, next) => {
  try {
    const intento = obtenerIntento(req.params.id, req.usuario.id);
    if (intento.estado !== 'finalizado') {
      throw new ErrorApp(409, 'INTENTO_EN_CURSO', 'Este simulacro todavía no ha terminado.');
    }
    res.json(resultadosDe(intento.id));
  } catch (e) {
    next(e);
  }
});

router.get('/:id/revision', exigirSinIntentoEnCurso, (req, res, next) => {
  try {
    const intento = obtenerIntento(req.params.id, req.usuario.id);
    if (intento.estado !== 'finalizado') {
      throw new ErrorApp(409, 'INTENTO_EN_CURSO', 'Este simulacro todavía no ha terminado.');
    }
    res.json({ intento_id: intento.id, preguntas: revisionDe(intento.id) });
  } catch (e) {
    next(e);
  }
});

router.get('/:id/analisis', exigirSinIntentoEnCurso, (req, res, next) => {
  try {
    const intento = obtenerIntento(req.params.id, req.usuario.id);
    if (intento.estado !== 'finalizado') {
      throw new ErrorApp(409, 'INTENTO_EN_CURSO', 'Este simulacro todavía no ha terminado.');
    }
    res.json(analizarIntento(intento.id));
  } catch (e) {
    next(e);
  }
});

module.exports = router;
