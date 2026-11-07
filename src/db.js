require('dotenv').config();
const mysql = require('mysql2/promise');

// Supporte soit l'URL unique fournie par le Cloud (Railway, Render : MYSQL_URL ou DATABASE_URL),
// soit les variables individuelles locales (tunnel SSH 127.0.0.1:3307)
const connectionConfig = (process.env.MYSQL_URL || process.env.DATABASE_URL)
  ? {
      uri: process.env.MYSQL_URL || process.env.DATABASE_URL,
      waitForConnections: true,
      connectionLimit: 10,
      multipleStatements: true,
      ssl: process.env.DB_SSL === 'false' ? undefined : { rejectUnauthorized: false },
    }
  : {
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT) || 3307,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME || 'transport',
      waitForConnections: true,
      connectionLimit: 10,
      multipleStatements: true,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    };

const pool = mysql.createPool(connectionConfig);

module.exports = pool;
