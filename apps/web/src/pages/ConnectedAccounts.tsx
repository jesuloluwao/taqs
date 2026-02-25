import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { toast } from 'sonner';
import {
  Link2,
  Plus,
  X,
  Save,
  ChevronLeft,
  UploadCloud,
  PenLine,
  Wifi,
  WifiOff,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useEntity } from '../contexts/EntityContext';
import { Skeleton } from '../components/Skeleton';

// ─── Types ────────────────────────────────────────────────────────────────────

type AccountStatus = 'active' | 'expired' | 'error' | 'disconnected';
type Provider = 'statement_upload' | 'manual';
type Currency = 'NGN' | 'USD' | 'GBP' | 'EUR';

interface ConnectedAccount {
  _id: Id<'connectedAccounts'>;
  entityId: Id<'entities'>;
  userId: Id<'users'>;
  provider: string;
  accountName?: string;
  currency?: Currency;
  lastSyncedAt?: number;
  status?: AccountStatus;
  errorMessage?: string;
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
};

const PROVIDER_ICONS: Record<string, React.FC<{ className?: string }>> = {
  statement_upload: UploadCloud,
  manual: PenLine,
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
  const icons: Record<AccountStatus, React.FC<{ className?: string }>> = {
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

// ─── Add Account Modal ────────────────────────────────────────────────────────

function AddAccountModal({
  entityId,
  onClose,
}: {
  entityId: Id<'entities'>;
  onClose: () => void;
}) {
  const addMutation = useMutation((api as any).connectedAccounts.add);

  const [accountName, setAccountName] = useState('');
  const [provider, setProvider] = useState<Provider>('statement_upload');
  const [currency, setCurrency] = useState<Currency>('NGN');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!accountName.trim()) errs.accountName = 'Account name is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      await addMutation({ entityId, accountName, provider, currency });
      toast.success('Account added');
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to add account');
    } finally {
      setSaving(false);
    }
  };

  const providerOptions: { value: Provider; label: string; desc: string; icon: React.FC<{ className?: string }> }[] = [
    {
      value: 'statement_upload',
      label: 'Statement Upload',
      desc: 'Import PDF or CSV bank statements',
      icon: UploadCloud,
    },
    {
      value: 'manual',
      label: 'Manual Entry',
      desc: 'Add transactions manually',
      icon: PenLine,
    },
  ];

  const currencies: Currency[] = ['NGN', 'USD', 'GBP', 'EUR'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-medium w-full max-w-md p-6 animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-foreground">Add Account</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Account name */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Account Name *
            </label>
            <input
              type="text"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="e.g. GTBank Business Account"
              className="mt-1.5 w-full text-sm px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none placeholder:text-muted-foreground"
            />
            {errors.accountName && (
              <p className="text-xs text-destructive mt-1">{errors.accountName}</p>
            )}
          </div>

          {/* Provider */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Connection Type *
            </label>
            <div className="mt-1.5 space-y-2">
              {providerOptions.map((opt) => {
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setProvider(opt.value)}
                    className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                      provider === opt.value
                        ? 'border-primary bg-primary-light'
                        : 'border-border hover:border-primary/50 hover:bg-muted'
                    }`}
                  >
                    <Icon
                      className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                        provider === opt.value ? 'text-primary' : 'text-muted-foreground'
                      }`}
                    />
                    <div>
                      <p
                        className={`text-sm font-medium ${
                          provider === opt.value ? 'text-primary' : 'text-foreground'
                        }`}
                      >
                        {opt.label}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Currency */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Currency
            </label>
            <div className="mt-1.5 grid grid-cols-4 gap-2">
              {currencies.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCurrency(c)}
                  className={`text-sm font-medium py-2 rounded-lg border transition-colors ${
                    currency === c
                      ? 'border-primary bg-primary-light text-primary'
                      : 'border-border bg-background text-foreground hover:border-primary/50'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-foreground bg-muted rounded-lg hover:bg-muted/80 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Save className="w-4 h-4" />
                Add Account
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Disconnect Confirm ───────────────────────────────────────────────────────

function DisconnectConfirmModal({
  account,
  onConfirm,
  onCancel,
  loading,
}: {
  account: ConnectedAccount;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-card border border-border rounded-2xl shadow-medium w-full max-w-sm p-6 animate-slide-up">
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 p-1.5 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
            <WifiOff className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">Disconnect account?</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {account.accountName ?? PROVIDER_LABELS[account.provider] ?? account.provider}
            </p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground mb-5">
          The account will be marked as disconnected. Your existing transactions will be{' '}
          <span className="font-medium text-foreground">preserved</span>.
        </p>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-foreground bg-muted rounded-lg hover:bg-muted/80 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              'Disconnect'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Account Card ─────────────────────────────────────────────────────────────

function AccountCard({
  account,
  onDisconnect,
}: {
  account: ConnectedAccount;
  onDisconnect: () => void;
}) {
  const ProviderIcon = PROVIDER_ICONS[account.provider] ?? Link2;
  const isDisconnected = account.status === 'disconnected';

  return (
    <div className={`px-4 py-4 flex items-start gap-3 ${isDisconnected ? 'opacity-60' : ''}`}>
      {/* Icon */}
      <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
        <ProviderIcon className="w-5 h-5 text-muted-foreground" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <span className="text-sm font-medium text-foreground">
            {account.accountName ?? 'Unnamed Account'}
          </span>
          <StatusBadge status={account.status} />
        </div>
        <p className="text-xs text-muted-foreground">
          {PROVIDER_LABELS[account.provider] ?? account.provider}
          {account.currency ? ` · ${account.currency}` : ''}
        </p>
        {account.lastSyncedAt && (
          <p className="text-xs text-muted-foreground mt-0.5">
            Last synced {formatRelativeTime(account.lastSyncedAt)}
          </p>
        )}
        {account.errorMessage && account.status === 'error' && (
          <p className="text-xs text-red-600 mt-1">{account.errorMessage}</p>
        )}
      </div>

      {/* Disconnect button */}
      {!isDisconnected && (
        <button
          onClick={onDisconnect}
          className="text-xs text-muted-foreground hover:text-red-600 font-medium px-2 py-1 rounded hover:bg-red-50 transition-colors flex-shrink-0 mt-0.5"
        >
          Disconnect
        </button>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ConnectedAccounts() {
  const { activeEntityId } = useEntity();

  const accounts = useQuery(
    (api as any).connectedAccounts.list,
    activeEntityId ? { entityId: activeEntityId } : 'skip'
  ) as ConnectedAccount[] | undefined;

  const disconnectMutation = useMutation((api as any).connectedAccounts.disconnect);

  const [showAdd, setShowAdd] = useState(false);
  const [disconnectTarget, setDisconnectTarget] = useState<ConnectedAccount | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  const handleDisconnect = async () => {
    if (!disconnectTarget) return;
    setDisconnecting(true);
    try {
      await disconnectMutation({ id: disconnectTarget._id });
      toast.success('Account disconnected');
      setDisconnectTarget(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to disconnect');
    } finally {
      setDisconnecting(false);
    }
  };

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
              Manage bank accounts and data sources
            </p>
          </div>
          <button
            onClick={() => setShowAdd(true)}
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
              <div key={i} className="flex items-start gap-3 px-4 py-4">
                <Skeleton className="w-10 h-10 rounded-xl" />
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
              Add a bank account or data source to start importing transactions.
            </p>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Account
            </button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {accounts.map((account) => (
              <AccountCard
                key={account._id}
                account={account}
                onDisconnect={() => setDisconnectTarget(account)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Info note */}
      {accounts !== undefined && accounts.length > 0 && (
        <p className="text-xs text-muted-foreground mt-3 px-1">
          Bank linking via open banking is coming soon. Currently supports statement uploads and manual entry.
        </p>
      )}

      {/* Modals */}
      {showAdd && activeEntityId && (
        <AddAccountModal entityId={activeEntityId} onClose={() => setShowAdd(false)} />
      )}

      {disconnectTarget && (
        <DisconnectConfirmModal
          account={disconnectTarget}
          onConfirm={handleDisconnect}
          onCancel={() => setDisconnectTarget(null)}
          loading={disconnecting}
        />
      )}
    </div>
  );
}
