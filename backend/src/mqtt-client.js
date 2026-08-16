const mqtt = require('mqtt');
const pool = require('./db');

class MQTTClient {
  constructor() {
    this.client = null;
    this.brokerUrl = process.env.MQTT_BROKER || 'mqtt://test.mosquitto.org:1883';
  }

  connect() {
    this.client = mqtt.connect(this.brokerUrl, {
      clientId: `ubisafe_${Date.now()}`,
      clean: true,
      connectTimeout: 4000,
      reconnectPeriod: 1000,
    });

    this.client.on('connect', () => {
      console.log('[MQTT] Conectado a broker:', this.brokerUrl);
      // Suscribirse a TODOS los topics para debug
      this.client.subscribe('#', (err) => {
        if (err) console.error('[MQTT] Error suscribiendo a #:', err);
        else console.log('[MQTT] Suscrito a todos los topics (#)');
      });
    });

    this.client.on('message', (topic, message) => {
      try {
        this.handleMessage(topic, message);
      } catch (err) {
        console.error('[MQTT] Error procesando mensaje:', err.message);
      }
    });

    this.client.on('error', (err) => {
      console.error('[MQTT] Error:', err);
      if (err.message) console.error('[MQTT] Message:', err.message);
      if (err.code) console.error('[MQTT] Code:', err.code);
    });

    this.client.on('disconnect', () => {
      console.log('[MQTT] Desconectado del broker');
    });

    this.client.on('offline', () => {
      console.log('[MQTT] Broker offline');
    });
  }

  async handleMessage(topic, message) {
    try {
      // Parsear mensaje como JSON
      const data = JSON.parse(message.toString());
      console.log(`[MQTT] Mensaje recibido en ${topic}:`, data);

      // Extraer IMEI del topic o del payload
      let imei = data.imei;
      if (!imei) {
        const topicParts = topic.split('/');
        imei = topicParts[1]; // Asumir formato v1/{imei}/gps
      }

      if (!imei) {
        console.warn('[MQTT] IMEI no encontrado en mensaje o topic');
        return;
      }

      const { lat, lng, speed, timestamp } = data;

      if (lat === undefined || lng === undefined) {
        console.warn('[MQTT] Coordenadas no encontradas en mensaje');
        return;
      }

      // Buscar vehículo por IMEI
      const vehicle = await pool.query(
        'SELECT id, empresa_id FROM ubisafe.vehiculos WHERE imei = $1',
        [imei]
      );

      if (vehicle.rows.length === 0) {
        console.warn(`[MQTT] Vehículo no encontrado con IMEI: ${imei}`);
        return;
      }

      const vehiculoId = vehicle.rows[0].id;
      const empresaId = vehicle.rows[0].empresa_id;

      // Actualizar ubicación en vehículos
      await pool.query(
        `UPDATE ubisafe.vehiculos
         SET ubicacion_actual = ST_SetSRID(ST_Point($2::numeric, $1::numeric), 4326),
             velocidad_actual = $3,
             fecha_ultimo_reporte = NOW()
         WHERE id = $4`,
        [lat, lng, speed || 0, vehiculoId]
      );

      console.log(`[MQTT] ✓ Actualizado vehículo ID ${vehiculoId} - Lat: ${lat}, Lng: ${lng}`);

      // Registrar en historial
      await pool.query(
        `INSERT INTO ubisafe.puntos_gps (vehiculo_id, empresa_id, latitud, longitud, velocidad, timestamp)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [vehiculoId, empresaId, lat, lng, speed || 0]
      );

    } catch (err) {
      console.error('[MQTT] Error en handleMessage:', err.message);
    }
  }

  disconnect() {
    if (this.client) {
      this.client.end();
      console.log('[MQTT] Desconexión iniciada');
    }
  }
}

module.exports = MQTTClient;
