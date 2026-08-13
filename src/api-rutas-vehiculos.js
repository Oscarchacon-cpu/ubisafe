const express = require('express');
const http = require('http');
const pool = require('./db');

const router = express.Router();

// Misma forma de llamada que usa panel.js (enviarComandoHttp) hacia el canal
// local de comandos del GPS (127.0.0.1:6028, nunca expuesto por ngrok).
function enviarComandoGps(imei, texto) {
  return new Promise((resolve, reject) => {
    const cuerpo = JSON.stringify({ imei, texto });
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 6028,
        path: '/',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(cuerpo) },
      },
      (res) => {
        let datos = '';
        res.on('data', (trozo) => { datos += trozo; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(datos));
          } catch (error) {
            reject(error);
          }
        });
      }
    );
    req.on('error', reject);
    req.write(cuerpo);
    req.end();
  });
}

// Valida que el :id de la ruta pertenezca al cliente del usuario logueado.
// Devuelve 404 (no 403) para no confirmar/negar que el vehiculo existe si es de otro cliente.
async function requireVehiculoDelCliente(req, res, next) {
  const vehiculoId = Number(req.params.id);
  const resultado = await pool.query(
    `SELECT v.id, v.patente, v.velocidad_maxima_kmh, e.imei
     FROM vehiculos v
     JOIN flotas f ON f.id = v.flota_id
     LEFT JOIN asignaciones_equipo_gps a ON a.vehiculo_id = v.id AND a.fecha_fin IS NULL
     LEFT JOIN equipos_gps e ON e.id = a.equipo_id
     WHERE v.id = $1 AND f.cliente_id = $2`,
    [vehiculoId, req.usuario.cliente_id]
  );

  if (!resultado.rows[0]) {
    res.status(404).json({ ok: false, error: 'Vehiculo no encontrado' });
    return;
  }

  req.vehiculo = resultado.rows[0];
  next();
}

router.get('/', async (req, res) => {
  const resultado = await pool.query(
    `SELECT v.id, v.patente, f.nombre AS flota_nombre, e.imei, v.velocidad_maxima_kmh,
            t.tiempo, t.latitud, t.longitud, t.velocidad, t.ignicion
     FROM vehiculos v
     JOIN flotas f ON f.id = v.flota_id
     LEFT JOIN asignaciones_equipo_gps a ON a.vehiculo_id = v.id AND a.fecha_fin IS NULL
     LEFT JOIN equipos_gps e ON e.id = a.equipo_id
     LEFT JOIN LATERAL (
       SELECT tiempo, latitud, longitud, velocidad, ignicion
       FROM telemetria
       WHERE vehiculo_id = v.id
       ORDER BY tiempo DESC
       LIMIT 1
     ) t ON true
     WHERE f.cliente_id = $1
     ORDER BY v.patente`,
    [req.usuario.cliente_id]
  );

  const vehiculos = resultado.rows.map((r) => ({
    id: r.id,
    patente: r.patente,
    flota_nombre: r.flota_nombre,
    imei: r.imei,
    velocidad_maxima_kmh: r.velocidad_maxima_kmh,
    ultima_posicion: r.tiempo
      ? { tiempo: r.tiempo, latitud: r.latitud, longitud: r.longitud, velocidad: r.velocidad, ignicion: r.ignicion }
      : null,
  }));

  res.json({ ok: true, vehiculos });
});

router.get('/:id', requireVehiculoDelCliente, (req, res) => {
  res.json({ ok: true, vehiculo: req.vehiculo });
});

router.get('/:id/posicion', requireVehiculoDelCliente, async (req, res) => {
  const resultado = await pool.query(
    `SELECT tiempo, latitud, longitud, velocidad, ignicion
     FROM telemetria WHERE vehiculo_id = $1 ORDER BY tiempo DESC LIMIT 1`,
    [req.vehiculo.id]
  );
  res.json({ ok: true, posicion: resultado.rows[0] ?? null });
});

router.get('/:id/historial', requireVehiculoDelCliente, async (req, res) => {
  const minutos = Math.min(Number(req.query.minutos) || 30, 240);
  const resultado = await pool.query(
    `SELECT tiempo, latitud, longitud, velocidad
     FROM telemetria
     WHERE vehiculo_id = $1 AND tiempo >= now() - ($2 || ' minutes')::interval
     ORDER BY tiempo ASC`,
    [req.vehiculo.id, minutos]
  );
  res.json({ ok: true, historial: resultado.rows });
});

router.get('/:id/viajes', requireVehiculoDelCliente, async (req, res) => {
  const limite = Math.min(Number(req.query.limit) || 20, 100);
  const resultado = await pool.query(
    `SELECT vi.id, c.nombre AS conductor, vi.fecha_inicio, vi.fecha_fin
     FROM viajes vi JOIN conductores c ON c.id = vi.conductor_id
     WHERE vi.vehiculo_id = $1 ORDER BY vi.fecha_inicio DESC LIMIT $2`,
    [req.vehiculo.id, limite]
  );
  res.json({ ok: true, viajes: resultado.rows });
});

router.get('/:id/alertas', requireVehiculoDelCliente, async (req, res) => {
  const limite = Math.min(Number(req.query.limit) || 20, 100);
  const resultado = await pool.query(
    `SELECT tiempo, tipo_evento, severidad, valor_medido
     FROM eventos WHERE vehiculo_id = $1 ORDER BY tiempo DESC LIMIT $2`,
    [req.vehiculo.id, limite]
  );
  res.json({ ok: true, alertas: resultado.rows });
});

router.get('/:id/reportes/tiempos-conduccion', requireVehiculoDelCliente, async (req, res) => {
  const resultado = await pool.query(
    `SELECT c.nombre,
            COUNT(vi.id) AS viajes,
            ROUND(SUM(EXTRACT(EPOCH FROM (COALESCE(vi.fecha_fin, now()) - vi.fecha_inicio)) / 3600)::numeric, 1) AS horas
     FROM viajes vi
     JOIN conductores c ON c.id = vi.conductor_id
     WHERE vi.vehiculo_id = $1 AND vi.fecha_inicio >= now() - interval '30 days'
     GROUP BY c.nombre
     ORDER BY horas DESC`,
    [req.vehiculo.id]
  );
  res.json({ ok: true, reporte: resultado.rows });
});

router.get('/:id/reportes/calificaciones', requireVehiculoDelCliente, async (req, res) => {
  const resultado = await pool.query(
    `SELECT c.nombre,
            COUNT(*) FILTER (WHERE e.tipo_evento = 'exceso_velocidad') AS excesos_velocidad,
            COUNT(*) FILTER (WHERE e.tipo_evento IN ('desconexion_energia', 'jamming_gps')) AS alertas_sabotaje,
            GREATEST(0, 100
              - 5 * COUNT(*) FILTER (WHERE e.tipo_evento = 'exceso_velocidad')
              - 15 * COUNT(*) FILTER (WHERE e.tipo_evento IN ('desconexion_energia', 'jamming_gps'))
            ) AS calificacion
     FROM viajes vi
     JOIN conductores c ON c.id = vi.conductor_id
     LEFT JOIN eventos e ON e.viaje_id = vi.id
     WHERE vi.vehiculo_id = $1
     GROUP BY c.nombre
     ORDER BY calificacion ASC`,
    [req.vehiculo.id]
  );
  res.json({ ok: true, reporte: resultado.rows });
});

async function ejecutarComando(req, res, texto) {
  if (req.body?.confirmar !== 'si') {
    res.status(400).json({ ok: false, error: 'Falta confirmar: "si" en el cuerpo del pedido' });
    return;
  }
  if (!req.vehiculo.imei) {
    res.status(409).json({ ok: false, error: 'Vehiculo sin equipo GPS asignado' });
    return;
  }

  try {
    const respuesta = await enviarComandoGps(req.vehiculo.imei, texto);
    res.json(respuesta);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
}

router.post('/:id/comandos/cortar', requireVehiculoDelCliente, (req, res) =>
  ejecutarComando(req, res, 'setdigout 1')
);

router.post('/:id/comandos/restaurar', requireVehiculoDelCliente, (req, res) =>
  ejecutarComando(req, res, 'setdigout 0')
);

module.exports = { router, requireVehiculoDelCliente };
