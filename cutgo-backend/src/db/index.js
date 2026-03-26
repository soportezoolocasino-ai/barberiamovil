const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const initDB = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id         SERIAL PRIMARY KEY,
      name       VARCHAR(255) NOT NULL,
      email      VARCHAR(255) UNIQUE NOT NULL,
      phone      VARCHAR(50),
      password   VARCHAR(255) NOT NULL,
      role       VARCHAR(20) DEFAULT 'client',
      avatar_url TEXT,
      fcm_token  TEXT,
      bio        TEXT,
      photos     TEXT[],
      schedule   JSONB,
      address    TEXT,
      city       VARCHAR(100),
      shop_name  VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS barbers (
      id            SERIAL PRIMARY KEY,
      user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
      is_online     BOOLEAN DEFAULT false,
      lat           DECIMAL(10,8),
      lng           DECIMAL(11,8),
      avg_rating    DECIMAL(3,2) DEFAULT 0,
      total_reviews INTEGER DEFAULT 0,
      created_at    TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS barber_services (
      id           SERIAL PRIMARY KEY,
      barber_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name         VARCHAR(100) NOT NULL,
      price        NUMERIC(8,2) NOT NULL,
      duration_min INTEGER NOT NULL DEFAULT 30,
      icon         VARCHAR(10) DEFAULT '✂',
      created_at   TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS barber_blocks (
      id        SERIAL PRIMARY KEY,
      barber_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date      DATE NOT NULL,
      time      VARCHAR(5) NOT NULL,
      UNIQUE (barber_id, date, time)
    );

    CREATE TABLE IF NOT EXISTS services (
      id               SERIAL PRIMARY KEY,
      barber_id        INTEGER REFERENCES barbers(id) ON DELETE CASCADE,
      name             VARCHAR(255) NOT NULL,
      price            DECIMAL(10,2) NOT NULL,
      duration_minutes INTEGER DEFAULT 30,
      created_at       TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id             SERIAL PRIMARY KEY,
      client_id      INTEGER REFERENCES users(id),
      barber_id      INTEGER REFERENCES users(id),
      service_id     INTEGER,
      service_ids    INTEGER[],
      scheduled_at   TIMESTAMP,
      date           DATE,
      time           VARCHAR(5),
      address        TEXT,
      lat            DECIMAL(10,8),
      lng            DECIMAL(11,8),
      price          DECIMAL(10,2),
      total_price    DECIMAL(10,2),
      payment_method VARCHAR(30),
      deposit_paid   BOOLEAN DEFAULT false,
      status         VARCHAR(20) DEFAULT 'confirmed',
      cancel_reason  TEXT,
      created_at     TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id         SERIAL PRIMARY KEY,
      booking_id INTEGER REFERENCES bookings(id),
      client_id  INTEGER REFERENCES users(id),
      barber_id  INTEGER REFERENCES users(id),
      rating     INTEGER CHECK (rating >= 1 AND rating <= 5),
      comment    TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  console.log('✅ Database initialized');
};

module.exports = { pool, initDB };
