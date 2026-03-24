# Salary Earner Support — Design Spec

**Date:** 2026-03-24
**Status:** Approved
**Author:** Claude Code (brainstorming session)

---

## 1. Overview

Add a third user segment — **Salary Earner** — to TaxEase Nigeria. Salary earners are Nigerian residents whose primary income is from employment (PAYE). They may also have side income (freelance, rental, investment). Under NTA 2025, they are still required to file annual self-assessment returns regardless of whether additional tax is owed.

The feature adds dedicated payslip entry, smart salary detection from bank transactions, PAYE credit tracking, and a tailored onboarding and dashboard experience — while reusing the existing PIT tax engine and transaction infrastructure.

---

## 2. User Segment Definition

**Salary Earner (`userType: 'salary_earner'`):**
- Employed full-time, part-time, or on contract
- Primary income is a regular salary from one or more employers
- May also have side income (freelance, rental, investments)
- Employer deducts PAYE monthly and remits to FIRS
- Must file annual self-assessment to reconcile PAYE deducted vs. actual PIT liability
- Entitled to the same personal reliefs as freelancers (rent, pension, NHIS, NHF, life insurance, mortgage)

A salary earner with side income uses the full transaction tracking features (existing flow). A salary-only earner gets a simplified view focused on payslip data and reliefs.

---

## 3. Architecture Approach

**Approach C — Linked Employment Income Records** (chosen)

Employment income records are explicitly linked to detected salary transactions via a `transactionId` foreign key. The transaction is the bank evidence (net salary after employer deductions); the linked employment record enriches it with gross salary and PAYE deducted.

Key principle: the tax engine uses **gross salary from employment records**, not transaction amounts, to avoid double-counting gross vs. net salary.

---

## 4. Schema Changes

### 4.1 `users` table
Add `'salary_earner'` to the `userType` union:

```ts
userType: v.optional(v.union(
  v.literal('freelancer'),
  v.literal('sme'),
  v.literal('salary_earner')   // NEW
))
```

### 4.2 New `employmentIncomeRecords` table

One record per employer per month per tax year. Stores payslip data and links to the detected bank transaction.

| Field | Type | Description |
|---|---|---|
| `entityId` | `id('entities')` | Owning entity (always `individual` type) |
| `userId` | `id('users')` | Owning user |
| `taxYear` | `number` | Tax year (e.g. 2026) |
| `month` | `number` | Calendar month 1–12 |
| `employerName` | `string` | Employer name (user-editable) |
| `grossSalary` | `number` | Gross monthly salary in kobo (authoritative for tax engine) |
| `payeDeducted` | `number` | PAYE deducted by employer this month, in kobo |
| `pensionDeducted` | `number?` | Pension deducted at source, in kobo |
| `nhisDeducted` | `number?` | NHIS deducted at source, in kobo |
| `nhfDeducted` | `number?` | NHF deducted at source, in kobo |
| `netSalary` | `number?` | Gross minus all deductions (for reconciliation), in kobo |
| `transactionId` | `id('transactions')?` | Linked bank credit evidence |
| `source` | `'payslip' \| 'detected' \| 'manual'` | How the record was created |
| `status` | `'pending' \| 'confirmed' \| 'rejected'` | Confirmation state |
| `createdAt` | `number` | Unix ms |
| `updatedAt` | `number` | Unix ms |

**Indexes:** `by_entityId_taxYear`, `by_entityId_month`, `by_transactionId`, `by_userId_taxYear`

### 4.3 `transactions` table
Add one optional boolean flag — no new transaction type:

```ts
isSalaryIncome: v.optional(v.boolean())
```

Salary credits remain `type: 'income'`. The flag tells the tax engine caller to exclude these transactions from the standard income sum and use `grossSalary` from confirmed `employmentIncomeRecords` instead.

### 4.4 `taxYearSummaries` table
Add two optional fields for backward compatibility with pre-1.3.0 cached summaries:

```ts
payeCredits: v.optional(v.number()),           // NEW — PAYE deducted by employer, in kobo
totalEmploymentIncome: v.optional(v.number()), // NEW — sum of grossSalary from confirmed records, in kobo
```

### 4.5 Tax engine — input/output additions

**`TaxEngineInput`** new fields:
```ts
employmentIncomeRecords?: EmploymentIncomeRecord[]  // confirmed records only
payeCreditsManual?: number  // fallback: user-entered annual PAYE total in kobo
```

**`TaxEngineTransaction`** new field (mirrors transactions table flag):
```ts
isSalaryIncome?: boolean
```

**`TaxEngineOutput`** new fields:
```ts
totalEmploymentIncome: number  // sum of grossSalary across confirmed records (kobo)
payeCredits: number            // sum of payeDeducted across confirmed records (kobo)
```

**Gross income calculation (updated):**

The engine caller (Convex query in `tax.ts`) applies the following exclusion rule before calling the engine:

- **Exclude** from the `transactions` array: any transaction where `isSalaryIncome === true` **AND** a confirmed `employmentIncomeRecord` exists for that transaction's month/employer (i.e. `transactionId` matches a confirmed record)
- **Include** in the `transactions` array: any transaction where `isSalaryIncome === true` but **no** confirmed record is linked (no `transactionId` match) — these contribute their `amountNgn` as a conservative fallback until the user enters payslip details

This single rule replaces the ambiguous "exclude flagged / include unlinked" distinction. The caller inspects the `transactionId` linkage to determine inclusion.

Inside the engine, Step 3 becomes:
```
incomeFromTransactions = sum of non-excluded income transactions (includes unlinked salary fallback)
totalEmploymentIncome  = sum(employmentIncomeRecords.grossSalary)  [confirmed only]
grossIncome            = incomeFromTransactions + totalEmploymentIncome + cgGains (for individuals)
```

**PAYE credits formula (updated — PIT only):**

PAYE credits offset only the PIT component (`grossTaxPayable`), consistent with NTA 2025. They do not reduce CGT, CIT, or VAT. This replaces Step 11 in the existing engine:

```
// Step 11 (updated):
netTaxPayable = max(0, grossTaxPayable − whtCredits − payeCredits)

// Step 15 unchanged:
totalTaxPayable = netTaxPayable + cgtPayable + citPayable + vatPayable
```

**PAYE credits precedence rule:** `payeCredits` is computed as:
- `sum(employmentIncomeRecords.payeDeducted)` for all confirmed records, **if any confirmed records exist for the tax year**
- `payeCreditsManual` only when **zero** confirmed employment records exist for the tax year

If both are present (some confirmed records + a manual figure), `payeCreditsManual` is ignored entirely to prevent double-counting.

**Minimum tax interaction:**

Minimum tax (0.5% of gross income, §5.5 of existing engine) is computed at Step 9 against `grossTaxPayable` **before** PAYE credits are applied. PAYE credits are a withholding mechanism, not an expense deduction — they do not reduce the minimum tax floor. This is consistent with NTA 2025.

**Effective tax rate (updated):**

`effectiveTaxRate` is redefined as `totalTaxPayable / totalGrossIncome` (using total tax including CGT/CIT/VAT, not just net PIT). This ensures the displayed rate is not misleadingly zero for salary earners whose full PIT is covered by PAYE but who owe CGT or VAT.

---

## 5. Relief Double-Counting Resolution

Pension, NHIS, and NHF deducted at source by the employer (stored in `employmentIncomeRecords`) must not be counted again via the `taxDeclarations` relief fields.

**Resolution — Payslip records take priority (Option A):**

When the tax engine caller detects confirmed `employmentIncomeRecords` for a tax year, it:
1. Sums `pensionDeducted`, `nhisDeducted`, `nhfDeducted` across all confirmed records for that year
2. Passes these totals as the `pensionContributions`, `nhisContributions`, `nhfContributions` fields in `TaxEngineDeclarations`, **overriding** the `taxDeclarations` table values for those fields
3. Reliefs for rent, life insurance, and mortgage always come from `taxDeclarations` (employer does not deduct these)

**UI enforcement:**
On the Declarations screen, when confirmed payslip records exist for the current tax year, the Pension, NHIS, and NHF fields display a lock indicator:

```
Pension contributions    ₦XXX,XXX  [From payslip — edit in Employment Income]
```

The fields are read-only. The user is directed to the Payslip Entry screen to change these values. This prevents silent double-counting regardless of entry order.

---

## 6. Salary Detection Algorithm

Runs as a Convex Action triggered:
1. After any bank import completes (post-processing hook in `importPipeline.ts`)
2. When a user manually categorizes a transaction as salary income (triggers cascade)
3. On-demand when a salary earner first connects an account

### 6.1 Grouping
- Take all `income` / uncategorised credit transactions not yet flagged `isSalaryIncome`, **within the same `taxYear`**
- Normalise description: strip dates, amounts, reference numbers, bank prefixes (`NIP/`, `FT-`, `NIBSS/`), trailing alphanumeric codes (6+ chars)
- Group by `(canonicalDescription, approximateAmount ± 20%)`
- Each distinct canonical description cluster is treated as a separate employer

### 6.2 Pattern Scoring

| Condition | Points |
|---|---|
| Appears in 3+ different calendar months | +3 |
| Amount variance < 10% across occurrences | +2 |
| Amount variance 10–20% across occurrences | +1 |
| Description contains salary keyword (`SALARY`, `PAYROLL`, `WAGES`, `EMOLUMENT`, `STAFF PAY`) | +2 |
| Credits land within ±5 days of same day each month | +1 |

**Thresholds:**
- Score ≥ 5 → **HIGH CONFIDENCE** — auto-flag, create pending records, notify user
- Score 3–4 → **MEDIUM** — prompt user: "Is this your salary?"
- Score < 3 → no action

### 6.3 Record Creation
For each HIGH/MEDIUM match, create one `employmentIncomeRecord` per month (per canonical description cluster):
- `source: 'detected'`, `status: 'pending'`
- `grossSalary` = `transaction.amountNgn` (placeholder — user corrects to true gross)
- `payeDeducted` = 0 (user must fill in from payslip)
- `transactionId` = linked transaction `_id`
- Flag transaction: `isSalaryIncome = true`

Each distinct canonical description cluster gets its own `employerName` placeholder (see §6.5), allowing multi-employer job-change scenarios to produce separate record sets even within the same tax year.

### 6.4 Cascade Categorisation
When user confirms or manually marks any transaction as salary:
1. Find all transactions with matching canonical description within ±20% amount **in the same tax year**
2. Auto-flag those as `isSalaryIncome = true`
3. Create pending `employmentIncomeRecord` for each (grouped by canonical description cluster)
4. Show single confirmation per cluster: *"We found 8 similar transactions. Marked them all as salary income from [Employer]. Review?"*

Each cluster produces a separate confirmation card so users can distinguish between two employers with different description patterns.

### 6.5 Employer Name Extraction
- Strip known bank prefixes and reference codes from canonical description
- Title-case the remainder → `employerName` placeholder
- User can edit during confirmation

### 6.6 "Skip for now" behaviour
If user dismisses the PAYE prompt, records are confirmed with:
- `grossSalary` = detected net amount (net salary is lower than true gross — income is understated)
- `payeDeducted` = 0 (no PAYE credits applied)

**UI indicator for approximated gross:** When a confirmed record has `source: 'detected'` and `payeDeducted === 0`, a persistent warning appears on both the Tax Summary screen and the filing pre-flight checklist:

```
⚠  Salary figures are estimated (payslip not entered)
   Your tax estimate may be understated. Enter payslip details for accuracy.
   [Complete payslip details]
```

---

## 7. Onboarding Flow

### Step 1 — User type selection (modified)
Three options instead of two:

- **Freelancer / Independent Professional** — consulting fees, project income, gig work
- **Salary Earner** — employed full-time or part-time; may also have side income
- **Business Owner / SME** — registered business name or limited company

### Step 2 — Personal details (unchanged)
Full name, NIN, preferred currency.

### Step 3 — Employment details (new, salary earner path only)
- Employer name (text input)
- Job title (optional)
- Employment type: Full-time / Part-time / Contract
- "Do you also earn income from other sources?" Yes / No
  - Yes → unlocks full transaction tracking (existing freelancer features)
  - No → simplified view focused on salary + reliefs

### Step 4 — Initial salary setup (new)
- "Enter payslip details now" → Payslip Entry screen for most recent month
- "Detect from bank statements" → proceeds to account connection / statement import; detection runs after first import
- "Skip for now" → set up later from Settings → Employment Income

### Entity creation
End of onboarding creates a `type: 'individual'` entity (same as freelancer path). The `userType: 'salary_earner'` on the user record drives the tailored experience. A salary earner can add a `business_name` entity later via the existing multi-entity flow — unchanged.

### `userType` change post-onboarding
If a user changes `userType` from `freelancer` to `salary_earner` in Settings, no existing transactions or `taxDeclarations` records are invalidated. The salary-specific screens become available immediately. The relief lock-out logic (§5) only activates once confirmed `employmentIncomeRecords` exist.

---

## 8. Frontend Screens

### 8.1 New: Payslip Entry screen
Accessible from: onboarding, detection prompt card, Settings → Employment Income.

Fields:
- Employer name
- Month + Year selector
- Gross salary (₦)
- PAYE deducted (₦)
- Pension deducted at source (₦) — optional
- NHIS deducted at source (₦) — optional
- NHF deducted at source (₦) — optional
- Linked transaction indicator (shows matched bank credit for reconciliation)

Actions: **Save** | **Save & add next month** (advances month selector for rapid full-year entry)

### 8.2 Modified: Dashboard
For `salary_earner` users, the income card shows:

```
Employment Income      ₦X,XXX,XXX  (N months confirmed)
  PAYE credited        ₦XXX,XXX
Other Income           ₦XXX,XXX    (if side income exists)
Business Expenses      ₦XXX,XXX    (if side income exists)
──────────────────────
Estimated tax due      ₦XXX,XXX
```

A "Salary incomplete" warning badge appears if any completed month has a `pending` record or no record at all.

### 8.3 Modified: Tax Summary screen
New PAYE credits line. PAYE credits appear between WHT credits and net tax payable — PIT component only:

```
Gross income                    ₦X,XXX,XXX
  Employment income             ₦X,XXX,XXX
  Other income                  ₦XXX,XXX
Less: Business expenses         (₦XXX,XXX)    [if applicable]
Less: Personal reliefs          (₦XXX,XXX)
──────────────────────────────────────────
Taxable income                  ₦X,XXX,XXX
Tax on bands                    ₦XXX,XXX
Less: WHT credits               (₦XX,XXX)
Less: PAYE credits              (₦XXX,XXX)    ← new (PIT only)
──────────────────────────────────────────
Net PIT payable                 ₦XXX,XXX
CGT payable                     ₦XXX,XXX      [if applicable]
VAT payable                     ₦XXX,XXX      [if applicable]
──────────────────────────────────────────
Total tax payable               ₦XXX,XXX
```

### 8.4 Modified: Filing pre-flight checklist
Two new salary-specific checks:

```
⚠  Payslip details incomplete
   3 months have no PAYE data. Your tax may be overstated.
   [Complete payslip details]  [File anyway]

⚠  Salary figures are estimated
   Gross salary for 2 months is based on bank credit amount, not payslip.
   [Complete payslip details]  [File anyway]
```

### 8.5 New: Employment Income list screen
Accessible from the main navigation for salary earner users. Shows a list of `employmentIncomeRecords` grouped by employer and year, with month-by-month status indicators (confirmed / pending / missing). Entry point for editing or adding payslip records manually.

---

## 9. Tax Engine Changes (summary)

- `payeCredits` is a first-class output field, distinct from `whtCredits`
- PAYE credits offset PIT only (`grossTaxPayable`); CGT, CIT, VAT are unaffected
- Minimum tax is computed before PAYE credits (consistent with NTA 2025)
- Tax summary and filing PDF show PAYE credits as a separate line item
- `effectiveTaxRate` redefined as `totalTaxPayable / totalGrossIncome` (not PIT-only) so salary earners whose full PIT is covered by PAYE still see an accurate effective rate if CGT or VAT is owed
- Engine version bumped to `1.3.0` on release (bump immediately on merge)
- Historical summaries computed under `1.2.0` are unaffected (existing versioning contract)

---

## 10. Out of Scope (this iteration)

- Multi-employer aggregation views — the data model, detection, and Employment Income list screen (§8.5) all support multiple employers (each cluster shown separately). What is out of scope is a combined cross-employer payslip summary view or any employer-comparison analytics
- Employer-side features (payroll generation, P60 generation) — TaxEase targets the employee
- PAYE refund claims — the engine computes overpayment but the filing guidance for refund claims is deferred
- State IRS-specific salary tax rules — national NTA 2025 rates only

---

## 11. Required Test Cases

1. Pure salary earner, all 12 months confirmed with payslip data — tax summary shows correct gross, PAYE credits, net payable
2. Mixed-income earner — salary + freelance transactions coexist; gross income sums correctly without double-counting net salary
3. Salary earner who skips PAYE entry — "Skip for now" uses net as gross; UI warning displays; estimated tax is understated (income is underreported, no PAYE credits applied; net effect is typically lower than true liability)
4. Job change mid-year — two employers, two canonical description clusters, two separate `employmentIncomeRecord` sets; detection does not merge them
5. Relief lock-out — confirmed payslip records with pension deducted; Declarations screen shows locked pension field; engine uses payslip figure not declarations
6. `userType` switch from `freelancer` → `salary_earner` — existing transactions and declarations unaffected; salary screens become available
7. Detection across two tax years in the same bank import — records created only within correct `taxYear` boundary
