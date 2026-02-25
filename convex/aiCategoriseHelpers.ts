import { internalMutation, internalQuery } from './_generated/server';
import { v } from 'convex/values';

/**
 * Get a user record by Clerk user ID (for use in actions).
 */
export const getUserByClerkId = internalQuery({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query('users')
      .withIndex('by_clerk_user_id', (q) => q.eq('clerkUserId', args.clerkUserId))
      .first();
  },
});

/**
 * Get an entity for a specific user (ownership check).
 */
export const getEntityForUser = internalQuery({
  args: { entityId: v.id('entities'), userId: v.id('users') },
  handler: async (ctx, args) => {
    const entity = await ctx.db.get(args.entityId);
    if (!entity || entity.userId !== args.userId || entity.deletedAt) return null;
    return entity;
  },
});

const CONFIDENCE_THRESHOLD = 0.7;

const transactionTypeValidator = v.union(
  v.literal('income'),
  v.literal('business_expense'),
  v.literal('personal_expense'),
  v.literal('transfer'),
  v.literal('uncategorised')
);

/**
 * Create a new categorisingJob record at the start of AI categorisation.
 */
export const createCategorisingJob = internalMutation({
  args: {
    entityId: v.id('entities'),
    userId: v.id('users'),
    importJobId: v.optional(v.id('importJobs')),
    totalTransactions: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const id = await ctx.db.insert('categorisingJobs', {
      entityId: args.entityId,
      userId: args.userId,
      importJobId: args.importJobId,
      status: 'pending',
      totalTransactions: args.totalTransactions,
      confidenceThreshold: CONFIDENCE_THRESHOLD,
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  },
});

/**
 * Update progress / status on a categorisingJob.
 */
export const updateCategorisingJob = internalMutation({
  args: {
    jobId: v.id('categorisingJobs'),
    status: v.optional(
      v.union(
        v.literal('pending'),
        v.literal('processing'),
        v.literal('complete'),
        v.literal('failed'),
        v.literal('cancelled')
      )
    ),
    totalCategorised: v.optional(v.number()),
    totalLowConfidence: v.optional(v.number()),
    totalFailed: v.optional(v.number()),
    batchesTotal: v.optional(v.number()),
    batchesCompleted: v.optional(v.number()),
    totalTokensUsed: v.optional(v.number()),
    estimatedCostUsd: v.optional(v.number()),
    modelUsed: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    completedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.status !== undefined) patch.status = args.status;
    if (args.totalCategorised !== undefined) patch.totalCategorised = args.totalCategorised;
    if (args.totalLowConfidence !== undefined) patch.totalLowConfidence = args.totalLowConfidence;
    if (args.totalFailed !== undefined) patch.totalFailed = args.totalFailed;
    if (args.batchesTotal !== undefined) patch.batchesTotal = args.batchesTotal;
    if (args.batchesCompleted !== undefined) patch.batchesCompleted = args.batchesCompleted;
    if (args.totalTokensUsed !== undefined) patch.totalTokensUsed = args.totalTokensUsed;
    if (args.estimatedCostUsd !== undefined) patch.estimatedCostUsd = args.estimatedCostUsd;
    if (args.modelUsed !== undefined) patch.modelUsed = args.modelUsed;
    if (args.errorMessage !== undefined) patch.errorMessage = args.errorMessage;
    if (args.completedAt !== undefined) patch.completedAt = args.completedAt;
    await ctx.db.patch(args.jobId, patch);
  },
});

/**
 * Apply AI categorisation results to transactions.
 * High-confidence (≥0.7): apply category + type.
 * Low-confidence (<0.7): store suggestion only, keep type='uncategorised'.
 * Returns { categorised, lowConfidence, failed } counts.
 */
export const applyAiResults = internalMutation({
  args: {
    results: v.array(
      v.object({
        transactionId: v.id('transactions'),
        categorisingJobId: v.id('categorisingJobs'),
        aiCategorySuggestion: v.optional(v.string()),
        aiTypeSuggestion: v.optional(transactionTypeValidator),
        aiCategoryConfidence: v.optional(v.number()),
        aiReasoning: v.optional(v.string()),
        confidence: v.number(),
        categoryName: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Load all categories once for name→record lookup
    const allCategories = await ctx.db.query('categories').collect();
    const categoryByName = new Map(allCategories.map((c) => [c.name.toLowerCase(), c]));

    let categorised = 0;
    let lowConfidence = 0;
    let failed = 0;
    const now = Date.now();

    for (const result of args.results) {
      try {
        const tx = await ctx.db.get(result.transactionId);
        if (!tx) {
          failed++;
          continue;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const patch: Record<string, any> = {
          aiCategorySuggestion: result.aiCategorySuggestion,
          aiTypeSuggestion: result.aiTypeSuggestion,
          aiCategoryConfidence: result.aiCategoryConfidence,
          aiReasoning: result.aiReasoning,
          aiCategorisingJobId: result.categorisingJobId,
          updatedAt: now,
        };

        if (result.confidence >= CONFIDENCE_THRESHOLD && result.categoryName) {
          const category = categoryByName.get(result.categoryName.toLowerCase());
          if (category) {
            patch.categoryId = category._id;
            patch.type = category.type;
            patch.isDeductible = category.isDeductibleDefault ?? false;
            patch.aiCategorisedAt = now;
            categorised++;
          } else {
            // Category name not in DB — apply suggested type if not uncategorised
            if (result.aiTypeSuggestion && result.aiTypeSuggestion !== 'uncategorised') {
              patch.type = result.aiTypeSuggestion;
              patch.aiCategorisedAt = now;
              categorised++;
            } else {
              lowConfidence++;
            }
          }
        } else {
          lowConfidence++;
        }

        await ctx.db.patch(result.transactionId, patch);
      } catch {
        failed++;
      }
    }

    return { categorised, lowConfidence, failed };
  },
});

/**
 * Get uncategorised transactions for a specific import job (for AI processing).
 */
export const getTransactionsByImportJob = internalQuery({
  args: {
    entityId: v.id('entities'),
    importJobId: v.union(v.id('importJobs'), v.null()),
  },
  handler: async (ctx, args) => {
    if (!args.importJobId) return [];

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

    return transactions.map((tx) => ({
      _id: tx._id,
      description: tx.description,
      amount: tx.amount,
      direction: tx.direction,
    }));
  },
});

/**
 * Get uncategorised (and not reviewed) transactions for an entity.
 * Optionally filter to a specific list of transaction IDs.
 * Used for on-demand re-categorisation.
 */
export const getUncategorisedForEntity = internalQuery({
  args: {
    entityId: v.id('entities'),
    transactionIds: v.optional(v.array(v.id('transactions'))),
  },
  handler: async (ctx, args) => {
    if (args.transactionIds && args.transactionIds.length > 0) {
      // Fetch specific transactions, filter to uncategorised+unreviewed
      const results = [];
      for (const id of args.transactionIds) {
        const tx = await ctx.db.get(id);
        if (
          tx &&
          tx.entityId === args.entityId &&
          tx.type === 'uncategorised' &&
          !tx.reviewedByUser
        ) {
          results.push({
            _id: tx._id,
            description: tx.description,
            amount: tx.amount,
            direction: tx.direction,
          });
        }
      }
      return results;
    }

    // Fetch all uncategorised + unreviewed for entity
    const transactions = await ctx.db
      .query('transactions')
      .withIndex('by_entityId_type', (q) =>
        q.eq('entityId', args.entityId).eq('type', 'uncategorised')
      )
      .filter((q) => q.neq(q.field('reviewedByUser'), true))
      .collect();

    return transactions.map((tx) => ({
      _id: tx._id,
      description: tx.description,
      amount: tx.amount,
      direction: tx.direction,
    }));
  },
});

/**
 * Get a single categorisingJob by ID (internal).
 */
export const getCategorisingJob = internalQuery({
  args: { jobId: v.id('categorisingJobs') },
  handler: async (ctx, args) => {
    return ctx.db.get(args.jobId);
  },
});

/**
 * Get all categories for use in AI prompt construction.
 */
export const getCategoriesList = internalQuery({
  args: {},
  handler: async (ctx) => {
    const categories = await ctx.db.query('categories').collect();
    return categories.map((c) => ({
      _id: c._id,
      name: c.name,
      type: c.type,
    }));
  },
});

/**
 * Get the most recent user corrections (aiCategorisationFeedback records)
 * for an entity, limited to 20 items, for use as few-shot examples.
 */
export const getFewShotExamples = internalQuery({
  args: { entityId: v.id('entities') },
  handler: async (ctx, args) => {
    const records = await ctx.db
      .query('aiCategorisationFeedback')
      .withIndex('by_entityId', (q) => q.eq('entityId', args.entityId))
      .order('desc')
      .take(20);

    return records.map((r) => ({
      description: r.transactionDescription,
      direction: r.transactionDirection,
      amountNaira: (r.transactionAmount / 100).toFixed(2),
      aiSuggested: r.aiSuggestedCategory ?? null,
      userChosen: r.userChosenCategory,
    }));
  },
});

// ─────────────────────────────────────────────
// Circuit Breaker
// ─────────────────────────────────────────────

const CIRCUIT_BREAKER_THRESHOLD = 3; // consecutive failures to open
const CIRCUIT_BREAKER_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const CIRCUIT_BREAKER_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Check whether the AI circuit breaker is open for this entity.
 * Returns { open: true, openUntil: timestamp } if AI calls should be skipped.
 */
export const checkCircuitBreaker = internalQuery({
  args: { entityId: v.id('entities') },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Get the most recent failed categorisingJobs for this entity
    const recentJobs = await ctx.db
      .query('categorisingJobs')
      .withIndex('by_entityId', (q) => q.eq('entityId', args.entityId))
      .order('desc')
      .take(10);

    // Find consecutive failures from the most recent job backwards
    let consecutiveFailures = 0;
    let latestFailureAt = 0;

    for (const job of recentJobs) {
      if (job.status === 'failed') {
        consecutiveFailures++;
        if (job.completedAt && job.completedAt > latestFailureAt) {
          latestFailureAt = job.completedAt;
        }
      } else if (job.status === 'complete' || job.status === 'processing') {
        // Chain broken by a success
        break;
      }
      // 'pending' / 'cancelled' don't break the chain but don't count as failures
    }

    if (
      consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD &&
      latestFailureAt > 0 &&
      now - latestFailureAt <= CIRCUIT_BREAKER_WINDOW_MS
    ) {
      const openUntil = latestFailureAt + CIRCUIT_BREAKER_COOLDOWN_MS;
      if (now < openUntil) {
        return { open: true, openUntil };
      }
    }

    return { open: false, openUntil: null };
  },
});
