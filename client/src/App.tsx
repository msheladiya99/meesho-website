import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';

import { useAuthStore } from './store/authStore';
import AppLayout from './components/layout/AppLayout';
import ErrorBoundary from './components/ui/ErrorBoundary';
import { healthPingService } from './services/healthPing.service';

// Lazy-loaded Pages (Code Splitting for optimal bundle size)
const LoginPage = React.lazy(() => import('./pages/LoginPage'));
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const OrdersPage = React.lazy(() => import('./pages/OrdersPage'));
const PackingDispatchPage = React.lazy(() => import('./pages/PackingDispatchPage'));
const ReturnsPage = React.lazy(() => import('./pages/ReturnsPage'));
const ProductsPage = React.lazy(() => import('./pages/ProductsPage'));
const InventoryPage = React.lazy(() => import('./pages/InventoryPage'));
const StockPurchasesPage = React.lazy(() => import('./pages/StockPurchasesPage'));
const VendorsPage = React.lazy(() => import('./pages/VendorsPage'));
const ExpensesPage = React.lazy(() => import('./pages/ExpensesPage'));
const PartnersPage = React.lazy(() => import('./pages/PartnersPage'));
const PnLPage = React.lazy(() => import('./pages/PnLPage'));
const AnalyticsPage = React.lazy(() => import('./pages/AnalyticsPage'));
const ReportsPage = React.lazy(() => import('./pages/ReportsPage'));
const SettingsPage = React.lazy(() => import('./pages/SettingsPage'));
const UsersPage = React.lazy(() => import('./pages/UsersPage'));
const AuditLogsPage = React.lazy(() => import('./pages/AuditLogsPage'));
const PerfumePerformancePage = React.lazy(() => import('./pages/PerfumePerformancePage'));
const CustomerReturnChargesPage = React.lazy(() => import('./pages/CustomerReturnChargesPage'));
const PaymentsPage = React.lazy(() => import('./pages/PaymentsPage'));

const PageLoadingFallback: React.FC = () => (
  <div className="flex min-h-[60vh] w-full items-center justify-center">
    <div className="flex flex-col items-center gap-3">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      <p className="text-sm font-medium text-gray-500">Loading...</p>
    </div>
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
};

const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <Navigate to="/" replace /> : <>{children}</>;
};

function App() {
  React.useEffect(() => {
    healthPingService.start();
    return () => {
      healthPingService.stop();
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <BrowserRouter>
          <React.Suspense fallback={<PageLoadingFallback />}>
            <Routes>
              <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
              
              <Route path="/" element={<PrivateRoute><AppLayout /></PrivateRoute>}>
                <Route index element={<Dashboard />} />
                <Route path="orders" element={<OrdersPage />} />
                <Route path="packing" element={<PackingDispatchPage />} />
                <Route path="returns" element={<ReturnsPage />} />
                <Route path="payments" element={<PaymentsPage />} />
                <Route path="perfume-sales" element={<PerfumePerformancePage />} />
                <Route path="perfume-analytics" element={<PerfumePerformancePage />} />
                <Route path="products" element={<ProductsPage />} />
                <Route path="inventory" element={<InventoryPage />} />
                <Route path="stock-purchases" element={<StockPurchasesPage />} />
                <Route path="vendors" element={<VendorsPage />} />
                <Route path="expenses" element={<ExpensesPage />} />
                <Route path="partners" element={<PartnersPage />} />
                <Route path="pnl" element={<PnLPage />} />
                <Route path="analytics" element={<AnalyticsPage />} />
                <Route path="reports" element={<ReportsPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="return-charges" element={<CustomerReturnChargesPage />} />
                <Route path="users" element={<UsersPage />} />
                <Route path="audit" element={<AuditLogsPage />} />
              </Route>

              {/* Catch all */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </React.Suspense>
        </BrowserRouter>
      </ErrorBoundary>

      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            borderRadius: '10px',
            background: '#1f2937',
            color: '#f9fafb',
            fontSize: '13px',
          },
          success: { iconTheme: { primary: '#10b981', secondary: '#f9fafb' } },
          error: { iconTheme: { primary: '#ef4444', secondary: '#f9fafb' } },
        }}
      />
    </QueryClientProvider>
  );
}

export default App;
