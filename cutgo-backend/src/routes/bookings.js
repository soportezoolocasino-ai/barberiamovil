const router = require('express').Router();
const { pool } = require('../db');
const auth = require('../middleware/auth');

// ─────────────────────────────────────────────
//  RUTAS EXISTENTES (sin tocar)
// ─────────────────────────────────────────────

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

// POST /bookings — crear reserva (versión original conservada)
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

// ─────────────────────────────────────────────
//  NUEVOS ENDPOINTS
// ─────────────────────────────────────────────

// GET /bookings/slots?barber_id=X&date=YYYY-MM-DD
// Devuelve las horas YA OCUPADAS (reservadas + bloqueadas manualmente).
// El frontend filtra estas horas del calendario → reserva instantánea sin
// que el barbero tenga que confirmar nada.
// Se refresca cada 15 s desde HomeScreen para actualización en tiempo real.
router.get('/slots', auth, async (req, res) => {
  const { barber_id, date } = req.query;
  if (!barber_id || !date) return res.status(400).json({ error: 'barber_id y date obligatorios' });
  try {
    // Horas con reserva activa
    const bookings = await pool.query(
      `SELECT time FROM bookings
       WHERE barber_id=$1 AND date=$2 AND status NOT IN ('cancelled')`,
      [barber_id, date]
    );
    // Horas bloqueadas manualmente por el barbero
    const blocks = await pool.query(
      `SELECT time FROM barber_blocks WHERE barber_id=$1 AND date=$2`,
      [barber_id, date]
    );
    const taken = [
      ...bookings.rows.map(r => r.time),
      ...blocks.rows.map(r => r.time),
    ];
    res.json({ taken });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al obtener slots' });
  }
});

// POST /bookings/new — reserva nueva con motor anticolisión
// Verifica en transacción que el slot sigue libre antes de confirmar.
// body: { barber_id, service_ids, date, time, payment_method, deposit_paid? }
router.post('/new', auth, async (req, res) => {
  const { barber_id, service_ids, date, time, payment_method, deposit_paid = false } = req.body;
  if (!barber_id || !service_ids?.length || !date || !time || !payment_method)
    return res.status(400).json({ error: 'Faltan campos obligatorios' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Comprobar que el slot sigue libre (bloqueo de fila para evitar doble reserva)
    const conflict = await client.query(
      `SELECT id FROM bookings
       WHERE barber_id=$1 AND date=$2 AND time=$3 AND status != 'cancelled'
       FOR UPDATE`,
      [barber_id, date, time]
    );
    if (conflict.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Esa hora ya no está disponible. Elige otra.' });
    }

    // Calcular precio total sumando los servicios elegidos
    const { rows: svcs } = await client.query(
      `SELECT COALESCE(SUM(price), 0) AS total
       FROM barber_services WHERE id = ANY($1) AND barber_id=$2`,
      [service_ids, barber_id]
    );
    const total_price = parseFloat(svcs[0].total);

    // Insertar la reserva como confirmada directamente (sin esperar al barbero)
    const { rows } = await client.query(
      `INSERT INTO bookings
         (client_id, barber_id, service_ids, date, time, total_price, payment_method, deposit_paid, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'confirmed')
       RETURNING *`,
      [req.user.id, barber_id, service_ids, date, time, total_price, payment_method, deposit_paid]
    );

    await client.query('COMMIT');
    res.status(201).json({ booking: rows[0] });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'Error al crear reserva' });
  } finally {
    client.release();
  }
});

// GET /bookings/today — citas de hoy para el barbero autenticado
router.get('/today', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT b.*, u.name AS client_name, u.phone AS client_phone,
              array_agg(bs.name) AS service_names
       FROM bookings b
       JOIN users u ON u.id = b.client_id
       LEFT JOIN barber_services bs ON bs.id = ANY(b.service_ids)
       WHERE b.barber_id=$1 AND b.date = CURRENT_DATE AND b.status != 'cancelled'
       GROUP BY b.id, u.name, u.phone
       ORDER BY b.time ASC`,
      [req.user.id]
    );
    res.json({ bookings: rows });
  } catch (e) {
    res.status(500).json({ error: 'Error al obtener citas de hoy' });
  }
});

// PATCH /bookings/:id/cancel — cancelar una reserva (cliente o barbero)
router.patch('/:id/cancel', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE bookings SET status='cancelled'
       WHERE id=$1 AND (client_id=$2 OR barber_id=$2)
       RETURNING *`,
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Reserva no encontrada' });
    res.json({ booking: rows[0] });
  } catch (e) {
    res.status(500).json({ error: 'Error al cancelar reserva' });
  }
});

module.exports = router;
