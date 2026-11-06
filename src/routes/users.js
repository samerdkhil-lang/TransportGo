const express = require('express');
const pool = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const bad = (res, message) => res.status(400).json({ error: message });

const ROLES = ['client', 'driver', 'admin'];

function toId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// GET /api/users?role=driver   (admin)
router.get('/', authenticate, requireRole('admin'), wrap(async (req, res) => {
  const { role } = req.query;
  if (role !== undefined && !ROLES.includes(role)) {
    return bad(res, `role invalide (${ROLES.join(', ')})`);
  }

  const [rows] = await pool.execute(
    `SELECT id, name, email, role, created_at FROM users
      ${role ? 'WHERE role = ?' : ''}
      ORDER BY name`,
    role ? [role] : []
  );
  res.json({ users: rows });
}));

// PATCH /api/users/:id/role   (admin)   { role }
// Le nouveau rôle s'applique à la prochaine connexion de l'utilisateur (le rôle est dans son token).
router.patch('/:id/role', authenticate, requireRole('admin'), wrap(async (req, res) => {
  const id = toId(req.params.id);
  if (!id) return bad(res, 'id invalide');

  const role = req.body?.role;
  if (!ROLES.includes(role)) return bad(res, `role invalide (${ROLES.join(', ')})`);

  if (Number(id) === Number(req.user.id)) {
    return bad(res, 'Vous ne pouvez pas modifier votre propre rôle');
  }

  const [found] = await pool.execute('SELECT id FROM users WHERE id = ?', [id]);
  if (!found[0]) return res.status(404).json({ error: 'Utilisateur introuvable' });

  await pool.execute('UPDATE users SET role = ? WHERE id = ?', [role, id]);
  const [rows] = await pool.execute(
    'SELECT id, name, email, role, created_at FROM users WHERE id = ?',
    [id]
  );
  res.json({ user: rows[0] });
}));

module.exports = router;
