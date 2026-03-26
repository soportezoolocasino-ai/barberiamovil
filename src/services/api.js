import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const API_URL = 'https://barberiamovil-production.up.railway.app/api';

export const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Inyectar token JWT en cada petición ──────────────────────
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('auth_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Manejo global de errores ─────────────────────────────────
api.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const message = err.response?.data?.error || 'Error de conexión';
    return Promise.reject(new Error(message));
  }
);

// ── Auth ──────────────────────────────────────────────────────
export const authAPI = {
  register: (data)  => api.post('/auth/register', data),
  login:    (data)  => api.post('/auth/login', data),
  me:       ()      => api.get('/auth/me'),
  setFcm:   (token) => api.post('/auth/fcm-token', { fcm_token: token }),
};

// ── Services (global — no usado directamente en el flujo nuevo)
export const servicesAPI = {
  list: () => api.get('/services'),
};

// ── Barbers ───────────────────────────────────────────────────
export const barbersAPI = {
  // ── Existentes ──
  nearby:    (lat, lng, radius = 10) => api.get('/barbers', { params: { lat, lng, radius } }),
  getById:   (id)   => api.get(`/barbers/${id}`),
  setOnline: (data) => api.patch('/barbers/me/online', data),
  updateLoc: (data) => api.patch('/barbers/me/location', data),
  earnings:  (period = 'today') => api.get('/barbers/me/earnings', { params: { period } }),

  // ── NUEVO: servicios de un barbero concreto (para el cliente al reservar)
  // GET /barbers/:id/services
  // Respuesta: { services: [{ id, name, price, duration_min, icon }] }
  services: (barberId) => api.get(`/barbers/${barberId}/services`),

  // ── NUEVO: listar/crear/editar/borrar servicios propios (panel del dueño)
  // GET    /barbers/me/services
  // POST   /barbers/me/services       body: { name, price, duration_min, icon }
  // PATCH  /barbers/me/services/:id   body: { name?, price?, duration_min?, icon? }
  // DELETE /barbers/me/services/:id
  myServices:    ()         => api.get('/barbers/me/services'),
  createService: (data)     => api.post('/barbers/me/services', data),
  updateService: (id, data) => api.patch(`/barbers/me/services/${id}`, data),
  deleteService: (id)       => api.delete(`/barbers/me/services/${id}`),

  // ── NUEVO: horario semanal del barbero (panel del dueño)
  // GET   /barbers/me/schedule
  // PATCH /barbers/me/schedule   body: { schedule: { Lun: { active, from, to, blockedSlots }, ... } }
  getSchedule:    ()         => api.get('/barbers/me/schedule'),
  updateSchedule: (schedule) => api.patch('/barbers/me/schedule', { schedule }),

  // ── NUEVO: bloquear/desbloquear un slot concreto
  // POST   /barbers/me/blocks   body: { date: 'YYYY-MM-DD', time: 'HH:MM' }
  // DELETE /barbers/me/blocks   body: { date: 'YYYY-MM-DD', time: 'HH:MM' }
  blockSlot:   (date, time) => api.post('/barbers/me/blocks', { date, time }),
  unblockSlot: (date, time) => api.delete('/barbers/me/blocks', { data: { date, time } }),

  // ── NUEVO: perfil público del local (para la ficha del cliente)
  // GET   /barbers/:id/profile
  // PATCH /barbers/me/profile   body: { bio?, address?, city?, phone?, photos? }
  getProfile:    (barberId) => api.get(`/barbers/${barberId}/profile`),
  updateProfile: (data)     => api.patch('/barbers/me/profile', data),
};

// ── Bookings ──────────────────────────────────────────────────
export const bookingsAPI = {
  // ── Existentes ──
  list:         (params)   => api.get('/bookings', { params }),
  getById:      (id)       => api.get(`/bookings/${id}`),
  create:       (data)     => api.post('/bookings', data),
  updateStatus: (id, data) => api.patch(`/bookings/${id}/status`, data),

  // ── NUEVO: slots ya ocupados para un barbero en una fecha
  // GET /bookings/slots?barber_id=X&date=YYYY-MM-DD
  // Respuesta: { taken: ['09:00', '10:30', ...] }
  // Se refresca cada 15 s desde HomeScreen para que los huecos
  // desaparezcan en tiempo real sin que el barbero confirme nada.
  getTakenSlots: (barberId, date) =>
    api.get('/bookings/slots', { params: { barber_id: barberId, date } }),

  // ── NUEVO: cancelar una reserva (cliente o barbero)
  // PATCH /bookings/:id/cancel
  cancel: (id) => api.patch(`/bookings/${id}/cancel`),

  // ── NUEVO: reservas del día actual para el panel del barbero
  // GET /bookings/today
  // Respuesta: { bookings: [...] }
  today: () => api.get('/bookings/today'),
};

// ── Reviews ───────────────────────────────────────────────────
export const reviewsAPI = {
  create:    (data) => api.post('/reviews', data),
  forBarber: (id)   => api.get(`/reviews/barber/${id}`),
};

// ── Notifications ─────────────────────────────────────────────
// Solo si tu backend gestiona el envío server-side (WhatsApp/SMS).
// Si usas expo-notifications locales no necesitas este módulo.
export const notificationsAPI = {
  // POST /notifications/schedule
  // body: { booking_id, channels: ['push', 'whatsapp'] }
  schedule: (data) => api.post('/notifications/schedule', data),
};

// ── Admin ─────────────────────────────────────────────────────
export const adminAPI = {
  dashboard:        ()      => api.get('/admin/dashboard'),
  barbers:          (params)=> api.get('/admin/barbers', { params }),
  liveBarbers:      ()      => api.get('/admin/barbers/live'),
  promotions:       ()      => api.get('/admin/promotions'),
  createPromo:      (data)  => api.post('/admin/promotions', data),
  updateCommission: (pct)   => api.patch('/admin/commission', { commission_pct: pct }),
};