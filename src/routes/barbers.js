const router = require('express').Router();
const { pool } = require('../db');
const auth = require('../middleware/auth');

// GET /barbers?lat=&lng=&radius=
router.get('/', async (req, res) => {
  try {
    const { lat, lng, radius = 10 } = req.query;
    let query, params;

    if (lat && lng) {
      query = `
        SELECT b.*, u.name, u.avatar_url, u.phone,
          (6371 * acos(cos(radians($1)) * cos(radians(b.lat)) *
          cos(radians(b.lng) - radians($2)) +
          sin(radians($1)) * sin(radians(b.lat)))) AS distance
        FROM barbers b
        JOIN users u ON b.user_id = u.id
        WHERE b.is_online = true
        HAVING (6371 * acos(cos(radians($1)) * cos(radians(b.lat)) *
          cos(radians(b.lng) - radians($2)) +
          sin(radians($1)) * sin(radians(b.lat)))) < $3
        ORDER BY distance
      `;
      params = [lat, lng, radius];
    } else {
      query = `SELECT b.*, u.name, u.avatar_url FROM barbers b JOIN users u ON b.user_id = u.id WHERE b.is_online = true`;
      params = [];
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Error del servidor' });
  }
});

// GET /barbers/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT b.*, u.name, u.email, u.phone, u.avatar_url
       FROM barbers b JOIN users u ON b.user_id = u.id WHERE b.id=$1`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ message: 'Barbero no encontrado' });

    const services = await pool.query('SELECT * FROM services WHERE barber_id=$1', [req.params.id]);
    const reviews = await pool.query(
      `SELECT r.*, u.name as client_name FROM reviews r JOIN users u ON r.client_id = u.id WHERE r.barber_id=$1 ORDER BY r.created_at DESC LIMIT 10`,
      [req.params.id]
    );

    res.json({ ...result.rows[0], services: services.rows, reviews: reviews.rows });
  } catch (e) {
    res.status(500).json({ message: 'Error del servidor' });
  }
});

// PATCH /barbers/me/online
router.patch('/me/online', auth, async (req, res) => {
  try {
    const { is_online } = req.body;
    await pool.query(
      'UPDATE barbers SET is_online=$1 WHERE user_id=$2',
      [is_online, req.user.id]
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ message: 'Error del servidor' });
  }
});

// PATCH /barbers/me/location
router.patch('/me/location', auth, async (req, res) => {
  try {
    const { lat, lng } = req.body;
    await pool.query(
      'UPDATE barbers SET lat=$1, lng=$2 WHERE user_id=$3',
      [lat, lng, req.user.id]
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ message: 'Error del servidor' });
  }
});

// GET /barbers/me/earnings
router.get('/me/earnings', auth, async (req, res) => {
  try {
    const { period = 'today' } = req.query;
    const barber = await pool.query('SELECT id FROM barbers WHERE user_id=$1', [req.user.id]);
    if (!barber.rows.length) return res.status(404).json({ message: 'Barbero no encontrado' });

    let dateFilter = "DATE(created_at) = CURRENT_DATE";
    if (period === 'week') dateFilter = "created_at >= NOW() - INTERVAL '7 days'";
    if (period === 'month') dateFilter = "created_at >= NOW() - INTERVAL '30 days'";

    const result = await pool.query(
      `SELECT COALESCE(SUM(price), 0) as total, COUNT(*) as bookings
       FROM bookings WHERE barber_id=$1 AND status='completed' AND ${dateFilter}`,
      [barber.rows[0].id]
    );
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ message: 'Error del servidor' });
  }
});

module.exports = router;
