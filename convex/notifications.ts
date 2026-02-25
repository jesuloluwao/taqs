import { mutation, query, internalMutation } from './_generated/server';
import { getCurrentUser } from './auth';
import { v } from 'convex/values';
import { internal } from './_generated/api';

const notificationTypeValidator = v.union(
  v.literal('filing_deadline'),
  v.literal('vat_return'),
  v.literal('uncategorised_alert'),
  v.literal('invoice_overdue'),
  v.literal('import_result'),
  v.literal('sync_error'),
  v.literal('recurring_invoice'),
  v.literal('general')
);

// ================== QUERIES ==================

/**
 * Paginated notification list for the current user, newest first.
 */
export const list = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return { notifications: [], hasMore: false };

    const limit = args.limit ?? 50;

    const notifications = await ctx.db
      .query('notifications')
      .withIndex('by_userId_creationTime', (q) => q.eq('userId', user._id))
      .order('desc')
      .take(limit + 1);

    const hasMore = notifications.length > limit;
    return {
      notifications: notifications.slice(0, limit),
      hasMore,
    };
  },
});

/**
 * Count of unread notifications for the current user.
 */
export const getUnreadCount = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return 0;

    const unread = await ctx.db
      .query('notifications')
      .withIndex('by_userId_read', (q) => q.eq('userId', user._id).eq('read', false))
      .collect();

    return unread.length;
  },
});

// ================== MUTATIONS ==================

/**
 * Mark a single notification as read.
 */
export const markRead = mutation({
  args: {
    notificationId: v.id('notifications'),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error('Unauthenticated');

    const notification = await ctx.db.get(args.notificationId);
    if (!notification || notification.userId !== user._id) {
      throw new Error('Notification not found');
    }

    await ctx.db.patch(args.notificationId, {
      read: true,
      readAt: Date.now(),
    });
  },
});

/**
 * Mark all notifications for the current user as read.
 */
export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error('Unauthenticated');

    const unread = await ctx.db
      .query('notifications')
      .withIndex('by_userId_read', (q) => q.eq('userId', user._id).eq('read', false))
      .collect();

    const now = Date.now();
    await Promise.all(
      unread.map((n) => ctx.db.patch(n._id, { read: true, readAt: now }))
    );

    return unread.length;
  },
});

/**
 * Internal mutation: create a notification and optionally schedule push delivery.
 * Called by cron jobs and domain mutations throughout the app.
 */
export const create = internalMutation({
  args: {
    userId: v.id('users'),
    type: notificationTypeValidator,
    title: v.string(),
    body: v.string(),
    entityId: v.optional(v.string()),
    relatedId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const notificationId = await ctx.db.insert('notifications', {
      userId: args.userId,
      type: args.type,
      title: args.title,
      body: args.body,
      entityId: args.entityId,
      relatedId: args.relatedId,
      read: false,
    });

    // Check if push notifications are enabled for this user
    const prefs = await ctx.db
      .query('userPreferences')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
      .first();

    if (prefs?.pushEnabled) {
      await ctx.scheduler.runAfter(0, (internal as any).push.send, {
        userId: args.userId,
        title: args.title,
        body: args.body,
        data: {
          notificationId,
          type: args.type,
          entityId: args.entityId,
          relatedId: args.relatedId,
        },
      });
    }

    return notificationId;
  },
});
