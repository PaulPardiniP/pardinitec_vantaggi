import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { pointsApi, customerApi, loyaltyApi } from '../../api/services';
import type { LoyaltyProgram, PointsTransaction, Customer, LoyaltyAccount } from '../../types';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Alert } from '../../components/common/Alert';
import { Spinner } from '../../components/common/Spinner';
import { Pagination } from '../../components/common/Pagination';
import { EmptyState } from '../../components/common/EmptyState';
import { generateOperationId } from '../../api/client';

export const PointsPage: React.FC = () => {
  const { activeBusiness, role, hasPermission } = useAuth();

  const [program, setProgram] = useState<LoyaltyProgram | null>(null);
  const [isLoadingProgram, setIsLoadingProgram] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'warning'; message: string } | null>(null);

  // Ricerca Cliente
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Customer[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  // Cliente e Conto Selezionati
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [compatibleAccounts, setCompatibleAccounts] = useState<LoyaltyAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<LoyaltyAccount | null>(null);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);

  // Modalità Accredito: 'quick' (predefinito: +1, +5, +10, Altro) | 'receipt' (calcola da scontrino)
  const [creditMode, setCreditMode] = useState<'quick' | 'receipt'>('quick');

  // Input Accredito Rapido - Altro importo
  const [showCustomQuickInput, setShowCustomQuickInput] = useState(false);
  const [customQuickPoints, setCustomQuickPoints] = useState<string>('20');

  // Input Accredito da Spesa (Scontrino)
  const [spentAmount, setSpentAmount] = useState('');
  const [calculatedPoints, setCalculatedPoints] = useState<number | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);

  // Input Sezione Separata: Rettifica Saldo Punti
  const [manualPoints, setManualPoints] = useState<number>(-5);
  const [manualReason, setManualReason] = useState('Correzione errore scontrino');

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Storico Movimenti del Negozio
  const [transactions, setTransactions] = useState<(PointsTransaction & { customer_id?: number; customer_name?: string; customer_phone?: string; profile_name?: string })[]>([]);
  const [txPage, setTxPage] = useState(1);
  const [txTotalPages, setTxTotalPages] = useState(1);
  const [isLoadingTx, setIsLoadingTx] = useState(false);

  const canAdjust = hasPermission('points.adjust');
  const isOwnerOrManager = role === 'owner' || role === 'manager';

  const loadProgram = async () => {
    if (!activeBusiness) return;
    setIsLoadingProgram(true);
    try {
      const prog = await pointsApi.getProgram(activeBusiness.id);
      setProgram(prog);
    } catch {
      setProgram(null);
    } finally {
      setIsLoadingProgram(false);
    }
  };

  const loadTransactions = async (p = 1) => {
    if (!activeBusiness) return;
    setIsLoadingTx(true);
    try {
      const res = await pointsApi.listBusinessTransactions(activeBusiness.id, p, 10);
      setTransactions(res.data);
      setTxPage(res.pagination.page);
      setTxTotalPages(res.pagination.total_pages);
    } catch {
      setTransactions([]);
    } finally {
      setIsLoadingTx(false);
    }
  };

  useEffect(() => {
    loadProgram();
    loadTransactions(1);
  }, [activeBusiness]);

  // Ricerca Clienti
  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeBusiness || !searchQuery.trim()) return;
    setIsSearching(true);
    setHasSearched(true);
    setFeedback(null);
    try {
      const res = await customerApi.list(activeBusiness.id, {
        search: searchQuery.trim(),
        per_page: 10,
      });
      setSearchResults(res.data);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Errore durante la ricerca dei clienti.' });
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Selezione Cliente
  const handleSelectCustomer = async (c: Customer) => {
    if (!activeBusiness) return;
    setSelectedCustomer(c);
    setSearchResults([]);
    setHasSearched(false);
    setIsLoadingAccounts(true);
    setFeedback(null);
    try {
      const accounts = await loyaltyApi.listAccounts(activeBusiness.id, c.id);
      // Filtra conti compatibili con accumulo punti (punti o vantaggi)
      const valid = accounts.filter(
        (a) => a.profile_code === 'punti' || a.profile_code === 'vantaggi' || (a as any).balance !== undefined
      );
      setCompatibleAccounts(valid);
      if (valid.length > 0) {
        setSelectedAccount(valid[0]);
      } else {
        setSelectedAccount(null);
        setFeedback({
          type: 'warning',
          message: 'Il cliente non ha un conto Punti o Vantaggi attivo per questo negozio.',
        });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Errore nel caricamento del conto fedeltà.' });
    } finally {
      setIsLoadingAccounts(false);
    }
  };

  // Reset Selezione Cliente
  const handleResetCustomer = () => {
    setSelectedCustomer(null);
    setSelectedAccount(null);
    setCompatibleAccounts([]);
    setSpentAmount('');
    setCalculatedPoints(null);
    setCalcError(null);
    setShowCustomQuickInput(false);
  };

  // Calcolo Punti Live da Spesa (Modalità Scontrino)
  useEffect(() => {
    if (!activeBusiness || creditMode !== 'receipt') return;
    const amountVal = parseFloat(spentAmount);
    if (isNaN(amountVal) || amountVal <= 0) {
      setCalculatedPoints(null);
      setCalcError(null);
      return;
    }

    let cancel = false;
    const timer = setTimeout(async () => {
      setIsCalculating(true);
      setCalcError(null);
      try {
        const res = await pointsApi.calculate(activeBusiness.id, amountVal);
        if (!cancel) {
          const pts = res.calculated_points ?? res.points ?? 0;
          setCalculatedPoints(pts);
        }
      } catch (err: any) {
        if (!cancel) {
          setCalculatedPoints(null);
          setCalcError(err.message || 'Regola di calcolo non disponibile.');
        }
      } finally {
        if (!cancel) setIsCalculating(false);
      }
    }, 250);

    return () => {
      cancel = true;
      clearTimeout(timer);
    };
  }, [spentAmount, activeBusiness, creditMode]);

  // 1. Accredito Rapido con 1 Clic (+1, +5, +10)
  const handleQuickCredit = async (pts: number) => {
    if (!activeBusiness || !selectedAccount) return;
    setIsSubmitting(true);
    setFeedback(null);

    try {
      const res = await pointsApi.adjust(activeBusiness.id, selectedAccount.id, {
        points: pts,
        reason: 'Accredito rapido punti',
        operation_id: generateOperationId(),
      });

      const newBalance = res.new_balance !== undefined ? res.new_balance : res.balance;
      setFeedback({
        type: 'success',
        message: res.idempotent
          ? 'Operazione già registrata in precedenza.'
          : `+${pts} punti accreditati con successo a ${selectedCustomer?.first_name}! Nuovo saldo: ${newBalance} pt.`,
      });

      setSelectedAccount((prev) => (prev ? { ...prev, balance: newBalance } : null));
      loadTransactions(1);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Errore durante l\'accredito rapido dei punti.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // 2. Accredito Rapido: Altro Importo
  const handleCustomQuickSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBusiness || !selectedAccount) return;

    const pts = parseInt(customQuickPoints, 10);
    if (isNaN(pts) || pts <= 0) {
      setFeedback({ type: 'error', message: 'Inserisci un numero positivo di punti.' });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const res = await pointsApi.adjust(activeBusiness.id, selectedAccount.id, {
        points: pts,
        reason: 'Accredito rapido punti (importo personalizzato)',
        operation_id: generateOperationId(),
      });

      const newBalance = res.new_balance !== undefined ? res.new_balance : res.balance;
      setFeedback({
        type: 'success',
        message: res.idempotent
          ? 'Operazione già registrata in precedenza.'
          : `+${pts} punti accreditati con successo a ${selectedCustomer?.first_name}! Nuovo saldo: ${newBalance} pt.`,
      });

      setSelectedAccount((prev) => (prev ? { ...prev, balance: newBalance } : null));
      setShowCustomQuickInput(false);
      loadTransactions(1);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Errore durante l\'accredito dei punti.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // 3. Accredito da Scontrino (Calcola da scontrino)
  const handleReceiptSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBusiness || !selectedAccount) return;

    const amountVal = parseFloat(spentAmount);
    if (isNaN(amountVal) || amountVal <= 0) {
      setFeedback({ type: 'error', message: 'Inserisci un importo di spesa valido maggiore di zero.' });
      return;
    }
    if (calculatedPoints === null || calculatedPoints <= 0) {
      setFeedback({ type: 'error', message: 'Impossibile determinare i punti per questa spesa.' });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const res = await pointsApi.adjust(activeBusiness.id, selectedAccount.id, {
        points: calculatedPoints,
        reason: `Acquisto in negozio per €${amountVal.toFixed(2)}`,
        operation_id: generateOperationId(),
        spent_amount: amountVal,
      });

      const newBalance = res.new_balance !== undefined ? res.new_balance : res.balance;
      setFeedback({
        type: 'success',
        message: res.idempotent
          ? 'Operazione già registrata in precedenza.'
          : `+${calculatedPoints} punti accreditati con successo per una spesa di €${amountVal.toFixed(2)}! Nuovo saldo: ${newBalance} pt.`,
      });

      setSelectedAccount((prev) => (prev ? { ...prev, balance: newBalance } : null));
      setSpentAmount('');
      setCalculatedPoints(null);
      loadTransactions(1);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Errore durante l\'accredito dei punti da spesa.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // 4. Sezione Separata: Rettifica Saldo Punti
  const handleCorrectionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBusiness || !selectedAccount) return;

    const delta = Number(manualPoints);
    if (isNaN(delta) || delta === 0) {
      setFeedback({ type: 'error', message: 'Inserisci una variazione punti valida e diversa da zero.' });
      return;
    }
    if (!manualReason.trim()) {
      setFeedback({ type: 'error', message: 'La causale per la rettifica punti è obbligatoria.' });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const res = await pointsApi.adjust(activeBusiness.id, selectedAccount.id, {
        points: delta,
        reason: manualReason.trim(),
        operation_id: generateOperationId(),
      });

      const newBalance = res.new_balance !== undefined ? res.new_balance : res.balance;
      setFeedback({
        type: 'success',
        message: res.idempotent
          ? 'Operazione già registrata in precedenza.'
          : `Rettifica di ${delta >= 0 ? '+' + delta : delta} punti registrata con successo! Nuovo saldo: ${newBalance} pt.`,
      });

      setSelectedAccount((prev) => (prev ? { ...prev, balance: newBalance } : null));
      loadTransactions(1);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Errore durante la rettifica punti.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoadingProgram) return <Spinner size="lg" text="Caricamento modulo punti..." />;

  if (!activeBusiness) {
    return (
      <EmptyState
        title="Nessun commercio selezionato"
        description="Seleziona un'attività per accedere alla gestione punti."
      />
    );
  }

  const currentBalance = selectedAccount?.balance ?? 0;
  const previewReceiptNewBalance = Math.max(0, currentBalance + (calculatedPoints ?? 0));
  const previewCorrectionNewBalance = Math.max(0, currentBalance + (manualPoints || 0));
  const programLabel = program ? (program.mode === 'points_per_amount' ? `${program.points_ratio} pt per 1€` : program.mode === 'fixed_per_purchase' ? `${program.fixed_points} pt a scontrino` : 'Accredito manuale') : null;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Accredito e rettifica punti</h1>
          <p className="page-subtitle">
            Cerca il cliente per assegnare punti su una spesa o eseguire una rettifica di saldo.
            {programLabel && <span> Regola attiva: <strong>{programLabel}</strong></span>}
          </p>
        </div>
      </div>

      {feedback && (
        <div style={{ marginBottom: '1.25rem' }}>
          <Alert type={feedback.type} message={feedback.message} onDismiss={() => setFeedback(null)} />
        </div>
      )}

      {/* SEZIONE 1: Selezione Cliente */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 className="card-title">1. Seleziona il cliente</h2>

        {!selectedCustomer ? (
          <div>
            <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              <div style={{ flex: 1, minWidth: '240px' }}>
                <Input
                  placeholder="Cerca per nome, cognome, telefono, email o ID cliente (es. 925)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ margin: 0 }}
                  autoFocus
                />
              </div>
              <Button type="submit" variant="primary" isLoading={isSearching}>
                🔍 Cerca Cliente
              </Button>
            </form>

            {hasSearched && searchResults.length === 0 && !isSearching && (
              <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: 'var(--radius-md)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                Nessun cliente trovato con i criteri inseriti. Verifica il numero di telefono, email o ID.
              </div>
            )}

            {searchResults.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.75rem', marginTop: '1rem' }}>
                {searchResults.map((c) => (
                  <div
                    key={c.id}
                    style={{
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-md)',
                      padding: '0.85rem',
                      background: '#ffffff',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '0.5rem',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                        <strong style={{ fontSize: '1rem' }}>{c.first_name} {c.last_name}</strong>
                        <span className="badge badge-secondary" style={{ fontSize: '0.75rem' }}>ID #{c.id}</span>
                      </div>
                      {c.phone && <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>📞 {c.phone}</div>}
                      {c.email && <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>✉️ {c.email}</div>}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => handleSelectCustomer(c)}>
                      Seleziona Cliente →
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 'var(--radius-md)', padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                <span style={{ fontSize: '1.2rem' }}>👤</span>
                <strong style={{ fontSize: '1.1rem' }}>{selectedCustomer.first_name} {selectedCustomer.last_name}</strong>
                <span className="badge badge-secondary">ID Cliente #{selectedCustomer.id}</span>
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                {selectedCustomer.phone && <span>📞 {selectedCustomer.phone}</span>}
                {selectedCustomer.email && <span>✉️ {selectedCustomer.email}</span>}
              </div>

              {isLoadingAccounts ? (
                <div style={{ marginTop: '0.5rem' }}><Spinner size="sm" text="Caricamento saldo..." /></div>
              ) : selectedAccount ? (
                <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  {compatibleAccounts.length > 1 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Conto:</span>
                      <select
                        className="form-input form-input-sm"
                        value={selectedAccount.id}
                        onChange={(e) => {
                          const acc = compatibleAccounts.find((a) => a.id === Number(e.target.value));
                          if (acc) setSelectedAccount(acc);
                        }}
                      >
                        {compatibleAccounts.map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.profile_name || acc.profile_code} (Saldo: {acc.balance} pt)
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <span className="badge badge-primary">{selectedAccount.profile_name || selectedAccount.profile_code}</span>
                  )}
                  <span style={{ fontSize: '1rem', color: 'var(--color-text-main)' }}>
                    Saldo attuale: <strong style={{ color: 'var(--color-primary)', fontSize: '1.2rem' }}>{selectedAccount.balance} pt</strong>
                  </span>
                </div>
              ) : null}
            </div>

            <Button variant="secondary" size="sm" onClick={handleResetCustomer}>
              🔄 Cambia Cliente
            </Button>
          </div>
        )}
      </div>

      {/* SEZIONE 2: Accredito Punti */}
      {selectedCustomer && selectedAccount && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
            <div>
              <h2 className="card-title" style={{ margin: 0 }}>2. Accredito punti</h2>
              <p className="page-subtitle" style={{ margin: '0.25rem 0 0 0' }}>
                Assegna punti rapidamente con un tocco oppure calcola l'accredito dall'importo scontrino.
              </p>
            </div>

            {/* Toggle Modalità Accredito: Rapido (predefinito) vs Calcola da scontrino (secondario) */}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className={`btn btn-sm ${creditMode === 'quick' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setCreditMode('quick')}
              >
                ⚡ Accredito rapido
              </button>
              <button
                type="button"
                className={`btn btn-sm ${creditMode === 'receipt' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setCreditMode('receipt')}
              >
                🛒 Calcola da scontrino
              </button>
            </div>
          </div>

          {!canAdjust ? (
            <Alert type="warning" message="Non disponi del permesso necessario (points.adjust) per accreditare punti." />
          ) : creditMode === 'quick' ? (
            <div>
              {/* Bottoni Tattili Rapidi Predefiniti */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
                <button
                  type="button"
                  className="btn btn-touch"
                  style={{
                    background: '#ffffff',
                    border: '2px solid #22c55e',
                    color: '#15803d',
                    fontWeight: 800,
                    fontSize: '1.25rem',
                    padding: '1rem 0.5rem',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    boxShadow: 'var(--shadow-sm)',
                    transition: 'all 0.15s ease',
                  }}
                  disabled={isSubmitting}
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
                    padding: '1rem 0.5rem',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    boxShadow: 'var(--shadow-sm)',
                    transition: 'all 0.15s ease',
                  }}
                  disabled={isSubmitting}
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
                    padding: '1rem 0.5rem',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    boxShadow: 'var(--shadow-sm)',
                    transition: 'all 0.15s ease',
                  }}
                  disabled={isSubmitting}
                  onClick={() => handleQuickCredit(10)}
                >
                  +10 pt
                </button>

                <button
                  type="button"
                  className={`btn btn-touch ${showCustomQuickInput ? 'btn-primary' : 'btn-outline'}`}
                  style={{
                    fontWeight: 700,
                    fontSize: '1rem',
                    padding: '1rem 0.5rem',
                    borderRadius: 'var(--radius-md)',
                  }}
                  disabled={isSubmitting}
                  onClick={() => setShowCustomQuickInput(!showCustomQuickInput)}
                >
                  ✍️ Altro importo
                </button>
              </div>

              {/* Form Espandibile per "Altro importo" */}
              {showCustomQuickInput && (
                <form
                  onSubmit={handleCustomQuickSubmit}
                  style={{
                    background: '#f8fafc',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    padding: '1rem',
                    marginBottom: '0.5rem',
                  }}
                >
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                    Quantità di punti da accreditare:
                  </label>
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ maxWidth: '160px' }}>
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        required
                        value={customQuickPoints}
                        onChange={(e) => setCustomQuickPoints(e.target.value)}
                        autoFocus
                        style={{ margin: 0 }}
                      />
                    </div>
                    <Button type="submit" variant="primary" isLoading={isSubmitting}>
                      ✓ Accredita {customQuickPoints || 0} punti
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => setShowCustomQuickInput(false)}>
                      Annulla
                    </Button>
                  </div>
                </form>
              )}
            </div>
          ) : (
            /* Modalità Secondaria: Calcola da scontrino */
            <form onSubmit={handleReceiptSubmit}>
              <div style={{ maxWidth: '320px', marginBottom: '1rem' }}>
                <Input
                  label="Importo Scontrino (€) *"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="es. 25.50"
                  value={spentAmount}
                  onChange={(e) => setSpentAmount(e.target.value)}
                  autoFocus
                />
              </div>

              {calcError && (
                <div style={{ marginBottom: '1rem' }}>
                  {isOwnerOrManager ? (
                    <div style={{ padding: '0.85rem', background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: 'var(--radius-md)' }}>
                      <p style={{ margin: '0 0 0.5rem 0', color: '#92400e', fontSize: '0.9rem' }}>
                        Configura prima la regola di calcolo punti nelle Impostazioni.
                      </p>
                      <Link to="/dashboard/settings" className="btn btn-outline btn-sm">
                        ⚙️ Vai alle Impostazioni
                      </Link>
                    </div>
                  ) : (
                    <Alert
                      type="warning"
                      message="La regola di calcolo punti non è ancora configurata. Contatta il titolare o un responsabile."
                    />
                  )}
                </div>
              )}

              {isCalculating && <div style={{ marginBottom: '1rem' }}><Spinner size="sm" text="Calcolo punti in corso..." /></div>}

              {calculatedPoints !== null && !calcError && (
                <div style={{ background: '#f8fafc', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '1rem', marginBottom: '1.25rem', display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Punti da accreditare:</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-success)' }}>
                      +{calculatedPoints} pt
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Nuovo saldo risultante:</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-primary)' }}>
                      {previewReceiptNewBalance} pt
                    </div>
                  </div>
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                isLoading={isSubmitting}
                disabled={calculatedPoints === null || calculatedPoints <= 0 || Boolean(calcError)}
              >
                ✓ Accredita punti da scontrino
              </Button>
            </form>
          )}
        </div>
      )}

      {/* SEZIONE 3: Rettifica Punti (Sezione Separata) */}
      {selectedCustomer && selectedAccount && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h2 className="card-title">3. Rettifica saldo punti (Correzioni e storni)</h2>
          <p className="page-subtitle">
            Sezione separata riservata a rettifiche speciali, storni o correzioni di errori di cassa con causale obbligatoria.
          </p>

          {!canAdjust ? (
            <Alert type="warning" message="Non disponi del permesso necessario (points.adjust) per effettuare rettifiche." />
          ) : (
            <form onSubmit={handleCorrectionSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                <Input
                  label="Variazione Punti (+ per accredito, - per storno) *"
                  type="number"
                  required
                  value={manualPoints}
                  onChange={(e) => setManualPoints(parseInt(e.target.value, 10) || 0)}
                />
                <Input
                  label="Causale operazione *"
                  required
                  value={manualReason}
                  onChange={(e) => setManualReason(e.target.value)}
                  placeholder="es. Correzione errore scontrino o reso merce"
                />
              </div>

              <div style={{ background: '#f8fafc', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '1rem', marginBottom: '1.25rem', display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Variazione:</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: manualPoints >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                    {manualPoints >= 0 ? `+${manualPoints}` : manualPoints} pt
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Nuovo saldo risultante:</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-primary)' }}>
                    {previewCorrectionNewBalance} pt
                  </div>
                </div>
              </div>

              <Button
                type="submit"
                variant="secondary"
                size="md"
                isLoading={isSubmitting}
                disabled={manualPoints === 0 || !manualReason.trim()}
              >
                ⚙️ Conferma rettifica punti
              </Button>
            </form>
          )}
        </div>
      )}

      {/* SEZIONE 4: Storico Movimenti Negozio */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h2 className="card-title" style={{ margin: 0 }}>Storico movimenti punti</h2>
            <p className="page-subtitle">Registro cronologico delle transazioni punti effettuate in questo negozio.</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => loadTransactions(txPage)} isLoading={isLoadingTx}>
            🔄 Aggiorna
          </Button>
        </div>

        {transactions.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            Nessun movimento punti registrato finora.
          </div>
        ) : (
          <>
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Data & Ora</th>
                    <th>Cliente</th>
                    <th>Profilo</th>
                    <th>Causale</th>
                    <th>Variazione</th>
                    <th>Saldo Finale</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id}>
                      <td>#{tx.id}</td>
                      <td>{new Date(tx.created_at).toLocaleString('it-IT')}</td>
                      <td>
                        <strong>{tx.customer_name || 'Cliente'}</strong>
                        {tx.customer_id && <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginLeft: '0.35rem' }}>(ID #{tx.customer_id})</span>}
                      </td>
                      <td>
                        <span className="badge badge-secondary">{tx.profile_name || 'Punti'}</span>
                      </td>
                      <td>{tx.reason || tx.type}</td>
                      <td>
                        <strong style={{ color: tx.points_delta >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                          {tx.points_delta >= 0 ? `+${tx.points_delta}` : tx.points_delta} pt
                        </strong>
                      </td>
                      <td>
                        <strong>{tx.balance_after} pt</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination page={txPage} totalPages={txTotalPages} onPageChange={(p) => loadTransactions(p)} />
          </>
        )}
      </div>
    </div>
  );
};
