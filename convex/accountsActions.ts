"use node";
/**
 * Bank and payment platform connection actions (PRD-8).
 *
 * Handles OAuth callback (code exchange, token encryption, account creation)
 * and API key account creation for Paystack/Flutterwave.
 *
 * Requires: ENCRYPTION_KEY, MONO_SECRET_KEY, STITCH_CLIENT_ID/SECRET,
 *           PAYONEER_CLIENT_ID/SECRET, WISE_CLIENT_ID/SECRET env vars.
 */

import { action, internalAction } from './_generated/server';
import { v } from 'convex/values';
import crypto from 'node:crypto';
import { encrypt, decrypt } from './lib/encryption';

// ─────────────────────────────────────────────
// Types (local — avoids importing from providers at module level)
// ─────────────────────────────────────────────

interface ProviderTokens {
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt?: number;
}

interface ProviderAccountDetails {
  providerAccountId: string;
  accountName: string;
  currency: 'NGN' | 'USD' | 'GBP' | 'EUR';
  accountType?: string;
  accountNumber?: string;
  institutionId?: string;
  institutionLogo?: string;
}

interface ProviderTransaction {
  externalRef: string;
  date: number;
  description: string;
  amount: number;
  currency: 'NGN' | 'USD' | 'GBP' | 'EUR';
  direction: 'credit' | 'debit';
}

interface ProviderModule {
  exchangeCode: (code: string, redirectUri: string) => Promise<ProviderTokens>;
  getAccountDetails: (accessToken: string) => Promise<ProviderAccountDetails>;
  getTransactions: (accessToken: string, from: number, to: number) => Promise<ProviderTransaction[]>;
}

// ─────────────────────────────────────────────
// Provider loader
// ─────────────────────────────────────────────

async function getProviderModule(provider: string): Promise<ProviderModule> {
  switch (provider) {
    case 'mono':
      return await import('./lib/providers/mono');
    case 'stitch':
      return await import('./lib/providers/stitch');
    case 'paystack':
      return await import('./lib/providers/paystack');
    case 'flutterwave':
      return await import('./lib/providers/flutterwave');
    case 'payoneer':
      return await import('./lib/providers/payoneer');
    case 'wise':
      return await import('./lib/providers/wise');
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

function getLinkProvider(provider: string): 'mono' | 'stitch' | undefined {
  if (provider === 'mono') return 'mono';
  if (provider === 'stitch') return 'stitch';
  return undefined;
}

// ─────────────────────────────────────────────
// handleOAuthCallback
// ─────────────────────────────────────────────

/**
 * Process an OAuth callback from a bank/payment provider.
 *
 * Called by the frontend (React Native / web) after the WebView receives
 * the authorization code via window.ReactNativeWebView.postMessage.
 *
 * Flow:
 *  1. Validate + consume the single-use state token
 *  2. Exchange auth code for tokens via provider API
 *  3. Encrypt tokens with AES-256-GCM
 *  4. Fetch account details from provider
 *  5. Create or update connectedAccounts record
 *  6. Trigger initial background sync
 *
 * Error cases:
 *  - User cancelled → returns { cancelled: true } (no account created)
 *  - Provider error → throws (frontend shows toast with retry)
 *  - Invalid state → throws
 */
export const handleOAuthCallback = action({
  args: {
    code: v.optional(v.string()),
    stateToken: v.string(),
    /** OAuth error code, e.g. 'access_denied' when user cancels */
    error: v.optional(v.string()),
  },
  handler: async (ctx, { code, stateToken, error }) => {
    // User cancelled OAuth — no account created
    if (error) {
      if (error === 'access_denied' || error === 'user_cancelled') {
        return { cancelled: true as const };
      }
      throw new Error(`OAuth provider returned error: ${error}`);
    }

    if (!code) {
      throw new Error('Authorization code is missing from the OAuth callback');
    }

    const { internal } = await import('./_generated/api');

    // 1. Validate and consume the state token (internal mutation — bypasses auth for action context)
    const stateData = (await ctx.runMutation(
      (internal as any).oauthStates._validateAndConsume,
      { stateToken }
    )) as {
      userId: string;
      entityId: string;
      provider: string;
      redirectUri: string;
    };

    const { entityId, userId, provider, redirectUri } = stateData;

    // 2. Get provider module and exchange code for tokens
    const providerMod = await getProviderModule(provider);
    const tokens = await providerMod.exchangeCode(code, redirectUri);

    // 3. Encrypt tokens
    const encryptedAccessToken = await encrypt(tokens.accessToken);
    const encryptedRefreshToken = tokens.refreshToken
      ? await encrypt(tokens.refreshToken)
      : undefined;

    // 4. Fetch account details from provider
    const accountDetails = await providerMod.getAccountDetails(tokens.accessToken);

    // 5. Create or update connected account
    const connectedAccountId = (await ctx.runMutation(
      (internal as any).accountsHelpers.upsertConnectedAccount,
      {
        entityId,
        userId,
        provider,
        providerAccountId: accountDetails.providerAccountId,
        accountName: accountDetails.accountName,
        currency: accountDetails.currency,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiresAt: tokens.tokenExpiresAt,
        status: 'active',
        metadata: {
          accountType: accountDetails.accountType,
          accountNumber: accountDetails.accountNumber,
          institutionId: accountDetails.institutionId,
          institutionLogo: accountDetails.institutionLogo,
          linkProvider: getLinkProvider(provider),
        },
      }
    )) as string;

    // 6. Trigger initial sync — fire and forget (sync failure must not block callback)
    ctx
      .runAction((internal as any).accountsActions.syncAccount, { connectedAccountId })
      .catch(() => {
        // Non-blocking: account was created; sync will retry on next scheduled run
      });

    return { connectedAccountId, cancelled: false as const };
  },
});

// ─────────────────────────────────────────────
// addApiKeyAccount
// ─────────────────────────────────────────────

/**
 * Add a Paystack or Flutterwave account using a secret API key.
 *
 * Flow:
 *  1. Validate API key by calling the provider's balance endpoint
 *  2. Encrypt the API key with AES-256-GCM
 *  3. Store SHA-256 hash of the key in metadata.apiKeyHash
 *  4. Create the connected account record
 *  5. Trigger initial background sync
 *
 * Throws:
 *  - 'Invalid API key. Please check and try again.' if key is rejected by provider
 */
export const addApiKeyAccount = action({
  args: {
    entityId: v.id('entities'),
    provider: v.union(v.literal('paystack'), v.literal('flutterwave')),
    apiKey: v.string(),
  },
  handler: async (ctx, { entityId, provider, apiKey }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');

    const { internal } = await import('./_generated/api');

    // Look up user record by Clerk subject
    const userRecord = (await ctx.runQuery(
      (internal as any).accountsHelpers.getUserByClerkId,
      { clerkUserId: identity.subject }
    )) as { _id: string } | null;

    if (!userRecord) throw new Error('User record not found');
    const userId = userRecord._id;

    // 1. Validate API key via provider's balance endpoint
    //    getAccountDetails will throw 'Invalid API key. Please check and try again.'
    //    if the key is rejected (401/403 from provider).
    const providerMod = await getProviderModule(provider);
    const accountDetails = await providerMod.getAccountDetails(apiKey);

    // 2. Encrypt the API key
    const encryptedApiKey = await encrypt(apiKey);

    // 3. SHA-256 hash of the API key (for display verification without storing plaintext)
    const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

    // 4. Create connected account
    const connectedAccountId = (await ctx.runMutation(
      (internal as any).accountsHelpers.upsertConnectedAccount,
      {
        entityId,
        userId,
        provider,
        providerAccountId: accountDetails.providerAccountId,
        accountName: accountDetails.accountName,
        currency: accountDetails.currency,
        accessToken: encryptedApiKey,
        status: 'active',
        metadata: {
          accountType: accountDetails.accountType,
          apiKeyHash,
        },
      }
    )) as string;

    // 5. Trigger initial sync (fire and forget)
    ctx
      .runAction((internal as any).accountsActions.syncAccount, { connectedAccountId })
      .catch(() => {});

    return { connectedAccountId };
  },
});

// ─────────────────────────────────────────────
// syncAccount (internal)
// ─────────────────────────────────────────────

/**
 * Internal action: sync transactions for a connected account.
 *
 * Called after OAuth callback, API key account creation, by the
 * bank-notification webhook, and by the scheduled 6-hour cron (US-053).
 *
 * Flow:
 *  1. Load connected account record
 *  2. Decrypt access token
 *  3. Create an importJob (bank_api source)
 *  4. Fetch transactions from provider since lastSyncedAt (or 30 days)
 *  5. Map to internal format and call importHelpers.batchInsert
 *  6. Mark importJob complete or failed
 *  7. Update account lastSyncedAt and status
 */
export const syncAccount = internalAction({
  args: {
    connectedAccountId: v.id('connectedAccounts'),
  },
  handler: async (ctx, { connectedAccountId }) => {
    const { internal } = await import('./_generated/api');

    // 1. Load account record
    const account = (await ctx.runQuery(
      (internal as any).accountsHelpers.getConnectedAccount,
      { connectedAccountId }
    )) as {
      _id: string;
      entityId: string;
      userId: string;
      provider: string;
      accessToken?: string;
      lastSyncedAt?: number;
      status?: string;
    } | null;

    if (!account) throw new Error(`Connected account ${connectedAccountId} not found`);
    if (account.status === 'disconnected') return;
    if (!account.accessToken) throw new Error('No access token stored for account');

    // 2. Decrypt access token
    const accessToken = await decrypt(account.accessToken);

    // 3. Create import job
    const jobId = (await ctx.runMutation(
      (internal as any).accountsHelpers.createSyncJob,
      {
        entityId: account.entityId,
        userId: account.userId,
        connectedAccountId: account._id,
      }
    )) as string;

    try {
      // 4. Determine date range: since lastSyncedAt or last 30 days
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const from = account.lastSyncedAt
        ? Math.min(account.lastSyncedAt, thirtyDaysAgo)
        : thirtyDaysAgo;
      const to = Date.now();

      const providerMod = await getProviderModule(account.provider);
      const providerTxs = await providerMod.getTransactions(accessToken, from, to);

      // 5. Map provider transactions to internal batchInsert format
      const mappedTxs = providerTxs.map((tx) => {
        const taxYear = new Date(tx.date).getFullYear();
        return {
          date: tx.date,
          description: tx.description,
          amount: tx.amount,
          currency: tx.currency,
          // FX conversion handled async by tax engine; store 1:1 for now
          amountNgn: tx.currency === 'NGN' ? tx.amount : tx.amount,
          fxRate: 1,
          direction: tx.direction,
          type: 'uncategorised' as const,
          externalRef: tx.externalRef,
          taxYear,
        };
      });

      // 6. Batch insert with deduplication
      const result = (await ctx.runMutation(
        (internal as any).importHelpers.batchInsert,
        {
          jobId,
          entityId: account.entityId,
          userId: account.userId,
          transactions: mappedTxs,
        }
      )) as { totalImported: number; duplicatesSkipped: number };

      // 7a. Mark import job complete
      await ctx.runMutation((internal as any).importHelpers.setJobComplete, {
        jobId,
        totalParsed: providerTxs.length,
        totalImported: result.totalImported,
        duplicatesSkipped: result.duplicatesSkipped,
      });

      // 7b. Update account as active with lastSyncedAt
      await ctx.runMutation((internal as any).accountsHelpers.updateAccountStatus, {
        connectedAccountId: account._id,
        status: 'active',
        lastSyncedAt: Date.now(),
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      await ctx.runMutation((internal as any).importHelpers.setJobFailed, {
        jobId,
        errorMessage,
      });

      await ctx.runMutation((internal as any).accountsHelpers.updateAccountStatus, {
        connectedAccountId: account._id,
        status: 'error',
        errorMessage,
      });

      throw err;
    }
  },
});
