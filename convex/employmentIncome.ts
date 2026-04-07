import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { getCurrentUser } from './auth';

// ---------------------------------------------------------------------------
// list — all records for entity+taxYear
// ---------------------------------------------------------------------------

export const list = query({
  args: {
    entityId: v.id('entities'),
    taxYear: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const entity = await ctx.db.get(args.entityId);
    if (!entity || entity.userId !== user._id || entity.deletedAt) return null;

    const records = await ctx.db
      .query('employmentIncomeRecords')
      .withIndex('by_entityId_taxYear', (q) =>
        q.eq('entityId', args.entityId).eq('taxYear', args.taxYear)
      )
      .collect();

    return records;
  },
});

// ---------------------------------------------------------------------------
// get — single record by ID
// ---------------------------------------------------------------------------

export const get = query({
  args: { id: v.id('employmentIncomeRecords') },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const record = await ctx.db.get(args.id);
    if (!record || record.userId !== user._id) return null;

    return record;
  },
});

// ---------------------------------------------------------------------------
// hasConfirmedRecords — check if confirmed payslip records exist for entity+taxYear
// Used by Declarations screen to lock pension/NHIS/NHF fields.
// ---------------------------------------------------------------------------

export const hasConfirmedRecords = query({
  args: {
    entityId: v.id('entities'),
    taxYear: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const records = await ctx.db
      .query('employmentIncomeRecords')
      .withIndex('by_entityId_taxYear', (q) =>
        q.eq('entityId', args.entityId).eq('taxYear', args.taxYear)
      )
      .collect();

    const confirmed = records.filter((r) => r.status === 'confirmed');
    if (confirmed.length === 0) return { hasRecords: false, totals: null };

    return {
      hasRecords: true,
      totals: {
        pension: confirmed.reduce((s, r) => s + (r.pensionDeducted ?? 0), 0),
        nhis: confirmed.reduce((s, r) => s + (r.nhisDeducted ?? 0), 0),
        nhf: confirmed.reduce((s, r) => s + (r.nhfDeducted ?? 0), 0),
      },
    };
  },
});

// ---------------------------------------------------------------------------
// createOrUpdate — upsert a payslip record for a specific employer+month+year
// ---------------------------------------------------------------------------

export const createOrUpdate = mutation({
  args: {
    entityId: v.id('entities'),
    taxYear: v.number(),
    month: v.number(),
    employerName: v.string(),
    grossSalary: v.number(),
    payeDeducted: v.number(),
    pensionDeducted: v.optional(v.number()),
    nhisDeducted: v.optional(v.number()),
    nhfDeducted: v.optional(v.number()),
    netSalary: v.optional(v.number()),
    transactionId: v.optional(v.id('transactions')),
    source: v.optional(v.union(v.literal('payslip'), v.literal('detected'), v.literal('manual'))),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    const entity = await ctx.db.get(args.entityId);
    if (!entity || entity.userId !== user._id || entity.deletedAt) {
      throw new Error('Entity not found or not authorised');
    }

    const now = Date.now();

    // Check for existing record for this employer+month+year
    const existing = await ctx.db
      .query('employmentIncomeRecords')
      .withIndex('by_entityId_taxYear', (q) =>
        q.eq('entityId', args.entityId).eq('taxYear', args.taxYear)
      )
      .collect();

    const match = existing.find(
      (r) => r.month === args.month && r.employerName === args.employerName
    );

    const fields = {
      grossSalary: args.grossSalary,
      payeDeducted: args.payeDeducted,
      pensionDeducted: args.pensionDeducted,
      nhisDeducted: args.nhisDeducted,
      nhfDeducted: args.nhfDeducted,
      netSalary: args.netSalary,
      transactionId: args.transactionId,
      updatedAt: now,
    };

    if (match) {
      await ctx.db.patch(match._id, {
        ...fields,
        // When a user submits payslip data over an auto-detected record,
        // promote to confirmed so the tax engine picks it up.
        source: args.source ?? 'payslip',
        status: 'confirmed',
      });
      return match._id;
    }

    return await ctx.db.insert('employmentIncomeRecords', {
      entityId: args.entityId,
      userId: user._id,
      taxYear: args.taxYear,
      month: args.month,
      employerName: args.employerName,
      source: args.source ?? 'payslip',
      status: 'confirmed',
      ...fields,
      createdAt: now,
    });
  },
});

// ---------------------------------------------------------------------------
// confirm — confirm a pending record
// ---------------------------------------------------------------------------

export const confirm = mutation({
  args: { id: v.id('employmentIncomeRecords') },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    const record = await ctx.db.get(args.id);
    if (!record || record.userId !== user._id) {
      throw new Error('Record not found or not authorised');
    }

    await ctx.db.patch(args.id, { status: 'confirmed', updatedAt: Date.now() });
    return args.id;
  },
});

// ---------------------------------------------------------------------------
// reject — reject a pending record
// ---------------------------------------------------------------------------

export const reject = mutation({
  args: { id: v.id('employmentIncomeRecords') },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    const record = await ctx.db.get(args.id);
    if (!record || record.userId !== user._id) {
      throw new Error('Record not found or not authorised');
    }

    await ctx.db.patch(args.id, { status: 'rejected', updatedAt: Date.now() });

    // Unflag the linked transaction if any
    if (record.transactionId) {
      const tx = await ctx.db.get(record.transactionId);
      if (tx) {
        await ctx.db.patch(record.transactionId, { isSalaryIncome: undefined });
      }
    }

    return args.id;
  },
});

// ---------------------------------------------------------------------------
// remove — delete a record entirely
// ---------------------------------------------------------------------------

export const remove = mutation({
  args: { id: v.id('employmentIncomeRecords') },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    const record = await ctx.db.get(args.id);
    if (!record || record.userId !== user._id) {
      throw new Error('Record not found or not authorised');
    }

    // Unflag linked transaction
    if (record.transactionId) {
      const tx = await ctx.db.get(record.transactionId);
      if (tx) {
        await ctx.db.patch(record.transactionId, { isSalaryIncome: undefined });
      }
    }

    await ctx.db.delete(args.id);
  },
});
