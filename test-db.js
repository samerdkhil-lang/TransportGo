require('dotenv').config();
const mysql = require('mysql2/promise');
(async () => {
  try {
    const c = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });
    const [r] = await c.query('SELECT 1 AS ok');
    console.log('OK', r);
    await c.end();
  } catch (e) {
    console.log('ERREUR', e.code, e.message);
  }
})();
