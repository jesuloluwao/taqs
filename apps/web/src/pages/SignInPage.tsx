import { SignIn, useAuth } from '@clerk/clerk-react';
import { Link, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';

const clerkAppearance = {
  variables: {
    colorPrimary: '#1A7F5E',
    colorBackground: '#ffffff',
    colorText: '#1A202C',
    colorTextSecondary: '#718096',
    colorInputBackground: '#ffffff',
    colorInputText: '#1A202C',
    colorDanger: '#E53E3E',
    fontFamily: '"DM Sans", system-ui, sans-serif',
    fontFamilyButtons: '"DM Sans", system-ui, sans-serif',
    borderRadius: '8px',
    spacingUnit: '4px',
  },
  elements: {
    rootBox: 'w-full',
    card: 'shadow-none border-0 p-0',
    headerTitle: 'hidden',
    headerSubtitle: 'hidden',
    socialButtonsBlockButton:
      'border border-border rounded-lg h-11 font-medium text-sm text-neutral-900 hover:bg-neutral-100/60 transition-colors',
    socialButtonsBlockButtonText: 'font-medium',
    dividerRow: 'my-4',
    dividerText: 'text-xs text-neutral-500',
    formFieldLabel: 'text-sm font-medium text-neutral-900 mb-1',
    formFieldInput:
      'h-11 rounded-lg border border-border bg-white text-neutral-900 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors',
    formButtonPrimary:
      'h-11 bg-primary hover:bg-primary/90 text-white font-medium rounded-lg transition-all hover:shadow-medium active:scale-[0.98]',
    footerActionLink: 'text-primary font-medium hover:underline',
    identityPreviewText: 'text-sm text-neutral-900',
    identityPreviewEditButton: 'text-primary text-sm',
    formFieldSuccessText: 'text-xs text-success',
    formFieldErrorText: 'text-xs text-danger',
    alertText: 'text-sm',
    formResendCodeLink: 'text-primary text-sm font-medium hover:underline',
  },
};

export default function SignInPage() {
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
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm animate-slide-up">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2">
            <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center">
              <span className="text-white font-display font-bold text-base">T</span>
            </div>
            <span className="font-display font-semibold text-neutral-900 text-xl">TaxEase</span>
          </Link>
          <h1 className="mt-6 text-heading-lg font-display text-neutral-900">Welcome back</h1>
          <p className="mt-1 text-body-sm text-neutral-500">Sign in to your account</p>
        </div>

        {/* Clerk SignIn component */}
        <div className="bg-white rounded-2xl shadow-soft border border-border p-6">
          <SignIn
            routing="path"
            path="/sign-in"
            signUpUrl="/sign-up"
            forceRedirectUrl="/app/onboarding"
            appearance={clerkAppearance}
          />
        </div>

        {/* Footer */}
        <p className="text-center text-body-sm text-neutral-500 mt-6">
          Don&apos;t have an account?{' '}
          <Link to="/sign-up" className="text-primary font-medium hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
