import L from 'leaflet';
import icono from 'leaflet/dist/images/marker-icon.png';
import iconoSombra from 'leaflet/dist/images/marker-shadow.png';

// react-leaflet no resuelve bien los iconos por defecto con el empaquetado de
// Vite, hay que apuntarlos a mano o los marcadores se ven rotos.
L.Marker.prototype.options.icon = L.icon({
  iconUrl: icono,
  shadowUrl: iconoSombra,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
