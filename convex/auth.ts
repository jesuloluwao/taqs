import { QueryCtx, MutationCtx } from './_generated/server';

/**
 * Get the current authenticated user's Clerk user ID.
 * Returns null if not authenticated.
 */
export async function getCurrentUserId(ctx: QueryCtx | MutationCtx): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return null;
  }
  // The subject field contains the Clerk user ID
  return identity.subject;
}

/**
 * Get the Convex user record for the current Clerk user (read-only, for queries).
 * Returns null if not authenticated or user doesn't exist in Convex yet.
 * User records are created by the Clerk webhook (user.created event), not here.
 */
export async function getCurrentUser(ctx: QueryCtx) {
  const clerkUserId = await getCurrentUserId(ctx);
  if (!clerkUserId) {
    return null;
  }

  return ctx.db
    .query('users')
    .withIndex('by_clerk_user_id', (q) => q.eq('clerkUserId', clerkUserId))
    .first();
}

/**
 * Get the Convex user record for the current Clerk user (for mutations).
 * Returns null if not authenticated or the user record has not yet been created
 * by the Clerk webhook.
 *
 * NOTE: This function intentionally does NOT auto-create users. User creation
 * is handled exclusively by the Clerk webhook handler (POST /clerk-webhook).
 */
export async function getOrCreateCurrentUser(ctx: MutationCtx) {
  const clerkUserId = await getCurrentUserId(ctx);
  if (!clerkUserId) {
    return null;
  }

  return ctx.db
    .query('users')
    .withIndex('by_clerk_user_id', (q) => q.eq('clerkUserId', clerkUserId))
    .first();
}
