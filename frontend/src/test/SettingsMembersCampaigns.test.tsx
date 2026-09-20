import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SettingsPage } from '../pages/dashboard/SettingsPage';
import { CampaignsPage } from '../pages/dashboard/CampaignsPage';
import { MembersPage } from '../pages/dashboard/MembersPage';
import { businessApi, pointsApi } from '../api/services';
import * as clientModule from '../api/client';

// Mock useAuth
const mockActiveBusiness = {
  id: 10,
  name: 'Caffè Pasticceria Moderno',
  slug: 'caffe-moderno',
  tax_id: 'IT12345678901',
  status: 'active',
  self_registration_enabled: false,
};

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, email: 'owner@negozio.it', name: 'Mario Owner' },
    activeBusiness: mockActiveBusiness,
    hasPermission: () => true,
    isLoading: false,
  }),
}));

describe('Verifica SettingsPage, CampaignsPage e MembersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. SettingsPage: Riepilogo dei 4 pacchetti commerciali di business
  it('1. SettingsPage: visualizza esclusivamente i 4 pacchetti commerciali anziché i singoli moduli tecnici', async () => {
    vi.spyOn(pointsApi, 'getProgram').mockResolvedValue({
      business_id: 10,
      mode: 'fixed_per_purchase',
      points_ratio: 1,
      fixed_points: 10,
      description: 'Accumula 10 punti a scontrino',
      created_at: '2026-09-01T10:00:00Z',
      updated_at: '2026-09-01T10:00:00Z',
    });

    vi.spyOn(businessApi, 'getPackages').mockResolvedValue({
      packages: {
        punti: true,
        vantaggi: true,
        vip: false,
        campaigns: true,
      },
      raw_modules: [],
    });

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    );

    // Attendi il caricamento
    await waitFor(() => {
      expect(screen.getByText('Pacchetti Contrattuali')).toBeInTheDocument();
    });

    // Verifica la presenza dei 4 pacchetti
    expect(screen.getByText('🏆 Profilo Punti')).toBeInTheDocument();
    expect(screen.getByText('🏷️ Profilo Vantaggi')).toBeInTheDocument();
    expect(screen.getByText('⭐ Profilo VIP')).toBeInTheDocument();
    expect(screen.getByText('📢 Campagne di Comunicazione')).toBeInTheDocument();

    // Verifica badge attivi e non attivi
    const attivi = screen.getAllByText('Attivo');
    const nonAttivi = screen.getAllByText('Non attivo');

    expect(attivi.length).toBe(3); // punti, vantaggi, campaigns
    expect(nonAttivi.length).toBe(1); // vip
  });

  // 2. CampaignsPage: Localizzazione italiana nativa e pulizia UTF-8
  it('2. CampaignsPage: mostra titolo "Campagne", stato vuoto "Nessuna campagna disponibile." e zero testo spagnolo o corrotto', async () => {
    vi.spyOn(clientModule, 'apiRequest').mockResolvedValue({
      data: { data: [] },
    });

    render(
      <MemoryRouter>
        <CampaignsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Campagne')).toBeInTheDocument();
    });

    expect(screen.getByText('Nessuna campagna disponibile.')).toBeInTheDocument();
    expect(screen.queryByText(/CampaÃ/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/campaÃ/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/No hay/i)).not.toBeInTheDocument();
  });

  // 3. MembersPage: Flusso invito Staff/Manager (senza ruolo Owner)
  it('3. MembersPage: sostituisce Aggiungi Membro con Invita Collaboratore, permette solo Staff e Manager e mostra il link', async () => {
    vi.spyOn(businessApi, 'listMembers').mockResolvedValue([
      {
        id: 1,
        user_id: 1,
        email: 'owner@negozio.it',
        role: 'owner',
        status: 'active',
        joined_at: '2026-09-01T10:00:00Z',
      },
    ]);

    vi.spyOn(businessApi, 'listInvitations').mockResolvedValue([
      {
        id: 42,
        business_id: 10,
        email: 'pendente@negozio.it',
        first_name: 'Luca',
        last_name: 'Verdi',
        role: 'staff',
        status: 'pending',
        expires_at: '2026-09-26T10:00:00Z',
        accepted_at: null,
        created_at: '2026-09-19T10:00:00Z',
      },
    ]);

    const createInvSpy = vi.spyOn(businessApi, 'createInvitation').mockResolvedValue({
      id: 43,
      business_id: 10,
      email: 'nuovo.staff@negozio.it',
      first_name: 'Giulia',
      last_name: 'Bianchi',
      role: 'staff',
      status: 'pending',
      expires_at: '2026-09-26T10:00:00Z',
      accepted_at: null,
      created_at: '2026-09-19T10:00:00Z',
      invitation_url: '/invitations/sample-token-12345',
    });

    render(
      <MemoryRouter>
        <MembersPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Gestione Staff & Collaboratori')).toBeInTheDocument();
    });

    // Verifica presenza tabella membri attivi e inviti pendenti
    expect(screen.getByText('owner@negozio.it')).toBeInTheDocument();
    expect(screen.getByText('pendente@negozio.it')).toBeInTheDocument();

    // Apri modale Invita Collaboratore
    fireEvent.click(screen.getByRole('button', { name: /➕ Invita Collaboratore/i }));

    // Verifica titolo modale
    expect(screen.getByText('Invita Collaboratore al Negozio')).toBeInTheDocument();

    // Verifica che le opzioni del ruolo contengano solo Staff e Manager (NESSUN Owner)
    const selectRole = screen.getByLabelText(/Ruolo Operativo \*/i) as HTMLSelectElement;
    const optionValues = Array.from(selectRole.options).map((o) => o.value);
    expect(optionValues).toContain('staff');
    expect(optionValues).toContain('manager');
    expect(optionValues).not.toContain('owner');

    // Compila form
    fireEvent.change(screen.getByLabelText(/Email del Collaboratore \*/i), {
      target: { value: 'nuovo.staff@negozio.it' },
    });
    fireEvent.change(screen.getByPlaceholderText('es. Giulia'), { target: { value: 'Giulia' } });
    fireEvent.change(screen.getByPlaceholderText('es. Bianchi'), { target: { value: 'Bianchi' } });

    // Invia
    fireEvent.click(screen.getByRole('button', { name: /Invia Invito/i }));

    await waitFor(() => {
      expect(createInvSpy).toHaveBeenCalledWith(10, {
        email: 'nuovo.staff@negozio.it',
        first_name: 'Giulia',
        last_name: 'Bianchi',
        role: 'staff',
      });
      // Verifica visualizzazione del link assoluto e pulsante copia
      expect(screen.getByDisplayValue(/invitations\/sample-token-12345/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /📋 Copia Link Invito/i })).toBeInTheDocument();
    });
  });
});
