import { mutation } from './_generated/server';
import { getOrCreateCurrentUser } from './auth';
import { v } from 'convex/values';

/**
 * Update user profile fields (previously upsertProfile on the profiles table).
 */
export const updateUser = mutation({
  args: {
    fullName: v.optional(v.string()),
    phone: v.optional(v.string()),
    userType: v.optional(v.union(v.literal('freelancer'), v.literal('sme'))),
    profession: v.optional(v.string()),
    preferredCurrency: v.optional(
      v.union(v.literal('NGN'), v.literal('USD'), v.literal('GBP'), v.literal('EUR'))
    ),
    onboardingComplete: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    if (!user) {
      throw new Error('Not authenticated');
    }

    await ctx.db.patch(user._id, {
      ...args,
      updatedAt: Date.now(),
    });

    return user._id;
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
