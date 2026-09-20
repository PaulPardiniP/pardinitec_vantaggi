import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { loyaltyApi } from '../../api/services';
import type { PublicCardView } from '../../types';
import { Button } from '../../components/common/Button';
import { Modal } from '../../components/common/Modal';
import { Alert } from '../../components/common/Alert';
import { Spinner } from '../../components/common/Spinner';
import { ApiError } from '../../api/client';
import { formatOfferBenefit } from '../../utils/formatters';

export const LoyaltyAccountPreviewPage: React.FC = () => {
  const { accountId } = useParams<{ accountId: string }>();
  const { activeBusiness } = useAuth();

  const [previewData, setPreviewData] = useState<PublicCardView | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | undefined>(undefined);

  // Modali di consultazione
  const [isOffersModalOpen, setIsOffersModalOpen] = useState(false);
  const [isRewardsModalOpen, setIsRewardsModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

  useEffect(() => {
    const fetchPreview = async () => {
      if (!activeBusiness || !accountId) return;
      setIsLoading(true);
      setError(null);
      try {
        const data = await loyaltyApi.getAccountPreview(activeBusiness.id, Number(accountId));
        setPreviewData(data);
      } catch (err: any) {
        if (err instanceof ApiError) {
          setError(err.message);
          setErrorStatus(err.status);
        } else if (err?.message) {
          setError(err.message);
          setErrorStatus(err.status);
        } else {
          setError('Impossibile caricare l\'anteprima della carta.');
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchPreview();
  }, [activeBusiness, accountId]);

  if (isLoading) return <Spinner size="lg" text="Caricamento anteprima carta..." />;

  if (error || !previewData) {
    return (
      <div style={{ maxWidth: '600px', margin: '2rem auto', padding: '1rem' }}>
        <Alert type="error" status={errorStatus} message={error || 'Anteprima non disponibile.'} />
        <div style={{ marginTop: '1rem' }}>
          <Link to="/dashboard/customers" className="btn btn-secondary">
            ← Torna all'elenco clienti
          </Link>
        </div>
      </div>
    );
  }

  const profileCode = previewData.loyalty_account?.profile_code || 'punti';
  const headerClass =
    profileCode === 'vip' ? 'header-vip' : profileCode === 'vantaggi' ? 'header-vantaggi' : 'header-punti';

  const offersCount = previewData.offers?.length || 0;
  const rewardsCount = previewData.rewards?.length || 0;
  const transactionsCount = previewData.recent_transactions?.length || 0;
  const hasPointsCapability = previewData.loyalty_account?.balance !== undefined;

  // Segmentazione rigorosa per profilo: se una funzione non è abilitata per il profilo o non ha elementi, il bottone NON viene renderizzato
  const canShowOffers = profileCode !== 'punti' && offersCount > 0;
  const canShowRewards = rewardsCount > 0;
  const canShowHistory = hasPointsCapability && transactionsCount > 0;
  const customerId = (previewData.loyalty_account as any)?.customer_id;

  return (
    <div style={{ maxWidth: '560px', margin: '0 auto', paddingBottom: '2rem' }}>
      <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link
          to={customerId ? `/dashboard/customers/${customerId}` : '/dashboard/customers'}
          style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', textDecoration: 'none' }}
        >
          ← Torna al cliente
        </Link>
        <span className="badge badge-primary" style={{ fontSize: '0.75rem' }}>
          👁️ Modalità Anteprima
        </span>
      </div>

      <div className="public-card-box" data-testid="loyalty-card-preview">
        {/* Intestazione Carta */}
        <div className={`public-card-header ${headerClass}`}>
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
            Anteprima Interna Commerciante
          </div>

          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0 }}>
            {previewData.business?.name || 'Pardinitec Vantaggi'}
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
              Profilo {previewData.loyalty_account?.profile_name || profileCode.toUpperCase()}
            </span>
          </div>
        </div>

        <div className="public-card-body">
          {/* Avviso Anteprima Carta Digitale */}
          <div
            data-testid="card-preview-notice"
            style={{
              textAlign: 'center',
              marginBottom: '1.25rem',
              background: '#f8fafc',
              border: '2px dashed var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              padding: '1.25rem 1rem',
            }}
          >
            <div style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>📱</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text-main)', marginBottom: '0.25rem' }}>
              Anteprima interna — il QR reale del cliente resta invariato
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: 0, lineHeight: 1.4 }}>
              Questa vista mostra fedelmente il saldo, il catalogo premi e le offerte attive così come appaiono al cliente nella sua schermata digitale.
            </p>
          </div>

          {/* Saldo Punti (Mostrato solo se la capacità 'points' è presente) */}
          {hasPointsCapability && (
            <div className="balance-display">
              <div className="balance-value">{previewData.loyalty_account?.balance ?? 0}</div>
              <div className="balance-label">Punti Accumulati</div>
            </div>
          )}

          {/* Progresso Verso Prossimo Premio */}
          {previewData.next_reward && (
            <div style={{ marginBottom: '1.25rem', background: '#f8fafc', padding: '0.85rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 600 }}>
                <span>Prossimo premio: {previewData.next_reward.name}</span>
                <span>{(previewData.next_reward.progress_percent ?? previewData.next_reward.progress_percentage ?? 0)}%</span>
              </div>
              <div className="progress-bar-bg">
                <div className="progress-bar-fill" style={{ width: `${Math.min(100, Math.max(0, (previewData.next_reward.progress_percent ?? previewData.next_reward.progress_percentage ?? 0)))}%` }} />
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', textAlign: 'right' }}>
                Mancano {previewData.next_reward.points_needed} punti
              </div>
            </div>
          )}

          {/* Pulsanti Grandi Mobile-first per Modali */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {/* 1. Offerte: Solo se abilitato per il profilo e presenti */}
            {canShowOffers && (
              <Button
                variant="outline"
                className="btn-touch"
                style={{ width: '100%', justifyContent: 'space-between', textAlign: 'left' }}
                onClick={() => setIsOffersModalOpen(true)}
              >
                <span>
                  🎁 {profileCode === 'vip' ? 'Offerte Esclusive VIP' : 'Offerte Vantaggi'} ({offersCount})
                </span>
                <span style={{ fontSize: '1.1rem' }}>➔</span>
              </Button>
            )}

            {/* 2. Catalogo Premi: Solo se presenti */}
            {canShowRewards && (
              <Button
                variant="outline"
                className="btn-touch"
                style={{ width: '100%', justifyContent: 'space-between', textAlign: 'left' }}
                onClick={() => setIsRewardsModalOpen(true)}
              >
                <span>
                  🏆 {profileCode === 'vip' ? 'Premi VIP' : 'Premi con Punti'} ({rewardsCount})
                </span>
                <span style={{ fontSize: '1.1rem' }}>➔</span>
              </Button>
            )}

            {/* 3. Storico Punti: Solo se presente capacità punti e movimenti */}
            {canShowHistory && (
              <Button
                variant="outline"
                className="btn-touch"
                style={{ width: '100%', justifyContent: 'space-between', textAlign: 'left' }}
                onClick={() => setIsHistoryModalOpen(true)}
              >
                <span>📜 Storico punti ({transactionsCount})</span>
                <span style={{ fontSize: '1.1rem' }}>➔</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* Modale 1: Offerte e Promozioni                            */}
      {/* ========================================================= */}
      <Modal
        isOpen={isOffersModalOpen}
        title={profileCode === 'vip' ? 'Offerte Esclusive VIP' : 'Offerte Vantaggi'}
        onClose={() => setIsOffersModalOpen(false)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '65vh', overflowY: 'auto' }}>
          {previewData.offers && previewData.offers.length > 0 ? (
            previewData.offers.map((o) => (
              <div
                key={o.id}
                style={{
                  padding: '0.85rem',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  background: o.is_vip ? 'var(--color-vip-light-bg)' : '#ffffff',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '1rem' }}>{o.title}</div>
                    {o.description && (
                      <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: '0.2rem' }}>
                        {o.description}
                      </div>
                    )}
                  </div>
                  <span className="badge badge-primary" style={{ whiteSpace: 'nowrap' }}>
                    {formatOfferBenefit(o.discount_type, o.discount_value)}
                  </span>
                </div>

                <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
                  {o.is_vip && <span className="badge badge-vip">Esclusivo VIP</span>}
                  <span className="badge badge-secondary" style={{ fontSize: '0.75rem' }}>
                    {o.is_single_use ? 'Monouso' : 'Utilizzo multiplo'}
                  </span>
                  {o.end_date && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                      Valida fino al {new Date(o.end_date).toLocaleDateString('it-IT')}
                    </span>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--color-text-muted)' }}>
              Nessuna offerta Vantaggi o VIP disponibile.
            </div>
          )}
        </div>
        <div className="modal-actions">
          <Button variant="secondary" onClick={() => setIsOffersModalOpen(false)}>
            Chiudi
          </Button>
        </div>
      </Modal>

      {/* ========================================================= */}
      {/* Modale 2: Catalogo Premi                                  */}
      {/* ========================================================= */}
      <Modal
        isOpen={isRewardsModalOpen}
        title={profileCode === 'vip' ? 'Premi Esclusivi VIP' : 'Premi riscattabili con punti'}
        onClose={() => setIsRewardsModalOpen(false)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '65vh', overflowY: 'auto' }}>
          {previewData.rewards && previewData.rewards.length > 0 ? (
            previewData.rewards.map((r) => {
              const currentBalance = previewData.loyalty_account?.balance ?? 0;
              const canAfford = currentBalance >= r.points_cost;
              const missingPoints = r.points_cost - currentBalance;

              return (
                <div
                  key={r.id}
                  style={{
                    padding: '0.85rem',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    background: '#ffffff',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '1rem' }}>{r.name}</div>
                      {r.description && (
                        <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: '0.2rem' }}>
                          {r.description}
                        </div>
                      )}
                    </div>
                    <span className="badge badge-primary" style={{ whiteSpace: 'nowrap' }}>
                      {r.points_cost} pt
                    </span>
                  </div>

                  <div style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      {canAfford ? (
                        <span className="badge badge-success" style={{ fontSize: '0.75rem' }}>
                          ✓ Punti sufficienti
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                          Mancano {missingPoints} pt
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--color-text-muted)' }}>
              Nessun premio con punti disponibile.
            </div>
          )}
        </div>
        <div className="modal-actions">
          <Button variant="secondary" onClick={() => setIsRewardsModalOpen(false)}>
            Chiudi
          </Button>
        </div>
      </Modal>

      {/* ========================================================= */}
      {/* Modale 3: Storico Movimenti Punti                         */}
      {/* ========================================================= */}
      <Modal
        isOpen={isHistoryModalOpen}
        title="Storico Movimenti Punti"
        onClose={() => setIsHistoryModalOpen(false)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '65vh', overflowY: 'auto' }}>
          {previewData.recent_transactions && previewData.recent_transactions.length > 0 ? (
            previewData.recent_transactions.map((tx) => {
              const delta = (tx as any).points !== undefined ? (tx as any).points : tx.points_delta;
              const isPositive = (delta ?? 0) >= 0;

              return (
                <div
                  key={tx.id}
                  style={{
                    padding: '0.75rem',
                    borderBottom: '1px solid var(--color-border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                      {tx.reason || (tx.type === 'purchase_amount' ? 'Acquisto spesa' : tx.type === 'reward_redeem' ? 'Riscatto premio' : 'Regolazione punti')}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                      {new Date(tx.created_at).toLocaleString('it-IT')}
                    </div>
                  </div>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: '1rem',
                      color: isPositive ? 'var(--color-success)' : 'var(--color-danger)',
                    }}
                  >
                    {isPositive ? `+${delta}` : delta} pt
                  </div>
                </div>
              );
            })
          ) : (
            <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--color-text-muted)' }}>
              Nessun movimento recente registrato.
            </div>
          )}
        </div>
        <div className="modal-actions">
          <Button variant="secondary" onClick={() => setIsHistoryModalOpen(false)}>
            Chiudi
          </Button>
        </div>
      </Modal>
    </div>
  );
};
