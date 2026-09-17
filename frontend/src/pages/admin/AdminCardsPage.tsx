import React, { useEffect, useState } from 'react';
import { cardsApi, businessApi } from '../../api/services';
import type { Card, Business } from '../../types';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Select } from '../../components/common/Select';
import { Modal } from '../../components/common/Modal';
import { Alert } from '../../components/common/Alert';
import { Spinner } from '../../components/common/Spinner';
import { Pagination } from '../../components/common/Pagination';

export const AdminCardsPage: React.FC = () => {
  const [cards, setCards] = useState<Card[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modale Genera Lotto
  const [isBatchOpen, setIsBatchOpen] = useState(false);
  const [batchQuantity, setBatchQuantity] = useState<number>(10);
  const [isGenerating, setIsGenerating] = useState(false);

  // Modale Assegna Carte a Commercio
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [targetBusinessId, setTargetBusinessId] = useState<number | ''>('');
  const [cardIdsToAssign, setCardIdsToAssign] = useState<string>('');
  const [isAssigning, setIsAssigning] = useState(false);

  const loadCards = async (p = 1) => {
    setIsLoading(true);
    try {
      const res = await cardsApi.listAdminCards(statusFilter || undefined, p, 20);
      setCards(res.data);
      if (res.pagination) {
        setPage(res.pagination.page);
        setTotalPages(res.pagination.total_pages);
      }
    } catch {
      setCards([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadBusinesses = async () => {
    try {
      const list = await businessApi.list();
      setBusinesses(list);
      if (list.length > 0) setTargetBusinessId(list[0].id);
    } catch {
      // Ignora
    }
  };

  useEffect(() => {
    loadCards(1);
    loadBusinesses();
  }, [statusFilter]);

  const handleGenerateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);
    setFeedback(null);
    try {
      const res = await cardsApi.createBatch(Number(batchQuantity));
      setFeedback({ type: 'success', message: `Lotto di ${res.created_count} carte generato con successo in stato INVENTORY.` });
      setIsBatchOpen(false);
      await loadCards(1);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Errore durante la generazione del lotto.' });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAssignCards = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetBusinessId || !cardIdsToAssign) return;
    setIsAssigning(true);
    setFeedback(null);
    try {
      const ids = cardIdsToAssign
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n) && n > 0);

      if (ids.length === 0) {
        setFeedback({ type: 'error', message: 'Inserisci almeno un ID carta valido separato da virgola.' });
        setIsAssigning(false);
        return;
      }

      const res = await cardsApi.assign(Number(targetBusinessId), ids);
      setFeedback({ type: 'success', message: `${res.assigned_count} carte assegnate con successo al commercio!` });
      setIsAssignOpen(false);
      setCardIdsToAssign('');
      await loadCards(1);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Errore durante l\'assegnazione delle carte.' });
    } finally {
      setIsAssigning(false);
    }
  };

  if (isLoading) return <Spinner size="lg" text="Caricamento inventario globale carte..." />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Inventario Globale Carte Fisiche</h1>
          <p className="page-subtitle">Genera stock di carte fisiche neutre e assegna i lotti ai commercianti.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Button variant="secondary" onClick={() => setIsAssignOpen(true)}>
            📦 Assegna a Commercio
          </Button>
          <Button variant="primary" onClick={() => setIsBatchOpen(true)}>
            ➕ Genera Lotto Carte
          </Button>
        </div>
      </div>

      {feedback && <Alert type={feedback.type} message={feedback.message} onDismiss={() => setFeedback(null)} />}

      <div className="card" style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Filtra per stato:</span>
        <Select
          options={[
            { label: 'Tutti gli stati', value: '' },
            { label: 'In Inventario (Libere)', value: 'inventory' },
            { label: 'Assegnate a Commercio (Issued)', value: 'issued' },
            { label: 'Attive in mano ai Clienti', value: 'active' },
            { label: 'Sospese', value: 'suspended' },
            { label: 'Revocate o Sostituite', value: 'revoked' },
          ]}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ width: 'auto', margin: 0 }}
        />
      </div>

      <div className="table-responsive">
        <table className="data-table">
          <thead>
            <tr>
              <th>ID Carta</th>
              <th>Stato</th>
              <th>Commercio Assegnatario</th>
              <th>Conto Fedeltà</th>
              <th>Generata il</th>
              <th>Data Assegnazione</th>
            </tr>
          </thead>
          <tbody>
            {cards.map((c) => (
              <tr key={c.id}>
                <td>
                  <strong>#{c.id}</strong>
                </td>
                <td>
                  <span
                    className={`badge ${
                      c.status === 'active'
                        ? 'badge-success'
                        : c.status === 'inventory'
                        ? 'badge-warning'
                        : c.status === 'issued'
                        ? 'badge-primary'
                        : 'badge-danger'
                    }`}
                  >
                    {c.status}
                  </span>
                </td>
                <td>{c.business_id ? `Commercio #${c.business_id}` : 'In magazzino centrale'}</td>
                <td>{c.loyalty_account_id ? `Conto #${c.loyalty_account_id}` : '—'}</td>
                <td>{new Date(c.created_at).toLocaleDateString('it-IT')}</td>
                <td>{c.assigned_at ? new Date(c.assigned_at).toLocaleDateString('it-IT') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination page={page} totalPages={totalPages} onPageChange={(p) => loadCards(p)} />

      {/* Modale Genera Lotto */}
      <Modal isOpen={isBatchOpen} title="Genera Lotto Carte Fisiche" onClose={() => setIsBatchOpen(false)}>
        <form onSubmit={handleGenerateBatch}>
          <p className="page-subtitle" style={{ marginBottom: '1rem' }}>
            Verranno generate carte con token crittografici sicuri a 32 byte in stato <strong>INVENTORY</strong> pronte per la stampa e spedizione.
          </p>

          <Input
            label="Quantità di Carte da Generare *"
            type="number"
            min="1"
            max="1000"
            required
            value={batchQuantity}
            onChange={(e) => setBatchQuantity(parseInt(e.target.value, 10) || 1)}
          />

          <div className="modal-actions">
            <Button type="button" variant="secondary" onClick={() => setIsBatchOpen(false)} disabled={isGenerating}>
              Annulla
            </Button>
            <Button type="submit" variant="primary" isLoading={isGenerating}>
              Genera Lotto
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modale Assegna a Commercio */}
      <Modal isOpen={isAssignOpen} title="Assegna Carte a Commercio" onClose={() => setIsAssignOpen(false)}>
        <form onSubmit={handleAssignCards}>
          <p className="page-subtitle" style={{ marginBottom: '1rem' }}>
            Seleziona l'azienda di destinazione e specifica gli ID delle carte fisiche da trasferire dallo stato INVENTORY a ISSUED.
          </p>

          <Select
            label="Commercio di Destinazione *"
            options={businesses.map((b) => ({ label: `${b.name} (ID: ${b.id})`, value: b.id }))}
            value={targetBusinessId}
            onChange={(e) => setTargetBusinessId(Number(e.target.value))}
          />

          <Input
            label="ID Carte da Assegnare (separati da virgola) *"
            required
            placeholder="es. 101, 102, 103, 104"
            value={cardIdsToAssign}
            onChange={(e) => setCardIdsToAssign(e.target.value)}
            helper="Le carte devono trovarsi attualmente in stato 'inventory'."
          />

          <div className="modal-actions">
            <Button type="button" variant="secondary" onClick={() => setIsAssignOpen(false)} disabled={isAssigning}>
              Annulla
            </Button>
            <Button type="submit" variant="primary" isLoading={isAssigning}>
              Assegna Carte
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
