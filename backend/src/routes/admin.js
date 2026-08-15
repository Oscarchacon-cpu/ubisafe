const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const jwt = require('jsonwebtoken');

// ===========================
// POST: ONBOARDING - Registrar nueva empresa + admin
// ===========================
router.post('/onboarding/registrar', async (req, res) => {
  try {
    const { nombre_empresa, email_admin, nombre_admin, password, pais_id } = req.body;

    // Validación
    if (!nombre_empresa || !email_admin || !nombre_admin || !password || !pais_id) {
      return res.status(400).json({
        error: 'Faltan datos: nombre_empresa, email_admin, nombre_admin, password, pais_id'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Contraseña debe tener mínimo 8 caracteres' });
    }

    // Verificar que el país existe
    const pais = await pool.query('SELECT id FROM ubisafe.paises WHERE id = $1', [pais_id]);
    if (pais.rows.length === 0) {
      return res.status(400).json({ error: 'País no válido' });
    }

    // Verificar que la empresa no existe ya
    const empresaExiste = await pool.query(
      'SELECT id FROM ubisafe.empresas WHERE email_contacto = $1',
      [email_admin]
    );
    if (empresaExiste.rows.length > 0) {
      return res.status(400).json({ error: 'Este email ya está registrado' });
    }

    // Crear empresa
    const empresa = await pool.query(
      `INSERT INTO ubisafe.empresas (nombre, email_contacto, pais_id, plan, activo)
       VALUES ($1, $2, $3, 'free', true)
       RETURNING id, nombre, email_contacto, plan`,
      [nombre_empresa, email_admin, pais_id]
    );

    const empresa_id = empresa.rows[0].id;

    // Crear usuario admin
    // En producción, usar bcrypt para hashear password
    const usuario = await pool.query(
      `INSERT INTO ubisafe.usuarios (empresa_id, nombre, email, password_hash, rol_id, activo)
       VALUES ($1, $2, $3, $4, 1, true)
       RETURNING id, email, nombre`,
      [empresa_id, nombre_admin, email_admin, password] // En producción: bcrypt.hash(password)
    );

    // Crear configuración de empresa por defecto
    await pool.query(
      `INSERT INTO ubisafe.configuracion_empresa (empresa_id, idioma, velocidad_alerta)
       VALUES ($1, 'es', 120)`,
      [empresa_id]
    );

    // Generar JWT para el nuevo usuario
    const token = jwt.sign(
      { id: usuario.rows[0].id, email: usuario.rows[0].email, empresa_id, rol: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    return res.status(201).json({
      mensaje: 'Empresa registrada exitosamente',
      empresa: empresa.rows[0],
      usuario: usuario.rows[0],
      token: token,
      pasos_siguientes: [
        '1. Usa este token para autenticarte',
        '2. Registra tus vehículos en POST /api/vehiculos',
        '3. Registra tus choferes en POST /api/choferes',
        '4. Asigna choferes a vehículos en POST /api/asignaciones',
      ]
    });

  } catch (err) {
    console.error('Error en POST /admin/onboarding/registrar:', err);
    return res.status(500).json({ error: 'Error al registrar empresa', details: err.message });
  }
});

// ===========================
// POST: Crear nuevo usuario dentro de empresa (solo admin)
// ===========================
router.post('/usuarios', requireAuth, async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const usuario_rol = req.user.rol;

    // Solo admin puede crear usuarios
    if (usuario_rol !== 'admin') {
      return res.status(403).json({ error: 'Solo administradores pueden crear usuarios' });
    }

    const { nombre, email, password, rol_id } = req.body;

    if (!nombre || !email || !password || !rol_id) {
      return res.status(400).json({ error: 'Faltan datos: nombre, email, password, rol_id' });
    }

    // Verificar que rol_id existe
    const rol = await pool.query('SELECT id FROM ubisafe.roles WHERE id = $1', [rol_id]);
    if (rol.rows.length === 0) {
      return res.status(400).json({ error: 'Rol no válido' });
    }

    // Verificar que email no existe en esta empresa
    const usuarioExiste = await pool.query(
      'SELECT id FROM ubisafe.usuarios WHERE empresa_id = $1 AND email = $2',
      [empresa_id, email]
    );
    if (usuarioExiste.rows.length > 0) {
      return res.status(400).json({ error: 'Este usuario ya existe en tu empresa' });
    }

    // Crear usuario
    const nuevo = await pool.query(
      `INSERT INTO ubisafe.usuarios (empresa_id, nombre, email, password_hash, rol_id, activo, created_by)
       VALUES ($1, $2, $3, $4, $5, true, $6)
       RETURNING id, nombre, email`,
      [empresa_id, nombre, email, password, rol_id, req.user.id]
    );

    return res.status(201).json({
      mensaje: 'Usuario creado',
      usuario: nuevo.rows[0],
    });

  } catch (err) {
    console.error('Error en POST /admin/usuarios:', err);
    return res.status(500).json({ error: 'Error al crear usuario', details: err.message });
  }
});

// ===========================
// GET: Listar usuarios de la empresa (solo admin)
// ===========================
router.get('/usuarios', requireAuth, async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const usuario_rol = req.user.rol;

    if (usuario_rol !== 'admin') {
      return res.status(403).json({ error: 'Solo administradores pueden listar usuarios' });
    }

    const usuarios = await pool.query(
      `SELECT u.id, u.nombre, u.email, r.nombre as rol, u.ultimo_login, u.activo, u.created_at
       FROM ubisafe.usuarios u
       JOIN ubisafe.roles r ON u.rol_id = r.id
       WHERE u.empresa_id = $1 AND u.activo = true
       ORDER BY u.nombre`,
      [empresa_id]
    );

    return res.json({
      total: usuarios.rows.length,
      usuarios: usuarios.rows,
    });

  } catch (err) {
    console.error('Error en GET /admin/usuarios:', err);
    return res.status(500).json({ error: 'Error al listar usuarios', details: err.message });
  }
});

// ===========================
// PUT: Cambiar rol de usuario (solo admin)
// ===========================
router.put('/usuarios/:usuario_id/rol', requireAuth, async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const usuario_rol = req.user.rol;
    const { usuario_id } = req.params;
    const { rol_id } = req.body;

    if (usuario_rol !== 'admin') {
      return res.status(403).json({ error: 'Solo administradores' });
    }

    // Verificar que el usuario pertenece a esta empresa
    const usuario = await pool.query(
      'SELECT id FROM ubisafe.usuarios WHERE id = $1 AND empresa_id = $2',
      [usuario_id, empresa_id]
    );

    if (usuario.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // Actualizar rol
    const actualizado = await pool.query(
      `UPDATE ubisafe.usuarios SET rol_id = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, nombre, email`,
      [rol_id, usuario_id]
    );

    return res.json({
      mensaje: 'Rol actualizado',
      usuario: actualizado.rows[0],
    });

  } catch (err) {
    console.error('Error en PUT /admin/usuarios/:usuario_id/rol:', err);
    return res.status(500).json({ error: 'Error al actualizar rol', details: err.message });
  }
});

// ===========================
// GET: Configuración de empresa (solo admin)
// ===========================
router.get('/configuracion', requireAuth, async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;

    const config = await pool.query(
      `SELECT * FROM ubisafe.configuracion_empresa WHERE empresa_id = $1`,
      [empresa_id]
    );

    if (config.rows.length === 0) {
      return res.status(404).json({ error: 'Configuración no encontrada' });
    }

    return res.json(config.rows[0]);

  } catch (err) {
    console.error('Error en GET /admin/configuracion:', err);
    return res.status(500).json({ error: 'Error al obtener configuración', details: err.message });
  }
});

// ===========================
// PUT: Actualizar configuración (solo admin)
// ===========================
router.put('/configuracion', requireAuth, async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const usuario_rol = req.user.rol;

    if (usuario_rol !== 'admin') {
      return res.status(403).json({ error: 'Solo administradores' });
    }

    const {
      idioma,
      velocidad_alerta,
      sensibilidad_frenada,
      email_alertas,
      sms_alertas,
      notificaciones_push,
    } = req.body;

    const actualizada = await pool.query(
      `UPDATE ubisafe.configuracion_empresa SET
        idioma = COALESCE($1, idioma),
        velocidad_alerta = COALESCE($2, velocidad_alerta),
        sensibilidad_frenada = COALESCE($3, sensibilidad_frenada),
        email_alertas = COALESCE($4, email_alertas),
        sms_alertas = COALESCE($5, sms_alertas),
        notificaciones_push = COALESCE($6, notificaciones_push),
        updated_at = CURRENT_TIMESTAMP
       WHERE empresa_id = $7
       RETURNING *`,
      [idioma, velocidad_alerta, sensibilidad_frenada, email_alertas, sms_alertas, notificaciones_push, empresa_id]
    );

    return res.json({
      mensaje: 'Configuración actualizada',
      config: actualizada.rows[0],
    });

  } catch (err) {
    console.error('Error en PUT /admin/configuracion:', err);
    return res.status(500).json({ error: 'Error al actualizar configuración', details: err.message });
  }
});

module.exports = router;
