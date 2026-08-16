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

    socket.imeiConfirmed = false;
    socket.buffer = Buffer.alloc(0);

    socket.on('data', (data) => this.handleData(socket, data, clientId));
    socket.on('end', () => {
      console.log(`[Teltonika] Conexión cerrada: ${clientId}`);
      this.handleDisconnect(clientId);
    });
    socket.on('error', (err) => {
      console.error(`[Teltonika] Error en cliente ${clientId}:`, err.message);
    });
  }

  async handleData(socket, data, clientId) {
    try {
      socket.buffer = Buffer.concat([socket.buffer, data]);

      if (!socket.imeiConfirmed) {
        if (socket.buffer.length >= 17) {
          await this.handleIMEI(socket, clientId);
        }
      } else {
        await this.handleGPSData(socket, clientId);
      }
    } catch (err) {
      console.error(`[Teltonika] Error procesando datos:`, err.message);
      socket.destroy();
      this.connections.delete(clientId);
    }
  }

  async handleIMEI(socket, clientId) {
    const data = socket.buffer.slice(0, 17);

    if (data[0] !== 0x00 || data[1] !== 0x0F) {
      console.error('[Teltonika] Encabezado IMEI inválido');
      socket.destroy();
      return;
    }

    const imei = data.slice(2, 17).toString('utf8').trim();
    console.log(`[Teltonika] IMEI recibido: ${imei}`);

    const isValid = await this.validateIMEI(imei);

    if (isValid) {
      socket.imei = imei;
      socket.imeiConfirmed = true;
      socket.buffer = socket.buffer.slice(17);
      socket.write(Buffer.from([0x01]));
      console.log(`[Teltonika] ✓ IMEI aceptado: ${imei}`);
    } else {
      socket.write(Buffer.from([0x00]));
      socket.end();
      console.log(`[Teltonika] ✗ IMEI rechazado: ${imei}`);
    }
  }

  async handleGPSData(socket, clientId) {
    const { Parser, Codec, Protocol } = require('teltonika-codec-parser');

    while (socket.buffer.length >= 12) {
      const preamble = socket.buffer.readUInt32BE(0);
      if (preamble !== 0x00000000) {
        socket.buffer = socket.buffer.slice(1);
        continue;
      }

      const dataLength = socket.buffer.readUInt32BE(4);
      const frameSize = 8 + dataLength + 4;

      if (socket.buffer.length < frameSize) break;

      try {
        const frame = socket.buffer.slice(0, frameSize);
        const result = new Parser(Codec.C8E, Protocol.TCP, frame);

        if (result.avl && Array.isArray(result.avl)) {
          for (const record of result.avl) {
            await this.updateVehicleLocation(
              socket.imei,
              record.latitude,
              record.longitude,
              record.speed || 0,
              record.altitude || 0,
              record.timestamp
            );
            console.log(`[Teltonika] ✓ GPS: Lat=${record.latitude.toFixed(6)}, Lon=${record.longitude.toFixed(6)}, Speed=${record.speed}km/h`);
          }
        }

        const ackBuffer = Buffer.alloc(4);
        ackBuffer.writeUInt32BE(result.avl?.length || 1, 0);
        socket.write(ackBuffer);
      } catch (err) {
        console.error(`[Teltonika] Error decodificando frame:`, err.message);
      }

      socket.buffer = socket.buffer.slice(frameSize);
    }
  }

  async validateIMEI(imei) {
    try {
      console.log(`[Teltonika] DEBUG: Validando IMEI "${imei}" (type: ${typeof imei}, length: ${imei.length})`);
      const result = await pool.query(
        'SELECT id FROM ubisafe.vehiculos WHERE imei = $1 LIMIT 1',
        [imei]
      );
      console.log(`[Teltonika] DEBUG: Query result rows: ${result.rows.length}`);
      if (result.rows.length > 0) {
        console.log(`[Teltonika] DEBUG: IMEI encontrado en BD`);
        return true;
      }
      console.log(`[Teltonika] DEBUG: IMEI NO encontrado en BD`);
      return false;
    } catch (err) {
      console.error(`[Teltonika] Error validando IMEI:`, err.message, err.code, err.toString());
      return false;
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

      console.log(`[Teltonika] ✓ Vehículo ${imei} actualizado`);
    } catch (err) {
      console.error(`[Teltonika] Error actualizando BD:`, err.message);
    }
  }

  handleDisconnect(clientId) {
    this.connections.delete(clientId);
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
