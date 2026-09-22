import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { businessApi, cardsApi } from '../../api/services';
import type { Business, Card } from '../../types';
import { Spinner } from '../../components/common/Spinner';

export const AdminOverviewPage: React.FC = () => {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const bList = await businessApi.list();
        setBusinesses(bList);
        const cList = await cardsApi.listAdminCards(undefined, 1, 100);
        setCards(cList.data);
      } catch {
        // Ignora
      } finally {
        setIsLoading(false);
      }
    };
    loadStats();
  }, []);

  if (isLoading) return <Spinner size="lg" text="Caricamento statistiche Super Admin..." />;

  const inventoryCards = cards.filter((c) => c.status === 'inventory').length;
  const issuedCards = cards.filter((c) => c.status === 'issued').length;
  const activeCards = cards.filter((c) => c.status === 'active').length;

  return (
    <div style={{ width: '100%', boxSizing: 'border-box' }}>
      {/* Banner Super Admin — carbón oscuro, detalles violetas */}
      <div className="admin-banner">
        <div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              background: 'rgba(124, 58, 237, 0.25)',
              border: '1px solid rgba(124, 58, 237, 0.4)',
              padding: '0.3rem 0.8rem',
              borderRadius: 'var(--radius-full)',
              fontSize: '0.78rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: '#c4b5fd',
              marginBottom: '0.75rem',
            }}
          >
            ⚙️ Piattaforma Globale • SUPER ADMIN
          </div>
          <h1 style={{ fontSize: '1.9rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em', color: '#ffffff' }}>
            Pannello di Amministrazione
          </h1>
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.97rem', color: '#94a3b8', maxWidth: '580px', lineHeight: 1.5 }}>
            Gestisci commerci, moduli attivi, inventario carte NFC/RFID e accessi alla piattaforma.
          </p>
        </div>
      </div>

      {/* Statistiche */}
      <div className="card-grid" style={{ marginBottom: '2rem' }}>
        <div className="card" style={{ borderTop: '4px solid var(--color-primary)' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Commerci Registrati
          </div>
          <div style={{ fontSize: '2.5rem', fontWeight: 800, margin: '0.5rem 0' }}>{businesses.length}</div>
          <Link to="/admin/businesses" className="btn btn-outline btn-sm" style={{ width: '100%', justifyContent: 'center' }}>
            Gestisci Commerci &amp; Moduli →
          </Link>
        </div>

        <div className="card" style={{ borderTop: '4px solid var(--color-warning)' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Carte in Inventario Libere
          </div>
          <div style={{ fontSize: '2.5rem', fontWeight: 800, margin: '0.5rem 0' }}>{inventoryCards}</div>
          <Link to="/admin/cards" className="btn btn-outline btn-sm" style={{ width: '100%', justifyContent: 'center' }}>
            Genera o Assegna Lotti →
          </Link>
        </div>

        <div className="card" style={{ borderTop: '4px solid var(--color-success)' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Carte Attive o Assegnate
          </div>
          <div style={{ fontSize: '2.5rem', fontWeight: 800, margin: '0.5rem 0' }}>{issuedCards + activeCards}</div>
          <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
            ({issuedCards} pronte, {activeCards} attive in mano ai clienti)
          </span>
        </div>
      </div>
    </div>
  );
};
