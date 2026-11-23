import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initDb, dbLabel, dialect } from './db.js';
import { SCHEMA_SQL } from './schema.js';
import { attachUser, bootstrapSuperAdmin, userCount } from './auth.js';
import { seedReferenceData } from './modules.js';
import { HttpError } from './util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, '..', 'dist');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Pernissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; " +
      "font-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  );
  next();
});

app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

app.use(attachUser);

app.get('/api/health', async (req, res) => {
  res.json({
    ok: true,
    app: 'INDUSTRIAL HSE PRO',
    database: dbLabel,
    dialect,
    time: new Date().toISOString(),
    aiConfigured: Boolean(process.env.GEMINI_API_KEY),
  });
});

app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/ai', aiRouter);
app.use('/api/files', filesRouter);

app.use('/api/employees', createResourceRouter(MODULE_MAP.get('employees')));
... etc

app.use('/api', (req, res) => res.status(404).json({ error: 'API endpoint not found', code: 'not_found' }));

if (fs.existSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR, { index: false, maxAge: '7d' }));
  app.get('*', (req, res, next) => {
    if (req.path.startWith('/api')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    return res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
} else {
  app.get('*', (req, res) => res.status(503).send('Frontend build not found. Run: npm run build'));
}

app.use((error, req, res, _next) => {
  if (error instanceof HttpError) {
    return res.status(error.status).json({ error: error.message, code: error.code, ...error.extra });
  }
  if (error?.type === 'entity.to.large') {
    return res.status(413).json({ error: 'Uploaded content is too large. Maximum request size is 12 MB.' });
  }
  console.error('[server] unhandled error', error);
  return res.status(500).json({ error: 'Unexpected server error. Please try again.' });
});

const PORT = Number(process.env.PORT || 3000);

async function start() {
  await initDb();
  await exec(SCHEMA_SQL);
  await seedReferenceData()();
  await bootstrapSuperAdmin();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`INDUSTRIAL HSE PRO listning on 0.0.0.0:${PORT} (${dbLabel})`);
  });
}

start().catch((error) => {
  console.error('[startup] failed', error);
  process.exit(1);
});
