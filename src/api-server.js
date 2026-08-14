require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { requireAuth, login, logout, quienSoy } = require('./api-auth');
const { router: rutasVehiculos } = require('./api-rutas-vehiculos');

const PUERTO = process.env.PORT || process.env.API_PORT || 6029;
const ORIGEN_PERMITIDO = process.env.API_CORS_ORIGIN || 'https://ubisafe-1.onrender.com';

const app = express();
app.set('trust proxy', 1); // detras de nginx en produccion, para que "secure" en cookies funcione bien
app.use(cors({ origin: ORIGEN_PERMITIDO, credentials: true }));
app.use(cookieParser());
app.use(express.json());

app.get('/api/salud', (req, res) => {
  res.json({ ok: true });
});

app.post('/api/auth/login', login);
app.post('/api/auth/logout', logout);
app.get('/api/auth/me', requireAuth, quienSoy);

app.use('/api/vehiculos', requireAuth, rutasVehiculos);

// Escucha en 0.0.0.0 para que sea accesible desde afuera (Render, Docker, etc)
// En produccion con nginx, solo nginx accede al puerto interno
app.listen(PUERTO, '0.0.0.0', () => {
  console.log(`API escuchando en http://0.0.0.0:${PUERTO}`);
});
