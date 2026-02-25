import { useQuery } from 'convex/react';
import { Link } from 'react-router-dom';
import { api } from '@convex/_generated/api';
import { useEntity } from '../contexts/EntityContext';
import { Skeleton } from '../components/Skeleton';
import {
  TrendingUp,
  TrendingDown,
  Calculator,
  Upload,
  Receipt,
  Banknote,
} from 'lucide-react';

function formatNaira(kobo: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 2,
  }).format(kobo / 100);
}

/** Reusable empty state block: icon + headline + subtext + CTA */
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
      {/* Illustration */}
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

/** Stat card: label, value, icon, colour */
function StatCard({
  label,
  value,
  icon: Icon,
  colour,
  isEmpty,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  colour: 'green' | 'red' | 'blue';
  isEmpty: boolean;
}) {
  const colourMap = {
    green: {
      bg: 'bg-success/10',
      text: 'text-success',
      value: 'text-success',
    },
    red: {
      bg: 'bg-danger/10',
      text: 'text-danger',
      value: 'text-danger',
    },
    blue: {
      bg: 'bg-accent/10',
      text: 'text-accent',
      value: 'text-accent',
    },
  };
  const c = colourMap[colour];

  return (
    <div className="bg-white rounded-xl border border-border shadow-soft p-5 flex items-start gap-4 animate-slide-up">
      <div className={`w-10 h-10 rounded-lg ${c.bg} flex items-center justify-center flex-shrink-0`}>
        <Icon className={`w-5 h-5 ${c.text}`} />
      </div>
      <div className="min-w-0">
        <p className="text-label text-neutral-500 mb-0.5">{label}</p>
        <p className={`text-heading-md ${isEmpty ? 'text-neutral-500' : c.value} font-semibold leading-tight`}>
          {value}
        </p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { activeEntityId } = useEntity();
  const summary = useQuery(
    api.dashboard.getSummary,
    activeEntityId ? { entityId: activeEntityId } : 'skip',
  );

  const currentYear = new Date().getFullYear();
  const hasTransactions = summary !== null && summary !== undefined && summary.transactionCount > 0;
  const isLoading = summary === undefined;

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
        {/* Header skeleton */}
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-36" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-4 w-32 mt-1" />
        </div>
        {/* Tax position card skeleton */}
        <div className="bg-white rounded-xl border border-border shadow-soft overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-6 w-12 rounded-full" />
          </div>
          <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-6 w-28" />
              </div>
            ))}
          </div>
        </div>
        {/* Stat cards skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-border shadow-soft p-5 flex items-start gap-4">
              <Skeleton className="w-10 h-10 rounded-lg flex-shrink-0" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-6 w-32" />
              </div>
            </div>
          ))}
        </div>
        {/* Recent transactions skeleton */}
        <div className="bg-white rounded-xl border border-border shadow-soft overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <Skeleton className="h-5 w-44" />
          </div>
          <div className="p-5 space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="w-9 h-9 rounded-lg flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-5 w-20" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-heading-xl text-neutral-900 font-display">Dashboard</h1>
          {summary?.entityName && (
            <p className="text-body-sm text-neutral-500 mt-0.5">{summary.entityName}</p>
          )}
        </div>
        <span className="text-label text-neutral-500 mt-1">
          {new Date().toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}
        </span>
      </div>

      {/* Tax Position Summary card */}
      <div className="bg-white rounded-xl border border-border shadow-soft overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-heading-md text-neutral-900">Tax Position Summary</h2>
            <p className="text-body-sm text-neutral-500 mt-0.5">{currentYear} Tax Year</p>
          </div>
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-label font-medium bg-primary-light text-primary">
            Live
          </span>
        </div>

        {!hasTransactions ? (
          <EmptyState
            icon={Receipt}
            headline="No transactions yet"
            subtext="Add or import transactions to see your tax position for the year."
            ctaLabel="Import Now"
            ctaTo="/app/transactions"
          />
        ) : (
          <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-label text-neutral-500">Total Income</p>
              <p className="text-heading-md text-success font-semibold">{formatNaira(summary!.totalIncomeKobo)}</p>
            </div>
            <div>
              <p className="text-label text-neutral-500">Total Expenses</p>
              <p className="text-heading-md text-danger font-semibold">{formatNaira(summary!.totalExpensesKobo)}</p>
            </div>
            <div>
              <p className="text-label text-neutral-500">Net Income</p>
              <p className="text-heading-md text-neutral-900 font-semibold">{formatNaira(summary!.netIncomeKobo)}</p>
            </div>
            <div>
              <p className="text-label text-neutral-500">Est. Tax</p>
              <p className="text-heading-md text-accent font-semibold">{formatNaira(summary!.estimatedTaxKobo)}</p>
            </div>
          </div>
        )}
      </div>

      {/* Quick Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Total Income"
          value={hasTransactions ? formatNaira(summary!.totalIncomeKobo) : '₦0.00'}
          icon={TrendingUp}
          colour="green"
          isEmpty={!hasTransactions}
        />
        <StatCard
          label="Total Expenses"
          value={hasTransactions ? formatNaira(summary!.totalExpensesKobo) : '₦0.00'}
          icon={TrendingDown}
          colour="red"
          isEmpty={!hasTransactions}
        />
        <StatCard
          label="Tax Estimate"
          value={hasTransactions ? formatNaira(summary!.estimatedTaxKobo) : '₦0.00'}
          icon={Calculator}
          colour="blue"
          isEmpty={!hasTransactions}
        />
      </div>

      {/* Recent Transactions */}
      <div className="bg-white rounded-xl border border-border shadow-soft overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-heading-md text-neutral-900">Recent Transactions</h2>
          {hasTransactions && (
            <Link
              to="/app/transactions"
              className="text-body-sm text-primary font-medium hover:underline"
            >
              View all
            </Link>
          )}
        </div>

        {!hasTransactions ? (
          <EmptyState
            icon={Banknote}
            headline="No transactions yet"
            subtext="Import a bank statement to get started."
            ctaLabel="Import Now"
            ctaTo="/app/transactions"
          />
        ) : (
          <div className="p-5">
            {/* Populated state handled in future story */}
            <p className="text-body-sm text-neutral-500">Transactions will appear here.</p>
          </div>
        )}
      </div>

      {/* Import CTA banner — shown when no transactions */}
      {!hasTransactions && (
        <div className="rounded-xl border border-primary/20 bg-primary-light px-5 py-4 flex items-center justify-between gap-4 animate-slide-up">
          <div>
            <p className="text-body font-medium text-neutral-900">Ready to get started?</p>
            <p className="text-body-sm text-neutral-500 mt-0.5">
              Import a bank statement or add transactions manually.
            </p>
          </div>
          <Link
            to="/app/transactions"
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
