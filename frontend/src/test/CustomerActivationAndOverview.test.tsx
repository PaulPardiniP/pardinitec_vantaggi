import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PublicCardPage } from '../pages/public/PublicCardPage';
import { OverviewPage } from '../pages/dashboard/OverviewPage';
import { AdminOverviewPage } from '../pages/admin/AdminOverviewPage';
import { DashboardLayout } from '../layouts/DashboardLayout';
import {
  publicCardApi,
  cardsApi,
  customerApi,
  loyaltyApi,
  authApi,
  businessApi,
} from '../api/services';
import { AuthProvider } from '../context/AuthContext';
import type { PublicCardView } from '../types';

describe('Verifica UX: Ricerca Clienti, Contrasto NFC, Panoramica e Mobile Responsive', () => {
  const mockActiveBusiness = {
    id: 10,
    name: 'Caffè Moderno',
    slug: 'caffe-moderno',
    status: 'active',
    role: 'owner',
    self_registration_enabled: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('vantaggi_active_business_id', '10');
    vi.spyOn(authApi, 'me').mockResolvedValue({
      user: {
        id: 1,
        email: 'owner@caffemoderno.local',
        is_super_admin: false,
        role: 'owner',
        totp_enabled: false,
        session_state: 'active',
      },
      businesses: [mockActiveBusiness],
    } as any);
    vi.spyOn(businessApi, 'list').mockResolvedValue([mockActiveBusiness as any]);
    vi.spyOn(businessApi, 'getPackages').mockResolvedValue({
      packages: { punti: true, vantaggi: true, vip: true, campaigns: true } as any,
      raw_modules: [],
    });
  });

  it('1. PublicCardPage: ricerca cliente mostra nome, cognome e ID con testo chiaramente visibile', async () => {
    const mockIssuedStaff: PublicCardView = {
      state: 'issued',
      mode: 'staff',
      can_activate: true,
      card_id: 50,
      business: { id: 10, name: 'Caffè Moderno', slug: 'caffe-moderno' },
    };

    vi.spyOn(publicCardApi, 'resolve').mockResolvedValue(mockIssuedStaff);
    vi.spyOn(customerApi, 'list').mockResolvedValue({
      data: [
        {
          id: 42,
          business_id: 10,
          first_name: 'Giuseppe',
          last_name: 'Verdi',
          phone: '+39333999888',
          email: 'giuseppe@verdi.local',
          created_at: '',
          updated_at: '',
        },
      ],
      pagination: { page: 1, per_page: 10, total: 1, total_pages: 1 },
    });

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/c/token_test_1']}>
          <Routes>
            <Route path="/c/:token" element={<PublicCardPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Attiva e Associa Carta')).toBeInTheDocument();
      expect(screen.getByTestId('activation-search-panel')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText(/Nome, cognome, telefono/i), {
      target: { value: 'Giuseppe' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cerca' }));

    await waitFor(() => {
      expect(screen.getByTestId('activation-select-customer-42')).toBeInTheDocument();
      // Verifica visualizzazione ID, nome e telefono
      expect(screen.getByText(/Giuseppe Verdi/)).toBeInTheDocument();
      expect(screen.getByText(/(ID: #42)/)).toBeInTheDocument();
      expect(screen.getByText(/📞 \+39333999888/)).toBeInTheDocument();
    });
  });

  it('2. PublicCardPage: cliente senza conto Punti mostra "+ Crea conto Punti" e lo seleziona automaticamente', async () => {
    const mockIssuedStaff: PublicCardView = {
      state: 'issued',
      mode: 'staff',
      can_activate: true,
      card_id: 50,
      business: { id: 10, name: 'Caffè Moderno', slug: 'caffe-moderno' },
    };

    vi.spyOn(publicCardApi, 'resolve').mockResolvedValue(mockIssuedStaff);
    vi.spyOn(customerApi, 'list').mockResolvedValue({
      data: [{ id: 42, business_id: 10, first_name: 'Giuseppe', last_name: 'Verdi', phone: null, email: null, created_at: '', updated_at: '' }],
      pagination: { page: 1, per_page: 10, total: 1, total_pages: 1 },
    });

    // Inizialmente nessun conto fedeltà
    vi.spyOn(loyaltyApi, 'listAccounts').mockResolvedValue([]);

    const createAccountSpy = vi.spyOn(loyaltyApi, 'createAccount').mockResolvedValue({
      account: {
        id: 301,
        business_id: 10,
        customer_id: 42,
        profile_code: 'punti',
        profile_name: 'Punti',
        balance: 0,
        status: 'active',
      },
    });

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/c/token_test_2']}>
          <Routes>
            <Route path="/c/:token" element={<PublicCardPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('activation-search-panel')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText(/Nome, cognome, telefono/i), {
      target: { value: 'Giuseppe' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cerca' }));

    await waitFor(() => {
      expect(screen.getByTestId('activation-select-customer-42')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('activation-select-customer-42'));

    await waitFor(() => {
      expect(screen.getByText('+ Crea conto Punti')).toBeInTheDocument();
    });

    // Clicca su "+ Crea conto Punti"
    fireEvent.click(screen.getByText('+ Crea conto Punti'));

    await waitFor(() => {
      expect(createAccountSpy).toHaveBeenCalledWith(10, 42, 'punti', false);
      expect(screen.getByText(/Conto Punti/)).toBeInTheDocument();
      expect(screen.getByText('✓ Selezionato')).toBeInTheDocument();
    });
  });

  it('3. OverviewPage: rispetta ordine 1.Premi con punti, 2.Vantaggi, 3.VIP, 4.Carte fisiche, 5.Clienti, 6.Membri, 7.Impostazioni e non mostra Accredito punti come card', async () => {
    vi.spyOn(businessApi, 'listModules').mockResolvedValue([
      { code: 'points', is_enabled: true, name: 'Punti', description: null },
      { code: 'rewards', is_enabled: true, name: 'Premi', description: null },
      { code: 'offers', is_enabled: true, name: 'Vantaggi', description: null },
      { code: 'vip_offers', is_enabled: true, name: 'VIP', description: null },
    ] as any);

    render(
      <AuthProvider>
        <MemoryRouter>
          <OverviewPage />
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Caffè Moderno')).toBeInTheDocument();
    });

    // Verifica la presenza e ordine dei titoli h2 delle schede
    await waitFor(() => {
      const cardHeadings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
      expect(cardHeadings).toEqual([
        'Premi con punti',
        'Vantaggi',
        'VIP',
        'Carte fisiche',
        'Clienti',
        'Membri',
      ]);

      // Verifica che "Accredito punti" e "Impostazioni" NON siano presenti tra le schede h2 di Panoramica
      expect(cardHeadings).not.toContain('Accredito punti');
      expect(cardHeadings).not.toContain('Impostazioni');
    });
  });

  it('4. Super Admin Overview: banner nero/carbón di alto contrasto con statistiche e link rapidi', async () => {
    vi.spyOn(businessApi, 'list').mockResolvedValue([
      { id: 1, name: 'Commercio Alfa', slug: 'alfa', status: 'active' } as any,
      { id: 2, name: 'Commercio Beta', slug: 'beta', status: 'active' } as any,
    ]);
    vi.spyOn(cardsApi, 'listAdminCards').mockResolvedValue({
      data: [
        { id: 1, card_status: 'inventory', status: 'inventory' } as any,
        { id: 2, card_status: 'issued', status: 'issued' } as any,
        { id: 3, card_status: 'active', status: 'active' } as any,
      ],
      pagination: { page: 1, per_page: 100, total: 3, total_pages: 1 },
    });

    render(
      <AuthProvider>
        <MemoryRouter>
          <AdminOverviewPage />
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Pannello di Amministrazione')).toBeInTheDocument();
      expect(screen.getByText(/SUPER ADMIN/)).toBeInTheDocument();
      expect(screen.getByText('Commerci Registrati')).toBeInTheDocument();
      expect(screen.getByText('Carte in Inventario Libere')).toBeInTheDocument();
      expect(screen.getByText('Carte Attive o Assegnate')).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument(); // 1 in inventario
      expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(2); // 2 commerci & 2 carte attive/assegnate
    });
  });

  it('5. DashboardLayout: pulsante menu mobile gestisce correttamente apertura/chiusura navigazione', async () => {
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/dashboard']}>
          <DashboardLayout />
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Pardinitec')).toBeInTheDocument();
    });

    const menuToggle = screen.getByRole('button', { name: /Toggle menu/i });
    expect(menuToggle).toHaveTextContent('☰ Menu');

    fireEvent.click(menuToggle);
    expect(menuToggle).toHaveTextContent('✕ Chiudi');

    fireEvent.click(menuToggle);
    expect(menuToggle).toHaveTextContent('☰ Menu');
  });
});
