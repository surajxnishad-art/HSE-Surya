import { get } from './db.js';
import { newId, nowIso } from './util.js';

/* ------------------------------------------------------------------ enums */

export const ENUMS = {
  incidentTypes: [
    ['accident', 'Accident'],
    ['near_miss', 'Near Miss'],
    ['first_aid', 'First Aid Case'],
    ['medical_treatment', 'Medical Treatment Case'],
    ['lti', 'Lost Time Injury'],
    ['property_damage', 'Property Damage'],
    ['fire', 'Fire Incident'],
    ['environmental', 'Environmental Incident'],
  ],
  incidentStatus: [
    ['open', 'Open'],
    ['investigating', 'Under Investigation'],
    ['actions_pending', 'Actions Pending'],
    ['closed', 'Closed'],
  ],
  severity: [
    ['minor', 'Minor'],
    ['moderate', 'Moderate'],
    ['serious', 'Serious'],
    ['major', 'Major'],
    ['critical', 'Critical'],
  ],
  inspectionTypes: [
    ['daily', 'Daily Safety Inspection'],
    ['weekly', 'Weekly Inspection'],
    ['monthly', 'Monthly Inspection'],
    ['department', 'Department Inspection'],
    ['site', 'Site Inspection'],
    ['equipment', 'Equipment Inspection'],
    ['electrical', 'Electrical Inspection'],
    ['fire', 'Fire Safety Inspection'],
    ['work_at_height', 'Work at Height Inspection'],
    ['machine', 'Machine Safety Inspection'],
  ],
  inspectionStatus: [
    ['open', 'Open'],
    ['findings_open', 'Findings Open'],
    ['closed', 'Closed'],
  ],
  hazardCategories: [
    ['physical', 'Physical'],
    ['chemical', 'Chemical'],
    ['biological', 'Biological'],
    ['ergonomic', 'Ergonomic'],
    ['electrical', 'Electrical'],
    ['fire', 'Fire & Explosion'],
    ['mechanical', 'Mechanical'],
    ['environmental', 'Environmental'],
    ['psychosocial', 'Psychosocial'],
  ],
  hazardStatus: [
    ['open', 'Open'],
    ['in_progress', 'In Progress'],
    ['controlled', 'Controlled'],
    ['verified', 'Verified & Closed'],
  ],
  hierarchy: [
    ['elimination', 'Elimination'],
    ['substitution', 'Substitution'],
    ['engineering', 'Engineering Controls'],
    ['administrative', 'Administrative Controls'],
    ['ppe', 'PPE'],
  ],
  permitTypes: [
    ['hot_work', 'Hot Work Permit'],
    ['cold_work', 'Cold Work Permit'],
    ['confined_space', 'Confined Space Permit'],
    ['work_at_height', 'Work at Height Permit'],
    ['electrical_loto', 'Electrical Isolation / LOTO'],
    ['excavation', 'Excavation Permit'],
    ['general', 'General Work Permit'],
  ],
  permitStatus: [
    ['pending', 'Pending Approval'],
    ['approved', 'Approved'],
    ['active', 'Active'],
    ['rejected', 'Rejected'],
    ['closed', 'Closed'],
    ['expired', 'Expired'],
  ],
  ppeCategories: [
    ['helmet', 'Safety Helmet'],
    ['safety_shoes', 'Safety Shoes'],
    ['gloves', 'Gloves'],
    ['goggles', 'Safety Goggles'],
    ['face_shield', 'Face Shield'],
    ['respirator', 'Respirator'],
    ['harness', 'Safety Harness'],
    ['other', 'Other PPE'],
  ],
  ppeIssueStatus: [
    ['issued', 'Issued'],
    ['replaced', 'Replaced'],
    ['returned', 'Returned'],
    ['damaged', 'Damaged'],
  ],
  trainingTypes: [
    ['induction', 'Induction Training'],
    ['toolbox_talk', 'Toolbox Talk'],
    ['fire_safety', 'Fire Safety Training'],
    ['emergency_response', 'Emergency Response Training'],
    ['loto', 'LOTO Training'],
    ['work_at_height', 'Work at Height Training'],
    ['first_aid', 'First Aid Training'],
    ['general', 'General Training'],
  ],
  trainingStatus: [
    ['planned', 'Planned'],
    ['completed', 'Completed'],
    ['cancelled', 'Cancelled'],
  ],
  competency: [
    ['competent', 'Competent'],
    ['needs_review', 'Needs Review'],
    ['not_assessed', 'Not Assessed'],
  ],
  fireEquipmentTypes: [
    ['extinguisher', 'Fire Extinguisher'],
    ['hydrant', 'Fire Hydrant'],
    ['exit', 'Emergency Exit'],
    ['assembly_point', 'Assembly Point'],
    ['alarm', 'Fire Alarm'],
    ['other', 'Other Equipment'],
  ],
  fireEquipmentStatus: [
    ['ok', 'Serviceable'],
    ['due', 'Service Due'],
    ['expired', 'Expired'],
    ['defective', 'Defective'],
  ],
  drillTypes: [
    ['fire', 'Fire Drill'],
    ['evacuation', 'Evacuation Drill'],
    ['chemical_spill', 'Chemical Spill Drill'],
    ['earthquake', 'Earthquake Drill'],
    ['mock_drill', 'Mock Drill'],
  ],
  drillStatus: [
    ['planned', 'Planned'],
    ['completed', 'Completed'],
    ['cancelled', 'Cancelled'],
  ],
  actionStatus: [
    ['open', 'Open'],
    ['in_progress', 'In Progress'],
    ['completed', 'Completed'],
    ['verified', 'Verified'],
    ['closed', 'Closed'],
  ],
  priority: [
    ['low', 'Low'],
    ['medium', 'Medium'],
    ['high', 'High'],
    ['critical', 'Critical'],
  ],
  sourceTypes: [
    ['incident', 'Incident'],
    ['inspection', 'Inspection'],
    ['hazard', 'Hazard'],
    ['permit', 'Permit'],
    ['training', 'Training'],
    ['environmental', 'Environmental'],
    ['other', 'Other'],
  ],
  envTypes: [
    ['waste', 'Waste Management'],
    ['water', 'Water Consumption'],
    ['energy', 'Energy Consumption'],
    ['chemical', 'Chemical Handling'],
    ['spill', 'Spill Report'],
    ['inspection', 'Environmental Inspection'],
  ],
  envStatus: [
    ['recorded', 'Recorded'],
    ['in_progress', 'In Progress'],
    ['disposed', 'Disposed / Closed'],
    ['reported', 'Reported'],
  ],
  documentCategories: [
    ['policy', 'Safety Policy'],
    ['sop', 'SOP'],
    ['risk_assessment', 'Risk Assessment'],
    ['method_statement', 'Method Statement'],
    ['checklist', 'Inspection Checklist'],
    ['inspection_photo', 'Inspection Photograph'],
    ['incident_photo', 'Incident Photograph'],
    ['evidence', 'Corrective Action Evidence'],
    ['training', 'Training Material'],
    ['other', 'Other'],
  ],
  employeeStatus: [
    ['active', 'Active'],
    ['on_leave', 'On Leave'],
    ['inactive', 'Inactive'],
  ],
  inductionStatus: [
    ['pending', 'Pending'],
    ['completed', 'Completed'],
    ['expired', 'Expired'],
  ],
  medicalFitness: [
    ['fit', 'Fit'],
    ['fit_with_restrictions', 'Fit with Restrictions'],
    ['unfit', 'Unfit'],
    ['pending', 'Pending Examination'],
  ],
};

const opt = (list) => list.map(([value]) => value);
const field = (name, label, type = 'text', extra = {}) => ({ name, label, type, ...extra });
const auditFields = [
  { name: 'created_by', label: 'Created By', type: 'text', readOnly: true, serverOnly: true },
];

export function riskLevelFor(score) {
  if (score >= 16) return 'critical';
  if (score >= 10) return 'high';
  if (score >= 5) return 'medium';
  return 'low';
}

function daysUntil(date) {
  if (!date) return null;
  const target = new Date(`${String(date).slice(0, 10)}T00:00:00Z`).getTime();
  if (Number.isNaN(target)) return null;
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`).getTime();
  return Math.round((target - today) / 86400000);
}

/* ---------------------------------------------------------------- modules */

export const MODULES = [
  {
    name: 'employees',
    label: 'Employees',
    singular: 'Employee',
    table: 'employees',
    numberField: null,
    searchFields: ['full_name', 'employee_code', 'department', 'designation', 'contact'],
    filterFields: ['department', 'status', 'induction_status'],
    fields: [
      field('employee_code', 'Employee ID', 'text', { required: true, maxLength: 40 }),
      field('full_name', 'Full Name', 'text', { required: true, maxLength: 120 }),
      field('department', 'Department', 'text', { required: true, maxLength: 80 }),
      field('designation', 'Designation', 'text', { maxLength: 80 }),
      field('contact', 'Contact Number', 'text', { maxLength: 40 }),
      field('email', 'Email', 'email'),
      field('blood_group', 'Blood Group', 'text', { maxLength: 8 }),
      field('join_date', 'Joining Date', 'date'),
      field('induction_status', 'Safety Induction', 'enum', { options: opt(ENUMS.inductionStatus), default: 'pending' }),
      field('induction_date', 'Induction Date', 'date'),
      field('medical_fitness', 'Medical Fitness', 'enum', { options: opt(ENUMS.medicalFitness), default: 'pending' }),
      field('fitness_expiry', 'Fitness Valid Until', 'date'),
      field('status', 'Status', 'enum', { options: opt(ENUMS.employeeStatus), default: 'active' }),
      ...auditFields,
    ],
    transformRow(row, user) {
      const allowed = ['super_admin', 'admin', 'hse_manager'].includes(user?.role);
      const out = { ...row };
      if (!allowed) {
        out.medical_fitness = 'restricted';
        out.fitness_expiry = null;
      }
      out.medical_restricted = !allowed;
      out.fitness_days_left = daysUntil(row.fitness_expiry);
      return out;
    },
  },
  {
    name: 'incidents',
    label: 'Incidents',
    singular: 'Incident',
    table: 'incidents',
    numberField: 'incident_no',
    numberPrefix: 'INC',
    searchFields: ['incident_no', 'description', 'department', 'location', 'reported_by'],
    filterFields: ['type', 'severity', 'status', 'department'],
    dateField: 'occurred_at',
    defaultSort: 'occurred_at',
    fields: [
      field('type', 'Incident Type', 'enum', { required: true, options: opt(ENUMS.incidentTypes) }),
      field('occurred_at', 'Date & Time of Incident', 'datetime', { required: true }),
      field('department', 'Department', 'text', { required: true, maxLength: 80 }),
      field('location', 'Location / Area', 'text', { maxLength: 120 }),
      field('employee_id', 'Involved Employee', 'text', { maxLength: 60 }),
      field('severity', 'Severity', 'enum', { options: opt(ENUMS.severity), default: 'minor' }),
      field('description', 'What Happened', 'textarea', { required: true, maxLength: 4000 }),
      field('immediate_action', 'Immediate Action Taken', 'textarea', { maxLength: 3000 }),
      field('root_cause', 'Root Cause Analysis', 'textarea', { maxLength: 4000 }),
      field('investigation', 'Investigation Findings', 'textarea', { maxLength: 6000 }),
      field('lost_days', 'Lost Days', 'integer', { min: 0, max: 3650, default: 0 }),
      field('photo_id', 'Photograph', 'text', { maxLength: 60 }),
      field('status', 'Status', 'enum', { options: opt(ENUMS.incidentStatus), default: 'open' }),
      field('reported_by', 'Reported By', 'text', { maxLength: 120 }),
      ...auditFields,
    ],
    beforeWrite({ record, req, mode }) {
      if (mode === 'create' && !record.reported_by) record.reported_by = req.user.full_name || req.user.username;
      if (record.type === 'lti' && !record.lost_days) record.lost_days = 1;
      if (record.type === 'near_miss' && record.severity === 'critical') record.severity = 'serious';
    },
    transformRow(row) {
      return { ...row, days_open: row.status === 'closed' ? 0 : Math.max(0, -(daysUntil(row.occurred_at) ?? 0)) };
    },
  },
  {
    name: 'inspections',
    label: 'Safety Inspections',
    singular: 'Inspection',
    table: 'inspections',
    numberField: 'inspection_no',
    numberPrefix: 'INS',
    searchFields: ['inspection_no', 'location', 'department', 'inspector', 'findings'],
    filterFields: ['type', 'status', 'department'],
    dateField: 'inspection_date',
    defaultSort: 'inspection_date',
    fields: [
      field('type', 'Inspection Type', 'enum', { required: true, options: opt(ENUMS.inspectionTypes) }),
      field('inspection_date', 'Inspection Date', 'date', { required: true }),
      field('department', 'Department', 'text', { required: true, maxLength: 80 }),
      field('location', 'Location / Area', 'text', { maxLength: 120 }),
      field('inspector', 'Inspected By', 'text', { maxLength: 120 }),
      field('score', 'Score (%)', 'number', { min: 0, max: 100 }),
      field('max_score', 'Maximum Score', 'number', { min: 0, max: 1000, default: 100 }),
      field('checklist', 'Checklist Results', 'json'),
      field('findings', 'Findings & Observations', 'textarea', { maxLength: 6000 }),
      field('photo_id', 'Inspection Photograph', 'text', { maxLength: 60 }),
      field('status', 'Status', 'enum', { options: opt(ENUMS.inspectionStatus), default: 'open' }),
      ...auditFields,
    ],
    beforeWrite({ record, req, mode }) {
      if (mode === 'create' && !record.inspector) record.inspector = req.user.full_name || req.user.username;
      const checklist = Array.isArray(record.checklist) ? record.checklist : [];
      if (checklist.length) {
        const passed = checklist.filter((item) => item && (item.result === 'pass' || item.result === true)).length;
        record.score = Math.round((passed / checklist.length) * 1000) / 10;
        record.max_score = 100;
      }
    },
    transformRow(row) {
      const score = row.score === null || row.score === undefined ? null : Number(row.score);
      let rating = 'not_scored';
      if (score !== null) {
        if (score >= 90) rating = 'excellent';
        else if (score >= 75) rating = 'good';
        else if (score >= 60) rating = 'fair';
        else rating = 'poor';
      }
      return { ...row, rating };
    },
  },
  {
    name: 'hazards',
    label: 'Hazards & Risk',
    singular: 'Hazard',
    table: 'hazards',
    numberField: 'hazard_no',
    numberPrefix: 'HAZ',
    searchFields: ['hazard_no', 'title', 'department', 'location', 'owner', 'controls'],
    filterFields: ['category', 'risk_level', 'status', 'department'],
    defaultSort: 'risk_score',
    defaultDir: 'desc',
    fields: [
      field('title', 'Hazard Description', 'text', { required: true, maxLength: 200 }),
      field('category', 'Category', 'enum', { options: opt(ENUMS.hazardCategories), default: 'physical' }),
      field('department', 'Department', 'text', { required: true, maxLength: 80 }),
      field('location', 'Location / Area', 'text', { maxLength: 120 }),
      field('likelihood', 'Likelihood (1-5)', 'integer', { required: true, min: 1, max: 5, default: 3 }),
      field('severity', 'Severity (1-5)', 'integer', { required: true, min: 1, max: 5, default: 3 }),
      field('controls', 'Existing / Proposed Controls', 'textarea', { maxLength: 4000 }),
      field('control_hierarchy', 'Hierarchy of Control', 'enum', { options: opt(ENUMS.hierarchy), default: 'engineering' }),
      field('owner', 'Risk Owner', 'text', { maxLength: 120 }),
      field('target_date', 'Target Completion Date', 'date'),
      field('status', 'Status', 'enum', { options: opt(ENUMS.hazardStatus), default: 'open' }),
      field('verification', 'Closure Verification', 'textarea', { maxLength: 3000 }),
      ...auditFields,
    ],
    beforeWrite({ record, req, mode }) {
      const likelihood = Number(record.likelihood || 1);
      const severity = Number(record.severity || 1);
      record.risk_score = likelihood * severity;
      record.risk_level = riskLevelFor(record.risk_score);
      if (record.status === 'verified') {
        record.verified_by = req.user.username;
        record.verified_at = nowIso();
      }
    },
    transformRow(row) {
      return {
        ...row,
        risk_score: Number(row.risk_score || 0),
        risk_level: row.risk_level || riskLevelFor(Number(row.risk_score || 0)),
        target_overdue:
          row.target_date && !['verified', 'controlled'].includes(row.status)
            ? (daysUntil(row.target_date) ?? 0) < 0
            : false,
      };
    },
  },
  {
    name: 'permits',
    label: 'Permit to Work',
    singular: 'Permit',
    table: 'permits',
    numberField: 'permit_no',
    numberPrefix: 'PTW',
    searchFields: ['permit_no', 'work_description', 'department', 'location', 'requested_by', 'contractor'],
    filterFields: ['type', 'status', 'department'],
    dateField: 'start_at',
    defaultSort: 'start_at',
    fields: [
      field('type', 'Permit Type', 'enum', { required: true, options: opt(ENUMS.permitTypes) }),
      field('department', 'Department', 'text', { required: true, maxLength: 80 }),
      field('location', 'Work Location', 'text', { maxLength: 120 }),
      field('work_description', 'Work Description', 'textarea', { required: true, maxLength: 3000 }),
      field('requested_by', 'Requested By', 'text', { maxLength: 120 }),
      field('contractor', 'Contractor / Agency', 'text', { maxLength: 120 }),
      field('start_at', 'Valid From', 'datetime', { required: true }),
      field('end_at', 'Valid Until', 'datetime', { required: true }),
      field('precautions', 'Safety Precautions / Isolation', 'textarea', { maxLength: 3000 }),
      field('status', 'Status', 'enum', { options: opt(ENUMS.permitStatus), default: 'pending' }),
      field('approval_note', 'Approval / Rejection Note', 'textarea', { maxLength: 1000 }),
      ...auditFields,
    ],
    beforeWrite({ record, req, mode }) {
      if (mode === 'create' && !record.requested_by) record.requested_by = req.user.full_name || req.user.username;
      if (record.start_at && record.end_at && new Date(record.end_at) <= new Date(record.start_at)) {
        throw new Error('Permit validity end must be after the start.');
      }
      if (record.status === 'approved' || record.status === 'rejected') {
        if (!['super_admin', 'admin', 'hse_manager', 'safety_officer'].includes(req.user.role)) {
          throw new Error('Only HSE managers or safety officers can approve permits.');
        }
        record.approved_by = req.user.username;
        record.approved_at = nowIso();
      }
      if (record.status === 'closed') record.closed_at = nowIso();
    },
    transformRow(row) {
      const remaining = row.end_at ? new Date(row.end_at).getTime() - Date.now() : null;
      return {
        ...row,
        hours_left: remaining === null ? null : Math.round(remaining / 3600000),
        expiring_soon:
          ['approved', 'active'].includes(row.status) && remaining !== null && remaining > 0 && remaining < 72 * 3600000,
        is_expired: ['approved', 'active'].includes(row.status) && remaining !== null && remaining <= 0,
      };
    },
  },
  {
    name: 'ppe-items',
    label: 'PPE Stock',
    singular: 'PPE Item',
    table: 'ppe_items',
    searchFields: ['name', 'category', 'size'],
    filterFields: ['category'],
    fields: [
      field('name', 'PPE Name', 'text', { required: true, maxLength: 120 }),
      field('category', 'Category', 'enum', { required: true, options: opt(ENUMS.ppeCategories) }),
      field('size', 'Size', 'text', { maxLength: 40 }),
      field('unit', 'Unit', 'text', { maxLength: 20, default: 'pcs' }),
      field('stock', 'Stock Quantity', 'integer', { min: 0, max: 1000000, default: 0 }),
      field('min_stock', 'Minimum Stock', 'integer', { min: 0, max: 1000000, default: 0 }),
      ...auditFields,
    ],
    transformRow(row) {
      return { ...row, low_stock: Number(row.stock || 0) <= Number(row.min_stock || 0) };
    },
  },
  {
    name: 'ppe-issues',
    label: 'PPE Issue Register',
    singular: 'PPE Issue',
    table: 'ppe_issues',
    searchFields: ['employee_name', 'item_name', 'notes'],
    filterFields: ['status', 'item_id'],
    dateField: 'issue_date',
    defaultSort: 'issue_date',
    fields: [
      field('employee_id', 'Employee', 'text', { required: true, maxLength: 60 }),
      field('item_id', 'PPE Item', 'text', { required: true, maxLength: 60 }),
      field('quantity', 'Quantity', 'integer', { min: 1, max: 10000, default: 1 }),
      field('issue_date', 'Issue Date', 'date', { required: true }),
      field('replacement_date', 'Next Replacement Due', 'date'),
      field('condition', 'Condition', 'text', { maxLength: 60 }),
      field('notes', 'Notes', 'text', { maxLength: 500 }),
      field('status', 'Status', 'enum', { options: opt(ENUMS.ppeIssueStatus), default: 'issued' }),
      ...auditFields,
    ],
    async beforeWrite({ record, mode }) {
      if (record.employee_id) {
        const employee = await get('SELECT full_name FROM employees WHERE id = ?', [record.employee_id]);
        record.employee_name = employee?.full_name || null;
      }
      if (record.item_id) {
        const item = await get('SELECT name FROM ppe_items WHERE id = ?', [record.item_id]);
        record.item_name = item?.name || null;
        if (mode === 'create' && item) {
          const { run } = await import('./db.js');
          await run('UPDATE ppe_items SET stock = MAX(0, stock - ?), updated_at = ? WHERE id = ?', [
            Number(record.quantity || 1),
            nowIso(),
            record.item_id,
          ]);
        }
      }
    },
    transformRow(row) {
      return { ...row, replacement_due: row.replacement_date ? (daysUntil(row.replacement_date) ?? 0) <= 0 : false };
    },
  },
  {
    name: 'trainings',
    label: 'Training & Toolbox Talks',
    singular: 'Training',
    table: 'trainings',
    searchFields: ['title', 'trainer', 'department', 'location'],
    filterFields: ['type', 'status', 'department'],
    dateField: 'training_date',
    defaultSort: 'training_date',
    fields: [
      field('title', 'Training / Talk Title', 'text', { required: true, maxLength: 200 }),
      field('type', 'Type', 'enum', { required: true, options: opt(ENUMS.trainingTypes) }),
      field('training_date', 'Date', 'date', { required: true }),
      field('department', 'Department', 'text', { maxLength: 80 }),
      field('trainer', 'Trainer / Presenter', 'text', { maxLength: 120 }),
      field('duration_hours', 'Duration (hours)', 'number', { min: 0, max: 100 }),
      field('location', 'Venue', 'text', { maxLength: 120 }),
      field('expiry_date', 'Valid Until', 'date'),
      field('description', 'Content / Topics Covered', 'textarea', { maxLength: 4000 }),
      field('status', 'Status', 'enum', { options: opt(ENUMS.trainingStatus), default: 'planned' }),
      ...auditFields,
    ],
    transformRow(row) {
      const left = daysUntil(row.expiry_date);
      return {
        ...row,
        expiry_days_left: left,
        expiring_soon: left !== null && left >= 0 && left <= 30,
        expired: left !== null && left < 0,
      };
    },
  },
  {
    name: 'fire-equipment',
    label: 'Fire & Emergency Equipment',
    singular: 'Equipment',
    table: 'fire_equipment',
    searchFields: ['tag_no', 'location', 'department', 'equipment_type'],
    filterFields: ['equipment_type', 'status', 'department'],
    dateField: 'inspection_date',
    defaultSort: 'next_due',
    defaultDir: 'asc',
    fields: [
      field('equipment_type', 'Equipment Type', 'enum', { required: true, options: opt(ENUMS.fireEquipmentTypes) }),
      field('tag_no', 'Tag / ID Number', 'text', { maxLength: 60 }),
      field('location', 'Location', 'text', { required: true, maxLength: 120 }),
      field('department', 'Department', 'text', { maxLength: 80 }),
      field('capacity', 'Capacity / Specification', 'text', { maxLength: 80 }),
      field('inspection_date', 'Last Inspection', 'date'),
      field('next_due', 'Next Inspection Due', 'date'),
      field('status', 'Status', 'enum', { options: opt(ENUMS.fireEquipmentStatus), default: 'ok' }),
      field('remarks', 'Remarks', 'text', { maxLength: 500 }),
      ...auditFields,
    ],
    transformRow(row) {
      const left = daysUntil(row.next_due);
      return { ...row, due_days_left: left, due_soon: left !== null && left <= 30 };
    },
  },
  {
    name: 'drills',
    label: 'Emergency Drills',
    singular: 'Drill',
    table: 'drills',
    searchFields: ['title', 'assembly_point', 'observations'],
    filterFields: ['drill_type', 'status'],
    dateField: 'scheduled_at',
    defaultSort: 'scheduled_at',
    fields: [
      field('title', 'Drill Title', 'text', { required: true, maxLength: 200 }),
      field('drill_type', 'Drill Type', 'enum', { required: true, options: opt(ENUMS.drillTypes) }),
      field('scheduled_at', 'Scheduled Date', 'date', { required: true }),
      field('conducted_at', 'Conducted Date', 'date'),
      field('participants', 'Participants', 'integer', { min: 0, max: 100000, default: 0 }),
      field('assembly_point', 'Assembly Point', 'text', { maxLength: 120 }),
      field('evacuation_time_min', 'Evacuation Time (minutes)', 'number', { min: 0, max: 600 }),
      field('observations', 'Observations & Learnings', 'textarea', { maxLength: 4000 }),
      field('status', 'Status', 'enum', { options: opt(ENUMS.drillStatus), default: 'planned' }),
      ...auditFields,
    ],
  },
  {
    name: 'emergency-contacts',
    label: 'Emergency Contacts',
    singular: 'Contact',
    table: 'emergency_contacts',
    searchFields: ['name', 'role', 'department', 'phone'],
    filterFields: ['department'],
    fields: [
      field('name', 'Name', 'text', { required: true, maxLength: 120 }),
      field('role', 'Role / Responsibility', 'text', { maxLength: 120 }),
      field('department', 'Department', 'text', { maxLength: 80 }),
      field('phone', 'Primary Phone', 'text', { required: true, maxLength: 40 }),
      field('alternate_phone', 'Alternate Phone', 'text', { maxLength: 40 }),
      field('email', 'Email', 'email'),
      ...auditFields,
    ],
  },
  {
    name: 'actions',
    label: 'Corrective Actions',
    singular: 'Corrective Action',
    table: 'actions',
    numberField: 'action_no',
    numberPrefix: 'CA',
    searchFields: ['action_no', 'finding', 'responsible_person', 'department', 'action_taken'],
    filterFields: ['status', 'priority', 'department', 'source_type'],
    dateField: 'target_date',
    defaultSort: 'target_date',
    defaultDir: 'asc',
    fields: [
      field('finding', 'Finding / Non-conformance', 'textarea', { required: true, maxLength: 3000 }),
      field('source_type', 'Source', 'enum', { options: opt(ENUMS.sourceTypes), default: 'other' }),
      field('source_id', 'Source Record ID', 'text', { maxLength: 60 }),
      field('responsible_person', 'Responsible Person', 'text', { required: true, maxLength: 120 }),
      field('department', 'Department', 'text', { required: true, maxLength: 80 }),
      field('priority', 'Priority', 'enum', { required: true, options: opt(ENUMS.priority), default: 'medium' }),
      field('target_date', 'Target Date', 'date', { required: true }),
      field('action_taken', 'Action Taken', 'textarea', { maxLength: 4000 }),
      field('evidence_id', 'Evidence Photograph', 'text', { maxLength: 60 }),
      field('status', 'Status', 'enum', { options: opt(ENUMS.actionStatus), default: 'open' }),
      field('verification_note', 'Verification Note', 'textarea', { maxLength: 2000 }),
      ...auditFields,
    ],
    beforeWrite({ record, req, mode }) {
      if (['verified', 'closed'].includes(record.status)) {
        record.verified_by = req.user.username;
        record.verified_at = nowIso();
        record.closed_at = record.closed_at || nowIso();
      } else if (mode === 'update') {
        record.closed_at = null;
      }
    },
    transformRow(row) {
      const left = daysUntil(row.target_date);
      const open = !['verified', 'closed'].includes(row.status);
      return {
        ...row,
        days_left: left,
        overdue: open && left !== null && left < 0,
        is_open: open,
      };
    },
  },
  {
    name: 'environmental',
    label: 'Environmental Records',
    singular: 'Environmental Record',
    table: 'env_records',
    searchFields: ['description', 'department', 'location', 'vendor'],
    filterFields: ['record_type', 'status', 'department'],
    dateField: 'record_date',
    defaultSort: 'record_date',
    fields: [
      field('record_type', 'Record Type', 'enum', { required: true, options: opt(ENUMS.envTypes) }),
      field('record_date', 'Date', 'date', { required: true }),
      field('department', 'Department', 'text', { maxLength: 80 }),
      field('location', 'Location', 'text', { maxLength: 120 }),
      field('quantity', 'Quantity', 'number', { min: 0, max: 100000000 }),
      field('unit', 'Unit', 'text', { maxLength: 30 }),
      field('description', 'Description', 'textarea', { maxLength: 3000 }),
      field('disposal_method', 'Disposal Method / Handling', 'text', { maxLength: 200 }),
      field('vendor', 'Vendor / Contractor', 'text', { maxLength: 120 }),
      field('status', 'Status', 'enum', { options: opt(ENUMS.envStatus), default: 'recorded' }),
      ...auditFields,
    ],
  },
  {
    name: 'man-hours',
    label: 'Man Hours',
    singular: 'Man Hours Entry',
    table: 'man_hours',
    searchFields: ['month', 'department', 'notes'],
    filterFields: ['department', 'month'],
    dateField: 'created_at',
    fields: [
      field('month', 'Month (YYYY-MM)', 'text', { required: true, maxLength: 7 }),
      field('department', 'Department', 'text', { maxLength: 80 }),
      field('hours', 'Man Hours Worked', 'number', { required: true, min: 0, max: 100000000 }),
      field('notes', 'Notes', 'text', { maxLength: 300 }),
      ...auditFields,
    ],
  },
];

export const MODULE_MAP = new Map(MODULES.map((m) => [m.name, m]));

export function moduleConfigForClient() {
  return MODULES.map((m) => ({
    name: m.name,
    label: m.label,
    singular: m.singular,
    fields: m.fields.filter((f) => !f.serverOnly).map((f) => ({
      name: f.name,
      label: f.label,
      type: f.type,
      required: Boolean(f.required),
      options: f.options || null,
      min: f.min,
      max: f.max,
      maxLength: f.maxLength,
      default: f.default,
      readOnly: Boolean(f.readOnly),
    })),
    searchFields: m.searchFields,
    filterFields: m.filterFields,
    dateField: m.dateField || 'created_at',
  }));
}

export function seedReferenceData() {
  return async function seed() {
    const { get, run } = await import('./db.js');
    const now = nowIso();
    const departments = [
      ['Production', 'PRD', 'Plant A'],
      ['Maintenance', 'MNT', 'Plant A'],
      ['Electrical', 'ELE', 'Plant A'],
      ['Warehouse', 'WHS', 'Store Yard'],
      ['Logistics', 'LOG', 'Gate Complex'],
      ['Quality', 'QLT', 'Lab Block'],
      ['Utilities', 'UTL', 'Utility Block'],
      ['Administration', 'ADM', 'Head Office'],
      ['HSE', 'HSE', 'HSE Cell'],
    ];
    for (const [name, code, location] of departments) {
      const existing = await get('SELECT id FROM departments WHERE name = ?', [name]);
      if (!existing) {
        await run('INSERT INTO departments (id, name, code, head, location, created_at, updated_at) VALUES (?,?,?,?,?,?,?)', [
          newId(),
          name,
          code,
          null,
          location,
          now,
          now,
        ]);
      }
    }
    const locations = [
      ['Plant A - Shop Floor', 'Production'],
      ['Plant A - Utility Block', 'Utility'],
      ['Warehouse & Store Yard', 'Storage'],
      ['Head Office', 'Office'],
      ['Dispatch & Gate Complex', 'Logistics'],
    ];
    for (const [name, type] of locations) {
      const existing = await get('SELECT id FROM locations WHERE name = ?', [name]);
      if (!existing) {
        await run('INSERT INTO locations (id, name, type, address, created_at, updated_at) VALUES (?,?,?,?,?,?)', [
          newId(),
          name,
          type,
          null,
          now,
          now,
        ]);
      }
    }
    const defaults = [
      ['company_name', process.env.COMPANY_NAME || 'Surya Industrial Works'],
      ['company_address', 'Industrial Estate, Plant A'],
      ['prepared_by', 'HSE Department'],
      ['reviewed_by', 'Plant Head'],
      ['registration_approval', 'on'],
      ['trir_base_hours', '200000'],
      ['ltifr_base_hours', '1000000'],
      ['report_signatory', 'Head - HSE'],
    ];
    for (const [key, value] of defaults) {
      const existing = await get('SELECT key FROM settings WHERE key = ?', [key]);
      if (!existing) {
        await run('INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?,?,?,?)', [key, value, now, null]);
      }
    }
  };
}
