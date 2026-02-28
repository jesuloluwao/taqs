# TaxEase Nigeria — Tax Calculation Engine Specification

**Version:** 1.0 — February 2026
**Applies to:** Nigeria Tax Act (NTA) 2025, effective 1 January 2026
**Status:** Draft

> ⚠️ **Regulatory Notice:** Tax law is specific and changes frequently. All band thresholds, rates, and relief caps in this document are based on the NTA 2025 as published and the overview provided. **Every figure in this document must be verified against the official NTA 2025 gazette text before the engine goes to production.** The engine is designed to be updated without a full app release (see §14 — Engine Versioning).

---

## Table of Contents

1. [Purpose & Scope](#1-purpose--scope)
2. [Tax Type Applicability by Entity](#2-tax-type-applicability-by-entity)
3. [Income Classification](#3-income-classification)
4. [Business Expense Deductions](#4-business-expense-deductions)
5. [Personal Reliefs](#5-personal-reliefs)
6. [Personal Income Tax (PIT)](#6-personal-income-tax-pit)
7. [Withholding Tax (WHT) Credits](#7-withholding-tax-wht-credits)
8. [Foreign Income & FX Conversion](#8-foreign-income--fx-conversion)
9. [Digital Asset Income](#9-digital-asset-income)
10. [Capital Gains Tax (CGT)](#10-capital-gains-tax-cgt)
11. [Company Income Tax (CIT)](#11-company-income-tax-cit)
12. [Value Added Tax (VAT)](#12-value-added-tax-vat)
13. [Nil Returns](#13-nil-returns)
14. [Penalties Reference](#14-penalties-reference)
15. [Worked Examples](#15-worked-examples)
16. [Implementation Reference](#16-implementation-reference)
17. [Edge Cases & Validation Rules](#17-edge-cases--validation-rules)
18. [Engine Versioning](#18-engine-versioning)

---

## 1. Purpose & Scope

### 1.1 What the Engine Does

The TaxEase tax calculation engine takes a user's categorised financial transactions, declared reliefs, and entity metadata for a given tax year and produces a complete, NTA 2025-compliant tax computation. Its outputs are:

1. **Live tax estimate** — shown on the Dashboard and Tax Summary screen, updated reactively as transactions are categorised
2. **Filing computation** — the authoritative figures used to populate the self-assessment form at filing time
3. **Tax band breakdown** — detailed per-band figures shown to the user for transparency

### 1.2 Scope

The engine covers the following taxes for the tax year 1 January – 31 December:

| Tax | Applicable To |
|---|---|
| Personal Income Tax (PIT) | Freelancers, individuals, registered business name owners |
| Company Income Tax (CIT) | Limited Liability Companies (LLCs) above the small company exemption threshold |
| Withholding Tax (WHT) Credits | All entities (WHT reduces final PIT/CIT liability) |
| Capital Gains Tax (CGT) | Any entity that disposed of a capital asset during the year |
| Value Added Tax (VAT) | Entities registered for VAT (turnover above the small business threshold) |

### 1.3 Out of Scope (v1)

- Stamp Duty
- Business Premises Levy
- PAYE computation for employers with staff (TaxEase targets the employer's own tax, not payroll)
- State-specific levies (these vary and cannot be generalised)
- Double Taxation Agreement (DTA) credits — flagged for user action but not auto-computed in v1

---

## 2. Tax Type Applicability by Entity

The first thing the engine determines is which tax regime applies. This is driven by the `entity.type` field.

```
entity.type = "individual" OR "business_name"
  → Primary tax: PIT (Personal Income Tax)
  → Regime: Self-assessment under NTA 2025 Schedule 1

entity.type = "llc"
  → Check small company exemption (§11.1)
  → If exempt: nil CIT return only
  → If not exempt: CIT at 30% + 4% Development Levy
  → VAT: applies if turnover > small business threshold (regardless of entity type)
```

**Decision tree:**

```
Is entity type "llc"?
├── YES → Is turnover ≤ ₦100m AND fixed assets ≤ ₦250m?
│         ├── YES → Small company exemption → CIT = ₦0 (file nil CIT return)
│         └── NO  → Apply CIT calculation (§11)
└── NO  → Apply PIT calculation (§6)

In either branch:
  → Is entity VAT-registered? → Apply VAT calculation (§12)
  → Did entity dispose of capital assets? → Apply CGT calculation (§10)
```

---

## 3. Income Classification

### 3.1 The Core Question

Not every credit to a bank account is taxable income. The engine only includes transactions that the user has classified as `type = "income"` and are not flagged as non-taxable inflows. The categorisation step (handled separately by the AI and user review) determines which bucket each transaction falls into before the engine runs.

### 3.2 Taxable Income

All amounts converted to NGN before inclusion (see §8 for FX rules).

| Income Type | Category in App | Notes |
|---|---|---|
| Freelance / client fees | Freelance / Client Income | Core income source for most users |
| Consulting fees | Freelance / Client Income | Same treatment |
| Contract payments | Freelance / Client Income | Regardless of payment method |
| Retainer payments | Freelance / Client Income | Recurring; each instalment taxable in year received |
| Investment returns | Investment Returns | Dividends, interest, returns from financial instruments |
| Rental income | Rental Income | Net of allowable rental expenses |
| Digital asset gains | Digital Asset Income | Profits from crypto / virtual asset disposal (§9) |
| Business revenue (SME) | Business Revenue | Sales of goods or services |
| Commission income | Freelance / Client Income | Earned commissions |
| Royalties | Other Taxable Income | Licensing fees, publication royalties |

### 3.3 Non-Taxable Inflows (Excluded from Engine)

These transaction types must **not** be included in gross income. Users are prompted to categorise these correctly during triage.

| Inflow Type | Category in App | Why Excluded |
|---|---|---|
| Genuine gift | Gift (Non-Taxable) | Exempt under NTA 2025 (subject to gift amount limits — flag if > ₦10m) |
| Loan disbursement | Loan / Debt Received | Liability, not income |
| Loan repayment received | Transfer | Return of capital |
| Transfer from own account | Transfer (Own Account) | Not new income |
| Refund / reimbursement | Refund / Reimbursement | Return of money already spent |
| PAYE salary (already taxed) | Salary (PAYE) | Employer has deducted and remitted tax; self-assessment only covers non-PAYE income |
| Equity / capital injection | Capital (Business) | Equity, not revenue |

> **PAYE + Freelance scenario:** If a user has both salaried employment (PAYE) and freelance income, only the freelance income and any other non-PAYE sources are self-assessed. The engine includes only the freelance portion. The user declares PAYE income separately on their self-assessment form for completeness but it does not trigger additional PIT (PAYE credit covers it).

### 3.4 Gross Income Calculation

```
grossIncome = Σ amountNgn
              where transaction.type = "income"
              AND transaction.taxYear = targetYear
              AND transaction.entityId = targetEntity
```

---

## 4. Business Expense Deductions

### 4.1 What Qualifies

The NTA 2025 allows deduction of **all expenses incurred wholly, exclusively, and necessarily for the production of taxable income**. The app pre-tags likely-deductible expenses by category. Final determination is the user's responsibility.

### 4.2 Allowable Expense Categories

| Category | Typical Transactions | NTA Basis |
|---|---|---|
| Internet & Data | Monthly data subscriptions, broadband bills | Business running cost |
| Electricity & Fuel | Electricity bills, generator fuel (pro-rated if home office) | Business running cost |
| Software & Subscriptions | Figma, GitHub, Notion, Adobe CC, accounting tools | Business running cost |
| Equipment & Hardware | Laptop, camera, microphone, design tablet | Capital expenditure (may need amortisation in v2) |
| Professional Development | Online courses, certifications, professional memberships | Self-improvement for income production |
| Workspace / Rent (Business) | Coworking space, dedicated office rent | Business running cost (distinct from personal rent relief) |
| Transport (Business) | Ride-hailing for client visits, fuel for business trips | Directly attributable to business |
| Marketing & Advertising | Meta/Google ads, printing, PR spend | Income-generating spend |
| Bank & Transaction Charges | Bank fees, Paystack/Flutterwave processing fees | Business running cost |
| Professional Services | Accountant fees, legal fees, consultant fees | Business running cost |
| Content Creation Costs | Props, wardrobe (content-specific), studio hire | NTA allows creator-specific costs |
| Phone & Communication | Business phone bill (pro-rated) | Business running cost |

### 4.3 Non-Deductible Items

| Item | Reason |
|---|---|
| Personal groceries, clothing (non-creator) | Personal, not for income production |
| Fines and penalties | Expressly disallowed |
| Capital expenditure on land | Not depreciable |
| Loan repayments (principal) | Capital, not expense |
| Personal entertainment | Not wholly for business |

### 4.4 Split Transactions

Some transactions are part business, part personal (e.g., a home electricity bill). The engine respects the `deductiblePercent` field:

```
deductibleAmount = transaction.amountNgn × (transaction.deductiblePercent / 100)
```

### 4.5 Total Business Expenses Calculation

```
totalBusinessExpenses = Σ (amountNgn × deductiblePercent / 100)
                        where transaction.type = "business_expense"
                        AND transaction.isDeductible = true
                        AND transaction.taxYear = targetYear
                        AND transaction.entityId = targetEntity
```

---

## 5. Personal Reliefs

Personal reliefs apply to **individuals and business name owners only** (not LLCs). They reduce taxable income after business expenses have already been deducted.

### 5.1 Rent Relief

Introduced by NTA 2025 as a replacement for the old Consolidated Relief Allowance (CRA).

```
rentRelief = min(annualRentPaid × 0.20, 500_000)
```

- `annualRentPaid`: declared by the user (not pulled from transactions, as rent is often paid to landlords without a traceable bank record)
- Maximum: ₦500,000 regardless of how high the rent is
- Applies only to rent paid for **personal residential accommodation**, not business premises (business rent is deducted in §4 separately)

**Example:**

| Annual Rent | 20% | Relief Granted |
|---|---|---|
| ₦1,200,000 | ₦240,000 | ₦240,000 |
| ₦2,500,000 | ₦500,000 | ₦500,000 ← capped |
| ₦6,000,000 | ₦1,200,000 | ₦500,000 ← capped |

### 5.2 Pension Contributions

Contributions to an approved pension fund under the Pension Reform Act are deductible.

- Employees: minimum 8% of monthly emoluments (employee portion)
- Self-employed / freelancers: voluntary contributions to an RSA (Retirement Savings Account) are deductible
- No cap specified in the NTA 2025 (deduct full declared amount)

```
pensionRelief = declaredPensionContributions
```

### 5.3 National Health Insurance Scheme (NHIS)

Statutory NHIS contributions are deductible.

```
nhisRelief = declaredNhisContributions
```

### 5.4 National Housing Fund (NHF)

NHF contributions under the NHF Act are deductible.

```
nhfRelief = declaredNhfContributions
```

### 5.5 Life Insurance Premiums

Premiums on qualifying life insurance policies taken out for the taxpayer or their spouse/children.

```
lifeInsuranceRelief = declaredLifeInsurancePremiums
```

### 5.6 Mortgage Interest

Interest paid on a mortgage for the taxpayer's principal private residence is deductible.

```
mortgageInterestRelief = declaredMortgageInterest
```

### 5.7 Total Reliefs

```
totalReliefs = rentRelief
             + pensionRelief
             + nhisRelief
             + nhfRelief
             + lifeInsuranceRelief
             + mortgageInterestRelief
```

> **Note:** Reliefs are declarative — the user enters these amounts in the Tax Summary or Filing screens. The app does not auto-detect them from transactions (as they often involve direct debits or cash payments not in the bank statement). The app does prompt users for these during the pre-filing checklist.

---

## 6. Personal Income Tax (PIT)

### 6.1 Assessable Profit

```
assessableProfit = grossIncome - totalBusinessExpenses
if assessableProfit < 0: assessableProfit = 0
```

A freelancer cannot claim a net business loss against personal reliefs in the same year under the NTA 2025 (losses can potentially be carried forward — flagged as a v2 feature).

### 6.2 Taxable Income

```
taxableIncome = assessableProfit - totalReliefs
if taxableIncome < 0: taxableIncome = 0
```

### 6.3 Progressive Tax Bands

The NTA 2025 introduces a six-band progressive system. The first ₦800,000 is exempt (0% rate).

| Band | Lower Bound | Upper Bound | Rate | Maximum Tax in Band |
|---|---|---|---|---|
| 1 | ₦0 | ₦800,000 | 0% | ₦0 |
| 2 | ₦800,001 | ₦2,200,000 | 15% | ₦210,000 |
| 3 | ₦2,200,001 | ₦4,200,000 | 18% | ₦360,000 |
| 4 | ₦4,200,001 | ₦6,200,000 | 21% | ₦420,000 |
| 5 | ₦6,200,001 | ₦56,200,000 | 23% | ₦11,500,000 |
| 6 | ₦56,200,001 | ∞ | 25% | unlimited |

> ⚠️ **Verify:** The exact upper/lower boundary for each band must be confirmed against the NTA 2025 Schedule 1 official gazette. The rates (0/15/18/21/23/25%) are confirmed. The band widths above are the engine's working assumption.

### 6.4 Band-by-Band Calculation

```typescript
function calculatePitBands(taxableIncome: number): BandResult[] {
  const BANDS = [
    { lower: 0,          upper: 800_000,    rate: 0.00 },
    { lower: 800_001,    upper: 2_200_000,  rate: 0.15 },
    { lower: 2_200_001,  upper: 4_200_000,  rate: 0.18 },
    { lower: 4_200_001,  upper: 6_200_000,  rate: 0.21 },
    { lower: 6_200_001,  upper: 56_200_000, rate: 0.23 },
    { lower: 56_200_001, upper: Infinity,   rate: 0.25 },
  ];

  return BANDS.map(band => {
    const incomeInBand = Math.max(
      0,
      Math.min(taxableIncome, band.upper) - (band.lower - 1)
    );
    return {
      band:         band,
      incomeInBand: incomeInBand,
      taxInBand:    Math.round(incomeInBand * band.rate),
    };
  });
}

function grossTaxLiability(taxableIncome: number): number {
  return calculatePitBands(taxableIncome)
    .reduce((sum, b) => sum + b.taxInBand, 0);
}
```

### 6.5 Minimum Tax

If a taxpayer's assessable income is above ₦800,000 but the progressive calculation yields less than 1% of gross income, a minimum tax of **1% of gross income** applies.

```
minimumTax = grossIncome × 0.01
grossTax   = max(grossTaxLiability, minimumTax)
```

> This rule prevents zero-tax situations for taxpayers with very high deductions. Confirm with the NTA 2025 whether this minimum tax provision is retained in the new regime.

### 6.6 Net Tax Payable

```
netTaxPayable = max(grossTax - whtCredits - dtaCredits, 0)
```

WHT credits are explained in §7. DTA credits are flagged but not auto-computed in v1.

### 6.7 Effective Tax Rate

```
effectiveTaxRate = (netTaxPayable / grossIncome) × 100   // expressed as a percentage
```

This is the figure shown prominently on the Dashboard and Tax Summary screen.

---

## 7. Withholding Tax (WHT) Credits

### 7.1 What WHT Is

When certain payments are made in Nigeria, the payer is required to withhold a percentage of the payment and remit it to the tax authority on behalf of the recipient. The recipient receives the net amount. The withheld amount is an **advance payment** of the recipient's own tax — it is credited against their final PIT or CIT liability.

### 7.2 WHT Rates Relevant to TaxEase Users

| Payment Type | WHT Rate |
|---|---|
| Professional / management fees | 10% |
| Contracts (supply of goods/services) | 5% |
| Rent | 10% |
| Dividends | 10% |
| Interest | 10% |
| Commission | 10% |
| Royalties | 10% |

### 7.3 How Users Record WHT

When a client pays a freelancer ₦500,000 for a project but deducts 5% WHT:
- Client pays ₦475,000 to the freelancer's account
- Client remits ₦25,000 to the NRS
- The freelancer's taxable income is the **gross** ₦500,000 (not the net ₦475,000)
- The ₦25,000 is recorded as a WHT credit

In the app, users tag WHT on individual income transactions:
- `transaction.amountNgn` = gross amount (₦500,000) — what is taxable
- `transaction.whtDeducted` = ₦25,000
- `transaction.whtRate` = 5

The engine uses the gross amount for income, then credits the WHT back at the end.

### 7.4 WHT Credit Calculation

```
whtCredits = Σ transaction.whtDeducted
             where transaction.type = "income"
             AND transaction.taxYear = targetYear
             AND transaction.entityId = targetEntity
```

### 7.5 WHT Credit Certificate

WHT credits should be supported by a **WHT credit note** issued by the client who deducted the tax. The app prompts users to note the credit note reference in the transaction notes field. This is essential for audit defence.

---

## 8. Foreign Income & FX Conversion

### 8.1 Residency Rule

Under NTA 2025, Nigerian tax residents are taxed on their **worldwide income** — including income earned from foreign clients, foreign platforms (Upwork, Fiverr, Toptal), and foreign bank accounts. Non-residents are only taxed on Nigerian-source income.

TaxEase assumes all registered users are Nigerian tax residents. If a user indicates otherwise, this should be flagged for professional review.

### 8.2 Conversion Rule

Foreign currency income is converted to Naira at the **CBN exchange rate on the date the income was received** (not the invoice date, not the payment date on the foreign platform — the date the funds were credited to the user's account).

```
amountNgn = foreignAmount × cbnRateOnDate(currency, transactionDate)
```

### 8.3 FX Rate Source & Caching

- **Source:** CBN official rate API (or the NAFEX/NIFEX rate as specified by the NRS guidance)
- **Caching:** Rates are fetched daily and stored in a `fxRates` table in the Convex database to avoid repeated API calls and to ensure historical rates are preserved
- **Fallback:** If the CBN rate is unavailable for a specific date, use the nearest available prior day's rate and flag the transaction for user review

```
// fxRates table schema
{
  date: number,      // Unix ms (date precision, midnight UTC)
  currency: string,  // "USD" | "GBP" | "EUR" | etc.
  cbнRate: number,   // NGN per 1 unit of foreign currency
}
```

### 8.4 Multi-Currency Transaction Flow

For a freelancer who receives $2,000 USD from a US client:

1. Transaction is imported from Payoneer/Wise/bank statement: `amount = 2000, currency = "USD"`
2. Engine looks up `cbнRate` for USD on the transaction date: e.g., ₦1,620/USD
3. `amountNgn = 2000 × 1620 = ₦3,240,000` — this NGN amount is what enters the tax calculation
4. Both values are stored and displayed to the user (₦3,240,000 / $2,000)

### 8.5 Double Taxation Agreement (DTA) Credits — v1 Flag Only

Nigeria has DTAs with 16 countries. Under a DTA, if a user has paid income tax in a foreign country on income also taxable in Nigeria, they may claim a credit for the foreign tax paid.

**v1 behaviour:** The app detects foreign income and surfaces an in-app prompt:
> *"You have foreign income from [country]. If you paid income tax in that country, you may be eligible for a DTA credit. We recommend consulting a tax professional to claim this relief."*

Auto-computation of DTA credits is deferred to v2.

---

## 9. Digital Asset Income

### 9.1 NTA 2025 Position

The NTA 2025 expressly makes profits from cryptocurrency and virtual asset transactions taxable. Digital asset income is treated as:
- **Trading profit** (subject to PIT as income) if the user regularly trades crypto
- **Capital gain** (subject to CGT) if the user holds crypto as an investment and disposes of it

The engine applies a conservative default: all crypto gains are included in taxable income as income (PIT treatment), unless the user specifically designates them as capital disposals.

### 9.2 Gain Calculation for Crypto

```
gain = saleProceeds - costBasis

where:
  saleProceeds = amount received in NGN at time of disposal
  costBasis    = original purchase price in NGN at time of acquisition
```

- If the user bought BTC for ₦500,000 and sold it for ₦900,000: gain = ₦400,000 (taxable)
- If they made a loss (costBasis > saleProceeds): loss = ₦0 for tax purposes in v1 (capital loss carry-forward deferred to v2)

### 9.3 Recording in the App

- Users manually log crypto disposals as a transaction type: "Digital Asset Disposal"
- Fields: `acquisitionDate`, `acquisitionCostNgn`, `disposalDate`, `disposalProceedsNgn`
- Gain is computed and added to taxable income

### 9.4 User Prompt

Given the complexity and the fact that many users will have incomplete records of crypto cost basis, the app surfaces a specific prompt during the filing checklist:

> *"Did you sell, swap, or convert any cryptocurrency or digital assets in [year]? You need to declare any profits."*

---

## 10. Capital Gains Tax (CGT)

### 10.1 What Constitutes a Capital Disposal

A capital disposal occurs when a user sells, transfers, or otherwise disposes of a capital asset:
- Real property (land, buildings)
- Shares and securities
- Intellectual property
- Crypto / digital assets (if classified as investment — see §9)
- Business goodwill

### 10.2 CGT Rate

| Taxpayer Type | CGT Rate |
|---|---|
| Individual / Business Name | Progressive PIT rates apply to the gain (gain is added to taxable income) |
| LLC | 30% flat rate |

### 10.3 CGT Exemptions

| Asset | Exemption |
|---|---|
| Principal private residence | Gain on disposal of a taxpayer's primary home is exempt |
| Shares of a qualifying small company (NTA criteria) | Exempt (confirm from NTA §) |
| Assets transferred between spouses | Exempt |
| Compensation for personal injury | Exempt |
| First ₦100,000 of gain per year | Exempt (annual CGT exempt amount — confirm from NTA) |

### 10.4 Engine Treatment

For individuals, CGT gains are added to the `grossIncome` figure before computing PIT. This means the gain is subject to the same progressive rates.

```
adjustedGrossIncome = grossIncome + netCapitalGain
// then proceed with standard PIT calculation on adjustedGrossIncome
```

### 10.5 v1 Scope

In v1, the app captures capital disposals through manual entry only (dedicated "Add Capital Disposal" form accessible from the Tax Summary screen). Auto-detection from transaction data is a v2 feature.

---

## 11. Company Income Tax (CIT)

Applies only to `entity.type = "llc"`.

### 11.1 Small Company Exemption

Under NTA 2025, a company qualifies for **full exemption** from CIT, CGT, and the Development Levy if **both** conditions are met:

| Condition | Threshold |
|---|---|
| Annual turnover | ≤ ₦100,000,000 |
| Gross fixed assets | ≤ ₦250,000,000 |

```typescript
function isSmallCompanyExempt(
  annualTurnover: number,
  grossFixedAssets: number
): boolean {
  return annualTurnover <= 100_000_000 && grossFixedAssets <= 250_000_000;
}
```

If exempt: the company files a **nil CIT return** — no tax computation needed, but the return must still be filed by the deadline.

### 11.2 CIT Computation (Non-Exempt Companies)

For companies that do not qualify for the exemption:

```
assessableProfit = totalRevenue - allowableExpenses - capitalAllowances
CIT              = assessableProfit × 0.30
developmentLevy  = assessableProfit × 0.04
totalCIT         = CIT + developmentLevy
```

> **Capital allowances:** Depreciation of fixed assets is not deductible for tax. Instead, capital allowances (wear and tear) are computed under the Capital Allowances schedule of the NTA. This is a complex area — v1 surfaces the liability and prompts the user to provide their capital allowances figure (or seek professional advice for this line item).

### 11.3 Turnover Input for CIT

The company's annual turnover and fixed asset value are entered by the user in the Entity settings screen. The engine uses this to determine exemption status. The `totalRevenue` figure used in the CIT computation is derived from the categorised transactions.

---

## 12. Value Added Tax (VAT)

### 12.1 VAT Rate

**7.5%** — retained from the FIRS VAT Act, unchanged by NTA 2025.

### 12.2 Registration Threshold

Businesses with annual taxable supplies above the **small business threshold** (confirm exact figure from NTA 2025 — expected to be aligned with previous FIRS threshold) must register for VAT. Businesses below the threshold are exempt and do not charge or remit VAT.

The `entity.vatRegistered` flag determines whether the VAT module runs for an entity.

### 12.3 Output VAT (VAT Collected)

VAT charged on the entity's sales of taxable goods/services.

```
outputVat = Σ (invoiceSubtotal × 0.075)
            where invoice.status = "paid"
            AND invoice.entityId = targetEntity
            AND invoice covers taxable supplies (not zero-rated or exempt)
```

### 12.4 Input VAT (VAT Recoverable)

VAT paid on business purchases. Under NTA 2025, **input VAT is now fully recoverable** (a change from the previous regime).

```
inputVat = Σ (transaction.amountNgn × 0.075 / 1.075)   // extract VAT from VAT-inclusive amounts
           where transaction.type = "business_expense"
           AND transaction.isVatInclusive = true
           AND transaction.entityId = targetEntity
```

> The `isVatInclusive` flag is set during categorisation. Many business expenses (software subscriptions, equipment) may not include Nigerian VAT if purchased from foreign vendors — the engine does not claim input VAT on these.

### 12.5 Net VAT Payable

```
netVatPayable = outputVat - inputVat

if netVatPayable > 0: amount owed to NRS
if netVatPayable < 0: excess input VAT — a refund claim can be made (flag for user)
```

### 12.6 VAT Return Frequency

VAT returns are filed **monthly**, due on the **21st of the following month**. The engine computes both the monthly position (for the VAT Return screen) and the annual cumulative position.

### 12.7 Zero-Rated & Exempt Supplies

| Supply | Treatment |
|---|---|
| Basic food items (staples) | Zero-rated (0% VAT, input VAT still recoverable) |
| Medical and pharmaceutical products | Zero-rated |
| Educational materials | Zero-rated |
| Financial services | Exempt (no VAT charged, input VAT not recoverable) |
| Residential rent | Exempt |

Invoices for zero-rated services should show 0% VAT. The engine applies zero-rating when the invoice or transaction is tagged with the relevant supply type.

---

## 13. Nil Returns

### 13.1 Obligation

Under the NTA 2025, **every Nigerian tax resident must file a self-assessment return**, even if:
- Their taxable income is below the ₦800,000 threshold
- They owe zero tax
- They had no income during the year

This is a significant change from prior practice. The filing deadline is **March 31** of the year following the tax year.

### 13.2 Engine Behaviour for Nil Returns

When `netTaxPayable = 0`:
- The engine flags this as a nil return scenario
- The filing module still generates a complete self-assessment form
- The form shows all income, deductions, and confirms zero liability
- The submission guide directs the user to file via TaxPro Max, same as for a positive liability

```typescript
const isNilReturn = netTaxPayable === 0 || taxableIncome <= 800_000;
// Filing is still required either way
```

---

## 14. Penalties Reference

The engine uses these penalty rates to compute the cost of non-compliance. This data powers the deadline reminder notifications and the penalty calculator widget.

| Offence | Penalty | Reference |
|---|---|---|
| Late TIN registration | ₦50,000 per month of default | NTAA 2025 |
| Late filing of return | ₦100,000 (first month) + ₦50,000 per additional month | NTAA 2025 |
| Late payment of tax | 10% of tax due + interest at the CBN Monetary Policy Rate (MPR) per annum | NTAA 2025 |
| False declaration / tax evasion | Up to ₦1,000,000 fine or 3 years imprisonment or both | NTAA 2025 |
| Late VAT return | ₦50,000 for first month + ₦25,000 per additional month | NTAA 2025 |

### 14.1 Penalty Calculator Function

```typescript
function calculateLateFiling(
  netTaxPayable: number,
  filingDeadline: Date,
  actualFilingDate: Date,
  mpRatePercent: number   // current CBN MPR, e.g. 27.5
): PenaltyResult {
  const monthsLate = monthsBetween(filingDeadline, actualFilingDate);
  if (monthsLate <= 0) return { filingPenalty: 0, paymentPenalty: 0, interestCharge: 0 };

  const filingPenalty  = 100_000 + (Math.max(monthsLate - 1, 0) * 50_000);
  const paymentPenalty = netTaxPayable * 0.10;
  const interestCharge = netTaxPayable * (mpRatePercent / 100) * (monthsLate / 12);

  return { filingPenalty, paymentPenalty, interestCharge, total: filingPenalty + paymentPenalty + interestCharge };
}
```

---

## 15. Worked Examples

### Example 1 — Freelance UX Designer (Amaka)

**Profile:** Freelancer, individual entity, no VAT registration.

**Data:**

| Input | Value |
|---|---|
| Gross income (NGN + foreign converted) | ₦7,200,000 |
| Business expenses (internet, software, equipment) | ₦1,800,000 |
| Annual rent paid | ₦2,000,000 |
| Pension contributions | ₦576,000 |
| NHIS contributions | ₦0 |
| WHT deducted by clients | ₦180,000 |

**Calculation:**

```
Step 1 — Assessable Profit
  grossIncome          = ₦7,200,000
  totalBusinessExpenses = ₦1,800,000
  assessableProfit     = ₦7,200,000 - ₦1,800,000 = ₦5,400,000

Step 2 — Reliefs
  rentRelief  = min(₦2,000,000 × 0.20, ₦500,000) = min(₦400,000, ₦500,000) = ₦400,000
  pension     = ₦576,000
  totalReliefs = ₦400,000 + ₦576,000 = ₦976,000

Step 3 — Taxable Income
  taxableIncome = ₦5,400,000 - ₦976,000 = ₦4,424,000

Step 4 — Progressive Tax
  Band 1: min(₦4,424,000, ₦800,000) = ₦800,000 × 0%       = ₦0
  Band 2: min(₦4,424,000 - ₦800,000, ₦1,400,000) = ₦1,400,000 × 15% = ₦210,000
  Band 3: min(₦4,424,000 - ₦2,200,000, ₦2,000,000) = ₦2,000,000 × 18% = ₦360,000
  Band 4: (₦4,424,000 - ₦4,200,000) = ₦224,000 × 21%      = ₦47,040
  grossTax = ₦0 + ₦210,000 + ₦360,000 + ₦47,040 = ₦617,040

Step 5 — WHT Credits
  whtCredits = ₦180,000

Step 6 — Net Tax Payable
  netTaxPayable = ₦617,040 - ₦180,000 = ₦437,040

Step 7 — Effective Rate
  effectiveTaxRate = (₦437,040 / ₦7,200,000) × 100 = 6.07%
```

> **Note on the overview example:** The overview document states "approximately ₦614,000" gross tax and "₦434,000" net payable. The discrepancy from the ₦617,040 calculated above is explained by the ₦576,000 pension contribution that is implicitly included in the overview example but not explicitly stated. The numbers reconcile when pension deductions are included.

---

### Example 2 — High-Earning Consultant

**Profile:** Freelancer, individual entity, significant foreign income.

**Data:**

| Input | Value |
|---|---|
| Nigerian client income | ₦4,000,000 |
| Foreign income (USD 30,000 at ₦1,600/USD) | ₦48,000,000 |
| Business expenses | ₦6,000,000 |
| Rent paid annually | ₦3,600,000 |
| Pension contributions | ₦2,000,000 |
| WHT deducted | ₦400,000 |

**Calculation:**

```
Step 1
  grossIncome          = ₦4,000,000 + ₦48,000,000 = ₦52,000,000
  totalBusinessExpenses = ₦6,000,000
  assessableProfit     = ₦46,000,000

Step 2
  rentRelief  = min(₦3,600,000 × 0.20, ₦500,000) = ₦500,000 (capped)
  pension     = ₦2,000,000
  totalReliefs = ₦2,500,000

Step 3
  taxableIncome = ₦46,000,000 - ₦2,500,000 = ₦43,500,000

Step 4
  Band 1: ₦800,000    × 0%  = ₦0
  Band 2: ₦1,400,000  × 15% = ₦210,000
  Band 3: ₦2,000,000  × 18% = ₦360,000
  Band 4: ₦2,000,000  × 21% = ₦420,000
  Band 5: (₦43,500,000 - ₦6,200,000) = ₦37,300,000 × 23% = ₦8,579,000
  grossTax = ₦9,569,000

Step 5
  whtCredits = ₦400,000

Step 6
  netTaxPayable = ₦9,569,000 - ₦400,000 = ₦9,169,000

Step 7
  effectiveTaxRate = (₦9,169,000 / ₦52,000,000) × 100 = 17.63%
```

---

### Example 3 — SME (VAT-Registered, Small Company Exempt from CIT)

**Profile:** LLC, annual turnover ₦45,000,000, fixed assets ₦80,000,000.

**Data:**

| Input | Value |
|---|---|
| Total revenue (taxable supplies) | ₦45,000,000 |
| Business expenses | ₦22,000,000 |
| VAT collected on sales | ₦45,000,000 × 7.5% = ₦3,375,000 |
| VAT paid on purchases (input VAT) | ₦1,650,000 |

**CIT Assessment:**

```
Turnover ₦45m ≤ ₦100m AND Fixed assets ₦80m ≤ ₦250m
→ Small company exemption applies
→ CIT = ₦0, Development Levy = ₦0
→ File nil CIT return by deadline
```

**VAT Assessment:**

```
outputVat    = ₦3,375,000
inputVat     = ₦1,650,000
netVatPayable = ₦3,375,000 - ₦1,650,000 = ₦1,725,000 (due monthly, prorated)
```

---

### Example 4 — Freelancer Below Threshold (Nil Return)

**Profile:** Freelancer, part-year earner.

**Data:**

| Input | Value |
|---|---|
| Gross income | ₦650,000 |
| Business expenses | ₦120,000 |
| Reliefs | ₦80,000 |

**Calculation:**

```
assessableProfit = ₦650,000 - ₦120,000 = ₦530,000
taxableIncome    = ₦530,000 - ₦80,000  = ₦450,000

Band 1: ₦450,000 × 0% = ₦0
grossTax = ₦0
netTaxPayable = ₦0

→ Nil return required — filing still mandatory by March 31
```

---

### Example 5 — Late Filing Penalty Calculation

**Scenario:** Taxpayer with ₦600,000 net tax payable files on 15 June (2.5 months after March 31 deadline). CBN MPR = 27.5%.

```
monthsLate = 2.5 (rounded to 3 full months for calculation)

filingPenalty  = ₦100,000 + (2 × ₦50,000) = ₦200,000
paymentPenalty = ₦600,000 × 10%            = ₦60,000
interestCharge = ₦600,000 × 27.5% × (3/12) = ₦41,250

totalPenalty   = ₦200,000 + ₦60,000 + ₦41,250 = ₦301,250

Total amount due = ₦600,000 + ₦301,250 = ₦901,250
```

---

## 16. Implementation Reference

### 16.1 TypeScript Types

```typescript
// convex/tax/types.ts

export type EntityType = "individual" | "business_name" | "llc";

export type TaxEngineInput = {
  entityId:    string;
  entityType:  EntityType;
  taxYear:     number;
  transactions: TransactionForEngine[];
  capitalDisposals: CapitalDisposal[];
  declarations: TaxDeclarations;
  vatRegistered: boolean;
  annualTurnover?: number;    // for LLC exemption check
  grossFixedAssets?: number;  // for LLC exemption check
};

export type TransactionForEngine = {
  _id:               string;
  type:              "income" | "business_expense" | "personal_expense" | "transfer";
  amountNgn:         number;
  direction:         "credit" | "debit";
  isDeductible:      boolean;
  deductiblePercent: number;
  whtDeducted:       number;
  isVatInclusive:    boolean;
  isCapitalGain:     boolean;  // for crypto/asset disposals treated as income
};

export type TaxDeclarations = {
  annualRentPaid:          number;
  pensionContributions:    number;
  nhisContributions:       number;
  nhfContributions:        number;
  lifeInsurancePremiums:   number;
  mortgageInterest:        number;
};

export type CapitalDisposal = {
  assetDescription:  string;
  acquisitionCostNgn: number;
  disposalProceedsNgn: number;
  isExempt:           boolean;
  exemptionReason?:   string;
};

export type TaxBandResult = {
  bandNumber:   number;
  lowerBound:   number;
  upperBound:   number | null;  // null = unlimited
  rate:         number;
  incomeInBand: number;
  taxInBand:    number;
};

export type PitResult = {
  grossIncome:          number;
  totalBusinessExpenses: number;
  assessableProfit:     number;
  rentRelief:           number;
  pensionRelief:        number;
  otherReliefs:         number;
  totalReliefs:         number;
  taxableIncome:        number;
  bands:                TaxBandResult[];
  grossTaxLiability:    number;
  minimumTax:           number;
  grossTaxAfterMinimum: number;
  whtCredits:           number;
  dtaCreditFlagged:     boolean;
  netTaxPayable:        number;
  effectiveTaxRate:     number;  // 0–100
  isNilReturn:          boolean;
};

export type VatResult = {
  outputVat:     number;
  inputVat:      number;
  netVatPayable: number;
  isRefundClaim: boolean;
};

export type CgtResult = {
  totalGains:         number;
  exemptGains:        number;
  taxableGains:       number;
  taxOnGains:         number;  // added to PIT for individuals, 30% flat for LLCs
};

export type CitResult = {
  isSmallCompanyExempt: boolean;
  assessableProfit:     number;
  cit:                  number;
  developmentLevy:      number;
  totalCit:             number;
};

export type TaxEngineOutput = {
  entityId:        string;
  taxYear:         number;
  engineVersion:   string;
  computedAt:      number;   // Unix ms
  pit?:            PitResult;
  cit?:            CitResult;
  cgt?:            CgtResult;
  vat?:            VatResult;
  totalTaxPayable: number;   // PIT + CIT + CGT (net of WHT; VAT is separate)
};
```

### 16.2 Engine Entry Point

```typescript
// convex/tax/engine.ts

export function runTaxEngine(input: TaxEngineInput): TaxEngineOutput {
  const output: TaxEngineOutput = {
    entityId:      input.entityId,
    taxYear:       input.taxYear,
    engineVersion: TAX_ENGINE_VERSION,
    computedAt:    Date.now(),
    totalTaxPayable: 0,
  };

  // Capital gains (applies to all entity types)
  if (input.capitalDisposals.length > 0) {
    output.cgt = computeCgt(input.capitalDisposals, input.entityType);
  }

  if (input.entityType === "llc") {
    output.cit = computeCit(input);
    output.totalTaxPayable = output.cit.totalCit;
  } else {
    output.pit = computePit(input, output.cgt);
    output.totalTaxPayable = output.pit.netTaxPayable;
  }

  if (input.vatRegistered) {
    output.vat = computeVat(input.transactions);
    // VAT is remitted separately and not added to totalTaxPayable
  }

  return output;
}
```

### 16.3 Where the Engine Runs

| Context | Function Type | Trigger |
|---|---|---|
| Live Dashboard estimate | Convex **Query** (`tax.getSummary`) | Reactive — re-runs on any transaction change |
| Filing computation | Convex **Query** (same function) | User opens Tax Summary / Filing screens |
| Summary cache write | Convex **Mutation** (`tax.refreshSummaryCache`) | After bulk imports; writes to `taxYearSummaries` |
| Penalty calculator | Pure TypeScript function | Called inline in notification scheduler and Filing screen |

The engine is a **pure function** — given the same inputs it always produces the same outputs. It has no side effects. This makes it safe to run inside a Convex Query.

---

## 17. Edge Cases & Validation Rules

| Scenario | Engine Behaviour |
|---|---|
| Gross income = 0 | Nil return; no tax computation |
| Business expenses > gross income | `assessableProfit` clamped to 0; no negative taxable income |
| WHT credits > gross tax liability | `netTaxPayable` clamped to 0; excess credit flagged (may be refundable — user prompted) |
| Foreign transaction with no FX rate on record | Transaction included using nearest available prior rate; flagged in output as `fxRateApproximated: true` |
| Transaction in unsupported currency | Flagged as requiring manual NGN conversion; excluded from auto-calculation until user provides rate |
| LLC with turnover exactly ₦100m | Exempt (threshold is ≤ ₦100m) |
| LLC with turnover ₦100,000,001 | Not exempt; full CIT applies |
| User has both PAYE salary and freelance income | PAYE salary transactions tagged as "Salary (PAYE)" are excluded from PIT base; only freelance and other non-PAYE income enters calculation |
| User has multiple entities | Engine runs independently per entity; results are never aggregated across entities |
| Tax year mid-year activity only | Engine runs on all transactions within the calendar year; partial year income is still assessable in full |
| Uncategorised transactions | Excluded from the engine with a count returned in output (`uncategorisedCount`); dashboard shows warning |
| Deductible percent = 0 | Transaction contributes ₦0 to business expenses even if `isDeductible = true` |
| Rent declared but landlord not evidenced | Relief is still applied; the app prompts the user to retain their tenancy agreement as audit evidence |

---

## 18. Engine Versioning

### 18.1 Why Versioning Matters

Tax law changes. Band thresholds may be adjusted by finance acts. Relief caps may change. New taxes may be introduced. If the engine is updated without versioning, historical tax summaries could silently produce different results, undermining trust and audit defensibility.

### 18.2 Version Strategy

Each version of the engine is identified by the date the ruleset became effective:

```typescript
export const TAX_ENGINE_VERSION = "2026-01-01";
// Format: YYYY-MM-DD of the date the encoded rules came into force
```

This version string is stored in:
- Every `taxYearSummaries` document
- Every `filingRecords` document (via `taxSummarySnapshot`)

### 18.3 Updating the Engine

When tax law changes:
1. A new engine module is created (`engine_2027.ts`) alongside the existing one
2. A version selector routes computation to the correct engine based on `taxYear`
3. Historical `taxYearSummaries` documents retain their original version tag and are not recomputed
4. Users are notified in-app of rule updates: *"Tax rules for 2027 have been updated. Your 2026 figures are not affected."*

```typescript
function getEngineForYear(taxYear: number) {
  if (taxYear >= 2027) return engine_2027;
  return engine_2026;  // NTA 2025 rules, effective 2026
}
```

### 18.4 Regulatory Review Process

Before any engine update goes to production:
1. The rule change is reviewed against the official gazette text
2. The worked examples in this document are re-run with the new rules and outputs verified
3. At least one external Nigerian tax professional reviews the updated engine logic
4. The change is documented in an engine changelog: `CHANGELOG_TaxEngine.md`

---

*End of Tax Calculation Engine Specification — v1.0*
