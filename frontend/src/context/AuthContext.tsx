import React, { createContext, useContext, useEffect, useRef, useState, useMemo } from 'react';
import type { User, Business, BusinessModule } from '../types';
import { authApi, businessApi } from '../api/services';

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
  sessionState: 'active' | 'pending_2fa' | 'pending_2fa_setup' | null;
  /** Modules enabled for activeBusiness. null = not yet loaded. */
  activeModules: BusinessModule[] | null;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  switchBusiness: (businessId: number) => void;
  selectBusiness: (business: Business) => void;
  clearActiveBusiness: () => void;
  exitMerchantMode: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  /** Returns true if a given module code is enabled for activeBusiness. */
  hasModule: (code: string) => boolean;
  refreshSession: () => Promise<void>;
  /** Evict modules cache for a specific businessId (call after updating modules). */
  invalidateModulesCache: (businessId: number) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ACTIVE_BIZ_STORAGE_KEY = 'vantaggi_active_business_id';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [activeBusinessId, setActiveBusinessId] = useState<number | null>(() => {
    const saved = localStorage.getItem(ACTIVE_BIZ_STORAGE_KEY);
    return saved ? Number(saved) : null;
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshSession = async () => {
    try {
      const data = await authApi.me();
      setUser(data.user);

      if (data.user && (data.user.session_state === 'active' || !data.user.session_state)) {
        try {
          const bizList: Business[] = (data as any).businesses ?? (await businessApi.list());
          setBusinesses(bizList);
          
          if (!data.user.is_super_admin && bizList.length > 0) {
            setActiveBusinessId((prev) => {
              if (prev && bizList.some((b: Business) => b.id === prev)) {
                return prev;
              }
              const firstId = bizList[0].id;
              localStorage.setItem(ACTIVE_BIZ_STORAGE_KEY, String(firstId));
              return firstId;
            });
          } else if (data.user.is_super_admin) {
            // Super Admin: only keep activeBusinessId if it still exists in the business list
            setActiveBusinessId((prev) => {
              if (prev && bizList.some((b: Business) => b.id === prev)) {
                return prev;
              }
              localStorage.removeItem(ACTIVE_BIZ_STORAGE_KEY);
              return null;
            });
          }
        } catch {
          setBusinesses([]);
        }
      } else {
        setBusinesses([]);
      }
    } catch {
      setUser(null);
      setBusinesses([]);
      setActiveBusinessId(null);
      localStorage.removeItem(ACTIVE_BIZ_STORAGE_KEY);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshSession();
  }, []);

  const activeBusiness = useMemo(() => {
    if (!activeBusinessId || businesses.length === 0) return null;
    return businesses.find((b) => b.id === activeBusinessId) || null;
  }, [activeBusinessId, businesses]);

  const isSuperAdmin = Boolean(user?.is_super_admin);

  const role = useMemo(() => {
    if (isSuperAdmin) return 'super_admin';
    return activeBusiness?.role || null;
  }, [isSuperAdmin, activeBusiness]);

  // Modules cache: { [businessId]: BusinessModule[] }
  const modulesCacheRef = useRef<Record<number, BusinessModule[]>>({});
  const [activeModules, setActiveModules] = useState<BusinessModule[] | null>(null);

  useEffect(() => {
    if (!activeBusiness) {
      setActiveModules(null);
      return;
    }
    const cached = modulesCacheRef.current[activeBusiness.id];
    if (cached) {
      setActiveModules(cached);
      return;
    }
    // Load and cache
    businessApi.listModules(activeBusiness.id)
      .then((mods) => {
        modulesCacheRef.current[activeBusiness.id] = mods;
        setActiveModules(mods);
      })
      .catch(() => {
        setActiveModules([]);
      });
  }, [activeBusiness?.id]);

  const invalidateModulesCache = (businessId: number) => {
    delete modulesCacheRef.current[businessId];
    if (activeBusiness?.id === businessId) {
      setActiveModules(null);
      // Reload immediately
      businessApi.listModules(businessId)
        .then((mods) => {
          modulesCacheRef.current[businessId] = mods;
          setActiveModules(mods);
        })
        .catch(() => setActiveModules([]));
    }
  };

  const hasModule = (code: string): boolean => {
    if (!activeModules) return true; // while loading, don't hide
    return activeModules.some((m) => m.code === code && m.is_enabled);
  };

  const hasPermission = (permission: string): boolean => {
    if (isSuperAdmin) return true;
    if (!role) return false;
    const permissions = ROLE_PERMISSIONS[role] || [];
    return permissions.includes(permission);
  };

  const login = async (email: string, password: string): Promise<User> => {
    setIsLoading(true);
    try {
      const res = await authApi.login(email, password);
      setUser(res.user);
      await refreshSession();
      return res.user;
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
      localStorage.removeItem(ACTIVE_BIZ_STORAGE_KEY);
      setIsLoading(false);
    }
  };

  const switchBusiness = (businessId: number) => {
    const found = businesses.find((b) => b.id === businessId);
    if (found) {
      setActiveBusinessId(businessId);
      localStorage.setItem(ACTIVE_BIZ_STORAGE_KEY, String(businessId));
    }
  };

  const selectBusiness = (business: Business) => {
    setActiveBusinessId(business.id);
    localStorage.setItem(ACTIVE_BIZ_STORAGE_KEY, String(business.id));
    if (!businesses.some((b) => b.id === business.id)) {
      setBusinesses((prev) => [...prev, business]);
    }
  };

  const clearActiveBusiness = () => {
    setActiveBusinessId(null);
    localStorage.removeItem(ACTIVE_BIZ_STORAGE_KEY);
  };

  const exitMerchantMode = async () => {
    const bizId = activeBusinessId;
    clearActiveBusiness();
    if (bizId) {
      try {
        await businessApi.logImpersonateExit(bizId);
      } catch {
        // Ignora errori di rete nel log di uscita
      }
    }
  };

  // Timer di inattività 25 minuti per Super Admin in Vista Commerciante
  useEffect(() => {
    if (!isSuperAdmin || !activeBusinessId) return;

    const INACTIVITY_LIMIT_MS = 25 * 60 * 1000; // 25 minuti
    let timer: NodeJS.Timeout;

    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        exitMerchantMode().then(() => {
          alert('Sessione commerciante scaduta per inattività (25 minuti). Sei tornato al pannello Super Admin.');
          window.location.href = '/admin/businesses';
        });
      }, INACTIVITY_LIMIT_MS);
    };

    resetTimer();

    const activityEvents = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    activityEvents.forEach((ev) => window.addEventListener(ev, resetTimer));

    return () => {
      clearTimeout(timer);
      activityEvents.forEach((ev) => window.removeEventListener(ev, resetTimer));
    };
  }, [isSuperAdmin, activeBusinessId]);

  const sessionState = user?.session_state || (user ? 'active' : null);
  const isAuthenticated = Boolean(user && sessionState === 'active');

  return (
    <AuthContext.Provider
      value={{
        user,
        businesses,
        activeBusiness,
        role,
        isSuperAdmin,
        isLoading,
        isAuthenticated,
        sessionState,
        activeModules,
        login,
        logout,
        switchBusiness,
        selectBusiness,
        clearActiveBusiness,
        exitMerchantMode,
        hasPermission,
        hasModule,
        refreshSession,
        invalidateModulesCache,
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
