import { useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';

function formatKoboToNaira(kobo: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 2,
  }).format(kobo / 100);
}

export default function Dashboard() {
  const summary = useQuery(api.queries.getDashboardSummary);

  if (summary === undefined) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (summary === null) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Please sign in to view your dashboard.</div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-sm font-medium text-gray-600 mb-2">
            Monthly Income
          </h3>
          <p className="text-2xl font-bold text-green-600">
            {formatKoboToNaira(summary.monthlyIncome)}
          </p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-sm font-medium text-gray-600 mb-2">
            Monthly Expenses
          </h3>
          <p className="text-2xl font-bold text-red-600">
            {formatKoboToNaira(summary.monthlyExpense)}
          </p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-sm font-medium text-gray-600 mb-2">
            Year-to-Date Income
          </h3>
          <p className="text-2xl font-bold text-green-600">
            {formatKoboToNaira(summary.ytdIncome)}
          </p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-sm font-medium text-gray-600 mb-2">
            Year-to-Date Expenses
          </h3>
          <p className="text-2xl font-bold text-red-600">
            {formatKoboToNaira(summary.ytdExpense)}
          </p>
        </div>
      </div>

      <div className="mt-8 bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <a
            href="/app/income"
            className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <h3 className="font-medium text-gray-900 mb-1">Add Income</h3>
            <p className="text-sm text-gray-600">Record a new income transaction</p>
          </a>
          <a
            href="/app/expenses"
            className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <h3 className="font-medium text-gray-900 mb-1">Add Expense</h3>
            <p className="text-sm text-gray-600">Record a new expense transaction</p>
          </a>
          <a
            href="/app/reports"
            className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <h3 className="font-medium text-gray-900 mb-1">Generate Report</h3>
            <p className="text-sm text-gray-600">View tax reports and summaries</p>
          </a>
        </div>
      </div>
    </div>
  );
}

