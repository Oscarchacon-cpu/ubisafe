const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// ===========================
// GET: Listar choferes
// ===========================
router.get('/', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;

    const choferes = await pool.query(
      `SELECT id, nombre, email, telefono, tipo_documento, numero_documento, licencia_numero,
              licencia_vencimiento, calificacion, viajes_totales, activo, created_at
       FROM ubisafe.choferes
       WHERE empresa_id = $1 AND activo = true
       ORDER BY nombre`,
      [empresa_id]
    );

    return res.json({
      total: choferes.rows.length,
      choferes: choferes.rows,
    });
  } catch (err) {
    console.error('Error en GET /choferes:', err);
    return res.status(500).json({ error: 'Error al listar choferes', details: err.message });
  }
});

// ===========================
// GET: Obtener un chofer específico
// ===========================
router.get('/:id', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const { id } = req.params;

    const chofer = await pool.query(
      `SELECT id, nombre, email, telefono, tipo_documento, numero_documento, fecha_nacimiento,
              licencia_numero, licencia_vencimiento, licencia_tipo, calificacion, viajes_totales,
              horas_conduccion_mes, saldo_fatiga, activo, created_at
       FROM ubisafe.choferes
       WHERE id = $1 AND empresa_id = $2`,
      [id, empresa_id]
    );

    if (chofer.rows.length === 0) {
      return res.status(404).json({ error: 'Chofer no encontrado' });
    }

    return res.json(chofer.rows[0]);
  } catch (err) {
    console.error('Error en GET /choferes/:id:', err);
    return res.status(500).json({ error: 'Error al obtener chofer', details: err.message });
  }
});

// ===========================
// POST: Crear un nuevo chofer
// ===========================
router.post('/', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const {
      nombre,
      email,
      telefono,
      tipo_documento,
      numero_documento,
      fecha_nacimiento,
      licencia_numero,
      licencia_vencimiento,
      licencia_tipo,
    } = req.body;

    // Validación
    if (!nombre || !tipo_documento || !numero_documento) {
      return res.status(400).json({ error: 'Faltan datos: nombre, tipo_documento, numero_documento' });
    }

    // Verificar que el documento no existe ya
    const existe = await pool.query(
      'SELECT id FROM ubisafe.choferes WHERE empresa_id = $1 AND numero_documento = $2',
      [empresa_id, numero_documento]
    );

    if (existe.rows.length > 0) {
      return res.status(400).json({ error: 'Ya existe un chofer con ese documento' });
    }

    const nuevo = await pool.query(
      `INSERT INTO ubisafe.choferes (
        empresa_id, nombre, email, telefono, tipo_documento, numero_documento,
        fecha_nacimiento, licencia_numero, licencia_vencimiento, licencia_tipo
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, nombre, email, numero_documento`,
      [
        empresa_id,
        nombre,
        email,
        telefono,
        tipo_documento,
        numero_documento,
        fecha_nacimiento,
        licencia_numero,
        licencia_vencimiento,
        licencia_tipo,
      ]
    );

    return res.status(201).json({
      mensaje: 'Chofer creado exitosamente',
      chofer: nuevo.rows[0],
    });
  } catch (err) {
    console.error('Error en POST /choferes:', err);
    return res.status(500).json({ error: 'Error al crear chofer', details: err.message });
  }
});

// ===========================
// PUT: Actualizar un chofer
// ===========================
router.put('/:id', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const { id } = req.params;
    const { nombre, email, telefono, licencia_vencimiento, calificacion } = req.body;

    // Verificar que le pertenece
    const chofer = await pool.query(
      'SELECT id FROM ubisafe.choferes WHERE id = $1 AND empresa_id = $2',
      [id, empresa_id]
    );

    if (chofer.rows.length === 0) {
      return res.status(404).json({ error: 'Chofer no encontrado' });
    }

    const actualizado = await pool.query(
      `UPDATE ubisafe.choferes SET
        nombre = COALESCE($1, nombre),
        email = COALESCE($2, email),
        telefono = COALESCE($3, telefono),
        licencia_vencimiento = COALESCE($4, licencia_vencimiento),
        calificacion = COALESCE($5, calificacion),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $6 AND empresa_id = $7
       RETURNING id, nombre, email, calificacion`,
      [nombre, email, telefono, licencia_vencimiento, calificacion, id, empresa_id]
    );

    return res.json({
      mensaje: 'Chofer actualizado',
      chofer: actualizado.rows[0],
    });
  } catch (err) {
    console.error('Error en PUT /choferes/:id:', err);
    return res.status(500).json({ error: 'Error al actualizar chofer', details: err.message });
  }
});

// ===========================
// DELETE: Desactivar chofer (soft delete)
// ===========================
router.delete('/:id', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const { id } = req.params;

    const eliminado = await pool.query(
      `UPDATE ubisafe.choferes SET activo = false, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND empresa_id = $2
       RETURNING id, nombre`,
      [id, empresa_id]
    );

    if (eliminado.rows.length === 0) {
      return res.status(404).json({ error: 'Chofer no encontrado' });
    }

    return res.json({
      mensaje: 'Chofer desactivado',
      chofer: eliminado.rows[0],
    });
  } catch (err) {
    console.error('Error en DELETE /choferes/:id:', err);
    return res.status(500).json({ error: 'Error al eliminar chofer', details: err.message });
  }
});

module.exports = router;
