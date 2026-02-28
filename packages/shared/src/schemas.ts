import { z } from 'zod';

// ─── Primitive enums ─────────────────────────────────────────────────────────

export const userTypeSchema = z.enum(['freelancer', 'sme']);

export const entityTypeSchema = z.enum(['individual', 'business_name', 'llc']);

export const categoryTypeSchema = z.enum([
  'income',
  'business_expense',
  'personal_expense',
  'transfer',
]);

/** Expanded transaction type — replaces the old 'income' | 'expense' binary */
export const transactionTypeSchema = z.enum([
  'income',
  'business_expense',
  'personal_expense',
  'transfer',
  'uncategorised',
]);

export const transactionDirectionSchema = z.enum(['credit', 'debit']);

export const currencySchema = z.enum(['NGN', 'USD', 'GBP', 'EUR']);

export const connectedAccountStatusSchema = z.enum([
  'active',
  'expired',
  'error',
  'disconnected',
]);

export const uncategorisedAlertFrequencySchema = z.enum(['daily', 'weekly', 'never']);

export const importJobSourceSchema = z.enum([
  'pdf',
  'csv',
  'bank_api',
  'paystack',
  'flutterwave',
  'manual',
]);

export const importJobStatusSchema = z.enum([
  'pending',
  'processing',
  'complete',
  'failed',
]);

// ─── Domain schemas ───────────────────────────────────────────────────────────

export const updateUserSchema = z.object({
  fullName: z.string().optional(),
  phone: z.string().optional(),
  userType: userTypeSchema.optional(),
  profession: z.string().optional(),
  preferredCurrency: currencySchema.optional(),
  onboardingComplete: z.boolean().optional(),
});

export const entitySchema = z.object({
  name: z.string().min(1),
  type: entityTypeSchema,
  tin: z.string().optional(),
  rcNumber: z.string().optional(),
  vatRegistered: z.boolean().optional(),
  vatThresholdExceeded: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  taxYearStart: z.number().optional(),
});

export const categorySchema = z.object({
  name: z.string().min(1),
  type: categoryTypeSchema,
  isDeductibleDefault: z.boolean().optional(),
  ntaReference: z.string().optional(),
  isSystem: z.boolean().optional(),
  userId: z.string().optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
});

export const userPreferencesSchema = z.object({
  deadlineReminderDays: z.number().int().nonnegative().optional(),
  vatReminderEnabled: z.boolean().optional(),
  uncategorisedAlertFrequency: uncategorisedAlertFrequencySchema.optional(),
  invoiceOverdueDays: z.number().int().nonnegative().optional(),
  pushEnabled: z.boolean().optional(),
});

export const connectedAccountSchema = z.object({
  provider: z.string().min(1),
  providerAccountId: z.string().optional(),
  accountName: z.string().optional(),
  currency: currencySchema.optional(),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  tokenExpiresAt: z.number().optional(),
  lastSyncedAt: z.number().optional(),
  status: connectedAccountStatusSchema.optional(),
  errorMessage: z.string().optional(),
});

/**
 * Full PRD-1 transaction schema with all tax-relevant fields.
 */
export const transactionSchema = z.object({
  entityId: z.string().min(1),
  connectedAccountId: z.string().optional(),
  importJobId: z.string().optional(),
  date: z.number().int().positive(),
  description: z.string().min(1),
  enrichedDescription: z.string().optional(),
  amount: z.number().int().positive(),
  currency: currencySchema.default('NGN'),
  amountNgn: z.number().int().positive(),
  fxRate: z.number().positive().optional(),
  direction: transactionDirectionSchema,
  type: transactionTypeSchema.default('uncategorised'),
  categoryId: z.string().optional(),
  isDeductible: z.boolean().optional(),
  deductiblePercent: z.number().min(0).max(100).optional(),
  whtDeducted: z.number().nonnegative().optional(),
  whtRate: z.number().min(0).max(100).optional(),
  invoiceId: z.string().optional(),
  notes: z.string().optional(),
  externalRef: z.string().optional(),
  isDuplicate: z.boolean().optional(),
  taxYear: z.number().int().min(2000).max(2100),
  reviewedByUser: z.boolean().optional(),
});

/**
 * Import job schema.
 */
export const importJobSchema = z.object({
  entityId: z.string().min(1),
  connectedAccountId: z.string().optional(),
  source: importJobSourceSchema,
  storageId: z.string().optional(),
});

/**
 * Import job status update schema (for patching after processing).
 */
export const importJobUpdateSchema = z.object({
  status: importJobStatusSchema.optional(),
  totalParsed: z.number().int().nonnegative().optional(),
  totalImported: z.number().int().nonnegative().optional(),
  duplicatesSkipped: z.number().int().nonnegative().optional(),
  errorMessage: z.string().optional(),
  startedAt: z.number().optional(),
  completedAt: z.number().optional(),
});

// ─── Inferred input types ─────────────────────────────────────────────────────

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type EntityInput = z.infer<typeof entitySchema>;
export type CategoryInput = z.infer<typeof categorySchema>;
export type UserPreferencesInput = z.infer<typeof userPreferencesSchema>;
export type ConnectedAccountInput = z.infer<typeof connectedAccountSchema>;
export type TransactionInput = z.infer<typeof transactionSchema>;
export type ImportJobInput = z.infer<typeof importJobSchema>;
export type ImportJobUpdateInput = z.infer<typeof importJobUpdateSchema>;
