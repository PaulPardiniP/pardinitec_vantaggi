import React from 'react';
import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/common/Button';

export const DashboardLayout: React.FC = () => {
  const { user, businesses, activeBusiness, role, isSuperAdmin, switchBusiness, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="app-container">
      <header className="navbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <Link to="/dashboard" className="nav-brand">
            <span style={{ fontSize: '1.5rem' }}>💳</span>
            <span>Pardinitec Vantaggi</span>
          </Link>

          {businesses.length > 1 && (
            <select
              className="form-control"
              style={{ width: 'auto', padding: '0.35rem 0.6rem', fontSize: '0.85rem' }}
              value={activeBusiness?.id || ''}
              onChange={(e) => switchBusiness(Number(e.target.value))}
              aria-label="Seleziona commercio"
            >
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.role})
                </option>
              ))}
            </select>
          )}

          {activeBusiness && businesses.length <= 1 && (
            <span style={{ fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
              {activeBusiness.name}
            </span>
          )}
        </div>

        <div className="nav-actions">
          {isSuperAdmin && (
            <Link to="/admin" className="btn btn-outline btn-sm" style={{ borderColor: 'var(--color-vip)', color: 'var(--color-vip)' }}>
              ★ Area Super Admin
            </Link>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>{user?.email}</span>
            {role && (
              <span className={`badge ${role === 'owner' ? 'badge-primary' : role === 'manager' ? 'badge-success' : 'badge-warning'}`}>
                {role}
              </span>
            )}
          </div>

          <Button variant="secondary" size="sm" onClick={handleLogout}>
            Esci
          </Button>
        </div>
      </header>

      <div className="main-content">
        <nav className="tab-nav" aria-label="Navigazione commercio">
          <NavLink to="/dashboard" end className={({ isActive }) => `tab-btn ${isActive ? 'active' : ''}`}>
            Panoramica
          </NavLink>
          <NavLink to="/dashboard/customers" className={({ isActive }) => `tab-btn ${isActive ? 'active' : ''}`}>
            Clienti
          </NavLink>
          <NavLink to="/dashboard/points" className={({ isActive }) => `tab-btn ${isActive ? 'active' : ''}`}>
            Punti
          </NavLink>
          <NavLink to="/dashboard/rewards" className={({ isActive }) => `tab-btn ${isActive ? 'active' : ''}`}>
            Premi
          </NavLink>
          <NavLink to="/dashboard/offers" className={({ isActive }) => `tab-btn ${isActive ? 'active' : ''}`}>
            Offerte
          </NavLink>
          <NavLink to="/dashboard/cards" className={({ isActive }) => `tab-btn ${isActive ? 'active' : ''}`}>
            Carte Fisiche
          </NavLink>
          <NavLink to="/dashboard/members" className={({ isActive }) => `tab-btn ${isActive ? 'active' : ''}`}>
            Membri
          </NavLink>
          <NavLink to="/dashboard/settings" className={({ isActive }) => `tab-btn ${isActive ? 'active' : ''}`}>
            Impostazioni
          </NavLink>
        </nav>

        <main>
          <Outlet />
        </main>
      </div>
    </div>
  );
};
