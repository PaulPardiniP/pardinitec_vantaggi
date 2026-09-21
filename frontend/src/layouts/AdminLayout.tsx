import React from 'react';
import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/common/Button';

export const AdminLayout: React.FC = () => {
  const { user, activeBusiness, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="app-container">
      <header className="navbar" style={{ borderBottom: '2px solid var(--color-vip)', flexDirection: 'column', alignItems: 'stretch', gap: '0.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Link to="/admin" className="nav-brand">
              <span style={{ fontSize: '1.4rem' }}>⚙️</span>
              <span style={{ fontWeight: 800, fontSize: '1.1rem' }}>Pardinitec Vantaggi</span>
            </Link>
            <span className="badge badge-vip">Super Admin</span>
          </div>

          <div className="nav-actions" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
            {activeBusiness ? (
              <Link to="/dashboard" className="btn btn-outline btn-sm" style={{ whiteSpace: 'nowrap' }}>
                ← Vista Commerciante ({activeBusiness.name})
              </Link>
            ) : (
              <Link to="/admin/businesses" className="btn btn-outline btn-sm" title="Seleziona un commercio dall'elenco per operare come esercente">
                🏪 Seleziona Commercio
              </Link>
            )}
            <span style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.email}
            </span>
            <Button variant="secondary" size="sm" onClick={handleLogout}>
              Esci
            </Button>
          </div>
        </div>
      </header>

      <div className="main-content">
        <nav className="tab-nav" aria-label="Navigazione amministrativa">
          <NavLink to="/admin" end className={({ isActive }) => `tab-btn ${isActive ? 'active' : ''}`}>
            Panoramica
          </NavLink>
          <NavLink to="/admin/businesses" className={({ isActive }) => `tab-btn ${isActive ? 'active' : ''}`}>
            Commerci &amp; Moduli
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
