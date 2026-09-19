import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export const HomePage: React.FC = () => {
  const { isAuthenticated, isSuperAdmin, user } = useAuth();

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#090a0f',
        color: '#f8fafc',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Barra Superiore di Navigazione */}
      <header
        style={{
          borderBottom: '1px solid rgba(124, 58, 237, 0.2)',
          background: 'rgba(9, 10, 15, 0.85)',
          backdropFilter: 'blur(12px)',
          position: 'sticky',
          top: 0,
          zIndex: 50,
          padding: '1rem 1.5rem',
        }}
      >
        <div
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Link
            to="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              textDecoration: 'none',
              color: '#ffffff',
            }}
          >
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #7c3aed 0%, #2563eb 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.2rem',
                boxShadow: '0 0 20px rgba(124, 58, 237, 0.4)',
              }}
            >
              💳
            </div>
            <div>
              <span style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
                Pardinitec <span style={{ color: '#a78bfa' }}>Vantaggi</span>
              </span>
            </div>
          </Link>

          {/* Azione in alto a destra secondo stato autenticazione */}
          <div>
            {isAuthenticated ? (
              isSuperAdmin || user?.is_super_admin ? (
                <Link
                  to="/admin"
                  className="btn btn-touch"
                  style={{
                    background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
                    color: '#ffffff',
                    border: '1px solid rgba(167, 139, 250, 0.4)',
                    boxShadow: '0 4px 14px rgba(124, 58, 237, 0.35)',
                    padding: '0.5rem 1.15rem',
                    textDecoration: 'none',
                  }}
                >
                  ★ Pannello Super Admin
                </Link>
              ) : (
                <Link
                  to="/dashboard"
                  className="btn btn-touch"
                  style={{
                    background: 'linear-gradient(135deg, #7c3aed 0%, #2563eb 100%)',
                    color: '#ffffff',
                    border: '1px solid rgba(167, 139, 250, 0.4)',
                    boxShadow: '0 4px 14px rgba(124, 58, 237, 0.35)',
                    padding: '0.5rem 1.15rem',
                    textDecoration: 'none',
                  }}
                >
                  🏪 Vai al Pannello
                </Link>
              )
            ) : (
              <Link
                to="/login"
                className="btn btn-touch"
                style={{
                  background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
                  color: '#ffffff',
                  border: '1px solid rgba(167, 139, 250, 0.4)',
                  boxShadow: '0 4px 14px rgba(124, 58, 237, 0.35)',
                  padding: '0.5rem 1.25rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                Accedi
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main style={{ flex: 1 }}>
        <section
          style={{
            padding: '4rem 1.5rem 3rem',
            textAlign: 'center',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Sfumatura di sfondo viola */}
          <div
            style={{
              position: 'absolute',
              top: '-10%',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '600px',
              height: '350px',
              background: 'radial-gradient(circle, rgba(124, 58, 237, 0.25) 0%, rgba(9, 10, 15, 0) 70%)',
              pointerEvents: 'none',
              zIndex: 0,
            }}
          />

          <div style={{ maxWidth: '800px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
            <div
              style={{
                display: 'inline-block',
                background: 'rgba(124, 58, 237, 0.15)',
                border: '1px solid rgba(167, 139, 250, 0.3)',
                padding: '0.35rem 0.85rem',
                borderRadius: '999px',
                color: '#c4b5fd',
                fontSize: '0.85rem',
                fontWeight: 600,
                marginBottom: '1.25rem',
              }}
            >
              Soluzione Professionale di Fidelizzazione Digitale
            </div>

            <h1
              style={{
                fontSize: 'clamp(2rem, 5vw, 3.25rem)',
                fontWeight: 800,
                lineHeight: 1.15,
                letterSpacing: '-0.03em',
                marginBottom: '1.25rem',
                background: 'linear-gradient(180deg, #ffffff 40%, #cbd5e1 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Fidelizzazione su misura per ogni modello di attività
            </h1>

            <p
              style={{
                fontSize: 'clamp(1rem, 2.5vw, 1.15rem)',
                color: '#94a3b8',
                lineHeight: 1.6,
                maxWidth: '660px',
                margin: '0 auto',
              }}
            >
              Tre profili indipendenti progettati per adattarsi alla tua strategia commerciale.
              Nessuna applicazione da installare per il cliente: tutto accessibile istantaneamente via codice QR.
            </p>
          </div>
        </section>

        {/* Sezione Tre Profili Indipendenti */}
        <section
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            padding: '1rem 1.5rem 4rem',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '1.75rem',
            }}
          >
            {/* Profilo 1: PUNTI */}
            <div
              style={{
                background: 'linear-gradient(180deg, rgba(30, 27, 46, 0.7) 0%, rgba(18, 17, 28, 0.8) 100%)',
                border: '1px solid rgba(217, 119, 6, 0.3)',
                borderRadius: '16px',
                padding: '2rem 1.75rem',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 8px 30px rgba(0, 0, 0, 0.4)',
                position: 'relative',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <span
                  style={{
                    background: 'rgba(217, 119, 6, 0.15)',
                    color: '#f59e0b',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    padding: '0.2rem 0.6rem',
                    borderRadius: '999px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  Profilo Indipendente
                </span>
                <span style={{ fontSize: '2rem' }}>🪙</span>
              </div>

              <h2 style={{ fontSize: '1.6rem', fontWeight: 800, margin: '0 0 0.5rem 0', color: '#ffffff' }}>
                Punti
              </h2>

              <p style={{ color: '#94a3b8', fontSize: '0.95rem', lineHeight: 1.5, marginBottom: '1.5rem' }}>
                Il modello classico di accumulo punti proporzionale alla spesa o alle visite, con catalogo premi dedicato.
              </p>

              <ul
                style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: '0 0 2rem 0',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  fontSize: '0.9rem',
                  color: '#cbd5e1',
                  flex: 1,
                }}
              >
                <li style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span style={{ color: '#f59e0b' }}>✓</span> Calcolatore automatico dei punti su importo spesa
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span style={{ color: '#f59e0b' }}>✓</span> Catalogo premi a punti crescenti o a soglia
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span style={{ color: '#f59e0b' }}>✓</span> Barra di progresso verso il prossimo premio
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span style={{ color: '#f59e0b' }}>✓</span> Storico trasparente dei movimenti per il cliente
                </li>
              </ul>

              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '10px',
                  padding: '0.75rem 1rem',
                  textAlign: 'center',
                  fontSize: '0.8rem',
                  color: '#94a3b8',
                }}
              >
                🔒 Attivazione gestita in cassa dall'esercente
              </div>
            </div>

            {/* Profilo 2: VANTAGGI */}
            <div
              style={{
                background: 'linear-gradient(180deg, rgba(30, 27, 46, 0.7) 0%, rgba(18, 17, 28, 0.8) 100%)',
                border: '1px solid rgba(37, 99, 235, 0.4)',
                borderRadius: '16px',
                padding: '2rem 1.75rem',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 8px 30px rgba(0, 0, 0, 0.4)',
                position: 'relative',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <span
                  style={{
                    background: 'rgba(37, 99, 235, 0.15)',
                    color: '#60a5fa',
                    border: '1px solid rgba(96, 165, 250, 0.3)',
                    padding: '0.2rem 0.6rem',
                    borderRadius: '999px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  Profilo Indipendente
                </span>
                <span style={{ fontSize: '2rem' }}>🎁</span>
              </div>

              <h2 style={{ fontSize: '1.6rem', fontWeight: 800, margin: '0 0 0.5rem 0', color: '#ffffff' }}>
                Vantaggi
              </h2>

              <p style={{ color: '#94a3b8', fontSize: '0.95rem', lineHeight: 1.5, marginBottom: '1.5rem' }}>
                La combinazione ideale di raccolta punti e catalogo offerte con coupon promozionali e sconti esclusivi.
              </p>

              <ul
                style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: '0 0 2rem 0',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  fontSize: '0.9rem',
                  color: '#cbd5e1',
                  flex: 1,
                }}
              >
                <li style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span style={{ color: '#60a5fa' }}>✓</span> Raccolta punti combinata a catalogo offerte attive
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span style={{ color: '#60a5fa' }}>✓</span> Coupon monouso o periodici applicabili in cassa
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span style={{ color: '#60a5fa' }}>✓</span> Campagne promozionali dedicate ai clienti aderenti
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span style={{ color: '#60a5fa' }}>✓</span> Riscatto veloce verificato dal personale del negozio
                </li>
              </ul>

              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '10px',
                  padding: '0.75rem 1rem',
                  textAlign: 'center',
                  fontSize: '0.8rem',
                  color: '#94a3b8',
                }}
              >
                🔒 Attivazione gestita in cassa dall'esercente
              </div>
            </div>

            {/* Profilo 3: VIP */}
            <div
              style={{
                background: 'linear-gradient(180deg, rgba(35, 24, 58, 0.8) 0%, rgba(20, 16, 36, 0.85) 100%)',
                border: '1px solid rgba(124, 58, 237, 0.5)',
                borderRadius: '16px',
                padding: '2rem 1.75rem',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 8px 30px rgba(124, 58, 237, 0.2)',
                position: 'relative',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <span
                  style={{
                    background: 'rgba(124, 58, 237, 0.2)',
                    color: '#c4b5fd',
                    border: '1px solid rgba(196, 181, 253, 0.3)',
                    padding: '0.2rem 0.6rem',
                    borderRadius: '999px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  Profilo Indipendente
                </span>
                <span style={{ fontSize: '2rem' }}>⭐</span>
              </div>

              <h2 style={{ fontSize: '1.6rem', fontWeight: 800, margin: '0 0 0.5rem 0', color: '#ffffff' }}>
                VIP Club
              </h2>

              <p style={{ color: '#94a3b8', fontSize: '0.95rem', lineHeight: 1.5, marginBottom: '1.5rem' }}>
                Trattamento preferenziale ed esperienze esclusive per i clienti più importanti, senza complessità di conteggio.
              </p>

              <ul
                style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: '0 0 2rem 0',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  fontSize: '0.9rem',
                  color: '#cbd5e1',
                  flex: 1,
                }}
              >
                <li style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span style={{ color: '#c4b5fd' }}>✓</span> Accesso riservato a offerte e listini dedicati VIP
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span style={{ color: '#c4b5fd' }}>✓</span> Trattamenti prioritari e inviti a eventi privati
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span style={{ color: '#c4b5fd' }}>✓</span> Ficha grafica ed esperienza digitale distintiva
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span style={{ color: '#c4b5fd' }}>✓</span> Riconoscimento immediato del cliente al banco
                </li>
              </ul>

              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '10px',
                  padding: '0.75rem 1rem',
                  textAlign: 'center',
                  fontSize: '0.8rem',
                  color: '#94a3b8',
                }}
              >
                🔒 Attivazione gestita in cassa dall'esercente
              </div>
            </div>
          </div>
        </section>

        {/* Banner Informativo Conformità */}
        <section
          style={{
            maxWidth: '900px',
            margin: '0 auto 4rem',
            padding: '0 1.5rem',
          }}
        >
          <div
            style={{
              background: 'rgba(124, 58, 237, 0.06)',
              border: '1px solid rgba(124, 58, 237, 0.2)',
              borderRadius: '14px',
              padding: '1.5rem',
              textAlign: 'center',
            }}
          >
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: '#e2e8f0' }}>
              Sicurezza, Riservatezza e Rispetto del GDPR
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>
              La registrazione avviene esclusivamente in punto vendita previo consenso informato. Nessun dato personale (PII) viene mai esposto pubblicamente attraverso il link o il codice QR della carta digitale.
            </p>
          </div>
        </section>
      </main>

      {/* Footer Minimalista */}
      <footer
        style={{
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          padding: '2rem 1.5rem',
          textAlign: 'center',
          fontSize: '0.85rem',
          color: '#64748b',
          background: '#07080c',
        }}
      >
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <p style={{ margin: '0 0 0.5rem 0' }}>
            © {new Date().getFullYear()} Pardinitec Vantaggi. Tutti i diritti riservati.
          </p>
          <div>
            <Link to="/login" style={{ color: '#a78bfa', textDecoration: 'none', fontWeight: 600 }}>
              Accesso Area Riservata Esercenti →
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
};
