import { mutation, internalMutation, internalQuery } from './_generated/server';
import { getCurrentUser } from './auth';
import { v } from 'convex/values';

/**
 * Register (upsert) a push token for the current user.
 * If the token already exists, updates platform, active, and lastUsedAt.
 * If not, inserts a new record.
 */
export const register = mutation({
  args: {
    token: v.string(),
    platform: v.union(v.literal('ios'), v.literal('android'), v.literal('web')),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error('Unauthenticated');

    const existing = await ctx.db
      .query('pushTokens')
      .withIndex('by_token', (q) => q.eq('token', args.token))
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        userId: user._id,
        platform: args.platform,
        active: true,
        lastUsedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert('pushTokens', {
      userId: user._id,
      token: args.token,
      platform: args.platform,
      active: true,
      lastUsedAt: now,
    });
  },
});

// ================== INTERNAL HELPERS (used by push.ts action) ==================

/**
 * Internal query: fetch active push tokens for a user.
 */
export const _getActiveTokens = internalQuery({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('pushTokens')
      .withIndex('by_userId_active', (q) => q.eq('userId', args.userId).eq('active', true))
      .collect();
  },
});

/**
 * Internal mutation: deactivate stale push tokens (NotRegistered FCM error).
 */
export const _deactivateTokens = internalMutation({
  args: { tokenIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    await Promise.all(
      args.tokenIds.map((id) =>
        ctx.db.patch(id as any, { active: false })
      )
    );
  },
});
