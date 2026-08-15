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

export default function MapOperativo() {
  const [vehicles, setVehicles] = useState([]);
  const [filteredVehicles, setFilteredVehicles] = useState([]);
  const [selectedVehicleOnMap, setSelectedVehicleOnMap] = useState(null);
  const [mapCenter, setMapCenter] = useState([40.7128, -74.0060]);
  const [mapZoom, setMapZoom] = useState(13);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchVehicles = async () => {
      try {
        const response = await api.get('/dashboard/mapa');
        const vehicleList = response.data.features || [];
        setVehicles(vehicleList);
        setFilteredVehicles(vehicleList);
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

  const handleSelectVehicle = (vehicle) => {
    setSelectedVehicleOnMap(vehicle);
    const coords = vehicle.geometry.coordinates;
    setMapCenter([coords[1], coords[0]]);
    setMapZoom(16);
  };

  if (loading) {
    return <div style={{ padding: '20px', textAlign: 'center' }}>Cargando...</div>;
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Mapa */}
      <MapContainer center={mapCenter} zoom={mapZoom} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
          attribution='&copy; OpenStreetMap contributors'
        />

        {filteredVehicles.map((feature, idx) => (
          feature.geometry && (
            <Marker
              key={idx}
              position={[feature.geometry.coordinates[1], feature.geometry.coordinates[0]]}
              icon={vehicleIcon}
              eventHandlers={{
                click: () => handleSelectVehicle(feature),
              }}
            >
              <Popup>
                <div style={{ fontSize: '12px' }}>
                  <strong>{feature.properties.placa}</strong>
                  <div>Velocidad: {feature.properties.velocidad_actual || 0} km/h</div>
                  <div>Combustible: {feature.properties.porcentaje_combustible || 0}%</div>
                </div>
              </Popup>
            </Marker>
          )
        ))}
      </MapContainer>

      {/* Panel Tarjeta Vehículo Seleccionado */}
      {selectedVehicleOnMap && (
        <div style={{
          position: 'absolute',
          bottom: '15px',
          left: '15px',
          backgroundColor: 'rgba(255, 255, 255, 0.90)',
          borderRadius: '10px',
          border: '3px solid #17B8A0',
          boxShadow: '0 6px 20px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.5)',
          zIndex: 1000,
          padding: '16px',
          maxWidth: '320px',
          backdropFilter: 'blur(10px)',
        }}>
          {/* Botón Cerrar (X) */}
          <button
            onClick={() => setSelectedVehicleOnMap(null)}
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              backgroundColor: 'transparent',
              border: 'none',
              fontSize: '20px',
              color: '#999',
              cursor: 'pointer',
              padding: '0',
              width: '24px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 0.2s',
            }}
            onMouseOver={(e) => e.target.style.color = '#1E3A5F'}
            onMouseOut={(e) => e.target.style.color = '#999'}
          >
            ✕
          </button>

          {/* Header con Placa */}
          <div style={{ marginBottom: '14px', paddingBottom: '12px', borderBottom: '2px solid #17B8A0', paddingRight: '30px' }}>
            <div style={{ fontSize: '9px', color: '#666', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Vehículo</div>
            <div style={{ fontSize: '18px', fontWeight: '800', color: '#1E3A5F', marginBottom: '8px', letterSpacing: '-0.5px' }}>
              {selectedVehicleOnMap.properties.placa}
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
              <span style={{
                backgroundColor: '#10b981',
                color: 'white',
                padding: '4px 10px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: '600',
              }}>
                ● En Línea
              </span>
              <span style={{
                backgroundColor: '#10b981',
                color: 'white',
                padding: '4px 10px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: '600',
              }}>
                ● Encendido
              </span>
            </div>
            {selectedVehicleOnMap.properties.conductor && (
              <div style={{ fontSize: '11px', color: '#666' }}>
                Conductor: <span style={{ fontWeight: '600', color: '#1E3A5F' }}>{selectedVehicleOnMap.properties.conductor}</span>
              </div>
            )}
          </div>

          {/* Datos Principales */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px',
            marginBottom: '12px',
          }}>
            <div style={{ backgroundColor: 'rgba(245, 124, 0, 0.08)', padding: '10px', borderRadius: '6px', borderLeft: '3px solid #f57c00' }}>
              <div style={{ color: '#999', marginBottom: '4px', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase' }}>Velocidad</div>
              <div style={{ fontWeight: '700', color: '#f57c00', fontSize: '16px' }}>
                {selectedVehicleOnMap.properties.velocidad_actual || 0}
              </div>
              <div style={{ fontSize: '10px', color: '#999', marginTop: '2px' }}>km/h</div>
            </div>
            <div style={{ backgroundColor: 'rgba(23, 184, 160, 0.08)', padding: '10px', borderRadius: '6px', borderLeft: '3px solid #17B8A0' }}>
              <div style={{ color: '#999', marginBottom: '4px', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase' }}>Combustible</div>
              <div style={{ fontWeight: '700', color: '#17B8A0', fontSize: '16px' }}>
                {selectedVehicleOnMap.properties.porcentaje_combustible || 0}
              </div>
              <div style={{ fontSize: '10px', color: '#999', marginTop: '2px' }}>%</div>
            </div>
          </div>

          {/* Timestamp */}
          {selectedVehicleOnMap.properties.timestamp && (
            <div style={{ paddingTop: '10px', borderTop: '1px solid #e5e5e5', fontSize: '9px', color: '#999', fontStyle: 'italic' }}>
              Actualizado: {new Date(selectedVehicleOnMap.properties.timestamp).toLocaleString('es-AR')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
