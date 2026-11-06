import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import api, { errorMessage } from '../api';

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
const STATUS_LABELS = { confirmed: 'Confirmée', validated: 'Validée', cancelled: 'Annulée' };

export default function MyReservations() {
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(
    () =>
      api
        .get('/reservations/mine')
        .then((res) => setReservations(res.data.reservations))
        .catch((err) => setError(errorMessage(err))),
    []
  );

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function handleCancel(code) {
    if (!window.confirm('Annuler cette réservation ?')) return;
    setError('');
    try {
      await api.patch(`/reservations/${code}/cancel`);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div>
      <h1>Mes réservations</h1>

      {error && <p className="error">{error}</p>}
      {loading && <p className="muted">Chargement…</p>}
      {!loading && !error && reservations.length === 0 && (
        <p className="muted">
          Vous n'avez pas encore de réservation. <Link to="/">Trouver un trajet</Link>
        </p>
      )}

      <ul className="trip-list">
        {reservations.map((r) => {
          const active = r.status !== 'cancelled';
          const upcoming = new Date(r.departure_at) > new Date();
          const canCancel = r.status === 'confirmed' && r.trip_status === 'planned' && upcoming;

          return (
            <li key={r.id} className={`card reservation${active ? '' : ' cancelled'}`}>
              <div className="reservation-info">
                <div className="route">
                  {r.origin} <span className="arrow">→</span> {r.destination}
                </div>
                <div className="muted">{dateFormat.format(new Date(r.departure_at))}</div>
                <div>
                  Place <strong>{r.seat_number}</strong> · {Number(r.price).toFixed(2)} TND
                </div>
                <div className="code">{r.code}</div>
                <span className={`status ${r.status}`}>{STATUS_LABELS[r.status] || r.status}</span>
                {r.trip_status === 'cancelled' && r.status === 'cancelled' && (
                  <div className="muted">Ce trajet a été annulé.</div>
                )}
                {canCancel && (
                  <div>
                    <button className="secondary small" onClick={() => handleCancel(r.code)}>
                      Annuler
                    </button>
                  </div>
                )}
              </div>

              {active && (
                <div className="qr">
                  <QRCodeSVG value={r.code} size={120} />
                  <div className="muted">À présenter au conducteur</div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
