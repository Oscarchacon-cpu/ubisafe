import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { get, post } from '../api/client';
import { TripsTable } from '../components/TripsTable';
import { AlertsTable } from '../components/AlertsTable';
import { ReportsPanel } from '../components/ReportsPanel';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { VehicleMap } from '../components/VehicleMap';

export function VehicleDetailPage() {
  const { id } = useParams();
  const [vehiculo, setVehiculo] = useState(null);
  const [posicion, setPosicion] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [viajes, setViajes] = useState([]);
  const [alertas, setAlertas] = useState([]);
  const [tiempos, setTiempos] = useState([]);
  const [calificaciones, setCalificaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [comandoPendiente, setComandoPendiente] = useState(null); // 'cortar' | 'restaurar' | null
  const [mensajeComando, setMensajeComando] = useState('');

  useEffect(() => {
    async function cargarTodo() {
      const [v, p, vi, al, tc, cal] = await Promise.all([
        get(`/vehiculos/${id}`),
        get(`/vehiculos/${id}/posicion`),
        get(`/vehiculos/${id}/viajes`),
        get(`/vehiculos/${id}/alertas`),
        get(`/vehiculos/${id}/reportes/tiempos-conduccion`),
        get(`/vehiculos/${id}/reportes/calificaciones`),
      ]);

      if (v.ok) setVehiculo(v.vehiculo);
      if (p.ok) setPosicion(p.posicion);
      if (vi.ok) setViajes(vi.viajes);
      if (al.ok) setAlertas(al.alertas);
      if (tc.ok) setTiempos(tc.reporte);
      if (cal.ok) setCalificaciones(cal.reporte);
      setCargando(false);
    }
    cargarTodo();
  }, [id]);

  useEffect(() => {
    async function actualizarPosicion() {
      const [p, h] = await Promise.all([get(`/vehiculos/${id}/posicion`), get(`/vehiculos/${id}/historial?minutos=30`)]);
      if (p.ok) setPosicion(p.posicion);
      if (h.ok) setHistorial(h.historial);
    }
    actualizarPosicion();
    const intervalo = setInterval(actualizarPosicion, 5000);
    return () => clearInterval(intervalo);
  }, [id]);

  async function confirmarComando() {
    const ruta = comandoPendiente === 'cortar' ? 'cortar' : 'restaurar';
    setComandoPendiente(null);
    const respuesta = await post(`/vehiculos/${id}/comandos/${ruta}`, { confirmar: 'si' });
    setMensajeComando(respuesta.ok ? `Confirmado por el equipo: ${respuesta.respuesta}` : `Error: ${respuesta.error}`);
  }

  if (cargando) return <p style={{ padding: '2rem' }}>Cargando...</p>;
  if (!vehiculo) return <p style={{ padding: '2rem' }}>Vehiculo no encontrado.</p>;

  return (
    <div style={{ padding: '2rem' }}>
      <Link to="/">&larr; Volver al dashboard</Link>
      <h1>{vehiculo.patente}</h1>

      <section>
        <h2>Posicion actual</h2>
        <VehicleMap posicion={posicion} historial={historial} />
        {posicion ? (
          <p>
            {posicion.velocidad} km/h &middot; Ignicion {posicion.ignicion ? 'ENCENDIDA' : 'apagada'} &middot;{' '}
            {new Date(posicion.tiempo).toLocaleString()}
            <br />
            <a
              href={`https://www.google.com/maps?q=${posicion.latitud},${posicion.longitud}`}
              target="_blank"
              rel="noreferrer"
            >
              Ver en Google Maps
            </a>
          </p>
        ) : (
          <p>Sin datos de posicion.</p>
        )}
      </section>

      <section>
        <h2>Viajes recientes</h2>
        <TripsTable viajes={viajes} />
      </section>

      <section>
        <h2>Alertas recientes</h2>
        <AlertsTable alertas={alertas} />
      </section>

      <section>
        <h2>Reportes</h2>
        <ReportsPanel tiempos={tiempos} calificaciones={calificaciones} />
      </section>

      <section>
        <h2>Control remoto</h2>
        <button style={{ marginRight: '0.5rem' }} onClick={() => setComandoPendiente('cortar')}>
          Cortar motor/combustible
        </button>
        <button onClick={() => setComandoPendiente('restaurar')}>Restaurar motor/combustible</button>
        {mensajeComando && <p>{mensajeComando}</p>}
      </section>

      {comandoPendiente && (
        <ConfirmDialog
          titulo={comandoPendiente === 'cortar' ? 'Cortar motor/combustible' : 'Restaurar motor/combustible'}
          mensaje={
            comandoPendiente === 'cortar'
              ? `Vas a cortar el motor/combustible de ${vehiculo.patente}. ¿Confirmas?`
              : `Vas a restaurar el motor/combustible de ${vehiculo.patente}. ¿Confirmas?`
          }
          onConfirmar={confirmarComando}
          onCancelar={() => setComandoPendiente(null)}
        />
      )}
    </div>
  );
}
