const express = require('express');
const router = express.Router();
const pool = require('../db');

// ===========================
// POST: Recibir datos de Teltonika FMB130
// ===========================
router.post('/gps-update', async (req, res) => {
  try {
    const { imei, lat, lng, speed, timestamp, rfid } = req.body;

    // 1. Encontrar vehículo por IMEI (debe estar configurado en DB)
    const vehiculo = await pool.query(
      'SELECT id, empresa_id FROM ubisafe.vehiculos WHERE imei = $1',
      [imei]
    );

    if (vehiculo.rows.length === 0) {
      return res.status(404).json({ error: 'Vehículo no encontrado' });
    }

    const vehiculoId = vehiculo.rows[0].id;
    const empresaId = vehiculo.rows[0].empresa_id;

    // 2. Si hay RFID (tarjeta conductor), buscar el conductor
    let conductorId = null;
    if (rfid) {
      const conductor = await pool.query(
        'SELECT id FROM ubisafe.choferes WHERE tarjeta_rfid = $1 AND empresa_id = $2',
        [rfid, empresaId]
      );
      if (conductor.rows.length > 0) {
        conductorId = conductor.rows[0].id;
      }
    }

    // 3. Actualizar ubicación y velocidad del vehículo
    await pool.query(
      `UPDATE ubisafe.vehiculos
       SET ubicacion_actual = ST_SetSRID(ST_Point($2::numeric, $1::numeric), 4326),
           velocidad_actual = $3,
           fecha_ultimo_reporte = NOW()
       WHERE id = $4`,
      [lat, lng, speed || 0, vehiculoId]
    );

    // 4. Si hay conductor identificado, actualizar asignación
    if (conductorId) {
      // Verificar si hay asignación activa
      const asignacionActiva = await pool.query(
        'SELECT id FROM ubisafe.asignaciones_vehiculo_chofer WHERE vehiculo_id = $1 AND activo = true',
        [vehiculoId]
      );

      if (asignacionActiva.rows.length === 0) {
        // Crear nueva asignación
        await pool.query(
          `INSERT INTO ubisafe.asignaciones_vehiculo_chofer
           (vehiculo_id, chofer_id, empresa_id, fecha_inicio, activo)
           VALUES ($1, $2, $3, NOW(), true)`,
          [vehiculoId, conductorId, empresaId]
        );
      } else {
        // Actualizar asignación existente
        await pool.query(
          `UPDATE ubisafe.asignaciones_vehiculo_chofer
           SET chofer_id = $1, fecha_inicio = NOW()
           WHERE id = $2`,
          [conductorId, asignacionActiva.rows[0].id]
        );
      }

      // Registrar escaneo de tarjeta
      await pool.query(
        `INSERT INTO ubisafe.eventos_identifi­cacion
         (vehiculo_id, chofer_id, empresa_id, tipo_evento, timestamp)
         VALUES ($1, $2, $3, 'escaneo_tarjeta', NOW())`,
        [vehiculoId, conductorId, empresaId]
      );
    }

    // 5. Registrar punto GPS para historial
    await pool.query(
      `INSERT INTO ubisafe.puntos_gps
       (vehiculo_id, empresa_id, latitud, longitud, velocidad, timestamp)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [vehiculoId, empresaId, lat, lng, speed || 0]
    );

    return res.json({
      success: true,
      message: 'Datos recibidos',
      vehiculoId,
      conductorId: conductorId || null
    });

  } catch (err) {
    console.error('Error en POST /teltonika/gps-update:', err);
    return res.status(500).json({ error: 'Error al procesar datos', details: err.message });
  }
});

// ===========================
// GET: Últimas coordenadas de vehículo
// ===========================
router.get('/ultima-ubicacion/:vehiculoId', async (req, res) => {
  try {
    const { vehiculoId } = req.params;

    const ubicacion = await pool.query(
      `SELECT v.id, v.placa,
              ST_Y(v.ubicacion_actual) as lat,
              ST_X(v.ubicacion_actual) as lng,
              v.velocidad_actual,
              v.fecha_ultimo_reporte,
              c.nombre as conductor
       FROM ubisafe.vehiculos v
       LEFT JOIN ubisafe.asignaciones_vehiculo_chofer avc ON v.id = avc.vehiculo_id AND avc.activo = true
       LEFT JOIN ubisafe.choferes c ON avc.chofer_id = c.id
       WHERE v.id = $1`,
      [vehiculoId]
    );

    if (ubicacion.rows.length === 0) {
      return res.status(404).json({ error: 'Vehículo no encontrado' });
    }

    return res.json(ubicacion.rows[0]);

  } catch (err) {
    console.error('Error en GET /teltonika/ultima-ubicacion:', err);
    return res.status(500).json({ error: 'Error al obtener ubicación' });
  }
});

module.exports = router;
