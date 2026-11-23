import crypto from 'node:crypto';

export function newId() {
  return crypto.randomUUID();
}

export function nowIso() {
  return new Date().toISOString();
}

export class HttpError extends Error {
  constructor(status, message, code, extra = {}) {
    super(message);
    this.status = status;
    this.code = code || 'error';
    this.extra = extra;
  }
}

export const badRequest = (message, extra) => new HttpError(400, message, 'validation_error', extra);
export const unauthorized = (message = 'Authentication required') => new HttpError(401, message, 'unauthorized');
export const forbidden = (message = 'You do not have permission to perform this action') =>
  new HttpError(403, message, 'forbidden');
export const notFound = (message = 'Record not found') => new HttpError(404, message, 'not_found');

export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

export function jsonParse(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function isoDate(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

export function isoDateTime(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysIso(days, from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from, to) {
  if (!from || !to) return null;
  const a = new Date(`${String(from).slice(0, 10)}T00:00:00Z`).getTime();
  const b = new Date(`${String(to).slice(0, 10)}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

export function monthKey(value) {
  return String(value || '').slice(0, 7);
}

/** Last `count` month keys, oldest first, ending with the current month. */
export function recentMonths(count = 12, from = new Date()) {
  const out = [];
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  for (let i = count - 1; i >= 0; i -= 1) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    out.push(m.toISOString().slice(0, 7));
  }
  return out;
}

export function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function round(value, decimals = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 0;
  const factor = 10 ** decimals;
  return Math.round(Number(value) * factor) / factor;
}

/** Safe LIKE pattern for user supplied search text. */
export function likePattern(term) {
  return `%${String(term).replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

export function slug(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Strip characters that could break a PDF/Excel cell or HTML context. */
export function cleanText(value, maxLength = 5000) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .slice(0, maxLength);
}
