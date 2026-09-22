import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { cardsApi, loyaltyApi, customerApi } from '../../api/services';
import type { Card, Customer, LoyaltyAccount } from '../../types';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Modal } from '../../components/common/Modal';
import { Alert } from '../../components/common/Alert';
import { Spinner } from '../../components/common/Spinner';
import { EmptyState } from '../../components/common/EmptyState';
import { NfcProgrammingModal } from '../../components/common/NfcProgrammingModal';

export const CardsPage: React.FC = () => {
  const { activeBusiness, hasPermission } = useAuth();

  const [cards, setCards] = useState<Card[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'warning'; message: string } | null>(null);

  // Modale Attivazione al Banco con Ricerca Cliente
  const [cardToActivate, setCardToActivate] = useState<Card | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [isSearchingCustomers, setIsSearchingCustomers] = useState(false);
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerAccounts, setCustomerAccounts] = useState<LoyaltyAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [activateModalError, setActivateModalError] = useState<string | null>(null);
  const [isActivating, setIsActivating] = useState(false);

  // Modale Sostituzione (per smarrimento)
  const [cardToReplace, setCardToReplace] = useState<Card | null>(null);
  const [newCardIdForReplace, setNewCardIdForReplace] = useState('');
  const [isReplacing, setIsReplacing] = useState(false);

  // Modale Riassegnazione con Ricerca Cliente
  const [cardToReassign, setCardToReassign] = useState<Card | null>(null);
  const [reassignCustomerSearch, setReassignCustomerSearch] = useState('');
  const [isSearchingReassignCustomers, setIsSearchingReassignCustomers] = useState(false);
  const [reassignCustomerResults, setReassignCustomerResults] = useState<Customer[]>([]);
  const [selectedReassignCustomer, setSelectedReassignCustomer] = useState<Customer | null>(null);
  const [reassignCustomerAccounts, setReassignCustomerAccounts] = useState<LoyaltyAccount[]>([]);
  const [selectedReassignAccountId, setSelectedReassignAccountId] = useState<number | null>(null);
  const [reassignModalError, setReassignModalError] = useState<string | null>(null);
  const [isReassigning, setIsReassigning] = useState(false);

  // Modale Programmazione NFC
  const [nfcModalData, setNfcModalData] = useState<{
    token: string;
    cardId: number;
    customerName?: string;
    profileName?: string;
    businessName?: string;
  } | null>(null);

  const canAssign = hasPermission('card.assign');
  const canReassign = hasPermission('card.reassign');
  const canRevoke = hasPermission('card.revoke');

  const loadCards = async () => {
    if (!activeBusiness) {
      setIsLoading(false);
      return;
    }
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

  // Apertura modale di attivazione
  const handleOpenActivate = (card: Card) => {
    setCardToActivate(card);
    setCustomerSearch('');
    setIsSearchingCustomers(false);
    setCustomerResults([]);
    setSelectedCustomer(null);
    setCustomerAccounts([]);
    setSelectedAccountId(null);
    setActivateModalError(null);
  };

  // Ricerca clienti per attivazione
  const handleSearchCustomers = async () => {
    if (!activeBusiness || !customerSearch.trim()) return;
    setIsSearchingCustomers(true);
    setActivateModalError(null);
    try {
      const res = await customerApi.list(activeBusiness.id, {
        search: customerSearch.trim(),
        per_page: 10,
      });
      setCustomerResults(res.data);
      if (res.data.length === 0) {
        setActivateModalError('Nessun cliente trovato con i criteri di ricerca specificati.');
      }
    } catch (err: any) {
      setActivateModalError(err.message || 'Errore durante la ricerca dei clienti.');
    } finally {
      setIsSearchingCustomers(false);
    }
  };

  // Selezione cliente e recupero conti per attivazione
  const handleSelectCustomer = async (c: Customer) => {
    if (!activeBusiness) return;
    setSelectedCustomer(c);
    setSelectedAccountId(null);
    setActivateModalError(null);
    try {
      const accounts = await loyaltyApi.listAccounts(activeBusiness.id, c.id);
      setCustomerAccounts(accounts);
      if (accounts.length === 1) {
        setSelectedAccountId(accounts[0].id);
      } else if (accounts.length === 0) {
        setActivateModalError('Il cliente non possiede alcun conto fedeltà.');
      }
    } catch (err: any) {
      setActivateModalError(err.message || 'Errore durante il recupero dei conti fedeltà.');
    }
  };

  // 1. Invio Attivazione Carta e apertura istruzioni NFC
  const handleActivateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBusiness || !cardToActivate || !selectedAccountId || !selectedCustomer) {
      setActivateModalError('Seleziona un cliente e il relativo conto fedeltà.');
      return;
    }
    setIsActivating(true);
    setActivateModalError(null);
    setFeedback(null);
    try {
      const res = await cardsApi.activate(activeBusiness.id, cardToActivate.id, selectedAccountId);
      const acc = customerAccounts.find((a) => a.id === selectedAccountId);
      const customerFullName = `${selectedCustomer.first_name} ${selectedCustomer.last_name}`;

      setFeedback({
        type: 'success',
        message: `Carta #${cardToActivate.id} attivata e collegata a ${customerFullName} con successo!`,
      });

      const cardId = cardToActivate.id;
      setCardToActivate(null);
      await loadCards();

      if (res.token) {
        setNfcModalData({
          token: res.token,
          cardId,
          customerName: customerFullName,
          profileName: acc?.profile_name || 'Carta Fedeltà',
          businessName: activeBusiness.name,
        });
      }
    } catch (err: any) {
      setActivateModalError(err.message || 'Errore durante l\'attivazione della carta.');
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
        const res = await cardsApi.reactivate(activeBusiness.id, card.id);
        setFeedback({
          type: 'warning',
          message: `Carta #${card.id} riattivata con successo. ATTENZIONE: È richiesta la riprogrammazione fisica del supporto con il nuovo token!`,
        });
        if (res.token) {
          setNfcModalData({
            token: res.token,
            cardId: card.id,
            customerName: card.customer_id ? `Cliente #${card.customer_id}` : undefined,
            profileName: card.profile_name || 'Carta Fedeltà',
            businessName: activeBusiness.name,
          });
        }
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
      const res = await cardsApi.replace(activeBusiness.id, cardToReplace.id, Number(newCardIdForReplace));
      const replacedCardId = Number(newCardIdForReplace);
      setFeedback({
        type: 'success',
        message: `Carta #${cardToReplace.id} sostituita con successo dalla nuova carta #${newCardIdForReplace}. Il conto del cliente e il saldo sono stati conservati.`,
      });
      setCardToReplace(null);
      setNewCardIdForReplace('');
      await loadCards();

      if (res.token) {
        setNfcModalData({
          token: res.token,
          cardId: replacedCardId,
          customerName: res.new_card?.customer_id ? `Cliente #${res.new_card.customer_id}` : undefined,
          profileName: res.new_card?.profile_name || 'Carta Fedeltà',
          businessName: activeBusiness.name,
        });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Errore durante la sostituzione della carta.' });
    } finally {
      setIsReplacing(false);
    }
  };

  // Apertura modale di riassegnazione
  const handleOpenReassign = (card: Card) => {
    setCardToReassign(card);
    setReassignCustomerSearch('');
    setIsSearchingReassignCustomers(false);
    setReassignCustomerResults([]);
    setSelectedReassignCustomer(null);
    setReassignCustomerAccounts([]);
    setSelectedReassignAccountId(null);
    setReassignModalError(null);
  };

  // Ricerca clienti per riassegnazione
  const handleSearchReassignCustomers = async () => {
    if (!activeBusiness || !reassignCustomerSearch.trim()) return;
    setIsSearchingReassignCustomers(true);
    setReassignModalError(null);
    try {
      const res = await customerApi.list(activeBusiness.id, {
        search: reassignCustomerSearch.trim(),
        per_page: 10,
      });
      setReassignCustomerResults(res.data);
      if (res.data.length === 0) {
        setReassignModalError('Nessun cliente trovato con i criteri di ricerca specificati.');
      }
    } catch (err: any) {
      setReassignModalError(err.message || 'Errore durante la ricerca dei clienti.');
    } finally {
      setIsSearchingReassignCustomers(false);
    }
  };

  // Selezione cliente e recupero conti per riassegnazione
  const handleSelectReassignCustomer = async (c: Customer) => {
    if (!activeBusiness) return;
    setSelectedReassignCustomer(c);
    setSelectedReassignAccountId(null);
    setReassignModalError(null);
    try {
      const accounts = await loyaltyApi.listAccounts(activeBusiness.id, c.id);
      setReassignCustomerAccounts(accounts);
      if (accounts.length === 1) {
        setSelectedReassignAccountId(accounts[0].id);
      } else if (accounts.length === 0) {
        setReassignModalError('Il cliente non possiede alcun conto fedeltà.');
      }
    } catch (err: any) {
      setReassignModalError(err.message || 'Errore durante il recupero dei conti fedeltà.');
    }
  };

  // 5. Invio Riassegnazione sicura a nuovo conto
  const handleReassignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBusiness || !cardToReassign || !selectedReassignAccountId || !selectedReassignCustomer) {
      setReassignModalError('Seleziona il nuovo cliente e il relativo conto fedeltà.');
      return;
    }
    setIsReassigning(true);
    setReassignModalError(null);
    setFeedback(null);
    try {
      const res = await cardsApi.reassign(activeBusiness.id, cardToReassign.id, selectedReassignAccountId);
      const acc = reassignCustomerAccounts.find((a) => a.id === selectedReassignAccountId);
      const customerFullName = `${selectedReassignCustomer.first_name} ${selectedReassignCustomer.last_name}`;

      setFeedback({
        type: 'warning',
        message: `Carta #${cardToReassign.id} riassegnata con successo a ${customerFullName}. ATTENZIONE: È richiesta la riprogrammazione fisica del supporto con il nuovo token!`,
      });

      const cardId = cardToReassign.id;
      setCardToReassign(null);
      await loadCards();

      if (res.token) {
        setNfcModalData({
          token: res.token,
          cardId,
          customerName: customerFullName,
          profileName: acc?.profile_name || 'Carta Fedeltà',
          businessName: activeBusiness.name,
        });
      }
    } catch (err: any) {
      setReassignModalError(err.message || 'Errore durante la riassegnazione della carta.');
    } finally {
      setIsReassigning(false);
    }
  };

  // 6. Disassociazione carta fisica da conto cliente
  const handleUnassignCard = async (card: Card) => {
    if (!activeBusiness) return;
    if (!window.confirm(`Sei sicuro di voler disassociare la carta #${card.id} dal conto del cliente? La carta tornerà in stato 'Pronta per attivazione' (issued) nello stesso negozio. Il conto del cliente, il saldo punti, lo storico e il token NFC rimarranno inalterati.`)) {
      return;
    }
    setFeedback(null);
    try {
      await cardsApi.unassign(activeBusiness.id, card.id);
      setFeedback({
        type: 'success',
        message: `Carta #${card.id} disassociata con successo. Il supporto è ora disponibile per una nuova attivazione mantenendo lo stesso token NFC.`,
      });
      await loadCards();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Errore durante la disassociazione della carta.' });
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
                        <Button variant="primary" size="sm" onClick={() => handleOpenActivate(card)}>
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
                        <Button variant="secondary" size="sm" onClick={() => handleOpenReassign(card)}>
                          🔁 Riassegna
                        </Button>
                      )}

                      {(card.status === 'active' || card.status === 'suspended') && card.loyalty_account_id && canAssign && (
                        <Button variant="outline" size="sm" onClick={() => handleUnassignCard(card)}>
                          🔗 Disassocia
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

      {/* Modale Attivazione al Banco con Ricerca Cliente */}
      <Modal isOpen={Boolean(cardToActivate)} title="Attivazione Carta Fisica al Banco" onClose={() => setCardToActivate(null)}>
        {cardToActivate && (
          <form onSubmit={handleActivateSubmit}>
            {activateModalError && (
              <div style={{ marginBottom: '1rem' }}>
                <Alert type="error" message={activateModalError} onDismiss={() => setActivateModalError(null)} />
              </div>
            )}

            <div style={{ background: '#f8fafc', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Supporto Fisico Selezionato</div>
              <strong style={{ fontSize: '1.05rem', color: 'var(--color-primary)' }}>Carta #{cardToActivate.id}</strong>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.2rem' }}>
                Verrà generata la credenziale fisica per la scrittura del chip NFC. Il link viene mostrato una sola volta in cassa, ma la carta può essere utilizzata ripetutamente finché rimane attiva.
              </div>
            </div>

            {/* Ricerca Cliente */}
            {!selectedCustomer ? (
              <div style={{ marginBottom: '1.25rem' }}>
                <label className="form-label" style={{ fontWeight: 600 }}>Cerca cliente (nome, telefono o email) *</label>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <Input
                    placeholder="es. Mario Rossi / 333... / mario@email.it"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSearchCustomers();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="primary"
                    onClick={handleSearchCustomers}
                    disabled={isSearchingCustomers || !customerSearch.trim()}
                    isLoading={isSearchingCustomers}
                    style={{ flexShrink: 0 }}
                  >
                    🔍 Cerca
                  </Button>
                </div>

                {customerResults.length > 0 && (
                  <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', maxHeight: '180px', overflowY: 'auto' }}>
                    {customerResults.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => handleSelectCustomer(c)}
                        style={{
                          padding: '0.6rem 0.8rem',
                          borderBottom: '1px solid var(--color-border)',
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = '#f1f5f9')}
                        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
                      >
                        <div>
                          <strong>{c.first_name} {c.last_name}</strong>
                          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                            {c.phone || c.email || `Cliente #${c.id}`}
                          </div>
                        </div>
                        <Button type="button" variant="outline" size="sm">
                          Seleziona
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ marginBottom: '1.25rem' }}>
                {/* Cliente Selezionato */}
                <div style={{ background: '#f1f5f9', padding: '0.75rem', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                      Cliente Selezionato
                    </div>
                    <strong>{selectedCustomer.first_name} {selectedCustomer.last_name}</strong>
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                      {selectedCustomer.phone || selectedCustomer.email || `ID #${selectedCustomer.id}`}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedCustomer(null);
                      setCustomerAccounts([]);
                      setSelectedAccountId(null);
                    }}
                  >
                    Cambia
                  </Button>
                </div>

                {/* Selezione Conto */}
                <label className="form-label" style={{ fontWeight: 600 }}>Seleziona conto fedeltà a cui abbinare la carta *</label>
                {customerAccounts.length === 0 ? (
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Nessun conto disponibile per questo cliente.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {customerAccounts.map((acc) => (
                      <label
                        key={acc.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.75rem',
                          padding: '0.75rem',
                          borderRadius: 'var(--radius-md)',
                          border: selectedAccountId === acc.id ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                          background: selectedAccountId === acc.id ? '#f5f3ff' : '#ffffff',
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="radio"
                          name="activate_account"
                          value={acc.id}
                          checked={selectedAccountId === acc.id}
                          onChange={() => setSelectedAccountId(acc.id)}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600 }}>
                            Conto #{acc.id} — <span style={{ color: 'var(--color-primary)' }}>{acc.profile_name}</span>
                          </div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                            {acc.balance !== undefined ? `Saldo attuale: ${acc.balance} punti` : 'Profilo a vantaggi esclusivi (senza saldo punti)'}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="modal-actions">
              <Button type="button" variant="secondary" onClick={() => setCardToActivate(null)} disabled={isActivating}>
                Annulla
              </Button>
              <Button
                type="submit"
                variant="primary"
                isLoading={isActivating}
                disabled={!selectedCustomer || !selectedAccountId}
              >
                Attiva e Programma Carta
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

      {/* Modale Riassegnazione con Ricerca Cliente */}
      <Modal isOpen={Boolean(cardToReassign)} title="Riassegnazione Carta Fisica a Nuovo Conto" onClose={() => setCardToReassign(null)}>
        {cardToReassign && (
          <form onSubmit={handleReassignSubmit}>
            {reassignModalError && (
              <div style={{ marginBottom: '1rem' }}>
                <Alert type="error" message={reassignModalError} onDismiss={() => setReassignModalError(null)} />
              </div>
            )}

            <div className="alert alert-warning" style={{ marginBottom: '1rem' }}>
              <strong>⚠️ AVVISO OBBLIGATORIO DI RIPROGRAMMAZIONE:</strong>
              <br />
              La riassegnazione della carta genera un <strong>nuovo token fisico cifrato</strong> e revoca quello precedente. Il supporto fisico (NFC/chip) dovrà essere riscritto prima di poter essere utilizzato dal nuovo cliente.
            </div>

            <div style={{ background: '#f8fafc', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Carta da Riassegnare</div>
              <strong style={{ fontSize: '1.05rem', color: 'var(--color-primary)' }}>Carta #{cardToReassign.id}</strong>
            </div>

            {/* Ricerca Nuovo Cliente */}
            {!selectedReassignCustomer ? (
              <div style={{ marginBottom: '1.25rem' }}>
                <label className="form-label" style={{ fontWeight: 600 }}>Cerca nuovo cliente (nome, telefono o email) *</label>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <Input
                    placeholder="es. Mario Rossi / 333... / mario@email.it"
                    value={reassignCustomerSearch}
                    onChange={(e) => setReassignCustomerSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSearchReassignCustomers();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="primary"
                    onClick={handleSearchReassignCustomers}
                    disabled={isSearchingReassignCustomers || !reassignCustomerSearch.trim()}
                    isLoading={isSearchingReassignCustomers}
                    style={{ flexShrink: 0 }}
                  >
                    🔍 Cerca
                  </Button>
                </div>

                {reassignCustomerResults.length > 0 && (
                  <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', maxHeight: '180px', overflowY: 'auto' }}>
                    {reassignCustomerResults.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => handleSelectReassignCustomer(c)}
                        style={{
                          padding: '0.6rem 0.8rem',
                          borderBottom: '1px solid var(--color-border)',
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = '#f1f5f9')}
                        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
                      >
                        <div>
                          <strong>{c.first_name} {c.last_name}</strong>
                          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                            {c.phone || c.email || `Cliente #${c.id}`}
                          </div>
                        </div>
                        <Button type="button" variant="outline" size="sm">
                          Seleziona
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ marginBottom: '1.25rem' }}>
                {/* Cliente Selezionato */}
                <div style={{ background: '#f1f5f9', padding: '0.75rem', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                      Nuovo Cliente Selezionato
                    </div>
                    <strong>{selectedReassignCustomer.first_name} {selectedReassignCustomer.last_name}</strong>
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                      {selectedReassignCustomer.phone || selectedReassignCustomer.email || `ID #${selectedReassignCustomer.id}`}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedReassignCustomer(null);
                      setReassignCustomerAccounts([]);
                      setSelectedReassignAccountId(null);
                    }}
                  >
                    Cambia
                  </Button>
                </div>

                {/* Selezione Conto */}
                <label className="form-label" style={{ fontWeight: 600 }}>Seleziona conto fedeltà di destinazione *</label>
                {reassignCustomerAccounts.length === 0 ? (
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Nessun conto disponibile per questo cliente.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {reassignCustomerAccounts.map((acc) => (
                      <label
                        key={acc.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.75rem',
                          padding: '0.75rem',
                          borderRadius: 'var(--radius-md)',
                          border: selectedReassignAccountId === acc.id ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                          background: selectedReassignAccountId === acc.id ? '#f5f3ff' : '#ffffff',
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="radio"
                          name="reassign_account"
                          value={acc.id}
                          checked={selectedReassignAccountId === acc.id}
                          onChange={() => setSelectedReassignAccountId(acc.id)}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600 }}>
                            Conto #{acc.id} — <span style={{ color: 'var(--color-primary)' }}>{acc.profile_name}</span>
                          </div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                            {acc.balance !== undefined ? `Saldo attuale: ${acc.balance} punti` : 'Profilo a vantaggi esclusivi (senza saldo punti)'}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="modal-actions">
              <Button type="button" variant="secondary" onClick={() => setCardToReassign(null)} disabled={isReassigning}>
                Annulla
              </Button>
              <Button
                type="submit"
                variant="primary"
                isLoading={isReassigning}
                disabled={!selectedReassignCustomer || !selectedReassignAccountId}
              >
                Riassegna e Riprogramma Carta
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Visualizzazione modale di programmazione NFC */}
      {nfcModalData && (
        <NfcProgrammingModal
          isOpen={Boolean(nfcModalData)}
          onClose={() => setNfcModalData(null)}
          token={nfcModalData.token}
          cardId={nfcModalData.cardId}
          customerName={nfcModalData.customerName}
          profileName={nfcModalData.profileName}
          businessName={nfcModalData.businessName}
        />
      )}
    </div>
  );
};

