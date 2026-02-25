"use node";
import { action } from './_generated/server';
import { internal } from './_generated/api';
import { v } from 'convex/values';
import crypto from 'node:crypto';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type Currency = 'NGN' | 'USD' | 'GBP' | 'EUR';
type Direction = 'credit' | 'debit';

interface ParsedRow {
  date: number;
  description: string;
  /** Amount in smallest currency unit (kobo for NGN) */
  amount: number;
  currency: Currency;
  amountNgn: number;
  fxRate: number;
  direction: Direction;
  type: 'uncategorised';
  externalRef?: string;
  taxYear: number;
}

// ─────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────

/** Parse a date string in common Nigerian bank formats → Unix ms. */
function parseDate(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;

  // DD/MM/YYYY or DD-MM-YYYY
  let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const d = new Date(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}T00:00:00.000Z`);
    if (!isNaN(d.getTime())) return d.getTime();
  }

  // DD/MM/YY or DD-MM-YY  (two-digit year: treat 00-29 as 2000s, 30-99 as 1900s)
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
  if (m) {
    const year = parseInt(m[3], 10) < 30 ? 2000 + parseInt(m[3], 10) : 1900 + parseInt(m[3], 10);
    const d = new Date(`${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}T00:00:00.000Z`);
    if (!isNaN(d.getTime())) return d.getTime();
  }

  // YYYY-MM-DD (ISO)
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`);
    if (!isNaN(d.getTime())) return d.getTime();
  }

  // DD Mon YYYY  e.g. "25 Jan 2025"
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (m) {
    const d = new Date(`${m[2]} ${m[1]}, ${m[3]}`);
    if (!isNaN(d.getTime())) return d.getTime();
  }

  // Native fallback
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.getTime();

  return null;
}

/**
 * Parse an amount string to kobo (₦ × 100).
 * Strips currency symbols, commas, and surrounding whitespace.
 */
function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[₦$£€,\s]/g, '').trim();
  if (!cleaned || cleaned === '-' || cleaned === '') return null;
  const val = parseFloat(cleaned);
  if (isNaN(val) || val < 0) return null;
  return Math.round(val * 100); // convert Naira → kobo
}

/** Detect currency code from a string. Defaults to NGN. */
function detectCurrency(raw: string): Currency {
  const s = raw.trim().toUpperCase();
  if (s === 'USD' || s === '$') return 'USD';
  if (s === 'GBP' || s === '£') return 'GBP';
  if (s === 'EUR' || s === '€') return 'EUR';
  return 'NGN';
}

/**
 * Deterministic externalRef for dedup — SHA-256 of canonical fields.
 * Truncated to 32 hex chars.
 */
function makeExternalRef(date: number, description: string, amount: number, direction: Direction): string {
  const payload = `${date}|${description.trim()}|${amount}|${direction}`;
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 32);
}

// ─────────────────────────────────────────────
// CSV parsing
// ─────────────────────────────────────────────

/** Split a CSV line respecting double-quoted fields. */
function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

type CsvFormat = 'standard5' | 'gtbank' | 'zenith' | 'access' | 'debit_credit';

function detectCsvFormat(headers: string[]): CsvFormat {
  const h = headers.map((x) => x.toLowerCase().replace(/['"]/g, '').trim());

  // GTBank: has both "narration" and "value date"
  if (h.some((x) => x.includes('narration')) && h.some((x) => x.includes('value date'))) {
    return 'gtbank';
  }
  // Zenith: has "remarks" + "debit amount"
  if (h.some((x) => x.includes('remarks')) && h.some((x) => x.includes('debit amount'))) {
    return 'zenith';
  }
  // Access: "narration" + "debit" (without "value date")
  if (h.some((x) => x.includes('narration')) && h.some((x) => x === 'debit' || x === 'debit ')) {
    return 'access';
  }
  // Standard 5-col with explicit direction column
  if (h.some((x) => x === 'direction' || x === 'dr/cr' || x === 'type' || x === 'cr/dr')) {
    return 'standard5';
  }
  // Generic debit + credit columns
  if (h.some((x) => x.includes('debit')) && h.some((x) => x.includes('credit'))) {
    return 'debit_credit';
  }
  // Default fallback — assume 5-column
  return 'standard5';
}

function parseCSV(content: string): ParsedRow[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]);
  const format = detectCsvFormat(headers);
  const results: ParsedRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (cols.filter((c) => c).length < 3) continue;

    try {
      let date: number | null = null;
      let description = '';
      let amount = 0;
      let direction: Direction = 'debit';
      let currency: Currency = 'NGN';

      if (format === 'standard5') {
        // Date | Description | Amount | Direction | Currency
        date = parseDate(cols[0] ?? '');
        description = (cols[1] ?? '').trim();
        const amt = parseAmount(cols[2] ?? '');
        if (!amt) continue;
        amount = amt;
        const dir = (cols[3] ?? '').toLowerCase();
        direction = dir.includes('cr') || dir.includes('credit') || dir === '+' ? 'credit' : 'debit';
        currency = cols[4] ? detectCurrency(cols[4]) : 'NGN';
      } else if (format === 'gtbank') {
        // Date | Narration | Value Date | Debit | Credit
        date = parseDate(cols[0] ?? '');
        description = (cols[1] ?? '').trim();
        const debit = parseAmount(cols[3] ?? '');
        const credit = parseAmount(cols[4] ?? '');
        if (credit && credit > 0) {
          amount = credit;
          direction = 'credit';
        } else if (debit && debit > 0) {
          amount = debit;
          direction = 'debit';
        } else continue;
        currency = 'NGN';
      } else if (format === 'zenith') {
        // Transaction Date | Remarks | Debit Amount | Credit Amount | Balance
        date = parseDate(cols[0] ?? '');
        description = (cols[1] ?? '').trim();
        const debit = parseAmount(cols[2] ?? '');
        const credit = parseAmount(cols[3] ?? '');
        if (credit && credit > 0) {
          amount = credit;
          direction = 'credit';
        } else if (debit && debit > 0) {
          amount = debit;
          direction = 'debit';
        } else continue;
        currency = 'NGN';
      } else {
        // access / debit_credit: Transaction Date | Narration | Debit | Credit | Balance
        date = parseDate(cols[0] ?? '');
        description = (cols[1] ?? '').trim();
        const debit = parseAmount(cols[2] ?? '');
        const credit = parseAmount(cols[3] ?? '');
        if (credit && credit > 0) {
          amount = credit;
          direction = 'credit';
        } else if (debit && debit > 0) {
          amount = debit;
          direction = 'debit';
        } else continue;
        currency = 'NGN';
      }

      if (!date || !description || !amount) continue;

      results.push({
        date,
        description,
        amount,
        currency,
        amountNgn: amount, // For NGN imports, amountNgn == amount (both in kobo)
        fxRate: 1,
        direction,
        type: 'uncategorised',
        externalRef: makeExternalRef(date, description, amount, direction),
        taxYear: new Date(date).getUTCFullYear(),
      });
    } catch {
      // Skip unparseable rows — partial failure tolerance
    }
  }

  return results;
}

// ─────────────────────────────────────────────
// PDF parsing
// ─────────────────────────────────────────────

/**
 * Extract text from a PDF buffer using pdf-parse.
 * Returns the full text content.
 */
async function extractPdfText(buffer: Buffer): Promise<string> {
  // Dynamic import handles the CJS module
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = await import('pdf-parse' as any);
  const pdfParse = mod.default ?? mod;
  const data = await pdfParse(buffer);
  return data.text as string;
}

/**
 * Detect Nigerian bank from PDF text content.
 */
type BankFormat = 'gtbank' | 'zenith' | 'access' | 'generic';

function detectBankFormat(text: string): BankFormat {
  const lower = text.toLowerCase();
  if (lower.includes('guaranty trust') || lower.includes('gtbank') || lower.includes('gt bank')) {
    return 'gtbank';
  }
  if (lower.includes('zenith bank')) {
    return 'zenith';
  }
  if (lower.includes('access bank')) {
    return 'access';
  }
  return 'generic';
}

/**
 * GTBank PDF statement parser.
 *
 * Row pattern (space-separated columns):
 *   DD/MM/YY  Narration text  DD/MM/YY  DebitAmt  CreditAmt  Balance
 * The value-date column is optional.
 */
function parseGTBankPDF(text: string): ParsedRow[] {
  const results: ParsedRow[] = [];
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l);

  // Match line starting with a date, then narration, then optional value date, then amounts
  const rowRe = /^(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\s+(.+?)\s+(?:\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\s+)?([\d,]+\.\d{2})?\s*([\d,]+\.\d{2})?\s+([\d,]+\.\d{2})/;

  for (const line of lines) {
    const m = line.match(rowRe);
    if (!m) continue;

    const date = parseDate(m[1]);
    if (!date) continue;

    const description = m[2].trim();
    const debitAmt = m[3] ? parseAmount(m[3]) : null;
    const creditAmt = m[4] ? parseAmount(m[4]) : null;

    let amount = 0;
    let direction: Direction = 'debit';

    if (creditAmt && creditAmt > 0) {
      amount = creditAmt;
      direction = 'credit';
    } else if (debitAmt && debitAmt > 0) {
      amount = debitAmt;
      direction = 'debit';
    } else continue;

    if (!description) continue;

    results.push({
      date,
      description,
      amount,
      currency: 'NGN',
      amountNgn: amount,
      fxRate: 1,
      direction,
      type: 'uncategorised',
      externalRef: makeExternalRef(date, description, amount, direction),
      taxYear: new Date(date).getUTCFullYear(),
    });
  }

  return results;
}

/**
 * Zenith Bank PDF statement parser.
 * Row pattern: Date  |  Remarks  |  Debit  |  Credit  |  Balance
 */
function parseZenithPDF(text: string): ParsedRow[] {
  const results: ParsedRow[] = [];
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l);

  // Pattern: date + narration + 2-3 amounts at end of line
  const rowRe = /^(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\s+(.+?)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})$/;
  const rowRe2 = /^(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\s+(.+?)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})$/;

  for (const line of lines) {
    let m = line.match(rowRe);
    let debitAmt: number | null = null;
    let creditAmt: number | null = null;
    let date: number | null = null;
    let description = '';

    if (m) {
      date = parseDate(m[1]);
      description = m[2].trim();
      // In Zenith: col3=Debit, col4=Credit, col5=Balance
      debitAmt = parseAmount(m[3]);
      creditAmt = parseAmount(m[4]);
    } else {
      m = line.match(rowRe2);
      if (!m) continue;
      date = parseDate(m[1]);
      description = m[2].trim();
      // Two amounts: debit and balance (credit assumed 0) — check for "CR" in description
      const lineUpper = line.toUpperCase();
      if (lineUpper.includes('CR') || lineUpper.includes('CREDIT')) {
        creditAmt = parseAmount(m[3]);
      } else {
        debitAmt = parseAmount(m[3]);
      }
    }

    if (!date || !description) continue;

    let amount = 0;
    let direction: Direction = 'debit';
    if (creditAmt && creditAmt > 0) {
      amount = creditAmt;
      direction = 'credit';
    } else if (debitAmt && debitAmt > 0) {
      amount = debitAmt;
      direction = 'debit';
    } else continue;

    results.push({
      date,
      description,
      amount,
      currency: 'NGN',
      amountNgn: amount,
      fxRate: 1,
      direction,
      type: 'uncategorised',
      externalRef: makeExternalRef(date, description, amount, direction),
      taxYear: new Date(date).getUTCFullYear(),
    });
  }

  return results;
}

/**
 * Access Bank PDF statement parser.
 * Row pattern: Date  Narration  Debit  Credit  Balance
 */
function parseAccessPDF(text: string): ParsedRow[] {
  // Access Bank statements follow a similar tabular layout to Zenith
  return parseGenericBankPDF(text);
}

/**
 * Generic bank PDF parser.
 * Extracts lines that begin with a recognisable date and contain at least one monetary amount.
 * Direction is inferred from position (last 2 amounts = debit + balance, or credit + balance).
 */
function parseGenericBankPDF(text: string): ParsedRow[] {
  const results: ParsedRow[] = [];
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l);

  const dateRe = /^(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/;
  const amountRe = /\d{1,3}(?:,\d{3})*\.\d{2}/g;

  for (const line of lines) {
    const dateMatch = line.match(dateRe);
    if (!dateMatch) continue;

    const date = parseDate(dateMatch[1]);
    if (!date) continue;

    // Extract all money-like values from the line
    const rawAmounts: string[] = line.match(amountRe) ?? [];
    if (rawAmounts.length === 0) continue;

    const amounts = rawAmounts.map(parseAmount).filter((a): a is number => a !== null && a > 0);
    if (amounts.length === 0) continue;

    // Extract description: text between date and first amount
    const afterDate = line.slice(dateMatch[0].length).trim();
    const descEnd = afterDate.search(/\d{1,3}(?:,\d{3})*\.\d{2}/);
    const description = descEnd > 0 ? afterDate.slice(0, descEnd).trim() : afterDate.split(/\s{2,}/)[0].trim();

    if (!description || description.length < 2) continue;

    // Determine direction: look for CR/DR markers
    const lineUpper = line.toUpperCase();
    let direction: Direction = 'debit';
    if (lineUpper.includes(' CR') || lineUpper.match(/\bCREDIT\b/)) {
      direction = 'credit';
    }

    // Use first amount as transaction amount (last is typically balance)
    const amount = amounts[0];
    if (!amount) continue;

    results.push({
      date,
      description,
      amount,
      currency: 'NGN',
      amountNgn: amount,
      fxRate: 1,
      direction,
      type: 'uncategorised',
      externalRef: makeExternalRef(date, description, amount, direction),
      taxYear: new Date(date).getUTCFullYear(),
    });
  }

  return results;
}

async function parsePDF(buffer: Buffer): Promise<ParsedRow[]> {
  const text = await extractPdfText(buffer);
  const bankFormat = detectBankFormat(text);

  switch (bankFormat) {
    case 'gtbank':
      return parseGTBankPDF(text);
    case 'zenith':
      return parseZenithPDF(text);
    case 'access':
      return parseAccessPDF(text);
    default:
      return parseGenericBankPDF(text);
  }
}

// ─────────────────────────────────────────────
// processImport action
// ─────────────────────────────────────────────

export const processImport = action({
  args: {
    jobId: v.id('importJobs'),
  },
  handler: async (ctx, { jobId }) => {
    // Fetch the job record
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const job = await ctx.runQuery((internal as any).importHelpers.getJob, { jobId });
    if (!job) throw new Error('Import job not found');

    const { entityId, userId, storageId, source } = job;

    if (!storageId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await ctx.runMutation((internal as any).importHelpers.setJobFailed, {
        jobId,
        errorMessage: 'No file storageId on import job',
      });
      return;
    }

    // Mark job as processing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ctx.runMutation((internal as any).importHelpers.setJobProcessing, { jobId });

    let parsed: ParsedRow[] = [];
    let parseError: string | null = null;

    try {
      // Download file from Convex Storage
      const blob = await ctx.storage.get(storageId);
      if (!blob) throw new Error('File not found in storage');

      const arrayBuf = await blob.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);

      // Detect format: use job source field, or sniff first bytes (CSV is text, PDF starts with %PDF)
      const isPdf =
        source === 'pdf' ||
        (buffer.length > 4 &&
          buffer[0] === 0x25 && // %
          buffer[1] === 0x50 && // P
          buffer[2] === 0x44 && // D
          buffer[3] === 0x46);  // F

      if (isPdf) {
        parsed = await parsePDF(buffer);
      } else {
        // CSV (and other text-based formats)
        const text = buffer.toString('utf-8');
        parsed = parseCSV(text);
      }
    } catch (err: unknown) {
      parseError = err instanceof Error ? err.message : String(err);
    }

    if (parseError !== null) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await ctx.runMutation((internal as any).importHelpers.setJobFailed, {
        jobId,
        errorMessage: `Parse failed: ${parseError}`,
        totalParsed: 0,
        totalImported: 0,
        duplicatesSkipped: 0,
      });
      return;
    }

    // If we parsed 0 rows, mark as failed with a descriptive error
    // (but still succeed if the file was valid yet empty)
    const totalParsed = parsed.length;

    // Insert parsed transactions (with dedup)
    let totalImported = 0;
    let duplicatesSkipped = 0;
    let insertError: string | null = null;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await ctx.runMutation((internal as any).importHelpers.batchInsert, {
        jobId,
        entityId,
        userId,
        transactions: parsed,
      });
      totalImported = result.totalImported;
      duplicatesSkipped = result.duplicatesSkipped;
    } catch (err: unknown) {
      insertError = err instanceof Error ? err.message : String(err);
    }

    if (insertError !== null) {
      // Partial success: we parsed OK but insertion failed
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await ctx.runMutation((internal as any).importHelpers.setJobFailed, {
        jobId,
        errorMessage: `Insert failed: ${insertError}`,
        totalParsed,
        totalImported,
        duplicatesSkipped,
      });
      return;
    }

    // Mark complete
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ctx.runMutation((internal as any).importHelpers.setJobComplete, {
      jobId,
      totalParsed,
      totalImported,
      duplicatesSkipped,
    });
  },
});
