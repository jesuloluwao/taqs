import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAction, useQuery } from 'convex/react';
import { useClerk } from '@clerk/clerk-react';
import { api } from '@convex/_generated/api';
import { toast } from 'sonner';
import { AlertTriangle, ChevronLeft, Trash2, X } from 'lucide-react';

export default function DeleteAccount() {
  const navigate = useNavigate();
  const { signOut } = useClerk();
  const me = useQuery(api.userCrud.getMe);
  const deleteAccountAction = useAction(api.userCrud.deleteAccount);

  const [showDialog, setShowDialog] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [deleting, setDeleting] = useState(false);

  const userEmail = me?.email ?? '';
  const emailMatches = confirmEmail.trim().toLowerCase() === userEmail.toLowerCase();

  const handleOpenDialog = () => {
    setConfirmEmail('');
    setShowDialog(true);
  };

  const handleDelete = async () => {
    if (!emailMatches) return;

    setDeleting(true);
    try {
      await deleteAccountAction();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete account';
      toast.error(message);
      setDeleting(false);
      return;
    }

    // Clear local Clerk session
    try {
      await signOut();
    } catch {
      // Session may already be invalid after account deletion — safe to ignore
    }

    navigate('/');
  };

  if (me === undefined) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      {/* Back link */}
      <Link
        to="/app/settings"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ChevronLeft className="w-4 h-4" />
        Back to Settings
      </Link>

      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold text-foreground">Delete Account</h1>
        <p className="text-sm text-muted-foreground mt-1">
          This action is permanent and cannot be undone
        </p>
      </div>

      {/* Warning card */}
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 mb-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-red-800 mb-2">
              Permanent data deletion
            </h2>
            <p className="text-sm text-red-700 leading-relaxed mb-3">
              Deleting your account will immediately and permanently remove:
            </p>
            <ul className="space-y-1.5 text-sm text-red-700">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                Your profile, NIN, and all personal information
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                All tax entities and their transaction history
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                All invoices, reports, and filed returns
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                Connected bank accounts and preferences
              </li>
            </ul>
            <p className="text-sm font-semibold text-red-800 mt-3">
              This cannot be reversed. There is no recovery option.
            </p>
          </div>
        </div>
      </div>

      {/* Action card */}
      <div className="bg-card border border-border rounded-xl shadow-soft p-6">
        <h3 className="text-sm font-semibold text-foreground mb-1">Ready to delete?</h3>
        <p className="text-xs text-muted-foreground mb-4">
          If you're sure, click the button below. You'll be asked to confirm with your email address.
        </p>
        <button
          onClick={handleOpenDialog}
          className="flex items-center gap-2 px-4 py-2.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          Delete My Account
        </button>
      </div>

      {/* Confirmation dialog */}
      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => !deleting && setShowDialog(false)}
          />

          {/* Dialog panel */}
          <div className="relative bg-card border border-border rounded-2xl shadow-medium w-full max-w-md p-6 animate-slide-up">
            <button
              onClick={() => setShowDialog(false)}
              disabled={deleting}
              className="absolute top-4 right-4 p-1.5 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-foreground">Confirm deletion</h3>
                <p className="text-xs text-muted-foreground mt-0.5">This action is irreversible</p>
              </div>
            </div>

            <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
              To confirm, type your email address{' '}
              <span className="font-mono font-medium text-foreground">{userEmail}</span> below:
            </p>

            <input
              type="email"
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              placeholder={userEmail}
              disabled={deleting}
              autoFocus
              className="w-full text-sm px-3 py-2.5 bg-background border border-border rounded-lg focus:ring-2 focus:ring-red-500/30 focus:border-red-500 outline-none placeholder:text-muted-foreground mb-4 disabled:opacity-50"
            />

            <div className="flex gap-3">
              <button
                onClick={() => setShowDialog(false)}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-foreground bg-muted rounded-lg hover:bg-muted/80 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={!emailMatches || deleting}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {deleting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Deleting…
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Delete Account
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
