import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useAction } from 'convex/react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { useEntity } from '../contexts/EntityContext';
import { Skeleton } from '../components/Skeleton';
import { ManualTransactionModal } from '../components/ManualTransactionModal';
import { CategoryPickerModal } from '../components/CategoryPickerModal';
import type { CategoryOption } from '../components/CategoryPickerModal';
import { toast } from 'sonner';
import {
  Upload,
  Search,
  X,
  ChevronDown,
  ArrowUpDown,
  ArrowLeftRight,
  ArrowUpRight,
  ArrowDownLeft,
  Globe,
  SlidersHorizontal,
  Check,
  Plus,
  CheckSquare,
  Square,
  Tag,
  Trash2,
  ListChecks,
  Sparkles,
  XCircle,
  Building2,
} from 'lucide-react';
import { BankAccountSelector } from '../components/BankAccountSelector';

// ── Transaction type (matches convex/transactions.ts list result) ──────────
interface TransactionRow {
  _id: Id<'transactions'>;
  entityId: Id<'entities'>;
  userId: Id<'users'>;
  date: number;
  description: string;
  amount: number;
  currency: 'NGN' | 'USD' | 'GBP' | 'EUR';
  amountNgn: number;
  fxRate?: number;
  direction?: 'credit' | 'debit';
  type?: string;
  categoryId?: Id<'categories'>;
  categoryName?: string | null;
  categoryColor?: string | null;
  categoryIcon?: string | null;
  isDeductible?: boolean;
  deductiblePercent?: number;
  whtDeducted?: number;
  notes?: string;
  taxYear: number;
  reviewedByUser?: boolean;
  bankAccountId?: Id<'bankAccounts'>;
  importJobId?: Id<'importJobs'>;
  // AI categorisation fields
  aiCategorySuggestion?: string;
  aiCategoryConfidence?: number;
  aiCategorisingJobId?: string;
  userOverrodeAi?: boolean;
  createdAt: number;
  updatedAt: number;
}

// ── Types ──────────────────────────────────────────────────────────────────
type FilterChip =
  | 'all'
  | 'income'
  | 'expenses'
  | 'uncategorised'
  | 'this-month'
  | 'this-quarter'
  | 'custom';

type SortBy = 'date' | 'amount' | 'category';
type SortOrder = 'asc' | 'desc';

// ── Helpers ────────────────────────────────────────────────────────────────
function formatNaira(kobo: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(kobo / 100);
}

function formatCurrency(minorUnits: number, currency: string): string {
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(minorUnits / 100);
}

function formatDate(ts: number): string {
  return new Intl.DateTimeFormat('en-NG', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(ts));
}

function getMonthKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthLabel(key: string): string {
  const [year, month] = key.split('-');
  return new Intl.DateTimeFormat('en-NG', { month: 'long', year: 'numeric' }).format(
    new Date(Number(year), Number(month) - 1, 1)
  );
}

function getThisMonthRange(): { start: number; end: number } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
  return { start, end };
}

function getThisQuarterRange(): { start: number; end: number } {
  const now = new Date();
  const quarter = Math.floor(now.getMonth() / 3);
  const startMonth = quarter * 3;
  const start = new Date(now.getFullYear(), startMonth, 1).getTime();
  const end = new Date(now.getFullYear(), startMonth + 3, 0, 23, 59, 59, 999).getTime();
  return { start, end };
}

const TYPE_COLORS: Record<string, string> = {
  income: '#38A169',
  business_expense: '#E53E3E',
  personal_expense: '#ED8936',
  transfer: '#718096',
  uncategorised: '#A0AEC0',
};

function CategoryDot({ color, type }: { color?: string | null; type: string }) {
  const bg = color ?? TYPE_COLORS[type] ?? '#A0AEC0';
  return (
    <span
      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
      style={{ backgroundColor: bg }}
    />
  );
}

// ── Debounce hook ──────────────────────────────────────────────────────────
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// ── Skeleton row ───────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <Skeleton className="w-9 h-9 rounded-lg flex-shrink-0" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <Skeleton className="h-3.5 w-48" />
        <Skeleton className="h-3 w-24" />
      </div>
      <Skeleton className="h-4 w-20 ml-auto" />
    </div>
  );
}

// ── Reusable click-outside hook ──────────────────────────────────────────
function useClickOutside(ref: React.RefObject<HTMLElement | null>, handler: () => void) {
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        handler();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [ref, handler]);
}

// ── Sort dropdown ──────────────────────────────────────────────────────────
function SortDropdown({
  sortBy,
  sortOrder,
  onChange,
}: {
  sortBy: SortBy;
  sortOrder: SortOrder;
  onChange: (by: SortBy, order: SortOrder) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));

  const options: { by: SortBy; order: SortOrder; label: string }[] = [
    { by: 'date', order: 'desc', label: 'Date (newest first)' },
    { by: 'date', order: 'asc', label: 'Date (oldest first)' },
    { by: 'amount', order: 'desc', label: 'Amount (highest first)' },
    { by: 'amount', order: 'asc', label: 'Amount (lowest first)' },
    { by: 'category', order: 'asc', label: 'Category (A–Z)' },
    { by: 'category', order: 'desc', label: 'Category (Z–A)' },
  ];

  const currentLabel =
    options.find((o) => o.by === sortBy && o.order === sortOrder)?.label ?? 'Sort';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((p) => !p)}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-body-sm text-neutral-500 hover:text-neutral-900 hover:bg-muted transition-colors flex-shrink-0"
      >
        <ArrowUpDown className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">{currentLabel}</span>
        <span className="sm:hidden">Sort</span>
        <ChevronDown
          className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-border rounded-xl shadow-medium py-1 w-52 animate-slide-up">
          {options.map((opt) => {
            const active = opt.by === sortBy && opt.order === sortOrder;
            return (
              <button
                key={`${opt.by}-${opt.order}`}
                onClick={() => {
                  onChange(opt.by, opt.order);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-body-sm flex items-center justify-between transition-colors ${
                  active
                    ? 'text-primary bg-primary-light'
                    : 'text-neutral-900 hover:bg-muted'
                }`}
              >
                {opt.label}
                {active && <Check className="w-3.5 h-3.5 text-primary" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Direction filter dropdown ───────────────────────────────────────────────
function DirectionDropdown({
  value,
  onChange,
}: {
  value: 'credit' | 'debit' | null;
  onChange: (v: 'credit' | 'debit' | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));

  const options: { value: 'credit' | 'debit' | null; label: string }[] = [
    { value: null, label: 'All Directions' },
    { value: 'credit', label: 'Credit (Inflow)' },
    { value: 'debit', label: 'Debit (Outflow)' },
  ];

  const currentLabel = options.find((o) => o.value === value)?.label ?? 'Direction';
  const isFiltered = value !== null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((p) => !p)}
        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-body-sm transition-colors flex-shrink-0 ${
          isFiltered
            ? 'border-primary/40 bg-primary-light text-primary'
            : 'border-border text-neutral-500 hover:text-neutral-900 hover:bg-muted'
        }`}
      >
        <ArrowLeftRight className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">{currentLabel}</span>
        <span className="sm:hidden">{value ? (value === 'credit' ? 'In' : 'Out') : 'Dir'}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-border rounded-xl shadow-medium py-1 w-48 animate-slide-up">
          {options.map((opt) => {
            const active = opt.value === value;
            return (
              <button
                key={opt.value ?? 'all'}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-body-sm flex items-center justify-between transition-colors ${
                  active
                    ? 'text-primary bg-primary-light'
                    : 'text-neutral-900 hover:bg-muted'
                }`}
              >
                {opt.label}
                {active && <Check className="w-3.5 h-3.5 text-primary" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Category filter dropdown ────────────────────────────────────────────────
interface CategoryFilterOption {
  _id: string;
  name: string;
  type: string;
}

function CategoryFilterDropdown({
  value,
  onChange,
  categories,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  categories: CategoryFilterOption[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  useClickOutside(ref, () => { setOpen(false); setSearch(''); });

  useEffect(() => {
    if (open && searchRef.current) {
      searchRef.current.focus();
    }
  }, [open]);

  const filtered = search
    ? categories.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    : categories;

  const grouped = useMemo(() => {
    const groups: Record<string, CategoryFilterOption[]> = {};
    for (const c of filtered) {
      const label =
        c.type === 'income' ? 'Income' :
        c.type === 'business_expense' ? 'Business Expenses' :
        c.type === 'personal_expense' ? 'Personal Expenses' :
        'Transfers';
      if (!groups[label]) groups[label] = [];
      groups[label].push(c);
    }
    return groups;
  }, [filtered]);

  const selectedName = value ? categories.find((c) => c._id === value)?.name : null;
  const isFiltered = value !== null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((p) => !p)}
        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-body-sm transition-colors flex-shrink-0 max-w-[180px] ${
          isFiltered
            ? 'border-primary/40 bg-primary-light text-primary'
            : 'border-border text-neutral-500 hover:text-neutral-900 hover:bg-muted'
        }`}
      >
        <Tag className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="truncate hidden sm:inline">{selectedName ?? 'Category'}</span>
        <span className="sm:hidden">Cat</span>
        {isFiltered && (
          <button
            onClick={(e) => { e.stopPropagation(); onChange(null); }}
            className="ml-0.5 p-0.5 rounded hover:bg-primary/20 transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        )}
        {!isFiltered && (
          <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-border rounded-xl shadow-medium w-64 animate-slide-up">
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400 pointer-events-none" />
              <input
                ref={searchRef}
                type="text"
                placeholder="Search categories…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-body-sm rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            <button
              onClick={() => { onChange(null); setOpen(false); setSearch(''); }}
              className={`w-full text-left px-3 py-2 text-body-sm flex items-center justify-between transition-colors ${
                !value ? 'text-primary bg-primary-light' : 'text-neutral-900 hover:bg-muted'
              }`}
            >
              All Categories
              {!value && <Check className="w-3.5 h-3.5 text-primary" />}
            </button>
            {Object.entries(grouped).map(([groupLabel, cats]) => (
              <div key={groupLabel}>
                <div className="px-3 pt-2 pb-1">
                  <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
                    {groupLabel}
                  </span>
                </div>
                {cats.map((cat) => {
                  const active = cat._id === value;
                  return (
                    <button
                      key={cat._id}
                      onClick={() => { onChange(cat._id); setOpen(false); setSearch(''); }}
                      className={`w-full text-left px-3 py-1.5 text-body-sm flex items-center justify-between transition-colors ${
                        active
                          ? 'text-primary bg-primary-light'
                          : 'text-neutral-900 hover:bg-muted'
                      }`}
                    >
                      <span className="truncate">{cat.name}</span>
                      {active && <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="px-3 py-4 text-body-sm text-neutral-400 text-center">No categories match</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Custom date range picker ───────────────────────────────────────────────
function CustomRangePicker({
  value,
  onChange,
  onClose,
}: {
  value: { start: string; end: string };
  onChange: (v: { start: string; end: string }) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 mt-2 z-30 bg-white border border-border rounded-xl shadow-medium p-4 w-72 animate-slide-up"
    >
      <p className="text-label text-neutral-500 mb-3 uppercase tracking-wider">Custom Range</p>
      <div className="space-y-3">
        <div>
          <label className="text-label text-neutral-500 mb-1 block">From</label>
          <input
            type="date"
            value={value.start}
            onChange={(e) => onChange({ ...value, start: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-border text-body-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div>
          <label className="text-label text-neutral-500 mb-1 block">To</label>
          <input
            type="date"
            value={value.end}
            onChange={(e) => onChange({ ...value, end: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-border text-body-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <button
          onClick={onClose}
          className="w-full px-3 py-2 bg-primary text-white rounded-lg text-body-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Apply
        </button>
      </div>
    </div>
  );
}

// ── Delete confirmation dialog ─────────────────────────────────────────────
function DeleteConfirmDialog({
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
          <div className="w-10 h-10 rounded-full bg-danger/10 flex items-center justify-center flex-shrink-0">
            <Trash2 className="w-5 h-5 text-danger" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-neutral-900">Delete {count} transaction{count !== 1 ? 's' : ''}?</h3>
            <p className="text-xs text-neutral-500 mt-0.5">This action cannot be undone</p>
          </div>
        </div>
        <p className="text-body-sm text-neutral-500 mb-5">
          The selected transaction{count !== 1 ? 's' : ''} will be permanently deleted from your records.
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
            className="flex-1 px-4 py-2.5 text-body-sm font-medium text-white bg-danger rounded-lg hover:bg-danger/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                Delete
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── AI categorise confirm dialog ────────────────────────────────────────────
function AiCategoriseConfirmDialog({
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
            <h3 className="text-base font-semibold text-neutral-900">Categorise with AI</h3>
            <p className="text-xs text-neutral-500 mt-0.5">Powered by Claude Haiku</p>
          </div>
        </div>
        <p className="text-body-sm text-neutral-600 mb-5">
          TaxEase AI will attempt to categorise{' '}
          <span className="font-semibold text-neutral-900">{count} uncategorised transaction{count !== 1 ? 's' : ''}</span>
          . High-confidence results will be applied automatically; low-confidence items will remain for manual review.
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

// ── AI categorise progress overlay ─────────────────────────────────────────
interface CategorisingJobData {
  status: string;
  totalTransactions: number;
  batchesTotal?: number;
  batchesCompleted?: number;
  totalCategorised?: number;
  totalLowConfidence?: number;
}

function AiProgressOverlay({
  jobId,
  onCancel,
  onComplete,
}: {
  jobId: Id<'categorisingJobs'>;
  onCancel: () => void;
  onComplete: (categorised: number, lowConfidence: number, total: number) => void;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const job = useQuery((api as any).categorisingJobs.get, { id: jobId }) as CategorisingJobData | null | undefined;

  const notifiedRef = useRef(false);

  useEffect(() => {
    if (!job || notifiedRef.current) return;
    if (job.status === 'complete' || job.status === 'failed') {
      notifiedRef.current = true;
      onComplete(
        job.totalCategorised ?? 0,
        job.totalLowConfidence ?? 0,
        job.totalTransactions
      );
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

        {/* Progress bar */}
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
          This may take a moment.
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
export default function Transactions() {
  const { activeEntityId } = useEntity();
  const navigate = useNavigate();

  const [activeFilter, setActiveFilter] = useState<FilterChip>('all');
  const [searchInput, setSearchInput] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [directionFilter, setDirectionFilter] = useState<'credit' | 'debit' | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [limit, setLimit] = useState(25);
  const [showCustomRange, setShowCustomRange] = useState(false);
  const [customRange, setCustomRange] = useState({ start: '', end: '' });
  const [showManualModal, setShowManualModal] = useState(false);

  // Bulk select state
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkPicker, setShowBulkPicker] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [bulkProcessing, setBulkProcessing] = useState(false);

  // Bank account assignment state
  const [showBulkBankPicker, setShowBulkBankPicker] = useState(false);
  const [singleBankAssignTxId, setSingleBankAssignTxId] = useState<Id<'transactions'> | null>(null);
  const [siblingPrompt, setSiblingPrompt] = useState<{
    siblingCount: number;
    importJobId: Id<'importJobs'>;
    bankAccountId: Id<'bankAccounts'>;
    accountNickname: string;
  } | null>(null);

  // AI categorise state
  const [showAiConfirm, setShowAiConfirm] = useState(false);
  const [aiConfirmLoading, setAiConfirmLoading] = useState(false);
  const [activeAiJobId, setActiveAiJobId] = useState<Id<'categorisingJobs'> | null>(null);

  const debouncedSearch = useDebounce(searchInput, 350);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allCategories = useQuery((api as any).categories.listAll) as CategoryFilterOption[] | undefined;
  const categoryOptions = useMemo(() => allCategories ?? [], [allCategories]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bulkCategoriseMutation = useMutation((api as any).transactions.bulkCategorise);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bulkDeleteMutation = useMutation((api as any).transactions.bulkDelete);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const autoCategoriseAction = useAction((api as any).transactionActions.autoCategorise);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cancelJobMutation = useMutation((api as any).categorisingJobs.cancel);

  // Bank account queries & mutations
  const bankAccounts = useQuery(
    api.bankAccounts.listByEntity,
    activeEntityId ? { entityId: activeEntityId } : 'skip'
  ) as Array<{ _id: Id<'bankAccounts'>; nickname: string; bankName: string; accountNumber?: string }> | undefined;

  const bankAccountMap = useMemo(() => {
    const map = new Map<string, { nickname: string; bankName: string }>();
    for (const acct of bankAccounts ?? []) {
      map.set(acct._id, { nickname: acct.nickname, bankName: acct.bankName });
    }
    return map;
  }, [bankAccounts]);

  const assignToTransactionMutation = useMutation(api.bankAccounts.assignToTransaction);
  const assignToImportJobMutation = useMutation(api.bankAccounts.assignToImportJob);

  // Derive query params from active filter + dropdown filters
  const queryParams = useMemo(() => {
    const base: Record<string, unknown> = {
      sortBy,
      sortOrder,
      limit,
      offset: 0,
      search: debouncedSearch || undefined,
    };

    // Direction: dropdown filter takes precedence, then chip filter
    if (directionFilter) {
      base.direction = directionFilter;
    } else if (activeFilter === 'income') {
      base.direction = 'credit';
    } else if (activeFilter === 'expenses') {
      base.direction = 'debit';
    }

    // Type filter from chip
    if (activeFilter === 'uncategorised') {
      base.type = 'uncategorised';
    }

    // Category filter from dropdown
    if (categoryFilter) {
      base.categoryId = categoryFilter;
    }

    // Date range from chips
    if (activeFilter === 'this-month') {
      const { start, end } = getThisMonthRange();
      base.startDate = start;
      base.endDate = end;
    } else if (activeFilter === 'this-quarter') {
      const { start, end } = getThisQuarterRange();
      base.startDate = start;
      base.endDate = end;
    } else if (activeFilter === 'custom' && customRange.start && customRange.end) {
      base.startDate = new Date(customRange.start).getTime();
      base.endDate = new Date(customRange.end + 'T23:59:59').getTime();
    }

    return base;
  }, [activeFilter, sortBy, sortOrder, limit, debouncedSearch, customRange, directionFilter, categoryFilter]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = useQuery(
    (api as any).transactions.list,
    activeEntityId ? { entityId: activeEntityId, ...queryParams } : 'skip'
  ) as { transactions: TransactionRow[]; totalCount: number; hasMore: boolean } | undefined;

  const isLoading = result === undefined;
  const transactions: TransactionRow[] = result?.transactions ?? [];
  const hasMore = result?.hasMore ?? false;
  const totalCount = result?.totalCount ?? 0;

  // Reset limit when filters change
  const prevFilterKey = useRef('');
  useEffect(() => {
    const key = `${activeFilter}|${sortBy}|${sortOrder}|${debouncedSearch}|${customRange.start}|${customRange.end}|${directionFilter}|${categoryFilter}`;
    if (prevFilterKey.current !== key) {
      setLimit(25);
      prevFilterKey.current = key;
    }
  }, [activeFilter, sortBy, sortOrder, debouncedSearch, customRange, directionFilter, categoryFilter]);

  // Exit bulk mode and clear selection when filter/search changes
  useEffect(() => {
    if (bulkMode) {
      setBulkMode(false);
      setSelectedIds(new Set());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilter, debouncedSearch]);

  // Group by month
  const grouped = useMemo(() => {
    const map = new Map<string, TransactionRow[]>();
    for (const t of transactions) {
      const key = getMonthKey(t.date);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a));
  }, [transactions]);

  const filterChips: { id: FilterChip; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'income', label: 'Income' },
    { id: 'expenses', label: 'Expenses' },
    { id: 'uncategorised', label: 'Uncategorised' },
    { id: 'this-month', label: 'This Month' },
    { id: 'this-quarter', label: 'This Quarter' },
    { id: 'custom', label: 'Custom Range' },
  ];

  function handleFilterClick(id: FilterChip) {
    if (id === 'custom') {
      setActiveFilter('custom');
      setShowCustomRange(true);
    } else {
      setActiveFilter(id);
      setShowCustomRange(false);
    }
  }

  function handleImport() {
    navigate('/app/import');
  }

  function toggleBulkMode() {
    setBulkMode((m) => !m);
    setSelectedIds(new Set());
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleSelectAll() {
    if (selectedIds.size === transactions.length) {
      // Deselect all
      setSelectedIds(new Set());
    } else {
      // Select all visible
      setSelectedIds(new Set(transactions.map((t) => t._id)));
    }
  }

  async function handleBulkCategorise(category: CategoryOption) {
    setShowBulkPicker(false);
    if (selectedIds.size === 0) return;
    setBulkProcessing(true);
    try {
      const ids = Array.from(selectedIds) as Id<'transactions'>[];
      const result = await bulkCategoriseMutation({
        ids,
        categoryId: category._id,
        type: category.type,
      });
      toast.success(`Categorised ${result.updated} transaction${result.updated !== 1 ? 's' : ''} as "${category.name}"`);
      setSelectedIds(new Set());
      setBulkMode(false);
    } catch {
      toast.error('Failed to categorise transactions');
    } finally {
      setBulkProcessing(false);
    }
  }

  async function handleBulkDelete() {
    setShowDeleteConfirm(false);
    if (selectedIds.size === 0) return;
    setBulkProcessing(true);
    try {
      const ids = Array.from(selectedIds) as Id<'transactions'>[];
      const result = await bulkDeleteMutation({ ids });
      toast.success(`Deleted ${result.deleted} transaction${result.deleted !== 1 ? 's' : ''}`);
      setSelectedIds(new Set());
      setBulkMode(false);
    } catch {
      toast.error('Failed to delete transactions');
    } finally {
      setBulkProcessing(false);
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

  function handleAiComplete(categorised: number, _lowConfidence: number, total: number) {
    setActiveAiJobId(null);
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
  }

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

  // ── Bank account assignment handlers ──────────────────────────────────────

  async function handleSingleBankAssign(bankAccountId: Id<'bankAccounts'>) {
    if (!singleBankAssignTxId) return;
    try {
      const result = await assignToTransactionMutation({
        transactionId: singleBankAssignTxId,
        bankAccountId,
      });
      const acctName = bankAccountMap.get(bankAccountId)?.nickname ?? 'account';
      if (result.siblingCount > 0 && result.importJobId) {
        // Show sibling prompt
        setSiblingPrompt({
          siblingCount: result.siblingCount,
          importJobId: result.importJobId as Id<'importJobs'>,
          bankAccountId,
          accountNickname: acctName,
        });
      } else {
        toast.success(`Assigned to ${acctName}`);
      }
      setSingleBankAssignTxId(null);
    } catch {
      toast.error('Failed to assign bank account');
      setSingleBankAssignTxId(null);
    }
  }

  async function handleSiblingAssignAll() {
    if (!siblingPrompt) return;
    try {
      const result = await assignToImportJobMutation({
        importJobId: siblingPrompt.importJobId,
        bankAccountId: siblingPrompt.bankAccountId,
      });
      toast.success(`Assigned ${result.updatedCount} transactions to ${siblingPrompt.accountNickname}`);
    } catch {
      toast.error('Failed to assign import batch');
    } finally {
      setSiblingPrompt(null);
    }
  }

  function handleSiblingAssignJustOne() {
    if (!siblingPrompt) return;
    toast.success(`Assigned to ${siblingPrompt.accountNickname}`);
    setSiblingPrompt(null);
  }

  async function handleBulkBankAssign(bankAccountId: Id<'bankAccounts'>) {
    setShowBulkBankPicker(false);
    if (selectedIds.size === 0) return;
    setBulkProcessing(true);
    const ids = Array.from(selectedIds) as Id<'transactions'>[];
    const acctName = bankAccountMap.get(bankAccountId)?.nickname ?? 'account';
    let assignedCount = 0;
    let siblingPromptData: typeof siblingPrompt = null;
    try {
      for (const id of ids) {
        const result = await assignToTransactionMutation({
          transactionId: id,
          bankAccountId,
        });
        assignedCount++;
        // If any transaction has siblings, capture the last one for a batch prompt
        if (result.siblingCount > 0 && result.importJobId && !siblingPromptData) {
          siblingPromptData = {
            siblingCount: result.siblingCount,
            importJobId: result.importJobId as Id<'importJobs'>,
            bankAccountId,
            accountNickname: acctName,
          };
        }
      }
      toast.success(`Assigned ${assignedCount} transaction${assignedCount !== 1 ? 's' : ''} to ${acctName}`);
      if (siblingPromptData) {
        setSiblingPrompt(siblingPromptData);
      }
      setSelectedIds(new Set());
      setBulkMode(false);
    } catch {
      toast.error('Failed to assign bank account to some transactions');
    } finally {
      setBulkProcessing(false);
    }
  }

  const allVisibleSelected = transactions.length > 0 && selectedIds.size === transactions.length;
  const someSelected = selectedIds.size > 0;

  if (!activeEntityId) {
    return (
      <div className="max-w-4xl mx-auto animate-fade-in">
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
    <div className="max-w-4xl mx-auto animate-fade-in">
      {/* Page header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-heading-xl font-display text-neutral-900">Transactions</h1>
          <p className="text-body-sm text-neutral-500 mt-0.5">
            {isLoading
              ? 'Loading…'
              : `${totalCount.toLocaleString()} transaction${totalCount !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Select / Cancel bulk mode */}
          <button
            onClick={toggleBulkMode}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-body-sm font-medium transition-colors ${
              bulkMode
                ? 'bg-neutral-900 border-neutral-900 text-white hover:bg-neutral-800'
                : 'border-border text-neutral-700 hover:text-neutral-900 hover:bg-muted'
            }`}
          >
            <ListChecks className="w-4 h-4" />
            <span className="hidden sm:inline">{bulkMode ? 'Cancel' : 'Select'}</span>
          </button>

          {!bulkMode && (
            <>
              {/* Re-categorise with AI — shown only when uncategorised filter is active */}
              {activeFilter === 'uncategorised' && totalCount > 0 && (
                <button
                  onClick={() => setShowAiConfirm(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-primary/30 bg-primary-light text-primary text-body-sm font-medium hover:bg-primary/15 transition-colors"
                >
                  <Sparkles className="w-4 h-4" />
                  <span className="hidden sm:inline">Re-categorise with AI</span>
                  <span className="sm:hidden">AI</span>
                </button>
              )}
              <button
                onClick={() => setShowManualModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-body-sm font-medium text-neutral-700 hover:text-neutral-900 hover:bg-muted transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Add</span>
              </button>
              <button
                onClick={handleImport}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-body-sm font-medium hover:bg-primary/90 transition-colors shadow-soft"
              >
                <Upload className="w-4 h-4" />
                <span>Import</span>
              </button>
              <Link
                to="/app/ai-insights"
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-violet-200 bg-violet-50 text-violet-700 text-body-sm font-medium hover:bg-violet-100 transition-colors"
                title="AI Categorisation Insights"
              >
                <Sparkles className="w-4 h-4" />
                <span className="hidden sm:inline">AI Insights</span>
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 space-y-3">
        {/* Filter chips */}
        <div className="relative">
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {filterChips.map((chip) => {
              const chipLabel =
                chip.id === 'custom' && customRange.start && customRange.end
                  ? `${customRange.start} – ${customRange.end}`
                  : chip.label;
              return (
                <button
                  key={chip.id}
                  onClick={() => handleFilterClick(chip.id)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-body-sm font-medium transition-all duration-150 ${
                    activeFilter === chip.id
                      ? 'bg-primary text-white shadow-soft'
                      : 'bg-white border border-border text-neutral-500 hover:border-primary/40 hover:text-primary'
                  }`}
                >
                  {chipLabel}
                </button>
              );
            })}
          </div>

          {showCustomRange && (
            <CustomRangePicker
              value={customRange}
              onChange={setCustomRange}
              onClose={() => setShowCustomRange(false)}
            />
          )}
        </div>

        {/* Search + Filters + Sort */}
        <div className="flex gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 pointer-events-none" />
            <input
              type="search"
              placeholder="Search description or category…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-9 pr-8 py-2 rounded-lg border border-border text-body-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-shadow bg-white"
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-neutral-400 hover:text-neutral-700 transition-colors"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <DirectionDropdown
            value={directionFilter}
            onChange={(v) => {
              setDirectionFilter(v);
              if (v === 'credit' && activeFilter === 'expenses') setActiveFilter('all');
              if (v === 'debit' && activeFilter === 'income') setActiveFilter('all');
            }}
          />
          <CategoryFilterDropdown
            value={categoryFilter}
            onChange={setCategoryFilter}
            categories={categoryOptions}
          />
          <SortDropdown
            sortBy={sortBy}
            sortOrder={sortOrder}
            onChange={(by, order) => {
              setSortBy(by);
              setSortOrder(order);
            }}
          />
        </div>

        {/* Bulk mode: select all bar */}
        {bulkMode && !isLoading && transactions.length > 0 && (
          <div className="flex items-center gap-3 px-3 py-2 bg-neutral-50 border border-border rounded-lg">
            <button
              onClick={handleSelectAll}
              className="flex items-center gap-2 text-body-sm font-medium text-neutral-700 hover:text-primary transition-colors"
            >
              {allVisibleSelected ? (
                <CheckSquare className="w-4 h-4 text-primary" />
              ) : (
                <Square className="w-4 h-4" />
              )}
              {allVisibleSelected ? 'Deselect all' : 'Select all'}
            </button>
            <span className="text-body-sm text-neutral-400">
              ({transactions.length} on this page)
            </span>
            {someSelected && (
              <span className="ml-auto text-body-sm font-medium text-primary">
                {selectedIds.size} selected
              </span>
            )}
          </div>
        )}
      </div>

      {/* Transaction list card */}
      <div className="bg-white rounded-xl border border-border shadow-soft overflow-clip">
        {isLoading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center animate-slide-up">
            <div className="w-16 h-16 rounded-2xl bg-primary-light flex items-center justify-center mb-4">
              <ArrowLeftRight className="w-8 h-8 text-primary" strokeWidth={1.5} />
            </div>
            <p className="text-heading-md text-neutral-900 mb-1">No transactions yet</p>
            <p className="text-body-sm text-neutral-500 mb-5 max-w-xs">
              {debouncedSearch
                ? 'No transactions match your search. Try different keywords.'
                : (activeFilter !== 'all' || directionFilter || categoryFilter)
                ? 'No transactions match the selected filters.'
                : 'Import a bank statement to get started.'}
            </p>
            {activeFilter === 'all' && !debouncedSearch && !directionFilter && !categoryFilter && (
              <button
                onClick={handleImport}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-body-sm font-medium hover:bg-primary/90 transition-colors shadow-soft"
              >
                <Upload className="w-4 h-4" />
                Import Now
              </button>
            )}
            {(activeFilter !== 'all' || debouncedSearch || directionFilter || categoryFilter) && (
              <button
                onClick={() => {
                  setActiveFilter('all');
                  setSearchInput('');
                  setDirectionFilter(null);
                  setCategoryFilter(null);
                }}
                className="text-primary text-body-sm font-medium hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div>
            {grouped.map(([monthKey, txns]) => (
              <div key={monthKey}>
                {/* Month header */}
                <div className="px-4 py-2 bg-neutral-100 border-b border-border">
                  <p className="text-label text-neutral-500 font-medium uppercase tracking-wider">
                    {getMonthLabel(monthKey)}
                  </p>
                </div>

                {/* Rows */}
                <div className="divide-y divide-border">
                  {txns.map((tx: TransactionRow) => {
                    const isCredit = tx.direction === 'credit';
                    const isUncategorised = !tx.categoryId || tx.type === 'uncategorised';
                    const isForeign = tx.currency !== 'NGN';
                    const isSelected = selectedIds.has(tx._id);

                    return (
                      <div
                        key={tx._id}
                        onClick={() => {
                          if (bulkMode) {
                            toggleSelect(tx._id);
                          } else {
                            navigate(`/app/transactions/${tx._id}`);
                          }
                        }}
                        className={`flex items-center gap-3 px-4 py-3.5 transition-colors cursor-pointer group ${
                          isSelected
                            ? 'bg-primary-light/70'
                            : 'hover:bg-muted/40'
                        }`}
                      >
                        {/* Checkbox in bulk mode */}
                        {bulkMode && (
                          <div className="flex-shrink-0">
                            {isSelected ? (
                              <CheckSquare className="w-5 h-5 text-primary" />
                            ) : (
                              <Square className="w-5 h-5 text-neutral-300" />
                            )}
                          </div>
                        )}

                        {/* Direction icon */}
                        {!bulkMode && (
                          <div
                            className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-transform duration-150 group-hover:scale-105 ${
                              isCredit ? 'bg-success/10' : 'bg-danger/10'
                            }`}
                          >
                            {isCredit ? (
                              <ArrowDownLeft className="w-4 h-4 text-success" />
                            ) : (
                              <ArrowUpRight className="w-4 h-4 text-danger" />
                            )}
                          </div>
                        )}

                        {/* Description + meta */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <CategoryDot
                              color={tx.categoryColor}
                              type={tx.type ?? 'uncategorised'}
                            />
                            <p className="text-body text-neutral-900 truncate font-medium leading-tight">
                              {tx.description}
                            </p>
                            {isForeign && (
                              <span className="flex-shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-accent/10 text-accent text-[10px] font-medium">
                                <Globe className="w-2.5 h-2.5" />
                                {tx.currency}
                              </span>
                            )}
                            {tx.bankAccountId && bankAccountMap.has(tx.bankAccountId) && (
                              <span className="flex-shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-medium">
                                <Building2 className="w-2.5 h-2.5" />
                                {bankAccountMap.get(tx.bankAccountId)!.nickname}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-body-sm text-neutral-500">
                              {formatDate(tx.date)}
                            </span>
                            <span className="text-neutral-300">·</span>
                            {isUncategorised ? (
                              tx.aiCategorySuggestion && tx.aiCategoryConfidence !== undefined ? (
                                <span className="text-body-sm text-neutral-400 italic">
                                  AI suggests: {tx.aiCategorySuggestion} · {Math.round(tx.aiCategoryConfidence * 100)}%
                                </span>
                              ) : (
                                <span className="text-body-sm text-warning font-medium">
                                  Uncategorised
                                </span>
                              )
                            ) : (
                              <>
                                <span className="text-body-sm text-neutral-500">
                                  {tx.categoryName}
                                </span>
                                {/* Confidence badge for AI-categorised unreviewed */}
                                {tx.aiCategorisingJobId && !tx.reviewedByUser && tx.aiCategoryConfidence !== undefined ? (
                                  <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                    tx.aiCategoryConfidence >= 0.9
                                      ? 'bg-success/15 text-success'
                                      : 'bg-warning/15 text-warning'
                                  }`}>
                                    🤖 {Math.round(tx.aiCategoryConfidence * 100)}%
                                  </span>
                                ) : tx.reviewedByUser ? (
                                  <Check className="w-3.5 h-3.5 text-success flex-shrink-0" />
                                ) : null}
                              </>
                            )}
                          </div>
                        </div>

                        {/* Assign bank account button (hover) */}
                        {!bulkMode && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSingleBankAssignTxId(tx._id);
                            }}
                            title="Assign bank account"
                            className="flex-shrink-0 p-1.5 rounded-lg text-neutral-300 opacity-0 group-hover:opacity-100 hover:!text-blue-600 hover:!bg-blue-50 transition-all"
                          >
                            <Building2 className="w-4 h-4" />
                          </button>
                        )}

                        {/* Amount */}
                        <div className="text-right flex-shrink-0">
                          <p
                            className={`text-body font-semibold ${
                              isCredit ? 'text-success' : 'text-neutral-900'
                            }`}
                          >
                            {isCredit ? '+' : '-'}
                            {formatCurrency(tx.amount, tx.currency)}
                          </p>
                          {isForeign && (
                            <p className="text-[10px] text-neutral-400 mt-0.5">
                              {formatCurrency(tx.amountNgn, 'NGN')}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Load more */}
            {hasMore && (
              <div className="px-4 py-4 border-t border-border flex justify-center">
                <button
                  onClick={() => setLimit((prev) => prev + 25)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border text-body-sm text-neutral-500 hover:text-neutral-900 hover:bg-muted hover:border-neutral-300 transition-all"
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  Load more
                </button>
              </div>
            )}

            {/* All loaded */}
            {!hasMore && transactions.length > 0 && (
              <div className="px-4 py-3 border-t border-border text-center">
                <p className="text-body-sm text-neutral-400">
                  Showing all {transactions.length.toLocaleString()} transaction
                  {transactions.length !== 1 ? 's' : ''}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bulk action bar (bottom) */}
      {bulkMode && (
        <div className="fixed bottom-0 left-0 right-0 z-30 md:left-64">
          <div className="bg-neutral-900 text-white px-4 py-3 flex items-center gap-3 shadow-medium">
            <span className="text-body-sm font-medium flex-1">
              {someSelected
                ? `${selectedIds.size} selected`
                : 'Tap rows to select'}
            </span>
            <button
              disabled={!someSelected || bulkProcessing}
              onClick={() => setShowBulkPicker(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-body-sm font-medium hover:bg-primary/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Tag className="w-4 h-4" />
              Categorise
            </button>
            <button
              disabled={!someSelected || bulkProcessing}
              onClick={() => setShowBulkBankPicker(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-body-sm font-medium hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Building2 className="w-4 h-4" />
              Bank
            </button>
            <button
              disabled={!someSelected || bulkProcessing}
              onClick={() => setShowDeleteConfirm(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-danger text-white text-body-sm font-medium hover:bg-danger/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      {showManualModal && (
        <ManualTransactionModal onClose={() => setShowManualModal(false)} />
      )}

      {showBulkPicker && (
        <CategoryPickerModal
          title="Categorise Selected"
          onClose={() => setShowBulkPicker(false)}
          onSelect={handleBulkCategorise}
        />
      )}

      {showDeleteConfirm && (
        <DeleteConfirmDialog
          count={selectedIds.size}
          onConfirm={handleBulkDelete}
          onCancel={() => setShowDeleteConfirm(false)}
          loading={bulkProcessing}
        />
      )}

      {/* Single bank account assignment modal */}
      {singleBankAssignTxId && activeEntityId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSingleBankAssignTxId(null)} />
          <div className="relative bg-white rounded-2xl shadow-medium w-full max-w-sm p-6 animate-slide-up">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                <Building2 className="w-5 h-5 text-blue-700" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-neutral-900">Assign Bank Account</h3>
                <p className="text-xs text-neutral-500 mt-0.5">Select the source account for this transaction</p>
              </div>
            </div>
            <BankAccountSelector
              entityId={activeEntityId}
              value={null}
              onChange={(bankAccountId) => handleSingleBankAssign(bankAccountId)}
            />
            <button
              onClick={() => setSingleBankAssignTxId(null)}
              className="mt-3 w-full px-4 py-2.5 text-body-sm font-medium text-neutral-700 bg-muted rounded-lg hover:bg-muted/80 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Bulk bank account assignment modal */}
      {showBulkBankPicker && activeEntityId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowBulkBankPicker(false)} />
          <div className="relative bg-white rounded-2xl shadow-medium w-full max-w-sm p-6 animate-slide-up">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                <Building2 className="w-5 h-5 text-blue-700" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-neutral-900">Assign Bank Account</h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Assign {selectedIds.size} transaction{selectedIds.size !== 1 ? 's' : ''} to a bank account
                </p>
              </div>
            </div>
            <BankAccountSelector
              entityId={activeEntityId}
              value={null}
              onChange={(bankAccountId) => handleBulkBankAssign(bankAccountId)}
            />
            <button
              onClick={() => setShowBulkBankPicker(false)}
              className="mt-3 w-full px-4 py-2.5 text-body-sm font-medium text-neutral-700 bg-muted rounded-lg hover:bg-muted/80 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Sibling import batch assignment confirmation */}
      {siblingPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleSiblingAssignJustOne} />
          <div className="relative bg-white rounded-2xl shadow-medium w-full max-w-sm p-6 animate-slide-up">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                <Building2 className="w-5 h-5 text-blue-700" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-neutral-900">Assign Import Batch?</h3>
              </div>
            </div>
            <p className="text-body-sm text-neutral-600 mb-5">
              This transaction was imported with{' '}
              <span className="font-semibold text-neutral-900">{siblingPrompt.siblingCount} other transaction{siblingPrompt.siblingCount !== 1 ? 's' : ''}</span>.
              Assign all of them to <span className="font-semibold text-neutral-900">{siblingPrompt.accountNickname}</span>?
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleSiblingAssignJustOne}
                className="flex-1 px-4 py-2.5 text-body-sm font-medium text-neutral-700 bg-muted rounded-lg hover:bg-muted/80 transition-colors"
              >
                Just this one
              </button>
              <button
                onClick={handleSiblingAssignAll}
                className="flex-1 px-4 py-2.5 text-body-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-500 transition-colors"
              >
                Assign all
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI confirm dialog */}
      {showAiConfirm && (
        <AiCategoriseConfirmDialog
          count={totalCount}
          onConfirm={handleStartAiCategorise}
          onCancel={() => setShowAiConfirm(false)}
          loading={aiConfirmLoading}
        />
      )}

      {/* AI progress overlay */}
      {activeAiJobId && (
        <AiProgressOverlay
          jobId={activeAiJobId}
          onCancel={handleCancelAiJob}
          onComplete={handleAiComplete}
        />
      )}
    </div>
  );
}
