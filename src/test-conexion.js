const pool = require('./db');

pool.query('SELECT NOW()')
  .then((resultado) => {
    console.log('Conexión exitosa. Hora del servidor:', resultado.rows[0].now);
  })
  .catch((error) => {
    console.error('Error al conectar:', error.message);
  })
  .finally(() => {
    pool.end();
  });
