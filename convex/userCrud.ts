import { mutation, query, action } from './_generated/server';
import { getOrCreateCurrentUser, getCurrentUser } from './auth';
import { api } from './_generated/api';
import { v } from 'convex/values';

// ================== QUERIES ==================

/**
 * Get the current user's profile.
 */
export const getMe = query({
  handler: async (ctx) => {
    return await getCurrentUser(ctx);
  },
});

/**
 * Get the current user's preferences.
 */
export const getPreferences = query({
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    return await ctx.db
      .query('userPreferences')
      .withIndex('by_userId', (q) => q.eq('userId', user._id))
      .first();
  },
});

// ================== MUTATIONS ==================

/**
 * Update user profile fields: name, phone, profession, currency, avatar.
 */
export const updateProfile = mutation({
  args: {
    fullName: v.optional(v.string()),
    phone: v.optional(v.string()),
    profession: v.optional(v.string()),
    firsTin: v.optional(v.string()),
    preferredCurrency: v.optional(
      v.union(v.literal('NGN'), v.literal('USD'), v.literal('GBP'), v.literal('EUR'))
    ),
    avatarStorageId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    await ctx.db.patch(user._id, {
      ...args,
      updatedAt: Date.now(),
    });

    return user._id;
  },
});

/**
 * Update the user's NIN (validates 11 digits, stores value).
 * Caller is responsible for encrypting (AES-256-GCM) before passing to this function.
 */
export const updateNin = mutation({
  args: {
    nin: v.string(),
  },
  handler: async (ctx, args) => {
    if (!/^\d{11}$/.test(args.nin)) {
      throw new Error('NIN must be exactly 11 digits');
    }

    const user = await getOrCreateCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    await ctx.db.patch(user._id, {
      nin: args.nin,
      updatedAt: Date.now(),
    });

    return user._id;
  },
});

/**
 * Mark onboarding as complete for the current user.
 */
export const completeOnboarding = mutation({
  handler: async (ctx) => {
    const user = await getOrCreateCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    await ctx.db.patch(user._id, {
      onboardingComplete: true,
      updatedAt: Date.now(),
    });

    return user._id;
  },
});

/**
 * Set the user's avatar to a previously uploaded Convex Storage ID.
 */
export const uploadAvatar = mutation({
  args: {
    storageId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    await ctx.db.patch(user._id, {
      avatarStorageId: args.storageId,
      updatedAt: Date.now(),
    });

    return user._id;
  },
});

/**
 * Create default user preferences (idempotent, called during onboarding).
 */
export const createDefaultPreferences = mutation({
  handler: async (ctx) => {
    const user = await getOrCreateCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    // Idempotent: return existing if already created
    const existing = await ctx.db
      .query('userPreferences')
      .withIndex('by_userId', (q) => q.eq('userId', user._id))
      .first();

    if (existing) return existing._id;

    return await ctx.db.insert('userPreferences', {
      userId: user._id,
      deadlineReminderDays: 14,
      vatReminderEnabled: false,
      uncategorisedAlertFrequency: 'weekly',
      invoiceOverdueDays: 7,
      pushEnabled: true,
    });
  },
});

/**
 * Update user preferences (upserts if no preferences record exists yet).
 */
export const updatePreferences = mutation({
  args: {
    deadlineReminderDays: v.optional(v.number()),
    vatReminderEnabled: v.optional(v.boolean()),
    uncategorisedAlertFrequency: v.optional(
      v.union(v.literal('daily'), v.literal('weekly'), v.literal('never'))
    ),
    invoiceOverdueDays: v.optional(v.number()),
    pushEnabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    const prefs = await ctx.db
      .query('userPreferences')
      .withIndex('by_userId', (q) => q.eq('userId', user._id))
      .first();

    if (!prefs) {
      return await ctx.db.insert('userPreferences', {
        userId: user._id,
        ...args,
      });
    }

    await ctx.db.patch(prefs._id, args);
    return prefs._id;
  },
});

// ================== ACTIONS ==================

/**
 * Delete account: removes all user data from Convex and deletes the Clerk user.
 * Uses an action because it calls the Clerk Backend API (external HTTP).
 */
export const deleteAccount = action({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');

    const clerkUserId = identity.subject;

    // Step 1: Delete all Convex data via the cascade mutation
    await ctx.runMutation(api.userMutations.deleteUserFromClerk, { clerkUserId });

    // Step 2: Call Clerk Backend API to delete the Clerk user
    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) {
      throw new Error('CLERK_SECRET_KEY environment variable not set');
    }

    const response = await fetch(`https://api.clerk.com/v1/users/${clerkUserId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${clerkSecretKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to delete Clerk user: ${response.status} ${errorText}`);
    }

    return { success: true };
  },
});
