const { Client } = require("pg");
const DB = "postgresql://postgres:HFegEQDVAuEuRzosXBvzgkoqlCvVzGzE@centerbeam.proxy.rlwy.net:48906/railway";
const c = new Client({ connectionString: DB, ssl: { rejectUnauthorized: false } });
c.connect()
  .then(() => c.query("INSERT INTO users(name,email,phone,password,role,address,city,shop_name) VALUES('Carlos','carlos@barberia.com','+34611','Demo1234','barber','Gran Via 28','Madrid','Barberia Carlos') ON CONFLICT(email) DO NOTHING"))
  .then(() => c.query("SELECT id FROM users WHERE email='carlos@barberia.com'"))
  .then(r => {
    const id = r.rows[0].id;
    console.log("ID:", id);
    return c.query("INSERT INTO barbers(user_id,is_online,lat,lng,avg_rating,total_reviews) VALUES(" + id + ",true,40.4168,-3.7038,4.9,24) ON CONFLICT DO NOTHING")
      .then(() => c.query("INSERT INTO barber_services(barber_id,name,price,duration_min,icon) VALUES(" + id + ",'Corte clasico',18,45,'C'),(" + id + ",'Arreglo barba',12,30,'B'),(" + id + ",'Degradado',20,45,'D')"))
      .then(() => { console.log("Listo"); c.end(); });
  })
  .catch(e => { console.error(e.message); c.end(); });
