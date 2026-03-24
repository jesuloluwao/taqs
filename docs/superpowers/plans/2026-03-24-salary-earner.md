# Salary Earner Support — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add salary earner support (PAYE tracking, payslip entry, salary detection) to TaxEase Nigeria so employed Nigerians can file annual self-assessment returns.

**Architecture:** A new `employmentIncomeRecords` Convex table links payslip data to detected salary transactions. The tax engine gains `payeCredits` and `totalEmploymentIncome` fields. A detection Action identifies recurring salary patterns in imported transactions. Frontend gets a new onboarding path, payslip entry screen, employment income list, and modified dashboard/tax summary/filing screens.

**Tech Stack:** Convex (schema, queries, mutations, actions), React + TypeScript (web frontend), PDFKit (filing PDF)

**Spec:** `docs/superpowers/specs/2026-03-24-salary-earner-design.md`

---

## File Map

### Backend (Convex)

| File | Action | Purpose |
|---|---|---|
| `convex/schema.ts` | Modify | Add `employmentIncomeRecords` table, `isSalaryIncome` flag on transactions, `salary_earner` userType, `payeCredits`/`totalEmploymentIncome` on taxYearSummaries |
| `convex/taxEngine.ts` | Modify | Add `EmploymentIncomeRecord` type, `payeCredits`/`totalEmploymentIncome` to input/output, update Step 3 (gross income), Step 11 (net payable), Step 16 (effective rate), bump version to 1.3.0 |
| `convex/tax.ts` | Modify | Fetch employment records, apply exclusion rule for linked salary transactions, pass records + overridden relief declarations to engine, update summary cache fields |
| `convex/employmentIncome.ts` | Create | CRUD queries/mutations for `employmentIncomeRecords` (list, get, createOrUpdate, confirm, reject, delete) |
| `convex/salaryDetection.ts` | Create | Detection Action: description normalisation, grouping, scoring, record creation, cascade categorisation |
| `convex/onboarding.ts` | Modify | Add `saveUserType` accepting `'salary_earner'`, add `saveSalaryProfile` mutation |
| `convex/importPipeline.ts` | Modify | Add post-import hook to trigger salary detection |
| `convex/salaryDetectionHelpers.ts` | Create | Internal query/mutation helpers for detection (fetch transactions, create records, schedule detection) |
| `convex/lib/pdf/filingPdf.ts` | Modify | Add PAYE credits line and employment income breakdown to filing PDF |

### Frontend (React)

| File | Action | Purpose |
|---|---|---|
| `apps/web/src/pages/Onboarding.tsx` | Modify | Add salary earner type option, employment details step, initial salary setup step |
| `apps/web/src/pages/PayslipEntry.tsx` | Create | Payslip form: employer, month, gross salary, PAYE, pension/NHIS/NHF deducted, linked transaction indicator |
| `apps/web/src/pages/EmploymentIncome.tsx` | Create | Employment income list: month-by-month records grouped by employer, status indicators |
| `apps/web/src/pages/Dashboard.tsx` | Modify | Salary earner income card (employment income, PAYE credited, other income), incomplete badge |
| `apps/web/src/pages/TaxSummary.tsx` | Modify | Add PAYE credits line, employment vs other income split |
| `apps/web/src/pages/Declarations.tsx` | Modify | Lock pension/NHIS/NHF fields when confirmed payslip records exist |
| `apps/web/src/pages/Filing.tsx` | Modify | Add salary-specific pre-flight checks (payslip incomplete, estimated gross) |
| `apps/web/src/components/AppShell.tsx` | Modify | Add "Employment Income" nav item for salary earner users |
| `apps/web/src/App.tsx` | Modify | Add routes for PayslipEntry and EmploymentIncome pages |

---

## Task 1: Schema Changes

**Files:**
- Modify: `convex/schema.ts`

- [ ] **Step 1: Add `salary_earner` to `users.userType` union**

In `convex/schema.ts`, find the `userType` field in the `users` table (line 14) and add the new literal:

```ts
userType: v.optional(v.union(v.literal('freelancer'), v.literal('sme'), v.literal('salary_earner'))),
```

- [ ] **Step 2: Add `isSalaryIncome` flag to `transactions` table**

In the `transactions` table definition (after line 187, the `isVatInclusive` field), add:

```ts
/** Whether this transaction is detected/confirmed salary income */
isSalaryIncome: v.optional(v.boolean()),
```

- [ ] **Step 3: Add `employmentIncomeRecords` table**

Add the new table after the `capitalDisposals` table (after line 614):

```ts
/**
 * Employment income records — one per employer per month per tax year.
 * Links payslip data to detected salary transactions.
 */
employmentIncomeRecords: defineTable({
  entityId: v.id('entities'),
  userId: v.id('users'),
  taxYear: v.number(),
  month: v.number(),
  employerName: v.string(),
  /** Gross monthly salary in kobo — authoritative for tax engine */
  grossSalary: v.number(),
  /** PAYE deducted by employer this month, in kobo */
  payeDeducted: v.number(),
  /** Pension deducted at source by employer, in kobo */
  pensionDeducted: v.optional(v.number()),
  /** NHIS deducted at source, in kobo */
  nhisDeducted: v.optional(v.number()),
  /** NHF deducted at source, in kobo */
  nhfDeducted: v.optional(v.number()),
  /** Net salary (gross minus all deductions) for reconciliation, in kobo */
  netSalary: v.optional(v.number()),
  /** Linked salary transaction (bank credit evidence) */
  transactionId: v.optional(v.id('transactions')),
  source: v.union(v.literal('payslip'), v.literal('detected'), v.literal('manual')),
  status: v.union(v.literal('pending'), v.literal('confirmed'), v.literal('rejected')),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index('by_entityId_taxYear', ['entityId', 'taxYear'])
  .index('by_entityId_month', ['entityId', 'month'])
  .index('by_transactionId', ['transactionId'])
  .index('by_userId_taxYear', ['userId', 'taxYear']),
```

- [ ] **Step 4: Add `payeCredits` and `totalEmploymentIncome` to `taxYearSummaries`**

In the `taxYearSummaries` table, after the `isNilReturn` field (line 373), add:

```ts
/** PAYE deducted by employer, in kobo (v1.3.0+) */
payeCredits: v.optional(v.number()),
/** Total employment income (gross salary from confirmed records), in kobo (v1.3.0+) */
totalEmploymentIncome: v.optional(v.number()),
```

- [ ] **Step 5: Verify schema deploys**

Run: `npx convex dev` and confirm no schema validation errors.

- [ ] **Step 6: Commit**

```bash
git add convex/schema.ts
git commit -m "feat(schema): add employmentIncomeRecords table and salary earner fields"
```

---

## Task 2: Tax Engine — Types and PAYE Credits

**Files:**
- Modify: `convex/taxEngine.ts`

- [ ] **Step 1: Add `EmploymentIncomeRecord` type and update `TaxEngineTransaction`**

After the existing `TaxEngineDeclarations` interface (~line 89), add:

```ts
export interface EmploymentIncomeRecord {
  grossSalary: number;
  payeDeducted: number;
  pensionDeducted?: number;
  nhisDeducted?: number;
  nhfDeducted?: number;
}
```

Add to `TaxEngineTransaction` (after `isVatInclusive` field):

```ts
/** Whether this transaction is confirmed salary income (linked to an employment record) */
isSalaryIncome?: boolean;
```

- [ ] **Step 2: Update `TaxEngineInput` with employment fields**

Add to `TaxEngineInput` (after `grossFixedAssetsNgn`):

```ts
/** Confirmed employment income records for this tax year */
employmentIncomeRecords?: EmploymentIncomeRecord[];
/** Fallback: user-entered annual PAYE total in kobo (ignored if confirmed records exist) */
payeCreditsManual?: number;
```

- [ ] **Step 3: Update `TaxEngineOutput` with employment and PAYE fields**

Add to `TaxEngineOutput` (after `unsupportedCurrencies`):

```ts
/** Total employment income (gross salary from confirmed records), in kobo */
totalEmploymentIncome: number;
/** Total PAYE credits (sum of payeDeducted from confirmed records), in kobo */
payeCredits: number;
```

- [ ] **Step 4: Update `runTaxEngine` — Step 3 (gross income)**

Replace the existing gross income computation (lines 254–261) with:

```ts
// ------------------------------------------------------------------
// Step 3: Gross income
// Employment income: use grossSalary from confirmed records.
// Non-salary transactions with isSalaryIncome=true are excluded by
// the caller when a confirmed record exists for that transaction.
// ------------------------------------------------------------------
const employmentRecords = input.employmentIncomeRecords ?? [];
const totalEmploymentIncome = employmentRecords.reduce(
  (sum, r) => sum + r.grossSalary, 0
);

const incomeFromTransactions = transactions
  .filter((t) => t.type === 'income' || (t.type === 'uncategorised' && t.direction === 'credit'))
  .reduce((sum, t) => sum + t.amountNgn, 0);

const grossIncome =
  entityType === 'individual' || entityType === 'business_name'
    ? incomeFromTransactions + totalEmploymentIncome + cgGains
    : incomeFromTransactions + totalEmploymentIncome;
```

- [ ] **Step 5: Update `runTaxEngine` — Step 11 (net PIT payable with PAYE credits)**

Replace Step 11 (line 352) with:

```ts
// ------------------------------------------------------------------
// Step 10b: PAYE credits (from employment records or manual fallback)
// PAYE credits offset PIT only — not CGT, CIT, or VAT.
// Precedence: if any confirmed records exist, ignore payeCreditsManual.
// ------------------------------------------------------------------
const payeCredits = employmentRecords.length > 0
  ? employmentRecords.reduce((sum, r) => sum + r.payeDeducted, 0)
  : (input.payeCreditsManual ?? 0);

// ------------------------------------------------------------------
// Step 11: Net PIT payable after WHT + PAYE offset (clamp to 0)
// ------------------------------------------------------------------
const netTaxPayable = Math.max(0, grossTaxPayable - whtCredits - payeCredits);
```

- [ ] **Step 6: Update `runTaxEngine` — Step 16 (effective tax rate)**

Replace Step 16 (lines 388–389) with:

```ts
// ------------------------------------------------------------------
// Step 16: Effective tax rate (totalTaxPayable / grossIncome)
// Uses total tax (PIT+CGT+CIT+VAT), not just PIT, so salary earners
// whose full PIT is covered by PAYE still see an accurate rate.
// ------------------------------------------------------------------
const effectiveTaxRate =
  grossIncome > 0 ? Math.round((totalTaxPayable / grossIncome) * 10000) / 10000 : 0;
```

Note: `totalTaxPayable` is computed at Step 15, so move the effective rate computation AFTER Step 15. Currently Step 16 uses `netTaxPayable` — this changes to `totalTaxPayable`.

- [ ] **Step 7: Add new fields to return object and bump version**

Update the return object to include the new fields:

```ts
totalEmploymentIncome,
payeCredits,
```

Update `TAX_ENGINE_VERSION` at the top of the file:

```ts
export const TAX_ENGINE_VERSION = '1.3.0';
```

- [ ] **Step 8: Verify engine compiles**

Run: `npx convex dev` and confirm no type errors.

- [ ] **Step 9: Commit**

```bash
git add convex/taxEngine.ts
git commit -m "feat(taxEngine): add PAYE credits, employment income, update effective rate (v1.3.0)"
```

---

## Task 3: Tax Engine Caller — Exclusion Logic and Relief Override

**Files:**
- Modify: `convex/tax.ts`

- [ ] **Step 1: Import `EmploymentIncomeRecord` from taxEngine**

Add to the import statement at line 18:

```ts
import {
  runTaxEngine,
  getEngineForYear,
  TaxEngineTransaction,
  TaxEngineCapitalDisposal,
  EmploymentIncomeRecord,
} from './taxEngine';
```

- [ ] **Step 2: Update `getSummary` handler — fetch employment records**

After the `rawTransactions` fetch (line 57), add:

```ts
// ---- Fetch confirmed employment income records ----
const rawEmploymentRecords = await ctx.db
  .query('employmentIncomeRecords')
  .withIndex('by_entityId_taxYear', (q) =>
    q.eq('entityId', args.entityId).eq('taxYear', args.taxYear)
  )
  .collect();

const confirmedEmploymentRecords = rawEmploymentRecords.filter(
  (r) => r.status === 'confirmed'
);

// Build a set of transactionIds linked to confirmed records
const linkedTransactionIds = new Set(
  confirmedEmploymentRecords
    .filter((r) => r.transactionId)
    .map((r) => r.transactionId!.toString())
);
```

- [ ] **Step 3: Update transaction mapping — apply exclusion rule**

Replace the transaction mapping (lines 59–68) with:

```ts
// Exclude salary transactions that have a confirmed employment record linked.
// Unlinked salary transactions (no confirmed record) are kept as conservative fallback.
const filteredTransactions = rawTransactions.filter(
  (t) => !(t.isSalaryIncome && linkedTransactionIds.has(t._id.toString()))
);

const transactions: TaxEngineTransaction[] = filteredTransactions.map((t) => ({
  type:              t.type,
  direction:         t.direction,
  amountNgn:         t.amountNgn,
  currency:          t.currency,
  isDeductible:      t.isDeductible,
  deductiblePercent: t.deductiblePercent,
  whtDeducted:       t.whtDeducted,
  isVatInclusive:    (t as any).isVatInclusive,
  isSalaryIncome:    t.isSalaryIncome,
}));
```

- [ ] **Step 4: Build employment income records and relief override for engine**

After the `capitalDisposals` mapping, add:

```ts
// ---- Build employment records for engine ----
const employmentIncomeRecords: EmploymentIncomeRecord[] =
  confirmedEmploymentRecords.map((r) => ({
    grossSalary:      r.grossSalary,
    payeDeducted:     r.payeDeducted,
    pensionDeducted:  r.pensionDeducted,
    nhisDeducted:     r.nhisDeducted,
    nhfDeducted:      r.nhfDeducted,
  }));

// ---- Relief override: payslip records take priority for pension/NHIS/NHF ----
let declarations = declaration ?? null;
if (confirmedEmploymentRecords.length > 0 && declarations) {
  const pensionFromPayslip = confirmedEmploymentRecords.reduce(
    (sum, r) => sum + (r.pensionDeducted ?? 0), 0
  );
  const nhisFromPayslip = confirmedEmploymentRecords.reduce(
    (sum, r) => sum + (r.nhisDeducted ?? 0), 0
  );
  const nhfFromPayslip = confirmedEmploymentRecords.reduce(
    (sum, r) => sum + (r.nhfDeducted ?? 0), 0
  );
  // Override declarations with payslip totals (§5 of spec: prevent double-counting)
  // Always use payslip figure when confirmed records exist, even if zero.
  declarations = {
    ...declarations,
    pensionContributions: pensionFromPayslip,
    nhisContributions:    nhisFromPayslip,
    nhfContributions:     nhfFromPayslip,
  };
}
```

- [ ] **Step 5: Pass employment records to engine call**

Update the `runTaxEngine` call to include the new field:

```ts
const result = runTaxEngine({
  transactions,
  declarations,
  entityType:      entity.type,
  taxYear:         args.taxYear,
  capitalDisposals,
  isVatRegistered: entity.vatRegistered ?? false,
  outputVatNgn:    0,
  employmentIncomeRecords,
});
```

- [ ] **Step 6: Apply same changes to `refreshSummaryCache`**

Duplicate the same logic (fetch employment records, exclusion rule, relief override, pass to engine) in the `refreshSummaryCache` mutation handler. Also update `summaryFields` to include:

```ts
payeCredits:           result.payeCredits,
totalEmploymentIncome: result.totalEmploymentIncome,
```

- [ ] **Step 7: Verify compilation**

Run: `npx convex dev` — no errors.

- [ ] **Step 8: Commit**

```bash
git add convex/tax.ts
git commit -m "feat(tax): salary exclusion logic, relief override, PAYE credits in summary cache"
```

---

## Task 4: Employment Income CRUD

**Files:**
- Create: `convex/employmentIncome.ts`

- [ ] **Step 1: Create the CRUD module**

Create `convex/employmentIncome.ts`:

```ts
import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { getCurrentUser } from './auth';

// ---------------------------------------------------------------------------
// list — all records for entity+taxYear
// ---------------------------------------------------------------------------

export const list = query({
  args: {
    entityId: v.id('entities'),
    taxYear: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const entity = await ctx.db.get(args.entityId);
    if (!entity || entity.userId !== user._id || entity.deletedAt) return null;

    const records = await ctx.db
      .query('employmentIncomeRecords')
      .withIndex('by_entityId_taxYear', (q) =>
        q.eq('entityId', args.entityId).eq('taxYear', args.taxYear)
      )
      .collect();

    return records;
  },
});

// ---------------------------------------------------------------------------
// get — single record by ID
// ---------------------------------------------------------------------------

export const get = query({
  args: { id: v.id('employmentIncomeRecords') },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const record = await ctx.db.get(args.id);
    if (!record || record.userId !== user._id) return null;

    return record;
  },
});

// ---------------------------------------------------------------------------
// hasConfirmedRecords — check if confirmed payslip records exist for entity+taxYear
// Used by Declarations screen to lock pension/NHIS/NHF fields.
// ---------------------------------------------------------------------------

export const hasConfirmedRecords = query({
  args: {
    entityId: v.id('entities'),
    taxYear: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const records = await ctx.db
      .query('employmentIncomeRecords')
      .withIndex('by_entityId_taxYear', (q) =>
        q.eq('entityId', args.entityId).eq('taxYear', args.taxYear)
      )
      .collect();

    const confirmed = records.filter((r) => r.status === 'confirmed');
    if (confirmed.length === 0) return { hasRecords: false, totals: null };

    return {
      hasRecords: true,
      totals: {
        pension: confirmed.reduce((s, r) => s + (r.pensionDeducted ?? 0), 0),
        nhis: confirmed.reduce((s, r) => s + (r.nhisDeducted ?? 0), 0),
        nhf: confirmed.reduce((s, r) => s + (r.nhfDeducted ?? 0), 0),
      },
    };
  },
});

// ---------------------------------------------------------------------------
// createOrUpdate — upsert a payslip record for a specific employer+month+year
// ---------------------------------------------------------------------------

export const createOrUpdate = mutation({
  args: {
    entityId: v.id('entities'),
    taxYear: v.number(),
    month: v.number(),
    employerName: v.string(),
    grossSalary: v.number(),
    payeDeducted: v.number(),
    pensionDeducted: v.optional(v.number()),
    nhisDeducted: v.optional(v.number()),
    nhfDeducted: v.optional(v.number()),
    netSalary: v.optional(v.number()),
    transactionId: v.optional(v.id('transactions')),
    source: v.optional(v.union(v.literal('payslip'), v.literal('detected'), v.literal('manual'))),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    const entity = await ctx.db.get(args.entityId);
    if (!entity || entity.userId !== user._id || entity.deletedAt) {
      throw new Error('Entity not found or not authorised');
    }

    const now = Date.now();

    // Check for existing record for this employer+month+year
    const existing = await ctx.db
      .query('employmentIncomeRecords')
      .withIndex('by_entityId_taxYear', (q) =>
        q.eq('entityId', args.entityId).eq('taxYear', args.taxYear)
      )
      .collect();

    const match = existing.find(
      (r) => r.month === args.month && r.employerName === args.employerName
    );

    const fields = {
      grossSalary: args.grossSalary,
      payeDeducted: args.payeDeducted,
      pensionDeducted: args.pensionDeducted,
      nhisDeducted: args.nhisDeducted,
      nhfDeducted: args.nhfDeducted,
      netSalary: args.netSalary,
      transactionId: args.transactionId,
      updatedAt: now,
    };

    if (match) {
      await ctx.db.patch(match._id, fields);
      return match._id;
    }

    return await ctx.db.insert('employmentIncomeRecords', {
      entityId: args.entityId,
      userId: user._id,
      taxYear: args.taxYear,
      month: args.month,
      employerName: args.employerName,
      source: args.source ?? 'payslip',
      status: 'confirmed',
      ...fields,
      createdAt: now,
    });
  },
});

// ---------------------------------------------------------------------------
// confirm — confirm a pending record
// ---------------------------------------------------------------------------

export const confirm = mutation({
  args: { id: v.id('employmentIncomeRecords') },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    const record = await ctx.db.get(args.id);
    if (!record || record.userId !== user._id) {
      throw new Error('Record not found or not authorised');
    }

    await ctx.db.patch(args.id, { status: 'confirmed', updatedAt: Date.now() });
    return args.id;
  },
});

// ---------------------------------------------------------------------------
// reject — reject a pending record
// ---------------------------------------------------------------------------

export const reject = mutation({
  args: { id: v.id('employmentIncomeRecords') },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    const record = await ctx.db.get(args.id);
    if (!record || record.userId !== user._id) {
      throw new Error('Record not found or not authorised');
    }

    await ctx.db.patch(args.id, { status: 'rejected', updatedAt: Date.now() });

    // Unflag the linked transaction if any
    if (record.transactionId) {
      const tx = await ctx.db.get(record.transactionId);
      if (tx) {
        await ctx.db.patch(record.transactionId, { isSalaryIncome: undefined });
      }
    }

    return args.id;
  },
});

// ---------------------------------------------------------------------------
// remove — delete a record entirely
// ---------------------------------------------------------------------------

export const remove = mutation({
  args: { id: v.id('employmentIncomeRecords') },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    const record = await ctx.db.get(args.id);
    if (!record || record.userId !== user._id) {
      throw new Error('Record not found or not authorised');
    }

    // Unflag linked transaction
    if (record.transactionId) {
      const tx = await ctx.db.get(record.transactionId);
      if (tx) {
        await ctx.db.patch(record.transactionId, { isSalaryIncome: undefined });
      }
    }

    await ctx.db.delete(args.id);
  },
});
```

- [ ] **Step 2: Verify it compiles**

Run: `npx convex dev` — no errors.

- [ ] **Step 3: Commit**

```bash
git add convex/employmentIncome.ts
git commit -m "feat(employmentIncome): CRUD queries and mutations for payslip records"
```

---

## Task 5: Salary Detection Action

**Files:**
- Create: `convex/salaryDetection.ts`

- [ ] **Step 1: Create the salary detection module**

Create `convex/salaryDetection.ts` (runs in default Convex runtime — no `"use node"` needed since it only does string manipulation and delegates to internal helpers):

```ts
import { action } from './_generated/server';
import { internal } from './_generated/api';
import { v } from 'convex/values';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SALARY_KEYWORDS = /\b(salary|payroll|wages|emolument|staff\s*pay)\b/i;
const BANK_PREFIX_RE = /^(NIP\/|FT[-:]?|NIBSS\/|MC\s*)/i;
const TRAILING_REF_RE = /\s+[A-Z0-9]{6,}$/;
const DATE_AMOUNT_RE = /\b\d{1,2}[\/\-]\d{1,2}([\/\-]\d{2,4})?\b|\b\d{1,3}(,\d{3})*(\.\d{2})?\b/g;

const HIGH_CONFIDENCE_THRESHOLD = 5;
const MEDIUM_CONFIDENCE_THRESHOLD = 3;

// ---------------------------------------------------------------------------
// Description normalisation
// ---------------------------------------------------------------------------

function normaliseDescription(raw: string): string {
  let s = raw.trim().toUpperCase();
  s = s.replace(BANK_PREFIX_RE, '');
  s = s.replace(DATE_AMOUNT_RE, '');
  s = s.replace(TRAILING_REF_RE, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

function extractEmployerName(canonical: string): string {
  // Title-case the normalised description
  return canonical
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim() || 'Unknown Employer';
}

// ---------------------------------------------------------------------------
// Grouping and scoring
// ---------------------------------------------------------------------------

interface TransactionForDetection {
  _id: string;
  amountNgn: number;
  description: string;
  date: number;
  taxYear: number;
  type: string;
  direction: string;
  isSalaryIncome?: boolean;
}

interface ScoredGroup {
  canonicalDescription: string;
  employerName: string;
  transactions: TransactionForDetection[];
  score: number;
  avgAmount: number;
}

function groupAndScore(transactions: TransactionForDetection[]): ScoredGroup[] {
  // Filter: income or uncategorised credits, not already flagged
  const candidates = transactions.filter(
    (t) =>
      !t.isSalaryIncome &&
      (t.type === 'income' || (t.type === 'uncategorised' && t.direction === 'credit'))
  );

  // Normalise and group by canonical description
  const groups = new Map<string, TransactionForDetection[]>();
  for (const t of candidates) {
    const canonical = normaliseDescription(t.description);
    if (!canonical) continue;

    // Find existing group with similar description and ±20% amount
    let matched = false;
    for (const [key, group] of groups) {
      if (key !== canonical) continue;
      const avgAmt = group.reduce((s, g) => s + g.amountNgn, 0) / group.length;
      if (Math.abs(t.amountNgn - avgAmt) / avgAmt <= 0.20) {
        group.push(t);
        matched = true;
        break;
      }
    }

    if (!matched) {
      // Check if there's another group with same canonical but different amount range
      const existingKeys = [...groups.keys()].filter((k) => k === canonical);
      if (existingKeys.length > 0) {
        // Create a new subgroup with amount suffix
        const subKey = `${canonical}_${Math.round(t.amountNgn / 100)}`;
        const existing = groups.get(subKey);
        if (existing) {
          existing.push(t);
        } else {
          groups.set(subKey, [t]);
        }
      } else {
        groups.set(canonical, [t]);
      }
    }
  }

  // Score each group
  const results: ScoredGroup[] = [];

  for (const [key, txs] of groups) {
    if (txs.length < 2) continue;

    let score = 0;
    const canonical = key.replace(/_\d+$/, ''); // strip amount suffix

    // Unique months
    const months = new Set(txs.map((t) => {
      const d = new Date(t.date);
      return `${d.getFullYear()}-${d.getMonth()}`;
    }));
    if (months.size >= 3) score += 3;

    // Amount variance
    const amounts = txs.map((t) => t.amountNgn);
    const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const maxDeviation = Math.max(...amounts.map((a) => Math.abs(a - avgAmount) / avgAmount));
    if (maxDeviation < 0.10) score += 2;
    else if (maxDeviation < 0.20) score += 1;

    // Salary keywords
    if (SALARY_KEYWORDS.test(canonical)) score += 2;

    // Day-of-month consistency (±5 days)
    const days = txs.map((t) => new Date(t.date).getDate());
    const medianDay = days.sort((a, b) => a - b)[Math.floor(days.length / 2)];
    const allWithin5Days = days.every((d) => Math.abs(d - medianDay) <= 5);
    if (allWithin5Days && txs.length >= 2) score += 1;

    if (score >= MEDIUM_CONFIDENCE_THRESHOLD) {
      results.push({
        canonicalDescription: canonical,
        employerName: extractEmployerName(canonical),
        transactions: txs,
        score,
        avgAmount,
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Main detection action
// ---------------------------------------------------------------------------

export const detectSalaryTransactions = action({
  args: {
    entityId: v.id('entities'),
    taxYear: v.number(),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    // Fetch all transactions for entity+taxYear
    const allTransactions: TransactionForDetection[] = await ctx.runQuery(
      internal.salaryDetectionHelpers.getTransactionsForDetection,
      { entityId: args.entityId, taxYear: args.taxYear }
    );

    const groups = groupAndScore(allTransactions);

    // For each qualifying group, create employment records and flag transactions
    for (const group of groups) {
      await ctx.runMutation(
        internal.salaryDetectionHelpers.createDetectedRecords,
        {
          entityId: args.entityId,
          userId: args.userId,
          taxYear: args.taxYear,
          employerName: group.employerName,
          transactionIds: group.transactions.map((t) => t._id),
          isHighConfidence: group.score >= HIGH_CONFIDENCE_THRESHOLD,
        }
      );
    }

    return {
      groupsDetected: groups.length,
      groups: groups.map((g) => ({
        employer: g.employerName,
        score: g.score,
        months: g.transactions.length,
        avgAmount: g.avgAmount,
        isHighConfidence: g.score >= HIGH_CONFIDENCE_THRESHOLD,
      })),
    };
  },
});

// ---------------------------------------------------------------------------
// Cascade categorisation action — triggered when user manually marks salary
// ---------------------------------------------------------------------------

export const cascadeSalaryFlag = action({
  args: {
    transactionId: v.id('transactions'),
    entityId: v.id('entities'),
    taxYear: v.number(),
    userId: v.id('users'),
    employerName: v.string(),
  },
  handler: async (ctx, args) => {
    // Get the source transaction
    const allTransactions: TransactionForDetection[] = await ctx.runQuery(
      internal.salaryDetectionHelpers.getTransactionsForDetection,
      { entityId: args.entityId, taxYear: args.taxYear }
    );

    const source = allTransactions.find((t) => t._id === (args.transactionId as string));
    if (!source) return { cascadedCount: 0 };

    const sourceCanonical = normaliseDescription(source.description);

    // Find matching transactions (same canonical desc, ±20% amount, same tax year)
    const matches = allTransactions.filter((t) => {
      if (t._id === args.transactionId) return false;
      if (t.isSalaryIncome) return false;
      const canonical = normaliseDescription(t.description);
      if (canonical !== sourceCanonical) return false;
      const amountDiff = Math.abs(t.amountNgn - source.amountNgn) / source.amountNgn;
      return amountDiff <= 0.20;
    });

    if (matches.length === 0) return { cascadedCount: 0 };

    // Create records for matches
    await ctx.runMutation(
      internal.salaryDetectionHelpers.createDetectedRecords,
      {
        entityId: args.entityId,
        userId: args.userId,
        taxYear: args.taxYear,
        employerName: args.employerName,
        transactionIds: matches.map((t) => t._id),
        isHighConfidence: true,
      }
    );

    return { cascadedCount: matches.length };
  },
});
```

- [ ] **Step 2: Create helper mutations (internal)**

Create `convex/salaryDetectionHelpers.ts`:

```ts
import { internalMutation, internalQuery } from './_generated/server';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';

// ---------------------------------------------------------------------------
// Internal query: fetch transactions for detection
// ---------------------------------------------------------------------------

export const getTransactionsForDetection = internalQuery({
  args: {
    entityId: v.id('entities'),
    taxYear: v.number(),
  },
  handler: async (ctx, args) => {
    const transactions = await ctx.db
      .query('transactions')
      .withIndex('by_entityId_taxYear', (q) =>
        q.eq('entityId', args.entityId).eq('taxYear', args.taxYear)
      )
      .collect();

    return transactions.map((t) => ({
      _id: t._id as string,
      amountNgn: t.amountNgn,
      description: t.description,
      date: t.date,
      taxYear: t.taxYear,
      type: t.type,
      direction: t.direction,
      isSalaryIncome: t.isSalaryIncome,
    }));
  },
});

// ---------------------------------------------------------------------------
// Internal mutation: create detected employment records + flag transactions
// ---------------------------------------------------------------------------

export const createDetectedRecords = internalMutation({
  args: {
    entityId: v.id('entities'),
    userId: v.id('users'),
    taxYear: v.number(),
    employerName: v.string(),
    transactionIds: v.array(v.string()),
    isHighConfidence: v.boolean(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    for (const txIdStr of args.transactionIds) {
      const txId = txIdStr as Id<'transactions'>;
      const tx = await ctx.db.get(txId);
      if (!tx) continue;

      // Flag transaction as salary income
      await ctx.db.patch(txId, { isSalaryIncome: true });

      // Derive month from transaction date
      const txDate = new Date(tx.date);
      const month = txDate.getMonth() + 1; // 1-based

      // Check if record already exists for this employer+month
      const existing = await ctx.db
        .query('employmentIncomeRecords')
        .withIndex('by_entityId_taxYear', (q) =>
          q.eq('entityId', args.entityId).eq('taxYear', args.taxYear)
        )
        .collect();

      const alreadyExists = existing.find(
        (r) => r.month === month && r.employerName === args.employerName
      );

      if (alreadyExists) continue;

      // Create pending employment income record
      await ctx.db.insert('employmentIncomeRecords', {
        entityId: args.entityId,
        userId: args.userId,
        taxYear: args.taxYear,
        month,
        employerName: args.employerName,
        grossSalary: tx.amountNgn, // placeholder — net amount until user corrects
        payeDeducted: 0, // user must fill in from payslip
        transactionId: txId,
        source: 'detected',
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});
```

- [ ] **Step 3: Verify compilation**

Run: `npx convex dev` — no errors.

- [ ] **Step 4: Commit**

```bash
git add convex/salaryDetection.ts convex/salaryDetectionHelpers.ts
git commit -m "feat(salaryDetection): detection action with grouping, scoring, and cascade"
```

---

## Task 6: Onboarding — Salary Earner Path

**Files:**
- Modify: `convex/onboarding.ts`
- Modify: `apps/web/src/pages/Onboarding.tsx`

- [ ] **Step 1: Update `saveUserType` mutation to accept `salary_earner`**

In `convex/onboarding.ts`, update the `saveUserType` args (line 9):

```ts
args: {
  userType: v.union(v.literal('freelancer'), v.literal('sme'), v.literal('salary_earner')),
},
```

- [ ] **Step 2: Add `saveSalaryProfile` mutation**

Add after `saveFreelancerProfile` in `convex/onboarding.ts`:

```ts
/**
 * Step 2 (Salary Earner): Save profile data and create individual entity.
 */
export const saveSalaryProfile = mutation({
  args: {
    firstName: v.string(),
    lastName: v.string(),
    preferredCurrency: v.union(
      v.literal('NGN'),
      v.literal('USD'),
      v.literal('GBP'),
      v.literal('EUR')
    ),
    employerName: v.string(),
    jobTitle: v.optional(v.string()),
    employmentType: v.union(
      v.literal('full_time'),
      v.literal('part_time'),
      v.literal('contract')
    ),
    hasOtherIncome: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    const fullName = `${args.firstName.trim()} ${args.lastName.trim()}`.trim();

    await ctx.db.patch(user._id, {
      fullName,
      preferredCurrency: args.preferredCurrency,
      updatedAt: Date.now(),
    });

    // Create individual entity if none exists
    const existing = await ctx.db
      .query('entities')
      .withIndex('by_userId', (q) => q.eq('userId', user._id))
      .collect();

    const active = existing.filter((e) => !e.deletedAt);
    let entityId: string | undefined;

    if (active.length === 0) {
      entityId = await ctx.db.insert('entities', {
        userId: user._id,
        name: fullName || 'My Profile',
        type: 'individual',
        isDefault: true,
        taxYearStart: 1,
      });
    }

    return { userId: user._id, entityId };
  },
});
```

Note: `employerName`, `jobTitle`, `employmentType`, and `hasOtherIncome` are captured in onboarding for immediate use (e.g., creating the first `employmentIncomeRecord` with `employerName` during payslip entry). They are not persisted on the `users` table — the employment record itself stores the employer name. `hasOtherIncome` controls which onboarding steps to show (component state only).

- [ ] **Step 3: Update Onboarding.tsx — add salary earner user type option**

In `apps/web/src/pages/Onboarding.tsx`, update the `UserType` type (line 55):

```ts
type UserType = 'freelancer' | 'sme' | 'salary_earner';
```

Then in the user type selection step, add a third card for "Salary Earner" between Freelancer and SME. Follow the existing card pattern (the `UserTypeCard` or equivalent component) with:
- Icon: `Briefcase` from lucide-react
- Title: "Salary Earner"
- Description: "Employed full-time or part-time. May also have side income."

- [ ] **Step 4: Add employment details step (Step 3 for salary earner)**

Add a new onboarding step component that renders when `userType === 'salary_earner'` after personal details. Fields:
- `employerName` (text, required)
- `jobTitle` (text, optional)
- `employmentType` (select: Full-time / Part-time / Contract)
- `hasOtherIncome` (toggle: "Do you also earn income from other sources?")

On submit, call the `saveSalaryProfile` mutation.

- [ ] **Step 5: Add initial salary setup step (Step 4 for salary earner)**

Add a step after employment details with three options:
- "Enter payslip details now" → navigate to `/app/payslip-entry` after onboarding
- "Detect from bank statements" → proceed to account connection step
- "Skip for now" → mark onboarding complete

Store the choice in component state; the onboarding completion handler routes accordingly.

- [ ] **Step 6: Verify the onboarding flow works end to end**

Run the dev server, go through the salary earner onboarding path manually, confirm entity is created.

- [ ] **Step 7: Commit**

```bash
git add convex/onboarding.ts apps/web/src/pages/Onboarding.tsx
git commit -m "feat(onboarding): salary earner path with employment details and salary setup"
```

---

## Task 7: Payslip Entry Page

**Files:**
- Create: `apps/web/src/pages/PayslipEntry.tsx`
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: Create PayslipEntry.tsx**

Create `apps/web/src/pages/PayslipEntry.tsx`. Follow the form pattern from `Declarations.tsx`:
- Controlled inputs with local form state
- `inputMode="numeric"` with ₦ prefix
- Naira ↔ kobo conversion helpers
- `useQuery(api.employmentIncome.get)` for existing record
- `useMutation(api.employmentIncome.createOrUpdate)` for save
- Toast feedback (sonner)

Form fields:
- Employer name (text, pre-filled from URL param or detected record)
- Month + Year selector (dropdowns)
- Gross salary (₦ numeric input)
- PAYE deducted (₦ numeric input)
- Pension deducted at source (₦ numeric input, optional)
- NHIS deducted at source (₦ numeric input, optional)
- NHF deducted at source (₦ numeric input, optional)
- Linked transaction indicator (read-only, shows matched bank credit if `transactionId` exists)

Actions:
- **Save** — saves and navigates back to Employment Income list
- **Save & Add Next Month** — saves, increments month selector, resets form

Support URL search params: `?entityId=X&taxYear=Y&month=Z&employer=Name` to pre-fill when navigating from detection prompt or Employment Income list.

- [ ] **Step 2: Add route in App.tsx**

Add to the authenticated routes section:

```tsx
<Route path="payslip-entry" element={<PayslipEntry />} />
```

Add the import at the top:

```tsx
import PayslipEntry from './pages/PayslipEntry';
```

- [ ] **Step 3: Verify form renders and saves**

Run dev server, navigate to `/app/payslip-entry`, fill in fields, submit, verify record appears in Convex dashboard.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/PayslipEntry.tsx apps/web/src/App.tsx
git commit -m "feat(PayslipEntry): payslip entry form with month-by-month input"
```

---

## Task 8: Employment Income List Page

**Files:**
- Create: `apps/web/src/pages/EmploymentIncome.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/components/AppShell.tsx`

- [ ] **Step 1: Create EmploymentIncome.tsx**

Create `apps/web/src/pages/EmploymentIncome.tsx`:
- Uses `useQuery(api.employmentIncome.list, { entityId, taxYear })`
- Groups records by `employerName`
- Shows 12-month grid per employer with status indicators:
  - Green checkmark = `confirmed`
  - Yellow clock = `pending`
  - Grey dash = no record for that month
- Shows totals per employer: total gross, total PAYE
- "Add payslip" button → navigates to PayslipEntry with employer+next-missing-month pre-filled
- Click on a month → navigates to PayslipEntry to edit that record
- Pending records show "Confirm" / "Reject" action buttons

Use `useMutation(api.employmentIncome.confirm)` and `useMutation(api.employmentIncome.reject)` for status changes.

Follow existing page patterns:
- `useEntity()` hook for entity context
- Tax year selector dropdown in header (same as TaxSummary/Declarations)
- Skeleton loading states
- Empty state: "No employment income records yet. Enter your payslip details to get started."

- [ ] **Step 2: Add route in App.tsx**

```tsx
<Route path="employment-income" element={<EmploymentIncome />} />
```

Import:
```tsx
import EmploymentIncome from './pages/EmploymentIncome';
```

- [ ] **Step 3: Add nav item in AppShell.tsx**

In the main nav items array in `AppShell.tsx`, add (after Transactions):

```tsx
{ to: '/app/employment-income', icon: Briefcase, label: 'Employment Income' },
```

Add `Briefcase` to the lucide-react import.

This nav item should only be visible when the current user's `userType === 'salary_earner'`. Use the existing user query to check:

```tsx
{me?.userType === 'salary_earner' && (
  <NavLink to="/app/employment-income" icon={Briefcase} label="Employment Income" />
)}
```

- [ ] **Step 4: Verify page loads with data**

Run dev server, navigate to Employment Income, verify records display correctly.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/EmploymentIncome.tsx apps/web/src/App.tsx apps/web/src/components/AppShell.tsx
git commit -m "feat(EmploymentIncome): list page with month grid, confirm/reject, nav link"
```

---

## Task 9: Dashboard Modifications

**Files:**
- Modify: `apps/web/src/pages/Dashboard.tsx`

- [ ] **Step 1: Fetch employment data for salary earners**

In the Dashboard component, add a query for employment records (only when user is salary earner):

```tsx
const me = useQuery(api.queries.getMe);
const employmentRecords = useQuery(
  api.employmentIncome.list,
  me?.userType === 'salary_earner' && entity
    ? { entityId: entity._id, taxYear: currentTaxYear }
    : 'skip'
);
```

Compute summary values:

```tsx
const confirmedRecords = employmentRecords?.filter((r) => r.status === 'confirmed') ?? [];
const totalEmploymentIncome = confirmedRecords.reduce((s, r) => s + r.grossSalary, 0);
const totalPayeCredits = confirmedRecords.reduce((s, r) => s + r.payeDeducted, 0);
const pendingCount = employmentRecords?.filter((r) => r.status === 'pending').length ?? 0;
```

- [ ] **Step 2: Show salary earner income card**

When `me?.userType === 'salary_earner'`, replace or augment the existing income display card with:

```
Employment Income      ₦X,XXX,XXX  (N months confirmed)
  PAYE credited        ₦XXX,XXX
Other Income           ₦XXX,XXX    (if taxSummary shows income beyond employment)
```

Show a "Salary incomplete" warning badge if `pendingCount > 0` or if `confirmedRecords.length < currentMonth` (months elapsed in tax year).

Link the card to `/app/employment-income`.

- [ ] **Step 3: Verify dashboard shows correctly for both user types**

Check that freelancer dashboard is unchanged; salary earner dashboard shows the new card.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/Dashboard.tsx
git commit -m "feat(Dashboard): salary earner income card with PAYE and incomplete badge"
```

---

## Task 10: Tax Summary Modifications

**Files:**
- Modify: `apps/web/src/pages/TaxSummary.tsx`

- [ ] **Step 1: Display employment income and PAYE credits**

The Tax Summary page already calls `useQuery(api.tax.getSummary, ...)`. The engine now returns `totalEmploymentIncome` and `payeCredits` in the result.

Update the income breakdown section to split:
- **Employment income:** `result.totalEmploymentIncome`
- **Other income:** `result.totalGrossIncome - result.totalEmploymentIncome`

(Only show this split if `result.totalEmploymentIncome > 0`)

- [ ] **Step 2: Add PAYE credits line**

After the WHT credits line, add:

```
Less: PAYE credits    (₦XXX,XXX)
```

Only display if `result.payeCredits > 0`.

Update the section labels:
- "Net tax payable" → "Net PIT payable" (when PAYE credits or CGT/VAT exist)
- Show CGT, VAT, CIT as separate lines below (existing logic may already handle this)
- Final "Total tax payable" line

- [ ] **Step 3: Add estimated-gross warning for salary earners**

Query `api.employmentIncome.list` and check if any confirmed record has `source === 'detected'` and `payeDeducted === 0`. If so, show a warning card:

```
⚠ Salary figures are estimated (payslip not entered)
  Your tax estimate may be understated. Enter payslip details for accuracy.
  [Complete payslip details →]
```

Link to `/app/payslip-entry`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/TaxSummary.tsx
git commit -m "feat(TaxSummary): employment income split, PAYE credits line, estimated-gross warning"
```

---

## Task 11: Declarations Screen — Relief Lock-out

**Files:**
- Modify: `apps/web/src/pages/Declarations.tsx`

- [ ] **Step 1: Query for confirmed payslip records**

Add a query in the Declarations component:

```tsx
const payslipStatus = useQuery(
  api.employmentIncome.hasConfirmedRecords,
  entity ? { entityId: entity._id, taxYear: currentTaxYear } : 'skip'
);
```

- [ ] **Step 2: Lock pension/NHIS/NHF fields when payslip records exist**

When `payslipStatus?.hasRecords === true`:
- Display the Pension, NHIS, and NHF fields as read-only with the payslip totals
- Show a lock indicator and text: "From payslip — edit in Employment Income"
- Link to `/app/employment-income`
- Prevent these fields from being edited or submitted
- Other fields (rent, life insurance, mortgage) remain editable

- [ ] **Step 3: Verify lock-out works**

Create a confirmed payslip record with pension data. Open Declarations page. Verify pension field is locked and shows the payslip value.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/Declarations.tsx
git commit -m "feat(Declarations): lock pension/NHIS/NHF fields when confirmed payslip records exist"
```

---

## Task 12: Filing Pre-flight Checklist

**Files:**
- Modify: `convex/tax.ts` (getFilingChecklist)
- Modify: `apps/web/src/pages/Filing.tsx`

- [ ] **Step 1: Add salary-specific checklist items in `getFilingChecklist`**

In the `getFilingChecklist` query handler in `convex/tax.ts`, after fetching transactions, add:

```ts
// Fetch employment income records for salary earner checks
const employmentRecords = await ctx.db
  .query('employmentIncomeRecords')
  .withIndex('by_entityId_taxYear', (q) =>
    q.eq('entityId', args.entityId).eq('taxYear', args.taxYear)
  )
  .collect();

const confirmedRecords = employmentRecords.filter((r) => r.status === 'confirmed');
const pendingRecords = employmentRecords.filter((r) => r.status === 'pending');
const estimatedRecords = confirmedRecords.filter(
  (r) => r.source === 'detected' && r.payeDeducted === 0
);
```

Add two new checklist items (only when employment records exist):

```ts
// 11. Payslip details complete (salary earners only)
if (employmentRecords.length > 0) {
  const monthsWithoutPaye = confirmedRecords.filter((r) => r.payeDeducted === 0).length;
  items.push({
    key: 'payslipComplete',
    label: 'Payslip details complete',
    description: monthsWithoutPaye > 0
      ? `${monthsWithoutPaye} month(s) have no PAYE data. Your tax may be overstated.`
      : 'All months have PAYE data from payslips.',
    status: monthsWithoutPaye === 0 && pendingRecords.length === 0 ? 'complete' : 'warning',
    group: 'Employment',
  });
}

// 12. Salary figures verified (salary earners only)
if (estimatedRecords.length > 0) {
  items.push({
    key: 'salaryEstimated',
    label: 'Salary figures verified',
    description: `Gross salary for ${estimatedRecords.length} month(s) is based on bank credit, not payslip.`,
    status: 'warning',
    group: 'Employment',
  });
}
```

Update `WARNING_COUNTS_AS_READY_KEYS` (line 330 in `tax.ts`) to include the new keys:

```ts
const WARNING_COUNTS_AS_READY_KEYS = new Set([
  'incomeReviewed', 'categorisation', 'expensesVerified',
  'payslipComplete', 'salaryEstimated',
]);
```

- [ ] **Step 2: Update Filing.tsx to show salary-specific items**

The Filing page already renders checklist items from `getFilingChecklist`. No change needed if the existing rendering loop handles the new `'Employment'` group. Verify that:
- The new items render with a warning icon
- The "Complete payslip details" action links to `/app/employment-income`

- [ ] **Step 3: Commit**

```bash
git add convex/tax.ts apps/web/src/pages/Filing.tsx
git commit -m "feat(filing): salary-specific pre-flight checklist items for payslip completeness"
```

---

## Task 13: Import Pipeline — Detection Hook

**Files:**
- Modify: `convex/importPipeline.ts`

- [ ] **Step 1: Add salary detection trigger after import completes**

In `convex/importPipeline.ts`, find the section where import status is set to `'complete'` (after all transactions are written). Since `importPipeline.ts` is a `"use node"` action, it cannot use `ctx.scheduler` directly — only mutations have schedulers. Instead, call an internal mutation that schedules the detection.

First, add a scheduling helper to `convex/salaryDetectionHelpers.ts`:

```ts
/**
 * Internal mutation to schedule salary detection from an action context.
 * Actions cannot use ctx.scheduler directly, so they delegate to this mutation.
 */
export const scheduleSalaryDetection = internalMutation({
  args: {
    entityId: v.id('entities'),
    userId: v.id('users'),
    taxYear: v.number(),
  },
  handler: async (ctx, args) => {
    // Check if user is a salary earner
    const user = await ctx.db.get(args.userId);
    if (!user || user.userType !== 'salary_earner') return;

    await ctx.scheduler.runAfter(0, internal.salaryDetection.detectSalaryTransactions, {
      entityId: args.entityId,
      taxYear: args.taxYear,
      userId: args.userId,
    });
  },
});
```

Then in `importPipeline.ts`, after the import completes:

```ts
// Trigger salary detection asynchronously via internal mutation
// Derive tax year from imported transactions (most common taxYear value)
const taxYears = [...new Set(importedTransactions.map((t) => t.taxYear))];
for (const taxYear of taxYears) {
  await ctx.runMutation(
    internal.salaryDetectionHelpers.scheduleSalaryDetection,
    { entityId: job.entityId, userId: job.userId, taxYear }
  );
}
```

This delegates scheduling to a mutation (which has `ctx.scheduler`), and checks `userType` server-side.

- [ ] **Step 2: Verify detection triggers after CSV/PDF import**

Import a bank statement with salary-pattern transactions for a salary earner user. Check that `employmentIncomeRecords` are created with `status: 'pending'`.

- [ ] **Step 3: Commit**

```bash
git add convex/importPipeline.ts
git commit -m "feat(importPipeline): trigger salary detection after import for salary earner users"
```

---

## Task 14: Filing PDF — PAYE Credits Line

**Files:**
- Modify: `convex/lib/pdf/filingPdf.ts`

- [ ] **Step 1: Add PAYE credits to the tax breakdown section**

In `convex/lib/pdf/filingPdf.ts`, find the section that renders the tax breakdown (after WHT credits line). Add:

```ts
// PAYE credits line (only if > 0)
if (snapshot.payeCredits > 0) {
  addBreakdownRow('Less: PAYE credits', -snapshot.payeCredits);
}
```

Also add an employment income subsection if `snapshot.totalEmploymentIncome > 0`:

```ts
if (snapshot.totalEmploymentIncome > 0) {
  addBreakdownRow('  Employment income', snapshot.totalEmploymentIncome);
  addBreakdownRow('  Other income', snapshot.totalGrossIncome - snapshot.totalEmploymentIncome);
}
```

The exact PDF rendering approach depends on the existing pattern in `filingPdf.ts`. Follow the same helper functions and styling used for other line items.

- [ ] **Step 2: Verify PDF renders correctly**

Generate a filing PDF for a salary earner entity and verify the PAYE line appears.

- [ ] **Step 3: Commit**

```bash
git add convex/lib/pdf/filingPdf.ts
git commit -m "feat(filingPdf): add PAYE credits and employment income lines to self-assessment PDF"
```

---

## Task 15: End-to-End Verification

**Files:** None (manual testing)

- [ ] **Step 1: Pure salary earner flow**

1. Create new account → select "Salary Earner" → complete onboarding with employer details
2. Enter payslip details for 3 months (Jan–Mar)
3. View Dashboard → verify employment income card shows correct total and PAYE
4. View Tax Summary → verify employment income split, PAYE credits line, net PIT payable
5. View Declarations → verify pension/NHIS/NHF fields are locked with payslip values
6. View Filing → verify checklist shows "Payslip details complete" status

- [ ] **Step 2: Mixed-income salary earner flow**

1. Same as above but select "Yes" for other income during onboarding
2. Import a bank statement with both salary and freelance transactions
3. Verify salary detection runs and creates pending records
4. Confirm the pending records
5. Verify Tax Summary shows correct gross income (employment + other, no double-counting)

- [ ] **Step 3: Detection cascade flow**

1. Import a bank statement with 6 months of regular salary credits (no detection yet — user is freelancer)
2. Switch `userType` to `salary_earner` in Settings
3. Manually mark one transaction as salary
4. Verify cascade: remaining 5 months auto-flagged, employment records created
5. Verify Employment Income list shows all 6 months as pending

- [ ] **Step 4: Commit any fixes discovered during testing**

```bash
git add -A
git commit -m "fix: address issues found during salary earner end-to-end testing"
```
