import { internalMutation, internalQuery } from './_generated/server';
import { v } from 'convex/values';
import { categorise } from './ruleBasedCategoriser';

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
 *
 * Pre-fetches existing transactions for the relevant dates in bulk to avoid
 * per-transaction queries that blow past Convex's 32k read limit.
 *
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

    // Pre-fetch existing transactions for the dates we're about to insert.
    // One query per unique date (very selective via the composite index).
    const uniqueDates = [...new Set(args.transactions.map((tx) => tx.date))];

    const existingKeySet = new Set<string>();
    const existingRefSet = new Set<string>();

    for (const date of uniqueDates) {
      const rows = await ctx.db
        .query('transactions')
        .withIndex('by_entityId_date', (q) =>
          q.eq('entityId', args.entityId).eq('date', date)
        )
        .collect();

      for (const row of rows) {
        existingKeySet.add(`${row.date}|${row.amount}|${row.description}`);
        if (row.externalRef) existingRefSet.add(row.externalRef);
      }
    }

    for (const tx of args.transactions) {
      const dedupKey = `${tx.date}|${tx.amount}|${tx.description}`;
      if (existingKeySet.has(dedupKey)) {
        duplicatesSkipped++;
        continue;
      }

      if (tx.externalRef && existingRefSet.has(tx.externalRef)) {
        duplicatesSkipped++;
        continue;
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

      // Track newly inserted transactions so intra-batch duplicates are caught
      existingKeySet.add(dedupKey);
      if (tx.externalRef) existingRefSet.add(tx.externalRef);
      totalImported++;
    }

    return { totalImported, duplicatesSkipped };
  },
});

const RULE_CONFIDENCE_THRESHOLD = 0.7;

/**
 * Apply rule-based categorisation to all uncategorised transactions from an
 * import job.  Runs synchronously in a mutation (no API calls).  High-confidence
 * matches (≥0.7) are applied directly; lower-confidence results are left for
 * AI or manual triage.
 */
export const categoriseImportByRules = internalMutation({
  args: {
    importJobId: v.id('importJobs'),
    entityId: v.id('entities'),
  },
  handler: async (ctx, args) => {
    const allCategories = await ctx.db
      .query('categories')
      .filter((q) => q.eq(q.field('isSystem'), true))
      .collect();
    const categoryByName = new Map(
      allCategories.map((c) => [c.name, c])
    );

    const transactions = await ctx.db
      .query('transactions')
      .withIndex('by_entityId_date', (q) => q.eq('entityId', args.entityId))
      .filter((q) =>
        q.and(
          q.eq(q.field('importJobId'), args.importJobId),
          q.eq(q.field('type'), 'uncategorised')
        )
      )
      .collect();

    let categorised = 0;
    const now = Date.now();

    for (const tx of transactions) {
      const result = categorise(tx.description, tx.amount, tx.direction);

      if (
        result.categoryName &&
        result.confidence >= RULE_CONFIDENCE_THRESHOLD
      ) {
        const category = categoryByName.get(result.categoryName);
        if (category) {
          await ctx.db.patch(tx._id, {
            categoryId: category._id,
            type: category.type,
            isDeductible: category.isDeductibleDefault ?? false,
            enrichedDescription: result.subcategory,
            updatedAt: now,
          });
          categorised++;
        }
      }
    }

    return { total: transactions.length, categorised };
  },
});
