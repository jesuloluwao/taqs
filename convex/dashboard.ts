import { query } from './_generated/server';
import { v } from 'convex/values';
import { getCurrentUser } from './auth';

/**
 * Dashboard summary stub for an entity.
 * Returns placeholder/empty summary data until transaction aggregation is implemented.
 */
export const getSummary = query({
  args: {
    entityId: v.id('entities'),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return null;
    }

    // Verify the entity belongs to the current user
    const entity = await ctx.db.get(args.entityId);
    if (!entity || entity.userId !== user._id || entity.deletedAt) {
      return null;
    }

    // Stub: returns empty summary — will be replaced with real aggregation in a future story
    return {
      entityId: args.entityId,
      entityName: entity.name,
      entityType: entity.type,
      taxYear: new Date().getFullYear(),
      totalIncomeKobo: 0,
      totalExpensesKobo: 0,
      totalDeductibleExpensesKobo: 0,
      netIncomeKobo: 0,
      estimatedTaxKobo: 0,
      transactionCount: 0,
      uncategorisedCount: 0,
    };
  },
});
