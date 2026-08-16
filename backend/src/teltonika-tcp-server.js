const net = require('net');
const crc = require('crc');
const pool = require('./db');

class TeltonikaTCPServer {
  constructor(port = 6029) {
    this.port = port;
    this.server = null;
    this.connections = new Map();
  }

  start() {
    this.server = net.createServer((socket) => {
      this.handleConnection(socket);
    });

    this.server.listen(this.port, '0.0.0.0', () => {
      console.log(`[Teltonika TCP Server] Escuchando en puerto ${this.port}`);
    });

    this.server.on('error', (err) => {
      console.error(`[Teltonika TCP Server] Error:`, err);
    });
  }

  handleConnection(socket) {
    const clientId = socket.remoteAddress;
    this.connections.set(clientId, socket);
    console.log(`[Teltonika] Cliente conectado: ${clientId}`);

    // Keep-alive: enviar ping periódicamente para mantener conexión abierta
    const keepAliveInterval = setInterval(() => {
      if (socket.destroyed) {
        clearInterval(keepAliveInterval);
      }
    }, 30000);

    // DO NOT send handshake - just wait for device to send IMEI
    socket.imeiConfirmed = false;

    socket.on('data', (data) => this.handleData(socket, data, clientId));
    socket.on('end', () => {
      console.log(`[Teltonika] Conexión cerrada: ${clientId}`);
      clearInterval(keepAliveInterval);
      this.handleDisconnect(clientId);
    });
    socket.on('error', (err) => {
      console.error(`[Teltonika] Error en cliente ${clientId}:`, err.message);
      clearInterval(keepAliveInterval);
    });
  }

  async handleData(socket, data, clientId) {
    try {
      if (!socket.imeiConfirmed) {
        await this.handleIMEI(socket, data, clientId);
      } else {
        await this.handleGPSData(socket, data, clientId);
      }
    } catch (err) {
      console.error(`[Teltonika] Error procesando datos:`, err.message);
      socket.destroy();
      this.connections.delete(clientId);
    }
  }

  async handleIMEI(socket, data, clientId) {
    // Device sends: [0x00][0x0F] + [15-byte IMEI]
    if (data.length < 17) {
      console.log('[Teltonika] Paquete IMEI incompleto');
      return;
    }

    if (data[0] !== 0x00 || data[1] !== 0x0F) {
      console.error('[Teltonika] Encabezado IMEI inválido');
      socket.destroy();
      return;
    }

    const imei = data.slice(2, 17).toString('utf8').trim();
    console.log(`[Teltonika] IMEI recibido: ${imei} de ${clientId}`);

    // Validar IMEI en BD
    const isValid = await this.validateIMEI(imei);

    if (isValid) {
      socket.imei = imei;
      socket.imeiConfirmed = true;
      socket.write(Buffer.from([0x01])); // Accept
      console.log(`[Teltonika] ✓ IMEI aceptado: ${imei}`);
    } else {
      socket.write(Buffer.from([0x00])); // Reject
      socket.end();
      console.log(`[Teltonika] ✗ IMEI rechazado: ${imei}`);
    }
  }

  async handleGPSData(socket, data, clientId) {
    if (data.length < 12) {
      console.log('[Teltonika] Frame GPS incompleto');
      return;
    }

    // Check preamble
    const preamble = data.readUInt32BE(0);
    if (preamble !== 0x00000000) {
      console.error('[Teltonika] Preamble inválido');
      socket.write(Buffer.from([0, 0, 0, 0]));
      return;
    }

    // Read data length
    const dataLength = data.readUInt32BE(4);
    const totalExpectedLength = dataLength + 12;

    if (data.length < totalExpectedLength) {
      console.log(`[Teltonika] Frame incompleto: ${data.length}/${totalExpectedLength} bytes`);
      return;
    }

    // CRITICAL: Validate CRC16/IBM
    const crcBytes = data.slice(-4);
    const expectedCrc = crcBytes.readUInt32BE(0);
    const payload = data.slice(4, data.length - 4);
    const calculatedCrc = crc.crc16(payload);

    if (expectedCrc !== calculatedCrc) {
      console.error(`[Teltonika] CRC mismatch! ${expectedCrc} vs ${calculatedCrc}`);
      socket.write(Buffer.from([0, 0, 0, 0]));
      return;
    }

    // Parse Codec 8
    const codecId = data[8];
    const numRecords = data[9];

    if (codecId !== 0x08) {
      console.error(`[Teltonika] Codec no soportado: 0x${codecId.toString(16)}`);
      return;
    }

    console.log(`[Teltonika] ✓ Frame Codec 8: ${numRecords} registros`);

    let offset = 10;
    for (let i = 0; i < numRecords; i++) {
      if (offset + 34 > data.length) break;

      try {
        const timestamp = Number(data.readBigUInt64BE(offset)) / 1000;
        offset += 8;

        offset += 1; // Skip priority

        const longitude = data.readInt32BE(offset) / 10000000;
        offset += 4;

        const latitude = data.readInt32BE(offset) / 10000000;
        offset += 4;

        const altitude = data.readInt16BE(offset);
        offset += 2;

        offset += 2; // Skip angle

        offset += 1; // Skip satellites

        const speed = data.readUInt16BE(offset);
        offset += 2;

        console.log(`[Teltonika] ✓ Record ${i+1}: Lat=${latitude.toFixed(6)}, Lon=${longitude.toFixed(6)}, Speed=${speed}km/h`);

        await this.updateVehicleLocation(socket.imei, latitude, longitude, speed, altitude, timestamp);

        const ioSize = data.readUInt16BE(offset);
        offset += 2 + ioSize;
      } catch (e) {
        console.error(`[Teltonika] Error record ${i}:`, e.message);
      }
    }

    // Send ACK: record count
    const ackBuffer = Buffer.alloc(4);
    ackBuffer.writeUInt32BE(numRecords, 0);
    socket.write(ackBuffer);
    console.log(`[Teltonika] ACK: ${numRecords} registros`);
  }

  async validateIMEI(imei) {
    try {
      const result = await pool.query(
        'SELECT id FROM ubisafe.vehiculos WHERE imei = $1 LIMIT 1',
        [imei]
      );
      return result.rows.length > 0;
    } catch (err) {
      console.error(`[Teltonika] Error validando IMEI:`, err.message);
      return false;
    }
  }

  async parseCodec8Data(socket, data, numRecords) {
    try {
      // Codec 8 frame: [4-byte length][1-byte codec][1-byte num_records][data...][1-byte num_records_duplicate]
      if (data.length < 6) return;

      const frameLength = data.readUInt32BE(0);
      const codecId = data[4];

      if (codecId !== 0x08) {
        console.warn(`[Teltonika] Codec ${codecId} no soportado (esperado 0x08)`);
        return;
      }

      // Parse AVL records
      let offset = 6; // Después de header
      for (let i = 0; i < numRecords; i++) {
        if (offset + 34 > data.length) break; // Mínimo 34 bytes por record

        try {
          const timestamp = data.readBigUInt64BE(offset);
          offset += 8;

          const latitude = data.readInt32BE(offset) / 10000000;
          offset += 4;

          const longitude = data.readInt32BE(offset) / 10000000;
          offset += 4;

          const altitude = data.readInt16BE(offset);
          offset += 2;

          const angle = data.readInt16BE(offset);
          offset += 2;

          const speed = data.readUInt16BE(offset);
          offset += 2;

          // Skip IO data
          const ioDataLength = data.readUInt16BE(offset);
          offset += 2 + ioDataLength;

          console.log(`[Teltonika] ✓ GPS Record ${i+1}: Lat=${latitude.toFixed(6)}, Lon=${longitude.toFixed(6)}, Speed=${speed} km/h`);

          // Update database
          await this.updateVehicleLocation(socket.imei, latitude, longitude, speed, altitude);
        } catch (e) {
          console.error(`[Teltonika] Error parsing record ${i}:`, e.message);
        }
      }
    } catch (err) {
      console.error(`[Teltonika] Error en parseCodec8Data:`, err.message);
    }
  }

  async updateVehicleLocation(imei, latitude, longitude, speed, altitude, timestamp) {
    try {
      const vehicle = await pool.query(
        'SELECT id, empresa_id FROM ubisafe.vehiculos WHERE imei = $1',
        [imei]
      );

      if (vehicle.rows.length === 0) {
        console.warn(`[Teltonika] Vehículo no encontrado: ${imei}`);
        return;
      }

      const { id: vehicleId, empresa_id: empresaId } = vehicle.rows[0];

      await pool.query(
        `UPDATE ubisafe.vehiculos
         SET ubicacion_actual = ST_Point($1, $2),
             velocidad_actual = $3,
             fecha_ultimo_reporte = NOW()
         WHERE id = $4`,
        [longitude, latitude, speed, vehicleId]
      );

      const ts = timestamp ? new Date(timestamp) : new Date();
      await pool.query(
        `INSERT INTO ubisafe.puntos_gps (vehiculo_id, empresa_id, latitud, longitud, velocidad, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [vehicleId, empresaId, latitude, longitude, speed, ts]
      );

      console.log(`[Teltonika] ✓ Vehículo ${imei} actualizado: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
    } catch (err) {
      console.error(`[Teltonika] Error actualizando BD:`, err.message);
    }
  }

  async parseGpsData(socket, data) {
    try {
      // Formato Teltonika simple: reconocer estructura de datos
      // Generalmente incluye: latitude, longitude, speed, timestamp

      // Para versión simplificada, buscar datos en el buffer
      // Estructura típica: 4 bytes latitude, 4 bytes longitude, 2 bytes speed, etc.

      if (data.length < 12) return; // Datos insuficientes

      // Parsear coordenadas (formato de punto flotante)
      const latitude = data.readFloatBE(0);
      const longitude = data.readFloatBE(4);
      const speed = data.readUInt16BE(8);

      console.log(`[Teltonika] Datos GPS - IMEI: ${socket.imei}, Lat: ${latitude}, Lng: ${longitude}, Speed: ${speed}`);

      // Buscar vehículo por IMEI
      const vehicle = await pool.query(
        'SELECT id, empresa_id FROM ubisafe.vehiculos WHERE imei = $1',
        [socket.imei]
      );

      if (vehicle.rows.length === 0) {
        console.warn(`[Teltonika] Vehículo no encontrado con IMEI: ${socket.imei}`);
        return;
      }

      const vehiculoId = vehicle.rows[0].id;
      const empresaId = vehicle.rows[0].empresa_id;

      // Actualizar ubicación en vehículos
      await pool.query(
        `UPDATE ubisafe.vehiculos
         SET ubicacion_actual = ST_Point($2, $1),
             velocidad_actual = $3,
             fecha_ultimo_reporte = NOW()
         WHERE id = $4`,
        [latitude, longitude, speed || 0, vehiculoId]
      );

      console.log(`[Teltonika] ✓ Actualizado vehículo ID ${vehiculoId}`);

      // Registrar en historial
      await pool.query(
        `INSERT INTO ubisafe.puntos_gps (vehiculo_id, empresa_id, latitud, longitud, velocidad, timestamp)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [vehiculoId, empresaId, latitude, longitude, speed || 0]
      );

      // Enviar ACK al Teltonika (0x00 0x00 0x00 0x01)
      socket.write(Buffer.from([0x00, 0x00, 0x00, 0x01]));

    } catch (err) {
      console.error(`[Teltonika] Error en parseGpsData:`, err);
    }
  }

  handleDisconnect(clientId) {
    this.connections.delete(clientId);
    console.log(`[Teltonika] Cliente desconectado: ${clientId}`);
  }

  stop() {
    if (this.server) {
      this.server.close(() => {
        console.log(`[Teltonika TCP Server] Servidor detenido`);
      });
    }
  }
}

module.exports = TeltonikaTCPServer;
