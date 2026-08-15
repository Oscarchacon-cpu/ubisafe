import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { useEffect, useState } from 'react';
import api from '../services/api';

const vehicleIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

export default function MapComponent() {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchVehicles = async () => {
      try {
        const response = await api.get('/dashboard/mapa');
        setVehicles(response.data.features || []);
      } catch (err) {
        console.error('Error fetching vehicles:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchVehicles();
    const interval = setInterval(fetchVehicles, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '20px' }}>⏳ Cargando mapa...</div>;
  }

  return (
    <div style={{ width: '100%', height: '100%', padding: '15px', boxSizing: 'border-box' }}>
      <MapContainer center={[40.7128, -74.0060]} zoom={13} style={{ height: '100%', borderRadius: '6px' }}>
        <TileLayer
          url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
          attribution='&copy; OpenStreetMap contributors'
        />
        
        {vehicles.map((feature) => (
          feature.geometry && (
            <Marker 
              key={feature.properties.id} 
              position={[feature.geometry.coordinates[1], feature.geometry.coordinates[0]]}
              icon={vehicleIcon}
            >
              <Popup>
                <div>
                  <strong>🚗 {feature.properties.placa}</strong><br/>
                  Velocidad: {feature.properties.velocidad_actual} km/h<br/>
                  Combustible: {feature.properties.porcentaje_combustible}%<br/>
                  Estado: <span style={{ color: '#17B8A0' }}>{feature.properties.estado}</span>
                </div>
              </Popup>
            </Marker>
          )
        ))}
      </MapContainer>
    </div>
  );
}