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
          <div className="overview-card" style={{ background: '#fff7ed', border: '1.5px solid #fed7aa', borderLeft: '4px solid #ea580c' }}>
            <div>
              <div className="overview-card-header">
                <div className="overview-card-icon" style={{ background: '#ffedd5', color: '#ea580c' }}>
                  🎁
                </div>
                <h2 className="overview-card-title" style={{ color: '#9a3412' }}>Premi con punti</h2>
              </div>
              <p className="overview-card-desc" style={{ color: '#7c2d12' }}>
                Configura il catalogo premi e gestisci il riscatto rapido in cassa tramite i punti accumulati.
              </p>
            </div>
            <div className="overview-card-action">
              <Link
                to="/dashboard/rewards"
                className="btn btn-outline"
                style={{ width: '100%', justifyContent: 'center', fontWeight: 700, borderColor: '#ea580c', color: '#c2410c' }}
              >
                Premi con punti →
              </Link>
            </div>
          </div>
        )}

        {/* 2. Vantaggi */}
        {(hasPermission('offer.manage') || hasPermission('offer.redeem')) && hasModule('offers') && (
          <div className="overview-card" style={{ background: '#eff6ff', border: '1.5px solid #bfdbfe', borderLeft: '4px solid #2563eb' }}>
            <div>
              <div className="overview-card-header">
                <div className="overview-card-icon" style={{ background: '#dbeafe', color: '#2563eb' }}>
                  🏷️
                </div>
                <h2 className="overview-card-title" style={{ color: '#1e3a8a' }}>Vantaggi</h2>
              </div>
              <p className="overview-card-desc" style={{ color: '#1e40af' }}>
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
          <div className="overview-card" style={{ background: '#0f172a', border: '1.5px solid #334155' }}>
            <div>
              <div className="overview-card-header">
                <div className="overview-card-icon" style={{ background: '#1e293b', color: '#f8fafc' }}>
                  👑
                </div>
                <h2 className="overview-card-title" style={{ color: '#f8fafc' }}>VIP</h2>
              </div>
              <p className="overview-card-desc" style={{ color: '#94a3b8' }}>
                Offerte dedicate, vantaggi premium ed esperienze speciali riservate ai clienti VIP più fedeli.
              </p>
            </div>
            <div className="overview-card-action">
              <Link
                to="/dashboard/vip"
                className="btn"
                style={{ width: '100%', justifyContent: 'center', fontWeight: 700, background: '#475569', color: '#f8fafc', textDecoration: 'none' }}
              >
                Gestisci VIP →
              </Link>
            </div>
          </div>
        )}

        {/* 4. Carte fisiche */}
        {hasPermission('card.assign') && (
          <div className="overview-card" style={{ background: '#e2e8f0', border: '1.5px solid #94a3b8', borderLeft: '4px solid #475569' }}>
            <div>
              <div className="overview-card-header">
                <div className="overview-card-icon" style={{ background: '#cbd5e1', color: '#1e293b' }}>
                  💳
                </div>
                <h2 className="overview-card-title" style={{ color: '#0f172a' }}>Carte fisiche</h2>
              </div>
              <p className="overview-card-desc" style={{ color: '#475569' }}>
                Collega le tessere NFC/RFID preprogrammate ai clienti e gestisci lo stock del punto vendita.
              </p>
            </div>
            <div className="overview-card-action">
              <Link
                to="/dashboard/cards"
                className="btn btn-outline"
                style={{ width: '100%', justifyContent: 'center', fontWeight: 700, borderColor: '#475569', color: '#1e293b' }}
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
      </div>
    </div>
  );
};

