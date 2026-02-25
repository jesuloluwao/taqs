import { useState, useEffect, useRef, useCallback } from 'react';
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
  SkipForward,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  Globe,
  ChevronRight,
  Check,
  Info,
  X,
  Sparkles,
  XCircle,
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
function TransactionCard({
  tx,
  onShowReasoning,
}: {
  tx: UncategorisedTx;
  onShowReasoning: () => void;
}) {
  const isCredit = tx.direction === 'credit';
  const isForeign = tx.currency !== 'NGN';
  const hasAiSuggestion = !!(tx.aiCategorySuggestion && tx.aiCategoryConfidence !== undefined);
  const confidencePct = hasAiSuggestion ? Math.round(tx.aiCategoryConfidence! * 100) : 0;
  const isHighConfidence = hasAiSuggestion && tx.aiCategoryConfidence! >= 0.9;

  return (
    <div className="bg-white rounded-2xl border border-border shadow-medium p-6 animate-slide-up">
      {/* Direction icon + amount */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div
          className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
            isCredit ? 'bg-success/10' : 'bg-danger/10'
          }`}
        >
          {isCredit ? (
            <ArrowDownLeft className="w-6 h-6 text-success" />
          ) : (
            <ArrowUpRight className="w-6 h-6 text-danger" />
          )}
        </div>

        <div className="text-right min-w-0">
          <p
            className={`text-heading-xl font-display font-bold ${
              isCredit ? 'text-success' : 'text-neutral-900'
            }`}
          >
            {isCredit ? '+' : '-'}
            {formatNaira(tx.amountNgn)}
          </p>
          {isForeign && (
            <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full bg-accent/10 text-accent text-[11px] font-medium">
              <Globe className="w-3 h-3" />
              {new Intl.NumberFormat('en', {
                style: 'currency',
                currency: tx.currency,
                minimumFractionDigits: 0,
              }).format(tx.amount / 100)}{' '}
              {tx.currency}
            </span>
          )}
        </div>
      </div>

      {/* Description */}
      <div className="mb-4">
        <p className="text-heading-sm font-display text-neutral-900 leading-snug mb-1">
          {tx.description}
        </p>
        <p className="text-body-sm text-neutral-500">{formatDate(tx.date)}</p>
      </div>

      {/* AI Suggestion Panel */}
      {hasAiSuggestion && (
        <div className={`mb-4 p-3 rounded-xl border ${
          isHighConfidence
            ? 'bg-success/5 border-success/20'
            : 'bg-warning/5 border-warning/20'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm">🤖</span>
              <span className="text-body-sm text-neutral-600 font-medium">AI suggests:</span>
              <span className="text-body-sm font-semibold text-neutral-900">
                {tx.aiCategorySuggestion}
              </span>
              <span className="text-neutral-300">·</span>
              <span className={`text-body-sm font-bold ${
                isHighConfidence ? 'text-success' : 'text-warning'
              }`}>
                {confidencePct}%
              </span>
            </div>
            {tx.aiReasoning && (
              <button
                onClick={onShowReasoning}
                className="p-1 rounded-md hover:bg-black/5 text-neutral-400 hover:text-neutral-700 transition-colors flex-shrink-0 ml-2"
                title="View AI reasoning"
              >
                <Info className="w-4 h-4" />
              </button>
            )}
          </div>
          {/* Confidence bar */}
          <div className="h-1.5 bg-white/60 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                isHighConfidence ? 'bg-success' : 'bg-warning'
              }`}
              style={{ width: `${confidencePct}%` }}
            />
          </div>
        </div>
      )}

      {/* Meta row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`px-2.5 py-1 rounded-full text-[11px] font-medium ${
            isCredit
              ? 'bg-success/10 text-success'
              : 'bg-danger/10 text-danger'
          }`}
        >
          {isCredit ? 'Credit' : 'Debit'}
        </span>
        {tx.source && (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-neutral-100 text-neutral-500 capitalize">
            {tx.source}
          </span>
        )}
        <span className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-warning/10 text-warning">
          Uncategorised
        </span>
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawList = useQuery(
    (api as any).transactions.getUncategorised,
    activeEntityId ? { entityId: activeEntityId, limit: 500 } : 'skip'
  ) as UncategorisedTx[] | undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateTx = useMutation((api as any).transactions.update);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const acceptAiMutation = useMutation((api as any).transactions.acceptAiSuggestion);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recordFeedbackMutation = useMutation((api as any).transactions.recordAiFeedback);

  const [queue, setQueue] = useState<UncategorisedTx[] | null>(null);
  const [total, setTotal] = useState(0);
  const [index, setIndex] = useState(0);
  const [showPicker, setShowPicker] = useState(false);
  const [showReasoning, setShowReasoning] = useState(false);
  const [processing, setProcessing] = useState(false);

  // AI bulk categorise state
  const [showAiConfirm, setShowAiConfirm] = useState(false);
  const [aiConfirmLoading, setAiConfirmLoading] = useState(false);
  const [activeAiJobId, setActiveAiJobId] = useState<Id<'categorisingJobs'> | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const autoCategoriseAction = useAction((api as any).transactionActions.autoCategorise);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cancelJobMutation = useMutation((api as any).categorisingJobs.cancel);

  // Capture queue once on first load
  useEffect(() => {
    if (rawList !== undefined && queue === null) {
      setQueue(rawList);
      setTotal(rawList.length);
    }
  }, [rawList, queue]);

  const currentTx = queue?.[index];
  const isAllDone = queue !== null && index >= queue.length;
  const isLoading = queue === null;

  // Prevent re-renders from re-triggering reasoning sheet
  const processingRef = useRef(false);

  async function handleAcceptAiSuggestion(tx: UncategorisedTx) {
    if (processingRef.current) return;
    processingRef.current = true;
    setProcessing(true);
    try {
      const result = await acceptAiMutation({ id: tx._id });
      setIndex((i) => i + 1);
      toast.success(`Accepted: ${(result as { categoryName: string }).categoryName}`);
    } catch {
      toast.error('Failed to accept AI suggestion');
    } finally {
      setProcessing(false);
      processingRef.current = false;
    }
  }

  async function applyCategory(tx: UncategorisedTx, category: CategoryOption) {
    if (processingRef.current) return;
    processingRef.current = true;
    setProcessing(true);
    const hasAiSuggestion = !!(tx.aiCategorySuggestion);
    try {
      // If overriding AI: record feedback first
      if (hasAiSuggestion && activeEntityId) {
        await recordFeedbackMutation({
          entityId: activeEntityId,
          transactionId: tx._id,
          aiSuggestedCategory: tx.aiCategorySuggestion,
          aiSuggestedType: tx.aiTypeSuggestion as
            | 'income' | 'business_expense' | 'personal_expense' | 'transfer' | 'uncategorised'
            | undefined,
          aiConfidence: tx.aiCategoryConfidence,
          userChosenCategory: category.name,
          userChosenType: category.type as
            | 'income' | 'business_expense' | 'personal_expense' | 'transfer' | 'uncategorised',
          transactionDescription: tx.description,
          transactionAmount: tx.amount,
          transactionDirection: tx.direction ?? 'debit',
        });
      }

      await updateTx({
        id: tx._id,
        categoryId: category._id,
        type: category.type,
        reviewedByUser: true,
        userOverrodeAi: hasAiSuggestion,
      });
      setIndex((i) => i + 1);
      toast.success(`Categorised as "${category.name}"`);
    } catch {
      toast.error('Failed to categorise transaction');
    } finally {
      setProcessing(false);
      processingRef.current = false;
    }
  }

  async function handleMarkPersonal(tx: UncategorisedTx) {
    if (processingRef.current) return;
    processingRef.current = true;
    setProcessing(true);
    const hasAiSuggestion = !!(tx.aiCategorySuggestion);
    try {
      // Record feedback if AI had a suggestion
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
      setIndex((i) => i + 1);
    } catch {
      toast.error('Failed to update transaction');
    } finally {
      setProcessing(false);
      processingRef.current = false;
    }
  }

  function handleSkip() {
    setIndex((i) => i + 1);
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
      // Reset queue so it reloads with updated categorisation state
      setQueue(null);
      setIndex(0);
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
            Review uncategorised transactions for accurate tax calculations
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
      {!isLoading && isAllDone && (
        <AllDoneState onViewTransactions={() => navigate('/app/transactions')} />
      )}

      {/* Triage card */}
      {!isLoading && !isAllDone && currentTx && (
        <div className="space-y-5">
          {/* Progress */}
          <ProgressBar current={index} total={total} />
          <p className="text-body-sm text-neutral-400 text-center">
            {index + 1} of {total}
          </p>

          {/* Transaction card */}
          <TransactionCard
            tx={currentTx}
            onShowReasoning={() => setShowReasoning(true)}
          />

          {/* Action buttons */}
          <div className="space-y-2.5">
            {/* Accept AI suggestion — shown when AI has a suggestion */}
            {currentTx.aiCategorySuggestion && (
              <button
                disabled={processing}
                onClick={() => handleAcceptAiSuggestion(currentTx)}
                className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl bg-primary text-white font-medium text-body hover:bg-primary/90 transition-colors shadow-soft disabled:opacity-60"
              >
                <Check className="w-5 h-5" />
                Accept: {currentTx.aiCategorySuggestion}
              </button>
            )}

            {/* Change / Override category */}
            <button
              disabled={processing}
              onClick={() => setShowPicker(true)}
              className={`w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-medium text-body transition-colors disabled:opacity-60 ${
                currentTx.aiCategorySuggestion
                  ? 'bg-white border border-border text-neutral-700 hover:bg-muted'
                  : 'bg-primary text-white hover:bg-primary/90 shadow-soft'
              }`}
            >
              <Tag className="w-5 h-5" />
              {currentTx.aiCategorySuggestion ? 'Override category' : 'Change category'}
            </button>

            {/* Secondary actions row */}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                disabled={processing}
                onClick={() => handleMarkPersonal(currentTx)}
                className="flex items-center justify-center gap-2 py-3 rounded-xl border border-border bg-white text-neutral-700 font-medium text-body-sm hover:bg-muted hover:border-neutral-300 transition-colors disabled:opacity-60"
              >
                <UserX className="w-4 h-4" />
                Mark as Personal
              </button>

              <button
                disabled={processing}
                onClick={handleSkip}
                className="flex items-center justify-center gap-2 py-3 rounded-xl border border-border bg-white text-neutral-500 font-medium text-body-sm hover:bg-muted hover:border-neutral-300 transition-colors disabled:opacity-60"
              >
                <SkipForward className="w-4 h-4" />
                Skip for now
              </button>
            </div>
          </div>

          {/* Hint */}
          <p className="text-center text-body-sm text-neutral-400">
            Swipe through {total - index} uncategorised transactions
          </p>
        </div>
      )}

      {/* Empty: no uncategorised */}
      {!isLoading && queue !== null && total === 0 && (
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
      {showPicker && currentTx && (
        <CategoryPickerModal
          title={currentTx.aiCategorySuggestion ? 'Override Category' : 'Choose Category'}
          onClose={() => setShowPicker(false)}
          onSelect={async (cat) => {
            setShowPicker(false);
            await applyCategory(currentTx, cat);
          }}
        />
      )}

      {/* AI Reasoning bottom sheet */}
      {showReasoning && currentTx?.aiReasoning && (
        <AiReasoningSheet
          reasoning={currentTx.aiReasoning}
          suggestion={currentTx.aiCategorySuggestion}
          confidence={currentTx.aiCategoryConfidence}
          onClose={() => setShowReasoning(false)}
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
