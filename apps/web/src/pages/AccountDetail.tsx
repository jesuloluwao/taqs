import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { toast } from 'sonner';
import {
  ChevronLeft,
  RefreshCw,
  WifiOff,
  AlertCircle,
  Clock,
  Wifi,
  CheckCircle2,
  X,
  Link2,
  ShieldAlert,
} from 'lucide-react';
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
    linkProvider?: string;
    apiKeyHash?: string;
  };
}

interface SyncJob {
  _id: Id<'importJobs'>;
  status: string;
  totalImported?: number;
  duplicatesSkipped?: number;
  totalParsed?: number;
  errorMessage?: string;
  createdAt?: number;
  completedAt?: number;
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

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${styles[s]}`}
    >
      <Icon className="w-3 h-3" />
      {labels[s]}
    </span>
  );
}

// ─── Sync Job Row ─────────────────────────────────────────────────────────────

function SyncJobRow({ job }: { job: SyncJob }) {
  const isComplete = job.status === 'complete';
  const isFailed = job.status === 'failed';

  return (
    <div className="flex items-start gap-3 py-3">
      <div className="mt-0.5">
        {isComplete ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
        ) : isFailed ? (
          <AlertCircle className="w-4 h-4 text-red-500" />
        ) : (
          <Clock className="w-4 h-4 text-amber-500" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-foreground capitalize">{job.status}</span>
          {job.createdAt && (
            <span className="text-[11px] text-muted-foreground">{formatRelativeTime(job.createdAt)}</span>
          )}
        </div>
        {isComplete && job.totalImported !== undefined && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {job.totalImported} imported · {job.duplicatesSkipped ?? 0} duplicates skipped
          </p>
        )}
        {isFailed && job.errorMessage && (
          <p className="text-xs text-red-600 mt-0.5 truncate">{job.errorMessage}</p>
        )}
      </div>
    </div>
  );
}

// ─── Disconnect Dialog ────────────────────────────────────────────────────────

function DisconnectDialog({
  accountName,
  onConfirm,
  onCancel,
  loading,
}: {
  accountName: string;
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
          className="absolute top-4 right-4 p-1.5 rounded-full text-muted-foreground hover:bg-muted transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
            <WifiOff className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">Disconnect account?</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{accountName}</p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground mb-5">
          This will stop automatic syncing. Your existing transactions will be{' '}
          <span className="font-medium text-foreground">preserved</span>. You can reconnect at any time.
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
            className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
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

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AccountDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const account = useQuery(
    (api as any).connectedAccounts.get,
    id ? { id: id as Id<'connectedAccounts'> } : 'skip'
  ) as ConnectedAccount | null | undefined;

  const syncJobs = useQuery(
    (api as any).importJobs.listByAccount,
    id ? { connectedAccountId: id as Id<'connectedAccounts'>, limit: 5 } : 'skip'
  ) as SyncJob[] | undefined;

  const disconnectMutation = useMutation((api as any).connectedAccounts.disconnect);
  const syncNowAction = useAction((api as any).accountsActions.syncNow);

  const [syncing, setSyncing] = useState(false);
  const [showDisconnect, setShowDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const handleSyncNow = async () => {
    if (!id) return;
    setSyncing(true);
    try {
      await syncNowAction({ connectedAccountId: id as Id<'connectedAccounts'> });
      toast.success('Sync complete');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sync failed';
      toast.error(msg);
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    if (!id) return;
    setDisconnecting(true);
    try {
      await disconnectMutation({ id: id as Id<'connectedAccounts'> });
      toast.success('Account disconnected');
      navigate('/app/settings/accounts');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to disconnect');
      setDisconnecting(false);
    }
  };

  // ── Loading ───────────────────────────────────────────────────────────────

  if (account === undefined) {
    return (
      <div className="max-w-2xl mx-auto animate-fade-in space-y-4">
        <Skeleton className="h-6 w-32 mb-6" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  if (account === null) {
    return (
      <div className="max-w-2xl mx-auto animate-fade-in text-center py-20">
        <Link2 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-foreground font-medium">Account not found</p>
        <button
          onClick={() => navigate('/app/settings/accounts')}
          className="mt-4 text-sm text-primary hover:underline"
        >
          Back to Connected Accounts
        </button>
      </div>
    );
  }

  const hasError = account.status === 'error' || account.status === 'expired';
  const isDisconnected = account.status === 'disconnected';
  const latestJob = syncJobs?.[0];
  const isApiKeyAccount = account.provider === 'paystack' || account.provider === 'flutterwave';
  const providerLabel = PROVIDER_LABELS[account.provider] ?? account.provider;

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      {/* Back nav */}
      <button
        onClick={() => navigate('/app/settings/accounts')}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-5"
      >
        <ChevronLeft className="w-4 h-4" />
        Connected Accounts
      </button>

      {/* Error banner */}
      {hasError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-red-800">
              {account.status === 'expired' ? 'Session expired' : 'Sync error'}
            </p>
            {account.errorMessage && (
              <p className="text-xs text-red-700 mt-0.5">{account.errorMessage}</p>
            )}
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={handleSyncNow}
              disabled={syncing || isDisconnected}
              className="text-xs font-medium text-red-700 hover:text-red-900 underline disabled:opacity-50"
            >
              Retry
            </button>
            <span className="text-red-300">·</span>
            <button
              onClick={() =>
                navigate(
                  `/app/settings/accounts/connect/${account.provider}?reconnect=${account._id}`
                )
              }
              className="text-xs font-medium text-red-700 hover:text-red-900 underline"
            >
              Re-authenticate
            </button>
          </div>
        </div>
      )}

      {/* Main info card */}
      <div className="bg-card border border-border rounded-xl shadow-soft overflow-hidden mb-4">
        {/* Header */}
        <div className="p-5 border-b border-border">
          <div className="flex items-start gap-4">
            {/* Logo placeholder */}
            {account.metadata?.institutionLogo ? (
              <img
                src={account.metadata.institutionLogo}
                alt={providerLabel}
                className="w-12 h-12 rounded-xl object-contain bg-white border border-border flex-shrink-0"
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                <Link2 className="w-6 h-6 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-display font-bold text-foreground truncate">
                {account.accountName ?? 'Unnamed Account'}
              </h1>
              <p className="text-sm text-muted-foreground">{providerLabel}</p>
            </div>
            <StatusBadge status={account.status} />
          </div>
        </div>

        {/* Details rows */}
        <div className="divide-y divide-border">
          {account.metadata?.accountType && (
            <div className="flex items-center justify-between px-5 py-3">
              <span className="text-sm text-muted-foreground">Account type</span>
              <span className="text-sm font-medium text-foreground capitalize">
                {account.metadata.accountType}
              </span>
            </div>
          )}
          {account.metadata?.accountNumber && (
            <div className="flex items-center justify-between px-5 py-3">
              <span className="text-sm text-muted-foreground">Account number</span>
              <span className="text-sm font-mono text-foreground">
                ···· {account.metadata.accountNumber.slice(-4)}
              </span>
            </div>
          )}
          {account.currency && (
            <div className="flex items-center justify-between px-5 py-3">
              <span className="text-sm text-muted-foreground">Currency</span>
              <span className="text-sm font-medium text-foreground">{account.currency}</span>
            </div>
          )}
          {account.lastSyncedAt && (
            <div className="flex items-center justify-between px-5 py-3">
              <span className="text-sm text-muted-foreground">Last synced</span>
              <span className="text-sm text-foreground">{formatDate(account.lastSyncedAt)}</span>
            </div>
          )}
          {isApiKeyAccount && account.metadata?.apiKeyHash && (
            <div className="flex items-center justify-between px-5 py-3">
              <span className="text-sm text-muted-foreground">API key</span>
              <span className="text-xs font-mono text-muted-foreground">
                ···· {account.metadata.apiKeyHash.slice(-8)}
              </span>
            </div>
          )}
        </div>

        {/* Sync Now button */}
        {!isDisconnected && (
          <div className="px-5 py-4 border-t border-border">
            <button
              onClick={handleSyncNow}
              disabled={syncing}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing…' : 'Sync Now'}
            </button>
          </div>
        )}
      </div>

      {/* Latest sync result */}
      {latestJob && (
        <div className="bg-card border border-border rounded-xl shadow-soft overflow-hidden mb-4">
          <div className="px-5 py-3 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">Last Sync Result</h2>
          </div>
          <div className="px-5 py-3">
            <div className="flex items-center gap-2">
              {latestJob.status === 'complete' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              ) : latestJob.status === 'failed' ? (
                <AlertCircle className="w-5 h-5 text-red-500" />
              ) : (
                <RefreshCw className="w-5 h-5 text-amber-500 animate-spin" />
              )}
              <span className="text-sm font-medium text-foreground capitalize">{latestJob.status}</span>
              {latestJob.createdAt && (
                <span className="text-xs text-muted-foreground ml-auto">
                  {formatRelativeTime(latestJob.createdAt)}
                </span>
              )}
            </div>
            {latestJob.status === 'complete' && latestJob.totalImported !== undefined && (
              <p className="text-sm text-muted-foreground mt-2">
                <span className="font-medium text-foreground">{latestJob.totalImported}</span> transactions imported ·{' '}
                <span className="font-medium text-foreground">{latestJob.duplicatesSkipped ?? 0}</span> duplicates skipped
              </p>
            )}
            {latestJob.status === 'failed' && latestJob.errorMessage && (
              <p className="text-sm text-red-600 mt-2">{latestJob.errorMessage}</p>
            )}
          </div>
        </div>
      )}

      {/* Sync history */}
      {syncJobs && syncJobs.length > 1 && (
        <div className="bg-card border border-border rounded-xl shadow-soft overflow-hidden mb-4">
          <div className="px-5 py-3 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">Sync History</h2>
          </div>
          <div className="px-5 divide-y divide-border">
            {syncJobs.slice(1).map((job) => (
              <SyncJobRow key={job._id} job={job} />
            ))}
          </div>
        </div>
      )}

      {/* Danger zone */}
      {!isDisconnected && (
        <div className="bg-card border border-red-200 rounded-xl shadow-soft overflow-hidden mb-6">
          <div className="px-5 py-3 border-b border-red-100">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-600" />
              <h2 className="text-sm font-semibold text-red-700">Danger Zone</h2>
            </div>
          </div>
          <div className="px-5 py-4">
            <p className="text-sm text-muted-foreground mb-3">
              Disconnecting will stop automatic syncing. Your existing transactions will be preserved.
            </p>
            <button
              onClick={() => setShowDisconnect(true)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
            >
              <WifiOff className="w-4 h-4" />
              Disconnect Account
            </button>
          </div>
        </div>
      )}

      {/* Reconnect option for disconnected accounts */}
      {isDisconnected && (
        <div className="bg-card border border-border rounded-xl shadow-soft p-5 mb-6">
          <p className="text-sm text-muted-foreground mb-3">
            This account is disconnected. Reconnect to resume automatic syncing.
          </p>
          <button
            onClick={() =>
              navigate(`/app/settings/accounts/connect/${account.provider}?reconnect=${account._id}`)
            }
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-primary border border-primary rounded-lg hover:bg-primary/5 transition-colors"
          >
            <Wifi className="w-4 h-4" />
            Reconnect Account
          </button>
        </div>
      )}

      {/* Disconnect dialog */}
      {showDisconnect && (
        <DisconnectDialog
          accountName={account.accountName ?? providerLabel}
          onConfirm={handleDisconnect}
          onCancel={() => setShowDisconnect(false)}
          loading={disconnecting}
        />
      )}
    </div>
  );
}
