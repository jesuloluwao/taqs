import { useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useAction } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { toast } from 'sonner';
import {
  ChevronLeft,
  Eye,
  EyeOff,
  ShieldCheck,
  AlertCircle,
  Loader2,
  Zap,
} from 'lucide-react';
import { useEntity } from '../contexts/EntityContext';

// ─── Provider Config ──────────────────────────────────────────────────────────

const PROVIDER_CONFIG: Record<
  string,
  {
    label: string;
    keyLabel: string;
    keyPrefix: string;
    docsUrl: string;
    helpText: string;
    icon: React.ReactNode;
  }
> = {
  paystack: {
    label: 'Paystack',
    keyLabel: 'Secret Key',
    keyPrefix: 'sk_',
    docsUrl: 'https://dashboard.paystack.com/#/settings/developers',
    helpText: 'Find your secret key in Paystack Dashboard → Settings → API Keys & Webhooks',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    ),
  },
  flutterwave: {
    label: 'Flutterwave',
    keyLabel: 'Secret Key',
    keyPrefix: 'FLWSECK',
    docsUrl: 'https://dashboard.flutterwave.com/dashboard/settings/apis',
    helpText: 'Find your secret key in Flutterwave Dashboard → Settings → API',
    icon: <Zap className="w-6 h-6" />,
  },
};

// ─── Masked Input ─────────────────────────────────────────────────────────────

function MaskedInput({
  value,
  onChange,
  placeholder,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  error?: string;
}) {
  const [show, setShow] = useState(false);

  return (
    <div>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className={`w-full text-sm px-3 py-2.5 pr-10 bg-background border rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none font-mono placeholder:font-sans placeholder:text-muted-foreground ${
            error ? 'border-destructive' : 'border-border'
          }`}
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          tabIndex={-1}
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ConnectApiKey() {
  const { provider } = useParams<{ provider: string }>();
  const [searchParams] = useSearchParams();
  const reconnectId = searchParams.get('reconnect');
  const navigate = useNavigate();
  const { activeEntityId } = useEntity();

  const addApiKeyAction = useAction((api as any).accountsActions.addApiKeyAccount);

  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const config = provider ? PROVIDER_CONFIG[provider] : null;

  if (!config || !provider) {
    return (
      <div className="max-w-xl mx-auto animate-fade-in text-center py-20">
        <AlertCircle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-foreground font-medium">Unknown provider</p>
        <button
          onClick={() => navigate('/app/settings/accounts/add')}
          className="mt-4 text-sm text-primary hover:underline"
        >
          Go back
        </button>
      </div>
    );
  }

  const validate = () => {
    if (!apiKey.trim()) {
      setError(`${config.keyLabel} is required`);
      return false;
    }
    if (apiKey.trim().length < 20) {
      setError(`${config.keyLabel} appears too short. Please check and try again.`);
      return false;
    }
    setError('');
    return true;
  };

  const handleConnect = async () => {
    if (!validate()) return;
    if (!activeEntityId) {
      toast.error('No active entity. Please select or create an entity first.');
      return;
    }

    setLoading(true);
    try {
      const result = (await addApiKeyAction({
        entityId: activeEntityId as Id<'entities'>,
        provider: provider as 'paystack' | 'flutterwave',
        apiKey: apiKey.trim(),
      })) as { connectedAccountId: string };

      toast.success(`${config.label} connected successfully`);
      navigate(`/app/settings/accounts/${result.connectedAccountId}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Connection failed';
      if (msg.toLowerCase().includes('invalid api key')) {
        setError('Invalid API key. Please check and try again.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto animate-fade-in">
      {/* Back nav */}
      <button
        onClick={() => navigate('/app/settings/accounts/add')}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-5"
      >
        <ChevronLeft className="w-4 h-4" />
        Add Account
      </button>

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center text-muted-foreground">
          {config.icon}
        </div>
        <div>
          <h1 className="text-xl font-display font-bold text-foreground">
            {reconnectId ? `Reconnect ${config.label}` : `Connect ${config.label}`}
          </h1>
          <p className="text-sm text-muted-foreground">Enter your API credentials to connect</p>
        </div>
      </div>

      {/* Form card */}
      <div className="bg-card border border-border rounded-xl shadow-soft p-5 space-y-5">
        {/* API Key input */}
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1.5">
            {config.keyLabel} *
          </label>
          <MaskedInput
            value={apiKey}
            onChange={(v) => {
              setApiKey(v);
              if (error) setError('');
            }}
            placeholder={`${config.keyPrefix}...`}
            error={error}
          />
          <p className="text-xs text-muted-foreground mt-1.5">{config.helpText}</p>
        </div>

        {/* Security callout */}
        <div className="flex items-start gap-3 bg-primary/5 border border-primary/20 rounded-lg p-3.5">
          <ShieldCheck className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-primary">End-to-end encrypted</p>
            <p className="text-xs text-primary/80 mt-0.5">
              Your API key is encrypted with AES-256-GCM before storage. It is never shared with
              third parties or transmitted in plaintext.
            </p>
          </div>
        </div>

        {/* Read-only permission note */}
        <div className="flex items-start gap-3 bg-muted/60 rounded-lg p-3.5">
          <AlertCircle className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            TaxEase only reads your transaction history. We never initiate payouts or modify your
            account settings.
          </p>
        </div>
      </div>

      {/* Connect button */}
      <button
        onClick={handleConnect}
        disabled={loading || !apiKey.trim()}
        className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-3 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 shadow-soft"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Validating…
          </>
        ) : (
          `Connect ${config.label}`
        )}
      </button>

      <p className="text-xs text-muted-foreground text-center mt-3">
        By connecting, you agree to TaxEase accessing your transaction data.
      </p>
    </div>
  );
}
