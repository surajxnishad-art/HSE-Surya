/**
 * Database adapter.
 *
 * - If DATABASE_URL is set (e.g. a Supabase Postgres connection string) the app
 *   uses PostgreSQL.
 * - Otherwise it falls back to a local SQLite file so the whole system is fully
 *   usable out of the box for development / evaluation.
 *
 * All application SQL is written in a portable subset (TEXT ids, TEXT ISO
 * timestamps, INTEGER 0/1 booleans, `?` placeholders, no dialect specific
 * functions) so both drivers behave identically.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

const connectionString = process.env.DATABASE_URL || '';
export const isPostgres = /^postgres(ql)?:\/\//i.test(connectionString);
export const dialect = isPostgres ? 'postgres' : 'sqlite';
export const dbLabel = isPostgres ? 'PostgreSQL' : 'SQLite (local file)';

let pool = null;
let sqlite = null;

function toPgPlaceholders(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

function normaliseParams(params) {
  return (params || []).map((value) => {
    if (value === undefined) return null;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (value instanceof Date) return value.toISOString();
    if (value !== null && typeof value === 'object') return JSON.stringify(value);
    return value;
  });
}

export async function initDb() {
  if (isPostgres) {
    const pg = await import('pg');
    pool = new pg.default.Pool({
      connectionString,
      max: Number(process.env.PG_POOL_MAX || 5),
      ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false },
      connectionTimeoutMillis: 15000,
    });
    await pool.query('SELECT 1');
    return { dialect, dbLabel };
  }
  const { default: Database } = await import('better-sqlite3');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  sqlite = new Database(path.join(DATA_DIR, 'hse.db'));
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  return { dialect, dbLabel };
}

export async function query(sql, params = []) {
  const values = normaliseParams(params);
  if (isPostgres) {
    const result = await pool.query(toPgPlaceholders(sql), values);
    return result.rows;
  }
  return sqlite.prepare(sql).all(...values);
}

export async function get(sql, params = []) {
  const rows = await query(sql, params);
  return rows.length ? rows[0] : null;
}

export async function run(sql, params = []) {
  const values = normaliseParams(params);
  if (isPostgres) {
    const result = await pool.query(toPgPlaceholders(sql), values);
    return { changes: result.rowCount || 0 };
  }
  const info = sqlite.prepare(sql).run(...values);
  return { changes: info.changes };
}

/** Execute a multi-statement DDL script. */
export async function exec(sql) {
  if (isPostgres) {
    await pool.query(sql);
    return;
  }
  sqlite.exec(sql);
}

export async function count(table, where = '', params = []) {
  const row = await get(`SELECT COUNT(*) AS total FROM ${table} ${where}`, params);
  return Number(row?.total || 0);
}
