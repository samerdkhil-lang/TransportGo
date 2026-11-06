require('dotenv').config();
const mysql = require('mysql2/promise');

// Se connecte à l'entrée du tunnel SSH (127.0.0.1:3307), pas directement à Ubuntu
const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3307,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'transport',
  waitForConnections: true,
  connectionLimit: 10,
});

module.exports = pool;
