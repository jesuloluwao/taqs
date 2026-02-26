import { useState, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import { toast } from 'sonner';
import { Bell, Clock, RefreshCcw, AlertTriangle, FileText, Smartphone, ChevronLeft, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Skeleton } from '../components/Skeleton';

const DEADLINE_DAYS_OPTIONS = [30, 14, 7, 1];
const INVOICE_OVERDUE_OPTIONS = [1, 3, 7];
const ALERT_FREQ_OPTIONS: { value: 'daily' | 'weekly' | 'never'; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'never', label: 'Off' },
];

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 flex-shrink-0 ${
        checked ? 'bg-primary' : 'bg-neutral-300'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

function PreferenceCard({
  icon,
  title,
  description,
  control,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  control: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-xl shadow-soft overflow-hidden">
      <div className="px-5 py-4 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-primary-light flex items-center justify-center flex-shrink-0 text-primary mt-0.5">
            {icon}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground leading-tight">{title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          </div>
        </div>
        {control && <div className="flex-shrink-0 mt-0.5">{control}</div>}
      </div>
      {children && (
        <div className="px-5 pb-4 pt-0 border-t border-border bg-muted/20">
          <div className="pt-3">{children}</div>
        </div>
      )}
    </div>
  );
}

/** Get current browser push notification permission state */
function getBrowserPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export default function NotificationSettings() {
  const prefs = useQuery(api.userCrud.getPreferences);
  const createDefaultPreferences = useMutation(api.userCrud.createDefaultPreferences);
  const updatePreferences = useMutation(api.userCrud.updatePreferences);

  const [deadlineEnabled, setDeadlineEnabled] = useState(true);
  const [deadlineDays, setDeadlineDays] = useState(14);
  const [vatEnabled, setVatEnabled] = useState(false);
  const [alertFreq, setAlertFreq] = useState<'daily' | 'weekly' | 'never'>('weekly');
  const [invoiceDays, setInvoiceDays] = useState(7);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission | 'unsupported'>('default');

  // Refresh push permission state on mount and on change
  useEffect(() => {
    setPushPermission(getBrowserPermission());
  }, []);

  // Create defaults on first access if no preferences exist
  useEffect(() => {
    if (prefs === null) {
      createDefaultPreferences().catch(console.error);
    }
  }, [prefs, createDefaultPreferences]);

  // Sync form state from Convex preferences
  useEffect(() => {
    if (prefs) {
      const days = prefs.deadlineReminderDays ?? 14;
      setDeadlineEnabled(days > 0);
      setDeadlineDays(days > 0 ? days : 14);
      setVatEnabled(prefs.vatReminderEnabled ?? false);
      setAlertFreq((prefs.uncategorisedAlertFrequency as 'daily' | 'weekly' | 'never') ?? 'weekly');
      setInvoiceDays(prefs.invoiceOverdueDays ?? 7);
      setPushEnabled(prefs.pushEnabled ?? false);
    }
  }, [prefs]);

  const handlePushToggle = async (enabled: boolean) => {
    if (!enabled) {
      // Turning off — just update state
      setPushEnabled(false);
      return;
    }

    // Turning on — request browser permission first
    if (pushPermission === 'unsupported') {
      toast.error('Push notifications are not supported in this browser');
      return;
    }

    if (pushPermission === 'denied') {
      // Already denied — can't re-request; show instructions
      toast.error(
        'Push notifications are blocked. Enable them in your browser settings.',
        {
          duration: 6000,
          action: {
            label: 'How to enable',
            onClick: () => {
              // Most browsers: Settings → Site Settings → Notifications
              // No direct deep-link available on web; open a help article or just inform
              window.open(
                'https://support.google.com/chrome/answer/3220216',
                '_blank',
                'noopener,noreferrer'
              );
            },
          },
        }
      );
      return;
    }

    if (pushPermission === 'default') {
      try {
        const result = await Notification.requestPermission();
        setPushPermission(result);
        if (result === 'granted') {
          setPushEnabled(true);
          toast.success('Push notifications enabled');
        } else if (result === 'denied') {
          toast.error('Push notifications were blocked');
        } else {
          // dismissed
          toast('Permission request dismissed');
        }
      } catch {
        toast.error('Could not request notification permission');
      }
      return;
    }

    // Permission already granted
    setPushEnabled(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updatePreferences({
        deadlineReminderDays: deadlineEnabled ? deadlineDays : 0,
        vatReminderEnabled: vatEnabled,
        uncategorisedAlertFrequency: alertFreq,
        invoiceOverdueDays: invoiceDays,
        pushEnabled,
      });
      toast.success('Notification preferences saved');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to save preferences';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  if (prefs === undefined) {
    return (
      <div className="max-w-2xl mx-auto animate-fade-in">
        <div className="mb-8 flex items-center gap-3">
          <Skeleton className="w-7 h-7 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-44" />
            <Skeleton className="h-4 w-72" />
          </div>
        </div>
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-xl shadow-soft p-5 flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 flex-1">
                <Skeleton className="w-9 h-9 rounded-lg flex-shrink-0" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-64" />
                </div>
              </div>
              <Skeleton className="w-11 h-6 rounded-full flex-shrink-0" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      {/* Page header with back button */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <Link
            to="/app/settings"
            className="p-1.5 -ml-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted"
            aria-label="Back to Settings"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-display font-bold text-foreground">Notifications</h1>
        </div>
        <p className="text-sm text-muted-foreground pl-7">
          Choose when and how TaxEase notifies you
        </p>
      </div>

      <div className="space-y-4">
        {/* Filing Deadline Reminders */}
        <PreferenceCard
          icon={<Clock className="w-5 h-5" />}
          title="Filing Deadline Reminders"
          description="Get reminded before the March 31 self-assessment deadline"
          control={<Toggle checked={deadlineEnabled} onChange={setDeadlineEnabled} />}
        >
          {deadlineEnabled && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Remind me</p>
              <div className="flex flex-wrap gap-2">
                {DEADLINE_DAYS_OPTIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDeadlineDays(d)}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                      deadlineDays === d
                        ? 'border-primary bg-primary-light text-primary font-medium'
                        : 'border-border bg-background text-foreground hover:border-primary/50'
                    }`}
                  >
                    {d} {d === 1 ? 'day' : 'days'} before
                  </button>
                ))}
              </div>
            </div>
          )}
        </PreferenceCard>

        {/* VAT Return Reminders */}
        <PreferenceCard
          icon={<RefreshCcw className="w-5 h-5" />}
          title="VAT Return Reminders"
          description="Get reminded about quarterly VAT filing obligations (applies when VAT registered)"
          control={<Toggle checked={vatEnabled} onChange={setVatEnabled} />}
        />

        {/* Uncategorised Transaction Alerts */}
        <PreferenceCard
          icon={<AlertTriangle className="w-5 h-5" />}
          title="Uncategorised Transaction Alerts"
          description="Be notified when transactions need categorising"
          control={null}
        >
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Alert frequency</p>
            <div className="flex gap-2">
              {ALERT_FREQ_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setAlertFreq(opt.value)}
                  className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
                    alertFreq === opt.value
                      ? 'border-primary bg-primary-light text-primary font-medium'
                      : 'border-border bg-background text-foreground hover:border-primary/50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </PreferenceCard>

        {/* Invoice Overdue Alerts */}
        <PreferenceCard
          icon={<FileText className="w-5 h-5" />}
          title="Invoice Overdue Alerts"
          description="Get notified when invoices are past their due date"
          control={null}
        >
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Alert me when overdue by</p>
            <div className="flex gap-2">
              {INVOICE_OVERDUE_OPTIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setInvoiceDays(d)}
                  className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
                    invoiceDays === d
                      ? 'border-primary bg-primary-light text-primary font-medium'
                      : 'border-border bg-background text-foreground hover:border-primary/50'
                  }`}
                >
                  {d} {d === 1 ? 'day' : 'days'}
                </button>
              ))}
            </div>
          </div>
        </PreferenceCard>

        {/* Push Notifications */}
        <PreferenceCard
          icon={<Smartphone className="w-5 h-5" />}
          title="Push Notifications"
          description="Allow browser push notifications from TaxEase"
          control={<Toggle checked={pushEnabled} onChange={handlePushToggle} />}
        >
          {pushPermission === 'denied' && (
            <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2.5 border border-amber-200">
              <span className="flex-1">
                Push notifications are blocked in your browser. To enable them, update your browser's site notification settings.
              </span>
              <a
                href="https://support.google.com/chrome/answer/3220216"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 font-medium text-amber-800 hover:underline flex-shrink-0"
              >
                Enable in Settings
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
          {pushPermission === 'granted' && pushEnabled && (
            <p className="text-xs text-green-700">
              Push notifications are active on this device.
            </p>
          )}
          {pushPermission === 'unsupported' && (
            <p className="text-xs text-muted-foreground">
              Push notifications are not supported in this browser.
            </p>
          )}
        </PreferenceCard>

        {/* Informational callout */}
        <div className="flex items-start gap-3 px-5 py-4 bg-primary-light/40 rounded-xl border border-primary/20">
          <Bell className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
          <p className="text-xs text-primary/80 leading-relaxed">
            Notification delivery depends on your device settings. Enable browser notifications
            when prompted to receive alerts.
          </p>
        </div>
      </div>

      {/* Save button */}
      <div className="mt-6 flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : 'Save Preferences'}
        </button>
      </div>
    </div>
  );
}
