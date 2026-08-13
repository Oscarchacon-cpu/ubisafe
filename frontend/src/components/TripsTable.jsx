export function TripsTable({ viajes }) {
  if (viajes.length === 0) return <p>Sin viajes registrados.</p>;

  return (
    <table className="tabla-simple">
      <thead>
        <tr>
          <th>Conductor</th>
          <th>Inicio</th>
          <th>Fin</th>
        </tr>
      </thead>
      <tbody>
        {viajes.map((v) => (
          <tr key={v.id}>
            <td>{v.conductor}</td>
            <td>{new Date(v.fecha_inicio).toLocaleString()}</td>
            <td>{v.fecha_fin ? new Date(v.fecha_fin).toLocaleString() : 'EN CURSO'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
