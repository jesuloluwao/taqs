import { internalMutation } from './_generated/server';
import { internal } from './_generated/api';

/** Standard filing deadline reminder milestones (days before March 31) */
const FILING_MILESTONES = [30, 14, 7, 3, 1];

/** VAT deadline reminder milestones (days before 21st of month) */
const VAT_MILESTONES = [7, 3, 1];

/** Returns Unix ms for start of today at midnight UTC */
function todayStartMs(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

/** Calculates whole days from today (UTC midnight) to a target date */
function daysUntilDateUtc(year: number, month: number, day: number): number {
  const targetMs = Date.UTC(year, month, day);
  return Math.round((targetMs - todayStartMs()) / 86400000);
}

/**
 * Checks whether a notification of the same type+userId+entityId was already
 * created today. Uses the by_userId_type index for efficiency.
 */
async function isDuplicate(
  ctx: any,
  userId: any,
  type: string,
  entityId: string,
  todayStart: number
): Promise<boolean> {
  const existing = await ctx.db
    .query('notifications')
    .withIndex('by_userId_type', (q: any) => q.eq('userId', userId).eq('type', type))
    .filter((q: any) =>
      q.and(
        q.gte(q.field('_creationTime'), todayStart),
        q.eq(q.field('entityId'), entityId)
      )
    )
    .first();
  return !!existing;
}

/**
 * Inserts a notification record and optionally schedules a push delivery
 * if the user has push notifications enabled.
 */
async function insertNotification(
  ctx: any,
  userId: any,
  type: string,
  title: string,
  body: string,
  entityId: string,
  pushEnabled: boolean
): Promise<void> {
  const notificationId = await ctx.db.insert('notifications', {
    userId,
    type,
    title,
    body,
    entityId,
    read: false,
  });

  if (pushEnabled) {
    await ctx.scheduler.runAfter(0, (internal as any).push.send, {
      userId,
      title,
      body,
      data: { notificationId, type, entityId },
    });
  }
}

/**
 * Daily 08:00 WAT (07:00 UTC): checks each user's self-assessment filing deadline.
 *
 * Fires on standard milestone days [30, 14, 7, 3, 1] that are ≤ the user's
 * configured deadlineReminderDays preference (default 30). Creates one
 * notification per entity per milestone day with penalty-aware messaging.
 *
 * Penalties (NTA 2025):
 *   – Late filing:  ₦100,000 one-off penalty
 *   – Late payment: ₦50,000 per month of continued non-compliance
 */
export const checkFilingDeadline = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = new Date();
    const year = now.getUTCFullYear();

    // NTA 2025 filing deadline: 31 March each year
    let daysUntil = daysUntilDateUtc(year, 2, 31); // month index 2 = March
    if (daysUntil < 0) {
      // Already past this year's deadline — use next year's
      daysUntil = daysUntilDateUtc(year + 1, 2, 31);
    }

    if (!FILING_MILESTONES.includes(daysUntil)) return;

    const todayStart = todayStartMs();
    const allPrefs = await ctx.db.query('userPreferences').collect();

    for (const pref of allPrefs) {
      const reminderDays: number = pref.deadlineReminderDays ?? 30;
      // Only notify if today's milestone falls within the user's reminder window
      if (daysUntil > reminderDays) continue;

      const entities = await ctx.db
        .query('entities')
        .withIndex('by_userId', (q: any) => q.eq('userId', pref.userId))
        .collect();

      const activeEntities = entities.filter((e: any) => !e.deletedAt);

      for (const entity of activeEntities) {
        const entityIdStr = entity._id as string;

        if (await isDuplicate(ctx, pref.userId, 'filing_deadline', entityIdStr, todayStart)) {
          continue;
        }

        const dayLabel = daysUntil === 1 ? '1 Day' : `${daysUntil} Days`;
        const title = `Tax Return Due in ${dayLabel}`;
        const body =
          `Your self-assessment return for ${entity.name} is due on 31 March. ` +
          `Filing late attracts a ₦100,000 penalty plus ₦50,000 per month of delay.`;

        await insertNotification(
          ctx,
          pref.userId,
          'filing_deadline',
          title,
          body,
          entityIdStr,
          !!pref.pushEnabled
        );
      }
    }
  },
});

/**
 * Daily 08:00 WAT (07:00 UTC): checks monthly VAT return deadline.
 *
 * VAT returns are due on the 21st of each month. Fires on milestone days
 * [7, 3, 1] before the 21st, but only for users with vatReminderEnabled=true
 * and entities where vatRegistered=true.
 *
 * Penalty (NTA 2025):
 *   – Late VAT filing: ₦50,000 penalty
 */
export const checkVatDeadline = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = new Date();
    const todayDay = now.getUTCDate();

    // Days remaining until the 21st of the current month
    const daysUntilVat = 21 - todayDay;

    if (!VAT_MILESTONES.includes(daysUntilVat)) return;

    const todayStart = todayStartMs();
    const allPrefs = await ctx.db.query('userPreferences').collect();

    for (const pref of allPrefs) {
      if (!pref.vatReminderEnabled) continue;

      const entities = await ctx.db
        .query('entities')
        .withIndex('by_userId', (q: any) => q.eq('userId', pref.userId))
        .collect();

      const vatEntities = entities.filter(
        (e: any) => !e.deletedAt && e.vatRegistered === true
      );

      for (const entity of vatEntities) {
        const entityIdStr = entity._id as string;

        if (await isDuplicate(ctx, pref.userId, 'vat_return', entityIdStr, todayStart)) {
          continue;
        }

        const dayLabel = daysUntilVat === 1 ? '1 Day' : `${daysUntilVat} Days`;
        const title = `VAT Return Due in ${dayLabel}`;
        const body =
          `Monthly VAT return for ${entity.name} is due on the 21st. ` +
          `Filing late attracts a ₦50,000 penalty. Submit by the deadline to stay compliant.`;

        await insertNotification(
          ctx,
          pref.userId,
          'vat_return',
          title,
          body,
          entityIdStr,
          !!pref.pushEnabled
        );
      }
    }
  },
});

/**
 * Shared logic for uncategorised transaction alerts.
 * Called by both the daily and weekly cron handlers.
 */
async function sendUncategorisedAlerts(
  ctx: any,
  frequency: 'daily' | 'weekly'
): Promise<void> {
  const todayStart = todayStartMs();
  const allPrefs = await ctx.db.query('userPreferences').collect();

  for (const pref of allPrefs) {
    if (pref.uncategorisedAlertFrequency !== frequency) continue;

    const entities = await ctx.db
      .query('entities')
      .withIndex('by_userId', (q: any) => q.eq('userId', pref.userId))
      .collect();

    const activeEntities = entities.filter((e: any) => !e.deletedAt);

    for (const entity of activeEntities) {
      const uncategorised = await ctx.db
        .query('transactions')
        .withIndex('by_entityId_type', (q: any) =>
          q.eq('entityId', entity._id).eq('type', 'uncategorised')
        )
        .collect();

      if (uncategorised.length === 0) continue;

      const entityIdStr = entity._id as string;

      if (
        await isDuplicate(ctx, pref.userId, 'uncategorised_alert', entityIdStr, todayStart)
      ) {
        continue;
      }

      const count = uncategorised.length;
      const txLabel = count === 1 ? 'transaction needs' : 'transactions need';
      const title = `${count} Transaction${count === 1 ? '' : 's'} Need${count === 1 ? 's' : ''} Categorisation`;
      const body =
        `${entity.name} has ${count} ${txLabel} categorisation. ` +
        `Categorise them to keep your tax records accurate.`;

      await insertNotification(
        ctx,
        pref.userId,
        'uncategorised_alert',
        title,
        body,
        entityIdStr,
        !!pref.pushEnabled
      );
    }
  }
}

/**
 * Daily 10:00 WAT (09:00 UTC): uncategorised transaction alert for users
 * who have configured uncategorisedAlertFrequency='daily'.
 *
 * Counts uncategorised transactions per entity and creates a notification
 * if there is at least one. Deduplication prevents repeat alerts the same day.
 */
export const uncategorisedAlert = internalMutation({
  args: {},
  handler: async (ctx) => {
    await sendUncategorisedAlerts(ctx, 'daily');
  },
});

/**
 * Mondays 10:00 WAT (09:00 UTC): weekly uncategorised alert for users
 * who have configured uncategorisedAlertFrequency='weekly'.
 *
 * Same logic as uncategorisedAlert but triggered once per week on Mondays.
 */
export const uncategorisedAlertWeekly = internalMutation({
  args: {},
  handler: async (ctx) => {
    await sendUncategorisedAlerts(ctx, 'weekly');
  },
});
