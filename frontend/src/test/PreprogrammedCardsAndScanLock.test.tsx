import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PublicCardPage } from '../pages/public/PublicCardPage';
import {
  publicCardApi,
  pointsApi,
  cardsApi,
  customerApi,
  loyaltyApi,
  authApi,
  businessApi,
} from '../api/services';
import { AuthProvider } from '../context/AuthContext';
import type { PublicCardView } from '../types';

describe('Tarjetas Preprogramadas + Bloqueo per Escaneo', () => {
  const mockActiveBusiness = {
    id: 5,
    name: 'Libreria Dante',
    slug: 'libreria-dante',
    status: 'active',
    role: 'owner',
    self_registration_enabled: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('vantaggi_active_business_id', '5');
    vi.spyOn(authApi, 'me').mockResolvedValue({
      user: {
        id: 3,
        email: 'owner@libreria.local',
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

  // ─────────────────────────────────────────────────────────
  // T1: Tessera vergine (issued) scansionata da visitatore anonimo
  // ─────────────────────────────────────────────────────────
  it('T1: Tessera vergine (issued) da anonimo mostra "Carta Non Ancora Attivata", non pannello attivazione', async () => {
    const mockIssuedAnon: PublicCardView = {
      state: 'issued',
      mode: 'anonymous' as any,
      message: 'Carta non ancora attivata. Rivolgersi al personale del punto vendita.',
    };

    vi.spyOn(publicCardApi, 'resolve').mockResolvedValue(mockIssuedAnon);

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/c/token_virgin_anon']}>
          <Routes>
            <Route path="/c/:token" element={<PublicCardPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Carta Non Ancora Attivata')).toBeInTheDocument();
      expect(screen.getByText(/Rivolgersi al personale/i)).toBeInTheDocument();
      // Il pannello di attivazione NON deve essere visibile (can_activate non è true, mode non è staff)
      expect(screen.queryByTestId('activation-search-panel')).not.toBeInTheDocument();
      expect(screen.queryByTestId('activation-confirm-panel')).not.toBeInTheDocument();
      // Il pannello operatore NON deve essere visibile
      expect(screen.queryByTestId('operator-credit-panel')).not.toBeInTheDocument();
    });
  });

  // ─────────────────────────────────────────────────────────
  // T2: Tessera vergine (issued) scansionata da operatore del negozio → pannello attivazione
  // ─────────────────────────────────────────────────────────
  it('T2: Tessera vergine (issued) con mode:staff e can_activate mostra pannello "Cerca cliente"', async () => {
    const mockIssuedStaff: PublicCardView = {
      state: 'issued',
      mode: 'staff',
      can_activate: true,
      card_id: 42,
      business: { id: 5, name: 'Libreria Dante', slug: 'libreria-dante' },
      message: 'Carta assegnata al commercio. Pronta per attivazione in negozio.',
    };

    vi.spyOn(publicCardApi, 'resolve').mockResolvedValue(mockIssuedStaff);

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/c/token_virgin_staff']}>
          <Routes>
            <Route path="/c/:token" element={<PublicCardPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Attiva e Associa Carta')).toBeInTheDocument();
      expect(screen.getByText(/La carta possiede già un link permanente/i)).toBeInTheDocument();
      expect(screen.getByTestId('activation-search-panel')).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Nome, cognome, telefono/i)).toBeInTheDocument();
      // I controlli di accredito punti NON devono essere visibili
      expect(screen.queryByTestId('operator-credit-panel')).not.toBeInTheDocument();
    });
  });

  // ─────────────────────────────────────────────────────────
  // T3: Flusso di attivazione — cerca cliente, seleziona, conferma, card si ricarica come attiva
  // ─────────────────────────────────────────────────────────
  it('T3: Attivazione tessera — cerca cliente, seleziona, cardsApi.activate chiamato, pagina si ricarica come active', async () => {
    const mockIssuedStaff: PublicCardView = {
      state: 'issued',
      mode: 'staff',
      can_activate: true,
      card_id: 42,
      business: { id: 5, name: 'Libreria Dante', slug: 'libreria-dante' },
    };

    const mockActiveCard: PublicCardView = {
      state: 'active',
      mode: 'staff',
      business: { id: 5, name: 'Libreria Dante', slug: 'libreria-dante' },
      loyalty_account: {
        id: 200,
        profile_code: 'punti',
        profile_name: 'Punti Fedeltà',
        balance: 0,
        status: 'active',
      },
      customer: { id: 88, first_name: 'Sofia', last_name: 'Ferrari' },
      actions: { can_adjust_points: true, can_redeem_rewards: false, can_redeem_offers: false },
    };

    const resolveSpy = vi.spyOn(publicCardApi, 'resolve')
      .mockResolvedValueOnce(mockIssuedStaff)
      .mockResolvedValue(mockActiveCard);

    vi.spyOn(customerApi, 'list').mockResolvedValue({
      data: [{ id: 88, business_id: 5, first_name: 'Sofia', last_name: 'Ferrari', phone: '+39333000111', email: null, created_at: '', updated_at: '' }],
      pagination: { page: 1, per_page: 10, total: 1, total_pages: 1 },
    });

    vi.spyOn(loyaltyApi, 'listAccounts').mockResolvedValue([
      { id: 200, business_id: 5, customer_id: 88, card_profile_id: 1, profile_code: 'punti', profile_name: 'Punti Fedeltà', balance: 0, status: 'active', created_at: '' },
    ]);

    const activateSpy = vi.spyOn(cardsApi, 'activate').mockResolvedValue({ card: {} as any, token: '', public_url: '' });

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/c/token_to_activate']}>
          <Routes>
            <Route path="/c/:token" element={<PublicCardPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );

    // Attendi il pannello di ricerca
    await waitFor(() => {
      expect(screen.getByTestId('activation-search-panel')).toBeInTheDocument();
    });

    // Cerca cliente
    fireEvent.change(screen.getByPlaceholderText(/Nome, cognome, telefono/i), {
      target: { value: 'Sofia' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cerca' }));

    // Seleziona il cliente
    await waitFor(() => {
      expect(screen.getByTestId('activation-select-customer-88')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('activation-select-customer-88'));

    // Pannello di conferma
    await waitFor(() => {
      expect(screen.getByTestId('activation-confirm-panel')).toBeInTheDocument();
      expect(screen.getByText(/Sofia Ferrari/)).toBeInTheDocument();
    });

    // Conferma attivazione
    fireEvent.click(screen.getByTestId('activation-confirm-btn'));

    await waitFor(() => {
      expect(activateSpy).toHaveBeenCalledWith(5, 42, 200);
      // Dopo attivazione la pagina si ricarica e mostra il pannello operativo
      expect(screen.getByTestId('operator-credit-panel')).toBeInTheDocument();
    });
  });

  // ─────────────────────────────────────────────────────────
  // T4: Tessera sospesa → banner "Carta Temporaneamente Sospesa", nessun controllo di accredito
  // ─────────────────────────────────────────────────────────
  it('T4: Tessera sospesa mostra banner rosso, nessun pannello operatore', async () => {
    const mockSuspended: PublicCardView = {
      state: 'suspended',
      message: 'Carta temporaneamente sospesa.',
    };

    vi.spyOn(publicCardApi, 'resolve').mockResolvedValue(mockSuspended);

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/c/token_suspended']}>
          <Routes>
            <Route path="/c/:token" element={<PublicCardPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Carta Temporaneamente Sospesa')).toBeInTheDocument();
      expect(screen.getByText(/Rivolgiti al personale/i)).toBeInTheDocument();
    });

    expect(screen.queryByTestId('operator-credit-panel')).not.toBeInTheDocument();
    expect(screen.queryByText('+1 pt')).not.toBeInTheDocument();
    expect(screen.queryByText('+5 pt')).not.toBeInTheDocument();
  });

  // ─────────────────────────────────────────────────────────
  // T5: Una sola operazione per sessione di escaneo — dopo successo tutti i controlli si bloccano
  // ─────────────────────────────────────────────────────────
  it('T5: Dopo un accredito riuscito, il pannello mostra il messaggio di blocco e i bottoni spariscono', async () => {
    let balance = 50;
    const mockStaffCard: PublicCardView = {
      state: 'active',
      mode: 'staff',
      business: { id: 5, name: 'Libreria Dante', slug: 'libreria-dante' },
      loyalty_account: { id: 300, profile_code: 'punti', profile_name: 'Punti Fedeltà', balance, status: 'active' },
      customer: { id: 77, first_name: 'Marco', last_name: 'Bianchi' },
      actions: { can_adjust_points: true, can_redeem_rewards: false, can_redeem_offers: false },
    };

    vi.spyOn(publicCardApi, 'resolve').mockImplementation(async () => ({
      ...mockStaffCard,
      loyalty_account: { ...mockStaffCard.loyalty_account!, balance },
    }));

    vi.spyOn(pointsApi, 'adjust').mockImplementation(async () => {
      balance += 10;
      return { balance, new_balance: balance };
    });

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/c/token_scan_lock']}>
          <Routes>
            <Route path="/c/:token" element={<PublicCardPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );

    // Attendi i bottoni
    await waitFor(() => {
      expect(screen.getByText('+10 pt')).toBeInTheDocument();
    });

    // Esegui accredito +10
    fireEvent.click(screen.getByText('+10 pt'));

    // Dopo l'operazione: messaggio di blocco e bottoni NON più visibili
    await waitFor(() => {
      expect(screen.getByTestId('scan-session-locked')).toBeInTheDocument();
      expect(
        screen.getByText(/Punti registrati correttamente\. Rimuovi e riavvicina la carta per effettuare una nuova operazione\./i)
      ).toBeInTheDocument();
      // I bottoni di accredito non devono più essere visibili nel DOM
      expect(screen.queryByText('+1 pt')).not.toBeInTheDocument();
      expect(screen.queryByText('+5 pt')).not.toBeInTheDocument();
      expect(screen.queryByText('+10 pt')).not.toBeInTheDocument();
    });
  });

  // ─────────────────────────────────────────────────────────
  // T6: Nuova apertura della pagina (nuovo scan) → scanSessionUsed=false, controlli riabilitati
  // ─────────────────────────────────────────────────────────
  it('T6: Nuova apertura della pagina (nuovo scan) inizia con controlli abilitati (scanSessionUsed=false di default)', async () => {
    const mockStaffCard: PublicCardView = {
      state: 'active',
      mode: 'staff',
      business: { id: 5, name: 'Libreria Dante', slug: 'libreria-dante' },
      loyalty_account: { id: 400, profile_code: 'punti', profile_name: 'Punti Fedeltà', balance: 30, status: 'active' },
      customer: { id: 55, first_name: 'Lucia', last_name: 'Rossi' },
      actions: { can_adjust_points: true, can_redeem_rewards: false, can_redeem_offers: false },
    };

    vi.spyOn(publicCardApi, 'resolve').mockResolvedValue(mockStaffCard);

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/c/token_new_scan']}>
          <Routes>
            <Route path="/c/:token" element={<PublicCardPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );

    // Al caricamento i controlli sono abilitati (scanSessionUsed = false per default)
    await waitFor(() => {
      expect(screen.getByText('+1 pt')).toBeInTheDocument();
      expect(screen.getByText('+5 pt')).toBeInTheDocument();
      expect(screen.getByText('+10 pt')).toBeInTheDocument();
      expect(screen.queryByTestId('scan-session-locked')).not.toBeInTheDocument();
    });
  });

  // ─────────────────────────────────────────────────────────
  // T7: Idempotenza — operation_id derivato da scan_session_id condiviso per l'intera apertura
  // ─────────────────────────────────────────────────────────
  it('T7: Tutte le azioni della stessa apertura inviano la stessa chiave idempotente scan_session_id', async () => {
    const mockStaffCard: PublicCardView = {
      state: 'active',
      mode: 'staff',
      business: { id: 5, name: 'Libreria Dante', slug: 'libreria-dante' },
      loyalty_account: { id: 500, profile_code: 'punti', profile_name: 'Punti Fedeltà', balance: 0, status: 'active' },
      customer: { id: 66, first_name: 'Carlo', last_name: 'Verdi' },
      actions: { can_adjust_points: true, can_redeem_rewards: false, can_redeem_offers: false },
    };

    vi.spyOn(publicCardApi, 'resolve').mockResolvedValue(mockStaffCard);

    const adjustSpy = vi.spyOn(pointsApi, 'adjust').mockResolvedValue({ balance: 1, new_balance: 1 });

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/c/token_idempotency']}>
          <Routes>
            <Route path="/c/:token" element={<PublicCardPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('+1 pt')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('+1 pt'));

    await waitFor(() => {
      expect(adjustSpy).toHaveBeenCalledTimes(1);
      const callArgs = adjustSpy.mock.calls[0][2];
      expect(typeof callArgs.operation_id).toBe('string');
      // La chiave inizia con scan_ ed è derivata dallo scan_session_id unico dell'apertura
      expect(callArgs.operation_id).toMatch(/^scan_[0-9a-f-]+$/);
    });
  });

  // ─────────────────────────────────────────────────────────
  // T8: Aislamiento business_id — tessera issued di un altro commercio → forbidden per operatore
  // ─────────────────────────────────────────────────────────
  it('T8: Tessera issued di un altro commercio → state:forbidden, nessun pannello di attivazione', async () => {
    const mockForbiddenIssued: PublicCardView = {
      state: 'forbidden',
      mode: 'cross_tenant',
      message: 'Accesso negato.',
    };

    vi.spyOn(publicCardApi, 'resolve').mockResolvedValue(mockForbiddenIssued);

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/c/token_cross_tenant_issued']}>
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

    expect(screen.queryByTestId('activation-search-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('activation-confirm-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('operator-credit-panel')).not.toBeInTheDocument();
  });
});
