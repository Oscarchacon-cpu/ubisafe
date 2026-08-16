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
      // Suscribirse a topics de Teltonika
      // Formato: v1/{imei}/gps o similar
      this.client.subscribe('v1/+/gps', (err) => {
        if (err) console.error('[MQTT] Error suscribiendo a v1/+/gps:', err);
        else console.log('[MQTT] Suscrito a v1/+/gps');
      });
      // Alternativa para topic con IMEI al final
      this.client.subscribe('ubisafe/gps/+', (err) => {
        if (err) console.error('[MQTT] Error suscribiendo a ubisafe/gps/+:', err);
        else console.log('[MQTT] Suscrito a ubisafe/gps/+');
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
      console.error('[MQTT] Error:', err.message);
    });

    this.client.on('disconnect', () => {
      console.log('[MQTT] Desconectado del broker');
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
         SET ubicacion_actual = ST_Point($2, $1),
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
