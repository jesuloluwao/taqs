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

export const transactionTypeSchema = z.enum(['income', 'expense']);

export const currencySchema = z.enum(['NGN', 'USD', 'GBP', 'EUR']);

export const connectedAccountStatusSchema = z.enum([
  'active',
  'expired',
  'error',
  'disconnected',
]);

export const uncategorisedAlertFrequencySchema = z.enum(['daily', 'weekly', 'never']);

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

export const transactionSchema = z.object({
  type: transactionTypeSchema,
  amountKobo: z.number().int().positive(),
  currency: currencySchema.default('NGN'),
  category: z.string().min(1),
  description: z.string().optional(),
  transactionDate: z.number().int().positive(),
  source: z.enum(['manual', 'bank_import']).optional().default('manual'),
});

// ─── Inferred input types ─────────────────────────────────────────────────────

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type EntityInput = z.infer<typeof entitySchema>;
export type CategoryInput = z.infer<typeof categorySchema>;
export type UserPreferencesInput = z.infer<typeof userPreferencesSchema>;
export type ConnectedAccountInput = z.infer<typeof connectedAccountSchema>;
export type TransactionInput = z.infer<typeof transactionSchema>;
