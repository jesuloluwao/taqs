import { mutation, query, internalMutation, internalQuery } from './_generated/server';
import { getOrCreateCurrentUser, getCurrentUser } from './auth';
import { v } from 'convex/values';

const currencyValidator = v.union(
  v.literal('NGN'),
  v.literal('USD'),
  v.literal('GBP'),
  v.literal('EUR')
);

const invoiceStatusValidator = v.union(
  v.literal('draft'),
  v.literal('sent'),
  v.literal('paid'),
  v.literal('overdue'),
  v.literal('cancelled')
);

const lineItemValidator = v.object({
  description: v.string(),
  quantity: v.number(),
  unitPrice: v.number(),
});

// ================== HELPERS ==================

/**
 * Generate the next sequential invoice number for an entity in a given year.
 * Format: INV-{YEAR}-{NNNN} (zero-padded to 4 digits).
 * Safe because Convex mutations are ACID — no concurrent executions.
 */
async function generateInvoiceNumber(
  ctx: any,
  entityId: string,
  year: number
): Promise<string> {
  const prefix = `INV-${year}-`;

  // Collect all invoices for this entity to find max sequence
  const existing = await ctx.db
    .query('invoices')
    .withIndex('by_entityId_status', (q: any) => q.eq('entityId', entityId))
    .collect();

  let maxSeq = 0;
  for (const inv of existing) {
    if (inv.invoiceNumber.startsWith(prefix)) {
      const seqStr = inv.invoiceNumber.slice(prefix.length);
      const seq = parseInt(seqStr, 10);
      if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
    }
  }

  const nextSeq = maxSeq + 1;
  return `${prefix}${String(nextSeq).padStart(4, '0')}`;
}

/**
 * Compute totals for an invoice given line items, WHT rate, and VAT eligibility.
 */
function computeTotals(
  lineItems: Array<{ quantity: number; unitPrice: number }>,
  whtRate: number,
  applyVat: boolean
) {
  const subtotal = lineItems.reduce(
    (sum, item) => sum + Math.round(item.quantity * item.unitPrice),
    0
  );
  const whtAmount = Math.round((subtotal * whtRate) / 100);
  const vatAmount = applyVat ? Math.round((subtotal * 7.5) / 100) : 0;
  const totalDue = subtotal - whtAmount + vatAmount;

  return { subtotal, whtAmount, vatAmount, totalDue };
}

// ================== QUERIES ==================

/**
 * Get a single invoice with its line items (ownership check via entity).
 */
export const get = query({
  args: {
    id: v.id('invoices'),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const invoice = await ctx.db.get(args.id);
    if (!invoice) return null;

    const entity = await ctx.db.get(invoice.entityId);
    if (!entity || entity.userId !== user._id || entity.deletedAt) return null;

    const items = await ctx.db
      .query('invoiceItems')
      .withIndex('by_invoiceId', (q) => q.eq('invoiceId', args.id))
      .collect();

    return { ...invoice, items };
  },
});

/**
 * Paginated invoice list for an entity with optional status filter.
 * Returns invoices plus summary totals: outstanding and paid-this-year.
 */
export const list = query({
  args: {
    entityId: v.id('entities'),
    status: v.optional(invoiceStatusValidator),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return { invoices: [], totalCount: 0, outstanding: 0, paidThisYear: 0 };
    }

    const entity = await ctx.db.get(args.entityId);
    if (!entity || entity.userId !== user._id || entity.deletedAt) {
      return { invoices: [], totalCount: 0, outstanding: 0, paidThisYear: 0 };
    }

    // Fetch ALL invoices for the entity (needed for accurate summary totals)
    const allEntityInvoices = await ctx.db
      .query('invoices')
      .withIndex('by_userId', (q) => q.eq('userId', user._id))
      .collect()
      .then((invs) => invs.filter((inv) => inv.entityId === args.entityId));

    // Apply optional status filter for the paginated result
    const filtered = args.status
      ? allEntityInvoices.filter((inv) => inv.status === args.status)
      : allEntityInvoices;

    // Sort by issueDate descending (newest first)
    filtered.sort((a, b) => b.issueDate - a.issueDate);

    const totalCount = filtered.length;
    const limit = args.limit ?? 20;
    const offset = args.offset ?? 0;
    const paginated = filtered.slice(offset, offset + limit);

    // Summary totals are always computed over ALL entity invoices (regardless of status filter)
    const allInvoices = allEntityInvoices;

    const currentYear = new Date().getFullYear();
    const yearStart = new Date(currentYear, 0, 1).getTime();
    const yearEnd = new Date(currentYear + 1, 0, 1).getTime();

    let outstanding = 0;
    let paidThisYear = 0;

    for (const inv of allInvoices) {
      if (inv.status === 'sent' || inv.status === 'overdue') {
        outstanding += inv.totalDue;
      }
      if (
        inv.status === 'paid' &&
        inv.paidAt !== undefined &&
        inv.paidAt >= yearStart &&
        inv.paidAt < yearEnd
      ) {
        paidThisYear += inv.totalDue;
      }
    }

    return {
      invoices: paginated,
      totalCount,
      hasMore: offset + limit < totalCount,
      outstanding,
      paidThisYear,
    };
  },
});

// ================== MUTATIONS ==================

/**
 * Create a new invoice with line items.
 * - Generates sequential invoice number (INV-{YEAR}-{NNNN}).
 * - Computes subtotal, whtAmount, vatAmount, totalDue.
 * - Denormalises clientName and clientEmail from the client record.
 * - VAT auto-applied at 7.5% only if entity.vatRegistered AND entity.vatThresholdExceeded.
 * - WHT rate must be 0, 5, or 10.
 */
export const create = mutation({
  args: {
    entityId: v.id('entities'),
    clientId: v.optional(v.id('clients')),
    /** Override client name (used when no clientId or for manual entry) */
    clientName: v.optional(v.string()),
    /** Override client email */
    clientEmail: v.optional(v.string()),
    issueDate: v.number(),
    dueDate: v.number(),
    currency: currencyValidator,
    /** WHT rate: must be 0, 5, or 10 */
    whtRate: v.number(),
    lineItems: v.array(lineItemValidator),
    notes: v.optional(v.string()),
    isRecurring: v.optional(v.boolean()),
    recurringInterval: v.optional(v.union(v.literal('monthly'), v.literal('quarterly'))),
    nextIssueDate: v.optional(v.number()),
    /** FX rate to NGN (1 if currency is NGN) */
    fxRate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    const entity = await ctx.db.get(args.entityId);
    if (!entity || entity.userId !== user._id || entity.deletedAt) {
      throw new Error('Entity not found or unauthorized');
    }

    if (![0, 5, 10].includes(args.whtRate)) {
      throw new Error('whtRate must be 0, 5, or 10');
    }

    if (args.lineItems.length === 0) {
      throw new Error('Invoice must have at least one line item');
    }

    // Resolve client details
    let clientName = args.clientName ?? '';
    let clientEmail = args.clientEmail;

    if (args.clientId) {
      const client = await ctx.db.get(args.clientId);
      if (!client || client.entityId !== args.entityId) {
        throw new Error('Client not found for this entity');
      }
      clientName = client.name;
      clientEmail = client.email ?? args.clientEmail;
    }

    if (!clientName) {
      throw new Error('clientName is required');
    }

    // Determine VAT applicability
    const applyVat =
      (entity.vatRegistered === true) && (entity.vatThresholdExceeded === true);

    // Compute totals
    const { subtotal, whtAmount, vatAmount, totalDue } = computeTotals(
      args.lineItems,
      args.whtRate,
      applyVat
    );

    // Compute amountNgn
    const fxRate = args.fxRate ?? 1;
    const amountNgn = Math.round(totalDue * fxRate);

    // Generate invoice number (year from issueDate)
    const year = new Date(args.issueDate).getFullYear();
    const invoiceNumber = await generateInvoiceNumber(ctx, args.entityId, year);

    const now = Date.now();

    // Insert invoice
    const invoiceId = await ctx.db.insert('invoices', {
      entityId: args.entityId,
      userId: user._id,
      clientId: args.clientId,
      clientName,
      clientEmail,
      invoiceNumber,
      status: 'draft',
      issueDate: args.issueDate,
      dueDate: args.dueDate,
      currency: args.currency,
      subtotal,
      whtRate: args.whtRate,
      whtAmount: args.whtRate > 0 ? whtAmount : undefined,
      vatAmount: applyVat ? vatAmount : undefined,
      totalDue,
      amountNgn,
      notes: args.notes,
      isRecurring: args.isRecurring,
      recurringInterval: args.recurringInterval,
      nextIssueDate: args.nextIssueDate,
      createdAt: now,
      updatedAt: now,
    });

    // Insert line items
    for (const item of args.lineItems) {
      await ctx.db.insert('invoiceItems', {
        invoiceId,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: Math.round(item.quantity * item.unitPrice),
      });
    }

    return invoiceId;
  },
});

/**
 * Update a draft invoice. Only draft invoices may be updated.
 * Replaces ALL line items and recalculates totals.
 */
export const update = mutation({
  args: {
    id: v.id('invoices'),
    clientId: v.optional(v.id('clients')),
    clientName: v.optional(v.string()),
    clientEmail: v.optional(v.string()),
    issueDate: v.optional(v.number()),
    dueDate: v.optional(v.number()),
    currency: v.optional(currencyValidator),
    whtRate: v.optional(v.number()),
    lineItems: v.optional(v.array(lineItemValidator)),
    notes: v.optional(v.string()),
    isRecurring: v.optional(v.boolean()),
    recurringInterval: v.optional(v.union(v.literal('monthly'), v.literal('quarterly'))),
    nextIssueDate: v.optional(v.number()),
    fxRate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    const invoice = await ctx.db.get(args.id);
    if (!invoice) throw new Error('Invoice not found');

    const entity = await ctx.db.get(invoice.entityId);
    if (!entity || entity.userId !== user._id || entity.deletedAt) {
      throw new Error('Entity not found or unauthorized');
    }

    if (invoice.status !== 'draft') {
      throw new Error('Only draft invoices can be updated');
    }

    if (args.whtRate !== undefined && ![0, 5, 10].includes(args.whtRate)) {
      throw new Error('whtRate must be 0, 5, or 10');
    }

    // Resolve client name/email if clientId is being updated
    let clientName = args.clientName ?? invoice.clientName;
    let clientEmail = args.clientEmail ?? invoice.clientEmail;

    if (args.clientId !== undefined) {
      if (args.clientId) {
        const client = await ctx.db.get(args.clientId);
        if (!client || client.entityId !== invoice.entityId) {
          throw new Error('Client not found for this entity');
        }
        clientName = client.name;
        clientEmail = client.email ?? args.clientEmail ?? invoice.clientEmail;
      }
    }

    // Derive effective whtRate: use arg if provided, else infer from stored amounts
    let effectiveWhtRate = args.whtRate;
    if (effectiveWhtRate === undefined) {
      // Derive from stored amounts: if whtAmount and subtotal exist, compute rate
      if (invoice.whtAmount !== undefined && invoice.subtotal > 0) {
        effectiveWhtRate = Math.round((invoice.whtAmount / invoice.subtotal) * 100);
        // Clamp to valid values
        if (![0, 5, 10].includes(effectiveWhtRate)) effectiveWhtRate = 0;
      } else {
        effectiveWhtRate = 0;
      }
    }

    const applyVat =
      (entity.vatRegistered === true) && (entity.vatThresholdExceeded === true);

    const now = Date.now();
    const patch: Record<string, any> = { updatedAt: now };

    if (args.clientId !== undefined) patch.clientId = args.clientId;
    if (clientName !== invoice.clientName) patch.clientName = clientName;
    if (clientEmail !== invoice.clientEmail) patch.clientEmail = clientEmail;
    if (args.issueDate !== undefined) patch.issueDate = args.issueDate;
    if (args.dueDate !== undefined) patch.dueDate = args.dueDate;
    if (args.currency !== undefined) patch.currency = args.currency;
    if (args.notes !== undefined) patch.notes = args.notes;
    if (args.isRecurring !== undefined) patch.isRecurring = args.isRecurring;
    if (args.recurringInterval !== undefined) patch.recurringInterval = args.recurringInterval;
    if (args.nextIssueDate !== undefined) patch.nextIssueDate = args.nextIssueDate;
    if (args.whtRate !== undefined) patch.whtRate = args.whtRate;

    // Recalculate totals if line items or whtRate are being updated
    if (args.lineItems !== undefined) {
      if (args.lineItems.length === 0) {
        throw new Error('Invoice must have at least one line item');
      }

      const { subtotal, whtAmount, vatAmount, totalDue } = computeTotals(
        args.lineItems,
        effectiveWhtRate,
        applyVat
      );

      const fxRate = args.fxRate ?? 1;
      const amountNgn = Math.round(totalDue * fxRate);

      patch.subtotal = subtotal;
      patch.whtAmount = effectiveWhtRate > 0 ? whtAmount : undefined;
      patch.vatAmount = applyVat ? vatAmount : undefined;
      patch.totalDue = totalDue;
      patch.amountNgn = amountNgn;

      // Replace all line items: delete existing, insert new
      const existingItems = await ctx.db
        .query('invoiceItems')
        .withIndex('by_invoiceId', (q) => q.eq('invoiceId', args.id))
        .collect();

      for (const item of existingItems) {
        await ctx.db.delete(item._id);
      }

      for (const item of args.lineItems) {
        await ctx.db.insert('invoiceItems', {
          invoiceId: args.id,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: Math.round(item.quantity * item.unitPrice),
        });
      }
    } else if (args.whtRate !== undefined || args.fxRate !== undefined) {
      // Recalculate totals without replacing line items
      const currentItems = await ctx.db
        .query('invoiceItems')
        .withIndex('by_invoiceId', (q) => q.eq('invoiceId', args.id))
        .collect();

      const { subtotal, whtAmount, vatAmount, totalDue } = computeTotals(
        currentItems,
        effectiveWhtRate,
        applyVat
      );

      const fxRate = args.fxRate ?? 1;
      const amountNgn = Math.round(totalDue * fxRate);

      patch.subtotal = subtotal;
      patch.whtAmount = effectiveWhtRate > 0 ? whtAmount : undefined;
      patch.vatAmount = applyVat ? vatAmount : undefined;
      patch.totalDue = totalDue;
      patch.amountNgn = amountNgn;
    }

    await ctx.db.patch(args.id, patch);
    return args.id;
  },
});

// ================== LIFECYCLE MUTATIONS ==================

/**
 * Mark an invoice as paid.
 * Atomically:
 *  1. Sets invoice status='paid' and paidAt=now
 *  2. Creates an income transaction (invoice-to-transaction bridge)
 *
 * For foreign-currency invoices the caller must provide amountNgn (the
 * actual NGN amount received, which may differ from the rate at invoice time).
 *
 * Idempotent: throws if the invoice is already paid.
 */
export const markPaid = mutation({
  args: {
    id: v.id('invoices'),
    /** Required for non-NGN invoices; amount received in NGN kobo */
    amountNgn: v.optional(v.number()),
    /** Actual payment date timestamp (ms); defaults to now */
    paidAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    const invoice = await ctx.db.get(args.id);
    if (!invoice) throw new Error('Invoice not found');

    const entity = await ctx.db.get(invoice.entityId);
    if (!entity || entity.userId !== user._id || entity.deletedAt) {
      throw new Error('Entity not found or unauthorized');
    }

    // Idempotency guard
    if (invoice.status === 'paid') {
      throw new Error('Invoice is already marked as paid');
    }

    if (invoice.status === 'cancelled') {
      throw new Error('Cannot mark a cancelled invoice as paid');
    }

    if (invoice.status === 'draft') {
      throw new Error('Cannot mark a draft invoice as paid — send it first');
    }

    // For non-NGN invoices, amountNgn must be supplied by caller
    if (invoice.currency !== 'NGN' && args.amountNgn === undefined) {
      throw new Error(
        'amountNgn (NGN equivalent in kobo) is required for foreign-currency invoices'
      );
    }

    const transactionAmountNgn =
      invoice.currency === 'NGN' ? invoice.amountNgn : args.amountNgn!;

    const now = Date.now();
    const paidAt = args.paidAt ?? now;

    // Find the "Freelance/Client Income" system category
    const category = await ctx.db
      .query('categories')
      .withIndex('by_type', (q) => q.eq('type', 'income'))
      .filter((q) => q.eq(q.field('name'), 'Freelance/Client Income'))
      .first();

    const taxYear = new Date(paidAt).getFullYear();

    // Create the bridged income transaction
    await ctx.db.insert('transactions', {
      entityId: invoice.entityId,
      userId: user._id,
      date: paidAt,
      description: `Payment for Invoice ${invoice.invoiceNumber} — ${invoice.clientName}`,
      amount: invoice.totalDue,
      currency: invoice.currency,
      amountNgn: transactionAmountNgn,
      direction: 'credit',
      type: 'income',
      categoryId: category?._id,
      whtDeducted: invoice.whtAmount,
      whtRate: invoice.whtRate ?? 0,
      invoiceId: args.id,
      taxYear,
      reviewedByUser: true,
      createdAt: now,
      updatedAt: now,
    });

    // Mark invoice paid
    await ctx.db.patch(args.id, {
      status: 'paid',
      paidAt,
      updatedAt: now,
    });

    return args.id;
  },
});

/**
 * Cancel an invoice (draft or sent only). Does not create or remove transactions.
 */
export const cancel = mutation({
  args: {
    id: v.id('invoices'),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    const invoice = await ctx.db.get(args.id);
    if (!invoice) throw new Error('Invoice not found');

    const entity = await ctx.db.get(invoice.entityId);
    if (!entity || entity.userId !== user._id || entity.deletedAt) {
      throw new Error('Entity not found or unauthorized');
    }

    if (invoice.status !== 'draft' && invoice.status !== 'sent') {
      throw new Error(
        `Only draft or sent invoices can be cancelled (current status: ${invoice.status})`
      );
    }

    await ctx.db.patch(args.id, {
      status: 'cancelled',
      updatedAt: Date.now(),
    });

    return args.id;
  },
});

/**
 * Hard delete a draft invoice and all its line items.
 * Only draft invoices may be deleted.
 */
export const remove = mutation({
  args: {
    id: v.id('invoices'),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    const invoice = await ctx.db.get(args.id);
    if (!invoice) throw new Error('Invoice not found');

    const entity = await ctx.db.get(invoice.entityId);
    if (!entity || entity.userId !== user._id || entity.deletedAt) {
      throw new Error('Entity not found or unauthorized');
    }

    if (invoice.status !== 'draft') {
      throw new Error(
        `Only draft invoices can be deleted (current status: ${invoice.status})`
      );
    }

    // Delete all line items first
    const items = await ctx.db
      .query('invoiceItems')
      .withIndex('by_invoiceId', (q) => q.eq('invoiceId', args.id))
      .collect();

    for (const item of items) {
      await ctx.db.delete(item._id);
    }

    // Hard delete the invoice
    await ctx.db.delete(args.id);
  },
});

// ================== SCHEDULED / CRON INTERNAL MUTATIONS ==================

/**
 * Helper: advance a date by a recurring interval.
 */
function advanceByInterval(date: Date, interval: 'monthly' | 'quarterly'): Date {
  const next = new Date(date);
  if (interval === 'monthly') {
    next.setMonth(next.getMonth() + 1);
  } else {
    // quarterly = 3 months
    next.setMonth(next.getMonth() + 3);
  }
  return next;
}

/**
 * Internal mutation: mark all 'sent' invoices whose dueDate is in the past as 'overdue'.
 * Intended to be called daily at 09:00 WAT (08:00 UTC) via cron.
 */
export const _checkOverdue = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Collect all 'sent' invoices then JS-filter those past their due date
    const sentInvoices = await ctx.db
      .query('invoices')
      .filter((q) => q.eq(q.field('status'), 'sent'))
      .collect();

    const overdue = sentInvoices.filter((inv) => inv.dueDate < now);

    for (const inv of overdue) {
      await ctx.db.patch(inv._id, {
        status: 'overdue',
        updatedAt: now,
      });
    }

    console.log(`[checkOverdue] Marked ${overdue.length} invoice(s) as overdue`);
    return overdue.length;
  },
});

/**
 * Internal mutation: auto-generate new draft invoices from recurring templates.
 * Finds invoices where isRecurring=true AND nextIssueDate ≤ now, clones them
 * with a fresh invoice number, then advances the template's nextIssueDate.
 * Intended to be called daily at 07:00 WAT (06:00 UTC) via cron.
 */
export const _generateRecurring = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Collect all recurring invoices; JS-filter to those due for generation
    const allRecurring = await ctx.db
      .query('invoices')
      .filter((q) => q.eq(q.field('isRecurring'), true))
      .collect();

    const due = allRecurring.filter(
      (inv) => inv.nextIssueDate !== undefined && inv.nextIssueDate <= now
    );

    let generated = 0;

    for (const template of due) {
      // Fetch line items from the template invoice
      const items = await ctx.db
        .query('invoiceItems')
        .withIndex('by_invoiceId', (q) => q.eq('invoiceId', template._id))
        .collect();

      if (items.length === 0) {
        console.warn(`[generateRecurring] Template ${template._id} has no line items — skipping`);
        continue;
      }

      const newIssueDate = template.nextIssueDate!;
      // Preserve due-date offset (e.g. 30 days from issue)
      const dueDateOffsetMs = template.dueDate - template.issueDate;
      const newDueDate = newIssueDate + dueDateOffsetMs;

      // Generate sequential invoice number for the new year
      const year = new Date(newIssueDate).getFullYear();
      const invoiceNumber = await generateInvoiceNumber(ctx, template.entityId as string, year);

      // Insert cloned invoice as 'draft'
      const newInvoiceId = await ctx.db.insert('invoices', {
        entityId: template.entityId,
        userId: template.userId,
        clientId: template.clientId,
        clientName: template.clientName,
        clientEmail: template.clientEmail,
        invoiceNumber,
        status: 'draft',
        issueDate: newIssueDate,
        dueDate: newDueDate,
        currency: template.currency,
        subtotal: template.subtotal,
        whtRate: template.whtRate,
        whtAmount: template.whtAmount,
        vatAmount: template.vatAmount,
        totalDue: template.totalDue,
        amountNgn: template.amountNgn,
        notes: template.notes,
        // New invoice is NOT itself a recurring template
        createdAt: now,
        updatedAt: now,
      });

      // Clone all line items into the new invoice
      for (const item of items) {
        await ctx.db.insert('invoiceItems', {
          invoiceId: newInvoiceId,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total,
        });
      }

      // Advance the template's nextIssueDate by the recurring interval
      const interval = template.recurringInterval ?? 'monthly';
      const nextIssueDateMs = advanceByInterval(new Date(newIssueDate), interval).getTime();

      await ctx.db.patch(template._id, {
        nextIssueDate: nextIssueDateMs,
        updatedAt: now,
      });

      generated++;
    }

    console.log(`[generateRecurring] Generated ${generated} recurring invoice(s)`);
    return generated;
  },
});

// ================== INTERNAL HELPERS FOR ACTIONS ==================

/**
 * Internal query: fetch a full invoice with its line items.
 * Used by the PDF/send actions to assemble data without duplicating logic.
 */
export const _getInvoiceWithItems = internalQuery({
  args: { id: v.id('invoices') },
  handler: async (ctx, args) => {
    const invoice = await ctx.db.get(args.id);
    if (!invoice) return null;

    const items = await ctx.db
      .query('invoiceItems')
      .withIndex('by_invoiceId', (q) => q.eq('invoiceId', args.id))
      .collect();

    // Resolve entity name for PDF header
    const entity = await ctx.db.get(invoice.entityId);

    return { ...invoice, items, entityName: entity?.name ?? '' };
  },
});

/**
 * Internal mutation: store PDF storageId and set invoice status='sent'.
 * Called by the `send` action after generating the PDF and sending email.
 */
export const _setPdfAndSent = internalMutation({
  args: {
    id: v.id('invoices'),
    pdfStorageId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      pdfStorageId: args.pdfStorageId,
      status: 'sent',
      updatedAt: Date.now(),
    });
  },
});

/**
 * Internal mutation: store PDF storageId only (no status change).
 * Called by the `generatePdf` action.
 */
export const _setPdf = internalMutation({
  args: {
    id: v.id('invoices'),
    pdfStorageId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      pdfStorageId: args.pdfStorageId,
      updatedAt: Date.now(),
    });
  },
});
