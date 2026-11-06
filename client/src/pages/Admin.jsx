import { useCallback, useEffect, useState } from 'react';
import api, { errorMessage } from '../api';
import { useAuth } from '../auth/AuthContext';

const VEHICLE_STATUS = { available: 'Disponible', maintenance: 'Maintenance', retired: 'Retiré' };
const ROLE_LABELS = { client: 'Client', driver: 'Conducteur', admin: 'Admin' };

// Administration: parc de véhicules et rôles des utilisateurs.
export default function Admin() {
  const { user: me } = useAuth();
  const [vehicles, setVehicles] = useState([]);
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ plate: '', model: '', capacity: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [v, u] = await Promise.all([api.get('/vehicles'), api.get('/users')]);
      setVehicles(v.data.vehicles);
      setUsers(u.data.users);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function addVehicle(e) {
    e.preventDefault();
    setError('');
    setNotice('');
    setSaving(true);
    try {
      await api.post('/vehicles', {
        plate: form.plate,
        model: form.model,
        capacity: Number(form.capacity),
      });
      setForm({ plate: '', model: '', capacity: '' });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function changeVehicleStatus(id, status) {
    setError('');
    setNotice('');
    try {
      await api.patch(`/vehicles/${id}`, { status });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function changeRole(id, role) {
    setError('');
    setNotice('');
    try {
      await api.patch(`/users/${id}/role`, { role });
      setNotice("Rôle modifié. L'utilisateur doit se reconnecter pour que le changement s'applique.");
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (loading) return <p className="muted">Chargement…</p>;

  return (
    <div>
      <h1>Administration</h1>

      {error && <p className="error">{error}</p>}
      {notice && <p className="success">{notice}</p>}

      <h2>Véhicules</h2>
      <form className="card grid-form" onSubmit={addVehicle}>
        <label>
          Plaque
          <input name="plate" value={form.plate} onChange={handleChange} maxLength={20} placeholder="123-TUN-4567" required />
        </label>
        <label>
          Modèle
          <input name="model" value={form.model} onChange={handleChange} maxLength={100} required />
        </label>
        <label>
          Nombre de places
          <input type="number" name="capacity" min="1" max="120" value={form.capacity} onChange={handleChange} required />
        </label>
        <div className="actions">
          <button type="submit" disabled={saving}>
            {saving ? 'Ajout…' : 'Ajouter le véhicule'}
          </button>
        </div>
      </form>

      <div className="card table-card">
        <table>
          <thead>
            <tr>
              <th>Plaque</th>
              <th>Modèle</th>
              <th>Places</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map((v) => (
              <tr key={v.id}>
                <td>{v.plate}</td>
                <td>{v.model}</td>
                <td>{v.capacity}</td>
                <td>
                  <select value={v.status} onChange={(e) => changeVehicleStatus(v.id, e.target.value)}>
                    {Object.entries(VEHICLE_STATUS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="section-title">Utilisateurs</h2>
      <div className="card table-card">
        <table>
          <thead>
            <tr>
              <th>Nom</th>
              <th>Email</th>
              <th>Rôle</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>
                  <select
                    value={u.role}
                    disabled={u.id === me.id}
                    title={u.id === me.id ? 'Vous ne pouvez pas modifier votre propre rôle' : ''}
                    onChange={(e) => changeRole(u.id, e.target.value)}
                  >
                    {Object.entries(ROLE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
