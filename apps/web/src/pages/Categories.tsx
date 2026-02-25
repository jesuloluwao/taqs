import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { toast } from 'sonner';
import {
  Tag,
  Plus,
  Edit2,
  Trash2,
  X,
  Save,
  Lock,
  Check,
  ChevronLeft,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Skeleton } from '../components/Skeleton';

// ─── Types ────────────────────────────────────────────────────────────────────

type CategoryType = 'income' | 'business_expense' | 'personal_expense' | 'transfer';

interface Category {
  _id: Id<'categories'>;
  name: string;
  type: CategoryType;
  isSystem?: boolean;
  isDeductibleDefault?: boolean;
  icon?: string;
  color?: string;
  userId?: Id<'users'>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<CategoryType, string> = {
  income: 'Income',
  business_expense: 'Business Expenses',
  personal_expense: 'Personal',
  transfer: 'Transfers',
};

const TYPE_ORDER: CategoryType[] = [
  'income',
  'business_expense',
  'personal_expense',
  'transfer',
];

const TYPE_COLORS: Record<CategoryType, string> = {
  income: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  business_expense: 'text-blue-600 bg-blue-50 border-blue-200',
  personal_expense: 'text-purple-600 bg-purple-50 border-purple-200',
  transfer: 'text-amber-600 bg-amber-50 border-amber-200',
};

const PRESET_COLORS = [
  '#10b981', '#3b82f6', '#8b5cf6', '#f59e0b',
  '#ef4444', '#ec4899', '#06b6d4', '#84cc16',
  '#f97316', '#6366f1',
];

const PRESET_ICONS = [
  '💼', '💻', '🏠', '🚗', '✈️', '🍽️',
  '📱', '💡', '🎓', '🏋️', '🎭', '📦',
  '💰', '🔧', '📊', '🛒',
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (c: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {PRESET_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
          style={{
            backgroundColor: c,
            borderColor: value === c ? '#111' : 'transparent',
          }}
          title={c}
        />
      ))}
    </div>
  );
}

function IconPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (i: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {PRESET_ICONS.map((icon) => (
        <button
          key={icon}
          type="button"
          onClick={() => onChange(icon)}
          className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center border transition-colors ${
            value === icon
              ? 'border-primary bg-primary-light'
              : 'border-border hover:border-primary/50 hover:bg-muted'
          }`}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}

// ─── Create/Edit Modal ────────────────────────────────────────────────────────

interface ModalProps {
  editTarget: Category | null; // null = create mode
  onClose: () => void;
}

function CategoryFormModal({ editTarget, onClose }: ModalProps) {
  const createMutation = useMutation((api as any).categories.create);
  const updateMutation = useMutation((api as any).categories.update);

  const isEdit = editTarget !== null;

  const [name, setName] = useState(editTarget?.name ?? '');
  const [type, setType] = useState<CategoryType>(editTarget?.type ?? 'business_expense');
  const [isDeductibleDefault, setIsDeductibleDefault] = useState(
    editTarget?.isDeductibleDefault ?? false
  );
  const [icon, setIcon] = useState(editTarget?.icon ?? '📦');
  const [color, setColor] = useState(editTarget?.color ?? '#3b82f6');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Name is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      if (isEdit) {
        await updateMutation({
          id: editTarget._id,
          name,
          isDeductibleDefault,
          icon,
          color,
        });
        toast.success('Category updated');
      } else {
        await createMutation({ name, type, isDeductibleDefault, icon, color });
        toast.success('Category created');
      }
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-medium w-full max-w-md p-6 animate-slide-up overflow-y-auto max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-foreground">
            {isEdit ? 'Edit Category' : 'New Category'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Agency Fees"
              className="mt-1.5 w-full text-sm px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none placeholder:text-muted-foreground"
            />
            {errors.name && (
              <p className="text-xs text-destructive mt-1">{errors.name}</p>
            )}
          </div>

          {/* Type — only for create */}
          {!isEdit && (
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Type *
              </label>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                {TYPE_ORDER.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`text-left text-sm px-3 py-2 rounded-lg border transition-colors ${
                      type === t
                        ? 'border-primary bg-primary-light text-primary font-medium'
                        : 'border-border bg-background text-foreground hover:border-primary/50'
                    }`}
                  >
                    {TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Deductible toggle */}
          {(type === 'business_expense' || (isEdit && editTarget?.type === 'business_expense')) && (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Tax Deductible by Default</p>
                <p className="text-xs text-muted-foreground">New transactions in this category default to deductible</p>
              </div>
              <button
                type="button"
                onClick={() => setIsDeductibleDefault((prev) => !prev)}
                className={`relative w-10 h-6 rounded-full transition-colors ${
                  isDeductibleDefault ? 'bg-primary' : 'bg-muted-foreground/30'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    isDeductibleDefault ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          )}

          {/* Icon */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Icon
            </label>
            <div className="mt-1.5">
              <div className="flex items-center gap-3 mb-2">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-xl border border-border"
                  style={{ backgroundColor: color + '22' }}
                >
                  {icon}
                </div>
                <span className="text-sm text-muted-foreground">Selected</span>
              </div>
              <IconPicker value={icon} onChange={setIcon} />
            </div>
          </div>

          {/* Color */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Color
            </label>
            <div className="mt-1.5">
              <ColorPicker value={color} onChange={setColor} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-foreground bg-muted rounded-lg hover:bg-muted/80 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Save className="w-4 h-4" />
                {isEdit ? 'Save Changes' : 'Create'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete Confirm ───────────────────────────────────────────────────────────

function DeleteConfirmModal({
  category,
  onConfirm,
  onCancel,
  deleting,
}: {
  category: Category;
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-card border border-border rounded-2xl shadow-medium w-full max-w-sm p-6 animate-slide-up">
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 p-1.5 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
            <Trash2 className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">Delete category?</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{category.name}</p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground mb-5">
          All transactions in this category will be moved to{' '}
          <span className="font-medium text-foreground">Uncategorised</span>. This cannot be undone.
        </p>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-foreground bg-muted rounded-lg hover:bg-muted/80 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {deleting ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              'Delete'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Category Row ─────────────────────────────────────────────────────────────

function CategoryRow({
  category,
  onEdit,
  onDelete,
}: {
  category: Category;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors group">
      {/* Icon + color dot */}
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center text-base flex-shrink-0"
        style={{ backgroundColor: (category.color ?? '#3b82f6') + '22' }}
      >
        {category.icon ?? '📦'}
      </div>

      {/* Name + badges */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground">{category.name}</span>
          {category.isSystem && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              <Lock className="w-2.5 h-2.5" />
              System
            </span>
          )}
          {category.isDeductibleDefault && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
              <Check className="w-2.5 h-2.5" />
              Deductible
            </span>
          )}
        </div>
      </div>

      {/* Color swatch */}
      <div
        className="w-3 h-3 rounded-full flex-shrink-0"
        style={{ backgroundColor: category.color ?? '#3b82f6' }}
      />

      {/* Actions — only for custom categories */}
      {!category.isSystem && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onEdit}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary-light transition-colors"
            title="Edit"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {category.isSystem && (
        <div className="w-[52px]" /> /* spacer to match action button width */
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Categories() {
  const categories = useQuery(api.categories.listAll) as Category[] | undefined;
  const removeMutation = useMutation((api as any).categories.remove);

  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<Category | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await removeMutation({ id: deleteTarget._id });
      toast.success(`"${deleteTarget.name}" deleted`);
      setDeleteTarget(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  // Group by type
  const grouped = TYPE_ORDER.reduce(
    (acc, type) => {
      acc[type] = (categories ?? []).filter((c) => c.type === type);
      return acc;
    },
    {} as Record<CategoryType, Category[]>
  );

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      {/* Page header */}
      <div className="mb-6">
        <Link
          to="/app/settings"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ChevronLeft className="w-4 h-4" />
          Settings
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">Categories</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage how your transactions are classified
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors shadow-soft"
          >
            <Plus className="w-4 h-4" />
            New Category
          </button>
        </div>
      </div>

      {/* Category groups */}
      {categories === undefined ? (
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-xl shadow-soft overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <Skeleton className="h-4 w-32" />
              </div>
              <div className="divide-y divide-border">
                {[...Array(3)].map((_, j) => (
                  <div key={j} className="flex items-center gap-3 px-4 py-3">
                    <Skeleton className="w-9 h-9 rounded-lg" />
                    <Skeleton className="h-4 w-40" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {TYPE_ORDER.map((type) => {
            const items = grouped[type];
            if (items.length === 0) return null;

            return (
              <div
                key={type}
                className="bg-card border border-border rounded-xl shadow-soft overflow-hidden"
              >
                {/* Group header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide px-2 py-1 rounded-md border ${TYPE_COLORS[type]}`}
                  >
                    <Tag className="w-3 h-3" />
                    {TYPE_LABELS[type]}
                  </span>
                  <span className="text-xs text-muted-foreground">{items.length}</span>
                </div>

                {/* Category rows */}
                <div className="divide-y divide-border">
                  {items.map((cat) => (
                    <CategoryRow
                      key={cat._id}
                      category={cat}
                      onEdit={() => setEditTarget(cat)}
                      onDelete={() => setDeleteTarget(cat)}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {/* Empty state if no categories */}
          {categories.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Tag className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="text-sm font-medium text-foreground mb-1">No categories yet</p>
              <p className="text-sm text-muted-foreground mb-4">
                Create your first custom category to organise transactions.
              </p>
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-4 h-4" />
                New Category
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {(showCreate || editTarget) && (
        <CategoryFormModal
          editTarget={editTarget}
          onClose={() => {
            setShowCreate(false);
            setEditTarget(null);
          }}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          category={deleteTarget}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          deleting={deleting}
        />
      )}
    </div>
  );
}
