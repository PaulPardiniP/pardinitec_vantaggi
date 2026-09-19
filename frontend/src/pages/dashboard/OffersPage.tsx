import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { offersApi } from '../../api/services';
import type { Offer } from '../../types';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Select } from '../../components/common/Select';
import { Modal } from '../../components/common/Modal';
import { Alert } from '../../components/common/Alert';
import { Spinner } from '../../components/common/Spinner';
import { EmptyState } from '../../components/common/EmptyState';
import { generateOperationId } from '../../api/client';
import { formatOfferBenefit, formatTargetAudience } from '../../utils/formatters';

export const OffersPage: React.FC = () => {
  const { activeBusiness, hasPermission } = useAuth();

  const [offers, setOffers] = useState<Offer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modale Crea / Modifica Offerta
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState<Offer | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountValue, setDiscountValue] = useState<number>(10);
  const [targetAudience, setTargetAudience] = useState<'vantaggi' | 'vip' | 'vantaggi_vip'>('vantaggi');
  const [isSingleUse, setIsSingleUse] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modale Elimina Offerta
  const [offerToDelete, setOfferToDelete] = useState<Offer | null>(null);

  // Modale Riscatto Offerta
  const [offerToRedeem, setOfferToRedeem] = useState<Offer | null>(null);
  const [redeemAccountId, setRedeemAccountId] = useState('');
  const [isRedeeming, setIsRedeeming] = useState(false);

  const canManage = hasPermission('offer.manage');
  const canRedeem = hasPermission('offer.redeem');

  const loadOffers = async () => {
    if (!activeBusiness) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const list = await offersApi.list(activeBusiness.id, true);
      setOffers(list);
    } catch {
      setOffers([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadOffers();
  }, [activeBusiness]);

  const handleOpenCreate = () => {
    setEditingOffer(null);
    setTitle('');
    setDescription('');
    setDiscountType('percentage');
    setDiscountValue(10);
    setTargetAudience('vantaggi');
    setIsSingleUse(true);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (o: Offer) => {
    setEditingOffer(o);
    setTitle(o.title);
    setDescription(o.description || '');
    setDiscountType(o.discount_type === 'fixed' || o.offer_type === 'discount' ? 'fixed' : 'percentage');
    setDiscountValue(o.discount_value ?? o.discount_percentage ?? 0);
    const resolvedAudience = o.target_audience === 'all'
      ? 'vantaggi_vip'
      : (o.target_audience || (o.is_vip ? 'vip' : 'vantaggi_vip'));
    setTargetAudience(resolvedAudience as 'vantaggi' | 'vip' | 'vantaggi_vip');
    setIsSingleUse(o.is_single_use);
    setIsFormOpen(true);
  };

  const handleSaveOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBusiness) return;
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const payload: Partial<Offer> = {
        title,
        description: description.trim() || null,
        discount_type: discountType,
        discount_value: Number(discountValue),
        target_audience: targetAudience,
        is_single_use: isSingleUse,
      };

      if (editingOffer) {
        await offersApi.update(activeBusiness.id, editingOffer.id, payload);
        setFeedback({ type: 'success', message: 'Offerta aggiornata con successo.' });
      } else {
        await offersApi.create(activeBusiness.id, payload);
        setFeedback({ type: 'success', message: 'Nuova offerta creata con successo!' });
      }

      setIsFormOpen(false);
      await loadOffers();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Errore durante il salvataggio dell\'offerta.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteOffer = async () => {
    if (!activeBusiness || !offerToDelete) return;
    setIsSubmitting(true);
    setFeedback(null);
    try {
      await offersApi.delete(activeBusiness.id, offerToDelete.id);
      setFeedback({ type: 'success', message: 'Offerta eliminata con successo.' });
      setOfferToDelete(null);
      await loadOffers();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Errore durante l\'eliminazione dell\'offerta.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRedeemOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBusiness || !offerToRedeem || !redeemAccountId) return;
    setIsRedeeming(true);
    setFeedback(null);
    try {
      const res = await offersApi.redeem(
        activeBusiness.id,
        Number(redeemAccountId),
        offerToRedeem.id,
        generateOperationId()
      );
      setFeedback({
        type: 'success',
        message: res.idempotent
          ? 'Offerta già applicata in precedenza (operazione idempotente).'
          : `Offerta "${offerToRedeem.title}" (${formatOfferBenefit(offerToRedeem.discount_type, offerToRedeem.discount_value)}) applicata con successo al conto #${res.loyalty_account_id}!`,
      });
      setOfferToRedeem(null);
      setRedeemAccountId('');
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Errore durante l\'applicazione dell\'offerta.' });
    } finally {
      setIsRedeeming(false);
    }
  };

  if (isLoading) return <Spinner size="lg" text="Caricamento offerte..." />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Offerte Vantaggi & VIP</h1>
          <p className="page-subtitle">Crea promozioni dedicate ai clienti Vantaggi, VIP o a entrambi.</p>
        </div>
        {canManage && (
          <Button variant="primary" onClick={handleOpenCreate}>
            ➕ Nuova Offerta
          </Button>
        )}
      </div>

      {feedback && <Alert type={feedback.type} message={feedback.message} onDismiss={() => setFeedback(null)} />}

      {offers.length === 0 ? (
        <EmptyState
          title="Nessuna offerta Vantaggi o VIP disponibile"
          description="Crea sconti speciali o promozioni di benvenuto per i tuoi clienti fedeli."
          action={
            canManage ? (
              <Button variant="primary" onClick={handleOpenCreate}>
                Nuova Offerta
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Titolo Offerta</th>
                <th>Tipo & Valore</th>
                <th>Destinatari</th>
                <th>Uso</th>
                <th>Stato</th>
                <th style={{ textAlign: 'right' }}>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {offers.map((o) => (
                <tr key={o.id}>
                  <td>#{o.id}</td>
                  <td>
                    <strong>{o.title}</strong>
                    {o.description && <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{o.description}</div>}
                  </td>
                  <td>
                    <span className="badge badge-primary">
                      {formatOfferBenefit(o.discount_type, o.discount_value)}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${o.target_audience === 'vip' || o.is_vip ? 'badge-vip' : o.target_audience === 'vantaggi' ? 'badge-secondary' : 'badge-outline'}`}>
                      {formatTargetAudience(o.target_audience, o.is_vip, o.card_profile_id)}
                    </span>
                  </td>
                  <td>{o.is_single_use ? 'Monouso' : 'Multiplo'}</td>
                  <td>
                    <span className={`badge ${o.status === 'active' ? 'badge-success' : 'badge-warning'}`}>
                      {o.status}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                      {canRedeem && (
                        <Button variant="secondary" size="sm" onClick={() => setOfferToRedeem(o)}>
                          Applica
                        </Button>
                      )}
                      {canManage && (
                        <>
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
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modale Crea / Modifica */}
      <Modal isOpen={isFormOpen} title={editingOffer ? 'Modifica Offerta' : 'Nuova Offerta'} onClose={() => setIsFormOpen(false)}>
        <form onSubmit={handleSaveOffer}>
          <Input label="Titolo Offerta *" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="es. Sconto Benvenuto 5€" />

          <div className="form-group">
            <label className="form-label">Descrizione (opzionale)</label>
            <textarea
              className="form-control"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Dettagli e condizioni dell'offerta..."
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <Select
              label="Tipo Sconto *"
              options={[
                { label: 'Percentuale (%)', value: 'percentage' },
                { label: 'Importo Fisso (€)', value: 'fixed' },
              ]}
              value={discountType}
              onChange={(e) => setDiscountType(e.target.value as 'percentage' | 'fixed')}
            />
            <Input
              label={discountType === 'percentage' ? 'Percentuale Sconto (%) *' : 'Valore Sconto (€) *'}
              type="number"
              step={discountType === 'percentage' ? '0.1' : '0.01'}
              min="0.01"
              max={discountType === 'percentage' ? '100' : undefined}
              required
              value={discountValue}
              onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
            />
          </div>

          <div style={{ margin: '1rem 0' }}>
            <Select
              label="Destinatari Offerta *"
              options={[
                { label: 'Solo Vantaggi', value: 'vantaggi' },
                { label: 'Solo VIP', value: 'vip' },
                { label: 'Vantaggi e VIP', value: 'vantaggi_vip' },
              ]}
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value as 'vantaggi' | 'vip' | 'vantaggi_vip')}
            />
          </div>

          <div style={{ margin: '1rem 0', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label className="form-checkbox">
              <input type="checkbox" checked={isSingleUse} onChange={(e) => setIsSingleUse(e.target.checked)} />
              <span>
                <strong>Offerta Monouso</strong> (utilizzabile una sola volta per cliente)
              </span>
            </label>
          </div>

          <div className="modal-actions">
            <Button type="button" variant="secondary" onClick={() => setIsFormOpen(false)} disabled={isSubmitting}>
              Annulla
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmitting}>
              {editingOffer ? 'Salva Modifiche' : 'Crea Offerta'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modale Riscatto Operativo */}
      <Modal isOpen={Boolean(offerToRedeem)} title="Applicazione Offerta al Banco" onClose={() => setOfferToRedeem(null)}>
        {offerToRedeem && (
          <form onSubmit={handleRedeemOffer}>
            <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: 'var(--radius-md)', marginBottom: '1rem' }}>
              <div style={{ fontWeight: 700 }}>{offerToRedeem.title}</div>
              <div style={{ marginTop: '0.25rem', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                <span className="badge badge-primary">
                  {formatOfferBenefit(offerToRedeem.discount_type, offerToRedeem.discount_value)}
                </span>
                <span className="badge badge-secondary">
                  {formatTargetAudience(offerToRedeem.target_audience, offerToRedeem.is_vip, offerToRedeem.card_profile_id)}
                </span>
              </div>
              {offerToRedeem.is_single_use && (
                <div style={{ fontSize: '0.8rem', color: 'var(--color-warning)', marginTop: '0.4rem' }}>
                  ⚠️ Offerta monouso: verrà contrassegnata come utilizzata per questo conto.
                </div>
              )}
            </div>

            <Input
              label="ID Conto Fedeltà del Cliente *"
              type="number"
              required
              placeholder="es. 12"
              value={redeemAccountId}
              onChange={(e) => setRedeemAccountId(e.target.value)}
            />

            <div className="modal-actions">
              <Button type="button" variant="secondary" onClick={() => setOfferToRedeem(null)} disabled={isRedeeming}>
                Annulla
              </Button>
              <Button type="submit" variant="primary" isLoading={isRedeeming}>
                Conferma e Applica Offerta
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modale Conferma Eliminazione */}
      <Modal isOpen={Boolean(offerToDelete)} title="Elimina Offerta" onClose={() => setOfferToDelete(null)}>
        {offerToDelete && (
          <div>
            <p>Sei sicuro di voler rimuovere l'offerta <strong>"{offerToDelete.title}"</strong>?</p>
            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setOfferToDelete(null)} disabled={isSubmitting}>
                Annulla
              </Button>
              <Button variant="danger" onClick={handleDeleteOffer} isLoading={isSubmitting}>
                Elimina Offerta
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
