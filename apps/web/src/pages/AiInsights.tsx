import { useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import { useEntity } from '../contexts/EntityContext';
import { Link } from 'react-router-dom';
import { Skeleton } from '../components/Skeleton';
import {
  Sparkles,
  ChevronLeft,
  Target,
  BarChart2,
  RefreshCcw,
  CheckCircle2,
  XCircle,
  ArrowRight,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CategoryStat {
  category: string;
  total: number;
  accepted: number;
  overridden: number;
  accuracy: number;
}

interface AiStats {
  hasData: boolean;
  totalAiCategorised: number;
  totalManual: number;
  totalFeedback: number;
  overrideRate: number;
  accuracyRate: number;
  byCategory: CategoryStat[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function AccuracyBadge({ accuracy }: { accuracy: number }) {
  const pctVal = Math.round(accuracy * 100);
  if (pctVal >= 80) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
        <CheckCircle2 className="w-3 h-3" />
        {pctVal}%
      </span>
    );
  }
  if (pctVal >= 60) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-100">
        <Target className="w-3 h-3" />
        {pctVal}%
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-100">
      <XCircle className="w-3 h-3" />
      {pctVal}%
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AiInsights() {
  const { activeEntityId } = useEntity();

  const stats = useQuery(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (api as any).transactions.getAiStats,
    activeEntityId ? { entityId: activeEntityId } : 'skip'
  ) as AiStats | null | undefined;

  const isLoading = stats === undefined;

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header */}
      <div className="bg-white border-b border-neutral-200 sticky top-0 z-10 backdrop-blur supports-[backdrop-filter]:bg-white/90">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="flex items-center gap-3 h-14">
            <Link
              to="/app/transactions"
              className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-violet-500" />
              <h1 className="text-body-lg font-semibold text-neutral-900">
                AI Categorisation Insights
              </h1>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {isLoading ? (
          <LoadingSkeleton />
        ) : !stats || !stats.hasData ? (
          <EmptyState />
        ) : (
          <InsightsContent stats={stats} />
        )}
      </div>
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-neutral-200 p-4 space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-12" />
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-neutral-200 p-4 space-y-3">
        <Skeleton className="h-4 w-32" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-5 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-violet-50 flex items-center justify-center mb-4">
        <Sparkles className="w-8 h-8 text-violet-400" />
      </div>
      <h2 className="text-heading-sm font-semibold text-neutral-900 mb-2">
        No AI insights yet
      </h2>
      <p className="text-body-sm text-neutral-500 max-w-sm mb-6">
        As you review and correct AI categorisations, accuracy insights will appear here.
      </p>
      <Link
        to="/app/triage"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 text-white text-body-sm font-medium hover:bg-violet-700 transition-colors"
      >
        Go to Triage
        <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  );
}

// ─── Insights content ─────────────────────────────────────────────────────────

function InsightsContent({ stats }: { stats: AiStats }) {
  const overrideRatePct = Math.round(stats.overrideRate * 100);
  const accuracyRatePct = Math.round(stats.accuracyRate * 100);

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          icon={<Sparkles className="w-4 h-4 text-violet-500" />}
          label="AI Categorised"
          value={stats.totalAiCategorised.toLocaleString()}
          bg="bg-violet-50"
        />
        <StatCard
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}
          label="Overall Accuracy"
          value={pct(stats.accuracyRate)}
          bg="bg-emerald-50"
          valueColor={
            accuracyRatePct >= 80
              ? 'text-emerald-700'
              : accuracyRatePct >= 60
              ? 'text-amber-700'
              : 'text-red-700'
          }
        />
        <StatCard
          icon={<RefreshCcw className="w-4 h-4 text-amber-500" />}
          label="Override Rate"
          value={pct(stats.overrideRate)}
          bg="bg-amber-50"
          valueColor={overrideRatePct <= 20 ? 'text-emerald-700' : overrideRatePct <= 40 ? 'text-amber-700' : 'text-red-700'}
        />
        <StatCard
          icon={<BarChart2 className="w-4 h-4 text-sky-500" />}
          label="Reviews Done"
          value={stats.totalFeedback.toLocaleString()}
          bg="bg-sky-50"
        />
      </div>

      {/* Accuracy bar */}
      <div className="bg-white rounded-xl border border-neutral-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-body-sm font-semibold text-neutral-900">
            AI vs Manual breakdown
          </h2>
        </div>
        <div className="space-y-3">
          <BreakdownRow
            label="AI categorised"
            count={stats.totalAiCategorised}
            total={stats.totalAiCategorised + stats.totalManual}
            color="bg-violet-500"
          />
          <BreakdownRow
            label="Manually categorised"
            count={stats.totalManual}
            total={stats.totalAiCategorised + stats.totalManual}
            color="bg-sky-400"
          />
        </div>
      </div>

      {/* Per-category accuracy */}
      {stats.byCategory.length > 0 && (
        <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-100">
            <h2 className="text-body-sm font-semibold text-neutral-900">
              Accuracy by category
            </h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              How often the AI suggestion matched your final choice
            </p>
          </div>
          <div className="divide-y divide-neutral-100">
            {stats.byCategory.map((cat) => (
              <div key={cat.category} className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-body-sm font-medium text-neutral-900 truncate">
                    {cat.category}
                  </p>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    {cat.accepted} accepted · {cat.overridden} overridden · {cat.total} total
                  </p>
                </div>
                <AccuracyBadge accuracy={cat.accuracy} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CTA to triage */}
      {stats.totalFeedback < 20 && (
        <div className="bg-violet-50 border border-violet-100 rounded-xl p-4 flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-violet-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-body-sm font-medium text-violet-900">
              Keep reviewing to improve accuracy
            </p>
            <p className="text-xs text-violet-600 mt-0.5">
              The AI learns from your corrections. Review more transactions in Triage to
              personalise categorisations.
            </p>
          </div>
          <Link
            to="/app/triage"
            className="flex-shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-medium hover:bg-violet-700 transition-colors"
          >
            Triage
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  bg,
  valueColor = 'text-neutral-900',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  bg: string;
  valueColor?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-4">
      <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center mb-2`}>
        {icon}
      </div>
      <p className="text-xs text-neutral-500 mb-0.5">{label}</p>
      <p className={`text-xl font-bold ${valueColor}`}>{value}</p>
    </div>
  );
}

function BreakdownRow({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pctVal = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-body-sm text-neutral-600">{label}</span>
        <span className="text-body-sm font-medium text-neutral-900">
          {count.toLocaleString()} ({pctVal}%)
        </span>
      </div>
      <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-500`}
          style={{ width: `${pctVal}%` }}
        />
      </div>
    </div>
  );
}
