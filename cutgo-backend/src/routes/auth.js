const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { pool } = require('../db');
const auth   = require('../middleware/auth');

// POST /auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, phone, password, role = 'client', lat, lng, shop_name, address, city } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({ message: 'Faltan campos requeridos' });

    const exists = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
    if (exists.rows.length)
      return res.status(400).json({ message: 'Email ya registrado' });

    const hash = await bcrypt.hash(password, 10);

    // Guardar también shop_name, address, city si es barbero
    const result = await pool.query(
      `INSERT INTO users (name, email, phone, password, role)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, name, email, role`,
      [name, email, phone, hash, role === 'owner' ? 'barber' : role]
    );

    const user = result.rows[0];

    // Si es barbero/owner, crear fila en barbers con lat/lng
    if (role === 'barber' || role === 'owner') {
      const barberLat = lat || null;
      const barberLng = lng || null;
      await pool.query(
        `INSERT INTO barbers (user_id, lat, lng, is_online)
         VALUES ($1, $2, $3, false)`,
        [user.id, barberLat, barberLng]
      );

      // Actualizar datos del local en users si se enviaron
      if (shop_name || address || city) {
        await pool.query(
          `UPDATE users SET
            name    = COALESCE($1, name),
            address = COALESCE($2, address),
            phone   = COALESCE($3, phone)
           WHERE id = $4`,
          [shop_name || name, address, phone, user.id]
        );
      }
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({ token, user });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Error del servidor' });
  }
});

// POST /auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
    const user   = result.rows[0];
    if (!user) return res.status(400).json({ message: 'Credenciales incorrectas' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ message: 'Credenciales incorrectas' });

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    const { password: _, ...userData } = user;
    res.json({ token, user: userData });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Error del servidor' });
  }
});

// GET /auth/me
router.get('/me', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, phone, role, avatar_url FROM users WHERE id=$1',
      [req.user.id]
    );
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ message: 'Error del servidor' });
  }
});

// POST /auth/fcm-token
router.post('/fcm-token', auth, async (req, res) => {
  try {
    const { fcm_token } = req.body;
    await pool.query('UPDATE users SET fcm_token=$1 WHERE id=$2', [fcm_token, req.user.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ message: 'Error del servidor' });
  }
});

module.exports = router;
