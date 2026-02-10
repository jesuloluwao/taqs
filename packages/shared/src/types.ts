export type UserType = 'freelancer' | 'business' | 'mixed';

export type TransactionType = 'income' | 'expense';

export type Currency = 'NGN' | 'USD' | 'GBP' | 'EUR';

export type DocumentKind = 'receipt' | 'invoice' | 'statement' | 'report';

export interface ProfileData {
  userType: UserType;
  businessName?: string;
  tin?: string;
  currency?: Currency;
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

