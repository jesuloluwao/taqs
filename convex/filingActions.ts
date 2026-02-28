"use node";
/**
 * TaxEase Nigeria — Filing Actions (PRD-6 US-045)
 *
 * generateSelfAssessment: snapshots TaxEngineOutput, generates PDF,
 * stores in Convex Storage, marks filing record as 'generated'.
 *
 * PDF generation:
 *   - Primary: calls NEST_PDF_URL/pdf/self-assessment (NestJS service)
 *   - Fallback: builds minimal valid PDF in-process using raw PDF bytes
 */

import { action } from './_generated/server';
import { internal, api } from './_generated/api';
import { v } from 'convex/values';

// ─────────────────────────────────────────────────────────────────────────────
// Minimal PDF builder (pure Node.js, no external deps)
// Generates a simple but valid PDF-1.4 document from line records.
// ─────────────────────────────────────────────────────────────────────────────

interface PdfLine {
  text: string;
  /** Font size in points (default 10) */
  size?: number;
  /** true = Helvetica-Bold, false = Helvetica */
  bold?: boolean;
  /** Horizontal indent from left margin (default 0) */
  indent?: number;
  /** Extra vertical space BEFORE this line (additional points) */
  spaceBefore?: number;
}

function escapePdfStr(s: string): string {
  // Naira sign ₦ (U+20A6) is not in Latin-1 — replace with NGN
  return s
    .replace(/₦/g, 'NGN ')
    .replace(/[^\x20-\x7E]/g, '?')      // replace non-Latin-1 printable as ?
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

/**
 * Build a single-page (may overflow) PDF from an array of line records.
 * Returns a Buffer containing the raw PDF bytes.
 */
function buildMinimalPdf(lines: PdfLine[]): Buffer {
  const PAGE_WIDTH = 612;
  const PAGE_HEIGHT = 792;
  const MARGIN_LEFT = 50;
  const MARGIN_TOP = 742; // y-start (top of page, PDF coords are bottom-up)
  const MARGIN_BOTTOM = 50;

  // ── Build content stream ──────────────────────────────────────────────────
  let stream = '';
  let y = MARGIN_TOP;

  for (const line of lines) {
    const size = line.size ?? 10;
    const bold = line.bold ?? false;
    const indent = line.indent ?? 0;
    const spaceBefore = line.spaceBefore ?? 0;
    const leading = size + 3; // line height ≈ size + 3pt

    y -= spaceBefore;
    if (y < MARGIN_BOTTOM) break; // stop if past bottom margin

    const fontName = bold ? '/F2' : '/F1';
    const x = MARGIN_LEFT + indent;
    const escaped = escapePdfStr(line.text);
    stream += `BT ${fontName} ${size} Tf ${x} ${y} Td (${escaped}) Tj ET\n`;
    y -= leading;
  }

  const streamBuf = Buffer.from(stream, 'latin1');
  const streamLen = streamBuf.length;

  // ── Build PDF objects ─────────────────────────────────────────────────────
  // We need exact byte offsets for the xref table, so we accumulate buffers.

  const parts: Buffer[] = [];
  const offsets: number[] = [0, 0, 0, 0, 0, 0]; // 1-indexed

  function add(s: string): void {
    parts.push(Buffer.from(s, 'latin1'));
  }

  // Track current byte position
  function byteLen(): number {
    let n = 0;
    for (const p of parts) n += p.byteLength;
    return n;
  }

  // Header
  add('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

  // Object 1: Catalog
  offsets[1] = byteLen();
  add('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  // Object 2: Pages
  offsets[2] = byteLen();
  add('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');

  // Object 3: Page
  offsets[3] = byteLen();
  add(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R` +
    ` /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}]` +
    ` /Contents 4 0 R` +
    ` /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >>` +
    ` >>\nendobj\n`
  );

  // Object 4: Content stream
  offsets[4] = byteLen();
  add(`4 0 obj\n<< /Length ${streamLen} >>\nstream\n`);
  parts.push(streamBuf);
  add('\nendstream\nendobj\n');

  // Object 5: Helvetica regular
  offsets[5] = byteLen();
  add(
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica' +
    ' /Encoding /WinAnsiEncoding >>\nendobj\n'
  );

  // Object 6: Helvetica-Bold
  const obj6Offset = byteLen();
  add(
    '6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold' +
    ' /Encoding /WinAnsiEncoding >>\nendobj\n'
  );

  // Cross-reference table
  const xrefOffset = byteLen();
  const pad = (n: number) => String(n).padStart(10, '0');
  add(
    'xref\n' +
    '0 7\n' +
    '0000000000 65535 f \n' +
    `${pad(offsets[1])} 00000 n \n` +
    `${pad(offsets[2])} 00000 n \n` +
    `${pad(offsets[3])} 00000 n \n` +
    `${pad(offsets[4])} 00000 n \n` +
    `${pad(offsets[5])} 00000 n \n` +
    `${pad(obj6Offset)} 00000 n \n`
  );

  // Trailer
  add(`trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  return Buffer.concat(parts);
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers for the PDF content
// ─────────────────────────────────────────────────────────────────────────────

function fmtNgn(kobo: number): string {
  const ngn = kobo / 100;
  return `NGN ${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(ngn)}`;
}

function fmtPct(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`;
}

function row(label: string, value: string, indent = 0): PdfLine[] {
  return [{ text: `${label.padEnd(45, ' ')} ${value}`, indent }];
}

// ─────────────────────────────────────────────────────────────────────────────
// Build self-assessment PDF lines from tax summary + context
// ─────────────────────────────────────────────────────────────────────────────

interface TaxBand {
  rate: number;
  taxableInBand?: number; // alias used by getSummary
  taxInBand?: number;
  income?: number;
  taxPayable?: number;
}

interface TaxSummaryForPdf {
  engineVersion?: string;
  totalGrossIncome: number;
  totalBusinessExpenses: number;
  assessableProfit: number;
  reliefs: {
    personalRelief?: number;
    rentRelief?: number;
    pensionRelief?: number;
    nhfRelief?: number;
    nhisRelief?: number;
    lifeAssuranceRelief?: number;
    totalReliefs: number;
    [key: string]: number | undefined;
  };
  taxableIncome: number;
  bands: TaxBand[];
  grossTaxPayable: number;
  whtCredits: number;
  netTaxPayable: number;
  isNilReturn: boolean;
  effectiveTaxRate?: number;
  cgtPayable?: number;
  citPayable?: number;
  vatPayable?: number;
  totalTaxPayable?: number;
}

function buildPdfLines(
  summary: TaxSummaryForPdf,
  entityName: string,
  entityType: string,
  tin: string | undefined,
  taxYear: number,
  userFullName: string | undefined,
  userEmail: string,
  hasNin: boolean
): PdfLine[] {
  const lines: PdfLine[] = [];

  const heading = (text: string, spaceBefore = 12): void => {
    lines.push({ text, bold: true, size: 13, spaceBefore });
  };
  const subheading = (text: string, spaceBefore = 8): void => {
    lines.push({ text, bold: true, size: 11, spaceBefore });
  };
  const sep = (spaceBefore = 4): void => {
    lines.push({ text: '─'.repeat(70), size: 8, spaceBefore });
  };
  const dataRow = (label: string, value: string, indent = 0): void => {
    row(label, value, indent).forEach((l) => lines.push(l));
  };
  const blank = () => { lines.push({ text: '', size: 4 }); };

  // ── Cover ─────────────────────────────────────────────────────────────────
  lines.push({ text: 'FEDERAL INLAND REVENUE SERVICE (FIRS)', bold: true, size: 14, spaceBefore: 0 });
  lines.push({ text: 'SELF-ASSESSMENT FORM — INDIVIDUAL / BUSINESS', bold: true, size: 12 });
  lines.push({ text: 'Prepared by TaxEase Nigeria', size: 9 });
  sep(10);

  if (summary.isNilReturn) {
    lines.push({ text: '*** NIL RETURN — NO TAX PAYABLE ***', bold: true, size: 13, spaceBefore: 6 });
    blank();
  }

  // ── Section 1: Taxpayer Details ───────────────────────────────────────────
  heading('SECTION 1: TAXPAYER DETAILS');
  sep();
  dataRow('Taxpayer Name', userFullName ?? 'N/A');
  dataRow('Email Address', userEmail);
  dataRow('Entity / Trading Name', entityName);
  dataRow('Entity Type', entityType.replace('_', ' ').toUpperCase());
  dataRow('Tax Year', String(taxYear));
  dataRow('Taxpayer TIN', tin ?? 'Not registered');
  dataRow('NIN', hasNin ? '••••••••••••••• (Verified on file)' : 'Not provided');
  dataRow('Form Generated', new Date().toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' }));

  // ── Section 2: Income Schedule ────────────────────────────────────────────
  heading('SECTION 2: INCOME SCHEDULE');
  sep();
  dataRow('Total Gross Income', fmtNgn(summary.totalGrossIncome));
  dataRow('Less: Allowable Business Expenses', `(${fmtNgn(summary.totalBusinessExpenses)})`);
  sep(2);
  dataRow('ASSESSABLE PROFIT', fmtNgn(summary.assessableProfit), 0);

  // ── Section 3: Deductions & Reliefs ───────────────────────────────────────
  heading('SECTION 3: DEDUCTIONS AND RELIEFS');
  sep();
  subheading('Consolidated Relief Allowance');
  if ((summary.reliefs.personalRelief ?? 0) > 0) {
    dataRow('Personal Allowance', fmtNgn(summary.reliefs.personalRelief ?? 0), 15);
  }
  if ((summary.reliefs.pensionRelief ?? 0) > 0) {
    dataRow('Pension Contributions', fmtNgn(summary.reliefs.pensionRelief ?? 0), 15);
  }
  if ((summary.reliefs.nhfRelief ?? 0) > 0) {
    dataRow('National Housing Fund (NHF)', fmtNgn(summary.reliefs.nhfRelief ?? 0), 15);
  }
  if ((summary.reliefs.nhisRelief ?? 0) > 0) {
    dataRow('National Health Insurance Scheme (NHIS)', fmtNgn(summary.reliefs.nhisRelief ?? 0), 15);
  }
  if ((summary.reliefs.lifeAssuranceRelief ?? 0) > 0) {
    dataRow('Life Assurance Premium', fmtNgn(summary.reliefs.lifeAssuranceRelief ?? 0), 15);
  }
  if ((summary.reliefs.rentRelief ?? 0) > 0) {
    dataRow('Rent Relief (20% of rent, max NGN 500,000)', fmtNgn(summary.reliefs.rentRelief ?? 0), 15);
  }
  sep(2);
  dataRow('TOTAL RELIEFS', fmtNgn(summary.reliefs.totalReliefs));
  blank();
  dataRow('TAXABLE INCOME', fmtNgn(summary.taxableIncome));

  // ── Section 4: Tax Computation ────────────────────────────────────────────
  heading('SECTION 4: TAX COMPUTATION (NTA 2025 PIT BANDS)');
  sep();
  subheading('Progressive Tax Bands');
  for (const band of summary.bands) {
    const taxable = band.taxableInBand ?? band.income ?? 0;
    const taxInBand = band.taxInBand ?? band.taxPayable ?? 0;
    if (taxable <= 0) continue;
    const rate = band.rate < 1 ? band.rate * 100 : band.rate; // normalise
    dataRow(`${String(rate)}% band — ${fmtNgn(taxable)} taxable`, fmtNgn(taxInBand), 15);
  }
  sep(2);
  dataRow('GROSS TAX PAYABLE', fmtNgn(summary.grossTaxPayable));

  if ((summary.cgtPayable ?? 0) > 0) {
    blank();
    dataRow('Capital Gains Tax (CGT)', fmtNgn(summary.cgtPayable!));
  }
  if ((summary.citPayable ?? 0) > 0) {
    blank();
    dataRow('Company Income Tax (CIT)', fmtNgn(summary.citPayable!));
  }
  if ((summary.vatPayable ?? 0) > 0) {
    blank();
    dataRow('Value Added Tax (VAT) Payable', fmtNgn(summary.vatPayable!));
  }

  // ── Section 5: WHT Credits & Net Amount ───────────────────────────────────
  heading('SECTION 5: WHT CREDITS AND NET AMOUNT PAYABLE');
  sep();
  if (summary.whtCredits > 0) {
    dataRow('Less: Withholding Tax Credits', `(${fmtNgn(summary.whtCredits)})`);
    dataRow('  (Deducted at source — see WHT certificates)', '');
  }
  sep(2);

  if (summary.isNilReturn) {
    lines.push({ text: 'NET TAX PAYABLE:   NGN 0.00  — NIL RETURN', bold: true, size: 12, spaceBefore: 4 });
  } else {
    lines.push({ text: `NET TAX PAYABLE:   ${fmtNgn(summary.netTaxPayable)}`, bold: true, size: 12, spaceBefore: 4 });
    if ((summary.effectiveTaxRate ?? 0) > 0) {
      dataRow('Effective Tax Rate', fmtPct(summary.effectiveTaxRate ?? 0));
    }
  }

  // ── Footer ─────────────────────────────────────────────────────────────────
  heading('DECLARATION', 14);
  sep();
  lines.push({ text: 'I declare that the information provided in this self-assessment form is', size: 9 });
  lines.push({ text: 'true, correct, and complete to the best of my knowledge and belief.', size: 9 });
  blank();
  lines.push({ text: 'Signature: ________________________________   Date: __________________', size: 10, spaceBefore: 6 });
  blank();
  lines.push({ text: `Engine Version: ${summary.engineVersion ?? 'N/A'}   |   Generated by TaxEase Nigeria`, size: 8, spaceBefore: 10 });
  lines.push({ text: 'This document is computer-generated. Please file via TaxPro Max or FIRS e-services.', size: 8 });

  return lines;
}

// ─────────────────────────────────────────────────────────────────────────────
// generateSelfAssessment — public action
// ─────────────────────────────────────────────────────────────────────────────

export const generateSelfAssessment = action({
  args: {
    entityId: v.id('entities'),
    taxYear: v.number(),
  },
  handler: async (ctx, args) => {
    // 1. Get context (user, entity, declarations, existing filing)
    const genCtx = await ctx.runQuery(
      (internal as any).filingHelpers.getGenerationContext,
      { entityId: args.entityId, taxYear: args.taxYear }
    ) as {
      user: { _id: string; fullName?: string; email: string; nin?: string; firsTin?: string };
      entity: { _id: string; name: string; type: string; tin?: string; rcNumber?: string };
      declaration: Record<string, number | undefined> | null;
      existingFiling: { _id: string; status: string } | null;
    } | null;

    if (!genCtx) throw new Error('Not authenticated or entity not found');

    // 2. Get current tax summary (runs engine inline, auth-propagated from action)
    const summary = await ctx.runQuery(
      (api as any).tax.getSummary,
      { entityId: args.entityId, taxYear: args.taxYear }
    ) as TaxSummaryForPdf | null;

    if (!summary) throw new Error('Could not compute tax summary. Please add transactions first.');

    // 3. Create or retrieve filing record (blocks if already submitted)
    const filingId = await ctx.runMutation(
      (internal as any).filingHelpers.initiateFilingInternal,
      { entityId: args.entityId, taxYear: args.taxYear }
    ) as string;

    // 4. Snapshot the tax engine output as immutable JSON string
    const taxSummarySnapshot = JSON.stringify({
      ...summary,
      snapshotAt: Date.now(),
    });

    // 5. Determine engine version
    const engineVersion = (summary as any).engineVersionForYear ?? summary.engineVersion ?? '1.0.0';

    // 6. Generate PDF
    let pdfBuffer: Buffer;

    const nestPdfUrl = process.env.NEST_PDF_URL;
    if (nestPdfUrl) {
      // Try NestJS service
      try {
        const response = await fetch(`${nestPdfUrl}/pdf/self-assessment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entityId: args.entityId,
            taxYear: args.taxYear,
            entityName: genCtx.entity.name,
            entityType: genCtx.entity.type,
            tin: genCtx.entity.tin,
            taxpayerName: genCtx.user.fullName,
            email: genCtx.user.email,
            hasNin: !!genCtx.user.nin,
            summary,
            taxSummarySnapshot,
          }),
        });
        if (response.ok) {
          const arrayBuf = await response.arrayBuffer();
          pdfBuffer = Buffer.from(arrayBuf);
        } else {
          throw new Error(`NestJS PDF service returned ${response.status}`);
        }
      } catch (err) {
        console.warn('NestJS PDF service unavailable, falling back to inline PDF generation:', err);
        // Fall through to inline generator
        const lines = buildPdfLines(
          summary,
          genCtx.entity.name,
          genCtx.entity.type,
          genCtx.entity.tin,
          args.taxYear,
          genCtx.user.fullName,
          genCtx.user.email,
          !!genCtx.user.nin
        );
        pdfBuffer = buildMinimalPdf(lines);
      }
    } else {
      // No NestJS service configured — build inline
      const lines = buildPdfLines(
        summary,
        genCtx.entity.name,
        genCtx.entity.type,
        genCtx.entity.tin,
        args.taxYear,
        genCtx.user.fullName,
        genCtx.user.email,
        !!genCtx.user.nin
      );
      pdfBuffer = buildMinimalPdf(lines);
    }

    // 7. Store PDF in Convex Storage
    const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
    const selfAssessmentPdfId = await ctx.storage.store(blob);

    // 8. Mark filing record as generated with immutable snapshot
    await ctx.runMutation(
      (internal as any).filingHelpers.applyGeneratedFiling,
      {
        filingId,
        selfAssessmentPdfId,
        taxSummarySnapshot,
        netTaxPayable: summary.netTaxPayable,
        engineVersion,
        isNilReturn: summary.isNilReturn,
      }
    );

    return { filingId, isNilReturn: summary.isNilReturn, netTaxPayable: summary.netTaxPayable };
  },
});
