import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { invitationApi } from '../../api/services';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Alert } from '../../components/common/Alert';
import { Spinner } from '../../components/common/Spinner';

export const AcceptInvitationPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [isValidating, setIsValidating] = useState(true);
  const [invitationData, setInvitationData] = useState<{
    id: number;
    email: string;
    first_name: string;
    last_name: string;
    business_id: number;
    business_name: string;
    role: string;
    user_exists?: boolean;
  } | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setValidationError('Token di invito non valido o assente.');
      setIsValidating(false);
      return;
    }

    let isMounted = true;
    invitationApi
      .validate(token)
      .then((data) => {
        if (!isMounted) return;
        setInvitationData(data);
        setFirstName(data.first_name || '');
        setLastName(data.last_name || '');
        setIsValidating(false);
      })
      .catch((err: any) => {
        if (!isMounted) return;
        setValidationError(err.message || 'Invito non valido, scaduto o già utilizzato.');
        setIsValidating(false);
      });

    return () => {
      isMounted = false;
    };
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !invitationData) return;

    if (!invitationData.user_exists) {
      if (password.length < 8) {
        setSubmitError('La password deve contenere almeno 8 caratteri.');
        return;
      }

      if (password !== confirmPassword) {
        setSubmitError('Le password non coincidono.');
        return;
      }
    } else {
      if (!password) {
        setSubmitError('Inserisci la tua password per confermare l\'adesione.');
        return;
      }
    }

    if (!acceptedTerms) {
      setSubmitError('È necessario accettare le condizioni d\'uso per procedere.');
      return;
    }

    setSubmitError(null);
    setIsSubmitting(true);

    try {
      await invitationApi.accept(token, password);
      setIsSuccess(true);
    } catch (err: any) {
      setSubmitError(err.message || 'Impossibile completare l\'accettazione dell\'invito.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isValidating) {
    return (
      <div className="login-page">
        <div className="login-card" style={{ textAlign: 'center' }}>
          <Spinner size="lg" text="Verifica dell'invito in corso..." />
        </div>
      </div>
    );
  }

  if (validationError || !invitationData) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-header">
            <h1 className="brand-title">Pardinitec Vantaggi</h1>
            <p className="brand-subtitle">Invito non disponibile</p>
          </div>
          <Alert
            type="error"
            message={validationError || 'L\'invito specificato non è più valido o è scaduto.'}
          />
          <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
              Se ritieni si tratti di un errore, richiedi al gestore del punto vendita di reinviare l'invito.
            </p>
            <Button variant="secondary" onClick={() => navigate('/login')}>
              Torna al Login
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-header">
            <h1 className="brand-title">Pardinitec Vantaggi</h1>
            <p className="brand-subtitle">Account attivato con successo</p>
          </div>
          <Alert
            type="success"
            message={`Benvenuto in ${invitationData.business_name}! Il tuo profilo è stato attivato.`}
          />
          <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '1.25rem' }}>
              Ora puoi accedere alla piattaforma per iniziare ad operare nel punto vendita.
            </p>
            <Button variant="primary" onClick={() => navigate('/login')}>
              Accedi al tuo account
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const roleLabel =
    invitationData.role === 'owner'
      ? 'Titolare'
      : invitationData.role === 'manager'
      ? 'Manager'
      : 'Staff';

  return (
    <div className="login-page">
      <div className="login-card" style={{ maxWidth: '460px' }}>
        <div className="login-header">
          <h1 className="brand-title">Pardinitec Vantaggi</h1>
          <p className="brand-subtitle">
            {invitationData.role === 'owner' ? 'Attivazione Account Titolare' : 'Accettazione Invito Collaboratore'}
          </p>
        </div>

        <div
          style={{
            padding: '0.875rem 1rem',
            marginBottom: '1.25rem',
            background: 'var(--color-surface-subtle, #f8fafc)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Punto vendita:</div>
          <div style={{ fontWeight: 600, fontSize: '1.05rem', color: 'var(--color-primary)' }}>
            {invitationData.business_name}
          </div>
          <div style={{ fontSize: '0.85rem', marginTop: '0.35rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span>Ruolo assegnato:</span>
            <span className="badge badge-primary">{roleLabel}</span>
          </div>
          <div style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
            Email invitata: <strong>{invitationData.email}</strong>
          </div>
        </div>

        {submitError && <Alert type="error" message={submitError} onDismiss={() => setSubmitError(null)} />}

        {invitationData.user_exists ? (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', background: '#eff6ff', padding: '0.65rem', borderRadius: 'var(--radius-sm)', border: '1px solid #bfdbfe' }}>
              ℹ️ Sei già registrato su Pardinitec Vantaggi. Inserisci la tua password attuale per confermare l'adesione a questo punto vendita.
            </div>

            <Input
              label="Password del tuo Account *"
              type="password"
              required
              placeholder="Inserisci la password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.5rem',
                fontSize: '0.85rem',
                cursor: 'pointer',
                marginTop: '0.25rem',
              }}
            >
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                style={{ marginTop: '0.2rem' }}
              />
              <span>
                Accetto l'invito per collaborare con {invitationData.business_name} con il ruolo di {roleLabel}.
              </span>
            </label>

            <Button type="submit" variant="primary" isLoading={isSubmitting} style={{ marginTop: '0.5rem' }}>
              Accetta Invito e Unisciti
            </Button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <Input
                label="Nome"
                placeholder="es. Mario"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                style={{ flex: 1 }}
              />
              <Input
                label="Cognome"
                placeholder="es. Rossi"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                style={{ flex: 1 }}
              />
            </div>

            <Input
              label="Crea Password *"
              type="password"
              required
              placeholder="Almeno 8 caratteri"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              helper="Minimo 8 caratteri, consigliata combinazione di lettere e numeri."
            />

            <Input
              label="Conferma Password *"
              type="password"
              required
              placeholder="Ripeti la password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />

            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.5rem',
                fontSize: '0.85rem',
                cursor: 'pointer',
                marginTop: '0.25rem',
              }}
            >
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                style={{ marginTop: '0.2rem' }}
              />
              <span>
                Confermo di accettare i termini di servizio e di unirmi a {invitationData.business_name} come {roleLabel}.
              </span>
            </label>

            <Button type="submit" variant="primary" isLoading={isSubmitting} style={{ marginTop: '0.5rem' }}>
              Attiva Account e Accedi
            </Button>
          </form>
        )}

        <div style={{ marginTop: '1.25rem', textAlign: 'center', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
          Hai già effettuato l'accesso? <Link to="/login" style={{ color: 'var(--color-primary)' }}>Accedi qui</Link>
        </div>
      </div>
    </div>
  );
};
