import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import type { User, Business } from '../types';
import { authApi } from '../api/services';

const ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: [
    'business.view', 'business.update', 'business.delete',
    'members.view', 'members.manage', 'operations.execute',
    'customer.view', 'customer.edit', 'points.adjust', 'reward.redeem',
    'card.assign', 'card.reassign', 'card.revoke',
    'offer.manage', 'offer.redeem', 'campaign.send',
    'user.manage', 'settings.manage'
  ],
  owner: [
    'business.view', 'business.update', 'business.delete',
    'members.view', 'members.manage', 'operations.execute',
    'customer.view', 'customer.edit', 'points.adjust', 'reward.redeem',
    'card.assign', 'card.reassign', 'card.revoke',
    'offer.manage', 'offer.redeem', 'campaign.send',
    'user.manage', 'settings.manage'
  ],
  manager: [
    'business.view', 'business.update',
    'members.view', 'members.manage', 'operations.execute',
    'customer.view', 'customer.edit', 'points.adjust', 'reward.redeem',
    'card.assign', 'card.reassign', 'card.revoke',
    'offer.manage', 'offer.redeem', 'campaign.send'
  ],
  staff: [
    'business.view', 'customer.view', 'customer.edit',
    'points.adjust', 'reward.redeem', 'offer.redeem',
    'operations.execute', 'card.assign'
  ],
};

interface AuthContextType {
  user: User | null;
  businesses: Business[];
  activeBusiness: Business | null;
  role: string | null;
  isSuperAdmin: boolean;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  switchBusiness: (businessId: number) => void;
  hasPermission: (permission: string) => boolean;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [activeBusinessId, setActiveBusinessId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshSession = async () => {
    try {
      const data = await authApi.me();
      setUser(data.user);
      setBusinesses(data.businesses || []);
      if (data.businesses && data.businesses.length > 0) {
        setActiveBusinessId((prev) => {
          if (prev && data.businesses.some((b) => b.id === prev)) {
            return prev;
          }
          return data.businesses[0].id;
        });
      }
    } catch {
      setUser(null);
      setBusinesses([]);
      setActiveBusinessId(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshSession();
  }, []);

  const activeBusiness = useMemo(() => {
    if (!activeBusinessId || businesses.length === 0) return null;
    return businesses.find((b) => b.id === activeBusinessId) || businesses[0] || null;
  }, [activeBusinessId, businesses]);

  const isSuperAdmin = Boolean(user?.is_super_admin);

  const role = useMemo(() => {
    if (isSuperAdmin) return 'super_admin';
    return activeBusiness?.role || null;
  }, [isSuperAdmin, activeBusiness]);

  const hasPermission = (permission: string): boolean => {
    if (isSuperAdmin) return true;
    if (!role) return false;
    const permissions = ROLE_PERMISSIONS[role] || [];
    return permissions.includes(permission);
  };

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      await authApi.login(email, password);
      await refreshSession();
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await authApi.logout();
    } catch {
      // Ignora errori di rete nel logout
    } finally {
      setUser(null);
      setBusinesses([]);
      setActiveBusinessId(null);
      setIsLoading(false);
    }
  };

  const switchBusiness = (businessId: number) => {
    if (businesses.some((b) => b.id === businessId)) {
      setActiveBusinessId(businessId);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        businesses,
        activeBusiness,
        role,
        isSuperAdmin,
        isLoading,
        isAuthenticated: Boolean(user),
        login,
        logout,
        switchBusiness,
        hasPermission,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve essere utilizzato all\'interno di un AuthProvider');
  }
  return context;
}
