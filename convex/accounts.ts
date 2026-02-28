import { v } from 'convex/values';
import { mutation } from './_generated/server';

/**
 * Initiates an OAuth flow by creating a single-use state token for the given
 * provider, stored in oauthStates with a 10-minute TTL.
 *
 * Returns the state token that the client must pass as the `state` parameter
 * when redirecting to the OAuth provider.
 */
export const initiateOAuth = mutation({
  args: {
    entityId: v.id('entities'),
    provider: v.string(),
    redirectUri: v.string(),
  },
  handler: async (ctx, { entityId, provider, redirectUri }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Unauthenticated');

    const user = await ctx.db
      .query('users')
      .withIndex('by_clerk_user_id', (q) => q.eq('clerkUserId', identity.subject))
      .unique();
    if (!user) throw new Error('User not found');

    // Verify entity belongs to this user
    const entity = await ctx.db.get(entityId);
    if (!entity || entity.userId !== user._id) throw new Error('Entity not found');

    // Generate a random UUID-style state token
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    // Format as UUID v4 string
    array[6] = (array[6] & 0x0f) | 0x40;
    array[8] = (array[8] & 0x3f) | 0x80;
    const hex = Array.from(array).map((b) => b.toString(16).padStart(2, '0')).join('');
    const stateToken = [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20),
    ].join('-');

    const expiresAt = Date.now() + 10 * 60 * 1000; // 10-minute TTL

    await ctx.db.insert('oauthStates', {
      userId: user._id,
      entityId,
      provider,
      stateToken,
      redirectUri,
      expiresAt,
    });

    return { stateToken, expiresAt };
  },
});
