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

function parseDateArg(date: string | undefined, endOfDay = false): number | null {
  if (!date) return null;
  const suffix = endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z';
  const parsed = Date.parse(`${date}${suffix}`);
  return Number.isNaN(parsed) ? null : parsed;
}

function txDateMs(tx: any): number {
  if (typeof tx?.date === 'number') return tx.date;
  if (typeof tx?.date === 'string') {
    const parsed = Date.parse(tx.date);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
}

function txMonth(tx: any): number {
  return new Date(txDateMs(tx)).getUTCMonth() + 1;
}

function txIsoDate(tx: any): string {
  return new Date(txDateMs(tx)).toISOString().slice(0, 10);
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
    bankAccountIds: v.optional(v.array(v.id('bankAccounts'))),
    includeUnlinked: v.optional(v.boolean()),
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
      const startMs = parseDateArg(args.startDate);
      const endMs = parseDateArg(args.endDate, true);
      if (startMs !== null) txList = txList.filter((t: any) => txDateMs(t) >= startMs);
      if (endMs !== null) txList = txList.filter((t: any) => txDateMs(t) <= endMs);
    }

    // Bank account filtering
    if (args.bankAccountIds?.length || args.includeUnlinked) {
      const accountIdSet = new Set(args.bankAccountIds ?? []);
      txList = txList.filter((tx: any) => {
        if (tx.bankAccountId && accountIdSet.has(tx.bankAccountId)) return true;
        if (args.includeUnlinked && !tx.bankAccountId) return true;
        return false;
      });
    }

    // ---- Totals ----
    const totalIncome = txList.reduce((s: number, t: any) => s + (t.amountNgn ?? 0), 0);
    const foreignIncome = txList
      .filter((t: any) => t.currency && t.currency !== 'NGN')
      .reduce((s: number, t: any) => s + (t.amountNgn ?? 0), 0);

    // ---- Monthly breakdown (months 1-12) ----
    const monthMap = new Map<number, number>();
    for (const t of txList) {
      const m = txMonth(t);
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
    bankAccountIds: v.optional(v.array(v.id('bankAccounts'))),
    includeUnlinked: v.optional(v.boolean()),
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
      const startMs = parseDateArg(args.startDate);
      const endMs = parseDateArg(args.endDate, true);
      if (startMs !== null) txList = txList.filter((t: any) => txDateMs(t) >= startMs);
      if (endMs !== null) txList = txList.filter((t: any) => txDateMs(t) <= endMs);
    }

    // Bank account filtering
    if (args.bankAccountIds?.length || args.includeUnlinked) {
      const accountIdSet = new Set(args.bankAccountIds ?? []);
      txList = txList.filter((tx: any) => {
        if (tx.bankAccountId && accountIdSet.has(tx.bankAccountId)) return true;
        if (args.includeUnlinked && !tx.bankAccountId) return true;
        return false;
      });
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
      const m = txMonth(t);
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
    bankAccountIds: v.optional(v.array(v.id('bankAccounts'))),
    includeUnlinked: v.optional(v.boolean()),
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

    // Bank account filtering
    function filterByBankAccount(txs: any[]) {
      if (!args.bankAccountIds?.length && !args.includeUnlinked) return txs;
      const accountIdSet = new Set(args.bankAccountIds ?? []);
      return txs.filter((tx: any) => {
        if (tx.bankAccountId && accountIdSet.has(tx.bankAccountId)) return true;
        if (args.includeUnlinked && !tx.bankAccountId) return true;
        return false;
      });
    }

    const filteredCurrentIncomeTx = filterByBankAccount(currentIncomeTx);
    const filteredPriorIncomeTx = filterByBankAccount(priorIncomeTx);
    const filteredCurrentExpenseTx = filterByBankAccount(currentExpenseTx);
    const filteredPriorExpenseTx = filterByBankAccount(priorExpenseTx);

    function buildMonthly(txs: any[]): Array<{ month: number; amount: number }> {
      const map = new Map<number, number>();
      for (const t of txs) {
        const m = txMonth(t);
        map.set(m, (map.get(m) ?? 0) + (t.amountNgn ?? 0));
      }
      return Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        amount: map.get(i + 1) ?? 0,
      }));
    }

    const currentMonthlyIncome = buildMonthly(filteredCurrentIncomeTx);
    const priorMonthlyIncome = buildMonthly(filteredPriorIncomeTx);
    const currentMonthlyExpenses = buildMonthly(filteredCurrentExpenseTx);
    const priorMonthlyExpenses = buildMonthly(filteredPriorExpenseTx);

    // When bank account filters are active, compute totals from filtered transactions
    // (taxYearSummaries cache has no per-account granularity)
    const isFiltered = !!(args.bankAccountIds?.length || args.includeUnlinked);

    const currentIncome = isFiltered
      ? filteredCurrentIncomeTx.reduce((s: number, t: any) => s + (t.amountNgn ?? 0), 0)
      : currentSummary?.totalGrossIncome ??
        currentIncomeTx.reduce((s: number, t: any) => s + (t.amountNgn ?? 0), 0);
    const priorIncome = isFiltered
      ? filteredPriorIncomeTx.reduce((s: number, t: any) => s + (t.amountNgn ?? 0), 0)
      : priorSummary?.totalGrossIncome ??
        priorIncomeTx.reduce((s: number, t: any) => s + (t.amountNgn ?? 0), 0);
    const currentExpenses = isFiltered
      ? filteredCurrentExpenseTx.reduce((s: number, t: any) => s + (t.amountNgn ?? 0), 0)
      : currentSummary?.totalBusinessExpenses ??
        currentExpenseTx.reduce((s: number, t: any) => s + (t.amountNgn ?? 0), 0);
    const priorExpenses = isFiltered
      ? filteredPriorExpenseTx.reduce((s: number, t: any) => s + (t.amountNgn ?? 0), 0)
      : priorSummary?.totalBusinessExpenses ??
        priorExpenseTx.reduce((s: number, t: any) => s + (t.amountNgn ?? 0), 0);
    // Can't compute per-account tax; set to 0 when filtered
    const currentTaxPayable = isFiltered ? 0 : (currentSummary?.netTaxPayable ?? 0);
    const priorTaxPayable = isFiltered ? 0 : (priorSummary?.netTaxPayable ?? 0);

    function pctChange(curr: number, prior: number): number | null {
      if (prior === 0) return null;
      return Math.round(((curr - prior) / prior) * 10000) / 100;
    }

    // Effective tax rate = netTaxPayable / totalGrossIncome (as percentage)
    // When filtered, tax is 0 so effective rate is 0
    const currentEffectiveTaxRate = isFiltered
      ? 0
      : currentSummary?.effectiveTaxRate != null
        ? Math.round(currentSummary.effectiveTaxRate * 10000) / 100
        : currentIncome > 0
          ? Math.round((currentTaxPayable / currentIncome) * 10000) / 100
          : 0;
    const priorEffectiveTaxRate = isFiltered
      ? 0
      : priorSummary?.effectiveTaxRate != null
        ? Math.round(priorSummary.effectiveTaxRate * 10000) / 100
        : priorIncome > 0
          ? Math.round((priorTaxPayable / priorIncome) * 10000) / 100
          : 0;

    // Determine if there's any prior year data
    const hasPriorData = isFiltered
      ? filteredPriorIncomeTx.length > 0 || filteredPriorExpenseTx.length > 0
      : priorIncomeTx.length > 0 || priorExpenseTx.length > 0 || !!priorSummary;

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
      currentEffectiveTaxRate,
      priorEffectiveTaxRate,
      effectiveTaxRateChange: pctChange(currentEffectiveTaxRate, priorEffectiveTaxRate),
      hasPriorData,
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
    bankAccountIds: v.optional(v.array(v.id('bankAccounts'))),
    includeUnlinked: v.optional(v.boolean()),
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
      const startMs = parseDateArg(args.startDate);
      const endMs = parseDateArg(args.endDate, true);
      if (startMs !== null) txList = txList.filter((t: any) => txDateMs(t) >= startMs);
      if (endMs !== null) txList = txList.filter((t: any) => txDateMs(t) <= endMs);
    }

    // Bank account filtering
    if (args.bankAccountIds?.length || args.includeUnlinked) {
      const accountIdSet = new Set(args.bankAccountIds ?? []);
      txList = txList.filter((tx: any) => {
        if (tx.bankAccountId && accountIdSet.has(tx.bankAccountId)) return true;
        if (args.includeUnlinked && !tx.bankAccountId) return true;
        return false;
      });
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
      date: txIsoDate(t),
      description: t.description as string,
      category: t.categoryId
        ? (catCache.get(t.categoryId.toString()) ?? 'Unknown')
        : 'Uncategorised',
      amountNgn: (t.amountNgn ?? 0) as number,
      currency: (t.currency ?? 'NGN') as string,
      originalAmount: (t.amount ?? 0) as number,
      fxRate: (t.fxRate ?? 1) as number,
      whtDeducted: (t.whtDeducted ?? 0) as number,
      bankAccountId: (t.bankAccountId ?? null) as string | null,
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
    bankAccountIds: v.optional(v.array(v.id('bankAccounts'))),
    includeUnlinked: v.optional(v.boolean()),
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
      const startMs = parseDateArg(args.startDate);
      const endMs = parseDateArg(args.endDate, true);
      if (startMs !== null) txList = txList.filter((t: any) => txDateMs(t) >= startMs);
      if (endMs !== null) txList = txList.filter((t: any) => txDateMs(t) <= endMs);
    }

    // Bank account filtering
    if (args.bankAccountIds?.length || args.includeUnlinked) {
      const accountIdSet = new Set(args.bankAccountIds ?? []);
      txList = txList.filter((tx: any) => {
        if (tx.bankAccountId && accountIdSet.has(tx.bankAccountId)) return true;
        if (args.includeUnlinked && !tx.bankAccountId) return true;
        return false;
      });
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
      date: txIsoDate(t),
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
      bankAccountId: (t.bankAccountId ?? null) as string | null,
    }));
  },
});

// ---------------------------------------------------------------------------
// getByAccount — public query (By Account tab)
// ---------------------------------------------------------------------------

export const getByAccount = query({
  args: {
    entityId: v.id('entities'),
    taxYear: v.optional(v.number()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ownership = await validateOwnership(ctx, args.entityId);
    if (!ownership) return null;

    // ---- Fetch all transactions for the period ----
    let txList: any[];
    if (args.taxYear !== undefined) {
      txList = await ctx.db
        .query('transactions')
        .withIndex('by_entityId_taxYear', (q: any) =>
          q.eq('entityId', args.entityId).eq('taxYear', args.taxYear)
        )
        .collect();
    } else {
      txList = await ctx.db
        .query('transactions')
        .withIndex('by_entityId_date', (q: any) =>
          q.eq('entityId', args.entityId)
        )
        .collect();
      const startMs = parseDateArg(args.startDate);
      const endMs = parseDateArg(args.endDate, true);
      if (startMs !== null) txList = txList.filter((t: any) => txDateMs(t) >= startMs);
      if (endMs !== null) txList = txList.filter((t: any) => txDateMs(t) <= endMs);
    }

    // ---- Group by bankAccountId ----
    const groups = new Map<
      string,
      { income: number; expenses: number; count: number }
    >();
    const UNLINKED_KEY = '__unlinked__';

    for (const t of txList) {
      const key = t.bankAccountId?.toString() ?? UNLINKED_KEY;
      let group = groups.get(key);
      if (!group) {
        group = { income: 0, expenses: 0, count: 0 };
        groups.set(key, group);
      }
      const amount = t.amountNgn ?? 0;
      if (t.type === 'income') {
        group.income += amount;
      } else if (t.type === 'business_expense' || t.type === 'personal_expense') {
        group.expenses += amount;
      }
      group.count += 1;
    }

    // ---- Fetch bank account names ----
    const accountIds = Array.from(groups.keys()).filter((k) => k !== UNLINKED_KEY);
    const accountNameMap = new Map<string, string>();
    for (const id of accountIds) {
      try {
        const account = await ctx.db.get(id as any);
        if (account) {
          const name = (account as any).nickname ?? (account as any).accountName ?? (account as any).bankName ?? 'Unknown';
          accountNameMap.set(id, name as string);
        } else {
          accountNameMap.set(id, 'Deleted Account');
        }
      } catch {
        accountNameMap.set(id, 'Unknown');
      }
    }

    // ---- Build result array ----
    const results: Array<{
      bankAccountId: string | null;
      accountName: string;
      income: number;
      expenses: number;
      net: number;
      transactionCount: number;
    }> = [];

    for (const [key, data] of groups.entries()) {
      if (key === UNLINKED_KEY) continue;
      results.push({
        bankAccountId: key,
        accountName: accountNameMap.get(key) ?? 'Unknown',
        income: data.income,
        expenses: data.expenses,
        net: data.income - data.expenses,
        transactionCount: data.count,
      });
    }

    // Sort named accounts alphabetically
    results.sort((a, b) => a.accountName.localeCompare(b.accountName));

    // Append unlinked last
    const unlinkedGroup = groups.get(UNLINKED_KEY);
    if (unlinkedGroup) {
      results.push({
        bankAccountId: null,
        accountName: 'Unlinked',
        income: unlinkedGroup.income,
        expenses: unlinkedGroup.expenses,
        net: unlinkedGroup.income - unlinkedGroup.expenses,
        transactionCount: unlinkedGroup.count,
      });
    }

    return results;
  },
});
