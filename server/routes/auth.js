'use strict';

const express = require('express');
const {
  COOKIE,
  crearUsuario,
  buscarUsuario,
  passwordValida,
  crearSesion,
  borrarSesion,
  ponerCookie,
  exigirUsuario,
} = require('../auth');
const { cerrarVencidos, intentoActivoDe, segundosRestantes } = require('../exam/intentos');

const router = express.Router();

const RE_USUARIO = /^[a-zA-Z0-9._-]{3,30}$/;

router.post('/register', (req, res) => {
  const { usuario, nombre, password } = req.body || {};
  if (!RE_USUARIO.test(String(usuario || ''))) {
    return res.status(400).json({
      error: 'USUARIO_INVALIDO',
      mensaje: 'El usuario debe tener entre 3 y 30 caracteres: letras, números, punto, guion o guion bajo.',
    });
  }
  if (String(password || '').length < 6) {
    return res
      .status(400)
      .json({ error: 'PASSWORD_CORTA', mensaje: 'La contraseña debe tener al menos 6 caracteres.' });
  }
  if (buscarUsuario(usuario)) {
    return res.status(409).json({ error: 'USUARIO_EXISTE', mensaje: 'Ese usuario ya está registrado.' });
  }

  const id = crearUsuario(usuario, nombre, password);
  ponerCookie(res, crearSesion(id));
  res.status(201).json({ usuario: { id, usuario: String(usuario).trim(), nombre: nombre || '' } });
});

router.post('/login', (req, res) => {
  const { usuario, password } = req.body || {};
  const fila = buscarUsuario(String(usuario || ''));
  if (!fila || !passwordValida(String(password || ''), fila.pass_salt, fila.pass_hash)) {
    return res
      .status(401)
      .json({ error: 'CREDENCIALES', mensaje: 'Usuario o contraseña incorrectos.' });
  }
  ponerCookie(res, crearSesion(fila.id));
  res.json({ usuario: { id: fila.id, usuario: fila.usuario, nombre: fila.nombre } });
});

router.post('/logout', (req, res) => {
  borrarSesion(req.cookies?.[COOKIE]);
  res.clearCookie(COOKIE);
  res.json({ ok: true });
});

// Estado de la sesion. Incluye el intento activo, que es lo que gobierna si el
// usuario puede iniciar otro simulacro o ver sus respuestas.
router.get('/me', exigirUsuario, (req, res) => {
  cerrarVencidos(req.usuario.id);
  const activo = intentoActivoDe(req.usuario.id);
  res.json({
    usuario: req.usuario,
    intento_activo: activo
      ? { id: activo.id, iniciado_en: activo.iniciado_en, segundos_restantes: segundosRestantes(activo) }
      : null,
  });
});

module.exports = router;
