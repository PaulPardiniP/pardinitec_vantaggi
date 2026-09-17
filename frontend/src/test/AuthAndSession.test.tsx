import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { isSafeInternalPath } from '../components/common/ProtectedRoute';
import { authApi } from '../api/services';
import { setCsrfToken, getCsrfToken } from '../api/client';

describe('Autenticazione, Sessione e Permessi (Etapa 4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setCsrfToken(null);
  });

  it('1. Valida correttamente i percorsi di ritorno sicuri (Safe return_to)', () => {
    expect(isSafeInternalPath('/c/token_12345')).toBe(true);
    expect(isSafeInternalPath('/dashboard')).toBe(true);
    expect(isSafeInternalPath('/dashboard/customers/5')).toBe(true);

    // Blocca percorsi malevoli / Open Redirect
    expect(isSafeInternalPath('https://malicious.com')).toBe(false);
    expect(isSafeInternalPath('http://malicious.com')).toBe(false);
    expect(isSafeInternalPath('//evil.com/phishing')).toBe(false);
    expect(isSafeInternalPath('javascript:alert(1)')).toBe(false);
    expect(isSafeInternalPath(null)).toBe(false);
    expect(isSafeInternalPath('')).toBe(false);
  });

  it('2. Recupera la sessione con /auth/me all\'avvio del contesto', async () => {
    const mockUser = {
      id: 1,
      email: 'owner@negozio.it',
      is_super_admin: false,
      status: 'active',
      created_at: '2026-01-01',
    };
    const mockBusinesses = [
      {
        id: 10,
        name: 'Caffè Roma',
        slug: 'caffe-roma',
        tax_id: 'IT12345678901',
        status: 'active',
        self_registration_enabled: false,
        role: 'owner',
      },
    ];

    vi.spyOn(authApi, 'me').mockResolvedValue({
      user: mockUser,
      businesses: mockBusinesses,
    });

    const TestComponent = () => {
      const { user, activeBusiness, isAuthenticated, role, isLoading } = useAuth();
      if (isLoading) return <div>Caricamento...</div>;
      return (
        <div>
          <div data-testid="auth">{isAuthenticated ? 'Autenticato' : 'Anonimo'}</div>
          <div data-testid="user">{user?.email}</div>
          <div data-testid="business">{activeBusiness?.name}</div>
          <div data-testid="role">{role}</div>
        </div>
      );
    };

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    expect(screen.getByText('Caricamento...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('auth')).toHaveTextContent('Autenticato');
      expect(screen.getByTestId('user')).toHaveTextContent('owner@negozio.it');
      expect(screen.getByTestId('business')).toHaveTextContent('Caffè Roma');
      expect(screen.getByTestId('role')).toHaveTextContent('owner');
    });
  });

  it('3. Gestisce correttamente i permessi per Staff (offer.redeem SI, offer.manage NO)', async () => {
    const TestPermissions = () => {
      const { hasPermission } = useAuth();
      return (
        <div>
          <div data-testid="points-adjust">{hasPermission('points.adjust') ? 'SI' : 'NO'}</div>
          <div data-testid="offer-manage">{hasPermission('offer.manage') ? 'SI' : 'NO'}</div>
          <div data-testid="offer-redeem">{hasPermission('offer.redeem') ? 'SI' : 'NO'}</div>
          <div data-testid="settings-manage">{hasPermission('settings.manage') ? 'SI' : 'NO'}</div>
        </div>
      );
    };

    vi.spyOn(authApi, 'me').mockResolvedValue({
      user: { id: 2, email: 'staff@negozio.it', is_super_admin: false, status: 'active', created_at: '' },
      businesses: [{ id: 10, name: 'Caffè Roma', slug: 'caffe-roma', tax_id: null, status: 'active', self_registration_enabled: false, role: 'staff' }],
    });

    render(
      <AuthProvider>
        <TestPermissions />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('points-adjust')).toHaveTextContent('SI');
      expect(screen.getByTestId('offer-redeem')).toHaveTextContent('SI');
      expect(screen.getByTestId('offer-manage')).toHaveTextContent('NO');
      expect(screen.getByTestId('settings-manage')).toHaveTextContent('NO');
    });
  });

  it('4. Super Admin possiede tutti i permessi sulla piattaforma', async () => {
    const TestPermissions = () => {
      const { hasPermission } = useAuth();
      return (
        <div>
          <div data-testid="points-adjust">{hasPermission('points.adjust') ? 'SI' : 'NO'}</div>
          <div data-testid="offer-manage">{hasPermission('offer.manage') ? 'SI' : 'NO'}</div>
          <div data-testid="offer-redeem">{hasPermission('offer.redeem') ? 'SI' : 'NO'}</div>
          <div data-testid="settings-manage">{hasPermission('settings.manage') ? 'SI' : 'NO'}</div>
        </div>
      );
    };

    vi.spyOn(authApi, 'me').mockResolvedValue({
      user: { id: 99, email: 'admin@vantaggi.it', is_super_admin: true, status: 'active', created_at: '' },
      businesses: [],
    });

    render(
      <AuthProvider>
        <TestPermissions />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('points-adjust')).toHaveTextContent('SI');
      expect(screen.getByTestId('offer-redeem')).toHaveTextContent('SI');
      expect(screen.getByTestId('offer-manage')).toHaveTextContent('SI');
      expect(screen.getByTestId('settings-manage')).toHaveTextContent('SI');
    });
  });

  it('4. Gestisce il token CSRF in memoria senza salvarlo in localStorage', async () => {
    expect(getCsrfToken()).toBeNull();
    setCsrfToken('test_csrf_token_64chars_abcdef123456');
    expect(getCsrfToken()).toBe('test_csrf_token_64chars_abcdef123456');

    // Verifica che localStorage rimanga vuoto
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('session')).toBeNull();
    expect(localStorage.getItem('csrf_token')).toBeNull();
  });
});
