'use strict';

const path = require('node:path');
const express = require('express');
const cookieParser = require('cookie-parser');

const { cargarUsuario } = require('./auth');
const { faltantesPorModulo } = require('./exam/selection');
const { DURACION_MINUTOS, TOTAL_PREGUNTAS, MODULOS } = require('./exam/blueprint');

const app = express();

app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());
app.use(cargarUsuario);

app.use('/api/auth', require('./routes/auth'));
app.use('/api/intentos', require('./routes/intentos'));

app.get('/api/blueprint', (_req, res) => {
  res.json({
    duracion_minutos: DURACION_MINUTOS,
    total_preguntas: TOTAL_PREGUNTAS,
    modulos: MODULOS.map((m) => ({ id: m.id, nombre: m.nombre, preguntas: m.preguntas })),
    banco_incompleto: faltantesPorModulo(),
  });
});

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'NO_ENCONTRADO', mensaje: 'Ruta inexistente.' });
});

// Manejador central de errores: los ErrorApp llevan su propio status y codigo.
app.use((err, _req, res, _next) => {
  const status = err.status || (err.codigo === 'BANCO_INSUFICIENTE' ? 503 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({
    error: err.codigo || 'ERROR_INTERNO',
    mensaje: err.status || err.codigo ? err.message : 'Ocurrió un error inesperado.',
  });
});

const PUERTO = Number(process.env.PORT) || 3000;

if (require.main === module) {
  const faltan = faltantesPorModulo();
  if (faltan.length) {
    console.warn('AVISO: el banco de preguntas está incompleto. Ejecuta: npm run seed');
    for (const f of faltan) console.warn(`  - ${f.nombre}: hay ${f.hay}, se necesitan ${f.necesita}`);
  }
  app.listen(PUERTO, () => {
    console.log(`Simulacro Saber Pro en http://localhost:${PUERTO}`);
  });
}

module.exports = app;
