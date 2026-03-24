import { action } from './_generated/server';
import { internal } from './_generated/api';
import { v } from 'convex/values';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SALARY_KEYWORDS = /\b(salary|payroll|wages|emolument|staff\s*pay)\b/i;
const BANK_PREFIX_RE = /^(NIP\/|FT[-:]?|NIBSS\/|MC\s*)/i;
const TRAILING_REF_RE = /\s+[A-Z0-9]{6,}$/;
const DATE_AMOUNT_RE = /\b\d{1,2}[\/\-]\d{1,2}([\/\-]\d{2,4})?\b|\b\d{1,3}(,\d{3})*(\.\d{2})?\b/g;

const HIGH_CONFIDENCE_THRESHOLD = 5;
const MEDIUM_CONFIDENCE_THRESHOLD = 3;

// ---------------------------------------------------------------------------
// Description normalisation
// ---------------------------------------------------------------------------

function normaliseDescription(raw: string): string {
  let s = raw.trim().toUpperCase();
  s = s.replace(BANK_PREFIX_RE, '');
  s = s.replace(DATE_AMOUNT_RE, '');
  s = s.replace(TRAILING_REF_RE, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

function extractEmployerName(canonical: string): string {
  return canonical
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim() || 'Unknown Employer';
}

// ---------------------------------------------------------------------------
// Grouping and scoring
// ---------------------------------------------------------------------------

interface TransactionForDetection {
  _id: string;
  amountNgn: number;
  description: string;
  date: number;
  taxYear: number;
  type: string;
  direction: string;
  isSalaryIncome?: boolean;
}

interface ScoredGroup {
  canonicalDescription: string;
  employerName: string;
  transactions: TransactionForDetection[];
  score: number;
  avgAmount: number;
}

function groupAndScore(transactions: TransactionForDetection[]): ScoredGroup[] {
  // Filter: income or uncategorised credits, not already flagged
  const candidates = transactions.filter(
    (t) =>
      !t.isSalaryIncome &&
      (t.type === 'income' || (t.type === 'uncategorised' && t.direction === 'credit'))
  );

  // Normalise and group by canonical description
  const groups = new Map<string, TransactionForDetection[]>();
  for (const t of candidates) {
    const canonical = normaliseDescription(t.description);
    if (!canonical) continue;

    // Find existing group with similar description and ±20% amount
    let matched = false;
    for (const [key, group] of groups) {
      if (key !== canonical) continue;
      const avgAmt = group.reduce((s, g) => s + g.amountNgn, 0) / group.length;
      if (Math.abs(t.amountNgn - avgAmt) / avgAmt <= 0.20) {
        group.push(t);
        matched = true;
        break;
      }
    }

    if (!matched) {
      const existingKeys = [...groups.keys()].filter((k) => k === canonical);
      if (existingKeys.length > 0) {
        const subKey = `${canonical}_${Math.round(t.amountNgn / 100)}`;
        const existing = groups.get(subKey);
        if (existing) {
          existing.push(t);
        } else {
          groups.set(subKey, [t]);
        }
      } else {
        groups.set(canonical, [t]);
      }
    }
  }

  // Score each group
  const results: ScoredGroup[] = [];

  for (const [key, txs] of groups) {
    if (txs.length < 2) continue;

    let score = 0;
    const canonical = key.replace(/_\d+$/, '');

    // Unique months
    const months = new Set(txs.map((t) => {
      const d = new Date(t.date);
      return `${d.getFullYear()}-${d.getMonth()}`;
    }));
    if (months.size >= 3) score += 3;

    // Amount variance
    const amounts = txs.map((t) => t.amountNgn);
    const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const maxDeviation = Math.max(...amounts.map((a) => Math.abs(a - avgAmount) / avgAmount));
    if (maxDeviation < 0.10) score += 2;
    else if (maxDeviation < 0.20) score += 1;

    // Salary keywords
    if (SALARY_KEYWORDS.test(canonical)) score += 2;

    // Day-of-month consistency (±5 days)
    const days = txs.map((t) => new Date(t.date).getDate());
    const medianDay = days.sort((a, b) => a - b)[Math.floor(days.length / 2)];
    const allWithin5Days = days.every((d) => Math.abs(d - medianDay) <= 5);
    if (allWithin5Days && txs.length >= 2) score += 1;

    if (score >= MEDIUM_CONFIDENCE_THRESHOLD) {
      results.push({
        canonicalDescription: canonical,
        employerName: extractEmployerName(canonical),
        transactions: txs,
        score,
        avgAmount,
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Main detection action
// ---------------------------------------------------------------------------

export const detectSalaryTransactions = action({
  args: {
    entityId: v.id('entities'),
    taxYear: v.number(),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const allTransactions: TransactionForDetection[] = await ctx.runQuery(
      internal.salaryDetectionHelpers.getTransactionsForDetection,
      { entityId: args.entityId, taxYear: args.taxYear }
    );

    const groups = groupAndScore(allTransactions);

    for (const group of groups) {
      await ctx.runMutation(
        internal.salaryDetectionHelpers.createDetectedRecords,
        {
          entityId: args.entityId,
          userId: args.userId,
          taxYear: args.taxYear,
          employerName: group.employerName,
          transactionIds: group.transactions.map((t) => t._id),
          isHighConfidence: group.score >= HIGH_CONFIDENCE_THRESHOLD,
        }
      );
    }

    return {
      groupsDetected: groups.length,
      groups: groups.map((g) => ({
        employer: g.employerName,
        score: g.score,
        months: g.transactions.length,
        avgAmount: g.avgAmount,
        isHighConfidence: g.score >= HIGH_CONFIDENCE_THRESHOLD,
      })),
    };
  },
});

// ---------------------------------------------------------------------------
// Cascade categorisation action — triggered when user manually marks salary
// ---------------------------------------------------------------------------

export const cascadeSalaryFlag = action({
  args: {
    transactionId: v.id('transactions'),
    entityId: v.id('entities'),
    taxYear: v.number(),
    userId: v.id('users'),
    employerName: v.string(),
  },
  handler: async (ctx, args) => {
    const allTransactions: TransactionForDetection[] = await ctx.runQuery(
      internal.salaryDetectionHelpers.getTransactionsForDetection,
      { entityId: args.entityId, taxYear: args.taxYear }
    );

    const source = allTransactions.find((t) => t._id === (args.transactionId as string));
    if (!source) return { cascadedCount: 0 };

    const sourceCanonical = normaliseDescription(source.description);

    const matches = allTransactions.filter((t) => {
      if (t._id === args.transactionId) return false;
      if (t.isSalaryIncome) return false;
      const canonical = normaliseDescription(t.description);
      if (canonical !== sourceCanonical) return false;
      const amountDiff = Math.abs(t.amountNgn - source.amountNgn) / source.amountNgn;
      return amountDiff <= 0.20;
    });

    if (matches.length === 0) return { cascadedCount: 0 };

    await ctx.runMutation(
      internal.salaryDetectionHelpers.createDetectedRecords,
      {
        entityId: args.entityId,
        userId: args.userId,
        taxYear: args.taxYear,
        employerName: args.employerName,
        transactionIds: matches.map((t) => t._id),
        isHighConfidence: true,
      }
    );

    return { cascadedCount: matches.length };
  },
});
