/**
 * Stitch Link provider client (Open Banking — South Africa / Nigeria).
 *
 * Stitch uses OAuth 2.0 with PKCE.
 * Transactions and accounts are fetched via GraphQL.
 *
 * Docs: https://stitch.money/docs
 * Token endpoint: https://secure.stitch.money/connect/token
 * GraphQL endpoint: https://api.stitch.money/graphql
 */

import type { ProviderAccountDetails, ProviderTokens, ProviderTransaction } from './types';

const TOKEN_URL = 'https://secure.stitch.money/connect/token';
const GRAPHQL_URL = 'https://api.stitch.money/graphql';

function getCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.STITCH_CLIENT_ID;
  const clientSecret = process.env.STITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('STITCH_CLIENT_ID and STITCH_CLIENT_SECRET must be set');
  }
  return { clientId, clientSecret };
}

/**
 * Exchange an authorization code for Stitch access + refresh tokens.
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
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Stitch token exchange failed (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
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
 * Fetch account details from Stitch via GraphQL.
 */
export async function getAccountDetails(
  accessToken: string
): Promise<ProviderAccountDetails> {
  const query = `
    query GetAccounts {
      user {
        bankAccounts {
          id
          name
          accountNumber
          currentBalance
          currency
          accountType
          bankDetails {
            name
            id
          }
        }
      }
    }
  `;

  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    throw new Error(`Stitch getAccountDetails failed (${res.status})`);
  }

  const json = (await res.json()) as {
    data?: {
      user?: {
        bankAccounts?: Array<{
          id: string;
          name: string;
          accountNumber: string;
          currency: string;
          accountType: string;
          bankDetails?: { name: string; id: string };
        }>;
      };
    };
    errors?: Array<{ message: string }>;
  };

  if (json.errors?.length) {
    throw new Error(`Stitch GraphQL error: ${json.errors[0].message}`);
  }

  const accounts = json.data?.user?.bankAccounts ?? [];
  if (accounts.length === 0) {
    throw new Error('No bank accounts found in Stitch');
  }

  // Use the first account
  const acct = accounts[0];

  return {
    providerAccountId: acct.id,
    accountName: acct.name ?? `${acct.bankDetails?.name ?? 'Bank'} ${acct.accountNumber?.slice(-4)}`,
    currency: mapCurrency(acct.currency),
    accountType: acct.accountType,
    accountNumber: acct.accountNumber,
    institutionId: acct.bankDetails?.id,
  };
}

/**
 * Fetch transactions from Stitch via GraphQL for a given date range.
 */
export async function getTransactions(
  accessToken: string,
  from: number,
  to: number
): Promise<ProviderTransaction[]> {
  const afterDate = new Date(from).toISOString().split('T')[0];
  const beforeDate = new Date(to).toISOString().split('T')[0];

  const query = `
    query GetTransactions($after: Date!, $before: Date!) {
      user {
        bankAccounts {
          id
          transactions(filter: { date: { gte: $after, lte: $before } }) {
            edges {
              node {
                id
                date
                description
                amount
                currency
                debitCredit
                merchantName
              }
            }
          }
        }
      }
    }
  `;

  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables: { after: afterDate, before: beforeDate } }),
  });

  if (!res.ok) {
    throw new Error(`Stitch getTransactions failed (${res.status})`);
  }

  const json = (await res.json()) as {
    data?: {
      user?: {
        bankAccounts?: Array<{
          id: string;
          transactions?: {
            edges?: Array<{
              node: {
                id: string;
                date: string;
                description: string;
                amount: number; // decimal, e.g. 150.00
                currency: string;
                debitCredit: 'DEBIT' | 'CREDIT';
                merchantName?: string;
              };
            }>;
          };
        }>;
      };
    };
    errors?: Array<{ message: string }>;
  };

  if (json.errors?.length) {
    throw new Error(`Stitch GraphQL error: ${json.errors[0].message}`);
  }

  const txs: ProviderTransaction[] = [];
  for (const account of json.data?.user?.bankAccounts ?? []) {
    for (const edge of account.transactions?.edges ?? []) {
      const tx = edge.node;
      const currency = mapCurrency(tx.currency);
      // Stitch returns amounts as decimals; convert to kobo for NGN, cents for others
      const amount = Math.round(Math.abs(tx.amount) * 100);

      txs.push({
        externalRef: tx.id,
        date: new Date(tx.date).getTime(),
        description: tx.merchantName ?? tx.description ?? 'Stitch transaction',
        amount,
        currency,
        direction: tx.debitCredit === 'CREDIT' ? 'credit' : 'debit',
      });
    }
  }

  return txs;
}

function mapCurrency(raw: string): 'NGN' | 'USD' | 'GBP' | 'EUR' {
  const upper = (raw ?? '').toUpperCase();
  if (upper === 'NGN' || upper === 'USD' || upper === 'GBP' || upper === 'EUR') {
    return upper as 'NGN' | 'USD' | 'GBP' | 'EUR';
  }
  return 'NGN';
}
