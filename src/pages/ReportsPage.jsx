import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, queryString } from '../lib/api.js';
import { formatDate } from '../lib/format.js';
import {
  Alert,
  EmptyState,
  Field,
  LoadingScreen,
  PageHeader,
  SectionCard,
  Spinner,
  useToast,
} from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import { useAuth } from '../context/AuthContext.jsx';

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function monthRange() {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return [isoDate(from), isoDate(now)];
}

function summaryItems(summary) {
  if (!summary) return [];
  if (Array.isArray(summary)) {
    return summary.map((item, index) => ({
      key: item.key || item.label || `item-${index}`,
      label: item.label || item.title || item.key || `Metric ${index + 1}`,
      value: item.value ?? item.total ?? '—',
      note: item.note || item.hint || '',
    }));
  }
  return Object.entries(summary).map(([key, value]) => ({
    key,
    label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    value: typeof value === 'object' && value !== null ? value.total ?? JSON.stringify(value) : value,
    note: '',
  }));
}

function cellValue(row, column) {
  const value = row?.[column.key];
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export default function ReportsPage() {
  const { meta } = useAuth();
  const toast = useToast();
  const [catalog, setCatalog] = useState([]);
  const [catalogError, setCatalogError] = useState('');
  const [active, setActive] = useState('');
  const [range, setRange] = useState(() => monthRange());
  const [department, setDepartment] = useState('all');
  const [reviewedBy, setReviewedBy] = useState('');
  const [report, setReport] = useState(null);
  const [metaInfo, setMetaInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const departments = meta?.options?.departments || [];

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get('/reports/catalog');
        const list = data.reports || [];
        setCatalog(list);
        if (list.length) setActive((current) => current || list[0].key);
      } catch (err) {
        setCatalogError(err.message);
      }
    })();
  }, []);

  const loadPreview = useCallback(async () => {
    if (!active) return;
    setLoading(true);
    setError('');
    try {
      const data = await api.get(
        `/reports/${active}${queryString({
          format: 'json',
          from: range[0],
          to: range[1],
          department,
          reviewed_by: reviewedBy,
        })}`,
      );
      setReport(data.report);
      setMetaInfo(data.meta);
    } catch (err) {
      setError(err.message);
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [active, range, department, reviewedBy]);

  useEffect(() => {
    loadPreview();
  }, [loadPreview]);

  const activeLabel = useMemo(() => catalog.find((c) => c.key === active)?.label || 'HSE Report', [catalog, active]);

  const exportReport = async (format) => {
    setBusy(format);
    try {
      const name = await api.download(
        `/reports/${active}${queryString({
          format,
          from: range[0],
          to: range[1],
          department,
          reviewed_by: reviewedBy,
        })}`,
        `${active}-hse-report.${format === 'xlsx' ? 'xlsx' : 'pdf'}`,
      );
      toast.success(`${format === 'xlsx' ? 'Excel workbook' : 'PDF report'} downloaded: ${name}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy('');
    }
  };

  const metrics = summaryItems(report?.summary);

  return (
    <>
      <PageHeader
        title="Reports & Exports"
        subtitle="Management reports built from live HSE records with PDF and Excel export, filters and a print-ready layout."
        actions={
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-ghost" onClick={() => window.print()}>
              <Icon name="printer" size={16} /> Print preview
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => exportReport('xlsx')} disabled={!active || busy}>
              {busy === 'xlsx' ? <Spinner /> : <Icon name="download" size={16} />} Excel
            </button>
            <button type="button" className="btn btn-primary" onClick={() => exportReport('pdf')} disabled={!active || busy}>
              {busy === 'pdf' ? <Spinner /> : <Icon name="fileText" size={16} />} PDF
            </button>
          </div>
        }
      />

      <div className="grid grid-3" style={{ alignItems: 'start' }}>
        <SectionCard title="Report type" subtitle="Choose the report to generate">
          {catalogError ? (
            <Alert tone="danger" title="Could not load reports">
              {catalogError}
            </Alert>
          ) : (
            <div className="stack" style={{ gap: 6 }}>
              {catalog.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`nav-item ${active === item.key ? 'active' : ''}`}
                  style={{ color: active === item.key ? '#fff' : 'var(--ink-700)', textAlign: 'left' }}
                  onClick={() => setActive(item.key)}
                >
                  <Icon name="fileText" size={16} />
                  {item.label}
                </button>
              ))}
              {!catalog.length && !catalogError ? <LoadingScreen label="Loading report catalogue…" /> : null}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Filters" subtitle="Reporting period and department" className="span-2">
          <div className="form-grid">
            <Field label="From" required>
              <input
                type="date"
                className="input"
                value={range[0]}
                max={range[1]}
                onChange={(event) => setRange([event.target.value, range[1]])}
              />
            </Field>
            <Field label="To" required>
              <input
                type="date"
                className="input"
                value={range[1]}
                min={range[0]}
                onChange={(event) => setRange([range[0], event.target.value])}
              />
            </Field>
            <Field label="Department">
              <select className="select" value={department} onChange={(event) => setDepartment(event.target.value)}>
                <option value="all">All departments</option>
                {departments.map((d) => (
                  <option key={d.id || d.name} value={d.name}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Reviewed by" hint="Printed in the signature block">
              <input
                className="input"
                value={reviewedBy}
                onChange={(event) => setReviewedBy(event.target.value)}
                placeholder="Name of reviewer"
                maxLength={120}
              />
            </Field>
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title={activeLabel}
        subtitle={
          metaInfo
            ? `${formatDate(metaInfo.from)} – ${formatDate(metaInfo.to)} · ${metaInfo.department || 'All departments'} · Prepared by ${metaInfo.preparedBy}`
            : 'Report preview'
        }
        actions={
          <button type="button" className="btn btn-ghost btn-sm" onClick={loadPreview} disabled={loading}>
            {loading ? <Spinner /> : <Icon name="refresh" size={15} />} Refresh
          </button>
        }
        bodyClass="card-body report-body"
      >
        {error ? (
          <Alert tone="danger" title="Report could not be generated">
            {error}
          </Alert>
        ) : loading ? (
          <LoadingScreen label="Building report from live records…" />
        ) : !report ? (
          <EmptyState icon="reports" title="Select a report" message="Choose a report type to preview live figures." />
        ) : (
          <div id="report-preview">
            <div className="report-head">
              <div>
                <div className="report-company">{meta?.options?.settings?.company_name || 'Industrial HSE Pro'}</div>
                <div className="tiny muted">
                  {meta?.options?.settings?.company_address || 'Enterprise Safety Management System'}
                </div>
              </div>
              <div className="report-meta">
                <div>
                  <span className="tiny muted">Report</span>
                  <div className="strong small">{report.label}</div>
                </div>
                <div>
                  <span className="tiny muted">Period</span>
                  <div className="strong small">
                    {formatDate(metaInfo?.from)} – {formatDate(metaInfo?.to)}
                  </div>
                </div>
                <div>
                  <span className="tiny muted">Prepared by</span>
                  <div className="strong small">{metaInfo?.preparedBy || '—'}</div>
                </div>
                <div>
                  <span className="tiny muted">Reviewed by</span>
                  <div className="strong small">{metaInfo?.reviewedBy || 'Pending review'}</div>
                </div>
              </div>
            </div>

            {metrics.length ? (
              <div className="report-metrics">
                {metrics.map((item) => (
                  <div key={item.key} className="report-metric">
                    <div className="tiny muted">{item.label}</div>
                    <div className="report-metric-value">{item.value}</div>
                    {item.note ? <div className="tiny muted">{item.note}</div> : null}
                  </div>
                ))}
              </div>
            ) : null}

            {(report.sections || []).map((section, index) => (
              <div key={section.title || index} className="report-section">
                <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                  <h3 className="report-section-title">{section.title}</h3>
                  <span className="tiny muted">{section.rows?.length || 0} record(s)</span>
                </div>
                {section.rows?.length ? (
                  <div className="table-wrap">
                    <table className="table table-compact">
                      <thead>
                        <tr>
                          {(section.columns || []).map((column) => (
                            <th key={column.key || column.label}>{column.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {section.rows.map((row, rowIndex) => (
                          <tr key={row.id || `${index}-${rowIndex}`}>
                            {(section.columns || []).map((column) => (
                              <td key={column.key || column.label}>{cellValue(row, column)}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="small muted">No records found for this period.</p>
                )}
              </div>
            ))}

            <div className="report-signatures">
              <div>
                <div className="sig-line" />
                <div className="tiny muted">Prepared by</div>
                <div className="small strong">{metaInfo?.preparedBy || '—'}</div>
              </div>
              <div>
                <div className="sig-line" />
                <div className="tiny muted">Reviewed by</div>
                <div className="small strong">{metaInfo?.reviewedBy || '________________'}</div>
              </div>
              <div>
                <div className="sig-line" />
                <div className="tiny muted">Approved by</div>
                <div className="small strong">
                  {meta?.options?.settings?.report_signatory || '________________'}
                </div>
              </div>
            </div>
          </div>
        )}
      </SectionCard>
    </>
  );
}
