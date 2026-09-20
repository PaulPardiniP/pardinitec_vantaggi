import React from 'react';
import { NavLink, Outlet, useNavigate, Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';

export const DashboardLayout: React.FC = () => {
  const { user, businesses, activeBusiness, role, isSuperAdmin, switchBusiness, logout, hasModule, hasPermission } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // Se è Super Admin e non ha selezionato alcun commercio, reindirizza ad /admin
  if (isSuperAdmin && !activeBusiness) {
    return <Navigate to="/admin/businesses" replace />;
  }

  // Se è un utente normale ma non ha alcun commercio assegnato
  if (!isSuperAdmin && !activeBusiness) {
    return (
      <div className="app-container">
        <header className="navbar">
          <div className="nav-brand">
            <span style={{ fontSize: '1.5rem' }}>💳</span>
            <span>Pardinitec Vantaggi</span>
          </div>
          <div className="nav-actions">
            <Button variant="secondary" size="sm" onClick={handleLogout}>
              Esci
            </Button>
          </div>
        </header>
        <div className="main-content" style={{ marginTop: '3rem' }}>
          <EmptyState
            title="Nessun commercio associato"
            description="Il tuo account non è ancora stato assegnato ad alcun commercio. Contatta l'amministratore di sistema per ottenere l'accesso."
          />
        </div>
      </div>
    );
  }

  // Se il commercio selezionato è inattivo o terminato, blocca l'accesso al pannello operativo
  if (activeBusiness && (activeBusiness.status !== 'active' || Boolean(activeBusiness.terminated_at))) {
    return (
      <div className="app-container">
        <header className="navbar">
          <div className="navbar-brand">
            <span style={{ fontSize: '1.4rem' }}>💳</span>
            <span style={{ fontWeight: 800, fontSize: '1.15rem' }}>
              Pardinitec <span style={{ color: 'var(--color-primary)' }}>Vantaggi</span>
            </span>
          </div>
          <div className="navbar-menu">
            {isSuperAdmin && (
              <Link to="/admin/businesses" className="btn btn-outline btn-sm" style={{ marginRight: '0.5rem' }}>
                ★ Torna a Super Admin
              </Link>
            )}
            <Button variant="secondary" size="sm" onClick={handleLogout}>
              Esci
            </Button>
          </div>
        </header>
        <div className="main-content" style={{ marginTop: '3rem' }}>
          <EmptyState
            title="Attività non disponibile"
            description="L'accesso al pannello operativo di questa attività è bloccato perché il commercio risulta inattivo o terminato."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      {/* Header Bar */}
      <header className="navbar">
        <div className="navbar-brand">
          <Link to="/dashboard" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.4rem' }}>💳</span>
            <span style={{ fontWeight: 800, fontSize: '1.15rem', letterSpacing: '-0.02em' }}>
              Pardinitec <span style={{ color: 'var(--color-primary)' }}>Vantaggi</span>
            </span>
          </Link>

          {businesses.length > 1 && (
            <div style={{ marginLeft: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Punto vendita:</span>
              <select
                className="form-control"
                style={{ width: 'auto', padding: '0.3rem 0.6rem', fontSize: '0.85rem' }}
                value={activeBusiness?.id || ''}
                onChange={(e) => switchBusiness(Number(e.target.value))}
                aria-label="Seleziona punto vendita"
              >
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {businesses.length === 1 && activeBusiness && (
            <span style={{ marginLeft: '1rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
              • <strong>{activeBusiness.name}</strong>
            </span>
          )}
        </div>

        <div className="navbar-menu">
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
          {hasPermission('customer.view') && (
            <NavLink to="/dashboard/customers" className={({ isActive }) => `tab-btn ${isActive ? 'active' : ''}`}>
              Clienti
            </NavLink>
          )}
          {hasPermission('points.adjust') && hasModule('points') && (
            <NavLink to="/dashboard/points" className={({ isActive }) => `tab-btn ${isActive ? 'active' : ''}`}>
              Accredito punti
            </NavLink>
          )}
          {hasPermission('reward.redeem') && hasModule('rewards') && (
            <NavLink to="/dashboard/rewards" className={({ isActive }) => `tab-btn ${isActive ? 'active' : ''}`}>
              Premi con punti
            </NavLink>
          )}
          {(hasPermission('offer.manage') || hasPermission('offer.redeem')) && hasModule('offers') && (
            <NavLink to="/dashboard/vantaggi" className={({ isActive }) => `tab-btn ${isActive ? 'active' : ''}`}>
              Vantaggi
            </NavLink>
          )}
          {(hasPermission('offer.manage') || hasPermission('offer.redeem')) && hasModule('vip_offers') && (
            <NavLink to="/dashboard/vip" className={({ isActive }) => `tab-btn ${isActive ? 'active' : ''}`}>
              VIP
            </NavLink>
          )}
          {hasPermission('card.assign') && (
            <NavLink to="/dashboard/cards" className={({ isActive }) => `tab-btn ${isActive ? 'active' : ''}`}>
              Carte fisiche
            </NavLink>
          )}
          {hasPermission('members.view') && (
            <NavLink to="/dashboard/members" className={({ isActive }) => `tab-btn ${isActive ? 'active' : ''}`}>
              Membri
            </NavLink>
          )}
          {hasPermission('campaign.send') && hasModule('campaigns') && (
            <NavLink to="/dashboard/campaigns" className={({ isActive }) => `tab-btn ${isActive ? 'active' : ''}`}>
              Campagne
            </NavLink>
          )}
          {hasPermission('business.view') && (
            <NavLink to="/dashboard/settings" className={({ isActive }) => `tab-btn ${isActive ? 'active' : ''}`}>
              Impostazioni
            </NavLink>
          )}
        </nav>

        <main>
          <Outlet />
        </main>
      </div>
    </div>
  );
};
