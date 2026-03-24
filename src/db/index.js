const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const initDB = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      phone VARCHAR(50),
      password VARCHAR(255) NOT NULL,
      role VARCHAR(20) DEFAULT 'client',
      avatar_url TEXT,
      fcm_token TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS barbers (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      bio TEXT,
      is_online BOOLEAN DEFAULT false,
      lat DECIMAL(10, 8),
      lng DECIMAL(11, 8),
      rating DECIMAL(3,2) DEFAULT 0,
      total_reviews INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS services (
      id SERIAL PRIMARY KEY,
      barber_id INTEGER REFERENCES barbers(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      price DECIMAL(10,2) NOT NULL,
      duration_minutes INTEGER DEFAULT 30,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id SERIAL PRIMARY KEY,
      client_id INTEGER REFERENCES users(id),
      barber_id INTEGER REFERENCES barbers(id),
      service_id INTEGER REFERENCES services(id),
      status VARCHAR(50) DEFAULT 'pending',
      scheduled_at TIMESTAMP,
      address TEXT,
      lat DECIMAL(10,8),
      lng DECIMAL(11,8),
      price DECIMAL(10,2),
      cancel_reason TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id SERIAL PRIMARY KEY,
      booking_id INTEGER REFERENCES bookings(id),
      client_id INTEGER REFERENCES users(id),
      barber_id INTEGER REFERENCES barbers(id),
      rating INTEGER CHECK (rating >= 1 AND rating <= 5),
      comment TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log('✅ Database initialized');
};

module.exports = { pool, initDB };
