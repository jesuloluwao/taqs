# TaxEase Nigeria — Frontend / App Specification

**Version:** 1.0 — February 2026
**Platform:** React Native (iOS, Android, and Web via React Native Web)
**Navigation:** Side Drawer (Hamburger Menu)
**Status:** Draft

---

## Table of Contents

1. [Overview](#1-overview)
2. [Design System & Conventions](#2-design-system--conventions)
3. [Navigation Architecture](#3-navigation-architecture)
4. [Screen Inventory](#4-screen-inventory)
5. [Onboarding Flow](#5-onboarding-flow)
6. [Dashboard (Home)](#6-dashboard-home)
7. [Transactions](#7-transactions)
8. [Invoices](#8-invoices)
9. [Tax Summary](#9-tax-summary)
10. [Filing Module](#10-filing-module)
11. [Reports](#11-reports)
12. [Settings & Profile](#12-settings--profile)
13. [Side Drawer](#13-side-drawer)
14. [Global Components](#14-global-components)

---

## 1. Overview

TaxEase Nigeria is a cross-platform application built in React Native targeting both mobile (iOS/Android) and web browsers. The app guides Nigerian freelancers and SMEs through year-round tax tracking and annual self-assessment filing under the Nigeria Tax Act (NTA) 2025.

The frontend is organised around six primary areas:

| Area | Purpose |
|---|---|
| **Dashboard** | At-a-glance financial and tax position |
| **Transactions** | Import, categorise, and manage financial records |
| **Invoices** | Create, send, and track client invoices |
| **Tax Summary** | Live tax liability calculation and breakdowns |
| **Filing** | Guided self-assessment preparation and submission |
| **Reports** | Exportable summaries and year-over-year comparisons |

---

## 2. Design System & Conventions

### 2.1 Color Palette

| Token | Value | Usage |
|---|---|---|
| `primary` | `#1A7F5E` (deep green) | Primary buttons, active states, key numbers |
| `primary-light` | `#E8F5F0` | Backgrounds for highlighted cards |
| `accent` | `#2B6CB0` (slate blue) | Links, secondary actions |
| `success` | `#38A169` | Positive values, income indicators |
| `warning` | `#D69E2E` | Deadline alerts, pending items |
| `danger` | `#E53E3E` | Overdue items, tax owed alerts |
| `neutral-900` | `#1A202C` | Body text |
| `neutral-500` | `#718096` | Secondary / label text |
| `neutral-100` | `#F7FAFC` | Page backgrounds |
| `white` | `#FFFFFF` | Card surfaces |

### 2.2 Typography

| Style | Size | Weight | Usage |
|---|---|---|---|
| `heading-xl` | 28px | Bold | Screen titles |
| `heading-lg` | 22px | SemiBold | Section headers |
| `heading-md` | 18px | SemiBold | Card titles |
| `body` | 15px | Regular | Paragraph text, list items |
| `body-sm` | 13px | Regular | Captions, metadata |
| `label` | 12px | Medium | Form labels, tags |
| `mono` | 15px | Regular (monospace) | Currency amounts |

### 2.3 Spacing & Layout

- Base unit: **8px**
- Screen horizontal padding: **16px** (mobile), **24px** (web)
- Card border radius: **12px**
- Maximum content width on web: **960px**, centred

### 2.4 Currency Display

All naira amounts display as `₦X,XXX,XXX.XX` using a monospace font. Foreign currency amounts show the original value alongside the naira equivalent in a smaller secondary line.

### 2.5 Platform Differences

| Behaviour | Mobile | Web |
|---|---|---|
| Navigation trigger | Hamburger icon (top-left header) | Persistent sidebar (collapsible) |
| Bottom bar | None (drawer-based nav) | None |
| Input method | Native mobile keyboard, pickers | Standard HTML inputs |
| File import | Device file picker / camera scan | Drag-and-drop + file picker |

---

## 3. Navigation Architecture

### 3.1 Structure

```
App Root
├── Auth Stack (unauthenticated)
│   ├── Splash
│   ├── Welcome
│   ├── Sign Up
│   ├── Log In
│   └── Onboarding Flow (multi-step)
│       ├── Step 1: User Type
│       ├── Step 2: Personal / Business Info
│       ├── Step 3: NIN / TIN Entry
│       └── Step 4: Connect Accounts
│
└── Main Drawer (authenticated)
    ├── Dashboard (Home)
    ├── Transactions Stack
    │   ├── Transaction List
    │   ├── Import Transactions
    │   ├── Transaction Detail / Edit
    │   └── Categorisation Triage
    ├── Invoices Stack
    │   ├── Invoice List
    │   ├── Create / Edit Invoice
    │   └── Invoice Preview
    ├── Tax Summary
    ├── Filing Stack
    │   ├── Filing Checklist
    │   ├── Pre-Filing Review
    │   ├── Self-Assessment Preview
    │   └── Submission Guide
    ├── Reports
    └── Settings Stack
        ├── Profile
        ├── Connected Accounts
        ├── Tax Entities
        └── Notifications
```

### 3.2 Header

Every authenticated screen has a top header bar containing:
- **Left:** Hamburger icon → opens side drawer
- **Centre:** Screen title
- **Right:** Notification bell icon (with unread badge) and optionally a contextual action (e.g., "+ New" on Invoice List)

---

## 4. Screen Inventory

| # | Screen | Description |
|---|---|---|
| 1 | Splash | Logo animation while app initialises |
| 2 | Welcome | First-launch landing with value proposition |
| 3 | Sign Up | Account creation form |
| 4 | Log In | Email/password and biometric login |
| 5 | Onboarding — User Type | Freelancer vs SME selection |
| 6 | Onboarding — Personal Info | Name, profession/business type |
| 7 | Onboarding — NIN / TIN | Tax identity entry and verification |
| 8 | Onboarding — Connect Accounts | Bank statement upload or bank link |
| 9 | Dashboard | Financial overview and key metrics |
| 10 | Transaction List | Paginated, filterable list of all transactions |
| 11 | Import Transactions | Upload PDF/CSV or connect a bank/fintech |
| 12 | Transaction Detail | Single transaction view with edit capability |
| 13 | Categorisation Triage | Card-swipe review for uncategorised transactions |
| 14 | Invoice List | All invoices with status and filters |
| 15 | Create / Edit Invoice | Invoice builder form |
| 16 | Invoice Preview | PDF-style preview before sending |
| 17 | Tax Summary | Full tax calculation breakdown |
| 18 | Filing Checklist | Pre-filing readiness checklist |
| 19 | Pre-Filing Review | Summary of figures before form generation |
| 20 | Self-Assessment Preview | Completed form for user review |
| 21 | Submission Guide | Instructions for TaxPro Max or in-person filing |
| 22 | Reports | Income, expense, and YoY comparison reports |
| 23 | Profile & Settings | User info, preferences, and account management |
| 24 | Connected Accounts | Manage linked banks and fintech platforms |
| 25 | Tax Entities | Manage multiple business entities |
| 26 | Notifications | In-app notification centre |

---

## 5. Onboarding Flow

### 5.1 Splash Screen

- Full-screen background in `primary` green
- TaxEase logo (wordmark + icon) centred vertically
- Subtle fade-in animation on load
- Automatically transitions to Welcome or Dashboard based on auth state

---

### 5.2 Welcome Screen

**Layout:** Full-screen illustrated hero with a brief tagline and two CTAs at the bottom.

**What the user sees:**
- An illustration of a person with a phone/laptop and Nigerian tax symbols
- Headline: *"Tax compliance, made simple for Nigerians"*
- Subline: *"Track income, file returns, and stay penalty-free — all in one place."*
- **Primary button:** "Get Started" → Sign Up
- **Secondary link:** "I already have an account" → Log In

---

### 5.3 Sign Up Screen

**Layout:** Single-column form with a logo at the top.

**Fields:**
- Full name
- Email address
- Password (with show/hide toggle)
- Confirm password

**Footer:** "By signing up, you agree to our Terms and Privacy Policy" (linked)

**CTA:** "Create Account" → triggers account creation, then enters Onboarding flow

---

### 5.4 Log In Screen

**Layout:** Single-column form.

**Fields:**
- Email address
- Password (with show/hide toggle)

**Below form:**
- "Forgot password?" link
- Biometric login button (Face ID / Fingerprint) if previously enabled

**CTA:** "Log In" → navigates to Dashboard if returning user who completed onboarding

---

### 5.5 Onboarding Flow (Multi-Step)

A 4-step wizard. A step indicator (e.g. "Step 2 of 4") and progress bar appear at the top of each step. Users can tap "Back" to revisit previous steps.

---

#### Step 1 — User Type

**What the user sees:**
Two large selectable cards:

| Card | Label | Subtitle |
|---|---|---|
| 👤 | Freelancer / Independent Professional | "I earn income from clients, gigs, or self-employment" |
| 🏢 | Small Business (SME) | "I operate a registered business or company" |

Selecting a card highlights it and enables the "Continue" button.

> This selection affects tax computation logic (PIT vs CIT) and which features are shown.

---

#### Step 2 — Personal / Business Info

**Freelancer fields:**
- First name, Last name (pre-filled from sign-up if available)
- Primary profession (dropdown: Software Developer, Designer, Writer, Content Creator, Consultant, Photographer, Tutor, Other)
- Primary income currency (NGN / USD / GBP / EUR)

**SME fields:**
- Business name
- Business type (dropdown: Registered Business Name / Limited Liability Company)
- Industry (dropdown list)
- Annual turnover range (under ₦25m / ₦25m–₦50m / ₦50m–₦100m / above ₦100m)

---

#### Step 3 — NIN / TIN

**What the user sees:**
- Explanatory text: *"Under the NTA 2025, your National Identification Number (NIN) is your Tax ID. We need this to pre-fill your self-assessment form."*
- NIN input field (11 digits)
- Optional: FIRS TIN field (for users who already registered separately)
- Info callout: "Your NIN is stored securely and never shared without your consent."

**CTA:** "Verify & Continue" — if NIN validation is available via API, a loading state shows while verifying.

---

#### Step 4 — Connect Accounts

**What the user sees:**
A list of import options, each as a tappable card:

| Option | Description |
|---|---|
| **Upload bank statement** | Import a PDF or CSV statement from any Nigerian bank |
| **Connect bank account** | Open Banking API link (where supported) |
| **Connect Paystack / Flutterwave** | Payment platform integration |
| **Connect Payoneer / Wise** | For foreign income earners |
| **I'll do this later** | Skip for now, can be done from Dashboard |

Users may select and set up multiple sources. A small checkmark appears on connected sources.

**CTA:** "Finish Setup" → navigates to Dashboard with a success toast: *"You're all set! Your transactions are being imported."*

---

## 6. Dashboard (Home)

**Purpose:** Give the user an immediate, clear view of their current tax and financial position.

**Layout:** Scrollable single-column feed of cards.

---

### 6.1 Header Card — Tax Position Summary

A prominent card at the top with a `primary-light` background:

- **Left:** Year label (e.g. "2026 Tax Year") and days-to-deadline badge (e.g. "37 days to filing deadline")
- **Centre:** Large figure — *Estimated Tax Liability* — displayed in `mono` font, coloured `danger` if > ₦0
- **Below:** "Effective Rate: X.X%" in smaller text
- **Right:** A small donut or arc chart showing liability vs income ratio

---

### 6.2 Quick Stats Row

A horizontal scrollable row of compact metric cards:

| Card | Value |
|---|---|
| Total Income | Running total in NGN |
| Business Expenses | Deductible expenses so far |
| WHT Credits | Withholding tax already deducted by clients |
| Invoices Outstanding | Count of unpaid invoices + total value |

Each card is tappable and navigates to the relevant section.

---

### 6.3 Uncategorised Transactions Banner

Shown only when there are uncategorised transactions. Appears as an amber-coloured callout:

> *"You have 14 transactions that need categorisation. Review them now to keep your tax estimate accurate."*

**CTA button:** "Review Now" → navigates to Categorisation Triage screen.

---

### 6.4 Recent Transactions

A list of the 5 most recent transactions, each showing:
- Transaction date
- Description (truncated to 1 line)
- Amount (green for income, neutral for expense)
- Category tag (or "Uncategorised" in amber)

**Footer link:** "View All Transactions"

---

### 6.5 Invoice Activity

A compact card showing:
- Number of invoices sent this month
- Total outstanding amount
- Overdue count (if any), highlighted in red

**CTA:** "Go to Invoices"

---

### 6.6 Deadline & Compliance Reminders

A scrollable horizontal list of reminder chips, for example:
- *"VAT return due 21 Feb"*
- *"March 31: Self-assessment deadline"*
- *"3 invoices overdue"*

Tapping a chip navigates to the relevant screen.

---

## 7. Transactions

### 7.1 Transaction List Screen

**Header actions:** Filter icon (right), "Import" button (top-right)

**Filters bar** (horizontally scrollable chips below the search bar):
- All | Income | Expenses | Uncategorised | This Month | This Quarter | Custom Range

**Search bar:** Full-text search across description, amount, and category.

**List items** (each row shows):
- **Left:** Category icon (coloured dot) + date
- **Centre:** Description (1 line), category label below
- **Right:** Amount — green for income, `neutral-900` for expense; currency flag for foreign transactions

**Section headers:** Grouped by month (e.g., "February 2026")

**Empty state:** Illustration + "No transactions yet. Import a bank statement to get started." with an "Import Now" CTA.

---

### 7.2 Import Transactions Screen

**Layout:** Step-based with a method selector at the top.

**Method tabs:**
1. **Upload Statement** — Drag-and-drop zone (web) or file picker button (mobile). Accepts PDF and CSV. Shows upload progress and a preview of parsed transactions before confirming import.
2. **Connect Bank** — List of supported banks with a "Connect" button each. Uses OAuth or credential-based flow per bank API.
3. **Connect Fintech** — Cards for Paystack, Flutterwave, Moniepoint, OPay, Payoneer, Wise.
4. **Manual Entry** — Form to log a single transaction: date, description, amount, currency, category.

**After upload (Statement):**
- A preview table of parsed transactions
- Row count: "We found 47 transactions"
- Duplicate detection warning if any transactions overlap with existing records
- "Confirm Import" button

---

### 7.3 Transaction Detail Screen

**Layout:** Card-based, full-screen scroll.

**Fields displayed:**
- Date and time
- Description (editable inline)
- Amount and currency (with naira equivalent if foreign)
- Category (tappable dropdown to reassign)
- Type: Income / Business Expense / Personal Expense / Transfer / Other
- Tax deductible: Yes / No / Partial (with % split field if Partial)
- Notes field (free text, for audit trail)
- Associated invoice (if matched)
- Source (e.g., "GTBank statement — Feb 2026")

**Actions at bottom:**
- "Save Changes"
- "Mark as Personal" (one-tap to reclassify as non-taxable)
- "Delete Transaction" (destructive, confirmation dialog)

---

### 7.4 Categorisation Triage Screen

**Purpose:** Rapid review of uncategorised transactions, inspired by a card-swipe UI.

**Layout:**
- Progress indicator at top: "12 of 47 remaining"
- Large card in centre showing one transaction at a time:
  - Date, description, amount
  - Source account
- Below the card: **Category suggestion** from the AI engine with a confidence badge (e.g., "Business Expense — Internet/Data ✓ 94%")
- Category confirmation buttons:
  - ✓ **Confirm suggestion** (green)
  - ✎ **Change category** (opens a category picker modal)
  - ✗ **Mark as Personal** (grey, removes from tax calculations)
- "Skip for now" text link at the bottom

**Category Picker Modal:** A searchable list of categories grouped by type (Income Types, Business Expenses, Personal, Transfers). Selecting one applies it and closes the modal.

---

## 8. Invoices

### 8.1 Invoice List Screen

**Header action:** "+ New Invoice" button (top-right)

**Filter tabs:** All | Draft | Sent | Paid | Overdue

**List items** (each row):
- **Left:** Client name + invoice number
- **Centre:** Issue date, due date
- **Right:** Amount + status badge (Draft / Sent / Paid / Overdue)

Status badge colours:
- Draft: `neutral-500` grey
- Sent: `accent` blue
- Paid: `success` green
- Overdue: `danger` red

**Summary bar** (above the list): Total outstanding (`₦X,XXX`) and total paid this year (`₦X,XXX`)

---

### 8.2 Create / Edit Invoice Screen

**Layout:** Scrollable form grouped into sections.

**Section 1 — Invoice Details:**
- Invoice number (auto-generated, editable)
- Issue date (date picker)
- Due date (date picker)
- Currency (NGN / USD / GBP / EUR)

**Section 2 — Client:**
- Client name (with autocomplete from previous clients)
- Client email
- Client address (optional)

**Section 3 — Line Items:**
- Repeating rows: Description | Quantity | Unit Price | Total
- "Add Line Item" button below the rows
- WHT rate selector (0% / 5% / 10%) — if WHT applies, it is shown on the invoice and tagged for credit tracking

**Section 4 — Totals (auto-calculated):**
- Subtotal
- WHT deducted (if applicable)
- VAT (if applicable)
- **Total due**

**Section 5 — Notes:**
- Optional free-text note shown on the invoice (e.g. payment terms)

**Footer actions:**
- "Save as Draft"
- "Preview Invoice" → Invoice Preview screen
- "Send Invoice" → triggers email to client and marks status as Sent

---

### 8.3 Invoice Preview Screen

**Layout:** A rendered, scrollable document that closely resembles the PDF the client will receive.

**Visible elements:**
- Business name, logo (if uploaded), contact details — top-right
- "INVOICE" heading, invoice number, dates — top-left
- Client billing details
- Line items table
- Totals section
- Payment details (bank name, account number, sort code)
- Notes

**Actions bar (bottom):**
- "Edit"
- "Download PDF"
- "Share" (native share sheet on mobile)
- "Send to Client" (email)

---

## 9. Tax Summary

**Purpose:** The user's live, always-updated tax calculation based on all categorised transactions.

**Layout:** Single scrollable screen with expandable sections.

---

### 9.1 Top Card — Tax Liability

A prominent summary card:
- **Headline:** "Estimated Tax Due: ₦XXX,XXX"
- **Sub-line:** "Based on ₦X,XXX,XXX taxable income after deductions"
- **Tax year label** and "Updated just now" timestamp

---

### 9.2 Income Breakdown (expandable)

| Source | Amount |
|---|---|
| Freelance / Client Income | ₦X,XXX,XXX |
| Foreign Income (converted) | ₦X,XXX,XXX |
| Other taxable income | ₦X,XXX,XXX |
| **Total Gross Income** | **₦X,XXX,XXX** |

---

### 9.3 Deductions (expandable)

| Deduction | Amount |
|---|---|
| Business Expenses | ₦XXX,XXX |
| Rent Relief (20% of rent, max ₦500k) | ₦XXX,XXX |
| Pension Contributions | ₦XXX,XXX |
| NHIS / NHF | ₦XXX,XXX |
| Other allowable reliefs | ₦XXX,XXX |
| **Total Deductions** | **₦XXX,XXX** |
| **Taxable Income** | **₦X,XXX,XXX** |

---

### 9.4 Tax Band Breakdown (expandable)

A visual bar or table showing how the taxable income is distributed across the progressive PIT bands:

| Band | Rate | Income in Band | Tax |
|---|---|---|---|
| ₦0 – ₦800,000 | 0% | ₦800,000 | ₦0 |
| ₦800,001 – ₦2,000,000 | 15% | ₦1,200,000 | ₦180,000 |
| … | … | … | … |

---

### 9.5 Credits & Payments (expandable)

| Item | Amount |
|---|---|
| Withholding Tax Credits | −₦XXX,XXX |
| **Net Tax Payable** | **₦XXX,XXX** |

---

### 9.6 SME-Specific Section (shown for SME user type)

- VAT position: Output VAT collected vs Input VAT recoverable → Net VAT payable
- CIT applicability status: "Your company qualifies for the small company exemption (turnover ≤ ₦100m)." or a CIT calculation if not exempt.

---

## 10. Filing Module

### 10.1 Filing Checklist Screen

**Layout:** A list of checklist items grouped into categories, each with a status indicator.

**Status indicators:** ✅ Done | ⚠️ Needs attention | ❌ Missing

**Checklist groups:**

*Identity & Registration*
- NIN/TIN on file ✅
- Tax entity type confirmed ✅

*Income*
- All bank accounts imported ⚠️ (1 account not yet linked)
- All foreign income converted ✅
- Income sources reviewed and confirmed ❌

*Expenses & Deductions*
- All transactions categorised ⚠️ (12 uncategorised)
- Business expenses verified ✅
- Rent paid amount confirmed ❌

*Invoices*
- All issued invoices matched to income ✅
- WHT credits recorded ✅

**Overall readiness meter** at the top: e.g., "78% Ready"

**CTA (enabled when ≥90% ready):** "Start Filing Review" → Pre-Filing Review screen

---

### 10.2 Pre-Filing Review Screen

**Layout:** Scrollable summary of all figures with a final confirmation step.

**What the user sees:**
- A read-only condensed version of the Tax Summary (income, deductions, taxable income, tax bands, credits, net payable)
- Any flagged issues highlighted in an amber callout box at the top (e.g., "2 transactions still uncategorised — they have been excluded from this calculation")
- Tip card: "Once you generate your self-assessment, you can still make amendments before submitting to TaxPro Max."

**Footer actions:**
- "Go Back to Fix Issues" (if flags exist)
- "Generate Self-Assessment Form" (primary CTA)

---

### 10.3 Self-Assessment Preview Screen

**Layout:** A document-style rendered view of the completed self-assessment form, mirroring the NRS/FIRS format.

**Sections visible:**
- Taxpayer details (name, NIN, address)
- Income schedule
- Deductions and reliefs schedule
- Tax computation summary
- Credits (WHT)
- Net amount payable

**Actions:**
- "Download as PDF"
- "Continue to Submission Guide" (primary CTA)

---

### 10.4 Submission Guide Screen

**Layout:** Step-by-step instructions presented as a numbered list with icons.

**Steps shown:**

1. **Submit via TaxPro Max** — "Visit taxpromax.firs.gov.ng, log in with your NIN/TIN, navigate to Self-Assessment, and upload the completed form." Deep link to the portal where supported.

2. **Make Payment** — "Pay ₦XXX,XXX to the NRS Collection Account via bank transfer or online payment. Use your TIN as the payment reference." Bank details displayed with a copy-to-clipboard button.

3. **Upload Payment Receipt** — A file upload field to store the payment confirmation in the app for your records.

4. **Obtain Tax Clearance Certificate** — "After payment is confirmed (typically 5–10 business days), log in to TaxPro Max to download your TCC."

5. **Store Your Records** — Reminder card: "TaxEase has saved your filing summary, payment receipt, and TCC in your Documents section."

---

## 11. Reports

**Layout:** Tab bar at the top with three tabs: Income | Expenses | Year-on-Year

---

### 11.1 Income Tab

- Date range selector (This Year / Last Year / Custom)
- Summary figures: Total Income | Foreign Income | Average Monthly Income
- Bar chart: Monthly income for the selected period
- Breakdown list by income source / category

---

### 11.2 Expenses Tab

- Date range selector
- Summary: Total Expenses | Deductible | Non-Deductible
- Doughnut chart: Expense breakdown by category (Internet, Equipment, Software, Rent, etc.)
- Category list with amounts, sorted by size

---

### 11.3 Year-on-Year Tab

- Side-by-side comparison: Current year vs prior year
- Key metrics: Income | Expenses | Tax Liability | Effective Rate
- Line chart overlaying both years' monthly income

---

### 11.4 Export Options (available on all tabs)

A floating "Export" button generates:
- **PDF report** — formatted summary for personal records or accountant
- **CSV** — raw transaction data for the selected period

---

## 12. Settings & Profile

### 12.1 Profile Screen

**Layout:** Avatar at top, form below.

**Editable fields:**
- Profile photo (upload or initials avatar)
- Full name
- Email address (with re-verification if changed)
- Phone number
- NIN (masked, with option to update)
- FIRS TIN (if separately registered)
- Primary currency preference

**Danger zone (bottom):** "Delete Account" (requires password confirmation)

---

### 12.2 Connected Accounts Screen

**Layout:** List of connected sources, each as a card with a status badge.

**Card contents:**
- Institution name + logo
- Account type (bank, fintech)
- Last synced timestamp
- Status: Active / Error / Disconnected

**Actions per card:**
- "Sync Now"
- "Disconnect"

**Footer:** "+ Add New Account" → Import Transactions screen

---

### 12.3 Tax Entities Screen

**Purpose:** For users who operate multiple business names or an LLC alongside freelance work.

**Layout:** List of entities, each card showing entity name, type, and tax year status.

**Actions:** "Add Entity" → creates a separate ledger and tax calculation context.

> Switching between entities is accessible from the side drawer.

---

### 12.4 Notifications Screen

**Settings available:**
- Filing deadline reminders (toggle, lead time selector: 30 / 14 / 7 / 1 day before)
- VAT return reminders (toggle)
- Uncategorised transactions alert (toggle, frequency: daily / weekly)
- Invoice overdue alerts (toggle, days after due: 1 / 3 / 7)
- Push notification permission status (with "Enable in Settings" deep link if denied)

---

## 13. Side Drawer

**Trigger:** Hamburger icon in the top-left header on all authenticated screens.

**Layout:** Slides in from the left (mobile) or is a persistent sidebar (web).

**Contents (top to bottom):**

```
[ User avatar ]  Amaka Okonkwo
                 amaka@email.com
[ Entity selector dropdown — if multiple entities ]

─────────────────────────────
🏠  Dashboard
💳  Transactions
🧾  Invoices
📊  Tax Summary
📋  Filing
📈  Reports
─────────────────────────────
⚙️  Settings
❓  Help & Support
📄  Documents (filed returns, receipts)
─────────────────────────────
🚪  Log Out
```

**Active item** is highlighted with a `primary-light` background and `primary` coloured label and icon.

---

## 14. Global Components

### 14.1 Toast Notifications

Short-lived messages at the top of the screen (mobile) or bottom-right (web):
- **Success** (green): "Invoice sent successfully"
- **Warning** (amber): "5 transactions are still uncategorised"
- **Error** (red): "Import failed. Please check the file format."
- **Info** (blue): "Bank sync in progress…"

### 14.2 Empty States

Every list screen has a designed empty state: a relevant illustration, a headline explaining what will appear here, and a primary CTA to take the first action.

### 14.3 Loading States

- Full-screen loader: used on initial data fetch after login
- Skeleton placeholders: used on lists and cards while data loads (preferred over spinners)
- Inline button spinners: used when a button action triggers an async operation

### 14.4 Error States

- **Network error banner:** Appears at the top of the screen if connectivity is lost. Auto-dismisses on reconnection.
- **Calculation error card:** Replaces the Tax Summary card if figures cannot be computed (e.g., missing data), with a link to the issue.

### 14.5 Confirmation Dialogs

Used before destructive actions (delete transaction, disconnect account, delete account). Always include:
- Title describing the action
- Brief consequence statement
- "Cancel" (secondary) and "Confirm" (primary, coloured `danger`) buttons

### 14.6 Deadline Countdown Widget

A persistent but non-intrusive countdown shown at the top of the Dashboard and Filing screens from 60 days before the March 31 filing deadline:
- Changes colour from `success` → `warning` → `danger` as the deadline approaches
- Tapping it navigates to the Filing Checklist screen

---

*End of Frontend / App Specification — v1.0*
