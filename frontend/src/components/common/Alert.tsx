import React from 'react';

export interface AlertProps {
  type?: 'error' | 'success' | 'warning' | 'info';
  message: React.ReactNode;
  status?: number;
  retryAfter?: number;
  className?: string;
  onDismiss?: () => void;
}

export const Alert: React.FC<AlertProps> = ({
  type = 'info',
  message,
  status,
  retryAfter,
  className = '',
  onDismiss,
}) => {
  let contextualPrefix = '';
  if (status === 401) {
    contextualPrefix = 'Sessione non autenticata o scaduta. Effettua nuovamente il login.';
  } else if (status === 403) {
    contextualPrefix = 'Accesso negato: permessi insufficienti o operazione tra commerci diversi non consentita.';
  } else if (status === 409) {
    contextualPrefix = 'Conflitto: la risorsa esiste già o l\'operazione è già stata registrata.';
  } else if (status === 422) {
    contextualPrefix = 'Dati non validi: verifica i campi inseriti.';
  } else if (status === 429) {
    contextualPrefix = `Limite di richieste superato. Riprova${retryAfter ? ` tra ${retryAfter} secondi` : ' più tardi'}.`;
  }

  const alertClass = type === 'error' ? 'alert-danger' : type === 'success' ? 'alert-success' : type === 'warning' ? 'alert-warning' : 'alert-info';

  return (
    <div className={`alert ${alertClass} ${className}`.trim()} role="alert">
      <div style={{ flex: 1 }}>
        {contextualPrefix && <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{contextualPrefix}</div>}
        <div>{message}</div>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: 'inherit', padding: 0 }}
          aria-label="Chiudi avviso"
        >
          ✕
        </button>
      )}
    </div>
  );
};
