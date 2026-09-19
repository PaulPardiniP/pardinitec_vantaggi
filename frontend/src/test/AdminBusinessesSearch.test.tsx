import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminBusinessesPage } from '../pages/admin/AdminBusinessesPage';
import { businessApi, authApi } from '../api/services';
import { AuthProvider } from '../context/AuthContext';
import type { Business, User } from '../types';

describe('Búsqueda y Paginación Real Backend de Comercios (Super Admin)', () => {
  const superAdminUser: User = {
    id: 1,
    email: 'admin@pardinitec.local',
    role: 'super_admin',
    is_super_admin: true,
    totp_enabled: true,
  };

  const mockBusinesses: Business[] = [
    {
      id: 1,
      name: 'Pasticceria Bellini',
      slug: 'pasticceria-bellini',
      tax_id: 'IT12345678901',
      status: 'active',
      self_registration_enabled: false,
      role: 'super_admin',
    },
    {
      id: 2,
      name: 'Ristorante Da Mario',
      slug: 'ristorante-da-mario',
      tax_id: 'IT98765432109',
      status: 'inactive',
      self_registration_enabled: false,
      role: 'super_admin',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(authApi, 'me').mockResolvedValue({
      user: superAdminUser,
      businesses: mockBusinesses,
    } as any);
  });

  it('1. Carga inicial: llama a businessApi.listPaginated con params por defecto (page 1, per_page 25, status all)', async () => {
    const listPaginatedSpy = vi.spyOn(businessApi, 'listPaginated').mockResolvedValue({
      data: mockBusinesses,
      pagination: { page: 1, per_page: 25, total: 2, total_pages: 1 },
    });

    render(
      <AuthProvider>
        <MemoryRouter>
          <AdminBusinessesPage />
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(listPaginatedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 1,
          per_page: 25,
          status: 'all',
        })
      );
      expect(screen.getByText('Pasticceria Bellini')).toBeInTheDocument();
      expect(screen.getByText('Ristorante Da Mario')).toBeInTheDocument();
      expect(screen.getByText('2 commerci trovati')).toBeInTheDocument();
    });
  });

  it('2. Búsqueda por término: dispara listPaginated con el parámetro search y resetea a página 1', async () => {
    const listPaginatedSpy = vi.spyOn(businessApi, 'listPaginated').mockResolvedValue({
      data: [mockBusinesses[0]],
      pagination: { page: 1, per_page: 25, total: 1, total_pages: 1 },
    });

    render(
      <AuthProvider>
        <MemoryRouter>
          <AdminBusinessesPage />
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Pasticceria Bellini')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Cerca per nome, ID, slug o P.IVA...');
    fireEvent.change(searchInput, { target: { value: 'Bellini' } });

    await waitFor(() => {
      expect(listPaginatedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'Bellini',
          page: 1,
        })
      );
    });
  });

  it('3. Filtro por estado: selecciona "Solo attivi" y pasa status: "active" al backend', async () => {
    const listPaginatedSpy = vi.spyOn(businessApi, 'listPaginated').mockResolvedValue({
      data: [mockBusinesses[0]],
      pagination: { page: 1, per_page: 25, total: 1, total_pages: 1 },
    });

    render(
      <AuthProvider>
        <MemoryRouter>
          <AdminBusinessesPage />
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Pasticceria Bellini')).toBeInTheDocument();
    });

    const statusSelect = screen.getByLabelText('Filtra per stato');
    fireEvent.change(statusSelect, { target: { value: 'active' } });

    await waitFor(() => {
      expect(listPaginatedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'active',
          page: 1,
        })
      );
    });
  });

  it('4. Controles de paginación: navegación entre páginas si total_pages > 1', async () => {
    const listPaginatedSpy = vi.spyOn(businessApi, 'listPaginated').mockResolvedValue({
      data: mockBusinesses,
      pagination: { page: 1, per_page: 25, total: 50, total_pages: 2 },
    });

    render(
      <AuthProvider>
        <MemoryRouter>
          <AdminBusinessesPage />
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Pagina 1 di 2')).toBeInTheDocument();
    });

    const nextBtn = screen.getByText('→');
    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(listPaginatedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 2,
        })
      );
    });
  });

  it('5. Limpieza de autoregistro: no expone columna "Autoregistrazione" ni avisos MVP en modales', async () => {
    vi.spyOn(businessApi, 'listPaginated').mockResolvedValue({
      data: mockBusinesses,
      pagination: { page: 1, per_page: 25, total: 2, total_pages: 1 },
    });

    render(
      <AuthProvider>
        <MemoryRouter>
          <AdminBusinessesPage />
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Pasticceria Bellini')).toBeInTheDocument();
    });

    // 1. Verificar que la columna "Autoregistrazione" no existe en la tabla
    expect(screen.queryByText('Autoregistrazione')).not.toBeInTheDocument();

    // 2. Abrir modal de creación y verificar que no existe el aviso MVP
    const createBtn = screen.getByText('➕ Nuovo Commercio');
    fireEvent.click(createBtn);

    expect(screen.getByText('Crea Nuovo Commercio')).toBeInTheDocument();
    expect(screen.queryByText(/Autoregistrazione: non disponibile nel MVP/i)).not.toBeInTheDocument();

    // Cerrar modal
    const cancelCreateBtn = screen.getByText('Annulla');
    fireEvent.click(cancelCreateBtn);

    // 3. Abrir modal de edición y verificar que tampoco existe el aviso MVP
    const editBtns = screen.getAllByText(/Modifica/);
    fireEvent.click(editBtns[0]);

    expect(screen.getByText(/Modifica Commercio/i)).toBeInTheDocument();
    expect(screen.queryByText(/Autoregistrazione: non disponibile nel MVP/i)).not.toBeInTheDocument();
  });
});
