import { TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Income() {
  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-heading-xl font-display text-neutral-900">Income</h1>
        <p className="text-body-sm text-neutral-500 mt-0.5">
          View and manage your income transactions
        </p>
      </div>

      <div className="bg-white rounded-xl border border-border shadow-soft overflow-hidden">
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center animate-slide-up">
          <div className="w-16 h-16 rounded-2xl bg-primary-light flex items-center justify-center mb-4">
            <TrendingUp className="w-8 h-8 text-primary" strokeWidth={1.5} />
          </div>
          <p className="text-heading-md text-neutral-900 mb-1">Income tracking coming soon</p>
          <p className="text-body-sm text-neutral-500 mb-5 max-w-xs">
            Import a bank statement or add income transactions to track your earnings.
          </p>
          <Link
            to="/app/transactions"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-body-sm font-medium hover:bg-primary/90 transition-colors shadow-soft"
          >
            Go to Transactions
          </Link>
        </div>
      </div>
    </div>
  );
}
