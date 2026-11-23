import { Router } from 'express';
import { get, query } from '../db.js';
import { requireAuth } from '../auth.js';
import { asyncHandler, recentMonths, round } from '../util.js';

export const dashboardRouter = Router();

const RECORDABLE_TYPES = ['medical_treatment', 'lti'];

function scope(user) {
  if (user.permissions?.viewAll) return { clause: '', params: [] };
  return { clause: ' AND department = ?', params: [user.department || '__unassigned__'] };
}

async function scalar(sql, params = []) {
  const row = await get(sql, params);
  const value = row ? Object.values(row)[0] : 0;
  return Number(value || 0);
}

dashboardRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const s = scope(req.user);
    const months = recentMonths(12);

    const [
      employees,
      incidentTotal,
      byTypeRows,
      manHours,
      inspectionTotal,
      openHazards,
      closedActions,
      openActions,
      actionStatusRows,
      trainingRows,
      permitRows,
      ppeCovered,
      lastLti,
      overdueActions,
      expiringPermits,
      expiringTrainings,
      pendingUsers,
      overdueHazards,
      dueFireEquipment,
    ] = await Promise.all([
      scalar(`SELECT COUNT(*) AS total FROM employees WHERE status = 'active'${s.clause}`, s.params),
      scalar(`SELECT COUNT(*) AS total FROM incidents WHERE 1=1${s.clause}`, s.params),
      query(`SELECT type, COUNT(*) AS total FROM incidents WHERE 1=1${s.clause} GROUP BY type`, s.params),
      scalar(`SELECT COALESCE(SUM(hours), 0) AS total FROM man_hours WHERE 1=1${s.clause}`, s.params),
      scalar(`SELECT COUNT(*) AS total FROM inspections WHERE 1=1${s.clause}`, s.params),
      scalar(
        `SELECT COUNT(*) AS total FROM hazards WHERE status IN ('open','in_progress')${s.clause}`,
        s.params,
      ),
      scalar(
        `SELECT COUNT(*) AS total FROM actions WHERE status IN ('verified','closed')${s.clause}`,
        s.params,
      ),
      scalar(
        `SELECT COUNT(*) AS total FROM actions WHERE status NOT IN ('verified','closed')${s.clause}`,
        s.params,
      ),
      query(`SELECT status, COUNT(*) AS total FROM actions WHERE 1=1${s.clause} GROUP BY status`, s.params),
      query(`SELECT status, COUNT(*) AS total FROM trainings WHERE 1=1${s.clause} GROUP BY status`, s.params),
      query(`SELECT status, COUNT(*) AS total FROM permits WHERE 1=1${s.clause} GROUP BY status`, s.params),
      scalar(
        `SELECT COUNT(DISTINCT employee_id) AS total FROM ppe_issues WHERE status = 'issued' AND employee_id IS NOT NULL${s.clause}`,
        s.params,
      ),
      get(
        `SELECT MAX(occurred_at) AS last FROM incidents WHERE type = 'lti'${s.clause}`,
        s.params,
      ),
      scalar(
        `SELECT COUNT(*) AS total FROM actions WHERE status NOT IN ('verified','closed') AND target_date IS NOT NULL AND target_date < ?${s.clause}`,
        [new Date().toISOString().slice(0, 10), ...s.params],
      ),
      scalar(
        `SELECT COUNT(*) AS total FROM permits WHERE status IN ('approved','active') AND end_at IS NOT NULL AND substr(end_at,1,10) <= ?${s.clause}`,
        [new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10), ...s.params],
      ),
      scalar(
        `SELECT COUNT(*) AS total FROM trainings WHERE expiry_date IS NOT NULL AND expiry_date <= ?${s.clause}`,
        [new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), ...s.params],
      ),
      scalar(`SELECT COUNT(*) AS total FROM users WHERE status = 'pending'`),
      scalar(
        `SELECT COUNT(*) AS total FROM hazards WHERE status IN ('open','in_progress') AND target_date IS NOT NULL AND target_date < ?${s.clause}`,
        [new Date().toISOString().slice(0, 10), ...s.params],
      ),
      scalar(
        `SELECT COUNT(*) AS total FROM fire_equipment WHERE next_due IS NOT NULL AND next_due <= ?${s.clause}`,
        [new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), ...s.params],
      ),
    ]);

    const byType = Object.fromEntries(byTypeRows.map((r) => [r.type, Number(r.total)]));
    const recordable = RECORDABLE_TYPES.reduce((sum, t) => sum + (byType[t] || 0), 0);
    const lti = byType.lti || 0;
    const firstAid = byType.first_aid || 0;
    const nearMiss = byType.near_miss || 0;

    const trir = manHours > 0 ? round((recordable * 200000) / manHours, 2) : 0;
    const ltifr = manHours > 0 ? round((lti * 1000000) / manHours, 2) : 0;

    const trainingByStatus = Object.fromEntries(trainingRows.map((r) => [r.status, Number(r.total)]));
    const trainingTotal = Object.values(trainingByStatus).reduce((a, b) => a + b, 0);
    const trainingCompleted = trainingByStatus.completed || 0;
    const trainingCompliance = trainingTotal ? round((trainingCompleted / trainingTotal) * 100, 1) : 0;

    const permitByStatus = Object.fromEntries(permitRows.map((r) => [r.status, Number(r.total)]));
    const activePermits = (permitByStatus.approved || 0) + (permitByStatus.active || 0);

    const actionByStatus = Object.fromEntries(actionStatusRows.map((r) => [r.status, Number(r.total)]));
    const actionTotal = Object.values(actionByStatus).reduce((a, b) => a + b, 0);
    const closureRate = actionTotal ? round(((actionByStatus.verified || 0) + (actionByStatus.closed || 0)) / actionTotal * 100, 1) : 0;

    const ppeCompliance = employees ? round(Math.min(100, (ppeCovered / employees) * 100), 1) : 0;

    /* ---- 12 month series (filled so charts never show gaps) ---- */
    const [incidentSeries, nearMissSeries, inspectionSeries, ltiSeries] = await Promise.all([
      query(
        `SELECT substr(occurred_at, 1, 7) AS month, COUNT(*) AS total FROM incidents
         WHERE occurred_at IS NOT NULL${s.clause} GROUP BY substr(occurred_at, 1, 7)`,
        s.params,
      ),
      query(
        `SELECT substr(occurred_at, 1, 7) AS month, COUNT(*) AS total FROM incidents
         WHERE type = 'near_miss' AND occurred_at IS NOT NULL${s.clause} GROUP BY substr(occurred_at, 1, 7)`,
        s.params,
      ),
      query(
        `SELECT substr(inspection_date, 1, 7) AS month, COUNT(*) AS total FROM inspections
         WHERE inspection_date IS NOT NULL${s.clause} GROUP BY substr(inspection_date, 1, 7)`,
        s.params,
      ),
      query(
        `SELECT substr(occurred_at, 1, 7) AS month, COUNT(*) AS total FROM incidents
         WHERE type = 'lti' AND occurred_at IS NOT NULL${s.clause} GROUP BY substr(occurred_at, 1, 7)`,
        s.params,
      ),
    ]);

    const map = (rows) => new Map(rows.map((r) => [r.month, Number(r.total)]));
    const incMap = map(incidentSeries);
    const nmMap = map(nearMissSeries);
    const inspMap = map(inspectionSeries);
    const ltiMap = map(ltiSeries);
    const monthly = months.map((month) => ({
      month,
      incidents: incMap.get(month) || 0,
      nearMiss: nmMap.get(month) || 0,
      inspections: inspMap.get(month) || 0,
      lti: ltiMap.get(month) || 0,
    }));

    /* ---- department performance ---- */
    const [incByDept, hazByDept, actByDept, empByDept] = await Promise.all([
      query(`SELECT department, COUNT(*) AS total FROM incidents WHERE 1=1${s.clause} GROUP BY department`, s.params),
      query(
        `SELECT department, COUNT(*) AS total FROM hazards WHERE status IN ('open','in_progress')${s.clause} GROUP BY department`,
        s.params,
      ),
      query(
        `SELECT department, COUNT(*) AS total FROM actions WHERE status NOT IN ('verified','closed')${s.clause} GROUP BY department`,
        s.params,
      ),
      query(`SELECT department, COUNT(*) AS total FROM employees WHERE status = 'active'${s.clause} GROUP BY department`, s.params),
    ]);
    const deptNames = new Set([
      ...incByDept.map((r) => r.department),
      ...hazByDept.map((r) => r.department),
      ...actByDept.map((r) => r.department),
      ...empByDept.map((r) => r.department),
    ]);
    const departments = [...deptNames]
      .filter(Boolean)
      .map((name) => ({
        department: name,
        incidents: Number(incByDept.find((r) => r.department === name)?.total || 0),
        hazards: Number(hazByDept.find((r) => r.department === name)?.total || 0),
        openActions: Number(actByDept.find((r) => r.department === name)?.total || 0),
        employees: Number(empByDept.find((r) => r.department === name)?.total || 0),
      }))
      .sort((a, b) => b.incidents - a.incidents || b.hazards - a.hazards)
      .slice(0, 8);

    /* ---- recent activity (real records) ---- */
    const recent = await query(
      `SELECT id, action, entity, entity_id, username, created_at FROM audit_logs
       ${req.user.permissions.viewAll ? '' : 'WHERE user_id = ?'}
       ORDER BY created_at DESC LIMIT 8`,
      req.user.permissions.viewAll ? [] : [req.user.id],
    );

    const recentIncidents = await query(
      `SELECT id, incident_no, type, occurred_at, department, severity, status FROM incidents
       WHERE 1=1${s.clause} ORDER BY occurred_at DESC, created_at DESC LIMIT 5`,
      s.params,
    );

    const alerts = [];
    if (overdueActions > 0) {
      alerts.push({
        level: 'critical',
        title: 'Overdue corrective actions',
        message: `${overdueActions} corrective action${overdueActions === 1 ? ' is' : 's are'} past the target date.`,
        link: '/corrective-actions?status=open',
        count: overdueActions,
      });
    }
    if (overdueHazards > 0) {
      alerts.push({
        level: 'critical',
        title: 'Hazards past target date',
        message: `${overdueHazards} open hazard${overdueHazards === 1 ? ' is' : 's are'} beyond the target completion date.`,
        link: '/hazards',
        count: overdueHazards,
      });
    }
    if (expiringPermits > 0) {
      alerts.push({
        level: 'warning',
        title: 'Permits expiring',
        message: `${expiringPermits} active permit${expiringPermits === 1 ? '' : 's'} expire within 3 days.`,
        link: '/permits',
        count: expiringPermits,
      });
    }
    if (expiringTrainings > 0) {
      alerts.push({
        level: 'warning',
        title: 'Training expiry',
        message: `${expiringTrainings} training record${expiringTrainings === 1 ? '' : 's'} expire within 30 days.`,
        link: '/training',
        count: expiringTrainings,
      });
    }
    if (dueFireEquipment > 0) {
      alerts.push({
        level: 'warning',
        title: 'Fire equipment inspection due',
        message: `${dueFireEquipment} fire equipment item${dueFireEquipment === 1 ? '' : 's'} need inspection.`,
        link: '/fire-emergency',
        count: dueFireEquipment,
      });
    }
    if (pendingUsers > 0 && req.permissions.manageUsers) {
      alerts.push({
        level: 'info',
        title: 'Registrations awaiting approval',
        message: `${pendingUsers} account${pendingUsers === 1 ? '' : 's'} waiting for approval.`,
        link: '/admin/users',
        count: pendingUsers,
      });
    }

    let daysSinceLti = null;
    if (lastLti?.last) {
      const diff = Date.now() - new Date(`${String(lastLti.last).slice(0, 10)}T00:00:00Z`).getTime();
      daysSinceLti = Math.max(0, Math.floor(diff / 86400000));
    }

    res.json({
      generatedAt: new Date().toISOString(),
      scope: req.user.permissions.viewAll ? 'company' : 'department',
      kpis: {
        employees,
        incidents: incidentTotal,
        nearMiss,
        lti,
        firstAid,
        manHours,
        trir,
        ltifr,
        recordable,
        inspections: inspectionTotal,
        openHazards,
        closedActions,
        openActions,
        trainingCompliance,
        ppeCompliance,
        activePermits,
        daysSinceLti,
        closureRate,
      },
      incidentTypes: Object.entries(byType).map(([type, total]) => ({ type, total })),
      monthly,
      departments,
      actionStatus: actionByStatus,
      trainingStatus: trainingByStatus,
      permitStatus: permitByStatus,
      recent,
      recentIncidents,
      alerts,
    });
  }),
);
