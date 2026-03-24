const router = require('express').Router();
const { pool } = require('../db');
const auth = require('../middleware/auth');

// GET /bookings
router.get('/', auth, async (req, res) => {
  try {
    const { status } = req.query;
    const isBarber = req.user.role === 'barber';

    let query, params;
    if (isBarber) {
      const barber = await pool.query('SELECT id FROM barbers WHERE user_id=$1', [req.user.id]);
      if (!barber.rows.length) return res.json([]);
      query = `SELECT bk.*, u.name as client_name, u.phone as client_phone, s.name as service_name
               FROM bookings bk JOIN users u ON bk.client_id = u.id JOIN services s ON bk.service_id = s.id
               WHERE bk.barber_id=$1 ${status ? 'AND bk.status=$2' : ''} ORDER BY bk.created_at DESC`;
      params = status ? [barber.rows[0].id, status] : [barber.rows[0].id];
    } else {
      query = `SELECT bk.*, u.name as barber_name, s.name as service_name
               FROM bookings bk JOIN barbers b ON bk.barber_id = b.id JOIN users u ON b.user_id = u.id
               JOIN services s ON bk.service_id = s.id
               WHERE bk.client_id=$1 ${status ? 'AND bk.status=$2' : ''} ORDER BY bk.created_at DESC`;
      params = status ? [req.user.id, status] : [req.user.id];
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Error del servidor' });
  }
});

// GET /bookings/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT bk.*, u.name as client_name, u.phone as client_phone,
              ub.name as barber_name, s.name as service_name
       FROM bookings bk
       JOIN users u ON bk.client_id = u.id
       JOIN barbers b ON bk.barber_id = b.id
       JOIN users ub ON b.user_id = ub.id
       JOIN services s ON bk.service_id = s.id
       WHERE bk.id=$1`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ message: 'Reserva no encontrada' });
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ message: 'Error del servidor' });
  }
});

// POST /bookings
router.post('/', auth, async (req, res) => {
  try {
    const { barber_id, service_id, scheduled_at, address, lat, lng } = req.body;
    const service = await pool.query('SELECT price FROM services WHERE id=$1', [service_id]);
    if (!service.rows.length) return res.status(400).json({ message: 'Servicio no encontrado' });

    const result = await pool.query(
      `INSERT INTO bookings (client_id, barber_id, service_id, scheduled_at, address, lat, lng, price)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.id, barber_id, service_id, scheduled_at, address, lat, lng, service.rows[0].price]
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Error del servidor' });
  }
});

// PATCH /bookings/:id/status
router.patch('/:id/status', auth, async (req, res) => {
  try {
    const { status, cancel_reason } = req.body;
    const result = await pool.query(
      'UPDATE bookings SET status=$1, cancel_reason=$2 WHERE id=$3 RETURNING *',
      [status, cancel_reason || null, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ message: 'Reserva no encontrada' });
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ message: 'Error del servidor' });
  }
});

module.exports = router;
