import React from 'react';
import { Link } from 'react-router-dom';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="public-card-container">
      <div className="public-card-box" style={{ padding: '3rem 2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🧭</div>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.5rem' }}>404 - Pagina Non Trovata</h1>
        <p className="page-subtitle" style={{ marginBottom: '2rem' }}>
          La risorsa o l'indirizzo richiesto non esiste o è stato rimosso.
        </p>
        <Link to="/dashboard" className="btn btn-primary">
          Torna al Pannello Principale
        </Link>
      </div>
    </div>
  );
};
