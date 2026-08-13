function parseAvlData(buffer) {
  let offset = 0;
  const codecId = buffer.readUInt8(offset); offset += 1;
  const numData1 = buffer.readUInt8(offset); offset += 1;

  const esExtendido = codecId === 0x8e;
  const registros = [];

  for (let i = 0; i < numData1; i++) {
    const timestampMs = Number(buffer.readBigUInt64BE(offset)); offset += 8;
    const prioridad = buffer.readUInt8(offset); offset += 1;

    const longitud = buffer.readInt32BE(offset) / 10000000; offset += 4;
    const latitud = buffer.readInt32BE(offset) / 10000000; offset += 4;
    const altitud = buffer.readInt16BE(offset); offset += 2;
    const angulo = buffer.readUInt16BE(offset); offset += 2;
    const satelites = buffer.readUInt8(offset); offset += 1;
    const velocidad = buffer.readUInt16BE(offset); offset += 2;

    const io = {};

    if (esExtendido) {
      offset += 2; // Event IO ID
      offset += 2; // N total de IDs

      const n1 = buffer.readUInt16BE(offset); offset += 2;
      for (let j = 0; j < n1; j++) {
        const id = buffer.readUInt16BE(offset); offset += 2;
        io[id] = buffer.readUInt8(offset); offset += 1;
      }
      const n2 = buffer.readUInt16BE(offset); offset += 2;
      for (let j = 0; j < n2; j++) {
        const id = buffer.readUInt16BE(offset); offset += 2;
        io[id] = buffer.readUInt16BE(offset); offset += 2;
      }
      const n4 = buffer.readUInt16BE(offset); offset += 2;
      for (let j = 0; j < n4; j++) {
        const id = buffer.readUInt16BE(offset); offset += 2;
        io[id] = buffer.readUInt32BE(offset); offset += 4;
      }
      const n8 = buffer.readUInt16BE(offset); offset += 2;
      for (let j = 0; j < n8; j++) {
        const id = buffer.readUInt16BE(offset); offset += 2;
        io[id] = buffer.readBigUInt64BE(offset); offset += 8;
      }
      const nx = buffer.readUInt16BE(offset); offset += 2;
      for (let j = 0; j < nx; j++) {
        const id = buffer.readUInt16BE(offset); offset += 2;
        const len = buffer.readUInt16BE(offset); offset += 2;
        io[id] = buffer.subarray(offset, offset + len).toString('hex');
        offset += len;
      }
    } else {
      offset += 1; // Event IO ID
      offset += 1; // N total de IDs

      const n1 = buffer.readUInt8(offset); offset += 1;
      for (let j = 0; j < n1; j++) {
        const id = buffer.readUInt8(offset); offset += 1;
        io[id] = buffer.readUInt8(offset); offset += 1;
      }
      const n2 = buffer.readUInt8(offset); offset += 1;
      for (let j = 0; j < n2; j++) {
        const id = buffer.readUInt8(offset); offset += 1;
        io[id] = buffer.readUInt16BE(offset); offset += 2;
      }
      const n4 = buffer.readUInt8(offset); offset += 1;
      for (let j = 0; j < n4; j++) {
        const id = buffer.readUInt8(offset); offset += 1;
        io[id] = buffer.readUInt32BE(offset); offset += 4;
      }
      const n8 = buffer.readUInt8(offset); offset += 1;
      for (let j = 0; j < n8; j++) {
        const id = buffer.readUInt8(offset); offset += 1;
        io[id] = buffer.readBigUInt64BE(offset); offset += 8;
      }
    }

    registros.push({
      tiempo: new Date(timestampMs),
      prioridad,
      latitud,
      longitud,
      altitud,
      angulo,
      satelites,
      velocidad,
      io,
    });
  }

  const numData2 = buffer.readUInt8(offset); offset += 1;

  return { codecId, numData1, numData2, registros };
}

module.exports = { parseAvlData };
