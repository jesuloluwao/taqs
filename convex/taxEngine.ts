/**
 * TaxEase Nigeria — Full Tax Computation Engine (NTA 2025)
 *
 * Pure function: deterministic, no I/O side effects.
 * All monetary values in kobo (1 NGN = 100 kobo).
 *
 * References: PRD-3 §5.1 PIT Pipeline, §5.2 PIT Bands, §5.3 Reliefs,
 *             §5.4 WHT Credits, §5.5 Minimum Tax, §5.8 CGT, §5.9 CIT,
 *             §5.10 VAT, §5.11 Nil Return, §5.12 Engine Versioning
 */

/** Bump this when the computation logic changes; used for historical immutability. */
export const TAX_ENGINE_VERSION = '1.2.0';

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

const RENT_RELIEF_RATE          = 0.20;            // 20% of annual rent paid
const RENT_RELIEF_CAP           = KOBO(500_000);   // ₦500,000
const MINIMUM_TAX_RATE          = 0.005;           // 0.5% of gross income
const MINIMUM_TAX_FLOOR         = KOBO(200_000);   // ₦200,000
const MIN_TAX_THRESHOLD         = KOBO(800_000);   // assessable profit must exceed ₦800k
const PIT_EXEMPT_THRESHOLD      = KOBO(800_000);   // taxable income threshold for nil return

// CIT constants (NTA 2025 §5.9)
const CIT_RATE                  = 0.30;            // 30%
const CIT_DEV_LEVY_RATE         = 0.04;            // 4% development levy
const CIT_SMALL_CO_TURNOVER_CAP = KOBO(100_000_000); // ₦100m turnover threshold
const CIT_SMALL_CO_ASSETS_CAP   = KOBO(250_000_000); // ₦250m gross fixed assets threshold

// CGT constants (NTA 2025 §5.8)
const CGT_LLC_RATE              = 0.30;            // 30% flat for LLCs

// VAT constants (NTA 2025 §5.10)
const VAT_INCLUSIVE_FACTOR      = 7.5 / 107.5;    // back-calculation from VAT-inclusive amount

/** Currencies supported for amountNgn computation. */
export const SUPPORTED_CURRENCIES = ['NGN', 'USD', 'GBP', 'EUR'] as const;

// ---------------------------------------------------------------------------
// Input / Output types
// ---------------------------------------------------------------------------

export interface TaxEngineTransaction {
  /** PRD-1 transaction type */
  type: 'income' | 'business_expense' | 'personal_expense' | 'transfer' | 'uncategorised';
  /** Transaction direction; used to classify uncategorised taxable flows */
  direction?: 'credit' | 'debit';
  /** Amount converted to NGN, in kobo */
  amountNgn: number;
  /** Original transaction currency (for unsupported currency flagging) */
  currency?: string;
  /** Whether this expense is tax-deductible (only relevant for business_expense) */
  isDeductible?: boolean;
  /** Percentage of amountNgn that is deductible (0–100); defaults to 100 */
  deductiblePercent?: number;
  /** WHT deducted at source, in kobo (only relevant for income transactions) */
  whtDeducted?: number;
  /** Whether the amountNgn is VAT-inclusive; used to reclaim input VAT */
  isVatInclusive?: boolean;
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

export interface TaxEngineCapitalDisposal {
  acquisitionCostNgn: number;
  disposalProceedsNgn: number;
  isExempt?: boolean;
  exemptionReason?: string;
}

export interface TaxEngineInput {
  transactions: TaxEngineTransaction[];
  /** User-declared reliefs for this tax year; null if no declaration saved yet */
  declarations: TaxEngineDeclarations | null;
  /** Entity type determines which tax regime applies */
  entityType: 'individual' | 'business_name' | 'llc';
  taxYear: number;
  /** Capital asset disposals for CGT computation */
  capitalDisposals?: TaxEngineCapitalDisposal[];
  /** Whether entity is VAT-registered */
  isVatRegistered?: boolean;
  /**
   * Pre-computed output VAT (from invoices: subtotal × 7.5%).
   * Pass 0 until invoice module is implemented.
   */
  outputVatNgn?: number;
  /**
   * Gross fixed assets (kobo) declared by user — for CIT small company exemption.
   * If undefined, small company exemption is assumed to apply.
   */
  grossFixedAssetsNgn?: number;
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
  /** Total gross income (income + uncategorised inflows), in kobo */
  totalGrossIncome: number;
  /** Total deductible expenses (business expenses only), in kobo */
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
  /**
   * Capital gains tax, in kobo.
   * For individuals: 0 (gains rolled into PIT above).
   * For LLCs: 30% of non-exempt net gains.
   */
  cgtPayable: number;
  /** Total capital gains (non-exempt disposals: proceeds − cost), in kobo */
  cgGains: number;
  /** CIT payable (LLCs only); 0 for individuals/business names, in kobo */
  citPayable: number;
  /** Net VAT payable (output − input); 0 if not VAT-registered, in kobo */
  vatPayable: number;
  /** Total tax liability: netTaxPayable + cgtPayable + citPayable + vatPayable, in kobo */
  totalTaxPayable: number;
  /** netTaxPayable / totalGrossIncome (as decimal 0–1); 0 if no income */
  effectiveTaxRate: number;
  /** Number of transactions with type='uncategorised' */
  uncategorisedCount: number;
  /** True if netTaxPayable === 0 OR taxableIncome ≤ ₦800k (nil return required) */
  isNilReturn: boolean;
  /** Currencies found in transactions that are not in the supported list */
  unsupportedCurrencies: string[];
}

// ---------------------------------------------------------------------------
// Engine version router (PRD-3 §5.12)
// ---------------------------------------------------------------------------

/**
 * Returns the correct engine version for a given tax year.
 * Historical summaries already cached with a specific engineVersion are
 * never recomputed — the version string ensures immutability.
 *
 * Add new cases here when computation logic changes in future years.
 */
export function getEngineForYear(_taxYear: number): string {
  // Currently only one engine version exists.
  // Future: return '2.0.0' for taxYear >= 2026, etc.
  return TAX_ENGINE_VERSION;
}

// ---------------------------------------------------------------------------
// Core engine
// ---------------------------------------------------------------------------

/**
 * Run the NTA 2025 full tax computation (PIT + CIT + CGT + VAT).
 *
 * Pure function — identical inputs always produce identical outputs.
 * Call this from a Convex query/action; never import Convex APIs here.
 */
export function runTaxEngine(input: TaxEngineInput): TaxEngineOutput {
  const { transactions, declarations, entityType, capitalDisposals = [], isVatRegistered = false } = input;

  // ------------------------------------------------------------------
  // Unsupported currency detection
  // ------------------------------------------------------------------
  const unsupportedCurrencies = Array.from(
    new Set(
      transactions
        .filter((t) => t.currency && !(SUPPORTED_CURRENCIES as readonly string[]).includes(t.currency))
        .map((t) => t.currency as string)
    )
  );

  // ------------------------------------------------------------------
  // Step 1: Uncategorised count
  // ------------------------------------------------------------------
  const uncategorisedCount = transactions.filter((t) => t.type === 'uncategorised').length;

  // ------------------------------------------------------------------
  // Step 2: CGT — compute capital gains for non-exempt disposals
  // ------------------------------------------------------------------
  const cgGains = computeCgGains(capitalDisposals);

  // ------------------------------------------------------------------
  // Step 3: Gross income
  // For individuals: add CGT gains to gross income (gains taxed via PIT bands).
  // For LLCs: gains are taxed separately at 30% flat.
  // Include type='income' and uncategorised credits as taxable inflow.
  // ------------------------------------------------------------------
  const incomeFromTransactions = transactions
    .filter((t) => t.type === 'income' || (t.type === 'uncategorised' && t.direction === 'credit'))
    .reduce((sum, t) => sum + t.amountNgn, 0);

  const grossIncome =
    entityType === 'individual' || entityType === 'business_name'
      ? incomeFromTransactions + cgGains  // gains rolled into PIT for individuals
      : incomeFromTransactions;

  // ------------------------------------------------------------------
  // Step 4: Deductible business expenses
  // Sum amountNgn × (deductiblePercent / 100) for
  // business_expense entries where isDeductible=true.
  // Uncategorised debits are intentionally non-deductible until reviewed.
  // ------------------------------------------------------------------
  const totalBusinessExpenses = transactions
    .filter((t) => t.type === 'business_expense' && t.isDeductible === true)
    .reduce((sum, t) => {
      const pct = t.deductiblePercent ?? 100;
      return sum + Math.round((t.amountNgn * pct) / 100);
    }, 0);

  // ------------------------------------------------------------------
  // Step 5: Assessable profit (clamp to 0)
  // ------------------------------------------------------------------
  const assessableProfit = Math.max(0, grossIncome - totalBusinessExpenses);

  // ------------------------------------------------------------------
  // Step 6: Reliefs
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
  // Step 7: Taxable income (clamp to 0)
  // ------------------------------------------------------------------
  const taxableIncome = Math.max(0, assessableProfit - totalReliefs);

  // ------------------------------------------------------------------
  // Step 8: Progressive PIT bands
  // ------------------------------------------------------------------
  const bands = computePitBands(taxableIncome);
  const grossTaxFromBands = bands.reduce((sum, b) => sum + b.taxPayable, 0);

  // ------------------------------------------------------------------
  // Step 9: Minimum tax (NTA 2025 §5.5)
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
  // Step 10: WHT credits (from income transactions)
  // ------------------------------------------------------------------
  const whtCredits = transactions
    .filter(
      (t) =>
        (t.type === 'income' || (t.type === 'uncategorised' && t.direction === 'credit')) &&
        (t.whtDeducted ?? 0) > 0
    )
    .reduce((sum, t) => sum + (t.whtDeducted ?? 0), 0);

  // ------------------------------------------------------------------
  // Step 11: Net PIT payable after WHT offset (clamp to 0)
  // ------------------------------------------------------------------
  const netTaxPayable = Math.max(0, grossTaxPayable - whtCredits);

  // ------------------------------------------------------------------
  // Step 12: CGT payable
  // For individuals: gains already rolled into PIT above → cgtPayable = 0.
  // For LLCs: 30% flat on net capital gains.
  // ------------------------------------------------------------------
  const cgtPayable = entityType === 'llc'
    ? Math.round(cgGains * CGT_LLC_RATE)
    : 0;

  // ------------------------------------------------------------------
  // Step 13: CIT (LLCs only — NTA 2025 §5.9)
  // ------------------------------------------------------------------
  const citPayable = computeCit({
    entityType,
    assessableProfit,
    grossIncomeFromTransactions: incomeFromTransactions,
    grossFixedAssetsNgn: input.grossFixedAssetsNgn,
  });

  // ------------------------------------------------------------------
  // Step 14: VAT (NTA 2025 §5.10)
  // ------------------------------------------------------------------
  const vatPayable = isVatRegistered
    ? computeVat({ transactions, outputVatNgn: input.outputVatNgn ?? 0 })
    : 0;

  // ------------------------------------------------------------------
  // Step 15: Total tax payable
  // ------------------------------------------------------------------
  const totalTaxPayable = netTaxPayable + cgtPayable + citPayable + vatPayable;

  // ------------------------------------------------------------------
  // Step 16: Effective tax rate
  // ------------------------------------------------------------------
  const effectiveTaxRate =
    grossIncome > 0 ? Math.round((netTaxPayable / grossIncome) * 10000) / 10000 : 0;

  // ------------------------------------------------------------------
  // Step 17: Nil return detection (NTA 2025 §5.11)
  // Nil return when: netTaxPayable === 0 OR taxableIncome ≤ ₦800k
  // ------------------------------------------------------------------
  const isNilReturn = netTaxPayable === 0 || taxableIncome <= PIT_EXEMPT_THRESHOLD;

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
    cgtPayable,
    cgGains,
    citPayable,
    vatPayable,
    totalTaxPayable,
    effectiveTaxRate,
    uncategorisedCount,
    isNilReturn,
    unsupportedCurrencies,
  };
}

// ---------------------------------------------------------------------------
// CIT computation (NTA 2025 §5.9)
// ---------------------------------------------------------------------------

interface CitInput {
  entityType: 'individual' | 'business_name' | 'llc';
  assessableProfit: number;
  /** Gross income from transactions only (before CGT roll-in) */
  grossIncomeFromTransactions: number;
  /** User-declared gross fixed assets in kobo; undefined → assume exempt */
  grossFixedAssetsNgn?: number;
}

/**
 * Compute CIT for LLCs.
 *
 * Small company exemption: turnover ≤ ₦100m AND grossFixedAssets ≤ ₦250m
 * Otherwise: CIT = 30% of assessableProfit + 4% development levy (on assessableProfit)
 *
 * Returns 0 for individuals and business names (they pay PIT, not CIT).
 */
function computeCit(input: CitInput): number {
  const { entityType, assessableProfit, grossIncomeFromTransactions, grossFixedAssetsNgn } = input;

  if (entityType !== 'llc') return 0;
  if (assessableProfit <= 0) return 0;

  // Turnover = gross income from income transactions
  const turnover = grossIncomeFromTransactions;

  // Small company exemption check
  const isSmallCompany =
    turnover <= CIT_SMALL_CO_TURNOVER_CAP &&
    (grossFixedAssetsNgn === undefined || grossFixedAssetsNgn <= CIT_SMALL_CO_ASSETS_CAP);

  if (isSmallCompany) return 0;

  // CIT = 30% + 4% development levy, both on assessable profit
  const cit  = Math.round(assessableProfit * CIT_RATE);
  const levy = Math.round(assessableProfit * CIT_DEV_LEVY_RATE);
  return cit + levy;
}

// ---------------------------------------------------------------------------
// CGT helpers (NTA 2025 §5.8)
// ---------------------------------------------------------------------------

/**
 * Compute total non-exempt capital gains from a list of disposals.
 *
 * Exemptions (isExempt = true):
 *   - Principal residence (exemptionReason = 'principal_residence')
 *   - Qualifying shares   (exemptionReason = 'qualifying_shares')
 *   - Spouse transfers    (exemptionReason = 'spouse_transfer')
 *
 * Returns total net gains in kobo (negative gains clamped to 0 per disposal).
 */
function computeCgGains(disposals: TaxEngineCapitalDisposal[]): number {
  return disposals
    .filter((d) => !d.isExempt)
    .reduce((sum, d) => {
      const gain = Math.max(0, d.disposalProceedsNgn - d.acquisitionCostNgn);
      return sum + gain;
    }, 0);
}

// ---------------------------------------------------------------------------
// VAT computation (NTA 2025 §5.10)
// ---------------------------------------------------------------------------

interface VatInput {
  transactions: TaxEngineTransaction[];
  /** Pre-computed output VAT from invoices (subtotal × 7.5%) in kobo */
  outputVatNgn: number;
}

/**
 * Compute net VAT payable.
 *
 * outputVat = from invoices (passed as parameter)
 * inputVat  = sum of (amountNgn × 7.5/107.5) for business_expense transactions
 *             where isVatInclusive = true
 * netVatPayable = max(0, outputVat − inputVat)
 */
function computeVat(input: VatInput): number {
  const { transactions, outputVatNgn } = input;

  const inputVat = transactions
    .filter((t) => t.type === 'business_expense' && t.isVatInclusive === true)
    .reduce((sum, t) => sum + Math.round(t.amountNgn * VAT_INCLUSIVE_FACTOR), 0);

  return Math.max(0, outputVatNgn - inputVat);
}

// ---------------------------------------------------------------------------
// PIT band helper
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
