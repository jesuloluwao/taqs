# PRD-7: Reports & Export

**TaxEase Nigeria**  
**Version:** 1.0 — February 2026  
**Status:** Draft  
**Priority:** P2 — Build Last  
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

PRD-7 delivers the **Reports & Export** module for TaxEase Nigeria — a value-add analytics layer that gives freelancers and SMEs visual insight into their income, expenses, and year-on-year tax position. Users can explore interactive charts, filter by date range, and export formatted PDF or CSV reports for their accountants, personal records, or audit defence.

This module reads exclusively from data produced by earlier PRDs: transactions (PRD-1), tax year summaries (PRD-3), and categories (PRD-0). It introduces **no new database tables** — all report data is computed at query time from existing tables.

### 1.2 Scope

| In Scope | Out of Scope |
|----------|--------------|
| Reports screen with three tabs (Income, Expenses, Year-on-Year) | Real-time dashboard widgets (PRD-5) |
| Date range selector (This Year / Last Year / Custom) | Invoice reports (PRD-4) |
| Summary figures per tab | Filing-specific reports (PRD-6) |
| Interactive charts (bar, doughnut, line) | Bank statement re-export |
| Breakdown lists (by category, by source) | Scheduled/automated report emails |
| CSV export (raw transaction data) | Report sharing via in-app messaging |
| PDF export (formatted summary report) | Report templates customisation |
| Native share sheet for exported files | Report annotations or comments |
| Loading, empty, and error states | Printing support (beyond PDF) |

### 1.3 What It Delivers

Upon completion of PRD-7, a user can:

1. **Navigate** to Reports from the side drawer and see three tabs: Income, Expenses, Year-on-Year
2. **Select date ranges** using predefined options (This Year, Last Year) or a custom date picker
3. **View income analytics** with summary figures, a monthly bar chart, and a breakdown by category/source
4. **View expense analytics** with summary figures, a doughnut chart by category, and a sorted category list
5. **Compare years** side-by-side with key tax metrics and a dual-line monthly income overlay chart
6. **Export CSV** with raw transaction data for the selected period and tab
7. **Export PDF** with a professionally formatted summary report
8. **Share** exported files via the native OS share sheet (mobile) or download (web)

### 1.4 Dependencies

| Dependency | What It Provides | Status |
|------------|------------------|--------|
| **PRD-0** (Auth, Onboarding, Entity Setup) | Users, entities, categories, entity context | Must be built |
| **PRD-1** (Transaction Management) | `transactions` table — all financial data for income/expense reports | Must be built |
| **PRD-3** (Tax Calculation Engine) | `taxYearSummaries` table — cached tax figures for Year-on-Year comparison | Must be built |

### 1.5 Key Design Decisions

- **Chart library:** Use `react-native-chart-kit` or `victory-native` for React Native; both support bar, doughnut, and line charts. Final choice deferred to engineering spike — see Open Questions.
- **PDF generation:** Delegated to a NestJS microservice (`POST /pdf/report`) that accepts structured JSON and returns a formatted PDF. The Convex action `reports.exportPdf` calls this service.
- **CSV generation:** Computed entirely within a Convex action (`reports.exportCsv`); no external service needed.
- **No new tables:** All report data is derived from `transactions`, `taxYearSummaries`, and `categories` at query time. No materialised report tables.
- **Entity-scoped:** All reports are scoped to the active entity selected in the side drawer. Users never see cross-entity aggregated data.

---

## 2. Entities (TypeScript Interfaces)

These interfaces define the shapes returned by report queries and consumed by the frontend. They are **response types** — no new database documents are created.

### 2.1 Date Range

```typescript
/** Predefined or custom date range for report filtering */
type DateRangePreset = "this_year" | "last_year" | "custom";

interface DateRange {
  preset: DateRangePreset;
  startDate: number;   // Unix ms — inclusive
  endDate: number;     // Unix ms — inclusive
}
```

### 2.2 Monthly Breakdown

```typescript
/** A single month's aggregated figure — used for bar and line charts */
interface MonthlyBreakdown {
  month: number;        // 1–12
  monthLabel: string;   // "Jan", "Feb", etc.
  year: number;
  amount: number;       // Total amount in NGN for the month
}
```

### 2.3 Category Breakdown

```typescript
/** Aggregated amount for a single category — used for doughnut chart and lists */
interface CategoryBreakdown {
  categoryId: string;
  categoryName: string;
  categoryIcon?: string;
  categoryColor?: string;
  amount: number;           // Total amount in NGN
  percentage: number;       // Percentage of total (0–100)
  transactionCount: number; // Number of transactions in this category
}
```

### 2.4 Income Report

```typescript
/** Response shape for the Income tab */
interface IncomeReport {
  dateRange: DateRange;
  entityId: string;

  /** Summary figures */
  totalIncome: number;
  foreignIncome: number;
  domesticIncome: number;
  averageMonthlyIncome: number;

  /** Bar chart data — monthly income for the selected period */
  monthlyBreakdown: MonthlyBreakdown[];

  /** Breakdown list by income source / category */
  categoryBreakdown: CategoryBreakdown[];

  /** Metadata */
  transactionCount: number;
  currenciesIncluded: string[];   // e.g. ["NGN", "USD", "GBP"]
}
```

### 2.5 Expense Report

```typescript
/** Response shape for the Expenses tab */
interface ExpenseReport {
  dateRange: DateRange;
  entityId: string;

  /** Summary figures */
  totalExpenses: number;
  deductibleExpenses: number;
  nonDeductibleExpenses: number;

  /** Doughnut chart data — expense breakdown by category */
  categoryBreakdown: CategoryBreakdown[];

  /** Monthly trend (optional — for sparkline or secondary chart) */
  monthlyBreakdown: MonthlyBreakdown[];

  /** Metadata */
  transactionCount: number;
}
```

### 2.6 Year-on-Year Comparison

```typescript
/** Key metrics for a single year — used in side-by-side comparison */
interface YearMetrics {
  taxYear: number;
  totalIncome: number;
  totalExpenses: number;
  taxableIncome: number;
  grossTaxLiability: number;
  netTaxPayable: number;
  effectiveTaxRate: number;         // 0–100 percentage
  isNilReturn: boolean;
}

/** Response shape for the Year-on-Year tab */
interface YearOnYearReport {
  entityId: string;
  currentYear: YearMetrics;
  priorYear: YearMetrics;

  /** Percentage change between years */
  incomeChange: number;             // e.g. +12.5 or -8.3
  expenseChange: number;
  taxLiabilityChange: number;

  /** Line chart data — monthly income overlay for both years */
  currentYearMonthly: MonthlyBreakdown[];
  priorYearMonthly: MonthlyBreakdown[];
}
```

### 2.7 Export Types

```typescript
type ExportFormat = "csv" | "pdf";
type ExportTab = "income" | "expenses" | "year_on_year";

/** Request payload for export functions */
interface ExportRequest {
  entityId: string;
  tab: ExportTab;
  format: ExportFormat;
  dateRange: DateRange;
}

/** Response from CSV export — returns raw string */
interface CsvExportResult {
  csv: string;
  filename: string;         // e.g. "taxease_income_2026.csv"
  rowCount: number;
}

/** Response from PDF export — returns storage URL */
interface PdfExportResult {
  storageId: string;        // Convex Storage ID for the generated PDF
  url: string;              // Temporary download URL
  filename: string;         // e.g. "taxease_income_report_2026.pdf"
}
```

---

## 3. User Stories

### 3.1 Reports Screen & Tab Navigation

#### US-701: View Reports screen with tab navigation

**As a** freelancer or SME owner  
**I want** to access a Reports screen with Income, Expenses, and Year-on-Year tabs  
**So that** I can explore my financial data from different analytical angles.

**Trigger:** User navigates to Reports from the side drawer.

**Flow:**
1. User taps "Reports" in side drawer
2. Reports screen opens with three tabs at the top: Income | Expenses | Year-on-Year
3. Income tab is selected by default
4. Tab bar is horizontally scrollable on narrow screens, fixed on wider screens
5. Tapping a tab switches content; selected tab has primary colour underline
6. All data is scoped to the active entity from the drawer

**Acceptance Criteria:**
- [ ] Reports screen accessible from side drawer
- [ ] Three tabs visible: Income, Expenses, Year-on-Year
- [ ] Income tab selected by default on entry
- [ ] Active tab indicated with `primary` (#1A7F5E) underline and bold label
- [ ] Inactive tabs use `neutral-500` (#718096) text
- [ ] Tab switching preserves date range selection within the session
- [ ] All data scoped to active entity (entityId from global context)
- [ ] Header shows "Reports" title with hamburger icon (drawer) and Export button

---

#### US-702: Tab switching behaviour

**As a** user browsing reports  
**I want** smooth tab switching that remembers my selections  
**So that** I don't lose context when moving between tabs.

**Trigger:** User taps a different tab on the Reports screen.

**Flow:**
1. User is on Income tab with "This Year" selected
2. User taps Expenses tab
3. Expenses tab loads with the same date range ("This Year") applied
4. User switches back to Income — previous data still loaded (cached in memory)

**Acceptance Criteria:**
- [ ] Date range selection persists across tab switches within the same session
- [ ] Previously loaded tab data is cached in component state (no re-fetch on switch-back unless date range changed)
- [ ] Tab transition is instant (no visible loading flash for cached data)
- [ ] If underlying data changed while on another tab, re-fetch occurs silently

---

### 3.2 Income Tab

#### US-703: View Income tab with summary figures

**As a** freelancer  
**I want** to see my total income, foreign income, and average monthly income for a period  
**So that** I have a quick financial overview.

**Trigger:** User is on the Income tab of Reports.

**Flow:**
1. Income tab displays three summary cards at the top:
   - **Total Income** — sum of all income transactions (amountNgn) in the period
   - **Foreign Income** — sum of income where currency ≠ "NGN"
   - **Average Monthly Income** — total income ÷ number of months in the period
2. Figures use mono font with naira sign (₦) prefix
3. Cards are arranged in a horizontal row (scrollable on narrow screens)

**Acceptance Criteria:**
- [ ] Total Income shows sum of all income transactions (type = "income") in period, in NGN
- [ ] Foreign Income shows sum where currency ≠ "NGN", converted to NGN (amountNgn)
- [ ] Average Monthly Income = Total Income ÷ count of distinct months in the period
- [ ] All amounts formatted as ₦X,XXX,XXX using mono font
- [ ] Summary cards have `white` (#FFFFFF) background with subtle shadow
- [ ] Values update when date range changes
- [ ] **Empty state:** When no income transactions in period (`transactionCount === 0`): show illustration, headline "No income data for this period", subtext "Import transactions or select a different date range to see your income report.", CTAs: "Import Transactions" (navigates to PRD-1 Import) and "Change date range"

---

#### US-704: View monthly income bar chart

**As a** freelancer  
**I want** to see a bar chart of my monthly income  
**So that** I can spot trends and seasonal patterns.

**Trigger:** User is on the Income tab; chart section is visible below summary cards.

**Flow:**
1. Bar chart renders below summary cards
2. X-axis: months in the selected period (e.g. Jan–Dec for "This Year")
3. Y-axis: amount in NGN, auto-scaled
4. Each bar represents total income for that month
5. User can tap a bar to see a tooltip with the exact figure

**Acceptance Criteria:**
- [ ] Bar chart uses `primary` (#1A7F5E) as bar fill colour
- [ ] X-axis labels: abbreviated month names (Jan, Feb, …, Dec)
- [ ] Y-axis labels: NGN amounts with K/M suffix for readability (e.g. ₦1.2M)
- [ ] Y-axis labels use `neutral-500` (#718096), `body-sm` (13px)
- [ ] Chart background: `neutral-100` (#F7FAFC) with white gridlines
- [ ] Tap on bar shows tooltip: "Feb 2026: ₦450,000"
- [ ] Months with zero income show no bar (gap)
- [ ] Chart is responsive — fills available width
- [ ] For "Last Year" or custom ranges spanning < 12 months, only relevant months shown

---

#### US-705: View income breakdown by category

**As a** freelancer  
**I want** to see a breakdown of my income by source/category  
**So that** I know where my money is coming from.

**Trigger:** User scrolls below the bar chart on the Income tab.

**Flow:**
1. Section header: "Income by Category"
2. List of categories sorted by amount (highest first)
3. Each row shows: category colour dot, category name, amount (₦), percentage of total
4. Rows are tappable — future: navigate to filtered transaction list

**Acceptance Criteria:**
- [ ] Breakdown list shows all income categories with at least one transaction in the period
- [ ] Sorted by amount descending
- [ ] Each row: colour dot (from `category.color`), name, amount (mono font), percentage badge
- [ ] Percentage is `(categoryAmount / totalIncome × 100)`, rounded to 1 decimal
- [ ] "Uncategorised" income grouped at the bottom with `warning` (#D69E2E) colour
- [ ] Sum of all categories equals Total Income (rounding tolerance ±₦1)

---

### 3.3 Expenses Tab

#### US-706: View Expenses tab with summary figures

**As a** freelancer or SME owner  
**I want** to see my total expenses, deductible, and non-deductible totals  
**So that** I understand my spending and tax-deductible position.

**Trigger:** User switches to the Expenses tab.

**Flow:**
1. Three summary cards:
   - **Total Expenses** — sum of all expense transactions (business_expense + personal_expense) in the period
   - **Deductible** — sum of `amountNgn × (deductiblePercent / 100)` where `isDeductible = true`
   - **Non-Deductible** — total expenses minus deductible amount
2. Cards styled identically to Income tab

**Acceptance Criteria:**
- [ ] Total Expenses = sum of amountNgn for transactions where type ∈ ["business_expense", "personal_expense"]
- [ ] Deductible = sum of `amountNgn × (deductiblePercent / 100)` for business_expense transactions where isDeductible = true
- [ ] Non-Deductible = Total Expenses − Deductible
- [ ] Deductible card uses `success` (#38A169) accent indicator
- [ ] Non-Deductible card uses `danger` (#E53E3E) accent indicator
- [ ] Values formatted as ₦X,XXX,XXX in mono font
- [ ] **Empty state:** When no expense transactions in period (`transactionCount === 0`): show illustration, headline "No expense data for this period", subtext "Import transactions or select a different date range to see your expense report.", CTAs: "Import Transactions" and "Change date range"

---

#### US-707: View expense doughnut chart

**As a** user  
**I want** to see a doughnut chart showing my expense distribution by category  
**So that** I can visually identify where I spend the most.

**Trigger:** User is on the Expenses tab; chart section visible below summary cards.

**Flow:**
1. Doughnut chart renders below summary cards
2. Each segment represents a category's share of total expenses
3. Centre of doughnut shows total expenses amount
4. Legend below chart lists categories with colour swatches and amounts
5. User can tap a segment to highlight it and see the tooltip

**Acceptance Criteria:**
- [ ] Doughnut chart segments sized proportionally to each category's expense total
- [ ] Segment colours: use `category.color` if set; otherwise assign from a predefined palette:
  - Internet & Data: `#2B6CB0` (accent)
  - Equipment: `#1A7F5E` (primary)
  - Software: `#38A169` (success)
  - Rent/Workspace: `#D69E2E` (warning)
  - Transport: `#E53E3E` (danger)
  - Marketing: `#805AD5`
  - Professional Dev: `#DD6B20`
  - Bank Charges: `#718096` (neutral-500)
  - Other: `#A0AEC0`
- [ ] Centre label: "₦X,XXX,XXX" total in `heading-md` (18px SemiBold)
- [ ] Legend below chart: colour swatch, category name, amount, percentage
- [ ] Tap segment: segment pulls out slightly, tooltip shows "Internet & Data: ₦85,000 (12.3%)"
- [ ] Categories contributing < 3% of total grouped into "Other" segment
- [ ] Maximum 8 segments + "Other" (9 total) to maintain readability

---

#### US-708: View expense category list

**As a** user  
**I want** to see a sorted list of expense categories with amounts  
**So that** I can review my spending in detail.

**Trigger:** User scrolls below the doughnut chart on the Expenses tab.

**Flow:**
1. Section header: "Expenses by Category"
2. List of all expense categories sorted by amount (highest first)
3. Each row: category colour dot, category name, amount, percentage, transaction count
4. Deductible categories show a small green "Deductible" badge

**Acceptance Criteria:**
- [ ] All expense categories with transactions in the period are listed
- [ ] Sorted by total amount descending
- [ ] Each row: colour dot, name, amount (mono), percentage, transaction count (e.g. "24 transactions")
- [ ] Deductible badge shown for categories where `isDeductibleDefault = true`
- [ ] Personal expenses grouped with `neutral-500` styling and no deductible badge
- [ ] Row is tappable — future: navigate to filtered transaction list for that category

---

### 3.4 Year-on-Year Tab

#### US-709: View Year-on-Year side-by-side comparison

**As a** returning user  
**I want** to compare my current year's financial metrics against the prior year  
**So that** I can track my financial growth and tax burden over time.

**Trigger:** User switches to the Year-on-Year tab.

**Flow:**
1. Two-column comparison card at the top:
   - Left column: Current Year (e.g. "2026")
   - Right column: Prior Year (e.g. "2025")
2. Key metrics in rows:
   - Total Income
   - Total Expenses
   - Tax Liability (net tax payable)
   - Effective Tax Rate
3. Each metric shows the amount for both years and a change indicator (↑ +12.5% or ↓ -8.3%)

**Acceptance Criteria:**
- [ ] Current year defaults to the entity's current tax year; prior year = current − 1
- [ ] Metrics sourced from `taxYearSummaries` for both years
- [ ] Each metric row shows: label, current year amount, prior year amount, percentage change
- [ ] Positive income/expense changes use `success` (#38A169) with ↑ arrow
- [ ] Negative changes use `danger` (#E53E3E) with ↓ arrow
- [ ] Tax liability increase uses `danger`; decrease uses `success` (inverted — lower tax is positive)
- [ ] Effective tax rate shown as "X.X%" (not currency)
- [ ] If prior year has no data: "No data for [year]" shown in prior year column
- [ ] Change percentage: `((current - prior) / prior × 100)`, rounded to 1 decimal; "N/A" if prior = 0
- [ ] **Empty state (first-year or no data):** When both current and prior year have no `taxYearSummaries` or transaction data: show illustration, headline "No year-on-year data yet", subtext "Complete a tax year and add transactions to compare years. Year-on-year comparison requires at least one prior year with data.", CTA: "Go to Transactions"

---

#### US-710: View Year-on-Year line chart

**As a** user  
**I want** to see a line chart comparing monthly income across two years  
**So that** I can visualise trends and seasonality.

**Trigger:** User is on the Year-on-Year tab; chart section visible below comparison card.

**Flow:**
1. Line chart renders below comparison card
2. Two lines overlaid on the same axes:
   - Solid line for current year in `primary` (#1A7F5E)
   - Dashed line for prior year in `accent` (#2B6CB0)
3. X-axis: Jan–Dec (months)
4. Y-axis: amount in NGN, auto-scaled
5. Legend: "2026" (solid green), "2025" (dashed blue)
6. User can tap a data point to see the tooltip

**Acceptance Criteria:**
- [ ] Current year line: solid, 2px stroke, `primary` (#1A7F5E)
- [ ] Prior year line: dashed, 2px stroke, `accent` (#2B6CB0)
- [ ] X-axis labels: abbreviated month names (Jan–Dec)
- [ ] Y-axis labels: NGN with K/M suffix, `neutral-500`, `body-sm`
- [ ] Chart background: `neutral-100` with white gridlines
- [ ] Legend below chart: colour swatch + year label for each line
- [ ] Tap data point shows tooltip: "Mar 2026: ₦380,000"
- [ ] If current year has incomplete months (e.g. it's Feb 2026), current year line stops at the last month with data
- [ ] Prior year line always shows all 12 months (or months with data)
- [ ] Chart fills available width; minimum height 220px

---

### 3.5 Date Range Selection

#### US-711: Select predefined date range

**As a** user  
**I want** to quickly switch between This Year, Last Year, or a custom range  
**So that** I can view reports for the period I need.

**Trigger:** User taps the date range selector on any report tab.

**Flow:**
1. Date range selector appears below the tab bar (above summary cards)
2. Three options displayed as segmented control or chip group: "This Year" | "Last Year" | "Custom"
3. "This Year" is selected by default
4. Tapping "Last Year" reloads data for the prior calendar year (Jan 1 – Dec 31)
5. Tapping "Custom" opens the custom date picker (US-712)

**Acceptance Criteria:**
- [ ] Segmented control with three options
- [ ] Active option uses `primary` background with white text
- [ ] Inactive options use `neutral-100` background with `neutral-900` text
- [ ] "This Year" = Jan 1 to today (or Dec 31 if viewing past year)
- [ ] "Last Year" = Jan 1 to Dec 31 of prior year
- [ ] Selection triggers data re-fetch for the selected period
- [ ] Selection persists across tab switches within the session
- [ ] Year-on-Year tab: date range selector is hidden (years are fixed: current vs prior)

---

#### US-712: Select custom date range

**As a** user  
**I want** to pick a custom start and end date for my report  
**So that** I can analyse a specific period (e.g. Q1, or a specific project timeline).

**Trigger:** User taps "Custom" on the date range selector.

**Flow:**
1. Modal or inline date picker opens with two fields: Start Date, End Date
2. Start Date defaults to Jan 1 of current year; End Date defaults to today
3. User picks dates using calendar picker
4. Validation: Start Date ≤ End Date; range ≤ 5 years
5. User taps "Apply"
6. Date range label updates to show "1 Jan – 28 Feb 2026" (or similar)
7. Report data re-fetches for the custom range

**Acceptance Criteria:**
- [ ] Calendar date picker with month/year navigation
- [ ] Start Date and End Date fields clearly labelled
- [ ] Validation: Start must be ≤ End; maximum range of 5 years
- [ ] Invalid range shows inline error: "Start date must be before end date"
- [ ] "Apply" button submits; "Cancel" dismisses without change
- [ ] After applying, the segmented control shows "Custom" as active with the date range displayed below (e.g. "1 Jan – 28 Feb 2026")
- [ ] Minimum selectable date: earliest transaction date for the entity (or Jan 1, 2020)

---

### 3.6 Export — CSV

#### US-713: Export report data as CSV

**As a** user  
**I want** to export the current report's underlying transaction data as a CSV file  
**So that** I can share it with my accountant or import it into spreadsheet software.

**Trigger:** User taps the "Export" floating button and selects "CSV".

**Flow:**
1. User taps floating "Export" button (visible on all tabs)
2. Export options sheet appears: "Download as CSV" | "Download as PDF"
3. User selects "Download as CSV"
4. Export button enters loading state: "Generating CSV…" (button disabled or spinner overlay)
5. `reports.exportCsv` action called with entityId, tab, dateRange
6. CSV string generated from transaction data
7. File downloaded or share sheet opens with the file

**Acceptance Criteria:**
- [ ] Export button shows loading state during generation (disabled or spinner; "Generating CSV…" label)
- [ ] On failure: toast "Export failed. Please try again." with "Retry" option
- [ ] CSV generated for the active tab's data and selected date range
- [ ] On mobile: native share sheet opens with the CSV file attached
- [ ] On web: file downloads directly to the browser's download folder
- [ ] Filename format: `taxease_{tab}_{startDate}_{endDate}.csv` (e.g. `taxease_income_2026-01-01_2026-12-31.csv`)
- [ ] Success toast: "CSV exported successfully"

---

#### US-714: CSV column format — Income tab

**As an** accountant receiving a TaxEase CSV  
**I want** the CSV to contain standard, clearly labelled columns  
**So that** I can process it without confusion.

**CSV Columns for Income tab:**

| Column Header | Description | Example |
|---------------|-------------|---------|
| Date | Transaction date (YYYY-MM-DD) | 2026-02-15 |
| Description | Transaction description | Freelance payment - Acme Corp |
| Category | Category name | Freelance/Client Income |
| Amount (NGN) | Amount in naira | 450000.00 |
| Original Amount | Amount in original currency | 300.00 |
| Original Currency | ISO 4217 code | USD |
| FX Rate | CBN rate used | 1500.00 |
| WHT Deducted (NGN) | Withholding tax amount | 22500.00 |
| Source Account | Connected account name | GTBank — 0123456789 |
| Notes | User notes | Q1 consulting |

**Acceptance Criteria:**
- [ ] Header row always present as first line
- [ ] One transaction per row
- [ ] Amounts formatted to 2 decimal places, no currency symbol
- [ ] Dates in ISO 8601 format (YYYY-MM-DD)
- [ ] Empty optional fields left blank (not "null" or "N/A")
- [ ] UTF-8 encoding with BOM for Excel compatibility
- [ ] Sorted by date ascending

---

#### US-715: CSV column format — Expenses tab

**CSV Columns for Expenses tab:**

| Column Header | Description | Example |
|---------------|-------------|---------|
| Date | Transaction date (YYYY-MM-DD) | 2026-02-10 |
| Description | Transaction description | Monthly internet subscription |
| Category | Category name | Internet & Data |
| Type | business_expense or personal_expense | business_expense |
| Amount (NGN) | Total amount in naira | 25000.00 |
| Deductible | Yes / No / Partial | Yes |
| Deductible % | Percentage deductible | 100 |
| Deductible Amount (NGN) | Amount × deductible% | 25000.00 |
| Source Account | Connected account name | Access Bank — 9876543210 |
| Notes | User notes | |

**Acceptance Criteria:**
- [ ] Same formatting rules as Income CSV (dates, encoding, sort)
- [ ] Deductible column: "Yes" if 100%, "No" if 0%, "Partial" if 1–99%
- [ ] Deductible Amount = Amount × (Deductible % / 100)

---

#### US-716: CSV column format — Year-on-Year tab

**CSV Columns for Year-on-Year tab:**

| Column Header | Description | Example |
|---------------|-------------|---------|
| Metric | Metric name | Total Income |
| Current Year ({year}) | Current year value | 7200000.00 |
| Prior Year ({year}) | Prior year value | 6400000.00 |
| Change (%) | Percentage change | +12.5 |

**Rows:**
1. Total Income
2. Total Expenses
3. Taxable Income
4. Gross Tax Liability
5. Net Tax Payable
6. Effective Tax Rate (%)
7. *(blank row)*
8. Monthly breakdown rows (Month | Current Year | Prior Year | Change %)

**Acceptance Criteria:**
- [ ] Summary metrics in first section, monthly breakdown in second section separated by blank row
- [ ] Change percentage formatted with + or − prefix
- [ ] Effective tax rate row shows percentage values, not currency

---

### 3.7 Export — PDF

#### US-717: Export report as PDF

**As a** user  
**I want** to export a formatted PDF report for the current tab  
**So that** I have a professional document for my accountant or personal records.

**Trigger:** User taps the "Export" button and selects "PDF".

**Flow:**
1. User taps floating "Export" button
2. Selects "Download as PDF"
3. Loading state: "Generating PDF…" with progress indicator
4. `reports.exportPdf` action called → calls NestJS PDF service (`POST /pdf/report`)
5. PDF generated and stored in Convex Storage
6. Download URL returned to client
7. On mobile: share sheet opens with PDF file
8. On web: PDF opens in new tab or downloads

**Acceptance Criteria:**
- [ ] PDF generated by NestJS service from structured report data JSON
- [ ] Loading state with spinner and "Generating PDF…" text
- [ ] On mobile: native share sheet with PDF file
- [ ] On web: file downloads or opens in new tab
- [ ] Filename: `taxease_{tab}_report_{startDate}_{endDate}.pdf`
- [ ] Success toast: "PDF exported successfully"
- [ ] Error handling: toast "PDF generation failed. Please try again." with retry
- [ ] PDF file size target: < 2 MB for a full year report

---

#### US-718: PDF layout structure

**As an** accountant or user reviewing the PDF  
**I want** a clean, professional layout with branding  
**So that** it looks credible and is easy to read.

**PDF Layout — All Tabs:**

**Page 1 — Cover / Header:**
- TaxEase Nigeria logo (top-left)
- Report title: "Income Report" / "Expenses Report" / "Year-on-Year Comparison"
- Entity name (e.g. "Amaka Okafor — Freelancer")
- Date range: "1 January 2026 – 31 December 2026"
- Generated date: "Report generated on 24 February 2026"

**Body — Income Report:**
- Summary table: Total Income | Foreign Income | Average Monthly Income
- Monthly income table: Month | Amount (₦)
- Category breakdown table: Category | Amount (₦) | % of Total
- Footer: "Generated by TaxEase Nigeria — www.taxease.ng"

**Body — Expenses Report:**
- Summary table: Total Expenses | Deductible | Non-Deductible
- Category breakdown table: Category | Amount (₦) | % of Total | Deductible
- Footer: same

**Body — Year-on-Year Report:**
- Side-by-side metrics table: Metric | Current Year | Prior Year | Change
- Monthly comparison table: Month | Current Year (₦) | Prior Year (₦)
- Footer: same

**Acceptance Criteria:**
- [ ] PDF uses A4 page size, portrait orientation
- [ ] Font: clean sans-serif (e.g. Inter, Helvetica); monospace for currency amounts
- [ ] Primary colour (#1A7F5E) used for headers and accent lines
- [ ] Tables use alternating row backgrounds for readability (white / neutral-100)
- [ ] Currency amounts right-aligned with ₦ prefix and thousands separators
- [ ] Page numbers in footer: "Page 1 of 2"
- [ ] Pagination: new page if content exceeds page height
- [ ] Entity name and date range on every page header

---

### 3.8 Export Progress & Sharing

#### US-719: Export progress and loading state

**As a** user  
**I want** to see progress while my export is being generated  
**So that** I know the app is working and can wait or cancel.

**Trigger:** User initiates any export (CSV or PDF).

**Flow:**
1. Export button shows loading state (spinner replaces icon)
2. Overlay or bottom sheet shows: "Generating [CSV/PDF]…"
3. Export button is disabled to prevent duplicate requests
4. On success: loading clears, success toast, file delivered
5. On timeout (> 30 seconds): loading clears, error toast with retry

**Acceptance Criteria:**
- [ ] Loading indicator visible during export generation
- [ ] Export button disabled during generation (prevents double-tap)
- [ ] Success toast on completion
- [ ] Error toast on failure with "Try Again" action
- [ ] Timeout after 30 seconds with user-friendly error message

---

#### US-720: Share exported file via native share sheet

**As a** mobile user  
**I want** to share my exported CSV or PDF via WhatsApp, email, or other apps  
**So that** I can easily send reports to my accountant.

**Trigger:** Export completes on mobile.

**Flow:**
1. Export completes; file saved to temporary location
2. Native share sheet opens automatically (iOS/Android)
3. User selects destination: WhatsApp, Email, Files, AirDrop, etc.
4. File shared; share sheet dismisses
5. If user cancels share sheet, file remains available (toast with "Open file" option)

**Acceptance Criteria:**
- [ ] Share sheet opens on mobile after successful export
- [ ] File has correct MIME type: `text/csv` for CSV, `application/pdf` for PDF
- [ ] Share sheet includes correct filename
- [ ] On web: browser download used instead of share sheet
- [ ] File remains accessible if share is cancelled

---

### 3.9 Empty States

#### US-721: Empty state — no data for selected period

**As a** user viewing reports for a period with no transactions  
**I want** to see a helpful empty state instead of blank charts  
**So that** I understand there's no data and know what to do.

**Trigger:** User selects a date range with no transactions.

**Flow:**
1. Summary cards show ₦0 for all figures
2. Chart area shows empty state illustration
3. Message: "No [income/expenses] found for this period"
4. Sub-message: "Try selecting a different date range or import transactions."
5. CTA button: "Import Transactions" (navigates to Import screen from PRD-1)

**Acceptance Criteria:**
- [ ] Empty state shown when zero transactions match the query
- [ ] Illustration centred in the chart area
- [ ] Message uses `neutral-500` text, `body` size
- [ ] CTA uses `primary` button style
- [ ] Summary cards show ₦0 (not hidden)
- [ ] Breakdown list shows "No categories to display"

---

#### US-722: Empty state — Year-on-Year with no prior year data

**As a** first-year user  
**I want** to see meaningful content even if I have no prior year data  
**So that** the Year-on-Year tab is still useful.

**Trigger:** User opens Year-on-Year tab; prior year has no `taxYearSummaries` record.

**Flow:**
1. Current year column shows metrics normally
2. Prior year column shows "—" for all values
3. Change column shows "N/A"
4. Line chart shows only the current year line
5. Message below chart: "Prior year data will appear once you have two years of records."

**Acceptance Criteria:**
- [ ] Current year metrics displayed normally
- [ ] Prior year values show "—" (em dash)
- [ ] Change percentage shows "N/A" instead of infinity/NaN
- [ ] Line chart renders single line for current year only
- [ ] Informational message displayed (not an error)

---

### 3.10 Loading States

#### US-723: Loading state — charts and data loading

**As a** user  
**I want** to see skeleton placeholders while report data loads  
**So that** the app feels responsive and I know data is coming.

**Trigger:** Reports screen loads or date range changes.

**Flow:**
1. Summary cards show animated skeleton rectangles (three cards)
2. Chart area shows skeleton rectangle matching chart dimensions
3. Breakdown list shows 5 skeleton rows
4. Data loads (typically < 2 seconds); skeletons replaced with real content

**Acceptance Criteria:**
- [ ] Skeleton placeholders use `neutral-100` background with shimmer animation
- [ ] Skeleton shapes match the final content dimensions
- [ ] Summary cards: three skeleton rectangles in horizontal row
- [ ] Chart area: single skeleton rectangle (chart height × full width)
- [ ] Breakdown list: 5 skeleton rows with circle (colour dot) + two text lines
- [ ] Transition from skeleton to content is smooth (fade-in)
- [ ] Loading state appears on initial load and on date range change

---

### 3.11 Error States

#### US-724: Error state — data fetch failure

**As a** user  
**I want** to see a clear error message if report data fails to load  
**So that** I can retry or report the issue.

**Trigger:** Report query fails (network error, server error).

**Flow:**
1. Summary cards and chart area replaced with error state
2. Illustration: warning/error icon
3. Message: "Unable to load report data"
4. Sub-message: "Check your connection and try again."
5. "Retry" button that re-triggers the query

**Acceptance Criteria:**
- [ ] Error state replaces content area (not overlaid)
- [ ] Error icon uses `danger` (#E53E3E)
- [ ] "Retry" button uses `primary` style
- [ ] Retry re-executes the failed query
- [ ] If retry succeeds, content renders normally
- [ ] Network-specific message: "No internet connection" if offline

---

#### US-725: Error state — export failure

**As a** user  
**I want** to know if my export failed and be able to retry  
**So that** I can still get my report.

**Trigger:** CSV or PDF export action fails.

**Flow:**
1. Loading state clears
2. Error toast: "Export failed. Please try again."
3. Toast includes "Try Again" action button
4. Tapping "Try Again" re-triggers the export

**Acceptance Criteria:**
- [ ] Error toast uses `danger` colour
- [ ] "Try Again" action on toast re-triggers export with same parameters
- [ ] Toast auto-dismisses after 5 seconds if no action
- [ ] If PDF service is unavailable, specific message: "PDF service temporarily unavailable"

---

### 3.12 Chart Interactions

#### US-726: Tap bar/segment/point for detail tooltip

**As a** user  
**I want** to tap on chart elements to see exact values  
**So that** I can get precise figures without reading axis labels.

**Trigger:** User taps on a bar (Income), doughnut segment (Expenses), or line point (YoY).

**Flow:**
1. User taps a chart element
2. Tooltip/popover appears near the tapped element
3. Tooltip shows: label (e.g. "Feb 2026"), value (e.g. "₦450,000")
4. Tapping elsewhere dismisses the tooltip
5. Tapping another element moves the tooltip

**Acceptance Criteria:**
- [ ] Bar chart tooltip: "{Month} {Year}: ₦{amount}"
- [ ] Doughnut tooltip: "{Category}: ₦{amount} ({percentage}%)"
- [ ] Line chart tooltip: "{Month} {Year}: ₦{amount}" with year-specific colour dot
- [ ] Tooltip has `white` background with shadow, `neutral-900` text
- [ ] Tooltip positioned above/beside the element (not clipped by screen edge)
- [ ] Only one tooltip visible at a time
- [ ] Tooltip accessible (screen readers announce the content)

---

### 3.13 Entity Context

#### US-727: Reports scoped to active entity

**As a** user with multiple entities  
**I want** reports to show data only for my currently selected entity  
**So that** I don't accidentally mix business and personal finances.

**Trigger:** User switches entity in the side drawer, then opens Reports.

**Flow:**
1. User switches from "Amaka Freelance" to "Amaka Consulting LLC" in the drawer
2. User navigates to Reports
3. All report data (queries, exports) use the new entity ID
4. Summary figures, charts, and breakdowns reflect the LLC's data

**Acceptance Criteria:**
- [ ] All report queries include `entityId` from the global entity context
- [ ] Switching entities while on the Reports screen triggers a full data refresh
- [ ] Entity name displayed in a subtle header or breadcrumb (e.g. "Reports — Amaka Consulting LLC")
- [ ] Exports include entity name in the filename and PDF header
- [ ] No cross-entity data leakage

---

## 4. UI Specifications

### 4.1 Design Tokens

| Token | Value | Usage in Reports |
|-------|-------|------------------|
| primary | `#1A7F5E` | Active tab underline, bar chart fill, current year line, Export button, CTAs |
| primary-light | `#E8F5F0` | Highlighted summary cards on hover/press |
| accent | `#2B6CB0` | Prior year line colour, links |
| success | `#38A169` | Income indicators, positive change arrows, deductible badge |
| warning | `#D69E2E` | Uncategorised category colour, alerts |
| danger | `#E53E3E` | Negative change arrows, error states, non-deductible indicator |
| neutral-900 | `#1A202C` | Body text, amounts, chart labels |
| neutral-500 | `#718096` | Axis labels, secondary text, inactive tabs |
| neutral-100 | `#F7FAFC` | Page background, chart background |
| white | `#FFFFFF` | Card surfaces, tooltip background |

### 4.2 Typography in Reports

| Element | Style | Size | Weight |
|---------|-------|------|--------|
| Screen title ("Reports") | heading-xl | 28px | Bold |
| Tab labels | heading-md | 18px | SemiBold (active) / Regular (inactive) |
| Summary card labels | label | 12px | Medium |
| Summary card values | mono | 15px | Monospace |
| Large summary value (total) | heading-lg | 22px | SemiBold |
| Chart axis labels | body-sm | 13px | Regular |
| Chart tooltip text | body-sm | 13px | Regular |
| Breakdown list — category name | body | 15px | Regular |
| Breakdown list — amount | mono | 15px | Monospace |
| Breakdown list — percentage | label | 12px | Medium |
| Section headers | heading-md | 18px | SemiBold |
| Empty state message | body | 15px | Regular |
| Empty state CTA | body | 15px | SemiBold |

### 4.3 Screen Layout — Reports

**Header:**
- Left: Hamburger icon (drawer toggle)
- Centre: "Reports"
- Right: Floating "Export" button (icon: share/download icon)

**Tab Bar (below header):**
- Horizontally arranged: Income | Expenses | Year-on-Year
- Active tab: primary underline (3px), bold text
- Height: 48px

**Date Range Selector (below tab bar, hidden on Year-on-Year):**
- Segmented control: "This Year" | "Last Year" | "Custom"
- When custom is active, a secondary line below shows "1 Jan 2026 – 28 Feb 2026"

**Content Area (scrollable):**
- Summary cards row (3 cards, horizontal scroll on mobile)
- Chart area (responsive height: min 220px, max 320px)
- Breakdown list (full-width, unbounded)

**Floating Export Button:**
- Fixed bottom-right position (mobile) or header-right (web)
- Circular FAB on mobile: 56px diameter, `primary` background, white download icon
- On tap: bottom sheet with "Download as CSV" and "Download as PDF" options

### 4.4 Platform Behaviour

| Behaviour | Mobile | Web |
|-----------|--------|-----|
| Tab bar | Horizontally scrollable if needed | Fixed, full-width |
| Summary cards | Horizontal scroll row | Grid row (3 columns) |
| Charts | Full-width, touch-interactive | Full-width, hover + click interactive |
| Export delivery | Native share sheet | Browser download |
| Date picker | Native date picker modal | Calendar dropdown |
| Floating Export button | FAB bottom-right | Button in header |

### 4.5 Chart Specifications Summary

| Tab | Chart Type | Primary Colour | Secondary Colour | X-Axis | Y-Axis | Interaction |
|-----|-----------|----------------|------------------|--------|--------|-------------|
| Income | Vertical Bar | `#1A7F5E` (primary) | — | Month labels (Jan–Dec) | ₦ amount (auto-scaled, K/M suffix) | Tap bar → tooltip |
| Expenses | Doughnut | Per-category colours (see US-707) | — | — | — | Tap segment → pull-out + tooltip |
| Year-on-Year | Dual Line | `#1A7F5E` (current, solid) | `#2B6CB0` (prior, dashed) | Month labels (Jan–Dec) | ₦ amount (auto-scaled, K/M suffix) | Tap point → tooltip |

---

## 5. Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-001 | The system shall display a Reports screen with three tabs: Income, Expenses, Year-on-Year | P0 |
| FR-002 | The system shall scope all report data to the active entity (entityId from global context) | P0 |
| FR-003 | The system shall provide a date range selector with three options: This Year, Last Year, Custom | P0 |
| FR-004 | The system shall support custom date range selection with start and end date pickers | P0 |
| FR-005 | The system shall validate custom date ranges: start ≤ end, max range 5 years | P0 |
| FR-006 | The Income tab shall display: Total Income, Foreign Income, Average Monthly Income | P0 |
| FR-007 | The Income tab shall render a vertical bar chart of monthly income for the selected period | P0 |
| FR-008 | The Income tab shall display a breakdown list of income by category, sorted by amount descending | P0 |
| FR-009 | The Expenses tab shall display: Total Expenses, Deductible Expenses, Non-Deductible Expenses | P0 |
| FR-010 | The Expenses tab shall render a doughnut chart of expense distribution by category | P0 |
| FR-011 | The Expenses tab shall display a category list with amounts, percentages, and deductible status | P0 |
| FR-012 | The Year-on-Year tab shall display side-by-side metrics for current year vs prior year | P0 |
| FR-013 | The Year-on-Year tab shall render a dual-line chart overlaying both years' monthly income | P0 |
| FR-014 | The Year-on-Year tab shall compute and display percentage change for each metric | P0 |
| FR-015 | The system shall compute income figures by querying `transactions` where type = "income" for the entity and date range | P0 |
| FR-016 | The system shall compute expense figures by querying `transactions` where type ∈ ["business_expense", "personal_expense"] for the entity and date range | P0 |
| FR-017 | The system shall compute Year-on-Year metrics from `taxYearSummaries` for both years | P0 |
| FR-018 | The system shall support CSV export of transaction data for any tab and date range | P0 |
| FR-019 | The system shall support PDF export via the NestJS PDF service for any tab and date range | P0 |
| FR-020 | CSV files shall use UTF-8 encoding with BOM, ISO 8601 dates, and 2-decimal amounts | P0 |
| FR-021 | PDF reports shall include: TaxEase branding, entity name, date range, summary tables, page numbers | P0 |
| FR-022 | The system shall display loading skeletons while report data is being fetched | P0 |
| FR-023 | The system shall display empty states when no data exists for the selected period | P0 |
| FR-024 | The system shall display error states with retry capability on data fetch failure | P0 |
| FR-025 | The system shall display error toasts with retry on export failure | P0 |
| FR-026 | Charts shall support tap/click interaction with tooltips showing exact values | P1 |
| FR-027 | The Expenses doughnut chart shall group categories < 3% of total into "Other" | P1 |
| FR-028 | The system shall open the native share sheet on mobile after successful export | P1 |
| FR-029 | The system shall persist date range selection across tab switches within a session | P1 |
| FR-030 | The system shall display entity name in the Reports header for multi-entity users | P1 |

---

## 6. API Requirements (Convex Functions)

### 6.1 Report Queries

| Function | Type | Description |
|----------|------|-------------|
| `reports.getIncome` | Query | Returns `IncomeReport` for the given entity and date range. Aggregates from `transactions` where type = "income". Computes monthly breakdown, category breakdown, summary figures. |
| `reports.getExpenses` | Query | Returns `ExpenseReport` for the given entity and date range. Aggregates from `transactions` where type ∈ ["business_expense", "personal_expense"]. Computes category breakdown with deductible amounts, monthly breakdown. |
| `reports.getYearOnYear` | Query | Returns `YearOnYearReport` for the given entity. Reads `taxYearSummaries` for current and prior year. Computes monthly breakdown from `transactions` for both years. Calculates percentage changes. |

### 6.2 Export Actions

| Function | Type | Description |
|----------|------|-------------|
| `reports.exportCsv` | Action | Generates CSV string from transaction data for the specified tab, entity, and date range. Returns `CsvExportResult` with CSV content, filename, and row count. |
| `reports.exportPdf` | Action | Calls NestJS PDF service (`POST /pdf/report`) with structured report data JSON. Stores returned PDF in Convex Storage. Returns `PdfExportResult` with storageId, URL, and filename. |

### 6.3 reports.getIncome Contract

**Args:**
```typescript
{
  entityId: Id<"entities">;
  startDate: number;   // Unix ms
  endDate: number;     // Unix ms
}
```

**Returns:**
```typescript
IncomeReport
```

**Behaviour:**
1. Validate user owns entity (`ctx.auth` check)
2. Query `transactions` with index `by_entityId_date` where entityId matches AND date is within range AND type = "income"
3. Compute `totalIncome` = sum of `amountNgn`
4. Compute `foreignIncome` = sum of `amountNgn` where currency ≠ "NGN"
5. Compute `averageMonthlyIncome` = totalIncome ÷ distinct months in range
6. Group transactions by month → `monthlyBreakdown[]`
7. Group transactions by categoryId → join `categories` for names/colours → `categoryBreakdown[]`
8. Compute percentages: `(categoryAmount / totalIncome × 100)`
9. Return `IncomeReport`

### 6.4 reports.getExpenses Contract

**Args:**
```typescript
{
  entityId: Id<"entities">;
  startDate: number;
  endDate: number;
}
```

**Returns:**
```typescript
ExpenseReport
```

**Behaviour:**
1. Validate user owns entity
2. Query `transactions` where entityId matches AND date in range AND type ∈ ["business_expense", "personal_expense"]
3. Compute `totalExpenses` = sum of `amountNgn`
4. Compute `deductibleExpenses` = sum of `amountNgn × (deductiblePercent / 100)` where `isDeductible = true`
5. Compute `nonDeductibleExpenses` = totalExpenses − deductibleExpenses
6. Group by categoryId → `categoryBreakdown[]` with amounts and percentages
7. Group by month → `monthlyBreakdown[]`
8. Return `ExpenseReport`

### 6.5 reports.getYearOnYear Contract

**Args:**
```typescript
{
  entityId: Id<"entities">;
  currentTaxYear: number;   // e.g. 2026
}
```

**Returns:**
```typescript
YearOnYearReport
```

**Behaviour:**
1. Validate user owns entity
2. Read `taxYearSummaries` for entityId + currentTaxYear → `currentYear` metrics
3. Read `taxYearSummaries` for entityId + (currentTaxYear − 1) → `priorYear` metrics
4. If no summary exists for a year: return null metrics for that year
5. Query `transactions` for current year (type = "income") → group by month → `currentYearMonthly[]`
6. Query `transactions` for prior year (type = "income") → group by month → `priorYearMonthly[]`
7. Compute percentage changes: `((current - prior) / prior × 100)` for income, expenses, tax liability; handle division by zero → "N/A"
8. Return `YearOnYearReport`

### 6.6 reports.exportCsv Contract

**Args:**
```typescript
{
  entityId: Id<"entities">;
  tab: "income" | "expenses" | "year_on_year";
  startDate: number;
  endDate: number;
}
```

**Returns:**
```typescript
CsvExportResult
```

**Behaviour:**
1. Validate user owns entity
2. If tab = "income": query income transactions; build CSV with income columns
3. If tab = "expenses": query expense transactions; build CSV with expense columns
4. If tab = "year_on_year": build summary + monthly comparison CSV from taxYearSummaries + transactions
5. Join `categories` for category names; join `connectedAccounts` for source account names
6. Format: UTF-8 with BOM, header row, ISO 8601 dates, 2-decimal amounts
7. Generate filename: `taxease_{tab}_{YYYY-MM-DD}_{YYYY-MM-DD}.csv`
8. Return `{ csv, filename, rowCount }`

### 6.7 reports.exportPdf Contract

**Args:**
```typescript
{
  entityId: Id<"entities">;
  tab: "income" | "expenses" | "year_on_year";
  startDate: number;
  endDate: number;
}
```

**Returns:**
```typescript
PdfExportResult
```

**Behaviour:**
1. Validate user owns entity
2. Build report data payload (same aggregations as the respective getIncome/getExpenses/getYearOnYear query)
3. Fetch entity name from `entities` table
4. Construct JSON payload for PDF service:
   ```json
   {
     "reportType": "income",
     "entityName": "Amaka Okafor — Freelancer",
     "dateRange": { "start": "2026-01-01", "end": "2026-12-31" },
     "generatedAt": "2026-02-24T14:30:00Z",
     "summary": { ... },
     "monthlyBreakdown": [ ... ],
     "categoryBreakdown": [ ... ]
   }
   ```
5. POST to NestJS PDF service: `POST {PDF_SERVICE_URL}/pdf/report`
6. Receive PDF buffer; store in Convex Storage via `ctx.storage.store()`
7. Generate temporary download URL
8. Return `{ storageId, url, filename }`

### 6.8 NestJS PDF Service Endpoint

**Endpoint:** `POST /pdf/report`  
**Content-Type:** `application/json`  
**Response:** `application/pdf` (binary)

**Request Body Schema:**
```typescript
{
  reportType: "income" | "expenses" | "year_on_year";
  entityName: string;
  dateRange: {
    start: string;    // ISO 8601 date
    end: string;
  };
  generatedAt: string;  // ISO 8601 datetime
  summary: Record<string, number | string>;
  monthlyBreakdown?: Array<{ month: string; amount: number }>;
  categoryBreakdown?: Array<{
    category: string;
    amount: number;
    percentage: number;
    isDeductible?: boolean;
  }>;
  yearOnYear?: {
    currentYear: Record<string, number>;
    priorYear: Record<string, number>;
    changes: Record<string, number | string>;
  };
}
```

**Response:** Raw PDF bytes with `Content-Type: application/pdf`

---

## 7. Data Models

### 7.1 Tables Read (No New Tables)

PRD-7 introduces **no new database tables**. All report data is derived at query time from existing tables:

| Table | PRD Source | What Reports Reads |
|-------|-----------|-------------------|
| `transactions` | PRD-1 | Income and expense data: amountNgn, type, categoryId, currency, date, isDeductible, deductiblePercent, whtDeducted, description, notes, connectedAccountId |
| `taxYearSummaries` | PRD-3 | Year-on-Year metrics: totalGrossIncome, totalBusinessExpenses, taxableIncome, grossTaxLiability, netTaxPayable, effectiveTaxRate, isNilReturn |
| `categories` | PRD-0 | Category names, colours, icons, isDeductibleDefault |
| `entities` | PRD-0 | Entity name, type (for PDF header and entity scoping) |
| `connectedAccounts` | PRD-0/1 | Account names for CSV export "Source Account" column |

### 7.2 Indexes Used

| Table | Index | Used By |
|-------|-------|---------|
| `transactions` | `by_entityId_date` | All income/expense queries — filter by entityId + date range |
| `transactions` | `by_entityId_taxYear` | Year-on-Year monthly breakdown queries |
| `taxYearSummaries` | `by_entityId_taxYear` | Year-on-Year summary metrics |
| `categories` | (primary key) | Join for category names in breakdowns and exports |
| `connectedAccounts` | (primary key) | Join for account names in CSV export |

### 7.3 Key Fields from transactions

```typescript
// Fields consumed by reports queries
{
  entityId:          Id<"entities">;     // Entity scoping
  date:              number;              // Date filtering and monthly grouping
  amountNgn:         number;              // Primary amount for all aggregations
  currency:          string;              // Foreign income detection (≠ "NGN")
  type:              TransactionType;     // Income vs expense filtering
  categoryId?:       Id<"categories">;    // Category grouping
  isDeductible:      boolean;             // Deductible expense computation
  deductiblePercent: number;              // Partial deduction support
  whtDeducted?:      number;              // WHT column in CSV
  description:       string;              // CSV export
  notes?:            string;              // CSV export
  connectedAccountId?: Id<"connectedAccounts">; // Source account for CSV
  taxYear:           number;              // Year-on-Year monthly queries
}
```

### 7.4 Key Fields from taxYearSummaries

```typescript
// Fields consumed by Year-on-Year report
{
  entityId:               Id<"entities">;
  taxYear:                number;
  totalGrossIncome:       number;
  totalBusinessExpenses:  number;
  taxableIncome:          number;
  grossTaxLiability:      number;
  netTaxPayable:          number;
  effectiveTaxRate:       number;
  isNilReturn:            boolean;
}
```

---

## 8. Non-Goals

The following are **explicitly out of scope** for PRD-7:

| Item | Reason | Covered By |
|------|--------|------------|
| **Dashboard widgets** | Summary cards on the Dashboard are a different module | PRD-5 |
| **Invoice reports** | Invoice analytics and ageing reports | PRD-4 |
| **Filing-specific reports** | Self-assessment form generation, filing PDF | PRD-6 |
| **Scheduled report emails** | Automated weekly/monthly email reports | Future |
| **Report templates** | User-customisable report layouts | Future |
| **Cross-entity reports** | Aggregated reports across all user entities | Future |
| **Real-time charts on Dashboard** | Mini charts / sparklines on the main dashboard | PRD-5 |
| **Bank statement re-export** | Re-downloading original imported files | N/A |
| **Printing** | Direct print support (users can print from PDF) | N/A |
| **Chart animations** | Advanced chart entry/transition animations | P2 enhancement |
| **Drill-down from chart to transactions** | Tap bar → see transactions for that month | Future enhancement |
| **Report annotations** | User comments or highlights on report data | Future |
| **Comparison against budget** | Budget vs actual analytics | Future |

---

## 9. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Report screen visits** | ≥ 30% of active users visit Reports at least once per month | Analytics event on Reports screen mount |
| **Tab engagement** | All three tabs used by ≥ 50% of Reports visitors | Analytics event on tab switch |
| **Export adoption** | ≥ 20% of Reports visitors export at least one file per month | reports.exportCsv / reports.exportPdf call count |
| **CSV vs PDF split** | Track ratio to inform future investment | Export format parameter in analytics |
| **Export success rate** | ≥ 95% of initiated exports complete successfully | Export action success / total initiated |
| **PDF generation time** | P95 < 5 seconds | NestJS PDF service response time |
| **CSV generation time** | P95 < 2 seconds | Convex action duration |
| **Report data load time** | P95 < 3 seconds for a full-year report | Query duration from Convex |
| **Empty state to action** | ≥ 40% of users who see empty state tap "Import Transactions" | Analytics event on CTA tap |
| **User satisfaction** | "Reports are useful" ≥ 80% agree in quarterly survey | In-app survey |

---

## 10. Open Questions

| # | Question | Owner |
|---|----------|-------|
| 1 | **Chart library:** `react-native-chart-kit` vs `victory-native` vs `react-native-skia` with custom charts? Need spike for performance, bundle size, and doughnut chart support. | Engineering |
| 2 | **PDF service hosting:** NestJS PDF service — deploy as separate Cloud Run instance, or as a serverless function? Affects cold start latency for PDF generation. | Engineering / DevOps |
| 3 | **PDF library:** Use `puppeteer` (HTML-to-PDF), `pdfkit`, or `@react-pdf/renderer` in the NestJS service? Trade-off: HTML templates (easier design) vs programmatic (smaller bundle). | Engineering |
| 4 | **Chart in PDF:** Should the PDF include chart images, or only tables? Including charts requires server-side chart rendering (e.g. `chartjs-node-canvas`). Tables-only is simpler and faster. | Product / Design |
| 5 | **Export file storage:** Should exported CSVs also be stored in Convex Storage for "Download history" feature, or generated on-the-fly every time? PDFs are stored; CSVs could be ephemeral. | Product |
| 6 | **Date range vs tax year:** Should the Year-on-Year tab allow custom year selection (e.g. 2024 vs 2023) instead of always current vs prior? | Product |
| 7 | **Large dataset performance:** For users with 10,000+ transactions in a year, will report queries be fast enough? May need server-side aggregation or incremental caching. | Engineering |
| 8 | **Offline support:** Should reports be cached for offline viewing? Or require network to always generate fresh data? | Product |
| 9 | **Accessibility:** What level of chart accessibility is required? Screen reader descriptions, alternative data tables, high-contrast mode? | Product / Design |
| 10 | **Export file size limit:** Maximum CSV/PDF file size before we warn or paginate? Suggested: 10 MB. | Engineering |

---

*End of PRD-7 — Reports & Export*
