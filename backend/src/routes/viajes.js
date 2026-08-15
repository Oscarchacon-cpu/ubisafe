const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// ===========================
// GET: Listar viajes con filtros
// ===========================
router.get('/', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const { vehiculo_id, chofer_id, fecha_desde, fecha_hasta, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT v.id, v.vehiculo_id, v.chofer_id, v.fecha_inicio, v.fecha_fin,
             v.distancia_km, v.velocidad_promedio, v.velocidad_maxima,
             v.duracion_minutos, v.combustible_consumido, v.estado,
             ve.placa, c.nombre as chofer_nombre
      FROM ubisafe.viajes v
      LEFT JOIN ubisafe.vehiculos ve ON v.vehiculo_id = ve.id
      LEFT JOIN ubisafe.choferes c ON v.chofer_id = c.id
      WHERE v.empresa_id = $1
    `;

    const params = [empresa_id];

    if (vehiculo_id) {
      query += ` AND v.vehiculo_id = $${params.length + 1}`;
      params.push(vehiculo_id);
    }

    if (chofer_id) {
      query += ` AND v.chofer_id = $${params.length + 1}`;
      params.push(chofer_id);
    }

    if (fecha_desde) {
      query += ` AND v.fecha_inicio >= $${params.length + 1}`;
      params.push(fecha_desde);
    }

    if (fecha_hasta) {
      query += ` AND v.fecha_inicio <= $${params.length + 1}`;
      params.push(fecha_hasta);
    }

    query += ` ORDER BY v.fecha_inicio DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const viajes = await pool.query(query, params);

    return res.json({
      total: viajes.rows.length,
      viajes: viajes.rows,
    });
  } catch (err) {
    console.error('Error en GET /viajes:', err);
    return res.status(500).json({ error: 'Error al listar viajes', details: err.message });
  }
});

// ===========================
// GET: Obtener un viaje específico (con playback)
// ===========================
router.get('/:id', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const { id } = req.params;

    // Obtener datos del viaje
    const viaje = await pool.query(
      `SELECT v.*, ve.placa, c.nombre as chofer_nombre
       FROM ubisafe.viajes v
       LEFT JOIN ubisafe.vehiculos ve ON v.vehiculo_id = ve.id
       LEFT JOIN ubisafe.choferes c ON v.chofer_id = c.id
       WHERE v.id = $1 AND v.empresa_id = $2`,
      [id, empresa_id]
    );

    if (viaje.rows.length === 0) {
      return res.status(404).json({ error: 'Viaje no encontrado' });
    }

    // Obtener registros GPS para playback (ordenados por timestamp)
    const gps = await pool.query(
      `SELECT id, ST_AsGeoJSON(ubicacion)::jsonb as ubicacion, velocidad, direccion, timestamp
       FROM ubisafe.registros_gps
       WHERE viaje_id = $1
       ORDER BY timestamp ASC`,
      [id]
    );

    return res.json({
      viaje: viaje.rows[0],
      playback: gps.rows,
      total_puntos: gps.rows.length,
    });
  } catch (err) {
    console.error('Error en GET /viajes/:id:', err);
    return res.status(500).json({ error: 'Error al obtener viaje', details: err.message });
  }
});

// ===========================
// POST: Crear un nuevo viaje (inicio)
// ===========================
router.post('/', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const { vehiculo_id, chofer_id, ubicacion_inicio_wkt } = req.body;

    if (!vehiculo_id) {
      return res.status(400).json({ error: 'Falta vehiculo_id' });
    }

    // Verificar que el vehículo le pertenece
    const veh = await pool.query(
      'SELECT id FROM ubisafe.vehiculos WHERE id = $1 AND empresa_id = $2',
      [vehiculo_id, empresa_id]
    );

    if (veh.rows.length === 0) {
      return res.status(404).json({ error: 'Vehículo no encontrado' });
    }

    // Crear viaje
    let ubicacion_sql = 'NULL';
    let params = [empresa_id, vehiculo_id, chofer_id, 'en_progreso'];

    if (ubicacion_inicio_wkt) {
      ubicacion_sql = `ST_GeogFromText($5)`;
      params.push(ubicacion_inicio_wkt);
    }

    const nuevo = await pool.query(
      `INSERT INTO ubisafe.viajes (empresa_id, vehiculo_id, chofer_id, fecha_inicio, estado, ubicacion_inicio)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4, ${ubicacion_sql})
       RETURNING id, vehiculo_id, fecha_inicio, estado`,
      params
    );

    return res.status(201).json({
      mensaje: 'Viaje iniciado',
      viaje: nuevo.rows[0],
    });
  } catch (err) {
    console.error('Error en POST /viajes:', err);
    return res.status(500).json({ error: 'Error al crear viaje', details: err.message });
  }
});

// ===========================
// PUT: Finalizar un viaje
// ===========================
router.put('/:id/finalizar', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const { id } = req.params;
    const { ubicacion_fin_wkt, distancia_km, combustible_consumido } = req.body;

    // Verificar que le pertenece
    const viaje = await pool.query(
      'SELECT id, fecha_inicio FROM ubisafe.viajes WHERE id = $1 AND empresa_id = $2',
      [id, empresa_id]
    );

    if (viaje.rows.length === 0) {
      return res.status(404).json({ error: 'Viaje no encontrado' });
    }

    // Calcular duración
    const duracion_minutos = Math.round(
      (new Date() - new Date(viaje.rows[0].fecha_inicio)) / (1000 * 60)
    );

    // Finalizar viaje
    let ubicacion_sql = 'NULL';
    let params = [duracion_minutos, distancia_km, combustible_consumido, 'completado', id, empresa_id];

    if (ubicacion_fin_wkt) {
      ubicacion_sql = `ST_GeogFromText($7)`;
      params.push(ubicacion_fin_wkt);
    }

    const finalizado = await pool.query(
      `UPDATE ubisafe.viajes SET
        fecha_fin = CURRENT_TIMESTAMP,
        duracion_minutos = $1,
        distancia_km = $2,
        combustible_consumido = $3,
        estado = $4,
        ubicacion_fin = ${ubicacion_sql}
       WHERE id = $5 AND empresa_id = $6
       RETURNING id, estado, duracion_minutos, distancia_km`,
      params
    );

    return res.json({
      mensaje: 'Viaje finalizado',
      viaje: finalizado.rows[0],
    });
  } catch (err) {
    console.error('Error en PUT /viajes/:id/finalizar:', err);
    return res.status(500).json({ error: 'Error al finalizar viaje', details: err.message });
  }
});

module.exports = router;
