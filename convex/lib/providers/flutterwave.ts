/**
 * Flutterwave provider client (Nigerian/African payment platform).
 *
 * Flutterwave uses API key authentication — there is no OAuth flow.
 * The secret key is validated via GET /v3/balances before being stored.
 *
 * Docs: https://developer.flutterwave.com/docs
 * Base: https://api.flutterwave.com/v3
 */

import type { ProviderAccountDetails, ProviderTokens, ProviderTransaction } from './types';

const BASE_URL = 'https://api.flutterwave.com/v3';

/**
 * Not applicable for Flutterwave — API key providers don't use OAuth.
 * @throws Always throws indicating OAuth is not supported.
 */
export async function exchangeCode(
  _code: string,
  _redirectUri: string
): Promise<ProviderTokens> {
  throw new Error('Flutterwave uses API key authentication, not OAuth');
}

/**
 * Validate a Flutterwave secret key and return account details.
 * Calls GET /balances — returns 401 if the key is invalid.
 * accessToken here is the Flutterwave secret key.
 */
export async function getAccountDetails(
  accessToken: string
): Promise<ProviderAccountDetails> {
  const res = await fetch(`${BASE_URL}/balances`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error('Invalid API key. Please check and try again.');
    }
    throw new Error(`Flutterwave balance check failed (${res.status})`);
  }

  const data = (await res.json()) as {
    status: string;
    data?: Array<{
      currency: string;
      available_balance: number;
    }>;
  };

  if (data.status !== 'success') {
    throw new Error('Invalid API key. Please check and try again.');
  }

  const primaryBalance = data.data?.[0];
  const currency = mapCurrency(primaryBalance?.currency ?? 'NGN');
  const keySlug = accessToken.slice(-8);

  return {
    providerAccountId: `flutterwave_${keySlug}`,
    accountName: 'Flutterwave Account',
    currency,
    accountType: 'payment_platform',
  };
}

/**
 * Fetch transactions from Flutterwave for a given date range.
 * accessToken is the Flutterwave secret key.
 */
export async function getTransactions(
  accessToken: string,
  from: number,
  to: number
): Promise<ProviderTransaction[]> {
  const fromDate = new Date(from).toISOString().split('T')[0];
  const toDate = new Date(to).toISOString().split('T')[0];

  const allTxs: ProviderTransaction[] = [];
  let page = 1;

  while (true) {
    const url = `${BASE_URL}/transactions?from=${fromDate}&to=${toDate}&page=${page}&limit=100`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Flutterwave getTransactions failed (${res.status})`);
    }

    const data = (await res.json()) as {
      status: string;
      data?: Array<{
        id: number;
        tx_ref: string;
        flw_ref: string;
        amount: number; // in major units (NGN, not kobo)
        currency: string;
        created_at: string;
        narration: string;
        status: string;
        is_offline_payment?: boolean;
      }>;
      meta?: {
        page_info?: {
          total: number;
          current_page: number;
          total_pages: number;
        };
      };
    };

    const txBatch = data.data ?? [];

    for (const tx of txBatch) {
      if (tx.status !== 'successful') continue;

      const currency = mapCurrency(tx.currency);
      // Flutterwave returns amounts in major units (Naira, not kobo) — convert
      const amount = Math.round(Math.abs(tx.amount) * 100);

      allTxs.push({
        externalRef: tx.flw_ref ?? tx.tx_ref ?? `fw_${tx.id}`,
        date: new Date(tx.created_at).getTime(),
        description: tx.narration ?? `Flutterwave transaction ${tx.tx_ref}`,
        amount,
        currency,
        direction: 'credit', // Flutterwave transactions are incoming payments
      });
    }

    const pageInfo = data.meta?.page_info;
    if (!pageInfo || page >= pageInfo.total_pages || txBatch.length < 100) break;
    page++;
  }

  return allTxs;
}

function mapCurrency(raw: string): 'NGN' | 'USD' | 'GBP' | 'EUR' {
  const upper = (raw ?? '').toUpperCase();
  if (upper === 'NGN' || upper === 'USD' || upper === 'GBP' || upper === 'EUR') {
    return upper as 'NGN' | 'USD' | 'GBP' | 'EUR';
  }
  return 'NGN';
}
