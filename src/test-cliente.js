const net = require('net');

const cliente = net.createConnection({ host: 'localhost', port: 6027 }, () => {
  console.log('Conectado al servidor. Enviando datos de prueba...');
  cliente.write(Buffer.from('0102030405', 'hex'));
  cliente.end();
});
