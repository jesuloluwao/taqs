"use node";

import { internalAction } from './_generated/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';

/**
 * Internal action: dispatch a push notification to all active tokens for a user.
 *
 * Uses Firebase Admin SDK (FCM) to send the message.
 * Deactivates tokens that FCM reports as NotRegistered (stale/uninstalled).
 */
export const send = internalAction({
  args: {
    userId: v.id('users'),
    title: v.string(),
    body: v.string(),
    data: v.optional(
      v.object({
        notificationId: v.optional(v.id('notifications')),
        type: v.optional(v.string()),
        entityId: v.optional(v.string()),
        relatedId: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const FIREBASE_SERVICE_ACCOUNT = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!FIREBASE_SERVICE_ACCOUNT) {
      // Push not configured — silently skip
      return;
    }

    // Lazy-init Firebase Admin SDK using dynamic import (CJS compat pattern)
    const adminMod = await import('firebase-admin' as any);
    const admin = (adminMod as any).default ?? adminMod;

    let app: any;
    try {
      app = admin.app('taxease');
    } catch {
      const serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT);
      app = admin.initializeApp(
        { credential: admin.credential.cert(serviceAccount) },
        'taxease'
      );
    }

    const messaging = admin.messaging(app);

    // Fetch active push tokens for this user
    const tokens: Array<{ _id: string; token: string }> = await ctx.runQuery(
      (internal as any).pushTokens._getActiveTokens,
      { userId: args.userId }
    );

    if (tokens.length === 0) return;

    const tokenStrings = tokens.map((t) => t.token);

    // Build notification payload (FCM data values must be strings)
    const dataPayload: Record<string, string> = {};
    if (args.data) {
      if (args.data.notificationId) dataPayload.notificationId = String(args.data.notificationId);
      if (args.data.type) dataPayload.type = args.data.type;
      if (args.data.entityId) dataPayload.entityId = args.data.entityId;
      if (args.data.relatedId) dataPayload.relatedId = args.data.relatedId;
    }

    const message = {
      tokens: tokenStrings,
      notification: { title: args.title, body: args.body },
      data: dataPayload,
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default' } } },
    };

    const response = await messaging.sendEachForMulticast(message);

    // Deactivate tokens that are no longer registered
    const invalidTokenIds: string[] = [];
    (response.responses as any[]).forEach((res: any, idx: number) => {
      if (
        !res.success &&
        res.error?.code === 'messaging/registration-token-not-registered'
      ) {
        const matchingToken = tokens[idx];
        if (matchingToken) {
          invalidTokenIds.push(matchingToken._id);
        }
      }
    });

    if (invalidTokenIds.length > 0) {
      await ctx.runMutation((internal as any).pushTokens._deactivateTokens, {
        tokenIds: invalidTokenIds,
      });
    }
  },
});
