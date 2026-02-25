"use node";
import { internalAction } from './_generated/server';
import { internal } from './_generated/api';
import { v } from 'convex/values';

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const CONFIDENCE_THRESHOLD = 0.7;
const BATCH_SIZE = 50;
const INTER_BATCH_DELAY_MS = 500;
const MAX_RETRIES = 3;
const MODEL = 'claude-haiku-4-5-20251001';

/** Haiku pricing: $0.80 / 1M input tokens, $4.00 / 1M output tokens */
const INPUT_COST_PER_1M = 0.80;
const OUTPUT_COST_PER_1M = 4.00;

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface CategoryInfo {
  _id: string;
  name: string;
  type: string;
}

interface TransactionForAi {
  _id: string;
  description: string;
  amount: number; // in kobo
  direction: 'credit' | 'debit';
}

type TransactionType =
  | 'income'
  | 'business_expense'
  | 'personal_expense'
  | 'transfer'
  | 'uncategorised';

interface AiResult {
  index: number;
  id: string;
  category: string | null;
  type: TransactionType;
  confidence: number;
  reasoning: string;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callClaudeWithRetry(client: any, params: any, attempt = 0): Promise<any> {
  try {
    return await client.messages.create(params);
  } catch (err: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const status = (err as any)?.status ?? 0;
    if ((status === 429 || status >= 500) && attempt < MAX_RETRIES) {
      const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
      await sleep(delay);
      return callClaudeWithRetry(client, params, attempt + 1);
    }
    throw err;
  }
}

interface FewShotExample {
  description: string;
  direction: string;
  amountNaira: string;
  aiSuggested: string | null;
  userChosen: string;
}

function buildPrompt(
  categories: CategoryInfo[],
  transactions: TransactionForAi[],
  fewShotExamples: FewShotExample[] = []
): string {
  const categoryList = categories.map((c) => `- "${c.name}" (${c.type})`).join('\n');

  const txList = transactions.map((tx, i) => ({
    index: i,
    id: tx._id,
    description: tx.description,
    amountNaira: (tx.amount / 100).toFixed(2),
    direction: tx.direction,
  }));

  // Build few-shot section from recent user corrections
  let fewShotSection = '';
  if (fewShotExamples.length > 0) {
    const examples = fewShotExamples
      .map(
        (ex) =>
          `  - "${ex.description}" (${ex.direction}, ₦${ex.amountNaira}) → "${ex.userChosen}"`
      )
      .join('\n');
    fewShotSection = `\nUser corrections from prior categorisations (learn from these preferences):\n${examples}\n`;
  }

  return `Classify these Nigerian bank transactions for tax purposes (NTA 2025).

Available categories (use EXACT names):
${categoryList}

Direction context:
- "credit" = money IN (income, refunds, transfers received)
- "debit" = money OUT (expenses, payments, transfers sent)

Nigerian context: "TRF", "TRANSFER", "NIP", "INT" in descriptions usually indicate transfers. "NEPA", "IKEDC", "EKEDC" = electricity. "AIRTEL", "MTN", "GLO", "9MOBILE" = telecom/internet.
${fewShotSection}
Transactions:
${JSON.stringify(txList, null, 2)}

Respond ONLY with a valid JSON array (no markdown, no explanation) in input order:
[{"index":0,"id":"...","category":"exact category name or null","type":"income|business_expense|personal_expense|transfer|uncategorised","confidence":0.9,"reasoning":"brief reason"}]`;
}

// ─────────────────────────────────────────────
// categoriseBatch action
// ─────────────────────────────────────────────

/**
 * AI categorisation pipeline for on-demand / bulk re-categorisation.
 * Called by the public autoCategorise action.
 * Fetches ALL uncategorised+unreviewed transactions for the entity (or a
 * specific subset), processes them through Claude Haiku in batches of ≤50.
 * Checks for cancellation between batches.
 */
export const categoriseBatchForEntity = internalAction({
  args: {
    categorisingJobId: v.id('categorisingJobs'),
    entityId: v.id('entities'),
    transactionIds: v.optional(v.array(v.id('transactions'))),
  },
  handler: async (ctx, { categorisingJobId, entityId, transactionIds }) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      // Silently mark as failed — AI features disabled when key not set
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await ctx.runMutation((internal as any).aiCategoriseHelpers.updateCategorisingJob, {
        jobId: categorisingJobId,
        status: 'failed',
        errorMessage: 'ANTHROPIC_API_KEY not configured',
        completedAt: Date.now(),
      });
      return;
    }

    // Circuit breaker: skip if 3+ consecutive failures within 5 minutes
    const cb = (await ctx.runQuery(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (internal as any).aiCategoriseHelpers.checkCircuitBreaker,
      { entityId }
    )) as { open: boolean; openUntil: number | null };
    if (cb.open) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await ctx.runMutation((internal as any).aiCategoriseHelpers.updateCategorisingJob, {
        jobId: categorisingJobId,
        status: 'failed',
        errorMessage: `Circuit breaker open — AI categorisation paused until ${new Date(cb.openUntil!).toISOString()}`,
        completedAt: Date.now(),
      });
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const AnthropicModule = await import('@anthropic-ai/sdk' as any);
    const Anthropic = AnthropicModule.default ?? AnthropicModule;
    const client = new Anthropic({ apiKey });

    const [categories, transactions, fewShotExamples] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ctx.runQuery((internal as any).aiCategoriseHelpers.getCategoriesList, {}),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ctx.runQuery((internal as any).aiCategoriseHelpers.getUncategorisedForEntity, {
        entityId,
        transactionIds: transactionIds ?? undefined,
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ctx.runQuery((internal as any).aiCategoriseHelpers.getFewShotExamples, { entityId }),
    ]) as [CategoryInfo[], TransactionForAi[], FewShotExample[]];

    if (!transactions || transactions.length === 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await ctx.runMutation((internal as any).aiCategoriseHelpers.updateCategorisingJob, {
        jobId: categorisingJobId,
        status: 'complete',
        totalCategorised: 0,
        totalLowConfidence: 0,
        totalFailed: 0,
        batchesTotal: 0,
        batchesCompleted: 0,
        completedAt: Date.now(),
      });
      return;
    }

    const batches: TransactionForAi[][] = [];
    for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
      batches.push(transactions.slice(i, i + BATCH_SIZE));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ctx.runMutation((internal as any).aiCategoriseHelpers.updateCategorisingJob, {
      jobId: categorisingJobId,
      status: 'processing',
      batchesTotal: batches.length,
      modelUsed: MODEL,
    });

    let totalCategorised = 0;
    let totalLowConfidence = 0;
    let totalFailed = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let batchesCompleted = 0;

    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      // Check for cancellation before each batch
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const jobNow = await ctx.runQuery((internal as any).aiCategoriseHelpers.getCategorisingJob, {
        jobId: categorisingJobId,
      }) as { status: string } | null;
      if (jobNow?.status === 'cancelled') {
        return; // Stop processing — already marked cancelled by client
      }

      const batch = batches[batchIdx];
      if (batchIdx > 0) {
        await sleep(INTER_BATCH_DELAY_MS);
      }

      let results: AiResult[] = [];
      let batchFailed = false;

      try {
        const userPrompt = buildPrompt(categories, batch, fewShotExamples);
        const response = await callClaudeWithRetry(client, {
          model: MODEL,
          max_tokens: 2048,
          system:
            'You are a JSON-only responder for a Nigerian tax classification system. Always output valid JSON arrays without any explanation, markdown, or code blocks.',
          messages: [{ role: 'user', content: userPrompt }],
        });

        totalInputTokens += response.usage?.input_tokens ?? 0;
        totalOutputTokens += response.usage?.output_tokens ?? 0;

        const rawText =
          response.content[0]?.type === 'text' ? (response.content[0].text as string) : '[]';
        const parsed = JSON.parse(rawText.trim());
        if (Array.isArray(parsed)) {
          results = parsed as AiResult[];
        }
      } catch {
        batchFailed = true;
        totalFailed += batch.length;
      }

      if (!batchFailed && results.length > 0) {
        const applyArgs = results
          .filter((r) => r.index >= 0 && r.index < batch.length)
          .map((r) => {
            const tx = batch[r.index];
            return {
              transactionId: tx._id,
              categorisingJobId,
              aiCategorySuggestion: r.category ?? undefined,
              aiTypeSuggestion: (r.type ?? 'uncategorised') as TransactionType,
              aiCategoryConfidence: typeof r.confidence === 'number' ? r.confidence : 0,
              aiReasoning: r.reasoning ?? '',
              confidence: typeof r.confidence === 'number' ? r.confidence : 0,
              categoryName: r.category ?? undefined,
            };
          });

        if (applyArgs.length > 0) {
          const applyResult = (await ctx.runMutation(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (internal as any).aiCategoriseHelpers.applyAiResults,
            { results: applyArgs }
          )) as { categorised: number; lowConfidence: number; failed: number };
          totalCategorised += applyResult.categorised;
          totalLowConfidence += applyResult.lowConfidence;
          totalFailed += applyResult.failed;
        } else {
          totalLowConfidence += batch.length;
        }
      }

      batchesCompleted++;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await ctx.runMutation((internal as any).aiCategoriseHelpers.updateCategorisingJob, {
        jobId: categorisingJobId,
        batchesCompleted,
      });
    }

    const estimatedCostUsd =
      (totalInputTokens / 1_000_000) * INPUT_COST_PER_1M +
      (totalOutputTokens / 1_000_000) * OUTPUT_COST_PER_1M;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ctx.runMutation((internal as any).aiCategoriseHelpers.updateCategorisingJob, {
      jobId: categorisingJobId,
      status: 'complete',
      totalCategorised,
      totalLowConfidence,
      totalFailed,
      batchesCompleted,
      totalTokensUsed: totalInputTokens + totalOutputTokens,
      estimatedCostUsd,
      completedAt: Date.now(),
    });
  },
});

/**
 * AI categorisation batch pipeline.
 * Called from processImport after transactions are inserted.
 * Sends batches of ≤50 transactions to Claude Haiku, applies categories where
 * confidence ≥0.7, stores suggestions for lower-confidence results.
 * AI failure does NOT propagate — caller should catch.
 */
export const categoriseBatch = internalAction({
  args: {
    categorisingJobId: v.id('categorisingJobs'),
    entityId: v.id('entities'),
    importJobId: v.optional(v.id('importJobs')),
  },
  handler: async (ctx, { categorisingJobId, entityId, importJobId }) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      // Silently mark as failed — AI features disabled when key not set
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await ctx.runMutation((internal as any).aiCategoriseHelpers.updateCategorisingJob, {
        jobId: categorisingJobId,
        status: 'failed',
        errorMessage: 'ANTHROPIC_API_KEY not configured',
        completedAt: Date.now(),
      });
      return;
    }

    // Circuit breaker: skip if 3+ consecutive failures within 5 minutes
    const cb = (await ctx.runQuery(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (internal as any).aiCategoriseHelpers.checkCircuitBreaker,
      { entityId }
    )) as { open: boolean; openUntil: number | null };
    if (cb.open) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await ctx.runMutation((internal as any).aiCategoriseHelpers.updateCategorisingJob, {
        jobId: categorisingJobId,
        status: 'failed',
        errorMessage: `Circuit breaker open — AI categorisation paused until ${new Date(cb.openUntil!).toISOString()}`,
        completedAt: Date.now(),
      });
      return;
    }

    // Dynamic import to handle CJS/ESM differences
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const AnthropicModule = await import('@anthropic-ai/sdk' as any);
    const Anthropic = AnthropicModule.default ?? AnthropicModule;
    const client = new Anthropic({ apiKey });

    // Fetch categories list, uncategorised transactions, and few-shot examples
    const [categories, transactions, fewShotExamples] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ctx.runQuery((internal as any).aiCategoriseHelpers.getCategoriesList, {}),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ctx.runQuery((internal as any).aiCategoriseHelpers.getTransactionsByImportJob, {
        entityId,
        importJobId: importJobId ?? null,
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ctx.runQuery((internal as any).aiCategoriseHelpers.getFewShotExamples, { entityId }),
    ]) as [CategoryInfo[], TransactionForAi[], FewShotExample[]];

    if (!transactions || transactions.length === 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await ctx.runMutation((internal as any).aiCategoriseHelpers.updateCategorisingJob, {
        jobId: categorisingJobId,
        status: 'complete',
        totalCategorised: 0,
        totalLowConfidence: 0,
        totalFailed: 0,
        batchesTotal: 0,
        batchesCompleted: 0,
        completedAt: Date.now(),
      });
      return;
    }

    // Split into batches of ≤50
    const batches: TransactionForAi[][] = [];
    for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
      batches.push(transactions.slice(i, i + BATCH_SIZE));
    }

    // Update job status to processing with batch count
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ctx.runMutation((internal as any).aiCategoriseHelpers.updateCategorisingJob, {
      jobId: categorisingJobId,
      status: 'processing',
      batchesTotal: batches.length,
      modelUsed: MODEL,
    });

    let totalCategorised = 0;
    let totalLowConfidence = 0;
    let totalFailed = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let batchesCompleted = 0;

    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      const batch = batches[batchIdx];

      // Inter-batch delay after first batch
      if (batchIdx > 0) {
        await sleep(INTER_BATCH_DELAY_MS);
      }

      let results: AiResult[] = [];
      let batchFailed = false;

      try {
        const userPrompt = buildPrompt(categories, batch, fewShotExamples);

        const response = await callClaudeWithRetry(client, {
          model: MODEL,
          max_tokens: 2048,
          system:
            'You are a JSON-only responder for a Nigerian tax classification system. Always output valid JSON arrays without any explanation, markdown, or code blocks.',
          messages: [{ role: 'user', content: userPrompt }],
        });

        totalInputTokens += response.usage?.input_tokens ?? 0;
        totalOutputTokens += response.usage?.output_tokens ?? 0;

        const rawText =
          response.content[0]?.type === 'text' ? (response.content[0].text as string) : '[]';
        const parsed = JSON.parse(rawText.trim());
        if (Array.isArray(parsed)) {
          results = parsed as AiResult[];
        }
      } catch {
        batchFailed = true;
        totalFailed += batch.length;
      }

      if (!batchFailed && results.length > 0) {
        // Build apply args — align results with batch by index
        const applyArgs = results
          .filter((r) => r.index >= 0 && r.index < batch.length)
          .map((r) => {
            const tx = batch[r.index];
            return {
              transactionId: tx._id,
              categorisingJobId,
              aiCategorySuggestion: r.category ?? undefined,
              aiTypeSuggestion: (r.type ?? 'uncategorised') as TransactionType,
              aiCategoryConfidence: typeof r.confidence === 'number' ? r.confidence : 0,
              aiReasoning: r.reasoning ?? '',
              confidence: typeof r.confidence === 'number' ? r.confidence : 0,
              categoryName: r.category ?? undefined,
            };
          });

        if (applyArgs.length > 0) {
          const applyResult = (await ctx.runMutation(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (internal as any).aiCategoriseHelpers.applyAiResults,
            { results: applyArgs }
          )) as { categorised: number; lowConfidence: number; failed: number };

          totalCategorised += applyResult.categorised;
          totalLowConfidence += applyResult.lowConfidence;
          totalFailed += applyResult.failed;
        } else {
          // No valid results — count all as low confidence
          totalLowConfidence += batch.length;
        }
      }

      batchesCompleted++;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await ctx.runMutation((internal as any).aiCategoriseHelpers.updateCategorisingJob, {
        jobId: categorisingJobId,
        batchesCompleted,
      });
    }

    // Estimate cost using Haiku pricing
    const estimatedCostUsd =
      (totalInputTokens / 1_000_000) * INPUT_COST_PER_1M +
      (totalOutputTokens / 1_000_000) * OUTPUT_COST_PER_1M;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ctx.runMutation((internal as any).aiCategoriseHelpers.updateCategorisingJob, {
      jobId: categorisingJobId,
      status: 'complete',
      totalCategorised,
      totalLowConfidence,
      totalFailed,
      batchesCompleted,
      totalTokensUsed: totalInputTokens + totalOutputTokens,
      estimatedCostUsd,
      completedAt: Date.now(),
    });
  },
});
