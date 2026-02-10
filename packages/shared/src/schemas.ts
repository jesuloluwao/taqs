import { z } from 'zod';

export const userTypeSchema = z.enum(['freelancer', 'business', 'mixed']);

export const transactionTypeSchema = z.enum(['income', 'expense']);

export const currencySchema = z.enum(['NGN', 'USD', 'GBP', 'EUR']);

export const profileSchema = z.object({
  userType: userTypeSchema,
  businessName: z.string().optional(),
  tin: z.string().optional(),
  currency: currencySchema.optional().default('NGN'),
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

export type ProfileInput = z.infer<typeof profileSchema>;
export type TransactionInput = z.infer<typeof transactionSchema>;

