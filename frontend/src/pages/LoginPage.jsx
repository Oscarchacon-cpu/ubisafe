import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import api from '../services/api';

export default function LoginPage() {
  const [email, setEmail] = useState('admin@testco.com');
  const [password, setPassword] = useState('demo123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const response = await api.post('/auth/login', { email, password });
      const { token, usuario } = response.data;
      
      login(token, usuario);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      <div style={{ backgroundColor: 'white', padding: '40px', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)', width: '100%', maxWidth: '450px' }}>
        
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '30px', paddingBottom: '25px', borderBottom: '2px solid #e0e0e0' }}>
          <img src='/logo.png' alt='Ubisafe' style={{ height: '200px' }} />
        </div>
        
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', color: '#666', fontWeight: '500' }}>Email</label>
            <input
              type='email'
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box', fontSize: '14px' }}
            />
          </div>
          
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '5px', color: '#666', fontWeight: '500' }}>Contraseña</label>
            <input
              type='password'
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box', fontSize: '14px' }}
            />
          </div>
          
          {error && <div style={{ color: '#d32f2f', marginBottom: '15px', fontSize: '14px', padding: '10px', backgroundColor: '#ffebee', borderRadius: '4px' }}>❌ {error}</div>}
          
          <button
            type='submit'
            disabled={loading}
            style={{ width: '100%', padding: '12px', backgroundColor: '#17B8A0', color: 'white', border: 'none', borderRadius: '4px', cursor: loading ? 'wait' : 'pointer', fontSize: '16px', fontWeight: '500' }}
          >
            {loading ? '⏳ Conectando...' : '✅ Iniciar Sesión'}
          </button>
        </form>
        
        <p style={{ textAlign: 'center', marginTop: '20px', fontSize: '12px', color: '#999' }}>
          Demo: admin@testco.com / demo123
        </p>
      </div>
    </div>
  );
}