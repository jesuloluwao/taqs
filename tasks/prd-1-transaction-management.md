# PRD-1: Transaction Management & Import Pipeline

**TaxEase Nigeria**

**Version:** 1.0 · February 2026  
**Priority:** P0 — Build Second  
**Depends On:** PRD-0 (Auth, Onboarding & Entity Setup)  
**Estimated Effort:** 3–4 weeks

---

## Table of Contents

1. [Overview](#1-overview)
2. [Entities (TypeScript Interfaces)](#2-entities-typescript-interfaces)
3. [User Stories](#3-user-stories)
4. [UI Specifications](#4-ui-specifications)
5. [Functional Requirements](#5-functional-requirements)
6. [API Requirements](#6-api-requirements)
7. [Data Models](#7-data-models)
8. [Non-Goals](#8-non-goals)
9. [Success Metrics](#9-success-metrics)
10. [Open Questions](#10-open-questions)

---

## 1. Overview

PRD-1 delivers the **data backbone** of TaxEase Nigeria: the ability to import, view, categorise, and manage financial transactions. Transactions are the raw material for tax calculations, dashboards, reports, and filing. This PRD is the most depended-upon layer of the application.

### 1.1 Scope

| Component | In Scope |
|-----------|----------|
| **Transaction List** | Paginated list with filter, sort, search, empty state |
| **Import Transactions** | PDF/CSV upload, manual entry, import progress, review results |
| **Transaction Detail/Edit** | View and edit single transaction with all tax fields |
| **Categorisation Triage** | Card-swipe UI for rapid review of uncategorised transactions |
| **Categories** | User CRUD for custom categories; system categories from PRD-0 |
| **Connected Accounts** | View list, add account (upload-only in v1) |
| **Import Pipeline** | `initiateImport` → `processImport` action → `batchUpsert` with dedup |

### 1.2 What It Delivers

A user can:

1. Upload a bank statement (PDF or CSV), see parsed transactions, and import them into their ledger  
2. Manually add transactions (date, description, amount, currency, category)  
3. View a filterable, sortable, searchable list of all transactions  
4. Review and categorise uncategorised transactions via the triage UI  
5. Edit any transaction (category, deductible %, WHT amount, notes, etc.)  
6. Bulk-select transactions for bulk categorise or bulk delete  
7. Create, edit, and delete custom categories  
8. View and add connected accounts (statement upload source only in v1)

### 1.3 Dependencies

- **PRD-0** must be complete: users, entities, categories seed data, onboarding  
- Transaction schema must include all tax-relevant fields (`whtDeducted`, `deductiblePercent`, `amountNgn`, etc.) so downstream PRDs (Tax Engine, Filing) can consume the data without schema changes

### 1.4 Key Design Decisions

- **Transaction schema** is the single most important design decision; every downstream PRD reads from it  
- **Import pipeline** is source-agnostic so PRD-8 (Bank Linking) can feed the same `batchUpsert` path later  
- **Connected accounts** in v1 support `statement_upload` and `manual` only — no OAuth/live linking  
- **AI categorisation** is out of scope (PRD-2); transactions arrive uncategorised or with rule-based suggestions only

---

## 2. Entities (TypeScript Interfaces)

These interfaces are derived from the Backend Spec schema (Convex validators). They define the canonical shapes consumed by the frontend and backend.

### 2.1 Transaction

```typescript
interface Transaction {
  _id: Id<"transactions">;
  _creationTime: number;
  entityId: Id<"entities">;
  userId: Id<"users">;
  connectedAccountId?: Id<"connectedAccounts">;
  importJobId?: Id<"importJobs">;
  date: number;                    // Unix ms, date precision
  description: string;
  enrichedDescription?: string;
  amount: number;                  // Absolute value (positive)
  currency: string;                // ISO 4217
  amountNgn: number;               // Naira equivalent at date of transaction
  fxRate?: number;                 // CBN rate used
  direction: "credit" | "debit";
  type: "income" | "business_expense" | "personal_expense" | "transfer" | "uncategorised";
  categoryId?: Id<"categories">;
  isDeductible: boolean;
  deductiblePercent: number;       // 0–100, default 100
  whtDeducted?: number;            // WHT amount (NGN)
  whtRate?: number;                // e.g. 5, 10
  invoiceId?: Id<"invoices">;
  notes?: string;
  externalRef?: string;
  isDuplicate: boolean;
  taxYear: number;
  aiCategoryConfidence?: number;   // 0–1 (PRD-2)
  aiCategorySuggestion?: string;
  reviewedByUser: boolean;
}
```

### 2.2 ImportJob

```typescript
interface ImportJob {
  _id: Id<"importJobs">;
  _creationTime: number;
  entityId: Id<"entities">;
  userId: Id<"users">;
  connectedAccountId?: Id<"connectedAccounts">;
  source: "pdf" | "csv" | "bank_api" | "paystack" | "flutterwave" | "manual";
  status: "pending" | "processing" | "complete" | "failed";
  storageId?: string;
  totalParsed?: number;
  totalImported?: number;
  duplicatesSkipped?: number;
  errorMessage?: string;
  startedAt?: number;
  completedAt?: number;
}
```

### 2.3 ConnectedAccount

```typescript
interface ConnectedAccount {
  _id: Id<"connectedAccounts">;
  _creationTime: number;
  entityId: Id<"entities">;
  userId: Id<"users">;
  provider: "gtbank" | "zenith" | "access" | "paystack" | "flutterwave" | "moniepoint" | "opay" | "payoneer" | "wise" | "manual" | "statement_upload";
  providerAccountId?: string;
  accountName: string;
  currency: string;
  accessToken?: string;            // v1: unused for upload-only
  refreshToken?: string;
  tokenExpiresAt?: number;
  lastSyncedAt?: number;
  status: "active" | "error" | "disconnected";
  errorMessage?: string;
}
```

### 2.4 Category

```typescript
interface Category {
  _id: Id<"categories">;
  _creationTime: number;
  name: string;
  type: "income" | "business_expense" | "personal_expense" | "transfer";
  isDeductibleDefault: boolean;
  ntaReference?: string;
  isSystem: boolean;
  userId?: Id<"users">;            // Set only for user-created
  icon?: string;
  color?: string;
}
```

---

## 3. User Stories

### 3.1 Transaction List & Navigation

#### US-101: View transaction list with filter, sort, search, and pagination

**As a** freelancer  
**I want** to see all my transactions in a filterable, sortable list  
**So that** I can quickly find specific transactions and understand my financial activity.

**Trigger:** User navigates to Transactions from side drawer or taps "View All Transactions" from Dashboard.

**Flow:**
1. User lands on Transaction List screen
2. Transactions load paginated (e.g. 25 per page) for the active entity and tax year
3. User can apply filters: All | Income | Expenses | Uncategorised | This Month | This Quarter | Custom Range
4. User can sort by date (default), amount, or category
5. User can search by description, amount, or category name
6. List shows section headers by month (e.g. "February 2026")

**Acceptance Criteria:**
- [ ] List displays transactions grouped by month
- [ ] Each row shows: date, category icon/colour, description (truncated), category label, amount (green for income, neutral for expense)
- [ ] Filters apply correctly and persist during session
- [ ] Sort options work and persist during session
- [ ] Search is full-text across description, amount, category
- [ ] Pagination loads more transactions on scroll or "Load more"
- [ ] Foreign currency transactions show currency flag alongside amount

---

#### US-102: View transaction list empty state

**As a** new user  
**I want** to see a helpful empty state when I have no transactions  
**So that** I know the next step is to import a bank statement.

**Trigger:** User has zero transactions for the active entity.

**Flow:**
1. User lands on Transaction List
2. Empty state displays: illustration, "No transactions yet. Import a bank statement to get started.", and "Import Now" CTA
3. CTA navigates to Import Transactions screen

**Acceptance Criteria:**
- [ ] Empty state appears when transaction count is 0
- [ ] "Import Now" navigates to Import Transactions

---

### 3.2 Transaction Detail & Edit

#### US-103: View transaction detail

**As a** user  
**I want** to tap a transaction and see its full details  
**So that** I can verify the information and make edits if needed.

**Trigger:** User taps a transaction row in the Transaction List.

**Flow:**
1. User taps transaction
2. Transaction Detail screen opens with all fields visible
3. Fields shown: date, time, description, amount, currency, naira equivalent (if foreign), category, type, tax deductible, deductible %, WHT amount, notes, source account, associated invoice (if any)

**Acceptance Criteria:**
- [ ] All transaction fields are displayed
- [ ] Naira equivalent shown for foreign currency transactions
- [ ] Source account name displayed when available
- [ ] Edit capability accessible from this screen

---

#### US-104: Edit transaction

**As a** user  
**I want** to edit a transaction's details  
**So that** I can correct mistakes, add tax-relevant information, or improve categorisation.

**Trigger:** User taps "Edit" or inline edit on Transaction Detail screen.

**Flow:**
1. User edits one or more fields: description, category, type, isDeductible, deductiblePercent, whtDeducted, notes
2. User taps "Save Changes"
3. Changes persist; user returns to detail view or list
4. Success toast: "Transaction updated"

**Acceptance Criteria:**
- [ ] Editable fields: description, category (dropdown), type (income/expense/personal/transfer), isDeductible, deductiblePercent (0–100), whtDeducted, notes
- [ ] Save persists changes via `transactions.update`
- [ ] Validation: deductiblePercent must be 0–100
- [ ] Cancel or back discards unsaved changes with confirmation if dirty

---

#### US-105: Mark transaction as personal

**As a** user  
**I want** to reclassify a transaction as personal with one tap  
**So that** it is excluded from tax calculations without drilling into edit.

**Trigger:** User taps "Mark as Personal" on Transaction Detail screen.

**Flow:**
1. User taps "Mark as Personal"
2. Transaction type changes to personal_expense, isDeductible = false, category cleared or set to personal
3. Success toast: "Marked as personal"
4. UI updates immediately

**Acceptance Criteria:**
- [ ] One-tap reclassification to personal
- [ ] Transaction excluded from tax calculations
- [ ] Change persists immediately

---

#### US-106: Add WHT amount to transaction

**As a** freelancer  
**I want** to record when a client has withheld tax at source  
**So that** I can claim the WHT credit against my final tax liability.

**Trigger:** User edits transaction (income) and enters WHT amount.

**Flow:**
1. User edits an income transaction
2. User enters `whtDeducted` (NGN) and optionally `whtRate` (%)
3. User saves
4. WHT is stored and available for tax engine

**Acceptance Criteria:**
- [ ] `whtDeducted` and `whtRate` fields editable for income transactions
- [ ] Values persisted and used by tax engine (PRD-3)

---

#### US-107: Set deductible percentage (split transaction)

**As a** user  
**I want** to split a transaction between business and personal (e.g. 60% deductible, 40% personal)  
**So that** mixed-purpose expenses are correctly treated for tax.

**Trigger:** User edits transaction and sets deductiblePercent.

**Flow:**
1. User edits an expense transaction
2. User sets `deductiblePercent` (e.g. 60)
3. User saves
4. Tax engine uses 60% of amount as deductible

**Acceptance Criteria:**
- [ ] `deductiblePercent` field (0–100) editable for expense transactions
- [ ] Default 100 for fully business, 0 for fully personal
- [ ] Partial splits (e.g. 60%) supported

---

#### US-108: Add notes to transaction

**As a** user  
**I want** to add free-text notes to a transaction  
**So that** I have context for audit defence and future reference.

**Trigger:** User edits transaction and adds notes.

**Flow:**
1. User edits transaction
2. User enters notes in free-text field
3. User saves
4. Notes stored and displayed on detail view

**Acceptance Criteria:**
- [ ] Notes field supports multi-line text
- [ ] Notes displayed on Transaction Detail
- [ ] Notes included in exports (PRD-7)

---

#### US-109: Delete single transaction

**As a** user  
**I want** to delete a transaction I added by mistake  
**So that** my records are accurate.

**Trigger:** User taps "Delete Transaction" on Transaction Detail screen.

**Flow:**
1. User taps "Delete Transaction"
2. Confirmation dialog: "Are you sure? This cannot be undone."
3. User confirms
4. Transaction removed from database
5. User returned to list; success toast

**Acceptance Criteria:**
- [ ] Confirmation dialog before delete
- [ ] Delete is permanent
- [ ] List refreshes; tax summary updates

---

### 3.3 Import — CSV

#### US-110: Import transactions from CSV

**As a** user  
**I want** to upload a CSV bank statement  
**So that** my transactions are imported without manual entry.

**Trigger:** User selects "Upload Statement" → chooses CSV file on Import Transactions screen.

**Flow:**
1. User taps "Upload Statement" tab
2. User selects CSV file (drag-and-drop on web, file picker on mobile)
3. File uploads to Convex Storage
4. User calls `transactions.initiateImport({ storageId, source: "csv" })`
5. Import job created (status: pending)
6. `processImport` action runs, parses CSV, writes via `batchUpsert`
7. User sees import progress (US-112)
8. On complete, user sees import results (US-113)

**Acceptance Criteria:**
- [ ] CSV upload accepted
- [ ] Parser extracts: date, description, amount, direction, currency
- [ ] Parsed transactions written via batchUpsert
- [ ] Duplicates detected and skipped (dedup logic)
- [ ] Import job status updated: pending → processing → complete

---

### 3.4 Import — PDF

#### US-111: Import transactions from PDF

**As a** user  
**I want** to upload a PDF bank statement  
**So that** my transactions are imported from the format banks typically provide.

**Trigger:** User selects "Upload Statement" → chooses PDF file.

**Flow:**
1. Same as US-110 but with PDF file
2. Parser extracts text from PDF and parses transaction rows
3. Source stored as "pdf" in import job

**Acceptance Criteria:**
- [ ] PDF upload accepted
- [ ] Parser handles common Nigerian bank statement formats (GTBank, Zenith, Access, etc.)
- [ ] Parsed transactions written via batchUpsert
- [ ] Duplicates detected and skipped

---

### 3.5 Import — Progress & Results

#### US-112: View import progress

**As a** user  
**I want** to see the status of an ongoing import  
**So that** I know whether to wait or if something went wrong.

**Trigger:** User has initiated an import; job status is "pending" or "processing".

**Flow:**
1. After initiating import, user sees progress UI
2. Status displayed: "Processing…" or "Parsing 47 transactions…"
3. Live subscription to `importJobs.get(jobId)` shows status updates
4. When complete or failed, UI transitions to results or error

**Acceptance Criteria:**
- [ ] Progress indicator visible during processing
- [ ] Status updates in near real-time (Convex reactivity)
- [ ] User can navigate away and return; progress persists

---

#### US-113: Review import results

**As a** user  
**I want** to see what was imported and whether any duplicates were skipped  
**So that** I can verify the import succeeded and understand any exclusions.

**Trigger:** Import job completes (status: "complete").

**Flow:**
1. User sees results summary: "47 transactions imported, 3 duplicates skipped"
2. Option to view the imported transactions (filter by importJobId)
3. Option to "Done" / "Go to Transactions"

**Acceptance Criteria:**
- [ ] Summary shows: totalParsed, totalImported, duplicatesSkipped
- [ ] Link to view imported batch
- [ ] Duplicate detection explained: "Duplicates are transactions that match existing records by date, amount, and description"

---

#### US-114: Handle import errors and duplicates

**As a** user  
**I want** clear feedback when an import fails or when duplicates are found  
**So that** I can take corrective action.

**Trigger:** Import fails (status: "failed") or duplicates are detected.

**Flow — Failure:**
1. Import job status = "failed", errorMessage populated
2. User sees error: "Import failed. Please check the file format." (or specific message)
3. Notification created: type "import_failed"
4. User can retry with a different file

**Flow — Duplicates:**
1. batchUpsert detects duplicates (by date + amount + description + externalRef)
2. Duplicates skipped; count in duplicatesSkipped
3. User informed in results: "X duplicates were skipped"
4. Option to "Import anyway" for future: not in v1 (duplicates always skipped)

**Acceptance Criteria:**
- [ ] Failed imports show errorMessage
- [ ] Notification sent on failure
- [ ] Duplicates never written; user informed of count
- [ ] Dedup logic: match on date, amount, description, externalRef (fuzzy tolerance for amount)

---

### 3.6 Manual Entry

#### US-115: Add transaction manually

**As a** user  
**I want** to manually log a transaction  
**So that** I can record cash transactions or income from sources not captured digitally.

**Trigger:** User selects "Manual Entry" tab on Import Transactions screen (or "+ Add" from Transaction List).

**Flow:**
1. User opens Manual Entry form
2. User enters: date, description, amount, currency, category (or leaves uncategorised)
3. User optionally enters: type, isDeductible, deductiblePercent, whtDeducted, notes
4. User taps "Save" or "Add Transaction"
5. `transactions.manualCreate` mutation called
6. Transaction created; user sees success and can add another or return to list

**Acceptance Criteria:**
- [ ] Required fields: date, description, amount, currency
- [ ] Optional: category, type, isDeductible, deductiblePercent, whtDeducted, notes
- [ ] Default: type = uncategorised if no category; currency = NGN
- [ ] amountNgn computed: if foreign, fetch CBN rate for date and convert
- [ ] Connected account: "manual" or user's default manual account

---

### 3.7 Bulk Actions

#### US-116: Bulk select transactions

**As a** user  
**I want** to select multiple transactions  
**So that** I can perform bulk categorise or bulk delete.

**Trigger:** User enters "select" mode on Transaction List (e.g. long-press or mode toggle).

**Flow:**
1. User taps "Select" or long-presses a row
2. List enters multi-select mode; checkboxes appear
3. User selects one or more transactions
4. Action bar appears: "Categorise" and "Delete"
5. User can "Select All" (on current page) or "Clear selection"

**Acceptance Criteria:**
- [ ] Multi-select mode toggle or long-press
- [ ] Checkbox per row
- [ ] Selection count displayed
- [ ] "Select All" selects visible page only

---

#### US-117: Bulk categorise transactions

**As a** user  
**I want** to apply the same category to multiple transactions at once  
**So that** I can quickly categorise similar items.

**Trigger:** User has selected multiple transactions and taps "Categorise".

**Flow:**
1. User selects 2+ transactions
2. User taps "Categorise"
3. Category picker modal opens
4. User selects category (and optionally type)
5. User confirms
6. `transactions.bulkCategorise` mutation called with transaction IDs and categoryId
7. All selected transactions updated
8. Success toast: "X transactions categorised"

**Acceptance Criteria:**
- [ ] `transactions.bulkCategorise` supports array of IDs
- [ ] Category and type applied to all
- [ ] isDeductible set from category default
- [ ] Selection cleared; list refreshes

---

#### US-118: Bulk delete transactions

**As a** user  
**I want** to delete multiple transactions at once  
**So that** I can remove a batch of erroneous imports.

**Trigger:** User has selected multiple transactions and taps "Delete".

**Flow:**
1. User selects 2+ transactions
2. User taps "Delete"
3. Confirmation dialog: "Delete X transactions? This cannot be undone."
4. User confirms
5. Each transaction deleted via `transactions.delete` (or bulk delete mutation)
6. Success toast: "X transactions deleted"

**Acceptance Criteria:**
- [ ] Confirmation required
- [ ] All selected transactions removed
- [ ] Selection cleared; list refreshes

---

### 3.8 Categorisation Triage

#### US-119: Categorisation triage flow

**As a** user  
**I want** a fast, swipeable interface to review uncategorised transactions  
**So that** I can quickly confirm or reclassify each one without opening full detail.

**Trigger:** User has uncategorised transactions and navigates to Categorisation Triage (from Dashboard banner or Transaction List filter).

**Flow:**
1. User lands on Categorisation Triage screen
2. Progress at top: "12 of 47 remaining"
3. Large card shows one transaction: date, description, amount, source
4. Category suggestion (from rule-based engine in v1) with confidence badge if available
5. Buttons: "Confirm suggestion", "Change category", "Mark as Personal"
6. "Skip for now" link to advance without changing
7. On action, next transaction shown; progress updates
8. When done, user returns to list or dashboard

**Acceptance Criteria:**
- [ ] One transaction per card
- [ ] Progress counter accurate
- [ ] Confirm applies suggested category (or default) and marks reviewedByUser = true
- [ ] Change category opens picker modal
- [ ] Mark as Personal sets type = personal_expense
- [ ] Skip leaves uncategorised, advances to next
- [ ] **All-done state:** When 0 remaining (all uncategorised items processed): show success state — "All transactions categorised" with checkmark illustration, CTA "View Transactions" → Transaction List. User can also navigate back via header.

---

#### US-120: Confirm or change category in triage

**As a** user  
**I want** to confirm a suggested category or pick a different one  
**So that** each transaction is correctly classified with minimal effort.

**Trigger:** User taps "Confirm suggestion" or "Change category" on triage card.

**Flow — Confirm:**
1. Suggested category applied
2. Transaction updated; next shown

**Flow — Change:**
1. Category picker modal opens (searchable, grouped by type)
2. User selects category
3. Modal closes; category applied; next transaction shown

**Acceptance Criteria:**
- [ ] Confirm uses suggestion or first-match rule
- [ ] Change opens modal with Income Types, Business Expenses, Personal, Transfers
- [ ] Search filters categories
- [ ] Selection applies and advances

---

### 3.9 Categories

#### US-121: View and manage custom categories

**As a** user  
**I want** to see all categories (system + custom) and manage my custom ones  
**So that** I can organise transactions according to my business.

**Trigger:** User navigates to Categories (from Settings or inline picker "Manage categories").

**Flow:**
1. User sees list of categories grouped by type
2. System categories are read-only
3. User-created categories have Edit and Delete actions
4. "Add category" button for custom

**Acceptance Criteria:**
- [ ] `categories.listAll` returns system + user categories
- [ ] System categories (isSystem = true) not editable/deletable
- [ ] Custom categories (userId set) editable and deletable

---

#### US-122: Create custom category

**As a** user  
**I want** to create a custom category  
**So that** I can classify transactions that don't fit system categories.

**Trigger:** User taps "Add category" in Categories screen.

**Flow:**
1. User enters: name, type (income/business_expense/personal_expense/transfer), isDeductibleDefault (for expenses), icon, colour
2. User saves
3. `categories.create` mutation called
4. New category appears in list and in pickers

**Acceptance Criteria:**
- [ ] Required: name, type
- [ ] Optional: icon, colour, isDeductibleDefault
- [ ] category.userId set to current user

---

#### US-123: Edit custom category

**As a** user  
**I want** to edit a custom category  
**So that** I can fix mistakes or update naming.

**Trigger:** User taps "Edit" on a custom category.

**Flow:**
1. User edits name, icon, colour, isDeductibleDefault
2. User saves
3. `categories.update` mutation called
4. All transactions with this category reflect the update (no cascade needed; they reference by ID)

**Acceptance Criteria:**
- [ ] Only user-created categories editable
- [ ] Name, icon, colour, isDeductibleDefault updatable

---

#### US-124: Delete custom category

**As a** user  
**I want** to delete a custom category  
**So that** I can remove categories I no longer use.

**Trigger:** User taps "Delete" on a custom category.

**Flow:**
1. User taps Delete
2. Confirmation: "X transactions use this category. They will be set to Uncategorised. Continue?"
3. User confirms
4. `categories.delete` mutation: reassigns transactions to uncategorised (categoryId cleared, type = uncategorised)
5. Category document removed (or soft-deleted)

**Acceptance Criteria:**
- [ ] Transactions with this categoryId get categoryId cleared, type = uncategorised
- [ ] Category no longer appears in pickers

---

### 3.10 Connected Accounts

#### US-125: View connected accounts

**As a** user  
**I want** to see all my connected accounts (banks, fintech, upload sources)  
**So that** I know what sources feed my transactions.

**Trigger:** User navigates to Settings → Connected Accounts.

**Flow:**
1. User sees list of connected accounts
2. Each card shows: provider name, account name, last synced, status (active/error/disconnected)
3. For v1 (upload only): accounts are "statement_upload" or "manual" types

**Acceptance Criteria:**
- [ ] `accounts.list` returns accounts for entity
- [ ] Card shows accountName, provider, lastSyncedAt, status
- [ ] Actions: Sync Now (no-op for upload in v1), Disconnect
- [ ] Settings → Connected Accounts navigates here (per PRD-0 scope)
- [ ] Empty state when no accounts: illustration + "No accounts linked yet" + "Add account" CTA

---

#### US-125a: Disconnect / Remove connected account

**As a** user  
**I want** to disconnect or remove a connected account  
**So that** I can stop syncing from a source or remove accounts I no longer use  

**Trigger:** User taps "Disconnect" on a connected account card (Settings → Connected Accounts).

**Flow:**
1. User taps "Disconnect" on an account card
2. Confirmation dialog: "Disconnect {accountName}? Syncing will stop. Your existing transactions from this account will be kept."
3. User confirms
4. `accounts.disconnect` mutation is called
5. For `statement_upload` or `manual` accounts (v1): account is removed from the list (hard delete)
6. For live-linked accounts (PRD-8): status set to "disconnected"; tokens cleared; account retained for history
7. Success toast: "Account disconnected"
8. Account card removed (v1 upload/manual) or shows "Disconnected" badge (PRD-8)

**Acceptance Criteria:**
- [ ] Confirmation dialog before disconnect
- [ ] For manual/statement_upload: account document deleted; transactions retain connectedAccountId as dangling ref (display "Unknown source" or original account name if cached)
- [ ] For live-linked (PRD-8): status = "disconnected"; tokens cleared; account remains in list with Disconnected badge
- [ ] Existing transactions preserved; no cascade delete
- [ ] Success toast displayed

---

#### US-126: Add connected account (upload source)

**As a** user  
**I want** to add a new statement upload source  
**So that** I can track which statements I've imported from which account.

**Trigger:** User taps "+ Add New Account" on Connected Accounts screen.

**Flow:**
1. User selects "Upload bank statement" (v1)
2. User enters: account name (e.g. "GTBank — 0123456789"), provider (dropdown: gtbank, zenith, access, etc.), currency
3. User saves
4. `accounts.add` mutation creates connected account with provider = selected, status = active
5. Future imports can optionally link to this account via connectedAccountId

**Acceptance Criteria:**
- [ ] v1: only "statement_upload" or manual account type
- [ ] Account name and provider required
- [ ] Created account appears in list
- [ ] Import flow can associate transactions with this account when user selects it

---

### 3.11 Filters, Sort, Search

#### US-127: Filter by category, date, type, source

**As a** user  
**I want** to filter transactions by category, date range, type, and source account  
**So that** I can isolate specific subsets.

**Trigger:** User applies filters from Transaction List filter bar.

**Flow:**
1. Filter chips: All | Income | Expenses | Uncategorised | This Month | This Quarter | Custom Range
2. Extended filters (e.g. in filter sheet): category, type, connectedAccountId, date range
3. Filters passed to `transactions.list` query
4. List updates reactively

**Acceptance Criteria:**
- [ ] `transactions.list` supports: entityId, taxYear, type, categoryId, dateRange (start/end), connectedAccountId
- [ ] Quick filters (All, Income, etc.) map to type
- [ ] Custom range opens date picker

---

#### US-128: Sort by date, amount, category

**As a** user  
**I want** to sort transactions by date, amount, or category  
**So that** I can view them in the order that helps me most.

**Trigger:** User selects sort option (dropdown or header tap).

**Flow:**
1. Sort options: Date (newest first / oldest first), Amount (high to low / low to high), Category (A–Z)
2. `transactions.list` accepts sortBy and sortOrder
3. List re-fetches with new sort

**Acceptance Criteria:**
- [ ] Default sort: date desc
- [ ] Sort options work correctly
- [ ] Sort persists during session (local state)

---

#### US-129: Search transactions

**As a** user  
**I want** to search transactions by description, amount, or category  
**So that** I can find a specific transaction quickly.

**Trigger:** User types in search bar on Transaction List.

**Flow:**
1. User types in search bar
2. Search debounced (e.g. 300ms)
3. `transactions.list` receives search query
4. Backend filters by: description contains, amount matches, category name contains

**Acceptance Criteria:**
- [ ] Full-text search across description, enrichedDescription, category name
- [ ] Amount search: exact or range
- [ ] Search is case-insensitive
- [ ] Results update as user types (debounced)

---

## 4. UI Specifications

### 4.1 Transaction List Screen

**Layout:** Full-screen list with header, filter bar, search bar, and scrollable transaction rows.

**Layout & Scroll Behavior:**
- **Header and filter bar:** Sticky at top — "Transactions" title, Import button, filter chips, and search bar remain visible while scrolling. Transaction list scrolls independently below.

**Header:**
- Left: Hamburger (drawer)
- Centre: "Transactions"
- Right: Filter icon, "Import" button

**Filters bar (horizontally scrollable chips):**
- All | Income | Expenses | Uncategorised | This Month | This Quarter | Custom Range

**Search bar:** Full-width, placeholder "Search transactions…"

**List items (each row):**
- Left: Category icon (coloured dot) + date (e.g. "24 Feb")
- Centre: Description (1 line, truncated), category label below (or "Uncategorised" in amber)
- Right: Amount — green for income, neutral-900 for expense; currency flag for foreign

**Section headers:** Grouped by month (e.g. "February 2026")

**States:**
- Loading: Skeleton rows
- Empty: Illustration + "No transactions yet. Import a bank statement to get started." + "Import Now" CTA
- Loaded: Paginated list, "Load more" or infinite scroll
- Selection: Checkboxes visible, action bar at bottom ("Categorise", "Delete")

---

### 4.2 Import Transactions Screen

**Layout:** Step-based with method selector tabs at top.

**Method tabs:**
1. **Upload Statement** — Drag-and-drop zone (web) or file picker button (mobile). Accepts PDF and CSV.
2. **Connect Bank** — Placeholder for v1: "Coming in a future update" or disabled
3. **Connect Fintech** — Placeholder for v1: "Coming in a future update" or disabled
4. **Manual Entry** — Form: date, description, amount, currency, category

**Upload flow states:**
- Idle: Drop zone or "Choose file"
- Uploading: Progress bar
- Parsing: "Processing your statement…"
- Preview: Table of parsed transactions, row count, duplicate warning if any, "Confirm Import" button
- Importing: Progress (US-112)
- Complete: Results summary (US-113)
- Error: Error message, "Try again" button

---

### 4.3 Transaction Detail Screen

**Layout:** Card-based, full-screen scroll.

**Sections:**
1. **Header:** Date, source account
2. **Amount card:** Amount + currency, naira equivalent (if foreign)
3. **Details card:** Description (editable), Category (tappable), Type (dropdown), Tax deductible (Yes/No/Partial), Deductible % (if Partial), WHT amount (if income), Notes
4. **Metadata:** Associated invoice (if matched), Import source

**Actions (sticky bottom or FAB):**
- "Save Changes" (primary)
- "Mark as Personal" (secondary)
- "Delete Transaction" (destructive, bottom of scroll)

---

### 4.4 Categorisation Triage Screen

**Layout:** Centred card with progress and action buttons.

**Top:** Progress: "12 of 47 remaining"

**Centre card:**
- Date, description, amount
- Source account
- Category suggestion with confidence badge (v1: rule-based or "—")

**Action buttons (horizontal):**
- ✓ Confirm (green)
- ✎ Change category (opens modal)
- ✗ Mark as Personal (grey)

**Bottom:** "Skip for now" text link

**Category picker modal:**
- Search bar
- List grouped by: Income Types, Business Expenses, Personal, Transfers
- Tappable rows; selection closes modal and applies

---

### 4.5 Categories Management Screen (if distinct)

**Layout:** List of categories grouped by type.

**Sections:** Income | Business Expenses | Personal | Transfers

**Each row:** Name, icon, colour, type, Edit/Delete (custom only)

**Footer:** "+ Add category" button

---

### 4.6 Connected Accounts Screen

**Layout:** List of account cards.

**Each card:**
- Institution name (or "Statement upload")
- Account name
- Last synced timestamp
- Status badge: Active (green) | Error (amber) | Disconnected (grey)
- Actions: "Sync Now" (no-op for upload in v1), "Disconnect"

**Footer:** "+ Add New Account" → opens add flow (v1: manual/upload only)

---

## 5. Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-001 | The system shall allow users to import transactions from PDF and CSV bank statements. |
| FR-002 | The system shall allow users to manually add transactions with date, description, amount, currency, and category. |
| FR-003 | The system shall store `amountNgn` (naira equivalent) for all transactions, converting foreign currency at CBN rate on transaction date. |
| FR-004 | The system shall support transaction types: income, business_expense, personal_expense, transfer, uncategorised. |
| FR-005 | The system shall support tax fields on transactions: `isDeductible`, `deductiblePercent`, `whtDeducted`, `whtRate`. |
| FR-006 | The system shall detect and skip duplicate transactions during import (match on date, amount, description, externalRef). |
| FR-007 | The system shall track import jobs with status: pending, processing, complete, failed. |
| FR-008 | The system shall allow users to create, edit, and delete custom categories. |
| FR-009 | The system shall prevent editing or deleting system categories. |
| FR-010 | The system shall allow bulk categorise and bulk delete of multiple transactions. |
| FR-011 | The system shall provide a categorisation triage UI for rapid review of uncategorised transactions. |
| FR-012 | The system shall allow users to add connected accounts (v1: upload/manual only). |
| FR-013 | The system shall display transactions in a paginated, filterable, sortable, searchable list. |
| FR-014 | The system shall support filter by: type, category, date range, connected account. |
| FR-015 | The system shall support sort by: date, amount, category. |
| FR-016 | The system shall support full-text search across description and category. |
| FR-017 | The system shall group transactions by month in the list view. |
| FR-018 | The system shall show an empty state with "Import Now" CTA when no transactions exist. |
| FR-019 | The system shall require confirmation before deleting transactions (single or bulk). |
| FR-020 | The system shall notify users when an import fails (in-app + notification). |

---

## 6. API Requirements

### 6.1 Convex Functions — Transactions

| Function | Type | Description |
|----------|------|-------------|
| `transactions.list` | Query | Paginated list; filters: entityId, taxYear, type, categoryId, dateRange, connectedAccountId, search; sort: date, amount, category |
| `transactions.getUncategorised` | Query | Transactions where type = "uncategorised" for entity (triage UI) |
| `transactions.get` | Query | Single transaction by ID |
| `transactions.update` | Mutation | Update description, type, categoryId, isDeductible, deductiblePercent, notes, whtDeducted, whtRate |
| `transactions.bulkCategorise` | Mutation | Apply category/type to multiple transaction IDs |
| `transactions.delete` | Mutation | Delete single transaction |
| `transactions.bulkDelete` | Mutation | Delete multiple transactions (or loop delete) |
| `transactions.manualCreate` | Mutation | Create transaction from manual entry form |
| `transactions.initiateImport` | Mutation | Create importJob, schedule processImport action |
| `transactions.processImport` | Action | Parse file from Storage (PDF/CSV), extract transactions, call batchUpsert |
| `transactions.batchUpsert` | Mutation | Write array of parsed transactions; run dedup logic |

### 6.2 Convex Functions — Import Jobs

| Function | Type | Description |
|----------|------|-------------|
| `importJobs.get` | Query | Single import job by ID (for progress UI) |
| `importJobs.list` | Query | Import jobs for entity (for history) |

### 6.3 Convex Functions — Connected Accounts

| Function | Type | Description |
|----------|------|-------------|
| `accounts.list` | Query | All connected accounts for entity |
| `accounts.add` | Mutation | Create connected account (v1: manual/statement_upload) |
| `accounts.disconnect` | Mutation | Set status to disconnected |

### 6.4 Convex Functions — Categories

| Function | Type | Description |
|----------|------|-------------|
| `categories.listAll` | Query | System + user categories |
| `categories.create` | Mutation | Create custom category |
| `categories.update` | Mutation | Edit user-created category |
| `categories.delete` | Mutation | Delete user category; reassign transactions to uncategorised |

---

## 7. Data Models

Full TypeScript interfaces for frontend consumption. These mirror the Convex schema.

```typescript
import type { Id } from "./convex/_generated/dataModel";

export type TransactionDirection = "credit" | "debit";
export type TransactionType = "income" | "business_expense" | "personal_expense" | "transfer" | "uncategorised";

export interface Transaction {
  _id: Id<"transactions">;
  _creationTime: number;
  entityId: Id<"entities">;
  userId: Id<"users">;
  connectedAccountId?: Id<"connectedAccounts">;
  importJobId?: Id<"importJobs">;
  date: number;
  description: string;
  enrichedDescription?: string;
  amount: number;
  currency: string;
  amountNgn: number;
  fxRate?: number;
  direction: TransactionDirection;
  type: TransactionType;
  categoryId?: Id<"categories">;
  isDeductible: boolean;
  deductiblePercent: number;
  whtDeducted?: number;
  whtRate?: number;
  invoiceId?: Id<"invoices">;
  notes?: string;
  externalRef?: string;
  isDuplicate: boolean;
  taxYear: number;
  aiCategoryConfidence?: number;
  aiCategorySuggestion?: string;
  reviewedByUser: boolean;
}

export type ImportJobSource = "pdf" | "csv" | "bank_api" | "paystack" | "flutterwave" | "manual";
export type ImportJobStatus = "pending" | "processing" | "complete" | "failed";

export interface ImportJob {
  _id: Id<"importJobs">;
  _creationTime: number;
  entityId: Id<"entities">;
  userId: Id<"users">;
  connectedAccountId?: Id<"connectedAccounts">;
  source: ImportJobSource;
  status: ImportJobStatus;
  storageId?: string;
  totalParsed?: number;
  totalImported?: number;
  duplicatesSkipped?: number;
  errorMessage?: string;
  startedAt?: number;
  completedAt?: number;
}

export type ConnectedAccountProvider = "gtbank" | "zenith" | "access" | "paystack" | "flutterwave" | "moniepoint" | "opay" | "payoneer" | "wise" | "manual" | "statement_upload";
export type ConnectedAccountStatus = "active" | "error" | "disconnected";

export interface ConnectedAccount {
  _id: Id<"connectedAccounts">;
  _creationTime: number;
  entityId: Id<"entities">;
  userId: Id<"users">;
  provider: ConnectedAccountProvider;
  providerAccountId?: string;
  accountName: string;
  currency: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: number;
  lastSyncedAt?: number;
  status: ConnectedAccountStatus;
  errorMessage?: string;
}

export type CategoryType = "income" | "business_expense" | "personal_expense" | "transfer";

export interface Category {
  _id: Id<"categories">;
  _creationTime: number;
  name: string;
  type: CategoryType;
  isDeductibleDefault: boolean;
  ntaReference?: string;
  isSystem: boolean;
  userId?: Id<"users">;
  icon?: string;
  color?: string;
}

// List query inputs
export interface TransactionsListParams {
  entityId: Id<"entities">;
  taxYear?: number;
  type?: TransactionType;
  categoryId?: Id<"categories">;
  dateRange?: { start: number; end: number };
  connectedAccountId?: Id<"connectedAccounts">;
  search?: string;
  sortBy?: "date" | "amount" | "category";
  sortOrder?: "asc" | "desc";
  cursor?: string;
  limit?: number;
}
```

---

## 8. Non-Goals

The following are explicitly **out of scope** for PRD-1:

| Item | Reason | Covered By |
|------|--------|------------|
| **AI categorisation** | Requires Claude API integration, confidence scores, batch logic | PRD-2 |
| **Bank linking (OAuth / live sync)** | Open Banking integration complexity; v1 is upload-only | PRD-8 |
| **Tax calculation** | Engine consumes transactions but is separate domain | PRD-3 |
| **Invoice matching** | Creating transactions from invoice payment is PRD-4; viewing link is in scope | PRD-4 |
| **Split transaction UI** | Full split (e.g. 60% / 40% as separate rows) — v1 supports deductiblePercent only | Future |
| **Recurring transaction templates** | Not required for MVP | Future |

---

## 9. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Import success rate** | >90% of initiated imports complete successfully | Import jobs status = complete / (complete + failed) |
| **Time to first import** | <5 min from signup to first import for users who complete onboarding import step | Analytics |
| **Triage completion rate** | >70% of users with uncategorised txns complete triage within 7 days | reviewedByUser = true count |
| **Duplicate detection accuracy** | Zero false positives (valid transactions incorrectly skipped) | Manual audit sample |
| **Manual entry adoption** | Track % of transactions added manually vs import | source = manual in importJob |
| **Bulk action usage** | Users with >20 transactions use bulk categorise at least once | Analytics |
| **Category CRUD** | >20% of active users create at least one custom category | categories with userId set |

---

## 10. Open Questions

| # | Question | Owner |
|---|----------|-------|
| 1 | Which Nigerian bank statement PDF formats should we support in v1? (GTBank, Zenith, Access confirmed — others?) | Eng |
| 2 | What CSV format/schema do we expect? Standard 5-column (date, description, amount, direction, currency) or bank-specific? | Eng |
| 3 | Should duplicate detection use exact match or fuzzy tolerance (e.g. ±₦1 on amount)? | Product |
| 4 | Max file size for PDF/CSV upload? (Convex Storage limits?) | Eng |
| 5 | Should we support "Import anyway" for duplicates in a future iteration, or always skip? | Product |
| 6 | Categorisation triage: card-swipe gesture (Tinder-style) or button-tap only for v1? | Design |
| 7 | Rule-based categorisation for v1: keyword matching (e.g. "PAYSTACK" → income)? Or leave all uncategorised? | Product |

---

*End of PRD-1 — Transaction Management & Import Pipeline*
