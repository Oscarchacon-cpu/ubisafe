const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// ===========================
// GET: Listar geovallas
// ===========================
router.get('/', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;

    const geovallas = await pool.query(
      `SELECT id, nombre, descripcion, tipo, ST_AsGeoJSON(geometria)::jsonb as geometria,
              radio_metros, alertar_entrada, alertar_salida, velocidad_maxima_zona, activo, created_at
       FROM ubisafe.geovallas
       WHERE empresa_id = $1 AND activo = true
       ORDER BY nombre`,
      [empresa_id]
    );

    return res.json({
      total: geovallas.rows.length,
      geovallas: geovallas.rows,
    });
  } catch (err) {
    console.error('Error en GET /geovallas:', err);
    return res.status(500).json({ error: 'Error al listar geovallas', details: err.message });
  }
});

// ===========================
// GET: Obtener una geovalla específica
// ===========================
router.get('/:id', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const { id } = req.params;

    const geovalla = await pool.query(
      `SELECT id, nombre, descripcion, tipo, ST_AsGeoJSON(geometria)::jsonb as geometria,
              radio_metros, alertar_entrada, alertar_salida, velocidad_maxima_zona
       FROM ubisafe.geovallas
       WHERE id = $1 AND empresa_id = $2`,
      [id, empresa_id]
    );

    if (geovalla.rows.length === 0) {
      return res.status(404).json({ error: 'Geovalla no encontrada' });
    }

    return res.json(geovalla.rows[0]);
  } catch (err) {
    console.error('Error en GET /geovallas/:id:', err);
    return res.status(500).json({ error: 'Error al obtener geovalla', details: err.message });
  }
});

// ===========================
// POST: Crear una nueva geovalla
// ===========================
router.post('/', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const {
      nombre,
      descripcion,
      tipo,
      geometria_wkt,
      radio_metros,
      alertar_entrada,
      alertar_salida,
      velocidad_maxima_zona,
    } = req.body;

    // Validación
    if (!nombre || !tipo || !geometria_wkt) {
      return res.status(400).json({ error: 'Faltan datos: nombre, tipo, geometria_wkt' });
    }

    if (!['zona_permitida', 'zona_prohibida', 'zona_trabajo'].includes(tipo)) {
      return res.status(400).json({ error: 'Tipo inválido. Debe ser: zona_permitida, zona_prohibida, zona_trabajo' });
    }

    // Verificar que no existe ya
    const existe = await pool.query(
      'SELECT id FROM ubisafe.geovallas WHERE empresa_id = $1 AND nombre = $2',
      [empresa_id, nombre]
    );

    if (existe.rows.length > 0) {
      return res.status(400).json({ error: 'Ya existe una geovalla con ese nombre' });
    }

    // Crear geovalla
    const nueva = await pool.query(
      `INSERT INTO ubisafe.geovallas (
        empresa_id, nombre, descripcion, tipo, geometria,
        radio_metros, alertar_entrada, alertar_salida, velocidad_maxima_zona
      ) VALUES ($1, $2, $3, $4, ST_GeogFromText($5), $6, $7, $8, $9)
       RETURNING id, nombre, tipo`,
      [
        empresa_id,
        nombre,
        descripcion,
        tipo,
        geometria_wkt,
        radio_metros,
        alertar_entrada ?? true,
        alertar_salida ?? true,
        velocidad_maxima_zona,
      ]
    );

    return res.status(201).json({
      mensaje: 'Geovalla creada exitosamente',
      geovalla: nueva.rows[0],
    });
  } catch (err) {
    console.error('Error en POST /geovallas:', err);
    return res.status(500).json({ error: 'Error al crear geovalla', details: err.message });
  }
});

// ===========================
// PUT: Actualizar una geovalla
// ===========================
router.put('/:id', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const { id } = req.params;
    const { descripcion, alertar_entrada, alertar_salida, velocidad_maxima_zona } = req.body;

    // Verificar que le pertenece
    const geovalla = await pool.query(
      'SELECT id FROM ubisafe.geovallas WHERE id = $1 AND empresa_id = $2',
      [id, empresa_id]
    );

    if (geovalla.rows.length === 0) {
      return res.status(404).json({ error: 'Geovalla no encontrada' });
    }

    const actualizada = await pool.query(
      `UPDATE ubisafe.geovallas SET
        descripcion = COALESCE($1, descripcion),
        alertar_entrada = COALESCE($2, alertar_entrada),
        alertar_salida = COALESCE($3, alertar_salida),
        velocidad_maxima_zona = COALESCE($4, velocidad_maxima_zona),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $5 AND empresa_id = $6
       RETURNING id, nombre, tipo`,
      [descripcion, alertar_entrada, alertar_salida, velocidad_maxima_zona, id, empresa_id]
    );

    return res.json({
      mensaje: 'Geovalla actualizada',
      geovalla: actualizada.rows[0],
    });
  } catch (err) {
    console.error('Error en PUT /geovallas/:id:', err);
    return res.status(500).json({ error: 'Error al actualizar geovalla', details: err.message });
  }
});

// ===========================
// DELETE: Desactivar una geovalla (soft delete)
// ===========================
router.delete('/:id', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const { id } = req.params;

    const eliminada = await pool.query(
      `UPDATE ubisafe.geovallas SET activo = false, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND empresa_id = $2
       RETURNING id, nombre`,
      [id, empresa_id]
    );

    if (eliminada.rows.length === 0) {
      return res.status(404).json({ error: 'Geovalla no encontrada' });
    }

    return res.json({
      mensaje: 'Geovalla desactivada',
      geovalla: eliminada.rows[0],
    });
  } catch (err) {
    console.error('Error en DELETE /geovallas/:id:', err);
    return res.status(500).json({ error: 'Error al eliminar geovalla', details: err.message });
  }
});

module.exports = router;
