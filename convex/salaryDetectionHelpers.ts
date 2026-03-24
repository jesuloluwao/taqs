import { internalMutation, internalQuery } from './_generated/server';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';

// ---------------------------------------------------------------------------
// Internal query: fetch transactions for detection
// ---------------------------------------------------------------------------

export const getTransactionsForDetection = internalQuery({
  args: {
    entityId: v.id('entities'),
    taxYear: v.number(),
  },
  handler: async (ctx, args) => {
    const transactions = await ctx.db
      .query('transactions')
      .withIndex('by_entityId_taxYear', (q) =>
        q.eq('entityId', args.entityId).eq('taxYear', args.taxYear)
      )
      .collect();

    return transactions.map((t) => ({
      _id: t._id as string,
      amountNgn: t.amountNgn,
      description: t.description,
      date: t.date,
      taxYear: t.taxYear,
      type: t.type,
      direction: t.direction,
      isSalaryIncome: t.isSalaryIncome,
    }));
  },
});

// ---------------------------------------------------------------------------
// Internal mutation: create detected employment records + flag transactions
// ---------------------------------------------------------------------------

export const createDetectedRecords = internalMutation({
  args: {
    entityId: v.id('entities'),
    userId: v.id('users'),
    taxYear: v.number(),
    employerName: v.string(),
    transactionIds: v.array(v.string()),
    isHighConfidence: v.boolean(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    for (const txIdStr of args.transactionIds) {
      const txId = txIdStr as Id<'transactions'>;
      const tx = await ctx.db.get(txId);
      if (!tx) continue;

      // Flag transaction as salary income
      await ctx.db.patch(txId, { isSalaryIncome: true });

      // Derive month from transaction date
      const txDate = new Date(tx.date);
      const month = txDate.getMonth() + 1; // 1-based

      // Check if record already exists for this employer+month
      const existing = await ctx.db
        .query('employmentIncomeRecords')
        .withIndex('by_entityId_taxYear', (q) =>
          q.eq('entityId', args.entityId).eq('taxYear', args.taxYear)
        )
        .collect();

      const alreadyExists = existing.find(
        (r) => r.month === month && r.employerName === args.employerName
      );

      if (alreadyExists) continue;

      // Create pending employment income record
      await ctx.db.insert('employmentIncomeRecords', {
        entityId: args.entityId,
        userId: args.userId,
        taxYear: args.taxYear,
        month,
        employerName: args.employerName,
        grossSalary: tx.amountNgn, // placeholder — net amount until user corrects
        payeDeducted: 0, // user must fill in from payslip
        transactionId: txId,
        source: 'detected',
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});
