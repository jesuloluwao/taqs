import { useState, useMemo } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import { useEntity } from '../contexts/EntityContext';
import { Skeleton } from '../components/Skeleton';
import { toast } from 'sonner';
import type { Id } from '@convex/_generated/dataModel';
import {
  Plus,
  Search,
  X,
  Mail,
  MapPin,
  Trash2,
  Pencil,
  Users,
  ChevronRight,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type Currency = 'NGN' | 'USD' | 'GBP' | 'EUR';
type WhtRate = 0 | 5 | 10;

interface Client {
  _id: Id<'clients'>;
  name: string;
  email?: string;
  address?: string;
  currency?: Currency;
  whtRate?: number;
  createdAt: number;
}

interface ClientFormData {
  name: string;
  email: string;
  address: string;
  currency: Currency;
  whtRate: WhtRate;
}

const DEFAULT_FORM: ClientFormData = {
  name: '',
  email: '',
  address: '',
  currency: 'NGN',
  whtRate: 0,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const WHT_OPTIONS: WhtRate[] = [0, 5, 10];
const CURRENCY_OPTIONS: Currency[] = ['NGN', 'USD', 'GBP', 'EUR'];

const CURRENCY_LABELS: Record<Currency, string> = {
  NGN: '₦ NGN — Nigerian Naira',
  USD: '$ USD — US Dollar',
  GBP: '£ GBP — British Pound',
  EUR: '€ EUR — Euro',
};

// ── Client Form Modal ─────────────────────────────────────────────────────────

interface ClientFormModalProps {
  title: string;
  initial: ClientFormData;
  onSubmit: (data: ClientFormData) => Promise<void>;
  onClose: () => void;
  loading: boolean;
}

function ClientFormModal({ title, initial, onSubmit, onClose, loading }: ClientFormModalProps) {
  const [form, setForm] = useState<ClientFormData>(initial);
  const [nameError, setNameError] = useState('');

  function setField<K extends keyof ClientFormData>(key: K, value: ClientFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key === 'name') setNameError('');
  }

  async function handleSubmit() {
    if (!form.name.trim()) {
      setNameError('Client name is required');
      return;
    }
    await onSubmit(form);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-border px-5 py-4 flex items-center justify-between z-10">
          <p className="text-heading-sm font-semibold text-neutral-900">{title}</p>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-neutral-100 transition-colors"
          >
            <X className="w-4 h-4 text-neutral-600" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-body-xs font-medium text-neutral-700 mb-1">
              Client Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              placeholder="e.g. Acme Ltd"
              className={`w-full px-3 py-2.5 rounded-lg border text-body-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary ${
                nameError ? 'border-red-400' : 'border-border'
              }`}
            />
            {nameError && <p className="text-xs text-red-500 mt-1">{nameError}</p>}
          </div>

          {/* Email */}
          <div>
            <label className="block text-body-xs font-medium text-neutral-700 mb-1">
              Email Address
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setField('email', e.target.value)}
              placeholder="billing@client.com"
              className="w-full px-3 py-2.5 rounded-lg border border-border text-body-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>

          {/* Address */}
          <div>
            <label className="block text-body-xs font-medium text-neutral-700 mb-1">
              Address
            </label>
            <textarea
              rows={3}
              value={form.address}
              onChange={(e) => setField('address', e.target.value)}
              placeholder="123 Main Street, Lagos"
              className="w-full px-3 py-2.5 rounded-lg border border-border text-body-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
            />
          </div>

          {/* Currency + WHT Rate row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-body-xs font-medium text-neutral-700 mb-1">
                Default Currency
              </label>
              <select
                value={form.currency}
                onChange={(e) => setField('currency', e.target.value as Currency)}
                className="w-full px-3 py-2.5 rounded-lg border border-border text-body-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-white"
              >
                {CURRENCY_OPTIONS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-body-xs font-medium text-neutral-700 mb-1">
                Default WHT Rate
              </label>
              <select
                value={form.whtRate}
                onChange={(e) => setField('whtRate', Number(e.target.value) as WhtRate)}
                className="w-full px-3 py-2.5 rounded-lg border border-border text-body-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-white"
              >
                {WHT_OPTIONS.map((r) => (
                  <option key={r} value={r}>{r}%</option>
                ))}
              </select>
            </div>
          </div>

          {/* Currency hint */}
          <p className="text-body-xs text-neutral-400">
            {CURRENCY_LABELS[form.currency]}
          </p>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-border px-5 py-4 flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-lg border border-border text-body-sm text-neutral-700 hover:bg-neutral-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-lg bg-primary text-white text-body-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? 'Saving…' : 'Save Client'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Delete Confirmation Dialog ────────────────────────────────────────────────

function DeleteConfirmDialog({
  clientName,
  onConfirm,
  onClose,
  loading,
}: {
  clientName: string;
  onConfirm: () => void;
  onClose: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-6 shadow-xl animate-slide-up">
        <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center mb-3">
          <Trash2 className="w-5 h-5 text-red-600" />
        </div>
        <p className="text-heading-sm font-semibold text-neutral-900 mb-1">Delete Client</p>
        <p className="text-body-sm text-neutral-600 mb-1">
          Are you sure you want to delete <strong>{clientName}</strong>?
        </p>
        <p className="text-body-xs text-neutral-400 mb-5">
          Existing invoices for this client are not affected — their client details are preserved.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-lg border border-border text-body-sm text-neutral-700 hover:bg-neutral-50 transition-colors disabled:opacity-50"
          >
            Keep Client
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 text-white text-body-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {loading ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Client Card ───────────────────────────────────────────────────────────────

function ClientCard({
  client,
  onEdit,
  onDelete,
}: {
  client: Client;
  onEdit: (client: Client) => void;
  onDelete: (client: Client) => void;
}) {
  const whtLabel = client.whtRate !== undefined && client.whtRate > 0
    ? `WHT ${client.whtRate}%`
    : null;
  const currencyLabel = client.currency ?? 'NGN';

  return (
    <div className="flex items-center justify-between px-4 py-3.5 border-b border-border last:border-0 group">
      <div className="flex items-center gap-3 flex-1 min-w-0 mr-2">
        {/* Avatar */}
        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
          <span className="text-sm font-semibold text-primary">{client.name.charAt(0).toUpperCase()}</span>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-body-sm font-semibold text-neutral-900 truncate">{client.name}</p>
          <div className="flex items-center gap-2 flex-wrap mt-0.5">
            {client.email && (
              <span className="flex items-center gap-1 text-body-xs text-neutral-500 truncate max-w-[200px]">
                <Mail className="w-3 h-3 flex-shrink-0" />
                {client.email}
              </span>
            )}
            <span className="text-body-xs text-neutral-400">{currencyLabel}</span>
            {whtLabel && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-xs font-medium">
                {whtLabel}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Actions — appear on hover on desktop */}
      <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onEdit(client)}
          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-neutral-100 transition-colors"
          title="Edit client"
        >
          <Pencil className="w-3.5 h-3.5 text-neutral-500" />
        </button>
        <button
          onClick={() => onDelete(client)}
          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-red-50 transition-colors"
          title="Delete client"
        >
          <Trash2 className="w-3.5 h-3.5 text-red-400" />
        </button>
        <ChevronRight className="w-4 h-4 text-neutral-300 ml-1" />
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function Clients() {
  const { activeEntityId } = useEntity();

  const clients = useQuery(
    (api as any).clients.list,
    activeEntityId ? { entityId: activeEntityId } : 'skip'
  ) as Client[] | undefined;

  const createMutation = useMutation((api as any).clients.create);
  const updateMutation = useMutation((api as any).clients.update);
  const removeMutation = useMutation((api as any).clients.remove);

  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [deletingClient, setDeletingClient] = useState<Client | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const isLoading = clients === undefined && activeEntityId !== null;

  // Alphabetical + search filter
  const filtered = useMemo(() => {
    if (!clients) return [];
    if (!search.trim()) return clients;
    const q = search.toLowerCase();
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.email ?? '').toLowerCase().includes(q)
    );
  }, [clients, search]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleCreate(data: ClientFormData) {
    if (!activeEntityId) return;
    setFormLoading(true);
    try {
      await createMutation({
        entityId: activeEntityId,
        name: data.name.trim(),
        email: data.email.trim() || undefined,
        address: data.address.trim() || undefined,
        currency: data.currency,
        whtRate: data.whtRate,
      });
      toast.success(`Client "${data.name}" created`);
      setShowForm(false);
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to create client');
    } finally {
      setFormLoading(false);
    }
  }

  async function handleUpdate(data: ClientFormData) {
    if (!editingClient) return;
    setFormLoading(true);
    try {
      await updateMutation({
        id: editingClient._id,
        name: data.name.trim(),
        email: data.email.trim() || undefined,
        address: data.address.trim() || undefined,
        currency: data.currency,
        whtRate: data.whtRate,
      });
      toast.success(`Client updated`);
      setEditingClient(null);
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to update client');
    } finally {
      setFormLoading(false);
    }
  }

  async function handleDelete() {
    if (!deletingClient) return;
    setDeleteLoading(true);
    try {
      await removeMutation({ id: deletingClient._id });
      toast.success(`Client deleted`);
      setDeletingClient(null);
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to delete client');
    } finally {
      setDeleteLoading(false);
    }
  }

  function openEdit(client: Client) {
    setEditingClient(client);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const totalCount = clients?.length ?? 0;

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-heading-xl font-display text-neutral-900">Clients</h1>
          <p className="text-body-sm text-neutral-500 mt-0.5">
            {isLoading ? 'Loading…' : `${totalCount} client${totalCount !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-body-sm font-medium hover:bg-primary/90 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          New Client
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search clients…"
          className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-border bg-white text-body-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Client List */}
      <div className="bg-white rounded-xl border border-border shadow-soft overflow-hidden">
        {isLoading ? (
          <>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3.5 border-b border-border last:border-0">
                <Skeleton className="w-9 h-9 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-36 rounded" />
                  <Skeleton className="h-3 w-52 rounded" />
                </div>
              </div>
            ))}
          </>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center animate-slide-up">
            <div className="w-14 h-14 rounded-2xl bg-primary-light flex items-center justify-center mb-4">
              <Users className="w-7 h-7 text-primary" strokeWidth={1.5} />
            </div>
            <p className="text-heading-md text-neutral-900 mb-1">
              {search ? 'No clients match your search' : 'No clients yet'}
            </p>
            <p className="text-body-sm text-neutral-500 mb-5 max-w-xs">
              {search
                ? 'Try a different search term.'
                : 'Add your clients to quickly fill in their details when creating invoices.'}
            </p>
            {!search && (
              <button
                onClick={() => setShowForm(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-body-sm font-medium hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add First Client
              </button>
            )}
          </div>
        ) : (
          <>
            {filtered.map((client) => (
              <ClientCard
                key={client._id}
                client={client}
                onEdit={openEdit}
                onDelete={(c) => setDeletingClient(c)}
              />
            ))}
            {/* Footer count */}
            {!search && filtered.length > 0 && (
              <div className="border-t border-border px-4 py-3 text-center">
                <p className="text-body-xs text-neutral-400">
                  {filtered.length} client{filtered.length !== 1 ? 's' : ''} in directory
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Address Note ─────────────────────────────────────────────────── */}
      {!isLoading && totalCount > 0 && (
        <div className="mt-3 px-1">
          <p className="text-body-xs text-neutral-400 flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            Client details (name, email) are saved on invoices at creation time, so deleting a client won't affect existing invoices.
          </p>
        </div>
      )}

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {showForm && (
        <ClientFormModal
          title="New Client"
          initial={DEFAULT_FORM}
          onSubmit={handleCreate}
          onClose={() => setShowForm(false)}
          loading={formLoading}
        />
      )}

      {editingClient && (
        <ClientFormModal
          title="Edit Client"
          initial={{
            name: editingClient.name,
            email: editingClient.email ?? '',
            address: editingClient.address ?? '',
            currency: editingClient.currency ?? 'NGN',
            whtRate: (editingClient.whtRate ?? 0) as WhtRate,
          }}
          onSubmit={handleUpdate}
          onClose={() => setEditingClient(null)}
          loading={formLoading}
        />
      )}

      {deletingClient && (
        <DeleteConfirmDialog
          clientName={deletingClient.name}
          onConfirm={handleDelete}
          onClose={() => setDeletingClient(null)}
          loading={deleteLoading}
        />
      )}
    </div>
  );
}
