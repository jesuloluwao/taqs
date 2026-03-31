import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  users: defineTable({
    clerkUserId: v.string(),
    email: v.string(),
    fullName: v.optional(v.string()),
    phone: v.optional(v.string()),
    /** AES-256-GCM encrypted NIN */
    nin: v.optional(v.string()),
    /** User's personal TIN (from NTA) */
    firsTin: v.optional(v.string()),
    userType: v.optional(v.union(v.literal('freelancer'), v.literal('sme'), v.literal('salary_earner'))),
    profession: v.optional(v.string()),
    preferredCurrency: v.optional(
      v.union(v.literal('NGN'), v.literal('USD'), v.literal('GBP'), v.literal('EUR'))
    ),
    onboardingComplete: v.optional(v.boolean()),
    avatarStorageId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_clerk_user_id', ['clerkUserId'])
    .index('by_email', ['email']),

  entities: defineTable({
    userId: v.id('users'),
    name: v.string(),
    type: v.union(
      v.literal('individual'),
      v.literal('business_name'),
      v.literal('llc')
    ),
    tin: v.optional(v.string()),
    rcNumber: v.optional(v.string()),
    vatRegistered: v.optional(v.boolean()),
    vatThresholdExceeded: v.optional(v.boolean()),
    isDefault: v.optional(v.boolean()),
    taxYearStart: v.optional(v.number()),
    industry: v.optional(v.string()),
    annualTurnoverRange: v.optional(v.string()),
    deletedAt: v.optional(v.number()),
  })
    .index('by_userId', ['userId']),

  categories: defineTable({
    name: v.string(),
    type: v.union(
      v.literal('income'),
      v.literal('business_expense'),
      v.literal('personal_expense'),
      v.literal('transfer')
    ),
    /** Which transaction direction this category applies to */
    direction: v.optional(v.union(v.literal('credit'), v.literal('debit'), v.literal('both'))),
    isDeductibleDefault: v.optional(v.boolean()),
    ntaReference: v.optional(v.string()),
    isSystem: v.optional(v.boolean()),
    /** Null for system categories, userId for custom categories */
    userId: v.optional(v.id('users')),
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
  })
    .index('by_type', ['type'])
    .index('by_userId', ['userId']),

  userPreferences: defineTable({
    userId: v.id('users'),
    deadlineReminderDays: v.optional(v.number()),
    vatReminderEnabled: v.optional(v.boolean()),
    uncategorisedAlertFrequency: v.optional(
      v.union(v.literal('daily'), v.literal('weekly'), v.literal('never'))
    ),
    invoiceOverdueDays: v.optional(v.number()),
    pushEnabled: v.optional(v.boolean()),
  })
    .index('by_userId', ['userId']),

  connectedAccounts: defineTable({
    entityId: v.id('entities'),
    userId: v.id('users'),
    provider: v.string(),
    providerAccountId: v.optional(v.string()),
    accountName: v.optional(v.string()),
    currency: v.optional(
      v.union(v.literal('NGN'), v.literal('USD'), v.literal('GBP'), v.literal('EUR'))
    ),
    accessToken: v.optional(v.string()),
    refreshToken: v.optional(v.string()),
    tokenExpiresAt: v.optional(v.number()),
    lastSyncedAt: v.optional(v.number()),
    status: v.optional(
      v.union(v.literal('active'), v.literal('expired'), v.literal('error'), v.literal('disconnected'))
    ),
    errorMessage: v.optional(v.string()),
    /** PRD-8 enhanced metadata */
    metadata: v.optional(v.object({
      institutionId: v.optional(v.string()),
      institutionLogo: v.optional(v.string()),
      accountType: v.optional(v.string()),
      accountNumber: v.optional(v.string()),
      /** Link provider used: mono or stitch */
      linkProvider: v.optional(v.union(v.literal('mono'), v.literal('stitch'))),
      /** SHA-256 hash of API key (for display/verification without storing plaintext) */
      apiKeyHash: v.optional(v.string()),
    })),
  })
    .index('by_userId', ['userId'])
    .index('by_entityId', ['entityId'])
    .index('by_providerAccountId', ['providerAccountId'])
    .index('by_status', ['status']),

  bankAccounts: defineTable({
    entityId: v.id('entities'),
    userId: v.id('users'),
    bankName: v.string(),
    bankCode: v.string(),
    accountNumber: v.optional(v.string()),
    accountName: v.optional(v.string()),
    nickname: v.string(),
    currency: v.union(v.literal('NGN'), v.literal('USD'), v.literal('GBP'), v.literal('EUR')),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_entityId', ['entityId'])
    .index('by_userId', ['userId'])
    .index('by_entityId_isActive', ['entityId', 'isActive']),

  /**
   * OAuth PKCE state tokens for bank/payment OAuth flows (PRD-8).
   * Each entry is single-use and expires in 10 minutes.
   */
  oauthStates: defineTable({
    userId: v.id('users'),
    entityId: v.id('entities'),
    provider: v.string(),
    stateToken: v.string(),
    redirectUri: v.string(),
    expiresAt: v.number(),
  })
    .index('by_stateToken', ['stateToken'])
    .index('by_expiresAt', ['expiresAt']),

  /**
   * Full PRD-1 transaction schema with all tax-relevant fields.
   */
  transactions: defineTable({
    entityId: v.id('entities'),
    userId: v.id('users'),
    connectedAccountId: v.optional(v.id('connectedAccounts')),
    bankAccountId: v.optional(v.id('bankAccounts')),
    importJobId: v.optional(v.id('importJobs')),
    /** Unix timestamp (ms) of transaction */
    date: v.number(),
    description: v.string(),
    enrichedDescription: v.optional(v.string()),
    /** Amount in smallest currency unit (kobo for NGN) */
    amount: v.number(),
    currency: v.union(v.literal('NGN'), v.literal('USD'), v.literal('GBP'), v.literal('EUR')),
    /** Amount converted to NGN in kobo */
    amountNgn: v.number(),
    /** FX rate used for NGN conversion (1 if currency is NGN) */
    fxRate: v.optional(v.number()),
    direction: v.union(v.literal('credit'), v.literal('debit')),
    type: v.union(
      v.literal('income'),
      v.literal('business_expense'),
      v.literal('personal_expense'),
      v.literal('transfer'),
      v.literal('uncategorised')
    ),
    categoryId: v.optional(v.id('categories')),
    isDeductible: v.optional(v.boolean()),
    /** Percentage of amount that is tax-deductible (0–100) */
    deductiblePercent: v.optional(v.number()),
    /** WHT amount deducted at source, in smallest currency unit */
    whtDeducted: v.optional(v.number()),
    /** WHT rate applied (%) */
    whtRate: v.optional(v.number()),
    /** Linked invoice ID (future) */
    invoiceId: v.optional(v.string()),
    notes: v.optional(v.string()),
    /** External reference for deduplication (e.g. bank transaction ID) */
    externalRef: v.optional(v.string()),
    isDuplicate: v.optional(v.boolean()),
    taxYear: v.number(),
    reviewedByUser: v.optional(v.boolean()),
    // AI categorisation fields (PRD-2)
    aiCategorySuggestion: v.optional(v.string()),
    aiTypeSuggestion: v.optional(v.union(
      v.literal('income'),
      v.literal('business_expense'),
      v.literal('personal_expense'),
      v.literal('transfer'),
      v.literal('uncategorised')
    )),
    aiCategoryConfidence: v.optional(v.number()),
    aiReasoning: v.optional(v.string()),
    aiCategorisingJobId: v.optional(v.id('categorisingJobs')),
    aiCategorisedAt: v.optional(v.number()),
    userOverrodeAi: v.optional(v.boolean()),
    /** Whether the transaction amount is VAT-inclusive (for input VAT reclaimability) */
    isVatInclusive: v.optional(v.boolean()),
    /** Whether this transaction is detected/confirmed salary income */
    isSalaryIncome: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_entityId_taxYear', ['entityId', 'taxYear'])
    .index('by_entityId_date', ['entityId', 'date'])
    .index('by_entityId_type', ['entityId', 'type'])
    .index('by_userId', ['userId'])
    .index('by_bankAccountId', ['bankAccountId'])
    .index('by_importJobId', ['importJobId']),

  /**
   * Tracks file import lifecycle: pending → processing → complete/failed.
   */
  importJobs: defineTable({
    entityId: v.id('entities'),
    userId: v.id('users'),
    connectedAccountId: v.optional(v.id('connectedAccounts')),
    bankAccountId: v.optional(v.id('bankAccounts')),
    source: v.union(
      v.literal('pdf'),
      v.literal('csv'),
      v.literal('bank_api'),
      v.literal('paystack'),
      v.literal('flutterwave'),
      v.literal('manual')
    ),
    status: v.union(
      v.literal('pending'),
      v.literal('processing'),
      v.literal('complete'),
      v.literal('failed')
    ),
    /** Convex storage ID for the uploaded file */
    storageId: v.optional(v.string()),
    totalParsed: v.optional(v.number()),
    totalImported: v.optional(v.number()),
    duplicatesSkipped: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_entityId', ['entityId'])
    .index('by_connectedAccountId', ['connectedAccountId'])
    .index('by_userId', ['userId'])
    .index('by_bankAccountId', ['bankAccountId']),

  /**
   * Tracks batch AI categorisation operations (PRD-2).
   */
  categorisingJobs: defineTable({
    entityId: v.id('entities'),
    userId: v.id('users'),
    importJobId: v.optional(v.id('importJobs')),
    status: v.union(
      v.literal('pending'),
      v.literal('processing'),
      v.literal('complete'),
      v.literal('failed'),
      v.literal('cancelled')
    ),
    totalTransactions: v.number(),
    totalCategorised: v.optional(v.number()),
    totalLowConfidence: v.optional(v.number()),
    totalFailed: v.optional(v.number()),
    batchesTotal: v.optional(v.number()),
    batchesCompleted: v.optional(v.number()),
    confidenceThreshold: v.number(),
    modelUsed: v.optional(v.string()),
    totalTokensUsed: v.optional(v.number()),
    estimatedCostUsd: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_entityId', ['entityId'])
    .index('by_importJobId', ['importJobId'])
    .index('by_userId', ['userId']),

  /**
   * Records user overrides of AI category suggestions for few-shot learning (PRD-2).
   */
  aiCategorisationFeedback: defineTable({
    entityId: v.id('entities'),
    userId: v.id('users'),
    transactionId: v.id('transactions'),
    aiSuggestedCategory: v.optional(v.string()),
    aiSuggestedType: v.optional(v.union(
      v.literal('income'),
      v.literal('business_expense'),
      v.literal('personal_expense'),
      v.literal('transfer'),
      v.literal('uncategorised')
    )),
    aiConfidence: v.optional(v.number()),
    userChosenCategory: v.string(),
    userChosenType: v.union(
      v.literal('income'),
      v.literal('business_expense'),
      v.literal('personal_expense'),
      v.literal('transfer'),
      v.literal('uncategorised')
    ),
    transactionDescription: v.string(),
    transactionAmount: v.number(),
    transactionDirection: v.union(v.literal('credit'), v.literal('debit')),
    createdAt: v.number(),
  })
    .index('by_entityId', ['entityId'])
    .index('by_userId', ['userId'])
    .index('by_transactionId', ['transactionId']),

  documents: defineTable({
    userId: v.id('users'),
    kind: v.union(
      v.literal('receipt'),
      v.literal('invoice'),
      v.literal('statement'),
      v.literal('report')
    ),
    storageId: v.string(),
    filename: v.string(),
    createdAt: v.number(),
  })
    .index('by_user_id', ['userId']),

  /**
   * Cached tax engine output per entity per tax year (PRD-3 §7.3).
   * Recomputed on demand; versioned for historical immutability.
   */
  taxYearSummaries: defineTable({
    entityId: v.id('entities'),
    userId: v.id('users'),
    taxYear: v.number(),
    engineVersion: v.string(),
    /** Total gross income in kobo */
    totalGrossIncome: v.number(),
    /** Total business expenses in kobo */
    totalBusinessExpenses: v.number(),
    /** Relief breakdown in kobo */
    reliefs: v.object({
      rent: v.number(),
      pension: v.number(),
      nhis: v.number(),
      nhf: v.number(),
      lifeInsurance: v.number(),
      mortgage: v.number(),
      total: v.number(),
    }),
    /** Taxable income in kobo */
    taxableIncome: v.number(),
    /** PIT bands — each band's income and tax payable in kobo */
    bands: v.array(
      v.object({
        rate: v.number(),
        from: v.number(),
        to: v.optional(v.number()),
        income: v.number(),
        taxPayable: v.number(),
      })
    ),
    /** Assessable profit (grossIncome − expenses, clamped) in kobo */
    assessableProfit: v.number(),
    /** Gross PIT before credits, in kobo */
    grossTaxPayable: v.number(),
    /** Aggregate WHT credits in kobo */
    whtCredits: v.number(),
    /** Net PIT after WHT offset, in kobo */
    netTaxPayable: v.number(),
    /** True if minimum tax rule overrode band-computed gross tax */
    minimumTaxApplied: v.boolean(),
    /** Total capital gains from non-exempt disposals, in kobo */
    cgGains: v.optional(v.number()),
    /** CGT payable (LLCs: 30% flat; individuals: 0 — gains rolled into PIT) in kobo */
    cgtPayable: v.optional(v.number()),
    /** VAT payable (output − input) in kobo; 0 if not VAT-registered */
    vatPayable: v.optional(v.number()),
    /** CIT payable (LLCs only) in kobo */
    citPayable: v.optional(v.number()),
    /** Total tax liability (PIT + CGT + CIT + VAT) in kobo */
    totalTaxPayable: v.number(),
    /** Effective tax rate (netTaxPayable / grossIncome) as decimal */
    effectiveTaxRate: v.number(),
    /** Count of uncategorised transactions at time of computation */
    uncategorisedCount: v.number(),
    /** True if no tax is owed and a nil return should be filed */
    isNilReturn: v.boolean(),
    /** PAYE deducted by employer, in kobo (v1.3.0+) */
    payeCredits: v.optional(v.number()),
    /** Total employment income (gross salary from confirmed records), in kobo (v1.3.0+) */
    totalEmploymentIncome: v.optional(v.number()),
    /** Unix timestamp (ms) when computation ran */
    computedAt: v.number(),
  })
    .index('by_entityId_taxYear', ['entityId', 'taxYear']),

  /**
   * User-declared tax reliefs per entity per tax year (PRD-3 §7.3).
   */
  taxDeclarations: defineTable({
    entityId: v.id('entities'),
    userId: v.id('users'),
    taxYear: v.number(),
    /** Annual rent paid in kobo */
    annualRentPaid: v.optional(v.number()),
    /** Pension contributions in kobo */
    pensionContributions: v.optional(v.number()),
    /** NHIS contributions in kobo */
    nhisContributions: v.optional(v.number()),
    /** NHF contributions in kobo */
    nhfContributions: v.optional(v.number()),
    /** Life insurance premiums in kobo */
    lifeInsurancePremiums: v.optional(v.number()),
    /** Mortgage interest paid in kobo */
    mortgageInterest: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_entityId_taxYear', ['entityId', 'taxYear']),

  /**
   * Client directory for invoicing (PRD-4).
   */
  clients: defineTable({
    entityId: v.id('entities'),
    userId: v.id('users'),
    name: v.string(),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    /** Default currency for invoices to this client */
    currency: v.optional(
      v.union(v.literal('NGN'), v.literal('USD'), v.literal('GBP'), v.literal('EUR'))
    ),
    /** Default WHT rate (%) applied to invoices for this client (0, 5, or 10) */
    whtRate: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_entityId', ['entityId'])
    .index('by_userId', ['userId'])
    .index('by_entityId_name', ['entityId', 'name']),

  /**
   * Invoices with line-item totals, WHT, VAT, and PDF storage (PRD-4).
   */
  invoices: defineTable({
    entityId: v.id('entities'),
    userId: v.id('users'),
    /** Linked client record (optional — client may be deleted) */
    clientId: v.optional(v.id('clients')),
    /** Denormalised client name for display after client deletion */
    clientName: v.string(),
    /** Denormalised client email for sending after client deletion */
    clientEmail: v.optional(v.string()),
    /** Sequential invoice number e.g. INV-2026-0001 */
    invoiceNumber: v.string(),
    status: v.union(
      v.literal('draft'),
      v.literal('sent'),
      v.literal('paid'),
      v.literal('overdue'),
      v.literal('cancelled')
    ),
    /** Unix timestamp (ms) */
    issueDate: v.number(),
    /** Unix timestamp (ms) */
    dueDate: v.number(),
    currency: v.union(v.literal('NGN'), v.literal('USD'), v.literal('GBP'), v.literal('EUR')),
    /** Sum of all line item totals before WHT/VAT, in smallest currency unit */
    subtotal: v.number(),
    /** WHT amount deducted, in smallest currency unit */
    whtAmount: v.optional(v.number()),
    /** VAT amount added (7.5%), in smallest currency unit */
    vatAmount: v.optional(v.number()),
    /** Final amount due: subtotal − whtAmount + vatAmount */
    totalDue: v.number(),
    /** totalDue converted to NGN kobo */
    amountNgn: v.number(),
    /** Unix timestamp (ms) when marked paid */
    paidAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    isRecurring: v.optional(v.boolean()),
    recurringInterval: v.optional(
      v.union(v.literal('monthly'), v.literal('quarterly'))
    ),
    /** Unix timestamp (ms) for next auto-issue date on recurring invoices */
    nextIssueDate: v.optional(v.number()),
    /** WHT rate applied to this invoice (0, 5, or 10) */
    whtRate: v.optional(v.number()),
    /** Convex storage ID for the generated PDF */
    pdfStorageId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_entityId_status', ['entityId', 'status'])
    .index('by_entityId_dueDate', ['entityId', 'dueDate'])
    .index('by_userId', ['userId'])
    .index('by_entityId_invoiceNumber', ['entityId', 'invoiceNumber'])
    .index('by_entityId_isRecurring', ['entityId', 'isRecurring']),

  /**
   * Line items belonging to an invoice (PRD-4).
   */
  invoiceItems: defineTable({
    invoiceId: v.id('invoices'),
    description: v.string(),
    /** Number of units */
    quantity: v.number(),
    /** Price per unit in smallest currency unit */
    unitPrice: v.number(),
    /** quantity × unitPrice */
    total: v.number(),
  })
    .index('by_invoiceId', ['invoiceId']),

  /**
   * CBN FX rates for currency conversion in tax computations.
   */
  fxRates: defineTable({
    /** ISO date string YYYY-MM-DD */
    date: v.string(),
    currency: v.union(v.literal('USD'), v.literal('GBP'), v.literal('EUR')),
    /** NGN units per 1 unit of foreign currency */
    cbnRate: v.number(),
  })
    .index('by_date_currency', ['date', 'currency']),

  /**
   * Filing records — one per entity per tax year (PRD-6).
   * Captures an immutable TaxSummarySnapshot at generation time.
   */
  filingRecords: defineTable({
    entityId: v.id('entities'),
    userId: v.id('users'),
    taxYear: v.number(),
    /** Filing lifecycle status */
    status: v.union(
      v.literal('draft'),
      v.literal('generated'),
      v.literal('submitted'),
      v.literal('payment_pending'),
      v.literal('payment_confirmed'),
      v.literal('tcc_obtained')
    ),
    /** Convex storage ID for the generated self-assessment PDF */
    selfAssessmentPdfId: v.optional(v.string()),
    /** Convex storage ID for the uploaded payment receipt */
    paymentReceiptId: v.optional(v.string()),
    /** Convex storage ID for the uploaded TCC document */
    tccDocumentId: v.optional(v.string()),
    /** Unix timestamp (ms) when marked as submitted */
    submittedAt: v.optional(v.number()),
    /** Net tax payable in kobo at generation time */
    netTaxPayable: v.optional(v.number()),
    /** JSON.stringify(TaxEngineOutput) — immutable audit snapshot at generation */
    taxSummarySnapshot: v.optional(v.string()),
    /** Unix timestamp (ms) when PDF was generated */
    generatedAt: v.optional(v.number()),
    /** Engine version used at generation time */
    engineVersion: v.optional(v.string()),
    /** True if no tax was owed at generation time */
    isNilReturn: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_entityId_taxYear', ['entityId', 'taxYear'])
    .index('by_userId', ['userId'])
    .index('by_status', ['status']),

  /**
   * In-app notifications (PRD-9).
   */
  notifications: defineTable({
    userId: v.id('users'),
    type: v.union(
      v.literal('filing_deadline'),
      v.literal('vat_return'),
      v.literal('uncategorised_alert'),
      v.literal('invoice_overdue'),
      v.literal('import_result'),
      v.literal('sync_error'),
      v.literal('recurring_invoice'),
      v.literal('general')
    ),
    title: v.string(),
    body: v.string(),
    /** Primary entity ID for deep-link navigation */
    entityId: v.optional(v.string()),
    /** Related record ID (e.g. invoiceId, importJobId) */
    relatedId: v.optional(v.string()),
    read: v.boolean(),
    readAt: v.optional(v.number()),
  })
    .index('by_userId_read', ['userId', 'read'])
    .index('by_userId_creationTime', ['userId'])
    .index('by_userId_type', ['userId', 'type']),

  /**
   * FCM/APNs push tokens per user device (PRD-9).
   */
  pushTokens: defineTable({
    userId: v.id('users'),
    token: v.string(),
    platform: v.union(v.literal('ios'), v.literal('android'), v.literal('web')),
    active: v.boolean(),
    lastUsedAt: v.optional(v.number()),
  })
    .index('by_userId_active', ['userId', 'active'])
    .index('by_token', ['token']),

  /**
   * Capital asset disposals for CGT computation (PRD-3).
   */
  capitalDisposals: defineTable({
    entityId: v.id('entities'),
    userId: v.id('users'),
    taxYear: v.number(),
    assetDescription: v.string(),
    /** Acquisition cost in kobo */
    acquisitionCostNgn: v.number(),
    /** Disposal proceeds in kobo */
    disposalProceedsNgn: v.number(),
    /** Unix timestamp (ms) */
    acquisitionDate: v.number(),
    /** Unix timestamp (ms) */
    disposalDate: v.number(),
    isExempt: v.optional(v.boolean()),
    exemptionReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_entityId_taxYear', ['entityId', 'taxYear']),

  /**
   * Employment income records — one per employer per month per tax year.
   * Links payslip data to detected salary transactions.
   */
  employmentIncomeRecords: defineTable({
    entityId: v.id('entities'),
    userId: v.id('users'),
    taxYear: v.number(),
    month: v.number(),
    employerName: v.string(),
    /** Gross monthly salary in kobo — authoritative for tax engine */
    grossSalary: v.number(),
    /** PAYE deducted by employer this month, in kobo */
    payeDeducted: v.number(),
    /** Pension deducted at source by employer, in kobo */
    pensionDeducted: v.optional(v.number()),
    /** NHIS deducted at source, in kobo */
    nhisDeducted: v.optional(v.number()),
    /** NHF deducted at source, in kobo */
    nhfDeducted: v.optional(v.number()),
    /** Net salary (gross minus all deductions) for reconciliation, in kobo */
    netSalary: v.optional(v.number()),
    /** Linked salary transaction (bank credit evidence) */
    transactionId: v.optional(v.id('transactions')),
    source: v.union(v.literal('payslip'), v.literal('detected'), v.literal('manual')),
    status: v.union(v.literal('pending'), v.literal('confirmed'), v.literal('rejected')),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_entityId_taxYear', ['entityId', 'taxYear'])
    .index('by_entityId_month', ['entityId', 'month'])
    .index('by_transactionId', ['transactionId'])
    .index('by_userId_taxYear', ['userId', 'taxYear']),
});
