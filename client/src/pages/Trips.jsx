import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errorMessage } from '../api';

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

export default function Trips() {
  const [filters, setFilters] = useState({ origin: '', destination: '', date: '' });
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  function load(f, withLoading = true) {
    if (withLoading) setLoading(true);
    setError('');
    // On n'envoie que les filtres remplis
    const params = Object.fromEntries(Object.entries(f).filter(([, v]) => v));
    api
      .get('/trips', { params })
      .then((res) => setTrips(res.data.trips))
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }

  // Premier chargement: tous les trajets à venir
  useEffect(() => {
    load({}, false);
  }, []);

  function handleChange(e) {
    setFilters({ ...filters, [e.target.name]: e.target.value });
  }

  function handleSubmit(e) {
    e.preventDefault();
    load(filters);
  }

  function reset() {
    const empty = { origin: '', destination: '', date: '' };
    setFilters(empty);
    load(empty);
  }

  return (
    <div>
      <h1>Trouver un trajet</h1>

      <form className="card search" onSubmit={handleSubmit}>
        <label>
          Départ
          <input name="origin" value={filters.origin} onChange={handleChange} placeholder="Tunis" />
        </label>
        <label>
          Arrivée
          <input name="destination" value={filters.destination} onChange={handleChange} placeholder="Sousse" />
        </label>
        <label>
          Date
          <input type="date" name="date" value={filters.date} onChange={handleChange} />
        </label>
        <div className="actions">
          <button type="submit">Rechercher</button>
          <button type="button" className="secondary" onClick={reset}>
            Effacer
          </button>
        </div>
      </form>

      {error && <p className="error">{error}</p>}
      {loading && <p className="muted">Chargement…</p>}
      {!loading && !error && trips.length === 0 && <p className="muted">Aucun trajet trouvé.</p>}

      <ul className="trip-list">
        {trips.map((t) => (
          <li key={t.id} className="card trip">
            <div>
              <div className="route">
                {t.origin} <span className="arrow">→</span> {t.destination}
              </div>
              <div className="muted">{dateFormat.format(new Date(t.departure_at))}</div>
            </div>
            <div className="trip-side">
              <div className="price">{Number(t.price).toFixed(2)} TND</div>
              <div className="muted">
                {t.seats_available > 0 ? `${t.seats_available} places libres` : 'Complet'}
              </div>
              {t.seats_available > 0 ? (
                <Link className="button" to={`/trips/${t.id}`}>
                  Réserver
                </Link>
              ) : (
                <span className="button disabled">Complet</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
