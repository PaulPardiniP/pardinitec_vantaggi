import React, { useState } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';

export interface QrModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  customerName?: string;
  profileName?: string;
}

export const QrModal: React.FC<QrModalProps> = ({
  isOpen,
  onClose,
  token,
  customerName,
  profileName,
}) => {
  const [copied, setCopied] = useState(false);
  const fullUrl = `${window.location.origin}/c/${token}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // Fallback
      setCopied(false);
    }
  };

  return (
    <Modal isOpen={isOpen} title={`Credenziale Digitale ${profileName ? `(${profileName})` : ''}`} onClose={onClose}>
      <div style={{ textAlign: 'center', padding: '1rem 0' }}>
        {customerName && <p style={{ fontWeight: 600, fontSize: '1.1rem', marginBottom: '0.5rem' }}>{customerName}</p>}
        <p className="page-subtitle" style={{ marginBottom: '1.25rem' }}>
          Il cliente può scansionare questo codice o aprire il link direttamente dal proprio smartphone.
        </p>

        {/* QR Code SVG simulato/renderizzato */}
        <div
          style={{
            margin: '0 auto 1.5rem',
            padding: '1rem',
            background: '#ffffff',
            border: '2px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            display: 'inline-block',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          <svg width="200" height="200" viewBox="0 0 100 100" style={{ display: 'block' }}>
            {/* Standard QR Corner Finders */}
            <rect x="5" y="5" width="26" height="26" fill="#0f172a" />
            <rect x="8" y="8" width="20" height="20" fill="#ffffff" />
            <rect x="11" y="11" width="14" height="14" fill="#0f172a" />

            <rect x="69" y="5" width="26" height="26" fill="#0f172a" />
            <rect x="72" y="8" width="20" height="20" fill="#ffffff" />
            <rect x="75" y="11" width="14" height="14" fill="#0f172a" />

            <rect x="5" y="69" width="26" height="26" fill="#0f172a" />
            <rect x="8" y="72" width="20" height="20" fill="#ffffff" />
            <rect x="11" y="75" width="14" height="14" fill="#0f172a" />

            {/* Simulated Data Grid */}
            <rect x="36" y="8" width="6" height="6" fill="#0f172a" />
            <rect x="46" y="8" width="6" height="6" fill="#0f172a" />
            <rect x="56" y="8" width="6" height="6" fill="#0f172a" />
            <rect x="36" y="18" width="6" height="6" fill="#0f172a" />
            <rect x="48" y="24" width="6" height="6" fill="#0f172a" />
            <rect x="8" y="36" width="6" height="6" fill="#0f172a" />
            <rect x="20" y="42" width="6" height="6" fill="#0f172a" />
            <rect x="36" y="36" width="12" height="12" fill="#0284c7" />
            <rect x="52" y="38" width="8" height="8" fill="#0f172a" />
            <rect x="68" y="42" width="6" height="6" fill="#0f172a" />
            <rect x="82" y="36" width="6" height="6" fill="#0f172a" />
            <rect x="36" y="56" width="8" height="8" fill="#0f172a" />
            <rect x="48" y="60" width="6" height="6" fill="#0f172a" />
            <rect x="64" y="54" width="8" height="8" fill="#0f172a" />
            <rect x="78" y="64" width="6" height="6" fill="#0f172a" />
            <rect x="40" y="74" width="6" height="6" fill="#0f172a" />
            <rect x="54" y="78" width="6" height="6" fill="#0f172a" />
            <rect x="68" y="74" width="8" height="8" fill="#0f172a" />
            <rect x="84" y="80" width="6" height="6" fill="#0f172a" />
          </svg>
        </div>

        <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: 'var(--radius-md)', wordBreak: 'break-all', fontSize: '0.85rem', marginBottom: '1rem', border: '1px solid var(--color-border)' }}>
          <code>{fullUrl}</code>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
          <Button variant={copied ? 'secondary' : 'primary'} onClick={handleCopy}>
            {copied ? '✓ Link Copiato!' : 'Copia Link'}
          </Button>
          <Button variant="outline" onClick={onClose}>
            Chiudi
          </Button>
        </div>
      </div>
    </Modal>
  );
};
