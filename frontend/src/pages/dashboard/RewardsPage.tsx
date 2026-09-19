import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { rewardsApi, loyaltyApi, customerApi } from '../../api/services';
import type { Reward, CardProfile, Customer, LoyaltyAccount } from '../../types';
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

  // Modale Riscatto Premio con Ricerca Cliente
  const [rewardToRedeem, setRewardToRedeem] = useState<Reward | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [isSearchingCustomers, setIsSearchingCustomers] = useState(false);
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerAccounts, setCustomerAccounts] = useState<LoyaltyAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [deliveryConfirmed, setDeliveryConfirmed] = useState(false);
  const [internalNote, setInternalNote] = useState('');
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [redeemModalError, setRedeemModalError] = useState<string | null>(null);

  const canManage = hasPermission('settings.manage') || hasPermission('business.update');
  const canRedeem = hasPermission('reward.redeem');

  const loadRewards = async () => {
    if (!activeBusiness) {
      setIsLoading(false);
      return;
    }
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

  const handleOpenRedeem = (r: Reward) => {
    setRewardToRedeem(r);
    setCustomerSearch('');
    setIsSearchingCustomers(false);
    setCustomerResults([]);
    setSelectedCustomer(null);
    setCustomerAccounts([]);
    setSelectedAccountId(null);
    setDeliveryConfirmed(false);
    setInternalNote('');
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
        setRedeemModalError('Nessun cliente trovato con i criteri di ricerca specificati.');
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
      // Filtra conti con capacità punti (Punti, Vantaggi o con saldo definito)
      const pointsAccounts = accounts.filter(
        (a) => a.profile_code === 'punti' || a.profile_code === 'vantaggi' || a.balance !== undefined
      );
      setCustomerAccounts(pointsAccounts);
      if (pointsAccounts.length === 1) {
        setSelectedAccountId(pointsAccounts[0].id);
      } else if (pointsAccounts.length === 0) {
        setRedeemModalError('Il cliente non possiede conti abilitati all\'accumulo e riscatto punti.');
      }
    } catch (err: any) {
      setRedeemModalError(err.message || 'Errore durante il recupero dei conti fedeltà.');
    }
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
    if (!activeBusiness || !rewardToRedeem || !selectedAccountId || !deliveryConfirmed) return;
    setIsRedeeming(true);
    setRedeemModalError(null);
    setFeedback(null);
    try {
      const res = await rewardsApi.redeem(
        activeBusiness.id,
        selectedAccountId,
        rewardToRedeem.id,
        generateOperationId(),
        internalNote.trim() || undefined
      );
      setFeedback({
        type: 'success',
        message: res.idempotent
          ? 'Premio già riscattato in precedenza (operazione idempotente).'
          : `Premio "${rewardToRedeem.name}" riscattato con successo! Nuovo saldo conto: ${res.new_balance} punti.`,
      });
      setRewardToRedeem(null);
      setSelectedCustomer(null);
      setSelectedAccountId(null);
      setDeliveryConfirmed(false);
      setInternalNote('');
      await loadRewards();
    } catch (err: any) {
      setRedeemModalError(err.message || 'Errore durante il riscatto del premio.');
    } finally {
      setIsRedeeming(false);
    }
  };

  const selectedAccount = customerAccounts.find((a) => a.id === selectedAccountId);
  const accountBalance = selectedAccount?.balance ?? 0;
  const isBalanceSufficient = rewardToRedeem ? accountBalance >= rewardToRedeem.points_cost : false;

  if (isLoading) return <Spinner size="lg" text="Caricamento catalogo premi..." />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Premi riscattabili con punti</h1>
          <p className="page-subtitle">Crea premi che i clienti possono riscattare utilizzando i punti accumulati.</p>
        </div>
        {canManage && (
          <Button variant="primary" onClick={handleOpenCreate}>
            ➕ Nuovo Premio
          </Button>
        )}
      </div>

      {feedback && <Alert type={feedback.type} message={feedback.message} onDismiss={() => setFeedback(null)} />}

      {rewards.length === 0 ? (
        <EmptyState
          title="Nessun premio con punti disponibile"
          description="Aggiungi il primo premio del programma fedeltà specificando il punteggio necessario."
          action={
            canManage ? (
              <Button variant="primary" onClick={handleOpenCreate}>
                Nuovo Premio
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
                          <Button variant="secondary" size="sm" onClick={() => handleOpenRedeem(r)}>
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

      {/* Modale Riscatto Operativo con Ricerca Cliente */}
      <Modal isOpen={Boolean(rewardToRedeem)} title="Riscatto Premio in Cassa" onClose={() => setRewardToRedeem(null)}>
        {rewardToRedeem && (
          <form onSubmit={handleRedeemReward}>
            {redeemModalError && (
              <div style={{ marginBottom: '1rem' }}>
                <Alert type="error" message={redeemModalError} onDismiss={() => setRedeemModalError(null)} />
              </div>
            )}

            <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', marginBottom: '1rem' }}>
              <strong>{rewardToRedeem.name}</strong>
              <div style={{ color: 'var(--color-primary)', fontWeight: 700, fontSize: '1.05rem', marginTop: '0.2rem' }}>
                Costo: {rewardToRedeem.points_cost} punti
              </div>
            </div>

            {/* Ricerca Cliente */}
            {!selectedCustomer ? (
              <div style={{ marginBottom: '1rem' }}>
                <label className="form-label">Cerca cliente (nome, telefono o email) *</label>
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
              <div style={{ marginBottom: '1rem' }}>
                {/* Cliente Selezionato */}
                <div style={{ background: '#f1f5f9', padding: '0.75rem', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
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
                      setSelectedAccountId(null);
                      setCustomerAccounts([]);
                    }}
                  >
                    Cambia
                  </Button>
                </div>

                {/* Selezione Conto se più di 1 */}
                {customerAccounts.length > 1 && (
                  <div style={{ marginBottom: '1rem' }}>
                    <Select
                      label="Seleziona Conto Fedeltà da cui scalare i punti *"
                      options={customerAccounts.map((a) => ({
                        label: `${a.profile_name} (Conto #${a.id}) - Saldo: ${a.balance ?? 0} pt`,
                        value: a.id,
                      }))}
                      value={selectedAccountId || ''}
                      onChange={(e) => setSelectedAccountId(Number(e.target.value) || null)}
                    />
                  </div>
                )}

                {/* Dettaglio Saldo e Controllo Punti */}
                {selectedAccount && (
                  <div style={{ marginBottom: '1rem' }}>
                    {!isBalanceSufficient ? (
                      <div className="alert alert-danger" style={{ fontSize: '0.88rem', padding: '0.65rem 0.85rem' }}>
                        ⚠️ <strong>Saldo punti insufficiente:</strong> il cliente possiede <strong>{accountBalance} pt</strong> su questo conto, ma ne sono richiesti <strong>{rewardToRedeem.points_cost} pt</strong>.
                      </div>
                    ) : (
                      <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '0.75rem', borderRadius: 'var(--radius-md)', fontSize: '0.88rem', color: '#065f46' }}>
                        <div>Saldo disponibile: <strong>{accountBalance} pt</strong></div>
                        <div style={{ marginTop: '0.2rem' }}>
                          Saldo residuo dopo il riscatto: <strong>{accountBalance - rewardToRedeem.points_cost} pt</strong>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Checkbox Obbligatorio Consegna */}
                <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', marginBottom: '1rem' }}>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                    <input
                      type="checkbox"
                      checked={deliveryConfirmed}
                      onChange={(e) => setDeliveryConfirmed(e.target.checked)}
                      style={{ marginTop: '0.2rem', width: '1.1rem', height: '1.1rem' }}
                    />
                    <span>
                      <strong>Confermo di aver consegnato il premio al cliente.</strong>
                    </span>
                  </label>
                </div>

                {/* Nota Interna Opzionale */}
                <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                  <label className="form-label">Nota interna (opzionale)</label>
                  <textarea
                    className="form-control"
                    rows={2}
                    placeholder="es. Consegnata confezione regalo / Operatore Marco"
                    value={internalNote}
                    onChange={(e) => setInternalNote(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="modal-actions">
              <Button type="button" variant="secondary" onClick={() => setRewardToRedeem(null)} disabled={isRedeeming}>
                Annulla
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={!selectedAccount || !isBalanceSufficient || !deliveryConfirmed || isRedeeming}
                isLoading={isRedeeming}
              >
                Conferma e Consegna Premio
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
