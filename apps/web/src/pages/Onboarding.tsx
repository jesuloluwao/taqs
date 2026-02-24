import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';

// ─── Constants ────────────────────────────────────────────────────────────────

const PROFESSIONS = [
  'Software Developer',
  'Designer / Creative',
  'Writer / Content Creator',
  'Consultant',
  'Lawyer / Legal Professional',
  'Doctor / Healthcare',
  'Accountant / Finance',
  'Photographer / Videographer',
  'Marketing / PR',
  'Engineer',
  'Architect',
  'Teacher / Trainer',
  'Other',
] as const;

const INDUSTRIES = [
  'Agriculture / Farming',
  'Construction',
  'Education',
  'Financial Services',
  'Healthcare',
  'Hospitality / Food Service',
  'Manufacturing',
  'Media / Entertainment',
  'Oil & Gas',
  'Real Estate',
  'Retail / Trading',
  'Technology',
  'Transportation / Logistics',
  'Other',
] as const;

const TURNOVER_RANGES = [
  'Under ₦5 million',
  '₦5m – ₦25m',
  '₦25m – ₦50m',
  '₦50m – ₦100m',
  'Over ₦100m',
] as const;

const CURRENCIES = ['NGN', 'USD', 'GBP', 'EUR'] as const;
type Currency = (typeof CURRENCIES)[number];
type UserType = 'freelancer' | 'sme';

// ─── Sub-components ───────────────────────────────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
  const progress = ((current - 1) / (total - 1)) * 100;
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-2">
        <span className="text-body-sm font-medium text-neutral-500">
          Step {current} of {total}
        </span>
        <span className="text-body-sm font-medium text-primary">
          {Math.round(((current - 1) / total) * 100) + Math.round(100 / total)}%
        </span>
      </div>
      <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progress === 0 ? 4 : progress}%` }}
        />
      </div>
      <div className="flex mt-3 gap-1.5">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className={`flex-1 h-0.5 rounded-full transition-colors duration-300 ${
              i < current ? 'bg-primary' : 'bg-neutral-200'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

interface FieldProps {
  label: string;
  error?: string;
  children: React.ReactNode;
}

function Field({ label, error, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-neutral-900">{label}</label>
      {children}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

// ─── Step 1: User Type Selection ──────────────────────────────────────────────

interface Step1Props {
  selected: UserType | null;
  onSelect: (type: UserType) => void;
  onContinue: () => void;
}

function Step1({ selected, onSelect, onContinue }: Step1Props) {
  return (
    <div className="animate-slide-up">
      <h2 className="text-heading-lg font-display text-neutral-900 mb-2">
        How do you earn income?
      </h2>
      <p className="text-body text-neutral-500 mb-8">
        This helps us tailor your tax experience to your situation.
      </p>

      <div className="flex flex-col gap-4 mb-8">
        <button
          type="button"
          onClick={() => onSelect('freelancer')}
          className={`w-full text-left p-5 rounded-2xl border-2 transition-all duration-200 ${
            selected === 'freelancer'
              ? 'border-primary bg-primary/5 shadow-medium'
              : 'border-border bg-white hover:border-primary/40 hover:bg-neutral-100/50'
          }`}
        >
          <div className="flex items-start gap-4">
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                selected === 'freelancer' ? 'bg-primary' : 'bg-neutral-100'
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`w-5 h-5 ${selected === 'freelancer' ? 'text-white' : 'text-neutral-500'}`}
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="font-display font-semibold text-neutral-900">Freelancer</span>
                {selected === 'freelancer' && (
                  <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                    <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                )}
              </div>
              <p className="text-body-sm text-neutral-500 mt-1">
                I earn income from clients, gigs, or self-employment
              </p>
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onSelect('sme')}
          className={`w-full text-left p-5 rounded-2xl border-2 transition-all duration-200 ${
            selected === 'sme'
              ? 'border-primary bg-primary/5 shadow-medium'
              : 'border-border bg-white hover:border-primary/40 hover:bg-neutral-100/50'
          }`}
        >
          <div className="flex items-start gap-4">
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                selected === 'sme' ? 'bg-primary' : 'bg-neutral-100'
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`w-5 h-5 ${selected === 'sme' ? 'text-white' : 'text-neutral-500'}`}
              >
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="font-display font-semibold text-neutral-900">SME / Business</span>
                {selected === 'sme' && (
                  <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                    <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                )}
              </div>
              <p className="text-body-sm text-neutral-500 mt-1">
                I operate a registered business or company
              </p>
            </div>
          </div>
        </button>
      </div>

      <button
        type="button"
        onClick={onContinue}
        disabled={!selected}
        className="w-full h-12 bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-all hover:shadow-medium active:scale-[0.98] font-sans"
      >
        Continue
      </button>
    </div>
  );
}

// ─── Step 2a: Freelancer Form ─────────────────────────────────────────────────

interface FreelancerFormErrors {
  firstName?: string;
  lastName?: string;
  profession?: string;
}

interface Step2FreelancerProps {
  firstName: string;
  lastName: string;
  profession: string;
  currency: Currency;
  onChange: (field: string, value: string) => void;
  onBack: () => void;
  onContinue: () => void;
  loading: boolean;
}

function Step2Freelancer({
  firstName,
  lastName,
  profession,
  currency,
  onChange,
  onBack,
  onContinue,
  loading,
}: Step2FreelancerProps) {
  const [errors, setErrors] = useState<FreelancerFormErrors>({});

  function validate() {
    const e: FreelancerFormErrors = {};
    if (!firstName.trim()) e.firstName = 'First name is required';
    if (!lastName.trim()) e.lastName = 'Last name is required';
    if (!profession) e.profession = 'Please select a profession';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleContinue() {
    if (validate()) onContinue();
  }

  return (
    <div className="animate-slide-up">
      <h2 className="text-heading-lg font-display text-neutral-900 mb-2">
        Tell us about yourself
      </h2>
      <p className="text-body text-neutral-500 mb-8">
        We'll use this to personalise your tax profile.
      </p>

      <div className="flex flex-col gap-5 mb-8">
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" error={errors.firstName}>
            <input
              type="text"
              value={firstName}
              onChange={(e) => onChange('firstName', e.target.value)}
              placeholder="Ada"
              className={`h-11 px-3 rounded-lg border bg-white text-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors ${
                errors.firstName ? 'border-danger focus:border-danger' : 'border-border focus:border-primary'
              }`}
            />
          </Field>
          <Field label="Last name" error={errors.lastName}>
            <input
              type="text"
              value={lastName}
              onChange={(e) => onChange('lastName', e.target.value)}
              placeholder="Okafor"
              className={`h-11 px-3 rounded-lg border bg-white text-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors ${
                errors.lastName ? 'border-danger focus:border-danger' : 'border-border focus:border-primary'
              }`}
            />
          </Field>
        </div>

        <Field label="Primary profession" error={errors.profession}>
          <select
            value={profession}
            onChange={(e) => onChange('profession', e.target.value)}
            className={`h-11 px-3 rounded-lg border bg-white text-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors appearance-none ${
              errors.profession ? 'border-danger focus:border-danger' : 'border-border focus:border-primary'
            } ${!profession ? 'text-neutral-400' : ''}`}
          >
            <option value="" disabled>Select profession</option>
            {PROFESSIONS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </Field>

        <Field label="Primary income currency">
          <div className="grid grid-cols-4 gap-2">
            {CURRENCIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onChange('currency', c)}
                className={`h-11 rounded-lg border-2 text-sm font-medium transition-all ${
                  currency === c
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border bg-white text-neutral-600 hover:border-primary/40'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </Field>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="h-12 px-6 rounded-xl border-2 border-border text-neutral-700 font-medium hover:bg-neutral-100/60 transition-colors font-sans"
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleContinue}
          disabled={loading}
          className="flex-1 h-12 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white font-medium rounded-xl transition-all hover:shadow-medium active:scale-[0.98] font-sans"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              Saving…
            </span>
          ) : (
            'Continue'
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Step 2b: SME Form ────────────────────────────────────────────────────────

interface SmeFormErrors {
  businessName?: string;
  industry?: string;
  annualTurnoverRange?: string;
}

interface Step2SmeProps {
  businessName: string;
  businessType: 'business_name' | 'llc';
  industry: string;
  annualTurnoverRange: string;
  onChange: (field: string, value: string) => void;
  onBack: () => void;
  onContinue: () => void;
  loading: boolean;
}

function Step2Sme({
  businessName,
  businessType,
  industry,
  annualTurnoverRange,
  onChange,
  onBack,
  onContinue,
  loading,
}: Step2SmeProps) {
  const [errors, setErrors] = useState<SmeFormErrors>({});

  function validate() {
    const e: SmeFormErrors = {};
    if (!businessName.trim()) e.businessName = 'Business name is required';
    if (!industry) e.industry = 'Please select an industry';
    if (!annualTurnoverRange) e.annualTurnoverRange = 'Please select a turnover range';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleContinue() {
    if (validate()) onContinue();
  }

  return (
    <div className="animate-slide-up">
      <h2 className="text-heading-lg font-display text-neutral-900 mb-2">
        Tell us about your business
      </h2>
      <p className="text-body text-neutral-500 mb-8">
        We'll use this to set up your first tax entity.
      </p>

      <div className="flex flex-col gap-5 mb-8">
        <Field label="Business name" error={errors.businessName}>
          <input
            type="text"
            value={businessName}
            onChange={(e) => onChange('businessName', e.target.value)}
            placeholder="Acme Technologies Ltd"
            className={`h-11 px-3 rounded-lg border bg-white text-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors ${
              errors.businessName ? 'border-danger focus:border-danger' : 'border-border focus:border-primary'
            }`}
          />
        </Field>

        <Field label="Business type">
          <div className="grid grid-cols-2 gap-3">
            {(['business_name', 'llc'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onChange('businessType', t)}
                className={`h-11 px-3 rounded-lg border-2 text-sm font-medium transition-all text-left ${
                  businessType === t
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border bg-white text-neutral-600 hover:border-primary/40'
                }`}
              >
                {t === 'business_name' ? 'Registered Business Name' : 'LLC / Limited Company'}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Industry" error={errors.industry}>
          <select
            value={industry}
            onChange={(e) => onChange('industry', e.target.value)}
            className={`h-11 px-3 rounded-lg border bg-white text-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors appearance-none ${
              errors.industry ? 'border-danger focus:border-danger' : 'border-border focus:border-primary'
            } ${!industry ? 'text-neutral-400' : ''}`}
          >
            <option value="" disabled>Select industry</option>
            {INDUSTRIES.map((i) => (
              <option key={i} value={i}>{i}</option>
            ))}
          </select>
        </Field>

        <Field label="Annual turnover range" error={errors.annualTurnoverRange}>
          <select
            value={annualTurnoverRange}
            onChange={(e) => onChange('annualTurnoverRange', e.target.value)}
            className={`h-11 px-3 rounded-lg border bg-white text-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors appearance-none ${
              errors.annualTurnoverRange ? 'border-danger focus:border-danger' : 'border-border focus:border-primary'
            } ${!annualTurnoverRange ? 'text-neutral-400' : ''}`}
          >
            <option value="" disabled>Select range</option>
            {TURNOVER_RANGES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </Field>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="h-12 px-6 rounded-xl border-2 border-border text-neutral-700 font-medium hover:bg-neutral-100/60 transition-colors font-sans"
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleContinue}
          disabled={loading}
          className="flex-1 h-12 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white font-medium rounded-xl transition-all hover:shadow-medium active:scale-[0.98] font-sans"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              Saving…
            </span>
          ) : (
            'Continue'
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Step 3 & 4 Stubs (to be replaced in US-008) ─────────────────────────────

function Step3Stub({ onBack, onContinue }: { onBack: () => void; onContinue: () => void }) {
  return (
    <div className="animate-slide-up">
      <h2 className="text-heading-lg font-display text-neutral-900 mb-2">
        NIN / TIN
      </h2>
      <p className="text-body text-neutral-500 mb-8">
        This step will be available soon.
      </p>
      <div className="flex gap-3">
        <button type="button" onClick={onBack} className="h-12 px-6 rounded-xl border-2 border-border text-neutral-700 font-medium hover:bg-neutral-100/60 transition-colors font-sans">Back</button>
        <button type="button" onClick={onContinue} className="flex-1 h-12 bg-primary hover:bg-primary/90 text-white font-medium rounded-xl transition-all hover:shadow-medium active:scale-[0.98] font-sans">Continue</button>
      </div>
    </div>
  );
}

function Step4Stub({ onBack, onFinish, loading }: { onBack: () => void; onFinish: () => void; loading: boolean }) {
  return (
    <div className="animate-slide-up">
      <h2 className="text-heading-lg font-display text-neutral-900 mb-2">
        Connect accounts
      </h2>
      <p className="text-body text-neutral-500 mb-8">
        This step will be available soon.
      </p>
      <div className="flex gap-3">
        <button type="button" onClick={onBack} className="h-12 px-6 rounded-xl border-2 border-border text-neutral-700 font-medium hover:bg-neutral-100/60 transition-colors font-sans">Back</button>
        <button type="button" onClick={onFinish} disabled={loading} className="flex-1 h-12 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white font-medium rounded-xl transition-all hover:shadow-medium active:scale-[0.98] font-sans">
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              Finishing…
            </span>
          ) : (
            'Finish setup'
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Main Onboarding Component ────────────────────────────────────────────────

export default function Onboarding() {
  const { isSignedIn, isLoaded } = useAuth();
  const me = useQuery(api.userCrud.getMe);

  const [step, setStep] = useState(1);
  const [userType, setUserType] = useState<UserType | null>(null);
  const [loading, setLoading] = useState(false);

  // Freelancer step 2 state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [profession, setProfession] = useState('');
  const [currency, setCurrency] = useState<Currency>('NGN');

  // SME step 2 state
  const [businessName, setBusinessName] = useState('');
  const [businessType, setBusinessType] = useState<'business_name' | 'llc'>('business_name');
  const [industry, setIndustry] = useState('');
  const [annualTurnoverRange, setAnnualTurnoverRange] = useState('');

  // Pre-fill from existing user data
  useEffect(() => {
    if (!me) return;
    if (me.userType) setUserType(me.userType as UserType);
    if (me.fullName) {
      const parts = me.fullName.split(' ');
      setFirstName(parts[0] ?? '');
      setLastName(parts.slice(1).join(' ') ?? '');
    }
    if (me.profession) setProfession(me.profession);
    if (me.preferredCurrency) setCurrency(me.preferredCurrency as Currency);
  }, [me]);

  const saveUserType = useMutation(api.onboarding.saveUserType);
  const saveFreelancerProfile = useMutation(api.onboarding.saveFreelancerProfile);
  const saveSmeProfile = useMutation(api.onboarding.saveSmeProfile);
  const completeOnboarding = useMutation(api.userCrud.completeOnboarding);

  // Loading / auth guards
  if (!isLoaded || (isSignedIn && me === undefined)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isSignedIn) return <Navigate to="/sign-in" replace />;
  if (me?.onboardingComplete) return <Navigate to="/app/dashboard" replace />;

  // ── Step handlers ────────────────────────────────────────────────────────

  async function handleStep1Continue() {
    if (!userType) return;
    setLoading(true);
    try {
      await saveUserType({ userType });
      setStep(2);
    } catch (err) {
      console.error('Failed to save user type:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleStep2FreelancerContinue() {
    setLoading(true);
    try {
      await saveFreelancerProfile({
        firstName,
        lastName,
        profession,
        preferredCurrency: currency,
      });
      setStep(3);
    } catch (err) {
      console.error('Failed to save freelancer profile:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleStep2SmeContinue() {
    setLoading(true);
    try {
      await saveSmeProfile({ businessName, businessType, industry, annualTurnoverRange });
      setStep(3);
    } catch (err) {
      console.error('Failed to save SME profile:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleFinish() {
    setLoading(true);
    try {
      await completeOnboarding();
      // Navigate will trigger from me?.onboardingComplete check above
    } catch (err) {
      console.error('Failed to complete onboarding:', err);
    } finally {
      setLoading(false);
    }
  }

  function handleFreelancerFieldChange(field: string, value: string) {
    if (field === 'firstName') setFirstName(value);
    else if (field === 'lastName') setLastName(value);
    else if (field === 'profession') setProfession(value);
    else if (field === 'currency') setCurrency(value as Currency);
  }

  function handleSmeFieldChange(field: string, value: string) {
    if (field === 'businessName') setBusinessName(value);
    else if (field === 'businessType') setBusinessType(value as 'business_name' | 'llc');
    else if (field === 'industry') setIndustry(value);
    else if (field === 'annualTurnoverRange') setAnnualTurnoverRange(value);
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <span className="text-white font-display font-bold text-sm">T</span>
          </div>
          <span className="font-display font-semibold text-neutral-900 text-lg">TaxEase</span>
        </div>

        <div className="bg-white rounded-2xl shadow-soft border border-border p-6 md:p-8">
          <StepIndicator current={step} total={4} />

          {step === 1 && (
            <Step1
              selected={userType}
              onSelect={setUserType}
              onContinue={handleStep1Continue}
            />
          )}

          {step === 2 && userType === 'freelancer' && (
            <Step2Freelancer
              firstName={firstName}
              lastName={lastName}
              profession={profession}
              currency={currency}
              onChange={handleFreelancerFieldChange}
              onBack={() => setStep(1)}
              onContinue={handleStep2FreelancerContinue}
              loading={loading}
            />
          )}

          {step === 2 && userType === 'sme' && (
            <Step2Sme
              businessName={businessName}
              businessType={businessType}
              industry={industry}
              annualTurnoverRange={annualTurnoverRange}
              onChange={handleSmeFieldChange}
              onBack={() => setStep(1)}
              onContinue={handleStep2SmeContinue}
              loading={loading}
            />
          )}

          {step === 3 && (
            <Step3Stub onBack={() => setStep(2)} onContinue={() => setStep(4)} />
          )}

          {step === 4 && (
            <Step4Stub onBack={() => setStep(3)} onFinish={handleFinish} loading={loading} />
          )}
        </div>
      </div>
    </div>
  );
}
