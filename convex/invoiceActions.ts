"use node";
/**
 * Invoice PDF generation and email sending actions.
 *
 * All heavy I/O (NestJS PDF service, Resend email) runs here in the
 * Node.js action runtime. Mutations that write to the database are
 * delegated to internal mutations in invoices.ts.
 *
 * Required Convex environment variables:
 *   NESTJS_PDF_SERVICE_URL  — base URL of NestJS PDF microservice (e.g. https://pdf.taxease.ng)
 *   RESEND_API_KEY          — Resend API key
 *   FROM_EMAIL              — sender address (e.g. invoices@taxease.ng)
 */
import { action } from './_generated/server';
import { internal } from './_generated/api';
import { v } from 'convex/values';

// ─────────────────────────────────────────────
// Config helpers
// ─────────────────────────────────────────────

function getPdfServiceUrl(): string {
  return process.env.NESTJS_PDF_SERVICE_URL ?? 'http://localhost:3001';
}

function getResendKey(): string {
  return process.env.RESEND_API_KEY ?? '';
}

function getFromEmail(): string {
  return process.env.FROM_EMAIL ?? 'invoices@taxease.ng';
}

// ─────────────────────────────────────────────
// Internal utilities
// ─────────────────────────────────────────────

/**
 * Calls the NestJS /pdf/invoice endpoint and returns the PDF as a Buffer.
 */
async function fetchPdfBuffer(invoicePayload: unknown): Promise<Buffer> {
  const url = `${getPdfServiceUrl()}/pdf/invoice`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(invoicePayload),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '(no body)');
    throw new Error(`PDF service responded with ${response.status}: ${errText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Stores a PDF buffer in Convex Storage and returns the storageId string.
 */
async function storePdf(ctx: any, pdfBuffer: Buffer): Promise<string> {
  const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
  const storageId = await ctx.storage.store(blob);
  return storageId as string;
}

/**
 * Sends the invoice PDF via Resend email API.
 */
async function sendInvoiceEmail(opts: {
  to: string;
  invoiceNumber: string;
  clientName: string;
  entityName: string;
  pdfBuffer: Buffer;
}): Promise<void> {
  const resendKey = getResendKey();
  if (!resendKey) {
    console.warn('[invoiceActions] RESEND_API_KEY not set — skipping email send');
    return;
  }

  const { to, invoiceNumber, clientName, entityName, pdfBuffer } = opts;

  const emailBody = {
    from: getFromEmail(),
    to: [to],
    subject: `Invoice ${invoiceNumber} from ${entityName}`,
    text: [
      `Dear ${clientName},`,
      '',
      `Please find your invoice ${invoiceNumber} attached.`,
      '',
      'Thank you for your business.',
      '',
      '— TaxEase Nigeria',
    ].join('\n'),
    attachments: [
      {
        filename: `${invoiceNumber}.pdf`,
        content: pdfBuffer.toString('base64'),
      },
    ],
  };

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${resendKey}`,
    },
    body: JSON.stringify(emailBody),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '(no body)');
    throw new Error(`Resend API responded with ${response.status}: ${errText}`);
  }
}

/**
 * Build the invoice payload object to send to the NestJS PDF service.
 */
function buildPdfPayload(invoice: any): unknown {
  // Amounts stored in kobo (smallest unit) — convert to naira for display
  const toMajor = (kobo: number) => kobo / 100;

  return {
    invoiceNumber: invoice.invoiceNumber,
    issueDate: new Date(invoice.issueDate).toISOString().split('T')[0],
    dueDate: new Date(invoice.dueDate).toISOString().split('T')[0],
    currency: invoice.currency,
    clientName: invoice.clientName,
    clientEmail: invoice.clientEmail ?? null,
    entityName: invoice.entityName,
    notes: invoice.notes ?? null,
    subtotal: toMajor(invoice.subtotal),
    whtRate: invoice.whtRate ?? 0,
    whtAmount: invoice.whtAmount !== undefined ? toMajor(invoice.whtAmount) : null,
    vatAmount: invoice.vatAmount !== undefined ? toMajor(invoice.vatAmount) : null,
    totalDue: toMajor(invoice.totalDue),
    lineItems: (invoice.items ?? []).map((item: any) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: toMajor(item.unitPrice),
      total: toMajor(item.total),
    })),
  };
}

// ─────────────────────────────────────────────
// Exported actions
// ─────────────────────────────────────────────

/**
 * Generate an invoice PDF without sending email.
 * Stores the PDF in Convex Storage, saves the storageId on the invoice,
 * and returns the storageId.
 *
 * Can be called for any invoice status.
 */
export const generatePdf = action({
  args: {
    id: v.id('invoices'),
  },
  handler: async (ctx, args): Promise<string> => {
    // Fetch invoice data (internal query — bypasses auth for server-side use)
    const invoice = await (ctx as any).runQuery(
      (internal as any).invoices._getInvoiceWithItems,
      { id: args.id }
    );

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    const pdfPayload = buildPdfPayload(invoice);
    const pdfBuffer = await fetchPdfBuffer(pdfPayload);
    const storageId = await storePdf(ctx, pdfBuffer);

    // Persist storageId (no status change)
    await (ctx as any).runMutation(
      (internal as any).invoices._setPdf,
      { id: args.id, pdfStorageId: storageId }
    );

    return storageId;
  },
});

/**
 * Generate invoice PDF, email to client, and set status='sent'.
 *
 * Re-sending a 'sent' invoice regenerates the PDF and re-emails —
 * status stays 'sent' for the re-send path (handled by _setPdfAndSent
 * which sets status unconditionally to 'sent').
 *
 * Requires the invoice to be in 'draft' or 'sent' status.
 */
export const send = action({
  args: {
    id: v.id('invoices'),
  },
  handler: async (ctx, args): Promise<string> => {
    // Fetch invoice data
    const invoice = await (ctx as any).runQuery(
      (internal as any).invoices._getInvoiceWithItems,
      { id: args.id }
    );

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    if (invoice.status !== 'draft' && invoice.status !== 'sent') {
      throw new Error(
        `Only draft or sent invoices can be sent (current status: ${invoice.status})`
      );
    }

    if (!invoice.clientEmail) {
      throw new Error(
        'Cannot send invoice: client email address is not set'
      );
    }

    // Generate PDF
    const pdfPayload = buildPdfPayload(invoice);
    const pdfBuffer = await fetchPdfBuffer(pdfPayload);

    // Store PDF in Convex Storage
    const storageId = await storePdf(ctx, pdfBuffer);

    // Send email with PDF attachment
    await sendInvoiceEmail({
      to: invoice.clientEmail,
      invoiceNumber: invoice.invoiceNumber,
      clientName: invoice.clientName,
      entityName: invoice.entityName,
      pdfBuffer,
    });

    // Persist storageId and flip status to 'sent'
    await (ctx as any).runMutation(
      (internal as any).invoices._setPdfAndSent,
      { id: args.id, pdfStorageId: storageId }
    );

    return storageId;
  },
});
