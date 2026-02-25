import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import { useEntity } from '../contexts/EntityContext';
import { Skeleton } from '../components/Skeleton';
import type { Id } from '@convex/_generated/dataModel';
import {
  Plus,
  FileText,
  ChevronRight,
  AlertCircle,
  TrendingUp,
  Clock,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
type FilterTab = 'all' | 'draft' | 'sent' | 'paid' | 'overdue';

interface InvoiceRow {
  _id: Id<'invoices'>;
  clientName: string;
  invoiceNumber: string;
  issueDate: number;
  dueDate: number;
  totalDue: number;
  currency: 'NGN' | 'USD' | 'GBP' | 'EUR';
  status: InvoiceStatus;
}

interface StatusCounts {
  all: number;
  draft: number;
  sent: number;
  paid: number;
  overdue: number;
  cancelled: number;
}

interface InvoiceListResult {
  invoices: InvoiceRow[];
  totalCount: number;
  hasMore: boolean;
  outstanding: number;
  paidThisYear: number;
  statusCounts: StatusCounts;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatNaira(kobo: number): string {
  const naira = kobo / 100;
  if (naira >= 1_000_000) {
    return '₦' + (naira / 1_000_000).toFixed(1) + 'M';
  }
  if (naira >= 1_000) {
    return '₦' + naira.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
  return '₦' + naira.toFixed(2);
}

function formatNairaFull(kobo: number): string {
  return '₦' + (kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

// ── Status Badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: InvoiceStatus }) {
  const configs: Record<InvoiceStatus, { label: string; className: string }> = {
    draft: { label: 'Draft', className: 'bg-neutral-100 text-neutral-500' },
    sent: { label: 'Sent', className: 'bg-blue-50 text-blue-600' },
    paid: { label: 'Paid', className: 'bg-emerald-50 text-emerald-600' },
    overdue: { label: 'Overdue', className: 'bg-red-50 text-red-600' },
    cancelled: { label: 'Cancelled', className: 'bg-neutral-100 text-neutral-400 line-through' },
  };

  const { label, className } = configs[status] ?? configs.draft;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}

// ── Filter Tab ────────────────────────────────────────────────────────────────

interface TabButtonProps {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}

function TabButton({ label, count, active, onClick }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-body-sm font-medium transition-colors whitespace-nowrap ${
        active
          ? 'bg-primary text-white shadow-sm'
          : 'text-neutral-600 hover:bg-neutral-100'
      }`}
    >
      {label}
      <span
        className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-xs font-semibold ${
          active ? 'bg-white/20 text-white' : 'bg-neutral-200 text-neutral-600'
        }`}
      >
        {count}
      </span>
    </button>
  );
}

// ── Skeleton Rows ─────────────────────────────────────────────────────────────

function InvoiceSkeleton() {
  return (
    <div className="flex items-center justify-between px-4 py-3.5 border-b border-border last:border-0">
      <div className="flex flex-col gap-1.5 flex-1 min-w-0">
        <Skeleton className="h-4 w-40 rounded" />
        <Skeleton className="h-3 w-56 rounded" />
      </div>
      <div className="flex flex-col items-end gap-1.5 ml-4 flex-shrink-0">
        <Skeleton className="h-4 w-24 rounded" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
    </div>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────

function EmptyState({ isFiltered, onClear, onNew }: { isFiltered: boolean; onClear: () => void; onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center animate-slide-up">
      <div className="w-16 h-16 rounded-2xl bg-primary-light flex items-center justify-center mb-4">
        <FileText className="w-8 h-8 text-primary" strokeWidth={1.5} />
      </div>
      <p className="text-heading-md text-neutral-900 mb-1">
        {isFiltered ? 'No invoices match this filter' : 'No invoices yet'}
      </p>
      <p className="text-body-sm text-neutral-500 mb-5 max-w-xs">
        {isFiltered
          ? 'Try a different filter tab to find your invoices.'
          : "Create professional invoices, track payments, and stay on top of what you're owed."}
      </p>
      {isFiltered ? (
        <button
          onClick={onClear}
          className="px-4 py-2 rounded-lg border border-border text-body-sm text-neutral-700 hover:bg-neutral-50 transition-colors"
        >
          Show all invoices
        </button>
      ) : (
        <button
          onClick={onNew}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-body-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Invoice
        </button>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

export default function Invoices() {
  const navigate = useNavigate();
  const { activeEntityId } = useEntity();

  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [limit, setLimit] = useState(PAGE_SIZE);

  const statusArg = activeTab === 'all' ? undefined : activeTab;

  const result = useQuery(
    (api as any).invoices.list,
    activeEntityId
      ? { entityId: activeEntityId, status: statusArg, limit, offset: 0 }
      : 'skip'
  ) as InvoiceListResult | undefined;

  const isLoading = result === undefined && activeEntityId !== null;
  const invoices: InvoiceRow[] = result?.invoices ?? [];
  const statusCounts: StatusCounts = result?.statusCounts ?? {
    all: 0, draft: 0, sent: 0, paid: 0, overdue: 0, cancelled: 0,
  };
  const outstanding = result?.outstanding ?? 0;
  const paidThisYear = result?.paidThisYear ?? 0;
  const hasMore = result?.hasMore ?? false;

  function handleLoadMore() {
    setLimit((prev) => prev + PAGE_SIZE);
  }

  function handleNewInvoice() {
    navigate('/app/invoices/new');
  }

  function handleRowClick(invoice: InvoiceRow) {
    navigate(`/app/invoices/${invoice._id}/edit`);
  }

  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-heading-xl font-display text-neutral-900">Invoices</h1>
          <p className="text-body-sm text-neutral-500 mt-0.5">
            {isLoading ? 'Loading…' : `${statusCounts.all} invoice${statusCounts.all !== 1 ? 's' : ''} total`}
          </p>
        </div>
        <button
          onClick={handleNewInvoice}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-body-sm font-medium hover:bg-primary/90 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          New Invoice
        </button>
      </div>

      {/* ── Summary Bar ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        {/* Outstanding */}
        <div className="bg-white rounded-xl border border-border shadow-soft p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
            <Clock className="w-4 h-4 text-amber-600" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <p className="text-body-xs text-neutral-500 mb-0.5">Total Outstanding</p>
            {isLoading ? (
              <Skeleton className="h-5 w-28 rounded" />
            ) : (
              <p className="text-heading-sm font-semibold text-neutral-900 truncate">
                {formatNairaFull(outstanding)}
              </p>
            )}
          </div>
        </div>

        {/* Paid This Year */}
        <div className="bg-white rounded-xl border border-border shadow-soft p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
            <TrendingUp className="w-4 h-4 text-emerald-600" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <p className="text-body-xs text-neutral-500 mb-0.5">
              Total Paid ({new Date().getFullYear()})
            </p>
            {isLoading ? (
              <Skeleton className="h-5 w-28 rounded" />
            ) : (
              <p className="text-heading-sm font-semibold text-emerald-700 truncate">
                {formatNairaFull(paidThisYear)}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Filter Tabs ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 mb-4 overflow-x-auto pb-1 scrollbar-hide">
        <TabButton
          label="All"
          count={statusCounts.all}
          active={activeTab === 'all'}
          onClick={() => { setActiveTab('all'); setLimit(PAGE_SIZE); }}
        />
        <TabButton
          label="Draft"
          count={statusCounts.draft}
          active={activeTab === 'draft'}
          onClick={() => { setActiveTab('draft'); setLimit(PAGE_SIZE); }}
        />
        <TabButton
          label="Sent"
          count={statusCounts.sent}
          active={activeTab === 'sent'}
          onClick={() => { setActiveTab('sent'); setLimit(PAGE_SIZE); }}
        />
        <TabButton
          label="Paid"
          count={statusCounts.paid}
          active={activeTab === 'paid'}
          onClick={() => { setActiveTab('paid'); setLimit(PAGE_SIZE); }}
        />
        <TabButton
          label="Overdue"
          count={statusCounts.overdue}
          active={activeTab === 'overdue'}
          onClick={() => { setActiveTab('overdue'); setLimit(PAGE_SIZE); }}
        />
      </div>

      {/* ── Overdue Alert ────────────────────────────────────────────────── */}
      {!isLoading && statusCounts.overdue > 0 && activeTab !== 'overdue' && (
        <button
          onClick={() => { setActiveTab('overdue'); setLimit(PAGE_SIZE); }}
          className="w-full flex items-center gap-2 px-3 py-2 mb-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-body-sm hover:bg-red-100 transition-colors"
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1 text-left">
            {statusCounts.overdue} overdue invoice{statusCounts.overdue !== 1 ? 's' : ''} — action required
          </span>
          <ChevronRight className="w-4 h-4 flex-shrink-0" />
        </button>
      )}

      {/* ── Invoice List ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-border shadow-soft overflow-hidden">
        {isLoading ? (
          <>
            {Array.from({ length: 6 }).map((_, i) => (
              <InvoiceSkeleton key={i} />
            ))}
          </>
        ) : invoices.length === 0 ? (
          <EmptyState
            isFiltered={activeTab !== 'all'}
            onClear={() => { setActiveTab('all'); setLimit(PAGE_SIZE); }}
            onNew={handleNewInvoice}
          />
        ) : (
          <>
            {invoices.map((invoice) => (
              <InvoiceRow
                key={invoice._id}
                invoice={invoice}
                onClick={() => handleRowClick(invoice)}
              />
            ))}

            {/* Load More */}
            {hasMore && (
              <div className="border-t border-border px-4 py-3 text-center">
                <button
                  onClick={handleLoadMore}
                  className="text-body-sm text-primary font-medium hover:text-primary/80 transition-colors"
                >
                  Load more invoices
                </button>
              </div>
            )}

            {/* Footer count when all loaded */}
            {!hasMore && invoices.length > 0 && (
              <div className="border-t border-border px-4 py-3 text-center">
                <p className="text-body-xs text-neutral-400">
                  Showing all {invoices.length} invoice{invoices.length !== 1 ? 's' : ''}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Invoice Row Component ─────────────────────────────────────────────────────

function InvoiceRow({ invoice, onClick }: { invoice: InvoiceRow; onClick: () => void }) {
  const currencySymbols: Record<string, string> = {
    NGN: '₦',
    USD: '$',
    GBP: '£',
    EUR: '€',
  };
  const symbol = currencySymbols[invoice.currency] ?? '₦';
  const isNGN = invoice.currency === 'NGN';

  // For non-NGN invoices, show currency code prefix
  const amountDisplay = isNGN
    ? formatNaira(invoice.totalDue)
    : `${symbol}${(invoice.totalDue / 100).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between px-4 py-3.5 border-b border-border last:border-0 hover:bg-neutral-50/70 transition-colors group text-left"
    >
      {/* Left: client + invoice number */}
      <div className="flex-1 min-w-0 mr-4">
        <div className="flex items-center gap-2 mb-0.5">
          <p
            className={`text-body-sm font-semibold text-neutral-900 truncate ${
              invoice.status === 'cancelled' ? 'line-through text-neutral-400' : ''
            }`}
          >
            {invoice.clientName}
          </p>
          <span className="text-body-xs text-neutral-400 flex-shrink-0">{invoice.invoiceNumber}</span>
        </div>
        <div className="flex items-center gap-3 text-body-xs text-neutral-500">
          <span>Issued {formatDate(invoice.issueDate)}</span>
          <span className="text-neutral-300">·</span>
          <span
            className={
              invoice.status === 'overdue' ? 'text-red-500 font-medium' : ''
            }
          >
            Due {formatDate(invoice.dueDate)}
          </span>
        </div>
      </div>

      {/* Right: amount + status */}
      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
        <p
          className={`text-body-sm font-semibold font-mono ${
            invoice.status === 'paid'
              ? 'text-emerald-700'
              : invoice.status === 'overdue'
              ? 'text-red-600'
              : invoice.status === 'cancelled'
              ? 'text-neutral-400'
              : 'text-neutral-900'
          }`}
        >
          {amountDisplay}
        </p>
        <StatusBadge status={invoice.status} />
      </div>

      <ChevronRight className="w-4 h-4 text-neutral-300 ml-2 flex-shrink-0 group-hover:text-neutral-400 transition-colors" />
    </button>
  );
}
