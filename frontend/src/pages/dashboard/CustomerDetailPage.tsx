import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { customerApi, loyaltyApi } from '../../api/services';
import type { Customer, CardProfile, Credential } from '../../types';
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
  const [profiles, setProfiles] = useState<CardProfile[]>([]);
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
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  // Creazione nuovo conto per profilo diverso
  const [isNewAccountOpen, setIsNewAccountOpen] = useState(false);
  const [newAccountProfile, setNewAccountProfile] = useState<'punti' | 'vantaggi' | 'vip'>('punti');
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);

  // Rotazione credenziale
  const [credToRotate, setCredToRotate] = useState<{ credentialId: number; accountName: string } | null>(null);
  const [isRotating, setIsRotating] = useState(false);

  // Visualizzazione QR Credenziale
  const [qrDisplay, setQrDisplay] = useState<{ token: string; profileName: string } | null>(null);

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

      const profList = await loyaltyApi.listProfiles();
      setProfiles(profList);

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
      setFeedback({ type: 'success', message: 'Anagrafica cliente aggiornata con successo.' });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Errore durante l\'aggiornamento.' });
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

  // Creazione Nuovo Conto Fedeltà Indipendente
  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBusiness || !customer) return;
    setIsCreatingAccount(true);
    setFeedback(null);
    try {
      await loyaltyApi.createAccount(activeBusiness.id, customer.id, newAccountProfile);
      setFeedback({
        type: 'success',
        message: `Nuovo conto indipendente (${newAccountProfile.toUpperCase()}) creato con successo!`,
      });
      setIsNewAccountOpen(false);
      await fetchCustomerData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Impossibile creare il conto.' });
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
    setFeedback(null);
    try {
      const res = await loyaltyApi.rotateCredential(activeBusiness.id, credToRotate.credentialId);
      setFeedback({ type: 'success', message: 'Credenziale digitale rotata con successo! Il token precedente è stato disabilitato.' });
      setQrDisplay({ token: res.token, profileName: credToRotate.accountName });
      setCredToRotate(null);
      await fetchCustomerData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Errore durante la rotazione.' });
    } finally {
      setIsRotating(false);
    }
  };

  if (isLoading) return <Spinner size="lg" text="Caricamento scheda cliente..." />;
  if (error || !customer) return <Alert type="error" message={error || 'Cliente non trovato.'} />;

  // Profili ancora non associati al cliente
  const existingProfileCodes = (customer.loyalty_accounts || []).map((a) => a.profile_code);
  const availableProfilesToCreate = profiles.filter((p) => !existingProfileCodes.includes(p.code));

  const marketingConsent = customer.consents?.find((c) => c.type === 'marketing');
  const privacyConsent = customer.consents?.find((c) => c.type === 'privacy');

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
          <Button variant="secondary" onClick={() => setIsEditOpen(true)}>
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
                  Accettata il {privacyConsent ? new Date(privacyConsent.granted_at).toLocaleDateString('it-IT') : '—'}
                </div>
              </div>
              <span className="badge badge-success">Attivo</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--color-border)', paddingTop: '0.5rem' }}>
              <div>
                <strong>Comunicazioni Marketing</strong>
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                  Stato: {marketingConsent?.status === 'granted' ? 'Accettato' : 'Revocato / Non concesso'}
                </div>
              </div>
              <div>
                {marketingConsent?.status === 'granted' ? (
                  canEdit ? (
                    <Button variant="danger" size="sm" onClick={handleRevokeMarketing}>
                      Revoca
                    </Button>
                  ) : (
                    <span className="badge badge-success">Attivo</span>
                  )
                ) : (
                  <span className="badge badge-warning">Revocato</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sezione Conti di Fidelizzazione Indipendenti */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Conti di Fidelizzazione Indipendenti</h2>
          <p className="page-subtitle">
            Ciascun conto (Punti, Vantaggi, VIP) possiede saldo, movimenti, benefici e credenziali autonomi.
          </p>
        </div>
        {canEdit && availableProfilesToCreate.length > 0 && (
          <Button variant="primary" onClick={() => setIsNewAccountOpen(true)}>
            ➕ Attiva Altro Conto Fedeltà
          </Button>
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

                  {acc.balance !== undefined && (
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--color-text)' }}>{acc.balance}</div>
                      <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                        Punti Saldo Attuale
                      </div>
                    </div>
                  )}
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
                          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
                            Emessa il: {new Date(activeDigitalCred.issued_at).toLocaleString('it-IT')}
                          </div>
                          {canEdit && (
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() =>
                                  setCredToRotate({
                                    credentialId: activeDigitalCred.id,
                                    accountName: `${customer.first_name} ${customer.last_name} (${acc.profile_name})`,
                                  })
                                }
                              >
                                🔄 Rigenera (Rotazione)
                              </Button>
                            </div>
                          )}
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
      <Modal isOpen={isEditOpen} title="Modifica Dati Cliente" onClose={() => setIsEditOpen(false)}>
        <form onSubmit={handleUpdateCustomer}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <Input label="Nome *" required value={editFirstName} onChange={(e) => setEditFirstName(e.target.value)} />
            <Input label="Cognome *" required value={editLastName} onChange={(e) => setEditLastName(e.target.value)} />
          </div>
          <Input label="Telefono" type="tel" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
          <Input label="Email" type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />

          <div className="modal-actions">
            <Button type="button" variant="secondary" onClick={() => setIsEditOpen(false)} disabled={isSubmittingEdit}>
              Annulla
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmittingEdit}>
              Salva Modifiche
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modale Attiva Altro Conto */}
      <Modal isOpen={isNewAccountOpen} title="Attiva Nuovo Conto Indipendente" onClose={() => setIsNewAccountOpen(false)}>
        <form onSubmit={handleCreateAccount}>
          <p className="page-subtitle" style={{ marginBottom: '1rem' }}>
            Seleziona il profilo di fidelizzazione da aggiungere per questo cliente. Il nuovo conto avrà saldo e benefici completamente separati.
          </p>

          <Select
            label="Profilo di Fidelizzazione *"
            options={availableProfilesToCreate.map((p) => ({ label: `${p.name} (${p.code.toUpperCase()})`, value: p.code }))}
            value={newAccountProfile}
            onChange={(e) => setNewAccountProfile(e.target.value as any)}
          />

          <div className="modal-actions">
            <Button type="button" variant="secondary" onClick={() => setIsNewAccountOpen(false)} disabled={isCreatingAccount}>
              Annulla
            </Button>
            <Button type="submit" variant="primary" isLoading={isCreatingAccount}>
              Crea Conto
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modale Conferma Rotazione */}
      <Modal isOpen={Boolean(credToRotate)} title="Conferma Rotazione Credenziale" onClose={() => setCredToRotate(null)}>
        {credToRotate && (
          <div>
            <p>
              Stai per generare un <strong>nuovo token e link digitale</strong> per {credToRotate.accountName}.
            </p>
            <p style={{ marginTop: '0.5rem', color: 'var(--color-danger)', fontSize: '0.9rem', fontWeight: 600 }}>
              ⚠️ Il link e il QR code precedenti smetteranno di funzionare immediatamente. Dovrai fornire il nuovo link al cliente.
            </p>
            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setCredToRotate(null)} disabled={isRotating}>
                Annulla
              </Button>
              <Button variant="danger" onClick={handleConfirmRotate} isLoading={isRotating}>
                Rigenera Credenziale
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modale Visualizzazione QR generato/rotato */}
      {qrDisplay && (
        <QrModal
          isOpen={Boolean(qrDisplay)}
          onClose={() => setQrDisplay(null)}
          token={qrDisplay.token}
          customerName={`${customer.first_name} ${customer.last_name}`}
          profileName={qrDisplay.profileName}
        />
      )}
    </div>
  );
};
