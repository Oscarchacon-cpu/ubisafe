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
// Soporta: GPS + Telemetría + ID Card Reader + Botones
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
      `SELECT id, empresa_id, estado_id, velocidad_maxima_permitida,
              porcentaje_combustible, capacidad_tanque_litros, tipo_sensor_combustible
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

    // TELEMETRÍA: Calcular porcentaje de combustible
    let porcentaje_combustible = req.body.combustible_porcentaje;
    let combustible_litros = req.body.combustible_litros;

    if (combustible_litros && veh.capacidad_tanque_litros) {
      porcentaje_combustible = Math.round((combustible_litros / veh.capacidad_tanque_litros) * 100);
    }

    const rpm = req.body.rpm || null;
    const temperatura_motor = req.body.temperatura_motor || null;
    const bateria_porcentaje = req.body.battery_percentage || null;

    // 1. Actualizar ubicación actual del vehículo
    await pool.query(
      `UPDATE ubisafe.vehiculos SET
        ubicacion_actual = ST_GeomFromText($1, 4326),
        velocidad_actual = $2,
        fecha_ultimo_reporte = CURRENT_TIMESTAMP,
        porcentaje_combustible = COALESCE($3, porcentaje_combustible),
        combustible_litros = COALESCE($4, combustible_litros),
        rpm = COALESCE($5, rpm),
        temperatura_motor = COALESCE($6, temperatura_motor)
       WHERE id = $7`,
      [punto_gps, velocidad, porcentaje_combustible, combustible_litros, rpm, temperatura_motor, vehiculo_id]
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

    // Verificar viaje activo (necesitamos esto antes para el conductor)
    const viajeActivo = await pool.query(
      `SELECT id, chofer_id FROM ubisafe.viajes
       WHERE vehiculo_id = $1 AND estado = 'en_progreso'
       ORDER BY fecha_inicio DESC LIMIT 1`,
      [vehiculo_id]
    );

    // 3. ALERTAS: Verificar si hay exceso de velocidad
    const velocidadMaxima = veh.velocidad_maxima_permitida || 120;
    if (velocidad > velocidadMaxima) {
      await pool.query(
        `INSERT INTO ubisafe.alertas (empresa_id, vehiculo_id, tipo_alerta_id, descripcion,
         ubicacion, velocidad, timestamp)
         SELECT $1, $2, id, $3, ST_GeomFromText($4, 4326), $5, CURRENT_TIMESTAMP
         FROM ubisafe.tipos_alerta
         WHERE codigo = 'speeding'
         ON CONFLICT DO NOTHING`,
        [empresa_id, vehiculo_id, `Exceso de velocidad: ${velocidad}km/h`, punto_gps, velocidad]
      );
    }

    // 4. ALERTAS: Verificar batería baja
    if (bateria_porcentaje && bateria_porcentaje < 10) {
      await pool.query(
        `INSERT INTO ubisafe.alertas (empresa_id, vehiculo_id, tipo_alerta_id, descripcion, timestamp)
         SELECT $1, $2, id, $3, CURRENT_TIMESTAMP
         FROM ubisafe.tipos_alerta
         WHERE codigo = 'battery_low'`,
        [empresa_id, vehiculo_id, `Batería baja: ${bateria_porcentaje}%`]
      );
    }

    // 5. ALERTAS: Verificar combustible bajo
    if (porcentaje_combustible && porcentaje_combustible < 15) {
      await pool.query(
        `INSERT INTO ubisafe.alertas (empresa_id, vehiculo_id, tipo_alerta_id, descripcion, timestamp)
         SELECT $1, $2, id, $3, CURRENT_TIMESTAMP
         FROM ubisafe.tipos_alerta
         WHERE codigo = 'combustible_bajo'`,
        [empresa_id, vehiculo_id, `Combustible bajo: ${porcentaje_combustible}%`]
      );
    }

    // 6. ALERTA CRÍTICA: Vehículo en movimiento sin conductor identificado
    if (velocidad > 5 && viajeActivo.rows.length > 0 && !viajeActivo.rows[0].chofer_id) {
      await pool.query(
        `INSERT INTO ubisafe.alertas (empresa_id, vehiculo_id, tipo_alerta_id, descripcion, timestamp)
         SELECT $1, $2, id, $3, CURRENT_TIMESTAMP
         FROM ubisafe.tipos_alerta
         WHERE codigo = 'sin_conductor'
         ON CONFLICT DO NOTHING`,
        [empresa_id, vehiculo_id, `ALERTA CRÍTICA: Vehículo en movimiento sin conductor identificado`]
      );
    }

    // 6. Procesar LECTOR DE TARJETA ID (si viene)
    let conductor_identificado = false;
    if (req.body.id_card_number) {
      try {
        const tarjeta = await pool.query(
          `SELECT chofer_id FROM ubisafe.lectores_tarjeta_mapeo
           WHERE numero_tarjeta = $1 AND empresa_id = $2 AND activo = true`,
          [req.body.id_card_number, empresa_id]
        );

        if (tarjeta.rows.length > 0) {
          const chofer_id = tarjeta.rows[0].chofer_id;
          conductor_identificado = true;

          // Actualizar chofer_id en viaje actual
          if (viajeActivo.rows.length > 0) {
            await pool.query(
              `UPDATE ubisafe.viajes SET chofer_id = $1 WHERE id = $2`,
              [chofer_id, viajeActivo.rows[0].id]
            );
          }

          await pool.query(
            `INSERT INTO ubisafe.eventos_dispositivo
             (empresa_id, vehiculo_id, dispositivo_gps_id, tipo_evento, datos_evento, timestamp)
             VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
            [empresa_id, vehiculo_id, dispositivo_gps_id, 'id_card_leida',
             JSON.stringify({tarjeta_id: req.body.id_card_number, chofer_id})]
          );
        }
      } catch (err) {
        console.warn('Warning: No se pudo procesar tarjeta ID:', err.message);
      }
    }

    // 7. Procesar EVENTOS DE BOTÓN (si vienen)
    if (req.body.boton_evento) {
      try {
        await pool.query(
          `INSERT INTO ubisafe.eventos_dispositivo
           (empresa_id, vehiculo_id, dispositivo_gps_id, tipo_evento, datos_evento, timestamp)
           VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
          [empresa_id, vehiculo_id, dispositivo_gps_id, 'boton_' + req.body.boton_evento,
           JSON.stringify({boton: req.body.boton_evento, duracion_ms: req.body.boton_duracion})]
        );
      } catch (err) {
        console.warn('Warning: No se pudo procesar evento botón:', err.message);
      }
    }

    // 8. Si hay viaje en progreso, guardar punto de GPS para playback

    if (viajeActivo.rows.length > 0) {
      const viaje_id = viajeActivo.rows[0].id;

      await pool.query(
        `INSERT INTO ubisafe.registros_gps
         (viaje_id, vehiculo_id, empresa_id, ubicacion, velocidad, direccion, altitud, precision,
          combustible_litros, temperatura_motor, rpm, bateria_porcentaje, timestamp)
         VALUES ($1, $2, $3, ST_GeomFromText($4, 4326), $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)`,
        [viaje_id, vehiculo_id, empresa_id, punto_gps, velocidad, direccion, altitud, precision,
         combustible_litros, temperatura_motor, rpm, bateria_porcentaje]
      );
    }

    // 9. Response exitosa
    return res.status(200).json({
      mensaje: 'Ubicación y telemetría actualizada',
      vehiculo_id,
      timestamp: new Date().toISOString(),
      telemetria: {
        velocidad,
        combustible_porcentaje: porcentaje_combustible,
        combustible_litros,
        rpm,
        temperatura_motor,
        bateria: bateria_porcentaje
      },
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
