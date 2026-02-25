import { mutation, query } from './_generated/server';
import { getOrCreateCurrentUser, getCurrentUser } from './auth';
import { v } from 'convex/values';

// ================== QUERIES ==================

/**
 * List all active (non-archived) entities for the current user.
 */
export const list = query({
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const entities = await ctx.db
      .query('entities')
      .withIndex('by_userId', (q) => q.eq('userId', user._id))
      .collect();

    return entities.filter((e) => !e.deletedAt);
  },
});

/**
 * Get a single entity by ID (with ownership check, excludes archived).
 */
export const get = query({
  args: {
    id: v.id('entities'),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const entity = await ctx.db.get(args.id);
    if (!entity || entity.userId !== user._id || entity.deletedAt) {
      return null;
    }

    return entity;
  },
});

// ================== MUTATIONS ==================

/**
 * Create a new entity for the current user.
 * If this is the user's first entity, or isDefault is true, it becomes the default.
 */
export const create = mutation({
  args: {
    name: v.string(),
    type: v.union(
      v.literal('individual'),
      v.literal('business_name'),
      v.literal('llc')
    ),
    tin: v.optional(v.string()),
    rcNumber: v.optional(v.string()),
    vatRegistered: v.optional(v.boolean()),
    isDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    const existing = await ctx.db
      .query('entities')
      .withIndex('by_userId', (q) => q.eq('userId', user._id))
      .collect();

    const activeEntities = existing.filter((e) => !e.deletedAt);
    const shouldBeDefault = activeEntities.length === 0 || args.isDefault === true;

    if (shouldBeDefault) {
      // Clear isDefault on all existing entities
      for (const entity of activeEntities) {
        if (entity.isDefault) {
          await ctx.db.patch(entity._id, { isDefault: false });
        }
      }
    }

    const { isDefault: _isDefault, ...rest } = args;
    return await ctx.db.insert('entities', {
      userId: user._id,
      ...rest,
      isDefault: shouldBeDefault,
    });
  },
});

/**
 * Update an entity's fields (ownership required).
 */
export const update = mutation({
  args: {
    id: v.id('entities'),
    name: v.optional(v.string()),
    type: v.optional(
      v.union(
        v.literal('individual'),
        v.literal('business_name'),
        v.literal('llc')
      )
    ),
    tin: v.optional(v.string()),
    rcNumber: v.optional(v.string()),
    vatRegistered: v.optional(v.boolean()),
    vatThresholdExceeded: v.optional(v.boolean()),
    taxYearStart: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    const { id, ...fields } = args;
    const entity = await ctx.db.get(id);
    if (!entity || entity.userId !== user._id || entity.deletedAt) {
      throw new Error('Entity not found or unauthorized');
    }

    await ctx.db.patch(id, fields);
    return id;
  },
});

/**
 * Set an entity as the user's default (clears isDefault on all others first).
 */
export const setDefault = mutation({
  args: {
    id: v.id('entities'),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    const entity = await ctx.db.get(args.id);
    if (!entity || entity.userId !== user._id || entity.deletedAt) {
      throw new Error('Entity not found or unauthorized');
    }

    // Clear isDefault on all other entities for this user
    const entities = await ctx.db
      .query('entities')
      .withIndex('by_userId', (q) => q.eq('userId', user._id))
      .collect();

    for (const e of entities) {
      if (e._id !== args.id && e.isDefault) {
        await ctx.db.patch(e._id, { isDefault: false });
      }
    }

    await ctx.db.patch(args.id, { isDefault: true });
    return args.id;
  },
});

/**
 * Soft-delete (archive) an entity.
 * Note: exported as `remove` since `delete` is a reserved word.
 * - Cannot delete the last remaining entity.
 * - If the deleted entity was the default, auto-assigns another entity as default.
 */
export const remove = mutation({
  args: {
    id: v.id('entities'),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    const entity = await ctx.db.get(args.id);
    if (!entity || entity.userId !== user._id || entity.deletedAt) {
      throw new Error('Entity not found or unauthorized');
    }

    const allEntities = await ctx.db
      .query('entities')
      .withIndex('by_userId', (q) => q.eq('userId', user._id))
      .collect();
    const activeEntities = allEntities.filter((e) => !e.deletedAt);

    if (activeEntities.length <= 1) {
      throw new Error('Cannot delete your last entity');
    }

    const wasDefault = entity.isDefault;
    await ctx.db.patch(args.id, { deletedAt: Date.now(), isDefault: false });

    // If this was the default entity, assign default to another active entity
    if (wasDefault) {
      const nextDefault = activeEntities.find((e) => e._id !== args.id);
      if (nextDefault) {
        await ctx.db.patch(nextDefault._id, { isDefault: true });
      }
    }

    return args.id;
  },
});
