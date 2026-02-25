import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { Skeleton } from '../components/Skeleton';
import {
  User,
  Mail,
  Phone,
  Shield,
  CreditCard,
  Camera,
  Edit2,
  Save,
  X,
  ChevronRight,
  Briefcase,
  Building2,
  Bell,
  Tag,
  Link2,
} from 'lucide-react';

const CURRENCIES: Record<string, string> = {
  NGN: '₦ Nigerian Naira (NGN)',
  USD: '$ US Dollar (USD)',
  GBP: '£ British Pound (GBP)',
  EUR: '€ Euro (EUR)',
};

function maskNin(nin: string): string {
  return '•'.repeat(7) + nin.slice(-4);
}

function getInitials(name?: string | null, email?: string | null): string {
  if (name) {
    const parts = name.trim().split(' ').filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0][0].toUpperCase();
  }
  if (email) return email[0].toUpperCase();
  return '?';
}

function FieldIcon({ icon }: { icon: React.ReactNode }) {
  return (
    <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 mt-0.5 text-muted-foreground">
      {icon}
    </div>
  );
}

function ProfileField({
  label,
  icon,
  value,
  placeholder,
  isEditing,
  error,
  onChange,
  inputMode,
  maxLength,
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  placeholder?: string;
  isEditing: boolean;
  error?: string;
  onChange: (v: string) => void;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  maxLength?: number;
}) {
  return (
    <div className="flex items-start gap-3">
      <FieldIcon icon={icon} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
        {isEditing ? (
          <>
            <input
              type="text"
              inputMode={inputMode}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              maxLength={maxLength}
              className="mt-1 w-full text-sm px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none placeholder:text-muted-foreground"
            />
            {error && <p className="text-xs text-destructive mt-1">{error}</p>}
          </>
        ) : (
          <p className="text-sm text-foreground mt-0.5">
            {value || <span className="text-muted-foreground italic">Not provided</span>}
          </p>
        )}
      </div>
    </div>
  );
}

export default function Settings() {
  const me = useQuery(api.userCrud.getMe);
  const avatarUrl = useQuery(
    api.files.getFileUrl,
    me?.avatarStorageId ? { storageId: me.avatarStorageId } : 'skip'
  );

  const updateProfile = useMutation(api.userCrud.updateProfile);
  const updateNin = useMutation(api.userCrud.updateNin);
  const uploadAvatar = useMutation(api.userCrud.uploadAvatar);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);

  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [profession, setProfession] = useState('');
  const [firsTin, setFirsTin] = useState('');
  const [currency, setCurrency] = useState<'NGN' | 'USD' | 'GBP' | 'EUR'>('NGN');
  const [nin, setNin] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (me) {
      setFullName(me.fullName ?? '');
      setPhone(me.phone ?? '');
      setProfession(me.profession ?? '');
      setFirsTin(me.firsTin ?? '');
      setCurrency((me.preferredCurrency as 'NGN' | 'USD' | 'GBP' | 'EUR') ?? 'NGN');
      setNin(me.nin ?? '');
    }
  }, [me]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrors((prev) => ({ ...prev, avatar: 'Please select an image file' }));
      return;
    }
    setAvatarFile(file);
    const url = URL.createObjectURL(file);
    setAvatarPreview(url);
    setErrors((prev) => {
      const next = { ...prev };
      delete next.avatar;
      return next;
    });
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!fullName.trim()) newErrors.fullName = 'Full name is required';
    if (nin && !/^\d{11}$/.test(nin)) {
      newErrors.nin = 'NIN must be exactly 11 digits';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      // Upload avatar if a new file was selected
      if (avatarFile) {
        const uploadUrl = await generateUploadUrl();
        const result = await fetch(uploadUrl, {
          method: 'POST',
          headers: { 'Content-Type': avatarFile.type },
          body: avatarFile,
        });
        const { storageId } = await result.json();
        await uploadAvatar({ storageId });
      }

      // Save profile fields
      await updateProfile({
        fullName: fullName.trim() || undefined,
        phone: phone.trim() || undefined,
        profession: profession.trim() || undefined,
        firsTin: firsTin.trim() || undefined,
        preferredCurrency: currency,
      });

      // Save NIN if it was changed
      if (nin && nin !== (me?.nin ?? '')) {
        await updateNin({ nin });
      }

      toast.success('Profile saved successfully');
      setMode('view');
      setAvatarFile(null);
      setAvatarPreview(null);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to save profile';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (me) {
      setFullName(me.fullName ?? '');
      setPhone(me.phone ?? '');
      setProfession(me.profession ?? '');
      setFirsTin(me.firsTin ?? '');
      setCurrency((me.preferredCurrency as 'NGN' | 'USD' | 'GBP' | 'EUR') ?? 'NGN');
      setNin(me.nin ?? '');
    }
    setAvatarFile(null);
    setAvatarPreview(null);
    setErrors({});
    setMode('view');
  };

  const currentAvatarSrc = avatarPreview ?? avatarUrl ?? null;

  if (me === undefined) {
    return (
      <div className="max-w-2xl mx-auto animate-fade-in">
        <div className="mb-8 space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="bg-card border border-border rounded-xl shadow-soft overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-border">
            <Skeleton className="h-5 w-16" />
          </div>
          <div className="px-6 py-6 space-y-6">
            <div className="flex items-center gap-5">
              <Skeleton className="w-20 h-20 rounded-full flex-shrink-0" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-56" />
              </div>
            </div>
            <div className="grid gap-5">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-start gap-3">
                  <Skeleton className="w-8 h-8 rounded-lg flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-4 w-48" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (me === null) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-muted-foreground">Could not load profile.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your account and preferences</p>
      </div>

      {/* Profile card */}
      <div className="bg-card border border-border rounded-xl shadow-soft overflow-hidden mb-6">
        {/* Section header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">Profile</h2>
          {mode === 'view' ? (
            <button
              onClick={() => setMode('edit')}
              className="flex items-center gap-1.5 text-sm text-primary font-medium hover:text-primary/80 transition-colors"
            >
              <Edit2 className="w-4 h-4" />
              Edit
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={handleCancel}
                className="flex items-center gap-1.5 text-sm text-muted-foreground font-medium hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 text-sm bg-primary text-white font-medium px-3 py-1.5 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          )}
        </div>

        <div className="px-6 py-6 space-y-6">
          {/* Avatar row */}
          <div className="flex items-center gap-5">
            <div className="relative">
              <div className="w-20 h-20 rounded-full overflow-hidden bg-primary-light flex items-center justify-center ring-2 ring-primary/20">
                {currentAvatarSrc ? (
                  <img
                    src={currentAvatarSrc}
                    alt="Profile avatar"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-2xl font-semibold text-primary">
                    {getInitials(me.fullName, me.email)}
                  </span>
                )}
              </div>
              {mode === 'edit' && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-0 right-0 w-7 h-7 bg-primary text-white rounded-full flex items-center justify-center hover:bg-primary/90 transition-colors shadow-medium"
                  title="Change photo"
                >
                  <Camera className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div>
              <p className="font-semibold text-foreground text-lg leading-tight">
                {me.fullName ?? 'Your Name'}
              </p>
              <p className="text-sm text-muted-foreground">{me.email}</p>
              {mode === 'edit' && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-primary font-medium mt-1.5 hover:underline"
                >
                  Change photo
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
          {errors.avatar && <p className="text-xs text-destructive -mt-4">{errors.avatar}</p>}

          {/* Profile fields */}
          <div className="grid gap-5">
            {/* Full Name */}
            <ProfileField
              label="Full Name"
              icon={<User className="w-4 h-4" />}
              value={fullName}
              placeholder="Enter your full name"
              isEditing={mode === 'edit'}
              error={errors.fullName}
              onChange={setFullName}
            />

            {/* Email — read-only */}
            <div className="flex items-start gap-3">
              <FieldIcon icon={<Mail className="w-4 h-4" />} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Email</p>
                <p className="text-sm text-foreground mt-0.5">{me.email}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Managed by your sign-in provider</p>
              </div>
            </div>

            {/* Phone */}
            <ProfileField
              label="Phone Number"
              icon={<Phone className="w-4 h-4" />}
              value={phone}
              placeholder="+234 800 000 0000"
              isEditing={mode === 'edit'}
              onChange={setPhone}
              inputMode="tel"
            />

            {/* Profession */}
            <ProfileField
              label="Profession"
              icon={<Briefcase className="w-4 h-4" />}
              value={profession}
              placeholder="e.g. Software Engineer, Consultant"
              isEditing={mode === 'edit'}
              onChange={setProfession}
            />

            {/* NIN */}
            <div className="flex items-start gap-3">
              <FieldIcon icon={<Shield className="w-4 h-4" />} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  National Identification Number (NIN)
                </p>
                {mode === 'view' ? (
                  <p className="text-sm text-foreground mt-0.5 font-mono tracking-widest">
                    {me.nin ? (
                      maskNin(me.nin)
                    ) : (
                      <span className="text-muted-foreground italic font-sans tracking-normal">Not provided</span>
                    )}
                  </p>
                ) : (
                  <>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={nin}
                      onChange={(e) => setNin(e.target.value.replace(/\D/g, '').slice(0, 11))}
                      placeholder="11-digit NIN"
                      maxLength={11}
                      className="mt-1 w-full text-sm px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none placeholder:text-muted-foreground font-mono tracking-widest"
                    />
                    {errors.nin && <p className="text-xs text-destructive mt-1">{errors.nin}</p>}
                    <p className="text-xs text-muted-foreground mt-1">
                      Encrypted and stored securely. Never shared.
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* FIRS TIN */}
            <ProfileField
              label="FIRS Tax Identification Number (TIN)"
              icon={<CreditCard className="w-4 h-4" />}
              value={firsTin}
              placeholder="e.g. 1234567890"
              isEditing={mode === 'edit'}
              onChange={setFirsTin}
              inputMode="numeric"
            />

            {/* Primary Currency */}
            <div className="flex items-start gap-3">
              <FieldIcon icon={<CreditCard className="w-4 h-4" />} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Primary Currency
                </p>
                {mode === 'view' ? (
                  <p className="text-sm text-foreground mt-0.5">
                    {CURRENCIES[me.preferredCurrency ?? 'NGN'] ?? '₦ Nigerian Naira (NGN)'}
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {(Object.entries(CURRENCIES) as [string, string][]).map(([code, label]) => (
                      <button
                        key={code}
                        type="button"
                        onClick={() => setCurrency(code as 'NGN' | 'USD' | 'GBP' | 'EUR')}
                        className={`text-left text-sm px-3 py-2 rounded-lg border transition-colors ${
                          currency === code
                            ? 'border-primary bg-primary-light text-primary font-medium'
                            : 'border-border bg-background text-foreground hover:border-primary/50'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="bg-card border border-border rounded-xl shadow-soft overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">Notifications</h2>
        </div>
        <div className="px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 text-muted-foreground">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Notification Preferences</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Deadline reminders, VAT alerts, invoice overdue notifications
              </p>
            </div>
          </div>
          <Link
            to="/app/settings/notifications"
            className="flex items-center gap-1 text-sm text-primary font-medium hover:text-primary/80 transition-colors flex-shrink-0 ml-4"
          >
            Manage
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* Tax Entities */}
      <div className="bg-card border border-border rounded-xl shadow-soft overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">Tax Entities</h2>
        </div>
        <div className="px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 text-muted-foreground">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Manage Tax Entities</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Add, edit, or remove entities you file returns for
              </p>
            </div>
          </div>
          <Link
            to="/app/settings/entities"
            className="flex items-center gap-1 text-sm text-primary font-medium hover:text-primary/80 transition-colors flex-shrink-0 ml-4"
          >
            Manage
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* Categories */}
      <div className="bg-card border border-border rounded-xl shadow-soft overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">Categories</h2>
        </div>
        <div className="px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 text-muted-foreground">
              <Tag className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Manage Categories</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Create and edit custom transaction categories
              </p>
            </div>
          </div>
          <Link
            to="/app/settings/categories"
            className="flex items-center gap-1 text-sm text-primary font-medium hover:text-primary/80 transition-colors flex-shrink-0 ml-4"
          >
            Manage
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* Connected Accounts */}
      <div className="bg-card border border-border rounded-xl shadow-soft overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">Connected Accounts</h2>
        </div>
        <div className="px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 text-muted-foreground">
              <Link2 className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Bank Accounts & Data Sources</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Link bank accounts or add statement upload sources
              </p>
            </div>
          </div>
          <Link
            to="/app/settings/accounts"
            className="flex items-center gap-1 text-sm text-primary font-medium hover:text-primary/80 transition-colors flex-shrink-0 ml-4"
          >
            Manage
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-card border border-red-200 rounded-xl shadow-soft overflow-hidden">
        <div className="px-6 py-4 border-b border-red-100">
          <h2 className="text-base font-semibold text-red-700">Danger Zone</h2>
        </div>
        <div className="px-6 py-5 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Delete Account</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Permanently delete your account and all associated data. This cannot be undone.
            </p>
          </div>
          <Link
            to="/app/settings/delete-account"
            className="flex items-center gap-1 text-sm text-red-600 font-medium hover:text-red-700 transition-colors flex-shrink-0 ml-4"
          >
            Delete Account
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
