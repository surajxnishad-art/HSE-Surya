import { Router } from 'express';
import { get, query, run } from '../db.js';
import { canViewAll, permissionsFor, requireAuth } from '../auth.js';
import { asyncHandler, newId, nowIso } from '../util.js';

export const notificationsRouter = Router();

const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

/**
 * Alerts are derived live from the database, so they always reflect the current
 * state of the HSE records rather than a stale queue.
 */
async function derivedAlerts(user) {
  const scoped = !canViewAll(user.role);
  const clause = scoped ? ' AND department = ?' : '';
  const params = scoped ? [user.department || '__unassigned__'] : [];
  const alerts = [];

  const overdue = await get(
    `SELECT COUNT(*) AS total FROM actions
     WHERE status NOT IN ('verified','closed') AND target_date IS NOT NULL AND target_date < ?${clause}`,
    [today(), ...params],
  );
  if (Number(overdue?.total || 0) > 0) {
    alerts.push({
      id: 'overdue-actions',
      type: 'overdue_action',
      severity: 'critical',
      title: 'Overdue corrective actions',
      message: `${overdue.total} corrective action(s) are past their target date.`,
      link: '/corrective-actions?status=open',
      count: Number(overdue.total),
      created_at: nowIso(),
    });
  }

  const permits = await get(
    `SELECT COUNT(*) AS total FROM permits
     WHERE status IN ('approved','active') AND substr(end_at,1,10) <= ?${clause}`,
    [plusDays(3), ...params],
  );
  if (Number(permits?.total || 0) > 0) {
    alerts.push({
      id: 'expiring-permits',
      type: 'permit_expiry',
      severity: 'warning',
      title: 'Permits expiring soon',
      message: `${permits.total} permit(s) expire within 3 days or have already expired.`,
      link: '/permits',
      count: Number(permits.total),
      created_at: nowIso(),
    });
  }

  const trainings = await get(
    `SELECT COUNT(*) AS total FROM trainings WHERE expiry_date IS NOT NULL AND expiry_date <= ?${clause}`,
    [plusDays(30), ...params],
  );
  if (Number(trainings?.total || 0) > 0) {
    alerts.push({
      id: 'training-expiry',
      type: 'training_expiry',
      severity: 'warning',
      title: 'Training expiry reminders',
      message: `${trainings.total} training record(s) expire within 30 days.`,
      link: '/training',
      count: Number(trainings.total),
      created_at: nowIso(),
    });
  }

  const fire = await get(
    `SELECT COUNT(*) AS total FROM fire_equipment WHERE next_due IS NOT NULL AND next_due <= ?${clause}`,
    [plusDays(30), ...params],
  );
  if (Number(fire?.total || 0) > 0) {
    alerts.push({
      id: 'fire-inspection-due',
      type: 'inspection_due',
      severity: 'info',
      title: 'Fire equipment inspection due',
      message: `${fire.total} item(s) require inspection within 30 days.`,
      link: '/fire-emergency',
      count: Number(fire.total),
      created_at: nowIso(),
    });
  }

  const hazards = await get(
    `SELECT COUNT(*) AS total FROM hazards
     WHERE status IN ('open','in_progress') AND target_date IS NOT NULL AND target_date < ?${clause}`,
    [today(), ...params],
  );
  if (Number(hazards?.total || 0) > 0) {
    alerts.push({
      id: 'hazard-overdue',
      type: 'hazard_overdue',
      severity: 'critical',
      title: 'Hazards past target date',
      message: `${hazards.total} open hazard(s) are overdue for closure.`,
      link: '/hazards',
      count: Number(hazards.total),
      created_at: nowIso(),
    });
  }

  if (permissionsFor(user.role).manageUsers) {
    const pending = await get("SELECT COUNT(*) AS total FROM users WHERE status = 'pending'");
    if (Number(pending?.total || 0) > 0) {
      alerts.push({
        id: 'pending-approvals',
        type: 'pending_approval',
        severity: 'info',
        title: 'Registrations awaiting approval',
        message: `${pending.total} account(s) need approval.`,
        link: '/admin/users',
        count: Number(pending.total),
        created_at: nowIso(),
      });
    }
  }

  return alerts;
}

notificationsRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const stored = await query(
      `SELECT id, title, message, type, link, read_at, created_at FROM notifications
       WHERE user_id = ? OR (user_id IS NULL AND role = ?)
       ORDER BY created_at DESC LIMIT 30`,
      [req.user.id, req.user.role],
    );
    const alerts = await derivedAlerts(req.user);
    const unreadStored = stored.filter((n) => !n.read_at).length;
    res.json({
      alerts,
      stored,
      unread: unreadStored + alerts.length,
      generatedAt: nowIso(),
    });
  }),
);

notificationsRouter.post(
  '/read-all',
  requireAuth,
  asyncHandler(async (req, res) => {
    await run(
      'UPDATE notifications SET read_at = ? WHERE read_at IS NULL AND (user_id = ? OR (user_id IS NULL AND role = ?))',
      [nowIso(), req.user.id, req.user.role],
    );
    res.json({ message: 'All notifications marked as read.' });
  }),
);

notificationsRouter.post(
  '/:id/read',
  requireAuth,
  asyncHandler(async (req, res) => {
    await run('UPDATE notifications SET read_at = ? WHERE id = ? AND (user_id = ? OR (user_id IS NULL AND role = ?))', [
      nowIso(),
      req.params.id,
      req.user.id,
      req.user.role,
    ]);
    res.json({ message: 'Notification marked as read.' });
  }),
);

export { derivedAlerts, newId };
