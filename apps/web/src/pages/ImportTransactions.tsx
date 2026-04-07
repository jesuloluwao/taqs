import { useState, useRef, useCallback, useEffect } from 'react';
import { useMutation, useAction, useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useEntity } from '../contexts/EntityContext';
import { BankAccountSelector } from '../components/BankAccountSelector';
import {
  Upload,
  FileText,
  Link2,
  Plus,
  UploadCloud,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  RefreshCcw,
  ArrowRight,
  AlertCircle,
  Info,
  Loader2,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────
type MethodTab = 'upload' | 'bank' | 'fintech' | 'manual';

type UploadState =
  | { phase: 'idle' }
  | { phase: 'uploading'; progress: number }
  | { phase: 'processing'; jobId: Id<'importJobs'> }
  | { phase: 'complete'; jobId: Id<'importJobs'>; totalImported: number; duplicatesSkipped: number }
  | { phase: 'error'; message: string };

// ── Sub-components ─────────────────────────────────────────────────────────

function MethodTabBar({
  active,
  onChange,
}: {
  active: MethodTab;
  onChange: (t: MethodTab) => void;
}) {
  const tabs: { id: MethodTab; label: string; icon: React.ReactNode }[] = [
    { id: 'upload', label: 'Upload Statement', icon: <Upload className="w-4 h-4" /> },
    { id: 'bank', label: 'Connect Bank', icon: <Link2 className="w-4 h-4" /> },
    { id: 'fintech', label: 'Connect Fintech', icon: <Link2 className="w-4 h-4" /> },
    { id: 'manual', label: 'Manual Entry', icon: <Plus className="w-4 h-4" /> },
  ];

  return (
    <div className="flex gap-1 p-1 bg-muted rounded-xl mb-6 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-body-sm font-medium transition-all duration-150 whitespace-nowrap flex-shrink-0 ${
            active === tab.id
              ? 'bg-white text-neutral-900 shadow-soft'
              : 'text-neutral-500 hover:text-neutral-700 hover:bg-white/50'
          }`}
        >
          {tab.icon}
          <span className="hidden sm:inline">{tab.label}</span>
        </button>
      ))}
    </div>
  );
}

// ── Idle / Drop zone ────────────────────────────────────────────────────────
function DropZone({ onFile }: { onFile: (f: File) => void }) {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) onFile(file);
    },
    [onFile]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onFile(file);
    },
    [onFile]
  );

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`relative cursor-pointer rounded-2xl border-2 border-dashed transition-all duration-200 p-10 flex flex-col items-center gap-4 group ${
        isDragOver
          ? 'border-primary bg-primary-light scale-[1.01]'
          : 'border-border hover:border-primary/50 hover:bg-muted/40 bg-white'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.csv,application/pdf,text/csv"
        className="hidden"
        onChange={handleChange}
      />

      <div
        className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-colors duration-150 ${
          isDragOver ? 'bg-primary text-white' : 'bg-primary-light text-primary group-hover:bg-primary group-hover:text-white'
        }`}
      >
        <UploadCloud className="w-8 h-8" strokeWidth={1.5} />
      </div>

      <div className="text-center">
        <p className="text-heading-sm text-neutral-900 font-semibold">
          {isDragOver ? 'Drop it here' : 'Drag & drop your bank statement'}
        </p>
        <p className="text-body-sm text-neutral-500 mt-1">
          or <span className="text-primary font-medium">browse files</span> — PDF or CSV
        </p>
      </div>

      <div className="flex items-center gap-3 text-body-sm text-neutral-400">
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-neutral-100 font-medium">
          <FileText className="w-3 h-3" />
          PDF
        </span>
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-neutral-100 font-medium">
          <FileText className="w-3 h-3" />
          CSV
        </span>
      </div>

      <p className="text-[11px] text-neutral-400 text-center max-w-xs">
        Supports GTBank, Zenith Bank, Access Bank, and most Nigerian bank statement formats
      </p>
    </div>
  );
}

// ── Upload progress bar ─────────────────────────────────────────────────────
function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="w-full h-2 bg-neutral-100 rounded-full overflow-hidden">
      <div
        className="h-full bg-primary rounded-full transition-all duration-300"
        style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
      />
    </div>
  );
}

// ── Indeterminate spinner bar for processing phase ──────────────────────────
function ProcessingBar() {
  return (
    <div className="w-full h-2 bg-neutral-100 rounded-full overflow-hidden">
      <div className="h-full bg-primary rounded-full animate-pulse" style={{ width: '60%' }} />
    </div>
  );
}

// ── Live status polling via Convex reactivity ───────────────────────────────
function ImportJobWatcher({
  jobId,
  onComplete,
  onFailed,
}: {
  jobId: Id<'importJobs'>;
  onComplete: (totalImported: number, duplicatesSkipped: number) => void;
  onFailed: (message: string) => void;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const job = useQuery((api as any).importJobs.get, { id: jobId }) as
    | {
        status: string;
        totalImported?: number;
        duplicatesSkipped?: number;
        errorMessage?: string;
      }
    | null
    | undefined;

  const notifiedRef = useRef(false);

  useEffect(() => {
    if (notifiedRef.current) return;
    if (!job) return;

    if (job.status === 'complete') {
      notifiedRef.current = true;
      onComplete(job.totalImported ?? 0, job.duplicatesSkipped ?? 0);
    } else if (job.status === 'failed') {
      notifiedRef.current = true;
      onFailed(job.errorMessage ?? 'Import failed. Please check the file format.');
    }
  }, [job, onComplete, onFailed]);

  return null;
}

// ── Main upload tab ─────────────────────────────────────────────────────────
function UploadTab() {
  const { activeEntityId } = useEntity();
  const navigate = useNavigate();

  const [uploadState, setUploadState] = useState<UploadState>({ phase: 'idle' });
  const [selectedBankAccountId, setSelectedBankAccountId] = useState<Id<'bankAccounts'> | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const initiateImport = useMutation((api as any).transactions.initiateImport);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const processImport = useAction((api as any).importPipeline.processImport);

  const startUpload = useCallback(
    async (file: File, bankAccountId: Id<'bankAccounts'>) => {
      if (!activeEntityId) {
        toast.error('No entity selected. Please select a tax entity first.');
        return;
      }

      // Validate file type
      const isPdf =
        file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      const isCsv =
        file.type === 'text/csv' ||
        file.type === 'application/csv' ||
        file.name.toLowerCase().endsWith('.csv');

      if (!isPdf && !isCsv) {
        toast.error('Unsupported file type. Please upload a PDF or CSV file.');
        return;
      }

      try {
        // Step 1: Generate upload URL
        setUploadState({ phase: 'uploading', progress: 10 });
        const uploadUrl = await generateUploadUrl();

        // Step 2: Upload file to Convex Storage
        setUploadState({ phase: 'uploading', progress: 30 });
        const uploadResponse = await fetch(uploadUrl, {
          method: 'POST',
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
          body: file,
        });

        if (!uploadResponse.ok) {
          throw new Error(`Upload failed: ${uploadResponse.statusText}`);
        }

        setUploadState({ phase: 'uploading', progress: 70 });
        const { storageId } = await uploadResponse.json();

        // Step 3: Create import job
        setUploadState({ phase: 'uploading', progress: 90 });
        const source = isPdf ? 'pdf' : 'csv';
        const jobId = await initiateImport({
          entityId: activeEntityId,
          source,
          storageId,
          bankAccountId,
        }) as Id<'importJobs'>;

        // Step 4: Trigger processing
        setUploadState({ phase: 'uploading', progress: 100 });
        // Fire-and-forget; job watcher handles completion
        processImport({ jobId }).catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : 'Processing failed';
          setUploadState({
            phase: 'error',
            message: `Import failed. Please check the file format. (${msg})`,
          });
        });

        // Transition to processing (job watcher will move to complete/error)
        setUploadState({ phase: 'processing', jobId });
        setPendingFile(null);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Import failed. Please try again.';
        setUploadState({ phase: 'error', message });
      }
    },
    [activeEntityId, generateUploadUrl, initiateImport, processImport]
  );

  const handleFile = useCallback(
    (file: File) => {
      if (selectedBankAccountId) {
        // Account already selected — upload immediately
        startUpload(file, selectedBankAccountId);
      } else {
        // No account yet — stash file and prompt for account selection
        setPendingFile(file);
      }
    },
    [selectedBankAccountId, startUpload]
  );

  const handleBankAccountChange = useCallback(
    (bankAccountId: Id<'bankAccounts'>) => {
      setSelectedBankAccountId(bankAccountId);
      if (pendingFile) {
        // File was dropped first — now we have both, start upload
        startUpload(pendingFile, bankAccountId);
      }
    },
    [pendingFile, startUpload]
  );

  const handleComplete = useCallback((totalImported: number, duplicatesSkipped: number) => {
    setUploadState((prev) => {
      if (prev.phase === 'processing') {
        return { phase: 'complete', jobId: prev.jobId, totalImported, duplicatesSkipped };
      }
      return prev;
    });
  }, []);

  const handleFailed = useCallback((message: string) => {
    setUploadState({ phase: 'error', message });
  }, []);

  const reset = useCallback(() => {
    setUploadState({ phase: 'idle' });
    setSelectedBankAccountId(null);
    setPendingFile(null);
  }, []);

  // ── Render by phase ────────────────────────────────────────────────────────

  if (uploadState.phase === 'idle') {
    return (
      <div className="space-y-4">
        {/* Bank account selector — shown above drop zone (or as prompt after file drop) */}
        {activeEntityId && (
          <div className="space-y-1.5">
            {pendingFile && !selectedBankAccountId && (
              <p className="text-body-sm font-medium text-neutral-700">
                Which bank account is this statement from?
              </p>
            )}
            <BankAccountSelector
              entityId={activeEntityId}
              value={selectedBankAccountId}
              onChange={handleBankAccountChange}
              placeholder="Select bank account"
            />
          </div>
        )}

        {/* Show file name if file is pending account selection */}
        {pendingFile && !selectedBankAccountId && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <FileText className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <p className="text-body-sm text-amber-700">
              <span className="font-medium">{pendingFile.name}</span> ready — select a bank account to start import
            </p>
          </div>
        )}

        <DropZone onFile={handleFile} />
        <DuplicateExplainer />
      </div>
    );
  }

  if (uploadState.phase === 'uploading') {
    return (
      <div className="bg-white rounded-2xl border border-border shadow-soft p-8 flex flex-col items-center gap-5 text-center animate-fade-in">
        <div className="w-14 h-14 rounded-2xl bg-primary-light flex items-center justify-center">
          <Loader2 className="w-7 h-7 text-primary animate-spin" />
        </div>
        <div>
          <p className="text-heading-sm text-neutral-900 font-semibold">Uploading file…</p>
          <p className="text-body-sm text-neutral-500 mt-1">
            Sending your statement to TaxEase
          </p>
        </div>
        <div className="w-full max-w-xs">
          <ProgressBar progress={uploadState.progress} />
          <p className="text-body-sm text-neutral-400 mt-2">{uploadState.progress}%</p>
        </div>
      </div>
    );
  }

  if (uploadState.phase === 'processing') {
    return (
      <>
        <ImportJobWatcher
          jobId={uploadState.jobId}
          onComplete={handleComplete}
          onFailed={handleFailed}
        />
        <div className="bg-white rounded-2xl border border-border shadow-soft p-8 flex flex-col items-center gap-5 text-center animate-fade-in">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center">
            <Loader2 className="w-7 h-7 text-amber-500 animate-spin" />
          </div>
          <div>
            <p className="text-heading-sm text-neutral-900 font-semibold">
              Processing your statement…
            </p>
            <p className="text-body-sm text-neutral-500 mt-1">
              Parsing transactions and checking for duplicates
            </p>
          </div>
          <div className="w-full max-w-xs">
            <ProcessingBar />
          </div>
          <p className="text-[11px] text-neutral-400">This usually takes a few seconds</p>
        </div>
      </>
    );
  }

  if (uploadState.phase === 'complete') {
    const { totalImported, duplicatesSkipped, jobId } = uploadState;
    return (
      <div className="bg-white rounded-2xl border border-border shadow-soft p-8 flex flex-col items-center gap-6 text-center animate-slide-up">
        <div className="w-16 h-16 rounded-2xl bg-success/10 flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8 text-success" />
        </div>

        <div>
          <p className="text-heading-sm text-neutral-900 font-semibold">Import complete!</p>
          <p className="text-body-sm text-neutral-500 mt-1">
            Your statement has been processed successfully.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 w-full max-w-xs">
          <div className="rounded-xl border border-border p-3">
            <p className="text-heading-lg font-display text-success font-bold">{totalImported}</p>
            <p className="text-body-sm text-neutral-500 mt-0.5">
              {totalImported === 1 ? 'transaction' : 'transactions'} imported
            </p>
          </div>
          <div className="rounded-xl border border-border p-3">
            <p className="text-heading-lg font-display text-neutral-400 font-bold">
              {duplicatesSkipped}
            </p>
            <p className="text-body-sm text-neutral-500 mt-0.5">
              {duplicatesSkipped === 1 ? 'duplicate' : 'duplicates'} skipped
            </p>
          </div>
        </div>

        {duplicatesSkipped > 0 && (
          <div className="flex items-start gap-2 text-left bg-neutral-50 rounded-xl px-4 py-3 w-full max-w-xs">
            <Info className="w-4 h-4 text-neutral-400 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-neutral-500">
              Duplicates are transactions that match existing records by date, amount, and
              description.
            </p>
          </div>
        )}

        {/* CTA buttons */}
        <div className="flex flex-col gap-2 w-full max-w-xs">
          <button
            onClick={() =>
              navigate(`/app/transactions?importJobId=${jobId}`)
            }
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-body-sm font-medium hover:bg-primary/90 transition-colors shadow-soft"
          >
            View imported transactions
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => navigate('/app/transactions')}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-border text-body-sm text-neutral-700 font-medium hover:bg-muted hover:text-neutral-900 transition-colors"
          >
            Go to Transactions
          </button>
          <button
            onClick={reset}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-body-sm text-neutral-500 hover:text-primary transition-colors"
          >
            <Upload className="w-4 h-4" />
            Import another file
          </button>
        </div>
      </div>
    );
  }

  if (uploadState.phase === 'error') {
    return (
      <div className="bg-white rounded-2xl border border-danger/30 shadow-soft p-8 flex flex-col items-center gap-6 text-center animate-slide-up">
        <div className="w-16 h-16 rounded-2xl bg-danger/10 flex items-center justify-center">
          <XCircle className="w-8 h-8 text-danger" />
        </div>

        <div>
          <p className="text-heading-sm text-neutral-900 font-semibold">Import failed</p>
          <p className="text-body-sm text-neutral-500 mt-1">
            Please check the file format and try again.
          </p>
        </div>

        <div className="flex items-start gap-2 text-left bg-danger/5 rounded-xl px-4 py-3 w-full max-w-xs">
          <AlertCircle className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-danger/80">{uploadState.message}</p>
        </div>

        <button
          onClick={reset}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-body-sm font-medium hover:bg-primary/90 transition-colors shadow-soft"
        >
          <RefreshCcw className="w-4 h-4" />
          Try again
        </button>
      </div>
    );
  }

  return null;
}

// ── Duplicate explainer ─────────────────────────────────────────────────────
function DuplicateExplainer() {
  return (
    <div className="flex items-start gap-2.5 bg-blue-50/60 border border-blue-100 rounded-xl px-4 py-3">
      <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
      <p className="text-body-sm text-blue-700">
        <span className="font-medium">About duplicates:</span> TaxEase automatically skips
        transactions that match existing records by date, amount, and description — so it's safe to
        re-upload a statement.
      </p>
    </div>
  );
}

// ── Placeholder tabs ────────────────────────────────────────────────────────
function PlaceholderTab({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-4 animate-fade-in">
      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center text-neutral-400">
        {icon}
      </div>
      <div>
        <p className="text-heading-sm text-neutral-900 font-semibold">{title}</p>
        <p className="text-body-sm text-neutral-500 mt-1 max-w-xs">{description}</p>
      </div>
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-body-sm font-medium">
        Coming soon
      </span>
    </div>
  );
}

// ── Manual entry redirect tab ───────────────────────────────────────────────
function ManualEntryTab() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center gap-5 animate-fade-in">
      <div className="w-16 h-16 rounded-2xl bg-primary-light flex items-center justify-center">
        <Plus className="w-8 h-8 text-primary" strokeWidth={1.5} />
      </div>
      <div>
        <p className="text-heading-sm text-neutral-900 font-semibold">Manual Entry</p>
        <p className="text-body-sm text-neutral-500 mt-1 max-w-xs">
          Add individual transactions one at a time directly from the Transactions screen.
        </p>
      </div>
      <button
        onClick={() => navigate('/app/transactions')}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-body-sm font-medium hover:bg-primary/90 transition-colors shadow-soft"
      >
        <ArrowRight className="w-4 h-4" />
        Go to Transactions
      </button>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function ImportTransactions() {
  const navigate = useNavigate();
  const { activeEntityId } = useEntity();
  const [activeTab, setActiveTab] = useState<MethodTab>('upload');

  if (!activeEntityId) {
    return (
      <div className="max-w-2xl mx-auto animate-fade-in">
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-heading-md text-neutral-900 mb-1">No entity selected</p>
          <p className="text-body-sm text-neutral-500">
            Please select a tax entity from the sidebar.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/app/transactions')}
          className="p-2 rounded-lg hover:bg-muted text-neutral-500 hover:text-neutral-900 transition-colors"
          aria-label="Back to Transactions"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-heading-xl font-display text-neutral-900">Import Transactions</h1>
          <p className="text-body-sm text-neutral-500 mt-0.5">
            Upload a bank statement or connect your account
          </p>
        </div>
      </div>

      {/* Card */}
      <div className="bg-white rounded-2xl border border-border shadow-soft p-6">
        <MethodTabBar active={activeTab} onChange={setActiveTab} />

        {activeTab === 'upload' && <UploadTab />}

        {activeTab === 'bank' && (
          <PlaceholderTab
            icon={<Link2 className="w-8 h-8" strokeWidth={1.5} />}
            title="Connect Bank Account"
            description="Automatically sync transactions from your bank. Direct bank connections will be available in a future update."
          />
        )}

        {activeTab === 'fintech' && (
          <PlaceholderTab
            icon={<Link2 className="w-8 h-8" strokeWidth={1.5} />}
            title="Connect Fintech Account"
            description="Sync transactions from Paystack, Flutterwave, Piggyvest, and more. Coming in a future update."
          />
        )}

        {activeTab === 'manual' && <ManualEntryTab />}
      </div>
    </div>
  );
}
