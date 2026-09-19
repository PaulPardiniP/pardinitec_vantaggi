import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CustomerDetailPage } from '../pages/dashboard/CustomerDetailPage';
import { customerApi, loyaltyApi } from '../api/services';

const mockActiveBusiness = { id: 10, name: 'Pasticceria Roma', slug: 'pasticceria-roma', status: 'active', role: 'owner' as const, joined_at: '2026-01-01' };

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, email: 'admin@test.it', first_name: 'Admin', last_name: 'User', role: 'owner' },
    activeBusiness: mockActiveBusiness,
    userBusinesses: [mockActiveBusiness],
    contractedModules: ['loyalty_base', 'digital_credentials', 'cards'],
    entitlements: null,
    isAuthenticated: true,
    isLoading: false,
    requires2FA: false,
    twoFactorPending: false,
    token2FA: null,
    tempAuthData: null,
    login: vi.fn(),
    logout: vi.fn(),
    setActiveBusiness: vi.fn(),
    verify2FA: vi.fn(),
    resend2FA: vi.fn(),
    hasPermission: () => true,
    hasModule: () => true,
    invalidateModulesCache: vi.fn(),
  }),
}));

vi.mock('../api/services', () => ({
  customerApi: {
    get: vi.fn(),
    update: vi.fn(),
    getConsents: vi.fn(),
  },
  loyaltyApi: {
    listAccountCredentials: vi.fn(),
    createAccount: vi.fn(),
    rotateCredential: vi.fn(),
  },
}));

describe('CustomerDetailPage - Flusso Attivazione / Upgrade Conti (Regola Definitiva)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Cliente con solo Punti: cliccando Attiva Vantaggi aggiorna il conto in-place, NON apre QrModal e mostra messaggio di upgrade', async () => {
    const customerWithPunti = {
      id: 55,
      business_id: 10,
      first_name: 'Mario',
      last_name: 'Rossi',
      email: 'mario@test.it',
      phone: '+39333111222',
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
      loyalty_accounts: [
        {
          id: 101,
          business_id: 10,
          customer_id: 55,
          card_profile_id: 1,
          profile_code: 'punti',
          profile_name: 'Punti',
          balance: 150,
          status: 'active',
          created_at: '2026-01-01',
        },
      ],
    };

    (customerApi.get as any).mockResolvedValue(customerWithPunti);
    (customerApi.getConsents as any).mockResolvedValue({
      id: 1,
      customer_id: 55,
      privacy_policy: true,
      terms_conditions: true,
      marketing: false,
      profiling: false,
      third_party_transfer: false,
      history: [],
    });
    (loyaltyApi.listAccountCredentials as any).mockResolvedValue([
      { id: 201, business_id: 10, loyalty_account_id: 101, card_profile_id: 1, card_profile_code: 'punti', card_profile_name: 'Punti', status: 'active', token_masked: 'abcd****1234', created_at: '2026-01-01' },
    ]);
    (loyaltyApi.createAccount as any).mockResolvedValue({
      account: { id: 101, customer_id: 55, card_profile_id: 2, profile_code: 'vantaggi', profile_name: 'Vantaggi', balance: 150, status: 'active' },
      upgraded: true,
      token: null,
      public_url: null,
    });

    render(
      <MemoryRouter initialEntries={['/dashboard/customers/55']}>
        <Routes>
          <Route path="/dashboard/customers/:id" element={<CustomerDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Mario Rossi/i)).toBeInTheDocument();
    });

    // Clicca sul pulsante "⭐ Attiva Vantaggi" nell'header
    const headerUpgradeBtn = screen.getByRole('button', { name: /Attiva Vantaggi/i });
    fireEvent.click(headerUpgradeBtn);

    // Si apre la modale di conferma
    const modal = screen.getByRole('dialog');
    expect(within(modal).getByRole('heading', { name: /Attiva Profilo Vantaggi/i })).toBeInTheDocument();
    expect(within(modal).getByText(/Il conto Punti del cliente verrà ampliato al profilo Vantaggi/i)).toBeInTheDocument();

    const submitBtn = within(modal).getByRole('button', { name: /Attiva Vantaggi/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(loyaltyApi.createAccount).toHaveBeenCalledWith(10, 55, 'vantaggi', true);
    });

    // Verifica che NON si apra la QrModal (poiché upgraded: true) e appaia feedback di upgrade
    await waitFor(() => {
      expect(screen.queryByText(/Condividi, scarica o stampa ora/i)).not.toBeInTheDocument();
      expect(screen.getByText(/Profilo conto aggiornato a Vantaggi con successo!/i)).toBeInTheDocument();
    });
  });

  it('2. Creazione conto VIP separato: crea nuovo conto e apre QrModal con la credenziale generata', async () => {
    const customerWithPunti = {
      id: 55,
      business_id: 10,
      first_name: 'Mario',
      last_name: 'Rossi',
      email: 'mario@test.it',
      phone: '+39333111222',
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
      loyalty_accounts: [
        {
          id: 101,
          business_id: 10,
          customer_id: 55,
          card_profile_id: 1,
          profile_code: 'punti',
          profile_name: 'Punti',
          balance: 150,
          status: 'active',
          created_at: '2026-01-01',
        },
      ],
    };

    (customerApi.get as any).mockResolvedValue(customerWithPunti);
    (customerApi.getConsents as any).mockResolvedValue({ id: 1, customer_id: 55, privacy_policy: true, history: [] });
    (loyaltyApi.listAccountCredentials as any).mockResolvedValue([]);
    (loyaltyApi.createAccount as any).mockResolvedValue({
      account: { id: 102, customer_id: 55, card_profile_id: 3, profile_code: 'vip', profile_name: 'VIP', balance: 0, status: 'active' },
      upgraded: false,
      token: 'raw_vip_token_xyz999',
      public_url: 'http://localhost:5174/c/raw_vip_token_xyz999',
    });

    render(
      <MemoryRouter initialEntries={['/dashboard/customers/55']}>
        <Routes>
          <Route path="/dashboard/customers/:id" element={<CustomerDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Mario Rossi/i)).toBeInTheDocument();
    });

    const addVipBtn = screen.getByRole('button', { name: /Crea Conto VIP/i });
    fireEvent.click(addVipBtn);

    const modal = screen.getByRole('dialog');
    expect(within(modal).getByRole('heading', { name: /Crea Conto VIP Separato/i })).toBeInTheDocument();

    const submitBtn = within(modal).getByRole('button', { name: /Conferma Creazione/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(loyaltyApi.createAccount).toHaveBeenCalledWith(10, 55, 'vip', true);
    });

    // QrModal deve aprirsi per il VIP
    await waitFor(() => {
      expect(screen.getByText(/Condividi, scarica o stampa ora/i)).toBeInTheDocument();
    });
  });

  it('3. Gestione errori dentro la modale: mantiene aperta la modale e mostra l\'errore sopra i campi del form', async () => {
    const customerWithVantaggi = {
      id: 55,
      business_id: 10,
      first_name: 'Mario',
      last_name: 'Rossi',
      email: 'mario@test.it',
      phone: '+39333111222',
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
      loyalty_accounts: [
        {
          id: 101,
          business_id: 10,
          customer_id: 55,
          card_profile_id: 2,
          profile_code: 'vantaggi',
          profile_name: 'Vantaggi',
          balance: 150,
          status: 'active',
          created_at: '2026-01-01',
        },
      ],
    };

    (customerApi.get as any).mockResolvedValue(customerWithVantaggi);
    (customerApi.getConsents as any).mockResolvedValue({ id: 1, customer_id: 55, privacy_policy: true, history: [] });
    (loyaltyApi.listAccountCredentials as any).mockResolvedValue([]);
    // Backend rejects with conflict
    (loyaltyApi.createAccount as any).mockRejectedValue(new Error('Il cliente possiede già un conto standard Vantaggi attivo.'));

    render(
      <MemoryRouter initialEntries={['/dashboard/customers/55']}>
        <Routes>
          <Route path="/dashboard/customers/:id" element={<CustomerDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Mario Rossi/i)).toBeInTheDocument();
    });

    const addVipBtn = screen.getByRole('button', { name: /Crea Conto VIP/i });
    fireEvent.click(addVipBtn);

    const modal = screen.getByRole('dialog');
    const submitBtn = within(modal).getByRole('button', { name: /Conferma Creazione/i });
    fireEvent.click(submitBtn);

    // Deve mostrare l'errore dentro la modale e la modale deve rimanere aperta
    await waitFor(() => {
      expect(within(modal).getByText(/Il cliente possiede già un conto standard Vantaggi attivo./i)).toBeInTheDocument();
      expect(within(modal).getByRole('heading', { name: /Crea Conto VIP Separato/i })).toBeInTheDocument();
    });
  });
});