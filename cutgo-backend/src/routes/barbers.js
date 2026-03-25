const router = require('express').Router();
const { pool } = require('../db');
const auth = require('../middleware/auth');

// ─────────────────────────────────────────────
//  RUTAS EXISTENTES (sin tocar)
// ─────────────────────────────────────────────

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

// GET /barbers/:id  — IMPORTANTE: debe ir DESPUÉS de todas las rutas /me/*
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
    await pool.query('UPDATE barbers SET is_online=$1 WHERE user_id=$2', [is_online, req.user.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ message: 'Error del servidor' });
  }
});

// PATCH /barbers/me/location
router.patch('/me/location', auth, async (req, res) => {
  try {
    const { lat, lng } = req.body;
    await pool.query('UPDATE barbers SET lat=$1, lng=$2 WHERE user_id=$3', [lat, lng, req.user.id]);
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
    if (period === 'week')  dateFilter = "created_at >= NOW() - INTERVAL '7 days'";
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

// ─────────────────────────────────────────────
//  NUEVOS ENDPOINTS
// ─────────────────────────────────────────────

// GET /barbers/me/services — servicios propios del barbero (panel dueño)
router.get('/me/services', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, price, duration_min, icon
       FROM barber_services WHERE barber_id=$1 ORDER BY created_at ASC`,
      [req.user.id]
    );
    res.json({ services: rows });
  } catch (e) {
    res.status(500).json({ error: 'Error al obtener servicios' });
  }
});

// POST /barbers/me/services — añadir servicio
// body: { name, price, duration_min?, icon? }
router.post('/me/services', auth, async (req, res) => {
  const { name, price, duration_min = 30, icon = '✂' } = req.body;
  if (!name || !price) return res.status(400).json({ error: 'Nombre y precio obligatorios' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO barber_services (barber_id, name, price, duration_min, icon)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.id, name, price, duration_min, icon]
    );
    res.status(201).json({ service: rows[0] });
  } catch (e) {
    res.status(500).json({ error: 'Error al crear servicio' });
  }
});

// PATCH /barbers/me/services/:id — editar servicio
router.patch('/me/services/:id', auth, async (req, res) => {
  const { name, price, duration_min, icon } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE barber_services
       SET name         = COALESCE($1, name),
           price        = COALESCE($2, price),
           duration_min = COALESCE($3, duration_min),
           icon         = COALESCE($4, icon)
       WHERE id=$5 AND barber_id=$6 RETURNING *`,
      [name, price, duration_min, icon, req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Servicio no encontrado' });
    res.json({ service: rows[0] });
  } catch (e) {
    res.status(500).json({ error: 'Error al actualizar servicio' });
  }
});

// DELETE /barbers/me/services/:id — borrar servicio
router.delete('/me/services/:id', auth, async (req, res) => {
  try {
    await pool.query(`DELETE FROM barber_services WHERE id=$1 AND barber_id=$2`, [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Error al borrar servicio' });
  }
});

// GET /barbers/me/schedule — obtener horario semanal
router.get('/me/schedule', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT schedule FROM users WHERE id=$1`, [req.user.id]);
    res.json({ schedule: rows[0]?.schedule || null });
  } catch (e) {
    res.status(500).json({ error: 'Error al obtener horario' });
  }
});

// PATCH /barbers/me/schedule — guardar horario semanal
// body: { schedule: { Lun: { active, from, to, blockedSlots }, ... } }
router.patch('/me/schedule', auth, async (req, res) => {
  const { schedule } = req.body;
  if (!schedule) return res.status(400).json({ error: 'schedule es obligatorio' });
  try {
    await pool.query(`UPDATE users SET schedule=$1 WHERE id=$2`, [JSON.stringify(schedule), req.user.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Error al guardar horario' });
  }
});

// POST /barbers/me/blocks — bloquear un slot
// body: { date: 'YYYY-MM-DD', time: 'HH:MM' }
router.post('/me/blocks', auth, async (req, res) => {
  const { date, time } = req.body;
  if (!date || !time) return res.status(400).json({ error: 'date y time obligatorios' });
  try {
    await pool.query(
      `INSERT INTO barber_blocks (barber_id, date, time) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [req.user.id, date, time]
    );
    res.status(201).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Error al bloquear slot' });
  }
});

// DELETE /barbers/me/blocks — desbloquear un slot
// body: { date: 'YYYY-MM-DD', time: 'HH:MM' }
router.delete('/me/blocks', auth, async (req, res) => {
  const { date, time } = req.body;
  try {
    await pool.query(
      `DELETE FROM barber_blocks WHERE barber_id=$1 AND date=$2 AND time=$3`,
      [req.user.id, date, time]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Error al desbloquear slot' });
  }
});

// GET /barbers/:id/services — servicios de un barbero concreto (para el cliente)
router.get('/:id/services', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, price, duration_min, icon
       FROM barber_services WHERE barber_id=$1 ORDER BY created_at ASC`,
      [req.params.id]
    );
    res.json({ services: rows });
  } catch (e) {
    res.status(500).json({ error: 'Error al obtener servicios' });
  }
});

// GET /barbers/:id/profile — ficha pública del local
router.get('/:id/profile', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.name AS shop_name, u.address, u.phone, u.bio, u.photos,
              COALESCE(
                json_agg(bs ORDER BY bs.created_at) FILTER (WHERE bs.id IS NOT NULL),
                '[]'
              ) AS services
       FROM users u
       LEFT JOIN barber_services bs ON bs.barber_id = u.id
       WHERE u.id=$1
       GROUP BY u.id`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Barbería no encontrada' });
    res.json({ profile: rows[0] });
  } catch (e) {
    res.status(500).json({ error: 'Error al obtener perfil' });
  }
});

// PATCH /barbers/me/profile — el dueño actualiza su ficha
// body: { bio?, address?, phone?, photos? }
router.patch('/me/profile', auth, async (req, res) => {
  const { bio, address, phone, photos } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE users
       SET bio     = COALESCE($1, bio),
           address = COALESCE($2, address),
           phone   = COALESCE($3, phone),
           photos  = COALESCE($4, photos)
       WHERE id=$5
       RETURNING id, name, bio, address, phone, photos`,
      [bio, address, phone, photos, req.user.id]
    );
    res.json({ profile: rows[0] });
  } catch (e) {
    res.status(500).json({ error: 'Error al actualizar perfil' });
  }
});

module.exports = router;
