import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import { useEntity } from '../contexts/EntityContext';
import { Skeleton } from '../components/Skeleton';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronRight,
  FolderOpen,
  Calendar,
  History,
} from 'lucide-react';

// ─── helpers ─────────────────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear();
const TAX_YEARS = [CURRENT_YEAR - 1, CURRENT_YEAR - 2, CURRENT_YEAR - 3];

/** Navigation destination for each checklist item key */
const ITEM_ROUTES: Record<string, string> = {
  nin: '/app/settings',
  entityType: '/app/settings/entities',
  bankAccounts: '/app/settings/accounts',
  foreignIncome: '/app/transactions',
  incomeReviewed: '/app/transactions',
  categorisation: '/app/triage',
  expensesVerified: '/app/transactions',
  rentDeclared: '/app/declarations',
  invoicesMatched: '/app/invoices',
  wht: '/app/transactions',
};

type ChecklistItemStatus = 'complete' | 'incomplete' | 'warning';

interface ChecklistItem {
  key: string;
  label: string;
  description: string;
  status: ChecklistItemStatus;
  group: string;
}

// ─── status indicator ────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: ChecklistItemStatus }) {
  if (status === 'complete') {
    return <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />;
  }
  if (status === 'warning') {
    return <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />;
  }
  return <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />;
}

function statusLabel(status: ChecklistItemStatus): string {
  if (status === 'complete') return 'Done';
  if (status === 'warning') return 'Needs attention';
  return 'Missing';
}

function statusBadgeClass(status: ChecklistItemStatus): string {
  if (status === 'complete') return 'bg-emerald-50 text-emerald-700';
  if (status === 'warning') return 'bg-amber-50 text-amber-700';
  return 'bg-red-50 text-red-600';
}

// ─── readiness meter ─────────────────────────────────────────────────────────

function ReadinessMeter({ percent }: { percent: number }) {
  const color =
    percent >= 90 ? 'bg-emerald-500' : percent >= 60 ? 'bg-amber-500' : 'bg-red-500';
  const textColor =
    percent >= 90 ? 'text-emerald-700' : percent >= 60 ? 'text-amber-600' : 'text-red-600';

  return (
    <div className="bg-white rounded-xl border border-border shadow-soft p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-neutral-700">Filing Readiness</span>
        <span className={`text-2xl font-bold font-display ${textColor}`}>{percent}% Ready</span>
      </div>
      <div className="h-3 w-full bg-neutral-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-xs text-neutral-500 mt-2">
        {percent >= 90
          ? 'You\'re ready to start the filing review.'
          : `Complete all required items to reach 90% and unlock the filing review.`}
      </p>
    </div>
  );
}

// ─── checklist item row ───────────────────────────────────────────────────────

function ChecklistRow({ item, onClick }: { item: ChecklistItem; onClick: () => void }) {
  const isActionable = item.status !== 'complete';
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/30 transition-colors border-b border-border/50 last:border-0 text-left"
    >
      <StatusIcon status={item.status} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-neutral-800">{item.label}</span>
          <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${statusBadgeClass(item.status)}`}>
            {statusLabel(item.status)}
          </span>
        </div>
        {isActionable && (
          <p className="text-xs text-neutral-500 mt-0.5 leading-snug">{item.description}</p>
        )}
      </div>
      <ChevronRight className="w-4 h-4 text-neutral-400 flex-shrink-0" />
    </button>
  );
}

// ─── checklist group ──────────────────────────────────────────────────────────

function ChecklistGroup({ group, items, onNavigate }: {
  group: string;
  items: ChecklistItem[];
  onNavigate: (key: string) => void;
}) {
  const doneCount = items.filter((i) => i.status === 'complete').length;
  return (
    <div className="bg-white rounded-xl border border-border shadow-soft overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/20">
        <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">{group}</span>
        <span className="text-xs text-neutral-400">{doneCount}/{items.length}</span>
      </div>
      {items.map((item) => (
        <ChecklistRow key={item.key} item={item} onClick={() => onNavigate(item.key)} />
      ))}
    </div>
  );
}

// ─── skeleton ────────────────────────────────────────────────────────────────

function ChecklistSkeleton() {
  return (
    <div className="space-y-4 animate-fade-in">
      <Skeleton className="h-24 w-full rounded-xl" />
      {[1, 2, 3].map((g) => (
        <div key={g} className="bg-white rounded-xl border border-border shadow-soft overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/20">
            <Skeleton className="h-3 w-32" />
          </div>
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3.5 border-b border-border/50 last:border-0">
              <Skeleton className="w-5 h-5 rounded-full flex-shrink-0" />
              <div className="flex-1">
                <Skeleton className="h-3.5 w-40 mb-1.5" />
                <Skeleton className="h-3 w-56" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function Filing() {
  const navigate = useNavigate();
  const { activeEntityId } = useEntity();
  const [taxYear, setTaxYear] = useState(CURRENT_YEAR - 1);

  const checklistResult = useQuery(
    (api as any).tax.getFilingChecklist,
    activeEntityId ? { entityId: activeEntityId, taxYear } : 'skip'
  ) as { items: ChecklistItem[]; readinessPercent: number; grouped: Record<string, ChecklistItem[]> } | null | undefined;

  const grouped = useMemo(() => {
    if (!checklistResult?.grouped) return null;
    return checklistResult.grouped;
  }, [checklistResult]);

  const readiness = checklistResult?.readinessPercent ?? 0;
  const canStartReview = readiness >= 90;
  const isLoading = checklistResult === undefined && activeEntityId !== null;

  function handleNavigate(key: string) {
    const route = ITEM_ROUTES[key] ?? '/app/transactions';
    navigate(route);
  }

  function handleStartReview() {
    if (!canStartReview) return;
    navigate('/app/filing/review');
  }

  if (!activeEntityId) {
    return (
      <div className="max-w-2xl mx-auto animate-fade-in">
        <div className="bg-white rounded-xl border border-border shadow-soft p-10 flex flex-col items-center text-center">
          <FolderOpen className="w-10 h-10 text-neutral-300 mb-3" />
          <p className="text-sm text-neutral-500">No entity selected. Please set up your tax entity first.</p>
          <button
            onClick={() => navigate('/app/settings/entities')}
            className="mt-4 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Set up entity
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-heading-xl font-display text-neutral-900">Filing</h1>
          <p className="text-body-sm text-neutral-500 mt-0.5">
            File your self-assessment return with FIRS
          </p>
        </div>
        {/* Tax year selector */}
        <div className="flex items-center gap-2 bg-white border border-border rounded-lg px-3 py-2 shadow-soft flex-shrink-0">
          <Calendar className="w-4 h-4 text-neutral-400" />
          <select
            value={taxYear}
            onChange={(e) => setTaxYear(Number(e.target.value))}
            className="text-sm font-medium text-neutral-700 bg-transparent outline-none cursor-pointer"
          >
            {TAX_YEARS.map((yr) => (
              <option key={yr} value={yr}>{yr}</option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <ChecklistSkeleton />
      ) : (
        <div className="space-y-4">
          {/* Readiness meter */}
          <ReadinessMeter percent={readiness} />

          {/* Grouped checklist */}
          {grouped && Object.entries(grouped).map(([group, items]) => (
            <ChecklistGroup
              key={group}
              group={group}
              items={items}
              onNavigate={handleNavigate}
            />
          ))}

          {/* Start Filing Review CTA */}
          <div className="pt-2 pb-6">
            <button
              onClick={handleStartReview}
              disabled={!canStartReview}
              className={`w-full py-3.5 rounded-xl font-semibold text-sm transition-all duration-200 ${
                canStartReview
                  ? 'bg-primary text-white hover:bg-primary/90 shadow-soft active:scale-[0.99]'
                  : 'bg-neutral-100 text-neutral-400 cursor-not-allowed'
              }`}
            >
              {canStartReview ? 'Start Filing Review →' : `Complete checklist to unlock (${readiness}% ready)`}
            </button>
            {!canStartReview && (
              <p className="text-xs text-center text-neutral-400 mt-2">
                Reach 90% readiness to start your filing review
              </p>
            )}
          </div>

          {/* Filing History link */}
          <div className="text-center pb-4">
            <button
              onClick={() => navigate('/app/filing/history')}
              className="inline-flex items-center gap-1.5 text-sm text-neutral-400 hover:text-neutral-600 transition-colors"
            >
              <History className="w-4 h-4" />
              View filing history
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
