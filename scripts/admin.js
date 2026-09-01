'use strict';

// Designa administradores. Es el único camino para obtener el rol: no existe
// ninguna ruta web que lo otorgue.
//
//   npm run admin                     lista los administradores actuales
//   npm run admin -- <usuario>        promueve esa cuenta a administrador
//   npm run admin -- <usuario> --quitar   la devuelve a estudiante

const { consulta, uno, inicializar, cerrar } = require('../server/db');

async function listar() {
  const admins = await consulta(
    "SELECT usuario, nombre, creado_en FROM usuarios WHERE rol = 'admin' ORDER BY usuario"
  );
  if (!admins.length) {
    console.log('No hay administradores todavía.\n');
    console.log('Para nombrar uno, registra la cuenta en la app y luego ejecuta:\n');
    console.log('  npm run admin -- <usuario>\n');
    return;
  }
  console.log(`Administradores (${admins.length}):\n`);
  for (const a of admins) {
    console.log(`  ${a.usuario}${a.nombre ? ` (${a.nombre})` : ''}`);
  }
  console.log();
}

async function cambiarRol(usuario, rol) {
  const existe = await uno('SELECT id, usuario, rol FROM usuarios WHERE lower(usuario) = lower($1)', [
    usuario,
  ]);
  if (!existe) {
    console.error(`No existe el usuario "${usuario}".\n`);
    console.error('La cuenta debe registrarse primero en la aplicación.');
    process.exitCode = 1;
    return;
  }
  if (existe.rol === rol) {
    console.log(`"${existe.usuario}" ya tenía el rol "${rol}". No se cambió nada.`);
    return;
  }

  await consulta('UPDATE usuarios SET rol = $1 WHERE id = $2', [rol, existe.id]);
  console.log(
    rol === 'admin'
      ? `"${existe.usuario}" ahora es administrador.`
      : `"${existe.usuario}" volvió a ser estudiante.`
  );
}

async function main() {
  await inicializar();

  const args = process.argv.slice(2);
  const quitar = args.includes('--quitar');
  const usuario = args.find((a) => !a.startsWith('--'));

  if (!usuario) {
    await listar();
    return;
  }

  await cambiarRol(usuario, quitar ? 'estudiante' : 'admin');
  console.log();
  await listar();
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(cerrar);
