import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { relativeTime, titleCase } from '../lib/format.js';
import { Alert, Badge, EmptyState, LoadingScreen, PageHeader, SectionCard, Spinner, useToast } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';

const ICONS = {
  overdue_action: 'actions',
  permit_expiry: 'permit',
  training_expiry: 'training',
  inspection_due: 'inspection',
  pending_approval: 'users',
  hazard_overdue: 'hazard',
  medical_expiry: 'employee',
};

const SEVERITY_TONE = { critical: 'danger', warning: 'warning', info: 'info' };

export default function NotificationsPage() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const payload = await api.get('/notifications');
      setData(payload);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const markAll = async () => {
    setBusy(true);
    try {
      await api.post('/notifications/read-all', {});
      await load();
      toast.success('All notifications marked as read.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const markOne = async (id) => {
    try {
      await api.post(`/notifications/${id}/read`, {});
      await load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const alerts = data?.alerts || [];
  const stored = data?.stored || [];
  const criticalCount = alerts.filter((a) => a.severity === 'critical').length;

  return (
    <>
      <PageHeader
        title="Alerts & Reminders"
        subtitle="Live reminders for overdue actions, expiring permits, training, inspections and pending approvals."
        actions={
          <button type="button" className="btn btn-secondary" onClick={markAll} disabled={busy || !data?.unread}>
            {busy ? <Spinner /> : <Icon name="check" size={16} />} Mark all read
            {data?.unread ? <span className="badge badge-blue">{data.unread}</span> : null}
          </button>
        }
      />

      {error ? (
        <Alert tone="danger" title="Could not load notifications">
          {error}
        </Alert>
      ) : null}

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <SectionCard
          title="Live compliance alerts"
          subtitle={`${alerts.length} active alert(s) · ${criticalCount} critical`}
        >
          {loading ? (
            <LoadingScreen label="Evaluating compliance deadlines…" />
          ) : !alerts.length ? (
            <EmptyState
              icon="bell"
              title="Nothing needs attention"
              message="No overdue actions, expiring permits or pending approvals right now."
            />
          ) : (
            <div className="stack" style={{ gap: 10 }}>
              {alerts.map((alert) => (
                <div key={alert.id} className={`alert-row severity-${alert.severity}`}>
                  <div className={`alert-icon tone-${SEVERITY_TONE[alert.severity] || 'info'}`}>
                    <Icon name={ICONS[alert.type] || 'bell'} size={18} />
                  </div>
                  <div className="alert-body">
                    <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                      <span className="strong small">{alert.title}</span>
                      <Badge value={alert.severity} label={titleCase(alert.severity)} />
                    </div>
                    <p className="small muted" style={{ margin: '2px 0 6px' }}>
                      {alert.message}
                    </p>
                    <div className="row" style={{ gap: 10 }}>
                      {alert.link ? (
                        <Link className="link small" to={alert.link}>
                          Open module
                        </Link>
                      ) : null}
                      <span className="tiny muted">{relativeTime(alert.created_at)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Notification inbox" subtitle="Approvals, assignments and system messages">
          {loading ? (
            <LoadingScreen label="Loading inbox…" />
          ) : !stored.length ? (
            <EmptyState icon="bell" title="Inbox empty" message="System notifications addressed to you will appear here." />
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              {stored.map((item) => (
                <div key={item.id} className={`inbox-row ${item.read_at ? 'read' : 'unread'}`}>
                  <div className="grow">
                    <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                      <span className="strong small">{item.title}</span>
                      {item.read_at ? <span className="tiny muted">Read</span> : <span className="dot-unread" />}
                    </div>
                    <p className="small muted" style={{ margin: '2px 0 4px' }}>
                      {item.message}
                    </p>
                    <div className="row" style={{ gap: 10 }}>
                      <span className="tiny muted">{relativeTime(item.created_at)}</span>
                      {item.link ? (
                        <Link className="link small" to={item.link}>
                          View
                        </Link>
                      ) : null}
                      {!item.read_at ? (
                        <button type="button" className="link small btn-link" onClick={() => markOne(item.id)}>
                          Mark read
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </>
  );
}
