import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { getCurrentUser } from './auth';

type SystemCategory = {
  name: string;
  type: 'income' | 'business_expense' | 'personal_expense' | 'transfer';
  direction: 'credit' | 'debit' | 'both';
  isDeductibleDefault?: boolean;
  ntaReference?: string;
};

const SYSTEM_CATEGORIES: SystemCategory[] = [
  // ── Income (credit / inflow) ──────────────────────────────────────────
  { name: 'Freelance/Client Income', type: 'income', direction: 'credit' },
  { name: 'Business Revenue', type: 'income', direction: 'credit' },
  { name: 'Commission Income', type: 'income', direction: 'credit' },
  { name: 'Salary/PAYE', type: 'income', direction: 'credit', ntaReference: 'Excluded from self-assessment — already taxed at source' },
  { name: 'Foreign Income', type: 'income', direction: 'credit' },
  { name: 'Investment Returns', type: 'income', direction: 'credit' },
  { name: 'Rental Income', type: 'income', direction: 'credit' },
  { name: 'Digital Asset Income', type: 'income', direction: 'credit', ntaReference: 'NTA 2025 — crypto/virtual asset gains' },
  { name: 'Other Taxable Income', type: 'income', direction: 'credit' },

  // ── Business expenses (debit / outflow, deductible) ───────────────────
  { name: 'Internet & Data', type: 'business_expense', direction: 'debit', isDeductibleDefault: true },
  { name: 'Electricity & Fuel', type: 'business_expense', direction: 'debit', isDeductibleDefault: true },
  { name: 'Software Subscriptions', type: 'business_expense', direction: 'debit', isDeductibleDefault: true },
  { name: 'Equipment Purchase', type: 'business_expense', direction: 'debit', isDeductibleDefault: true },
  { name: 'Professional Development', type: 'business_expense', direction: 'debit', isDeductibleDefault: true },
  { name: 'Workspace/Rent', type: 'business_expense', direction: 'debit', isDeductibleDefault: true },
  { name: 'Transport (Business)', type: 'business_expense', direction: 'debit', isDeductibleDefault: true },
  { name: 'Marketing & Advertising', type: 'business_expense', direction: 'debit', isDeductibleDefault: true },
  { name: 'Bank Charges', type: 'business_expense', direction: 'debit', isDeductibleDefault: true },
  { name: 'Professional Services', type: 'business_expense', direction: 'debit', isDeductibleDefault: true },
  { name: 'Content Creation & Production', type: 'business_expense', direction: 'debit', isDeductibleDefault: true },
  { name: 'Insurance (Business)', type: 'business_expense', direction: 'debit', isDeductibleDefault: true },

  // ── Personal expenses (debit / outflow, non-deductible) ───────────────
  { name: 'Personal — Groceries', type: 'personal_expense', direction: 'debit', isDeductibleDefault: false },
  { name: 'Personal — Entertainment', type: 'personal_expense', direction: 'debit', isDeductibleDefault: false },
  { name: 'Personal — Shopping/Clothing', type: 'personal_expense', direction: 'debit', isDeductibleDefault: false },
  { name: 'Personal — Health/Medical', type: 'personal_expense', direction: 'debit', isDeductibleDefault: false },
  { name: 'Personal — Transport', type: 'personal_expense', direction: 'debit', isDeductibleDefault: false },
  { name: 'Personal — Housing & Utilities', type: 'personal_expense', direction: 'debit', isDeductibleDefault: false },
  { name: 'Personal — Other', type: 'personal_expense', direction: 'debit', isDeductibleDefault: false },

  // ── Transfers (direction varies) ──────────────────────────────────────
  { name: 'Transfer (Own Account)', type: 'transfer', direction: 'both' },
  { name: 'Loan Disbursement', type: 'transfer', direction: 'credit' },
  { name: 'Loan Repayment', type: 'transfer', direction: 'debit' },
  { name: 'Refund/Reimbursement', type: 'transfer', direction: 'credit' },
  { name: 'Gift (Non-Taxable)', type: 'transfer', direction: 'both' },
  { name: 'Capital Injection', type: 'transfer', direction: 'credit' },
  { name: 'Savings/Investment Transfer', type: 'transfer', direction: 'debit' },
];

/**
 * Idempotent seed mutation — inserts or updates all system categories.
 * Safe to run multiple times; existing rows are patched with any new fields
 * (e.g. `direction`), and missing categories are inserted.
 */
export const seed = mutation({
  args: {},
  handler: async (ctx) => {
    let inserted = 0;
    let updated = 0;

    for (const cat of SYSTEM_CATEGORIES) {
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

      if (existing) {
        const needsPatch =
          existing.direction !== cat.direction ||
          existing.isDeductibleDefault !== cat.isDeductibleDefault ||
          existing.ntaReference !== cat.ntaReference;
        if (needsPatch) {
          await ctx.db.patch(existing._id, {
            direction: cat.direction,
            isDeductibleDefault: cat.isDeductibleDefault,
            ntaReference: cat.ntaReference,
          });
          updated++;
        }
      } else {
        await ctx.db.insert('categories', {
          name: cat.name,
          type: cat.type,
          direction: cat.direction,
          isSystem: true,
          isDeductibleDefault: cat.isDeductibleDefault,
          ntaReference: cat.ntaReference,
        });
        inserted++;
      }
    }

    return { total: SYSTEM_CATEGORIES.length, inserted, updated };
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
