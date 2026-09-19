import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { useAuth } from '../../context/AuthContext';
import { authApi } from '../../api/services';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Alert } from '../../components/common/Alert';
import { Spinner } from '../../components/common/Spinner';

export const TwoFactorPage: React.FC = () => {
  const { user, sessionState, isSuperAdmin, refreshSession, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const isSetupMode = sessionState === 'pending_2fa_setup' || searchParams.get('mode') === 'setup';

  // Setup state
  const [setupData, setSetupData] = useState<{ uri: string; secret: string } | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [isLoadingSetup, setIsLoadingSetup] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [copiedCodes, setCopiedCodes] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  // Challenge state
  const [code, setCode] = useState('');
  const [isUsingRecovery, setIsUsingRecovery] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isSetupMode && !recoveryCodes) {
      loadSetup();
    }
  }, [isSetupMode]);

  const loadSetup = async () => {
    setIsLoadingSetup(true);
    setError(null);
    try {
      const data = await authApi.setup2fa();
      setSetupData(data);
      if (data.uri) {
        const svg = await QRCode.toString(data.uri, {
          type: 'svg',
          margin: 1,
          width: 200,
        });
        setQrSvg(svg);
      }
    } catch (err: any) {
      setError(err.message || 'Impossibile inizializzare la configurazione 2FA. Riprova più tardi.');
    } finally {
      setIsLoadingSetup(false);
    }
  };

  const handleVerifySetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const res = await authApi.verify2faSetup(code.trim());
      setRecoveryCodes(res.recovery_codes);
      setCode('');
    } catch (err: any) {
      setError(err.message || 'Codice 2FA non valido. Riprova inserendo il codice a 6 cifre dall\'app.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;

    setIsSubmitting(true);
    setError(null);
    try {
      await authApi.challenge2fa(code.trim());
      await refreshSession();
      if (isSuperAdmin || user?.is_super_admin) {
        navigate('/admin', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    } catch (err: any) {
      setError(err.message || 'Codice inserito non valido o scaduto.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFinishSetup = async () => {
    await refreshSession();
    if (isSuperAdmin || user?.is_super_admin) {
      navigate('/admin', { replace: true });
    } else {
      navigate('/dashboard', { replace: true });
    }
  };

  const handleCopyCodes = () => {
    if (recoveryCodes) {
      navigator.clipboard.writeText(recoveryCodes.join('\n'));
      setCopiedCodes(true);
      setTimeout(() => setCopiedCodes(false), 2500);
    }
  };

  const handleCopySecret = () => {
    if (setupData?.secret) {
      navigator.clipboard.writeText(setupData.secret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="public-card-container">
      <div className="public-card-box" style={{ maxWidth: '480px' }}>
        <div className="public-card-header">
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Autenticazione a Due Fattori (2FA)</h1>
          <p style={{ opacity: 0.9, fontSize: '0.85rem', marginTop: '0.25rem' }}>
            Protezione di sicurezza obbligatoria
          </p>
        </div>

        <div className="public-card-body">
          {error && <Alert type="error" message={error} onDismiss={() => setError(null)} />}

          {/* FASE 1: Se sono stati generati i codici di recupero (fine setup) */}
          {recoveryCodes ? (
            <div>
              <div className="alert alert-success" style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>
                ✅ 2FA attivata con successo! Salva subito i tuoi codici di recupero.
              </div>

              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
                Questi codici sono <strong>monouso</strong> e ti permetteranno di accedere se perdi il dispositivo di autenticazione. Conservali in un luogo sicuro (es. password manager). Non saranno più mostrati.
              </p>

              <div
                data-testid="recovery-codes-grid"
                style={{
                  background: '#f8fafc',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1rem',
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '0.5rem',
                  fontFamily: 'monospace',
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  marginBottom: '1rem',
                }}
              >
                {recoveryCodes.map((rc, i) => (
                  <div key={i} style={{ padding: '0.25rem' }}>
                    {rc}
                  </div>
                ))}
              </div>

              <Button
                type="button"
                variant="secondary"
                onClick={handleCopyCodes}
                style={{ width: '100%', marginBottom: '1rem' }}
              >
                {copiedCodes ? '✓ Codici copiati negli appunti!' : '📋 Copia tutti i codici'}
              </Button>

              <Button variant="primary" style={{ width: '100%' }} onClick={handleFinishSetup}>
                Ho salvato i codici, continua →
              </Button>
            </div>
          ) : isSetupMode ? (
            /* FASE 2: Configurazione 2FA */
            <div>
              {isLoadingSetup ? (
                <Spinner text="Inizializzazione credenziali 2FA..." />
              ) : !setupData && error ? (
                <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                  <Button type="button" variant="primary" onClick={loadSetup}>
                    Riprova configurazione
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleVerifySetup}>
                  <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
                    Per garantire la sicurezza della piattaforma, il ruolo di Super Admin richiede la configurazione di un'app di autenticazione (Google Authenticator, Microsoft Authenticator o Authy).
                  </p>

                  {setupData && (
                    <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
                      <div
                        style={{
                          background: '#ffffff',
                          padding: '0.75rem',
                          display: 'inline-block',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--color-border)',
                          marginBottom: '0.75rem',
                        }}
                      >
                        {qrSvg ? (
                          <img
                            src={`data:image/svg+xml;utf8,${encodeURIComponent(qrSvg)}`}
                            alt="QR Code 2FA"
                            data-testid="qr-code-image"
                            style={{ width: '180px', height: '180px', display: 'block', margin: '0 auto' }}
                          />
                        ) : (
                          <div style={{ width: '180px', height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Spinner text="Generazione QR..." />
                          </div>
                        )}
                      </div>

                      <p style={{ fontSize: '0.85rem', color: 'var(--color-text)', marginBottom: '0.5rem' }}>
                        Scansiona questo codice QR con <strong>Google Authenticator</strong>, <strong>Microsoft Authenticator</strong> o <strong>Authy</strong>.
                      </p>

                      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>
                        Non riesci a inquadrare il QR? Inserisci la chiave manualmente:
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <code
                          data-testid="manual-secret-key"
                          style={{
                            fontSize: '0.95rem',
                            fontWeight: 700,
                            letterSpacing: '0.05em',
                            background: '#f1f5f9',
                            padding: '0.25rem 0.5rem',
                            borderRadius: '4px',
                          }}
                        >
                          {setupData.secret}
                        </code>
                        <button
                          type="button"
                          onClick={handleCopySecret}
                          title="Copia chiave segreta"
                          style={{
                            border: '1px solid var(--color-border)',
                            background: '#ffffff',
                            borderRadius: '4px',
                            padding: '0.25rem 0.5rem',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                          }}
                        >
                          {copiedSecret ? '✓ Copiata' : 'Copia'}
                        </button>
                      </div>
                    </div>
                  )}

                  <Input
                    label="Inserisci il codice a 6 cifre dall'app *"
                    type="text"
                    required
                    placeholder="123456"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  />

                  <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                    <Button type="button" variant="secondary" onClick={handleLogout} style={{ flex: 1 }}>
                      Esci
                    </Button>
                    <Button type="submit" variant="primary" style={{ flex: 2 }} isLoading={isSubmitting}>
                      Attiva 2FA
                    </Button>
                  </div>
                </form>
              )}
            </div>
          ) : (
            /* FASE 3: Sfida 2FA (Accesso normale) */
            <form onSubmit={handleChallenge}>
              <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
                {isUsingRecovery
                  ? 'Inserisci uno dei tuoi codici di recupero (es. a1b2c3d4-e5f6g7h8).'
                  : 'Inserisci il codice a 6 cifre generato dalla tua app di autenticazione.'}
              </p>

              <Input
                label={isUsingRecovery ? 'Codice di Recupero *' : 'Codice TOTP (6 cifre) *'}
                type="text"
                required
                placeholder={isUsingRecovery ? 'xxxx-xxxx' : '123456'}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />

              <div style={{ marginBottom: '1rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    setIsUsingRecovery(!isUsingRecovery);
                    setCode('');
                    setError(null);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    color: 'var(--color-primary)',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  {isUsingRecovery ? '← Usa codice TOTP dall\'app' : 'Hai perso l\'accesso? Usa codice di recupero'}
                </button>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                <Button type="button" variant="secondary" onClick={handleLogout} style={{ flex: 1 }}>
                  Esci
                </Button>
                <Button type="submit" variant="primary" style={{ flex: 2 }} isLoading={isSubmitting}>
                  Verifica ed Accedi
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
