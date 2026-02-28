import { SignUp, useAuth } from '@clerk/clerk-react';
import { Link, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

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
  layout: {
    socialButtonsPlacement: 'top' as const,
  },
  elements: {
    rootBox: 'w-full max-w-none',
    cardBox: 'w-full max-w-none shadow-none',
    card: 'shadow-none border-0 p-0 w-full max-w-none',
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

export default function SignUpPage() {
  const { isSignedIn, isLoaded } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn) {
      navigate('/app/onboarding', { replace: true });
    }
  }, [isLoaded, isSignedIn, navigate]);

  if (!isLoaded || isSignedIn) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md animate-slide-up">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2">
            <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center">
              <span className="text-white font-display font-bold text-base">T</span>
            </div>
            <span className="font-display font-semibold text-neutral-900 text-xl">TaxEase</span>
          </Link>
          <h1 className="mt-6 text-heading-lg font-display text-neutral-900">Create your account</h1>
          <p className="mt-1 text-body-sm text-neutral-500">
            Start filing taxes the smart way
          </p>
        </div>

        {/* Clerk SignUp component */}
        <div className="bg-white rounded-2xl shadow-soft border border-border p-6">
          <SignUp
            routing="path"
            path="/sign-up"
            signInUrl="/sign-in"
            forceRedirectUrl="/app/onboarding"
            appearance={clerkAppearance}
          />
        </div>

        {/* Terms */}
        <p className="text-center text-body-sm text-neutral-500 mt-4 px-4">
          By signing up you agree to our{' '}
          <a href="#" className="text-primary font-medium hover:underline">
            Terms of Service
          </a>{' '}
          and{' '}
          <a href="#" className="text-primary font-medium hover:underline">
            Privacy Policy
          </a>
        </p>

        {/* Footer */}
        <p className="text-center text-body-sm text-neutral-500 mt-3">
          Already have an account?{' '}
          <Link to="/sign-in" className="text-primary font-medium hover:underline">
            Log in instead
          </Link>
        </p>
      </div>
    </div>
  );
}
