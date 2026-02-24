# TaxEase Nigeria — PRD Split Strategy & Dependency Analysis

**February 2026 · Version 1.0**
*Based on: Product Overview, Frontend Spec, Backend Spec, Tax Engine Spec*

---

## Why Not Split by Page or by Spec Document?

**Splitting by page** (one PRD per screen) would create 26 micro-PRDs with tangled dependencies. The Dashboard screen alone depends on transactions, tax calculations, invoices, and deadlines — it can't be built or tested in isolation from those data sources.

**Splitting by spec document** (Frontend PRD, Backend PRD, Tax Engine PRD) would silo the work in a way that doesn't map to shippable increments. You can't ship "the backend" without something to show for it on the frontend, and vice versa.

**The right split is by feature domain** — vertical slices that include the relevant frontend screens, backend functions, and tax engine logic for each cohesive capability. Each PRD should result in something a user can actually do end-to-end.

---

## The Dependency Graph

TaxEase has a pronounced funnel shape. Understanding this is essential to sequencing work correctly:

> **LAYER 0: Foundation**
> PRD-0: Auth, Onboarding & Entity Setup
> *Everything depends on this. No stubs needed — build it first.*
>
> **LAYER 1: Data Backbone**
> PRD-1: Transaction Management & Import | PRD-2: AI Categorisation (parallel)
> *Transactions are read by tax engine, dashboard, reports, and filing. This is the most depended-upon layer.*
>
> **LAYER 2: Computation**
> PRD-3: Tax Calculation Engine | PRD-4: Invoicing & Clients (parallel)
> *Tax engine is the hardest PRD. Invoicing can be built in parallel since it's mostly independent.*
>
> **LAYER 3: Consumer Features**
> PRD-5: Dashboard | PRD-6: Filing Module | PRD-7: Reports
> *These are read-heavy aggregation layers. They can be built incrementally as upstream PRDs complete.*
>
> **LAYER 4: Enhancements**
> PRD-8: Bank Linking & Live Sync | PRD-9: Notifications & Reminders
> *High-value but not on the critical path. Can ship an MVP without these.*

---

## The Critical Path to Filing

The entire value proposition is: users can file their tax returns. The shortest path to that capability is:

> **Critical Path: PRD-0 → PRD-1 → PRD-3 → PRD-6**
>
> Auth & Setup → Transaction Import → Tax Calculation → Filing Module
>
> This chain represents the minimum viable product. Everything else enhances it.
> Estimated timeline for critical path: 10–14 weeks with a small team.

Parallel workstreams that don't block filing:

- **PRD-2** (AI Categorisation) — enhances PRD-1 but manual categorisation works without it
- **PRD-4** (Invoicing) — feeds income transactions but users can import them manually
- **PRD-5** (Dashboard) — nice to have before filing but not required for it
- **PRD-7** (Reports), **PRD-8** (Bank Linking), **PRD-9** (Notifications) — all post-MVP

---

## Recommended PRDs (10 Total)

Each PRD below is a vertical slice: it includes the frontend screens, backend functions, and any tax engine logic needed to deliver one cohesive capability end-to-end.

---

### PRD-0: Foundation — Auth, Onboarding & Entity Setup

**Priority:** P0 — Build First | **Estimated Effort:** 2–3 weeks

The skeleton everything else hangs on. Without authenticated users and entities, nothing downstream can function.

- **Frontend Screens:** Splash, Welcome, Sign Up, Log In, Onboarding (4 steps), Side Drawer shell
- **Backend Domains:** Auth (Clerk + webhook sync), Users, Entities, UserPreferences, Categories (seed data)
- **Tax Engine Scope:** None
- **What It Delivers:** A user can sign up, choose Freelancer/SME, enter NIN/TIN, create their first entity, and land on an empty Dashboard.
- **Depends On:** Nothing — this is the root.

> ⚠️ **Key Risk / Design Decision:** Database schema for users, entities, categories, and userPreferences must be finalized here because every other PRD writes to these tables.

---

### PRD-1: Transaction Management & Import Pipeline

**Priority:** P0 — Build Second | **Estimated Effort:** 3–4 weeks

The data backbone. Transactions are the raw material for tax calculations, dashboards, reports, and filing. This is the most complex and most depended-upon PRD.

- **Frontend Screens:** Transaction List, Import Transactions (PDF/CSV upload + manual entry), Transaction Detail/Edit, Categorisation Triage
- **Backend Domains:** Transactions (full CRUD + import pipeline + batchUpsert + dedup), ImportJobs, ConnectedAccounts (manual/upload only in v1), Categories (user CRUD)
- **Tax Engine Scope:** None directly, but transaction schema must include all tax-relevant fields (whtDeducted, deductiblePercent, amountNgn, etc.)
- **What It Delivers:** A user can upload a bank statement, see parsed transactions, categorise them via the triage UI, and manage their transaction history.
- **Depends On:** PRD-0 (users, entities, categories seed data)

> ⚠️ **Key Risk / Design Decision:** The transactions table schema is the single most important design decision. Every downstream PRD reads from it. Get the fields, indexes, and categorisation flow right here.

---

### PRD-2: AI Categorisation Engine

**Priority:** P1 — Build in parallel with PRD-1 | **Estimated Effort:** 1–2 weeks

The intelligence layer that makes transaction management usable at scale. Without it, users must manually categorise every transaction.

- **Frontend Screens:** No new screens — enhances Import flow and Triage with AI suggestions and confidence scores
- **Backend Domains:** transactions.processImport (Claude API integration), transactions.autoCategorise, AI batch logic with rate limiting
- **Tax Engine Scope:** None
- **What It Delivers:** Imported transactions arrive pre-categorised with confidence scores. Low-confidence items are queued for triage. Users can re-trigger categorisation on uncategorised batches.
- **Depends On:** PRD-1 (transaction schema, import pipeline, triage UI)

> ⚠️ **Key Risk / Design Decision:** Must be designed as an enhancement to PRD-1, not a separate flow. The import action in PRD-1 should have a clear hook/stub for AI categorisation that this PRD fills in.

---

### PRD-3: Tax Calculation Engine

**Priority:** P0 — Build Third | **Estimated Effort:** 3–4 weeks

The core intellectual property. Implements the full NTA 2025 computation: PIT bands, reliefs, WHT credits, CIT/small company exemption, CGT, VAT, FX conversion, minimum tax, and nil returns.

- **Frontend Screens:** Tax Summary screen (full breakdown with band visualisation)
- **Backend Domains:** tax.getSummary (live query running engine inline), tax.refreshSummaryCache, taxYearSummaries table
- **Tax Engine Scope:** The entire Tax Engine Spec: income classification, expense deductions, personal reliefs, PIT bands, WHT credits, FX conversion, digital assets, CGT, CIT, VAT, nil returns, edge cases, versioning
- **What It Delivers:** User sees a live, accurate tax liability that updates reactively as transactions are categorised. Full band-by-band breakdown visible.
- **Depends On:** PRD-1 (transactions data), PRD-0 (entity type drives tax regime)

> ⚠️ **Key Risk / Design Decision:** This is the hardest PRD to get right. Every figure must be verified against the official NTA 2025 gazette. Build comprehensive test cases from the worked examples in the Tax Engine Spec. Engine versioning must be in place from day one.

---

### PRD-4: Invoicing & Client Management

**Priority:** P1 — Can be built in parallel | **Estimated Effort:** 2–3 weeks

Somewhat independent feature stream. Invoices feed into income tracking and WHT credit recording, but can be stubbed during tax engine development.

- **Frontend Screens:** Invoice List, Create/Edit Invoice, Invoice Preview
- **Backend Domains:** Clients (full CRUD), Invoices (CRUD + send + markPaid + cancel), InvoiceItems, PDF generation (NestJS service), email sending
- **Tax Engine Scope:** None directly, but markPaid creates an income transaction (links to PRD-1 schema)
- **What It Delivers:** User can create professional invoices, send them to clients, track payment status, and have paid invoices auto-create income transactions with WHT amounts.
- **Depends On:** PRD-0 (entities), PRD-1 (transaction creation on payment). Can start before PRD-1 is fully complete.

> ⚠️ **Key Risk / Design Decision:** The invoice-to-transaction bridge is the key integration point. When an invoice is marked paid, the system must create a properly categorised income transaction with WHT fields populated. This is what makes invoicing tax-aware rather than just a billing tool.

---

### PRD-5: Dashboard & Real-Time Overview

**Priority:** P1 — Build after PRD-3 | **Estimated Effort:** 1–2 weeks

The home screen that ties everything together. Relatively thin — it's a read-only aggregation layer over data from PRDs 1, 3, and 4.

- **Frontend Screens:** Dashboard (Home) with all cards: income/expense YTD, estimated tax, uncategorised count, recent transactions, deadline countdown, overdue invoices
- **Backend Domains:** dashboard.getSummary, dashboard.getRecentTransactions, dashboard.getDeadlines
- **Tax Engine Scope:** Reads from tax.getSummary (or cached taxYearSummaries)
- **What It Delivers:** A rich, reactive home screen showing the user's complete financial and tax position at a glance.
- **Depends On:** PRD-1 (transactions), PRD-3 (tax figures), PRD-4 (invoice status). Can show partial data if invoicing isn't complete.

> ⚠️ **Key Risk / Design Decision:** Performance matters here — dashboard.getSummary reads across multiple tables. Ensure Convex indexes support the aggregation patterns without scanning entire collections.

---

### PRD-6: Filing Module & Self-Assessment

**Priority:** P0 — Build after PRD-3 | **Estimated Effort:** 2–3 weeks

The culmination of the entire product. This is why users download TaxEase — to actually file their taxes.

- **Frontend Screens:** Filing Checklist, Pre-Filing Review, Self-Assessment Preview, Submission Guide
- **Backend Domains:** Filing (full lifecycle), filingRecords table, PDF generation for self-assessment forms (NestJS), tax snapshot creation
- **Tax Engine Scope:** Consumes the full TaxEngineOutput to generate the self-assessment form. Snapshots the computation at filing time for audit trail.
- **What It Delivers:** User walks through a guided checklist, reviews figures, generates a self-assessment PDF matching FIRS format, gets step-by-step instructions for TaxPro Max submission, and can upload payment receipts and TCC.
- **Depends On:** PRD-3 (tax engine — hard dependency), PRD-1 (transactions completeness check), PRD-4 (invoice/WHT reconciliation)

> ⚠️ **Key Risk / Design Decision:** The self-assessment PDF must mirror the official FIRS format exactly. The tax snapshot stored in filingRecords is an immutable audit record — it must capture the complete TaxEngineOutput at the moment of generation.

---

### PRD-7: Reports & Export

**Priority:** P2 — Build last | **Estimated Effort:** 1–2 weeks

Value-add analytics. Important for year-round engagement but not on the critical path to filing.

- **Frontend Screens:** Reports screen (Income tab, Expenses tab, Year-on-Year tab), Export functionality
- **Backend Domains:** reports.getIncome, reports.getExpenses, reports.getYearOnYear, reports.exportCsv, reports.exportPdf
- **Tax Engine Scope:** Reads aggregated data; no direct engine dependency
- **What It Delivers:** Visual reports with charts, date range selectors, and CSV/PDF export for accountants or personal records.
- **Depends On:** PRD-1 (transaction data), PRD-3 (tax figures for YoY comparison). Can be built incrementally.

> ⚠️ **Key Risk / Design Decision:** Low technical risk. The main concern is chart library choice in React Native and ensuring the export PDFs are clean enough for professional use.

---

### PRD-8: Bank Linking & Live Sync

**Priority:** P2 — Build as enhancement | **Estimated Effort:** 2–3 weeks

Upgrades the manual import flow to live bank connections via Open Banking APIs (Mono, Stitch). High value but high integration complexity.

- **Frontend Screens:** Connected Accounts screen (enhanced), OAuth flows, sync status indicators
- **Backend Domains:** accounts.syncNow, accounts.handleOAuthCallback, accounts.refreshToken, scheduled sync jobs, bank API webhooks
- **Tax Engine Scope:** None
- **What It Delivers:** Users can link their bank accounts for automatic transaction import, with scheduled background sync and real-time webhook-driven updates.
- **Depends On:** PRD-1 (transaction import pipeline — sync feeds into the same batchUpsert path)

> ⚠️ **Key Risk / Design Decision:** Nigerian Open Banking APIs are still maturing. Token refresh reliability, API rate limits, and provider-specific parsing quirks will dominate the effort. Build PRD-1's import pipeline to be source-agnostic so this slots in cleanly.

---

### PRD-9: Notifications & Reminders

**Priority:** P2 — Cross-cutting enhancement | **Estimated Effort:** 1 week

Scheduled functions that keep users engaged year-round: deadline reminders, uncategorised transaction alerts, invoice overdue notices, and sync error notifications.

- **Frontend Screens:** Notifications screen, notification bell badge (global), Notification Settings
- **Backend Domains:** notifications (full CRUD), all scheduled functions (cron jobs for deadline checks, uncategorised alerts, recurring invoice generation)
- **Tax Engine Scope:** Penalty calculator referenced for deadline urgency messaging
- **What It Delivers:** Push and in-app notifications that drive ongoing engagement and ensure users don't miss filing deadlines.
- **Depends On:** PRD-0 (user preferences), PRD-1 (uncategorised count), PRD-4 (invoice due dates), PRD-6 (filing deadlines)

> ⚠️ **Key Risk / Design Decision:** This is a thin layer that touches many domains. The scheduled functions are the backend heart of the "year-round companion" value proposition. Implement the notification infrastructure early (even if empty) so other PRDs can emit notifications from day one.

---

## How Existing Specs Map to PRDs

Each of your current specification documents gets consumed across multiple PRDs. Here's the mapping:

| Spec Document | Section | Consumed By PRD |
|---|---|---|
| Frontend Spec | §5 Onboarding Flow | PRD-0 |
| Frontend Spec | §7 Transactions | PRD-1, PRD-2 |
| Frontend Spec | §8 Invoices | PRD-4 |
| Frontend Spec | §6 Dashboard | PRD-5 |
| Frontend Spec | §9 Tax Summary | PRD-3 |
| Frontend Spec | §10 Filing Module | PRD-6 |
| Frontend Spec | §11 Reports | PRD-7 |
| Frontend Spec | §12 Settings & Profile | PRD-0 (profile), PRD-8 (accounts) |
| Backend Spec | §3 Auth & Sessions | PRD-0 |
| Backend Spec | §4 Database Schema | All PRDs (each owns its tables) |
| Backend Spec | §5.1–5.3 Auth/Users/Entities | PRD-0 |
| Backend Spec | §5.4 Connected Accounts | PRD-1 (basic), PRD-8 (full) |
| Backend Spec | §5.5 Transactions | PRD-1, PRD-2 |
| Backend Spec | §5.6–5.7 Categories/Clients | PRD-1 (categories), PRD-4 (clients) |
| Backend Spec | §5.8 Invoices | PRD-4 |
| Backend Spec | §5.9 Tax Summary | PRD-3 |
| Backend Spec | §5.10 Filing | PRD-6 |
| Backend Spec | §5.11–5.12 Dashboard/Reports | PRD-5, PRD-7 |
| Backend Spec | §5.13 Notifications | PRD-9 |
| Backend Spec | §6 Webhooks | PRD-4 (Paystack/Flutter), PRD-8 (bank) |
| Backend Spec | §7 Scheduled Functions | PRD-9 |
| Backend Spec | §9 External Integrations | PRD-2 (Claude), PRD-4 (email), PRD-8 (banks) |
| Backend Spec | §10 Tax Calc Engine | PRD-3 |
| Backend Spec | §11–13 Security/Deploy/Errors | All PRDs (cross-cutting) |
| Tax Engine Spec | §1–5 Scope, Classification, Deductions, Reliefs | PRD-3 |
| Tax Engine Spec | §6 PIT Bands | PRD-3 |
| Tax Engine Spec | §7–9 WHT, FX, Digital Assets | PRD-3 |
| Tax Engine Spec | §10–13 CGT, CIT, VAT, Nil Returns | PRD-3 |
| Tax Engine Spec | §14–15 Penalties, Worked Examples | PRD-3 (test cases), PRD-9 (penalty messaging) |
| Tax Engine Spec | §16–18 Implementation, Edge Cases, Versioning | PRD-3 |

---

## Recommended Build Sequence

Assuming a small team (2–3 engineers), here's a practical sequence with parallelism:

| Phase | Weeks | PRDs in Progress | Milestone |
|---|---|---|---|
| Phase 1 | Weeks 1–3 | PRD-0 (full team) | Users can sign up, onboard, and see empty shell |
| Phase 2 | Weeks 3–7 | PRD-1 (primary) + PRD-4 (secondary) | Users can import transactions and create invoices |
| Phase 3 | Weeks 7–11 | PRD-3 (primary) + PRD-2 (secondary) | Tax engine live; AI categorisation enhancing imports |
| Phase 4 | Weeks 11–14 | PRD-6 (primary) + PRD-5 (secondary) | Filing works end-to-end; Dashboard shows real data |
| Phase 5 | Weeks 14–17 | PRD-7 + PRD-9 + PRD-8 | Reports, notifications, bank linking — polish phase |

---

## Next Steps

- Validate this split with your team and adjust scope per PRD as needed
- Write PRD-0 first — it's the most self-contained and unblocks everything
- For each PRD, extract the relevant sections from the existing specs into a standalone requirements document with acceptance criteria
- Define API contracts (TypeScript types) between PRDs early so parallel work doesn't create integration surprises
- Set up the Convex schema for all tables in PRD-0 even if most fields are unused initially — schema changes later are more disruptive than getting it right upfront
