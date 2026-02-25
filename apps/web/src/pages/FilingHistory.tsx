import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import { Skeleton } from '../components/Skeleton';
import {
  FileText,
  ChevronRight,
  CheckCircle2,
  Clock,
  AlertCircle,
  ChevronLeft,
  History,
  Calendar,
} from 'lucide-react';

// ─── types ────────────────────────────────────────────────────────────────────

type FilingStatus =
  | 'draft'
  | 'generated'
  | 'submitted'
  | 'payment_pending'
  | 'payment_confirmed'
  | 'tcc_obtained';

interface FilingHistoryRecord {
  _id: string;
  entityId: string;
  entityName?: string;
  taxYear: number;
  status: FilingStatus;
  netTaxPayable?: number;
  isNilReturn?: boolean;
  generatedAt?: number;
  submittedAt?: number;
  createdAt: number;
  updatedAt: number;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

interface StatusConfig {
  label: string;
  colorClass: string;
  icon: React.ElementType;
}

const STATUS_CONFIG: Record<FilingStatus, StatusConfig> = {
  draft: {
    label: 'Draft',
    colorClass: 'bg-neutral-100 text-neutral-600',
    icon: FileText,
  },
  generated: {
    label: 'Generated',
    colorClass: 'bg-blue-50 text-blue-700 border border-blue-200',
    icon: FileText,
  },
  submitted: {
    label: 'Submitted',
    colorClass: 'bg-amber-50 text-amber-700 border border-amber-200',
    icon: Clock,
  },
  payment_pending: {
    label: 'Payment Pending',
    colorClass: 'bg-orange-50 text-orange-700 border border-orange-200',
    icon: AlertCircle,
  },
  payment_confirmed: {
    label: 'Payment Confirmed',
    colorClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    icon: CheckCircle2,
  },
  tcc_obtained: {
    label: 'TCC Obtained ✓',
    colorClass: 'bg-emerald-100 text-emerald-800 border border-emerald-300',
    icon: CheckCircle2,
  },
};

function formatNaira(kobo: number): string {
  const ngn = kobo / 100;
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(ngn);
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-NG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function StatusBadge({ status }: { status: FilingStatus }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  const Icon = config.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full ${config.colorClass}`}
    >
      <Icon className="w-3 h-3 flex-shrink-0" />
      {config.label}
    </span>
  );
}

// ─── filing card ─────────────────────────────────────────────────────────────

function FilingCard({ record }: { record: FilingHistoryRecord }) {
  const navigate = useNavigate();

  // Only records with a generated self-assessment have a preview to show
  const canNavigateToPreview = ['generated', 'submitted', 'payment_pending', 'payment_confirmed', 'tcc_obtained'].includes(record.status);
  const canNavigateToSubmit = ['generated', 'submitted', 'payment_pending', 'payment_confirmed'].includes(record.status);

  const handleClick = () => {
    if (canNavigateToPreview) {
      navigate(`/app/filing/preview/${record._id}`);
    }
  };

  const handleContinue = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (record.status === 'generated') {
      navigate(`/app/filing/preview/${record._id}`);
    } else if (canNavigateToSubmit) {
      navigate(`/app/filing/submit/${record._id}`);
    }
  };

  return (
    <div
      onClick={handleClick}
      className={`bg-white border border-border rounded-xl overflow-hidden transition-colors ${
        canNavigateToPreview ? 'cursor-pointer hover:bg-muted/20 hover:border-primary/30' : 'cursor-default'
      }`}
    >
      <div className="px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Year + status row */}
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span className="text-base font-semibold text-neutral-900">
                Tax Year {record.taxYear}
              </span>
              <StatusBadge status={record.status} />
              {record.isNilReturn && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-500">
                  NIL
                </span>
              )}
            </div>

            {/* Entity name */}
            {record.entityName && (
              <p className="text-xs text-neutral-500 mb-2">{record.entityName}</p>
            )}

            {/* Key figures */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {record.netTaxPayable !== undefined && !record.isNilReturn ? (
                <span className="text-neutral-500">
                  Tax payable:{' '}
                  <span className="font-mono font-semibold text-neutral-800">
                    {formatNaira(record.netTaxPayable)}
                  </span>
                </span>
              ) : record.isNilReturn ? (
                <span className="font-medium text-emerald-600 text-xs">No tax owed</span>
              ) : null}

              {record.generatedAt && (
                <span className="text-neutral-400">
                  Generated {formatDate(record.generatedAt)}
                </span>
              )}
              {record.submittedAt && (
                <span className="text-neutral-400">
                  Submitted {formatDate(record.submittedAt)}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            {canNavigateToPreview && (
              <ChevronRight className="w-4 h-4 text-neutral-400" />
            )}
          </div>
        </div>

        {/* Action strip for in-progress filings */}
        {canNavigateToSubmit && record.status !== 'tcc_obtained' && (
          <div className="mt-3 pt-3 border-t border-border/40">
            <button
              onClick={handleContinue}
              className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
            >
              {record.status === 'generated' ? 'Preview & Submit →' : 'Continue submission →'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── skeletons ────────────────────────────────────────────────────────────────

function HistorySkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-white border border-border rounded-xl px-4 py-4 animate-pulse">
          <div className="flex items-center gap-2 mb-2">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-32 rounded-full" />
          </div>
          <Skeleton className="h-3 w-40 mb-2" />
          <div className="flex gap-4">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── main ─────────────────────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear();

export default function FilingHistory() {
  const navigate = useNavigate();
  const [selectedYear, setSelectedYear] = useState<number>(0); // 0 = All years

  // Fetch filing history — uses listByUser which returns all records for the current user
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawRecords = useQuery((api as any).filing.listByUser, { limit: 100 }) as
    | FilingHistoryRecord[]
    | null
    | undefined;

  const isLoading = rawRecords === undefined;

  // Filter by year
  const records: FilingHistoryRecord[] = (rawRecords ?? []).filter(
    (r) => selectedYear === 0 || r.taxYear === selectedYear
  );

  // Derive available years from records for the selector
  const availableYears = Array.from(
    new Set((rawRecords ?? []).map((r) => r.taxYear))
  ).sort((a, b) => b - a);

  // Add current and previous years if no records yet
  const yearOptions = Array.from(
    new Set([
      0, // "All"
      ...(availableYears.length > 0 ? availableYears : [CURRENT_YEAR - 1, CURRENT_YEAR - 2]),
    ])
  );

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/app/filing')}
          className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700 transition-colors mb-3"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to filing
        </button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-heading-xl font-display text-neutral-900 flex items-center gap-2">
              <History className="w-5 h-5 text-primary" />
              Filing History
            </h1>
            <p className="text-body-sm text-neutral-500 mt-0.5">
              Past and in-progress tax filings
            </p>
          </div>

          {/* Year filter */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Calendar className="w-4 h-4 text-neutral-400" />
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="text-sm border border-border rounded-lg px-3 py-1.5 bg-white text-neutral-700 focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value={0}>All years</option>
              {yearOptions.filter((y) => y !== 0).map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <HistorySkeleton />
      ) : records.length === 0 ? (
        <div className="bg-white rounded-xl border border-border shadow-soft p-10 flex flex-col items-center text-center">
          <FileText className="w-10 h-10 text-neutral-200 mb-3" />
          <p className="text-sm font-medium text-neutral-700 mb-1">
            {selectedYear !== 0 ? `No filing records for ${selectedYear}` : 'No filing records yet'}
          </p>
          <p className="text-xs text-neutral-400 mb-4">
            {selectedYear !== 0
              ? 'Try selecting a different year or view all years.'
              : 'Start your tax filing to see records here.'}
          </p>
          {selectedYear !== 0 ? (
            <button
              onClick={() => setSelectedYear(0)}
              className="text-sm font-medium text-primary hover:text-primary/80 transition-colors"
            >
              Show all years
            </button>
          ) : (
            <button
              onClick={() => navigate('/app/filing')}
              className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Start Filing
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {records.map((record) => (
            <FilingCard key={record._id} record={record} />
          ))}
          <p className="text-center text-xs text-neutral-400 pt-2">
            {records.length} {records.length === 1 ? 'record' : 'records'}
            {selectedYear !== 0 ? ` for ${selectedYear}` : ' total'}
          </p>
        </div>
      )}
    </div>
  );
}
