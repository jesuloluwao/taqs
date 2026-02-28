import { useNavigate, Link } from 'react-router-dom';
import {
  ChevronLeft,
  Building2,
  CreditCard,
  Zap,
  Globe,
  UploadCloud,
  ChevronRight,
} from 'lucide-react';

// ─── Method Card ──────────────────────────────────────────────────────────────

interface MethodCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: string;
  onClick?: () => void;
  disabled?: boolean;
}

function MethodCard({ icon, title, description, badge, onClick, disabled }: MethodCardProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-4 p-4 rounded-xl border border-border bg-card text-left transition-all ${
        disabled
          ? 'opacity-60 cursor-not-allowed'
          : 'hover:border-primary/50 hover:bg-primary/5 hover:shadow-soft active:scale-[0.99]'
      }`}
    >
      {/* Icon */}
      <div className="w-11 h-11 rounded-xl bg-muted flex items-center justify-center flex-shrink-0 text-muted-foreground">
        {icon}
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{title}</span>
          {badge && (
            <span className="text-[10px] font-medium bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
              {badge}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>

      {/* Arrow */}
      {!disabled && <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AddAccount() {
  const navigate = useNavigate();

  return (
    <div className="max-w-xl mx-auto animate-fade-in">
      {/* Back nav */}
      <button
        onClick={() => navigate('/app/settings/accounts')}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-5"
      >
        <ChevronLeft className="w-4 h-4" />
        Connected Accounts
      </button>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold text-foreground">Add Account</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Choose how you want to connect your account
        </p>
      </div>

      {/* Method groups */}
      <div className="space-y-6">
        {/* Nigerian banks */}
        <div>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Nigerian Banks
          </h2>
          <div className="space-y-2">
            <MethodCard
              icon={<Building2 className="w-5 h-5" />}
              title="Connect Bank Account"
              description="Link GTBank, Access, Zenith, UBA and more via open banking"
              badge="Coming soon"
              disabled
            />
          </div>
        </div>

        {/* Payment gateways */}
        <div>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Payment Gateways
          </h2>
          <div className="space-y-2">
            <MethodCard
              icon={
                <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
              }
              title="Connect Paystack"
              description="Import payment records from your Paystack business account"
              onClick={() => navigate('/app/settings/accounts/connect/paystack')}
            />
            <MethodCard
              icon={<Zap className="w-5 h-5" />}
              title="Connect Flutterwave"
              description="Import transactions from your Flutterwave merchant account"
              onClick={() => navigate('/app/settings/accounts/connect/flutterwave')}
            />
          </div>
        </div>

        {/* International platforms */}
        <div>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            International Platforms
          </h2>
          <div className="space-y-2">
            <MethodCard
              icon={<CreditCard className="w-5 h-5" />}
              title="Connect Payoneer"
              description="Import cross-border income from your Payoneer account"
              badge="Coming soon"
              disabled
            />
            <MethodCard
              icon={<Globe className="w-5 h-5" />}
              title="Connect Wise"
              description="Import multi-currency transfers from your Wise account"
              badge="Coming soon"
              disabled
            />
          </div>
        </div>

        {/* Manual / upload */}
        <div>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Manual
          </h2>
          <div className="space-y-2">
            <MethodCard
              icon={<UploadCloud className="w-5 h-5" />}
              title="Upload Bank Statement"
              description="Import transactions from a PDF or CSV bank statement"
              onClick={() => navigate('/app/import')}
            />
          </div>
        </div>
      </div>

      {/* Footer note */}
      <p className="text-xs text-muted-foreground mt-8 text-center">
        All connections are secured with AES-256-GCM encryption.{' '}
        <Link to="/app/help" className="text-primary hover:underline">
          Learn more
        </Link>
      </p>
    </div>
  );
}
