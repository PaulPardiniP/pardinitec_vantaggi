import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import QRCode from 'qrcode';
import { publicCardApi, pointsApi, rewardsApi, offersApi } from '../../api/services';
import type { PublicCardView, Reward, Offer } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Modal } from '../../components/common/Modal';
import { Alert } from '../../components/common/Alert';
import { Spinner } from '../../components/common/Spinner';
import { ApiError, generateOperationId } from '../../api/client';
import { formatOfferBenefit } from '../../utils/formatters';

export const PublicCardPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const { isAuthenticated } = useAuth();

  const [cardData, setCardData] = useState<PublicCardView | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | undefined>(undefined);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);

  // Modali di consultazione (Public + Staff)
  const [isOffersModalOpen, setIsOffersModalOpen] = useState(false);
  const [isRewardsModalOpen, setIsRewardsModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

  useEffect(() => {
    if (token) {
      const fullUrl = `${window.location.origin}/c/${token}`;
      QRCode.toString(fullUrl, {
        type: 'svg',
        margin: 1,
        width: 220,
      })
        .then(setQrSvg)
        .catch(() => setQrSvg(null));
    }
  }, [token]);

  // Modali Operative Staff
  const [isPointsModalOpen, setIsPointsModalOpen] = useState(false);
  const [pointsDelta, setPointsDelta] = useState<number>(10);
  const [pointsReason, setPointsReason] = useState<string>('Acquisto in cassa');
  const [calcAmount, setCalcAmount] = useState<string>('');
  const [pointsModalError, setPointsModalError] = useState<string | null>(null);

  const [selectedReward, setSelectedReward] = useState<Reward | null>(null);
  const [rewardModalError, setRewardModalError] = useState<string | null>(null);

  const [selectedOffer, setSelectedOffer] = useState<Offer | null>(null);
  const [offerModalError, setOfferModalError] = useState<string | null>(null);

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

    const pts = parseInt(String(pointsDelta), 10);
    if (isNaN(pts)) {
      setPointsModalError('Il campo points è obbligatorio e deve essere un numero intero.');
      return;
    }

    setIsSubmitting(true);
    setPointsModalError(null);
    setFeedback(null);
    try {
      const res = await pointsApi.adjust(cardData.business.id, cardData.loyalty_account.id, {
        points: pts,
        reason: pointsReason.trim() || 'Aggiustamento manuale',
        operation_id: generateOperationId(),
      });
      const newBal = res.new_balance !== undefined ? res.new_balance : res.balance;
      setFeedback({
        type: 'success',
        message: res.idempotent
          ? 'Operazione già registrata in precedenza.'
          : `Punti aggiornati con successo! Nuovo saldo: ${newBal} punti.`,
      });
      setIsPointsModalOpen(false);
      setPointsModalError(null);
      await fetchCard();
    } catch (err: any) {
      setPointsModalError(err.message || 'Errore durante l\'aggiornamento dei punti.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 2. Azione: Riscatto Premio
  const handleRedeemReward = async () => {
    if (!cardData?.business?.id || !cardData?.loyalty_account?.id || !selectedReward) return;
    setIsSubmitting(true);
    setRewardModalError(null);
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
      setIsRewardsModalOpen(false);
      setRewardModalError(null);
      await fetchCard();
    } catch (err: any) {
      setRewardModalError(err.message || 'Errore durante il riscatto del premio.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 3. Azione: Riscatto Offerta
  const handleRedeemOffer = async () => {
    if (!cardData?.business?.id || !cardData?.loyalty_account?.id || !selectedOffer) return;
    setIsSubmitting(true);
    setOfferModalError(null);
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
      setIsOffersModalOpen(false);
      setOfferModalError(null);
      await fetchCard();
    } catch (err: any) {
      setOfferModalError(err.message || 'Errore durante l\'applicazione dell\'offerta.');
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
    const isNotFound = errorStatus === 404 || error?.toLowerCase().includes('non trovata') || error?.toLowerCase().includes('non valida');
    const isRevoked = error?.toLowerCase().includes('revoc') || error?.toLowerCase().includes('sostitu');
    return (
      <div className="public-card-container">
        <div className="public-card-box" style={{ padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>{isRevoked ? '🔄' : isNotFound ? '🔍' : '⚠️'}</div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            {isRevoked
              ? 'Carta sostituita'
              : isNotFound
              ? 'Carta non trovata'
              : 'Carta non disponibile'}
          </h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.95rem', lineHeight: 1.5, marginBottom: '1.5rem' }}>
            {isRevoked
              ? 'Questa carta è stata sostituita o revocata. Rivolgiti allo sportello del punto vendita per ottenere il nuovo link.'
              : isNotFound
              ? 'Il codice QR non corrisponde a nessuna carta attiva. Verifica di aver scansionato il QR corretto.'
              : (error || 'Impossibile caricare le informazioni di questa carta. Riprova più tardi.')}
          </p>
          <a href="/" className="btn btn-secondary" style={{ display: 'inline-block' }}>
            ← Torna alla home
          </a>
        </div>
      </div>
    );
  }

  // Stato: Sostituita o Revocata
  if (cardData.state === 'replaced' || cardData.state === 'revoked') {
    return (
      <div className="public-card-container">
        <div className="public-card-box" style={{ padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔄</div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.5rem' }}>Carta sostituita</h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.95rem', lineHeight: 1.5, marginBottom: '1.5rem' }}>
            {cardData.message || 'Questa carta è stata sostituita con una nuova credenziale. Contatta il negozio per il nuovo link.'}
          </p>
          <a href="/" className="btn btn-secondary" style={{ display: 'inline-block' }}>
            ← Torna alla home
          </a>
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

  const offersCount = cardData.offers?.length || 0;
  const rewardsCount = cardData.rewards?.length || 0;
  const transactionsCount = cardData.recent_transactions?.length || 0;
  const hasPointsCapability = cardData.loyalty_account?.balance !== undefined;

  // Segmentazione rigorosa per profilo: se una funzione non è abilitata per il profilo o non ha elementi, il bottone NON viene renderizzato
  const canShowOffers = profileCode !== 'punti' && offersCount > 0;
  const canShowRewards = rewardsCount > 0;
  const canShowHistory = hasPointsCapability && transactionsCount > 0;

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

          {/* Codice QR della Carta Digitale (Mobile-first, compatto e centrato) */}
          <div
            data-testid="card-qr-section"
            style={{
              textAlign: 'center',
              marginBottom: '1.25rem',
              background: '#ffffff',
              border: '2px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              padding: '1.25rem 1rem',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 700, letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
              Codice Carta Digitale
            </div>
            <div
              style={{
                maxWidth: '190px',
                width: '100%',
                margin: '0 auto',
                aspectRatio: '1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {qrSvg ? (
                <img
                  src={`data:image/svg+xml;utf8,${encodeURIComponent(qrSvg)}`}
                  alt="QR Code Carta Digitale"
                  data-testid="card-qr-image"
                  style={{ width: '100%', height: 'auto', display: 'block', maxWidth: '180px' }}
                />
              ) : (
                <div style={{ padding: '2rem 0', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                  Caricamento QR...
                </div>
              )}
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', margin: '0.75rem 0 0 0', lineHeight: 1.4 }}>
              Mostra questo codice in cassa per accumulare punti o utilizzare i tuoi vantaggi.
            </p>
          </div>

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
          {hasPointsCapability && (
            <div className="balance-display">
              <div className="balance-value">{cardData.loyalty_account?.balance ?? 0}</div>
              <div className="balance-label">Punti Accumulati</div>
            </div>
          )}

          {/* Progresso Verso Prossimo Premio */}
          {cardData.next_reward && (
            <div style={{ marginBottom: '1.25rem', background: '#f8fafc', padding: '0.85rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
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

          {/* Azioni Operative del Personale (Staff Quick Actions) */}
          {isStaff && cardData.actions && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                Azioni Rapide di Cassa
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.5rem' }}>
                {cardData.actions.can_adjust_points && (
                  <Button variant="primary" size="md" className="btn-touch" onClick={() => setIsPointsModalOpen(true)}>
                    ➕ Gestisci Punti
                  </Button>
                )}
                {cardData.actions.can_redeem_rewards && rewardsCount > 0 && (
                  <Button
                    variant="secondary"
                    size="md"
                    className="btn-touch"
                    onClick={() => setIsRewardsModalOpen(true)}
                  >
                    🎁 Riscatta Premio
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Bottoni Tattili Verticali (Mobile-First Touch Buttons) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '1.25rem' }}>
            {/* 1. Offerte e Promozioni: Solo se abilitato per il profilo e presenti */}
            {canShowOffers && (
              <Button
                variant="primary"
                className="btn-touch"
                style={{ width: '100%', justifyContent: 'space-between', textAlign: 'left' }}
                onClick={() => setIsOffersModalOpen(true)}
              >
                <span>
                  🎟️ {profileCode === 'vip' ? 'Offerte Esclusive VIP' : 'Offerte Vantaggi'} ({offersCount})
                </span>
                <span style={{ fontSize: '1.1rem' }}>➔</span>
              </Button>
            )}

            {/* 2. Premi Disponibili: Solo se presenti */}
            {canShowRewards && (
              <Button
                variant="secondary"
                className="btn-touch"
                style={{ width: '100%', justifyContent: 'space-between', textAlign: 'left' }}
                onClick={() => setIsRewardsModalOpen(true)}
              >
                <span>
                  🏆 {profileCode === 'vip' ? 'Premi VIP' : 'Vedi premi'} ({rewardsCount})
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

          {/* Accesso Commerciante per visitatori non staff */}
          {!isStaff && (
            <div style={{ textAlign: 'center', marginTop: '1.5rem', borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>
              <Link to={`/login?return_to=/c/${token}`} className="btn btn-outline btn-touch" style={{ width: '100%', maxWidth: '320px', margin: '0 auto' }}>
                🔒 Accesso Commerciante
              </Link>
            </div>
          )}
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
          {cardData.offers && cardData.offers.length > 0 ? (
            cardData.offers.map((o) => (
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

                {isStaff && cardData.actions?.can_redeem_offers && (
                  <div style={{ marginTop: '0.75rem', textAlign: 'right' }}>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        setSelectedOffer(o);
                      }}
                    >
                      Applica Offerta
                    </Button>
                  </div>
                )}
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
          {cardData.rewards && cardData.rewards.length > 0 ? (
            cardData.rewards.map((r) => {
              const currentBalance = cardData.loyalty_account?.balance ?? 0;
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
                    {isStaff && cardData.actions?.can_redeem_rewards && (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={!canAfford}
                        onClick={() => {
                          setSelectedReward(r);
                        }}
                      >
                        Riscatta Premio
                      </Button>
                    )}
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
      {/* Modale 3: Storico Movimenti Punti (Zero PII)               */}
      {/* ========================================================= */}
      <Modal
        isOpen={isHistoryModalOpen}
        title="Storico Movimenti Punti"
        onClose={() => setIsHistoryModalOpen(false)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '65vh', overflowY: 'auto' }}>
          {cardData.recent_transactions && cardData.recent_transactions.length > 0 ? (
            cardData.recent_transactions.map((tx) => {
              const isPositive = tx.points_delta >= 0;
              const formattedDate = tx.created_at
                ? new Date(tx.created_at).toLocaleDateString('it-IT', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '';

              return (
                <div
                  key={tx.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.75rem',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    background: '#f8fafc',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{tx.reason || tx.type || 'Movimento'}</div>
                    {formattedDate && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{formattedDate}</div>
                    )}
                  </div>
                  <strong
                    style={{
                      fontSize: '1rem',
                      color: isPositive ? 'var(--color-success)' : 'var(--color-danger)',
                      whiteSpace: 'nowrap',
                      marginLeft: '0.5rem',
                    }}
                  >
                    {isPositive ? `+${tx.points_delta}` : tx.points_delta} pt
                  </strong>
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

      {/* Modale Staff: Accredito Punti */}
      <Modal
        isOpen={isPointsModalOpen}
        title="Gestione Punti"
        onClose={() => {
          setIsPointsModalOpen(false);
          setPointsModalError(null);
        }}
      >
        <form onSubmit={handleAdjustPoints}>
          {pointsModalError && (
            <div style={{ marginBottom: '1rem' }}>
              <Alert
                type="error"
                message={pointsModalError}
                onDismiss={() => setPointsModalError(null)}
              />
            </div>
          )}

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
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setIsPointsModalOpen(false);
                setPointsModalError(null);
              }}
              disabled={isSubmitting}
            >
              Annulla
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmitting}>
              Conferma Operazione
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modale Staff: Conferma Riscatto Premio */}
      <Modal
        isOpen={Boolean(selectedReward)}
        title="Conferma Riscatto Premio"
        onClose={() => {
          setSelectedReward(null);
          setRewardModalError(null);
        }}
      >
        {selectedReward && (
          <div>
            {rewardModalError && (
              <div style={{ marginBottom: '1rem' }}>
                <Alert
                  type="error"
                  message={rewardModalError}
                  onDismiss={() => setRewardModalError(null)}
                />
              </div>
            )}
            <p>Sei sicuro di voler riscattare il seguente premio per questo cliente?</p>
            <div style={{ margin: '1rem 0', padding: '0.75rem', background: '#f8fafc', borderRadius: 'var(--radius-md)' }}>
              <strong>{selectedReward.name}</strong>
              <div style={{ color: 'var(--color-primary)', fontWeight: 600, marginTop: '0.25rem' }}>
                Costo: {selectedReward.points_cost} punti
              </div>
            </div>
            <div className="modal-actions">
              <Button
                variant="secondary"
                onClick={() => {
                  setSelectedReward(null);
                  setRewardModalError(null);
                }}
                disabled={isSubmitting}
              >
                Annulla
              </Button>
              <Button variant="primary" onClick={handleRedeemReward} isLoading={isSubmitting}>
                Conferma Riscatto
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modale Staff: Conferma Applicazione Offerta */}
      <Modal
        isOpen={Boolean(selectedOffer)}
        title="Conferma Applicazione Offerta"
        onClose={() => {
          setSelectedOffer(null);
          setOfferModalError(null);
        }}
      >
        {selectedOffer && (
          <div>
            {offerModalError && (
              <div style={{ marginBottom: '1rem' }}>
                <Alert
                  type="error"
                  message={offerModalError}
                  onDismiss={() => setOfferModalError(null)}
                />
              </div>
            )}
            <p>Confermi l'applicazione della seguente offerta al conto del cliente?</p>
            <div style={{ margin: '1rem 0', padding: '0.75rem', background: '#f8fafc', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontWeight: 700 }}>{selectedOffer.title}</div>
              <div style={{ marginTop: '0.25rem' }}>
                <span className="badge badge-primary">
                  {formatOfferBenefit(selectedOffer.discount_type, selectedOffer.discount_value)}
                </span>
              </div>
              {selectedOffer.description && <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: '0.4rem' }}>{selectedOffer.description}</div>}
              {selectedOffer.is_single_use && (
                <div style={{ fontSize: '0.75rem', color: 'var(--color-warning)', fontWeight: 600, marginTop: '0.25rem' }}>
                  ⚠️ Offerta monouso: non potrà essere riutilizzata da questo conto.
                </div>
              )}
            </div>
            <div className="modal-actions">
              <Button
                variant="secondary"
                onClick={() => {
                  setSelectedOffer(null);
                  setOfferModalError(null);
                }}
                disabled={isSubmitting}
              >
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
