/**
 * Provider transaction transformer.
 *
 * Normalises ProviderTransaction[] (from any provider client) to the canonical
 * shape expected by importHelpers.batchInsert, including:
 *
 * - All provider amounts arrive in smallest currency unit:
 *     Mono/Paystack: kobo (NGN × 100)
 *     Flutterwave:   already normalised to kobo by flutterwave.ts (×100)
 *     Wise:          ×100 applied in wise.ts
 *     Payoneer:      ×100 applied in payoneer.ts
 *
 * - FX conversion for non-NGN amounts:
 *     amountNgn = (amount / 100) * cbnRate * 100   [stay in kobo]
 *     i.e.  amountNgn = amount * cbnRate
 *
 * - cbnRate is NGN per 1 major unit of the foreign currency (e.g. NGN per 1 USD).
 *   It is passed in as a pre-fetched map: `{ 'USD': 1650, 'GBP': 2100, 'EUR': 1750 }`
 *   (kobo values — 1 USD = 1650 Naira → rate stored as 1650).
 *
 * If a rate is missing for a currency, amountNgn is set equal to amount with
 * fxRate = 1 as a safe fallback (can be corrected later via manual edit).
 */

import type { ProviderTransaction } from './types';

export interface CanonicalTransaction {
  date: number;
  description: string;
  /** Amount in smallest currency unit (kobo for NGN, cents for USD/GBP/EUR) */
  amount: number;
  currency: 'NGN' | 'USD' | 'GBP' | 'EUR';
  /** Equivalent amount in NGN kobo */
  amountNgn: number;
  /** CBN exchange rate: NGN per 1 major foreign unit (1.0 for NGN) */
  fxRate: number;
  direction: 'credit' | 'debit';
  type: 'uncategorised';
  externalRef?: string;
  taxYear: number;
}

/**
 * Transform an array of provider transactions into canonical batchInsert format.
 *
 * @param txs           Raw transactions from a provider module.
 * @param fxRateMap     Map of currency → CBN rate (NGN per 1 major unit).
 *                      E.g. { USD: 1650, GBP: 2100, EUR: 1750 }
 *                      Rates are in Naira (not kobo). Conversion is done internally.
 */
export function transformProviderTransactions(
  txs: ProviderTransaction[],
  fxRateMap: Partial<Record<string, number>> = {}
): CanonicalTransaction[] {
  return txs.map((tx) => {
    const taxYear = new Date(tx.date).getFullYear();

    if (tx.currency === 'NGN') {
      return {
        date: tx.date,
        description: tx.description,
        amount: tx.amount,
        currency: 'NGN',
        amountNgn: tx.amount, // NGN kobo = NGN kobo
        fxRate: 1,
        direction: tx.direction,
        type: 'uncategorised',
        externalRef: tx.externalRef,
        taxYear,
      };
    }

    // Non-NGN currency: look up CBN rate (Naira per 1 major unit of foreign currency)
    const cbnRateNaira = fxRateMap[tx.currency];

    if (cbnRateNaira && cbnRateNaira > 0) {
      // tx.amount is in foreign-currency cents (smallest unit).
      // Convert to NGN kobo:
      //   1 foreign major unit = cbnRateNaira Naira = cbnRateNaira * 100 kobo
      //   tx.amount cents → tx.amount / 100 major units → * cbnRateNaira * 100 kobo
      //   Simplified: amountNgn = tx.amount * cbnRateNaira
      const amountNgn = Math.round(tx.amount * cbnRateNaira);
      return {
        date: tx.date,
        description: tx.description,
        amount: tx.amount,
        currency: tx.currency,
        amountNgn,
        fxRate: cbnRateNaira,
        direction: tx.direction,
        type: 'uncategorised',
        externalRef: tx.externalRef,
        taxYear,
      };
    }

    // No rate available — store 1:1 as fallback; user can correct later
    return {
      date: tx.date,
      description: tx.description,
      amount: tx.amount,
      currency: tx.currency,
      amountNgn: tx.amount, // fallback: assumes 1:1 (incorrect but safe)
      fxRate: 1,
      direction: tx.direction,
      type: 'uncategorised',
      externalRef: tx.externalRef,
      taxYear,
    };
  });
}

/**
 * Extract the unique set of currencies that need FX rate lookups
 * from a list of provider transactions.
 */
export function getRequiredCurrencies(txs: ProviderTransaction[]): string[] {
  const currencies = new Set<string>();
  for (const tx of txs) {
    if (tx.currency !== 'NGN') {
      currencies.add(tx.currency);
    }
  }
  return Array.from(currencies);
}
