const net = require('net');
const http = require('http');
const { parseAvlData } = require('./teltonika-codec');
const { construirComando, parseRespuestaComando } = require('./codec12');
const {
  obtenerVehiculoPorImei,
  obtenerViajeAbierto,
  obtenerGeocercas,
  guardarTelemetria,
  procesarConductor,
  procesarSabotaje,
  procesarGeocercas,
  procesarInfracciones,
} = require('./ingesta');

const PUERTO = 6027;
const PUERTO_COMANDOS = 6028; // solo localhost, no pasa por ngrok

const conexionesActivas = new Map(); // imei -> socket
const comandosPendientes = new Map(); // imei -> resolve() de la promesa en espera

const servidor = net.createServer((socket) => {
  const direccionCliente = `${socket.remoteAddress}:${socket.remotePort}`;
  console.log(`Nueva conexion desde: ${direccionCliente}`);

  let buffer = Buffer.alloc(0);
  let imei = null;
  let vehiculoId = null;
  let procesando = false;
  const estadoViaje = { viajeAbiertoId: null, apagadoDesde: null };
  const estadoSabotaje = { energiaDesconectada: false, jammingActivo: false };
  const estadoGeocercas = new Map();
  const estadoInfracciones = { excesoVelocidad: false };
  const estadoLimiteVia = { limiteKmh: null, lat: null, lon: null, consultadoEn: null };
  let geocercas = [];
  let velocidadMaximaKmh = 100;

  // Se serializa el procesamiento con un flag: si llegan mas datos mientras
  // esperamos una consulta a la base de datos, se agregan al buffer pero no
  // se dispara un segundo procesamiento en paralelo (evita leer el buffer a medias).
  async function procesarBuffer() {
    if (procesando) return;
    procesando = true;
    try {
      while (true) {
        if (!imei) {
          if (buffer.length < 2) return;
          const imeiLen = buffer.readUInt16BE(0);
          if (buffer.length < 2 + imeiLen) return;

          imei = buffer.subarray(2, 2 + imeiLen).toString('ascii');
          buffer = buffer.subarray(2 + imeiLen);

          console.log(`IMEI recibido: ${imei} (${direccionCliente})`);
          conexionesActivas.set(imei, socket);

          const vehiculo = await obtenerVehiculoPorImei(imei);
          if (vehiculo) {
            vehiculoId = vehiculo.vehiculo_id;
            velocidadMaximaKmh = vehiculo.velocidad_maxima_kmh;
            estadoViaje.viajeAbiertoId = await obtenerViajeAbierto(vehiculoId);
            geocercas = await obtenerGeocercas(vehiculo.cliente_id);
            console.log(`IMEI ${imei} -> vehiculo #${vehiculoId} (${geocercas.length} geocerca(s) activa(s), limite ${velocidadMaximaKmh}km/h)`);
          } else {
            console.warn(`IMEI ${imei} no tiene un vehiculo asignado, no se guardara en la base de datos`);
          }

          socket.write(Buffer.from([0x01])); // aceptamos el equipo
          continue;
        }

        if (buffer.length < 8) return;
        const preambulo = buffer.readUInt32BE(0);
        if (preambulo !== 0) {
          console.error(`Preambulo invalido de ${imei}, cerrando conexion`);
          socket.destroy();
          return;
        }
        const dataLength = buffer.readUInt32BE(4);
        const totalPaquete = 8 + dataLength + 4; // preambulo+longitud + datos + CRC
        if (buffer.length < totalPaquete) return;

        const datos = buffer.subarray(8, 8 + dataLength);
        buffer = buffer.subarray(totalPaquete);

        const codecId = datos.readUInt8(0);

        if (codecId === 0x0c) {
          const resultado = parseRespuestaComando(datos);
          console.log(`Respuesta de comando (${imei}): ${resultado.texto}`);

          const resolver = comandosPendientes.get(imei);
          if (resolver) {
            resolver(resultado.texto);
            comandosPendientes.delete(imei);
          }

          const respuesta = Buffer.alloc(4);
          respuesta.writeUInt32BE(1, 0);
          socket.write(respuesta);
          continue;
        }

        const resultado = parseAvlData(datos);

        console.log(`IMEI ${imei} - ${resultado.numData1} registro(s):`);
        for (const r of resultado.registros) {
          console.log(
            `  ${r.tiempo.toISOString()}  lat=${r.latitud}  lon=${r.longitud}  vel=${r.velocidad}km/h  alt=${r.altitud}m  sat=${r.satelites}`
          );
          const ioIds = Object.keys(r.io);
          if (ioIds.length > 0) {
            const ioTexto = ioIds.map((id) => `${id}=${r.io[id]}`).join(', ');
            console.log(`    IO: ${ioTexto}`);
          }

          if (vehiculoId) {
            await guardarTelemetria(vehiculoId, r);
            await procesarConductor(vehiculoId, r, estadoViaje);
            await procesarSabotaje(vehiculoId, r, estadoViaje, estadoSabotaje);
            await procesarGeocercas(vehiculoId, geocercas, r, estadoGeocercas);
            await procesarInfracciones(vehiculoId, velocidadMaximaKmh, r, estadoViaje, estadoInfracciones, estadoLimiteVia);
          }
        }

        const respuesta = Buffer.alloc(4);
        respuesta.writeUInt32BE(resultado.numData1, 0);
        socket.write(respuesta);
      }
    } catch (error) {
      console.error(`Error procesando datos de ${direccionCliente}:`, error.message);
    } finally {
      procesando = false;
    }
  }

  socket.on('data', (datos) => {
    buffer = Buffer.concat([buffer, datos]);
    procesarBuffer();
  });

  socket.on('close', () => {
    console.log(`Conexion cerrada: ${direccionCliente} (IMEI ${imei})`);
    if (imei && conexionesActivas.get(imei) === socket) {
      conexionesActivas.delete(imei);
    }
  });

  socket.on('error', (error) => {
    console.error(`Error en conexion ${direccionCliente}:`, error.message);
  });
});

servidor.listen(PUERTO, () => {
  console.log(`Servidor TCP escuchando en el puerto ${PUERTO}`);
});

function enviarComando(imei, texto) {
  return new Promise((resolve, reject) => {
    const socketDestino = conexionesActivas.get(imei);
    if (!socketDestino) {
      reject(new Error(`No hay conexion activa para IMEI ${imei}`));
      return;
    }

    comandosPendientes.set(imei, resolve);
    socketDestino.write(construirComando(texto));

    setTimeout(() => {
      if (comandosPendientes.get(imei) === resolve) {
        comandosPendientes.delete(imei);
        reject(new Error('El equipo no respondio a tiempo (10s)'));
      }
    }, 10000);
  });
}

// Canal de control solo-local (no pasa por ngrok) para enviar comandos al equipo.
const servidorComandos = http.createServer((req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(405).end();
    return;
  }
  let cuerpo = '';
  req.on('data', (trozo) => { cuerpo += trozo; });
  req.on('end', async () => {
    try {
      const { imei, texto } = JSON.parse(cuerpo);
      const respuesta = await enviarComando(imei, texto);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, respuesta }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: error.message }));
    }
  });
});

servidorComandos.listen(PUERTO_COMANDOS, '127.0.0.1', () => {
  console.log(`Canal de comandos escuchando en 127.0.0.1:${PUERTO_COMANDOS} (solo local)`);
});
