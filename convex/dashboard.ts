/**
 * TaxEase Nigeria — Dashboard Aggregation Queries (PRD-5)
 *
 * Exports:
 *   getSummary            — tax position + quick stats + invoice activity
 *   getRecentTransactions — last 5 transactions with resolved category data
 *   getDeadlines          — filing deadline countdown + compliance reminders
 *
 * All queries use indexed reads — no full-collection scans.
 * All queries are reactive via Convex live queries.
 */

import { query } from './_generated/server';
import { v } from 'convex/values';
import { getCurrentUser } from './auth';
import {
  getEngineForYear,
  runTaxEngine,
  type TaxEngineCapitalDisposal,
  type TaxEngineTransaction,
} from './taxEngine';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DeadlineSeverity = 'safe' | 'warning' | 'danger';

export interface TaxPosition {
  estimatedLiabilityKobo: number;
  effectiveTaxRate: number;
  /** True when data comes from cached taxYearSummaries; false = live estimate */
  isCached: boolean;
  minimumTaxApplied: boolean;
}

export interface InvoiceStats {
  outstandingAmountKobo: number;
  outstandingCount: number;
  overdueCount: number;
  sentThisMonthCount: number;
  hasInvoices: boolean;
}

export interface DashboardSummary {
  entityId: string;
  entityName: string;
  entityType: 'individual' | 'business_name' | 'llc';
  vatRegistered: boolean;
  taxYear: number;
  /** Income YTD in kobo (sum of amountNgn for direction=credit) */
  incomeYtdKobo: number;
  /** Expenses YTD in kobo (sum of amountNgn for direction=debit) */
  expensesYtdKobo: number;
  /** Aggregate WHT credits in kobo */
  whtCreditsKobo: number;
  /** Deductible expenses used in tax computation */
  deductibleBusinessExpensesKobo: number;
  uncategorisedCount: number;
  /** Sum of uncategorised credit transactions in kobo */
  uncategorisedInflowKobo: number;
  /** Sum of uncategorised debit transactions in kobo */
  uncategorisedOutflowKobo: number;
  taxPosition: TaxPosition;
  invoiceStats: InvoiceStats;
  hasTransactions: boolean;
  hasInvoices: boolean;
}

export interface RecentTransaction {
  _id: string;
  date: number;
  description: string;
  amountNgn: number;
  direction: 'credit' | 'debit';
  type: string;
  categoryName: string | null;
  categoryColor: string | null;
  categoryIcon: string | null;
  currency: string;
  taxYear: number;
}

export interface DeadlineCountdown {
  /** Unix timestamp (ms) for the deadline */
  deadlineMs: number;
  /** Days remaining (negative if past) */
  daysRemaining: number;
  severity: DeadlineSeverity;
  label: string;
}

export interface DeadlineReminder {
  id: string;
  type: 'self_assessment' | 'vat_return' | 'overdue_invoice';
  label: string;
  dueDate: number;
  severity: DeadlineSeverity;
  actionPath?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSeverity(daysRemaining: number): DeadlineSeverity {
  if (daysRemaining > 30) return 'safe';
  if (daysRemaining >= 15) return 'warning';
  return 'danger';
}

function getTaxFilingDeadlineMs(taxYear: number): number {
  // NTA 2025: self-assessment returns due March 31 of the following year
  return new Date(taxYear + 1, 2, 31, 23, 59, 59, 999).getTime();
}

function getVatDeadlineMs(): number {
  // VAT returns: monthly, due last day of following month.
  // Return next upcoming VAT deadline from current date.
  const now = new Date();
  const year = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
  const month = (now.getMonth() + 1) % 12; // next month (0-indexed)
  const lastDay = new Date(year, month + 1, 0); // last day of that month
  return lastDay.getTime();
}

// ---------------------------------------------------------------------------
// getSummary
// ---------------------------------------------------------------------------

/**
 * Dashboard aggregation query.
 *
 * Reads data using indexed queries only:
 *   - transactions: by_entityId_taxYear (income/WHT/uncategorised stats)
 *   - taxYearSummaries: by_entityId_taxYear (cached tax position)
 *   - invoices: by_entityId_status (outstanding, overdue, sent this month)
 */
export const getSummary = query({
  args: {
    entityId: v.id('entities'),
    taxYear: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<DashboardSummary | null> => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const entity = await ctx.db.get(args.entityId);
    if (!entity || entity.userId !== user._id || entity.deletedAt) return null;

    const taxYear = args.taxYear ?? new Date().getFullYear();

    // ---- 1. Transaction aggregations (by_entityId_taxYear index) ----
    const transactions = await ctx.db
      .query('transactions')
      .withIndex('by_entityId_taxYear', (q) =>
        q.eq('entityId', args.entityId).eq('taxYear', taxYear)
      )
      .collect();

    let incomeYtdKobo = 0;
    let expensesYtdKobo = 0;
    let whtCreditsKobo = 0;
    let deductibleBusinessExpensesKobo = 0;
    let uncategorisedCount = 0;
    let uncategorisedInflowKobo = 0;
    let uncategorisedOutflowKobo = 0;

    for (const t of transactions) {
      if (t.direction === 'credit') {
        incomeYtdKobo += t.amountNgn;
        if (t.whtDeducted) whtCreditsKobo += t.whtDeducted;
      } else {
        expensesYtdKobo += t.amountNgn;
      }
      if (t.type === 'uncategorised') {
        uncategorisedCount++;
        if (t.direction === 'credit') {
          uncategorisedInflowKobo += t.amountNgn;
        } else {
          uncategorisedOutflowKobo += t.amountNgn;
        }
      }
    }

    const hasTransactions = transactions.length > 0;

    // ---- 2. Tax position: prefer cached summary, else live estimate ----
    const cachedSummary = await ctx.db
      .query('taxYearSummaries')
      .withIndex('by_entityId_taxYear', (q) =>
        q.eq('entityId', args.entityId).eq('taxYear', taxYear)
      )
      .first();

    let taxPosition: TaxPosition;
    const currentEngineVersion = getEngineForYear(taxYear);
    if (cachedSummary && cachedSummary.engineVersion === currentEngineVersion) {
      deductibleBusinessExpensesKobo = cachedSummary.totalBusinessExpenses;
      taxPosition = {
        estimatedLiabilityKobo: cachedSummary.totalTaxPayable,
        effectiveTaxRate: cachedSummary.effectiveTaxRate,
        isCached: true,
        minimumTaxApplied: cachedSummary.minimumTaxApplied,
      };
    } else {
      // No up-to-date cache: run the same tax engine used by Tax Summary so dashboard remains consistent.
      const declaration = await ctx.db
        .query('taxDeclarations')
        .withIndex('by_entityId_taxYear', (q) =>
          q.eq('entityId', args.entityId).eq('taxYear', taxYear)
        )
        .first();

      const rawDisposals = await ctx.db
        .query('capitalDisposals')
        .withIndex('by_entityId_taxYear', (q) =>
          q.eq('entityId', args.entityId).eq('taxYear', taxYear)
        )
        .collect();

      const engineTransactions: TaxEngineTransaction[] = transactions.map((t) => ({
        type: t.type,
        direction: t.direction,
        amountNgn: t.amountNgn,
        currency: t.currency,
        isDeductible: t.isDeductible,
        deductiblePercent: t.deductiblePercent,
        whtDeducted: t.whtDeducted,
        isVatInclusive: (t as any).isVatInclusive,
      }));

      const engineDisposals: TaxEngineCapitalDisposal[] = rawDisposals.map((d) => ({
        acquisitionCostNgn: d.acquisitionCostNgn,
        disposalProceedsNgn: d.disposalProceedsNgn,
        isExempt: d.isExempt,
        exemptionReason: d.exemptionReason,
      }));

      const result = runTaxEngine({
        transactions: engineTransactions,
        declarations: declaration ?? null,
        entityType: entity.type,
        taxYear,
        capitalDisposals: engineDisposals,
        isVatRegistered: entity.vatRegistered ?? false,
        outputVatNgn: 0,
      });

      deductibleBusinessExpensesKobo = result.totalBusinessExpenses;

      taxPosition = {
        estimatedLiabilityKobo: result.totalTaxPayable,
        effectiveTaxRate: result.effectiveTaxRate,
        isCached: false,
        minimumTaxApplied: result.minimumTaxApplied,
      };
    }

    // ---- 3. Invoice stats (by_entityId_status index) ----
    // Query sent invoices
    const sentInvoices = await ctx.db
      .query('invoices')
      .withIndex('by_entityId_status', (q) =>
        q.eq('entityId', args.entityId).eq('status', 'sent')
      )
      .collect();

    // Query overdue invoices
    const overdueInvoices = await ctx.db
      .query('invoices')
      .withIndex('by_entityId_status', (q) =>
        q.eq('entityId', args.entityId).eq('status', 'overdue')
      )
      .collect();

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const monthStartMs = startOfMonth.getTime();

    // Outstanding = sent + overdue
    const outstandingInvoices = [...sentInvoices, ...overdueInvoices];
    const outstandingAmountKobo = outstandingInvoices.reduce(
      (sum, inv) => sum + inv.amountNgn,
      0
    );

    // Sent this month (issueDate in current calendar month)
    const sentThisMonthCount = sentInvoices.filter(
      (inv) => inv.issueDate >= monthStartMs
    ).length;

    // hasInvoices: check if any invoice exists at all for this entity
    const anyInvoice = await ctx.db
      .query('invoices')
      .withIndex('by_userId', (q) => q.eq('userId', user._id))
      .first();
    const hasInvoices = anyInvoice !== null;

    const invoiceStats: InvoiceStats = {
      outstandingAmountKobo,
      outstandingCount: outstandingInvoices.length,
      overdueCount: overdueInvoices.length,
      sentThisMonthCount,
      hasInvoices,
    };

    return {
      entityId: args.entityId,
      entityName: entity.name,
      entityType: entity.type,
      vatRegistered: entity.vatRegistered ?? false,
      taxYear,
      incomeYtdKobo,
      expensesYtdKobo,
      whtCreditsKobo,
      deductibleBusinessExpensesKobo,
      uncategorisedCount,
      uncategorisedInflowKobo,
      uncategorisedOutflowKobo,
      taxPosition,
      invoiceStats,
      hasTransactions,
      hasInvoices,
    };
  },
});

// ---------------------------------------------------------------------------
// getRecentTransactions
// ---------------------------------------------------------------------------

/**
 * Returns the 5 most recent transactions for an entity, with resolved
 * category names and colours.
 *
 * Uses by_entityId_date index ordered descending.
 */
export const getRecentTransactions = query({
  args: {
    entityId: v.id('entities'),
    taxYear: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<RecentTransaction[]> => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const entity = await ctx.db.get(args.entityId);
    if (!entity || entity.userId !== user._id || entity.deletedAt) return [];

    const taxYear = args.taxYear;

    // Fetch last 5 transactions by date descending, optionally filtered by taxYear
    const allRecent = await ctx.db
      .query('transactions')
      .withIndex('by_entityId_date', (q) => q.eq('entityId', args.entityId))
      .order('desc')
      .take(50);

    // Filter by taxYear if provided, then take first 5
    const transactions = taxYear
      ? allRecent.filter((t) => t.taxYear === taxYear).slice(0, 5)
      : allRecent.slice(0, 5);

    // Resolve category data
    const categoryCache = new Map<string, { name: string; color: string | null; icon: string | null }>();

    const result: RecentTransaction[] = [];
    for (const t of transactions) {
      let categoryName: string | null = null;
      let categoryColor: string | null = null;
      let categoryIcon: string | null = null;

      if (t.categoryId) {
        const cid = t.categoryId as string;
        if (!categoryCache.has(cid)) {
          const cat = await ctx.db.get(t.categoryId);
          if (cat) {
            categoryCache.set(cid, {
              name: cat.name,
              color: cat.color ?? null,
              icon: cat.icon ?? null,
            });
          }
        }
        const cached = categoryCache.get(cid);
        if (cached) {
          categoryName = cached.name;
          categoryColor = cached.color;
          categoryIcon = cached.icon;
        }
      }

      result.push({
        _id: t._id as string,
        date: t.date,
        description: t.description,
        amountNgn: t.amountNgn,
        direction: t.direction,
        type: t.type,
        categoryName,
        categoryColor,
        categoryIcon,
        currency: t.currency,
        taxYear: t.taxYear,
      });
    }

    return result;
  },
});

// ---------------------------------------------------------------------------
// getDeadlines
// ---------------------------------------------------------------------------

/**
 * Returns the filing deadline countdown and compliance reminders.
 *
 * Filing deadline: March 31 (NTA 2025 self-assessment)
 * VAT deadline: end of following month (monthly filers)
 * Overdue invoices reminder: when overdueCount > 0
 */
export const getDeadlines = query({
  args: {
    entityId: v.id('entities'),
    taxYear: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    deadlineCountdown: DeadlineCountdown;
    reminders: DeadlineReminder[];
  } | null> => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const entity = await ctx.db.get(args.entityId);
    if (!entity || entity.userId !== user._id || entity.deletedAt) return null;

    const taxYear = args.taxYear ?? new Date().getFullYear();
    const now = Date.now();

    // ---- Filing deadline countdown ----
    const deadlineMs = getTaxFilingDeadlineMs(taxYear);
    const daysRemaining = Math.ceil((deadlineMs - now) / (1000 * 60 * 60 * 24));
    const deadlineSeverity = getSeverity(daysRemaining);

    const deadlineCountdown: DeadlineCountdown = {
      deadlineMs,
      daysRemaining,
      severity: deadlineSeverity,
      label: `${taxYear} self-assessment due March 31, ${taxYear + 1}`,
    };

    // ---- Compliance reminders ----
    const reminders: DeadlineReminder[] = [];

    // 1. Self-assessment reminder
    reminders.push({
      id: `self-assessment-${taxYear}`,
      type: 'self_assessment',
      label: `File ${taxYear} self-assessment by March 31, ${taxYear + 1}`,
      dueDate: deadlineMs,
      severity: deadlineSeverity,
      actionPath: '/app/tax',
    });

    // 2. VAT return reminder (only if VAT-registered)
    if (entity.vatRegistered) {
      const vatDueMs = getVatDeadlineMs();
      const vatDays = Math.ceil((vatDueMs - now) / (1000 * 60 * 60 * 24));
      const vatSeverity = getSeverity(vatDays);
      const vatDate = new Date(vatDueMs);
      const vatMonthLabel = vatDate.toLocaleString('default', { month: 'long', year: 'numeric' });
      reminders.push({
        id: `vat-return-${vatDate.getFullYear()}-${vatDate.getMonth()}`,
        type: 'vat_return',
        label: `VAT return due ${vatMonthLabel}`,
        dueDate: vatDueMs,
        severity: vatSeverity,
        actionPath: '/app/tax',
      });
    }

    // 3. Overdue invoices reminder (by_entityId_status index)
    const overdueInvoices = await ctx.db
      .query('invoices')
      .withIndex('by_entityId_status', (q) =>
        q.eq('entityId', args.entityId).eq('status', 'overdue')
      )
      .collect();

    if (overdueInvoices.length > 0) {
      // Find the most overdue invoice due date
      const oldestDue = overdueInvoices.reduce(
        (min, inv) => Math.min(min, inv.dueDate),
        Infinity
      );
      reminders.push({
        id: `overdue-invoices-${args.entityId}`,
        type: 'overdue_invoice',
        label: `${overdueInvoices.length} overdue invoice${overdueInvoices.length > 1 ? 's' : ''} — action required`,
        dueDate: oldestDue,
        severity: 'danger',
        actionPath: '/app/invoices?status=overdue',
      });
    }

    return { deadlineCountdown, reminders };
  },
});
