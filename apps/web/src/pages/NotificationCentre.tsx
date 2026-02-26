import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Bell,
  CheckCheck,
  Clock,
  AlertTriangle,
  FileText,
  UploadCloud,
  WifiOff,
  RefreshCcw,
  Info,
  ChevronLeft,
  CheckCircle2,
} from 'lucide-react';
import { Skeleton } from '../components/Skeleton';
import type { Id } from '@convex/_generated/dataModel';

// ─── Types ─────────────────────────────────────────────────────────────────

type NotificationType =
  | 'filing_deadline'
  | 'vat_return'
  | 'uncategorised_alert'
  | 'invoice_overdue'
  | 'import_result'
  | 'sync_error'
  | 'recurring_invoice'
  | 'general';

interface Notification {
  _id: Id<'notifications'>;
  _creationTime: number;
  userId: Id<'users'>;
  type: NotificationType;
  title: string;
  body: string;
  entityId?: string;
  relatedId?: string;
  read: boolean;
  readAt?: number;
}

// ─── Config ────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<
  NotificationType,
  {
    icon: React.ElementType;
    iconColor: string;
    borderColor: string;
    bgColor: string;
  }
> = {
  filing_deadline: {
    icon: Clock,
    iconColor: 'text-amber-600',
    borderColor: 'border-l-amber-500',
    bgColor: 'bg-amber-50 dark:bg-amber-900/10',
  },
  vat_return: {
    icon: RefreshCcw,
    iconColor: 'text-blue-600',
    borderColor: 'border-l-blue-500',
    bgColor: 'bg-blue-50 dark:bg-blue-900/10',
  },
  uncategorised_alert: {
    icon: AlertTriangle,
    iconColor: 'text-yellow-600',
    borderColor: 'border-l-yellow-500',
    bgColor: 'bg-yellow-50 dark:bg-yellow-900/10',
  },
  invoice_overdue: {
    icon: FileText,
    iconColor: 'text-red-600',
    borderColor: 'border-l-red-500',
    bgColor: 'bg-red-50 dark:bg-red-900/10',
  },
  import_result: {
    icon: UploadCloud,
    iconColor: 'text-green-600',
    borderColor: 'border-l-green-500',
    bgColor: 'bg-green-50 dark:bg-green-900/10',
  },
  sync_error: {
    icon: WifiOff,
    iconColor: 'text-red-600',
    borderColor: 'border-l-red-500',
    bgColor: 'bg-red-50 dark:bg-red-900/10',
  },
  recurring_invoice: {
    icon: RefreshCcw,
    iconColor: 'text-purple-600',
    borderColor: 'border-l-purple-500',
    bgColor: 'bg-purple-50 dark:bg-purple-900/10',
  },
  general: {
    icon: Info,
    iconColor: 'text-neutral-500',
    borderColor: 'border-l-neutral-400',
    bgColor: 'bg-neutral-50 dark:bg-neutral-800/20',
  },
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function getNavPath(
  type: NotificationType,
  relatedId?: string
): string | null {
  switch (type) {
    case 'filing_deadline':
      return '/app/filing';
    case 'vat_return':
      return '/app/filing';
    case 'uncategorised_alert':
      return '/app/triage';
    case 'invoice_overdue':
      return relatedId ? `/app/invoices/${relatedId}` : '/app/invoices';
    case 'import_result':
      return '/app/import';
    case 'sync_error':
      return relatedId ? `/app/settings/accounts/${relatedId}` : '/app/settings/accounts';
    case 'recurring_invoice':
      return relatedId ? `/app/invoices/${relatedId}` : '/app/invoices';
    case 'general':
      return null;
    default:
      return null;
  }
}

function formatRelativeTime(ts: number): string {
  const now = Date.now();
  const diffMs = now - ts;
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;

  return new Date(ts).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: diffDay > 365 ? 'numeric' : undefined,
  });
}

type DateGroup = 'Today' | 'Yesterday' | 'This Week' | 'Earlier';

function getDateGroup(ts: number): DateGroup {
  const now = new Date();

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86_400_000;
  const weekStart = todayStart - 6 * 86_400_000;

  if (ts >= todayStart) return 'Today';
  if (ts >= yesterdayStart) return 'Yesterday';
  if (ts >= weekStart) return 'This Week';
  return 'Earlier';
}

const GROUP_ORDER: DateGroup[] = ['Today', 'Yesterday', 'This Week', 'Earlier'];

function groupNotifications(notifications: Notification[]): Array<{
  group: DateGroup;
  items: Notification[];
}> {
  const map = new Map<DateGroup, Notification[]>();

  for (const n of notifications) {
    const group = getDateGroup(n._creationTime);
    if (!map.has(group)) map.set(group, []);
    map.get(group)!.push(n);
  }

  return GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({
    group: g,
    items: map.get(g)!,
  }));
}

// ─── Components ────────────────────────────────────────────────────────────

function NotificationCard({
  notification,
  onMarkRead,
}: {
  notification: Notification;
  onMarkRead: (id: Id<'notifications'>) => void;
}) {
  const navigate = useNavigate();
  const config = TYPE_CONFIG[notification.type] ?? TYPE_CONFIG.general;
  const Icon = config.icon;

  const handleClick = () => {
    if (!notification.read) {
      onMarkRead(notification._id);
    }
    const path = getNavPath(notification.type, notification.relatedId);
    if (path) {
      navigate(path);
    }
  };

  return (
    <div
      onClick={handleClick}
      className={`relative flex items-start gap-3 px-4 py-3.5 border-l-4 rounded-r-xl cursor-pointer transition-all duration-150 hover:brightness-95 active:scale-[0.99] ${
        config.borderColor
      } ${
        notification.read
          ? 'bg-card border border-border border-l-4'
          : `${config.bgColor} border border-transparent`
      }`}
      style={{ borderLeftWidth: '4px' }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      {/* Type icon */}
      <div
        className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
          notification.read ? 'bg-muted' : 'bg-white/70'
        }`}
      >
        <Icon className={`w-4 h-4 ${config.iconColor}`} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p
            className={`text-sm leading-tight truncate ${
              notification.read
                ? 'font-normal text-foreground'
                : 'font-semibold text-foreground'
            }`}
          >
            {notification.title}
          </p>
          <span className="text-[11px] text-muted-foreground flex-shrink-0">
            {formatRelativeTime(notification._creationTime)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
          {notification.body}
        </p>
      </div>

      {/* Unread dot */}
      {!notification.read && (
        <div className="w-2 h-2 bg-primary rounded-full flex-shrink-0 mt-2" />
      )}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="flex items-start gap-3 px-4 py-3.5 bg-card border border-border rounded-r-xl border-l-4 border-l-neutral-200">
      <Skeleton className="w-8 h-8 rounded-lg flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-12" />
        </div>
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
      {/* Bell + checkmark illustration */}
      <div className="relative w-20 h-20 mb-6">
        <div className="w-20 h-20 rounded-full bg-primary-light flex items-center justify-center">
          <Bell className="w-9 h-9 text-primary" />
        </div>
        <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-green-100 border-2 border-background flex items-center justify-center">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
        </div>
      </div>
      <h3 className="text-base font-semibold text-foreground mb-1">You're all caught up!</h3>
      <p className="text-sm text-muted-foreground max-w-xs">
        No notifications right now. We'll let you know about deadlines, alerts, and more.
      </p>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function NotificationCentre() {
  const [markingAll, setMarkingAll] = useState(false);

  const result = useQuery((api as any).notifications.list, { limit: 100 }) as
    | { notifications: Notification[]; hasMore: boolean }
    | undefined;

  const markRead = useMutation((api as any).notifications.markRead);
  const markAllRead = useMutation((api as any).notifications.markAllRead);

  const notifications = result?.notifications ?? [];
  const loading = result === undefined;
  const hasUnread = notifications.some((n) => !n.read);

  const handleMarkRead = async (id: Id<'notifications'>) => {
    try {
      await markRead({ notificationId: id });
    } catch {
      // silent — optimistic update expected
    }
  };

  const handleMarkAllRead = async () => {
    if (!hasUnread || markingAll) return;
    setMarkingAll(true);
    try {
      const count = await markAllRead({});
      if (count > 0) {
        toast.success(`Marked ${count} notification${count === 1 ? '' : 's'} as read`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to mark all as read';
      toast.error(message);
    } finally {
      setMarkingAll(false);
    }
  };

  const groups = groupNotifications(notifications);

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      {/* Page header */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            to="/app/dashboard"
            className="p-1.5 -ml-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted md:hidden"
            aria-label="Back to dashboard"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">Notifications</h1>
            {!loading && notifications.length > 0 && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {notifications.filter((n) => !n.read).length > 0
                  ? `${notifications.filter((n) => !n.read).length} unread`
                  : 'All caught up'}
              </p>
            )}
          </div>
        </div>

        {hasUnread && (
          <button
            onClick={handleMarkAllRead}
            disabled={markingAll}
            className="flex items-center gap-1.5 text-sm text-primary font-medium hover:text-primary/80 transition-colors disabled:opacity-50 flex-shrink-0"
          >
            <CheckCheck className="w-4 h-4" />
            {markingAll ? 'Marking…' : 'Mark all as read'}
          </button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-6">
          {groups.map(({ group, items }) => (
            <section key={group}>
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
                {group}
              </h2>
              <div className="space-y-2">
                {items.map((n) => (
                  <NotificationCard
                    key={n._id}
                    notification={n}
                    onMarkRead={handleMarkRead}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
