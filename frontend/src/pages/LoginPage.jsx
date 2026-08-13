import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import './LoginPage.css';

export function LoginPage() {
  const { iniciarSesion } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function manejarEnvio(evento) {
    evento.preventDefault();
    setError('');
    const respuesta = await iniciarSesion(email, password);
    if (respuesta.ok) {
      navigate('/');
    } else {
      setError(respuesta.error || 'No se pudo iniciar sesion');
    }
  }

  return (
    <div className="pantalla-login">
      <form className="tarjeta-login" onSubmit={manejarEnvio}>
        <h1>UBISAFE</h1>
        <p className="subtitulo">GPS Tracking | Protección</p>

        <label htmlFor="email">Email</label>
        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />

        <label htmlFor="password">Contraseña</label>
        <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />

        {error && <p className="error">{error}</p>}

        <button type="submit">Ingresar</button>
      </form>
    </div>
  );
}
