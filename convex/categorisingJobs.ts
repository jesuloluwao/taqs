import { query, mutation } from './_generated/server';
import { getCurrentUser } from './auth';
import { v } from 'convex/values';

/**
 * Get a single categorisingJob by ID (with ownership check).
 */
export const get = query({
  args: {
    id: v.id('categorisingJobs'),
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
 * Get the most recent active (pending/processing) categorisingJob for an entity.
 */
export const getLatestForEntity = query({
  args: {
    entityId: v.id('entities'),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const entity = await ctx.db.get(args.entityId);
    if (!entity || entity.userId !== user._id || entity.deletedAt) return null;

    const jobs = await ctx.db
      .query('categorisingJobs')
      .withIndex('by_entityId', (q) => q.eq('entityId', args.entityId))
      .order('desc')
      .take(10);

    // Return the most recent job regardless of status (client decides what to show)
    return jobs[0] ?? null;
  },
});

/**
 * Cancel a running categorisingJob.
 * Sets status to 'cancelled'; the running action will check this between batches and stop.
 */
export const cancel = mutation({
  args: {
    id: v.id('categorisingJobs'),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error('Unauthorized');

    const job = await ctx.db.get(args.id);
    if (!job || job.userId !== user._id) throw new Error('Not found');

    // Only cancel if in a cancellable state
    if (job.status === 'pending' || job.status === 'processing') {
      await ctx.db.patch(args.id, {
        status: 'cancelled',
        updatedAt: Date.now(),
      });
    }

    return { cancelled: true };
  },
});
