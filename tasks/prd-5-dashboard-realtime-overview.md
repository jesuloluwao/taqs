# PRD-5: Dashboard & Real-Time Overview

**TaxEase Nigeria**  
**Version:** 1.0 — February 2026  
**Status:** Draft  
**Priority:** P1 — Build After PRD-3  
**Depends On:** PRD-0 (Auth, Entity, Navigation Shell), PRD-1 (Transactions), PRD-3 (Tax Engine)  
**Estimated Effort:** 1–2 weeks

---

## Table of Contents

1. [Overview](#1-overview)
2. [Entities (TypeScript Interfaces)](#2-entities-typescript-interfaces)
3. [User Stories](#3-user-stories)
4. [UI Specifications](#4-ui-specifications)
5. [Functional Requirements](#5-functional-requirements)
6. [API Requirements (Convex Functions)](#6-api-requirements-convex-functions)
7. [Data Models](#7-data-models)
8. [Non-Goals](#8-non-goals)
9. [Success Metrics](#9-success-metrics)
10. [Open Questions](#10-open-questions)

---

## 1. Overview

### 1.1 Purpose

PRD-5 transforms the empty Dashboard shell delivered in PRD-0 into a rich, reactive home screen that presents the user's complete financial and tax position at a glance. The Dashboard is a **read-only aggregation layer** — it introduces no new database tables and instead reads across transactions, tax summaries, invoices, and entity metadata to compose a unified view.

This is the screen users see every time they open TaxEase. It must be fast, accurate, and immediately useful.

### 1.2 Scope

| In Scope | Out of Scope |
|----------|--------------|
| Tax Position Summary card (liability, effective rate, deadline countdown) | Tax calculation logic (PRD-3) |
| Quick Stats row (income, expenses, WHT credits, outstanding invoices) | Transaction import/management (PRD-1) |
| Uncategorised Transactions Banner (conditional, navigational) | AI categorisation (PRD-2) |
| Recent Transactions list (last 5, tappable) | Invoice CRUD (PRD-4) |
| Invoice Activity card (sent count, outstanding, overdue) | Filing module (PRD-6) |
| Deadline & Compliance Reminders (scrollable chips) | Reports/Charts (PRD-7) |
| Deadline Countdown Widget (colour transitions) | Push notification delivery (PRD-9) |
| Dashboard loading/error/empty states | |
| Entity switching context refresh | |
| Tax year switching | |
| Real-time reactivity via Convex live queries | |

### 1.3 What It Delivers

Upon completion of PRD-5, a user can:

1. **See their tax position:** Estimated tax liability, effective rate, and days to filing deadline — all in a prominent header card
2. **Scan key metrics:** Income YTD, business expenses, WHT credits, and outstanding invoices in a horizontally scrollable Quick Stats row
3. **Act on uncategorised items:** Amber banner appears when transactions need categorisation, with a direct CTA to triage
4. **Review recent activity:** Last 5 transactions at a glance, with tap-to-detail and "View All" navigation
5. **Monitor invoicing health:** Invoices sent this month, outstanding total, overdue count
6. **Stay deadline-aware:** Scrollable compliance reminder chips and a countdown widget that changes colour as the filing deadline approaches
7. **Switch context:** Entity and tax year changes immediately refresh all dashboard data

### 1.4 Dependencies

- **PRD-0** (Auth, Entities, Navigation Shell, Empty Dashboard) — already built
- **PRD-1** (Transactions — income/expense YTD, recent transactions, uncategorised count) — already built
- **PRD-3** (Tax Engine — estimated tax liability, effective rate, taxYearSummaries) — already built
- **PRD-4** (Invoicing — outstanding/overdue invoices) — partial data acceptable; dashboard degrades gracefully if invoicing is not yet complete
- **Blocks:** Nothing directly — downstream PRDs may add dashboard cards but this PRD is self-contained

### 1.5 Key Design Decisions

1. **Single reactive query pattern:** `dashboard.getSummary` composes data from multiple Convex tables within one query function, leveraging Convex's automatic reactivity to update the UI whenever upstream data changes
2. **No new tables:** The Dashboard reads from `transactions`, `taxYearSummaries`, `invoices`, `entities`, and `userPreferences` — it does not materialise a separate "dashboard cache" table
3. **Graceful degradation:** If PRD-4 (invoicing) is incomplete, invoice-related cards show a placeholder or hide entirely; the rest of the dashboard remains fully functional
4. **Performance-first:** All queries leverage existing Convex indexes (by_entityId_taxYear, by_entityId_date, etc.) to avoid full-collection scans

---

## 2. Entities (TypeScript Interfaces)

These interfaces define the response shapes consumed by the Dashboard frontend. They are **derived types** — composed from data in existing tables — not new database entities.

### 2.1 DashboardSummary

```typescript
/** Aggregated dashboard data returned by dashboard.getSummary */
interface DashboardSummary {
  entityId: Id<"entities">;
  entityName: string;
  entityType: "individual" | "business_name" | "llc";
  taxYear: number;

  // Tax Position (from tax engine / taxYearSummaries)
  estimatedTaxLiability: number;      // Net tax payable (NGN)
  effectiveTaxRate: number;           // 0–1 (e.g. 0.0607 = 6.07%)
  grossIncome: number;                // Total gross income YTD
  isNilReturn: boolean;

  // Quick Stats
  totalIncome: number;                // Sum of income transactions YTD (NGN)
  totalBusinessExpenses: number;      // Sum of deductible business expenses YTD (NGN)
  whtCredits: number;                 // Total WHT credits YTD (NGN)
  invoicesOutstandingCount: number;   // Count of unpaid invoices
  invoicesOutstandingTotal: number;   // Total value of unpaid invoices (NGN)

  // Uncategorised
  uncategorisedCount: number;         // Transactions needing categorisation

  // Invoice Activity
  invoicesSentThisMonth: number;      // Invoices created in current calendar month
  invoicesOverdueCount: number;       // Invoices past due date
  invoicesOverdueTotal: number;       // Total value of overdue invoices (NGN)

  // Metadata
  computedAt: number;                 // Timestamp of last tax engine computation
  hasTransactions: boolean;           // Whether entity has any transactions at all
  hasInvoices: boolean;               // Whether entity has any invoices at all
}
```

### 2.2 RecentTransaction

```typescript
/** Compact transaction shape for the Dashboard recent list */
interface RecentTransaction {
  _id: Id<"transactions">;
  date: number;                       // Unix ms
  description: string;                // Truncated to ~50 chars on frontend
  amount: number;                     // Absolute value
  amountNgn: number;                  // Naira equivalent
  currency: string;                   // ISO 4217
  direction: "credit" | "debit";
  type: "income" | "business_expense" | "personal_expense" | "transfer" | "uncategorised";
  categoryName?: string;              // Resolved category name (or undefined if uncategorised)
  categoryColor?: string;             // Category colour token
}
```

### 2.3 DeadlineReminder

```typescript
/** A compliance deadline or reminder chip */
interface DeadlineReminder {
  id: string;                         // Unique key for rendering
  label: string;                      // Display text (e.g. "VAT return due 21 Feb")
  type: "filing" | "vat" | "invoice_overdue" | "general";
  severity: "info" | "warning" | "danger";
  dueDate?: number;                   // Unix ms (if date-based)
  daysRemaining?: number;             // Days until due (negative = overdue)
  navigateTo: string;                 // Route to navigate on tap (e.g. "/filing", "/invoices")
}
```

### 2.4 DeadlineCountdown

```typescript
/** Deadline countdown widget state */
interface DeadlineCountdown {
  label: string;                      // e.g. "2026 Self-Assessment Deadline"
  dueDate: number;                    // Unix ms for March 31
  daysRemaining: number;              // Positive = days until, negative = overdue
  severity: "success" | "warning" | "danger";
  isVisible: boolean;                 // Only visible within 60 days of deadline
}
```

### 2.5 QuickStatCard

```typescript
/** Individual metric card in the Quick Stats row */
interface QuickStatCard {
  id: string;
  label: string;                      // e.g. "Total Income"
  value: number;                      // Numeric value
  formattedValue: string;             // e.g. "₦4,200,000"
  subtitle?: string;                  // e.g. "3 unpaid" for invoices
  navigateTo: string;                 // Route on tap
  icon?: string;                      // Icon name or component key
}
```

### 2.6 InvoiceActivitySummary

```typescript
/** Invoice activity card data */
interface InvoiceActivitySummary {
  sentThisMonth: number;              // Count of invoices created this calendar month
  outstandingAmount: number;          // Total outstanding (NGN)
  outstandingCount: number;           // Count of unpaid invoices
  overdueCount: number;               // Count of overdue invoices
  overdueAmount: number;              // Total overdue (NGN)
}
```

---

## 3. User Stories

### US-501: View populated Dashboard

**As a** user with transactions and tax data  
**I want** to see the Dashboard with all cards populated with my real data  
**So that** I have an immediate, clear view of my financial and tax position.

**Trigger:** User logs in and lands on Dashboard, or navigates via side drawer.

**Flow:**
1. User lands on Dashboard for active entity and current tax year
2. All cards load with live data: Tax Position, Quick Stats, Uncategorised Banner (if applicable), Recent Transactions, Invoice Activity, Deadline Reminders
3. Data is reactive — if another tab/device changes a transaction, the Dashboard updates in real time

**Acceptance Criteria:**
- [ ] Dashboard displays all six card sections per Frontend Spec §6
- [ ] Data reflects active entity and selected tax year
- [ ] All monetary values formatted with ₦ prefix and thousands separators (e.g. ₦4,200,000)
- [ ] Dashboard loads within 2 seconds on a typical connection
- [ ] Changes to upstream data (transactions, invoices) reflect on Dashboard without manual refresh

---

### US-502: Tax Position Summary card

**As a** freelancer  
**I want** to see my estimated tax liability prominently at the top of the Dashboard  
**So that** I know exactly how much I may owe at a glance.

**Trigger:** Dashboard loads.

**Flow:**
1. Tax Position Summary card renders at the top with `primary-light` (#E8F5F0) background
2. Left side: year label (e.g. "2026 Tax Year") and days-to-deadline badge
3. Centre: large estimated tax liability in mono font; coloured `danger` (#E53E3E) if > ₦0, `success` (#38A169) if ₦0
4. Below: "Effective Rate: X.X%" in `body-sm`
5. Right: donut/arc chart showing liability vs gross income ratio

**Acceptance Criteria:**
- [ ] Year label matches selected tax year
- [ ] Days-to-deadline badge shows "X days to filing deadline" (e.g. "37 days to filing deadline")
- [ ] Estimated Tax Liability displayed in `mono` 15px font
- [ ] Liability > ₦0 coloured `danger`; ₦0 coloured `success`
- [ ] Effective rate shown as percentage (e.g. "Effective Rate: 6.1%")
- [ ] Donut/arc chart renders with correct liability-to-income ratio
- [ ] Nil return: card shows "₦0 — Nil Return" with `success` colour and "Filing still required" note
- [ ] Card taps navigate to Tax Summary screen

---

### US-503: Quick Stats row

**As a** user  
**I want** to see Total Income, Business Expenses, WHT Credits, and Invoices Outstanding in a scrollable row  
**So that** I can scan my key financial metrics without navigating away.

**Trigger:** Dashboard loads.

**Flow:**
1. Horizontal scrollable row of four compact metric cards renders below Tax Position
2. Each card shows: label, formatted monetary value (or count + value), and is tappable
3. Tapping navigates to the relevant section

**Acceptance Criteria:**
- [ ] Four cards: Total Income, Business Expenses, WHT Credits, Invoices Outstanding
- [ ] Total Income card: running total of income transactions YTD in NGN; taps to Transactions (filtered: Income)
- [ ] Business Expenses card: sum of deductible expenses YTD; taps to Transactions (filtered: Expenses)
- [ ] WHT Credits card: sum of WHT deducted; taps to Tax Summary (WHT section)
- [ ] Invoices Outstanding card: count + total value (e.g. "3 unpaid · ₦450,000"); taps to Invoices (filtered: Outstanding)
- [ ] Row scrolls horizontally on mobile; wraps or scrolls on web
- [ ] Values update reactively when transactions or invoices change

---

### US-504: Uncategorised Transactions Banner

**As a** user with uncategorised transactions  
**I want** to see an amber banner prompting me to categorise them  
**So that** I act quickly to keep my tax estimate accurate.

**Trigger:** Dashboard loads and `uncategorisedCount > 0`.

**Flow:**
1. Amber-coloured callout banner renders below Quick Stats
2. Text: "You have {N} transactions that need categorisation. Review them now to keep your tax estimate accurate."
3. CTA button: "Review Now"
4. "Review Now" navigates to Categorisation Triage screen

**Acceptance Criteria:**
- [ ] Banner is visible only when `uncategorisedCount > 0`
- [ ] Banner is hidden when `uncategorisedCount === 0`
- [ ] Count is dynamic and matches `transactions.getUncategorised` count for entity
- [ ] Banner uses `warning` (#D69E2E) background tint and warning icon
- [ ] "Review Now" button navigates to Categorisation Triage screen (PRD-1)
- [ ] Banner updates reactively — categorising all transactions dismisses it without page reload
- [ ] Singular/plural grammar: "1 transaction" vs "14 transactions"

---

### US-505: Recent Transactions list

**As a** user  
**I want** to see my 5 most recent transactions on the Dashboard  
**So that** I can quickly verify recent activity without visiting the full list.

**Trigger:** Dashboard loads and entity has transactions.

**Flow:**
1. "Recent Transactions" section shows the 5 most recent transactions by date (descending)
2. Each row shows: date, description (truncated), amount (green for income, neutral for expense), category tag (or "Uncategorised" in amber)
3. Tapping a row navigates to Transaction Detail screen
4. Footer link: "View All Transactions" → Transactions List

**Acceptance Criteria:**
- [ ] Exactly 5 transactions shown (or fewer if entity has < 5 total)
- [ ] Sorted by date descending
- [ ] Income amounts displayed in `success` (#38A169); expenses in `neutral-900` (#1A202C)
- [ ] Category tag shows category name with colour dot; "Uncategorised" shown in `warning` (#D69E2E)
- [ ] Descriptions truncated to fit one line (~50 characters)
- [ ] Tapping a transaction navigates to its detail screen (PRD-1 Transaction Detail)
- [ ] "View All Transactions" link navigates to Transaction List screen
- [ ] Foreign currency transactions show currency code alongside NGN equivalent
- [ ] Empty state: when no transactions exist, show "No transactions yet" with "Import Now" CTA

---

### US-506: Invoice Activity card

**As a** user who sends invoices  
**I want** to see my invoicing health on the Dashboard  
**So that** I can spot overdue invoices and follow up quickly.

**Trigger:** Dashboard loads.

**Flow:**
1. Compact card shows: invoices sent this month (count), total outstanding amount, overdue count (if any, highlighted in red)
2. CTA button: "Go to Invoices" → Invoices screen

**Acceptance Criteria:**
- [ ] "Invoices sent this month" shows count for current calendar month
- [ ] "Outstanding" shows total amount of unpaid invoices in NGN
- [ ] "Overdue" count shown in `danger` (#E53E3E) if > 0; hidden or "0 overdue" if none
- [ ] "Go to Invoices" navigates to Invoices screen (PRD-4)
- [ ] Card hidden entirely or shows placeholder if PRD-4 (invoicing) is not yet implemented
- [ ] Graceful degradation: if invoice queries return null/empty, card shows "No invoices yet" with "Create Invoice" CTA
- [ ] Data is reactive — paying an invoice updates outstanding/overdue counts in real time

---

### US-507: Deadline & Compliance Reminders

**As a** user  
**I want** to see upcoming deadlines and compliance reminders as scrollable chips  
**So that** I never miss a filing date or overdue invoice.

**Trigger:** Dashboard loads.

**Flow:**
1. Horizontal scrollable list of reminder chips renders below Invoice Activity
2. Chips include: VAT return due date, self-assessment deadline, overdue invoice count
3. Chips are colour-coded by severity: `info` (accent blue), `warning` (amber), `danger` (red)
4. Tapping a chip navigates to the relevant screen

**Acceptance Criteria:**
- [ ] Chips generated from `dashboard.getDeadlines` query
- [ ] VAT return chip: "VAT return due {date}" — shown for VAT-registered entities only; navigates to Tax Summary
- [ ] Self-assessment chip: "March 31: Self-assessment deadline" — shown for all entities; navigates to Filing
- [ ] Overdue invoices chip: "{N} invoices overdue" — shown only when overdue > 0; navigates to Invoices (filtered: Overdue)
- [ ] Chip severity determines colour: `info` = `accent` (#2B6CB0), `warning` = `warning` (#D69E2E), `danger` = `danger` (#E53E3E)
- [ ] Row scrolls horizontally; all chips visible on wide screens
- [ ] Empty state: if no upcoming deadlines, section is hidden

---

### US-508: Deadline Countdown Widget

**As a** user approaching the March 31 filing deadline  
**I want** to see a persistent countdown at the top of the Dashboard  
**So that** I'm aware of the urgency and file on time.

**Trigger:** Dashboard loads and current date is within 60 days of March 31 of the current tax year's filing deadline.

**Flow:**
1. Countdown widget appears at the very top of the Dashboard (above Tax Position card)
2. Displays: "X days to filing deadline" with coloured background
3. Colour transitions: `success` (#38A169) when > 30 days, `warning` (#D69E2E) when 15–30 days, `danger` (#E53E3E) when < 15 days
4. If deadline has passed: "Filing deadline passed X days ago" in `danger`
5. Tapping navigates to Filing Checklist screen (PRD-6)

**Acceptance Criteria:**
- [ ] Widget visible only within 60 days of March 31 of the filing year (tax year + 1, i.e. for 2025 tax year, deadline is March 31 2026)
- [ ] Widget hidden when > 60 days before deadline
- [ ] Days calculation: `daysRemaining = floor((deadlineDate - now) / 86400000)`
- [ ] Colour rules: > 30 days = `success`, 15–30 days = `warning`, < 15 days = `danger`
- [ ] Overdue: negative days, text changes to "Filing deadline passed X days ago", background = `danger`
- [ ] Tapping navigates to Filing Checklist (PRD-6) or placeholder if not yet built
- [ ] Widget updates daily (or on page load) — no stale count

---

### US-509: Dashboard real-time reactivity

**As a** user  
**I want** the Dashboard to update automatically when my data changes  
**So that** I always see current figures without manually refreshing.

**Trigger:** Any upstream data change: new transaction imported, transaction categorised, invoice paid, tax declaration updated.

**Flow:**
1. User has Dashboard open
2. In another tab or on another device, a transaction is imported or categorised
3. Convex live queries detect the mutation and re-run `dashboard.getSummary`, `dashboard.getRecentTransactions`, `dashboard.getDeadlines`
4. Dashboard UI updates in real time — totals change, banner appears/disappears, recent list updates

**Acceptance Criteria:**
- [ ] Dashboard uses Convex `useQuery` hooks for all data fetching (live subscriptions)
- [ ] Income/expense YTD updates within 2 seconds of transaction change
- [ ] Uncategorised count updates when a transaction is categorised (banner appears/disappears)
- [ ] Recent Transactions list updates when new transactions are added
- [ ] Tax liability updates when `taxYearSummaries` changes (via tax engine recomputation)
- [ ] No manual "Refresh" button needed — reactivity is automatic
- [ ] If Convex connection is temporarily lost, Dashboard shows a non-blocking reconnection indicator

---

### US-510: Entity switching on Dashboard

**As a** user with multiple entities  
**I want** the Dashboard to refresh when I switch entities  
**So that** I see the correct data for the selected entity.

**Trigger:** User switches entity via side drawer entity selector.

**Flow:**
1. User opens side drawer and selects a different entity
2. Active entity ID changes in global app state
3. All Dashboard queries re-run with the new entityId
4. Dashboard content updates to reflect the selected entity's data

**Acceptance Criteria:**
- [ ] Entity switch triggers re-subscription of all Dashboard queries with new entityId
- [ ] All cards update: Tax Position, Quick Stats, Recent Transactions, Invoice Activity, Reminders
- [ ] Entity name in Dashboard header (if shown) updates
- [ ] No stale data from the previous entity is visible during transition
- [ ] Loading state (skeleton) shown while new entity data loads, if perceptible delay

---

### US-511: Tax year switching

**As a** user  
**I want** to view Dashboard data for a different tax year  
**So that** I can review past years' positions.

**Trigger:** User selects a different tax year (dropdown or selector on Dashboard or Tax Position card).

**Flow:**
1. User taps tax year selector
2. Dropdown shows available years (e.g. 2026, 2025, 2024)
3. User selects a year
4. Dashboard queries re-run with the selected taxYear
5. Tax Position, Quick Stats, Recent Transactions update for that year
6. Deadline Countdown and Reminders adjust to the selected year's filing deadline

**Acceptance Criteria:**
- [ ] Tax year selector displays on Dashboard (within Tax Position card or as standalone)
- [ ] Default: current tax year
- [ ] Selecting a year refreshes all YTD-based metrics for that year
- [ ] Recent Transactions shows the 5 most recent for the selected year
- [ ] Tax liability and effective rate reflect the selected year's computation
- [ ] Deadline countdown adjusts to the selected year's filing deadline (e.g. 2025 tax year → March 31 2026)

---

### US-512: Dashboard empty-to-populated transition

**As a** user who just completed onboarding  
**I want** the Dashboard to transition smoothly from empty state to populated as I add data  
**So that** the experience feels progressive and encouraging.

**Trigger:** User lands on Dashboard with no transactions (PRD-0 empty state) and begins importing data.

**Flow:**
1. Initially: Dashboard shows PRD-0 empty state — Tax Position with placeholder zeros, empty Recent Transactions with "Import Now" CTA, no banner, no invoice activity
2. User imports first transactions
3. Dashboard reactively updates: income/expense figures appear, Recent Transactions populates, uncategorised banner may appear
4. User categorises transactions → tax liability computes → Tax Position card fills in
5. User creates invoices → Invoice Activity card populates

**Acceptance Criteria:**
- [ ] Empty Dashboard shows zeros for Tax Position (₦0 liability, 0.0% rate)
- [ ] Quick Stats show ₦0 values with tappable cards
- [ ] Recent Transactions shows empty state: illustration + "No transactions yet. Import a bank statement to get started." + "Import Now" CTA
- [ ] Invoice Activity shows: "No invoices yet" + "Create Invoice" CTA (or hidden)
- [ ] Deadline Reminders still show filing deadline even with no data
- [ ] As data appears, sections transition smoothly (no jarring reload)
- [ ] Each section independently transitions from empty to populated

---

### US-513: Dashboard loading states

**As a** user  
**I want** to see skeleton placeholders while Dashboard data loads  
**So that** the screen doesn't flash empty content or spinners.

**Trigger:** Dashboard screen mounts; queries are pending.

**Flow:**
1. User navigates to Dashboard
2. While `dashboard.getSummary`, `dashboard.getRecentTransactions`, and `dashboard.getDeadlines` are loading:
   - Tax Position card: skeleton pulse on liability amount and rate
   - Quick Stats: four skeleton cards with pulsing content
   - Recent Transactions: five skeleton rows
   - Invoice Activity: skeleton card
   - Reminders: skeleton chips
3. As each query resolves, its corresponding section renders with real data

**Acceptance Criteria:**
- [ ] Skeleton placeholders match the layout dimensions of the real content
- [ ] Skeleton uses neutral-100 (#F7FAFC) pulse animation
- [ ] Each section can load independently (partial loading — don't block entire Dashboard on one slow query)
- [ ] No layout shift when data replaces skeleton (dimensions must match)
- [ ] Loading state lasts < 2 seconds under normal conditions (Convex cache-first)

---

### US-514: Dashboard error states

**As a** user  
**I want** clear feedback if Dashboard data fails to load  
**So that** I know there's an issue and can retry.

**Trigger:** One or more Dashboard queries fail (network error, server error).

**Flow:**
1. If `dashboard.getSummary` fails: Tax Position and Quick Stats show error card with retry button
2. If `dashboard.getRecentTransactions` fails: Recent Transactions section shows "Unable to load transactions. Tap to retry."
3. If `dashboard.getDeadlines` fails: Reminders section hidden (non-critical)
4. Partial success: sections that loaded successfully still display; only failed sections show errors

**Acceptance Criteria:**
- [ ] Error state is section-level, not page-level (partial rendering)
- [ ] Error card shows: warning icon, message ("Something went wrong"), and "Retry" button
- [ ] Retry re-triggers the failed query
- [ ] If all queries fail: full-page error with "Unable to load Dashboard. Check your connection." and "Retry All" button
- [ ] Convex auto-reconnection handles transient disconnects without requiring user action

---

## 4. UI Specifications

### 4.1 Design Tokens

| Token | Value | Usage on Dashboard |
|-------|-------|--------------------|
| primary | `#1A7F5E` | Tax Position card accent, active states |
| primary-light | `#E8F5F0` | Tax Position card background |
| accent | `#2B6CB0` | "View All" links, info-severity chips, Quick Stat icons |
| success | `#38A169` | Income amounts, ₦0 liability, countdown > 30 days |
| warning | `#D69E2E` | Uncategorised banner, countdown 15–30 days, "Uncategorised" tag |
| danger | `#E53E3E` | Tax owed > ₦0 liability text, overdue counts, countdown < 15 days |
| neutral-900 | `#1A202C` | Body text, expense amounts |
| neutral-500 | `#718096` | Secondary text (labels, dates, subtitles) |
| neutral-100 | `#F7FAFC` | Page background, skeleton pulse |
| white | `#FFFFFF` | Card surfaces |

### 4.2 Typography

| Style | Spec | Usage on Dashboard |
|-------|------|--------------------|
| heading-xl | 28px Bold | Tax liability amount |
| heading-lg | 22px SemiBold | Section titles ("Recent Transactions") |
| heading-md | 18px SemiBold | Card titles, Quick Stat values |
| body | 15px Regular | Transaction descriptions, banner text |
| body-sm | 13px Regular | Effective rate, dates, secondary labels |
| label | 12px Medium | Category tags, chip text, card labels |
| mono | 15px Monospace | All currency amounts (₦ values) |

### 4.3 Screen Layout

**Overall:** Scrollable single-column feed on `neutral-100` background. Cards are `white` with 12px border-radius and subtle shadow.

**Layout & Scroll Behavior:**
- **Header:** Sticky at top — "Dashboard" title, hamburger, notification bell remain visible while scrolling
- **Deadline Countdown Widget:** When visible (within 60 days of deadline), positioned below header; scrolls with content (or optionally sticky — product preference)
- **Scroll container:** Single scrollable column. Tax Position, Quick Stats, Uncategorised Banner, Recent Transactions, Invoice Activity, Reminders all scroll together
- **No split view:** Dashboard is a single scroll context; no independent panel scrolling
- **Primary actions:** All section CTAs (e.g. "Import Now", "Review Now", "Go to Invoices") are within their cards; scrolling to a section exposes its CTA
- **Quick Stats row:** Horizontally scrollable within the card; does not affect main vertical scroll

```
┌─────────────────────────────────────┐
│ Header: "Dashboard" + ☰ + 🔔       │
├─────────────────────────────────────┤
│ [Deadline Countdown Widget]         │  ← Only visible within 60 days
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │  TAX POSITION SUMMARY CARD      │ │  ← primary-light background
│ │  2026 Tax Year  | 37 days badge │ │
│ │                                 │ │
│ │  ₦437,000        [donut chart]  │ │  ← mono heading-xl, danger colour
│ │  Effective Rate: 6.1%           │ │  ← body-sm
│ └─────────────────────────────────┘ │
│                                     │
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐│  ← Horizontally scrollable
│ │Income│ │Expens│ │ WHT  │ │Invoic││
│ │₦7.2m │ │₦1.8m │ │₦180k │ │3 · ₦450k│
│ └──────┘ └──────┘ └──────┘ └──────┘│
│                                     │
│ ┌─────────────────────────────────┐ │  ← Amber tint, conditional
│ │ ⚠ 14 transactions need review  │ │
│ │           [Review Now]          │ │
│ └─────────────────────────────────┘ │
│                                     │
│  Recent Transactions                │
│ ┌─────────────────────────────────┐ │
│ │ 24 Feb  Paystack deposit  ₦+250k│ │  ← green amount
│ │ 23 Feb  AWS subscription  ₦-45k │ │  ← neutral amount
│ │ 22 Feb  Client payment    ₦+1.2m│ │
│ │ 21 Feb  Data bundle       ₦-15k │ │
│ │ 20 Feb  Uber ride         ₦-8k  │ │
│ │              View All →         │ │
│ └─────────────────────────────────┘ │
│                                     │
│  Invoice Activity                   │
│ ┌─────────────────────────────────┐ │
│ │ 4 sent this month               │ │
│ │ ₦1,200,000 outstanding          │ │
│ │ 2 overdue (red)                 │ │
│ │          [Go to Invoices]       │ │
│ └─────────────────────────────────┘ │
│                                     │
│ [VAT due 21 Feb] [Mar 31: Filing] [3 overdue] │  ← Scrollable chips
│                                     │
└─────────────────────────────────────┘
```

### 4.4 Tax Position Summary Card — Detailed Layout

- **Background:** `primary-light` (#E8F5F0), 12px border-radius
- **Top row (horizontal):**
  - Left: Tax year label in `label` 12px, e.g. "2026 Tax Year"
  - Right: Days-to-deadline badge — pill shape, `primary` background, white text, `label` 12px
- **Centre:**
  - Large figure: `heading-xl` 28px Bold `mono` — "₦437,000" — coloured `danger` if > 0, `success` if 0
  - Below: "Estimated Tax Liability" in `body-sm` `neutral-500`
- **Bottom row:**
  - Left: "Effective Rate: 6.1%" in `body-sm` `neutral-500`
  - Right: Small donut/arc chart (48×48px), showing liability as a proportion of gross income
    - Filled arc colour: `danger` (liability portion)
    - Empty arc colour: `neutral-100`
- **Tap action:** Navigate to Tax Summary screen

### 4.5 Quick Stats Row — Detailed Layout

- **Container:** Horizontal scroll, 16px horizontal padding, 12px gap between cards
- **Each card:** White surface, 12px border-radius, shadow, 100–120px wide
  - Top: Icon (16×16) + label in `label` 12px `neutral-500`
  - Centre: Value in `heading-md` 18px `mono`
  - Bottom (optional): Subtitle in `body-sm` `neutral-500` (e.g. "3 unpaid")
- **Cards:**

| Card | Icon | Label | Value | Subtitle | Navigates To |
|------|------|-------|-------|----------|--------------|
| 1 | ↓ arrow (success) | Total Income | ₦X,XXX,XXX | — | /transactions?type=income |
| 2 | ↑ arrow (danger) | Business Expenses | ₦X,XXX,XXX | — | /transactions?type=business_expense |
| 3 | Shield (accent) | WHT Credits | ₦XXX,XXX | — | /tax-summary#wht |
| 4 | Invoice (accent) | Outstanding | ₦XXX,XXX | "N unpaid" | /invoices?status=outstanding |

### 4.6 Uncategorised Transactions Banner — Detailed Layout

- **Background:** `warning` (#D69E2E) at 10% opacity, `warning` left border (4px)
- **Icon:** Warning triangle, `warning` colour, 24×24
- **Text:** `body` 15px, `neutral-900`
  - "You have **{N} transactions** that need categorisation. Review them now to keep your tax estimate accurate."
- **CTA:** "Review Now" button, `warning` background, white text, pill shape
- **Tap CTA:** Navigate to Categorisation Triage screen

### 4.7 Recent Transactions — Detailed Layout

- **Section header:** "Recent Transactions" in `heading-lg` 22px
- **List items (5 rows):**
  - Left: Date (`body-sm` `neutral-500`, e.g. "24 Feb") + category colour dot (8×8)
  - Centre: Description in `body` 15px (truncated to 1 line) + category tag in `label` 12px below
  - Right: Amount in `mono` 15px — `success` for credit, `neutral-900` for debit; preceded by + or −
  - "Uncategorised" tag: `warning` background at 10% opacity, `warning` text
- **Footer:** "View All Transactions →" in `accent` (#2B6CB0) `body` 15px, right-aligned
- **Empty state:** Illustration (person with phone), "No transactions yet. Import a bank statement to get started.", "Import Now" button (`primary`)

### 4.8 Invoice Activity Card — Detailed Layout

- **Card:** White surface, 12px border-radius
- **Rows:**
  - "{N} sent this month" — `body` 15px
  - "₦{amount} outstanding" — `mono` `heading-md`
  - "{N} overdue" — `danger` colour (only if > 0)
- **CTA:** "Go to Invoices" — `accent` text link, right-aligned
- **Graceful degradation:** If invoicing unavailable: "Invoicing coming soon" in `neutral-500`

### 4.9 Deadline & Compliance Reminders — Detailed Layout

- **Container:** Horizontal scroll, 12px gap, 16px padding
- **Each chip:** Pill shape, 32px height
  - Background: severity colour at 10% opacity
  - Text: `label` 12px in the severity colour (full saturation)
  - Tap: navigates per DeadlineReminder.navigateTo
- **Chip generation rules:**
  - Self-assessment deadline (always, for current year)
  - VAT return date (next 21st of month, only if entity is VAT-registered)
  - Overdue invoices count (only if > 0)

### 4.10 Deadline Countdown Widget — Detailed Layout

- **Position:** Top of Dashboard, above Tax Position card (full-width, edge-to-edge)
- **Height:** 44px
- **Background:** Solid colour per severity rule:
  - > 30 days remaining: `success` (#38A169)
  - 15–30 days: `warning` (#D69E2E)
  - < 15 days or overdue: `danger` (#E53E3E)
- **Text:** White, `body-sm` 13px, centre-aligned
  - Active: "⏱ {N} days to filing deadline"
  - Overdue: "⚠ Filing deadline passed {N} days ago"
- **Tap action:** Navigate to Filing Checklist (PRD-6)
- **Visibility:** Only when within 60 days of March 31 of filing year; hidden otherwise

### 4.11 Platform Behaviour

| Behaviour | Mobile | Web |
|-----------|--------|-----|
| Quick Stats | Horizontally scrollable | Horizontally scrollable or grid wrap at 4 columns |
| Reminder chips | Horizontally scrollable | All visible if space allows; scroll if not |
| Donut chart | 48×48 SVG/Canvas | Same |
| Tap targets | 44px minimum | Pointer cursor, hover state |
| Pull-to-refresh | Optional — Convex reactivity handles; can trigger manual reconnect | Not applicable |

---

## 5. Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-501 | Dashboard shall display a Tax Position Summary card showing estimated tax liability, effective rate, tax year label, and days-to-deadline badge for the active entity and tax year | P0 |
| FR-502 | Tax liability figure shall be coloured `danger` when > ₦0 and `success` when ₦0 | P0 |
| FR-503 | Dashboard shall display a horizontal scrollable Quick Stats row with: Total Income, Business Expenses, WHT Credits, Invoices Outstanding | P0 |
| FR-504 | Each Quick Stat card shall be tappable, navigating to the relevant detail screen | P0 |
| FR-505 | Dashboard shall show an Uncategorised Transactions Banner when `uncategorisedCount > 0`, with a "Review Now" CTA navigating to Categorisation Triage | P0 |
| FR-506 | Uncategorised Banner shall hide automatically when `uncategorisedCount` reaches 0 | P0 |
| FR-507 | Dashboard shall display the 5 most recent transactions (by date descending) with: date, description, amount (colour-coded), and category tag | P0 |
| FR-508 | Income amounts shall be displayed in `success` green; expense amounts in `neutral-900` | P0 |
| FR-509 | "Uncategorised" category tag shall be displayed in `warning` amber | P0 |
| FR-510 | Tapping a recent transaction shall navigate to the Transaction Detail screen (PRD-1) | P0 |
| FR-511 | "View All Transactions" link shall navigate to the Transaction List screen | P0 |
| FR-512 | Dashboard shall display an Invoice Activity card with: sent count (this month), outstanding amount, overdue count | P1 |
| FR-513 | Overdue invoice count shall be highlighted in `danger` red when > 0 | P1 |
| FR-514 | "Go to Invoices" CTA shall navigate to the Invoices screen | P1 |
| FR-515 | Dashboard shall display horizontally scrollable Deadline & Compliance Reminder chips | P0 |
| FR-516 | Reminder chips shall be generated based on entity type (VAT status), filing deadline, and overdue invoice count | P0 |
| FR-517 | Tapping a reminder chip shall navigate to the relevant screen | P0 |
| FR-518 | Dashboard shall display a Deadline Countdown Widget when within 60 days of the March 31 filing deadline | P0 |
| FR-519 | Countdown Widget colour shall transition: `success` (>30 days) → `warning` (15–30) → `danger` (<15 or overdue) | P0 |
| FR-520 | All Dashboard data shall update in real time via Convex live queries without manual refresh | P0 |
| FR-521 | Switching the active entity shall re-subscribe all Dashboard queries with the new entityId | P0 |
| FR-522 | Switching the tax year shall re-fetch all YTD metrics and tax data for the selected year | P0 |
| FR-523 | Dashboard shall show skeleton placeholders while data is loading | P0 |
| FR-524 | Dashboard shall handle query errors per section, showing section-level error states with retry | P0 |
| FR-525 | Dashboard empty state (no transactions) shall show zeros, empty illustrations, and "Import Now" CTAs | P0 |
| FR-526 | All monetary values shall be formatted with ₦ prefix, thousands separators, and `mono` font | P0 |
| FR-527 | Dashboard page load (time to interactive) shall be < 2 seconds on a typical 4G connection | P0 |
| FR-528 | Dashboard queries shall not perform full-collection scans; all reads must use indexed queries | P0 |
| FR-529 | Invoice Activity card shall degrade gracefully if PRD-4 is not yet implemented (placeholder or hidden) | P1 |
| FR-530 | Tax Position card donut/arc chart shall visualise liability as a proportion of gross income | P1 |
| FR-531 | Nil return state shall be clearly indicated: "₦0 — Nil Return" with success colour and "Filing still required" note | P0 |

---

## 6. API Requirements (Convex Functions)

### 6.1 Dashboard Domain (`convex/dashboard/`)

| Function | Type | Description |
|----------|------|-------------|
| `dashboard.getSummary` | **Query** | Returns aggregated `DashboardSummary` for the active entity and tax year. Composes data from transactions, taxYearSummaries, invoices, and entities in a single reactive query. |
| `dashboard.getRecentTransactions` | **Query** | Returns the last 5 transactions for the active entity, sorted by date descending. Includes resolved category name and colour. |
| `dashboard.getDeadlines` | **Query** | Returns array of `DeadlineReminder` objects based on entity type, VAT status, filing deadlines, and overdue invoice count. |

### 6.2 dashboard.getSummary — Contract

**Args:**
```typescript
{
  entityId: v.id("entities");
  taxYear: v.number();
}
```

**Returns:**
```typescript
DashboardSummary | null
```

**Behaviour:**
1. Validate authenticated user owns the entity (via `ctx.auth.getUserIdentity()` → users → entities ownership check)
2. Fetch entity metadata: name, type, vatRegistered
3. Fetch or compute tax summary:
   - Primary path: read from `taxYearSummaries` via index `by_entityId_taxYear` for fast cached access
   - Fallback: if no cached summary exists, call `tax.getSummary` inline (which runs the tax engine as a reactive query)
4. Aggregate transaction stats:
   - `totalIncome`: sum `amountNgn` where `type = "income"` AND `entityId` AND `taxYear` — via indexed query on `by_entityId_taxYear_type`
   - `totalBusinessExpenses`: sum `amountNgn × (deductiblePercent / 100)` where `type = "business_expense"` AND `isDeductible = true` AND `entityId` AND `taxYear`
   - `uncategorisedCount`: count where `type = "uncategorised"` AND `entityId` AND `taxYear`
5. Aggregate invoice stats (if invoices table exists):
   - `invoicesOutstandingCount` and `invoicesOutstandingTotal`: where `entityId` AND `status = "sent" | "viewed"` AND `paidAt = null`
   - `invoicesOverdueCount` and `invoicesOverdueTotal`: where outstanding AND `dueDate < now()`
   - `invoicesSentThisMonth`: where `entityId` AND `createdAt` within current calendar month
6. Compose `DashboardSummary` and return

**Performance Notes:**
- All sub-queries use indexed reads — no `filter()` over full collections
- The query is reactive: Convex automatically re-runs when any read document changes
- Expected read pattern: ~5 indexed lookups + 1 aggregation scan over current year's transactions (bounded by entity + year)

**Error Handling:**
- If entity not found or not owned by user: throw `ConvexError("ENTITY_NOT_FOUND")`
- If no tax summary and no transactions: return `DashboardSummary` with all zeros and `hasTransactions: false`

### 6.3 dashboard.getRecentTransactions — Contract

**Args:**
```typescript
{
  entityId: v.id("entities");
  taxYear: v.optional(v.number());  // If omitted, returns across all years
  limit: v.optional(v.number());     // Default 5, max 10
}
```

**Returns:**
```typescript
RecentTransaction[]
```

**Behaviour:**
1. Validate entity ownership
2. Query `transactions` table: filter by `entityId` (and optionally `taxYear`), order by `date` descending, take first `limit` (default 5)
3. For each transaction, resolve `categoryId` to category name and colour via `categories` lookup
4. Return array of `RecentTransaction`

**Index Used:** `transactions.by_entityId_date` — composite index on `[entityId, date]` for efficient ordered retrieval

### 6.4 dashboard.getDeadlines — Contract

**Args:**
```typescript
{
  entityId: v.id("entities");
  taxYear: v.number();
}
```

**Returns:**
```typescript
{
  countdown: DeadlineCountdown;
  reminders: DeadlineReminder[];
}
```

**Behaviour:**
1. Validate entity ownership
2. Compute filing deadline: March 31 of (taxYear + 1)
3. Compute days remaining: `floor((deadline - now) / 86400000)`
4. Build `DeadlineCountdown`:
   - `isVisible`: daysRemaining ≤ 60 (or overdue)
   - `severity`: > 30 = success, 15–30 = warning, < 15 = danger
5. Build `DeadlineReminder[]`:
   - Self-assessment: always present for filing year deadline
   - VAT return: if entity is VAT-registered, next 21st of month
   - Overdue invoices: if count > 0 (query invoices table)
6. Sort reminders by dueDate ascending
7. Return

**Index Used:** `entities.by_userId` for ownership check; `invoices.by_entityId_status` for overdue count (if available)

### 6.5 Consumed Queries from Other Domains

The Dashboard also depends on these existing queries from other PRDs:

| Query | Source PRD | Used For |
|-------|-----------|----------|
| `tax.getSummary` | PRD-3 | Tax liability, effective rate (fallback if no cached summary) |
| `transactions.getUncategorised` | PRD-1 | Uncategorised count (or direct query within getSummary) |
| `entities.get` | PRD-0 | Entity metadata for display |

---

## 7. Data Models

### 7.1 No New Tables

PRD-5 introduces **no new database tables**. The Dashboard is a pure read-only aggregation layer that composes data from existing tables:

| Existing Table | Used For | Index Used |
|----------------|----------|------------|
| `entities` | Entity name, type, VAT status | `by_userId` |
| `transactions` | Income/expense YTD, uncategorised count, recent list | `by_entityId_taxYear`, `by_entityId_date` |
| `taxYearSummaries` | Cached tax computation (liability, rate, WHT) | `by_entityId_taxYear` |
| `invoices` (PRD-4) | Outstanding/overdue counts, sent this month | `by_entityId_status`, `by_entityId_createdAt` |
| `categories` | Category name/colour resolution for recent transactions | `by_type` (or direct ID lookup) |
| `userPreferences` | Deadline reminder preferences | `by_userId` |

### 7.2 Required Indexes (verify exist from prior PRDs)

These indexes must be present for Dashboard queries to perform well. Most should already exist from PRD-0, PRD-1, and PRD-3. Verify and add if missing:

| Table | Index Name | Fields | Purpose |
|-------|-----------|--------|---------|
| `transactions` | `by_entityId_taxYear` | `[entityId, taxYear]` | Filter transactions for YTD aggregation |
| `transactions` | `by_entityId_date` | `[entityId, date]` | Recent transactions sorted by date |
| `transactions` | `by_entityId_type` | `[entityId, type]` | Count uncategorised; filter by income/expense |
| `taxYearSummaries` | `by_entityId_taxYear` | `[entityId, taxYear]` | Fast tax summary lookup (unique) |
| `invoices` | `by_entityId_status` | `[entityId, status]` | Outstanding/overdue invoice queries |
| `invoices` | `by_entityId_createdAt` | `[entityId, _creationTime]` | Invoices sent this month |
| `entities` | `by_userId` | `[userId]` | Entity ownership validation |
| `userPreferences` | `by_userId` | `[userId]` | User-specific reminder settings |

### 7.3 Aggregation Strategy

Convex does not natively support SQL-style `SUM()` or `GROUP BY`. Dashboard aggregations use one of two strategies:

**Strategy A — Inline Scan (for bounded datasets):**
```typescript
// Within dashboard.getSummary query:
const transactions = await ctx.db
  .query("transactions")
  .withIndex("by_entityId_taxYear", q =>
    q.eq("entityId", entityId).eq("taxYear", taxYear)
  )
  .collect();

const totalIncome = transactions
  .filter(t => t.type === "income")
  .reduce((sum, t) => sum + t.amountNgn, 0);
```
This is acceptable because transactions are bounded by entity + tax year (typically hundreds to low thousands per entity per year).

**Strategy B — Cached Summary (for expensive computations):**
```typescript
// Tax computation is cached in taxYearSummaries:
const cached = await ctx.db
  .query("taxYearSummaries")
  .withIndex("by_entityId_taxYear", q =>
    q.eq("entityId", entityId).eq("taxYear", taxYear)
  )
  .unique();
```
Tax engine results are pre-computed and stored; the Dashboard reads the cached version for instant access.

**Performance Guardrail:** If an entity has > 5,000 transactions in a single tax year, the inline scan may approach Convex query time limits. In that case, materialise aggregates into a separate cache row via a scheduled mutation triggered on transaction insert/update/delete. This is a v2 optimisation — v1 assumes < 5,000 transactions per entity per year.

### 7.4 Convex Reactivity Model

Convex queries are **live subscriptions**. When the frontend calls `useQuery(api.dashboard.getSummary, { entityId, taxYear })`:

1. Convex runs the query function once and sends the result to the client
2. Convex tracks every document read during that query (transactions, taxYearSummaries, entities, invoices)
3. When any tracked document is mutated (by any client), Convex re-runs the query and pushes the updated result
4. The React component re-renders with new data — zero polling, zero manual refresh

This means:
- Importing transactions → Dashboard income/expense totals update automatically
- Categorising a transaction → uncategorised count drops, banner may disappear
- Paying an invoice → outstanding count decreases
- Running `tax.refreshSummaryCache` → tax liability and effective rate update

The Dashboard does **not** need WebSocket setup, polling intervals, or manual refresh logic. Convex handles all of this transparently.

---

## 8. Non-Goals

The following are **explicitly out of scope** for PRD-5:

| Item | Reason |
|------|--------|
| **New database tables** | Dashboard is a read-only aggregation layer; no materialised views needed for v1 |
| **Tax calculation logic** | Handled by PRD-3; Dashboard reads computed results |
| **Transaction import/edit** | Handled by PRD-1; Dashboard navigates to those screens |
| **Invoice creation/management** | Handled by PRD-4; Dashboard shows summary metrics only |
| **Filing checklist/submission** | Handled by PRD-6; Dashboard countdown widget navigates there |
| **Charts/reports** | Handled by PRD-7; Dashboard shows only the Tax Position donut and simple metrics |
| **Push notifications** | Handled by PRD-9; Dashboard shows in-app reminders only |
| **Income/expense trend charts** | Deferred to PRD-7 (Reports); Dashboard keeps to metrics and lists |
| **Customisable Dashboard layout** | v1 has a fixed card order; user-customisable layout is a v2 feature |
| **Widget-level caching/materialisation** | v1 uses inline aggregation; caching optimisation is v2 if performance requires |
| **Offline Dashboard** | Convex requires connectivity; offline-first is not in v1 scope |

---

## 9. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Dashboard load time** | < 2 seconds to interactive (all sections rendered) | Performance monitoring (Convex query latency + client render time) |
| **Real-time update latency** | < 2 seconds from mutation to Dashboard UI update | Measure time between transaction create/update and Dashboard re-render |
| **Uncategorised action rate** | ≥ 50% of users who see the banner tap "Review Now" within 24 hours | Analytics: banner view → triage screen navigation |
| **Dashboard engagement** | Dashboard is the most-visited screen (≥ 60% of sessions include Dashboard view) | Analytics: screen view counts |
| **Quick Stats tap-through rate** | ≥ 30% of Dashboard visits include a Quick Stat card tap | Analytics: card tap events |
| **Deadline awareness** | ≥ 90% of users within 30 days of deadline have viewed the countdown widget | Analytics: widget impression with daysRemaining ≤ 30 |
| **Error rate** | < 0.5% of Dashboard loads result in error state | Error monitoring (Convex function errors + client error boundaries) |
| **Entity switch latency** | < 1 second from entity selection to Dashboard data refresh | Performance monitoring |
| **Empty-to-populated conversion** | ≥ 80% of users who see empty Dashboard import transactions within 7 days | Analytics: empty state view → first import event |

---

## 10. Open Questions

| # | Question | Owner |
|---|----------|-------|
| 1 | **Donut chart implementation:** Use a lightweight SVG arc or a charting library (e.g. Victory, recharts)? Prefer minimal dependency for a single chart. | Engineering |
| 2 | **Invoice table readiness:** Does PRD-4 define the `invoices` table schema with `status`, `dueDate`, and `_creationTime`? If not, what fields does the Dashboard need to query? | Product / Engineering |
| 3 | **VAT return date logic:** VAT returns are due on the 21st of each month. Should the Dashboard show the next upcoming 21st, or all future 21st dates for the year? | Product |
| 4 | **Transaction count threshold:** At what transaction count per entity per year should we switch from inline aggregation to materialised cache? Suggested: 5,000. | Engineering |
| 5 | **Tax year selector placement:** Should the tax year selector be in the Tax Position card header, or a standalone element at the top of the Dashboard? | Design |
| 6 | **Filing deadline for different entity types:** Is the March 31 deadline universal for all entity types (individual, business_name, LLC), or do LLCs have a different deadline? | Product / Tax Advisor |
| 7 | **Pull-to-refresh on mobile:** Since Convex provides automatic reactivity, is a pull-to-refresh gesture needed? It could serve as a "reconnect" action if the WebSocket drops. | Engineering |
| 8 | **Invoice Activity card visibility:** Should the card always be visible (even before PRD-4 is built) with a "coming soon" state, or hidden entirely until invoicing is implemented? | Product |
| 9 | **Dashboard analytics events:** Define the specific event names and properties for tracking Dashboard interactions (card taps, banner clicks, chip taps). | Product / Analytics |
| 10 | **Multi-year deadline display:** If user switches to 2025 tax year, should deadline countdown show "March 31 2026" (which may be in the past)? Or should countdown only apply to current year's filing? | Product |

---

*End of PRD-5 — Dashboard & Real-Time Overview*
