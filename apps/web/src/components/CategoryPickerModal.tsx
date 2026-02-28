import { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { Search, X } from 'lucide-react';

export interface CategoryOption {
  _id: Id<'categories'>;
  name: string;
  type: 'income' | 'business_expense' | 'personal_expense' | 'transfer';
  direction?: 'credit' | 'debit' | 'both';
  isDeductibleDefault?: boolean;
}

interface Props {
  onSelect: (category: CategoryOption) => void;
  onClose: () => void;
  title?: string;
  /** When provided, only categories matching this direction (or 'both') are shown */
  direction?: 'credit' | 'debit';
}

const GROUP_LABELS: Record<string, string> = {
  income: 'Income Types',
  business_expense: 'Business Expenses',
  personal_expense: 'Personal',
  transfer: 'Transfers',
};

const GROUP_ORDER = ['income', 'business_expense', 'personal_expense', 'transfer'];

export function CategoryPickerModal({ onSelect, onClose, title = 'Select Category', direction }: Props) {
  const [search, setSearch] = useState('');
  const categories = useQuery(api.categories.listAll) as CategoryOption[] | undefined;

  const searchLower = search.toLowerCase();
  const filtered = (categories ?? []).filter((c) => {
    if (!c.name.toLowerCase().includes(searchLower)) return false;
    if (direction && c.direction && c.direction !== 'both' && c.direction !== direction) return false;
    return true;
  });

  const grouped = GROUP_ORDER.map((type) => ({
    type,
    label: GROUP_LABELS[type],
    items: filtered.filter((c) => c.type === type),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-medium animate-slide-up max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-border flex-shrink-0">
          <h2 className="text-heading-sm font-display text-neutral-900">{title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-muted transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4 text-neutral-500" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pt-3 pb-2 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
            <input
              autoFocus
              type="search"
              placeholder="Search categories…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-border text-body-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
            />
          </div>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1 pb-2">
          {categories === undefined ? (
            <div className="p-8 text-center text-neutral-400 text-body-sm">Loading…</div>
          ) : grouped.length === 0 ? (
            <div className="p-8 text-center text-neutral-400 text-body-sm">
              No categories match "{search}"
            </div>
          ) : (
            grouped.map((group) => (
              <div key={group.type}>
                {/* Group header */}
                <div className="px-4 py-2 bg-neutral-50 border-y border-border sticky top-0">
                  <p className="text-label text-neutral-500 font-medium uppercase tracking-wider">
                    {group.label}
                  </p>
                </div>

                {/* Category rows */}
                {group.items.map((cat) => (
                  <button
                    key={cat._id}
                    onClick={() => onSelect(cat)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-primary-light/60 transition-colors border-b border-border/40 last:border-0"
                  >
                    <span className="text-body text-neutral-900">{cat.name}</span>
                    {cat.isDeductibleDefault && (
                      <span className="flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 bg-success/10 text-success rounded-full">
                        Deductible
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
