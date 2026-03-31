import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { NIGERIAN_BANKS } from '@convex/lib/nigerianBanks';
import { ChevronDown, Plus, Building2, Search, Check } from 'lucide-react';

export interface BankAccountSelectorProps {
  entityId: Id<'entities'>;
  value: Id<'bankAccounts'> | null;
  onChange: (bankAccountId: Id<'bankAccounts'>) => void;
  placeholder?: string;
  compact?: boolean;
}

interface BankAccount {
  _id: Id<'bankAccounts'>;
  bankName: string;
  accountNumber?: string;
  nickname: string;
}

function maskAccountNumber(accountNumber?: string): string {
  if (!accountNumber || accountNumber.length < 4) return '';
  return `···${accountNumber.slice(-4)}`;
}

export function BankAccountSelector({
  entityId,
  value,
  onChange,
  placeholder = 'Select bank account',
  compact = false,
}: BankAccountSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const accounts = useQuery(api.bankAccounts.listByEntity, { entityId }) as
    | BankAccount[]
    | undefined;

  const selectedAccount = useMemo(
    () => (accounts ?? []).find((a) => a._id === value) ?? null,
    [accounts, value],
  );

  // Click-outside-to-close
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setShowCreateForm(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleSelect = useCallback(
    (id: Id<'bankAccounts'>) => {
      onChange(id);
      setIsOpen(false);
      setShowCreateForm(false);
    },
    [onChange],
  );

  const handleCreated = useCallback(
    (id: Id<'bankAccounts'>) => {
      onChange(id);
      setShowCreateForm(false);
      setIsOpen(false);
    },
    [onChange],
  );

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`
          w-full flex items-center justify-between gap-2
          border border-gray-300 bg-white text-left
          rounded-xl transition-colors
          hover:border-gray-400
          focus:outline-none focus:ring-2 focus:ring-green-500
          ${compact ? 'px-3 py-2 text-sm' : 'px-4 py-2.5 text-sm'}
        `}
      >
        <span className={selectedAccount ? 'text-gray-900' : 'text-gray-400'}>
          {selectedAccount
            ? `${selectedAccount.nickname}${selectedAccount.accountNumber ? ` ${maskAccountNumber(selectedAccount.accountNumber)}` : ''}`
            : placeholder}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full min-w-[280px] bg-white border border-gray-200 rounded-xl shadow-lg max-h-[360px] flex flex-col overflow-hidden">
          {/* Account list */}
          <div className="overflow-y-auto flex-1">
            {accounts === undefined ? (
              <div className="px-4 py-6 text-center text-gray-400 text-sm">
                Loading...
              </div>
            ) : accounts.length === 0 && !showCreateForm ? (
              <div className="px-4 py-6 text-center text-gray-400 text-sm">
                No bank accounts yet
              </div>
            ) : (
              accounts.map((account) => (
                <button
                  key={account._id}
                  type="button"
                  onClick={() => handleSelect(account._id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-green-50 transition-colors border-b border-gray-100 last:border-0"
                >
                  <Building2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {account.nickname}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {account.bankName}
                      {account.accountNumber
                        ? ` · ${maskAccountNumber(account.accountNumber)}`
                        : ''}
                    </p>
                  </div>
                  {value === account._id && (
                    <Check className="w-4 h-4 text-green-700 flex-shrink-0" />
                  )}
                </button>
              ))
            )}
          </div>

          {/* Divider + Add new */}
          {!showCreateForm ? (
            <button
              type="button"
              onClick={() => setShowCreateForm(true)}
              className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-green-700 hover:bg-green-50 transition-colors border-t border-gray-200"
            >
              <Plus className="w-4 h-4" />
              Add new bank account
            </button>
          ) : (
            <InlineCreateForm
              entityId={entityId}
              onCreated={handleCreated}
              onCancel={() => setShowCreateForm(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline create form
// ---------------------------------------------------------------------------

interface InlineCreateFormProps {
  entityId: Id<'entities'>;
  onCreated: (id: Id<'bankAccounts'>) => void;
  onCancel: () => void;
}

function InlineCreateForm({
  entityId,
  onCreated,
  onCancel,
}: InlineCreateFormProps) {
  const createAccount = useMutation(api.bankAccounts.create);

  const [bankSearch, setBankSearch] = useState('');
  const [selectedBank, setSelectedBank] = useState<{
    name: string;
    code: string;
  } | null>(null);
  const [bankDropdownOpen, setBankDropdownOpen] = useState(false);
  const [accountNumber, setAccountNumber] = useState('');
  const [nickname, setNickname] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const bankSearchRef = useRef<HTMLDivElement>(null);

  const filteredBanks = useMemo(() => {
    if (!bankSearch) return NIGERIAN_BANKS;
    const query = bankSearch.toLowerCase();
    return NIGERIAN_BANKS.filter((b) => b.name.toLowerCase().includes(query));
  }, [bankSearch]);

  const hasExactMatch = useMemo(() => {
    const query = bankSearch.toLowerCase().trim();
    return NIGERIAN_BANKS.some((b) => b.name.toLowerCase() === query);
  }, [bankSearch]);

  // Close bank dropdown on click outside
  useEffect(() => {
    if (!bankDropdownOpen) return;

    function handleClickOutside(e: MouseEvent) {
      if (
        bankSearchRef.current &&
        !bankSearchRef.current.contains(e.target as Node)
      ) {
        setBankDropdownOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [bankDropdownOpen]);

  function handleBankSelect(bank: { name: string; code: string }) {
    setSelectedBank(bank);
    setBankSearch(bank.name);
    setBankDropdownOpen(false);
    if (!nickname || nickname === selectedBank?.name) {
      setNickname(bank.name);
    }
  }

  function handleUseCustomName() {
    const trimmed = bankSearch.trim();
    if (!trimmed) return;
    const custom = { name: trimmed, code: 'CUSTOM' };
    setSelectedBank(custom);
    setBankDropdownOpen(false);
    if (!nickname || nickname === selectedBank?.name) {
      setNickname(trimmed);
    }
  }

  function handleAccountNumberChange(val: string) {
    // Numeric only, max 10 digits
    const cleaned = val.replace(/\D/g, '').slice(0, 10);
    setAccountNumber(cleaned);
  }

  async function handleSubmit() {
    setError('');

    if (!selectedBank) {
      setError('Please select a bank');
      return;
    }
    if (!nickname.trim()) {
      setError('Please enter a nickname');
      return;
    }

    setIsSubmitting(true);
    try {
      const newId = await createAccount({
        entityId,
        bankName: selectedBank.name,
        bankCode: selectedBank.code,
        accountNumber: accountNumber || undefined,
        nickname: nickname.trim(),
      });
      onCreated(newId);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to create bank account');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="border-t border-gray-200 p-4 space-y-3 bg-gray-50">
      <p className="text-sm font-medium text-gray-700">New bank account</p>

      {/* Bank name — searchable dropdown */}
      <div ref={bankSearchRef} className="relative">
        <label className="block text-xs font-medium text-gray-500 mb-1">
          Bank name
        </label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={bankSearch}
            onChange={(e) => {
              setBankSearch(e.target.value);
              setBankDropdownOpen(true);
              if (selectedBank && e.target.value !== selectedBank.name) {
                setSelectedBank(null);
              }
            }}
            onFocus={() => setBankDropdownOpen(true)}
            placeholder="Search banks..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>

        {bankDropdownOpen && (
          <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-[160px] overflow-y-auto">
            {filteredBanks.map((bank) => (
              <button
                key={bank.code}
                type="button"
                onClick={() => handleBankSelect(bank)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-green-50 transition-colors"
              >
                <span className="text-gray-900">{bank.name}</span>
                {selectedBank?.code === bank.code && (
                  <Check className="w-3.5 h-3.5 text-green-700 ml-auto flex-shrink-0" />
                )}
              </button>
            ))}
            {filteredBanks.length === 0 && bankSearch.trim() && (
              <button
                type="button"
                onClick={handleUseCustomName}
                className="w-full px-3 py-2 text-sm text-left text-green-700 hover:bg-green-50 transition-colors"
              >
                Use "{bankSearch.trim()}" as bank name
              </button>
            )}
            {filteredBanks.length > 0 &&
              !hasExactMatch &&
              bankSearch.trim() && (
                <button
                  type="button"
                  onClick={handleUseCustomName}
                  className="w-full px-3 py-2 text-sm text-left text-green-700 hover:bg-green-50 transition-colors border-t border-gray-100"
                >
                  Use "{bankSearch.trim()}" as bank name
                </button>
              )}
          </div>
        )}
      </div>

      {/* Account number */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">
          Account number{' '}
          <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <input
          type="text"
          inputMode="numeric"
          value={accountNumber}
          onChange={(e) => handleAccountNumberChange(e.target.value)}
          placeholder="0123456789"
          maxLength={10}
          className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
        />
      </div>

      {/* Nickname */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">
          Nickname
        </label>
        <input
          type="text"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="e.g. Business Current Account"
          className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
        />
      </div>

      {/* Error */}
      {error && <p className="text-xs text-red-600">{error}</p>}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="flex-1 px-4 py-2 text-sm font-medium text-white bg-green-700 rounded-xl hover:bg-green-800 transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          {isSubmitting ? 'Creating...' : 'Create'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
