import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PublicCardPage } from '../pages/public/PublicCardPage';
import { publicCardApi } from '../api/services';
import { AuthProvider } from '../context/AuthContext';
import type { PublicCardView } from '../types';

describe('Vista Pubblica ed Operativa Adattativa /c/{token}', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Vista Anonima Punti: mostra saldo, premi, zero PII e pulsante Accesso Commerciante', async () => {
    const mockAnonymousPunti: PublicCardView = {
      state: 'active',
      mode: 'public',
      business: { id: 1, name: 'Pasticceria Bellini', slug: 'pasticceria-bellini' },
      loyalty_account: {
        id: 101,
        profile_code: 'punti',
        profile_name: 'Punti',
        balance: 140,
        status: 'active',
      },
      next_reward: {
        id: 5,
        name: 'Vassoio Paste',
        points_cost: 200,
        points_needed: 60,
        progress_percent: 70,
      },
      rewards: [
        { id: 4, business_id: 1, name: 'Caffè Omaggio', description: null, points_cost: 50, card_profile_id: null, status: 'active' },
        { id: 5, business_id: 1, name: 'Vassoio Paste', description: null, points_cost: 200, card_profile_id: null, status: 'active' },
      ],
    };

    vi.spyOn(publicCardApi, 'resolve').mockResolvedValue(mockAnonymousPunti);

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/c/token_punti_123']}>
          <Routes>
            <Route path="/c/:token" element={<PublicCardPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Pasticceria Bellini')).toBeInTheDocument();
      expect(screen.getByText('140')).toBeInTheDocument();
      expect(screen.getByText('Punti Accumulati')).toBeInTheDocument();
      expect(screen.getByText('Prossimo premio: Vassoio Paste')).toBeInTheDocument();
      expect(screen.getByText('Caffè Omaggio')).toBeInTheDocument();
      expect(screen.getByText('🔒 Accesso Commerciante')).toBeInTheDocument();
    });

    // Garanzia di CERO PII: nessun nome, email né telefono
    expect(screen.queryByText(/Titolare Conto/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Mario Rossi/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/@/i)).not.toBeInTheDocument();
  });

  it('2. Vista Anonima VIP: nasconde saldo punti e catalogo punti, mostra offerte VIP e zero PII', async () => {
    const mockAnonymousVip: PublicCardView = {
      state: 'active',
      mode: 'public',
      business: { id: 1, name: 'Ristorante Belvedere', slug: 'ristorante-belvedere' },
      loyalty_account: {
        id: 102,
        profile_code: 'vip',
        profile_name: 'VIP Club',
        status: 'active',
      },
      offers: [
        {
          id: 8,
          business_id: 1,
          title: 'Aperitivo VIP Riservato',
          description: 'Accesso alla sala terrazza',
          discount_type: 'gift',
          discount_value: 0,
          is_vip: true,
          card_profile_id: null,
          is_single_use: true,
          status: 'active',
        },
      ],
    };

    vi.spyOn(publicCardApi, 'resolve').mockResolvedValue(mockAnonymousVip);

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/c/token_vip_999']}>
          <Routes>
            <Route path="/c/:token" element={<PublicCardPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Ristorante Belvedere')).toBeInTheDocument();
      expect(screen.getByText(/Profilo VIP Club/i)).toBeInTheDocument();
      expect(screen.getByText('Aperitivo VIP Riservato')).toBeInTheDocument();
      expect(screen.getByText('VIP')).toBeInTheDocument();
    });

    // Il profilo VIP senza capacità punti non deve mostrare blocchi di saldo punti né catalogo premi
    expect(screen.queryByText('Punti Accumulati')).not.toBeInTheDocument();
    expect(screen.queryByText('Premi Disponibili')).not.toBeInTheDocument();
  });

  it('3. Vista Staff (Ficha Operativa): mostra identificativo consentito e pulsanti di azione', async () => {
    const mockStaffView: PublicCardView = {
      state: 'active',
      mode: 'staff',
      business: { id: 1, name: 'Pasticceria Bellini', slug: 'pasticceria-bellini' },
      loyalty_account: {
        id: 101,
        profile_code: 'vantaggi',
        profile_name: 'Vantaggi',
        balance: 210,
        status: 'active',
      },
      customer: {
        id: 42,
        first_name: 'Giulia',
        last_name: 'Bianchi',
      },
      actions: {
        can_adjust_points: true,
        can_redeem_rewards: true,
        can_redeem_offers: true,
      },
      rewards: [
        { id: 4, business_id: 1, name: 'Caffè Omaggio', description: null, points_cost: 50, card_profile_id: null, status: 'active' },
      ],
    };

    vi.spyOn(publicCardApi, 'resolve').mockResolvedValue(mockStaffView);

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/c/token_staff_123']}>
          <Routes>
            <Route path="/c/:token" element={<PublicCardPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Ficha Operativa Esercente')).toBeInTheDocument();
      expect(screen.getByText('Giulia Bianchi')).toBeInTheDocument();
      expect(screen.getByText('210')).toBeInTheDocument();
      expect(screen.getByText('➕ Gestisci Punti')).toBeInTheDocument();
      expect(screen.getByText('🎁 Riscatta Premio')).toBeInTheDocument();
    });
  });

  it('4. Vista Cross-Tenant: mostra messaggio di accesso negato senza rivelare dati dell\'altro commercio', async () => {
    const mockCrossTenant: PublicCardView = {
      state: 'forbidden',
      mode: 'cross_tenant',
      message: 'Accesso negato.',
    };

    vi.spyOn(publicCardApi, 'resolve').mockResolvedValue(mockCrossTenant);

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/c/token_other_biz']}>
          <Routes>
            <Route path="/c/:token" element={<PublicCardPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/questa carta appartiene a un altro esercizio commerciale/i)).toBeInTheDocument();
    });

    expect(screen.queryByText('Punti Accumulati')).not.toBeInTheDocument();
  });
});
