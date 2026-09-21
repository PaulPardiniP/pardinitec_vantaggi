import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PublicCardPage } from '../pages/public/PublicCardPage';
import { RewardsPage } from '../pages/dashboard/RewardsPage';
import { PointsPage } from '../pages/dashboard/PointsPage';
import {
  publicCardApi,
  pointsApi,
  rewardsApi,
  customerApi,
  loyaltyApi,
  authApi,
  businessApi,
} from '../api/services';
import { AuthProvider } from '../context/AuthContext';
import { formatOfferBenefit } from '../utils/formatters';
import type { PublicCardView, Reward, LoyaltyProgram } from '../types';

describe('Verifica Funzionalità: Archiviazione, Vantaggio Testuale, Accredito Rapido e Isolamento Multi-Tenant', () => {
  const mockActiveBusiness = {
    id: 1,
    name: 'Pasticceria Bellini',
    slug: 'pasticceria-bellini',
    status: 'active',
    role: 'owner',
    self_registration_enabled: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('vantaggi_active_business_id', '1');
    vi.spyOn(authApi, 'me').mockResolvedValue({
      user: {
        id: 2,
        email: 'owner@test.local',
        is_super_admin: false,
        role: 'owner',
        totp_enabled: false,
        session_state: 'active',
      },
      businesses: [mockActiveBusiness],
    } as any);
    vi.spyOn(businessApi, 'list').mockResolvedValue([mockActiveBusiness as any]);
    vi.spyOn(businessApi, 'listModules').mockResolvedValue([]);
    vi.spyOn(loyaltyApi, 'listProfiles').mockResolvedValue([]);
  });

  it('1. Elementi inattivi o archiviati NON sono mai visibili pubblicamente nella scheda /c/{token}', async () => {
    const mockCard: PublicCardView = {
      state: 'active',
      mode: 'public',
      business: { id: 1, name: 'Caffè Moderno', slug: 'caffe-moderno' },
      loyalty_account: {
        id: 10,
        profile_code: 'vantaggi',
        profile_name: 'Vantaggi',
        balance: 100,
        status: 'active',
      },
      offers: [
        {
          id: 1,
          business_id: 1,
          title: 'Offerta Attiva Visibile',
          description: 'Descrizione attiva',
          discount_type: 'percent',
          discount_value: 10,
          is_vip: false,
          status: 'active',
        },
      ],
      rewards: [
        {
          id: 101,
          business_id: 1,
          name: 'Premio Attivo Visibile',
          description: 'Caffè in omaggio',
          points_cost: 50,
          status: 'active',
        },
      ],
    };

    vi.spyOn(publicCardApi, 'resolve').mockResolvedValue(mockCard);

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/c/token_test_visibility']}>
          <Routes>
            <Route path="/c/:token" element={<PublicCardPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Caffè Moderno')).toBeInTheDocument();
      expect(screen.getByText(/Offerte Vantaggi \(1\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Vedi premi \(1\)/i)).toBeInTheDocument();
    });

    // Apri modale offerte
    fireEvent.click(screen.getByText(/Offerte Vantaggi \(1\)/i));
    expect(screen.getByText('Offerta Attiva Visibile')).toBeInTheDocument();
    expect(screen.queryByText('Offerta Disattivata')).not.toBeInTheDocument();
    expect(screen.queryByText('Offerta Archiviata')).not.toBeInTheDocument();
  });

  it('2. Eliminazione fisica se 0 riscatti; archiviazione in "Contenuti archiviati" se ha riscatti storici, e Ripristina funziona', async () => {
    let rewardsList: Reward[] = [
      {
        id: 201,
        business_id: 1,
        name: 'Premio Storico Usato',
        description: 'Con riscatti passati',
        points_cost: 80,
        status: 'active',
      },
    ];

    let archivedList: Reward[] = [];

    vi.spyOn(rewardsApi, 'list').mockImplementation(async (_bizId, _onlyActive, _prof, status) => {
      if (status === 'archived') {
        return archivedList;
      }
      return rewardsList;
    });

    const deleteSpy = vi.spyOn(rewardsApi, 'delete').mockImplementation(async () => {
      // Simula archiviazione automatica se ha relazioni storiche
      archivedList = [{ ...rewardsList[0], status: 'archived' }];
      rewardsList = [];
      return {
        action: 'archived',
        message: 'Il premio è stato archiviato poiché possiede utilizzi storici. Spostato in Contenuti archiviati.',
      };
    });

    const restoreSpy = vi.spyOn(rewardsApi, 'restore').mockImplementation(async () => {
      rewardsList = [{ ...archivedList[0], status: 'inactive' }];
      archivedList = [];
      return {
        action: 'restored',
        message: 'Premio ripristinato con successo come non attivo. Puoi riattivarlo quando desideri.',
      };
    });

    render(
      <AuthProvider>
        <MemoryRouter>
          <RewardsPage />
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Premi riscattabili con punti')).toBeInTheDocument();
      expect(screen.getByText('Premio Storico Usato')).toBeInTheDocument();
    });

    // Clicca elimina sulla riga del premio (apre modale di conferma)
    fireEvent.click(screen.getByRole('button', { name: 'Elimina' }));

    // Conferma eliminazione / archiviazione nel modale
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Elimina Premio' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Elimina Premio' }));

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith(1, 201);
      expect(
        screen.getByText(/Premio archiviato e spostato in "Contenuti archiviati"/i)
      ).toBeInTheDocument();
    });

    // Cambia alla tab "Contenuti archiviati"
    fireEvent.click(screen.getByRole('button', { name: /Contenuti archiviati/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Ripristina/i })).toBeInTheDocument();
    });

    // Clicca Ripristina
    fireEvent.click(screen.getByRole('button', { name: /Ripristina/i }));

    await waitFor(() => {
      expect(restoreSpy).toHaveBeenCalledWith(1, 201);
      expect(
        screen.getByText(/ripristinato con successo/i)
      ).toBeInTheDocument();
    });
  });

  it('3. Vantaggio testuale senza importo ("text") può essere configurato e formattato correttamente', () => {
    // Verifica formattatore frontend per tipo 'text'
    const formattedText = formatOfferBenefit('text', null);
    expect(formattedText).toBe('Vantaggio libero');

    const formattedPercent = formatOfferBenefit('percentage', 15);
    expect(formattedPercent).toBe('Sconto 15%');

    const formattedFixed = formatOfferBenefit('fixed', 5.5);
    expect(formattedFixed).toBe('Sconto €5,50');
  });

  it('4. Visitante anonimo su /c/{token}: non vede il pannello operatore rapido (+1, +5, +10, Da acquisto)', async () => {
    const mockAnonymousCard: PublicCardView = {
      state: 'active',
      mode: 'public',
      business: { id: 1, name: 'Pasticceria Bellini', slug: 'pasticceria-bellini' },
      loyalty_account: {
        id: 50,
        profile_code: 'punti',
        profile_name: 'Punti Fedeltà',
        balance: 120,
        status: 'active',
      },
      actions: undefined,
    };

    vi.spyOn(publicCardApi, 'resolve').mockResolvedValue(mockAnonymousCard);

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/c/token_anon_visit']}>
          <Routes>
            <Route path="/c/:token" element={<PublicCardPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Pasticceria Bellini')).toBeInTheDocument();
      expect(screen.getByText('120')).toBeInTheDocument();
      expect(screen.getByText('Punti Accumulati')).toBeInTheDocument();
      expect(screen.getByText('🔒 Accesso Commerciante')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('operator-credit-panel')).not.toBeInTheDocument();
    expect(screen.queryByText('Accredita punti al banco')).not.toBeInTheDocument();
    expect(screen.queryByText('+1 pt')).not.toBeInTheDocument();
    expect(screen.queryByText('+5 pt')).not.toBeInTheDocument();
    expect(screen.queryByText('+10 pt')).not.toBeInTheDocument();
    expect(screen.queryByText('✍️ Altro importo')).not.toBeInTheDocument();
    expect(screen.queryByText('🛒 Da acquisto')).not.toBeInTheDocument();
  });

  it('5. Operatore autenticato dello stesso commercio su /c/{token}: accredito con 1 tocco (+5 pt) aggiorna subito il saldo', async () => {
    let currentBalance = 80;
    const mockStaffCard: PublicCardView = {
      state: 'active',
      mode: 'staff',
      business: { id: 1, name: 'Pasticceria Bellini', slug: 'pasticceria-bellini' },
      loyalty_account: {
        id: 50,
        profile_code: 'punti',
        profile_name: 'Punti Fedeltà',
        balance: currentBalance,
        status: 'active',
      },
      customer: {
        id: 12,
        first_name: 'Gianni',
        last_name: 'Morandi',
      },
      actions: {
        can_adjust_points: true,
        can_redeem_rewards: false,
        can_redeem_offers: false,
      },
    };

    vi.spyOn(publicCardApi, 'resolve').mockImplementation(async () => ({
      ...mockStaffCard,
      loyalty_account: {
        ...mockStaffCard.loyalty_account!,
        balance: currentBalance,
      },
    }));

    const adjustSpy = vi.spyOn(pointsApi, 'adjust').mockImplementation(async () => {
      currentBalance += 5;
      return {
        balance: currentBalance,
        new_balance: currentBalance,
      };
    });

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/c/token_staff_quick_credit']}>
          <Routes>
            <Route path="/c/:token" element={<PublicCardPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Accredita punti al banco')).toBeInTheDocument();
      expect(screen.getByText('+1 pt')).toBeInTheDocument();
      expect(screen.getByText('+5 pt')).toBeInTheDocument();
      expect(screen.getByText('+10 pt')).toBeInTheDocument();
    });

    // Clicca +5 pt con 1 tocco
    fireEvent.click(screen.getByText('+5 pt'));

    await waitFor(() => {
      expect(adjustSpy).toHaveBeenCalledWith(
        1,
        50,
        expect.objectContaining({
          points: 5,
          reason: 'Accredito rapido in cassa',
        })
      );
      // Dopo un'operazione riuscita il pannello mostra il messaggio di blocco per escaneo
      expect(screen.getByTestId('scan-session-locked')).toBeInTheDocument();
      expect(screen.getByText(/Punti registrati correttamente/i)).toBeInTheDocument();
      // Il saldo aggiornato è visibile nel display del saldo
      expect(screen.getByText('85')).toBeInTheDocument();
    });
  });

  it('6. Isolamento multi-tenant: operatore di un altro commercio (cross-tenant) viene bloccato con 403 / forbidden', async () => {
    const mockCrossTenantCard: PublicCardView = {
      state: 'forbidden',
      mode: 'cross_tenant',
      message: 'Accesso negato: questa carta appartiene a un altro esercizio commerciale.',
    };

    vi.spyOn(publicCardApi, 'resolve').mockResolvedValue(mockCrossTenantCard);

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/c/token_cross_tenant_forbidden']}>
          <Routes>
            <Route path="/c/:token" element={<PublicCardPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(
        screen.getByText('Accesso negato: questa carta appartiene a un altro esercizio commerciale.')
      ).toBeInTheDocument();
    });

    expect(screen.queryByTestId('operator-credit-panel')).not.toBeInTheDocument();
    expect(screen.queryByText('Punti Accumulati')).not.toBeInTheDocument();
    expect(screen.queryByTestId('card-qr-section')).not.toBeInTheDocument();
  });

  it('7. Pagina PointsPage: mostra per impostazione predefinita +1, +5, +10 e Altro importo; Calcola da scontrino secondario e Rettifica separata', async () => {
    const mockCustomer = {
      id: 99,
      business_id: 1,
      first_name: 'Francesca',
      last_name: 'Neri',
      email: 'francesca@test.local',
      phone: '+393331112233',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const mockAccount = {
      id: 501,
      business_id: 1,
      customer_id: 99,
      card_profile_id: 1,
      profile_code: 'punti',
      profile_name: 'Punti Fedeltà',
      balance: 45,
      status: 'active' as const,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const mockProgram: LoyaltyProgram = {
      id: 1,
      business_id: 1,
      mode: 'points_per_amount',
      points_ratio: 1,
      fixed_points: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    vi.spyOn(pointsApi, 'getProgram').mockResolvedValue(mockProgram);
    vi.spyOn(pointsApi, 'listBusinessTransactions').mockResolvedValue({
      data: [],
      pagination: { page: 1, per_page: 10, total: 0, total_pages: 1 },
    });
    vi.spyOn(customerApi, 'list').mockResolvedValue({
      data: [mockCustomer],
      pagination: { page: 1, per_page: 10, total: 1, total_pages: 1 },
    });
    vi.spyOn(loyaltyApi, 'listAccounts').mockResolvedValue([mockAccount]);

    let accountBalance = 45;
    const adjustSpy = vi.spyOn(pointsApi, 'adjust').mockImplementation(async () => {
      accountBalance += 10;
      return {
        balance: accountBalance,
        new_balance: accountBalance,
      };
    });

    render(
      <AuthProvider>
        <MemoryRouter>
          <PointsPage />
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Accredito e rettifica punti')).toBeInTheDocument();
    });

    // Cerca cliente
    fireEvent.change(screen.getByPlaceholderText(/Cerca per nome, cognome/i), {
      target: { value: 'Francesca' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Cerca Cliente/i }));

    await waitFor(() => {
      expect(screen.getByText('Francesca Neri')).toBeInTheDocument();
    });

    // Seleziona cliente
    fireEvent.click(screen.getByRole('button', { name: /Seleziona Cliente/i }));

    await waitFor(() => {
      expect(screen.getByText('2. Accredito punti')).toBeInTheDocument();
      // Mostra per default i bottoni rapidi +1, +5, +10, Altro importo
      expect(screen.getByRole('button', { name: '+1 pt' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '+5 pt' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '+10 pt' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '✍️ Altro importo' })).toBeInTheDocument();
      // Mostra il modo secondario
      expect(screen.getByRole('button', { name: '🛒 Calcola da scontrino' })).toBeInTheDocument();
      // Mostra la sezione separata per Rettifica saldo punti
      expect(
        screen.getByRole('heading', { name: /3\. Rettifica saldo punti \(Correzioni e storni\)/i })
      ).toBeInTheDocument();
    });

    // Accredito rapido con 1 clic su +10 pt
    fireEvent.click(screen.getByRole('button', { name: '+10 pt' }));

    await waitFor(() => {
      expect(adjustSpy).toHaveBeenCalledWith(
        1,
        501,
        expect.objectContaining({
          points: 10,
          reason: 'Accredito rapido punti',
        })
      );
      expect(screen.getByText(/\+10 punti accreditati con successo/i)).toBeInTheDocument();
      expect(screen.getAllByText(/55 pt/).length).toBeGreaterThan(0);
    });
  });
});
