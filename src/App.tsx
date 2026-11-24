import React from 'react';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { AppShell } from './components/layout/AppShell.tsx';
import { AuthPages } from './pages/AuthPages.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { BatchDetailsPage, InventoryListPage, MedicineFormPage } from './pages/InventoryPages.tsx';
import { ExpiryTrackingPage } from './pages/ExpiryTrackingPage.tsx';
import { CreateListingPage, MarketplacePage } from './pages/MarketplacePages.tsx';
import { ExchangeHistoryPage, ExchangeRequestsPage } from './pages/ExchangeWorkflowPages.tsx';
import { OrganizationDirectoryPage, OrganizationProfilePage } from './pages/OrganizationPages.tsx';
import {
  NotificationsPage,
  ReportsPage,
  SettingsPage,
  UserManagementPage,
} from './pages/OperationsPages.tsx';

function MediStockRouter() {
  const { isAuthenticated, routeState } = useAuth();

  if (!isAuthenticated) {
    return <AuthPages />;
  }

  let page: React.ReactNode = <DashboardPage />;
  switch (routeState.route) {
    case 'dashboard':
      page = <DashboardPage />;
      break;
    case 'inventory':
      page = <InventoryListPage />;
      break;
    case 'inventory-new':
    case 'inventory-edit':
      page = <MedicineFormPage />;
      break;
    case 'batch-details':
      page = <BatchDetailsPage />;
      break;
    case 'expiry':
      page = <ExpiryTrackingPage />;
      break;
    case 'marketplace':
      page = <MarketplacePage />;
      break;
    case 'marketplace-new':
      page = <CreateListingPage />;
      break;
    case 'exchange-requests':
      page = <ExchangeRequestsPage />;
      break;
    case 'exchange-history':
      page = <ExchangeHistoryPage />;
      break;
    case 'organizations':
      page = <OrganizationDirectoryPage />;
      break;
    case 'organization-profile':
      page = <OrganizationProfilePage />;
      break;
    case 'notifications':
      page = <NotificationsPage />;
      break;
    case 'reports':
      page = <ReportsPage />;
      break;
    case 'users':
      page = <UserManagementPage />;
      break;
    case 'settings':
      page = <SettingsPage />;
      break;
    default:
      page = <DashboardPage />;
  }

  return <AppShell>{page}</AppShell>;
}

export default function App() {
  return (
    <AuthProvider>
      <MediStockRouter />
      <Toaster position="top-right" richColors closeButton />
    </AuthProvider>
  );
}
