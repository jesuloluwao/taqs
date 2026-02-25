import { useState, useEffect, useRef } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { toast } from 'sonner';
import { X, ChevronDown, Check } from 'lucide-react';
import { useEntity } from '../contexts/EntityContext';

// ── Types ──────────────────────────────────────────────────────────────────
interface CategoryRow {
  _id: Id<'categories'>;
  name: string;
  type: string;
  isDeductibleDefault?: boolean;
}

type Currency = 'NGN' | 'USD' | 'GBP' | 'EUR';
type Direction = 'credit' | 'debit';
type TxType =
  | 'income'
  | 'business_expense'
  | 'personal_expense'
  | 'transfer'
  | 'uncategorised';

interface ManualForm {
  date: string;
  description: string;
  amount: string;
  currency: Currency;
  direction: Direction;
  fxRate: string;
  categoryId: string;
  type: TxType;
  isDeductible: boolean;
  deductiblePercent: string;
  whtDeducted: string;
  whtRate: string;
  notes: string;
}

const CURRENCIES: Currency[] = ['NGN', 'USD', 'GBP', 'EUR'];

const TRANSACTION_TYPES: { value: TxType; label: string }[] = [
  { value: 'income', label: 'Income' },
  { value: 'business_expense', label: 'Business Expense' },
  { value: 'personal_expense', label: 'Personal Expense' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'uncategorised', label: 'Uncategorised' },
];

// ── Helpers ────────────────────────────────────────────────────────────────
function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function computeAmountNgn(amount: string, currency: Currency, fxRate: string): number | null {
  const amtNaira = parseFloat(amount);
  if (isNaN(amtNaira) || amtNaira <= 0) return null;
  const amtKobo = Math.round(amtNaira * 100);
  if (currency === 'NGN') return amtKobo;
  const rate = parseFloat(fxRate);
  if (!rate || rate <= 0) return null;
  return Math.round(amtKobo * rate);
}

// ── Validation ─────────────────────────────────────────────────────────────
function validate(form: ManualForm): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.date) errors.date = 'Date is required';
  if (!form.description.trim()) errors.description = 'Description is required';
  const amt = parseFloat(form.amount);
  if (!form.amount || isNaN(amt) || amt <= 0) errors.amount = 'Enter a valid amount';
  if (form.currency !== 'NGN') {
    const fx = parseFloat(form.fxRate);
    if (!form.fxRate || isNaN(fx) || fx <= 0)
      errors.fxRate = 'Enter the NGN exchange rate for this currency';
  }
  if (form.deductiblePercent) {
    const pct = Number(form.deductiblePercent);
    if (isNaN(pct) || pct < 0 || pct > 100)
      errors.deductiblePercent = 'Must be 0–100';
  }
  return errors;
}

// ── Form field ─────────────────────────────────────────────────────────────
function Field({
  label,
  error,
  required,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-label text-neutral-700 mb-1">
        {label}
        {required && <span className="text-danger ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-[11px] text-danger mt-1">{error}</p>}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export function ManualTransactionModal({ onClose }: { onClose: () => void }) {
  const { activeEntityId } = useEntity();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const categories = useQuery((api as any).categories.listAll) as CategoryRow[] | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const manualCreate = useMutation((api as any).transactions.manualCreate);

  const [form, setForm] = useState<ManualForm>({
    date: todayISO(),
    description: '',
    amount: '',
    currency: 'NGN',
    direction: 'debit',
    fxRate: '',
    categoryId: '',
    type: 'uncategorised',
    isDeductible: false,
    deductiblePercent: '',
    whtDeducted: '',
    whtRate: '',
    notes: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Close on Escape
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const overlayRef = useRef<HTMLDivElement>(null);

  function updateField<K extends keyof ManualForm>(key: K, value: ManualForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: '' }));
  }

  // Auto-set isDeductible when category changes
  function handleCategoryChange(catId: string) {
    setForm((prev) => {
      let isDeductible = prev.isDeductible;
      if (catId && categories) {
        const cat = categories.find((c) => c._id === catId);
        if (cat) isDeductible = cat.isDeductibleDefault ?? false;
      }
      return { ...prev, categoryId: catId, isDeductible };
    });
    if (errors.categoryId) setErrors((prev) => ({ ...prev, categoryId: '' }));
  }

  const amountNgn = computeAmountNgn(form.amount, form.currency, form.fxRate);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationErrors = validate(form);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    if (!activeEntityId) {
      toast.error('No entity selected');
      return;
    }

    setIsSaving(true);
    try {
      const amtKobo = Math.round(parseFloat(form.amount) * 100);
      const whtKobo = form.whtDeducted ? Math.round(parseFloat(form.whtDeducted) * 100) : undefined;

      await manualCreate({
        entityId: activeEntityId,
        date: new Date(form.date).getTime(),
        description: form.description.trim(),
        amount: amtKobo,
        currency: form.currency,
        fxRate: form.currency !== 'NGN' ? parseFloat(form.fxRate) : undefined,
        direction: form.direction,
        categoryId: (form.categoryId || undefined) as Id<'categories'> | undefined,
        type: form.type,
        deductiblePercent: form.deductiblePercent ? Number(form.deductiblePercent) : undefined,
        whtDeducted: whtKobo,
        whtRate: form.whtRate ? Number(form.whtRate) : undefined,
        notes: form.notes.trim() || undefined,
      });

      toast.success('Transaction added successfully');
      onClose();
    } catch {
      toast.error('Failed to add transaction');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full sm:max-w-lg bg-white sm:rounded-2xl rounded-t-2xl shadow-medium animate-slide-up max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border">
          <h2 className="text-heading-md font-display text-neutral-900">Add Transaction</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-neutral-400 hover:text-neutral-700 hover:bg-muted transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {/* Date */}
          <Field label="Date" required error={errors.date}>
            <input
              type="date"
              value={form.date}
              onChange={(e) => updateField('date', e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border text-body-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
            />
          </Field>

          {/* Description */}
          <Field label="Description" required error={errors.description}>
            <input
              type="text"
              value={form.description}
              onChange={(e) => updateField('description', e.target.value)}
              placeholder="e.g. Client payment, Office supplies…"
              className="w-full px-3 py-2 rounded-lg border border-border text-body-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </Field>

          {/* Amount + Currency */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount" required error={errors.amount}>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(e) => updateField('amount', e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 rounded-lg border border-border text-body-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </Field>

            <Field label="Currency">
              <div className="relative">
                <select
                  value={form.currency}
                  onChange={(e) => updateField('currency', e.target.value as Currency)}
                  className="w-full appearance-none pl-3 pr-8 py-2 rounded-lg border border-border text-body-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400 pointer-events-none" />
              </div>
            </Field>
          </div>

          {/* FX Rate (shown for non-NGN) */}
          {form.currency !== 'NGN' && (
            <div className="rounded-lg border border-accent/20 bg-accent/5 p-3 space-y-3">
              <Field
                label={`Exchange rate (1 ${form.currency} = ? NGN)`}
                required
                error={errors.fxRate}
              >
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.fxRate}
                  onChange={(e) => updateField('fxRate', e.target.value)}
                  placeholder="e.g. 1600"
                  className="w-full px-3 py-2 rounded-lg border border-border text-body-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
                />
              </Field>
              {amountNgn != null && (
                <p className="text-body-sm text-accent font-medium">
                  ≈{' '}
                  {new Intl.NumberFormat('en-NG', {
                    style: 'currency',
                    currency: 'NGN',
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  }).format(amountNgn / 100)}{' '}
                  NGN
                </p>
              )}
            </div>
          )}

          {/* Direction */}
          <Field label="Direction">
            <div className="flex gap-2">
              {(['credit', 'debit'] as Direction[]).map((dir) => (
                <button
                  key={dir}
                  type="button"
                  onClick={() => updateField('direction', dir)}
                  className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-body-sm font-medium transition-colors ${
                    form.direction === dir
                      ? dir === 'credit'
                        ? 'border-success bg-success/10 text-success'
                        : 'border-danger bg-danger/10 text-danger'
                      : 'border-border text-neutral-500 hover:bg-muted'
                  }`}
                >
                  {form.direction === dir && <Check className="w-3.5 h-3.5" />}
                  {dir === 'credit' ? 'Credit (in)' : 'Debit (out)'}
                </button>
              ))}
            </div>
          </Field>

          {/* Category */}
          <Field label="Category" error={errors.categoryId}>
            <div className="relative">
              <select
                value={form.categoryId}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className="w-full appearance-none pl-3 pr-8 py-2 rounded-lg border border-border text-body-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
              >
                <option value="">— No category —</option>
                {(categories ?? []).map((cat) => (
                  <option key={cat._id} value={cat._id}>
                    {cat.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400 pointer-events-none" />
            </div>
          </Field>

          {/* Type */}
          <Field label="Type">
            <div className="relative">
              <select
                value={form.type}
                onChange={(e) => updateField('type', e.target.value as TxType)}
                className="w-full appearance-none pl-3 pr-8 py-2 rounded-lg border border-border text-body-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
              >
                {TRANSACTION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400 pointer-events-none" />
            </div>
          </Field>

          {/* Tax fields */}
          <div className="rounded-lg border border-border bg-neutral-50 p-4 space-y-3">
            <p className="text-label font-medium text-neutral-500 uppercase tracking-wider">
              Tax Information (optional)
            </p>

            {/* isDeductible */}
            <div className="flex items-center justify-between">
              <span className="text-body-sm text-neutral-700">Tax deductible</span>
              <button
                type="button"
                onClick={() => updateField('isDeductible', !form.isDeductible)}
                className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-body-sm font-medium transition-colors ${
                  form.isDeductible
                    ? 'bg-success/10 text-success'
                    : 'bg-neutral-200 text-neutral-500'
                }`}
              >
                {form.isDeductible ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                {form.isDeductible ? 'Yes' : 'No'}
              </button>
            </div>

            {/* deductiblePercent */}
            {form.isDeductible && (
              <Field label="Deductible %" error={errors.deductiblePercent}>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={form.deductiblePercent}
                  onChange={(e) => updateField('deductiblePercent', e.target.value)}
                  placeholder="100"
                  className="w-28 px-3 py-2 rounded-lg border border-border text-body-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
                />
              </Field>
            )}

            {/* whtDeducted */}
            <Field label="WHT Deducted (₦)">
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.whtDeducted}
                onChange={(e) => updateField('whtDeducted', e.target.value)}
                placeholder="0.00"
                className="w-40 px-3 py-2 rounded-lg border border-border text-body-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
              />
            </Field>

            {/* whtRate */}
            <Field label="WHT Rate (%)">
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={form.whtRate}
                onChange={(e) => updateField('whtRate', e.target.value)}
                placeholder="e.g. 5"
                className="w-28 px-3 py-2 rounded-lg border border-border text-body-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
              />
            </Field>
          </div>

          {/* Notes */}
          <Field label="Notes">
            <textarea
              value={form.notes}
              onChange={(e) => updateField('notes', e.target.value)}
              rows={3}
              placeholder="Optional notes…"
              className="w-full px-3 py-2 rounded-lg border border-border text-body-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
          </Field>

          {/* Submit */}
          <div className="pt-2 pb-2">
            <button
              type="submit"
              disabled={isSaving}
              className="w-full px-4 py-3 rounded-lg bg-primary text-white text-body font-medium hover:bg-primary/90 transition-colors shadow-soft disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving…
                </>
              ) : (
                'Add Transaction'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
