import { useState } from 'react';
import MapOperativo from './MapOperativo';

export default function OperativoContainer() {
  const [activeTab, setActiveTab] = useState('vehiculos');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
      {/* Tabs internas */}
      <div style={{
        display: 'flex',
        gap: '0',
        backgroundColor: 'white',
        borderBottom: '1px solid #e5e5e5',
        padding: '0 15px',
      }}>
        {[
          { id: 'vehiculos', label: '🚗 Vehículos' },
          { id: 'mapa-historico', label: '📍 Mapa Histórico' },
          { id: 'viajes', label: '🛣️ Viajes' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '12px 20px',
              border: 'none',
              backgroundColor: activeTab === tab.id ? 'white' : 'transparent',
              borderBottom: activeTab === tab.id ? '3px solid #17B8A0' : 'none',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: activeTab === tab.id ? '600' : '500',
              color: activeTab === tab.id ? '#17B8A0' : '#999',
              transition: 'all 0.2s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Contenido de tabs */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {activeTab === 'vehiculos' && <MapOperativo />}
        {activeTab === 'mapa-historico' && (
          <div style={{ padding: '30px', color: '#888' }}>
            <h2 style={{ color: '#1E3A5F', marginBottom: '15px' }}>Mapa Histórico</h2>
            <p>En desarrollo...</p>
          </div>
        )}
        {activeTab === 'viajes' && (
          <div style={{ padding: '30px', color: '#888' }}>
            <h2 style={{ color: '#1E3A5F', marginBottom: '15px' }}>Viajes</h2>
            <p>En desarrollo...</p>
          </div>
        )}
      </div>
    </div>
  );
}
