# Bank Accounts, Onboarding Upload, and Per-Account Reporting

**Date:** 2026-03-31
**Status:** Draft

## Overview

Three related changes to TaxEase:

1. **Onboarding statement upload** — enable statement upload in onboarding Step 4 with background processing; disable Paystack/Flutterwave (not ready)
2. **Bank account model** — let users create and manage bank accounts, associate them with imported transactions
3. **Per-account reporting** — filter reports by bank account and add a "By Account" summary tab

## 1. Data Model

### New `bankAccounts` table

```
bankAccounts {
  entityId: Id<'entities'>
  userId: Id<'users'>
  bankName: string          // from predefined Nigerian banks list
  bankCode: string          // CBN bank code (e.g., "058" for GTBank)
  accountNumber?: string    // optional, 10-digit NUBAN
  accountName?: string      // name on the account
  nickname: string          // user-chosen label, e.g., "GTBank Savings"
  currency: 'NGN' | 'USD' | 'GBP' | 'EUR'  // default NGN
  isActive: boolean         // soft delete / archival
  createdAt: number
  updatedAt: number
}
Indexes: by_entityId, by_userId
```

### Predefined banks list

A static array of `{ name, code }` objects covering major Nigerian banks (GTBank, Access, Zenith, First Bank, UBA, Stanbic, Fidelity, Sterling, Wema/ALAT, etc.) plus an "Other" option where the user can type a custom bank name (bankCode left empty for "Other").

### Modifications to existing tables

- `transactions`: add `bankAccountId?: Id<'bankAccounts'>` — optional to preserve backward compatibility with legacy transactions
- `importJobs`: add `bankAccountId?: Id<'bankAccounts'>` — when a job is linked to an account, all its transactions inherit the association

## 2. Onboarding Step 4 Changes

### Current state

- Upload bank statement: disabled ("After setup")
- Connect bank account: disabled ("Coming soon")
- Connect Paystack: active (ApiKeyForm)
- Connect Flutterwave: active (ApiKeyForm)
- Connect Payoneer / Wise: disabled ("Coming soon")
- "I'll do this later": always available

### New behavior

**Upload bank statement — enabled.** Tapping expands an inline area with:
- Bank account selector (pick existing or "Add new account" — quick form: bank name dropdown, account number, nickname)
- Drop zone for PDF/CSV file
- Either-order interaction: drop file first then get prompted for account, or pick account first then drop file
- On file drop: upload starts immediately in background; a compact progress row appears (filename, spinner/checkmark, account name)
- User can add multiple uploads — each gets its own progress row
- Processing continues even after user clicks "Finish Setup"
- Toast/notification when each background job completes

**Connect Paystack — disabled.** Greyed out with "Coming soon" badge, matching Connect bank account and Payoneer/Wise styling.

**Connect Flutterwave — disabled.** Same treatment as Paystack.

**Connect bank account, Connect Payoneer/Wise, "I'll do this later"** — unchanged.

## 3. Bank Account Management

### Location

The existing ConnectedAccounts page is expanded. Manually-created bank accounts appear in a separate section above OAuth/API-connected accounts.

### CRUD operations

- **Create:** "Add Bank Account" button opens a form — bank name (searchable dropdown from predefined list + "Other"), account number (optional, validated as 10-digit NUBAN if provided), account name (optional), nickname (required), currency (default NGN)
- **Edit:** Tap an account to edit nickname, account name, or account number. Bank name changes require creating a new account.
- **Archive:** Soft delete via `isActive: false`. Archived accounts stop appearing in selectors but transaction associations remain. An "Archived" section at the bottom lets users restore them.
- **No hard delete** — transactions reference bank accounts, so referential integrity is preserved.

### Reusable bank account selector component

A shared dropdown component used in onboarding, ImportTransactions page, and transaction detail. Shows active bank accounts for the entity with an inline "Add new" option at the bottom that expands the creation form without leaving context.

## 4. Import Flow Changes

### ImportTransactions page (Upload Statement tab)

**Current flow:** drop zone -> upload -> poll job -> show results. No bank account awareness.

**New flow:**
- Bank account selector and drop zone are both visible (either-order interaction)
- If user drops file without selecting an account: a prompt appears: "Which bank account is this statement from?" with the selector
- If user selects account first: file gets associated on drop
- `bankAccountId` is passed to `transactions.initiateImport` and stored on the `importJob`
- `batchInsert` in `importHelpers.ts` propagates the `bankAccountId` to every transaction it creates from that job

### Retroactive assignment (existing transactions)

- On the Transactions list page: add a "Bank Account" column/badge and a bulk action "Assign to Bank Account"
- Single transaction assignment with import job propagation: when a user assigns a bank account to a transaction that has an `importJobId`, the system prompts: "This transaction was imported with X other transactions. Assign all of them to [account name]?" On confirmation, all transactions sharing that `importJobId` get the `bankAccountId` set.
- Transactions without an `importJobId` (manually created) are individually assigned.

## 5. Reporting Changes

### Filter addition (all existing tabs)

A bank account filter dropdown alongside the existing date range filter:
- "All accounts" (default) — no filtering
- Individual bank accounts listed by nickname
- "Unlinked" — transactions with no bank account association
- Multiple selection supported (e.g., GTBank Savings + Access Current)

The filter applies uniformly to Income, Expenses, and YoY tabs.

### Backend changes

`reports.ts` queries (`getIncome`, `getExpenses`, `getYearOnYear`) gain an optional `bankAccountIds?: Id<'bankAccounts'>[]` parameter. When provided, transactions are filtered before aggregation. A sentinel value `"unlinked"` filters for `bankAccountId === undefined`.

### New "By Account" tab

A fourth tab showing a per-account summary table:

| Account | Income | Expenses | Net | Transactions |
|---------|--------|----------|-----|-------------|
| GTBank Savings | NGN 2.4M | NGN 800K | NGN 1.6M | 142 |
| Access Current | NGN 1.1M | NGN 950K | NGN 150K | 89 |
| Unlinked | NGN 200K | NGN 50K | NGN 150K | 23 |

Each row is tappable — navigates to the Income or Expenses tab with that account pre-selected in the filter.

### Export

CSV and PDF exports respect the active bank account filter. Transaction-level exports include a "Bank Account" column.

## 6. Key Design Decisions

1. **Separate `bankAccounts` table** (not reusing `connectedAccounts`) — a bank account is a real-world concept independent of how data flows into the app. When open banking arrives, a `connectedAccount` links to a `bankAccount` via a foreign key.
2. **Import job propagation** — assigning one transaction to a bank account can propagate to all transactions sharing the same `importJobId`, since a statement file can only belong to one bank account.
3. **No hard delete on bank accounts** — soft archive preserves referential integrity with transactions.
4. **Either-order UX for import** — user can pick account first or drop file first; both paths converge to the same result.
5. **Background processing in onboarding** — upload/parse runs as existing Convex fire-and-forget action; onboarding UI doesn't block on completion.
