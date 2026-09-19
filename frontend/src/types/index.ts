export interface User {
  id: number;
  name?: string;
  email: string;
  is_super_admin: boolean;
  status: string;
  created_at?: string;
  totp_enabled?: boolean;
  session_state?: 'active' | 'pending_2fa' | 'pending_2fa_setup';
}

export interface Business {
  id: number;
  name: string;
  slug: string;
  tax_id: string | null;
  status: string;
  self_registration_enabled: boolean;
  role: string;
  joined_at?: string;
}

export interface BusinessModule {
  code: string;
  name: string;
  description: string | null;
  is_enabled: boolean;
}

export interface Member {
  id: number;
  business_id: number;
  user_id: number;
  email: string;
  role: 'owner' | 'manager' | 'staff';
  status: string;
  joined_at: string;
}

export interface ConsentHistory {
  id: number;
  type: 'privacy' | 'marketing';
  status: 'granted' | 'revoked';
  source: string;
  text_version: string;
  granted_at: string;
  revoked_at: string | null;
}

/** Forma real devuelta por el API: objeto con flags + historial */
export interface CustomerConsents {
  privacy_granted: boolean;
  marketing_granted: boolean;
  history: ConsentHistory[];
}

export interface Customer {
  id: number;
  business_id: number;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
  consents?: CustomerConsents;
  loyalty_accounts?: LoyaltyAccount[];
}

/** @deprecated Use ConsentHistory instead */
export interface Consent {
  id: number;
  business_id: number;
  customer_id: number;
  type: 'privacy' | 'marketing';
  status: 'granted' | 'revoked';
  source: string;
  text_version: string;
  granted_at: string;
  revoked_at: string | null;
}

export interface CardProfile {
  id: number;
  code: 'punti' | 'vantaggi' | 'vip';
  name: string;
  status: string;
}

export interface LoyaltyAccount {
  id: number;
  business_id: number;
  customer_id: number;
  card_profile_id: number;
  profile_code: 'punti' | 'vantaggi' | 'vip';
  profile_name: string;
  balance: number;
  status: 'active' | 'suspended' | 'closed';
  created_at: string;
}

export interface Credential {
  id: number;
  business_id: number;
  loyalty_account_id: number | null;
  card_id: number | null;
  type: 'digital' | 'physical';
  status: 'active' | 'suspended' | 'revoked' | 'replaced';
  issued_at: string;
  token?: string;
  public_url?: string;
}

export interface LoyaltyProgram {
  business_id: number;
  mode: 'fixed_per_purchase' | 'points_per_amount' | 'manual';
  points_ratio: number;
  fixed_points: number;
  description: string | null;
}

export interface PointsTransaction {
  id: number;
  business_id: number;
  loyalty_account_id: number;
  type: string;
  points_delta: number;
  balance_after: number;
  reason: string | null;
  operation_id: string;
  created_at: string;
}

export interface Reward {
  id: number;
  business_id: number;
  name: string;
  description: string | null;
  points_cost: number;
  card_profile_id: number | null;
  status: 'active' | 'inactive';
  created_at?: string;
}

export interface Offer {
  id: number;
  business_id: number;
  title: string;
  description: string | null;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  offer_type?: string;
  discount_percentage?: number;
  formatted_benefit?: string;
  target_audience?: 'vantaggi' | 'vip' | 'vantaggi_vip' | 'all';
  is_vip: boolean;
  card_profile_id: number | null;
  profile_name?: string | null;
  profile_code?: string | null;
  is_single_use: boolean;
  status: 'active' | 'inactive' | 'expired';
  start_date?: string | null;
  end_date?: string | null;
  created_at?: string;
}

export interface Card {
  id: number;
  business_id: number | null;
  loyalty_account_id: number | null;
  customer_id?: number | null;
  profile_name?: string | null;
  profile_code?: string | null;
  design_profile_id: number | null;
  status: 'inventory' | 'issued' | 'active' | 'suspended' | 'revoked' | 'replaced';
  issued_at: string | null;
  assigned_at: string | null;
  revoked_at: string | null;
  replaced_by_card_id: number | null;
  created_at: string;
  requires_reprogramming?: boolean;
}

export interface PublicCardView {
  state: 'active' | 'forbidden' | 'not_available' | 'suspended' | 'inventory' | 'issued' | 'revoked' | 'replaced';
  mode?: 'public' | 'staff' | 'super_admin' | 'cross_tenant';
  credential_id?: number;
  credential_type?: string;
  business?: {
    id: number;
    name: string;
    slug: string;
  };
  loyalty_account?: {
    id: number;
    profile_code: 'punti' | 'vantaggi' | 'vip';
    profile_name: string;
    balance?: number;
    status: string;
  };
  customer?: {
    id: number;
    first_name: string;
    last_name: string;
    phone?: string;
    email?: string;
  };
  program?: LoyaltyProgram;
  next_reward?: {
    id: number;
    name: string;
    points_cost: number;
    points_needed: number;
    progress_percent: number;
  } | null;
  rewards?: Reward[];
  offers?: Offer[];
  recent_transactions?: PointsTransaction[];
  actions?: {
    can_adjust_points?: boolean;
    can_redeem_rewards?: boolean;
    can_redeem_offers?: boolean;
  };
  message?: string;
  card_id?: number;
}
