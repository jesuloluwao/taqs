# PRD-3: Tax Calculation Engine

**TaxEase Nigeria**  
**Version:** 1.0 — February 2026  
**Status:** Draft  
**Depends On:** PRD-0 (Auth, Entity Setup), PRD-1 (Transaction Management)  
**Critical Path:** PRD-0 → PRD-1 → **PRD-3** → PRD-6 (Filing)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Entities](#2-entities)
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

### 1.1 What the Tax Calculation Engine Does

The Tax Calculation Engine is the **core intellectual property** of TaxEase Nigeria. It takes a user's categorised financial transactions, declared reliefs, and entity metadata for a given tax year and produces a complete, NTA 2025-compliant tax computation. The engine:

1. **Classifies and aggregates income** — Sums taxable income from all sources (freelance, foreign, rental, digital assets) after FX conversion
2. **Deducts allowable business expenses** — Applies NTA-compliant expense deductions with split-transaction support
3. **Applies personal reliefs** — Rent relief (20%, cap ₦500k), pension, NHIS, NHF, life insurance, mortgage interest
4. **Computes PIT** — Applies the six-band progressive system (0% to 25%) with band-by-band transparency
5. **Credits WHT** — Offsets withholding tax already deducted by clients against final liability
6. **Handles CIT** — Computes company income tax for LLCs (or flags small company exemption)
7. **Computes CGT** — Capital gains for asset disposals (progressive for individuals, 30% for LLCs)
8. **Computes VAT** — Output VAT minus input VAT for VAT-registered entities
9. **Determines nil return status** — Flags when filing is required but no tax is owed

### 1.2 Why Accuracy Is Critical

- **Legal compliance:** Incorrect calculations expose users to penalties, interest, and audit risk
- **Trust:** Users rely on TaxEase to file confidently; errors undermine the product value proposition
- **Audit defensibility:** Every figure must be traceable to NTA 2025 provisions and verifiable
- **Regulatory sensitivity:** The NTA 2025 is new; thresholds and rates may be clarified by FIRS/NRS — the engine must be updatable without app-wide releases
- **Penalty avoidance:** Late filing (₦100k + ₦50k/month) and late payment (10% + MPR interest) make accuracy essential so users pay the correct amount on time

### 1.3 Scope

| Tax Type | Applicable To | Engine Coverage |
|----------|---------------|-----------------|
| Personal Income Tax (PIT) | Individuals, freelancers, business name owners | Full computation |
| Company Income Tax (CIT) | LLCs above small company threshold | Full computation + exemption check |
| Withholding Tax (WHT) Credits | All entities | Full aggregation and offset |
| Capital Gains Tax (CGT) | Any entity with capital disposals | Full computation |
| Value Added Tax (VAT) | VAT-registered entities | Full computation |
| Nil Returns | All residents | Detection and flagging |
| Penalties | Reference only | Calculator for reminders |

### 1.4 Out of Scope (v1)

- Stamp Duty, Business Premises Levy
- PAYE computation for employers with staff
- State-specific levies
- Double Taxation Agreement (DTA) credit auto-computation (flagged only)
- Loss carry-forward

---

## 2. Entities

### 2.1 Core TypeScript Interfaces

```typescript
// convex/tax/types.ts

export type EntityType = "individual" | "business_name" | "llc";

export type TaxEngineInput = {
  entityId:         string;
  entityType:       EntityType;
  taxYear:          number;
  transactions:     TransactionForEngine[];
  capitalDisposals: CapitalDisposal[];
  declarations:    TaxDeclarations;
  vatRegistered:    boolean;
  annualTurnover?:  number;
  grossFixedAssets?: number;
};

export type TransactionForEngine = {
  _id:               string;
  type:              "income" | "business_expense" | "personal_expense" | "transfer";
  amountNgn:         number;
  direction:         "credit" | "debit";
  isDeductible:      boolean;
  deductiblePercent: number;
  whtDeducted:       number;
  whtRate?:          number;
  isVatInclusive:    boolean;
  isCapitalGain:     boolean;
  currency?:         string;
  fxRate?:           number;
};

export type TaxDeclarations = {
  annualRentPaid:         number;
  pensionContributions:   number;
  nhisContributions:     number;
  nhfContributions:      number;
  lifeInsurancePremiums:  number;
  mortgageInterest:      number;
};

export type CapitalDisposal = {
  assetDescription:   string;
  acquisitionCostNgn: number;
  disposalProceedsNgn: number;
  acquisitionDate:    number;
  disposalDate:       number;
  isExempt:           boolean;
  exemptionReason?:   string;
};
```

### 2.2 Band Structures

```typescript
export type TaxBandDefinition = {
  bandNumber:  number;
  lowerBound:  number;
  upperBound:  number | null;  // null = unlimited
  rate:        number;         // 0–1
  maxTaxInBand: number;
};

export type TaxBandResult = {
  bandNumber:   number;
  lowerBound:   number;
  upperBound:   number | null;
  rate:         number;
  incomeInBand: number;
  taxInBand:    number;
};

// NTA 2025 bands (verify against official gazette)
export const PIT_BANDS: TaxBandDefinition[] = [
  { bandNumber: 1, lowerBound: 0,          upperBound: 800_000,    rate: 0.00, maxTaxInBand: 0 },
  { bandNumber: 2, lowerBound: 800_001,    upperBound: 2_200_000,  rate: 0.15, maxTaxInBand: 210_000 },
  { bandNumber: 3, lowerBound: 2_200_001,  upperBound: 4_200_000,  rate: 0.18, maxTaxInBand: 360_000 },
  { bandNumber: 4, lowerBound: 4_200_001,  upperBound: 6_200_000,  rate: 0.21, maxTaxInBand: 420_000 },
  { bandNumber: 5, lowerBound: 6_200_001,  upperBound: 56_200_000, rate: 0.23, maxTaxInBand: 11_500_000 },
  { bandNumber: 6, lowerBound: 56_200_001, upperBound: null,       rate: 0.25, maxTaxInBand: Number.POSITIVE_INFINITY },
];
```

### 2.3 Relief Structures

```typescript
export type ReliefBreakdown = {
  rentRelief:           number;
  pensionRelief:        number;
  nhisRelief:           number;
  nhfRelief:            number;
  lifeInsuranceRelief:  number;
  mortgageInterestRelief: number;
  totalReliefs:         number;
};

export const RENT_RELIEF_CAP = 500_000;
export const RENT_RELIEF_PERCENT = 0.20;
```

### 2.4 TaxYearSummary (Cached Output)

```typescript
export type TaxYearSummary = {
  _id:                    Id<"taxYearSummaries">;
  entityId:               Id<"entities">;
  taxYear:                number;
  engineVersion:          string;
  totalGrossIncome:       number;
  totalBusinessExpenses:  number;
  totalRentRelief:        number;
  totalPensionContributions: number;
  totalOtherReliefs:      number;
  taxableIncome:          number;
  grossTaxLiability:      number;
  minimumTax:             number;
  grossTaxAfterMinimum:   number;
  whtCredits:             number;
  netTaxPayable:          number;
  effectiveTaxRate:       number;
  isNilReturn:            boolean;
  vatOutputTax?:          number;
  vatInputTax?:           number;
  netVatPayable?:         number;
  isSmallCompanyExempt?:   boolean;
  citAmount?:             number;
  developmentLevy?:       number;
  uncategorisedCount:     number;
  fxRateApproximated:     boolean;
  computedAt:             number;
  bandBreakdown:          TaxBandResult[];
};
```

### 2.5 TaxEngineOutput (Full Live Result)

```typescript
export type PitResult = {
  grossIncome:           number;
  totalBusinessExpenses: number;
  assessableProfit:      number;
  reliefBreakdown:       ReliefBreakdown;
  taxableIncome:         number;
  bands:                 TaxBandResult[];
  grossTaxLiability:     number;
  minimumTax:            number;
  grossTaxAfterMinimum:  number;
  whtCredits:            number;
  dtaCreditFlagged:      boolean;
  netTaxPayable:         number;
  effectiveTaxRate:      number;
  isNilReturn:           boolean;
};

export type CitResult = {
  isSmallCompanyExempt: boolean;
  assessableProfit:     number;
  cit:                  number;
  developmentLevy:      number;
  totalCit:             number;
};

export type CgtResult = {
  totalGains:   number;
  exemptGains:  number;
  taxableGains: number;
  taxOnGains:   number;
};

export type VatResult = {
  outputVat:     number;
  inputVat:      number;
  netVatPayable: number;
  isRefundClaim: boolean;
};

export type TaxEngineOutput = {
  entityId:        string;
  taxYear:          number;
  engineVersion:    string;
  computedAt:       number;
  pit?:             PitResult;
  cit?:             CitResult;
  cgt?:             CgtResult;
  vat?:             VatResult;
  totalTaxPayable:  number;
  uncategorisedCount: number;
  fxRateApproximated: boolean;
};
```

---

## 3. User Stories

### 3.1 Tax Summary Viewing

| ID | Story | Acceptance Criteria |
|----|-------|---------------------|
| US-301 | As a freelancer, I want to view my estimated tax liability for the current tax year so that I know how much I may owe. | Tax Summary displays net tax payable; updates reactively when transactions change. |
| US-302 | As a freelancer, I want to see the tax year I'm viewing so that I can check prior years. | Tax year selector (dropdown) with years 2026, 2025, etc.; current year default. |
| US-303 | As an SME owner, I want to see both PIT/CIT and VAT in one place so that I understand my total tax position. | SME-specific section shows CIT status (exempt or computed) and VAT net payable. |
| US-304 | As a user with multiple entities, I want to see the tax summary for the selected entity so that I don't mix entities. | Summary reflects entity selector in drawer; each entity has independent calculation. |

### 3.2 Income Breakdown

| ID | Story | Acceptance Criteria |
|----|-------|---------------------|
| US-305 | As a user, I want to see my gross income broken down by source so that I can verify it's correct. | Income Breakdown section lists: Freelance/Client, Foreign (converted), Investment, Rental, Digital Asset, Other; each with amount. |
| US-306 | As a user with foreign income, I want to see the naira equivalent and FX rate used so that I trust the conversion. | Foreign income shows original amount + currency; naira equivalent; "Converted at ₦X,XXX/USD on [date]" tooltip or footnote. |
| US-307 | As a user, I want to know if any income was excluded so that I can fix misclassifications. | Non-taxable inflows (gifts, loans, transfers) excluded; count or note if relevant. |

### 3.3 Deductions & Reliefs

| ID | Story | Acceptance Criteria |
|----|-------|---------------------|
| US-308 | As a user, I want to see total business expenses and how they reduce my tax so that I understand my deductions. | Deductions section shows total business expenses; breakdown by category if expandable. |
| US-309 | As a user, I want to see my personal reliefs (rent, pension, etc.) with their caps so that I know I'm getting the right amount. | Rent relief shows "20% of rent, max ₦500k"; pension, NHIS, NHF, life insurance, mortgage interest listed with amounts. |
| US-310 | As a user, I want to declare my annual rent and other reliefs so that they are included in the calculation. | Declaration form/settings accessible; values saved and used in next engine run. |
| US-310a | As a user preparing my first tax filing, I want to enter my tax reliefs (rent, pension, NHIS, NHF, etc.) so that they are included in the tax computation. | "Declare reliefs" link/button (Tax Summary or Filing Checklist) opens declaration form. Fields: annual rent paid, pension, NHIS, NHF, life insurance, mortgage interest. Required: at least annual rent (can be 0). Save creates/updates taxDeclarations record. Empty state on form: "Enter your relief amounts to reduce your taxable income." |

### 3.4 PIT Band Breakdown & Visualization

| ID | Story | Acceptance Criteria |
|----|-------|---------------------|
| US-311 | As a user, I want to see how my taxable income is split across the six PIT bands so that I understand the progressive system. | Band table: Band | Range | Rate | Income in Band | Tax; all six bands shown. |
| US-312 | As a user, I want a visual representation of the band breakdown so that it's easy to digest. | Horizontal bar chart or stacked bar showing income distribution across bands with colour coding. |
| US-313 | As a user, I want to see the effective tax rate so that I can compare to others or prior years. | "Effective Rate: X.X%" displayed prominently. |

### 3.5 WHT & Credits

| ID | Story | Acceptance Criteria |
|----|-------|---------------------|
| US-314 | As a freelancer whose clients withheld tax, I want to see my WHT credits so that I know they're being applied. | WHT Credits section shows total; listed as negative (credit) against gross tax. |
| US-315 | As a user, I want to see my net tax payable after credits so that I know the final amount to pay. | Net Tax Payable = max(gross tax - WHT, 0); displayed as primary figure. |

### 3.6 Minimum Tax & Edge Cases

| ID | Story | Acceptance Criteria |
|----|-------|---------------------|
| US-316 | As a user with high income but large deductions, I want to know if minimum tax applies so that I'm not surprised. | If minimum tax applies: gross tax is replaced by max(progressive tax, minimum tax); minimum tax amount and reason shown. |
| US-317 | As a user below the threshold, I want to know I must still file a nil return so that I avoid late-filing penalties. | "Nil return required — filing mandatory by March 31" message when net tax = 0. |

### 3.7 Tax Year & Refresh

| ID | Story | Acceptance Criteria |
|----|-------|---------------------|
| US-318 | As a user, I want to switch between tax years so that I can review past summaries. | Tax year dropdown; data loads for selected year. |
| US-319 | As a user who just imported transactions, I want to refresh/recalculate so that my summary is up to date. | "Refresh" or auto-refresh; tax.getSummary is reactive (no manual refresh needed for live query path). |
| US-320 | As a user, I want to see when the summary was last computed so that I know it's current. | "Updated just now" or timestamp (e.g. "Computed at 14:32") |

### 3.8 FX, Digital Assets, CGT, CIT

| ID | Story | Acceptance Criteria |
|----|-------|---------------------|
| US-321 | As a user with foreign income, I want to see FX conversion details so that I can verify the amounts. | Expandable "FX Details" showing: transaction date, original amount, currency, CBN rate used, naira equivalent. |
| US-322 | As a user who sold crypto, I want my digital asset gains included correctly so that I'm compliant. | Digital asset disposals (manual entry) produce gains added to taxable income; prompt if likely crypto activity detected. |
| US-323 | As a user who disposed of a capital asset, I want CGT computed correctly so that I pay the right amount. | CGT section shows gain, exemption (if any), tax on gains; added to PIT for individuals. |
| US-324 | As an LLC owner, I want to know if my company qualifies for the small company exemption so that I don't overpay. | "Your company qualifies for the small company exemption" or CIT calculation with 30% + 4% dev levy. |
| US-325 | As a VAT-registered SME, I want to see output VAT, input VAT, and net VAT so that I can file monthly returns. | VAT section: Output VAT | Input VAT | Net VAT Payable (or Refund claim). |

### 3.9 Nil Return, Penalties, Deadline

| ID | Story | Acceptance Criteria |
|----|-------|---------------------|
| US-326 | As a user with zero tax liability, I want clear nil return guidance so that I know I must still file. | Nil return status flagged; "Filing required — no payment due" message. |
| US-327 | As a user, I want to see penalty estimates if I file late so that I'm motivated to file on time. | Penalty calculator: late filing (₦100k + ₦50k/month), late payment (10% + MPR interest); shown in reminder/widget. |
| US-328 | As a user, I want a countdown to the filing deadline so that I don't miss it. | "X days to March 31 filing deadline" on Dashboard and Tax Summary; colour changes as deadline approaches. |

### 3.10 Engine Versioning

| ID | Story | Acceptance Criteria |
|----|-------|---------------------|
| US-329 | As a user, I want my historical summaries to remain unchanged when tax rules update so that I have a consistent audit trail. | taxYearSummaries and filing snapshots store engineVersion; old years not recomputed with new rules. |
| US-330 | As a user, I want to be notified when tax rules change so that I'm aware of updates. | In-app notice: "Tax rules for [year] have been updated. Your [prior year] figures are unchanged." |

---

## 4. UI Specifications

### 4.1 Tax Summary Screen Layout

**Navigation:** Side Drawer → Tax Summary  
**Layout:** Single scrollable screen with expandable sections

#### 4.1.1 Loading State

- **While tax computation loads:** Skeleton placeholders for liability amount (large rectangle), effective rate (small bar), and expandable sections. Skeleton uses neutral-100 pulse animation. Transition to real content when `tax.getSummary` resolves.

#### 4.1.2 Top Section — Tax Liability Card

- **Background:** `primary-light` (#E8F5F0)
- **Headline:** "Estimated Tax Due: ₦XXX,XXX" (mono font, large)
- **Sub-line:** "Based on ₦X,XXX,XXX taxable income after deductions"
- **Meta:** Tax year label (e.g. "2026 Tax Year") | "Updated just now" or timestamp
- **Deadline badge:** "X days to filing deadline" (if within 60 days)

#### 4.1.3 Tax Year Selector

- Dropdown or segmented control: "2026 | 2025 | 2024"
- Default: current tax year

#### 4.1.4 Income Breakdown (Expandable)

| Source | Amount |
|--------|--------|
| Freelance / Client Income | ₦X,XXX,XXX |
| Foreign Income (converted) | ₦X,XXX,XXX |
| Investment Returns | ₦XXX,XXX |
| Rental Income | ₦XXX,XXX |
| Digital Asset Income | ₦XXX,XXX |
| **Total Gross Income** | **₦X,XXX,XXX** |

- Expandable: tap to show/hide
- Foreign income: tap for FX details tooltip/modal

#### 4.1.5 Deductions (Expandable)

| Deduction | Amount |
|-----------|--------|
| Business Expenses | ₦XXX,XXX |
| Rent Relief (20% of rent, max ₦500k) | ₦XXX,XXX |
| Pension Contributions | ₦XXX,XXX |
| NHIS / NHF | ₦XXX,XXX |
| Life Insurance / Mortgage Interest | ₦XXX,XXX |
| **Total Deductions** | **₦XXX,XXX** |
| **Taxable Income** | **₦X,XXX,XXX** |

#### 4.1.6 Tax Band Breakdown (Expandable with Visualization)

- **Table:**
  | Band | Range | Rate | Income in Band | Tax |
  |------|-------|------|----------------|-----|
  | 1 | ₦0 – ₦800,000 | 0% | ₦800,000 | ₦0 |
  | 2 | ₦800,001 – ₦2.2m | 15% | ₦1,400,000 | ₦210,000 |
  | … | … | … | … | … |

- **Visual:** Horizontal stacked bar; each band a distinct colour; legend with band number and rate
- **Effective Rate:** "Effective Tax Rate: X.X%" below the visualization

#### 4.1.7 Credits & Net Payable (Expandable)

| Item | Amount |
|------|--------|
| Gross Tax (before credits) | ₦XXX,XXX |
| Withholding Tax Credits | −₦XXX,XXX |
| **Net Tax Payable** | **₦XXX,XXX** |

- Net Payable emphasised (primary colour if > 0, success if 0)
- Nil return callout if net = 0: "Filing required — no payment due"

#### 4.1.8 SME-Specific Section (shown when entity.type = "llc" or SME)

- **CIT:** "Small company exemption applies" or CIT + Development Levy breakdown
- **VAT:** Output VAT | Input VAT | Net VAT Payable

#### 4.1.9 Declaration / Edit Reliefs

- Link or button: "Edit reliefs" → navigates to declaration form or inline edit
- Fields: Annual rent paid, Pension, NHIS, NHF, Life insurance, Mortgage interest

#### 4.1.10 Layout & Scroll Behavior

- **Sticky elements:** Tax year selector and "Refresh" / "Updated" timestamp remain visible at top of screen while scrolling. Primary liability figure (₦XXX,XXX) stays in view or re-appears as sticky header when scrolling past.
- **Scroll container:** Single scrollable column. Income Breakdown, Deductions, Band Breakdown, Credits are expandable sections; expanding/collapsing does not affect scroll position of other sections.
- **Primary actions:** "Edit reliefs" link always accessible; no primary CTA that scrolls out of view.

#### 4.1.11 Warnings & Flags

- Uncategorised count: "12 transactions uncategorised — excluded from calculation"
- FX approximated: "Some FX rates used nearest available date"
- DTA prompt: "You have foreign income — DTA credit may apply. Consult a professional."

---

## 5. Functional Requirements

### 5.1 PIT Pipeline — Complete Flow

| ID | Requirement | Details |
|----|-------------|---------|
| FR-001 | **Gross Income** | Sum all transactions where `type = "income"` AND `taxYear` matches AND `entityId` matches. Exclude: gifts, loans, transfers, PAYE salary, capital injections. Use `amountNgn` (NGN equivalent after FX conversion). |
| FR-002 | **Business Expenses** | Sum `amountNgn × (deductiblePercent / 100)` for transactions where `type = "business_expense"` AND `isDeductible = true` AND `taxYear` matches. |
| FR-003 | **Assessable Profit** | `assessableProfit = grossIncome - totalBusinessExpenses`. Clamp to 0 if negative. |
| FR-004 | **Rent Relief** | `rentRelief = min(annualRentPaid × 0.20, 500_000)`. User-declared `annualRentPaid`; cap ₦500,000. Applies to personal residential rent only. |
| FR-005 | **Other Reliefs** | pensionRelief = declared; nhisRelief = declared; nhfRelief = declared; lifeInsuranceRelief = declared; mortgageInterestRelief = declared. No caps per NTA 2025. |
| FR-006 | **Total Reliefs** | Sum of all six relief types. |
| FR-007 | **Taxable Income** | `taxableIncome = assessableProfit - totalReliefs`. Clamp to 0 if negative. |

### 5.2 PIT Bands — All Six with Thresholds and Rates

| ID | Requirement | Details |
|----|-------------|---------|
| FR-008 | **Band 1** | Lower: ₦0, Upper: ₦800,000, Rate: 0%. First ₦800k exempt. |
| FR-009 | **Band 2** | Lower: ₦800,001, Upper: ₦2,200,000, Rate: 15%. Max tax in band: ₦210,000. |
| FR-010 | **Band 3** | Lower: ₦2,200,001, Upper: ₦4,200,000, Rate: 18%. Max tax in band: ₦360,000. |
| FR-011 | **Band 4** | Lower: ₦4,200,001, Upper: ₦6,200,000, Rate: 21%. Max tax in band: ₦420,000. |
| FR-012 | **Band 5** | Lower: ₦6,200,001, Upper: ₦56,200,000, Rate: 23%. Max tax in band: ₦11,500,000. |
| FR-013 | **Band 6** | Lower: ₦56,200,001, Upper: unlimited, Rate: 25%. |
| FR-014 | **Band Calculation** | For each band: `incomeInBand = max(0, min(taxableIncome, band.upper) - (band.lower - 1))`; `taxInBand = incomeInBand × band.rate`. Use exact boundary logic: Band 2 starts at 800,001 (inclusive). |
| FR-015 | **Gross Tax Liability** | Sum of `taxInBand` across all bands. |

### 5.3 Relief Rules and Caps

| ID | Requirement | Details |
|----|-------------|---------|
| FR-016 | **Rent Relief Rule** | 20% of annual rent paid; cap ₦500,000. Only for personal residential accommodation. |
| FR-017 | **Pension** | Full amount declared; must be to approved RSA/pension fund. |
| FR-018 | **NHIS / NHF / Life Insurance / Mortgage** | Full declared amounts; no engine-side cap. User responsible for NTA eligibility. |

### 5.4 WHT Credit Rules

| ID | Requirement | Details |
|----|-------------|---------|
| FR-019 | **WHT Sum** | `whtCredits = Σ transaction.whtDeducted` for all income transactions in tax year. |
| FR-020 | **Gross vs Net Income** | Taxable income uses gross amount (before WHT); WHT is a credit against final liability. |
| FR-021 | **Net Tax After WHT** | `netTaxPayable = max(grossTaxLiability - whtCredits, 0)`. Excess WHT: clamp to 0; flag for possible refund (user prompt). |

### 5.5 Minimum Tax

| ID | Requirement | Details |
|----|-------------|---------|
| FR-022 | **Minimum Tax Rule** | If `assessableProfit > 800_000` AND `grossTaxLiability < (grossIncome × 0.005)`, then `grossTaxAfterMinimum = max(grossIncome × 0.005, 200_000)`. Otherwise `grossTaxAfterMinimum = grossTaxLiability`. (Note: Tax Engine Spec §6.5 states 1%; verify against NTA 2025 gazette.) |
| FR-023 | **Floor** | Minimum tax cannot be less than ₦200,000 when the rule applies. |
| FR-024 | **Display** | When minimum tax applies, show both progressive result and minimum tax; indicate which was used. |

> **Note:** Tax Engine Spec §6.5 states 1% of gross income. FR-022 includes ₦200k floor per user requirement. Verify both against NTA 2025 gazette.

### 5.6 FX Conversion Rules

| ID | Requirement | Details |
|----|-------------|---------|
| FR-025 | **Conversion Date** | Use CBN rate on the **date income was received** (credited to account), not invoice or payment platform date. |
| FR-026 | **Formula** | `amountNgn = foreignAmount × cbnRateOnDate(currency, transactionDate)`. |
| FR-027 | **Rate Source** | CBN official rate API; rates cached in `fxRates` table (date, currency, rate). |
| FR-028 | **Fallback** | If no rate for transaction date: use nearest prior available date; set `fxRateApproximated: true` in output. |
| FR-029 | **Unsupported Currency** | Flag transaction; exclude from auto-calculation until user provides manual rate. |

### 5.7 Digital Asset Treatment

| ID | Requirement | Details |
|----|-------------|---------|
| FR-030 | **Default** | Crypto/virtual asset gains treated as **income** (PIT) unless user designates as capital disposal. |
| FR-031 | **Gain Calculation** | `gain = disposalProceedsNgn - acquisitionCostNgn`. Losses = 0 in v1 (no carry-forward). |
| FR-032 | **Manual Entry** | User logs "Digital Asset Disposal" with acquisition cost, disposal proceeds, dates. |
| FR-033 | **Prompt** | Filing checklist: "Did you sell, swap, or convert any cryptocurrency in [year]?" |

### 5.8 CGT

| ID | Requirement | Details |
|----|-------------|---------|
| FR-034 | **Individuals** | CGT gains added to gross income; subject to progressive PIT rates. |
| FR-035 | **LLCs** | CGT at 30% flat on gains. |
| FR-036 | **Exemptions** | Principal private residence; qualifying small company shares; spouse transfers; compensation; first ₦100k gain/year (confirm from NTA). |
| FR-037 | **v1 Scope** | Manual entry of capital disposals only; no auto-detection from transactions. |

### 5.9 CIT

| ID | Requirement | Details |
|----|-------------|---------|
| FR-038 | **Small Company Exemption** | If `annualTurnover ≤ 100_000_000` AND `grossFixedAssets ≤ 250_000_000`: CIT = 0, CGT = 0, Development Levy = 0. File nil CIT return. |
| FR-039 | **CIT Rate** | 30% of assessable profit. |
| FR-040 | **Development Levy** | 4% of assessable profit. |
| FR-041 | **Total CIT** | `totalCit = cit + developmentLevy`. |
| FR-042 | **Boundary** | Turnover exactly ₦100m: exempt. ₦100,000,001: not exempt. |
| FR-043 | **Capital Allowances** | v1: user provides figure or seeks professional advice; engine uses declared assessable profit. |

### 5.10 VAT

| ID | Requirement | Details |
|----|-------------|---------|
| FR-044 | **Rate** | 7.5%. |
| FR-045 | **Output VAT** | Sum of VAT charged on taxable sales (invoices). `outputVat = Σ (invoiceSubtotal × 0.075)` for paid invoices on taxable supplies. |
| FR-046 | **Input VAT** | Sum of VAT on business purchases. `inputVat = Σ (amountNgn × 0.075 / 1.075)` where `isVatInclusive = true`. |
| FR-047 | **Net VAT** | `netVatPayable = outputVat - inputVat`. If negative: flag as refund claim. |
| FR-048 | **Zero-Rated / Exempt** | Zero-rated: 0% output, input recoverable. Exempt: no output, input not recoverable. Apply per invoice/transaction tagging. |

### 5.11 Nil Return Detection

| ID | Requirement | Details |
|----|-------------|---------|
| FR-049 | **Nil Return Flag** | `isNilReturn = (netTaxPayable === 0) OR (taxableIncome <= 800_000)`. |
| FR-050 | **Filing Obligation** | Filing still required. Engine and UI must make this clear. |
| FR-051 | **Form Generation** | Self-assessment form still generated with all figures; shows zero liability. |

### 5.12 Engine Versioning

| ID | Requirement | Details |
|----|-------------|---------|
| FR-052 | **Version Format** | `TAX_ENGINE_VERSION = "2026-01-01"` (date rules became effective). |
| FR-053 | **Storage** | Every `taxYearSummaries` document stores `engineVersion`. Every `filingRecords.taxSummarySnapshot` includes version. |
| FR-054 | **Historical Immutability** | When engine logic changes, historical summaries are NOT recomputed. New version applies to new tax years only. |
| FR-055 | **Version Router** | `getEngineForYear(taxYear)`: if taxYear >= 2027 use engine_2027; else use engine_2026. |
| FR-056 | **Changelog** | Document all changes in `CHANGELOG_TaxEngine.md`; review against NTA gazette before release. |

### 5.13 Caching and Performance

| ID | Requirement | Details |
|----|-------------|---------|
| FR-057 | **Live Query** | `tax.getSummary` runs engine inline in Convex Query; reactive — re-runs when transactions/declarations change. |
| FR-058 | **Cache Mutation** | `tax.refreshSummaryCache` writes to `taxYearSummaries`; called after bulk imports to materialise for fast reads if needed. |
| FR-059 | **Idempotency** | Same inputs always produce same outputs (pure function). |

### 5.14 Edge Cases & Validation Rules

| ID | Scenario | Engine Behaviour |
|----|----------|-------------------|
| FR-065 | Gross income = 0 | Nil return; no tax computation; filing still required. |
| FR-066 | Business expenses > gross income | assessableProfit clamped to 0; taxableIncome clamped to 0 after reliefs. |
| FR-067 | WHT credits > gross tax liability | netTaxPayable clamped to 0; excess WHT flagged for possible refund; user prompted. |
| FR-068 | Foreign transaction with no FX rate | Use nearest prior available rate; set fxRateApproximated = true in output. |
| FR-069 | Unsupported currency | Exclude from auto-calculation; flag for manual NGN conversion. |
| FR-070 | LLC turnover exactly ₦100m | Exempt (≤ threshold). |
| FR-071 | LLC turnover ₦100,000,001 | Not exempt; full CIT applies. |
| FR-072 | PAYE salary + freelance income | Exclude PAYE salary (type = "Salary (PAYE)"); include only freelance and other non-PAYE income. |
| FR-073 | Multiple entities | Engine runs independently per entity; never aggregate across entities. |
| FR-074 | Uncategorised transactions | Excluded from engine; uncategorisedCount returned; dashboard shows warning. |
| FR-075 | deductiblePercent = 0 | Transaction contributes ₦0 to business expenses even if isDeductible = true. |
| FR-076 | Rent declared without evidence | Relief still applied; app prompts user to retain tenancy agreement for audit. |

### 5.15 Worked Examples as Test Cases

| ID | Example | Expected Output |
|----|---------|-----------------|
| FR-077 | **Amaka (Freelancer)** | Gross ₦7.2m, expenses ₦1.8m, rent ₦2m, pension ₦576k, WHT ₦180k. Assessable ₦5.4m, reliefs ₦976k, taxable ₦4.424m. Gross tax ≈ ₦617k, net ≈ ₦437k. Effective rate ≈ 6.07%. |
| FR-078 | **High-Earner** | Gross ₦52m, expenses ₦6m, rent ₦3.6m, pension ₦2m, WHT ₦400k. Assessable ₦46m, reliefs ₦2.5m, taxable ₦43.5m. Gross tax ≈ ₦9.569m, net ≈ ₦9.169m. Effective rate ≈ 17.63%. |
| FR-079 | **Small Company** | Turnover ₦45m, assets ₦80m → exempt. CIT = 0. VAT: output ₦3.375m, input ₦1.65m, net ₦1.725m. |
| FR-080 | **Nil Return** | Gross ₦650k, expenses ₦120k, reliefs ₦80k. Taxable ₦450k. Gross tax ₦0, net ₦0. isNilReturn = true. |
| FR-081 | **Late Filing Penalty** | Net tax ₦600k, filed 2.5 months late, MPR 27.5%. Filing penalty ₦200k, payment penalty ₦60k, interest ₦41.25k. Total penalties ₦301.25k. |

---

## 6. API Requirements

### 6.1 Convex Functions

| Function | Type | Purpose |
|----------|------|---------|
| `tax.getSummary` | **Query** | Returns full `TaxEngineOutput` for `entityId` + `taxYear`. Reads transactions, declarations, invoices; runs engine inline. Reactive — updates when data changes. |
| `tax.refreshSummaryCache` | **Mutation** | Recomputes engine, writes result to `taxYearSummaries`. Called after bulk import or manual "Refresh" action. |
| `tax.getDeductionBreakdown` | **Query** | Returns expense breakdown by category with deductible amounts. |
| `tax.getWhtCredits` | **Query** | Returns sum of WHT credits for entity + tax year. |
| `tax.getFilingChecklist` | **Query** | Returns checklist readiness (uncategorised count, declaration completeness, etc.). |

### 6.2 tax.getSummary Contract

**Args:**
```typescript
{ entityId: Id<"entities">; taxYear: number }
```

**Returns:**
```typescript
TaxEngineOutput | null
```

**Behaviour:**
- Validates user owns entity
- Fetches all transactions for entity + taxYear
- Fetches tax declarations (from user/entity settings)
- Fetches capital disposals
- Builds `TaxEngineInput`
- Runs `runTaxEngine(input)`
- Returns output (or null if no data)

### 6.3 tax.refreshSummaryCache Contract

**Args:**
```typescript
{ entityId: Id<"entities">; taxYear: number }
```

**Behaviour:**
- Same computation as getSummary
- Upserts to `taxYearSummaries` with computed result
- Sets `computedAt: Date.now()`, `engineVersion: TAX_ENGINE_VERSION`
- Idempotent

---

## 7. Data Models

### 7.1 TaxEngineInput

See §2.1 — built from:
- `entities` (type, vatRegistered, annualTurnover, grossFixedAssets)
- `transactions` (filtered by entityId, taxYear)
- `capitalDisposals` (manual entries)
- User declarations (rent, pension, etc. — stored in `userPreferences` or entity-specific table)

### 7.2 TaxEngineOutput

See §2.5 — full structure with pit, cit, cgt, vat, totalTaxPayable, uncategorisedCount, fxRateApproximated.

### 7.3 taxYearSummaries Schema (Convex)

```typescript
taxYearSummaries: defineTable({
  entityId:                v.id("entities"),
  taxYear:                  v.number(),
  engineVersion:            v.string(),
  totalGrossIncome:         v.number(),
  totalBusinessExpenses:     v.number(),
  totalRentRelief:          v.number(),
  totalPensionContributions: v.number(),
  totalOtherReliefs:        v.number(),
  taxableIncome:            v.number(),
  grossTaxLiability:       v.number(),
  minimumTax:               v.number(),
  grossTaxAfterMinimum:     v.number(),
  whtCredits:               v.number(),
  netTaxPayable:            v.number(),
  effectiveTaxRate:         v.number(),
  vatOutputTax:             v.optional(v.number()),
  vatInputTax:              v.optional(v.number()),
  netVatPayable:            v.optional(v.number()),
  isSmallCompanyExempt:     v.optional(v.boolean()),
  citAmount:                v.optional(v.number()),
  developmentLevy:         v.optional(v.number()),
  isNilReturn:              v.boolean(),
  uncategorisedCount:       v.number(),
  fxRateApproximated:       v.boolean(),
  bandBreakdown:            v.optional(v.array(v.object({
    bandNumber: v.number(),
    lowerBound: v.number(),
    upperBound: v.union(v.number(), v.null()),
    rate: v.number(),
    incomeInBand: v.number(),
    taxInBand: v.number(),
  }))),
  computedAt:               v.number(),
})
  .index("by_entityId_taxYear", ["entityId", "taxYear"]),
```

### 7.4 fxRates Table (for FX conversion)

```typescript
fxRates: defineTable({
  date:     v.number(),   // Unix ms (date precision)
  currency: v.string(),   // "USD" | "GBP" | "EUR" | etc.
  cbnRate:  v.number(),   // NGN per 1 unit of foreign currency
})
  .index("by_date_currency", ["date", "currency"]),
```

### 7.5 Tax Declarations Storage

Declarations (rent, pension, etc.) must be stored per entity per tax year. Options:
- New table `taxDeclarations` with fields: entityId, taxYear, annualRentPaid, pensionContributions, etc.
- Or extend `entities` with `defaultDeclarations` and allow per-year overrides in a separate table.

---

## 8. Non-Goals

| Item | Reason |
|------|--------|
| **Filing submission** | Handled by PRD-6. Engine produces figures; filing module uses them. |
| **Penalty payment** | Engine computes penalty estimates for reminders only; payment is user action via bank/NRS. |
| **FIRS/NRS integration** | No direct API to FIRS. Filing guidance and TaxPro Max deep links only. |
| **DTA credit auto-computation** | v1: flag only. User directed to professional for DTA claim. |
| **Loss carry-forward** | Deferred to v2. |
| **Capital allowances (CIT)** | v1: user provides figure or seeks professional advice. |
| **Employer PAYE** | TaxEase targets self-employed; not payroll computation. |
| **Stamp Duty, BPL** | Out of scope. |

---

## 9. Success Metrics

| Metric | Target |
|--------|--------|
| **Calculation accuracy** | 100% match against worked examples (FR-060 to FR-064) in automated tests |
| **NTA alignment** | External tax professional sign-off before production |
| **Real-time reactivity** | Tax Summary updates within 2 seconds of transaction categorisation change |
| **Nil return clarity** | Users with zero liability correctly identified; no confusion about filing obligation |
| **Engine version integrity** | No silent recomputation of historical tax year when rules change |
| **FX conversion correctness** | All foreign transactions use correct CBN rate for date; fallback flagged |
| **User trust** | Post-filing survey: "I was confident in the figures" ≥ 90% agree |

---

## 10. Open Questions

| # | Question | Owner |
|---|----------|-------|
| 1 | **Minimum tax:** Tax Engine Spec says 1% of gross; user requested 0.5% and ₦200k floor. Confirm exact rule from NTA 2025 gazette. | Product / Tax Advisor |
| 2 | **Band boundaries:** Exact upper/lower values for each band — verify against NTA 2025 Schedule 1. | Engineering |
| 3 | **CGT first ₦100k exempt:** Confirm annual CGT exempt amount from NTA. | Product |
| 4 | **VAT small business threshold:** Exact turnover figure for registration; confirm from NTA/FIRS. | Product |
| 5 | **CBN rate API:** Availability, rate type (official vs NAFEX), and fallback strategy if API is down. | Engineering |
| 6 | **Tax declarations storage:** Single place vs per-year overrides; schema decision. | Engineering |
| 7 | **Capital allowances input:** How does user provide this for CIT? Dedicated form or generic "other deductions" field? | Product |
| 8 | **MPR for penalty interest:** Source for current CBN Monetary Policy Rate; update frequency. | Engineering |

---

*End of PRD-3 — Tax Calculation Engine*
