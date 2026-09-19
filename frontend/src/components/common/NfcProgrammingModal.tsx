import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { Modal } from './Modal';
import { Button } from './Button';

export interface NfcProgrammingModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  cardId: number;
  customerName?: string;
  profileName?: string;
  businessName?: string;
}

export const NfcProgrammingModal: React.FC<NfcProgrammingModalProps> = ({
  isOpen,
  onClose,
  token,
  cardId,
  customerName,
  profileName,
  businessName,
}) => {
  const [copied, setCopied] = useState(false);
  const [qrSrc, setQrSrc] = useState<string>('');
  const fullUrl = `${window.location.origin}/c/${token}`;

  useEffect(() => {
    if (token) {
      QRCode.toDataURL(fullUrl, {
        width: 240,
        margin: 1,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      })
        .then((url) => setQrSrc(url))
        .catch(() => setQrSrc(''));
    }
  }, [token, fullUrl]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Modal isOpen={isOpen} title={`Programmazione Carta Fisica #${cardId}`} onClose={onClose}>
      <div style={{ padding: '0.25rem 0' }}>
        <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
          {customerName && (
            <h3 style={{ fontWeight: 700, fontSize: '1.15rem', color: 'var(--color-text)', marginBottom: '0.25rem' }}>
              {customerName}
            </h3>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
            {businessName && (
              <span className="badge badge-secondary" style={{ fontSize: '0.8rem' }}>
                {businessName}
              </span>
            )}
            {profileName && (
              <span className="badge badge-primary" style={{ fontSize: '0.8rem' }}>
                Profilo: {profileName}
              </span>
            )}
          </div>
        </div>

        {/* QR Code */}
        <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
          <div
            style={{
              padding: '0.5rem',
              background: '#ffffff',
              border: '2px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              display: 'inline-block',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            {qrSrc ? (
              <img
                src={qrSrc}
                alt={`QR Code Carta #${cardId}`}
                style={{ width: '160px', height: '160px', display: 'block' }}
              />
            ) : (
              <div style={{ width: '160px', height: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                Caricamento QR...
              </div>
            )}
          </div>
        </div>

        {/* URL Box con Copia */}
        <div style={{ marginBottom: '1rem' }}>
          <label className="form-label" style={{ fontSize: '0.85rem', fontWeight: 600 }}>
            URL da scrivere sul chip NFC della carta:
          </label>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              type="text"
              readOnly
              value={fullUrl}
              className="form-control"
              style={{ fontSize: '0.82rem', background: '#f8fafc', color: 'var(--color-text)' }}
            />
            <Button variant={copied ? 'secondary' : 'primary'} size="sm" onClick={handleCopy} style={{ flexShrink: 0 }}>
              {copied ? '✓ Copiato!' : '📋 Copia URL'}
            </Button>
          </div>
        </div>

        {/* Istruzioni NFC Tools */}
        <div
          style={{
            background: '#f1f5f9',
            borderRadius: 'var(--radius-md)',
            padding: '0.85rem',
            marginBottom: '1rem',
            fontSize: '0.85rem',
            lineHeight: 1.5,
          }}
        >
          <strong style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--color-text)' }}>
            📲 Istruzioni per la scrittura NFC (con NFC Tools):
          </strong>
          <ol style={{ margin: '0 0 0 1.25rem', padding: 0 }}>
            <li>Apri l'app <strong>NFC Tools</strong> su smartphone.</li>
            <li>Tocca <strong>Scrivi</strong> → <strong>Aggiungi un record</strong>.</li>
            <li>Seleziona <strong>URL / URI</strong> e incolla il link copiato sopra.</li>
            <li>Tocca <strong>Scrivi</strong> e avvicina la tessera fisica al retro del telefono finché non compare la conferma.</li>
          </ol>
        </div>

        {/* Avviso di sicurezza */}
        <div
          style={{
            background: '#fffbeb',
            color: '#92400e',
            border: '1px solid #fef3c7',
            borderRadius: 'var(--radius-md)',
            padding: '0.65rem 0.75rem',
            fontSize: '0.8rem',
            fontWeight: 500,
            marginBottom: '1.25rem',
            textAlign: 'center',
          }}
        >
          ⚠️ Questo link viene mostrato una sola volta per la scrittura NFC. La carta non è monouso: può essere utilizzata ripetutamente per tutte le operazioni mentre rimane attiva.
        </div>

        <div className="modal-actions" style={{ marginTop: 0 }}>
          <Button variant="primary" onClick={onClose} style={{ width: '100%' }}>
            ✓ Ho programmato la carta / Chiudi
          </Button>
        </div>
      </div>
    </Modal>
  );
};
