import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate, Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';

export const DashboardLayout: React.FC = () => {
  const { user, businesses, activeBusiness, role, isSuperAdmin, switchBusiness, logout, exitMerchantMode, hasModule, hasPermission } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
      {/* Banner Super Admin Modalità Commerciante */}
      {isSuperAdmin && activeBusiness && (
        <div
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 1000,
            backgroundColor: '#0f172a',
            color: '#f8fafc',
            padding: '0.65rem 1.25rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '2px solid var(--color-vip, #f59e0b)',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', fontSize: '0.9rem' }}>
            <span style={{ fontSize: '1.15rem' }}>🛡️</span>
            <span>
              <strong>Modalità Super Admin</strong> — Stai operando nel commercio:{' '}
              <strong style={{ color: 'var(--color-vip, #f59e0b)' }}>{activeBusiness.name}</strong>
            </span>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              await exitMerchantMode();
              navigate('/admin/businesses');
            }}
            style={{
              backgroundColor: '#ffffff',
              color: '#0f172a',
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            ✕ Esci dalla modalità commerciante
          </Button>
        </div>
      )}

      {/* Header Bar responsive */}
      <header className="navbar">
        <div className="navbar-main-row">
          <div className="navbar-brand">
            <Link to="/dashboard" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.4rem' }}>💳</span>
              <span style={{ fontWeight: 800, fontSize: '1.15rem', letterSpacing: '-0.02em' }}>
                Pardinitec <span style={{ color: 'var(--color-primary)' }}>Vantaggi</span>
              </span>
            </Link>
          </div>

          <div className="navbar-mobile-toggle">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
              style={{ fontWeight: 700 }}
            >
              {mobileMenuOpen ? '✕ Chiudi' : '☰ Menu'}
            </button>
          </div>
        </div>

        {/* Store selector & user meta */}
        <div className="navbar-details-row">
          {businesses.length > 1 && (
            <div className="navbar-store-selector">
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Punto vendita:</span>
              <select
                className="form-control"
                style={{ width: 'auto', padding: '0.25rem 0.5rem', fontSize: '0.85rem' }}
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
            <span className="navbar-single-store">
              🏪 <strong>{activeBusiness.name}</strong>
            </span>
          )}

          <div className="navbar-user-actions">
            {isSuperAdmin && (
              <Link to="/admin" className="btn btn-outline btn-sm" style={{ borderColor: 'var(--color-vip)', color: 'var(--color-vip)', whiteSpace: 'nowrap' }}>
                ★ Super Admin
              </Link>
            )}

            <div className="navbar-user-badge">
              <span style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px', whiteSpace: 'nowrap' }}>
                {user?.email}
              </span>
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
        </div>
      </header>

      <div className="main-content">
        {/* Navigation Tabs - responsive with mobile toggle support and horizontal swipe */}
        <nav className={`tab-nav ${mobileMenuOpen ? 'mobile-open' : ''}`} aria-label="Navigazione commercio">
          <NavLink to="/dashboard" end className={({ isActive }) => `tab-btn ${isActive ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>
            Panoramica
          </NavLink>
          {hasPermission('reward.redeem') && hasModule('rewards') && (
            <NavLink to="/dashboard/rewards" className={({ isActive }) => `tab-btn ${isActive ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>
              Premi con punti
            </NavLink>
          )}
          {(hasPermission('offer.manage') || hasPermission('offer.redeem')) && hasModule('offers') && (
            <NavLink to="/dashboard/vantaggi" className={({ isActive }) => `tab-btn ${isActive ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>
              Vantaggi
            </NavLink>
          )}
          {(hasPermission('offer.manage') || hasPermission('offer.redeem')) && hasModule('vip_offers') && (
            <NavLink to="/dashboard/vip" className={({ isActive }) => `tab-btn ${isActive ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>
              VIP
            </NavLink>
          )}
          {hasPermission('points.adjust') && hasModule('points') && (
            <NavLink to="/dashboard/points" className={({ isActive }) => `tab-btn ${isActive ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>
              Accredito punti
            </NavLink>
          )}
          {hasPermission('card.assign') && (
            <NavLink to="/dashboard/cards" className={({ isActive }) => `tab-btn ${isActive ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>
              Carte fisiche
            </NavLink>
          )}
          {hasPermission('customer.view') && (
            <NavLink to="/dashboard/customers" className={({ isActive }) => `tab-btn ${isActive ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>
              Clienti
            </NavLink>
          )}
          {hasPermission('members.view') && (
            <NavLink to="/dashboard/members" className={({ isActive }) => `tab-btn ${isActive ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>
              Membri
            </NavLink>
          )}
          {hasPermission('campaign.send') && hasModule('campaigns') && (
            <NavLink to="/dashboard/campaigns" className={({ isActive }) => `tab-btn ${isActive ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>
              Campagne
            </NavLink>
          )}
          {hasPermission('business.view') && (
            <NavLink to="/dashboard/settings" className={({ isActive }) => `tab-btn ${isActive ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>
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
