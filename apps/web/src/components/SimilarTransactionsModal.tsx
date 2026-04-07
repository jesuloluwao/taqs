import { useState, useCallback } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';

export interface SimilarTransaction {
  _id: Id<'transactions'>;
  description: string;
  amount: number;
  amountNgn: number;
  date: number;
  direction: 'credit' | 'debit';
  aiCategorySuggestion?: string;
  aiCategoryConfidence?: number;
  matchType: 'exact' | 'counterparty';
}

interface Props {
  similarTransactions: SimilarTransaction[];
  categoryName: string;
  categoryId: Id<'categories'>;
  categoryType: 'income' | 'business_expense' | 'personal_expense' | 'transfer';
  sourceTransactionId: Id<'transactions'>;
  counterpartyName: string | null;
  onClose: () => void;
  onApplied: (count: number) => void;
}

export function SimilarTransactionsModal({
  similarTransactions,
  categoryName,
  categoryId,
  categoryType,
  sourceTransactionId,
  counterpartyName,
  onClose,
  onApplied,
}: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(similarTransactions.map((tx) => tx._id as string))
  );
  const [applying, setApplying] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applySimilar = useMutation((api as any).transactions.applySimilarCategorisation);

  const selectedCount = selectedIds.size;
  const allSelected = selectedCount === similarTransactions.length;

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(similarTransactions.map((tx) => tx._id as string)));
    }
  }, [allSelected, similarTransactions]);

  const handleApply = useCallback(async () => {
    if (selectedCount === 0 || applying) return;
    setApplying(true);
    try {
      const result = await applySimilar({
        transactionIds: Array.from(selectedIds) as Id<'transactions'>[],
        categoryId,
        type: categoryType,
        sourceTransactionId,
      });
      onApplied(result.applied);
    } catch {
      // Let Convex error handling show the toast
      setApplying(false);
    }
  }, [selectedIds, selectedCount, applying, applySimilar, categoryId, categoryType, sourceTransactionId, onApplied]);

  const formatAmount = (tx: SimilarTransaction) => {
    const naira = Math.abs(tx.amountNgn) / 100;
    const prefix = tx.direction === 'debit' ? '-' : '+';
    return `${prefix}₦${naira.toLocaleString('en-NG', { minimumFractionDigits: 0 })}`;
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col animate-slide-up">
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Apply to Similar Transactions?
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none"
            >
              &times;
            </button>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            We found{' '}
            <span className="font-medium text-gray-900 dark:text-white">
              {similarTransactions.length} similar transaction{similarTransactions.length !== 1 ? 's' : ''}
            </span>
            {counterpartyName && (
              <>
                {' '}matching{' '}
                <span className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-gray-700 dark:text-gray-300 font-medium">
                  {counterpartyName}
                </span>
              </>
            )}
            . Apply{' '}
            <span className="bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded font-medium">
              {categoryName}
            </span>{' '}
            to selected?
          </p>
          <div className="flex items-center gap-3">
            <label
              className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer"
              onClick={toggleSelectAll}
            >
              <span
                className={`w-4 h-4 rounded border-2 flex items-center justify-center text-[10px] ${
                  allSelected
                    ? 'bg-green-500 border-green-500 text-white'
                    : 'border-gray-300 dark:border-gray-600'
                }`}
              >
                {allSelected && '✓'}
              </span>
              Select All ({similarTransactions.length})
            </label>
            <span className="text-gray-300 dark:text-gray-600">|</span>
            <span className="text-sm text-gray-400">{selectedCount} selected</span>
          </div>
        </div>

        {/* Transaction List */}
        <div className="flex-1 overflow-y-auto px-5 py-2">
          {similarTransactions.map((tx) => {
            const isSelected = selectedIds.has(tx._id as string);
            return (
              <div
                key={tx._id}
                className={`flex items-center gap-3 py-3 border-b border-gray-50 dark:border-gray-800 cursor-pointer ${
                  !isSelected ? 'opacity-60' : ''
                }`}
                onClick={() => toggleSelect(tx._id as string)}
              >
                <span
                  className={`w-[18px] h-[18px] rounded border-2 flex items-center justify-center text-[10px] flex-shrink-0 ${
                    isSelected
                      ? 'bg-green-500 border-green-500 text-white'
                      : 'border-gray-300 dark:border-gray-600'
                  }`}
                >
                  {isSelected && '✓'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline gap-3">
                    <span className="text-sm text-gray-900 dark:text-white truncate">
                      {tx.description}
                    </span>
                    <span
                      className={`text-sm font-medium flex-shrink-0 ${
                        tx.direction === 'debit'
                          ? 'text-red-500'
                          : 'text-green-600'
                      }`}
                    >
                      {formatAmount(tx)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-400">{formatDate(tx.date)}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                        tx.matchType === 'exact'
                          ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'
                          : 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                      }`}
                    >
                      {tx.matchType === 'exact' ? 'Exact match' : 'Same merchant'}
                    </span>
                    {tx.aiCategorySuggestion && tx.aiCategoryConfidence !== undefined && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
                        AI: {tx.aiCategorySuggestion} ({Math.round(tx.aiCategoryConfidence * 100)}%)
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800 flex justify-between items-center">
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-sm text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Skip
          </button>
          <button
            onClick={handleApply}
            disabled={selectedCount === 0 || applying}
            className="px-5 py-2.5 text-sm font-semibold bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {applying
              ? 'Applying...'
              : `Apply to ${selectedCount} Transaction${selectedCount !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
