const express = require('express');
const router = express.Router();
const pool = require('../db');

// Middleware opcional: algunos GPS devices tienen API key en lugar de JWT
const autenticarGPS = (req, res, next) => {
  const apiKey = req.headers['x-gps-api-key'] || req.query.api_key;

  if (!apiKey) {
    return res.status(401).json({ error: 'API key requerida' });
  }

  // En producción, verificar la API key contra BD
  // Por ahora, aceptar cualquier key válida
  if (apiKey.length < 5) {
    return res.status(401).json({ error: 'API key inválida' });
  }

  next();
};

// ===========================
// POST: Recibir actualización GPS de un dispositivo
// ===========================
router.post('/ubicacion', autenticarGPS, async (req, res) => {
  try {
    const { dispositivo_gps_id, lat, lng, velocidad, direccion, altitud, precision } = req.body;

    if (!dispositivo_gps_id || lat === undefined || lng === undefined) {
      return res.status(400).json({
        error: 'Faltan datos: dispositivo_gps_id, lat, lng'
      });
    }

    // Encontrar el vehículo por dispositivo GPS
    const vehiculo = await pool.query(
      `SELECT id, empresa_id, estado_id, velocidad_maxima_permitida, porcentaje_combustible
       FROM ubisafe.vehiculos
       WHERE dispositivo_gps_id = $1 AND activo = true`,
      [dispositivo_gps_id]
    );

    if (vehiculo.rows.length === 0) {
      return res.status(404).json({ error: 'Dispositivo GPS no encontrado' });
    }

    const veh = vehiculo.rows[0];
    const empresa_id = veh.empresa_id;
    const vehiculo_id = veh.id;
    const punto_gps = `POINT(${lng} ${lat})`; // PostGIS format

    // 1. Actualizar ubicación actual del vehículo
    await pool.query(
      `UPDATE ubisafe.vehiculos SET
        ubicacion_actual = ST_GeogFromText($1),
        velocidad_actual = $2,
        fecha_ultimo_reporte = CURRENT_TIMESTAMP,
        porcentaje_combustible = COALESCE($3, porcentaje_combustible)
       WHERE id = $4`,
      [punto_gps, velocidad, req.body.combustible_porcentaje, vehiculo_id]
    );

    // 2. Cambiar estado a "online"
    const estadoOnline = await pool.query(
      "SELECT id FROM ubisafe.estados_vehiculo WHERE codigo = 'online' LIMIT 1"
    );

    if (estadoOnline.rows.length > 0) {
      await pool.query(
        'UPDATE ubisafe.vehiculos SET estado_id = $1 WHERE id = $2',
        [estadoOnline.rows[0].id, vehiculo_id]
      );
    }

    // 3. ALERTAS: Verificar si hay exceso de velocidad
    const velocidadMaxima = veh.velocidad_maxima_permitida || 120;
    if (velocidad > velocidadMaxima) {
      // Crear alerta de speeding
      await pool.query(
        `INSERT INTO ubisafe.alertas (empresa_id, vehiculo_id, tipo_alerta_id, descripcion,
         ubicacion, velocidad, timestamp)
         SELECT $1, $2, id, $3, ST_GeogFromText($4), $5, CURRENT_TIMESTAMP
         FROM ubisafe.tipos_alerta
         WHERE codigo = 'speeding'
         ON CONFLICT DO NOTHING`,
        [empresa_id, vehiculo_id, `Exceso de velocidad: ${velocidad}km/h`, punto_gps, velocidad]
      );
    }

    // 4. ALERTAS: Verificar batería baja (si viene en el request)
    if (req.body.battery_percentage && req.body.battery_percentage < 10) {
      await pool.query(
        `INSERT INTO ubisafe.alertas (empresa_id, vehiculo_id, tipo_alerta_id, descripcion, timestamp)
         SELECT $1, $2, id, $3, CURRENT_TIMESTAMP
         FROM ubisafe.tipos_alerta
         WHERE codigo = 'battery_low'`,
        [empresa_id, vehiculo_id, `Batería baja: ${req.body.battery_percentage}%`]
      );
    }

    // 5. Si hay viaje en progreso, guardar punto de GPS para playback
    const viajeActivo = await pool.query(
      `SELECT id FROM ubisafe.viajes
       WHERE vehiculo_id = $1 AND estado = 'en_progreso'
       ORDER BY fecha_inicio DESC LIMIT 1`,
      [vehiculo_id]
    );

    if (viajeActivo.rows.length > 0) {
      const viaje_id = viajeActivo.rows[0].id;

      await pool.query(
        `INSERT INTO ubisafe.registros_gps
         (viaje_id, vehiculo_id, empresa_id, ubicacion, velocidad, direccion, altitud, precision, timestamp)
         VALUES ($1, $2, $3, ST_GeogFromText($4), $5, $6, $7, $8, CURRENT_TIMESTAMP)`,
        [viaje_id, vehiculo_id, empresa_id, punto_gps, velocidad, direccion, altitud, precision]
      );
    }

    // 6. Response exitosa
    return res.status(200).json({
      mensaje: 'Ubicación actualizada',
      vehiculo_id,
      timestamp: new Date().toISOString(),
      alertas: velocidad > velocidadMaxima ? ['speeding'] : [],
    });

  } catch (err) {
    console.error('Error en POST /gps/ubicacion:', err);
    return res.status(500).json({ error: 'Error al actualizar ubicación', details: err.message });
  }
});

// ===========================
// GET: Últimas ubicaciones recibidas (para debugging)
// ===========================
router.get('/ultimas', async (req, res) => {
  try {
    const ubicaciones = await pool.query(
      `SELECT v.id, v.placa, v.velocidad_actual,
              ST_AsGeoJSON(v.ubicacion_actual)::jsonb as ubicacion,
              v.fecha_ultimo_reporte, e.nombre as estado
       FROM ubisafe.vehiculos v
       LEFT JOIN ubisafe.estados_vehiculo e ON v.estado_id = e.id
       ORDER BY v.fecha_ultimo_reporte DESC
       LIMIT 50`
    );

    return res.json(ubicaciones.rows);
  } catch (err) {
    console.error('Error en GET /gps/ultimas:', err);
    return res.status(500).json({ error: 'Error al obtener ubicaciones', details: err.message });
  }
});

module.exports = router;
