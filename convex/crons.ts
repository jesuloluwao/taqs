import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();

/**
 * Daily at 07:00 WAT (06:00 UTC): auto-generate draft invoices from recurring templates.
 *
 * Finds invoices where isRecurring=true AND nextIssueDate ≤ now, clones each
 * with a fresh sequential invoice number and updated dates, then advances the
 * template's nextIssueDate by its recurringInterval (monthly or quarterly).
 */
crons.daily(
  'generateRecurringInvoices',
  { hourUTC: 6, minuteUTC: 0 },
  (internal as any).invoices._generateRecurring
);

/**
 * Daily at 09:00 WAT (08:00 UTC): mark overdue invoices.
 *
 * Finds all invoices with status='sent' whose dueDate is in the past and
 * transitions them to status='overdue'.
 */
crons.daily(
  'checkOverdueInvoices',
  { hourUTC: 8, minuteUTC: 0 },
  (internal as any).invoices._checkOverdue
);

export default crons;
