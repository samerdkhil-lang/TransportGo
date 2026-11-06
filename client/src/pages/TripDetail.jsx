import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { errorMessage } from '../api';
import { useAuth } from '../auth/AuthContext';

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeStyle: 'short' });

// Découpe [1..capacity] en rangées de 4 places (2 + couloir + 2)
function buildRows(capacity) {
  const seats = Array.from({ length: capacity }, (_, i) => i + 1);
  const rows = [];
  for (let i = 0; i < seats.length; i += 4) rows.push(seats.slice(i, i + 4));
  return rows;
}

export default function TripDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [trip, setTrip] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [booking, setBooking] = useState(false);

  const load = useCallback(
    () =>
      api
        .get(`/trips/${id}`)
        .then((res) => {
          setTrip(res.data.trip);
          setError('');
        })
        .catch((err) => setError(errorMessage(err))),
    [id]
  );

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function handleBook() {
    setBooking(true);
    setError('');
    try {
      await api.post('/reservations', { trip_id: trip.id, seat_number: selected });
      navigate('/reservations');
    } catch (err) {
      setError(errorMessage(err));
      // Place prise entre-temps par quelqu'un d'autre: on recharge le plan
      if (err.response?.status === 409) {
        setSelected(null);
        await load();
      }
    } finally {
      setBooking(false);
    }
  }

  if (loading) return <p className="muted">Chargement…</p>;
  if (!trip) {
    return (
      <div>
        <p className="error">{error || 'Trajet introuvable'}</p>
        <Link to="/">← Retour aux trajets</Link>
      </div>
    );
  }

  const taken = new Set(trip.taken_seats);
  const canBook = trip.status === 'planned' && new Date(trip.departure_at) > new Date();

  return (
    <div>
      <p>
        <Link to="/">← Retour aux trajets</Link>
      </p>

      <div className="card trip-header">
        <div>
          <h1>
            {trip.origin} <span className="arrow">→</span> {trip.destination}
          </h1>
          <div className="muted">{dateFormat.format(new Date(trip.departure_at))}</div>
        </div>
        <div className="trip-side">
          <div className="price">{Number(trip.price).toFixed(2)} TND</div>
          <div className="muted">{trip.seats_available} places libres sur {trip.capacity}</div>
        </div>
      </div>

      {!canBook ? (
        <p className="error">Ce trajet n'est plus ouvert à la réservation.</p>
      ) : (
        <>
          <h2>Choisissez votre place</h2>

          <div className="legend">
            <span><i className="dot free" /> Libre</span>
            <span><i className="dot taken" /> Occupée</span>
            <span><i className="dot selected" /> Votre choix</span>
          </div>

          <div className="bus">
            {buildRows(trip.capacity).map((row, index) => (
              <div className="seat-row" key={index}>
                {row.slice(0, 2).map((n) => (
                  <Seat key={n} n={n} taken={taken.has(n)} selected={selected === n} onPick={setSelected} />
                ))}
                <div className="aisle" />
                {row.slice(2).map((n) => (
                  <Seat key={n} n={n} taken={taken.has(n)} selected={selected === n} onPick={setSelected} />
                ))}
              </div>
            ))}
          </div>

          {error && <p className="error">{error}</p>}

          <div className="booking-bar">
            {!user ? (
              <p>
                <Link to="/login" state={{ from: `/trips/${trip.id}` }}>Connectez-vous</Link> pour réserver une place.
              </p>
            ) : (
              <button disabled={!selected || booking} onClick={handleBook}>
                {booking
                  ? 'Réservation…'
                  : selected
                    ? `Réserver la place ${selected} (${Number(trip.price).toFixed(2)} TND)`
                    : 'Sélectionnez une place'}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Seat({ n, taken, selected, onPick }) {
  const className = `seat${taken ? ' taken' : ''}${selected ? ' selected' : ''}`;
  return (
    <button
      type="button"
      className={className}
      disabled={taken}
      onClick={() => onPick(selected ? null : n)}
      aria-label={`Place ${n}${taken ? ' occupée' : ''}`}
    >
      {n}
    </button>
  );
}
