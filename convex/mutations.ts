import { mutation } from './_generated/server';
import { getOrCreateCurrentUser } from './auth';
import { v } from 'convex/values';

/**
 * Upsert user profile.
 */
export const upsertProfile = mutation({
  args: {
    userType: v.union(v.literal('freelancer'), v.literal('business'), v.literal('mixed')),
    businessName: v.optional(v.string()),
    tin: v.optional(v.string()),
    currency: v.optional(v.union(v.literal('NGN'), v.literal('USD'), v.literal('GBP'), v.literal('EUR'))),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    if (!user) {
      throw new Error('Not authenticated');
    }

    const existing = await ctx.db
      .query('profiles')
      .withIndex('by_user_id', (q) => q.eq('userId', user._id))
      .first();

    const now = Date.now();
    const data = {
      userId: user._id,
      userType: args.userType,
      businessName: args.businessName,
      tin: args.tin,
      currency: args.currency || 'NGN',
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, data);
      return existing._id;
    } else {
      return await ctx.db.insert('profiles', {
        ...data,
        createdAt: now,
      });
    }
  },
});

/**
 * Create a new transaction.
 */
export const createTransaction = mutation({
  args: {
    type: v.union(v.literal('income'), v.literal('expense')),
    amountKobo: v.number(),
    currency: v.optional(v.union(v.literal('NGN'), v.literal('USD'), v.literal('GBP'), v.literal('EUR'))),
    category: v.string(),
    description: v.optional(v.string()),
    transactionDate: v.number(),
    source: v.optional(v.union(v.literal('manual'), v.literal('bank_import'))),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    if (!user) {
      throw new Error('Not authenticated');
    }

    const now = Date.now();
    return await ctx.db.insert('transactions', {
      userId: user._id,
      type: args.type,
      amountKobo: args.amountKobo,
      currency: args.currency || 'NGN',
      category: args.category,
      description: args.description,
      transactionDate: args.transactionDate,
      source: args.source || 'manual',
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Delete a transaction.
 */
export const deleteTransaction = mutation({
  args: {
    id: v.id('transactions'),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    if (!user) {
      throw new Error('Not authenticated');
    }

    const transaction = await ctx.db.get(args.id);
    if (!transaction || transaction.userId !== user._id) {
      throw new Error('Transaction not found or unauthorized');
    }

    await ctx.db.delete(args.id);
  },
});

