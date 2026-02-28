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

/**
 * Hourly: delete expired oauthStates entries.
 *
 * OAuth state tokens have a 10-minute TTL; this job removes any that
 * were never consumed (e.g. user abandoned the OAuth flow).
 */
crons.hourly(
  'cleanupExpiredOauthStates',
  { minuteUTC: 5 },
  (internal as any).oauthStates._cleanupExpired
);

/**
 * Every 6 hours: sync all active connected bank/payment accounts.
 *
 * Queries all accounts with status='active' and an access token, then
 * fetches new transactions from each provider since lastSyncedAt.
 * Syncs are staggered by 2 seconds to respect provider rate limits.
 *
 * Schedule: 00:10, 06:10, 12:10, 18:10 UTC (offset by :10 to avoid
 * peak API load at the top of the hour).
 */
crons.interval(
  'scheduledBankSync',
  { hours: 6 },
  (internal as any).accountsActions.runScheduledSync
);

// ============================================================
// PRD-9 Notification cron jobs
// ============================================================

/**
 * Daily 08:00 WAT (07:00 UTC): check self-assessment filing deadlines.
 *
 * Fires on milestone days [30, 14, 7, 3, 1] before 31 March. Sends one
 * notification per entity whose user has enabled deadline reminders.
 * Message templates include ₦100k filing penalty + ₦50k/month delay penalty.
 */
crons.daily(
  'checkFilingDeadline',
  { hourUTC: 7, minuteUTC: 0 },
  (internal as any).reminders.checkFilingDeadline
);

/**
 * Daily 08:00 WAT (07:00 UTC): check monthly VAT return deadline.
 *
 * Fires on days [7, 3, 1] before the 21st of the month for VAT-registered
 * entities whose users have vatReminderEnabled=true.
 * Message templates include ₦50k late VAT penalty.
 */
crons.daily(
  'checkVatDeadline',
  { hourUTC: 7, minuteUTC: 0 },
  (internal as any).reminders.checkVatDeadline
);

/**
 * Daily 10:00 WAT (09:00 UTC): uncategorised transaction alert (daily cadence).
 *
 * Notifies users with uncategorisedAlertFrequency='daily' about entities
 * that have uncategorised transactions. Deduplication prevents repeat
 * notifications within the same calendar day.
 */
crons.daily(
  'uncategorisedAlert',
  { hourUTC: 9, minuteUTC: 0 },
  (internal as any).reminders.uncategorisedAlert
);

/**
 * Mondays 10:00 WAT (09:00 UTC): uncategorised transaction alert (weekly cadence).
 *
 * Same logic as uncategorisedAlert but for users with
 * uncategorisedAlertFrequency='weekly'. Runs once per week on Monday mornings.
 */
crons.weekly(
  'uncategorisedAlertWeekly',
  { dayOfWeek: 'monday', hourUTC: 9, minuteUTC: 0 },
  (internal as any).reminders.uncategorisedAlertWeekly
);

/**
 * Sundays 02:00 WAT (01:00 UTC): clean up old notification records.
 *
 * Deletes read notifications older than 90 days and unread notifications
 * older than 180 days, processing up to 100 records per run.
 */
crons.weekly(
  'notificationsCleanup',
  { dayOfWeek: 'sunday', hourUTC: 1, minuteUTC: 0 },
  (internal as any).notifications.cleanup
);

export default crons;
