import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { customerApi, loyaltyApi } from '../../api/services';
import type { Customer, Credential, CustomerConsents } from '../../types';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Select } from '../../components/common/Select';
import { Modal } from '../../components/common/Modal';
import { Alert } from '../../components/common/Alert';
import { Spinner } from '../../components/common/Spinner';
import { QrModal } from '../../components/common/QrModal';
import { ApiError } from '../../api/client';

export const CustomerDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const customerId = Number(id);
  const { activeBusiness, hasPermission } = useAuth();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [accountCredentials, setAccountCredentials] = useState<Record<number, Credential[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modifica anagrafica
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editModalError, setEditModalError] = useState<string | null>(null);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  // Attivazione / Ampliamento conto
  const [isNewAccountOpen, setIsNewAccountOpen] = useState(false);
  const [newAccountProfile, setNewAccountProfile] = useState<'punti' | 'vantaggi' | 'vip'>('vantaggi');
  const [accountModalError, setAccountModalError] = useState<string | null>(null);
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);

  // Rotazione credenziale
  const [credToRotate, setCredToRotate] = useState<{ credentialId: number; accountName: string } | null>(null);
  const [rotateModalError, setRotateModalError] = useState<string | null>(null);
  const [isRotating, setIsRotating] = useState(false);

  // Visualizzazione QR Credenziale
  const [qrDisplay, setQrDisplay] = useState<{ token: string; profileName: string } | null>(null);

  // Rivelazione e Copia Link Credenziale (AES-256-GCM)
  const [revealModalCred, setRevealModalCred] = useState<{ credentialId: number; accountName: string } | null>(null);
  const [revealedUrl, setRevealedUrl] = useState<string | null>(null);
  const [isRevealing, setIsRevealing] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);
  const [copiedReveal, setCopiedReveal] = useState(false);

  // Nuovo consenso marketing
  const [isConsentModalOpen, setIsConsentModalOpen] = useState(false);
  const [consentCheckbox, setConsentCheckbox] = useState(false);
  const [isGrantingConsent, setIsGrantingConsent] = useState(false);
  const [consentModalError, setConsentModalError] = useState<string | null>(null);

  const canEdit = hasPermission('customer.edit');

  const fetchCustomerData = async () => {
    if (!activeBusiness || !customerId) return;
    setIsLoading(true);
    setError(null);
    try {
      const custData = await customerApi.get(activeBusiness.id, customerId);
      setCustomer(custData);
      setEditFirstName(custData.first_name);
      setEditLastName(custData.last_name);
      setEditPhone(custData.phone || '');
      setEditEmail(custData.email || '');

      // Carica credenziali per ciascun conto
      if (custData.loyalty_accounts && custData.loyalty_accounts.length > 0) {
        const credMap: Record<number, Credential[]> = {};
        for (const acc of custData.loyalty_accounts) {
          try {
            const creds = await loyaltyApi.listAccountCredentials(activeBusiness.id, acc.id);
            credMap[acc.id] = creds;
          } catch {
            credMap[acc.id] = [];
          }
        }
        setAccountCredentials(credMap);
      }
    } catch (err: any) {
      if (err instanceof ApiError) setError(err.message);
      else setError('Impossibile recuperare i dettagli del cliente.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomerData();
  }, [activeBusiness, customerId]);

  // Aggiornamento Anagrafica
  const handleUpdateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBusiness || !customer) return;
    setIsSubmittingEdit(true);
    setEditModalError(null);
    setFeedback(null);
    try {
      const updated = await customerApi.update(activeBusiness.id, customer.id, {
        first_name: editFirstName,
        last_name: editLastName,
        phone: editPhone.trim() || undefined,
        email: editEmail.trim() || undefined,
      });
      setCustomer((prev) => (prev ? { ...prev, ...updated } : updated));
      setIsEditOpen(false);
      setEditModalError(null);
      setFeedback({ type: 'success', message: 'Anagrafica cliente aggiornata con successo.' });
    } catch (err: any) {
      setEditModalError(err.message || 'Errore durante l\'aggiornamento.');
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  // Revoca Marketing
  const handleRevokeMarketing = async () => {
    if (!activeBusiness || !customer) return;
    setFeedback(null);
    try {
      await customerApi.revokeMarketing(activeBusiness.id, customer.id);
      setFeedback({ type: 'success', message: 'Consenso marketing revocato con successo.' });
      await fetchCustomerData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Errore durante la revoca del consenso.' });
    }
  };

  // Acquisisci Nuovo Consenso Marketing
  const handleOpenGrantMarketingModal = () => {
    setConsentCheckbox(false);
    setConsentModalError(null);
    setIsConsentModalOpen(true);
  };

  const handleGrantMarketingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBusiness || !customer || !consentCheckbox) return;
    setIsGrantingConsent(true);
    setConsentModalError(null);
    try {
      await customerApi.grantMarketing(activeBusiness.id, customer.id, {
        confirmed: true,
        source: 'in_person',
        privacy_policy_version: 'v1.0',
      });
      setFeedback({
        type: 'success',
        message: 'Consenso comunicazioni marketing acquisito con successo.',
      });
      setIsConsentModalOpen(false);
      await fetchCustomerData();
    } catch (err: any) {
      setConsentModalError(err.message || 'Errore durante l\'acquisizione del consenso.');
    } finally {
      setIsGrantingConsent(false);
    }
  };

  // Attivazione / Ampliamento Conto (Regola definitiva Punti -> Vantaggi e VIP indipendente)
  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBusiness || !customer || isCreatingAccount) return;
    setIsCreatingAccount(true);
    setAccountModalError(null);
    setFeedback(null);
    try {
      const res = await loyaltyApi.createAccount(activeBusiness.id, customer.id, newAccountProfile, true);
      setIsNewAccountOpen(false);
      setAccountModalError(null);
      await fetchCustomerData();

      if (res?.upgraded) {
        setFeedback({
          type: 'success',
          message: 'Profilo conto aggiornato a Vantaggi con successo! Saldo, movimenti e codice QR rimangono invariati.',
        });
        // Non apre QrModal perché il QR code rimane esattamente lo stesso
      } else {
        const profileLabel = res?.loyalty_account?.profile_name || newAccountProfile.toUpperCase();
        setFeedback({
          type: 'success',
          message: `Nuovo conto (${profileLabel}) creato con successo!`,
        });
        if (res?.token) {
          setQrDisplay({
            token: res.token,
            profileName: profileLabel,
          });
        }
      }
    } catch (err: any) {
      setAccountModalError(err.message || 'Impossibile completare l\'operazione.');
    } finally {
      setIsCreatingAccount(false);
    }
  };

  // Emissione Nuova Credenziale Digitale per Conto
  const handleIssueCredential = async (accountId: number, profileName: string) => {
    if (!activeBusiness) return;
    setFeedback(null);
    try {
      const res = await loyaltyApi.issueDigitalCredential(activeBusiness.id, accountId);
      setFeedback({ type: 'success', message: 'Nuova credenziale digitale emessa con successo!' });
      setQrDisplay({ token: res.token, profileName });
      await fetchCustomerData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Errore durante l\'emissione della credenziale.' });
    }
  };

  // Rotazione Credenziale Digitale
  const handleConfirmRotate = async () => {
    if (!activeBusiness || !credToRotate) return;
    setIsRotating(true);
    setRotateModalError(null);
    setFeedback(null);
    try {
      const res = await loyaltyApi.rotateCredential(activeBusiness.id, credToRotate.credentialId);
      setFeedback({ type: 'success', message: 'Credenziale digitale rotata con successo! Il token precedente è stato disabilitato.' });
      setQrDisplay({ token: res.token, profileName: credToRotate.accountName });
      setCredToRotate(null);
      setRotateModalError(null);
      await fetchCustomerData();
    } catch (err: any) {
      setRotateModalError(err.message || 'Errore durante la rotazione.');
    } finally {
      setIsRotating(false);
    }
  };

  // Rivelazione Sicura Link Credenziale (AES-256-GCM)
  const handleRevealLink = async () => {
    if (!activeBusiness || !revealModalCred) return;
    setIsRevealing(true);
    setRevealError(null);
    try {
      const res = await loyaltyApi.revealLink(activeBusiness.id, revealModalCred.credentialId);
      const fullUrl = new URL(res.public_url, window.location.origin).toString();
      setRevealedUrl(fullUrl);
    } catch (err: any) {
      setRevealError(err.message || 'Impossibile recuperare il link della credenziale.');
    } finally {
      setIsRevealing(false);
    }
  };

  const handleCopyRevealedUrl = async () => {
    if (!revealedUrl) return;
    try {
      await navigator.clipboard.writeText(revealedUrl);
      setCopiedReveal(true);
      setTimeout(() => setCopiedReveal(false), 3000);
    } catch {
      // fallback
    }
  };

  const handleCloseRevealModal = () => {
    setRevealModalCred(null);
    setRevealedUrl(null);
    setRevealError(null);
    setCopiedReveal(false);
  };

  if (isLoading) return <Spinner size="lg" text="Caricamento scheda cliente..." />;
  if (error || !customer) return <Alert type="error" message={error || 'Cliente non trovato.'} />;

  // Calcolo opzioni e profili disponibili
  const existingAccounts = customer.loyalty_accounts || [];
  const hasPunti = existingAccounts.some((a) => a.profile_code === 'punti');
  const hasVantaggi = existingAccounts.some((a) => a.profile_code === 'vantaggi');
  const hasVip = existingAccounts.some((a) => a.profile_code === 'vip');

  const canUpgradeToVantaggi = hasPunti && !hasVantaggi;
  const canCreateVip = !hasVip;
  const canCreateStandard = !hasPunti && !hasVantaggi;

  const availableOptions: { label: string; value: 'punti' | 'vantaggi' | 'vip' }[] = [];
  if (canUpgradeToVantaggi) {
    availableOptions.push({ label: '⭐ Attiva Vantaggi (ampliamento conto Punti esistente)', value: 'vantaggi' });
  }
  if (canCreateStandard) {
    availableOptions.push({ label: 'Punti (modalità base)', value: 'punti' });
    availableOptions.push({ label: 'Vantaggi (punti + offerte)', value: 'vantaggi' });
  }
  if (canCreateVip) {
    availableOptions.push({ label: '👑 Crea conto VIP separato (nuova credenziale e QR autonomi)', value: 'vip' });
  }

  const handleOpenAccountModal = (defaultProfile?: 'punti' | 'vantaggi' | 'vip') => {
    const initial = defaultProfile || (canUpgradeToVantaggi ? 'vantaggi' : canCreateVip ? 'vip' : 'punti');
    setNewAccountProfile(initial);
    setAccountModalError(null);
    setIsNewAccountOpen(true);
  };

  const consents: CustomerConsents | undefined = customer.consents;
  const privacyGranted = consents?.privacy_granted ?? false;
  const marketingGranted = consents?.marketing_granted ?? false;
  const latestPrivacyHistory = consents?.history?.find((c) => c.type === 'privacy');
  const latestMarketingHistory = consents?.history?.find((c) => c.type === 'marketing');

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <Link to="/dashboard/customers" style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
          ← Torna all'elenco clienti
        </Link>
      </div>

      <div className="page-header">
        <div>
          <h1 className="page-title">
            {customer.first_name} {customer.last_name}
          </h1>
          <p className="page-subtitle">Cliente #{customer.id} • Registrato il {new Date(customer.created_at).toLocaleDateString('it-IT')}</p>
        </div>
        {canEdit && (
          <Button variant="secondary" onClick={() => { setEditModalError(null); setIsEditOpen(true); }}>
            ✏️ Modifica Anagrafica
          </Button>
        )}
      </div>

      {feedback && <Alert type={feedback.type} message={feedback.message} onDismiss={() => setFeedback(null)} />}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
        {/* Scheda Anagrafica Minima */}
        <div className="card">
          <h2 className="card-title">Dati di Contatto</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.95rem' }}>
            <div>
              <span style={{ color: 'var(--color-text-muted)', width: '90px', display: 'inline-block' }}>Telefono:</span>
              <strong>{customer.phone || 'Non registrato'}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--color-text-muted)', width: '90px', display: 'inline-block' }}>Email:</span>
              <strong>{customer.email || 'Non registrata'}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--color-text-muted)', width: '90px', display: 'inline-block' }}>Ultima mod.:</span>
              <span>{new Date(customer.updated_at).toLocaleString('it-IT')}</span>
            </div>
          </div>
        </div>

        {/* Gestione Consensi GDPR */}
        <div className="card">
          <h2 className="card-title">Consensi e Privacy</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.9rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>Informativa Privacy</strong>
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                  {latestPrivacyHistory
                    ? `Accettata il ${new Date(latestPrivacyHistory.granted_at).toLocaleDateString('it-IT')}`
                    : privacyGranted
                    ? 'Accettata'
                    : '—'}
                </div>
              </div>
              {privacyGranted ? (
                <span className="badge badge-success">Attivo</span>
              ) : (
                <span className="badge badge-warning">Non registrata</span>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--color-border)', paddingTop: '0.5rem' }}>
              <div>
                <strong>Comunicazioni Marketing</strong>
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                  Stato: {marketingGranted ? 'Accettato' : 'Revocato / Non concesso'}
                  {latestMarketingHistory && (
                    <span> · {new Date(latestMarketingHistory.granted_at).toLocaleDateString('it-IT')}</span>
                  )}
                </div>
              </div>
              <div>
                {marketingGranted ? (
                  canEdit ? (
                    <Button variant="danger" size="sm" onClick={handleRevokeMarketing}>
                      Revoca
                    </Button>
                  ) : (
                    <span className="badge badge-success">Attivo</span>
                  )
                ) : (
                  canEdit ? (
                    <Button variant="primary" size="sm" onClick={handleOpenGrantMarketingModal}>
                      Acquisisci nuovo consenso
                    </Button>
                  ) : (
                    <span className="badge badge-warning">Revocato</span>
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sezione Conti di Fidelizzazione */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Conti di Fidelizzazione</h2>
          <p className="page-subtitle">
            Conto standard (Punti / Vantaggi) ed eventuale conto VIP separato con credenziali e benefici autonomi.
          </p>
        </div>
        {canEdit && (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {canUpgradeToVantaggi && (
              <Button variant="primary" onClick={() => handleOpenAccountModal('vantaggi')}>
                ⭐ Attiva Vantaggi
              </Button>
            )}
            {canCreateVip && (
              <Button variant={canUpgradeToVantaggi ? 'secondary' : 'primary'} onClick={() => handleOpenAccountModal('vip')}>
                👑 Crea Conto VIP Separato
              </Button>
            )}
            {canCreateStandard && (
              <Button variant="primary" onClick={() => handleOpenAccountModal('punti')}>
                ➕ Attiva Conto Fedeltà
              </Button>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {(!customer.loyalty_accounts || customer.loyalty_accounts.length === 0) ? (
          <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
            <p className="page-subtitle">Nessun conto di fidelizzazione attivo per questo cliente.</p>
          </div>
        ) : (
          customer.loyalty_accounts.map((acc) => {
            const badgeClass =
              acc.profile_code === 'vip'
                ? 'badge-vip'
                : acc.profile_code === 'vantaggi'
                ? 'badge-vantaggi'
                : 'badge-punti';

            const creds = accountCredentials[acc.id] || [];
            const activeDigitalCred = creds.find((c) => c.type === 'digital' && c.status === 'active');
            const activePhysicalCred = creds.find((c) => c.type === 'physical' && c.status === 'active');

            return (
              <div key={acc.id} className="card" style={{ borderLeft: '4px solid var(--color-primary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
                      <span className={`badge ${badgeClass}`}>{acc.profile_name}</span>
                      <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Conto #{acc.id}</span>
                      <span className="badge badge-success">{acc.status}</span>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                      Attivato il {new Date(acc.created_at).toLocaleDateString('it-IT')}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                    {acc.balance !== undefined && (
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--color-text)' }}>{acc.balance}</div>
                        <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                          Punti Saldo Attuale
                        </div>
                      </div>
                    )}
                    <Link
                      to={`/dashboard/loyalty-accounts/${acc.id}/preview`}
                      className="btn btn-outline btn-sm"
                      style={{ textDecoration: 'none' }}
                      title="Visualizza anteprima carta senza modificare credenziali"
                    >
                      👁 Anteprima carta
                    </Link>
                  </div>
                </div>

                {/* Sezione Credenziali del Conto */}
                <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
                    Credenziali di Accesso Associate
                  </h4>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                    {/* Credenziale Digitale */}
                    <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <strong>📱 Tessera Digitale (Smartphone)</strong>
                        {activeDigitalCred ? (
                          <span className="badge badge-success">Attiva</span>
                        ) : (
                          <span className="badge badge-warning">Non emessa</span>
                        )}
                      </div>

                      {activeDigitalCred ? (
                        <div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
                            Emessa il: {new Date(activeDigitalCred.issued_at).toLocaleString('it-IT')}
                          </div>
                          {activeDigitalCred.has_recoverable_token ? (
                            <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginBottom: '0.75rem' }}>
                              Il link fisso della carta è cifrato in modo sicuro e può essere visualizzato o copiato senza alterare la tessera:
                            </div>
                          ) : (
                            <div style={{ fontSize: '0.78rem', color: '#b45309', background: '#fef3c7', padding: '0.45rem 0.65rem', borderRadius: '4px', marginBottom: '0.75rem', fontWeight: 500 }}>
                              ⚠️ Link non recuperabile: rigenera la credenziale una sola volta.
                            </div>
                          )}
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                            <Link
                              to={`/dashboard/loyalty-accounts/${acc.id}/preview`}
                              className="btn btn-outline btn-sm"
                              style={{ textDecoration: 'none' }}
                              title="Visualizza anteprima carta senza modificare credenziali"
                            >
                              👁 Anteprima carta
                            </Link>
                            {activeDigitalCred.has_recoverable_token && (
                              <Button
                                variant="primary"
                                size="sm"
                                title="Visualizza e copia il link esistente della carta senza alterarla"
                                onClick={() => {
                                  setRevealModalCred({
                                    credentialId: activeDigitalCred.id,
                                    accountName: `${customer.first_name} ${customer.last_name} (${acc.profile_name})`,
                                  });
                                  setRevealedUrl(null);
                                  setRevealError(null);
                                  setCopiedReveal(false);
                                }}
                              >
                                🔗 Visualizza / Copia link
                              </Button>
                            )}
                            {canEdit && (
                              <Button
                                variant="secondary"
                                size="sm"
                                title="Invalida il link attuale ed emette un nuovo link in caso di smarrimento o compromissione"
                                onClick={() => {
                                  setRotateModalError(null);
                                  setCredToRotate({
                                    credentialId: activeDigitalCred.id,
                                    accountName: `${customer.first_name} ${customer.last_name} (${acc.profile_name})`,
                                  });
                                }}
                              >
                                🔄 Rigenera credenziale
                              </Button>
                            )}
                          </div>
                        </div>
                      ) : (
                        canEdit && (
                          <Button variant="primary" size="sm" onClick={() => handleIssueCredential(acc.id, acc.profile_name)}>
                            ➕ Emetti Credenziale Digitale
                          </Button>
                        )
                      )}
                    </div>

                    {/* Credenziale Fisica */}
                    <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <strong>💳 Tessera Fisica PVC</strong>
                        {activePhysicalCred ? (
                          <span className="badge badge-success">Attiva</span>
                        ) : (
                          <span className="badge" style={{ background: '#e2e8f0' }}>Non abbinata</span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                        {activePhysicalCred ? (
                          <>
                            <div>Carta ID #{activePhysicalCred.card_id}</div>
                            <div>Emessa il: {new Date(activePhysicalCred.issued_at).toLocaleString('it-IT')}</div>
                          </>
                        ) : (
                          'Per associare una carta fisica a questo conto, utilizza la sezione "Carte Fisiche".'
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modale Modifica Anagrafica */}
      <Modal
        isOpen={isEditOpen}
        title="Modifica Dati Cliente"
        onClose={() => {
          setIsEditOpen(false);
          setEditModalError(null);
        }}
      >
        <form onSubmit={handleUpdateCustomer}>
          {editModalError && (
            <div style={{ marginBottom: '1rem' }}>
              <Alert type="error" message={editModalError} onDismiss={() => setEditModalError(null)} />
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <Input label="Nome *" required value={editFirstName} onChange={(e) => setEditFirstName(e.target.value)} />
            <Input label="Cognome *" required value={editLastName} onChange={(e) => setEditLastName(e.target.value)} />
          </div>
          <Input label="Telefono" type="tel" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
          <Input label="Email" type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />

          <div className="modal-actions">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setIsEditOpen(false);
                setEditModalError(null);
              }}
              disabled={isSubmittingEdit}
            >
              Annulla
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmittingEdit}>
              Salva Modifiche
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modale Attiva / Amplia Conto */}
      <Modal
        isOpen={isNewAccountOpen}
        title={
          newAccountProfile === 'vantaggi' && hasPunti
            ? 'Attiva Profilo Vantaggi'
            : newAccountProfile === 'vip'
            ? 'Crea Conto VIP Separato'
            : 'Attiva Conto Fedeltà'
        }
        onClose={() => {
          setIsNewAccountOpen(false);
          setAccountModalError(null);
        }}
      >
        <form onSubmit={handleCreateAccount}>
          {accountModalError && (
            <div style={{ marginBottom: '1rem' }}>
              <Alert type="error" message={accountModalError} onDismiss={() => setAccountModalError(null)} />
            </div>
          )}

          <p className="page-subtitle" style={{ marginBottom: '1rem' }}>
            {newAccountProfile === 'vantaggi' && hasPunti
              ? 'Il conto Punti del cliente verrà ampliato al profilo Vantaggi: conserverà lo stesso saldo, storico e codice QR, abilitando offerte e promozioni.'
              : newAccountProfile === 'vip'
              ? 'Verrà creato un conto VIP indipendente con il proprio saldo, benefici esclusivi e una nuova credenziale digitale con QR code separato.'
              : 'Seleziona il profilo di fidelizzazione da attivare.'}
          </p>

          {availableOptions.length > 1 && (
            <Select
              label="Operazione da eseguire *"
              options={availableOptions}
              value={newAccountProfile}
              onChange={(e) => setNewAccountProfile(e.target.value as any)}
            />
          )}

          <div className="modal-actions">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setIsNewAccountOpen(false);
                setAccountModalError(null);
              }}
              disabled={isCreatingAccount}
            >
              Annulla
            </Button>
            <Button type="submit" variant="primary" isLoading={isCreatingAccount}>
              {newAccountProfile === 'vantaggi' && hasPunti ? 'Attiva Vantaggi' : 'Conferma Creazione'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modale Conferma Rotazione */}
      <Modal
        isOpen={Boolean(credToRotate)}
        title="Conferma Rotazione Credenziale"
        onClose={() => {
          setCredToRotate(null);
          setRotateModalError(null);
        }}
      >
        {credToRotate && (
          <div>
            {rotateModalError && (
              <div style={{ marginBottom: '1rem' }}>
                <Alert type="error" message={rotateModalError} onDismiss={() => setRotateModalError(null)} />
              </div>
            )}
            <p>
              Stai per generare un <strong>nuovo token e link digitale</strong> per {credToRotate.accountName}.
            </p>
            <p style={{ marginTop: '0.5rem', color: 'var(--color-danger)', fontSize: '0.9rem', fontWeight: 600 }}>
              ⚠️ Il link e il QR code precedenti smetteranno di funzionare immediatamente. Dovrai fornire il nuovo link al cliente.
            </p>
            <div className="modal-actions">
              <Button
                variant="secondary"
                onClick={() => {
                  setCredToRotate(null);
                  setRotateModalError(null);
                }}
                disabled={isRotating}
              >
                Annulla
              </Button>
              <Button variant="danger" onClick={handleConfirmRotate} isLoading={isRotating}>
                Rigenera Credenziale
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modale Acquisisci Nuovo Consenso Marketing */}
      <Modal
        isOpen={isConsentModalOpen}
        title="Acquisisci Consenso Marketing"
        onClose={() => {
          setIsConsentModalOpen(false);
          setConsentModalError(null);
        }}
      >
        <form onSubmit={handleGrantMarketingSubmit}>
          {consentModalError && (
            <div style={{ marginBottom: '1rem' }}>
              <Alert type="error" message={consentModalError} onDismiss={() => setConsentModalError(null)} />
            </div>
          )}

          <p className="page-subtitle" style={{ marginBottom: '1rem' }}>
            Registra un nuovo consenso al trattamento dati per comunicazioni promozionali per <strong>{customer?.first_name} {customer?.last_name}</strong>.
          </p>

          <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', marginBottom: '1.25rem' }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer', fontSize: '0.9rem' }}>
              <input
                type="checkbox"
                checked={consentCheckbox}
                onChange={(e) => setConsentCheckbox(e.target.checked)}
                style={{ marginTop: '0.2rem', width: '1.1rem', height: '1.1rem' }}
              />
              <span>
                Acconsento a ricevere comunicazioni promozionali e offerte da <strong>{activeBusiness?.name || 'questo esercizio'}</strong>.
              </span>
            </label>
          </div>

          <div className="modal-actions">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setIsConsentModalOpen(false);
                setConsentModalError(null);
              }}
              disabled={isGrantingConsent}
            >
              Annulla
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={!consentCheckbox || isGrantingConsent}
              isLoading={isGrantingConsent}
            >
              Conferma Consenso
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modale Rivelazione Link Sicuro (AES-256-GCM) */}
      <Modal
        isOpen={revealModalCred !== null}
        title="Visualizza / Copia Link Carta Digitale"
        onClose={handleCloseRevealModal}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {revealError && <Alert type="error" message={revealError} onDismiss={() => setRevealError(null)} />}

          {!revealedUrl ? (
            <div>
              <p style={{ fontSize: '0.95rem', color: 'var(--color-text)', marginBottom: '1rem' }}>
                Stai per visualizzare il link della credenziale di <strong>{revealModalCred?.accountName}</strong>.
              </p>
              <div style={{ background: '#f8fafc', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '0.85rem', marginBottom: '1.25rem' }}>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                  🔒 <strong>Avviso di Sicurezza:</strong> Questa operazione decifra il token memorizzato con AES-256-GCM. <strong>Non modifica la carta</strong> né altera il saldo o lo stato del cliente. L'accesso verrà registrato nel log di sicurezza (audit).
                </p>
              </div>
              <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <Button variant="outline" onClick={handleCloseRevealModal} disabled={isRevealing}>
                  Annulla
                </Button>
                <Button variant="primary" onClick={handleRevealLink} isLoading={isRevealing}>
                  Conferma e Visualizza
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ background: '#ecfdf5', border: '1px solid #10b981', borderRadius: 'var(--radius-md)', padding: '0.85rem', marginBottom: '1rem' }}>
                <span style={{ fontSize: '0.85rem', color: '#065f46', fontWeight: 600 }}>
                  ✓ Link recuperato con successo. Puoi copiarlo e consegnarlo al cliente.
                </span>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text)', marginBottom: '0.4rem' }}>
                  URL Pubblico della Carta
                </label>
                <input
                  type="text"
                  readOnly
                  value={revealedUrl}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.75rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    fontSize: '0.9rem',
                    fontFamily: 'monospace',
                    background: '#f1f5f9',
                    color: '#0f172a',
                  }}
                  onFocus={(e) => e.target.select()}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.25rem' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                  Nota: Visualizza/Copia non altera il link né la tessera.
                </span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <Button variant="outline" onClick={handleCloseRevealModal}>
                    Chiudi
                  </Button>
                  <Button variant="primary" onClick={handleCopyRevealedUrl}>
                    {copiedReveal ? '✓ Copiato!' : '📋 Copia Link'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Modale Visualizzazione QR generato/rotato */}
      {qrDisplay && (
        <QrModal
          isOpen={Boolean(qrDisplay)}
          onClose={() => setQrDisplay(null)}
          token={qrDisplay.token}
          customerName={`${customer?.first_name || ''} ${customer?.last_name || ''}`.trim()}
          profileName={qrDisplay.profileName}
          customerEmail={customer?.email || undefined}
          businessName={activeBusiness?.name}
        />
      )}
    </div>
  );
};
