import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import DashboardAnalytics from '../components/DashboardAnalytics';
import MapComponent from '../components/MapComponent';
import MapOperativo from '../components/MapOperativo';
import AlertsPanel from '../components/AlertsPanel';
import VehicleFilterPanel from '../components/VehicleFilterPanel';

export default function DashboardPage() {
  const [activeMenu, setActiveMenu] = useState('dashboard');
  const [profileOpen, setProfileOpen] = useState(false);
  const [vehiclesOpen, setVehiclesOpen] = useState(false);
  const profileRef = useRef(null);
  const vehiclesRef = useRef(null);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  // Cerrar dropdowns al hacer click afuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setProfileOpen(false);
      }
      if (vehiclesRef.current && !vehiclesRef.current.contains(event.target)) {
        setVehiclesOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const renderContent = () => {
    switch (activeMenu) {
      case 'dashboard':
        return <DashboardAnalytics />;
      case 'mapa-operativo':
        return <DashboardAnalytics />;
      case 'monitoreo':
        return <MapOperativo />;
      case 'alertas':
        return <AlertsPanel />;
      default:
        return <DashboardAnalytics />;
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#fafbfc' }}>
      {/* Sidebar */}
      <Sidebar activeMenu={activeMenu} onMenuChange={setActiveMenu} />

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{
          backgroundColor: 'white',
          padding: '15px 20px',
          borderBottom: '1px solid #e5e5e5',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'relative',
        }}>
          {/* Left: Botón Vehículos + Panel */}
          <div ref={vehiclesRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setVehiclesOpen(!vehiclesOpen)}
            style={{
              padding: '8px 12px',
              backgroundColor: '#f0f0f0',
              color: '#1E3A5F',
              border: '1px solid #e5e5e5',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '500',
            }}
          >
              Vehículos
            </button>
            {/* Panel de Filtro */}
            <VehicleFilterPanel isOpen={vehiclesOpen} onClose={() => setVehiclesOpen(false)} />
          </div>

          {/* Right: Profile Button */}
          <div style={{ position: 'relative' }} ref={profileRef}>
            <button
              onClick={() => setProfileOpen(!profileOpen)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                backgroundColor: '#f0f0f0',
                color: '#1E3A5F',
                border: '1px solid #e5e5e5',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: '500',
              }}
            >
              <span style={{ fontSize: '16px' }}>⚙</span>
              {user?.nombre || 'Usuario'}
              <span style={{ fontSize: '12px', marginLeft: '4px' }}>▼</span>
            </button>

            {/* Dropdown Menu */}
            {profileOpen && (
              <div style={{
                position: 'absolute',
                top: '40px',
                right: '0',
                backgroundColor: 'rgba(255, 255, 255, 0.85)',
                border: '1px solid rgba(229, 229, 229, 0.6)',
                borderRadius: '4px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                minWidth: '200px',
                zIndex: 1000,
                backdropFilter: 'blur(8px)',
              }}>
                <div style={{
                  padding: '4px 12px',
                  borderBottom: '1px solid #e5e5e5',
                }}>
                  <div style={{ color: '#999', marginBottom: '0px', fontSize: '12px', fontWeight: '500' }}>Rol</div>
                  <div style={{ color: '#1E3A5F', fontWeight: '600', marginBottom: '3px', fontSize: '14px' }}>
                    {user?.rol || 'Usuario'}
                  </div>
                  <div style={{ color: '#999', marginBottom: '0px', fontSize: '12px', fontWeight: '500' }}>Correo</div>
                  <div style={{ color: '#1E3A5F', fontSize: '13px' }}>
                    {user?.email}
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  style={{
                    width: '100%',
                    padding: '10px 15px',
                    backgroundColor: 'transparent',
                    color: '#d32f2f',
                    border: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '13px',
                    borderRadius: '4px',
                    transition: 'background-color 0.2s',
                  }}
                  onMouseOver={(e) => {
                    e.target.style.backgroundColor = '#ffebee';
                  }}
                  onMouseOut={(e) => {
                    e.target.style.backgroundColor = 'transparent';
                  }}
                >
                  Cerrar Sesión
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Content Area */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
