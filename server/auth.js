'use strict';

const crypto = require('node:crypto');
const { consulta, uno, ejecutar, ahora } = require('./db');

const COOKIE = 'simulacro_sesion';
const DIAS_SESION = 30;

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

function passwordValida(password, salt, hashGuardado) {
  const { hash } = hashPassword(password, salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(hashGuardado, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function crearUsuario(usuario, nombre, password) {
  const { hash, salt } = hashPassword(password);
  const filas = await consulta(
    `INSERT INTO usuarios (usuario, nombre, pass_hash, pass_salt, creado_en)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [usuario.trim(), (nombre || '').trim(), hash, salt, ahora()]
  );
  return filas[0].id;
}

async function buscarUsuario(usuario) {
  return uno('SELECT * FROM usuarios WHERE lower(usuario) = lower($1)', [usuario.trim()]);
}

async function crearSesion(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expira = new Date(Date.now() + DIAS_SESION * 24 * 3600 * 1000).toISOString();
  await ejecutar(
    'INSERT INTO sesiones (token, user_id, creado_en, expira_en) VALUES ($1, $2, $3, $4)',
    [token, userId, ahora(), expira]
  );
  return token;
}

async function borrarSesion(token) {
  if (token) await ejecutar('DELETE FROM sesiones WHERE token = $1', [token]);
}

async function usuarioDeToken(token) {
  if (!token) return null;
  const fila = await uno(
    `SELECT u.id, u.usuario, u.nombre, s.expira_en
       FROM sesiones s JOIN usuarios u ON u.id = s.user_id
      WHERE s.token = $1`,
    [token]
  );
  if (!fila) return null;
  if (new Date(fila.expira_en).getTime() < Date.now()) {
    await borrarSesion(token);
    return null;
  }
  return { id: fila.id, usuario: fila.usuario, nombre: fila.nombre };
}

function ponerCookie(res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    // En producción la app se sirve por HTTPS; en local, por HTTP.
    secure: process.env.NODE_ENV === 'production',
    maxAge: DIAS_SESION * 24 * 3600 * 1000,
  });
}

// Adjunta req.usuario si hay sesión válida. Nunca bloquea.
async function cargarUsuario(req, _res, next) {
  try {
    req.usuario = await usuarioDeToken(req.cookies?.[COOKIE]);
    next();
  } catch (e) {
    next(e);
  }
}

// Exige sesión. Se usa en todas las rutas de /api que no sean de auth pública.
function exigirUsuario(req, res, next) {
  if (!req.usuario) {
    return res.status(401).json({ error: 'NO_AUTENTICADO', mensaje: 'Debes iniciar sesión.' });
  }
  next();
}

module.exports = {
  COOKIE,
  crearUsuario,
  buscarUsuario,
  passwordValida,
  crearSesion,
  borrarSesion,
  ponerCookie,
  cargarUsuario,
  exigirUsuario,
};
