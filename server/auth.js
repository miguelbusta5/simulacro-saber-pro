'use strict';

const crypto = require('node:crypto');
const { db, ahora } = require('./db');

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

function crearUsuario(usuario, nombre, password) {
  const { hash, salt } = hashPassword(password);
  const info = db
    .prepare(
      'INSERT INTO usuarios (usuario, nombre, pass_hash, pass_salt, creado_en) VALUES (?, ?, ?, ?, ?)'
    )
    .run(usuario.trim(), (nombre || '').trim(), hash, salt, ahora());
  return Number(info.lastInsertRowid);
}

function buscarUsuario(usuario) {
  return db.prepare('SELECT * FROM usuarios WHERE usuario = ?').get(usuario.trim());
}

function crearSesion(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expira = new Date(Date.now() + DIAS_SESION * 24 * 3600 * 1000).toISOString();
  db.prepare('INSERT INTO sesiones (token, user_id, creado_en, expira_en) VALUES (?, ?, ?, ?)').run(
    token,
    userId,
    ahora(),
    expira
  );
  return token;
}

function borrarSesion(token) {
  if (token) db.prepare('DELETE FROM sesiones WHERE token = ?').run(token);
}

function usuarioDeToken(token) {
  if (!token) return null;
  const fila = db
    .prepare(
      `SELECT u.id, u.usuario, u.nombre, s.expira_en
         FROM sesiones s JOIN usuarios u ON u.id = s.user_id
        WHERE s.token = ?`
    )
    .get(token);
  if (!fila) return null;
  if (new Date(fila.expira_en).getTime() < Date.now()) {
    borrarSesion(token);
    return null;
  }
  return { id: fila.id, usuario: fila.usuario, nombre: fila.nombre };
}

function ponerCookie(res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: DIAS_SESION * 24 * 3600 * 1000,
  });
}

// Adjunta req.usuario si hay sesion valida. Nunca bloquea.
function cargarUsuario(req, _res, next) {
  req.usuario = usuarioDeToken(req.cookies?.[COOKIE]);
  next();
}

// Exige sesion. Usar en todas las rutas de /api que no sean de auth publica.
function exigirUsuario(req, res, next) {
  if (!req.usuario) {
    return res.status(401).json({ error: 'NO_AUTENTICADO', mensaje: 'Debes iniciar sesion.' });
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
