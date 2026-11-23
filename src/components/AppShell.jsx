import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Icon, MODULE_ICONS } from './icons.jsx';
import { api } from '../lib/api.js';
import { initials, titleCase } from '../lib/format.js';
import { Spinner } from './ui.jsx';

const CUSTOM_MODULES = new Set(['documents']);

const STATIC_NAV = [
  { to: '/', label: 'Dashboard', icon: 'dashboard', end: true, title: 'HSE Dashboard' },
  { to: '/documents', label: 'Documents', icon: 'documents', title: 'Document Management' },
  { to: '/risk-matrix', label: 'Risk Matrix', icon: 'grid', title: 'Risk Assessment Matrix' },
  { to: '/reports', label: 'Reports', icon: 'reports', title: 'Reports & Exports' },
  { to: '/ai', label: 'AI Assistant', icon: 'ai', title: 'AI Safety Assistant' },
];

export function modulePath(name) {
  return name === 'manHours' ? '/man-hours' : `/${name}`;
}

export default function AppShell() {
  const { user, meta, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const menuRef = useRef(null);

  const modules = useMemo(() => (meta?.modules || []).filter((m) => !CUSTOM_MODULES.has(m.name)), [meta]);

  const loadUnread = useCallback(async () => {
    try {
      const data = await api.get('/notifications/');
      setUnread(Number(data.unread || 0));
    } catch {
      /* badge is non-critical */
    }
  }, []);

  useEffect(() => {
    loadUnread();
    const timer = setInterval(loadUnread, 60000);
    return () => clearInterval(timer);
  }, [loadUnread, location.pathname]);

  useEffect(() => {
    setSidebarOpen(false);
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onClick = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const allNav = useMemo(
    () => [...STATIC_NAV, ...modules.map((m) => ({ to: modulePath(m.name), label: m.label, icon: MODULE_ICONS[m.name] || 'list', title: m.label }))],
    [modules],
  );

  const current =
    allNav.find((item) => (item.end ? location.pathname === item.to : location.pathname.startsWith(item.to))) ||
    (location.pathname.startsWith('/admin') ? { title: 'Administration' } : { title: 'HSE Workspace' });

  const handleLogout = async () => {
    setSigningOut(true);
    try {
      await logout();
      navigate('/login', { replace: true });
    } finally {
      setSigningOut(false);
    }
  };

  const primaryModules = modules.filter((m) => ['incidents', 'inspections', 'hazards', 'permits'].includes(m.name));
  const otherModules = modules.filter((m) => !['incidents', 'inspections', 'hazards', 'permits'].includes(m.name));

  return (
    <div className="app-shell">
      <div className={`sidebar-scrim ${sidebarOpen ? 'show' : ''}`} onClick={() => setSidebarOpen(false)} />

      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`} aria-label="Main navigation">
        <div className="brand">
          <div className="brand-mark">
            <Icon name="shield" size={22} strokeWidth={2} style={{ color: '#fff' }} />
          </div>
          <div>
            <div className="brand-title">INDUSTRIAL HSE PRO</div>
            <div className="brand-sub">Safety Management</div>
          </div>
          <button type="button" className="icon-btn" onClick={() => setSidebarOpen(false)} aria-label="Close navigation" style={{ marginLeft: 'auto', background: 'rgba(255,255,255,.08)', border: 0, color: '#fff', display: sidebarOpen ? 'grid' : 'none' }}>
            <Icon name="close" size={16} />
          </button>
        </div>

        <nav className="nav-section">
          <div className="nav-label">Overview</div>
          {STATIC_NAV.slice(0, 1).map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <Icon name={item.icon} size={18} />
              {item.label}
            </NavLink>
          ))}
          <NavLink to="/notifications" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Icon name="bell" size={18} />
            Notifications
            {unread > 0 ? <span className="nav-badge">{unread > 99 ? '99+' : unread}</span> : null}
          </NavLink>
        </nav>

        <nav className="nav-section">
          <div className="nav-label">HSE Modules</div>
          {primaryModules.map((m) => (
            <NavLink key={m.name} to={modulePath(m.name)} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <Icon name={MODULE_ICONS[m.name] || 'list'} size={18} />
              {m.label}
            </NavLink>
          ))}
        </nav>

        {otherModules.length ? (
          <nav className="nav-section">
            <div className="nav-label">Management</div>
            {otherModules.map((m) => (
              <NavLink key={m.name} to={modulePath(m.name)} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <Icon name={MODULE_ICONS[m.name] || 'list'} size={18} />
                {m.label}
              </NavLink>
            ))}
          </nav>
        ) : null}

        <nav className="nav-section" style={{ paddingBottom: 12 }}>
          <div className="nav-label">Insights</div>
          {STATIC_NAV.slice(1).map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <Icon name={item.icon} size={18} />
              {item.label}
            </NavLink>
          ))}
          {isAdmin ? (
            <NavLink to="/admin" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <Icon name="settings" size={18} />
              Administration
            </NavLink>
          ) : null}
        </nav>

        <div className="sidebar-footer">
          <button type="button" className="sidebar-user" onClick={() => navigate('/profile')} style={{ border: 0, width: '100%', cursor: 'pointer', textAlign: 'left' }}>
            <span className="avatar">{initials(user?.full_name || user?.username)}</span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span className="truncate" style={{ display: 'block', color: '#fff', fontSize: 12.8, fontWeight: 600 }}>
                {user?.full_name || user?.username}
              </span>
              <span style={{ display: 'block', color: '#8fb0d1', fontSize: 11 }}>
                {titleCase(user?.role)}
              </span>
            </span>
            <Icon name="chevronRight" size={15} style={{ color: '#8fb0d1' }} />
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button type="button" className="icon-btn menu-toggle" onClick={() => setSidebarOpen(true)} aria-label="Open navigation">
            <Icon name="menu" size={18} />
          </button>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="topbar-title truncate">{current.title}</div>
            <div className="topbar-sub truncate">
              {meta?.options?.settings?.company_name || 'Industrial HSE'} · {titleCase(user?.role)}
            </div>
          </div>

          <button type="button" className="icon-btn" onClick={() => navigate('/notifications')} aria-label="Notifications">
            <Icon name="bell" size={18} />
            {unread > 0 ? <span className="dot" /> : null}
          </button>

          <div style={{ position: 'relative' }} ref={menuRef}>
            <button type="button" className="avatar" onClick={() => setMenuOpen((v) => !v)} aria-label="Account menu" aria-expanded={menuOpen} style={{ cursor: 'pointer', border: 0 }}>
              {initials(user?.full_name || user?.username)}
            </button>
            {menuOpen ? (
              <div
                className="card"
                style={{ position: 'absolute', right: 0, top: 46, width: 236, padding: 8, zIndex: 80, boxShadow: 'var(--shadow-lg)' }}
                role="menu"
              >
                <div style={{ padding: '8px 10px 10px', borderBottom: '1px solid var(--ink-100)' }}>
                  <div className="strong small truncate">{user?.full_name || user?.username}</div>
                  <div className="tiny muted truncate">{user?.email || user?.username}</div>
                </div>
                <button type="button" className="nav-item" style={{ color: 'var(--ink-700)' }} onClick={() => navigate('/profile')}>
                  <Icon name="user" size={16} /> My Profile
                </button>
                {isAdmin ? (
                  <button type="button" className="nav-item" style={{ color: 'var(--ink-700)' }} onClick={() => navigate('/admin')}>
                    <Icon name="settings" size={16} /> Administration
                  </button>
                ) : null}
                <button type="button" className="nav-item" style={{ color: 'var(--red-600)' }} onClick={handleLogout} disabled={signingOut}>
                  {signingOut ? <Spinner /> : <Icon name="logout" size={16} />} Sign out
                </button>
              </div>
            ) : null}
          </div>
        </header>

        <main className="page">
          <div className="page-narrow">
            <Outlet />
          </div>
        </main>
      </div>

      <nav className="bottom-nav" aria-label="Mobile navigation">
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, flex: 1, color: 'inherit', fontSize: 10.5, fontWeight: 600 }}>
          <Icon name="dashboard" size={20} />
          Home
        </NavLink>
        <NavLink to="/incidents" className={({ isActive }) => (isActive ? 'active' : '')} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, flex: 1, color: 'inherit', fontSize: 10.5, fontWeight: 600 }}>
          <Icon name="incident" size={20} />
          Incidents
        </NavLink>
        <NavLink to="/inspections" className={({ isActive }) => (isActive ? 'active' : '')} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, flex: 1, color: 'inherit', fontSize: 10.5, fontWeight: 600 }}>
          <Icon name="inspection" size={20} />
          Inspect
        </NavLink>
        <NavLink to="/hazards" className={({ isActive }) => (isActive ? 'active' : '')} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, flex: 1, color: 'inherit', fontSize: 10.5, fontWeight: 600 }}>
          <Icon name="hazard" size={20} />
          Hazards
        </NavLink>
        <button type="button" onClick={() => setSidebarOpen(true)} style={{ position: 'relative' }}>
          <Icon name="menu" size={20} />
          More
          {unread > 0 ? <span className="bn-dot" /> : null}
        </button>
      </nav>
    </div>
  );
}
