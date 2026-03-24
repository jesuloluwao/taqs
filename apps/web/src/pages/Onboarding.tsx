import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { toast } from 'sonner';
import { Eye, EyeOff, ShieldCheck, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

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
type UserType = 'freelancer' | 'sme' | 'salary_earner';

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
          onClick={() => onSelect('salary_earner')}
          className={`w-full text-left p-5 rounded-2xl border-2 transition-all duration-200 ${
            selected === 'salary_earner'
              ? 'border-primary bg-primary/5 shadow-medium'
              : 'border-border bg-white hover:border-primary/40 hover:bg-neutral-100/50'
          }`}
        >
          <div className="flex items-start gap-4">
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                selected === 'salary_earner' ? 'bg-primary' : 'bg-neutral-100'
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`w-5 h-5 ${selected === 'salary_earner' ? 'text-white' : 'text-neutral-500'}`}
              >
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                <line x1="6" y1="11" x2="18" y2="11" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="font-display font-semibold text-neutral-900">Salary Earner</span>
                {selected === 'salary_earner' && (
                  <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                    <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                )}
              </div>
              <p className="text-body-sm text-neutral-500 mt-1">
                Employed full-time or part-time. May also have side income.
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

// ─── Step 2c: Salary Earner Form ─────────────────────────────────────────────

interface SalaryEarnerFormErrors {
  firstName?: string;
  lastName?: string;
  employerName?: string;
}

interface Step2SalaryEarnerProps {
  firstName: string;
  lastName: string;
  employerName: string;
  jobTitle: string;
  employmentType: 'full_time' | 'part_time' | 'contract';
  currency: Currency;
  hasOtherIncome: boolean;
  onChange: (field: string, value: string | boolean) => void;
  onBack: () => void;
  onContinue: () => void;
  loading: boolean;
}

function Step2SalaryEarner({
  firstName,
  lastName,
  employerName,
  jobTitle,
  employmentType,
  currency,
  hasOtherIncome,
  onChange,
  onBack,
  onContinue,
  loading,
}: Step2SalaryEarnerProps) {
  const [errors, setErrors] = useState<SalaryEarnerFormErrors>({});

  function validate() {
    const e: SalaryEarnerFormErrors = {};
    if (!firstName.trim()) e.firstName = 'First name is required';
    if (!lastName.trim()) e.lastName = 'Last name is required';
    if (!employerName.trim()) e.employerName = 'Employer name is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleContinue() {
    if (validate()) onContinue();
  }

  return (
    <div className="animate-slide-up">
      <h2 className="text-heading-lg font-display text-neutral-900 mb-2">
        Tell us about your employment
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

        <Field label="Employer name" error={errors.employerName}>
          <input
            type="text"
            value={employerName}
            onChange={(e) => onChange('employerName', e.target.value)}
            placeholder="e.g. Access Bank Plc"
            className={`h-11 px-3 rounded-lg border bg-white text-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors ${
              errors.employerName ? 'border-danger focus:border-danger' : 'border-border focus:border-primary'
            }`}
          />
        </Field>

        <Field label="Job title (optional)">
          <input
            type="text"
            value={jobTitle}
            onChange={(e) => onChange('jobTitle', e.target.value)}
            placeholder="e.g. Senior Accountant"
            className="h-11 px-3 rounded-lg border border-border bg-white text-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
          />
        </Field>

        <Field label="Employment type">
          <div className="grid grid-cols-3 gap-2">
            {([
              { value: 'full_time', label: 'Full-time' },
              { value: 'part_time', label: 'Part-time' },
              { value: 'contract', label: 'Contract' },
            ] as const).map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => onChange('employmentType', t.value)}
                className={`h-11 rounded-lg border-2 text-sm font-medium transition-all ${
                  employmentType === t.value
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border bg-white text-neutral-600 hover:border-primary/40'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
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

        <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-neutral-50">
          <div>
            <p className="text-sm font-medium text-neutral-900">Do you also earn from other sources?</p>
            <p className="text-xs text-neutral-500 mt-0.5">e.g. freelance work, side business, rental income</p>
          </div>
          <button
            type="button"
            onClick={() => onChange('hasOtherIncome', !hasOtherIncome)}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              hasOtherIncome ? 'bg-primary' : 'bg-neutral-300'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                hasOtherIncome ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
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

// ─── Step 4b: Salary Setup Choice ────────────────────────────────────────────

interface Step4SalarySetupProps {
  onBack: () => void;
  onChoice: (choice: 'payslip' | 'detect' | 'skip') => void;
  loading: boolean;
}

function Step4SalarySetup({ onBack, onChoice, loading }: Step4SalarySetupProps) {
  return (
    <div className="animate-slide-up">
      <h2 className="text-heading-lg font-display text-neutral-900 mb-2">
        Set up your salary income
      </h2>
      <p className="text-body text-neutral-500 mb-8">
        How would you like to add your employment income details?
      </p>

      <div className="flex flex-col gap-4 mb-8">
        <button
          type="button"
          onClick={() => onChoice('payslip')}
          disabled={loading}
          className="w-full text-left p-5 rounded-2xl border-2 border-border bg-white hover:border-primary/40 hover:bg-neutral-100/50 transition-all duration-200 disabled:opacity-60"
        >
          <div className="flex items-start gap-4">
            <div className="w-11 h-11 rounded-xl bg-neutral-100 flex items-center justify-center shrink-0">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-5 h-5 text-neutral-500"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-display font-semibold text-neutral-900">Enter payslip details now</span>
              <p className="text-body-sm text-neutral-500 mt-1">
                Manually enter your salary, deductions, and PAYE details
              </p>
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onChoice('detect')}
          disabled={loading}
          className="w-full text-left p-5 rounded-2xl border-2 border-border bg-white hover:border-primary/40 hover:bg-neutral-100/50 transition-all duration-200 disabled:opacity-60"
        >
          <div className="flex items-start gap-4">
            <div className="w-11 h-11 rounded-xl bg-neutral-100 flex items-center justify-center shrink-0">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-5 h-5 text-neutral-500"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-display font-semibold text-neutral-900">Detect from bank statements</span>
              <p className="text-body-sm text-neutral-500 mt-1">
                Upload a bank statement and we'll detect your salary automatically
              </p>
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onChoice('skip')}
          disabled={loading}
          className="w-full text-left p-5 rounded-2xl border-2 border-primary/30 bg-primary/5 hover:bg-primary/10 hover:border-primary/50 transition-all duration-200 disabled:opacity-60"
        >
          <div className="flex items-start gap-4">
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-5 h-5 text-primary"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 8 12 12 14 14" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-display font-semibold text-primary">Skip for now</span>
              <p className="text-body-sm text-primary/60 mt-1">
                You can add your salary details later from the dashboard
              </p>
            </div>
          </div>
        </button>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="h-12 px-6 rounded-xl border-2 border-border text-neutral-700 font-medium hover:bg-neutral-100/60 transition-colors font-sans"
        >
          Back
        </button>
      </div>
    </div>
  );
}

// ─── Step 3: NIN / TIN ────────────────────────────────────────────────────────

interface Step3Props {
  nin: string;
  firsTin: string;
  onChange: (field: 'nin' | 'firsTin', value: string) => void;
  onBack: () => void;
  onContinue: () => void;
  loading: boolean;
}

function Step3({ nin, firsTin, onChange, onBack, onContinue, loading }: Step3Props) {
  const [ninError, setNinError] = useState('');

  function validate() {
    if (!nin.trim()) {
      setNinError('NIN is required');
      return false;
    }
    if (!/^\d{11}$/.test(nin.trim())) {
      setNinError('NIN must be exactly 11 numeric digits');
      return false;
    }
    setNinError('');
    return true;
  }

  function handleContinue() {
    if (validate()) onContinue();
  }

  return (
    <div className="animate-slide-up">
      <h2 className="text-heading-lg font-display text-neutral-900 mb-2">
        Your Tax Identity
      </h2>
      <p className="text-body text-neutral-500 mb-6">
        Under the Nigeria Tax Act (NTA) 2025, your National Identification Number (NIN)
        serves as your primary Tax ID for Personal Income Tax purposes. Providing it
        enables accurate tax calculations and FIRS compliance.
      </p>

      {/* Security callout */}
      <div className="flex gap-3 bg-primary/5 border border-primary/20 rounded-xl p-4 mb-6">
        <div className="shrink-0 mt-0.5">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-primary">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>
        <p className="text-body-sm text-primary font-medium">
          Your NIN is stored securely and never shared without your consent.
        </p>
      </div>

      <div className="flex flex-col gap-5 mb-8">
        <Field label="National Identification Number (NIN)" error={ninError}>
          <input
            type="text"
            inputMode="numeric"
            value={nin}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, '').slice(0, 11);
              onChange('nin', val);
              if (ninError && /^\d{11}$/.test(val)) setNinError('');
            }}
            placeholder="12345678901"
            maxLength={11}
            className={`h-11 px-3 rounded-lg border bg-white text-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors font-mono tracking-widest ${
              ninError ? 'border-danger focus:border-danger' : 'border-border focus:border-primary'
            }`}
          />
          <p className="text-xs text-neutral-400 -mt-0.5">11 digits — found on your NIN slip or NIMC app</p>
        </Field>

        <Field label="FIRS Tax Identification Number (TIN) — Optional">
          <input
            type="text"
            value={firsTin}
            onChange={(e) => onChange('firsTin', e.target.value)}
            placeholder="e.g. 1234567-0001"
            className="h-11 px-3 rounded-lg border border-border bg-white text-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
          />
          <p className="text-xs text-neutral-400 -mt-0.5">If you already have a FIRS TIN, enter it here</p>
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

// ─── Step 4: Connect Accounts ─────────────────────────────────────────────────

/** Inline API-key form for Paystack / Flutterwave within onboarding */
function ApiKeyForm({
  provider,
  entityId,
  onSuccess,
}: {
  provider: 'paystack' | 'flutterwave';
  entityId: Id<'entities'>;
  onSuccess: () => void;
}) {
  const addApiKeyAction = useAction((api as any).accountsActions.addApiKeyAccount);
  const [apiKey, setApiKey] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const label = provider === 'paystack' ? 'Paystack' : 'Flutterwave';

  const handleConnect = async () => {
    if (!apiKey.trim()) { setError('Secret key is required'); return; }
    if (apiKey.trim().length < 20) { setError('Key appears too short — check and try again'); return; }
    setLoading(true);
    setError('');
    try {
      await addApiKeyAction({ entityId, provider, apiKey: apiKey.trim() });
      toast.success(`${label} connected!`);
      onSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Connection failed';
      setError(msg.toLowerCase().includes('invalid api key') ? 'Invalid API key — please check and try again.' : msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-3 p-4 bg-neutral-50 rounded-xl border border-border space-y-3">
      <div>
        <label className="text-xs font-medium text-neutral-600 uppercase tracking-wide">Secret Key</label>
        <div className="relative mt-1">
          <input
            type={show ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => { setApiKey(e.target.value); if (error) setError(''); }}
            placeholder={provider === 'paystack' ? 'sk_...' : 'FLWSECK...'}
            autoComplete="off"
            className={`w-full text-sm px-3 py-2.5 pr-10 bg-white border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none font-mono placeholder:font-sans placeholder:text-neutral-400 ${error ? 'border-red-400' : 'border-border'}`}
          />
          <button type="button" onClick={() => setShow(!show)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600" tabIndex={-1}>
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </div>

      <div className="flex items-start gap-2 bg-primary/5 border border-primary/20 rounded-lg p-3">
        <ShieldCheck className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
        <p className="text-xs text-primary/80">Encrypted with AES-256-GCM. Never shared or transmitted in plaintext.</p>
      </div>

      <button
        type="button"
        onClick={handleConnect}
        disabled={loading || !apiKey.trim()}
        className="w-full flex items-center justify-center gap-2 h-10 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Validating…</> : `Connect ${label}`}
      </button>
    </div>
  );
}

interface Step4Props {
  onBack: () => void;
  onFinish: () => void;
  loading: boolean;
  entityId?: Id<'entities'> | null;
}

function Step4({ onBack, onFinish, loading, entityId }: Step4Props) {
  const [activeForm, setActiveForm] = useState<'paystack' | 'flutterwave' | null>(null);
  const [linked, setLinked] = useState<Set<string>>(new Set());

  const handleLinked = (provider: string) => {
    setLinked((prev) => new Set([...prev, provider]));
    setActiveForm(null);
  };

  return (
    <div className="animate-slide-up">
      <h2 className="text-heading-lg font-display text-neutral-900 mb-2">
        Import your transactions
      </h2>
      <p className="text-body text-neutral-500 mb-6">
        Connect your accounts to automatically import income and expenses. You can always do this later.
      </p>

      <div className="flex flex-col gap-3 mb-6">
        {/* Upload bank statement */}
        <div className="flex items-center gap-4 p-4 rounded-xl border-2 border-border bg-white opacity-60 cursor-not-allowed">
          <div className="w-10 h-10 rounded-lg bg-neutral-100 flex items-center justify-center shrink-0 text-neutral-400">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm text-neutral-700">Upload bank statement</span>
              <span className="text-xs font-medium bg-neutral-100 text-neutral-500 px-2 py-0.5 rounded-full">After setup</span>
            </div>
            <p className="text-xs text-neutral-400 mt-0.5">Available from the Transactions section</p>
          </div>
        </div>

        {/* Connect bank account */}
        <div className="flex items-center gap-4 p-4 rounded-xl border-2 border-border bg-white opacity-60 cursor-not-allowed">
          <div className="w-10 h-10 rounded-lg bg-neutral-100 flex items-center justify-center shrink-0 text-neutral-400">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <line x1="2" y1="10" x2="22" y2="10" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm text-neutral-700">Connect bank account</span>
              <span className="text-xs font-medium bg-neutral-100 text-neutral-500 px-2 py-0.5 rounded-full">Coming soon</span>
            </div>
            <p className="text-xs text-neutral-400 mt-0.5">GTBank, Access, Zenith via open banking</p>
          </div>
        </div>

        {/* Connect Paystack */}
        <div>
          <button
            type="button"
            onClick={() => setActiveForm(activeForm === 'paystack' ? null : 'paystack')}
            className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all ${
              linked.has('paystack')
                ? 'border-emerald-300 bg-emerald-50'
                : activeForm === 'paystack'
                ? 'border-primary bg-primary/5'
                : 'border-border bg-white hover:border-primary/40 hover:bg-neutral-50'
            }`}
          >
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${linked.has('paystack') ? 'bg-emerald-100' : 'bg-neutral-100'}`}>
              {linked.has('paystack') ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-neutral-500">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`font-medium text-sm ${linked.has('paystack') ? 'text-emerald-700' : 'text-neutral-700'}`}>
                  Connect Paystack
                </span>
                {linked.has('paystack') && (
                  <span className="text-xs font-medium bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Connected</span>
                )}
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                {linked.has('paystack') ? 'Your Paystack account is linked' : 'Import payment records from your Paystack business account'}
              </p>
            </div>
          </button>
          {activeForm === 'paystack' && entityId && (
            <ApiKeyForm provider="paystack" entityId={entityId} onSuccess={() => handleLinked('paystack')} />
          )}
          {activeForm === 'paystack' && !entityId && (
            <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <p className="text-xs text-amber-700">Complete the previous steps first to create your entity.</p>
            </div>
          )}
        </div>

        {/* Connect Flutterwave */}
        <div>
          <button
            type="button"
            onClick={() => setActiveForm(activeForm === 'flutterwave' ? null : 'flutterwave')}
            className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all ${
              linked.has('flutterwave')
                ? 'border-emerald-300 bg-emerald-50'
                : activeForm === 'flutterwave'
                ? 'border-primary bg-primary/5'
                : 'border-border bg-white hover:border-primary/40 hover:bg-neutral-50'
            }`}
          >
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${linked.has('flutterwave') ? 'bg-emerald-100' : 'bg-neutral-100'}`}>
              {linked.has('flutterwave') ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-neutral-500">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`font-medium text-sm ${linked.has('flutterwave') ? 'text-emerald-700' : 'text-neutral-700'}`}>
                  Connect Flutterwave
                </span>
                {linked.has('flutterwave') && (
                  <span className="text-xs font-medium bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Connected</span>
                )}
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                {linked.has('flutterwave') ? 'Your Flutterwave account is linked' : 'Import transactions from your Flutterwave merchant account'}
              </p>
            </div>
          </button>
          {activeForm === 'flutterwave' && entityId && (
            <ApiKeyForm provider="flutterwave" entityId={entityId} onSuccess={() => handleLinked('flutterwave')} />
          )}
          {activeForm === 'flutterwave' && !entityId && (
            <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <p className="text-xs text-amber-700">Complete the previous steps first to create your entity.</p>
            </div>
          )}
        </div>

        {/* Payoneer / Wise */}
        <div className="flex items-center gap-4 p-4 rounded-xl border-2 border-border bg-white opacity-60 cursor-not-allowed">
          <div className="w-10 h-10 rounded-lg bg-neutral-100 flex items-center justify-center shrink-0 text-neutral-400">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm text-neutral-700">Connect Payoneer / Wise</span>
              <span className="text-xs font-medium bg-neutral-100 text-neutral-500 px-2 py-0.5 rounded-full">Coming soon</span>
            </div>
            <p className="text-xs text-neutral-400 mt-0.5">Import international income from cross-border platforms</p>
          </div>
        </div>

        {/* I'll do this later */}
        <button
          type="button"
          onClick={onFinish}
          disabled={loading}
          className="flex items-center gap-4 p-4 rounded-xl border-2 border-primary/30 bg-primary/5 hover:bg-primary/10 hover:border-primary/50 transition-all disabled:opacity-60 disabled:cursor-not-allowed text-left"
        >
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-primary">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 8 12 12 14 14" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <span className="font-medium text-sm text-primary">
              {linked.size > 0 ? 'Continue to dashboard' : "I'll do this later"}
            </span>
            <p className="text-xs text-primary/60 mt-0.5">
              {linked.size > 0
                ? `${linked.size} account${linked.size > 1 ? 's' : ''} connected — set up more in Settings`
                : 'Skip for now — add transactions manually'}
            </p>
          </div>
          {loading && (
            <span className="w-4 h-4 border-2 border-primary/40 border-t-primary rounded-full animate-spin shrink-0" />
          )}
        </button>
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
          onClick={onFinish}
          disabled={loading}
          className="flex-1 h-12 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white font-medium rounded-xl transition-all hover:shadow-medium active:scale-[0.98] font-sans"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              Finishing…
            </span>
          ) : (
            'Finish Setup'
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
  const entities = useQuery(api.entityCrud.list);

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

  // Salary Earner step 2 state
  const [employerName, setEmployerName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [employmentType, setEmploymentType] = useState<'full_time' | 'part_time' | 'contract'>('full_time');
  const [hasOtherIncome, setHasOtherIncome] = useState(false);
  const [salarySetupChoice, setSalarySetupChoice] = useState<'payslip' | 'detect' | 'skip' | null>(null);

  // Step 3 state
  const [nin, setNin] = useState('');
  const [firsTin, setFirsTin] = useState('');

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
  const saveSalaryProfile = useMutation(api.onboarding.saveSalaryProfile);
  const saveNinAndTin = useMutation(api.onboarding.saveNinAndTin);
  const completeOnboarding = useMutation(api.userCrud.completeOnboarding);
  const createDefaultPreferences = useMutation(api.userCrud.createDefaultPreferences);
  const seedCategories = useMutation(api.categories.seed);

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

  async function handleStep2SalaryEarnerContinue() {
    setLoading(true);
    try {
      await saveSalaryProfile({
        firstName,
        lastName,
        preferredCurrency: currency,
        employerName,
        jobTitle: jobTitle || undefined,
        employmentType,
        hasOtherIncome,
      });
      setStep(3);
    } catch (err) {
      console.error('Failed to save salary profile:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSalarySetupChoice(choice: 'payslip' | 'detect' | 'skip') {
    setSalarySetupChoice(choice);
    if (choice === 'payslip') {
      setLoading(true);
      try {
        await seedCategories();
        await createDefaultPreferences();
        await completeOnboarding();
        toast.success("You're all set! Let's enter your payslip details.");
        window.location.href = '/app/payslip-entry';
      } catch (err) {
        console.error('Failed to complete onboarding:', err);
      } finally {
        setLoading(false);
      }
    } else if (choice === 'skip') {
      await handleFinish();
    }
    // 'detect' — for now, also finish onboarding (bank statement upload available later)
    if (choice === 'detect') {
      await handleFinish();
    }
  }

  async function handleStep3Continue() {
    setLoading(true);
    try {
      await saveNinAndTin({
        nin: nin.trim(),
        ...(firsTin.trim() ? { firsTin: firsTin.trim() } : {}),
      });
      setStep(4);
    } catch (err) {
      console.error('Failed to save NIN/TIN:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleFinish() {
    setLoading(true);
    try {
      await seedCategories();
      await createDefaultPreferences();
      await completeOnboarding();
      toast.success("You're all set! Add transactions when you're ready.");
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

  function handleSalaryEarnerFieldChange(field: string, value: string | boolean) {
    if (field === 'firstName') setFirstName(value as string);
    else if (field === 'lastName') setLastName(value as string);
    else if (field === 'employerName') setEmployerName(value as string);
    else if (field === 'jobTitle') setJobTitle(value as string);
    else if (field === 'employmentType') setEmploymentType(value as 'full_time' | 'part_time' | 'contract');
    else if (field === 'currency') setCurrency(value as Currency);
    else if (field === 'hasOtherIncome') setHasOtherIncome(value as boolean);
  }

  function handleSmeFieldChange(field: string, value: string) {
    if (field === 'businessName') setBusinessName(value);
    else if (field === 'businessType') setBusinessType(value as 'business_name' | 'llc');
    else if (field === 'industry') setIndustry(value);
    else if (field === 'annualTurnoverRange') setAnnualTurnoverRange(value);
  }

  function handleStep3FieldChange(field: 'nin' | 'firsTin', value: string) {
    if (field === 'nin') setNin(value);
    else setFirsTin(value);
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

          {step === 2 && userType === 'salary_earner' && (
            <Step2SalaryEarner
              firstName={firstName}
              lastName={lastName}
              employerName={employerName}
              jobTitle={jobTitle}
              employmentType={employmentType}
              currency={currency}
              hasOtherIncome={hasOtherIncome}
              onChange={handleSalaryEarnerFieldChange}
              onBack={() => setStep(1)}
              onContinue={handleStep2SalaryEarnerContinue}
              loading={loading}
            />
          )}

          {step === 3 && (
            <Step3
              nin={nin}
              firsTin={firsTin}
              onChange={handleStep3FieldChange}
              onBack={() => setStep(2)}
              onContinue={handleStep3Continue}
              loading={loading}
            />
          )}

          {step === 4 && userType === 'salary_earner' && (
            <Step4SalarySetup
              onBack={() => setStep(3)}
              onChoice={handleSalarySetupChoice}
              loading={loading}
            />
          )}

          {step === 4 && userType !== 'salary_earner' && (
            <Step4
              onBack={() => setStep(3)}
              onFinish={handleFinish}
              loading={loading}
              entityId={entities?.[0]?._id ?? null}
            />
          )}
        </div>
      </div>
    </div>
  );
}
