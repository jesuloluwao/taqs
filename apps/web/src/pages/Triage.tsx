import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { useEntity } from '../contexts/EntityContext';
import { CategoryPickerModal } from '../components/CategoryPickerModal';
import type { CategoryOption } from '../components/CategoryPickerModal';
import { toast } from 'sonner';
import {
  CheckCircle2,
  Tag,
  UserX,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  Globe,
  ChevronRight,
  Info,
  X,
  Sparkles,
  XCircle,
  CheckSquare,
  Square,
  Check,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────
interface UncategorisedTx {
  _id: Id<'transactions'>;
  entityId: Id<'entities'>;
  date: number;
  description: string;
  amount: number;
  currency: string;
  amountNgn: number;
  direction?: 'credit' | 'debit';
  type?: string;
  source?: string;
  notes?: string;
  // AI fields
  aiCategorySuggestion?: string;
  aiTypeSuggestion?: string;
  aiCategoryConfidence?: number;
  aiReasoning?: string;
  aiCategorisingJobId?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function formatNaira(kobo: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(kobo / 100);
}

function formatDate(ts: number): string {
  return new Intl.DateTimeFormat('en-NG', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(ts));
}

// ── Progress bar ────────────────────────────────────────────────────────────
function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-body-sm text-neutral-500">
          {current === total ? 'All done!' : `${total - current} remaining`}
        </span>
        <span className="text-body-sm font-medium text-neutral-900">
          {pct}% reviewed
        </span>
      </div>
      <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── All done state ──────────────────────────────────────────────────────────
function AllDoneState({ onViewTransactions }: { onViewTransactions: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center animate-slide-up">
      <div className="w-20 h-20 rounded-full bg-success/10 flex items-center justify-center mb-5">
        <CheckCircle2 className="w-10 h-10 text-success" strokeWidth={1.5} />
      </div>
      <h2 className="text-heading-lg font-display text-neutral-900 mb-2">
        All transactions categorised
      </h2>
      <p className="text-body text-neutral-500 mb-8 max-w-xs">
        Great work! Every transaction has been reviewed. Your tax calculations are now more accurate.
      </p>
      <button
        onClick={onViewTransactions}
        className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl text-body font-medium hover:bg-primary/90 transition-colors shadow-soft"
      >
        View Transactions
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

// ── AI Reasoning bottom sheet ───────────────────────────────────────────────
function AiReasoningSheet({
  reasoning,
  suggestion,
  confidence,
  onClose,
}: {
  reasoning: string;
  suggestion?: string;
  confidence?: number;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-t-2xl shadow-medium p-6 pb-10 animate-slide-up">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">🤖</span>
            <h3 className="text-heading-sm font-display text-neutral-900">AI Reasoning</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted text-neutral-400 hover:text-neutral-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {suggestion && confidence !== undefined && (
          <div className="flex items-center gap-2 mb-3 p-2.5 bg-neutral-50 rounded-lg">
            <span className="text-body-sm text-neutral-600">Suggested:</span>
            <span className="text-body-sm font-semibold text-neutral-900">{suggestion}</span>
            <span className={`ml-auto text-body-sm font-semibold ${
              confidence >= 0.9 ? 'text-success' : 'text-warning'
            }`}>
              {Math.round(confidence * 100)}%
            </span>
          </div>
        )}
        <p className="text-body-sm text-neutral-700 leading-relaxed">{reasoning}</p>
      </div>
    </div>
  );
}

// ── Transaction card ────────────────────────────────────────────────────────
interface DraftAssignment {
  categoryId: Id<'categories'>;
  categoryName: string;
  type: 'income' | 'business_expense' | 'personal_expense' | 'transfer';
}

function TransactionListRow({
  tx,
  selected,
  draftAssignment,
  processing,
  onToggleSelect,
  onOpenCategoryPicker,
  onAcceptAiSuggestion,
  onMarkPersonal,
  onShowReasoning,
}: {
  tx: UncategorisedTx;
  selected: boolean;
  draftAssignment?: DraftAssignment;
  processing: boolean;
  onToggleSelect: () => void;
  onOpenCategoryPicker: () => void;
  onAcceptAiSuggestion: () => void;
  onMarkPersonal: () => void;
  onShowReasoning: () => void;
}) {
  const isCredit = tx.direction === 'credit';
  const isForeign = tx.currency !== 'NGN';
  const hasAiSuggestion = !!(tx.aiCategorySuggestion && tx.aiCategoryConfidence !== undefined);
  const confidencePct = hasAiSuggestion ? Math.round(tx.aiCategoryConfidence! * 100) : 0;
  const isHighConfidence = hasAiSuggestion && tx.aiCategoryConfidence! >= 0.9;

  return (
    <div className={`rounded-2xl border p-4 transition-colors ${
      selected ? 'border-primary/40 bg-primary-light/30' : 'border-border bg-white'
    }`}>
      <div className="flex items-start gap-3">
        <button
          onClick={onToggleSelect}
          className="mt-0.5 p-0.5 text-neutral-500 hover:text-primary transition-colors"
          aria-label={selected ? 'Unselect transaction' : 'Select transaction'}
        >
          {selected ? <CheckSquare className="w-5 h-5 text-primary" /> : <Square className="w-5 h-5" />}
        </button>

        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
            isCredit ? 'bg-success/10' : 'bg-danger/10'
          }`}
        >
          {isCredit ? (
            <ArrowDownLeft className="w-5 h-5 text-success" />
          ) : (
            <ArrowUpRight className="w-5 h-5 text-danger" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-body font-medium text-neutral-900 truncate">{tx.description}</p>
              <p className="text-body-sm text-neutral-500">{formatDate(tx.date)}</p>
            </div>
            <div className="text-right">
              <p className={`text-heading-sm font-display font-bold ${isCredit ? 'text-success' : 'text-neutral-900'}`}>
                {isCredit ? '+' : '-'}
                {formatNaira(tx.amountNgn)}
              </p>
              {isForeign && (
                <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full bg-accent/10 text-accent text-[11px] font-medium">
                  <Globe className="w-3 h-3" />
                  {tx.currency}
                </span>
              )}
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium ${
                isCredit ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
              }`}
            >
              {isCredit ? 'Credit' : 'Debit'}
            </span>
            <span className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-warning/10 text-warning">
              Uncategorised
            </span>
            {draftAssignment && (
              <span className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-primary/10 text-primary">
                Pending: {draftAssignment.categoryName}
              </span>
            )}
          </div>

          {hasAiSuggestion && (
            <div className={`mt-3 p-2.5 rounded-lg border ${
              isHighConfidence ? 'bg-success/5 border-success/20' : 'bg-warning/5 border-warning/20'
            }`}>
              <div className="flex items-center justify-between gap-2">
                <div className="text-body-sm text-neutral-700">
                  AI suggests <span className="font-semibold">{tx.aiCategorySuggestion}</span> ({confidencePct}%)
                </div>
                {tx.aiReasoning && (
                  <button
                    onClick={onShowReasoning}
                    className="p-1 rounded-md hover:bg-black/5 text-neutral-400 hover:text-neutral-700 transition-colors"
                    title="View AI reasoning"
                  >
                    <Info className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="mt-3 flex items-center gap-2 flex-wrap">
            {tx.aiCategorySuggestion && (
              <button
                disabled={processing}
                onClick={onAcceptAiSuggestion}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-body-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
              >
                <Check className="w-4 h-4" />
                Accept AI
              </button>
            )}
            <button
              disabled={processing}
              onClick={onOpenCategoryPicker}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-white text-neutral-700 text-body-sm font-medium hover:bg-muted transition-colors disabled:opacity-60"
            >
              <Tag className="w-4 h-4" />
              Set category
            </button>
            <button
              disabled={processing}
              onClick={onMarkPersonal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-white text-neutral-600 text-body-sm font-medium hover:bg-muted transition-colors disabled:opacity-60"
            >
              <UserX className="w-4 h-4" />
              Mark personal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── AI bulk categorise confirm dialog (Triage) ─────────────────────────────
function TriageAiConfirmDialog({
  count,
  onConfirm,
  onCancel,
  loading,
}: {
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !loading && onCancel()} />
      <div className="relative bg-white rounded-2xl shadow-medium w-full max-w-sm p-6 animate-slide-up">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-primary-light flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-neutral-900">Auto-categorise with AI</h3>
            <p className="text-xs text-neutral-500 mt-0.5">Powered by Claude Haiku</p>
          </div>
        </div>
        <p className="text-body-sm text-neutral-600 mb-5">
          TaxEase AI will attempt to categorise{' '}
          <span className="font-semibold text-neutral-900">{count} uncategorised transaction{count !== 1 ? 's' : ''}</span>
          . High-confidence results are applied automatically; low-confidence items remain for manual review.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 px-4 py-2.5 text-body-sm font-medium text-neutral-700 bg-muted rounded-lg hover:bg-muted/80 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 px-4 py-2.5 text-body-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Start
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── AI progress overlay (Triage) ────────────────────────────────────────────
interface CategorisingJobInfo {
  status: string;
  totalTransactions: number;
  batchesTotal?: number;
  batchesCompleted?: number;
  totalCategorised?: number;
  totalLowConfidence?: number;
}

function TriageAiProgressOverlay({
  jobId,
  onCancel,
  onComplete,
}: {
  jobId: Id<'categorisingJobs'>;
  onCancel: () => void;
  onComplete: (categorised: number, lowConfidence: number, total: number) => void;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const job = useQuery((api as any).categorisingJobs.get, { id: jobId }) as CategorisingJobInfo | null | undefined;
  const notifiedRef = useRef(false);

  useEffect(() => {
    if (!job || notifiedRef.current) return;
    if (job.status === 'complete' || job.status === 'failed') {
      notifiedRef.current = true;
      onComplete(job.totalCategorised ?? 0, job.totalLowConfidence ?? 0, job.totalTransactions);
    }
  }, [job, onComplete]);

  const batchesTotal = job?.batchesTotal ?? 0;
  const batchesCompleted = job?.batchesCompleted ?? 0;
  const pct = batchesTotal > 0 ? Math.round((batchesCompleted / batchesTotal) * 100) : 0;
  const statusLabel =
    job?.status === 'processing'
      ? `Processing batch ${batchesCompleted + 1} of ${batchesTotal}…`
      : job?.status === 'complete'
      ? 'Categorisation complete'
      : job?.status === 'failed'
      ? 'Categorisation failed'
      : 'Starting…';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-medium w-full max-w-sm p-6 animate-slide-up">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-primary-light flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-neutral-900">AI Categorisation</h3>
            <p className="text-xs text-neutral-500 mt-0.5">{statusLabel}</p>
          </div>
        </div>
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-body-sm text-neutral-500">
              {batchesTotal > 0 ? `${batchesCompleted} of ${batchesTotal} batches` : 'Preparing…'}
            </span>
            <span className="text-body-sm font-medium text-neutral-900">{pct}%</span>
          </div>
          <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
            {batchesTotal === 0 ? (
              <div className="h-full bg-primary/40 rounded-full animate-pulse w-full" />
            ) : (
              <div
                className="h-full bg-primary rounded-full transition-all duration-700"
                style={{ width: `${pct}%` }}
              />
            )}
          </div>
        </div>
        <p className="text-body-sm text-neutral-500 mb-5">
          Analysing {job?.totalTransactions ?? '…'} transactions with Claude AI.
        </p>
        <button
          onClick={onCancel}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-body-sm font-medium text-neutral-600 border border-border rounded-lg hover:bg-muted transition-colors"
        >
          <XCircle className="w-4 h-4" />
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function Triage() {
  const { activeEntityId } = useEntity();
  const navigate = useNavigate();

  const rawList = useQuery(
    api.transactions.getUncategorised,
    activeEntityId ? { entityId: activeEntityId, limit: 500 } : 'skip'
  ) as UncategorisedTx[] | undefined;

  const updateTx = useMutation(api.transactions.update);
  const acceptAiMutation = useMutation(api.transactions.acceptAiSuggestion);
  const recordFeedbackMutation = useMutation(api.transactions.recordAiFeedback);
  const bulkCategoriseMutation = useMutation(api.transactions.bulkCategorise);

  const [initialTotal, setInitialTotal] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [draftAssignments, setDraftAssignments] = useState<Record<string, DraftAssignment>>({});
  const [showPicker, setShowPicker] = useState(false);
  const [pickerTargetIds, setPickerTargetIds] = useState<Id<'transactions'>[]>([]);
  const [pickerDirection, setPickerDirection] = useState<'credit' | 'debit' | undefined>(undefined);
  const [showReasoningTxId, setShowReasoningTxId] = useState<Id<'transactions'> | null>(null);
  const [processing, setProcessing] = useState(false);

  // AI bulk categorise state
  const [showAiConfirm, setShowAiConfirm] = useState(false);
  const [aiConfirmLoading, setAiConfirmLoading] = useState(false);
  const [activeAiJobId, setActiveAiJobId] = useState<Id<'categorisingJobs'> | null>(null);

  const autoCategoriseAction = useAction(api.transactionActions.autoCategorise);
  const cancelJobMutation = useMutation(api.categorisingJobs.cancel);

  const uncategorised = useMemo(() => rawList ?? [], [rawList]);
  const uncategorisedMap = useMemo(
    () => new Map(uncategorised.map((tx) => [tx._id as string, tx])),
    [uncategorised]
  );

  const selectedTransactions = useMemo(
    () => uncategorised.filter((tx) => selectedIds.has(tx._id as string)),
    [uncategorised, selectedIds]
  );

  const pendingCount = useMemo(() => {
    let count = 0;
    for (const id of Object.keys(draftAssignments)) {
      if (uncategorisedMap.has(id)) count++;
    }
    return count;
  }, [draftAssignments, uncategorisedMap]);

  const reviewedCount = initialTotal === null ? 0 : Math.max(initialTotal - uncategorised.length, 0);
  const totalToReview = initialTotal ?? uncategorised.length;
  const isLoading = rawList === undefined;

  useEffect(() => {
    if (rawList !== undefined && initialTotal === null) {
      setInitialTotal(rawList.length);
    }
  }, [rawList, initialTotal]);

  useEffect(() => {
    // Keep selection and drafts in sync with current list.
    const available = new Set(uncategorised.map((tx) => tx._id as string));
    setSelectedIds((prev) => {
      const next = new Set<string>();
      for (const id of prev) {
        if (available.has(id)) next.add(id);
      }
      return next;
    });
    setDraftAssignments((prev) => {
      const next: Record<string, DraftAssignment> = {};
      for (const [id, assignment] of Object.entries(prev)) {
        if (available.has(id)) next[id] = assignment;
      }
      return next;
    });
  }, [uncategorised]);

  const clearStateForIds = useCallback((ids: string[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
    setDraftAssignments((prev) => {
      const next = { ...prev };
      for (const id of ids) delete next[id];
      return next;
    });
  }, []);

  async function handleAcceptAiSuggestion(tx: UncategorisedTx) {
    if (processing) return;
    setProcessing(true);
    try {
      const result = await acceptAiMutation({ id: tx._id });
      clearStateForIds([tx._id as string]);
      toast.success(`Accepted: ${(result as { categoryName: string }).categoryName}`);
    } catch {
      toast.error('Failed to accept AI suggestion');
    } finally {
      setProcessing(false);
    }
  }

  async function handleMarkPersonalMany(transactions: UncategorisedTx[]) {
    if (transactions.length === 0 || processing) return;
    setProcessing(true);
    try {
      await Promise.all(
        transactions.map(async (tx) => {
          const hasAiSuggestion = !!tx.aiCategorySuggestion;
          if (hasAiSuggestion && activeEntityId) {
            await recordFeedbackMutation({
              entityId: activeEntityId,
              transactionId: tx._id,
              aiSuggestedCategory: tx.aiCategorySuggestion,
              aiSuggestedType: tx.aiTypeSuggestion as
                | 'income' | 'business_expense' | 'personal_expense' | 'transfer' | 'uncategorised'
                | undefined,
              aiConfidence: tx.aiCategoryConfidence,
              userChosenCategory: 'Personal Expense',
              userChosenType: 'personal_expense',
              transactionDescription: tx.description,
              transactionAmount: tx.amount,
              transactionDirection: tx.direction ?? 'debit',
            });
          }

          await updateTx({
            id: tx._id,
            type: 'personal_expense',
            isDeductible: false,
            reviewedByUser: true,
            userOverrodeAi: hasAiSuggestion,
          });
        })
      );

      clearStateForIds(transactions.map((tx) => tx._id as string));
      toast.success(`Marked ${transactions.length} transaction${transactions.length !== 1 ? 's' : ''} as personal`);
    } catch {
      toast.error('Failed to bulk update selected transactions');
    } finally {
      setProcessing(false);
    }
  }

  function openCategoryPickerForIds(ids: Id<'transactions'>[]) {
    if (ids.length === 0) return;
    const targetTxs = ids
      .map((id) => uncategorisedMap.get(id as string))
      .filter(Boolean) as UncategorisedTx[];
    if (targetTxs.length === 0) return;

    const firstDirection = targetTxs[0].direction;
    const sameDirection = targetTxs.every((tx) => tx.direction === firstDirection);
    setPickerDirection(sameDirection ? firstDirection : undefined);
    setPickerTargetIds(ids);
    setShowPicker(true);
  }

  function applyDraftForIds(ids: Id<'transactions'>[], category: CategoryOption) {
    setDraftAssignments((prev) => {
      const next = { ...prev };
      for (const id of ids) {
        next[id as string] = {
          categoryId: category._id,
          categoryName: category.name,
          type: category.type,
        };
      }
      return next;
    });
  }

  async function handleApplyPending() {
    if (pendingCount === 0 || processing) return;
    setProcessing(true);
    try {
      const updatesByCategory = new Map<string, {
        categoryId: Id<'categories'>;
        type: DraftAssignment['type'];
        ids: Id<'transactions'>[];
      }>();
      const txsForFeedback: Array<{ tx: UncategorisedTx; assignment: DraftAssignment }> = [];
      const updatedIds: string[] = [];

      for (const [id, assignment] of Object.entries(draftAssignments)) {
        const tx = uncategorisedMap.get(id);
        if (!tx) continue;
        const key = `${assignment.categoryId}:${assignment.type}`;
        const existing = updatesByCategory.get(key);
        if (existing) {
          existing.ids.push(tx._id);
        } else {
          updatesByCategory.set(key, {
            categoryId: assignment.categoryId,
            type: assignment.type,
            ids: [tx._id],
          });
        }
        updatedIds.push(id);

        if (tx.aiCategorySuggestion && activeEntityId) {
          txsForFeedback.push({ tx, assignment });
        }
      }

      await Promise.all(
        Array.from(updatesByCategory.values()).map((group) =>
          bulkCategoriseMutation({
            ids: group.ids,
            categoryId: group.categoryId,
            type: group.type,
          })
        )
      );

      if (activeEntityId && txsForFeedback.length > 0) {
        await Promise.all(
          txsForFeedback.map(({ tx, assignment }) =>
            recordFeedbackMutation({
              entityId: activeEntityId,
              transactionId: tx._id,
              aiSuggestedCategory: tx.aiCategorySuggestion,
              aiSuggestedType: tx.aiTypeSuggestion as
                | 'income' | 'business_expense' | 'personal_expense' | 'transfer' | 'uncategorised'
                | undefined,
              aiConfidence: tx.aiCategoryConfidence,
              userChosenCategory: assignment.categoryName,
              userChosenType: assignment.type,
              transactionDescription: tx.description,
              transactionAmount: tx.amount,
              transactionDirection: tx.direction ?? 'debit',
            })
          )
        );
      }

      clearStateForIds(updatedIds);
      toast.success(`Applied ${updatedIds.length} category updates`);
    } catch {
      toast.error('Failed to apply pending category updates');
    } finally {
      setProcessing(false);
    }
  }

  async function handleStartAiCategorise() {
    if (!activeEntityId) return;
    setAiConfirmLoading(true);
    try {
      const result = await autoCategoriseAction({ entityId: activeEntityId }) as {
        categorisingJobId: string | null;
        totalTransactions: number;
      };
      setShowAiConfirm(false);
      if (!result.categorisingJobId) {
        toast.info('No uncategorised transactions to process');
        return;
      }
      setActiveAiJobId(result.categorisingJobId as Id<'categorisingJobs'>);
    } catch {
      toast.error('Failed to start AI categorisation');
    } finally {
      setAiConfirmLoading(false);
    }
  }

  const handleAiComplete = useCallback(
    (categorised: number, _lowConfidence: number, total: number) => {
      setActiveAiJobId(null);
      setInitialTotal(null);
      setSelectedIds(new Set());
      setDraftAssignments({});
      const needsReview = total - categorised;
      if (categorised === 0) {
        toast.info(`AI could not confidently categorise any transactions. ${total} need manual review.`);
      } else if (needsReview > 0) {
        toast.success(
          `Categorised ${categorised} of ${total} transaction${total !== 1 ? 's' : ''}. ${needsReview} need${needsReview === 1 ? 's' : ''} manual review.`,
          { duration: 6000 }
        );
      } else {
        toast.success(`Categorised all ${categorised} transaction${categorised !== 1 ? 's' : ''} successfully!`);
      }
    },
    []
  );

  async function handleCancelAiJob() {
    if (!activeAiJobId) return;
    try {
      await cancelJobMutation({ id: activeAiJobId });
    } catch {
      // Ignore cancel errors
    }
    setActiveAiJobId(null);
    toast.info('Categorisation cancelled');
  }

  if (!activeEntityId) {
    return (
      <div className="max-w-lg mx-auto animate-fade-in">
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-heading-md text-neutral-900 mb-1">No entity selected</p>
          <p className="text-body-sm text-neutral-500">
            Please select a tax entity from the sidebar.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto animate-fade-in">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-heading-xl font-display text-neutral-900">Categorise</h1>
          <p className="text-body-sm text-neutral-500 mt-0.5">
            Categorise multiple transactions at once to speed up tax review
          </p>
        </div>
        {(rawList?.length ?? 0) > 0 && !isLoading && (
          <button
            onClick={() => setShowAiConfirm(true)}
            disabled={!!activeAiJobId}
            className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-primary/30 bg-primary-light text-primary text-body-sm font-medium hover:bg-primary/15 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Sparkles className="w-4 h-4" />
            <span className="hidden sm:inline">Auto-categorise All with AI</span>
            <span className="sm:hidden">AI</span>
          </button>
        )}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-4">
          <div className="h-2 bg-neutral-100 rounded-full w-full" />
          <div className="bg-white rounded-2xl border border-border shadow-medium p-6 space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-neutral-100 animate-pulse flex-shrink-0" />
              <div className="flex-1 space-y-2 pt-1">
                <div className="h-6 bg-neutral-100 rounded animate-pulse w-3/4" />
                <div className="h-4 bg-neutral-100 rounded animate-pulse w-1/2" />
              </div>
            </div>
            <div className="h-4 bg-neutral-100 rounded animate-pulse w-full" />
            <div className="h-4 bg-neutral-100 rounded animate-pulse w-2/3" />
          </div>
        </div>
      )}

      {/* All done */}
      {!isLoading && uncategorised.length === 0 && (
        <AllDoneState onViewTransactions={() => navigate('/app/transactions')} />
      )}

      {/* Triage list */}
      {!isLoading && uncategorised.length > 0 && (
        <div className="space-y-5">
          {/* Progress */}
          <ProgressBar current={reviewedCount} total={totalToReview} />

          {/* Bulk action toolbar */}
          <div className="bg-white rounded-2xl border border-border shadow-soft p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <button
                onClick={() => {
                  if (selectedIds.size === uncategorised.length) {
                    setSelectedIds(new Set());
                    return;
                  }
                  setSelectedIds(new Set(uncategorised.map((tx) => tx._id as string)));
                }}
                className="inline-flex items-center gap-2 text-body-sm font-medium text-neutral-700 hover:text-neutral-900 transition-colors"
              >
                {selectedIds.size === uncategorised.length ? (
                  <CheckSquare className="w-4 h-4 text-primary" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
                {selectedIds.size === uncategorised.length ? 'Unselect all' : 'Select all'}
              </button>
              <div className="text-right">
                <p className="text-body-sm font-medium text-neutral-900">
                  {selectedIds.size} selected
                </p>
                <p className="text-[11px] text-neutral-500">{pendingCount} pending changes</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                disabled={processing}
                onClick={() => openCategoryPickerForIds(selectedTransactions.map((tx) => tx._id))}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border text-neutral-700 text-body-sm font-medium hover:bg-muted transition-colors disabled:opacity-60"
              >
                <Tag className="w-4 h-4" />
                Set selected category
              </button>
              <button
                disabled={processing}
                onClick={() => handleMarkPersonalMany(selectedTransactions)}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border text-neutral-700 text-body-sm font-medium hover:bg-muted transition-colors disabled:opacity-60"
              >
                <UserX className="w-4 h-4" />
                Mark selected personal
              </button>
              <button
                disabled={processing || pendingCount === 0}
                onClick={handleApplyPending}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-white text-body-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
              >
                <Check className="w-4 h-4" />
                Apply pending
              </button>
            </div>
          </div>

          <p className="text-center text-body-sm text-neutral-500">
            Assign categories row-by-row, then apply all updates in one batch.
          </p>

          <div className="space-y-3">
            {uncategorised.map((tx) => (
              <TransactionListRow
                key={tx._id}
                tx={tx}
                selected={selectedIds.has(tx._id as string)}
                draftAssignment={draftAssignments[tx._id as string]}
                processing={processing}
                onToggleSelect={() =>
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(tx._id as string)) next.delete(tx._id as string);
                    else next.add(tx._id as string);
                    return next;
                  })
                }
                onOpenCategoryPicker={() => openCategoryPickerForIds([tx._id])}
                onAcceptAiSuggestion={() => handleAcceptAiSuggestion(tx)}
                onMarkPersonal={() => handleMarkPersonalMany([tx])}
                onShowReasoning={() => setShowReasoningTxId(tx._id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty: no uncategorised */}
      {!isLoading && rawList !== undefined && rawList.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center animate-slide-up">
          <div className="w-20 h-20 rounded-full bg-primary-light flex items-center justify-center mb-5">
            <ArrowLeftRight className="w-10 h-10 text-primary" strokeWidth={1.5} />
          </div>
          <h2 className="text-heading-lg font-display text-neutral-900 mb-2">
            Nothing to review
          </h2>
          <p className="text-body text-neutral-500 mb-8 max-w-xs">
            All your transactions are already categorised. Import a bank statement to add more.
          </p>
          <button
            onClick={() => navigate('/app/transactions')}
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl text-body font-medium hover:bg-primary/90 transition-colors shadow-soft"
          >
            View Transactions
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Category picker modal */}
      {showPicker && pickerTargetIds.length > 0 && (
        <CategoryPickerModal
          title={pickerTargetIds.length > 1 ? 'Set Category for Selected Transactions' : 'Choose Category'}
          direction={pickerDirection}
          onClose={() => setShowPicker(false)}
          onSelect={async (cat) => {
            setShowPicker(false);
            applyDraftForIds(pickerTargetIds, cat);
            toast.success(
              `Queued "${cat.name}" for ${pickerTargetIds.length} transaction${pickerTargetIds.length !== 1 ? 's' : ''}`
            );
            setPickerTargetIds([]);
            setPickerDirection(undefined);
          }}
        />
      )}

      {/* AI Reasoning bottom sheet */}
      {showReasoningTxId && uncategorisedMap.get(showReasoningTxId as string)?.aiReasoning && (
        <AiReasoningSheet
          reasoning={uncategorisedMap.get(showReasoningTxId as string)!.aiReasoning!}
          suggestion={uncategorisedMap.get(showReasoningTxId as string)!.aiCategorySuggestion}
          confidence={uncategorisedMap.get(showReasoningTxId as string)!.aiCategoryConfidence}
          onClose={() => setShowReasoningTxId(null)}
        />
      )}

      {/* AI bulk categorise confirm dialog */}
      {showAiConfirm && (
        <TriageAiConfirmDialog
          count={rawList?.length ?? 0}
          onConfirm={handleStartAiCategorise}
          onCancel={() => setShowAiConfirm(false)}
          loading={aiConfirmLoading}
        />
      )}

      {/* AI bulk categorise progress overlay */}
      {activeAiJobId && (
        <TriageAiProgressOverlay
          jobId={activeAiJobId}
          onCancel={handleCancelAiJob}
          onComplete={handleAiComplete}
        />
      )}
    </div>
  );
}
