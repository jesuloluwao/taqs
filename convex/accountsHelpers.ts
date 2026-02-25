/**
 * Internal mutations and queries for the accounts actions.
 * These run in the regular Convex V8 runtime (no "use node" needed).
 */

import { internalMutation, internalQuery } from './_generated/server';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';

// ─────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────

/**
 * Look up a user record by Clerk user ID.
 * Used by actions that have ctx.auth identity but need the Convex user._id.
 */
export const getUserByClerkId = internalQuery({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }) => {
    return await ctx.db
      .query('users')
      .withIndex('by_clerk_user_id', (q) => q.eq('clerkUserId', clerkUserId))
      .first();
  },
});

/**
 * Fetch a connected account record (including encrypted tokens).
 * Used by sync actions before decrypting tokens.
 */
export const getConnectedAccount = internalQuery({
  args: { connectedAccountId: v.id('connectedAccounts') },
  handler: async (ctx, { connectedAccountId }) => {
    return await ctx.db.get(connectedAccountId);
  },
});

/**
 * Find a connected account by providerAccountId.
 * Optionally scoped to an entity (for reconnect flow).
 * Without entityId, returns the first matching account (for webhook use).
 */
export const findByProviderAccountId = internalQuery({
  args: {
    providerAccountId: v.string(),
    entityId: v.optional(v.id('entities')),
  },
  handler: async (ctx, { providerAccountId, entityId }) => {
    const query = ctx.db
      .query('connectedAccounts')
      .withIndex('by_providerAccountId', (q) =>
        q.eq('providerAccountId', providerAccountId)
      );

    if (entityId) {
      return await query
        .filter((q) => q.eq(q.field('entityId'), entityId))
        .first();
    }

    return await query.first();
  },
});

// ─────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────

/**
 * Create or update a connected account record.
 * If an existing account with the same providerAccountId + entityId exists,
 * it is updated (reconnect flow). Otherwise a new record is created.
 *
 * Returns the connectedAccount._id.
 */
export const upsertConnectedAccount = internalMutation({
  args: {
    entityId: v.id('entities'),
    userId: v.id('users'),
    provider: v.string(),
    providerAccountId: v.optional(v.string()),
    accountName: v.optional(v.string()),
    currency: v.optional(
      v.union(v.literal('NGN'), v.literal('USD'), v.literal('GBP'), v.literal('EUR'))
    ),
    /** AES-256-GCM encrypted access token (or account ID for Mono) */
    accessToken: v.optional(v.string()),
    /** AES-256-GCM encrypted refresh token */
    refreshToken: v.optional(v.string()),
    tokenExpiresAt: v.optional(v.number()),
    status: v.optional(
      v.union(
        v.literal('active'),
        v.literal('expired'),
        v.literal('error'),
        v.literal('disconnected')
      )
    ),
    metadata: v.optional(
      v.object({
        institutionId: v.optional(v.string()),
        institutionLogo: v.optional(v.string()),
        accountType: v.optional(v.string()),
        accountNumber: v.optional(v.string()),
        linkProvider: v.optional(v.union(v.literal('mono'), v.literal('stitch'))),
        apiKeyHash: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Check if an account with this providerAccountId already exists for this entity
    let existingId: Id<'connectedAccounts'> | null = null;
    if (args.providerAccountId) {
      const existing = await ctx.db
        .query('connectedAccounts')
        .withIndex('by_providerAccountId', (q) =>
          q.eq('providerAccountId', args.providerAccountId!)
        )
        .filter((q) => q.eq(q.field('entityId'), args.entityId))
        .first();

      if (existing) {
        existingId = existing._id;
      }
    }

    if (existingId) {
      // Update existing account (reconnect flow)
      await ctx.db.patch(existingId, {
        provider: args.provider,
        accountName: args.accountName,
        currency: args.currency,
        accessToken: args.accessToken,
        refreshToken: args.refreshToken,
        tokenExpiresAt: args.tokenExpiresAt,
        status: args.status ?? 'active',
        metadata: args.metadata,
      });
      return existingId;
    }

    // Create new account
    const id = await ctx.db.insert('connectedAccounts', {
      entityId: args.entityId,
      userId: args.userId,
      provider: args.provider,
      providerAccountId: args.providerAccountId,
      accountName: args.accountName,
      currency: args.currency ?? 'NGN',
      accessToken: args.accessToken,
      refreshToken: args.refreshToken,
      tokenExpiresAt: args.tokenExpiresAt,
      status: args.status ?? 'active',
      metadata: args.metadata,
    });

    return id;
  },
});

/**
 * Update the status, lastSyncedAt, and optional errorMessage of an account.
 */
export const updateAccountStatus = internalMutation({
  args: {
    connectedAccountId: v.id('connectedAccounts'),
    status: v.union(
      v.literal('active'),
      v.literal('expired'),
      v.literal('error'),
      v.literal('disconnected')
    ),
    lastSyncedAt: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, { connectedAccountId, status, lastSyncedAt, errorMessage }) => {
    await ctx.db.patch(connectedAccountId, {
      status,
      lastSyncedAt,
      errorMessage,
    });
  },
});

/**
 * Create a bank_api import job for a sync operation.
 * Returns the new importJob._id.
 */
export const createSyncJob = internalMutation({
  args: {
    entityId: v.id('entities'),
    userId: v.id('users'),
    connectedAccountId: v.id('connectedAccounts'),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const jobId = await ctx.db.insert('importJobs', {
      entityId: args.entityId,
      userId: args.userId,
      connectedAccountId: args.connectedAccountId,
      source: 'bank_api',
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    });
    return jobId;
  },
});
