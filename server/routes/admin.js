import { Router } from 'express';
import { get, query, run } from '../db.js';
import { ROLES, ROLE_DEFS, audit, hashPassword, hashToken, publicUser, randomToken, requirePermission } from '../auth.js';
import { asyncHandler, badRequest, clampInt, cleanText, forbidden, newId, notFound, nowIso, round } from '../util.js';

export const adminRouter = Router();

/* ------------------------------------------------------------------- users */

adminRouter.get(
  '/users',
  requirePermission('manageUsers'),
  asyncHandler(async (req, res) => {
    const page = clampInt(req.query.page, 1, 100000, 1);
    const pageSize = clampInt(req.query.pageSize, 1, 200, 20);
    const clauses = [];
    const params = [];
    const q = cleanText(req.query.q, 120).trim();
    if (q) {
      clauses.push('(username LIKE ? OR full_name LIKE ? OR employee_code LIKE ? OR department LIKE ?)');
      const pattern = `%${q}%`;
      params.push(pattern, pattern, pattern, pattern);
    }
    if (req.query.status && req.query.status !== 'all') {
      clauses.push('status = ?');
      params.push(String(req.query.status));
    }
    if (req.query.role && req.query.role !== 'all') {
      clauses.push('role = ?');
      params.push(String(req.query.role));
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const totalRow = await get(`SELECT COUNT(*) AS total FROM users ${where}`, params);
    const rows = await query(
      `SELECT * FROM users ${where} ORDER BY
        CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize],
    );
    const counts = await query('SELECT status, COUNT(*) AS total FROM users GROUP BY status');
    res.json({
      items: rows.map(publicUser),
      total: Number(totalRow?.total || 0),
      page,
      pageSize,
      pages: Math.max(1, Math.ceil(Number(totalRow?.total || 0) / pageSize)),
      counts: Object.fromEntries(counts.map((c) => [c.status, Number(c.total)])),
      roles: ROLES.map((role) => ({ value: role, label: ROLE_DEFS[role].label })),
    });
  }),
);

adminRouter.patch(
  '/users/:id',
  requirePermission('manageUsers'),
  asyncHandler(async (req, res) => {
    const target = await get('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!target) throw notFound('User not found.');
    const actor = req.user;
    if (target.role === 'super_admin' && actor.role !== 'super_admin') {
      throw forbidden('Only a Super Admin can modify another Super Admin.');
    }
    const body = req.body || {};
    const updates = {};
    const errors = {};

    if (body.role !== undefined) {
      if (!ROLES.includes(body.role)) errors.role = 'Invalid role.';
      else if (body.role === 'super_admin' && actor.role !== 'super_admin') {
        errors.role = 'Only a Super Admin can grant Super Admin access.';
      } else if (target.id === actor.id && body.role !== target.role) {
        errors.role = 'You cannot change your own role.';
      } else updates.role = body.role;
    }
    if (body.status !== undefined) {
      if (!['pending', 'active', 'inactive', 'rejected'].includes(body.status)) errors.status = 'Invalid status.';
      else if (target.id === actor.id && body.status !== 'active') errors.status = 'You cannot deactivate your own account.';
      else updates.status = body.status;
    }
    if (body.full_name !== undefined) updates.full_name = cleanText(body.full_name, 120).trim();
    if (body.department !== undefined) updates.department = cleanText(body.department, 80).trim() || null;
    if (body.designation !== undefined) updates.designation = cleanText(body.designation, 80).trim() || null;
    if (body.employee_code !== undefined) updates.employee_code = cleanText(body.employee_code, 40).trim() || null;
    if (body.phone !== undefined) updates.phone = cleanText(body.phone, 40).trim() || null;
    if (body.email !== undefined) updates.email = cleanText(body.email, 160).trim() || null;

    if (Object.keys(errors).length) throw badRequest('Please correct the highlighted fields.', { fields: errors });
    const columns = Object.keys(updates);
    if (!columns.length) throw badRequest('No changes were submitted.');

    if (updates.status === 'active' && target.status !== 'active') {
      updates.approved_by = actor.id;
      updates.approved_at = nowIso();
    }
    await run(
      `UPDATE users SET ${columns.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
      [...columns.map((c) => updates[c]), nowIso(), target.id],
    );
    if (updates.status && updates.status !== 'active') {
      await run('DELETE FROM sessions WHERE user_id = ?', [target.id]);
    }
    if (updates.status === 'active' && target.status === 'pending') {
      await run(
        `INSERT INTO notifications (id, user_id, title, message, type, link, created_at) VALUES (?,?,?,?,?,?,?)`,
        [
          newId(),
          target.id,
          'Your account was approved',
          'An administrator approved your account. You can now sign in.',
          'approval',
          '/dashboard',
          nowIso(),
        ],
      );
    }
    await audit(req, 'admin_update', 'user', target.id, { changed: columns, values: updates });
    const saved = await get('SELECT * FROM users WHERE id = ?', [target.id]);
    res.json({ user: publicUser(saved), message: 'User updated successfully.' });
  }),
);

adminRouter.post(
  '/users/:id/reset-link',
  requirePermission('manageUsers'),
  asyncHandler(async (req, res) => {
    const target = await get('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!target) throw notFound('User not found.');
    if (target.role === 'super_admin' && req.user.role !== 'super_admin' && target.id !== req.user.id) {
      throw forbidden('Only a Super Admin can reset another Super Admin password.');
    }
    const token = randomToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await run(
      `INSERT INTO password_resets (id, user_id, username, token_hash, expires_at, used, requested_at)
       VALUES (?,?,?,?,?,?,?)`,
      [newId(), target.id, target.username, hashToken(token), expiresAt, 0, nowIso()],
    );
    await audit(req, 'admin_reset_link', 'user', target.id, {});
    res.json({
      link: `/reset-password?token=${encodeURIComponent(token)}`,
      expiresAt,
      username: target.username,
      message: 'One-time reset link generated. Share it with the user over a trusted channel; it expires in 60 minutes.',
    });
  }),
);

adminRouter.post(
  '/users/:id/temp-password',
  requirePermission('manageUsers'),
  asyncHandler(async (req, res) => {
    const target = await get('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!target) throw notFound('User not found.');
    if (target.role === 'super_admin' && req.user.role !== 'super_admin') {
      throw forbidden('Only a Super Admin can reset another Super Admin password.');
    }
    const temporary = `Hse${Math.random().toString(36).slice(2, 8)}${Math.floor(100 + Math.random() * 900)}`;
    await run('UPDATE users SET password_hash = ?, must_change_password = 1, updated_at = ? WHERE id = ?', [
      hashPassword(temporary),
      nowIso(),
      target.id,
    ]);
    await run('DELETE FROM sessions WHERE user_id = ?', [target.id]);
    await audit(req, 'admin_temp_password', 'user', target.id, {});
    res.json({
      temporaryPassword: temporary,
      message: 'Temporary password set. The user must change it after signing in.',
    });
  }),
);

adminRouter.delete(
  '/users/:id',
  requirePermission('manageUsers'),
  asyncHandler(async (req, res) => {
    if (req.user.role !== 'super_admin') throw forbidden('Only a Super Admin can delete accounts.');
    if (req.params.id === req.user.id) throw badRequest('You cannot delete your own account.');
    const target = await get('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!target) throw notFound('User not found.');
    await run('DELETE FROM sessions WHERE user_id = ?', [target.id]);
    await run('DELETE FROM users WHERE id = ?', [target.id]);
    await audit(req, 'admin_delete', 'user', target.id, { username: target.username });
    res.json({ message: 'User account deleted.' });
  }),
);

adminRouter.get(
  '/reset-requests',
  requirePermission('manageUsers'),
  asyncHandler(async (req, res) => {
    const rows = await query(
      `SELECT pr.id, pr.username, pr.requested_at, pr.used, u.full_name
       FROM password_resets pr LEFT JOIN users u ON u.id = pr.user_id
       WHERE pr.used = 0 ORDER BY pr.requested_at DESC LIMIT 25`,
    );
    res.json({ items: rows });
  }),
);

/* ------------------------------------------------------------- departments */

function simpleResource(table, label, fields) {
  const router = Router();
  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const rows = await query(`SELECT * FROM ${table} ORDER BY name ASC`);
      res.json({ items: rows, total: rows.length });
    }),
  );
  router.post(
    '/',
    requirePermission('manageUsers'),
    asyncHandler(async (req, res) => {
      const record = { id: newId() };
      for (const [name, max] of fields) {
        record[name] = cleanText((req.body || {})[name], max).trim() || null;
      }
      if (!record.name) throw badRequest('Name is required.', { fields: { name: 'Name is required.' } });
      const now = nowIso();
      await run(
        `INSERT INTO ${table} (id, ${fields.map(([n]) => n).join(', ')}, created_at, updated_at)
         VALUES (?, ${fields.map(() => '?').join(', ')}, ?, ?)`,
        [record.id, ...fields.map(([n]) => record[n]), now, now],
      );
      await audit(req, 'create', label, record.id, record);
      res.status(201).json({ item: await get(`SELECT * FROM ${table} WHERE id = ?`, [record.id]), message: `${label} added.` });
    }),
  );
  router.put(
    '/:id',
    requirePermission('manageUsers'),
    asyncHandler(async (req, res) => {
      const existing = await get(`SELECT * FROM ${table} WHERE id = ?`, [req.params.id]);
      if (!existing) throw notFound();
      const record = {};
      for (const [name, max] of fields) {
        if (Object.prototype.hasOwnProperty.call(req.body || {}, name)) {
          record[name] = cleanText((req.body || {})[name], max).trim() || null;
        }
      }
      const columns = Object.keys(record);
      if (!columns.length) throw badRequest('No changes were submitted.');
      await run(
        `UPDATE ${table} SET ${columns.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
        [...columns.map((c) => record[c]), nowIso(), req.params.id],
      );
      await audit(req, 'update', label, req.params.id, record);
      res.json({ item: await get(`SELECT * FROM ${table} WHERE id = ?`, [req.params.id]), message: `${label} updated.` });
    }),
  );
  router.delete(
    '/:id',
    requirePermission('manageUsers'),
    asyncHandler(async (req, res) => {
      const existing = await get(`SELECT * FROM ${table} WHERE id = ?`, [req.params.id]);
      if (!existing) throw notFound();
      await run(`DELETE FROM ${table} WHERE id = ?`, [req.params.id]);
      await audit(req, 'delete', label, req.params.id, existing);
      res.json({ message: `${label} removed.` });
    }),
  );
  return router;
}

adminRouter.use(
  '/departments',
  simpleResource('departments', 'Department', [
    ['name', 120],
    ['code', 20],
    ['head', 120],
    ['location', 120],
  ]),
);

adminRouter.use(
  '/locations',
  simpleResource('locations', 'Location', [
    ['name', 120],
    ['type', 60],
    ['address', 240],
  ]),
);

/* ----------------------------------------------------------------- settings */

const EDITABLE_SETTINGS = [
  'company_name',
  'company_address',
  'prepared_by',
  'reviewed_by',
  'report_signatory',
  'registration_approval',
  'trir_base_hours',
  'ltifr_base_hours',
];

adminRouter.get(
  '/settings',
  requirePermission('system'),
  asyncHandler(async (req, res) => {
    const rows = await query('SELECT key, value, updated_at FROM settings');
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    res.json({
      settings: map,
      editable: EDITABLE_SETTINGS,
      environment: {
        database: process.env.DATABASE_URL ? 'PostgreSQL (DATABASE_URL configured)' : 'SQLite local file',
        aiConfigured: Boolean(process.env.GEMINI_API_KEY),
        aiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
        superAdminBootstrap: Boolean(process.env.SUPER_ADMIN_USERNAME),
      },
    });
  }),
);

adminRouter.put(
  '/settings',
  requirePermission('system'),
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const changed = [];
    for (const key of EDITABLE_SETTINGS) {
      if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
      const value = cleanText(body[key], 500).trim();
      const existing = await get('SELECT key FROM settings WHERE key = ?', [key]);
      if (existing) {
        await run('UPDATE settings SET value = ?, updated_at = ?, updated_by = ? WHERE key = ?', [
          value,
          nowIso(),
          req.user.id,
          key,
        ]);
      } else {
        await run('INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?,?,?,?)', [
          key,
          value,
          nowIso(),
          req.user.id,
        ]);
      }
      changed.push(key);
    }
    if (!changed.length) throw badRequest('No settings were submitted.');
    await audit(req, 'update', 'settings', null, { changed });
    res.json({ message: 'System settings saved.', changed });
  }),
);

/* --------------------------------------------------------------- audit logs */

adminRouter.get(
  '/audit-logs',
  requirePermission('system'),
  asyncHandler(async (req, res) => {
    const page = clampInt(req.query.page, 1, 100000, 1);
    const pageSize = clampInt(req.query.pageSize, 1, 200, 25);
    const clauses = [];
    const params = [];
    if (req.query.q) {
      clauses.push('(username LIKE ? OR action LIKE ? OR entity LIKE ? OR details LIKE ?)');
      const pattern = `%${cleanText(req.query.q, 80)}%`;
      params.push(pattern, pattern, pattern, pattern);
    }
    if (req.query.action && req.query.action !== 'all') {
      clauses.push('action = ?');
      params.push(String(req.query.action));
    }
    if (req.query.from) {
      clauses.push('created_at >= ?');
      params.push(`${req.query.from}T00:00:00.000Z`);
    }
    if (req.query.to) {
      clauses.push('created_at <= ?');
      params.push(`${req.query.to}T23:59:59.999Z`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const totalRow = await get(`SELECT COUNT(*) AS total FROM audit_logs ${where}`, params);
    const rows = await query(`SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [
      ...params,
      pageSize,
      (page - 1) * pageSize,
    ]);
    res.json({
      items: rows,
      total: Number(totalRow?.total || 0),
      page,
      pageSize,
      pages: Math.max(1, Math.ceil(Number(totalRow?.total || 0) / pageSize)),
    });
  }),
);

/* ------------------------------------------------------------ system summary */

adminRouter.get(
  '/overview',
  requirePermission('manageUsers'),
  asyncHandler(async (req, res) => {
    const [users, records, actions, hazards, permits] = await Promise.all([
      query('SELECT role, status, COUNT(*) AS total FROM users GROUP BY role, status'),
      query('SELECT COUNT(*) AS total FROM audit_logs'),
      query("SELECT COUNT(*) AS total FROM actions WHERE status NOT IN ('verified','closed')"),
      query("SELECT COUNT(*) AS total FROM hazards WHERE status IN ('open','in_progress')"),
      query("SELECT COUNT(*) AS total FROM permits WHERE status IN ('pending','approved','active')"),
    ]);
    const byRole = {};
    let active = 0;
    let pending = 0;
    for (const row of users) {
      byRole[row.role] = (byRole[row.role] || 0) + Number(row.total);
      if (row.status === 'active') active += Number(row.total);
      if (row.status === 'pending') pending += Number(row.total);
    }
    res.json({
      totalUsers: users.reduce((sum, row) => sum + Number(row.total), 0),
      activeUsers: active,
      pendingUsers: pending,
      byRole,
      auditEvents: Number(records[0]?.total || 0),
      openActions: Number(actions[0]?.total || 0),
      openHazards: Number(hazards[0]?.total || 0),
      livePermits: Number(permits[0]?.total || 0),
    });
  }),
);

adminRouter.get(
  '/db-stats',
  requirePermission('system'),
  asyncHandler(async (req, res) => {
    const tables = ['users', 'employees', 'incidents', 'inspections', 'hazards', 'permits', 'actions', 'trainings', 'documents'];
    const out = {};
    for (const table of tables) {
      const row = await get(`SELECT COUNT(*) AS total FROM ${table}`);
      out[table] = Number(row?.total || 0);
    }
    res.json({ tables: out, retention: round(100, 0) });
  }),
);
