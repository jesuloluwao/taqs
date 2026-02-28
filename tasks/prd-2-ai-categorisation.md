# PRD-2: AI Categorisation Engine

**Product:** TaxEase Nigeria
**Version:** 1.0 — February 2026
**Priority:** P1 — Build in parallel with PRD-1
**Estimated Effort:** 1–2 weeks
**Status:** Draft
**Depends On:** PRD-1 (Transaction Management & Import Pipeline)

---

## 1. Overview

The AI Categorisation Engine is the intelligence layer that makes TaxEase's transaction management usable at scale. Without it, every imported transaction must be manually classified by the user — a tedious process that discourages year-round engagement and renders bulk bank statement imports impractical.

This PRD introduces Claude API–powered automatic classification of financial transactions. When a user imports a bank statement (PDF/CSV), the system parses the transactions (PRD-1) and then passes them through the AI categorisation pipeline before writing them to the database. Each transaction arrives pre-classified with a category suggestion, transaction type, deductibility flag, and a confidence score. High-confidence categorisations (≥ 0.7) are applied automatically. Low-confidence items are left as `uncategorised` and queued for the Categorisation Triage screen, where the user can review AI suggestions and accept, reject, or override them.

The engine also supports re-triggering categorisation on uncategorised transactions — useful when a user skips triage and returns later, or when an initial AI call fails due to rate limiting or API errors.

**This PRD introduces no new screens.** It enhances the Import flow and Categorisation Triage UI defined in PRD-1 with AI-powered suggestions, confidence indicators, and reasoning explanations.

---

## 2. Entities

### 2.1 AI-Specific Fields on `transactions` (extends PRD-1 schema)

The following fields are added to (or refined on) the `transactions` table defined in PRD-1:

| Field | Type | Description |
|---|---|---|
| `aiCategorySuggestion` | `optional<string>` | The category name suggested by Claude before user confirmation |
| `aiTypeSuggestion` | `optional<string>` | The transaction type suggested by Claude (`"income"`, `"business_expense"`, `"personal_expense"`, `"transfer"`) |
| `aiCategoryConfidence` | `optional<number>` | Confidence score from 0.0 to 1.0 |
| `aiReasoning` | `optional<string>` | Short natural-language explanation for why the AI chose this category (e.g., "Monthly recurring charge matching software subscription pattern") |
| `aiCategorisingJobId` | `optional<id<"categorisingJobs">>` | Reference to the batch categorisation job that produced this suggestion |
| `aiCategorisedAt` | `optional<number>` | Unix ms timestamp of when AI categorisation was applied |
| `reviewedByUser` | `boolean` | Whether the user has explicitly confirmed or changed the categorisation (default: `false`) |
| `userOverrodeAi` | `boolean` | Whether the user changed the AI suggestion to something different (default: `false`) |

### 2.2 `categorisingJobs` (new entity)

Tracks batch AI categorisation operations. Separate from `importJobs` because categorisation can be re-triggered independently of imports.

| Field | Type | Description |
|---|---|---|
| `entityId` | `id<"entities">` | Entity whose transactions are being categorised |
| `userId` | `id<"users">` | Initiating user |
| `importJobId` | `optional<id<"importJobs">>` | Linked import job (if triggered as part of import) |
| `status` | `"pending" \| "processing" \| "complete" \| "partial" \| "failed"` | Job lifecycle status |
| `totalTransactions` | `number` | Total transactions submitted for categorisation |
| `totalCategorised` | `number` | Transactions successfully categorised (confidence ≥ threshold) |
| `totalLowConfidence` | `number` | Transactions where AI returned confidence < threshold |
| `totalFailed` | `number` | Transactions where AI returned no result or errored |
| `batchesTotal` | `number` | Number of API batches required (ceil(total / batchSize)) |
| `batchesCompleted` | `number` | Batches successfully processed so far |
| `confidenceThreshold` | `number` | Confidence threshold used (default: 0.7) |
| `modelUsed` | `string` | Claude model identifier used (e.g., `"claude-haiku-4-5-20251001"`) |
| `totalTokensUsed` | `optional<number>` | Total API tokens consumed across all batches |
| `estimatedCostUsd` | `optional<number>` | Estimated API cost in USD |
| `errorMessage` | `optional<string>` | Error detail if status is `"failed"` |
| `startedAt` | `optional<number>` | Unix ms |
| `completedAt` | `optional<number>` | Unix ms |

**Indexes:**
- `by_entityId` on `entityId`
- `by_importJobId` on `importJobId`
- `by_status` on `status`

### 2.3 `aiCategorisationFeedback` (new entity)

Records every instance where a user overrides an AI suggestion, forming the training signal for prompt improvement.

| Field | Type | Description |
|---|---|---|
| `entityId` | `id<"entities">` | Entity context |
| `userId` | `id<"users">` | User who provided feedback |
| `transactionId` | `id<"transactions">` | The transaction that was re-categorised |
| `aiSuggestedCategory` | `string` | What the AI originally suggested |
| `aiSuggestedType` | `string` | Type the AI suggested |
| `aiConfidence` | `number` | AI's confidence for its suggestion |
| `userChosenCategory` | `string` | What the user actually chose |
| `userChosenType` | `string` | Type the user chose |
| `transactionDescription` | `string` | Raw transaction description (denormalised for analysis) |
| `transactionAmount` | `number` | Transaction amount |
| `transactionDirection` | `"credit" \| "debit"` | Credit or debit |

**Indexes:**
- `by_entityId` on `entityId`
- `by_userId` on `userId`
- `by_aiSuggestedCategory` on `aiSuggestedCategory`

---

## 3. User Stories

### US-201: Auto-categorise transactions during import

**As a** freelancer or SME owner
**I want** my imported bank statement transactions to be automatically categorised by AI
**So that** I don't have to manually classify dozens or hundreds of transactions every time I upload a statement

**Trigger:** User confirms an import on the Import Transactions screen (PRD-1). The `transactions.processImport` action is invoked.

**Flow:**
1. User uploads a PDF/CSV bank statement and sees the parsed transaction preview (PRD-1 flow).
2. User taps "Confirm Import".
3. The system creates an `importJobs` record (PRD-1) and a linked `categorisingJobs` record.
4. The `processImport` action parses the file and extracts raw transactions.
5. Parsed transactions are batched into groups of up to 50 and sent to the Claude API with the full category list and Nigerian tax context.
6. Claude returns category suggestions with confidence scores for each transaction.
7. Transactions with confidence ≥ 0.7 are written with the AI-suggested `categoryId`, `type`, and `isDeductible` fields populated. Their `reviewedByUser` is set to `false`.
8. Transactions with confidence < 0.7 are written with `type: "uncategorised"` and the AI suggestion stored in `aiCategorySuggestion` for display during triage.
9. The `categorisingJobs` record is updated to `"complete"` with counts.
10. The UI reactively updates (via Convex live queries) to show the imported transactions with their categories.

**Acceptance Criteria:**
- [ ] Imported transactions arrive in the transaction list with AI-suggested categories pre-applied where confidence ≥ 0.7
- [ ] Low-confidence transactions appear as `uncategorised` with the AI suggestion available for review
- [ ] A `categorisingJobs` record is created and tracked for every categorisation batch
- [ ] The import flow does not block if AI categorisation fails — transactions are still imported as `uncategorised`
- [ ] AI categorisation adds no more than 15 seconds to the import flow for a batch of 50 transactions

---

### US-202: View AI confidence scores on imported transactions

**As a** user reviewing my imported transactions
**I want to** see a confidence score alongside each AI-categorised transaction
**So that** I can quickly identify which categorisations I should double-check

**Trigger:** User opens the Transaction List or Categorisation Triage screen after an AI-powered import.

**Flow:**
1. User navigates to the Transaction List.
2. Each transaction row displays a small confidence badge next to the category label (e.g., "Internet & Data · 94%").
3. Confidence badges are colour-coded: green (≥ 0.9), amber (0.7–0.89), no badge (user-reviewed or manually entered).
4. Uncategorised transactions show the AI suggestion in a muted style: "AI suggests: Software Subscriptions · 62%" with an amber indicator.

**Acceptance Criteria:**
- [ ] Confidence score is displayed on every AI-categorised transaction that has not been reviewed by the user
- [ ] Colour coding correctly reflects the confidence tiers: green (≥ 0.9), amber (0.7–0.89)
- [ ] Uncategorised transactions show the AI suggestion with its sub-threshold confidence score
- [ ] Confidence badges are hidden on manually-entered or user-reviewed transactions
- [ ] Confidence scores are visible in both the Transaction List and Transaction Detail screens

---

### US-203: View AI reasoning for a categorisation

**As a** user reviewing a categorised transaction
**I want to** understand why the AI chose a particular category
**So that** I can make an informed decision about whether the categorisation is correct

**Trigger:** User taps on a confidence badge or an info icon next to an AI-categorised transaction.

**Flow:**
1. User is on the Transaction Detail screen or the Categorisation Triage card.
2. An info icon (ℹ) appears next to the AI-suggested category.
3. User taps the icon.
4. A tooltip or bottom sheet appears showing the AI's reasoning text (e.g., "This ₦15,000 debit to 'NETFLIX.COM' matches a recurring monthly pattern consistent with software/media subscriptions. Classified as a deductible business expense under Internet & Data.").
5. The reasoning also shows the confidence score and the alternative categories the AI considered (if available).

**Acceptance Criteria:**
- [ ] AI reasoning text is stored in the `aiReasoning` field for every AI-categorised transaction
- [ ] Reasoning is accessible via an info icon on the Triage card and Transaction Detail screen
- [ ] Reasoning text is concise — maximum 2 sentences
- [ ] If no reasoning is available (legacy or failed), the info icon is hidden

---

### US-204: Accept an AI-suggested category

**As a** user triaging my imported transactions
**I want to** accept the AI's category suggestion with a single tap
**So that** I can quickly confirm correct categorisations and move to the next transaction

**Trigger:** User taps the "✓ Confirm suggestion" button on the Categorisation Triage card.

**Flow:**
1. User is on the Categorisation Triage screen reviewing an uncategorised transaction.
2. The triage card displays the AI suggestion with confidence (e.g., "Business Expense — Internet/Data · 87%").
3. User taps "✓ Confirm suggestion".
4. The system calls `transactions.update` with the AI-suggested `categoryId`, `type`, and `isDeductible` values.
5. `reviewedByUser` is set to `true`, `userOverrodeAi` is set to `false`.
6. The card animates out and the next uncategorised transaction appears.
7. The progress indicator updates (e.g., "11 of 47 remaining").

**Acceptance Criteria:**
- [ ] Single-tap confirmation applies the AI suggestion and marks the transaction as reviewed
- [ ] The triage card advances to the next uncategorised transaction
- [ ] The progress counter decrements
- [ ] The confirmed transaction's `type` changes from `"uncategorised"` to the AI-suggested type
- [ ] Dashboard uncategorised count updates in real-time

---

### US-205: Reject an AI-suggested category and recategorise manually

**As a** user triaging a transaction where the AI got it wrong
**I want to** reject the suggestion and choose the correct category myself
**So that** my tax records are accurate

**Trigger:** User taps "✎ Change category" on the Categorisation Triage card.

**Flow:**
1. User sees the AI suggestion on the triage card but disagrees.
2. User taps "✎ Change category".
3. A category picker modal opens, showing all categories grouped by type (Income, Business Expenses, Personal, Transfers) with a search bar.
4. User selects the correct category.
5. The system calls `transactions.update` with the user-chosen category.
6. `reviewedByUser` is set to `true`, `userOverrodeAi` is set to `true`.
7. An `aiCategorisationFeedback` record is created capturing the AI suggestion vs. user choice.
8. The triage card advances to the next transaction.

**Acceptance Criteria:**
- [ ] Category picker modal displays all system and user-created categories
- [ ] Selected category overrides the AI suggestion
- [ ] `userOverrodeAi` is set to `true` on the transaction
- [ ] An `aiCategorisationFeedback` record is persisted with both the AI suggestion and user choice
- [ ] The "Mark as Personal" shortcut button (✗) works independently and also records override feedback

---

### US-206: Re-trigger AI categorisation on uncategorised transactions

**As a** user with uncategorised transactions that weren't processed by AI (due to a failure or skipped import)
**I want to** trigger AI categorisation on demand
**So that** I don't have to manually categorise each one

**Trigger:** User taps a "Re-categorise with AI" button on the Transaction List (filtered to uncategorised) or the Triage screen.

**Flow:**
1. User navigates to the Transaction List and filters to "Uncategorised".
2. A banner or button appears: "Auto-categorise X transactions with AI".
3. User taps the button.
4. A confirmation dialog appears: "TaxEase AI will attempt to categorise X uncategorised transactions. This may take a moment."
5. User confirms.
6. The system creates a new `categorisingJobs` record (not linked to any import job).
7. `transactions.autoCategorise` action is scheduled.
8. A progress indicator appears showing batch progress (e.g., "Categorising... 30 of 47").
9. As batches complete, transactions update reactively in the list.
10. On completion, a toast shows the result: "Categorised 42 of 47 transactions. 5 need manual review."

**Acceptance Criteria:**
- [ ] "Re-categorise with AI" button is visible when there are uncategorised transactions
- [ ] Confirmation dialog shows the count of transactions to be processed
- [ ] Progress indicator updates as batches complete
- [ ] Already-reviewed transactions are not re-categorised (only `reviewedByUser: false` and `type: "uncategorised"`)
- [ ] Completion toast summarises results

---

### US-207: Bulk AI categorise uncategorised transactions

**As a** user returning after a long period with many uncategorised transactions
**I want to** run AI categorisation across all my uncategorised transactions at once
**So that** I can get most of them classified without triaging one-by-one

**Trigger:** User taps the "Review Now" banner on the Dashboard (PRD-1), or the "Auto-categorise All" action in the Triage screen header.

**Flow:**
1. User sees the Dashboard banner: "You have 142 transactions that need categorisation."
2. User taps "Review Now" and lands on the Triage screen.
3. Triage screen header shows a secondary action: "Auto-categorise All with AI".
4. User taps it and confirms.
5. A full-screen progress overlay shows: "AI is categorising your transactions..." with a progress bar and batch counter.
6. The `autoCategorise` action processes all uncategorised transactions for the active entity in batches of 50.
7. As each batch completes, the progress bar advances and the remaining count on the triage screen updates.
8. After completion, the overlay dismisses. The triage screen now shows only the remaining low-confidence items that need manual review.
9. A summary card appears: "AI categorised 128 transactions. 14 need your review."

**Acceptance Criteria:**
- [ ] Bulk categorisation processes all uncategorised transactions for the active entity
- [ ] Progress overlay shows batch-level progress
- [ ] Transactions already reviewed by the user are excluded
- [ ] After completion, the triage screen shows only remaining uncategorised items
- [ ] Summary card accurately reports categorised vs. needs-review counts
- [ ] **Cancel behaviour:** Progress overlay includes "Cancel" button (or back gesture). On cancel: overlay dismisses; remaining transactions stay uncategorised; toast "Categorisation cancelled."

---

### US-208: View categorisation accuracy over time

**As a** user who has been correcting AI suggestions
**I want to** see how accurate the AI's categorisations have been
**So that** I can trust the system and understand how it's improving

**Trigger:** User navigates to a "Categorisation Insights" section accessible from the Transaction List filter area or Settings.

**Flow:**
1. User opens the Categorisation Insights view.
2. The view shows:
   - Overall AI accuracy rate: percentage of AI suggestions that users accepted without change.
   - Accuracy by category: which categories the AI gets right most/least often.
   - Override rate: percentage of AI suggestions that were changed by the user.
   - Total transactions categorised by AI vs. manually.
3. Data is computed from `aiCategorisationFeedback` records and transaction `reviewedByUser` / `userOverrodeAi` flags.

**Acceptance Criteria:**
- [ ] Accuracy rate is calculated as: (AI-categorised transactions where `userOverrodeAi === false`) / (total AI-categorised transactions reviewed by user) × 100
- [ ] Category-level accuracy breakdown is displayed
- [ ] Data updates in real-time as users triage more transactions
- [ ] The view is accessible but non-intrusive (not a primary navigation item)
- [ ] **Empty state:** When no AI corrections or feedback exist yet: illustration (chart/graph), headline "No AI insights yet", subtext "As you review and correct AI categorisations, accuracy insights will appear here. Start by triaging uncategorised transactions."
- [ ] Empty state includes CTA: "Go to Categorisation" linking to Triage screen

---

### US-209: Handle AI categorisation failures gracefully

**As a** user whose import triggered an AI categorisation that failed
**I want** the system to handle the failure without losing my imported transactions
**So that** I can still access my data and categorise manually or retry later

**Trigger:** The Claude API call within `processImport` or `autoCategorise` throws an error (network failure, API error, timeout, malformed response).

**Flow:**
1. The `processImport` action attempts to call Claude API.
2. The call fails (5xx error, timeout, invalid JSON response, etc.).
3. The action catches the error and proceeds to write all transactions to the database with `type: "uncategorised"` and no AI fields populated.
4. The `categorisingJobs` record is updated to `"failed"` with the error message.
5. An in-app notification is created: "AI categorisation failed for your recent import. Your transactions have been imported and can be categorised manually or re-tried."
6. The import job itself completes successfully — the failure is isolated to categorisation.
7. A "Retry AI Categorisation" button appears on the import result screen and the Transaction List.

**Acceptance Criteria:**
- [ ] AI failure does not block or roll back the transaction import
- [ ] All transactions are still written to the database as `uncategorised`
- [ ] The `categorisingJobs` record captures the error message
- [ ] A user-facing notification explains the failure and offers retry
- [ ] Retry triggers a new `autoCategorise` action on the affected transactions
- [ ] Partial batch failures are handled: if batch 3 of 5 fails, batches 1–2 results are preserved and batches 3–5 transactions remain `uncategorised`

---

### US-210: Handle rate limiting from Claude API

**As the** system processing a large import
**I want** the AI categorisation pipeline to respect Claude API rate limits
**So that** requests don't get rejected and categorisation completes reliably

**Trigger:** The system sends batches to Claude API and receives a 429 (rate limit) response.

**Flow:**
1. The `processImport` or `autoCategorise` action sends batch N to Claude API.
2. The API returns HTTP 429 with a `retry-after` header.
3. The action pauses for the specified retry-after duration (or a default of 30 seconds if no header).
4. The action retries the failed batch (up to 3 retries per batch).
5. If all retries are exhausted, the batch's transactions are left as `uncategorised` and the action continues with the next batch.
6. The `categorisingJobs` record is updated to `"partial"` if some batches failed, with counts reflecting the outcome.
7. Between successful batches, the action inserts a configurable delay (default: 500ms) to stay within rate limits proactively.

**Acceptance Criteria:**
- [ ] The action respects `retry-after` headers from 429 responses
- [ ] Each batch is retried up to 3 times before being marked failed
- [ ] A configurable inter-batch delay (default 500ms) is applied between API calls
- [ ] Partial completion is supported — some batches succeed, others fail
- [ ] The `categorisingJobs` record accurately reflects partial completion status
- [ ] Total API calls per minute do not exceed the Claude API rate limit (currently 50 RPM for Haiku tier)

---

### US-211: View categorisation progress during import

**As a** user who just uploaded a large bank statement
**I want to** see real-time progress of the AI categorisation
**So that** I know the system is working and can estimate how long it will take

**Trigger:** User confirms a bank statement import that triggers AI categorisation.

**Flow:**
1. User taps "Confirm Import" on the Import Transactions screen.
2. The screen transitions to an import progress view (PRD-1 defines the basic progress UI; this PRD enhances it with AI progress).
3. The progress view shows two phases:
   - **Phase 1 — Parsing:** "Extracting transactions from your statement..." with a spinner. Completes quickly.
   - **Phase 2 — AI Categorisation:** "Classifying your transactions..." with a progress bar showing batch progress (e.g., "Batch 2 of 4 · 50 of 193 transactions").
4. The progress bar updates reactively as `categorisingJobs.batchesCompleted` increments.
5. On completion, the view shows a summary: "193 transactions imported. 178 auto-categorised. 15 need your review."
6. Two CTAs appear: "View Transactions" and "Review Uncategorised".

**Acceptance Criteria:**
- [ ] Progress UI shows distinct parsing and categorisation phases
- [ ] AI categorisation progress updates in real-time via Convex live query on `categorisingJobs`
- [ ] Batch-level progress is visible (not just a spinner)
- [ ] Completion summary shows categorised vs. needs-review counts
- [ ] "Review Uncategorised" CTA navigates directly to the Triage screen filtered to the import batch

---

## 4. UI Specifications

PRD-2 introduces no new screens. It enhances the following PRD-1 screens with AI-specific UI elements.

### 4.1 Import Transactions Screen — AI Progress Enhancement

**Location:** Below the existing import progress indicator (PRD-1 §7.2)

**After user confirms import:**

```
┌─────────────────────────────────────────────┐
│  ✓ Statement parsed · 193 transactions      │
│                                             │
│  🤖 AI Categorisation                       │
│  ████████████░░░░░░░░  Batch 3 of 4        │
│  Classifying transactions...                │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  ✓ 128 categorised                 │    │
│  │  ⏳ 50 in progress                  │    │
│  │  · 15 remaining                    │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

**On completion:**

```
┌─────────────────────────────────────────────┐
│  ✓ Import Complete                          │
│                                             │
│  193 transactions imported                  │
│                                             │
│  🤖 AI categorised 178 transactions         │
│  ⚠️  15 need your review                    │
│                                             │
│  ┌───────────────────┐ ┌─────────────────┐  │
│  │ View Transactions │ │ Review Now  →   │  │
│  └───────────────────┘ └─────────────────┘  │
└─────────────────────────────────────────────┘
```

### 4.2 Categorisation Triage Screen — AI Suggestion Enhancement

**Location:** The existing triage card (PRD-1 §7.4) is enhanced with AI data.

**Triage card with AI suggestion:**

```
┌─────────────────────────────────────────────┐
│  12 of 47 remaining                         │
│  ████████████████████████░░░░░░░░  (74%)    │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  15 Feb 2026                       │    │
│  │  NETFLIX.COM/SUBSCRIPTION          │    │
│  │  ₦15,000.00 · Debit               │    │
│  │  GTBank — 012345XXXX               │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  🤖 AI Suggestion                            │
│  ┌─────────────────────────────────────┐    │
│  │  📦 Software Subscriptions          │    │
│  │  Business Expense · Deductible     │    │
│  │  Confidence: ████████░░ 82%     ℹ  │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌──────┐  ┌────────────┐  ┌──────────┐    │
│  │  ✓   │  │  ✎ Change  │  │ ✗ Pers.  │    │
│  │Accept│  │  Category  │  │          │    │
│  └──────┘  └────────────┘  └──────────┘    │
│                                             │
│            Skip for now                     │
└─────────────────────────────────────────────┘
```

**Confidence badge colour coding:**
- `≥ 0.9` → `success` green badge with "High confidence"
- `0.7 – 0.89` → `warning` amber badge with percentage
- `< 0.7` → `neutral-500` grey badge with "Low confidence" (these are the ones in triage)

**AI Reasoning tooltip (on ℹ tap):**

```
┌─────────────────────────────────────────────┐
│  Why did AI choose this?                    │
│                                             │
│  "Monthly recurring ₦15,000 debit to       │
│  NETFLIX.COM matches a digital media/       │
│  software subscription pattern. Classified  │
│  as deductible business expense."           │
│                                             │
│  Alternatives considered:                   │
│  · Personal — Entertainment (18%)           │
│  · Internet & Data (4%)                     │
│                                             │
│                              [ Got it ]     │
└─────────────────────────────────────────────┘
```

### 4.3 Transaction List — AI Indicators

**Enhancement to each transaction row (PRD-1 §7.1):**

For AI-categorised, not-yet-reviewed transactions, the category label gets a small confidence indicator appended:

```
┌─────────────────────────────────────────────┐
│ 🟢 15 Feb  NETFLIX.COM/SUB...              │
│            Software Subscriptions · 94%  🤖 │
│                                  ₦15,000.00 │
├─────────────────────────────────────────────┤
│ 🟡 14 Feb  POS PURCHASE SHOPRITE           │
│            AI: Groceries · 61%           🤖 │
│                                  ₦23,450.00 │
├─────────────────────────────────────────────┤
│ 🟢 13 Feb  TRANSFER FROM CHIDI O.          │
│            Freelance Income  ✓              │
│                                 ₦350,000.00 │
└─────────────────────────────────────────────┘
```

- 🤖 icon indicates AI-categorised but not yet user-reviewed
- ✓ indicates user-reviewed
- No indicator for manually-entered transactions

### 4.4 Transaction Detail Screen — AI Section

**New section added below the category selector on Transaction Detail (PRD-1 §7.3):**

```
┌─────────────────────────────────────────────┐
│  🤖 AI Categorisation                        │
│  ┌─────────────────────────────────────┐    │
│  │  Suggested: Software Subscriptions  │    │
│  │  Confidence: 94%                    │    │
│  │  "Monthly recurring charge to       │    │
│  │   NETFLIX.COM matches software      │    │
│  │   subscription pattern."            │    │
│  │  Categorised: 15 Feb 2026, 14:32   │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

This section is read-only and only appears when `aiCategorySuggestion` is populated.

### 4.5 Uncategorised Transactions Banner — AI Action

**Enhancement to the Dashboard uncategorised banner (PRD-1 §6.3):**

When uncategorised transactions exist and have not been AI-processed:

```
┌─────────────────────────────────────────────┐
│ ⚠️  47 transactions need categorisation      │
│                                             │
│  ┌─────────────────┐ ┌───────────────────┐  │
│  │ 🤖 Auto-categorise │ │ Review Manually │  │
│  └─────────────────┘ └───────────────────┘  │
└─────────────────────────────────────────────┘
```

### 4.6 Triage Screen Header — Bulk AI Action

**New header action on the Triage screen:**

```
┌─────────────────────────────────────────────┐
│  ← Categorisation Triage    🤖 Auto-categorise All │
└─────────────────────────────────────────────┘
```

Tapping "Auto-categorise All" triggers the US-207 bulk flow.

---

## 5. Functional Requirements

### Claude API Integration

**FR-001:** The system shall use the Anthropic Claude API (model: `claude-haiku-4-5-20251001`) for transaction categorisation. The model is chosen for cost-efficiency on bulk classification tasks.

**FR-002:** The system shall construct a categorisation prompt containing: (a) the full list of system categories with their IDs, names, types, and deductibility flags; (b) Nigerian tax context explaining the NTA 2025 deduction rules; (c) a batch of up to 50 transaction records with date, description, amount, direction, and currency; (d) instructions to return a JSON array.

**FR-003:** The Claude API prompt shall instruct the model to return for each transaction: `transactionId`, `categoryName`, `categoryId`, `type` (income/business_expense/personal_expense/transfer), `isDeductible`, `confidence` (0.0–1.0), and `reasoning` (1–2 sentence explanation).

**FR-004:** The system shall validate the Claude API response against the expected JSON schema. Malformed responses shall be treated as a failed batch, and affected transactions shall remain uncategorised.

### Confidence Scoring

**FR-005:** The confidence threshold for auto-applying a category is **0.7** (70%). This threshold shall be stored in the `categorisingJobs` record and configurable per entity in future iterations.

**FR-006:** Transactions with AI confidence ≥ 0.7 shall have their `categoryId`, `type`, `isDeductible`, and `deductiblePercent` (defaulting to 100 for deductible items) auto-populated from the AI response.

**FR-007:** Transactions with AI confidence < 0.7 shall be written with `type: "uncategorised"` and `categoryId: null`. The AI suggestion, confidence, and reasoning shall still be stored in `aiCategorySuggestion`, `aiCategoryConfidence`, and `aiReasoning` for display during triage.

### Rate Limiting & Retry Logic

**FR-008:** The system shall send no more than one Claude API request per second (inter-batch delay of at least 500ms, configurable via environment variable `AI_BATCH_DELAY_MS`).

**FR-009:** On receiving an HTTP 429 response from Claude, the system shall wait for the duration specified in the `retry-after` header (or 30 seconds if absent) before retrying. Each batch shall be retried up to 3 times.

**FR-010:** On receiving an HTTP 5xx response from Claude, the system shall retry after an exponential backoff: 2s, 4s, 8s. Each batch shall be retried up to 3 times.

**FR-011:** If all retries for a batch are exhausted, the batch's transactions shall be left as `uncategorised`. The action shall proceed to the next batch rather than aborting the entire job.

**FR-012:** The system shall enforce a maximum of 5 concurrent `categorisingJobs` per user to prevent abuse.

### Batch Processing Pipeline

**FR-013:** Transactions shall be batched into groups of 50 for Claude API calls. The batch size shall be configurable via environment variable `AI_BATCH_SIZE`.

**FR-014:** The `transactions.processImport` action shall orchestrate categorisation as follows: parse file → create `categorisingJobs` record → batch transactions → call Claude API for each batch → call `transactions.batchUpsert` with categorised results → update `categorisingJobs` status.

**FR-015:** The `transactions.autoCategorise` action shall accept an `entityId` and optional `transactionIds` array. If `transactionIds` is omitted, it processes all transactions for the entity where `type === "uncategorised"` and `reviewedByUser === false`.

**FR-016:** During processing, the `categorisingJobs.batchesCompleted` field shall be updated after each batch via a mutation call, enabling real-time progress tracking on the client.

### Learning from User Corrections

**FR-017:** When a user overrides an AI suggestion (changes the category on a previously AI-categorised transaction), the system shall create an `aiCategorisationFeedback` record capturing the AI suggestion and the user's choice.

**FR-018:** The categorisation prompt shall include up to 20 recent user corrections for the entity as few-shot examples, formatted as: "Transaction: [description] → User corrected AI suggestion of [X] to [Y]". This provides personalised learning per entity.

**FR-019:** The system shall compute and expose categorisation accuracy metrics: overall accuracy rate, per-category accuracy, and override rate, derived from `aiCategorisationFeedback` records and transaction flags.

### Fallback When AI Is Unavailable

**FR-020:** If the `ANTHROPIC_API_KEY` environment variable is not set, the system shall skip AI categorisation entirely. All imported transactions shall be written as `uncategorised`. No error is shown to the user — the AI features simply don't appear in the UI.

**FR-021:** If the Claude API is unreachable for more than 60 seconds during an import, the system shall abort categorisation (not the import), write all transactions as `uncategorised`, and create a user notification explaining the situation.

**FR-022:** The system shall implement a circuit breaker for Claude API calls: if 3 consecutive API calls fail within a 5-minute window, subsequent categorisation requests are automatically skipped for 10 minutes, and transactions are written as `uncategorised`. The `categorisingJobs` record shall note the circuit breaker activation.

---

## 6. API Requirements

### Convex Actions

| Function | Type | Description |
|---|---|---|
| `transactions.processImport` | Action | **Enhanced (PRD-1 → PRD-2).** After parsing the uploaded file, batches transactions and sends them to Claude API for categorisation. Calls `transactions.batchUpsert` with categorised results. Creates and updates `categorisingJobs` record. |
| `transactions.autoCategorise` | Action | **New.** Accepts `{ entityId, transactionIds? }`. Fetches uncategorised transactions, batches them, calls Claude API, writes results via mutation. Creates `categorisingJobs` record. |
| `ai.categoriseBatch` | Action (internal) | **New.** Low-level action that sends a single batch (≤ 50 transactions) to Claude API and returns the parsed response. Handles retries, rate limiting, and response validation. Called by both `processImport` and `autoCategorise`. |

### Convex Mutations

| Function | Type | Description |
|---|---|---|
| `transactions.applyAiCategorisation` | Mutation | **New.** Accepts an array of `{ transactionId, categoryId, type, isDeductible, confidence, reasoning }`. Updates each transaction's AI fields and, if confidence ≥ threshold, sets the category/type. |
| `transactions.confirmAiSuggestion` | Mutation | **New.** Accepts `{ transactionId }`. Sets `reviewedByUser: true`, `userOverrodeAi: false` on the transaction. Used when user taps "✓ Accept" in triage. |
| `transactions.overrideAiSuggestion` | Mutation | **New.** Accepts `{ transactionId, categoryId, type, isDeductible }`. Applies user's choice, sets `reviewedByUser: true`, `userOverrodeAi: true`, creates `aiCategorisationFeedback` record. |
| `categorisingJobs.create` | Mutation (internal) | **New.** Creates a `categorisingJobs` document with initial counts. |
| `categorisingJobs.updateProgress` | Mutation (internal) | **New.** Increments `batchesCompleted` and updates categorised/lowConfidence/failed counts. |
| `categorisingJobs.complete` | Mutation (internal) | **New.** Sets status to `"complete"` or `"partial"`, records `completedAt`, token usage, and cost. |

### Convex Queries

| Function | Type | Description |
|---|---|---|
| `categorisingJobs.get` | Query | **New.** Returns a single `categorisingJobs` document by ID. Used by the client to subscribe to progress updates during import. |
| `categorisingJobs.getByImportJob` | Query | **New.** Returns the `categorisingJobs` document linked to a given `importJobId`. |
| `transactions.getAiStats` | Query | **New.** Returns categorisation accuracy metrics for an entity: total AI-categorised, total overridden, accuracy rate, per-category breakdown. Computed from `aiCategorisationFeedback` and transaction flags. |

---

## 7. Data Models

### 7.1 AI Fields on Transaction (extends PRD-1 `transactions` table)

```typescript
// Additional fields on the transactions table (convex/schema.ts)
{
  // ... all PRD-1 fields ...

  aiCategorySuggestion: v.optional(v.string()),
  aiTypeSuggestion: v.optional(
    v.union(
      v.literal("income"),
      v.literal("business_expense"),
      v.literal("personal_expense"),
      v.literal("transfer")
    )
  ),
  aiCategoryConfidence: v.optional(v.number()), // 0.0 – 1.0
  aiReasoning: v.optional(v.string()),
  aiCategorisingJobId: v.optional(v.id("categorisingJobs")),
  aiCategorisedAt: v.optional(v.number()), // Unix ms
  reviewedByUser: v.boolean(), // default: false
  userOverrodeAi: v.boolean(), // default: false
}
```

### 7.2 `categorisingJobs` Table

```typescript
// convex/schema.ts
categorisingJobs: defineTable({
  entityId: v.id("entities"),
  userId: v.id("users"),
  importJobId: v.optional(v.id("importJobs")),
  status: v.union(
    v.literal("pending"),
    v.literal("processing"),
    v.literal("complete"),
    v.literal("partial"),
    v.literal("failed")
  ),
  totalTransactions: v.number(),
  totalCategorised: v.number(),
  totalLowConfidence: v.number(),
  totalFailed: v.number(),
  batchesTotal: v.number(),
  batchesCompleted: v.number(),
  confidenceThreshold: v.number(),
  modelUsed: v.string(),
  totalTokensUsed: v.optional(v.number()),
  estimatedCostUsd: v.optional(v.number()),
  errorMessage: v.optional(v.string()),
  startedAt: v.optional(v.number()),
  completedAt: v.optional(v.number()),
})
  .index("by_entityId", ["entityId"])
  .index("by_importJobId", ["importJobId"])
  .index("by_status", ["status"]),
```

### 7.3 `aiCategorisationFeedback` Table

```typescript
// convex/schema.ts
aiCategorisationFeedback: defineTable({
  entityId: v.id("entities"),
  userId: v.id("users"),
  transactionId: v.id("transactions"),
  aiSuggestedCategory: v.string(),
  aiSuggestedType: v.string(),
  aiConfidence: v.number(),
  userChosenCategory: v.string(),
  userChosenType: v.string(),
  transactionDescription: v.string(),
  transactionAmount: v.number(),
  transactionDirection: v.union(v.literal("credit"), v.literal("debit")),
})
  .index("by_entityId", ["entityId"])
  .index("by_userId", ["userId"]),
```

### 7.4 Claude API Request/Response Types

```typescript
// convex/lib/ai/types.ts

interface AiCategorisationRequest {
  categories: {
    id: string;
    name: string;
    type: "income" | "business_expense" | "personal_expense" | "transfer";
    isDeductible: boolean;
  }[];
  transactions: {
    id: string;
    date: string; // ISO 8601
    description: string;
    amount: number;
    direction: "credit" | "debit";
    currency: string;
  }[];
  userCorrections?: {
    description: string;
    aiSuggested: string;
    userChose: string;
  }[];
}

interface AiCategorisationResponseItem {
  transactionId: string;
  categoryId: string;
  categoryName: string;
  type: "income" | "business_expense" | "personal_expense" | "transfer";
  isDeductible: boolean;
  confidence: number; // 0.0 – 1.0
  reasoning: string;
}

type AiCategorisationResponse = AiCategorisationResponseItem[];
```

### 7.5 Prompt Template

```typescript
// convex/lib/ai/prompt.ts

const SYSTEM_PROMPT = `You are a Nigerian tax categorisation assistant for TaxEase Nigeria.
Your job is to classify financial transactions into the correct categories for tax purposes
under the Nigeria Tax Act (NTA) 2025.

Key context:
- Freelancers and SMEs in Nigeria can deduct legitimate business expenses from taxable income.
- Deductible business expenses include: internet/data, electricity, software subscriptions,
  equipment, professional development, workspace rent, transport, marketing, and bank charges.
- Personal expenses (groceries, entertainment, personal shopping) are NOT deductible.
- Credits (money in) are typically income unless they are transfers between own accounts,
  loan disbursements, refunds, or reimbursements.
- Debits (money out) are typically expenses — classify as business or personal based on
  the description and amount patterns.

For each transaction, provide:
1. The most appropriate category from the provided list
2. The transaction type (income, business_expense, personal_expense, transfer)
3. Whether it is tax-deductible
4. A confidence score from 0.0 to 1.0
5. A brief reasoning (1-2 sentences max)

Return ONLY valid JSON matching the specified schema. No markdown, no explanation outside the JSON.`;

function buildUserPrompt(request: AiCategorisationRequest): string {
  let prompt = `## Available Categories\n${JSON.stringify(request.categories, null, 2)}\n\n`;

  if (request.userCorrections?.length) {
    prompt += `## Past Corrections (learn from these)\n`;
    for (const correction of request.userCorrections) {
      prompt += `- "${correction.description}" → AI suggested "${correction.aiSuggested}", `;
      prompt += `user corrected to "${correction.userChose}"\n`;
    }
    prompt += `\n`;
  }

  prompt += `## Transactions to Classify\n${JSON.stringify(request.transactions, null, 2)}\n\n`;
  prompt += `Return a JSON array of objects with fields: transactionId, categoryId, categoryName, type, isDeductible, confidence, reasoning.`;

  return prompt;
}
```

---

## 8. Non-Goals (Out of Scope)

The following are explicitly **not** part of PRD-2:

| Item | Reason |
|---|---|
| **Custom ML model training** | V1 uses Claude API with prompt engineering and few-shot learning from user corrections. A fine-tuned or custom model is a future optimisation. |
| **Real-time streaming categorisation** | Categorisation runs as a batch process, not per-keystroke or real-time as transactions arrive. Streaming would add complexity without meaningful UX benefit. |
| **Offline categorisation** | AI categorisation requires network access to call Claude API. Offline imports write transactions as `uncategorised` for later AI processing. |
| **Multi-model fallback** | V1 uses Claude Haiku only. Falling back to GPT-4 or another model on Claude failure is deferred to a future iteration. |
| **User-created categorisation rules** | e.g., "Always categorise NETFLIX as Software Subscriptions". Rule-based overrides are a future feature. For now, the AI learns from corrections via few-shot prompting. |
| **Invoice-aware categorisation** | The AI does not cross-reference invoices when categorising. Invoice-transaction matching is handled separately in PRD-1/PRD-4. |
| **Categorisation of manually-entered transactions** | Manually-entered transactions have a user-chosen category at creation time. AI categorisation only targets imported or uncategorised transactions. |
| **Admin dashboard for AI monitoring** | Operational monitoring of AI cost, accuracy, and usage is out of scope for the user-facing product. Developer monitoring uses Convex logs and the `categorisingJobs` table directly. |

---

## 9. Success Metrics

| Metric | Definition | Target (3-month) |
|---|---|---|
| **AI categorisation accuracy** | % of AI-categorised transactions accepted by users without override (`userOverrodeAi === false` among reviewed transactions) | ≥ 80% |
| **User override rate** | % of AI-categorised transactions where user changed the category | ≤ 20% |
| **Triage time per transaction** | Average time between triage card display and user action (accept/change/skip) | < 5 seconds |
| **Time saved vs. manual** | Difference between avg. time to categorise an import batch with AI vs. without | ≥ 60% reduction |
| **Auto-categorisation coverage** | % of imported transactions that receive a high-confidence (≥ 0.7) AI categorisation | ≥ 70% |
| **API cost per transaction** | Average Claude API cost per transaction categorised | < $0.001 (₦1.6 at current rates) |
| **Categorisation latency** | Time from import confirmation to all transactions being AI-categorised | < 30 seconds for 100 transactions |
| **AI failure rate** | % of categorisation jobs that fail or partially fail | < 5% |
| **Re-categorisation usage** | % of users who trigger the "Re-categorise with AI" action at least once | Tracked (no target — informational) |
| **Accuracy improvement over time** | Change in accuracy rate month-over-month as few-shot corrections accumulate | Positive trend |

### Measurement Approach

- **Accuracy and override rate** are computed from the `aiCategorisationFeedback` table and `transactions.reviewedByUser` / `userOverrodeAi` flags.
- **Triage time** is measured client-side as the delta between triage card render and user action, logged as an analytics event.
- **API cost** is estimated from `categorisingJobs.totalTokensUsed` using Anthropic's published pricing.
- **Categorisation latency** is measured as the delta between `categorisingJobs.startedAt` and `categorisingJobs.completedAt`.

---

## 10. Open Questions

| # | Question | Impact | Proposed Resolution |
|---|---|---|---|
| 1 | **Should the confidence threshold (0.7) be user-configurable?** Some power users may prefer a higher threshold (more items in triage, fewer errors) while others want minimal triage. | UX complexity vs. user control | Start with a fixed 0.7 threshold. Add a setting in a future iteration if override rates vary significantly across users. |
| 2 | **How many few-shot corrections should we include in the prompt?** More corrections improve accuracy but increase token cost and latency. | Cost / accuracy trade-off | Start with 20 most recent corrections per entity. Monitor token usage and accuracy, adjust if needed. |
| 3 | **Should we cache Claude responses for identical transaction descriptions?** If a user imports the same statement twice (e.g. re-import after error), identical descriptions could hit a cache. | Cost reduction vs. freshness | Implement deduplication at the import level (PRD-1). If a transaction is already categorised, skip it. No separate AI response cache needed. |
| 4 | **What happens when Claude's category suggestion doesn't match any system category?** The AI might hallucinate a category name not in our list. | Data integrity | Validate each response item's `categoryId` against the system category list. Treat unmatched items as confidence 0 (uncategorised). |
| 5 | **Should we batch across entities or strictly per-entity?** A user with two entities importing simultaneously could have two concurrent categorisation jobs. | Concurrency / rate limiting | Strictly per-entity. Each entity gets its own `categorisingJobs` record. The per-user concurrency limit (5 jobs) prevents abuse across entities. |
| 6 | **How do we handle the Claude API deprecation of `claude-haiku-4-5-20251001`?** Anthropic may deprecate the model. | Operational continuity | Store `modelUsed` in `categorisingJobs`. Make the model ID an environment variable (`AI_MODEL_ID`) so it can be updated without a code deploy. |
| 7 | **Should the AI consider transaction amount patterns (e.g., recurring same-amount debits)?** Pattern detection could improve accuracy for subscriptions. | Accuracy improvement | Include the most recent 3 months of the entity's categorised transactions as context in the prompt. This is a V2 enhancement — monitor accuracy first. |
| 8 | **What is the cost ceiling per user per month for AI categorisation?** Unbounded usage could be expensive. | Budget / sustainability | Estimate: 500 transactions/month × $0.001/transaction = $0.50/user/month. Set a soft cap of 2,000 AI-categorised transactions per entity per month. Alert the user when approaching the cap. |

---

*End of PRD-2: AI Categorisation Engine — v1.0*
