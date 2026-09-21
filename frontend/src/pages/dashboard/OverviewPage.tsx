import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export const OverviewPage: React.FC = () => {
  const { activeBusiness, role, hasModule, hasPermission } = useAuth();

  const bizName = activeBusiness?.name || 'Pardinitec Vantaggi';

  return (
    <div style={{ width: '100%', boxSizing: 'border-box' }}>
      {/* Banner di Benvenuto e Identità Pardinitec */}
      <div className="dashboard-banner">
        <div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              background: 'rgba(255, 255, 255, 0.15)',
              padding: '0.3rem 0.8rem',
              borderRadius: 'var(--radius-full)',
              fontSize: '0.78rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '0.65rem',
            }}
          >
            🏢 Panoramica Operativa • Ruolo: {role?.toUpperCase() || 'OPERATORE'}
          </div>
          <h1 style={{ fontSize: '1.85rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em', color: '#ffffff', lineHeight: 1.2 }}>
            {bizName}
          </h1>
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.98rem', color: '#e0e7ff', maxWidth: '620px', lineHeight: 1.5 }}>
            Gestisci la fidelizzazione dei tuoi clienti, riscatta premi, controlla i vantaggi e attiva le carte fisiche RFID/NFC.
          </p>
        </div>

        {hasPermission('customer.view') && (
          <div style={{ flexShrink: 0, width: '100%', maxWidth: '240px' }} className="banner-action-container">
            <Link
              to="/dashboard/customers"
              className="btn banner-action-btn"
              style={{
                background: '#ffffff',
                color: '#1e1b4b',
                fontWeight: 700,
                fontSize: '0.95rem',
                padding: '0.65rem 1.25rem',
                borderRadius: 'var(--radius-md)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                textDecoration: 'none',
                width: '100%',
              }}
            >
              ➕ Nuovo Cliente
            </Link>
          </div>
        )}
      </div>

      {/* Griglia Moduli — 1. Premi con punti, 2. Vantaggi, 3. VIP, 4. Carte fisiche, 5. Clienti, 6. Membri, 7. Impostazioni */}
      <div className="overview-grid">
        {/* 1. Premi con punti */}
        {hasPermission('reward.redeem') && hasModule('rewards') && (
          <div className="overview-card">
            <div>
              <div className="overview-card-header">
                <div className="overview-card-icon" style={{ background: '#fce7f3', color: '#db2777' }}>
                  🎁
                </div>
                <h2 className="overview-card-title">Premi con punti</h2>
              </div>
              <p className="overview-card-desc">
                Configura il catalogo premi e gestisci il riscatto rapido in cassa tramite i punti accumulati.
              </p>
            </div>
            <div className="overview-card-action">
              <Link
                to="/dashboard/rewards"
                className="btn btn-outline"
                style={{ width: '100%', justifyContent: 'center', fontWeight: 700, borderColor: '#db2777', color: '#be185d' }}
              >
                Premi con punti →
              </Link>
            </div>
          </div>
        )}

        {/* 2. Vantaggi */}
        {(hasPermission('offer.manage') || hasPermission('offer.redeem')) && hasModule('offers') && (
          <div className="overview-card">
            <div>
              <div className="overview-card-header">
                <div className="overview-card-icon" style={{ background: '#dbeafe', color: '#2563eb' }}>
                  🏷️
                </div>
                <h2 className="overview-card-title">Vantaggi</h2>
              </div>
              <p className="overview-card-desc">
                Crea sconti esclusivi, coupon e promozioni riservati ai clienti titolari del profilo Vantaggi.
              </p>
            </div>
            <div className="overview-card-action">
              <Link
                to="/dashboard/vantaggi"
                className="btn btn-outline"
                style={{ width: '100%', justifyContent: 'center', fontWeight: 700, borderColor: '#2563eb', color: '#1d4ed8' }}
              >
                Gestisci Vantaggi →
              </Link>
            </div>
          </div>
        )}

        {/* 3. VIP */}
        {(hasPermission('offer.manage') || hasPermission('offer.redeem')) && hasModule('vip_offers') && (
          <div className="overview-card" style={{ border: '1.5px solid #fde68a', borderLeft: '4px solid #d97706', background: '#fffbeb' }}>
            <div>
              <div className="overview-card-header">
                <div className="overview-card-icon" style={{ background: '#fef3c7', color: '#d97706' }}>
                  👑
                </div>
                <h2 className="overview-card-title" style={{ color: '#78350f' }}>VIP</h2>
              </div>
              <p className="overview-card-desc" style={{ color: '#92400e' }}>
                Offerte dedicate, vantaggi premium ed esperienze speciali riservate ai clienti VIP più fedeli.
              </p>
            </div>
            <div className="overview-card-action">
              <Link
                to="/dashboard/vip"
                className="btn"
                style={{ width: '100%', justifyContent: 'center', fontWeight: 700, background: '#d97706', color: '#ffffff', textDecoration: 'none' }}
              >
                Gestisci VIP →
              </Link>
            </div>
          </div>
        )}

        {/* 4. Carte fisiche */}
        {hasPermission('card.assign') && (
          <div className="overview-card">
            <div>
              <div className="overview-card-header">
                <div className="overview-card-icon" style={{ background: '#e0e7ff', color: '#4338ca' }}>
                  💳
                </div>
                <h2 className="overview-card-title">Carte fisiche</h2>
              </div>
              <p className="overview-card-desc">
                Collega le tessere NFC/RFID preprogrammate ai clienti e gestisci lo stock del punto vendita.
              </p>
            </div>
            <div className="overview-card-action">
              <Link
                to="/dashboard/cards"
                className="btn btn-outline"
                style={{ width: '100%', justifyContent: 'center', fontWeight: 700, borderColor: '#4f46e5', color: '#4338ca' }}
              >
                Gestisci Carte →
              </Link>
            </div>
          </div>
        )}

        {/* 5. Clienti */}
        {hasPermission('customer.view') && (
          <div className="overview-card">
            <div>
              <div className="overview-card-header">
                <div className="overview-card-icon" style={{ background: '#ede9fe', color: '#7c3aed' }}>
                  👥
                </div>
                <h2 className="overview-card-title">Clienti</h2>
              </div>
              <p className="overview-card-desc">
                Gestisci l'anagrafica clienti, i consensi GDPR, le schede fedeltà e le carte digitali.
              </p>
            </div>
            <div className="overview-card-action">
              <Link
                to="/dashboard/customers"
                className="btn btn-outline"
                style={{ width: '100%', justifyContent: 'center', fontWeight: 700, borderColor: '#7c3aed', color: '#7c3aed' }}
              >
                Gestisci Clienti →
              </Link>
            </div>
          </div>
        )}

        {/* 6. Membri */}
        {hasPermission('members.view') && (
          <div className="overview-card">
            <div>
              <div className="overview-card-header">
                <div className="overview-card-icon" style={{ background: '#e0f2fe', color: '#0369a1' }}>
                  👨‍💼
                </div>
                <h2 className="overview-card-title">Membri</h2>
              </div>
              <p className="overview-card-desc">
                Gestisci gli operatori del negozio e invia gli inviti di accesso al personale autorizzato.
              </p>
            </div>
            <div className="overview-card-action">
              <Link
                to="/dashboard/members"
                className="btn btn-outline"
                style={{ width: '100%', justifyContent: 'center', fontWeight: 700, borderColor: '#0284c7', color: '#0369a1' }}
              >
                Gestisci Membri →
              </Link>
            </div>
          </div>
        )}

        {/* 7. Impostazioni */}
        {hasPermission('business.view') && (
          <div className="overview-card">
            <div>
              <div className="overview-card-header">
                <div className="overview-card-icon" style={{ background: '#f1f5f9', color: '#334155' }}>
                  ⚙️
                </div>
                <h2 className="overview-card-title">Impostazioni</h2>
              </div>
              <p className="overview-card-desc">
                Configura i parametri di accumulo punti, le aliquote e i dati anagrafici del negozio.
              </p>
            </div>
            <div className="overview-card-action">
              <Link
                to="/dashboard/settings"
                className="btn btn-outline"
                style={{ width: '100%', justifyContent: 'center', fontWeight: 700, borderColor: '#64748b', color: '#334155' }}
              >
                Impostazioni →
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
