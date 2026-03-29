import { mutation, query } from './_generated/server';
import { getOrCreateCurrentUser, getCurrentUser } from './auth';
import { v } from 'convex/values';
import { extractCounterparty, normalizeDescription } from './lib/counterpartyExtractor';
import { Id } from './_generated/dataModel';

const transactionTypeValidator = v.union(
  v.literal('income'),
  v.literal('business_expense'),
  v.literal('personal_expense'),
  v.literal('transfer'),
  v.literal('uncategorised')
);

const currencyValidator = v.union(
  v.literal('NGN'),
  v.literal('USD'),
  v.literal('GBP'),
  v.literal('EUR')
);

const directionValidator = v.union(v.literal('credit'), v.literal('debit'));

const importSourceValidator = v.union(
  v.literal('pdf'),
  v.literal('csv'),
  v.literal('bank_api'),
  v.literal('paystack'),
  v.literal('flutterwave'),
  v.literal('manual')
);

// ================== QUERIES ==================

/**
 * Paginated, filtered, sortable transaction list for an entity.
 * Resolves category names for each transaction.
 */
export const list = query({
  args: {
    entityId: v.id('entities'),
    taxYear: v.optional(v.number()),
    type: v.optional(transactionTypeValidator),
    direction: v.optional(directionValidator),
    categoryId: v.optional(v.id('categories')),
    connectedAccountId: v.optional(v.id('connectedAccounts')),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    search: v.optional(v.string()),
    sortBy: v.optional(v.union(v.literal('date'), v.literal('amount'), v.literal('category'))),
    sortOrder: v.optional(v.union(v.literal('asc'), v.literal('desc'))),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return { transactions: [], totalCount: 0, hasMore: false };

    const entity = await ctx.db.get(args.entityId);
    if (!entity || entity.userId !== user._id || entity.deletedAt) {
      return { transactions: [], totalCount: 0, hasMore: false };
    }

    // Fetch transactions using most specific available index
    let transactions;
    if (args.taxYear) {
      transactions = await ctx.db
        .query('transactions')
        .withIndex('by_entityId_taxYear', (q) =>
          q.eq('entityId', args.entityId).eq('taxYear', args.taxYear!)
        )
        .collect();
    } else if (args.type) {
      transactions = await ctx.db
        .query('transactions')
        .withIndex('by_entityId_type', (q) =>
          q.eq('entityId', args.entityId).eq('type', args.type!)
        )
        .collect();
    } else {
      transactions = await ctx.db
        .query('transactions')
        .withIndex('by_entityId_date', (q) => q.eq('entityId', args.entityId))
        .collect();
    }

    // JS-level filters
    if (args.type && !args.taxYear) {
      // already filtered via index above
    } else if (args.type) {
      transactions = transactions.filter((t) => t.type === args.type);
    }

    if (args.categoryId) {
      transactions = transactions.filter((t) => t.categoryId === args.categoryId);
    }

    if (args.connectedAccountId) {
      transactions = transactions.filter(
        (t) => t.connectedAccountId === args.connectedAccountId
      );
    }

    if (args.direction) {
      transactions = transactions.filter((t) => t.direction === args.direction);
    }

    if (args.startDate) {
      transactions = transactions.filter((t) => t.date >= args.startDate!);
    }

    if (args.endDate) {
      transactions = transactions.filter((t) => t.date <= args.endDate!);
    }

    // Resolve category details (batch) — done before search so category name is searchable
    const categoryIds = [...new Set(transactions.flatMap((t) => (t.categoryId ? [t.categoryId] : [])))];
    const categoryMap = new Map<string, { name: string; color?: string; icon?: string }>();
    for (const catId of categoryIds) {
      const cat = await ctx.db.get(catId as any);
      if (cat && 'name' in cat) categoryMap.set(catId as string, { name: (cat as any).name, color: (cat as any).color, icon: (cat as any).icon });
    }

    if (args.search) {
      const searchLower = args.search.toLowerCase();
      transactions = transactions.filter((t) => {
        const catName = t.categoryId ? categoryMap.get(t.categoryId)?.name : undefined;
        return (
          t.description.toLowerCase().includes(searchLower) ||
          (t.enrichedDescription?.toLowerCase().includes(searchLower) ?? false) ||
          (t.notes?.toLowerCase().includes(searchLower) ?? false) ||
          (catName?.toLowerCase().includes(searchLower) ?? false)
        );
      });
    }

    const enriched = transactions.map((t) => ({
      ...t,
      categoryName: t.categoryId ? (categoryMap.get(t.categoryId)?.name ?? null) : null,
      categoryColor: t.categoryId ? (categoryMap.get(t.categoryId)?.color ?? null) : null,
      categoryIcon: t.categoryId ? (categoryMap.get(t.categoryId)?.icon ?? null) : null,
    }));

    // Sorting
    const sortBy = args.sortBy ?? 'date';
    const sortOrder = args.sortOrder ?? 'desc';
    const direction = sortOrder === 'asc' ? 1 : -1;

    enriched.sort((a, b) => {
      if (sortBy === 'amount') return direction * (a.amountNgn - b.amountNgn);
      if (sortBy === 'category') {
        const aN = a.categoryName ?? '';
        const bN = b.categoryName ?? '';
        return direction * aN.localeCompare(bN);
      }
      // default: date
      return direction * (a.date - b.date);
    });

    // Pagination
    const totalCount = enriched.length;
    const offset = args.offset ?? 0;
    const limit = args.limit ?? 50;
    const page = enriched.slice(offset, offset + limit);
    const hasMore = offset + limit < totalCount;

    return { transactions: page, totalCount, hasMore };
  },
});

/**
 * Get a single transaction by ID with category name resolved.
 */
export const get = query({
  args: {
    id: v.id('transactions'),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const transaction = await ctx.db.get(args.id);
    if (!transaction || transaction.userId !== user._id) return null;

    let categoryName: string | null = null;
    let categoryColor: string | null = null;
    let categoryIcon: string | null = null;
    if (transaction.categoryId) {
      const cat = await ctx.db.get(transaction.categoryId);
      categoryName = cat?.name ?? null;
      categoryColor = cat?.color ?? null;
      categoryIcon = cat?.icon ?? null;
    }

    return { ...transaction, categoryName, categoryColor, categoryIcon };
  },
});

/**
 * Returns all uncategorised transactions for an entity (for triage UI).
 */
export const getUncategorised = query({
  args: {
    entityId: v.id('entities'),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const entity = await ctx.db.get(args.entityId);
    if (!entity || entity.userId !== user._id || entity.deletedAt) return [];

    const transactions = await ctx.db
      .query('transactions')
      .withIndex('by_entityId_type', (q) =>
        q.eq('entityId', args.entityId).eq('type', 'uncategorised')
      )
      .order('asc')
      .collect();

    const limit = args.limit ?? 50;
    return transactions.slice(0, limit);
  },
});

/**
 * AI statistics for the Categorisation Insights view.
 * Computed from aiCategorisationFeedback records for the entity.
 * Returns overall accuracy, per-category accuracy, override rate,
 * total AI-categorised vs manually-categorised counts.
 */
export const getAiStats = query({
  args: {
    entityId: v.id('entities'),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const entity = await ctx.db.get(args.entityId);
    if (!entity || entity.userId !== user._id || entity.deletedAt) return null;

    // Load all feedback records for this entity
    const feedbackRecords = await ctx.db
      .query('aiCategorisationFeedback')
      .withIndex('by_entityId', (q) => q.eq('entityId', args.entityId))
      .collect();

    if (feedbackRecords.length === 0) {
      return {
        hasData: false,
        totalAiCategorised: 0,
        totalManual: 0,
        totalFeedback: 0,
        overrideRate: 0,
        accuracyRate: 0,
        byCategory: [],
      };
    }

    // Count overrides (user changed AI suggestion)
    const overrides = feedbackRecords.filter((f) => {
      if (!f.aiSuggestedCategory) return false;
      return f.userChosenCategory !== f.aiSuggestedCategory;
    });
    const agreements = feedbackRecords.filter((f) => {
      if (!f.aiSuggestedCategory) return false;
      return f.userChosenCategory === f.aiSuggestedCategory;
    });

    const totalFeedback = feedbackRecords.length;
    const withSuggestion = feedbackRecords.filter((f) => !!f.aiSuggestedCategory).length;
    const overrideRate = withSuggestion > 0 ? overrides.length / withSuggestion : 0;
    const accuracyRate = withSuggestion > 0 ? agreements.length / withSuggestion : 0;

    // Per-category breakdown: for each AI-suggested category, how often was it accepted?
    const categoryMap = new Map<string, { accepted: number; overridden: number }>();
    for (const f of feedbackRecords) {
      if (!f.aiSuggestedCategory) continue;
      const key = f.aiSuggestedCategory;
      const existing = categoryMap.get(key) ?? { accepted: 0, overridden: 0 };
      if (f.userChosenCategory === f.aiSuggestedCategory) {
        existing.accepted++;
      } else {
        existing.overridden++;
      }
      categoryMap.set(key, existing);
    }

    const byCategory = Array.from(categoryMap.entries())
      .map(([category, counts]) => {
        const total = counts.accepted + counts.overridden;
        return {
          category,
          total,
          accepted: counts.accepted,
          overridden: counts.overridden,
          accuracy: total > 0 ? counts.accepted / total : 0,
        };
      })
      .sort((a, b) => b.total - a.total);

    // Count total AI-categorised transactions (have aiCategorisedAt set)
    const allTxForEntity = await ctx.db
      .query('transactions')
      .withIndex('by_entityId_date', (q) => q.eq('entityId', args.entityId))
      .collect();
    const totalAiCategorised = allTxForEntity.filter((tx) => tx.aiCategorisedAt).length;
    const totalManual = allTxForEntity.filter(
      (tx) => tx.reviewedByUser && !tx.aiCategorisedAt
    ).length;

    return {
      hasData: true,
      totalAiCategorised,
      totalManual,
      totalFeedback,
      overrideRate,
      accuracyRate,
      byCategory,
    };
  },
});

/**
 * Find transactions similar to a just-categorized transaction.
 * Used by the Smart Batch Categorisation modal.
 *
 * Returns up to 25 uncategorised or low-confidence AI transactions
 * matching by exact description or counterparty extraction.
 *
 * Performance note: collects all transactions for entity+taxYear into memory
 * for string matching. For typical users (<2000 txns/year) this is fine.
 * If transaction volumes grow significantly, consider adding a description
 * index or early-exit optimization.
 */
export const findSimilar = query({
  args: {
    transactionId: v.id('transactions'),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return { matches: [], sourceCounterparty: null as string | null };

    // Fetch the source transaction (already updated with new category)
    const source = await ctx.db.get(args.transactionId);
    if (!source || source.userId !== user._id) {
      return { matches: [], sourceCounterparty: null as string | null };
    }

    // Get all transactions for the same entity + taxYear
    const candidates = await ctx.db
      .query('transactions')
      .withIndex('by_entityId_taxYear', (q) =>
        q.eq('entityId', source.entityId).eq('taxYear', source.taxYear)
      )
      .collect();

    const sourceNormalized = normalizeDescription(source.description);
    const sourceCounterparty = extractCounterparty(source.description);

    type SimilarTransaction = {
      _id: Id<'transactions'>;
      description: string;
      amount: number;
      amountNgn: number;
      date: number;
      direction: 'credit' | 'debit';
      aiCategorySuggestion?: string;
      aiCategoryConfidence?: number;
      matchType: 'exact' | 'counterparty';
    };

    const results: SimilarTransaction[] = [];
    const seenIds = new Set<string>();

    for (const tx of candidates) {
      // Early exit once we have enough matches. Note: since the index doesn't
      // guarantee date ordering, these may not be the 25 *most recent* matches.
      // For typical users (<2000 txns/year), eligible matches rarely exceed 25,
      // making this a non-issue in practice. If needed, remove this early exit
      // and rely on the sort+slice below.
      if (results.length >= 25) break;

      // Skip the source transaction itself
      if (tx._id === source._id) continue;

      // Skip already-reviewed transactions
      if (tx.reviewedByUser === true) continue;

      // Must be same direction
      if (tx.direction !== source.direction) continue;

      // Eligibility: uncategorised OR low-confidence AI
      const isUncategorised = tx.type === 'uncategorised' && !tx.categoryId;
      const isLowConfidenceAi =
        tx.aiCategoryConfidence !== undefined && tx.aiCategoryConfidence < 0.7;
      if (!isUncategorised && !isLowConfidenceAi) continue;

      // Check exact description match
      const txNormalized = normalizeDescription(tx.description);
      if (txNormalized === sourceNormalized) {
        if (!seenIds.has(tx._id)) {
          seenIds.add(tx._id);
          results.push({
            _id: tx._id,
            description: tx.description,
            amount: tx.amount,
            amountNgn: tx.amountNgn,
            date: tx.date,
            direction: tx.direction,
            aiCategorySuggestion: tx.aiCategorySuggestion,
            aiCategoryConfidence: tx.aiCategoryConfidence,
            matchType: 'exact',
          });
        }
        continue;
      }

      // Check counterparty match
      if (sourceCounterparty) {
        const txCounterparty = extractCounterparty(tx.description);
        if (
          txCounterparty &&
          txCounterparty === sourceCounterparty // Both already uppercased by extractCounterparty
        ) {
          if (!seenIds.has(tx._id)) {
            seenIds.add(tx._id);
            results.push({
              _id: tx._id,
              description: tx.description,
              amount: tx.amount,
              amountNgn: tx.amountNgn,
              date: tx.date,
              direction: tx.direction,
              aiCategorySuggestion: tx.aiCategorySuggestion,
              aiCategoryConfidence: tx.aiCategoryConfidence,
              matchType: 'counterparty',
            });
          }
        }
      }
    }

    // Sort by date descending
    results.sort((a, b) => b.date - a.date);
    return { matches: results.slice(0, 25), sourceCounterparty };
  },
});

// ================== MUTATIONS ==================

/**
 * Manually create a transaction (user-facing form).
 * Computes amountNgn from amount + optional fxRate.
 */
export const manualCreate = mutation({
  args: {
    entityId: v.id('entities'),
    date: v.number(),
    description: v.string(),
    amount: v.number(),
    currency: currencyValidator,
    fxRate: v.optional(v.number()),
    direction: v.optional(directionValidator),
    categoryId: v.optional(v.id('categories')),
    type: v.optional(transactionTypeValidator),
    deductiblePercent: v.optional(v.number()),
    whtDeducted: v.optional(v.number()),
    whtRate: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    const entity = await ctx.db.get(args.entityId);
    if (!entity || entity.userId !== user._id || entity.deletedAt) {
      throw new Error('Entity not found or unauthorized');
    }

    // Compute amountNgn
    let amountNgn: number;
    let fxRate: number;
    if (args.currency === 'NGN') {
      amountNgn = args.amount;
      fxRate = 1;
    } else if (args.fxRate) {
      fxRate = args.fxRate;
      amountNgn = Math.round(args.amount * fxRate);
    } else {
      // No FX rate provided — treat 1:1 (caller should provide fxRate for accuracy)
      amountNgn = args.amount;
      fxRate = 1;
    }

    // Determine isDeductible from category default
    let isDeductible: boolean | undefined;
    if (args.categoryId) {
      const cat = await ctx.db.get(args.categoryId);
      isDeductible = cat?.isDeductibleDefault ?? false;
    }

    const taxYear = new Date(args.date).getFullYear();
    const now = Date.now();

    return await ctx.db.insert('transactions', {
      entityId: args.entityId,
      userId: user._id,
      date: args.date,
      description: args.description,
      amount: args.amount,
      currency: args.currency,
      amountNgn,
      fxRate,
      direction: args.direction ?? 'debit',
      type: args.type ?? (args.categoryId ? 'business_expense' : 'uncategorised'),
      categoryId: args.categoryId,
      isDeductible,
      deductiblePercent: args.deductiblePercent,
      whtDeducted: args.whtDeducted,
      whtRate: args.whtRate,
      notes: args.notes,
      taxYear,
      reviewedByUser: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Update editable transaction fields (description, type, tax fields, notes).
 */
export const update = mutation({
  args: {
    id: v.id('transactions'),
    description: v.optional(v.string()),
    type: v.optional(transactionTypeValidator),
    categoryId: v.optional(v.id('categories')),
    isDeductible: v.optional(v.boolean()),
    deductiblePercent: v.optional(v.number()),
    whtDeducted: v.optional(v.number()),
    whtRate: v.optional(v.number()),
    notes: v.optional(v.string()),
    reviewedByUser: v.optional(v.boolean()),
    userOverrodeAi: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    const { id, ...fields } = args;
    const transaction = await ctx.db.get(id);
    if (!transaction || transaction.userId !== user._id) {
      throw new Error('Transaction not found or unauthorized');
    }

    // If categoryId is being changed, update isDeductible from category default
    let extraFields: { isDeductible?: boolean } = {};
    if (fields.categoryId && fields.isDeductible === undefined) {
      const cat = await ctx.db.get(fields.categoryId);
      extraFields.isDeductible = cat?.isDeductibleDefault ?? false;
    }

    await ctx.db.patch(id, {
      ...fields,
      ...extraFields,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Delete a transaction (ownership check).
 * Named `remove` since `delete` is a reserved word.
 */
export const remove = mutation({
  args: {
    id: v.id('transactions'),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    const transaction = await ctx.db.get(args.id);
    if (!transaction || transaction.userId !== user._id) {
      throw new Error('Transaction not found or unauthorized');
    }

    await ctx.db.delete(args.id);
  },
});

/**
 * Bulk categorise transactions: set categoryId, type, and isDeductible from category default.
 */
export const bulkCategorise = mutation({
  args: {
    ids: v.array(v.id('transactions')),
    categoryId: v.id('categories'),
    type: transactionTypeValidator,
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    const category = await ctx.db.get(args.categoryId);
    const isDeductible = category?.isDeductibleDefault ?? false;

    let updated = 0;
    for (const id of args.ids) {
      const transaction = await ctx.db.get(id);
      if (!transaction || transaction.userId !== user._id) continue;

      await ctx.db.patch(id, {
        categoryId: args.categoryId,
        type: args.type,
        isDeductible,
        reviewedByUser: true,
        updatedAt: Date.now(),
      });
      updated++;
    }

    return { updated };
  },
});

/**
 * Bulk delete transactions (ownership check on each).
 */
export const bulkDelete = mutation({
  args: {
    ids: v.array(v.id('transactions')),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    let deleted = 0;
    for (const id of args.ids) {
      const transaction = await ctx.db.get(id);
      if (!transaction || transaction.userId !== user._id) continue;
      await ctx.db.delete(id);
      deleted++;
    }

    return { deleted };
  },
});

/**
 * Accept an AI suggestion: look up category by aiCategorySuggestion name,
 * apply it (or type suggestion), set reviewedByUser=true, userOverrodeAi=false.
 */
export const acceptAiSuggestion = mutation({
  args: {
    id: v.id('transactions'),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    const tx = await ctx.db.get(args.id);
    if (!tx || tx.userId !== user._id) throw new Error('Transaction not found or unauthorized');
    if (!tx.aiCategorySuggestion) throw new Error('No AI suggestion available');

    // Look up category by name (case-insensitive)
    const allCategories = await ctx.db.query('categories').collect();
    const category = allCategories.find(
      (c) => c.name.toLowerCase() === tx.aiCategorySuggestion!.toLowerCase()
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patch: Record<string, any> = {
      reviewedByUser: true,
      userOverrodeAi: false,
      updatedAt: Date.now(),
    };

    if (category) {
      patch.categoryId = category._id;
      patch.type = category.type;
      patch.isDeductible = category.isDeductibleDefault ?? false;
    } else if (tx.aiTypeSuggestion && tx.aiTypeSuggestion !== 'uncategorised') {
      patch.type = tx.aiTypeSuggestion;
    }

    await ctx.db.patch(args.id, patch);
    return { categoryName: category?.name ?? tx.aiCategorySuggestion };
  },
});

/**
 * Record user override of AI suggestion for few-shot learning.
 */
export const recordAiFeedback = mutation({
  args: {
    entityId: v.id('entities'),
    transactionId: v.id('transactions'),
    aiSuggestedCategory: v.optional(v.string()),
    aiSuggestedType: v.optional(transactionTypeValidator),
    aiConfidence: v.optional(v.number()),
    userChosenCategory: v.string(),
    userChosenType: transactionTypeValidator,
    transactionDescription: v.string(),
    transactionAmount: v.number(),
    transactionDirection: directionValidator,
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    await ctx.db.insert('aiCategorisationFeedback', {
      entityId: args.entityId,
      userId: user._id,
      transactionId: args.transactionId,
      aiSuggestedCategory: args.aiSuggestedCategory,
      aiSuggestedType: args.aiSuggestedType,
      aiConfidence: args.aiConfidence,
      userChosenCategory: args.userChosenCategory,
      userChosenType: args.userChosenType,
      transactionDescription: args.transactionDescription,
      transactionAmount: args.transactionAmount,
      transactionDirection: args.transactionDirection,
      createdAt: Date.now(),
    });
  },
});

/**
 * Initiate a file import: creates an importJob record and returns the jobId.
 */
export const initiateImport = mutation({
  args: {
    entityId: v.id('entities'),
    source: importSourceValidator,
    storageId: v.optional(v.string()),
    connectedAccountId: v.optional(v.id('connectedAccounts')),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    const entity = await ctx.db.get(args.entityId);
    if (!entity || entity.userId !== user._id || entity.deletedAt) {
      throw new Error('Entity not found or unauthorized');
    }

    const now = Date.now();
    const jobId = await ctx.db.insert('importJobs', {
      entityId: args.entityId,
      userId: user._id,
      connectedAccountId: args.connectedAccountId,
      source: args.source,
      status: 'pending',
      storageId: args.storageId,
      createdAt: now,
      updatedAt: now,
    });

    return jobId;
  },
});

/**
 * Batch upsert parsed transactions from an import job.
 * Deduplicates by matching (entityId, date, amount, description, externalRef).
 */
export const batchUpsert = mutation({
  args: {
    jobId: v.id('importJobs'),
    entityId: v.id('entities'),
    transactions: v.array(
      v.object({
        date: v.number(),
        description: v.string(),
        amount: v.number(),
        currency: currencyValidator,
        amountNgn: v.number(),
        fxRate: v.optional(v.number()),
        direction: directionValidator,
        type: v.optional(transactionTypeValidator),
        categoryId: v.optional(v.id('categories')),
        isDeductible: v.optional(v.boolean()),
        deductiblePercent: v.optional(v.number()),
        whtDeducted: v.optional(v.number()),
        whtRate: v.optional(v.number()),
        externalRef: v.optional(v.string()),
        notes: v.optional(v.string()),
        taxYear: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    const job = await ctx.db.get(args.jobId);
    if (!job || job.userId !== user._id) {
      throw new Error('Import job not found or unauthorized');
    }

    const entity = await ctx.db.get(args.entityId);
    if (!entity || entity.userId !== user._id || entity.deletedAt) {
      throw new Error('Entity not found or unauthorized');
    }

    // Mark job as processing
    await ctx.db.patch(args.jobId, {
      status: 'processing',
      startedAt: Date.now(),
      updatedAt: Date.now(),
    });

    let totalImported = 0;
    let duplicatesSkipped = 0;
    const now = Date.now();

    for (const tx of args.transactions) {
      // Dedup: check for existing transaction matching date+amount+description+externalRef within this entity
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

      // Additional externalRef dedup check if provided
      if (existing) {
        duplicatesSkipped++;
        continue;
      }

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

      const taxYear = tx.taxYear ?? new Date(tx.date).getFullYear();

      await ctx.db.insert('transactions', {
        entityId: args.entityId,
        userId: user._id,
        importJobId: args.jobId,
        date: tx.date,
        description: tx.description,
        amount: tx.amount,
        currency: tx.currency,
        amountNgn: tx.amountNgn,
        fxRate: tx.fxRate,
        direction: tx.direction,
        type: tx.type ?? 'uncategorised',
        categoryId: tx.categoryId,
        isDeductible: tx.isDeductible,
        deductiblePercent: tx.deductiblePercent,
        whtDeducted: tx.whtDeducted,
        whtRate: tx.whtRate,
        externalRef: tx.externalRef,
        notes: tx.notes,
        taxYear,
        reviewedByUser: false,
        createdAt: now,
        updatedAt: now,
      });
      totalImported++;
    }

    // Update job stats
    await ctx.db.patch(args.jobId, {
      status: 'complete',
      totalParsed: args.transactions.length,
      totalImported,
      duplicatesSkipped,
      completedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return { totalImported, duplicatesSkipped };
  },
});
