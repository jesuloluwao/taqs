import { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useAction } from 'convex/react';
import { api } from '@convex/_generated/api';
import { useEntity } from '../contexts/EntityContext';
import { Skeleton } from '../components/Skeleton';
import { toast } from 'sonner';
import type { Id } from '@convex/_generated/dataModel';
import {
  ChevronLeft,
  Download,
  RefreshCw,
  FileText,
  User,
  TrendingUp,
  Layers,
  Receipt,
  PiggyBank,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Info,
} from 'lucide-react';

// ─── types ────────────────────────────────────────────────────────────────────

type FilingStatus =
  | 'draft'
  | 'generated'
  | 'submitted'
  | 'payment_pending'
  | 'payment_confirmed'
  | 'tcc_obtained';

interface PitBandResult {
  rate: number;
  taxableInBand?: number;
  taxInBand?: number;
  income?: number;
  taxPayable?: number;
}

interface TaxReliefs {
  personalRelief?: number;
  lifeAssuranceRelief?: number;
  nhfRelief?: number;
  nhisRelief?: number;
  pensionRelief?: number;
  rentRelief?: number;
  totalReliefs: number;
  [key: string]: number | undefined;
}

interface TaxSummarySnapshot {
  engineVersion?: string;
  totalGrossIncome: number;
  totalBusinessExpenses: number;
  assessableProfit: number;
  reliefs: TaxReliefs;
  taxableIncome: number;
  bands: PitBandResult[];
  grossTaxPayable: number;
  whtCredits: number;
  netTaxPayable: number;
  isNilReturn: boolean;
  effectiveTaxRate?: number;
  cgtPayable?: number;
  citPayable?: number;
  vatPayable?: number;
  uncategorisedCount?: number;
  snapshotAt?: number;
}

interface FilingRecord {
  _id: string;
  entityId: string;
  taxYear: number;
  status: FilingStatus;
  selfAssessmentPdfId?: string;
  taxSummarySnapshot?: string;
  netTaxPayable?: number;
  isNilReturn?: boolean;
  engineVersion?: string;
  generatedAt?: number;
  pdfUrl?: string;
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

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-NG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const CAN_REGENERATE: FilingStatus[] = ['draft', 'generated'];
const STATUS_LABELS: Record<FilingStatus, string> = {
  draft: 'Draft',
  generated: 'Generated',
  submitted: 'Submitted',
  payment_pending: 'Payment Pending',
  payment_confirmed: 'Payment Confirmed',
  tcc_obtained: 'TCC Obtained',
};
const STATUS_COLORS: Record<FilingStatus, string> = {
  draft: 'bg-neutral-100 text-neutral-600',
  generated: 'bg-blue-50 text-blue-700',
  submitted: 'bg-amber-50 text-amber-700',
  payment_pending: 'bg-orange-50 text-orange-700',
  payment_confirmed: 'bg-emerald-50 text-emerald-700',
  tcc_obtained: 'bg-emerald-100 text-emerald-800',
};

// ─── document section wrappers ────────────────────────────────────────────────

function DocSection({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-border rounded-xl shadow-soft overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-border bg-muted/20">
        <Icon className="w-4 h-4 text-primary flex-shrink-0" />
        <h3 className="text-[13px] font-semibold text-neutral-700 uppercase tracking-wider">{title}</h3>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

function DataRow({
  label,
  value,
  bold,
  negative,
  danger,
  success,
  indent,
  sublabel,
}: {
  label: string;
  value: string | React.ReactNode;
  bold?: boolean;
  negative?: boolean;
  danger?: boolean;
  success?: boolean;
  indent?: boolean;
  sublabel?: string;
}) {
  return (
    <div className={`flex items-start justify-between py-2.5 border-b border-border/40 last:border-0 ${indent ? 'pl-4' : ''}`}>
      <div className="min-w-0 flex-1">
        <span className={`text-sm leading-tight ${bold ? 'font-semibold text-neutral-900' : 'text-neutral-600'}`}>
          {label}
        </span>
        {sublabel && <div className="text-xs text-neutral-400 mt-0.5">{sublabel}</div>}
      </div>
      <span
        className={`font-mono text-sm tabular-nums flex-shrink-0 ml-4 ${
          bold ? 'font-semibold' : ''
        } ${
          danger ? 'text-red-600' : negative ? 'text-red-600' : success ? 'text-emerald-600' : 'text-neutral-800'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

// ─── band colors ───────────────────────────────────────────────────────────────

const BAND_COLORS = [
  'bg-neutral-100 text-neutral-600',
  'bg-emerald-50 text-emerald-700',
  'bg-amber-50 text-amber-700',
  'bg-orange-50 text-orange-700',
  'bg-red-50 text-red-600',
  'bg-red-100 text-red-700',
];

// ─── skeletons ────────────────────────────────────────────────────────────────

function PreviewSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="bg-white rounded-xl border border-border p-5">
        <Skeleton className="h-5 w-48 mb-4" />
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex justify-between py-2.5 border-b border-border/40 last:border-0">
            <Skeleton className="h-3.5 w-36" />
            <Skeleton className="h-3.5 w-28" />
          </div>
        ))}
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-white rounded-xl border border-border p-5">
          <Skeleton className="h-4 w-40 mb-4" />
          {[1, 2].map((r) => (
            <div key={r} className="flex justify-between py-2.5 border-b border-border/40 last:border-0">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3.5 w-24" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── main ─────────────────────────────────────────────────────────────────────

export default function FilingPreview() {
  const { filingId } = useParams<{ filingId: string }>();
  const navigate = useNavigate();
  const { activeEntityId } = useEntity();

  const [isDownloading, setIsDownloading] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  // Fetch filing record (with pdfUrl resolved)
  const filing = useQuery(
    (api as any).filing.get,
    filingId ? { filingId: filingId as Id<'filingRecords'> } : 'skip'
  ) as FilingRecord | null | undefined;

  // Fetch entity name
  const entities = useQuery(api.entityCrud.list);
  const activeEntity = entities?.find((e: any) =>
    filing ? e._id === filing.entityId : e._id === activeEntityId
  );

  // User profile for taxpayer details
  const me = useQuery(api.userCrud.getMe);

  const generateAction = useAction((api as any).filingActions.generateSelfAssessment);

  // Parse immutable snapshot
  const snapshot: TaxSummarySnapshot | null = (() => {
    if (!filing?.taxSummarySnapshot) return null;
    try {
      return JSON.parse(filing.taxSummarySnapshot) as TaxSummarySnapshot;
    } catch {
      return null;
    }
  })();

  const isLoading = filing === undefined;
  const canRegenerate =
    filing && CAN_REGENERATE.includes(filing.status as FilingStatus);
  const taxYear = filing?.taxYear;

  // ── PDF download ────────────────────────────────────────────────────────────

  const handleDownload = useCallback(async () => {
    if (!filing?.selfAssessmentPdfId) {
      toast.error('PDF not available. Please regenerate.');
      return;
    }
    setIsDownloading(true);
    try {
      // pdfUrl is resolved by the filing.get query via ctx.storage.getUrl
      const freshFiling = filing as any;
      const pdfUrl: string | undefined = freshFiling.pdfUrl;
      if (!pdfUrl) {
        toast.error('PDF URL not available. Please try again.');
        return;
      }
      const entityName = activeEntity?.name ?? 'Entity';
      const fileName = `TaxEase_SelfAssessment_${entityName.replace(/\s+/g, '_')}_${taxYear}.pdf`;

      const response = await fetch(pdfUrl);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      console.error('Download failed:', err);
      toast.error('Download failed. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  }, [filing, activeEntity, taxYear]);

  // ── Re-generation ────────────────────────────────────────────────────────────

  const handleRegenerate = useCallback(async () => {
    if (!activeEntityId || !taxYear) return;
    setIsRegenerating(true);
    try {
      const result = await generateAction({ entityId: activeEntityId, taxYear });
      const { filingId: newFilingId } = result as { filingId: string };
      toast.success('Self-assessment regenerated!');
      // Navigate to potentially updated filing (same ID)
      navigate(`/app/filing/preview/${newFilingId}`, { replace: true });
    } catch (err: any) {
      toast.error(err?.message ?? 'Regeneration failed. Please try again.');
    } finally {
      setIsRegenerating(false);
    }
  }, [activeEntityId, taxYear, generateAction, navigate]);

  // ─────────────────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto animate-fade-in">
        <div className="mb-5">
          <Skeleton className="h-4 w-32 mb-3" />
          <Skeleton className="h-8 w-64 mb-1" />
          <Skeleton className="h-4 w-80" />
        </div>
        <PreviewSkeleton />
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

  if (!snapshot) {
    return (
      <div className="max-w-2xl mx-auto animate-fade-in">
        <button
          onClick={() => navigate('/app/filing/review')}
          className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700 transition-colors mb-4"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to review
        </button>
        <div className="bg-white rounded-xl border border-border shadow-soft p-10 flex flex-col items-center text-center">
          <Info className="w-8 h-8 text-neutral-300 mb-3" />
          <p className="text-sm text-neutral-500">No snapshot available. Please generate your self-assessment first.</p>
          <button
            onClick={() => navigate('/app/filing/review')}
            className="mt-4 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Generate Self-Assessment
          </button>
        </div>
      </div>
    );
  }

  const entityName = activeEntity?.name ?? '—';
  const entityType = activeEntity?.type ?? '';
  const tin = activeEntity?.tin;

  return (
    <div className="max-w-2xl mx-auto animate-fade-in pb-32">
      {/* Regenerating overlay */}
      {isRegenerating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl p-8 flex flex-col items-center gap-4 max-w-xs w-full mx-4">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-sm font-semibold text-neutral-800 text-center">Regenerating your self-assessment…</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-5">
        <button
          onClick={() => navigate('/app/filing/review')}
          className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700 transition-colors mb-3"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to review
        </button>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-heading-xl font-display text-neutral-900">Self-Assessment Preview</h1>
            <p className="text-body-sm text-neutral-500 mt-0.5">
              Immutable tax record — Tax Year {taxYear}
            </p>
          </div>
          <span className={`flex-shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full mt-1 ${STATUS_COLORS[filing.status as FilingStatus]}`}>
            {STATUS_LABELS[filing.status as FilingStatus]}
          </span>
        </div>

        {snapshot.isNilReturn && (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 w-fit">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span className="text-sm font-semibold text-emerald-700">NIL RETURN — No tax payable</span>
          </div>
        )}
      </div>

      {/* Document watermark bar */}
      <div className="mb-4 flex items-center gap-2 px-4 py-2.5 bg-primary/5 border border-primary/20 rounded-xl">
        <FileText className="w-4 h-4 text-primary flex-shrink-0" />
        <span className="text-xs text-primary font-medium">
          FEDERAL INLAND REVENUE SERVICE — SELF-ASSESSMENT FORM (NTA 2025)
        </span>
        {filing.generatedAt && (
          <span className="ml-auto text-xs text-primary/60 flex-shrink-0">
            {formatDate(filing.generatedAt)}
          </span>
        )}
      </div>

      <div className="space-y-4">
        {/* Section 1: Taxpayer Details */}
        <DocSection icon={User} title="Section 1 — Taxpayer Details">
          <DataRow label="Full Name" value={me?.fullName ?? '—'} />
          <DataRow label="Email" value={me?.email ?? '—'} />
          <DataRow label="Entity / Trading Name" value={entityName} />
          <DataRow
            label="Entity Type"
            value={
              entityType === 'individual' ? 'Individual (Freelancer/Employee)'
              : entityType === 'business_name' ? 'Registered Business Name'
              : entityType === 'llc' ? 'Limited Liability Company'
              : entityType
            }
          />
          <DataRow label="Taxpayer TIN" value={tin ?? 'Not registered'} />
          <DataRow
            label="NIN"
            value={
              <span className="text-neutral-500 italic text-xs tracking-widest">
                {me?.nin ? '••••••••••••••• (Verified on file)' : 'Not provided'}
              </span>
            }
          />
          <DataRow label="Tax Year" value={String(taxYear)} />
          <DataRow
            label="Engine Version"
            value={snapshot.engineVersion ?? filing.engineVersion ?? '—'}
          />
        </DocSection>

        {/* Section 2: Income Schedule */}
        <DocSection icon={TrendingUp} title="Section 2 — Income Schedule">
          <DataRow label="Total Gross Income" value={formatNaira(snapshot.totalGrossIncome)} bold />
          <DataRow
            label="Less: Allowable Business Expenses"
            value={snapshot.totalBusinessExpenses > 0 ? `(${formatNaira(snapshot.totalBusinessExpenses)})` : formatNaira(0)}
            indent
            negative={snapshot.totalBusinessExpenses > 0}
          />
          <DataRow
            label="Assessable Profit"
            value={formatNaira(snapshot.assessableProfit)}
            bold
          />
        </DocSection>

        {/* Section 3: Deductions & Reliefs */}
        <DocSection icon={Layers} title="Section 3 — Deductions & Reliefs">
          {(snapshot.reliefs.pensionRelief ?? 0) > 0 && (
            <DataRow
              label="Pension Contributions"
              value={`(${formatNaira(snapshot.reliefs.pensionRelief!)})`}
              indent
              negative
            />
          )}
          {(snapshot.reliefs.nhfRelief ?? 0) > 0 && (
            <DataRow
              label="National Housing Fund (NHF)"
              value={`(${formatNaira(snapshot.reliefs.nhfRelief!)})`}
              indent
              negative
            />
          )}
          {(snapshot.reliefs.nhisRelief ?? 0) > 0 && (
            <DataRow
              label="National Health Insurance Scheme (NHIS)"
              value={`(${formatNaira(snapshot.reliefs.nhisRelief!)})`}
              indent
              negative
            />
          )}
          {(snapshot.reliefs.lifeAssuranceRelief ?? 0) > 0 && (
            <DataRow
              label="Life Assurance Premium"
              value={`(${formatNaira(snapshot.reliefs.lifeAssuranceRelief!)})`}
              indent
              negative
            />
          )}
          {(snapshot.reliefs.rentRelief ?? 0) > 0 && (
            <DataRow
              label="Rent Relief (20% of rent, max ₦500,000)"
              value={`(${formatNaira(snapshot.reliefs.rentRelief!)})`}
              indent
              negative
              sublabel="As per NTA 2025 §7(1)(a)"
            />
          )}
          {(snapshot.reliefs.personalRelief ?? 0) > 0 && (
            <DataRow
              label="Consolidated Relief Allowance"
              value={`(${formatNaira(snapshot.reliefs.personalRelief!)})`}
              indent
              negative
            />
          )}
          <DataRow
            label="Total Reliefs"
            value={`(${formatNaira(snapshot.reliefs.totalReliefs)})`}
            bold
            negative
          />
          <DataRow
            label="Taxable Income"
            value={formatNaira(snapshot.taxableIncome)}
            bold
          />
        </DocSection>

        {/* Section 4: Tax Computation */}
        <DocSection icon={Receipt} title="Section 4 — Tax Computation (NTA 2025 PIT Bands)">
          {snapshot.bands.filter((b) => (b.taxableInBand ?? b.income ?? 0) > 0).length === 0 ? (
            <div className="py-3 text-sm text-neutral-500 italic">No taxable income — nil return.</div>
          ) : (
            snapshot.bands.map((band, i) => {
              const taxable = band.taxableInBand ?? band.income ?? 0;
              const taxInBand = band.taxInBand ?? band.taxPayable ?? 0;
              if (taxable <= 0) return null;
              const rateNorm = band.rate < 1 ? band.rate * 100 : band.rate;
              return (
                <div key={i} className="flex items-center justify-between py-2.5 border-b border-border/40 last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${BAND_COLORS[Math.min(i, BAND_COLORS.length - 1)]}`}>
                      {rateNorm}%
                    </span>
                    <span className="text-sm text-neutral-600">{formatNaira(taxable)} taxable</span>
                  </div>
                  <span className="font-mono text-sm text-neutral-900 flex-shrink-0 ml-3">
                    {formatNaira(taxInBand)}
                  </span>
                </div>
              );
            })
          )}
          <DataRow label="Gross Tax Payable" value={formatNaira(snapshot.grossTaxPayable)} bold />
          {(snapshot.cgtPayable ?? 0) > 0 && (
            <DataRow label="Capital Gains Tax (CGT)" value={formatNaira(snapshot.cgtPayable!)} indent />
          )}
          {(snapshot.citPayable ?? 0) > 0 && (
            <DataRow label="Company Income Tax (CIT)" value={formatNaira(snapshot.citPayable!)} indent />
          )}
          {(snapshot.vatPayable ?? 0) > 0 && (
            <DataRow label="Value Added Tax (VAT)" value={formatNaira(snapshot.vatPayable!)} indent />
          )}
        </DocSection>

        {/* Section 5: WHT Credits & Net Payable */}
        <DocSection icon={PiggyBank} title="Section 5 — WHT Credits & Net Amount Payable">
          {snapshot.whtCredits > 0 && (
            <DataRow
              label="Less: Withholding Tax Credits"
              value={`(${formatNaira(snapshot.whtCredits)})`}
              indent
              negative
              sublabel="Deducted at source — attach WHT certificates"
            />
          )}
          <DataRow
            label="Net Tax Payable"
            value={
              snapshot.isNilReturn ? (
                <span className="text-emerald-600 font-bold">{formatNaira(0)} — NIL</span>
              ) : formatNaira(snapshot.netTaxPayable)
            }
            bold
            danger={!snapshot.isNilReturn && snapshot.netTaxPayable > 0}
            success={snapshot.isNilReturn || snapshot.netTaxPayable === 0}
          />
          {!snapshot.isNilReturn && (snapshot.effectiveTaxRate ?? 0) > 0 && (
            <div className="mt-2 px-3 py-2 bg-muted/40 rounded-lg flex items-center justify-between text-xs text-neutral-500">
              <span>Effective Tax Rate</span>
              <span className="font-mono font-medium text-neutral-700">
                {formatPercent(snapshot.effectiveTaxRate!)}
              </span>
            </div>
          )}
        </DocSection>

        {/* Snapshot notice */}
        {snapshot.snapshotAt && (
          <div className="flex items-start gap-2.5 px-4 py-3.5 bg-neutral-50 border border-border rounded-xl">
            <AlertTriangle className="w-4 h-4 text-neutral-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-neutral-500 leading-snug">
              This is an <strong className="text-neutral-700">immutable snapshot</strong> captured at{' '}
              {formatDate(snapshot.snapshotAt)}. Any subsequent changes to your transactions or
              declarations are not reflected here.{' '}
              {canRegenerate && (
                <button
                  onClick={handleRegenerate}
                  disabled={isRegenerating}
                  className="text-primary font-medium underline underline-offset-2 hover:no-underline"
                >
                  Regenerate to update.
                </button>
              )}
            </p>
          </div>
        )}
      </div>

      {/* Sticky footer actions */}
      <div className="fixed bottom-0 left-0 right-0 md:left-64 bg-white/95 backdrop-blur border-t border-border px-4 py-4 z-20">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          {canRegenerate && (
            <button
              onClick={handleRegenerate}
              disabled={isRegenerating}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border text-sm font-medium text-neutral-700 hover:bg-muted/40 transition-colors disabled:opacity-50"
            >
              {isRegenerating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Re-generate
            </button>
          )}

          <button
            onClick={handleDownload}
            disabled={isDownloading || !filing.selfAssessmentPdfId}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors shadow-soft active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isDownloading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Downloading…
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Download PDF
              </>
            )}
          </button>

          {filing.status === 'generated' && (
            <button
              onClick={() => navigate('/app/filing/submit')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors shadow-soft"
            >
              Proceed to Submit →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
