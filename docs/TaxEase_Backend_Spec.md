# TaxEase Nigeria — Backend & Infrastructure Specification

**Version:** 1.0 — February 2026
**Primary Backend Platform:** Convex
**Application Framework:** NestJS (for auxiliary services only — see §9)
**Status:** Draft

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Convex Platform Fundamentals](#2-convex-platform-fundamentals)
3. [Authentication & Sessions](#3-authentication--sessions)
4. [Database Schema](#4-database-schema)
5. [Backend Functions by Domain](#5-backend-functions-by-domain)
6. [HTTP Actions (Webhooks & Public Endpoints)](#6-http-actions-webhooks--public-endpoints)
7. [Scheduled Functions](#7-scheduled-functions)
8. [File Storage](#8-file-storage)
9. [External Integrations](#9-external-integrations)
10. [Tax Calculation Engine](#10-tax-calculation-engine)
11. [Security & Compliance](#11-security--compliance)
12. [Environments & Deployment](#12-environments--deployment)
13. [Error Handling & Observability](#13-error-handling--observability)

---

## 1. Architecture Overview

### 1.1 System Diagram

```
┌─────────────────────────────────────────────────────────┐
│                      CLIENT LAYER                       │
│        React Native App (iOS / Android / Web)           │
│   Convex React Native SDK (WebSocket + HTTP transport)  │
└─────────────────────┬───────────────────────────────────┘
                      │  Convex Protocol (TLS)
┌─────────────────────▼───────────────────────────────────┐
│                   CONVEX CLOUD                          │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Queries    │  │  Mutations   │  │   Actions    │  │
│  │ (read/live)  │  │ (write/ACID) │  │(side effects)│  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ HTTP Actions │  │  Scheduled   │  │   Storage    │  │
│  │ (webhooks)   │  │  Functions   │  │ (files/PDFs) │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │           Convex Database (document store)      │    │
│  │     ACID transactions · real-time reactive      │    │
│  └─────────────────────────────────────────────────┘    │
└────────────────────────┬────────────────────────────────┘
                         │  HTTPS / API calls
     ┌───────────────────┼──────────────────────┐
     │                   │                      │
┌────▼────┐       ┌──────▼──────┐        ┌──────▼──────┐
│ Claude  │       │  Bank / Open│        │  Email      │
│   AI    │       │  Banking    │        │  Service    │
│  API    │       │  APIs       │        │ (Resend /   │
│(categor-│       │ (Mono,      │        │  Nodemailer)│
│ isation)│       │  Stitch)    │        └─────────────┘
└─────────┘       └─────────────┘
```

### 1.2 Key Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Backend platform | Convex | Already integrated; provides DB, functions, storage, real-time, and scheduling in one platform |
| Client-server protocol | Convex WebSocket (live queries) + HTTP | Real-time reactivity without polling; essential for live tax dashboard |
| Data model | Document store with schema validation | Flexible enough for heterogeneous transaction data; Convex schema enforces types |
| Auth | Clerk | Managed authentication with built-in UI components, JWT-based sessions, social login, and Convex integration via webhook sync |
| Tax engine | Pure Convex Action | Deterministic, auditable; runs server-side so logic never leaks to client |
| AI categorisation | Convex Action → Claude API | Actions can call external HTTP services; results written back to DB as mutations |
| File processing | Convex Storage + Action | PDF/CSV statements stored in Convex Storage; parsing runs in an Action |
| Auxiliary services | NestJS microservice | PDF generation (self-assessment forms) requires heavier libs not suitable for Convex Actions' runtime limits |

### 1.3 Data Flow Summary

**Happy path — transaction import & categorisation:**
```
User uploads PDF statement
  → Client uploads file to Convex Storage (storageId returned)
  → Client calls mutation: transactions.initiateImport(storageId)
    → Mutation creates an import job record (status: "pending")
    → Mutation schedules Action: transactions.processImport(jobId)
  → Action retrieves file from Storage
  → Action parses PDF/CSV → extracts raw transactions
  → Action calls Claude API for bulk categorisation
  → Action calls mutation: transactions.batchUpsert(parsed[])
  → Mutation writes transactions to DB, updates job status: "complete"
  → Client live query on transactions automatically updates UI
```

**Happy path — tax calculation:**
```
User opens Tax Summary screen
  → Client subscribes to live query: taxSummary.get(entityId, taxYear)
  → Query reads transactions, invoices, deductions from DB
  → Query runs in-process calculation (pure read, no side effects)
  → Returns computed TaxSummaryResult
  → Any new transaction categorised → DB write → query auto-recomputes → UI updates
```

---

## 2. Convex Platform Fundamentals

### 2.1 Function Types

| Type | Characteristics | Used For |
|---|---|---|
| **Query** | Read-only, reactive (live), deterministic, no side effects | Dashboard data, transaction lists, tax summary, invoice lists |
| **Mutation** | Read + write, ACID transactional, deterministic | Creating/updating transactions, invoices, user profiles |
| **Action** | Can call external APIs, run async operations, call other mutations | PDF parsing, AI categorisation, email sending, bank sync |
| **HTTP Action** | Exposed as public HTTP endpoint, no auth by default (must verify manually) | Receiving webhooks from Paystack, Flutterwave, bank APIs |
| **Scheduled Function** | Mutation or Action triggered on a cron or after a delay | Deadline reminders, recurring invoices, bank sync jobs |

### 2.2 Real-Time Reactivity

Convex queries subscribed to by the client automatically re-run and push updated results whenever the underlying database documents change. This is the mechanism behind:
- Dashboard live tax estimate updating as transactions are categorised
- Invoice status updating the moment a payment webhook is received
- Uncategorised transaction count badge updating immediately after triage

### 2.3 Convex Schema Validation

All tables are defined in `convex/schema.ts` using Convex's `defineSchema` and `defineTable` helpers with `v` validators. This ensures type safety end-to-end (TypeScript types are generated from the schema and shared with the client).

---

## 3. Authentication & Sessions

### 3.1 Approach

TaxEase uses **Clerk** as its authentication provider. Clerk handles all user management, sign-up/sign-in flows, session management, and social login (Google OAuth). Clerk issues JWTs that the Convex client forwards automatically; Convex verifies them using Clerk's JWKS endpoint. A Clerk webhook syncs user data into the Convex `users` table on account creation and updates.

Auth flow:
```
Sign Up:
  User submits email + password (or taps "Sign up with Google")
  → Clerk hosted/embedded UI handles the flow
  → Clerk creates user, issues JWT session token
  → Clerk webhook (user.created) fires → Convex HTTP Action creates `users` document

Log In:
  User submits credentials or uses Google OAuth
  → Clerk verifies credentials, issues JWT
  → Client receives session; Convex client auto-attaches JWT

Subsequent requests:
  Convex client attaches Clerk JWT in every request
  → Convex verifies JWT via Clerk JWKS
  → ctx.auth.getUserIdentity() available in all functions

Log Out:
  → Clerk.signOut() on client
  → JWT is no longer attached; session ends
  → Client redirects to Welcome screen
```

### 3.2 Clerk–Convex Integration

Clerk manages user identities externally. The Convex `users` table is kept in sync via Clerk webhooks:

- **`user.created`** webhook → Convex HTTP Action creates a `users` document with `clerkUserId`, name, and email.
- **`user.updated`** webhook → Convex HTTP Action updates the corresponding `users` document.
- **`user.deleted`** webhook → Convex HTTP Action removes user data.

The app interacts with user identity in Convex functions via the `ctx.auth` API. Clerk's JWT populates the identity object.

### 3.3 Identity in Functions

Every query, mutation, and action that requires authentication calls:
```typescript
const identity = await ctx.auth.getUserIdentity();
if (!identity) throw new ConvexError("Unauthenticated");
const clerkUserId = identity.subject; // Clerk user ID
```

### 3.4 Biometric Auth (Mobile)

Biometric authentication (Face ID / Fingerprint) is handled entirely on the client side. The biometric check gates access to the stored Clerk session token — the backend is not involved. If biometric passes, the client uses the existing session token as normal.

---

## 4. Database Schema

All tables defined in `convex/schema.ts`. Field types use Convex validators (`v.string()`, `v.number()`, `v.boolean()`, `v.id("tableName")`, `v.optional()`, `v.union()`, `v.literal()`).

> **Note:** Convex automatically adds `_id` (document ID) and `_creationTime` (Unix ms timestamp) to every document. These are not repeated in the field listings below.

---

### 4.1 `users`

Stores application-specific profile data, synced from Clerk via webhook on account creation.

| Field | Type | Description |
|---|---|---|
| `clerkUserId` | `string` | Clerk user ID (from `identity.subject`) |
| `fullName` | `string` | Display name |
| `email` | `string` | Email address (indexed) |
| `phone` | `optional<string>` | Phone number |
| `nin` | `optional<string>` | National Identification Number (encrypted at rest — see §11) |
| `firsTin` | `optional<string>` | FIRS TIN if separately registered |
| `userType` | `"freelancer" \| "sme"` | Primary user classification |
| `profession` | `optional<string>` | Freelancer profession or SME industry |
| `preferredCurrency` | `"NGN" \| "USD" \| "GBP" \| "EUR"` | Display currency preference |
| `onboardingComplete` | `boolean` | Whether onboarding flow has been completed |
| `avatarStorageId` | `optional<string>` | Convex Storage ID for profile photo |

**Indexes:**
- `by_email` on `email`
- `by_authUserId` on `authUserId`

---

### 4.2 `entities`

A tax entity is the unit for which a tax return is filed. A user may have multiple entities (e.g. personal freelance + a registered business name).

| Field | Type | Description |
|---|---|---|
| `userId` | `id<"users">` | Owning user |
| `name` | `string` | Entity name (personal name or business name) |
| `type` | `"individual" \| "business_name" \| "llc"` | Legal form |
| `tin` | `optional<string>` | Entity-specific TIN (if different from user NIN) |
| `rcNumber` | `optional<string>` | CAC Registration Number for businesses |
| `vatRegistered` | `boolean` | Whether entity is VAT-registered |
| `vatThresholdExceeded` | `boolean` | Whether annual turnover has exceeded VAT threshold |
| `isDefault` | `boolean` | Default entity shown on login |
| `taxYearStart` | `number` | Month tax year starts (1 for Jan; Nigeria = 1) |

**Indexes:**
- `by_userId` on `userId`

---

### 4.3 `connectedAccounts`

Each bank account, fintech account, or statement source linked by the user.

| Field | Type | Description |
|---|---|---|
| `entityId` | `id<"entities">` | Entity this account belongs to |
| `userId` | `id<"users">` | Owning user |
| `provider` | `"gtbank" \| "zenith" \| "access" \| "paystack" \| "flutterwave" \| "moniepoint" \| "opay" \| "payoneer" \| "wise" \| "manual" \| "statement_upload"` | Source of transactions |
| `providerAccountId` | `optional<string>` | External account ID from provider |
| `accountName` | `string` | Display name (e.g. "GTBank — 0123456789") |
| `currency` | `string` | Account currency (ISO 4217) |
| `accessToken` | `optional<string>` | Encrypted OAuth token for live-linked accounts |
| `refreshToken` | `optional<string>` | Encrypted refresh token |
| `tokenExpiresAt` | `optional<number>` | Unix ms expiry for access token |
| `lastSyncedAt` | `optional<number>` | Unix ms of last successful sync |
| `status` | `"active" \| "error" \| "disconnected"` | Connection health |
| `errorMessage` | `optional<string>` | Last error from provider |

**Indexes:**
- `by_userId` on `userId`
- `by_entityId` on `entityId`

---

### 4.4 `transactions`

The core financial record. Every income or expense item lives here.

| Field | Type | Description |
|---|---|---|
| `entityId` | `id<"entities">` | Entity this transaction belongs to |
| `userId` | `id<"users">` | Owning user |
| `connectedAccountId` | `optional<id<"connectedAccounts">>` | Source account |
| `importJobId` | `optional<id<"importJobs">>` | Which import batch this came from |
| `date` | `number` | Transaction date (Unix ms, date precision) |
| `description` | `string` | Raw description from bank or user-entered |
| `enrichedDescription` | `optional<string>` | User-edited or AI-enriched description |
| `amount` | `number` | Absolute value (always positive) |
| `currency` | `string` | ISO 4217 currency code |
| `amountNgn` | `number` | Naira equivalent at date of transaction |
| `fxRate` | `optional<number>` | Exchange rate used (CBN rate) |
| `direction` | `"credit" \| "debit"` | Money in or money out |
| `type` | `"income" \| "business_expense" \| "personal_expense" \| "transfer" \| "uncategorised"` | Classification |
| `categoryId` | `optional<id<"categories">>` | Assigned category |
| `isDeductible` | `boolean` | Whether this expense is tax-deductible |
| `deductiblePercent` | `number` | 0–100; for split transactions (default 100) |
| `whtDeducted` | `optional<number>` | WHT amount deducted at source (NGN) |
| `whtRate` | `optional<number>` | WHT rate applied (e.g. 5, 10) |
| `invoiceId` | `optional<id<"invoices">>` | Matched invoice (for income) |
| `notes` | `optional<string>` | User-added notes |
| `externalRef` | `optional<string>` | Provider's transaction reference |
| `isDuplicate` | `boolean` | Flagged as potential duplicate |
| `taxYear` | `number` | Tax year this falls in (e.g. 2026) |
| `aiCategoryConfidence` | `optional<number>` | AI confidence score 0–1 |
| `aiCategorySuggestion` | `optional<string>` | Raw AI suggestion before user confirmation |
| `reviewedByUser` | `boolean` | Whether user has confirmed categorisation |

**Indexes:**
- `by_entityId_taxYear` on `[entityId, taxYear]`
- `by_entityId_date` on `[entityId, date]`
- `by_userId` on `userId`
- `by_importJobId` on `importJobId`
- `by_invoiceId` on `invoiceId`
- `by_uncategorised` on `[entityId, type]` (filter where type = "uncategorised")

---

### 4.5 `categories`

Predefined and user-created transaction categories.

| Field | Type | Description |
|---|---|---|
| `name` | `string` | Category name (e.g. "Internet & Data") |
| `type` | `"income" \| "business_expense" \| "personal_expense" \| "transfer"` | Parent type |
| `isDeductibleDefault` | `boolean` | Whether transactions in this category are deductible by default |
| `ntaReference` | `optional<string>` | NTA 2025 section that allows this deduction |
| `isSystem` | `boolean` | True for built-in categories, false for user-created |
| `userId` | `optional<id<"users">>` | Set only for user-created categories |
| `icon` | `optional<string>` | Icon identifier for UI |
| `color` | `optional<string>` | Hex color for UI |

**Indexes:**
- `by_type` on `type`
- `by_userId` on `userId`

**Seeded system categories (sample):**

| Name | Type | Deductible | NTA Reference |
|---|---|---|---|
| Freelance / Client Income | income | — | NTA §X |
| Foreign Income | income | — | NTA §X |
| Investment Returns | income | — | NTA §X |
| Rental Income | income | — | NTA §X |
| Internet & Data | business_expense | true | NTA §X |
| Electricity & Fuel | business_expense | true | NTA §X |
| Software Subscriptions | business_expense | true | NTA §X |
| Equipment Purchase | business_expense | true | NTA §X |
| Professional Development | business_expense | true | NTA §X |
| Workspace / Rent | business_expense | true | NTA §X |
| Transport (Business) | business_expense | true | NTA §X |
| Marketing & Advertising | business_expense | true | NTA §X |
| Bank Charges | business_expense | true | NTA §X |
| Personal — Groceries | personal_expense | false | — |
| Personal — Entertainment | personal_expense | false | — |
| Transfer (Own Account) | transfer | false | — |
| Loan Disbursement | transfer | false | — |
| Refund / Reimbursement | transfer | false | — |

---

### 4.6 `clients`

Client directory for invoice generation (belongs to an entity).

| Field | Type | Description |
|---|---|---|
| `entityId` | `id<"entities">` | Owning entity |
| `userId` | `id<"users">` | Owning user |
| `name` | `string` | Client / company name |
| `email` | `optional<string>` | Invoice delivery email |
| `address` | `optional<string>` | Billing address |
| `currency` | `string` | Default invoice currency for this client |
| `whtRate` | `optional<number>` | Default WHT rate this client applies (0, 5, or 10) |

**Indexes:**
- `by_entityId` on `entityId`

---

### 4.7 `invoices`

| Field | Type | Description |
|---|---|---|
| `entityId` | `id<"entities">` | Issuing entity |
| `userId` | `id<"users">` | Owning user |
| `clientId` | `optional<id<"clients">>` | Linked client record |
| `invoiceNumber` | `string` | Sequential invoice number (e.g. "INV-2026-0042") |
| `status` | `"draft" \| "sent" \| "paid" \| "overdue" \| "cancelled"` | Invoice lifecycle |
| `issueDate` | `number` | Unix ms |
| `dueDate` | `number` | Unix ms |
| `currency` | `string` | Invoice currency |
| `subtotal` | `number` | Sum of line item totals |
| `whtAmount` | `number` | Total WHT deducted (shown on invoice) |
| `vatAmount` | `number` | VAT charged (if applicable) |
| `totalDue` | `number` | Amount client should pay after WHT |
| `amountNgn` | `optional<number>` | Naira equivalent at time of payment |
| `paidAt` | `optional<number>` | Unix ms when marked paid |
| `notes` | `optional<string>` | Notes shown on invoice |
| `isRecurring` | `boolean` | Whether this is a recurring invoice template |
| `recurringInterval` | `optional<"monthly" \| "quarterly">` | Recurring schedule |
| `nextIssueDate` | `optional<number>` | Next generation date for recurring invoices |
| `pdfStorageId` | `optional<string>` | Convex Storage ID for generated PDF |

**Indexes:**
- `by_entityId_status` on `[entityId, status]`
- `by_entityId_dueDate` on `[entityId, dueDate]`
- `by_userId` on `userId`

---

### 4.8 `invoiceItems`

Line items belonging to an invoice.

| Field | Type | Description |
|---|---|---|
| `invoiceId` | `id<"invoices">` | Parent invoice |
| `description` | `string` | Service / product description |
| `quantity` | `number` | Quantity |
| `unitPrice` | `number` | Price per unit in invoice currency |
| `total` | `number` | quantity × unitPrice |

**Indexes:**
- `by_invoiceId` on `invoiceId`

---

### 4.9 `importJobs`

Tracks the status of bank statement import operations.

| Field | Type | Description |
|---|---|---|
| `entityId` | `id<"entities">` | Entity being imported into |
| `userId` | `id<"users">` | Initiating user |
| `connectedAccountId` | `optional<id<"connectedAccounts">>` | Account being synced (if live link) |
| `source` | `"pdf" \| "csv" \| "bank_api" \| "paystack" \| "flutterwave" \| "manual"` | Import method |
| `status` | `"pending" \| "processing" \| "complete" \| "failed"` | Job status |
| `storageId` | `optional<string>` | Convex Storage ID of uploaded file |
| `totalParsed` | `optional<number>` | Transactions found in source |
| `totalImported` | `optional<number>` | Transactions successfully written |
| `duplicatesSkipped` | `optional<number>` | Duplicates detected and skipped |
| `errorMessage` | `optional<string>` | Failure reason |
| `startedAt` | `optional<number>` | Unix ms |
| `completedAt` | `optional<number>` | Unix ms |

**Indexes:**
- `by_entityId` on `entityId`
- `by_status` on `status`

---

### 4.10 `taxYearSummaries`

Cached / materialised tax calculation results per entity per year. Updated whenever the underlying transaction data changes.

| Field | Type | Description |
|---|---|---|
| `entityId` | `id<"entities">` | Entity |
| `taxYear` | `number` | Tax year (e.g. 2026) |
| `totalGrossIncome` | `number` | Sum of all taxable income (NGN) |
| `totalBusinessExpenses` | `number` | Sum of deductible business expenses (NGN) |
| `totalRentRelief` | `number` | Rent relief claimed (capped at ₦500k) |
| `totalPensionContributions` | `number` | Pension deductions |
| `totalOtherReliefs` | `number` | NHIS, NHF, insurance, mortgage interest |
| `taxableIncome` | `number` | After all deductions |
| `grossTaxLiability` | `number` | Before credits |
| `whtCredits` | `number` | WHT already withheld by clients |
| `netTaxPayable` | `number` | Final amount owed |
| `effectiveTaxRate` | `number` | Percentage (0–100) |
| `vatOutputTax` | `optional<number>` | VAT collected on sales |
| `vatInputTax` | `optional<number>` | VAT recoverable on purchases |
| `netVatPayable` | `optional<number>` | VAT position |
| `isSmallCompanyExempt` | `optional<boolean>` | CIT exemption flag for LLCs |
| `computedAt` | `number` | Unix ms when this was last calculated |

**Indexes:**
- `by_entityId_taxYear` on `[entityId, taxYear]` (unique)

---

### 4.11 `filingRecords`

Stores the output of the filing module.

| Field | Type | Description |
|---|---|---|
| `entityId` | `id<"entities">` | Entity filing the return |
| `userId` | `id<"users">` | Filing user |
| `taxYear` | `number` | Tax year being filed |
| `status` | `"draft" \| "generated" \| "submitted" \| "payment_pending" \| "payment_confirmed" \| "tcc_obtained"` | Filing lifecycle |
| `selfAssessmentPdfId` | `optional<string>` | Storage ID of generated PDF |
| `paymentReceiptId` | `optional<string>` | Storage ID of payment receipt |
| `tccDocumentId` | `optional<string>` | Storage ID of Tax Clearance Certificate |
| `submittedAt` | `optional<number>` | Unix ms user confirmed submission |
| `netTaxPayable` | `number` | Amount at time of filing |
| `taxSummarySnapshot` | `string` | JSON snapshot of full tax summary at filing time (immutable audit record) |

**Indexes:**
- `by_entityId_taxYear` on `[entityId, taxYear]`

---

### 4.12 `notifications`

In-app notification records.

| Field | Type | Description |
|---|---|---|
| `userId` | `id<"users">` | Recipient |
| `type` | `"deadline_reminder" \| "uncategorised_transactions" \| "invoice_overdue" \| "import_complete" \| "import_failed" \| "vat_due" \| "sync_error"` | Notification type |
| `title` | `string` | Short heading |
| `body` | `string` | Full message |
| `entityId` | `optional<id<"entities">>` | Related entity |
| `relatedId` | `optional<string>` | ID of related document (invoice, import job, etc.) |
| `read` | `boolean` | Whether user has seen it |
| `readAt` | `optional<number>` | Unix ms |

**Indexes:**
- `by_userId_read` on `[userId, read]`
- `by_userId_creationTime` on `[userId, _creationTime]`

---

### 4.13 `userPreferences`

Per-user settings (one document per user).

| Field | Type | Description |
|---|---|---|
| `userId` | `id<"users">` | User (indexed unique) |
| `deadlineReminderDays` | `number[]` | Lead days for filing reminders (e.g. [30, 14, 7, 1]) |
| `vatReminderEnabled` | `boolean` | VAT return reminders on/off |
| `uncategorisedAlertFrequency` | `"daily" \| "weekly" \| "off"` | How often to alert about uncategorised transactions |
| `invoiceOverdueDays` | `number` | Days after due date to trigger overdue alert |
| `pushEnabled` | `boolean` | Whether push notifications are enabled |

**Indexes:**
- `by_userId` on `userId` (unique)

---

## 5. Backend Functions by Domain

Functions are organised in `convex/` by domain module. Naming convention: `domain/functionName`.

---

### 5.1 Auth Domain (`convex/http.ts` — Clerk Webhooks)

Authentication is handled by Clerk on the client side. The backend receives Clerk webhook events and maintains the `users` table:

| Function | Type | Description |
|---|---|---|
| `clerk.webhook` | HTTP Action | Receives Clerk webhook events (`user.created`, `user.updated`, `user.deleted`); verifies signature via `svix`; creates/updates/deletes `users` documents |
| `users.getMe` | Query | Return current user's profile from `users` table using `ctx.auth.getUserIdentity()` |

---

### 5.2 Users Domain (`convex/users/`)

| Function | Type | Description |
|---|---|---|
| `users.createProfile` | Mutation | Called after sign-up; writes initial `users` document |
| `users.updateProfile` | Mutation | Update name, phone, profession, preferredCurrency |
| `users.updateNin` | Mutation | Store encrypted NIN; validates format (11 digits) |
| `users.completeOnboarding` | Mutation | Sets `onboardingComplete: true` |
| `users.uploadAvatar` | Mutation | Accepts storageId, updates avatarStorageId |
| `users.getPreferences` | Query | Returns `userPreferences` document |
| `users.updatePreferences` | Mutation | Update notification preferences |

---

### 5.3 Entities Domain (`convex/entities/`)

| Function | Type | Description |
|---|---|---|
| `entities.list` | Query | All entities for current user |
| `entities.get` | Query | Single entity by ID (validates ownership) |
| `entities.create` | Mutation | Create a new tax entity |
| `entities.update` | Mutation | Update entity fields |
| `entities.setDefault` | Mutation | Set one entity as default (clears others) |
| `entities.delete` | Mutation | Soft-delete entity (archive, not physical delete) |

---

### 5.4 Connected Accounts Domain (`convex/accounts/`)

| Function | Type | Description |
|---|---|---|
| `accounts.list` | Query | All connected accounts for an entity |
| `accounts.add` | Mutation | Create a `connectedAccounts` document |
| `accounts.disconnect` | Mutation | Set status to "disconnected", clear tokens |
| `accounts.syncNow` | Action | Trigger manual sync for a live-linked account; calls bank API, writes transactions via mutation |
| `accounts.handleOAuthCallback` | Action | Exchange OAuth code for tokens; store encrypted in `connectedAccounts` |
| `accounts.refreshToken` | Action | Refresh expired access token using stored refresh token |

---

### 5.5 Transactions Domain (`convex/transactions/`)

| Function | Type | Description |
|---|---|---|
| `transactions.list` | Query | Paginated transaction list; filters: entityId, taxYear, type, categoryId, dateRange, search |
| `transactions.getUncategorised` | Query | Transactions where type = "uncategorised" for an entity (for triage UI) |
| `transactions.get` | Query | Single transaction by ID |
| `transactions.update` | Mutation | Update description, type, categoryId, isDeductible, deductiblePercent, notes, whtDeducted |
| `transactions.bulkCategorise` | Mutation | Apply same category/type to multiple transaction IDs |
| `transactions.delete` | Mutation | Remove a transaction |
| `transactions.manualCreate` | Mutation | Create a transaction from manual entry form |
| `transactions.initiateImport` | Mutation | Creates `importJobs` document, schedules `processImport` action |
| `transactions.processImport` | Action | Parses file from Storage, calls Claude for categorisation, calls `batchUpsert` mutation |
| `transactions.batchUpsert` | Mutation | Write array of parsed transactions; deduplication logic runs here |
| `transactions.autoCategorise` | Action | Run AI categorisation on a batch of existing uncategorised transactions |
| `transactions.matchInvoice` | Mutation | Link a transaction to an invoice; updates both documents |

---

### 5.6 Categories Domain (`convex/categories/`)

| Function | Type | Description |
|---|---|---|
| `categories.listAll` | Query | Return all system categories + user-created categories |
| `categories.create` | Mutation | Create a custom category for a user |
| `categories.update` | Mutation | Edit user-created category (name, icon, color) |
| `categories.delete` | Mutation | Delete user-created category (reassigns transactions to "uncategorised") |

---

### 5.7 Clients Domain (`convex/clients/`)

| Function | Type | Description |
|---|---|---|
| `clients.list` | Query | All clients for an entity |
| `clients.create` | Mutation | Add a new client |
| `clients.update` | Mutation | Edit client details |
| `clients.delete` | Mutation | Remove client (does not affect existing invoices) |

---

### 5.8 Invoices Domain (`convex/invoices/`)

| Function | Type | Description |
|---|---|---|
| `invoices.list` | Query | Paginated invoice list; filters: entityId, status, clientId |
| `invoices.get` | Query | Single invoice with its line items |
| `invoices.create` | Mutation | Create invoice + line items; auto-generates invoice number |
| `invoices.update` | Mutation | Edit invoice fields and line items; recalculates totals |
| `invoices.send` | Action | Generate PDF (calls NestJS PDF service), store in Convex Storage, send email, update status to "sent" |
| `invoices.markPaid` | Mutation | Set status to "paid", record paidAt, create matching income transaction |
| `invoices.cancel` | Mutation | Set status to "cancelled" |
| `invoices.generateRecurring` | Action | Scheduled action: create next invoice from recurring template, update nextIssueDate |
| `invoices.generatePdf` | Action | Generate PDF only (for preview/download without sending) |
| `invoices.generateNumber` | Mutation (internal) | Atomically increment and return next invoice number for entity |

---

### 5.9 Tax Summary Domain (`convex/tax/`)

| Function | Type | Description |
|---|---|---|
| `tax.getSummary` | Query | Live tax summary for entity + tax year; reads transactions + deductions, runs calculation engine inline (pure reads, no side effects) |
| `tax.getFilingChecklist` | Query | Checklist readiness: completeness of imported accounts, uncategorised count, confirmed income, etc. |
| `tax.refreshSummaryCache` | Mutation | Recompute and write to `taxYearSummaries` (called after bulk imports) |
| `tax.getDeductionBreakdown` | Query | Detailed breakdown of expenses by category with deductible amounts |
| `tax.getWhtCredits` | Query | Sum of all WHT credits recorded in transactions |

---

### 5.10 Filing Domain (`convex/filing/`)

| Function | Type | Description |
|---|---|---|
| `filing.getRecord` | Query | Current filing record for entity + tax year |
| `filing.initiate` | Mutation | Create or retrieve `filingRecords` document in "draft" status |
| `filing.generateSelfAssessment` | Action | Snapshot tax summary → call NestJS PDF service → store PDF → update filing record to "generated" |
| `filing.uploadPaymentReceipt` | Mutation | Accept storageId, update filing record with receipt |
| `filing.uploadTcc` | Mutation | Accept storageId, update filing record with TCC |
| `filing.markSubmitted` | Mutation | Update status to "submitted" with timestamp |

---

### 5.11 Dashboard Domain (`convex/dashboard/`)

| Function | Type | Description |
|---|---|---|
| `dashboard.getSummary` | Query | Aggregated dashboard data: income YTD, expense YTD, estimated tax, uncategorised count, overdue invoices; computed from other tables in a single reactive query |
| `dashboard.getRecentTransactions` | Query | Last 5 transactions for entity |
| `dashboard.getDeadlines` | Query | Upcoming deadline dates based on today's date and entity type |

---

### 5.12 Reports Domain (`convex/reports/`)

| Function | Type | Description |
|---|---|---|
| `reports.getIncome` | Query | Income by category and month for date range |
| `reports.getExpenses` | Query | Expenses by category for date range |
| `reports.getYearOnYear` | Query | Side-by-side income/expense/tax data for two years |
| `reports.exportCsv` | Action | Generate CSV string from transaction data; returns as downloadable file |
| `reports.exportPdf` | Action | Call NestJS PDF service for formatted report PDF |

---

### 5.13 Notifications Domain (`convex/notifications/`)

| Function | Type | Description |
|---|---|---|
| `notifications.list` | Query | All notifications for user, ordered by creation time desc |
| `notifications.getUnreadCount` | Query | Count of unread notifications |
| `notifications.markRead` | Mutation | Set read: true, readAt: now |
| `notifications.markAllRead` | Mutation | Mark all user notifications as read |
| `notifications.create` | Mutation (internal) | Create notification document — called from scheduled functions and actions |

---

## 6. HTTP Actions (Webhooks & Public Endpoints)

HTTP Actions are defined in `convex/http.ts`. They receive raw HTTP requests, validate signatures, and call internal mutations.

### 6.1 Paystack Webhook

**Endpoint:** `POST /webhooks/paystack`

**Validation:** HMAC-SHA512 signature check against `PAYSTACK_SECRET_KEY` env var (header: `x-paystack-signature`).

**Events handled:**

| Event | Action |
|---|---|
| `charge.success` | Find matching invoice by reference → call `invoices.markPaid` mutation |
| `transfer.success` | Log as income transaction if reference matches a known invoice |
| `transfer.failed` | Update notification — payment failed |

---

### 6.2 Flutterwave Webhook

**Endpoint:** `POST /webhooks/flutterwave`

**Validation:** Verify `verif-hash` header against `FLUTTERWAVE_SECRET_HASH` env var.

**Events handled:** Same pattern as Paystack — match on `txRef` or `flwRef` to invoice records.

---

### 6.3 Open Banking Notification (future)

**Endpoint:** `POST /webhooks/bank-notification`

**Purpose:** Receive push notifications from bank APIs (Mono, Stitch) when new transactions are available. Triggers a sync action for the relevant connected account.

---

### 6.4 Invoice Public View (future)

**Endpoint:** `GET /invoice/:token`

A tokenised public URL that renders an invoice for client viewing without requiring authentication. The token is a signed, expiring JWT stored in the `invoices` document.

---

## 7. Scheduled Functions

Defined using `crons.ts` in the Convex project. All scheduled functions call internal mutations or actions.

| Function | Schedule | Description |
|---|---|---|
| `reminders.checkFilingDeadline` | Daily at 08:00 WAT | Check all active users; if deadline is in 30, 14, 7, or 1 day (per preferences), create notification |
| `reminders.checkVatDeadline` | Daily at 08:00 WAT | For VAT-registered entities, check if the 21st of the month is within preference window |
| `invoices.checkOverdue` | Daily at 09:00 WAT | Find invoices past due date with status "sent" → update status to "overdue", create notification |
| `invoices.generateRecurring` | Daily at 07:00 WAT | Find recurring invoice templates where nextIssueDate ≤ today → generate new invoice |
| `accounts.scheduledSync` | Every 6 hours | For active live-linked accounts, trigger `accounts.syncNow` action |
| `reminders.uncategorisedAlert` | Daily at 10:00 WAT | For users with daily alert preference, check uncategorised count; notify if > 0 |
| `reminders.uncategorisedAlertWeekly` | Mondays at 10:00 WAT | Same check for users with weekly preference |

---

## 8. File Storage

All files use **Convex Storage**. The client obtains an upload URL, uploads directly to Convex Storage (bypassing the Convex function layer for large files), and then passes the returned `storageId` to a mutation.

### 8.1 Upload Flow

```
Client: const uploadUrl = await convex.mutation(api.files.generateUploadUrl)
Client: fetch(uploadUrl, { method: "POST", body: file })  → returns { storageId }
Client: convex.mutation(api.transactions.initiateImport, { storageId })
```

### 8.2 Stored File Types

| Purpose | Stored By | Accessed By |
|---|---|---|
| Bank statement (PDF/CSV) | User upload | `transactions.processImport` action |
| Invoice PDF | `invoices.send` action | Client via signed URL, `invoices.generatePdf` |
| Self-assessment PDF | `filing.generateSelfAssessment` action | User download |
| Payment receipt | User upload | Stored for records |
| Tax Clearance Certificate | User upload | Stored for records |
| Profile avatar | User upload | `users.uploadAvatar` |

### 8.3 Access Control

Files are accessed via Convex's `ctx.storage.getUrl(storageId)` which returns a short-lived signed URL. URLs are generated inside queries/mutations after ownership is verified — files are never publicly addressable by storage ID alone.

---

## 9. External Integrations

### 9.1 AI Categorisation — Claude API (Anthropic)

**Used in:** `transactions.processImport` action, `transactions.autoCategorise` action

**Approach:** Batch categorisation. A prompt containing the list of available system categories and a batch of transaction descriptions (up to 100 at a time) is sent to Claude. Claude returns a JSON array of category assignments with confidence scores.

**Prompt structure (simplified):**
```
You are a Nigerian tax assistant. Classify each transaction below into one of the provided categories.

Categories: [{ id, name, type, isDeductible }]

Transactions:
[{ id, date, description, amount, direction, currency }]

Return JSON: [{ id, categoryName, type, isDeductible, confidence }]
```

**Model:** `claude-haiku-4-5-20251001` (cost-efficient for bulk classification)

**Fallback:** If AI call fails or confidence < 0.7, transaction remains "uncategorised" for user review.

---

### 9.2 Nigerian Open Banking — Mono / Stitch

**Used in:** `accounts.syncNow` action, `accounts.handleOAuthCallback` action

**Purpose:** Live bank account linking and transaction retrieval for supported Nigerian banks.

**Flow:**
1. Client opens Mono/Stitch Connect widget (in-app browser / WebView)
2. User authenticates with their bank
3. Provider calls OAuth callback → `accounts.handleOAuthCallback` HTTP Action
4. App stores encrypted access/refresh tokens in `connectedAccounts`
5. `accounts.syncNow` calls provider API to fetch new transactions since `lastSyncedAt`

**Note:** Open Banking coverage in Nigeria is still maturing. PDF/CSV import remains the primary path for v1. Bank API integration is additive.

---

### 9.3 Paystack & Flutterwave

**Used in:** `accounts.syncNow` action, webhook handlers

**Purpose:** Retrieve transaction history from payment processor accounts used by freelancers.

**Auth:** API key stored in Convex environment variables (never in client).

---

### 9.4 CBN Foreign Exchange Rates

**Used in:** `transactions.processImport` action, `transactions.manualCreate` mutation

**Purpose:** Convert foreign currency transaction amounts to NGN at the CBN rate on the date of the transaction, as required by the NTA.

**Source:** CBN public rate API (or a maintained rate table if the API is unavailable). Rates are fetched once per day and cached in a `fxRates` table to avoid repeated calls.

---

### 9.5 Email Service — Resend

**Used in:** `invoices.send` action, system emails (Clerk handles auth emails like password reset via its own email service; Resend is for app-level emails)

**Purpose:** Send invoices to clients and system emails (verification, password reset).

**Configuration:** `RESEND_API_KEY` in Convex environment variables. Sender domain verified.

---

### 9.6 NestJS Auxiliary Service — PDF Generation

Convex Actions run in a constrained V8 environment that is not suited for heavy PDF generation libraries (e.g., Puppeteer, PDFKit). A lightweight **NestJS microservice** handles PDF generation only.

**Hosted on:** Railway or Fly.io (separate from Convex)

**Endpoints:**

| Route | Purpose |
|---|---|
| `POST /pdf/invoice` | Accept invoice data JSON → return PDF buffer |
| `POST /pdf/self-assessment` | Accept tax summary JSON → return NRS-format self-assessment PDF |
| `POST /pdf/report` | Accept report data JSON → return formatted report PDF |

**Security:** The service is not publicly accessible. It is called only from Convex Actions using a shared secret (`PDF_SERVICE_SECRET` env var on both sides). All calls are server-to-server.

**Called by:** `invoices.send`, `invoices.generatePdf`, `filing.generateSelfAssessment`, `reports.exportPdf` actions.

---

## 10. Tax Calculation Engine

The tax engine runs inside `tax.getSummary` (a live Convex Query) and `tax.refreshSummaryCache` (a Mutation). Because Queries are pure and reactive, the dashboard always shows an up-to-date estimate without any manual recalculation step.

### 10.1 Engine Input

```typescript
type TaxEngineInput = {
  entityType: "individual" | "business_name" | "llc";
  taxYear: number;
  transactions: Transaction[];   // All categorised transactions for the year
  invoices: Invoice[];           // For WHT credit reconciliation
  deductions: {
    rentPaidAnnual?: number;     // User-declared rent for rent relief calculation
    pensionContributions?: number;
    nhisContributions?: number;
    nhfContributions?: number;
    lifeInsurancePremiums?: number;
    mortgageInterest?: number;
  };
};
```

### 10.2 Calculation Steps — Personal Income Tax (Individual / Business Name)

```
Step 1: GROSS INCOME
  Sum all transactions where:
  - type = "income"
  - taxYear matches
  → totalGrossIncome (NGN)

Step 2: BUSINESS EXPENSES
  Sum all transactions where:
  - type = "business_expense"
  - isDeductible = true
  - Apply deductiblePercent (e.g. 60% of ₦50,000 = ₦30,000)
  → totalDeductibleExpenses (NGN)

Step 3: RELIEFS
  Rent Relief     = min(rentPaidAnnual × 0.20, 500_000)
  Pension         = pensionContributions (as declared)
  NHIS            = nhisContributions
  NHF             = nhfContributions
  Life Insurance  = lifeInsurancePremiums
  Mortgage Int.   = mortgageInterest
  → totalReliefs (NGN)

Step 4: TAXABLE INCOME
  taxableIncome = totalGrossIncome - totalDeductibleExpenses - totalReliefs
  if taxableIncome < 0: taxableIncome = 0

Step 5: PROGRESSIVE TAX BANDS (NTA 2025)
  Band 1:  ₦0       – ₦800,000       → 0%
  Band 2:  ₦800,001 – ₦2,200,000     → 15%
  Band 3:  ₦2,200,001 – ₦4,200,000   → 18%
  Band 4:  ₦4,200,001 – ₦6,200,000   → 21%
  Band 5:  ₦6,200,001 – ₦56,200,000  → 23%
  Band 6:  Above ₦56,200,000          → 25%

  grossTaxLiability = sum of tax across applicable bands

Step 6: WHT CREDITS
  whtCredits = sum of whtDeducted on all income transactions

Step 7: NET TAX PAYABLE
  netTaxPayable = max(grossTaxLiability - whtCredits, 0)

Step 8: EFFECTIVE RATE
  effectiveTaxRate = (netTaxPayable / totalGrossIncome) × 100
```

### 10.3 Calculation Steps — Small Company (LLC)

```
Step 1: Determine CIT Exemption
  If turnover ≤ ₦100,000,000 AND fixedAssets ≤ ₦250,000,000:
    isSmallCompanyExempt = true
    CIT = 0, CGT = 0, DevelopmentLevy = 0
    → only file nil return

  Else:
    CIT = assessableProfit × 0.30
    DevelopmentLevy = assessableProfit × 0.04

Step 2: VAT (if vatRegistered)
  netVatPayable = vatOutputTax - vatInputTax
  if netVatPayable < 0: vatRefundClaim = abs(netVatPayable)
```

### 10.4 Tax Calculation Versioning

Tax law changes must not silently alter historical computations. The engine version is stored alongside every `taxYearSummaries` document. When the engine logic changes (e.g., new bands), old cached summaries retain their version tag so audits remain consistent.

```typescript
const TAX_ENGINE_VERSION = "2026-01-01"; // date the current ruleset came into effect
```

---

## 11. Security & Compliance

### 11.1 Data Encryption

| Data | At Rest | In Transit |
|---|---|---|
| All Convex documents | Encrypted by Convex platform (AES-256) | TLS 1.3 |
| NIN field | Additionally application-level encrypted before write (AES-256-GCM, key in Convex env) | — |
| OAuth access/refresh tokens | Application-level encrypted before write | — |
| Files in Convex Storage | Encrypted by Convex platform | TLS (signed URLs) |

NIN encryption utility (called in mutations before writing):
```typescript
// convex/lib/crypto.ts
export function encryptField(plaintext: string): string { /* AES-256-GCM */ }
export function decryptField(ciphertext: string): string { /* AES-256-GCM */ }
```

### 11.2 Authorisation Rules

Every function enforces ownership — users can only access their own data:

```typescript
// Pattern used in every query/mutation (identity populated by Clerk JWT)
const identity = await ctx.auth.getUserIdentity();
const entity = await ctx.db.get(args.entityId);
if (entity.userId !== identity.subject) {
  throw new ConvexError("Forbidden");
}
```

### 11.3 Input Validation

All mutation arguments are validated using Convex's `v` validators in the function argument schema. This prevents type confusion and injection at the framework level. Additional business-rule validation (e.g., NIN must be exactly 11 digits) is done as explicit checks inside the function body.

### 11.4 Rate Limiting

Convex does not have built-in rate limiting. Abuse prevention is handled by:
- Checking import job counts before allowing a new import (max 5 concurrent jobs per user)
- AI categorisation calls are batched and rate-limited in the Action (max 100 transactions per call, with delays between batches)

### 11.5 Nigeria Data Protection Act 2023 Compliance

- Users are shown a clear privacy policy during sign-up explaining what financial data is collected and why
- NIN data is encrypted and access-logged
- Users can request full data export (reports export covers all transaction data)
- Account deletion removes all user documents and associated files from Convex Storage
- No financial data is shared with third parties except as required for bank API integrations (subject to user consent during account linking)

### 11.6 Webhook Security

All incoming webhooks verify provider signatures before processing. Unverified requests are rejected with HTTP 401. Webhook processing is idempotent — duplicate events (same `externalRef`) are detected and skipped in `transactions.batchUpsert`.

---

## 12. Environments & Deployment

### 12.1 Convex Environments

| Environment | Purpose | Convex Project |
|---|---|---|
| `development` | Local dev with `npx convex dev` | Separate Convex project (auto-provisioned) |
| `staging` | Pre-production testing | Dedicated Convex project |
| `production` | Live users | Dedicated Convex project |

Each environment has its own isolated database, storage, and environment variables.

### 12.2 Environment Variables (Convex)

Set via `npx convex env set KEY VALUE` or Convex dashboard. Never committed to source control.

| Variable | Purpose |
|---|---|
| `CLERK_WEBHOOK_SECRET` | Clerk webhook signature verification (svix) |
| `ANTHROPIC_API_KEY` | Claude API for categorisation |
| `RESEND_API_KEY` | Email sending |
| `PAYSTACK_SECRET_KEY` | Paystack webhook verification + API calls |
| `FLUTTERWAVE_SECRET_HASH` | Flutterwave webhook verification |
| `MONO_SECRET_KEY` | Mono Open Banking API |
| `PDF_SERVICE_URL` | URL of NestJS PDF generation service |
| `PDF_SERVICE_SECRET` | Shared secret for PDF service authentication |
| `FIELD_ENCRYPTION_KEY` | AES-256 key for NIN / token encryption |
| `CBN_RATE_API_KEY` | FX rate data source |

### 12.3 NestJS PDF Service Deployment

- **Platform:** Railway (or Fly.io)
- **Runtime:** Node.js 20
- **Dockerfile:** Standard NestJS container
- **Scaling:** Single instance sufficient for v1; stateless so horizontally scalable
- **Internal only:** Not exposed publicly; only accepts requests with correct `PDF_SERVICE_SECRET` header

### 12.4 CI/CD

| Stage | Tool | Trigger |
|---|---|---|
| Type checking | `tsc --noEmit` | On every push |
| Linting | ESLint + Prettier | On every push |
| Convex function push | `npx convex deploy` | On merge to `main` (production) |
| NestJS build + deploy | Railway auto-deploy | On merge to `main` |
| Staging deploy | Same pipeline | On merge to `staging` branch |

---

## 13. Error Handling & Observability

### 13.1 Error Types

| Error Class | Usage |
|---|---|
| `ConvexError("Unauthenticated")` | Clerk JWT missing or invalid — client receives 401-equivalent |
| `ConvexError("Forbidden")` | Ownership check failed |
| `ConvexError("Not found")` | Document does not exist |
| `ConvexError("Validation: ...")` | Business rule violation (e.g. invalid NIN format) |
| Unhandled throw | Convex marks function as failed; client receives generic error |

Errors thrown from Convex functions are serialised and available in the client SDK as typed `ConvexError` objects, allowing the React Native app to show appropriate UI messages.

### 13.2 Import Job Failure Handling

If `transactions.processImport` throws:
1. The Action catches the error
2. Calls `importJobs.updateStatus(jobId, "failed", errorMessage)` mutation
3. Creates a notification for the user: "Import failed — please try again or use a different file format"
4. The import job document retains the error message for debugging

### 13.3 Logging

Convex provides built-in function logs accessible in the Convex dashboard. Actions should use `console.log` / `console.error` for structured logging. Key events to log:
- Import job start/complete/fail (with transaction counts)
- AI categorisation call (batch size, success/fail)
- Bank sync (transactions fetched, new vs duplicate)
- Webhook received (event type, reference, resolution)

### 13.4 Monitoring

- **Convex Dashboard:** Function execution logs, error rates, query performance
- **Sentry (optional v2):** Client-side error tracking in React Native app
- **Uptime monitoring:** Simple HTTP ping to NestJS PDF service health endpoint (`GET /health`)

---

*End of Backend & Infrastructure Specification — v1.0*
