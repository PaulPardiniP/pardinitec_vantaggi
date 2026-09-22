import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { offersApi, customerApi, loyaltyApi } from '../../api/services';
import type { Offer, Customer, LoyaltyAccount } from '../../types';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Select } from '../../components/common/Select';
import { Modal } from '../../components/common/Modal';
import { Alert } from '../../components/common/Alert';
import { Spinner } from '../../components/common/Spinner';
import { EmptyState } from '../../components/common/EmptyState';
import { generateOperationId } from '../../api/client';
import { formatOfferBenefit } from '../../utils/formatters';

export const VantaggiPage: React.FC = () => {
  const { activeBusiness, hasPermission, hasModule } = useAuth();

  const [offers, setOffers] = useState<Offer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [viewTab, setViewTab] = useState<'catalog' | 'archived'>('catalog');
  const [archivedOffers, setArchivedOffers] = useState<Offer[]>([]);
  const [isLoadingArchived, setIsLoadingArchived] = useState(false);

  // Modale Crea / Modifica Vantaggio
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState<Offer | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed' | 'text'>('percentage');
  const [discountValueStr, setDiscountValueStr] = useState('10');
  const [shareWithVip, setShareWithVip] = useState(false);
  const [isSingleUse, setIsSingleUse] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modale Elimina Vantaggio
  const [offerToDelete, setOfferToDelete] = useState<Offer | null>(null);

  // Modale Riscatto Vantaggio in Cassa
  const [offerToRedeem, setOfferToRedeem] = useState<Offer | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [isSearchingCustomers, setIsSearchingCustomers] = useState(false);
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerAccounts, setCustomerAccounts] = useState<LoyaltyAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [redeemModalError, setRedeemModalError] = useState<string | null>(null);

  const canManage = hasPermission('offer.manage');
  const canRedeem = hasPermission('offer.redeem');
  const hasVipModule = hasModule('vip_offers');

  const loadOffers = async () => {
    if (!activeBusiness) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const list = await offersApi.list(activeBusiness.id, true);
      const vantaggiList = list.filter((o) => {
        const aud = o.target_audience;
        return aud === 'vantaggi' || aud === 'vantaggi_vip' || (aud !== 'vip' && !o.is_vip);
      });
      setOffers(vantaggiList);
    } catch {
      setOffers([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadArchived = async () => {
    if (!activeBusiness) return;
    setIsLoadingArchived(true);
    try {
      const list = await offersApi.list(activeBusiness.id, false, undefined, 'archived');
      const vantaggiList = list.filter((o) => {
        const aud = o.target_audience;
        return aud === 'vantaggi' || aud === 'vantaggi_vip' || (aud !== 'vip' && !o.is_vip);
      });
      setArchivedOffers(vantaggiList);
    } catch {
      setArchivedOffers([]);
    } finally {
      setIsLoadingArchived(false);
    }
  };

  useEffect(() => {
    loadOffers();
    loadArchived();
  }, [activeBusiness]);

  const handleToggleStatus = async (o: Offer) => {
    if (!activeBusiness) return;
    const newStatus = o.status === 'active' ? 'inactive' : 'active';
    try {
      await offersApi.update(activeBusiness.id, o.id, { status: newStatus });
      setFeedback({
        type: 'success',
        message: newStatus === 'active' ? `Vantaggio "${o.title}" attivato con successo.` : `Vantaggio "${o.title}" disattivato.`,
      });
      await loadOffers();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Errore durante la modifica dello stato.' });
    }
  };

  const handleRestoreOffer = async (o: Offer) => {
    if (!activeBusiness) return;
    try {
      await offersApi.restore(activeBusiness.id, o.id);
      setFeedback({ type: 'success', message: `Vantaggio "${o.title}" ripristinato con successo nel catalogo attivo!` });
      await loadOffers();
      await loadArchived();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Errore durante il ripristino del vantaggio.' });
    }
  };

  const handleOpenCreate = () => {
    setEditingOffer(null);
    setTitle('');
    setDescription('');
    setDiscountType('percentage');
    setDiscountValueStr('10');
    setShareWithVip(false);
    setIsSingleUse(true);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (o: Offer) => {
    setEditingOffer(o);
    setTitle(o.title);
    setDescription(o.description || '');
    if (o.discount_type === 'text' || o.discount_percentage === null) {
      setDiscountType('text');
      setDiscountValueStr('');
    } else {
      const isFixed = o.discount_type === 'fixed' || o.offer_type === 'discount';
      setDiscountType(isFixed ? 'fixed' : 'percentage');
      const val = o.discount_value ?? o.discount_percentage ?? 10;
      setDiscountValueStr(val.toString());
    }
    setShareWithVip(o.target_audience === 'vantaggi_vip');
    setIsSingleUse(o.is_single_use);
    setIsFormOpen(true);
  };

  const handleSaveOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBusiness) return;

    let parsedVal: number | null = null;
    if (discountType !== 'text') {
      parsedVal = parseFloat(discountValueStr.replace(',', '.'));
      if (isNaN(parsedVal) || parsedVal <= 0) {
        setFeedback({ type: 'error', message: 'Inserisci un valore di sconto valido maggiore di zero.' });
        return;
      }
      if (discountType === 'percentage' && parsedVal > 100) {
        setFeedback({ type: 'error', message: 'La percentuale di sconto non può superare il 100%.' });
        return;
      }
    }

    setIsSubmitting(true);
    setFeedback(null);
    try {
      const targetAudience = shareWithVip && hasVipModule ? 'vantaggi_vip' : 'vantaggi';
      const payload: Partial<Offer> = {
        title: title.trim(),
        description: description.trim() || null,
        discount_type: discountType,
        discount_value: parsedVal,
        target_audience: targetAudience,
        is_single_use: isSingleUse,
      };

      if (editingOffer) {
        await offersApi.update(activeBusiness.id, editingOffer.id, payload);
        setFeedback({ type: 'success', message: 'Vantaggio aggiornato con successo.' });
      } else {
        await offersApi.create(activeBusiness.id, payload);
        setFeedback({ type: 'success', message: 'Nuovo vantaggio creato con successo!' });
      }

      setIsFormOpen(false);
      await loadOffers();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Errore durante il salvataggio del vantaggio.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteOffer = async () => {
    if (!activeBusiness || !offerToDelete) return;
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await offersApi.delete(activeBusiness.id, offerToDelete.id);
      setFeedback({
        type: 'success',
        message: res.action === 'deleted'
          ? 'Vantaggio eliminato definitivamente.'
          : 'Vantaggio archiviato nei contenuti storici poiché contiene utilizzi registrati.',
      });
      setOfferToDelete(null);
      await loadOffers();
      await loadArchived();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Errore durante l\'eliminazione.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Riscatto in Cassa
  const handleOpenRedeem = (o: Offer) => {
    setOfferToRedeem(o);
    setCustomerSearch('');
    setIsSearchingCustomers(false);
    setCustomerResults([]);
    setSelectedCustomer(null);
    setCustomerAccounts([]);
    setSelectedAccountId(null);
    setRedeemModalError(null);
  };

  const handleSearchCustomers = async () => {
    if (!activeBusiness || !customerSearch.trim()) return;
    setIsSearchingCustomers(true);
    setRedeemModalError(null);
    try {
      const res = await customerApi.list(activeBusiness.id, {
        search: customerSearch.trim(),
        per_page: 10,
      });
      setCustomerResults(res.data);
      if (res.data.length === 0) {
        setRedeemModalError('Nessun cliente trovato con i criteri specificati.');
      }
    } catch (err: any) {
      setRedeemModalError(err.message || 'Errore durante la ricerca dei clienti.');
    } finally {
      setIsSearchingCustomers(false);
    }
  };

  const handleSelectCustomer = async (c: Customer) => {
    if (!activeBusiness) return;
    setSelectedCustomer(c);
    setSelectedAccountId(null);
    setRedeemModalError(null);
    try {
      const accounts = await loyaltyApi.listAccounts(activeBusiness.id, c.id);
      // Filtra conti compatibili (Vantaggi, oppure VIP se l'offerta è condivisa)
      const valid = accounts.filter((a) => {
        if (a.profile_code === 'vantaggi') return true;
        if (offerToRedeem?.target_audience === 'vantaggi_vip' && a.profile_code === 'vip') return true;
        return false;
      });
      setCustomerAccounts(valid);
      if (valid.length === 1) {
        setSelectedAccountId(valid[0].id);
      } else if (valid.length === 0) {
        setRedeemModalError('Questo cliente non ha un profilo Vantaggi attivo per usufruire di questa promozione.');
      }
    } catch (err: any) {
      setRedeemModalError(err.message || 'Errore nel recupero dei conti fedeltà.');
    }
  };

  const handleRedeemOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBusiness || !offerToRedeem || !selectedAccountId) return;
    setIsRedeeming(true);
    setRedeemModalError(null);
    setFeedback(null);
    try {
      await offersApi.redeem(
        activeBusiness.id,
        selectedAccountId,
        offerToRedeem.id,
        generateOperationId()
      );
      setFeedback({
        type: 'success',
        message: `Vantaggio "${offerToRedeem.title}" applicato con successo per il cliente!`,
      });
      setOfferToRedeem(null);
      setSelectedCustomer(null);
      setSelectedAccountId(null);
      await loadOffers();
    } catch (err: any) {
      setRedeemModalError(err.message || 'Errore durante l\'applicazione del vantaggio.');
    } finally {
      setIsRedeeming(false);
    }
  };

  if (isLoading) return <Spinner size="lg" text="Caricamento vantaggi e promozioni..." />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Vantaggi e promozioni</h1>
          <p className="page-subtitle">Crea sconti, promozioni e benefici riservati ai clienti Vantaggi.</p>
        </div>
        {canManage && (
          <Button variant="primary" onClick={handleOpenCreate}>
            ➕ Nuovo vantaggio
          </Button>
        )}
      </div>

      {feedback && (
        <div style={{ marginBottom: '1.25rem' }}>
          <Alert type={feedback.type} message={feedback.message} onDismiss={() => setFeedback(null)} />
        </div>
      )}

      {/* Tabs Viste: Catalogo vs Archiviati */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>
        <button
          type="button"
          className={`btn btn-sm ${viewTab === 'catalog' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setViewTab('catalog')}
        >
          🏆 Vantaggi in corso ({offers.length})
        </button>
        <button
          type="button"
          className={`btn btn-sm ${viewTab === 'archived' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => {
            setViewTab('archived');
            loadArchived();
          }}
        >
          📦 Contenuti archiviati ({archivedOffers.length})
        </button>
      </div>

      {viewTab === 'catalog' ? (
        offers.length === 0 ? (
          <EmptyState
            title="Nessun vantaggio attivo"
            description="Crea il primo vantaggio promozionale o sconto per i tuoi clienti Vantaggi."
          />
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Vantaggio</th>
                  <th>Valore</th>
                  <th>Destinatari</th>
                  <th>Utilizzo</th>
                  <th>Stato</th>
                  <th style={{ textAlign: 'right' }}>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {offers.map((o) => {
                  const benefitText = o.discount_type === 'text'
                    ? 'Promozione speciale'
                    : formatOfferBenefit(
                        o.discount_type === 'fixed' || o.offer_type === 'discount' ? 'fixed' : 'percentage',
                        o.discount_value ?? o.discount_percentage ?? 0
                      );
                  const isShared = o.target_audience === 'vantaggi_vip';

                  return (
                    <tr key={o.id}>
                      <td>#{o.id}</td>
                      <td>
                        <strong>{o.title}</strong>
                        {o.description && <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{o.description}</div>}
                      </td>
                      <td>
                        <span className="badge badge-success">{benefitText}</span>
                      </td>
                      <td>
                        {isShared ? (
                          <span className="badge badge-secondary" title="Visibile anche ai clienti VIP">Vantaggi & VIP</span>
                        ) : (
                          <span className="badge badge-primary">Solo Vantaggi</span>
                        )}
                      </td>
                      <td>
                        <span style={{ fontSize: '0.85rem' }}>{o.is_single_use ? 'Monouso' : 'Illimitato'}</span>
                      </td>
                      <td>
                        <span className={`badge ${o.status === 'active' ? 'badge-success' : 'badge-warning'}`}>
                          {o.status === 'active' ? 'Attivo' : 'Inattivo'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          {canRedeem && o.status === 'active' && (
                            <Button variant="secondary" size="sm" onClick={() => handleOpenRedeem(o)}>
                              🏷️ Applica
                            </Button>
                          )}
                          {canManage && (
                            <>
                              <Button variant="outline" size="sm" onClick={() => handleToggleStatus(o)}>
                                {o.status === 'active' ? 'Disattiva' : 'Attiva'}
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => handleOpenEdit(o)}>
                                Modifica
                              </Button>
                              <Button variant="danger" size="sm" onClick={() => setOfferToDelete(o)}>
                                Elimina
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : (
        isLoadingArchived ? (
          <Spinner size="md" text="Caricamento archivio vantaggi..." />
        ) : archivedOffers.length === 0 ? (
          <EmptyState
            title="Nessun contenuto archiviato"
            description="I vantaggi eliminati che contengono storico di utilizzi vengono archiviati qui per consultazione."
          />
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Vantaggio</th>
                  <th>Valore</th>
                  <th>Destinatari</th>
                  <th>Utilizzo</th>
                  <th>Stato</th>
                  <th style={{ textAlign: 'right' }}>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {archivedOffers.map((o) => {
                  const benefitText = o.discount_type === 'text'
                    ? 'Promozione speciale'
                    : formatOfferBenefit(
                        o.discount_type === 'fixed' || o.offer_type === 'discount' ? 'fixed' : 'percentage',
                        o.discount_value ?? o.discount_percentage ?? 0
                      );

                  return (
                    <tr key={o.id}>
                      <td>#{o.id}</td>
                      <td>
                        <strong>{o.title}</strong>
                        {o.description && <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{o.description}</div>}
                      </td>
                      <td>
                        <span className="badge badge-success">{benefitText}</span>
                      </td>
                      <td>
                        <span className="badge badge-primary">Vantaggi</span>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.85rem' }}>{o.is_single_use ? 'Monouso' : 'Illimitato'}</span>
                      </td>
                      <td>
                        <span className="badge badge-secondary">Archiviato</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {canManage && (
                          <Button variant="secondary" size="sm" onClick={() => handleRestoreOffer(o)}>
                            🔄 Ripristina
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Modale Crea / Modifica */}
      <Modal isOpen={isFormOpen} title={editingOffer ? 'Modifica Vantaggio' : 'Nuovo Vantaggio'} onClose={() => setIsFormOpen(false)}>
        <form onSubmit={handleSaveOffer}>
          <Input
            label="Titolo Vantaggio *"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="es. Sconto 10% Spesa o Degustazione Omaggio"
          />

          <div className="form-group">
            <label className="form-label">Descrizione (opzionale)</label>
            <textarea
              className="form-control"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Dettagli e condizioni del vantaggio..."
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: discountType === 'text' ? '1fr' : '1fr 1fr', gap: '1rem' }}>
            <Select
              label="Tipo di Beneficio *"
              value={discountType}
              onChange={(e) => setDiscountType(e.target.value as 'percentage' | 'fixed' | 'text')}
              options={[
                { label: 'Sconto percentuale (%)', value: 'percentage' },
                { label: 'Sconto fisso (€)', value: 'fixed' },
                { label: 'Vantaggio libero / promozione testuale', value: 'text' },
              ]}
            />

            {discountType !== 'text' && (
              <Input
                label={discountType === 'percentage' ? 'Percentuale Sconto (%) *' : 'Importo Sconto (€) *'}
                type="number"
                step="0.01"
                min="0.01"
                max={discountType === 'percentage' ? '100' : undefined}
                required
                value={discountValueStr}
                onChange={(e) => setDiscountValueStr(e.target.value)}
              />
            )}
          </div>

          {/* Condivisione con VIP: solo se il negozio ha VIP attivo */}
          {hasVipModule && (
            <div className="form-group" style={{ marginTop: '0.75rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                <input
                  type="checkbox"
                  checked={shareWithVip}
                  onChange={(e) => setShareWithVip(e.target.checked)}
                />
                <span>Mostra questo vantaggio anche ai clienti VIP</span>
              </label>
            </div>
          )}

          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem' }}>
              <input
                type="checkbox"
                checked={isSingleUse}
                onChange={(e) => setIsSingleUse(e.target.checked)}
              />
              <span>Promozione monouso (un solo utilizzo per cliente)</span>
            </label>
          </div>

          <div className="modal-actions">
            <Button type="button" variant="secondary" onClick={() => setIsFormOpen(false)} disabled={isSubmitting}>
              Annulla
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmitting}>
              {editingOffer ? 'Salva Modifiche' : 'Crea Vantaggio'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modale Elimina */}
      <Modal isOpen={Boolean(offerToDelete)} title="Elimina Vantaggio" onClose={() => setOfferToDelete(null)}>
        <p>Sei sicuro di voler disattivare il vantaggio <strong>{offerToDelete?.title}</strong>?</p>
        <div className="modal-actions">
          <Button variant="secondary" onClick={() => setOfferToDelete(null)} disabled={isSubmitting}>
            Annulla
          </Button>
          <Button variant="danger" onClick={handleDeleteOffer} isLoading={isSubmitting}>
            Conferma Eliminazione
          </Button>
        </div>
      </Modal>

      {/* Modale Riscatto Operativo */}
      <Modal isOpen={Boolean(offerToRedeem)} title="Applica Vantaggio al Cliente" onClose={() => setOfferToRedeem(null)}>
        {offerToRedeem && (
          <form onSubmit={handleRedeemOffer}>
            {redeemModalError && (
              <div style={{ marginBottom: '1rem' }}>
                <Alert type="error" message={redeemModalError} onDismiss={() => setRedeemModalError(null)} />
              </div>
            )}

            <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: 'var(--radius-md)', marginBottom: '1rem' }}>
              <strong>{offerToRedeem.title}</strong>
              <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                {formatOfferBenefit(
                  offerToRedeem.discount_type === 'fixed' || offerToRedeem.offer_type === 'discount' ? 'fixed' : 'percentage',
                  offerToRedeem.discount_value ?? offerToRedeem.discount_percentage ?? 0
                )}
              </div>
            </div>

            {!selectedCustomer ? (
              <div>
                <label className="form-label">Cerca cliente (nome, telefono, email o ID):</label>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <Input
                    placeholder="es. Mario Rossi, 340..., 925"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    style={{ margin: 0 }}
                  />
                  <Button type="button" variant="secondary" onClick={handleSearchCustomers} isLoading={isSearchingCustomers}>
                    Cerca
                  </Button>
                </div>

                {customerResults.length > 0 && (
                  <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                    {customerResults.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => handleSelectCustomer(c)}
                        style={{
                          padding: '0.5rem 0.75rem',
                          borderBottom: '1px solid var(--color-border)',
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div>
                          <strong>{c.first_name} {c.last_name}</strong>
                          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginLeft: '0.5rem' }}>ID #{c.id}</span>
                        </div>
                        <span style={{ fontSize: '0.8rem', color: 'var(--color-primary)' }}>Seleziona →</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div style={{ padding: '0.75rem', background: '#f0fdf4', borderRadius: 'var(--radius-md)', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong>{selectedCustomer.first_name} {selectedCustomer.last_name}</strong>
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>ID Cliente: #{selectedCustomer.id}</div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setSelectedCustomer(null)}>
                    Cambia
                  </Button>
                </div>

                {customerAccounts.length > 1 && (
                  <Select
                    label="Seleziona Conto Destinatario *"
                    required
                    value={selectedAccountId || ''}
                    onChange={(e) => setSelectedAccountId(Number(e.target.value))}
                    options={customerAccounts.map((a) => ({
                      label: `${a.profile_name || a.profile_code} (Conto #${a.id})`,
                      value: a.id,
                    }))}
                  />
                )}
              </div>
            )}

            <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
              <Button type="button" variant="secondary" onClick={() => setOfferToRedeem(null)} disabled={isRedeeming}>
                Annulla
              </Button>
              <Button type="submit" variant="primary" isLoading={isRedeeming} disabled={!selectedAccountId}>
                Conferma Applicazione
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
