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
 * Returns null if not authenticated or user doesn't exist.
 */
export async function getCurrentUser(ctx: QueryCtx) {
  const clerkUserId = await getCurrentUserId(ctx);
  if (!clerkUserId) {
    return null;
  }

  const user = await ctx.db
    .query('users')
    .withIndex('by_clerk_user_id', (q) => q.eq('clerkUserId', clerkUserId))
    .first();

  return user;
}

/**
 * Get or create the Convex user record for the current Clerk user (for mutations).
 * Creates the user if it doesn't exist.
 */
export async function getOrCreateCurrentUser(ctx: MutationCtx) {
  const clerkUserId = await getCurrentUserId(ctx);
  if (!clerkUserId) {
    return null;
  }

  let user = await ctx.db
    .query('users')
    .withIndex('by_clerk_user_id', (q) => q.eq('clerkUserId', clerkUserId))
    .first();

  if (!user) {
    // Create user if doesn't exist
    // Get email/name from Clerk identity if available
    const identity = await ctx.auth.getUserIdentity();
    const email = (identity && 'email' in identity ? identity.email : null) || '';
    const name = (identity && 'name' in identity ? identity.name : null) || undefined;
    
    const userId = await ctx.db.insert('users', {
      clerkUserId,
      email,
      fullName: name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const insertedUser = await ctx.db.get(userId);
    if (!insertedUser) {
      throw new Error('Failed to create user');
    }
    user = insertedUser;
  }

  return user;
}

