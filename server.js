require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const registrationRoutes = require('./routes/registrations');
const actionRoutes = require('./routes/actions');
const checkinRoutes = require('./routes/checkin');
const { ensureTables } = require('./services/tableStorage');

const app = express();

// ---- CORS ----
const origins = (process.env.CLIENT_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: origins.length ? origins : true,
  credentials: false
}));

app.use(express.json({ limit: '256kb' }));

// ---- Health ----
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    event: {
      id: process.env.EVENT_ID,
      name: process.env.EVENT_NAME,
      date: process.env.EVENT_DATE,
      venue: process.env.EVENT_VENUE
    }
  });
});

// ---- Public event info (used by Register/Confirmed pages) ----
app.get('/api/event', (_req, res) => {
  res.json({
    id: process.env.EVENT_ID || 'devpass-2025',
    name: process.env.EVENT_NAME || 'DevPass 2025',
    date: process.env.EVENT_DATE || '',
    venue: process.env.EVENT_VENUE || ''
  });
});

// ---- API routes ----
app.use('/api', authRoutes);
app.use('/api', registrationRoutes);
app.use('/api', actionRoutes);
app.use('/api', checkinRoutes);

// ---- Static serve built React app in production ----
const clientBuild = path.join(__dirname, 'client', 'build');
app.use(express.static(clientBuild));
app.get(/^\/(?!api\/).*/, (_req, res) => {
  res.sendFile(path.join(clientBuild, 'index.html'), (err) => {
    if (err) res.status(404).send('Not found');
  });
});

// ---- 404 for API ----
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// ---- Error handler ----
app.use((err, _req, res, _next) => {
  console.error('[server] unhandled', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = Number(process.env.PORT) || 3001;

(async () => {
  try {
    if (process.env.AZURE_STORAGE_CONNECTION_STRING) {
      await ensureTables();
      console.log('[server] Azure tables ready');
    } else {
      console.warn('[server] No AZURE_STORAGE_CONNECTION_STRING set — storage calls will fail until configured.');
    }
  } catch (err) {
    console.error('[server] Table init failed', err);
  }
  app.listen(PORT, () => {
    console.log(`[server] DevPass API listening on :${PORT}`);
  });
})();
