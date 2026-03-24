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

**Indexes:** `by_entityId_taxYear`, `by_entityId_month`, `by_transactionId`

### 4.3 `transactions` table
Add one optional boolean flag — no new transaction type:

```ts
isSalaryIncome: v.optional(v.boolean())
```

Salary credits remain `type: 'income'`. The flag tells the tax engine to pull gross figures from `employmentIncomeRecords` instead of the transaction amount.

### 4.4 Tax engine — input/output additions

**`TaxEngineInput`** new fields:
```ts
employmentIncomeRecords?: EmploymentIncomeRecord[]  // confirmed records only
payeCreditsManual?: number  // fallback: user-entered annual PAYE total in kobo
```

**`TaxEngineOutput`** new fields:
```ts
totalEmploymentIncome: number  // sum of grossSalary across confirmed records (kobo)
payeCredits: number            // sum of payeDeducted across confirmed records (kobo)
```

**Net payable formula (updated):**
```
netTaxPayable = max(0, grossTaxPayable − whtCredits − payeCredits)
```

**Gross income calculation (updated):**
When confirmed employment records exist, their `grossSalary` totals replace the `amountNgn` of linked `isSalaryIncome` transactions in `totalGrossIncome`. Unlinked salary transactions (no matching confirmed record) continue to contribute their `amountNgn` as a conservative fallback.

---

## 5. Salary Detection Algorithm

Runs as a Convex Action triggered:
1. After any bank import completes (post-processing hook in `importPipeline.ts`)
2. When a user manually categorizes a transaction as salary income (triggers cascade)
3. On-demand when a salary earner first connects an account

### 5.1 Grouping
- Take all `income` / uncategorised credit transactions not yet flagged `isSalaryIncome`
- Normalise description: strip dates, amounts, reference numbers, bank prefixes (`NIP/`, `FT-`, `NIBSS/`), trailing alphanumeric codes (6+ chars)
- Group by `(canonicalDescription, approximateAmount ± 20%)`

### 5.2 Pattern Scoring

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

### 5.3 Record Creation
For each HIGH/MEDIUM match, create one `employmentIncomeRecord` per month:
- `source: 'detected'`, `status: 'pending'`
- `grossSalary` = `transaction.amountNgn` (placeholder — user corrects to true gross)
- `payeDeducted` = 0 (user must fill in from payslip)
- `transactionId` = linked transaction `_id`
- Flag transaction: `isSalaryIncome = true`

### 5.4 Cascade Categorisation
When user confirms or manually marks any transaction as salary:
1. Find all transactions with matching canonical description within ±20% amount in the same tax year
2. Auto-flag those as `isSalaryIncome = true`
3. Create pending `employmentIncomeRecord` for each
4. Show single confirmation: *"We found 8 similar transactions. Marked them all as salary income from [Employer]. Review?"*

### 5.5 Employer Name Extraction
- Strip known bank prefixes and reference codes from canonical description
- Title-case the remainder → `employerName` placeholder
- User can edit during confirmation

### 5.6 "Skip for now" behaviour
If user dismisses the PAYE prompt, records are confirmed with:
- `grossSalary` = detected net amount (conservative — slightly undercounts, never overcounts)
- `payeDeducted` = 0 (user pays more net tax, incentivising correction)

---

## 6. Onboarding Flow

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
- "Skip for now" → set up later from Settings

### Entity creation
End of onboarding creates a `type: 'individual'` entity (same as freelancer path). The `userType: 'salary_earner'` on the user record drives the tailored experience. A salary earner can add a `business_name` entity later via the existing multi-entity flow — unchanged.

---

## 7. Frontend Screens

### 7.1 New: Payslip Entry screen
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

### 7.2 Modified: Dashboard
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

### 7.3 Modified: Tax Summary screen
New PAYE credits line in the tax breakdown:

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
Less: PAYE credits              (₦XXX,XXX)    ← new
──────────────────────────────────────────
Net tax payable                 ₦XXX,XXX
```

### 7.4 Modified: Filing pre-flight checklist
New salary-specific check:

```
⚠  Payslip details incomplete
   3 months have no PAYE data. Your tax may be overstated.
   [Complete payslip details]  [File anyway]
```

### 7.5 New: Employment Income list screen
Accessible from the main navigation for salary earner users. Shows a list of `employmentIncomeRecords` grouped by employer and year, with month-by-month status indicators (confirmed / pending / missing). Entry point for editing or adding payslip records manually.

---

## 8. Tax Engine Changes (summary)

- `payeCredits` is a first-class output field, distinct from `whtCredits`
- Tax summary and filing PDF show PAYE credits as a separate line item
- Engine version bumped to `1.3.0` on release
- Historical summaries computed under `1.2.0` are unaffected (existing versioning contract)

---

## 9. Out of Scope (this iteration)

- Multi-employer support (multiple employers in the same tax year) — data model supports it (multiple records per `taxYear`), but the detection and UI are scoped to a single primary employer for now
- Employer-side features (payroll generation, P60 generation) — TaxEase targets the employee
- PAYE refund claims — the engine computes overpayment but the filing guidance for refund claims is deferred
- State IRS-specific salary tax rules — national NTA 2025 rates only

---

## 10. Open Questions (for implementation)

1. Should `pensionDeducted`, `nhisDeducted`, `nhfDeducted` from payslip records automatically populate the corresponding `taxDeclarations` relief fields, or should they remain separate? (Risk of double-counting if user also fills in the declarations screen.)
2. What happens when a salary earner has employment records from two employers in the same tax year (job change)? Detection and cascade logic should handle this but needs an explicit test case.
3. Engine version bump strategy: bump to `1.3.0` immediately on merge, or only when the first salary earner files?
