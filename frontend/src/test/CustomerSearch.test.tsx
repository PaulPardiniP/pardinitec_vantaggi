import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CustomersPage } from '../pages/dashboard/CustomersPage';
import { customerApi, loyaltyApi, authApi } from '../api/services';
import { AuthProvider } from '../context/AuthContext';
import type { Customer, Business, User } from '../types';

describe('Búsqueda Backend de Clientes y Aislamiento Multiempresa', () => {
  const mockUser: User = {
    id: 10,
    email: 'merchant@test.local',
    role: 'owner',
    is_super_admin: false,
    totp_enabled: true,
  };

  const mockBusiness1: Business = {
    id: 101,
    name: 'Caffè Dante',
    slug: 'caffe-dante',
    status: 'active',
    self_registration_enabled: false,
    role: 'owner',
  };

  const mockCustomers: Customer[] = [
    {
      id: 1,
      business_id: 101,
      first_name: 'Marco',
      last_name: 'Rossi',
      phone: '+393331112233',
      email: 'marco.rossi@example.com',
      created_at: '2026-01-01',
    },
    {
      id: 2,
      business_id: 101,
      first_name: 'Giulia',
      last_name: 'Bianchi',
      phone: '+393339998877',
      email: 'giulia.bianchi@example.com',
      created_at: '2026-01-02',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('vantaggi_active_business_id', '101');
    vi.spyOn(authApi, 'me').mockResolvedValue({
      user: mockUser,
      businesses: [mockBusiness1],
    } as any);
    vi.spyOn(loyaltyApi, 'listProfiles').mockResolvedValue([
      { id: 1, code: 'punti', name: 'Punti', description: '', created_at: '' },
    ]);
  });

  it('1. Carga inicial: envía business_id 101 al backend para aislamiento multiempresa', async () => {
    const listSpy = vi.spyOn(customerApi, 'list').mockResolvedValue({
      data: mockCustomers,
      pagination: { page: 1, per_page: 15, total: 2, total_pages: 1 },
    });

    render(
      <AuthProvider>
        <MemoryRouter>
          <CustomersPage />
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(listSpy).toHaveBeenCalledWith(101, expect.objectContaining({ page: 1, per_page: 15 }));
      expect(screen.getByText('Marco Rossi')).toBeInTheDocument();
      expect(screen.getByText('Giulia Bianchi')).toBeInTheDocument();
    });
  });

  it('2. Búsqueda por término (nombre/apellido/teléfono/email): consume la API con el search query', async () => {
    const listSpy = vi.spyOn(customerApi, 'list').mockResolvedValue({
      data: [mockCustomers[0]],
      pagination: { page: 1, per_page: 15, total: 1, total_pages: 1 },
    });

    render(
      <AuthProvider>
        <MemoryRouter>
          <CustomersPage />
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Marco Rossi')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Cerca per nome, cognome, telefono o email...');
    fireEvent.change(searchInput, { target: { value: 'Rossi' } });

    const searchBtn = screen.getByText('Cerca');
    fireEvent.click(searchBtn);

    await waitFor(() => {
      expect(listSpy).toHaveBeenCalledWith(
        101,
        expect.objectContaining({
          search: 'Rossi',
          page: 1,
        })
      );
    });
  });

  it('3. Búsqueda sin resultados muestra EmptyState', async () => {
    vi.spyOn(customerApi, 'list').mockResolvedValue({
      data: [],
      pagination: { page: 1, per_page: 15, total: 0, total_pages: 1 },
    });

    render(
      <AuthProvider>
        <MemoryRouter>
          <CustomersPage />
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Nessun cliente trovato')).toBeInTheDocument();
    });
  });
});
