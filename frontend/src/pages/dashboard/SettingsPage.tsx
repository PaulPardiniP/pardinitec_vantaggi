import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { pointsApi, businessApi } from '../../api/services';
import type { BusinessModule } from '../../types';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Select } from '../../components/common/Select';
import { Alert } from '../../components/common/Alert';
import { Spinner } from '../../components/common/Spinner';

export const SettingsPage: React.FC = () => {
  const { activeBusiness, hasPermission } = useAuth();

  const [modules, setModules] = useState<BusinessModule[]>([]);
  const [mode, setMode] = useState<'fixed_per_purchase' | 'points_per_amount' | 'manual'>('fixed_per_purchase');
  const [pointsRatio, setPointsRatio] = useState<number>(1.0);
  const [fixedPoints, setFixedPoints] = useState<number>(10);
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const canManageSettings = hasPermission('settings.manage');

  const loadSettings = async () => {
    if (!activeBusiness) return;
    setIsLoading(true);
    try {
      const prog = await pointsApi.getProgram(activeBusiness.id);
      setMode(prog.mode);
      setPointsRatio(prog.points_ratio);
      setFixedPoints(prog.fixed_points);
      setDescription(prog.description || '');

      const mods = await businessApi.listModules(activeBusiness.id);
      setModules(mods);
    } catch {
      // Ignora errori
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, [activeBusiness]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBusiness) return;
    setIsSubmitting(true);
    setFeedback(null);
    try {
      await pointsApi.updateProgram(activeBusiness.id, {
        mode,
        points_ratio: Number(pointsRatio),
        fixed_points: Number(fixedPoints),
        description: description.trim() || null,
      });
      setFeedback({ type: 'success', message: 'Regole del programma punti salvate con successo!' });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Errore durante il salvataggio delle impostazioni.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <Spinner size="lg" text="Caricamento impostazioni commercio..." />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Impostazioni & Regole Negozio</h1>
          <p className="page-subtitle">Configura la modalità di calcolo dei punti e consulta i moduli attivi.</p>
        </div>
      </div>

      {feedback && <Alert type={feedback.type} message={feedback.message} onDismiss={() => setFeedback(null)} />}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        {/* Modulo Regole Punti */}
        <div className="card">
          <h2 className="card-title">Regole di Accumulo Punti</h2>
          <p className="page-subtitle" style={{ marginBottom: '1.25rem' }}>
            Definisci come i punti vengono calcolati al momento dell'acquisto in cassa.
          </p>

          <form onSubmit={handleSubmit}>
            <Select
              label="Modalità di Calcolo Punti *"
              disabled={!canManageSettings}
              options={[
                { label: 'Punti fissi per acquisto (scontrino)', value: 'fixed_per_purchase' },
                { label: 'Proporzionale alla spesa (€)', value: 'points_per_amount' },
                { label: 'Manuale (a discrezione dell\'operatore)', value: 'manual' },
              ]}
              value={mode}
              onChange={(e) => setMode(e.target.value as any)}
            />

            {mode === 'points_per_amount' && (
              <Input
                label="Ratio Punti per 1 Euro di Spesa *"
                type="number"
                step="0.1"
                min="0.1"
                disabled={!canManageSettings}
                value={pointsRatio}
                onChange={(e) => setPointsRatio(parseFloat(e.target.value) || 1)}
                helper="es. 1.5 significa 15 punti per 10 euro di spesa."
              />
            )}

            {mode === 'fixed_per_purchase' && (
              <Input
                label="Punti Fissi Assegnati per Scontrino *"
                type="number"
                min="1"
                disabled={!canManageSettings}
                value={fixedPoints}
                onChange={(e) => setFixedPoints(parseInt(e.target.value, 10) || 1)}
                helper="es. 10 punti per ciascun acquisto, indipendentemente dall'importo."
              />
            )}

            <div className="form-group">
              <label className="form-label">Descrizione / Note per i Clienti</label>
              <textarea
                className="form-control"
                rows={2}
                disabled={!canManageSettings}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="es. Accumula 1 punto per ogni euro speso!"
              />
            </div>

            {canManageSettings ? (
              <div style={{ marginTop: '1.25rem' }}>
                <Button type="submit" variant="primary" isLoading={isSubmitting}>
                  Salva Regole Punti
                </Button>
              </div>
            ) : (
              <Alert type="warning" message="Solo il titolare (Owner) o gli utenti autorizzati possono modificare le regole del programma." />
            )}
          </form>
        </div>

        {/* Moduli e Funzionalità Attive */}
        <div className="card">
          <h2 className="card-title">Moduli & Funzionalità Contrattualizzate</h2>
          <p className="page-subtitle" style={{ marginBottom: '1.25rem' }}>
            Elenco delle capacità abilitate per <strong>{activeBusiness?.name}</strong>. L'attivazione di nuovi moduli è gestita dal Super Admin.
          </p>

          {modules.length === 0 ? (
            <p className="page-subtitle">Nessun modulo censito.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {modules.map((m) => (
                <div
                  key={m.code}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.75rem',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    background: m.is_enabled ? '#ffffff' : '#f8fafc',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{m.name}</div>
                    {m.description && <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{m.description}</div>}
                  </div>
                  <span className={`badge ${m.is_enabled ? 'badge-success' : 'badge-warning'}`}>
                    {m.is_enabled ? 'Attivo' : 'Non attivo'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
