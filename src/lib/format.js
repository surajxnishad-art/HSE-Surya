const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(String(value).length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${String(date.getUTCDate()).padStart(2, '0')} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${formatDate(value)} · ${hh}:${mm}`;
}

export function monthLabel(ym) {
  if (!ym) return '';
  const [year, month] = String(ym).split('-');
  const index = Number(month) - 1;
  return MONTHS[index] ? `${MONTHS[index]} ${String(year).slice(2)}` : ym;
}

export function formatNumber(value, digits = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  return number.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatDecimal(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0.00';
  return number.toFixed(digits);
}

export function titleCase(value) {
  if (!value) return '—';
  return String(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function initials(name) {
  if (!name) return '?';
  return String(name)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

export function relativeTime(value) {
  if (!value) return '';
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(value);
}

export function daysUntil(value) {
  if (!value) return null;
  const target = new Date(`${String(value).slice(0, 10)}T00:00:00Z`).getTime();
  if (Number.isNaN(target)) return null;
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`).getTime();
  return Math.round((target - today) / 86400000);
}

const BADGE_BY_VALUE = {
  open: 'amber',
  in_progress: 'blue',
  pending: 'amber',
  pending_approval: 'amber',
  approved: 'blue',
  active: 'green',
  completed: 'green',
  closed: 'green',
  verified: 'green',
  controlled: 'teal',
  rejected: 'red',
  cancelled: 'grey',
  expired: 'red',
  overdue: 'red',
  critical: 'red',
  high: 'orange',
  medium: 'amber',
  low: 'green',
  major: 'orange',
  minor: 'amber',
  moderate: 'amber',
  catastrophic: 'red',
  near_miss: 'violet',
  lti: 'red',
  first_aid: 'teal',
  medical_treatment: 'orange',
  accident: 'red',
  property_damage: 'amber',
  fire: 'red',
  environmental: 'teal',
  restricted: 'red',
  fit: 'green',
  unfit: 'red',
  fit_with_restrictions: 'amber',
  competent: 'green',
  not_competent: 'red',
  inactive: 'grey',
  suspended: 'red',
  superseded: 'grey',
  archived: 'grey',
  recorded: 'blue',
  disposed: 'green',
  scheduled: 'blue',
  planned: 'blue',
  valid: 'green',
};

export function badgeTone(value) {
  return BADGE_BY_VALUE[String(value || '').toLowerCase()] || 'grey';
}

export function downloadBlobFallback() {
  return null;
}
