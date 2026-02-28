import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { getCurrentUser } from './auth';

/**
 * Get the tax declaration (user-declared reliefs) for an entity + tax year.
 * Returns null if none has been saved yet.
 */
export const get = query({
  args: {
    entityId: v.id('entities'),
    taxYear: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const declaration = await ctx.db
      .query('taxDeclarations')
      .withIndex('by_entityId_taxYear', (q) =>
        q.eq('entityId', args.entityId).eq('taxYear', args.taxYear)
      )
      .first();

    if (!declaration) return null;
    // Guard: only the owning user may read
    if (declaration.userId !== user._id) return null;

    return declaration;
  },
});

/**
 * Create or update tax declarations (reliefs) for an entity + tax year.
 * If a record already exists it is patched; otherwise a new record is inserted.
 */
export const createOrUpdate = mutation({
  args: {
    entityId: v.id('entities'),
    taxYear: v.number(),
    annualRentPaid: v.optional(v.number()),
    pensionContributions: v.optional(v.number()),
    nhisContributions: v.optional(v.number()),
    nhfContributions: v.optional(v.number()),
    lifeInsurancePremiums: v.optional(v.number()),
    mortgageInterest: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    const now = Date.now();

    const existing = await ctx.db
      .query('taxDeclarations')
      .withIndex('by_entityId_taxYear', (q) =>
        q.eq('entityId', args.entityId).eq('taxYear', args.taxYear)
      )
      .first();

    const fields = {
      annualRentPaid: args.annualRentPaid,
      pensionContributions: args.pensionContributions,
      nhisContributions: args.nhisContributions,
      nhfContributions: args.nhfContributions,
      lifeInsurancePremiums: args.lifeInsurancePremiums,
      mortgageInterest: args.mortgageInterest,
      updatedAt: now,
    };

    if (existing) {
      if (existing.userId !== user._id) throw new Error('Not authorised');
      await ctx.db.patch(existing._id, fields);
      return existing._id;
    }

    const id = await ctx.db.insert('taxDeclarations', {
      entityId: args.entityId,
      userId: user._id,
      taxYear: args.taxYear,
      ...fields,
      createdAt: now,
    });
    return id;
  },
});
