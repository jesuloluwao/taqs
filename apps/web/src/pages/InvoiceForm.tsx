import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useParams, useBlocker } from 'react-router-dom';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '@convex/_generated/api';
import { useEntity } from '../contexts/EntityContext';
import { toast } from 'sonner';
import type { Id } from '@convex/_generated/dataModel';
import {
  Plus,
  Trash2,
  ArrowLeft,
  Save,
  Eye,
  Send,
  AlertCircle,
  Search,
  X,
  RefreshCw,
  Check,
  User,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type Currency = 'NGN' | 'USD' | 'GBP' | 'EUR';
type WhtRate = 0 | 5 | 10;
type RecurringInterval = 'monthly' | 'quarterly';

interface LineItem {
  _key: string;
  description: string;
  quantity: string;
  unitPrice: string; // User enters in Naira; converted to kobo on submit
}

interface FormData {
  clientId: Id<'clients'> | null;
  clientName: string;
  clientEmail: string;
  clientAddress: string;
  issueDate: string; // YYYY-MM-DD
  dueDate: string;   // YYYY-MM-DD
  currency: Currency;
  whtRate: WhtRate;
  lineItems: LineItem[];
  notes: string;
  isRecurring: boolean;
  recurringInterval: RecurringInterval;
  nextIssueDate: string; // YYYY-MM-DD
}

interface ClientSuggestion {
  _id: Id<'clients'>;
  name: string;
  email?: string;
  address?: string;
  currency?: Currency;
  whtRate?: number;
}

interface ExistingInvoice {
  _id: Id<'invoices'>;
  invoiceNumber: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  clientId?: Id<'clients'>;
  clientName: string;
  clientEmail?: string;
  issueDate: number;
  dueDate: number;
  currency: Currency;
  whtRate?: number;
  subtotal: number;
  whtAmount?: number;
  vatAmount?: number;
  totalDue: number;
  notes?: string;
  isRecurring?: boolean;
  recurringInterval?: RecurringInterval;
  nextIssueDate?: number;
  items: Array<{
    _id: string;
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split('T')[0];
}

function toTimestamp(dateStr: string): number {
  return new Date(dateStr + 'T00:00:00').getTime();
}

function toDateInput(ms: number): string {
  return new Date(ms).toISOString().split('T')[0];
}

function parseNum(str: string): number {
  const n = parseFloat(str);
  return isNaN(n) ? 0 : n;
}

function newLineItem(): LineItem {
  return {
    _key: Math.random().toString(36).slice(2),
    description: '',
    quantity: '1',
    unitPrice: '',
  };
}

const CURRENCY_SYMBOL: Record<Currency, string> = {
  NGN: '₦',
  USD: '$',
  GBP: '£',
  EUR: '€',
};

function fmtCurrency(naira: number, currency: Currency): string {
  const sym = CURRENCY_SYMBOL[currency];
  return `${sym}${naira.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const DEFAULT_FORM: FormData = {
  clientId: null,
  clientName: '',
  clientEmail: '',
  clientAddress: '',
  issueDate: todayStr(),
  dueDate: addDays(todayStr(), 30),
  currency: 'NGN',
  whtRate: 0,
  lineItems: [newLineItem()],
  notes: '',
  isRecurring: false,
  recurringInterval: 'monthly',
  nextIssueDate: addMonths(todayStr(), 1),
};

// ── Confirm Dialog ────────────────────────────────────────────────────────────

function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Leave',
  cancelLabel = 'Stay',
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 animate-fade-in">
      <div className="bg-surface rounded-2xl shadow-medium w-full max-w-sm p-6 space-y-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="font-semibold text-text-primary">{title}</h3>
            <p className="text-sm text-text-secondary mt-1">{message}</p>
          </div>
        </div>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors font-medium"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Section Card ──────────────────────────────────────────────────────────────

function SectionCard({
  title,
  subtitle,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="bg-surface rounded-2xl p-5 shadow-soft space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-semibold text-text-primary">{title}</h2>
          {subtitle && <p className="text-xs text-text-secondary mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function InvoiceForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const { activeEntityId } = useEntity();

  // ── Queries ────────────────────────────────────────────────────────────────

  const entity = useQuery(
    api.entityCrud.get,
    activeEntityId ? { id: activeEntityId } : 'skip'
  );

  const existingInvoice = useQuery(
    (api as any).invoices.get,
    isEditMode && id ? { id: id as Id<'invoices'> } : 'skip'
  ) as ExistingInvoice | null | undefined;

  const [clientSearch, setClientSearch] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);

  const clientResults = useQuery(
    (api as any).clients.search,
    activeEntityId && clientSearch.trim().length > 0
      ? { entityId: activeEntityId, namePrefix: clientSearch.trim() }
      : 'skip'
  ) as ClientSuggestion[] | undefined;

  // ── Mutations & Actions ────────────────────────────────────────────────────

  const createInvoice = useMutation((api as any).invoices.create);
  const updateInvoice = useMutation((api as any).invoices.update);
  const createClient = useMutation((api as any).clients.create);
  const sendInvoiceAction = useAction((api as any).invoiceActions.send);

  // ── Form State ─────────────────────────────────────────────────────────────

  const [form, setForm] = useState<FormData>(DEFAULT_FORM);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const initialised = useRef(false);

  const isVatRegistered = entity?.vatRegistered === true && entity?.vatThresholdExceeded === true;

  // ── Edit Mode Pre-population ───────────────────────────────────────────────

  useEffect(() => {
    if (!isEditMode || initialised.current) return;
    if (existingInvoice === undefined) return; // Still loading
    if (!existingInvoice) return;

    initialised.current = true;
    const populated: FormData = {
      clientId: existingInvoice.clientId ?? null,
      clientName: existingInvoice.clientName ?? '',
      clientEmail: existingInvoice.clientEmail ?? '',
      clientAddress: '',
      issueDate: toDateInput(existingInvoice.issueDate),
      dueDate: toDateInput(existingInvoice.dueDate),
      currency: existingInvoice.currency ?? 'NGN',
      whtRate: ([0, 5, 10].includes(existingInvoice.whtRate ?? 0)
        ? (existingInvoice.whtRate ?? 0)
        : 0) as WhtRate,
      lineItems:
        existingInvoice.items.length > 0
          ? existingInvoice.items.map((item) => ({
              _key: Math.random().toString(36).slice(2),
              description: item.description,
              quantity: String(item.quantity),
              unitPrice: String(item.unitPrice / 100), // kobo → Naira
            }))
          : [newLineItem()],
      notes: existingInvoice.notes ?? '',
      isRecurring: existingInvoice.isRecurring ?? false,
      recurringInterval: existingInvoice.recurringInterval ?? 'monthly',
      nextIssueDate: existingInvoice.nextIssueDate
        ? toDateInput(existingInvoice.nextIssueDate)
        : addMonths(todayStr(), 1),
    };
    setForm(populated);
    setClientSearch(existingInvoice.clientName ?? '');
    setIsDirty(false);
  }, [isEditMode, existingInvoice]);

  // ── Dirty Form Warning ─────────────────────────────────────────────────────

  const blocker = useBlocker(isDirty);

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // ── Form Helpers ───────────────────────────────────────────────────────────

  function setField<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  }

  function updateLineItem(index: number, field: keyof Pick<LineItem, 'description' | 'quantity' | 'unitPrice'>, value: string) {
    setForm((prev) => {
      const items = [...prev.lineItems];
      items[index] = { ...items[index], [field]: value };
      return { ...prev, lineItems: items };
    });
    setIsDirty(true);
  }

  function addLineItem() {
    setForm((prev) => ({
      ...prev,
      lineItems: [...prev.lineItems, newLineItem()],
    }));
    setIsDirty(true);
  }

  function removeLineItem(index: number) {
    setForm((prev) => ({
      ...prev,
      lineItems: prev.lineItems.filter((_, i) => i !== index),
    }));
    setIsDirty(true);
  }

  // ── Client Autocomplete ───────────────────────────────────────────────────

  function handleClientSearchChange(value: string) {
    setClientSearch(value);
    setForm((prev) => ({
      ...prev,
      clientName: value,
      clientId: prev.clientId ? null : prev.clientId,
    }));
    setIsDirty(true);
    setShowClientDropdown(true);
  }

  function selectClient(client: ClientSuggestion) {
    const whtRate = ([0, 5, 10].includes(client.whtRate ?? 0)
      ? (client.whtRate ?? 0)
      : 0) as WhtRate;
    setForm((prev) => ({
      ...prev,
      clientId: client._id,
      clientName: client.name,
      clientEmail: client.email ?? prev.clientEmail,
      clientAddress: client.address ?? prev.clientAddress,
      currency: client.currency ?? prev.currency,
      whtRate,
    }));
    setClientSearch(client.name);
    setShowClientDropdown(false);
    setIsDirty(true);
    setErrors((prev) => {
      const next = { ...prev };
      delete next.clientName;
      return next;
    });
  }

  function clearClient() {
    setForm((prev) => ({ ...prev, clientId: null, clientName: '', clientEmail: '', clientAddress: '' }));
    setClientSearch('');
    setIsDirty(true);
  }

  // ── Live Totals Computation (in Naira) ────────────────────────────────────

  const totals = useMemo(() => {
    const subtotal = form.lineItems.reduce((sum, item) => {
      return sum + parseNum(item.quantity) * parseNum(item.unitPrice);
    }, 0);
    const whtAmount = (subtotal * form.whtRate) / 100;
    const vatAmount = isVatRegistered ? (subtotal * 7.5) / 100 : 0;
    const totalDue = subtotal - whtAmount + vatAmount;
    return { subtotal, whtAmount, vatAmount, totalDue };
  }, [form.lineItems, form.whtRate, isVatRegistered]);

  // ── Validation ────────────────────────────────────────────────────────────

  function validate(): boolean {
    const errs: Record<string, string> = {};

    if (!form.clientName.trim()) {
      errs.clientName = 'Client name is required';
    }
    if (!form.issueDate) {
      errs.issueDate = 'Issue date is required';
    }
    if (!form.dueDate) {
      errs.dueDate = 'Due date is required';
    }
    if (form.dueDate && form.issueDate && form.dueDate < form.issueDate) {
      errs.dueDate = 'Due date must be on or after issue date';
    }

    const validItems = form.lineItems.filter(
      (i) =>
        i.description.trim() &&
        parseNum(i.quantity) > 0 &&
        parseNum(i.unitPrice) > 0
    );
    if (validItems.length === 0) {
      errs.lineItems = 'Add at least one line item with description, quantity, and price';
    }
    form.lineItems.forEach((item, i) => {
      if (!item.description.trim()) errs[`item_${i}_desc`] = 'Required';
      if (parseNum(item.quantity) <= 0) errs[`item_${i}_qty`] = 'Required';
      if (parseNum(item.unitPrice) <= 0) errs[`item_${i}_price`] = 'Required';
    });

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  // ── Build Line Items for Mutation (kobo) ──────────────────────────────────

  function buildLineItemsForMutation() {
    return form.lineItems
      .filter(
        (i) =>
          i.description.trim() &&
          parseNum(i.quantity) > 0 &&
          parseNum(i.unitPrice) > 0
      )
      .map((i) => ({
        description: i.description.trim(),
        quantity: parseNum(i.quantity),
        unitPrice: Math.round(parseNum(i.unitPrice) * 100), // Naira → kobo
      }));
  }

  // ── Auto-create client if new name ────────────────────────────────────────

  async function ensureClientId(): Promise<Id<'clients'> | undefined> {
    if (!activeEntityId) return undefined;
    if (form.clientId) return form.clientId;
    if (!form.clientName.trim()) return undefined;

    try {
      const newId = await createClient({
        entityId: activeEntityId,
        name: form.clientName.trim(),
        email: form.clientEmail.trim() || undefined,
        address: form.clientAddress.trim() || undefined,
        whtRate: form.whtRate,
      });
      return newId as Id<'clients'>;
    } catch {
      return undefined; // Non-fatal: invoice will use clientName directly
    }
  }

  // ── Core Save Logic ───────────────────────────────────────────────────────

  async function saveInvoice(): Promise<Id<'invoices'> | null> {
    if (!validate()) return null;
    if (!activeEntityId) {
      toast.error('No active entity selected');
      return null;
    }

    setIsSaving(true);
    try {
      const clientId = await ensureClientId();
      const lineItems = buildLineItemsForMutation();

      let invoiceId: Id<'invoices'>;

      if (isEditMode && id) {
        await updateInvoice({
          id: id as Id<'invoices'>,
          clientId: clientId ?? undefined,
          clientName: form.clientName.trim() || undefined,
          clientEmail: form.clientEmail.trim() || undefined,
          issueDate: toTimestamp(form.issueDate),
          dueDate: toTimestamp(form.dueDate),
          currency: form.currency,
          whtRate: form.whtRate,
          lineItems,
          notes: form.notes.trim() || undefined,
          isRecurring: form.isRecurring,
          recurringInterval: form.isRecurring ? form.recurringInterval : undefined,
          nextIssueDate:
            form.isRecurring && form.nextIssueDate
              ? toTimestamp(form.nextIssueDate)
              : undefined,
        });
        invoiceId = id as Id<'invoices'>;
      } else {
        invoiceId = await createInvoice({
          entityId: activeEntityId,
          clientId: clientId ?? undefined,
          clientName: form.clientName.trim() || undefined,
          clientEmail: form.clientEmail.trim() || undefined,
          issueDate: toTimestamp(form.issueDate),
          dueDate: toTimestamp(form.dueDate),
          currency: form.currency,
          whtRate: form.whtRate,
          lineItems,
          notes: form.notes.trim() || undefined,
          isRecurring: form.isRecurring,
          recurringInterval: form.isRecurring ? form.recurringInterval : undefined,
          nextIssueDate:
            form.isRecurring && form.nextIssueDate
              ? toTimestamp(form.nextIssueDate)
              : undefined,
        });
      }

      setIsDirty(false);
      return invoiceId;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save invoice';
      toast.error(message);
      return null;
    } finally {
      setIsSaving(false);
    }
  }

  // ── Button Handlers ───────────────────────────────────────────────────────

  async function handleSaveDraft() {
    const invoiceId = await saveInvoice();
    if (invoiceId) {
      toast.success(isEditMode ? 'Invoice updated' : 'Invoice saved as draft');
      navigate('/app/invoices');
    }
  }

  async function handlePreview() {
    const invoiceId = await saveInvoice();
    if (invoiceId) {
      toast.success('Invoice saved. Full preview coming in the next update.');
      navigate('/app/invoices');
    }
  }

  async function handleSend() {
    if (!form.clientEmail.trim()) {
      setErrors((prev) => ({ ...prev, clientEmail: 'Client email is required to send the invoice' }));
      toast.error('Add the client email address before sending');
      return;
    }

    const invoiceId = await saveInvoice();
    if (!invoiceId) return;

    setIsSending(true);
    try {
      await sendInvoiceAction({ id: invoiceId });
      toast.success(`Invoice sent to ${form.clientEmail}`);
      navigate('/app/invoices');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to send invoice';
      toast.error(message);
    } finally {
      setIsSending(false);
    }
  }

  // ── Derived State ─────────────────────────────────────────────────────────

  const isNonDraft = isEditMode && existingInvoice && existingInvoice.status !== 'draft';
  const isReadOnly = !!isNonDraft;
  const isLoading = isEditMode && existingInvoice === undefined;
  const invoiceNumberDisplay =
    isEditMode && existingInvoice ? existingInvoice.invoiceNumber : 'Auto-generated on save';

  const sym = CURRENCY_SYMBOL[form.currency];

  // ── Loading State ─────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[60vh]">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* ─── Header ─────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button
            onClick={() => {
              if (isDirty) {
                if (!window.confirm('You have unsaved changes. Leave anyway?')) return;
              }
              navigate('/app/invoices');
            }}
            className="p-2 rounded-lg hover:bg-muted transition-colors text-text-secondary hover:text-text-primary"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold text-text-primary">
              {isEditMode ? 'Edit Invoice' : 'New Invoice'}
            </h1>
            {isEditMode && existingInvoice && (
              <p className="text-xs text-text-secondary truncate">{existingInvoice.invoiceNumber}</p>
            )}
          </div>
          {isEditMode && existingInvoice && (
            <span
              className={`text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 ${
                existingInvoice.status === 'draft'
                  ? 'bg-neutral-100 text-neutral-600'
                  : existingInvoice.status === 'sent'
                  ? 'bg-blue-50 text-blue-600'
                  : existingInvoice.status === 'paid'
                  ? 'bg-emerald-50 text-emerald-700'
                  : existingInvoice.status === 'overdue'
                  ? 'bg-red-50 text-red-600'
                  : 'bg-neutral-100 text-neutral-400'
              }`}
            >
              {existingInvoice.status.charAt(0).toUpperCase() + existingInvoice.status.slice(1)}
            </span>
          )}
        </div>
      </div>

      {/* ─── Scrollable Body ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto pb-28">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

          {/* Non-draft notice */}
          {isReadOnly && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-900">Invoice cannot be edited</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Only draft invoices can be edited. This invoice is{' '}
                  <strong>{existingInvoice?.status}</strong>.
                </p>
              </div>
            </div>
          )}

          {/* ─── §1 Invoice Details ─────────────────────────────────────── */}
          <SectionCard title="Invoice Details">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  Invoice Number
                </label>
                <input
                  type="text"
                  value={invoiceNumberDisplay}
                  disabled
                  className="w-full px-3 py-2 rounded-lg border border-border bg-muted text-text-secondary text-sm cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  Currency
                </label>
                <select
                  value={form.currency}
                  onChange={(e) => setField('currency', e.target.value as Currency)}
                  disabled={isReadOnly}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-muted disabled:cursor-not-allowed"
                >
                  <option value="NGN">₦ NGN — Nigerian Naira</option>
                  <option value="USD">$ USD — US Dollar</option>
                  <option value="GBP">£ GBP — British Pound</option>
                  <option value="EUR">€ EUR — Euro</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  Issue Date
                </label>
                <input
                  type="date"
                  value={form.issueDate}
                  onChange={(e) => setField('issueDate', e.target.value)}
                  disabled={isReadOnly}
                  className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-muted disabled:cursor-not-allowed ${
                    errors.issueDate ? 'border-red-400 bg-red-50' : 'border-border bg-surface'
                  } text-text-primary`}
                />
                {errors.issueDate && (
                  <p className="text-xs text-red-500 mt-1">{errors.issueDate}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  Due Date
                </label>
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setField('dueDate', e.target.value)}
                  disabled={isReadOnly}
                  className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-muted disabled:cursor-not-allowed ${
                    errors.dueDate ? 'border-red-400 bg-red-50' : 'border-border bg-surface'
                  } text-text-primary`}
                />
                {errors.dueDate && (
                  <p className="text-xs text-red-500 mt-1">{errors.dueDate}</p>
                )}
              </div>
            </div>
          </SectionCard>

          {/* ─── §2 Client ──────────────────────────────────────────────── */}
          <SectionCard title="Client">
            {/* Client search / autocomplete */}
            <div className="relative">
              <label className="block text-xs font-medium text-text-secondary mb-1.5">
                Client Name
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search existing or enter new client name..."
                  value={clientSearch}
                  onChange={(e) => handleClientSearchChange(e.target.value)}
                  onFocus={() => setShowClientDropdown(true)}
                  onBlur={() => setTimeout(() => setShowClientDropdown(false), 180)}
                  disabled={isReadOnly}
                  className={`w-full pl-9 pr-9 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-muted disabled:cursor-not-allowed ${
                    errors.clientName ? 'border-red-400 bg-red-50' : 'border-border bg-surface'
                  } text-text-primary placeholder:text-text-muted`}
                />
                {form.clientId ? (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Check className="w-4 h-4 text-emerald-500" />
                  </span>
                ) : clientSearch.length > 0 ? (
                  <button
                    type="button"
                    onClick={clearClient}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                ) : null}
              </div>
              {errors.clientName && (
                <p className="text-xs text-red-500 mt-1">{errors.clientName}</p>
              )}
              {form.clientId && (
                <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  Existing client selected — defaults applied
                </p>
              )}
              {!form.clientId && clientSearch.trim().length > 0 && !showClientDropdown && (
                <p className="text-xs text-text-secondary mt-1">
                  New client — a client record will be created on save
                </p>
              )}

              {/* Dropdown */}
              {showClientDropdown && clientSearch.trim().length > 0 && (
                <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-surface border border-border rounded-xl shadow-medium overflow-hidden">
                  {clientResults === undefined && (
                    <div className="px-4 py-3 text-sm text-text-secondary flex items-center gap-2">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      Searching...
                    </div>
                  )}
                  {clientResults && clientResults.length === 0 && (
                    <div className="px-4 py-3 text-sm text-text-secondary">
                      No existing clients found.{' '}
                      <span className="font-medium text-text-primary">
                        &ldquo;{clientSearch}&rdquo;
                      </span>{' '}
                      will be saved as a new client.
                    </div>
                  )}
                  {clientResults &&
                    clientResults.map((c) => (
                      <button
                        key={c._id}
                        type="button"
                        onMouseDown={() => selectClient(c)}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted text-left transition-colors border-b border-border/50 last:border-0"
                      >
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <User className="w-4 h-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-text-primary truncate">
                            {c.name}
                          </div>
                          {c.email && (
                            <div className="text-xs text-text-secondary truncate">{c.email}</div>
                          )}
                        </div>
                        {c.currency && (
                          <span className="ml-auto text-xs text-text-muted flex-shrink-0">
                            {c.currency}
                          </span>
                        )}
                      </button>
                    ))}
                </div>
              )}
            </div>

            {/* Client Email */}
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">
                Client Email
              </label>
              <input
                type="email"
                placeholder="client@example.com"
                value={form.clientEmail}
                onChange={(e) => setField('clientEmail', e.target.value)}
                disabled={isReadOnly}
                className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-muted disabled:cursor-not-allowed ${
                  errors.clientEmail ? 'border-red-400 bg-red-50' : 'border-border bg-surface'
                } text-text-primary placeholder:text-text-muted`}
              />
              {errors.clientEmail && (
                <p className="text-xs text-red-500 mt-1">{errors.clientEmail}</p>
              )}
              <p className="text-xs text-text-muted mt-1">Required for sending the invoice via email</p>
            </div>

            {/* Client Address */}
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">
                Client Address{' '}
                <span className="font-normal text-text-muted">(optional)</span>
              </label>
              <textarea
                placeholder="Street, City, State..."
                value={form.clientAddress}
                onChange={(e) => setField('clientAddress', e.target.value)}
                disabled={isReadOnly}
                rows={2}
                className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-sm text-text-primary placeholder:text-text-muted resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-muted disabled:cursor-not-allowed"
              />
            </div>
          </SectionCard>

          {/* ─── §3 Line Items ───────────────────────────────────────────── */}
          <SectionCard
            title="Line Items"
            action={
              !isReadOnly ? (
                <button
                  type="button"
                  onClick={addLineItem}
                  className="hidden sm:flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 font-medium transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Item
                </button>
              ) : undefined
            }
          >
            {errors.lineItems && (
              <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                {errors.lineItems}
              </div>
            )}

            {/* Desktop header row */}
            <div className="hidden sm:grid grid-cols-[1fr_72px_110px_100px_32px] gap-2 px-1">
              <span className="text-xs font-medium text-text-secondary">Description</span>
              <span className="text-xs font-medium text-text-secondary text-right">Qty</span>
              <span className="text-xs font-medium text-text-secondary text-right">Unit Price ({sym})</span>
              <span className="text-xs font-medium text-text-secondary text-right">Total</span>
              <span />
            </div>

            {/* Line item rows */}
            <div className="space-y-3">
              {form.lineItems.map((item, idx) => {
                const qty = parseNum(item.quantity);
                const price = parseNum(item.unitPrice);
                const lineTotal = qty * price;

                return (
                  <div
                    key={item._key}
                    className="sm:grid sm:grid-cols-[1fr_72px_110px_100px_32px] sm:gap-2 sm:items-center flex flex-col gap-2 pb-3 sm:pb-0 border-b border-border/40 sm:border-0 last:border-0 last:pb-0"
                  >
                    {/* Description */}
                    <div>
                      <label className="sm:hidden text-xs text-text-secondary mb-1 block">
                        Description
                      </label>
                      <input
                        type="text"
                        placeholder="Service or product..."
                        value={item.description}
                        onChange={(e) => updateLineItem(idx, 'description', e.target.value)}
                        disabled={isReadOnly}
                        className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-muted disabled:cursor-not-allowed ${
                          errors[`item_${idx}_desc`] ? 'border-red-400 bg-red-50' : 'border-border bg-surface'
                        } text-text-primary placeholder:text-text-muted`}
                      />
                    </div>

                    {/* Mobile row: qty + price side by side */}
                    <div className="sm:contents grid grid-cols-2 gap-2">
                      {/* Qty */}
                      <div>
                        <label className="sm:hidden text-xs text-text-secondary mb-1 block">Qty</label>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          placeholder="1"
                          value={item.quantity}
                          onChange={(e) => updateLineItem(idx, 'quantity', e.target.value)}
                          disabled={isReadOnly}
                          className={`w-full px-3 py-2 rounded-lg border text-sm sm:text-right focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-muted disabled:cursor-not-allowed ${
                            errors[`item_${idx}_qty`] ? 'border-red-400 bg-red-50' : 'border-border bg-surface'
                          } text-text-primary`}
                        />
                      </div>

                      {/* Unit Price */}
                      <div>
                        <label className="sm:hidden text-xs text-text-secondary mb-1 block">
                          Unit Price ({sym})
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm pointer-events-none">
                            {sym}
                          </span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            value={item.unitPrice}
                            onChange={(e) => updateLineItem(idx, 'unitPrice', e.target.value)}
                            disabled={isReadOnly}
                            className={`w-full pl-6 pr-3 py-2 rounded-lg border text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-muted disabled:cursor-not-allowed ${
                              errors[`item_${idx}_price`] ? 'border-red-400 bg-red-50' : 'border-border bg-surface'
                            } text-text-primary`}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Total + remove */}
                    <div className="flex items-center justify-between sm:contents">
                      <span className="text-sm font-medium text-text-primary sm:text-right sm:block sm:w-full">
                        {lineTotal > 0
                          ? `${sym}${lineTotal.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : '—'}
                      </span>
                      <div className="sm:flex sm:justify-center">
                        {!isReadOnly && form.lineItems.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => removeLineItem(idx)}
                            className="p-1.5 rounded-lg text-text-muted hover:text-red-500 hover:bg-red-50 transition-colors"
                            title="Remove item"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        ) : (
                          <div className="w-7" />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Mobile add item button */}
            {!isReadOnly && (
              <button
                type="button"
                onClick={addLineItem}
                className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-border rounded-xl text-sm text-text-secondary hover:border-primary hover:text-primary transition-colors sm:hidden"
              >
                <Plus className="w-4 h-4" />
                Add Item
              </button>
            )}
          </SectionCard>

          {/* ─── §4 Totals ───────────────────────────────────────────────── */}
          <SectionCard title="Totals">
            {/* WHT Segmented Control */}
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-2">
                Withholding Tax (WHT) Rate
              </label>
              <div className="inline-flex rounded-xl border border-border overflow-hidden">
                {([0, 5, 10] as WhtRate[]).map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => !isReadOnly && setField('whtRate', rate)}
                    disabled={isReadOnly}
                    className={`px-5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${
                      form.whtRate === rate
                        ? 'bg-primary text-white'
                        : 'bg-surface text-text-secondary hover:bg-muted disabled:hover:bg-surface'
                    }`}
                  >
                    {rate}%
                  </button>
                ))}
              </div>
              {form.whtRate > 0 && (
                <p className="text-xs text-text-secondary mt-2">
                  WHT is deducted by the client and remitted to FIRS on your behalf.
                </p>
              )}
            </div>

            {/* Totals breakdown */}
            <div className="bg-muted/50 rounded-xl px-4 py-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">Subtotal</span>
                <span className="font-medium text-text-primary">
                  {fmtCurrency(totals.subtotal, form.currency)}
                </span>
              </div>

              {form.whtRate > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-text-secondary">
                    WHT ({form.whtRate}%) — deducted by client
                  </span>
                  <span className="font-medium text-red-500">
                    −{fmtCurrency(totals.whtAmount, form.currency)}
                  </span>
                </div>
              )}

              {isVatRegistered ? (
                <div className="flex justify-between text-sm">
                  <span className="text-text-secondary">VAT (7.5%)</span>
                  <span className="font-medium text-text-primary">
                    +{fmtCurrency(totals.vatAmount, form.currency)}
                  </span>
                </div>
              ) : null}

              <div className="flex justify-between text-base font-semibold pt-2 border-t border-border mt-2">
                <span className="text-text-primary">Total Due</span>
                <span className="text-primary text-lg">
                  {fmtCurrency(totals.totalDue, form.currency)}
                </span>
              </div>
            </div>

            {!isVatRegistered && form.currency === 'NGN' && (
              <p className="text-xs text-text-muted">
                VAT (7.5%) is not applied — your entity is not VAT-registered.
              </p>
            )}
          </SectionCard>

          {/* ─── §5 Notes ────────────────────────────────────────────────── */}
          <SectionCard
            title="Notes"
            subtitle="Payment terms, bank details, or special instructions"
          >
            <textarea
              placeholder="e.g. Payment due within 30 days. Bank: GTBank, Acc: 0123456789"
              value={form.notes}
              onChange={(e) => setField('notes', e.target.value)}
              disabled={isReadOnly}
              rows={4}
              className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-sm text-text-primary placeholder:text-text-muted resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-muted disabled:cursor-not-allowed"
            />
          </SectionCard>

          {/* ─── §6 Recurring ────────────────────────────────────────────── */}
          {!isReadOnly && (
            <SectionCard
              title="Make Recurring"
              subtitle="Auto-generate a new draft invoice on a repeating schedule"
              action={
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.isRecurring}
                  onClick={() => setField('isRecurring', !form.isRecurring)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
                    form.isRecurring ? 'bg-primary' : 'bg-border'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                      form.isRecurring ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              }
            >
              {form.isRecurring && (
                <div className="space-y-4 pt-1">
                  {/* Interval selector */}
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-2">
                      Repeat Interval
                    </label>
                    <div className="inline-flex rounded-xl border border-border overflow-hidden">
                      {(['monthly', 'quarterly'] as RecurringInterval[]).map((interval) => (
                        <button
                          key={interval}
                          type="button"
                          onClick={() => setField('recurringInterval', interval)}
                          className={`px-5 py-2 text-sm font-medium transition-colors capitalize ${
                            form.recurringInterval === interval
                              ? 'bg-primary text-white'
                              : 'bg-surface text-text-secondary hover:bg-muted'
                          }`}
                        >
                          {interval}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Next issue date */}
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1.5">
                      Next Issue Date
                    </label>
                    <input
                      type="date"
                      value={form.nextIssueDate}
                      onChange={(e) => setField('nextIssueDate', e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <p className="text-xs text-text-muted mt-1">
                      A new draft invoice will be generated on this date, then advanced by{' '}
                      {form.recurringInterval === 'monthly' ? '1 month' : '3 months'} each time.
                    </p>
                  </div>
                </div>
              )}
            </SectionCard>
          )}

        </div>
      </div>

      {/* ─── Sticky Footer ───────────────────────────────────────────────── */}
      {!isReadOnly && (
        <div className="fixed bottom-0 left-0 right-0 md:left-64 z-20 bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/90 border-t border-border px-4 py-3 safe-bottom">
          <div className="max-w-2xl mx-auto flex items-center gap-2.5">
            {/* Save as Draft */}
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={isSaving || isSending}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border border-border text-sm font-medium text-text-primary hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving && !isSending ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">Save Draft</span>
              <span className="sm:hidden">Draft</span>
            </button>

            {/* Preview Invoice */}
            <button
              type="button"
              onClick={handlePreview}
              disabled={isSaving || isSending}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border border-border text-sm font-medium text-text-primary hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Eye className="w-4 h-4" />
              Preview
            </button>

            {/* Send Invoice */}
            <button
              type="button"
              onClick={handleSend}
              disabled={isSaving || isSending}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSending ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">Send Invoice</span>
              <span className="sm:hidden">Send</span>
            </button>
          </div>
        </div>
      )}

      {/* ─── Dirty Form Blocker Dialog ────────────────────────────────────── */}
      {blocker.state === 'blocked' && (
        <ConfirmDialog
          title="Unsaved changes"
          message="You have unsaved changes to this invoice. If you leave now, your changes will be lost."
          confirmLabel="Leave anyway"
          cancelLabel="Keep editing"
          onConfirm={() => blocker.proceed()}
          onCancel={() => blocker.reset()}
        />
      )}
    </div>
  );
}
