# PRD-8: Bank Linking & Live Sync

**TaxEase Nigeria**  
**Version:** 1.0 — February 2026  
**Status:** Draft  
**Priority:** P2 — Build as Enhancement  
**Estimated Effort:** 2–3 weeks

---

## Table of Contents

1. [Overview](#1-overview)
2. [Entities (TypeScript Interfaces)](#2-entities-typescript-interfaces)
3. [User Stories](#3-user-stories)
4. [UI Specifications](#4-ui-specifications)
5. [Functional Requirements](#5-functional-requirements)
6. [API Requirements (Convex Functions)](#6-api-requirements-convex-functions)
7. [Data Models](#7-data-models)
8. [Non-Goals](#8-non-goals)
9. [Success Metrics](#9-success-metrics)
10. [Open Questions](#10-open-questions)

---

## 1. Overview

### 1.1 Purpose

PRD-8 upgrades TaxEase Nigeria from manual bank statement import (PDF/CSV, built in PRD-1) to **live bank connections** via Nigerian Open Banking APIs (Mono, Stitch) and payment platform integrations (Paystack, Flutterwave, Payoneer, Wise). Users can link their bank and fintech accounts for automatic transaction import — removing the friction of periodic file uploads and ensuring their ledger stays current.

This is a **Layer 4 enhancement**. The PDF/CSV import path from PRD-1 remains the primary import method for v1. Bank API integration is additive — it provides a superior experience for users whose banks are supported, but the app remains fully functional without it.

### 1.2 Scope

| In Scope | Out of Scope |
|----------|--------------|
| Connected Accounts screen (list, status, actions) | AI categorisation of synced transactions (PRD-2) |
| Bank linking via Mono Connect widget | Tax calculation on synced transactions (PRD-3) |
| Bank linking via Stitch Link widget | Invoice matching for synced transactions (PRD-4) |
| Paystack account connection (API key) | Push notification delivery infrastructure (PRD-9) |
| Flutterwave account connection (API key) | New bank statement parsers (PRD-1 scope) |
| Payoneer account connection (OAuth) | Multi-currency wallet management |
| Wise account connection (OAuth) | Real-time balance display |
| OAuth callback handling and token storage | Direct bank-to-bank transfers |
| Token encryption (AES-256-GCM) | |
| Token refresh (automatic, transparent) | |
| Manual sync ("Sync Now") | |
| Scheduled background sync (every 6 hours) | |
| Webhook-driven sync (bank push notifications) | |
| Webhook signature verification | |
| Sync status indicators and history | |
| Error handling and re-authentication prompts | |
| Account disconnect and reconnect | |
| Deduplication (via PRD-1's batchUpsert) | |
| FX conversion for foreign-currency accounts | |
| Onboarding Step 4 integration (activate placeholders) | |

### 1.3 What It Delivers

Upon completion of PRD-8, a user can:

1. **Link a bank account** via Mono or Stitch Connect widget (in-app browser/WebView)
2. **Link Paystack/Flutterwave** by entering their API key
3. **Link Payoneer/Wise** via OAuth flow for foreign income tracking
4. **View all connected accounts** with status badges and last-synced timestamps
5. **Trigger manual sync** to pull latest transactions on demand
6. **Rely on automatic sync** every 6 hours for active linked accounts
7. **Receive webhook-pushed transactions** in near real-time when the bank notifies
8. **See sync progress and results** including counts and duplicate handling
9. **Handle errors gracefully** — see error messages, retry, or re-authenticate
10. **Disconnect accounts** and optionally reconnect later
11. **Keep existing transactions** when disconnecting (transactions are never deleted on disconnect)

### 1.4 Dependencies

- **PRD-0** (users, entities, connectedAccounts schema) — already built
- **PRD-1** (transaction import pipeline — `batchUpsert`, dedup, importJobs) — already built; sync feeds the same path
- **External:** Mono Connect API, Stitch Link API, Paystack API, Flutterwave API, Payoneer API, Wise API
- **Blocks:** Nothing directly

### 1.5 Key Design Decisions

- **PRD-1's import pipeline is source-agnostic.** `transactions.batchUpsert` and `importJobs` are reused wholesale. The sync action creates an importJob with `source: "bank_api" | "paystack" | "flutterwave"` and calls batchUpsert with the same dedup logic.
- **Token encryption is mandatory.** OAuth access/refresh tokens are AES-256-GCM encrypted before writing to Convex. The encryption key lives in a Convex environment variable, never in client code.
- **Nigerian Open Banking is still maturing.** Token refresh reliability, rate limits, and provider-specific parsing quirks will dominate the effort. Defensive coding with retry logic and clear error surfaces is critical.
- **Graceful degradation.** If a provider API is down or a token is invalid, the user sees a clear error and can fall back to PDF/CSV import. The app never blocks on a failed sync.
- **Webhook security.** All incoming webhooks are verified via provider-specific signature verification before processing.

---

## 2. Entities (TypeScript Interfaces)

### 2.1 ConnectedAccount (Enhanced for Live Linking)

```typescript
/** Bank / fintech / payment platform account linked for live or manual sync */
interface ConnectedAccount {
  _id: Id<"connectedAccounts">;
  _creationTime: number;
  entityId: Id<"entities">;
  userId: Id<"users">;
  provider: ConnectedAccountProvider;
  providerAccountId?: string;           // External account ID from provider (e.g. Mono account ID)
  accountName: string;                  // Display name (e.g. "GTBank — Savings 0123456789")
  currency: string;                     // ISO 4217 (e.g. "NGN", "USD")
  accessToken?: string;                 // AES-256-GCM encrypted OAuth access token
  refreshToken?: string;                // AES-256-GCM encrypted OAuth refresh token
  tokenExpiresAt?: number;              // Unix ms — when accessToken expires
  lastSyncedAt?: number;                // Unix ms — last successful sync timestamp
  status: ConnectedAccountStatus;
  errorMessage?: string;                // Human-readable error for display
  metadata?: ConnectedAccountMetadata;  // Provider-specific metadata
}

type ConnectedAccountProvider =
  | "gtbank" | "zenith" | "access"      // Nigerian banks (via Mono/Stitch)
  | "paystack" | "flutterwave"          // Payment platforms (API key)
  | "moniepoint" | "opay"               // Fintechs (via Mono/Stitch)
  | "payoneer" | "wise"                 // International platforms (OAuth)
  | "manual" | "statement_upload";      // Non-live sources (PRD-1)

type ConnectedAccountStatus = "active" | "error" | "disconnected";

interface ConnectedAccountMetadata {
  institutionId?: string;               // Mono/Stitch institution identifier
  institutionLogo?: string;             // URL to institution logo
  accountType?: string;                 // "savings", "current", "wallet"
  accountNumber?: string;               // Masked account number (e.g. "••••6789")
  linkProvider?: "mono" | "stitch";     // Which Open Banking aggregator was used
  apiKeyHash?: string;                  // SHA-256 hash of API key (for Paystack/Flutterwave — verify without storing plaintext)
}
```

### 2.2 SyncResult

```typescript
/** Result of a single sync operation (returned by accounts.syncNow) */
interface SyncResult {
  connectedAccountId: Id<"connectedAccounts">;
  importJobId: Id<"importJobs">;
  status: "success" | "partial" | "failed";
  totalFetched: number;                 // Transactions received from provider API
  totalImported: number;                // New transactions written
  duplicatesSkipped: number;            // Existing transactions matched and skipped
  newLastSyncedAt: number;              // Updated sync cursor (Unix ms)
  errorMessage?: string;                // Set if status is "partial" or "failed"
  providerRateLimited?: boolean;        // True if provider returned 429
}
```

### 2.3 OAuthCallbackData

```typescript
/** Data received from OAuth callback (Mono, Stitch, Payoneer, Wise) */
interface OAuthCallbackData {
  code: string;                         // Authorization code from provider
  provider: ConnectedAccountProvider;
  state: string;                        // CSRF state parameter — must match stored value
  entityId: Id<"entities">;             // Encoded in OAuth state
  userId: Id<"users">;                  // Encoded in OAuth state
}
```

### 2.4 OAuthState

```typescript
/** State stored before initiating OAuth — used to verify callback */
interface OAuthState {
  _id: Id<"oauthStates">;
  _creationTime: number;
  userId: Id<"users">;
  entityId: Id<"entities">;
  provider: ConnectedAccountProvider;
  stateToken: string;                   // Random UUID — matches state param in callback
  redirectUri: string;                  // Where to redirect after callback
  expiresAt: number;                    // Unix ms — state expires after 10 minutes
}
```

### 2.5 BankProvider

```typescript
/** Static configuration for each supported bank/provider integration */
interface BankProvider {
  id: ConnectedAccountProvider;
  displayName: string;                  // e.g. "Guaranty Trust Bank"
  shortName: string;                    // e.g. "GTBank"
  logo: string;                         // Asset path or URL
  type: "bank" | "fintech" | "payment_platform" | "international";
  connectionMethod: "mono" | "stitch" | "api_key" | "oauth";
  supportedCurrencies: string[];        // e.g. ["NGN"] or ["USD", "EUR", "GBP"]
  available: boolean;                   // Feature flag — can be toggled per provider
}
```

### 2.6 WebhookPayload

```typescript
/** Incoming webhook notification from Open Banking provider */
interface BankWebhookPayload {
  provider: "mono" | "stitch";
  event: "account.updated" | "transactions.new" | "account.reauthorization_required";
  data: {
    accountId: string;                  // Provider's account identifier
    timestamp: number;
  };
  signature: string;                    // HMAC signature for verification
}
```

### 2.7 TokenPair

```typescript
/** Decrypted token pair — never persisted in this form; only held in memory */
interface TokenPair {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;                    // Unix ms
}

/** Encrypted token pair — what is stored in connectedAccounts */
interface EncryptedTokenPair {
  accessToken: string;                  // AES-256-GCM ciphertext (base64)
  refreshToken?: string;                // AES-256-GCM ciphertext (base64)
  tokenExpiresAt: number;
}
```

### 2.8 ApiKeyConnectionData

```typescript
/** Data for connecting Paystack/Flutterwave via API key */
interface ApiKeyConnectionData {
  provider: "paystack" | "flutterwave";
  apiKey: string;                       // Secret key — encrypted before storage
  accountName: string;                  // User-provided display name
  entityId: Id<"entities">;
}
```

---

## 3. User Stories

### 3.1 Connected Accounts List

#### US-801: View connected accounts list

**As a** freelancer or SME owner  
**I want** to see all my linked bank and fintech accounts in one place  
**So that** I know which accounts are syncing, their status, and when they last updated.

**Trigger:** User navigates to Settings → Connected Accounts (or from Onboarding Step 4 / Import Transactions screen).

**Flow:**
1. User opens Connected Accounts screen
2. Screen loads list of connected accounts for the active entity via `accounts.list`
3. Each account displays as a card with: institution name + logo, account name, account type badge (bank, fintech, payment platform), last synced timestamp (relative — "2 hours ago"), status badge (Active / Error / Disconnected)
4. Cards are tappable — tapping opens account detail with actions
5. Footer shows "+ Add New Account" button

**Acceptance Criteria:**
- [ ] `accounts.list` returns all connected accounts for the active entity
- [ ] Each card shows institution logo (or fallback icon), account name, last synced, status
- [ ] Status badges use correct colours: Active = `#38A169` (success), Error = `#D69E2E` (warning), Disconnected = `#E53E3E` (danger)
- [ ] Last synced shows relative time (e.g. "2 hours ago", "Never" if null)
- [ ] Cards are sorted: active first, then error, then disconnected
- [ ] "+ Add New Account" button visible at bottom

---

#### US-802: Connected accounts empty state

**As a** user with no linked accounts  
**I want** to see a helpful empty state  
**So that** I know how to get started with bank linking.

**Trigger:** User has no connected accounts for the active entity.

**Flow:**
1. User opens Connected Accounts screen
2. Empty state displays: illustration of a bank building with a link icon, headline "No accounts linked yet", subtext "Connect your bank or payment platform to automatically import transactions.", primary CTA "Link an Account" → opens add account flow, secondary link "Or upload a bank statement" → navigates to Import Transactions (PRD-1)

**Acceptance Criteria:**
- [ ] Empty state appears when `accounts.list` returns empty array
- [ ] "Link an Account" opens the add account flow
- [ ] "Or upload a bank statement" navigates to Import Transactions screen
- [ ] Illustration uses neutral tones consistent with design system

---

#### US-803: Connected accounts loading state

**As a** user  
**I want** to see skeleton placeholders while accounts load  
**So that** the screen doesn't flash or feel broken during data fetch.

**Trigger:** `accounts.list` query is in flight.

**Flow:**
1. Screen renders 2–3 skeleton cards with pulsing placeholder shapes
2. Once data loads, skeletons replaced with real cards (or empty state)

**Acceptance Criteria:**
- [ ] Skeleton cards match the layout of real account cards
- [ ] Transition from skeleton to content is smooth (no layout shift)
- [ ] Loading state shown for at least 200ms to prevent flash

---

### 3.2 Add Bank Account (Open Banking — Mono/Stitch)

#### US-804: Add bank account via Mono Connect

**As a** user  
**I want** to link my Nigerian bank account using Mono Connect  
**So that** my transactions are automatically imported without uploading statements.

**Trigger:** User taps "+ Add New Account" → selects "Connect bank account" → selects a bank supported by Mono.

**Flow:**
1. User taps "+ Add New Account" on Connected Accounts screen
2. User sees connection method cards (same as Onboarding Step 4): "Connect bank account", "Connect Paystack / Flutterwave", "Connect Payoneer / Wise", "Upload bank statement"
3. User selects "Connect bank account"
4. App generates a unique state token via `accounts.initiateOAuth` mutation — stored in `oauthStates` table with 10-minute TTL
5. App opens Mono Connect widget (in-app browser / WebView) with: public key (from env), state parameter, redirect URI
6. User authenticates with their bank inside the Mono widget (selects bank, enters credentials, completes MFA)
7. Mono calls the OAuth callback URL: `POST /webhooks/oauth-callback`
8. `accounts.handleOAuthCallback` action: validates state token against `oauthStates`, exchanges authorization code for access/refresh tokens via Mono API, encrypts tokens (AES-256-GCM), fetches account details (name, type, institution, currency), creates `connectedAccounts` document with status "active", deletes used `oauthStates` entry, triggers initial `accounts.syncNow` to fetch historical transactions
9. App detects new account (Convex reactivity on `accounts.list`) and navigates to Connected Accounts with success toast: "GTBank account linked successfully"
10. Initial sync runs in background; user sees "Syncing…" status on the new account card

**Acceptance Criteria:**
- [ ] Mono Connect widget opens correctly in WebView
- [ ] State token generated, stored, and validated on callback
- [ ] State token expires after 10 minutes (stale tokens rejected)
- [ ] Authorization code exchanged for tokens via Mono API
- [ ] Tokens encrypted before storage (AES-256-GCM)
- [ ] Account details (name, institution, currency) fetched from Mono
- [ ] `connectedAccounts` document created with correct fields
- [ ] Initial sync triggered automatically after linking
- [ ] Success toast displayed; account appears in list
- [ ] Error handling: if user cancels widget → return to add screen, no account created
- [ ] Error handling: if Mono API fails → show "Failed to link account. Please try again." with retry option

---

#### US-805: Add bank account via Stitch Link

**As a** user  
**I want** to link my bank account using Stitch as an alternative to Mono  
**So that** I have a fallback if Mono doesn't support my bank.

**Trigger:** User selects "Connect bank account" and their bank is supported by Stitch but not Mono, or Stitch is configured as primary.

**Flow:**
1. Same as US-804 but using Stitch Link widget instead of Mono Connect
2. Stitch Link opens in WebView; user authenticates
3. Callback processed by same `accounts.handleOAuthCallback` action (provider detection via state or callback URL path)
4. Tokens stored; account created; initial sync triggered

**Acceptance Criteria:**
- [ ] Stitch Link widget opens correctly
- [ ] Same state token and callback flow as Mono
- [ ] Provider stored in `connectedAccounts.metadata.linkProvider` as "stitch"
- [ ] All account details populated from Stitch API
- [ ] Fallback: if primary provider fails, user can try alternate

---

### 3.3 Add Paystack Account

#### US-806: Connect Paystack account via API key

**As a** freelancer or SME  
**I want** to connect my Paystack account  
**So that** payments received through Paystack are automatically imported as income transactions.

**Trigger:** User taps "+ Add New Account" → selects "Connect Paystack / Flutterwave" → selects Paystack.

**Flow:**
1. User selects "Connect Paystack / Flutterwave"
2. User sees sub-options: Paystack, Flutterwave
3. User selects Paystack
4. Form displayed: "Enter your Paystack Secret Key", Account name (e.g. "My Paystack Business"), info callout: "Your API key is encrypted and stored securely. We only use read-only access to fetch your transaction history."
5. User pastes their Paystack secret key and enters account name
6. User taps "Connect"
7. `accounts.addApiKeyAccount` action: validates API key by calling Paystack `/balance` endpoint, if valid: encrypts API key, creates `connectedAccounts` with provider "paystack", status "active", triggers initial sync
8. If invalid: show "Invalid API key. Please check and try again."
9. On success: toast "Paystack connected successfully", account appears in list

**Acceptance Criteria:**
- [ ] API key validated via Paystack `/balance` endpoint before storage
- [ ] API key encrypted (AES-256-GCM) before writing to `connectedAccounts.accessToken`
- [ ] SHA-256 hash of key stored in `metadata.apiKeyHash` for future verification
- [ ] Invalid key shows clear error
- [ ] Account created with provider "paystack", currency "NGN"
- [ ] Initial sync fetches transaction history from Paystack
- [ ] Info callout about security visible
- [ ] API key field uses `secureTextEntry` (masked input)

---

### 3.4 Add Flutterwave Account

#### US-807: Connect Flutterwave account via API key

**As a** freelancer or SME  
**I want** to connect my Flutterwave account  
**So that** payments received through Flutterwave are automatically imported.

**Trigger:** User selects Flutterwave from the "Connect Paystack / Flutterwave" option.

**Flow:**
1. Same form and flow as US-806 but for Flutterwave
2. API key validated via Flutterwave `/balances` endpoint
3. On success: account created with provider "flutterwave"

**Acceptance Criteria:**
- [ ] Same encryption and validation flow as Paystack
- [ ] Validated via Flutterwave API
- [ ] Provider set to "flutterwave"
- [ ] Initial sync fetches Flutterwave transaction history
- [ ] Supports both NGN and USD settlements (currency from Flutterwave response)

---

### 3.5 Add Payoneer Account

#### US-808: Connect Payoneer account via OAuth

**As a** freelancer earning foreign income  
**I want** to connect my Payoneer account  
**So that** my international payments are automatically imported and converted to naira.

**Trigger:** User taps "+ Add New Account" → selects "Connect Payoneer / Wise" → selects Payoneer.

**Flow:**
1. User selects "Connect Payoneer / Wise"
2. User sees sub-options: Payoneer, Wise
3. User selects Payoneer
4. App generates OAuth state token via `accounts.initiateOAuth`
5. App opens Payoneer OAuth consent page in WebView
6. User authenticates and grants TaxEase read-only access to transaction history
7. Payoneer redirects to callback URL with authorization code
8. `accounts.handleOAuthCallback` exchanges code for tokens, encrypts, creates account with provider "payoneer"
9. Currency set based on Payoneer account (typically "USD")
10. Initial sync fetches recent Payoneer transactions
11. Each synced transaction gets `amountNgn` computed via CBN rate (same FX pipeline as PRD-1)

**Acceptance Criteria:**
- [ ] Payoneer OAuth flow opens in WebView
- [ ] State token validated on callback
- [ ] Tokens encrypted and stored
- [ ] Account created with provider "payoneer", currency from Payoneer
- [ ] Synced transactions include FX conversion to NGN (`amountNgn`, `fxRate`)
- [ ] Foreign income transactions correctly typed as "income" with appropriate direction
- [ ] Initial sync triggered after linking

---

### 3.6 Add Wise Account

#### US-809: Connect Wise account via OAuth

**As a** freelancer earning foreign income  
**I want** to connect my Wise account  
**So that** my Wise transfers and payments are tracked for tax purposes.

**Trigger:** User selects Wise from "Connect Payoneer / Wise" option.

**Flow:**
1. Same OAuth flow as Payoneer but using Wise OAuth endpoints
2. Wise supports multi-currency — app detects primary currency from Wise profile
3. Account created with provider "wise"
4. Synced transactions include FX conversion

**Acceptance Criteria:**
- [ ] Wise OAuth flow works correctly
- [ ] Multi-currency support: if user has USD + GBP + EUR balances, primary currency used (or separate accounts per currency — Open Question)
- [ ] FX conversion applied for all non-NGN transactions
- [ ] Provider set to "wise"

---

### 3.7 Manual Sync

#### US-810: Trigger manual sync ("Sync Now")

**As a** user  
**I want** to manually trigger a sync on a connected account  
**So that** I can pull the latest transactions immediately without waiting for the scheduled sync.

**Trigger:** User taps "Sync Now" on a connected account card.

**Flow:**
1. User taps "Sync Now" on an active account card
2. Button enters loading state; card shows "Syncing…" badge
3. `accounts.syncNow` action fires: checks token validity (refreshes if expired), calls provider API to fetch transactions since `lastSyncedAt`, creates `importJob` with source "bank_api" (or "paystack" / "flutterwave"), calls `transactions.batchUpsert` with parsed transactions (dedup via PRD-1 logic), updates `connectedAccounts.lastSyncedAt` on success, updates `importJob` status to "complete"
4. Card updates reactively: "Syncing…" → "Last synced: Just now"
5. Toast: "12 new transactions imported, 3 duplicates skipped" (or "No new transactions")
6. If sync fails: card shows "Error" status, errorMessage populated, toast: "Sync failed — [reason]"

**Acceptance Criteria:**
- [ ] "Sync Now" triggers `accounts.syncNow` action
- [ ] Token refreshed transparently if expired (US-817)
- [ ] Import job created and tracked
- [ ] Transactions written via `batchUpsert` with full dedup
- [ ] `lastSyncedAt` updated on success
- [ ] Loading/syncing state shown on card during sync
- [ ] Success toast with transaction counts
- [ ] Failure shows error on card and in toast
- [ ] "Sync Now" disabled during an active sync (prevent double-tap)
- [ ] Rate limiting: if user taps "Sync Now" again within 60 seconds, show "Please wait before syncing again"

---

#### US-811: View sync progress

**As a** user  
**I want** to see the progress of an ongoing sync  
**So that** I know the sync is working and how long to wait.

**Trigger:** Sync is in progress (manual or automatic).

**Flow:**
1. Account card shows "Syncing…" badge (pulsing animation)
2. If sync takes > 5 seconds, show progress detail: "Fetching transactions…" → "Importing 47 transactions…"
3. Live subscription to `importJobs.get(jobId)` provides status updates
4. On completion, badge updates to "Last synced: Just now"

**Acceptance Criteria:**
- [ ] Syncing state visible on account card
- [ ] Progress updates reactively via Convex subscription
- [ ] User can navigate away; sync continues in background
- [ ] Returning to Connected Accounts shows current state

---

### 3.8 Automatic Background Sync

#### US-812: Scheduled sync every 6 hours

**As a** user with active linked accounts  
**I want** my accounts to sync automatically every 6 hours  
**So that** my transaction ledger stays current without manual intervention.

**Trigger:** Convex cron job `accounts.scheduledSync` fires every 6 hours.

**Flow:**
1. `accounts.scheduledSync` runs on schedule
2. Queries all connected accounts with `status: "active"` and non-null `accessToken`
3. For each active account: calls `accounts.syncNow` (same as manual sync)
4. Tokens refreshed if expired
5. Results logged; errors set account status to "error"
6. On success: `lastSyncedAt` updated
7. On failure: `status` set to "error", `errorMessage` set

**Acceptance Criteria:**
- [ ] Cron runs every 6 hours
- [ ] Only active accounts with tokens are synced
- [ ] Failed syncs set status to "error" (do not disable account)
- [ ] Consecutive failures (3+) trigger in-app notification: "Your [bank] account sync is failing. Please check your connection."
- [ ] `statement_upload` and `manual` accounts are excluded from scheduled sync
- [ ] Rate limiting: stagger syncs across accounts (not all at once) to respect provider rate limits

---

### 3.9 Webhook-Triggered Sync

#### US-813: Receive webhook and trigger sync

**As a** user  
**I want** new transactions to appear shortly after they happen at my bank  
**So that** my ledger is as close to real-time as possible.

**Trigger:** Mono or Stitch sends a webhook notification (`transactions.new` event) to `POST /webhooks/bank-notification`.

**Flow:**
1. Bank provider detects new transaction(s) on user's account
2. Provider sends webhook to TaxEase endpoint: `POST /webhooks/bank-notification`
3. HTTP Action `webhooks.bankNotification`: verifies webhook signature (HMAC-SHA256 using provider webhook secret), parses payload to identify `providerAccountId`, looks up `connectedAccounts` by `providerAccountId`, triggers `accounts.syncNow` for matched account
4. Sync runs; new transactions imported
5. User's transaction list updates reactively (Convex real-time)

**Acceptance Criteria:**
- [ ] Webhook endpoint registered with Mono and Stitch
- [ ] Signature verification rejects tampered payloads (returns 401)
- [ ] Unknown `providerAccountId` is logged and ignored (returns 200 to prevent retries)
- [ ] Duplicate webhook calls are idempotent (dedup in batchUpsert handles this)
- [ ] Webhook processing completes within 30 seconds
- [ ] `account.reauthorization_required` event triggers re-auth flow (US-818)

---

### 3.10 Sync History & Status

#### US-814: View sync history and last sync status

**As a** user  
**I want** to see when each account last synced and what happened  
**So that** I can verify my data is up to date and diagnose issues.

**Trigger:** User taps a connected account card to see detail.

**Flow:**
1. User taps account card
2. Account detail screen shows: full account info (name, provider, type, currency, status), last sync result: timestamp, transactions imported, duplicates skipped, recent sync history (last 5 import jobs for this account), current status with error message if applicable
3. Actions: "Sync Now", "Disconnect"

**Acceptance Criteria:**
- [ ] Account detail shows all metadata
- [ ] Sync history fetched via `importJobs.list` filtered by `connectedAccountId`
- [ ] Each history entry shows: timestamp, source, totalImported, duplicatesSkipped, status
- [ ] Error status shows `errorMessage` with suggested action
- [ ] "Sync Now" available from detail screen
- [ ] **Empty state for sync history:** When no import jobs exist for this account (e.g. newly linked, never synced): "No sync history yet" with subtext "Sync now to import your first transactions." CTA: "Sync Now"

---

### 3.11 Error Handling

#### US-815: Handle sync errors

**As a** user  
**I want** to see clear error messages when a sync fails  
**So that** I know what went wrong and how to fix it.

**Trigger:** `accounts.syncNow` fails for any reason.

**Flow:**
1. Sync action catches error
2. Account status set to "error"; `errorMessage` populated with user-friendly message
3. Import job status set to "failed"
4. Account card shows amber "Error" badge with message
5. Tapping card shows full error detail and suggested actions: "Retry Sync" (try again), "Re-authenticate" (if token issue), "Disconnect" (give up)

**Error categories and messages:**

| Error | User Message | Action |
|-------|-------------|--------|
| Network timeout | "Could not reach [provider]. Check your connection and try again." | Retry |
| Rate limited (429) | "Too many requests. Sync will retry automatically." | Wait |
| Invalid token | "Your bank session has expired. Please re-authenticate." | Re-auth |
| Provider API error (5xx) | "[Provider] is experiencing issues. We'll retry automatically." | Wait |
| Parse error | "Could not read transactions from [provider]. Our team has been notified." | Report |
| Unknown | "Something went wrong. Please try again." | Retry |

**Acceptance Criteria:**
- [ ] Each error type produces a specific, actionable user message
- [ ] Error badge visible on account card
- [ ] Error detail accessible on tap
- [ ] "Retry Sync" re-triggers `accounts.syncNow`
- [ ] Provider 5xx errors auto-retry on next scheduled sync
- [ ] Parse errors logged for engineering investigation

---

#### US-816: Handle OAuth failure

**As a** user  
**I want** clear feedback when bank linking fails during OAuth  
**So that** I know what happened and can try again.

**Trigger:** OAuth flow fails (user cancels, network error, provider error).

**Flow — User cancels:**
1. User closes Mono/Stitch widget or taps "Cancel"
2. App detects widget dismissal (no callback received)
3. Return to add account screen; no account created
4. Toast: "Bank linking cancelled"

**Flow — Provider error:**
1. OAuth callback returns error parameter
2. `accounts.handleOAuthCallback` detects error
3. Toast: "Could not link your bank account. Please try again."
4. Return to add account screen

**Flow — Network error:**
1. WebView fails to load
2. Error screen in WebView: "No internet connection"
3. User taps back; returns to add account screen

**Acceptance Criteria:**
- [ ] User cancellation handled gracefully — no orphan records
- [ ] OAuth error cleans up `oauthStates` entry
- [ ] Network error shows appropriate message
- [ ] User can retry immediately after any failure

---

### 3.12 Token Refresh

#### US-817: Automatic token refresh

**As a** user with a linked account  
**I want** expired tokens to be refreshed automatically  
**So that** my sync continues without requiring me to re-authenticate.

**Trigger:** `accounts.syncNow` detects that `tokenExpiresAt` < now (or API returns 401).

**Flow:**
1. Sync action checks `tokenExpiresAt` before calling provider API
2. If expired (or within 5-minute buffer): calls `accounts.refreshToken` action
3. `accounts.refreshToken`: decrypts current refresh token, calls provider's token refresh endpoint, receives new access + refresh tokens, encrypts and stores new tokens, updates `tokenExpiresAt`
4. Sync proceeds with new access token
5. User is unaware — refresh is transparent

**Acceptance Criteria:**
- [ ] Token refresh happens automatically before sync
- [ ] 5-minute buffer: refresh if `tokenExpiresAt - now < 5 minutes`
- [ ] New tokens encrypted before storage
- [ ] Old tokens overwritten
- [ ] If refresh fails (refresh token also expired): set status to "error", prompt re-auth (US-818)
- [ ] Refresh is idempotent: concurrent sync attempts don't cause double-refresh

---

#### US-818: Handle expired/invalid token — prompt re-authentication

**As a** user  
**I want** to be prompted to re-authenticate when my bank connection expires  
**So that** I can restore automatic sync.

**Trigger:** Token refresh fails (refresh token expired or revoked by provider).

**Flow:**
1. Token refresh fails
2. Account status set to "error"
3. Error message: "Your bank session has expired. Please re-authenticate."
4. Account card shows "Re-authenticate" action button
5. User taps "Re-authenticate"
6. Same OAuth flow as initial linking (US-804/805) but updates existing `connectedAccounts` document instead of creating new one
7. On success: status restored to "active", new tokens stored, sync triggered

**Acceptance Criteria:**
- [ ] Re-auth reuses existing `connectedAccounts` document (same `_id`)
- [ ] Previous `providerAccountId` must match (prevent linking different account)
- [ ] Existing transactions preserved
- [ ] Status transitions: active → error → active (after re-auth)
- [ ] In-app notification: "Your [bank] connection needs attention"

---

### 3.13 Disconnect Account

#### US-819: Disconnect a connected account

**As a** user  
**I want** to disconnect a bank account  
**So that** TaxEase stops syncing from that source.

**Trigger:** User taps "Disconnect" on account card or detail screen.

**Flow:**
1. User taps "Disconnect"
2. Confirmation dialog: "Disconnect [Account Name]?", body: "Syncing will stop. Your existing transactions from this account will be kept.", buttons: "Cancel" | "Disconnect" (danger red)
3. User confirms
4. `accounts.disconnect` mutation: sets `status` to "disconnected", clears `accessToken` and `refreshToken` (deleted, not just nulled), clears `tokenExpiresAt`, sets `errorMessage` to null
5. Account card updates: shows "Disconnected" badge (grey)
6. Toast: "[Account Name] disconnected"
7. Existing transactions with this `connectedAccountId` are **preserved** (never deleted on disconnect)

**Acceptance Criteria:**
- [ ] Confirmation dialog before disconnect
- [ ] Tokens securely deleted (not just nulled — overwritten then cleared)
- [ ] Status set to "disconnected"
- [ ] Existing transactions preserved
- [ ] Account removed from scheduled sync pool
- [ ] Webhook events for this account's `providerAccountId` are ignored after disconnect
- [ ] Account card shows disconnected state

---

#### US-820: Reconnect a disconnected account

**As a** user  
**I want** to reconnect a previously disconnected account  
**So that** syncing resumes without losing my history.

**Trigger:** User taps "Reconnect" on a disconnected account card.

**Flow:**
1. User taps "Reconnect" on disconnected account card
2. Same OAuth/API-key flow as initial linking but targets existing document
3. On success: status set to "active", new tokens stored, sync triggered from `lastSyncedAt` (or full historical if `lastSyncedAt` is old)
4. Existing transactions remain; new transactions added; duplicates handled by batchUpsert

**Acceptance Criteria:**
- [ ] Reconnect reuses existing `connectedAccounts` document
- [ ] `providerAccountId` must match (user reconnects same account)
- [ ] If user attempts different account: warn "This appears to be a different account. Would you like to add it as a new account instead?"
- [ ] Sync picks up from `lastSyncedAt`
- [ ] Status transitions: disconnected → active

---

### 3.14 Account Status Transitions

#### US-821: Account status state machine

**As a** system  
**I want** well-defined status transitions  
**So that** the UI always reflects the true state of a connection.

**State machine:**

```
                    ┌─────────────┐
      OAuth success │             │ Token refresh fail
     ┌──────────────►   active    ├──────────────────┐
     │              │             │                   │
     │              └──────┬──────┘                   ▼
     │                     │                   ┌──────────┐
     │              Sync   │                   │          │
     │              error  │                   │  error   │
     │                     │                   │          │
     │                     ▼                   └────┬─────┘
     │              ┌──────────┐                    │
     │              │          │  Re-auth success   │
     │              │  error   ├────────────────────┘
     │              │          │        │
     │              └────┬─────┘        │
     │                   │              │
     │         Disconnect│              │Disconnect
     │                   ▼              ▼
     │         ┌──────────────────┐
     │         │                  │
     └─────── │  disconnected    │
   Reconnect  │                  │
              └──────────────────┘
```

**Transitions:**

| From | To | Trigger |
|------|----|---------|
| (new) | active | OAuth success or API key validated |
| active | error | Sync fails, token refresh fails, provider error |
| active | disconnected | User disconnects |
| error | active | Successful sync (auto-retry or manual), re-authentication |
| error | disconnected | User disconnects |
| disconnected | active | User reconnects (re-auth) |

**Acceptance Criteria:**
- [ ] Status transitions enforced in backend mutations
- [ ] Invalid transitions rejected (e.g. disconnected → error not possible directly)
- [ ] Each transition logged for debugging
- [ ] UI reflects current status reactively

---

### 3.15 Deduplication

#### US-822: Sync does not create duplicate transactions

**As a** user  
**I want** synced transactions to never duplicate what's already in my ledger  
**So that** my totals and tax calculations remain accurate.

**Trigger:** Every sync operation (manual, scheduled, webhook-triggered).

**Flow:**
1. Sync fetches transactions from provider API
2. Each transaction passed through PRD-1's `batchUpsert` dedup logic
3. Dedup matches on: `externalRef` (provider's unique transaction ID) — primary match, fallback: `date` + `amount` + `description` (fuzzy, for providers without stable IDs)
4. Matched transactions are skipped; count reported in `SyncResult.duplicatesSkipped`
5. New transactions are inserted

**Acceptance Criteria:**
- [ ] `externalRef` populated from provider's transaction ID field
- [ ] Primary dedup on `externalRef` (exact match within entity)
- [ ] Fallback dedup on date + amount + description (same logic as PRD-1)
- [ ] Zero false positives (valid unique transactions never skipped)
- [ ] Duplicate count visible in sync result toast and import job
- [ ] Transactions from different connected accounts with same external data are correctly deduped (e.g. sender and receiver both linked)

---

### 3.16 FX Conversion

#### US-823: Foreign-currency sync with FX conversion

**As a** user with a Payoneer or Wise account (or foreign-currency bank account)  
**I want** synced foreign transactions to be converted to naira  
**So that** my tax calculations are in NGN as required.

**Trigger:** Sync imports transactions where `currency ≠ "NGN"`.

**Flow:**
1. Sync fetches transactions from provider (e.g. Payoneer — USD transactions)
2. For each transaction: `amount` stored in original currency, `currency` set to transaction currency (e.g. "USD"), `fxRate` fetched: CBN rate for the transaction date (same lookup as PRD-1), `amountNgn` = `amount × fxRate`
3. If CBN rate unavailable for date, use most recent available rate and flag transaction
4. Transaction written with both `amount` and `amountNgn`

**Acceptance Criteria:**
- [ ] Same FX conversion pipeline as PRD-1 manual entry and CSV/PDF import
- [ ] CBN rate lookup by transaction date
- [ ] `amountNgn` and `fxRate` populated for all foreign transactions
- [ ] Fallback to most recent rate if date-specific rate unavailable
- [ ] Tax calculations always use `amountNgn` (PRD-3 compatibility)

---

### 3.17 Onboarding Integration

#### US-824: Onboarding Step 4 — active bank linking options

**As a** new user in onboarding  
**I want** the "Connect bank account" and "Connect Paystack / Flutterwave" options to work  
**So that** I can link my accounts during initial setup.

**Trigger:** User reaches Onboarding Step 4 (PRD-0 US-011 — placeholders activated by PRD-8).

**Flow:**
1. Step 4 cards now functional (were placeholders in PRD-0):
   - "Upload bank statement" → Import Transactions (PRD-1, already functional)
   - **"Connect bank account" → Mono/Stitch OAuth flow (US-804/805)**
   - **"Connect Paystack / Flutterwave" → API key flow (US-806/807)**
   - **"Connect Payoneer / Wise" → OAuth flow (US-808/809)**
   - "I'll do this later" → skip (unchanged)
2. After linking, user returns to Step 4; linked account shown with checkmark
3. User can link multiple accounts or proceed with "Finish Setup"
4. Onboarding completes as before; linked accounts persist

**Acceptance Criteria:**
- [ ] Previously placeholder cards now navigate to real linking flows
- [ ] After successful link, return to Step 4 with visual confirmation
- [ ] Multiple accounts can be linked during onboarding
- [ ] "I'll do this later" still works (skip is always available)
- [ ] Onboarding completion unaffected by linking success/failure

---

### 3.18 Provider-Specific Considerations

#### US-825: Mono-specific sync parsing

**As a** system integrating with Mono  
**I want** to correctly parse Mono's transaction response format  
**So that** imported transactions are accurate and complete.

**Provider details — Mono:**
- **Auth:** OAuth 2.0 via Mono Connect widget
- **Transaction endpoint:** `GET /accounts/{id}/transactions?start={date}&end={date}`
- **Pagination:** Cursor-based (`paging.next`)
- **Rate limits:** 100 requests/minute per app
- **Transaction fields mapping:**
  - `narration` → `description`
  - `amount` → `amount` (in kobo — divide by 100 for naira)
  - `type` ("debit" / "credit") → `direction`
  - `date` → `date`
  - `_id` → `externalRef`
  - `category` → hint for AI categorisation (PRD-2)
  - `balance` → not stored (informational only)
- **Webhook events:** `mono.events.account_updated`, `mono.events.reauthorisation_required`
- **Token lifetime:** Access token ~24h; refresh token ~30 days (varies by bank)

**Acceptance Criteria:**
- [ ] Amount converted from kobo to naira (÷ 100)
- [ ] All Mono response fields correctly mapped
- [ ] Cursor pagination followed until all transactions fetched
- [ ] Rate limit respected: exponential backoff on 429
- [ ] Webhook events handled for `account_updated` and `reauthorisation_required`

---

#### US-826: Stitch-specific sync parsing

**As a** system integrating with Stitch  
**I want** to correctly parse Stitch's GraphQL transaction response  
**So that** imported transactions from Stitch-linked accounts are accurate.

**Provider details — Stitch:**
- **Auth:** OAuth 2.0 via Stitch Link widget
- **Transaction endpoint:** GraphQL `query { node(id: $accountId) { ... on BankAccount { transactions { edges { node { ... } } } } } }`
- **Pagination:** Relay cursor pagination (`after`, `first`)
- **Rate limits:** 60 requests/minute
- **Transaction fields mapping:**
  - `description` → `description`
  - `amount.quantity` → `amount`
  - `amount.currency` → `currency`
  - `debitCreditIndicator` → `direction`
  - `transactionDate` → `date`
  - `id` → `externalRef`
- **Token lifetime:** Access token ~1h; refresh token ~90 days

**Acceptance Criteria:**
- [ ] GraphQL queries correctly structured
- [ ] Relay pagination followed
- [ ] Amount and currency correctly extracted from nested object
- [ ] Rate limits respected
- [ ] Token refresh handles short-lived access tokens (1h)

---

#### US-827: Paystack-specific sync parsing

**As a** system integrating with Paystack  
**I want** to correctly parse Paystack's transaction list response  
**So that** Paystack payments appear as accurate income transactions.

**Provider details — Paystack:**
- **Auth:** Secret key in `Authorization: Bearer sk_live_...` header
- **Transaction endpoint:** `GET /transaction?from={date}&to={date}&perPage=100&page={n}`
- **Pagination:** Page-based (`perPage`, `page`)
- **Rate limits:** Undocumented; safe at ~10 requests/second
- **Transaction fields mapping:**
  - `customer.email` + `metadata` → `description`
  - `amount` → `amount` (in kobo — divide by 100)
  - `currency` → `currency`
  - `status` ("success" only) → import only successful transactions
  - `paid_at` → `date`
  - `reference` → `externalRef`
  - All Paystack transactions are income (direction: "credit")
- **No webhooks for historical data** — uses polling sync only

**Acceptance Criteria:**
- [ ] Only `status: "success"` transactions imported
- [ ] Amount converted from kobo (÷ 100)
- [ ] All transactions set as `direction: "credit"` (income)
- [ ] Customer info used for enriched description
- [ ] Pagination followed until all pages fetched

---

#### US-828: Flutterwave-specific sync parsing

**As a** system integrating with Flutterwave  
**I want** to correctly parse Flutterwave's transaction response  
**So that** Flutterwave settlements appear accurately.

**Provider details — Flutterwave:**
- **Auth:** Secret key in `Authorization: Bearer FLWSECK_...` header
- **Transaction endpoint:** `GET /v3/transactions?from={date}&to={date}&page={n}`
- **Pagination:** Page-based
- **Rate limits:** Documented per-endpoint; safe at ~5 requests/second
- **Transaction fields mapping:**
  - `narration` → `description`
  - `amount` → `amount` (not in kobo — already in currency unit)
  - `currency` → `currency`
  - `status` ("successful" only) → import only successful
  - `created_at` → `date`
  - `tx_ref` → `externalRef`
  - `charged_amount` vs `amount`: use `amount` (customer-facing)
- **Note:** Flutterwave amounts are NOT in kobo (unlike Paystack)

**Acceptance Criteria:**
- [ ] Only `status: "successful"` transactions imported
- [ ] Amount used directly (not divided by 100)
- [ ] Multi-currency support (NGN, USD, etc.)
- [ ] Pagination followed
- [ ] `tx_ref` used as `externalRef` for dedup

---

#### US-829: Payoneer-specific sync parsing

**As a** system integrating with Payoneer  
**I want** to correctly parse Payoneer's transaction response  
**So that** international payments are accurately tracked.

**Provider details — Payoneer:**
- **Auth:** OAuth 2.0 (standard flow)
- **Transaction endpoint:** `GET /v4/accounts/{id}/transactions?from={date}&to={date}`
- **Pagination:** Offset-based
- **Transaction fields mapping:**
  - `description` → `description`
  - `amount` → `amount`
  - `currency` → `currency`
  - `type` → `direction` mapping (payment_received = credit, fee = debit, etc.)
  - `id` → `externalRef`
  - `creation_date` → `date`
- **Currency:** Primarily USD, EUR, GBP
- **FX note:** All transactions require CBN rate conversion to NGN

**Acceptance Criteria:**
- [ ] Payoneer transaction types correctly mapped to `direction`
- [ ] Fee transactions (Payoneer fees) imported as expenses
- [ ] Currency correctly passed to FX conversion
- [ ] OAuth token refresh handled (Payoneer tokens expire after ~3 hours)

---

#### US-830: Wise-specific sync parsing

**As a** system integrating with Wise  
**I want** to correctly parse Wise's transaction response  
**So that** Wise transfers are accurately imported.

**Provider details — Wise:**
- **Auth:** OAuth 2.0 (personal tokens also supported as fallback)
- **Transaction endpoint:** `GET /v1/profiles/{profileId}/borderless-accounts/{accountId}/statement?currency={cur}&intervalStart={date}&intervalEnd={date}`
- **Pagination:** Offset-based (`type=COMPACT` for summary)
- **Transaction fields mapping:**
  - `details.description` → `description`
  - `amount.value` → `amount`
  - `amount.currency` → `currency`
  - `type` ("CREDIT" / "DEBIT") → `direction`
  - `referenceNumber` → `externalRef`
  - `date` → `date`
- **Multi-currency:** Wise accounts have multiple currency balances; fetch per-currency
- **FX note:** Wise provides own exchange rates in transfers — use CBN rate for tax purposes (override Wise rate)

**Acceptance Criteria:**
- [ ] Multi-currency: fetch statements for each currency balance
- [ ] Use CBN rate (not Wise rate) for `amountNgn` conversion
- [ ] Transfer details (sender/recipient) included in description
- [ ] `referenceNumber` used for dedup

---

## 4. UI Specifications

### 4.1 Design Tokens

| Token | Value | Usage |
|-------|-------|-------|
| primary | `#1A7F5E` | Primary buttons, active states |
| primary-light | `#E8F5F0` | Highlighted cards, active account background |
| accent | `#2B6CB0` | Links, secondary actions, "Sync Now" |
| success | `#38A169` | Active status badge, successful sync |
| warning | `#D69E2E` | Error status badge, token expiring |
| danger | `#E53E3E` | Disconnected status, sync failed, disconnect button |
| neutral-900 | `#1A202C` | Body text |
| neutral-500 | `#718096` | Secondary text, timestamps |
| neutral-100 | `#F7FAFC` | Page backgrounds |
| white | `#FFFFFF` | Card surfaces |

### 4.2 Connected Accounts Screen

**Layout:** Full-screen list with header and scrollable account cards.

**Header:**
- Left: Back arrow (or hamburger if top-level)
- Centre: "Connected Accounts"
- Right: None

**Account cards (each):**
- Left: Institution logo (40×40, rounded, or fallback letter icon)
- Centre column: Institution name (heading-md, neutral-900), Account name (body-sm, neutral-500), Last synced: "2 hours ago" or "Never" (body-sm, neutral-500)
- Right: Status badge pill (rounded, 8px padding): Active = success green with white text, Error = warning amber with white text, Disconnected = neutral-500 with white text
- Tap → Account detail screen

**Footer:** 
- "+ Add New Account" button (primary outline, full-width, 16px margin)

**States:**
- Loading: 2–3 skeleton cards
- Empty: Illustration + "No accounts linked yet" + "Link an Account" CTA
- Loaded: Scrollable card list + footer button

---

### 4.3 Add Account Screen

**Layout:** Card-based method selector (mirrors Onboarding Step 4 layout).

**Header:**
- Left: Back arrow
- Centre: "Add Account"

**Option cards (vertical stack):**
1. **Connect bank account** — icon: bank building, description: "Link via Open Banking (Mono/Stitch)", badge: "Recommended"
2. **Connect Paystack** — icon: Paystack logo, description: "Import payment history"
3. **Connect Flutterwave** — icon: Flutterwave logo, description: "Import payment history"
4. **Connect Payoneer** — icon: Payoneer logo, description: "Track foreign income"
5. **Connect Wise** — icon: Wise logo, description: "Track foreign income"
6. **Upload bank statement** — icon: document upload, description: "Import PDF or CSV" → navigates to Import Transactions (PRD-1)

Each card: white surface, 16px padding, 12px border-radius, subtle shadow, tappable.

---

### 4.4 API Key Connection Form (Paystack/Flutterwave)

**Layout:** Single-column form.

**Header:**
- Left: Back arrow
- Centre: "Connect [Provider]"

**Form fields:**
1. **Account name** — text input, placeholder: "e.g. My Business Paystack"
2. **Secret key** — secure text input (masked), placeholder: "sk_live_...", helper text: "Find this in your [Provider] dashboard → Settings → API Keys"
3. **Info callout** — light blue background (`accent` at 10% opacity), lock icon, text: "Your API key is encrypted and stored securely. We use read-only access to fetch transaction history."
4. **Connect button** — primary, full-width, loading state during validation

**Validation states:**
- Empty key: "API key is required"
- Invalid key (API validation fails): "Invalid API key. Please check and try again."
- Success: Navigate to Connected Accounts with success toast

---

### 4.5 Account Detail Screen

**Layout:** Card sections, scrollable.

**Header:**
- Left: Back arrow
- Centre: "[Account Name]"
- Right: More menu (⋮) with "Disconnect"

**Section 1 — Account Info card:**
- Institution logo (large, 56×56) + name
- Account type badge: "Bank" | "Fintech" | "Payment Platform" | "International"
- Currency: "NGN" (or flag + code for foreign)
- Provider: "via Mono" / "via Stitch" / "API Key"
- Status badge (large): Active / Error / Disconnected

**Section 2 — Sync Status card:**
- Last synced: timestamp (absolute + relative)
- Next scheduled sync: timestamp (if active)
- "Sync Now" button (accent, full-width) — disabled during sync, disabled if disconnected

**Section 3 — Last Sync Result card (if available):**
- Transactions fetched: [number]
- New transactions imported: [number]
- Duplicates skipped: [number]
- Status: Success / Failed

**Section 4 — Sync History (collapsible):**
- List of last 5 import jobs: date, result summary, status icon

**Section 5 — Error Banner (if status = "error"):**
- Red/amber banner: error message
- Action buttons: "Retry Sync" | "Re-authenticate" (if token issue)

**Section 6 — Danger zone (bottom):**
- "Disconnect Account" link (danger red text)

---

### 4.6 Sync Progress Overlay

When sync is in progress on an account card:
- Status badge pulses: "Syncing…" in accent blue
- If from "Sync Now" tap, button shows spinner and text "Syncing…"
- On completion, badge transitions to "Active" + "Last synced: Just now"
- Toast appears with results

---

### 4.7 Re-authentication Prompt

When account enters "error" state due to token expiry:
- Account card shows warning-coloured border
- Additional "Re-authenticate" button below status
- Tapping opens OAuth widget (same as initial link, targeting existing account)

---

### 4.8 Disconnect Confirmation Dialog

**Title:** "Disconnect [Account Name]?"
**Body:** "Syncing will stop for this account. Your existing transactions from this account will be kept."
**Buttons:**
- "Cancel" (neutral, left)
- "Disconnect" (danger red, right)

---

### 4.9 Platform Behaviour

| Behaviour | Mobile | Web |
|-----------|--------|-----|
| OAuth widget | In-app WebView (SafariVC on iOS, Custom Tabs on Android) | Popup window or redirect |
| API key input | Secure text entry with paste button | Standard password input |
| Sync progress | Card badge + toast | Card badge + toast |
| Background sync | Runs server-side (Convex cron) — no device dependency | Same |
| Webhook | Server-side processing — no device dependency | Same |

---

## 5. Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-801 | The system shall allow users to link bank accounts via Mono Connect widget (OAuth flow). | P2 |
| FR-802 | The system shall allow users to link bank accounts via Stitch Link widget (OAuth flow). | P2 |
| FR-803 | The system shall allow users to connect Paystack accounts via API key. | P2 |
| FR-804 | The system shall allow users to connect Flutterwave accounts via API key. | P2 |
| FR-805 | The system shall allow users to connect Payoneer accounts via OAuth. | P2 |
| FR-806 | The system shall allow users to connect Wise accounts via OAuth. | P2 |
| FR-807 | The system shall encrypt all OAuth tokens and API keys using AES-256-GCM before storage. The encryption key shall be stored in a Convex environment variable. | P0 (security) |
| FR-808 | The system shall automatically refresh expired OAuth access tokens using the stored refresh token. | P2 |
| FR-809 | The system shall refresh tokens proactively (5-minute buffer before expiry) rather than waiting for failure. | P2 |
| FR-810 | The system shall prompt users to re-authenticate when both access and refresh tokens are invalid. | P2 |
| FR-811 | The system shall allow users to trigger manual sync ("Sync Now") on any active connected account. | P2 |
| FR-812 | The system shall run a scheduled sync (Convex cron) every 6 hours for all active connected accounts with tokens. | P2 |
| FR-813 | The system shall accept and process webhook notifications from Mono and Stitch to trigger immediate sync. | P2 |
| FR-814 | The system shall verify webhook signatures (HMAC-SHA256) before processing webhook payloads. | P0 (security) |
| FR-815 | The system shall create an `importJob` record for every sync operation and feed transactions through PRD-1's `batchUpsert` pipeline. | P2 |
| FR-816 | The system shall deduplicate synced transactions using `externalRef` (primary) and date+amount+description (fallback). | P2 |
| FR-817 | The system shall convert foreign-currency synced transactions to NGN using CBN rates (same pipeline as PRD-1). | P2 |
| FR-818 | The system shall display connected account status (active/error/disconnected) with appropriate colour-coded badges. | P2 |
| FR-819 | The system shall display last sync timestamp and sync results (imported count, duplicates skipped). | P2 |
| FR-820 | The system shall allow users to disconnect accounts (clears tokens, sets status to disconnected, preserves transactions). | P2 |
| FR-821 | The system shall allow users to reconnect disconnected accounts (re-authentication updates existing document). | P2 |
| FR-822 | The system shall enforce the account status state machine: valid transitions only. | P2 |
| FR-823 | The system shall rate-limit manual sync requests (max once per 60 seconds per account). | P2 |
| FR-824 | The system shall stagger scheduled syncs across accounts to respect provider rate limits. | P2 |
| FR-825 | The system shall validate Paystack/Flutterwave API keys by calling a provider endpoint before creating the account. | P2 |
| FR-826 | The system shall generate and verify CSRF state tokens for all OAuth flows (10-minute TTL). | P0 (security) |
| FR-827 | The system shall handle Mono amounts in kobo (divide by 100) and Paystack amounts in kobo (divide by 100). Flutterwave amounts are in currency units (no division). | P2 |
| FR-828 | The system shall log sync errors with sufficient context for debugging and set user-friendly error messages on the account. | P2 |
| FR-829 | The system shall not include `statement_upload` or `manual` accounts in scheduled or webhook sync. | P2 |
| FR-830 | The system shall activate Onboarding Step 4 bank linking options (previously placeholders from PRD-0). | P2 |

---

## 6. API Requirements (Convex Functions)

### 6.1 Connected Accounts — Queries

| Function | Type | Description |
|----------|------|-------------|
| `accounts.list` | Query | All connected accounts for the active entity. Returns array of `ConnectedAccount` (tokens excluded from response — never sent to client). Sorted: active first, then error, then disconnected. |
| `accounts.get` | Query | Single connected account by ID. Ownership check (userId + entityId). Tokens excluded from response. |
| `accounts.getSyncHistory` | Query | Recent import jobs for a specific connected account. Returns last 10 `ImportJob` records filtered by `connectedAccountId`, sorted by `startedAt` desc. |

### 6.2 Connected Accounts — Mutations

| Function | Type | Description |
|----------|------|-------------|
| `accounts.add` | Mutation | Create a `connectedAccounts` document. For `statement_upload` / `manual` types (PRD-1 path — unchanged). Does NOT handle OAuth or API key — those go through actions. |
| `accounts.disconnect` | Mutation | Set status to "disconnected". Clears `accessToken`, `refreshToken`, `tokenExpiresAt`. Preserves `lastSyncedAt` and all metadata. Does NOT delete the document or related transactions. |
| `accounts.updateStatus` | Mutation | Internal mutation to update account status and errorMessage. Called by actions after sync attempts. Enforces valid state transitions. |
| `accounts.updateTokens` | Mutation | Internal mutation to store new encrypted tokens after refresh or re-auth. Updates `accessToken`, `refreshToken`, `tokenExpiresAt`. |
| `accounts.updateLastSynced` | Mutation | Internal mutation to update `lastSyncedAt` after successful sync. |

### 6.3 Connected Accounts — Actions

| Function | Type | Description |
|----------|------|-------------|
| `accounts.syncNow` | Action | Trigger sync for a single connected account. Steps: (1) Read account, (2) Decrypt tokens, (3) Check expiry / refresh if needed (calls `accounts.refreshToken`), (4) Call provider API to fetch transactions since `lastSyncedAt`, (5) Create `importJob` via mutation, (6) Parse provider response into canonical transaction format, (7) Call `transactions.batchUpsert` mutation with parsed transactions, (8) Update `importJob` status, (9) Update `lastSyncedAt` via mutation, (10) Return `SyncResult`. On error: set account status to "error" via `accounts.updateStatus`. |
| `accounts.handleOAuthCallback` | Action (HTTP) | Exchange OAuth authorization code for tokens. Steps: (1) Validate state token against `oauthStates`, (2) Call provider token endpoint with authorization code, (3) Encrypt tokens (AES-256-GCM), (4) Fetch account details from provider, (5) Create or update `connectedAccounts` document, (6) Delete `oauthStates` entry, (7) Schedule initial `accounts.syncNow`. Input: code, state, provider. |
| `accounts.refreshToken` | Action | Refresh an expired access token. Steps: (1) Read account, decrypt refresh token, (2) Call provider refresh endpoint, (3) Encrypt new tokens, (4) Store via `accounts.updateTokens`, (5) Return new `TokenPair`. On failure: set account status to "error" with re-auth prompt message. |
| `accounts.addApiKeyAccount` | Action | Validate and store Paystack/Flutterwave API key. Steps: (1) Call provider validation endpoint (e.g. Paystack `/balance`), (2) If valid: encrypt API key, (3) Create `connectedAccounts` document, (4) Schedule initial `accounts.syncNow`. On failure: return validation error to client. |
| `accounts.initiateOAuth` | Mutation | Create an `oauthStates` entry with a random state token, userId, entityId, provider. Returns the state token for the client to include in the OAuth URL. TTL: 10 minutes. |

### 6.4 OAuth State — Mutations

| Function | Type | Description |
|----------|------|-------------|
| `oauthStates.create` | Mutation | Create state entry (called by `accounts.initiateOAuth`). |
| `oauthStates.validate` | Mutation | Look up by `stateToken`, verify not expired, return data, then delete entry (one-time use). Returns null if not found or expired. |
| `oauthStates.cleanup` | Mutation | Delete expired entries (run periodically or on access). |

### 6.5 Webhooks — HTTP Actions

| Function | Type | Description |
|----------|------|-------------|
| `webhooks.bankNotification` | HTTP Action | `POST /webhooks/bank-notification`. Steps: (1) Read raw body and signature header, (2) Verify HMAC-SHA256 signature using provider webhook secret (Convex env var), (3) Parse event type, (4) For `transactions.new` / `account.updated`: look up `connectedAccounts` by `providerAccountId`, trigger `accounts.syncNow`, (5) For `account.reauthorization_required`: set account status to "error" with re-auth message, (6) Return 200. Reject invalid signatures with 401. Unknown accounts return 200 (prevent retries). |
| `webhooks.oauthCallback` | HTTP Action | `GET /webhooks/oauth-callback`. Receives OAuth redirect with `code` and `state` query parameters. Calls `accounts.handleOAuthCallback` action. Returns HTML page that posts a message to the parent app (for WebView communication) or redirects to app deep link. |

### 6.6 Scheduled Functions

| Function | Schedule | Description |
|----------|----------|-------------|
| `accounts.scheduledSync` | Every 6 hours | Queries all `connectedAccounts` with `status: "active"` and `accessToken != null` and `provider not in ["manual", "statement_upload"]`. For each, schedules `accounts.syncNow` with staggered delay (e.g. 0s, 30s, 60s, … to avoid rate limit bursts). Logs results. |
| `oauthStates.scheduledCleanup` | Every 1 hour | Deletes `oauthStates` entries where `expiresAt < now`. Housekeeping. |

### 6.7 Internal Helpers (not exposed to client)

| Function | Type | Description |
|----------|------|-------------|
| `lib/encryption.encrypt` | Internal | AES-256-GCM encrypt a string. Input: plaintext, key (from env). Output: base64 ciphertext. |
| `lib/encryption.decrypt` | Internal | AES-256-GCM decrypt a string. Input: ciphertext (base64), key (from env). Output: plaintext. |
| `lib/providers/mono.ts` | Internal | Mono API client: `exchangeCode`, `refreshToken`, `getAccountDetails`, `getTransactions`, `verifyWebhook`. |
| `lib/providers/stitch.ts` | Internal | Stitch API client: `exchangeCode`, `refreshToken`, `getAccountDetails`, `getTransactions`, `verifyWebhook`. |
| `lib/providers/paystack.ts` | Internal | Paystack API client: `validateKey`, `getTransactions`. |
| `lib/providers/flutterwave.ts` | Internal | Flutterwave API client: `validateKey`, `getTransactions`. |
| `lib/providers/payoneer.ts` | Internal | Payoneer API client: `exchangeCode`, `refreshToken`, `getTransactions`. |
| `lib/providers/wise.ts` | Internal | Wise API client: `exchangeCode`, `refreshToken`, `getTransactions`, `getBalances`. |
| `lib/providers/transformer.ts` | Internal | Normalises provider-specific transaction responses into the canonical shape expected by `batchUpsert`. Per-provider transform functions. |

---

## 7. Data Models

### 7.1 Tables Required for PRD-8

| Table | Purpose | New/Existing |
|-------|---------|-------------|
| `connectedAccounts` | Bank/fintech/platform accounts with tokens and sync state | Existing (PRD-0) — enhanced with metadata |
| `oauthStates` | CSRF protection for OAuth flows | **New** |
| `importJobs` | Tracks sync operations (one job per sync) | Existing (PRD-1) — reused |
| `transactions` | Destination for synced transactions | Existing (PRD-1) — reused |

### 7.2 connectedAccounts — Enhanced Schema

The `connectedAccounts` table was defined in PRD-0 and used lightly in PRD-1. PRD-8 adds the `metadata` field:

```typescript
// convex/schema.ts — connectedAccounts table (additions in PRD-8)
connectedAccounts: defineTable({
  entityId: v.id("entities"),
  userId: v.id("users"),
  provider: v.union(
    v.literal("gtbank"), v.literal("zenith"), v.literal("access"),
    v.literal("paystack"), v.literal("flutterwave"),
    v.literal("moniepoint"), v.literal("opay"),
    v.literal("payoneer"), v.literal("wise"),
    v.literal("manual"), v.literal("statement_upload")
  ),
  providerAccountId: v.optional(v.string()),
  accountName: v.string(),
  currency: v.string(),
  accessToken: v.optional(v.string()),       // AES-256-GCM encrypted
  refreshToken: v.optional(v.string()),      // AES-256-GCM encrypted
  tokenExpiresAt: v.optional(v.number()),
  lastSyncedAt: v.optional(v.number()),
  status: v.union(v.literal("active"), v.literal("error"), v.literal("disconnected")),
  errorMessage: v.optional(v.string()),
  metadata: v.optional(v.object({            // NEW in PRD-8
    institutionId: v.optional(v.string()),
    institutionLogo: v.optional(v.string()),
    accountType: v.optional(v.string()),
    accountNumber: v.optional(v.string()),
    linkProvider: v.optional(v.union(v.literal("mono"), v.literal("stitch"))),
    apiKeyHash: v.optional(v.string()),
  })),
})
  .index("by_userId", ["userId"])
  .index("by_entityId", ["entityId"])
  .index("by_providerAccountId", ["providerAccountId"])  // NEW — for webhook lookup
  .index("by_status", ["status"]),                        // NEW — for scheduled sync query
```

### 7.3 oauthStates — New Table

```typescript
// convex/schema.ts — oauthStates table (NEW in PRD-8)
oauthStates: defineTable({
  userId: v.id("users"),
  entityId: v.id("entities"),
  provider: v.union(
    v.literal("gtbank"), v.literal("zenith"), v.literal("access"),
    v.literal("paystack"), v.literal("flutterwave"),
    v.literal("moniepoint"), v.literal("opay"),
    v.literal("payoneer"), v.literal("wise"),
    v.literal("manual"), v.literal("statement_upload")
  ),
  stateToken: v.string(),
  redirectUri: v.string(),
  expiresAt: v.number(),
})
  .index("by_stateToken", ["stateToken"])
  .index("by_expiresAt", ["expiresAt"]),
```

### 7.4 importJobs — Existing (No Changes)

The `importJobs` table from PRD-1 is reused. Sync operations create import jobs with `source: "bank_api" | "paystack" | "flutterwave"` and `connectedAccountId` set. No schema changes required.

### 7.5 transactions — Existing (No Changes)

The `transactions` table from PRD-1 is reused. Synced transactions are written via `batchUpsert` with `connectedAccountId` and `externalRef` populated. No schema changes required.

### 7.6 Indexes

New indexes added in PRD-8:

- `connectedAccounts.by_providerAccountId` — fast webhook lookup by external account ID
- `connectedAccounts.by_status` — efficient query for scheduled sync (find all active accounts)

### 7.7 Environment Variables Required

| Variable | Purpose |
|----------|---------|
| `ENCRYPTION_KEY` | AES-256-GCM key (32-byte hex) for encrypting tokens and API keys |
| `MONO_PUBLIC_KEY` | Mono Connect widget public key |
| `MONO_SECRET_KEY` | Mono API secret key (for server-to-server calls) |
| `MONO_WEBHOOK_SECRET` | Mono webhook signature verification secret |
| `STITCH_CLIENT_ID` | Stitch OAuth client ID |
| `STITCH_CLIENT_SECRET` | Stitch OAuth client secret |
| `STITCH_WEBHOOK_SECRET` | Stitch webhook signature verification secret |
| `PAYONEER_CLIENT_ID` | Payoneer OAuth client ID |
| `PAYONEER_CLIENT_SECRET` | Payoneer OAuth client secret |
| `WISE_CLIENT_ID` | Wise OAuth client ID |
| `WISE_CLIENT_SECRET` | Wise OAuth client secret |

**Note:** Paystack and Flutterwave API keys are provided by the user (per-account), not stored as environment variables. They are encrypted in `connectedAccounts.accessToken`.

---

## 8. Non-Goals

The following are explicitly **out of scope** for PRD-8:

| Item | Reason | Covered By |
|------|--------|------------|
| **AI categorisation of synced transactions** | Synced transactions arrive uncategorised (or with provider hints); AI classification is PRD-2's domain | PRD-2 |
| **Tax calculation on synced data** | Tax engine consumes transactions regardless of source | PRD-3 |
| **Real-time account balance display** | Balance data is available from providers but not needed for tax tracking; may be a future dashboard enhancement | Future |
| **Direct payments / transfers** | TaxEase is read-only (transaction import); no write operations to bank accounts | Not planned |
| **Multi-bank aggregation view** | Consolidated balance across accounts — not tax-relevant | Future |
| **Bank statement download from API** | Users can still upload PDFs; API gives structured data, not PDFs | N/A |
| **Push notification delivery for sync events** | In-app notifications only in PRD-8; push delivery is PRD-9 | PRD-9 |
| **PSD2 / EU Open Banking compliance** | Nigeria-specific providers only (Mono, Stitch); European banking not in scope | Not planned |
| **Biometric confirmation for bank linking** | OAuth widget handles its own authentication; no additional biometric gate | Future |
| **Transaction editing during sync** | Synced transactions are immutable during import; user edits after sync complete | By design |
| **Partial sync / transaction selection** | All transactions since `lastSyncedAt` are synced; no cherry-picking | By design |

---

## 9. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Account linking success rate** | ≥ 60% of users who initiate OAuth complete linking | `connectedAccounts` created / OAuth flows initiated |
| **Active linked accounts** | ≥ 20% of active users have at least 1 live-linked account within 90 days | `connectedAccounts` with `status: "active"` and `provider not in ["manual", "statement_upload"]` |
| **Sync success rate** | ≥ 95% of scheduled syncs complete without error | `importJobs` with `source: "bank_api"` and `status: "complete"` / total |
| **Average sync latency** | < 30 seconds from trigger to completion | `importJobs.completedAt - importJobs.startedAt` |
| **Webhook-to-sync latency** | < 60 seconds from webhook receipt to transactions visible | Webhook timestamp → `importJobs.completedAt` |
| **Token refresh success rate** | ≥ 90% of token refreshes succeed without user re-authentication | Refresh attempts vs re-auth prompts |
| **Re-authentication rate** | < 10% of linked accounts require re-auth per month | Accounts entering "error" state with token-related messages |
| **Duplicate detection accuracy** | Zero false positives (valid transactions incorrectly skipped) | Manual audit of `duplicatesSkipped` samples |
| **Disconnect rate** | < 5% of linked accounts disconnected within 30 days | `accounts.disconnect` calls / active accounts |
| **Import volume shift** | ≥ 30% of imported transactions come from live sync (vs PDF/CSV) within 6 months | `importJobs.source = "bank_api"` transaction count / total |
| **Error recovery rate** | ≥ 80% of accounts in "error" state recover (auto or manual) within 24 hours | Status transition tracking |

---

## 10. Open Questions

| # | Question | Owner | Impact |
|---|----------|-------|--------|
| 1 | **Mono vs Stitch as primary provider:** Should we launch with Mono only (broader coverage in Nigeria) and add Stitch later, or support both from day one? | Product / Eng | Architecture complexity — dual provider adds ~3 days |
| 2 | **Wise multi-currency handling:** When a user has USD, GBP, and EUR balances on Wise, should we create one `connectedAccounts` entry per currency or one entry with multi-currency sync? | Product | Data model — affects sync logic and UI |
| 3 | **Historical transaction depth:** How far back should the initial sync fetch? Options: (a) All available history, (b) Current tax year only, (c) Last 12 months, (d) User-configurable. | Product | Sync time and dedup complexity |
| 4 | **Paystack/Flutterwave webhook support:** Should we also register webhooks with Paystack/Flutterwave for real-time payment notifications, or rely on scheduled polling? | Eng | Faster sync for payment platforms; additional webhook endpoint |
| 5 | **Rate limit handling across users:** If many users link accounts at the same Mono-supported bank, aggregate rate limits could be hit. Do we need per-bank queuing? | Eng | Scalability — relevant at ~1000+ linked accounts |
| 6 | **Token rotation policy:** Should we proactively rotate tokens periodically (e.g. weekly) even if not expired, for security? | Security | Token management complexity |
| 7 | **Disconnected account retention:** How long should disconnected accounts be retained? Options: (a) Indefinitely, (b) Auto-delete after 90 days, (c) User must explicitly delete. | Product | Data retention policy |
| 8 | **Encryption key rotation:** What is the plan if the AES-256-GCM encryption key is compromised? Need a key rotation strategy and re-encryption migration. | Security / Eng | Critical security requirement |
| 9 | **Provider availability by bank:** Which Nigerian banks does Mono currently support? Which does Stitch cover that Mono doesn't? Need a compatibility matrix before launch. | Eng | Feature scope — determines which banks users can link |
| 10 | **Sandbox / test mode:** Do we need a sandbox mode for testing bank linking without real bank credentials? Mono and Stitch both offer test environments. | Eng | Development workflow |
| 11 | **Consent and data access disclosure:** Nigeria Data Protection Act 2023 requires explicit consent for financial data access. Do we need a consent screen before opening the OAuth widget? | Legal / Product | Compliance |
| 12 | **Fallback when CBN rate unavailable:** For FX conversion, if the CBN API is down or doesn't have a rate for the transaction date, should we (a) queue the transaction, (b) use the most recent available rate, or (c) skip importing? | Product | Data accuracy |

---

## Appendix A: Security Considerations

### A.1 Token Encryption

All OAuth access tokens, refresh tokens, and API keys are encrypted using **AES-256-GCM** before being written to the `connectedAccounts` table.

- **Algorithm:** AES-256-GCM (authenticated encryption)
- **Key:** 256-bit key stored in Convex environment variable `ENCRYPTION_KEY`
- **IV:** Randomly generated 12-byte IV per encryption operation, prepended to ciphertext
- **Auth tag:** 16-byte tag appended to ciphertext
- **Storage format:** Base64-encoded `IV || ciphertext || authTag`
- **Decryption:** Only performed server-side in Convex actions; decrypted tokens never sent to client

### A.2 OAuth Security

- **State parameter:** Random UUID generated per OAuth flow, stored in `oauthStates` with 10-minute TTL. Prevents CSRF attacks.
- **PKCE:** If supported by provider (Stitch supports PKCE), use `code_challenge` and `code_verifier` for additional security.
- **Redirect URI validation:** Only pre-registered callback URLs accepted.
- **Token scope:** Request minimum necessary scope (read-only transaction access).
- **Token storage:** Tokens stored only in Convex (server-side); never cached on client.

### A.3 Webhook Signature Verification

- **Mono:** HMAC-SHA512 of request body using `MONO_WEBHOOK_SECRET`. Signature in `mono-webhook-secret` header.
- **Stitch:** HMAC-SHA256 of request body using `STITCH_WEBHOOK_SECRET`. Signature in `X-Stitch-Signature` header.
- **Verification flow:** Compute expected signature server-side; constant-time comparison with received signature. Reject mismatches with 401.
- **Replay protection:** Webhook payloads include timestamp; reject payloads older than 5 minutes.

### A.4 API Key Security (Paystack/Flutterwave)

- **Input:** User provides secret key via masked input field.
- **Validation:** Key validated server-side by calling provider API (never validated client-side).
- **Storage:** Key encrypted (AES-256-GCM) and stored in `connectedAccounts.accessToken`.
- **Hash:** SHA-256 hash stored in `metadata.apiKeyHash` for verification without decryption.
- **Display:** Key never displayed to user after initial entry; shown as "••••••••" in UI.

### A.5 Data Access & Privacy

- **Principle of least privilege:** Only read-only API access requested from all providers.
- **Data retention:** Synced transactions stored in `transactions` table (same as manually imported). Tokens deleted on disconnect.
- **User consent:** User explicitly initiates every connection. OAuth widget shows bank's own consent screen.
- **Data deletion:** On account disconnect, tokens are securely deleted. On user account deletion (PRD-0), all `connectedAccounts` and tokens are deleted.
- **Nigeria Data Protection Act 2023:** Explicit consent obtained before financial data access. Users can revoke access (disconnect) at any time.

---

## Appendix B: Provider Integration Matrix

| Provider | Connection Method | Auth Type | Token Lifetime | Rate Limit | Currency | Amount Unit |
|----------|-------------------|-----------|---------------|------------|----------|-------------|
| GTBank (via Mono) | Mono Connect | OAuth 2.0 | Access: ~24h, Refresh: ~30d | 100 req/min | NGN | Kobo (÷100) |
| Zenith (via Mono) | Mono Connect | OAuth 2.0 | Access: ~24h, Refresh: ~30d | 100 req/min | NGN | Kobo (÷100) |
| Access (via Mono) | Mono Connect | OAuth 2.0 | Access: ~24h, Refresh: ~30d | 100 req/min | NGN | Kobo (÷100) |
| Moniepoint (via Mono) | Mono Connect | OAuth 2.0 | Access: ~24h, Refresh: ~30d | 100 req/min | NGN | Kobo (÷100) |
| OPay (via Mono) | Mono Connect | OAuth 2.0 | Access: ~24h, Refresh: ~30d | 100 req/min | NGN | Kobo (÷100) |
| Banks (via Stitch) | Stitch Link | OAuth 2.0 + PKCE | Access: ~1h, Refresh: ~90d | 60 req/min | NGN | Naira |
| Paystack | API Key | Bearer token | No expiry (key-based) | ~10 req/sec | NGN | Kobo (÷100) |
| Flutterwave | API Key | Bearer token | No expiry (key-based) | ~5 req/sec | NGN, USD, others | Currency unit |
| Payoneer | OAuth 2.0 | OAuth 2.0 | Access: ~3h, Refresh: ~30d | Standard | USD, EUR, GBP | Currency unit |
| Wise | OAuth 2.0 | OAuth 2.0 | Access: ~12h, Refresh: ~10y | Standard | Multi-currency | Currency unit |

---

*End of PRD-8 — Bank Linking & Live Sync*
