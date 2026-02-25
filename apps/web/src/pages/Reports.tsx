/**
 * TaxEase Nigeria — Reports Screen (US-048 / US-049)
 *
 * Three tabs: Income | Expenses | Year-on-Year
 * Date range: This Year | Last Year | Custom
 * Charts: SVG bar (income), SVG doughnut (expenses), SVG dual-line (YoY)
 * Export: CSV + PDF via FAB (mobile) / header button (web)
 */

import { useState, useMemo, useRef } from 'react';
import { useQuery, useAction } from 'convex/react';
import { Link } from 'react-router-dom';
import { api } from '@convex/_generated/api';
import { useEntity } from '../contexts/EntityContext';
import { Skeleton } from '../components/Skeleton';
import { toast } from 'sonner';
import {
  TrendingUp,
  TrendingDown,
  Upload,
  BarChart2,
  Download,
  FileText,
  Table2,
  X,
  Info,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type DateRangeMode = 'this_year' | 'last_year' | 'custom';
type ActiveTab = 'income' | 'expenses' | 'year_on_year';
type ExportFormat = 'csv' | 'pdf';

interface MonthlyData {
  month: number;
  amount: number;
}

interface IncomeCategory {
  categoryId: string | null;
  categoryName: string;
  color?: string;
  amount: number;
  percentage: number;
}

interface ExpenseCategory {
  categoryId: string | null;
  categoryName: string;
  color?: string;
  amount: number;
  isDeductible: boolean;
  percentage: number;
}

interface IncomeReport {
  totalIncome: number;
  foreignIncome: number;
  averageMonthlyIncome: number;
  monthlyBreakdown: MonthlyData[];
  categoryBreakdown: IncomeCategory[];
}

interface ExpensesReport {
  totalExpenses: number;
  deductibleExpenses: number;
  nonDeductibleExpenses: number;
  monthlyBreakdown: MonthlyData[];
  categoryBreakdown: ExpenseCategory[];
}

interface YearOnYearReport {
  currentYear: number;
  priorYear: number;
  currentIncome: number;
  priorIncome: number;
  incomeChange: number | null;
  currentExpenses: number;
  priorExpenses: number;
  expensesChange: number | null;
  currentTaxPayable: number;
  priorTaxPayable: number;
  taxPayableChange: number | null;
  currentEffectiveTaxRate: number;
  priorEffectiveTaxRate: number;
  effectiveTaxRateChange: number | null;
  hasPriorData: boolean;
  currentMonthlyIncome: MonthlyData[];
  priorMonthlyIncome: MonthlyData[];
  currentMonthlyExpenses: MonthlyData[];
  priorMonthlyExpenses: MonthlyData[];
}

interface DonutSegment {
  label: string;
  amount: number;
  percentage: number;
  color: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants & Helpers
// ─────────────────────────────────────────────────────────────────────────────

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const PALETTE = [
  '#1A7F5E', '#2B6CB0', '#D69E2E', '#DD6B20', '#805AD5',
  '#E53E3E', '#38A169', '#3182CE', '#B7791F', '#C05621',
  '#6B46C1', '#00B5D8',
];

function formatNaira(kobo: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(kobo / 100);
}

function catColor(index: number, color?: string): string {
  return color ?? PALETTE[index % PALETTE.length];
}

// ─────────────────────────────────────────────────────────────────────────────
// Bar Chart (Income)
// ─────────────────────────────────────────────────────────────────────────────

const BC_W = 360;
const BC_H = 200;
const BAR_W = 20;
const BAR_GAP = 10;
const GROUP_W = BAR_W + BAR_GAP;
const Y_TOP = 10;
const Y_BOT = 170;
const Y_INNER = Y_BOT - Y_TOP;
const LABEL_Y = 188;
const TIP_W = 84;

function BarChart({
  data,
  onSelect,
  selected,
}: {
  data: MonthlyData[];
  onSelect: (m: number | null) => void;
  selected: number | null;
}) {
  const maxAmt = Math.max(...data.map((d) => d.amount), 1);

  return (
    <svg
      viewBox={`0 0 ${BC_W} ${BC_H}`}
      className="w-full"
      style={{ minWidth: 280 }}
      aria-label="Monthly income bar chart"
    >
      {/* Grid lines */}
      {[0.25, 0.5, 0.75, 1].map((frac) => {
        const gy = Y_BOT - frac * Y_INNER;
        return (
          <line
            key={frac}
            x1={5}
            y1={gy}
            x2={BC_W - 5}
            y2={gy}
            stroke="#E2E8F0"
            strokeWidth={0.5}
            strokeDasharray="2 2"
          />
        );
      })}

      {data.map((d, i) => {
        const x = 5 + i * GROUP_W;
        const barH =
          d.amount > 0
            ? Math.max(4, (d.amount / maxAmt) * Y_INNER)
            : 2;
        const barY = d.amount > 0 ? Y_BOT - barH : Y_BOT - 2;
        const isSel = selected === d.month;
        const tipX = Math.max(0, Math.min(x - (TIP_W / 2 - BAR_W / 2), BC_W - TIP_W - 4));

        return (
          <g
            key={d.month}
            onClick={() => onSelect(isSel ? null : d.month)}
            style={{ cursor: 'pointer' }}
          >
            <rect x={x} y={Y_TOP} width={BAR_W} height={Y_INNER + 20} fill="transparent" />
            <rect
              x={x}
              y={barY}
              width={BAR_W}
              height={barH}
              rx={3}
              fill={isSel ? '#147050' : '#1A7F5E'}
              opacity={d.amount === 0 ? 0.2 : 1}
            />
            <text
              x={x + BAR_W / 2}
              y={LABEL_Y}
              textAnchor="middle"
              fontSize={8}
              fill="#718096"
              fontFamily="DM Sans, sans-serif"
            >
              {MONTHS_SHORT[i]}
            </text>
            {isSel && d.amount > 0 && (
              <g>
                <rect
                  x={tipX}
                  y={barY - 32}
                  width={TIP_W}
                  height={26}
                  rx={4}
                  fill="#1A202C"
                  opacity={0.9}
                />
                <text
                  x={tipX + TIP_W / 2}
                  y={barY - 32 + 10}
                  textAnchor="middle"
                  fontSize={7.5}
                  fill="#A0AEC0"
                  fontFamily="DM Sans, sans-serif"
                >
                  {MONTHS_SHORT[i]}
                </text>
                <text
                  x={tipX + TIP_W / 2}
                  y={barY - 32 + 22}
                  textAnchor="middle"
                  fontSize={9}
                  fill="white"
                  fontWeight="600"
                  fontFamily="DM Sans, sans-serif"
                >
                  {formatNaira(d.amount)}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Doughnut Chart (Expenses)
// ─────────────────────────────────────────────────────────────────────────────

const DC_SIZE = 200;
const DC_CX = 100;
const DC_CY = 100;
const DC_R_OUT = 80;
const DC_R_IN = 52;

function polarToXY(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function buildArcPath(startDeg: number, endDeg: number): string {
  const span = endDeg - startDeg;
  if (span >= 360) {
    const m1 = polarToXY(DC_CX, DC_CY, DC_R_OUT, startDeg);
    const m2 = polarToXY(DC_CX, DC_CY, DC_R_OUT, startDeg + 180);
    const i1 = polarToXY(DC_CX, DC_CY, DC_R_IN, startDeg);
    const i2 = polarToXY(DC_CX, DC_CY, DC_R_IN, startDeg + 180);
    return [
      `M ${m1.x} ${m1.y}`,
      `A ${DC_R_OUT} ${DC_R_OUT} 0 1 1 ${m2.x} ${m2.y}`,
      `A ${DC_R_OUT} ${DC_R_OUT} 0 1 1 ${m1.x} ${m1.y}`,
      `L ${i1.x} ${i1.y}`,
      `A ${DC_R_IN} ${DC_R_IN} 0 1 0 ${i2.x} ${i2.y}`,
      `A ${DC_R_IN} ${DC_R_IN} 0 1 0 ${i1.x} ${i1.y}`,
      'Z',
    ].join(' ');
  }

  const s = polarToXY(DC_CX, DC_CY, DC_R_OUT, startDeg);
  const e = polarToXY(DC_CX, DC_CY, DC_R_OUT, endDeg);
  const si = polarToXY(DC_CX, DC_CY, DC_R_IN, startDeg);
  const ei = polarToXY(DC_CX, DC_CY, DC_R_IN, endDeg);
  const large = span > 180 ? 1 : 0;
  return [
    `M ${s.x} ${s.y}`,
    `A ${DC_R_OUT} ${DC_R_OUT} 0 ${large} 1 ${e.x} ${e.y}`,
    `L ${ei.x} ${ei.y}`,
    `A ${DC_R_IN} ${DC_R_IN} 0 ${large} 0 ${si.x} ${si.y}`,
    'Z',
  ].join(' ');
}

function DoughnutChart({
  segments,
  totalLabel,
  onSelect,
  selected,
}: {
  segments: DonutSegment[];
  totalLabel: string;
  onSelect: (i: number | null) => void;
  selected: number | null;
}) {
  let cumDeg = 0;
  const segsWithAngles = segments.map((s) => {
    const deg = (s.percentage / 100) * 360;
    const start = cumDeg;
    cumDeg += deg;
    return { ...s, startDeg: start, endDeg: cumDeg };
  });

  const selSeg = selected !== null ? segsWithAngles[selected] ?? null : null;

  return (
    <svg
      viewBox={`0 0 ${DC_SIZE} ${DC_SIZE}`}
      className="w-full max-w-[200px] mx-auto"
      aria-label="Expense category doughnut chart"
    >
      {segsWithAngles.map((s, i) => (
        <path
          key={i}
          d={buildArcPath(s.startDeg, s.endDeg)}
          fill={s.color}
          opacity={selected !== null && selected !== i ? 0.45 : 1}
          onClick={() => onSelect(selected === i ? null : i)}
          style={{ cursor: 'pointer', transition: 'opacity 0.15s' }}
        />
      ))}
      <circle cx={DC_CX} cy={DC_CY} r={DC_R_IN - 2} fill="white" />
      {selSeg ? (
        <>
          <text x={DC_CX} y={DC_CY - 10} textAnchor="middle" fontSize={7.5} fill="#718096" fontFamily="DM Sans, sans-serif">
            {selSeg.label}
          </text>
          <text x={DC_CX} y={DC_CY + 6} textAnchor="middle" fontSize={9.5} fill="#1A202C" fontWeight="700" fontFamily="DM Sans, sans-serif">
            {formatNaira(selSeg.amount)}
          </text>
          <text x={DC_CX} y={DC_CY + 20} textAnchor="middle" fontSize={8} fill="#718096" fontFamily="DM Sans, sans-serif">
            {selSeg.percentage.toFixed(1)}%
          </text>
        </>
      ) : (
        <>
          <text x={DC_CX} y={DC_CY - 4} textAnchor="middle" fontSize={8} fill="#718096" fontFamily="DM Sans, sans-serif">
            Total
          </text>
          <text x={DC_CX} y={DC_CY + 12} textAnchor="middle" fontSize={9.5} fill="#1A202C" fontWeight="700" fontFamily="DM Sans, sans-serif">
            {totalLabel}
          </text>
        </>
      )}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dual-Line Chart (Year-on-Year)
// ─────────────────────────────────────────────────────────────────────────────

const LC_W = 360;
const LC_H = 180;
const LC_PAD_L = 8;
const LC_PAD_R = 8;
const LC_PAD_T = 24;
const LC_PAD_B = 24;
const LC_IW = LC_W - LC_PAD_L - LC_PAD_R;
const LC_IH = LC_H - LC_PAD_T - LC_PAD_B;

function LineChart({
  currentData,
  priorData,
  currentYear,
  priorYear,
  hasPriorData,
}: {
  currentData: MonthlyData[];
  priorData: MonthlyData[];
  currentYear: number;
  priorYear: number;
  hasPriorData: boolean;
}) {
  const allAmounts = hasPriorData
    ? [...currentData, ...priorData].map((d) => d.amount)
    : currentData.map((d) => d.amount);
  const maxAmt = Math.max(...allAmounts, 1);

  function point(i: number, amount: number): string {
    const x = LC_PAD_L + (i / 11) * LC_IW;
    const y = LC_PAD_T + LC_IH - (amount / maxAmt) * LC_IH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }

  const curPts = currentData.map((d, i) => point(i, d.amount)).join(' ');
  const priPts = priorData.map((d, i) => point(i, d.amount)).join(' ');

  return (
    <svg
      viewBox={`0 0 ${LC_W} ${LC_H}`}
      className="w-full"
      style={{ minWidth: 280 }}
      aria-label="Year-on-year comparison line chart"
    >
      {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
        const gy = LC_PAD_T + LC_IH - frac * LC_IH;
        return (
          <line key={frac} x1={LC_PAD_L} y1={gy} x2={LC_W - LC_PAD_R} y2={gy} stroke="#E2E8F0" strokeWidth={0.5} />
        );
      })}

      {/* Prior year line — only when prior data exists */}
      {hasPriorData && (
        <polyline
          points={priPts}
          fill="none"
          stroke="#A0AEC0"
          strokeWidth={2}
          strokeDasharray="6 3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {/* Current year line — always shown */}
      <polyline
        points={curPts}
        fill="none"
        stroke="#1A7F5E"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {MONTHS_SHORT.map((m, i) => {
        const x = LC_PAD_L + (i / 11) * LC_IW;
        return (
          <text key={m} x={x} y={LC_H - 6} textAnchor="middle" fontSize={8} fill="#718096" fontFamily="DM Sans, sans-serif">
            {m}
          </text>
        );
      })}

      {/* Legend */}
      <rect x={LC_PAD_L} y={4} width={10} height={4} rx={2} fill="#1A7F5E" />
      <text x={LC_PAD_L + 14} y={9} fontSize={8} fill="#1A202C" fontFamily="DM Sans, sans-serif">
        {currentYear}
      </text>
      {hasPriorData && (
        <>
          <line x1={LC_PAD_L + 60} y1={6} x2={LC_PAD_L + 70} y2={6} stroke="#A0AEC0" strokeWidth={2} strokeDasharray="4 2" />
          <text x={LC_PAD_L + 74} y={9} fontSize={8} fill="#718096" fontFamily="DM Sans, sans-serif">
            {priorYear}
          </text>
        </>
      )}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  subLabel,
}: {
  label: string;
  value: string;
  subLabel?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-border shadow-soft p-4">
      <p className="text-body-xs text-neutral-500 mb-1 truncate">{label}</p>
      <p className="text-heading-md font-mono text-neutral-900 leading-tight">{value}</p>
      {subLabel && <p className="text-body-xs text-neutral-400 mt-0.5">{subLabel}</p>}
    </div>
  );
}

/** Two-column comparison card: current year vs prior year */
function YoyCompareCard({
  label,
  currentValue,
  priorValue,
  change,
  hasPriorData,
  lowerIsBetter,
}: {
  label: string;
  currentValue: string;
  priorValue: string;
  change: number | null;
  hasPriorData: boolean;
  lowerIsBetter?: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border border-border shadow-soft p-4">
      <p className="text-body-xs text-neutral-500 mb-3 font-medium uppercase tracking-wide truncate">
        {label}
      </p>
      <div className="grid grid-cols-2 gap-3">
        {/* Current year */}
        <div>
          <p className="text-[10px] text-neutral-400 mb-1">Current Year</p>
          <p className="text-heading-sm font-mono text-neutral-900 leading-tight">
            {currentValue}
          </p>
          <ChangeChip change={change} lowerIsBetter={lowerIsBetter} hasPriorData={hasPriorData} />
        </div>
        {/* Prior year */}
        <div className="border-l border-border pl-3">
          <p className="text-[10px] text-neutral-400 mb-1">Prior Year</p>
          <p className={`text-heading-sm font-mono leading-tight ${hasPriorData ? 'text-neutral-600' : 'text-neutral-300'}`}>
            {hasPriorData ? priorValue : '—'}
          </p>
          {!hasPriorData && (
            <p className="text-[10px] text-neutral-400 mt-1">N/A</p>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ type }: { type: 'income' | 'expenses' }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-neutral-100 flex items-center justify-center mb-4">
        <BarChart2 className="w-8 h-8 text-neutral-300" strokeWidth={1.5} />
      </div>
      <p className="text-heading-md text-neutral-900 mb-1">
        No {type} data for this period
      </p>
      <p className="text-body-sm text-neutral-500 mb-5 max-w-xs">
        Import your bank transactions to see {type} reports and analytics.
      </p>
      <Link
        to="/app/import"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-body-sm font-medium hover:bg-primary/90 transition-colors"
      >
        <Upload className="w-4 h-4" />
        Import Transactions
      </Link>
    </div>
  );
}

function ReportsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-52 rounded-xl" />
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

function ChangeChip({
  change,
  lowerIsBetter,
  hasPriorData,
}: {
  change: number | null;
  lowerIsBetter?: boolean;
  hasPriorData?: boolean;
}) {
  if (!hasPriorData) return <p className="text-[10px] text-neutral-400 mt-1">N/A</p>;
  if (change === null) return <p className="text-[10px] text-neutral-400 mt-1">N/A</p>;
  const positive = change >= 0;
  const good = lowerIsBetter ? !positive : positive;
  return (
    <span
      className={`inline-flex items-center gap-1 text-body-xs font-medium mt-1 ${
        good ? 'text-success' : 'text-danger'
      }`}
    >
      {positive ? (
        <TrendingUp className="w-3 h-3" />
      ) : (
        <TrendingDown className="w-3 h-3" />
      )}
      {Math.abs(change).toFixed(1)}%
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Export Sheet
// ─────────────────────────────────────────────────────────────────────────────

function ExportSheet({
  open,
  onClose,
  onExport,
  isLoading,
  loadingFormat,
}: {
  open: boolean;
  onClose: () => void;
  onExport: (format: ExportFormat) => void;
  isLoading: boolean;
  loadingFormat: ExportFormat | null;
}) {
  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-xl animate-slide-up pb-safe">
        <div className="flex items-center justify-between px-5 pt-4 pb-2 border-b border-border">
          <h3 className="text-heading-sm font-display text-neutral-900">Export Report</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-neutral-100 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4 text-neutral-500" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          {/* CSV */}
          <button
            onClick={() => onExport('csv')}
            disabled={isLoading}
            className="w-full flex items-center gap-4 p-4 rounded-xl border border-border hover:bg-neutral-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center flex-shrink-0">
              <Table2 className="w-5 h-5 text-green-600" />
            </div>
            <div className="text-left flex-1 min-w-0">
              <p className="text-body-sm font-medium text-neutral-900">Download as CSV</p>
              <p className="text-body-xs text-neutral-500">
                Spreadsheet format — open in Excel or Google Sheets
              </p>
            </div>
            {isLoading && loadingFormat === 'csv' && (
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />
            )}
          </button>

          {/* PDF */}
          <button
            onClick={() => onExport('pdf')}
            disabled={isLoading}
            className="w-full flex items-center gap-4 p-4 rounded-xl border border-border hover:bg-neutral-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
              <FileText className="w-5 h-5 text-red-500" />
            </div>
            <div className="text-left flex-1 min-w-0">
              <p className="text-body-sm font-medium text-neutral-900">Download as PDF</p>
              <p className="text-body-xs text-neutral-500">
                {isLoading && loadingFormat === 'pdf'
                  ? 'Generating PDF…'
                  : 'Professional report with TaxEase branding'}
              </p>
            </div>
            {isLoading && loadingFormat === 'pdf' && (
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />
            )}
          </button>
        </div>
        {/* Safe area spacer for iOS */}
        <div className="h-4" />
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function Reports() {
  const { activeEntityId } = useEntity();
  const currentYear = new Date().getFullYear();

  // ── UI state ──
  const [activeTab, setActiveTab] = useState<ActiveTab>('income');
  const [dateMode, setDateMode] = useState<DateRangeMode>('this_year');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // ── Chart interaction ──
  const [selectedBarMonth, setSelectedBarMonth] = useState<number | null>(null);
  const [selectedDoughnutIdx, setSelectedDoughnutIdx] = useState<number | null>(null);

  // ── Export state ──
  const [exportSheetOpen, setExportSheetOpen] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportLoadingFormat, setExportLoadingFormat] = useState<ExportFormat | null>(null);
  const exportTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Entity list (available for future PDF header use) ──
  useQuery(api.entityCrud.list);

  // ── Convex export actions ──
  const exportCsvAction = useAction((api as any).reportActions.exportCsv);
  const exportPdfAction = useAction((api as any).reportActions.exportPdf);

  // ── Compute query args from date range mode ──
  const queryArgs = useMemo<Record<string, unknown> | null>(() => {
    if (!activeEntityId) return null;
    if (dateMode === 'this_year')
      return { entityId: activeEntityId, taxYear: currentYear };
    if (dateMode === 'last_year')
      return { entityId: activeEntityId, taxYear: currentYear - 1 };
    if (!customStart) return null;
    return {
      entityId: activeEntityId,
      startDate: customStart,
      ...(customEnd ? { endDate: customEnd } : {}),
    };
  }, [activeEntityId, dateMode, currentYear, customStart, customEnd]);

  const argsOrSkip = queryArgs ?? 'skip';

  // ── Queries ──
  const incomeData = useQuery(
    (api as any).reports.getIncome,
    activeTab === 'income' ? argsOrSkip : 'skip'
  ) as IncomeReport | null | undefined;

  const expensesData = useQuery(
    (api as any).reports.getExpenses,
    activeTab === 'expenses' ? argsOrSkip : 'skip'
  ) as ExpensesReport | null | undefined;

  const yoyQueryArgs =
    activeEntityId ? { entityId: activeEntityId, currentYear } : 'skip';

  const yoyData = useQuery(
    (api as any).reports.getYearOnYear,
    activeTab === 'year_on_year' ? yoyQueryArgs : 'skip'
  ) as YearOnYearReport | null | undefined;

  // ── Doughnut segments ──
  const doughnutSegments: DonutSegment[] = useMemo(() => {
    if (!expensesData?.categoryBreakdown?.length) return [];
    const cats = expensesData.categoryBreakdown;
    const large: ExpenseCategory[] = [];
    const small: ExpenseCategory[] = [];
    cats.forEach((c) => (c.percentage < 3 ? small : large).push(c));

    const segs: DonutSegment[] = large.map((c, i) => ({
      label: c.categoryName,
      amount: c.amount,
      percentage: c.percentage,
      color: catColor(i, c.color),
    }));

    if (small.length > 0) {
      const otherAmt = small.reduce((s, c) => s + c.amount, 0);
      const otherPct = small.reduce((s, c) => s + c.percentage, 0);
      segs.push({ label: 'Other', amount: otherAmt, percentage: otherPct, color: '#CBD5E0' });
    }

    return segs;
  }, [expensesData]);

  // ── Tab / date mode handlers ──
  function switchTab(tab: ActiveTab) {
    setActiveTab(tab);
    setSelectedBarMonth(null);
    setSelectedDoughnutIdx(null);
  }

  function switchDateMode(mode: DateRangeMode) {
    setDateMode(mode);
    setSelectedBarMonth(null);
    setSelectedDoughnutIdx(null);
  }

  // ── Export filename helpers ──
  function buildFilename(ext: 'csv' | 'pdf'): string {
    const tabSlug =
      activeTab === 'income' ? 'income' :
      activeTab === 'expenses' ? 'expenses' : 'year_on_year';

    const datePart =
      dateMode === 'this_year' ? `${currentYear}` :
      dateMode === 'last_year' ? `${currentYear - 1}` :
      customStart && customEnd ? `${customStart}_${customEnd}` :
      customStart ? `from_${customStart}` : 'all';

    return `taxease_${tabSlug}_${datePart}.${ext}`;
  }

  // ── Download helpers ──
  function downloadCsvBlob(csvContent: string, filename: string) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function downloadPdfUrl(url: string, filename: string) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // ── Export handler ──
  async function handleExport(format: ExportFormat) {
    if (!activeEntityId) {
      toast.error('No active entity selected.');
      return;
    }

    setExportLoading(true);
    setExportLoadingFormat(format);

    // 30s timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      exportTimeoutRef.current = setTimeout(
        () => reject(new Error('Export timed out. Please try again.')),
        30_000
      );
    });

    try {
      const taxYear =
        dateMode === 'this_year' ? currentYear :
        dateMode === 'last_year' ? currentYear - 1 : undefined;

      const startDate = dateMode === 'custom' ? customStart || undefined : undefined;
      const endDate = dateMode === 'custom' ? customEnd || undefined : undefined;

      if (format === 'csv') {
        const tabArg =
          activeTab === 'income' ? 'income' :
          activeTab === 'expenses' ? 'expenses' : 'yearOnYear';

        const result = await Promise.race([
          exportCsvAction({ entityId: activeEntityId, tab: tabArg, taxYear, startDate, endDate }),
          timeoutPromise,
        ]) as { csvContent: string; filename: string };

        const filename = buildFilename('csv');
        downloadCsvBlob(result.csvContent, filename);
        toast.success('CSV downloaded successfully.');
        setExportSheetOpen(false);
      } else {
        const result = await Promise.race([
          exportPdfAction({ entityId: activeEntityId, taxYear, startDate, endDate }),
          timeoutPromise,
        ]) as { storageId: string; downloadUrl: string };

        const filename = buildFilename('pdf');
        downloadPdfUrl(result.downloadUrl, filename);
        toast.success('PDF downloaded successfully.');
        setExportSheetOpen(false);
      }
    } catch (err: any) {
      const msg = err?.message ?? 'Export failed. Please try again.';
      toast.error(msg, {
        action: {
          label: 'Retry',
          onClick: () => handleExport(format),
        },
      });
    } finally {
      if (exportTimeoutRef.current) clearTimeout(exportTimeoutRef.current);
      setExportLoading(false);
      setExportLoadingFormat(null);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto animate-fade-in pb-24">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-heading-xl font-display text-neutral-900">Reports</h1>
          <p className="text-body-sm text-neutral-500 mt-0.5">
            Financial analytics and tax reporting
          </p>
        </div>
        {/* Desktop export button */}
        <button
          onClick={() => setExportSheetOpen(true)}
          className="hidden md:inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-white hover:bg-neutral-50 text-body-sm font-medium text-neutral-700 transition-colors shadow-soft"
        >
          <Download className="w-4 h-4" />
          Export
        </button>
      </div>

      {/* Date Range Segmented Control */}
      <div className="bg-white rounded-xl border border-border shadow-soft p-1 flex gap-1 mb-4 w-fit">
        {(['this_year', 'last_year', 'custom'] as DateRangeMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => switchDateMode(mode)}
            className={`px-4 py-1.5 rounded-lg text-body-sm font-medium transition-all ${
              dateMode === mode
                ? 'bg-primary text-white shadow-sm'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            {mode === 'this_year'
              ? 'This Year'
              : mode === 'last_year'
              ? 'Last Year'
              : 'Custom'}
          </button>
        ))}
      </div>

      {/* Custom Date Pickers */}
      {dateMode === 'custom' && (
        <div className="flex flex-wrap items-center gap-3 mb-4 animate-slide-up">
          <div className="flex items-center gap-2">
            <label className="text-body-sm text-neutral-500 whitespace-nowrap">From</label>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="border border-border rounded-lg px-3 py-1.5 text-body-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-body-sm text-neutral-500 whitespace-nowrap">To</label>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="border border-border rounded-lg px-3 py-1.5 text-body-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-border mb-6">
        <div className="flex gap-0 -mb-px">
          {(['income', 'expenses', 'year_on_year'] as ActiveTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => switchTab(tab)}
              className={`px-5 py-3 text-body-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab
                  ? 'border-primary text-primary'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
              }`}
            >
              {tab === 'income'
                ? 'Income'
                : tab === 'expenses'
                ? 'Expenses'
                : 'Year-on-Year'}
            </button>
          ))}
        </div>
      </div>

      {/* ── INCOME TAB ── */}
      {activeTab === 'income' && (
        <>
          {incomeData === undefined ? (
            <ReportsSkeleton />
          ) : !incomeData || incomeData.totalIncome === 0 ? (
            <div className="bg-white rounded-xl border border-border shadow-soft overflow-hidden">
              <EmptyState type="income" />
            </div>
          ) : (
            <div className="space-y-4 animate-fade-in">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <SummaryCard label="Total Income" value={formatNaira(incomeData.totalIncome)} />
                <SummaryCard
                  label="Foreign Income"
                  value={formatNaira(incomeData.foreignIncome)}
                  subLabel="in NGN equivalent"
                />
                <SummaryCard
                  label="Avg Monthly Income"
                  value={formatNaira(incomeData.averageMonthlyIncome)}
                  subLabel="active months only"
                />
              </div>

              <div className="bg-white rounded-xl border border-border shadow-soft p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-heading-sm font-display text-neutral-900">Monthly Income</h2>
                  {selectedBarMonth !== null && (
                    <span className="text-body-sm text-neutral-500">
                      {MONTHS_SHORT[selectedBarMonth - 1]} —{' '}
                      {formatNaira(incomeData.monthlyBreakdown[selectedBarMonth - 1]?.amount ?? 0)}
                    </span>
                  )}
                </div>
                <BarChart
                  data={incomeData.monthlyBreakdown}
                  onSelect={setSelectedBarMonth}
                  selected={selectedBarMonth}
                />
              </div>

              <div className="bg-white rounded-xl border border-border shadow-soft overflow-hidden">
                <div className="px-4 py-3 border-b border-border">
                  <h2 className="text-heading-sm font-display text-neutral-900">Income by Category</h2>
                </div>
                <div className="divide-y divide-border">
                  {incomeData.categoryBreakdown.map((cat, i) => (
                    <div key={cat.categoryId ?? '__none__'} className="flex items-center gap-3 px-4 py-3">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: catColor(i, cat.color) }} />
                      <span className="text-body-sm text-neutral-700 flex-1 min-w-0 truncate">{cat.categoryName}</span>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="hidden sm:block w-20 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${Math.min(cat.percentage, 100)}%`, backgroundColor: catColor(i, cat.color) }} />
                        </div>
                        <span className="text-body-xs text-neutral-400 w-10 text-right">{cat.percentage.toFixed(1)}%</span>
                        <span className="text-body-sm font-mono text-neutral-900 w-28 text-right">{formatNaira(cat.amount)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── EXPENSES TAB ── */}
      {activeTab === 'expenses' && (
        <>
          {expensesData === undefined ? (
            <ReportsSkeleton />
          ) : !expensesData || expensesData.totalExpenses === 0 ? (
            <div className="bg-white rounded-xl border border-border shadow-soft overflow-hidden">
              <EmptyState type="expenses" />
            </div>
          ) : (
            <div className="space-y-4 animate-fade-in">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <SummaryCard label="Total Expenses" value={formatNaira(expensesData.totalExpenses)} />
                <SummaryCard
                  label="Deductible"
                  value={formatNaira(expensesData.deductibleExpenses)}
                  subLabel="tax-deductible portion"
                />
                <SummaryCard label="Non-Deductible" value={formatNaira(expensesData.nonDeductibleExpenses)} />
              </div>

              <div className="bg-white rounded-xl border border-border shadow-soft p-4">
                <h2 className="text-heading-sm font-display text-neutral-900 mb-4">Expenses by Category</h2>
                {doughnutSegments.length > 0 ? (
                  <div className="flex flex-col sm:flex-row items-center gap-6">
                    <div className="w-48 flex-shrink-0">
                      <DoughnutChart
                        segments={doughnutSegments}
                        totalLabel={formatNaira(expensesData.totalExpenses)}
                        onSelect={setSelectedDoughnutIdx}
                        selected={selectedDoughnutIdx}
                      />
                    </div>
                    <div className="flex-1 min-w-0 w-full space-y-1">
                      {doughnutSegments.map((seg, i) => (
                        <button
                          key={seg.label}
                          onClick={() => setSelectedDoughnutIdx(selectedDoughnutIdx === i ? null : i)}
                          className={`flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg transition-colors ${
                            selectedDoughnutIdx === i ? 'bg-neutral-100' : 'hover:bg-neutral-50'
                          }`}
                        >
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }} />
                          <span className="text-body-sm text-neutral-700 flex-1 min-w-0 truncate">{seg.label}</span>
                          <span className="text-body-xs text-neutral-400 flex-shrink-0">{seg.percentage.toFixed(1)}%</span>
                          <span className="text-body-sm font-mono text-neutral-900 flex-shrink-0 w-24 text-right">{formatNaira(seg.amount)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-body-sm text-neutral-400 text-center py-4">No category data available.</p>
                )}
              </div>

              <div className="bg-white rounded-xl border border-border shadow-soft overflow-hidden">
                <div className="px-4 py-3 border-b border-border">
                  <h2 className="text-heading-sm font-display text-neutral-900">Expense Breakdown</h2>
                </div>
                <div className="divide-y divide-border">
                  {expensesData.categoryBreakdown.map((cat, i) => (
                    <div key={cat.categoryId ?? '__none__'} className="flex items-center gap-3 px-4 py-3">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: catColor(i, cat.color) }} />
                      <div className="flex-1 min-w-0">
                        <span className="text-body-sm text-neutral-700 block truncate">{cat.categoryName}</span>
                        {cat.isDeductible && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-50 text-green-700 border border-green-200 mt-0.5">
                            Deductible
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="text-body-xs text-neutral-400 w-10 text-right">{cat.percentage.toFixed(1)}%</span>
                        <span className="text-body-sm font-mono text-neutral-900 w-28 text-right">{formatNaira(cat.amount)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── YEAR-ON-YEAR TAB ── */}
      {activeTab === 'year_on_year' && (
        <>
          {yoyData === undefined ? (
            <ReportsSkeleton />
          ) : !yoyData ? (
            <div className="bg-white rounded-xl border border-border shadow-soft overflow-hidden">
              <EmptyState type="income" />
            </div>
          ) : (
            <div className="space-y-4 animate-fade-in">
              {/* Prior year missing info banner */}
              {!yoyData.hasPriorData && (
                <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-xl border border-blue-100">
                  <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                  <p className="text-body-sm text-blue-700">
                    No data found for {yoyData.priorYear}. Import transactions from that year to see year-on-year comparisons.
                  </p>
                </div>
              )}

              {/* Two-column comparison cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <YoyCompareCard
                  label="Total Income"
                  currentValue={formatNaira(yoyData.currentIncome)}
                  priorValue={formatNaira(yoyData.priorIncome)}
                  change={yoyData.incomeChange}
                  hasPriorData={yoyData.hasPriorData}
                />
                <YoyCompareCard
                  label="Total Expenses"
                  currentValue={formatNaira(yoyData.currentExpenses)}
                  priorValue={formatNaira(yoyData.priorExpenses)}
                  change={yoyData.expensesChange}
                  hasPriorData={yoyData.hasPriorData}
                  lowerIsBetter
                />
                <YoyCompareCard
                  label="Tax Liability"
                  currentValue={formatNaira(yoyData.currentTaxPayable)}
                  priorValue={formatNaira(yoyData.priorTaxPayable)}
                  change={yoyData.taxPayableChange}
                  hasPriorData={yoyData.hasPriorData}
                  lowerIsBetter
                />
                <YoyCompareCard
                  label="Effective Tax Rate"
                  currentValue={`${yoyData.currentEffectiveTaxRate.toFixed(1)}%`}
                  priorValue={`${yoyData.priorEffectiveTaxRate.toFixed(1)}%`}
                  change={yoyData.effectiveTaxRateChange}
                  hasPriorData={yoyData.hasPriorData}
                  lowerIsBetter
                />
              </div>

              {/* Income line chart */}
              <div className="bg-white rounded-xl border border-border shadow-soft p-4">
                <h2 className="text-heading-sm font-display text-neutral-900 mb-3">
                  Monthly Income Comparison
                </h2>
                <LineChart
                  currentData={yoyData.currentMonthlyIncome}
                  priorData={yoyData.priorMonthlyIncome}
                  currentYear={yoyData.currentYear}
                  priorYear={yoyData.priorYear}
                  hasPriorData={yoyData.hasPriorData}
                />
              </div>

              {/* Expenses line chart */}
              <div className="bg-white rounded-xl border border-border shadow-soft p-4">
                <h2 className="text-heading-sm font-display text-neutral-900 mb-3">
                  Monthly Expenses Comparison
                </h2>
                <LineChart
                  currentData={yoyData.currentMonthlyExpenses}
                  priorData={yoyData.priorMonthlyExpenses}
                  currentYear={yoyData.currentYear}
                  priorYear={yoyData.priorYear}
                  hasPriorData={yoyData.hasPriorData}
                />
              </div>

              {/* Prior year summary row */}
              <div className="bg-neutral-50 rounded-xl border border-border p-4">
                <p className="text-body-xs text-neutral-500 mb-2 font-medium uppercase tracking-wide">
                  {yoyData.priorYear} Summary
                </p>
                {yoyData.hasPriorData ? (
                  <div className="flex flex-wrap gap-6">
                    <div>
                      <p className="text-body-xs text-neutral-400">Income</p>
                      <p className="text-body-sm font-mono text-neutral-700">{formatNaira(yoyData.priorIncome)}</p>
                    </div>
                    <div>
                      <p className="text-body-xs text-neutral-400">Expenses</p>
                      <p className="text-body-sm font-mono text-neutral-700">{formatNaira(yoyData.priorExpenses)}</p>
                    </div>
                    <div>
                      <p className="text-body-xs text-neutral-400">Tax Payable</p>
                      <p className="text-body-sm font-mono text-neutral-700">{formatNaira(yoyData.priorTaxPayable)}</p>
                    </div>
                    <div>
                      <p className="text-body-xs text-neutral-400">Effective Rate</p>
                      <p className="text-body-sm font-mono text-neutral-700">{yoyData.priorEffectiveTaxRate.toFixed(1)}%</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-body-sm text-neutral-400">No data for {yoyData.priorYear}.</p>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Mobile FAB ── */}
      <button
        onClick={() => setExportSheetOpen(true)}
        className="md:hidden fixed bottom-6 right-4 z-30 w-14 h-14 rounded-full bg-primary text-white shadow-medium flex items-center justify-center hover:bg-primary/90 transition-colors active:scale-95"
        aria-label="Export report"
      >
        <Download className="w-6 h-6" />
      </button>

      {/* ── Export Sheet ── */}
      <ExportSheet
        open={exportSheetOpen}
        onClose={() => !exportLoading && setExportSheetOpen(false)}
        onExport={handleExport}
        isLoading={exportLoading}
        loadingFormat={exportLoadingFormat}
      />
    </div>
  );
}
