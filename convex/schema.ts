import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  users: defineTable({
    clerkUserId: v.string(),
    email: v.string(),
    fullName: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_clerk_user_id', ['clerkUserId']),

  profiles: defineTable({
    userId: v.id('users'),
    userType: v.union(v.literal('freelancer'), v.literal('business'), v.literal('mixed')),
    businessName: v.optional(v.string()),
    tin: v.optional(v.string()),
    currency: v.optional(v.union(v.literal('NGN'), v.literal('USD'), v.literal('GBP'), v.literal('EUR'))),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_user_id', ['userId']),

  transactions: defineTable({
    userId: v.id('users'),
    type: v.union(v.literal('income'), v.literal('expense')),
    amountKobo: v.number(),
    currency: v.optional(v.union(v.literal('NGN'), v.literal('USD'), v.literal('GBP'), v.literal('EUR'))),
    category: v.string(),
    description: v.optional(v.string()),
    transactionDate: v.number(),
    source: v.optional(v.union(v.literal('manual'), v.literal('bank_import'))),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_user_id', ['userId'])
    .index('by_user_type_date', ['userId', 'type', 'transactionDate']),

  documents: defineTable({
    userId: v.id('users'),
    kind: v.union(
      v.literal('receipt'),
      v.literal('invoice'),
      v.literal('statement'),
      v.literal('report')
    ),
    storageId: v.string(),
    filename: v.string(),
    createdAt: v.number(),
  })
    .index('by_user_id', ['userId']),
});

