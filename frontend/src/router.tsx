import { createBrowserRouter } from 'react-router-dom';
import { LoginPage } from './pages/auth/LoginPage';
import { HomePage } from './pages/public/HomePage';
import { PublicCardPage } from './pages/public/PublicCardPage';
import { DashboardLayout } from './layouts/DashboardLayout';
import { AdminLayout } from './layouts/AdminLayout';
import { ProtectedRoute } from './components/common/ProtectedRoute';

import { OverviewPage } from './pages/dashboard/OverviewPage';
import { CustomersPage } from './pages/dashboard/CustomersPage';
import { CustomerDetailPage } from './pages/dashboard/CustomerDetailPage';
import { PointsPage } from './pages/dashboard/PointsPage';
import { RewardsPage } from './pages/dashboard/RewardsPage';
import { OffersPage } from './pages/dashboard/OffersPage';
import { CardsPage } from './pages/dashboard/CardsPage';
import { MembersPage } from './pages/dashboard/MembersPage';
import { SettingsPage } from './pages/dashboard/SettingsPage';
import { CampaignsPage } from './pages/dashboard/CampaignsPage';

import { LoyaltyAccountPreviewPage } from './pages/dashboard/LoyaltyAccountPreviewPage';

import { AdminOverviewPage } from './pages/admin/AdminOverviewPage';
import { AdminBusinessesPage } from './pages/admin/AdminBusinessesPage';
import { AdminCardsPage } from './pages/admin/AdminCardsPage';
import { AdminPlansPage } from './pages/admin/AdminPlansPage';
import { AdminAuditPage } from './pages/admin/AdminAuditPage';

import { TwoFactorPage } from './pages/auth/TwoFactorPage';
import { NotFoundPage } from './pages/NotFoundPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <HomePage />,
  },
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/c/:token',
    element: <PublicCardPage />,
  },
  {
    path: '/dashboard',
    element: (
      <ProtectedRoute>
        <DashboardLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <OverviewPage /> },
      { path: 'customers', element: <CustomersPage /> },
      { path: 'customers/:id', element: <CustomerDetailPage /> },
      { path: 'loyalty-accounts/:accountId/preview', element: <LoyaltyAccountPreviewPage /> },
      { path: 'points', element: <PointsPage /> },
      { path: 'rewards', element: <RewardsPage /> },
      { path: 'offers', element: <OffersPage /> },
      { path: 'cards', element: <CardsPage /> },
      { path: 'members', element: <MembersPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'campaigns', element: <CampaignsPage /> },
    ],
  },
  {
    path: '/admin',
    element: (
      <ProtectedRoute requireSuperAdmin={true}>
        <AdminLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <AdminOverviewPage /> },
      { path: 'businesses', element: <AdminBusinessesPage /> },
      { path: 'cards', element: <AdminCardsPage /> },
      { path: 'plans', element: <AdminPlansPage /> },
      { path: 'audit', element: <AdminAuditPage /> },
    ],
  },
  { path: '/2fa', element: <TwoFactorPage /> },
  { path: '*', element: <NotFoundPage /> },
]);
