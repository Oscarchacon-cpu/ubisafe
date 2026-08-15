import { useState, useEffect } from 'react';
import api from '../services/api';

export default function DashboardAnalytics() {
  const [stats, setStats] = useState({
    totalVehiculos: 0,
    vehiculosOnline: 0,
    totalAlertas: 0,
    conductoresActivos: 0,
    velocidadPromedio: 0,
    combustiblePromedio: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await api.get('/dashboard/resumen');
        setStats(response.data);
      } catch (err) {
        console.error('Error cargando estadísticas:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const kpiCards = [
    { title: 'Vehículos', value: stats.totalVehiculos, color: '#17B8A0' },
    { title: 'En Línea', value: stats.vehiculosOnline, color: '#17B8A0' },
    { title: 'Alertas', value: stats.totalAlertas, color: '#d32f2f' },
    { title: 'Conductores', value: stats.conductoresActivos, color: '#1E3A5F' },
    { title: 'Vel. Promedio', value: `${stats.velocidadPromedio || 0} km/h`, color: '#f57c00' },
    { title: 'Combustible', value: `${stats.combustiblePromedio || 0}%`, color: '#17B8A0' },
  ];

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>Cargando datos...</div>;
  }

  return (
    <div style={{ width: '100%', height: '100%', padding: '20px 15px', boxSizing: 'border-box', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ color: '#1E3A5F', margin: '0 0 3px 0', fontSize: '26px', fontWeight: '600' }}>
          Dashboard Operativo
        </h1>
        <p style={{ color: '#888', margin: 0, fontSize: '12px' }}>
          Análisis en tiempo real de tu flota
        </p>
      </div>

      {/* Grid de KPIs */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(6, 1fr)',
        gap: '12px',
        marginBottom: '30px',
        width: '100%',
      }}>
        {kpiCards.map((card, idx) => (
          <div
            key={idx}
            style={{
              backgroundColor: 'white',
              padding: '15px',
              borderRadius: '4px',
              border: '1px solid #e5e5e5',
              borderTop: `3px solid ${card.color}`,
            }}
          >
            <div style={{ fontSize: '11px', color: '#999', marginBottom: '8px', fontWeight: '500' }}>
              {card.title}
            </div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: card.color }}>
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {/* Sección: Conductores */}
      <div>
        <h2 style={{ color: '#1E3A5F', marginBottom: '10px', fontSize: '15px', fontWeight: '600' }}>
          Calificación de Conductores
        </h2>
        <div style={{
          backgroundColor: 'white',
          borderRadius: '6px',
          border: '1px solid #e5e5e5',
          overflow: 'hidden',
        }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '13px',
          }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e5e5', backgroundColor: '#f8f9fa' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: '#666', fontWeight: '600' }}>Conductor</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', color: '#666', fontWeight: '600' }}>Calificación</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', color: '#666', fontWeight: '600' }}>Viajes</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', color: '#666', fontWeight: '600' }}>Infracciones</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ padding: '12px 16px', color: '#333' }}>José García</td>
                <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                  <span style={{ color: '#17B8A0', fontWeight: '600' }}>9.5/10</span>
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'center', color: '#666' }}>45</td>
                <td style={{ padding: '12px 16px', textAlign: 'center', color: '#666' }}>0</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ padding: '12px 16px', color: '#333' }}>Carlos López</td>
                <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                  <span style={{ color: '#f57c00', fontWeight: '600' }}>7.2/10</span>
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'center', color: '#666' }}>38</td>
                <td style={{ padding: '12px 16px', textAlign: 'center', color: '#d32f2f' }}>3</td>
              </tr>
              <tr>
                <td style={{ padding: '12px 16px', color: '#333' }}>Pedro Martínez</td>
                <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                  <span style={{ color: '#d32f2f', fontWeight: '600' }}>6.1/10</span>
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'center', color: '#666' }}>52</td>
                <td style={{ padding: '12px 16px', textAlign: 'center', color: '#d32f2f' }}>7</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
