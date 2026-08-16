require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { Server } = require('socket.io');
const http = require('http');

const pool = require('./db');
const { requireAuth } = require('./middleware/auth');

// Import routes
const rutasVehiculos = require('./routes/vehiculos');
const rutasChoferes = require('./routes/choferes');
const rutasAlertas = require('./routes/alertas');
const rutasViajes = require('./routes/viajes');
const rutasGeovallas = require('./routes/geovallas');
const rutasGPS = require('./routes/gps');
const rutasAdmin = require('./routes/admin');
const rutasDashboard = require('./routes/dashboard');
const rutasTeltonika = require('./routes/teltonika');
const TeltonikaTCPServer = require('./teltonika-tcp-server');
// const MQTTClient = require('./mqtt-client');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN,
    credentials: true,
  },
});

const PORT = process.env.API_PORT || 6029;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

// Middleware
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(cookieParser());
app.use(express.json());

// Health check
app.get('/api/salud', (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// ===========================
// AUTH ENDPOINTS
// ===========================

// Registrar nueva empresa + admin
app.post('/api/auth/registrar', async (req, res) => {
  try {
    const { nombre, email, pais_id } = req.body;

    if (!nombre || !email || !pais_id) {
      return res.status(400).json({ error: 'Faltan datos: nombre, email, pais_id' });
    }

    // Verificar que el país existe
    const pais = await pool.query('SELECT id FROM ubisafe.paises WHERE id = $1', [pais_id]);
    if (pais.rows.length === 0) {
      return res.status(400).json({ error: 'País no válido' });
    }

    // Crear empresa
    const empresa = await pool.query(
      'INSERT INTO ubisafe.empresas (nombre, email_contacto, pais_id) VALUES ($1, $2, $3) RETURNING id, nombre, email_contacto',
      [nombre, email, pais_id]
    );

    return res.status(201).json({
      mensaje: 'Empresa registrada. Ahora configura el admin.',
      empresa: empresa.rows[0],
    });
  } catch (err) {
    console.error('Error en registrar empresa:', err);
    return res.status(500).json({ error: 'Error al registrar empresa', details: err.message });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña requeridos' });
    }

    // Buscar usuario
    const usuario = await pool.query(
      `SELECT u.id, u.email, u.nombre, u.password_hash, u.empresa_id, r.codigo as rol
       FROM ubisafe.usuarios u
       JOIN ubisafe.roles r ON u.rol_id = r.id
       WHERE u.email = $1 AND u.activo = true`,
      [email]
    );

    if (usuario.rows.length === 0) {
      return res.status(401).json({ error: 'Usuario o contraseña inválidos' });
    }

    const user = usuario.rows[0];

    // En producción, verificar bcryptjs. Por ahora, verificación simple.
    if (password !== 'demo123') {
      return res.status(401).json({ error: 'Usuario o contraseña inválidos' });
    }

    // Crear JWT
    const token = require('jsonwebtoken').sign(
      { id: user.id, email: user.email, empresa_id: user.empresa_id, rol: user.rol },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.cookie('access_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000, // 15 minutos
    });

    return res.json({
      token,
      usuario: {
        id: user.id,
        nombre: user.nombre,
        email: user.email,
        empresa_id: user.empresa_id,
        rol: user.rol,
      },
    });
  } catch (err) {
    console.error('Error en login:', err);
    return res.status(500).json({ error: 'Error en login', details: err.message });
  }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('access_token');
  return res.json({ mensaje: 'Logout exitoso' });
});

// Obtener usuario actual
app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const usuario = await pool.query(
      'SELECT id, nombre, email, empresa_id FROM ubisafe.usuarios WHERE id = $1',
      [req.user.id]
    );

    if (usuario.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    return res.json(usuario.rows[0]);
  } catch (err) {
    console.error('Error en /me:', err);
    return res.status(500).json({ error: 'Error', details: err.message });
  }
});

// ===========================
// ROUTES: API Endpoints
// ===========================
app.use('/api/vehiculos', rutasVehiculos);
app.use('/api/choferes', rutasChoferes);
app.use('/api/alertas', rutasAlertas);
app.use('/api/viajes', rutasViajes);
app.use('/api/geovallas', rutasGeovallas);
app.use('/api/gps', rutasGPS);  // GPS devices - Critical
app.use('/api/admin', rutasAdmin);  // Admin - Onboarding + config
app.use('/api/dashboard', rutasDashboard);  // Dashboard - KPIs + mapa
app.use('/api/teltonika', rutasTeltonika);  // Teltonika FMB130 - GPS + RFID

// ===========================
// WEBSOCKET (Real-time tracking)
// ===========================

io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id);

  // Unirse a sala de empresa
  socket.on('join-empresa', (empresa_id) => {
    socket.join(`empresa_${empresa_id}`);
    console.log(`Socket ${socket.id} unido a empresa_${empresa_id}`);
  });

  // Recibir actualización de ubicación GPS
  socket.on('gps-update', (data) => {
    const { empresa_id, vehiculo_id, lat, lng, velocidad } = data;
    io.to(`empresa_${empresa_id}`).emit('vehiculo-actualizado', {
      vehiculo_id,
      lat,
      lng,
      velocidad,
      timestamp: new Date().toISOString(),
    });
  });

  socket.on('disconnect', () => {
    console.log('Cliente desconectado:', socket.id);
  });
});

// ===========================
// ERROR 404
// ===========================

app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// ===========================
// INICIAR SERVIDOR
// ===========================

// Iniciar servidor HTTP principal
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Ubisafe Backend ejecutándose en http://localhost:${PORT}`);
  console.log(`📊 WebSocket disponible en ws://localhost:${PORT}`);
  console.log(`🔗 CORS habilitado para: ${CORS_ORIGIN}\n`);
});

// Iniciar servidor TCP para Teltonika
const teltonikaTCP = new TeltonikaTCPServer(6029);
teltonikaTCP.start();

// Iniciar cliente MQTT para Teltonika (deshabilitado - no necesario)
// const mqttClient = new MQTTClient();
// mqttClient.connect();

module.exports = { app, io, teltonikaTCP };
