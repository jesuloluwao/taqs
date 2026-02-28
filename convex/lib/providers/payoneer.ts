/**
 * Payoneer provider client (international freelancer payments).
 *
 * Uses OAuth 2.0 (authorization_code grant).
 *
 * Docs: https://developer.payoneer.com/docs/
 * Token endpoint: https://api.payoneer.com/v2/oauth2/token
 * API base: https://api.payoneer.com/v2
 */

import type { ProviderAccountDetails, ProviderTokens, ProviderTransaction } from './types';

const TOKEN_URL = 'https://api.payoneer.com/v2/oauth2/token';
const BASE_URL = 'https://api.payoneer.com/v2';

function getCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.PAYONEER_CLIENT_ID;
  const clientSecret = process.env.PAYONEER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('PAYONEER_CLIENT_ID and PAYONEER_CLIENT_SECRET must be set');
  }
  return { clientId, clientSecret };
}

/**
 * Exchange a Payoneer authorization code for access and refresh tokens.
 */
export async function exchangeCode(
  code: string,
  redirectUri: string
): Promise<ProviderTokens> {
  const { clientId, clientSecret } = getCredentials();

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
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
    throw new Error(`Payoneer token exchange failed (${res.status}): ${errText}`);
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
 * Fetch Payoneer account details.
 */
export async function getAccountDetails(
  accessToken: string
): Promise<ProviderAccountDetails> {
  const res = await fetch(`${BASE_URL}/payees/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Payoneer getAccountDetails failed (${res.status})`);
  }

  const data = (await res.json()) as {
    payee_id?: string;
    payout_methods?: Array<{ currency: string }>;
    accounts?: Array<{ id: string; currency: string; balance?: number }>;
  };

  const payeeId = data.payee_id ?? 'unknown';
  const primaryCurrency = data.payout_methods?.[0]?.currency
    ?? data.accounts?.[0]?.currency
    ?? 'USD';

  return {
    providerAccountId: payeeId,
    accountName: 'Payoneer Account',
    currency: mapCurrency(primaryCurrency),
    accountType: 'digital_wallet',
  };
}

/**
 * Fetch Payoneer transactions for a given date range.
 */
export async function getTransactions(
  accessToken: string,
  from: number,
  to: number
): Promise<ProviderTransaction[]> {
  const startDate = new Date(from).toISOString();
  const endDate = new Date(to).toISOString();

  const url = `${BASE_URL}/accounts/charges?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}&page_size=200`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Payoneer getTransactions failed (${res.status})`);
  }

  const data = (await res.json()) as {
    audit_reports?: Array<{
      event_id: string;
      event_date: string;
      description: string;
      amount: number;     // decimal, e.g. 150.00
      currency: string;
      type?: string;
    }>;
  };

  return (data.audit_reports ?? []).map((tx) => {
    const currency = mapCurrency(tx.currency);
    // Payoneer amounts are in major units; convert to smallest unit
    const amount = Math.round(Math.abs(tx.amount) * 100);
    const direction: 'credit' | 'debit' = tx.amount >= 0 ? 'credit' : 'debit';

    return {
      externalRef: tx.event_id,
      date: new Date(tx.event_date).getTime(),
      description: tx.description ?? 'Payoneer transaction',
      amount,
      currency,
      direction,
    };
  });
}

function mapCurrency(raw: string): 'NGN' | 'USD' | 'GBP' | 'EUR' {
  const upper = (raw ?? '').toUpperCase();
  if (upper === 'NGN' || upper === 'USD' || upper === 'GBP' || upper === 'EUR') {
    return upper as 'NGN' | 'USD' | 'GBP' | 'EUR';
  }
  return 'USD'; // Payoneer primarily uses USD
}
