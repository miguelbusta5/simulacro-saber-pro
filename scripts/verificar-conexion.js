'use strict';

// Comprueba que DATABASE_URL sirve y dice exactamente qué está mal si no.
// Es el primer comando que conviene correr después de pegar la cadena de
// conexión, antes de npm run seed.
//
// Uso: npm run conexion

const { Client } = require('pg');

const URL_BD = process.env.DATABASE_URL;

// Pistas para los errores que aparecen casi siempre al configurar esto.
const PISTAS = [
  {
    coincide: (e) => e.code === 'ENOTFOUND',
    texto:
      'No se encontró el servidor. Revisa que copiaste el host completo y que no quedaron\n' +
      'corchetes ni espacios en la URL.',
  },
  {
    coincide: (e) => e.code === 'ENETUNREACH' || e.code === 'EHOSTUNREACH',
    texto:
      'No hay ruta hacia el servidor. En Supabase suele pasar por usar la cadena "Direct\n' +
      'connection", que hoy solo responde por IPv6. Usa la del "Session pooler", que es IPv4\n' +
      'y es la que funciona desde Render.',
  },
  {
    coincide: (e) => e.code === 'ECONNREFUSED',
    texto:
      'El servidor rechazó la conexión. Verifica el puerto (5432 para el session pooler,\n' +
      '6543 para el transaction pooler) y que el proyecto no esté pausado por inactividad.',
  },
  {
    coincide: (e) => /password authentication failed/i.test(e.message),
    texto:
      'Usuario o contraseña incorrectos. El error más común es no haber reemplazado\n' +
      '[YOUR-PASSWORD] por la contraseña real de la base de datos. Si la contraseña tiene\n' +
      'caracteres como @ : / o #, hay que escribirlos codificados en la URL.',
  },
  {
    coincide: (e) => /does not exist/i.test(e.message) && /database/i.test(e.message),
    texto: 'La base de datos indicada al final de la URL no existe. En Supabase y Neon suele ser "postgres".',
  },
  {
    coincide: (e) => /self.signed certificate|certificate/i.test(e.message),
    texto:
      'Problema con el certificado TLS. La app ya acepta los certificados de los proveedores\n' +
      'administrados, así que revisa que la URL no traiga parámetros de sslmode contradictorios.',
  },
  {
    coincide: (e) => /timeout|ETIMEDOUT/i.test(e.message) || e.code === 'ETIMEDOUT',
    texto:
      'La conexión expiró. Si el proyecto estaba dormido puede tardar la primera vez:\n' +
      'vuelve a intentarlo. Si insiste, revisa que tu red no bloquee el puerto.',
  },
];

function ocultarPassword(url) {
  return url.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:****@');
}

async function main() {
  if (!URL_BD) {
    console.error('Falta DATABASE_URL.\n');
    console.error('Copia .env.example a .env y pega ahí la cadena de conexión de tu Postgres.');
    process.exit(1);
  }

  if (URL_BD.includes('[') || URL_BD.includes('TU_PASSWORD')) {
    console.error('La DATABASE_URL todavía tiene el marcador de la contraseña sin reemplazar.\n');
    console.error(`  ${ocultarPassword(URL_BD)}`);
    console.error('\nReemplaza esa parte por la contraseña real de tu base de datos.');
    process.exit(1);
  }

  console.log(`Conectando a ${ocultarPassword(URL_BD)}\n`);

  const cliente = new Client({
    connectionString: URL_BD,
    ssl: /localhost|127\.0\.0\.1/.test(URL_BD) ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  try {
    await cliente.connect();
  } catch (e) {
    console.error(`No se pudo conectar: ${e.message}\n`);
    const pista = PISTAS.find((p) => p.coincide(e));
    if (pista) console.error(pista.texto);
    process.exit(1);
  }

  const { rows: version } = await cliente.query('SELECT version() AS v');
  console.log(`Conexión correcta.\n  ${version[0].v.split(',')[0]}`);

  const { rows: tablas } = await cliente.query(
    `SELECT COUNT(*)::int AS n FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN
        ('usuarios','sesiones','contextos','preguntas','intentos',
         'intento_preguntas','respuestas','resultados')`
  );

  if (tablas[0].n === 0) {
    console.log('\nLa base está vacía todavía. El siguiente paso es:\n\n  npm run seed\n');
  } else if (tablas[0].n < 8) {
    console.log(
      `\nHay ${tablas[0].n} de 8 tablas: el esquema quedó a medias. Vuelve a correr:\n\n  npm run seed\n`
    );
  } else {
    const { rows: preguntas } = await cliente.query('SELECT COUNT(*)::int AS n FROM preguntas');
    const { rows: usuarios } = await cliente.query('SELECT COUNT(*)::int AS n FROM usuarios');
    console.log(`  Las 8 tablas existen.`);
    console.log(`  ${preguntas[0].n} preguntas en el banco.`);
    console.log(`  ${usuarios[0].n} usuarios registrados.`);
    console.log(
      preguntas[0].n >= 160
        ? '\nTodo listo. Puedes levantar la app con:\n\n  npm start\n'
        : '\nFaltan preguntas para armar un simulacro completo. Corre:\n\n  npm run seed\n'
    );
  }

  await cliente.end();
}

main().catch(async (e) => {
  console.error(e.message);
  process.exit(1);
});
