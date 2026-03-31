/**
 * TaxEase Nigeria — Tax Engine Public API (PRD-3 / PRD-6)
 *
 * Exports:
 *   getSummary          — reactive query: runs engine inline, re-evaluates on
 *                         any transaction / declaration / disposal change.
 *   getIncomeBreakdown  — reactive query: groups income transactions into four
 *                         buckets (freelance/client, foreign, investment, rental).
 *   refreshSummaryCache — mutation: writes engine output to taxYearSummaries
 *                         for fast dashboard reads.
 *   getFilingChecklist  — query: computes 10 pre-filing readiness items with
 *                         readinessPercent and grouped structure (PRD-6 §5.1).
 */

import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { getCurrentUser } from './auth';
import {
  runTaxEngine,
  getEngineForYear,
  TaxEngineTransaction,
  TaxEngineCapitalDisposal,
  EmploymentIncomeRecord,
} from './taxEngine';

// ---------------------------------------------------------------------------
// getSummary — reactive live query
// ---------------------------------------------------------------------------

/**
 * Run the tax engine inline and return the full computation result.
 *
 * Because this is a Convex query it is reactive — it automatically re-runs
 * whenever the underlying transactions, declarations, or capital disposals
 * change.  No caching; call refreshSummaryCache to persist for dashboard.
 *
 * Returns null if the user is not authenticated or does not own the entity.
 */
export const getSummary = query({
  args: {
    entityId: v.id('entities'),
    taxYear: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    // Verify entity ownership
    const entity = await ctx.db.get(args.entityId);
    if (!entity || entity.userId !== user._id || entity.deletedAt) return null;

    // ---- Fetch transactions for this entity+taxYear ----
    const rawTransactions = await ctx.db
      .query('transactions')
      .withIndex('by_entityId_taxYear', (q) =>
        q.eq('entityId', args.entityId).eq('taxYear', args.taxYear)
      )
      .collect();

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

    // ---- Fetch user declarations ----
    const declaration = await ctx.db
      .query('taxDeclarations')
      .withIndex('by_entityId_taxYear', (q) =>
        q.eq('entityId', args.entityId).eq('taxYear', args.taxYear)
      )
      .first();

    // ---- Fetch capital disposals ----
    const rawDisposals = await ctx.db
      .query('capitalDisposals')
      .withIndex('by_entityId_taxYear', (q) =>
        q.eq('entityId', args.entityId).eq('taxYear', args.taxYear)
      )
      .collect();

    const capitalDisposals: TaxEngineCapitalDisposal[] = rawDisposals.map((d) => ({
      acquisitionCostNgn:   d.acquisitionCostNgn,
      disposalProceedsNgn:  d.disposalProceedsNgn,
      isExempt:             d.isExempt,
      exemptionReason:      d.exemptionReason,
    }));

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

    // ---- Run engine ----
    const result = runTaxEngine({
      transactions,
      declarations,
      entityType:      entity.type,
      taxYear:         args.taxYear,
      capitalDisposals,
      isVatRegistered: entity.vatRegistered ?? false,
      outputVatNgn:    0, // invoices not yet implemented; pass 0
      // grossFixedAssetsNgn: not yet declared by user; undefined → assume exempt
      employmentIncomeRecords,
    });

    return {
      ...result,
      engineVersionForYear: getEngineForYear(args.taxYear),
    };
  },
});

// ---------------------------------------------------------------------------
// getIncomeBreakdown — group income transactions into four display buckets
// ---------------------------------------------------------------------------

/**
 * Groups income transactions for a given entity+taxYear into four buckets:
 *   - freelanceClient: NGN income not matching investment/rental patterns
 *   - foreign:         income in a non-NGN currency (USD, GBP, EUR)
 *   - investment:      income whose category name suggests dividends/interest
 *   - rental:          income whose category name suggests property/rent
 *
 * Returns null when the user is not authenticated or does not own the entity.
 */
export const getIncomeBreakdown = query({
  args: {
    entityId: v.id('entities'),
    taxYear: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const entity = await ctx.db.get(args.entityId);
    if (!entity || entity.userId !== user._id || entity.deletedAt) return null;

    // Fetch all income transactions for this entity+year
    const allTx = await ctx.db
      .query('transactions')
      .withIndex('by_entityId_taxYear', (q) =>
        q.eq('entityId', args.entityId).eq('taxYear', args.taxYear)
      )
      .collect();

    const incomeTx = allTx.filter((t) => t.type === 'income');

    // Build a map of categoryId → category name (lowercase)
    const categoryIds = [...new Set(
      incomeTx.filter((t) => t.categoryId).map((t) => t.categoryId as string)
    )];
    const categoryMap = new Map<string, string>();
    for (const catId of categoryIds) {
      const cat = await ctx.db.get(catId as any);
      if (cat) categoryMap.set(catId, (cat as any).name?.toLowerCase() ?? '');
    }

    let freelanceClient = 0;
    let foreign = 0;
    let investment = 0;
    let rental = 0;

    for (const t of incomeTx) {
      const amount = t.amountNgn;

      // Foreign: any non-NGN currency
      if (t.currency && t.currency !== 'NGN') {
        foreign += amount;
        continue;
      }

      const catName = t.categoryId ? (categoryMap.get(t.categoryId) ?? '') : '';

      if (/invest|dividend|interest|stock|share|bond|capital gain/i.test(catName)) {
        investment += amount;
      } else if (/rent|rental|property|real estate|lease/i.test(catName)) {
        rental += amount;
      } else {
        freelanceClient += amount;
      }
    }

    return { freelanceClient, foreign, investment, rental };
  },
});

// ---------------------------------------------------------------------------
// refreshSummaryCache — write engine output to taxYearSummaries
// ---------------------------------------------------------------------------

/**
 * Compute the tax summary and write (upsert) it to taxYearSummaries.
 *
 * Call this from the dashboard or after declaration changes to refresh the
 * cache.  Historical records already written with an older engineVersion are
 * NOT overwritten (the read path for historical tax years should use the
 * cached record directly rather than calling refreshSummaryCache).
 *
 * Returns the taxYearSummaries document ID.
 */
export const refreshSummaryCache = mutation({
  args: {
    entityId: v.id('entities'),
    taxYear: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    // Verify entity ownership
    const entity = await ctx.db.get(args.entityId);
    if (!entity || entity.userId !== user._id || entity.deletedAt) {
      throw new Error('Entity not found or not authorised');
    }

    // ---- Engine version routing ----
    const currentEngineVersion = getEngineForYear(args.taxYear);

    // Historical summaries: if a cached record already exists with the
    // SAME engineVersion, skip re-computation to preserve immutability.
    // (Future: if engine version bumps, we re-run even for past years.)
    const existing = await ctx.db
      .query('taxYearSummaries')
      .withIndex('by_entityId_taxYear', (q) =>
        q.eq('entityId', args.entityId).eq('taxYear', args.taxYear)
      )
      .first();

    // If the engine version has changed, delete the stale cache entry so it
    // gets recomputed below with the latest engine logic (e.g. new PAYE fields).
    if (existing && existing.engineVersion !== currentEngineVersion) {
      await ctx.db.delete(existing._id);
    }

    // ---- Fetch transactions ----
    const rawTransactions = await ctx.db
      .query('transactions')
      .withIndex('by_entityId_taxYear', (q) =>
        q.eq('entityId', args.entityId).eq('taxYear', args.taxYear)
      )
      .collect();

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

    // Exclude salary transactions that have a confirmed employment record linked.
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

    // ---- Fetch declarations ----
    const declaration = await ctx.db
      .query('taxDeclarations')
      .withIndex('by_entityId_taxYear', (q) =>
        q.eq('entityId', args.entityId).eq('taxYear', args.taxYear)
      )
      .first();

    // ---- Fetch capital disposals ----
    const rawDisposals = await ctx.db
      .query('capitalDisposals')
      .withIndex('by_entityId_taxYear', (q) =>
        q.eq('entityId', args.entityId).eq('taxYear', args.taxYear)
      )
      .collect();

    const capitalDisposals: TaxEngineCapitalDisposal[] = rawDisposals.map((d) => ({
      acquisitionCostNgn:  d.acquisitionCostNgn,
      disposalProceedsNgn: d.disposalProceedsNgn,
      isExempt:            d.isExempt,
      exemptionReason:     d.exemptionReason,
    }));

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
      declarations = {
        ...declarations,
        pensionContributions: pensionFromPayslip,
        nhisContributions:    nhisFromPayslip,
        nhfContributions:     nhfFromPayslip,
      };
    }

    // ---- Run engine ----
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

    const now = Date.now();

    const summaryFields = {
      entityId:             args.entityId,
      userId:               user._id,
      taxYear:              args.taxYear,
      engineVersion:        result.engineVersion,
      totalGrossIncome:     result.totalGrossIncome,
      totalBusinessExpenses: result.totalBusinessExpenses,
      assessableProfit:     result.assessableProfit,
      reliefs:              result.reliefs,
      taxableIncome:        result.taxableIncome,
      bands:                result.bands,
      grossTaxPayable:      result.grossTaxPayable,
      whtCredits:           result.whtCredits,
      netTaxPayable:        result.netTaxPayable,
      minimumTaxApplied:    result.minimumTaxApplied,
      cgGains:              result.cgGains,
      cgtPayable:           result.cgtPayable,
      vatPayable:           result.vatPayable,
      citPayable:           result.citPayable,
      totalTaxPayable:      result.totalTaxPayable,
      effectiveTaxRate:     result.effectiveTaxRate,
      uncategorisedCount:   result.uncategorisedCount,
      isNilReturn:          result.isNilReturn,
      payeCredits:           result.payeCredits,
      totalEmploymentIncome: result.totalEmploymentIncome,
      computedAt:           now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, summaryFields);
      return existing._id;
    }

    return await ctx.db.insert('taxYearSummaries', summaryFields);
  },
});

// ---------------------------------------------------------------------------
// getFilingChecklist — pre-filing readiness checklist (PRD-6 §5.1)
// ---------------------------------------------------------------------------

type ChecklistItemStatus = 'complete' | 'incomplete' | 'warning';
const WARNING_COUNTS_AS_READY_KEYS = new Set([
  'incomeReviewed', 'categorisation', 'expensesVerified',
  'payslipComplete', 'salaryEstimated',
]);

interface ChecklistItem {
  key: string;
  label: string;
  description: string;
  status: ChecklistItemStatus;
  group: string;
}

/**
 * Compute the 10-item pre-filing checklist for a given entity+taxYear.
 *
 * Returns:
 *   - items: ordered list of ChecklistItem
 *   - readinessPercent: 0–100 (complete items / total)
 *   - grouped: Record<group, ChecklistItem[]>
 *
 * Gate for filing: readinessPercent >= 90 (i.e., at least 9 of 10 complete).
 */
export const getFilingChecklist = query({
  args: {
    entityId: v.id('entities'),
    taxYear: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const entity = await ctx.db.get(args.entityId);
    if (!entity || entity.userId !== user._id || entity.deletedAt) return null;

    // ---- Fetch supporting data in parallel (sequential in Convex, but readable) ----

    // 1. Connected accounts for entity
    const connectedAccounts = await ctx.db
      .query('connectedAccounts')
      .withIndex('by_entityId', (q) => q.eq('entityId', args.entityId))
      .collect();

    // 2. Transactions for entity+taxYear
    const transactions = await ctx.db
      .query('transactions')
      .withIndex('by_entityId_taxYear', (q) =>
        q.eq('entityId', args.entityId).eq('taxYear', args.taxYear)
      )
      .collect();

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

    // 3. Tax declarations
    const declaration = await ctx.db
      .query('taxDeclarations')
      .withIndex('by_entityId_taxYear', (q) =>
        q.eq('entityId', args.entityId).eq('taxYear', args.taxYear)
      )
      .first();

    // 4. Invoices for entity
    const invoices = await ctx.db
      .query('invoices')
      .withIndex('by_userId', (q) => q.eq('userId', user._id))
      .collect();
    const entityInvoices = invoices.filter((inv) => inv.entityId === args.entityId);

    // ---- Derive category names for rent check ----
    const expenseCategoryIds = [
      ...new Set(
        transactions
          .filter((t) => t.type === 'business_expense' && t.categoryId)
          .map((t) => t.categoryId as string)
      ),
    ];
    const rentCategoryIds = new Set<string>();
    for (const catId of expenseCategoryIds) {
      const cat = await ctx.db.get(catId as any);
      if (cat && /rent|lease|property/i.test((cat as any).name ?? '')) {
        rentCategoryIds.add(catId);
      }
    }

    // ---- Compute each checklist item ----
    const items: ChecklistItem[] = [];

    // 1. NIN registered
    items.push({
      key: 'nin',
      label: 'NIN registered',
      description: 'Your National Identification Number must be on file for FIRS verification.',
      status: user.nin ? 'complete' : 'incomplete',
      group: 'Identity & Entity',
    });

    // 2. Entity type & TIN confirmed
    const hasTin = !!(entity.tin || user.firsTin);
    items.push({
      key: 'entityType',
      label: 'Entity type & TIN confirmed',
      description: 'Entity classification and Tax Identification Number must be set.',
      status: hasTin ? 'complete' : 'incomplete',
      group: 'Identity & Entity',
    });

    // 3. Bank account linked
    items.push({
      key: 'bankAccounts',
      label: 'Bank account linked',
      description: 'At least one connected bank account or statement upload is required.',
      status: connectedAccounts.length > 0 ? 'complete' : 'warning',
      group: 'Accounts',
    });

    // 4. Foreign income reviewed
    const foreignUncategorised = transactions.filter(
      (t) => t.currency !== 'NGN' && t.type === 'uncategorised'
    );
    const foreignIncomeTx = transactions.filter((t) => t.currency !== 'NGN' && t.type === 'income');
    let foreignStatus: ChecklistItemStatus;
    if (foreignUncategorised.length > 0) {
      foreignStatus = 'incomplete';
    } else if (foreignIncomeTx.length > 0 && foreignIncomeTx.every((t) => t.reviewedByUser)) {
      foreignStatus = 'complete';
    } else if (foreignIncomeTx.length === 0) {
      foreignStatus = 'complete'; // no foreign income — not applicable
    } else {
      foreignStatus = 'warning'; // foreign income exists but not all reviewed
    }
    items.push({
      key: 'foreignIncome',
      label: 'Foreign income reviewed',
      description: 'All non-NGN income transactions must be categorised and reviewed.',
      status: foreignStatus,
      group: 'Transactions',
    });

    // 5. Income transactions reviewed
    const incomeTx = transactions.filter((t) => t.type === 'income');
    const allIncomeReviewed = incomeTx.length === 0 || incomeTx.every((t) => t.reviewedByUser);
    items.push({
      key: 'incomeReviewed',
      label: 'Income transactions reviewed',
      description: allIncomeReviewed
        ? 'Income entries are reviewed.'
        : 'Included for readiness, but review income entries to improve filing confidence.',
      status: allIncomeReviewed ? 'complete' : 'warning',
      group: 'Transactions',
    });

    // 6. All transactions categorised
    const uncategorisedCount = transactions.filter((t) => t.type === 'uncategorised').length;
    items.push({
      key: 'categorisation',
      label: 'All transactions categorised',
      description:
        uncategorisedCount === 0
          ? 'All transactions are categorised.'
          : `${uncategorisedCount} uncategorised transaction(s) remain. Included for readiness, but categorisation is still recommended.`,
      status: uncategorisedCount === 0 ? 'complete' : 'warning',
      group: 'Transactions',
    });

    // 7. Expenses verified
    const expenseTx = transactions.filter((t) => t.type === 'business_expense');
    const allExpensesVerified =
      expenseTx.length === 0 || expenseTx.every((t) => t.reviewedByUser);
    items.push({
      key: 'expensesVerified',
      label: 'Business expenses verified',
      description: allExpensesVerified
        ? 'Business expenses are reviewed and deductibility is confirmed.'
        : 'Included for readiness, but verify expense deductibility before final submission.',
      status: allExpensesVerified ? 'complete' : 'warning',
      group: 'Transactions',
    });

    // 8. Rent relief declared
    const hasRentExpenses = transactions.some(
      (t) => t.type === 'business_expense' && t.categoryId && rentCategoryIds.has(t.categoryId)
    );
    let rentStatus: ChecklistItemStatus;
    if (!hasRentExpenses) {
      rentStatus = 'complete'; // no rent expenses — not applicable
    } else if (declaration && (declaration.annualRentPaid ?? 0) > 0) {
      rentStatus = 'complete';
    } else {
      rentStatus = 'warning'; // rent expenses detected but not declared
    }
    items.push({
      key: 'rentDeclared',
      label: 'Rent relief declared',
      description: 'If you pay rent, declare the annual amount to claim the 20% relief (max ₦500,000).',
      status: rentStatus,
      group: 'Reliefs',
    });

    // 9. Invoices matched
    const openInvoices = entityInvoices.filter((inv) =>
      inv.status === 'draft' || inv.status === 'sent' || inv.status === 'overdue'
    );
    items.push({
      key: 'invoicesMatched',
      label: 'Invoices matched',
      description: 'All sent invoices should be marked paid or cancelled before filing.',
      status: openInvoices.length === 0 ? 'complete' : 'warning',
      group: 'Invoices & WHT',
    });

    // 10. WHT verified
    const whtIncomeTx = transactions.filter(
      (t) => t.type === 'income' && (t.whtRate ?? 0) > 0
    );
    const allWhtSet = whtIncomeTx.every((t) => (t.whtDeducted ?? 0) > 0);
    const whtStatus: ChecklistItemStatus =
      whtIncomeTx.length === 0 || allWhtSet ? 'complete' : 'warning';
    items.push({
      key: 'wht',
      label: 'WHT credits verified',
      description: 'Withholding tax amounts must be set on all applicable income transactions.',
      status: whtStatus,
      group: 'Invoices & WHT',
    });

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

    // ---- Compute readiness ----
    const readyCount = items.filter(
      (i) => i.status === 'complete' || (i.status === 'warning' && WARNING_COUNTS_AS_READY_KEYS.has(i.key))
    ).length;
    const readinessPercent = Math.round((readyCount / items.length) * 100);

    // ---- Group items ----
    const grouped: Record<string, ChecklistItem[]> = {};
    for (const item of items) {
      if (!grouped[item.group]) grouped[item.group] = [];
      grouped[item.group].push(item);
    }

    return { items, readinessPercent, grouped };
  },
});
