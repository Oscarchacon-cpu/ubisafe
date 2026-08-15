const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// ===========================
// GET: Listar alertas (con filtros)
// ===========================
router.get('/', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const { resuelto, tipo, vehiculo_id, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT a.id, a.vehiculo_id, v.placa, a.tipo_alerta_id, ta.nombre as tipo_nombre,
             ta.codigo as tipo_alerta_codigo, ta.severidad, a.descripcion, a.timestamp, a.resuelto,
             a.ubicacion, a.velocidad, a.temperatura_motor
      FROM ubisafe.alertas a
      LEFT JOIN ubisafe.vehiculos v ON a.vehiculo_id = v.id
      LEFT JOIN ubisafe.tipos_alerta ta ON a.tipo_alerta_id = ta.id
      WHERE a.empresa_id = $1
    `;

    const params = [empresa_id];

    // Filtros opcionales
    if (resuelto !== undefined) {
      query += ` AND a.resuelto = $${params.length + 1}`;
      params.push(resuelto === 'true');
    }

    if (tipo) {
      query += ` AND ta.codigo = $${params.length + 1}`;
      params.push(tipo);
    }

    if (vehiculo_id) {
      query += ` AND a.vehiculo_id = $${params.length + 1}`;
      params.push(vehiculo_id);
    }

    query += ` ORDER BY a.timestamp DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const alertas = await pool.query(query, params);

    return res.json({
      total: alertas.rows.length,
      alertas: alertas.rows,
    });
  } catch (err) {
    console.error('Error en GET /alertas:', err);
    return res.status(500).json({ error: 'Error al listar alertas', details: err.message });
  }
});

// ===========================
// GET: Obtener una alerta específica
// ===========================
router.get('/:id', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const { id } = req.params;

    const alerta = await pool.query(
      `SELECT a.*, ta.nombre as tipo_nombre, ta.severidad, v.placa
       FROM ubisafe.alertas a
       LEFT JOIN ubisafe.tipos_alerta ta ON a.tipo_alerta_id = ta.id
       LEFT JOIN ubisafe.vehiculos v ON a.vehiculo_id = v.id
       WHERE a.id = $1 AND a.empresa_id = $2`,
      [id, empresa_id]
    );

    if (alerta.rows.length === 0) {
      return res.status(404).json({ error: 'Alerta no encontrada' });
    }

    return res.json(alerta.rows[0]);
  } catch (err) {
    console.error('Error en GET /alertas/:id:', err);
    return res.status(500).json({ error: 'Error al obtener alerta', details: err.message });
  }
});

// ===========================
// PUT: Resolver una alerta
// ===========================
router.put('/:id/resolver', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const usuario_id = req.user.id;
    const { id } = req.params;
    const { accion_tomada } = req.body;

    // Verificar que la alerta le pertenece
    const alerta = await pool.query(
      'SELECT id FROM ubisafe.alertas WHERE id = $1 AND empresa_id = $2',
      [id, empresa_id]
    );

    if (alerta.rows.length === 0) {
      return res.status(404).json({ error: 'Alerta no encontrada' });
    }

    // Resolver la alerta
    const resuelta = await pool.query(
      `UPDATE ubisafe.alertas SET
        resuelto = true,
        resuelto_por_usuario = $1,
        fecha_resolucion = CURRENT_TIMESTAMP,
        accion_tomada = COALESCE($2, accion_tomada),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND empresa_id = $4
       RETURNING id, resuelto, fecha_resolucion`,
      [usuario_id, accion_tomada, id, empresa_id]
    );

    return res.json({
      mensaje: 'Alerta resuelta',
      alerta: resuelta.rows[0],
    });
  } catch (err) {
    console.error('Error en PUT /alertas/:id/resolver:', err);
    return res.status(500).json({ error: 'Error al resolver alerta', details: err.message });
  }
});

// ===========================
// POST: Crear alerta manualmente (ej: desde GPS device o sistema)
// ===========================
router.post('/', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const {
      vehiculo_id,
      tipo_alerta_id,
      descripcion,
      ubicacion_wkt,
      velocidad,
      temperatura_motor,
    } = req.body;

    if (!vehiculo_id || !tipo_alerta_id) {
      return res.status(400).json({ error: 'Faltan datos: vehiculo_id, tipo_alerta_id' });
    }

    // Convertir WKT a geography si existe
    let ubicacion_sql = 'NULL';
    let ubicacion_params = [];
    if (ubicacion_wkt) {
      ubicacion_sql = `ST_GeogFromText($${1})`;
      ubicacion_params = [ubicacion_wkt];
    }

    const nueva = await pool.query(
      `INSERT INTO ubisafe.alertas (
        empresa_id, vehiculo_id, tipo_alerta_id, descripcion,
        ubicacion, velocidad, temperatura_motor
      ) VALUES ($1, $2, $3, $4, ${ubicacion_sql}, $5, $6)
       RETURNING id, vehiculo_id, tipo_alerta_id, timestamp`,
      [empresa_id, vehiculo_id, tipo_alerta_id, descripcion, ...ubicacion_params, velocidad, temperatura_motor]
    );

    return res.status(201).json({
      mensaje: 'Alerta creada',
      alerta: nueva.rows[0],
    });
  } catch (err) {
    console.error('Error en POST /alertas:', err);
    return res.status(500).json({ error: 'Error al crear alerta', details: err.message });
  }
});

// ===========================
// GET: Alertas sin resolver (dashboard)
// ===========================
router.get('/sin-resolver/todas', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;

    const alertas = await pool.query(
      `SELECT a.id, a.vehiculo_id, v.placa, ta.nombre, ta.codigo as tipo_alerta_codigo,
              ta.severidad, a.descripcion, a.timestamp
       FROM ubisafe.alertas a
       LEFT JOIN ubisafe.vehiculos v ON a.vehiculo_id = v.id
       LEFT JOIN ubisafe.tipos_alerta ta ON a.tipo_alerta_id = ta.id
       WHERE a.empresa_id = $1 AND a.resuelto = false
       ORDER BY ta.severidad DESC, a.timestamp DESC
       LIMIT 100`,
      [empresa_id]
    );

    return res.json({
      total: alertas.rows.length,
      alertas: alertas.rows,
    });
  } catch (err) {
    console.error('Error en GET /alertas/sin-resolver/todas:', err);
    return res.status(500).json({ error: 'Error al listar alertas', details: err.message });
  }
});

module.exports = router;
