import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '@convex/_generated/api';
import { toast } from 'sonner';
import type { Id } from '@convex/_generated/dataModel';
import {
  ArrowLeft,
  Download,
  Share2,
  Send,
  CheckCircle,
  XCircle,
  Pencil,
  Loader2,
  Link,
  Building2,
} from 'lucide-react';
import { Skeleton } from '../components/Skeleton';

// ── Types ─────────────────────────────────────────────────────────────────────

type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';

interface LineItem {
  _id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface InvoiceFull {
  _id: Id<'invoices'>;
  entityId: Id<'entities'>;
  invoiceNumber: string;
  status: InvoiceStatus;
  clientName: string;
  clientEmail?: string;
  issueDate: number;
  dueDate: number;
  currency: 'NGN' | 'USD' | 'GBP' | 'EUR';
  subtotal: number;
  whtRate: number;
  whtAmount?: number;
  vatAmount?: number;
  totalDue: number;
  amountNgn: number;
  notes?: string;
  pdfStorageId?: string;
  pdfUrl?: string | null;
  entityName: string;
  paidAt?: number;
  items: LineItem[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CURRENCY_SYMBOLS: Record<string, string> = {
  NGN: '₦',
  USD: '$',
  GBP: '£',
  EUR: '€',
};

function formatCurrency(kobo: number, currency = 'NGN'): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? '₦';
  const amount = kobo / 100;
  return `${symbol}${amount.toLocaleString('en', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-NG', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

// ── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: InvoiceStatus }) {
  const configs: Record<InvoiceStatus, { label: string; className: string }> = {
    draft: { label: 'Draft', className: 'bg-neutral-100 text-neutral-600' },
    sent: { label: 'Sent', className: 'bg-blue-50 text-blue-600 border border-blue-200' },
    paid: { label: 'Paid', className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
    overdue: { label: 'Overdue', className: 'bg-red-50 text-red-600 border border-red-200' },
    cancelled: { label: 'Cancelled', className: 'bg-neutral-100 text-neutral-400' },
  };
  const { label, className } = configs[status] ?? configs.draft;
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${className}`}>
      {label}
    </span>
  );
}

// ── Mark as Paid Dialog ───────────────────────────────────────────────────────

interface MarkPaidDialogProps {
  invoice: InvoiceFull;
  onConfirm: (amountNgn?: number) => void;
  onClose: () => void;
  loading: boolean;
}

function MarkPaidDialog({ invoice, onConfirm, onClose, loading }: MarkPaidDialogProps) {
  const isNGN = invoice.currency === 'NGN';
  const [amountNgn, setAmountNgn] = useState('');

  function handleConfirm() {
    if (!isNGN && !amountNgn) return;
    const ngnKobo = !isNGN ? Math.round(parseFloat(amountNgn) * 100) : undefined;
    onConfirm(ngnKobo);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-6 shadow-xl animate-slide-up">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
            <CheckCircle className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-heading-sm font-semibold text-neutral-900">Mark as Paid</p>
            <p className="text-body-xs text-neutral-500">{invoice.invoiceNumber}</p>
          </div>
        </div>

        <p className="text-body-sm text-neutral-600 mb-4">
          This will record a payment and create an income transaction for{' '}
          <strong>{invoice.clientName}</strong>.
        </p>

        {!isNGN && (
          <div className="mb-4">
            <label className="block text-body-xs font-medium text-neutral-700 mb-1">
              Amount Received (₦ NGN) <span className="text-red-500">*</span>
            </label>
            <p className="text-body-xs text-neutral-400 mb-2">
              Invoice is in {invoice.currency}. Enter the actual NGN amount received.
            </p>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 text-sm">₦</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amountNgn}
                onChange={(e) => setAmountNgn(e.target.value)}
                placeholder="0.00"
                className="w-full pl-7 pr-4 py-2.5 rounded-lg border border-border text-body-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-lg border border-border text-body-sm text-neutral-700 hover:bg-neutral-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || (!isNGN && !amountNgn)}
            className="flex-1 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-body-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Confirm Payment
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Cancel Dialog ────────────────────────────────────────────────────────────

function CancelDialog({
  invoiceNumber,
  onConfirm,
  onClose,
  loading,
}: {
  invoiceNumber: string;
  onConfirm: () => void;
  onClose: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-6 shadow-xl animate-slide-up">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
            <XCircle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <p className="text-heading-sm font-semibold text-neutral-900">Cancel Invoice</p>
            <p className="text-body-xs text-neutral-500">{invoiceNumber}</p>
          </div>
        </div>
        <p className="text-body-sm text-neutral-600 mb-4">
          Are you sure you want to cancel this invoice? This action cannot be undone.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-lg border border-border text-body-sm text-neutral-700 hover:bg-neutral-50 transition-colors disabled:opacity-50"
          >
            Keep Invoice
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 text-white text-body-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
            Cancel Invoice
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function InvoicePreview() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const invoice = useQuery(
    (api as any).invoices.get,
    id ? { id: id as Id<'invoices'> } : 'skip'
  ) as InvoiceFull | null | undefined;

  const markPaidMutation = useMutation((api as any).invoices.markPaid);
  const cancelMutation = useMutation((api as any).invoices.cancel);
  const generatePdfAction = useAction((api as any).invoiceActions.generatePdf);
  const sendAction = useAction((api as any).invoiceActions.send);

  const [showMarkPaid, setShowMarkPaid] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [markPaidLoading, setMarkPaidLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);

  const isLoading = invoice === undefined;
  const notFound = invoice === null;

  // ── Actions ──────────────────────────────────────────────────────────────

  async function handleDownloadPdf() {
    if (!invoice) return;
    setPdfLoading(true);
    try {
      let url = invoice.pdfUrl;

      if (!url) {
        // Generate PDF first; then the query will update reactively with new pdfUrl
        await generatePdfAction({ id: invoice._id });
        toast.success('PDF generated — downloading now');
        // Re-fetch by waiting briefly for reactive update, then rely on invoice.pdfUrl
        // Since we can't immediately get the URL here, show a toast
        toast.info('Refresh the page if the download does not start automatically.');
        setPdfLoading(false);
        return;
      }

      // Trigger download
      const a = document.createElement('a');
      a.href = url;
      a.download = `${invoice.invoiceNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to generate PDF');
    } finally {
      setPdfLoading(false);
    }
  }

  async function handleShare() {
    if (!invoice) return;
    const shareUrl = `${window.location.origin}/app/invoices/${invoice._id}`;

    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: `Invoice ${invoice.invoiceNumber}`,
          text: `Invoice ${invoice.invoiceNumber} from ${invoice.entityName}`,
          url: shareUrl,
        });
      } catch {
        // User cancelled — ignore
      }
    } else {
      // Web fallback: copy link to clipboard
      try {
        await navigator.clipboard.writeText(shareUrl);
        toast.success('Invoice link copied to clipboard');
      } catch {
        toast.error('Could not copy link');
      }
    }
  }

  async function handleSendToClient() {
    if (!invoice) return;
    if (!invoice.clientEmail) {
      toast.error('Cannot send: no client email address on this invoice');
      return;
    }
    setSendLoading(true);
    try {
      await sendAction({ id: invoice._id });
      toast.success(`Invoice sent to ${invoice.clientEmail}`);
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to send invoice');
    } finally {
      setSendLoading(false);
    }
  }

  async function handleMarkPaid(amountNgn?: number) {
    if (!invoice) return;
    setMarkPaidLoading(true);
    try {
      await markPaidMutation({ id: invoice._id, amountNgn });
      toast.success('Invoice marked as paid — income transaction created');
      setShowMarkPaid(false);
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to mark as paid');
    } finally {
      setMarkPaidLoading(false);
    }
  }

  async function handleCancel() {
    if (!invoice) return;
    setCancelLoading(true);
    try {
      await cancelMutation({ id: invoice._id });
      toast.success('Invoice cancelled');
      setShowCancel(false);
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to cancel invoice');
    } finally {
      setCancelLoading(false);
    }
  }

  // ── Loading & Not Found ──────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto animate-fade-in">
        <div className="flex items-center gap-3 mb-6">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-6 w-40 rounded" />
        </div>
        <div className="bg-white rounded-2xl border border-border shadow-soft p-8 space-y-6">
          <Skeleton className="h-8 w-48 rounded" />
          <Skeleton className="h-4 w-32 rounded" />
          <div className="space-y-3 pt-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="max-w-3xl mx-auto flex flex-col items-center justify-center py-20 animate-fade-in">
        <p className="text-heading-md text-neutral-900 mb-2">Invoice not found</p>
        <p className="text-body-sm text-neutral-500 mb-5">This invoice may have been deleted or doesn't exist.</p>
        <button
          onClick={() => navigate('/app/invoices')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-body-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Invoices
        </button>
      </div>
    );
  }

  const isDraft = invoice.status === 'draft';
  const isSent = invoice.status === 'sent';
  const isOverdue = invoice.status === 'overdue';
  const isPaid = invoice.status === 'paid';
  const isCancelled = invoice.status === 'cancelled';
  const canMarkPaid = isSent || isOverdue;
  const canCancel = isDraft || isSent;
  const canEdit = isDraft;
  const currency = invoice.currency;

  return (
    <div className="max-w-3xl mx-auto animate-fade-in pb-10">
      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={() => navigate('/app/invoices')}
          className="inline-flex items-center gap-1.5 text-body-sm text-neutral-600 hover:text-neutral-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Invoices
        </button>
        <StatusBadge status={invoice.status} />
      </div>

      {/* ── Actions Bar ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 mb-5">
        {canEdit && (
          <button
            onClick={() => navigate(`/app/invoices/${invoice._id}/edit`)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-body-sm text-neutral-700 hover:bg-neutral-50 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit
          </button>
        )}

        <button
          onClick={handleDownloadPdf}
          disabled={pdfLoading}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-body-sm text-neutral-700 hover:bg-neutral-50 transition-colors disabled:opacity-60"
        >
          {pdfLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Download className="w-3.5 h-3.5" />
          )}
          Download PDF
        </button>

        <button
          onClick={handleShare}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-body-sm text-neutral-700 hover:bg-neutral-50 transition-colors"
        >
          {typeof navigator.share === 'function' ? <Share2 className="w-3.5 h-3.5" /> : <Link className="w-3.5 h-3.5" />}
          {typeof navigator.share === 'function' ? 'Share' : 'Copy Link'}
        </button>

        {!isCancelled && !isPaid && (
          <button
            onClick={handleSendToClient}
            disabled={sendLoading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-blue-200 bg-blue-50 text-body-sm text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-60"
          >
            {sendLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Send to Client
          </button>
        )}

        {canMarkPaid && (
          <button
            onClick={() => setShowMarkPaid(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-body-sm text-emerald-700 hover:bg-emerald-100 transition-colors"
          >
            <CheckCircle className="w-3.5 h-3.5" />
            Mark as Paid
          </button>
        )}

        {canCancel && (
          <button
            onClick={() => setShowCancel(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-body-sm text-red-600 hover:bg-red-100 transition-colors"
          >
            <XCircle className="w-3.5 h-3.5" />
            Cancel Invoice
          </button>
        )}
      </div>

      {/* ── Invoice Document ─────────────────────────────────────────────── */}
      <div className={`bg-white rounded-2xl border border-border shadow-soft overflow-hidden ${isCancelled ? 'opacity-60' : ''}`}>

        {/* Header */}
        <div className="bg-primary px-8 py-7 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-md bg-white/20 flex items-center justify-center">
                <Building2 className="w-4 h-4 text-white" />
              </div>
              <p className="text-white font-display font-bold text-lg tracking-wide">
                {invoice.entityName}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-white/70 text-xs font-semibold uppercase tracking-widest mb-0.5">
              Invoice
            </p>
            <p className="text-white font-mono font-bold text-xl">
              {invoice.invoiceNumber}
            </p>
          </div>
        </div>

        {/* Invoice meta */}
        <div className="px-8 py-5 grid grid-cols-2 gap-4 border-b border-border bg-neutral-50/50">
          <div>
            <p className="text-body-xs text-neutral-500 mb-0.5">Bill To</p>
            <p className="text-body-sm font-semibold text-neutral-900">{invoice.clientName}</p>
            {invoice.clientEmail && (
              <p className="text-body-xs text-neutral-500">{invoice.clientEmail}</p>
            )}
          </div>
          <div className="text-right">
            <div className="space-y-1">
              <div>
                <p className="text-body-xs text-neutral-500">Issue Date</p>
                <p className="text-body-sm font-medium text-neutral-800">{formatDate(invoice.issueDate)}</p>
              </div>
              <div>
                <p className="text-body-xs text-neutral-500">Due Date</p>
                <p className={`text-body-sm font-medium ${isOverdue ? 'text-red-600' : 'text-neutral-800'}`}>
                  {formatDate(invoice.dueDate)}
                </p>
              </div>
              {currency !== 'NGN' && (
                <div>
                  <p className="text-body-xs text-neutral-500">Currency</p>
                  <p className="text-body-sm font-medium text-neutral-800">{currency}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Line Items Table */}
        <div className="px-8 py-5">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-body-xs font-semibold text-neutral-500 uppercase tracking-wide pb-2 pr-4">
                  Description
                </th>
                <th className="text-right text-body-xs font-semibold text-neutral-500 uppercase tracking-wide pb-2 px-2 w-16">
                  Qty
                </th>
                <th className="text-right text-body-xs font-semibold text-neutral-500 uppercase tracking-wide pb-2 px-2 w-28">
                  Unit Price
                </th>
                <th className="text-right text-body-xs font-semibold text-neutral-500 uppercase tracking-wide pb-2 pl-2 w-28">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item) => (
                <tr key={item._id} className="border-b border-border/50 last:border-0">
                  <td className="py-3 pr-4 text-body-sm text-neutral-800">{item.description}</td>
                  <td className="py-3 px-2 text-body-sm text-neutral-700 text-right font-mono">
                    {item.quantity}
                  </td>
                  <td className="py-3 px-2 text-body-sm text-neutral-700 text-right font-mono">
                    {formatCurrency(item.unitPrice, currency)}
                  </td>
                  <td className="py-3 pl-2 text-body-sm text-neutral-900 text-right font-mono font-medium">
                    {formatCurrency(item.total, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="px-8 py-5 border-t border-border bg-neutral-50/50">
          <div className="ml-auto max-w-xs space-y-2">
            <div className="flex justify-between text-body-sm">
              <span className="text-neutral-600">Subtotal</span>
              <span className="font-mono text-neutral-900">{formatCurrency(invoice.subtotal, currency)}</span>
            </div>

            {invoice.whtRate > 0 && invoice.whtAmount !== undefined && (
              <div className="flex justify-between text-body-sm">
                <span className="text-neutral-600">WHT ({invoice.whtRate}%)</span>
                <span className="font-mono text-red-600">−{formatCurrency(invoice.whtAmount, currency)}</span>
              </div>
            )}

            {invoice.vatAmount !== undefined && invoice.vatAmount > 0 && (
              <div className="flex justify-between text-body-sm">
                <span className="text-neutral-600">VAT (7.5%)</span>
                <span className="font-mono text-neutral-900">+{formatCurrency(invoice.vatAmount, currency)}</span>
              </div>
            )}

            <div className="flex justify-between pt-2 border-t border-border">
              <span className="text-body-sm font-semibold text-neutral-900">Total Due</span>
              <span className="text-heading-sm font-bold font-mono text-primary">
                {formatCurrency(invoice.totalDue, currency)}
              </span>
            </div>

            {currency !== 'NGN' && (
              <div className="flex justify-between text-body-xs">
                <span className="text-neutral-400">≈ NGN equivalent</span>
                <span className="font-mono text-neutral-500">{formatCurrency(invoice.amountNgn, 'NGN')}</span>
              </div>
            )}
          </div>
        </div>

        {/* Payment Details & Notes */}
        {(isPaid || invoice.notes) && (
          <div className="px-8 py-5 border-t border-border space-y-4">
            {isPaid && invoice.paidAt && (
              <div>
                <p className="text-body-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1">
                  Payment Received
                </p>
                <p className="text-body-sm text-emerald-700 font-medium">
                  {formatDate(invoice.paidAt)}
                </p>
              </div>
            )}

            {invoice.notes && (
              <div>
                <p className="text-body-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1">
                  Notes
                </p>
                <p className="text-body-sm text-neutral-700 whitespace-pre-wrap">{invoice.notes}</p>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="px-8 py-4 bg-primary/5 border-t border-border text-center">
          <p className="text-body-xs text-neutral-500">
            Generated by TaxEase Nigeria · {invoice.invoiceNumber}
          </p>
        </div>
      </div>

      {/* ── Dialogs ──────────────────────────────────────────────────────── */}
      {showMarkPaid && (
        <MarkPaidDialog
          invoice={invoice}
          onConfirm={handleMarkPaid}
          onClose={() => setShowMarkPaid(false)}
          loading={markPaidLoading}
        />
      )}

      {showCancel && (
        <CancelDialog
          invoiceNumber={invoice.invoiceNumber}
          onConfirm={handleCancel}
          onClose={() => setShowCancel(false)}
          loading={cancelLoading}
        />
      )}
    </div>
  );
}
