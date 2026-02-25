/**
 * TaxEase Nigeria — Filing Internal Helpers (PRD-6 US-045)
 *
 * Internal queries and mutations called by the filingActions.ts "use node" action.
 * Kept in a separate non-"use node" file per Convex architecture constraints.
 */

import { internalMutation, internalQuery } from './_generated/server';
import { v } from 'convex/values';

// ---------------------------------------------------------------------------
// getGenerationContext — fetch user + entity + declaration data
// ---------------------------------------------------------------------------

export const getGenerationContext = internalQuery({
  args: {
    entityId: v.id('entities'),
    taxYear: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query('users')
      .withIndex('by_clerk_user_id', (q) => q.eq('clerkUserId', identity.subject))
      .first();
    if (!user) return null;

    const entity = await ctx.db.get(args.entityId);
    if (!entity || entity.userId !== user._id || entity.deletedAt) return null;

    // Tax declarations for PDF content
    const declaration = await ctx.db
      .query('taxDeclarations')
      .withIndex('by_entityId_taxYear', (q) =>
        q.eq('entityId', args.entityId).eq('taxYear', args.taxYear)
      )
      .first();

    // Existing filing record
    const existingFiling = await ctx.db
      .query('filingRecords')
      .withIndex('by_entityId_taxYear', (q) =>
        q.eq('entityId', args.entityId).eq('taxYear', args.taxYear)
      )
      .first();

    return {
      user: {
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        nin: user.nin, // encrypted; will be shown as masked
        firsTin: user.firsTin,
      },
      entity: {
        _id: entity._id,
        name: entity.name,
        type: entity.type,
        tin: entity.tin,
        rcNumber: entity.rcNumber,
      },
      declaration,
      existingFiling,
    };
  },
});

// ---------------------------------------------------------------------------
// initiateFilingInternal — create or retrieve draft filing record
// ---------------------------------------------------------------------------

export const initiateFilingInternal = internalMutation({
  args: {
    entityId: v.id('entities'),
    taxYear: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');

    const user = await ctx.db
      .query('users')
      .withIndex('by_clerk_user_id', (q) => q.eq('clerkUserId', identity.subject))
      .first();
    if (!user) throw new Error('User not found');

    const entity = await ctx.db.get(args.entityId);
    if (!entity || entity.userId !== user._id || entity.deletedAt) {
      throw new Error('Entity not found or not authorised');
    }

    // Check for regeneration block
    const existing = await ctx.db
      .query('filingRecords')
      .withIndex('by_entityId_taxYear', (q) =>
        q.eq('entityId', args.entityId).eq('taxYear', args.taxYear)
      )
      .first();

    if (existing) {
      // Block regeneration after 'submitted'
      const BLOCKED_STATUSES = ['submitted', 'payment_pending', 'payment_confirmed', 'tcc_obtained'];
      if (BLOCKED_STATUSES.includes(existing.status)) {
        throw new Error(`Cannot regenerate after status '${existing.status}'.`);
      }
      return existing._id;
    }

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
// applyGeneratedFiling — mark filing as generated with immutable snapshot
// ---------------------------------------------------------------------------

export const applyGeneratedFiling = internalMutation({
  args: {
    filingId: v.id('filingRecords'),
    selfAssessmentPdfId: v.string(),
    taxSummarySnapshot: v.string(),
    netTaxPayable: v.number(),
    engineVersion: v.string(),
    isNilReturn: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');

    const user = await ctx.db
      .query('users')
      .withIndex('by_clerk_user_id', (q) => q.eq('clerkUserId', identity.subject))
      .first();
    if (!user) throw new Error('User not found');

    const record = await ctx.db.get(args.filingId);
    if (!record || record.userId !== user._id) {
      throw new Error('Filing record not found or not authorised');
    }

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
// getFilingForPreview — fetch filing record with storage URL
// ---------------------------------------------------------------------------

export const getFilingForPreview = internalQuery({
  args: {
    filingId: v.id('filingRecords'),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query('users')
      .withIndex('by_clerk_user_id', (q) => q.eq('clerkUserId', identity.subject))
      .first();
    if (!user) return null;

    const record = await ctx.db.get(args.filingId);
    if (!record || record.userId !== user._id) return null;

    let pdfUrl: string | null = null;
    if (record.selfAssessmentPdfId) {
      pdfUrl = await ctx.storage.getUrl(record.selfAssessmentPdfId as any);
    }

    return { ...record, pdfUrl };
  },
});
