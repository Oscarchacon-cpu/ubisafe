import { createContext, useContext, useEffect, useState } from 'react';
import { get, post } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    get('/auth/me').then((respuesta) => {
      if (respuesta.ok) setUsuario(respuesta.usuario);
      setCargando(false);
    });
  }, []);

  async function iniciarSesion(email, password) {
    const respuesta = await post('/auth/login', { email, password });
    if (respuesta.ok) setUsuario(respuesta.usuario);
    return respuesta;
  }

  async function cerrarSesion() {
    await post('/auth/logout');
    setUsuario(null);
  }

  return (
    <AuthContext.Provider value={{ usuario, cargando, iniciarSesion, cerrarSesion }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
