import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { initials } from '../lib/format';
import { IconBell, IconDashboard, IconLogout, IconUsers } from './icons';

const nav = [
  { to: '/', label: 'Dashboard', icon: IconDashboard, end: true },
  { to: '/patients', label: 'Pasien', icon: IconUsers, end: false },
  { to: '/alerts', label: 'Peringatan', icon: IconBell, end: false },
];

export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-dot" />
          ICU Monitor
        </div>

        {nav.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <Icon className="nav-icon" />
            {label}
          </NavLink>
        ))}

        <div className="sidebar-footer">
          <div className="user-chip">
            <div className="avatar">{user ? initials(user.name) : '?'}</div>
            <div className="user-meta">
              <div className="user-name">{user?.name}</div>
              <div className="user-role">{user?.role.toLowerCase()}</div>
            </div>
          </div>
          <button className="btn btn-sm" style={{ width: '100%', marginTop: 8 }} onClick={logout}>
            <IconLogout width={15} height={15} />
            Keluar
          </button>
        </div>
      </aside>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
