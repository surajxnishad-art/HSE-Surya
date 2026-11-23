import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import AppShell, { modulePath } from './components/AppShell.jsx';
import { LoadingScreen } from './components/ui.jsx';
import {
  ForgotPasswordPage,
  LoginPage,
  RegisterPage,
  ResetPasswordPage,
  SetupPage,
} from './pages/AuthPages.jsx';
import DashboardPage from './pages/Dashboard.jsx';
import ResourcePage from './pages/ResourcePage.jsx';
import DocumentsPage from './pages/DocumentsPage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';
import AiPage from './pages/AiPage.jsx';
import NotificationsPage from './pages/NotificationsPage.jsx';
import RiskMatrixPage from './pages/RiskMatrixPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import { Icon } from './components/icons.jsx';

const CUSTOM_MODULES = new Set(['documents']);

function ServerUnavailable({ message, onRetry }) {
  return (
    <div className="auth-shell">
      <div className="auth-card" style={{ maxWidth: 460, textAlign: 'center' }}>
        <div className="auth-brand-mark" style={{ margin: '0 auto 16px' }}>
          <Icon name="alert" size={26} />
        </div>
        <h2 style={{ marginBottom: 8 }}>Cannot reach the HSE server</h2>
        <p className="muted" style={{ marginBottom: 18 }}>{message || 'The application server did not respond.'}</p>
        <button type="button" className="btn btn-primary btn-block" onClick={onRetry}>Try again</button>
      </div>
    </div>
  );
}

export default function App() {
  const { user, boot, meta, loading, bootError, refresh, isAdmin } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingScreen label="Starting Industrial HSE Pro…" />;
  if (bootError && !boot) return <ServerUnavailable message={bootError} onRetry={refresh} />;

  const needsSetup = Boolean(boot?.needsSetup) && !user;

  if (!user) {
    if (needsSetup) {
      return (
        <Routes>
          <Route path="/setup" element={<SetupPage />} />
          <Route path="*" element={<Navigate to="/setup" replace />} />
        </Routes>
      );
    }
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="*" element={<Navigate to="/login" replace state={{ from: location.pathname }} />} />
      </Routes>
    );
  }

  const modules = (meta?.modules || []).filter((m) => !CUSTOM_MODULES.has(m.name));

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="/register" element={<Navigate to="/" replace />} />
      <Route path="/setup" element={<Navigate to="/" replace />} />
      <Route path="/forgot-password" element={<Navigate to="/" replace />} />
      <Route path="/reset-password" element={<Navigate to="/" replace />} />

      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/risk-matrix" element={<RiskMatrixPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/ai" element={<AiPage />} />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/admin" element={isAdmin ? <AdminPage /> : <Navigate to="/" replace />} />
        {modules.map((m) => (
          <Route key={m.name} path={modulePath(m.name)} element={<ResourcePage moduleName={m.name} />} />
        ))}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

function NotFound() {
  return (
    <div className="empty-state" style={{ padding: '64px 24px' }}>
      <div className="empty-icon"><Icon name="search" size={26} /></div>
      <h3>Page not found</h3>
      <p className="muted">This section does not exist or you no longer have access to it.</p>
      <a className="btn btn-primary" href="/" style={{ marginTop: 14 }}>Back to dashboard</a>
    </div>
  );
}
