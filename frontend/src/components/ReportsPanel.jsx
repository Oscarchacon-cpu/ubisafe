export function ReportsPanel({ tiempos, calificaciones }) {
  return (
    <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
      <div>
        <h3>Tiempos de conduccion (30 dias)</h3>
        {tiempos.length === 0 ? (
          <p>Sin datos.</p>
        ) : (
          <ul>
            {tiempos.map((t, i) => (
              <li key={i}>
                {t.nombre}: {t.viajes} viaje(s), {t.horas} horas
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3>Calificacion de conductores</h3>
        {calificaciones.length === 0 ? (
          <p>Sin datos.</p>
        ) : (
          <ul>
            {calificaciones.map((c, i) => (
              <li key={i}>
                {c.nombre}: {c.calificacion}/100 ({c.excesos_velocidad} exceso(s), {c.alertas_sabotaje} alerta(s))
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
