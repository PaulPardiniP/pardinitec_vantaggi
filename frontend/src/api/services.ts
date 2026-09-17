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
} from '../types';

// ==================== AUTH ====================
export const authApi = {
  async me(): Promise<{ user: User; businesses: Business[] }> {
    const res = await apiRequest<{ success: boolean; data: { user: User; businesses: Business[] } }>('/api/v1/auth/me');
    return res.data;
  },

  async login(email: string, password: string): Promise<{ user: User; csrf_token: string; session_id_hash?: string }> {
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
};

// ==================== BUSINESSES ====================
export const businessApi = {
  async list(): Promise<Business[]> {
    const res = await apiRequest<{ success: boolean; data: Business[] }>('/api/v1/businesses');
    return res.data;
  },

  async get(id: number): Promise<Business> {
    const res = await apiRequest<{ success: boolean; data: Business }>(`/api/v1/businesses/${id}`);
    return res.data;
  },

  async create(data: { name: string; slug: string; tax_id?: string }): Promise<Business> {
    const res = await apiRequest<{ success: boolean; data: Business }>('/api/v1/businesses', {
      method: 'POST',
      body: JSON.stringify(data),
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

  async createAccount(businessId: number, customerId: number, profileCode: 'punti' | 'vantaggi' | 'vip'): Promise<LoyaltyAccount> {
    const res = await apiRequest<{ success: boolean; data: LoyaltyAccount }>(
      `/api/v1/businesses/${businessId}/customers/${customerId}/loyalty-accounts`,
      {
        method: 'POST',
        body: JSON.stringify({ profile_code: profileCode }),
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

  async revokeCredential(businessId: number, credentialId: number): Promise<void> {
    await apiRequest(`/api/v1/businesses/${businessId}/credentials/${credentialId}/revoke`, {
      method: 'POST',
    });
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

  async calculate(businessId: number, amount: number): Promise<{ amount: number; calculated_points: number; mode: string }> {
    const res = await apiRequest<{ success: boolean; data: { amount: number; calculated_points: number; mode: string } }>(
      `/api/v1/businesses/${businessId}/loyalty-program/calculate`,
      {
        method: 'POST',
        body: JSON.stringify({ amount }),
      }
    );
    return res.data;
  },

  async adjust(
    businessId: number,
    accountId: number,
    data: { points_delta: number; reason?: string; operation_id?: string }
  ): Promise<{ transaction: PointsTransaction; new_balance: number; idempotent?: boolean }> {
    const opId = data.operation_id || generateOperationId();
    const res = await apiRequest<{
      success: boolean;
      data: { transaction: PointsTransaction; new_balance: number; idempotent?: boolean };
    }>(`/api/v1/businesses/${businessId}/loyalty-accounts/${accountId}/points/adjust`, {
      method: 'POST',
      body: JSON.stringify({ ...data, operation_id: opId }),
    });
    return res.data;
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
};

// ==================== REWARDS ====================
export const rewardsApi = {
  async list(businessId: number, all = false): Promise<Reward[]> {
    const res = await apiRequest<{ success: boolean; data: Reward[] }>(`/api/v1/businesses/${businessId}/rewards`, {
      params: { all: all ? '1' : undefined },
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

  async delete(businessId: number, rewardId: number): Promise<void> {
    await apiRequest(`/api/v1/businesses/${businessId}/rewards/${rewardId}`, {
      method: 'DELETE',
    });
  },

  async redeem(
    businessId: number,
    accountId: number,
    rewardId: number,
    operationId?: string
  ): Promise<{ redemption_id: number; reward_id: number; points_spent: number; new_balance: number; idempotent?: boolean }> {
    const opId = operationId || generateOperationId();
    const res = await apiRequest<{
      success: boolean;
      data: { redemption_id: number; reward_id: number; points_spent: number; new_balance: number; idempotent?: boolean };
    }>(`/api/v1/businesses/${businessId}/loyalty-accounts/${accountId}/rewards/${rewardId}/redeem`, {
      method: 'POST',
      body: JSON.stringify({ operation_id: opId }),
    });
    return res.data;
  },
};

// ==================== OFFERS ====================
export const offersApi = {
  async list(businessId: number, all = false): Promise<Offer[]> {
    const res = await apiRequest<{ success: boolean; data: Offer[] }>(`/api/v1/businesses/${businessId}/offers`, {
      params: { all: all ? '1' : undefined },
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

  async delete(businessId: number, offerId: number): Promise<void> {
    await apiRequest(`/api/v1/businesses/${businessId}/offers/${offerId}`, {
      method: 'DELETE',
    });
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

  async createBatch(quantity: number, designProfileId?: number): Promise<{ created_count: number; cards: any[] }> {
    const res = await apiRequest<{ success: boolean; data: { created_count: number; cards: any[] } }>('/api/v1/admin/cards/batch', {
      method: 'POST',
      body: JSON.stringify({ quantity, design_profile_id: designProfileId }),
    });
    return res.data;
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

  async activate(businessId: number, cardId: number, loyaltyAccountId: number): Promise<Card> {
    const res = await apiRequest<{ success: boolean; data: Card }>(`/api/v1/businesses/${businessId}/cards/${cardId}/activate`, {
      method: 'POST',
      body: JSON.stringify({ loyalty_account_id: loyaltyAccountId }),
    });
    return res.data;
  },

  async suspend(businessId: number, cardId: number): Promise<Card> {
    const res = await apiRequest<{ success: boolean; data: Card }>(`/api/v1/businesses/${businessId}/cards/${cardId}/suspend`, {
      method: 'POST',
    });
    return res.data;
  },

  async reactivate(businessId: number, cardId: number): Promise<Card> {
    const res = await apiRequest<{ success: boolean; data: Card }>(`/api/v1/businesses/${businessId}/cards/${cardId}/reactivate`, {
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

  async replace(businessId: number, oldCardId: number, newCardId: number): Promise<{ old_card: Card; new_card: Card }> {
    const res = await apiRequest<{ success: boolean; data: { old_card: Card; new_card: Card } }>(
      `/api/v1/businesses/${businessId}/cards/${oldCardId}/replace`,
      {
        method: 'POST',
        body: JSON.stringify({ new_card_id: newCardId }),
      }
    );
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
    const res = await apiRequest<{ success: boolean; data: PublicCardView }>(`/c/${token}`);
    return res.data;
  },
};
