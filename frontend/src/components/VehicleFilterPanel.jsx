import { useEffect, useState } from 'react';
import api from '../services/api';

export default function VehicleFilterPanel({ isOpen, onClose }) {
  const [vehicles, setVehicles] = useState([]);
  const [searchPatente, setSearchPatente] = useState('');
  const [filterCliente, setFilterCliente] = useState('');
  const [filterFlota, setFilterFlota] = useState('');
  const [selectedVehicles, setSelectedVehicles] = useState({});

  useEffect(() => {
    const fetchVehicles = async () => {
      try {
        const response = await api.get('/dashboard/mapa');
        const vehicleList = response.data.features || [];
        setVehicles(vehicleList);
        const initialSelected = {};
        vehicleList.forEach((v) => {
          initialSelected[v.properties.placa] = true;
        });
        setSelectedVehicles(initialSelected);
      } catch (err) {
        console.error('Error fetching vehicles:', err);
      }
    };

    if (isOpen) {
      fetchVehicles();
    }
  }, [isOpen]);

  const toggleVehicleSelection = (placa) => {
    setSelectedVehicles((prev) => ({
      ...prev,
      [placa]: !prev[placa],
    }));
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: '65px',
      left: '250px',
      backgroundColor: 'rgba(255, 255, 255, 0.85)',
      border: '1px solid rgba(229, 229, 229, 0.6)',
      borderRadius: '6px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      minWidth: '320px',
      maxHeight: '500px',
      overflowY: 'auto',
      zIndex: 1000,
      padding: '15px',
      backdropFilter: 'blur(8px)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px',
        paddingBottom: '10px',
        borderBottom: '1px solid #e5e5e5',
      }}>
        <span style={{ fontSize: '12px', fontWeight: '600', color: '#1E3A5F' }}>
          Filtros de Vehículos
        </span>
        <button
          onClick={onClose}
          style={{
            backgroundColor: 'transparent',
            border: 'none',
            color: '#999',
            cursor: 'pointer',
            fontSize: '16px',
          }}
        >
          ✕
        </button>
      </div>

      {/* Búsqueda por Patente */}
      <div style={{ marginBottom: '12px' }}>
        <label style={{ fontSize: '11px', color: '#999', display: 'block', marginBottom: '5px', fontWeight: '500' }}>
          Patente
        </label>
        <input
          type="text"
          placeholder="Buscar..."
          value={searchPatente}
          onChange={(e) => setSearchPatente(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 10px',
            border: '1px solid #e5e5e5',
            borderRadius: '4px',
            fontSize: '12px',
            boxSizing: 'border-box',
            backgroundColor: 'rgba(255, 255, 255, 0.8)',
          }}
        />
      </div>

      {/* Filtros Cliente y Flota */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
        <div>
          <label style={{ fontSize: '11px', color: '#999', display: 'block', marginBottom: '5px', fontWeight: '500' }}>
            Cliente
          </label>
          <select
            value={filterCliente}
            onChange={(e) => setFilterCliente(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 10px',
              border: '1px solid #e5e5e5',
              borderRadius: '4px',
              fontSize: '12px',
              backgroundColor: 'rgba(255, 255, 255, 0.8)',
              boxSizing: 'border-box',
            }}
          >
            <option value="">Todos</option>
            <option value="cliente1">Cliente 1</option>
            <option value="cliente2">Cliente 2</option>
          </select>
        </div>

        <div>
          <label style={{ fontSize: '11px', color: '#999', display: 'block', marginBottom: '5px', fontWeight: '500' }}>
            Flota
          </label>
          <select
            value={filterFlota}
            onChange={(e) => setFilterFlota(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 10px',
              border: '1px solid #e5e5e5',
              borderRadius: '4px',
              fontSize: '12px',
              backgroundColor: 'rgba(255, 255, 255, 0.8)',
              boxSizing: 'border-box',
            }}
          >
            <option value="">Todas</option>
            <option value="flota1">Flota 1</option>
            <option value="flota2">Flota 2</option>
          </select>
        </div>
      </div>

      {/* Divisor */}
      <div style={{ borderTop: '1px solid #e5e5e5', marginBottom: '12px' }} />

      {/* Lista de Vehículos */}
      <div style={{ fontSize: '11px', fontWeight: '500', color: '#999', marginBottom: '8px' }}>
        Vehículos ({Object.values(selectedVehicles).filter(Boolean).length})
      </div>

      {vehicles.map((vehicle) => (
        <div
          key={vehicle.properties.placa}
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '10px',
            marginBottom: '8px',
            backgroundColor: 'white',
            border: '2px solid #e5e5e5',
            borderRadius: '6px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          }}
          onClick={() => toggleVehicleSelection(vehicle.properties.placa)}
          onMouseOver={(e) => {
            e.currentTarget.style.borderColor = '#17B8A0';
            e.currentTarget.style.boxShadow = '0 2px 6px rgba(23, 184, 160, 0.15)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.borderColor = '#e5e5e5';
            e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)';
          }}
        >
          <input
            type="checkbox"
            checked={selectedVehicles[vehicle.properties.placa] || false}
            onChange={() => toggleVehicleSelection(vehicle.properties.placa)}
            style={{ marginRight: '10px', cursor: 'pointer', width: '16px', height: '16px' }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: '700', color: '#1E3A5F', fontSize: '13px', marginBottom: '4px' }}>
              {vehicle.properties.placa}
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
              <span style={{ color: '#10b981', fontSize: '11px', fontWeight: '600' }}>● En Línea</span>
              <span style={{ color: '#10b981', fontSize: '11px', fontWeight: '600' }}>● Encendido</span>
            </div>
            {vehicle.properties.conductor && (
              <div style={{ color: '#666', fontSize: '11px', marginBottom: '3px' }}>
                Conductor: <span style={{ fontWeight: '600' }}>{vehicle.properties.conductor}</span>
              </div>
            )}
            <div style={{ color: '#f57c00', fontSize: '12px', fontWeight: '600', marginTop: '2px' }}>
              {vehicle.properties.velocidad_actual || 0} km/h
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
