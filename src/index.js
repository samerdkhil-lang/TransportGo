require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const authRoutes = require('./routes/auth');
const tripRoutes = require('./routes/trips');
const reservationRoutes = require('./routes/reservations');
const vehicleRoutes = require('./routes/vehicles');
const userRoutes = require('./routes/users');
const { authenticate, requireRole } = require('./middleware/auth');
const pool = require('./db');

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (err) {
    res.status(503).json({
      status: 'degraded',
      database: 'disconnected',
      error: err.code || err.message,
    });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/reservations', reservationRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/users', userRoutes);

// Route de test pour le middleware de rôles (à supprimer plus tard)
app.get('/api/admin/ping', authenticate, requireRole('admin'), (req, res) => {
  res.json({ message: 'Bienvenue admin', userId: req.user.id });
});

// Route inconnue API
app.use('/api', (req, res) => res.status(404).json({ error: 'Route introuvable' }));

// Servir l'application frontend React si elle est compilée dans client/dist
const clientDist = path.join(__dirname, '../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      return res.sendFile(path.join(clientDist, 'index.html'));
    }
    next();
  });
} else {
  app.get('/', (req, res) => {
    res.send(`
      <!doctype html>
      <html>
        <head><meta charset="utf-8"><title>TransportGo API</title></head>
        <body style="font-family: sans-serif; padding: 40px; text-align: center;">
          <h2>API TransportGo en ligne (Port 5000)</h2>
          <p>Le frontend en développement tourne sur :</p>
          <p><a href="http://localhost:5173" style="font-size: 1.2rem; color: #1976d2;">http://localhost:5173</a></p>
          <p style="color: #666;">Pour démarrer le frontend, lancez : <code>npm run client:dev</code></p>
        </body>
      </html>
    `);
  });
}

// Gestionnaire d'erreurs: JSON invalide -> 400, le reste -> 500 (détail dans la console)
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON invalide' });
  }
  console.error(err);
  return res.status(500).json({ error: 'Erreur serveur' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`API démarrée sur http://localhost:${PORT}`);
  // Teste la connexion à MySQL dès le lancement
  pool.getConnection()
    .then((conn) => {
      conn.release();
      console.log('✓ Connexion MySQL établie avec succès');
    })
    .catch((err) => {
      console.warn(`! Attention: connexion MySQL impossible (${err.code} sur ${process.env.DB_HOST || '127.0.0.1'}:${process.env.DB_PORT || 3307})`);
      console.warn('  Si la base tourne sur un serveur distant, assurez-vous que le tunnel SSH est actif :');
      console.warn('  ssh -N -L 3307:127.0.0.1:3306 samer@192.168.0.120');
    });
});
