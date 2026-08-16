const net = require('net');
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

    // Enviar handshake IMEI al dispositivo (protocolo Teltonika)
    socket.write(Buffer.from([0x00, 0x0F]));
    socket.imei_waiting = true;

    socket.on('data', (data) => this.handleData(socket, data, clientId));
    socket.on('end', () => {
      console.log(`[Teltonika] FIN de conexión (end event): ${clientId}`);
      clearInterval(keepAliveInterval);
      this.handleDisconnect(clientId);
    });
    socket.on('close', () => {
      console.log(`[Teltonika] Conexión cerrada: ${clientId}`);
      clearInterval(keepAliveInterval);
    });
    socket.on('error', (err) => {
      console.error(`[Teltonika] Error en cliente ${clientId}:`, err.message);
      clearInterval(keepAliveInterval);
    });
  }

  async handleData(socket, data, clientId) {
    try {
      // Si espera IMEI (primeros 15 bytes después del handshake)
      if (socket.imei_waiting) {
        // Parse IMEI: 2-byte length + IMEI as ASCII
        const imeiLength = data.readUInt16BE(0);
        const imei = data.slice(2, 2 + imeiLength).toString('utf8').trim();
        console.log(`[Teltonika] IMEI recibido: ${imei} (${imeiLength} bytes) de ${clientId}`);
        socket.imei = imei;
        socket.imei_waiting = false;

        // Responder con SINGLE BYTE 0x01 (accept)
        socket.write(Buffer.from([0x01]));
        console.log(`[Teltonika] IMEI ACK (1 byte) enviado. Esperando Codec 8 data...`);
        return;
      }

      // Parsear datos Codec 8
      if (socket.imei) {
        if (data.length >= 6) {
          const frameLength = data.readUInt32BE(0);
          const codecId = data[4];
          const numRecords = data[5];

          console.log(`[Teltonika] Codec ${codecId} frame recibido: ${numRecords} registros (${frameLength} bytes)`);

          // Parsear datos GPS
          await this.parseCodec8Data(socket, data, numRecords);

          // Responder con 4-byte record count (CRITICAL!)
          const response = Buffer.alloc(4);
          response.writeUInt32BE(numRecords, 0);
          socket.write(response);
          console.log(`[Teltonika] Enviado ACK de ${numRecords} registros`);
        }
      }

    } catch (err) {
      console.error(`[Teltonika] Error procesando datos:`, err.message);
      socket.destroy();
      this.connections.delete(clientId);
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

  async updateVehicleLocation(imei, latitude, longitude, speed, altitude) {
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

      await pool.query(
        `INSERT INTO ubisafe.puntos_gps (vehiculo_id, empresa_id, latitud, longitud, velocidad, timestamp)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [vehicleId, empresaId, latitude, longitude, speed]
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
