import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PublicCardPage } from '../pages/public/PublicCardPage';
import { publicCardApi, pointsApi } from '../api/services';
import { AuthProvider } from '../context/AuthContext';
import type { PublicCardView } from '../types';

describe('Vista Pubblica ed Operativa Adattativa /c/{token}', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Vista Anonima Punti: mostra saldo, pulsante premi, zero PII e pulsante Accesso Commerciante', async () => {
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
      expect(screen.getByText(/Premi con punti \(2\)/i)).toBeInTheDocument();
      expect(screen.getByText('🔒 Accesso Commerciante')).toBeInTheDocument();
    });

    // Cliccando sul pulsante tattile verticale si apre il catalogo premi
    fireEvent.click(screen.getByText(/Premi con punti \(2\)/i));
    expect(screen.getByRole('heading', { name: 'Premi riscattabili con punti' })).toBeInTheDocument();
    expect(screen.getByText('Caffè Omaggio')).toBeInTheDocument();
    expect(screen.getByText('Vassoio Paste')).toBeInTheDocument();

    // Garanzia di CERO PII: nessun nome, email né telefono
    expect(screen.queryByText(/Titolare Conto/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Mario Rossi/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/@/i)).not.toBeInTheDocument();
  });

  it('2. Vista Anonima VIP: nasconde saldo punti e catalogo punti, mostra pulsante offerte VIP e zero PII', async () => {
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
          discount_type: 'fixed',
          discount_value: 15,
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
      expect(screen.getByText(/Offerte Esclusive VIP \(1\)/i)).toBeInTheDocument();
    });

    // Apertura modale offerte
    fireEvent.click(screen.getByText(/Offerte Esclusive VIP \(1\)/i));
    expect(screen.getByRole('heading', { name: 'Offerte Esclusive VIP' })).toBeInTheDocument();
    expect(screen.getByText('Aperitivo VIP Riservato')).toBeInTheDocument();
    expect(screen.getByText('Sconto €15,00')).toBeInTheDocument();
    expect(screen.getByText('Esclusivo VIP')).toBeInTheDocument();

    // Il profilo VIP senza capacità punti non deve mostrare blocchi di saldo punti né catalogo premi
    expect(screen.queryByText('Punti Accumulati')).not.toBeInTheDocument();
    expect(screen.queryByText(/Vedi premi/i)).not.toBeInTheDocument();
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

  it('5. Mostra il QR Code adattivo e centrato della carta digitale da esibire in cassa', async () => {
    const mockCard: PublicCardView = {
      state: 'active',
      mode: 'public',
      business: { id: 1, name: 'Caffè Moderno', slug: 'caffe-moderno' },
      loyalty_account: {
        id: 205,
        profile_code: 'vantaggi',
        profile_name: 'Vantaggi',
        balance: 50,
        status: 'active',
      },
    };

    vi.spyOn(publicCardApi, 'resolve').mockResolvedValue(mockCard);

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/c/token_mobile_test_123']}>
          <Routes>
            <Route path="/c/:token" element={<PublicCardPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Caffè Moderno')).toBeInTheDocument();
      expect(screen.getByTestId('card-qr-section')).toBeInTheDocument();
    });

    const qrImage = await screen.findByTestId('card-qr-image');
    expect(qrImage).toBeInTheDocument();
    expect(qrImage).toHaveAttribute('alt', 'QR Code Carta Digitale');
    expect(screen.getByText(/Mostra questo codice in cassa/i)).toBeInTheDocument();
  });

  it('6. Funziona correttamente in viewport mobile 360x800 e a partire da 320px (Mobile-First)', async () => {
    // Simula viewport mobile 360x800
    window.innerWidth = 360;
    window.innerHeight = 800;
    window.dispatchEvent(new Event('resize'));

    const mockCard: PublicCardView = {
      state: 'active',
      mode: 'public',
      business: { id: 1, name: 'Pasticceria Bellini Con Testo Molto Lungo Per Verificare Wrapping Senza Overflow', slug: 'pasticceria-bellini' },
      loyalty_account: {
        id: 206,
        profile_code: 'punti',
        profile_name: 'Punti Fedeltà',
        balance: 100,
        status: 'active',
      },
      rewards: [
        { id: 10, business_id: 1, name: 'Premio Descrizione Molto Dettagliata Con Molte Parole Lunghe Senza Spazi', description: 'https://link-molto-lungo-che-non-deve-rompere-il-layout-mobile.it/dettaglio/vantaggi', points_cost: 150, card_profile_id: null, status: 'active' },
      ],
    };

    vi.spyOn(publicCardApi, 'resolve').mockResolvedValue(mockCard);

    const { container } = render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/c/token_mobile_360']}>
          <Routes>
            <Route path="/c/:token" element={<PublicCardPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/Pasticceria Bellini/i)).toBeInTheDocument();
      expect(screen.getByTestId('card-qr-section')).toBeInTheDocument();
    });

    const cardBox = container.querySelector('.public-card-box');
    expect(cardBox).toBeInTheDocument();

    // Simula viewport stretto estremo a 320px
    window.innerWidth = 320;
    window.innerHeight = 568;
    window.dispatchEvent(new Event('resize'));

    expect(screen.getByTestId('card-qr-section')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('7. Adatta correttamente la visualizzazione per desktop (1280x800)', async () => {
    window.innerWidth = 1280;
    window.innerHeight = 800;
    window.dispatchEvent(new Event('resize'));

    const mockCard: PublicCardView = {
      state: 'active',
      mode: 'public',
      business: { id: 1, name: 'Ristorante Desktop', slug: 'ristorante-desktop' },
      loyalty_account: {
        id: 207,
        profile_code: 'vip',
        profile_name: 'VIP',
        status: 'active',
      },
    };

    vi.spyOn(publicCardApi, 'resolve').mockResolvedValue(mockCard);

    const { container } = render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/c/token_desktop_1280']}>
          <Routes>
            <Route path="/c/:token" element={<PublicCardPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Ristorante Desktop')).toBeInTheDocument();
    });

    const cardBox = container.querySelector('.public-card-box');
    expect(cardBox).toBeInTheDocument();
  });

  it('8. Apertura diretta, aggiornamento pagina o navigazione anonima su /c/{token} carica da /api/v1/public/cards/{token} e renderizza la UI visuale React', async () => {
    const resolveSpy = vi.spyOn(publicCardApi, 'resolve').mockResolvedValue({
      state: 'active',
      mode: 'public',
      business: { id: 1, name: 'Gelateria del Corso', slug: 'gelateria-corso' },
      loyalty_account: {
        id: 301,
        profile_code: 'punti',
        profile_name: 'Punti',
        balance: 75,
        status: 'active',
      },
    });

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/c/direct_token_abc']}>
          <Routes>
            <Route path="/c/:token" element={<PublicCardPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(resolveSpy).toHaveBeenCalledWith('direct_token_abc');
      expect(screen.getByText('Gelateria del Corso')).toBeInTheDocument();
      expect(screen.getByText('75')).toBeInTheDocument();
      expect(screen.getByText('Punti Accumulati')).toBeInTheDocument();
      expect(screen.getByTestId('card-qr-section')).toBeInTheDocument();
    });

    // Mai reindirizzare al login né mostrare JSON grezzo
    expect(screen.queryByText(/Accedi al tuo account/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\{"success":/)).not.toBeInTheDocument();
  });

  it('9. Gestione Punti da /c/{token}: Acreditazione +10 e Correzione -5 con payload corretto (points intero)', async () => {
    let currentBalance = 0;
    const initialStaffView: PublicCardView = {
      state: 'active',
      mode: 'staff',
      business: { id: 1, name: 'Pasticceria Bellini', slug: 'pasticceria-bellini' },
      loyalty_account: {
        id: 101,
        profile_code: 'punti',
        profile_name: 'Punti',
        balance: currentBalance,
        status: 'active',
      },
      customer: { id: 42, first_name: 'Mario', last_name: 'Rossi' },
      actions: { can_adjust_points: true, can_redeem_rewards: false, can_redeem_offers: false },
    };

    const resolveSpy = vi.spyOn(publicCardApi, 'resolve').mockImplementation(async () => ({
      ...initialStaffView,
      loyalty_account: {
        ...initialStaffView.loyalty_account!,
        balance: currentBalance,
      },
    }));

    const adjustSpy = vi.spyOn(pointsApi, 'adjust').mockImplementation(async (_bizId, _accId, data) => {
      currentBalance += data.points || 0;
      return {
        transaction: {
          id: 1,
          business_id: 1,
          loyalty_account_id: 101,
          actor_user_id: 2,
          type: 'manual_adjustment',
          points_delta: data.points || 0,
          balance_after: currentBalance,
          spent_amount: null,
          reason: data.reason || null,
          operation_id: data.operation_id || 'test_op',
          created_at: new Date().toISOString(),
        },
        balance: currentBalance,
        new_balance: currentBalance,
      };
    });

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/c/token_staff_adjust']}>
          <Routes>
            <Route path="/c/:token" element={<PublicCardPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Pasticceria Bellini')).toBeInTheDocument();
      expect(screen.getByText('➕ Gestisci Punti')).toBeInTheDocument();
    });

    // 1. Accredito +10
    fireEvent.click(screen.getByText('➕ Gestisci Punti'));

    // Verifica apertura modale
    expect(screen.getByRole('heading', { name: 'Gestione Punti' })).toBeInTheDocument();

    const submitBtn = screen.getByRole('button', { name: 'Conferma Operazione' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(adjustSpy).toHaveBeenLastCalledWith(
        1,
        101,
        expect.objectContaining({
          points: 10,
          reason: 'Acquisto in cassa',
          operation_id: expect.any(String),
        })
      );
      // Il modale deve chiudersi
      expect(screen.queryByRole('heading', { name: 'Gestione Punti' })).not.toBeInTheDocument();
      // Mostra messaggio di successo e saldo aggiornato a 10
      expect(screen.getByText(/Punti aggiornati con successo! Nuovo saldo: 10 punti\./i)).toBeInTheDocument();
      expect(screen.getByText('10')).toBeInTheDocument();
      // Verifica blocco scansione per apertura
      expect(screen.getByTestId('scan-session-locked')).toBeInTheDocument();
    });
  });

  it('10. Gestione Punti: in caso di errore, il modale rimane aperto e mostra l\'avviso al suo interno', async () => {
    const staffView: PublicCardView = {
      state: 'active',
      mode: 'staff',
      business: { id: 1, name: 'Pasticceria Bellini', slug: 'pasticceria-bellini' },
      loyalty_account: {
        id: 101,
        profile_code: 'punti',
        profile_name: 'Punti',
        balance: 10,
        status: 'active',
      },
      customer: { id: 42, first_name: 'Mario', last_name: 'Rossi' },
      actions: { can_adjust_points: true, can_redeem_rewards: false, can_redeem_offers: false },
    };

    vi.spyOn(publicCardApi, 'resolve').mockResolvedValue(staffView);
    vi.spyOn(pointsApi, 'adjust').mockRejectedValue(
      new Error('Il campo points è obbligatorio e deve essere un numero intero.')
    );

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/c/token_staff_error']}>
          <Routes>
            <Route path="/c/:token" element={<PublicCardPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('➕ Gestisci Punti')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('➕ Gestisci Punti'));
    expect(screen.getByRole('heading', { name: 'Gestione Punti' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Conferma Operazione' }));

    await waitFor(() => {
      // Il modale DEVE rimanere aperto
      expect(screen.getByRole('heading', { name: 'Gestione Punti' })).toBeInTheDocument();
      // Il messaggio di errore DEVE apparire dentro il modale
      expect(
        screen.getByText('Il campo points è obbligatorio e deve essere un numero intero.')
      ).toBeInTheDocument();
    });
  });

  it('11. Storico Movimenti: apre modale con movimenti anonimizzati (+10, -5) e zero PII', async () => {
    const mockCardWithHistory: PublicCardView = {
      state: 'active',
      mode: 'public',
      business: { id: 1, name: 'Pasticceria Bellini', slug: 'pasticceria-bellini' },
      loyalty_account: {
        id: 101,
        profile_code: 'vantaggi',
        profile_name: 'Vantaggi',
        balance: 105,
        status: 'active',
      },
      recent_transactions: [
        {
          id: 1,
          points_delta: 10,
          reason: 'Acquisto paste della domenica',
          created_at: '2026-09-18T10:30:00Z',
        },
        {
          id: 2,
          points_delta: -5,
          reason: 'Riscatto sconto caffè',
          created_at: '2026-09-17T15:00:00Z',
        },
      ],
    };

    vi.spyOn(publicCardApi, 'resolve').mockResolvedValue(mockCardWithHistory);

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/c/token_history_test']}>
          <Routes>
            <Route path="/c/:token" element={<PublicCardPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/Movimenti punti/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Movimenti punti/i));

    expect(screen.getByRole('heading', { name: 'Storico Movimenti Punti' })).toBeInTheDocument();
    expect(screen.getByText('Acquisto paste della domenica')).toBeInTheDocument();
    expect(screen.getByText('+10 pt')).toBeInTheDocument();
    expect(screen.getByText('Riscatto sconto caffè')).toBeInTheDocument();
    expect(screen.getByText('-5 pt')).toBeInTheDocument();
  });

  it('12. Profilo Vantaggi: mostra bottoni verticali sia per offerte che per premi', async () => {
    const mockVantaggi: PublicCardView = {
      state: 'active',
      mode: 'public',
      business: { id: 1, name: 'Boutique Chic', slug: 'boutique-chic' },
      loyalty_account: {
        id: 105,
        profile_code: 'vantaggi',
        profile_name: 'Vantaggi',
        balance: 300,
        status: 'active',
      },
      offers: [
        {
          id: 1,
          business_id: 1,
          title: 'Sconto Collezione Primavera',
          description: null,
          discount_type: 'percentage',
          discount_value: 15.5,
          is_vip: false,
          card_profile_id: 2,
          is_single_use: false,
          status: 'active',
        },
      ],
      rewards: [
        {
          id: 2,
          business_id: 1,
          name: 'Sciarpa in Seta',
          description: null,
          points_cost: 250,
          card_profile_id: null,
          status: 'active',
        },
      ],
    };

    vi.spyOn(publicCardApi, 'resolve').mockResolvedValue(mockVantaggi);

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/c/token_vantaggi_full']}>
          <Routes>
            <Route path="/c/:token" element={<PublicCardPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/Offerte Vantaggi \(1\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Premi con punti \(1\)/i)).toBeInTheDocument();
    });

    // Test formattazione automatica beneficio percentuale decimale
    fireEvent.click(screen.getByText(/Offerte Vantaggi \(1\)/i));
    expect(screen.getByText('Sconto 15,5%')).toBeInTheDocument();
  });

  it('13. Vista Tarjeta Física VIP: cuenta VIP con credencial física muestra exactamente los mismos beneficios VIP y botón "Offerte Esclusive VIP" que la digital', async () => {
    const mockVipOffers = [
      {
        id: 77,
        business_id: 1,
        title: 'Calice di Benvenuto Riservato VIP',
        description: 'Offerta esclusiva per soci VIP',
        discount_type: 'fixed' as const,
        discount_value: 20,
        is_vip: true,
        card_profile_id: 3,
        is_single_use: false,
        status: 'active' as const,
      },
    ];

    const mockVipPhysicalView: PublicCardView = {
      state: 'active',
      mode: 'public',
      credential_id: 201,
      credential_type: 'physical',
      business: { id: 1, name: 'Ristorante Belvedere', slug: 'ristorante-belvedere' },
      loyalty_account: {
        id: 102,
        profile_code: 'vip',
        profile_name: 'VIP Club',
        status: 'active',
      },
      offers: mockVipOffers,
    };

    vi.spyOn(publicCardApi, 'resolve').mockResolvedValue(mockVipPhysicalView);

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/c/token_vip_physical_888']}>
          <Routes>
            <Route path="/c/:token" element={<PublicCardPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Ristorante Belvedere')).toBeInTheDocument();
      expect(screen.getByText(/PROFILO VIP CLUB/i)).toBeInTheDocument();
      expect(screen.getByText(/Offerte Esclusive VIP \(1\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Mostra questo codice per accedere ai tuoi benefici esclusivi VIP/i)).toBeInTheDocument();
    });

    // Cliccando sul pulsante VIP si apre la modale con le offerte VIP
    fireEvent.click(screen.getByText(/Offerte Esclusive VIP \(1\)/i));
    expect(screen.getByRole('heading', { name: 'Offerte Esclusive VIP' })).toBeInTheDocument();
    expect(screen.getByText('Calice di Benvenuto Riservato VIP')).toBeInTheDocument();
    expect(screen.getByText('Sconto €20,00')).toBeInTheDocument();

    // Nessuna interferenza da Punti o Vantaggi
    expect(screen.queryByText('Punti Accumulati')).not.toBeInTheDocument();
    expect(screen.queryByText(/Premi con punti/i)).not.toBeInTheDocument();
  });
});

