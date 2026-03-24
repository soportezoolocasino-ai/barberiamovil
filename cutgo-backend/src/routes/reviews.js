const router = require('express').Router();
const { pool } = require('../db');
const auth = require('../middleware/auth');

// POST /reviews
router.post('/', auth, async (req, res) => {
  try {
    const { booking_id, barber_id, rating, comment } = req.body;
    const result = await pool.query(
      'INSERT INTO reviews (booking_id, client_id, barber_id, rating, comment) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [booking_id, req.user.id, barber_id, rating, comment]
    );
    // Update barber rating
    await pool.query(
      `UPDATE barbers SET rating = (SELECT AVG(rating) FROM reviews WHERE barber_id=$1),
       total_reviews = (SELECT COUNT(*) FROM reviews WHERE barber_id=$1) WHERE id=$1`,
      [barber_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ message: 'Error del servidor' });
  }
});

// GET /reviews/barber/:id
router.get('/barber/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*, u.name as client_name FROM reviews r JOIN users u ON r.client_id = u.id
       WHERE r.barber_id=$1 ORDER BY r.created_at DESC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ message: 'Error del servidor' });
  }
});

module.exports = router;
