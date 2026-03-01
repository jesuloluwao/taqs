import { action } from './_generated/server';
import { internal } from './_generated/api';
import { v } from 'convex/values';

/**
 * Run rule-based categorisation on all uncategorised+unreviewed transactions
 * for an entity.  Zero API calls — instant, deterministic classification
 * using Nigerian bank keyword/vendor patterns.
 */
export const runRuleBasedCategorise = action({
  args: {
    entityId: v.id('entities'),
  },
  handler: async (ctx, { entityId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Unauthorized');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const user = await ctx.runQuery((internal as any).aiCategoriseHelpers.getUserByClerkId, {
      clerkUserId: identity.subject,
    }) as { _id: string } | null;
    if (!user) throw new Error('User not found');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entity = await ctx.runQuery((internal as any).aiCategoriseHelpers.getEntityForUser, {
      entityId,
      userId: user._id,
    }) as { _id: string } | null;
    if (!entity) throw new Error('Entity not found or unauthorized');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await ctx.runMutation((internal as any).importHelpers.categoriseAllByRules, {
      entityId,
    }) as { total: number; categorised: number };

    return result;
  },
});

/**
 * On-demand AI categorisation for uncategorised transactions.
 * Creates a categorisingJob and fires the AI batch pipeline.
 * Returns { categorisingJobId, totalTransactions } so the client can
 * subscribe to the job for progress tracking.
 *
 * Acceptance criteria: US-025
 */
export const autoCategorise = action({
  args: {
    entityId: v.id('entities'),
    transactionIds: v.optional(v.array(v.id('transactions'))),
  },
  handler: async (ctx, { entityId, transactionIds }) => {
    // Verify authentication
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Unauthorized');

    // Get Convex user record
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const user = await ctx.runQuery((internal as any).aiCategoriseHelpers.getUserByClerkId, {
      clerkUserId: identity.subject,
    }) as { _id: string } | null;
    if (!user) throw new Error('User not found');

    // Verify entity ownership
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entity = await ctx.runQuery((internal as any).aiCategoriseHelpers.getEntityForUser, {
      entityId,
      userId: user._id,
    }) as { _id: string } | null;
    if (!entity) throw new Error('Entity not found or unauthorized');

    // Count uncategorised+unreviewed transactions
    const transactions = await ctx.runQuery(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (internal as any).aiCategoriseHelpers.getUncategorisedForEntity,
      { entityId, transactionIds }
    ) as Array<{ _id: string }>;

    const totalTransactions = transactions.length;
    if (totalTransactions === 0) {
      return { categorisingJobId: null, totalTransactions: 0 };
    }

    // Create the categorising job record
    const categorisingJobId = await ctx.runMutation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (internal as any).aiCategoriseHelpers.createCategorisingJob,
      {
        entityId,
        userId: user._id,
        totalTransactions,
      }
    ) as string;

    // Schedule the AI batch pipeline as a separate function so it runs
    // independently. Using scheduler.runAfter(0, ...) avoids the "unawaited
    // operation" error that fire-and-forget ctx.runAction causes.
    await ctx.scheduler.runAfter(
      0,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (internal as any).aiCategorise.categoriseBatchForEntity,
      {
        categorisingJobId,
        entityId,
        transactionIds,
      }
    );

    return { categorisingJobId, totalTransactions };
  },
});
