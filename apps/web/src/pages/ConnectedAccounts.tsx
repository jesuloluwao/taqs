import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import {
  Link2,
  Plus,
  WifiOff,
  AlertCircle,
  Clock,
  Wifi,
  ChevronRight,
  UploadCloud,
  ChevronLeft,
  ChevronDown,
  Building2,
  Search,
  Check,
  Archive,
  RotateCcw,
  Pencil,
  X,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useEntity } from '../contexts/EntityContext';
import { Skeleton } from '../components/Skeleton';
import { NIGERIAN_BANKS } from '@convex/lib/nigerianBanks';

// ─── Types ────────────────────────────────────────────────────────────────────

type AccountStatus = 'active' | 'expired' | 'error' | 'disconnected';

interface ConnectedAccount {
  _id: Id<'connectedAccounts'>;
  entityId: Id<'entities'>;
  userId: Id<'users'>;
  provider: string;
  providerAccountId?: string;
  accountName?: string;
  currency?: string;
  lastSyncedAt?: number;
  status?: AccountStatus;
  errorMessage?: string;
  metadata?: {
    institutionLogo?: string;
    accountType?: string;
    accountNumber?: string;
    institutionId?: string;
  };
}

interface BankAccount {
  _id: Id<'bankAccounts'>;
  entityId: Id<'entities'>;
  userId: Id<'users'>;
  bankName: string;
  bankCode: string;
  accountNumber?: string;
  accountName?: string;
  nickname: string;
  currency: 'NGN' | 'USD' | 'GBP' | 'EUR';
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function maskAccountNumber(accountNumber?: string): string {
  if (!accountNumber || accountNumber.length < 4) return '';
  return `···${accountNumber.slice(-4)}`;
}

const PROVIDER_LABELS: Record<string, string> = {
  statement_upload: 'Statement Upload',
  manual: 'Manual Entry',
  mono: 'Mono Connect',
  stitch: 'Stitch',
  paystack: 'Paystack',
  flutterwave: 'Flutterwave',
  payoneer: 'Payoneer',
  wise: 'Wise',
};

const PROVIDER_BADGE_COLORS: Record<string, string> = {
  paystack: 'bg-emerald-100 text-emerald-700',
  flutterwave: 'bg-orange-100 text-orange-700',
  mono: 'bg-blue-100 text-blue-700',
  stitch: 'bg-purple-100 text-purple-700',
  payoneer: 'bg-red-100 text-red-700',
  wise: 'bg-teal-100 text-teal-700',
  statement_upload: 'bg-neutral-100 text-neutral-600',
  manual: 'bg-neutral-100 text-neutral-600',
};

const CURRENCY_BADGE_COLORS: Record<string, string> = {
  NGN: 'bg-emerald-100 text-emerald-700',
  USD: 'bg-blue-100 text-blue-700',
  GBP: 'bg-purple-100 text-purple-700',
  EUR: 'bg-amber-100 text-amber-700',
};

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status?: AccountStatus }) {
  const s = status ?? 'active';
  const styles: Record<AccountStatus, string> = {
    active: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    expired: 'text-amber-700 bg-amber-50 border-amber-200',
    error: 'text-red-700 bg-red-50 border-red-200',
    disconnected: 'text-neutral-500 bg-neutral-100 border-neutral-200',
  };
  const icons: Record<AccountStatus, typeof Wifi> = {
    active: Wifi,
    expired: Clock,
    error: AlertCircle,
    disconnected: WifiOff,
  };
  const labels: Record<AccountStatus, string> = {
    active: 'Active',
    expired: 'Expired',
    error: 'Error',
    disconnected: 'Disconnected',
  };
  const Icon = icons[s];
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${styles[s]}`}
    >
      <Icon className="w-2.5 h-2.5" />
      {labels[s]}
    </span>
  );
}

// ─── Institution Logo ─────────────────────────────────────────────────────────

function InstitutionLogo({ account }: { account: ConnectedAccount }) {
  const logo = account.metadata?.institutionLogo;
  const providerLabel = PROVIDER_LABELS[account.provider] ?? account.provider;
  const initials = (account.accountName ?? providerLabel)
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  if (logo) {
    return (
      <img
        src={logo}
        alt={providerLabel}
        className="w-10 h-10 rounded-xl object-contain bg-white border border-border"
      />
    );
  }

  const colorClass = PROVIDER_BADGE_COLORS[account.provider] ?? 'bg-muted text-muted-foreground';
  return (
    <div
      className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-bold ${colorClass}`}
    >
      {initials || <Link2 className="w-5 h-5" />}
    </div>
  );
}

// ─── Connected Account Card ──────────────────────────────────────────────────

function AccountCard({
  account,
  onClick,
}: {
  account: ConnectedAccount;
  onClick: () => void;
}) {
  const isDisconnected = account.status === 'disconnected';
  const accountType = account.metadata?.accountType;

  return (
    <button
      onClick={onClick}
      className={`w-full px-4 py-4 flex items-center gap-3 text-left hover:bg-muted/40 transition-colors ${isDisconnected ? 'opacity-60' : ''}`}
    >
      {/* Logo */}
      <div className="flex-shrink-0">
        <InstitutionLogo account={account} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <span className="text-sm font-medium text-foreground truncate">
            {account.accountName ?? 'Unnamed Account'}
          </span>
          <StatusBadge status={account.status} />
        </div>
        <span className="text-xs text-muted-foreground">
          {PROVIDER_LABELS[account.provider] ?? account.provider}
          {accountType ? ` · ${accountType}` : ''}
          {account.currency ? ` · ${account.currency}` : ''}
        </span>
        {account.lastSyncedAt && (
          <p className="text-xs text-muted-foreground mt-0.5">
            Synced {formatRelativeTime(account.lastSyncedAt)}
          </p>
        )}
        {account.status === 'error' && account.errorMessage && (
          <p className="text-xs text-red-600 mt-0.5 truncate">{account.errorMessage}</p>
        )}
      </div>

      {/* Chevron */}
      <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
    </button>
  );
}

// ─── Bank Account Card ───────────────────────────────────────────────────────

function BankAccountCard({
  account,
  onEdit,
  onArchive,
}: {
  account: BankAccount;
  onEdit: () => void;
  onArchive: () => void;
}) {
  const initials = account.bankName
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const currencyColor = CURRENCY_BADGE_COLORS[account.currency] ?? 'bg-muted text-muted-foreground';

  return (
    <div className="w-full px-4 py-4 flex items-center gap-3 hover:bg-muted/40 transition-colors">
      {/* Bank icon */}
      <div className="flex-shrink-0">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-100 text-emerald-700 text-xs font-bold">
          {initials || <Building2 className="w-5 h-5" />}
        </div>
      </div>

      {/* Info */}
      <button onClick={onEdit} className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <span className="text-sm font-medium text-foreground truncate">
            {account.nickname}
          </span>
          <span
            className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full ${currencyColor}`}
          >
            {account.currency}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">
          {account.bankName}
          {account.accountNumber ? ` · ${maskAccountNumber(account.accountNumber)}` : ''}
        </span>
      </button>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={onEdit}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="Edit"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onArchive}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
          title="Archive"
        >
          <Archive className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Archived Bank Account Card ──────────────────────────────────────────────

function ArchivedBankAccountCard({
  account,
  onRestore,
}: {
  account: BankAccount;
  onRestore: () => void;
}) {
  return (
    <div className="w-full px-4 py-3 flex items-center gap-3 opacity-60">
      <div className="flex-shrink-0">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-muted text-muted-foreground text-xs font-bold">
          <Building2 className="w-4 h-4" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm text-muted-foreground truncate block">
          {account.nickname}
        </span>
        <span className="text-xs text-muted-foreground">
          {account.bankName}
          {account.accountNumber ? ` · ${maskAccountNumber(account.accountNumber)}` : ''}
        </span>
      </div>
      <button
        onClick={onRestore}
        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors"
      >
        <RotateCcw className="w-3 h-3" />
        Restore
      </button>
    </div>
  );
}

// ─── Confirm Archive Dialog ──────────────────────────────────────────────────

function ConfirmArchiveDialog({
  accountName,
  onConfirm,
  onCancel,
}: {
  accountName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-card border border-border rounded-xl shadow-lg max-w-sm w-full mx-4 p-6">
        <h3 className="text-base font-semibold text-foreground mb-2">Archive bank account?</h3>
        <p className="text-sm text-muted-foreground mb-5">
          Are you sure you want to archive <span className="font-medium text-foreground">{accountName}</span>? Transactions linked to this account will not be affected. You can restore it later.
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 text-sm font-medium text-foreground bg-muted rounded-lg hover:bg-muted/80 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
          >
            Archive
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Bank Account Modal (Create / Edit) ──────────────────────────────────────

function BankAccountModal({
  entityId,
  account,
  onClose,
}: {
  entityId: Id<'entities'>;
  account: BankAccount | null; // null = create mode
  onClose: () => void;
}) {
  const createAccount = useMutation(api.bankAccounts.create);
  const updateAccount = useMutation(api.bankAccounts.update);

  const [bankSearch, setBankSearch] = useState(account?.bankName ?? '');
  const [selectedBank, setSelectedBank] = useState<{ name: string; code: string } | null>(
    account ? { name: account.bankName, code: account.bankCode } : null,
  );
  const [bankDropdownOpen, setBankDropdownOpen] = useState(false);
  const [accountNumber, setAccountNumber] = useState(account?.accountNumber ?? '');
  const [accountName, setAccountName] = useState(account?.accountName ?? '');
  const [nickname, setNickname] = useState(account?.nickname ?? '');
  const [currency, setCurrency] = useState<'NGN' | 'USD' | 'GBP' | 'EUR'>(
    account?.currency ?? 'NGN',
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const bankSearchRef = useRef<HTMLDivElement>(null);
  const isEdit = !!account;

  const filteredBanks = useMemo(() => {
    if (!bankSearch) return NIGERIAN_BANKS;
    const q = bankSearch.toLowerCase();
    return NIGERIAN_BANKS.filter((b) => b.name.toLowerCase().includes(q));
  }, [bankSearch]);

  const hasExactMatch = useMemo(() => {
    const q = bankSearch.toLowerCase().trim();
    return NIGERIAN_BANKS.some((b) => b.name.toLowerCase() === q);
  }, [bankSearch]);

  // Close bank dropdown on click outside
  useEffect(() => {
    if (!bankDropdownOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (bankSearchRef.current && !bankSearchRef.current.contains(e.target as Node)) {
        setBankDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [bankDropdownOpen]);

  function handleBankSelect(bank: { name: string; code: string }) {
    setSelectedBank(bank);
    setBankSearch(bank.name);
    setBankDropdownOpen(false);
    if (!nickname || nickname === selectedBank?.name) {
      setNickname(bank.name);
    }
  }

  function handleUseCustomName() {
    const trimmed = bankSearch.trim();
    if (!trimmed) return;
    const custom = { name: trimmed, code: 'CUSTOM' };
    setSelectedBank(custom);
    setBankDropdownOpen(false);
    if (!nickname || nickname === selectedBank?.name) {
      setNickname(trimmed);
    }
  }

  function handleAccountNumberChange(val: string) {
    const cleaned = val.replace(/\D/g, '').slice(0, 10);
    setAccountNumber(cleaned);
  }

  async function handleSubmit() {
    setError('');

    if (!isEdit && !selectedBank) {
      setError('Please select a bank');
      return;
    }
    if (!nickname.trim()) {
      setError('Please enter a nickname');
      return;
    }
    if (accountNumber && accountNumber.length !== 10) {
      setError('Account number must be exactly 10 digits');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isEdit) {
        await updateAccount({
          bankAccountId: account._id,
          nickname: nickname.trim(),
          accountNumber: accountNumber || undefined,
          accountName: accountName.trim() || undefined,
          currency,
        });
      } else {
        await createAccount({
          entityId,
          bankName: selectedBank!.name,
          bankCode: selectedBank!.code,
          accountNumber: accountNumber || undefined,
          accountName: accountName.trim() || undefined,
          nickname: nickname.trim(),
          currency,
        });
      }
      onClose();
    } catch (err: any) {
      setError(err?.message ?? `Failed to ${isEdit ? 'update' : 'create'} bank account`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-card border border-border rounded-xl shadow-lg max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="text-base font-semibold text-foreground">
            {isEdit ? 'Edit Bank Account' : 'Add Bank Account'}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <div className="px-6 py-5 space-y-4">
          {/* Bank name — searchable dropdown (only in create mode) */}
          {!isEdit ? (
            <div ref={bankSearchRef} className="relative">
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Bank name
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  value={bankSearch}
                  onChange={(e) => {
                    setBankSearch(e.target.value);
                    setBankDropdownOpen(true);
                    if (selectedBank && e.target.value !== selectedBank.name) {
                      setSelectedBank(null);
                    }
                  }}
                  onFocus={() => setBankDropdownOpen(true)}
                  placeholder="Search banks..."
                  className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {bankDropdownOpen && (
                <div className="absolute z-50 mt-1 w-full bg-card border border-border rounded-lg shadow-lg max-h-[180px] overflow-y-auto">
                  {filteredBanks.map((bank) => (
                    <button
                      key={bank.code}
                      type="button"
                      onClick={() => handleBankSelect(bank)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted/60 transition-colors"
                    >
                      <span className="text-foreground">{bank.name}</span>
                      {selectedBank?.code === bank.code && (
                        <Check className="w-3.5 h-3.5 text-primary ml-auto flex-shrink-0" />
                      )}
                    </button>
                  ))}
                  {filteredBanks.length === 0 && bankSearch.trim() && (
                    <button
                      type="button"
                      onClick={handleUseCustomName}
                      className="w-full px-3 py-2 text-sm text-left text-primary hover:bg-muted/60 transition-colors"
                    >
                      Use &quot;{bankSearch.trim()}&quot; as bank name
                    </button>
                  )}
                  {filteredBanks.length > 0 && !hasExactMatch && bankSearch.trim() && (
                    <button
                      type="button"
                      onClick={handleUseCustomName}
                      className="w-full px-3 py-2 text-sm text-left text-primary hover:bg-muted/60 transition-colors border-t border-border"
                    >
                      Use &quot;{bankSearch.trim()}&quot; as bank name
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Bank name
              </label>
              <p className="text-sm text-foreground">{account.bankName}</p>
            </div>
          )}

          {/* Account number */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Account number{' '}
              <span className="text-muted-foreground/60 font-normal">(optional, 10-digit NUBAN)</span>
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={accountNumber}
              onChange={(e) => handleAccountNumberChange(e.target.value)}
              placeholder="0123456789"
              maxLength={10}
              className="w-full px-3 py-2.5 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Account name */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Account name{' '}
              <span className="text-muted-foreground/60 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="e.g. John Doe"
              className="w-full px-3 py-2.5 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Nickname */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Nickname <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="e.g. Business Current Account"
              className="w-full px-3 py-2.5 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Currency */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Currency
            </label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as typeof currency)}
              className="w-full px-3 py-2.5 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="NGN">NGN — Nigerian Naira</option>
              <option value="USD">USD — US Dollar</option>
              <option value="GBP">GBP — British Pound</option>
              <option value="EUR">EUR — Euro</option>
            </select>
          </div>

          {/* Error */}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 px-6 py-4 border-t border-border bg-muted/30">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-foreground bg-background border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors shadow-soft disabled:opacity-50"
          >
            {isSubmitting ? (isEdit ? 'Saving...' : 'Creating...') : isEdit ? 'Save Changes' : 'Add Account'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Bank Accounts Section ───────────────────────────────────────────────────

function BankAccountsSection({ entityId }: { entityId: Id<'entities'> }) {
  const allAccounts = useQuery(api.bankAccounts.listAllByEntity, { entityId }) as
    | BankAccount[]
    | undefined;

  const archiveAccount = useMutation(api.bankAccounts.archive);
  const restoreAccount = useMutation(api.bankAccounts.restore);

  const [showModal, setShowModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<BankAccount | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const activeAccounts = useMemo(
    () => (allAccounts ?? []).filter((a) => a.isActive),
    [allAccounts],
  );
  const archivedAccounts = useMemo(
    () => (allAccounts ?? []).filter((a) => !a.isActive),
    [allAccounts],
  );

  async function handleArchiveConfirm() {
    if (!archiveTarget) return;
    try {
      await archiveAccount({ bankAccountId: archiveTarget._id });
    } catch {
      // silently fail — mutation error will show in Convex logs
    }
    setArchiveTarget(null);
  }

  async function handleRestore(account: BankAccount) {
    try {
      await restoreAccount({ bankAccountId: account._id });
    } catch {
      // silently fail
    }
  }

  return (
    <>
      {/* Section header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-display font-semibold text-foreground">Bank Accounts</h2>
        <button
          onClick={() => {
            setEditingAccount(null);
            setShowModal(true);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors shadow-soft"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Bank Account
        </button>
      </div>

      {/* Card container */}
      <div className="bg-card border border-border rounded-xl shadow-soft overflow-hidden mb-8">
        {allAccounts === undefined ? (
          /* Loading */
          <div className="divide-y divide-border">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-4">
                <Skeleton className="w-10 h-10 rounded-xl flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-28" />
                </div>
              </div>
            ))}
          </div>
        ) : activeAccounts.length === 0 && archivedAccounts.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-12 text-center px-6">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
              <Building2 className="w-7 h-7 text-muted-foreground" />
            </div>
            <p className="text-base font-semibold text-foreground mb-1">No bank accounts yet</p>
            <p className="text-sm text-muted-foreground max-w-xs">
              Add one to start tracking transactions by account.
            </p>
          </div>
        ) : (
          <>
            {/* Active accounts */}
            {activeAccounts.length > 0 && (
              <div className="divide-y divide-border">
                {activeAccounts.map((account) => (
                  <BankAccountCard
                    key={account._id}
                    account={account}
                    onEdit={() => {
                      setEditingAccount(account);
                      setShowModal(true);
                    }}
                    onArchive={() => setArchiveTarget(account)}
                  />
                ))}
              </div>
            )}

            {/* Archived section */}
            {archivedAccounts.length > 0 && (
              <div className={activeAccounts.length > 0 ? 'border-t border-border' : ''}>
                <button
                  onClick={() => setShowArchived((prev) => !prev)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/40 transition-colors"
                >
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Archived ({archivedAccounts.length})
                  </span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${showArchived ? 'rotate-180' : ''}`}
                  />
                </button>
                {showArchived && (
                  <div className="divide-y divide-border border-t border-border">
                    {archivedAccounts.map((account) => (
                      <ArchivedBankAccountCard
                        key={account._id}
                        account={account}
                        onRestore={() => handleRestore(account)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      {showModal && (
        <BankAccountModal
          entityId={entityId}
          account={editingAccount}
          onClose={() => {
            setShowModal(false);
            setEditingAccount(null);
          }}
        />
      )}

      {archiveTarget && (
        <ConfirmArchiveDialog
          accountName={archiveTarget.nickname}
          onConfirm={handleArchiveConfirm}
          onCancel={() => setArchiveTarget(null)}
        />
      )}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ConnectedAccounts() {
  const { activeEntityId } = useEntity();
  const navigate = useNavigate();

  const accounts = useQuery(
    (api as any).connectedAccounts.list,
    activeEntityId ? { entityId: activeEntityId } : 'skip'
  ) as ConnectedAccount[] | undefined;

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      {/* Page header */}
      <div className="mb-6">
        <Link
          to="/app/settings"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ChevronLeft className="w-4 h-4" />
          Settings
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">Connected Accounts</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage your bank and payment platform connections
            </p>
          </div>
          <button
            onClick={() => navigate('/app/settings/accounts/add')}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors shadow-soft"
          >
            <Plus className="w-4 h-4" />
            Add Account
          </button>
        </div>
      </div>

      {/* Bank Accounts section */}
      {activeEntityId && <BankAccountsSection entityId={activeEntityId} />}

      {/* Connected accounts section header */}
      <h2 className="text-lg font-display font-semibold text-foreground mb-3">
        Connected Accounts
      </h2>

      {/* Connected accounts list */}
      <div className="bg-card border border-border rounded-xl shadow-soft overflow-hidden">
        {accounts === undefined ? (
          <div className="divide-y divide-border">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-4">
                <Skeleton className="w-10 h-10 rounded-xl flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-28" />
                </div>
              </div>
            ))}
          </div>
        ) : accounts.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-16 text-center px-6">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
              <Link2 className="w-7 h-7 text-muted-foreground" />
            </div>
            <p className="text-base font-semibold text-foreground mb-1">No accounts linked yet</p>
            <p className="text-sm text-muted-foreground mb-5 max-w-xs">
              Connect your bank or payment platform to automatically import transactions.
            </p>
            <button
              onClick={() => navigate('/app/settings/accounts/add')}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors mb-3"
            >
              <Plus className="w-4 h-4" />
              Link an Account
            </button>
            <Link
              to="/app/import"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <UploadCloud className="w-4 h-4" />
              Or upload a bank statement
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {accounts.map((account) => (
              <AccountCard
                key={account._id}
                account={account}
                onClick={() => navigate(`/app/settings/accounts/${account._id}`)}
              />
            ))}
          </div>
        )}
      </div>

      {accounts !== undefined && accounts.length > 0 && (
        <p className="text-xs text-muted-foreground mt-3 px-1">
          Tap an account to view details, sync, or disconnect.
        </p>
      )}
    </div>
  );
}
