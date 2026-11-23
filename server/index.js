import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initDb, exec, dbLabel, dialect } from './db.js';
import { SCHEMA_SQL } from './schema.js';
import { attachUser, bootstrapSuperAdmin } from './auth.js';
import { seedReferenceData, MODULES, MODULE_MAP } from './modules.js';
import { createResourceRouter } from './resource.js';
import { HttpError } from './util.js';
import { authRouter } from './routes/auth.js';
import { adminRouter } from './routes/admin.js';
import { dashboardRouter } from './routes/dashboard.js';
import { notificationsRouter } from './routes/notifications.js';
import { documentsRouter } from './routes/documents.js';
import { workflowRouter } from './routes/workflow.js';
import { reportsRouter } from './routes/reports.js';
import { aiRouter } from './routes/ai.js';
import { metaRouter } from './routes/meta.js';

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
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
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

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    app: 'INDUSTRIAL HSE PRO',
    version: '1.0.0',
    database: dbLabel,
    dialect,
    aiConfigured: Boolean(process.env.GEMINI_API_KEY),
    time: new Date().toISOString(),
  });
});

app.use('/api/meta', metaRouter);
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/workflow', workflowRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/ai', aiRouter);

/* One permission-aware CRUD router per HSE module. */
for (const def of MODULES) {
  app.use(`/api/data/${def.name}`, createResourceRouter(def));
}

app.use('/api', (req, res) => res.status(404).json({ error: 'API endpoint not found.', code: 'not_found' }));

if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR, { index: false, maxAge: '7d' }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
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
  if (error?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Uploaded content is too large. Maximum request size is 12 MB.' });
  }
  if (error?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed request body.', code: 'bad_json' });
  }
  console.error('[server] unhandled error', error);
  return res.status(500).json({ error: 'Unexpected server error. Please try again.', code: 'server_error' });
});

const PORT = Number(process.env.PORT || 3000);

async function start() {
  await initDb();
  await exec(SCHEMA_SQL);
  await seedReferenceData();
  await bootstrapSuperAdmin();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`INDUSTRIAL HSE PRO listening on 0.0.0.0:${PORT} (${dbLabel})`);
  });
}

if (process.env.HSE_PRINT_ROUTES === '1') {
  console.log(MODULES.map((m) => `/api/data/${m.name}`).join('\n'));
}

start().catch((error) => {
  console.error('[startup] failed', error);
  process.exit(1);
});
