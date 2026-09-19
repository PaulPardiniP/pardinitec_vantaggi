import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Spinner } from './Spinner';
import { Alert } from './Alert';

export function isSafeInternalPath(path: string | null): boolean {
  if (!path) return false;
  // Deve iniziare con '/' e non con '//' o schema 'http:' / 'https:' / 'javascript:'
  return path.startsWith('/') && !path.startsWith('//') && !path.includes('\\');
}

export interface ProtectedRouteProps {
  children: React.ReactNode;
  requireSuperAdmin?: boolean;
  requiredPermission?: string;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requireSuperAdmin = false,
  requiredPermission,
}) => {
  const { isAuthenticated, isSuperAdmin, hasPermission, isLoading, user, sessionState } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner size="lg" text="Caricamento sessione..." />
      </div>
    );
  }

  if (user && sessionState === 'pending_2fa_setup') {
    return <Navigate to="/2fa?mode=setup" replace />;
  }

  if (user && sessionState === 'pending_2fa') {
    return <Navigate to="/2fa" replace />;
  }

  if (!isAuthenticated) {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?return_to=${returnTo}`} replace />;
  }

  if (requireSuperAdmin && !isSuperAdmin) {
    return (
      <div className="main-content" style={{ marginTop: '2rem' }}>
        <Alert
          type="error"
          status={403}
          message="Quest'area è riservata esclusivamente agli amministratori di sistema (Super Admin)."
        />
      </div>
    );
  }

  if (requiredPermission && !hasPermission(requiredPermission)) {
    return (
      <div className="main-content" style={{ marginTop: '2rem' }}>
        <Alert
          type="error"
          status={403}
          message={`Non disponi del permesso richiesto (${requiredPermission}) per visualizzare questa sezione.`}
        />
      </div>
    );
  }

  return <>{children}</>;
};
