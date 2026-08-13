// CRC-16/ARC (IBM), el mismo que usa el protocolo Teltonika para validar paquetes
function crc16(buffer) {
  let crc = 0x0000;
  for (let i = 0; i < buffer.length; i++) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x0001 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
    }
  }
  return crc;
}

function construirComando(texto) {
  const textoBuffer = Buffer.from(texto, 'ascii');

  const datos = Buffer.alloc(1 + 1 + 1 + 4 + textoBuffer.length + 1);
  let offset = 0;
  datos.writeUInt8(0x0c, offset); offset += 1; // codec id: comandos
  datos.writeUInt8(1, offset); offset += 1; // cantidad 1
  datos.writeUInt8(0x05, offset); offset += 1; // tipo: comando (servidor -> equipo)
  datos.writeUInt32BE(textoBuffer.length, offset); offset += 4;
  textoBuffer.copy(datos, offset); offset += textoBuffer.length;
  datos.writeUInt8(1, offset); offset += 1; // cantidad 2

  const paquete = Buffer.alloc(4 + 4 + datos.length + 4);
  paquete.writeUInt32BE(0, 0); // preambulo
  paquete.writeUInt32BE(datos.length, 4);
  datos.copy(paquete, 8);
  paquete.writeUInt32BE(crc16(datos), 8 + datos.length);

  return paquete;
}

function parseRespuestaComando(datos) {
  let offset = 0;
  const codecId = datos.readUInt8(offset); offset += 1;
  offset += 1; // cantidad 1
  const tipo = datos.readUInt8(offset); offset += 1;
  const tamano = datos.readUInt32BE(offset); offset += 4;
  const texto = datos.subarray(offset, offset + tamano).toString('ascii');

  return { codecId, tipo, texto };
}

module.exports = { construirComando, parseRespuestaComando };
