import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OffersPage } from '../pages/dashboard/OffersPage';
import { offersApi, loyaltyApi, authApi, businessApi } from '../api/services';
import { AuthProvider } from '../context/AuthContext';
import { formatOfferBenefit, formatTargetAudience } from '../utils/formatters';
import type { Offer } from '../types';

describe('Gestione e Segmentazione Offerte (OffersPage & Formatters)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Funzioni di formattazione del beneficio automatico', () => {
    it('formatta correttamente gli sconti percentuali interi e decimali', () => {
      expect(formatOfferBenefit('percentage', 10)).toBe('Sconto 10%');
      expect(formatOfferBenefit('percentage', 15.5)).toBe('Sconto 15,5%');
      expect(formatOfferBenefit('percentage', 20.25)).toBe('Sconto 20,25%');
    });

    it('formatta correttamente gli importi fissi in Euro all\'italiana (eliminando UNDEFINED €)', () => {
      expect(formatOfferBenefit('fixed', 40)).toBe('Sconto €40,00');
      expect(formatOfferBenefit('fixed', 5)).toBe('Sconto €5,00');
      expect(formatOfferBenefit('fixed', 5.5)).toBe('Sconto €5,50');
      expect(formatOfferBenefit('fixed', 1250.75)).toBe('Sconto €1.250,75');
    });

    it('formatta correttamente i destinatari', () => {
      expect(formatTargetAudience('vantaggi')).toBe('Destinatari: Vantaggi');
      expect(formatTargetAudience('vip')).toBe('Destinatari: VIP');
      expect(formatTargetAudience('vantaggi_vip')).toBe('Destinatari: Vantaggi e VIP');
      expect(formatTargetAudience('all')).toBe('Destinatari: Vantaggi e VIP');
    });
  });

  describe('Interfaccia Amministrativa OffersPage', () => {
    const mockActiveBusiness = {
      id: 1,
      name: 'Ristorante Da Mario',
      slug: 'da-mario',
      status: 'active',
      role: 'owner',
      self_registration_enabled: true,
    };

    const mockOffers: Offer[] = [
      {
        id: 1,
        business_id: 1,
        title: 'Sconto Benvenuto 10%',
        description: 'Per il primo acquisto',
        discount_type: 'percentage',
        discount_value: 10,
        target_audience: 'vantaggi',
        is_vip: false,
        card_profile_id: 2,
        is_single_use: true,
        status: 'active',
      },
      {
        id: 2,
        business_id: 1,
        title: 'Buono Spesa 40€',
        description: 'Valido su menu cena',
        discount_type: 'fixed',
        discount_value: 40,
        target_audience: 'vip',
        is_vip: true,
        card_profile_id: 3,
        is_single_use: true,
        status: 'active',
      },
      {
        id: 3,
        business_id: 1,
        title: 'Promo Compleanno 5€',
        description: null,
        discount_type: 'fixed',
        discount_value: 5,
        target_audience: 'all',
        is_vip: false,
        card_profile_id: null,
        is_single_use: false,
        status: 'active',
      },
    ];

    beforeEach(() => {
      localStorage.setItem('vantaggi_active_business_id', '1');
      vi.spyOn(authApi, 'me').mockResolvedValue({
        user: {
          id: 2,
          email: 'mario@test.local',
          is_super_admin: false,
          role: 'owner',
          totp_enabled: false,
          session_state: 'active',
        },
        businesses: [mockActiveBusiness],
      } as any);
      vi.spyOn(businessApi, 'list').mockResolvedValue([mockActiveBusiness]);
      vi.spyOn(businessApi, 'listModules').mockResolvedValue([]);

      vi.spyOn(loyaltyApi, 'listProfiles').mockResolvedValue([
        { id: 1, code: 'punti', name: 'Punti Fedeltà', description: '', created_at: '', updated_at: '' },
        { id: 2, code: 'vantaggi', name: 'Vantaggi', description: '', created_at: '', updated_at: '' },
        { id: 3, code: 'vip', name: 'VIP Club', description: '', created_at: '', updated_at: '' },
      ]);
    });

    it('renderizza la tabella offerte con i benefici formattati e i destinatari senza campi contraddittori', async () => {
      vi.spyOn(offersApi, 'list').mockResolvedValue(mockOffers);

      render(
        <AuthProvider>
          <MemoryRouter>
            <OffersPage />
          </MemoryRouter>
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('Offerte Vantaggi & VIP')).toBeInTheDocument();
        expect(screen.getByText('Sconto Benvenuto 10%')).toBeInTheDocument();
        expect(screen.getByText('Buono Spesa 40€')).toBeInTheDocument();
        expect(screen.getByText('Promo Compleanno 5€')).toBeInTheDocument();
      });

      // Benefici formattati
      expect(screen.getByText('Sconto 10%')).toBeInTheDocument();
      expect(screen.getByText('Sconto €40,00')).toBeInTheDocument();
      expect(screen.getByText('Sconto €5,00')).toBeInTheDocument();

      // Colonne destinatari
      expect(screen.getByText('Destinatari: Vantaggi')).toBeInTheDocument();
      expect(screen.getByText('Destinatari: VIP')).toBeInTheDocument();
      expect(screen.getByText('Destinatari: Vantaggi e VIP')).toBeInTheDocument();

      // Mai mostrare "UNDEFINED €"
      expect(screen.queryByText(/UNDEFINED/i)).not.toBeInTheDocument();
    });

    it('apre il form di creazione con selettore destinatari pulito e crea l\'offerta con payload valido', async () => {
      vi.spyOn(offersApi, 'list').mockResolvedValue([]);
      const createSpy = vi.spyOn(offersApi, 'create').mockResolvedValue({
        id: 4,
        business_id: 1,
        title: 'Offerta Super VIP 25%',
        description: 'Riservata',
        discount_type: 'percentage',
        discount_value: 25,
        target_audience: 'vip',
        is_vip: true,
        card_profile_id: 3,
        is_single_use: true,
        status: 'active',
      });

      const { container } = render(
        <AuthProvider>
          <MemoryRouter>
            <OffersPage />
          </MemoryRouter>
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('➕ Nuova Offerta')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('➕ Nuova Offerta'));

      expect(screen.getByRole('heading', { name: 'Nuova Offerta' })).toBeInTheDocument();

      // Compilazione form
      const titleInput = screen.getByLabelText(/Titolo Offerta \*/i);
      fireEvent.change(titleInput, { target: { value: 'Offerta Super VIP 25%' } });

      const audienceSelect = screen.getByLabelText(/Destinatari Offerta \*/i);
      fireEvent.change(audienceSelect, { target: { value: 'vip' } });

      const valueInput = screen.getByLabelText(/Percentuale Sconto/i);
      fireEvent.change(valueInput, { target: { value: '25' } });

      const form = container.querySelector('form') as HTMLFormElement;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(createSpy).toHaveBeenCalledWith(1, {
          title: 'Offerta Super VIP 25%',
          description: null,
          discount_type: 'percentage',
          discount_value: 25,
          target_audience: 'vip',
          is_single_use: true,
        });
      });
    });
  });
});
