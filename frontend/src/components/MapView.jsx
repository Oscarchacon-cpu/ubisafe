import { GoogleMap, Marker, InfoWindow } from '@react-google-maps/api';
import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';

export function MapView({ vehiculos }) {
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const mapRef = useRef(null);
  const conPosicion = vehiculos.filter((v) => v.ultima_posicion);

  const handleMapLoad = (map) => {
    mapRef.current = map;
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
      map.panTo(map.getCenter());
    }, 100);
  };

  if (conPosicion.length === 0) {
    return <p>Ningun vehiculo tiene posicion todavia.</p>;
  }

  const centro = {
    lat: parseFloat(conPosicion[0].ultima_posicion.latitud),
    lng: parseFloat(conPosicion[0].ultima_posicion.longitud)
  };

  return (
    <div style={{ width: '100%', height: '400px', position: 'relative' }}>
      <GoogleMap
        onLoad={handleMapLoad}
        mapContainerStyle={{ width: '100%', height: '100%' }}
        center={centro}
        zoom={15}
        options={{ streetViewControl: false, fullscreenControl: false }}
      >
        {conPosicion.map((v) => (
          <Marker
            key={v.id}
            position={{
              lat: parseFloat(v.ultima_posicion.latitud),
              lng: parseFloat(v.ultima_posicion.longitud)
            }}
            onClick={() => setSelectedVehicle(v)}
          />
        ))}
        {selectedVehicle && (
          <InfoWindow
            position={{
              lat: parseFloat(selectedVehicle.ultima_posicion.latitud),
              lng: parseFloat(selectedVehicle.ultima_posicion.longitud)
            }}
            onCloseClick={() => setSelectedVehicle(null)}
          >
            <div>
              <strong>{selectedVehicle.patente}</strong>
              <br />
              {selectedVehicle.ultima_posicion.velocidad} km/h
              <br />
              <Link to={`/vehiculos/${selectedVehicle.id}`}>Ver ficha</Link>
            </div>
          </InfoWindow>
        )}
      </GoogleMap>
    </div>
  );
}