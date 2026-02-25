/**
 * TaxEase Nigeria — Filing Lifecycle Mutations (PRD-6)
 *
 * Manages the full filing record lifecycle for self-assessment returns:
 *   draft → generated → submitted → payment_confirmed → tcc_obtained
 *
 * Nil returns skip the payment steps:
 *   draft → generated → submitted → payment_confirmed (auto) → tcc_obtained
 *
 * Exports (public):
 *   initiate            — creates or retrieves the draft filing record
 *   markGenerated       — records PDF generation + immutable snapshot; resets to 'generated'
 *   markSubmitted       — advances from 'generated' → 'submitted' (nil: → 'payment_confirmed')
 *   uploadPaymentReceipt — records receipt upload; advances to 'payment_confirmed'
 *   uploadTcc           — records TCC upload; advances to 'tcc_obtained'
 *   get                 — fetches a single filing record by ID (auth-guarded)
 *   getForEntity        — fetches filing record for entity+taxYear
 */

import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { getCurrentUser } from './auth';

// ---------------------------------------------------------------------------
// Status ordering helpers
// ---------------------------------------------------------------------------

type FilingStatus =
  | 'draft'
  | 'generated'
  | 'submitted'
  | 'payment_pending'
  | 'payment_confirmed'
  | 'tcc_obtained';

const STATUS_ORDER: FilingStatus[] = [
  'draft',
  'generated',
  'submitted',
  'payment_pending',
  'payment_confirmed',
  'tcc_obtained',
];

function statusIndex(s: FilingStatus): number {
  return STATUS_ORDER.indexOf(s);
}

function canAdvanceTo(current: FilingStatus, next: FilingStatus): boolean {
  return statusIndex(next) > statusIndex(current);
}

// ---------------------------------------------------------------------------
// initiate — create or retrieve draft filing record
// ---------------------------------------------------------------------------

/**
 * Creates a new filing record in 'draft' status, or returns the existing one
 * if a record already exists for this entity+taxYear (idempotent).
 */
export const initiate = mutation({
  args: {
    entityId: v.id('entities'),
    taxYear: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    const entity = await ctx.db.get(args.entityId);
    if (!entity || entity.userId !== user._id || entity.deletedAt) {
      throw new Error('Entity not found or not authorised');
    }

    // Return existing record if present
    const existing = await ctx.db
      .query('filingRecords')
      .withIndex('by_entityId_taxYear', (q) =>
        q.eq('entityId', args.entityId).eq('taxYear', args.taxYear)
      )
      .first();

    if (existing) return existing._id;

    const now = Date.now();
    return await ctx.db.insert('filingRecords', {
      entityId: args.entityId,
      userId: user._id,
      taxYear: args.taxYear,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    });
  },
});

// ---------------------------------------------------------------------------
// markGenerated — record PDF generation with immutable snapshot
// ---------------------------------------------------------------------------

/**
 * Sets the filing record to 'generated' status, recording the immutable
 * TaxSummarySnapshot and PDF storage ID.
 *
 * This is the only mutation allowed to reset status backwards (re-generation
 * always resets to 'generated' regardless of current status, unless tcc_obtained).
 */
export const markGenerated = mutation({
  args: {
    filingId: v.id('filingRecords'),
    selfAssessmentPdfId: v.string(),
    taxSummarySnapshot: v.string(),
    netTaxPayable: v.number(),
    engineVersion: v.string(),
    isNilReturn: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    const record = await ctx.db.get(args.filingId);
    if (!record || record.userId !== user._id) {
      throw new Error('Filing record not found or not authorised');
    }

    // Cannot re-generate once TCC has been obtained
    if (record.status === 'tcc_obtained') {
      throw new Error('Cannot regenerate after TCC has been obtained');
    }

    const now = Date.now();
    await ctx.db.patch(args.filingId, {
      status: 'generated',
      selfAssessmentPdfId: args.selfAssessmentPdfId,
      taxSummarySnapshot: args.taxSummarySnapshot,
      netTaxPayable: args.netTaxPayable,
      engineVersion: args.engineVersion,
      isNilReturn: args.isNilReturn,
      generatedAt: now,
      updatedAt: now,
    });

    return args.filingId;
  },
});

// ---------------------------------------------------------------------------
// markSubmitted — advance to 'submitted' (nil returns auto-confirm payment)
// ---------------------------------------------------------------------------

/**
 * Advances a filing from 'generated' → 'submitted'.
 *
 * Nil return auto-transition: if isNilReturn is true, status immediately
 * advances to 'payment_confirmed' (payment steps skipped).
 */
export const markSubmitted = mutation({
  args: {
    filingId: v.id('filingRecords'),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    const record = await ctx.db.get(args.filingId);
    if (!record || record.userId !== user._id) {
      throw new Error('Filing record not found or not authorised');
    }

    if (record.status !== 'generated') {
      throw new Error(
        `Cannot mark as submitted from status '${record.status}'. Must be 'generated'.`
      );
    }

    const now = Date.now();

    // Nil return: skip payment steps → jump directly to payment_confirmed
    const nextStatus: FilingStatus = record.isNilReturn ? 'payment_confirmed' : 'submitted';

    if (!canAdvanceTo(record.status as FilingStatus, nextStatus)) {
      throw new Error(`Status transition not allowed: ${record.status} → ${nextStatus}`);
    }

    await ctx.db.patch(args.filingId, {
      status: nextStatus,
      submittedAt: now,
      updatedAt: now,
    });

    return { filingId: args.filingId, newStatus: nextStatus };
  },
});

// ---------------------------------------------------------------------------
// uploadPaymentReceipt — record payment receipt and confirm payment
// ---------------------------------------------------------------------------

/**
 * Records the payment receipt storage ID and advances to 'payment_confirmed'.
 *
 * Valid from: 'submitted' or 'payment_pending'.
 */
export const uploadPaymentReceipt = mutation({
  args: {
    filingId: v.id('filingRecords'),
    paymentReceiptId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    const record = await ctx.db.get(args.filingId);
    if (!record || record.userId !== user._id) {
      throw new Error('Filing record not found or not authorised');
    }

    const allowedFrom: FilingStatus[] = ['submitted', 'payment_pending'];
    if (!allowedFrom.includes(record.status as FilingStatus)) {
      throw new Error(
        `Cannot upload payment receipt from status '${record.status}'. Must be 'submitted' or 'payment_pending'.`
      );
    }

    const now = Date.now();
    await ctx.db.patch(args.filingId, {
      status: 'payment_confirmed',
      paymentReceiptId: args.paymentReceiptId,
      updatedAt: now,
    });

    return { filingId: args.filingId, newStatus: 'payment_confirmed' as FilingStatus };
  },
});

// ---------------------------------------------------------------------------
// uploadTcc — record Tax Clearance Certificate upload
// ---------------------------------------------------------------------------

/**
 * Records the TCC document storage ID and advances to 'tcc_obtained'.
 *
 * Valid from: 'payment_confirmed' only.
 */
export const uploadTcc = mutation({
  args: {
    filingId: v.id('filingRecords'),
    tccDocumentId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    const record = await ctx.db.get(args.filingId);
    if (!record || record.userId !== user._id) {
      throw new Error('Filing record not found or not authorised');
    }

    if (record.status !== 'payment_confirmed') {
      throw new Error(
        `Cannot upload TCC from status '${record.status}'. Must be 'payment_confirmed'.`
      );
    }

    const now = Date.now();
    await ctx.db.patch(args.filingId, {
      status: 'tcc_obtained',
      tccDocumentId: args.tccDocumentId,
      updatedAt: now,
    });

    return { filingId: args.filingId, newStatus: 'tcc_obtained' as FilingStatus };
  },
});

// ---------------------------------------------------------------------------
// get — fetch single filing record (auth-guarded)
// ---------------------------------------------------------------------------

export const get = query({
  args: { filingId: v.id('filingRecords') },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const record = await ctx.db.get(args.filingId);
    if (!record || record.userId !== user._id) return null;

    // Resolve PDF download URL if available
    let pdfUrl: string | null = null;
    if (record.selfAssessmentPdfId) {
      pdfUrl = await ctx.storage.getUrl(record.selfAssessmentPdfId as any);
    }

    return { ...record, pdfUrl };
  },
});

// ---------------------------------------------------------------------------
// getForEntity — fetch filing record for entity+taxYear
// ---------------------------------------------------------------------------

export const getForEntity = query({
  args: {
    entityId: v.id('entities'),
    taxYear: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const entity = await ctx.db.get(args.entityId);
    if (!entity || entity.userId !== user._id || entity.deletedAt) return null;

    return await ctx.db
      .query('filingRecords')
      .withIndex('by_entityId_taxYear', (q) =>
        q.eq('entityId', args.entityId).eq('taxYear', args.taxYear)
      )
      .first();
  },
});

// ---------------------------------------------------------------------------
// listByUser — filing history across all entities for the current user
// ---------------------------------------------------------------------------

export const listByUser = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const records = await ctx.db
      .query('filingRecords')
      .withIndex('by_userId', (q) => q.eq('userId', user._id))
      .order('desc')
      .take(args.limit ?? 50);

    return records;
  },
});
