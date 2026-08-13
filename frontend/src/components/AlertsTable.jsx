export function AlertsTable({ alertas }) {
  if (alertas.length === 0) return <p>Sin alertas registradas.</p>;

  return (
    <table className="tabla-simple">
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Tipo</th>
          <th>Severidad</th>
        </tr>
      </thead>
      <tbody>
        {alertas.map((a, i) => (
          <tr key={i}>
            <td>{new Date(a.tiempo).toLocaleString()}</td>
            <td>{a.tipo_evento}</td>
            <td>{a.severidad ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
