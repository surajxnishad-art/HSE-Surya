/**
 * Portable schema. Every identifier is TEXT, every timestamp is an ISO-8601
 * string and booleans are INTEGER 0/1, so the same DDL runs on SQLite and
 * PostgreSQL (Supabase) unchanged.
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  department TEXT,
  designation TEXT,
  employee_code TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  must_change_password INTEGER NOT NULL DEFAULT 0,
  approved_by TEXT,
  approved_at TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS password_resets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  username TEXT,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  requested_at TEXT NOT NULL,
  used_at TEXT
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  username TEXT,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  details TEXT,
  ip TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT,
  head TEXT,
  location TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT,
  address TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  role TEXT,
  title TEXT NOT NULL,
  message TEXT,
  type TEXT,
  link TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  employee_code TEXT,
  full_name TEXT NOT NULL,
  department TEXT,
  designation TEXT,
  contact TEXT,
  email TEXT,
  blood_group TEXT,
  join_date TEXT,
  induction_status TEXT,
  induction_date TEXT,
  medical_fitness TEXT,
  fitness_expiry TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY,
  incident_no TEXT,
  type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  department TEXT,
  location TEXT,
  employee_id TEXT,
  severity TEXT,
  description TEXT,
  immediate_action TEXT,
  root_cause TEXT,
  investigation TEXT,
  lost_days INTEGER NOT NULL DEFAULT 0,
  photo_id TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  reported_by TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inspections (
  id TEXT PRIMARY KEY,
  inspection_no TEXT,
  type TEXT NOT NULL,
  department TEXT,
  location TEXT,
  inspection_date TEXT NOT NULL,
  inspector TEXT,
  score REAL,
  max_score REAL,
  findings TEXT,
  checklist TEXT,
  photo_id TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS hazards (
  id TEXT PRIMARY KEY,
  hazard_no TEXT,
  title TEXT NOT NULL,
  category TEXT,
  department TEXT,
  location TEXT,
  likelihood INTEGER NOT NULL DEFAULT 1,
  severity INTEGER NOT NULL DEFAULT 1,
  risk_score INTEGER NOT NULL DEFAULT 1,
  risk_level TEXT,
  controls TEXT,
  control_hierarchy TEXT,
  owner TEXT,
  target_date TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  verification TEXT,
  verified_by TEXT,
  verified_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS permits (
  id TEXT PRIMARY KEY,
  permit_no TEXT,
  type TEXT NOT NULL,
  department TEXT,
  location TEXT,
  work_description TEXT,
  requested_by TEXT,
  contractor TEXT,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  precautions TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  approved_by TEXT,
  approved_at TEXT,
  approval_note TEXT,
  closed_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ppe_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  size TEXT,
  unit TEXT DEFAULT 'pcs',
  stock INTEGER NOT NULL DEFAULT 0,
  min_stock INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ppe_issues (
  id TEXT PRIMARY KEY,
  employee_id TEXT,
  item_id TEXT,
  employee_name TEXT,
  item_name TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  issue_date TEXT NOT NULL,
  replacement_date TEXT,
  condition TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'issued',
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trainings (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT,
  department TEXT,
  trainer TEXT,
  training_date TEXT NOT NULL,
  expiry_date TEXT,
  duration_hours REAL,
  location TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS training_attendance (
  id TEXT PRIMARY KEY,
  training_id TEXT NOT NULL,
  employee_id TEXT,
  employee_name TEXT,
  attended INTEGER NOT NULL DEFAULT 1,
  score REAL,
  competency TEXT,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fire_equipment (
  id TEXT PRIMARY KEY,
  equipment_type TEXT NOT NULL,
  tag_no TEXT,
  location TEXT,
  department TEXT,
  capacity TEXT,
  inspection_date TEXT,
  next_due TEXT,
  status TEXT NOT NULL DEFAULT 'ok',
  remarks TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS drills (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  drill_type TEXT,
  scheduled_at TEXT,
  conducted_at TEXT,
  participants INTEGER NOT NULL DEFAULT 0,
  assembly_point TEXT,
  evacuation_time_min REAL,
  observations TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS emergency_contacts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT,
  department TEXT,
  phone TEXT,
  alternate_phone TEXT,
  email TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS actions (
  id TEXT PRIMARY KEY,
  action_no TEXT,
  source_type TEXT,
  source_id TEXT,
  finding TEXT NOT NULL,
  responsible_person TEXT,
  department TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  target_date TEXT,
  action_taken TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  evidence_id TEXT,
  verified_by TEXT,
  verified_at TEXT,
  verification_note TEXT,
  closed_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS env_records (
  id TEXT PRIMARY KEY,
  record_type TEXT NOT NULL,
  department TEXT,
  location TEXT,
  record_date TEXT NOT NULL,
  quantity REAL,
  unit TEXT,
  description TEXT,
  disposal_method TEXT,
  vendor TEXT,
  status TEXT NOT NULL DEFAULT 'recorded',
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT,
  doc_type TEXT,
  version TEXT DEFAULT '1.0',
  description TEXT,
  file_name TEXT,
  mime_type TEXT,
  file_size INTEGER,
  file_data TEXT,
  review_date TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  uploaded_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS document_revisions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  version TEXT,
  file_name TEXT,
  mime_type TEXT,
  file_size INTEGER,
  file_data TEXT,
  notes TEXT,
  uploaded_by TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS man_hours (
  id TEXT PRIMARY KEY,
  month TEXT NOT NULL,
  department TEXT,
  hours REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions (token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_incidents_created ON incidents (created_at);
CREATE INDEX IF NOT EXISTS idx_incidents_dept ON incidents (department);
CREATE INDEX IF NOT EXISTS idx_inspections_date ON inspections (inspection_date);
CREATE INDEX IF NOT EXISTS idx_hazards_status ON hazards (status);
CREATE INDEX IF NOT EXISTS idx_permits_status ON permits (status);
CREATE INDEX IF NOT EXISTS idx_actions_status ON actions (status);
CREATE INDEX IF NOT EXISTS idx_actions_target ON actions (target_date);
CREATE INDEX IF NOT EXISTS idx_trainings_date ON trainings (training_date);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_documents_category ON documents (category);
CREATE INDEX IF NOT EXISTS idx_employees_dept ON employees (department);
CREATE INDEX IF NOT EXISTS idx_env_date ON env_records (record_date);
`;
