import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminCardsPage } from '../pages/admin/AdminCardsPage';
import { cardsApi, businessApi, authApi } from '../api/services';
import { AuthProvider } from '../context/AuthContext';
import type { Business, Card, User } from '../types';

describe('AdminCardsPage: Programmazione Lotto NFC e Visualizzazione URL', () => {
  const superAdminUser: User = {
    id: 1,
    email: 'admin@pardinitec.local',
    is_super_admin: true,
    status: 'active',
  };

  const mockBusinesses: Business[] = [
    {
      id: 101,
      name: 'Bar Pasticceria Rossi',
      slug: 'bar-rossi',
      tax_id: 'IT12345678901',
      status: 'active',
      self_registration_enabled: false,
      role: 'super_admin',
    },
  ];

  const mockCards: Card[] = [
    {
      id: 1,
      status: 'inventory',
      business_id: null,
      loyalty_account_id: null,
      customer_id: null,
      batch_id: 'batch-uuid-1',
      is_reprogrammable: true,
      created_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 2,
      status: 'issued',
      business_id: 101,
      business_name: 'Bar Pasticceria Rossi',
      loyalty_account_id: null,
      customer_id: null,
      batch_id: 'batch-uuid-1',
      is_reprogrammable: true,
      created_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 3,
      status: 'revoked',
      business_id: 101,
      loyalty_account_id: null,
      customer_id: null,
      batch_id: 'batch-uuid-1',
      is_reprogrammable: true,
      created_at: '2026-01-01T00:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(authApi, 'me').mockResolvedValue({
      user: superAdminUser,
    } as any);
    vi.spyOn(cardsApi, 'listAdminCards').mockResolvedValue({
      data: mockCards,
      pagination: { page: 1, per_page: 20, total: 3, total_pages: 1 },
    });
    vi.spyOn(businessApi, 'list').mockResolvedValue(mockBusinesses);

    // Mock clipboard
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('1. Mostra la colonna NFC e il bottone "Visualizza / Copia URL" per carte valide, bloccando quelle revocate', async () => {
    render(
      <AuthProvider>
        <MemoryRouter>
          <AdminCardsPage />
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('NFC')).toBeInTheDocument();
    });

    const revealButtons = screen.getAllByText(/Visualizza \/ Copia URL/i);
    expect(revealButtons.length).toBe(2); // for card 1 (inventory) and card 2 (issued)

    expect(screen.getByText(/Non programmabile/i)).toBeInTheDocument(); // for card 3 (revoked)
  });

  it('2. Dopo aver generato un lotto, apre la modale "Programmazione lotto NFC" con le URL e bottoni copia', async () => {
    const createdBatchCards = [
      { id: 10, status: 'inventory', token: 'token10abc', public_url: '/c/token10abc', created_at: '2026-01-01T00:00:00Z' },
      { id: 11, status: 'inventory', token: 'token11def', public_url: '/c/token11def', created_at: '2026-01-01T00:00:00Z' },
    ];

    vi.spyOn(cardsApi, 'createBatch').mockResolvedValue({
      created_count: 2,
      count: 2,
      cards: createdBatchCards,
      data: createdBatchCards as any,
    });

    render(
      <AuthProvider>
        <MemoryRouter>
          <AdminCardsPage />
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('➕ Genera Lotto Carte')).toBeInTheDocument();
    });

    // Apri modale generazione lotto
    fireEvent.click(screen.getByText('➕ Genera Lotto Carte'));
    await waitFor(() => {
      expect(screen.getByText(/Quantità di Carte da Generare/i)).toBeInTheDocument();
    });

    // Invia form di generazione lotto
    fireEvent.click(screen.getByRole('button', { name: 'Genera Lotto' }));

    // Verifica apertura modale Programmazione lotto NFC
    await waitFor(() => {
      expect(screen.getByText('Programmazione lotto NFC')).toBeInTheDocument();
      expect(screen.getByText('Programma le carte prima della consegna al commercio.')).toBeInTheDocument();
      expect(screen.getByText('#10')).toBeInTheDocument();
      expect(screen.getByText('#11')).toBeInTheDocument();
      expect(screen.getByDisplayValue(/token10abc/)).toBeInTheDocument();
      expect(screen.getByDisplayValue(/token11def/)).toBeInTheDocument();
    });

    // Copia singola URL
    const copyButtons = screen.getAllByText('📋 Copia URL');
    fireEvent.click(copyButtons[0]);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('token10abc'));

    // Copia tutte
    const copyAllBtn = screen.getByText('📑 Copia tutte');
    fireEvent.click(copyAllBtn);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringMatching(/Carta #10: .*token10abc\nCarta #11: .*token11def/)
    );
  });

  it('3. Dopo l\'assegnazione a un commercio, riapre la modale con le STESSE URL e mostra il commercio assegnatario', async () => {
    const createdBatchCards = [
      { id: 1, status: 'inventory', token: 'token1abc', public_url: '/c/token1abc', created_at: '2026-01-01T00:00:00Z' },
    ];

    vi.spyOn(cardsApi, 'createBatch').mockResolvedValue({
      created_count: 1,
      count: 1,
      cards: createdBatchCards,
      data: createdBatchCards as any,
    });
    vi.spyOn(cardsApi, 'assign').mockResolvedValue({ assigned_count: 1 });

    render(
      <AuthProvider>
        <MemoryRouter>
          <AdminCardsPage />
        </MemoryRouter>
      </AuthProvider>
    );

    // 1. Genera lotto
    await waitFor(() => {
      expect(screen.getByText('➕ Genera Lotto Carte')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('➕ Genera Lotto Carte'));
    fireEvent.click(screen.getByRole('button', { name: 'Genera Lotto' }));

    await waitFor(() => {
      expect(screen.getByText('Programmazione lotto NFC')).toBeInTheDocument();
    });

    // Chiudi modale NFC
    fireEvent.click(screen.getByRole('button', { name: 'Chiudi' }));

    // 2. Seleziona il lotto appena creato
    await waitFor(() => {
      expect(screen.getByText(/Seleziona il lotto appena creato/i)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText(/Seleziona il lotto appena creato/i));

    // 3. Apri modale di assegnazione
    await waitFor(() => {
      expect(screen.getByText(/📦 Assegna carte/i)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText(/📦 Assegna carte/i));

    // Conferma assegnazione
    await waitFor(() => {
      expect(screen.getByText('Conferma Assegnazione')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Conferma Assegnazione'));

    // Verifica che la modale NFC si riapre con le STESSE URL e il commercio assegnatario
    await waitFor(() => {
      expect(screen.getByText('Programmazione lotto NFC')).toBeInTheDocument();
      const modal = screen.getByRole('dialog');
      expect(within(modal).getByText(/Bar Pasticceria Rossi/i)).toBeInTheDocument();
      expect(within(modal).getByDisplayValue(/token1abc/)).toBeInTheDocument();
    });
  });

  it('4. Cliccando "Visualizza / Copia URL" su una singola carta recupera la URL tramite revealLink', async () => {
    vi.spyOn(cardsApi, 'revealLink').mockResolvedValue({
      card_id: 1,
      credential_id: 42,
      token: 'revealedSecretToken123',
      public_url: '/c/revealedSecretToken123',
      card_status: 'inventory',
    });

    render(
      <AuthProvider>
        <MemoryRouter>
          <AdminCardsPage />
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getAllByText(/Visualizza \/ Copia URL/i)[0]).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByText(/Visualizza \/ Copia URL/i)[0]);

    await waitFor(() => {
      expect(cardsApi.revealLink).toHaveBeenCalledWith(1);
      expect(screen.getByText('Programmazione lotto NFC')).toBeInTheDocument();
      expect(screen.getByDisplayValue(/revealedSecretToken123/)).toBeInTheDocument();
    });
  });

  it('5. Gestisce errori di rete o carte legacy mostrando messaggio e bottone "Riprova", senza spinner infinito', async () => {
    vi.spyOn(cardsApi, 'revealLink').mockRejectedValueOnce(new Error('Link non recuperabile'));

    render(
      <AuthProvider>
        <MemoryRouter>
          <AdminCardsPage />
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getAllByText(/Visualizza \/ Copia URL/i)[0]).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByText(/Visualizza \/ Copia URL/i)[0]);

    await waitFor(() => {
      expect(screen.getByText('Link non recuperabile')).toBeInTheDocument();
      expect(screen.queryByText(/Recupero link NFC in corso/i)).not.toBeInTheDocument();
    });
  });
});
