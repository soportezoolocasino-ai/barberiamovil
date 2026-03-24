const router = require('express').Router();
const { pool } = require('../db');
const auth = require('../middleware/auth');

// GET /services
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM services ORDER BY name');
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ message: 'Error del servidor' });
  }
});

// POST /services
router.post('/', auth, async (req, res) => {
  try {
    const barber = await pool.query('SELECT id FROM barbers WHERE user_id=$1', [req.user.id]);
    if (!barber.rows.length) return res.status(403).json({ message: 'Solo barberos pueden crear servicios' });

    const { name, price, duration_minutes } = req.body;
    const result = await pool.query(
      'INSERT INTO services (barber_id, name, price, duration_minutes) VALUES ($1,$2,$3,$4) RETURNING *',
      [barber.rows[0].id, name, price, duration_minutes || 30]
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ message: 'Error del servidor' });
  }
});

module.exports = router;
