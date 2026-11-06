const express = require('express');
const pool = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

// Transmet les erreurs async au gestionnaire d'erreurs d'Express
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const bad = (res, message) => res.status(400).json({ error: message });

const DATETIME_RE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = ['planned', 'departed', 'cancelled', 'completed'];

// "2026-11-10T08:30" ou "2026-11-10 08:30:00" -> "2026-11-10 08:30:00"
function toSqlDatetime(value) {
  if (typeof value !== 'string' || !DATETIME_RE.test(value.trim())) return null;
  const v = value.trim().replace('T', ' ');
  return v.length === 16 ? `${v}:00` : v;
}

function toId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function vehicleExists(id) {
  const [rows] = await pool.execute(
    "SELECT id FROM vehicles WHERE id = ? AND status = 'available'",
    [id]
  );
  return rows.length > 0;
}

async function isDriver(id) {
  const [rows] = await pool.execute("SELECT id FROM users WHERE id = ? AND role = 'driver'", [id]);
  return rows.length > 0;
}

const TRIP_SELECT = `
  SELECT t.id, t.origin, t.destination, t.departure_at, t.price, t.status,
         t.vehicle_id, t.driver_id, v.capacity,
         (SELECT COUNT(*) FROM reservations r
           WHERE r.trip_id = t.id AND r.status IN ('confirmed','validated')) AS seats_taken
  FROM trips t
  JOIN vehicles v ON v.id = t.vehicle_id`;

function withAvailability(row) {
  const seatsTaken = Number(row.seats_taken);
  return { ...row, seats_taken: seatsTaken, seats_available: row.capacity - seatsTaken };
}

// GET /api/trips?origin=&destination=&date=YYYY-MM-DD   (public)
// Trajets à venir et ouverts à la réservation.
router.get('/', wrap(async (req, res) => {
  const { origin, destination, date } = req.query;
  const where = ["t.status = 'planned'", 't.departure_at > NOW()'];
  const params = [];

  if (origin) {
    where.push('t.origin LIKE ?');
    params.push(`%${String(origin)}%`);
  }
  if (destination) {
    where.push('t.destination LIKE ?');
    params.push(`%${String(destination)}%`);
  }
  if (date) {
    if (!DATE_RE.test(String(date))) return bad(res, 'date invalide (format AAAA-MM-JJ)');
    where.push('DATE(t.departure_at) = ?');
    params.push(String(date));
  }

  const [rows] = await pool.execute(
    `${TRIP_SELECT} WHERE ${where.join(' AND ')} ORDER BY t.departure_at`,
    params
  );
  res.json({ trips: rows.map(withAvailability) });
}));

// GET /api/trips/mine   (conducteur: ses trajets / admin: tous les trajets)
router.get('/mine', authenticate, requireRole('driver', 'admin'), wrap(async (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const [rows] = await pool.execute(
    `${TRIP_SELECT} ${isAdmin ? '' : 'WHERE t.driver_id = ?'} ORDER BY t.departure_at DESC`,
    isAdmin ? [] : [req.user.id]
  );
  res.json({ trips: rows.map(withAvailability) });
}));

// GET /api/trips/:id   (public) avec la liste des places déjà prises
router.get('/:id', wrap(async (req, res) => {
  const id = toId(req.params.id);
  if (!id) return bad(res, 'id invalide');

  const [rows] = await pool.execute(`${TRIP_SELECT} WHERE t.id = ?`, [id]);
  if (!rows[0]) return res.status(404).json({ error: 'Trajet introuvable' });

  const [seats] = await pool.execute(
    `SELECT seat_number FROM reservations
      WHERE trip_id = ? AND status IN ('confirmed','validated')
      ORDER BY seat_number`,
    [id]
  );
  res.json({ trip: { ...withAvailability(rows[0]), taken_seats: seats.map((s) => s.seat_number) } });
}));

// GET /api/trips/:id/reservations   (conducteur du trajet, ou admin)
// Liste des passagers (réservations non annulées), triée par place.
router.get('/:id/reservations', authenticate, requireRole('driver', 'admin'), wrap(async (req, res) => {
  const id = toId(req.params.id);
  if (!id) return bad(res, 'id invalide');

  const [trips] = await pool.execute('SELECT driver_id FROM trips WHERE id = ?', [id]);
  if (!trips[0]) return res.status(404).json({ error: 'Trajet introuvable' });
  if (req.user.role !== 'admin' && Number(trips[0].driver_id) !== Number(req.user.id)) {
    return res.status(403).json({ error: 'Ce trajet ne vous est pas assigné' });
  }

  const [rows] = await pool.execute(
    `SELECT r.code, r.seat_number, r.status, r.validated_at, u.name AS passenger_name
       FROM reservations r
       JOIN users u ON u.id = r.user_id
      WHERE r.trip_id = ? AND r.status <> 'cancelled'
      ORDER BY r.seat_number`,
    [id]
  );
  res.json({ reservations: rows });
}));

// POST /api/trips   (conducteur ou admin)
// Conducteur: le trajet lui est assigné. Admin: driver_id optionnel.
router.post('/', authenticate, requireRole('driver', 'admin'), wrap(async (req, res) => {
  const b = req.body || {};
  const isAdmin = req.user.role === 'admin';

  const origin = String(b.origin || '').trim();
  const destination = String(b.destination || '').trim();
  const departure = toSqlDatetime(b.departure_at);
  const vehicleId = toId(b.vehicle_id);
  const price = Number(b.price);

  if (!origin || !destination || origin.length > 100 || destination.length > 100) {
    return bad(res, 'origin et destination sont obligatoires (100 caractères maximum)');
  }
  if (!departure) return bad(res, 'departure_at invalide (format AAAA-MM-JJ HH:MM)');
  if (!vehicleId) return bad(res, 'vehicle_id est obligatoire');
  if (b.price === undefined || b.price === '' || !Number.isFinite(price) || price < 0) {
    return bad(res, 'price invalide');
  }

  const [[check]] = await pool.execute('SELECT TIMESTAMP(?) > NOW() AS ok', [departure]);
  if (!check.ok) return bad(res, 'La date de départ doit être dans le futur');

  if (!(await vehicleExists(vehicleId))) return bad(res, 'Véhicule introuvable ou indisponible');

  let driverId = req.user.id;
  if (isAdmin) {
    driverId = null;
    if (b.driver_id !== undefined && b.driver_id !== null && b.driver_id !== '') {
      driverId = toId(b.driver_id);
      if (!driverId || !(await isDriver(driverId))) return bad(res, 'driver_id doit être un conducteur');
    }
  }

  const [result] = await pool.execute(
    `INSERT INTO trips (origin, destination, departure_at, price, vehicle_id, driver_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [origin, destination, departure, price, vehicleId, driverId]
  );
  const [rows] = await pool.execute(`${TRIP_SELECT} WHERE t.id = ?`, [result.insertId]);
  res.status(201).json({ trip: withAvailability(rows[0]) });
}));

// PATCH /api/trips/:id   (admin, ou conducteur du trajet)
// Annuler un trajet (status = "cancelled") annule aussi ses réservations confirmées.
router.patch('/:id', authenticate, requireRole('driver', 'admin'), wrap(async (req, res) => {
  const id = toId(req.params.id);
  if (!id) return bad(res, 'id invalide');

  const [found] = await pool.execute('SELECT id, driver_id, status FROM trips WHERE id = ?', [id]);
  const trip = found[0];
  if (!trip) return res.status(404).json({ error: 'Trajet introuvable' });

  const isAdmin = req.user.role === 'admin';
  if (!isAdmin && Number(trip.driver_id) !== Number(req.user.id)) {
    return res.status(403).json({ error: 'Ce trajet ne vous est pas assigné' });
  }

  const b = req.body || {};
  const sets = [];
  const params = [];

  if (b.origin !== undefined) {
    const v = String(b.origin).trim();
    if (!v || v.length > 100) return bad(res, 'origin invalide');
    sets.push('origin = ?');
    params.push(v);
  }
  if (b.destination !== undefined) {
    const v = String(b.destination).trim();
    if (!v || v.length > 100) return bad(res, 'destination invalide');
    sets.push('destination = ?');
    params.push(v);
  }
  if (b.departure_at !== undefined) {
    const v = toSqlDatetime(b.departure_at);
    if (!v) return bad(res, 'departure_at invalide (format AAAA-MM-JJ HH:MM)');
    sets.push('departure_at = ?');
    params.push(v);
  }
  if (b.price !== undefined) {
    const v = Number(b.price);
    if (b.price === '' || !Number.isFinite(v) || v < 0) return bad(res, 'price invalide');
    sets.push('price = ?');
    params.push(v);
  }
  if (b.status !== undefined) {
    if (!STATUSES.includes(b.status)) return bad(res, `status invalide (${STATUSES.join(', ')})`);
    sets.push('status = ?');
    params.push(b.status);
  }

  if (b.vehicle_id !== undefined || b.driver_id !== undefined) {
    if (!isAdmin) return res.status(403).json({ error: 'vehicle_id et driver_id sont réservés à l\'admin' });

    if (b.vehicle_id !== undefined) {
      const v = toId(b.vehicle_id);
      if (!v || !(await vehicleExists(v))) return bad(res, 'Véhicule introuvable ou indisponible');
      sets.push('vehicle_id = ?');
      params.push(v);
    }
    if (b.driver_id !== undefined) {
      let v = null;
      if (b.driver_id !== null && b.driver_id !== '') {
        v = toId(b.driver_id);
        if (!v || !(await isDriver(v))) return bad(res, 'driver_id doit être un conducteur');
      }
      sets.push('driver_id = ?');
      params.push(v);
    }
  }

  if (sets.length === 0) return bad(res, 'Aucun champ à modifier');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(`UPDATE trips SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
    if (b.status === 'cancelled' && trip.status !== 'cancelled') {
      await conn.execute(
        "UPDATE reservations SET status = 'cancelled' WHERE trip_id = ? AND status = 'confirmed'",
        [id]
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  const [rows] = await pool.execute(`${TRIP_SELECT} WHERE t.id = ?`, [id]);
  res.json({ trip: withAvailability(rows[0]) });
}));

module.exports = router;
