"use node";
/**
 * Self-assessment PDF builder using PDFKit.
 *
 * Replaces the raw-bytes buildMinimalPdf fallback in filingActions.ts.
 * Produces a properly formatted, multi-page self-assessment document.
 *
 * Amounts are received in KOBO (smallest unit) and converted to naira
 * internally — matching the convention of the existing fmtNgn() helper.
 *
 * Built-in PDF fonts are WinAnsi encoded. ₦ (U+20A6) is not supported,
 * so all naira amounts are rendered as "NGN X,XXX.XX".
 */

import PDFDocument from 'pdfkit';

// ── Types ──────────────────────────────────────────────────────────────────

export interface TaxBandForPdf {
  rate: number;
  taxableInBand?: number; // kobo
  taxInBand?: number;     // kobo
  income?: number;        // kobo (alias)
  taxPayable?: number;    // kobo (alias)
}

export interface TaxSummaryForPdf {
  engineVersion?: string;
  totalGrossIncome: number;     // kobo
  totalBusinessExpenses: number; // kobo
  assessableProfit: number;     // kobo
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
  taxableIncome: number;     // kobo
  bands: TaxBandForPdf[];
  grossTaxPayable: number;   // kobo
  whtCredits: number;        // kobo
  payeCredits?: number;      // kobo
  totalEmploymentIncome?: number; // kobo
  netTaxPayable: number;     // kobo
  isNilReturn: boolean;
  effectiveTaxRate?: number; // 0–1 decimal OR 0–100 percentage (normalised below)
  cgtPayable?: number;       // kobo
  citPayable?: number;       // kobo
  vatPayable?: number;       // kobo
  totalTaxPayable?: number;  // kobo
}

export interface FilingPdfContext {
  entityName: string;
  entityType: string;
  tin?: string;
  taxYear: number;
  userFullName?: string;
  userEmail: string;
  hasNin: boolean;
  summary: TaxSummaryForPdf;
}

// ── Design constants ───────────────────────────────────────────────────────

const TEXT       = '#1A202C';
const MUTED      = '#718096';
const BORDER     = '#CBD5E0';
const HEADER_BG  = '#1A7F5E';
const NIL_YELLOW = '#FFFBEB';

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtNgn(kobo: number): string {
  const ngn = kobo / 100;
  return `NGN ${ngn.toLocaleString('en', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtPct(rate: number): string {
  // normalise: if rate < 1 it's a decimal (0.15 → 15%), else it's already %
  const pct = rate < 1 ? rate * 100 : rate;
  return `${pct.toFixed(2)}%`;
}

// ── Page builder helper ────────────────────────────────────────────────────

function makePage(doc: InstanceType<typeof PDFDocument>) {
  const W       = doc.page.width;   // 595
  const M       = 50;               // margin
  const CW      = W - M * 2;        // 495
  const PAGE_H  = doc.page.height;  // 841
  const BOTTOM  = PAGE_H - 60;

  let y = 120; // start below header

  const newPage = () => {
    doc.addPage();
    y = 50;
  };

  const guard = (needed: number) => {
    if (y + needed > BOTTOM) newPage();
  };

  const move = (pts: number) => { y += pts; };

  // Horizontal rule
  const rule = (color = BORDER, weight = 0.75) => {
    guard(8);
    doc.moveTo(M, y).lineTo(M + CW, y).strokeColor(color).lineWidth(weight).stroke();
    y += 8;
  };

  // Section heading
  const heading = (text: string, spaceBefore = 14) => {
    guard(spaceBefore + 20);
    y += spaceBefore;
    doc.font('Helvetica-Bold').fontSize(11).fillColor(TEXT)
       .text(text, M, y, { width: CW, lineBreak: false });
    y += 16;
    rule('#94A3B8', 0.5);
  };

  // Key-value row (label left, value right)
  const kv = (
    label: string,
    value: string,
    opts: { bold?: boolean; size?: number; indent?: number; valueColor?: string } = {}
  ) => {
    const { bold = false, size = 10, indent = 0, valueColor = TEXT } = opts;
    const rowH = size + 8;
    guard(rowH);
    const x      = M + indent;
    const labelW = CW * 0.58 - indent;
    const valueW = CW * 0.42;

    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size)
       .fillColor(TEXT)
       .text(label, x, y, { width: labelW, lineBreak: false });

    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size)
       .fillColor(valueColor)
       .text(value, M + CW - valueW, y, { width: valueW, align: 'right', lineBreak: false });

    y += rowH;
  };

  // Indented note row (single column, smaller text)
  const note = (text: string, indent = 14) => {
    guard(16);
    doc.font('Helvetica').fontSize(9).fillColor(MUTED)
       .text(text, M + indent, y, { width: CW - indent, lineBreak: false });
    y += 14;
  };

  return { doc, W, M, CW, PAGE_H, getY: () => y, setY: (v: number) => { y = v; }, newPage, guard, move, rule, heading, kv, note };
}

// ── Main builder ───────────────────────────────────────────────────────────

export function buildFilingPdf(ctx: FilingPdfContext): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: unknown) =>
      chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c as ArrayBuffer))
    );
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const { summary } = ctx;
    const p = makePage(doc);

    // ── Cover header ──────────────────────────────────────────────────────
    doc.rect(0, 0, p.W, 90).fill(HEADER_BG);

    doc.font('Helvetica-Bold').fontSize(13).fillColor('white')
       .text('FEDERAL INLAND REVENUE SERVICE (FIRS)', p.M, 20, { lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(11).fillColor('white')
       .text('SELF-ASSESSMENT RETURN  —  INDIVIDUAL / BUSINESS', p.M, 38, { lineBreak: false });
    doc.font('Helvetica').fontSize(9).fillColor('white').opacity(0.8)
       .text(`Prepared by TaxEase Nigeria  \u00B7  Tax Year ${ctx.taxYear}`, p.M, 58, { lineBreak: false })
       .opacity(1);

    // ── Nil return banner ─────────────────────────────────────────────────
    if (summary.isNilReturn) {
      doc.rect(p.M, 100, p.CW, 28).fill(NIL_YELLOW);
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#92400E')
         .text('NIL RETURN  —  No tax payable for this period', p.M + 12, 109, { lineBreak: false });
      p.setY(140);
    }

    // ── Section 1: Taxpayer Details ───────────────────────────────────────
    p.heading('SECTION 1 — TAXPAYER DETAILS');
    p.kv('Taxpayer Name',       ctx.userFullName ?? 'N/A');
    p.kv('Email Address',       ctx.userEmail);
    p.kv('Entity / Trading Name', ctx.entityName);
    p.kv('Entity Type',         ctx.entityType.replace(/_/g, ' ').toUpperCase());
    p.kv('Tax Year',            String(ctx.taxYear));
    p.kv('Taxpayer TIN / NIN',  ctx.tin ?? 'Not registered');
    p.kv('NIN on File',         ctx.hasNin ? 'Yes (masked for security)' : 'Not provided');
    p.kv('Form Generated',      new Date().toLocaleDateString('en-GB', {
      day: '2-digit', month: 'long', year: 'numeric',
    }));

    // ── Section 2: Income Schedule ────────────────────────────────────────
    p.heading('SECTION 2 — INCOME SCHEDULE');
    p.kv('Total Gross Income', fmtNgn(summary.totalGrossIncome));

    // Employment vs other income breakdown
    if ((summary.totalEmploymentIncome ?? 0) > 0) {
      const otherIncome = summary.totalGrossIncome - (summary.totalEmploymentIncome ?? 0);
      p.kv('Employment Income', fmtNgn(summary.totalEmploymentIncome!), { indent: 16, size: 9 });
      if (otherIncome > 0) {
        p.kv('Other Income', fmtNgn(otherIncome), { indent: 16, size: 9 });
      }
    }

    p.kv(
      'Less: Allowable Business Expenses',
      `(${fmtNgn(summary.totalBusinessExpenses)})`,
      { valueColor: '#E53E3E' }
    );
    p.rule();
    p.kv('ASSESSABLE PROFIT', fmtNgn(summary.assessableProfit), { bold: true });

    // ── Section 3: Deductions & Reliefs ───────────────────────────────────
    p.heading('SECTION 3 — DEDUCTIONS AND RELIEFS');

    const relief = summary.reliefs;
    if ((relief.personalRelief ?? 0) > 0)
      p.kv('Personal Allowance', fmtNgn(relief.personalRelief!), { indent: 16 });
    if ((relief.rentRelief ?? 0) > 0)
      p.kv('Rent Relief (20% of rent, max NGN 500,000)', fmtNgn(relief.rentRelief!), { indent: 16 });
    if ((relief.pensionRelief ?? 0) > 0)
      p.kv('Pension Contributions', fmtNgn(relief.pensionRelief!), { indent: 16 });
    if ((relief.nhfRelief ?? 0) > 0)
      p.kv('National Housing Fund (NHF)', fmtNgn(relief.nhfRelief!), { indent: 16 });
    if ((relief.nhisRelief ?? 0) > 0)
      p.kv('National Health Insurance (NHIS)', fmtNgn(relief.nhisRelief!), { indent: 16 });
    if ((relief.lifeAssuranceRelief ?? 0) > 0)
      p.kv('Life Assurance Premium', fmtNgn(relief.lifeAssuranceRelief!), { indent: 16 });

    p.rule();
    p.kv('TOTAL RELIEFS',  fmtNgn(relief.totalReliefs ?? 0), { bold: true });
    p.move(4);
    p.kv('TAXABLE INCOME', fmtNgn(summary.taxableIncome ?? 0), { bold: true });

    // ── Section 4: Tax Computation ────────────────────────────────────────
    p.heading('SECTION 4 — TAX COMPUTATION (NTA 2025 PIT BANDS)');

    const activeBands = summary.bands.filter(b => {
      const taxable = b.taxableInBand ?? b.income ?? 0;
      return taxable > 0;
    });

    if (activeBands.length > 0) {
      // Band table header
      p.guard(20);
      const bM     = p.M + 16;
      const bCW    = p.CW - 16;
      const bY     = p.getY();
      doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED);
      doc.text('RATE',          bM,            bY, { width: bCW * 0.15, lineBreak: false });
      doc.text('INCOME IN BAND', bM + bCW * 0.15, bY, { width: bCW * 0.42, lineBreak: false });
      doc.text('TAX IN BAND',   bM + bCW * 0.57, bY, { width: bCW * 0.43, align: 'right', lineBreak: false });
      p.setY(bY + 14);
      p.rule(BORDER, 0.5);

      for (const band of activeBands) {
        const taxable  = band.taxableInBand ?? band.income ?? 0;
        const taxInBand = band.taxInBand    ?? band.taxPayable ?? 0;
        const rate     = band.rate < 1 ? band.rate * 100 : band.rate;
        p.guard(16);

        const rowY = p.getY();
        doc.font('Helvetica').fontSize(10).fillColor(TEXT);
        doc.text(`${rate}%`,         bM,                rowY, { width: bCW * 0.15, lineBreak: false });
        doc.text(fmtNgn(taxable),    bM + bCW * 0.15,   rowY, { width: bCW * 0.42, lineBreak: false });
        doc.text(fmtNgn(taxInBand),  bM + bCW * 0.57,   rowY, { width: bCW * 0.43, align: 'right', lineBreak: false });
        p.setY(rowY + 16);
      }
    }

    p.rule();
    p.kv('GROSS TAX PAYABLE', fmtNgn(summary.grossTaxPayable), { bold: true });

    if ((summary.cgtPayable ?? 0) > 0) {
      p.move(4);
      p.kv('Capital Gains Tax (CGT)', fmtNgn(summary.cgtPayable!));
    }
    if ((summary.citPayable ?? 0) > 0) {
      p.move(4);
      p.kv('Company Income Tax (CIT)', fmtNgn(summary.citPayable!));
    }
    if ((summary.vatPayable ?? 0) > 0) {
      p.move(4);
      p.kv('VAT Net Payable', fmtNgn(summary.vatPayable!));
    }

    // ── Section 5: Credits & Net Payable ──────────────────────────────────
    p.heading('SECTION 5 — CREDITS AND NET AMOUNT PAYABLE');

    if (summary.whtCredits > 0) {
      p.kv(
        'Less: Withholding Tax Credits',
        `(${fmtNgn(summary.whtCredits)})`,
        { valueColor: '#E53E3E' }
      );
      p.note('Deducted at source — WHT credit certificates should be retained for audit.');
    }

    if ((summary.payeCredits ?? 0) > 0) {
      p.kv(
        'Less: PAYE Credits',
        `(${fmtNgn(summary.payeCredits!)})`,
        { valueColor: '#E53E3E' }
      );
      p.note('PAYE deducted by employer — payslips or P&L statements should be retained.');
    }

    p.rule('#94A3B8');

    if (summary.isNilReturn) {
      p.guard(28);
      doc.font('Helvetica-Bold').fontSize(13).fillColor(HEADER_BG)
         .text('NET TAX PAYABLE:   NGN 0.00   (NIL RETURN)', p.M, p.getY(), { lineBreak: false });
      p.setY(p.getY() + 22);
    } else {
      p.guard(28);
      doc.font('Helvetica-Bold').fontSize(13).fillColor(TEXT)
         .text(`NET TAX PAYABLE:   ${fmtNgn(summary.netTaxPayable)}`, p.M, p.getY(), { lineBreak: false });
      p.setY(p.getY() + 22);

      if ((summary.effectiveTaxRate ?? 0) > 0) {
        p.kv('Effective Tax Rate', fmtPct(summary.effectiveTaxRate!), { valueColor: MUTED });
      }
    }

    // ── Declaration ───────────────────────────────────────────────────────
    p.heading('DECLARATION', 24);

    p.guard(80);
    const declY = p.getY();
    doc.font('Helvetica').fontSize(9).fillColor(TEXT)
       .text(
         'I declare that the information provided in this self-assessment return is true, ' +
         'correct and complete to the best of my knowledge and belief.',
         p.M, declY, { width: p.CW, lineBreak: false }
       );
    p.setY(declY + 28);

    doc.font('Helvetica').fontSize(10).fillColor(TEXT)
       .text('Signature: ______________________________', p.M, p.getY(), { lineBreak: false });
    doc.font('Helvetica').fontSize(10).fillColor(TEXT)
       .text('Date: ____________________', p.M + p.CW * 0.55, p.getY(), { lineBreak: false });
    p.setY(p.getY() + 30);

    // ── Footer note ───────────────────────────────────────────────────────
    p.rule(BORDER);
    p.guard(32);
    doc.font('Helvetica').fontSize(8).fillColor(MUTED)
       .text(
         `Engine Version: ${summary.engineVersion ?? 'N/A'}   \u00B7   Generated by TaxEase Nigeria`,
         p.M, p.getY(), { width: p.CW, align: 'center', lineBreak: false }
       );
    p.setY(p.getY() + 12);
    doc.font('Helvetica').fontSize(8).fillColor(MUTED)
       .text(
         'This document is computer-generated. Please file via TaxPro Max or FIRS e-services portal.',
         p.M, p.getY(), { width: p.CW, align: 'center', lineBreak: false }
       );

    doc.end();
  });
}
