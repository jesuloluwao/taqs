import { mutation, query } from './_generated/server';
import { getOrCreateCurrentUser } from './auth';
import { v } from 'convex/values';

/**
 * Generate a Convex Storage upload URL.
 * The client uses this URL to upload a file directly to Convex Storage,
 * then passes the returned storageId to uploadAvatar or similar mutations.
 */
export const generateUploadUrl = mutation({
  handler: async (ctx) => {
    const user = await getOrCreateCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Get a public URL for a file stored in Convex Storage.
 * Used to display uploaded avatars.
 */
export const getFileUrl = query({
  args: { storageId: v.string() },
  handler: async (ctx, { storageId }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await ctx.storage.getUrl(storageId as any);
  },
});
