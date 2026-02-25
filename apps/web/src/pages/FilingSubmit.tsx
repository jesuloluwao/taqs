import { useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import { useEntity } from '../contexts/EntityContext';
import { Skeleton } from '../components/Skeleton';
import { toast } from 'sonner';
import type { Id } from '@convex/_generated/dataModel';
import {
  ChevronLeft,
  ChevronDown,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileText,
  Upload,
  Loader2,
  AlertTriangle,
  Info,
  PartyPopper,
  Download,
  History,
} from 'lucide-react';

// ─── types ────────────────────────────────────────────────────────────────────

type FilingStatus =
  | 'draft'
  | 'generated'
  | 'submitted'
  | 'payment_pending'
  | 'payment_confirmed'
  | 'tcc_obtained';

type UploadPhase = 'idle' | 'uploading' | 'done' | 'error';

interface FilingRecord {
  _id: string;
  entityId: string;
  taxYear: number;
  status: FilingStatus;
  selfAssessmentPdfId?: string;
  paymentReceiptId?: string;
  tccDocumentId?: string;
  netTaxPayable?: number;
  isNilReturn?: boolean;
  engineVersion?: string;
  generatedAt?: number;
  submittedAt?: number;
  pdfUrl?: string | null;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatNaira(kobo: number): string {
  const ngn = kobo / 100;
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(ngn);
}

const FIRS_ACCOUNT = {
  bank: 'Zenith Bank PLC',
  accountName: 'Federal Inland Revenue Service',
  accountNumber: '1000123456',
  sortCode: '057-150-011',
  reference: 'Use your TIN as reference',
};

// ─── status helpers ───────────────────────────────────────────────────────────

/** Which step index (0-based) is currently active given the filing status */
function getActiveStep(status: FilingStatus, isNilReturn: boolean): number {
  switch (status) {
    case 'generated':
      return 0; // Step 1: Submit
    case 'submitted':
      return isNilReturn ? 3 : 1; // nil → TCC step; normal → payment step
    case 'payment_pending':
      return 2; // Step 3: Upload receipt
    case 'payment_confirmed':
      return 3; // Step 4: TCC
    case 'tcc_obtained':
      return 4; // Step 5: Store Records (all done)
    default:
      return 0;
  }
}

/** Whether step index is completed given the status */
function isStepComplete(stepIndex: number, status: FilingStatus, isNilReturn: boolean): boolean {
  const activeStep = getActiveStep(status, isNilReturn);
  if (status === 'tcc_obtained') return true; // All complete
  return stepIndex < activeStep;
}

// ─── sub-components ───────────────────────────────────────────────────────────

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      toast.success(`${label} copied!`);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/40 last:border-0">
      <div>
        <p className="text-xs text-neutral-500">{label}</p>
        <p className="text-sm font-mono font-medium text-neutral-900 mt-0.5">{value}</p>
      </div>
      <button
        onClick={handleCopy}
        className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-border hover:bg-muted/40 transition-colors text-neutral-600"
      >
        {copied ? (
          <>
            <Check className="w-3 h-3 text-emerald-500" />
            Copied
          </>
        ) : (
          <>
            <Copy className="w-3 h-3" />
            Copy
          </>
        )}
      </button>
    </div>
  );
}

interface FileUploadZoneProps {
  label: string;
  onFileSelected: (file: File) => void;
  phase: UploadPhase;
  progress?: number;
  errorMessage?: string;
  accept?: string;
  disabled?: boolean;
}

function FileUploadZone({
  label,
  onFileSelected,
  phase,
  errorMessage,
  accept = '.jpg,.jpeg,.png,.pdf',
  disabled,
}: FileUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFile = (file: File) => {
    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error('Invalid file type. Please use JPG, PNG, or PDF.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File too large. Maximum size is 10MB.');
      return;
    }
    onFileSelected(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (disabled) return;
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  if (phase === 'done') {
    return (
      <div className="flex items-center gap-3 p-4 rounded-xl border border-emerald-200 bg-emerald-50">
        <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-emerald-700">Upload complete</p>
          <p className="text-xs text-emerald-600 mt-0.5">Document saved to your filing record</p>
        </div>
      </div>
    );
  }

  if (phase === 'uploading') {
    return (
      <div className="flex items-center gap-3 p-4 rounded-xl border border-primary/20 bg-primary/5">
        <Loader2 className="w-5 h-5 text-primary animate-spin flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-primary">Uploading…</p>
          <div className="mt-1.5 h-1.5 bg-primary/20 rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full animate-pulse w-1/2" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
          disabled
            ? 'border-border/30 bg-muted/20 cursor-not-allowed'
            : isDragOver
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50 hover:bg-muted/20'
        }`}
      >
        <Upload className={`w-6 h-6 ${disabled ? 'text-neutral-300' : 'text-neutral-400'}`} />
        <div className="text-center">
          <p className={`text-sm font-medium ${disabled ? 'text-neutral-400' : 'text-neutral-700'}`}>
            {label}
          </p>
          <p className="text-xs text-neutral-400 mt-0.5">JPG, PNG or PDF • Max 10MB</p>
        </div>
      </div>
      {phase === 'error' && errorMessage && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-red-600">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          {errorMessage}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}

interface StepProps {
  number: number;
  title: string;
  status: 'complete' | 'active' | 'locked';
  isLast?: boolean;
  children?: React.ReactNode;
  isCollapsible?: boolean;
  defaultOpen?: boolean;
}

function Step({ number, title, status, isLast, children, isCollapsible = true, defaultOpen }: StepProps) {
  const [isOpen, setIsOpen] = useState(
    defaultOpen !== undefined ? defaultOpen : status === 'active'
  );

  const canToggle = isCollapsible && (status === 'complete' || status === 'active');

  return (
    <div className={`flex gap-4 ${isLast ? '' : 'pb-2'}`}>
      {/* Left: connector line + circle */}
      <div className="flex flex-col items-center flex-shrink-0">
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
            status === 'complete'
              ? 'bg-emerald-100 text-emerald-600 border-2 border-emerald-300'
              : status === 'active'
              ? 'bg-primary text-white shadow-soft'
              : 'bg-neutral-100 text-neutral-400 border-2 border-neutral-200'
          }`}
        >
          {status === 'complete' ? <Check className="w-4 h-4" /> : number}
        </div>
        {!isLast && (
          <div className={`w-0.5 flex-1 mt-2 ${status === 'complete' ? 'bg-emerald-200' : 'bg-neutral-100'}`} style={{ minHeight: '24px' }} />
        )}
      </div>

      {/* Right: content */}
      <div className="flex-1 min-w-0 pb-6">
        <button
          onClick={() => canToggle && setIsOpen((o) => !o)}
          className={`flex items-center justify-between w-full text-left mb-2 ${canToggle ? 'cursor-pointer' : 'cursor-default'}`}
          disabled={!canToggle}
        >
          <h3
            className={`text-base font-semibold ${
              status === 'active'
                ? 'text-neutral-900'
                : status === 'complete'
                ? 'text-neutral-600'
                : 'text-neutral-400'
            }`}
          >
            {title}
          </h3>
          {canToggle && (
            <ChevronDown
              className={`w-4 h-4 text-neutral-400 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}
            />
          )}
        </button>
        {isOpen && children}
      </div>
    </div>
  );
}

// ─── completion celebration ───────────────────────────────────────────────────

function CompletionCelebration({
  filing,
  onDownloadPdf,
  isDownloading,
}: {
  filing: FilingRecord;
  onDownloadPdf: () => void;
  isDownloading: boolean;
}) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center text-center py-8 px-4">
      <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mb-5 shadow-soft">
        <PartyPopper className="w-10 h-10 text-emerald-500" />
      </div>
      <h2 className="text-heading-xl font-display text-neutral-900 mb-2">Filing Complete!</h2>
      <p className="text-body-sm text-neutral-500 mb-6 max-w-sm leading-relaxed">
        Your Tax Year {filing.taxYear} self-assessment is fully filed and your TCC has been obtained.
        Well done on completing your tax obligations!
      </p>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2 justify-center mb-6">
        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-700">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Self-assessment generated
        </span>
        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-700">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Submitted to FIRS
        </span>
        {!filing.isNilReturn && (
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-700">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Payment confirmed
          </span>
        )}
        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-700">
          <CheckCircle2 className="w-3.5 h-3.5" />
          TCC obtained
        </span>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
        {filing.selfAssessmentPdfId && (
          <button
            onClick={onDownloadPdf}
            disabled={isDownloading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-neutral-700 hover:bg-muted/40 transition-colors disabled:opacity-60"
          >
            {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Download PDF
          </button>
        )}
        <button
          onClick={() => navigate('/app/filing')}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors shadow-soft"
        >
          Back to Filing
        </button>
      </div>

      <button
        onClick={() => navigate('/app/filing/history')}
        className="mt-4 flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-700 transition-colors"
      >
        <History className="w-3.5 h-3.5" />
        View filing history
      </button>
    </div>
  );
}

// ─── main ─────────────────────────────────────────────────────────────────────

export default function FilingSubmit() {
  const { filingId } = useParams<{ filingId: string }>();
  const navigate = useNavigate();
  const { activeEntityId } = useEntity();

  // ── state ──────────────────────────────────────────────────────────────────
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [receiptPhase, setReceiptPhase] = useState<UploadPhase>('idle');
  const [receiptError, setReceiptError] = useState<string>('');
  const [tccPhase, setTccPhase] = useState<UploadPhase>('idle');
  const [tccError, setTccError] = useState<string>('');
  const [isDownloading, setIsDownloading] = useState(false);

  // ── queries/mutations ──────────────────────────────────────────────────────
  const filing = useQuery(
    (api as any).filing.get,
    filingId ? { filingId: filingId as Id<'filingRecords'> } : 'skip'
  ) as FilingRecord | null | undefined;

  const entities = useQuery(api.entityCrud.list);
  const activeEntity = entities?.find((e: any) =>
    filing ? e._id === filing.entityId : e._id === activeEntityId
  );

  const markSubmittedMutation = useMutation((api as any).filing.markSubmitted);
  const uploadReceiptMutation = useMutation((api as any).filing.uploadPaymentReceipt);
  const uploadTccMutation = useMutation((api as any).filing.uploadTcc);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);

  // ── helpers ────────────────────────────────────────────────────────────────

  const uploadFile = useCallback(
    async (
      file: File,
      setPhase: (p: UploadPhase) => void,
      setError: (e: string) => void,
      onSuccess: (storageId: string) => Promise<void>
    ) => {
      setPhase('uploading');
      setError('');
      try {
        const uploadUrl = await generateUploadUrl();
        const response = await fetch(uploadUrl, {
          method: 'POST',
          headers: { 'Content-Type': file.type },
          body: file,
        });
        const { storageId } = await response.json();
        await onSuccess(storageId);
        setPhase('done');
      } catch (err: any) {
        const message = err?.message ?? 'Upload failed. Please try again.';
        setError(message);
        setPhase('error');
        toast.error(message);
      }
    },
    [generateUploadUrl]
  );

  const handleMarkSubmitted = useCallback(async () => {
    if (!filingId) return;
    setIsSubmitting(true);
    try {
      const result = await markSubmittedMutation({ filingId: filingId as Id<'filingRecords'> });
      const { newStatus } = result as { filingId: string; newStatus: string };
      setShowSubmitConfirm(false);
      if (newStatus === 'payment_confirmed') {
        toast.success('Submitted! As a nil return, payment step is automatically confirmed.');
      } else {
        toast.success('Marked as submitted. Proceed to make your payment.');
      }
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to mark as submitted. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [filingId, markSubmittedMutation]);

  const handleUploadReceipt = useCallback(
    async (file: File) => {
      if (!filingId) return;
      await uploadFile(file, setReceiptPhase, setReceiptError, async (storageId) => {
        await uploadReceiptMutation({
          filingId: filingId as Id<'filingRecords'>,
          paymentReceiptId: storageId,
        });
        toast.success('Payment receipt uploaded! Payment confirmed.');
      });
    },
    [filingId, uploadFile, uploadReceiptMutation]
  );

  const handleUploadTcc = useCallback(
    async (file: File) => {
      if (!filingId) return;
      await uploadFile(file, setTccPhase, setTccError, async (storageId) => {
        await uploadTccMutation({
          filingId: filingId as Id<'filingRecords'>,
          tccDocumentId: storageId,
        });
        toast.success('TCC uploaded! Your filing is now complete. 🎉');
      });
    },
    [filingId, uploadFile, uploadTccMutation]
  );

  const handleDownloadPdf = useCallback(async () => {
    if (!filing?.selfAssessmentPdfId || !filing.pdfUrl) {
      toast.error('PDF not available. Please go back to the preview to download.');
      return;
    }
    setIsDownloading(true);
    try {
      const entityName = activeEntity?.name ?? 'Entity';
      const fileName = `TaxEase_SelfAssessment_${entityName.replace(/\s+/g, '_')}_${filing.taxYear}.pdf`;
      const response = await fetch(filing.pdfUrl);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      toast.error('Download failed. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  }, [filing, activeEntity]);

  // ── derived state ──────────────────────────────────────────────────────────

  const isLoading = filing === undefined;

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto animate-fade-in">
        <Skeleton className="h-4 w-32 mb-5" />
        <Skeleton className="h-8 w-64 mb-1" />
        <Skeleton className="h-4 w-80 mb-8" />
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex gap-4 mb-6">
            <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
            <div className="flex-1">
              <Skeleton className="h-5 w-48 mb-2" />
              <Skeleton className="h-3.5 w-64" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!filing) {
    return (
      <div className="max-w-2xl mx-auto animate-fade-in">
        <div className="bg-white rounded-xl border border-border shadow-soft p-10 flex flex-col items-center text-center">
          <FileText className="w-10 h-10 text-neutral-300 mb-3" />
          <p className="text-sm text-neutral-500">Filing record not found.</p>
          <button
            onClick={() => navigate('/app/filing')}
            className="mt-4 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Go to Filing
          </button>
        </div>
      </div>
    );
  }

  if (filing.status === 'draft') {
    return (
      <div className="max-w-2xl mx-auto animate-fade-in">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 flex flex-col items-center text-center">
          <AlertTriangle className="w-8 h-8 text-amber-500 mb-3" />
          <p className="text-sm font-semibold text-amber-800">Self-assessment not yet generated</p>
          <p className="text-xs text-amber-600 mt-1 mb-4">Please generate your self-assessment before proceeding to submission.</p>
          <button
            onClick={() => navigate('/app/filing/review')}
            className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Go to Review & Generate
          </button>
        </div>
      </div>
    );
  }

  const isNilReturn = filing.isNilReturn ?? false;
  const status = filing.status as FilingStatus;
  const activeStep = getActiveStep(status, isNilReturn);

  // Show celebration if complete
  if (status === 'tcc_obtained') {
    return (
      <div className="max-w-2xl mx-auto animate-fade-in">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate('/app/filing')}
            className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700 transition-colors mb-3"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to filing
          </button>
          <h1 className="text-heading-xl font-display text-neutral-900">Submission Guide</h1>
          <p className="text-body-sm text-neutral-500 mt-0.5">Tax Year {filing.taxYear}</p>
        </div>

        <div className="bg-white rounded-2xl border border-emerald-200 shadow-soft overflow-hidden">
          <CompletionCelebration
            filing={filing}
            onDownloadPdf={handleDownloadPdf}
            isDownloading={isDownloading}
          />
        </div>
      </div>
    );
  }

  const step0Complete = isStepComplete(0, status, isNilReturn);
  const step1Complete = isStepComplete(1, status, isNilReturn) || (isNilReturn && status !== 'generated');
  const step2Complete = isNilReturn || isStepComplete(2, status, isNilReturn);
  const step3Complete = isStepComplete(3, status, isNilReturn);

  return (
    <div className="max-w-2xl mx-auto animate-fade-in pb-8">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate(`/app/filing/preview/${filingId}`)}
          className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700 transition-colors mb-3"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to preview
        </button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-heading-xl font-display text-neutral-900">Submission Guide</h1>
            <p className="text-body-sm text-neutral-500 mt-0.5">
              Follow these steps to file Tax Year {filing.taxYear}
            </p>
          </div>
          {isNilReturn && (
            <span className="flex-shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 mt-1">
              NIL RETURN
            </span>
          )}
        </div>

        {/* Progress bar */}
        <div className="mt-4 flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${Math.round((activeStep / 5) * 100)}%` }}
            />
          </div>
          <span className="text-xs text-neutral-500 flex-shrink-0">Step {activeStep + 1} of 5</span>
        </div>
      </div>

      {/* Steps */}
      <div className="bg-white rounded-2xl border border-border shadow-soft p-5 sm:p-6">

        {/* Step 1: Submit via TaxPro Max */}
        <Step
          number={1}
          title="Submit via TaxPro Max"
          status={step0Complete ? 'complete' : activeStep === 0 ? 'active' : 'locked'}
          defaultOpen={activeStep === 0 || step0Complete}
        >
          <div className="space-y-3">
            <p className="text-sm text-neutral-600 leading-relaxed">
              Log in to the TaxPro Max portal and upload your self-assessment form. Use your TIN as your filing reference.
            </p>
            <ol className="space-y-1.5 list-decimal list-inside text-sm text-neutral-600 pl-1">
              <li>Log in at <span className="font-mono text-xs bg-muted/60 px-1.5 py-0.5 rounded">taxpromax.jtb.gov.ng</span></li>
              <li>Navigate to <strong>e-Filing</strong> → <strong>Self-Assessment</strong></li>
              <li>Upload your downloaded self-assessment PDF</li>
              <li>Submit and note your reference number</li>
            </ol>
            {isNilReturn && (
              <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200">
                <Info className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-emerald-700 leading-snug">
                  This is a <strong>nil return</strong>. No tax is payable. You still need to submit to FIRS — nil returns are required by law.
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <a
                href="https://taxpromax.jtb.gov.ng"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-50 border border-blue-200 text-sm font-medium text-blue-700 hover:bg-blue-100 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open TaxPro Max
              </a>

              {!step0Complete && (
                <button
                  onClick={() => setShowSubmitConfirm(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors shadow-soft"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Mark as Submitted
                </button>
              )}
            </div>
          </div>
        </Step>

        {/* Step 2: Make Payment */}
        <Step
          number={2}
          title="Make Payment"
          status={step1Complete ? 'complete' : activeStep === 1 ? 'active' : 'locked'}
          defaultOpen={activeStep === 1}
        >
          {isNilReturn ? (
            <div className="flex items-start gap-2.5 px-3 py-3 rounded-lg bg-emerald-50 border border-emerald-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-emerald-700">No payment required</p>
                <p className="text-xs text-emerald-600 mt-0.5">
                  Your taxable income is below the threshold — no tax is owed for this year.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-neutral-600 leading-relaxed">
                Pay <strong className="text-neutral-900 font-mono">{filing.netTaxPayable ? formatNaira(filing.netTaxPayable) : '—'}</strong> to FIRS using the account details below. Always include your TIN as the payment reference.
              </p>
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="px-4 py-2 bg-muted/20 border-b border-border">
                  <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">FIRS Payment Account</p>
                </div>
                <div className="px-4">
                  <CopyField label="Bank" value={FIRS_ACCOUNT.bank} />
                  <CopyField label="Account Name" value={FIRS_ACCOUNT.accountName} />
                  <CopyField label="Account Number" value={FIRS_ACCOUNT.accountNumber} />
                  <CopyField label="Sort Code" value={FIRS_ACCOUNT.sortCode} />
                  <CopyField label="Payment Reference" value={FIRS_ACCOUNT.reference} />
                </div>
              </div>
              <div className="flex items-start gap-2 text-xs text-neutral-400 px-1">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-amber-400" />
                Always verify account details with FIRS directly before making large payments.
              </div>
            </div>
          )}
        </Step>

        {/* Step 3: Upload Payment Receipt (hidden for nil returns) */}
        {!isNilReturn && (
          <Step
            number={3}
            title="Upload Payment Receipt"
            status={step2Complete ? 'complete' : activeStep === 2 ? 'active' : 'locked'}
            defaultOpen={activeStep === 2}
          >
            <div className="space-y-3">
              <p className="text-sm text-neutral-600 leading-relaxed">
                Upload proof of payment (bank receipt, transfer confirmation, or FIRS payment acknowledgement).
              </p>
              <FileUploadZone
                label="Click to upload receipt"
                onFileSelected={handleUploadReceipt}
                phase={step2Complete ? 'done' : receiptPhase}
                errorMessage={receiptError}
                disabled={step2Complete || receiptPhase === 'uploading' || receiptPhase === 'done'}
              />
              {receiptPhase === 'error' && (
                <button
                  onClick={() => setReceiptPhase('idle')}
                  className="text-xs text-primary font-medium hover:underline"
                >
                  Try again
                </button>
              )}
            </div>
          </Step>
        )}

        {/* Step 4: Obtain TCC */}
        <Step
          number={isNilReturn ? 3 : 4}
          title="Obtain Tax Clearance Certificate (TCC)"
          status={step3Complete ? 'complete' : activeStep === 3 ? 'active' : 'locked'}
          defaultOpen={activeStep === 3}
        >
          <div className="space-y-3">
            <p className="text-sm text-neutral-600 leading-relaxed">
              After payment confirmation, request your TCC from FIRS. This is your official proof of tax compliance and may be required for tenders, contracts, or travel.
            </p>
            <ol className="space-y-1.5 list-decimal list-inside text-sm text-neutral-600 pl-1">
              <li>Log back in to TaxPro Max</li>
              <li>Navigate to <strong>TCC</strong> → <strong>Request Certificate</strong></li>
              <li>Download and save your TCC</li>
            </ol>
            <FileUploadZone
              label="Click to upload TCC document"
              onFileSelected={handleUploadTcc}
              phase={step3Complete ? 'done' : tccPhase}
              errorMessage={tccError}
              disabled={step3Complete || tccPhase === 'uploading' || tccPhase === 'done' || activeStep < 3}
            />
            {tccPhase === 'error' && (
              <button
                onClick={() => setTccPhase('idle')}
                className="text-xs text-primary font-medium hover:underline"
              >
                Try again
              </button>
            )}
          </div>
        </Step>

        {/* Step 5: Store Records */}
        <Step
          number={isNilReturn ? 4 : 5}
          title="Store Records"
          status={activeStep >= 4 ? 'active' : 'locked'}
          isLast
          defaultOpen={activeStep >= 4}
        >
          <div className="space-y-3">
            <p className="text-sm text-neutral-600 leading-relaxed">
              Keep your tax records for at least <strong>6 years</strong> as required by the Federal Inland Revenue Service. Store the following documents safely:
            </p>
            <ul className="space-y-1.5 text-sm text-neutral-600 pl-1">
              {[
                'Self-assessment PDF (downloaded from TaxEase)',
                'TaxPro Max submission confirmation',
                'Payment receipt / bank transfer proof',
                'Tax Clearance Certificate (TCC)',
                'WHT certificates from clients',
                'All income and expense records',
              ].map((item, i) => (
                <li key={i} className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
            <div className="flex items-start gap-2.5 px-3 py-3 rounded-lg bg-muted/40 border border-border">
              <Info className="w-4 h-4 text-neutral-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-neutral-500 leading-snug">
                TaxEase stores your self-assessment snapshot and uploaded documents. You can also download your PDF anytime from this screen.
              </p>
            </div>
            {filing.selfAssessmentPdfId && (
              <button
                onClick={handleDownloadPdf}
                disabled={isDownloading}
                className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
              >
                {isDownloading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                Download self-assessment PDF
              </button>
            )}
          </div>
        </Step>
      </div>

      {/* Mark as Submitted confirmation dialog */}
      {showSubmitConfirm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm px-4 pb-4 sm:pb-0">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-slide-up">
            <div className="px-6 pt-6 pb-5">
              <h3 className="text-heading-md font-display text-neutral-900 mb-2">
                Confirm Submission
              </h3>
              <p className="text-body-sm text-neutral-600 leading-relaxed">
                {isNilReturn
                  ? 'Marking as submitted will record that you have filed your nil return with FIRS via TaxPro Max. Payment steps will be skipped.'
                  : 'Marking as submitted will record that you have filed your self-assessment with FIRS via TaxPro Max. You will then need to make payment and upload the receipt.'}
              </p>
              {filing.netTaxPayable !== undefined && !isNilReturn && (
                <div className="mt-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
                  <p className="text-xs text-amber-700">
                    Remember to pay <strong className="font-mono">{formatNaira(filing.netTaxPayable)}</strong> to FIRS.
                  </p>
                </div>
              )}
            </div>
            <div className="flex gap-3 px-6 pb-5">
              <button
                onClick={() => setShowSubmitConfirm(false)}
                disabled={isSubmitting}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium text-neutral-700 hover:bg-muted/40 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleMarkSubmitted}
                disabled={isSubmitting}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors shadow-soft disabled:opacity-60"
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Saving…
                  </span>
                ) : (
                  'Confirm Submitted'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
