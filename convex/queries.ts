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
 * Get dashboard summary (monthly and YTD totals).
 */
export const getDashboardSummary = query({
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return null;
    }

    const now = Date.now();
    const startOfMonth = new Date(now);
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const monthStart = startOfMonth.getTime();

    const startOfYear = new Date(now);
    startOfYear.setMonth(0, 1);
    startOfYear.setHours(0, 0, 0, 0);
    const yearStart = startOfYear.getTime();

    // Get all transactions for this user
    const allTransactions = await ctx.db
      .query('transactions')
      .withIndex('by_user_id', (q) => q.eq('userId', user._id))
      .collect();

    // Calculate monthly totals
    const monthlyIncome = allTransactions
      .filter((t) => t.type === 'income' && t.transactionDate >= monthStart)
      .reduce((sum, t) => sum + t.amountKobo, 0);

    const monthlyExpense = allTransactions
      .filter((t) => t.type === 'expense' && t.transactionDate >= monthStart)
      .reduce((sum, t) => sum + t.amountKobo, 0);

    // Calculate YTD totals
    const ytdIncome = allTransactions
      .filter((t) => t.type === 'income' && t.transactionDate >= yearStart)
      .reduce((sum, t) => sum + t.amountKobo, 0);

    const ytdExpense = allTransactions
      .filter((t) => t.type === 'expense' && t.transactionDate >= yearStart)
      .reduce((sum, t) => sum + t.amountKobo, 0);

    return {
      monthlyIncome,
      monthlyExpense,
      ytdIncome,
      ytdExpense,
    };
  },
});

/**
 * List transactions with optional filters.
 */
export const listTransactions = query({
  args: {
    type: v.optional(v.union(v.literal('income'), v.literal('expense'))),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return [];
    }

    let transactions = await ctx.db
      .query('transactions')
      .withIndex('by_user_id', (q) => q.eq('userId', user._id))
      .collect();

    // Apply filters
    if (args.type) {
      transactions = transactions.filter((t) => t.type === args.type);
    }

    if (args.startDate) {
      transactions = transactions.filter((t) => t.transactionDate >= args.startDate!);
    }

    if (args.endDate) {
      transactions = transactions.filter((t) => t.transactionDate <= args.endDate!);
    }

    // Sort by date descending
    transactions.sort((a, b) => b.transactionDate - a.transactionDate);

    return transactions;
  },
});
