import { Outlet, Link, useLocation } from 'react-router-dom';
import { useUser, SignOutButton } from '@clerk/clerk-react';
import {
  LayoutDashboard,
  TrendingUp,
  TrendingDown,
  FileText,
  Settings,
  LogOut,
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/app/dashboard', icon: LayoutDashboard },
  { name: 'Income', href: '/app/income', icon: TrendingUp },
  { name: 'Expenses', href: '/app/expenses', icon: TrendingDown },
  { name: 'Reports', href: '/app/reports', icon: FileText },
  { name: 'Settings', href: '/app/settings', icon: Settings },
];

export default function AppShell() {
  const location = useLocation();
  const { user } = useUser();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="fixed inset-y-0 left-0 w-64 bg-white border-r border-gray-200">
        <div className="flex flex-col h-full">
          <div className="flex items-center h-16 px-6 border-b border-gray-200">
            <Link to="/app/dashboard" className="text-xl font-bold text-green-600">
              TaxAssist NG
            </Link>
          </div>
          <nav className="flex-1 px-4 py-6 space-y-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-green-50 text-green-700 font-medium'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Main content */}
      <div className="pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-10 bg-white border-b border-gray-200">
          <div className="flex items-center justify-between h-16 px-6">
            <div className="flex-1"></div>
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-700">
                {user?.primaryEmailAddress?.emailAddress}
              </div>
              <div className="flex items-center gap-2">
                {user?.imageUrl && (
                  <img
                    src={user.imageUrl}
                    alt={user.fullName || 'User'}
                    className="w-8 h-8 rounded-full"
                  />
                )}
                <SignOutButton>
                  <button className="p-2 text-gray-600 hover:text-gray-900">
                    <LogOut className="w-5 h-5" />
                  </button>
                </SignOutButton>
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

