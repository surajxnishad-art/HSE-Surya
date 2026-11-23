import { Router } from 'express';
import { get, query, run } from '../db.js';
import {
  ROLES,
  audit,
  createSession,
  destroySession,
  hashPassword,
  hashToken,
  passwordIssues,
  publicUser,
  randomToken,
  registrationApprovalRequired,
  requireAuth,
  setSetting,
  userCount,
  validateRegistration,
  verifyPassword,
} from '../auth.js';
import { asyncHandler, badRequest, forbidden, newId, nowIso, unauthorized } from '../util.js';

export const authRouter = Router();

/* Simple in-memory throttle for credential endpoints (per process). */
const attempts = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function throttleKey(req, username) {
  return `${req.ip || 'ip'}:${String(username || '').toLowerCase()}`;
}

function tooManyAttempts(key) {
  const entry = attempts.get(key);
  if (!entry) return false;
  if (Date.now() - entry.first > WINDOW_MS) {
    attempts.delete(key);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

function registerFailure(key) {
  const entry = attempts.get(key);
  if (!entry || Date.now() - entry.first > WINDOW_MS) {
    attempts.set(key, { count: 1, first: Date.now() });
  } else {
    entry.count += 1;
  }
}

function clearFailures(key) {
  attempts.delete(key);
}

authRouter.get(
  '/bootstrap',
  asyncHandler(async (req, res) => {
    const total = await userCount();
    const company = await get("SELECT value FROM settings WHERE key = 'company_name'");
    const approval = await registrationApprovalRequired();
    res.json({
      needsSetup: total === 0,
      userCount: total,
      registrationApprovalRequired: approval,
      companyName: company?.value || 'Industrial HSE Pro',
      aiConfigured: Boolean(process.env.GEMINI_API_KEY),
      authenticated: Boolean(req.user),
    });
  }),
);

/** One-time first-run creation of the Super Admin. Disabled as soon as a user exists. */
authRouter.post(
  '/setup',
  asyncHandler(async (req, res) => {
    const total = await userCount();
    if (total > 0) throw forbidden('Setup has already been completed. Please sign in instead.');
    const { errors, value } = validateRegistration(req.body || {});
    if (Object.keys(errors).length) throw badRequest('Please correct the highlighted fields.', { fields: errors });
    const now = nowIso();
    const id = newId();
    await run(
      `INSERT INTO users (id, username, full_name, email, phone, password_hash, role, department, designation,
        employee_code, status, approved_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        value.username,
        value.fullName,
        value.email || null,
        value.phone,
        hashPassword(value.password),
        'super_admin',
        (req.body || {}).department || 'HSE',
        (req.body || {}).designation || 'System Administrator',
        (req.body || {}).employee_code || null,
        'active',
        now,
        now,
        now,
      ],
    );
    const user = await get('SELECT * FROM users WHERE id = ?', [id]);
    await createSession(user, req, res, true);
    await audit(req, 'setup', 'system', id, { username: value.username, role: 'super_admin' });
    res.status(201).json({ user: publicUser(user), message: 'Super Admin account created. Welcome to Industrial HSE Pro.' });
  }),
);

authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { errors, value } = validateRegistration(req.body || {});
    if (Object.keys(errors).length) throw badRequest('Please correct the highlighted fields.', { fields: errors });

    const existing = await get('SELECT id FROM users WHERE username = ?', [value.username]);
    if (existing) throw badRequest('That username is already taken.', { fields: { username: 'Username already exists.' } });

    const total = await userCount();
    const approvalRequired = await registrationApprovalRequired();
    const requestedRole = ['supervisor', 'viewer'].includes((req.body || {}).requested_role)
      ? req.body.requested_role
      : 'supervisor';
    const isFirst = total === 0;
    const status = isFirst || !approvalRequired ? 'active' : 'pending';
    const role = isFirst ? 'super_admin' : requestedRole;
    const now = nowIso();
    const id = newId();

    await run(
      `INSERT INTO users (id, username, full_name, email, phone, password_hash, role, department, designation,
        employee_code, status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        value.username,
        value.fullName,
        value.email || null,
        value.phone,
        hashPassword(value.password),
        role,
        String((req.body || {}).department || '').slice(0, 80) || null,
        String((req.body || {}).designation || '').slice(0, 80) || null,
        String((req.body || {}).employee_code || '').slice(0, 40) || null,
        status,
        now,
        now,
      ],
    );

    if (status === 'pending') {
      const admins = await query(`SELECT id FROM users WHERE role IN ('super_admin','admin') AND status = 'active'`);
      for (const admin of admins) {
        await run(
          `INSERT INTO notifications (id, user_id, role, title, message, type, link, created_at) VALUES (?,?,?,?,?,?,?,?)`,
          [
            newId(),
            admin.id,
            null,
            'New registration awaiting approval',
            `${value.fullName} (${value.username}) requested access.`,
            'approval',
            '/admin/users',
            nowIso(),
          ],
        );
      }
    }

    const user = await get('SELECT * FROM users WHERE id = ?', [id]);
    await audit(req, 'register', 'user', id, { username: value.username, status, role });

    if (status === 'active') {
      await createSession(user, req, res, false);
      return res.status(201).json({
        user: publicUser(user),
        message: isFirst ? 'Super Admin account created successfully.' : 'Account created and signed in.',
      });
    }
    return res.status(201).json({
      user: null,
      pending: true,
      message: 'Account created. An administrator must approve it before you can sign in.',
    });
  }),
);

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const username = String((req.body || {}).username || '').trim().toLowerCase();
    const password = String((req.body || {}).password || '');
    const remember = Boolean((req.body || {}).remember);
    if (!username || !password) throw badRequest('Username and password are required.');

    const key = throttleKey(req, username);
    if (tooManyAttempts(key)) {
      throw badRequest('Too many failed sign-in attempts. Please wait 10 minutes and try again.');
    }

    const user = await get('SELECT * FROM users WHERE username = ?', [username]);
    if (!user || !verifyPassword(password, user.password_hash)) {
      registerFailure(key);
      throw unauthorized('Invalid username or password.');
    }
    if (user.status === 'pending') {
      throw forbidden('Your account is awaiting administrator approval.');
    }
    if (user.status !== 'active') {
      throw forbidden('Your account is not active. Please contact your administrator.');
    }
    clearFailures(key);
    await createSession(user, req, res, remember);
    await audit(req, 'login', 'user', user.id, { username: user.username });
    res.json({ user: publicUser(user), message: 'Signed in successfully.' });
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    await destroySession(req, res);
    if (req.user) await audit(req, 'logout', 'user', req.user.id, {});
    res.json({ message: 'Signed out successfully.' });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const unread = await get(
      'SELECT COUNT(*) AS total FROM notifications WHERE (user_id = ? OR (user_id IS NULL AND role = ?)) AND read_at IS NULL',
      [req.user.id, req.user.role],
    );
    let pendingApprovals = 0;
    if (req.permissions.manageUsers) {
      const pending = await get("SELECT COUNT(*) AS total FROM users WHERE status = 'pending'");
      pendingApprovals = Number(pending?.total || 0);
    }
    const company = await get("SELECT value FROM settings WHERE key = 'company_name'");
    res.json({
      user: publicUser(req.user),
      unreadNotifications: Number(unread?.total || 0),
      pendingApprovals,
      companyName: company?.value || 'Industrial HSE Pro',
      aiConfigured: Boolean(process.env.GEMINI_API_KEY),
    });
  }),
);

authRouter.put(
  '/profile',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const updates = {};
    if (typeof body.full_name === 'string' && body.full_name.trim().length >= 3) {
      updates.full_name = body.full_name.trim().slice(0, 120);
    }
    if (typeof body.email === 'string') {
      const email = body.email.trim();
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) {
        throw badRequest('Enter a valid email address.', { fields: { email: 'Invalid email address.' } });
      }
      updates.email = email || null;
    }
    if (typeof body.phone === 'string') updates.phone = body.phone.trim().slice(0, 40) || null;
    if (typeof body.designation === 'string') updates.designation = body.designation.trim().slice(0, 80) || null;
    if (typeof body.department === 'string') updates.department = body.department.trim().slice(0, 80) || null;
    const columns = Object.keys(updates);
    if (!columns.length) throw badRequest('No changes were submitted.');
    await run(
      `UPDATE users SET ${columns.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
      [...columns.map((c) => updates[c]), nowIso(), req.user.id],
    );
    const saved = await get('SELECT * FROM users WHERE id = ?', [req.user.id]);
    await audit(req, 'update', 'profile', req.user.id, { changed: columns });
    res.json({ user: publicUser(saved), message: 'Profile updated.' });
  }),
);

authRouter.post(
  '/change-password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const current = String((req.body || {}).current_password || '');
    const next = String((req.body || {}).new_password || '');
    const confirm = String((req.body || {}).confirm_password ?? next);
    const user = await get('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!verifyPassword(current, user.password_hash)) {
      throw badRequest('Current password is incorrect.', { fields: { current_password: 'Incorrect password.' } });
    }
    const issues = passwordIssues(next);
    if (issues.length) throw badRequest(issues[0], { fields: { new_password: issues[0] } });
    if (next !== confirm) throw badRequest('Passwords do not match.', { fields: { confirm_password: 'Passwords do not match.' } });
    await run('UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?', [
      hashPassword(next),
      nowIso(),
      req.user.id,
    ]);
    // Invalidate every other session for this account.
    await run('DELETE FROM sessions WHERE user_id = ? AND id <> ?', [req.user.id, req.user.session_id]);
    await audit(req, 'change_password', 'user', req.user.id, {});
    res.json({ message: 'Password changed successfully.' });
  }),
);

authRouter.post(
  '/forgot-password',
  asyncHandler(async (req, res) => {
    const username = String((req.body || {}).username || '').trim().toLowerCase();
    if (!username) throw badRequest('Please enter your username.');
    const user = await get('SELECT * FROM users WHERE username = ?', [username]);
    const generic = {
      message:
        'If the username exists, a password reset request has been sent to the HSE administrators. Contact your administrator if you need faster assistance.',
    };
    if (!user) return res.json(generic);
    const token = randomToken();
    await run(
      `INSERT INTO password_resets (id, user_id, username, token_hash, expires_at, used, requested_at)
       VALUES (?,?,?,?,?,?,?)`,
      [newId(), user.id, user.username, hashToken(token), new Date(Date.now() + 60 * 60 * 1000).toISOString(), 0, nowIso()],
    );
    const admins = await query(`SELECT id FROM users WHERE role IN ('super_admin','admin') AND status = 'active'`);
    for (const admin of admins) {
      await run(
        `INSERT INTO notifications (id, user_id, title, message, type, link, created_at) VALUES (?,?,?,?,?,?,?)`,
        [
          newId(),
          admin.id,
          'Password reset requested',
          `${user.full_name} (${user.username}) requested a password reset. Generate a one-time reset link from User Management.`,
          'reset',
          '/admin/users',
          nowIso(),
        ],
      );
    }
    return res.json(generic);
  }),
);

authRouter.post(
  '/reset-password',
  asyncHandler(async (req, res) => {
    const token = String((req.body || {}).token || '');
    const password = String((req.body || {}).new_password || '');
    const confirm = String((req.body || {}).confirm_password ?? password);
    if (!token) throw badRequest('Reset link is invalid or incomplete.');
    const issues = passwordIssues(password);
    if (issues.length) throw badRequest(issues[0], { fields: { new_password: issues[0] } });
    if (password !== confirm) throw badRequest('Passwords do not match.', { fields: { confirm_password: 'Passwords do not match.' } });
    const row = await get('SELECT * FROM password_resets WHERE token_hash = ?', [hashToken(token)]);
    if (!row || row.used) throw badRequest('This reset link has already been used. Request a new one.');
    if (new Date(row.expires_at).getTime() < Date.now()) throw badRequest('This reset link has expired. Request a new one.');
    await run('UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?', [
      hashPassword(password),
      nowIso(),
      row.user_id,
    ]);
    await run('UPDATE password_resets SET used = 1, used_at = ? WHERE id = ?', [nowIso(), row.id]);
    await run('DELETE FROM sessions WHERE user_id = ?', [row.user_id]);
    await audit(req, 'reset_password', 'user', row.user_id, {});
    res.json({ message: 'Password reset successfully. You can now sign in.' });
  }),
);

export { ROLES, setSetting };
