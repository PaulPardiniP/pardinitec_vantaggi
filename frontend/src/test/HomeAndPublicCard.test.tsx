import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { HomePage } from '../pages/public/HomePage';
import { PublicCardPage } from '../pages/public/PublicCardPage';
import { authApi, publicCardApi } from '../api/services';
import { ApiError } from '../api/client';
import { AuthProvider } from '../context/AuthContext';
import type { PublicCardView } from '../types';

describe('Home Pública Minimalista y Vista de Tarjeta Digital (/c/{token})', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Home Pública (/)', () => {
    it('1. Visitante no autenticado: muestra los 3 perfiles independientes (Punti, Vantaggi, VIP) y botón "Accedi"', async () => {
      vi.spyOn(authApi, 'me').mockRejectedValue(new Error('Unauthenticated'));

      render(
        <AuthProvider>
          <MemoryRouter initialEntries={['/']}>
            <HomePage />
          </MemoryRouter>
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('Accedi')).toBeInTheDocument();
        expect(screen.getByRole('heading', { level: 2, name: 'Punti' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { level: 2, name: 'Vantaggi' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { level: 2, name: /VIP/ })).toBeInTheDocument();
      });
    });

    it('2. Comerciante autenticado: muestra botón "Vai al Pannello"', async () => {
      vi.spyOn(authApi, 'me').mockResolvedValue({
        user: { id: 2, email: 'merchant@test.local', is_super_admin: false, role: 'owner', totp_enabled: true, session_state: 'active' },
        businesses: [{ id: 1, name: 'Bar Centrale', slug: 'bar-centrale', status: 'active', role: 'owner', self_registration_enabled: false }],
      } as any);

      render(
        <AuthProvider>
          <MemoryRouter initialEntries={['/']}>
            <HomePage />
          </MemoryRouter>
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByText(/Vai al Pannello/)).toBeInTheDocument();
      });
    });

    it('3. Super Admin autenticado: muestra botón "★ Pannello Super Admin"', async () => {
      vi.spyOn(authApi, 'me').mockResolvedValue({
        user: { id: 1, email: 'admin@pardinitec.local', is_super_admin: true, role: 'super_admin', totp_enabled: true, session_state: 'active' },
        businesses: [],
      } as any);

      render(
        <AuthProvider>
          <MemoryRouter initialEntries={['/']}>
            <HomePage />
          </MemoryRouter>
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByText(/Pannello Super Admin/)).toBeInTheDocument();
      });
    });
  });

  describe('Ficha Pública (/c/{token}) y Estados de Error', () => {
    it('4. Token revocado/reemplazado: muestra mensaje en italiano "Carta sostituita" y NUNCA redirige a /login', async () => {
      const replacedCardView: PublicCardView = {
        state: 'replaced',
        mode: 'public',
        business: { id: 1, name: 'Pasticceria Bellini', slug: 'pasticceria-bellini' },
        loyalty_account: { id: 1, profile_code: 'punti', profile_name: 'Punti', balance: 0, status: 'active' },
        message: 'Questa carta è stata sostituita con una nuova credenziale. Contatta il negozio per il nuovo link.',
      };

      vi.spyOn(publicCardApi, 'resolve').mockResolvedValue(replacedCardView);

      render(
        <AuthProvider>
          <MemoryRouter initialEntries={['/c/revoked_token_123']}>
            <Routes>
              <Route path="/c/:token" element={<PublicCardPage />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('Carta sostituita')).toBeInTheDocument();
        expect(screen.getByText(/Questa carta è stata sostituita/)).toBeInTheDocument();
        expect(screen.getByText(/Torna alla home/)).toBeInTheDocument();
        expect(screen.queryByText('Accedi al tuo account')).not.toBeInTheDocument();
      });
    });

    it('5. Token no encontrado / 404: muestra mensaje en italiano "Carta non trovata" y link a Home', async () => {
      vi.spyOn(publicCardApi, 'resolve').mockRejectedValue(new ApiError('Credenziale non trovata o non valida.', 404));

      render(
        <AuthProvider>
          <MemoryRouter initialEntries={['/c/invalid_token_999']}>
            <Routes>
              <Route path="/c/:token" element={<PublicCardPage />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('Carta non trovata')).toBeInTheDocument();
        expect(screen.getByText(/Torna alla home/)).toBeInTheDocument();
      });
    });

    it('6. Apertura de tarjeta pública no destruye la sesión del comerciante', async () => {
      const activeCardView: PublicCardView = {
        state: 'active',
        mode: 'public',
        business: { id: 1, name: 'Pasticceria Bellini', slug: 'pasticceria-bellini' },
        loyalty_account: { id: 10, profile_code: 'punti', profile_name: 'Punti', balance: 50, status: 'active' },
      };

      vi.spyOn(publicCardApi, 'resolve').mockResolvedValue(activeCardView);
      vi.spyOn(authApi, 'me').mockResolvedValue({
        user: { id: 2, email: 'staff@bellini.local', role: 'staff', is_super_admin: false, totp_enabled: false, session_state: 'active' },
        businesses: [{ id: 1, name: 'Pasticceria Bellini', slug: 'pasticceria-bellini', status: 'active', role: 'staff', self_registration_enabled: false }],
      } as any);

      render(
        <AuthProvider>
          <MemoryRouter initialEntries={['/c/valid_token_xyz']}>
            <Routes>
              <Route path="/c/:token" element={<PublicCardPage />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('Pasticceria Bellini')).toBeInTheDocument();
        expect(screen.getByText('50')).toBeInTheDocument();
        // Cero PII: no debe aparecer datos sensibles como emails de clientes
        expect(screen.queryByText('marco.rossi@example.com')).not.toBeInTheDocument();
      });
    });
  });
});
