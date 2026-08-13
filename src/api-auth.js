const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('./db');

const JWT_SECRET = process.env.JWT_SECRET;
const EXPIRA_EN = '12h';
const EXPIRA_EN_MS = 12 * 60 * 60 * 1000;
const PRODUCCION = process.env.NODE_ENV === 'production';

function requireAuth(req, res, next) {
  const token = req.cookies?.ubisafe_token;
  if (!token) {
    res.status(401).json({ ok: false, error: 'No autenticado' });
    return;
  }
  try {
    req.usuario = jwt.verify(token, JWT_SECRET);
    next();
  } catch (error) {
    res.status(401).json({ ok: false, error: 'Sesion invalida o vencida' });
  }
}

async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ ok: false, error: 'Falta email o contrasena' });
    return;
  }

  const resultado = await pool.query(
    `SELECT id, cliente_id, flota_id, nombre, email, password_hash, rol
     FROM usuarios WHERE email = $1 AND activo = true`,
    [email]
  );
  const usuario = resultado.rows[0];

  if (!usuario || !(await bcrypt.compare(password, usuario.password_hash))) {
    res.status(401).json({ ok: false, error: 'Email o contrasena incorrectos' });
    return;
  }

  await pool.query(`UPDATE usuarios SET ultimo_login = now() WHERE id = $1`, [usuario.id]);

  const payload = {
    id: usuario.id,
    cliente_id: usuario.cliente_id,
    flota_id: usuario.flota_id,
    rol: usuario.rol,
  };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: EXPIRA_EN });

  res.cookie('ubisafe_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: PRODUCCION, // en local es HTTP plano; en produccion va detras de HTTPS (nginx + certbot)
    maxAge: EXPIRA_EN_MS,
  });

  res.json({
    ok: true,
    usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol, cliente_id: usuario.cliente_id },
  });
}

function logout(req, res) {
  res.clearCookie('ubisafe_token');
  res.json({ ok: true });
}

async function quienSoy(req, res) {
  const resultado = await pool.query(
    `SELECT id, nombre, email, rol, cliente_id FROM usuarios WHERE id = $1`,
    [req.usuario.id]
  );
  const usuario = resultado.rows[0];
  if (!usuario) {
    res.status(401).json({ ok: false, error: 'Usuario no encontrado' });
    return;
  }
  res.json({ ok: true, usuario });
}

module.exports = { requireAuth, login, logout, quienSoy };
