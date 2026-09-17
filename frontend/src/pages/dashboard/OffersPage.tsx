import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { offersApi, loyaltyApi } from '../../api/services';
import type { Offer, CardProfile } from '../../types';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Select } from '../../components/common/Select';
import { Modal } from '../../components/common/Modal';
import { Alert } from '../../components/common/Alert';
import { Spinner } from '../../components/common/Spinner';
import { EmptyState } from '../../components/common/EmptyState';
import { generateOperationId } from '../../api/client';

export const OffersPage: React.FC = () => {
  const { activeBusiness, hasPermission } = useAuth();

  const [offers, setOffers] = useState<Offer[]>([]);
  const [profiles, setProfiles] = useState<CardProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modale Crea / Modifica Offerta
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState<Offer | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [discountType, setDiscountType] = useState('percentage');
  const [discountValue, setDiscountValue] = useState<number>(10);
  const [isVip, setIsVip] = useState(false);
  const [isSingleUse, setIsSingleUse] = useState(true);
  const [profileId, setProfileId] = useState<number | ''>('');
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
    if (!activeBusiness) return;
    setIsLoading(true);
    try {
      const list = await offersApi.list(activeBusiness.id, true);
      setOffers(list);
      const profs = await loyaltyApi.listProfiles();
      setProfiles(profs);
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
    setIsVip(false);
    setIsSingleUse(true);
    setProfileId('');
    setIsFormOpen(true);
  };

  const handleOpenEdit = (o: Offer) => {
    setEditingOffer(o);
    setTitle(o.title);
    setDescription(o.description || '');
    setDiscountType(o.discount_type);
    setDiscountValue(o.discount_value);
    setIsVip(o.is_vip);
    setIsSingleUse(o.is_single_use);
    setProfileId(o.card_profile_id || '');
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
        is_vip: isVip,
        is_single_use: isSingleUse,
        card_profile_id: profileId ? Number(profileId) : null,
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
          : `Offerta "${offerToRedeem.title}" applicata con successo al conto #${res.loyalty_account_id}!`,
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
          <h1 className="page-title">Offerte & Promozioni</h1>
          <p className="page-subtitle">Gestisci sconti standard e vantaggi riservati ai clienti VIP.</p>
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
          title="Nessuna offerta attiva"
          description="Crea sconti speciali o promozioni di benvenuto per i tuoi clienti fedeli."
          action={
            canManage ? (
              <Button variant="primary" onClick={handleOpenCreate}>
                Crea Offerta
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
                <th>Accesso VIP</th>
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
                      {o.discount_type === 'percentage' ? `${o.discount_value}%` : `${o.discount_value} €`}
                    </span>
                  </td>
                  <td>
                    {o.is_vip ? (
                      <span className="badge badge-vip">Esclusivo VIP</span>
                    ) : (
                      <span className="badge badge-secondary">Standard</span>
                    )}
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
          <Input label="Titolo Offerta *" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="es. Buono Benvenuto 5€" />

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
                { label: 'Importo Fisso (€)', value: 'fixed_amount' },
              ]}
              value={discountType}
              onChange={(e) => setDiscountType(e.target.value)}
            />
            <Input
              label="Valore Sconto *"
              type="number"
              min="0"
              required
              value={discountValue}
              onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
            />
          </div>

          <div style={{ margin: '1rem 0', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label className="form-checkbox">
              <input type="checkbox" checked={isVip} onChange={(e) => setIsVip(e.target.checked)} />
              <span>
                <strong>Offerta Esclusiva VIP</strong> (accessibile solo ai conti con profilo VIP)
              </span>
            </label>

            <label className="form-checkbox">
              <input type="checkbox" checked={isSingleUse} onChange={(e) => setIsSingleUse(e.target.checked)} />
              <span>
                <strong>Offerta Monouso</strong> (utilizzabile una sola volta per cliente)
              </span>
            </label>
          </div>

          <Select
            label="Limita a un profilo specifico (opzionale)"
            options={[
              { label: 'Tutti i profili abilitati', value: '' },
              ...profiles.map((p) => ({ label: p.name, value: p.id })),
            ]}
            value={profileId}
            onChange={(e) => setProfileId(e.target.value ? Number(e.target.value) : '')}
          />

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
              {offerToRedeem.is_vip && <span className="badge badge-vip" style={{ marginTop: '0.25rem' }}>VIP</span>}
              {offerToRedeem.is_single_use && (
                <div style={{ fontSize: '0.8rem', color: 'var(--color-warning)', marginTop: '0.25rem' }}>
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
