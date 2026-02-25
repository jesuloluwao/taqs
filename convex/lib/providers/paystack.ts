/**
 * Paystack provider client (Nigerian payment platform).
 *
 * Paystack uses API key authentication — there is no OAuth flow.
 * The API key is validated via GET /balance before being stored.
 *
 * Docs: https://paystack.com/docs/api/
 * Base: https://api.paystack.co
 */

import type { ProviderAccountDetails, ProviderTokens, ProviderTransaction } from './types';

const BASE_URL = 'https://api.paystack.co';

/**
 * Not applicable for Paystack — API key providers don't use OAuth.
 * Included for interface compatibility.
 * @throws Always throws indicating OAuth is not supported.
 */
export async function exchangeCode(
  _code: string,
  _redirectUri: string
): Promise<ProviderTokens> {
  throw new Error('Paystack uses API key authentication, not OAuth');
}

/**
 * Validate a Paystack secret key and return account details.
 * Calls GET /balance — returns 401 if the key is invalid.
 * accessToken here is the Paystack secret key.
 */
export async function getAccountDetails(
  accessToken: string
): Promise<ProviderAccountDetails> {
  // Validate the key via balance endpoint
  const balanceRes = await fetch(`${BASE_URL}/balance`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!balanceRes.ok) {
    if (balanceRes.status === 401) {
      throw new Error('Invalid API key. Please check and try again.');
    }
    throw new Error(`Paystack balance check failed (${balanceRes.status})`);
  }

  // Get business name from integration endpoint
  let businessName = 'Paystack Account';
  try {
    const integrationRes = await fetch(`${BASE_URL}/integration`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (integrationRes.ok) {
      const integration = (await integrationRes.json()) as {
        data?: { name?: string };
      };
      if (integration.data?.name) {
        businessName = integration.data.name;
      }
    }
  } catch {
    // Non-critical — use default name
  }

  const balanceData = (await balanceRes.json()) as {
    data?: Array<{ currency: string; balance: number }>;
  };

  const primaryBalance = balanceData.data?.[0];
  const currency = primaryBalance?.currency === 'NGN' ? 'NGN'
    : primaryBalance?.currency === 'USD' ? 'USD'
    : 'NGN';

  // Use hash of the API key as a stable provider account ID
  const keySlug = accessToken.slice(-8);

  return {
    providerAccountId: `paystack_${keySlug}`,
    accountName: businessName,
    currency,
    accountType: 'payment_platform',
  };
}

/**
 * Fetch transactions from Paystack for a given date range.
 * accessToken is the Paystack secret key.
 */
export async function getTransactions(
  accessToken: string,
  from: number,
  to: number
): Promise<ProviderTransaction[]> {
  const fromDate = new Date(from).toISOString().split('T')[0];
  const toDate = new Date(to).toISOString().split('T')[0];

  // Fetch multiple pages if needed
  const allTxs: ProviderTransaction[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const url = `${BASE_URL}/transaction?from=${fromDate}&to=${toDate}&page=${page}&perPage=${perPage}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      throw new Error(`Paystack getTransactions failed (${res.status})`);
    }

    const data = (await res.json()) as {
      data?: Array<{
        id: number;
        createdAt: string;
        amount: number; // in kobo
        currency: string;
        status: string;
        channel: string;
        reference: string;
        metadata?: { custom_fields?: Array<{ display_name: string; value: string }> };
        customer?: { email?: string };
      }>;
      meta?: { total: number; page: number; pageCount: number };
    };

    const txBatch = data.data ?? [];

    for (const tx of txBatch) {
      // Only include successful transactions
      if (tx.status !== 'success') continue;

      const currency = mapCurrency(tx.currency);
      const amount = Math.round(Math.abs(tx.amount)); // already in kobo

      allTxs.push({
        externalRef: tx.reference ?? `ps_${tx.id}`,
        date: new Date(tx.createdAt).getTime(),
        description: `Paystack payment${tx.customer?.email ? ` from ${tx.customer.email}` : ''}`,
        amount,
        currency,
        direction: 'credit', // Paystack transactions are incoming payments
      });
    }

    // Check if there are more pages
    const meta = data.meta;
    if (!meta || page >= meta.pageCount || txBatch.length < perPage) break;
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
