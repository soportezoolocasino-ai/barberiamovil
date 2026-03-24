require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDB } = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok', message: 'CutGo API is alive' }));

app.use('/api/auth',     require('./routes/auth'));
app.use('/api/barbers',  require('./routes/barbers'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/services', require('./routes/services'));
app.use('/api/reviews',  require('./routes/reviews'));
app.use('/api/admin',    require('./routes/admin'));

const PORT = process.env.PORT || 8080;

initDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 CutGo API funcionando en puerto ${PORT}`);
  });
}).catch(err => {
  console.error('❌ Error DB:', err);
  process.exit(1);
});
