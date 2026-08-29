'use strict';

const path = require('node:path');
const express = require('express');
const cookieParser = require('cookie-parser');

const { inicializar } = require('./db');
const { cargarUsuario } = require('./auth');
const { faltantesPorModulo } = require('./exam/selection');
const { DURACION_MINUTOS, TOTAL_PREGUNTAS, MODULOS } = require('./exam/blueprint');

const app = express();

// Detrás del proxy de Render/Railway, para que las cookies seguras funcionen.
app.set('trust proxy', 1);

app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());
app.use(cargarUsuario);

app.use('/api/auth', require('./routes/auth'));
app.use('/api/intentos', require('./routes/intentos'));

app.get('/api/blueprint', async (_req, res, next) => {
  try {
    res.json({
      duracion_minutos: DURACION_MINUTOS,
      total_preguntas: TOTAL_PREGUNTAS,
      modulos: MODULOS.map((m) => ({ id: m.id, nombre: m.nombre, preguntas: m.preguntas })),
      banco_incompleto: await faltantesPorModulo(),
    });
  } catch (e) {
    next(e);
  }
});

// Chequeo de salud, útil para el monitoreo del proveedor de hosting.
app.get('/api/salud', (_req, res) => res.json({ ok: true }));

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'NO_ENCONTRADO', mensaje: 'Ruta inexistente.' });
});

// Manejador central de errores: los ErrorApp llevan su propio status y código.
app.use((err, _req, res, _next) => {
  const status = err.status || (err.codigo === 'BANCO_INSUFICIENTE' ? 503 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({
    error: err.codigo || 'ERROR_INTERNO',
    mensaje: err.status || err.codigo ? err.message : 'Ocurrió un error inesperado.',
  });
});

const PUERTO = Number(process.env.PORT) || 3000;

async function arrancar() {
  await inicializar();

  const faltan = await faltantesPorModulo();
  if (faltan.length) {
    console.warn('AVISO: el banco de preguntas está incompleto. Ejecuta: npm run seed');
    for (const f of faltan) console.warn(`  - ${f.nombre}: hay ${f.hay}, se necesitan ${f.necesita}`);
  }

  app.listen(PUERTO, () => {
    console.log(`Simulacro Saber Pro escuchando en el puerto ${PUERTO}`);
  });
}

if (require.main === module) {
  arrancar().catch((e) => {
    console.error('No se pudo arrancar el servidor:', e.message);
    process.exit(1);
  });
}

module.exports = app;
module.exports.arrancar = arrancar;
