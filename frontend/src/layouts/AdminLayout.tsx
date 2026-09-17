import React from 'react';
import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/common/Button';

export const AdminLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="app-container">
      <header className="navbar" style={{ borderBottom: '2px solid var(--color-vip)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Link to="/admin" className="nav-brand">
            <span style={{ fontSize: '1.5rem' }}>⚙️</span>
            <span>Pardinitec Vantaggi - Super Admin</span>
          </Link>
          <span className="badge badge-vip">Piattaforma Globale</span>
        </div>

        <div className="nav-actions">
          <Link to="/dashboard" className="btn btn-outline btn-sm">
            ← Vista Commerciante
          </Link>
          <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>{user?.email}</span>
          <Button variant="secondary" size="sm" onClick={handleLogout}>
            Esci
          </Button>
        </div>
      </header>

      <div className="main-content">
        <nav className="tab-nav" aria-label="Navigazione amministrativa">
          <NavLink to="/admin" end className={({ isActive }) => `tab-btn ${isActive ? 'active' : ''}`}>
            Panoramica
          </NavLink>
          <NavLink to="/admin/businesses" className={({ isActive }) => `tab-btn ${isActive ? 'active' : ''}`}>
            Commerci & Moduli
          </NavLink>
          <NavLink to="/admin/cards" className={({ isActive }) => `tab-btn ${isActive ? 'active' : ''}`}>
            Inventario Carte Fisiche
          </NavLink>
        </nav>

        <main>
          <Outlet />
        </main>
      </div>
    </div>
  );
};
