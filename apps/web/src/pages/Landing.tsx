import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import { useEffect } from 'react';
import { ArrowRight, CheckCircle, TrendingUp, FileText } from 'lucide-react';

export default function Landing() {
  const { isSignedIn, isLoaded } = useAuth();
  const navigate = useNavigate();
  const me = useQuery(api.userCrud.getMe);

  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn && me !== undefined) {
      if (me?.onboardingComplete) {
        navigate('/app/dashboard', { replace: true });
      } else {
        navigate('/app/onboarding', { replace: true });
      }
    }
  }, [isLoaded, isSignedIn, me, navigate]);

  if (!isLoaded || isSignedIn) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="px-6 py-4 flex items-center justify-between max-w-5xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <span className="text-white font-display font-bold text-sm">T</span>
          </div>
          <span className="font-display font-semibold text-neutral-900 text-lg">TaxEase</span>
        </div>
        <Link
          to="/sign-in"
          className="text-sm font-medium text-neutral-500 hover:text-neutral-900 transition-colors"
        >
          Sign in
        </Link>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 animate-fade-in">
        {/* Illustration area */}
        <div className="mb-10 relative">
          <div className="w-24 h-24 bg-primary/10 rounded-3xl flex items-center justify-center shadow-soft">
            <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center shadow-medium">
              <FileText className="w-8 h-8 text-white" />
            </div>
          </div>
          {/* Decorative dots */}
          <div className="absolute -top-3 -right-3 w-4 h-4 bg-warning rounded-full opacity-70" />
          <div className="absolute -bottom-2 -left-2 w-3 h-3 bg-accent rounded-full opacity-60" />
        </div>

        <div className="max-w-lg text-center">
          <div className="inline-flex items-center gap-2 bg-primary-light text-primary text-label font-medium rounded-full px-4 py-1.5 mb-6">
            <span className="w-1.5 h-1.5 bg-primary rounded-full" />
            Built for the Nigeria Tax Act 2025
          </div>

          <h1 className="text-heading-xl font-display text-neutral-900 mb-4 leading-tight">
            Tax compliance, made simple<br />
            <span className="text-primary">for Nigerians</span>
          </h1>

          <p className="text-body text-neutral-500 mb-10 max-w-sm mx-auto">
            Track income, file returns, and stay penalty-free — all in one place.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center gap-3 justify-center mb-12">
            <Link
              to="/sign-up"
              className="inline-flex items-center gap-2 bg-primary text-white px-8 py-3 rounded-lg font-medium text-body hover:bg-primary/90 transition-all hover:shadow-medium active:scale-95 w-full sm:w-auto justify-center"
            >
              Get Started
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/sign-in"
              className="inline-flex items-center text-body font-medium text-neutral-500 hover:text-neutral-900 transition-colors"
            >
              I already have an account
            </Link>
          </div>

          {/* Feature chips */}
          <div className="flex flex-wrap justify-center gap-3">
            {[
              { icon: TrendingUp, text: 'Automatic tax calculation' },
              { icon: CheckCircle, text: 'NTA 2025 compliant' },
              { icon: FileText, text: 'Self-assessment filing' },
            ].map(({ icon: Icon, text }) => (
              <div
                key={text}
                className="flex items-center gap-2 bg-white border border-border rounded-full px-4 py-2 shadow-soft"
              >
                <Icon className="w-3.5 h-3.5 text-primary" />
                <span className="text-body-sm text-neutral-500">{text}</span>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center">
        <p className="text-body-sm text-neutral-500">
          &copy; {new Date().getFullYear()} TaxEase Nigeria. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
