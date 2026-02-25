import { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useUser, useClerk } from '@clerk/clerk-react';
import { useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import {
  LayoutDashboard,
  ArrowLeftRight,
  FileText,
  Calculator,
  FolderOpen,
  BarChart2,
  Settings,
  HelpCircle,
  Archive,
  LogOut,
  Menu,
  Bell,
  ChevronDown,
  Check,
  X,
} from 'lucide-react';
import { useEntity } from '../contexts/EntityContext';

const mainNavItems = [
  { name: 'Dashboard', href: '/app/dashboard', icon: LayoutDashboard },
  { name: 'Transactions', href: '/app/transactions', icon: ArrowLeftRight },
  { name: 'Invoices', href: '/app/invoices', icon: FileText },
  { name: 'Tax Summary', href: '/app/tax-summary', icon: Calculator },
  { name: 'Filing', href: '/app/filing', icon: FolderOpen },
  { name: 'Reports', href: '/app/reports', icon: BarChart2 },
];

const secondaryNavItems = [
  { name: 'Settings', href: '/app/settings', icon: Settings },
  { name: 'Help & Support', href: '/app/help', icon: HelpCircle },
  { name: 'Documents', href: '/app/documents', icon: Archive },
];

function getInitials(name: string | null | undefined, email: string | null | undefined): string {
  if (name) {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0][0].toUpperCase();
  }
  if (email) return email[0].toUpperCase();
  return '?';
}

function LogoutConfirmDialog({
  onConfirm,
  onCancel,
  loading,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => !loading && onCancel()}
      />
      {/* Dialog */}
      <div className="relative bg-card border border-border rounded-2xl shadow-medium w-full max-w-sm p-6 animate-slide-up">
        <button
          onClick={onCancel}
          disabled={loading}
          className="absolute top-4 right-4 p-1.5 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
            <LogOut className="w-5 h-5 text-foreground" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">Log out?</h3>
            <p className="text-xs text-muted-foreground mt-0.5">You can always sign back in</p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground mb-5">
          Are you sure you want to log out?
        </p>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-foreground bg-muted rounded-lg hover:bg-muted/80 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-neutral-800 rounded-lg hover:bg-neutral-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <LogOut className="w-4 h-4" />
                Log Out
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function SidebarContent({ onNavItemClick }: { onNavItemClick?: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useUser();
  const { signOut } = useClerk();
  const entities = useQuery(api.entityCrud.list);
  const { activeEntityId, setActiveEntityId } = useEntity();
  const [entityDropdownOpen, setEntityDropdownOpen] = useState(false);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const activeEntity = entities?.find((e) => e._id === activeEntityId);
  const fullName = user?.fullName;
  const email = user?.primaryEmailAddress?.emailAddress;
  const avatarUrl = user?.imageUrl;
  const initials = getInitials(fullName, email);

  function handleSelectEntity(id: Id<'entities'>) {
    setActiveEntityId(id);
    setEntityDropdownOpen(false);
  }

  async function handleConfirmLogout() {
    setLoggingOut(true);
    try {
      await signOut();
    } catch {
      // ignore
    }
    navigate('/');
  }

  return (
    <>
      <div className="flex flex-col h-full bg-neutral-900 text-white overflow-hidden">
        {/* Logo */}
        <div className="flex items-center h-16 px-5 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-bold leading-none">T</span>
            </div>
            <span className="font-display font-semibold text-[17px] tracking-tight">TaxEase</span>
          </div>
        </div>

        {/* User info */}
        <div className="px-4 py-4 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-3">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={fullName || 'User'}
                className="w-9 h-9 rounded-full ring-2 ring-white/20 object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                <span className="text-white text-sm font-semibold">{initials}</span>
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white truncate leading-tight">
                {fullName || 'User'}
              </p>
              <p className="text-xs text-white/50 truncate mt-0.5">{email}</p>
            </div>
          </div>
        </div>

        {/* Entity selector — only visible when user has 2+ entities */}
        {entities && entities.length >= 2 && (
          <div className="px-4 py-3 border-b border-white/10 flex-shrink-0 relative">
            <button
              onClick={() => setEntityDropdownOpen((prev) => !prev)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 transition-colors text-left"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-white/50 font-medium uppercase tracking-wider mb-0.5">
                  Active Entity
                </p>
                <p className="text-sm text-white font-medium truncate">
                  {activeEntity?.name ?? 'Select entity'}
                </p>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-white/50 flex-shrink-0 ml-2 transition-transform duration-200 ${
                  entityDropdownOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {entityDropdownOpen && (
              <div className="absolute left-4 right-4 top-full mt-1 z-50 bg-neutral-800 border border-white/10 rounded-lg shadow-medium overflow-hidden">
                {entities.map((entity) => (
                  <button
                    key={entity._id}
                    onClick={() => handleSelectEntity(entity._id)}
                    className="w-full flex items-center justify-between px-3 py-2.5 text-sm text-white hover:bg-white/10 transition-colors"
                  >
                    <span className="truncate">{entity.name}</span>
                    {entity._id === activeEntityId && (
                      <Check className="w-4 h-4 text-primary flex-shrink-0 ml-2" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Main navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {mainNavItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              location.pathname === item.href ||
              location.pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.name}
                to={item.href}
                onClick={onNavItemClick}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-[13.5px] font-medium ${
                  isActive
                    ? 'bg-primary-light text-primary'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* Divider + secondary navigation + logout */}
        <div className="px-3 pt-3 pb-4 border-t border-white/10 flex-shrink-0 space-y-0.5">
          {secondaryNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                onClick={onNavItemClick}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-[13.5px] font-medium ${
                  isActive
                    ? 'bg-primary-light text-primary'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span>{item.name}</span>
              </Link>
            );
          })}

          <button
            onClick={() => setShowLogoutDialog(true)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13.5px] font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors"
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            <span>Log Out</span>
          </button>
        </div>
      </div>

      {showLogoutDialog && (
        <LogoutConfirmDialog
          onConfirm={handleConfirmLogout}
          onCancel={() => setShowLogoutDialog(false)}
          loading={loggingOut}
        />
      )}
    </>
  );
}

export default function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop persistent sidebar */}
      <aside className="hidden md:flex flex-col w-64 flex-shrink-0 h-screen sticky top-0 shadow-medium">
        <SidebarContent />
      </aside>

      {/* Mobile overlay drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden" aria-modal="true">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          {/* Drawer panel */}
          <div className="absolute left-0 top-0 bottom-0 w-72 animate-slide-in-left shadow-medium">
            <SidebarContent onNavItemClick={() => setDrawerOpen(false)} />
            <button
              onClick={() => setDrawerOpen(false)}
              className="absolute top-4 right-3 p-1.5 rounded-full bg-white/10 text-white/70 hover:bg-white/20 transition-colors"
              aria-label="Close menu"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="sticky top-0 z-30 h-14 flex items-center justify-between px-4 md:px-6 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border bg-background/95">
          <div className="flex items-center gap-3">
            {/* Hamburger — mobile only */}
            <button
              onClick={() => setDrawerOpen(true)}
              className="md:hidden p-2 -ml-2 text-neutral-500 hover:text-neutral-900 transition-colors rounded-lg hover:bg-muted"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            {/* App title — mobile only (desktop shows logo in sidebar) */}
            <span className="font-display font-semibold text-[16px] text-neutral-900 md:hidden">
              TaxEase
            </span>
          </div>

          {/* Right: notification bell */}
          <div className="ml-auto">
            <button
              className="p-2 text-neutral-500 hover:text-neutral-900 transition-colors rounded-lg hover:bg-muted"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 md:p-6 animate-fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
