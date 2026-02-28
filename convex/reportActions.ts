"use node";
/**
 * TaxEase Nigeria — Report Export Actions (PRD-7)
 *
 * Exports:
 *   exportCsv  — generates CSV (UTF-8 BOM, ISO 8601 dates) for income / expenses / year-on-year tabs
 *   exportPdf  — calls NestJS /pdf/report, stores result in Convex Storage, returns download URL
 *
 * Required env vars for PDF export:
 *   NESTJS_PDF_SERVICE_URL  — base URL of NestJS PDF microservice
 */

import { action } from './_generated/server';
import { internal, api } from './_generated/api';
import { v } from 'convex/values';

// ─────────────────────────────────────────────────────────────────────────────
// Config helpers
// ─────────────────────────────────────────────────────────────────────────────

function getPdfServiceUrl(): string {
  return process.env.NESTJS_PDF_SERVICE_URL ?? 'http://localhost:3001';
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV helpers
// ─────────────────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Escape a single CSV cell value (RFC 4180). */
function esc(value: string | number | boolean | null | undefined): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Convert kobo integer to formatted Naira string (2 d.p.). */
function koboToNaira(kobo: number): string {
  return (kobo / 100).toFixed(2);
}

/**
 * Build income CSV.
 * Columns: Date, Description, Category, Amount (NGN), Currency,
 *          Original Amount, FX Rate, WHT Deducted (NGN)
 */
function buildIncomeCSV(rows: Array<{
  date: string;
  description: string;
  category: string;
  amountNgn: number;
  currency: string;
  originalAmount: number;
  fxRate: number;
  whtDeducted: number;
}>): string {
  const BOM = '\uFEFF';
  const header = [
    'Date', 'Description', 'Category',
    'Amount (NGN)', 'Currency', 'Original Amount',
    'FX Rate', 'WHT Deducted (NGN)',
  ].map(esc).join(',');

  const lines = [header];
  for (const r of rows) {
    lines.push([
      esc(r.date),
      esc(r.description),
      esc(r.category),
      esc(koboToNaira(r.amountNgn)),
      esc(r.currency),
      esc(koboToNaira(r.originalAmount)),
      esc(r.fxRate),
      esc(koboToNaira(r.whtDeducted)),
    ].join(','));
  }

  return BOM + lines.join('\r\n');
}

/**
 * Build expenses CSV.
 * Columns: Date, Description, Category, Type, Amount (NGN),
 *          Deductible, Deductible Amount (NGN), Currency
 */
function buildExpensesCSV(rows: Array<{
  date: string;
  description: string;
  category: string;
  type: string;
  amountNgn: number;
  isDeductible: boolean;
  deductibleAmountNgn: number;
  currency: string;
}>): string {
  const BOM = '\uFEFF';
  const header = [
    'Date', 'Description', 'Category', 'Type',
    'Amount (NGN)', 'Deductible', 'Deductible Amount (NGN)', 'Currency',
  ].map(esc).join(',');

  const lines = [header];
  for (const r of rows) {
    lines.push([
      esc(r.date),
      esc(r.description),
      esc(r.category),
      esc(r.type),
      esc(koboToNaira(r.amountNgn)),
      esc(r.isDeductible ? 'Yes' : 'No'),
      esc(koboToNaira(r.deductibleAmountNgn)),
      esc(r.currency),
    ].join(','));
  }

  return BOM + lines.join('\r\n');
}

/**
 * Build year-on-year CSV.
 * Columns: Month, Income {currentYear} (NGN), Income {priorYear} (NGN),
 *          Income Change (%), Expenses {cy} (NGN), Expenses {py} (NGN),
 *          Expenses Change (%)
 */
function buildYoyCSV(yoy: {
  currentYear: number;
  priorYear: number;
  currentMonthlyIncome: Array<{ month: number; amount: number }>;
  priorMonthlyIncome: Array<{ month: number; amount: number }>;
  currentMonthlyExpenses: Array<{ month: number; amount: number }>;
  priorMonthlyExpenses: Array<{ month: number; amount: number }>;
}): string {
  const BOM = '\uFEFF';
  const cy = yoy.currentYear;
  const py = yoy.priorYear;
  const header = [
    'Month',
    `Income ${cy} (NGN)`,
    `Income ${py} (NGN)`,
    'Income Change (%)',
    `Expenses ${cy} (NGN)`,
    `Expenses ${py} (NGN)`,
    'Expenses Change (%)',
  ].map(esc).join(',');

  const lines = [header];
  for (let i = 0; i < 12; i++) {
    const cInc = yoy.currentMonthlyIncome[i]?.amount ?? 0;
    const pInc = yoy.priorMonthlyIncome[i]?.amount ?? 0;
    const cExp = yoy.currentMonthlyExpenses[i]?.amount ?? 0;
    const pExp = yoy.priorMonthlyExpenses[i]?.amount ?? 0;
    const incChange = pInc === 0 ? '' : ((cInc - pInc) / pInc * 100).toFixed(1);
    const expChange = pExp === 0 ? '' : ((cExp - pExp) / pExp * 100).toFixed(1);
    lines.push([
      esc(MONTH_NAMES[i]),
      esc(koboToNaira(cInc)),
      esc(koboToNaira(pInc)),
      esc(incChange),
      esc(koboToNaira(cExp)),
      esc(koboToNaira(pExp)),
      esc(expChange),
    ].join(','));
  }

  return BOM + lines.join('\r\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// exportCsv — public action
// ─────────────────────────────────────────────────────────────────────────────

export const exportCsv = action({
  args: {
    entityId: v.id('entities'),
    tab: v.union(
      v.literal('income'),
      v.literal('expenses'),
      v.literal('yearOnYear')
    ),
    taxYear: v.optional(v.number()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { entityId, tab, taxYear, startDate, endDate } = args;

    if (tab === 'income') {
      const rows = await ctx.runQuery(
        (internal as any).reports._getIncomeRows,
        { entityId, taxYear, startDate, endDate }
      );
      if (!rows) throw new Error('Unauthorised or entity not found');
      const csvContent = buildIncomeCSV(rows);
      const filename = `income_report_${taxYear ?? 'all'}.csv`;
      return { csvContent, filename };
    }

    if (tab === 'expenses') {
      const rows = await ctx.runQuery(
        (internal as any).reports._getExpenseRows,
        { entityId, taxYear, startDate, endDate }
      );
      if (!rows) throw new Error('Unauthorised or entity not found');
      const csvContent = buildExpensesCSV(rows);
      const filename = `expenses_report_${taxYear ?? 'all'}.csv`;
      return { csvContent, filename };
    }

    // yearOnYear
    const yoy = await ctx.runQuery(
      (api as any).reports.getYearOnYear,
      { entityId, currentYear: taxYear }
    );
    if (!yoy) throw new Error('Unauthorised or entity not found');
    const csvContent = buildYoyCSV(yoy as any);
    const filename = `year_on_year_${yoy.currentYear}_vs_${yoy.priorYear}.csv`;
    return { csvContent, filename };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// exportPdf — public action
// ─────────────────────────────────────────────────────────────────────────────

export const exportPdf = action({
  args: {
    entityId: v.id('entities'),
    taxYear: v.optional(v.number()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { entityId, taxYear, startDate, endDate } = args;

    // Fetch all summary data (validates entity ownership via each query)
    const [income, expenses, yoy] = await Promise.all([
      ctx.runQuery((api as any).reports.getIncome, {
        entityId, taxYear, startDate, endDate,
      }),
      ctx.runQuery((api as any).reports.getExpenses, {
        entityId, taxYear, startDate, endDate,
      }),
      ctx.runQuery((api as any).reports.getYearOnYear, {
        entityId, currentYear: taxYear,
      }),
    ]);

    if (!income || !expenses) {
      throw new Error('Unauthorised or entity not found');
    }

    // Convert kobo → Naira for PDF display
    function k(kobo: number) {
      return kobo / 100;
    }

    const period =
      taxYear
        ? String(taxYear)
        : startDate && endDate
          ? `${startDate} to ${endDate}`
          : 'All time';

    const payload: Record<string, unknown> = {
      type: 'report',
      period,
      income: {
        totalIncome: k(income.totalIncome),
        foreignIncome: k(income.foreignIncome),
        averageMonthlyIncome: k(income.averageMonthlyIncome),
        monthlyBreakdown: income.monthlyBreakdown.map(
          (m: { month: number; amount: number }) => ({
            month: m.month,
            amount: k(m.amount),
          })
        ),
        categoryBreakdown: income.categoryBreakdown.map(
          (c: { categoryName: string; amount: number; percentage: number }) => ({
            categoryName: c.categoryName,
            amount: k(c.amount),
            percentage: c.percentage,
          })
        ),
      },
      expenses: {
        totalExpenses: k(expenses.totalExpenses),
        deductibleExpenses: k(expenses.deductibleExpenses),
        nonDeductibleExpenses: k(expenses.nonDeductibleExpenses),
        monthlyBreakdown: expenses.monthlyBreakdown.map(
          (m: { month: number; amount: number }) => ({
            month: m.month,
            amount: k(m.amount),
          })
        ),
        categoryBreakdown: expenses.categoryBreakdown.map(
          (c: {
            categoryName: string;
            amount: number;
            isDeductible: boolean;
            percentage: number;
          }) => ({
            categoryName: c.categoryName,
            amount: k(c.amount),
            isDeductible: c.isDeductible,
            percentage: c.percentage,
          })
        ),
      },
    };

    if (yoy) {
      payload.yearOnYear = {
        currentYear: yoy.currentYear,
        priorYear: yoy.priorYear,
        currentIncome: k(yoy.currentIncome),
        priorIncome: k(yoy.priorIncome),
        incomeChange: yoy.incomeChange,
        currentExpenses: k(yoy.currentExpenses),
        priorExpenses: k(yoy.priorExpenses),
        expensesChange: yoy.expensesChange,
        currentTaxPayable: k(yoy.currentTaxPayable),
        priorTaxPayable: k(yoy.priorTaxPayable),
        taxPayableChange: yoy.taxPayableChange,
        currentMonthlyIncome: yoy.currentMonthlyIncome.map(
          (m: { month: number; amount: number }) => ({
            month: m.month,
            amount: k(m.amount),
          })
        ),
        priorMonthlyIncome: yoy.priorMonthlyIncome.map(
          (m: { month: number; amount: number }) => ({
            month: m.month,
            amount: k(m.amount),
          })
        ),
      };
    }

    // ---- Call NestJS /pdf/report ----
    const serviceUrl = getPdfServiceUrl();
    const response = await fetch(`${serviceUrl}/pdf/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '(no body)');
      throw new Error(
        `PDF service responded with ${response.status}: ${errText}`
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const pdfBuffer = Buffer.from(arrayBuffer);

    // ---- Store in Convex Storage ----
    const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
    const storageId = await ctx.storage.store(blob);

    // ---- Return signed download URL ----
    const downloadUrl = await ctx.storage.getUrl(storageId);
    if (!downloadUrl) throw new Error('Failed to generate download URL');

    return { storageId, downloadUrl };
  },
});
