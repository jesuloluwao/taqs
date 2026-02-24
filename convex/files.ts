import { mutation } from './_generated/server';
import { getOrCreateCurrentUser } from './auth';

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
