import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export const OverviewPage: React.FC = () => {
  const { activeBusiness, role } = useAuth();

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
        <div>
          <Link to="/dashboard/customers" className="btn btn-primary">
            ➕ Nuovo Cliente
          </Link>
        </div>
      </div>

      <div className="card-grid">
        <div className="card">
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>👥</div>
          <h2 className="card-title">Clienti & Fedeltà</h2>
          <p className="page-subtitle" style={{ marginBottom: '1rem' }}>
            Registra nuovi clienti, gestisci i consensi GDPR e i conti Punti, Vantaggi e VIP.
          </p>
          <Link to="/dashboard/customers" className="btn btn-outline btn-sm">
            Gestisci Clienti →
          </Link>
        </div>

        <div className="card">
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⭐</div>
          <h2 className="card-title">Accredito Punti</h2>
          <p className="page-subtitle" style={{ marginBottom: '1rem' }}>
            Calcola e assegna punti spesa, visualizza lo storico delle transazioni e le rettifiche.
          </p>
          <Link to="/dashboard/points" className="btn btn-outline btn-sm">
            Vai ai Punti →
          </Link>
        </div>

        <div className="card">
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🎁</div>
          <h2 className="card-title">Catalogo Premi</h2>
          <p className="page-subtitle" style={{ marginBottom: '1rem' }}>
            Configura i premi fedeltà per profilo e gestisci i riscatti in cassa.
          </p>
          <Link to="/dashboard/rewards" className="btn btn-outline btn-sm">
            Gestisci Premi →
          </Link>
        </div>

        <div className="card">
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🏷️</div>
          <h2 className="card-title">Offerte & Promozioni</h2>
          <p className="page-subtitle" style={{ marginBottom: '1rem' }}>
            Crea sconti dedicati, promozioni standard e offerte riservate ai clienti VIP.
          </p>
          <Link to="/dashboard/offers" className="btn btn-outline btn-sm">
            Gestisci Offerte →
          </Link>
        </div>

        <div className="card">
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>💳</div>
          <h2 className="card-title">Carte Fisiche</h2>
          <p className="page-subtitle" style={{ marginBottom: '1rem' }}>
            Attiva carte fisiche in negozio, gestisci sostituzioni o riassegnazioni sicure.
          </p>
          <Link to="/dashboard/cards" className="btn btn-outline btn-sm">
            Gestisci Carte →
          </Link>
        </div>

        <div className="card">
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⚙️</div>
          <h2 className="card-title">Impostazioni & Regole</h2>
          <p className="page-subtitle" style={{ marginBottom: '1rem' }}>
            Configura le modalità di calcolo dei punti e consulta i moduli attivi nel contratto.
          </p>
          <Link to="/dashboard/settings" className="btn btn-outline btn-sm">
            Impostazioni →
          </Link>
        </div>
      </div>
    </div>
  );
};
