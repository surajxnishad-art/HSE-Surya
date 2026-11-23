/**
 * Lightweight, idempotent schema reconciliation.
 *
 * `CREATE TABLE IF NOT EXISTS` never alters an existing table, so a column that
 * is added to a module definition would otherwise break inserts on databases
 * created by an earlier release (e.g. a hosted Postgres instance). This routine
 * compares every module definition with the live table and adds any missing
 * column, keeping both SQLite and PostgreSQL deployments in sync.
 */
import { exec, query, isPostgres } from './db.js';

const SAFE_IDENT = /^[a-z_][a-z0-9_]*$/i;

function columnType(field) {
  if (field.type === 'integer' || field.type === 'bool') return 'INTEGER';
  if (field.type === 'number') return 'REAL';
  return 'TEXT';
}

export async function ensureSchemaColumns(modules) {
  const added = [];

  for (const mod of modules) {
    const table = mod.table;
    if (!SAFE_IDENT.test(table)) continue;

    const existing = isPostgres
      ? (
          await query(
            'SELECT column_name AS name FROM information_schema.columns WHERE table_name = ?',
            [table],
          )
        ).map((row) => row.name)
      : (await query(`PRAGMA table_info(${table})`)).map((row) => row.name);

    if (!existing.length) continue;

    for (const field of mod.fields) {
      if (!SAFE_IDENT.test(field.name) || existing.includes(field.name)) continue;
      await exec(`ALTER TABLE ${table} ADD COLUMN ${field.name} ${columnType(field)}`);
      added.push(`${table}.${field.name}`);
    }
  }

  if (added.length) console.log(`[db] reconciled columns: ${added.join(', ')}`);
  return added;
}
