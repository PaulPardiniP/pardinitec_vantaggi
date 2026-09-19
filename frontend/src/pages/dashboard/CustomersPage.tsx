import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { customerApi, loyaltyApi } from '../../api/services';
import type { Customer, CardProfile } from '../../types';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Select } from '../../components/common/Select';
import { Modal } from '../../components/common/Modal';
import { Alert } from '../../components/common/Alert';
import { Spinner } from '../../components/common/Spinner';
import { EmptyState } from '../../components/common/EmptyState';
import { Pagination } from '../../components/common/Pagination';
import { QrModal } from '../../components/common/QrModal';
import { ApiError } from '../../api/client';

export const CustomersPage: React.FC = () => {
  const { activeBusiness, hasPermission } = useAuth();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [profiles, setProfiles] = useState<CardProfile[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modale Nuovo Cliente (Onboarding)
  const [isOnboardOpen, setIsOnboardOpen] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [selectedProfileId, setSelectedProfileId] = useState<number>(1);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [marketingAccepted, setMarketingAccepted] = useState(false);
  const [onboardSubmitting, setOnboardSubmitting] = useState(false);
  const [onboardError, setOnboardError] = useState<string | null>(null);

  // Modale Successo con QR
  const [createdCredential, setCreatedCredential] = useState<{
    token: string;
    customerName: string;
    profileName: string;
    customerEmail?: string;
    businessName?: string;
  } | null>(null);

  const canEdit = hasPermission('customer.edit');

  const fetchCustomers = async (p = 1, term = search) => {
    if (!activeBusiness) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await customerApi.list(activeBusiness.id, { page: p, per_page: 15, search: term || undefined });
      setCustomers(res.data);
      setPage(res.pagination.page);
      setTotalPages(res.pagination.total_pages);
    } catch (err: any) {
      if (err instanceof ApiError) setError(err.message);
      else setError('Impossibile caricare i clienti.');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchProfiles = async () => {
    try {
      const list = await loyaltyApi.listProfiles();
      setProfiles(list);
      if (list.length > 0) setSelectedProfileId(list[0].id);
    } catch {
      // profili opzionali
    }
  };

  useEffect(() => {
    fetchCustomers(1);
    fetchProfiles();
  }, [activeBusiness]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchCustomers(1, search);
  };

  const handleOnboardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBusiness || onboardSubmitting) return;
    if (!privacyAccepted) {
      setOnboardError('Il consenso alla privacy è obbligatorio per completare la registrazione.');
      return;
    }

    setOnboardSubmitting(true);
    setOnboardError(null);

    try {
      const res = await customerApi.onboard(activeBusiness.id, {
        first_name: firstName,
        last_name: lastName,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        card_profile_id: selectedProfileId,
        privacy_accepted: privacyAccepted,
        marketing_accepted: marketingAccepted,
      });

      setIsOnboardOpen(false);
      // Reset form
      setFirstName('');
      setLastName('');
      setPhone('');
      const customerEmailVal = email.trim() || undefined;
      setEmail('');
      setPrivacyAccepted(false);
      setMarketingAccepted(false);

      // Mostra modale con QR e Link del nuovo cliente
      const profName = profiles.find((p) => p.id === selectedProfileId)?.name || 'Fedeltà';
      setCreatedCredential({
        token: res.token,
        customerName: `${res.customer.first_name} ${res.customer.last_name}`,
        profileName: profName,
        customerEmail: customerEmailVal,
        businessName: activeBusiness.name,
      });

      await fetchCustomers(1);
    } catch (err: any) {
      setOnboardError(err.message || 'Errore durante la creazione del cliente.');
    } finally {
      setOnboardSubmitting(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Gestione Clienti</h1>
          <p className="page-subtitle">Elenco anagrafiche e tessere di fidelizzazione attive.</p>
        </div>
        {canEdit && (
          <Button variant="primary" onClick={() => setIsOnboardOpen(true)}>
            ➕ Registra Cliente (Onboarding)
          </Button>
        )}
      </div>

      {error && <Alert type="error" message={error} />}

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <Input
            placeholder="Cerca per nome, cognome, telefono o email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ margin: 0 }}
          />
          <Button type="submit" variant="secondary">
            Cerca
          </Button>
          {search && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSearch('');
                fetchCustomers(1, '');
              }}
            >
              Reset
            </Button>
          )}
        </form>
      </div>

      {isLoading ? (
        <Spinner size="lg" text="Caricamento clienti in corso..." />
      ) : customers.length === 0 ? (
        <EmptyState
          title="Nessun cliente trovato"
          description={search ? 'Nessun cliente corrisponde ai criteri di ricerca impostati.' : 'Non ci sono ancora clienti registrati per questo punto vendita.'}
          action={
            canEdit ? (
              <Button variant="primary" onClick={() => setIsOnboardOpen(true)}>
                Registra il primo cliente
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Nominativo</th>
                  <th>Telefono</th>
                  <th>Email</th>
                  <th>Registrato il</th>
                  <th style={{ textAlign: 'right' }}>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id}>
                    <td>#{c.id}</td>
                    <td>
                      <strong>
                        {c.first_name} {c.last_name}
                      </strong>
                    </td>
                    <td>{c.phone || '—'}</td>
                    <td>{c.email || '—'}</td>
                    <td>{new Date(c.created_at).toLocaleDateString('it-IT')}</td>
                    <td style={{ textAlign: 'right' }}>
                      <Link to={`/dashboard/customers/${c.id}`} className="btn btn-outline btn-sm">
                        Dettagli & Conti →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination page={page} totalPages={totalPages} onPageChange={(p) => fetchCustomers(p)} />
        </>
      )}

      {/* Modale Nuovo Cliente */}
      <Modal isOpen={isOnboardOpen} title="Registrazione Nuovo Cliente (Presenziale)" onClose={() => setIsOnboardOpen(false)}>
        <form onSubmit={handleOnboardSubmit}>
          {onboardError && <Alert type="error" message={onboardError} />}

          <div
            style={{
              padding: '0.75rem 1rem',
              background: '#f1f5f9',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.85rem',
              color: 'var(--color-text-secondary)',
              marginBottom: '1rem',
              borderLeft: '4px solid var(--color-primary)',
            }}
          >
            📋 <strong>Registrazione al punto vendita</strong>: L'operatore registra le informazioni e le decisioni di consenso espresse presenzialmente dal cliente.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <Input label="Nome *" required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            <Input label="Cognome *" required value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>

          <Input label="Telefono (opzionale)" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+39 340 0000000" />
          <Input label="Email (opzionale)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="cliente@esempio.it" />

          {profiles.length > 0 && (
            <Select
              label="Profilo Iniziale di Fidelizzazione *"
              options={profiles.map((p) => ({ label: `${p.name} (${p.code.toUpperCase()})`, value: p.id }))}
              value={selectedProfileId}
              onChange={(e) => setSelectedProfileId(Number(e.target.value))}
            />
          )}

          <div style={{ margin: '1.25rem 0', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <label className="form-checkbox">
              <input
                type="checkbox"
                required
                checked={privacyAccepted}
                onChange={(e) => setPrivacyAccepted(e.target.checked)}
              />
              <span style={{ fontSize: '0.85rem' }}>
                <strong>Informativa Privacy (obbligatorio) *</strong>: Il cliente ha preso visione e accettato l'informativa sul trattamento dei dati personali per l'erogazione del servizio.
              </span>
            </label>

            <label className="form-checkbox">
              <input
                type="checkbox"
                checked={marketingAccepted}
                onChange={(e) => setMarketingAccepted(e.target.checked)}
              />
              <span style={{ fontSize: '0.85rem' }}>
                <strong>Comunicazioni Commerciali (opzionale)</strong>: Il cliente acconsente a ricevere promozioni e offerte speciali. <em>Facoltativo, non condiziona l'iscrizione al programma.</em>
              </span>
            </label>
          </div>

          <div className="modal-actions">
            <Button type="button" variant="secondary" onClick={() => setIsOnboardOpen(false)} disabled={onboardSubmitting}>
              Annulla
            </Button>
            <Button type="submit" variant="primary" isLoading={onboardSubmitting}>
              Completa Registrazione
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modale QR Credenziale creata */}
      {createdCredential && (
        <QrModal
          isOpen={Boolean(createdCredential)}
          onClose={() => setCreatedCredential(null)}
          token={createdCredential.token}
          customerName={createdCredential.customerName}
          profileName={createdCredential.profileName}
          customerEmail={createdCredential.customerEmail}
          businessName={createdCredential.businessName}
        />
      )}
    </div>
  );
};
