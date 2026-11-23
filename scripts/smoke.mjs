/**
 * End-to-end API smoke suite for INDUSTRIAL HSE PRO.
 *
 * Boots the real Express server against a throw-away database, then exercises
 * the full production flow over HTTP: bootstrap, registration, admin approval,
 * login/logout/re-login, per-user data persistence, RBAC, module CRUD,
 * dashboard aggregates, PDF/Excel report generation, document upload and the
 * unauthenticated access guards.
 *
 * Run: npm run smoke
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.SMOKE_PORT || 4311);
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN = { username: 'smokeadmin', password: 'SmokeAdmin123' };
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hse-smoke-'));

let passed = 0;
const failures = [];

function ok(name, extra = '') {
  passed += 1;
  console.log(`  \u2713 ${name}${extra ? ` — ${extra}` : ''}`);
}

function fail(name, detail) {
  failures.push(`${name}: ${detail}`);
  console.log(`  \u2717 ${name} — ${detail}`);
}

function check(name, condition, detail = '') {
  if (condition) ok(name, detail);
  else fail(name, detail || 'assertion failed');
  return Boolean(condition);
}

/* ------------------------------------------------------------ HTTP client */

function makeClient() {
  const jar = new Map();
  const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');

  async function call(method, url, body, opts = {}) {
    const headers = { Accept: 'application/json, application/pdf, application/octet-stream' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (jar.size) headers.Cookie = cookieHeader();
    const res = await fetch(`${BASE}${url}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
    });
    const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const raw of setCookies) {
      const [pair] = raw.split(';');
      const idx = pair.indexOf('=');
      if (idx > 0) {
        const name = pair.slice(0, idx).trim();
        const value = pair.slice(idx + 1).trim();
        if (value === '' || /expires=Thu, 01 Jan 1970/i.test(raw)) jar.delete(name);
        else jar.set(name, value);
      }
    }
    let json = null;
    let text = '';
    const type = res.headers.get('content-type') || '';
    if (type.includes('application/json')) {
      json = await res.json().catch(() => null);
    } else if (opts.binary) {
      const buf = Buffer.from(await res.arrayBuffer());
      text = buf;
    } else {
      text = await res.text();
    }
    return { status: res.status, json, text, headers: res.headers };
  }

  return {
    jar,
    get: (url, opts) => call('GET', url, undefined, opts),
    post: (url, body, opts) => call('POST', url, body, opts),
    put: (url, body, opts) => call('PUT', url, body, opts),
    patch: (url, body, opts) => call('PATCH', url, body, opts),
    del: (url, opts) => call('DELETE', url, undefined, opts),
  };
}

/* -------------------------------------------------------------- server */

async function waitForServer(timeoutMs = 45000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return res.json();
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Server did not become ready in time.');
}

function startServer() {
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      DATA_DIR,
      SUPER_ADMIN_USERNAME: ADMIN.username,
      SUPER_ADMIN_PASSWORD: ADMIN.password,
      SUPER_ADMIN_NAME: 'Smoke Administrator',
      SUPER_ADMIN_EMAIL: 'smoke.admin@example.com',
      NODE_ENV: 'test',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const log = [];
  child.stdout.on('data', (d) => log.push(String(d)));
  child.stderr.on('data', (d) => log.push(String(d)));
  return { child, log };
}

/* ---------------------------------------------------------- field filling */

const today = () => new Date().toISOString().slice(0, 10);

function valueForField(field, index) {
  if (Array.isArray(field.options) && field.options.length) {
    const first = field.options[0];
    return first && typeof first === 'object' ? first.value ?? first.label : first;
  }
  switch (field.type) {
    case 'integer':
    case 'number':
      return typeof field.min === 'number' && field.min > 0 ? field.min : 1;
    case 'date':
      return today();
    case 'datetime':
    case 'datetime-local':
      return new Date().toISOString().slice(0, 16);
    case 'bool':
      return true;
    case 'textarea':
      return 'Smoke test observation recorded by the automated verification suite.';
    case 'email':
      return `smoke${index}@example.com`;
    default:
      return `${field.label || 'Smoke'} ${index}`.slice(0, 60);
  }
}

function buildPayload(moduleDef, index, overrides = {}) {
  const payload = {};
  for (const field of moduleDef.fields || []) {
    if (field.readOnly || field.serverOnly) continue;
    if (!field.required) continue;
    payload[field.name] = valueForField(field, index);
  }
  return { ...payload, ...overrides };
}

/* ------------------------------------------------------------------ main */

async function main() {
  console.log(`\nINDUSTRIAL HSE PRO — end-to-end API smoke suite\nserver: ${BASE}\ndatabase: ${DATA_DIR}\n`);

  const { child, log } = startServer();
  const shutdown = () => {
    if (!child.killed) child.kill('SIGTERM');
  };
  process.on('exit', shutdown);

  try {
    const health = await waitForServer();
    ok('Server boots and reports health', `${health.database} / ${health.dialect}`);
    check('Health payload identifies the app', health.app === 'INDUSTRIAL HSE PRO', health.app);

    /* ------------------------------------------------ auth: admin login */
    const admin = makeClient();
    const adminLogin = await admin.post('/api/auth/login', { ...ADMIN, remember: true });
    check('Bootstrap Super Admin can sign in', adminLogin.status === 200, `HTTP ${adminLogin.status}`);
    check(
      'Signed-in admin has the super_admin role',
      adminLogin.json?.user?.role === 'super_admin',
      adminLogin.json?.user?.role,
    );
    check(
      'Password hash is never returned to the client',
      !JSON.stringify(adminLogin.json || {}).includes('password_hash'),
    );

    const me = await admin.get('/api/auth/me');
    check('Session is accepted on a follow-up request', me.status === 200 && Boolean(me.json?.user), `HTTP ${me.status}`);

    /* ------------------------------------- registration + admin approval */
    const officer = { username: 'smoke.officer', password: 'OfficerPass123', full_name: 'Smoke Safety Officer' };
    const reg = await makeClient().post('/api/auth/register', {
      username: officer.username,
      full_name: officer.full_name,
      password: officer.password,
      confirm_password: officer.password,
      department: 'Production',
      designation: 'Safety Officer',
      employee_code: 'EMP-SMOKE-1',
      phone: '+91 90000 00001',
      email: 'smoke.officer@example.com',
      requested_role: 'supervisor',
    });
    check('New account registration is accepted', reg.status === 201, `HTTP ${reg.status}`);

    const pendingClient = makeClient();
    const pendingLogin = await pendingClient.post('/api/auth/login', {
      username: officer.username,
      password: officer.password,
    });
    const pendingBlocked = pendingLogin.status === 403 || pendingLogin.status === 401;
    check('Unapproved account cannot sign in', pendingBlocked, `HTTP ${pendingLogin.status}`);

    const users = await admin.get('/api/admin/users?q=smoke.officer');
    const registered = (users.json?.items || [])[0];
    check('Admin can find the new registration', Boolean(registered), registered?.username);
    check('Registration starts in pending state', registered?.status === 'pending', registered?.status);

    const approve = await admin.patch(`/api/admin/users/${registered.id}`, { status: 'active', role: 'safety_officer' });
    check('Admin approves and assigns a role', approve.status === 200, `HTTP ${approve.status}`);
    check('Approved user receives the assigned role', approve.json?.user?.role === 'safety_officer', approve.json?.user?.role);

    const officerClient = makeClient();
    const officerLogin = await officerClient.post('/api/auth/login', {
      username: officer.username,
      password: officer.password,
      remember: true,
    });
    check('Approved user can sign in', officerLogin.status === 200, `HTTP ${officerLogin.status}`);

    /* ---------------------------------------------- module metadata + CRUD */
    const meta = await officerClient.get('/api/meta/modules');
    const modules = meta.json?.modules || [];
    check('Module metadata loads for the signed-in user', modules.length >= 10, `${modules.length} modules`);

    const incidentsDef = modules.find((m) => m.name === 'incidents');
    const incidentPayload = buildPayload(incidentsDef, 1, {
      type: 'near_miss',
      occurred_at: new Date().toISOString().slice(0, 16),
      severity: 'minor',
      status: 'open',
      department: 'Production',
      location: 'Press shop',
      description: 'Smoke test: hydraulic hose leaked near press 4; area cordoned and cleaned.',
    });
    const created = await officerClient.post('/api/data/incidents', incidentPayload);
    check('Safety officer can report an incident', created.status === 201, `HTTP ${created.status}`);
    const incidentId = created.json?.item?.id;
    check('Created incident returns a stored record id', Boolean(incidentId));
    check(
      'Server generates a reference number',
      Boolean(created.json?.item?.incident_no),
      created.json?.item?.incident_no,
    );

    const list = await officerClient.get('/api/data/incidents?page=1&pageSize=10');
    check('Incident list returns pagination envelope', typeof list.json?.total === 'number', `total=${list.json?.total}`);
    check('Reported incident appears in the list', (list.json?.items || []).some((i) => i.id === incidentId));

    const updated = await officerClient.put(`/api/data/incidents/${incidentId}`, { status: 'investigating' });
    check('Incident can be updated', updated.status === 200 && updated.json?.item?.status === 'investigating', `HTTP ${updated.status}`);

    /* -------------------------------------------------------- persistence */
    await officerClient.post('/api/auth/logout');
    const afterLogout = await officerClient.get('/api/auth/me');
    check('Logout invalidates the session', afterLogout.status === 401, `HTTP ${afterLogout.status}`);

    const relogin = officerClient;
    const reloginRes = await relogin.post('/api/auth/login', { username: officer.username, password: officer.password });
    check('User can sign in again after logout', reloginRes.status === 200, `HTTP ${reloginRes.status}`);
    const mine = await relogin.get('/api/data/incidents?page=1&pageSize=50');
    check(
      'Previous records are still visible after re-login',
      (mine.json?.items || []).some((i) => i.id === incidentId),
      'persisted incident found',
    );

    /* ---------------------------------------------------------------- RBAC */
    const viewerReg = await makeClient().post('/api/auth/register', {
      username: 'smoke.viewer',
      full_name: 'Smoke Viewer',
      password: 'ViewerPass123',
      confirm_password: 'ViewerPass123',
      department: 'HSE',
      designation: 'Observer',
      phone: '+91 90000 00002',
      requested_role: 'viewer',
    });
    const viewerList = await admin.get('/api/admin/users?q=smoke.viewer');
    const viewer = (viewerList.json?.items || [])[0];
    if (viewer) {
      await admin.patch(`/api/admin/users/${viewer.id}`, { status: 'active', role: 'viewer' });
    }
    check('Viewer account was created for the permission test', Boolean(viewer) && viewerReg.status === 201);

    const viewerClient = makeClient();
    const viewerLogin = await viewerClient.post('/api/auth/login', {
      username: 'smoke.viewer',
      password: 'ViewerPass123',
    });
    check('Viewer can sign in', viewerLogin.status === 200, `HTTP ${viewerLogin.status}`);

    const viewerWrite = await viewerClient.post('/api/data/incidents', incidentPayload);
    check('Viewer cannot create records (read-only role)', viewerWrite.status === 403, `HTTP ${viewerWrite.status}`);

    const viewerAdmin = await viewerClient.get('/api/admin/users');
    check('Viewer cannot reach user administration', viewerAdmin.status === 403, `HTTP ${viewerAdmin.status}`);

    const anon = makeClient();
    const anonData = await anon.get('/api/data/incidents');
    check('Unauthenticated request is rejected', anonData.status === 401, `HTTP ${anonData.status}`);
    const anonAdmin = await anon.get('/api/admin/users');
    check('Unauthenticated admin request is rejected', anonAdmin.status === 401, `HTTP ${anonAdmin.status}`);

    /* ------------------------------------------------------------ workflow */
    const hazardsDef = modules.find((m) => m.name === 'hazards');
    const hazardPayload = buildPayload(hazardsDef, 2, {
      title: 'Smoke test unguarded rotating shaft',
      category: 'machine',
      status: 'open',
      department: 'Production',
    });
    const hazard = await officerClient.post('/api/data/hazards', hazardPayload);
    check('Hazard can be recorded', hazard.status === 201, `HTTP ${hazard.status}`);
    const hazardId = hazard.json?.item?.id;
    if (hazardId) {
      const verify = await admin.post(`/api/workflow/hazards/${hazardId}/verify`, {
        verification: 'Guard installed and verified during the smoke walkthrough.',
        decision: 'close',
      });
      check('Authorised user can verify and close a hazard', verify.status === 200, `HTTP ${verify.status}`);
    }

    /* ----------------------------------------------------------- dashboard */
    const dash = await officerClient.get('/api/dashboard');
    check('Dashboard aggregates load', dash.status === 200, `HTTP ${dash.status}`);
    const kpis = dash.json?.kpis || dash.json?.stats || {};
    check(
      'Dashboard reflects the created incident in real figures',
      Number(kpis.incidents ?? 0) >= 1,
      `incidents=${kpis.incidents}`,
    );
    check('Dashboard returns a monthly series', Array.isArray(dash.json?.monthly) && dash.json.monthly.length > 0);

    /* ------------------------------------------------------------- reports */
    const catalog = await officerClient.get('/api/reports/catalog');
    check('Report catalogue is available', catalog.status === 200 && (catalog.json?.reports || []).length > 0, `HTTP ${catalog.status}`);

    const pdf = await officerClient.get('/api/reports/daily?format=pdf', { binary: true });
    check('PDF report is generated', pdf.status === 200 && pdf.text?.subarray?.(0, 4).toString() === '%PDF', `HTTP ${pdf.status}`);

    const xlsx = await officerClient.get('/api/reports/monthly?format=xlsx', { binary: true });
    check(
      'Excel report is generated',
      xlsx.status === 200 && xlsx.text?.subarray?.(0, 2).toString() === 'PK',
      `HTTP ${xlsx.status}`,
    );

    const reportJson = await officerClient.get('/api/reports/incident?format=json');
    check(
      'Report data returns structured sections',
      reportJson.status === 200 && Boolean(reportJson.json),
      `HTTP ${reportJson.status}`,
    );

    /* ----------------------------------------------------------- documents */
    const pngBytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    const upload = await officerClient.post('/api/documents', {
      title: 'Smoke test safety policy',
      category: 'policy',
      doc_type: 'pdf',
      version: '1.0',
      description: 'Uploaded by the automated smoke suite.',
      file: { name: 'smoke.png', mime: 'image/png', data: pngBytes.toString('base64') },
    });
    check('Document upload succeeds', upload.status === 201 || upload.status === 200, `HTTP ${upload.status}`);
    const docId = upload.json?.document?.id || upload.json?.item?.id;
    if (docId) {
      const download = await officerClient.get(`/api/documents/${docId}/download`, { binary: true });
      check('Uploaded document can be downloaded', download.status === 200, `HTTP ${download.status}`);
    }

    /* ------------------------------------------------------- notifications */
    const notes = await officerClient.get('/api/notifications');
    check('Notification feed loads', notes.status === 200 && Array.isArray(notes.json?.alerts), `HTTP ${notes.status}`);

    /* ------------------------------------------------------------ settings */
    const settings = await admin.get('/api/admin/settings');
    check('Super Admin can read system settings', settings.status === 200, `HTTP ${settings.status}`);
    const audit = await admin.get('/api/admin/audit-logs?page=1&pageSize=10');
    check('Audit log records activity', audit.status === 200 && (audit.json?.items || []).length > 0, `HTTP ${audit.status}`);

    /* ---------------------------------------------------------------- AI */
    const aiStatus = await officerClient.get('/api/ai/status');
    check('AI status endpoint responds without a key configured', aiStatus.status === 200, `HTTP ${aiStatus.status}`);

    /* ------------------------------------------------------------ deletion */
    const removed = await admin.del(`/api/data/incidents/${incidentId}`);
    check('Authorised user can delete a record', removed.status === 200 || removed.status === 204, `HTTP ${removed.status}`);
  } catch (error) {
    fail('suite aborted', error.message);
    if (log.length) console.log(`\n--- server log ---\n${log.join('').slice(-4000)}`);
  } finally {
    shutdown();
  }

  console.log(`\n${passed} checks passed, ${failures.length} failed`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const f of failures) console.log(` - ${f}`);
    process.exitCode = 1;
  } else {
    console.log('All end-to-end API checks passed.\n');
  }
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
}

main();
