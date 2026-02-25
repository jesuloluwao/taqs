import { mutation } from './_generated/server';
import { v } from 'convex/values';

/**
 * Create a user record from a Clerk user.created webhook event.
 * Called only by the webhook handler — not by the client.
 */
export const createUserFromClerk = mutation({
  args: {
    clerkUserId: v.string(),
    email: v.string(),
    fullName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Idempotency: skip if user already exists
    const existing = await ctx.db
      .query('users')
      .withIndex('by_clerk_user_id', (q) => q.eq('clerkUserId', args.clerkUserId))
      .first();

    if (existing) {
      return existing._id;
    }

    const now = Date.now();
    return await ctx.db.insert('users', {
      clerkUserId: args.clerkUserId,
      email: args.email,
      fullName: args.fullName,
      onboardingComplete: false,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Update a user record from a Clerk user.updated webhook event.
 */
export const updateUserFromClerk = mutation({
  args: {
    clerkUserId: v.string(),
    email: v.string(),
    fullName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_clerk_user_id', (q) => q.eq('clerkUserId', args.clerkUserId))
      .first();

    if (!user) return null;

    await ctx.db.patch(user._id, {
      email: args.email,
      fullName: args.fullName,
      updatedAt: Date.now(),
    });

    return user._id;
  },
});

/**
 * Delete a user and all associated data from a Clerk user.deleted webhook event.
 */
export const deleteUserFromClerk = mutation({
  args: {
    clerkUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_clerk_user_id', (q) => q.eq('clerkUserId', args.clerkUserId))
      .first();

    if (!user) return null;

    const userId = user._id;

    // Delete all associated entities
    const entities = await ctx.db
      .query('entities')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .collect();
    for (const entity of entities) {
      // Delete connected accounts for this entity
      const accounts = await ctx.db
        .query('connectedAccounts')
        .withIndex('by_entityId', (q) => q.eq('entityId', entity._id))
        .collect();
      for (const account of accounts) {
        await ctx.db.delete(account._id);
      }
      await ctx.db.delete(entity._id);
    }

    // Delete user preferences
    const prefs = await ctx.db
      .query('userPreferences')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .collect();
    for (const pref of prefs) {
      await ctx.db.delete(pref._id);
    }

    // Delete custom categories
    const categories = await ctx.db
      .query('categories')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .collect();
    for (const category of categories) {
      await ctx.db.delete(category._id);
    }

    // Delete transactions
    const transactions = await ctx.db
      .query('transactions')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .collect();
    for (const transaction of transactions) {
      await ctx.db.delete(transaction._id);
    }

    // Delete documents
    const documents = await ctx.db
      .query('documents')
      .withIndex('by_user_id', (q) => q.eq('userId', userId))
      .collect();
    for (const document of documents) {
      await ctx.db.delete(document._id);
    }

    // Finally delete the user
    await ctx.db.delete(userId);

    return userId;
  },
});
