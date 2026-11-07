import axios from 'axios';

// En production (URL unique) ou en dev avec proxy Vite, l'API est sur /api
// Modifiable avec VITE_API_URL dans client/.env si l'API est sur un autre domaine
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
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
