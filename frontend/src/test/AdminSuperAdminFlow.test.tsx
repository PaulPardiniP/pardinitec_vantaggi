import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AdminCardsPage } from '../pages/admin/AdminCardsPage';
import { AdminBusinessesPage } from '../pages/admin/AdminBusinessesPage';
import { AcceptInvitationPage } from '../pages/auth/AcceptInvitationPage';
import { cardsApi, businessApi, authApi, invitationApi } from '../api/services';
import { AuthProvider } from '../context/AuthContext';
import type { Business, Card, User } from '../types';

describe('Flusso Super Admin (Assegnazione Carte, Pacchetti, Onboarding e GDPR)', () => {
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
    {
      id: 102,
      name: 'Ristorante Archiviato',
      slug: 'ristorante-archiviato',
      tax_id: 'IT99988877766',
      status: 'inactive',
      is_archived: true,
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
      status: 'inventory',
      business_id: null,
      loyalty_account_id: null,
      customer_id: null,
      batch_id: 'batch-uuid-1',
      is_reprogrammable: true,
      created_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 3,
      status: 'inventory',
      business_id: null,
      loyalty_account_id: null,
      customer_id: null,
      batch_id: 'batch-uuid-2',
      is_reprogrammable: true,
      created_at: '2026-01-01T00:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(authApi, 'me').mockResolvedValue({
      user: superAdminUser,
    } as any);
  });

  // 1. Assegnazione Carte Senza ID Manuali
  it('1. AdminCardsPage: selezione multipla di carte con checkbox, conteggio e riepilogo assegnazione', async () => {
    vi.spyOn(cardsApi, 'listAdminCards').mockResolvedValue({
      data: mockCards,
      pagination: { page: 1, per_page: 20, total: 3, total_pages: 1 },
    });
    vi.spyOn(businessApi, 'list').mockResolvedValue(mockBusinesses);

    render(
      <AuthProvider>
        <MemoryRouter>
          <AdminCardsPage />
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('#1')).toBeInTheDocument();
      expect(screen.getByText('#2')).toBeInTheDocument();
      expect(screen.getByText('#3')).toBeInTheDocument();
    });

    // Inizialmente nessuna carta selezionata
    expect(screen.getByText(/Nessuna carta selezionata/i)).toBeInTheDocument();

    // Seleziona tutte
    const selectAllBtn = screen.getByRole('button', { name: /Seleziona tutte/i });
    fireEvent.click(selectAllBtn);

    expect(screen.getByText('3 carte selezionate')).toBeInTheDocument();

    // Clicca Assegna carte per aprire la modale di riepilogo
    const assignBtn = screen.getByRole('button', { name: /Assegna carte/i });
    fireEvent.click(assignBtn);

    // Verifica che la modale di riepilogo mostri il conteggio e i codici
    expect(screen.getByText(/Riepilogo Assegnazione/i)).toBeInTheDocument();
    expect(screen.getByText(/3 carte fisiche/i)).toBeInTheDocument();
    expect(screen.getByText(/#1, #2, #3/i)).toBeInTheDocument();
  });

  // 2. Pacchetti e Onboarding in AdminBusinessesPage
  it('2. AdminBusinessesPage: onboarding titolare e 4 pacchetti commerciali (Punti, Vantaggi, VIP, Campagne)', async () => {
    vi.spyOn(businessApi, 'listPaginated').mockResolvedValue({
      data: mockBusinesses,
      pagination: { page: 1, per_page: 25, total: 2, total_pages: 1 },
    });

    vi.spyOn(businessApi, 'getPackages').mockResolvedValue({
      packages: {
        punti: true,
        vantaggi: false,
        vip: false,
        campaigns: false,
      },
      raw_modules: [
        { code: 'points', name: 'Punti e Saldo', description: null, is_enabled: true },
        { code: 'rewards', name: 'Catalogo Premi', description: null, is_enabled: false },
      ],
    });

    render(
      <AuthProvider>
        <MemoryRouter>
          <AdminBusinessesPage />
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Bar Pasticceria Rossi')).toBeInTheDocument();
      expect(screen.getByText('Ristorante Archiviato')).toBeInTheDocument();
    });

    // Verifica badge archiviato
    expect(screen.getByText('📦 Archiviato')).toBeInTheDocument();

    // Apre Nuovo Commercio e verifica campi titolare
    const newBizBtn = screen.getByRole('button', { name: /Nuovo Commercio/i });
    fireEvent.click(newBizBtn);

    expect(screen.getByLabelText(/Email Titolare/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Nome Titolare')).toBeInTheDocument();
    expect(screen.getByLabelText('Cognome Titolare')).toBeInTheDocument();

    // Chiude modale nuovo commercio
    fireEvent.click(screen.getByRole('button', { name: /Annulla/i }));
    await waitFor(() => {
      expect(screen.queryByLabelText(/Email Titolare/i)).not.toBeInTheDocument();
    });

    // Apre modale Pacchetti per il primo commercio
    const pacchettiBtns = screen.getAllByRole('button', { name: /Pacchetti/i });
    fireEvent.click(pacchettiBtns[0]);

    await waitFor(() => {
      expect(screen.getByText(/🏆 Profilo Punti/i)).toBeInTheDocument();
      expect(screen.getByText(/🏷️ Profilo Vantaggi/i)).toBeInTheDocument();
      expect(screen.getByText(/⭐ Profilo VIP/i)).toBeInTheDocument();
      expect(screen.getByText(/📢 Add-on Campagne di Comunicazione/i)).toBeInTheDocument();
      expect(screen.getByText(/Dettagli tecnici e diagnostica capabilities/i)).toBeInTheDocument();
    });
  });

  // 3. Pagina Pubblica Accettazione Invito (/invitations/:token)
  it('3. AcceptInvitationPage: convalida token, form di impostazione password e accettazione', async () => {
    vi.spyOn(invitationApi, 'validate').mockResolvedValue({
      id: 10,
      email: 'mario.rossi@test.it',
      first_name: 'Mario',
      last_name: 'Rossi',
      business_id: 101,
      business_name: 'Bar Pasticceria Rossi',
      role: 'owner',
    });

    const acceptSpy = vi.spyOn(invitationApi, 'accept').mockResolvedValue({
      user_id: 55,
      email: 'mario.rossi@test.it',
      business_id: 101,
      business_name: 'Bar Pasticceria Rossi',
    });

    render(
      <MemoryRouter initialEntries={['/invitations/sample-secure-token']}>
        <Routes>
          <Route path="/invitations/:token" element={<AcceptInvitationPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Bar Pasticceria Rossi')).toBeInTheDocument();
      expect(screen.getByText(/mario.rossi@test.it/i)).toBeInTheDocument();
    });

    // Inserisce password e conferma
    fireEvent.change(screen.getByLabelText(/^Crea Password \*/i), { target: { value: 'PasswordSicura123!' } });
    fireEvent.change(screen.getByLabelText(/^Conferma Password \*/i), { target: { value: 'PasswordSicura123!' } });

    // Seleziona il checkbox termini
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    // Clicca Attiva Account e Accedi
    const submitBtn = screen.getByRole('button', { name: /Attiva Account e Accedi/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(acceptSpy).toHaveBeenCalledWith('sample-secure-token', 'PasswordSicura123!');
      expect(screen.getByText(/Account attivato con successo/i)).toBeInTheDocument();
    });
  });

  // 4. Copia Link Invito con URL Assoluta
  it('4. AdminBusinessesPage: mostra e copia negli appunti l\'URL assoluta dell\'invito titolare', async () => {
    vi.spyOn(businessApi, 'listPaginated').mockResolvedValue({
      data: mockBusinesses,
      pagination: { page: 1, per_page: 25, total: 2, total_pages: 1 },
    });

    vi.spyOn(businessApi, 'create').mockResolvedValue({
      id: 105,
      name: 'Nuovo Bar Test',
      slug: 'nuovo-bar-test',
      status: 'active',
      self_registration_enabled: false,
      role: 'super_admin',
      invitation: {
        id: 77,
        business_id: 105,
        email: 'titolare@nuovobar.it',
        token: 'token-abc-123',
        status: 'pending',
        expires_at: '2026-09-26T20:00:00Z',
        created_at: '2026-09-19T20:00:00Z',
        invitation_url: '/invitations/token-abc-123',
      },
    });

    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });
    vi.spyOn(window, 'alert').mockImplementation(() => {});

    render(
      <AuthProvider>
        <MemoryRouter>
          <AdminBusinessesPage />
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Bar Pasticceria Rossi')).toBeInTheDocument();
    });

    // Clicca Nuovo Commercio
    fireEvent.click(screen.getByRole('button', { name: /Nuovo Commercio/i }));

    // Compila dati
    fireEvent.change(screen.getByLabelText(/Nome Azienda \*/i), { target: { value: 'Nuovo Bar Test' } });
    fireEvent.change(screen.getByLabelText(/Email Titolare/i), { target: { value: 'titolare@nuovobar.it' } });

    // Invia form
    fireEvent.click(screen.getByRole('button', { name: /Crea Commercio/i }));

    // Attende la comparsa del link invito
    await waitFor(() => {
      expect(screen.getByText(/Link di attivazione per il Titolare:/i)).toBeInTheDocument();
    });

    const expectedAbsoluteUrl = new URL('/invitations/token-abc-123', window.location.origin).toString();
    const inviteInput = screen.getByDisplayValue(expectedAbsoluteUrl) as HTMLInputElement;
    expect(inviteInput).toBeInTheDocument();
    expect(inviteInput.value).toMatch(/^https?:\/\/[^/]+\/invitations\/token-abc-123$/);

    // Clicca Copia Link Invito
    const copyBtn = screen.getByRole('button', { name: /Copia Link Invito/i });
    fireEvent.click(copyBtn);

    // Verifica che navigator.clipboard.writeText abbia ricevuto l'URL assoluta
    expect(writeTextMock).toHaveBeenCalledWith(expectedAbsoluteUrl);
    expect(writeTextMock).toHaveBeenCalledWith(expect.stringMatching(/^https?:\/\/[^/]+\/invitations\/token-abc-123$/));
    expect(window.alert).toHaveBeenCalledWith('Link copiato negli appunti!');
  });

  // 5. Selezione Pacchetti in Nuovo Commercio e Validazione
  it('5. AdminBusinessesPage: selezione pacchetti in Nuovo Commercio, validazione profilo e invio', async () => {
    vi.spyOn(businessApi, 'listPaginated').mockResolvedValue({
      data: mockBusinesses,
      pagination: { page: 1, per_page: 25, total: 2, total_pages: 1 },
    });

    const createSpy = vi.spyOn(businessApi, 'create').mockResolvedValue({
      id: 106,
      name: 'Boutique Moda VIP',
      slug: 'boutique-moda-vip',
      status: 'active',
      self_registration_enabled: false,
      role: 'super_admin',
    });

    render(
      <AuthProvider>
        <MemoryRouter>
          <AdminBusinessesPage />
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Bar Pasticceria Rossi')).toBeInTheDocument();
    });

    // Clicca Nuovo Commercio
    fireEvent.click(screen.getByRole('button', { name: /Nuovo Commercio/i }));

    // Verifica sezione Pacchetti contrattuali
    expect(screen.getByText(/3\. Pacchetti contrattuali \*/i)).toBeInTheDocument();

    // Profilo Punti deve essere attivo per impostazione predefinita
    const puntiCheckbox = screen.getByLabelText(/Profilo Punti/i) as HTMLInputElement;
    expect(puntiCheckbox.checked).toBe(true);

    // Campagne deve essere opzionale e disattivato per impostazione predefinita
    const campagneCheckbox = screen.getByLabelText(/Add-on Campagne/i) as HTMLInputElement;
    expect(campagneCheckbox.checked).toBe(false);

    // Deseleziona Punti (nessun profilo selezionato)
    fireEvent.click(puntiCheckbox);
    expect(puntiCheckbox.checked).toBe(false);

    // Appare il messaggio di errore/avviso
    expect(screen.getByText(/È obbligatorio selezionare almeno un profilo tra Punti o VIP/i)).toBeInTheDocument();

    // Seleziona Vantaggi e Campagne (l'attivazione di Vantaggi include/attiva automaticamente Punti)
    const vantaggiCheckbox = screen.getByLabelText(/Profilo Vantaggi/i) as HTMLInputElement;
    fireEvent.click(vantaggiCheckbox);
    fireEvent.click(campagneCheckbox);

    expect(vantaggiCheckbox.checked).toBe(true);
    expect(campagneCheckbox.checked).toBe(true);
    expect(puntiCheckbox.checked).toBe(true);

    // Compila dati e invia
    fireEvent.change(screen.getByLabelText(/Nome Azienda \*/i), { target: { value: 'Boutique Moda VIP' } });
    fireEvent.click(screen.getByRole('button', { name: /Crea Commercio/i }));

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Boutique Moda VIP',
        packages: {
          punti: true,
          vantaggi: true,
          vip: false,
          campaigns: true,
        },
      }));
    });
  });

  // 6. Modale Pacchetti: stato persistito, gestione errore senza spinner infinito e pulsante Riprova
  it('6. AdminBusinessesPage: modale Pacchetti gestisce errore API senza spinner infinito e permette il riprova', async () => {
    vi.spyOn(businessApi, 'listPaginated').mockResolvedValue({
      data: mockBusinesses,
      pagination: { page: 1, per_page: 25, total: 2, total_pages: 1 },
    });

    // Simula errore API iniziale su getPackages
    const getPackagesSpy = vi.spyOn(businessApi, 'getPackages').mockRejectedValueOnce(new Error('Errore di rete su endpoint pacchetti'));

    render(
      <AuthProvider>
        <MemoryRouter>
          <AdminBusinessesPage />
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Bar Pasticceria Rossi')).toBeInTheDocument();
    });

    // Clicca sul pulsante Pacchetti
    const pacchettiBtns = screen.getAllByRole('button', { name: /Pacchetti/i });
    fireEvent.click(pacchettiBtns[0]);

    // Lo spinner deve fermarsi e deve comparire il messaggio di errore con il pulsante Riprova
    await waitFor(() => {
      expect(screen.queryByText(/Caricamento pacchetti\.\.\./i)).not.toBeInTheDocument();
      expect(screen.getByText(/Errore di rete su endpoint pacchetti/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /🔄 Riprova/i })).toBeInTheDocument();
    });

    // Configura getPackages per avere successo al Riprova
    getPackagesSpy.mockResolvedValueOnce({
      packages: {
        punti: true,
        vantaggi: false,
        vip: true,
        campaigns: false,
      },
      raw_modules: [],
    });

    // Clicca Riprova
    fireEvent.click(screen.getByRole('button', { name: /🔄 Riprova/i }));

    // Verifica che mostri lo stato reale persistito
    await waitFor(() => {
      expect(screen.getByText(/🏆 Profilo Punti/i)).toBeInTheDocument();
      expect(screen.getByText(/⭐ Profilo VIP/i)).toBeInTheDocument();
    });

    // Modifica pacchetto: disattivazione VIP
    const updateSpy = vi.spyOn(businessApi, 'updatePackage').mockResolvedValueOnce({
      packages: {
        punti: true,
        vantaggi: false,
        vip: false,
        campaigns: false,
      },
      raw_modules: [],
    });

    // Clicca Disattiva su VIP
    const vipHeading = screen.getByText(/⭐ Profilo VIP/i);
    const vipContainer = vipHeading.closest('div[style*="justify-content: space-between"]') || vipHeading.parentElement?.parentElement!;
    const vipDisattivaBtn = within(vipContainer).getByRole('button', { name: /Disattiva/i });
    fireEvent.click(vipDisattivaBtn);

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(101, 'vip', false);
    });
  });
});


