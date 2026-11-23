import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '../context/AuthContext.jsx';
import { api, queryString } from '../lib/api.js';
import { formatDate, formatDecimal, formatNumber, monthLabel, relativeTime, titleCase } from '../lib/format.js';
import { Alert, Badge, EmptyState, LoadingScreen, PageHeader, SectionCard, Spinner, StatCard, useToast } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';

const COLORS = ['#1d4ed8', '#0e7490', '#f97316', '#dc2626', '#7c3aed', '#059669', '#d97706', '#64748b'];

const CHART_STYLE = { fontSize: 11, fill: '#64748b' };

function toSeries(data, labelKey = 'status') {
  if (!Array.isArray(data)) return [];
  return data
    .map((row) => ({
      name: titleCase(row[labelKey] ?? row.name ?? row.label ?? ''),
      value: Number(row.total ?? row.count ?? row.value ?? 0),
    }))
    .filter((row) => row.name && row.name !== '—');
}

export default function DashboardPage() {
  const { user, meta, isAdmin } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [department, setDepartment] = useState('all');

  const departments = meta?.options?.departments || [];

  const load = useCallback(
    async (quiet = false) => {
      if (quiet) setRefreshing(true);
      else setLoading(true);
      setError('');
      try {
        const result = await api.get(`/dashboard/${queryString({ department })}`);
        setData(result);
      } catch (err) {
        setError(err.message || 'Unable to load dashboard.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [department],
  );

  useEffect(() => {
    load();
  }, [load]);

  const kpis = data?.kpis || {};
  const monthly = useMemo(
    () => (data?.monthly || []).map((row) => ({ ...row, label: monthLabel(row.month) })),
    [data],
  );
  const incidentTypes = useMemo(() => toSeries(data?.incidentTypes, 'type'), [data]);
  const actionStatus = useMemo(() => toSeries(data?.actionStatus), [data]);
  const trainingStatus = useMemo(() => toSeries(data?.trainingStatus), [data]);
  const departmentRows = data?.departments || [];

  const openActions = Number(kpis.openActions || 0);
  const closedActions = Number(kpis.closedActions || 0);
  const totalActions = openActions + closedActions;

  if (loading) return <LoadingScreen label="Loading HSE performance data…" />;

  if (error && !data) {
    return (
      <div className="col" style={{ gap: 16 }}>
        <PageHeader title="HSE Dashboard" subtitle="Live safety performance across the organisation" />
        <Alert tone="error" title="Dashboard unavailable">
          {error}
        </Alert>
        <button type="button" className="btn btn-primary" onClick={() => load()} style={{ alignSelf: 'flex-start' }}>
          <Icon name="refresh" size={16} /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="col" style={{ gap: 18 }}>
      <PageHeader
        title={`Welcome, ${(user?.full_name || user?.username || '').split(' ')[0]}`}
        subtitle={`${data?.scope === 'company' ? 'Company-wide' : 'Department'} HSE performance · updated ${relativeTime(data?.generatedAt)}`}
        actions={
          <>
            <select className="select" value={department} onChange={(event) => setDepartment(event.target.value)} style={{ minWidth: 168 }} aria-label="Filter by department">
              <option value="all">All departments</option>
              {departments.map((dept) => (
                <option key={dept.id || dept.name} value={dept.name}>
                  {dept.name}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-ghost" onClick={() => load(true)} disabled={refreshing}>
              {refreshing ? <Spinner /> : <Icon name="refresh" size={16} />} Refresh
            </button>
            <button type="button" className="btn btn-primary" onClick={() => navigate('/incidents?new=1')}>
              <Icon name="plus" size={16} /> Report incident
            </button>
          </>
        }
      />

      {Array.isArray(data?.alerts) && data.alerts.length ? (
        <div className="col" style={{ gap: 10 }}>
          {data.alerts.map((alert) => (
            <button
              key={alert.title}
              type="button"
              onClick={() => navigate(alert.link || '/')}
              style={{ border: 0, background: 'none', padding: 0, textAlign: 'left', cursor: 'pointer' }}
            >
              <div className={`alert ${alert.level === 'critical' ? 'alert-error' : alert.level === 'warning' ? 'alert-warn' : 'alert-info'}`}>
                <Icon name={alert.level === 'critical' ? 'alertCircle' : alert.level === 'warning' ? 'clock' : 'info'} size={17} style={{ flex: '0 0 17px', marginTop: 1 }} />
                <span style={{ flex: 1 }}>
                  <strong>{alert.title}</strong> — {alert.message}
                </span>
                <Icon name="arrowRight" size={15} style={{ marginTop: 2 }} />
              </div>
            </button>
          ))}
        </div>
      ) : null}

      <div className="kpi-grid">
        <StatCard label="Total Employees" value={formatNumber(kpis.employees)} icon="employees" tone="blue" foot={`${formatNumber(kpis.manHours)} man-hours worked`} />
        <StatCard label="Total Incidents" value={formatNumber(kpis.incidents)} icon="incident" tone="red" foot={`${formatNumber(kpis.recordable)} recordable cases`} />
        <StatCard label="Near Miss Reports" value={formatNumber(kpis.nearMiss)} icon="hazard" tone="violet" foot="Reporting culture indicator" />
        <StatCard label="Lost Time Injuries" value={formatNumber(kpis.lti)} icon="clock" tone="orange" foot={kpis.daysSinceLti != null ? `${kpis.daysSinceLti} days since last LTI` : 'No LTI recorded'} />
        <StatCard label="First Aid Cases" value={formatNumber(kpis.firstAid)} icon="actions" tone="teal" foot="Treated on site" />
        <StatCard label="Man Hours Worked" value={formatNumber(kpis.manHours)} icon="clock" tone="green" foot="Exposure base for TRIR / LTIFR" />
        <StatCard label="TRIR" value={formatDecimal(kpis.trir)} icon="trending" tone="blue" foot="Recordables per 200,000 hours" />
        <StatCard label="LTIFR" value={formatDecimal(kpis.ltifr)} icon="activity" tone="amber" foot="LTIs per 1,000,000 hours" />
        <StatCard label="Safety Inspections" value={formatNumber(kpis.inspections)} icon="inspection" tone="teal" foot="Completed inspections" />
        <StatCard label="Open Hazards" value={formatNumber(kpis.openHazards)} icon="hazard" tone="orange" foot="Open & in progress" />
        <StatCard label="Closed Actions" value={formatNumber(kpis.closedActions)} icon="checkCircle" tone="green" foot={`${formatDecimal(kpis.closureRate, 1)}% closure rate`} />
        <StatCard label="Training Compliance" value={`${formatDecimal(kpis.trainingCompliance, 1)}%`} icon="training" tone="blue" foot="Valid competency records" />
        <StatCard label="PPE Compliance" value={`${formatDecimal(kpis.ppeCompliance, 1)}%`} icon="ppe" tone="violet" foot="Issued & in service" />
        <StatCard label="Active Work Permits" value={formatNumber(kpis.activePermits)} icon="permit" tone="orange" foot="Approved & in force" />
      </div>

      <div className="grid-2-1">
        <SectionCard title="Monthly Safety Performance" subtitle="Incidents, near misses, inspections and LTI trend">
          {monthly.length ? (
            <div className="chart-box">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthly} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gInc" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#1d4ed8" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#1d4ed8" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="gIns" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0e7490" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#0e7490" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="label" tick={CHART_STYLE} axisLine={false} tickLine={false} />
                  <YAxis tick={CHART_STYLE} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11.5 }} />
                  <Area type="monotone" dataKey="inspections" name="Inspections" stroke="#0e7490" fill="url(#gIns)" strokeWidth={2} />
                  <Area type="monotone" dataKey="incidents" name="Incidents" stroke="#1d4ed8" fill="url(#gInc)" strokeWidth={2} />
                  <Line type="monotone" dataKey="nearMiss" name="Near miss" stroke="#7c3aed" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="lti" name="LTI" stroke="#dc2626" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState icon="reports" title="No trend data yet" message="Record incidents and inspections to build the monthly safety trend." />
          )}
        </SectionCard>

        <SectionCard title="Incident Trend" subtitle="Recorded by incident type">
          {incidentTypes.length ? (
            <div className="chart-box">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={incidentTypes} dataKey="value" nameKey="name" innerRadius="52%" outerRadius="82%" paddingAngle={2}>
                    {incidentTypes.map((entry, index) => (
                      <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState icon="incident" title="No incidents recorded" message="Incident distribution appears once records exist." />
          )}
        </SectionCard>
      </div>

      <div className="grid-2">
        <SectionCard title="Department-wise Safety Performance" subtitle="Open hazards, incidents and pending actions">
          {departmentRows.length ? (
            <div className="chart-box">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={departmentRows} margin={{ top: 6, right: 8, left: -18, bottom: 0 }} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="department" tick={{ ...CHART_STYLE, fontSize: 10 }} axisLine={false} tickLine={false} interval={0} angle={departmentRows.length > 5 ? -18 : 0} textAnchor={departmentRows.length > 5 ? 'end' : 'middle'} height={departmentRows.length > 5 ? 46 : 30} />
                  <YAxis tick={CHART_STYLE} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11.5 }} />
                  <Bar dataKey="incidents" name="Incidents" fill="#1d4ed8" radius={[4, 4, 0, 0]} maxBarSize={26} />
                  <Bar dataKey="hazards" name="Open hazards" fill="#f97316" radius={[4, 4, 0, 0]} maxBarSize={26} />
                  <Bar dataKey="openActions" name="Open actions" fill="#0e7490" radius={[4, 4, 0, 0]} maxBarSize={26} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState icon="building" title="No department data" message="Add employees, incidents and hazards to compare departments." />
          )}
        </SectionCard>

        <SectionCard title="Corrective Actions & Training" subtitle="Open versus closed actions, training completion">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div className="small strong" style={{ marginBottom: 8 }}>Actions</div>
              <div className="chart-box sm" style={{ height: 150 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Open', value: openActions },
                        { name: 'Closed', value: closedActions },
                      ].filter((d) => d.value > 0)}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="58%"
                      outerRadius="85%"
                      paddingAngle={2}
                    >
                      <Cell fill="#f97316" />
                      <Cell fill="#059669" />
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="center small muted">
                <strong style={{ color: 'var(--ink-900)' }}>{totalActions}</strong> total actions
              </div>
            </div>
            <div>
              <div className="small strong" style={{ marginBottom: 8 }}>Training status</div>
              <div className="chart-box sm" style={{ height: 150 }}>
                {trainingStatus.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trainingStatus} margin={{ top: 4, right: 4, left: -26, bottom: 0 }}>
                      <XAxis dataKey="name" tick={{ ...CHART_STYLE, fontSize: 9.5 }} axisLine={false} tickLine={false} interval={0} />
                      <YAxis tick={CHART_STYLE} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }} />
                      <Bar dataKey="value" name="Records" radius={[4, 4, 0, 0]} maxBarSize={34}>
                        {trainingStatus.map((entry, index) => (
                          <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="center muted small" style={{ paddingTop: 50 }}>No training records</div>
                )}
              </div>
            </div>
          </div>
          {actionStatus.length ? (
            <div className="row-wrap" style={{ marginTop: 12 }}>
              {actionStatus.map((item) => (
                <span key={item.name} className="filter-chip">
                  {item.name}: {item.value}
                </span>
              ))}
            </div>
          ) : null}
        </SectionCard>
      </div>

      <div className="grid-2">
        <SectionCard
          title="Recent Safety Incidents"
          subtitle="Latest records from the incident register"
          actions={
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate('/incidents')}>
              View register <Icon name="arrowRight" size={14} />
            </button>
          }
          bodyClass=""
        >
          {data?.recentIncidents?.length ? (
            <div className="table-wrap">
              <table className="data" style={{ minWidth: 520 }}>
                <thead>
                  <tr>
                    <th>Ref</th>
                    <th>Type</th>
                    <th>Date</th>
                    <th>Department</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentIncidents.map((row) => (
                    <tr key={row.id}>
                      <td className="cell-title nowrap">{row.incident_no}</td>
                      <td>{titleCase(row.type)}</td>
                      <td className="nowrap">{formatDate(row.occurred_at)}</td>
                      <td>{row.department || '—'}</td>
                      <td>
                        <Badge value={row.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon="incident" title="No incidents recorded" message="Reported incidents will appear here." />
          )}
        </SectionCard>

        <SectionCard
          title="Recent Safety Activities"
          subtitle="Audit trail of latest changes"
          actions={
            isAdmin ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate('/admin?tab=audit')}>
                Audit log <Icon name="arrowRight" size={14} />
              </button>
            ) : null
          }
          bodyClass="card-body"
        >
          {data?.recent?.length ? (
            <div className="timeline">
              {data.recent.map((entry) => (
                <div className="timeline-item" key={entry.id}>
                  <span className="timeline-dot">
                    <Icon name="activity" size={14} />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div className="small strong" style={{ color: 'var(--ink-900)' }}>
                      {titleCase(entry.action)} · {titleCase(entry.entity)}
                    </div>
                    <div className="tiny muted">
                      {entry.username || 'system'} · {relativeTime(entry.created_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon="activity" title="No activity yet" message="Create your first record to start the audit trail." />
          )}
        </SectionCard>
      </div>
    </div>
  );
}
