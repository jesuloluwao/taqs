/**
 * TaxEase Nigeria — Bank Accounts CRUD (PRD-8)
 *
 * Queries:
 *   listByEntity    — active bank accounts for an entity
 *   listAllByEntity — all bank accounts (including archived) for an entity
 *   get             — single bank account by ID
 *
 * Mutations:
 *   create               — create a new bank account
 *   update               — update editable fields
 *   archive              — soft delete (isActive = false)
 *   restore              — restore archived (isActive = true)
 *   assignToTransaction  — assign bank account to a single transaction
 *   assignToImportJob    — batch-assign bank account to all transactions in an import job
 */

import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import { getCurrentUser } from './auth';
import { getOrCreateCurrentUser } from './auth';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const currencyValidator = v.union(
  v.literal('NGN'),
  v.literal('USD'),
  v.literal('GBP'),
  v.literal('EUR'),
);

/**
 * Validate that the authenticated user owns the given entity.
 * Throws on failure; returns { user, entity } on success.
 */
async function validateOwnership(ctx: any, entityId: any) {
  const user = await getCurrentUser(ctx);
  if (!user) return null;
  const entity = await ctx.db.get(entityId);
  if (!entity || entity.userId !== user._id || entity.deletedAt) return null;
  return { user, entity };
}

/**
 * Same as validateOwnership but uses getOrCreateCurrentUser (for mutations).
 */
async function validateOwnershipMut(ctx: any, entityId: any) {
  const user = await getOrCreateCurrentUser(ctx);
  if (!user) return null;
  const entity = await ctx.db.get(entityId);
  if (!entity || entity.userId !== user._id || entity.deletedAt) return null;
  return { user, entity };
}

/**
 * Validate NUBAN account number format: exactly 10 digits.
 */
function isValidNuban(accountNumber: string): boolean {
  return /^\d{10}$/.test(accountNumber);
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * List active bank accounts for an entity.
 */
export const listByEntity = query({
  args: { entityId: v.id('entities') },
  handler: async (ctx, { entityId }) => {
    const ownership = await validateOwnership(ctx, entityId);
    if (!ownership) return [];

    return ctx.db
      .query('bankAccounts')
      .withIndex('by_entityId_isActive', (q) =>
        q.eq('entityId', entityId).eq('isActive', true),
      )
      .collect();
  },
});

/**
 * List all bank accounts (including archived) for an entity.
 */
export const listAllByEntity = query({
  args: { entityId: v.id('entities') },
  handler: async (ctx, { entityId }) => {
    const ownership = await validateOwnership(ctx, entityId);
    if (!ownership) return [];

    return ctx.db
      .query('bankAccounts')
      .withIndex('by_entityId', (q) => q.eq('entityId', entityId))
      .collect();
  },
});

/**
 * Get a single bank account by ID.
 */
export const get = query({
  args: { bankAccountId: v.id('bankAccounts') },
  handler: async (ctx, { bankAccountId }) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const account = await ctx.db.get(bankAccountId);
    if (!account || account.userId !== user._id) return null;

    return account;
  },
});

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Create a new bank account.
 */
export const create = mutation({
  args: {
    entityId: v.id('entities'),
    bankName: v.string(),
    bankCode: v.string(),
    accountNumber: v.optional(v.string()),
    accountName: v.optional(v.string()),
    nickname: v.string(),
    currency: v.optional(currencyValidator),
  },
  handler: async (ctx, args) => {
    const ownership = await validateOwnershipMut(ctx, args.entityId);
    if (!ownership) throw new Error('Entity not found or unauthorized');

    if (args.accountNumber && !isValidNuban(args.accountNumber)) {
      throw new Error('Invalid account number: must be exactly 10 digits (NUBAN format)');
    }

    const now = Date.now();
    return ctx.db.insert('bankAccounts', {
      entityId: args.entityId,
      userId: ownership.user._id,
      bankName: args.bankName,
      bankCode: args.bankCode,
      accountNumber: args.accountNumber,
      accountName: args.accountName,
      nickname: args.nickname,
      currency: args.currency ?? 'NGN',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Update editable fields of a bank account.
 */
export const update = mutation({
  args: {
    bankAccountId: v.id('bankAccounts'),
    accountNumber: v.optional(v.string()),
    accountName: v.optional(v.string()),
    nickname: v.optional(v.string()),
    currency: v.optional(currencyValidator),
  },
  handler: async (ctx, { bankAccountId, ...updates }) => {
    const user = await getOrCreateCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    const account = await ctx.db.get(bankAccountId);
    if (!account || account.userId !== user._id) {
      throw new Error('Bank account not found or unauthorized');
    }

    if (updates.accountNumber && !isValidNuban(updates.accountNumber)) {
      throw new Error('Invalid account number: must be exactly 10 digits (NUBAN format)');
    }

    // Build patch object with only provided fields
    const patch: Record<string, any> = { updatedAt: Date.now() };
    if (updates.accountNumber !== undefined) patch.accountNumber = updates.accountNumber;
    if (updates.accountName !== undefined) patch.accountName = updates.accountName;
    if (updates.nickname !== undefined) patch.nickname = updates.nickname;
    if (updates.currency !== undefined) patch.currency = updates.currency;

    await ctx.db.patch(bankAccountId, patch);
    return bankAccountId;
  },
});

/**
 * Soft-delete a bank account (set isActive = false).
 */
export const archive = mutation({
  args: { bankAccountId: v.id('bankAccounts') },
  handler: async (ctx, { bankAccountId }) => {
    const user = await getOrCreateCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    const account = await ctx.db.get(bankAccountId);
    if (!account || account.userId !== user._id) {
      throw new Error('Bank account not found or unauthorized');
    }

    await ctx.db.patch(bankAccountId, { isActive: false, updatedAt: Date.now() });
    return bankAccountId;
  },
});

/**
 * Restore an archived bank account (set isActive = true).
 */
export const restore = mutation({
  args: { bankAccountId: v.id('bankAccounts') },
  handler: async (ctx, { bankAccountId }) => {
    const user = await getOrCreateCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    const account = await ctx.db.get(bankAccountId);
    if (!account || account.userId !== user._id) {
      throw new Error('Bank account not found or unauthorized');
    }

    await ctx.db.patch(bankAccountId, { isActive: true, updatedAt: Date.now() });
    return bankAccountId;
  },
});

/**
 * Assign a bank account to a single transaction.
 * If the transaction belongs to an import job, returns sibling info so
 * the frontend can prompt for batch assignment.
 */
export const assignToTransaction = mutation({
  args: {
    transactionId: v.id('transactions'),
    bankAccountId: v.id('bankAccounts'),
  },
  handler: async (ctx, { transactionId, bankAccountId }) => {
    const user = await getOrCreateCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    // Validate transaction ownership
    const transaction = await ctx.db.get(transactionId);
    if (!transaction || transaction.userId !== user._id) {
      throw new Error('Transaction not found or unauthorized');
    }

    // Validate bank account ownership
    const account = await ctx.db.get(bankAccountId);
    if (!account || account.userId !== user._id) {
      throw new Error('Bank account not found or unauthorized');
    }

    // Assign bank account to the transaction
    await ctx.db.patch(transactionId, {
      bankAccountId,
      updatedAt: Date.now(),
    });

    // If the transaction belongs to an import job, count siblings
    if (transaction.importJobId) {
      const siblings = await ctx.db
        .query('transactions')
        .withIndex('by_importJobId', (q) =>
          q.eq('importJobId', transaction.importJobId),
        )
        .filter((q) =>
          q.and(
            q.neq(q.field('_id'), transactionId),
            q.or(
              q.eq(q.field('bankAccountId'), undefined),
              q.neq(q.field('bankAccountId'), bankAccountId),
            ),
          ),
        )
        .collect();

      return {
        siblingCount: siblings.length,
        importJobId: transaction.importJobId,
      };
    }

    return { siblingCount: 0, importJobId: null };
  },
});

/**
 * Batch-assign a bank account to all transactions sharing an import job.
 * Also updates the importJob record itself.
 */
export const assignToImportJob = mutation({
  args: {
    importJobId: v.id('importJobs'),
    bankAccountId: v.id('bankAccounts'),
  },
  handler: async (ctx, { importJobId, bankAccountId }) => {
    const user = await getOrCreateCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    // Validate import job ownership
    const importJob = await ctx.db.get(importJobId);
    if (!importJob || importJob.userId !== user._id) {
      throw new Error('Import job not found or unauthorized');
    }

    // Validate bank account ownership
    const account = await ctx.db.get(bankAccountId);
    if (!account || account.userId !== user._id) {
      throw new Error('Bank account not found or unauthorized');
    }

    // Update the import job itself
    await ctx.db.patch(importJobId, {
      bankAccountId,
      updatedAt: Date.now(),
    });

    // Find all transactions for this import job
    const transactions = await ctx.db
      .query('transactions')
      .withIndex('by_importJobId', (q) =>
        q.eq('importJobId', importJobId),
      )
      .collect();

    const now = Date.now();
    let updatedCount = 0;
    for (const tx of transactions) {
      await ctx.db.patch(tx._id, { bankAccountId, updatedAt: now });
      updatedCount++;
    }

    return { updatedCount };
  },
});
