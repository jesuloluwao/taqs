import { mutation } from './_generated/server';
import { getOrCreateCurrentUser } from './auth';
import { v } from 'convex/values';

/**
 * Step 1: Save selected user type (freelancer or sme).
 */
export const saveUserType = mutation({
  args: {
    userType: v.union(v.literal('freelancer'), v.literal('sme')),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    await ctx.db.patch(user._id, {
      userType: args.userType,
      updatedAt: Date.now(),
    });

    return user._id;
  },
});

/**
 * Step 2 (Freelancer): Save profile data and create first individual entity.
 */
export const saveFreelancerProfile = mutation({
  args: {
    firstName: v.string(),
    lastName: v.string(),
    profession: v.string(),
    preferredCurrency: v.union(
      v.literal('NGN'),
      v.literal('USD'),
      v.literal('GBP'),
      v.literal('EUR')
    ),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    const fullName = `${args.firstName.trim()} ${args.lastName.trim()}`.trim();

    await ctx.db.patch(user._id, {
      fullName,
      profession: args.profession,
      preferredCurrency: args.preferredCurrency,
      updatedAt: Date.now(),
    });

    // Create first entity if none exists
    const existing = await ctx.db
      .query('entities')
      .withIndex('by_userId', (q) => q.eq('userId', user._id))
      .collect();

    const active = existing.filter((e) => !e.deletedAt);
    let entityId: string | undefined;

    if (active.length === 0) {
      entityId = await ctx.db.insert('entities', {
        userId: user._id,
        name: fullName || 'My Profile',
        type: 'individual',
        isDefault: true,
        taxYearStart: 1,
      });
    }

    return { userId: user._id, entityId };
  },
});

/**
 * Step 2 (SME): Save business data and create first business entity.
 */
export const saveSmeProfile = mutation({
  args: {
    businessName: v.string(),
    businessType: v.union(v.literal('business_name'), v.literal('llc')),
    industry: v.string(),
    annualTurnoverRange: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    await ctx.db.patch(user._id, {
      updatedAt: Date.now(),
    });

    // Create first entity if none exists
    const existing = await ctx.db
      .query('entities')
      .withIndex('by_userId', (q) => q.eq('userId', user._id))
      .collect();

    const active = existing.filter((e) => !e.deletedAt);
    let entityId: string | undefined;

    if (active.length === 0) {
      entityId = await ctx.db.insert('entities', {
        userId: user._id,
        name: args.businessName.trim(),
        type: args.businessType,
        isDefault: true,
        taxYearStart: 1,
        industry: args.industry,
        annualTurnoverRange: args.annualTurnoverRange,
      });
    }

    return { userId: user._id, entityId };
  },
});
