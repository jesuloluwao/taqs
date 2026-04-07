import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { useEntity } from '../contexts/EntityContext';
import { toast } from 'sonner';
import { ArrowLeft, Save, ChevronRight, CheckCircle2 } from 'lucide-react';

// ─── helpers ─────────────────────────────────────────────────────────────────

function ngnToKobo(ngn: string): number {
  const n = parseFloat(ngn.replace(/,/g, ''));
  if (isNaN(n) || n < 0) return 0;
  return Math.round(n * 100);
}

function koboToNgn(kobo: number | undefined): string {
  if (kobo === undefined || kobo === 0) return '';
  return (kobo / 100).toLocaleString('en-NG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const CURRENT_YEAR = new Date().getFullYear();
const TAX_YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];

// ─── component ───────────────────────────────────────────────────────────────

export default function PayslipEntry() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { entity } = useEntity();

  // URL params for pre-fill
  const paramEntityId = searchParams.get('entityId');
  const paramTaxYear = searchParams.get('taxYear');
  const paramMonth = searchParams.get('month');
  const paramEmployer = searchParams.get('employer');
  const paramRecordId = searchParams.get('recordId');

  const entityId = (paramEntityId ?? entity?._id) as Id<'entities'> | undefined;

  // Form state
  const [employerName, setEmployerName] = useState(paramEmployer ?? '');
  const [month, setMonth] = useState(paramMonth ? parseInt(paramMonth) : new Date().getMonth() + 1);
  const [taxYear, setTaxYear] = useState(paramTaxYear ? parseInt(paramTaxYear) : CURRENT_YEAR);
  const [grossSalary, setGrossSalary] = useState('');
  const [payeDeducted, setPayeDeducted] = useState('');
  const [pensionDeducted, setPensionDeducted] = useState('');
  const [nhisDeducted, setNhisDeducted] = useState('');
  const [nhfDeducted, setNhfDeducted] = useState('');
  const [netSalary, setNetSalary] = useState('');
  const [saving, setSaving] = useState(false);

  // Fetch existing record if recordId provided
  const existingRecord = useQuery(
    api.employmentIncome.get,
    paramRecordId ? { id: paramRecordId as Id<'employmentIncomeRecords'> } : 'skip'
  );

  // Pre-fill from existing record
  useEffect(() => {
    if (!existingRecord) return;
    setEmployerName(existingRecord.employerName);
    setMonth(existingRecord.month);
    setTaxYear(existingRecord.taxYear);
    setGrossSalary(koboToNgn(existingRecord.grossSalary));
    setPayeDeducted(koboToNgn(existingRecord.payeDeducted));
    setPensionDeducted(koboToNgn(existingRecord.pensionDeducted));
    setNhisDeducted(koboToNgn(existingRecord.nhisDeducted));
    setNhfDeducted(koboToNgn(existingRecord.nhfDeducted));
    setNetSalary(koboToNgn(existingRecord.netSalary));
  }, [existingRecord]);

  const createOrUpdate = useMutation(api.employmentIncome.createOrUpdate);

  async function handleSave(addNext: boolean) {
    if (!entityId || !employerName.trim() || !grossSalary) {
      toast.error('Please fill in employer name and gross salary');
      return;
    }

    setSaving(true);
    try {
      await createOrUpdate({
        entityId,
        taxYear,
        month,
        employerName: employerName.trim(),
        grossSalary: ngnToKobo(grossSalary),
        payeDeducted: ngnToKobo(payeDeducted),
        pensionDeducted: pensionDeducted ? ngnToKobo(pensionDeducted) : undefined,
        nhisDeducted: nhisDeducted ? ngnToKobo(nhisDeducted) : undefined,
        nhfDeducted: nhfDeducted ? ngnToKobo(nhfDeducted) : undefined,
        netSalary: netSalary ? ngnToKobo(netSalary) : undefined,
        transactionId: existingRecord?.transactionId,
        source: 'payslip',
      });

      toast.success(`Payslip saved for ${MONTHS[month - 1]} ${taxYear}`);

      if (addNext) {
        // Increment month, wrap year
        if (month === 12) {
          setMonth(1);
          setTaxYear((y) => y + 1);
        } else {
          setMonth((m) => m + 1);
        }
        // Clear amount fields
        setGrossSalary('');
        setPayeDeducted('');
        setPensionDeducted('');
        setNhisDeducted('');
        setNhfDeducted('');
        setNetSalary('');
      } else {
        navigate('/app/employment-income');
      }
    } catch (err) {
      console.error('Failed to save payslip:', err);
      toast.error('Failed to save payslip');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-neutral-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-neutral-500" />
        </button>
        <div>
          <h1 className="text-heading-lg font-display text-neutral-900">
            {existingRecord ? 'Edit Payslip' : 'Add Payslip'}
          </h1>
          <p className="text-body-sm text-neutral-500">
            Record your monthly salary details
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="bg-white rounded-2xl shadow-soft border border-border p-6 space-y-5">
        {/* Employer Name */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1.5">
            Employer Name
          </label>
          <input
            type="text"
            value={employerName}
            onChange={(e) => setEmployerName(e.target.value)}
            placeholder="e.g. ABC Company Ltd"
            className="w-full h-11 px-3 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
          />
        </div>

        {/* Month and Year */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">Month</label>
            <select
              value={month}
              onChange={(e) => setMonth(parseInt(e.target.value))}
              className="w-full h-11 px-3 border border-neutral-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              {MONTHS.map((m, i) => (
                <option key={i + 1} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">Tax Year</label>
            <select
              value={taxYear}
              onChange={(e) => setTaxYear(parseInt(e.target.value))}
              className="w-full h-11 px-3 border border-neutral-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              {TAX_YEARS.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Gross Salary */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1.5">
            Gross Salary <span className="text-danger">*</span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400">₦</span>
            <input
              type="text"
              inputMode="numeric"
              value={grossSalary}
              onChange={(e) => setGrossSalary(e.target.value)}
              placeholder="0"
              className="w-full h-11 pl-7 pr-3 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
            />
          </div>
        </div>

        {/* PAYE Deducted */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1.5">
            PAYE Deducted <span className="text-danger">*</span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400">₦</span>
            <input
              type="text"
              inputMode="numeric"
              value={payeDeducted}
              onChange={(e) => setPayeDeducted(e.target.value)}
              placeholder="0"
              className="w-full h-11 pl-7 pr-3 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
            />
          </div>
        </div>

        {/* Optional deductions section */}
        <div className="border-t border-neutral-100 pt-4">
          <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-4">
            Deductions at source (optional)
          </p>

          <div className="space-y-4">
            {/* Pension */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">Pension</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400">₦</span>
                <input type="text" inputMode="numeric" value={pensionDeducted} onChange={(e) => setPensionDeducted(e.target.value)} placeholder="0" className="w-full h-11 pl-7 pr-3 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors" />
              </div>
            </div>

            {/* NHIS */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">NHIS</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400">₦</span>
                <input type="text" inputMode="numeric" value={nhisDeducted} onChange={(e) => setNhisDeducted(e.target.value)} placeholder="0" className="w-full h-11 pl-7 pr-3 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors" />
              </div>
            </div>

            {/* NHF */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">NHF</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400">₦</span>
                <input type="text" inputMode="numeric" value={nhfDeducted} onChange={(e) => setNhfDeducted(e.target.value)} placeholder="0" className="w-full h-11 pl-7 pr-3 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors" />
              </div>
            </div>

            {/* Net Salary */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                Net Salary <span className="text-neutral-400 text-xs">(for reconciliation)</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400">₦</span>
                <input type="text" inputMode="numeric" value={netSalary} onChange={(e) => setNetSalary(e.target.value)} placeholder="0" className="w-full h-11 pl-7 pr-3 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors" />
              </div>
            </div>
          </div>
        </div>

        {/* Linked transaction indicator */}
        {existingRecord?.transactionId && (
          <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
            <CheckCircle2 className="w-4 h-4" />
            Linked to bank transaction
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          onClick={() => handleSave(false)}
          disabled={saving}
          className="flex-1 h-11 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white font-medium rounded-xl transition-all flex items-center justify-center gap-2"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button
          onClick={() => handleSave(true)}
          disabled={saving}
          className="flex-1 h-11 bg-white border border-primary text-primary hover:bg-primary/5 disabled:opacity-50 font-medium rounded-xl transition-all flex items-center justify-center gap-2"
        >
          Save & Next Month
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
