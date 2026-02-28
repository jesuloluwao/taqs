import { mutation, query } from './_generated/server';
import { getOrCreateCurrentUser, getCurrentUser } from './auth';
import { v } from 'convex/values';

const currencyValidator = v.union(
  v.literal('NGN'),
  v.literal('USD'),
  v.literal('GBP'),
  v.literal('EUR')
);

// ================== QUERIES ==================

/**
 * List all clients for an entity, alphabetically by name.
 */
export const list = query({
  args: {
    entityId: v.id('entities'),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const entity = await ctx.db.get(args.entityId);
    if (!entity || entity.userId !== user._id || entity.deletedAt) return [];

    const clients = await ctx.db
      .query('clients')
      .withIndex('by_entityId', (q) => q.eq('entityId', args.entityId))
      .collect();

    return clients.sort((a, b) => a.name.localeCompare(b.name));
  },
});

/**
 * Get a single client by ID (ownership check via entity).
 */
export const get = query({
  args: {
    id: v.id('clients'),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const client = await ctx.db.get(args.id);
    if (!client) return null;

    const entity = await ctx.db.get(client.entityId);
    if (!entity || entity.userId !== user._id || entity.deletedAt) return null;

    return client;
  },
});

/**
 * Search clients by name prefix (for autocomplete). Returns up to 10 matches.
 */
export const search = query({
  args: {
    entityId: v.id('entities'),
    namePrefix: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const entity = await ctx.db.get(args.entityId);
    if (!entity || entity.userId !== user._id || entity.deletedAt) return [];

    const prefix = args.namePrefix.toLowerCase();
    const clients = await ctx.db
      .query('clients')
      .withIndex('by_entityId_name', (q) => q.eq('entityId', args.entityId))
      .collect();

    return clients
      .filter((c) => c.name.toLowerCase().startsWith(prefix))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 10);
  },
});

// ================== MUTATIONS ==================

/**
 * Create a new client for an entity.
 */
export const create = mutation({
  args: {
    entityId: v.id('entities'),
    name: v.string(),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    currency: v.optional(currencyValidator),
    whtRate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    const entity = await ctx.db.get(args.entityId);
    if (!entity || entity.userId !== user._id || entity.deletedAt) {
      throw new Error('Entity not found or unauthorized');
    }

    if (args.whtRate !== undefined && ![0, 5, 10].includes(args.whtRate)) {
      throw new Error('whtRate must be 0, 5, or 10');
    }

    const now = Date.now();
    return await ctx.db.insert('clients', {
      entityId: args.entityId,
      userId: user._id,
      name: args.name,
      email: args.email,
      address: args.address,
      currency: args.currency,
      whtRate: args.whtRate,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Update a client's fields (ownership required via entity).
 */
export const update = mutation({
  args: {
    id: v.id('clients'),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    currency: v.optional(currencyValidator),
    whtRate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    const client = await ctx.db.get(args.id);
    if (!client) throw new Error('Client not found');

    const entity = await ctx.db.get(client.entityId);
    if (!entity || entity.userId !== user._id || entity.deletedAt) {
      throw new Error('Entity not found or unauthorized');
    }

    if (args.whtRate !== undefined && ![0, 5, 10].includes(args.whtRate)) {
      throw new Error('whtRate must be 0, 5, or 10');
    }

    const { id, ...fields } = args;
    await ctx.db.patch(id, { ...fields, updatedAt: Date.now() });
    return id;
  },
});

/**
 * Delete a client. Does NOT cascade to invoices (denormalised clientName/clientEmail remain).
 */
export const remove = mutation({
  args: {
    id: v.id('clients'),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateCurrentUser(ctx);
    if (!user) throw new Error('Not authenticated');

    const client = await ctx.db.get(args.id);
    if (!client) throw new Error('Client not found');

    const entity = await ctx.db.get(client.entityId);
    if (!entity || entity.userId !== user._id || entity.deletedAt) {
      throw new Error('Entity not found or unauthorized');
    }

    await ctx.db.delete(args.id);
    return args.id;
  },
});
