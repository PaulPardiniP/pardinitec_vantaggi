import React, { useEffect, useState } from 'react';
import { businessApi } from '../../api/services';
import type { Business, BusinessModule } from '../../types';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Modal } from '../../components/common/Modal';
import { Alert } from '../../components/common/Alert';
import { Spinner } from '../../components/common/Spinner';

export const AdminBusinessesPage: React.FC = () => {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modale Nuovo Commercio
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [taxId, setTaxId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modale Moduli per Commercio
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const [modules, setModules] = useState<BusinessModule[]>([]);
  const [loadingModules, setLoadingModules] = useState(false);

  const loadBusinesses = async () => {
    setIsLoading(true);
    try {
      const list = await businessApi.list();
      setBusinesses(list);
    } catch {
      setBusinesses([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBusinesses();
  }, []);

  const handleCreateBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const newBiz = await businessApi.create({
        name,
        slug: slug.trim().toLowerCase(),
        tax_id: taxId.trim() || undefined,
      });
      setFeedback({ type: 'success', message: `Commercio "${newBiz.name}" creato con successo!` });
      setIsCreateOpen(false);
      setName('');
      setSlug('');
      setTaxId('');
      await loadBusinesses();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Errore durante la creazione del commercio.' });
    } finally {
      setIsSubmitting(false);
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

      <div className="table-responsive">
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Nome Azienda</th>
              <th>Slug / URL</th>
              <th>P.IVA / Cod. Fiscale</th>
              <th>Autoregistrazione</th>
              <th>Stato</th>
              <th style={{ textAlign: 'right' }}>Azioni Amministrative</th>
            </tr>
          </thead>
          <tbody>
            {businesses.map((b) => (
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
                  <span className={`badge ${b.self_registration_enabled ? 'badge-success' : 'badge-warning'}`}>
                    {b.self_registration_enabled ? 'Abilitata' : 'Disabilitata'}
                  </span>
                </td>
                <td>
                  <span className="badge badge-success">{b.status}</span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <Button variant="secondary" size="sm" onClick={() => handleOpenModules(b)}>
                    ⚙️ Gestisci Moduli
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modale Crea Commercio */}
      <Modal isOpen={isCreateOpen} title="Crea Nuovo Commercio" onClose={() => setIsCreateOpen(false)}>
        <form onSubmit={handleCreateBusiness}>
          <Input
            label="Nome Azienda *"
            required
            placeholder="es. Bar Pasticceria Rossi"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!slug) setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-'));
            }}
          />

          <Input
            label="Slug Identificativo (URL) *"
            required
            placeholder="es. bar-rossi"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            helper="Utilizzato per routing e identificazione pubblica."
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
