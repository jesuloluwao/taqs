"use node";
/**
 * Bank and payment platform connection actions (PRD-8).
 *
 * Handles OAuth callback (code exchange, token encryption, account creation),
 * API key account creation for Paystack/Flutterwave, manual sync, scheduled
 * sync, and token refresh.
 *
 * Requires: ENCRYPTION_KEY, MONO_SECRET_KEY, STITCH_CLIENT_ID/SECRET,
 *           PAYONEER_CLIENT_ID/SECRET, WISE_CLIENT_ID/SECRET env vars.
 */

import { action, internalAction } from './_generated/server';
import { v } from 'convex/values';
import crypto from 'node:crypto';
import { encrypt, decrypt } from './lib/encryption';
import {
  transformProviderTransactions,
  getRequiredCurrencies,
} from './lib/providers/transformer';

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
// Token refresh helpers (per-provider)
// ─────────────────────────────────────────────

/**
 * Token endpoint URLs and grant details for OAuth providers that support
 * refresh_token rotation.
 */
const REFRESH_TOKEN_CONFIGS: Record<
  string,
  { tokenUrl: string; getCredentials: () => { clientId: string; clientSecret: string } }
> = {
  stitch: {
    tokenUrl: 'https://secure.stitch.money/connect/token',
    getCredentials: () => ({
      clientId: process.env.STITCH_CLIENT_ID ?? '',
      clientSecret: process.env.STITCH_CLIENT_SECRET ?? '',
    }),
  },
  payoneer: {
    tokenUrl: 'https://api.payoneer.com/v4/oauth2/token',
    getCredentials: () => ({
      clientId: process.env.PAYONEER_CLIENT_ID ?? '',
      clientSecret: process.env.PAYONEER_CLIENT_SECRET ?? '',
    }),
  },
  wise: {
    tokenUrl: 'https://api.wise.com/oauth/token',
    getCredentials: () => ({
      clientId: process.env.WISE_CLIENT_ID ?? '',
      clientSecret: process.env.WISE_CLIENT_SECRET ?? '',
    }),
  },
};

/**
 * Perform a token refresh for an OAuth provider using the refresh_token grant.
 * Returns new ProviderTokens on success, or null if the provider doesn't support refresh.
 */
async function refreshTokenForProvider(
  provider: string,
  currentRefreshToken: string
): Promise<ProviderTokens | null> {
  const config = REFRESH_TOKEN_CONFIGS[provider];
  if (!config) return null; // Mono, Paystack, Flutterwave don't use refresh tokens

  const { clientId, clientSecret } = config.getCredentials();
  if (!clientId || !clientSecret) {
    throw new Error(`Missing credentials for ${provider} token refresh`);
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: currentRefreshToken,
    client_id: clientId,
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  // Stitch and Wise use Basic auth; Payoneer also uses Basic auth
  headers['Authorization'] = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;

  const res = await fetch(config.tokenUrl, {
    method: 'POST',
    headers,
    body: body.toString(),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    if (res.status === 400 || res.status === 401) {
      // Refresh token is invalid/expired — need re-authentication
      throw new Error(`reauthorization_required: ${provider} refresh token rejected (${res.status}): ${errText}`);
    }
    throw new Error(`${provider} token refresh failed (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? currentRefreshToken, // keep old if not rotated
    tokenExpiresAt: data.expires_in
      ? Date.now() + data.expires_in * 1000
      : undefined,
  };
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
// refreshToken (internal)
// ─────────────────────────────────────────────

/**
 * Internal action: refresh the access token for an account that uses OAuth.
 *
 * - Decrypts the stored refresh token
 * - Calls the provider's token refresh endpoint
 * - Encrypts the new tokens and stores them
 * - If the refresh token is rejected (expired/invalid), sets account status='error'
 *   so the UI can prompt re-authentication
 *
 * Providers that use refresh tokens: Stitch, Payoneer, Wise
 * Providers that do NOT: Mono (permanent account_id), Paystack/Flutterwave (API key)
 */
export const refreshToken = internalAction({
  args: {
    connectedAccountId: v.id('connectedAccounts'),
  },
  handler: async (ctx, { connectedAccountId }) => {
    const { internal } = await import('./_generated/api');

    const account = (await ctx.runQuery(
      (internal as any).accountsHelpers.getConnectedAccount,
      { connectedAccountId }
    )) as {
      _id: string;
      provider: string;
      refreshToken?: string;
      tokenExpiresAt?: number;
    } | null;

    if (!account) throw new Error(`Account ${connectedAccountId} not found`);
    if (!account.refreshToken) {
      // No refresh token — provider doesn't use OAuth rotation
      return { refreshed: false as const };
    }

    let plainRefreshToken: string;
    try {
      plainRefreshToken = await decrypt(account.refreshToken);
    } catch {
      throw new Error(`Failed to decrypt refresh token for account ${connectedAccountId}`);
    }

    let newTokens: ProviderTokens | null;
    try {
      newTokens = await refreshTokenForProvider(account.provider, plainRefreshToken);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isReauthRequired = msg.startsWith('reauthorization_required:');

      // Mark account as error — UI will show re-auth prompt
      await ctx.runMutation((internal as any).accountsHelpers.updateAccountStatus, {
        connectedAccountId,
        status: 'error',
        errorMessage: isReauthRequired
          ? 'Re-authentication required. Please reconnect your account.'
          : msg,
      });
      throw err;
    }

    if (!newTokens) {
      // Provider doesn't support token refresh (e.g. Mono)
      return { refreshed: false as const };
    }

    // Encrypt and store new tokens
    const encryptedAccessToken = await encrypt(newTokens.accessToken);
    const encryptedRefreshToken = newTokens.refreshToken
      ? await encrypt(newTokens.refreshToken)
      : undefined;

    await ctx.runMutation((internal as any).accountsHelpers.updateTokens, {
      connectedAccountId,
      accessToken: encryptedAccessToken,
      refreshToken: encryptedRefreshToken,
      tokenExpiresAt: newTokens.tokenExpiresAt,
    });

    return { refreshed: true as const };
  },
});

// ─────────────────────────────────────────────
// syncAccount (internal)
// ─────────────────────────────────────────────

/**
 * Internal action: sync transactions for a connected account.
 *
 * Called after OAuth callback, API key account creation, by syncNow (public),
 * by the bank-notification webhook, and by the scheduled 6-hour cron.
 *
 * Flow:
 *  1. Load connected account record
 *  2. Check token expiry — proactively refresh if expiring within 5 minutes
 *  3. Decrypt access token
 *  4. Create an importJob (bank_api source)
 *  5. Fetch transactions from provider since lastSyncedAt (or 30 days)
 *  6. Look up CBN FX rates for any foreign-currency transactions
 *  7. Transform via provider transformer → canonical format with amountNgn
 *  8. Call importHelpers.batchInsert (dedup included)
 *  9. Mark importJob complete or failed
 * 10. Update account lastSyncedAt and status
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
      refreshToken?: string;
      tokenExpiresAt?: number;
      lastSyncedAt?: number;
      status?: string;
    } | null;

    if (!account) throw new Error(`Connected account ${connectedAccountId} not found`);
    if (account.status === 'disconnected') return;
    if (!account.accessToken) throw new Error('No access token stored for account');

    // 2. Proactive token refresh: if expiring within 5 minutes, refresh now
    const fiveMinutes = 5 * 60 * 1000;
    if (
      account.tokenExpiresAt &&
      account.tokenExpiresAt - Date.now() < fiveMinutes &&
      account.refreshToken
    ) {
      try {
        await ctx.runAction((internal as any).accountsActions.refreshToken, {
          connectedAccountId,
        });
      } catch {
        // refreshToken action already updates status='error' on failure
        throw new Error('Token refresh failed. Re-authentication required.');
      }

      // Re-load account to get updated tokens
      const refreshedAccount = (await ctx.runQuery(
        (internal as any).accountsHelpers.getConnectedAccount,
        { connectedAccountId }
      )) as typeof account | null;

      if (!refreshedAccount?.accessToken) {
        throw new Error('Account not found or missing token after refresh');
      }

      // Replace account reference for subsequent steps
      Object.assign(account, refreshedAccount);
    }

    // 3. Decrypt access token
    const accessToken = await decrypt(account.accessToken!);

    // 4. Create import job
    const jobId = (await ctx.runMutation(
      (internal as any).accountsHelpers.createSyncJob,
      {
        entityId: account.entityId,
        userId: account.userId,
        connectedAccountId: account._id,
      }
    )) as string;

    try {
      // 5. Determine date range: since lastSyncedAt or last 30 days
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const from = account.lastSyncedAt
        ? Math.min(account.lastSyncedAt, thirtyDaysAgo)
        : thirtyDaysAgo;
      const to = Date.now();

      const providerMod = await getProviderModule(account.provider);
      const providerTxs = await providerMod.getTransactions(accessToken, from, to);

      // 6. Look up CBN FX rates for any non-NGN currencies in the batch
      const foreignCurrencies = getRequiredCurrencies(providerTxs);
      let fxRateMap: Record<string, number> = {};
      if (foreignCurrencies.length > 0) {
        fxRateMap = (await ctx.runQuery(
          (internal as any).accountsHelpers.getFxRates,
          { currencies: foreignCurrencies }
        )) as Record<string, number>;
      }

      // 7. Transform to canonical format with FX conversion
      const canonicalTxs = transformProviderTransactions(providerTxs, fxRateMap);

      // 8. Batch insert with deduplication
      const result = (await ctx.runMutation(
        (internal as any).importHelpers.batchInsert,
        {
          jobId,
          entityId: account.entityId,
          userId: account.userId,
          transactions: canonicalTxs,
        }
      )) as { totalImported: number; duplicatesSkipped: number };

      // 9a. Mark import job complete
      await ctx.runMutation((internal as any).importHelpers.setJobComplete, {
        jobId,
        totalParsed: providerTxs.length,
        totalImported: result.totalImported,
        duplicatesSkipped: result.duplicatesSkipped,
      });

      // 9b. Update account as active with lastSyncedAt
      await ctx.runMutation((internal as any).accountsHelpers.updateAccountStatus, {
        connectedAccountId: account._id,
        status: 'active',
        lastSyncedAt: Date.now(),
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const isReauthRequired =
        errorMessage.includes('reauthorization_required') ||
        errorMessage.includes('401') ||
        errorMessage.includes('Unauthorized');

      await ctx.runMutation((internal as any).importHelpers.setJobFailed, {
        jobId,
        errorMessage,
      });

      await ctx.runMutation((internal as any).accountsHelpers.updateAccountStatus, {
        connectedAccountId: account._id,
        status: isReauthRequired ? 'error' : 'error',
        errorMessage: isReauthRequired
          ? 'Re-authentication required. Please reconnect your account.'
          : errorMessage,
      });

      throw err;
    }
  },
});

// ─────────────────────────────────────────────
// syncNow (public)
// ─────────────────────────────────────────────

/**
 * Public action: trigger a manual sync for a connected account.
 *
 * Rate limited to one sync per account per 60 seconds to prevent API abuse.
 * Verifies the calling user owns the account's entity before syncing.
 *
 * Returns: { jobId, totalImported, duplicatesSkipped } on success.
 * Throws:
 *  - 'Sync is already running. Please wait 60 seconds before syncing again.'
 *    if last sync was within the past 60 seconds.
 *  - 'Not authorized' if the account doesn't belong to the user's entity.
 */
export const syncNow = action({
  args: {
    connectedAccountId: v.id('connectedAccounts'),
  },
  handler: async (ctx, { connectedAccountId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');

    const { internal } = await import('./_generated/api');

    // Verify the user owns this account
    const userRecord = (await ctx.runQuery(
      (internal as any).accountsHelpers.getUserByClerkId,
      { clerkUserId: identity.subject }
    )) as { _id: string } | null;

    if (!userRecord) throw new Error('User record not found');

    const account = (await ctx.runQuery(
      (internal as any).accountsHelpers.getConnectedAccount,
      { connectedAccountId }
    )) as {
      _id: string;
      userId: string;
      provider: string;
      lastSyncedAt?: number;
      status?: string;
    } | null;

    if (!account) throw new Error('Connected account not found');
    if (account.userId !== userRecord._id) throw new Error('Not authorized');

    // Rate limiting: max one manual sync per account per 60 seconds
    const rateLimitWindow = 60 * 1000; // 60 seconds
    if (account.lastSyncedAt && Date.now() - account.lastSyncedAt < rateLimitWindow) {
      const secondsRemaining = Math.ceil(
        (rateLimitWindow - (Date.now() - account.lastSyncedAt)) / 1000
      );
      throw new Error(
        `Sync is already running. Please wait ${secondsRemaining} seconds before syncing again.`
      );
    }

    // Delegate to internal syncAccount (handles all the actual sync logic)
    await ctx.runAction((internal as any).accountsActions.syncAccount, {
      connectedAccountId,
    });

    return { synced: true };
  },
});

// ─────────────────────────────────────────────
// runScheduledSync (internal — called by 6h cron)
// ─────────────────────────────────────────────

/**
 * Internal action: run the scheduled 6-hour sync for all active accounts.
 *
 * Queries all active connected accounts that have tokens (excludes manual/
 * statement_upload). Syncs them sequentially with a 2-second stagger to
 * respect provider rate limits.
 *
 * Individual account sync failures are caught and logged per-account so
 * a single failing account doesn't block the rest of the batch.
 */
export const runScheduledSync = internalAction({
  handler: async (ctx) => {
    const { internal } = await import('./_generated/api');

    const accounts = (await ctx.runQuery(
      (internal as any).accountsHelpers.listActiveAccountsWithTokens,
      {}
    )) as Array<{ _id: string; provider: string }>;

    if (accounts.length === 0) return { synced: 0, failed: 0 };

    let synced = 0;
    let failed = 0;

    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];

      // Stagger syncs: 2-second delay between accounts to respect rate limits
      if (i > 0) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      try {
        await ctx.runAction((internal as any).accountsActions.syncAccount, {
          connectedAccountId: account._id,
        });
        synced++;
      } catch {
        // Log failure but continue with remaining accounts
        failed++;
      }
    }

    return { synced, failed };
  },
});
