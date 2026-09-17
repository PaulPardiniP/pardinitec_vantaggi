import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { publicCardApi, pointsApi, rewardsApi, offersApi } from '../../api/services';
import type { PublicCardView, Reward, Offer } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Modal } from '../../components/common/Modal';
import { Alert } from '../../components/common/Alert';
import { Spinner } from '../../components/common/Spinner';
import { ApiError, generateOperationId } from '../../api/client';

export const PublicCardPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const { isAuthenticated } = useAuth();

  const [cardData, setCardData] = useState<PublicCardView | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | undefined>(undefined);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modali Operative Staff
  const [isPointsModalOpen, setIsPointsModalOpen] = useState(false);
  const [pointsDelta, setPointsDelta] = useState<number>(10);
  const [pointsReason, setPointsReason] = useState<string>('Acquisto in cassa');
  const [calcAmount, setCalcAmount] = useState<string>('');

  const [selectedReward, setSelectedReward] = useState<Reward | null>(null);
  const [selectedOffer, setSelectedOffer] = useState<Offer | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchCard = async () => {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await publicCardApi.resolve(token);
      setCardData(data);
    } catch (err: any) {
      if (err instanceof ApiError) {
        setError(err.message);
        setErrorStatus(err.status);
      } else {
        setError('Impossibile caricare le informazioni della carta.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCard();
  }, [token]);

  // Calcolo punti in anteprima per importo spesa
  const handleCalculatePoints = async () => {
    const amt = parseFloat(calcAmount);
    if (isNaN(amt) || amt <= 0 || !cardData?.business?.id) return;
    try {
      const res = await pointsApi.calculate(cardData.business.id, amt);
      setPointsDelta(res.calculated_points);
      setPointsReason(`Spesa di ${amt.toFixed(2)} €`);
    } catch {
      // mantieni default
    }
  };

  // 1. Azione: Accredito / Rettifica Punti
  const handleAdjustPoints = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardData?.business?.id || !cardData?.loyalty_account?.id) return;
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await pointsApi.adjust(cardData.business.id, cardData.loyalty_account.id, {
        points_delta: Number(pointsDelta),
        reason: pointsReason,
        operation_id: generateOperationId(),
      });
      setFeedback({
        type: 'success',
        message: res.idempotent
          ? 'Operazione già registrata in precedenza.'
          : `Punti aggiornati con successo! Nuovo saldo: ${res.new_balance} punti.`,
      });
      setIsPointsModalOpen(false);
      await fetchCard();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Errore durante l\'aggiornamento dei punti.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // 2. Azione: Riscatto Premio
  const handleRedeemReward = async () => {
    if (!cardData?.business?.id || !cardData?.loyalty_account?.id || !selectedReward) return;
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await rewardsApi.redeem(
        cardData.business.id,
        cardData.loyalty_account.id,
        selectedReward.id,
        generateOperationId()
      );
      setFeedback({
        type: 'success',
        message: `Premio "${selectedReward.name}" riscattato con successo! Nuovo saldo: ${res.new_balance} punti.`,
      });
      setSelectedReward(null);
      await fetchCard();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Errore durante il riscatto del premio.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // 3. Azione: Riscatto Offerta
  const handleRedeemOffer = async () => {
    if (!cardData?.business?.id || !cardData?.loyalty_account?.id || !selectedOffer) return;
    setIsSubmitting(true);
    setFeedback(null);
    try {
      await offersApi.redeem(
        cardData.business.id,
        cardData.loyalty_account.id,
        selectedOffer.id,
        generateOperationId()
      );
      setFeedback({
        type: 'success',
        message: `Offerta "${selectedOffer.title}" applicata con successo!`,
      });
      setSelectedOffer(null);
      await fetchCard();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Errore durante l\'applicazione dell\'offerta.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="public-card-container">
        <Spinner size="lg" text="Caricamento carta..." />
      </div>
    );
  }

  // Errori o stati non disponibili
  if (error || !cardData) {
    return (
      <div className="public-card-container">
        <div className="public-card-box" style={{ padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
          <Alert type="error" status={errorStatus} message={error || 'Carta non disponibile o non trovata.'} />
          <div style={{ marginTop: '1.5rem' }}>
            <Link to="/login" className="btn btn-secondary">
              Vai alla pagina di accesso
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Stato: Sospesa
  if (cardData.state === 'suspended') {
    return (
      <div className="public-card-container">
        <div className="public-card-box" style={{ padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏸️</div>
          <h2 style={{ marginBottom: '0.5rem' }}>Carta Temporaneamente Sospesa</h2>
          <p className="page-subtitle">Rivolgiti al personale del punto vendita per maggiori informazioni.</p>
        </div>
      </div>
    );
  }

  // Stato: Inventario o Non ancora attivata
  if (cardData.state === 'inventory' || cardData.state === 'issued') {
    return (
      <div className="public-card-container">
        <div className="public-card-box" style={{ padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📦</div>
          <h2 style={{ marginBottom: '0.5rem' }}>Carta Non Ancora Attivata</h2>
          <p className="page-subtitle">{cardData.message || 'Rivolgiti al personale del punto vendita per l\'attivazione.'}</p>
          {!isAuthenticated && (
            <div style={{ marginTop: '1.5rem' }}>
              <Link to={`/login?return_to=/c/${token}`} className="btn btn-primary">
                Accesso Commerciante
              </Link>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Stato: Accesso negato / Altro commercio
  if (cardData.state === 'forbidden') {
    return (
      <div className="public-card-container">
        <div className="public-card-box" style={{ padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🚫</div>
          <Alert type="error" status={403} message="Accesso negato: questa carta appartiene a un altro esercizio commerciale." />
        </div>
      </div>
    );
  }

  const isStaff = cardData.mode === 'staff';
  const profileCode = cardData.loyalty_account?.profile_code || 'punti';
  const headerClass =
    profileCode === 'vip' ? 'header-vip' : profileCode === 'vantaggi' ? 'header-vantaggi' : 'header-punti';

  return (
    <div className="public-card-container">
      <div className="public-card-box">
        {/* Intestazione Carta */}
        <div className={`public-card-header ${headerClass}`}>
          {isStaff && (
            <div
              style={{
                background: 'rgba(0,0,0,0.25)',
                display: 'inline-block',
                padding: '0.2rem 0.6rem',
                borderRadius: 'var(--radius-full)',
                fontSize: '0.75rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                marginBottom: '0.5rem',
              }}
            >
              Ficha Operativa Esercente
            </div>
          )}

          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0 }}>
            {cardData.business?.name || 'Pardinitec Vantaggi'}
          </h1>

          <div style={{ marginTop: '0.5rem' }}>
            <span
              className="badge"
              style={{
                background: 'rgba(255, 255, 255, 0.25)',
                color: '#ffffff',
                border: '1px solid rgba(255, 255, 255, 0.4)',
              }}
            >
              Profilo {cardData.loyalty_account?.profile_name || profileCode.toUpperCase()}
            </span>
          </div>
        </div>

        <div className="public-card-body">
          {/* Banner di Riscontro Operativo */}
          {feedback && (
            <Alert
              type={feedback.type}
              message={feedback.message}
              onDismiss={() => setFeedback(null)}
            />
          )}

          {/* Dati Cliente (Visibili SOLO in modalità Staff) */}
          {isStaff && cardData.customer && (
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                padding: '0.85rem 1rem',
                marginBottom: '1.25rem',
              }}
            >
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                Titolare Conto
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 700 }}>
                {cardData.customer.first_name} {cardData.customer.last_name}
              </div>
              {(cardData.customer.phone || cardData.customer.email) && (
                <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
                  {cardData.customer.phone && <span>📞 {cardData.customer.phone} </span>}
                  {cardData.customer.email && <span>✉️ {cardData.customer.email}</span>}
                </div>
              )}
            </div>
          )}

          {/* Saldo Punti (Mostrato solo se la capacità 'points' è presente/balance è valorizzato) */}
          {cardData.loyalty_account?.balance !== undefined && (
            <div className="balance-display">
              <div className="balance-value">{cardData.loyalty_account.balance}</div>
              <div className="balance-label">Punti Accumulati</div>
            </div>
          )}

          {/* Progresso Verso Prossimo Premio */}
          {cardData.next_reward && (
            <div style={{ marginBottom: '1.5rem', background: '#f8fafc', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 600 }}>
                <span>Prossimo premio: {cardData.next_reward.name}</span>
                <span>{cardData.next_reward.progress_percent}%</span>
              </div>
              <div className="progress-bar-bg">
                <div className="progress-bar-fill" style={{ width: `${Math.min(100, cardData.next_reward.progress_percent)}%` }} />
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', textAlign: 'right' }}>
                Mancano {cardData.next_reward.points_needed} punti
              </div>
            </div>
          )}

          {/* Azioni Operative del Personale (Staff Actions) */}
          {isStaff && cardData.actions && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                Azioni Rapide di Cassa
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                {cardData.actions.can_adjust_points && (
                  <Button variant="primary" size="sm" onClick={() => setIsPointsModalOpen(true)}>
                    ➕ Gestisci Punti
                  </Button>
                )}
                {cardData.actions.can_redeem_rewards && (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!cardData.rewards || cardData.rewards.length === 0}
                    onClick={() => {
                      if (cardData.rewards && cardData.rewards.length > 0) {
                        setSelectedReward(cardData.rewards[0]);
                      }
                    }}
                  >
                    🎁 Riscatta Premio
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Catalogo Premi Disponibili */}
          {cardData.rewards && cardData.rewards.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.75rem' }}>Premi Disponibili</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {cardData.rewards.map((r) => {
                  const canAfford =
                    cardData.loyalty_account?.balance !== undefined &&
                    cardData.loyalty_account.balance >= r.points_cost;

                  return (
                    <div
                      key={r.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0.75rem',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600 }}>{r.name}</div>
                        {r.description && <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{r.description}</div>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span className="badge badge-primary">{r.points_cost} pt</span>
                        {isStaff && cardData.actions?.can_redeem_rewards && (
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={!canAfford}
                            onClick={() => setSelectedReward(r)}
                          >
                            Riscatta
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Catalogo Offerte / Vantaggi Esclusivi */}
          {cardData.offers && cardData.offers.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.75rem' }}>
                {profileCode === 'vip' ? 'Vantaggi e Offerte Esclusive VIP' : 'Offerte e Promozioni'}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {cardData.offers.map((o) => (
                  <div
                    key={o.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.75rem',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-md)',
                      background: o.is_vip ? 'var(--color-vip-bg)' : '#ffffff',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span>{o.title}</span>
                        {o.is_vip && <span className="badge badge-vip">VIP</span>}
                      </div>
                      {o.description && <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{o.description}</div>}
                    </div>
                    {isStaff && cardData.actions?.can_redeem_offers && (
                      <Button variant="outline" size="sm" onClick={() => setSelectedOffer(o)}>
                        Applica
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Storico Operativo Recente (Solo Staff) */}
          {isStaff && cardData.recent_transactions && cardData.recent_transactions.length > 0 && (
            <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
                Ultimi Movimenti Punti
              </h4>
              <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {cardData.recent_transactions.map((tx) => (
                  <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{tx.reason || tx.type}</span>
                    <strong style={{ color: tx.points_delta >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                      {tx.points_delta >= 0 ? `+${tx.points_delta}` : tx.points_delta} pt
                    </strong>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Accesso Commerciante per utenti anonimi */}
          {!isStaff && (
            <div style={{ textAlign: 'center', marginTop: '1.5rem', borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>
              <Link to={`/login?return_to=/c/${token}`} className="btn btn-outline btn-sm">
                🔒 Accesso Commerciante
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Modale Accredito Punti */}
      <Modal isOpen={isPointsModalOpen} title="Gestione Punti" onClose={() => setIsPointsModalOpen(false)}>
        <form onSubmit={handleAdjustPoints}>
          <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: 'var(--radius-md)', marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Calcolatore Spesa Rapido</div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Input
                type="number"
                step="0.01"
                placeholder="Importo spesa (€)"
                value={calcAmount}
                onChange={(e) => setCalcAmount(e.target.value)}
              />
              <Button type="button" variant="secondary" size="sm" onClick={handleCalculatePoints}>
                Calcola
              </Button>
            </div>
          </div>

          <Input
            label="Delta Punti (+ per accredito, - per storno)"
            type="number"
            required
            value={pointsDelta}
            onChange={(e) => setPointsDelta(parseInt(e.target.value, 10) || 0)}
          />

          <Input
            label="Causale Operazione"
            required
            value={pointsReason}
            onChange={(e) => setPointsReason(e.target.value)}
          />

          <div className="modal-actions">
            <Button type="button" variant="secondary" onClick={() => setIsPointsModalOpen(false)} disabled={isSubmitting}>
              Annulla
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmitting}>
              Conferma Operazione
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modale Riscatto Premio */}
      <Modal isOpen={Boolean(selectedReward)} title="Conferma Riscatto Premio" onClose={() => setSelectedReward(null)}>
        {selectedReward && (
          <div>
            <p>Sei sicuro di voler riscattare il seguente premio per questo cliente?</p>
            <div style={{ margin: '1rem 0', padding: '0.75rem', background: '#f8fafc', borderRadius: 'var(--radius-md)' }}>
              <strong>{selectedReward.name}</strong>
              <div style={{ color: 'var(--color-primary)', fontWeight: 600, marginTop: '0.25rem' }}>
                Costo: {selectedReward.points_cost} punti
              </div>
            </div>
            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setSelectedReward(null)} disabled={isSubmitting}>
                Annulla
              </Button>
              <Button variant="primary" onClick={handleRedeemReward} isLoading={isSubmitting}>
                Conferma Riscatto
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modale Applicazione Offerta */}
      <Modal isOpen={Boolean(selectedOffer)} title="Conferma Applicazione Offerta" onClose={() => setSelectedOffer(null)}>
        {selectedOffer && (
          <div>
            <p>Confermi l'applicazione della seguente offerta al conto del cliente?</p>
            <div style={{ margin: '1rem 0', padding: '0.75rem', background: '#f8fafc', borderRadius: 'var(--radius-md)' }}>
              <strong>{selectedOffer.title}</strong>
              {selectedOffer.description && <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>{selectedOffer.description}</div>}
              {selectedOffer.is_single_use && (
                <div style={{ fontSize: '0.75rem', color: 'var(--color-warning)', fontWeight: 600, marginTop: '0.25rem' }}>
                  ⚠️ Offerta monouso: non potrà essere riutilizzata da questo conto.
                </div>
              )}
            </div>
            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setSelectedOffer(null)} disabled={isSubmitting}>
                Annulla
              </Button>
              <Button variant="primary" onClick={handleRedeemOffer} isLoading={isSubmitting}>
                Applica Offerta
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
