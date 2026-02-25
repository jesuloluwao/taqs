import { useQuery } from 'convex/react';
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
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useEntity } from '../contexts/EntityContext';
import { Skeleton } from '../components/Skeleton';

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

// ─── Account Card ─────────────────────────────────────────────────────────────

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

      {/* Accounts list */}
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
