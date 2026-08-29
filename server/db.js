'use strict';

const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const RUTA_DB = process.env.SIMULACRO_DB || path.join(__dirname, '..', 'simulacro.db');

const db = new DatabaseSync(RUTA_DB);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

// Esquema idempotente: se puede volver a ejecutar sin romper datos existentes.
db.exec(`
CREATE TABLE IF NOT EXISTS usuarios (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario    TEXT NOT NULL UNIQUE COLLATE NOCASE,
  nombre     TEXT NOT NULL DEFAULT '',
  pass_hash  TEXT NOT NULL,
  pass_salt  TEXT NOT NULL,
  creado_en  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sesiones (
  token     TEXT PRIMARY KEY,
  user_id   INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  creado_en TEXT NOT NULL,
  expira_en TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sesiones_user ON sesiones(user_id);

-- Texto, tabla o grafica compartida por varias preguntas del mismo bloque.
CREATE TABLE IF NOT EXISTS contextos (
  id        TEXT PRIMARY KEY,
  modulo    TEXT NOT NULL,
  titulo    TEXT NOT NULL DEFAULT '',
  contenido TEXT NOT NULL,
  fuente    TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS preguntas (
  id                        TEXT PRIMARY KEY,
  modulo                    TEXT NOT NULL,
  competencia               TEXT NOT NULL,
  tema                      TEXT NOT NULL,
  dificultad                INTEGER NOT NULL DEFAULT 2,
  contexto_id               TEXT REFERENCES contextos(id) ON DELETE SET NULL,
  enunciado                 TEXT NOT NULL,
  opciones                  TEXT NOT NULL,  -- JSON: [{clave, texto}]
  correcta                  TEXT NOT NULL,
  justificacion             TEXT NOT NULL,
  justificaciones_incorrectas TEXT NOT NULL DEFAULT '{}'  -- JSON: {clave: motivo}
);
CREATE INDEX IF NOT EXISTS idx_preguntas_modulo ON preguntas(modulo);
CREATE INDEX IF NOT EXISTS idx_preguntas_comp ON preguntas(modulo, competencia);

CREATE TABLE IF NOT EXISTS intentos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  estado        TEXT NOT NULL CHECK (estado IN ('en_curso','finalizado')),
  motivo_cierre TEXT NOT NULL DEFAULT '',
  iniciado_en   TEXT NOT NULL,
  vence_en      TEXT NOT NULL,
  finalizado_en TEXT
);
-- Garantiza a nivel de base de datos un solo intento activo por usuario.
CREATE UNIQUE INDEX IF NOT EXISTS idx_un_intento_activo
  ON intentos(user_id) WHERE estado = 'en_curso';
CREATE INDEX IF NOT EXISTS idx_intentos_user ON intentos(user_id, iniciado_en DESC);

CREATE TABLE IF NOT EXISTS intento_preguntas (
  intento_id  INTEGER NOT NULL REFERENCES intentos(id) ON DELETE CASCADE,
  orden       INTEGER NOT NULL,
  pregunta_id TEXT NOT NULL REFERENCES preguntas(id),
  modulo      TEXT NOT NULL,
  PRIMARY KEY (intento_id, orden)
);
CREATE INDEX IF NOT EXISTS idx_ip_pregunta ON intento_preguntas(pregunta_id);

CREATE TABLE IF NOT EXISTS respuestas (
  intento_id    INTEGER NOT NULL REFERENCES intentos(id) ON DELETE CASCADE,
  pregunta_id   TEXT NOT NULL,
  opcion        TEXT,
  marcada       INTEGER NOT NULL DEFAULT 0,
  respondido_en TEXT NOT NULL,
  PRIMARY KEY (intento_id, pregunta_id)
);

CREATE TABLE IF NOT EXISTS resultados (
  intento_id INTEGER NOT NULL REFERENCES intentos(id) ON DELETE CASCADE,
  modulo     TEXT NOT NULL,
  aciertos   INTEGER NOT NULL,
  total      INTEGER NOT NULL,
  puntaje    INTEGER NOT NULL,
  nivel      TEXT NOT NULL,
  PRIMARY KEY (intento_id, modulo)
);
`);

function ahora() {
  return new Date().toISOString();
}

module.exports = { db, ahora, RUTA_DB };
