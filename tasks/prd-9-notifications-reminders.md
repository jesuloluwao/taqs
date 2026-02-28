# PRD-9: Notifications & Reminders

**TaxEase Nigeria**  
**Version:** 1.0 — February 2026  
**Status:** Draft  
**Priority:** P2 — Cross-Cutting Enhancement  
**Estimated Effort:** 1 week  

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

PRD-9 delivers the notification infrastructure that transforms TaxEase from a tool you open at tax time into a **year-round companion**. Scheduled functions (cron jobs) monitor filing deadlines, VAT return dates, uncategorised transactions, invoice due dates, and system events — then emit timely, actionable notifications that keep users compliant and engaged.

This is a cross-cutting enhancement that touches multiple domains. The notification system is designed as a **generic infrastructure** so any domain (transactions, invoicing, filing, bank sync) can emit notifications through a single `notifications.create` internal mutation. The scheduled functions defined here are the backend heart of user engagement.

### 1.2 Scope

| In Scope | Out of Scope |
|----------|--------------|
| `notifications` table and CRUD operations | SMS notifications |
| In-app notification centre (list, detail, mark read) | Email notification delivery (future enhancement) |
| Notification bell with unread badge | Notification grouping/threading |
| Notification preferences UI (settings screen) | Rich media notifications (images, action buttons in push) |
| Push notification infrastructure (FCM + APNs) | Notification analytics dashboard |
| Web push notifications (FCM for web) | User-to-user notifications |
| All scheduled functions (7 cron jobs) | Custom notification schedules per user |
| Notification deduplication | Notification snooze/postpone |
| Notification expiry/cleanup | Notification channels/topics |
| Deep-link navigation from notifications | |
| Message templates with penalty context | |

### 1.3 Out-of-Box Experience

Upon completion of PRD-9, a user can:

1. **Receive timely reminders** about filing deadlines (30, 14, 7, 1 days before March 31) with penalty context
2. **Get VAT return alerts** before the 21st of each month (for VAT-registered entities)
3. **Be nudged** about uncategorised transactions (daily or weekly per preference)
4. **Know immediately** when an invoice goes overdue
5. **See import results** — success or failure notifications after bank statement imports
6. **Be alerted** to bank sync errors
7. **View all notifications** in a chronological, grouped notification centre
8. **Control exactly** which notifications they receive via a granular settings screen
9. **Receive push notifications** on mobile even when the app is backgrounded

### 1.4 Dependencies

| Dependency | Type | What It Provides |
|------------|------|------------------|
| PRD-0 (Auth, Entity Setup, Preferences) | Hard | Users, entities, `userPreferences` table with notification settings |
| PRD-1 (Transaction Management) | Hard | Uncategorised transaction count for alerts; import job status for import notifications |
| PRD-4 (Invoicing) | Hard | Invoice `dueDate` and `status` for overdue detection |
| PRD-6 (Filing Module) | Soft | Filing deadline dates (March 31 is hardcoded; filing record status for context) |

### 1.5 Blocks

- No PRDs depend on PRD-9 to function, but all PRDs benefit from its notification infrastructure. Future PRDs can call `notifications.create` to emit domain-specific notifications.

---

## 2. Entities (TypeScript Interfaces)

### 2.1 Notification

```typescript
/** In-app notification record */
interface Notification {
  _id: Id<"notifications">;
  _creationTime: number;
  userId: Id<"users">;
  type: NotificationType;
  title: string;
  body: string;
  entityId?: Id<"entities">;
  relatedId?: string;
  read: boolean;
  readAt?: number;
}

type NotificationType =
  | "deadline_reminder"
  | "uncategorised_transactions"
  | "invoice_overdue"
  | "import_complete"
  | "import_failed"
  | "vat_due"
  | "sync_error"
  | "recurring_invoice_generated";
```

### 2.2 NotificationPreferences

```typescript
/**
 * Notification preferences — stored in the userPreferences table (PRD-0).
 * Extracted here as a logical interface for the notification domain.
 */
interface NotificationPreferences {
  deadlineReminderDays: number[];
  vatReminderEnabled: boolean;
  uncategorisedAlertFrequency: "daily" | "weekly" | "off";
  invoiceOverdueDays: number;
  pushEnabled: boolean;
}
```

### 2.3 PushToken

```typescript
/** Device push token for FCM (Android/Web) or APNs (iOS) */
interface PushToken {
  _id: Id<"pushTokens">;
  _creationTime: number;
  userId: Id<"users">;
  token: string;
  platform: "ios" | "android" | "web";
  active: boolean;
  lastUsedAt?: number;
}
```

### 2.4 DeadlineConfig

```typescript
/** Static deadline configuration used by scheduled functions */
interface DeadlineConfig {
  /** Filing deadline: March 31 of the year following the tax year */
  filingDeadline: {
    month: 3;
    day: 31;
  };
  /** VAT return deadline: 21st of the following month */
  vatReturnDeadline: {
    day: 21;
  };
  /** Penalty reference for urgency messaging */
  penalties: {
    lateFilingFirstMonth: "₦100,000";
    lateFilingSubsequentMonth: "₦50,000/month";
    latePayment: "10% + interest at CBN MPR";
    lateVatFirstMonth: "₦50,000";
    lateVatSubsequentMonth: "₦25,000/month";
  };
}
```

### 2.5 NotificationGrouped

```typescript
/** Frontend display type for grouped notification list */
interface NotificationGrouped {
  date: string;
  label: "Today" | "Yesterday" | "This Week" | string;
  notifications: Notification[];
}
```

### 2.6 NotificationNavigationTarget

```typescript
/**
 * Maps notification types to their deep-link navigation targets.
 * Used by both push tap handlers and in-app notification tap.
 */
type NotificationNavigationMap = {
  deadline_reminder: { screen: "Filing"; params: { entityId: string } };
  uncategorised_transactions: { screen: "TransactionTriage"; params: { entityId: string } };
  invoice_overdue: { screen: "InvoiceDetail"; params: { invoiceId: string } };
  import_complete: { screen: "ImportResults"; params: { importJobId: string } };
  import_failed: { screen: "ImportResults"; params: { importJobId: string } };
  vat_due: { screen: "Filing"; params: { entityId: string } };
  sync_error: { screen: "ConnectedAccounts"; params: { accountId: string } };
  recurring_invoice_generated: { screen: "InvoiceDetail"; params: { invoiceId: string } };
};
```

---

## 3. User Stories

### 3.1 Notification Centre

#### US-901: View Notification List

**As a** TaxEase user  
**I want** to see all my notifications in a chronological list grouped by date  
**So that** I can review what's happened and what needs my attention  

**Trigger:** User taps the notification bell icon in the header  

**Flow:**
1. User taps the bell icon on any authenticated screen
2. App navigates to the Notifications screen
3. **Layout & Scroll:** Header ("Notifications", back arrow, "Mark all as read") sticky at top; notification list scrolls below. Load more on scroll to bottom.
4. Notifications load, ordered by creation time (newest first)
5. Notifications are grouped by date: "Today", "Yesterday", "This Week", "Earlier", or specific dates
6. Unread notifications appear with a primary-light (`#E8F5F0`) background and a left accent border matching the notification severity colour
7. Read notifications appear with a white background and neutral-500 text
8. Each notification card shows: type icon (colour-coded), title, body (truncated to 2 lines), relative timestamp ("2h ago", "Yesterday")
9. Pull-to-refresh reloads the list

**Acceptance Criteria:**
- [ ] Notifications query: `notifications.list` returns all user notifications ordered by `_creationTime` desc
- [ ] Notifications grouped by date with semantic labels (Today, Yesterday, This Week, Earlier)
- [ ] Unread notifications visually distinct (primary-light background, coloured left border)
- [ ] Read notifications use white background with neutral-500 secondary text
- [ ] Type icon colour mapping: `deadline_reminder` → warning, `invoice_overdue` → danger, `uncategorised_transactions` → warning, `import_complete` → success, `import_failed` → danger, `vat_due` → warning, `sync_error` → danger, `recurring_invoice_generated` → success
- [ ] Relative timestamps shown ("2h ago", "3d ago")
- [ ] Pull-to-refresh supported
- [ ] Pagination: initial load 50 notifications, load more on scroll
- [ ] Header sticky; list scrolls independently

---

#### US-902: View Notification Detail / Navigate to Related Screen

**As a** user who received a notification  
**I want** to tap a notification and go to the relevant screen  
**So that** I can take immediate action on the notification  

**Trigger:** User taps a notification card in the list  

**Flow:**
1. User taps a notification card
2. Notification is marked as read (if not already) via `notifications.markRead`
3. App navigates to the screen related to the notification type:

| Notification Type | Navigation Target | Params |
|---|---|---|
| `deadline_reminder` | Filing screen | `{ entityId }` |
| `uncategorised_transactions` | Transaction Triage | `{ entityId }` |
| `invoice_overdue` | Invoice Detail | `{ invoiceId: relatedId }` |
| `import_complete` | Import Results | `{ importJobId: relatedId }` |
| `import_failed` | Import Results | `{ importJobId: relatedId }` |
| `vat_due` | Filing screen | `{ entityId }` |
| `sync_error` | Connected Accounts | `{ accountId: relatedId }` |
| `recurring_invoice_generated` | Invoice Detail | `{ invoiceId: relatedId }` |

4. If `relatedId` or navigation target is unavailable (e.g. deleted entity), show toast: "This item is no longer available."

**Acceptance Criteria:**
- [ ] Tapping a notification calls `notifications.markRead` and navigates to the correct screen
- [ ] Navigation uses `relatedId` to pass entity-specific params
- [ ] Graceful handling when the related entity/document has been deleted
- [ ] Read status updates immediately in the UI (optimistic update)

---

#### US-903: Mark Single Notification as Read

**As a** user  
**I want** to mark a notification as read without navigating away  
**So that** I can acknowledge it and reduce my unread count  

**Trigger:** User swipes left on a notification card (mobile) or clicks the "mark read" action (web)  

**Flow:**
1. User swipes left on a notification card or clicks the "•" menu → "Mark as read"
2. `notifications.markRead` mutation called with notification ID
3. Notification background transitions from primary-light to white
4. Unread badge count decrements
5. Optimistic UI update; revert on error

**Acceptance Criteria:**
- [ ] Swipe-to-mark-read gesture on mobile
- [ ] Context menu or icon button on web
- [ ] `read: true` and `readAt: Date.now()` persisted
- [ ] Badge count updates in real-time
- [ ] Optimistic update with rollback on error

---

#### US-904: Mark All Notifications as Read

**As a** user with many unread notifications  
**I want** to mark all of them as read at once  
**So that** I can clear my notification badge quickly  

**Trigger:** User taps "Mark all as read" button at the top of the notification list  

**Flow:**
1. User taps "Mark all as read" in the notification list header
2. Confirmation is NOT required (non-destructive action)
3. `notifications.markAllRead` mutation called
4. All notification cards transition to read state
5. Badge count resets to 0

**Acceptance Criteria:**
- [ ] "Mark all as read" button visible when unread count > 0
- [ ] Button hidden or disabled when all notifications are read
- [ ] All notifications updated to `read: true`, `readAt: Date.now()`
- [ ] Badge count resets to 0

---

#### US-905: Notification Bell Badge (Unread Count)

**As a** user on any authenticated screen  
**I want** to see a badge on the notification bell showing how many unread notifications I have  
**So that** I know at a glance whether anything needs my attention  

**Trigger:** Always visible in the header for authenticated users  

**Flow:**
1. Header renders bell icon on the right side (per Frontend Spec §3.2)
2. `notifications.getUnreadCount` query runs reactively
3. If count > 0: red badge overlay displays the count (max "99+")
4. If count = 0: no badge shown
5. Badge updates in real-time as notifications are created or read (Convex reactivity)

**Acceptance Criteria:**
- [ ] Bell icon present on all authenticated screens
- [ ] Badge shows unread count; hidden when 0
- [ ] Count capped at "99+" for display
- [ ] Real-time reactivity: badge updates immediately when new notification arrives or notification is read
- [ ] Tapping bell navigates to Notifications screen (US-901)

---

#### US-906: Empty Notification State

**As a** new user or a user who has read all notifications  
**I want** to see a friendly empty state in the notification centre  
**So that** I know there's nothing pending  

**Trigger:** User opens Notifications screen with no notifications  

**Flow:**
1. User navigates to Notifications screen
2. Query returns empty list
3. Screen shows: illustration (bell with checkmark), headline: "You're all caught up!", subtext: "We'll notify you about deadlines, invoices, and important updates."

**Acceptance Criteria:**
- [ ] Empty state illustration, headline, and subtext displayed
- [ ] No "Mark all as read" button in empty state
- [ ] Consistent with app-wide empty state pattern (illustration + headline + subtext)

---

#### US-907: Notification List Loading State

**As a** user  
**I want** to see skeleton placeholders while notifications load  
**So that** I know content is coming  

**Trigger:** Notifications screen first load or refresh  

**Flow:**
1. While `notifications.list` query is loading, display 5–8 skeleton cards
2. Each skeleton card mimics the notification card layout: icon circle, title bar, body lines, timestamp
3. Skeleton animates with shimmer effect
4. When data arrives, skeletons are replaced with real notification cards

**Acceptance Criteria:**
- [ ] Skeleton cards match notification card dimensions
- [ ] Shimmer animation on skeletons
- [ ] Smooth transition from skeleton to real content
- [ ] No layout shift when content loads

---

### 3.2 Notification Settings (Preferences)

#### US-908: View Notification Settings

**As a** user  
**I want** to see my current notification preferences  
**So that** I can review what notifications I'm subscribed to  

**Trigger:** Settings → Notifications  

**Flow:**
1. User navigates to Settings → Notifications
2. Screen loads current preferences from `users.getPreferences`
3. Settings displayed in grouped sections:

**Filing & Tax Deadlines**
- Filing deadline reminders: toggle (on/off) + lead time multi-select chips (30 / 14 / 7 / 1 day before)
- VAT return reminders: toggle

**Transactions**
- Uncategorised transaction alerts: toggle + frequency selector (Daily / Weekly)

**Invoicing**
- Invoice overdue alerts: toggle + days after due selector (1 / 3 / 7 days)

**Push Notifications**
- Push notifications: toggle + permission status indicator
- If permission denied: "Enable in Settings" deep link to device settings

**Acceptance Criteria:**
- [ ] All preference fields from `userPreferences` displayed
- [ ] Current values loaded and reflected in UI
- [ ] Grouped into logical sections with section headers
- [ ] Push permission status accurately reflects device permission state

---

#### US-909: Configure Filing Deadline Reminders

**As a** user  
**I want** to choose when I receive filing deadline reminders  
**So that** I'm notified at the right times before March 31  

**Trigger:** User toggles or adjusts filing deadline reminder settings  

**Flow:**
1. User sees "Filing deadline reminders" toggle (default: ON)
2. When ON, lead time chips are shown: 30 days, 14 days, 7 days, 1 day
3. User taps chips to select/deselect (multi-select); at least one must be selected when toggle is ON
4. Selected values stored in `deadlineReminderDays` array (e.g. `[30, 14, 7, 1]`)
5. Changes auto-save or save on explicit "Save" tap (see US-914)

**Acceptance Criteria:**
- [ ] Toggle enables/disables all filing deadline reminders
- [ ] When ON, at least one lead day must be selected (validation)
- [ ] Multi-select chips for 30, 14, 7, 1
- [ ] Deselecting all chips while toggle is ON shows validation message: "Select at least one reminder day"
- [ ] Toggle OFF sets `deadlineReminderDays: []`

---

#### US-910: Configure VAT Return Reminders

**As a** user with a VAT-registered entity  
**I want** to toggle VAT return reminders  
**So that** I'm reminded before the 21st of each month  

**Trigger:** User toggles VAT return reminders  

**Flow:**
1. User sees "VAT return reminders" toggle (default: ON for VAT-registered entities, OFF otherwise)
2. Toggle updates `vatReminderEnabled`
3. Contextual note: "Reminds you before the 21st of each month for VAT-registered entities"

**Acceptance Criteria:**
- [ ] Toggle visible regardless of VAT registration status
- [ ] Contextual note explains the reminder schedule
- [ ] Default ON for VAT-registered entities, OFF otherwise
- [ ] Updates `vatReminderEnabled` in `userPreferences`

---

#### US-911: Configure Uncategorised Transaction Alerts

**As a** user  
**I want** to control how often I'm alerted about uncategorised transactions  
**So that** I stay on top of categorisation without being overwhelmed  

**Trigger:** User adjusts uncategorised alert settings  

**Flow:**
1. User sees "Uncategorised transaction alerts" toggle (default: ON)
2. When ON, frequency selector appears: Daily / Weekly
3. User selects frequency
4. Updates `uncategorisedAlertFrequency` ("daily" | "weekly" | "off")
5. Toggle OFF sets frequency to "off"

**Acceptance Criteria:**
- [ ] Toggle ON/OFF controls the alert
- [ ] Frequency selector: segmented control or radio — Daily / Weekly
- [ ] Toggle OFF → `uncategorisedAlertFrequency: "off"`
- [ ] Toggle ON with no selection defaults to "weekly"

---

#### US-912: Configure Invoice Overdue Alerts

**As a** user who sends invoices  
**I want** to choose how many days after the due date I'm alerted about overdue invoices  
**So that** I can follow up promptly  

**Trigger:** User adjusts invoice overdue alert settings  

**Flow:**
1. User sees "Invoice overdue alerts" toggle (default: ON)
2. When ON, day selector appears: 1 day / 3 days / 7 days after due date
3. User selects one option (single-select)
4. Updates `invoiceOverdueDays` (1, 3, or 7)
5. Toggle OFF disables invoice overdue alerts entirely

**Acceptance Criteria:**
- [ ] Toggle ON/OFF
- [ ] Day selector: 1 / 3 / 7 (single-select chips or radio)
- [ ] Default: 1 day
- [ ] Updates `invoiceOverdueDays` in `userPreferences`

---

#### US-913: Enable/Disable Push Notifications

**As a** user  
**I want** to control whether I receive push notifications  
**So that** I can manage interruptions on my device  

**Trigger:** User toggles push notifications in settings  

**Flow:**
1. User sees "Push notifications" toggle
2. Current device permission status shown:
   - **Granted:** Toggle reflects current preference (`pushEnabled`); user can toggle OFF to mute pushes without revoking OS permission
   - **Denied:** Toggle is OFF and disabled; message: "Push notifications are disabled on your device" with "Enable in Settings" button
   - **Not determined:** Toggle prompts for permission on first enable
3. If user toggles ON and permission is "not determined": trigger OS permission request
4. If permission granted: register device token via `pushTokens.register`, set `pushEnabled: true`
5. If permission denied by OS: show "Enable in Settings" deep link
6. If user toggles OFF: set `pushEnabled: false` (token remains registered but notifications won't be sent)

**Deep link behaviour:**
- iOS: `Linking.openSettings()` → opens app notification settings
- Android: `Linking.openSettings()` → opens app info page
- Web: show instruction text "Enable notifications in your browser settings"

**Acceptance Criteria:**
- [ ] Toggle reflects `pushEnabled` preference AND device permission state
- [ ] Toggling ON when permission undetermined triggers OS permission prompt
- [ ] Successful permission grant registers push token and enables push
- [ ] Denied permission shows "Enable in Settings" deep link
- [ ] Toggling OFF sets `pushEnabled: false` without deregistering token
- [ ] Deep link opens correct OS/browser settings

---

#### US-914: Save Notification Preferences

**As a** user who has changed notification settings  
**I want** my changes to persist  
**So that** my preferences are respected by the scheduled functions  

**Trigger:** User taps "Save" or navigates away (auto-save)  

**Flow:**
1. User makes changes to any notification preference
2. On explicit "Save" tap (or debounced auto-save after 1s of inactivity):
   - Call `users.updatePreferences` with updated fields
   - Show success toast: "Notification preferences saved"
3. On error: show error toast: "Failed to save preferences. Please try again."
4. Navigating away with unsaved changes: prompt "You have unsaved changes. Discard?"

**Acceptance Criteria:**
- [ ] `users.updatePreferences` mutation called with full preferences object
- [ ] Success toast on save
- [ ] Error toast with retry guidance on failure
- [ ] Unsaved changes warning on navigation away
- [ ] Preferences immediately effective for next scheduled function run

---

### 3.3 Scheduled Notifications (Backend)

#### US-915: Filing Deadline Reminder

**As a** user with active entities  
**I want** to receive reminders before the March 31 filing deadline  
**So that** I file on time and avoid penalties  

**Schedule:** Daily at 08:00 WAT (07:00 UTC)  
**Function:** `reminders.checkFilingDeadline`  

**Logic:**
1. Calculate the filing deadline for the current tax year: March 31 of the current year (covers the previous tax year)
2. Calculate days remaining: `daysUntilDeadline = filingDeadline - today`
3. For each active user:
   a. Fetch user's `deadlineReminderDays` from `userPreferences` (default: `[30, 14, 7, 1]`)
   b. If `deadlineReminderDays` is empty, skip user
   c. If `daysUntilDeadline` matches any value in `deadlineReminderDays`:
      - **Deduplication check:** Query `notifications` for this user where `type = "deadline_reminder"` and `_creationTime` is today → skip if exists
      - For each of the user's entities: create notification via `notifications.create`
      - If `pushEnabled`: send push notification

**Message Templates:**

| Days | Title | Body |
|------|-------|------|
| 30 | 📅 Filing deadline in 30 days | Your {taxYear} tax return is due March 31. Start preparing now to avoid the ₦100,000 late filing penalty. |
| 14 | ⚠️ 2 weeks until filing deadline | Your {taxYear} tax return is due March 31. Late filing attracts ₦100,000 + ₦50,000/month. Review your tax summary now. |
| 7 | 🔴 1 week to file your tax return | Your {taxYear} return is due March 31 — just 7 days away. ₦100,000 penalty applies from April 1. File now! |
| 1 | 🚨 TOMORROW: Filing deadline | Your {taxYear} tax return is due TOMORROW (March 31). File today to avoid ₦100,000 + ₦50,000/month penalties. |

**Variables:** `{taxYear}` = the tax year being filed (e.g. "2025" for the return due March 31, 2026)

**Navigation target:** Filing screen (`entityId` from notification's `entityId`)

**Acceptance Criteria:**
- [ ] Cron runs daily at 08:00 WAT
- [ ] Checks all active users with non-empty `deadlineReminderDays`
- [ ] Creates notification only when `daysUntilDeadline` matches a preference day
- [ ] Deduplication: no duplicate notifications for the same user + type + day
- [ ] Penalty amounts included in body text per Tax Engine Spec §14
- [ ] Notification created per entity (user with 3 entities gets 3 notifications)
- [ ] Push sent if `pushEnabled: true`

---

#### US-916: VAT Return Deadline Reminder

**As a** user with VAT-registered entities  
**I want** to be reminded before the monthly VAT return deadline (21st)  
**So that** I file VAT returns on time and avoid penalties  

**Schedule:** Daily at 08:00 WAT (07:00 UTC)  
**Function:** `reminders.checkVatDeadline`  

**Logic:**
1. Calculate the VAT return deadline: 21st of the current month
2. Calculate `daysUntilVatDeadline = 21st - today`
3. For each active user where `vatReminderEnabled: true`:
   a. Fetch user's entities where `vatRegistered: true`
   b. If no VAT-registered entities, skip
   c. If `daysUntilVatDeadline` is 7, 3, or 1:
      - **Deduplication check:** Query for existing `vat_due` notification for this user created today → skip if exists
      - For each VAT-registered entity: create notification
      - Send push if enabled

**Message Templates:**

| Days | Title | Body |
|------|-------|------|
| 7 | 📅 VAT return due in 7 days | Your VAT return for {month} is due on the 21st. Late filing attracts ₦50,000 + ₦25,000/month. |
| 3 | ⚠️ VAT return due in 3 days | Your {month} VAT return is due on the 21st. Prepare your return now to avoid the ₦50,000 penalty. |
| 1 | 🚨 VAT return due TOMORROW | Your {month} VAT return is due tomorrow (21st). ₦50,000 penalty applies from the 22nd. File today! |

**Variables:** `{month}` = the reporting month name (e.g. "January 2026" for the return due February 21)

**Navigation target:** Filing screen (`entityId`)

**Acceptance Criteria:**
- [ ] Cron runs daily at 08:00 WAT
- [ ] Only processes users with `vatReminderEnabled: true`
- [ ] Only creates notifications for entities where `vatRegistered: true`
- [ ] Reminder days: 7, 3, 1 before the 21st
- [ ] Penalty amounts from Tax Engine Spec §14
- [ ] Deduplication: one notification per user per day per type
- [ ] Push sent if enabled

---

#### US-917: Uncategorised Transactions Alert (Daily)

**As a** user who receives income and expenses  
**I want** to be reminded daily about uncategorised transactions  
**So that** I keep my books clean and my tax calculation accurate  

**Schedule:** Daily at 10:00 WAT (09:00 UTC)  
**Function:** `reminders.uncategorisedAlert`  

**Logic:**
1. Query all users where `uncategorisedAlertFrequency = "daily"`
2. For each user, for each entity:
   a. Count transactions where `type = "uncategorised"`
   b. If count > 0:
      - **Deduplication check:** Query for existing `uncategorised_transactions` notification created today for this user → skip if exists
      - Create notification
      - Send push if enabled

**Message Template:**

| Title | Body |
|-------|------|
| 📋 {count} uncategorised transaction(s) | You have {count} uncategorised transaction(s) for {entityName}. Categorise them to keep your tax calculation accurate. |

**Variables:** `{count}` = number of uncategorised transactions, `{entityName}` = entity name

**Navigation target:** Transaction Triage screen (`entityId`)

**Acceptance Criteria:**
- [ ] Cron runs daily at 10:00 WAT
- [ ] Only processes users with `uncategorisedAlertFrequency: "daily"`
- [ ] Counts uncategorised transactions per entity
- [ ] Does not notify if count is 0
- [ ] Deduplication: one per user per day
- [ ] Push sent if enabled

---

#### US-918: Uncategorised Transactions Alert (Weekly)

**As a** user who prefers weekly nudges  
**I want** to be reminded once a week about uncategorised transactions  
**So that** I stay on track without daily interruptions  

**Schedule:** Mondays at 10:00 WAT (09:00 UTC)  
**Function:** `reminders.uncategorisedAlertWeekly`  

**Logic:**
1. Query all users where `uncategorisedAlertFrequency = "weekly"`
2. For each user, for each entity:
   a. Count transactions where `type = "uncategorised"`
   b. If count > 0:
      - Create notification (no dedup needed — runs once per week)
      - Send push if enabled

**Message Template:**

| Title | Body |
|-------|------|
| 📋 Weekly review: {count} uncategorised transaction(s) | You have {count} uncategorised transaction(s) for {entityName} this week. Take a few minutes to categorise them. |

**Variables:** Same as daily alert

**Navigation target:** Transaction Triage screen (`entityId`)

**Acceptance Criteria:**
- [ ] Cron runs Mondays at 10:00 WAT
- [ ] Only processes users with `uncategorisedAlertFrequency: "weekly"`
- [ ] Same counting logic as daily alert
- [ ] Does not notify if count is 0
- [ ] Push sent if enabled

---

#### US-919: Invoice Overdue Alert

**As a** user who has sent invoices  
**I want** to be notified when an invoice passes its due date  
**So that** I can follow up with the client promptly  

**Schedule:** Daily at 09:00 WAT (08:00 UTC)  
**Function:** `invoices.checkOverdue`  

**Logic:**
1. Query all invoices where `status = "sent"` and `dueDate < today`
2. For each overdue invoice:
   a. Update invoice status to `"overdue"`
   b. Fetch invoice owner's `invoiceOverdueDays` preference
   c. Calculate `daysOverdue = today - dueDate`
   d. If `daysOverdue` matches `invoiceOverdueDays` (1, 3, or 7):
      - **Deduplication check:** Query for existing `invoice_overdue` notification with same `relatedId` (invoice ID) created today → skip if exists
      - Create notification with `relatedId = invoice._id`
      - Send push if enabled
3. Also notify on exact day invoice becomes overdue (day 0 → day 1 transition)

**Message Template:**

| Title | Body |
|-------|------|
| 💰 Invoice #{invoiceNumber} is overdue | Invoice #{invoiceNumber} to {clientName} for {currency} {amount} was due {daysOverdue} day(s) ago. Follow up with your client. |

**Variables:** `{invoiceNumber}`, `{clientName}`, `{currency}`, `{amount}` (formatted), `{daysOverdue}`

**Navigation target:** Invoice Detail screen (`invoiceId`)

**Acceptance Criteria:**
- [ ] Cron runs daily at 09:00 WAT
- [ ] Finds invoices with `status: "sent"` past `dueDate`
- [ ] Updates invoice status to `"overdue"` (idempotent — already overdue stays overdue)
- [ ] Creates notification on day matching user's `invoiceOverdueDays` preference
- [ ] Deduplication by `relatedId` + type + day
- [ ] Push sent if enabled
- [ ] Cancelled and paid invoices excluded

---

#### US-920: Import Complete Notification

**As a** user who uploaded a bank statement  
**I want** to be notified when the import finishes successfully  
**So that** I can review the imported transactions  

**Trigger:** Called by the import pipeline (`processImport` action) on successful completion  
**Function:** `notifications.create` (internal mutation, called programmatically — not a cron)  

**Logic:**
1. When `processImport` completes successfully:
   a. Create notification with `type: "import_complete"`, `relatedId: importJob._id`
   b. Send push if enabled

**Message Template:**

| Title | Body |
|-------|------|
| ✅ Import complete | {count} transaction(s) imported from {source}. Review them now to categorise and verify. |

**Variables:** `{count}` = transactions imported, `{source}` = account name or file name

**Navigation target:** Import Results screen (`importJobId`)

**Acceptance Criteria:**
- [ ] Notification created on successful import completion
- [ ] Count and source name included in message
- [ ] `relatedId` set to import job ID for navigation
- [ ] Push sent if enabled

---

#### US-921: Import Failed Notification

**As a** user who uploaded a bank statement  
**I want** to be notified if the import fails  
**So that** I can retry or troubleshoot  

**Trigger:** Called by the import pipeline on failure  
**Function:** `notifications.create` (internal mutation)  

**Logic:**
1. When `processImport` fails:
   a. Create notification with `type: "import_failed"`, `relatedId: importJob._id`
   b. Send push if enabled

**Message Template:**

| Title | Body |
|-------|------|
| ❌ Import failed | We couldn't process your {source} statement. Please check the file format and try again. |

**Variables:** `{source}` = account name or file name

**Navigation target:** Import Results screen (`importJobId`)

**Acceptance Criteria:**
- [ ] Notification created on import failure
- [ ] Error context included (file name/source)
- [ ] Push sent if enabled
- [ ] `relatedId` set for navigation to retry screen

---

#### US-922: Sync Error Notification

**As a** user with live-linked bank accounts  
**I want** to be notified when a sync fails  
**So that** I can re-authenticate or troubleshoot the connection  

**Trigger:** Called by `accounts.scheduledSync` when a sync attempt fails  
**Function:** `notifications.create` (internal mutation)  

**Logic:**
1. `accounts.scheduledSync` runs every 6 hours for active live-linked accounts
2. When a sync fails (API error, token expired, rate limit):
   a. Update account `status` to `"error"`, set `errorMessage`
   b. **Deduplication check:** Query for existing `sync_error` notification for this account created in the last 24 hours → skip if exists (avoid flooding)
   c. Create notification with `relatedId: connectedAccount._id`
   d. Send push if enabled

**Message Template:**

| Title | Body |
|-------|------|
| ⚠️ Sync error: {accountName} | We couldn't sync your {provider} account ({accountName}). Tap to reconnect or check your connection. |

**Variables:** `{accountName}`, `{provider}` (e.g. "GTBank", "Paystack")

**Navigation target:** Connected Accounts screen (`accountId`)

**Acceptance Criteria:**
- [ ] Notification created on sync failure
- [ ] Deduplication: max one sync error notification per account per 24 hours
- [ ] Account name and provider included in message
- [ ] Push sent if enabled

---

#### US-923: Recurring Invoice Generated Notification

**As a** user with recurring invoice templates  
**I want** to be notified when a recurring invoice is auto-generated  
**So that** I can review and send it  

**Trigger:** Called by `invoices.generateRecurring` cron  
**Schedule:** Daily at 07:00 WAT (06:00 UTC)  
**Function:** `invoices.generateRecurring` (creates invoice, then calls `notifications.create`)  

**Logic:**
1. Find recurring invoice templates where `isRecurring: true` and `nextIssueDate ≤ today`
2. For each template:
   a. Generate a new invoice (draft status) with incremented invoice number
   b. Update template's `nextIssueDate` to next period
   c. Create notification with `type: "recurring_invoice_generated"`, `relatedId: newInvoice._id`
   d. Send push if enabled

**Message Template:**

| Title | Body |
|-------|------|
| 🔄 Recurring invoice generated | Invoice #{invoiceNumber} for {clientName} ({currency} {amount}) has been auto-generated. Review and send it. |

**Variables:** `{invoiceNumber}`, `{clientName}`, `{currency}`, `{amount}`

**Navigation target:** Invoice Detail screen (`invoiceId`)

**Acceptance Criteria:**
- [ ] Notification created when recurring invoice is generated
- [ ] Invoice details included in message
- [ ] New invoice in `"draft"` status (user must review before sending)
- [ ] `relatedId` set to new invoice ID
- [ ] Push sent if enabled

---

### 3.4 Push Notifications

#### US-924: Push Notification Delivery

**As a** user with push notifications enabled  
**I want** to receive push notifications on my device  
**So that** I'm alerted even when the app isn't open  

**Trigger:** Any `notifications.create` call where user has `pushEnabled: true`  

**Flow:**
1. When `notifications.create` runs:
   a. Check user's `pushEnabled` preference
   b. If enabled, query `pushTokens` for active tokens for this user
   c. For each active token, dispatch push via the appropriate service:
      - **iOS:** APNs via `@parse/node-apn` or Firebase Admin SDK
      - **Android:** FCM via Firebase Admin SDK
      - **Web:** FCM Web Push via Firebase Admin SDK
   d. Push payload includes: `title`, `body`, `data: { notificationType, notificationId, relatedId, entityId }`
   e. If token is invalid/expired (FCM returns `NotRegistered`): mark token `active: false`

**Acceptance Criteria:**
- [ ] Push sent via FCM for Android and web tokens
- [ ] Push sent via APNs for iOS tokens (or FCM if using Firebase for iOS)
- [ ] Push payload includes navigation data for tap handling
- [ ] Invalid tokens automatically deactivated
- [ ] Push delivery is fire-and-forget (failure does not block in-app notification creation)

---

#### US-925: Push Permission Request Flow

**As a** new user enabling push notifications  
**I want** to be prompted for push permission at the right time  
**So that** I can make an informed decision  

**Trigger:** First enable of push toggle in notification settings OR post-onboarding prompt  

**Flow:**
1. **Post-onboarding (recommended):** After completing onboarding Step 4, show a contextual prompt: "Stay on top of deadlines" with illustration, "Enable push notifications to get filing reminders, invoice alerts, and more." with "Enable" (primary) and "Not now" (secondary)
2. If user taps "Enable": trigger OS permission request
3. **iOS:** System dialog appears: "TaxEase Would Like to Send You Notifications"
4. **Android:** System dialog (Android 13+) or auto-granted (Android 12-)
5. If granted: register token via `pushTokens.register`, set `pushEnabled: true`
6. If denied: set `pushEnabled: false`, show "You can enable notifications later in Settings"
7. Token is obtained via `messaging().getToken()` (Firebase Cloud Messaging SDK)

**Acceptance Criteria:**
- [ ] Permission requested at contextually appropriate time (not on first launch)
- [ ] Pre-prompt screen explains value before triggering OS dialog
- [ ] Token registered on grant
- [ ] Graceful handling of deny with path to enable later
- [ ] Android 13+ runtime permission handled
- [ ] Web: `Notification.requestPermission()` called

---

#### US-926: Push When App Is Backgrounded

**As a** user  
**I want** to receive push notifications when the app is in the background or closed  
**So that** I don't miss important alerts  

**Trigger:** Push received while app is backgrounded or terminated  

**Flow:**
1. FCM/APNs delivers push to device
2. OS displays notification in system tray / notification centre
3. Notification shows: app icon, title, body
4. **iOS:** notification appears in lock screen and notification centre
5. **Android:** notification appears in status bar and notification shade
6. **Web:** browser notification if tab is not focused

**Acceptance Criteria:**
- [ ] Push displayed by OS when app is backgrounded
- [ ] Push displayed when app is terminated (killed)
- [ ] Correct app icon shown
- [ ] Title and body match the in-app notification content
- [ ] Sound/vibration per device settings

---

#### US-927: Push Tap Navigation

**As a** user who received a push notification  
**I want** to tap it and go directly to the relevant screen  
**So that** I can take action immediately  

**Trigger:** User taps a push notification from the system tray  

**Flow:**
1. User taps push notification
2. App opens (or foregrounds)
3. Push data payload extracted: `{ notificationType, notificationId, relatedId, entityId }`
4. Notification marked as read via `notifications.markRead`
5. App navigates to the target screen using the same mapping as US-902:

| `notificationType` | Screen | Param |
|---|---|---|
| `deadline_reminder` | Filing | `entityId` |
| `uncategorised_transactions` | Transaction Triage | `entityId` |
| `invoice_overdue` | Invoice Detail | `relatedId` |
| `import_complete` | Import Results | `relatedId` |
| `import_failed` | Import Results | `relatedId` |
| `vat_due` | Filing | `entityId` |
| `sync_error` | Connected Accounts | `relatedId` |
| `recurring_invoice_generated` | Invoice Detail | `relatedId` |

6. If app was terminated, cold-start flow: Splash → Auth check → Navigate to target screen

**Acceptance Criteria:**
- [ ] Push tap opens app and navigates to correct screen
- [ ] Works from backgrounded and terminated states
- [ ] Notification marked as read on tap
- [ ] Auth check on cold start before navigation
- [ ] Graceful fallback to Notifications screen if target is unavailable

---

### 3.5 Notification Lifecycle

#### US-928: Notification Creation (Internal Mutation)

**As a** developer building features that need notifications  
**I want** a single internal mutation to create notifications  
**So that** any domain can emit notifications consistently  

**Function:** `notifications.create` (internal mutation — not callable from client)  

**Interface:**
```typescript
notifications.create({
  userId: Id<"users">,
  type: NotificationType,
  title: string,
  body: string,
  entityId?: Id<"entities">,
  relatedId?: string,
  sendPush?: boolean,  // default: true
})
```

**Logic:**
1. Insert notification document with `read: false`
2. If `sendPush` is true (default):
   a. Check user's `pushEnabled` preference
   b. If enabled, schedule push delivery via internal action `push.send`
3. Return the created notification ID

**Acceptance Criteria:**
- [ ] Internal mutation — not exposed to client
- [ ] Creates notification document with all required fields
- [ ] `read` defaults to `false`, `readAt` defaults to `undefined`
- [ ] Triggers push delivery when `sendPush: true` and user has push enabled
- [ ] Can be called from any Convex mutation, action, or scheduled function

---

#### US-929: Notification Deduplication

**As a** user  
**I want** to not receive duplicate notifications for the same event  
**So that** my notification centre stays clean and useful  

**Logic (applied in each scheduled function):**
1. Before creating a notification, query existing notifications:
   - Same `userId`
   - Same `type`
   - Same `entityId` (if applicable)
   - Created within the deduplication window:
     - Filing deadline / VAT deadline: same calendar day (UTC+1)
     - Uncategorised daily: same calendar day
     - Uncategorised weekly: same calendar week
     - Invoice overdue: same `relatedId` (invoice ID) + same calendar day
     - Sync error: same `relatedId` (account ID) + within 24 hours
     - Import complete/failed: same `relatedId` (import job ID) — lifetime dedup
     - Recurring invoice: same `relatedId` (new invoice ID) — lifetime dedup
2. If a matching notification exists within the window, skip creation

**Acceptance Criteria:**
- [ ] No duplicate deadline reminders on the same day
- [ ] No duplicate VAT reminders on the same day
- [ ] No duplicate uncategorised alerts per daily/weekly cycle
- [ ] No duplicate invoice overdue alerts for the same invoice on the same day
- [ ] No duplicate sync errors for the same account within 24 hours
- [ ] Import and recurring invoice notifications never duplicated for the same job/invoice

---

#### US-930: Notification Expiry and Cleanup

**As a** system administrator  
**I want** old notifications to be cleaned up  
**So that** storage stays manageable and the notification list stays relevant  

**Schedule:** Weekly (Sundays at 02:00 WAT)  
**Function:** `notifications.cleanup`  

**Logic:**
1. Delete read notifications older than 90 days
2. Delete unread notifications older than 180 days
3. Log count of deleted notifications

**Acceptance Criteria:**
- [ ] Read notifications older than 90 days deleted
- [ ] Unread notifications older than 180 days deleted
- [ ] Runs weekly at a low-traffic time
- [ ] Deletion is batched (Convex mutation limits) — process in batches of 100
- [ ] Logged for monitoring

---

## 4. UI Specifications

### 4.1 Design Tokens

| Token | Value | Usage |
|-------|-------|-------|
| primary | `#1A7F5E` | Primary buttons, active states |
| primary-light | `#E8F5F0` | Unread notification card background |
| accent | `#2B6CB0` | Links, secondary actions |
| success | `#38A169` | Import complete, recurring invoice generated icons |
| warning | `#D69E2E` | Deadline approaching, uncategorised alert icons |
| danger | `#E53E3E` | Overdue, errors, urgent deadline icons |
| neutral-900 | `#1A202C` | Notification title text |
| neutral-500 | `#718096` | Read notification text, timestamps |
| neutral-100 | `#F7FAFC` | Page background |
| white | `#FFFFFF` | Read notification card surface |

### 4.2 Notification Centre Layout

```
┌─────────────────────────────────────┐
│  ← Notifications     Mark all read  │  ← Header
├─────────────────────────────────────┤
│  Today                              │  ← Date group label
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │ 🔴  Filing deadline in 7 days   │ │  ← Unread (primary-light bg)
│ │     Your 2025 tax return is     │ │
│ │     due March 31...      2h ago │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ ⚠️  3 uncategorised txns        │ │  ← Unread
│ │     You have 3 uncategorised    │ │
│ │     transactions...      5h ago │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│  Yesterday                          │
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │ ✅  Import complete             │ │  ← Read (white bg)
│ │     42 transactions imported    │ │
│ │     from GTBank...     Yesterday│ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│                                     │
│  (Load more on scroll)              │
└─────────────────────────────────────┘
```

### 4.3 Notification Card Anatomy

```
┌──┬──────────────────────────────────┐
│  │  Title (heading-md, neutral-900) │
│🔔│  Body (body-sm, neutral-500,     │
│  │  max 2 lines)         Timestamp  │
└──┴──────────────────────────────────┘
```

- **Left icon:** 32×32 circle, colour-coded by notification type severity
- **Title:** heading-md (18px SemiBold), neutral-900
- **Body:** body-sm (13px Regular), neutral-500, truncated to 2 lines with ellipsis
- **Timestamp:** body-sm, neutral-500, right-aligned
- **Unread indicator:** primary-light background + 3px left border in type colour
- **Card spacing:** 8px vertical gap between cards
- **Card padding:** 16px all sides

### 4.4 Notification Icon Colour Map

| Notification Type | Icon | Colour |
|---|---|---|
| `deadline_reminder` | Calendar | warning (`#D69E2E`) |
| `uncategorised_transactions` | Tag/Label | warning (`#D69E2E`) |
| `invoice_overdue` | Invoice/Dollar | danger (`#E53E3E`) |
| `import_complete` | Checkmark | success (`#38A169`) |
| `import_failed` | X-circle | danger (`#E53E3E`) |
| `vat_due` | Calendar | warning (`#D69E2E`) |
| `sync_error` | Alert-triangle | danger (`#E53E3E`) |
| `recurring_invoice_generated` | Refresh | success (`#38A169`) |

### 4.5 Notification Settings Layout

```
┌─────────────────────────────────────┐
│  ← Notification Settings      Save │
├─────────────────────────────────────┤
│                                     │
│  FILING & TAX DEADLINES            │  ← Section header (label style)
│ ┌─────────────────────────────────┐ │
│ │ Filing deadline reminders   [•] │ │  ← Toggle
│ │ ┌──┐ ┌──┐ ┌──┐ ┌──┐           │ │
│ │ │30│ │14│ │ 7│ │ 1│  days     │ │  ← Multi-select chips
│ │ └──┘ └──┘ └──┘ └──┘           │ │
│ ├─────────────────────────────────┤ │
│ │ VAT return reminders        [•] │ │
│ │ Before 21st of each month       │ │  ← Helper text
│ └─────────────────────────────────┘ │
│                                     │
│  TRANSACTIONS                       │
│ ┌─────────────────────────────────┐ │
│ │ Uncategorised alerts        [•] │ │
│ │ ┌───────┐ ┌────────┐           │ │
│ │ │ Daily │ │ Weekly │           │ │  ← Segmented control
│ │ └───────┘ └────────┘           │ │
│ └─────────────────────────────────┘ │
│                                     │
│  INVOICING                          │
│ ┌─────────────────────────────────┐ │
│ │ Invoice overdue alerts      [•] │ │
│ │ ○ 1 day  ○ 3 days  ○ 7 days   │ │  ← Radio/single-select
│ └─────────────────────────────────┘ │
│                                     │
│  PUSH NOTIFICATIONS                 │
│ ┌─────────────────────────────────┐ │
│ │ Push notifications          [•] │ │
│ │ Status: Enabled ✓               │ │
│ │ (or: Disabled — Enable in       │ │
│ │  Settings →)                    │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

### 4.6 Notification Bell Badge

```
     ┌───┐
     │ 🔔│←── Bell icon (24×24)
     │  ●│←── Red badge (12×12 circle, danger red)
     └───┘    Text: unread count, white, 10px bold
              Position: top-right overlap
              Hidden when count = 0
              Shows "99+" when count > 99
```

### 4.7 Platform Behaviour

| Behaviour | Mobile (iOS/Android) | Web |
|-----------|---------------------|-----|
| Notification centre | Full-screen push from right | Side panel or full page |
| Swipe-to-read | Left swipe on card | Hover → icon button |
| Pull-to-refresh | Supported | Not applicable (Convex reactivity) |
| Push delivery | FCM (Android) / APNs (iOS) | FCM Web Push |
| Permission flow | OS dialog + pre-prompt | Browser dialog |
| Deep link from push | Opens app + navigates | Focuses tab + navigates |
| Settings deep link | `Linking.openSettings()` | Instructional text |

---

## 5. Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-901 | App shall display a notification bell icon with unread badge on all authenticated screens | P0 |
| FR-902 | App shall display a notification centre screen with chronological, date-grouped notification list | P0 |
| FR-903 | App shall support marking individual notifications as read | P0 |
| FR-904 | App shall support marking all notifications as read | P0 |
| FR-905 | Tapping a notification shall navigate to the related screen and mark it as read | P0 |
| FR-906 | Notification centre shall show empty state when no notifications exist | P0 |
| FR-907 | Notification centre shall show skeleton loading state while data loads | P1 |
| FR-908 | App shall provide a notification settings screen with all preference controls | P0 |
| FR-909 | Filing deadline reminders shall run daily at 08:00 WAT and respect `deadlineReminderDays` | P0 |
| FR-910 | VAT return reminders shall run daily at 08:00 WAT for VAT-registered entities | P0 |
| FR-911 | Uncategorised transaction alerts shall run daily at 10:00 WAT for daily-preference users | P0 |
| FR-912 | Uncategorised transaction alerts shall run Mondays at 10:00 WAT for weekly-preference users | P0 |
| FR-913 | Invoice overdue check shall run daily at 09:00 WAT, update status, and create notifications | P0 |
| FR-914 | Recurring invoice generation shall run daily at 07:00 WAT and create notifications | P1 |
| FR-915 | Bank account sync shall run every 6 hours and create sync error notifications on failure | P1 |
| FR-916 | Import complete and import failed notifications shall be created by the import pipeline | P0 |
| FR-917 | All scheduled functions shall deduplicate notifications per the rules in US-929 | P0 |
| FR-918 | `notifications.create` shall be an internal mutation callable from any server-side function | P0 |
| FR-919 | App shall support push notifications via FCM (Android/Web) and APNs (iOS) | P1 |
| FR-920 | Push permission request shall include a pre-prompt explaining value | P1 |
| FR-921 | Push tap shall open the app and navigate to the relevant screen | P1 |
| FR-922 | Invalid push tokens shall be automatically deactivated | P1 |
| FR-923 | Notification cleanup shall run weekly, deleting read notifications older than 90 days and unread older than 180 days | P2 |
| FR-924 | Notification messages shall include penalty amounts for deadline-related notifications | P0 |
| FR-925 | Push notification settings shall include a deep link to device settings when permission is denied | P1 |
| FR-926 | Web push notifications shall be supported via FCM | P2 |

---

## 6. API Requirements (Convex Functions)

### 6.1 Notifications (`convex/notifications/`)

| Function | Type | Description |
|----------|------|-------------|
| `notifications.list` | Query | All notifications for current user, ordered by `_creationTime` desc. Accepts optional `limit` (default 50) and `cursor` for pagination. Returns `Notification[]`. |
| `notifications.getUnreadCount` | Query | Count of unread notifications for current user. Returns `{ count: number }`. |
| `notifications.markRead` | Mutation | Set `read: true` and `readAt: Date.now()` for a single notification by ID. Validates ownership. |
| `notifications.markAllRead` | Mutation | Set `read: true` and `readAt: Date.now()` for all unread notifications belonging to the current user. |
| `notifications.create` | Internal Mutation | Create notification document. Accepts `{ userId, type, title, body, entityId?, relatedId?, sendPush? }`. Called from scheduled functions and actions — **not exposed to client**. If `sendPush` is true and user has `pushEnabled`, schedules `push.send` action. |
| `notifications.cleanup` | Internal Mutation | Delete notifications older than retention thresholds. Called by weekly cron. Processes in batches of 100. |

#### `notifications.list` — Detailed Specification

```typescript
// Args
{
  limit?: number;    // Default 50, max 100
  cursor?: string;   // Pagination cursor (notification _id)
}

// Returns
{
  notifications: Notification[];
  nextCursor?: string;  // Undefined if no more results
}
```

#### `notifications.create` — Detailed Specification

```typescript
// Args (internal — validated server-side)
{
  userId: Id<"users">;
  type: NotificationType;
  title: string;
  body: string;
  entityId?: Id<"entities">;
  relatedId?: string;
  sendPush?: boolean;  // Default true
}

// Side effects:
// 1. Inserts notification document
// 2. If sendPush && user.pushEnabled: schedules push.send action
// Returns: Id<"notifications">
```

### 6.2 Push Tokens (`convex/pushTokens/`)

| Function | Type | Description |
|----------|------|-------------|
| `pushTokens.register` | Mutation | Register or update a push token for the current user. Accepts `{ token, platform }`. Upserts by token string. |
| `pushTokens.deactivate` | Internal Mutation | Mark a token as `active: false`. Called when FCM/APNs returns an invalid token error. |
| `pushTokens.getActiveTokens` | Internal Query | Get all active tokens for a given userId. |

#### `pushTokens.register` — Detailed Specification

```typescript
// Args
{
  token: string;
  platform: "ios" | "android" | "web";
}

// Logic:
// 1. Query for existing token with same string
// 2. If exists: update userId, platform, active: true, lastUsedAt: now
// 3. If not exists: insert new document
// This handles device transfers and token refreshes.
```

### 6.3 Push Delivery (`convex/push/`)

| Function | Type | Description |
|----------|------|-------------|
| `push.send` | Internal Action | Send push notification to a user. Queries active tokens, dispatches via FCM/APNs. Handles token invalidation. |

#### `push.send` — Detailed Specification

```typescript
// Args (internal)
{
  userId: Id<"users">;
  notificationId: Id<"notifications">;
  title: string;
  body: string;
  data: {
    notificationType: NotificationType;
    notificationId: string;
    relatedId?: string;
    entityId?: string;
  };
}

// Logic:
// 1. Query pushTokens.getActiveTokens for userId
// 2. For each token:
//    a. Send via Firebase Admin SDK (handles both FCM and APNs via FCM)
//    b. On success: update token.lastUsedAt
//    c. On InvalidRegistration / NotRegistered: call pushTokens.deactivate
//    d. On other error: log and continue (don't retry for v1)
// 3. Fire-and-forget: push failure does not affect in-app notification
```

### 6.4 Scheduled Functions (Crons) (`convex/crons.ts`)

```typescript
import { cronJobs } from "convex/server";

const crons = cronJobs();

// Filing deadline check — daily at 08:00 WAT (07:00 UTC)
crons.daily(
  "check filing deadline",
  { hourUTC: 7, minuteUTC: 0 },
  "reminders:checkFilingDeadline"
);

// VAT deadline check — daily at 08:00 WAT (07:00 UTC)
crons.daily(
  "check vat deadline",
  { hourUTC: 7, minuteUTC: 0 },
  "reminders:checkVatDeadline"
);

// Invoice overdue check — daily at 09:00 WAT (08:00 UTC)
crons.daily(
  "check overdue invoices",
  { hourUTC: 8, minuteUTC: 0 },
  "invoices:checkOverdue"
);

// Recurring invoice generation — daily at 07:00 WAT (06:00 UTC)
crons.daily(
  "generate recurring invoices",
  { hourUTC: 6, minuteUTC: 0 },
  "invoices:generateRecurring"
);

// Uncategorised alert (daily) — daily at 10:00 WAT (09:00 UTC)
crons.daily(
  "uncategorised alert daily",
  { hourUTC: 9, minuteUTC: 0 },
  "reminders:uncategorisedAlert"
);

// Uncategorised alert (weekly) — Mondays at 10:00 WAT (09:00 UTC)
crons.weekly(
  "uncategorised alert weekly",
  { dayOfWeek: "monday", hourUTC: 9, minuteUTC: 0 },
  "reminders:uncategorisedAlertWeekly"
);

// Bank account sync — every 6 hours
crons.interval(
  "scheduled bank sync",
  { hours: 6 },
  "accounts:scheduledSync"
);

// Notification cleanup — Sundays at 02:00 WAT (01:00 UTC)
crons.weekly(
  "notification cleanup",
  { dayOfWeek: "sunday", hourUTC: 1, minuteUTC: 0 },
  "notifications:cleanup"
);

export default crons;
```

### 6.5 Reminders (`convex/reminders/`)

| Function | Type | Description |
|----------|------|-------------|
| `reminders.checkFilingDeadline` | Internal Mutation | Check all users for upcoming filing deadlines per their preferences. Create notifications and trigger push. |
| `reminders.checkVatDeadline` | Internal Mutation | Check VAT-registered entities for upcoming 21st-of-month deadline. Create notifications and trigger push. |
| `reminders.uncategorisedAlert` | Internal Mutation | Check daily-preference users for uncategorised transactions. Create notifications if count > 0. |
| `reminders.uncategorisedAlertWeekly` | Internal Mutation | Same as above for weekly-preference users. |

#### `reminders.checkFilingDeadline` — Pseudo-code

```typescript
async function checkFilingDeadline(ctx: MutationCtx) {
  const today = startOfDay(new Date(), "Africa/Lagos");
  const currentYear = today.getFullYear();
  // Filing deadline: March 31 of current year (for previous tax year)
  const filingDeadline = new Date(currentYear, 2, 31); // Month is 0-indexed
  
  // If we're past March 31, the next deadline is next year
  if (today > filingDeadline) return;
  
  const daysUntil = differenceInDays(filingDeadline, today);
  
  // Get all user preferences
  const allPrefs = await ctx.db.query("userPreferences").collect();
  
  for (const prefs of allPrefs) {
    if (!prefs.deadlineReminderDays.includes(daysUntil)) continue;
    
    // Deduplication: check for existing notification today
    const existing = await ctx.db
      .query("notifications")
      .withIndex("by_userId_read", q => q.eq("userId", prefs.userId))
      .filter(q => 
        q.and(
          q.eq(q.field("type"), "deadline_reminder"),
          q.gte(q.field("_creationTime"), startOfDayMs(today))
        )
      )
      .first();
    
    if (existing) continue;
    
    // Get user's entities
    const entities = await ctx.db
      .query("entities")
      .withIndex("by_userId", q => q.eq("userId", prefs.userId))
      .collect();
    
    const taxYear = currentYear - 1;
    const template = getDeadlineTemplate(daysUntil, taxYear);
    
    for (const entity of entities) {
      await notifications.create(ctx, {
        userId: prefs.userId,
        type: "deadline_reminder",
        title: template.title,
        body: template.body,
        entityId: entity._id,
      });
    }
  }
}
```

### 6.6 User Preferences Extensions (`convex/users/`)

The following functions from PRD-0 are extended:

| Function | Type | Changes for PRD-9 |
|----------|------|-------------------|
| `users.getPreferences` | Query | No changes — already returns full `userPreferences` |
| `users.updatePreferences` | Mutation | No changes — already accepts all preference fields |

---

## 7. Data Models

### 7.1 Tables

| Table | Purpose | New in PRD-9? |
|-------|---------|---------------|
| `notifications` | In-app notification records | Yes (schema defined in PRD-0 spec, implemented here) |
| `pushTokens` | Device push tokens for FCM/APNs | Yes |
| `userPreferences` | Notification preferences | No (PRD-0) — consumed by scheduled functions |

### 7.2 `notifications` Table Schema

```typescript
notifications: defineTable({
  userId: v.id("users"),
  type: v.union(
    v.literal("deadline_reminder"),
    v.literal("uncategorised_transactions"),
    v.literal("invoice_overdue"),
    v.literal("import_complete"),
    v.literal("import_failed"),
    v.literal("vat_due"),
    v.literal("sync_error"),
    v.literal("recurring_invoice_generated")
  ),
  title: v.string(),
  body: v.string(),
  entityId: v.optional(v.id("entities")),
  relatedId: v.optional(v.string()),
  read: v.boolean(),
  readAt: v.optional(v.number()),
})
  .index("by_userId_read", ["userId", "read"])
  .index("by_userId_creationTime", ["userId", "_creationTime"])
```

### 7.3 `pushTokens` Table Schema

```typescript
pushTokens: defineTable({
  userId: v.id("users"),
  token: v.string(),
  platform: v.union(
    v.literal("ios"),
    v.literal("android"),
    v.literal("web")
  ),
  active: v.boolean(),
  lastUsedAt: v.optional(v.number()),
})
  .index("by_userId_active", ["userId", "active"])
  .index("by_token", ["token"])
```

### 7.4 Indexes

| Table | Index | Fields | Purpose |
|-------|-------|--------|---------|
| `notifications` | `by_userId_read` | `[userId, read]` | Fetch unread notifications for badge count |
| `notifications` | `by_userId_creationTime` | `[userId, _creationTime]` | Notification list ordered by recency |
| `pushTokens` | `by_userId_active` | `[userId, active]` | Fetch active tokens for push delivery |
| `pushTokens` | `by_token` | `[token]` | Upsert on token registration |

### 7.5 Default Preferences (created during onboarding — PRD-0)

```typescript
const DEFAULT_NOTIFICATION_PREFERENCES = {
  deadlineReminderDays: [30, 14, 7, 1],
  vatReminderEnabled: true,
  uncategorisedAlertFrequency: "weekly" as const,
  invoiceOverdueDays: 1,
  pushEnabled: false, // Enabled after explicit user consent
};
```

---

## 8. Non-Goals

The following are **explicitly out of scope** for PRD-9:

1. **SMS notifications:** Push and in-app only; no SMS gateway integration
2. **Email notification delivery:** Transactional emails (e.g. weekly digest) are a future enhancement
3. **Notification grouping/threading:** Notifications are flat; no conversation-style threading
4. **Rich media in push:** No images, buttons, or interactive elements in push notifications (v1)
5. **Custom notification schedules:** Users cannot set custom times for reminders (e.g. "remind me at 6 PM")
6. **Notification snooze:** No "remind me later" functionality
7. **Analytics dashboard:** No admin view of notification delivery rates
8. **User-to-user notifications:** TaxEase is single-user; no collaborative notifications
9. **Notification channels (Android):** All notifications use a single default channel in v1
10. **Sounds & vibration customisation:** Default OS notification settings apply
11. **In-app banners/toast for new notifications:** Real-time badge update only; no overlay notification while using the app

---

## 9. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Notification opt-in rate** | ≥ 60% of users keep at least one notification type enabled | `userPreferences` query |
| **Push permission grant rate** | ≥ 50% of users grant push permission when prompted | Permission grant events vs. prompts shown |
| **Notification open rate** | ≥ 30% of notifications are tapped/read within 24 hours | `read: true` + `readAt` within 24h of `_creationTime` |
| **Deadline reminder effectiveness** | ≥ 80% of users who receive deadline reminders file before March 31 | Filing records created before deadline for users with active reminders |
| **Uncategorised alert response** | ≥ 40% of users categorise transactions within 48h of alert | Transaction type changes within 48h of notification creation |
| **Invoice overdue follow-up** | ≥ 50% of overdue invoice notifications lead to invoice status change within 7 days | Invoice status change after overdue notification |
| **Push delivery rate** | ≥ 95% of push notifications delivered successfully | FCM/APNs delivery receipts vs. send attempts |
| **Notification creation latency** | < 100ms for in-app notification creation | Convex mutation timing |
| **Cron execution success rate** | 100% of scheduled runs complete without unhandled errors | Convex cron logs |
| **Badge accuracy** | Unread badge count matches actual unread count at all times | Automated tests on `getUnreadCount` query |

---

## 10. Open Questions

1. **Firebase project setup:** Has the Firebase project been created with FCM enabled for Android, iOS, and Web? Service account key needed for Firebase Admin SDK in Convex actions.

2. **APNs via FCM:** Should iOS push use APNs directly (requires `.p8` key from Apple Developer account) or route through FCM (simplifies to single push provider)? Recommended: FCM for all platforms.

3. **Push notification sound:** Use default OS notification sound or custom TaxEase sound? Recommended: default for v1.

4. **WAT timezone handling:** Convex crons use UTC. Nigeria (WAT) is UTC+1. Should cron times adjust for daylight saving? Nigeria does not observe DST, so UTC+1 offset is constant — no adjustment needed.

5. **Batch size for scheduled functions:** When checking all users in `checkFilingDeadline`, what's the expected user count? For >10K users, the mutation may need to be refactored into a paginated action that schedules individual mutations per user batch.

6. **Notification retention policy:** Are 90 days (read) and 180 days (unread) the right retention windows? Should users be able to "pin" important notifications to prevent cleanup?

7. **Pre-prompt timing:** Should the push notification pre-prompt appear immediately after onboarding or after the user has used the app for a few sessions? Recommended: after onboarding, but consider "second session" prompt for higher conversion.

8. **Web push support:** What is the priority of web push vs. mobile push? Web push requires a service worker and VAPID keys. Can be deferred to v1.1 if needed.

9. **Invoice overdue: update in same cron or separate concern?** The `invoices.checkOverdue` cron both updates invoice status AND creates notifications. Should the status update be a separate cron to keep concerns separated? Current design keeps them together for simplicity.

10. **Notification content localisation:** All notification templates are in English. Should Pidgin English or Yoruba/Hausa/Igbo be supported in v2? Recommended: English only for v1.

11. **Rate limiting:** Should there be a global cap on notifications per user per day (e.g. max 20)? This prevents notification fatigue if multiple scheduled functions fire on the same day with many entities/invoices.

12. **Firebase Admin SDK in Convex:** Convex actions can run Node.js. Confirm that `firebase-admin` can be installed and initialised with a service account within a Convex action's execution environment.

---

*End of PRD-9 — Notifications & Reminders*
