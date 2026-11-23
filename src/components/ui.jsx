import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './icons.jsx';
import { badgeTone, titleCase } from '../lib/format.js';

/* ------------------------------------------------------------------ toasts */

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const push = useCallback((message, tone = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((list) => [...list.slice(-3), { id, message, tone }]);
    setTimeout(() => setToasts((list) => list.filter((item) => item.id !== id)), 5200);
  }, []);

  const value = useMemo(
    () => ({
      toast: push,
      success: (message) => push(message, 'success'),
      error: (message) => push(message, 'error'),
      warn: (message) => push(message, 'warn'),
      info: (message) => push(message, 'info'),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((item) => (
          <div key={item.id} className={`toast ${item.tone}`}>
            <Icon
              name={item.tone === 'success' ? 'checkCircle' : item.tone === 'error' ? 'alertCircle' : 'info'}
              size={17}
              style={{ flex: '0 0 17px', marginTop: 1, color: item.tone === 'success' ? 'var(--green-600)' : item.tone === 'error' ? 'var(--red-600)' : 'var(--blue-600)' }}
            />
            <span style={{ flex: 1 }}>{item.message}</span>
            <button
              type="button"
              className="btn-link"
              aria-label="Dismiss notification"
              onClick={() => setToasts((list) => list.filter((t) => t.id !== item.id))}
              style={{ color: 'var(--ink-400)' }}
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}

/* ---------------------------------------------------------------- primitives */

export function Spinner({ size = 'sm', tone = '' }) {
  return <span className={`spinner ${size === 'lg' ? 'lg' : ''} ${tone}`} aria-hidden="true" />;
}

export function LoadingScreen({ label = 'Loading workspace…' }) {
  return (
    <div className="loading-screen">
      <Spinner size="lg" />
      <p className="muted small">{label}</p>
    </div>
  );
}

export function Badge({ value, label, tone }) {
  const text = label ?? titleCase(value);
  return (
    <span className={`badge badge-${tone || badgeTone(value)}`}>
      <span className="bdot" />
      {text}
    </span>
  );
}

export function StatCard({ label, value, icon = 'activity', tone = 'blue', foot, accent }) {
  const tones = {
    blue: ['var(--blue-50)', 'var(--blue-600)'],
    teal: ['var(--teal-100)', 'var(--teal-700)'],
    orange: ['var(--orange-100)', 'var(--orange-600)'],
    red: ['var(--red-100)', 'var(--red-600)'],
    green: ['var(--green-100)', 'var(--green-600)'],
    amber: ['var(--amber-100)', 'var(--amber-600)'],
    violet: ['var(--violet-100)', 'var(--violet-600)'],
  };
  const [bg, fg] = tones[tone] || tones.blue;
  return (
    <div className="kpi" style={accent ? { borderTop: `3px solid ${accent}` } : undefined}>
      <div className="kpi-top">
        <span className="kpi-label">{label}</span>
        <span className="kpi-icon" style={{ background: bg, color: fg }}>
          <Icon name={icon} size={16} />
        </span>
      </div>
      <div className="kpi-value">{value}</div>
      {foot ? <div className="kpi-foot">{foot}</div> : null}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, children }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p className="sub">{subtitle}</p> : null}
        {children}
      </div>
      {actions ? <div className="row-wrap">{actions}</div> : null}
    </div>
  );
}

export function SectionCard({ title, subtitle, actions, children, bodyClass = 'card-body', head = true }) {
  return (
    <section className="card">
      {head ? (
        <div className="card-head">
          <div>
            <h2>{title}</h2>
            {subtitle ? <p className="small muted" style={{ marginTop: 2 }}>{subtitle}</p> : null}
          </div>
          {actions ? <div className="row-wrap">{actions}</div> : null}
        </div>
      ) : null}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

export function EmptyState({ icon = 'fileText', title, message, action }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name={icon} size={24} />
      </div>
      <h3>{title}</h3>
      {message ? <p>{message}</p> : null}
      {action}
    </div>
  );
}

export function Field({ label, htmlFor, required, error, hint, children, className = '' }) {
  return (
    <div className={`field ${className}`}>
      {label ? (
        <label htmlFor={htmlFor}>
          {label}
          {required ? <span className="req">*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? <span className="field-error">{error}</span> : null}
      {!error && hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  );
}

/* -------------------------------------------------------------------- modal */

export function Modal({ open, onClose, title, subtitle, children, footer, size = '' }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
      <div className={`modal ${size}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : 'Dialog'}>
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle ? <p className="small muted" style={{ marginTop: 3 }}>{subtitle}</p> : null}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close dialog">
            <Icon name="close" size={17} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', tone = 'danger', busy, onConfirm, onClose }) {
  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title={title}
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className={`btn ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={busy}>
            {busy ? <Spinner tone="white" /> : null}
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="small" style={{ color: 'var(--ink-700)', lineHeight: 1.6 }}>{message}</p>
    </Modal>
  );
}

/* --------------------------------------------------------------- pagination */

export function Pagination({ page, pages, total, pageSize, onPage, busy }) {
  if (!total) return null;
  const current = Number(page) || 1;
  const last = Math.max(1, Number(pages) || 1);
  const numbers = [];
  const start = Math.max(1, Math.min(current - 1, last - 2));
  for (let index = start; index <= Math.min(last, start + 2); index += 1) numbers.push(index);
  const from = (current - 1) * pageSize + 1;
  const to = Math.min(total, current * pageSize);
  return (
    <div className="pagination">
      <span className="small muted">
        Showing <strong>{from}–{to}</strong> of <strong>{total}</strong>
      </span>
      <div className="pages">
        <button type="button" className="page-btn" onClick={() => onPage(current - 1)} disabled={current <= 1 || busy} aria-label="Previous page">
          <Icon name="chevronLeft" size={14} />
        </button>
        {numbers.map((number) => (
          <button
            type="button"
            key={number}
            className={`page-btn ${number === current ? 'active' : ''}`}
            onClick={() => onPage(number)}
            disabled={busy}
          >
            {number}
          </button>
        ))}
        <button type="button" className="page-btn" onClick={() => onPage(current + 1)} disabled={current >= last || busy} aria-label="Next page">
          <Icon name="chevronRight" size={14} />
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ helpers */

export function Alert({ tone = 'info', children, title }) {
  return (
    <div className={`alert alert-${tone}`}>
      <Icon name={tone === 'error' ? 'alertCircle' : tone === 'warn' ? 'alertCircle' : tone === 'success' ? 'checkCircle' : 'info'} size={17} style={{ flex: '0 0 17px', marginTop: 1 }} />
      <div style={{ minWidth: 0 }}>
        {title ? <strong style={{ display: 'block', marginBottom: 2 }}>{title}</strong> : null}
        <div>{children}</div>
      </div>
    </div>
  );
}

export function useDebounced(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  const timer = useRef(null);
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer.current);
  }, [value, delay]);
  return debounced;
}

export function PasswordInput({ id, value, onChange, placeholder, autoComplete = 'current-password', error }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="input-wrap">
      <input
        id={id}
        className={`input ${error ? 'error' : ''}`}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
      />
      <button type="button" className="peek" onClick={() => setVisible((v) => !v)} aria-label={visible ? 'Hide password' : 'Show password'}>
        <Icon name={visible ? 'eyeOff' : 'eye'} size={17} />
      </button>
    </div>
  );
}

export function ErrorNote({ message }) {
  if (!message) return null;
  return <Alert tone="error">{message}</Alert>;
}
