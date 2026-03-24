import { useState, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ChevronDown,
  Calendar,
  ArrowLeft,
  Receipt,
  Info,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { api } from '@convex/_generated/api';
import { useEntity } from '../contexts/EntityContext';
import { Skeleton } from '../components/Skeleton';

// ─── helpers ─────────────────────────────────────────────────────────────────

function ngnToKobo(ngn: string): number {
  const n = parseFloat(ngn.replace(/,/g, ''));
  if (isNaN(n) || n < 0) return 0;
  return Math.round(n * 100);
}

function koboToNgn(kobo: number | undefined): string {
  if (kobo === undefined || kobo === 0) return '';
  return (kobo / 100).toLocaleString('en-NG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatNaira(kobo: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(kobo / 100);
}

// ─── types ────────────────────────────────────────────────────────────────────

interface DeclarationRecord {
  annualRentPaid?: number;
  pensionContributions?: number;
  nhisContributions?: number;
  nhfContributions?: number;
  lifeInsurancePremiums?: number;
  mortgageInterest?: number;
  updatedAt?: number;
}

interface FormState {
  annualRentPaid: string;
  pensionContributions: string;
  nhisContributions: string;
  nhfContributions: string;
  lifeInsurancePremiums: string;
  mortgageInterest: string;
}

const EMPTY_FORM: FormState = {
  annualRentPaid: '',
  pensionContributions: '',
  nhisContributions: '',
  nhfContributions: '',
  lifeInsurancePremiums: '',
  mortgageInterest: '',
};

const CURRENT_YEAR = new Date().getFullYear();
const TAX_YEARS = [CURRENT_YEAR - 1, CURRENT_YEAR - 2, CURRENT_YEAR - 3].filter(
  (y) => y >= 2020
);

// ─── field component ─────────────────────────────────────────────────────────

interface ReliefFieldProps {
  label: string;
  name: keyof FormState;
  value: string;
  onChange: (name: keyof FormState, value: string) => void;
  hint?: string;
  required?: boolean;
  relief?: string;
}

function ReliefField({ label, name, value, onChange, hint, required, relief }: ReliefFieldProps) {
  const [showInfo, setShowInfo] = useState(false);
  return (
    <div className="py-3.5 border-b border-border/60 last:border-0">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <label htmlFor={name} className="block text-sm font-medium text-neutral-800 mb-0.5">
            {label}
            {required && <span className="text-danger ml-0.5">*</span>}
          </label>
          {hint && <p className="text-xs text-neutral-500 mb-2 leading-snug">{hint}</p>}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 text-sm font-medium select-none">₦</span>
            <input
              id={name}
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={value}
              onChange={(e) => onChange(name, e.target.value)}
              className="w-full pl-7 pr-3 py-2.5 rounded-lg border border-border bg-white text-sm text-neutral-900 font-mono placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition"
            />
          </div>
        </div>
        {relief && (
          <div className="relative flex-shrink-0 mt-7">
            <button
              type="button"
              onMouseEnter={() => setShowInfo(true)}
              onMouseLeave={() => setShowInfo(false)}
              onClick={() => setShowInfo((v) => !v)}
              className="text-neutral-400 hover:text-primary transition-colors"
              aria-label="More info"
            >
              <Info className="w-4 h-4" />
            </button>
            {showInfo && (
              <div className="absolute bottom-full right-0 mb-2 px-2.5 py-2 bg-neutral-900 text-white text-xs rounded-lg shadow-medium z-20 w-52 leading-snug">
                {relief}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── locked field component ──────────────────────────────────────────────────

interface LockedReliefFieldProps {
  label: string;
  koboValue: number;
  hint?: string;
  relief?: string;
}

function LockedReliefField({ label, koboValue, hint, relief }: LockedReliefFieldProps) {
  const [showInfo, setShowInfo] = useState(false);
  return (
    <div className="py-3.5 border-b border-border/60 last:border-0">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <label className="block text-sm font-medium text-neutral-800 mb-0.5">
            {label}
          </label>
          {hint && <p className="text-xs text-neutral-500 mb-2 leading-snug">{hint}</p>}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm font-medium select-none">₦</span>
            <div className="w-full pl-7 pr-3 py-2.5 rounded-lg border border-border bg-neutral-100 text-sm text-neutral-500 font-mono cursor-not-allowed select-none">
              {koboValue > 0
                ? (koboValue / 100).toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
                : '0'}
            </div>
          </div>
          <div className="flex items-center gap-1.5 mt-1.5">
            <Lock className="w-3 h-3 text-neutral-400 flex-shrink-0" />
            <span className="text-xs text-neutral-500">
              From payslip —{' '}
              <a href="/app/employment-income" className="text-primary hover:underline">
                edit in Employment Income
              </a>
            </span>
          </div>
        </div>
        {relief && (
          <div className="relative flex-shrink-0 mt-7">
            <button
              type="button"
              onMouseEnter={() => setShowInfo(true)}
              onMouseLeave={() => setShowInfo(false)}
              onClick={() => setShowInfo((v) => !v)}
              className="text-neutral-400 hover:text-primary transition-colors"
              aria-label="More info"
            >
              <Info className="w-4 h-4" />
            </button>
            {showInfo && (
              <div className="absolute bottom-full right-0 mb-2 px-2.5 py-2 bg-neutral-900 text-white text-xs rounded-lg shadow-medium z-20 w-52 leading-snug">
                {relief}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── computed preview ─────────────────────────────────────────────────────────

interface PreviewRow {
  label: string;
  value: number;
  isTotal?: boolean;
}

function computePreview(
  form: FormState,
  lockedTotals?: { pension: number; nhis: number; nhf: number } | null
): PreviewRow[] {
  const rent = ngnToKobo(form.annualRentPaid);
  const rentRelief = Math.min(Math.round(rent * 0.2), 500_000 * 100);
  const pension = lockedTotals ? lockedTotals.pension : ngnToKobo(form.pensionContributions);
  const nhis = lockedTotals ? lockedTotals.nhis : ngnToKobo(form.nhisContributions);
  const nhf = lockedTotals ? lockedTotals.nhf : ngnToKobo(form.nhfContributions);
  const life = ngnToKobo(form.lifeInsurancePremiums);
  const mortgage = ngnToKobo(form.mortgageInterest);
  const total = rentRelief + pension + nhis + nhf + life + mortgage;

  const rows: PreviewRow[] = [];
  if (rentRelief > 0) rows.push({ label: 'Rent Relief (20% of annual rent, max ₦500k)', value: rentRelief });
  if (pension > 0) rows.push({ label: 'Pension Contributions', value: pension });
  if (nhis > 0) rows.push({ label: 'NHIS', value: nhis });
  if (nhf > 0) rows.push({ label: 'NHF', value: nhf });
  if (life > 0) rows.push({ label: 'Life Insurance Premiums', value: life });
  if (mortgage > 0) rows.push({ label: 'Mortgage Interest', value: mortgage });
  if (total > 0) rows.push({ label: 'Total Reliefs', value: total, isTotal: true });
  return rows;
}

// ─── main component ───────────────────────────────────────────────────────────

export default function Declarations() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { activeEntityId } = useEntity();

  const [taxYear, setTaxYear] = useState<number>(() => {
    const y = parseInt(searchParams.get('year') ?? '');
    return TAX_YEARS.includes(y) ? y : TAX_YEARS[0];
  });
  const [yearDropdownOpen, setYearDropdownOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [initialised, setInitialised] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const declData = useQuery(
    (api as any).taxDeclarations.get,
    activeEntityId ? { entityId: activeEntityId, taxYear } : 'skip'
  ) as DeclarationRecord | null | undefined;

  // Check if confirmed payslip records exist (locks pension/NHIS/NHF)
  const payslipStatus = useQuery(
    api.employmentIncome.hasConfirmedRecords,
    activeEntityId ? { entityId: activeEntityId, taxYear } : 'skip'
  );
  const payslipLocked = payslipStatus?.hasRecords === true;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const saveDecl = useMutation((api as any).taxDeclarations.createOrUpdate);

  // Populate form when data loads
  useEffect(() => {
    if (declData !== undefined) {
      setInitialised(true);
      if (declData) {
        setForm({
          annualRentPaid: koboToNgn(declData.annualRentPaid),
          pensionContributions: koboToNgn(declData.pensionContributions),
          nhisContributions: koboToNgn(declData.nhisContributions),
          nhfContributions: koboToNgn(declData.nhfContributions),
          lifeInsurancePremiums: koboToNgn(declData.lifeInsurancePremiums),
          mortgageInterest: koboToNgn(declData.mortgageInterest),
        });
      } else {
        setForm(EMPTY_FORM);
      }
      setSaved(false);
    }
  }, [declData, taxYear]);

  // Reset when year changes
  useEffect(() => {
    setInitialised(false);
    setSaved(false);
  }, [taxYear]);

  const handleFieldChange = (name: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [name]: value }));
    setSaved(false);
  };

  const hasAnyValue = Object.values(form).some((v) => v.trim() !== '');
  const isLoading = !initialised && activeEntityId;
  const preview = computePreview(form, payslipLocked ? payslipStatus.totals : undefined);

  const handleSave = async () => {
    if (!activeEntityId) return;
    setSaving(true);
    try {
      await saveDecl({
        entityId: activeEntityId,
        taxYear,
        annualRentPaid: ngnToKobo(form.annualRentPaid),
        // When payslip records exist, omit pension/NHIS/NHF — the tax engine
        // caller overrides them from employment income totals.
        ...(payslipLocked
          ? {}
          : {
              pensionContributions: ngnToKobo(form.pensionContributions),
              nhisContributions: ngnToKobo(form.nhisContributions),
              nhfContributions: ngnToKobo(form.nhfContributions),
            }),
        lifeInsurancePremiums: ngnToKobo(form.lifeInsurancePremiums),
        mortgageInterest: ngnToKobo(form.mortgageInterest),
      });
      setSaved(true);
      toast.success('Reliefs saved — tax computation updated');
    } catch {
      toast.error('Failed to save reliefs. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto animate-fade-in pb-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={() => navigate('/app/tax-summary')}
          className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Tax Summary
        </button>
      </div>

      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-heading-xl font-display text-neutral-900">Tax Declarations</h1>
          <p className="text-body-sm text-neutral-500 mt-0.5">
            Declare your reliefs to reduce taxable income for {taxYear}
          </p>
        </div>

        {/* Tax year selector */}
        <div className="relative">
          <button
            onClick={() => setYearDropdownOpen((v) => !v)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-border bg-white shadow-soft text-sm font-medium text-neutral-700 hover:bg-muted/40 transition-colors"
          >
            <Calendar className="w-4 h-4 text-neutral-400" />
            {taxYear}
            <ChevronDown className={`w-3.5 h-3.5 text-neutral-400 transition-transform ${yearDropdownOpen ? 'rotate-180' : ''}`} />
          </button>
          {yearDropdownOpen && (
            <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-border rounded-lg shadow-medium overflow-hidden min-w-[130px]">
              {TAX_YEARS.map((y) => (
                <button
                  key={y}
                  onClick={() => { setTaxYear(y); setYearDropdownOpen(false); }}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                    y === taxYear ? 'bg-primary-light text-primary font-medium' : 'text-neutral-700 hover:bg-muted/40'
                  }`}
                >
                  {y}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {yearDropdownOpen && (
        <div className="fixed inset-0 z-20" onClick={() => setYearDropdownOpen(false)} />
      )}

      <div className="space-y-4">
        {/* ── Form card ── */}
        <div className="bg-white rounded-xl border border-border shadow-soft overflow-hidden">
          <div className="px-5 py-4 border-b border-border/60 flex items-center gap-2">
            <Receipt className="w-4 h-4 text-primary" />
            <h2 className="text-[13.5px] font-semibold text-neutral-800">Relief Amounts</h2>
          </div>

          {isLoading ? (
            <div className="px-5 py-4 space-y-5">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-44" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ))}
            </div>
          ) : (
            <div className="px-5">
              {!hasAnyValue && !declData && (
                <div className="py-4 text-center">
                  <p className="text-sm text-neutral-500 italic">
                    Enter your relief amounts to reduce your taxable income
                  </p>
                </div>
              )}

              <ReliefField
                label="Annual Rent Paid"
                name="annualRentPaid"
                value={form.annualRentPaid}
                onChange={handleFieldChange}
                hint="Total rent paid during the tax year"
                required
                relief="Relief = 20% of annual rent paid, capped at ₦500,000. Enter ₦0 if you own your home or pay no rent."
              />
              {payslipLocked ? (
                <LockedReliefField
                  label="Pension Contributions"
                  koboValue={payslipStatus.totals?.pension ?? 0}
                  hint="Employee pension contributions (e.g. RSA/PFA)"
                  relief="Statutory pension contributions (employee portion) are fully deductible under NTA 2025."
                />
              ) : (
                <ReliefField
                  label="Pension Contributions"
                  name="pensionContributions"
                  value={form.pensionContributions}
                  onChange={handleFieldChange}
                  hint="Employee pension contributions (e.g. RSA/PFA)"
                  relief="Statutory pension contributions (employee portion) are fully deductible under NTA 2025."
                />
              )}
              {payslipLocked ? (
                <LockedReliefField
                  label="NHIS Contributions"
                  koboValue={payslipStatus.totals?.nhis ?? 0}
                  hint="National Health Insurance Scheme payments"
                  relief="NHIS premium contributions are deductible."
                />
              ) : (
                <ReliefField
                  label="NHIS Contributions"
                  name="nhisContributions"
                  value={form.nhisContributions}
                  onChange={handleFieldChange}
                  hint="National Health Insurance Scheme payments"
                  relief="NHIS premium contributions are deductible."
                />
              )}
              {payslipLocked ? (
                <LockedReliefField
                  label="NHF Contributions"
                  koboValue={payslipStatus.totals?.nhf ?? 0}
                  hint="National Housing Fund contributions"
                  relief="NHF contributions (2.5% of basic salary) are deductible."
                />
              ) : (
                <ReliefField
                  label="NHF Contributions"
                  name="nhfContributions"
                  value={form.nhfContributions}
                  onChange={handleFieldChange}
                  hint="National Housing Fund contributions"
                  relief="NHF contributions (2.5% of basic salary) are deductible."
                />
              )}
              <ReliefField
                label="Life Insurance Premiums"
                name="lifeInsurancePremiums"
                value={form.lifeInsurancePremiums}
                onChange={handleFieldChange}
                hint="Annual premiums paid on qualifying life insurance policies"
                relief="Premiums on qualifying life assurance policies taken out on your own life are deductible."
              />
              <ReliefField
                label="Mortgage Interest"
                name="mortgageInterest"
                value={form.mortgageInterest}
                onChange={handleFieldChange}
                hint="Interest portion of mortgage payments on primary residence"
                relief="Interest paid on a mortgage for your primary residence is deductible."
              />
            </div>
          )}

          {/* Save button */}
          {!isLoading && (
            <div className="px-5 py-4 border-t border-border/60 flex items-center justify-between gap-3 bg-muted/20">
              <Link
                to="/app/tax-summary"
                className="text-sm text-neutral-500 hover:text-neutral-800 transition-colors"
              >
                Cancel
              </Link>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-soft"
              >
                {saving ? (
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : saved ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : null}
                {saving ? 'Saving…' : saved ? 'Saved' : 'Save Reliefs'}
              </button>
            </div>
          )}
        </div>

        {/* ── Live preview ── */}
        {preview.length > 0 && (
          <div className="bg-primary-light/60 rounded-xl border border-primary/20 px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-primary/70 mb-3">
              Relief Preview
            </p>
            <div className="space-y-1.5">
              {preview.map((row) => (
                <div
                  key={row.label}
                  className={`flex items-center justify-between ${row.isTotal ? 'pt-2 mt-1 border-t border-primary/20' : ''}`}
                >
                  <span className={`text-sm ${row.isTotal ? 'font-semibold text-primary' : 'text-neutral-600'}`}>
                    {row.label}
                  </span>
                  <span className={`font-mono text-sm tabular-nums ${row.isTotal ? 'font-bold text-primary' : 'text-neutral-700'}`}>
                    −{formatNaira(row.value)}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-primary/60 mt-3">
              Save to apply to your tax computation.
            </p>
          </div>
        )}

        {/* ── Info box ── */}
        <div className="bg-white rounded-xl border border-border shadow-soft px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-2">
            About Tax Reliefs
          </p>
          <ul className="space-y-1.5 text-sm text-neutral-600">
            <li className="flex items-start gap-2">
              <span className="text-primary font-bold mt-0.5">·</span>
              <span>
                <strong>Annual rent</strong>: 20% of rent paid is allowed as relief, capped at ₦500,000.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary font-bold mt-0.5">·</span>
              <span>
                <strong>Pension / NHIS / NHF</strong>: passed through at face value as deductions.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary font-bold mt-0.5">·</span>
              <span>
                <strong>Life insurance &amp; mortgage interest</strong>: qualifying amounts are fully deductible.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary font-bold mt-0.5">·</span>
              <span>
                All fields default to ₦0 — you only need to provide what applies to you.
              </span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
