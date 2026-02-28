// ─── Primitive types ────────────────────────────────────────────────────────

export type UserType = 'freelancer' | 'sme';

export type EntityType = 'individual' | 'business_name' | 'llc';

export type CategoryType = 'income' | 'business_expense' | 'personal_expense' | 'transfer';

/** Expanded transaction type — replaces the old 'income' | 'expense' binary */
export type TransactionType =
  | 'income'
  | 'business_expense'
  | 'personal_expense'
  | 'transfer'
  | 'uncategorised';

export type TransactionDirection = 'credit' | 'debit';

export type Currency = 'NGN' | 'USD' | 'GBP' | 'EUR';

export type DocumentKind = 'receipt' | 'invoice' | 'statement' | 'report';

export type ConnectedAccountStatus = 'active' | 'expired' | 'error' | 'disconnected';

export type UncategorisedAlertFrequency = 'daily' | 'weekly' | 'never';

export type ImportJobSource = 'pdf' | 'csv' | 'bank_api' | 'paystack' | 'flutterwave' | 'manual';

export type ImportJobStatus = 'pending' | 'processing' | 'complete' | 'failed';

// ─── Data interfaces ─────────────────────────────────────────────────────────

export interface UserData {
  fullName?: string;
  phone?: string;
  /** AES-256-GCM encrypted NIN */
  nin?: string;
  firsTin?: string;
  userType?: UserType;
  profession?: string;
  preferredCurrency?: Currency;
  onboardingComplete?: boolean;
  avatarStorageId?: string;
}

export interface EntityData {
  name: string;
  type: EntityType;
  tin?: string;
  rcNumber?: string;
  vatRegistered?: boolean;
  vatThresholdExceeded?: boolean;
  isDefault?: boolean;
  taxYearStart?: number;
}

export interface CategoryData {
  name: string;
  type: CategoryType;
  isDeductibleDefault?: boolean;
  ntaReference?: string;
  isSystem?: boolean;
  userId?: string;
  icon?: string;
  color?: string;
}

export interface UserPreferencesData {
  deadlineReminderDays?: number;
  vatReminderEnabled?: boolean;
  uncategorisedAlertFrequency?: UncategorisedAlertFrequency;
  invoiceOverdueDays?: number;
  pushEnabled?: boolean;
}

export interface ConnectedAccountData {
  provider: string;
  providerAccountId?: string;
  accountName?: string;
  currency?: Currency;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: number;
  lastSyncedAt?: number;
  status?: ConnectedAccountStatus;
  errorMessage?: string;
}

/**
 * Full PRD-1 transaction data shape (all tax-relevant fields).
 */
export interface TransactionData {
  /** Entity this transaction belongs to */
  entityId: string;
  /** Connected account this transaction came from (optional) */
  connectedAccountId?: string;
  /** Import job that created this transaction (optional) */
  importJobId?: string;
  /** Unix timestamp (ms) of transaction */
  date: number;
  description: string;
  /** AI-enriched description */
  enrichedDescription?: string;
  /** Amount in smallest currency unit (kobo for NGN) */
  amount: number;
  currency: Currency;
  /** Amount converted to NGN kobo */
  amountNgn: number;
  /** FX rate used for NGN conversion */
  fxRate?: number;
  direction: TransactionDirection;
  type: TransactionType;
  categoryId?: string;
  isDeductible?: boolean;
  /** Percentage of amount that is tax-deductible (0–100) */
  deductiblePercent?: number;
  /** WHT amount deducted at source, in smallest currency unit */
  whtDeducted?: number;
  /** WHT rate applied (%) */
  whtRate?: number;
  /** Linked invoice ID */
  invoiceId?: string;
  notes?: string;
  /** External reference for deduplication (e.g. bank transaction ID) */
  externalRef?: string;
  isDuplicate?: boolean;
  taxYear: number;
  reviewedByUser?: boolean;
}

// ─── Invoicing types ──────────────────────────────────────────────────────────

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';

export type RecurringInterval = 'monthly' | 'quarterly';

/**
 * Client directory entry.
 */
export interface ClientData {
  entityId: string;
  name: string;
  email?: string;
  address?: string;
  /** Default invoice currency */
  currency?: Currency;
  /** Default WHT rate (%) — 0, 5, or 10 */
  whtRate?: number;
}

/**
 * Invoice data shape (PRD-4).
 */
export interface InvoiceData {
  entityId: string;
  clientId?: string;
  /** Denormalised client name */
  clientName: string;
  /** Denormalised client email */
  clientEmail?: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  /** Unix timestamp (ms) */
  issueDate: number;
  /** Unix timestamp (ms) */
  dueDate: number;
  currency: Currency;
  /** Sum of line items before WHT/VAT, in smallest currency unit */
  subtotal: number;
  /** WHT deducted, in smallest currency unit */
  whtAmount?: number;
  /** VAT added, in smallest currency unit */
  vatAmount?: number;
  /** Final amount: subtotal − whtAmount + vatAmount */
  totalDue: number;
  /** totalDue in NGN kobo */
  amountNgn: number;
  /** Unix timestamp (ms) when marked paid */
  paidAt?: number;
  notes?: string;
  isRecurring?: boolean;
  recurringInterval?: RecurringInterval;
  /** Unix timestamp (ms) for next auto-issue */
  nextIssueDate?: number;
  /** Convex storage ID for generated PDF */
  pdfStorageId?: string;
}

/**
 * Invoice line item data shape (PRD-4).
 */
export interface InvoiceItemData {
  invoiceId: string;
  description: string;
  quantity: number;
  /** Price per unit in smallest currency unit */
  unitPrice: number;
  /** quantity × unitPrice */
  total: number;
}

/**
 * Import job data shape.
 */
export interface ImportJobData {
  entityId: string;
  connectedAccountId?: string;
  source: ImportJobSource;
  status: ImportJobStatus;
  /** Convex storage ID for the uploaded file */
  storageId?: string;
  totalParsed?: number;
  totalImported?: number;
  duplicatesSkipped?: number;
  errorMessage?: string;
  startedAt?: number;
  completedAt?: number;
}
