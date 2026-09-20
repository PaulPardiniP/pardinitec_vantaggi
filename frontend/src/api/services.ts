import { apiRequest, generateOperationId, setCsrfToken } from './client';
import type {
  User,
  Business,
  BusinessModule,
  Member,
  Customer,
  Consent,
  CardProfile,
  LoyaltyAccount,
  Credential,
  LoyaltyProgram,
  PointsTransaction,
  Reward,
  Offer,
  Card,
  PublicCardView,
  BusinessInvitation,
  BusinessPackages,
} from '../types';

// ==================== AUTH ====================
export const authApi = {
  async me(): Promise<{ user: User; csrf_token?: string }> {
    const res = await apiRequest<{ success: boolean; data: { user: User; csrf_token: string } }>('/api/v1/auth/me');
    if (res.data?.csrf_token) {
      setCsrfToken(res.data.csrf_token);
    }
    return res.data;
  },

  async login(email: string, password: string): Promise<{ user: User; csrf_token: string }> {
    const res = await apiRequest<{ success: boolean; data: { user: User; csrf_token: string } }>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (res.data?.csrf_token) {
      setCsrfToken(res.data.csrf_token);
    }
    return res.data;
  },

  async logout(): Promise<void> {
    await apiRequest('/api/v1/auth/logout', { method: 'POST' });
    setCsrfToken(null);
  },

  async setup2fa(): Promise<{ uri: string; secret: string }> {
    const res = await apiRequest<{ success: boolean; data?: { uri: string; secret: string }; uri?: string; secret?: string }>('/api/v1/auth/2fa/setup', {
      method: 'POST',
    });
    return {
      uri: res.data?.uri || res.uri || '',
      secret: res.data?.secret || res.secret || '',
    };
  },

  async verify2faSetup(code: string): Promise<{ recovery_codes: string[]; user: User }> {
    const res = await apiRequest<{ success: boolean; data?: { recovery_codes: string[]; user: User }; recovery_codes?: string[]; user?: User }>('/api/v1/auth/2fa/verify-setup', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
    return {
      recovery_codes: res.data?.recovery_codes || res.recovery_codes || [],
      user: (res.data?.user || res.user) as User,
    };
  },

  async challenge2fa(code: string): Promise<{ user: User; csrf_token: string }> {
    const res = await apiRequest<{ success: boolean; data: { user: User; csrf_token: string } }>('/api/v1/auth/2fa/challenge', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
    if (res.data?.csrf_token) {
      setCsrfToken(res.data.csrf_token);
    }
    return res.data;
  },
};

// ==================== BUSINESSES ====================
export const businessApi = {
  async list(): Promise<Business[]> {
    const res = await apiRequest<{ success: boolean; data: Business[] }>('/api/v1/businesses');
    return res.data;
  },

  async listPaginated(params?: { search?: string; status?: 'all' | 'active' | 'inactive'; page?: number; per_page?: number }): Promise<{
    data: Business[];
    pagination: { page: number; per_page: number; total: number; total_pages: number };
  }> {
    const res = await apiRequest<{
      success: boolean;
      data: Business[];
      pagination: { page: number; per_page: number; total: number; total_pages: number };
    }>('/api/v1/admin/businesses', {
      params,
    });
    return { data: res.data, pagination: res.pagination };
  },

  async get(id: number): Promise<Business> {
    const res = await apiRequest<{ success: boolean; data: Business }>(`/api/v1/businesses/${id}`);
    return res.data;
  },

  async create(data: {
    name: string;
    slug?: string;
    tax_id?: string;
    self_registration_enabled?: boolean;
    owner_email?: string;
    owner_first_name?: string;
    owner_last_name?: string;
    packages?: {
      punti?: boolean;
      vantaggi?: boolean;
      vip?: boolean;
      campaigns?: boolean;
    };
  }): Promise<Business & { invitation?: BusinessInvitation; packages?: BusinessPackages }> {
    const res = await apiRequest<{ success: boolean; data: Business & { invitation?: BusinessInvitation; packages?: BusinessPackages } }>('/api/v1/businesses', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async update(id: number, data: { name?: string; slug?: string; tax_id?: string | null; self_registration_enabled?: boolean; status?: 'active' | 'inactive' }): Promise<Business> {
    const res = await apiRequest<{ success: boolean; data: Business }>(`/api/v1/businesses/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async toggleStatus(id: number, status?: 'active' | 'inactive'): Promise<Business> {
    const res = await apiRequest<{ success: boolean; data: Business }>(`/api/v1/businesses/${id}/toggle-status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
    return res.data;
  },

  async listMembers(businessId: number): Promise<Member[]> {
    const res = await apiRequest<{ success: boolean; data: Member[] }>(`/api/v1/businesses/${businessId}/members`);
    return res.data;
  },

  async addMember(businessId: number, data: { email: string; role: 'staff' | 'manager' | 'owner' }): Promise<Member> {
    const res = await apiRequest<{ success: boolean; data: Member }>(`/api/v1/businesses/${businessId}/members`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async removeMember(businessId: number, targetUserId: number): Promise<void> {
    await apiRequest(`/api/v1/businesses/${businessId}/members/${targetUserId}`, {
      method: 'DELETE',
    });
  },

  async listModules(businessId: number): Promise<BusinessModule[]> {
    const res = await apiRequest<{ success: boolean; data: BusinessModule[] }>(`/api/v1/businesses/${businessId}/modules`);
    return res.data;
  },

  async updateModule(businessId: number, moduleCode: string, isEnabled: boolean): Promise<BusinessModule[]> {
    const res = await apiRequest<{ success: boolean; data: BusinessModule[] }>(`/api/v1/businesses/${businessId}/modules`, {
      method: 'PUT',
      body: JSON.stringify({ module_code: moduleCode, is_enabled: isEnabled }),
    });
    return res.data;
  },

  async getPackages(businessId: number): Promise<{ packages: BusinessPackages; raw_modules: BusinessModule[] }> {
    const res = await apiRequest<any>(`/api/v1/businesses/${businessId}/packages`);
    const payload = res?.data || res;
    return {
      packages: payload?.packages || res?.packages,
      raw_modules: payload?.raw_modules || res?.raw_modules || [],
    };
  },

  async updatePackage(businessId: number, packageCode: string, enabled: boolean): Promise<{ packages: BusinessPackages; raw_modules: BusinessModule[] }> {
    const res = await apiRequest<any>(
      `/api/v1/businesses/${businessId}/packages`,
      {
        method: 'PUT',
        body: JSON.stringify({ package_code: packageCode, enabled }),
      }
    );
    const payload = res?.data || res;
    return {
      packages: payload?.packages || res?.packages,
      raw_modules: payload?.raw_modules || res?.raw_modules || [],
    };
  },

  // Invitaciones de Propietario / Miembros
  async createInvitation(
    businessId: number,
    data: { email: string; first_name?: string; last_name?: string; role: 'staff' | 'manager' }
  ): Promise<BusinessInvitation> {
    const res = await apiRequest<{ success: boolean; data: BusinessInvitation }>(
      `/api/v1/businesses/${businessId}/invitations`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
    return res.data;
  },

  async listInvitations(businessId: number): Promise<BusinessInvitation[]> {
    const res = await apiRequest<{ success: boolean; data: BusinessInvitation[] }>(`/api/v1/businesses/${businessId}/invitations`);
    return res.data;
  },

  async resendInvitation(businessId: number, invitationId: number): Promise<BusinessInvitation> {
    const res = await apiRequest<{ success: boolean; data: BusinessInvitation }>(
      `/api/v1/businesses/${businessId}/invitations/${invitationId}/resend`,
      { method: 'POST' }
    );
    return res.data;
  },

  async cancelInvitation(businessId: number, invitationId: number): Promise<{ id: number; status: string }> {
    const res = await apiRequest<{ success: boolean; data: { id: number; status: string } }>(
      `/api/v1/businesses/${businessId}/invitations/${invitationId}/cancel`,
      { method: 'POST' }
    );
    return res.data;
  },

  // Ciclo de Vida y GDPR
  async archive(businessId: number, isArchived = true): Promise<{ id: number; is_archived: boolean }> {
    const res = await apiRequest<{ success: boolean; data: { id: number; is_archived: boolean } }>(
      `/api/v1/admin/businesses/${businessId}/archive`,
      {
        method: 'POST',
        body: JSON.stringify({ is_archived: isArchived }),
      }
    );
    return res.data;
  },

  async terminate(businessId: number, retentionDays = 30): Promise<{ id: number; status: string; terminated_at: string; scheduled_deletion_at: string }> {
    const res = await apiRequest<{ success: boolean; data: { id: number; status: string; terminated_at: string; scheduled_deletion_at: string } }>(
      `/api/v1/admin/businesses/${businessId}/terminate`,
      {
        method: 'POST',
        body: JSON.stringify({ retention_days: retentionDays }),
      }
    );
    return res.data;
  },

  async cancelTermination(businessId: number): Promise<{ id: number; status: string; terminated_at: null; scheduled_deletion_at: null }> {
    const res = await apiRequest<{ success: boolean; data: { id: number; status: string; terminated_at: null; scheduled_deletion_at: null } }>(
      `/api/v1/admin/businesses/${businessId}/cancel-termination`,
      { method: 'POST' }
    );
    return res.data;
  },

  async exportData(businessId: number): Promise<void> {
    const res = await fetch(`/api/v1/admin/businesses/${businessId}/export`, {
      method: 'GET',
      credentials: 'include',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Errore durante l\'esportazione dei dati.');
    }
    const blob = await res.blob();
    const disposition = res.headers.get('content-disposition');
    let filename = `export_commercio_${businessId}.json`;
    if (disposition && disposition.indexOf('filename=') !== -1) {
      const match = disposition.match(/filename="?([^"]+)"?/);
      if (match && match[1]) {
        filename = match[1];
      }
    }
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },

  async deleteEmpty(businessId: number, confirmSlug: string): Promise<{ id: number; deleted: boolean }> {
    const res = await apiRequest<{ success: boolean; data: { id: number; deleted: boolean } }>(
      `/api/v1/admin/businesses/${businessId}/delete-empty`,
      {
        method: 'POST',
        body: JSON.stringify({ confirm_slug: confirmSlug }),
      }
    );
    return res.data;
  },
};

// ==================== INVITATIONS (PUBLIC) ====================
export const invitationApi = {
  async validate(token: string): Promise<{
    id: number;
    email: string;
    first_name: string;
    last_name: string;
    business_id: number;
    business_name: string;
    role: string;
    user_exists?: boolean;
  }> {
    const res = await apiRequest<{ success: boolean; data: any }>('/api/v1/invitations/validate', {
      params: { token },
    });
    return res.data;
  },

  async accept(token: string, password = ''): Promise<{ user_id: number; email: string; business_id: number; business_name: string; role?: string }> {
    const res = await apiRequest<{ success: boolean; data: any }>('/api/v1/invitations/accept', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    });
    return res.data;
  },
};

// ==================== CUSTOMERS ====================
export const customerApi = {
  async list(businessId: number, params?: { search?: string; page?: number; per_page?: number }): Promise<{
    data: Customer[];
    pagination: { page: number; per_page: number; total: number; total_pages: number };
  }> {
    const res = await apiRequest<{
      success: boolean;
      data: Customer[];
      pagination: { page: number; per_page: number; total: number; total_pages: number };
    }>(`/api/v1/businesses/${businessId}/customers`, {
      params,
    });
    return { data: res.data, pagination: res.pagination };
  },

  async get(businessId: number, customerId: number): Promise<Customer> {
    const res = await apiRequest<{ success: boolean; data: Customer }>(`/api/v1/businesses/${businessId}/customers/${customerId}`);
    return res.data;
  },

  async onboard(
    businessId: number,
    data: {
      first_name: string;
      last_name: string;
      phone?: string;
      email?: string;
      card_profile_id?: number;
      privacy_accepted: boolean;
      marketing_accepted?: boolean;
    }
  ): Promise<{
    customer: Customer;
    loyalty_account: LoyaltyAccount;
    access_credential: Credential;
    token: string;
    public_url: string;
  }> {
    const res = await apiRequest<{
      success: boolean;
      data: {
        customer: Customer;
        loyalty_account: LoyaltyAccount;
        access_credential: Credential;
        token: string;
        public_url: string;
      };
    }>(`/api/v1/businesses/${businessId}/customers/onboard`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async update(
    businessId: number,
    customerId: number,
    data: { first_name: string; last_name: string; phone?: string; email?: string }
  ): Promise<Customer> {
    const res = await apiRequest<{ success: boolean; data: Customer }>(`/api/v1/businesses/${businessId}/customers/${customerId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async getConsents(businessId: number, customerId: number): Promise<Consent[]> {
    const res = await apiRequest<{ success: boolean; data: Consent[] }>(
      `/api/v1/businesses/${businessId}/customers/${customerId}/consents`
    );
    return res.data;
  },

  async revokeMarketing(businessId: number, customerId: number): Promise<void> {
    await apiRequest(`/api/v1/businesses/${businessId}/customers/${customerId}/consents/revoke-marketing`, {
      method: 'POST',
    });
  },

  async grantMarketing(
    businessId: number,
    customerId: number,
    data?: { confirmed?: boolean; source?: string; privacy_policy_version?: string }
  ): Promise<Consent> {
    const res = await apiRequest<{ success: boolean; data: Consent }>(
      `/api/v1/businesses/${businessId}/customers/${customerId}/consents/grant-marketing`,
      {
        method: 'POST',
        body: JSON.stringify({ confirmed: true, ...(data || {}) }),
      }
    );
    return res.data;
  },

  async recordConsent(
    businessId: number,
    customerId: number,
    data: { type: 'privacy' | 'marketing'; status: 'granted' | 'revoked'; source?: string }
  ): Promise<Consent> {
    const res = await apiRequest<{ success: boolean; data: Consent }>(
      `/api/v1/businesses/${businessId}/customers/${customerId}/consents`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
    return res.data;
  },
};

// ==================== LOYALTY & CREDENTIALS ====================
export const loyaltyApi = {
  async listProfiles(): Promise<CardProfile[]> {
    const res = await apiRequest<{ success: boolean; data: CardProfile[] }>('/api/v1/card-profiles');
    return res.data;
  },

  async listAccounts(businessId: number, customerId: number): Promise<LoyaltyAccount[]> {
    const res = await apiRequest<{ success: boolean; data: LoyaltyAccount[] }>(
      `/api/v1/businesses/${businessId}/customers/${customerId}/loyalty-accounts`
    );
    return res.data;
  },

  async createAccount(
    businessId: number,
    customerId: number,
    profileCode: 'punti' | 'vantaggi' | 'vip',
    issueCredential: boolean = false
  ): Promise<any> {
    const res = await apiRequest<{
      success: boolean;
      data: any;
    }>(
      `/api/v1/businesses/${businessId}/customers/${customerId}/loyalty-accounts`,
      {
        method: 'POST',
        body: JSON.stringify({ profile_code: profileCode, issue_credential: issueCredential }),
      }
    );
    return res.data;
  },

  async listAccountCredentials(businessId: number, accountId: number): Promise<Credential[]> {
    const res = await apiRequest<{ success: boolean; data: Credential[] }>(
      `/api/v1/businesses/${businessId}/loyalty-accounts/${accountId}/credentials`
    );
    return res.data;
  },

  async issueDigitalCredential(businessId: number, accountId: number): Promise<Credential & { token: string; public_url: string }> {
    const res = await apiRequest<{ success: boolean; data: Credential & { token: string; public_url: string } }>(
      `/api/v1/businesses/${businessId}/loyalty-accounts/${accountId}/credentials`,
      {
        method: 'POST',
      }
    );
    return res.data;
  },

  async rotateCredential(businessId: number, credentialId: number): Promise<Credential & { token: string; public_url: string }> {
    const res = await apiRequest<{ success: boolean; data: Credential & { token: string; public_url: string } }>(
      `/api/v1/businesses/${businessId}/credentials/${credentialId}/rotate`,
      {
        method: 'POST',
      }
    );
    return res.data;
  },

  async revealLink(businessId: number, credentialId: number): Promise<{ credential_id: number; token: string; public_url: string }> {
    const res = await apiRequest<{ success: boolean; data: { credential_id: number; token: string; public_url: string } }>(
      `/api/v1/businesses/${businessId}/credentials/${credentialId}/reveal-link`,
      {
        method: 'POST',
      }
    );
    return res.data;
  },

  async revokeCredential(businessId: number, credentialId: number): Promise<void> {
    await apiRequest(`/api/v1/businesses/${businessId}/credentials/${credentialId}/revoke`, {
      method: 'POST',
    });
  },

  async getAccountPreview(businessId: number, accountId: number): Promise<PublicCardView> {
    const res = await apiRequest<{ success: boolean; data: PublicCardView }>(
      `/api/v1/businesses/${businessId}/loyalty-accounts/${accountId}/preview`
    );
    return res.data;
  },
};

// ==================== POINTS ====================
export const pointsApi = {
  async getProgram(businessId: number): Promise<LoyaltyProgram> {
    const res = await apiRequest<{ success: boolean; data: LoyaltyProgram }>(`/api/v1/businesses/${businessId}/loyalty-program`);
    return res.data;
  },

  async updateProgram(businessId: number, data: Partial<LoyaltyProgram>): Promise<LoyaltyProgram> {
    const res = await apiRequest<{ success: boolean; data: LoyaltyProgram }>(`/api/v1/businesses/${businessId}/loyalty-program`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async calculate(businessId: number, amount: number): Promise<{ spent_amount: number; points: number; calculated_points: number }> {
    const res = await apiRequest<{ success: boolean; data: { spent_amount?: number; points?: number; calculated_points?: number } }>(
      `/api/v1/businesses/${businessId}/loyalty-program/calculate`,
      {
        method: 'POST',
        body: JSON.stringify({ spent_amount: amount, amount }),
      }
    );
    const data = res.data || {};
    const pts = data.calculated_points ?? data.points ?? 0;
    return {
      spent_amount: data.spent_amount ?? amount,
      points: pts,
      calculated_points: pts,
    };
  },

  async adjust(
    businessId: number,
    accountId: number,
    data: { points?: number; points_delta?: number; reason?: string; operation_id?: string; type?: string; spent_amount?: number }
  ): Promise<{ transaction: PointsTransaction; balance: number; new_balance: number; idempotent?: boolean }> {
    const opId = data.operation_id || generateOperationId();
    const rawVal = data.points !== undefined ? data.points : data.points_delta;
    const pointsNum = typeof rawVal === 'number' ? Math.trunc(rawVal) : parseInt(String(rawVal || 0), 10);
    const res = await apiRequest<{
      success: boolean;
      data: { transaction: PointsTransaction; balance: number; new_balance?: number; idempotent?: boolean };
    }>(`/api/v1/businesses/${businessId}/loyalty-accounts/${accountId}/points/adjust`, {
      method: 'POST',
      body: JSON.stringify({
        points: pointsNum,
        reason: data.reason,
        operation_id: opId,
        type: data.type,
        spent_amount: data.spent_amount,
      }),
    });
    const balanceVal = res.data.balance !== undefined ? res.data.balance : (res.data.new_balance ?? 0);
    return {
      ...res.data,
      balance: balanceVal,
      new_balance: res.data.new_balance !== undefined ? res.data.new_balance : balanceVal,
    };
  },

  async listTransactions(
    businessId: number,
    accountId: number,
    page = 1,
    perPage = 10
  ): Promise<{ data: PointsTransaction[]; pagination: { page: number; per_page: number; total: number; total_pages: number } }> {
    const res = await apiRequest<{
      success: boolean;
      data: PointsTransaction[];
      pagination: { page: number; per_page: number; total: number; total_pages: number };
    }>(`/api/v1/businesses/${businessId}/loyalty-accounts/${accountId}/points/transactions`, {
      params: { page, per_page: perPage },
    });
    return { data: res.data, pagination: res.pagination };
  },

  async listBusinessTransactions(
    businessId: number,
    page = 1,
    perPage = 10
  ): Promise<{ data: (PointsTransaction & { customer_id?: number; customer_name?: string; customer_phone?: string; customer_email?: string; profile_name?: string; profile_code?: string })[]; pagination: { page: number; per_page: number; total: number; total_pages: number } }> {
    const res = await apiRequest<{
      success: boolean;
      data: (PointsTransaction & { customer_id?: number; customer_name?: string; customer_phone?: string; customer_email?: string; profile_name?: string; profile_code?: string })[];
      pagination: { page: number; per_page: number; total: number; total_pages: number };
    }>(`/api/v1/businesses/${businessId}/points/transactions`, {
      params: { page, per_page: perPage },
    });
    return { data: res.data || [], pagination: res.pagination || { page, per_page: perPage, total: 0, total_pages: 1 } };
  },
};

// ==================== REWARDS ====================
export const rewardsApi = {
  async list(businessId: number, all = false, profile?: string, status?: string): Promise<Reward[]> {
    const res = await apiRequest<{ success: boolean; data: Reward[] }>(`/api/v1/businesses/${businessId}/rewards`, {
      params: { all: all ? '1' : undefined, profile, status },
    });
    return res.data;
  },

  async create(businessId: number, data: Partial<Reward>): Promise<Reward> {
    const res = await apiRequest<{ success: boolean; data: Reward }>(`/api/v1/businesses/${businessId}/rewards`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async update(businessId: number, rewardId: number, data: Partial<Reward>): Promise<Reward> {
    const res = await apiRequest<{ success: boolean; data: Reward }>(`/api/v1/businesses/${businessId}/rewards/${rewardId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async delete(businessId: number, rewardId: number): Promise<{ action: 'deleted' | 'archived'; message: string }> {
    const res = await apiRequest<{ success: boolean; data: { action: 'deleted' | 'archived'; message: string }; message?: string }>(
      `/api/v1/businesses/${businessId}/rewards/${rewardId}`,
      { method: 'DELETE' }
    );
    return res.data || { action: 'deleted', message: res.message || '' };
  },

  async restore(businessId: number, rewardId: number): Promise<Reward> {
    const res = await apiRequest<{ success: boolean; data: Reward }>(
      `/api/v1/businesses/${businessId}/rewards/${rewardId}/restore`,
      { method: 'POST' }
    );
    return res.data;
  },

  async redeem(
    businessId: number,
    accountId: number,
    rewardId: number,
    operationId?: string,
    notes?: string,
    deliveryConfirmed: boolean = true
  ): Promise<{ redemption_id: number; reward_id: number; points_spent: number; new_balance: number; idempotent?: boolean }> {
    const opId = operationId || generateOperationId();
    const res = await apiRequest<{
      success: boolean;
      data: { redemption_id: number; reward_id: number; points_spent: number; new_balance: number; idempotent?: boolean };
    }>(`/api/v1/businesses/${businessId}/loyalty-accounts/${accountId}/rewards/${rewardId}/redeem`, {
      method: 'POST',
      body: JSON.stringify({
        operation_id: opId,
        notes: notes || undefined,
        delivery_confirmed: deliveryConfirmed,
      }),
    });
    return res.data;
  },
};

// ==================== OFFERS ====================
export const offersApi = {
  async list(businessId: number, all = false, targetAudience?: string, status?: string): Promise<Offer[]> {
    const res = await apiRequest<{ success: boolean; data: Offer[] }>(`/api/v1/businesses/${businessId}/offers`, {
      params: { all: all ? '1' : undefined, target_audience: targetAudience, status },
    });
    return res.data;
  },

  async create(businessId: number, data: Partial<Offer>): Promise<Offer> {
    const res = await apiRequest<{ success: boolean; data: Offer }>(`/api/v1/businesses/${businessId}/offers`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async update(businessId: number, offerId: number, data: Partial<Offer>): Promise<Offer> {
    const res = await apiRequest<{ success: boolean; data: Offer }>(`/api/v1/businesses/${businessId}/offers/${offerId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async delete(businessId: number, offerId: number): Promise<{ action: 'deleted' | 'archived'; message: string }> {
    const res = await apiRequest<{ success: boolean; data: { action: 'deleted' | 'archived'; message: string }; message?: string }>(
      `/api/v1/businesses/${businessId}/offers/${offerId}`,
      { method: 'DELETE' }
    );
    return res.data || { action: 'deleted', message: res.message || '' };
  },

  async restore(businessId: number, offerId: number): Promise<Offer> {
    const res = await apiRequest<{ success: boolean; data: Offer }>(
      `/api/v1/businesses/${businessId}/offers/${offerId}/restore`,
      { method: 'POST' }
    );
    return res.data;
  },

  async redeem(
    businessId: number,
    accountId: number,
    offerId: number,
    operationId?: string
  ): Promise<{ redemption_id: number; offer_id: number; loyalty_account_id: number; redeemed_at: string; idempotent?: boolean }> {
    const opId = operationId || generateOperationId();
    const res = await apiRequest<{
      success: boolean;
      data: { redemption_id: number; offer_id: number; loyalty_account_id: number; redeemed_at: string; idempotent?: boolean };
    }>(`/api/v1/businesses/${businessId}/loyalty-accounts/${accountId}/offers/${offerId}/redeem`, {
      method: 'POST',
      body: JSON.stringify({ operation_id: opId }),
    });
    return res.data;
  },
};

// ==================== CARDS ====================
export const cardsApi = {
  // Super Admin
  async listAdminCards(status?: string, page = 1, perPage = 20): Promise<{ data: Card[]; pagination: any }> {
    const res = await apiRequest<{ success: boolean; data: Card[]; pagination: any }>('/api/v1/admin/cards', {
      params: { status, page, per_page: perPage },
    });
    return { data: res.data, pagination: res.pagination };
  },

  async createBatch(quantity: number, designProfileId?: number): Promise<{ created_count?: number; count?: number; cards?: any[]; data?: Card[] }> {
    const res = await apiRequest<{ success: boolean; data: Card[]; count: number }>('/api/v1/admin/cards/batch', {
      method: 'POST',
      body: JSON.stringify({ count: quantity, quantity, design_profile_id: designProfileId }),
    });
    return { created_count: res.count, count: res.count, data: res.data, cards: res.data };
  },

  async assign(businessId: number, cardIds: number[]): Promise<{ assigned_count: number }> {
    const res = await apiRequest<{ success: boolean; data: { assigned_count: number } }>('/api/v1/admin/cards/assign', {
      method: 'POST',
      body: JSON.stringify({ business_id: businessId, card_ids: cardIds }),
    });
    return res.data;
  },

  // Business staff/owner
  async listBusinessCards(businessId: number, status?: string): Promise<Card[]> {
    const res = await apiRequest<{ success: boolean; data: Card[] }>(`/api/v1/businesses/${businessId}/cards`, {
      params: { status },
    });
    return res.data;
  },

  async activate(
    businessId: number,
    cardId: number,
    loyaltyAccountId: number
  ): Promise<{ card: Card; token: string; public_url: string }> {
    const res = await apiRequest<{ success: boolean; data: { card: Card; token: string; public_url: string } }>(
      `/api/v1/businesses/${businessId}/cards/${cardId}/activate`,
      {
        method: 'POST',
        body: JSON.stringify({ loyalty_account_id: loyaltyAccountId }),
      }
    );
    return res.data;
  },

  async suspend(businessId: number, cardId: number): Promise<Card> {
    const res = await apiRequest<{ success: boolean; data: Card }>(`/api/v1/businesses/${businessId}/cards/${cardId}/suspend`, {
      method: 'POST',
    });
    return res.data;
  },

  async reactivate(
    businessId: number,
    cardId: number
  ): Promise<Card & { token?: string; public_url?: string; requires_reprogramming?: boolean }> {
    const res = await apiRequest<{
      success: boolean;
      data: Card & { token?: string; public_url?: string; requires_reprogramming?: boolean };
    }>(`/api/v1/businesses/${businessId}/cards/${cardId}/reactivate`, {
      method: 'POST',
    });
    return res.data;
  },

  async revoke(businessId: number, cardId: number): Promise<Card> {
    const res = await apiRequest<{ success: boolean; data: Card }>(`/api/v1/businesses/${businessId}/cards/${cardId}/revoke`, {
      method: 'POST',
    });
    return res.data;
  },

  async replace(
    businessId: number,
    oldCardId: number,
    newCardId: number
  ): Promise<{ old_card: Card; new_card: Card; token: string; public_url: string }> {
    const res = await apiRequest<{
      success: boolean;
      data: { old_card: Card; new_card: Card; token: string; public_url: string };
    }>(`/api/v1/businesses/${businessId}/cards/${oldCardId}/replace`, {
      method: 'POST',
      body: JSON.stringify({ new_card_id: newCardId }),
    });
    return res.data;
  },

  async reassign(
    businessId: number,
    cardId: number,
    newLoyaltyAccountId: number
  ): Promise<{ card: Card; requires_reprogramming: boolean; token: string; public_url: string }> {
    const res = await apiRequest<{
      success: boolean;
      data: { card: Card; requires_reprogramming: boolean; token: string; public_url: string };
    }>(`/api/v1/businesses/${businessId}/cards/${cardId}/reassign`, {
      method: 'POST',
      body: JSON.stringify({ new_loyalty_account_id: newLoyaltyAccountId }),
    });
    return res.data;
  },
};

// ==================== PUBLIC CARDS ====================
export const publicCardApi = {
  async resolve(token: string): Promise<PublicCardView> {
    const res = await apiRequest<{ success: boolean; data: PublicCardView }>(`/api/v1/public/cards/${token}`);
    return res.data;
  },
};

