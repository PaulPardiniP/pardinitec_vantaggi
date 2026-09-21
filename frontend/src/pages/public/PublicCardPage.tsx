import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import QRCode from 'qrcode';
import { publicCardApi, pointsApi, rewardsApi, offersApi, cardsApi, customerApi, loyaltyApi, businessApi } from '../../api/services';
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

  // Stato Pannello Operativo In-Card (Esercente: +1, +5, +10, Altro importo, Da acquisto)
  const [isSubmittingQuickCredit, setIsSubmittingQuickCredit] = useState(false);
  const [quickCreditActiveTab, setQuickCreditActiveTab] = useState<'custom' | 'receipt' | null>(null);
  const [quickCustomPoints, setQuickCustomPoints] = useState<string>('20');
  const [quickReceiptAmount, setQuickReceiptAmount] = useState<string>('');
  const [quickReceiptCalculatedPoints, setQuickReceiptCalculatedPoints] = useState<number | null>(null);
  const [isCalculatingQuickReceipt, setIsCalculatingQuickReceipt] = useState(false);
  const [quickReceiptCalcError, setQuickReceiptCalcError] = useState<string | null>(null);

  // BLOQUEO POR ESCANEO: una sola operazione di accredito per apertura di pagina.
  // scan_session_id è un UUID generato ONCE per ogni caricamento della pagina (nuovo scan NFC/QR).
  // Quando scanSessionUsed=true, tutti i controlli di accredito vengono bloccati.
  // Una nuova apertura (nuovo scan) genera un nuovo UUID e scanSessionUsed=false.
  const [scanSessionId] = useState<string>(() => crypto.randomUUID());
  const [scanSessionUsed, setScanSessionUsed] = useState<boolean>(false);

  // PANNELLO DI ATTIVAZIONE RAPIDA (tessera issued + operatore dello stesso negozio)
  const [activationSearchQuery, setActivationSearchQuery] = useState<string>('');
  const [activationSearchResults, setActivationSearchResults] = useState<any[]>([]);
  const [activationSelectedCustomer, setActivationSelectedCustomer] = useState<any | null>(null);
  const [activationSelectedAccount, setActivationSelectedAccount] = useState<any | null>(null);
  const [activationCustomerAccounts, setActivationCustomerAccounts] = useState<any[]>([]);
  const [isActivationSearching, setIsActivationSearching] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [activationError, setActivationError] = useState<string | null>(null);
  const [businessPackages, setBusinessPackages] = useState<{ punti?: boolean; vantaggi?: boolean; vip?: boolean } | null>(null);
  const [isCreatingAccount, setIsCreatingAccount] = useState<string | null>(null);

  const fetchCard = async (silent = false) => {
    if (!token) return;
    if (!silent) setIsLoading(true);
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
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCard();
  }, [token]);

  // Calcolo punti live per pannello scontrino operatore
  useEffect(() => {
    if (quickCreditActiveTab !== 'receipt' || !cardData?.business?.id) {
      setQuickReceiptCalculatedPoints(null);
      setQuickReceiptCalcError(null);
      return;
    }
    const amt = parseFloat(quickReceiptAmount);
    if (isNaN(amt) || amt <= 0) {
      setQuickReceiptCalculatedPoints(null);
      setQuickReceiptCalcError(null);
      return;
    }

    let cancel = false;
    const timer = setTimeout(async () => {
      const bizId = cardData?.business?.id;
      if (!bizId) return;
      setIsCalculatingQuickReceipt(true);
      setQuickReceiptCalcError(null);
      try {
        const res = await pointsApi.calculate(bizId, amt);
        if (!cancel) {
          const pts = res.calculated_points ?? res.points ?? 0;
          setQuickReceiptCalculatedPoints(pts);
        }
      } catch (err: any) {
        if (!cancel) {
          setQuickReceiptCalculatedPoints(null);
          setQuickReceiptCalcError(err.message || 'Regola di calcolo non disponibile.');
        }
      } finally {
        if (!cancel) setIsCalculatingQuickReceipt(false);
      }
    }, 250);

    return () => {
      cancel = true;
      clearTimeout(timer);
    };
  }, [quickReceiptAmount, quickCreditActiveTab, cardData?.business?.id]);

  // Accredito rapido 1-clic (+1, +5, +10) al banco
  const handleQuickCredit = async (pts: number) => {
    if (!cardData?.business?.id || !cardData?.loyalty_account?.id) return;
    if (scanSessionUsed) return; // bloqueo por sesión de escaneo
    setIsSubmittingQuickCredit(true);
    setFeedback(null);
    try {
      const res = await pointsApi.adjust(cardData.business.id, cardData.loyalty_account.id, {
        points: pts,
        reason: 'Accredito rapido in cassa',
        operation_id: `scan_${scanSessionId}`,
      });
      const newBal = res.new_balance !== undefined ? res.new_balance : res.balance;
      // Aggiornamento immediato dello stato locale senza ricaricare la pagina
      setCardData((prev) => {
        if (!prev || !prev.loyalty_account) return prev;
        return {
          ...prev,
          loyalty_account: {
            ...prev.loyalty_account,
            balance: newBal,
          },
        };
      });
      // BLOQUEO POR ESCANEO: marcar sesión como usada tras operación exitosa
      setScanSessionUsed(true);
      fetchCard(true);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Errore durante l\'accredito dei punti.',
      });
    } finally {
      setIsSubmittingQuickCredit(false);
    }
  };

  // Accredito "Altro importo" al banco
  const handleQuickCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardData?.business?.id || !cardData?.loyalty_account?.id) return;
    if (scanSessionUsed) return;
    const pts = parseInt(quickCustomPoints, 10);
    if (isNaN(pts) || pts <= 0) {
      setFeedback({ type: 'error', message: 'Inserisci un numero positivo di punti.' });
      return;
    }
    setIsSubmittingQuickCredit(true);
    setFeedback(null);
    try {
      const res = await pointsApi.adjust(cardData.business.id, cardData.loyalty_account.id, {
        points: pts,
        reason: 'Accredito punti in cassa (importo manuale)',
        operation_id: `scan_${scanSessionId}`,
      });
      const newBal = res.new_balance !== undefined ? res.new_balance : res.balance;
      setCardData((prev) => {
        if (!prev || !prev.loyalty_account) return prev;
        return {
          ...prev,
          loyalty_account: {
            ...prev.loyalty_account,
            balance: newBal,
          },
        };
      });
      setQuickCreditActiveTab(null);
      // BLOQUEO POR ESCANEO: marcar sesión como usada
      setScanSessionUsed(true);
      fetchCard(true);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Errore durante l\'accredito dei punti.',
      });
    } finally {
      setIsSubmittingQuickCredit(false);
    }
  };

  // Accredito "Da acquisto" (scontrino) al banco
  const handleQuickReceiptSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardData?.business?.id || !cardData?.loyalty_account?.id) return;
    if (scanSessionUsed) return;
    const amt = parseFloat(quickReceiptAmount);
    if (isNaN(amt) || amt <= 0) {
      setFeedback({ type: 'error', message: 'Inserisci un totale spesa valido maggiore di zero.' });
      return;
    }
    if (quickReceiptCalculatedPoints === null || quickReceiptCalculatedPoints <= 0) {
      setFeedback({ type: 'error', message: 'Impossibile calcolare i punti per questo importo.' });
      return;
    }
    setIsSubmittingQuickCredit(true);
    setFeedback(null);
    try {
      const res = await pointsApi.adjust(cardData.business.id, cardData.loyalty_account.id, {
        points: quickReceiptCalculatedPoints,
        reason: `Acquisto in cassa per €${amt.toFixed(2)}`,
        operation_id: `scan_${scanSessionId}`,
        spent_amount: amt,
      });
      const newBal = res.new_balance !== undefined ? res.new_balance : res.balance;
      setCardData((prev) => {
        if (!prev || !prev.loyalty_account) return prev;
        return {
          ...prev,
          loyalty_account: {
            ...prev.loyalty_account,
            balance: newBal,
          },
        };
      });
      setQuickReceiptAmount('');
      setQuickCreditActiveTab(null);
      // BLOQUEO POR ESCANEO: marcar sesión como usada
      setScanSessionUsed(true);
      fetchCard(true);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Errore durante l\'accredito dei punti da scontrino.',
      });
    } finally {
      setIsSubmittingQuickCredit(false);
    }
  };

  // Calcolo punti in anteprima per importo spesa (modale gestione punti)
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

  // Carica i pacchetti/moduli abilitati nel commercio per filtrare i conti creabili
  const loadBusinessPackages = async (bizId: number) => {
    try {
      const res = await businessApi.getPackages(bizId);
      if (res?.packages) {
        setBusinessPackages({
          punti: Boolean(res.packages.punti),
          vantaggi: Boolean(res.packages.vantaggi),
          vip: Boolean(res.packages.vip),
        });
      } else {
        setBusinessPackages({ punti: true, vantaggi: true, vip: false });
      }
    } catch {
      setBusinessPackages({ punti: true, vantaggi: true, vip: false });
    }
  };

  // ATTIVAZIONE RAPIDA AL BANCO: cerca cliente e collega la tessera fisica (issued → active)
  const handleActivationSearch = async () => {
    const bizId = (cardData as any).business_id ?? cardData?.business?.id;
    if (!bizId) return;
    if (!activationSearchQuery.trim()) return;
    setIsActivationSearching(true);
    setActivationError(null);
    setActivationSearchResults([]);
    setActivationSelectedCustomer(null);
    setActivationSelectedAccount(null);
    try {
      const res = await customerApi.list(bizId, { search: activationSearchQuery.trim() });
      setActivationSearchResults(res.data || []);
    } catch (err: any) {
      setActivationError(err.message || 'Errore nella ricerca del cliente.');
    } finally {
      setIsActivationSearching(false);
    }
  };

  const handleActivationSelectCustomer = async (customer: any) => {
    setActivationSelectedCustomer(customer);
    setActivationSelectedAccount(null);
    setActivationCustomerAccounts([]);
    setActivationError(null);
    const bizId = (cardData as any).business_id ?? cardData?.business?.id;
    if (!bizId) return;

    if (!businessPackages) {
      loadBusinessPackages(bizId);
    }

    try {
      const accounts = await loyaltyApi.listAccounts(bizId, customer.id);
      const activeAccounts = (accounts || []).filter((a: any) => a.status === 'active');
      setActivationCustomerAccounts(activeAccounts);
      if (activeAccounts.length === 1) {
        setActivationSelectedAccount(activeAccounts[0]);
      }
    } catch {
      setActivationCustomerAccounts([]);
    }
  };

  const handleCreateAccountForCustomer = async (profileCode: 'punti' | 'vantaggi' | 'vip') => {
    const bizId = (cardData as any).business_id ?? cardData?.business?.id;
    if (!bizId || !activationSelectedCustomer?.id) return;
    setIsCreatingAccount(profileCode);
    setActivationError(null);
    try {
      const newAcc = await loyaltyApi.createAccount(bizId, activationSelectedCustomer.id, profileCode, false);
      const accObj = newAcc.account || newAcc.data || newAcc;
      setActivationCustomerAccounts((prev) => {
        const exists = prev.some((a) => a.id === accObj.id);
        return exists ? prev : [...prev, accObj];
      });
      setActivationSelectedAccount(accObj);
    } catch (err: any) {
      setActivationError(err.message || `Errore durante la creazione del conto ${profileCode.toUpperCase()}.`);
    } finally {
      setIsCreatingAccount(null);
    }
  };

  const handleActivateCard = async () => {
    const bizId = (cardData as any).business_id ?? cardData?.business?.id;
    const cardId = cardData?.card_id;
    if (!bizId || !cardId || !activationSelectedAccount?.id) return;
    setIsActivating(true);
    setActivationError(null);
    try {
      await cardsApi.activate(bizId, cardId, activationSelectedAccount.id);
      setFeedback({
        type: 'success',
        message: 'Carta associata correttamente. Il link NFC è rimasto invariato.',
      });
      // Ricarica la pagina per mostrare la tessera attiva con pannello operativo
      await fetchCard();
    } catch (err: any) {
      setActivationError(err.message || 'Errore durante l\'associazione della carta.');
    } finally {
      setIsActivating(false);
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
  if (cardData.state === 'inventory') {
    return (
      <div className="public-card-container">
        <div className="public-card-box" style={{ padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📦</div>
          <h2 style={{ marginBottom: '0.5rem' }}>Carta in Inventario</h2>
          <p className="page-subtitle">{cardData.message || 'Carta in inventario centrale. Non ancora assegnata a un commercio.'}</p>
        </div>
      </div>
    );
  }

  // Stato: Assegnata al commercio ma non ancora attivata (tessera fisica "vergine")
  if (cardData.state === 'issued') {
    // Operatore del negozio che scansiona la tessera vergine → pannello di attivazione rapida
    if (cardData.mode === 'staff' && cardData.can_activate) {
      const bizName = cardData.business_name ?? (cardData as any).business?.name ?? 'questo commercio';
      return (
        <div className="public-card-container">
          <div className="public-card-box" style={{ padding: '2rem' }}>
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>⚡</div>
              <h2 style={{ marginBottom: '0.25rem', color: '#1e1b4b', fontWeight: 800 }}>Attiva e Associa Carta</h2>
              <p className="page-subtitle" style={{ marginBottom: 0, color: '#4b5563', fontSize: '0.95rem' }}>
                La carta possiede già un link permanente per {bizName}. Seleziona il cliente e il profilo da associare.
              </p>
            </div>

            {activationError && (
              <Alert type="error" message={activationError} onDismiss={() => setActivationError(null)} />
            )}

            {/* Step 1: Cerca cliente */}
            {!activationSelectedCustomer && (
              <div data-testid="activation-search-panel">
                <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.5rem', color: '#111827', fontSize: '1rem' }}>
                  🔍 Cerca cliente da associare:
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                  <Input
                    type="text"
                    placeholder="Nome, cognome, telefono o email..."
                    value={activationSearchQuery}
                    onChange={(e) => setActivationSearchQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleActivationSearch(); } }}
                    style={{ margin: 0, flex: 1, minHeight: '44px', fontSize: '1rem' }}
                  />
                  <Button
                    variant="primary"
                    size="md"
                    style={{ minHeight: '44px', minWidth: '90px', fontWeight: 700 }}
                    isLoading={isActivationSearching}
                    onClick={handleActivationSearch}
                  >
                    Cerca
                  </Button>
                </div>

                {activationSearchResults.length > 0 && (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {activationSearchResults.map((cust: any) => {
                      return (
                        <li key={cust.id} style={{ marginBottom: '0.65rem' }}>
                          <button
                            type="button"
                            data-testid={`activation-select-customer-${cust.id}`}
                            style={{
                              width: '100%',
                              textAlign: 'left',
                              padding: '0.85rem 1rem',
                              minHeight: '48px',
                              border: '1.5px solid #cbd5e1',
                              borderRadius: 'var(--radius-md)',
                              background: '#ffffff',
                              cursor: 'pointer',
                              color: '#111827',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                            }}
                            onClick={() => handleActivationSelectCustomer(cust)}
                          >
                            <div>
                              <div style={{ color: '#111827', fontWeight: 700, fontSize: '1.05rem' }}>
                                👤 {cust.first_name} {cust.last_name}{' '}
                                <span style={{ color: '#4b5563', fontSize: '0.85rem', fontWeight: 500 }}>
                                  (ID: #{cust.id})
                                </span>
                              </div>
                              {cust.phone && (
                                <div style={{ color: '#374151', fontSize: '0.9rem', marginTop: '0.2rem', fontWeight: 500 }}>
                                  📞 {cust.phone}
                                </div>
                              )}
                              {cust.email && (
                                <div style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: '0.1rem' }}>
                                  ✉️ {cust.email}
                                </div>
                              )}
                            </div>
                            <div style={{ color: '#7c3aed', fontWeight: 700, fontSize: '0.9rem' }}>
                              Seleziona →
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {activationSearchResults.length === 0 && !isActivationSearching && activationSearchQuery && (
                  <div
                    style={{
                      padding: '1rem',
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: 'var(--radius-md)',
                      color: '#334155',
                      fontSize: '0.95rem',
                      textAlign: 'center',
                    }}
                  >
                    Nessun cliente trovato. Prova un altro termine di ricerca o verifica i dati inseriti.
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Seleziona conto fedeltà e conferma */}
            {activationSelectedCustomer && (
              <div data-testid="activation-confirm-panel">
                <div style={{ background: '#f5f3ff', border: '1.5px solid #d8b4fe', borderRadius: 'var(--radius-md)', padding: '1rem', marginBottom: '1.25rem' }}>
                  <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#1e1b4b', marginBottom: '0.25rem' }}>
                    👤 {activationSelectedCustomer.first_name} {activationSelectedCustomer.last_name}{' '}
                    <span style={{ fontSize: '0.85rem', color: '#6b7280', fontWeight: 500 }}>(ID: #{activationSelectedCustomer.id})</span>
                  </div>
                  {activationSelectedCustomer.phone && (
                    <div style={{ fontSize: '0.9rem', color: '#374151', fontWeight: 600 }}>📞 {activationSelectedCustomer.phone}</div>
                  )}
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ fontWeight: 700, display: 'block', marginBottom: '0.5rem', color: '#111827', fontSize: '0.95rem' }}>
                    Seleziona conto/profilo da collegare alla carta:
                  </label>
                  {activationCustomerAccounts.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
                      {activationCustomerAccounts.map((acc: any) => {
                        const isAccSelected = activationSelectedAccount?.id === acc.id;
                        const pCode = (acc.profile_code || 'punti').toLowerCase();
                        const pName = acc.profile_name || (pCode === 'vip' ? 'VIP' : pCode === 'vantaggi' ? 'Vantaggi' : 'Punti');
                        return (
                          <button
                            key={acc.id}
                            type="button"
                            onClick={() => setActivationSelectedAccount(acc)}
                            style={{
                              textAlign: 'left',
                              padding: '0.85rem 1rem',
                              minHeight: '48px',
                              borderRadius: 'var(--radius-md)',
                              border: isAccSelected ? '2px solid #7c3aed' : '1.5px solid #cbd5e1',
                              background: isAccSelected ? '#f5f3ff' : '#ffffff',
                              cursor: 'pointer',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                            }}
                          >
                            <div>
                              <span style={{ fontWeight: 700, color: '#111827', fontSize: '1rem' }}>
                                {pCode === 'vip' ? '👑' : pCode === 'vantaggi' ? '🏷️' : '⭐'} Conto {pName}
                              </span>
                              {acc.balance !== undefined && (
                                <span style={{ marginLeft: '0.5rem', color: '#4b5563', fontSize: '0.9rem', fontWeight: 500 }}>
                                  — Saldo: <strong>{acc.balance} pt</strong>
                                </span>
                              )}
                            </div>
                            <div style={{ fontWeight: 700, color: isAccSelected ? '#7c3aed' : '#9ca3af' }}>
                              {isAccSelected ? '✓ Selezionato' : 'Seleziona'}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ padding: '0.75rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 'var(--radius-md)', color: '#92400e', marginBottom: '0.75rem', fontSize: '0.9rem' }}>
                      Il cliente non possiede ancora un conto fedeltà attivo in questo commercio.
                    </div>
                  )}
                </div>

                {/* Creazione rapida conti mancanti abilitati nel commercio */}
                {(() => {
                  const hasPuntiAcc = activationCustomerAccounts.some((a) => (a.profile_code || '').toLowerCase() === 'punti');
                  const hasVantaggiAcc = activationCustomerAccounts.some((a) => (a.profile_code || '').toLowerCase() === 'vantaggi');
                  const hasVipAcc = activationCustomerAccounts.some((a) => (a.profile_code || '').toLowerCase() === 'vip');

                  const allowPunti = businessPackages ? businessPackages.punti !== false : true;
                  const allowVantaggi = businessPackages ? businessPackages.vantaggi === true : false;
                  const allowVip = businessPackages ? businessPackages.vip === true : false;

                  const missingProfiles: Array<{ code: 'punti' | 'vantaggi' | 'vip'; name: string; icon: string }> = [];
                  if (allowPunti && !hasPuntiAcc) missingProfiles.push({ code: 'punti', name: 'Punti', icon: '⭐' });
                  if (allowVantaggi && !hasVantaggiAcc) missingProfiles.push({ code: 'vantaggi', name: 'Vantaggi', icon: '🏷️' });
                  if (allowVip && !hasVipAcc) missingProfiles.push({ code: 'vip', name: 'VIP', icon: '👑' });

                  if (missingProfiles.length === 0) return null;

                  return (
                    <div style={{ marginBottom: '1.25rem' }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#4b5563', marginBottom: '0.35rem' }}>
                        Aggiungi un nuovo conto fedeltà per questo cliente:
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {missingProfiles.map((p) => (
                          <Button
                            key={p.code}
                            type="button"
                            variant="outline"
                            size="sm"
                            style={{ borderColor: '#7c3aed', color: '#7c3aed', fontWeight: 600 }}
                            isLoading={isCreatingAccount === p.code}
                            disabled={Boolean(isCreatingAccount)}
                            onClick={() => handleCreateAccountForCustomer(p.code)}
                          >
                            + Crea conto {p.name}
                          </Button>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
                  <Button
                    variant="primary"
                    size="lg"
                    style={{ flex: 1, minHeight: '48px', fontSize: '1rem', fontWeight: 700 }}
                    isLoading={isActivating}
                    disabled={!activationSelectedAccount}
                    onClick={handleActivateCard}
                    data-testid="activation-confirm-btn"
                  >
                    ⚡ Associa questa carta a {activationSelectedCustomer.first_name}
                  </Button>
                  <Button
                    variant="secondary"
                    size="lg"
                    style={{ minHeight: '48px' }}
                    onClick={() => {
                      setActivationSelectedCustomer(null);
                      setActivationSelectedAccount(null);
                      setActivationCustomerAccounts([]);
                      setActivationError(null);
                    }}
                  >
                    ← Indietro
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    // Anónimo o operatore di altro commercio → messaggio generico
    return (
      <div className="public-card-container">
        <div className="public-card-box" style={{ padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📦</div>
          <h2 style={{ marginBottom: '0.5rem' }}>Carta Non Ancora Attivata</h2>
          <p className="page-subtitle">{cardData.message || 'Rivolgiti al personale del punto vendita per l\'attivazione.'}</p>
          {!isAuthenticated && (
            <div style={{ marginTop: '1.5rem' }}>
              <Link to={`/login?return_to=/c/${token}`} className="btn btn-primary">
                🔒 Accesso Commerciante
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
              <div style={{ fontSize: '1.15rem', fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{cardData.customer.first_name} {cardData.customer.last_name}</span>
                {cardData.customer.id && (
                  <span className="badge badge-secondary" style={{ fontSize: '0.75rem' }}>ID #{cardData.customer.id}</span>
                )}
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
                <span>{(cardData.next_reward.progress_percent ?? cardData.next_reward.progress_percentage ?? 0)}%</span>
              </div>
              <div className="progress-bar-bg">
                <div className="progress-bar-fill" style={{ width: `${Math.min(100, Math.max(0, (cardData.next_reward.progress_percent ?? cardData.next_reward.progress_percentage ?? 0)))}%` }} />
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', textAlign: 'right' }}>
                Mancano {cardData.next_reward.points_needed} punti
              </div>
            </div>
          )}

          {/* Pannello Operativo In-Card per Esercente: Accredito Punti con Bottoni Tattili Grandi */}
          {isStaff && hasPointsCapability && cardData.actions?.can_adjust_points && (
            <div
              data-testid="operator-credit-panel"
              style={{
                marginBottom: '1.25rem',
                background: '#f0fdf4',
                border: '2px solid #86efac',
                borderRadius: 'var(--radius-lg)',
                padding: '1.25rem',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 800, fontSize: '1rem', color: '#166534' }}>
                  <span>⚡</span> Accredita punti al banco
                </div>
                <span className="badge badge-success" style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                  Esercente
                </span>
              </div>

              {/* BLOQUEO POR ESCANEO: messaggio mostrato dopo operazione riuscita */}
              {scanSessionUsed ? (
                <div
                  data-testid="scan-session-locked"
                  style={{
                    background: '#dcfce7',
                    border: '2px solid #16a34a',
                    borderRadius: 'var(--radius-md)',
                    padding: '1rem 1.25rem',
                    textAlign: 'center',
                    color: '#166534',
                    fontWeight: 700,
                    fontSize: '0.95rem',
                    lineHeight: 1.5,
                  }}
                >
                  ✅ Punti registrati correttamente. Rimuovi e riavvicina la carta per effettuare una nuova operazione.
                </div>
              ) : (
                <>

              {/* Bottoni Tattili Grandi: +1, +5, +10 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '0.65rem' }}>
                <button
                  type="button"
                  className="btn btn-touch"
                  style={{
                    background: '#ffffff',
                    border: '2px solid #22c55e',
                    color: '#15803d',
                    fontWeight: 800,
                    fontSize: '1.25rem',
                    padding: '0.85rem 0.25rem',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                    transition: 'all 0.1s ease',
                  }}
                  disabled={isSubmittingQuickCredit}
                  onClick={() => handleQuickCredit(1)}
                >
                  +1 pt
                </button>

                <button
                  type="button"
                  className="btn btn-touch"
                  style={{
                    background: '#ffffff',
                    border: '2px solid #22c55e',
                    color: '#15803d',
                    fontWeight: 800,
                    fontSize: '1.25rem',
                    padding: '0.85rem 0.25rem',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                    transition: 'all 0.1s ease',
                  }}
                  disabled={isSubmittingQuickCredit}
                  onClick={() => handleQuickCredit(5)}
                >
                  +5 pt
                </button>

                <button
                  type="button"
                  className="btn btn-touch"
                  style={{
                    background: '#ffffff',
                    border: '2px solid #22c55e',
                    color: '#15803d',
                    fontWeight: 800,
                    fontSize: '1.25rem',
                    padding: '0.85rem 0.25rem',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                    transition: 'all 0.1s ease',
                  }}
                  disabled={isSubmittingQuickCredit}
                  onClick={() => handleQuickCredit(10)}
                >
                  +10 pt
                </button>
              </div>

              {/* Opzioni: Altro importo | Da acquisto */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <button
                  type="button"
                  className={`btn btn-touch btn-sm ${quickCreditActiveTab === 'custom' ? 'btn-primary' : 'btn-outline'}`}
                  style={{
                    fontWeight: 700,
                    padding: '0.65rem 0.5rem',
                    fontSize: '0.9rem',
                    borderRadius: 'var(--radius-md)',
                  }}
                  disabled={isSubmittingQuickCredit}
                  onClick={() => setQuickCreditActiveTab(quickCreditActiveTab === 'custom' ? null : 'custom')}
                >
                  ✍️ Altro importo
                </button>

                <button
                  type="button"
                  className={`btn btn-touch btn-sm ${quickCreditActiveTab === 'receipt' ? 'btn-primary' : 'btn-outline'}`}
                  style={{
                    fontWeight: 700,
                    padding: '0.65rem 0.5rem',
                    fontSize: '0.9rem',
                    borderRadius: 'var(--radius-md)',
                  }}
                  disabled={isSubmittingQuickCredit}
                  onClick={() => setQuickCreditActiveTab(quickCreditActiveTab === 'receipt' ? null : 'receipt')}
                >
                  🛒 Da acquisto
                </button>
              </div>

              {/* Sottomodalità: Altro importo */}
              {quickCreditActiveTab === 'custom' && (
                <form
                  onSubmit={handleQuickCustomSubmit}
                  style={{
                    marginTop: '0.75rem',
                    padding: '0.75rem',
                    background: '#ffffff',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid #bbf7d0',
                  }}
                >
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                    Punti da accreditare:
                  </label>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '120px' }}>
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        required
                        value={quickCustomPoints}
                        onChange={(e) => setQuickCustomPoints(e.target.value)}
                        placeholder="es. 25"
                        autoFocus
                        style={{ margin: 0 }}
                      />
                    </div>
                    <Button type="submit" variant="primary" size="md" isLoading={isSubmittingQuickCredit}>
                      ✓ Accredita
                    </Button>
                  </div>
                </form>
              )}

              {/* Sottomodalità: Da acquisto */}
              {quickCreditActiveTab === 'receipt' && (
                <form
                  onSubmit={handleQuickReceiptSubmit}
                  style={{
                    marginTop: '0.75rem',
                    padding: '0.75rem',
                    background: '#ffffff',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid #bbf7d0',
                  }}
                >
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                    Totale spesa scontrino (€):
                  </label>
                  <div style={{ marginBottom: '0.5rem' }}>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={quickReceiptAmount}
                      onChange={(e) => setQuickReceiptAmount(e.target.value)}
                      placeholder="es. 45.00"
                      autoFocus
                      style={{ margin: 0 }}
                    />
                  </div>

                  {quickReceiptCalcError && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-danger)', marginBottom: '0.5rem' }}>
                      {quickReceiptCalcError}
                    </div>
                  )}

                  {isCalculatingQuickReceipt && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
                      Calcolo punti in corso...
                    </div>
                  )}

                  {quickReceiptCalculatedPoints !== null && !quickReceiptCalcError && (
                    <div style={{ fontSize: '0.9rem', color: '#166534', fontWeight: 700, marginBottom: '0.5rem' }}>
                      Punti calcolati: +{quickReceiptCalculatedPoints} pt
                    </div>
                  )}

                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    style={{ width: '100%' }}
                    isLoading={isSubmittingQuickCredit}
                    disabled={quickReceiptCalculatedPoints === null || quickReceiptCalculatedPoints <= 0}
                  >
                    ✓ Conferma accredito ({quickReceiptCalculatedPoints ?? 0} pt)
                  </Button>
                </form>
              )}

              {/* Rettifica Manuale Avanzata */}
              <div style={{ marginTop: '0.75rem', textAlign: 'right' }}>
                <button
                  type="button"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-text-muted)',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                  onClick={() => setIsPointsModalOpen(true)}
                >
                  ➕ Gestisci Punti
                </button>
              </div>
              </>
              )}

            </div>
          )}


          {/* Azioni Operative Secondarie: Riscatto Premi (se abilitato e presenti) */}
          {isStaff && cardData.actions?.can_redeem_rewards && rewardsCount > 0 && (
            <div style={{ marginBottom: '1.25rem' }}>
              <Button
                variant="secondary"
                size="md"
                className="btn-touch"
                style={{ width: '100%' }}
                onClick={() => setIsRewardsModalOpen(true)}
              >
                🎁 Riscatta Premio
              </Button>
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
