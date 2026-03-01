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
// PDF parsing (AI-powered)
// ─────────────────────────────────────────────

async function extractPdfText(buffer: Buffer): Promise<string> {
  console.log(`[importPipeline] Extracting text from PDF (${buffer.length} bytes)…`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = await import('pdf-parse' as any);
  const pdfParse = mod.default ?? mod;
  const data = await pdfParse(buffer);
  const text = data.text as string;
  console.log(`[importPipeline] PDF text extracted — ${text.length} chars, ${data.numpages} pages`);
  return text;
}

const PDF_PARSE_MODEL = 'claude-haiku-4-5-20251001';
const PDF_MAX_RETRIES = 3;

interface AiExtractedTransaction {
  date: string;
  description: string;
  amount: number;
  direction: 'credit' | 'debit';
  currency: string;
}

function buildPdfExtractionPrompt(pdfText: string): string {
  return `Extract ALL financial transactions from this bank statement text.
Return a JSON array. Each object: {"d":"YYYY-MM-DD","n":"counterparty or purpose","a":1234.56,"dir":"c" or "d","cur":"USD"}
- "d": date, "n": short description (counterparty, NOT transaction IDs), "a": positive amount, "dir": "c"=credit/incoming "d"=debit/outgoing, "cur": ISO currency
- Negative amounts → positive "a" with "dir":"d"
- Include fees, charges, conversions
- Detect currency from statement header (e.g. "USD statement" → "USD")
- Ignore headers, balances, page numbers
- Output compact JSON (no extra whitespace). No markdown, no explanation.

Statement:
${pdfText}`;
}

/**
 * Recover valid JSON objects from a truncated JSON array string.
 * Finds the last complete object and closes the array.
 */
function recoverTruncatedJson(text: string): AiExtractedTransaction[] | null {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

  // Try direct parse first
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed;
  } catch { /* continue to recovery */ }

  // Find the last complete object: look for "}," or "}" before the truncation
  const lastCompleteObj = trimmed.lastIndexOf('},');
  const lastObj = trimmed.lastIndexOf('}');

  const cutPoint = lastCompleteObj > 0 ? lastCompleteObj + 1 : lastObj > 0 ? lastObj + 1 : -1;
  if (cutPoint <= 0) return null;

  const recovered = trimmed.slice(0, cutPoint) + ']';
  try {
    const parsed = JSON.parse(recovered);
    if (Array.isArray(parsed)) return parsed;
  } catch { /* recovery failed */ }

  return null;
}

/** Normalise the compact field names back to the full interface. */
function normaliseAiRow(row: Record<string, unknown>): AiExtractedTransaction | null {
  const date = (row.d ?? row.date) as string | undefined;
  const description = (row.n ?? row.description) as string | undefined;
  const amount = (row.a ?? row.amount) as number | undefined;
  const dirRaw = (row.dir ?? row.direction) as string | undefined;
  const currency = (row.cur ?? row.currency) as string | undefined;

  if (!date || !description || amount === undefined) return null;

  const direction = dirRaw === 'c' || dirRaw === 'credit' ? 'credit' : 'debit';
  return { date, description, amount: Number(amount), direction, currency: currency ?? 'NGN' };
}

const PDF_CHUNK_CHAR_LIMIT = 12000;

/**
 * Split PDF text into chunks at page boundaries.
 * The header (first ~15 lines) is prepended to each chunk for context.
 */
function chunkPdfText(fullText: string): string[] {
  if (fullText.length <= PDF_CHUNK_CHAR_LIMIT) return [fullText];

  const lines = fullText.split('\n');
  const headerLines = lines.slice(0, 15).join('\n');

  // Split on page break markers like "-- 1 of 6 --" or "ref:... N / M"
  const pageBreakRe = /^--\s*\d+\s*of\s*\d+\s*--$/i;
  const refPageRe = /^ref:[a-f0-9-]+\s+\d+\s*\/\s*\d+$/i;

  const chunks: string[] = [];
  let currentChunk = '';

  for (const line of lines) {
    if ((pageBreakRe.test(line.trim()) || refPageRe.test(line.trim())) && currentChunk.length > 500) {
      chunks.push(currentChunk);
      currentChunk = headerLines + '\n\n';
      continue;
    }
    currentChunk += line + '\n';

    if (currentChunk.length > PDF_CHUNK_CHAR_LIMIT) {
      chunks.push(currentChunk);
      currentChunk = headerLines + '\n\n';
    }
  }

  if (currentChunk.trim().length > headerLines.length + 10) {
    chunks.push(currentChunk);
  }

  return chunks.length > 0 ? chunks : [fullText];
}

async function callClaudeForPdfParse(
  pdfText: string,
): Promise<AiExtractedTransaction[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[importPipeline] ANTHROPIC_API_KEY not set');
    throw new Error('ANTHROPIC_API_KEY not configured — cannot parse PDF');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const AnthropicModule = await import('@anthropic-ai/sdk' as any);
  const Anthropic = AnthropicModule.default ?? AnthropicModule;
  const client = new Anthropic({ apiKey });

  const chunks = chunkPdfText(pdfText);
  console.log(`[importPipeline] PDF split into ${chunks.length} chunk(s) (total ${pdfText.length} chars)`);

  const allResults: AiExtractedTransaction[] = [];

  for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
    const chunk = chunks[chunkIdx];
    const prompt = buildPdfExtractionPrompt(chunk);
    console.log(`[importPipeline] Processing chunk ${chunkIdx + 1}/${chunks.length} (${chunk.length} chars)`);

    let chunkResults: AiExtractedTransaction[] | null = null;

    for (let attempt = 0; attempt <= PDF_MAX_RETRIES; attempt++) {
      try {
        console.log(`[importPipeline] Claude attempt ${attempt + 1}/${PDF_MAX_RETRIES + 1} for chunk ${chunkIdx + 1}`);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const response: any = await client.messages.create({
          model: PDF_PARSE_MODEL,
          max_tokens: 8192,
          system:
            'You are a precise financial document parser. Extract transactions as a compact JSON array. No explanation, no markdown — only valid JSON.',
          messages: [{ role: 'user', content: prompt }],
        });

        const stopReason = response.stop_reason;
        console.log(`[importPipeline] Claude responded — stop_reason: ${stopReason}, tokens: ${response.usage?.output_tokens ?? '?'}`);

        const rawText: string =
          response.content[0]?.type === 'text' ? response.content[0].text : '[]';

        let parsed: unknown[] | null = null;

        if (stopReason === 'max_tokens') {
          console.log('[importPipeline] Response truncated (max_tokens) — attempting recovery');
          parsed = recoverTruncatedJson(rawText);
          if (parsed) {
            console.log(`[importPipeline] Recovered ${parsed.length} transactions from truncated response`);
          }
        } else {
          const cleaned = rawText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
          const result = JSON.parse(cleaned);
          if (Array.isArray(result)) parsed = result;
        }

        if (!parsed || !Array.isArray(parsed)) {
          throw new Error('AI response is not a valid array');
        }

        // Normalise compact field names to full interface
        chunkResults = parsed
          .map((r) => normaliseAiRow(r as Record<string, unknown>))
          .filter((r): r is AiExtractedTransaction => r !== null);

        console.log(`[importPipeline] Chunk ${chunkIdx + 1}: extracted ${chunkResults.length} transactions`);
        break;
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const status = (err as any)?.status ?? 0;
        console.error(`[importPipeline] Chunk ${chunkIdx + 1} attempt ${attempt + 1} failed: status=${status} error=${errMsg}`);

        if ((status === 429 || status >= 500) && attempt < PDF_MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
          continue;
        }
        if (err instanceof SyntaxError && attempt < PDF_MAX_RETRIES) {
          continue;
        }

        if (chunks.length > 1) {
          console.log(`[importPipeline] Skipping failed chunk ${chunkIdx + 1}, continuing with remaining`);
          break;
        }
        throw err;
      }
    }

    if (chunkResults) {
      allResults.push(...chunkResults);
    }
  }

  console.log(`[importPipeline] Total AI-extracted transactions across all chunks: ${allResults.length}`);

  if (allResults.length === 0) {
    throw new Error('AI could not extract any transactions from the PDF');
  }

  return allResults;
}

const VALID_CURRENCIES = new Set(['NGN', 'USD', 'GBP', 'EUR']);

function aiResultsToParsedRows(aiRows: AiExtractedTransaction[]): ParsedRow[] {
  const results: ParsedRow[] = [];

  for (const row of aiRows) {
    try {
      const date = parseDate(row.date);
      if (!date) continue;

      const description = (row.description ?? '').trim();
      if (!description) continue;

      const rawAmount = typeof row.amount === 'number' ? row.amount : parseFloat(String(row.amount));
      if (!rawAmount || isNaN(rawAmount) || rawAmount <= 0) continue;

      const amountMinor = Math.round(rawAmount * 100);
      const direction: Direction = row.direction === 'credit' ? 'credit' : 'debit';
      const curRaw = (row.currency ?? 'NGN').toUpperCase();
      const currency: Currency = VALID_CURRENCIES.has(curRaw) ? (curRaw as Currency) : 'NGN';

      results.push({
        date,
        description,
        amount: amountMinor,
        currency,
        amountNgn: amountMinor,
        fxRate: 1,
        direction,
        type: 'uncategorised',
        externalRef: makeExternalRef(date, description, amountMinor, direction),
        taxYear: new Date(date).getUTCFullYear(),
      });
    } catch {
      // Skip malformed rows
    }
  }

  return results;
}

async function parsePDF(buffer: Buffer): Promise<ParsedRow[]> {
  const text = await extractPdfText(buffer);
  const aiRows = await callClaudeForPdfParse(text);
  return aiResultsToParsedRows(aiRows);
}

// ─────────────────────────────────────────────
// processImport action
// ─────────────────────────────────────────────

export const processImport = action({
  args: {
    jobId: v.id('importJobs'),
  },
  handler: async (ctx, { jobId }) => {
    console.log(`[importPipeline] processImport started for job ${jobId}`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const job = await ctx.runQuery((internal as any).importHelpers.getJob, { jobId });
    if (!job) throw new Error('Import job not found');

    const { entityId, userId, storageId, source } = job;
    console.log(`[importPipeline] Job details — source: ${source}, storageId: ${storageId}`);

    if (!storageId) {
      console.error('[importPipeline] No storageId on job');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await ctx.runMutation((internal as any).importHelpers.setJobFailed, {
        jobId,
        errorMessage: 'No file storageId on import job',
      });
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ctx.runMutation((internal as any).importHelpers.setJobProcessing, { jobId });

    let parsed: ParsedRow[] = [];
    let parseError: string | null = null;

    try {
      const blob = await ctx.storage.get(storageId);
      if (!blob) throw new Error('File not found in storage');

      const arrayBuf = await blob.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      console.log(`[importPipeline] File downloaded — ${buffer.length} bytes`);

      const isPdf =
        source === 'pdf' ||
        (buffer.length > 4 &&
          buffer[0] === 0x25 && // %
          buffer[1] === 0x50 && // P
          buffer[2] === 0x44 && // D
          buffer[3] === 0x46);  // F

      console.log(`[importPipeline] Format detected: ${isPdf ? 'PDF' : 'CSV'}`);

      if (isPdf) {
        parsed = await parsePDF(buffer);
      } else {
        const text = buffer.toString('utf-8');
        parsed = parseCSV(text);
      }

      console.log(`[importPipeline] Parsing complete — ${parsed.length} rows extracted`);
    } catch (err: unknown) {
      parseError = err instanceof Error ? err.message : String(err);
      console.error(`[importPipeline] Parse error: ${parseError}`);
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

    const totalParsed = parsed.length;
    console.log(`[importPipeline] Total parsed: ${totalParsed}`);

    // Insert parsed transactions in chunks to stay within Convex mutation limits.
    const IMPORT_CHUNK_SIZE = 100;
    let totalImported = 0;
    let duplicatesSkipped = 0;
    let insertError: string | null = null;

    try {
      for (let i = 0; i < parsed.length; i += IMPORT_CHUNK_SIZE) {
        const chunk = parsed.slice(i, i + IMPORT_CHUNK_SIZE);
        console.log(`[importPipeline] Inserting chunk ${Math.floor(i / IMPORT_CHUNK_SIZE) + 1} (${chunk.length} transactions)…`);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await ctx.runMutation((internal as any).importHelpers.batchInsert, {
          jobId,
          entityId,
          userId,
          transactions: chunk,
        });
        totalImported += result.totalImported;
        duplicatesSkipped += result.duplicatesSkipped;
      }
      console.log(`[importPipeline] Insert complete — imported: ${totalImported}, duplicates: ${duplicatesSkipped}`);
    } catch (err: unknown) {
      insertError = err instanceof Error ? err.message : String(err);
      console.error(`[importPipeline] Insert error: ${insertError}`);
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

    // Mark import complete
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ctx.runMutation((internal as any).importHelpers.setJobComplete, {
      jobId,
      totalParsed,
      totalImported,
      duplicatesSkipped,
    });

    // ─── Rule-Based Categorisation ──────────────────────────────────────
    // Instant, zero API calls.  Applies high-confidence pattern matches to
    // newly imported transactions.  Remaining uncategorised transactions
    // surface in the triage queue where the user can opt-in to AI.
    if (totalImported > 0) {
      try {
        console.log(`[importPipeline] Running rule-based categorisation on ${totalImported} imported transactions…`);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ruleResult = await ctx.runMutation((internal as any).importHelpers.categoriseImportByRules, {
          importJobId: jobId,
          entityId,
        }) as { total: number; categorised: number };
        console.log(`[importPipeline] Rule-based categorisation complete — ${ruleResult.categorised}/${ruleResult.total} categorised`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[importPipeline] Rule-based categorisation failed: ${msg}`);
      }
    }
  },
});
