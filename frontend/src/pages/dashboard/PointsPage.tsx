import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { pointsApi } from '../../api/services';
import type { LoyaltyProgram, PointsTransaction } from '../../types';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Alert } from '../../components/common/Alert';
import { Spinner } from '../../components/common/Spinner';
import { Pagination } from '../../components/common/Pagination';
import { generateOperationId } from '../../api/client';

export const PointsPage: React.FC = () => {
  const { activeBusiness, hasPermission } = useAuth();

  const [program, setProgram] = useState<LoyaltyProgram | null>(null);
  const [transactions, setTransactions] = useState<PointsTransaction[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Calcolatore Spesa
  const [calcAmount, setCalcAmount] = useState('');
  const [calculatedPoints, setCalculatedPoints] = useState<number | null>(null);

  // Form Accredito Manuale
  const [accountId, setAccountId] = useState('');
  const [pointsDelta, setPointsDelta] = useState<number>(10);
  const [reason, setReason] = useState('Acquisto in negozio');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filtro Transazioni per Account
  const [queryAccountId, setQueryAccountId] = useState('');

  const canAdjust = hasPermission('points.adjust');

  const loadData = async () => {
    if (!activeBusiness) return;
    setIsLoading(true);
    try {
      const prog = await pointsApi.getProgram(activeBusiness.id);
      setProgram(prog);
    } catch {
      // Ignora se programma non ancora configurato
    } finally {
      setIsLoading(false);
    }
  };

  const loadTransactions = async (p = 1) => {
    if (!activeBusiness || !queryAccountId) return;
    try {
      const res = await pointsApi.listTransactions(activeBusiness.id, Number(queryAccountId), p, 10);
      setTransactions(res.data);
      setPage(res.pagination.page);
      setTotalPages(res.pagination.total_pages);
    } catch {
      setTransactions([]);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeBusiness]);

  useEffect(() => {
    if (queryAccountId) {
      loadTransactions(1);
    }
  }, [queryAccountId]);

  // Calcola punti prima di confermare
  const handleCalculate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBusiness || !calcAmount) return;
    const val = parseFloat(calcAmount);
    if (isNaN(val) || val <= 0) return;
    try {
      const res = await pointsApi.calculate(activeBusiness.id, val);
      setCalculatedPoints(res.calculated_points);
      setPointsDelta(res.calculated_points);
      setReason(`Spesa di ${val.toFixed(2)} €`);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Errore durante il calcolo dei punti.' });
    }
  };

  // Esegui accredito o rettifica
  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBusiness || !accountId) return;
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await pointsApi.adjust(activeBusiness.id, Number(accountId), {
        points_delta: Number(pointsDelta),
        reason,
        operation_id: generateOperationId(),
      });
      setFeedback({
        type: 'success',
        message: res.idempotent
          ? 'Operazione idempotente: già eseguita in precedenza.'
          : `Punti aggiornati con successo! Nuovo saldo: ${res.new_balance} punti.`,
      });
      setQueryAccountId(accountId);
      loadTransactions(1);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Errore durante l\'aggiornamento dei punti.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <Spinner size="lg" text="Caricamento programma punti..." />;

  const modeLabel =
    program?.mode === 'points_per_amount'
      ? `Proporzionale alla spesa (${program.points_ratio} punti per 1 €)`
      : program?.mode === 'fixed_per_purchase'
      ? `Punti fissi per acquisto (${program.fixed_points} punti a scontrino)`
      : 'Calcolo manuale a discrezione dell\'esercente';

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Gestione & Accredito Punti</h1>
          <p className="page-subtitle">Modalità attiva: <strong>{modeLabel}</strong></p>
        </div>
      </div>

      {feedback && <Alert type={feedback.type} message={feedback.message} onDismiss={() => setFeedback(null)} />}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        {/* Calcolatore Rapido Spesa */}
        <div className="card">
          <h2 className="card-title">1. Calcolatore Spesa</h2>
          <p className="page-subtitle" style={{ marginBottom: '1rem' }}>
            Inserisci l'importo dello scontrino per calcolare i punti secondo le regole attive del tuo negozio.
          </p>

          <form onSubmit={handleCalculate}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <Input
                  label="Importo Scontrino (€)"
                  type="number"
                  step="0.01"
                  placeholder="es. 45.00"
                  value={calcAmount}
                  onChange={(e) => setCalcAmount(e.target.value)}
                />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <Button type="submit" variant="secondary">
                  Calcola
                </Button>
              </div>
            </div>

            {calculatedPoints !== null && (
              <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Punti Calcolati:</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--color-primary)' }}>
                  +{calculatedPoints} pt
                </div>
              </div>
            )}
          </form>
        </div>

        {/* Modulo di Assegnazione o Rettifica Punti */}
        <div className="card">
          <h2 className="card-title">2. Assegna o Rettifica Punti</h2>
          <p className="page-subtitle" style={{ marginBottom: '1rem' }}>
            Applica l'operazione direttamente sul conto del cliente indicando l'ID del conto.
          </p>

          {canAdjust ? (
            <form onSubmit={handleAdjustSubmit}>
              <Input
                label="ID Conto Fedeltà *"
                type="number"
                required
                placeholder="es. 12"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              />

              <Input
                label="Delta Punti (+ per accredito, - per storno) *"
                type="number"
                required
                value={pointsDelta}
                onChange={(e) => setPointsDelta(parseInt(e.target.value, 10) || 0)}
              />

              <Input
                label="Causale Operazione *"
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />

              <div style={{ marginTop: '1.25rem' }}>
                <Button type="submit" variant="primary" style={{ width: '100%' }} isLoading={isSubmitting}>
                  Conferma Accredito / Storno
                </Button>
              </div>
            </form>
          ) : (
            <Alert type="warning" message="Non disponi del permesso necessario (points.adjust) per assegnare o stornare punti." />
          )}
        </div>
      </div>

      {/* Storico Transazioni per Conto */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <h2 className="card-title" style={{ margin: 0 }}>Storico Movimenti per Conto</h2>
            <p className="page-subtitle">Consulta le transazioni del ledger inalterabile di un conto fedeltà.</p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <Input
              type="number"
              placeholder="Inserisci ID Conto..."
              value={queryAccountId}
              onChange={(e) => setQueryAccountId(e.target.value)}
              style={{ margin: 0, width: '180px' }}
            />
            <Button variant="secondary" size="sm" onClick={() => loadTransactions(1)}>
              Carica
            </Button>
          </div>
        </div>

        {!queryAccountId ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            Inserisci l'ID di un conto per visualizzare il registro dei movimenti.
          </div>
        ) : transactions.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            Nessuna transazione trovata per il conto #{queryAccountId}.
          </div>
        ) : (
          <>
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Tipo</th>
                    <th>Causale</th>
                    <th>Variazione</th>
                    <th>Saldo Risultante</th>
                    <th>Data & Ora (UTC)</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id}>
                      <td>#{tx.id}</td>
                      <td>
                        <span className="badge badge-primary">{tx.type}</span>
                      </td>
                      <td>{tx.reason || '—'}</td>
                      <td>
                        <strong style={{ color: tx.points_delta >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                          {tx.points_delta >= 0 ? `+${tx.points_delta}` : tx.points_delta} pt
                        </strong>
                      </td>
                      <td>
                        <strong>{tx.balance_after} pt</strong>
                      </td>
                      <td>{new Date(tx.created_at).toLocaleString('it-IT')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination page={page} totalPages={totalPages} onPageChange={(p) => loadTransactions(p)} />
          </>
        )}
      </div>
    </div>
  );
};
