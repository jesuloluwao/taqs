/**
 * Wise (formerly TransferWise) provider client (international money transfers).
 *
 * Uses OAuth 2.0 (authorization_code grant).
 *
 * Docs: https://docs.wise.com/api-docs/
 * Token endpoint: https://api.wise.com/oauth/token
 * API base: https://api.wise.com
 */

import type { ProviderAccountDetails, ProviderTokens, ProviderTransaction } from './types';

const TOKEN_URL = 'https://api.wise.com/oauth/token';
const BASE_URL = 'https://api.wise.com';

function getCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.WISE_CLIENT_ID;
  const clientSecret = process.env.WISE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('WISE_CLIENT_ID and WISE_CLIENT_SECRET must be set');
  }
  return { clientId, clientSecret };
}

/**
 * Exchange a Wise authorization code for access and refresh tokens.
 */
export async function exchangeCode(
  code: string,
  redirectUri: string
): Promise<ProviderTokens> {
  const { clientId, clientSecret } = getCredentials();

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    code,
    redirect_uri: redirectUri,
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Wise token exchange failed (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    token_type: string;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    tokenExpiresAt: data.expires_in
      ? Date.now() + data.expires_in * 1000
      : undefined,
  };
}

/**
 * Fetch Wise account details (profile and primary balance account).
 */
export async function getAccountDetails(
  accessToken: string
): Promise<ProviderAccountDetails> {
  // Get profiles
  const profileRes = await fetch(`${BASE_URL}/v2/profiles`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!profileRes.ok) {
    throw new Error(`Wise getAccountDetails (profiles) failed (${profileRes.status})`);
  }

  const profiles = (await profileRes.json()) as Array<{
    id: number;
    type: 'personal' | 'business';
    details?: { name?: string; firstName?: string; lastName?: string; companyName?: string };
  }>;

  // Prefer business profile, fall back to personal
  const profile =
    profiles.find((p) => p.type === 'business') ?? profiles[0];
  if (!profile) throw new Error('No Wise profile found');

  const profileName =
    profile.details?.companyName ??
    [profile.details?.firstName, profile.details?.lastName].filter(Boolean).join(' ') ??
    `Wise Profile ${profile.id}`;

  // Get multi-currency balances for the profile
  const balancesRes = await fetch(
    `${BASE_URL}/v4/profiles/${profile.id}/balances?types=STANDARD`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  let currency: 'NGN' | 'USD' | 'GBP' | 'EUR' = 'USD';
  if (balancesRes.ok) {
    const balances = (await balancesRes.json()) as Array<{
      id: number;
      currency: string;
      amount: { value: number; currency: string };
    }>;
    // Prefer NGN balance, then USD, then first available
    const ngnBalance = balances.find((b) => b.currency === 'NGN');
    const usdBalance = balances.find((b) => b.currency === 'USD');
    const primaryBalance = ngnBalance ?? usdBalance ?? balances[0];
    if (primaryBalance) currency = mapCurrency(primaryBalance.currency);
  }

  return {
    providerAccountId: `wise_${profile.id}`,
    accountName: `${profileName} (Wise)`,
    currency,
    accountType: profile.type === 'business' ? 'business' : 'personal',
    institutionId: 'wise',
  };
}

/**
 * Fetch Wise transactions (statement) for a given date range.
 * Fetches the statement for each currency balance account.
 */
export async function getTransactions(
  accessToken: string,
  from: number,
  to: number
): Promise<ProviderTransaction[]> {
  // Get profiles first
  const profileRes = await fetch(`${BASE_URL}/v2/profiles`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!profileRes.ok) {
    throw new Error(`Wise getTransactions (profiles) failed (${profileRes.status})`);
  }
  const profiles = (await profileRes.json()) as Array<{ id: number; type: string }>;
  const profile = profiles.find((p) => p.type === 'business') ?? profiles[0];
  if (!profile) return [];

  // Get balances for the profile
  const balancesRes = await fetch(
    `${BASE_URL}/v4/profiles/${profile.id}/balances?types=STANDARD`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!balancesRes.ok) return [];

  const balances = (await balancesRes.json()) as Array<{ id: number; currency: string }>;

  const allTxs: ProviderTransaction[] = [];
  const intervalStart = new Date(from).toISOString();
  const intervalEnd = new Date(to).toISOString();

  for (const balance of balances) {
    const stmtUrl =
      `${BASE_URL}/v1/profiles/${profile.id}/balance-statements/${balance.id}/statement.json` +
      `?currency=${balance.currency}&intervalStart=${encodeURIComponent(intervalStart)}&intervalEnd=${encodeURIComponent(intervalEnd)}`;

    const stmtRes = await fetch(stmtUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!stmtRes.ok) continue;

    const stmt = (await stmtRes.json()) as {
      transactions?: Array<{
        referenceNumber: string;
        date: { localTime?: string };
        details?: { description?: string; type?: string };
        amount: { value: number; currency: string };
        totalFees?: { value: number; currency: string };
        runningBalance?: { value: number; currency: string };
      }>;
    };

    for (const tx of stmt.transactions ?? []) {
      const currency = mapCurrency(tx.amount.currency);
      // Wise amounts are in major units; convert to smallest unit
      const amount = Math.round(Math.abs(tx.amount.value) * 100);
      const direction: 'credit' | 'debit' = tx.amount.value >= 0 ? 'credit' : 'debit';

      allTxs.push({
        externalRef: tx.referenceNumber,
        date: tx.date.localTime ? new Date(tx.date.localTime).getTime() : Date.now(),
        description: tx.details?.description ?? `Wise ${tx.details?.type ?? 'transaction'}`,
        amount,
        currency,
        direction,
      });
    }
  }

  return allTxs;
}

function mapCurrency(raw: string): 'NGN' | 'USD' | 'GBP' | 'EUR' {
  const upper = (raw ?? '').toUpperCase();
  if (upper === 'NGN' || upper === 'USD' || upper === 'GBP' || upper === 'EUR') {
    return upper as 'NGN' | 'USD' | 'GBP' | 'EUR';
  }
  return 'USD'; // Wise primarily uses non-NGN currencies
}
