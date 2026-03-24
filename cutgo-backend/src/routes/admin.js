const router = require('express').Router();
const { pool } = require('../db');
const auth = require('../middleware/auth');

const isAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Acceso denegado' });
  next();
};

// GET /admin/dashboard
router.get('/dashboard', auth, isAdmin, async (req, res) => {
  try {
    const [users, barbers, bookings, revenue] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM users WHERE role=\'client\''),
      pool.query('SELECT COUNT(*) FROM barbers'),
      pool.query('SELECT COUNT(*) FROM bookings'),
      pool.query('SELECT COALESCE(SUM(price),0) as total FROM bookings WHERE status=\'completed\''),
    ]);
    res.json({
      total_clients: users.rows[0].count,
      total_barbers: barbers.rows[0].count,
      total_bookings: bookings.rows[0].count,
      total_revenue: revenue.rows[0].total,
    });
  } catch (e) {
    res.status(500).json({ message: 'Error del servidor' });
  }
});

// GET /admin/barbers
router.get('/barbers', auth, isAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT b.*, u.name, u.email, u.phone FROM barbers b JOIN users u ON b.user_id = u.id ORDER BY b.created_at DESC`
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ message: 'Error del servidor' });
  }
});

module.exports = router;
