import { useCallback, useEffect, useState } from 'react';
import { api, queryString } from '../lib/api.js';
import { formatDate, formatDateTime } from '../lib/format.js';
import {
  Alert,
  Badge,
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

const TASK_HINTS = {
  weekly_report: 'Produces a management-ready weekly HSE report using the selected period and department.',
  incident_summary: 'Summarises recorded incidents and investigations for the selected period.',
  hazard_patterns: 'Identifies recurring hazards and high-risk categories from recorded data.',
  corrective_actions: 'Suggests practical corrective actions for open findings and overdue items.',
  trend_analysis: 'Analyses incident, inspection and training trends across the selected period.',
  toolbox_talk: 'Drafts a toolbox talk briefing based on current site risks.',
  risk_assessment: 'Assists with a risk assessment using recorded hazards and controls.',
  safety_observation: 'Drafts a professional safety observation write-up.',
};

export default function AiPage() {
  const { meta } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState('');
  const [task, setTask] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [department, setDepartment] = useState('all');
  const [output, setOutput] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);

  const departments = meta?.options?.departments || [];

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get('/ai/status');
        setStatus(data);
        if (data.tasks?.length) setTask((current) => current || data.tasks[0].value);
      } catch (err) {
        setStatusError(err.message);
      }
    })();
  }, []);

  const generate = useCallback(async () => {
    if (!task) return;
    setBusy(true);
    setError('');
    try {
      const data = await api.post('/ai/generate', { task, params: { from, to, department } });
      setOutput(data);
      setTitle(`${data.label} · ${formatDate(data.generatedAt)}`);
    } catch (err) {
      setError(err.message);
      setOutput(null);
    } finally {
      setBusy(false);
    }
  }, [task, from, to, department]);

  const save = async () => {
    if (!output?.text) return;
    setSaving(true);
    try {
      await api.post('/ai/save', { title: title.trim() || output.label, text: output.text });
      toast.success('Saved to Document Management.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const copy = async () => {
    if (!output?.text) return;
    try {
      await navigator.clipboard.writeText(output.text);
      toast.success('Copied to clipboard.');
    } catch {
      toast.error('Your browser blocked clipboard access. Select the text and copy manually.');
    }
  };

  return (
    <>
      <PageHeader
        title="AI Safety Assistant"
        subtitle="Gemini-backed drafting and analysis using your live HSE records. Every core module works without AI."
        actions={
          status ? (
            <Badge value={status.configured ? 'active' : 'pending'} label={status.configured ? 'Gemini connected' : 'Not configured'} />
          ) : null
        }
      />

      {statusError ? (
        <Alert tone="danger" title="AI status unavailable">
          {statusError}
        </Alert>
      ) : null}

      {status && !status.configured ? (
        <Alert tone="warning" title="AI assistance is not configured">
          {status.note}
        </Alert>
      ) : null}

      <div className="grid grid-3" style={{ alignItems: 'start' }}>
        <SectionCard title="Request" subtitle="Choose an AI task and reporting scope">
          {!status ? (
            <LoadingScreen label="Checking AI configuration…" />
          ) : (
            <div className="stack">
              <Field label="AI task" required>
                <select className="select" value={task} onChange={(event) => setTask(event.target.value)}>
                  {(status.tasks || []).map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </Field>
              <p className="tiny muted">{TASK_HINTS[task] || 'Uses live HSE records for the selected scope.'}</p>
              <div className="form-grid">
                <Field label="From">
                  <input type="date" className="input" value={from} onChange={(event) => setFrom(event.target.value)} />
                </Field>
                <Field label="To">
                  <input type="date" className="input" value={to} min={from} onChange={(event) => setTo(event.target.value)} />
                </Field>
              </div>
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
              <button type="button" className="btn btn-primary" onClick={generate} disabled={busy || !status.configured || !task}>
                {busy ? <Spinner /> : <Icon name="ai" size={16} />} Generate
              </button>
              <div className="tiny muted">
                Model: <span className="mono">{status.model}</span>. Requests run on the server; the API key never reaches the browser.
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="AI output"
          subtitle={output ? `${output.label} · generated ${formatDateTime(output.generatedAt)}` : 'Generated content appears here'}
          className="span-2"
          actions={
            output ? (
              <div className="row" style={{ gap: 8 }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={copy}>
                  <Icon name="copy" size={15} /> Copy
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={save} disabled={saving}>
                  {saving ? <Spinner /> : <Icon name="save" size={15} />} Save to documents
                </button>
              </div>
            ) : null
          }
        >
          {error ? (
            <Alert tone="danger" title="AI request failed">
              {error}
            </Alert>
          ) : busy ? (
            <div className="ai-loading">
              <Spinner size="lg" />
              <div className="strong small">Analysing your HSE records…</div>
              <div className="tiny muted">This can take up to 45 seconds.</div>
            </div>
          ) : !output ? (
            <EmptyState
              icon="ai"
              title="No AI output yet"
              message="Select a task and generate a draft grounded in your recorded incidents, hazards, inspections, training and corrective actions."
            />
          ) : (
            <div className="stack">
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <Badge value="active" label={output.model} />
                <span className="tiny muted">
                  Scope: {output.scope?.department || 'all departments'} ·{' '}
                  {output.scope?.from ? `${formatDate(output.scope.from)} – ${formatDate(output.scope.to)}` : 'default period'}
                </span>
              </div>
              <div className="ai-output">{output.text}</div>
              <Field label="Save as document title" hint="Saved into Document Management for auditability.">
                <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} />
              </Field>
              <p className="tiny muted">
                AI drafts must be reviewed by a competent HSE professional before issue. Verify every figure against the source records.
              </p>
            </div>
          )}
        </SectionCard>
      </div>
    </>
  );
}
