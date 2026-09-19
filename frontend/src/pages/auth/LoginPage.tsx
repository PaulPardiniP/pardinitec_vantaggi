import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Alert } from '../../components/common/Alert';
import { isSafeInternalPath } from '../../components/common/ProtectedRoute';
import { ApiError } from '../../api/client';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | undefined>(undefined);
  const [retryAfter, setRetryAfter] = useState<number | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const rawReturnTo = searchParams.get('return_to') || searchParams.get('continue');
  const returnTo = isSafeInternalPath(rawReturnTo) ? rawReturnTo : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Inserisci sia l\'email che la password.');
      setErrorStatus(422);
      return;
    }

    setError(null);
    setErrorStatus(undefined);
    setRetryAfter(undefined);
    setIsSubmitting(true);

    try {
      const loggedUser = await login(email, password);
      if (loggedUser.session_state === 'pending_2fa_setup') {
        navigate('/2fa?mode=setup', { replace: true });
        return;
      }
      if (loggedUser.session_state === 'pending_2fa') {
        navigate('/2fa', { replace: true });
        return;
      }

      // Reindirizzamento sicuro
      if (returnTo) {
        navigate(returnTo, { replace: true });
      } else if (loggedUser.is_super_admin) {
        navigate('/admin', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    } catch (err: any) {
      if (err instanceof ApiError) {
        setError(err.message);
        setErrorStatus(err.status);
        setRetryAfter(err.retryAfter);
      } else {
        setError(err.message || 'Errore imprevisto durante l\'accesso.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="public-card-container">
      <div className="public-card-box" style={{ maxWidth: '420px' }}>
        <div className="public-card-header">
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Pardinitec Vantaggi</h1>
          <p style={{ opacity: 0.9, fontSize: '0.9rem', marginTop: '0.25rem' }}>Accesso Commercianti e Operatori</p>
        </div>

        <div className="public-card-body">
          {error && (
            <Alert
              type="error"
              message={error}
              status={errorStatus}
              retryAfter={retryAfter}
              onDismiss={() => setError(null)}
            />
          )}

          {returnTo && (
            <div className="alert alert-info" style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>
              ℹ️ Dopo l'accesso verrai reindirizzato direttamente alla scheda della carta.
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <Input
              label="Email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="operatore@esempio.it"
            />

            <Input
              label="Password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />

            <div style={{ marginTop: '1.5rem' }}>
              <Button type="submit" variant="primary" style={{ width: '100%' }} isLoading={isSubmitting}>
                Accedi al Sistema
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
