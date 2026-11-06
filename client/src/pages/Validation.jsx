import { useState } from 'react';
import api, { errorMessage } from '../api';

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
const STATUS_LABELS = { confirmed: 'Confirmée', validated: 'Validée', cancelled: 'Annulée' };

// Écran du conducteur: on saisit (ou colle) le code du billet, on vérifie, on valide à l'embarquement.
export default function Validation() {
  const [code, setCode] = useState('');
  const [reservation, setReservation] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleLookup(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    setReservation(null);
    setBusy(true);
    try {
      const res = await api.get(`/reservations/${encodeURIComponent(code.trim())}`);
      setReservation(res.data.reservation);
    } catch (err) {
      setError(
        err.response?.status === 403
          ? 'Ce billet ne correspond pas à un de vos trajets.'
          : errorMessage(err)
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleValidate() {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const res = await api.post(`/reservations/${reservation.code}/validate`);
      setReservation(res.data.reservation);
      setMessage('Billet validé : le passager peut monter.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function handleNext() {
    setCode('');
    setReservation(null);
    setError('');
    setMessage('');
  }

  return (
    <div>
      <h1>Validation des billets</h1>

      <form className="card inline-form" onSubmit={handleLookup}>
        <label>
          Code de réservation
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="RES-XXXXXXXXXX"
            autoFocus
            required
          />
        </label>
        <button type="submit" disabled={busy || !code.trim()}>
          Vérifier
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      {reservation && (
        <div className="card ticket">
          <div className="route">
            {reservation.origin} <span className="arrow">→</span> {reservation.destination}
          </div>
          <div className="muted">{dateFormat.format(new Date(reservation.departure_at))}</div>
          <div>
            Passager : <strong>{reservation.passenger_name}</strong>
          </div>
          <div>
            Place : <strong>{reservation.seat_number}</strong>
          </div>
          <div className="code">{reservation.code}</div>
          <span className={`status ${reservation.status}`}>
            {STATUS_LABELS[reservation.status] || reservation.status}
          </span>

          {message && <p className="success">{message}</p>}

          <div className="row-actions">
            {reservation.status === 'confirmed' && (
              <button onClick={handleValidate} disabled={busy}>
                Valider l'embarquement
              </button>
            )}
            {reservation.status === 'validated' && !message && (
              <p className="muted">Ce billet a déjà été validé.</p>
            )}
            {reservation.status === 'cancelled' && <p className="error">Cette réservation est annulée.</p>}
            <button className="secondary" onClick={handleNext}>
              Billet suivant
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
