import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { getCurrentUser } from './auth';

type SystemCategory = {
  name: string;
  type: 'income' | 'business_expense' | 'personal_expense' | 'transfer';
  isDeductibleDefault?: boolean;
  ntaReference?: string;
};

const SYSTEM_CATEGORIES: SystemCategory[] = [
  // Income
  { name: 'Freelance/Client Income', type: 'income' },
  { name: 'Foreign Income', type: 'income' },
  { name: 'Investment Returns', type: 'income' },
  { name: 'Rental Income', type: 'income' },

  // Business expenses (deductible)
  { name: 'Internet & Data', type: 'business_expense', isDeductibleDefault: true },
  { name: 'Electricity & Fuel', type: 'business_expense', isDeductibleDefault: true },
  { name: 'Software Subscriptions', type: 'business_expense', isDeductibleDefault: true },
  { name: 'Equipment Purchase', type: 'business_expense', isDeductibleDefault: true },
  { name: 'Professional Development', type: 'business_expense', isDeductibleDefault: true },
  { name: 'Workspace/Rent', type: 'business_expense', isDeductibleDefault: true },
  { name: 'Transport (Business)', type: 'business_expense', isDeductibleDefault: true },
  { name: 'Marketing & Advertising', type: 'business_expense', isDeductibleDefault: true },
  { name: 'Bank Charges', type: 'business_expense', isDeductibleDefault: true },

  // Personal expenses
  { name: 'Personal — Groceries', type: 'personal_expense', isDeductibleDefault: false },
  { name: 'Personal — Entertainment', type: 'personal_expense', isDeductibleDefault: false },

  // Transfers
  { name: 'Transfer (Own Account)', type: 'transfer' },
  { name: 'Loan Disbursement', type: 'transfer' },
  { name: 'Refund/Reimbursement', type: 'transfer' },
];

/**
 * Idempotent seed mutation — inserts all system categories.
 * Safe to run multiple times; skips categories that already exist by name+type.
 */
export const seed = mutation({
  args: {},
  handler: async (ctx) => {
    for (const cat of SYSTEM_CATEGORIES) {
      // Check if a system category with the same name and type already exists
      const existing = await ctx.db
        .query('categories')
        .withIndex('by_type', (q) => q.eq('type', cat.type))
        .filter((q) =>
          q.and(
            q.eq(q.field('name'), cat.name),
            q.eq(q.field('isSystem'), true)
          )
        )
        .first();

      if (!existing) {
        await ctx.db.insert('categories', {
          name: cat.name,
          type: cat.type,
          isSystem: true,
          isDeductibleDefault: cat.isDeductibleDefault,
          ntaReference: cat.ntaReference,
          // userId is null/undefined for system categories
        });
      }
    }

    return { seeded: SYSTEM_CATEGORIES.length };
  },
});

/**
 * Create a custom category for the current user.
 */
export const create = mutation({
  args: {
    name: v.string(),
    type: v.union(
      v.literal('income'),
      v.literal('business_expense'),
      v.literal('personal_expense'),
      v.literal('transfer')
    ),
    isDeductibleDefault: v.optional(v.boolean()),
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    const id = await ctx.db.insert('categories', {
      name: args.name.trim(),
      type: args.type,
      isDeductibleDefault: args.isDeductibleDefault ?? false,
      icon: args.icon,
      color: args.color,
      isSystem: false,
      userId: user._id,
    });
    return id;
  },
});

/**
 * Update a custom category owned by the current user.
 */
export const update = mutation({
  args: {
    id: v.id('categories'),
    name: v.optional(v.string()),
    isDeductibleDefault: v.optional(v.boolean()),
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    const category = await ctx.db.get(args.id);
    if (!category) throw new Error('Category not found');
    if (category.isSystem) throw new Error('Cannot edit system categories');
    if (category.userId !== user._id) throw new Error('Not your category');

    const patch: Record<string, unknown> = {};
    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.isDeductibleDefault !== undefined) patch.isDeductibleDefault = args.isDeductibleDefault;
    if (args.icon !== undefined) patch.icon = args.icon;
    if (args.color !== undefined) patch.color = args.color;

    await ctx.db.patch(args.id, patch);
  },
});

/**
 * Delete a custom category. Reassigns all transactions using this category to uncategorised
 * (clears categoryId and sets type to 'uncategorised').
 */
export const remove = mutation({
  args: { id: v.id('categories') },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    const category = await ctx.db.get(args.id);
    if (!category) throw new Error('Category not found');
    if (category.isSystem) throw new Error('Cannot delete system categories');
    if (category.userId !== user._id) throw new Error('Not your category');

    // Reassign all transactions using this category to uncategorised
    const transactions = await ctx.db
      .query('transactions')
      .filter((q) => q.eq(q.field('categoryId'), args.id))
      .collect();

    for (const tx of transactions) {
      await ctx.db.patch(tx._id, {
        categoryId: undefined,
        type: 'uncategorised' as const,
      });
    }

    await ctx.db.delete(args.id);
  },
});

/**
 * Returns all system categories plus any user-created categories for the current user.
 */
export const listAll = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);

    // System categories (no userId)
    const systemCategories = await ctx.db
      .query('categories')
      .filter((q) => q.eq(q.field('isSystem'), true))
      .collect();

    if (!user) {
      return systemCategories;
    }

    // User-created categories
    const userCategories = await ctx.db
      .query('categories')
      .withIndex('by_userId', (q) => q.eq('userId', user._id))
      .collect();

    return [...systemCategories, ...userCategories];
  },
});
