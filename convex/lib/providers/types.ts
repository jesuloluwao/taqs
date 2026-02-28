/**
 * Shared types for bank and payment platform provider clients.
 * Each provider module implements these interfaces.
 */

export type SupportedCurrency = 'NGN' | 'USD' | 'GBP' | 'EUR';

/**
 * Tokens returned after exchanging an OAuth code.
 * For Mono, accessToken holds the account ID (Mono's auth model).
 * For Paystack/Flutterwave, tokens are not used (API key stored separately).
 */
export interface ProviderTokens {
  /** Bearer access token (or Mono account ID) */
  accessToken: string;
  /** Refresh token for token rotation (OAuth providers only) */
  refreshToken?: string;
  /** Unix timestamp (ms) when the access token expires */
  tokenExpiresAt?: number;
}

/**
 * Account metadata fetched from the provider after authentication.
 */
export interface ProviderAccountDetails {
  /** Provider's stable ID for this account */
  providerAccountId: string;
  /** Human-readable account name */
  accountName: string;
  /** Primary currency of the account */
  currency: SupportedCurrency;
  /** Account type, e.g. 'savings', 'current', 'business' */
  accountType?: string;
  /** Last 4 digits or masked account number */
  accountNumber?: string;
  /** Institution/bank identifier (for display) */
  institutionId?: string;
  /** URL to institution's logo image */
  institutionLogo?: string;
}

/**
 * A single transaction from a provider's API.
 * Amounts are in the smallest unit of the currency (kobo for NGN).
 */
export interface ProviderTransaction {
  /** Stable external reference for deduplication */
  externalRef: string;
  /** Unix timestamp (ms) of the transaction */
  date: number;
  /** Narration or description of the transaction */
  description: string;
  /** Amount in smallest currency unit (kobo for NGN, cents for USD) */
  amount: number;
  /** ISO currency code */
  currency: SupportedCurrency;
  /** Whether money came in or went out */
  direction: 'credit' | 'debit';
}

/**
 * Environment variable names used by each provider.
 * These must be set in the Convex dashboard.
 */
export const PROVIDER_ENV_VARS = {
  mono: {
    secretKey: 'MONO_SECRET_KEY',
    webhookSecret: 'MONO_WEBHOOK_SECRET',
  },
  stitch: {
    clientId: 'STITCH_CLIENT_ID',
    clientSecret: 'STITCH_CLIENT_SECRET',
    webhookSecret: 'STITCH_WEBHOOK_SECRET',
  },
  paystack: {
    webhookSecret: 'PAYSTACK_WEBHOOK_SECRET',
  },
  flutterwave: {
    webhookSecret: 'FLUTTERWAVE_WEBHOOK_SECRET',
  },
  payoneer: {
    clientId: 'PAYONEER_CLIENT_ID',
    clientSecret: 'PAYONEER_CLIENT_SECRET',
  },
  wise: {
    clientId: 'WISE_CLIENT_ID',
    clientSecret: 'WISE_CLIENT_SECRET',
  },
} as const;
