require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { requireAuth, login, logout, quienSoy } = require('./api-auth');
const { router: rutasVehiculos } = require('./api-rutas-vehiculos');

const PUERTO = process.env.API_PORT || 6029;
const ORIGEN_PERMITIDO = process.env.API_CORS_ORIGIN || 'http://localhost:5173';

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

// Solo local (127.0.0.1): en produccion nginx es el unico camino de entrada,
// igual que el canal de comandos del puerto 6028.
app.listen(PUERTO, '127.0.0.1', () => {
  console.log(`API escuchando en http://localhost:${PUERTO}`);
});
