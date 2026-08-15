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

    socket.on('data', (data) => this.handleData(socket, data, clientId));
    socket.on('end', () => this.handleDisconnect(clientId));
    socket.on('error', (err) => {
      console.error(`[Teltonika] Error en cliente ${clientId}:`, err.message);
    });
  }

  async handleData(socket, data, clientId) {
    try {
      // Teltonika avisa que está listo: envía 0x00 0x0F
      if (data.length === 2 && data[0] === 0x00 && data[1] === 0x0F) {
        console.log(`[Teltonika] IMEI request de ${clientId}`);
        // Responder con ACK
        socket.write(Buffer.from([0x00, 0x0F]));
        socket.imei_waiting = true;
        return;
      }

      // Si espera IMEI, leer los primeros 15 bytes (IMEI)
      if (socket.imei_waiting) {
        const imei = data.toString('utf8', 0, 15);
        console.log(`[Teltonika] IMEI recibido: ${imei}`);
        socket.imei = imei;
        socket.imei_waiting = false;

        // Responder con ACK (0x01)
        socket.write(Buffer.from([0x01]));
        return;
      }

      // Parsear datos GPS/GPRS
      if (socket.imei) {
        await this.parseGpsData(socket, data);
      }

    } catch (err) {
      console.error(`[Teltonika] Error procesando datos:`, err.message);
      socket.destroy();
      this.connections.delete(clientId);
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
