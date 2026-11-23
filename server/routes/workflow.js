import { Router } from 'express';
import { get, query, run } from '../db.js';
import { audit, isReadOnly, requireAuth, requirePermission } from '../auth.js';
import { asyncHandler, badRequest, cleanText, forbidden, newId, notFound, nowIso } from '../util.js';

export const workflowRouter = Router();

function requireWriter(req) {
  if (isReadOnly(req.user.role)) throw forbidden('Your role has read-only access.');
}

/* ------------------------------------------------------------ permits */

workflowRouter.post(
  '/permits/:id/approve',
  requireAuth,
  requirePermission('approve'),
  asyncHandler(async (req, res) => {
    const permit = await get('SELECT * FROM permits WHERE id = ?', [req.params.id]);
    if (!permit) throw notFound('Permit not found.');
    if (permit.status !== 'pending') throw badRequest(`This permit is already ${permit.status}.`);
    await run('UPDATE permits SET status = ?, approved_by = ?, approved_at = ?, approval_note = ?, updated_at = ? WHERE id = ?', [
      'approved',
      req.user.full_name || req.user.username,
      nowIso(),
      cleanText((req.body || {}).note, 1000) || null,
      nowIso(),
      permit.id,
    ]);
    await audit(req, 'approve', 'permit', permit.id, { permit_no: permit.permit_no });
    res.json({ message: `Permit ${permit.permit_no || ''} approved.`.trim() });
  }),
);

workflowRouter.post(
  '/permits/:id/reject',
  requireAuth,
  requirePermission('approve'),
  asyncHandler(async (req, res) => {
    const permit = await get('SELECT * FROM permits WHERE id = ?', [req.params.id]);
    if (!permit) throw notFound('Permit not found.');
    if (permit.status !== 'pending') throw badRequest(`This permit is already ${permit.status}.`);
    const note = cleanText((req.body || {}).note, 1000).trim();
    if (note.length < 5) throw badRequest('Give a reason for rejecting the permit.');
    await run('UPDATE permits SET status = ?, approved_by = ?, approved_at = ?, approval_note = ?, updated_at = ? WHERE id = ?', [
      'rejected',
      req.user.full_name || req.user.username,
      nowIso(),
      note,
      nowIso(),
      permit.id,
    ]);
    await audit(req, 'reject', 'permit', permit.id, { permit_no: permit.permit_no, note });
    res.json({ message: 'Permit rejected.' });
  }),
);

workflowRouter.post(
  '/permits/:id/activate',
  requireAuth,
  asyncHandler(async (req, res) => {
    requireWriter(req);
    const permit = await get('SELECT * FROM permits WHERE id = ?', [req.params.id]);
    if (!permit) throw notFound('Permit not found.');
    if (permit.status !== 'approved') throw badRequest('Only an approved permit can be activated.');
    if (permit.end_at && permit.end_at < nowIso()) throw badRequest('This permit has already expired.');
    await run('UPDATE permits SET status = ?, updated_at = ? WHERE id = ?', ['active', nowIso(), permit.id]);
    await audit(req, 'activate', 'permit', permit.id, { permit_no: permit.permit_no });
    res.json({ message: 'Permit is now active.' });
  }),
);

workflowRouter.post(
  '/permits/:id/close',
  requireAuth,
  asyncHandler(async (req, res) => {
    requireWriter(req);
    const permit = await get('SELECT * FROM permits WHERE id = ?', [req.params.id]);
    if (!permit) throw notFound('Permit not found.');
    if (['closed', 'rejected'].includes(permit.status)) throw badRequest(`This permit is already ${permit.status}.`);
    await run('UPDATE permits SET status = ?, closed_at = ?, updated_at = ? WHERE id = ?', ['closed', nowIso(), nowIso(), permit.id]);
    await audit(req, 'close', 'permit', permit.id, { permit_no: permit.permit_no });
    res.json({ message: 'Permit closed.' });
  }),
);

/* ------------------------------------------------------------ hazards */

workflowRouter.post(
  '/hazards/:id/verify',
  requireAuth,
  requirePermission('verify'),
  asyncHandler(async (req, res) => {
    const hazard = await get('SELECT * FROM hazards WHERE id = ?', [req.params.id]);
    if (!hazard) throw notFound('Hazard not found.');
    const note = cleanText((req.body || {}).verification, 2000).trim();
    if (note.length < 5) throw badRequest('Record what was verified before closing the hazard.');
    await run('UPDATE hazards SET status = ?, verification = ?, verified_by = ?, verified_at = ?, updated_at = ? WHERE id = ?', [
      'verified',
      note,
      req.user.full_name || req.user.username,
      nowIso(),
      nowIso(),
      hazard.id,
    ]);
    await audit(req, 'verify', 'hazard', hazard.id, { hazard_no: hazard.hazard_no, note });
    res.json({ message: 'Hazard verified and closed.' });
  }),
);

workflowRouter.post(
  '/hazards/:id/status',
  requireAuth,
  asyncHandler(async (req, res) => {
    requireWriter(req);
    const hazard = await get('SELECT * FROM hazards WHERE id = ?', [req.params.id]);
    if (!hazard) throw notFound('Hazard not found.');
    const status = String((req.body || {}).status || '');
    if (!['open', 'in_progress', 'controlled'].includes(status)) throw badRequest('Invalid hazard status.');
    await run('UPDATE hazards SET status = ?, updated_at = ? WHERE id = ?', [status, nowIso(), hazard.id]);
    await audit(req, 'status', 'hazard', hazard.id, { status });
    res.json({ message: 'Hazard status updated.' });
  }),
);

/* ------------------------------------------------------------ actions */

workflowRouter.post(
  '/actions/:id/verify',
  requireAuth,
  requirePermission('verify'),
  asyncHandler(async (req, res) => {
    const action = await get('SELECT * FROM actions WHERE id = ?', [req.params.id]);
    if (!action) throw notFound('Corrective action not found.');
    const body = req.body || {};
    const note = cleanText(body.verification_note, 2000).trim();
    if (note.length < 5) throw badRequest('Record the verification evidence before closing.');
    const decision = body.decision === 'reject' ? 'in_progress' : 'verified';
    await run(
      'UPDATE actions SET status = ?, verification_note = ?, verified_by = ?, verified_at = ?, closed_at = ?, updated_at = ? WHERE id = ?',
      [
        decision,
        note,
        req.user.full_name || req.user.username,
        nowIso(),
        decision === 'verified' ? nowIso() : null,
        nowIso(),
        action.id,
      ],
    );
    await audit(req, decision === 'verified' ? 'verify' : 'reject', 'action', action.id, { action_no: action.action_no, note });
    res.json({ message: decision === 'verified' ? 'Corrective action verified and closed.' : 'Action returned for rework.' });
  }),
);

/* --------------------------------------------------------- incidents */

workflowRouter.post(
  '/incidents/:id/investigation',
  requireAuth,
  asyncHandler(async (req, res) => {
    requireWriter(req);
    const incident = await get('SELECT * FROM incidents WHERE id = ?', [req.params.id]);
    if (!incident) throw notFound('Incident not found.');
    const body = req.body || {};
    const rootCause = cleanText(body.root_cause, 4000).trim();
    const investigation = cleanText(body.investigation, 8000).trim();
    if (rootCause.length < 5) throw badRequest('Root cause analysis is required to complete the investigation.');
    if (investigation.length < 10) throw badRequest('Describe the investigation findings.');
    const status = ['investigation', 'closed', 'open'].includes(body.status) ? body.status : 'investigation';
    await run(
      'UPDATE incidents SET root_cause = ?, investigation = ?, status = ?, lost_days = ?, updated_at = ? WHERE id = ?',
      [
        rootCause,
        investigation,
        status,
        Number.isFinite(Number(body.lost_days)) ? Math.max(0, Math.trunc(Number(body.lost_days))) : incident.lost_days || 0,
        nowIso(),
        incident.id,
      ],
    );
    await audit(req, 'investigation', 'incident', incident.id, { incident_no: incident.incident_no, status });
    res.json({ message: status === 'closed' ? 'Investigation saved and incident closed.' : 'Investigation saved.' });
  }),
);

/* ------------------------------------------------- training attendance */

workflowRouter.get(
  '/training/:id/attendance',
  requireAuth,
  asyncHandler(async (req, res) => {
    const training = await get('SELECT * FROM trainings WHERE id = ?', [req.params.id]);
    if (!training) throw notFound('Training session not found.');
    const rows = await query(
      `SELECT * FROM training_attendance WHERE training_id = ? ORDER BY employee_name`,
      [training.id],
    );
    res.json({
      training,
      items: rows,
      summary: {
        total: rows.length,
        attended: rows.filter((r) => Number(r.attended) === 1).length,
        competent: rows.filter((r) => r.competency === 'competent').length,
      },
    });
  }),
);

workflowRouter.post(
  '/training/:id/attendance',
  requireAuth,
  asyncHandler(async (req, res) => {
    requireWriter(req);
    const training = await get('SELECT * FROM trainings WHERE id = ?', [req.params.id]);
    if (!training) throw notFound('Training session not found.');
    const body = req.body || {};
    let employeeName = cleanText(body.employee_name, 160).trim();
    let employeeId = cleanText(body.employee_id, 60).trim() || null;
    if (employeeId) {
      const employee = await get('SELECT id, full_name FROM employees WHERE id = ?', [employeeId]);
      if (employee) {
        employeeName = employee.full_name;
        employeeId = employee.id;
      }
    }
    if (!employeeName) throw badRequest('Select an employee or enter a name.');
    const existing = await get(
      'SELECT id FROM training_attendance WHERE training_id = ? AND employee_name = ?',
      [training.id, employeeName],
    );
    if (existing) throw badRequest(`${employeeName} is already on this attendance register.`);
    const id = newId();
    await run(
      `INSERT INTO training_attendance (id, training_id, employee_id, employee_name, attended, score, competency, notes, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        id,
        training.id,
        employeeId,
        employeeName,
        body.attended === false || body.attended === 0 ? 0 : 1,
        Number.isFinite(Number(body.score)) ? Number(body.score) : null,
        ['competent', 'not_competent', 'pending'].includes(body.competency) ? body.competency : 'pending',
        cleanText(body.notes, 500) || null,
        nowIso(),
      ],
    );
    await audit(req, 'attendance', 'training', training.id, { employee: employeeName });
    res.status(201).json({ id, message: 'Attendance recorded.' });
  }),
);

workflowRouter.delete(
  '/training/:id/attendance/:rowId',
  requireAuth,
  asyncHandler(async (req, res) => {
    requireWriter(req);
    await run('DELETE FROM training_attendance WHERE id = ? AND training_id = ?', [req.params.rowId, req.params.id]);
    res.json({ message: 'Attendance entry removed.' });
  }),
);

/* ----------------------------------------------------------- summary */

workflowRouter.get(
  '/summary',
  requireAuth,
  asyncHandler(async (req, res) => {
    const [permits, hazards, actions] = await Promise.all([
      get("SELECT COUNT(*) AS total FROM permits WHERE status = 'pending'"),
      get("SELECT COUNT(*) AS total FROM hazards WHERE status IN ('open','in_progress')"),
      get("SELECT COUNT(*) AS total FROM actions WHERE status NOT IN ('verified','closed')"),
    ]);
    res.json({
      pendingPermits: Number(permits?.total || 0),
      openHazards: Number(hazards?.total || 0),
      openActions: Number(actions?.total || 0),
    });
  }),
);
