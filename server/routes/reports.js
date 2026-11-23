import { Router } from 'express';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { get, query } from '../db.js';
import { ENUMS } from '../modules.js';
import { audit, requireAuth } from '../auth.js';
import { asyncHandler, badRequest, cleanText } from '../util.js';

export const reportsRouter = Router();

const NAVY = '#0B2545';
const BLUE = '#1D4ED8';
const TEAL = '#0F766E';
const ORANGE = '#EA580C';
const GREY = '#64748B';
const LIGHT = '#F1F5F9';

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const monthStart = () => `${new Date().toISOString().slice(0, 7)}-01`;

function labelFor(enumName, value) {
  const list = ENUMS[enumName] || [];
  const found = list.find((entry) => (Array.isArray(entry) ? entry[0] === value : entry.value === value));
  if (!found) return value ?? '';
  return Array.isArray(found) ? found[1] : found.label;
}

const col = (key, label, width, map) => ({ key, label, width, map });
const fmtDate = (v) => (v ? String(v).slice(0, 10) : '');
const fmtDateTime = (v) => (v ? String(v).replace('T', ' ').slice(0, 16) : '');

const INCIDENT_COLS = [
  col('incident_no', 'Ref No.', 9),
  col('type', 'Type', 12, (v) => labelFor('incidentTypes', v)),
  col('occurred_at', 'Date', 10, fmtDate),
  col('department', 'Department', 11),
  col('location', 'Location', 12),
  col('severity', 'Severity', 9, (v) => labelFor('severity', v)),
  col('lost_days', 'Lost Days', 7),
  col('status', 'Status', 9, (v) => labelFor('incidentStatus', v)),
  col('description', 'Description', 21),
];

const INSPECTION_COLS = [
  col('inspection_no', 'Ref No.', 10),
  col('type', 'Inspection Type', 14, (v) => labelFor('inspectionTypes', v)),
  col('inspection_date', 'Date', 10, fmtDate),
  col('department', 'Department', 12),
  col('location', 'Location', 13),
  col('inspector', 'Inspector', 12),
  col('score', 'Score %', 8, (v, row) => (v == null ? '' : `${Math.round((Number(v) / Number(row.max_score || 100)) * 100)}%`)),
  col('status', 'Status', 10, (v) => labelFor('inspectionStatus', v)),
  col('findings', 'Findings', 11),
];

const HAZARD_COLS = [
  col('hazard_no', 'Ref No.', 9),
  col('title', 'Hazard', 22),
  col('category', 'Category', 13, (v) => labelFor('hazardCategories', v)),
  col('department', 'Department', 12),
  col('likelihood', 'L', 4),
  col('severity', 'S', 4),
  col('risk_score', 'Score', 6),
  col('risk_level', 'Risk', 8, (v) => labelFor('riskLevels', v)),
  col('owner', 'Owner', 11),
  col('target_date', 'Target', 10, fmtDate),
  col('status', 'Status', 9, (v) => labelFor('hazardStatus', v)),
];

const ACTION_COLS = [
  col('action_no', 'Ref No.', 9),
  col('finding', 'Finding / Action', 26),
  col('responsible_person', 'Responsible', 13),
  col('department', 'Department', 12),
  col('priority', 'Priority', 8, (v) => labelFor('priority', v)),
  col('target_date', 'Target Date', 10, fmtDate),
  col('status', 'Status', 10, (v) => labelFor('actionStatus', v)),
  col('action_taken', 'Action Taken', 12),
];

const PERMIT_COLS = [
  col('permit_no', 'Permit No.', 10),
  col('type', 'Permit Type', 15, (v) => labelFor('permitTypes', v)),
  col('department', 'Department', 12),
  col('location', 'Location', 12),
  col('requested_by', 'Requested By', 12),
  col('start_at', 'Valid From', 11, fmtDateTime),
  col('end_at', 'Valid To', 11, fmtDateTime),
  col('status', 'Status', 9, (v) => labelFor('permitStatus', v)),
  col('approved_by', 'Approved By', 8),
];

const TRAINING_COLS = [
  col('title', 'Session', 22),
  col('type', 'Type', 13, (v) => labelFor('trainingTypes', v)),
  col('department', 'Department', 12),
  col('trainer', 'Trainer', 13),
  col('training_date', 'Date', 10, fmtDate),
  col('duration_hours', 'Hours', 6),
  col('expiry_date', 'Expires', 10, fmtDate),
  col('status', 'Status', 9, (v) => labelFor('trainingStatus', v)),
  col('attendees', 'Attendees', 5),
];

const PPE_COLS = [
  col('employee_name', 'Employee', 18),
  col('item_name', 'PPE Item', 18),
  col('quantity', 'Qty', 6),
  col('issue_date', 'Issued', 11, fmtDate),
  col('replacement_date', 'Replacement', 12, fmtDate),
  col('condition', 'Condition', 12, (v) => labelFor('ppeIssueStatus', v)),
  col('status', 'Status', 10, (v) => labelFor('ppeIssueStatus', v)),
  col('notes', 'Notes', 13),
];

const EMPLOYEE_COLS = [
  col('employee_code', 'Emp. ID', 10),
  col('full_name', 'Name', 20),
  col('department', 'Department', 14),
  col('designation', 'Designation', 15),
  col('induction_status', 'Induction', 11, (v) => labelFor('inductionStatus', v)),
  col('induction_date', 'Inducted', 10, fmtDate),
  col('medical_fitness', 'Medical', 10, (v) => labelFor('medicalFitness', v)),
  col('fitness_expiry', 'Fitness Due', 10, fmtDate),
];

function tableSection(title, rows, columns) {
  return { type: 'table', title, rows, columns };
}

async function periodRows(table, dateColumn, from, to, department, order, limit = 400) {
  const params = [from, to];
  let sql = `SELECT * FROM ${table} WHERE ${dateColumn} >= ? AND ${dateColumn} <= ?`;
  if (department && department !== 'all') {
    sql += ' AND department = ?';
    params.push(department);
  }
  sql += ` ORDER BY ${order || dateColumn} DESC LIMIT ${limit}`;
  return query(sql, params);
}

async function countRows(table, where = '', params = []) {
  const row = await get(`SELECT COUNT(*) AS total FROM ${table} ${where ? `WHERE ${where}` : ''}`, params);
  return Number(row?.total || 0);
}

async function coreMetrics(from, to, department) {
  const dept = department && department !== 'all' ? department : null;
  const dq = dept ? ' AND department = ?' : '';
  const dp = dept ? [dept] : [];

  const incidents = await query(
    `SELECT type, COUNT(*) AS total, COALESCE(SUM(lost_days),0) AS lost_days FROM incidents
     WHERE occurred_at >= ? AND occurred_at <= ?${dq} GROUP BY type`,
    [from, to, ...dp],
  );
  const byType = Object.fromEntries(incidents.map((r) => [r.type, Number(r.total)]));
  const totalIncidents = incidents.reduce((sum, r) => sum + Number(r.total), 0);
  const lti = byType.lti || 0;
  const nearMiss = byType.near_miss || 0;
  const firstAid = byType.first_aid || 0;
  const recordable = (byType.medical_treatment || 0) + lti;
  const lostDays = incidents.reduce((sum, r) => sum + Number(r.lost_days), 0);

  const mh = await get(
    `SELECT COALESCE(SUM(hours),0) AS total FROM man_hours WHERE month >= ? AND month <= ?${dq}`,
    [from.slice(0, 7), to.slice(0, 7), ...dp],
  );
  const manHours = Number(mh?.total || 0);
  const trir = manHours > 0 ? (recordable * 200000) / manHours : 0;
  const ltifr = manHours > 0 ? (lti * 1000000) / manHours : 0;

  const inspections = await countRows(
    'inspections',
    `inspection_date >= ? AND inspection_date <= ?${dq}`,
    [from, to, ...dp],
  );
  const openHazards = await countRows('hazards', `status IN ('open','in_progress')${dq}`, dp);
  const openActions = await countRows('actions', `status NOT IN ('verified','closed')${dq}`, dp);
  const closedActions = await countRows('actions', `status IN ('verified','closed')${dq}`, dp);
  const overdueActions = await countRows(
    'actions',
    `status NOT IN ('verified','closed') AND target_date < ?${dq}`,
    [today(), ...dp],
  );
  const activePermits = await countRows('permits', `status IN ('approved','active')${dq}`, dp);
  const pendingPermits = await countRows('permits', `status = 'pending'${dq}`, dp);

  const trainings = await query(
    `SELECT status, COUNT(*) AS total FROM trainings WHERE training_date >= ? AND training_date <= ?${dq} GROUP BY status`,
    [from, to, ...dp],
  );
  const trainingTotal = trainings.reduce((sum, r) => sum + Number(r.total), 0);
  const trainingDone = trainings.filter((r) => r.status === 'completed').reduce((sum, r) => sum + Number(r.total), 0);
  const trainingCompliance = trainingTotal > 0 ? Math.round((trainingDone / trainingTotal) * 100) : 0;

  const employees = await countRows('employees', `status = 'active'${dq}`, dp);
  const ppeIssued = await countRows('ppe_issues', `issue_date >= ? AND issue_date <= ?${dq}`, [from, to, ...dp]);
  const expiringTraining = await countRows(
    'trainings',
    `expiry_date IS NOT NULL AND expiry_date >= ? AND expiry_date <= ?${dq}`,
    [today(), daysAgo(-30), ...dp],
  );

  return {
    totalEmployees: employees,
    totalIncidents,
    nearMiss,
    lti,
    firstAid,
    medicalTreatment: byType.medical_treatment || 0,
    recordable,
    lostDays,
    manHours,
    trir: Number(trir.toFixed(2)),
    ltifr: Number(ltifr.toFixed(2)),
    inspections,
    openHazards,
    openActions,
    closedActions,
    overdueActions,
    activePermits,
    pendingPermits,
    trainingCompliance,
    ppeIssued,
    expiringTraining,
    byType,
  };
}

function metricSection(metrics) {
  return {
    type: 'metrics',
    title: 'Key HSE Indicators',
    items: [
      ['Total Employees', metrics.totalEmployees],
      ['Total Incidents', metrics.totalIncidents],
      ['Near Miss Reports', metrics.nearMiss],
      ['Lost Time Injuries', metrics.lti],
      ['First Aid Cases', metrics.firstAid],
      ['Recordable Cases', metrics.recordable],
      ['Man Hours Worked', metrics.manHours.toLocaleString('en-US')],
      ['TRIR', metrics.trir],
      ['LTIFR', metrics.ltifr],
      ['Safety Inspections', metrics.inspections],
      ['Open Hazards', metrics.openHazards],
      ['Open Corrective Actions', metrics.openActions],
      ['Closed Corrective Actions', metrics.closedActions],
      ['Overdue Actions', metrics.overdueActions],
      ['Training Compliance', `${metrics.trainingCompliance}%`],
      ['Active Work Permits', metrics.activePermits],
    ],
  };
}

async function monthlyTrend(from, to, department) {
  const dept = department && department !== 'all' ? department : null;
  const dq = dept ? ' AND department = ?' : '';
  const rows = await query(
    `SELECT substr(occurred_at,1,7) AS month,
            COUNT(*) AS total,
            SUM(CASE WHEN type = 'near_miss' THEN 1 ELSE 0 END) AS near_miss,
            SUM(CASE WHEN type = 'lti' THEN 1 ELSE 0 END) AS lti
     FROM incidents WHERE occurred_at >= ? AND occurred_at <= ?${dq}
     GROUP BY substr(occurred_at,1,7) ORDER BY month`,
    [from, to, ...(dept ? [dept] : [])],
  );
  return rows.map((r) => ({
    month: r.month,
    total: Number(r.total),
    nearMiss: Number(r.near_miss || 0),
    lti: Number(r.lti || 0),
  }));
}

async function departmentBreakdown(from, to) {
  return query(
    `SELECT department,
            COUNT(*) AS incidents,
            SUM(CASE WHEN type = 'lti' THEN 1 ELSE 0 END) AS lti
     FROM incidents WHERE occurred_at >= ? AND occurred_at <= ? AND department IS NOT NULL
     GROUP BY department ORDER BY incidents DESC LIMIT 15`,
    [from, to],
  );
}

const DEPT_COLS = [
  col('department', 'Department', 45),
  col('incidents', 'Incidents', 18),
  col('lti', 'Lost Time Injuries', 20),
  col('share', 'Share of Total', 17),
];

const REPORT_DEFS = {
  daily: {
    label: 'Daily HSE Report',
    defaultRange: () => [today(), today()],
    build: async (from, to, department, user) => {
      const metrics = await coreMetrics(from, to, department);
      const incidents = await periodRows('incidents', 'occurred_at', from, to, department, 'occurred_at');
      const inspections = await periodRows('inspections', 'inspection_date', from, to, department, 'inspection_date');
      const actions = await query(
        `SELECT * FROM actions WHERE status NOT IN ('verified','closed') ORDER BY target_date ASC LIMIT 100`,
      );
      return {
        summary: metricSection(metrics),
        sections: [
          tableSection('Incidents Reported', incidents, INCIDENT_COLS),
          tableSection('Inspections Conducted', inspections, INSPECTION_COLS),
          tableSection('Open Corrective Actions', actions, ACTION_COLS),
        ],
      };
    },
  },
  weekly: {
    label: 'Weekly HSE Report',
    defaultRange: () => [daysAgo(6), today()],
    build: async (from, to, department) => {
      const metrics = await coreMetrics(from, to, department);
      const trend = await monthlyTrend(from, to, department);
      return {
        summary: metricSection(metrics),
        sections: [
          tableSection(
            'Weekly Incident Summary',
            trend.map((r) => ({ period: r.month, total: r.total, near_miss: r.nearMiss, lti: r.lti })),
            [
              col('period', 'Period', 40),
              col('total', 'Total Incidents', 20),
              col('near_miss', 'Near Miss', 20),
              col('lti', 'LTI', 20),
            ],
          ),
          tableSection('Incidents in Period', await periodRows('incidents', 'occurred_at', from, to, department, 'occurred_at'), INCIDENT_COLS),
          tableSection('Hazards and Risk Status', await periodRows('hazards', 'created_at', from, to, department, 'risk_score'), HAZARD_COLS),
          tableSection('Open Corrective Actions', await periodRows('actions', 'created_at', from, to, department, 'target_date'), ACTION_COLS),
        ],
      };
    },
  },
  monthly: {
    label: 'Monthly HSE Report',
    defaultRange: () => [monthStart(), today()],
    build: async (from, to, department) => {
      const metrics = await coreMetrics(from, to, department);
      const trend = await monthlyTrend(from, to, department);
      const depts = await departmentBreakdown(from, to);
      const total = depts.reduce((sum, d) => sum + Number(d.incidents), 0) || 1;
      return {
        summary: metricSection(metrics),
        chart: { title: 'Incident Trend by Month', labels: trend.map((t) => t.month), values: trend.map((t) => t.total) },
        sections: [
          tableSection('Monthly Incident Trend', trend.map((t) => ({ month: t.month, total: t.total, near_miss: t.nearMiss, lti: t.lti })), [
            col('month', 'Month', 40),
            col('total', 'Total Incidents', 20),
            col('near_miss', 'Near Miss', 20),
            col('lti', 'LTI', 20),
          ]),
          tableSection(
            'Department-wise Performance',
            depts.map((d) => ({ ...d, share: `${Math.round((Number(d.incidents) / total) * 100)}%` })),
            DEPT_COLS,
          ),
          tableSection('Incidents in Period', await periodRows('incidents', 'occurred_at', from, to, department, 'occurred_at'), INCIDENT_COLS),
          tableSection('Inspections', await periodRows('inspections', 'inspection_date', from, to, department, 'inspection_date'), INSPECTION_COLS),
          tableSection('Corrective Actions', await periodRows('actions', 'created_at', from, to, department, 'target_date'), ACTION_COLS),
        ],
      };
    },
  },
  incident_investigation: {
    label: 'Incident Investigation Report',
    defaultRange: () => [daysAgo(89), today()],
    build: async (from, to, department) => {
      const rows = await periodRows('incidents', 'occurred_at', from, to, department, 'occurred_at');
      const detailed = rows.map((r) => ({
        ...r,
        cause: r.root_cause || 'Pending investigation',
        investigation: r.investigation || 'Not recorded',
      }));
      return {
        summary: metricSection(await coreMetrics(from, to, department)),
        sections: [
          tableSection('Incidents and Investigations', detailed, [
            col('incident_no', 'Ref No.', 8),
            col('type', 'Type', 10, (v) => labelFor('incidentTypes', v)),
            col('occurred_at', 'Date', 9, fmtDate),
            col('department', 'Dept.', 9),
            col('cause', 'Root Cause', 24),
            col('investigation', 'Investigation Findings', 25),
            col('status', 'Status', 8, (v) => labelFor('incidentStatus', v)),
            col('lost_days', 'Lost Days', 7),
          ]),
        ],
      };
    },
  },
  inspection: {
    label: 'Safety Inspection Report',
    defaultRange: () => [daysAgo(29), today()],
    build: async (from, to, department) => ({
      summary: metricSection(await coreMetrics(from, to, department)),
      sections: [
        tableSection('Inspections', await periodRows('inspections', 'inspection_date', from, to, department, 'inspection_date'), INSPECTION_COLS),
        tableSection('Fire and Emergency Equipment', await periodRows('fire_equipment', 'inspection_date', from, to, department, 'next_due'), [
          col('equipment_type', 'Equipment', 20, (v) => labelFor('fireEquipmentTypes', v)),
          col('tag_no', 'Tag No.', 15),
          col('location', 'Location', 20),
          col('inspection_date', 'Last Inspection', 15, fmtDate),
          col('next_due', 'Next Due', 15, fmtDate),
          col('status', 'Status', 15, (v) => labelFor('fireStatus', v)),
        ]),
      ],
    }),
  },
  near_miss: {
    label: 'Near Miss Report',
    defaultRange: () => [daysAgo(89), today()],
    build: async (from, to, department) => {
      const rows = await periodRows('incidents', 'occurred_at', from, to, department, 'occurred_at');
      return {
        summary: metricSection(await coreMetrics(from, to, department)),
        sections: [tableSection('Near Miss Reports', rows.filter((r) => r.type === 'near_miss'), INCIDENT_COLS)],
      };
    },
  },
  training: {
    label: 'Training and Competency Report',
    defaultRange: () => [daysAgo(89), today()],
    build: async (from, to, department) => {
      const rows = await periodRows('trainings', 'training_date', from, to, department, 'training_date');
      const withCounts = [];
      for (const row of rows) {
        const count = await get('SELECT COUNT(*) AS total FROM training_attendance WHERE training_id = ?', [row.id]);
        withCounts.push({ ...row, attendees: Number(count?.total || 0) });
      }
      return {
        summary: metricSection(await coreMetrics(from, to, department)),
        sections: [tableSection('Training Sessions', withCounts, TRAINING_COLS)],
      };
    },
  },
  ppe: {
    label: 'PPE Issue Report',
    defaultRange: () => [daysAgo(89), today()],
    build: async (from, to, department) => {
      const rows = await periodRows('ppe_issues', 'issue_date', from, to, department, 'issue_date');
      const stock = await query('SELECT name, category, size, stock, min_stock FROM ppe_items ORDER BY name');
      return {
        summary: metricSection(await coreMetrics(from, to, department)),
        sections: [
          tableSection('PPE Issue Register', rows, PPE_COLS),
          tableSection('PPE Stock Position', stock, [
            col('name', 'Item', 34),
            col('category', 'Category', 22, (v) => labelFor('ppeCategories', v)),
            col('size', 'Size', 14),
            col('stock', 'In Stock', 15),
            col('min_stock', 'Minimum', 15),
          ]),
        ],
      };
    },
  },
  permit_register: {
    label: 'Permit to Work Register',
    defaultRange: () => [daysAgo(29), today()],
    build: async (from, to, department) => ({
      summary: metricSection(await coreMetrics(from, to, department)),
      sections: [
        tableSection('Permit Register', await periodRows('permits', 'start_at', from, to, department, 'start_at'), PERMIT_COLS),
      ],
    }),
  },
  corrective_action: {
    label: 'Corrective Action Report',
    defaultRange: () => [daysAgo(89), today()],
    build: async (from, to, department) => ({
      summary: metricSection(await coreMetrics(from, to, department)),
      sections: [
        tableSection('Corrective and Preventive Actions', await periodRows('actions', 'created_at', from, to, department, 'target_date'), ACTION_COLS),
      ],
    }),
  },
  employee_safety: {
    label: 'Employee Safety Report',
    defaultRange: () => [daysAgo(365), today()],
    build: async (from, to, department, user) => {
      const rows = await query(
        `SELECT * FROM employees ${department && department !== 'all' ? 'WHERE department = ?' : ''} ORDER BY full_name LIMIT 500`,
        department && department !== 'all' ? [department] : [],
      );
      const columns = user.permissions.viewAll
        ? EMPLOYEE_COLS
        : EMPLOYEE_COLS.filter((c) => !['medical_fitness', 'fitness_expiry'].includes(c.key));
      return {
        summary: metricSection(await coreMetrics(from, to, department)),
        sections: [tableSection('Employee Safety Records', rows, columns)],
      };
    },
  },
  management_review: {
    label: 'Management Review Report',
    defaultRange: () => [daysAgo(364), today()],
    build: async (from, to, department) => {
      const metrics = await coreMetrics(from, to, department);
      const trend = await monthlyTrend(from, to, department);
      const depts = await departmentBreakdown(from, to);
      const total = depts.reduce((sum, d) => sum + Number(d.incidents), 0) || 1;
      const hazards = await query(
        `SELECT category, COUNT(*) AS total, AVG(risk_score) AS avg_score FROM hazards
         WHERE created_at >= ? AND created_at <= ? GROUP BY category ORDER BY total DESC LIMIT 12`,
        [from, to],
      );
      return {
        summary: metricSection(metrics),
        chart: { title: 'Incident Trend by Month', labels: trend.map((t) => t.month), values: trend.map((t) => t.total) },
        sections: [
          tableSection('Monthly Trend', trend.map((t) => ({ month: t.month, total: t.total, near_miss: t.nearMiss, lti: t.lti })), [
            col('month', 'Month', 40),
            col('total', 'Incidents', 20),
            col('near_miss', 'Near Miss', 20),
            col('lti', 'LTI', 20),
          ]),
          tableSection(
            'Department Performance',
            depts.map((d) => ({ ...d, share: `${Math.round((Number(d.incidents) / total) * 100)}%` })),
            DEPT_COLS,
          ),
          tableSection(
            'Hazard Profile by Category',
            hazards.map((h) => ({ category: labelFor('hazardCategories', h.category), total: h.total, avg: Number(h.avg_score || 0).toFixed(1) })),
            [col('category', 'Hazard Category', 50), col('total', 'Total Hazards', 25), col('avg', 'Average Risk Score', 25)],
          ),
        ],
      };
    },
  },
};

reportsRouter.get(
  '/catalog',
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.json({
      reports: Object.entries(REPORT_DEFS).map(([key, def]) => ({ key, label: def.label })),
    });
  }),
);

function companyInfo() {
  return { name: 'Industrial HSE Pro', tagline: 'Enterprise Safety Management System' };
}

function cellText(value) {
  if (value === null || value === undefined) return '';
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text;
}

function truncateToWidth(doc, text, width, fontSize) {
  doc.fontSize(fontSize);
  if (doc.widthOfString(text) <= width) return text;
  let out = text;
  while (out.length > 1 && doc.widthOfString(`${out}...`) > width) out = out.slice(0, -1);
  return `${out}...`;
}

function drawMetrics(doc, items) {
  const left = doc.page.margins.left;
  const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const cols = 4;
  const gap = 8;
  const cardW = (usable - gap * (cols - 1)) / cols;
  const cardH = 40;
  items.forEach((item, index) => {
    const row = Math.floor(index / cols);
    const column = index % cols;
    const x = left + column * (cardW + gap);
    const y = doc.y + row * (cardH + gap);
    doc.save();
    doc.roundedRect(x, y, cardW, cardH, 4).fillAndStroke('#F8FAFC', '#E2E8F0');
    doc.fillColor(GREY).fontSize(6.5).font('Helvetica').text(String(item[0]).toUpperCase(), x + 6, y + 6, { width: cardW - 12 });
    doc.fillColor(NAVY).fontSize(12).font('Helvetica-Bold').text(String(item[1]), x + 6, y + 18, { width: cardW - 12 });
    doc.restore();
  });
  const rows = Math.ceil(items.length / cols);
  doc.y = doc.y + rows * (cardH + gap) + 4;
}

function drawBarChart(doc, chart) {
  if (!chart || !chart.values?.length) return;
  const left = doc.page.margins.left;
  const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const height = 120;
  const top = doc.y + 16;
  if (top + height > doc.page.height - doc.page.margins.bottom - 40) {
    doc.addPage();
  }
  const startY = doc.y + 16;
  doc.fillColor(NAVY).fontSize(9).font('Helvetica-Bold').text(chart.title, left, doc.y);
  doc.y += 14;
  const baseY = doc.y + height;
  const max = Math.max(1, ...chart.values.map((v) => Number(v)));
  const barW = Math.min(34, usable / chart.values.length - 8);
  doc.moveTo(left, baseY).lineTo(left + usable, baseY).strokeColor('#CBD5E1').lineWidth(0.7).stroke();
  chart.values.forEach((value, index) => {
    const x = left + 6 + index * (usable / chart.values.length);
    const h = Math.max(2, (Number(value) / max) * (height - 24));
    doc.rect(x, baseY - h, barW, h).fill(index % 2 === 0 ? BLUE : TEAL);
    doc.fillColor(NAVY).fontSize(7).font('Helvetica-Bold').text(String(value), x, baseY - h - 10, { width: barW, align: 'center' });
    doc.fillColor(GREY).fontSize(6).font('Helvetica').text(String(chart.labels[index]).slice(2), x - 4, baseY + 3, { width: barW + 8, align: 'center' });
  });
  doc.y = baseY + 18;
}

function drawTable(doc, section) {
  const left = doc.page.margins.left;
  const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const totalWidth = section.columns.reduce((sum, c) => sum + c.width, 0);
  const widths = section.columns.map((c) => (c.width / totalWidth) * usable);
  const bottomLimit = doc.page.height - doc.page.margins.bottom - 30;

  const drawHeader = () => {
    const y = doc.y;
    doc.rect(left, y, usable, 18).fill(NAVY);
    let x = left;
    doc.fillColor('#FFFFFF').fontSize(7).font('Helvetica-Bold');
    section.columns.forEach((c, i) => {
      doc.text(truncateToWidth(doc, c.label, widths[i] - 6, 7), x + 3, y + 5.5, { width: widths[i] - 6, lineBreak: false });
      x += widths[i];
    });
    doc.y = y + 18;
  };

  doc.fillColor(NAVY).fontSize(10).font('Helvetica-Bold').text(section.title, left, doc.y + 6);
  doc.y += 20;
  if (!section.rows.length) {
    doc.fillColor(GREY).fontSize(8).font('Helvetica-Oblique').text('No records found for this period.', left + 2, doc.y);
    doc.y += 16;
    return;
  }
  drawHeader();
  section.rows.forEach((row, index) => {
    if (doc.y + 16 > bottomLimit) {
      doc.addPage();
      drawHeader();
    }
    const y = doc.y;
    if (index % 2 === 1) doc.rect(left, y, usable, 16).fill(LIGHT);
    let x = left;
    doc.fillColor('#0F172A').fontSize(6.8).font('Helvetica');
    section.columns.forEach((c, i) => {
      const raw = c.map ? c.map(row[c.key], row) : row[c.key];
      const text = truncateToWidth(doc, cellText(raw), widths[i] - 6, 6.8);
      doc.text(text, x + 3, y + 4.5, { width: widths[i] - 6, lineBreak: false });
      x += widths[i];
    });
    doc.moveTo(left, y + 16).lineTo(left + usable, y + 16).strokeColor('#E2E8F0').lineWidth(0.4).stroke();
    doc.y = y + 16;
  });
  doc.y += 8;
}

function drawSignatureBlock(doc, preparedBy, reviewedBy) {
  if (doc.y + 90 > doc.page.height - doc.page.margins.bottom) doc.addPage();
  const left = doc.page.margins.left;
  const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const y = doc.y + 18;
  const blocks = [
    ['Prepared by', preparedBy],
    ['Reviewed by (HSE Manager)', reviewedBy || '________________'],
    ['Approved by (Management)', '________________'],
  ];
  const width = usable / 3;
  blocks.forEach((block, index) => {
    const x = left + index * width;
    doc.moveTo(x + 4, y + 26).lineTo(x + width - 16, y + 26).strokeColor('#94A3B8').lineWidth(0.7).stroke();
    doc.fillColor(NAVY).fontSize(7.5).font('Helvetica-Bold').text(block[1], x + 4, y + 30, { width: width - 20 });
    doc.fillColor(GREY).fontSize(6.5).font('Helvetica').text(block[0], x + 4, y + 42, { width: width - 20 });
  });
  doc.y = y + 66;
}

async function buildPdf(report, meta, user) {
  const doc = new PDFDocument({ size: 'A4', margin: 36, bufferPages: true });
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const company = companyInfo();
  const left = doc.page.margins.left;
  const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  doc.rect(0, 0, doc.page.width, 74).fill(NAVY);
  doc.fillColor('#FFFFFF').fontSize(16).font('Helvetica-Bold').text(company.name, left, 20, { width: usable });
  doc.fillColor('#93C5FD').fontSize(8).font('Helvetica').text(company.tagline, left, 40, { width: usable });
  doc.fillColor('#FFFFFF').fontSize(11).font('Helvetica-Bold').text(report.label, left, 54, { width: usable, align: 'right' });
  doc.y = 88;

  doc.fillColor(NAVY).fontSize(8).font('Helvetica-Bold').text('Reporting period', left, doc.y);
  doc.fillColor('#0F172A').fontSize(8).font('Helvetica').text(`${meta.from} to ${meta.to}`, left, doc.y + 11);
  doc.fillColor(NAVY).fontSize(8).font('Helvetica-Bold').text('Department', left + usable / 2, doc.y - 11);
  doc.fillColor('#0F172A').fontSize(8).font('Helvetica').text(meta.department || 'All departments', left + usable / 2, doc.y);
  doc.y += 20;
  doc.fillColor(GREY).fontSize(7).font('Helvetica').text(
    `Prepared by: ${meta.preparedBy}   |   Generated: ${new Date().toISOString().replace('T', ' ').slice(0, 16)} UTC   |   Records from live database`,
    left,
    doc.y,
    { width: usable },
  );
  doc.y += 14;
  doc.moveTo(left, doc.y).lineTo(left + usable, doc.y).strokeColor('#CBD5E1').lineWidth(0.8).stroke();
  doc.y += 10;

  if (report.summary) drawMetrics(doc, report.summary.items);
  if (report.chart) drawBarChart(doc, report.chart);
  report.sections.forEach((section) => {
    if (doc.y > doc.page.height - doc.page.margins.bottom - 90) doc.addPage();
    drawTable(doc, section);
  });
  drawSignatureBlock(doc, meta.preparedBy, meta.reviewedBy);

  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(range.start + i);
    doc.fillColor(GREY).fontSize(6.5).font('Helvetica').text(
      `${company.name} - ${report.label} - Confidential HSE document`,
      doc.page.margins.left,
      doc.page.height - 24,
      { width: usable - 60 },
    );
    doc.fillColor(GREY).fontSize(6.5).text(`Page ${i + 1} of ${range.count}`, doc.page.margins.left, doc.page.height - 24, {
      width: usable,
      align: 'right',
    });
  }

  doc.end();
  return done;
}

async function buildXlsx(report, meta) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Industrial HSE Pro';
  workbook.created = new Date();

  const summary = workbook.addWorksheet('Summary');
  summary.columns = [{ width: 34 }, { width: 26 }, { width: 26 }, { width: 26 }];
  summary.mergeCells('A1:D1');
  summary.getCell('A1').value = 'INDUSTRIAL HSE PRO';
  summary.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  summary.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2545' } };
  summary.getCell('A1').alignment = { vertical: 'middle' };
  summary.getRow(1).height = 28;
  summary.mergeCells('A2:D2');
  summary.getCell('A2').value = report.label;
  summary.getCell('A2').font = { bold: true, size: 12, color: { argb: 'FF0B2545' } };
  summary.addRow([`Reporting period: ${meta.from} to ${meta.to}`]);
  summary.addRow([`Department: ${meta.department || 'All departments'}`]);
  summary.addRow([`Prepared by: ${meta.preparedBy}`]);
  summary.addRow([`Generated: ${new Date().toISOString().replace('T', ' ').slice(0, 16)} UTC`]);
  summary.addRow([]);

  if (report.summary) {
    const header = summary.addRow(['Key HSE Indicator', 'Value']);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
    });
    report.summary.items.forEach((item) => summary.addRow(item));
  }

  report.sections.forEach((section, index) => {
    const safeName = section.title.replace(/[\\/*?:[\]]/g, '').slice(0, 28) || `Section ${index + 1}`;
    const sheet = workbook.addWorksheet(safeName);
    const headerRow = sheet.addRow(section.columns.map((c) => c.label));
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2545' } };
      cell.alignment = { vertical: 'middle', wrapText: true };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
    });
    headerRow.height = 22;
    section.rows.forEach((row) => {
      const values = section.columns.map((c) => {
        const raw = c.map ? c.map(row[c.key], row) : row[c.key];
        return raw === null || raw === undefined ? '' : raw;
      });
      const added = sheet.addRow(values);
      added.alignment = { vertical: 'top', wrapText: false };
      added.font = { size: 9 };
    });
    section.columns.forEach((c, i) => {
      sheet.getColumn(i + 1).width = Math.min(48, Math.max(12, c.width * 1.6));
    });
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    if (!section.rows.length) sheet.addRow(['No records found for this period.']);
  });

  return workbook.xlsx.writeBuffer();
}

reportsRouter.get(
  '/:type',
  requireAuth,
  asyncHandler(async (req, res) => {
    const def = REPORT_DEFS[req.params.type];
    if (!def) throw badRequest('Unknown report type.');
    const format = String(req.query.format || 'pdf').toLowerCase();
    if (!['pdf', 'xlsx', 'json'].includes(format)) throw badRequest('Format must be pdf, xlsx or json.');

    const [defaultFrom, defaultTo] = def.defaultRange();
    const from = cleanText(req.query.from, 10) || defaultFrom;
    const to = cleanText(req.query.to, 10) || defaultTo;
    if (from > to) throw badRequest('The start date must be before the end date.');
    const department = cleanText(req.query.department, 80) || 'all';

    const body = await def.build(from, to, department, req.user);
    const meta = {
      from,
      to,
      department: department === 'all' ? null : department,
      preparedBy: req.user.full_name || req.user.username,
      reviewedBy: cleanText(req.query.reviewed_by, 120) || null,
    };
    const report = { label: def.label, summary: body.summary, sections: body.sections, chart: body.chart };

    if (format === 'json') {
      return res.json({ report: { ...report, key: req.params.type }, meta });
    }

    await audit(req, 'export', 'report', req.params.type, { format, from, to, department });
    const fileName = `${req.params.type}-hse-report-${from}-to-${to}`;

    if (format === 'xlsx') {
      const buffer = await buildXlsx(report, meta);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}.xlsx"`);
      return res.send(Buffer.from(buffer));
    }

    const pdf = await buildPdf(report, meta, req.user);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}.pdf"`);
    res.setHeader('Content-Length', String(pdf.length));
    return res.send(pdf);
  }),
);

export { REPORT_DEFS };
