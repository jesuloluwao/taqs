import { useState, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import { toast } from 'sonner';
import { Bell, Clock, RefreshCcw, AlertTriangle, FileText, Smartphone } from 'lucide-react';

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

export default function Notifications() {
  const prefs = useQuery(api.userCrud.getPreferences);
  const createDefaultPreferences = useMutation(api.userCrud.createDefaultPreferences);
  const updatePreferences = useMutation(api.userCrud.updatePreferences);

  const [deadlineEnabled, setDeadlineEnabled] = useState(true);
  const [deadlineDays, setDeadlineDays] = useState(14);
  const [vatEnabled, setVatEnabled] = useState(false);
  const [alertFreq, setAlertFreq] = useState<'daily' | 'weekly' | 'never'>('weekly');
  const [invoiceDays, setInvoiceDays] = useState(7);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

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
      setPushEnabled(prefs.pushEnabled ?? true);
    }
  }, [prefs]);

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
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold text-foreground">Notifications</h1>
        <p className="text-sm text-muted-foreground mt-1">
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
          control={<Toggle checked={pushEnabled} onChange={setPushEnabled} />}
        />

        {/* Bell icon placeholder card for visual context */}
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
