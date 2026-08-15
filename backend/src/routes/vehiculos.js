const express = require('express');
const router = express.Router();
const pool = require('../db');

// Middleware: Asegurar que el usuario está autenticado
const { requireAuth } = require('../middleware/auth');
router.use(requireAuth);

// ===========================
// GET: Listar todos los vehículos de la empresa
// ===========================
router.get('/', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;

    const vehiculos = await pool.query(
      `SELECT v.*, e.nombre as estado_nombre, f.nombre as fabricante_nombre
       FROM ubisafe.vehiculos v
       LEFT JOIN ubisafe.estados_vehiculo e ON v.estado_id = e.id
       LEFT JOIN ubisafe.fabricantes_gps f ON v.fabricante_gps_id = f.id
       WHERE v.empresa_id = $1 AND v.activo = true
       ORDER BY v.placa`,
      [empresa_id]
    );

    return res.json({
      total: vehiculos.rows.length,
      vehiculos: vehiculos.rows,
    });
  } catch (err) {
    console.error('Error en GET /vehiculos:', err);
    return res.status(500).json({ error: 'Error al listar vehículos', details: err.message });
  }
});

// ===========================
// GET: Obtener un vehículo específico
// ===========================
router.get('/:id', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const { id } = req.params;

    const vehiculo = await pool.query(
      `SELECT v.*, e.nombre as estado_nombre, f.nombre as fabricante_nombre
       FROM ubisafe.vehiculos v
       LEFT JOIN ubisafe.estados_vehiculo e ON v.estado_id = e.id
       LEFT JOIN ubisafe.fabricantes_gps f ON v.fabricante_gps_id = f.id
       WHERE v.id = $1 AND v.empresa_id = $2`,
      [id, empresa_id]
    );

    if (vehiculo.rows.length === 0) {
      return res.status(404).json({ error: 'Vehículo no encontrado' });
    }

    return res.json(vehiculo.rows[0]);
  } catch (err) {
    console.error('Error en GET /vehiculos/:id:', err);
    return res.status(500).json({ error: 'Error al obtener vehículo', details: err.message });
  }
});

// ===========================
// POST: Crear un nuevo vehículo
// ===========================
router.post('/', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const {
      placa,
      marca,
      modelo,
      ano_fabricacion,
      color,
      tipo_combustible,
      capac_tanque_litros,
      fabricante_gps_id,
      dispositivo_gps_id,
      dispositivo_gps_api_key,
      velocidad_maxima_permitida,
    } = req.body;

    // Validación
    if (!placa || !marca || !modelo) {
      return res.status(400).json({ error: 'Faltan datos: placa, marca, modelo' });
    }

    // Verificar que la placa no existe ya
    const existe = await pool.query(
      'SELECT id FROM ubisafe.vehiculos WHERE empresa_id = $1 AND placa = $2',
      [empresa_id, placa]
    );

    if (existe.rows.length > 0) {
      return res.status(400).json({ error: 'Ya existe un vehículo con esa placa' });
    }

    // Estado por defecto: offline
    const estado_id = await pool.query(
      "SELECT id FROM ubisafe.estados_vehiculo WHERE codigo = 'offline' LIMIT 1"
    );

    const nuevo = await pool.query(
      `INSERT INTO ubisafe.vehiculos (
        empresa_id, placa, marca, modelo, ano_fabricacion, color, tipo_combustible,
        capac_tanque_litros, fabricante_gps_id, dispositivo_gps_id, dispositivo_gps_api_key,
        velocidad_maxima_permitida, estado_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id, placa, marca, modelo, estado_id`,
      [
        empresa_id,
        placa,
        marca,
        modelo,
        ano_fabricacion,
        color,
        tipo_combustible,
        capac_tanque_litros,
        fabricante_gps_id,
        dispositivo_gps_id,
        dispositivo_gps_api_key,
        velocidad_maxima_permitida || 120,
        estado_id.rows[0]?.id || 1,
      ]
    );

    return res.status(201).json({
      mensaje: 'Vehículo creado exitosamente',
      vehiculo: nuevo.rows[0],
    });
  } catch (err) {
    console.error('Error en POST /vehiculos:', err);
    return res.status(500).json({ error: 'Error al crear vehículo', details: err.message });
  }
});

// ===========================
// PUT: Actualizar un vehículo
// ===========================
router.put('/:id', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const { id } = req.params;
    const {
      marca,
      modelo,
      color,
      tipo_combustible,
      capac_tanque_litros,
      velocidad_maxima_permitida,
      estado_id,
    } = req.body;

    // Verificar que el vehículo le pertenece
    const vehiculo = await pool.query(
      'SELECT id FROM ubisafe.vehiculos WHERE id = $1 AND empresa_id = $2',
      [id, empresa_id]
    );

    if (vehiculo.rows.length === 0) {
      return res.status(404).json({ error: 'Vehículo no encontrado' });
    }

    // Actualizar
    const actualizado = await pool.query(
      `UPDATE ubisafe.vehiculos SET
        marca = COALESCE($1, marca),
        modelo = COALESCE($2, modelo),
        color = COALESCE($3, color),
        tipo_combustible = COALESCE($4, tipo_combustible),
        capac_tanque_litros = COALESCE($5, capac_tanque_litros),
        velocidad_maxima_permitida = COALESCE($6, velocidad_maxima_permitida),
        estado_id = COALESCE($7, estado_id),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $8 AND empresa_id = $9
       RETURNING id, placa, marca, modelo, estado_id`,
      [marca, modelo, color, tipo_combustible, capac_tanque_litros, velocidad_maxima_permitida, estado_id, id, empresa_id]
    );

    return res.json({
      mensaje: 'Vehículo actualizado',
      vehiculo: actualizado.rows[0],
    });
  } catch (err) {
    console.error('Error en PUT /vehiculos/:id:', err);
    return res.status(500).json({ error: 'Error al actualizar vehículo', details: err.message });
  }
});

// ===========================
// DELETE: Desactivar un vehículo (soft delete)
// ===========================
router.delete('/:id', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const { id } = req.params;

    const eliminado = await pool.query(
      `UPDATE ubisafe.vehiculos SET activo = false, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND empresa_id = $2
       RETURNING id, placa`,
      [id, empresa_id]
    );

    if (eliminado.rows.length === 0) {
      return res.status(404).json({ error: 'Vehículo no encontrado' });
    }

    return res.json({
      mensaje: 'Vehículo desactivado',
      vehiculo: eliminado.rows[0],
    });
  } catch (err) {
    console.error('Error en DELETE /vehiculos/:id:', err);
    return res.status(500).json({ error: 'Error al eliminar vehículo', details: err.message });
  }
});

// ===========================
// GET: Ubicación actual de un vehículo
// ===========================
router.get('/:id/ubicacion', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const { id } = req.params;

    const ubicacion = await pool.query(
      `SELECT id, placa, ST_AsText(ubicacion_actual) as ubicacion, velocidad_actual, fecha_ultimo_reporte
       FROM ubisafe.vehiculos
       WHERE id = $1 AND empresa_id = $2`,
      [id, empresa_id]
    );

    if (ubicacion.rows.length === 0) {
      return res.status(404).json({ error: 'Vehículo no encontrado' });
    }

    return res.json(ubicacion.rows[0]);
  } catch (err) {
    console.error('Error en GET /vehiculos/:id/ubicacion:', err);
    return res.status(500).json({ error: 'Error al obtener ubicación', details: err.message });
  }
});

module.exports = router;
