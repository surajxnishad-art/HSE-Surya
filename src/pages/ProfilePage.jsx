import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { formatDate, formatDateTime, initials, titleCase } from '../lib/format.js';
import {
  Alert,
  Badge,
  Field,
  LoadingScreen,
  PageHeader,
  SectionCard,
  Spinner,
  useToast,
} from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const PERMISSION_LABELS = [
  ['viewAll', 'View all company records'],
  ['manageUsers', 'Manage users and approvals'],
  ['system', 'System settings and audit log'],
  ['approve', 'Approve permits and registrations'],
  ['verify', 'Verify and close corrective actions'],
  ['readOnly', 'Read-only access'],
];

export default function ProfilePage() {
  const { user, refresh, meta } = useAuth();
  const toast = useToast();
  const options = meta?.options || {};
  const departments = useMemo(
    () => (options.departments || []).map((d) => d.name).filter(Boolean),
    [options.departments],
  );

  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    designation: '',
    department: '',
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileErrors, setProfileErrors] = useState({});
  const [profileError, setProfileError] = useState('');

  const [pw, setPw] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [pwErrors, setPwErrors] = useState({});
  const [pwError, setPwError] = useState('');
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => {
    if (!user) return;
    setForm({
      full_name: user.full_name || '',
      email: user.email || '',
      phone: user.phone || '',
      designation: user.designation || '',
      department: user.department || '',
    });
  }, [user]);

  const setField = (name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
    setProfileErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const submitProfile = async (event) => {
    event.preventDefault();
    setProfileError('');
    const errors = {};
    if (!form.full_name || form.full_name.trim().length < 3) errors.full_name = 'Enter your full name.';
    if (form.email && !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(form.email.trim())) {
      errors.email = 'Enter a valid email address.';
    }
    setProfileErrors(errors);
    if (Object.keys(errors).length) return;
    setSavingProfile(true);
    try {
      await api.put('/auth/profile', {
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        designation: form.designation.trim(),
        department: form.department,
      });
      await refresh();
      toast.success('Profile updated.');
    } catch (error) {
      setProfileError(error.message || 'Unable to save your profile.');
      if (error.fields) setProfileErrors(error.fields);
    } finally {
      setSavingProfile(false);
    }
  };

  const submitPassword = async (event) => {
    event.preventDefault();
    setPwError('');
    const errors = {};
    if (!pw.current_password) errors.current_password = 'Enter your current password.';
    if (pw.new_password.length < 8) errors.new_password = 'Use at least 8 characters.';
    if (pw.new_password !== pw.confirm_password) errors.confirm_password = 'Passwords do not match.';
    setPwErrors(errors);
    if (Object.keys(errors).length) return;
    setSavingPw(true);
    try {
      const data = await api.post('/auth/change-password', pw);
      setPw({ current_password: '', new_password: '', confirm_password: '' });
      toast.success(data.message || 'Password changed.');
    } catch (error) {
      setPwError(error.message || 'Unable to change your password.');
      if (error.fields) setPwErrors(error.fields);
    } finally {
      setSavingPw(false);
    }
  };

  if (!user) return <LoadingScreen />;

  const permissions = user.permissions || {};

  return (
    <>
      <PageHeader
        title="My Account"
        subtitle="Manage your HSE profile, credentials and access level."
      />

      <div className="grid-2">
        <SectionCard title="Account details" subtitle="Your identity on HSE records and reports.">
          <form onSubmit={submitProfile} className="form-grid" noValidate>
            {profileError ? <Alert tone="error" className="span-2">{profileError}</Alert> : null}
            <Field
              label="Full name"
              required
              value={form.full_name}
              onChange={(e) => setField('full_name', e.target.value)}
              error={profileErrors.full_name}
              autoComplete="name"
            />
            <Field label="Username" value={user.username} readOnly disabled hint="Usernames cannot be changed." />
            <Field
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => setField('email', e.target.value)}
              error={profileErrors.email}
              autoComplete="email"
            />
            <Field
              label="Contact number"
              value={form.phone}
              onChange={(e) => setField('phone', e.target.value)}
              error={profileErrors.phone}
              autoComplete="tel"
            />
            <Field
              label="Designation"
              value={form.designation}
              onChange={(e) => setField('designation', e.target.value)}
              error={profileErrors.designation}
            />
            {departments.length ? (
              <Field
                label="Department"
                type="select"
                value={form.department}
                onChange={(e) => setField('department', e.target.value)}
                options={departments.map((d) => ({ value: d, label: d }))}
                error={profileErrors.department}
              />
            ) : (
              <Field
                label="Department"
                value={form.department}
                onChange={(e) => setField('department', e.target.value)}
                error={profileErrors.department}
              />
            )}
            <div className="span-2 form-actions">
              <button type="submit" className="btn btn-primary" disabled={savingProfile}>
                {savingProfile ? <Spinner /> : <Icon name="check" size={16} />}
                Save changes
              </button>
            </div>
          </form>
        </SectionCard>

        <div className="stack">
          <SectionCard title="Access level">
            <div className="profile-summary">
              <div className="avatar avatar-lg">{initials(user.full_name)}</div>
              <div>
                <div className="profile-name">{user.full_name}</div>
                <div className="muted small">@{user.username}</div>
                <div className="row-gap" style={{ marginTop: 8 }}>
                  <Badge value={user.role} label={user.role_label || titleCase(user.role)} />
                  <Badge value={user.status} label={titleCase(user.status)} />
                </div>
              </div>
            </div>
            <dl className="detail-list" style={{ marginTop: 16 }}>
              <div><dt>Employee ID</dt><dd>{user.employee_id || '—'}</dd></div>
              <div><dt>Department</dt><dd>{user.department || '—'}</dd></div>
              <div><dt>Designation</dt><dd>{user.designation || '—'}</dd></div>
              <div><dt>Account created</dt><dd>{formatDate(user.created_at)}</dd></div>
              <div><dt>Last login</dt><dd>{user.last_login_at ? formatDateTime(user.last_login_at) : 'First session'}</dd></div>
            </dl>
          </SectionCard>

          <SectionCard title="Permissions" subtitle="Granted by your assigned role.">
            <ul className="perm-list">
              {PERMISSION_LABELS.filter(([key]) => (key === 'readOnly' ? permissions.readOnly : permissions[key])).map(
                ([key, label]) => (
                  <li key={key}>
                    <Icon name="check" size={15} />
                    {label}
                  </li>
                ),
              )}
              {PERMISSION_LABELS.every(([key]) =>
                key === 'readOnly' ? !permissions.readOnly : !permissions[key],
              ) ? (
                <li className="muted">Standard contributor access: create and edit your own HSE records.</li>
              ) : null}
            </ul>
          </SectionCard>
        </div>
      </div>

      <SectionCard title="Change password" subtitle="Changing your password signs out your other sessions.">
        <form onSubmit={submitPassword} className="form-grid" noValidate>
          {pwError ? <Alert tone="error" className="span-2">{pwError}</Alert> : null}
          <Field
            label="Current password"
            type="password"
            required
            value={pw.current_password}
            onChange={(e) => {
              setPw((prev) => ({ ...prev, current_password: e.target.value }));
              setPwErrors((prev) => ({ ...prev, current_password: undefined }));
            }}
            error={pwErrors.current_password}
            autoComplete="current-password"
          />
          <div className="field-hidden" aria-hidden="true" />
          <Field
            label="New password"
            type="password"
            required
            value={pw.new_password}
            onChange={(e) => {
              setPw((prev) => ({ ...prev, new_password: e.target.value }));
              setPwErrors((prev) => ({ ...prev, new_password: undefined }));
            }}
            error={pwErrors.new_password}
            hint="At least 8 characters with letters and numbers."
            autoComplete="new-password"
          />
          <Field
            label="Confirm new password"
            type="password"
            required
            value={pw.confirm_password}
            onChange={(e) => {
              setPw((prev) => ({ ...prev, confirm_password: e.target.value }));
              setPwErrors((prev) => ({ ...prev, confirm_password: undefined }));
            }}
            error={pwErrors.confirm_password}
            autoComplete="new-password"
          />
          <div className="span-2 form-actions">
            <button type="submit" className="btn btn-primary" disabled={savingPw}>
              {savingPw ? <Spinner /> : <Icon name="lock" size={16} />}
              Update password
            </button>
          </div>
        </form>
      </SectionCard>
    </>
  );
}
