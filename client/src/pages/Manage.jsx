import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errorMessage } from '../api';
import { useAuth } from '../auth/AuthContext';

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
const TRIP_STATUS = { planned: 'Prévu', departed: 'Parti', cancelled: 'Annulé', completed: 'Terminé' };
const RES_STATUS = { confirmed: 'Confirmée', validated: 'Validée' };
const EMPTY_FORM = { origin: '', destination: '', departure_at: '', price: '', vehicle_id: '', driver_id: '' };

// Espace conducteur/admin: créer des trajets, voir les passagers, changer l'état d'un trajet.
export default function Manage() {
  const { user } = useAuth();
  const isAdmin = user.role === 'admin';

  const [trips, setTrips] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [passengers, setPassengers] = useState({}); // { [tripId]: liste des passagers }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const requests = [api.get('/trips/mine'), api.get('/vehicles')];
      if (isAdmin) requests.push(api.get('/users', { params: { role: 'driver' } }));
      const [t, v, d] = await Promise.all(requests);
      setTrips(t.data.trips);
      setVehicles(v.data.vehicles.filter((x) => x.status === 'available'));
      if (d) setDrivers(d.data.users);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [isAdmin]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const body = {
        origin: form.origin,
        destination: form.destination,
        departure_at: form.departure_at,
        price: form.price,
        vehicle_id: Number(form.vehicle_id),
      };
      if (isAdmin && form.driver_id) body.driver_id = Number(form.driver_id);
      await api.post('/trips', body);
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function togglePassengers(id) {
    if (passengers[id]) {
      setPassengers((p) => {
        const next = { ...p };
        delete next[id];
        return next;
      });
      return;
    }
    try {
      const res = await api.get(`/trips/${id}/reservations`);
      setPassengers((p) => ({ ...p, [id]: res.data.reservations }));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function changeStatus(id, status, confirmMessage) {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setError('');
    try {
      await api.patch(`/trips/${id}`, { status });
      setPassengers({});
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (loading) return <p className="muted">Chargement…</p>;

  return (
    <div>
      <h1>{isAdmin ? 'Tous les trajets' : 'Mes trajets'}</h1>

      <h2>Nouveau trajet</h2>
      {vehicles.length === 0 ? (
        <p className="muted">
          Aucun véhicule disponible pour le moment.
          {isAdmin && (
            <>
              {' '}
              <Link to="/admin">Ajouter un véhicule</Link>
            </>
          )}
        </p>
      ) : (
        <form className="card grid-form" onSubmit={handleCreate}>
          <label>
            Départ
            <input name="origin" value={form.origin} onChange={handleChange} maxLength={100} required />
          </label>
          <label>
            Arrivée
            <input name="destination" value={form.destination} onChange={handleChange} maxLength={100} required />
          </label>
          <label>
            Date et heure de départ
            <input type="datetime-local" name="departure_at" value={form.departure_at} onChange={handleChange} required />
          </label>
          <label>
            Prix (TND)
            <input type="number" name="price" min="0" step="0.01" value={form.price} onChange={handleChange} required />
          </label>
          <label>
            Véhicule
            <select name="vehicle_id" value={form.vehicle_id} onChange={handleChange} required>
              <option value="">Choisir…</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plate} · {v.model} ({v.capacity} places)
                </option>
              ))}
            </select>
          </label>
          {isAdmin && (
            <label>
              Conducteur
              <select name="driver_id" value={form.driver_id} onChange={handleChange}>
                <option value="">Aucun (à assigner plus tard)</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.email})
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="actions">
            <button type="submit" disabled={saving}>
              {saving ? 'Création…' : 'Créer le trajet'}
            </button>
          </div>
        </form>
      )}

      {error && <p className="error">{error}</p>}

      <h2 className="section-title">Trajets</h2>
      {trips.length === 0 && <p className="muted">Aucun trajet pour le moment.</p>}

      <ul className="trip-list">
        {trips.map((t) => (
          <li key={t.id} className="card">
            <div className="trip">
              <div>
                <div className="route">
                  {t.origin} <span className="arrow">→</span> {t.destination}
                </div>
                <div className="muted">{dateFormat.format(new Date(t.departure_at))}</div>
                <div className="muted">
                  {t.seats_taken}/{t.capacity} places réservées · {Number(t.price).toFixed(2)} TND
                </div>
              </div>
              <span className={`status trip-${t.status}`}>{TRIP_STATUS[t.status] || t.status}</span>
            </div>

            <div className="row-actions">
              <button className="secondary small" onClick={() => togglePassengers(t.id)}>
                {passengers[t.id] ? 'Masquer les passagers' : 'Passagers'}
              </button>
              {t.status === 'planned' && (
                <button className="secondary small" onClick={() => changeStatus(t.id, 'departed')}>
                  Marquer parti
                </button>
              )}
              {t.status === 'departed' && (
                <button className="secondary small" onClick={() => changeStatus(t.id, 'completed')}>
                  Marquer terminé
                </button>
              )}
              {t.status === 'planned' && (
                <button
                  className="danger small"
                  onClick={() =>
                    changeStatus(t.id, 'cancelled', 'Annuler ce trajet ? Les réservations confirmées seront annulées.')
                  }
                >
                  Annuler le trajet
                </button>
              )}
            </div>

            {passengers[t.id] && (
              <div className="passengers">
                {passengers[t.id].length === 0 ? (
                  <p className="muted">Aucun passager.</p>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Place</th>
                        <th>Passager</th>
                        <th>Code</th>
                        <th>Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {passengers[t.id].map((r) => (
                        <tr key={r.code}>
                          <td>{r.seat_number}</td>
                          <td>{r.passenger_name}</td>
                          <td className="code">{r.code}</td>
                          <td>{RES_STATUS[r.status] || r.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
