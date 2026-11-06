import { createContext, useContext, useEffect, useState } from 'react';
import api from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // Tant qu'on vérifie un token déjà stocké, on est en "chargement"
  const [loading, setLoading] = useState(Boolean(localStorage.getItem('token')));

  // Au démarrage: si un token existe, on récupère l'utilisateur correspondant
  useEffect(() => {
    if (!localStorage.getItem('token')) return;
    api
      .get('/auth/me')
      .then((res) => setUser(res.data.user))
      .catch((err) => {
        // Token expiré ou invalide: on se déconnecte. Une simple panne réseau garde le token.
        if (err.response?.status === 401) localStorage.removeItem('token');
      })
      .finally(() => setLoading(false));
  }, []);

  function saveSession(data) {
    localStorage.setItem('token', data.token);
    setUser(data.user);
    return data.user;
  }

  async function login(email, password) {
    const res = await api.post('/auth/login', { email, password });
    return saveSession(res.data);
  }

  async function register(name, email, password) {
    const res = await api.post('/auth/register', { name, email, password });
    return saveSession(res.data);
  }

  function logout() {
    localStorage.removeItem('token');
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
