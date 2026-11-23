import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, queryString } from '../lib/api.js';
import { formatDateTime, relativeTime, titleCase } from '../lib/format.js';
import {
  Alert,
  Badge,
  ConfirmDialog,
  EmptyState,
  Field,
  LoadingScreen,
  Modal,
  PageHeader,
  Pagination,
  SectionCard,
  Spinner,
  StatCard,
  useDebounced,
  useToast,
} from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const TABS = [
  { key: 'users', label: 'Users & approvals', icon: 'users' },
  { key: 'departments', label: 'Departments', icon: 'building' },
  { key: 'locations', label: 'Locations', icon: 'pin' },
  { key: 'settings', label: 'System settings', icon: 'settings' },
  { key: 'audit', label: 'Audit log', icon: 'history' },
];

const STATUSES = ['pending', 'active', 'inactive', 'rejected'];

const SETTING_FIELDS = [
  { key: 'company_name', label: 'Company name', type: 'text' },
  { key: 'company_address', label: 'Company address', type: 'text' },
  { key: 'prepared_by', label: 'Default prepared by', type: 'text' },
  { key: 'reviewed_by', label: 'Default reviewed by', type: 'text' },
  { key: 'report_signatory', label: 'Report signatory', type: 'text' },
  { key: 'registration_approval', label: 'Registration approval', type: 'select', options: ['required', 'auto'] },
  { key: 'trir_base_hours', label: 'TRIR base hours', type: 'number' },
  { key: 'ltifr_base_hours', label: 'LTIFR base hours', type: 'number' },
];

function UserEditor({ user, roles, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    full_name: user.full_name || '',
    role: user.role,
    status: user.status,
    department: user.department || '',
    designation: user.designation || '',
    employee_code: user.employee_code || '',
    phone: user.phone || '',
    email: user.email || '',
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const payload = await api.patch(`/admin/users/${user.id}`, form);
      toast.success(payload.message || 'User updated.');
      onSaved(payload.user);
    } catch (err) {
      setErrors(err.fields || {});
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="stack" onSubmit={save}>
      <div className="form-grid">
        <Field label="Full name" required error={errors.full_name}>
          <input
            className="input"
            value={form.full_name}
            onChange={(event) => setForm({ ...form, full_name: event.target.value })}
            required
            minLength={3}
          />
        </Field>
        <Field label="Role" required error={errors.role}>
          <select className="select" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
            {roles.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Account status" required error={errors.status}>
          <select className="select" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {titleCase(status)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Department" error={errors.department}>
          <input
            className="input"
            value={form.department}
            onChange={(event) => setForm({ ...form, department: event.target.value })}
          />
        </Field>
        <Field label="Designation" error={errors.designation}>
          <input
            className="input"
            value={form.designation}
            onChange={(event) => setForm({ ...form, designation: event.target.value })}
          />
        </Field>
        <Field label="Employee ID" error={errors.employee_code}>
          <input
            className="input"
            value={form.employee_code}
            onChange={(event) => setForm({ ...form, employee_code: event.target.value })}
          />
        </Field>
        <Field label="Email" error={errors.email}>
          <input
            className="input"
            type="email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />
        </Field>
        <Field label="Phone" error={errors.phone}>
          <input className="input" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
        </Field>
      </div>
      <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? <Spinner /> : <Icon name="save" size={16} />} Save changes
        </button>
      </div>
    </form>
  );
}

function UsersTab() {
  const toast = useToast();
  const { user: currentUser } = useAuth();
  const [data, setData] = useState(null);
  const [query, setQuery] = useState({ q: '', status: 'all', role: 'all', page: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [resetInfo, setResetInfo] = useState(null);
  const [busyId, setBusyId] = useState('');
  const debounced = useDebounced(query.q, 300);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await api.get(
        `/admin/users${queryString({ q: debounced, status: query.status, role: query.role, page: query.page, pageSize: 20 })}`,
      );
      setData(payload);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [debounced, query.status, query.role, query.page]);

  useEffect(() => {
    load();
  }, [load]);

  const quickUpdate = async (target, patch, successMessage) => {
    setBusyId(target.id);
    try {
      const payload = await api.patch(`/admin/users/${target.id}`, patch);
      toast.success(successMessage || payload.message);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId('');
    }
  };

  const issueReset = async (target) => {
    setBusyId(target.id);
    try {
      const payload = await api.post(`/admin/users/${target.id}/reset-link`, {});
      setResetInfo({ user: target, ...payload });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId('');
    }
  };

  const issueTemp = async (target) => {
    setBusyId(target.id);
    try {
      const payload = await api.post(`/admin/users/${target.id}/temp-password`, {});
      setResetInfo({ user: target, tempPassword: payload.tempPassword || payload.password, message: payload.message });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId('');
    }
  };

  const remove = async () => {
    const target = removing;
    setRemoving(null);
    if (!target) return;
    try {
      await api.del(`/admin/users/${target.id}`);
      toast.success('User removed.');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const counts = data?.counts || {};
  const roles = data?.roles || [];

  return (
    <>
      <div className="grid grid-4">
        <StatCard label="Total accounts" value={data?.total ?? '—'} icon="users" tone="blue" />
        <StatCard label="Pending approval" value={counts.pending ?? 0} icon="clock" tone="orange" />
        <StatCard label="Active" value={counts.active ?? 0} icon="check" tone="teal" />
        <StatCard label="Inactive / rejected" value={(counts.inactive ?? 0) + (counts.rejected ?? 0)} icon="lock" tone="grey" />
      </div>

      <SectionCard
        title="Registered users"
        subtitle="Approve registrations, assign roles, deactivate accounts and reset passwords."
        actions={
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <div className="input-icon">
              <Icon name="search" size={16} />
              <input
                className="input"
                placeholder="Search users"
                value={query.q}
                onChange={(event) => setQuery({ ...query, q: event.target.value, page: 1 })}
              />
            </div>
            <select
              className="select select-sm"
              value={query.status}
              onChange={(event) => setQuery({ ...query, status: event.target.value, page: 1 })}
            >
              <option value="all">All statuses</option>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {titleCase(status)}
                </option>
              ))}
            </select>
            <select
              className="select select-sm"
              value={query.role}
              onChange={(event) => setQuery({ ...query, role: event.target.value, page: 1 })}
            >
              <option value="all">All roles</option>
              {roles.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </div>
        }
      >
        {error ? (
          <Alert tone="danger" title="Could not load users">
            {error}
          </Alert>
        ) : loading && !data ? (
          <LoadingScreen label="Loading user accounts…" />
        ) : !data?.items?.length ? (
          <EmptyState icon="users" title="No matching users" message="Adjust the filters to see more accounts." />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>Department</th>
                    <th>Status</th>
                    <th>Last login</th>
                    <th className="col-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="row" style={{ gap: 10 }}>
                          <div className="avatar">{(item.full_name || item.username).slice(0, 2).toUpperCase()}</div>
                          <div>
                            <div className="strong small">{item.full_name || item.username}</div>
                            <div className="tiny muted">
                              @{item.username}
                              {item.employee_code ? ` · ${item.employee_code}` : ''}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <Badge value={item.role} label={item.role_label || titleCase(item.role)} />
                      </td>
                      <td className="small">{item.department || '—'}</td>
                      <td>
                        <Badge value={item.status} label={titleCase(item.status)} />
                      </td>
                      <td className="small muted">
                        {item.last_login_at ? relativeTime(item.last_login_at) : 'Never'}
                      </td>
                      <td className="col-actions">
                        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                          {item.status === 'pending' ? (
                            <>
                              <button
                                type="button"
                                className="btn btn-primary btn-xs"
                                disabled={busyId === item.id}
                                onClick={() => quickUpdate(item, { status: 'active' }, 'Account approved.')}
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost btn-xs"
                                disabled={busyId === item.id}
                                onClick={() => quickUpdate(item, { status: 'rejected' }, 'Registration rejected.')}
                              >
                                Reject
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs"
                              disabled={busyId === item.id || item.id === currentUser?.id}
                              onClick={() =>
                                quickUpdate(
                                  item,
                                  { status: item.status === 'active' ? 'inactive' : 'active' },
                                  item.status === 'active' ? 'Account deactivated.' : 'Account activated.',
                                )
                              }
                            >
                              {item.status === 'active' ? 'Deactivate' : 'Activate'}
                            </button>
                          )}
                          <button type="button" className="btn btn-ghost btn-xs" onClick={() => setEditing(item)}>
                            Edit
                          </button>
                          <button type="button" className="btn btn-ghost btn-xs" onClick={() => issueReset(item)}>
                            Reset link
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs"
                            disabled={item.id === currentUser?.id}
                            onClick={() => setRemoving(item)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={data.page} pages={data.pages} total={data.total} onChange={(page) => setQuery({ ...query, page })} />
          </>
        )}
      </SectionCard>

      {editing ? (
        <Modal title={`Edit ${editing.username}`} onClose={() => setEditing(null)} wide>
          <UserEditor
            user={editing}
            roles={roles}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              load();
            }}
          />
        </Modal>
      ) : null}

      {resetInfo ? (
        <Modal title="Password reset issued" onClose={() => setResetInfo(null)}>
          <div className="stack">
            <p className="small">
              Share this securely with <span className="strong">{resetInfo.user.full_name || resetInfo.user.username}</span>. It is shown
              once and stored only as a hash on the server.
            </p>
            {resetInfo.tempPassword ? (
              <div className="code-block">
                Temporary password: <span className="mono strong">{resetInfo.tempPassword}</span>
              </div>
            ) : null}
            {resetInfo.link ? <div className="code-block mono small">{resetInfo.link}</div> : null}
            {resetInfo.expiresAt || resetInfo.expires_at ? (
              <p className="tiny muted">Expires {formatDateTime(resetInfo.expiresAt || resetInfo.expires_at)}</p>
            ) : null}
            {!resetInfo.tempPassword && !resetInfo.link ? <Alert tone="info">{resetInfo.message || 'Reset issued.'}</Alert> : null}
            <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
              <button type="button" className="btn btn-ghost" onClick={() => issueTemp(resetInfo.user)} disabled={busyId === resetInfo.user.id}>
                Generate temporary password instead
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setResetInfo(null)}>
                Done
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      <ConfirmDialog
        open={Boolean(removing)}
        title="Delete this account?"
        message={`${removing?.full_name || removing?.username || 'This user'} will lose access permanently. Their HSE records remain for audit purposes.`}
        confirmLabel="Delete account"
        tone="danger"
        onCancel={() => setRemoving(null)}
        onConfirm={remove}
      />
    </>
  );
}

function ReferenceTab({ kind }) {
  const toast = useToast();
  const isDept = kind === 'departments';
  const fields = isDept
    ? [
        { key: 'name', label: 'Department name', required: true },
        { key: 'code', label: 'Code' },
        { key: 'head', label: 'Department head' },
        { key: 'location', label: 'Location' },
      ]
    : [
        { key: 'name', label: 'Location name', required: true },
        { key: 'type', label: 'Type (plant, warehouse, site…)' },
        { key: 'address', label: 'Address' },
      ];
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState({});
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const payload = await api.get(`/admin/${kind}`);
      setItems(payload.items || []);
    } catch (err) {
      setError(err.message);
    }
  }, [kind]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (editing) await api.put(`/admin/${kind}/${editing.id}`, draft);
      else await api.post(`/admin/${kind}`, draft);
      toast.success(`${isDept ? 'Department' : 'Location'} saved.`);
      setDraft({});
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    const target = removing;
    setRemoving(null);
    try {
      await api.del(`/admin/${kind}/${target.id}`);
      toast.success('Removed.');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="grid grid-3" style={{ alignItems: 'start' }}>
      <SectionCard title={editing ? 'Edit record' : 'Add record'} subtitle="Used across HSE modules and reports">
        <form className="stack" onSubmit={submit}>
          {fields.map((field) => (
            <Field key={field.key} label={field.label} required={field.required}>
              <input
                className="input"
                value={draft[field.key] || ''}
                onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })}
                required={field.required}
                maxLength={240}
              />
            </Field>
          ))}
          <div className="row" style={{ gap: 8 }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <Spinner /> : <Icon name="save" size={16} />} {editing ? 'Update' : 'Add'}
            </button>
            {editing ? (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setEditing(null);
                  setDraft({});
                }}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </SectionCard>

      <SectionCard title={isDept ? 'Departments' : 'Locations'} subtitle={`${items?.length || 0} record(s)`} className="span-2">
        {error ? (
          <Alert tone="danger" title="Could not load records">
            {error}
          </Alert>
        ) : !items ? (
          <LoadingScreen label="Loading…" />
        ) : !items.length ? (
          <EmptyState icon={isDept ? 'building' : 'pin'} title="No records yet" message="Add the first record using the form." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  {fields.map((field) => (
                    <th key={field.key}>{field.label}</th>
                  ))}
                  <th className="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    {fields.map((field) => (
                      <td key={field.key} className="small">
                        {item[field.key] || '—'}
                      </td>
                    ))}
                    <td className="col-actions">
                      <div className="row" style={{ gap: 6 }}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs"
                          onClick={() => {
                            setEditing(item);
                            setDraft(Object.fromEntries(fields.map((f) => [f.key, item[f.key] || ''])));
                          }}
                        >
                          Edit
                        </button>
                        <button type="button" className="btn btn-ghost btn-xs" onClick={() => setRemoving(item)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <ConfirmDialog
        open={Boolean(removing)}
        title="Remove record?"
        message="Existing HSE records keep their historical text values. This cannot be undone."
        confirmLabel="Remove"
        tone="danger"
        onCancel={() => setRemoving(null)}
        onConfirm={remove}
      />
    </div>
  );
}

function SettingsTab() {
  const toast = useToast();
  const { refreshMeta } = useAuth();
  const [values, setValues] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const payload = await api.get('/admin/settings');
        setValues(payload.settings || {});
      } catch (err) {
        setError(err.message);
      }
    })();
  }, []);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api.put('/admin/settings', { settings: values });
      toast.success('System settings saved.');
      if (refreshMeta) await refreshMeta();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (error) return <Alert tone="danger" title="Settings unavailable">{error}</Alert>;
  if (!values) return <LoadingScreen label="Loading settings…" />;

  return (
    <SectionCard title="System settings" subtitle="Company identity, report signatories and KPI base hours">
      <form className="stack" onSubmit={save}>
        <div className="form-grid">
          {SETTING_FIELDS.map((field) => (
            <Field key={field.key} label={field.label}>
              {field.type === 'select' ? (
                <select
                  className="select"
                  value={values[field.key] || ''}
                  onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
                >
                  {field.options.map((option) => (
                    <option key={option} value={option}>
                      {titleCase(option)}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="input"
                  type={field.type === 'number' ? 'number' : 'text'}
                  value={values[field.key] ?? ''}
                  onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
                />
              )}
            </Field>
          ))}
        </div>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? <Spinner /> : <Icon name="save" size={16} />} Save settings
        </button>
        <p className="tiny muted">
          Registration approval set to “required” keeps new accounts pending until an administrator approves them. TRIR and LTIFR use
          these base hours when no man-hours records exist.
        </p>
      </form>
    </SectionCard>
  );
}

function AuditTab() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    (async () => {
      setError('');
      try {
        const payload = await api.get(`/admin/audit-logs${queryString({ page, pageSize: 25 })}`);
        setData(payload);
      } catch (err) {
        setError(err.message);
      }
    })();
  }, [page]);

  return (
    <SectionCard title="Audit log" subtitle="Every privileged action with actor, target and timestamp">
      {error ? (
        <Alert tone="danger" title="Audit log unavailable">
          {error}
        </Alert>
      ) : !data ? (
        <LoadingScreen label="Loading audit trail…" />
      ) : !data.items?.length ? (
        <EmptyState icon="history" title="No audit events" message="Administrative actions will be recorded here." />
      ) : (
        <>
          <div className="table-wrap">
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id}>
                    <td className="small muted">{formatDateTime(item.created_at)}</td>
                    <td className="small">{item.actor_name || item.actor_username || 'System'}</td>
                    <td className="small">
                      <Badge value={item.action} label={titleCase(String(item.action).replace(/_/g, ' '))} />
                    </td>
                    <td className="small">
                      {item.entity}
                      {item.entity_id ? <span className="tiny muted"> · {String(item.entity_id).slice(0, 8)}</span> : null}
                    </td>
                    <td className="tiny muted" style={{ maxWidth: 320, wordBreak: 'break-word' }}>
                      {item.details || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page || page} pages={data.pages || 1} total={data.total} onChange={setPage} />
        </>
      )}
    </SectionCard>
  );
}

export default function AdminPage() {
  const [tab, setTab] = useState('users');
  const [overview, setOverview] = useState(null);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const payload = await api.get('/admin/overview');
        setOverview(payload);
      } catch {
        setOverview(null);
      }
      try {
        const payload = await api.get('/admin/db-stats');
        setStats(payload);
      } catch {
        setStats(null);
      }
    })();
  }, []);

  const roleCards = useMemo(() => {
    if (!overview?.byRole) return [];
    return Object.entries(overview.byRole).map(([role, total]) => ({ role, total }));
  }, [overview]);

  return (
    <>
      <PageHeader
        title="Super Admin Control Panel"
        subtitle="User governance, approvals, roles, reference data, system settings and the complete audit trail."
      />

      <div className="grid grid-4">
        <StatCard label="Total users" value={overview?.totalUsers ?? '—'} icon="users" tone="blue" />
        <StatCard label="Pending approvals" value={overview?.pendingUsers ?? '—'} icon="clock" tone="orange" />
        <StatCard label="Open hazards" value={overview?.openHazards ?? '—'} icon="hazard" tone="amber" />
        <StatCard label="Live permits" value={overview?.livePermits ?? '—'} icon="permit" tone="teal" />
      </div>

      <div className="tabs">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`tab ${tab === item.key ? 'active' : ''}`}
            onClick={() => setTab(item.key)}
          >
            <Icon name={item.icon} size={15} /> {item.label}
          </button>
        ))}
      </div>

      {tab === 'users' ? <UsersTab /> : null}
      {tab === 'departments' ? <ReferenceTab kind="departments" /> : null}
      {tab === 'locations' ? <ReferenceTab kind="locations" /> : null}
      {tab === 'settings' ? <SettingsTab /> : null}
      {tab === 'audit' ? <AuditTab /> : null}

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <SectionCard title="Roles in use" subtitle="Accounts per role across the company">
          {!roleCards.length ? (
            <p className="small muted">Role breakdown unavailable.</p>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              {roleCards.map((row) => (
                <div key={row.role} className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="small">{titleCase(row.role.replace(/_/g, ' '))}</span>
                  <span className="badge badge-blue">{row.total}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Database footprint" subtitle="Rows stored per module in the live database">
          {!stats?.tables ? (
            <p className="small muted">Storage statistics unavailable.</p>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              {Object.entries(stats.tables).map(([table, total]) => (
                <div key={table} className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="small">{titleCase(table.replace(/_/g, ' '))}</span>
                  <span className="small strong">{total}</span>
                </div>
              ))}
              <p className="tiny muted" style={{ marginTop: 6 }}>
                Audit events recorded: {overview?.auditEvents ?? '—'}. Open corrective actions: {overview?.openActions ?? '—'}.
              </p>
            </div>
          )}
        </SectionCard>
      </div>
    </>
  );
}
