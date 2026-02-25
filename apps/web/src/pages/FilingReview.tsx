import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import { useEntity } from '../contexts/EntityContext';
import { Skeleton } from '../components/Skeleton';
import {
  AlertTriangle,
  Info,
  ChevronLeft,
  Lightbulb,
  TrendingUp,
  Layers,
  PiggyBank,
  Receipt,
  Minus,
} from 'lucide-react';

// ─── helpers ─────────────────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear();
const DEFAULT_TAX_YEAR = CURRENT_YEAR - 1;

function formatNaira(kobo: number): string {
  const ngn = kobo / 100;
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(ngn);
}

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

// ─── types ────────────────────────────────────────────────────────────────────

interface PitBandResult {
  from: number;
  to?: number;
  rate: number;
  taxableInBand: number;
  taxInBand: number;
}

interface TaxReliefs {
  personalRelief: number;
  lifeAssuranceRelief: number;
  nhfRelief: number;
  nhisRelief: number;
  pensionRelief: number;
  rentRelief: number;
  totalReliefs: number;
  [key: string]: number;
}

interface TaxSummary {
  engineVersion: string;
  totalGrossIncome: number;
  totalBusinessExpenses: number;
  assessableProfit: number;
  reliefs: TaxReliefs;
  taxableIncome: number;
  bands: PitBandResult[];
  grossTaxPayable: number;
  whtCredits: number;
  netTaxPayable: number;
  minimumTaxApplied: boolean;
  cgtPayable: number;
  cgGains: number;
  citPayable: number;
  vatPayable: number;
  totalTaxPayable: number;
  effectiveTaxRate: number;
  uncategorisedCount: number;
  isNilReturn: boolean;
  unsupportedCurrencies: string[];
}

// ─── sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="w-4 h-4 text-primary flex-shrink-0" />
      <h3 className="text-[13.5px] font-semibold text-neutral-800">{title}</h3>
    </div>
  );
}

interface ReviewRowProps {
  label: string;
  value: number;
  negative?: boolean;
  bold?: boolean;
  success?: boolean;
  danger?: boolean;
  indent?: boolean;
  sublabel?: string;
}

function ReviewRow({ label, value, negative, bold, success, danger, indent, sublabel }: ReviewRowProps) {
  const display = negative && value > 0 ? `−${formatNaira(value)}` : formatNaira(value);
  return (
    <div className={`flex items-start justify-between py-2.5 border-b border-border/50 last:border-0 ${indent ? 'pl-4' : ''}`}>
      <div className="min-w-0 flex-1">
        <span className={`text-sm ${bold ? 'font-semibold text-neutral-900' : 'text-neutral-600'} leading-tight`}>
          {label}
        </span>
        {sublabel && (
          <div className="text-xs text-neutral-400 mt-0.5">{sublabel}</div>
        )}
      </div>
      <span
        className={`font-mono text-sm tabular-nums flex-shrink-0 ml-3 ${bold ? 'font-semibold' : ''} ${
          danger && value > 0
            ? 'text-red-600'
            : negative && value > 0
            ? 'text-red-600'
            : success && value === 0
            ? 'text-emerald-600'
            : 'text-neutral-900'
        }`}
      >
        {display}
      </span>
    </div>
  );
}

// Band colors for progressive PIT rates
const BAND_COLORS = [
  'bg-neutral-100 text-neutral-600',
  'bg-emerald-50 text-emerald-700',
  'bg-amber-50 text-amber-700',
  'bg-orange-50 text-orange-700',
  'bg-red-50 text-red-600',
  'bg-red-100 text-red-700',
];

function BandRow({ band, index }: { band: PitBandResult; index: number }) {
  const colorClass = BAND_COLORS[Math.min(index, BAND_COLORS.length - 1)];
  if (band.taxableInBand <= 0) return null;
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${colorClass}`}>
          {formatPercent(band.rate)}
        </span>
        <div className="min-w-0">
          <span className="text-sm text-neutral-600 leading-tight">
            {formatNaira(band.taxableInBand)} taxable
          </span>
        </div>
      </div>
      <span className="font-mono text-sm tabular-nums text-neutral-900 flex-shrink-0 ml-3">
        {formatNaira(band.taxInBand)}
      </span>
    </div>
  );
}

// ─── flagged issues ───────────────────────────────────────────────────────────

function buildFlags(summary: TaxSummary): string[] {
  const flags: string[] = [];
  if (summary.uncategorisedCount > 0) {
    flags.push(`${summary.uncategorisedCount} transaction(s) are still uncategorised and excluded from this computation.`);
  }
  if (summary.unsupportedCurrencies.length > 0) {
    flags.push(`Transactions in unsupported currencies (${summary.unsupportedCurrencies.join(', ')}) could not be converted.`);
  }
  if (summary.minimumTaxApplied) {
    flags.push('Minimum tax rule applied — your computed tax was below the ₦0 minimum, so ₦0 is used.');
  }
  if (summary.isNilReturn) {
    flags.push('This is a nil return — no tax is payable, but you must still file by March 31.');
  }
  return flags;
}

// ─── skeleton ─────────────────────────────────────────────────────────────────

function ReviewSkeleton() {
  return (
    <div className="space-y-4 animate-fade-in">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="bg-white rounded-xl border border-border shadow-soft p-5">
          <Skeleton className="h-4 w-36 mb-4" />
          {[1, 2, 3].map((r) => (
            <div key={r} className="flex justify-between py-2.5 border-b border-border/50 last:border-0">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3.5 w-20" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── main ─────────────────────────────────────────────────────────────────────

export default function FilingReview() {
  const navigate = useNavigate();
  const { activeEntityId } = useEntity();
  const [taxYear] = useState(DEFAULT_TAX_YEAR);

  const summary = useQuery(
    (api as any).tax.getSummary,
    activeEntityId ? { entityId: activeEntityId, taxYear } : 'skip'
  ) as TaxSummary | null | undefined;

  const flags = useMemo(() => (summary ? buildFlags(summary) : []), [summary]);
  const hasFlags = flags.length > 0;
  const isLoading = summary === undefined && activeEntityId !== null;

  function handleGoBack() {
    navigate('/app/filing');
  }

  function handleGenerate() {
    // Filing generation is handled in the next story (US-045 / generate PDF)
    // For now, navigate back as a placeholder
    navigate('/app/filing');
  }

  return (
    <div className="max-w-2xl mx-auto animate-fade-in pb-32">
      {/* Header */}
      <div className="mb-5">
        <button
          onClick={handleGoBack}
          className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700 transition-colors mb-3"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to checklist
        </button>
        <h1 className="text-heading-xl font-display text-neutral-900">Pre-Filing Review</h1>
        <p className="text-body-sm text-neutral-500 mt-0.5">
          Review your tax figures before generating your self-assessment form
        </p>
        {summary && (
          <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted/60 border border-border">
            <span className="text-xs text-neutral-500 font-medium">Tax Year {taxYear}</span>
            {summary.isNilReturn && (
              <span className="text-[11px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-semibold">Nil Return</span>
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <ReviewSkeleton />
      ) : !summary ? (
        <div className="bg-white rounded-xl border border-border shadow-soft p-10 flex flex-col items-center text-center">
          <Info className="w-8 h-8 text-neutral-300 mb-3" />
          <p className="text-sm text-neutral-500">No tax summary available. Please add transactions first.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Flagged issues */}
          {hasFlags && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4.5 h-4.5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-800 mb-1">Issues to review</p>
                  <ul className="space-y-1.5">
                    {flags.map((flag, i) => (
                      <li key={i} className="text-xs text-amber-700 leading-snug flex items-start gap-1.5">
                        <Minus className="w-3 h-3 flex-shrink-0 mt-0.5" />
                        {flag}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Income */}
          <div className="bg-white rounded-xl border border-border shadow-soft p-5">
            <SectionHeader icon={TrendingUp} title="Income" />
            <ReviewRow label="Total gross income" value={summary.totalGrossIncome} bold />
            <ReviewRow
              label="Business expenses (deductible)"
              value={summary.totalBusinessExpenses}
              negative
              indent
            />
            <ReviewRow label="Assessable profit" value={summary.assessableProfit} bold />
          </div>

          {/* Deductions & Reliefs */}
          <div className="bg-white rounded-xl border border-border shadow-soft p-5">
            <SectionHeader icon={Layers} title="Deductions & Reliefs" />
            {summary.reliefs.pensionRelief > 0 && (
              <ReviewRow label="Pension relief" value={summary.reliefs.pensionRelief} negative indent />
            )}
            {summary.reliefs.nhfRelief > 0 && (
              <ReviewRow label="NHF relief" value={summary.reliefs.nhfRelief} negative indent />
            )}
            {summary.reliefs.nhisRelief > 0 && (
              <ReviewRow label="NHIS relief" value={summary.reliefs.nhisRelief} negative indent />
            )}
            {summary.reliefs.lifeAssuranceRelief > 0 && (
              <ReviewRow label="Life assurance relief" value={summary.reliefs.lifeAssuranceRelief} negative indent />
            )}
            {summary.reliefs.rentRelief > 0 && (
              <ReviewRow
                label="Rent relief (20% of rent, max ₦500k)"
                value={summary.reliefs.rentRelief}
                negative
                indent
              />
            )}
            {summary.reliefs.personalRelief > 0 && (
              <ReviewRow label="Personal allowance" value={summary.reliefs.personalRelief} negative indent />
            )}
            <ReviewRow label="Total reliefs" value={summary.reliefs.totalReliefs} negative bold />
            <ReviewRow label="Taxable income" value={summary.taxableIncome} bold />
          </div>

          {/* Tax Computation Bands */}
          <div className="bg-white rounded-xl border border-border shadow-soft p-5">
            <SectionHeader icon={Receipt} title="Tax Computation" />
            {summary.bands.filter((b) => b.taxableInBand > 0).length === 0 ? (
              <p className="text-sm text-neutral-500 py-2">No taxable income — nil return.</p>
            ) : (
              summary.bands.map((band, i) => (
                <BandRow key={i} band={band} index={i} />
              ))
            )}
            <ReviewRow label="Gross tax payable" value={summary.grossTaxPayable} bold />
            {summary.cgtPayable > 0 && (
              <ReviewRow label="Capital gains tax" value={summary.cgtPayable} indent />
            )}
            {summary.citPayable > 0 && (
              <ReviewRow label="Company income tax" value={summary.citPayable} indent />
            )}
            {summary.vatPayable > 0 && (
              <ReviewRow label="VAT payable" value={summary.vatPayable} indent />
            )}
          </div>

          {/* Credits & Net Payable */}
          <div className="bg-white rounded-xl border border-border shadow-soft p-5">
            <SectionHeader icon={PiggyBank} title="Credits & Net Payable" />
            {summary.whtCredits > 0 && (
              <ReviewRow label="WHT credits" value={summary.whtCredits} negative indent
                sublabel="Withholding tax deducted at source" />
            )}
            <ReviewRow
              label="Net tax payable"
              value={summary.netTaxPayable}
              bold
              danger={summary.netTaxPayable > 0}
              success={summary.netTaxPayable === 0}
            />
            {summary.netTaxPayable > 0 && (
              <div className="mt-2 px-3 py-2 bg-muted/40 rounded-lg">
                <div className="flex items-center justify-between text-xs text-neutral-500">
                  <span>Effective tax rate</span>
                  <span className="font-mono font-medium text-neutral-700">
                    {formatPercent(summary.effectiveTaxRate)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Tip card */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-start gap-2.5">
              <Lightbulb className="w-4.5 h-4.5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-blue-800">You can still make amendments after generation</p>
                <p className="text-xs text-blue-600 mt-0.5 leading-snug">
                  Generating your self-assessment form creates an immutable snapshot for audit purposes.
                  You can regenerate an updated form if you make corrections before submission.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sticky footer */}
      {!isLoading && summary && (
        <div className="fixed bottom-0 left-0 right-0 md:left-64 bg-white/95 backdrop-blur border-t border-border px-4 py-4 z-20">
          <div className="max-w-2xl mx-auto flex flex-col gap-2.5 sm:flex-row sm:justify-between">
            {hasFlags && (
              <button
                onClick={handleGoBack}
                className="w-full sm:w-auto px-4 py-2.5 rounded-lg border border-border text-sm font-medium text-neutral-700 hover:bg-muted/40 transition-colors"
              >
                ← Go Back to Fix Issues
              </button>
            )}
            <button
              onClick={handleGenerate}
              className={`${hasFlags ? 'sm:ml-auto' : 'w-full'} px-6 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors shadow-soft active:scale-[0.99]`}
            >
              Generate Self-Assessment Form
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
