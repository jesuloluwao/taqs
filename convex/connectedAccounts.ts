import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { getCurrentUser } from './auth';

/**
 * Get a single connected account by ID (with ownership check).
 */
export const get = query({
  args: { id: v.id('connectedAccounts') },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    const account = await ctx.db.get(args.id);
    if (!account || account.userId !== user._id) return null;
    return account;
  },
});

/**
 * List all connected accounts for a given entity.
 */
export const list = query({
  args: { entityId: v.id('entities') },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const accounts = await ctx.db
      .query('connectedAccounts')
      .withIndex('by_entityId', (q) => q.eq('entityId', args.entityId))
      .collect();

    const filtered = accounts.filter((a) => a.userId === user._id);

    // Sort: active first, then error/expired, then disconnected
    const statusOrder = { active: 0, expired: 1, error: 1, disconnected: 2 };
    return filtered.sort(
      (a, b) =>
        (statusOrder[a.status ?? 'active'] ?? 0) - (statusOrder[b.status ?? 'active'] ?? 0)
    );
  },
});

/**
 * Add a new connected account (v1: statement_upload or manual only).
 */
export const add = mutation({
  args: {
    entityId: v.id('entities'),
    accountName: v.string(),
    provider: v.union(v.literal('statement_upload'), v.literal('manual')),
    currency: v.optional(
      v.union(v.literal('NGN'), v.literal('USD'), v.literal('GBP'), v.literal('EUR'))
    ),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    const id = await ctx.db.insert('connectedAccounts', {
      entityId: args.entityId,
      userId: user._id,
      provider: args.provider,
      accountName: args.accountName.trim(),
      currency: args.currency ?? 'NGN',
      status: 'active',
    });
    return id;
  },
});

/**
 * Disconnect a connected account (sets status to 'disconnected').
 * Existing transactions are preserved.
 */
export const disconnect = mutation({
  args: { id: v.id('connectedAccounts') },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    const account = await ctx.db.get(args.id);
    if (!account) throw new Error('Account not found');
    if (account.userId !== user._id) throw new Error('Not your account');

    await ctx.db.patch(args.id, { status: 'disconnected' });
  },
});
