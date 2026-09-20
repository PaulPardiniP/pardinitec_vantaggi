import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export const OverviewPage: React.FC = () => {
  const { activeBusiness, role, hasModule, hasPermission } = useAuth();

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Panoramica Commercio</h1>
          <p className="page-subtitle">
            {activeBusiness ? (
              <>Benvenuto nel pannello di gestione di <strong>{activeBusiness.name}</strong>. Il tuo ruolo è <strong>{role}</strong>.</>
            ) : (
              <>Seleziona un commercio per visualizzare la panoramica operativa.</>
            )}
          </p>
        </div>
        {hasPermission('customer.view') && (
          <div>
            <Link to="/dashboard/customers" className="btn btn-primary">
              ➕ Nuovo Cliente
            </Link>
          </div>
        )}
      </div>

      <div className="card-grid">
        {hasPermission('customer.view') && (
          <div className="card">
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>👥</div>
            <h2 className="card-title">Clienti</h2>
            <p className="page-subtitle" style={{ marginBottom: '1rem' }}>
              Gestisci l'anagrafica clienti, i consensi GDPR e le carte digitali.
            </p>
            <Link to="/dashboard/customers" className="btn btn-outline btn-sm">
              Gestisci Clienti →
            </Link>
          </div>
        )}

        {hasPermission('points.adjust') && hasModule('points') && (
          <div className="card">
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⭐</div>
            <h2 className="card-title">Accredito punti</h2>
            <p className="page-subtitle" style={{ marginBottom: '1rem' }}>
              Accredita punti spesa, applica rettifiche e consulta lo storico movimenti.
            </p>
            <Link to="/dashboard/points" className="btn btn-outline btn-sm">
              Accredita punti →
            </Link>
          </div>
        )}

        {hasPermission('reward.redeem') && hasModule('rewards') && (
          <div className="card">
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🎁</div>
            <h2 className="card-title">Premi con punti</h2>
            <p className="page-subtitle" style={{ marginBottom: '1rem' }}>
              Configura il catalogo dei premi riscattabili con i punti raccolti.
            </p>
            <Link to="/dashboard/rewards" className="btn btn-outline btn-sm">
              Premi con punti →
            </Link>
          </div>
        )}

        {(hasPermission('offer.manage') || hasPermission('offer.redeem')) && hasModule('offers') && (
          <div className="card">
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🏷️</div>
            <h2 className="card-title">Vantaggi</h2>
            <p className="page-subtitle" style={{ marginBottom: '1rem' }}>
              Crea sconti, promozioni e benefici riservati ai clienti Vantaggi.
            </p>
            <Link to="/dashboard/vantaggi" className="btn btn-outline btn-sm">
              Gestisci Vantaggi →
            </Link>
          </div>
        )}

        {(hasPermission('offer.manage') || hasPermission('offer.redeem')) && hasModule('vip_offers') && (
          <div className="card" style={{ borderLeft: '4px solid var(--color-vip, #d97706)' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>👑</div>
            <h2 className="card-title">VIP</h2>
            <p className="page-subtitle" style={{ marginBottom: '1rem' }}>
              Offerte, premi esclusivi e benefici speciali riservati ai clienti VIP.
            </p>
            <Link to="/dashboard/vip" className="btn btn-outline btn-sm">
              Gestisci VIP →
            </Link>
          </div>
        )}

        {hasPermission('card.assign') && (
          <div className="card">
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>💳</div>
            <h2 className="card-title">Carte fisiche</h2>
            <p className="page-subtitle" style={{ marginBottom: '1rem' }}>
              Collega e gestisci le carte fisiche RFID/NFC per i tuoi clienti.
            </p>
            <Link to="/dashboard/cards" className="btn btn-outline btn-sm">
              Gestisci Carte →
            </Link>
          </div>
        )}

        {hasPermission('members.view') && (
          <div className="card">
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>👨‍💼</div>
            <h2 className="card-title">Membri</h2>
            <p className="page-subtitle" style={{ marginBottom: '1rem' }}>
              Visualizza gli operatori del negozio e gestisci gli inviti allo staff.
            </p>
            <Link to="/dashboard/members" className="btn btn-outline btn-sm">
              Gestisci Membri →
            </Link>
          </div>
        )}

        {hasPermission('campaign.send') && hasModule('campaigns') && (
          <div className="card">
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📢</div>
            <h2 className="card-title">Campagne</h2>
            <p className="page-subtitle" style={{ marginBottom: '1rem' }}>
              Invia comunicazioni e promozioni via WhatsApp ed Email ai clienti.
            </p>
            <Link to="/dashboard/campaigns" className="btn btn-outline btn-sm">
              Campagne →
            </Link>
          </div>
        )}

        {hasPermission('business.view') && (
          <div className="card">
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⚙️</div>
            <h2 className="card-title">Impostazioni</h2>
            <p className="page-subtitle" style={{ marginBottom: '1rem' }}>
              Regole di calcolo punti, dati del negozio e configurazione commerciale.
            </p>
            <Link to="/dashboard/settings" className="btn btn-outline btn-sm">
              Impostazioni →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};
