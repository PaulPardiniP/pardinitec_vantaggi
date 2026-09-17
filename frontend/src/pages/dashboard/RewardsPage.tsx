import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { rewardsApi, loyaltyApi } from '../../api/services';
import type { Reward, CardProfile } from '../../types';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Select } from '../../components/common/Select';
import { Modal } from '../../components/common/Modal';
import { Alert } from '../../components/common/Alert';
import { Spinner } from '../../components/common/Spinner';
import { EmptyState } from '../../components/common/EmptyState';
import { generateOperationId } from '../../api/client';

export const RewardsPage: React.FC = () => {
  const { activeBusiness, hasPermission } = useAuth();

  const [rewards, setRewards] = useState<Reward[]>([]);
  const [profiles, setProfiles] = useState<CardProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modale Crea / Modifica Premio
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingReward, setEditingReward] = useState<Reward | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [pointsCost, setPointsCost] = useState<number>(50);
  const [profileId, setProfileId] = useState<number | ''>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modale Elimina Premio
  const [rewardToDelete, setRewardToDelete] = useState<Reward | null>(null);

  // Modale Riscatto Premio
  const [rewardToRedeem, setRewardToRedeem] = useState<Reward | null>(null);
  const [redeemAccountId, setRedeemAccountId] = useState('');
  const [isRedeeming, setIsRedeeming] = useState(false);

  const canManage = hasPermission('settings.manage') || hasPermission('business.update');
  const canRedeem = hasPermission('reward.redeem');

  const loadRewards = async () => {
    if (!activeBusiness) return;
    setIsLoading(true);
    try {
      const list = await rewardsApi.list(activeBusiness.id, true);
      setRewards(list);
      const profs = await loyaltyApi.listProfiles();
      setProfiles(profs);
    } catch {
      setRewards([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRewards();
  }, [activeBusiness]);

  const handleOpenCreate = () => {
    setEditingReward(null);
    setName('');
    setDescription('');
    setPointsCost(50);
    setProfileId('');
    setIsFormOpen(true);
  };

  const handleOpenEdit = (r: Reward) => {
    setEditingReward(r);
    setName(r.name);
    setDescription(r.description || '');
    setPointsCost(r.points_cost);
    setProfileId(r.card_profile_id || '');
    setIsFormOpen(true);
  };

  const handleSaveReward = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBusiness) return;
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const payload: Partial<Reward> = {
        name,
        description: description.trim() || null,
        points_cost: Number(pointsCost),
        card_profile_id: profileId ? Number(profileId) : null,
      };

      if (editingReward) {
        await rewardsApi.update(activeBusiness.id, editingReward.id, payload);
        setFeedback({ type: 'success', message: 'Premio aggiornato con successo.' });
      } else {
        await rewardsApi.create(activeBusiness.id, payload);
        setFeedback({ type: 'success', message: 'Nuovo premio aggiunto al catalogo!' });
      }

      setIsFormOpen(false);
      await loadRewards();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Errore durante il salvataggio del premio.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteReward = async () => {
    if (!activeBusiness || !rewardToDelete) return;
    setIsSubmitting(true);
    setFeedback(null);
    try {
      await rewardsApi.delete(activeBusiness.id, rewardToDelete.id);
      setFeedback({ type: 'success', message: 'Premio eliminato dal catalogo.' });
      setRewardToDelete(null);
      await loadRewards();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Errore durante l\'eliminazione del premio.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRedeemReward = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBusiness || !rewardToRedeem || !redeemAccountId) return;
    setIsRedeeming(true);
    setFeedback(null);
    try {
      const res = await rewardsApi.redeem(
        activeBusiness.id,
        Number(redeemAccountId),
        rewardToRedeem.id,
        generateOperationId()
      );
      setFeedback({
        type: 'success',
        message: res.idempotent
          ? 'Premio già riscattato in precedenza (operazione idempotente).'
          : `Premio "${rewardToRedeem.name}" riscattato con successo! Nuovo saldo conto: ${res.new_balance} punti.`,
      });
      setRewardToRedeem(null);
      setRedeemAccountId('');
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Errore durante il riscatto del premio.' });
    } finally {
      setIsRedeeming(false);
    }
  };

  if (isLoading) return <Spinner size="lg" text="Caricamento catalogo premi..." />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Catalogo Premi</h1>
          <p className="page-subtitle">Configura i premi fedeltà e gestisci i riscatti in cassa.</p>
        </div>
        {canManage && (
          <Button variant="primary" onClick={handleOpenCreate}>
            ➕ Aggiungi Premio
          </Button>
        )}
      </div>

      {feedback && <Alert type={feedback.type} message={feedback.message} onDismiss={() => setFeedback(null)} />}

      {rewards.length === 0 ? (
        <EmptyState
          title="Nessun premio a catalogo"
          description="Aggiungi il primo premio del programma fedeltà specificando il punteggio necessario."
          action={
            canManage ? (
              <Button variant="primary" onClick={handleOpenCreate}>
                Aggiungi Premio
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
                <th>Nome Premio</th>
                <th>Punti Richiesti</th>
                <th>Profilo Associato</th>
                <th>Stato</th>
                <th style={{ textAlign: 'right' }}>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {rewards.map((r) => {
                const profileObj = profiles.find((p) => p.id === r.card_profile_id);
                return (
                  <tr key={r.id}>
                    <td>#{r.id}</td>
                    <td>
                      <strong>{r.name}</strong>
                      {r.description && <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{r.description}</div>}
                    </td>
                    <td>
                      <span className="badge badge-primary">{r.points_cost} pt</span>
                    </td>
                    <td>{profileObj ? profileObj.name : 'Tutti i profili con punti'}</td>
                    <td>
                      <span className={`badge ${r.status === 'active' ? 'badge-success' : 'badge-warning'}`}>
                        {r.status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                        {canRedeem && (
                          <Button variant="secondary" size="sm" onClick={() => setRewardToRedeem(r)}>
                            🎁 Riscatta
                          </Button>
                        )}
                        {canManage && (
                          <>
                            <Button variant="outline" size="sm" onClick={() => handleOpenEdit(r)}>
                              Modifica
                            </Button>
                            <Button variant="danger" size="sm" onClick={() => setRewardToDelete(r)}>
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

      {/* Modale Crea / Modifica */}
      <Modal isOpen={isFormOpen} title={editingReward ? 'Modifica Premio' : 'Nuovo Premio'} onClose={() => setIsFormOpen(false)}>
        <form onSubmit={handleSaveReward}>
          <Input label="Nome Premio *" required value={name} onChange={(e) => setName(e.target.value)} placeholder="es. Caffè Omaggio" />

          <div className="form-group">
            <label className="form-label">Descrizione (opzionale)</label>
            <textarea
              className="form-control"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Dettagli sul premio..."
            />
          </div>

          <Input
            label="Costo in Punti *"
            type="number"
            min="1"
            required
            value={pointsCost}
            onChange={(e) => setPointsCost(parseInt(e.target.value, 10) || 1)}
          />

          <Select
            label="Limita a un profilo specifico (opzionale)"
            options={[
              { label: 'Valido per tutti i profili con capacità punti', value: '' },
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
              {editingReward ? 'Salva Modifiche' : 'Crea Premio'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modale Riscatto Operativo */}
      <Modal isOpen={Boolean(rewardToRedeem)} title="Riscatto Premio in Cassa" onClose={() => setRewardToRedeem(null)}>
        {rewardToRedeem && (
          <form onSubmit={handleRedeemReward}>
            <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: 'var(--radius-md)', marginBottom: '1rem' }}>
              <strong>{rewardToRedeem.name}</strong>
              <div style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Costo: {rewardToRedeem.points_cost} punti</div>
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
              <Button type="button" variant="secondary" onClick={() => setRewardToRedeem(null)} disabled={isRedeeming}>
                Annulla
              </Button>
              <Button type="submit" variant="primary" isLoading={isRedeeming}>
                Conferma e Scala Punti
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modale Conferma Eliminazione */}
      <Modal isOpen={Boolean(rewardToDelete)} title="Elimina Premio" onClose={() => setRewardToDelete(null)}>
        {rewardToDelete && (
          <div>
            <p>Sei sicuro di voler rimuovere il premio <strong>"{rewardToDelete.name}"</strong> dal catalogo?</p>
            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setRewardToDelete(null)} disabled={isSubmitting}>
                Annulla
              </Button>
              <Button variant="danger" onClick={handleDeleteReward} isLoading={isSubmitting}>
                Elimina Premio
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
