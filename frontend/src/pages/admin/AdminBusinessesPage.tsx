import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { businessApi, adminApi } from '../../api/services';
import type { Business, BusinessModule, BusinessPackages, BusinessInvitation } from '../../types';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Modal } from '../../components/common/Modal';
import { Alert } from '../../components/common/Alert';
import { Spinner } from '../../components/common/Spinner';

export const AdminBusinessesPage: React.FC = () => {
  const { selectBusiness, invalidateModulesCache } = useAuth();
  const navigate = useNavigate();

  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modale Nuovo Commercio
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false);
  const [taxId, setTaxId] = useState('');
  const [ownerFirstName, setOwnerFirstName] = useState('');
  const [ownerLastName, setOwnerLastName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [createPackages, setCreatePackages] = useState<{
    punti: boolean;
    vantaggi: boolean;
    vip: boolean;
    campaigns: boolean;
  }>({
    punti: true,
    vantaggi: false,
    vip: false,
    campaigns: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdInviteUrl, setCreatedInviteUrl] = useState<string | null>(null);
  const [createdOwnerEmail, setCreatedOwnerEmail] = useState<string>('');

  // Modale Password per Vista Commerciante
  const [impersonateTarget, setImpersonateTarget] = useState<Business | null>(null);
  const [impersonatePassword, setImpersonatePassword] = useState('');
  const [isVerifyingPassword, setIsVerifyingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Modale Modifica Commercio
  const [editingBusiness, setEditingBusiness] = useState<Business | null>(null);
  const [editName, setEditName] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [editTaxId, setEditTaxId] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Modale Pacchetti e Funzionalità
  const [packagesBusiness, setPackagesBusiness] = useState<Business | null>(null);
  const [packages, setPackages] = useState<BusinessPackages | null>(null);
  const [rawModules, setRawModules] = useState<BusinessModule[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [packagesError, setPackagesError] = useState<string | null>(null);
  const [updatingPackageKey, setUpdatingPackageKey] = useState<string | null>(null);

  // Modale Gestione Inviti
  const [invitationsBusiness, setInvitationsBusiness] = useState<Business | null>(null);
  const [invitations, setInvitations] = useState<BusinessInvitation[]>([]);
  const [loadingInvitations, setLoadingInvitations] = useState(false);
  const [recentResentUrl, setRecentResentUrl] = useState<string | null>(null);
  const [invitationActionId, setInvitationActionId] = useState<number | null>(null);

  // Modale Terminazione Contratto GDPR
  const [terminatingBusiness, setTerminatingBusiness] = useState<Business | null>(null);
  const [isTerminating, setIsTerminating] = useState(false);

  // Modale Eliminazione Definitiva (Commercio Vuoto)
  const [deletingBusiness, setDeletingBusiness] = useState<Business | null>(null);
  const [deleteSlugInput, setDeleteSlugInput] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // Ricerca e paginazione lato backend
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'archived'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const PER_PAGE = 25;

  const loadBusinesses = async (page = currentPage, query = searchQuery, status = statusFilter) => {
    setIsLoading(true);
    try {
      const res = await businessApi.listPaginated({
        search: query.trim() || undefined,
        status: status as any,
        page,
        per_page: PER_PAGE,
      });
      setBusinesses(res.data);
      setTotalPages(res.pagination.total_pages);
      setTotalCount(res.pagination.total);
    } catch {
      setBusinesses([]);
      setTotalPages(1);
      setTotalCount(0);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBusinesses(currentPage, searchQuery, statusFilter);
  }, [currentPage, statusFilter]);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrentPage(1);
      loadBusinesses(1, searchQuery, statusFilter);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
  };

  const handleStatusFilterChange = (s: 'all' | 'active' | 'inactive' | 'archived') => {
    setStatusFilter(s);
    setCurrentPage(1);
  };

  const handleOpenAsMerchant = (b: Business) => {
    setImpersonateTarget(b);
    setImpersonatePassword('');
    setPasswordError(null);
  };

  const handleConfirmImpersonate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!impersonateTarget) return;
    if (!impersonatePassword.trim()) {
      setPasswordError('Inserisci la password di Super Admin.');
      return;
    }

    setIsVerifyingPassword(true);
    setPasswordError(null);
    try {
      await adminApi.verifyPassword(impersonatePassword, impersonateTarget.id);
      selectBusiness(impersonateTarget);
      setImpersonateTarget(null);
      setImpersonatePassword('');
      navigate('/dashboard');
    } catch (err: any) {
      setPasswordError(err.message || 'Password non corretta.');
    } finally {
      setIsVerifyingPassword(false);
    }
  };

  const handleCreateBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createPackages.punti && !createPackages.vip) {
      setFeedback({
        type: 'error',
        message: 'È obbligatorio selezionare almeno un profilo contrattuale tra Punti o VIP.',
      });
      return;
    }
    if (createPackages.vantaggi && !createPackages.punti) {
      setFeedback({
        type: 'error',
        message: 'Per disattivare Punti devi prima disattivare il profilo Vantaggi.',
      });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);
    setCreatedInviteUrl(null);
    try {
      const emailUsed = ownerEmail.trim().toLowerCase();
      const res = await businessApi.create({
        name,
        slug: slug.trim().toLowerCase() || undefined,
        tax_id: taxId.trim() || undefined,
        self_registration_enabled: false,
        owner_email: emailUsed || undefined,
        owner_first_name: ownerFirstName.trim() || undefined,
        owner_last_name: ownerLastName.trim() || undefined,
        packages: createPackages,
      });

      const invUrl = res.invitation?.invitation_url || (res as any).invitation_url;
      if (invUrl) {
        const absoluteUrl = new URL(invUrl, window.location.origin).toString();
        setCreatedInviteUrl(absoluteUrl);
        setCreatedOwnerEmail(emailUsed);
      }

      setFeedback({
        type: 'success',
        message: `Commercio "${res.name}" creato con successo! È stato generato il link di attivazione.`,
      });
      setName('');
      setSlug('');
      setIsSlugManuallyEdited(false);
      setTaxId('');
      setOwnerFirstName('');
      setOwnerLastName('');
      setOwnerEmail('');
      setCreatePackages({
        punti: true,
        vantaggi: false,
        vip: false,
        campaigns: false,
      });
      await loadBusinesses();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Errore durante la creazione del commercio.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenEdit = (b: Business) => {
    setEditingBusiness(b);
    setEditName(b.name);
    setEditSlug(b.slug);
    setEditTaxId(b.tax_id || '');
  };

  const handleUpdateBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBusiness) return;
    setIsUpdating(true);
    setFeedback(null);
    try {
      const updated = await businessApi.update(editingBusiness.id, {
        name: editName,
        slug: editSlug.trim().toLowerCase(),
        tax_id: editTaxId.trim() || null,
        self_registration_enabled: false,
      });
      setFeedback({ type: 'success', message: `Commercio "${updated.name}" aggiornato con successo!` });
      setEditingBusiness(null);
      await loadBusinesses();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Errore durante l\'aggiornamento del commercio.' });
    } finally {
      setIsUpdating(false);
    }
  };

  // Disattiva / Riattiva (con revoca di sessioni)
  const handleToggleStatus = async (b: Business) => {
    const nextStatus = b.status === 'active' ? 'inactive' : 'active';
    const warn =
      nextStatus === 'inactive'
        ? `Sei sicuro di voler disattivare "${b.name}"? Tutti gli operatori del commercio verranno disconnessi e l'accesso operativo sarà bloccato.`
        : `Sei sicuro di voler riattivare "${b.name}"?`;

    if (!window.confirm(warn)) return;

    try {
      await businessApi.toggleStatus(b.id, nextStatus);
      setFeedback({
        type: 'success',
        message: `Commercio "${b.name}" ${nextStatus === 'active' ? 'riattivato' : 'disattivato'} con successo.`,
      });
      await loadBusinesses();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Impossibile modificare lo stato del commercio.' });
    }
  };

  // Archivia / Ripristina
  const handleToggleArchive = async (b: Business) => {
    const nextArchived = !b.is_archived;
    const confirmMsg = nextArchived
      ? `Archiviare "${b.name}"? Il commercio verrà nascosto dalle viste operative ordinarie.`
      : `Ripristinare dall'archivio "${b.name}"?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      await businessApi.archive(b.id, nextArchived);
      setFeedback({
        type: 'success',
        message: `Commercio "${b.name}" ${nextArchived ? 'archiviato' : 'ripristinato'} con successo.`,
      });
      await loadBusinesses();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Impossibile aggiornare l\'archiviazione.' });
    }
  };

  // Terminazione Contratto GDPR
  const handleConfirmTerminate = async () => {
    if (!terminatingBusiness) return;
    setIsTerminating(true);
    try {
      const res = await businessApi.terminate(terminatingBusiness.id, 30);
      setFeedback({
        type: 'success',
        message: `Contratto di "${terminatingBusiness.name}" terminato. Sessioni revocate e cancellazione definitiva programmata per il ${res.scheduled_deletion_at} (30 giorni).`,
      });
      setTerminatingBusiness(null);
      await loadBusinesses();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Impossibile terminare il contratto.' });
    } finally {
      setIsTerminating(false);
    }
  };

  const handleCancelTermination = async (b: Business) => {
    if (!window.confirm(`Annullare la terminazione contrattuale e la cancellazione programmata per "${b.name}"?`)) {
      return;
    }
    try {
      await businessApi.cancelTermination(b.id);
      setFeedback({
        type: 'success',
        message: `Terminazione annullata per "${b.name}". Il commercio può essere riattivato normalmente.`,
      });
      await loadBusinesses();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Impossibile annullare la terminazione.' });
    }
  };

  const handleExportData = async (b: Business) => {
    try {
      await businessApi.exportData(b.id);
      setFeedback({
        type: 'success',
        message: `Dati esportati con successo per "${b.name}".`,
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Errore durante l\'esportazione dei dati.' });
    }
  };

  // Eliminazione Definitiva (Commercio Vuoto)
  const handleConfirmDeleteEmpty = async () => {
    if (!deletingBusiness) return;
    if (deleteSlugInput.trim() !== deletingBusiness.slug) {
      setFeedback({ type: 'error', message: 'Lo slug inserito non corrisponde esattamente al commercio.' });
      return;
    }
    setIsDeleting(true);
    try {
      await businessApi.deleteEmpty(deletingBusiness.id, deleteSlugInput.trim());
      setFeedback({
        type: 'success',
        message: `Commercio "${deletingBusiness.name}" (#${deletingBusiness.id}) eliminato definitivamente.`,
      });
      setDeletingBusiness(null);
      setDeleteSlugInput('');
      await loadBusinesses();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Impossibile eliminare il commercio.' });
    } finally {
      setIsDeleting(false);
    }
  };

  // Gestione Pacchetti Funzionali
  const handleOpenPackages = async (b: Business) => {
    setPackagesBusiness(b);
    setLoadingPackages(true);
    setPackagesError(null);
    try {
      const res = await businessApi.getPackages(b.id);
      if (!res || !res.packages) {
        throw new Error('Impossibile recuperare i pacchetti contrattuali del commercio.');
      }
      setPackages(res.packages);
      setRawModules(res.raw_modules || []);
    } catch (err: any) {
      setPackages(null);
      setRawModules([]);
      setPackagesError(err?.message || 'Errore durante il recupero dei pacchetti contrattuali.');
    } finally {
      setLoadingPackages(false);
    }
  };

  const handleTogglePackage = async (packageCode: 'punti' | 'vantaggi' | 'vip' | 'campaigns', currentEnabled: boolean) => {
    if (!packagesBusiness) return;
    if (packageCode === 'punti' && currentEnabled && packages?.vantaggi) {
      setPackagesError('Per disattivare Punti devi prima disattivare il profilo Vantaggi.');
      return;
    }
    setUpdatingPackageKey(packageCode);
    setPackagesError(null);
    try {
      const res = await businessApi.updatePackage(packagesBusiness.id, packageCode, !currentEnabled);
      if (res && res.packages) {
        setPackages(res.packages);
        setRawModules(res.raw_modules || []);
        invalidateModulesCache(packagesBusiness.id);
        setFeedback({
          type: 'success',
          message: `Pacchetto "${packageCode.toUpperCase()}" aggiornato con successo per ${packagesBusiness.name}.`,
        });
      }
    } catch (err: any) {
      setPackagesError(err.message || 'Errore durante l\'aggiornamento del pacchetto.');
      setFeedback({ type: 'error', message: err.message || 'Errore durante l\'aggiornamento del pacchetto.' });
    } finally {
      setUpdatingPackageKey(null);
    }
  };

  const handleToggleRawModule = async (moduleCode: string, currentEnabled: boolean) => {
    if (!packagesBusiness) return;
    try {
      const updated = await businessApi.updateModule(packagesBusiness.id, moduleCode, !currentEnabled);
      setRawModules(updated);
      const pkgRes = await businessApi.getPackages(packagesBusiness.id);
      setPackages(pkgRes.packages);
      invalidateModulesCache(packagesBusiness.id);
      setFeedback({ type: 'success', message: `Modulo "${moduleCode}" aggiornato per ${packagesBusiness.name}.` });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Impossibile aggiornare il modulo.' });
    }
  };

  // Gestione Inviti
  const handleOpenInvitations = async (b: Business) => {
    setInvitationsBusiness(b);
    setRecentResentUrl(null);
    setLoadingInvitations(true);
    try {
      const list = await businessApi.listInvitations(b.id);
      setInvitations(list);
    } catch {
      setInvitations([]);
    } finally {
      setLoadingInvitations(false);
    }
  };

  const handleResendInvitation = async (invId: number) => {
    if (!invitationsBusiness) return;
    setInvitationActionId(invId);
    try {
      const res = await businessApi.resendInvitation(invitationsBusiness.id, invId);
      if (res.invitation_url) {
        const absoluteUrl = new URL(res.invitation_url, window.location.origin).toString();
        setRecentResentUrl(absoluteUrl);
      }
      setFeedback({ type: 'success', message: 'Nuovo invito generato e registrato con successo (scadenza: 7 giorni).' });
      const updated = await businessApi.listInvitations(invitationsBusiness.id);
      setInvitations(updated);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Impossibile reinviare l\'invito.' });
    } finally {
      setInvitationActionId(null);
    }
  };

  const handleCancelInvitation = async (invId: number) => {
    if (!invitationsBusiness) return;
    if (!window.confirm('Sei sicuro di voler annullare questo invito?')) return;
    setInvitationActionId(invId);
    try {
      await businessApi.cancelInvitation(invitationsBusiness.id, invId);
      setFeedback({ type: 'success', message: 'Invito annullato con successo.' });
      const updated = await businessApi.listInvitations(invitationsBusiness.id);
      setInvitations(updated);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Impossibile annullare l\'invito.' });
    } finally {
      setInvitationActionId(null);
    }
  };

  if (isLoading) return <Spinner size="lg" text="Caricamento commerci..." />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Gestione Commerci & Contratti</h1>
          <p className="page-subtitle">
            Censisci nuove aziende con titolare, gestisci pacchetti contrattuali e governa il ciclo di vita GDPR.
          </p>
        </div>
        <Button variant="primary" onClick={() => setIsCreateOpen(true)}>
          ➕ Nuovo Commercio
        </Button>
      </div>

      {feedback && <Alert type={feedback.type} message={feedback.message} onDismiss={() => setFeedback(null)} />}

      {/* Barra di ricerca e filtri */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <Input
          placeholder="Cerca per nome, ID, slug o P.IVA..."
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          style={{ flex: '1 1 240px', maxWidth: '400px' }}
        />
        <select
          className="form-control"
          style={{ width: 'auto', padding: '0.45rem 0.75rem', fontSize: '0.9rem' }}
          value={statusFilter}
          onChange={(e) => handleStatusFilterChange(e.target.value as any)}
          aria-label="Filtra per stato"
        >
          <option value="all">Tutti gli stati</option>
          <option value="active">Solo attivi</option>
          <option value="inactive">Solo disattivati</option>
          <option value="archived">Archiviati</option>
        </select>
        <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
          {totalCount} commerci trovati
        </span>
      </div>

      <div className="table-responsive">
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Nome Azienda</th>
              <th>Slug / URL</th>
              <th>P.IVA / Cod. Fiscale</th>
              <th>Stato Contratto</th>
              <th style={{ textAlign: 'right' }}>Azioni Amministrative</th>
            </tr>
          </thead>
          <tbody>
            {businesses.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem' }}>
                  Nessun commercio trovato con i filtri selezionati.
                </td>
              </tr>
            ) : (
              businesses.map((b) => (
                <tr key={b.id} style={{ opacity: b.is_archived ? 0.65 : 1 }}>
                  <td>#{b.id}</td>
                  <td>
                    <strong>{b.name}</strong>
                  </td>
                  <td>
                    <code>{b.slug}</code>
                  </td>
                  <td>{b.tax_id || '—'}</td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-start' }}>
                      {b.is_archived && (
                        <span className="badge" style={{ backgroundColor: '#64748b', color: '#ffffff' }}>
                          📦 Archiviato
                        </span>
                      )}
                      {b.terminated_at && (
                        <span
                          className="badge badge-danger"
                          title={`Cancellazione definitiva programmata: ${b.scheduled_deletion_at || 'in 30 giorni'}`}
                        >
                          ⏳ Terminazione GDPR
                        </span>
                      )}
                      {!b.is_archived && !b.terminated_at && (
                        <span className={`badge ${b.status === 'active' ? 'badge-success' : 'badge-danger'}`}>
                          {b.status === 'active' ? 'Attivo' : 'Disattivato'}
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleOpenAsMerchant(b)}
                        title="Accedi al pannello operativo di questo commercio"
                        disabled={b.is_archived || Boolean(b.terminated_at)}
                      >
                        🏪 Apri
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleOpenEdit(b)}
                        title="Modifica dati anagrafici e slug"
                      >
                        ✏️ Modifica
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleOpenPackages(b)}
                        title="Configura pacchetti funzionali (Punti, Vantaggi, VIP, Campagne)"
                      >
                        📦 Pacchetti
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleOpenInvitations(b)}
                        title="Gestisci inviti titolare e accessi"
                      >
                        ✉️ Inviti
                      </Button>

                      {/* Azioni Ciclo di Vita */}
                      {!b.is_archived && !b.terminated_at && (
                        <Button
                          variant={b.status === 'active' ? 'danger' : 'secondary'}
                          size="sm"
                          onClick={() => handleToggleStatus(b)}
                          title={b.status === 'active' ? 'Disattiva l\'accesso operativo e revoca sessioni' : 'Riattiva il commercio'}
                        >
                          {b.status === 'active' ? '🚫 Disattiva' : '✅ Riattiva'}
                        </Button>
                      )}

                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleToggleArchive(b)}
                        title={b.is_archived ? 'Ripristina commercio dall\'archivio' : 'Archivia commercio'}
                      >
                        {b.is_archived ? '📂 Ripristina' : '📁 Archivia'}
                      </Button>

                      {b.terminated_at ? (
                        <>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleExportData(b)}
                            title="Scarica tutti i dati in formato JSON per conformità o backup GDPR"
                          >
                            📥 Scarica Dati (GDPR)
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleCancelTermination(b)}
                            title="Annulla terminazione e cancellazione programmata"
                          >
                            ↩️ Annulla GDPR
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => setTerminatingBusiness(b)}
                          title="Terminazione contrattuale GDPR (30 giorni di retention)"
                        >
                          ⏱️ Termina GDPR
                        </Button>
                      )}

                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => {
                          setDeletingBusiness(b);
                          setDeleteSlugInput('');
                        }}
                        title="Elimina definitivamente (consentito solo se privo di dati o storico)"
                      >
                        🗑️ Elimina
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Paginazione */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', marginTop: '1rem' }}>
          <Button variant="secondary" size="sm" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>
            ←
          </Button>
          <span style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
            Pagina {currentPage} di {totalPages}
          </span>
          <Button variant="secondary" size="sm" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
            →
          </Button>
        </div>
      )}

      {/* Modale Crea Commercio (con onboarding Titolare) */}
      <Modal
        isOpen={isCreateOpen}
        title="Crea Nuovo Commercio"
        onClose={() => {
          setIsCreateOpen(false);
          setCreatedInviteUrl(null);
        }}
      >
        {createdInviteUrl ? (
          <div>
            <Alert
              type="success"
              message="Commercio creato con successo ed è stato generato l'invito per il titolare!"
            />
            <div style={{ marginTop: '1rem', padding: '1rem', background: '#f8fafc', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
              {createdOwnerEmail && (
                <div style={{ marginBottom: '0.75rem', fontSize: '0.9rem' }}>
                  <strong>Email Titolare:</strong> <span style={{ color: 'var(--color-primary)' }}>{createdOwnerEmail}</span>
                </div>
              )}
              <div style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.85rem' }}>Link di attivazione per il Titolare:</div>
              <input
                type="text"
                readOnly
                className="form-control"
                value={createdInviteUrl}
                style={{ fontSize: '0.85rem', marginBottom: '0.75rem', background: '#ffffff' }}
              />
              <div style={{ padding: '0.5rem 0.75rem', background: '#fffbeb', borderRadius: 'var(--radius-sm)', border: '1px solid #fde68a', marginBottom: '1rem' }}>
                <p style={{ fontSize: '0.8rem', color: '#92400e', margin: 0, fontWeight: 500 }}>
                  ⚠️ <strong>Validità:</strong> Questo link è monouso e scade tra <strong>7 giorni</strong>. Il titolare potrà impostare la propria password e completare l'attivazione del commercio.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    if (createdInviteUrl) {
                      navigator.clipboard.writeText(createdInviteUrl);
                      alert('Link copiato negli appunti!');
                    }
                  }}
                >
                  📋 Copia Link Invito
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    if (createdInviteUrl) {
                      const msg = `Ciao, ecco il link per attivare il tuo account su Pardinitec Vantaggi e configurare la tua password: ${createdInviteUrl}\n\nNota: Il link è monouso e scade tra 7 giorni.`;
                      navigator.clipboard.writeText(msg);
                      alert('Messaggio per il titolare copiato negli appunti!');
                    }
                  }}
                >
                  💬 Copia Messaggio (WhatsApp / Email)
                </Button>
              </div>
            </div>
            <div className="modal-actions" style={{ marginTop: '1.25rem' }}>
              <Button
                variant="secondary"
                onClick={() => {
                  setIsCreateOpen(false);
                  setCreatedInviteUrl(null);
                  setCreatedOwnerEmail('');
                }}
              >
                Chiudi
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleCreateBusiness}>
            <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.5rem', color: 'var(--color-primary)' }}>
              1. Dati Aziendali
            </div>
            <Input
              label="Nome Azienda *"
              required
              placeholder="es. Bar Pasticceria Rossi"
              value={name}
              onChange={(e) => {
                const val = e.target.value;
                setName(val);
                if (!isSlugManuallyEdited) {
                  setSlug(val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''));
                }
              }}
            />

            <Input
              label="Slug Identificativo (URL) *"
              required
              placeholder="es. bar-rossi"
              value={slug}
              onChange={(e) => {
                setIsSlugManuallyEdited(true);
                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
              }}
              helper="Identificativo univoco usato per instradamento e tessere."
            />

            <Input
              label="Partita IVA / Codice Fiscale (opzionale)"
              placeholder="IT01234567890"
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
            />

            <div style={{ fontWeight: 600, fontSize: '0.95rem', marginTop: '1.25rem', marginBottom: '0.5rem', color: 'var(--color-primary)' }}>
              2. Onboarding Titolare *
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
              Il Super Admin non imposta né conosce la password del titolare. Verrà generato un link di invito sicuro di un solo uso valido 7 giorni.
            </p>

            <Input
              label="Email Titolare *"
              type="email"
              placeholder="titolare@azienda.it"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              helper="Obbligatoria per generare il link di attivazione account."
            />

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <Input
                label="Nome Titolare"
                placeholder="es. Mario"
                value={ownerFirstName}
                onChange={(e) => setOwnerFirstName(e.target.value)}
                style={{ flex: 1 }}
              />
              <Input
                label="Cognome Titolare"
                placeholder="es. Rossi"
                value={ownerLastName}
                onChange={(e) => setOwnerLastName(e.target.value)}
                style={{ flex: 1 }}
              />
            </div>

            <div style={{ fontWeight: 600, fontSize: '0.95rem', marginTop: '1.25rem', marginBottom: '0.5rem', color: 'var(--color-primary)' }}>
              3. Pacchetti contrattuali *
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
              Seleziona almeno un profilo contrattuale per attivare le funzionalità del commercio.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '1rem', padding: '0.75rem', background: '#f8fafc', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={createPackages.punti}
                  onChange={(e) => {
                    const isChecking = e.target.checked;
                    if (!isChecking && createPackages.vantaggi) {
                      setFeedback({
                        type: 'error',
                        message: 'Per disattivare Punti devi prima disattivare il profilo Vantaggi.',
                      });
                      return;
                    }
                    setCreatePackages((prev) => ({ ...prev, punti: isChecking }));
                  }}
                  style={{ marginTop: '0.2rem' }}
                />
                <div>
                  <strong style={{ fontSize: '0.9rem' }}>🏆 Profilo Punti</strong>
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                    Programma fedeltà con accumulo punti e catalogo premi riscattabili.
                  </div>
                </div>
              </label>

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={createPackages.vantaggi}
                  onChange={(e) => {
                    const isChecking = e.target.checked;
                    setCreatePackages((prev) => ({
                      ...prev,
                      vantaggi: isChecking,
                      punti: isChecking ? true : prev.punti,
                    }));
                  }}
                  style={{ marginTop: '0.2rem' }}
                />
                <div>
                  <strong style={{ fontSize: '0.9rem' }}>🏷️ Profilo Vantaggi</strong>
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                    Ampliamento di Punti: include punti e premi, aggiunge offerte promozionali, vantaggi diretti e sconti.
                  </div>
                </div>
              </label>

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={createPackages.vip}
                  onChange={(e) => setCreatePackages((prev) => ({ ...prev, vip: e.target.checked }))}
                  style={{ marginTop: '0.2rem' }}
                />
                <div>
                  <strong style={{ fontSize: '0.9rem' }}>⭐ Profilo VIP</strong>
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                    Vantaggi e offerte esclusive dedicate ai clienti con status VIP.
                  </div>
                </div>
              </label>

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', cursor: 'pointer', borderTop: '1px solid var(--color-border)', paddingTop: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={createPackages.campaigns}
                  onChange={(e) => setCreatePackages((prev) => ({ ...prev, campaigns: e.target.checked }))}
                  style={{ marginTop: '0.2rem' }}
                />
                <div>
                  <strong style={{ fontSize: '0.9rem' }}>📢 Add-on Campagne di Comunicazione (Opzionale)</strong>
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                    Invio messaggi promozionali diretti, annunci e comunicazioni broadcast ai clienti.
                  </div>
                </div>
              </label>
            </div>

            {!createPackages.punti && !createPackages.vip && (
              <div style={{ color: '#ef4444', fontSize: '0.825rem', marginBottom: '0.75rem', fontWeight: 500 }}>
                ⚠️ È obbligatorio selezionare almeno un profilo tra Punti o VIP.
              </div>
            )}

            <div className="modal-actions" style={{ marginTop: '1.25rem' }}>
              <Button type="button" variant="secondary" onClick={() => setIsCreateOpen(false)} disabled={isSubmitting}>
                Annulla
              </Button>
              <Button type="submit" variant="primary" isLoading={isSubmitting}>
                Crea Commercio
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modale Modifica Commercio */}
      <Modal isOpen={Boolean(editingBusiness)} title={`Modifica Commercio #${editingBusiness?.id}`} onClose={() => setEditingBusiness(null)}>
        <form onSubmit={handleUpdateBusiness}>
          <Input
            label="Nome Azienda *"
            required
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
          />

          <Input
            label="Slug Identificativo (URL) *"
            required
            value={editSlug}
            onChange={(e) => setEditSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            helper="Identificativo univoco del commercio."
          />

          <Input
            label="Partita IVA / Codice Fiscale"
            placeholder="IT01234567890"
            value={editTaxId}
            onChange={(e) => setEditTaxId(e.target.value)}
          />

          <div className="modal-actions">
            <Button type="button" variant="secondary" onClick={() => setEditingBusiness(null)} disabled={isUpdating}>
              Annulla
            </Button>
            <Button type="submit" variant="primary" isLoading={isUpdating}>
              Salva Modifiche
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modale Pacchetti Funzionali & Diagnostica */}
      <Modal
        isOpen={Boolean(packagesBusiness)}
        title={`Pacchetti Contrattuali - ${packagesBusiness?.name}`}
        onClose={() => {
          setPackagesBusiness(null);
          setPackagesError(null);
        }}
      >
        {loadingPackages ? (
          <Spinner text="Caricamento pacchetti..." />
        ) : packagesError ? (
          <div style={{ padding: '0.5rem 0' }}>
            <Alert type="error" message={packagesError} />
            <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.75rem' }}>
              <Button
                variant="primary"
                size="sm"
                onClick={() => packagesBusiness && handleOpenPackages(packagesBusiness)}
              >
                🔄 Riprova
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setPackagesBusiness(null);
                  setPackagesError(null);
                }}
              >
                Chiudi
              </Button>
            </div>
          </div>
        ) : packages ? (
          <div>
            <p className="page-subtitle" style={{ marginBottom: '1.25rem' }}>
              Abilita o disabilita i 4 profili di business contrattualizzati per questa azienda. Il sistema applicherà
              atomicamente le funzionalità sottostanti.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {/* 1. Profilo Punti */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.85rem 1rem',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  background: packages.punti ? '#ffffff' : '#f8fafc',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <strong style={{ fontSize: '1rem' }}>🏆 Profilo Punti</strong>
                    <span className={`badge ${packages.punti ? 'badge-success' : 'badge-danger'}`}>
                      {packages.punti ? 'Attivo' : 'Non attivo'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.825rem', color: 'var(--color-text-muted)', marginTop: '0.2rem' }}>
                    Programma fedeltà basato sull'accumulo punti e catalogo premi riscattabili.
                  </div>
                </div>
                <Button
                  variant={packages.punti ? 'danger' : 'primary'}
                  size="sm"
                  isLoading={updatingPackageKey === 'punti'}
                  onClick={() => handleTogglePackage('punti', packages.punti)}
                >
                  {packages.punti ? 'Disattiva' : 'Attiva'}
                </Button>
              </div>

              {/* 2. Profilo Vantaggi */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.85rem 1rem',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  background: packages.vantaggi ? '#ffffff' : '#f8fafc',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <strong style={{ fontSize: '1rem' }}>🏷️ Profilo Vantaggi</strong>
                    <span className={`badge ${packages.vantaggi ? 'badge-success' : 'badge-danger'}`}>
                      {packages.vantaggi ? 'Attivo' : 'Non attivo'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.825rem', color: 'var(--color-text-muted)', marginTop: '0.2rem' }}>
                    Ampliamento del Profilo Punti: conserva saldo punti, catalogo premi e credenziali; aggiunge offerte promozionali, vantaggi diretti e sconti riservati.
                  </div>
                </div>
                <Button
                  variant={packages.vantaggi ? 'danger' : 'primary'}
                  size="sm"
                  isLoading={updatingPackageKey === 'vantaggi'}
                  onClick={() => handleTogglePackage('vantaggi', packages.vantaggi)}
                >
                  {packages.vantaggi ? 'Disattiva' : 'Attiva'}
                </Button>
              </div>

              {/* 3. Profilo VIP */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.85rem 1rem',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  background: packages.vip ? '#ffffff' : '#f8fafc',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <strong style={{ fontSize: '1rem' }}>⭐ Profilo VIP</strong>
                    <span className={`badge ${packages.vip ? 'badge-success' : 'badge-danger'}`}>
                      {packages.vip ? 'Attivo' : 'Non attivo'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.825rem', color: 'var(--color-text-muted)', marginTop: '0.2rem' }}>
                    Vantaggi e offerte esclusive riservate ai soli clienti contrassegnati come VIP.
                  </div>
                </div>
                <Button
                  variant={packages.vip ? 'danger' : 'primary'}
                  size="sm"
                  isLoading={updatingPackageKey === 'vip'}
                  onClick={() => handleTogglePackage('vip', packages.vip)}
                >
                  {packages.vip ? 'Disattiva' : 'Attiva'}
                </Button>
              </div>

              {/* 4. Add-on Campagne */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.85rem 1rem',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  background: packages.campaigns ? '#ffffff' : '#f8fafc',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <strong style={{ fontSize: '1rem' }}>📢 Add-on Campagne di Comunicazione</strong>
                    <span className={`badge ${packages.campaigns ? 'badge-success' : 'badge-danger'}`}>
                      {packages.campaigns ? 'Attivo' : 'Non attivo'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.825rem', color: 'var(--color-text-muted)', marginTop: '0.2rem' }}>
                    Invio di messaggi promozionali diretti, annunci e comunicazioni broadcast.
                  </div>
                </div>
                <Button
                  variant={packages.campaigns ? 'danger' : 'primary'}
                  size="sm"
                  isLoading={updatingPackageKey === 'campaigns'}
                  onClick={() => handleTogglePackage('campaigns', packages.campaigns)}
                >
                  {packages.campaigns ? 'Disattiva' : 'Attiva'}
                </Button>
              </div>
            </div>

            {/* Diagnostica Tecnica Moduli */}
            <details style={{ marginTop: '1.5rem', borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>
              <summary style={{ cursor: 'pointer', fontSize: '0.85rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                🔍 Dettagli tecnici e diagnostica capabilities
              </summary>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem' }}>
                {rawModules.map((m) => (
                  <div
                    key={m.code}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.5rem 0.75rem',
                      background: '#f8fafc',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.85rem',
                    }}
                  >
                    <div>
                      <code>{m.code}</code> — {m.name}
                    </div>
                    <Button
                      variant={m.is_enabled ? 'danger' : 'secondary'}
                      size="sm"
                      onClick={() => handleToggleRawModule(m.code, m.is_enabled)}
                    >
                      {m.is_enabled ? 'Disattiva' : 'Attiva'}
                    </Button>
                  </div>
                ))}
              </div>
            </details>

            <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
              <Button
                variant="secondary"
                onClick={() => {
                  setPackagesBusiness(null);
                  setPackagesError(null);
                }}
              >
                Chiudi
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Modale Gestione Inviti */}
      <Modal
        isOpen={Boolean(invitationsBusiness)}
        title={`Inviti Titolare - ${invitationsBusiness?.name}`}
        onClose={() => {
          setInvitationsBusiness(null);
          setRecentResentUrl(null);
        }}
      >
        {loadingInvitations ? (
          <Spinner text="Caricamento inviti..." />
        ) : (
          <div>
            {recentResentUrl && (
              <div style={{ marginBottom: '1rem', padding: '0.85rem', background: '#f8fafc', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.35rem' }}>
                  Nuovo link di invito generato:
                </div>
                <input
                  type="text"
                  readOnly
                  className="form-control"
                  value={recentResentUrl ? new URL(recentResentUrl, window.location.origin).toString() : ''}
                  style={{ fontSize: '0.825rem', marginBottom: '0.5rem', background: '#ffffff' }}
                />
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    if (recentResentUrl) {
                      const fullUrl = new URL(recentResentUrl, window.location.origin).toString();
                      navigator.clipboard.writeText(fullUrl);
                      alert('Link copiato negli appunti!');
                    }
                  }}
                >
                  📋 Copia Link
                </Button>
              </div>
            )}

            {invitations.length === 0 ? (
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '1.5rem' }}>
                Nessun invito registrato per questo commercio.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {invitations.map((inv) => (
                  <div
                    key={inv.id}
                    style={{
                      padding: '0.75rem',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-md)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '0.5rem',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600 }}>{inv.email}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                        {inv.first_name} {inv.last_name} ({inv.role}) • Scadenza: {inv.expires_at}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span
                        className={`badge ${
                          inv.status === 'accepted'
                            ? 'badge-success'
                            : inv.status === 'pending'
                            ? 'badge-warning'
                            : 'badge-danger'
                        }`}
                      >
                        {inv.status === 'accepted'
                          ? 'Accettato'
                          : inv.status === 'pending'
                          ? 'In attesa'
                          : inv.status === 'cancelled'
                          ? 'Annullato'
                          : 'Scaduto'}
                      </span>
                      {inv.status === 'pending' && (
                        <>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={invitationActionId === inv.id}
                            onClick={() => handleResendInvitation(inv.id)}
                            title="Genera un nuovo token di invito e prolunga la scadenza a 7 giorni"
                          >
                            🔄 Rinnova
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={invitationActionId === inv.id}
                            onClick={() => handleCancelInvitation(inv.id)}
                            title="Annulla questo invito"
                          >
                            ✕
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="modal-actions" style={{ marginTop: '1.25rem' }}>
              <Button
                variant="secondary"
                onClick={() => {
                  setInvitationsBusiness(null);
                  setRecentResentUrl(null);
                }}
              >
                Chiudi
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modale Terminazione Contratto GDPR */}
      <Modal
        isOpen={Boolean(terminatingBusiness)}
        title={`Termina Contratto (GDPR) - ${terminatingBusiness?.name}`}
        onClose={() => setTerminatingBusiness(null)}
      >
        <div>
          <Alert
            type="error"
            message="Attenzione: questa procedura avvia il periodo di recesso contrattuale GDPR."
          />
          <div style={{ fontSize: '0.9rem', margin: '1rem 0', lineHeight: 1.5 }}>
            <p>Confermando la terminazione:</p>
            <ul style={{ paddingLeft: '1.25rem', marginTop: '0.5rem' }}>
              <li>Il commercio verrà immediatamente sospeso.</li>
              <li>Tutte le sessioni degli operatori associati verranno revocate istantaneamente.</li>
              <li>Verrà programmata la cancellazione definitiva dei dati tra <strong>30 giorni</strong>.</li>
              <li>Durante il periodo di retention (30 giorni) potrai revocare la cancellazione.</li>
            </ul>
          </div>

          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setTerminatingBusiness(null)} disabled={isTerminating}>
              Annulla
            </Button>
            <Button variant="danger" isLoading={isTerminating} onClick={handleConfirmTerminate}>
              Conferma Terminazione (30 giorni)
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modale Eliminazione Definitiva (Commercio Vuoto) */}
      <Modal
        isOpen={Boolean(deletingBusiness)}
        title={`Eliminazione Definitiva - ${deletingBusiness?.name}`}
        onClose={() => {
          setDeletingBusiness(null);
          setDeleteSlugInput('');
        }}
      >
        <div>
          <Alert
            type="error"
            message="Azione irreversibile. L'eliminazione immediata è permessa unicamente per commerci appena censiti o completamente privi di clienti, carte o storico."
          />
          <p style={{ fontSize: '0.9rem', marginTop: '1rem', marginBottom: '0.5rem' }}>
            Per confermare l'eliminazione definitiva, digita esattamente lo slug:{' '}
            <code>{deletingBusiness?.slug}</code>
          </p>
          <Input
            placeholder={deletingBusiness?.slug || ''}
            value={deleteSlugInput}
            onChange={(e) => setDeleteSlugInput(e.target.value)}
          />

          <div className="modal-actions" style={{ marginTop: '1.25rem' }}>
            <Button
              variant="secondary"
              onClick={() => {
                setDeletingBusiness(null);
                setDeleteSlugInput('');
              }}
              disabled={isDeleting}
            >
              Annulla
            </Button>
            <Button
              variant="danger"
              isLoading={isDeleting}
              disabled={deleteSlugInput.trim() !== deletingBusiness?.slug}
              onClick={handleConfirmDeleteEmpty}
            >
              Elimina Definitivamente
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modale Conferma Password Super Admin per Vista Commerciante */}
      <Modal
        isOpen={Boolean(impersonateTarget)}
        title="Accesso Vista Commerciante"
        onClose={() => {
          setImpersonateTarget(null);
          setImpersonatePassword('');
          setPasswordError(null);
        }}
      >
        <form onSubmit={handleConfirmImpersonate}>
          <div style={{ marginBottom: '1rem', fontSize: '0.9rem', lineHeight: 1.5 }}>
            Stai per accedere al pannello operativo di:{' '}
            <strong style={{ color: 'var(--color-primary)' }}>{impersonateTarget?.name}</strong>.
            <p style={{ marginTop: '0.5rem', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
              Per motivi di sicurezza, conferma la tua identità inserendo la tua password attuale di Super Admin.
            </p>
          </div>

          {passwordError && (
            <div style={{ marginBottom: '1rem' }}>
              <Alert type="error" message={passwordError} />
            </div>
          )}

          <Input
            label="Password Super Admin *"
            type="password"
            required
            placeholder="••••••••"
            value={impersonatePassword}
            onChange={(e) => setImpersonatePassword(e.target.value)}
            autoFocus
          />

          <div className="modal-actions" style={{ marginTop: '1.25rem' }}>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setImpersonateTarget(null);
                setImpersonatePassword('');
                setPasswordError(null);
              }}
              disabled={isVerifyingPassword}
            >
              Annulla
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={isVerifyingPassword}
            >
              Conferma e Accedi
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
