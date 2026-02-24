// ─── Primitive types ────────────────────────────────────────────────────────

export type UserType = 'freelancer' | 'sme';

export type EntityType = 'individual' | 'business_name' | 'llc';

export type CategoryType = 'income' | 'business_expense' | 'personal_expense' | 'transfer';

export type TransactionType = 'income' | 'expense';

export type Currency = 'NGN' | 'USD' | 'GBP' | 'EUR';

export type DocumentKind = 'receipt' | 'invoice' | 'statement' | 'report';

export type ConnectedAccountStatus = 'active' | 'expired' | 'error' | 'disconnected';

export type UncategorisedAlertFrequency = 'daily' | 'weekly' | 'never';

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

export interface TransactionData {
  type: TransactionType;
  amountKobo: number;
  currency: Currency;
  category: string;
  description?: string;
  transactionDate: number;
  source?: 'manual' | 'bank_import';
}
