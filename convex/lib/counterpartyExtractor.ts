/**
 * Extracts the counterparty/merchant name from Nigerian bank narrations.
 * Unifies patterns from ruleBasedCategoriser.ts extractVendorName() with
 * additional patterns for smart batch categorisation.
 */

/** Normalize a transaction description for exact-match comparison. */
export function normalizeDescription(desc: string): string {
  return desc.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Extract the counterparty/merchant name from a bank narration.
 * Returns null if no pattern matches.
 *
 * Pattern priority (first match wins):
 * 1. TRANSFER TO ... FROM — e.g. "TRANSFER TO JOHN DOE FROM 0012345678"
 * 2. TRF FRM <name>/...   — e.g. "TRF FRM JOHN DOE/ACME LTD"
 * 3. TRF TO <name>/...    — e.g. "TRF TO SHOPRITE/PAYMENT"
 * 4. NIP/<processor>/...  — e.g. "NIP/PAYSTACK/INV-00234"
 * 5. NIP:<name>           — e.g. "NIP:JOHN DOE-1234"
 * 6. POS/WEB PURCHASE     — e.g. "POS PURCHASE - SHOPRITE LEKKI"
 * 7. *<merchant>*...      — e.g. "*UBER*TRIP-12345"
 */
export function extractCounterparty(desc: string): string | null {
  // 1. TRANSFER TO ... FROM (existing ruleBasedCategoriser pattern)
  const toFrom = desc.match(/TRANSFER\s+TO\s+(.+?)\s+FROM\s+/i);
  if (toFrom) return toFrom[1].trim().toUpperCase();

  // 2. TRF FRM <name>/...
  const trfFrm = desc.match(/TRF\s+FRM\s+([^/]+)/i);
  if (trfFrm) return trfFrm[1].trim().toUpperCase();

  // 3. TRF TO <name>/...
  const trfTo = desc.match(/TRF\s+TO\s+([^/]+)/i);
  if (trfTo) return trfTo[1].trim().toUpperCase();

  // 4. NIP/<processor>/...
  const nipSlash = desc.match(/^NIP\/([^/]+)/i);
  if (nipSlash) return nipSlash[1].trim().toUpperCase();

  // 5. NIP:<name> (existing ruleBasedCategoriser pattern)
  const nipColon = desc.match(/^NIP:(.+?)(?:-|$)/i);
  if (nipColon) return nipColon[1].trim().toUpperCase();

  // 6. POS/WEB PURCHASE - <merchant>
  // Limitation: extracts only the first word as merchant name. Multi-word merchants
  // (e.g. "CHICKEN REPUBLIC LEKKI") will match on first word only ("CHICKEN").
  // This is a known trade-off — no reliable way to separate merchant from location
  // without a dictionary. Works well for single-word merchants (SHOPRITE, SPAR, etc.)
  const pos = desc.match(/(?:POS|WEB)\s*(?:\/\s*WEB)?\s*PURCHASE\s*-?\s*(.+)/i);
  if (pos) {
    const full = pos[1].trim().toUpperCase();
    const firstWord = full.split(/\s+/)[0];
    return firstWord || null;
  }

  // 7. *<merchant>*...
  const asterisk = desc.match(/\*([^*]+)\*/);
  if (asterisk) return asterisk[1].trim().toUpperCase();

  return null;
}
