const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// ===========================
// GET: Resumen de flota (Dashboard principal)
// ===========================
router.get('/resumen', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;

    // 1. Contar vehículos por estado
    const vehiculosPorEstado = await pool.query(
      `SELECT e.nombre as estado, COUNT(*) as total
       FROM ubisafe.vehiculos v
       LEFT JOIN ubisafe.estados_vehiculo e ON v.estado_id = e.id
       WHERE v.empresa_id = $1 AND v.activo = true
       GROUP BY v.estado_id, e.nombre`,
      [empresa_id]
    );

    // 2. Contar alertas sin resolver
    const alertasSinResolver = await pool.query(
      `SELECT COUNT(*) as total FROM ubisafe.alertas
       WHERE empresa_id = $1 AND resuelto = false`,
      [empresa_id]
    );

    // 3. Alertas por severidad
    const alertasPorSeveridad = await pool.query(
      `SELECT ta.severidad, COUNT(*) as total
       FROM ubisafe.alertas a
       JOIN ubisafe.tipos_alerta ta ON a.tipo_alerta_id = ta.id
       WHERE a.empresa_id = $1 AND a.resuelto = false
       GROUP BY ta.severidad`,
      [empresa_id]
    );

    // 4. Vehículos con combustible bajo (< 20%)
    const combustibleBajo = await pool.query(
      `SELECT id, placa, porcentaje_combustible
       FROM ubisafe.vehiculos
       WHERE empresa_id = $1 AND porcentaje_combustible < 20 AND activo = true`,
      [empresa_id]
    );

    // 5. Viajes en progreso
    const viajesEnProgreso = await pool.query(
      `SELECT COUNT(*) as total FROM ubisafe.viajes
       WHERE empresa_id = $1 AND estado = 'en_progreso'`,
      [empresa_id]
    );

    // 6. Vehículos con licencia de chofer vencida
    const conductoresConLicenciaVencida = await pool.query(
      `SELECT COUNT(DISTINCT c.id) as total
       FROM ubisafe.choferes c
       WHERE c.empresa_id = $1 AND c.licencia_vencimiento < CURRENT_DATE AND c.activo = true`,
      [empresa_id]
    );

    // 7. Total de viajes hoy
    const viajesToday = await pool.query(
      `SELECT COUNT(*) as total FROM ubisafe.viajes
       WHERE empresa_id = $1 AND DATE(fecha_inicio) = CURRENT_DATE`,
      [empresa_id]
    );

    // 8. Distancia total hoy
    const distanciaHoy = await pool.query(
      `SELECT COALESCE(SUM(distancia_km), 0) as total FROM ubisafe.viajes
       WHERE empresa_id = $1 AND DATE(fecha_inicio) = CURRENT_DATE`,
      [empresa_id]
    );

    // 9. Top 5 vehículos online
    const vehiculosOnline = await pool.query(
      `SELECT v.id, v.placa, v.marca, v.modelo, v.velocidad_actual,
              v.porcentaje_combustible, v.temperatura_motor,
              c.nombre as chofer_actual
       FROM ubisafe.vehiculos v
       LEFT JOIN ubisafe.asignaciones_vehiculo_chofer a ON v.id = a.vehiculo_id AND a.activo = true
       LEFT JOIN ubisafe.choferes c ON a.chofer_id = c.id
       LEFT JOIN ubisafe.estados_vehiculo e ON v.estado_id = e.id
       WHERE v.empresa_id = $1 AND v.activo = true AND e.codigo = 'online'
       ORDER BY v.fecha_ultimo_reporte DESC
       LIMIT 10`,
      [empresa_id]
    );

    // Compilar respuesta
    const resumen = {
      timestamp: new Date().toISOString(),
      estadisticas: {
        vehiculos_total: await pool.query(
          'SELECT COUNT(*) as total FROM ubisafe.vehiculos WHERE empresa_id = $1 AND activo = true',
          [empresa_id]
        ).then(r => r.rows[0].total),
        vehiculos_por_estado: vehiculosPorEstado.rows.reduce((acc, row) => {
          acc[row.estado || 'Sin estado'] = row.total;
          return acc;
        }, {}),
        alertas_sin_resolver: parseInt(alertasSinResolver.rows[0].total),
        alertas_por_severidad: alertasPorSeveridad.rows.reduce((acc, row) => {
          acc[row.severidad] = row.total;
          return acc;
        }, {}),
        combustible_bajo: combustibleBajo.rows.length,
        viajes_en_progreso: parseInt(viajesEnProgreso.rows[0].total),
        licencias_vencidas: parseInt(conductoresConLicenciaVencida.rows[0].total),
      },
      hoy: {
        viajes_total: parseInt(viajesToday.rows[0].total),
        distancia_km: parseFloat(distanciaHoy.rows[0].total).toFixed(2),
      },
      flota_online: vehiculosOnline.rows,
      alertas_criticas: alertasPorSeveridad.rows.find(r => r.severidad === 'critical')?.total || 0,
    };

    return res.json(resumen);

  } catch (err) {
    console.error('Error en GET /dashboard/resumen:', err);
    return res.status(500).json({ error: 'Error al obtener resumen', details: err.message });
  }
});

// ===========================
// GET: Alertas críticas recientes
// ===========================
router.get('/alertas-criticas', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;

    const alertas = await pool.query(
      `SELECT a.id, a.timestamp, ta.nombre as tipo_alerta, ta.severidad,
              v.placa, a.descripcion, a.resuelto
       FROM ubisafe.alertas a
       JOIN ubisafe.tipos_alerta ta ON a.tipo_alerta_id = ta.id
       LEFT JOIN ubisafe.vehiculos v ON a.vehiculo_id = v.id
       WHERE a.empresa_id = $1 AND a.resuelto = false
       ORDER BY ta.severidad DESC, a.timestamp DESC
       LIMIT 50`,
      [empresa_id]
    );

    return res.json({
      total: alertas.rows.length,
      alertas: alertas.rows,
    });

  } catch (err) {
    console.error('Error en GET /dashboard/alertas-criticas:', err);
    return res.status(500).json({ error: 'Error al obtener alertas', details: err.message });
  }
});

// ===========================
// GET: Mapa de vehículos (para renderizar en mapa)
// ===========================
router.get('/mapa', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;

    const vehiculos = await pool.query(
      `SELECT v.id, v.placa,
              ST_AsGeoJSON(v.ubicacion_actual)::jsonb as ubicacion,
              v.velocidad_actual, v.porcentaje_combustible, e.nombre as estado,
              c.nombre as chofer, a.alertas_cantidad
       FROM ubisafe.vehiculos v
       LEFT JOIN ubisafe.estados_vehiculo e ON v.estado_id = e.id
       LEFT JOIN ubisafe.asignaciones_vehiculo_chofer avc ON v.id = avc.vehiculo_id AND avc.activo = true
       LEFT JOIN ubisafe.choferes c ON avc.chofer_id = c.id
       LEFT JOIN (
         SELECT vehiculo_id, COUNT(*) as alertas_cantidad
         FROM ubisafe.alertas
         WHERE resuelto = false
         GROUP BY vehiculo_id
       ) a ON v.id = a.vehiculo_id
       WHERE v.empresa_id = $1 AND v.activo = true
       ORDER BY v.placa`,
      [empresa_id]
    );

    // Formato GeoJSON para mapa
    const features = vehiculos.rows.map(v => ({
      type: 'Feature',
      properties: {
        id: v.id,
        placa: v.placa,
        estado: v.estado,
        velocidad: v.velocidad_actual,
        combustible: v.porcentaje_combustible,
        chofer: v.chofer,
        alertas: v.alertas_cantidad || 0,
      },
      geometry: v.ubicacion ? JSON.parse(JSON.stringify(v.ubicacion)) : null,
    }));

    return res.json({
      type: 'FeatureCollection',
      features: features.filter(f => f.geometry !== null), // Solo vehículos con ubicación
    });

  } catch (err) {
    console.error('Error en GET /dashboard/mapa:', err);
    return res.status(500).json({ error: 'Error al obtener mapa', details: err.message });
  }
});

// ===========================
// GET: Reportes diarios
// ===========================
router.get('/reportes/diario', async (req, res) => {
  try {
    const empresa_id = req.user.empresa_id;
    const { fecha } = req.query; // YYYY-MM-DD

    const fechaQuery = fecha || new Date().toISOString().split('T')[0];

    const reporte = await pool.query(
      `SELECT
        DATE(v.fecha_inicio) as fecha,
        COUNT(v.id) as viajes_totales,
        SUM(v.distancia_km) as distancia_total_km,
        AVG(v.velocidad_promedio) as velocidad_promedio,
        SUM(v.combustible_consumido) as combustible_consumido,
        COUNT(DISTINCT v.vehiculo_id) as vehiculos_utilizados,
        COUNT(DISTINCT v.chofer_id) as choferes_utilizados,
        SUM(CASE WHEN a.tipo_alerta_id IS NOT NULL THEN 1 ELSE 0 END) as alertas_total
       FROM ubisafe.viajes v
       LEFT JOIN ubisafe.alertas a ON v.id = a.viaje_id
       WHERE v.empresa_id = $1 AND DATE(v.fecha_inicio) = $2
       GROUP BY DATE(v.fecha_inicio)`,
      [empresa_id, fechaQuery]
    );

    return res.json({
      fecha: fechaQuery,
      reporte: reporte.rows[0] || {
        fecha: fechaQuery,
        viajes_totales: 0,
        distancia_total_km: 0,
        velocidad_promedio: 0,
        combustible_consumido: 0,
        vehiculos_utilizados: 0,
        choferes_utilizados: 0,
        alertas_total: 0,
      }
    });

  } catch (err) {
    console.error('Error en GET /dashboard/reportes/diario:', err);
    return res.status(500).json({ error: 'Error al obtener reporte', details: err.message });
  }
});

module.exports = router;
