const express = require('express');
const pool = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const bad = (res, message) => res.status(400).json({ error: message });

const STATUSES = ['available', 'maintenance', 'retired'];
const MAX_CAPACITY = 120;

function toId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function validCapacity(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n <= MAX_CAPACITY ? n : null;
}

// GET /api/vehicles   (conducteur ou admin)
router.get('/', authenticate, requireRole('driver', 'admin'), wrap(async (req, res) => {
  const [rows] = await pool.execute(
    'SELECT id, plate, model, capacity, status FROM vehicles ORDER BY plate'
  );
  res.json({ vehicles: rows });
}));

// POST /api/vehicles   (admin)   { plate, model, capacity }
router.post('/', authenticate, requireRole('admin'), wrap(async (req, res) => {
  const b = req.body || {};
  const plate = String(b.plate || '').trim();
  const model = String(b.model || '').trim();
  const capacity = validCapacity(b.capacity);

  if (!plate || plate.length > 20) return bad(res, 'plate est obligatoire (20 caractères maximum)');
  if (!model || model.length > 100) return bad(res, 'model est obligatoire (100 caractères maximum)');
  if (!capacity) return bad(res, `capacity doit être un entier entre 1 et ${MAX_CAPACITY}`);

  try {
    const [result] = await pool.execute(
      'INSERT INTO vehicles (plate, model, capacity) VALUES (?, ?, ?)',
      [plate, model, capacity]
    );
    const [rows] = await pool.execute(
      'SELECT id, plate, model, capacity, status FROM vehicles WHERE id = ?',
      [result.insertId]
    );
    res.status(201).json({ vehicle: rows[0] });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Cette plaque existe déjà' });
    }
    throw err;
  }
}));

// PATCH /api/vehicles/:id   (admin)   { model?, capacity?, status? }
router.patch('/:id', authenticate, requireRole('admin'), wrap(async (req, res) => {
  const id = toId(req.params.id);
  if (!id) return bad(res, 'id invalide');

  const [found] = await pool.execute('SELECT id FROM vehicles WHERE id = ?', [id]);
  if (!found[0]) return res.status(404).json({ error: 'Véhicule introuvable' });

  const b = req.body || {};
  const sets = [];
  const params = [];

  if (b.model !== undefined) {
    const v = String(b.model).trim();
    if (!v || v.length > 100) return bad(res, 'model invalide');
    sets.push('model = ?');
    params.push(v);
  }
  if (b.capacity !== undefined) {
    const v = validCapacity(b.capacity);
    if (!v) return bad(res, `capacity doit être un entier entre 1 et ${MAX_CAPACITY}`);

    // On ne réduit pas la capacité sous une place déjà réservée
    const [[over]] = await pool.execute(
      `SELECT COUNT(*) AS n
         FROM reservations r
         JOIN trips t ON t.id = r.trip_id
        WHERE t.vehicle_id = ? AND r.status IN ('confirmed','validated') AND r.seat_number > ?`,
      [id, v]
    );
    if (over.n > 0) {
      return res.status(409).json({ error: 'Des places au-delà de cette capacité sont déjà réservées' });
    }
    sets.push('capacity = ?');
    params.push(v);
  }
  if (b.status !== undefined) {
    if (!STATUSES.includes(b.status)) return bad(res, `status invalide (${STATUSES.join(', ')})`);
    sets.push('status = ?');
    params.push(b.status);
  }

  if (sets.length === 0) return bad(res, 'Aucun champ à modifier');

  await pool.execute(`UPDATE vehicles SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
  const [rows] = await pool.execute(
    'SELECT id, plate, model, capacity, status FROM vehicles WHERE id = ?',
    [id]
  );
  res.json({ vehicle: rows[0] });
}));

module.exports = router;
