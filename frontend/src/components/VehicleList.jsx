import { Link } from 'react-router-dom';
import './VehicleList.css';

export function VehicleList({ vehiculos }) {
  if (vehiculos.length === 0) {
    return <p>No hay vehiculos registrados todavia.</p>;
  }

  return (
    <table className="tabla-vehiculos">
      <thead>
        <tr>
          <th>Patente</th>
          <th>Flota</th>
          <th>Velocidad</th>
          <th>Ignicion</th>
          <th>Ultima posicion</th>
        </tr>
      </thead>
      <tbody>
        {vehiculos.map((v) => (
          <tr key={v.id}>
            <td>
              <Link to={`/vehiculos/${v.id}`}>{v.patente}</Link>
            </td>
            <td>{v.flota_nombre}</td>
            <td>{v.ultima_posicion ? `${v.ultima_posicion.velocidad} km/h` : '—'}</td>
            <td>
              {v.ultima_posicion ? (
                <span className={v.ultima_posicion.ignicion ? 'estado-on' : 'estado-off'}>
                  {v.ultima_posicion.ignicion ? 'Encendida' : 'Apagada'}
                </span>
              ) : (
                '—'
              )}
            </td>
            <td>{v.ultima_posicion ? new Date(v.ultima_posicion.tiempo).toLocaleString() : 'Sin datos'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
