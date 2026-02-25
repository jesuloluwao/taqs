/**
 * TaxEase Nigeria — Reports Queries (PRD-7)
 *
 * Exports:
 *   getIncome       — income report summary (totals, monthly breakdown, category breakdown)
 *   getExpenses     — expense report summary (totals, deductible split, category breakdown)
 *   getYearOnYear   — year-on-year comparison using taxYearSummaries + transaction overlays
 *
 * Internal helpers (for CSV/PDF export actions):
 *   _getIncomeRows  — full transaction rows for income CSV export
 *   _getExpenseRows — full transaction rows for expenses CSV export
 *
 * All queries use indexed reads (by_entityId_taxYear, by_entityId_date).
 * Entity ownership is validated via getCurrentUser.
 */

import { internalQuery, query } from './_generated/server';
import { v } from 'convex/values';
import { getCurrentUser } from './auth';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Validate that the authenticated user owns the given entity.
 * Returns { user, entity } on success, null otherwise.
 */
async function validateOwnership(ctx: any, entityId: any) {
  const user = await getCurrentUser(ctx);
  if (!user) return null;
  const entity = await ctx.db.get(entityId);
  if (!entity || entity.userId !== user._id || entity.deletedAt) return null;
  return { user, entity };
}

/**
 * Look up a category document and return name + metadata.
 * Silently returns a fallback on any error.
 */
async function resolveCategory(
  ctx: any,
  categoryId: any
): Promise<{ name: string; color?: string; isDeductibleDefault?: boolean }> {
  if (!categoryId) return { name: 'Uncategorised' };
  try {
    const cat = await ctx.db.get(categoryId);
    if (!cat) return { name: 'Unknown' };
    return {
      name: cat.name as string,
      color: cat.color as string | undefined,
      isDeductibleDefault: cat.isDeductibleDefault as boolean | undefined,
    };
  } catch {
    return { name: 'Unknown' };
  }
}

// ---------------------------------------------------------------------------
// getIncome — public query
// ---------------------------------------------------------------------------

export const getIncome = query({
  args: {
    entityId: v.id('entities'),
    taxYear: v.optional(v.number()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ownership = await validateOwnership(ctx, args.entityId);
    if (!ownership) return null;

    // ---- Fetch credit transactions (income) ----
    let txList: any[];
    if (args.taxYear !== undefined) {
      txList = await ctx.db
        .query('transactions')
        .withIndex('by_entityId_taxYear', (q: any) =>
          q.eq('entityId', args.entityId).eq('taxYear', args.taxYear)
        )
        .filter((q: any) => q.eq(q.field('direction'), 'credit'))
        .collect();
    } else {
      txList = await ctx.db
        .query('transactions')
        .withIndex('by_entityId_date', (q: any) =>
          q.eq('entityId', args.entityId)
        )
        .filter((q: any) => q.eq(q.field('direction'), 'credit'))
        .collect();
      // JS-level date range filter (safe for optional bounds)
      if (args.startDate) txList = txList.filter((t: any) => t.date >= args.startDate!);
      if (args.endDate) txList = txList.filter((t: any) => t.date <= args.endDate!);
    }

    // ---- Totals ----
    const totalIncome = txList.reduce((s: number, t: any) => s + (t.amountNgn ?? 0), 0);
    const foreignIncome = txList
      .filter((t: any) => t.currency && t.currency !== 'NGN')
      .reduce((s: number, t: any) => s + (t.amountNgn ?? 0), 0);

    // ---- Monthly breakdown (months 1-12) ----
    const monthMap = new Map<number, number>();
    for (const t of txList) {
      const m = parseInt(t.date.slice(5, 7), 10);
      monthMap.set(m, (monthMap.get(m) ?? 0) + (t.amountNgn ?? 0));
    }
    const monthlyBreakdown = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      amount: monthMap.get(i + 1) ?? 0,
    }));
    const activeMonths = monthlyBreakdown.filter((m) => m.amount > 0).length;
    const averageMonthlyIncome =
      activeMonths > 0 ? Math.round(totalIncome / activeMonths) : 0;

    // ---- Category breakdown ----
    const catAmounts = new Map<string, number>();
    for (const t of txList) {
      const key = t.categoryId?.toString() ?? '__none__';
      catAmounts.set(key, (catAmounts.get(key) ?? 0) + (t.amountNgn ?? 0));
    }

    // Batch-resolve category names
    const catCache = new Map<string, { name: string; color?: string }>();
    for (const key of catAmounts.keys()) {
      if (key !== '__none__') {
        const info = await resolveCategory(ctx, key);
        catCache.set(key, info);
      }
    }

    const categoryBreakdown = Array.from(catAmounts.entries())
      .map(([id, amount]) => {
        const info =
          id === '__none__'
            ? { name: 'Uncategorised', color: undefined }
            : (catCache.get(id) ?? { name: 'Unknown', color: undefined });
        return {
          categoryId: id === '__none__' ? null : id,
          categoryName: info.name,
          color: info.color,
          amount,
          percentage:
            totalIncome > 0
              ? Math.round((amount / totalIncome) * 10000) / 100
              : 0,
        };
      })
      .sort((a, b) => b.amount - a.amount);

    return {
      totalIncome,
      foreignIncome,
      averageMonthlyIncome,
      monthlyBreakdown,
      categoryBreakdown,
    };
  },
});

// ---------------------------------------------------------------------------
// getExpenses — public query
// ---------------------------------------------------------------------------

export const getExpenses = query({
  args: {
    entityId: v.id('entities'),
    taxYear: v.optional(v.number()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ownership = await validateOwnership(ctx, args.entityId);
    if (!ownership) return null;

    // ---- Fetch debit transactions (expenses) ----
    let txList: any[];
    if (args.taxYear !== undefined) {
      txList = await ctx.db
        .query('transactions')
        .withIndex('by_entityId_taxYear', (q: any) =>
          q.eq('entityId', args.entityId).eq('taxYear', args.taxYear)
        )
        .filter((q: any) => q.eq(q.field('direction'), 'debit'))
        .collect();
    } else {
      txList = await ctx.db
        .query('transactions')
        .withIndex('by_entityId_date', (q: any) =>
          q.eq('entityId', args.entityId)
        )
        .filter((q: any) => q.eq(q.field('direction'), 'debit'))
        .collect();
      if (args.startDate) txList = txList.filter((t: any) => t.date >= args.startDate!);
      if (args.endDate) txList = txList.filter((t: any) => t.date <= args.endDate!);
    }

    // ---- Totals ----
    const totalExpenses = txList.reduce((s: number, t: any) => s + (t.amountNgn ?? 0), 0);

    // Deductible amount: amountNgn × (deductiblePercent / 100) when isDeductible = true
    const deductibleExpenses = txList
      .filter((t: any) => t.isDeductible === true)
      .reduce((s: number, t: any) => {
        const pct = t.deductiblePercent ?? 100;
        return s + Math.round(((t.amountNgn ?? 0) * pct) / 100);
      }, 0);
    const nonDeductibleExpenses = totalExpenses - deductibleExpenses;

    // ---- Monthly breakdown ----
    const monthMap = new Map<number, number>();
    for (const t of txList) {
      const m = parseInt(t.date.slice(5, 7), 10);
      monthMap.set(m, (monthMap.get(m) ?? 0) + (t.amountNgn ?? 0));
    }
    const monthlyBreakdown = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      amount: monthMap.get(i + 1) ?? 0,
    }));

    // ---- Category breakdown ----
    const catAmounts = new Map<
      string,
      { amount: number; isDeductible: boolean }
    >();
    for (const t of txList) {
      const key = t.categoryId?.toString() ?? '__none__';
      const existing = catAmounts.get(key);
      if (!existing) {
        catAmounts.set(key, {
          amount: t.amountNgn ?? 0,
          isDeductible: t.isDeductible === true,
        });
      } else {
        existing.amount += t.amountNgn ?? 0;
      }
    }

    const catCache = new Map<
      string,
      { name: string; color?: string; isDeductibleDefault?: boolean }
    >();
    for (const key of catAmounts.keys()) {
      if (key !== '__none__') {
        const info = await resolveCategory(ctx, key);
        catCache.set(key, info);
      }
    }

    const categoryBreakdown = Array.from(catAmounts.entries())
      .map(([id, data]) => {
        const info =
          id === '__none__'
            ? {
                name: 'Uncategorised',
                color: undefined,
                isDeductibleDefault: false,
              }
            : (catCache.get(id) ?? {
                name: 'Unknown',
                color: undefined,
                isDeductibleDefault: false,
              });
        return {
          categoryId: id === '__none__' ? null : id,
          categoryName: info.name,
          color: info.color,
          amount: data.amount,
          isDeductible: info.isDeductibleDefault ?? false,
          percentage:
            totalExpenses > 0
              ? Math.round((data.amount / totalExpenses) * 10000) / 100
              : 0,
        };
      })
      .sort((a, b) => b.amount - a.amount);

    return {
      totalExpenses,
      deductibleExpenses,
      nonDeductibleExpenses,
      monthlyBreakdown,
      categoryBreakdown,
    };
  },
});

// ---------------------------------------------------------------------------
// getYearOnYear — public query
// ---------------------------------------------------------------------------

export const getYearOnYear = query({
  args: {
    entityId: v.id('entities'),
    /** Default: previous calendar year (current FIRS filing year) */
    currentYear: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ownership = await validateOwnership(ctx, args.entityId);
    if (!ownership) return null;

    const currentYear = args.currentYear ?? new Date().getFullYear() - 1;
    const priorYear = currentYear - 1;

    // ---- Read cached summaries (indexed) ----
    const [currentSummary, priorSummary] = await Promise.all([
      ctx.db
        .query('taxYearSummaries')
        .withIndex('by_entityId_taxYear', (q: any) =>
          q.eq('entityId', args.entityId).eq('taxYear', currentYear)
        )
        .first(),
      ctx.db
        .query('taxYearSummaries')
        .withIndex('by_entityId_taxYear', (q: any) =>
          q.eq('entityId', args.entityId).eq('taxYear', priorYear)
        )
        .first(),
    ]);

    // ---- Monthly overlays: credit (income) + debit (expenses) for both years ----
    const [currentIncomeTx, priorIncomeTx, currentExpenseTx, priorExpenseTx] =
      await Promise.all([
        ctx.db
          .query('transactions')
          .withIndex('by_entityId_taxYear', (q: any) =>
            q.eq('entityId', args.entityId).eq('taxYear', currentYear)
          )
          .filter((q: any) => q.eq(q.field('direction'), 'credit'))
          .collect(),
        ctx.db
          .query('transactions')
          .withIndex('by_entityId_taxYear', (q: any) =>
            q.eq('entityId', args.entityId).eq('taxYear', priorYear)
          )
          .filter((q: any) => q.eq(q.field('direction'), 'credit'))
          .collect(),
        ctx.db
          .query('transactions')
          .withIndex('by_entityId_taxYear', (q: any) =>
            q.eq('entityId', args.entityId).eq('taxYear', currentYear)
          )
          .filter((q: any) => q.eq(q.field('direction'), 'debit'))
          .collect(),
        ctx.db
          .query('transactions')
          .withIndex('by_entityId_taxYear', (q: any) =>
            q.eq('entityId', args.entityId).eq('taxYear', priorYear)
          )
          .filter((q: any) => q.eq(q.field('direction'), 'debit'))
          .collect(),
      ]);

    function buildMonthly(txs: any[]): Array<{ month: number; amount: number }> {
      const map = new Map<number, number>();
      for (const t of txs) {
        const m = parseInt(t.date.slice(5, 7), 10);
        map.set(m, (map.get(m) ?? 0) + (t.amountNgn ?? 0));
      }
      return Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        amount: map.get(i + 1) ?? 0,
      }));
    }

    const currentMonthlyIncome = buildMonthly(currentIncomeTx);
    const priorMonthlyIncome = buildMonthly(priorIncomeTx);
    const currentMonthlyExpenses = buildMonthly(currentExpenseTx);
    const priorMonthlyExpenses = buildMonthly(priorExpenseTx);

    // Prefer cached summaries; fall back to transaction computation
    const currentIncome =
      currentSummary?.totalGrossIncome ??
      currentIncomeTx.reduce((s: number, t: any) => s + (t.amountNgn ?? 0), 0);
    const priorIncome =
      priorSummary?.totalGrossIncome ??
      priorIncomeTx.reduce((s: number, t: any) => s + (t.amountNgn ?? 0), 0);
    const currentExpenses =
      currentSummary?.totalBusinessExpenses ??
      currentExpenseTx.reduce((s: number, t: any) => s + (t.amountNgn ?? 0), 0);
    const priorExpenses =
      priorSummary?.totalBusinessExpenses ??
      priorExpenseTx.reduce((s: number, t: any) => s + (t.amountNgn ?? 0), 0);
    const currentTaxPayable = currentSummary?.netTaxPayable ?? 0;
    const priorTaxPayable = priorSummary?.netTaxPayable ?? 0;

    function pctChange(curr: number, prior: number): number | null {
      if (prior === 0) return null;
      return Math.round(((curr - prior) / prior) * 10000) / 100;
    }

    return {
      currentYear,
      priorYear,
      currentIncome,
      priorIncome,
      incomeChange: pctChange(currentIncome, priorIncome),
      currentExpenses,
      priorExpenses,
      expensesChange: pctChange(currentExpenses, priorExpenses),
      currentTaxPayable,
      priorTaxPayable,
      taxPayableChange: pctChange(currentTaxPayable, priorTaxPayable),
      currentMonthlyIncome,
      priorMonthlyIncome,
      currentMonthlyExpenses,
      priorMonthlyExpenses,
    };
  },
});

// ---------------------------------------------------------------------------
// _getIncomeRows — internal query (full rows for CSV export)
// ---------------------------------------------------------------------------

export const _getIncomeRows = internalQuery({
  args: {
    entityId: v.id('entities'),
    taxYear: v.optional(v.number()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let txList: any[];
    if (args.taxYear !== undefined) {
      txList = await ctx.db
        .query('transactions')
        .withIndex('by_entityId_taxYear', (q: any) =>
          q.eq('entityId', args.entityId).eq('taxYear', args.taxYear)
        )
        .filter((q: any) => q.eq(q.field('direction'), 'credit'))
        .collect();
    } else {
      txList = await ctx.db
        .query('transactions')
        .withIndex('by_entityId_date', (q: any) =>
          q.eq('entityId', args.entityId)
        )
        .filter((q: any) => q.eq(q.field('direction'), 'credit'))
        .collect();
      if (args.startDate) txList = txList.filter((t: any) => t.date >= args.startDate!);
      if (args.endDate) txList = txList.filter((t: any) => t.date <= args.endDate!);
    }

    // Batch-resolve category names
    const catCache = new Map<string, string>();
    for (const t of txList) {
      if (t.categoryId) {
        const key = t.categoryId.toString();
        if (!catCache.has(key)) {
          const cat = await ctx.db.get(t.categoryId).catch(() => null);
          catCache.set(key, (cat as any)?.name ?? 'Unknown');
        }
      }
    }

    return txList.map((t: any) => ({
      date: t.date as string,
      description: t.description as string,
      category: t.categoryId
        ? (catCache.get(t.categoryId.toString()) ?? 'Unknown')
        : 'Uncategorised',
      amountNgn: (t.amountNgn ?? 0) as number,
      currency: (t.currency ?? 'NGN') as string,
      originalAmount: (t.amount ?? 0) as number,
      fxRate: (t.fxRate ?? 1) as number,
      whtDeducted: (t.whtDeducted ?? 0) as number,
    }));
  },
});

// ---------------------------------------------------------------------------
// _getExpenseRows — internal query (full rows for CSV export)
// ---------------------------------------------------------------------------

export const _getExpenseRows = internalQuery({
  args: {
    entityId: v.id('entities'),
    taxYear: v.optional(v.number()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let txList: any[];
    if (args.taxYear !== undefined) {
      txList = await ctx.db
        .query('transactions')
        .withIndex('by_entityId_taxYear', (q: any) =>
          q.eq('entityId', args.entityId).eq('taxYear', args.taxYear)
        )
        .filter((q: any) => q.eq(q.field('direction'), 'debit'))
        .collect();
    } else {
      txList = await ctx.db
        .query('transactions')
        .withIndex('by_entityId_date', (q: any) =>
          q.eq('entityId', args.entityId)
        )
        .filter((q: any) => q.eq(q.field('direction'), 'debit'))
        .collect();
      if (args.startDate) txList = txList.filter((t: any) => t.date >= args.startDate!);
      if (args.endDate) txList = txList.filter((t: any) => t.date <= args.endDate!);
    }

    // Batch-resolve category names
    const catCache = new Map<string, string>();
    for (const t of txList) {
      if (t.categoryId) {
        const key = t.categoryId.toString();
        if (!catCache.has(key)) {
          const cat = await ctx.db.get(t.categoryId).catch(() => null);
          catCache.set(key, (cat as any)?.name ?? 'Unknown');
        }
      }
    }

    return txList.map((t: any) => ({
      date: t.date as string,
      description: t.description as string,
      category: t.categoryId
        ? (catCache.get(t.categoryId.toString()) ?? 'Unknown')
        : 'Uncategorised',
      type: (t.type ?? 'uncategorised') as string,
      amountNgn: (t.amountNgn ?? 0) as number,
      isDeductible: t.isDeductible === true,
      deductibleAmountNgn: t.isDeductible
        ? Math.round(((t.amountNgn ?? 0) * (t.deductiblePercent ?? 100)) / 100)
        : 0,
      currency: (t.currency ?? 'NGN') as string,
    }));
  },
});
