require('dotenv').config();
const fs = require('fs');
const mysql = require('mysql2/promise');
const file = process.argv[2];
if (!file || !fs.existsSync(file)) { console.log('Fichier introuvable :', file); process.exit(1); }
(async () => {
  try {
    const c = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      multipleStatements: true,
    });
    await c.query(fs.readFileSync(file, 'utf8'));
    const [t] = await c.query('SHOW TABLES');
    console.log('OK, tables :', t.map(r => Object.values(r)[0]).join(', '));
    await c.end();
  } catch (e) {
    console.log('ERREUR', e.code, e.message);
  }
})();
