import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api, queryString } from '../lib/api.js';
import { formatDate, formatDateTime, formatNumber, titleCase } from '../lib/format.js';
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
  useDebounced,
  useToast,
} from '../components/ui.jsx';
import { Icon, MODULE_ICONS } from '../components/icons.jsx';

const PAGE_SIZE = 10;

const pad = (n) => String(n).padStart(2, '0');

function toInputDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 16);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toInputDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function optionValues(options) {
  if (!Array.isArray(options)) return [];
  return options.map((item) => (typeof item === 'string' ? item : item?.value ?? item?.name ?? ''));
}

function optionLabel(field, value) {
  if (value == null || value === '') return '—';
  const options = field?.options;
  if (Array.isArray(options)) {
    const match = options.find((item) => (typeof item === 'string' ? item === value : item?.value === value));
    if (match && typeof match === 'object' && match.label) return match.label;
  }
  return titleCase(value);
}

const SYSTEM_FIELDS = new Set(['created_by', 'updated_by', 'photo_id']);

function blankValues(def) {
  const values = {};
  for (const field of def.fields) {
    if (field.readOnly) continue;
    values[field.name] = field.default != null ? String(field.default) : '';
  }
  return values;
}

function recordValues(def, record) {
  const values = {};
  for (const field of def.fields) {
    if (field.readOnly) continue;
    const raw = record?.[field.name];
    if (raw == null) values[field.name] = '';
    else if (field.type === 'datetime') values[field.name] = toInputDateTime(raw);
    else if (field.type === 'date') values[field.name] = toInputDate(raw);
    else if (field.type === 'checkbox') values[field.name] = Boolean(raw) ? 'true' : 'false';
    else values[field.name] = String(raw);
  }
  return values;
}

function buildPayload(def, values) {
  const payload = {};
  for (const field of def.fields) {
    if (field.readOnly) continue;
    const raw = values[field.name];
    if (raw === '' || raw === undefined || raw === null) {
      payload[field.name] = null;
      continue;
    }
    if (field.type === 'number' || field.type === 'integer') {
      const num = Number(raw);
      payload[field.name] = Number.isFinite(num) ? num : null;
    } else if (field.type === 'datetime') {
      const date = new Date(raw);
      payload[field.name] = Number.isNaN(date.getTime()) ? null : date.toISOString();
    } else if (field.type === 'checkbox') {
      payload[field.name] = raw === 'true' || raw === true;
    } else {
      payload[field.name] = String(raw).trim();
    }
  }
  return payload;
}

/* --------------------------------------------------------------- form field */

function FormInput({ field, value, onChange, people }) {
  const id = `f-${field.name}`;
  const common = { id, value: value ?? '', onChange: (event) => onChange(event.target.value) };

  if (field.name === 'employee_id' && people?.length) {
    return (
      <select className="select" {...common}>
        <option value="">Select employee…</option>
        {people.map((person) => (
          <option key={person.id} value={person.id}>
            {person.full_name} {person.department ? `· ${person.department}` : ''}
          </option>
        ))}
      </select>
    );
  }

  const options = optionValues(field.options);
  if (options.length) {
    return (
      <select className="select" {...common}>
        <option value="">Select…</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {optionLabel(field, option)}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === 'textarea') {
    return <textarea className="textarea" rows={3} {...common} />;
  }
  if (field.type === 'datetime') {
    return <input className="input" type="datetime-local" {...common} />;
  }
  if (field.type === 'date') {
    return <input className="input" type="date" {...common} />;
  }
  if (field.type === 'number' || field.type === 'integer') {
    return (
      <input
        className="input"
        type="number"
        step={field.type === 'integer' ? '1' : 'any'}
        min={field.min}
        max={field.max}
        {...common}
      />
    );
  }
  if (field.type === 'checkbox') {
    return (
      <select className="select" {...common}>
        <option value="false">No</option>
        <option value="true">Yes</option>
      </select>
    );
  }
  if (field.type === 'email') {
    return <input className="input" type="email" {...common} />;
  }
  if (field.type === 'photo') {
    return <input className="input" type="text" placeholder="Document reference" {...common} />;
  }
  return <input className="input" type="text" maxLength={field.maxLength || undefined} {...common} />;
}

/* -------------------------------------------------------------------- page */

export default function ResourcePage({ moduleName }) {
  const { meta, canWrite, can, user } = useAuth();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const def = useMemo(() => meta?.modules?.find((m) => m.name === moduleName) || null, [meta, moduleName]);
  const icon = MODULE_ICONS?.[moduleName] || 'fileText';

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounced(query);
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState('');
  const [dir, setDir] = useState('desc');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [values, setValues] = useState({});
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const [detail, setDetail] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [workflow, setWorkflow] = useState(null);
  const [attendance, setAttendance] = useState(null);

  const openedNew = useRef(false);

  const load = useCallback(
    async (targetPage = page) => {
      if (!def) return;
      setLoading(true);
      setError('');
      try {
        const data = await api.get(
          `/data/${moduleName}${queryString({
            page: targetPage,
            pageSize: PAGE_SIZE,
            q: debouncedQuery || undefined,
            sort: sort || undefined,
            dir,
            ...filters,
          })}`,
        );
        setRows(data.items || []);
        setTotal(Number(data.total || 0));
        setPages(Number(data.pages || 1));
        setPage(Number(data.page || targetPage));
      } catch (err) {
        setError(err.message || 'Unable to load records.');
      } finally {
        setLoading(false);
      }
    },
    [def, moduleName, debouncedQuery, sort, dir, filters, page],
  );

  useEffect(() => {
    if (def) load(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def, moduleName, debouncedQuery, sort, dir, JSON.stringify(filters), page]);

  useEffect(() => {
    setFilters({});
    setQuery('');
    setPage(1);
    setSort('');
    setDetail(null);
  }, [moduleName]);

  useEffect(() => {
    if (openedNew.current || !def || !canWrite) return;
    if (searchParams.get('new') === '1') {
      openedNew.current = true;
      setEditing(null);
      setValues(blankValues(def));
      setFormErrors({});
      setFormOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete('new');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def, canWrite]);

  const columns = useMemo(() => {
    if (!def) return [];
    const usable = def.fields.filter(
      (field) => field.type !== 'textarea' && !field.readOnly && !SYSTEM_FIELDS.has(field.name) && field.type !== 'photo',
    );
    const picked = usable.slice(0, 5);
    const status = def.fields.find((field) => field.name === 'status');
    if (status && !picked.some((field) => field.name === 'status')) picked.push(status);
    const priority = def.fields.find((field) => field.name === 'priority');
    if (priority && !picked.some((field) => field.name === 'priority')) picked.push(priority);
    return picked.slice(0, 7);
  }, [def]);

  const refKey = useMemo(() => {
    const sample = rows[0];
    if (!sample) return null;
    return Object.keys(sample).find((key) => key.endsWith('_no')) || null;
  }, [rows]);

  const filterFields = useMemo(() => (def?.filterFields || []).slice(0, 3), [def]);

  const filterConfig = useCallback(
    (name) => {
      const field = def?.fields?.find((item) => item.name === name);
      if (name === 'department') {
        const departments = (meta?.options?.departments || []).map((item) => item.name);
        return { type: 'select', options: departments, label: 'Department' };
      }
      if (name === 'month') return { type: 'month', label: 'Month' };
      const options = optionValues(field?.options);
      if (options.length) return { type: 'select', options, label: field?.label || titleCase(name) };
      if (field?.type === 'date') return { type: 'date', label: field?.label || titleCase(name) };
      return { type: 'text', label: field?.label || titleCase(name) };
    },
    [def, meta],
  );

  const openCreate = () => {
    if (!def) return;
    setEditing(null);
    setValues(blankValues(def));
    setFormErrors({});
    setFormOpen(true);
  };

  const openEdit = (record) => {
    if (!def) return;
    setEditing(record);
    setValues(recordValues(def, record));
    setFormErrors({});
    setFormOpen(true);
    setDetail(null);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!def) return;
    const errors = {};
    for (const field of def.fields) {
      if (field.readOnly || !field.required) continue;
      const value = values[field.name];
      if (value === '' || value == null) errors[field.name] = `${field.label} is required.`;
    }
    if (Object.keys(errors).length) {
      setFormErrors(errors);
      return;
    }
    setSaving(true);
    try {
      const payload = buildPayload(def, values);
      if (editing) {
        await api.put(`/data/${moduleName}/${editing.id}`, payload);
        toast.success(`${def.singular} updated.`);
      } else {
        const created = await api.post(`/data/${moduleName}`, payload);
        toast.success(`${def.singular} saved${created?.record?.[refKey] ? ` · ${created.record[refKey]}` : ''}.`);
      }
      setFormOpen(false);
      setEditing(null);
      if (!editing) setPage(1);
      await load(editing ? page : 1);
    } catch (err) {
      if (err.fields) setFormErrors(err.fields);
      toast.error(err.message || 'Unable to save the record.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/data/${moduleName}/${deleteTarget.id}`);
      toast.success(`${def.singular} deleted.`);
      setDeleteTarget(null);
      setDetail(null);
      await load(page);
    } catch (err) {
      toast.error(err.message || 'Unable to delete the record.');
    } finally {
      setDeleting(false);
    }
  };

  const runWorkflow = async (path, body, successMessage) => {
    setBusy(true);
    try {
      const result = await api.post(path, body || {});
      toast.success(result?.message || successMessage || 'Done.');
      setWorkflow(null);
      setDetail(null);
      await load(page);
    } catch (err) {
      toast.error(err.message || 'Action failed.');
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    if (!rows.length) {
      toast.info('There are no records on this page to export.');
      return;
    }
    const keys = [...(refKey ? [refKey] : []), ...columns.map((field) => field.name)];
    const header = keys.map((key) => def.fields.find((f) => f.name === key)?.label || titleCase(key));
    const lines = [header, ...rows.map((row) => keys.map((key) => row[key] ?? ''))].map((line) =>
      line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','),
    );
    const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${moduleName}-page-${page}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const workflowButtons = (record) => {
    if (!record) return [];
    const buttons = [];
    if (moduleName === 'permits') {
      if (record.status === 'pending' && can('approve')) {
        buttons.push({ key: 'approve', label: 'Approve', tone: 'primary', run: () => setWorkflow({ record, kind: 'permit-approve' }) });
        buttons.push({ key: 'reject', label: 'Reject', tone: 'danger', run: () => setWorkflow({ record, kind: 'permit-reject' }) });
      }
      if (record.status === 'approved' && canWrite) {
        buttons.push({
          key: 'activate',
          label: 'Activate',
          tone: 'teal',
          run: () => runWorkflow(`/workflow/permits/${record.id}/activate`, {}, 'Permit is now active.'),
        });
      }
      if (['approved', 'active', 'expired'].includes(record.status) && canWrite) {
        buttons.push({
          key: 'close',
          label: 'Close permit',
          tone: 'ghost',
          run: () => runWorkflow(`/workflow/permits/${record.id}/close`, {}, 'Permit closed.'),
        });
      }
    }
    if (moduleName === 'hazards' && can('verify') && record.status !== 'verified') {
      buttons.push({ key: 'verify', label: 'Verify & close', tone: 'primary', run: () => setWorkflow({ record, kind: 'hazard-verify' }) });
    }
    if (moduleName === 'actions' && can('verify') && !['verified', 'closed'].includes(record.status)) {
      buttons.push({ key: 'verify', label: 'Verify closure', tone: 'primary', run: () => setWorkflow({ record, kind: 'action-verify' }) });
      buttons.push({ key: 'rework', label: 'Return for rework', tone: 'ghost', run: () => setWorkflow({ record, kind: 'action-reject' }) });
    }
    if (moduleName === 'incidents' && canWrite) {
      buttons.push({ key: 'investigate', label: record.root_cause ? 'Update investigation' : 'Record investigation', tone: 'teal', run: () => setWorkflow({ record, kind: 'investigation' }) });
    }
    if (moduleName === 'trainings') {
      buttons.push({ key: 'attendance', label: 'Attendance register', tone: 'teal', run: () => openAttendance(record) });
    }
    return buttons;
  };

  const openAttendance = async (record) => {
    setAttendance({ record, items: [], loading: true, summary: null, form: { employee_name: '', employee_id: '', attended: 'true', competency: 'pending', score: '' } });
    try {
      const data = await api.get(`/workflow/training/${record.id}/attendance`);
      setAttendance((prev) => (prev ? { ...prev, items: data.items || [], summary: data.summary, loading: false } : prev));
    } catch (err) {
      toast.error(err.message || 'Unable to load the attendance register.');
      setAttendance((prev) => (prev ? { ...prev, loading: false } : prev));
    }
  };

  const addAttendance = async (event) => {
    event.preventDefault();
    if (!attendance) return;
    const form = attendance.form;
    if (!form.employee_name && !form.employee_id) {
      toast.error('Select an employee or enter a name.');
      return;
    }
    try {
      await api.post(`/workflow/training/${attendance.record.id}/attendance`, {
        employee_name: form.employee_name,
        employee_id: form.employee_id || null,
        attended: form.attended === 'true',
        competency: form.competency,
        score: form.score === '' ? null : Number(form.score),
      });
      toast.success('Attendance recorded.');
      await openAttendance(attendance.record);
    } catch (err) {
      toast.error(err.message || 'Unable to record attendance.');
    }
  };

  if (!def) return <LoadingScreen label="Loading module configuration…" />;

  const people = meta?.options?.people || [];
  const editableFields = def.fields.filter((field) => !field.readOnly && field.type !== 'photo' && field.name !== 'created_by');

  return (
    <div className="col" style={{ gap: 16 }}>
      <PageHeader
        title={def.label}
        subtitle={`${total} record${total === 1 ? '' : 's'} · ${def.singular} register with approval workflow and audit trail`}
        actions={
          <>
            <button type="button" className="btn btn-ghost" onClick={exportCsv}>
              <Icon name="download" size={16} /> CSV
            </button>
            {canWrite ? (
              <button type="button" className="btn btn-primary" onClick={openCreate}>
                <Icon name="plus" size={16} /> New {def.singular.toLowerCase()}
              </button>
            ) : null}
          </>
        }
      />

      {error ? <Alert tone="error" title="Could not load records">{error}</Alert> : null}

      <SectionCard bodyClass="card-body" head={false}>
        <div className="toolbar">
          <div className="input-wrap" style={{ flex: '1 1 220px', minWidth: 180 }}>
            <input
              className="input"
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder={`Search ${def.label.toLowerCase()}…`}
              aria-label="Search records"
              style={{ paddingLeft: 34 }}
            />
            <span style={{ position: 'absolute', left: 10, top: 9, color: 'var(--ink-400)' }}>
              <Icon name="search" size={16} />
            </span>
          </div>

          {filterFields.map((name) => {
            const config = filterConfig(name);
            return (
              <select
                key={name}
                className="select"
                value={filters[name] || ''}
                onChange={(event) => {
                  const value = event.target.value;
                  setPage(1);
                  setFilters((prev) => {
                    const next = { ...prev };
                    if (value) next[name] = value;
                    else delete next[name];
                    return next;
                  });
                }}
                aria-label={`Filter by ${config.label}`}
                style={{ minWidth: 148 }}
              >
                <option value="">All {config.label.toLowerCase()}s</option>
                {(config.options || []).map((option) => (
                  <option key={option} value={option}>
                    {titleCase(option)}
                  </option>
                ))}
              </select>
            );
          })}

          <select
            className="select"
            value={`${sort}:${dir}`}
            onChange={(event) => {
              const [nextSort, nextDir] = event.target.value.split(':');
              setSort(nextSort);
              setDir(nextDir);
              setPage(1);
            }}
            aria-label="Sort records"
            style={{ minWidth: 170 }}
          >
            <option value=":desc">Newest first</option>
            <option value=":asc">Oldest first</option>
            {def.fields
              .filter((field) => ['text', 'date', 'datetime', 'number', 'integer'].includes(field.type) && !field.readOnly)
              .slice(0, 5)
              .map((field) => (
                <option key={field.name} value={`${field.name}:asc`}>
                  {field.label} ↑
                </option>
              ))}
          </select>

          {(query || Object.keys(filters).length || sort) && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setQuery('');
                setFilters({});
                setSort('');
                setPage(1);
              }}
            >
              <Icon name="close" size={14} /> Clear
            </button>
          )}
        </div>

        {loading ? (
          <div className="center" style={{ padding: '48px 0' }}>
            <Spinner size="lg" />
            <p className="small muted" style={{ marginTop: 10 }}>Loading {def.label.toLowerCase()}…</p>
          </div>
        ) : rows.length ? (
          <>
            <div className="table-wrap" style={{ marginTop: 4 }}>
              <table className="data">
                <thead>
                  <tr>
                    {refKey ? <th>Ref</th> : null}
                    {columns.map((field) => (
                      <th key={field.name}>{field.label}</th>
                    ))}
                    <th className="right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} onClick={() => setDetail(row)} style={{ cursor: 'pointer' }}>
                      {refKey ? <td className="cell-title nowrap">{row[refKey] || '—'}</td> : null}
                      {columns.map((field) => {
                        const value = row[field.name];
                        const isBadge = Boolean(field.options) || ['status', 'priority', 'severity', 'risk_level', 'type', 'category'].includes(field.name);
                        return (
                          <td key={field.name} className={field.type === 'date' || field.type === 'datetime' ? 'nowrap' : ''}>
                            {value == null || value === '' ? (
                              <span className="muted">—</span>
                            ) : isBadge ? (
                              <Badge value={value} label={optionLabel(field, value)} />
                            ) : field.type === 'date' ? (
                              formatDate(value)
                            ) : field.type === 'datetime' ? (
                              formatDateTime(value)
                            ) : field.type === 'number' || field.type === 'integer' ? (
                              formatNumber(value)
                            ) : (
                              String(value)
                            )}
                          </td>
                        );
                      })}
                      <td className="right">
                        <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            className="icon-btn"
                            title="View record"
                            aria-label="View record"
                            onClick={(event) => {
                              event.stopPropagation();
                              setDetail(row);
                            }}
                          >
                            <Icon name="eye" size={16} />
                          </button>
                          {canWrite ? (
                            <button
                              type="button"
                              className="icon-btn"
                              title="Edit record"
                              aria-label="Edit record"
                              onClick={(event) => {
                                event.stopPropagation();
                                openEdit(row);
                              }}
                            >
                              <Icon name="edit" size={16} />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pages={pages} total={total} pageSize={PAGE_SIZE} onPage={(next) => setPage(next)} busy={loading} />
          </>
        ) : (
          <EmptyState
            icon={icon}
            title={query || Object.keys(filters).length ? 'No matching records' : `No ${def.label.toLowerCase()} yet`}
            message={
              query || Object.keys(filters).length
                ? 'Adjust your search or filters to see more results.'
                : canWrite
                  ? `Create the first ${def.singular.toLowerCase()} to start the register.`
                  : 'Records created by the HSE team will appear here.'
            }
            action={
              canWrite && !query && !Object.keys(filters).length ? (
                <button type="button" className="btn btn-primary" onClick={openCreate} style={{ marginTop: 12 }}>
                  <Icon name="plus" size={16} /> New {def.singular.toLowerCase()}
                </button>
              ) : null
            }
          />
        )}
      </SectionCard>

      {/* ------------------------------------------------------------ form */}
      <Modal
        open={formOpen}
        onClose={() => (saving ? null : setFormOpen(false))}
        title={editing ? `Edit ${def.singular.toLowerCase()}` : `New ${def.singular.toLowerCase()}`}
        subtitle={editing ? `Record ${editing[refKey] || ''}` : 'All required fields are validated on the server.'}
        size="lg"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setFormOpen(false)} disabled={saving}>
              Cancel
            </button>
            <button type="submit" form="record-form" className="btn btn-primary" disabled={saving}>
              {saving ? <Spinner tone="white" /> : <Icon name="check" size={16} />}
              {editing ? 'Save changes' : `Create ${def.singular.toLowerCase()}`}
            </button>
          </>
        }
      >
        <form id="record-form" className="form-grid" onSubmit={submit} noValidate>
          {editableFields.map((field) => (
            <Field
              key={field.name}
              label={field.label}
              htmlFor={`f-${field.name}`}
              required={field.required}
              error={formErrors[field.name]}
              className={field.type === 'textarea' ? 'full' : ''}
            >
              <FormInput
                field={field}
                value={values[field.name] ?? ''}
                people={people}
                onChange={(value) => {
                  setValues((prev) => ({ ...prev, [field.name]: value }));
                  setFormErrors((prev) => ({ ...prev, [field.name]: undefined }));
                }}
              />
            </Field>
          ))}
        </form>
      </Modal>

      {/* ---------------------------------------------------------- detail */}
      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail ? `${def.singular} ${detail[refKey] || ''}`.trim() : ''}
        subtitle={detail ? `Created ${formatDateTime(detail.created_at)}${detail.created_by ? ` · ${detail.created_by}` : ''}` : ''}
        size="lg"
        footer={
          detail ? (
            <>
              {canWrite && !user?.permissions?.readOnly ? (
                <button type="button" className="btn btn-danger-ghost" onClick={() => setDeleteTarget(detail)}>
                  <Icon name="trash" size={16} /> Delete
                </button>
              ) : null}
              <span style={{ flex: 1 }} />
              {workflowButtons(detail).map((button) => (
                <button
                  key={button.key}
                  type="button"
                  className={`btn ${button.tone === 'primary' ? 'btn-primary' : button.tone === 'danger' ? 'btn-danger' : button.tone === 'teal' ? 'btn-teal' : 'btn-ghost'}`}
                  onClick={button.run}
                  disabled={busy}
                >
                  {busy ? <Spinner tone={button.tone === 'ghost' ? '' : 'white'} /> : null}
                  {button.label}
                </button>
              ))}
              {canWrite ? (
                <button type="button" className="btn btn-ghost" onClick={() => openEdit(detail)}>
                  <Icon name="edit" size={16} /> Edit
                </button>
              ) : null}
            </>
          ) : null
        }
      >
        {detail ? (
          <div className="col" style={{ gap: 16 }}>
            <div className="detail-grid">
              {def.fields
                .filter((field) => field.name !== 'created_by')
                .map((field) => {
                  const value = detail[field.name];
                  const isBadge = Boolean(field.options) || ['status', 'priority', 'severity', 'risk_level', 'type', 'category'].includes(field.name);
                  return (
                    <div key={field.name} className={field.type === 'textarea' ? 'full' : ''}>
                      <div className="detail-label">{field.label}</div>
                      <div className="detail-value">
                        {value == null || value === '' ? (
                          <span className="muted">—</span>
                        ) : isBadge ? (
                          <Badge value={value} label={optionLabel(field, value)} />
                        ) : field.type === 'date' ? (
                          formatDate(value)
                        ) : field.type === 'datetime' ? (
                          formatDateTime(value)
                        ) : field.type === 'number' || field.type === 'integer' ? (
                          formatNumber(value)
                        ) : (
                          <span style={{ whiteSpace: 'pre-wrap' }}>{String(value)}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
            <div className="row-wrap tiny muted">
              <span>Record ID: {detail.id}</span>
              <span>·</span>
              <span>Updated {formatDateTime(detail.updated_at || detail.created_at)}</span>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* -------------------------------------------------- workflow dialogs */}
      <WorkflowModal
        state={workflow}
        busy={busy}
        onClose={() => setWorkflow(null)}
        onSubmit={(body) => {
          if (!workflow) return;
          const { record, kind } = workflow;
          if (kind === 'permit-approve') runWorkflow(`/workflow/permits/${record.id}/approve`, body, 'Permit approved.');
          else if (kind === 'permit-reject') runWorkflow(`/workflow/permits/${record.id}/reject`, body, 'Permit rejected.');
          else if (kind === 'hazard-verify') runWorkflow(`/workflow/hazards/${record.id}/verify`, body, 'Hazard verified.');
          else if (kind === 'action-verify') runWorkflow(`/workflow/actions/${record.id}/verify`, { ...body, decision: 'verify' }, 'Action closed.');
          else if (kind === 'action-reject') runWorkflow(`/workflow/actions/${record.id}/verify`, { ...body, decision: 'reject' }, 'Action returned.');
          else if (kind === 'investigation') runWorkflow(`/workflow/incidents/${record.id}/investigation`, body, 'Investigation saved.');
        }}
      />

      {/* --------------------------------------------------- attendance */}
      <Modal
        open={Boolean(attendance)}
        onClose={() => setAttendance(null)}
        title="Training attendance register"
        subtitle={attendance?.record?.title || attendance?.record?.training_no || ''}
        size="lg"
        footer={
          <button type="button" className="btn btn-ghost" onClick={() => setAttendance(null)}>
            Close
          </button>
        }
      >
        {attendance ? (
          <div className="col" style={{ gap: 16 }}>
            {attendance.summary ? (
              <div className="row-wrap">
                <span className="filter-chip">Registered: {attendance.summary.total}</span>
                <span className="filter-chip">Attended: {attendance.summary.attended}</span>
                <span className="filter-chip">Competent: {attendance.summary.competent}</span>
              </div>
            ) : null}

            {attendance.loading ? (
              <div className="center" style={{ padding: 24 }}>
                <Spinner size="lg" />
              </div>
            ) : attendance.items.length ? (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Attended</th>
                      <th>Score</th>
                      <th>Competency</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {attendance.items.map((item) => (
                      <tr key={item.id}>
                        <td className="cell-title">{item.employee_name}</td>
                        <td>{Number(item.attended) === 1 ? 'Yes' : 'No'}</td>
                        <td>{item.score ?? '—'}</td>
                        <td>
                          <Badge value={item.competency} />
                        </td>
                        <td className="right">
                          {canWrite ? (
                            <button
                              type="button"
                              className="icon-btn"
                              aria-label={`Remove ${item.employee_name}`}
                              onClick={async () => {
                                try {
                                  await api.delete(`/workflow/training/${attendance.record.id}/attendance/${item.id}`);
                                  toast.success('Attendance entry removed.');
                                  await openAttendance(attendance.record);
                                } catch (err) {
                                  toast.error(err.message || 'Unable to remove the entry.');
                                }
                              }}
                            >
                              <Icon name="trash" size={15} />
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState icon="training" title="No attendance yet" message="Add employees as they attend the session." />
            )}

            {canWrite ? (
              <form onSubmit={addAttendance} className="form-grid" style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }}>
                <Field label="Employee" htmlFor="att-employee" className="full">
                  <select
                    id="att-employee"
                    className="select"
                    value={attendance.form.employee_id}
                    onChange={(event) => {
                      const person = people.find((p) => p.id === event.target.value);
                      setAttendance((prev) => ({
                        ...prev,
                        form: { ...prev.form, employee_id: event.target.value, employee_name: person?.full_name || '' },
                      }));
                    }}
                  >
                    <option value="">Select employee…</option>
                    {people.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.full_name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Attended" htmlFor="att-attended">
                  <select
                    id="att-attended"
                    className="select"
                    value={attendance.form.attended}
                    onChange={(event) => setAttendance((prev) => ({ ...prev, form: { ...prev.form, attended: event.target.value } }))}
                  >
                    <option value="true">Attended</option>
                    <option value="false">Absent</option>
                  </select>
                </Field>
                <Field label="Competency" htmlFor="att-competency">
                  <select
                    id="att-competency"
                    className="select"
                    value={attendance.form.competency}
                    onChange={(event) => setAttendance((prev) => ({ ...prev, form: { ...prev.form, competency: event.target.value } }))}
                  >
                    <option value="pending">Pending assessment</option>
                    <option value="competent">Competent</option>
                    <option value="not_competent">Not competent</option>
                  </select>
                </Field>
                <Field label="Assessment score" htmlFor="att-score">
                  <input
                    id="att-score"
                    className="input"
                    type="number"
                    min="0"
                    max="100"
                    value={attendance.form.score}
                    onChange={(event) => setAttendance((prev) => ({ ...prev, form: { ...prev.form, score: event.target.value } }))}
                  />
                </Field>
                <div className="full right">
                  <button type="submit" className="btn btn-primary">
                    <Icon name="plus" size={16} /> Add to register
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete ${def.singular.toLowerCase()}?`}
        message={
          deleteTarget
            ? `This permanently removes ${deleteTarget[refKey] || 'the record'}. Linked corrective actions and history stay intact, but the deletion is recorded in the audit log.`
            : ''
        }
        confirmLabel="Delete record"
        busy={deleting}
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

/* --------------------------------------------------------- workflow modal */

function WorkflowModal({ state, busy, onClose, onSubmit }) {
  const kind = state?.kind;
  const [note, setNote] = useState('');
  const [rootCause, setRootCause] = useState('');
  const [investigation, setInvestigation] = useState('');
  const [lostDays, setLostDays] = useState('');
  const [status, setStatus] = useState('investigation');

  useEffect(() => {
    if (!state) return;
    setNote('');
    setRootCause(state.record?.root_cause || '');
    setInvestigation(state.record?.investigation || '');
    setLostDays(state.record?.lost_days != null ? String(state.record.lost_days) : '');
    setStatus(state.record?.status === 'closed' ? 'closed' : 'investigation');
  }, [state]);

  if (!state) return null;

  const isInvestigation = kind === 'investigation';
  const requiresNote = ['permit-reject', 'hazard-verify', 'action-verify', 'action-reject'].includes(kind);
  const titles = {
    'permit-approve': 'Approve work permit',
    'permit-reject': 'Reject work permit',
    'hazard-verify': 'Verify hazard closure',
    'action-verify': 'Verify corrective action',
    'action-reject': 'Return action for rework',
    investigation: 'Incident investigation',
  };
  const hints = {
    'permit-approve': 'Approval confirms the permit conditions, isolations and supervision arrangements have been verified on site.',
    'permit-reject': 'The requester will see this reason on the permit record.',
    'hazard-verify': 'Confirm the controls are in place before closing the hazard.',
    'action-verify': 'Record the evidence that proves the corrective action is complete.',
    'action-reject': 'Explain what is still missing so the action owner can rework it.',
    investigation: 'Root cause analysis and investigation findings are stored on the incident record.',
  };

  const valid = isInvestigation
    ? rootCause.trim().length >= 5 && investigation.trim().length >= 10
    : requiresNote
      ? note.trim().length >= 5
      : true;

  const submit = (event) => {
    event.preventDefault();
    if (!valid || busy) return;
    if (isInvestigation) {
      onSubmit({
        root_cause: rootCause.trim(),
        investigation: investigation.trim(),
        status,
        lost_days: lostDays === '' ? undefined : Number(lostDays),
      });
      return;
    }
    const body = {};
    if (kind === 'hazard-verify') body.verification = note.trim();
    else if (kind.startsWith('action')) body.verification_note = note.trim();
    else body.note = note.trim();
    onSubmit(body);
  };

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title={titles[kind] || 'Action'}
      subtitle={hints[kind]}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="workflow-form" className="btn btn-primary" disabled={busy || !valid}>
            {busy ? <Spinner tone="white" /> : <Icon name="check" size={16} />} Confirm
          </button>
        </>
      }
    >
      <form id="workflow-form" className="col" style={{ gap: 14 }} onSubmit={submit}>
        {isInvestigation ? (
          <>
            <Field label="Root cause" htmlFor="wf-root" required hint="Minimum 5 characters.">
              <textarea id="wf-root" className="textarea" rows={3} value={rootCause} onChange={(event) => setRootCause(event.target.value)} />
            </Field>
            <Field label="Investigation findings" htmlFor="wf-inv" required hint="Minimum 10 characters.">
              <textarea id="wf-inv" className="textarea" rows={5} value={investigation} onChange={(event) => setInvestigation(event.target.value)} />
            </Field>
            <div className="form-grid">
              <Field label="Lost days" htmlFor="wf-days">
                <input id="wf-days" className="input" type="number" min="0" value={lostDays} onChange={(event) => setLostDays(event.target.value)} />
              </Field>
              <Field label="Incident status" htmlFor="wf-status">
                <select id="wf-status" className="select" value={status} onChange={(event) => setStatus(event.target.value)}>
                  <option value="investigation">Under investigation</option>
                  <option value="closed">Closed</option>
                  <option value="open">Reopened</option>
                </select>
              </Field>
            </div>
          </>
        ) : (
          <Field label={requiresNote ? 'Remarks / verification evidence' : 'Approval remarks'} htmlFor="wf-note" required={requiresNote}>
            <textarea
              id="wf-note"
              className="textarea"
              rows={4}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={requiresNote ? 'Describe the evidence verified…' : 'Optional note recorded in the audit trail'}
            />
          </Field>
        )}
      </form>
    </Modal>
  );
}
