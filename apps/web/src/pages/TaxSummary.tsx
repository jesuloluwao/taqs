import { useState, useMemo } from 'react';
import { useQuery } from 'convex/react';
import { Link } from 'react-router-dom';
import { api } from '@convex/_generated/api';
import { useEntity } from '../contexts/EntityContext';
import { Skeleton } from '../components/Skeleton';
import {
  ChevronDown,
  ChevronUp,
  Info,
  Calendar,
  AlertCircle,
  CheckCircle2,
  TrendingUp,
  Layers,
  PiggyBank,
  Receipt,
  Building2,
  Clock,
  Globe,
} from 'lucide-react';

// ─── helpers ────────────────────────────────────────────────────────────────

function formatNaira(kobo: number, compact = false): string {
  const ngn = kobo / 100;
  if (compact && Math.abs(ngn) >= 1_000_000) {
    return `₦${(ngn / 1_000_000).toFixed(2)}m`;
  }
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(ngn);
}

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`;
}

function getDaysToDeadline(taxYear: number): number {
  const deadline = new Date(taxYear + 1, 2, 31); // March 31 of next year
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function formatBandRange(from: number, to?: number): string {
  const fromNgn = from / 100;
  if (to === undefined) return `Above ${formatNairaShort(fromNgn)}`;
  const toNgn = to / 100;
  return `${formatNairaShort(fromNgn)} – ${formatNairaShort(toNgn)}`;
}

function formatNairaShort(ngn: number): string {
  if (ngn === 0) return '₦0';
  if (ngn >= 1_000_000) return `₦${(ngn / 1_000_000).toFixed(1)}m`;
  if (ngn >= 1_000) return `₦${(ngn / 1_000).toFixed(0)}k`;
  return `₦${ngn.toLocaleString('en-NG')}`;
}

// ─── sub-components ─────────────────────────────────────────────────────────

interface ExpandableSectionProps {
  title: string;
  icon: React.ElementType;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function ExpandableSection({ title, icon: Icon, defaultOpen = true, children }: ExpandableSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-xl border border-border shadow-soft overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Icon className="w-4.5 h-4.5 text-primary flex-shrink-0" />
          <span className="text-[13.5px] font-semibold text-neutral-800">{title}</span>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-neutral-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-neutral-400" />
        )}
      </button>
      {open && <div className="px-5 pb-5 pt-1">{children}</div>}
    </div>
  );
}

interface RowProps {
  label: string;
  value: number;
  negative?: boolean;
  bold?: boolean;
  danger?: boolean;
  success?: boolean;
  sublabel?: string;
  tooltip?: string;
  indent?: boolean;
}

function SummaryRow({ label, value, negative, bold, danger, success, sublabel, tooltip, indent }: RowProps) {
  const [showTip, setShowTip] = useState(false);
  const display = negative && value > 0 ? `−${formatNaira(value)}` : formatNaira(value);

  return (
    <div className={`flex items-start justify-between py-2 border-b border-border/60 last:border-0 ${indent ? 'pl-4' : ''}`}>
      <div className="flex items-center gap-1.5 min-w-0">
        <span className={`text-sm ${bold ? 'font-semibold text-neutral-900' : 'text-neutral-600'} leading-tight`}>
          {label}
        </span>
        {sublabel && (
          <span className="text-xs text-neutral-400 hidden sm:inline">{sublabel}</span>
        )}
        {tooltip && (
          <div className="relative">
            <button
              onMouseEnter={() => setShowTip(true)}
              onMouseLeave={() => setShowTip(false)}
              onClick={() => setShowTip((v) => !v)}
              className="text-neutral-400 hover:text-neutral-600 transition-colors"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
            {showTip && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-neutral-900 text-white text-xs rounded-lg whitespace-nowrap shadow-medium z-20 max-w-[220px] text-center leading-tight">
                {tooltip}
              </div>
            )}
          </div>
        )}
      </div>
      <span
        className={`font-mono text-sm tabular-nums flex-shrink-0 ml-3 ${
          bold ? 'font-semibold' : ''
        } ${
          danger && value > 0 ? 'text-danger' :
          success && value === 0 ? 'text-emerald-600' :
          negative && value > 0 ? 'text-danger' :
          'text-neutral-900'
        }`}
      >
        {display}
      </span>
    </div>
  );
}

// Band colors by index (0% → 25%)
const BAND_COLORS = [
  'bg-neutral-200',
  'bg-emerald-300',
  'bg-amber-300',
  'bg-orange-400',
  'bg-red-400',
  'bg-red-600',
];
const BAND_TEXT_COLORS = [
  'text-neutral-500',
  'text-emerald-700',
  'text-amber-700',
  'text-orange-700',
  'text-red-600',
  'text-red-800',
];

// ─── deadline widget ─────────────────────────────────────────────────────────

interface DeadlineWidgetProps {
  taxYear: number;
  daysToDeadline: number;
}

function DeadlineWidget({ taxYear, daysToDeadline }: DeadlineWidgetProps) {
  const [penaltyOpen, setPenaltyOpen] = useState(false);

  const isOverdue = daysToDeadline < 0;
  const isSuccess = daysToDeadline > 30;
  const isWarning = daysToDeadline >= 15 && daysToDeadline <= 30;

  const bgClass = isSuccess
    ? 'bg-emerald-50 border-emerald-200'
    : isWarning
    ? 'bg-amber-50 border-amber-200'
    : 'bg-red-50 border-red-200';

  const textClass = isSuccess
    ? 'text-emerald-800'
    : isWarning
    ? 'text-amber-800'
    : 'text-red-800';

  const subTextClass = isSuccess
    ? 'text-emerald-700'
    : isWarning
    ? 'text-amber-700'
    : 'text-red-700';

  const iconClass = isSuccess
    ? 'text-emerald-500'
    : isWarning
    ? 'text-amber-500'
    : 'text-red-500';

  const countdownText = isOverdue
    ? 'Filing deadline has passed'
    : daysToDeadline === 0
    ? 'Filing deadline is today!'
    : `${daysToDeadline} days to March 31 filing deadline`;

  return (
    <div className={`rounded-xl border shadow-soft overflow-hidden ${bgClass}`}>
      <div className="px-4 py-3.5 flex items-start gap-3">
        <Clock className={`w-4.5 h-4.5 flex-shrink-0 mt-0.5 ${iconClass}`} />
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${textClass}`}>{countdownText}</p>
          <p className={`text-xs mt-0.5 ${subTextClass}`}>
            Self-assessment deadline: 31 March {taxYear + 1} · Nil returns required even if no tax is owed
          </p>
        </div>
        <button
          onClick={() => setPenaltyOpen((v) => !v)}
          className={`flex-shrink-0 text-xs font-medium flex items-center gap-1 ${subTextClass} hover:opacity-80 transition-opacity`}
        >
          <AlertCircle className="w-3.5 h-3.5" />
          {penaltyOpen ? 'Hide' : 'Penalties'}
          <ChevronDown className={`w-3 h-3 transition-transform ${penaltyOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {penaltyOpen && (
        <div className={`border-t ${isSuccess ? 'border-emerald-200' : isWarning ? 'border-amber-200' : 'border-red-200'} px-4 py-3`}>
          <p className={`text-[11px] font-semibold uppercase tracking-wider mb-2 ${subTextClass} opacity-70`}>
            Penalty Reference (FIRS — NTA 2025)
          </p>
          <div className="space-y-1.5">
            <div className={`flex items-start gap-2 text-xs ${subTextClass}`}>
              <span className="font-bold mt-0.5">·</span>
              <span>
                <strong>Late filing:</strong> ₦100,000 penalty + ₦50,000 per month (or part-month) the return remains unfiled
              </span>
            </div>
            <div className={`flex items-start gap-2 text-xs ${subTextClass}`}>
              <span className="font-bold mt-0.5">·</span>
              <span>
                <strong>Late payment:</strong> 10% of tax unpaid + interest at MPR (Monetary Policy Rate) per annum on the outstanding balance
              </span>
            </div>
            <div className={`flex items-start gap-2 text-xs ${subTextClass}`}>
              <span className="font-bold mt-0.5">·</span>
              <span>
                <strong>Nil return:</strong> ₦100,000 late filing penalty still applies even when no tax is owed
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear();
const TAX_YEARS = [CURRENT_YEAR - 1, CURRENT_YEAR - 2, CURRENT_YEAR - 3].filter(
  (y) => y >= 2020
);
// Default to previous year (current filing period)
const DEFAULT_TAX_YEAR = CURRENT_YEAR - 1;

export default function TaxSummary() {
  const { activeEntityId } = useEntity();
  const [taxYear, setTaxYear] = useState(DEFAULT_TAX_YEAR);
  const [yearDropdownOpen, setYearDropdownOpen] = useState(false);

  const entity = useQuery(
    api.entityCrud.get,
    activeEntityId ? { id: activeEntityId } : 'skip'
  );

  const summary = useQuery(
    (api as any).tax.getSummary,
    activeEntityId ? { entityId: activeEntityId, taxYear } : 'skip'
  ) as TaxSummaryData | null | undefined;

  const incomeBreakdown = useQuery(
    (api as any).tax.getIncomeBreakdown,
    activeEntityId ? { entityId: activeEntityId, taxYear } : 'skip'
  ) as IncomeBreakdown | null | undefined;

  const isLoading = summary === undefined || entity === undefined;
  const isLlc = entity?.type === 'llc';

  const daysToDeadline = getDaysToDeadline(taxYear);
  const deadlineLabel =
    daysToDeadline > 0
      ? `${daysToDeadline}d to deadline`
      : daysToDeadline === 0
      ? 'Deadline today!'
      : 'Filing overdue';
  // Color thresholds: success >30 days, warning 15-30, danger <15
  const deadlineVariant =
    daysToDeadline > 30
      ? 'bg-emerald-100 text-emerald-700'
      : daysToDeadline >= 15
      ? 'bg-amber-100 text-amber-700'
      : 'bg-red-100 text-red-700';

  const computedAt = useMemo(() => {
    return new Date().toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
  }, [summary]);

  const totalTaxPayable = summary?.totalTaxPayable ?? 0;
  const effectiveTaxRate = summary?.effectiveTaxRate ?? 0;
  const isNilReturn = summary?.isNilReturn ?? false;

  // Band stacked bar: only bands with income > 0
  const bandsWithIncome = (summary?.bands ?? []).filter((b: PitBand) => b.income > 0);
  const totalBandIncome = bandsWithIncome.reduce((s: number, b: PitBand) => s + b.income, 0);

  return (
    <div className="max-w-3xl mx-auto animate-fade-in pb-8">
      {/* Page header + year selector */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-heading-xl font-display text-neutral-900">Tax Summary</h1>
          <p className="text-body-sm text-neutral-500 mt-0.5">
            Full NTA 2025 computation for {taxYear} tax year
          </p>
        </div>

        {/* Tax year selector */}
        <div className="relative">
          <button
            onClick={() => setYearDropdownOpen((v) => !v)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-border bg-white shadow-soft text-sm font-medium text-neutral-700 hover:bg-muted/40 transition-colors"
          >
            <Calendar className="w-4 h-4 text-neutral-400" />
            {taxYear} Tax Year
            <ChevronDown className={`w-3.5 h-3.5 text-neutral-400 transition-transform ${yearDropdownOpen ? 'rotate-180' : ''}`} />
          </button>
          {yearDropdownOpen && (
            <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-border rounded-lg shadow-medium overflow-hidden min-w-[140px]">
              {TAX_YEARS.map((y) => (
                <button
                  key={y}
                  onClick={() => { setTaxYear(y); setYearDropdownOpen(false); }}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                    y === taxYear
                      ? 'bg-primary-light text-primary font-medium'
                      : 'text-neutral-700 hover:bg-muted/40'
                  }`}
                >
                  {y} Tax Year
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Click away to close year dropdown */}
      {yearDropdownOpen && (
        <div className="fixed inset-0 z-20" onClick={() => setYearDropdownOpen(false)} />
      )}

      <div className="space-y-4">
        {/* ── Tax Liability Card ── */}
        <div className={`rounded-xl border shadow-soft overflow-hidden ${
          isNilReturn && !isLoading
            ? 'bg-emerald-50 border-emerald-200'
            : 'bg-primary-light border-primary/20'
        }`}>
          <div className="px-5 pt-5 pb-4">
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-12 w-56" />
                <Skeleton className="h-4 w-48" />
              </div>
            ) : (
              <>
                {/* Label row */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-primary/70">
                    {taxYear} Tax Year — Total Liability
                  </span>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${deadlineVariant}`}>
                    {deadlineLabel}
                  </span>
                </div>

                {/* Main amount */}
                <p
                  className={`font-mono text-5xl font-bold tabular-nums leading-none mb-3 ${
                    isNilReturn ? 'text-emerald-600' : totalTaxPayable > 0 ? 'text-danger' : 'text-neutral-900'
                  }`}
                >
                  {formatNaira(totalTaxPayable)}
                </p>

                {/* Sub-row: effective rate + nil return */}
                <div className="flex items-center gap-3 flex-wrap">
                  {!isNilReturn && summary && (
                    <span className="text-sm text-neutral-600">
                      Effective rate: <strong className="text-neutral-800">{formatPercent(effectiveTaxRate)}</strong>
                    </span>
                  )}
                  {isNilReturn && (
                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
                      <CheckCircle2 className="w-4 h-4" />
                      ₦0 — Nil Return
                    </span>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Nil return callout banner */}
          {!isLoading && isNilReturn && (
            <div className="border-t border-emerald-200 bg-emerald-100/60 px-5 py-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-emerald-800">
                <strong>Filing still required.</strong> A nil return must be submitted by{' '}
                <strong>31 March {taxYear + 1}</strong> even though no tax is payable.
              </p>
            </div>
          )}

          {/* Minimum tax applied warning */}
          {!isLoading && summary?.minimumTaxApplied && (
            <div className="border-t border-amber-200 bg-amber-50 px-5 py-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">
                <strong>Minimum tax applied.</strong> The statutory minimum tax (0.5% of gross income,
                min ₦200k) exceeds the band-computed tax for this year.
              </p>
            </div>
          )}
        </div>

        {/* ── Filing Deadline Reminder Widget ── */}
        {!isLoading && (
          <DeadlineWidget taxYear={taxYear} daysToDeadline={daysToDeadline} />
        )}

        {/* ── FX Rates Warning ── */}
        {!isLoading && (incomeBreakdown?.foreign ?? 0) > 0 && (
          <div className="flex items-start gap-2.5 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <Globe className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600" />
            <div>
              <p className="font-semibold">FX rates — nearest available date used</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Some foreign-currency transactions were converted using the closest available CBN rate where the exact date rate was unavailable. Verify converted amounts if your income is predominantly foreign-currency.
              </p>
            </div>
          </div>
        )}

        {/* ── DTA Prompt for Foreign Income ── */}
        {!isLoading && (incomeBreakdown?.foreign ?? 0) > 0 && (
          <div className="flex items-start gap-2.5 text-sm text-blue-800 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-blue-500" />
            <div>
              <p className="font-semibold">Double Taxation Agreement (DTA) may apply</p>
              <p className="text-xs text-blue-700 mt-0.5">
                You have foreign income. If you paid taxes on this income in another country, Nigeria may have a DTA that reduces or eliminates double taxation. Consult a tax professional or visit{' '}
                <span className="font-medium">FIRS DTA guidelines</span> for applicable treaties.
              </p>
            </div>
          </div>
        )}

        {/* ── Income Breakdown ── */}
        <ExpandableSection title="Income Breakdown" icon={TrendingUp}>
          {isLoading ? (
            <SkeletonRows count={5} />
          ) : (
            <>
              <SummaryRow
                label="Freelance / Client Work"
                value={incomeBreakdown?.freelanceClient ?? 0}
              />
              <SummaryRow
                label="Foreign Income"
                value={incomeBreakdown?.foreign ?? 0}
                tooltip="Income received in USD, GBP, or EUR — converted to NGN at transaction date rate"
              />
              <SummaryRow
                label="Investment Income"
                value={incomeBreakdown?.investment ?? 0}
              />
              <SummaryRow
                label="Rental Income"
                value={incomeBreakdown?.rental ?? 0}
              />
              <div className="mt-1 pt-1">
                <SummaryRow
                  label="Total Gross Income"
                  value={summary?.totalGrossIncome ?? 0}
                  bold
                />
              </div>
              {(summary?.uncategorisedCount ?? 0) > 0 && (
                <div className="mt-3 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  {summary!.uncategorisedCount} uncategorised transaction
                  {summary!.uncategorisedCount !== 1 ? 's' : ''} excluded.{' '}
                  <Link to="/app/triage" className="font-medium underline underline-offset-2">
                    Categorise now
                  </Link>
                </div>
              )}
            </>
          )}
        </ExpandableSection>

        {/* ── Deductions ── */}
        <ExpandableSection title="Deductions" icon={PiggyBank}>
          {isLoading ? (
            <SkeletonRows count={8} />
          ) : (
            <>
              <SummaryRow
                label="Business Expenses"
                value={summary?.totalBusinessExpenses ?? 0}
                negative
              />
              <SummaryRow
                label="Rent Relief"
                sublabel={(summary?.reliefs?.rent ?? 0) > 0 ? '(20% of annual rent, max ₦500k)' : undefined}
                value={summary?.reliefs?.rent ?? 0}
                negative
              />
              <SummaryRow
                label="Pension Contributions"
                value={summary?.reliefs?.pension ?? 0}
                negative
              />
              <SummaryRow
                label="NHIS / NHF"
                value={(summary?.reliefs?.nhis ?? 0) + (summary?.reliefs?.nhf ?? 0)}
                negative
              />
              <SummaryRow
                label="Life Insurance Premiums"
                value={summary?.reliefs?.lifeInsurance ?? 0}
                negative
              />
              <SummaryRow
                label="Mortgage Interest"
                value={summary?.reliefs?.mortgage ?? 0}
                negative
              />
              <div className="mt-1 pt-1 border-t border-border/60">
                <SummaryRow
                  label="Total Deductions"
                  value={
                    (summary?.totalBusinessExpenses ?? 0) +
                    (summary?.reliefs?.total ?? 0)
                  }
                  negative
                  bold
                />
              </div>
              <div className="bg-primary-light/60 rounded-lg px-4 py-3 mt-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-neutral-800">Taxable Income</span>
                <span className="font-mono text-sm font-bold text-primary tabular-nums">
                  {formatNaira(summary?.taxableIncome ?? 0)}
                </span>
              </div>
              <div className="mt-3">
                <Link
                  to="/app/declarations"
                  className="inline-flex items-center gap-1.5 text-xs text-primary font-medium hover:underline"
                >
                  <Receipt className="w-3.5 h-3.5" />
                  Edit reliefs &amp; declarations
                </Link>
              </div>
            </>
          )}
        </ExpandableSection>

        {/* ── Tax Band Breakdown ── */}
        <ExpandableSection title="Tax Band Breakdown" icon={Layers} defaultOpen={true}>
          {isLoading ? (
            <SkeletonRows count={7} />
          ) : (
            <>
              {/* Stacked bar visualization */}
              {totalBandIncome > 0 && (
                <div className="mb-4">
                  <div className="flex h-5 rounded-full overflow-hidden gap-0.5 bg-neutral-100">
                    {bandsWithIncome.map((band: PitBand, i: number) => {
                      const pct = (band.income / totalBandIncome) * 100;
                      const colorIdx = (summary?.bands ?? []).indexOf(band);
                      return (
                        <div
                          key={i}
                          className={`${BAND_COLORS[colorIdx] ?? 'bg-neutral-300'} transition-all`}
                          style={{ width: `${pct}%` }}
                          title={`${band.rate}% band: ${formatNaira(band.income)}`}
                        />
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                    {bandsWithIncome.map((band: PitBand, i: number) => {
                      const colorIdx = (summary?.bands ?? []).indexOf(band);
                      return (
                        <span key={i} className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${BAND_TEXT_COLORS[colorIdx] ?? ''}`}>
                          <span className={`w-2.5 h-2.5 rounded-sm ${BAND_COLORS[colorIdx] ?? ''}`} />
                          {band.rate}%
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Band table */}
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] text-neutral-400 font-medium uppercase tracking-wider border-b border-border/60">
                      <th className="text-left pb-2 pr-3">Rate</th>
                      <th className="text-left pb-2 pr-3">Range</th>
                      <th className="text-right pb-2 pr-3">Income in Band</th>
                      <th className="text-right pb-2">Tax Payable</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(summary?.bands ?? []).map((band: PitBand, i: number) => (
                      <tr
                        key={i}
                        className={`border-b border-border/40 last:border-0 ${band.income === 0 ? 'opacity-40' : ''}`}
                      >
                        <td className="py-2 pr-3">
                          <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${BAND_COLORS[i]} ${BAND_TEXT_COLORS[i]}`}>
                            {band.rate}%
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-neutral-600 text-xs">
                          {formatBandRange(band.from, band.to)}
                        </td>
                        <td className="py-2 pr-3 text-right font-mono text-xs tabular-nums text-neutral-700">
                          {band.income > 0 ? formatNaira(band.income) : '—'}
                        </td>
                        <td className={`py-2 text-right font-mono text-xs tabular-nums font-medium ${band.taxPayable > 0 ? 'text-danger' : 'text-neutral-400'}`}>
                          {band.taxPayable > 0 ? formatNaira(band.taxPayable) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Gross PIT total */}
              <div className="mt-3 flex items-center justify-between bg-muted/60 rounded-lg px-4 py-2.5">
                <span className="text-sm font-medium text-neutral-700">Gross PIT</span>
                <span className="font-mono text-sm font-semibold text-neutral-900 tabular-nums">
                  {formatNaira(summary?.grossTaxPayable ?? 0)}
                </span>
              </div>
            </>
          )}
        </ExpandableSection>

        {/* ── Credits & Net Payable ── */}
        <ExpandableSection title="Credits &amp; Net Payable" icon={Receipt}>
          {isLoading ? (
            <SkeletonRows count={3} />
          ) : (
            <>
              <SummaryRow label="Gross Tax (PIT)" value={summary?.grossTaxPayable ?? 0} />
              <SummaryRow
                label="WHT Credits"
                value={summary?.whtCredits ?? 0}
                negative
                tooltip="Withholding tax already deducted at source by payers — offsets your PIT liability"
              />
              <div className="mt-1 pt-1 border-t border-border">
                <SummaryRow
                  label="Net PIT Payable"
                  value={summary?.netTaxPayable ?? 0}
                  bold
                  danger={!isNilReturn}
                  success={isNilReturn}
                />
              </div>
            </>
          )}
        </ExpandableSection>

        {/* ── SME Section (LLC only) ── */}
        {(isLlc || (isLoading && entity === undefined)) && (
          <ExpandableSection title="SME / Corporate Taxes" icon={Building2}>
            {isLoading ? (
              <SkeletonRows count={5} />
            ) : (
              <>
                {/* CIT */}
                <div className="mb-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-2">
                    Company Income Tax (CIT)
                  </p>
                  {(summary?.citPayable ?? 0) === 0 ? (
                    <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                      Small company exemption applies — turnover ≤ ₦100m &amp; fixed assets ≤ ₦250m
                    </div>
                  ) : (
                    <>
                      <SummaryRow
                        label="CIT (30% of assessable profit)"
                        value={Math.round((summary?.assessableProfit ?? 0) * 0.30)}
                      />
                      <SummaryRow
                        label="Development Levy (4%)"
                        value={Math.round((summary?.assessableProfit ?? 0) * 0.04)}
                      />
                      <div className="mt-1 pt-1 border-t border-border">
                        <SummaryRow label="Total CIT Payable" value={summary?.citPayable ?? 0} bold danger />
                      </div>
                    </>
                  )}
                </div>

                {/* CGT (LLC) */}
                {(summary?.cgtPayable ?? 0) > 0 && (
                  <div className="mb-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-2">
                      Capital Gains Tax (CGT)
                    </p>
                    <SummaryRow label="Capital Gains" value={summary?.cgGains ?? 0} />
                    <SummaryRow label="CGT (30% flat)" value={summary?.cgtPayable ?? 0} bold danger />
                  </div>
                )}

                {/* VAT */}
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-2">
                    VAT (7.5%)
                  </p>
                  {entity?.vatRegistered ? (
                    <>
                      <SummaryRow
                        label="Output VAT (from invoices)"
                        value={0}
                        tooltip="Invoice VAT will appear here once invoice module is complete"
                      />
                      <SummaryRow
                        label="Input VAT (reclaimable)"
                        value={0}
                        negative
                      />
                      <div className="mt-1 pt-1 border-t border-border">
                        <SummaryRow label="Net VAT Payable" value={summary?.vatPayable ?? 0} bold danger />
                      </div>
                    </>
                  ) : (
                    <div className="text-sm text-neutral-500 bg-muted/40 rounded-lg px-3 py-2">
                      Not VAT-registered — exempt from VAT collection
                    </div>
                  )}
                </div>
              </>
            )}
          </ExpandableSection>
        )}

        {/* ── Total footer ── */}
        {!isLoading && (
          <div className="bg-white rounded-xl border border-border shadow-soft px-5 py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-0.5">
                  Total Tax Payable (All Taxes)
                </p>
                <p className={`font-mono text-2xl font-bold tabular-nums ${totalTaxPayable > 0 ? 'text-danger' : 'text-emerald-600'}`}>
                  {formatNaira(totalTaxPayable)}
                </p>
              </div>
              {!isNilReturn && (
                <div className="text-right">
                  <p className="text-[11px] text-neutral-400 mb-0.5">Effective rate</p>
                  <p className="text-lg font-mono font-semibold text-neutral-700 tabular-nums">
                    {formatPercent(effectiveTaxRate)}
                  </p>
                </div>
              )}
            </div>

            {/* Footer links */}
            <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between flex-wrap gap-2">
              <Link
                to="/app/declarations"
                className="text-xs text-primary font-medium hover:underline underline-offset-2 flex items-center gap-1"
              >
                <Receipt className="w-3.5 h-3.5" />
                Edit reliefs
              </Link>
              <span className="text-xs text-neutral-400">
                Computed at {computedAt}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── local types ─────────────────────────────────────────────────────────────

interface PitBand {
  rate: number;
  from: number;
  to?: number;
  income: number;
  taxPayable: number;
}

interface TaxEngineReliefs {
  rent: number;
  pension: number;
  nhis: number;
  nhf: number;
  lifeInsurance: number;
  mortgage: number;
  total: number;
}

interface TaxSummaryData {
  totalGrossIncome: number;
  totalBusinessExpenses: number;
  assessableProfit: number;
  reliefs: TaxEngineReliefs;
  taxableIncome: number;
  bands: PitBand[];
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
}

interface IncomeBreakdown {
  freelanceClient: number;
  foreign: number;
  investment: number;
  rental: number;
}

// ─── skeleton helper ─────────────────────────────────────────────────────────

function SkeletonRows({ count }: { count: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center justify-between py-1">
          <Skeleton className={`h-4 ${i % 3 === 0 ? 'w-40' : i % 3 === 1 ? 'w-32' : 'w-28'}`} />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}
