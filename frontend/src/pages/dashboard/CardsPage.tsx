import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { cardsApi } from '../../api/services';
import type { Card } from '../../types';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Modal } from '../../components/common/Modal';
import { Alert } from '../../components/common/Alert';
import { Spinner } from '../../components/common/Spinner';
import { EmptyState } from '../../components/common/EmptyState';
import { QrModal } from '../../components/common/QrModal';

export const CardsPage: React.FC = () => {
  const { activeBusiness, hasPermission } = useAuth();

  const [cards, setCards] = useState<Card[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'warning'; message: string } | null>(null);

  // Modale Attivazione
  const [cardToActivate, setCardToActivate] = useState<Card | null>(null);
  const [activateAccountId, setActivateAccountId] = useState('');
  const [isActivating, setIsActivating] = useState(false);

  // Modale Sostituzione (per smarrimento)
  const [cardToReplace, setCardToReplace] = useState<Card | null>(null);
  const [newCardIdForReplace, setNewCardIdForReplace] = useState('');
  const [isReplacing, setIsReplacing] = useState(false);

  // Modale Riassegnazione
  const [cardToReassign, setCardToReassign] = useState<Card | null>(null);
  const [newAccountIdForReassign, setNewAccountIdForReassign] = useState('');
  const [isReassigning, setIsReassigning] = useState(false);
  const [reassignResult, setReassignResult] = useState<{ token: string; cardId: number } | null>(null);

  const canAssign = hasPermission('card.assign');
  const canReassign = hasPermission('card.reassign');
  const canRevoke = hasPermission('card.revoke');

  const loadCards = async () => {
    if (!activeBusiness) return;
    setIsLoading(true);
    try {
      const list = await cardsApi.listBusinessCards(activeBusiness.id);
      setCards(list);
    } catch {
      setCards([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCards();
  }, [activeBusiness]);

  // 1. Attivazione Carta
  const handleActivateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBusiness || !cardToActivate || !activateAccountId) return;
    setIsActivating(true);
    setFeedback(null);
    try {
      await cardsApi.activate(activeBusiness.id, cardToActivate.id, Number(activateAccountId));
      setFeedback({ type: 'success', message: `Carta #${cardToActivate.id} attivata e collegata al conto #${activateAccountId} con successo!` });
      setCardToActivate(null);
      setActivateAccountId('');
      await loadCards();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Errore durante l\'attivazione della carta.' });
    } finally {
      setIsActivating(false);
    }
  };

  // 2. Sospensione / Riattivazione
  const handleToggleSuspend = async (card: Card) => {
    if (!activeBusiness) return;
    setFeedback(null);
    try {
      if (card.status === 'suspended') {
        await cardsApi.reactivate(activeBusiness.id, card.id);
        setFeedback({ type: 'success', message: `Carta #${card.id} riattivata con successo.` });
      } else {
        await cardsApi.suspend(activeBusiness.id, card.id);
        setFeedback({ type: 'success', message: `Carta #${card.id} sospesa temporaneamente.` });
      }
      await loadCards();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Errore durante l\'aggiornamento dello stato della carta.' });
    }
  };

  // 3. Revoca
  const handleRevoke = async (card: Card) => {
    if (!activeBusiness || !window.confirm(`Sei sicuro di voler revocare definitivamente la carta #${card.id}? L'azione è irreversibile.`)) return;
    setFeedback(null);
    try {
      await cardsApi.revoke(activeBusiness.id, card.id);
      setFeedback({ type: 'success', message: `Carta #${card.id} revocata. La credenziale digitale del cliente rimane comunque attiva.` });
      await loadCards();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Errore durante la revoca della carta.' });
    }
  };

  // 4. Sostituzione per smarrimento
  const handleReplaceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBusiness || !cardToReplace || !newCardIdForReplace) return;
    setIsReplacing(true);
    setFeedback(null);
    try {
      await cardsApi.replace(activeBusiness.id, cardToReplace.id, Number(newCardIdForReplace));
      setFeedback({
        type: 'success',
        message: `Carta #${cardToReplace.id} sostituita con successo dalla nuova carta #${newCardIdForReplace}. Il conto del cliente e il saldo sono stati conservati.`,
      });
      setCardToReplace(null);
      setNewCardIdForReplace('');
      await loadCards();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Errore durante la sostituzione della carta.' });
    } finally {
      setIsReplacing(false);
    }
  };

  // 5. Riassegnazione sicura a nuovo conto
  const handleReassignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBusiness || !cardToReassign || !newAccountIdForReassign) return;
    setIsReassigning(true);
    setFeedback(null);
    try {
      const res = await cardsApi.reassign(activeBusiness.id, cardToReassign.id, Number(newAccountIdForReassign));
      setFeedback({
        type: 'warning',
        message: `Carta #${cardToReassign.id} riassegnata con successo al conto #${newAccountIdForReassign}. ATTENZIONE: È richiesta la riprogrammazione fisica del supporto con il nuovo token!`,
      });
      setReassignResult({ token: res.token, cardId: cardToReassign.id });
      setCardToReassign(null);
      setNewAccountIdForReassign('');
      await loadCards();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Errore durante la riassegnazione della carta.' });
    } finally {
      setIsReassigning(false);
    }
  };

  if (isLoading) return <Spinner size="lg" text="Caricamento carte del negozio..." />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Gestione Carte Fisiche</h1>
          <p className="page-subtitle">
            Attiva carte PVC in negozio, gestisci sostituzioni per smarrimento e riassegnazioni sicure.
          </p>
        </div>
      </div>

      {feedback && <Alert type={feedback.type} message={feedback.message} onDismiss={() => setFeedback(null)} />}

      <div className="card" style={{ background: '#f8fafc', marginBottom: '1.5rem', borderLeft: '4px solid var(--color-primary)' }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.25rem' }}>Architettura & Distinzione Concettuale</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
          • <strong>Conto di fedeltà</strong>: entità che custodisce saldo e storico.<br />
          • <strong>Credenziale digitale</strong>: token su smartphone (QR / link).<br />
          • <strong>Carta fisica</strong>: supporto plastico PVC dotato di chip o QR.<br />
          • <strong>Credenziale fisica</strong>: token cifrato memorizzato sulla carta. La revoca della carta fisica NON altera il saldo del cliente né la sua credenziale digitale.
        </p>
      </div>

      {cards.length === 0 ? (
        <EmptyState
          title="Nessuna carta assegnata a questo commercio"
          description="Contatta l'amministratore di sistema (Super Admin) per assegnare un lotto di carte fisiche al tuo punto vendita."
        />
      ) : (
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID Carta</th>
                <th>Stato Supporto</th>
                <th>Conto Fedeltà Collegato</th>
                <th>Assegnata il</th>
                <th>Ultimo Aggiornamento</th>
                <th style={{ textAlign: 'right' }}>Azioni di Banco</th>
              </tr>
            </thead>
            <tbody>
              {cards.map((card) => (
                <tr key={card.id}>
                  <td>
                    <strong>#{card.id}</strong>
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        card.status === 'active'
                          ? 'badge-success'
                          : card.status === 'issued'
                          ? 'badge-primary'
                          : card.status === 'suspended'
                          ? 'badge-warning'
                          : 'badge-danger'
                      }`}
                    >
                      {card.status === 'issued' ? 'Pronta per attivazione' : card.status}
                    </span>
                  </td>
                  <td>
                    {card.loyalty_account_id ? (
                      <strong>Conto #{card.loyalty_account_id}</strong>
                    ) : (
                      <span style={{ color: 'var(--color-text-muted)' }}>Nessun conto associato</span>
                    )}
                  </td>
                  <td>{card.assigned_at ? new Date(card.assigned_at).toLocaleDateString('it-IT') : '—'}</td>
                  <td>{card.issued_at ? new Date(card.issued_at).toLocaleDateString('it-IT') : '—'}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '0.35rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {card.status === 'issued' && canAssign && (
                        <Button variant="primary" size="sm" onClick={() => setCardToActivate(card)}>
                          ⚡ Attiva al Banco
                        </Button>
                      )}

                      {(card.status === 'active' || card.status === 'suspended') && canAssign && (
                        <Button
                          variant={card.status === 'suspended' ? 'outline' : 'secondary'}
                          size="sm"
                          onClick={() => handleToggleSuspend(card)}
                        >
                          {card.status === 'suspended' ? '▶ Riattiva' : '⏸ Sospendi'}
                        </Button>
                      )}

                      {card.status === 'active' && canAssign && (
                        <Button variant="outline" size="sm" onClick={() => setCardToReplace(card)}>
                          🔄 Sostituisci
                        </Button>
                      )}

                      {card.status === 'active' && canReassign && (
                        <Button variant="secondary" size="sm" onClick={() => setCardToReassign(card)}>
                          🔁 Riassegna
                        </Button>
                      )}

                      {(card.status === 'active' || card.status === 'suspended') && canRevoke && (
                        <Button variant="danger" size="sm" onClick={() => handleRevoke(card)}>
                          ✕ Revoca
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modale Attivazione al Banco */}
      <Modal isOpen={Boolean(cardToActivate)} title="Attivazione Carta Fisica" onClose={() => setCardToActivate(null)}>
        {cardToActivate && (
          <form onSubmit={handleActivateSubmit}>
            <p className="page-subtitle" style={{ marginBottom: '1rem' }}>
              Stai per attivare la carta fisica <strong>#{cardToActivate.id}</strong>. Inserisci l'ID del conto fedeltà del cliente a cui abbinarla.
            </p>

            <Input
              label="ID Conto Fedeltà del Cliente *"
              type="number"
              required
              placeholder="es. 15"
              value={activateAccountId}
              onChange={(e) => setActivateAccountId(e.target.value)}
            />

            <div className="modal-actions">
              <Button type="button" variant="secondary" onClick={() => setCardToActivate(null)} disabled={isActivating}>
                Annulla
              </Button>
              <Button type="submit" variant="primary" isLoading={isActivating}>
                Attiva Carta
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modale Sostituzione per Smarrimento */}
      <Modal isOpen={Boolean(cardToReplace)} title="Sostituzione Carta per Smarrimento" onClose={() => setCardToReplace(null)}>
        {cardToReplace && (
          <form onSubmit={handleReplaceSubmit}>
            <p className="page-subtitle" style={{ marginBottom: '1rem' }}>
              La carta precedente <strong>#{cardToReplace.id}</strong> verrà revocata e sostituita con una nuova carta fisica ancora non attivata (in stato "issued"). Il saldo e lo storico del cliente rimarranno intatti.
            </p>

            <Input
              label="ID della Nuova Carta Fisica (deve essere in stato 'issued') *"
              type="number"
              required
              placeholder="es. 24"
              value={newCardIdForReplace}
              onChange={(e) => setNewCardIdForReplace(e.target.value)}
            />

            <div className="modal-actions">
              <Button type="button" variant="secondary" onClick={() => setCardToReplace(null)} disabled={isReplacing}>
                Annulla
              </Button>
              <Button type="submit" variant="primary" isLoading={isReplacing}>
                Conferma Sostituzione
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modale Riassegnazione */}
      <Modal isOpen={Boolean(cardToReassign)} title="Riassegnazione Carta Fisica a Nuovo Conto" onClose={() => setCardToReassign(null)}>
        {cardToReassign && (
          <form onSubmit={handleReassignSubmit}>
            <div className="alert alert-warning" style={{ marginBottom: '1rem' }}>
              <strong>⚠️ AVVISO OBBLIGATORIO DI RIPROGRAMMAZIONE (requires_reprogramming):</strong>
              <br />
              La riassegnazione della carta genera un <strong>nuovo token fisico cifrato</strong>. Il supporto fisico (NFC/chip) dovrà essere riscritto prima di poter essere utilizzato dal nuovo cliente.
            </div>

            <Input
              label="ID del Nuovo Conto Fedeltà *"
              type="number"
              required
              placeholder="es. 32"
              value={newAccountIdForReassign}
              onChange={(e) => setNewAccountIdForReassign(e.target.value)}
            />

            <div className="modal-actions">
              <Button type="button" variant="secondary" onClick={() => setCardToReassign(null)} disabled={isReassigning}>
                Annulla
              </Button>
              <Button type="submit" variant="primary" isLoading={isReassigning}>
                Riassegna Carta
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Visualizzazione nuovo QR/Token dopo Riassegnazione */}
      {reassignResult && (
        <QrModal
          isOpen={Boolean(reassignResult)}
          onClose={() => setReassignResult(null)}
          token={reassignResult.token}
          profileName={`Carta #${reassignResult.cardId} (Riprogrammazione richiesta)`}
        />
      )}
    </div>
  );
};
