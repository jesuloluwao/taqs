import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { useEntity } from '../contexts/EntityContext';
import { toast } from 'sonner';
import {
  Plus,
  Calendar,
  ChevronDown,
  CheckCircle2,
  Clock,
  Minus,
  Briefcase,
} from 'lucide-react';

// ─── helpers ────────────────────────────────────────────────────────────────

function formatNaira(kobo: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(kobo / 100);
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const CURRENT_YEAR = new Date().getFullYear();
const TAX_YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];

// ─── types ──────────────────────────────────────────────────────────────────

interface EmploymentRecord {
  _id: Id<'employmentIncomeRecords'>;
  entityId: Id<'entities'>;
  taxYear: number;
  month: number;
  employerName: string;
  grossSalary: number;
  payeDeducted: number;
  pensionDeducted?: number;
  nhisDeducted?: number;
  nhfDeducted?: number;
  netSalary?: number;
  transactionId?: Id<'transactions'>;
  source: 'payslip' | 'detected' | 'manual';
  status: 'pending' | 'confirmed' | 'rejected';
}

interface EmployerGroup {
  employerName: string;
  records: EmploymentRecord[];
  monthMap: Map<number, EmploymentRecord>;
  totalGross: number;
  totalPaye: number;
  pendingRecords: EmploymentRecord[];
  nextMissingMonth: number | null;
}

// ─── component ──────────────────────────────────────────────────────────────

export default function EmploymentIncome() {
  const navigate = useNavigate();
  const { activeEntityId } = useEntity();
  const [taxYear, setTaxYear] = useState(CURRENT_YEAR - 1);
  const [yearDropdownOpen, setYearDropdownOpen] = useState(false);

  const records = useQuery(
    api.employmentIncome.list,
    activeEntityId ? { entityId: activeEntityId, taxYear } : 'skip'
  ) as EmploymentRecord[] | null | undefined;

  const confirmRecord = useMutation(api.employmentIncome.confirm);
  const rejectRecord = useMutation(api.employmentIncome.reject);

  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Group records by employer
  const employerGroups = useMemo<EmployerGroup[]>(() => {
    if (!records || records.length === 0) return [];

    const grouped = new Map<string, EmploymentRecord[]>();
    for (const r of records) {
      if (r.status === 'rejected') continue;
      const existing = grouped.get(r.employerName) ?? [];
      existing.push(r);
      grouped.set(r.employerName, existing);
    }

    return Array.from(grouped.entries()).map(([employerName, recs]) => {
      const monthMap = new Map<number, EmploymentRecord>();
      let totalGross = 0;
      let totalPaye = 0;
      const pendingRecords: EmploymentRecord[] = [];

      for (const r of recs) {
        monthMap.set(r.month, r);
        if (r.status === 'confirmed') {
          totalGross += r.grossSalary;
          totalPaye += r.payeDeducted;
        }
        if (r.status === 'pending') {
          pendingRecords.push(r);
          totalGross += r.grossSalary;
          totalPaye += r.payeDeducted;
        }
      }

      // Find next missing month (1-12)
      let nextMissingMonth: number | null = null;
      for (let m = 1; m <= 12; m++) {
        if (!monthMap.has(m)) {
          nextMissingMonth = m;
          break;
        }
      }

      return { employerName, records: recs, monthMap, totalGross, totalPaye, pendingRecords, nextMissingMonth };
    });
  }, [records]);

  const isLoading = records === undefined;
  const isEmpty = records !== undefined && records !== null && employerGroups.length === 0;

  async function handleConfirm(id: Id<'employmentIncomeRecords'>) {
    setActionLoading(id);
    try {
      await confirmRecord({ id });
      toast.success('Record confirmed');
    } catch {
      toast.error('Failed to confirm record');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject(id: Id<'employmentIncomeRecords'>) {
    setActionLoading(id);
    try {
      await rejectRecord({ id });
      toast.success('Record rejected');
    } catch {
      toast.error('Failed to reject record');
    } finally {
      setActionLoading(null);
    }
  }

  function navigateToPayslip(params: {
    employer?: string;
    month?: number;
    recordId?: string;
  }) {
    const sp = new URLSearchParams();
    if (activeEntityId) sp.set('entityId', activeEntityId);
    sp.set('taxYear', String(taxYear));
    if (params.employer) sp.set('employer', params.employer);
    if (params.month !== undefined) sp.set('month', String(params.month));
    if (params.recordId) sp.set('recordId', params.recordId);
    navigate(`/app/payslip-entry?${sp.toString()}`);
  }

  return (
    <div className="max-w-3xl mx-auto animate-fade-in pb-8">
      {/* Page header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-heading-xl font-display text-neutral-900">Employment Income</h1>
          <p className="text-body-sm text-neutral-500 mt-0.5">
            Track payslips and PAYE deductions for {taxYear} tax year
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Tax year selector */}
          <div className="relative">
            <button
              onClick={() => setYearDropdownOpen((v) => !v)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-border bg-white shadow-soft text-sm font-medium text-neutral-700 hover:bg-muted/40 transition-colors"
            >
              <Calendar className="w-4 h-4 text-neutral-400" />
              {taxYear}
              <ChevronDown className={`w-3.5 h-3.5 text-neutral-400 transition-transform ${yearDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            {yearDropdownOpen && (
              <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-border rounded-lg shadow-medium overflow-hidden min-w-[140px]">
                {TAX_YEARS.map((y) => (
                  <button
                    key={y}
                    onClick={() => { setTaxYear(y); setYearDropdownOpen(false); }}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                      y === taxYear
                        ? 'bg-primary-light text-primary font-medium'
                        : 'text-neutral-700 hover:bg-muted/40'
                    }`}
                  >
                    {y}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Add payslip button */}
          <button
            onClick={() => navigateToPayslip({})}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors shadow-soft"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add Payslip</span>
          </button>
        </div>
      </div>

      {/* Click-away for year dropdown */}
      {yearDropdownOpen && (
        <div className="fixed inset-0 z-20" onClick={() => setYearDropdownOpen(false)} />
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="bg-white rounded-2xl shadow-soft border border-border p-6 animate-pulse">
              <div className="h-5 w-40 bg-neutral-200 rounded mb-4" />
              <div className="grid grid-cols-12 gap-2 mb-4">
                {Array.from({ length: 12 }).map((_, j) => (
                  <div key={j} className="h-10 bg-neutral-100 rounded" />
                ))}
              </div>
              <div className="h-4 w-60 bg-neutral-100 rounded" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div className="bg-white rounded-2xl shadow-soft border border-border p-10 text-center">
          <div className="w-14 h-14 rounded-full bg-primary-light flex items-center justify-center mx-auto mb-4">
            <Briefcase className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-heading-lg font-display text-neutral-900 mb-2">
            No employment income records yet
          </h2>
          <p className="text-body-sm text-neutral-500 mb-6 max-w-md mx-auto">
            Enter your payslip details to get started. We'll track your monthly PAYE deductions and employment income for accurate tax filing.
          </p>
          <button
            onClick={() => navigateToPayslip({})}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors shadow-soft"
          >
            <Plus className="w-4 h-4" />
            Add First Payslip
          </button>
        </div>
      )}

      {/* Employer groups */}
      {!isLoading && employerGroups.length > 0 && (
        <div className="space-y-4">
          {employerGroups.map((group) => (
            <div key={group.employerName} className="bg-white rounded-2xl shadow-soft border border-border p-6">
              {/* Employer header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-primary-light flex items-center justify-center flex-shrink-0">
                    <Briefcase className="w-4 h-4 text-primary" />
                  </div>
                  <h3 className="text-heading-lg font-display text-neutral-900">{group.employerName}</h3>
                </div>
                <button
                  onClick={() => navigateToPayslip({
                    employer: group.employerName,
                    month: group.nextMissingMonth ?? undefined,
                  })}
                  className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                >
                  + Add payslip
                </button>
              </div>

              {/* Month grid */}
              <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5 mb-4">
                {MONTHS.map((label, idx) => {
                  const month = idx + 1;
                  const record = group.monthMap.get(month);
                  const status = record?.status;

                  return (
                    <button
                      key={month}
                      onClick={() => {
                        if (record) {
                          navigateToPayslip({
                            employer: group.employerName,
                            month,
                            recordId: record._id,
                          });
                        } else {
                          navigateToPayslip({
                            employer: group.employerName,
                            month,
                          });
                        }
                      }}
                      className={`flex flex-col items-center gap-1 py-2 px-1 rounded-lg border transition-colors text-xs cursor-pointer ${
                        status === 'confirmed'
                          ? 'bg-green-50 border-green-200 hover:bg-green-100'
                          : status === 'pending'
                          ? 'bg-amber-50 border-amber-200 hover:bg-amber-100'
                          : 'bg-neutral-50 border-neutral-200 hover:bg-neutral-100'
                      }`}
                      title={
                        status === 'confirmed'
                          ? `${label} — Confirmed (${formatNaira(record!.grossSalary)})`
                          : status === 'pending'
                          ? `${label} — Pending confirmation`
                          : `${label} — No record`
                      }
                    >
                      <span className="text-[10px] font-medium text-neutral-500">{label}</span>
                      {status === 'confirmed' ? (
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                      ) : status === 'pending' ? (
                        <Clock className="w-4 h-4 text-amber-600" />
                      ) : (
                        <Minus className="w-4 h-4 text-neutral-300" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Totals */}
              <div className="flex items-center gap-6 text-sm border-t border-border/60 pt-3">
                <div>
                  <span className="text-neutral-500">Total Gross: </span>
                  <span className="font-semibold text-neutral-900 font-mono tabular-nums">
                    {formatNaira(group.totalGross)}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-500">Total PAYE: </span>
                  <span className="font-semibold text-neutral-900 font-mono tabular-nums">
                    {formatNaira(group.totalPaye)}
                  </span>
                </div>
              </div>

              {/* Pending records actions */}
              {group.pendingRecords.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-600">
                    Pending Confirmation
                  </p>
                  {group.pendingRecords.map((rec) => (
                    <div
                      key={rec._id}
                      className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5"
                    >
                      <div className="text-sm">
                        <span className="font-medium text-neutral-800">
                          {MONTHS[rec.month - 1]} {rec.taxYear}
                        </span>
                        <span className="text-neutral-500 ml-2">
                          {formatNaira(rec.grossSalary)} gross
                        </span>
                        {rec.source === 'detected' && (
                          <span className="ml-2 text-[10px] font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                            Auto-detected
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleConfirm(rec._id)}
                          disabled={actionLoading === rec._id}
                          className="px-3 py-1.5 text-xs font-medium text-green-700 bg-green-100 hover:bg-green-200 rounded-lg transition-colors disabled:opacity-50"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => handleReject(rec._id)}
                          disabled={actionLoading === rec._id}
                          className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-100 hover:bg-red-200 rounded-lg transition-colors disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
