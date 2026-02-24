import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import Landing from './pages/Landing';
import AppShell from './components/AppShell';
import Dashboard from './pages/Dashboard';
import Income from './pages/Income';
import Expenses from './pages/Expenses';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import SignInPage from './pages/SignInPage';
import SignUpPage from './pages/SignUpPage';

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

/** Placeholder for onboarding wizard — built in US-007 */
function OnboardingPlaceholder() {
  const { isSignedIn, isLoaded } = useAuth();
  const me = useQuery(api.userCrud.getMe);

  if (!isLoaded || (isSignedIn && me === undefined)) {
    return <LoadingSpinner />;
  }

  if (!isSignedIn) {
    return <Navigate to="/sign-in" replace />;
  }

  if (me?.onboardingComplete) {
    return <Navigate to="/app/dashboard" replace />;
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="text-center animate-slide-up">
        <div className="w-14 h-14 bg-primary rounded-2xl flex items-center justify-center mx-auto mb-4">
          <span className="text-white font-display font-bold text-xl">T</span>
        </div>
        <h1 className="text-heading-lg font-display text-neutral-900 mb-2">
          Welcome to TaxEase
        </h1>
        <p className="text-body text-neutral-500">Onboarding wizard coming soon…</p>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/sign-in/*" element={<SignInPage />} />
        <Route path="/sign-up/*" element={<SignUpPage />} />
        <Route path="/app/onboarding" element={<OnboardingPlaceholder />} />
        <Route
          path="/app"
          element={
            <AuthGate>
              <AppShell />
            </AuthGate>
          }
        >
          <Route index element={<Navigate to="/app/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="income" element={<Income />} />
          <Route path="expenses" element={<Expenses />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
