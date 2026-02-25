import { useState } from 'react';
import { useQuery } from 'convex/react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '@convex/_generated/api';
import { useEntity } from '../contexts/EntityContext';
import { Skeleton } from '../components/Skeleton';
import {
  TrendingUp,
  TrendingDown,
  CreditCard,
  FileText,
  Upload,
  Receipt,
  Banknote,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  Clock,
  ArrowUpRight,
  Send,
  Calendar,
  RefreshCw,
  Info,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format kobo value to ₦X,XXX with thousands separators */
function formatNaira(kobo: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(kobo / 100);
}

// ---------------------------------------------------------------------------
// SVG Donut Arc Chart (48×48px)
// ---------------------------------------------------------------------------

function DonutArc({ proportion }: { proportion: number }) {
  const size = 48;
  const cx = size / 2;
  const cy = size / 2;
  const r = 18;
  const circumference = 2 * Math.PI * r;
  const clampedProportion = Math.min(1, Math.max(0, proportion));
  const dashArray = `${clampedProportion * circumference} ${circumference}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ transform: 'rotate(-90deg)' }}
      aria-hidden="true"
    >
      {/* Track */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="rgba(0,0,0,0.08)"
        strokeWidth={5}
      />
      {/* Progress */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={clampedProportion > 0 ? 'var(--color-danger)' : 'var(--color-success)'}
        strokeWidth={5}
        strokeDasharray={dashArray}
        strokeLinecap="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Deadline severity helpers
// ---------------------------------------------------------------------------

type Severity = 'safe' | 'warning' | 'danger';

function severityClasses(severity: Severity) {
  if (severity === 'danger') {
    return {
      bg: 'bg-danger/10',
      text: 'text-danger',
      badge: 'bg-danger text-white',
      border: 'border-danger/30',
    };
  }
  if (severity === 'warning') {
    return {
      bg: 'bg-warning/10',
      text: 'text-warning',
      badge: 'bg-warning text-white',
      border: 'border-warning/30',
    };
  }
  return {
    bg: 'bg-accent/10',
    text: 'text-accent',
    badge: 'bg-accent text-white',
    border: 'border-accent/30',
  };
}

/** Chip color classes by reminder severity */
function reminderChipClasses(severity: Severity) {
  if (severity === 'danger') {
    return 'bg-danger/10 text-danger border border-danger/30 hover:bg-danger/20';
  }
  if (severity === 'warning') {
    return 'bg-warning/10 text-warning border border-warning/30 hover:bg-warning/20';
  }
  // safe → accent/info
  return 'bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20';
}

function reminderIconColor(severity: Severity) {
  if (severity === 'danger') return 'text-danger';
  if (severity === 'warning') return 'text-warning';
  return 'text-accent';
}

// ---------------------------------------------------------------------------
// Tax Year Selector
// ---------------------------------------------------------------------------

function TaxYearSelector({
  taxYear,
  onChange,
}: {
  taxYear: number;
  onChange: (year: number) => void;
}) {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  return (
    <div className="relative inline-flex items-center">
      <select
        value={taxYear}
        onChange={(e) => onChange(Number(e.target.value))}
        className="appearance-none bg-white border border-border rounded-lg pl-3 pr-8 py-1.5 text-sm font-medium text-neutral-700 cursor-pointer hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors shadow-sm"
        aria-label="Select tax year"
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400 pointer-events-none" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section Error
// ---------------------------------------------------------------------------

function SectionError({
  message = 'Something went wrong',
  onRetry,
}: {
  message?: string;
  onRetry: () => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-border shadow-soft px-5 py-6 flex flex-col items-center gap-3 text-center">
      <div className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center">
        <Info className="w-5 h-5 text-neutral-400" />
      </div>
      <p className="text-body-sm text-neutral-600">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-body-sm text-neutral-700 font-medium hover:bg-neutral-50 transition-colors"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        Retry
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tax Position Card
// ---------------------------------------------------------------------------

interface TaxPositionProps {
  liabilityKobo: number;
  effectiveRate: number;
  incomeKobo: number;
  taxYear: number;
  daysRemaining: number;
  severity: Severity;
  isNilReturn: boolean;
}

function TaxPositionCard({
  liabilityKobo,
  effectiveRate,
  incomeKobo,
  taxYear,
  daysRemaining,
  severity,
  isNilReturn,
}: TaxPositionProps) {
  const navigate = useNavigate();
  const sev = severityClasses(severity);
  const isOverdue = daysRemaining < 0;
  const liabilityIsZero = liabilityKobo === 0;
  const liabilityColor = liabilityIsZero ? 'text-success' : 'text-danger';
  const proportion = incomeKobo > 0 ? liabilityKobo / incomeKobo : 0;

  return (
    <button
      type="button"
      onClick={() => navigate('/app/tax')}
      className="w-full text-left bg-primary-light rounded-xl border border-primary/20 shadow-soft overflow-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none hover:shadow-medium transition-shadow"
    >
      <div className="px-5 pt-5 pb-4">
        {/* Header row */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-label font-medium text-primary uppercase tracking-wide">
                Tax Position {taxYear}
              </span>
              {/* Days badge */}
              {isOverdue ? (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${sev.badge}`}>
                  {Math.abs(daysRemaining)}d overdue
                </span>
              ) : (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${sev.badge}`}>
                  {daysRemaining}d left
                </span>
              )}
            </div>

            {/* Liability figure */}
            {isNilReturn && liabilityIsZero ? (
              <div>
                <p className={`font-mono text-2xl font-bold ${liabilityColor} leading-tight`}>
                  ₦0 — Nil Return
                </p>
                <p className="text-xs text-neutral-500 mt-0.5">Filing still required by March 31</p>
              </div>
            ) : (
              <p className={`font-mono text-3xl font-bold ${liabilityColor} leading-tight`}>
                {formatNaira(liabilityKobo)}
              </p>
            )}

            {/* Effective rate */}
            <p className="text-body-sm text-neutral-600 mt-1">
              Effective Rate:{' '}
              <span className="font-mono font-medium text-neutral-800">
                {(effectiveRate * 100).toFixed(1)}%
              </span>
            </p>
          </div>

          {/* Donut arc */}
          <div className="ml-4 flex flex-col items-center gap-1 flex-shrink-0">
            <DonutArc proportion={proportion} />
            <span className="text-xs text-neutral-500 whitespace-nowrap">
              of income
            </span>
          </div>
        </div>

        {/* Footer row */}
        <div className="flex items-center justify-end">
          <span className="text-body-sm text-primary font-medium flex items-center gap-1">
            View Tax Summary
            <ChevronRight className="w-4 h-4" />
          </span>
        </div>
      </div>
    </button>
  );
}

// Tax Position Skeleton
function TaxPositionSkeleton() {
  return (
    <div className="bg-primary-light rounded-xl border border-primary/20 shadow-soft px-5 pt-5 pb-4">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="h-9 w-44" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="w-12 h-12 rounded-full ml-4 flex-shrink-0" />
      </div>
      <div className="flex justify-end">
        <Skeleton className="h-4 w-36" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quick Stats Row
// ---------------------------------------------------------------------------

interface QuickStatProps {
  label: string;
  value: string;
  subValue?: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  to: string;
}

function QuickStatChip({ label, value, subValue, icon: Icon, iconBg, iconColor, to }: QuickStatProps) {
  return (
    <Link
      to={to}
      className="flex-shrink-0 bg-white rounded-xl border border-border shadow-soft px-4 py-3.5 flex items-center gap-3 min-w-[180px] hover:shadow-medium hover:-translate-y-0.5 transition-all group"
    >
      <div className={`w-9 h-9 rounded-lg ${iconBg} flex items-center justify-center flex-shrink-0`}>
        <Icon className={`w-4 h-4 ${iconColor}`} />
      </div>
      <div className="min-w-0">
        <p className="text-label text-neutral-500 leading-none mb-1">{label}</p>
        <p className="font-mono text-sm font-semibold text-neutral-900 leading-tight">{value}</p>
        {subValue && (
          <p className="text-xs text-neutral-500 leading-none mt-0.5">{subValue}</p>
        )}
      </div>
      <ArrowUpRight className="w-3.5 h-3.5 text-neutral-400 ml-auto flex-shrink-0 group-hover:text-primary transition-colors" />
    </Link>
  );
}

// Quick Stats Skeleton
function QuickStatsSkeleton() {
  return (
    <div className="overflow-x-auto pb-1 -mx-4 px-4">
      <div className="flex gap-3" style={{ width: 'max-content' }}>
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-[72px] w-[180px] rounded-xl flex-shrink-0" />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Deadline Countdown Widget
// ---------------------------------------------------------------------------

interface DeadlineWidgetProps {
  daysRemaining: number;
  severity: Severity;
  label: string;
}

function DeadlineWidget({ daysRemaining, severity, label }: DeadlineWidgetProps) {
  const sev = severityClasses(severity);
  const isOverdue = daysRemaining < 0;
  const absDays = Math.abs(daysRemaining);

  return (
    <Link
      to="/app/tax"
      className={`flex items-center gap-4 rounded-xl border ${sev.border} ${sev.bg} px-5 py-4 hover:shadow-soft transition-shadow`}
    >
      <div className={`w-10 h-10 rounded-lg ${sev.bg} border ${sev.border} flex items-center justify-center flex-shrink-0`}>
        <Clock className={`w-5 h-5 ${sev.text}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-body-sm font-semibold ${sev.text}`}>
          {isOverdue
            ? `Filing deadline passed ${absDays} day${absDays !== 1 ? 's' : ''} ago`
            : daysRemaining === 0
              ? 'Filing deadline is today!'
              : `${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} to filing deadline`}
        </p>
        <p className="text-xs text-neutral-500 mt-0.5 truncate">{label}</p>
      </div>
      <ChevronRight className={`w-4 h-4 ${sev.text} flex-shrink-0`} />
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Reminder Chips
// ---------------------------------------------------------------------------

interface DeadlineReminder {
  id: string;
  type: string;
  label: string;
  dueDate: number;
  severity: string;
  actionPath?: string;
}

function reminderIcon(type: string) {
  if (type === 'vat_return') return FileText;
  if (type === 'overdue_invoice') return AlertTriangle;
  return Calendar;
}

function ReminderChips({ reminders }: { reminders: DeadlineReminder[] }) {
  if (reminders.length === 0) return null;

  return (
    <div className="overflow-x-auto -mx-4 px-4 pb-1">
      <div className="flex gap-2" style={{ width: 'max-content' }}>
        {reminders.map((r) => {
          const sev = r.severity as Severity;
          const chipCls = reminderChipClasses(sev);
          const iconCls = reminderIconColor(sev);
          const Icon = reminderIcon(r.type);
          const to = r.actionPath ?? '/app/tax';

          return (
            <Link
              key={r.id}
              to={to}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${chipCls}`}
            >
              <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${iconCls}`} />
              <span>{r.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// Reminder Chips Skeleton
function ReminderChipsSkeleton() {
  return (
    <div className="overflow-x-auto -mx-4 px-4 pb-1">
      <div className="flex gap-2" style={{ width: 'max-content' }}>
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-7 w-48 rounded-full" />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recent Transaction Row
// ---------------------------------------------------------------------------

interface RecentTx {
  _id: string;
  date: number;
  description: string;
  amountNgn: number;
  direction: 'credit' | 'debit';
  categoryName: string | null;
  categoryColor: string | null;
  categoryIcon: string | null;
  currency: string;
}

function RecentTransactionRow({ tx }: { tx: RecentTx }) {
  const isCredit = tx.direction === 'credit';
  return (
    <Link
      to={`/app/transactions/${tx._id}`}
      className="flex items-center gap-3 py-3 first:pt-0 last:pb-0 border-b last:border-b-0 border-border/60 hover:bg-neutral-50 -mx-5 px-5 transition-colors"
    >
      {/* Category color dot / direction indicator */}
      <div
        className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-sm`}
        style={{
          backgroundColor: tx.categoryColor ? `${tx.categoryColor}20` : undefined,
        }}
      >
        {tx.categoryIcon ? (
          <span className="text-base leading-none">{tx.categoryIcon}</span>
        ) : (
          <span className="text-base leading-none">{isCredit ? '↑' : '↓'}</span>
        )}
      </div>

      {/* Description + category */}
      <div className="flex-1 min-w-0">
        <p className="text-body-sm font-medium text-neutral-900 truncate">{tx.description}</p>
        <p className="text-xs text-neutral-500 mt-0.5">
          {tx.categoryName ?? (
            <span className="text-warning">Uncategorised</span>
          )}{' '}
          · {new Date(tx.date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}
        </p>
      </div>

      {/* Amount + optional currency badge */}
      <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
        <p className={`font-mono text-sm font-semibold ${isCredit ? 'text-success' : 'text-neutral-700'}`}>
          {isCredit ? '+' : '-'}{formatNaira(tx.amountNgn)}
        </p>
        {tx.currency && tx.currency !== 'NGN' && (
          <span className="text-xs text-neutral-400 font-mono">{tx.currency}</span>
        )}
      </div>
    </Link>
  );
}

// Recent Transactions Skeleton
function RecentTransactionsSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-border shadow-soft overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <Skeleton className="h-5 w-44" />
      </div>
      <div className="px-5 py-3 space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="w-8 h-8 rounded-lg flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty State
// ---------------------------------------------------------------------------

function EmptyState({
  icon: Icon,
  headline,
  subtext,
  ctaLabel,
  ctaTo,
}: {
  icon: React.ElementType;
  headline: string;
  subtext: string;
  ctaLabel: string;
  ctaTo: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center animate-slide-up">
      <div className="w-16 h-16 rounded-2xl bg-primary-light flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-primary" strokeWidth={1.5} />
      </div>
      <p className="text-heading-md text-neutral-900 mb-1">{headline}</p>
      <p className="text-body-sm text-neutral-500 mb-5 max-w-xs">{subtext}</p>
      <Link
        to={ctaTo}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-body-sm font-medium hover:bg-primary/90 transition-colors shadow-soft"
      >
        {ctaLabel}
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Invoice Activity Card
// ---------------------------------------------------------------------------

interface InvoiceActivityCardProps {
  sentThisMonth: number;
  outstandingAmountKobo: number;
  outstandingCount: number;
  overdueCount: number;
  hasInvoices: boolean;
}

function InvoiceActivityCard({
  sentThisMonth,
  outstandingAmountKobo,
  outstandingCount,
  overdueCount,
  hasInvoices,
}: InvoiceActivityCardProps) {
  if (!hasInvoices) {
    return (
      <div className="bg-white rounded-xl border border-border shadow-soft overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-heading-md text-neutral-900">Invoice Activity</h2>
        </div>
        <EmptyState
          icon={FileText}
          headline="No invoices yet"
          subtext="Create your first invoice to start tracking receivables."
          ctaLabel="Create Invoice"
          ctaTo="/app/invoices/new"
        />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-border shadow-soft overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <h2 className="text-heading-md text-neutral-900">Invoice Activity</h2>
        <Link
          to="/app/invoices"
          className="text-body-sm text-primary font-medium hover:underline flex items-center gap-1"
        >
          Go to Invoices
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>
      <div className="px-5 py-1 divide-y divide-border/60">
        {/* Sent this month */}
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-primary-light flex items-center justify-center flex-shrink-0">
              <Send className="w-3.5 h-3.5 text-primary" />
            </div>
            <span className="text-body-sm text-neutral-600">Sent this month</span>
          </div>
          <span className="font-mono text-sm font-semibold text-neutral-900">
            {sentThisMonth} {sentThisMonth === 1 ? 'invoice' : 'invoices'}
          </span>
        </div>

        {/* Outstanding */}
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-warning/10 flex items-center justify-center flex-shrink-0">
              <Banknote className="w-3.5 h-3.5 text-warning" />
            </div>
            <span className="text-body-sm text-neutral-600">
              Outstanding{outstandingCount > 0 ? ` (${outstandingCount})` : ''}
            </span>
          </div>
          <span className="font-mono text-sm font-semibold text-neutral-900">
            {formatNaira(outstandingAmountKobo)}
          </span>
        </div>

        {/* Overdue */}
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${
                overdueCount > 0 ? 'bg-danger/10' : 'bg-neutral-100'
              }`}
            >
              <AlertTriangle
                className={`w-3.5 h-3.5 ${overdueCount > 0 ? 'text-danger' : 'text-neutral-400'}`}
              />
            </div>
            <span className="text-body-sm text-neutral-600">Overdue</span>
          </div>
          <span
            className={`font-mono text-sm font-semibold ${
              overdueCount > 0 ? 'text-danger' : 'text-neutral-700'
            }`}
          >
            {overdueCount} {overdueCount === 1 ? 'invoice' : 'invoices'}
          </span>
        </div>
      </div>
    </div>
  );
}

// Invoice Activity Skeleton
function InvoiceActivitySkeleton() {
  return (
    <div className="bg-white rounded-xl border border-border shadow-soft overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <Skeleton className="h-5 w-36" />
      </div>
      <div className="px-5 py-3 space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex items-center justify-between py-1">
            <div className="flex items-center gap-2">
              <Skeleton className="w-7 h-7 rounded-md flex-shrink-0" />
              <Skeleton className="h-4 w-28" />
            </div>
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

// Deadline Widget Skeleton
function DeadlineWidgetSkeleton() {
  return <Skeleton className="h-16 w-full rounded-xl" />;
}

// ---------------------------------------------------------------------------
// Main Dashboard
// ---------------------------------------------------------------------------

export default function Dashboard() {
  const { activeEntityId } = useEntity();
  const [taxYear, setTaxYear] = useState(() => new Date().getFullYear());

  // Retry function: page reload is the correct recovery for auth/entity errors
  const handleRetry = () => window.location.reload();

  // ---- Live queries — each loads independently ----
  const summary = useQuery(
    api.dashboard.getSummary,
    activeEntityId ? { entityId: activeEntityId, taxYear } : 'skip',
  );
  const recentTransactions = useQuery(
    api.dashboard.getRecentTransactions,
    activeEntityId ? { entityId: activeEntityId, taxYear } : 'skip',
  );
  const deadlines = useQuery(
    api.dashboard.getDeadlines,
    activeEntityId ? { entityId: activeEntityId, taxYear } : 'skip',
  );

  // ---- Per-section loading states ----
  const summaryLoading = summary === undefined;
  const recentLoading = recentTransactions === undefined;
  const deadlinesLoading = deadlines === undefined;

  // ---- Per-section error states (null = auth failure / entity not found) ----
  const summaryError = !summaryLoading && summary === null;
  const deadlinesError = !deadlinesLoading && deadlines === null;
  // recentTransactions always returns array; null won't happen but guard anyway
  const recentError = !recentLoading && recentTransactions === null;

  // ---- Full-page error: only if ALL queries have settled and all returned null ----
  const allSettled = !summaryLoading && !recentLoading && !deadlinesLoading;
  const allFailed = allSettled && summaryError && deadlinesError && recentError;

  // Derived values (safe defaults when still loading/error)
  const hasTransactions = !!(summary && summary.hasTransactions);
  const uncategorisedCount = summary?.uncategorisedCount ?? 0;
  const taxYearDisplay = summary?.taxYear ?? taxYear;
  const liabilityKobo = summary?.taxPosition.estimatedLiabilityKobo ?? 0;
  const effectiveRate = summary?.taxPosition.effectiveTaxRate ?? 0;
  const incomeKobo = summary?.incomeYtdKobo ?? 0;
  const expensesKobo = summary?.expensesYtdKobo ?? 0;
  const whtCreditsKobo = summary?.whtCreditsKobo ?? 0;
  const invoiceStats = summary?.invoiceStats;

  const deadlineData = deadlines?.deadlineCountdown;
  const daysRemaining = deadlineData?.daysRemaining ?? 365;
  const deadlineSeverity = (deadlineData?.severity ?? 'safe') as Severity;
  const deadlineLabel = deadlineData?.label ?? '';
  const reminders = deadlines?.reminders ?? [];

  const isNilReturn = liabilityKobo === 0 && hasTransactions;
  const shouldShowDeadline = daysRemaining <= 60;

  // ---------------------------------------------------------------------------
  // Full-page error
  // ---------------------------------------------------------------------------
  if (allFailed) {
    return (
      <div className="max-w-4xl mx-auto flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4 animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-neutral-100 flex items-center justify-center">
          <Info className="w-8 h-8 text-neutral-400" />
        </div>
        <div>
          <p className="text-heading-md text-neutral-900 mb-1">Something went wrong</p>
          <p className="text-body-sm text-neutral-500">
            We couldn&#39;t load your dashboard. Please try again.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRetry}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-body-sm font-medium hover:bg-primary/90 transition-colors shadow-soft"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render — each section loads independently
  // ---------------------------------------------------------------------------
  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      {/* Page header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-heading-xl text-neutral-900 font-display">Dashboard</h1>
          {summary?.entityName && (
            <p className="text-body-sm text-neutral-500 mt-0.5">{summary.entityName}</p>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1 flex-shrink-0">
          {/* Tax Year Selector */}
          <TaxYearSelector taxYear={taxYear} onChange={setTaxYear} />
          <span className="text-label text-neutral-500 hidden sm:block">
            {new Date().toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
        </div>
      </div>

      {/* Uncategorised banner */}
      {!summaryLoading && uncategorisedCount > 0 && (
        <Link
          to="/app/triage"
          className="flex items-center gap-3 rounded-xl border border-warning/30 bg-warning/10 px-5 py-3.5 hover:shadow-soft transition-shadow animate-slide-up"
        >
          <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-body-sm font-semibold text-warning">
              {uncategorisedCount} {uncategorisedCount === 1 ? 'transaction needs' : 'transactions need'} categorisation
            </p>
            <p className="text-xs text-neutral-500">Categorise now to get an accurate tax estimate</p>
          </div>
          <span className="flex-shrink-0 inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-warning text-white text-xs font-semibold whitespace-nowrap">
            Review Now
            <ChevronRight className="w-3 h-3" />
          </span>
        </Link>
      )}

      {/* Tax Position Summary card — per-section loading */}
      {summaryLoading ? (
        <TaxPositionSkeleton />
      ) : summaryError ? (
        <SectionError message="Could not load tax position" onRetry={handleRetry} />
      ) : !hasTransactions ? (
        <div className="bg-white rounded-xl border border-border shadow-soft overflow-hidden">
          <EmptyState
            icon={Receipt}
            headline="No transactions yet"
            subtext="Add or import transactions to see your tax position."
            ctaLabel="Import Now"
            ctaTo="/app/import"
          />
        </div>
      ) : (
        <TaxPositionCard
          liabilityKobo={liabilityKobo}
          effectiveRate={effectiveRate}
          incomeKobo={incomeKobo}
          taxYear={taxYearDisplay}
          daysRemaining={daysRemaining}
          severity={deadlineSeverity}
          isNilReturn={isNilReturn}
        />
      )}

      {/* Quick Stats row — per-section loading */}
      {summaryLoading ? (
        <QuickStatsSkeleton />
      ) : summaryError ? null : (
        <div className="overflow-x-auto pb-1 -mx-4 px-4">
          <div className="flex gap-3" style={{ width: 'max-content' }}>
            <QuickStatChip
              label="Total Income"
              value={formatNaira(incomeKobo)}
              icon={TrendingUp}
              iconBg="bg-success/10"
              iconColor="text-success"
              to={`/app/transactions?direction=credit`}
            />
            <QuickStatChip
              label="Business Expenses"
              value={formatNaira(expensesKobo)}
              icon={TrendingDown}
              iconBg="bg-danger/10"
              iconColor="text-danger"
              to={`/app/transactions?direction=debit`}
            />
            <QuickStatChip
              label="WHT Credits"
              value={formatNaira(whtCreditsKobo)}
              icon={CreditCard}
              iconBg="bg-accent/10"
              iconColor="text-accent"
              to="/app/tax"
            />
            <QuickStatChip
              label="Invoices Outstanding"
              value={formatNaira(invoiceStats?.outstandingAmountKobo ?? 0)}
              subValue={
                invoiceStats?.outstandingCount
                  ? `${invoiceStats.outstandingCount} invoice${invoiceStats.outstandingCount !== 1 ? 's' : ''}`
                  : 'No outstanding invoices'
              }
              icon={FileText}
              iconBg="bg-primary-light"
              iconColor="text-primary"
              to="/app/invoices"
            />
          </div>
        </div>
      )}

      {/* Deadline Countdown Widget — only within 60 days, per-section loading */}
      {deadlinesLoading ? (
        <DeadlineWidgetSkeleton />
      ) : deadlinesError ? null : shouldShowDeadline ? (
        <DeadlineWidget
          daysRemaining={daysRemaining}
          severity={deadlineSeverity}
          label={deadlineLabel}
        />
      ) : null}

      {/* Compliance Reminder Chips — always shown when data available */}
      {deadlinesLoading ? (
        <ReminderChipsSkeleton />
      ) : deadlinesError ? null : reminders.length > 0 ? (
        <ReminderChips reminders={reminders} />
      ) : null}

      {/* Recent Transactions — per-section loading */}
      {recentLoading ? (
        <RecentTransactionsSkeleton />
      ) : recentError ? (
        <SectionError message="Could not load recent transactions" onRetry={handleRetry} />
      ) : (
        <div className="bg-white rounded-xl border border-border shadow-soft overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-heading-md text-neutral-900">Recent Transactions</h2>
            {hasTransactions && (
              <Link
                to="/app/transactions"
                className="text-body-sm text-primary font-medium hover:underline flex items-center gap-1"
              >
                View All Transactions
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>

          {!hasTransactions ? (
            <EmptyState
              icon={Banknote}
              headline="No transactions yet"
              subtext="Import a bank statement to get started."
              ctaLabel="Import Now"
              ctaTo="/app/import"
            />
          ) : (
            <div className="px-5 py-4">
              {recentTransactions && recentTransactions.length > 0 ? (
                recentTransactions.map((tx) => (
                  <RecentTransactionRow key={tx._id} tx={tx as RecentTx} />
                ))
              ) : (
                <p className="text-body-sm text-neutral-500 py-4 text-center">
                  No transactions for {taxYear}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Invoice Activity — per-section loading */}
      {summaryLoading ? (
        <InvoiceActivitySkeleton />
      ) : summaryError ? (
        <SectionError message="Could not load invoice activity" onRetry={handleRetry} />
      ) : (
        <InvoiceActivityCard
          sentThisMonth={invoiceStats?.sentThisMonthCount ?? 0}
          outstandingAmountKobo={invoiceStats?.outstandingAmountKobo ?? 0}
          outstandingCount={invoiceStats?.outstandingCount ?? 0}
          overdueCount={invoiceStats?.overdueCount ?? 0}
          hasInvoices={summary?.hasInvoices ?? false}
        />
      )}

      {/* Import CTA banner — shown when no transactions */}
      {!summaryLoading && !hasTransactions && !summaryError && (
        <div className="rounded-xl border border-primary/20 bg-primary-light px-5 py-4 flex items-center justify-between gap-4 animate-slide-up">
          <div>
            <p className="text-body font-medium text-neutral-900">Ready to get started?</p>
            <p className="text-body-sm text-neutral-500 mt-0.5">
              Import a bank statement or add transactions manually.
            </p>
          </div>
          <Link
            to="/app/import"
            className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-body-sm font-medium hover:bg-primary/90 transition-colors shadow-soft"
          >
            <Upload className="w-4 h-4" />
            Import Now
          </Link>
        </div>
      )}
    </div>
  );
}
