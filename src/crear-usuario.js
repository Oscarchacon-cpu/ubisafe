const readline = require('readline');
const bcrypt = require('bcryptjs');
const pool = require('./db');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function preguntar(texto) {
  return new Promise((resolve) => rl.question(texto, resolve));
}

async function elegirCliente() {
  const resultado = await pool.query(`SELECT id, nombre_empresa FROM clientes ORDER BY id`);
  if (resultado.rows.length === 0) {
    console.log('No hay clientes registrados todavia.');
    return null;
  }
  if (resultado.rows.length === 1) return resultado.rows[0].id;

  console.log('\nClientes disponibles:');
  resultado.rows.forEach((c, i) => console.log(`  ${i + 1}. ${c.nombre_empresa}`));
  const seleccion = await preguntar('Elige un numero: ');
  return resultado.rows[Number(seleccion) - 1]?.id ?? null;
}

async function main() {
  const clienteId = await elegirCliente();
  if (!clienteId) {
    rl.close();
    await pool.end();
    return;
  }

  const nombre = await preguntar('Nombre completo: ');
  const email = await preguntar('Email: ');
  const password = await preguntar('Contrasena: ');
  const rol = (await preguntar('Rol (ej: admin): ')).trim() || 'admin';

  const passwordHash = await bcrypt.hash(password, 10);

  const resultado = await pool.query(
    `INSERT INTO usuarios (cliente_id, nombre, email, password_hash, rol)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [clienteId, nombre, email, passwordHash, rol]
  );

  console.log(`\nUsuario creado con id #${resultado.rows[0].id}. Ya puedes iniciar sesion con ese email y contrasena.`);

  rl.close();
  await pool.end();
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
