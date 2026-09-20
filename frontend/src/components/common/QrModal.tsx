import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { Modal } from './Modal';
import { Button } from './Button';

export interface QrModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  customerName?: string;
  profileName?: string;
  customerEmail?: string;
  businessName?: string;
  customerId?: number;
}

export const QrModal: React.FC<QrModalProps> = ({
  isOpen,
  onClose,
  token,
  customerName,
  profileName,
  customerEmail,
  businessName,
  customerId,
}) => {
  const [copied, setCopied] = useState(false);
  const [qrSrc, setQrSrc] = useState<string>('');
  const fullUrl = `${window.location.origin}/c/${token}`;
  const effectiveBizName = businessName || 'Pardinitec Vantaggi';
  const effectiveProfile = profileName || 'Punti';

  useEffect(() => {
    if (token) {
      QRCode.toDataURL(fullUrl, {
        width: 260,
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

  // 1. Apri carta digitale
  const handleOpenCard = () => {
    window.open(fullUrl, '_blank', 'noopener,noreferrer');
  };

  // 2. Copia link
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      setCopied(false);
    }
  };

  // 3. Condividi (Web Share API con fallback automatico a Copia link)
  const handleShare = async () => {
    const shareData = {
      title: `Carta Digitale - ${effectiveBizName}`,
      text: `Ecco la tua carta fedeltà digitale per ${effectiveBizName}:`,
      url: fullUrl,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          return;
        }
      }
    }
    // Fallback se Web Share API non è supportata o fallisce
    await handleCopy();
  };

  // 4. Invia via email (mailto senza allegati impossibili)
  const handleSendEmail = () => {
    if (!customerEmail) return;
    const subject = `La tua carta fedeltà digitale - ${effectiveBizName}`;
    const body = `Gentile ${customerName || 'Cliente'},\n\nEcco il link per accedere alla tua carta fedeltà digitale di ${effectiveBizName}:\n${fullUrl}\n\nMostra il codice QR in cassa ogni volta che effettui un acquisto per accumulare punti e usufruire di sconti e premi esclusivi!\n\nA presto,\n${effectiveBizName}`;
    const mailtoUrl = `mailto:${encodeURIComponent(customerEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailtoUrl;
  };

  // 5. Scarica QR
  const handleDownloadQr = () => {
    if (!qrSrc) return;
    const link = document.createElement('a');
    link.href = qrSrc;
    link.download = `carta-digitale-${token.slice(0, 8)}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 6. Stampa carta / QR
  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      <Modal isOpen={isOpen} title="Consegna Carta Digitale" onClose={onClose}>
        <div style={{ textAlign: 'center', padding: '0.5rem 0' }}>
          {customerName && (
            <h3 style={{ fontWeight: 700, fontSize: '1.2rem', marginBottom: '0.25rem', color: 'var(--color-text)' }}>
              {customerName}
            </h3>
          )}
          {customerId && (
            <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '0.35rem' }}>
              ID Cliente: <strong>#{customerId}</strong>
            </div>
          )}
          {profileName && (
            <div style={{ marginBottom: '0.75rem' }}>
              <span className="badge badge-primary" style={{ fontSize: '0.85rem', padding: '0.25rem 0.6rem' }}>
                Profilo: {profileName}
              </span>
            </div>
          )}
          <p className="page-subtitle" style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>
            Il cliente può scansionare il codice QR o ricevere il link della propria carta digitale.
          </p>

          {/* QR Code Reale Funzionale */}
          <div
            style={{
              margin: '0 auto 1rem',
              padding: '0.75rem',
              background: '#ffffff',
              border: '2px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              display: 'inline-block',
              boxShadow: 'var(--shadow-md)',
            }}
          >
            {qrSrc ? (
              <img
                src={qrSrc}
                alt={`QR Code Carta Digitale per ${customerName || 'Cliente'}`}
                data-testid="delivery-qr-image"
                style={{ width: '190px', height: '190px', display: 'block' }}
              />
            ) : (
              <div style={{ width: '190px', height: '190px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                Caricamento QR...
              </div>
            )}
          </div>

          {/* Enlace pubblico /c/{token} */}
          <div
            style={{
              background: '#f8fafc',
              padding: '0.6rem 0.75rem',
              borderRadius: 'var(--radius-md)',
              wordBreak: 'break-all',
              fontSize: '0.85rem',
              marginBottom: '0.75rem',
              border: '1px solid var(--color-border)',
            }}
          >
            <a href={fullUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
              {fullUrl}
            </a>
          </div>

          {/* Avviso di sicurezza */}
          <div
            data-testid="qr-security-notice"
            style={{
              background: '#fffbeb',
              color: '#92400e',
              border: '1px solid #fef3c7',
              borderRadius: 'var(--radius-md)',
              padding: '0.6rem 0.75rem',
              fontSize: '0.8rem',
              fontWeight: 500,
              lineHeight: 1.4,
              marginBottom: '1.25rem',
              textAlign: 'center',
            }}
          >
            ⚠️ Condividi, scarica o stampa ora: per motivi di sicurezza il link non sarà più recuperabile.
          </div>

          {/* Pulsanti Azione Consegna (Griglia Mobile-First) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {/* Riga 1: Apri e Condividi */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.5rem' }}>
              <Button variant="primary" className="btn-touch" onClick={handleOpenCard}>
                🔗 Apri carta digitale
              </Button>
              <Button variant="secondary" className="btn-touch" onClick={handleShare}>
                📲 Condividi
              </Button>
            </div>

            {/* Riga 2: Invia email e Copia link */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.5rem' }}>
              <Button
                variant="outline"
                className="btn-touch"
                disabled={!customerEmail}
                title={customerEmail ? `Invia a ${customerEmail}` : 'Nessun indirizzo email associato al cliente'}
                onClick={handleSendEmail}
              >
                ✉️ Invia via email
              </Button>
              <Button variant={copied ? 'secondary' : 'outline'} className="btn-touch" onClick={handleCopy}>
                {copied ? '✓ Link Copiato!' : '📋 Copia link'}
              </Button>
            </div>

            {/* Riga 3: Scarica QR e Stampa */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.5rem' }}>
              <Button variant="outline" className="btn-touch" onClick={handleDownloadQr} disabled={!qrSrc}>
                💾 Scarica QR
              </Button>
              <Button variant="outline" className="btn-touch" onClick={handlePrint} disabled={!qrSrc}>
                🖨️ Stampa carta / QR
              </Button>
            </div>

            {/* Chiudi */}
            <div style={{ marginTop: '0.5rem' }}>
              <Button variant="outline" onClick={onClose} style={{ width: '100%' }}>
                Chiudi
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Sezione stampabile pulita: Nome commercio + Profilo + QR + Link (ZERO PII) */}
      <div id="printable-card-ticket" data-testid="printable-ticket" style={{ display: 'none' }}>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: '0 0 0.5rem 0' }}>
          {effectiveBizName}
        </h2>
        <div style={{ fontSize: '0.95rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.5rem', letterSpacing: '0.05em' }}>
          Profilo: {effectiveProfile}
        </div>
        {customerId && (
          <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#334155', marginBottom: '1rem' }}>
            ID Cliente: #{customerId}
          </div>
        )}
        {qrSrc && (
          <img
            src={qrSrc}
            alt="QR Code Carta Fedeltà"
            style={{ width: '180px', height: '180px', display: 'block', margin: '0 auto 1rem' }}
          />
        )}
        <div style={{ fontSize: '0.8rem', color: '#1e293b', wordBreak: 'break-all', marginBottom: '0.5rem', fontWeight: 600 }}>
          {fullUrl}
        </div>
        <p style={{ fontSize: '0.75rem', color: '#475569', margin: 0, lineHeight: 1.3 }}>
          Presenta questo codice in cassa per accumulare punti e usufruire dei tuoi vantaggi esclusivi.
        </p>
      </div>
    </>
  );
};
