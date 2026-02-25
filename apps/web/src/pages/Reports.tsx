/**
 * TaxEase Nigeria — Reports Screen (US-048)
 *
 * Three tabs: Income | Expenses | Year-on-Year
 * Date range: This Year | Last Year | Custom
 * Charts: SVG bar (income), SVG doughnut (expenses), SVG dual-line (YoY)
 */

import { useState, useMemo } from 'react';
import { useQuery } from 'convex/react';
import { Link } from 'react-router-dom';
import { api } from '@convex/_generated/api';
import { useEntity } from '../contexts/EntityContext';
import { Skeleton } from '../components/Skeleton';
import {
  TrendingUp,
  TrendingDown,
  Upload,
  BarChart2,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type DateRangeMode = 'this_year' | 'last_year' | 'custom';
type ActiveTab = 'income' | 'expenses' | 'year_on_year';

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
        // Tooltip x: clamp so it stays within SVG
        const tipX = Math.max(0, Math.min(x - (TIP_W / 2 - BAR_W / 2), BC_W - TIP_W - 4));

        return (
          <g
            key={d.month}
            onClick={() => onSelect(isSel ? null : d.month)}
            style={{ cursor: 'pointer' }}
          >
            {/* Transparent hit area */}
            <rect
              x={x}
              y={Y_TOP}
              width={BAR_W}
              height={Y_INNER + 20}
              fill="transparent"
            />
            {/* Bar */}
            <rect
              x={x}
              y={barY}
              width={BAR_W}
              height={barH}
              rx={3}
              fill={isSel ? '#147050' : '#1A7F5E'}
              opacity={d.amount === 0 ? 0.2 : 1}
            />
            {/* Month label */}
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
            {/* Tooltip */}
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
  // Handle full circle
  const span = endDeg - startDeg;
  if (span >= 360) {
    // Draw two half-circles
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

      {/* Centre white circle */}
      <circle cx={DC_CX} cy={DC_CY} r={DC_R_IN - 2} fill="white" />

      {/* Centre text */}
      {selSeg ? (
        <>
          <text
            x={DC_CX}
            y={DC_CY - 10}
            textAnchor="middle"
            fontSize={7.5}
            fill="#718096"
            fontFamily="DM Sans, sans-serif"
          >
            {selSeg.label}
          </text>
          <text
            x={DC_CX}
            y={DC_CY + 6}
            textAnchor="middle"
            fontSize={9.5}
            fill="#1A202C"
            fontWeight="700"
            fontFamily="DM Sans, sans-serif"
          >
            {formatNaira(selSeg.amount)}
          </text>
          <text
            x={DC_CX}
            y={DC_CY + 20}
            textAnchor="middle"
            fontSize={8}
            fill="#718096"
            fontFamily="DM Sans, sans-serif"
          >
            {selSeg.percentage.toFixed(1)}%
          </text>
        </>
      ) : (
        <>
          <text
            x={DC_CX}
            y={DC_CY - 4}
            textAnchor="middle"
            fontSize={8}
            fill="#718096"
            fontFamily="DM Sans, sans-serif"
          >
            Total
          </text>
          <text
            x={DC_CX}
            y={DC_CY + 12}
            textAnchor="middle"
            fontSize={9.5}
            fill="#1A202C"
            fontWeight="700"
            fontFamily="DM Sans, sans-serif"
          >
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
}: {
  currentData: MonthlyData[];
  priorData: MonthlyData[];
  currentYear: number;
  priorYear: number;
}) {
  const allAmounts = [...currentData, ...priorData].map((d) => d.amount);
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
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
        const gy = LC_PAD_T + LC_IH - frac * LC_IH;
        return (
          <line
            key={frac}
            x1={LC_PAD_L}
            y1={gy}
            x2={LC_W - LC_PAD_R}
            y2={gy}
            stroke="#E2E8F0"
            strokeWidth={0.5}
          />
        );
      })}

      {/* Prior year line */}
      <polyline
        points={priPts}
        fill="none"
        stroke="#A0AEC0"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Current year line */}
      <polyline
        points={curPts}
        fill="none"
        stroke="#1A7F5E"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* X-axis labels */}
      {MONTHS_SHORT.map((m, i) => {
        const x = LC_PAD_L + (i / 11) * LC_IW;
        return (
          <text
            key={m}
            x={x}
            y={LC_H - 6}
            textAnchor="middle"
            fontSize={8}
            fill="#718096"
            fontFamily="DM Sans, sans-serif"
          >
            {m}
          </text>
        );
      })}

      {/* Legend */}
      <rect x={LC_PAD_L} y={4} width={10} height={4} rx={2} fill="#1A7F5E" />
      <text
        x={LC_PAD_L + 14}
        y={9}
        fontSize={8}
        fill="#1A202C"
        fontFamily="DM Sans, sans-serif"
      >
        {currentYear}
      </text>
      <rect x={LC_PAD_L + 60} y={4} width={10} height={4} rx={2} fill="#A0AEC0" />
      <text
        x={LC_PAD_L + 74}
        y={9}
        fontSize={8}
        fill="#718096"
        fontFamily="DM Sans, sans-serif"
      >
        {priorYear}
      </text>
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
      {subLabel && (
        <p className="text-body-xs text-neutral-400 mt-0.5">{subLabel}</p>
      )}
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
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
}: {
  change: number | null;
  lowerIsBetter?: boolean;
}) {
  if (change === null) return null;
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
      {Math.abs(change).toFixed(1)}% vs prior year
    </span>
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

  // ── Compute query args from date range mode ──
  const queryArgs = useMemo<Record<string, unknown> | null>(() => {
    if (!activeEntityId) return null;
    if (dateMode === 'this_year')
      return { entityId: activeEntityId, taxYear: currentYear };
    if (dateMode === 'last_year')
      return { entityId: activeEntityId, taxYear: currentYear - 1 };
    // custom — skip if no start date
    if (!customStart) return null;
    return {
      entityId: activeEntityId,
      startDate: customStart,
      ...(customEnd ? { endDate: customEnd } : {}),
    };
  }, [activeEntityId, dateMode, currentYear, customStart, customEnd]);

  const argsOrSkip = queryArgs ?? 'skip';

  // ── Queries — always called (conditional skip via 'skip') ──
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

  // ── Doughnut segments (group <3% into "Other") ──
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

  // ── Tab switch handler ──
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

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto animate-fade-in pb-8">
      {/* Page Header */}
      <div className="mb-5">
        <h1 className="text-heading-xl font-display text-neutral-900">Reports</h1>
        <p className="text-body-sm text-neutral-500 mt-0.5">
          Financial analytics and tax reporting
        </p>
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
              {/* Summary cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <SummaryCard
                  label="Total Income"
                  value={formatNaira(incomeData.totalIncome)}
                />
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

              {/* Bar chart */}
              <div className="bg-white rounded-xl border border-border shadow-soft p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-heading-sm font-display text-neutral-900">
                    Monthly Income
                  </h2>
                  {selectedBarMonth !== null && (
                    <span className="text-body-sm text-neutral-500">
                      {MONTHS_SHORT[selectedBarMonth - 1]} —{' '}
                      {formatNaira(
                        incomeData.monthlyBreakdown[selectedBarMonth - 1]?.amount ?? 0
                      )}
                    </span>
                  )}
                </div>
                <BarChart
                  data={incomeData.monthlyBreakdown}
                  onSelect={setSelectedBarMonth}
                  selected={selectedBarMonth}
                />
              </div>

              {/* Category breakdown */}
              <div className="bg-white rounded-xl border border-border shadow-soft overflow-hidden">
                <div className="px-4 py-3 border-b border-border">
                  <h2 className="text-heading-sm font-display text-neutral-900">
                    Income by Category
                  </h2>
                </div>
                <div className="divide-y divide-border">
                  {incomeData.categoryBreakdown.map((cat, i) => (
                    <div
                      key={cat.categoryId ?? '__none__'}
                      className="flex items-center gap-3 px-4 py-3"
                    >
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: catColor(i, cat.color) }}
                      />
                      <span className="text-body-sm text-neutral-700 flex-1 min-w-0 truncate">
                        {cat.categoryName}
                      </span>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="hidden sm:block w-20 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min(cat.percentage, 100)}%`,
                              backgroundColor: catColor(i, cat.color),
                            }}
                          />
                        </div>
                        <span className="text-body-xs text-neutral-400 w-10 text-right">
                          {cat.percentage.toFixed(1)}%
                        </span>
                        <span className="text-body-sm font-mono text-neutral-900 w-28 text-right">
                          {formatNaira(cat.amount)}
                        </span>
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
              {/* Summary cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <SummaryCard
                  label="Total Expenses"
                  value={formatNaira(expensesData.totalExpenses)}
                />
                <SummaryCard
                  label="Deductible"
                  value={formatNaira(expensesData.deductibleExpenses)}
                  subLabel="tax-deductible portion"
                />
                <SummaryCard
                  label="Non-Deductible"
                  value={formatNaira(expensesData.nonDeductibleExpenses)}
                />
              </div>

              {/* Doughnut chart + legend */}
              <div className="bg-white rounded-xl border border-border shadow-soft p-4">
                <h2 className="text-heading-sm font-display text-neutral-900 mb-4">
                  Expenses by Category
                </h2>
                {doughnutSegments.length > 0 ? (
                  <div className="flex flex-col sm:flex-row items-center gap-6">
                    {/* Doughnut */}
                    <div className="w-48 flex-shrink-0">
                      <DoughnutChart
                        segments={doughnutSegments}
                        totalLabel={formatNaira(expensesData.totalExpenses)}
                        onSelect={setSelectedDoughnutIdx}
                        selected={selectedDoughnutIdx}
                      />
                    </div>
                    {/* Legend */}
                    <div className="flex-1 min-w-0 w-full space-y-1">
                      {doughnutSegments.map((seg, i) => (
                        <button
                          key={seg.label}
                          onClick={() =>
                            setSelectedDoughnutIdx(
                              selectedDoughnutIdx === i ? null : i
                            )
                          }
                          className={`flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg transition-colors ${
                            selectedDoughnutIdx === i
                              ? 'bg-neutral-100'
                              : 'hover:bg-neutral-50'
                          }`}
                        >
                          <div
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: seg.color }}
                          />
                          <span className="text-body-sm text-neutral-700 flex-1 min-w-0 truncate">
                            {seg.label}
                          </span>
                          <span className="text-body-xs text-neutral-400 flex-shrink-0">
                            {seg.percentage.toFixed(1)}%
                          </span>
                          <span className="text-body-sm font-mono text-neutral-900 flex-shrink-0 w-24 text-right">
                            {formatNaira(seg.amount)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-body-sm text-neutral-400 text-center py-4">
                    No category data available.
                  </p>
                )}
              </div>

              {/* Expense category list with deductible badges */}
              <div className="bg-white rounded-xl border border-border shadow-soft overflow-hidden">
                <div className="px-4 py-3 border-b border-border">
                  <h2 className="text-heading-sm font-display text-neutral-900">
                    Expense Breakdown
                  </h2>
                </div>
                <div className="divide-y divide-border">
                  {expensesData.categoryBreakdown.map((cat, i) => (
                    <div
                      key={cat.categoryId ?? '__none__'}
                      className="flex items-center gap-3 px-4 py-3"
                    >
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: catColor(i, cat.color) }}
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-body-sm text-neutral-700 block truncate">
                          {cat.categoryName}
                        </span>
                        {cat.isDeductible && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-50 text-green-700 border border-green-200 mt-0.5">
                            Deductible
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="text-body-xs text-neutral-400 w-10 text-right">
                          {cat.percentage.toFixed(1)}%
                        </span>
                        <span className="text-body-sm font-mono text-neutral-900 w-28 text-right">
                          {formatNaira(cat.amount)}
                        </span>
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
              {/* Summary cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-white rounded-xl border border-border shadow-soft p-4">
                  <p className="text-body-xs text-neutral-500 mb-1">
                    Income {yoyData.currentYear} vs {yoyData.priorYear}
                  </p>
                  <p className="text-heading-md font-mono text-neutral-900">
                    {formatNaira(yoyData.currentIncome)}
                  </p>
                  <ChangeChip change={yoyData.incomeChange} />
                </div>
                <div className="bg-white rounded-xl border border-border shadow-soft p-4">
                  <p className="text-body-xs text-neutral-500 mb-1">
                    Expenses {yoyData.currentYear} vs {yoyData.priorYear}
                  </p>
                  <p className="text-heading-md font-mono text-neutral-900">
                    {formatNaira(yoyData.currentExpenses)}
                  </p>
                  <ChangeChip change={yoyData.expensesChange} lowerIsBetter />
                </div>
                <div className="bg-white rounded-xl border border-border shadow-soft p-4">
                  <p className="text-body-xs text-neutral-500 mb-1">
                    Tax Payable {yoyData.currentYear}
                  </p>
                  <p className="text-heading-md font-mono text-neutral-900">
                    {formatNaira(yoyData.currentTaxPayable)}
                  </p>
                  <ChangeChip change={yoyData.taxPayableChange} lowerIsBetter />
                </div>
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
                />
              </div>

              {/* Prior year summary row */}
              <div className="bg-neutral-50 rounded-xl border border-border p-4">
                <p className="text-body-xs text-neutral-500 mb-2 font-medium uppercase tracking-wide">
                  {yoyData.priorYear} Summary
                </p>
                <div className="flex flex-wrap gap-6">
                  <div>
                    <p className="text-body-xs text-neutral-400">Income</p>
                    <p className="text-body-sm font-mono text-neutral-700">
                      {formatNaira(yoyData.priorIncome)}
                    </p>
                  </div>
                  <div>
                    <p className="text-body-xs text-neutral-400">Expenses</p>
                    <p className="text-body-sm font-mono text-neutral-700">
                      {formatNaira(yoyData.priorExpenses)}
                    </p>
                  </div>
                  <div>
                    <p className="text-body-xs text-neutral-400">Tax Payable</p>
                    <p className="text-body-sm font-mono text-neutral-700">
                      {formatNaira(yoyData.priorTaxPayable)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
