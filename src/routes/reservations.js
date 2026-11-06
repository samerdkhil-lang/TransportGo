const express = require('express');
const crypto = require('crypto');
const pool = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const bad = (res, message) => res.status(400).json({ error: message });

function toId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Numéro de réservation unique, aussi utilisé dans le QR Code. Ex: RES-9F3A0C71BE
const newCode = () => `RES-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;

const RESERVATION_SELECT = `
  SELECT r.id, r.code, r.trip_id, r.seat_number, r.status, r.created_at, r.validated_at,
         r.user_id, u.name AS passenger_name,
         t.origin, t.destination, t.departure_at, t.price,
         t.status AS trip_status, t.driver_id
  FROM reservations r
  JOIN trips t ON t.id = r.trip_id
  JOIN users u ON u.id = r.user_id`;

async function findByCode(code) {
  const [rows] = await pool.execute(`${RESERVATION_SELECT} WHERE r.code = ?`, [code]);
  return rows[0] || null;
}

async function findById(id) {
  const [rows] = await pool.execute(`${RESERVATION_SELECT} WHERE r.id = ?`, [id]);
  return rows[0] || null;
}

// POST /api/reservations   { trip_id, seat_number }
// Le doublon de place est refusé par MySQL (seat_lock unique): l'API ne l'écrit jamais.
router.post('/', authenticate, wrap(async (req, res) => {
  const tripId = toId(req.body?.trip_id);
  const seat = toId(req.body?.seat_number);
  if (!tripId || !seat) {
    return bad(res, 'trip_id et seat_number (entiers positifs) sont obligatoires');
  }

  const [rows] = await pool.execute(
    `SELECT t.status, t.departure_at > NOW() AS upcoming, v.capacity
       FROM trips t
       JOIN vehicles v ON v.id = t.vehicle_id
      WHERE t.id = ?`,
    [tripId]
  );
  const trip = rows[0];
  if (!trip) return res.status(404).json({ error: 'Trajet introuvable' });

  if (trip.status !== 'planned' || !trip.upcoming) {
    return res.status(409).json({ error: 'Ce trajet n\'est plus ouvert à la réservation' });
  }
  if (seat > trip.capacity) {
    return bad(res, `Place invalide : ce véhicule a ${trip.capacity} places`);
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const [result] = await pool.execute(
        'INSERT INTO reservations (code, user_id, trip_id, seat_number) VALUES (?, ?, ?, ?)',
        [newCode(), req.user.id, tripId, seat]
      );
      return res.status(201).json({ reservation: await findById(result.insertId) });
    } catch (err) {
      if (err.code !== 'ER_DUP_ENTRY') throw err;
      // Collision de code (très rare): on retente avec un autre code.
      if (String(err.message).includes('uk_reservations_code')) continue;
      return res.status(409).json({ error: 'Cette place est déjà réservée' });
    }
  }
  return res.status(500).json({ error: 'Impossible de générer un code de réservation' });
}));

// GET /api/reservations/mine
router.get('/mine', authenticate, wrap(async (req, res) => {
  const [rows] = await pool.execute(
    `${RESERVATION_SELECT} WHERE r.user_id = ? ORDER BY t.departure_at DESC, r.id DESC`,
    [req.user.id]
  );
  res.json({ reservations: rows });
}));

// GET /api/reservations/:code   (le passager, le conducteur du trajet, ou un admin)
router.get('/:code', authenticate, wrap(async (req, res) => {
  const reservation = await findByCode(String(req.params.code).toUpperCase());
  if (!reservation) return res.status(404).json({ error: 'Réservation introuvable' });

  const allowed =
    req.user.role === 'admin' ||
    Number(reservation.user_id) === Number(req.user.id) ||
    Number(reservation.driver_id) === Number(req.user.id);
  if (!allowed) return res.status(403).json({ error: 'Accès refusé' });

  res.json({ reservation });
}));

// PATCH /api/reservations/:code/cancel   (le passager, ou un admin)
router.patch('/:code/cancel', authenticate, wrap(async (req, res) => {
  const code = String(req.params.code).toUpperCase();
  const [rows] = await pool.execute(
    `SELECT r.id, r.user_id, r.status, t.departure_at > NOW() AS upcoming
       FROM reservations r
       JOIN trips t ON t.id = r.trip_id
      WHERE r.code = ?`,
    [code]
  );
  const found = rows[0];
  if (!found) return res.status(404).json({ error: 'Réservation introuvable' });

  const isAdmin = req.user.role === 'admin';
  if (!isAdmin && Number(found.user_id) !== Number(req.user.id)) {
    return res.status(403).json({ error: 'Accès refusé' });
  }
  if (found.status === 'cancelled') {
    return res.status(409).json({ error: 'Réservation déjà annulée' });
  }
  if (found.status === 'validated') {
    return res.status(409).json({ error: 'Réservation déjà validée, annulation impossible' });
  }
  if (!found.upcoming && !isAdmin) {
    return res.status(409).json({ error: 'Le trajet est déjà parti' });
  }

  const [result] = await pool.execute(
    "UPDATE reservations SET status = 'cancelled' WHERE id = ? AND status = 'confirmed'",
    [found.id]
  );
  if (result.affectedRows === 0) {
    return res.status(409).json({ error: 'La réservation a changé de statut, réessayez' });
  }
  res.json({ reservation: await findById(found.id) });
}));

// POST /api/reservations/:code/validate   (conducteur du trajet, ou admin)
// Appelé quand le conducteur scanne le billet à l'embarquement.
router.post('/:code/validate', authenticate, requireRole('driver', 'admin'), wrap(async (req, res) => {
  const code = String(req.params.code).toUpperCase();
  const [rows] = await pool.execute(
    `SELECT r.id, r.status, t.driver_id
       FROM reservations r
       JOIN trips t ON t.id = r.trip_id
      WHERE r.code = ?`,
    [code]
  );
  const found = rows[0];
  if (!found) return res.status(404).json({ error: 'Réservation introuvable' });

  if (req.user.role !== 'admin' && Number(found.driver_id) !== Number(req.user.id)) {
    return res.status(403).json({ error: 'Ce trajet ne vous est pas assigné' });
  }
  if (found.status === 'validated') {
    return res.status(409).json({ error: 'Billet déjà validé' });
  }
  if (found.status === 'cancelled') {
    return res.status(409).json({ error: 'Réservation annulée' });
  }

  const [result] = await pool.execute(
    `UPDATE reservations
        SET status = 'validated', validated_at = NOW(), validated_by = ?
      WHERE id = ? AND status = 'confirmed'`,
    [req.user.id, found.id]
  );
  if (result.affectedRows === 0) {
    return res.status(409).json({ error: 'La réservation a changé de statut, réessayez' });
  }
  res.json({ reservation: await findById(found.id) });
}));

module.exports = router;
