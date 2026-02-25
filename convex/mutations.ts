import { mutation } from './_generated/server';
import { getOrCreateCurrentUser } from './auth';
import { v } from 'convex/values';

/**
 * Update user profile fields (previously upsertProfile on the profiles table).
 */
export const updateUser = mutation({
  args: {
    fullName: v.optional(v.string()),
    phone: v.optional(v.string()),
    userType: v.optional(v.union(v.literal('freelancer'), v.literal('sme'))),
    profession: v.optional(v.string()),
    preferredCurrency: v.optional(
      v.union(v.literal('NGN'), v.literal('USD'), v.literal('GBP'), v.literal('EUR'))
    ),
    onboardingComplete: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    if (!user) {
      throw new Error('Not authenticated');
    }

    await ctx.db.patch(user._id, {
      ...args,
      updatedAt: Date.now(),
    });

    return user._id;
  },
});

/**
 * Create a new transaction (full PRD-1 schema).
 */
export const createTransaction = mutation({
  args: {
    entityId: v.id('entities'),
    connectedAccountId: v.optional(v.id('connectedAccounts')),
    importJobId: v.optional(v.id('importJobs')),
    date: v.number(),
    description: v.string(),
    enrichedDescription: v.optional(v.string()),
    amount: v.number(),
    currency: v.union(v.literal('NGN'), v.literal('USD'), v.literal('GBP'), v.literal('EUR')),
    amountNgn: v.number(),
    fxRate: v.optional(v.number()),
    direction: v.union(v.literal('credit'), v.literal('debit')),
    type: v.union(
      v.literal('income'),
      v.literal('business_expense'),
      v.literal('personal_expense'),
      v.literal('transfer'),
      v.literal('uncategorised')
    ),
    categoryId: v.optional(v.id('categories')),
    isDeductible: v.optional(v.boolean()),
    deductiblePercent: v.optional(v.number()),
    whtDeducted: v.optional(v.number()),
    whtRate: v.optional(v.number()),
    invoiceId: v.optional(v.string()),
    notes: v.optional(v.string()),
    externalRef: v.optional(v.string()),
    isDuplicate: v.optional(v.boolean()),
    taxYear: v.number(),
    reviewedByUser: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    if (!user) {
      throw new Error('Not authenticated');
    }

    // Verify entity belongs to user
    const entity = await ctx.db.get(args.entityId);
    if (!entity || entity.userId !== user._id || entity.deletedAt) {
      throw new Error('Entity not found or unauthorized');
    }

    const now = Date.now();
    return await ctx.db.insert('transactions', {
      ...args,
      userId: user._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Update an existing transaction.
 */
export const updateTransaction = mutation({
  args: {
    id: v.id('transactions'),
    description: v.optional(v.string()),
    enrichedDescription: v.optional(v.string()),
    date: v.optional(v.number()),
    amount: v.optional(v.number()),
    currency: v.optional(v.union(v.literal('NGN'), v.literal('USD'), v.literal('GBP'), v.literal('EUR'))),
    amountNgn: v.optional(v.number()),
    fxRate: v.optional(v.number()),
    direction: v.optional(v.union(v.literal('credit'), v.literal('debit'))),
    type: v.optional(v.union(
      v.literal('income'),
      v.literal('business_expense'),
      v.literal('personal_expense'),
      v.literal('transfer'),
      v.literal('uncategorised')
    )),
    categoryId: v.optional(v.id('categories')),
    isDeductible: v.optional(v.boolean()),
    deductiblePercent: v.optional(v.number()),
    whtDeducted: v.optional(v.number()),
    whtRate: v.optional(v.number()),
    invoiceId: v.optional(v.string()),
    notes: v.optional(v.string()),
    externalRef: v.optional(v.string()),
    isDuplicate: v.optional(v.boolean()),
    taxYear: v.optional(v.number()),
    reviewedByUser: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    if (!user) {
      throw new Error('Not authenticated');
    }

    const { id, ...fields } = args;
    const transaction = await ctx.db.get(id);
    if (!transaction || transaction.userId !== user._id) {
      throw new Error('Transaction not found or unauthorized');
    }

    await ctx.db.patch(id, {
      ...fields,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Delete a transaction.
 */
export const deleteTransaction = mutation({
  args: {
    id: v.id('transactions'),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    if (!user) {
      throw new Error('Not authenticated');
    }

    const transaction = await ctx.db.get(args.id);
    if (!transaction || transaction.userId !== user._id) {
      throw new Error('Transaction not found or unauthorized');
    }

    await ctx.db.delete(args.id);
  },
});

/**
 * Create a new import job.
 */
export const createImportJob = mutation({
  args: {
    entityId: v.id('entities'),
    connectedAccountId: v.optional(v.id('connectedAccounts')),
    source: v.union(
      v.literal('pdf'),
      v.literal('csv'),
      v.literal('bank_api'),
      v.literal('paystack'),
      v.literal('flutterwave'),
      v.literal('manual')
    ),
    storageId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    if (!user) {
      throw new Error('Not authenticated');
    }

    const entity = await ctx.db.get(args.entityId);
    if (!entity || entity.userId !== user._id || entity.deletedAt) {
      throw new Error('Entity not found or unauthorized');
    }

    const now = Date.now();
    return await ctx.db.insert('importJobs', {
      ...args,
      userId: user._id,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Update an import job status and stats.
 */
export const updateImportJob = mutation({
  args: {
    id: v.id('importJobs'),
    status: v.optional(v.union(
      v.literal('pending'),
      v.literal('processing'),
      v.literal('complete'),
      v.literal('failed')
    )),
    totalParsed: v.optional(v.number()),
    totalImported: v.optional(v.number()),
    duplicatesSkipped: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    if (!user) {
      throw new Error('Not authenticated');
    }

    const { id, ...fields } = args;
    const job = await ctx.db.get(id);
    if (!job || job.userId !== user._id) {
      throw new Error('Import job not found or unauthorized');
    }

    await ctx.db.patch(id, {
      ...fields,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Migration: Delete all legacy transactions that predate the PRD-1 schema overhaul.
 * Legacy transactions are identified by missing the `entityId` field.
 * Safe to call multiple times (idempotent).
 */
export const migrateLegacyTransactions = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getOrCreateCurrentUser(ctx);
    if (!user) {
      throw new Error('Not authenticated');
    }

    // Query using the by_userId index (preserved for migration support)
    const allUserTransactions = await ctx.db
      .query('transactions')
      .withIndex('by_userId', (q) => q.eq('userId', user._id))
      .collect();

    // Delete any transactions missing the new required entityId field
    let deletedCount = 0;
    for (const tx of allUserTransactions) {
      if (!tx.entityId) {
        await ctx.db.delete(tx._id);
        deletedCount++;
      }
    }

    return { deletedCount };
  },
});
