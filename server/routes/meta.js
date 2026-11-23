import { Router } from 'express';
import { query } from '../db.js';
import { ENUMS, MODULES, moduleConfigForClient, riskLevelFor } from '../modules.js';
import { ROLE_DEFS, ROLES, requireAuth } from '../auth.js';
import { asyncHandler } from '../util.js';
import { DOC_CATEGORIES, DOC_TYPES } from './documents.js';

export const metaRouter = Router();

/** Module metadata used by the generic table/form UI. Requires a session. */
metaRouter.get(
  '/modules',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({
      modules: moduleConfigForClient(),
      enums: ENUMS,
      roles: ROLES.map((value) => ({ value, label: ROLE_DEFS[value].label })),
      docCategories: DOC_CATEGORIES.map(([value, label]) => ({ value, label })),
      docTypes: DOC_TYPES.map(([value, label]) => ({ value, label })),
    });
  }),
);

/** Reference data for selects (departments, locations, people, company profile). */
metaRouter.get(
  '/options',
  requireAuth,
  asyncHandler(async (req, res) => {
    const [departments, locations, people, settings] = await Promise.all([
      query('SELECT id, name, code, head, location FROM departments ORDER BY name'),
      query('SELECT id, name, type, address FROM locations ORDER BY name'),
      query('SELECT id, full_name, username, department, designation, role FROM users WHERE status = ? ORDER BY full_name', [
        'active',
      ]),
      query("SELECT key, value FROM settings WHERE key IN ('company_name','company_logo','site_name','prepared_by','reviewed_by','hse_manager_name','registration_approval')"),
    ]);
    res.json({
      departments,
      locations,
      people,
      settings: Object.fromEntries(settings.map((s) => [s.key, s.value])),
    });
  }),
);

/** Risk matrix helper so the UI and server agree on scoring bands. */
metaRouter.get(
  '/risk-matrix',
  requireAuth,
  asyncHandler(async (req, res) => {
    const matrix = [];
    for (let likelihood = 5; likelihood >= 1; likelihood -= 1) {
      const row = [];
      for (let severity = 1; severity <= 5; severity += 1) {
        const score = likelihood * severity;
        row.push({ likelihood, severity, score, level: riskLevelFor(score) });
      }
      matrix.push(row);
    }
    res.json({ matrix, modules: MODULES.map((m) => ({ name: m.name, label: m.label })) });
  }),
);
