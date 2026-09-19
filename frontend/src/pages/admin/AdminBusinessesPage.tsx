import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { businessApi } from '../../api/services';
import type { Business, BusinessModule } from '../../types';
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
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modale Modifica Commercio
  const [editingBusiness, setEditingBusiness] = useState<Business | null>(null);
  const [editName, setEditName] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [editTaxId, setEditTaxId] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Modale Moduli per Commercio
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const [modules, setModules] = useState<BusinessModule[]>([]);
  const [loadingModules, setLoadingModules] = useState(false);

  // Ricerca e paginazione lato backend
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const PER_PAGE = 25;

  const loadBusinesses = async (page = currentPage, query = searchQuery, status = statusFilter) => {
    setIsLoading(true);
    try {
      const res = await businessApi.listPaginated({
        search: query.trim() || undefined,
        status: status,
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

  const handleStatusFilterChange = (s: 'all' | 'active' | 'inactive') => {
    setStatusFilter(s);
    setCurrentPage(1);
  };

  const handleOpenAsMerchant = (b: Business) => {
    selectBusiness(b);
    navigate('/dashboard');
  };

  const handleCreateBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const newBiz = await businessApi.create({
        name,
        slug: slug.trim().toLowerCase() || undefined,
        tax_id: taxId.trim() || undefined,
        self_registration_enabled: false,
      });
      setFeedback({ type: 'success', message: `Commercio "${newBiz.name}" creato con successo!` });
      setIsCreateOpen(false);
      setName('');
      setSlug('');
      setIsSlugManuallyEdited(false);
      setTaxId('');
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

  const handleToggleStatus = async (b: Business) => {
    const nextStatus = b.status === 'active' ? 'inactive' : 'active';
    const actionLabel = nextStatus === 'active' ? 'riattivare' : 'disattivare';
    if (!window.confirm(`Sei sicuro di voler ${actionLabel} il commercio "${b.name}"?`)) {
      return;
    }

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

  const handleOpenModules = async (b: Business) => {
    setSelectedBusiness(b);
    setLoadingModules(true);
    try {
      const mods = await businessApi.listModules(b.id);
      setModules(mods);
    } catch {
      setModules([]);
    } finally {
      setLoadingModules(false);
    }
  };

  const handleToggleModule = async (moduleCode: string, currentEnabled: boolean) => {
    if (!selectedBusiness) return;
    try {
      const updated = await businessApi.updateModule(selectedBusiness.id, moduleCode, !currentEnabled);
      setModules(updated);
      invalidateModulesCache(selectedBusiness.id);
      setFeedback({ type: 'success', message: `Modulo "${moduleCode}" aggiornato per ${selectedBusiness.name}.` });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Impossibile aggiornare il modulo.' });
    }
  };

  if (isLoading) return <Spinner size="lg" text="Caricamento commerci..." />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Gestione Commerci & Contratti</h1>
          <p className="page-subtitle">Censisci nuove aziende e gestisci i moduli funzionali attivi per ciascuna.</p>
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
          onChange={(e) => handleStatusFilterChange(e.target.value as 'all' | 'active' | 'inactive')}
          aria-label="Filtra per stato"
        >
          <option value="all">Tutti gli stati</option>
          <option value="active">Solo attivi</option>
          <option value="inactive">Solo disattivati</option>
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
              <th>Stato</th>
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
                <tr key={b.id}>
                  <td>#{b.id}</td>
                  <td>
                    <strong>{b.name}</strong>
                  </td>
                  <td>
                    <code>{b.slug}</code>
                  </td>
                  <td>{b.tax_id || '—'}</td>
                  <td>
                    <span className={`badge ${b.status === 'active' ? 'badge-success' : 'badge-danger'}`}>
                      {b.status === 'active' ? 'Attivo' : 'Disattivato'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleOpenAsMerchant(b)}
                        title="Accedi al pannello operativo di questo commercio"
                      >
                        🏪 Apri come commerciante
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleOpenEdit(b)}
                        title="Modifica dati anagrafici e impostazioni"
                      >
                        ✏️ Modifica
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleOpenModules(b)}
                        title="Abilita o disabilita moduli contrattuali"
                      >
                        ⚙️ Moduli
                      </Button>
                      <Button
                        variant={b.status === 'active' ? 'danger' : 'secondary'}
                        size="sm"
                        onClick={() => handleToggleStatus(b)}
                        title={b.status === 'active' ? 'Disattiva temporaneamente il commercio' : 'Riattiva il commercio'}
                      >
                        {b.status === 'active' ? '🚫 Disattiva' : '✅ Riattiva'}
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

      {/* Modale Crea Commercio */}
      <Modal isOpen={isCreateOpen} title="Crea Nuovo Commercio" onClose={() => setIsCreateOpen(false)}>
        <form onSubmit={handleCreateBusiness}>
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
            helper="Utilizzato per routing e identificazione pubblica. Rispetta esattamente quanto scritto."
          />

          <Input
            label="Partita IVA / Codice Fiscale (opzionale)"
            placeholder="IT01234567890"
            value={taxId}
            onChange={(e) => setTaxId(e.target.value)}
          />

          <div className="modal-actions">
            <Button type="button" variant="secondary" onClick={() => setIsCreateOpen(false)} disabled={isSubmitting}>
              Annulla
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmitting}>
              Crea Commercio
            </Button>
          </div>
        </form>
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
            helper="Identificativo univoco del commercio. Puoi personalizzarlo in qualsiasi momento."
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

      {/* Modale Gestione Moduli */}
      <Modal
        isOpen={Boolean(selectedBusiness)}
        title={`Moduli Abilitati - ${selectedBusiness?.name}`}
        onClose={() => setSelectedBusiness(null)}
      >
        {loadingModules ? (
          <Spinner text="Caricamento moduli..." />
        ) : (
          <div>
            <p className="page-subtitle" style={{ marginBottom: '1rem' }}>
              Attiva o disattiva le funzionalità contrattualizzate per questo commercio.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {modules.map((m) => (
                <div
                  key={m.code}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.75rem',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    background: m.is_enabled ? '#ffffff' : '#f8fafc',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{m.name}</div>
                    {m.description && <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{m.description}</div>}
                  </div>
                  <Button
                    variant={m.is_enabled ? 'danger' : 'primary'}
                    size="sm"
                    onClick={() => handleToggleModule(m.code, m.is_enabled)}
                  >
                    {m.is_enabled ? 'Disattiva' : 'Attiva'}
                  </Button>
                </div>
              ))}
            </div>

            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setSelectedBusiness(null)}>
                Chiudi
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
