import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QrModal } from '../components/common/QrModal';

describe('Schermata di Consegna Carta Digitale (QrModal)', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    token: 'test_token_abc_123',
    customerName: 'Mario Rossi',
    profileName: 'Vantaggi',
    customerEmail: 'mario.rossi@example.com',
    businessName: 'Pasticceria Bellini',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });

    window.open = vi.fn();
    window.print = vi.fn();
  });

  it('1. Renderizza correttamente tutti i 6 pulsanti di consegna, il nome cliente e l\'avviso di sicurezza', () => {
    render(<QrModal {...defaultProps} />);

    expect(screen.getByText('Mario Rossi')).toBeInTheDocument();
    expect(screen.getByText(/Condividi, scarica o stampa ora: per motivi di sicurezza il link non sarà più recuperabile\./i)).toBeInTheDocument();

    expect(screen.getByRole('button', { name: /Apri carta digitale/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Condividi/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Invia via email/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copia link/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Scarica QR/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Stampa carta \/ QR/i })).toBeInTheDocument();
  });

  it('2. "Apri carta digitale" apre il link /c/{token} in una nuova scheda', () => {
    render(<QrModal {...defaultProps} />);

    const openBtn = screen.getByRole('button', { name: /Apri carta digitale/i });
    fireEvent.click(openBtn);

    expect(window.open).toHaveBeenCalledWith(
      expect.stringContaining('/c/test_token_abc_123'),
      '_blank',
      'noopener,noreferrer'
    );
  });

  it('3. "Condividi" usa navigator.share quando disponibile, altrimenti esegue fallback su Copia link', async () => {
    // Caso A: navigator.share disponibile
    const mockShare = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { share: mockShare });

    const { unmount } = render(<QrModal {...defaultProps} />);
    const shareBtn = screen.getByRole('button', { name: /Condividi/i });
    fireEvent.click(shareBtn);

    expect(mockShare).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining('Pasticceria Bellini'),
        url: expect.stringContaining('/c/test_token_abc_123'),
      })
    );

    unmount();

    // Caso B: navigator.share NON disponibile -> fallback su Copia link
    delete (navigator as any).share;
    render(<QrModal {...defaultProps} />);
    const shareBtnFallback = screen.getByRole('button', { name: /Condividi/i });
    fireEvent.click(shareBtnFallback);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining('/c/test_token_abc_123')
      );
    });
  });

  it('4. "Invia via email" apre mailto precompilato con destinatario, oggetto e link senza allegati', () => {
    let assignedUrl = '';
    delete (window as any).location;
    window.location = {
      ...window.location,
      origin: 'http://localhost:3000',
      set href(val: string) {
        assignedUrl = val;
      },
      get href() {
        return assignedUrl;
      },
    } as any;

    render(<QrModal {...defaultProps} />);

    const emailBtn = screen.getByRole('button', { name: /Invia via email/i });
    fireEvent.click(emailBtn);

    expect(assignedUrl).toMatch(/^mailto:mario\.rossi%40example\.com/);
    expect(assignedUrl).toContain('Pasticceria%20Bellini');
    expect(assignedUrl).toContain('test_token_abc_123');
  });

  it('5. Disabilita "Invia via email" quando il cliente non ha email registrata', () => {
    render(<QrModal {...defaultProps} customerEmail={undefined} />);

    const emailBtn = screen.getByRole('button', { name: /Invia via email/i });
    expect(emailBtn).toBeDisabled();
  });

  it('6. "Copia link" scrive negli appunti e mostra conferma visiva', async () => {
    render(<QrModal {...defaultProps} />);

    const copyBtn = screen.getByRole('button', { name: /Copia link/i });
    fireEvent.click(copyBtn);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('/c/test_token_abc_123')
    );

    expect(await screen.findByText(/✓ Link Copiato!/i)).toBeInTheDocument();
  });

  it('7. "Stampa carta / QR" attiva window.print e il biglietto contiene ZERO dati PII', async () => {
    render(<QrModal {...defaultProps} />);

    await screen.findByTestId('delivery-qr-image');

    const printBtn = screen.getByRole('button', { name: /Stampa carta \/ QR/i });
    expect(printBtn).not.toBeDisabled();
    fireEvent.click(printBtn);

    expect(window.print).toHaveBeenCalled();

    // Verifica sezione stampabile esclusiva
    const printable = screen.getByTestId('printable-ticket');
    expect(printable).toBeInTheDocument();

    // Dati concessi: nome commercio, profilo, link
    expect(printable).toHaveTextContent('Pasticceria Bellini');
    expect(printable).toHaveTextContent('Vantaggi');
    expect(printable).toHaveTextContent('/c/test_token_abc_123');

    // NESSUNA PII: zero nome cliente, zero email
    expect(printable).not.toHaveTextContent('Mario Rossi');
    expect(printable).not.toHaveTextContent('mario.rossi@example.com');
  });

  it('8. "Scarica QR" avvia il download del file PNG quando il QR è pronto', async () => {
    render(<QrModal {...defaultProps} />);

    await screen.findByTestId('delivery-qr-image');

    const downloadBtn = screen.getByRole('button', { name: /Scarica QR/i });
    expect(downloadBtn).not.toBeDisabled();

    const appendSpy = vi.spyOn(document.body, 'appendChild');
    fireEvent.click(downloadBtn);

    expect(appendSpy).toHaveBeenCalled();
  });
});
