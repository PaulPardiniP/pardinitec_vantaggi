import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TwoFactorPage } from '../pages/auth/TwoFactorPage';
import { authApi } from '../api/services';
import * as AuthContextModule from '../context/AuthContext';

describe('TwoFactorPage - Configurazione Iniziale 2FA (Etapa 5)', () => {
  const mockRefreshSession = vi.fn();
  const mockLogout = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: {
        id: 1,
        email: 'admin@pardinitec.local',
        name: 'Paul Admin',
        is_super_admin: true,
        status: 'active',
        created_at: '2026-01-01',
      },
      businesses: [],
      activeBusiness: null,
      role: 'super_admin',
      isSuperAdmin: true,
      isLoading: false,
      isAuthenticated: true,
      sessionState: 'pending_2fa_setup',
      login: vi.fn(),
      logout: mockLogout,
      switchBusiness: vi.fn(),
      selectBusiness: vi.fn(),
      clearActiveBusiness: vi.fn(),
      hasPermission: () => true,
      refreshSession: mockRefreshSession,
    });

    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('1. Mostra il QR code e la chiave segreta manuale PRIMA del campo di inserimento a 6 cifre in /2fa?mode=setup', async () => {
    const mockSetup = {
      uri: 'otpauth://totp/PardinitecVantaggi:admin@pardinitec.local?secret=JBSWY3DPEHPK3PXP&issuer=PardinitecVantaggi',
      secret: 'JBSWY3DPEHPK3PXP',
    };

    vi.spyOn(authApi, 'setup2fa').mockResolvedValue(mockSetup);

    render(
      <MemoryRouter initialEntries={['/2fa?mode=setup']}>
        <TwoFactorPage />
      </MemoryRouter>
    );

    // Deve chiamare l'endpoint di setup
    expect(authApi.setup2fa).toHaveBeenCalledTimes(1);

    // Aspetta che il QR e la chiave segreta siano visibili
    const qrImage = await screen.findByTestId('qr-code-image');
    expect(qrImage).toBeInTheDocument();
    expect(qrImage).toHaveAttribute('alt', 'QR Code 2FA');

    const secretKey = screen.getByTestId('manual-secret-key');
    expect(secretKey).toHaveTextContent('JBSWY3DPEHPK3PXP');

    // Spiegazione delle app di autenticazione in italiano
    expect(
      screen.getAllByText(/Google Authenticator/i).length
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText(/Microsoft Authenticator/i).length
    ).toBeGreaterThanOrEqual(1);

    // Campo di conferma a 6 cifre
    const codeInput = screen.getByPlaceholderText('123456');
    expect(codeInput).toBeInTheDocument();

    // VERIFICA D'ORDINE DOM: QR e Segreto devono precedere il campo di inserimento
    const positionQrVsInput = qrImage.compareDocumentPosition(codeInput);
    expect(positionQrVsInput & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const positionSecretVsInput = secretKey.compareDocumentPosition(codeInput);
    expect(positionSecretVsInput & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('2. Al presionar "Attiva 2FA", verifica il codice, mostra i codici di recupero e consente di copiarli', async () => {
    const mockSetup = {
      uri: 'otpauth://totp/PardinitecVantaggi:admin@pardinitec.local?secret=JBSWY3DPEHPK3PXP&issuer=PardinitecVantaggi',
      secret: 'JBSWY3DPEHPK3PXP',
    };
    const mockVerify = {
      recovery_codes: ['rec1-1111', 'rec2-2222', 'rec3-3333', 'rec4-4444'],
      user: {
        id: 1,
        email: 'admin@pardinitec.local',
        name: 'Paul Admin',
        is_super_admin: true,
        status: 'active',
        created_at: '2026-01-01',
      },
    };

    vi.spyOn(authApi, 'setup2fa').mockResolvedValue(mockSetup);
    vi.spyOn(authApi, 'verify2faSetup').mockResolvedValue(mockVerify);

    render(
      <MemoryRouter initialEntries={['/2fa?mode=setup']}>
        <TwoFactorPage />
      </MemoryRouter>
    );

    const input = await screen.findByPlaceholderText('123456');
    fireEvent.change(input, { target: { value: '654321' } });

    const submitBtn = screen.getByRole('button', { name: /Attiva 2FA/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(authApi.verify2faSetup).toHaveBeenCalledWith('654321');
    });

    // Vista codici di recupero
    expect(await screen.findByText(/2FA attivata con successo!/i)).toBeInTheDocument();
    expect(screen.getByText('rec1-1111')).toBeInTheDocument();
    expect(screen.getByText('rec4-4444')).toBeInTheDocument();

    // Bottone per copiare codici
    const copyBtn = screen.getByRole('button', { name: /Copia tutti i codici/i });
    expect(copyBtn).toBeInTheDocument();
    fireEvent.click(copyBtn);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(mockVerify.recovery_codes.join('\n'));

    // Bottone per proseguire solo dopo aver salvato
    const continueBtn = screen.getByRole('button', { name: /Ho salvato i codici, continua/i });
    expect(continueBtn).toBeInTheDocument();
    fireEvent.click(continueBtn);
    expect(mockRefreshSession).toHaveBeenCalled();
  });

  it('3. Se la chiamata di setup fallisce, mostra l\'errore in italiano e consente di riprovare', async () => {
    vi.spyOn(authApi, 'setup2fa').mockRejectedValue(new Error('Connessione al server non disponibile.'));

    render(
      <MemoryRouter initialEntries={['/2fa?mode=setup']}>
        <TwoFactorPage />
      </MemoryRouter>
    );

    // Deve mostrare l'alert di errore reale
    const errorAlert = await screen.findByText(/Connessione al server non disponibile/i);
    expect(errorAlert).toBeInTheDocument();

    // Bottone per riprovare
    const retryBtn = screen.getByRole('button', { name: /Riprova configurazione/i });
    expect(retryBtn).toBeInTheDocument();
  });
});
