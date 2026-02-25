/**
 * TaxEase Nigeria — Tax Engine Public API (PRD-3)
 *
 * Exports:
 *   getSummary          — reactive query: runs engine inline, re-evaluates on
 *                         any transaction / declaration / disposal change.
 *   getIncomeBreakdown  — reactive query: groups income transactions into four
 *                         buckets (freelance/client, foreign, investment, rental).
 *   refreshSummaryCache — mutation: writes engine output to taxYearSummaries
 *                         for fast dashboard reads.
 */

import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { getCurrentUser } from './auth';
import {
  runTaxEngine,
  getEngineForYear,
  TaxEngineTransaction,
  TaxEngineCapitalDisposal,
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

    const transactions: TaxEngineTransaction[] = rawTransactions.map((t) => ({
      type:              t.type,
      amountNgn:         t.amountNgn,
      currency:          t.currency,
      isDeductible:      t.isDeductible,
      deductiblePercent: t.deductiblePercent,
      whtDeducted:       t.whtDeducted,
      isVatInclusive:    (t as any).isVatInclusive,
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

    // ---- Run engine ----
    const result = runTaxEngine({
      transactions,
      declarations:    declaration ?? null,
      entityType:      entity.type,
      taxYear:         args.taxYear,
      capitalDisposals,
      isVatRegistered: entity.vatRegistered ?? false,
      outputVatNgn:    0, // invoices not yet implemented; pass 0
      // grossFixedAssetsNgn: not yet declared by user; undefined → assume exempt
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

    // Allow force-refresh (always recompute for current engine version)
    // Historical records with a different version are left intact.
    if (existing && existing.engineVersion !== currentEngineVersion) {
      // Different version — leave the historical record alone and return its ID.
      return existing._id;
    }

    // ---- Fetch transactions ----
    const rawTransactions = await ctx.db
      .query('transactions')
      .withIndex('by_entityId_taxYear', (q) =>
        q.eq('entityId', args.entityId).eq('taxYear', args.taxYear)
      )
      .collect();

    const transactions: TaxEngineTransaction[] = rawTransactions.map((t) => ({
      type:              t.type,
      amountNgn:         t.amountNgn,
      currency:          t.currency,
      isDeductible:      t.isDeductible,
      deductiblePercent: t.deductiblePercent,
      whtDeducted:       t.whtDeducted,
      isVatInclusive:    (t as any).isVatInclusive,
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

    // ---- Run engine ----
    const result = runTaxEngine({
      transactions,
      declarations:    declaration ?? null,
      entityType:      entity.type,
      taxYear:         args.taxYear,
      capitalDisposals,
      isVatRegistered: entity.vatRegistered ?? false,
      outputVatNgn:    0,
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
      computedAt:           now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, summaryFields);
      return existing._id;
    }

    return await ctx.db.insert('taxYearSummaries', summaryFields);
  },
});
