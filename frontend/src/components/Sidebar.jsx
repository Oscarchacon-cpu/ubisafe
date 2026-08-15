import { useState } from 'react';

export default function Sidebar({ activeMenu, onMenuChange }) {
  const [expanded, setExpanded] = useState(true);

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'mapa-operativo', label: 'Mapa Operativo', submenu: [
      { id: 'monitoreo', label: 'Monitoreo' }
    ]},
    { id: 'alertas', label: 'Alertas' },
  ];

  return (
    <div style={{
      width: expanded ? '220px' : '70px',
      backgroundColor: '#f8f9fa',
      borderRight: '1px solid #ddd',
      minHeight: '100vh',
      transition: 'width 0.3s ease',
      display: 'flex',
      flexDirection: 'column',
      padding: '20px 0',
    }}>
      {/* Toggle Button */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          alignSelf: 'center',
          width: '40px',
          height: '40px',
          border: '1px solid #ddd',
          backgroundColor: 'white',
          cursor: 'pointer',
          borderRadius: '4px',
          fontSize: '16px',
          marginBottom: '30px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {expanded ? '←' : '→'}
      </button>

      {/* Menu Items */}
      <nav style={{ flex: 1, paddingX: '10px' }}>
        {menuItems.map((item) => (
          <div key={item.id}>
            {/* Main Menu Item */}
            <button
              onClick={() => onMenuChange(item.id)}
              style={{
                width: 'calc(100% - 20px)',
                margin: '0 10px 8px 10px',
                padding: '12px',
                backgroundColor: activeMenu === item.id || activeMenu === item.submenu?.[0]?.id ? '#1E3A5F' : 'transparent',
                color: activeMenu === item.id || activeMenu === item.submenu?.[0]?.id ? 'white' : '#333',
                border: activeMenu === item.id || activeMenu === item.submenu?.[0]?.id ? '1px solid #1E3A5F' : '1px solid #ddd',
                textAlign: 'left',
                cursor: 'pointer',
                borderRadius: '4px',
                fontSize: '13px',
                fontWeight: activeMenu === item.id || activeMenu === item.submenu?.[0]?.id ? '600' : '500',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              onMouseOver={(e) => {
                if (activeMenu !== item.id && activeMenu !== item.submenu?.[0]?.id) {
                  e.target.style.backgroundColor = '#f0f0f0';
                }
              }}
              onMouseOut={(e) => {
                if (activeMenu !== item.id && activeMenu !== item.submenu?.[0]?.id) {
                  e.target.style.backgroundColor = 'transparent';
                }
              }}
            >
              {expanded ? item.label : item.label.charAt(0)}
            </button>

            {/* Submenu */}
            {item.submenu && expanded && (activeMenu === item.id || activeMenu === item.submenu[0]?.id) && (
              <div style={{ marginLeft: '10px', marginBottom: '8px' }}>
                {item.submenu.map((subitem) => (
                  <button
                    key={subitem.id}
                    onClick={() => onMenuChange(subitem.id)}
                    style={{
                      width: 'calc(100% - 20px)',
                      margin: '0 10px 6px 10px',
                      padding: '10px',
                      backgroundColor: activeMenu === subitem.id ? '#17B8A0' : 'transparent',
                      color: activeMenu === subitem.id ? 'white' : '#666',
                      border: activeMenu === subitem.id ? '1px solid #17B8A0' : '1px solid #ddd',
                      textAlign: 'left',
                      cursor: 'pointer',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: '500',
                      transition: 'all 0.2s',
                    }}
                  >
                    {subitem.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>
    </div>
  );
}
