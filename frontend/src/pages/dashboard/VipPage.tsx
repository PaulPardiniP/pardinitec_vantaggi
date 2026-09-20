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
import { generateOperationId } from '../../api/client';
import { formatOfferBenefit } from '../../utils/formatters';

export const VipPage: React.FC = () => {
  const { activeBusiness, hasPermission } = useAuth();

  const [exclusiveOffers, setExclusiveOffers] = useState<Offer[]>([]);
  const [sharedOffers, setSharedOffers] = useState<Offer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [viewTab, setViewTab] = useState<'catalog' | 'archived'>('catalog');
  const [archivedOffers, setArchivedOffers] = useState<Offer[]>([]);
  const [isLoadingArchived, setIsLoadingArchived] = useState(false);

  // Modale Crea / Modifica Beneficio VIP
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState<Offer | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountValueStr, setDiscountValueStr] = useState('15');
  const [isSingleUse, setIsSingleUse] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modale Elimina Beneficio
  const [offerToDelete, setOfferToDelete] = useState<Offer | null>(null);

  // Modale Riscatto Beneficio VIP in Cassa
  const [offerToRedeem, setOfferToRedeem] = useState<Offer | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [isSearchingCustomers, setIsSearchingCustomers] = useState(false);
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [vipAccount, setVipAccount] = useState<LoyaltyAccount | null>(null);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [redeemModalError, setRedeemModalError] = useState<string | null>(null);

  const canManage = hasPermission('offer.manage');
  const canRedeem = hasPermission('offer.redeem');

  const loadVipOffers = async () => {
    if (!activeBusiness) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const list = await offersApi.list(activeBusiness.id, true);
      const exclusive = list.filter((o) => o.target_audience === 'vip' || o.is_vip);
      const shared = list.filter((o) => o.target_audience === 'vantaggi_vip');
      setExclusiveOffers(exclusive);
      setSharedOffers(shared);
    } catch {
      setExclusiveOffers([]);
      setSharedOffers([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadArchived = async () => {
    if (!activeBusiness) return;
    setIsLoadingArchived(true);
    try {
      const list = await offersApi.list(activeBusiness.id, false, undefined, 'archived');
      const vipList = list.filter((o) => o.target_audience === 'vip' || o.is_vip);
      setArchivedOffers(vipList);
    } catch {
      setArchivedOffers([]);
    } finally {
      setIsLoadingArchived(false);
    }
  };

  useEffect(() => {
    loadVipOffers();
    loadArchived();
  }, [activeBusiness]);

  const handleToggleStatus = async (o: Offer) => {
    if (!activeBusiness) return;
    const newStatus = o.status === 'active' ? 'inactive' : 'active';
    try {
      await offersApi.update(activeBusiness.id, o.id, { status: newStatus });
      setFeedback({
        type: 'success',
        message: newStatus === 'active' ? `Beneficio "${o.title}" attivato con successo.` : `Beneficio "${o.title}" disattivato.`,
      });
      await loadVipOffers();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Errore durante la modifica dello stato.' });
    }
  };

  const handleRestoreOffer = async (o: Offer) => {
    if (!activeBusiness) return;
    try {
      await offersApi.restore(activeBusiness.id, o.id);
      setFeedback({ type: 'success', message: `Beneficio VIP "${o.title}" ripristinato con successo!` });
      await loadVipOffers();
      await loadArchived();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Errore durante il ripristino del beneficio VIP.' });
    }
  };

  const handleOpenCreate = () => {
    setEditingOffer(null);
    setTitle('');
    setDescription('');
    setDiscountType('percentage');
    setDiscountValueStr('15');
    setIsSingleUse(true);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (o: Offer) => {
    setEditingOffer(o);
    setTitle(o.title);
    setDescription(o.description || '');
    const isFixed = o.discount_type === 'fixed' || o.offer_type === 'discount';
    setDiscountType(isFixed ? 'fixed' : 'percentage');
    const val = o.discount_value ?? o.discount_percentage ?? 15;
    setDiscountValueStr(val.toString());
    setIsSingleUse(o.is_single_use);
    setIsFormOpen(true);
  };

  const handleSaveVipBenefit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBusiness) return;

    const parsedVal = parseFloat(discountValueStr.replace(',', '.'));
    if (isNaN(parsedVal) || parsedVal <= 0) {
      setFeedback({ type: 'error', message: 'Inserisci un valore di beneficio valido maggiore di zero.' });
      return;
    }
    if (discountType === 'percentage' && parsedVal > 100) {
      setFeedback({ type: 'error', message: 'La percentuale non può superare il 100%.' });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);
    try {
      const payload: Partial<Offer> = {
        title: title.trim(),
        description: description.trim() || null,
        discount_type: discountType,
        discount_value: parsedVal,
        target_audience: 'vip', // Destinatari forzati a VIP
        is_single_use: isSingleUse,
      };

      if (editingOffer) {
        await offersApi.update(activeBusiness.id, editingOffer.id, payload);
        setFeedback({ type: 'success', message: 'Beneficio VIP aggiornato con successo.' });
      } else {
        await offersApi.create(activeBusiness.id, payload);
        setFeedback({ type: 'success', message: 'Nuovo beneficio VIP creato con successo!' });
      }

      setIsFormOpen(false);
      await loadVipOffers();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Errore durante il salvataggio del beneficio VIP.' });
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
          ? 'Beneficio VIP eliminato definitivamente.'
          : 'Beneficio VIP archiviato nei contenuti storici poiché contiene utilizzi registrati.',
      });
      setOfferToDelete(null);
      await loadVipOffers();
      await loadArchived();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Errore durante l\'eliminazione.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Riscatto Beneficio VIP
  const handleOpenRedeem = (o: Offer) => {
    setOfferToRedeem(o);
    setCustomerSearch('');
    setIsSearchingCustomers(false);
    setCustomerResults([]);
    setSelectedCustomer(null);
    setVipAccount(null);
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
    setVipAccount(null);
    setRedeemModalError(null);
    try {
      const accounts = await loyaltyApi.listAccounts(activeBusiness.id, c.id);
      const vipAcc = accounts.find((a) => a.profile_code === 'vip');
      if (vipAcc) {
        setVipAccount(vipAcc);
      } else {
        setRedeemModalError('Questo cliente non possiede un profilo VIP attivo per accedere a questo beneficio.');
      }
    } catch (err: any) {
      setRedeemModalError(err.message || 'Errore durante la verifica del profilo VIP.');
    }
  };

  const handleRedeemVipOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBusiness || !offerToRedeem || !vipAccount) return;
    setIsRedeeming(true);
    setRedeemModalError(null);
    setFeedback(null);
    try {
      await offersApi.redeem(
        activeBusiness.id,
        vipAccount.id,
        offerToRedeem.id,
        generateOperationId()
      );
      setFeedback({
        type: 'success',
        message: `Beneficio VIP "${offerToRedeem.title}" applicato con successo per ${selectedCustomer?.first_name}!`,
      });
      setOfferToRedeem(null);
      setSelectedCustomer(null);
      setVipAccount(null);
      await loadVipOffers();
    } catch (err: any) {
      setRedeemModalError(err.message || 'Errore durante l\'applicazione del beneficio.');
    } finally {
      setIsRedeeming(false);
    }
  };

  if (isLoading) return <Spinner size="lg" text="Caricamento benefici esclusivi VIP..." />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Benefici esclusivi VIP</h1>
          <p className="page-subtitle">Crea offerte, premi e vantaggi riservati esclusivamente ai clienti VIP.</p>
        </div>
        {canManage && (
          <Button variant="primary" onClick={handleOpenCreate} style={{ background: 'var(--color-vip, #d97706)', borderColor: 'var(--color-vip, #d97706)' }}>
            👑 + Nuovo beneficio VIP
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
          👑 Benefici VIP ({exclusiveOffers.length})
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
        <>
          {/* Sezione Benefici Esclusivi VIP */}
          <div className="card" style={{ marginBottom: '2rem', borderLeft: '4px solid var(--color-vip, #d97706)' }}>
            <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>👑</span> Benefici Riservati Esclusivamente ai VIP
            </h2>
            <p className="page-subtitle" style={{ marginBottom: '1rem' }}>
              Offerte e condizioni speciali accessibili esclusivamente dai titolari di tessera VIP.
            </p>

            {exclusiveOffers.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--color-text-muted)', background: '#fafafa', borderRadius: 'var(--radius-md)' }}>
                Nessun beneficio esclusivo VIP configurato al momento.
              </div>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Beneficio VIP</th>
                      <th>Valore</th>
                      <th>Utilizzo</th>
                      <th>Stato</th>
                      <th style={{ textAlign: 'right' }}>Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exclusiveOffers.map((o) => {
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
                                  👑 Applica
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
            )}
          </div>
        </>
      ) : (
        <div className="card" style={{ marginBottom: '2rem' }}>
          <h2 className="card-title">Contenuti Archiviati (VIP)</h2>
          {isLoadingArchived ? (
            <Spinner size="md" text="Caricamento archivio VIP..." />
          ) : archivedOffers.length === 0 ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
              Nessun beneficio VIP archiviato.
            </div>
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Beneficio VIP</th>
                    <th>Valore</th>
                    <th>Destinatari</th>
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
                          <span className="badge badge-primary">VIP</span>
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
          )}
        </div>
      )}

      {/* Sezione Benefici Condivisi con Vantaggi */}
      {sharedOffers.length > 0 && (
        <div className="card">
          <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>🏷️</span> Promozioni Condivise (Vantaggi & VIP)
          </h2>
          <p className="page-subtitle" style={{ marginBottom: '1rem' }}>
            Promozioni configurate nella sezione Vantaggi e rese accessibili anche ai clienti VIP.
          </p>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Titolo Promozione</th>
                  <th>Valore</th>
                  <th>Destinatari</th>
                  <th>Stato</th>
                  <th style={{ textAlign: 'right' }}>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {sharedOffers.map((o) => {
                  const benefitText = formatOfferBenefit(
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
                        <span className="badge badge-secondary">Condiviso con Vantaggi</span>
                      </td>
                      <td>
                        <span className={`badge ${o.status === 'active' ? 'badge-success' : 'badge-warning'}`}>
                          {o.status}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {canRedeem && (
                          <Button variant="secondary" size="sm" onClick={() => handleOpenRedeem(o)}>
                            🏷️ Applica a VIP
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modale Crea / Modifica Beneficio VIP */}
      <Modal isOpen={isFormOpen} title={editingOffer ? 'Modifica Beneficio VIP' : 'Nuovo Beneficio VIP'} onClose={() => setIsFormOpen(false)}>
        <form onSubmit={handleSaveVipBenefit}>
          <Input
            label="Titolo Beneficio VIP *"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="es. Bottiglia Riserva Omaggio o Sconto VIP 20%"
          />

          <div className="form-group">
            <label className="form-label">Descrizione (opzionale)</label>
            <textarea
              className="form-control"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Dettagli e condizioni riservate ai VIP..."
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <Select
              label="Tipo Beneficio *"
              value={discountType}
              onChange={(e) => setDiscountType(e.target.value as 'percentage' | 'fixed')}
              options={[
                { label: 'Sconto percentuale (%)', value: 'percentage' },
                { label: 'Sconto fisso / Valore (€)', value: 'fixed' },
              ]}
            />

            <Input
              label={discountType === 'percentage' ? 'Percentuale (%) *' : 'Valore (€) *'}
              type="number"
              step="0.01"
              min="0.01"
              max={discountType === 'percentage' ? '100' : undefined}
              required
              value={discountValueStr}
              onChange={(e) => setDiscountValueStr(e.target.value)}
            />
          </div>

          <div className="form-group" style={{ marginTop: '0.5rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem' }}>
              <input
                type="checkbox"
                checked={isSingleUse}
                onChange={(e) => setIsSingleUse(e.target.checked)}
              />
              <span>Beneficio monouso (un solo utilizzo per cliente VIP)</span>
            </label>
          </div>

          <div className="modal-actions">
            <Button type="button" variant="secondary" onClick={() => setIsFormOpen(false)} disabled={isSubmitting}>
              Annulla
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmitting} style={{ background: 'var(--color-vip, #d97706)', borderColor: 'var(--color-vip, #d97706)' }}>
              {editingOffer ? 'Salva Modifiche' : 'Crea Beneficio VIP'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modale Elimina */}
      <Modal isOpen={Boolean(offerToDelete)} title="Elimina Beneficio VIP" onClose={() => setOfferToDelete(null)}>
        <p>Sei sicuro di voler disattivare il beneficio VIP <strong>{offerToDelete?.title}</strong>?</p>
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
      <Modal isOpen={Boolean(offerToRedeem)} title="Applica Beneficio al Cliente VIP" onClose={() => setOfferToRedeem(null)}>
        {offerToRedeem && (
          <form onSubmit={handleRedeemVipOffer}>
            {redeemModalError && (
              <div style={{ marginBottom: '1rem' }}>
                <Alert type="error" message={redeemModalError} onDismiss={() => setRedeemModalError(null)} />
              </div>
            )}

            <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', padding: '0.75rem', borderRadius: 'var(--radius-md)', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>👑</span>
                <strong>{offerToRedeem.title}</strong>
              </div>
              <div style={{ fontSize: '0.85rem', color: '#92400e', marginTop: '0.25rem' }}>
                {formatOfferBenefit(
                  offerToRedeem.discount_type === 'fixed' || offerToRedeem.offer_type === 'discount' ? 'fixed' : 'percentage',
                  offerToRedeem.discount_value ?? offerToRedeem.discount_percentage ?? 0
                )}
              </div>
            </div>

            {!selectedCustomer ? (
              <div>
                <label className="form-label">Cerca cliente VIP (nome, telefono, email o ID):</label>
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
                        <span style={{ fontSize: '0.8rem', color: 'var(--color-vip, #d97706)' }}>Seleziona →</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div style={{ padding: '0.75rem', background: '#fef3c7', borderRadius: 'var(--radius-md)', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span>👑</span>
                      <strong>{selectedCustomer.first_name} {selectedCustomer.last_name}</strong>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#92400e' }}>ID Cliente: #{selectedCustomer.id} {vipAccount && `• Conto VIP #${vipAccount.id}`}</div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setSelectedCustomer(null)}>
                    Cambia
                  </Button>
                </div>
              </div>
            )}

            <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
              <Button type="button" variant="secondary" onClick={() => setOfferToRedeem(null)} disabled={isRedeeming}>
                Annulla
              </Button>
              <Button type="submit" variant="primary" isLoading={isRedeeming} disabled={!vipAccount} style={{ background: 'var(--color-vip, #d97706)', borderColor: 'var(--color-vip, #d97706)' }}>
                Conferma Beneficio VIP
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
