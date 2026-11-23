import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import { Field, PasswordInput, Spinner, useToast } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';

const DEPARTMENTS = [
  'Production',
  'Maintenance',
  'Electrical',
  'Warehouse',
  'Logistics',
  'Quality',
  'Utilities',
  'Administration',
  'HSE',
];

export function AuthLayout({ children, heading, sub }) {
  return (
    <div className="auth-wrap">
      <aside className="auth-hero">
        <div className="auth-hero-inner">
          <div className="brand" style={{ padding: 0 }}>
            <div className="brand-mark">
              <Icon name="shield" size={22} strokeWidth={2} style={{ color: '#fff' }} />
            </div>
            <div>
              <div className="brand-title">INDUSTRIAL HSE PRO</div>
              <div className="brand-sub">Enterprise Safety Management</div>
            </div>
          </div>
          <h1>Industrial safety management, engineered end to end.</h1>
          <p>
            Incidents, inspections, risk registers, permits, PPE, training, audits and corrective actions in one governed
            system — with live TRIR/LTIFR analytics and board-ready reporting.
          </p>
          <div className="auth-features">
            {[
              ['incident', 'Incident & near-miss register'],
              ['inspection', 'Scored site inspections'],
              ['hazard', 'Risk matrix & controls'],
              ['permit', 'Permit-to-work approvals'],
              ['ppe', 'PPE issue history'],
              ['training', 'Training competency'],
              ['actions', 'CAPA closure tracking'],
              ['reports', 'PDF & Excel reporting'],
            ].map(([icon, label]) => (
              <div className="auth-feature" key={label}>
                <Icon name={icon} size={16} style={{ color: '#5eead4', flex: '0 0 16px' }} />
                {label}
              </div>
            ))}
          </div>
        </div>
        <div className="auth-hero-foot">Secure server-side sessions · Role-based access · Audit trail on every change</div>
      </aside>
      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-mobile-brand">
            <div className="brand-mark">
              <Icon name="shield" size={22} strokeWidth={2} style={{ color: '#fff' }} />
            </div>
            <div>
              <div className="brand-title" style={{ color: 'var(--ink-900)' }}>INDUSTRIAL HSE PRO</div>
              <div className="brand-sub" style={{ color: 'var(--ink-500)' }}>Enterprise Safety Management</div>
            </div>
          </div>
          <div className="auth-title">{heading}</div>
          <div className="auth-sub">{sub}</div>
          {children}
        </div>
      </section>
    </div>
  );
}

export function LoginPage() {
  const { login, boot, user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    if (boot?.needsSetup) navigate('/setup', { replace: true });
  }, [boot, navigate]);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!username.trim() || !password) {
      setError('Enter your username and password.');
      return;
    }
    setBusy(true);
    try {
      await login(username.trim(), password, remember);
      toast.success('Signed in successfully.');
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || 'Unable to sign in.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout heading="Sign in to your workspace" sub="Use the account created by you or issued by your HSE administrator.">
      <form className="card card-pad" onSubmit={submit} noValidate>
        {error ? (
          <div className="alert alert-error" style={{ marginBottom: 14 }}>
            <Icon name="alertCircle" size={17} style={{ flex: '0 0 17px' }} />
            <span>{error}</span>
          </div>
        ) : null}
        <div className="col" style={{ gap: 14 }}>
          <Field label="Username" htmlFor="username" required>
            <input
              id="username"
              className="input"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              placeholder="e.g. r.sharma"
              autoCapitalize="none"
              spellCheck={false}
            />
          </Field>
          <Field label="Password" htmlFor="password" required>
            <PasswordInput id="password" value={password} onChange={setPassword} placeholder="Enter your password" />
          </Field>
          <div className="row-between">
            <label className="checkbox-row">
              <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
              Remember me
            </label>
            <Link to="/forgot-password" className="btn-link">
              Forgot password?
            </Link>
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={busy} style={{ minHeight: 44 }}>
            {busy ? <Spinner tone="white" /> : <Icon name="logout" size={17} style={{ transform: 'rotate(180deg)' }} />}
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </div>
      </form>
      <div className="auth-alt">
        New to the platform? <Link to="/register">Create an account</Link>
      </div>
      {boot?.aiConfigured === false ? (
        <p className="tiny muted center" style={{ marginTop: 18 }}>
          AI assistance is optional. All HSE modules work without it.
        </p>
      ) : null}
    </AuthLayout>
  );
}

export function RegisterPage() {
  const { register, boot } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    username: '',
    fullName: '',
    password: '',
    confirmPassword: '',
    department: '',
    designation: '',
    employeeCode: '',
    email: '',
    phone: '',
  });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  const set = (key) => (value) => setForm((prev) => ({ ...prev, [key]: value }));

  const validate = () => {
    const next = {};
    if (!/^[a-zA-Z0-9._-]{3,32}$/.test(form.username.trim())) next.username = 'Use 3–32 letters, numbers, dot, dash or underscore.';
    if (form.fullName.trim().length < 3) next.fullName = 'Enter your full name.';
    if (form.password.length < 8) next.password = 'Use at least 8 characters.';
    else if (!/[A-Za-z]/.test(form.password) || !/[0-9]/.test(form.password)) next.password = 'Include at least one letter and one number.';
    if (form.password !== form.confirmPassword) next.confirmPassword = 'Passwords do not match.';
    if (!form.department.trim()) next.department = 'Select your department.';
    if (!form.designation.trim()) next.designation = 'Enter your designation.';
    if (!form.employeeCode.trim()) next.employeeCode = 'Enter your employee ID.';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email)) next.email = 'Enter a valid email address.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!validate()) return;
    setBusy(true);
    try {
      const data = await register({
        username: form.username.trim(),
        fullName: form.fullName.trim(),
        password: form.password,
        confirmPassword: form.confirmPassword,
        department: form.department.trim(),
        designation: form.designation.trim(),
        employeeCode: form.employeeCode.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
      });
      setDone(data?.message || 'Registration submitted.');
      toast.success('Registration submitted.');
    } catch (err) {
      if (err.fields) setErrors(err.fields);
      setError(err.message || 'Registration failed.');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <AuthLayout heading="Registration received" sub="Your account request has been recorded.">
        <div className="card card-pad">
          <div className="alert alert-success" style={{ marginBottom: 16 }}>
            <Icon name="checkCircle" size={17} style={{ flex: '0 0 17px' }} />
            <span>{done}</span>
          </div>
          <p className="small muted" style={{ lineHeight: 1.6 }}>
            {boot?.registrationApprovalRequired
              ? 'An administrator must approve your account before first sign-in. You will be able to sign in with the username and password you just chose once approved.'
              : 'You can sign in immediately with the username and password you just chose.'}
          </p>
          <button type="button" className="btn btn-primary btn-block" style={{ marginTop: 18 }} onClick={() => navigate('/login')}>
            Go to sign in
          </button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout heading="Create your account" sub="Register once — your HSE records stay linked to your account across devices.">
      <form className="card card-pad" onSubmit={submit} noValidate>
        {error ? (
          <div className="alert alert-error" style={{ marginBottom: 14 }}>
            <Icon name="alertCircle" size={17} style={{ flex: '0 0 17px' }} />
            <span>{error}</span>
          </div>
        ) : null}
        {boot?.registrationApprovalRequired ? (
          <div className="alert alert-info" style={{ marginBottom: 14 }}>
            <Icon name="info" size={17} style={{ flex: '0 0 17px' }} />
            <span>New accounts require administrator approval before first sign-in.</span>
          </div>
        ) : null}
        <div className="form-grid">
          <Field label="Username" required error={errors.username}>
            <input className={`input ${errors.username ? 'error' : ''}`} value={form.username} onChange={(e) => set('username')(e.target.value)} autoCapitalize="none" spellCheck={false} placeholder="r.sharma" />
          </Field>
          <Field label="Full Name" required error={errors.fullName}>
            <input className={`input ${errors.fullName ? 'error' : ''}`} value={form.fullName} onChange={(e) => set('fullName')(e.target.value)} placeholder="Ravi Sharma" />
          </Field>
          <Field label="Password" required error={errors.password} hint="Minimum 8 characters with letters and numbers.">
            <PasswordInput id="reg-password" value={form.password} onChange={set('password')} autoComplete="new-password" placeholder="Create a password" />
          </Field>
          <Field label="Confirm Password" required error={errors.confirmPassword}>
            <PasswordInput id="reg-confirm" value={form.confirmPassword} onChange={set('confirmPassword')} autoComplete="new-password" placeholder="Re-enter password" />
          </Field>
          <Field label="Department" required error={errors.department}>
            <input className={`input ${errors.department ? 'error' : ''}`} list="dept-list" value={form.department} onChange={(e) => set('department')(e.target.value)} placeholder="Production" />
            <datalist id="dept-list">
              {DEPARTMENTS.map((dept) => (
                <option key={dept} value={dept} />
              ))}
            </datalist>
          </Field>
          <Field label="Designation" required error={errors.designation}>
            <input className={`input ${errors.designation ? 'error' : ''}`} value={form.designation} onChange={(e) => set('designation')(e.target.value)} placeholder="Safety Officer" />
          </Field>
          <Field label="Employee ID" required error={errors.employeeCode}>
            <input className={`input ${errors.employeeCode ? 'error' : ''}`} value={form.employeeCode} onChange={(e) => set('employeeCode')(e.target.value)} placeholder="EMP-1042" />
          </Field>
          <Field label="Email" error={errors.email}>
            <input className={`input ${errors.email ? 'error' : ''}`} type="email" value={form.email} onChange={(e) => set('email')(e.target.value)} placeholder="name@company.com" autoComplete="email" />
          </Field>
          <Field label="Contact Number" error={errors.phone} className="span-2">
            <input className={`input ${errors.phone ? 'error' : ''}`} value={form.phone} onChange={(e) => set('phone')(e.target.value)} placeholder="+91 98765 43210" autoComplete="tel" />
          </Field>
        </div>
        <button type="submit" className="btn btn-primary btn-block" style={{ marginTop: 18, minHeight: 44 }} disabled={busy}>
          {busy ? <Spinner tone="white" /> : <Icon name="user" size={17} />}
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <div className="auth-alt">
        Already registered? <Link to="/login">Sign in</Link>
      </div>
    </AuthLayout>
  );
}

export function SetupPage() {
  const { setup, boot, refresh } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', fullName: '', password: '', confirmPassword: '', email: '', phone: '' });
  const [error, setError] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const set = (key) => (value) => setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setErrors({});
    if (form.password.length < 8 || !/[A-Za-z]/.test(form.password) || !/[0-9]/.test(form.password)) {
      setErrors({ password: 'Use at least 8 characters including a letter and a number.' });
      return;
    }
    if (form.password !== form.confirmPassword) {
      setErrors({ confirmPassword: 'Passwords do not match.' });
      return;
    }
    setBusy(true);
    try {
      await setup({
        username: form.username.trim(),
        fullName: form.fullName.trim(),
        password: form.password,
        confirmPassword: form.confirmPassword,
        department: 'HSE',
        designation: 'Super Admin',
        employeeCode: 'SA-001',
        email: form.email.trim(),
        phone: form.phone.trim(),
      });
      toast.success('Super Admin created. Welcome aboard.');
      navigate('/', { replace: true });
    } catch (err) {
      if (err.fields) setErrors(err.fields);
      setError(err.message || 'Setup failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout heading="First-run setup" sub="Create the Super Admin account. This page closes permanently once a user exists.">
      <form className="card card-pad" onSubmit={submit} noValidate>
        {boot && boot.needsSetup === false ? (
          <div className="alert alert-warn" style={{ marginBottom: 14 }}>
            <Icon name="alertCircle" size={17} style={{ flex: '0 0 17px' }} />
            <span>
              Setup is already complete. <Link to="/login">Go to sign in</Link>.
            </span>
          </div>
        ) : null}
        {error ? (
          <div className="alert alert-error" style={{ marginBottom: 14 }}>
            <Icon name="alertCircle" size={17} style={{ flex: '0 0 17px' }} />
            <span>{error}</span>
          </div>
        ) : null}
        <div className="form-grid">
          <Field label="Username" required error={errors.username}>
            <input className={`input ${errors.username ? 'error' : ''}`} value={form.username} onChange={(e) => set('username')(e.target.value)} autoCapitalize="none" spellCheck={false} />
          </Field>
          <Field label="Full Name" required error={errors.fullName}>
            <input className={`input ${errors.fullName ? 'error' : ''}`} value={form.fullName} onChange={(e) => set('fullName')(e.target.value)} />
          </Field>
          <Field label="Password" required error={errors.password} hint="At least 8 characters, letters and numbers.">
            <PasswordInput id="setup-password" value={form.password} onChange={set('password')} autoComplete="new-password" />
          </Field>
          <Field label="Confirm Password" required error={errors.confirmPassword}>
            <PasswordInput id="setup-confirm" value={form.confirmPassword} onChange={set('confirmPassword')} autoComplete="new-password" />
          </Field>
          <Field label="Email" error={errors.email}>
            <input className={`input ${errors.email ? 'error' : ''}`} type="email" value={form.email} onChange={(e) => set('email')(e.target.value)} />
          </Field>
          <Field label="Contact Number" error={errors.phone}>
            <input className={`input ${errors.phone ? 'error' : ''}`} value={form.phone} onChange={(e) => set('phone')(e.target.value)} />
          </Field>
        </div>
        <button type="submit" className="btn btn-primary btn-block" style={{ marginTop: 18, minHeight: 44 }} disabled={busy || boot?.needsSetup === false}>
          {busy ? <Spinner tone="white" /> : <Icon name="shield" size={17} />}
          {busy ? 'Creating Super Admin…' : 'Create Super Admin'}
        </button>
      </form>
    </AuthLayout>
  );
}

export function ForgotPasswordPage() {
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState('');
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setSent('');
    if (!username.trim()) {
      setError('Enter your username.');
      return;
    }
    setBusy(true);
    try {
      const data = await api.post('/auth/forgot-password', { username: username.trim() });
      setSent(data?.message || 'If the account exists, a reset request has been sent to your HSE administrator.');
    } catch (err) {
      setError(err.message || 'Unable to submit request.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout heading="Forgot password" sub="Request a secure reset from your administrator.">
      <form className="card card-pad" onSubmit={submit} noValidate>
        {error ? (
          <div className="alert alert-error" style={{ marginBottom: 14 }}>
            <Icon name="alertCircle" size={17} style={{ flex: '0 0 17px' }} />
            <span>{error}</span>
          </div>
        ) : null}
        {sent ? (
          <div className="alert alert-success" style={{ marginBottom: 14 }}>
            <Icon name="checkCircle" size={17} style={{ flex: '0 0 17px' }} />
            <span>{sent}</span>
          </div>
        ) : null}
        <Field label="Username" required>
          <input className="input" value={username} onChange={(event) => setUsername(event.target.value)} autoCapitalize="none" placeholder="Your username" />
        </Field>
        <button type="submit" className="btn btn-primary btn-block" style={{ marginTop: 16 }} disabled={busy}>
          {busy ? <Spinner tone="white" /> : <Icon name="mail" size={17} />}
          Request password reset
        </button>
        <div className="auth-alt">
          <Link to="/login">Back to sign in</Link>
          {' · '}
          <Link to="/reset-password">I have a reset token</Link>
        </div>
      </form>
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const value = params.get('token');
    if (value) setToken(value);
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Use at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/auth/reset-password', { token: token.trim(), password, confirmPassword });
      toast.success('Password updated. Please sign in.');
      navigate('/login', { replace: true });
    } catch (err) {
      setError(err.message || 'Unable to reset password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout heading="Set a new password" sub="Paste the reset token issued by your administrator.">
      <form className="card card-pad" onSubmit={submit} noValidate>
        {error ? (
          <div className="alert alert-error" style={{ marginBottom: 14 }}>
            <Icon name="alertCircle" size={17} style={{ flex: '0 0 17px' }} />
            <span>{error}</span>
          </div>
        ) : null}
        <div className="col" style={{ gap: 14 }}>
          <Field label="Reset Token" required>
            <input className="input mono" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Paste token" autoCapitalize="none" spellCheck={false} />
          </Field>
          <Field label="New Password" required>
            <PasswordInput id="reset-password" value={password} onChange={setPassword} autoComplete="new-password" />
          </Field>
          <Field label="Confirm New Password" required>
            <PasswordInput id="reset-confirm" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" />
          </Field>
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? <Spinner tone="white" /> : <Icon name="lock" size={17} />}
            Update password
          </button>
        </div>
      </form>
    </AuthLayout>
  );
}

export function useCompanyName() {
  const { meta } = useAuth();
  return meta?.options?.settings?.company_name || 'Industrial HSE Pro';
}
