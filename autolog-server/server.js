/*
 * AUTOLOG SERVER — COMO RODAR
 * 1. cp .env.example .env  (e edite JWT_SECRET)
 * 2. npm install
 * 3. npm run dev            (desenvolvimento, com auto-reload)
 *    npm start              (produção)
 * 4. Servidor sobe em http://localhost:3000
 * 5. Abra mech-history/index.html no browser
 *
 * DEPLOY NO RAILWAY:
 * 1. railway login && railway init
 * 2. railway up (na pasta autolog-server/)
 * 3. Adicionar variáveis de ambiente: JWT_SECRET, NODE_ENV=production
 * 4. Para persistência de dados: adicionar Volume em /app/data e
 *    setar DB_PATH=/app/data/autolog.db
 *    (sem Volume, o banco é recriado a cada novo deploy — dados perdidos)
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const { getDb } = require('./db');
const authMiddleware = require('./auth');

const authRoutes = require('./routes/auth');
const vehicleRoutes = require('./routes/vehicles');
const recordRoutes = require('./routes/records');
const photoRoutes = require('./routes/photos');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure JWT_SECRET is set
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'troque-por-uma-string-longa-e-aleatoria') {
  console.warn('⚠  AVISO: Defina JWT_SECRET no .env com um valor seguro!');
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'dev-secret-inseguro-troque-em-producao';
  }
}

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (file://, curl, Postman)
    if (!origin) return callback(null, true);
    // Allow localhost on any port
    if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return callback(null, true);
    // Allow file:// protocol
    if (origin === 'null') return callback(null, true);
    callback(new Error('CORS não permitido para esta origem'));
  },
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));

// Static files — uploaded photos
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Initialize database on startup
getDb();

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/vehicles', authMiddleware, vehicleRoutes);
app.use('/api/records', authMiddleware, recordRoutes);
app.use('/api/photos', authMiddleware, photoRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

// Global error handler
app.use((err, _req, res, _next) => {
  console.error('Erro não tratado:', err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

app.listen(PORT, () => {
  console.log(`AutoLog Server rodando em http://localhost:${PORT}`);
});

module.exports = app;
