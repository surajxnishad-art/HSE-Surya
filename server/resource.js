/**
 * Generic, permission-aware CRUD engine.
 *
 * Every HSE module is declared once in server/modules.js and gets list/detail/
 * create/update/delete endpoints with validation, search, sorting, pagination,
 * department scoping and audit logging.
 */
import { Router } from 'express';
import { get, query, run } from './db.js';
import { audit, canViewAll, isReadOnly } from './auth.js';
import {
  badRequest,
  cleanText,
  clampInt,
  forbidden,
  isoDate,
  isoDateTime,
  likePattern,
  newId,
  notFound,
  nowIso,
  unauthorized,
  asyncHandler,
} from './util.js';

const TEXT_MAX = 8000;

function coerce(field, raw) {
  const value = raw;
  switch (field.type) {
    case 'integer': {
      if (value === '' || value === null || value === undefined) return null;
      const n = Number.parseInt(value, 10);
      if (Number.isNaN(n)) throw new Error(`${field.label} must be a whole number.`);
      if (field.min !== undefined && n < field.min) throw new Error(`${field.label} must be at least ${field.min}.`);
      if (field.max !== undefined && n > field.max) throw new Error(`${field.label} must be at most ${field.max}.`);
      return n;
    }
    case 'number': {
      if (value === '' || value === null || value === undefined) return null;
      const n = Number(value);
      if (Number.isNaN(n)) throw new Error(`${field.label} must be a number.`);
      if (field.min !== undefined && n < field.min) throw new Error(`${field.label} must be at least ${field.min}.`);
      if (field.max !== undefined && n > field.max) throw new Error(`${field.label} must be at most ${field.max}.`);
      return n;
    }
    case 'date': {
      if (!value) return null;
      const iso = isoDate(value);
      if (!iso) throw new Error(`${field.label} must be a valid date.`);
      return iso;
    }
    case 'datetime': {
      if (!value) return null;
      const iso = isoDateTime(value);
      if (!iso) throw new Error(`${field.label} must be a valid date and time.`);
      return iso;
    }
    case 'enum': {
      if (!value) return null;
      if (!field.options.includes(value)) throw new Error(`${field.label} has an invalid value.`);
      return value;
    }
    case 'bool':
      return value === true || value === 'true' || value === 1 || value === '1' ? 1 : 0;
    case 'email': {
      if (!value) return null;
      const email = cleanText(value, 160).trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) throw new Error(`${field.label} must be a valid email.`);
      return email;
    }
    default: {
      if (value === null || value === undefined) return null;
      const text = cleanText(value, field.maxLength || TEXT_MAX).trim();
      if (field.maxLength && text.length > field.maxLength) {
        throw new Error(`${field.label} is too long.`);
      }
      return text;
    }
  }
}

function scopeFor(user, alias = '') {
  const prefix = alias ? `${alias}.` : '';
  if (!user) return { clause: '1 = 0', params: [] };
  if (canViewAll(user.role)) return { clause: '', params: [] };
  if (user.role === 'supervisor') {
    return {
      clause: `(${prefix}created_by = ? OR ${prefix}department = ?)`,
      params: [user.id, user.department || '__none__'],
    };
  }
  return { clause: `${prefix}created_by = ?`, params: [user.id] };
}

export function canWriteRow(user, row) {
  if (!user) return false;
  if (isReadOnly(user.role)) return false;
  if (canViewAll(user.role)) return true;
  if (user.role === 'supervisor') {
    return row.created_by === user.id || (row.department && row.department === user.department);
  }
  return row.created_by === user.id;
}

export function canDeleteRow(user, row) {
  if (!user) return false;
  if (['super_admin', 'admin', 'hse_manager'].includes(user.role)) return true;
  return row.created_by === user.id && !isReadOnly(user.role);
}

export function createResourceRouter(def) {
  const router = Router();
  const {
    name,
    table,
    fields,
    searchFields = [],
    filterFields = [],
    dateField = 'created_at',
    defaultSort = 'created_at',
    defaultDir = 'desc',
    numberField = null,
    numberPrefix = null,
    transformRow = null,
    beforeWrite = null,
    afterWrite = null,
    allowDelete = true,
    orderBy = null,
  } = def;

  const fieldMap = new Map(fields.map((f) => [f.name, f]));
  const writable = fields.filter((f) => !f.readOnly);
  const sortable = new Set([defaultSort, 'created_at', 'updated_at', ...fields.map((f) => f.name), ...filterFields]);

  function serialise(row, user) {
    if (!row) return null;
    const base = { ...row };
    return transformRow ? transformRow(base, user) : base;
  }

  async function buildWhere(req, alias = '') {
    const clauses = [];
    const params = [];
    const scope = scopeFor(req.user, alias);
    if (scope.clause) {
      clauses.push(scope.clause);
      params.push(...scope.params);
    }
    const prefix = alias ? `${alias}.` : '';
    const q = cleanText(req.query.q, 120).trim();
    if (q && searchFields.length) {
      const pattern = likePattern(q);
      clauses.push(`(${searchFields.map((f) => `${prefix}${f} LIKE ?`).join(' OR ')})`);
      searchFields.forEach(() => params.push(pattern));
    }
    for (const filter of filterFields) {
      const value = req.query[filter];
      if (value !== undefined && value !== '' && value !== 'all') {
        clauses.push(`${prefix}${filter} = ?`);
        params.push(String(value));
      }
    }
    const from = isoDate(req.query.from);
    const to = isoDate(req.query.to);
    if (from) {
      clauses.push(`${prefix}${dateField} >= ?`);
      params.push(fromFieldValue(dateField, from));
    }
    if (to) {
      clauses.push(`${prefix}${dateField} <= ?`);
      params.push(toFieldValue(dateField, to));
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return { where, params };
  }

  function fromFieldValue(field, date) {
    return field.includes('_at') && !field.endsWith('_date') ? `${date}T00:00:00.000Z` : date;
  }
  function toFieldValue(field, date) {
    return field.includes('_at') && !field.endsWith('_date') ? `${date}T23:59:59.999Z` : date;
  }

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      if (!req.user) throw unauthorized();
      const page = clampInt(req.query.page, 1, 100000, 1);
      const pageSize = clampInt(req.query.pageSize, 1, 200, 20);
      const sortField = sortable.has(String(req.query.sort)) ? String(req.query.sort) : defaultSort;
      const dir = String(req.query.dir).toLowerCase() === 'asc' ? 'ASC' : defaultDir.toUpperCase();
      const { where, params } = await buildWhere(req);

      const totalRow = await get(`SELECT COUNT(*) AS total FROM ${table} ${where}`, params);
      const total = Number(totalRow?.total || 0);
      const order = orderBy || `${sortField} ${dir}`;
      const rows = await query(
        `SELECT * FROM ${table} ${where} ORDER BY ${order} LIMIT ? OFFSET ?`,
        [...params, pageSize, (page - 1) * pageSize],
      );
      res.json({
        items: rows.map((row) => serialise(row, req.user)),
        total,
        page,
        pageSize,
        pages: Math.max(1, Math.ceil(total / pageSize)),
      });
    }),
  );

  router.get(
    '/stats',
    asyncHandler(async (req, res) => {
      if (!req.user) throw unauthorized();
      const { where, params } = await buildWhere(req);
      const rows = await query(
        `SELECT COUNT(*) AS total, MAX(created_at) AS last_created FROM ${table} ${where}`,
        params,
      );
      res.json({ total: Number(rows[0]?.total || 0), lastCreated: rows[0]?.last_created || null });
    }),
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      if (!req.user) throw unauthorized();
      const row = await get(`SELECT * FROM ${table} WHERE id = ?`, [req.params.id]);
      if (!row) throw notFound();
      const scope = scopeFor(req.user);
      if (scope.clause) {
        const allowed = await get(`SELECT id FROM ${table} WHERE id = ? AND ${scope.clause}`, [
          req.params.id,
          ...scope.params,
        ]);
        if (!allowed) throw forbidden('This record belongs to another user or department.');
      }
      res.json({ item: serialise(row, req.user) });
    }),
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      if (!req.user) throw unauthorized();
      if (isReadOnly(req.user.role)) throw forbidden('Your role has read-only access.');
      const body = req.body || {};
      const values = {};
      const errors = {};
      for (const field of writable) {
        if (field.serverOnly) continue;
        const provided = Object.prototype.hasOwnProperty.call(body, field.name)
          ? body[field.name]
          : Object.prototype.hasOwnProperty.call(body, field.camel || '')
            ? body[field.camel]
            : undefined;
        try {
          const coerced = coerce(field, provided);
          values[field.name] = coerced;
        } catch (error) {
          errors[field.name] = error.message;
        }
      }
      for (const field of writable) {
        const value = values[field.name];
        if (field.required && (value === null || value === undefined || value === '')) {
          errors[field.name] = `${field.label} is required.`;
        }
      }
      if (Object.keys(errors).length) throw badRequest('Please correct the highlighted fields.', { fields: errors });

      const id = newId();
      const now = nowIso();
      const record = { ...values };
      for (const field of writable) {
        if (field.default !== undefined && (record[field.name] === undefined || record[field.name] === null)) {
          record[field.name] = field.default;
        }
      }
      if (numberField && numberPrefix) {
        record[numberField] = await nextNumber(table, numberField, numberPrefix);
      }
      if (fields.some((f) => f.name === 'created_by')) record.created_by = req.user.id;
      if (beforeWrite) await beforeWrite({ record, req, mode: 'create' });

      const columns = Object.keys(record).filter((key) => fieldMap.has(key) || key === numberField);
      const sql = `INSERT INTO ${table} (id, ${columns.join(', ')}, created_at, updated_at)
        VALUES (?, ${columns.map(() => '?').join(', ')}, ?, ?)`;
      await run(sql, [id, ...columns.map((c) => record[c]), now, now]);

      const saved = await get(`SELECT * FROM ${table} WHERE id = ?`, [id]);
      await audit(req, 'create', name, id, { summary: describe(record) });
      if (afterWrite) await afterWrite({ record: saved, req, mode: 'create' });
      res.status(201).json({ item: serialise(saved, req.user), message: `${def.singular || 'Record'} created successfully.` });
    }),
  );

  router.put(
    '/:id',
    asyncHandler(async (req, res) => {
      if (!req.user) throw unauthorized();
      const existing = await get(`SELECT * FROM ${table} WHERE id = ?`, [req.params.id]);
      if (!existing) throw notFound();
      if (!canWriteRow(req.user, existing)) throw forbidden('You cannot edit this record.');
      const body = req.body || {};
      const values = {};
      const errors = {};
      for (const field of writable) {
        if (field.serverOnly) continue;
        const provided = Object.prototype.hasOwnProperty.call(body, field.name)
          ? body[field.name]
          : Object.prototype.hasOwnProperty.call(body, field.camel || '')
            ? body[field.camel]
            : undefined;
        if (provided === undefined) continue;
        try {
          values[field.name] = coerce(field, provided);
        } catch (error) {
          errors[field.name] = error.message;
        }
      }
      for (const field of writable) {
        if (field.required && Object.prototype.hasOwnProperty.call(values, field.name)) {
          const value = values[field.name];
          if (value === null || value === undefined || value === '') {
            errors[field.name] = `${field.label} is required.`;
          }
        }
      }
      if (Object.keys(errors).length) throw badRequest('Please correct the highlighted fields.', { fields: errors });
      if (!Object.keys(values).length) throw badRequest('No changes were submitted.');

      const record = { ...existing, ...values };
      if (beforeWrite) await beforeWrite({ record, previous: existing, req, mode: 'update' });
      const columns = Object.keys(values).filter((key) => fieldMap.has(key));
      await run(
        `UPDATE ${table} SET ${columns.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
        [...columns.map((c) => record[c]), nowIso(), req.params.id],
      );
      const saved = await get(`SELECT * FROM ${table} WHERE id = ?`, [req.params.id]);
      await audit(req, 'update', name, req.params.id, { changed: columns });
      if (afterWrite) await afterWrite({ record: saved, previous: existing, req, mode: 'update' });
      res.json({ item: serialise(saved, req.user), message: `${def.singular || 'Record'} updated successfully.` });
    }),
  );

  if (allowDelete) {
    router.delete(
      '/:id',
      asyncHandler(async (req, res) => {
        if (!req.user) throw unauthorized();
        const existing = await get(`SELECT * FROM ${table} WHERE id = ?`, [req.params.id]);
        if (!existing) throw notFound();
        if (!canDeleteRow(req.user, existing)) throw forbidden('You cannot delete this record.');
        await run(`DELETE FROM ${table} WHERE id = ?`, [req.params.id]);
        await audit(req, 'delete', name, req.params.id, { summary: describe(existing) });
        res.json({ message: `${def.singular || 'Record'} deleted.` });
      }),
    );
  }

  return router;
}

function describe(record) {
  const entries = Object.entries(record).filter(
    ([key, value]) => !['created_at', 'updated_at'].includes(key) && value !== null && value !== '' && typeof value !== 'object',
  );
  return entries.slice(0, 6).map(([k, v]) => `${k}=${String(v).slice(0, 60)}`).join('; ');
}

export async function nextNumber(table, column, prefix) {
  const year = new Date().getUTCFullYear();
  const row = await get(
    `SELECT ${column} AS value FROM ${table} WHERE ${column} LIKE ? ORDER BY created_at DESC LIMIT 1`,
    [`${prefix}-${year}-%`],
  );
  let sequence = 1;
  if (row?.value) {
    const parts = String(row.value).split('-');
    const last = Number.parseInt(parts[parts.length - 1], 10);
    if (!Number.isNaN(last)) sequence = last + 1;
  }
  return `${prefix}-${year}-${String(sequence).padStart(4, '0')}`;
}
