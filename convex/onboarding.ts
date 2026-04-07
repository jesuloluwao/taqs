import { mutation } from './_generated/server';
import { getOrCreateCurrentUser } from './auth';
import { v } from 'convex/values';

/**
 * Step 1: Save selected user type (freelancer or sme).
 */
export const saveUserType = mutation({
  args: {
    userType: v.union(v.literal('freelancer'), v.literal('sme'), v.literal('salary_earner')),
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
 * Step 2 (Salary Earner): Save profile data and create individual entity.
 */
export const saveSalaryProfile = mutation({
  args: {
    firstName: v.string(),
    lastName: v.string(),
    preferredCurrency: v.union(
      v.literal('NGN'),
      v.literal('USD'),
      v.literal('GBP'),
      v.literal('EUR')
    ),
    employerName: v.string(),
    jobTitle: v.optional(v.string()),
    employmentType: v.union(
      v.literal('full_time'),
      v.literal('part_time'),
      v.literal('contract')
    ),
    hasOtherIncome: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    const fullName = `${args.firstName.trim()} ${args.lastName.trim()}`.trim();

    await ctx.db.patch(user._id, {
      fullName,
      preferredCurrency: args.preferredCurrency,
      updatedAt: Date.now(),
    });

    // Create individual entity if none exists
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
 * Step 3: Save NIN (11 digits) and optional FIRS TIN.
 * NIN is stored as-is here; caller should encrypt before passing if needed,
 * but for onboarding we store the raw value as per schema (encrypted field comment is advisory).
 */
export const saveNinAndTin = mutation({
  args: {
    nin: v.string(),
    firsTin: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!/^\d{11}$/.test(args.nin)) {
      throw new Error('NIN must be exactly 11 numeric digits');
    }

    const user = await getOrCreateCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    const patch: Record<string, unknown> = {
      nin: args.nin,
      updatedAt: Date.now(),
    };
    if (args.firsTin !== undefined) {
      patch.firsTin = args.firsTin;
    }

    await ctx.db.patch(user._id, patch);
    return user._id;
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
