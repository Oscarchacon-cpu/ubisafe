import { useState, useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import api from '../services/api';
import { io } from 'socket.io-client';
import { WS_URL } from '../utils/constants';

export default function AlertsPanel() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const token = useAuthStore((state) => state.token);

  // Cargar alertas iniciales
  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const response = await api.get('/alertas');
        setAlerts(response.data.alertas || []);
      } catch (err) {
        console.error('Error cargando alertas:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAlerts();
  }, []);

  // WebSocket para alertas en tiempo real
  useEffect(() => {
    const socket = io(WS_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      console.log('✅ Conectado a WebSocket (AlertsPanel)');
      socket.emit('join-empresa');
    });

    socket.on('alerta-nueva', (nuevaAlerta) => {
      console.log('🚨 Alerta nueva:', nuevaAlerta);
      setAlerts((prev) => [nuevaAlerta, ...prev].slice(0, 50));
    });

    socket.on('disconnect', () => {
      console.log('❌ Desconectado de WebSocket');
    });

    return () => socket.disconnect();
  }, [token]);

  // Agrupar alertas por tipo
  const alertasPorTipo = {
    speeding: alerts.filter((a) => a.tipo_alerta_codigo === 'speeding'),
    combustible_bajo: alerts.filter((a) => a.tipo_alerta_codigo === 'combustible_bajo'),
    battery_low: alerts.filter((a) => a.tipo_alerta_codigo === 'battery_low'),
    sin_conductor: alerts.filter((a) => a.tipo_alerta_codigo === 'sin_conductor'),
  };

  const getAlertColor = (tipo) => {
    const colors = {
      sin_conductor: { bg: '#ffebee', border: '#d32f2f', icon: '🔴' },
      speeding: { bg: '#fff3e0', border: '#f57c00', icon: '🟠' },
      combustible_bajo: { bg: '#fffde7', border: '#fbc02d', icon: '🟡' },
      battery_low: { bg: '#fffde7', border: '#fbc02d', icon: '🟡' },
    };
    return colors[tipo] || { bg: '#f5f5f5', border: '#999', icon: '⚪' };
  };

  const getAlertLabel = (tipo) => {
    const labels = {
      sin_conductor: 'Sin Conductor',
      speeding: 'Exceso Velocidad',
      combustible_bajo: 'Combustible Bajo',
      battery_low: 'Batería Baja',
    };
    return labels[tipo] || tipo;
  };

  const renderAlertCard = (alerta) => {
    const color = getAlertColor(alerta.tipo_alerta_codigo);
    return (
      <div
        key={alerta.id}
        style={{
          backgroundColor: color.bg,
          borderLeft: `4px solid ${color.border}`,
          padding: '12px',
          borderRadius: '4px',
          marginBottom: '10px',
          fontSize: '13px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
          <span>{color.icon}</span>
          <strong style={{ color: '#1E3A5F' }}>{alerta.placa}</strong>
        </div>
        <div style={{ color: '#555', fontSize: '12px' }}>{alerta.descripcion}</div>
        <div style={{ color: '#999', fontSize: '11px', marginTop: '5px' }}>
          {new Date(alerta.timestamp).toLocaleTimeString('es-AR')}
        </div>
      </div>
    );
  };

  const renderAlertGroup = (tipo, alertasGrupo) => {
    if (alertasGrupo.length === 0) return null;

    const color = getAlertColor(tipo);
    return (
      <div key={tipo} style={{ marginBottom: '20px' }}>
        <div
          style={{
            backgroundColor: color.bg,
            border: `2px solid ${color.border}`,
            padding: '10px 12px',
            borderRadius: '4px',
            marginBottom: '10px',
            fontWeight: 'bold',
            color: '#1E3A5F',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>
            {color.icon} {getAlertLabel(tipo)}
          </span>
          <span style={{ backgroundColor: color.border, color: 'white', padding: '2px 8px', borderRadius: '12px', fontSize: '12px' }}>
            {alertasGrupo.length}
          </span>
        </div>
        {alertasGrupo.slice(0, 5).map(renderAlertCard)}
        {alertasGrupo.length > 5 && (
          <div style={{ textAlign: 'center', color: '#999', fontSize: '12px', padding: '10px' }}>
            +{alertasGrupo.length - 5} más...
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ padding: '20px', backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        ⏳ Cargando alertas...
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', padding: '20px 15px', boxSizing: 'border-box', overflowY: 'auto' }}>
      <h2 style={{ color: '#1E3A5F', marginTop: 0, marginBottom: '20px', fontSize: '24px', fontWeight: '600' }}>
        Panel de Alertas {alerts.length > 0 && <span style={{ backgroundColor: '#d32f2f', color: 'white', padding: '4px 12px', borderRadius: '4px', fontSize: '13px', marginLeft: '10px', fontWeight: '500' }}>{alerts.length}</span>}
      </h2>

      {alerts.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#999', padding: '40px 20px' }}>
          ✅ Ninguna alerta en este momento
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
          <div>
            {renderAlertGroup('sin_conductor', alertasPorTipo.sin_conductor)}
            {renderAlertGroup('speeding', alertasPorTipo.speeding)}
          </div>
          <div>
            {renderAlertGroup('combustible_bajo', alertasPorTipo.combustible_bajo)}
            {renderAlertGroup('battery_low', alertasPorTipo.battery_low)}
          </div>
        </div>
      )}
    </div>
  );
}
