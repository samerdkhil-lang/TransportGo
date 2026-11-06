require('dotenv').config();
const mysql = require('mysql2/promise');

// Connexion MySQL (locale via tunnel SSH, ou cloud via variables Railway)
const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3307,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'transport',
  waitForConnections: true,
  connectionLimit: 10,
  // Requis pour Railway MySQL et certains hébergeurs cloud
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

module.exports = pool;
