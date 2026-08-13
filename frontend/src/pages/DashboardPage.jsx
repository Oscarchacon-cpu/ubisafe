import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { get } from '../api/client';
import { VehicleList } from '../components/VehicleList';
import { MapView } from '../components/MapView';

export function DashboardPage() {
  const { usuario, cerrarSesion } = useAuth();
  const [vehiculos, setVehiculos] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    async function cargarVehiculos() {
      const respuesta = await get('/vehiculos');
      if (respuesta.ok) setVehiculos(respuesta.vehiculos);
      setCargando(false);
    }

    cargarVehiculos();
    const intervalo = setInterval(cargarVehiculos, 5000);
    return () => clearInterval(intervalo);
  }, []);

  return (
    <div style={{ padding: '2rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>UBISAFE</h1>
        <div>
          <span style={{ marginRight: '1rem' }}>Hola, {usuario.nombre}</span>
          <button onClick={cerrarSesion}>Cerrar sesion</button>
        </div>
      </header>

      {cargando ? (
        <p>Cargando vehiculos...</p>
      ) : (
        <>
          <MapView vehiculos={vehiculos} />
          <VehicleList vehiculos={vehiculos} />
        </>
      )}
    </div>
  );
}
