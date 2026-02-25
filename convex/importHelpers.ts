import { internalMutation, internalQuery } from './_generated/server';
import { v } from 'convex/values';

const currencyValidator = v.union(
  v.literal('NGN'),
  v.literal('USD'),
  v.literal('GBP'),
  v.literal('EUR')
);

const directionValidator = v.union(v.literal('credit'), v.literal('debit'));

const transactionTypeValidator = v.union(
  v.literal('income'),
  v.literal('business_expense'),
  v.literal('personal_expense'),
  v.literal('transfer'),
  v.literal('uncategorised')
);

/**
 * Fetch the import job record (read from action context).
 */
export const getJob = internalQuery({
  args: { jobId: v.id('importJobs') },
  handler: async (ctx, { jobId }) => {
    return await ctx.db.get(jobId);
  },
});

/**
 * Mark import job as processing.
 */
export const setJobProcessing = internalMutation({
  args: { jobId: v.id('importJobs') },
  handler: async (ctx, { jobId }) => {
    await ctx.db.patch(jobId, {
      status: 'processing',
      startedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

/**
 * Mark import job as complete with final stats.
 */
export const setJobComplete = internalMutation({
  args: {
    jobId: v.id('importJobs'),
    totalParsed: v.number(),
    totalImported: v.number(),
    duplicatesSkipped: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      status: 'complete',
      totalParsed: args.totalParsed,
      totalImported: args.totalImported,
      duplicatesSkipped: args.duplicatesSkipped,
      completedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

/**
 * Mark import job as failed with an error message.
 * Partial stats recorded if available.
 */
export const setJobFailed = internalMutation({
  args: {
    jobId: v.id('importJobs'),
    errorMessage: v.string(),
    totalParsed: v.optional(v.number()),
    totalImported: v.optional(v.number()),
    duplicatesSkipped: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      status: 'failed',
      errorMessage: args.errorMessage,
      totalParsed: args.totalParsed,
      totalImported: args.totalImported,
      duplicatesSkipped: args.duplicatesSkipped,
      completedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

/**
 * Batch insert parsed transactions with dedup logic.
 * Deduplicates on (entityId, date, amount, description) and externalRef.
 * Returns { totalImported, duplicatesSkipped }.
 */
export const batchInsert = internalMutation({
  args: {
    jobId: v.id('importJobs'),
    entityId: v.id('entities'),
    userId: v.id('users'),
    transactions: v.array(
      v.object({
        date: v.number(),
        description: v.string(),
        amount: v.number(),
        currency: currencyValidator,
        amountNgn: v.number(),
        fxRate: v.number(),
        direction: directionValidator,
        type: transactionTypeValidator,
        externalRef: v.optional(v.string()),
        notes: v.optional(v.string()),
        taxYear: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    let totalImported = 0;
    let duplicatesSkipped = 0;
    const now = Date.now();

    for (const tx of args.transactions) {
      // Primary dedup: match by entityId + date + amount + description
      const existing = await ctx.db
        .query('transactions')
        .withIndex('by_entityId_date', (q) =>
          q.eq('entityId', args.entityId).eq('date', tx.date)
        )
        .filter((q) =>
          q.and(
            q.eq(q.field('amount'), tx.amount),
            q.eq(q.field('description'), tx.description)
          )
        )
        .first();

      if (existing) {
        duplicatesSkipped++;
        continue;
      }

      // Secondary dedup: match by externalRef within entity
      if (tx.externalRef) {
        const byRef = await ctx.db
          .query('transactions')
          .withIndex('by_entityId_date', (q) => q.eq('entityId', args.entityId))
          .filter((q) => q.eq(q.field('externalRef'), tx.externalRef))
          .first();
        if (byRef) {
          duplicatesSkipped++;
          continue;
        }
      }

      await ctx.db.insert('transactions', {
        entityId: args.entityId,
        userId: args.userId,
        importJobId: args.jobId,
        date: tx.date,
        description: tx.description,
        amount: tx.amount,
        currency: tx.currency,
        amountNgn: tx.amountNgn,
        fxRate: tx.fxRate,
        direction: tx.direction,
        type: tx.type,
        externalRef: tx.externalRef,
        notes: tx.notes,
        taxYear: tx.taxYear,
        reviewedByUser: false,
        createdAt: now,
        updatedAt: now,
      });
      totalImported++;
    }

    return { totalImported, duplicatesSkipped };
  },
});
