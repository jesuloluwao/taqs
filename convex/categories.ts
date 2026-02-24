import { mutation, query } from './_generated/server';
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
