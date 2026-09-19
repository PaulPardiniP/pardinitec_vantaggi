import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LoyaltyAccountPreviewPage } from '../pages/dashboard/LoyaltyAccountPreviewPage';
import { loyaltyApi } from '../api/services';

const mockActiveBusiness = {
  id: 10,
  name: 'Pasticceria Roma',
  slug: 'pasticceria-roma',
  status: 'active',
  role: 'owner' as const,
  joined_at: '2026-01-01',
};

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, email: 'admin@test.it', first_name: 'Admin', last_name: 'User', role: 'owner' },
    activeBusiness: mockActiveBusiness,
    isAuthenticated: true,
    isLoading: false,
    hasPermission: () => true,
    hasModule: () => true,
  }),
}));

vi.mock('../api/services', () => ({
  loyaltyApi: {
    getAccountPreview: vi.fn(),
  },
}));

describe('LoyaltyAccountPreviewPage - Anteprima Interna Sicura', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Carica l\'anteprima tramite getAccountPreview senza token né mutazioni di credenziali', async () => {
    const mockPreview = {
      state: 'active',
      mode: 'preview',
      is_preview: true,
      business: { id: 10, name: 'Pasticceria Roma', slug: 'pasticceria-roma' },
      loyalty_account: {
        id: 101,
        customer_id: 55,
        profile_code: 'vantaggi',
        profile_name: 'Vantaggi',
        status: 'active',
        balance: 150,
      },
      next_reward: {
        id: 1,
        name: 'Caffè Speciale',
        points_cost: 200,
        points_needed: 50,
        progress_percent: 75,
      },
      rewards: [
        { id: 1, business_id: 10, name: 'Caffè Speciale', description: 'Caffè con panna', points_cost: 200, is_active: true },
      ],
      offers: [
        {
          id: 5,
          business_id: 10,
          title: 'Sconto 15% Dolci',
          description: 'Valido su tutta la pasticceria',
          discount_type: 'percentage' as const,
          discount_value: 15,
          target_audience: 'vantaggi' as const,
          is_vip: false,
          is_single_use: false,
          status: 'active',
        },
      ],
      recent_transactions: [
        { id: 1, points: 50, points_delta: 50, type: 'purchase_amount', reason: 'Acquisto dolci', created_at: '2026-09-18 12:00:00' },
      ],
    };

    (loyaltyApi.getAccountPreview as any).mockResolvedValue(mockPreview);

    render(
      <MemoryRouter initialEntries={['/dashboard/loyalty-accounts/101/preview']}>
        <Routes>
          <Route path="/dashboard/loyalty-accounts/:accountId/preview" element={<LoyaltyAccountPreviewPage />} />
        </Routes>
      </MemoryRouter>
    );

    // Verifica caricamento e dati
    await waitFor(() => {
      expect(screen.getByTestId('loyalty-card-preview')).toBeInTheDocument();
      expect(screen.getByText('Pasticceria Roma')).toBeInTheDocument();
      expect(screen.getByText(/Profilo Vantaggi/i)).toBeInTheDocument();
      expect(screen.getByText('150')).toBeInTheDocument();
      expect(screen.getByText('Punti Accumulati')).toBeInTheDocument();
    });

    // Verifica blocco informativo QR senza immagini QR reali
    expect(screen.getByTestId('card-preview-notice')).toBeInTheDocument();
    expect(screen.getByText('Anteprima interna — il QR reale del cliente resta invariato')).toBeInTheDocument();
    expect(screen.queryByTestId('card-qr-image')).not.toBeInTheDocument();

    // Verifica presenza bottoni modali
    expect(screen.getByText(/Offerte Vantaggi & VIP/)).toBeInTheDocument();
    expect(screen.getByText(/Premi con Punti/)).toBeInTheDocument();
    expect(screen.getByText(/Storico punti/)).toBeInTheDocument();
  });

  it('2. Apre la modale offerte e mostra le promozioni dedicate', async () => {
    const mockPreview = {
      state: 'active',
      mode: 'preview',
      is_preview: true,
      business: { id: 10, name: 'Pasticceria Roma', slug: 'pasticceria-roma' },
      loyalty_account: {
        id: 102,
        customer_id: 55,
        profile_code: 'vip',
        profile_name: 'VIP Club',
        status: 'active',
      },
      offers: [
        {
          id: 7,
          business_id: 10,
          title: 'Aperitivo Esclusivo',
          description: 'Cocktail omaggio per i membri VIP',
          discount_type: 'fixed' as const,
          discount_value: 10,
          target_audience: 'vip' as const,
          is_vip: true,
          is_single_use: true,
          status: 'active',
        },
      ],
    };

    (loyaltyApi.getAccountPreview as any).mockResolvedValue(mockPreview);

    render(
      <MemoryRouter initialEntries={['/dashboard/loyalty-accounts/102/preview']}>
        <Routes>
          <Route path="/dashboard/loyalty-accounts/:accountId/preview" element={<LoyaltyAccountPreviewPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Offerte Esclusive VIP/)).toBeInTheDocument();
    });

    // Clicca sul pulsante offerte
    fireEvent.click(screen.getByText(/Offerte Esclusive VIP/));

    await waitFor(() => {
      expect(screen.getByText('Aperitivo Esclusivo')).toBeInTheDocument();
      expect(screen.getByText('Cocktail omaggio per i membri VIP')).toBeInTheDocument();
      expect(screen.getByText('Sconto €10,00')).toBeInTheDocument();
      expect(screen.getByText('Esclusivo VIP')).toBeInTheDocument();
    });
  });

  it('3. Gestisce errore 403 o conto inesistente in modo sicuro', async () => {
    (loyaltyApi.getAccountPreview as any).mockRejectedValue({
      status: 403,
      message: 'Accesso negato al conto di fidelizzazione.',
    });

    render(
      <MemoryRouter initialEntries={['/dashboard/loyalty-accounts/999/preview']}>
        <Routes>
          <Route path="/dashboard/loyalty-accounts/:accountId/preview" element={<LoyaltyAccountPreviewPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Accesso negato al conto di fidelizzazione.')).toBeInTheDocument();
      expect(screen.getByText(/Torna all'elenco clienti/)).toBeInTheDocument();
    });
  });
});
