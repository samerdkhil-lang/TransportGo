import axios from 'axios';

// L'API tourne sur Windows, port 5000. Modifiable avec VITE_API_URL dans client/.env
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
});

// Ajoute automatiquement le token JWT à chaque requête
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Message d'erreur lisible à afficher à l'utilisateur
export function errorMessage(err) {
  return err.response?.data?.error || 'Impossible de joindre le serveur';
}

export default api;
