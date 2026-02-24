import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  users: defineTable({
    clerkUserId: v.string(),
    email: v.string(),
    fullName: v.optional(v.string()),
    phone: v.optional(v.string()),
    /** AES-256-GCM encrypted NIN */
    nin: v.optional(v.string()),
    /** User's personal TIN (from NTA) */
    firsTin: v.optional(v.string()),
    userType: v.optional(v.union(v.literal('freelancer'), v.literal('sme'))),
    profession: v.optional(v.string()),
    preferredCurrency: v.optional(
      v.union(v.literal('NGN'), v.literal('USD'), v.literal('GBP'), v.literal('EUR'))
    ),
    onboardingComplete: v.optional(v.boolean()),
    avatarStorageId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_clerk_user_id', ['clerkUserId'])
    .index('by_email', ['email']),

  entities: defineTable({
    userId: v.id('users'),
    name: v.string(),
    type: v.union(
      v.literal('individual'),
      v.literal('business_name'),
      v.literal('llc')
    ),
    tin: v.optional(v.string()),
    rcNumber: v.optional(v.string()),
    vatRegistered: v.optional(v.boolean()),
    vatThresholdExceeded: v.optional(v.boolean()),
    isDefault: v.optional(v.boolean()),
    taxYearStart: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
  })
    .index('by_userId', ['userId']),

  categories: defineTable({
    name: v.string(),
    type: v.union(
      v.literal('income'),
      v.literal('business_expense'),
      v.literal('personal_expense'),
      v.literal('transfer')
    ),
    isDeductibleDefault: v.optional(v.boolean()),
    ntaReference: v.optional(v.string()),
    isSystem: v.optional(v.boolean()),
    /** Null for system categories, userId for custom categories */
    userId: v.optional(v.id('users')),
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
  })
    .index('by_type', ['type'])
    .index('by_userId', ['userId']),

  userPreferences: defineTable({
    userId: v.id('users'),
    deadlineReminderDays: v.optional(v.number()),
    vatReminderEnabled: v.optional(v.boolean()),
    uncategorisedAlertFrequency: v.optional(
      v.union(v.literal('daily'), v.literal('weekly'), v.literal('never'))
    ),
    invoiceOverdueDays: v.optional(v.number()),
    pushEnabled: v.optional(v.boolean()),
  })
    .index('by_userId', ['userId']),

  connectedAccounts: defineTable({
    entityId: v.id('entities'),
    userId: v.id('users'),
    provider: v.string(),
    providerAccountId: v.optional(v.string()),
    accountName: v.optional(v.string()),
    currency: v.optional(
      v.union(v.literal('NGN'), v.literal('USD'), v.literal('GBP'), v.literal('EUR'))
    ),
    accessToken: v.optional(v.string()),
    refreshToken: v.optional(v.string()),
    tokenExpiresAt: v.optional(v.number()),
    lastSyncedAt: v.optional(v.number()),
    status: v.optional(
      v.union(v.literal('active'), v.literal('expired'), v.literal('error'), v.literal('disconnected'))
    ),
    errorMessage: v.optional(v.string()),
  })
    .index('by_userId', ['userId'])
    .index('by_entityId', ['entityId']),

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
