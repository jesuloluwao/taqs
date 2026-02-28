/**
 * Mono Connect provider client (Nigeria Open Banking).
 *
 * Mono's auth model differs from standard OAuth:
 * - The widget returns a short-lived `code`
 * - Exchanging the code returns a permanent `account_id`
 * - All subsequent API calls use MONO_SECRET_KEY + account_id (no bearer tokens)
 *
 * Docs: https://docs.mono.co/
 * API base: https://api.withmono.com/v2
 */

import type { ProviderAccountDetails, ProviderTokens, ProviderTransaction } from './types';

const BASE_URL = 'https://api.withmono.com/v2';

function getSecretKey(): string {
  const key = process.env.MONO_SECRET_KEY;
  if (!key) throw new Error('MONO_SECRET_KEY environment variable is not set');
  return key;
}

function monoHeaders(): Record<string, string> {
  return {
    'mono-sec-key': getSecretKey(),
    'Content-Type': 'application/json',
  };
}

/**
 * Exchange a Mono Connect code for an account ID.
 * Mono returns an account_id (not a token), which is stored as the accessToken.
 * redirectUri is unused in Mono's model (included for interface compatibility).
 */
export async function exchangeCode(
  code: string,
  _redirectUri: string
): Promise<ProviderTokens> {
  const res = await fetch(`${BASE_URL}/accounts/auth`, {
    method: 'POST',
    headers: monoHeaders(),
    body: JSON.stringify({ code }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Mono code exchange failed (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as { id: string };
  if (!data.id) throw new Error('Mono response missing account id');

  // Store the account_id as the "access token" — no expiry in Mono's model
  return { accessToken: data.id };
}

/**
 * Fetch account details from Mono.
 * accessToken here is the Mono account_id.
 */
export async function getAccountDetails(
  accessToken: string
): Promise<ProviderAccountDetails> {
  const res = await fetch(`${BASE_URL}/accounts/${accessToken}`, {
    headers: monoHeaders(),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Mono getAccountDetails failed (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as {
    id: string;
    name: string;
    currency: string;
    type: string;
    accountNumber: string;
    institution?: { id: string; name: string; bankCode: string };
  };

  const currency = mapCurrency(data.currency);

  return {
    providerAccountId: data.id,
    accountName: data.name ?? `Mono Account ${data.accountNumber?.slice(-4) ?? ''}`,
    currency,
    accountType: data.type,
    accountNumber: data.accountNumber,
    institutionId: data.institution?.bankCode ?? data.institution?.id,
    institutionLogo: data.institution
      ? `https://icons.mono.co/banks/${data.institution.bankCode?.toLowerCase()}.png`
      : undefined,
  };
}

/**
 * Fetch transactions from Mono for a given date range.
 * accessToken is the Mono account_id.
 */
export async function getTransactions(
  accessToken: string,
  from: number,
  to: number
): Promise<ProviderTransaction[]> {
  const startDate = new Date(from).toISOString().split('T')[0];
  const endDate = new Date(to).toISOString().split('T')[0];

  const url = `${BASE_URL}/accounts/${accessToken}/transactions?start=${startDate}&end=${endDate}&paginate=false`;
  const res = await fetch(url, { headers: monoHeaders() });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Mono getTransactions failed (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as {
    data: Array<{
      _id: string;
      narration: string;
      amount: number; // Mono returns in kobo
      date: string;   // ISO date string
      type: 'debit' | 'credit';
      currency: string;
    }>;
  };

  return (data.data ?? []).map((tx) => ({
    externalRef: tx._id,
    date: new Date(tx.date).getTime(),
    description: tx.narration ?? 'Mono transaction',
    amount: Math.round(Math.abs(tx.amount)), // already in kobo
    currency: mapCurrency(tx.currency),
    direction: tx.type === 'credit' ? 'credit' : 'debit',
  }));
}

function mapCurrency(raw: string): 'NGN' | 'USD' | 'GBP' | 'EUR' {
  const upper = (raw ?? '').toUpperCase();
  if (upper === 'NGN' || upper === 'USD' || upper === 'GBP' || upper === 'EUR') {
    return upper as 'NGN' | 'USD' | 'GBP' | 'EUR';
  }
  return 'NGN';
}
