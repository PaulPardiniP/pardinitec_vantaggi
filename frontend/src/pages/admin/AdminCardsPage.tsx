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

interface NfcCardItem {
  id: number;
  token?: string;
  public_url?: string;
  status?: string;
  error?: string;
}

export const AdminCardsPage: React.FC = () => {
  const [cards, setCards] = useState<Card[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Selezione carte
  const [selectedCardIds, setSelectedCardIds] = useState<number[]>([]);
  const [lastCreatedBatchCards, setLastCreatedBatchCards] = useState<Card[] | null>(null);

  // Modale Genera Lotto
  const [isBatchOpen, setIsBatchOpen] = useState(false);
  const [batchQuantity, setBatchQuantity] = useState<number>(10);
  const [isGenerating, setIsGenerating] = useState(false);

  // Modale Assegna Carte a Commercio
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [targetBusinessId, setTargetBusinessId] = useState<number | ''>('');
  const [isAssigning, setIsAssigning] = useState(false);

  // Modale Programmazione lotto NFC
  const [isNfcModalOpen, setIsNfcModalOpen] = useState(false);
  const [nfcModalCards, setNfcModalCards] = useState<NfcCardItem[]>([]);
  const [nfcAssignedBusinessName, setNfcAssignedBusinessName] = useState<string | null>(null);
  const [isNfcLoading, setIsNfcLoading] = useState(false);
  const [nfcError, setNfcError] = useState<string | null>(null);
  const [nfcRetryAction, setNfcRetryAction] = useState<(() => void) | null>(null);
  const [copiedCardId, setCopiedCardId] = useState<number | 'all' | null>(null);

  const getAbsoluteUrl = (tokenOrPath: string) => {
    const base = (import.meta as any).env?.VITE_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '');
    const cleanBase = base.replace(/\/+$/, '');
    const path = tokenOrPath.startsWith('/') ? tokenOrPath : `/c/${tokenOrPath}`;
    return `${cleanBase}${path}`;
  };

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
      if (list.length > 0 && !targetBusinessId) setTargetBusinessId(list[0].id);
    } catch {
      // Ignora
    }
  };

  useEffect(() => {
    loadCards(1);
    loadBusinesses();
  }, [statusFilter]);

  // Carte attualmente in pagina con stato inventory
  const pageInventoryCards = cards.filter((c) => c.status === 'inventory');

  const handleSelectCard = (id: number) => {
    setSelectedCardIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllPage = () => {
    const pageInvIds = pageInventoryCards.map((c) => c.id);
    const allSelected = pageInvIds.length > 0 && pageInvIds.every((id) => selectedCardIds.includes(id));

    if (allSelected) {
      setSelectedCardIds((prev) => prev.filter((id) => !pageInvIds.includes(id)));
    } else {
      setSelectedCardIds((prev) => Array.from(new Set([...prev, ...pageInvIds])));
    }
  };

  const handleSelectCreatedBatch = () => {
    if (!lastCreatedBatchCards || lastCreatedBatchCards.length === 0) return;
    const batchIds = lastCreatedBatchCards.map((c) => c.id);
    setSelectedCardIds(batchIds);
    setFeedback({
      type: 'success',
      message: `Selezionate tutte le ${batchIds.length} carte del lotto appena creato.`,
    });
  };

  const handleGenerateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);
    setFeedback(null);
    try {
      const res = await cardsApi.createBatch(Number(batchQuantity));
      const createdCards = res.cards || res.data || [];
      setLastCreatedBatchCards(createdCards);
      
      const count = res.created_count || res.count || createdCards.length || Number(batchQuantity);
      setFeedback({
        type: 'success',
        message: `Lotto di ${count} carte generato con successo in stato INVENTORY.`,
      });
      setIsBatchOpen(false);

      // Mostra modale Programmazione lotto NFC con le URL permanenti
      setNfcAssignedBusinessName(null);
      setNfcModalCards(
        createdCards.map((c: any) => ({
          id: c.id,
          token: c.token,
          public_url: c.public_url || (c.token ? `/c/${c.token}` : undefined),
          status: c.status || 'inventory',
        }))
      );
      setNfcError(null);
      setNfcRetryAction(null);
      setIsNfcModalOpen(true);

      await loadCards(1);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Errore durante la generazione del lotto.' });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleOpenAssignModal = () => {
    if (selectedCardIds.length === 0) {
      setFeedback({ type: 'error', message: 'Seleziona almeno una carta in stato INVENTORY da assegnare.' });
      return;
    }
    setIsAssignOpen(true);
  };

  const handleAssignCards = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetBusinessId || selectedCardIds.length === 0) return;
    setIsAssigning(true);
    setFeedback(null);
    try {
      const res = await cardsApi.assign(Number(targetBusinessId), selectedCardIds);
      const assignedCount = res.assigned_count || selectedCardIds.length;
      const targetBiz = businesses.find((b) => b.id === Number(targetBusinessId));
      const bizName = targetBiz?.name || `Commercio #${targetBusinessId}`;
      setFeedback({
        type: 'success',
        message: `${assignedCount} carte assegnate con successo a "${bizName}"!`,
      });
      setIsAssignOpen(false);

      // Dopo l'assegnazione, riaprire la modale con le STESSE URL permanenti e il commercio assegnatario
      if (lastCreatedBatchCards && lastCreatedBatchCards.length > 0) {
        const assignedBatch = lastCreatedBatchCards.filter((c) => selectedCardIds.includes(c.id));
        const cardsToShow = assignedBatch.length > 0 ? assignedBatch : lastCreatedBatchCards;
        setNfcAssignedBusinessName(bizName);
        setNfcModalCards(
          cardsToShow.map((c: any) => ({
            id: c.id,
            token: c.token,
            public_url: c.public_url || (c.token ? `/c/${c.token}` : undefined),
            status: 'issued',
          }))
        );
        setNfcError(null);
        setNfcRetryAction(null);
        setIsNfcModalOpen(true);
      }

      setSelectedCardIds([]);
      // Conserviamo lastCreatedBatchCards per preservare le URL permanenti
      await loadCards(1);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Errore durante l\'assegnazione delle carte.' });
    } finally {
      setIsAssigning(false);
    }
  };

  const handleRevealCard = async (card: Card) => {
    if (card.status === 'revoked' || card.status === 'replaced') return;

    setIsNfcModalOpen(true);
    setIsNfcLoading(true);
    setNfcError(null);
    setNfcAssignedBusinessName(card.business_name || (card.business_id ? `Commercio #${card.business_id}` : null));
    setNfcModalCards([]);

    const fetchLink = async () => {
      setIsNfcLoading(true);
      setNfcError(null);
      try {
        const res = await cardsApi.revealLink(card.id);
        setNfcModalCards([
          {
            id: card.id,
            token: res.token,
            public_url: res.public_url,
            status: card.status,
          },
        ]);
        setNfcRetryAction(null);
      } catch (err: any) {
        const errMsg = err.message || 'Errore durante il recupero del link NFC.';
        setNfcError(errMsg);
        setNfcModalCards([
          {
            id: card.id,
            status: card.status,
            error: errMsg.includes('non recuperabile') || errMsg.includes('legacy') ? 'Link non recuperabile' : errMsg,
          },
        ]);
        setNfcRetryAction(() => () => handleRevealCard(card));
      } finally {
        setIsNfcLoading(false);
      }
    };

    await fetchLink();
  };

  const copyToClipboard = async (text: string, cardId: number | 'all') => {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
      }
      setCopiedCardId(cardId);
      setTimeout(() => setCopiedCardId((prev) => (prev === cardId ? null : prev)), 2500);
      setFeedback({ type: 'success', message: 'URL copiato negli appunti con successo.' });
    } catch {
      setFeedback({ type: 'error', message: 'Impossibile copiare negli appunti. Riprova.' });
    }
  };

  const handleCopyAll = () => {
    if (!nfcModalCards || nfcModalCards.length === 0) return;
    const lines = nfcModalCards
      .filter((c) => c.public_url || c.token)
      .map((c) => {
        const url = getAbsoluteUrl(c.public_url || `/c/${c.token}`);
        return `Carta #${c.id}: ${url}`;
      });
    if (lines.length === 0) return;
    copyToClipboard(lines.join('\n'), 'all');
  };

  const handleDeleteCard = async (cardId: number) => {
    if (!window.confirm(`Sei sicuro di voler eliminare definitivamente la carta #${cardId} dall'inventario? L'azione è consentita solo per carte mai assegnate e prive di storico.`)) {
      return;
    }
    setFeedback(null);
    try {
      await cardsApi.delete(cardId);
      setFeedback({ type: 'success', message: `Carta #${cardId} eliminata definitivamente dall'inventario.` });
      await loadCards(page);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Errore durante l\'eliminazione della carta.' });
    }
  };

  if (isLoading) return <Spinner size="lg" text="Caricamento inventario globale carte..." />;

  const isAllPageSelected =
    pageInventoryCards.length > 0 &&
    pageInventoryCards.every((c) => selectedCardIds.includes(c.id));

  const targetBusiness = businesses.find((b) => b.id === Number(targetBusinessId));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Inventario Globale Carte Fisiche</h1>
          <p className="page-subtitle">Genera stock di carte fisiche neutre e assegna i lotti ai commercianti.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {selectedCardIds.length > 0 && (
            <Button variant="primary" onClick={handleOpenAssignModal}>
              📦 Assegna carte ({selectedCardIds.length})
            </Button>
          )}
          <Button variant="secondary" onClick={() => setIsBatchOpen(true)}>
            ➕ Genera Lotto Carte
          </Button>
        </div>
      </div>

      {feedback && <Alert type={feedback.type} message={feedback.message} onDismiss={() => setFeedback(null)} />}

      {/* Barra Azioni Rapide e Selezione */}
      <div
        className="card"
        style={{
          marginBottom: '1.5rem',
          display: 'flex',
          gap: '1rem',
          alignItems: 'center',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
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

          {pageInventoryCards.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSelectAllPage}
            >
              {isAllPageSelected ? 'Deseleziona pagina' : 'Seleziona tutte (pagina)'}
            </Button>
          )}

          {lastCreatedBatchCards && lastCreatedBatchCards.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}
              onClick={handleSelectCreatedBatch}
            >
              ⚡ Seleziona il lotto appena creato ({lastCreatedBatchCards.length})
            </Button>
          )}
        </div>

        <div>
          {selectedCardIds.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span className="badge badge-primary" style={{ fontSize: '0.9rem', padding: '0.4rem 0.8rem' }}>
                {selectedCardIds.length} {selectedCardIds.length === 1 ? 'carta selezionata' : 'carte selezionate'}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setSelectedCardIds([])}
              >
                Annulla selezione
              </Button>
            </div>
          ) : (
            <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
              Nessuna carta selezionata. Seleziona le carte con i checkbox per assegnarle.
            </span>
          )}
        </div>
      </div>

      <div className="table-responsive">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: '40px', textAlign: 'center' }}>
                <input
                  type="checkbox"
                  aria-label="Seleziona tutte le carte della pagina"
                  checked={isAllPageSelected}
                  onChange={handleSelectAllPage}
                  disabled={pageInventoryCards.length === 0}
                  style={{ width: '1.1rem', height: '1.1rem', cursor: 'pointer' }}
                />
              </th>
              <th>ID Carta</th>
              <th>Stato</th>
              <th>NFC</th>
              <th>Lotto (Batch)</th>
              <th>Commercio Assegnatario</th>
              <th>Conto Fedeltà</th>
              <th>Generata il</th>
              <th>Data Assegnazione</th>
            </tr>
          </thead>
          <tbody>
            {cards.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem' }}>
                  Nessuna carta fisica trovata con il filtro attuale.
                </td>
              </tr>
            ) : (
              cards.map((c) => {
                const isInventory = c.status === 'inventory';
                const isSelected = selectedCardIds.includes(c.id);
                const isRevokedOrReplaced = c.status === 'revoked' || c.status === 'replaced';

                return (
                  <tr
                    key={c.id}
                    style={{
                      background: isSelected ? 'rgba(124, 58, 237, 0.05)' : undefined,
                    }}
                  >
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        aria-label={`Seleziona carta #${c.id}`}
                        checked={isSelected}
                        disabled={!isInventory}
                        onChange={() => handleSelectCard(c.id)}
                        style={{
                          width: '1.1rem',
                          height: '1.1rem',
                          cursor: isInventory ? 'pointer' : 'not-allowed',
                        }}
                      />
                    </td>
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
                    <td>
                      {isRevokedOrReplaced ? (
                        <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>Non programmabile</span>
                      ) : (
                        <div style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center' }}>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRevealCard(c)}
                            style={{ fontSize: '0.78rem', padding: '0.25rem 0.55rem' }}
                          >
                            🔗 Visualizza / Copia URL
                          </Button>
                          {isInventory && (
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => handleDeleteCard(c.id)}
                              style={{ fontSize: '0.78rem', padding: '0.25rem 0.55rem' }}
                              title="Elimina definitivamente la carta dall'inventario"
                            >
                              🗑
                            </Button>
                          )}
                        </div>
                      )}
                    </td>
                    <td>
                      {c.batch_id ? (
                        <code style={{ fontSize: '0.8rem' }}>{c.batch_id.slice(0, 8)}...</code>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{c.business_id ? (c.business_name ? `${c.business_name} (#${c.business_id})` : `Commercio #${c.business_id}`) : 'In magazzino centrale'}</td>
                    <td>{c.loyalty_account_id ? `Conto #${c.loyalty_account_id}` : '—'}</td>
                    <td>{new Date(c.created_at).toLocaleDateString('it-IT')}</td>
                    <td>{c.assigned_at ? new Date(c.assigned_at).toLocaleDateString('it-IT') : '—'}</td>
                  </tr>
                );
              })
            )}
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
            max="500"
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

      {/* Modale Assegna Carte Selezionate a Commercio */}
      <Modal
        isOpen={isAssignOpen}
        title={`Assegna ${selectedCardIds.length} Carte a Commercio`}
        onClose={() => setIsAssignOpen(false)}
      >
        <form onSubmit={handleAssignCards}>
          <p className="page-subtitle" style={{ marginBottom: '1rem' }}>
            Conferma l'assegnazione delle carte selezionate dallo stato <strong>INVENTORY</strong> a <strong>ISSUED</strong>.
          </p>

          <Select
            label="Commercio di Destinazione *"
            options={businesses.map((b) => ({ label: `${b.name} (ID: ${b.id})`, value: b.id }))}
            value={targetBusinessId}
            onChange={(e) => setTargetBusinessId(Number(e.target.value))}
          />

          {/* Riepilogo prima di confermare */}
          <div
            style={{
              background: '#f8fafc',
              padding: '1rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              margin: '1.25rem 0',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Riepilogo Assegnazione:</div>
            <div style={{ fontSize: '0.9rem', marginBottom: '0.25rem' }}>
              • <strong>Destinatario:</strong> {targetBusiness?.name || `Commercio #${targetBusinessId}`}
            </div>
            <div style={{ fontSize: '0.9rem', marginBottom: '0.25rem' }}>
              • <strong>Quantità totale:</strong> {selectedCardIds.length} carte fisiche
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>
              • <strong>ID Carte selezionate:</strong> {selectedCardIds.slice(0, 15).map((id) => `#${id}`).join(', ')}
              {selectedCardIds.length > 15 ? ` e altre ${selectedCardIds.length - 15}...` : ''}
            </div>
          </div>

          <div className="modal-actions">
            <Button type="button" variant="secondary" onClick={() => setIsAssignOpen(false)} disabled={isAssigning}>
              Annulla
            </Button>
            <Button type="submit" variant="primary" isLoading={isAssigning}>
              Conferma Assegnazione
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modale Programmazione lotto NFC */}
      <Modal
        isOpen={isNfcModalOpen}
        title="Programmazione lotto NFC"
        onClose={() => {
          setIsNfcModalOpen(false);
          setIsNfcLoading(false);
          setNfcError(null);
        }}
      >
        <div>
          <p className="page-subtitle" style={{ marginBottom: '0.75rem', fontWeight: 500 }}>
            Programma le carte prima della consegna al commercio.
          </p>

          {nfcAssignedBusinessName && (
            <div
              style={{
                background: 'rgba(124, 58, 237, 0.08)',
                border: '1px solid rgba(124, 58, 237, 0.2)',
                borderRadius: 'var(--radius-md)',
                padding: '0.65rem 0.85rem',
                marginBottom: '1rem',
                fontSize: '0.9rem',
              }}
            >
              🏢 <strong>Commercio assegnatario:</strong> {nfcAssignedBusinessName}
            </div>
          )}

          {isNfcLoading ? (
            <div style={{ padding: '2rem 0', textAlign: 'center' }}>
              <Spinner size="md" text="Recupero link NFC in corso..." />
            </div>
          ) : nfcError && nfcModalCards.length === 0 ? (
            <div style={{ padding: '1rem 0' }}>
              <Alert type="error" message={nfcError} />
              {nfcRetryAction && (
                <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                  <Button variant="primary" onClick={nfcRetryAction}>
                    🔄 Riprova
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <>
              <div
                style={{
                  maxHeight: '360px',
                  overflowY: 'auto',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: '1rem',
                }}
              >
                <table className="data-table" style={{ margin: 0 }}>
                  <thead>
                    <tr>
                      <th style={{ width: '80px' }}>Carta</th>
                      <th>URL Permanente</th>
                      <th style={{ width: '130px', textAlign: 'center' }}>Azione</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nfcModalCards.map((c) => {
                      const hasUrl = Boolean(c.public_url || c.token);
                      const absUrl = hasUrl ? getAbsoluteUrl(c.public_url || `/c/${c.token}`) : '';
                      const isCopied = copiedCardId === c.id;

                      return (
                        <tr key={c.id}>
                          <td>
                            <strong>#{c.id}</strong>
                          </td>
                          <td>
                            {hasUrl ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <input
                                  type="text"
                                  readOnly
                                  value={absUrl}
                                  aria-label={`URL Carta #${c.id}`}
                                  style={{
                                    fontSize: '0.875rem',
                                    fontFamily: 'monospace',
                                    fontWeight: 600,
                                    color: '#1f2937',
                                    WebkitTextFillColor: '#1f2937',
                                    backgroundColor: '#ffffff',
                                    opacity: 1,
                                    padding: '0.45rem 0.65rem',
                                    borderRadius: 'var(--radius-sm)',
                                    border: '1.5px solid #cbd5e1',
                                    width: '100%',
                                    cursor: 'text',
                                    overflowX: 'auto',
                                    whiteSpace: 'nowrap',
                                  }}
                                  onClick={(e) => (e.target as HTMLInputElement).select()}
                                />
                              </div>
                            ) : (
                              <span className="badge badge-warning" style={{ fontSize: '0.8rem' }}>
                                {c.error || 'Link non recuperabile'}
                              </span>
                            )}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {hasUrl ? (
                              <Button
                                variant={isCopied ? 'primary' : 'outline'}
                                size="sm"
                                onClick={() => copyToClipboard(absUrl, c.id)}
                              >
                                {isCopied ? '✓ Copiato' : '📋 Copia URL'}
                              </Button>
                            ) : nfcRetryAction ? (
                              <Button variant="outline" size="sm" onClick={nfcRetryAction}>
                                🔄 Riprova
                              </Button>
                            ) : (
                              <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
                <div>
                  {nfcModalCards.length > 1 && nfcModalCards.some((c) => c.public_url || c.token) && (
                    <Button
                      type="button"
                      variant={copiedCardId === 'all' ? 'primary' : 'secondary'}
                      onClick={handleCopyAll}
                    >
                      {copiedCardId === 'all' ? '✓ Tutte Copiate' : '📑 Copia tutte'}
                    </Button>
                  )}
                </div>
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => {
                    setIsNfcModalOpen(false);
                    setIsNfcLoading(false);
                    setNfcError(null);
                  }}
                >
                  Chiudi
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
};
