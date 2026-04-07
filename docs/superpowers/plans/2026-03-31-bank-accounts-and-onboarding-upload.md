# Bank Accounts, Onboarding Upload & Per-Account Reporting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bank accounts model, enable statement upload during onboarding with background processing, disable Paystack/Flutterwave in onboarding, associate transactions with bank accounts (including retroactive assignment), and add per-account reporting.

**Architecture:** New `bankAccounts` table in Convex with CRUD mutations/queries. `bankAccountId` foreign key added to `transactions` and `importJobs` tables. A reusable `BankAccountSelector` component shared across onboarding, import, and transaction pages. Reports backend queries gain optional bank account filtering. New "By Account" tab in Reports.

**Tech Stack:** Convex (schema, mutations, queries, actions), React (web frontend), TypeScript

**Spec:** `docs/superpowers/specs/2026-03-31-bank-accounts-and-onboarding-upload-design.md`

---

### Task 1: Schema — Add `bankAccounts` table and modify existing tables

**Files:**
- Modify: `convex/schema.ts`

This task adds the new `bankAccounts` table definition and adds `bankAccountId` optional fields to `transactions` and `importJobs`.

- [ ] **Step 1: Add `bankAccounts` table to schema**

In `convex/schema.ts`, add the following table definition after the `connectedAccounts` table (after line 112):

```typescript
  bankAccounts: defineTable({
    entityId: v.id('entities'),
    userId: v.id('users'),
    bankName: v.string(),
    bankCode: v.string(),
    accountNumber: v.optional(v.string()),
    accountName: v.optional(v.string()),
    nickname: v.string(),
    currency: v.union(v.literal('NGN'), v.literal('USD'), v.literal('GBP'), v.literal('EUR')),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_entityId', ['entityId'])
    .index('by_userId', ['userId'])
    .index('by_entityId_isActive', ['entityId', 'isActive']),
```

- [ ] **Step 2: Add `bankAccountId` to `transactions` table**

In the `transactions` table definition (around line 135, after `connectedAccountId`), add:

```typescript
    bankAccountId: v.optional(v.id('bankAccounts')),
```

Add a new index after the existing indexes (after line 196):

```typescript
    .index('by_bankAccountId', ['bankAccountId'])
```

- [ ] **Step 3: Add `bankAccountId` to `importJobs` table**

In the `importJobs` table definition (around line 204, after `connectedAccountId`), add:

```typescript
    bankAccountId: v.optional(v.id('bankAccounts')),
```

Add a new index after the existing indexes (after line 232):

```typescript
    .index('by_bankAccountId', ['bankAccountId'])
```

- [ ] **Step 4: Run `npx convex dev` to verify schema pushes cleanly**

Run: `npx convex dev --once`
Expected: Schema push succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add convex/schema.ts
git commit -m "feat(bankAccounts): add bankAccounts table and bankAccountId to transactions/importJobs"
```

---

### Task 2: Backend — Bank accounts CRUD mutations and queries

**Files:**
- Create: `convex/bankAccounts.ts`
- Create: `convex/lib/nigerianBanks.ts`

- [ ] **Step 1: Create Nigerian banks list**

Create `convex/lib/nigerianBanks.ts` with the predefined banks array:

```typescript
export interface NigerianBank {
  name: string;
  code: string;
}

export const NIGERIAN_BANKS: NigerianBank[] = [
  { name: 'Access Bank', code: '044' },
  { name: 'Citibank Nigeria', code: '023' },
  { name: 'Ecobank Nigeria', code: '050' },
  { name: 'Fidelity Bank', code: '070' },
  { name: 'First Bank of Nigeria', code: '011' },
  { name: 'First City Monument Bank', code: '214' },
  { name: 'Globus Bank', code: '103' },
  { name: 'Guaranty Trust Bank', code: '058' },
  { name: 'Heritage Bank', code: '030' },
  { name: 'Jaiz Bank', code: '301' },
  { name: 'Keystone Bank', code: '082' },
  { name: 'Kuda Microfinance Bank', code: '090267' },
  { name: 'Moniepoint MFB', code: '50515' },
  { name: 'OPay', code: '999992' },
  { name: 'PalmPay', code: '999991' },
  { name: 'Polaris Bank', code: '076' },
  { name: 'Providus Bank', code: '101' },
  { name: 'Stanbic IBTC Bank', code: '221' },
  { name: 'Standard Chartered', code: '068' },
  { name: 'Sterling Bank', code: '232' },
  { name: 'SunTrust Bank', code: '100' },
  { name: 'Titan Trust Bank', code: '102' },
  { name: 'Union Bank of Nigeria', code: '032' },
  { name: 'United Bank for Africa', code: '033' },
  { name: 'Unity Bank', code: '215' },
  { name: 'VFD Microfinance Bank', code: '090110' },
  { name: 'Wema Bank', code: '035' },
  { name: 'Zenith Bank', code: '057' },
];
```

- [ ] **Step 2: Create `convex/bankAccounts.ts` with queries and mutations**

Create `convex/bankAccounts.ts`:

```typescript
import { v } from 'convex/values';
import { query, mutation } from './_generated/server';
import { getCurrentUser } from './auth';
import { getOrCreateCurrentUser } from './auth';

// ─── Validators ──────────────────────────────────────────────────────────────

const currencyValidator = v.union(
  v.literal('NGN'),
  v.literal('USD'),
  v.literal('GBP'),
  v.literal('EUR')
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Validate that the authenticated user owns the given entity.
 * Follows the same pattern as reports.ts:29-35.
 * Uses getCurrentUser (queries) or getOrCreateCurrentUser (mutations).
 */
async function validateOwnershipQuery(ctx: any, entityId: any) {
  const user = await getCurrentUser(ctx);
  if (!user) return null;
  const entity = await ctx.db.get(entityId);
  if (!entity || entity.userId !== user._id || entity.deletedAt) return null;
  return { user, entity };
}

async function validateOwnershipMutation(ctx: any, entityId: any) {
  const user = await getOrCreateCurrentUser(ctx);
  if (!user) return null;
  const entity = await ctx.db.get(entityId);
  if (!entity || entity.userId !== user._id || entity.deletedAt) return null;
  return { user, entity };
}

// ─── Queries ─────────────────────────────────────────────────────────────────

/** List active bank accounts for an entity */
export const listByEntity = query({
  args: { entityId: v.id('entities') },
  handler: async (ctx, args) => {
    const ownership = await validateOwnershipQuery(ctx, args.entityId);
    if (!ownership) return [];
    return await ctx.db
      .query('bankAccounts')
      .withIndex('by_entityId_isActive', (q: any) =>
        q.eq('entityId', args.entityId).eq('isActive', true)
      )
      .collect();
  },
});

/** List all bank accounts (including archived) for management page */
export const listAllByEntity = query({
  args: { entityId: v.id('entities') },
  handler: async (ctx, args) => {
    const ownership = await validateOwnershipQuery(ctx, args.entityId);
    if (!ownership) return [];
    return await ctx.db
      .query('bankAccounts')
      .withIndex('by_entityId', (q: any) => q.eq('entityId', args.entityId))
      .collect();
  },
});

/** Get a single bank account by ID */
export const get = query({
  args: { bankAccountId: v.id('bankAccounts') },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.bankAccountId);
    if (!account) return null;
    const ownership = await validateOwnershipQuery(ctx, account.entityId);
    if (!ownership) return null;
    return account;
  },
});

// ─── Mutations ───────────────────────────────────────────────────────────────

/** Create a new bank account */
export const create = mutation({
  args: {
    entityId: v.id('entities'),
    bankName: v.string(),
    bankCode: v.string(),
    accountNumber: v.optional(v.string()),
    accountName: v.optional(v.string()),
    nickname: v.string(),
    currency: v.optional(currencyValidator),
  },
  handler: async (ctx, args) => {
    const ownership = await validateOwnershipMutation(ctx, args.entityId);
    if (!ownership) throw new Error('Entity not found or unauthorized');

    // Validate NUBAN if provided
    if (args.accountNumber && !/^\d{10}$/.test(args.accountNumber)) {
      throw new Error('Account number must be exactly 10 digits');
    }

    const now = Date.now();
    return await ctx.db.insert('bankAccounts', {
      entityId: args.entityId,
      userId: ownership.user._id,
      bankName: args.bankName,
      bankCode: args.bankCode,
      accountNumber: args.accountNumber,
      accountName: args.accountName,
      nickname: args.nickname,
      currency: args.currency ?? 'NGN',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Update a bank account's editable fields */
export const update = mutation({
  args: {
    bankAccountId: v.id('bankAccounts'),
    accountNumber: v.optional(v.string()),
    accountName: v.optional(v.string()),
    nickname: v.optional(v.string()),
    currency: v.optional(currencyValidator),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.bankAccountId);
    if (!account) throw new Error('Bank account not found');
    const ownership = await validateOwnershipMutation(ctx, account.entityId);
    if (!ownership) throw new Error('Unauthorized');

    if (args.accountNumber !== undefined && args.accountNumber && !/^\d{10}$/.test(args.accountNumber)) {
      throw new Error('Account number must be exactly 10 digits');
    }

    const patch: Record<string, any> = { updatedAt: Date.now() };
    if (args.accountNumber !== undefined) patch.accountNumber = args.accountNumber;
    if (args.accountName !== undefined) patch.accountName = args.accountName;
    if (args.nickname !== undefined) patch.nickname = args.nickname;
    if (args.currency !== undefined) patch.currency = args.currency;

    await ctx.db.patch(args.bankAccountId, patch);
  },
});

/** Archive (soft delete) a bank account */
export const archive = mutation({
  args: { bankAccountId: v.id('bankAccounts') },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.bankAccountId);
    if (!account) throw new Error('Bank account not found');
    const ownership = await validateOwnershipMutation(ctx, account.entityId);
    if (!ownership) throw new Error('Unauthorized');
    await ctx.db.patch(args.bankAccountId, { isActive: false, updatedAt: Date.now() });
  },
});

/** Restore an archived bank account */
export const restore = mutation({
  args: { bankAccountId: v.id('bankAccounts') },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.bankAccountId);
    if (!account) throw new Error('Bank account not found');
    const ownership = await validateOwnershipMutation(ctx, account.entityId);
    if (!ownership) throw new Error('Unauthorized');
    await ctx.db.patch(args.bankAccountId, { isActive: true, updatedAt: Date.now() });
  },
});

/**
 * Assign a bank account to a single transaction.
 * If the transaction has an importJobId, returns the count of sibling transactions
 * so the frontend can prompt for batch assignment.
 */
export const assignToTransaction = mutation({
  args: {
    transactionId: v.id('transactions'),
    bankAccountId: v.id('bankAccounts'),
  },
  handler: async (ctx, args) => {
    const tx = await ctx.db.get(args.transactionId);
    if (!tx) throw new Error('Transaction not found');
    const ownership = await validateOwnershipMutation(ctx, tx.entityId);
    if (!ownership) throw new Error('Unauthorized');

    await ctx.db.patch(args.transactionId, {
      bankAccountId: args.bankAccountId,
      updatedAt: Date.now(),
    });

    // Check if this transaction has siblings via importJobId
    if (tx.importJobId) {
      const siblings = await ctx.db
        .query('transactions')
        .withIndex('by_entityId_date', (q: any) => q.eq('entityId', tx.entityId))
        .filter((q: any) =>
          q.and(
            q.eq(q.field('importJobId'), tx.importJobId),
            q.neq(q.field('_id'), args.transactionId),
            q.or(
              q.eq(q.field('bankAccountId'), undefined),
              q.neq(q.field('bankAccountId'), args.bankAccountId)
            )
          )
        )
        .collect();
      return { siblingCount: siblings.length, importJobId: tx.importJobId };
    }

    return { siblingCount: 0, importJobId: null };
  },
});

/**
 * Batch-assign a bank account to all transactions sharing an importJobId.
 */
export const assignToImportJob = mutation({
  args: {
    importJobId: v.id('importJobs'),
    bankAccountId: v.id('bankAccounts'),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.importJobId);
    if (!job) throw new Error('Import job not found');
    const ownership = await validateOwnershipMutation(ctx, job.entityId);
    if (!ownership) throw new Error('Unauthorized');

    // Update the import job itself
    await ctx.db.patch(args.importJobId, {
      bankAccountId: args.bankAccountId,
      updatedAt: Date.now(),
    });

    // Update all transactions from this job
    const transactions = await ctx.db
      .query('transactions')
      .withIndex('by_entityId_date', (q: any) => q.eq('entityId', job.entityId))
      .filter((q: any) => q.eq(q.field('importJobId'), args.importJobId))
      .collect();

    const now = Date.now();
    let updated = 0;
    for (const tx of transactions) {
      await ctx.db.patch(tx._id, { bankAccountId: args.bankAccountId, updatedAt: now });
      updated++;
    }

    return { updated };
  },
});
```

Note: `getCurrentUser` and `getOrCreateCurrentUser` are both imported from `convex/auth.ts`. Queries use `getCurrentUser`; mutations use `getOrCreateCurrentUser`. This follows the established codebase pattern (see `convex/reports.ts` for queries, `convex/mutations.ts` for mutations).

- [ ] **Step 3: Verify backend compiles**

Run: `npx convex dev --once`
Expected: Compiles and pushes successfully.

- [ ] **Step 4: Commit**

```bash
git add convex/bankAccounts.ts convex/lib/nigerianBanks.ts
git commit -m "feat(bankAccounts): add CRUD mutations, queries, and Nigerian banks list"
```

---

### Task 3: Backend — Propagate `bankAccountId` through import pipeline

**Files:**
- Modify: `convex/transactions.ts:835-865` (initiateImport mutation)
- Modify: `convex/importHelpers.ts:102-189` (batchInsert mutation)

- [ ] **Step 1: Add `bankAccountId` arg to `initiateImport`**

In `convex/transactions.ts`, modify the `initiateImport` mutation (line 836-841) to accept `bankAccountId`:

```typescript
// Add to args (after connectedAccountId on line 840):
    bankAccountId: v.optional(v.id('bankAccounts')),
```

And in the handler, pass it to the insert (after line 855):

```typescript
      bankAccountId: args.bankAccountId,
```

- [ ] **Step 2: Add `bankAccountId` to `batchInsert` and propagate to transactions**

In `convex/importHelpers.ts`, modify the `batchInsert` mutation:

Add to args (after `userId` on line 106):

```typescript
    bankAccountId: v.optional(v.id('bankAccounts')),
```

In the insert call (line 161-179), add after `importJobId: args.jobId,` (line 164):

```typescript
        bankAccountId: args.bankAccountId,
```

- [ ] **Step 3: Pass `bankAccountId` through `processImport` action**

In `convex/importPipeline.ts`, the `processImport` action (line 536) needs to read `bankAccountId` from the job and pass it to `batchInsert`.

After the job is fetched (line 547), destructure `bankAccountId`:

```typescript
    const { entityId, userId, storageId, source, bankAccountId } = job;
```

In the `batchInsert` call within the chunking loop (around lines 623-628), add `bankAccountId`:

```typescript
        bankAccountId,
```

- [ ] **Step 4: Verify backend compiles**

Run: `npx convex dev --once`
Expected: Compiles successfully.

- [ ] **Step 5: Commit**

```bash
git add convex/transactions.ts convex/importHelpers.ts convex/importPipeline.ts
git commit -m "feat(bankAccounts): propagate bankAccountId through import pipeline"
```

---

### Task 4: Frontend — BankAccountSelector reusable component

**Files:**
- Create: `apps/web/src/components/BankAccountSelector.tsx`

This component is used in onboarding, ImportTransactions, and transaction detail. It shows a dropdown of active bank accounts with an inline "Add new" form.

- [ ] **Step 1: Create BankAccountSelector component**

Create `apps/web/src/components/BankAccountSelector.tsx`:

```tsx
import { useState, useMemo } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import { Id } from '@convex/_generated/dataModel';
import { NIGERIAN_BANKS } from '@convex/lib/nigerianBanks';
import {
  ChevronDown,
  Plus,
  Building2,
  Search,
  Check,
} from 'lucide-react';

interface BankAccountSelectorProps {
  entityId: Id<'entities'>;
  value: Id<'bankAccounts'> | null;
  onChange: (bankAccountId: Id<'bankAccounts'>) => void;
  placeholder?: string;
  compact?: boolean; // smaller variant for onboarding
}

export function BankAccountSelector({
  entityId,
  value,
  onChange,
  placeholder = 'Select bank account',
  compact = false,
}: BankAccountSelectorProps) {
  const accounts = useQuery(api.bankAccounts.listByEntity, { entityId });
  const createAccount = useMutation(api.bankAccounts.create);

  const [isOpen, setIsOpen] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Create form state
  const [bankSearch, setBankSearch] = useState('');
  const [selectedBank, setSelectedBank] = useState<{ name: string; code: string } | null>(null);
  const [accountNumber, setAccountNumber] = useState('');
  const [nickname, setNickname] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const selectedAccount = useMemo(
    () => accounts?.find((a) => a._id === value) ?? null,
    [accounts, value]
  );

  const filteredBanks = useMemo(() => {
    if (!bankSearch) return NIGERIAN_BANKS;
    const q = bankSearch.toLowerCase();
    return NIGERIAN_BANKS.filter((b) => b.name.toLowerCase().includes(q));
  }, [bankSearch]);

  const handleCreate = async () => {
    if (!selectedBank || !nickname.trim()) return;
    setIsCreating(true);
    try {
      const id = await createAccount({
        entityId,
        bankName: selectedBank.name,
        bankCode: selectedBank.code,
        accountNumber: accountNumber || undefined,
        nickname: nickname.trim(),
      });
      onChange(id);
      setShowCreateForm(false);
      setIsOpen(false);
      // Reset form
      setBankSearch('');
      setSelectedBank(null);
      setAccountNumber('');
      setNickname('');
    } finally {
      setIsCreating(false);
    }
  };

  // --- Render ---

  // The component renders:
  // 1. A trigger button showing selected account or placeholder
  // 2. A dropdown with account list + "Add new" option
  // 3. Inline create form when "Add new" is clicked
  //
  // Implementation: standard dropdown pattern matching existing UI
  // (e.g., CategoryPickerModal's search + list pattern).
  //
  // Trigger button shows: selectedAccount?.nickname ?? placeholder
  // Dropdown items: accounts?.map(a => <button onClick={() => { onChange(a._id); setIsOpen(false); }}>)
  // Last item: "Add new account" button → toggles showCreateForm
  // Create form: bank name searchable list, account number input, nickname input, Create button
  //
  // Style: match the existing design system (rounded-xl borders, text-gray-700,
  // green-700 accent, shadow-lg dropdown, etc.)

  return (
    <div className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-between w-full border border-gray-200 rounded-xl
          bg-white text-left ${compact ? 'px-3 py-2 text-sm' : 'px-4 py-3'}
          hover:border-green-300 transition-colors`}
      >
        <span className={selectedAccount ? 'text-gray-900' : 'text-gray-400'}>
          {selectedAccount ? (
            <span className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-gray-400" />
              {selectedAccount.nickname}
            </span>
          ) : (
            placeholder
          )}
        </span>
        <ChevronDown className="w-4 h-4 text-gray-400" />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-80 overflow-y-auto">
          {!showCreateForm ? (
            <>
              {/* Existing accounts */}
              {accounts?.map((account) => (
                <button
                  key={account._id}
                  type="button"
                  onClick={() => {
                    onChange(account._id);
                    setIsOpen(false);
                  }}
                  className="flex items-center justify-between w-full px-4 py-3 hover:bg-gray-50 text-left"
                >
                  <div>
                    <div className="text-sm font-medium text-gray-900">{account.nickname}</div>
                    <div className="text-xs text-gray-500">
                      {account.bankName}
                      {account.accountNumber ? ` · ···${account.accountNumber.slice(-4)}` : ''}
                    </div>
                  </div>
                  {account._id === value && <Check className="w-4 h-4 text-green-600" />}
                </button>
              ))}

              {/* Divider + Add new */}
              <div className="border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(true)}
                  className="flex items-center gap-2 w-full px-4 py-3 hover:bg-gray-50 text-green-700 text-sm font-medium"
                >
                  <Plus className="w-4 h-4" />
                  Add new bank account
                </button>
              </div>
            </>
          ) : (
            /* Inline create form */
            <div className="p-4 space-y-3">
              <div className="text-sm font-medium text-gray-700">New bank account</div>

              {/* Bank search */}
              {!selectedBank ? (
                <div>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={bankSearch}
                      onChange={(e) => setBankSearch(e.target.value)}
                      placeholder="Search bank…"
                      className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      autoFocus
                    />
                  </div>
                  <div className="mt-2 max-h-36 overflow-y-auto">
                    {filteredBanks.map((bank) => (
                      <button
                        key={bank.code}
                        type="button"
                        onClick={() => {
                          setSelectedBank(bank);
                          setNickname(bank.name);
                          setBankSearch('');
                        }}
                        className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50 rounded"
                      >
                        {bank.name}
                      </button>
                    ))}
                    {/* "Other" option */}
                    {bankSearch.trim() && !filteredBanks.length && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedBank({ name: bankSearch.trim(), code: '' });
                          setNickname(bankSearch.trim());
                          setBankSearch('');
                        }}
                        className="block w-full text-left px-3 py-2 text-sm text-green-700 hover:bg-gray-50 rounded"
                      >
                        Use "{bankSearch.trim()}" as bank name
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-lg">
                  <span className="text-sm text-gray-900">{selectedBank.name}</span>
                  <button
                    type="button"
                    onClick={() => setSelectedBank(null)}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    Change
                  </button>
                </div>
              )}

              {/* Account number (optional) */}
              <input
                type="text"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="Account number (optional)"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                inputMode="numeric"
              />

              {/* Nickname */}
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Nickname (e.g. GTBank Savings)"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(false);
                    setSelectedBank(null);
                    setAccountNumber('');
                    setNickname('');
                  }}
                  className="flex-1 px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={!selectedBank || !nickname.trim() || isCreating}
                  className="flex-1 px-3 py-2 text-sm text-white bg-green-700 rounded-lg hover:bg-green-800 disabled:opacity-50"
                >
                  {isCreating ? 'Creating…' : 'Create'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit` (from `apps/web`)
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/BankAccountSelector.tsx
git commit -m "feat(bankAccounts): add reusable BankAccountSelector component"
```

---

### Task 5: Frontend — Onboarding Step 4 changes

**Files:**
- Modify: `apps/web/src/pages/Onboarding.tsx`

Three changes: (1) enable Upload bank statement with inline upload + bank selector, (2) disable Paystack, (3) disable Flutterwave.

- [ ] **Step 1: Disable Paystack and Flutterwave options**

In `Onboarding.tsx`, replace the Paystack card (lines 1135-1181) and Flutterwave card (lines 1184-1228) with disabled "Coming soon" versions. They should match the existing disabled style used by "Connect bank account" (lines 1118-1132) — greyed out, `opacity-60`, "Coming soon" badge, non-interactive.

Remove or guard the `ApiKeyForm` rendering for both providers. The `ApiKeyForm` component itself can stay in the file (it may be re-enabled later), but it should not be rendered.

- [ ] **Step 2: Enable Upload bank statement card with inline upload**

Replace the disabled "Upload bank statement" card (lines 1101-1115) with an interactive expandable card. When tapped:

1. Card expands to show:
   - `BankAccountSelector` component (from Task 4)
   - Drop zone for PDF/CSV (reuse the `DropZone` pattern from `ImportTransactions.tsx:71-155`)
   - Either-order interaction: if file dropped without account selected, show prompt "Which bank account is this statement from?"
2. On file drop with account selected:
   - Generate upload URL → upload file → call `initiateImport` with `bankAccountId` → fire-and-forget `processImport`
   - Show compact progress row: filename, spinner/checkmark, account nickname
   - Multiple uploads supported — each gets its own progress row
3. Processing continues after "Finish Setup" is clicked

The upload logic follows the exact same pattern as `ImportTransactions.tsx:230-298` (generateUploadUrl → fetch PUT → initiateImport → processImport), but without blocking the UI.

State management: use a local `uploads` array state:
```typescript
type OnboardingUpload = {
  id: string;        // unique key
  filename: string;
  bankAccountNickname: string;
  status: 'uploading' | 'processing' | 'complete' | 'error';
  jobId?: Id<'importJobs'>;
};
```

For each upload in the `uploads` array, render a compact status row. Use `ImportJobWatcher` pattern (query job status reactively) to update from 'processing' → 'complete'/'error'.

- [ ] **Step 3: Verify onboarding renders correctly**

Run the dev server (`npm run dev`), navigate to onboarding Step 4, and confirm:
- Upload bank statement card is active and expandable
- Paystack and Flutterwave are greyed out with "Coming soon"
- Other cards unchanged

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/Onboarding.tsx
git commit -m "feat(onboarding): enable statement upload, disable Paystack/Flutterwave"
```

---

### Task 6: Frontend — ImportTransactions page bank account integration

**Files:**
- Modify: `apps/web/src/pages/ImportTransactions.tsx`

- [ ] **Step 1: Add bank account selector to Upload tab**

In `ImportTransactions.tsx`, modify the `UploadTab` component (lines 218-480):

1. Add state: `const [selectedBankAccountId, setSelectedBankAccountId] = useState<Id<'bankAccounts'> | null>(null);`
2. Add `BankAccountSelector` above the drop zone in the idle state (lines 319-326)
3. When file is dropped without a bank account selected, show a prompt instead of immediately uploading: "Which bank account is this statement from?" with the selector. Store the pending file in state.
4. Once both file and account are selected, proceed with existing upload flow
5. Pass `bankAccountId: selectedBankAccountId` to the `initiateImport` call (around line 271-277)

The either-order logic:
- If account selected first → file drop triggers upload immediately
- If file dropped first → store file in state, show selector prompt, upload triggers when account is selected

- [ ] **Step 2: Verify the upload flow works end-to-end**

Run dev server, navigate to Import Transactions, and test both paths:
- Select account → drop file → upload starts
- Drop file → prompted for account → select account → upload starts

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/ImportTransactions.tsx
git commit -m "feat(import): add bank account selection to statement upload flow"
```

---

### Task 7: Frontend — Bank account management on ConnectedAccounts page

**Files:**
- Modify: `apps/web/src/pages/ConnectedAccounts.tsx`

- [ ] **Step 1: Add "Bank Accounts" section above connected accounts**

In `ConnectedAccounts.tsx`, add a new section at the top of the page (before the existing accounts list, around line 232):

1. Section header: "Bank Accounts" with an "Add Bank Account" button
2. Query: `useQuery(api.bankAccounts.listAllByEntity, { entityId })`
3. Active accounts list: each card shows nickname, bank name, account number (masked: ···1234), currency
   - Click → opens edit modal (edit nickname, account name, account number)
   - Archive button (with confirmation)
4. Archived section (collapsed by default): shows archived accounts with "Restore" button
5. Empty state: "No bank accounts yet. Add one to start tracking transactions by account."

The card style should match the existing `AccountCard` component pattern (lines 144-191) but with bank-specific fields instead of provider/sync info.

- [ ] **Step 2: Add edit and archive mutations**

Wire up the `bankAccounts.update`, `bankAccounts.archive`, and `bankAccounts.restore` mutations from Task 2.

- [ ] **Step 3: Verify the page works**

Run dev server, navigate to Connected Accounts, and test:
- Add a new bank account
- Edit nickname/account number
- Archive and restore

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/ConnectedAccounts.tsx
git commit -m "feat(bankAccounts): add bank account management to ConnectedAccounts page"
```

---

### Task 8: Frontend — Retroactive bank account assignment on Transactions page

**Files:**
- Modify: `apps/web/src/pages/Transactions.tsx`

- [ ] **Step 1: Add bank account badge to transaction rows**

In `Transactions.tsx`, for each transaction row, if the transaction has a `bankAccountId`, show a small badge/chip with the bank account nickname. Query bank accounts for the entity: `useQuery(api.bankAccounts.listByEntity, { entityId })` and build a lookup map by ID.

- [ ] **Step 2: Add "Assign to Bank Account" to single transaction actions**

When a user clicks a transaction (or accesses its detail/context menu), add an "Assign Bank Account" option. This opens a `BankAccountSelector` dropdown.

On selection, call `bankAccounts.assignToTransaction`. If the response has `siblingCount > 0`, show a confirmation dialog:

> "This transaction was imported with {siblingCount} other transactions. Assign all of them to {accountNickname}?"
>
> [Just this one] [Assign all]

If "Assign all" is clicked, call `bankAccounts.assignToImportJob` with the returned `importJobId`.

- [ ] **Step 3: Add bulk "Assign to Bank Account" action**

In the existing bulk action toolbar (appears when transactions are selected via checkboxes), add an "Assign Bank Account" button. On click, show the `BankAccountSelector`. On selection, iterate selected transaction IDs and call `bankAccounts.assignToTransaction` for each. If any return siblings, prompt for batch assignment as above.

Note: For simplicity in v1, bulk assign can process sequentially. If performance is a concern, batch can be optimized later.

- [ ] **Step 4: Verify retroactive assignment works**

Test:
- Assign a single transaction → check sibling prompt appears for imported transactions
- Confirm "Assign all" propagates to all import job transactions
- Bulk select + assign

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/Transactions.tsx
git commit -m "feat(bankAccounts): add retroactive bank account assignment to transactions"
```

---

### Task 9: Backend — Reports queries with bank account filtering

**Files:**
- Modify: `convex/reports.ts`

- [ ] **Step 1: Add `bankAccountIds` and `includeUnlinked` params to `getIncome`**

In `convex/reports.ts`, modify the `getIncome` query (line 87):

Add to args:
```typescript
    bankAccountIds: v.optional(v.array(v.id('bankAccounts'))),
    includeUnlinked: v.optional(v.boolean()),
```

After fetching `txList` (around line 107/115), add a filter step:

```typescript
    // Bank account filtering
    if (args.bankAccountIds?.length || args.includeUnlinked) {
      const accountIdSet = new Set(args.bankAccountIds ?? []);
      txList = txList.filter((tx: any) => {
        if (tx.bankAccountId && accountIdSet.has(tx.bankAccountId)) return true;
        if (args.includeUnlinked && !tx.bankAccountId) return true;
        return false;
      });
    }
```

- [ ] **Step 2: Add same filtering to `getExpenses`**

Same pattern as Step 1, applied to the `getExpenses` query (line 192).

- [ ] **Step 3: Add same filtering to `getYearOnYear`**

For `getYearOnYear` (line 321), add the same `bankAccountIds` and `includeUnlinked` args.

The filtering applies to the four transaction lists fetched at lines 351-381 (`currentIncomeTx`, `priorIncomeTx`, `currentExpenseTx`, `priorExpenseTx`). Add the bank account filter function and apply it to each list after fetching:

```typescript
    // Add after line 381 (after the Promise.all block)
    function filterByBankAccount(txs: any[]) {
      if (!args.bankAccountIds?.length && !args.includeUnlinked) return txs;
      const accountIdSet = new Set(args.bankAccountIds ?? []);
      return txs.filter((tx: any) => {
        if (tx.bankAccountId && accountIdSet.has(tx.bankAccountId)) return true;
        if (args.includeUnlinked && !tx.bankAccountId) return true;
        return false;
      });
    }

    const filteredCurrentIncomeTx = filterByBankAccount(currentIncomeTx);
    const filteredPriorIncomeTx = filterByBankAccount(priorIncomeTx);
    const filteredCurrentExpenseTx = filterByBankAccount(currentExpenseTx);
    const filteredPriorExpenseTx = filterByBankAccount(priorExpenseTx);
```

Then replace all subsequent references to `currentIncomeTx` etc. with the filtered versions. Crucially, when bank account filters are active, always compute totals from transactions (never use `taxYearSummaries` cache, which has no account granularity):

```typescript
    const isFiltered = !!(args.bankAccountIds?.length || args.includeUnlinked);

    const currentIncome = isFiltered
      ? filteredCurrentIncomeTx.reduce((s: number, t: any) => s + (t.amountNgn ?? 0), 0)
      : (currentSummary?.totalGrossIncome ??
         currentIncomeTx.reduce((s: number, t: any) => s + (t.amountNgn ?? 0), 0));
    // Same pattern for priorIncome, currentExpenses, priorExpenses
    // For tax payable when filtered: set to 0 (can't compute per-account tax)
```

Use the filtered lists for `buildMonthly()` calls as well.

- [ ] **Step 4: Add `getByAccount` query for the "By Account" tab**

Add a new query to `convex/reports.ts`:

```typescript
/** Per-account summary for the "By Account" tab */
export const getByAccount = query({
  args: {
    entityId: v.id('entities'),
    taxYear: v.optional(v.number()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ownership = await validateOwnership(ctx, args.entityId);
    if (!ownership) return null;

    // Fetch all transactions for the period (same fetching logic as getIncome)
    let txList: any[];
    if (args.taxYear !== undefined) {
      txList = await ctx.db
        .query('transactions')
        .withIndex('by_entityId_taxYear', (q: any) =>
          q.eq('entityId', args.entityId).eq('taxYear', args.taxYear)
        )
        .collect();
    } else {
      txList = await ctx.db
        .query('transactions')
        .withIndex('by_entityId_date', (q: any) =>
          q.eq('entityId', args.entityId)
        )
        .collect();
      // Apply date range filter if provided
      if (args.startDate || args.endDate) {
        const start = args.startDate ? new Date(args.startDate).getTime() : 0;
        const end = args.endDate ? new Date(args.endDate).getTime() : Infinity;
        txList = txList.filter((tx: any) => tx.date >= start && tx.date <= end);
      }
    }

    // Group by bankAccountId
    const groups = new Map<string, { income: number; expenses: number; count: number }>();
    const UNLINKED = '__unlinked__';

    for (const tx of txList) {
      const key = tx.bankAccountId ?? UNLINKED;
      const group = groups.get(key) ?? { income: 0, expenses: 0, count: 0 };
      if (tx.direction === 'credit') {
        group.income += tx.amountNgn;
      } else {
        group.expenses += tx.amountNgn;
      }
      group.count++;
      groups.set(key, group);
    }

    // Fetch bank account names
    const bankAccounts = await ctx.db
      .query('bankAccounts')
      .withIndex('by_entityId', (q: any) => q.eq('entityId', args.entityId))
      .collect();
    const nameMap = new Map(bankAccounts.map((a) => [a._id, a.nickname]));

    const rows = Array.from(groups.entries()).map(([key, data]) => ({
      bankAccountId: key === UNLINKED ? null : key,
      accountName: key === UNLINKED ? 'Unlinked' : (nameMap.get(key as any) ?? 'Unknown'),
      income: data.income,
      expenses: data.expenses,
      net: data.income - data.expenses,
      transactionCount: data.count,
    }));

    // Sort: named accounts first (alphabetical), then Unlinked last
    rows.sort((a, b) => {
      if (!a.bankAccountId) return 1;
      if (!b.bankAccountId) return -1;
      return a.accountName.localeCompare(b.accountName);
    });

    return rows;
  },
});
```

- [ ] **Step 5: Add bank account filter to export helpers**

Modify `_getIncomeRows` (line 465) and `_getExpenseRows` (line 527) to accept optional `bankAccountIds` and `includeUnlinked` parameters and apply the same filtering logic.

- [ ] **Step 6: Verify queries compile**

Run: `npx convex dev --once`
Expected: Compiles successfully.

- [ ] **Step 7: Commit**

```bash
git add convex/reports.ts
git commit -m "feat(reports): add bank account filtering to all report queries"
```

---

### Task 10: Frontend — Reports page bank account filter and "By Account" tab

**Files:**
- Modify: `apps/web/src/pages/Reports.tsx`

- [ ] **Step 1: Add bank account filter state and UI**

In `Reports.tsx`:

1. Add state:
```typescript
const [selectedBankAccountIds, setSelectedBankAccountIds] = useState<Id<'bankAccounts'>[]>([]);
const [includeUnlinked, setIncludeUnlinked] = useState(false);
```

2. Query bank accounts: `const bankAccounts = useQuery(api.bankAccounts.listByEntity, { entityId });`

3. Add a multi-select dropdown next to the existing date range filter. Options:
   - "All accounts" (clears all selections — default)
   - Each bank account by nickname (toggle on/off)
   - "Unlinked transactions" (toggles `includeUnlinked`)

4. Pass `bankAccountIds` and `includeUnlinked` to the report queries:
```typescript
const incomeData = useQuery(api.reports.getIncome, {
  entityId,
  taxYear,
  startDate,
  endDate,
  bankAccountIds: selectedBankAccountIds.length ? selectedBankAccountIds : undefined,
  includeUnlinked: includeUnlinked || undefined,
});
```
Same for `getExpenses` and `getYearOnYear`.

- [ ] **Step 2: Update ActiveTab type and add "By Account" tab**

Update the `ActiveTab` type (line 34):

```typescript
type ActiveTab = 'income' | 'expenses' | 'year_on_year' | 'by_account';
```

Add a fourth tab button "By Account" in the tab bar.

- [ ] **Step 3: Build the "By Account" tab content**

When `activeTab === 'by_account'`:

1. Query: `useQuery(api.reports.getByAccount, { entityId, taxYear, startDate, endDate })`
2. Render a table with columns: Account, Income, Expenses, Net, Transactions
3. Each row is tappable — on click, set `selectedBankAccountIds` to that account's ID and switch to the "Income" tab (pre-filtering by that account)
4. Format amounts using existing `formatNaira` helper (kobo → naira display)
5. "Unlinked" row at the bottom if there are unlinked transactions

- [ ] **Step 4: Update export to pass bank account filter**

In the export handlers, pass the active `bankAccountIds` and `includeUnlinked` to the export actions so CSV/PDF respect the filter.

- [ ] **Step 5: Verify reports page works**

Run dev server, test:
- Bank account filter dropdown appears and works
- Filtering updates all chart/table data
- "By Account" tab shows per-account summary
- Clicking a row navigates to Income tab with filter applied
- Export respects filter

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/Reports.tsx
git commit -m "feat(reports): add bank account filter and By Account tab"
```

---

### Task 11: Export — Add "Bank Account" column to CSV/PDF exports

**Files:**
- Modify: `convex/reportActions.ts`

- [ ] **Step 1: Add bank account name to export rows**

In `convex/reportActions.ts`, modify the CSV export function to:

1. Accept `bankAccountIds` and `includeUnlinked` params (pass through to the internal query helpers)
2. For each transaction row, look up the bank account nickname (if `bankAccountId` is set)
3. Add a "Bank Account" column to the CSV output

For PDF export, add the same column to the table layout.

- [ ] **Step 2: Verify export works**

Test CSV export with and without bank account filter. Confirm "Bank Account" column appears.

- [ ] **Step 3: Commit**

```bash
git add convex/reportActions.ts
git commit -m "feat(reports): add Bank Account column to CSV/PDF exports"
```

---

### Task 12: Final integration testing and cleanup

**Files:**
- No new files — verify end-to-end flow

- [ ] **Step 1: End-to-end test: Onboarding upload**

1. Start fresh onboarding → reach Step 4
2. Tap "Upload bank statement" → create a new bank account → drop a PDF
3. Verify upload starts in background, progress row appears
4. Click "Finish Setup" while still processing
5. Verify processing completes (toast notification)

- [ ] **Step 2: End-to-end test: Import with bank account**

1. Go to Import Transactions
2. Test both paths: account-first and file-first
3. Verify transactions get `bankAccountId` set

- [ ] **Step 3: End-to-end test: Retroactive assignment**

1. Find a transaction imported before bank accounts existed
2. Assign it to a bank account
3. Confirm sibling prompt appears
4. "Assign all" → verify all import job transactions updated

- [ ] **Step 4: End-to-end test: Reports**

1. Open Reports → verify bank account filter dropdown
2. Filter by a specific account → charts update
3. Switch to "By Account" tab → verify summary table
4. Click a row → verify navigation to filtered Income tab
5. Export CSV → verify "Bank Account" column

- [ ] **Step 5: Verify Paystack/Flutterwave disabled in onboarding**

Confirm both options show "Coming soon" badge and are non-interactive.

- [ ] **Step 6: Commit any final fixes**

```bash
git add -A
git commit -m "fix: integration fixes for bank accounts feature"
```
