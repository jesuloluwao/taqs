import { query } from './_generated/server';
import { getCurrentUser } from './auth';
import { v } from 'convex/values';

/**
 * Get the current user (read-only).
 * Returns null if not authenticated or user doesn't exist.
 */
export const getMyUser = query({
  handler: async (ctx) => {
    return await getCurrentUser(ctx);
  },
});

/**
 * Get dashboard summary for a specific entity and tax year.
 * Aggregates income, expenses, and deductible amounts from transactions.
 */
export const getDashboardSummary = query({
  args: {
    entityId: v.id('entities'),
    taxYear: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return null;
    }

    const entity = await ctx.db.get(args.entityId);
    if (!entity || entity.userId !== user._id || entity.deletedAt) {
      return null;
    }

    const taxYear = args.taxYear ?? new Date().getFullYear();

    const transactions = await ctx.db
      .query('transactions')
      .withIndex('by_entityId_taxYear', (q) =>
        q.eq('entityId', args.entityId).eq('taxYear', taxYear)
      )
      .collect();

    const now = Date.now();
    const startOfMonth = new Date(now);
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const monthStart = startOfMonth.getTime();

    // YTD aggregations (all transactions for the tax year)
    const ytdIncome = transactions
      .filter((t) => t.type === 'income')
      .reduce((sum, t) => sum + t.amountNgn, 0);

    const ytdExpenses = transactions
      .filter((t) => t.type === 'business_expense' || t.type === 'personal_expense')
      .reduce((sum, t) => sum + t.amountNgn, 0);

    const ytdDeductible = transactions
      .filter((t) => t.isDeductible && (t.type === 'business_expense'))
      .reduce((sum, t) => {
        const pct = t.deductiblePercent ?? 100;
        return sum + Math.round((t.amountNgn * pct) / 100);
      }, 0);

    // Monthly aggregations
    const monthlyIncome = transactions
      .filter((t) => t.type === 'income' && t.date >= monthStart)
      .reduce((sum, t) => sum + t.amountNgn, 0);

    const monthlyExpense = transactions
      .filter((t) => (t.type === 'business_expense' || t.type === 'personal_expense') && t.date >= monthStart)
      .reduce((sum, t) => sum + t.amountNgn, 0);

    const uncategorisedCount = transactions.filter((t) => t.type === 'uncategorised').length;

    return {
      taxYear,
      monthlyIncome,
      monthlyExpense,
      ytdIncome,
      ytdExpenses,
      ytdDeductible,
      transactionCount: transactions.length,
      uncategorisedCount,
    };
  },
});

/**
 * List transactions for an entity with optional filters.
 */
export const listTransactions = query({
  args: {
    entityId: v.id('entities'),
    taxYear: v.optional(v.number()),
    type: v.optional(v.union(
      v.literal('income'),
      v.literal('business_expense'),
      v.literal('personal_expense'),
      v.literal('transfer'),
      v.literal('uncategorised')
    )),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return [];
    }

    const entity = await ctx.db.get(args.entityId);
    if (!entity || entity.userId !== user._id || entity.deletedAt) {
      return [];
    }

    let transactions;

    if (args.taxYear) {
      transactions = await ctx.db
        .query('transactions')
        .withIndex('by_entityId_taxYear', (q) =>
          q.eq('entityId', args.entityId).eq('taxYear', args.taxYear!)
        )
        .collect();
    } else {
      transactions = await ctx.db
        .query('transactions')
        .withIndex('by_entityId_date', (q) => q.eq('entityId', args.entityId))
        .collect();
    }

    // Apply filters
    if (args.type) {
      transactions = transactions.filter((t) => t.type === args.type);
    }

    if (args.startDate) {
      transactions = transactions.filter((t) => t.date >= args.startDate!);
    }

    if (args.endDate) {
      transactions = transactions.filter((t) => t.date <= args.endDate!);
    }

    // Sort by date descending
    transactions.sort((a, b) => b.date - a.date);

    return transactions;
  },
});

/**
 * Get a single transaction by ID.
 */
export const getTransaction = query({
  args: {
    id: v.id('transactions'),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return null;
    }

    const transaction = await ctx.db.get(args.id);
    if (!transaction || transaction.userId !== user._id) {
      return null;
    }

    return transaction;
  },
});

/**
 * List import jobs for an entity.
 */
export const listImportJobs = query({
  args: {
    entityId: v.id('entities'),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return [];
    }

    const entity = await ctx.db.get(args.entityId);
    if (!entity || entity.userId !== user._id || entity.deletedAt) {
      return [];
    }

    return await ctx.db
      .query('importJobs')
      .withIndex('by_entityId', (q) => q.eq('entityId', args.entityId))
      .order('desc')
      .collect();
  },
});

/**
 * Get a single import job by ID.
 */
export const getImportJob = query({
  args: {
    id: v.id('importJobs'),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return null;
    }

    const job = await ctx.db.get(args.id);
    if (!job || job.userId !== user._id) {
      return null;
    }

    return job;
  },
});
