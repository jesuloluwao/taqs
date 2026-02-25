/**
 * TaxEase Nigeria — PIT Computation Engine (NTA 2025)
 *
 * Pure function: deterministic, no I/O side effects.
 * All monetary values in kobo (1 NGN = 100 kobo).
 *
 * References: PRD-3 §5.1 PIT Pipeline, §5.2 PIT Bands, §5.3 Reliefs,
 *             §5.4 WHT Credits, §5.5 Minimum Tax
 */

/** Bump this when the computation logic changes; used for historical immutability. */
export const TAX_ENGINE_VERSION = '1.0.0';

// ---------------------------------------------------------------------------
// Constants (all in kobo)
// ---------------------------------------------------------------------------

const KOBO = (ngn: number): number => ngn * 100;

/** PIT band boundaries (NTA 2025 six-band progressive system) */
const PIT_BANDS: ReadonlyArray<{ from: number; to: number; rate: number }> = [
  { from: KOBO(0),          to: KOBO(800_000),    rate: 0  },
  { from: KOBO(800_000),    to: KOBO(2_200_000),  rate: 15 },
  { from: KOBO(2_200_000),  to: KOBO(4_200_000),  rate: 18 },
  { from: KOBO(4_200_000),  to: KOBO(6_200_000),  rate: 21 },
  { from: KOBO(6_200_000),  to: KOBO(56_200_000), rate: 23 },
  { from: KOBO(56_200_000), to: Infinity,          rate: 25 },
];

const RENT_RELIEF_RATE       = 0.20;           // 20% of annual rent paid
const RENT_RELIEF_CAP        = KOBO(500_000);  // ₦500,000
const MINIMUM_TAX_RATE       = 0.005;          // 0.5% of gross income
const MINIMUM_TAX_FLOOR      = KOBO(200_000);  // ₦200,000
const MIN_TAX_THRESHOLD      = KOBO(800_000);  // assessable profit must exceed ₦800k

// ---------------------------------------------------------------------------
// Input / Output types
// ---------------------------------------------------------------------------

export interface TaxEngineTransaction {
  /** PRD-1 transaction type */
  type: 'income' | 'business_expense' | 'personal_expense' | 'transfer' | 'uncategorised';
  /** Amount converted to NGN, in kobo */
  amountNgn: number;
  /** Whether this expense is tax-deductible (only relevant for business_expense) */
  isDeductible?: boolean;
  /** Percentage of amountNgn that is deductible (0–100); defaults to 100 */
  deductiblePercent?: number;
  /** WHT deducted at source, in kobo (only relevant for income transactions) */
  whtDeducted?: number;
}

export interface TaxEngineDeclarations {
  /** Annual rent paid, in kobo */
  annualRentPaid?: number;
  /** Pension contributions, in kobo */
  pensionContributions?: number;
  /** NHIS contributions, in kobo */
  nhisContributions?: number;
  /** NHF contributions, in kobo */
  nhfContributions?: number;
  /** Life insurance premiums, in kobo */
  lifeInsurancePremiums?: number;
  /** Mortgage interest paid, in kobo */
  mortgageInterest?: number;
}

export interface TaxEngineInput {
  transactions: TaxEngineTransaction[];
  /** User-declared reliefs for this tax year; null if no declaration saved yet */
  declarations: TaxEngineDeclarations | null;
  /** Entity type determines which tax regime applies */
  entityType: 'individual' | 'business_name' | 'llc';
  taxYear: number;
}

export interface PitBandResult {
  /** Band rate as percentage (0–25) */
  rate: number;
  /** Band lower bound in kobo (inclusive) */
  from: number;
  /** Band upper bound in kobo (exclusive); undefined for the top band */
  to?: number;
  /** Portion of taxable income falling in this band, in kobo */
  income: number;
  /** Tax due for this band, in kobo */
  taxPayable: number;
}

export interface TaxEngineReliefs {
  /** Rent relief (20% of declared, capped at ₦500k), in kobo */
  rent: number;
  /** Pension contributions relief, in kobo */
  pension: number;
  /** NHIS contributions relief, in kobo */
  nhis: number;
  /** NHF contributions relief, in kobo */
  nhf: number;
  /** Life insurance premiums relief, in kobo */
  lifeInsurance: number;
  /** Mortgage interest relief, in kobo */
  mortgage: number;
  /** Sum of all reliefs, in kobo */
  total: number;
}

export interface TaxEngineOutput {
  engineVersion: string;
  /** Total gross income (all type='income' transactions), in kobo */
  totalGrossIncome: number;
  /** Total deductible business expenses, in kobo */
  totalBusinessExpenses: number;
  /** grossIncome − expenses, clamped to 0, in kobo */
  assessableProfit: number;
  /** Relief breakdown */
  reliefs: TaxEngineReliefs;
  /** assessableProfit − totalReliefs, clamped to 0, in kobo */
  taxableIncome: number;
  /** Progressive band computation */
  bands: PitBandResult[];
  /** Gross PIT (after minimum tax adjustment if applicable), in kobo */
  grossTaxPayable: number;
  /** Aggregate WHT credits from income transactions, in kobo */
  whtCredits: number;
  /** max(grossTaxPayable − whtCredits, 0), in kobo */
  netTaxPayable: number;
  /** True if minimum tax rule overrode the band-computed gross tax */
  minimumTaxApplied: boolean;
  /** True if netTaxPayable === 0 (nil return required) */
  isNilReturn: boolean;
}

// ---------------------------------------------------------------------------
// Core engine
// ---------------------------------------------------------------------------

/**
 * Run the NTA 2025 PIT computation.
 *
 * Pure function — identical inputs always produce identical outputs.
 * Call this from a Convex query/action; never import Convex APIs here.
 */
export function runTaxEngine(input: TaxEngineInput): TaxEngineOutput {
  const { transactions, declarations } = input;

  // ------------------------------------------------------------------
  // Step 1: Gross income
  // Include only type='income'; transfers/personal/uncategorised excluded.
  // Gifts and loans are excluded by tagging them as type='transfer' or
  // 'uncategorised' during categorisation.
  // ------------------------------------------------------------------
  const grossIncome = transactions
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + t.amountNgn, 0);

  // ------------------------------------------------------------------
  // Step 2: Deductible business expenses
  // Sum amountNgn × (deductiblePercent / 100) for isDeductible=true expenses.
  // ------------------------------------------------------------------
  const totalBusinessExpenses = transactions
    .filter((t) => t.type === 'business_expense' && t.isDeductible === true)
    .reduce((sum, t) => {
      const pct = t.deductiblePercent ?? 100;
      return sum + Math.round((t.amountNgn * pct) / 100);
    }, 0);

  // ------------------------------------------------------------------
  // Step 3: Assessable profit (clamp to 0)
  // ------------------------------------------------------------------
  const assessableProfit = Math.max(0, grossIncome - totalBusinessExpenses);

  // ------------------------------------------------------------------
  // Step 4: Reliefs
  // ------------------------------------------------------------------
  const decl = declarations ?? {};

  const rentRelief = Math.min(
    Math.round((decl.annualRentPaid ?? 0) * RENT_RELIEF_RATE),
    RENT_RELIEF_CAP
  );
  const pension      = decl.pensionContributions   ?? 0;
  const nhis         = decl.nhisContributions       ?? 0;
  const nhf          = decl.nhfContributions         ?? 0;
  const lifeIns      = decl.lifeInsurancePremiums   ?? 0;
  const mortgage     = decl.mortgageInterest         ?? 0;
  const totalReliefs = rentRelief + pension + nhis + nhf + lifeIns + mortgage;

  const reliefs: TaxEngineReliefs = {
    rent:          rentRelief,
    pension,
    nhis,
    nhf,
    lifeInsurance: lifeIns,
    mortgage,
    total:         totalReliefs,
  };

  // ------------------------------------------------------------------
  // Step 5: Taxable income (clamp to 0)
  // ------------------------------------------------------------------
  const taxableIncome = Math.max(0, assessableProfit - totalReliefs);

  // ------------------------------------------------------------------
  // Step 6: Progressive PIT bands
  // ------------------------------------------------------------------
  const bands = computePitBands(taxableIncome);
  const grossTaxFromBands = bands.reduce((sum, b) => sum + b.taxPayable, 0);

  // ------------------------------------------------------------------
  // Step 7: Minimum tax (NTA 2025 §5.5)
  // Applies when:
  //   assessableProfit > ₦800k  AND  grossTaxFromBands < grossIncome × 0.5%
  // Minimum tax = max(grossIncome × 0.5%, ₦200k)
  // ------------------------------------------------------------------
  let grossTaxPayable = grossTaxFromBands;
  let minimumTaxApplied = false;

  if (assessableProfit > MIN_TAX_THRESHOLD) {
    const minimumTax = Math.max(
      Math.round(grossIncome * MINIMUM_TAX_RATE),
      MINIMUM_TAX_FLOOR
    );
    if (grossTaxFromBands < Math.round(grossIncome * MINIMUM_TAX_RATE)) {
      grossTaxPayable = minimumTax;
      minimumTaxApplied = true;
    }
  }

  // ------------------------------------------------------------------
  // Step 8: WHT credits (from income transactions)
  // ------------------------------------------------------------------
  const whtCredits = transactions
    .filter((t) => t.type === 'income' && (t.whtDeducted ?? 0) > 0)
    .reduce((sum, t) => sum + (t.whtDeducted ?? 0), 0);

  // ------------------------------------------------------------------
  // Step 9: Net tax payable after WHT offset (clamp to 0)
  // ------------------------------------------------------------------
  const netTaxPayable = Math.max(0, grossTaxPayable - whtCredits);

  // ------------------------------------------------------------------
  // Step 10: Nil return detection
  // ------------------------------------------------------------------
  const isNilReturn = netTaxPayable === 0;

  return {
    engineVersion:        TAX_ENGINE_VERSION,
    totalGrossIncome:     grossIncome,
    totalBusinessExpenses,
    assessableProfit,
    reliefs,
    taxableIncome,
    bands,
    grossTaxPayable,
    whtCredits,
    netTaxPayable,
    minimumTaxApplied,
    isNilReturn,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute the six progressive PIT bands for a given taxable income (kobo).
 * Returns all six bands; bands with zero income have taxPayable = 0.
 */
function computePitBands(taxableIncome: number): PitBandResult[] {
  const results: PitBandResult[] = [];
  let remaining = taxableIncome;

  for (const band of PIT_BANDS) {
    const isTopBand  = band.to === Infinity;
    const bandWidth  = isTopBand ? remaining : band.to - band.from;
    const incomeInBand = Math.min(remaining, Math.max(0, bandWidth));
    const taxInBand    = Math.round((incomeInBand * band.rate) / 100);

    results.push({
      rate:       band.rate,
      from:       band.from,
      to:         isTopBand ? undefined : band.to,
      income:     incomeInBand,
      taxPayable: taxInBand,
    });

    remaining = Math.max(0, remaining - incomeInBand);
  }

  return results;
}
