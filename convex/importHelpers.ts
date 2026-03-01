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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any;

interface CategoryRow {
  _id: string;
  name: string;
  type: 'income' | 'business_expense' | 'personal_expense' | 'transfer';
  isDeductibleDefault?: boolean;
}

/**
 * Core rule-based categorisation logic.  Loads system categories, runs the
 * rule engine on each transaction, and patches matches with ≥0.7 confidence.
 * Returns { total, categorised }.
 */
async function applyRulesToTransactions(
  db: AnyDb,
  transactions: Array<{ _id: string; description: string; amount: number; direction: 'credit' | 'debit' }>,
) {
  const allCategories: CategoryRow[] = await db
    .query('categories')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((q: any) => q.eq(q.field('isSystem'), true))
    .collect();
  const categoryByName = new Map<string, CategoryRow>(
    allCategories.map((c) => [c.name, c])
  );

  console.log(`[ruleBasedCategoriser] ${allCategories.length} system categories loaded, ${transactions.length} transactions to process`);

  if (allCategories.length === 0) {
    console.warn('[ruleBasedCategoriser] No system categories found — have you run categories:seed?');
    return { total: transactions.length, categorised: 0 };
  }

  let categorised = 0;
  let noMatch = 0;
  let belowThreshold = 0;
  let categoryMissing = 0;
  const now = Date.now();

  for (const tx of transactions) {
    const result = categorise(tx.description, tx.amount, tx.direction);

    if (!result.categoryName || result.confidence < RULE_CONFIDENCE_THRESHOLD) {
      if (result.confidence > 0 && result.confidence < RULE_CONFIDENCE_THRESHOLD) {
        belowThreshold++;
      } else {
        noMatch++;
      }
      continue;
    }

    const category = categoryByName.get(result.categoryName);
    if (!category) {
      categoryMissing++;
      console.warn(`[ruleBasedCategoriser] Category "${result.categoryName}" not found in DB`);
      continue;
    }

    await db.patch(tx._id, {
      categoryId: category._id,
      type: category.type,
      isDeductible: category.isDeductibleDefault ?? false,
      enrichedDescription: result.subcategory,
      updatedAt: now,
    });
    categorised++;
  }

  console.log(
    `[ruleBasedCategoriser] Done — categorised: ${categorised}, belowThreshold: ${belowThreshold}, noMatch: ${noMatch}, categoryMissing: ${categoryMissing}`
  );

  return { total: transactions.length, categorised };
}

/**
 * Apply rule-based categorisation to all uncategorised transactions from an
 * import job.  Runs synchronously in a mutation (no API calls).
 */
export const categoriseImportByRules = internalMutation({
  args: {
    importJobId: v.id('importJobs'),
    entityId: v.id('entities'),
  },
  handler: async (ctx, args) => {
    console.log(`[ruleBasedCategoriser] Running for importJob=${args.importJobId}, entity=${args.entityId}`);

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

    return applyRulesToTransactions(ctx.db, transactions);
  },
});

/**
 * Apply rule-based categorisation to ALL uncategorised transactions for an
 * entity (regardless of import job).  Use this to re-run rules on existing
 * transactions that were imported before the rule engine was deployed.
 */
export const categoriseAllByRules = internalMutation({
  args: {
    entityId: v.id('entities'),
  },
  handler: async (ctx, args) => {
    console.log(`[ruleBasedCategoriser] Running for ALL uncategorised, entity=${args.entityId}`);

    const transactions = await ctx.db
      .query('transactions')
      .withIndex('by_entityId_type', (q) =>
        q.eq('entityId', args.entityId).eq('type', 'uncategorised')
      )
      .filter((q) => q.neq(q.field('reviewedByUser'), true))
      .collect();

    return applyRulesToTransactions(ctx.db, transactions);
  },
});
