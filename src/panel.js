const readline = require('readline');
const http = require('http');
const pool = require('./db');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function preguntar(texto) {
  return new Promise((resolve) => rl.question(texto, resolve));
}

function enviarComandoHttp(imei, texto) {
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

async function elegirVehiculo() {
  const resultado = await pool.query(
    `SELECT v.id, v.patente, e.imei
     FROM vehiculos v
     JOIN asignaciones_equipo_gps a ON a.vehiculo_id = v.id AND a.fecha_fin IS NULL
     JOIN equipos_gps e ON e.id = a.equipo_id`
  );

  if (resultado.rows.length === 0) {
    console.log('No hay vehiculos con equipo GPS asignado todavia.');
    return null;
  }
  if (resultado.rows.length === 1) {
    return resultado.rows[0];
  }

  console.log('\nVehiculos disponibles:');
  resultado.rows.forEach((v, i) => console.log(`  ${i + 1}. ${v.patente} (IMEI ${v.imei})`));
  const seleccion = await preguntar('Elige un numero: ');
  return resultado.rows[Number(seleccion) - 1] ?? null;
}

async function verUbicacion(vehiculoId) {
  const resultado = await pool.query(
    `SELECT tiempo, latitud, longitud, velocidad, ignicion
     FROM telemetria WHERE vehiculo_id = $1 ORDER BY tiempo DESC LIMIT 1`,
    [vehiculoId]
  );
  if (resultado.rows.length === 0) {
    console.log('Sin datos de posicion todavia.');
    return;
  }
  const p = resultado.rows[0];
  console.log(`\nUltima posicion: ${p.tiempo.toISOString()}`);
  console.log(`  Lat/Lon: ${p.latitud}, ${p.longitud}`);
  console.log(`  Velocidad: ${p.velocidad} km/h | Ignicion: ${p.ignicion ? 'ENCENDIDA' : 'apagada'}`);
  console.log(`  Ver en mapa: https://www.google.com/maps?q=${p.latitud},${p.longitud}`);
}

async function verViajes(vehiculoId) {
  const resultado = await pool.query(
    `SELECT vi.id, c.nombre AS conductor, vi.fecha_inicio, vi.fecha_fin
     FROM viajes vi JOIN conductores c ON c.id = vi.conductor_id
     WHERE vi.vehiculo_id = $1 ORDER BY vi.fecha_inicio DESC LIMIT 5`,
    [vehiculoId]
  );
  console.log('\nUltimos viajes:');
  if (resultado.rows.length === 0) console.log('  (ninguno)');
  for (const v of resultado.rows) {
    const estado = v.fecha_fin ? `hasta ${v.fecha_fin.toISOString()}` : 'EN CURSO';
    console.log(`  #${v.id}  ${v.conductor}  desde ${v.fecha_inicio.toISOString()}  ${estado}`);
  }
}

async function verAlertas(vehiculoId) {
  const resultado = await pool.query(
    `SELECT tiempo, tipo_evento, severidad, valor_medido
     FROM eventos WHERE vehiculo_id = $1 ORDER BY tiempo DESC LIMIT 5`,
    [vehiculoId]
  );
  console.log('\nUltimas alertas/eventos:');
  if (resultado.rows.length === 0) console.log('  (ninguna)');
  for (const e of resultado.rows) {
    console.log(`  ${e.tiempo.toISOString()}  ${e.tipo_evento}  (${e.severidad ?? '-'})`);
  }
}

async function verTiemposConduccion(vehiculoId) {
  const resultado = await pool.query(
    `SELECT c.nombre,
            COUNT(vi.id) AS viajes,
            ROUND(SUM(EXTRACT(EPOCH FROM (COALESCE(vi.fecha_fin, now()) - vi.fecha_inicio)) / 3600)::numeric, 1) AS horas
     FROM viajes vi
     JOIN conductores c ON c.id = vi.conductor_id
     WHERE vi.vehiculo_id = $1 AND vi.fecha_inicio >= now() - interval '30 days'
     GROUP BY c.nombre
     ORDER BY horas DESC`,
    [vehiculoId]
  );
  console.log('\nTiempos de conduccion (ultimos 30 dias):');
  if (resultado.rows.length === 0) console.log('  (sin viajes registrados)');
  for (const r of resultado.rows) {
    console.log(`  ${r.nombre}:  ${r.viajes} viaje(s), ${r.horas} horas totales`);
  }
}

async function verCalificaciones(vehiculoId) {
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
    [vehiculoId]
  );
  console.log('\nCalificacion de conductores (100 = sin infracciones):');
  console.log('  (formula inicial: -5 por exceso de velocidad, -15 por alerta de sabotaje durante su viaje)');
  if (resultado.rows.length === 0) console.log('  (sin viajes registrados)');
  for (const r of resultado.rows) {
    console.log(
      `  ${r.nombre}:  ${r.calificacion}/100  (${r.excesos_velocidad} exceso(s) de velocidad, ${r.alertas_sabotaje} alerta(s) de sabotaje)`
    );
  }
}

async function menuPrincipal() {
  const vehiculo = await elegirVehiculo();
  if (!vehiculo) {
    rl.close();
    await pool.end();
    return;
  }

  console.log(`\n=== Ubisafe - Panel de control (${vehiculo.patente}) ===`);

  let salir = false;
  while (!salir) {
    console.log('\n1. Ver ubicacion actual');
    console.log('2. Cortar motor/combustible');
    console.log('3. Restaurar motor/combustible');
    console.log('4. Ver ultimos viajes');
    console.log('5. Ver ultimas alertas');
    console.log('6. Reporte: tiempos de conduccion');
    console.log('7. Reporte: calificacion de conductores');
    console.log('0. Salir');
    const opcion = (await preguntar('Elige una opcion: ')).trim();

    try {
      switch (opcion) {
        case '1':
          await verUbicacion(vehiculo.id);
          break;
        case '2': {
          const confirmacion = await preguntar('Vas a CORTAR el motor/combustible. Escribe "si" para confirmar: ');
          if (confirmacion.trim().toLowerCase() === 'si') {
            const respuesta = await enviarComandoHttp(vehiculo.imei, 'setdigout 1');
            console.log(respuesta.ok ? `Confirmado por el equipo: ${respuesta.respuesta}` : `Error: ${respuesta.error}`);
          } else {
            console.log('Cancelado.');
          }
          break;
        }
        case '3': {
          const respuesta = await enviarComandoHttp(vehiculo.imei, 'setdigout 0');
          console.log(respuesta.ok ? `Confirmado por el equipo: ${respuesta.respuesta}` : `Error: ${respuesta.error}`);
          break;
        }
        case '4':
          await verViajes(vehiculo.id);
          break;
        case '5':
          await verAlertas(vehiculo.id);
          break;
        case '6':
          await verTiemposConduccion(vehiculo.id);
          break;
        case '7':
          await verCalificaciones(vehiculo.id);
          break;
        case '0':
          salir = true;
          break;
        default:
          console.log('Opcion invalida.');
      }
    } catch (error) {
      console.log(`Error: ${error.message}`);
    }
  }

  rl.close();
  await pool.end();
}

menuPrincipal();
