import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { toast } from 'sonner';
import { Skeleton } from '../components/Skeleton';
import {
  Building2,
  Plus,
  ChevronRight,
  ChevronLeft,
  Star,
  Trash2,
  Edit2,
  Save,
  Check,
  AlertTriangle,
  User,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type EntityType = 'individual' | 'business_name' | 'llc';

interface EntityData {
  name: string;
  type: EntityType;
  tin: string;
  rcNumber: string;
  vatRegistered: boolean;
  vatThresholdExceeded: boolean;
}

type ViewState = 'list' | 'create' | 'detail';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  individual: 'Individual',
  business_name: 'Business Name',
  llc: 'Limited Liability Company (LLC)',
};

const ENTITY_TYPE_SHORT: Record<EntityType, string> = {
  individual: 'Individual',
  business_name: 'Business Name',
  llc: 'LLC',
};

function getTaxYear(taxYearStart?: number): string {
  if (taxYearStart) {
    const d = new Date(taxYearStart);
    return String(d.getFullYear());
  }
  // Default to current tax year (NTA 2025 — calendar year)
  return String(new Date().getFullYear());
}

function entityTypeColor(type: EntityType): string {
  switch (type) {
    case 'individual':
      return 'bg-blue-100 text-blue-700';
    case 'business_name':
      return 'bg-amber-100 text-amber-700';
    case 'llc':
      return 'bg-purple-100 text-purple-700';
  }
}

function emptyForm(): EntityData {
  return {
    name: '',
    type: 'individual',
    tin: '',
    rcNumber: '',
    vatRegistered: false,
    vatThresholdExceeded: false,
  };
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
          checked ? 'bg-primary' : 'bg-neutral-200'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

function EntityTypeSelector({
  value,
  onChange,
}: {
  value: EntityType;
  onChange: (v: EntityType) => void;
}) {
  const types: EntityType[] = ['individual', 'business_name', 'llc'];
  const icons: Record<EntityType, React.ReactNode> = {
    individual: <User className="w-4 h-4" />,
    business_name: <Building2 className="w-4 h-4" />,
    llc: <Building2 className="w-4 h-4" />,
  };

  return (
    <div className="grid grid-cols-1 gap-2">
      {types.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-colors ${
            value === t
              ? 'border-primary bg-primary-light text-primary'
              : 'border-border bg-background text-foreground hover:border-primary/40'
          }`}
        >
          <span className={value === t ? 'text-primary' : 'text-muted-foreground'}>
            {icons[t]}
          </span>
          <span className="text-sm font-medium">{ENTITY_TYPE_LABELS[t]}</span>
          {value === t && <Check className="w-4 h-4 ml-auto text-primary" />}
        </button>
      ))}
    </div>
  );
}

function FormField({
  label,
  value,
  onChange,
  placeholder,
  error,
  required,
  hint,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
  required?: boolean;
  hint?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      <input
        type="text"
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full text-sm px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none placeholder:text-muted-foreground"
      />
      {hint && !error && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
    </div>
  );
}

// ─── Entity Form ─────────────────────────────────────────────────────────────

function EntityForm({
  initial,
  onSave,
  onCancel,
  saving,
  title,
  submitLabel,
}: {
  initial: EntityData;
  onSave: (data: EntityData) => void;
  onCancel: () => void;
  saving: boolean;
  title: string;
  submitLabel: string;
}) {
  const [form, setForm] = useState<EntityData>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function set<K extends keyof EntityData>(key: K, value: EntityData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => { const next = { ...prev }; delete next[key]; return next; });
  }

  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    if (!form.name.trim()) newErrors.name = 'Entity name is required';
    if (form.type === 'llc' && !form.rcNumber.trim()) {
      newErrors.rcNumber = 'RC Number is required for LLCs';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    onSave(form);
  }

  const showRcNumber = form.type === 'business_name' || form.type === 'llc';

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold font-display text-foreground">{title}</h2>

      <div className="space-y-5">
        {/* Entity Type */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Entity Type<span className="text-destructive ml-0.5">*</span>
          </label>
          <EntityTypeSelector value={form.type} onChange={(v) => set('type', v)} />
        </div>

        {/* Name */}
        <FormField
          label="Entity Name"
          value={form.name}
          onChange={(v) => set('name', v)}
          placeholder={
            form.type === 'individual'
              ? 'e.g. John Doe'
              : form.type === 'business_name'
              ? 'e.g. Acme Trading'
              : 'e.g. Acme Tech Ltd'
          }
          error={errors.name}
          required
        />

        {/* TIN */}
        <FormField
          label="FIRS TIN"
          value={form.tin}
          onChange={(v) => set('tin', v)}
          placeholder="e.g. 1234567890"
          inputMode="numeric"
          hint="Tax Identification Number issued by FIRS"
        />

        {/* RC Number — only for business_name and LLC */}
        {showRcNumber && (
          <FormField
            label="RC Number"
            value={form.rcNumber}
            onChange={(v) => set('rcNumber', v)}
            placeholder="e.g. RC-1234567"
            error={errors.rcNumber}
            required={form.type === 'llc'}
            hint={form.type === 'llc' ? 'Required for LLC entities' : 'CAC Registration Number'}
          />
        )}

        {/* VAT Registered */}
        <Toggle
          checked={form.vatRegistered}
          onChange={(v) => set('vatRegistered', v)}
          label="VAT Registered"
          description="Entity is registered for Value Added Tax (7.5%) with FIRS"
        />

        {/* VAT Threshold Exceeded — only if VAT registered */}
        {form.vatRegistered && (
          <Toggle
            checked={form.vatThresholdExceeded}
            onChange={(v) => set('vatThresholdExceeded', v)}
            label="VAT Threshold Exceeded"
            description="Annual turnover exceeds ₦25m VAT registration threshold"
          />
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-2.5 text-sm font-medium text-muted-foreground border border-border rounded-lg hover:bg-muted transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving…' : submitLabel}
        </button>
      </div>
    </div>
  );
}

// ─── Delete Confirmation ──────────────────────────────────────────────────────

function DeleteDialog({
  entityName,
  onConfirm,
  onCancel,
  deleting,
}: {
  entityName: string;
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl shadow-medium w-full max-w-sm p-6 animate-slide-up">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <h3 className="font-semibold text-foreground">Delete {entityName}?</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          All transactions and invoices will be preserved but no longer editable. This action cannot
          be undone.
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-muted-foreground border border-border rounded-lg hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="flex-1 px-4 py-2.5 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TaxEntities() {
  const entities = useQuery(api.entityCrud.list);

  const createEntity = useMutation(api.entityCrud.create);
  const updateEntity = useMutation(api.entityCrud.update);
  const setDefaultEntity = useMutation(api.entityCrud.setDefault);
  const removeEntity = useMutation(api.entityCrud.remove);

  const [view, setView] = useState<ViewState>('list');
  const [selectedId, setSelectedId] = useState<Id<'entities'> | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const selectedEntity = entities?.find((e) => e._id === selectedId) ?? null;

  // ── Create ──────────────────────────────────────────────────────────────────

  async function handleCreate(data: EntityData) {
    setSaving(true);
    try {
      await createEntity({
        name: data.name.trim(),
        type: data.type,
        tin: data.tin.trim() || undefined,
        rcNumber: data.rcNumber.trim() || undefined,
        vatRegistered: data.vatRegistered || undefined,
      });
      toast.success('Entity created');
      setView('list');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create entity');
    } finally {
      setSaving(false);
    }
  }

  // ── Update ──────────────────────────────────────────────────────────────────

  async function handleUpdate(data: EntityData) {
    if (!selectedId) return;
    setSaving(true);
    try {
      await updateEntity({
        id: selectedId,
        name: data.name.trim(),
        type: data.type,
        tin: data.tin.trim() || undefined,
        rcNumber: data.rcNumber.trim() || undefined,
        vatRegistered: data.vatRegistered || undefined,
        vatThresholdExceeded: data.vatThresholdExceeded || undefined,
      });
      toast.success('Entity updated');
      setEditMode(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update entity');
    } finally {
      setSaving(false);
    }
  }

  // ── Set Default ─────────────────────────────────────────────────────────────

  async function handleSetDefault() {
    if (!selectedId) return;
    try {
      await setDefaultEntity({ id: selectedId });
      toast.success('Default entity updated');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to set default');
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!selectedId) return;
    setDeleting(true);
    try {
      await removeEntity({ id: selectedId });
      toast.success('Entity deleted');
      setShowDeleteDialog(false);
      setSelectedId(null);
      setView('list');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete entity');
      setShowDeleteDialog(false);
    } finally {
      setDeleting(false);
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────────────

  if (entities === undefined) {
    return (
      <div className="max-w-2xl mx-auto animate-fade-in">
        <div className="flex items-center justify-between mb-6">
          <div className="space-y-2">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
          <Skeleton className="h-9 w-32 rounded-lg" />
        </div>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white border border-border rounded-xl p-5 flex items-start gap-4">
              <Skeleton className="w-10 h-10 rounded-lg flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="w-20 h-6 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Create View ──────────────────────────────────────────────────────────────

  if (view === 'create') {
    return (
      <div className="max-w-2xl mx-auto animate-fade-in">
        <button
          onClick={() => setView('list')}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Entities
        </button>
        <div className="bg-card border border-border rounded-xl shadow-soft p-6">
          <EntityForm
            title="Add New Entity"
            initial={emptyForm()}
            onSave={handleCreate}
            onCancel={() => setView('list')}
            saving={saving}
            submitLabel="Create Entity"
          />
        </div>
      </div>
    );
  }

  // ── Detail View ──────────────────────────────────────────────────────────────

  if (view === 'detail' && selectedEntity) {
    const isLast = entities.length <= 1;

    if (editMode) {
      const initialData: EntityData = {
        name: selectedEntity.name,
        type: selectedEntity.type,
        tin: selectedEntity.tin ?? '',
        rcNumber: selectedEntity.rcNumber ?? '',
        vatRegistered: selectedEntity.vatRegistered ?? false,
        vatThresholdExceeded: selectedEntity.vatThresholdExceeded ?? false,
      };

      return (
        <div className="max-w-2xl mx-auto animate-fade-in">
          <button
            onClick={() => setEditMode(false)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Details
          </button>
          <div className="bg-card border border-border rounded-xl shadow-soft p-6">
            <EntityForm
              title={`Edit ${selectedEntity.name}`}
              initial={initialData}
              onSave={handleUpdate}
              onCancel={() => setEditMode(false)}
              saving={saving}
              submitLabel="Save Changes"
            />
          </div>
        </div>
      );
    }

    return (
      <div className="max-w-2xl mx-auto animate-fade-in">
        <button
          onClick={() => { setView('list'); setSelectedId(null); }}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Entities
        </button>

        <div className="bg-card border border-border rounded-xl shadow-soft overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary-light flex items-center justify-center">
                <Building2 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-foreground">{selectedEntity.name}</h2>
                  {selectedEntity.isDefault && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider bg-primary text-white px-2 py-0.5 rounded-full">
                      <Star className="w-2.5 h-2.5" />
                      Default
                    </span>
                  )}
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${entityTypeColor(selectedEntity.type)}`}>
                  {ENTITY_TYPE_SHORT[selectedEntity.type]}
                </span>
              </div>
            </div>
            <button
              onClick={() => setEditMode(true)}
              className="flex items-center gap-1.5 text-sm text-primary font-medium hover:text-primary/80 transition-colors"
            >
              <Edit2 className="w-4 h-4" />
              Edit
            </button>
          </div>

          {/* Fields */}
          <div className="px-6 py-5 space-y-4">
            <DetailField label="Tax Year" value={getTaxYear(selectedEntity.taxYearStart)} />
            <DetailField label="FIRS TIN" value={selectedEntity.tin} />
            {(selectedEntity.type === 'business_name' || selectedEntity.type === 'llc') && (
              <DetailField label="RC Number" value={selectedEntity.rcNumber} />
            )}
            <DetailField
              label="VAT Registered"
              value={selectedEntity.vatRegistered ? 'Yes' : 'No'}
            />
            {selectedEntity.vatRegistered && (
              <DetailField
                label="VAT Threshold Exceeded"
                value={selectedEntity.vatThresholdExceeded ? 'Yes' : 'No'}
              />
            )}
          </div>

          {/* Actions */}
          <div className="px-6 py-4 border-t border-border space-y-3">
            {!selectedEntity.isDefault && (
              <button
                onClick={handleSetDefault}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium border border-primary text-primary rounded-lg hover:bg-primary-light transition-colors"
              >
                <Star className="w-4 h-4" />
                Set as Default
              </button>
            )}
            <button
              onClick={() => setShowDeleteDialog(true)}
              disabled={isLast}
              title={isLast ? 'Cannot delete your last entity' : undefined}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" />
              {isLast ? 'Cannot delete last entity' : 'Delete Entity'}
            </button>
          </div>
        </div>

        {/* Delete Dialog */}
        {showDeleteDialog && (
          <DeleteDialog
            entityName={selectedEntity.name}
            onConfirm={handleDelete}
            onCancel={() => setShowDeleteDialog(false)}
            deleting={deleting}
          />
        )}
      </div>
    );
  }

  // ── List View ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      {/* Page header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Tax Entities</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage the entities you file tax returns for
          </p>
        </div>
        <button
          onClick={() => setView('create')}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors shadow-soft"
        >
          <Plus className="w-4 h-4" />
          Add Entity
        </button>
      </div>

      {/* Entity list */}
      {entities.length === 0 ? (
        <div className="bg-card border border-border rounded-xl shadow-soft p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary-light flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-7 h-7 text-primary" />
          </div>
          <p className="font-semibold text-foreground mb-1">No entities yet</p>
          <p className="text-sm text-muted-foreground mb-6">
            Create your first tax entity to get started
          </p>
          <button
            onClick={() => setView('create')}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Entity
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {entities.map((entity) => (
            <button
              key={entity._id}
              onClick={() => {
                setSelectedId(entity._id);
                setEditMode(false);
                setView('detail');
              }}
              className="w-full bg-card border border-border rounded-xl shadow-soft px-5 py-4 flex items-center gap-4 hover:border-primary/40 hover:shadow-medium transition-all text-left"
            >
              {/* Icon */}
              <div className="w-10 h-10 rounded-xl bg-primary-light flex items-center justify-center flex-shrink-0">
                <Building2 className="w-5 h-5 text-primary" />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm text-foreground truncate">
                    {entity.name}
                  </span>
                  {entity.isDefault && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider bg-primary text-white px-2 py-0.5 rounded-full flex-shrink-0">
                      <Star className="w-2.5 h-2.5" />
                      Default
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${entityTypeColor(entity.type)}`}>
                    {ENTITY_TYPE_SHORT[entity.type]}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Tax Year {getTaxYear(entity.taxYearStart)}
                  </span>
                </div>
              </div>

              <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Detail Field Helper ──────────────────────────────────────────────────────

function DetailField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex-shrink-0 pt-0.5">
        {label}
      </p>
      <p className="text-sm text-foreground text-right">
        {value || <span className="text-muted-foreground italic">Not provided</span>}
      </p>
    </div>
  );
}
