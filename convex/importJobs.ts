import { query } from './_generated/server';
import { getCurrentUser } from './auth';
import { v } from 'convex/values';

/**
 * List the most recent sync jobs for a connected account (for sync history).
 */
export const listByAccount = query({
  args: {
    connectedAccountId: v.id('connectedAccounts'),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const account = await ctx.db.get(args.connectedAccountId);
    if (!account || account.userId !== user._id) return [];

    const jobs = await ctx.db
      .query('importJobs')
      .withIndex('by_connectedAccountId', (q) =>
        q.eq('connectedAccountId', args.connectedAccountId)
      )
      .order('desc')
      .take(args.limit ?? 5);

    return jobs;
  },
});

/**
 * Get a single import job by ID (with ownership check).
 */
export const get = query({
  args: {
    id: v.id('importJobs'),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const job = await ctx.db.get(args.id);
    if (!job || job.userId !== user._id) return null;

    return job;
  },
});

/**
 * List import jobs for a given entity (most recent first).
 */
export const list = query({
  args: {
    entityId: v.id('entities'),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const entity = await ctx.db.get(args.entityId);
    if (!entity || entity.userId !== user._id || entity.deletedAt) return [];

    return await ctx.db
      .query('importJobs')
      .withIndex('by_entityId', (q) => q.eq('entityId', args.entityId))
      .order('desc')
      .collect();
  },
});
