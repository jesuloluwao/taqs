# Smart Batch Categorisation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user manually categorizes a transaction, find similar uncategorised/low-confidence transactions and let them batch-apply the same category via a confirmation modal.

**Architecture:** New `extractCounterparty()` utility unifies and extends existing vendor extraction patterns. A new `findSimilar` Convex query uses exact-description + counterparty matching to find eligible transactions. A new `applySimilarCategorisation` mutation handles batch updates with AI feedback recording. A `SimilarTransactionsModal` React component surfaces matches after manual categorization.

**Tech Stack:** Convex (query + mutation), React, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-29-smart-batch-categorisation-design.md`

**Note:** This project has no unit test framework. Steps include manual verification via the Convex dashboard and browser. Type-checking via `npx tsc --noEmit` serves as the primary automated validation.

**Note on Transactions page:** The spec lists "CategoryPickerModal — inline category pick from transaction list" as a trigger point, but the Transactions page only uses `CategoryPickerModal` for bulk categorization (which the spec explicitly excludes from triggering). Clicking an individual row navigates to TransactionDetail. Therefore, there is no Transactions page integration task — TransactionDetail and Triage cover all single-transaction categorization flows.

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `convex/lib/counterpartyExtractor.ts` | `extractCounterparty()` + `normalizeDescription()` utilities |
| `apps/web/src/components/SimilarTransactionsModal.tsx` | Modal component for reviewing and applying similar matches |

### Modified Files
| File | Changes |
|------|---------|
| `convex/transactions.ts` | Add `findSimilar` query + `applySimilarCategorisation` mutation |
| `convex/ruleBasedCategoriser.ts` | Import and use shared `extractCounterparty()` instead of inline `extractVendorName()` |
| `apps/web/src/pages/TransactionDetail.tsx` | Trigger `findSimilar` after save, show modal |
| `apps/web/src/pages/Triage.tsx` | Trigger `findSimilar` after triage categorization, show modal |

---

## Task 1: Counterparty Extraction Utility

**Files:**
- Create: `convex/lib/counterpartyExtractor.ts`
- Modify: `convex/ruleBasedCategoriser.ts` (replace inline `extractVendorName` with import)

- [ ] **Step 1: Create `convex/lib/counterpartyExtractor.ts`**

```typescript
/**
 * Extracts the counterparty/merchant name from Nigerian bank narrations.
 * Unifies patterns from ruleBasedCategoriser.ts extractVendorName() with
 * additional patterns for smart batch categorisation.
 */

/** Normalize a transaction description for exact-match comparison. */
export function normalizeDescription(desc: string): string {
  return desc.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Extract the counterparty/merchant name from a bank narration.
 * Returns null if no pattern matches.
 *
 * Pattern priority (first match wins):
 * 1. TRANSFER TO ... FROM — e.g. "TRANSFER TO JOHN DOE FROM 0012345678"
 * 2. TRF FRM <name>/...   — e.g. "TRF FRM JOHN DOE/ACME LTD"
 * 3. TRF TO <name>/...    — e.g. "TRF TO SHOPRITE/PAYMENT"
 * 4. NIP/<processor>/...  — e.g. "NIP/PAYSTACK/INV-00234"
 * 5. NIP:<name>           — e.g. "NIP:JOHN DOE-1234"
 * 6. POS/WEB PURCHASE     — e.g. "POS PURCHASE - SHOPRITE LEKKI"
 * 7. *<merchant>*...      — e.g. "*UBER*TRIP-12345"
 */
export function extractCounterparty(desc: string): string | null {
  // 1. TRANSFER TO ... FROM (existing ruleBasedCategoriser pattern)
  const toFrom = desc.match(/TRANSFER\s+TO\s+(.+?)\s+FROM\s+/i);
  if (toFrom) return toFrom[1].trim().toUpperCase();

  // 2. TRF FRM <name>/...
  const trfFrm = desc.match(/TRF\s+FRM\s+([^/]+)/i);
  if (trfFrm) return trfFrm[1].trim().toUpperCase();

  // 3. TRF TO <name>/...
  const trfTo = desc.match(/TRF\s+TO\s+([^/]+)/i);
  if (trfTo) return trfTo[1].trim().toUpperCase();

  // 4. NIP/<processor>/...
  const nipSlash = desc.match(/^NIP\/([^/]+)/i);
  if (nipSlash) return nipSlash[1].trim().toUpperCase();

  // 5. NIP:<name> (existing ruleBasedCategoriser pattern)
  const nipColon = desc.match(/^NIP:(.+?)(?:-|$)/i);
  if (nipColon) return nipColon[1].trim().toUpperCase();

  // 6. POS/WEB PURCHASE - <merchant>
  // Limitation: extracts only the first word as merchant name. Multi-word merchants
  // (e.g. "CHICKEN REPUBLIC LEKKI") will match on first word only ("CHICKEN").
  // This is a known trade-off — no reliable way to separate merchant from location
  // without a dictionary. Works well for single-word merchants (SHOPRITE, SPAR, etc.)
  const pos = desc.match(/(?:POS|WEB)\s*(?:\/\s*WEB)?\s*PURCHASE\s*-?\s*(.+)/i);
  if (pos) {
    const full = pos[1].trim().toUpperCase();
    const firstWord = full.split(/\s+/)[0];
    return firstWord || null;
  }

  // 7. *<merchant>*...
  const asterisk = desc.match(/\*([^*]+)\*/);
  if (asterisk) return asterisk[1].trim().toUpperCase();

  return null;
}
```

- [ ] **Step 2: Update `ruleBasedCategoriser.ts` to use shared utility**

Replace the inline `extractVendorName` function (lines ~47-58) with an import from the new utility. The existing function returns `undefined` while the new one returns `null`, so update call sites accordingly.

At the top of `ruleBasedCategoriser.ts`, add:
```typescript
import { extractCounterparty } from './lib/counterpartyExtractor';
```

Replace the `extractVendorName` function body to delegate:
```typescript
function extractVendorName(desc: string): string | undefined {
  return extractCounterparty(desc) ?? undefined;
}
```

This preserves the `undefined` return type that callers expect while using the unified extraction logic.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors related to counterpartyExtractor or ruleBasedCategoriser

- [ ] **Step 4: Commit**

```bash
git add convex/lib/counterpartyExtractor.ts convex/ruleBasedCategoriser.ts
git commit -m "feat(smartBatch): add counterparty extraction utility"
```

---

## Task 2: `findSimilar` Convex Query

**Files:**
- Modify: `convex/transactions.ts`

- [ ] **Step 1: Add the `findSimilar` query**

Add to `convex/transactions.ts` after the existing queries. Follow the same auth + entity check pattern as other queries in the file.

The query returns `sourceCounterparty` alongside the match list so the frontend can display the matched merchant name without needing to import the extraction utility client-side.

```typescript
/**
 * Find transactions similar to a just-categorized transaction.
 * Used by the Smart Batch Categorisation modal.
 *
 * Returns up to 25 uncategorised or low-confidence AI transactions
 * matching by exact description or counterparty extraction.
 *
 * Performance note: collects all transactions for entity+taxYear into memory
 * for string matching. For typical users (<2000 txns/year) this is fine.
 * If transaction volumes grow significantly, consider adding a description
 * index or early-exit optimization.
 */
export const findSimilar = query({
  args: {
    transactionId: v.id('transactions'),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return { matches: [], sourceCounterparty: null as string | null };

    // Fetch the source transaction (already updated with new category)
    const source = await ctx.db.get(args.transactionId);
    if (!source || source.userId !== user._id) {
      return { matches: [], sourceCounterparty: null as string | null };
    }

    // Get all transactions for the same entity + taxYear
    const candidates = await ctx.db
      .query('transactions')
      .withIndex('by_entityId_taxYear', (q) =>
        q.eq('entityId', source.entityId).eq('taxYear', source.taxYear)
      )
      .collect();

    const sourceNormalized = normalizeDescription(source.description);
    const sourceCounterparty = extractCounterparty(source.description);

    type SimilarTransaction = {
      _id: Id<'transactions'>;
      description: string;
      amount: number;
      amountNgn: number;
      date: number;
      direction: 'credit' | 'debit';
      aiCategorySuggestion?: string;
      aiCategoryConfidence?: number;
      matchType: 'exact' | 'counterparty';
    };

    const results: SimilarTransaction[] = [];
    const seenIds = new Set<string>();

    for (const tx of candidates) {
      // Early exit once we have enough matches. Note: since the index doesn't
      // guarantee date ordering, these may not be the 25 *most recent* matches.
      // For typical users (<2000 txns/year), eligible matches rarely exceed 25,
      // making this a non-issue in practice. If needed, remove this early exit
      // and rely on the sort+slice below.
      if (results.length >= 25) break;

      // Skip the source transaction itself
      if (tx._id === source._id) continue;

      // Skip already-reviewed transactions
      if (tx.reviewedByUser === true) continue;

      // Must be same direction
      if (tx.direction !== source.direction) continue;

      // Eligibility: uncategorised OR low-confidence AI
      const isUncategorised = tx.type === 'uncategorised' && !tx.categoryId;
      const isLowConfidenceAi =
        tx.aiCategoryConfidence !== undefined && tx.aiCategoryConfidence < 0.7;
      if (!isUncategorised && !isLowConfidenceAi) continue;

      // Check exact description match
      const txNormalized = normalizeDescription(tx.description);
      if (txNormalized === sourceNormalized) {
        if (!seenIds.has(tx._id)) {
          seenIds.add(tx._id);
          results.push({
            _id: tx._id,
            description: tx.description,
            amount: tx.amount,
            amountNgn: tx.amountNgn,
            date: tx.date,
            direction: tx.direction,
            aiCategorySuggestion: tx.aiCategorySuggestion,
            aiCategoryConfidence: tx.aiCategoryConfidence,
            matchType: 'exact',
          });
        }
        continue;
      }

      // Check counterparty match
      if (sourceCounterparty) {
        const txCounterparty = extractCounterparty(tx.description);
        if (
          txCounterparty &&
          txCounterparty === sourceCounterparty // Both already uppercased by extractCounterparty
        ) {
          if (!seenIds.has(tx._id)) {
            seenIds.add(tx._id);
            results.push({
              _id: tx._id,
              description: tx.description,
              amount: tx.amount,
              amountNgn: tx.amountNgn,
              date: tx.date,
              direction: tx.direction,
              aiCategorySuggestion: tx.aiCategorySuggestion,
              aiCategoryConfidence: tx.aiCategoryConfidence,
              matchType: 'counterparty',
            });
          }
        }
      }
    }

    // Sort by date descending
    results.sort((a, b) => b.date - a.date);
    return { matches: results.slice(0, 25), sourceCounterparty };
  },
});
```

Add the imports at the top of `convex/transactions.ts`:
```typescript
import { extractCounterparty, normalizeDescription } from './lib/counterpartyExtractor';
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Manual verification via Convex dashboard**

1. Open the Convex dashboard
2. Find a categorized transaction ID
3. Run `transactions.findSimilar({ transactionId: "<id>" })` from the Functions tab
4. Verify it returns `{ matches: [...], sourceCounterparty: "..." }` (empty matches is fine if no matches exist in test data)

- [ ] **Step 4: Commit**

```bash
git add convex/transactions.ts
git commit -m "feat(smartBatch): add findSimilar query for transaction matching"
```

---

## Task 3: `applySimilarCategorisation` Mutation

**Files:**
- Modify: `convex/transactions.ts`

- [ ] **Step 1: Add the `applySimilarCategorisation` mutation**

Add after the `bulkCategorise` mutation in `convex/transactions.ts`. Follows the same pattern but adds AI feedback recording.

```typescript
/**
 * Apply a category to similar transactions identified by findSimilar.
 * Records AI feedback for each transaction that had an AI suggestion.
 * Returns count of successfully applied transactions.
 *
 * NOTE: AI feedback insertion is done inline rather than calling recordAiFeedback
 * to avoid the overhead of re-authenticating per-record in a loop. The insert
 * schema matches recordAiFeedback exactly — if aiCategorisationFeedback schema
 * changes, update both this mutation and recordAiFeedback.
 */
export const applySimilarCategorisation = mutation({
  args: {
    transactionIds: v.array(v.id('transactions')),
    categoryId: v.id('categories'),
    type: transactionTypeValidator,
    sourceTransactionId: v.id('transactions'),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    const category = await ctx.db.get(args.categoryId);
    if (!category) throw new Error('Category not found');

    const isDeductible = category.isDeductibleDefault ?? false;

    // Get source transaction for entityId (needed for feedback records)
    const source = await ctx.db.get(args.sourceTransactionId);
    if (!source || source.userId !== user._id) {
      throw new Error('Source transaction not found or unauthorized');
    }

    // Valid transaction types for aiCategorisationFeedback schema
    const validTypes = new Set([
      'income', 'business_expense', 'personal_expense', 'transfer', 'uncategorised',
    ]);

    let applied = 0;

    for (const id of args.transactionIds) {
      const tx = await ctx.db.get(id);

      // Ownership guard
      if (!tx || tx.userId !== user._id) continue;

      // Eligibility guard — skip if already reviewed by another session
      if (tx.reviewedByUser === true) continue;

      // Record AI feedback if transaction had an AI suggestion that differs
      if (tx.aiCategorySuggestion) {
        const aiMatchesApplied =
          tx.aiCategorySuggestion.toLowerCase() === category.name.toLowerCase();

        if (!aiMatchesApplied) {
          // Validate aiTypeSuggestion before inserting (schema requires specific union)
          const aiType = validTypes.has(tx.aiTypeSuggestion as string)
            ? (tx.aiTypeSuggestion as 'income' | 'business_expense' | 'personal_expense' | 'transfer' | 'uncategorised')
            : undefined;

          await ctx.db.insert('aiCategorisationFeedback', {
            entityId: source.entityId,
            userId: user._id,
            transactionId: tx._id,
            aiSuggestedCategory: tx.aiCategorySuggestion,
            aiSuggestedType: aiType,
            aiConfidence: tx.aiCategoryConfidence,
            userChosenCategory: category.name,
            userChosenType: args.type,
            transactionDescription: tx.description,
            transactionAmount: tx.amount,
            transactionDirection: tx.direction,
            createdAt: Date.now(),
          });
        }

        await ctx.db.patch(id, {
          categoryId: args.categoryId,
          type: args.type,
          isDeductible,
          reviewedByUser: true,
          userOverrodeAi: !aiMatchesApplied,
          updatedAt: Date.now(),
        });
      } else {
        // No AI suggestion — just apply the category
        await ctx.db.patch(id, {
          categoryId: args.categoryId,
          type: args.type,
          isDeductible,
          reviewedByUser: true,
          updatedAt: Date.now(),
        });
      }

      applied++;
    }

    return { applied, total: args.transactionIds.length };
  },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add convex/transactions.ts
git commit -m "feat(smartBatch): add applySimilarCategorisation mutation with AI feedback"
```

---

## Task 4: SimilarTransactionsModal Component

**Files:**
- Create: `apps/web/src/components/SimilarTransactionsModal.tsx`

- [ ] **Step 1: Create the modal component**

Follow the existing dialog pattern from `TransactionDetail.tsx` (fixed inset-0, backdrop, rounded card). Use the app's existing Tailwind classes.

```typescript
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
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/SimilarTransactionsModal.tsx
git commit -m "feat(smartBatch): add SimilarTransactionsModal component"
```

---

## Task 5: Integrate into TransactionDetail Page

**Files:**
- Modify: `apps/web/src/pages/TransactionDetail.tsx`

- [ ] **Step 1: Add imports and state**

At the top of `TransactionDetail.tsx`, add:
```typescript
import { SimilarTransactionsModal, type SimilarTransaction } from '../components/SimilarTransactionsModal';
```

Add state variables inside the component, alongside existing state:
```typescript
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
```

Add the `findSimilar` query hook (skip by default, only call when needed):
```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const findSimilarResult = useQuery(
  (api as any).transactions.findSimilar,
  transaction && lastAppliedCategory ? { transactionId: transaction._id } : 'skip'
) as { matches: SimilarTransaction[]; sourceCounterparty: string | null } | undefined;
```

- [ ] **Step 2: Add effect to capture results and show modal**

Add a `useEffect` that captures the reactive query result into local state. The `showSimilarModal` guard prevents re-triggering if the reactive query fires again while the modal is already open.

```typescript
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
```

- [ ] **Step 3: Trigger after save**

In the existing `handleSave` function, after the `await updateTx(...)` call and after the AI feedback recording block, add:

```typescript
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
```

- [ ] **Step 4: Render the modal**

Add at the end of the component's JSX, alongside existing dialogs:

```typescript
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
      // TODO: show success toast if the app has a toast system
      // e.g. toast.success(`Applied to ${count} transaction${count !== 1 ? 's' : ''}`)
    }}
  />
)}
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Manual browser test**

1. Open the app, navigate to a transaction detail page
2. Change the category and save
3. If similar transactions exist, the modal should appear
4. Select/deselect transactions, click Apply
5. Verify the transactions are updated in the transaction list
6. Verify: accepting an AI suggestion does NOT trigger the modal

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/pages/TransactionDetail.tsx
git commit -m "feat(smartBatch): integrate similar transactions modal into TransactionDetail"
```

---

## Task 6: Integrate into Triage Page

**Files:**
- Modify: `apps/web/src/pages/Triage.tsx`

- [ ] **Step 1: Add imports and state**

Add at the top of `Triage.tsx`:
```typescript
import { SimilarTransactionsModal, type SimilarTransaction } from '../components/SimilarTransactionsModal';
```

The Triage page uses a **draft-then-apply** pattern — categories are assigned as drafts, then applied in bulk via "Apply Pending." The similar transactions modal triggers after the bulk apply completes (not after each draft assignment), since that's when transactions actually get categorized.

Add state:
```typescript
// Smart batch categorisation state
const [showSimilarModal, setShowSimilarModal] = useState(false);
const [similarResults, setSimilarResults] = useState<SimilarTransaction[]>([]);
const [similarSourceCounterparty, setSimilarSourceCounterparty] = useState<string | null>(null);
const [modalCategoryInfo, setModalCategoryInfo] = useState<{
  categoryId: Id<'categories'>;
  categoryName: string;
  categoryType: 'income' | 'business_expense' | 'personal_expense' | 'transfer';
} | null>(null);
// similarSourceId triggers the query; modalSourceId persists for the modal prop
const [similarSourceId, setSimilarSourceId] = useState<Id<'transactions'> | null>(null);
const [modalSourceId, setModalSourceId] = useState<Id<'transactions'> | null>(null);
```

- [ ] **Step 2: Add query and effect**

```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const findSimilarResult = useQuery(
  (api as any).transactions.findSimilar,
  similarSourceId ? { transactionId: similarSourceId } : 'skip'
) as { matches: SimilarTransaction[]; sourceCounterparty: string | null } | undefined;

useEffect(() => {
  if (showSimilarModal) return;

  if (findSimilarResult && findSimilarResult.matches.length > 0 && similarSourceId && modalCategoryInfo) {
    setSimilarResults([...findSimilarResult.matches]);
    setSimilarSourceCounterparty(findSimilarResult.sourceCounterparty);
    setShowSimilarModal(true);
    setSimilarSourceId(null); // Return query to 'skip'
  } else if (findSimilarResult && findSimilarResult.matches.length === 0 && similarSourceId) {
    setSimilarSourceId(null);
    setModalCategoryInfo(null);
    setModalSourceId(null);
  }
}, [findSimilarResult, similarSourceId, modalCategoryInfo, showSimilarModal]);
```

- [ ] **Step 3: Trigger after bulk apply**

In the `handleApplyPending` function, after the bulk mutations and feedback recording succeed, pick the **first** applied transaction and its category to trigger a similarity check. This is a pragmatic choice — checking every applied category would be complex and potentially show multiple modals. The first one gives immediate value.

After the `Promise.all` for bulk mutations and feedback:
```typescript
// Trigger similar transactions check for the first applied transaction
const firstEntry = Object.entries(draftAssignments)[0];
if (firstEntry) {
  const [txId, assignment] = firstEntry;
  const typedId = txId as Id<'transactions'>;
  setSimilarSourceId(typedId);
  setModalSourceId(typedId);
  setModalCategoryInfo({
    categoryId: assignment.categoryId,
    categoryName: assignment.categoryName,
    categoryType: assignment.type,
  });
}
```

- [ ] **Step 4: Render the modal**

Add at the end of the component's JSX:

```typescript
{showSimilarModal && modalCategoryInfo && modalSourceId && similarResults.length > 0 && (
  <SimilarTransactionsModal
    similarTransactions={similarResults}
    categoryName={modalCategoryInfo.categoryName}
    categoryId={modalCategoryInfo.categoryId}
    categoryType={modalCategoryInfo.categoryType}
    sourceTransactionId={modalSourceId}
    counterpartyName={similarSourceCounterparty}
    onClose={() => {
      setShowSimilarModal(false);
      setSimilarResults([]);
      setModalCategoryInfo(null);
      setModalSourceId(null);
    }}
    onApplied={(count) => {
      setShowSimilarModal(false);
      setSimilarResults([]);
      setModalCategoryInfo(null);
      setModalSourceId(null);
      // TODO: show success toast if the app has a toast system
      // e.g. toast.success(`Applied to ${count} transaction${count !== 1 ? 's' : ''}`)
    }}
  />
)}
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Manual browser test of full flow**

1. Import a bank statement with multiple similar transactions
2. Go to Triage, categorize one transaction, apply pending
3. Similar transactions modal should appear
4. Select some, apply — verify they're categorized
5. Go to TransactionDetail — edit category — modal appears
6. Verify: no modal when accepting AI suggestion
7. Verify: no modal appears if no similar uncategorised transactions exist

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/pages/Triage.tsx
git commit -m "feat(smartBatch): integrate similar transactions modal into Triage page"
```

---

## Task 7: Final Verification & Cleanup

- [ ] **Step 1: Full type-check**

Run: `npx tsc --noEmit`
Expected: No errors across the entire project

- [ ] **Step 2: Verify no regressions in existing categorization flows**

1. Manual categorization (TransactionDetail) — still works without similar modal if no matches
2. Bulk categorization (Transactions page) — does NOT trigger similar modal
3. AI suggestion acceptance — does NOT trigger similar modal
4. Rule-based categorisation on import — unaffected
5. AI categorisation on import — unaffected

- [ ] **Step 3: Commit any fixups**

```bash
git add -A
git commit -m "fix(smartBatch): address integration issues from final verification"
```

(Skip this commit if no fixups needed.)
