import { useEffect, useState } from 'react';
import { GoogleMap, Marker, Polyline } from '@react-google-maps/api';

const mapContainerStyle = {
  height: '400px',
  width: '100%',
  borderRadius: '8px'
};

const mapOptions = {
  zoom: 16,
  mapTypeId: 'roadmap'
};

export function VehicleMap({ posicion, historial }) {
  const [center, setCenter] = useState(null);

  useEffect(() => {
    if (posicion) {
      setCenter({
        lat: posicion.latitud,
        lng: posicion.longitud
      });
    }
  }, [posicion]);

  if (!posicion) return <p>Sin posicion todavia.</p>;
  if (!center) return <p>Cargando mapa...</p>;

  const polylinePoints = historial.map((h) => ({
    lat: h.latitud,
    lng: h.longitud
  }));

  return (
    <GoogleMap
      mapContainerStyle={mapContainerStyle}
      center={center}
      options={mapOptions}
    >
      <Marker position={center} title={`${posicion.velocidad} km/h`} />
      {polylinePoints.length > 1 && (
        <Polyline
          path={polylinePoints}
          options={{
            strokeColor: '#0b2e59',
            strokeWeight: 3
          }}
        />
      )}
    </GoogleMap>
  );
}