import crypto from 'node:crypto';
import { get, run, query } from './db.js';
import { newId, nowIso, HttpError, unauthorized, forbidden, cleanText } from './util.js';

export const ROLES = ['super_admin', 'admin', 'hse_manager', 'safety_officer', 'supervisor', 'viewer'];

export const ROLE_DEFS = {
  super_admin: { label: 'Super Admin', level: 100, viewAll: true, manageUsers: true, system: true, approve: true, verify: true },
  admin: { label: 'Admin', level: 90, viewAll: true, manageUsers: true, system: true, approve: true, verify: true },
  hse_manager: { label: 'HSE Manager', level: 80, viewAll: true, manageUsers: false, system: false, approve: true, verify: true },
  safety_officer: { label: 'Safety Officer', level: 60, viewAll: true, manageUsers: false, system: false, approve: true, verify: true },
  supervisor: { label: 'Supervisor', level: 40, viewAll: false, manageUsers: false, system: false, approve: false, verify: false },
  viewer: { label: 'Viewer', level: 20, viewAll: false, manageUsers: false, system: false, approve: false, verify: false, readOnly: true },
};

export const SESSION_COOKIE = 'hse_session';
const SESSION_HOURS_REMEMBER = 24 * 30;
const SESSION_HOURS_DEFAULT = 12;

export function roleLevel(role) {
  return ROLE_DEFS[role]?.level ?? 0;
}

export function canViewAll(role) {
  return Boolean(ROLE_DEFS[role]?.viewAll);
}

export function isReadOnly(role) {
  return Boolean(ROLE_DEFS[role]?.readOnly);
}

export function permissionsFor(role) {
  const def = ROLE_DEFS[role] || {};
  return {
    role,
    label: def.label || role,
    viewAll: Boolean(def.viewAll),
    manageUsers: Boolean(def.manageUsers),
    system: Boolean(def.system),
    approve: Boolean(def.approve),
    verify: Boolean(def.verify),
    readOnly: Boolean(def.readOnly),
  };
}

/* ------------------------------------------------------------------ passwords */

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  return `scrypt$16384$8$1$${salt}$${derived}`;
}

export function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, salt, expected] = parts;
  try {
    const derived = crypto.scryptSync(password, salt, 64, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
    });
    const expectedBuffer = Buffer.from(expected, 'hex');
    if (expectedBuffer.length !== derived.length) return false;
    return crypto.timingSafeEqual(expectedBuffer, derived);
  } catch {
    return false;
  }
}

export function passwordIssues(password) {
  const issues = [];
  if (typeof password !== 'string' || password.length < 8) issues.push('Password must be at least 8 characters long.');
  if (typeof password === 'string' && password.length > 128) issues.push('Password must be 128 characters or fewer.');
  if (typeof password === 'string' && !/[A-Za-z]/.test(password)) issues.push('Password must contain at least one letter.');
  if (typeof password === 'string' && !/[0-9]/.test(password)) issues.push('Password must contain at least one number.');
  return issues;
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function randomToken() {
  return crypto.randomBytes(32).toString('base64url');
}

/* ------------------------------------------------------------------- sessions */

function cookieOptions(req, maxAgeMs) {
  const forwarded = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const secure = req.secure || forwarded === 'https' || process.env.FORCE_SECURE_COOKIES === 'true';
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: maxAgeMs,
  };
}

export async function createSession(user, req, res, remember = false) {
  const token = randomToken();
  const hours = remember ? SESSION_HOURS_REMEMBER : SESSION_HOURS_DEFAULT;
  const expiresAt = new Date(Date.now() + hours * 3600 * 1000).toISOString();
  await run(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at, ip, user_agent, created_at) VALUES (?,?,?,?,?,?,?)`,
    [
      newId(),
      user.id,
      hashToken(token),
      expiresAt,
      String(req.headers['x-forwarded-for'] || req.ip || '').slice(0, 100),
      String(req.headers['user-agent'] || '').slice(0, 250),
      nowIso(),
    ],
  );
  res.cookie(SESSION_COOKIE, token, cookieOptions(req, hours * 3600 * 1000));
  await run('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?', [nowIso(), nowIso(), user.id]);
  // Housekeeping: drop expired sessions for this user.
  await run('DELETE FROM sessions WHERE expires_at < ?', [nowIso()]);
  return token;
}

export async function destroySession(req, res) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) {
    await run('DELETE FROM sessions WHERE token_hash = ?', [hashToken(token)]);
  }
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    email: row.email || '',
    phone: row.phone || '',
    role: row.role,
    roleLabel: ROLE_DEFS[row.role]?.label || row.role,
    department: row.department || '',
    designation: row.designation || '',
    employeeCode: row.employee_code || '',
    status: row.status,
    mustChangePassword: Boolean(row.must_change_password),
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    permissions: permissionsFor(row.role),
  };
}

/** Populates req.user from the session cookie. Never throws. */
export async function attachUser(req, _res, next) {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    req.user = null;
    if (!token) return next();
    const row = await get(
      `SELECT s.id AS session_id, s.expires_at, u.* FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`,
      [hashToken(token)],
    );
    if (!row) return next();
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await run('DELETE FROM sessions WHERE id = ?', [row.session_id]);
      return next();
    }
    if (row.status !== 'active') return next();
    req.user = row;
    req.permissions = permissionsFor(row.role);
    return next();
  } catch (error) {
    return next(error);
  }
}

export function requireAuth(req, _res, next) {
  if (!req.user) return next(unauthorized());
  return next();
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden('Your role does not allow this action.'));
    return next();
  };
}

export function requirePermission(permission) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!permissionsFor(req.user.role)[permission]) {
      return next(forbidden('Your role does not allow this action.'));
    }
    return next();
  };
}

/* ---------------------------------------------------------------------- audit */

export async function audit(req, action, entity, entityId, details) {
  try {
    await run(
      `INSERT INTO audit_logs (id, user_id, username, action, entity, entity_id, details, ip, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        newId(),
        req.user?.id || null,
        req.user?.username || 'anonymous',
        action,
        entity || null,
        entityId || null,
        typeof details === 'string' ? details : JSON.stringify(details || {}),
        String(req.headers['x-forwarded-for'] || req.ip || '').slice(0, 100),
        nowIso(),
      ],
    );
  } catch {
    // Auditing must never break the request path.
  }
}

/* --------------------------------------------------------------- registration */

export function validateRegistration(body) {
  const errors = {};
  const username = cleanText(body.username, 32).trim().toLowerCase();
  const fullName = cleanText(body.full_name || body.fullName, 120).trim();
  const password = typeof body.password === 'string' ? body.password : '';
  const confirm = typeof body.confirm_password === 'string' ? body.confirm_password : body.confirmPassword;

  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    errors.username = 'Username must be 3-32 characters using letters, numbers, dot, dash or underscore.';
  }
  if (fullName.length < 3) errors.full_name = 'Please enter your full name.';
  const pwIssues = passwordIssues(password);
  if (pwIssues.length) errors.password = pwIssues[0];
  if (confirm !== undefined && confirm !== password) errors.confirm_password = 'Passwords do not match.';
  const email = cleanText(body.email, 160).trim();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) errors.email = 'Enter a valid email address.';
  const phone = cleanText(body.phone || body.contact, 40).trim();
  if (!phone) errors.phone = 'Contact number is required.';
  else if (!/^[+0-9][0-9\s()-]{5,25}$/.test(phone)) errors.phone = 'Enter a valid contact number.';

  return { errors, value: { username, fullName, password, email, phone } };
}

export async function userCount() {
  const rows = await query('SELECT COUNT(*) AS total FROM users');
  return Number(rows[0]?.total || 0);
}

export async function getSetting(key, fallback = null) {
  const row = await get('SELECT value FROM settings WHERE key = ?', [key]);
  if (!row || row.value === null || row.value === undefined) return fallback;
  return row.value;
}

export async function setSetting(key, value, userId = null) {
  const existing = await get('SELECT key FROM settings WHERE key = ?', [key]);
  if (existing) {
    await run('UPDATE settings SET value = ?, updated_at = ?, updated_by = ? WHERE key = ?', [
      String(value),
      nowIso(),
      userId,
      key,
    ]);
  } else {
    await run('INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?,?,?,?)', [
      key,
      String(value),
      nowIso(),
      userId,
    ]);
  }
}

export async function registrationApprovalRequired() {
  const value = await getSetting('registration_approval', 'on');
  return String(value).toLowerCase() !== 'off';
}

/** Creates the first Super Admin from server-side environment secrets. */
export async function bootstrapSuperAdmin() {
  const username = (process.env.SUPER_ADMIN_USERNAME || '').trim().toLowerCase();
  const password = process.env.SUPER_ADMIN_PASSWORD || '';
  if (!username || !password) return null;
  if (passwordIssues(password).length) return null;
  const existing = await get(`SELECT id FROM users WHERE role = 'super_admin' LIMIT 1`);
  if (existing) return null;
  const now = nowIso();
  const id = newId();
  const clash = await get('SELECT id FROM users WHERE username = ?', [username]);
  if (clash) {
    await run(`UPDATE users SET role = 'super_admin', status = 'active', password_hash = ?, updated_at = ? WHERE id = ?`, [
      hashPassword(password),
      now,
      clash.id,
    ]);
    return clash.id;
  }
  await run(
    `INSERT INTO users (id, username, full_name, email, phone, password_hash, role, department, designation,
      employee_code, status, approved_at, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id,
      username,
      process.env.SUPER_ADMIN_NAME || 'System Administrator',
      process.env.SUPER_ADMIN_EMAIL || null,
      null,
      hashPassword(password),
      'super_admin',
      'HSE',
      'System Administrator',
      null,
      'active',
      now,
      now,
      now,
    ],
  );
  return id;
}
