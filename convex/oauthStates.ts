import { v } from 'convex/values';
import { internalMutation, mutation } from './_generated/server';

/**
 * Validates a state token from an OAuth callback.
 *
 * - Looks up by stateToken
 * - Verifies not expired
 * - Deletes the entry (single-use)
 * - Returns the stored state data
 *
 * Throws if the token is invalid or expired.
 */
export const validate = mutation({
  args: {
    stateToken: v.string(),
  },
  handler: async (ctx, { stateToken }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Unauthenticated');

    const entry = await ctx.db
      .query('oauthStates')
      .withIndex('by_stateToken', (q) => q.eq('stateToken', stateToken))
      .unique();

    if (!entry) throw new Error('Invalid state token');
    if (entry.expiresAt < Date.now()) {
      // Clean up expired entry
      await ctx.db.delete(entry._id);
      throw new Error('State token has expired');
    }

    // Consume the token (single-use)
    await ctx.db.delete(entry._id);

    return {
      userId: entry.userId,
      entityId: entry.entityId,
      provider: entry.provider,
      redirectUri: entry.redirectUri,
      expiresAt: entry.expiresAt,
    };
  },
});

/**
 * Internal mutation: delete all expired oauthStates entries.
 * Called by the hourly cron job.
 */
export const _cleanupExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query('oauthStates')
      .withIndex('by_expiresAt', (q) => q.lt('expiresAt', now))
      .collect();

    let deleted = 0;
    for (const entry of expired) {
      await ctx.db.delete(entry._id);
      deleted++;
    }
    return { deleted };
  },
});
