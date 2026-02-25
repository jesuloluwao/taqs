import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { useNavigate } from 'react-router-dom';
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
} from 'lucide-react';

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

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

// ── Main page ──────────────────────────────────────────────────────────────
export default function Transactions() {
  const { activeEntityId } = useEntity();
  const navigate = useNavigate();

  const [activeFilter, setActiveFilter] = useState<FilterChip>('all');
  const [searchInput, setSearchInput] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
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

  const debouncedSearch = useDebounce(searchInput, 350);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bulkCategoriseMutation = useMutation((api as any).transactions.bulkCategorise);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bulkDeleteMutation = useMutation((api as any).transactions.bulkDelete);

  // Derive query params from active filter
  const queryParams = useMemo(() => {
    const base = {
      sortBy,
      sortOrder,
      limit,
      offset: 0 as const,
      search: debouncedSearch || undefined,
    };

    if (activeFilter === 'income') {
      return { ...base, direction: 'credit' as const };
    }
    if (activeFilter === 'expenses') {
      return { ...base, direction: 'debit' as const };
    }
    if (activeFilter === 'uncategorised') {
      return { ...base, type: 'uncategorised' as const };
    }
    if (activeFilter === 'this-month') {
      const { start, end } = getThisMonthRange();
      return { ...base, startDate: start, endDate: end };
    }
    if (activeFilter === 'this-quarter') {
      const { start, end } = getThisQuarterRange();
      return { ...base, startDate: start, endDate: end };
    }
    if (activeFilter === 'custom' && customRange.start && customRange.end) {
      return {
        ...base,
        startDate: new Date(customRange.start).getTime(),
        endDate: new Date(customRange.end + 'T23:59:59').getTime(),
      };
    }
    return base;
  }, [activeFilter, sortBy, sortOrder, limit, debouncedSearch, customRange]);

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
    const key = `${activeFilter}|${sortBy}|${sortOrder}|${debouncedSearch}|${customRange.start}|${customRange.end}`;
    if (prevFilterKey.current !== key) {
      setLimit(25);
      prevFilterKey.current = key;
    }
  }, [activeFilter, sortBy, sortOrder, debouncedSearch, customRange]);

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

        {/* Search + Sort */}
        <div className="flex gap-2">
          <div className="relative flex-1">
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
      <div className="bg-white rounded-xl border border-border shadow-soft overflow-hidden">
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
                : activeFilter !== 'all'
                ? 'No transactions match the selected filter.'
                : 'Import a bank statement to get started.'}
            </p>
            {activeFilter === 'all' && !debouncedSearch && (
              <button
                onClick={handleImport}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-body-sm font-medium hover:bg-primary/90 transition-colors shadow-soft"
              >
                <Upload className="w-4 h-4" />
                Import Now
              </button>
            )}
            {(activeFilter !== 'all' || debouncedSearch) && (
              <button
                onClick={() => {
                  setActiveFilter('all');
                  setSearchInput('');
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
                <div className="px-4 py-2 bg-neutral-100/70 border-b border-border sticky top-14 z-10">
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
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-body-sm text-neutral-500">
                              {formatDate(tx.date)}
                            </span>
                            <span className="text-neutral-300">·</span>
                            {isUncategorised ? (
                              <span className="text-body-sm text-warning font-medium">
                                Uncategorised
                              </span>
                            ) : (
                              <span className="text-body-sm text-neutral-500">
                                {tx.categoryName}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Amount */}
                        <div className="text-right flex-shrink-0">
                          <p
                            className={`text-body font-semibold ${
                              isCredit ? 'text-success' : 'text-neutral-900'
                            }`}
                          >
                            {isCredit ? '+' : '-'}
                            {formatNaira(tx.amountNgn)}
                          </p>
                          {isForeign && (
                            <p className="text-[10px] text-neutral-400 mt-0.5">
                              {new Intl.NumberFormat('en', {
                                style: 'currency',
                                currency: tx.currency,
                                minimumFractionDigits: 0,
                              }).format(tx.amount / 100)}
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
    </div>
  );
}
