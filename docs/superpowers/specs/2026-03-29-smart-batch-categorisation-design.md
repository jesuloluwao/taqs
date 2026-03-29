# Smart Batch Categorisation — Design Spec

When a user manually categorizes a transaction, the system finds similar uncategorised or low-confidence transactions and surfaces them in a modal for batch application. The goal is to significantly reduce the time users spend categorizing transactions.

## Similarity Matching Engine

### Strategy

Two matching strategies run in parallel against eligible transactions (same `entityId`, same `taxYear`, same `direction`):

**Eligible transactions** must satisfy one of:
- `type === 'uncategorised'` with no `categoryId`
- `aiCategoryConfidence` exists AND `aiCategoryConfidence < 0.7`

AND `reviewedByUser !== true`.

#### 1. Exact Description Match

- Normalize: lowercase, trim, collapse whitespace
- Match transactions with identical normalized descriptions

#### 2. Counterparty Extraction Match

Extract the counterparty/merchant name from bank narrations using Nigerian bank patterns:

| Pattern | Example | Extracted |
|---------|---------|-----------|
| `TRF FRM <name>/...` | `TRF FRM JOHN DOE/ACME LTD` | `JOHN DOE` |
| `POS PURCHASE - <merchant> <location>` | `POS PURCHASE - SHOPRITE LEKKI` | `SHOPRITE` |
| `NIP/<processor>/...` | `NIP/PAYSTACK/INV-00234` | `PAYSTACK` |
| `*<merchant>*...` | `*UBER*TRIP-12345` | `UBER` |
| `WEB PURCHASE - <merchant>...` | `WEB PURCHASE - SHOPRITE ONLINE` | `SHOPRITE` |
| `TRF TO <name>/...` | `TRF TO SHOPRITE/PAYMENT` | `SHOPRITE` |

New utility function: `extractCounterparty(description: string): string | null`

This should build on the existing `extractVendorName()` function in `ruleBasedCategoriser.ts` (line ~47), merging its patterns with the additional ones listed above. The two pattern sets should be unified, not duplicated.

#### Counterparty Matching Algorithm

1. Extract counterparty from the **source** transaction's description
2. For each candidate transaction, extract its counterparty using the same function
3. Match if both extracted counterparties are identical (case-insensitive)
4. If counterparty extraction returns `null` for the source, skip counterparty matching entirely (rely on exact description match only)

#### Result Composition

- Deduplicate across both strategies (union, not intersection)
- Sort by date descending
- Cap at 25 results
- Return per transaction: `_id`, `description`, `amount`, `amountNgn`, `date`, `direction`, `aiCategorySuggestion`, `aiCategoryConfidence`

### Match Badge Priority

If a transaction matches both strategies, show "Exact match" (takes priority over "Same merchant").

### New Convex Query

`transactions.findSimilar(transactionId: Id<"transactions">): SimilarTransaction[]`

Takes the ID of the just-categorized transaction, returns the match list. Each result includes a `matchType: 'exact' | 'counterparty'` field for badge display.

**Note:** The query reads the source transaction's *current* (post-update) state to get the new category/type. The source transaction itself is excluded from results since it already has `reviewedByUser: true`.

**Note on rule-categorised transactions:** Transactions categorised by the rule-based engine (which sets `categoryId` and `type` but not `reviewedByUser`) are intentionally excluded — they already have a category assignment and re-categorising them could be wrong. Only truly uncategorised or low-confidence AI transactions are eligible.

## Batch Apply Mutation

### New Convex Mutation

`transactions.applySimilarCategorisation`:

**Arguments:**
- `transactionIds: Id<"transactions">[]` — selected similar transactions
- `categoryId: Id<"categories">` — category to apply
- `type: string` — transaction type (income, business_expense, personal_expense, transfer)
- `sourceTransactionId: Id<"transactions">` — the transaction the user originally categorized

**Logic per selected transaction:**
1. Update `categoryId`, `type`, `reviewedByUser: true`
2. Set `isDeductible` from the category's `isDeductibleDefault`
3. **Eligibility guard:** Before updating, verify the transaction still has `reviewedByUser !== true`. If another session/tab has already reviewed it, skip silently. This prevents conflicts from concurrent categorisation.
4. If transaction had `aiCategorySuggestion`:
   - Resolve the category name from `categoryId` for comparison with the string-based `aiCategorySuggestion`
   - If AI suggestion differs from applied category name: set `userOverrodeAi: true`, insert `aiCategorisationFeedback` record
   - If AI suggestion matches: set `userOverrodeAi: false`

### Why Not Reuse `bulkCategorise`?

The existing `bulkCategorise` mutation does not handle AI feedback recording. A dedicated mutation keeps concerns separate — `bulkCategorise` for manual multi-select from the transaction list, `applySimilarCategorisation` for the smart-match flow with feedback.

## Modal UI

### Trigger Points

The modal triggers after a successful category change via:
1. **TransactionDetail page** — user edits category and saves
2. **CategoryPickerModal** — inline category pick from transaction list
3. **Triage page** — user categorizes a transaction during triage flow

After `transactions.update` succeeds, frontend calls `transactions.findSimilar`. If results are non-empty, show the modal. If empty, no interruption.

### Modal does NOT trigger when:
- User is doing bulk categorization (already in batch mode)
- The categorization is an AI suggestion acceptance (no manual decision to propagate)
- The "Mark as Personal" quick action is used without a specific `categoryId` (since `applySimilarCategorisation` requires a category)

### Layout

```
┌─────────────────────────────────────────────────────┐
│ Apply to Similar Transactions?                   ✕  │
│                                                     │
│ We found 7 similar transactions matching SHOPRITE.  │
│ Apply "Personal — Groceries" to selected?           │
│                                                     │
│ ☑ Select All (7)                      5 selected    │
├─────────────────────────────────────────────────────┤
│ ☑ POS PURCHASE - SHOPRITE LEKKI    -₦12,450        │
│   15 Mar 2026              [Exact match]            │
│                                                     │
│ ☑ POS PURCHASE - SHOPRITE LEKKI     -₦8,200        │
│   02 Mar 2026              [Exact match]            │
│                                                     │
│ ☑ POS PURCHASE - SHOPRITE IKEJA    -₦23,100        │
│   18 Feb 2026              [Same merchant]          │
│                                                     │
│ ☑ WEB PURCHASE - SHOPRITE ONLINE   -₦15,800        │
│   10 Feb 2026              [Same merchant]          │
│                                                     │
│ ☑ TRF TO SHOPRITE/PAYMENT          -₦6,300         │
│   28 Jan 2026              [Same merchant]          │
│                                                     │
│ ☐ POS PURCHASE - SHOPRITE AJAH      -₦4,500        │
│   15 Jan 2026  [Same merchant] [AI: Shopping 42%]   │
│                                                     │
│ ☐ SHOPRITE GIFT CARD PURCHASE      -₦50,000        │
│   05 Jan 2026              [Same merchant]          │
├─────────────────────────────────────────────────────┤
│ [Skip]                    [Apply to 5 Transactions] │
└─────────────────────────────────────────────────────┘
```

### Key UI Elements

- **Pre-selected by default** — all matches checked on mount; user deselects exceptions (faster than opt-in). The wireframe shows a partial selection only to illustrate the deselection UX.
- **Match type badges** — "Exact match" vs "Same merchant" so user understands why each was matched
- **Low-confidence AI indicator** — shows AI's guess + confidence % for transactions that had a low-confidence suggestion
- **Dynamic apply button** — count updates as selections change
- **Skip button** — dismisses without applying, no penalty
- **Scrollable list** — up to 25 items, scrollable within modal

### Implementation Note

The modal must use the app's existing design system (colors, typography, components). The wireframe above defines structure and information hierarchy only, not visual styling.

## Edge Cases

| Case | Behaviour |
|------|-----------|
| No similar transactions found | Don't show modal — no disruption |
| User is in bulk select mode | Skip similar-transactions check |
| Transaction was source of prior match | No special handling; `findSimilar` filters `reviewedByUser !== true` |
| User clicks Skip | Modal dismisses, similar transactions unchanged |
| Mixed directions (e.g., SHOPRITE refund) | `findSimilar` filters by same direction as source |
| Cross-tax-year transactions | Only match within same `taxYear` |

## Performance Considerations

- `findSimilar` is a Convex query filtering by `entityId` + `taxYear` + eligibility, then running string matching on the filtered set
- Counterparty extraction is pure string manipulation — no API calls
- For users with 1000+ transactions, the database-level filters (indexes on `by_entityId_taxYear`) narrow the set before in-memory matching
- No impact on existing categorization flows — this is additive
- **Reactive query during batch apply:** Since `findSimilar` is a Convex query, it will re-execute as transactions are updated by `applySimilarCategorisation`. The frontend should capture the query result into local state before opening the modal and not re-render from the live query during the apply operation. This prevents UI flickering as matched transactions get updated.

## Loading & Error States

- **Loading:** Show a brief spinner in the modal area while `findSimilar` runs (typically <500ms)
- **Apply failure:** If `applySimilarCategorisation` fails, show an error toast. Since the mutation applies each transaction individually with eligibility guards, partial application is possible — the mutation should return a count of successfully applied transactions so the UI can report accurately (e.g., "Applied to 4 of 5 transactions")

## Files to Create/Modify

### New Files
- `convex/lib/counterpartyExtractor.ts` — `extractCounterparty()` utility
- `apps/web/src/components/SimilarTransactionsModal.tsx` — modal component

### Modified Files
- `convex/transactions.ts` — add `findSimilar` query and `applySimilarCategorisation` mutation
- `apps/web/src/pages/TransactionDetail.tsx` — trigger `findSimilar` after save, show modal
- `apps/web/src/pages/Transactions.tsx` — trigger `findSimilar` after inline category change, show modal
- `apps/web/src/pages/Triage.tsx` — trigger `findSimilar` after triage categorization, show modal
