import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import { Toaster } from 'sonner';
import Landing from './pages/Landing';
import AppShell from './components/AppShell';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import TransactionDetail from './pages/TransactionDetail';
import ImportTransactions from './pages/ImportTransactions';
import Triage from './pages/Triage';
import Invoices from './pages/Invoices';
import TaxSummary from './pages/TaxSummary';
import Filing from './pages/Filing';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import TaxEntities from './pages/TaxEntities';
import Notifications from './pages/Notifications';
import DeleteAccount from './pages/DeleteAccount';
import HelpSupport from './pages/HelpSupport';
import Documents from './pages/Documents';
import SignInPage from './pages/SignInPage';
import SignUpPage from './pages/SignUpPage';
import Onboarding from './pages/Onboarding';
import { EntityProvider } from './contexts/EntityContext';

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

/** Redirects unauthenticated users to sign-in; authenticated without onboarding to /app/onboarding */
function AuthGate({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded } = useAuth();
  const me = useQuery(api.userCrud.getMe);

  if (!isLoaded || (isSignedIn && me === undefined)) {
    return <LoadingSpinner />;
  }

  if (!isSignedIn) {
    return <Navigate to="/sign-in" replace />;
  }

  if (!me?.onboardingComplete) {
    return <Navigate to="/app/onboarding" replace />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <Toaster richColors position="top-center" />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/sign-in/*" element={<SignInPage />} />
        <Route path="/sign-up/*" element={<SignUpPage />} />
        <Route path="/app/onboarding" element={<Onboarding />} />
        <Route
          path="/app"
          element={
            <AuthGate>
              <EntityProvider>
                <AppShell />
              </EntityProvider>
            </AuthGate>
          }
        >
          <Route index element={<Navigate to="/app/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="transactions" element={<Transactions />} />
          <Route path="transactions/:id" element={<TransactionDetail />} />
          <Route path="import" element={<ImportTransactions />} />
          <Route path="triage" element={<Triage />} />
          <Route path="invoices" element={<Invoices />} />
          <Route path="tax-summary" element={<TaxSummary />} />
          <Route path="filing" element={<Filing />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings />} />
          <Route path="settings/entities" element={<TaxEntities />} />
          <Route path="settings/notifications" element={<Notifications />} />
          <Route path="settings/delete-account" element={<DeleteAccount />} />
          <Route path="help" element={<HelpSupport />} />
          <Route path="documents" element={<Documents />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
