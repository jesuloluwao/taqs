"use node";
/**
 * Invoice PDF builder using PDFKit.
 *
 * Designed to match the visual layout of InvoicePreview.tsx:
 *   - Green (#1A7F5E) header with entity name + invoice number
 *   - Bill-to / dates two-column section
 *   - Line items table with Description, Qty, Unit Price, Total
 *   - Totals block (Subtotal, WHT, VAT, Total Due)
 *   - Optional notes section
 *   - Footer strip
 *
 * Amounts arrive as NAIRA (major units, already converted from kobo by
 * buildPdfPayload in invoiceActions.ts).
 *
 * Built-in PDF fonts are WinAnsi — ₦ (U+20A6) is not in that set, so
 * all currency values use ISO prefixes: "NGN", "USD", "GBP", "EUR".
 */

import PDFDocument from 'pdfkit';

// ── Types ──────────────────────────────────────────────────────────────────

export interface InvoicePdfLineItem {
  description: string;
  quantity: number;
  unitPrice: number; // naira (major unit)
  total: number;     // naira (major unit)
}

export interface InvoicePdfData {
  invoiceNumber: string;
  issueDate: string;         // "YYYY-MM-DD"
  dueDate: string;           // "YYYY-MM-DD"
  currency: string;          // "NGN" | "USD" | "GBP" | "EUR"
  clientName: string;
  clientEmail?: string | null;
  entityName: string;
  notes?: string | null;
  subtotal: number;          // naira
  whtRate: number;           // e.g. 5 or 10
  whtAmount?: number | null; // naira
  vatAmount?: number | null; // naira
  totalDue: number;          // naira
  lineItems: InvoicePdfLineItem[];
}

// ── Design constants ───────────────────────────────────────────────────────

const PRIMARY   = '#1A7F5E';
const TEXT_DARK = '#1A202C';
const TEXT_MID  = '#718096';
const BORDER    = '#E2E8F0';

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtMoney(amount: number, currency: string): string {
  const prefix = (
    { NGN: 'NGN ', USD: 'USD ', GBP: 'GBP ', EUR: 'EUR ' } as Record<string, string>
  )[currency] ?? `${currency} `;
  return `${prefix}${amount.toLocaleString('en', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun',
                  'Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${parseInt(d, 10)} ${months[parseInt(m, 10) - 1]} ${y}`;
}

// ── Main builder ───────────────────────────────────────────────────────────

export function buildInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: unknown) =>
      chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c as ArrayBuffer))
    );
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W  = doc.page.width;   // 595
    const M  = 50;               // horizontal margin
    const CW = W - M * 2;        // usable content width (495)
    const PAGE_H = doc.page.height; // 841

    // Track y manually; page-break helper
    let y = 0;
    const breakPage = () => { doc.addPage(); y = 50; };
    const guard = (needed: number) => {
      if (y + needed > PAGE_H - 60) breakPage();
    };

    // ── Green header ────────────────────────────────────────────────────
    doc.rect(0, 0, W, 82).fill(PRIMARY);

    // Entity name
    doc.font('Helvetica-Bold').fontSize(15).fillColor('white')
       .text(data.entityName, M, 26, { width: CW * 0.6, lineBreak: false });

    // "INVOICE" label
    doc.font('Helvetica').fontSize(8).fillColor('white')
       .opacity(0.7)
       .text('INVOICE', M, 22, { width: CW, align: 'right', lineBreak: false })
       .opacity(1);

    // Invoice number
    doc.font('Helvetica-Bold').fontSize(15).fillColor('white')
       .text(data.invoiceNumber, M, 38, { width: CW, align: 'right', lineBreak: false });

    y = 100;

    // ── Bill To + Dates ─────────────────────────────────────────────────
    const halfCW  = (CW - 24) / 2;
    const rightX  = M + halfCW + 24;

    // Left column: Bill To
    doc.font('Helvetica').fontSize(8).fillColor(TEXT_MID)
       .text('BILL TO', M, y, { lineBreak: false });
    y += 14;
    doc.font('Helvetica-Bold').fontSize(11).fillColor(TEXT_DARK)
       .text(data.clientName, M, y, { width: halfCW, lineBreak: false });
    let leftBottom = y + 16;
    if (data.clientEmail) {
      doc.font('Helvetica').fontSize(9).fillColor(TEXT_MID)
         .text(data.clientEmail, M, y + 16, { width: halfCW, lineBreak: false });
      leftBottom = y + 32;
    }

    // Right column: Dates
    let ry = 100;
    const dateLabelW = 72;

    const dateRow = (label: string, value: string) => {
      doc.font('Helvetica').fontSize(8).fillColor(TEXT_MID)
         .text(label, rightX, ry, { width: dateLabelW, lineBreak: false });
      doc.font('Helvetica').fontSize(9).fillColor(TEXT_DARK)
         .text(value, rightX + dateLabelW, ry, { width: halfCW - dateLabelW, align: 'right', lineBreak: false });
      ry += 16;
    };

    dateRow('Issue Date', fmtDate(data.issueDate));
    dateRow('Due Date',   fmtDate(data.dueDate));
    if (data.currency !== 'NGN') dateRow('Currency', data.currency);

    y = Math.max(leftBottom, ry) + 20;

    // ── Divider ─────────────────────────────────────────────────────────
    doc.moveTo(M, y).lineTo(M + CW, y).strokeColor(BORDER).lineWidth(1).stroke();
    y += 18;

    // ── Line items table ────────────────────────────────────────────────
    const colDesc  = M;
    const colQty   = M + CW * 0.50;
    const colPrice = M + CW * 0.63;
    const colTotal = M + CW * 0.82;
    const wDesc    = CW * 0.48;
    const wQty     = CW * 0.11;
    const wPrice   = CW * 0.17;
    const wTotal   = CW * 0.18;

    // Header
    doc.font('Helvetica-Bold').fontSize(8).fillColor(TEXT_MID);
    doc.text('DESCRIPTION', colDesc,  y, { width: wDesc,  lineBreak: false });
    doc.text('QTY',         colQty,   y, { width: wQty,   align: 'right', lineBreak: false });
    doc.text('UNIT PRICE',  colPrice, y, { width: wPrice, align: 'right', lineBreak: false });
    doc.text('TOTAL',       colTotal, y, { width: wTotal, align: 'right', lineBreak: false });
    y += 14;
    doc.moveTo(M, y).lineTo(M + CW, y).strokeColor(BORDER).lineWidth(1).stroke();
    y += 10;

    // Rows
    for (const item of data.lineItems) {
      const descH  = doc.heightOfString(item.description, { width: wDesc - 4, fontSize: 10 });
      const rowH   = Math.max(descH, 14) + 14;
      guard(rowH + 8);

      doc.font('Helvetica').fontSize(10).fillColor(TEXT_DARK)
         .text(item.description, colDesc, y, { width: wDesc - 4, lineBreak: false });
      doc.font('Helvetica').fontSize(10).fillColor(TEXT_DARK)
         .text(String(item.quantity), colQty, y, { width: wQty, align: 'right', lineBreak: false });
      doc.font('Helvetica').fontSize(10).fillColor(TEXT_DARK)
         .text(fmtMoney(item.unitPrice, data.currency), colPrice, y, { width: wPrice, align: 'right', lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(10).fillColor(TEXT_DARK)
         .text(fmtMoney(item.total, data.currency), colTotal, y, { width: wTotal, align: 'right', lineBreak: false });

      y += rowH;
      doc.moveTo(M, y).lineTo(M + CW, y).strokeColor(BORDER).lineWidth(0.5).stroke();
      y += 8;
    }

    y += 10;

    // ── Totals block (right-aligned) ────────────────────────────────────
    guard(90);

    const tx     = M + CW * 0.54;
    const tW     = CW * 0.46;
    const tLabel = tW * 0.55;
    const tValue = tW * 0.45;

    const totRow = (
      label: string,
      value: string,
      opts: { bold?: boolean; color?: string; sep?: boolean } = {}
    ) => {
      const { bold = false, color = TEXT_DARK, sep = false } = opts;
      if (sep) {
        doc.moveTo(tx, y).lineTo(M + CW, y).strokeColor(BORDER).lineWidth(1).stroke();
        y += 8;
      }
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica')
         .fontSize(bold ? 11 : 10).fillColor(TEXT_DARK)
         .text(label, tx, y, { width: tLabel, lineBreak: false });
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica')
         .fontSize(bold ? 11 : 10).fillColor(color)
         .text(value, tx + tLabel, y, { width: tValue, align: 'right', lineBreak: false });
      y += bold ? 22 : 16;
    };

    totRow('Subtotal', fmtMoney(data.subtotal, data.currency));

    if (data.whtRate > 0 && data.whtAmount != null) {
      totRow(
        `WHT (${data.whtRate}%)`,
        `-${fmtMoney(data.whtAmount, data.currency)}`,
        { color: '#E53E3E' }
      );
    }
    if (data.vatAmount != null && data.vatAmount > 0) {
      totRow('VAT (7.5%)', `+${fmtMoney(data.vatAmount, data.currency)}`);
    }
    totRow('Total Due', fmtMoney(data.totalDue, data.currency), {
      bold: true,
      color: PRIMARY,
      sep: true,
    });

    // ── Notes ────────────────────────────────────────────────────────────
    if (data.notes) {
      y += 16;
      guard(50);
      doc.moveTo(M, y).lineTo(M + CW, y).strokeColor(BORDER).lineWidth(1).stroke();
      y += 16;
      doc.font('Helvetica-Bold').fontSize(9).fillColor(TEXT_MID)
         .text('NOTES', M, y, { lineBreak: false });
      y += 14;
      doc.font('Helvetica').fontSize(10).fillColor(TEXT_DARK)
         .text(data.notes, M, y, { width: CW, lineBreak: false });
      y += doc.heightOfString(data.notes, { width: CW }) + 10;
    }

    // ── Footer ───────────────────────────────────────────────────────────
    const footerY = PAGE_H - 36;
    doc.moveTo(0, footerY - 10).lineTo(W, footerY - 10)
       .strokeColor(BORDER).lineWidth(1).stroke();
    doc.font('Helvetica').fontSize(8).fillColor(TEXT_MID)
       .text(
         `Generated by TaxEase Nigeria  \u00B7  ${data.invoiceNumber}`,
         M, footerY,
         { width: CW, align: 'center', lineBreak: false }
       );

    doc.end();
  });
}
