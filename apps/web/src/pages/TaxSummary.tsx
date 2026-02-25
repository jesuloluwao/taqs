import { Calculator } from 'lucide-react';

export default function TaxSummary() {
  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-heading-xl font-display text-neutral-900">Tax Summary</h1>
        <p className="text-body-sm text-neutral-500 mt-0.5">
          View your calculated tax liability under NTA 2025
        </p>
      </div>

      <div className="bg-white rounded-xl border border-border shadow-soft overflow-hidden">
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center animate-slide-up">
          <div className="w-16 h-16 rounded-2xl bg-primary-light flex items-center justify-center mb-4">
            <Calculator className="w-8 h-8 text-primary" strokeWidth={1.5} />
          </div>
          <p className="text-heading-md text-neutral-900 mb-1">No tax data yet</p>
          <p className="text-body-sm text-neutral-500 mb-5 max-w-xs">
            Add transactions to see your tax position, PIT brackets, and estimated liability under NTA 2025.
          </p>
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-light text-primary text-body-sm font-medium">
            Coming soon
          </span>
        </div>
      </div>
    </div>
  );
}
