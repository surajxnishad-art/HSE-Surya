import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { formatDateTime, titleCase } from '../lib/format.js';
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

const TONES = {
  low: { bg: '#dcfce7', ink: '#166534' },
  moderate: { bg: '#fef9c3', ink: '#854d0e' },
  high: { bg: '#ffedd5', ink: '#9a3412' },
  extreme: { bg: '#fee2e2', ink: '#991b1b' },
};

export default function RiskMatrixPage() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [profile, setProfile] = useState({
    full_name: '',
    email: '',
    phone: '',
    designation: '',
    department: '',
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [passwords, setPasswords] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [savingPassword, setSavingPassword] = useState(false);
  const [pwErrors, setPwErrors] = useState({});

  useEffect(() => {
    (async () => {
      try {
        const payload = await api.get('/meta/risk-matrix');
        setData(payload);
      } catch (err) {
        setError(err.message);
      }
    })();
  }, []);

  useEffect(() => {
    if (user) {
      setProfile({
        full_name: user.full_name || '',
        email: user.email || '',
        phone: user.phone || '',
        designation: user.designation || '',
        department: user.department || '',
      });
    }
  }, [user]);

  const saveProfile = async (event) => {
    event.preventDefault();
    setSavingProfile(true);
    try {
      await api.put('/auth/profile', profile);
      await refresh();
      toast.success('Profile updated.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async (event) => {
    event.preventDefault();
    setPwErrors({});
    setSavingPassword(true);
    try {
      await api.post('/auth/change-password', passwords);
      setPasswords({ current_password: '', new_password: '', confirm_password: '' });
      toast.success('Password changed. Other sessions were signed out.');
    } catch (err) {
      setPwErrors(err.fields || {});
      toast.error(err.message);
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Risk Matrix & My Profile"
        subtitle="Five-by-five severity and likelihood scoring used across hazard assessments, plus your account security."
      />

      <SectionCard
        title="Risk scoring matrix"
        subtitle="Score = likelihood × severity. Bands drive risk priority and closure urgency."
      >
        {error ? (
          <Alert tone="danger" title="Matrix unavailable">
            {error}
          </Alert>
        ) : !data ? (
          <LoadingScreen label="Loading risk matrix…" />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table matrix-table">
                <thead>
                  <tr>
                    <th>Likelihood ↓ / Severity →</th>
                    {[1, 2, 3, 4, 5].map((severity) => (
                      <th key={severity}>Severity {severity}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.matrix.map((row) => (
                    <tr key={row[0].likelihood}>
                      <th scope="row">Likelihood {row[0].likelihood}</th>
                      {row.map((cell) => {
                        const tone = TONES[cell.level] || TONES.moderate;
                        return (
                          <td key={`${cell.likelihood}-${cell.severity}`}>
                            <div className="matrix-cell" style={{ background: tone.bg, color: tone.ink }}>
                              <span className="matrix-score">{cell.score}</span>
                              <span className="matrix-level">{titleCase(cell.level)}</span>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="row wrap" style={{ gap: 12, marginTop: 14 }}>
              {Object.entries(TONES).map(([level, tone]) => (
                <span key={level} className="row" style={{ gap: 6 }}>
                  <span className="legend-swatch" style={{ background: tone.bg, borderColor: tone.ink }} />
                  <span className="small">{titleCase(level)}</span>
                </span>
              ))}
            </div>
            <p className="tiny muted" style={{ marginTop: 10 }}>
              Apply this matrix in Hazard Identification & Risk Assessment: record likelihood and severity, then set the risk owner,
              hierarchy of control and target closure date. Closure requires verification.
            </p>
          </>
        )}
      </SectionCard>

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <SectionCard title="My profile" subtitle="Contact and role details used across records">
          <form className="stack" onSubmit={saveProfile}>
            <div className="profile-head">
              <div className="avatar avatar-lg">{(profile.full_name || user?.username || '?').slice(0, 2).toUpperCase()}</div>
              <div>
                <div className="strong">{user?.full_name || user?.username}</div>
                <div className="tiny muted">
                  @{user?.username} · <Badge value={user?.role} label={user?.role_label || titleCase(user?.role)} />
                </div>
                <div className="tiny muted">Employee ID: {user?.employee_id || '—'}</div>
              </div>
            </div>
            <Field label="Full name" required>
              <input
                className="input"
                value={profile.full_name}
                onChange={(event) => setProfile({ ...profile, full_name: event.target.value })}
                maxLength={120}
                required
              />
            </Field>
            <div className="form-grid">
              <Field label="Email">
                <input
                  type="email"
                  className="input"
                  value={profile.email}
                  onChange={(event) => setProfile({ ...profile, email: event.target.value })}
                />
              </Field>
              <Field label="Phone">
                <input
                  className="input"
                  value={profile.phone}
                  onChange={(event) => setProfile({ ...profile, phone: event.target.value })}
                  maxLength={40}
                />
              </Field>
              <Field label="Department">
                <input
                  className="input"
                  value={profile.department}
                  onChange={(event) => setProfile({ ...profile, department: event.target.value })}
                  maxLength={80}
                />
              </Field>
              <Field label="Designation">
                <input
                  className="input"
                  value={profile.designation}
                  onChange={(event) => setProfile({ ...profile, designation: event.target.value })}
                  maxLength={80}
                />
              </Field>
            </div>
            <button type="submit" className="btn btn-primary" disabled={savingProfile}>
              {savingProfile ? <Spinner /> : <Icon name="save" size={16} />} Save profile
            </button>
            <p className="tiny muted">
              Last sign-in: {user?.last_login_at ? formatDateTime(user.last_login_at) : 'this is your first session'}
            </p>
          </form>
        </SectionCard>

        <SectionCard title="Change password" subtitle="Passwords are hashed on the server and never stored in the browser">
          <form className="stack" onSubmit={changePassword}>
            <Field label="Current password" required error={pwErrors.current_password}>
              <input
                type="password"
                className="input"
                value={passwords.current_password}
                onChange={(event) => setPasswords({ ...passwords, current_password: event.target.value })}
                autoComplete="current-password"
                required
              />
            </Field>
            <Field
              label="New password"
              required
              hint="At least 8 characters with a letter and a number."
              error={pwErrors.new_password}
            >
              <input
                type="password"
                className="input"
                value={passwords.new_password}
                onChange={(event) => setPasswords({ ...passwords, new_password: event.target.value })}
                autoComplete="new-password"
                required
              />
            </Field>
            <Field label="Confirm new password" required error={pwErrors.confirm_password}>
              <input
                type="password"
                className="input"
                value={passwords.confirm_password}
                onChange={(event) => setPasswords({ ...passwords, confirm_password: event.target.value })}
                autoComplete="new-password"
                required
              />
            </Field>
            <button type="submit" className="btn btn-secondary" disabled={savingPassword}>
              {savingPassword ? <Spinner /> : <Icon name="lock" size={16} />} Update password
            </button>
            <p className="tiny muted">
              Changing your password signs out every other device. Session cookies are HTTP-only and expire automatically.
            </p>
          </form>
        </SectionCard>
      </div>
    </>
  );
}
