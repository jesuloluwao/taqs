import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Edit2,
  Save,
  X,
  Trash2,
  User,
  ArrowDownLeft,
  ArrowUpRight,
  Globe,
  AlertCircle,
  Check,
  ChevronDown,
  Info,
} from 'lucide-react';
import { Skeleton } from '../components/Skeleton';
import { SimilarTransactionsModal, type SimilarTransaction } from '../components/SimilarTransactionsModal';

// ── Types ──────────────────────────────────────────────────────────────────
interface TransactionFull {
  _id: Id<'transactions'>;
  entityId: Id<'entities'>;
  userId: Id<'users'>;
  connectedAccountId?: Id<'connectedAccounts'>;
  importJobId?: Id<'importJobs'>;
  date: number;
  description: string;
  amount: number;
  currency: 'NGN' | 'USD' | 'GBP' | 'EUR';
  amountNgn: number;
  fxRate?: number;
  direction: 'credit' | 'debit';
  type: string;
  categoryId?: Id<'categories'>;
  categoryName?: string | null;
  categoryColor?: string | null;
  categoryIcon?: string | null;
  isDeductible?: boolean;
  deductiblePercent?: number;
  whtDeducted?: number;
  whtRate?: number;
  invoiceId?: string;
  notes?: string;
  externalRef?: string;
  taxYear: number;
  reviewedByUser?: boolean;
  // AI categorisation fields
  aiCategorySuggestion?: string;
  aiTypeSuggestion?: string;
  aiCategoryConfidence?: number;
  aiReasoning?: string;
  aiCategorisingJobId?: string;
  userOverrodeAi?: boolean;
  createdAt: number;
  updatedAt: number;
}

interface CategoryRow {
  _id: Id<'categories'>;
  name: string;
  type: string;
  isDeductibleDefault?: boolean;
  color?: string;
  icon?: string;
}

interface EditForm {
  description: string;
  categoryId: string;
  type: string;
  isDeductible: boolean;
  deductiblePercent: string;
  whtDeducted: string; // in Naira (converted to kobo on save)
  notes: string;
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

function formatCurrency(kobo: number, currency: string): string {
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(kobo / 100);
}

function formatDateLong(ts: number): string {
  return new Intl.DateTimeFormat('en-NG', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(ts));
}


const TYPE_LABELS: Record<string, string> = {
  income: 'Income',
  business_expense: 'Business Expense',
  personal_expense: 'Personal Expense',
  transfer: 'Transfer',
  uncategorised: 'Uncategorised',
};

const TYPE_COLORS: Record<string, string> = {
  income: '#38A169',
  business_expense: '#E53E3E',
  personal_expense: '#ED8936',
  transfer: '#718096',
  uncategorised: '#A0AEC0',
};

const TRANSACTION_TYPES = [
  { value: 'income', label: 'Income' },
  { value: 'business_expense', label: 'Business Expense' },
  { value: 'personal_expense', label: 'Personal Expense' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'uncategorised', label: 'Uncategorised' },
];

// ── Field row ──────────────────────────────────────────────────────────────
function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-border last:border-0">
      <span className="text-body-sm text-neutral-500 w-36 flex-shrink-0 pt-0.5">{label}</span>
      <div className="flex-1 text-body-sm text-neutral-900">{children}</div>
    </div>
  );
}

// ── Confirmation dialog ───────────────────────────────────────────────────
function DeleteConfirmDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-medium p-6 w-full max-w-sm animate-slide-up">
        <div className="w-12 h-12 rounded-full bg-danger/10 flex items-center justify-center mb-4 mx-auto">
          <Trash2 className="w-6 h-6 text-danger" />
        </div>
        <h2 className="text-heading-md font-display text-neutral-900 text-center mb-2">
          Delete Transaction
        </h2>
        <p className="text-body-sm text-neutral-500 text-center mb-6">
          This action cannot be undone. The transaction will be permanently deleted.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-lg border border-border text-body-sm text-neutral-700 hover:bg-muted transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 rounded-lg bg-danger text-white text-body-sm font-medium hover:bg-danger/90 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Discard changes dialog ─────────────────────────────────────────────────
function DiscardChangesDialog({
  onDiscard,
  onKeep,
}: {
  onDiscard: () => void;
  onKeep: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onKeep} />
      <div className="relative bg-white rounded-2xl shadow-medium p-6 w-full max-w-sm animate-slide-up">
        <div className="w-12 h-12 rounded-full bg-warning/10 flex items-center justify-center mb-4 mx-auto">
          <AlertCircle className="w-6 h-6 text-warning" />
        </div>
        <h2 className="text-heading-md font-display text-neutral-900 text-center mb-2">
          Discard Changes?
        </h2>
        <p className="text-body-sm text-neutral-500 text-center mb-6">
          You have unsaved changes. Are you sure you want to discard them?
        </p>
        <div className="flex gap-3">
          <button
            onClick={onKeep}
            className="flex-1 px-4 py-2.5 rounded-lg border border-border text-body-sm text-neutral-700 hover:bg-muted transition-colors font-medium"
          >
            Keep Editing
          </button>
          <button
            onClick={onDiscard}
            className="flex-1 px-4 py-2.5 rounded-lg bg-warning text-white text-body-sm font-medium hover:bg-warning/90 transition-colors"
          >
            Discard
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function TransactionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transaction = useQuery(
    (api as any).transactions.get,
    id ? { id: id as Id<'transactions'> } : 'skip'
  ) as TransactionFull | null | undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const categories = useQuery((api as any).categories.listAll) as CategoryRow[] | undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateTx = useMutation((api as any).transactions.update);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const removeTx = useMutation((api as any).transactions.remove);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const acceptAiMutation = useMutation((api as any).transactions.acceptAiSuggestion);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recordFeedbackMutation = useMutation((api as any).transactions.recordAiFeedback);

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [showAiReasoning, setShowAiReasoning] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // Smart batch categorisation state
  const [showSimilarModal, setShowSimilarModal] = useState(false);
  const [similarResults, setSimilarResults] = useState<SimilarTransaction[]>([]);
  const [similarSourceCounterparty, setSimilarSourceCounterparty] = useState<string | null>(null);
  // Tracks the category to apply — set on save, cleared when query returns.
  // Separate from modalCategoryInfo which persists while the modal is open.
  const [lastAppliedCategory, setLastAppliedCategory] = useState<{
    categoryId: Id<'categories'>;
    categoryName: string;
    categoryType: 'income' | 'business_expense' | 'personal_expense' | 'transfer';
  } | null>(null);
  // Persists category info for the modal (survives lastAppliedCategory being cleared)
  const [modalCategoryInfo, setModalCategoryInfo] = useState<{
    categoryId: Id<'categories'>;
    categoryName: string;
    categoryType: 'income' | 'business_expense' | 'personal_expense' | 'transfer';
  } | null>(null);

  const [form, setForm] = useState<EditForm>({
    description: '',
    categoryId: '',
    type: 'uncategorised',
    isDeductible: false,
    deductiblePercent: '',
    whtDeducted: '',
    notes: '',
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const findSimilarResult = useQuery(
    (api as any).transactions.findSimilar,
    transaction && lastAppliedCategory ? { transactionId: transaction._id } : 'skip'
  ) as { matches: SimilarTransaction[]; sourceCounterparty: string | null } | undefined;

  // Initialise form when transaction loads
  useEffect(() => {
    if (transaction) {
      setForm({
        description: transaction.description,
        categoryId: transaction.categoryId ?? '',
        type: transaction.type,
        isDeductible: transaction.isDeductible ?? false,
        deductiblePercent:
          transaction.deductiblePercent != null ? String(transaction.deductiblePercent) : '',
        whtDeducted:
          transaction.whtDeducted != null ? String(transaction.whtDeducted / 100) : '',
        notes: transaction.notes ?? '',
      });
    }
  }, [transaction]);

  useEffect(() => {
    // Guard: don't re-trigger if modal is already showing
    if (showSimilarModal) return;

    if (findSimilarResult && findSimilarResult.matches.length > 0 && lastAppliedCategory) {
      setSimilarResults([...findSimilarResult.matches]);
      setSimilarSourceCounterparty(findSimilarResult.sourceCounterparty);
      setModalCategoryInfo(lastAppliedCategory);
      setShowSimilarModal(true);
      setLastAppliedCategory(null); // Return query to 'skip'
    } else if (findSimilarResult && findSimilarResult.matches.length === 0 && lastAppliedCategory) {
      // No matches — clear the trigger silently
      setLastAppliedCategory(null);
    }
  }, [findSimilarResult, lastAppliedCategory, showSimilarModal]);

  function enterEdit() {
    setIsDirty(false);
    setIsEditing(true);
  }

  function handleCancelEdit() {
    if (isDirty) {
      setShowDiscardDialog(true);
    } else {
      setIsEditing(false);
    }
  }

  function discardChanges() {
    setShowDiscardDialog(false);
    setIsEditing(false);
    setIsDirty(false);
    // Reset form to current transaction values
    if (transaction) {
      setForm({
        description: transaction.description,
        categoryId: transaction.categoryId ?? '',
        type: transaction.type,
        isDeductible: transaction.isDeductible ?? false,
        deductiblePercent:
          transaction.deductiblePercent != null ? String(transaction.deductiblePercent) : '',
        whtDeducted:
          transaction.whtDeducted != null ? String(transaction.whtDeducted / 100) : '',
        notes: transaction.notes ?? '',
      });
    }
  }

  function updateForm<K extends keyof EditForm>(key: K, value: EditForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  }

  // Auto-set isDeductible when category changes
  function handleCategoryChange(catId: string) {
    setForm((prev) => {
      let isDeductible = prev.isDeductible;
      if (catId && categories) {
        const cat = categories.find((c) => c._id === catId);
        if (cat) isDeductible = cat.isDeductibleDefault ?? false;
      }
      return { ...prev, categoryId: catId, isDeductible };
    });
    setIsDirty(true);
  }

  async function handleSave() {
    if (!transaction) return;
    setIsSaving(true);
    try {
      // Check if user is overriding AI: AI was involved and category is changing
      const isOverridingAi =
        !!(transaction.aiCategorisingJobId) &&
        form.categoryId !== (transaction.categoryId ?? '');

      if (isOverridingAi && form.categoryId) {
        const chosenCat = (categories ?? []).find((c) => c._id === form.categoryId);
        if (chosenCat) {
          await recordFeedbackMutation({
            entityId: transaction.entityId,
            transactionId: transaction._id,
            aiSuggestedCategory: transaction.aiCategorySuggestion,
            aiSuggestedType: transaction.aiTypeSuggestion as
              | 'income' | 'business_expense' | 'personal_expense' | 'transfer' | 'uncategorised'
              | undefined,
            aiConfidence: transaction.aiCategoryConfidence,
            userChosenCategory: chosenCat.name,
            userChosenType: chosenCat.type as
              | 'income' | 'business_expense' | 'personal_expense' | 'transfer' | 'uncategorised',
            transactionDescription: transaction.description,
            transactionAmount: transaction.amount,
            transactionDirection: transaction.direction,
          });
        }
      }

      await updateTx({
        id: transaction._id,
        description: form.description.trim() || undefined,
        categoryId: (form.categoryId || undefined) as Id<'categories'> | undefined,
        type: form.type as
          | 'income'
          | 'business_expense'
          | 'personal_expense'
          | 'transfer'
          | 'uncategorised',
        isDeductible: form.isDeductible,
        deductiblePercent: form.deductiblePercent ? Number(form.deductiblePercent) : undefined,
        whtDeducted: form.whtDeducted ? Math.round(Number(form.whtDeducted) * 100) : undefined,
        notes: form.notes.trim() || undefined,
        reviewedByUser: true,
        userOverrodeAi: isOverridingAi || undefined,
      });
      setIsEditing(false);
      setIsDirty(false);
      toast.success('Transaction updated');

      // Trigger smart batch categorisation check
      // Only when category actually changed, and not for AI suggestion acceptance
      if (form.categoryId && form.categoryId !== (transaction.categoryId ?? '')) {
        const chosenCat = (categories ?? []).find((c) => c._id === form.categoryId);
        if (chosenCat) {
          setLastAppliedCategory({
            categoryId: chosenCat._id,
            categoryName: chosenCat.name,
            categoryType: chosenCat.type as 'income' | 'business_expense' | 'personal_expense' | 'transfer',
          });
        }
      }
    } catch {
      toast.error('Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAcceptAiSuggestion() {
    if (!transaction) return;
    try {
      const result = await acceptAiMutation({ id: transaction._id });
      toast.success(`Accepted: ${(result as { categoryName: string }).categoryName}`);
    } catch {
      toast.error('Failed to accept AI suggestion');
    }
  }

  async function handleMarkPersonal() {
    if (!transaction) return;
    try {
      // Record feedback if AI had a suggestion
      if (transaction.aiCategorisingJobId && transaction.aiCategorySuggestion) {
        await recordFeedbackMutation({
          entityId: transaction.entityId,
          transactionId: transaction._id,
          aiSuggestedCategory: transaction.aiCategorySuggestion,
          aiSuggestedType: transaction.aiTypeSuggestion as
            | 'income' | 'business_expense' | 'personal_expense' | 'transfer' | 'uncategorised'
            | undefined,
          aiConfidence: transaction.aiCategoryConfidence,
          userChosenCategory: 'Personal Expense',
          userChosenType: 'personal_expense',
          transactionDescription: transaction.description,
          transactionAmount: transaction.amount,
          transactionDirection: transaction.direction,
        });
      }

      await updateTx({
        id: transaction._id,
        type: 'personal_expense',
        isDeductible: false,
        reviewedByUser: true,
        userOverrodeAi: !!(transaction.aiCategorisingJobId) || undefined,
      });
      toast.success('Marked as personal expense');
    } catch {
      toast.error('Failed to update transaction');
    }
  }

  async function handleDelete() {
    if (!transaction) return;
    try {
      await removeTx({ id: transaction._id });
      toast.success('Transaction deleted');
      navigate('/app/transactions');
    } catch {
      toast.error('Failed to delete transaction');
    }
    setShowDeleteDialog(false);
  }

  // ── Loading / error states ───────────────────────────────────────────────
  if (transaction === undefined) {
    return (
      <div className="max-w-2xl mx-auto animate-fade-in">
        <div className="flex items-center gap-3 mb-6">
          <Skeleton className="w-8 h-8 rounded-lg" />
          <Skeleton className="h-6 w-40" />
        </div>
        <div className="bg-white rounded-xl border border-border shadow-soft p-5 mb-4 space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-40" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (transaction === null) {
    return (
      <div className="max-w-2xl mx-auto animate-fade-in">
        <button
          onClick={() => navigate('/app/transactions')}
          className="inline-flex items-center gap-2 text-body-sm text-neutral-500 hover:text-neutral-900 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Transactions
        </button>
        <div className="bg-white rounded-xl border border-border shadow-soft p-8 text-center">
          <AlertCircle className="w-8 h-8 text-neutral-400 mx-auto mb-3" />
          <p className="text-heading-md text-neutral-900 mb-1">Transaction not found</p>
          <p className="text-body-sm text-neutral-500">
            This transaction may have been deleted or you don't have access to it.
          </p>
        </div>
      </div>
    );
  }

  const isCredit = transaction.direction === 'credit';
  const isForeign = transaction.currency !== 'NGN';
  const typeColor = TYPE_COLORS[transaction.type] ?? '#A0AEC0';
  const catColor = transaction.categoryColor ?? typeColor;

  return (
    <div className="max-w-2xl mx-auto animate-fade-in pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={() => navigate('/app/transactions')}
          className="inline-flex items-center gap-2 text-body-sm text-neutral-500 hover:text-neutral-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="flex items-center gap-2">
          {!isEditing ? (
            <>
              <button
                onClick={enterEdit}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-body-sm text-neutral-600 hover:text-neutral-900 hover:bg-muted transition-colors"
              >
                <Edit2 className="w-3.5 h-3.5" />
                Edit
              </button>
              <button
                onClick={() => setShowDeleteDialog(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-body-sm text-danger hover:bg-red-50 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleCancelEdit}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-body-sm text-neutral-600 hover:text-neutral-900 hover:bg-muted transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary text-white text-body-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {isSaving ? (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                Save
              </button>
            </>
          )}
        </div>
      </div>

      {/* Hero summary card */}
      <div className="bg-white rounded-xl border border-border shadow-soft p-5 mb-4">
        <div className="flex items-start gap-4">
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
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
            {isEditing ? (
              <input
                type="text"
                value={form.description}
                onChange={(e) => updateForm('description', e.target.value)}
                className="w-full text-heading-md font-display text-neutral-900 bg-transparent border-b-2 border-primary focus:outline-none pb-0.5 mb-1"
                placeholder="Description"
              />
            ) : (
              <p className="text-heading-md font-display text-neutral-900 mb-1 leading-tight">
                {transaction.description}
              </p>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-label text-neutral-500">{formatDateLong(transaction.date)}</span>
              {transaction.categoryName && (
                <>
                  <span className="text-neutral-300">·</span>
                  <span
                    className="inline-flex items-center gap-1 text-label font-medium"
                    style={{ color: catColor }}
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: catColor }}
                    />
                    {transaction.categoryName}
                  </span>
                </>
              )}
              {isForeign && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-accent/10 text-accent text-[10px] font-medium">
                  <Globe className="w-2.5 h-2.5" />
                  {transaction.currency}
                </span>
              )}
            </div>
          </div>

          <div className="text-right flex-shrink-0">
            <p
              className={`text-heading-xl font-semibold ${isCredit ? 'text-success' : 'text-neutral-900'}`}
            >
              {isCredit ? '+' : '-'}
              {formatNaira(transaction.amountNgn)}
            </p>
            {isForeign && (
              <p className="text-body-sm text-neutral-400 mt-0.5">
                {formatCurrency(transaction.amount, transaction.currency)}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Details section */}
      <div className="bg-white rounded-xl border border-border shadow-soft p-5 mb-4">
        <h2 className="text-label font-medium text-neutral-500 uppercase tracking-wider mb-1">
          Transaction Details
        </h2>

        <FieldRow label="Date">{formatDateLong(transaction.date)}</FieldRow>

        <FieldRow label="Amount">
          <span className={isCredit ? 'text-success font-medium' : 'text-neutral-900 font-medium'}>
            {isCredit ? '+' : '-'}
            {formatNaira(transaction.amountNgn)}
          </span>
          {isForeign && (
            <span className="ml-2 text-neutral-400">
              ({formatCurrency(transaction.amount, transaction.currency)})
            </span>
          )}
        </FieldRow>

        {isForeign && transaction.fxRate && (
          <FieldRow label="FX Rate">
            1 {transaction.currency} = {formatNaira(transaction.fxRate)}
          </FieldRow>
        )}

        <FieldRow label="Currency">{transaction.currency}</FieldRow>

        <FieldRow label="Direction">
          <span
            className={`inline-flex items-center gap-1 font-medium ${isCredit ? 'text-success' : 'text-neutral-700'}`}
          >
            {isCredit ? (
              <ArrowDownLeft className="w-3.5 h-3.5" />
            ) : (
              <ArrowUpRight className="w-3.5 h-3.5" />
            )}
            {isCredit ? 'Credit (incoming)' : 'Debit (outgoing)'}
          </span>
        </FieldRow>

        <FieldRow label="Type">
          {isEditing ? (
            <div className="relative">
              <select
                value={form.type}
                onChange={(e) => updateForm('type', e.target.value)}
                className="w-full appearance-none pl-3 pr-8 py-1.5 rounded-lg border border-border text-body-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
              >
                {TRANSACTION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400 pointer-events-none" />
            </div>
          ) : (
            <span
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-label font-medium text-white"
              style={{ backgroundColor: TYPE_COLORS[transaction.type] ?? '#A0AEC0' }}
            >
              {TYPE_LABELS[transaction.type] ?? transaction.type}
            </span>
          )}
        </FieldRow>

        <FieldRow label="Category">
          {isEditing ? (
            <div className="relative">
              <select
                value={form.categoryId}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className="w-full appearance-none pl-3 pr-8 py-1.5 rounded-lg border border-border text-body-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
              >
                <option value="">— No category —</option>
                {(categories ?? []).map((cat) => (
                  <option key={cat._id} value={cat._id}>
                    {cat.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400 pointer-events-none" />
            </div>
          ) : transaction.categoryName ? (
            <span className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: catColor }}
              />
              {transaction.categoryName}
            </span>
          ) : (
            <span className="text-warning font-medium">Uncategorised</span>
          )}
        </FieldRow>

        {transaction.connectedAccountId && (
          <FieldRow label="Source account">Connected bank account</FieldRow>
        )}

        {!transaction.connectedAccountId && transaction.importJobId && (
          <FieldRow label="Source">Imported from statement</FieldRow>
        )}

        {!transaction.connectedAccountId && !transaction.importJobId && (
          <FieldRow label="Source">Manual entry</FieldRow>
        )}

        {transaction.invoiceId && (
          <FieldRow label="Invoice">
            <span className="text-primary font-medium">#{transaction.invoiceId}</span>
          </FieldRow>
        )}

        <FieldRow label="Tax year">{transaction.taxYear}</FieldRow>
      </div>

      {/* AI Categorisation section — shown when AI was involved */}
      {transaction.aiCategorisingJobId && (
        <div className="bg-white rounded-xl border border-border shadow-soft p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-label font-medium text-neutral-500 uppercase tracking-wider">
              AI Categorisation
            </h2>
            {transaction.aiReasoning && (
              <button
                onClick={() => setShowAiReasoning(true)}
                className="inline-flex items-center gap-1.5 text-body-sm text-neutral-400 hover:text-neutral-700 transition-colors"
              >
                <Info className="w-3.5 h-3.5" />
                View reasoning
              </button>
            )}
          </div>

          {/* AI suggestion + confidence bar */}
          {transaction.aiCategorySuggestion && transaction.aiCategoryConfidence !== undefined && (
            <div className="mb-3">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <span className="text-sm">🤖</span>
                <span className="text-body-sm text-neutral-600">Suggested:</span>
                <span className="text-body-sm font-semibold text-neutral-900">
                  {transaction.aiCategorySuggestion}
                </span>
                <span className={`ml-auto text-body-sm font-bold ${
                  transaction.aiCategoryConfidence >= 0.9 ? 'text-success' : 'text-warning'
                }`}>
                  {Math.round(transaction.aiCategoryConfidence * 100)}% confident
                </span>
              </div>
              <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    transaction.aiCategoryConfidence >= 0.9 ? 'bg-success' : 'bg-warning'
                  }`}
                  style={{ width: `${Math.round(transaction.aiCategoryConfidence * 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Review status */}
          {transaction.reviewedByUser ? (
            <div className="flex items-center gap-1.5 text-body-sm text-success">
              <Check className="w-3.5 h-3.5" />
              {transaction.userOverrodeAi ? 'You overrode the AI suggestion' : 'AI suggestion accepted'}
            </div>
          ) : !isEditing ? (
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleAcceptAiSuggestion}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-body-sm font-medium hover:bg-primary/90 transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
                Accept suggestion
              </button>
            </div>
          ) : null}
        </div>
      )}

      {/* Tax info section */}
      <div className="bg-white rounded-xl border border-border shadow-soft p-5 mb-4">
        <h2 className="text-label font-medium text-neutral-500 uppercase tracking-wider mb-1">
          Tax Information
        </h2>

        <FieldRow label="Deductible">
          {isEditing ? (
            <button
              type="button"
              onClick={() => updateForm('isDeductible', !form.isDeductible)}
              className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-body-sm font-medium transition-colors ${
                form.isDeductible
                  ? 'bg-success/10 text-success hover:bg-success/20'
                  : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
              }`}
            >
              {form.isDeductible ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <X className="w-3.5 h-3.5" />
              )}
              {form.isDeductible ? 'Yes' : 'No'}
            </button>
          ) : (
            <span
              className={`inline-flex items-center gap-1.5 font-medium ${
                transaction.isDeductible ? 'text-success' : 'text-neutral-500'
              }`}
            >
              {transaction.isDeductible ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <X className="w-3.5 h-3.5" />
              )}
              {transaction.isDeductible ? 'Yes' : 'No'}
            </span>
          )}
        </FieldRow>

        <FieldRow label="Deductible %">
          {isEditing ? (
            <input
              type="number"
              min="0"
              max="100"
              value={form.deductiblePercent}
              onChange={(e) => updateForm('deductiblePercent', e.target.value)}
              placeholder="0 – 100"
              className="w-24 px-3 py-1.5 rounded-lg border border-border text-body-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          ) : transaction.deductiblePercent != null ? (
            `${transaction.deductiblePercent}%`
          ) : (
            <span className="text-neutral-400">—</span>
          )}
        </FieldRow>

        <FieldRow label="WHT Deducted">
          {isEditing ? (
            <div className="flex items-center gap-1.5">
              <span className="text-neutral-500">₦</span>
              <input
                type="number"
                min="0"
                value={form.whtDeducted}
                onChange={(e) => updateForm('whtDeducted', e.target.value)}
                placeholder="0.00"
                className="w-32 px-3 py-1.5 rounded-lg border border-border text-body-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          ) : transaction.whtDeducted != null ? (
            formatNaira(transaction.whtDeducted)
          ) : (
            <span className="text-neutral-400">—</span>
          )}
        </FieldRow>

        <FieldRow label="WHT Rate">
          {transaction.whtRate != null ? (
            `${transaction.whtRate}%`
          ) : (
            <span className="text-neutral-400">—</span>
          )}
        </FieldRow>
      </div>

      {/* Notes section */}
      <div className="bg-white rounded-xl border border-border shadow-soft p-5 mb-4">
        <h2 className="text-label font-medium text-neutral-500 uppercase tracking-wider mb-2">
          Notes
        </h2>
        {isEditing ? (
          <textarea
            value={form.notes}
            onChange={(e) => updateForm('notes', e.target.value)}
            rows={3}
            placeholder="Add a note…"
            className="w-full px-3 py-2 rounded-lg border border-border text-body-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
          />
        ) : transaction.notes ? (
          <p className="text-body-sm text-neutral-700 whitespace-pre-line">{transaction.notes}</p>
        ) : (
          <p className="text-body-sm text-neutral-400 italic">No notes</p>
        )}
      </div>

      {/* Quick actions */}
      {!isEditing && (
        <div className="flex gap-3">
          {transaction.type !== 'personal_expense' && (
            <button
              onClick={handleMarkPersonal}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-border text-body-sm text-neutral-600 hover:text-neutral-900 hover:bg-muted transition-colors"
            >
              <User className="w-4 h-4" />
              Mark as Personal
            </button>
          )}
          <button
            onClick={() => setShowDeleteDialog(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-red-200 text-body-sm text-danger hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Delete Transaction
          </button>
        </div>
      )}

      {/* Dialogs */}
      {showDeleteDialog && (
        <DeleteConfirmDialog
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteDialog(false)}
        />
      )}
      {showDiscardDialog && (
        <DiscardChangesDialog onDiscard={discardChanges} onKeep={() => setShowDiscardDialog(false)} />
      )}

      {showSimilarModal && modalCategoryInfo && similarResults.length > 0 && transaction && (
        <SimilarTransactionsModal
          similarTransactions={similarResults}
          categoryName={modalCategoryInfo.categoryName}
          categoryId={modalCategoryInfo.categoryId}
          categoryType={modalCategoryInfo.categoryType}
          sourceTransactionId={transaction._id}
          counterpartyName={similarSourceCounterparty}
          onClose={() => {
            setShowSimilarModal(false);
            setSimilarResults([]);
            setModalCategoryInfo(null);
          }}
          onApplied={(count) => {
            setShowSimilarModal(false);
            setSimilarResults([]);
            setModalCategoryInfo(null);
            toast.success(`Applied to ${count} transaction${count !== 1 ? 's' : ''}`);
          }}
        />
      )}

      {/* AI Reasoning bottom sheet */}
      {showAiReasoning && transaction.aiReasoning && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowAiReasoning(false)}
          />
          <div className="relative w-full max-w-2xl bg-white rounded-t-2xl shadow-medium p-6 pb-10 animate-slide-up">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-lg">🤖</span>
                <h3 className="text-heading-sm font-display text-neutral-900">AI Reasoning</h3>
              </div>
              <button
                onClick={() => setShowAiReasoning(false)}
                className="p-1.5 rounded-lg hover:bg-muted text-neutral-400 hover:text-neutral-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {transaction.aiCategorySuggestion && transaction.aiCategoryConfidence !== undefined && (
              <div className="flex items-center gap-2 mb-3 p-2.5 bg-neutral-50 rounded-lg">
                <span className="text-body-sm text-neutral-600">Suggested:</span>
                <span className="text-body-sm font-semibold text-neutral-900">
                  {transaction.aiCategorySuggestion}
                </span>
                <span className={`ml-auto text-body-sm font-bold ${
                  transaction.aiCategoryConfidence >= 0.9 ? 'text-success' : 'text-warning'
                }`}>
                  {Math.round(transaction.aiCategoryConfidence * 100)}%
                </span>
              </div>
            )}
            <p className="text-body-sm text-neutral-700 leading-relaxed">
              {transaction.aiReasoning}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
