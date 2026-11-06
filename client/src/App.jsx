import { Link, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import Trips from './pages/Trips';
import TripDetail from './pages/TripDetail';
import MyReservations from './pages/MyReservations';
import Validation from './pages/Validation';
import Manage from './pages/Manage';
import Admin from './pages/Admin';

const ROLE_LABELS = { client: 'Client', driver: 'Conducteur', admin: 'Admin' };
const STAFF = ['driver', 'admin'];

function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/');
  }

  return (
    <header className="navbar">
      <Link to="/" className="brand">
        TransportGo
      </Link>
      <nav>
        <NavLink to="/" end>
          Trajets
        </NavLink>
        {user ? (
          <>
            <NavLink to="/reservations">Mes réservations</NavLink>
            {STAFF.includes(user.role) && (
              <>
                <NavLink to="/manage">{user.role === 'admin' ? 'Tous les trajets' : 'Mes trajets'}</NavLink>
                <NavLink to="/validate">Validation</NavLink>
              </>
            )}
            {user.role === 'admin' && <NavLink to="/admin">Administration</NavLink>}
            <span className="user">
              {user.name} <span className="badge">{ROLE_LABELS[user.role] || user.role}</span>
            </span>
            <button className="secondary small" onClick={handleLogout}>
              Déconnexion
            </button>
          </>
        ) : (
          <>
            <NavLink to="/login">Connexion</NavLink>
            <NavLink to="/register">Inscription</NavLink>
          </>
        )}
      </nav>
    </header>
  );
}

export default function App() {
  return (
    <>
      <Navbar />
      <main>
        <Routes>
          <Route path="/" element={<Trips />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/trips/:id" element={<TripDetail />} />
          <Route
            path="/reservations"
            element={
              <ProtectedRoute>
                <MyReservations />
              </ProtectedRoute>
            }
          />
          <Route
            path="/manage"
            element={
              <ProtectedRoute roles={STAFF}>
                <Manage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/validate"
            element={
              <ProtectedRoute roles={STAFF}>
                <Validation />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute roles={['admin']}>
                <Admin />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<p className="muted">Page introuvable.</p>} />
        </Routes>
      </main>
    </>
  );
}
