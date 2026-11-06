import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

// Usage: <ProtectedRoute roles={['driver', 'admin']}><MaPage /></ProtectedRoute>
// Sans "roles", il suffit d'être connecté.
export default function ProtectedRoute({ roles, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <p className="muted">Chargement…</p>;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (roles && !roles.includes(user.role)) {
    return <p className="error">Accès refusé</p>;
  }
  return children;
}
