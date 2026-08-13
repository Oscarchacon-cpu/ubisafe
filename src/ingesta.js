const pool = require('./db');

async function obtenerVehiculoPorImei(imei) {
  const resultado = await pool.query(
    `SELECT v.id AS vehiculo_id, f.cliente_id, v.velocidad_maxima_kmh
     FROM equipos_gps e
     JOIN asignaciones_equipo_gps a ON a.equipo_id = e.id AND a.fecha_fin IS NULL
     JOIN vehiculos v ON v.id = a.vehiculo_id
     JOIN flotas f ON f.id = v.flota_id
     WHERE e.imei = $1`,
    [imei]
  );
  return resultado.rows[0] ?? null;
}

async function obtenerGeocercas(clienteId) {
  const resultado = await pool.query(
    `SELECT id, nombre, latitud_centro, longitud_centro, radio_metros
     FROM geocercas WHERE cliente_id = $1 AND activo = true`,
    [clienteId]
  );
  return resultado.rows;
}

function distanciaMetros(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// estadoGeocercas = Map(geocerca_id -> boolean "esta dentro") se mantiene por conexion
async function procesarGeocercas(vehiculoId, geocercas, registro, estadoGeocercas) {
  for (const g of geocercas) {
    const distancia = distanciaMetros(registro.latitud, registro.longitud, g.latitud_centro, g.longitud_centro);
    const dentro = distancia <= g.radio_metros;
    const estabaDentro = estadoGeocercas.get(g.id) ?? false;

    if (dentro !== estabaDentro) {
      const tipoEvento = dentro ? 'entrada_geocerca' : 'salida_geocerca';
      await pool.query(
        `INSERT INTO eventos (tiempo, vehiculo_id, origen, tipo_evento, severidad, latitud, longitud, geocerca_id)
         VALUES ($1, $2, 'servidor', $3, 'baja', $4, $5, $6)`,
        [registro.tiempo, vehiculoId, tipoEvento, registro.latitud, registro.longitud, g.id]
      );
      console.log(`Vehiculo #${vehiculoId} ${dentro ? 'entro a' : 'salio de'} geocerca "${g.nombre}"`);
      estadoGeocercas.set(g.id, dentro);
    }
  }
}

async function obtenerViajeAbierto(vehiculoId) {
  const resultado = await pool.query(
    `SELECT id FROM viajes WHERE vehiculo_id = $1 AND fecha_fin IS NULL ORDER BY fecha_inicio DESC LIMIT 1`,
    [vehiculoId]
  );
  return resultado.rows[0]?.id ?? null;
}

async function guardarTelemetria(vehiculoId, registro) {
  const ignicion = registro.io[239] === 1;
  const odometro = registro.io[16] ?? null; // metros, segun IO ID 16 (Total Odometer) del protocolo Teltonika

  await pool.query(
    `INSERT INTO telemetria
      (tiempo, vehiculo_id, latitud, longitud, velocidad, odometro, numero_satelites, orientacion, ignicion)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      registro.tiempo,
      vehiculoId,
      registro.latitud,
      registro.longitud,
      registro.velocidad,
      odometro,
      registro.satelites,
      registro.angulo,
      ignicion,
    ]
  );
}

const SEGUNDOS_GRACIA_APAGADO = 5;

// estadoViaje = { viajeAbiertoId, apagadoDesde } se mantiene por conexion para
// no consultar la DB en cada registro. apagadoDesde usa la hora que manda el
// propio equipo (no el reloj de esta computadora) para que el tiempo de
// gracia funcione bien incluso si llegan varios registros de golpe.
async function procesarConductor(vehiculoId, registro, estadoViaje) {
  const idIbutton = registro.io[78];
  const ignicionActiva = registro.io[239] === 1;

  if (ignicionActiva) {
    estadoViaje.apagadoDesde = null; // la ignicion volvio: cancelamos cualquier cierre pendiente

    // El equipo mantiene el ultimo iButton leido en el IO 78 aunque ya no este
    // en contacto con el lector, asi que solo abrimos viaje con la ignicion
    // encendida (si no, un mismo toque reabriria un viaje en cada registro).
    if (idIbutton && idIbutton !== 0n && estadoViaje.viajeAbiertoId === null) {
      const hex = BigInt(idIbutton).toString(16).toUpperCase();
      const conductor = await pool.query(
        `SELECT id FROM conductores WHERE codigo_identificacion = $1`,
        [hex]
      );

      if (conductor.rows[0]) {
        const viaje = await pool.query(
          `INSERT INTO viajes (conductor_id, vehiculo_id, fecha_inicio) VALUES ($1, $2, $3) RETURNING id`,
          [conductor.rows[0].id, vehiculoId, registro.tiempo]
        );
        estadoViaje.viajeAbiertoId = viaje.rows[0].id;
        console.log(`Viaje iniciado: conductor ${hex} -> viaje #${viaje.rows[0].id}`);
      } else {
        console.warn(`iButton ${hex} no coincide con ningun conductor registrado`);
      }
    }
    return;
  }

  if (estadoViaje.viajeAbiertoId === null) return;

  if (estadoViaje.apagadoDesde === null) {
    estadoViaje.apagadoDesde = registro.tiempo; // primera vez que vemos la ignicion apagada
    return;
  }

  const segundosApagado = (registro.tiempo - estadoViaje.apagadoDesde) / 1000;
  if (segundosApagado >= SEGUNDOS_GRACIA_APAGADO) {
    await pool.query(`UPDATE viajes SET fecha_fin = $1 WHERE id = $2`, [
      registro.tiempo,
      estadoViaje.viajeAbiertoId,
    ]);
    console.log(`Viaje #${estadoViaje.viajeAbiertoId} cerrado (ignicion apagada ${segundosApagado.toFixed(1)}s)`);
    estadoViaje.viajeAbiertoId = null;
    estadoViaje.apagadoDesde = null;
  }
}

const VOLTAJE_EXTERNO_MINIMO_MV = 5000; // por debajo de esto asumimos que se corto la alimentacion externa (bateria del vehiculo ronda 12000-14000mV)

// estadoSabotaje = { energiaDesconectada, jammingActivo } se mantiene por conexion.
// Solo insertamos un evento en la transicion (normal -> sabotaje), no en cada
// registro mientras dura, para no llenar la tabla de eventos repetidos.
// Se guarda tambien el viaje_id activo (si hay) para poder atribuir la alerta
// al conductor que estaba manejando en ese momento, no solo al vehiculo.
async function procesarSabotaje(vehiculoId, registro, estadoViaje, estadoSabotaje) {
  const voltajeExterno = registro.io[66];
  if (voltajeExterno !== undefined) {
    const energiaDesconectada = voltajeExterno < VOLTAJE_EXTERNO_MINIMO_MV;
    if (energiaDesconectada && !estadoSabotaje.energiaDesconectada) {
      await pool.query(
        `INSERT INTO eventos (tiempo, vehiculo_id, viaje_id, origen, tipo_evento, severidad, latitud, longitud, valor_medido)
         VALUES ($1, $2, $3, 'dispositivo', 'desconexion_energia', 'alta', $4, $5, $6)`,
        [registro.tiempo, vehiculoId, estadoViaje.viajeAbiertoId, registro.latitud, registro.longitud, voltajeExterno]
      );
      console.log(`ALERTA: desconexion de energia (voltaje externo ${voltajeExterno}mV)`);
    }
    estadoSabotaje.energiaDesconectada = energiaDesconectada;
  }

  // IO 318 = GNSS Jamming (no viene activado por defecto en el equipo).
  // Valores: 1 = advertencia, 2 = critico (sin fix de GPS).
  const jamming = registro.io[318];
  if (jamming !== undefined) {
    const jammingActivo = jamming > 0;
    if (jammingActivo && !estadoSabotaje.jammingActivo) {
      const severidad = jamming === 2 ? 'critica' : 'media';
      await pool.query(
        `INSERT INTO eventos (tiempo, vehiculo_id, viaje_id, origen, tipo_evento, severidad, latitud, longitud, valor_medido)
         VALUES ($1, $2, $3, 'dispositivo', 'jamming_gps', $4, $5, $6, $7)`,
        [registro.tiempo, vehiculoId, estadoViaje.viajeAbiertoId, severidad, registro.latitud, registro.longitud, jamming]
      );
      console.log(`ALERTA: jamming GPS detectado (nivel ${jamming})`);
    }
    estadoSabotaje.jammingActivo = jammingActivo;
  }
}

const OSM_RADIO_CONSULTA_M = 25;
const OSM_DISTANCIA_RECONSULTA_M = 150; // volver a preguntar si nos alejamos esto del ultimo punto consultado
const OSM_ANTIGUEDAD_RECONSULTA_MS = 3 * 60 * 1000; // o si ya pasaron 3 minutos desde la ultima consulta

// Busca el limite de velocidad de la via mas cercana en OpenStreetMap (gratis,
// sin llave). Cobertura pareja: en ciudades suele haber dato, en zonas rurales
// o mineras casi nunca, por eso el llamador cae al limite fijo del vehiculo.
async function obtenerLimiteViaOSM(lat, lon) {
  const consulta = `[out:json][timeout:5];way(around:${OSM_RADIO_CONSULTA_M},${lat},${lon})[highway][maxspeed];out tags 1;`;
  try {
    const respuesta = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Ubisafe-GPS-Platform/1.0',
      },
      body: 'data=' + encodeURIComponent(consulta),
      signal: AbortSignal.timeout(5000),
    });
    if (!respuesta.ok) return null;
    const datos = await respuesta.json();
    const textoMaxspeed = datos.elements?.[0]?.tags?.maxspeed;
    if (!textoMaxspeed) return null;
    const numero = parseInt(textoMaxspeed, 10); // ignora valores no numericos como "national" o "urban"
    return Number.isFinite(numero) ? numero : null;
  } catch (error) {
    console.warn(`No se pudo consultar limite de velocidad en OSM: ${error.message}`);
    return null;
  }
}

// estadoLimiteVia = { limiteKmh, lat, lon, consultadoEn } cachea la ultima
// consulta por conexion, para no golpear la API publica de Overpass en cada
// registro (llega uno cada pocos segundos).
async function obtenerLimiteEfectivoKmh(registro, velocidadMaximaVehiculo, estadoLimiteVia) {
  const distancia =
    estadoLimiteVia.lat != null
      ? distanciaMetros(registro.latitud, registro.longitud, estadoLimiteVia.lat, estadoLimiteVia.lon)
      : Infinity;
  const antiguedadMs = estadoLimiteVia.consultadoEn ? Date.now() - estadoLimiteVia.consultadoEn : Infinity;

  if (distancia > OSM_DISTANCIA_RECONSULTA_M || antiguedadMs > OSM_ANTIGUEDAD_RECONSULTA_MS) {
    estadoLimiteVia.limiteKmh = await obtenerLimiteViaOSM(registro.latitud, registro.longitud);
    estadoLimiteVia.lat = registro.latitud;
    estadoLimiteVia.lon = registro.longitud;
    estadoLimiteVia.consultadoEn = Date.now();
  }

  return estadoLimiteVia.limiteKmh ?? velocidadMaximaVehiculo;
}

// estadoInfracciones = { excesoVelocidad } se mantiene por conexion, misma logica
// de "solo avisar en la transicion" que las demas alertas.
async function procesarInfracciones(vehiculoId, velocidadMaximaKmh, registro, estadoViaje, estadoInfracciones, estadoLimiteVia) {
  const limiteEfectivo = await obtenerLimiteEfectivoKmh(registro, velocidadMaximaKmh, estadoLimiteVia);
  const excesoVelocidad = registro.velocidad > limiteEfectivo;
  if (excesoVelocidad && !estadoInfracciones.excesoVelocidad) {
    await pool.query(
      `INSERT INTO eventos (tiempo, vehiculo_id, viaje_id, origen, tipo_evento, severidad, latitud, longitud, valor_medido)
       VALUES ($1, $2, $3, 'servidor', 'exceso_velocidad', 'media', $4, $5, $6)`,
      [registro.tiempo, vehiculoId, estadoViaje.viajeAbiertoId, registro.latitud, registro.longitud, registro.velocidad]
    );
    console.log(`ALERTA: exceso de velocidad (${registro.velocidad} km/h, limite ${limiteEfectivo}km/h)`);
  }
  estadoInfracciones.excesoVelocidad = excesoVelocidad;
}

module.exports = {
  obtenerVehiculoPorImei,
  obtenerViajeAbierto,
  obtenerGeocercas,
  guardarTelemetria,
  procesarConductor,
  procesarSabotaje,
  procesarGeocercas,
  procesarInfracciones,
};
