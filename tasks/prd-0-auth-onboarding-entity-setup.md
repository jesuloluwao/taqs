# PRD-0: Foundation — Auth, Onboarding & Entity Setup

**TaxEase Nigeria**  
**Version:** 1.0 — February 2026  
**Status:** Draft  
**Priority:** P0 — Build First  
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

PRD-0 establishes the foundational layer for TaxEase Nigeria — the skeleton on which all downstream features depend. Without authenticated users, configured entities, seeded categories, and user preferences, no other PRD can function. This PRD delivers the complete auth flow, onboarding wizard, empty app shell with side drawer navigation, profile management, entity management, and preferences.

### 1.2 Scope

| In Scope | Out of Scope |
|----------|--------------|
| Splash screen | Transaction import logic (PRD-1) |
| Welcome screen | AI categorisation (PRD-2) |
| Sign Up (email + Google) | Tax calculation (PRD-3) |
| Log In (email + Google) | Invoice creation (PRD-4) |
| Password reset | Dashboard data cards (PRD-5) |
| Onboarding (4 steps) | Filing module (PRD-6) |
| Empty Dashboard shell | Bank linking OAuth (PRD-8) |
| Side Drawer navigation | Push notification delivery (PRD-9) |
| Profile view/edit | |
| Entity management (CRUD, switch, delete) | |
| Connected Accounts screen shell (Settings → Connected Accounts; list, add, disconnect content in PRD-1/PRD-8) | |
| User preferences | |
| Categories seed data | |
| Logout & delete account | |

### 1.3 Out-of-Box Experience

Upon completion of PRD-0, a user can:

1. **Discover:** See Splash → Welcome with value proposition
2. **Register:** Sign up with email+password or Google
3. **Authenticate:** Log in, reset password if needed, use biometric (mobile) if enabled
4. **Onboard:** Complete 4-step wizard (user type → info → NIN/TIN → connect accounts)
5. **Navigate:** Use side drawer to access Dashboard (empty), Settings, and other placeholder screens
6. **Manage:** View/edit profile, create/edit/switch entities, manage preferences
7. **Exit:** Log out or delete account

### 1.4 Dependencies

- **Depends on:** Nothing — this is the root PRD
- **Blocks:** All other PRDs (PRD-1 through PRD-9)

---

## 2. Entities (TypeScript Interfaces)

### 2.1 User & Auth

```typescript
/** Application user profile (synced from Clerk via webhook) */
interface User {
  _id: Id<"users">;
  _creationTime: number;
  clerkUserId: string;                   // Clerk user ID (from identity.subject)
  fullName: string;
  email: string;
  phone?: string;
  nin?: string;                         // NIN (encrypted at rest)
  firsTin?: string;                     // FIRS TIN if separately registered
  userType: "freelancer" | "sme";      // From onboarding Step 1
  profession?: string;                  // Freelancer profession or SME industry
  preferredCurrency: "NGN" | "USD" | "GBP" | "EUR";
  onboardingComplete: boolean;
  avatarStorageId?: string;
}

/** Auth session — managed by Clerk; JWTs verified by Convex via Clerk JWKS */
// No local session table needed; Clerk manages sessions externally.
```

### 2.2 Entity

```typescript
/** Tax entity: unit for which a tax return is filed */
interface Entity {
  _id: Id<"entities">;
  _creationTime: number;
  userId: Id<"users">;
  name: string;                         // Personal name or business name
  type: "individual" | "business_name" | "llc";
  tin?: string;                         // Entity-specific TIN
  rcNumber?: string;                    // CAC Registration Number (businesses)
  vatRegistered: boolean;
  vatThresholdExceeded: boolean;
  isDefault: boolean;                   // Default entity on login
  taxYearStart: number;                 // Month (1 = January; Nigeria = 1)
}
```

### 2.3 Categories (Seed)

```typescript
/** Transaction category (system-seeded + user-created) */
interface Category {
  _id: Id<"categories">;
  _creationTime: number;
  name: string;
  type: "income" | "business_expense" | "personal_expense" | "transfer";
  isDeductibleDefault: boolean;
  ntaReference?: string;                // NTA 2025 section reference
  isSystem: boolean;                    // true for built-in, false for user-created
  userId?: Id<"users">;                 // Set only for user-created
  icon?: string;
  color?: string;
}
```

### 2.4 User Preferences

```typescript
/** Per-user notification and display preferences */
interface UserPreferences {
  _id: Id<"userPreferences">;
  _creationTime: number;
  userId: Id<"users">;                  // Unique
  deadlineReminderDays: number[];       // e.g. [30, 14, 7, 1]
  vatReminderEnabled: boolean;
  uncategorisedAlertFrequency: "daily" | "weekly" | "off";
  invoiceOverdueDays: number;          // Days after due to alert
  pushEnabled: boolean;
}
```

### 2.5 Connected Account (Onboarding Step 4)

```typescript
/** Bank / fintech / statement source (created during onboarding or later) */
interface ConnectedAccount {
  _id: Id<"connectedAccounts">;
  _creationTime: number;
  entityId: Id<"entities">;
  userId: Id<"users">;
  provider: "gtbank" | "zenith" | "access" | "paystack" | "flutterwave" | 
            "moniepoint" | "opay" | "payoneer" | "wise" | "manual" | "statement_upload";
  providerAccountId?: string;
  accountName: string;
  currency: string;                     // ISO 4217
  accessToken?: string;                  // Encrypted for live-linked
  refreshToken?: string;
  tokenExpiresAt?: number;
  lastSyncedAt?: number;
  status: "active" | "error" | "disconnected";
  errorMessage?: string;
}
```

---

## 3. User Stories

### US-001: Splash Screen

**As a** first-time or returning user  
**I want** to see the TaxEase logo and branding while the app initialises  
**So that** I have a professional loading experience and know the app is starting  

**Trigger:** App launch  

**Flow:**
1. App shows full-screen splash with TaxEase logo on primary green background
2. Subtle fade-in animation plays
3. App checks Clerk auth state (existing session?)
4. If authenticated & onboarding complete → navigate to Dashboard
5. If authenticated & onboarding incomplete → navigate to Onboarding Step 1
6. If unauthenticated → navigate to Welcome

**Acceptance Criteria:**
- [ ] Splash displays for at least 1 second (or until Clerk auth check completes, whichever is longer)
- [ ] Logo and primary green (`#1A7F5E`) are visible
- [ ] Transition to Welcome or Dashboard is smooth (no flash)
- [ ] Deep link / cold start correctly routes based on Clerk auth + onboarding state

---

### US-002: Welcome Screen — First Impression

**As a** first-time visitor  
**I want** to see a compelling value proposition with clear CTAs  
**So that** I understand what TaxEase does and can quickly sign up or log in  

**Trigger:** Navigation from Splash when unauthenticated  

**Flow:**
1. User sees full-screen illustrated hero
2. Headline: *"Tax compliance, made simple for Nigerians"*
3. Subline: *"Track income, file returns, and stay penalty-free — all in one place."*
4. Primary button "Get Started" → Sign Up
5. Secondary link "I already have an account" → Log In

**Acceptance Criteria:**
- [ ] Illustration of person with device and Nigerian tax symbols
- [ ] Design tokens from Frontend Spec §2 (primary, typography)
- [ ] "Get Started" navigates to Sign Up
- [ ] "I already have an account" navigates to Log In

---

### US-003: Sign Up — Email & Password

**As a** new user  
**I want** to create an account with my email and password  
**So that** I can access TaxEase and complete onboarding  

**Trigger:** Tap "Get Started" on Welcome, then select email sign-up (or direct from Welcome if single flow)  

**Flow:**
1. User sees sign-up form with: Full name, Email, Password, Confirm password
2. Password field has show/hide toggle
3. Footer: "By signing up, you agree to our Terms and Privacy Policy" (linked)
4. User submits "Create Account"
5. System validates: email format, password strength, passwords match
6. On success: Clerk creates user + issues session JWT; Clerk webhook creates `users` document in Convex; navigate to Onboarding Step 1
7. On failure: show inline validation errors

**Acceptance Criteria:**
- [ ] All fields validated client-side before submit
- [ ] Password min 8 chars, at least one letter and one number (or as per Clerk password policy)
- [ ] Terms/Privacy links open in-app browser or external
- [ ] Successful sign-up creates Clerk user; webhook creates `users` document in Convex
- [ ] Clerk session token managed by Clerk SDK (SecureStore on mobile / cookie on web)
- [ ] User proceeds to Onboarding Step 1
- [ ] Duplicate email shows "Account already exists. Log in instead." with link to Log In

---

### US-004: Sign Up — Google OAuth (via Clerk)

**As a** new user  
**I want** to sign up with my Google account  
**So that** I can create an account quickly without a password  

**Trigger:** Tap "Sign up with Google" on Sign Up screen  

**Flow:**
1. User taps "Sign up with Google"
2. Clerk opens Google OAuth flow (in-app browser / WebView)
3. User authenticates with Google, grants consent
4. Clerk receives OAuth callback, creates/links user
5. Clerk issues session JWT
6. If new user: Clerk webhook creates `users` document with name/email from Google; navigate to Onboarding Step 1
7. If existing user: log in, navigate based on onboarding state

**Acceptance Criteria:**
- [ ] Google OAuth provider configured in Clerk dashboard
- [ ] New Google users get `users` document and enter onboarding
- [ ] Existing Google users skip to Dashboard (if onboarding complete) or Onboarding
- [ ] Google avatar URL can be used for profile photo (optional enhancement)
- [ ] Error states handled (cancel, network failure)

---

### US-005: Log In — Email & Password

**As a** returning user  
**I want** to log in with my email and password  
**So that** I can access my TaxEase account  

**Trigger:** Tap "I already have an account" on Welcome or from Sign Up  

**Flow:**
1. User sees form: Email, Password
2. Password has show/hide toggle
3. "Forgot password?" link below form
4. Optional: "Log in with Google" button
5. Optional: Biometric login button if previously enabled
6. User submits "Log In"
7. System authenticates; on success: store session, navigate to Dashboard (if onboarding complete) or Onboarding
8. On failure: show "Invalid email or password"

**Acceptance Criteria:**
- [ ] Valid credentials grant session and navigate correctly
- [ ] Invalid credentials show generic error (no "email not found" vs "wrong password" distinction)
- [ ] Session persists across app restarts
- [ ] "Forgot password?" navigates to password reset flow

---

### US-006: Log In — Google OAuth (via Clerk)

**As a** returning user who signed up with Google  
**I want** to log in with Google  
**So that** I can access my account without a password  

**Trigger:** Tap "Log in with Google" on Log In screen  

**Flow:**
1. User taps "Log in with Google"
2. Clerk opens Google OAuth flow
3. User authenticates
4. Clerk resolves user; issues session JWT
5. Navigate to Dashboard (if onboarding complete) or Onboarding

**Acceptance Criteria:**
- [ ] Same flow as Sign Up Google but for existing users
- [ ] Session created and user lands on correct screen
- [ ] If Google email already linked to password account, unify or show clear message (product decision)

---

### US-007: Password Reset

**As a** user who forgot my password  
**I want** to reset it via email  
**So that** I can regain access to my account  

**Trigger:** Tap "Forgot password?" on Log In screen  

**Flow:**
1. User taps "Forgot password?"
2. User enters email
3. System sends password-reset email (via Resend) with secure link
4. User clicks link (opens app or web)
5. User sets new password
6. Password updated; user can log in

**Acceptance Criteria:**
- [ ] Reset email sent within 1 minute
- [ ] Reset link expires (e.g. 1 hour)
- [ ] Unknown email does not reveal existence ("If an account exists, we've sent reset instructions")
- [ ] New password meets same strength rules as sign-up
- [ ] Success: "Password reset. You can now log in." with link to Log In

---

### US-008: Onboarding Step 1 — User Type

**As a** new user who just signed up  
**I want** to select whether I'm a Freelancer or SME  
**So that** the app tailors my experience and tax logic  

**Trigger:** Entry to onboarding after sign-up  

**Flow:**
1. User sees "Step 1 of 4" indicator and progress bar
2. Two large selectable cards: Freelancer | SME
3. User selects one; card highlights; "Continue" enables
4. User taps "Continue" → Onboarding Step 2
5. "Back" is disabled on Step 1 (or returns to Welcome?)

**Acceptance Criteria:**
- [ ] Step indicator and progress bar visible
- [ ] Freelancer card: "I earn income from clients, gigs, or self-employment"
- [ ] SME card: "I operate a registered business or company"
- [ ] Selection persisted (userType in `users`)
- [ ] Continue navigates to Step 2 with selection passed

---

### US-009: Onboarding Step 2 — Personal / Business Info

**As a** new user  
**I want** to enter my personal or business details  
**So that** the app has the information needed for my profile and tax entity  

**Trigger:** Completion of Onboarding Step 1  

**Flow:**
1. **Freelancer:** First name, Last name (pre-filled from sign-up), Primary profession (dropdown), Primary income currency (NGN/USD/GBP/EUR)
2. **SME:** Business name, Business type (Registered Business Name / LLC), Industry (dropdown), Annual turnover range (under ₦25m / ₦25m–₦50m / ₦50m–₦100m / above ₦100m)
3. User fills form, taps "Continue"
4. Data saved to `users` and used to create first `entities` document
5. Navigate to Step 3

**Acceptance Criteria:**
- [ ] Freelancer fields match Frontend Spec §5.5
- [ ] SME fields match Frontend Spec §5.5
- [ ] Profession/Industry dropdowns populated
- [ ] First entity created: for Freelancer = individual with user's name; for SME = business_name/llc with business name
- [ ] Entity marked `isDefault: true`

---

### US-010: Onboarding Step 3 — NIN / TIN

**As a** new user  
**I want** to enter my NIN (and optionally TIN)  
**So that** the app can pre-fill my self-assessment form under NTA 2025  

**Trigger:** Completion of Onboarding Step 2  

**Flow:**
1. Explanatory text: *"Under the NTA 2025, your National Identification Number (NIN) is your Tax ID. We need this to pre-fill your self-assessment form."*
2. NIN input (11 digits)
3. Optional: FIRS TIN field
4. Info callout: "Your NIN is stored securely and never shared without your consent."
5. User taps "Verify & Continue"
6. System validates NIN format (11 digits); if API available, optional verification
7. NIN encrypted and stored in `users.nin`
8. Navigate to Step 4

**Acceptance Criteria:**
- [ ] NIN validated: exactly 11 numeric digits
- [ ] NIN encrypted at rest (AES-256-GCM)
- [ ] TIN optional; stored in `users.firsTin` if provided
- [ ] Info callout visible
- [ ] Invalid NIN shows inline error
- [ ] "Verify & Continue" proceeds to Step 4 on success

---

### US-011: Onboarding Step 4 — Connect Accounts

**As a** new user  
**I want** to optionally connect bank/fintech or skip  
**So that** I can import transactions now or later from the Dashboard  

**Trigger:** Completion of Onboarding Step 3  

**Flow:**
1. List of import options as tappable cards:
   - Upload bank statement (PDF/CSV)
   - Connect bank account (Open Banking)
   - Connect Paystack / Flutterwave
   - Connect Payoneer / Wise
   - "I'll do this later"
2. User may select and begin setup (actual connection deferred to PRD-1/PRD-8)
3. For PRD-0: "I'll do this later" or placeholder flows only
4. User taps "Finish Setup"
5. `users.onboardingComplete = true` via mutation
6. Navigate to Dashboard with success toast: *"You're all set! Add transactions when you're ready."*
7. First entity exists; Dashboard shows empty state

**Acceptance Criteria:**
- [ ] All options displayed as cards per Frontend Spec §5.5
- [ ] "I'll do this later" always available; enables "Finish Setup"
- [ ] Selecting "Upload bank statement" can navigate to placeholder (actual import in PRD-1)
- [ ] `onboardingComplete` set to true
- [ ] User lands on Dashboard with empty state
- [ ] Success toast displayed
- [ ] Entity selector in drawer shows the single (default) entity

---

### US-012: Empty Dashboard

**As a** user who completed onboarding  
**I want** to see the Dashboard shell with empty states  
**So that** I know where I am and what to do next  

**Trigger:** First landing after onboarding or navigation via side drawer  

**Flow:**
1. User sees Dashboard layout with header (title "Dashboard", hamburger, notification bell)
2. Tax Position Summary card: "2026 Tax Year", "No transactions yet" or placeholder values
3. Quick Stats row: zeros or placeholders
4. Empty state for Recent Transactions: illustration + "No transactions yet. Import a bank statement to get started." + "Import Now" CTA (navigates to placeholder or PRD-1 screen)
5. No Uncategorised banner (no transactions)
6. Footer/CTA to Transactions, Invoices (placeholders)

**Acceptance Criteria:**
- [ ] Dashboard shell matches Frontend Spec §6 layout
- [ ] Empty states for all sections
- [ ] CTAs navigate to correct screens (or placeholder routes)
- [ ] Entity context used for any future data (single entity for now)
- [ ] Header consistent with design system

---

### US-013: Side Drawer Navigation

**As a** logged-in user  
**I want** to access main areas via a side drawer  
**So that** I can navigate between Dashboard, Transactions, Invoices, Tax Summary, Filing, Reports, and Settings  

**Trigger:** Tap hamburger icon in header  

**Flow:**
1. Drawer opens from left (mobile: overlay; web: persistent/collapsible sidebar)
2. Top: User avatar, name, email, Entity selector (if multiple entities)
3. Nav items: Dashboard, Transactions, Invoices, Tax Summary, Filing, Reports
4. Divider: Settings, Help & Support, Documents
5. Bottom: Log Out
6. Active item highlighted with primary-light background
7. Tapping item navigates and closes drawer (mobile)

**Acceptance Criteria:**
- [ ] Drawer contents match Frontend Spec §13
- [ ] Entity selector dropdown visible when user has 2+ entities
- [ ] Active route highlighted
- [ ] All items navigate to correct screens (or placeholders)
- [ ] Log Out triggers logout flow
- [ ] Web: sidebar behaviour per spec (persistent, collapsible)

---

### US-014: View Profile

**As a** logged-in user  
**I want** to view my profile information  
**So that** I can see what's on file  

**Trigger:** Settings → Profile  

**Flow:**
1. User opens Profile screen
2. Displays: Avatar, Full name, Email, Phone, NIN (masked), FIRS TIN, Primary currency
3. Read-only view; edit available via "Edit" action
4. Danger zone: "Delete Account" link

**Acceptance Criteria:**
- [ ] All profile fields displayed
- [ ] NIN shown masked (e.g. •••••••1234)
- [ ] Avatar shows uploaded photo or initials
- [ ] "Edit" navigates to edit form or inline edit

---

### US-015: Edit Profile

**As a** logged-in user  
**I want** to update my profile fields  
**So that** my information is accurate  

**Trigger:** Tap "Edit" on Profile screen  

**Flow:**
1. User sees editable form: Profile photo (upload), Full name, Email (with re-verification if changed), Phone, NIN (update), FIRS TIN, Primary currency
2. User makes changes, taps "Save"
3. Mutation `users.updateProfile` (and optionally `users.updateNin`) called
4. Success toast; return to view or stay in edit
5. Email change: send verification email; require confirmation before persisting (or show warning)

**Acceptance Criteria:**
- [ ] All editable fields save correctly
- [ ] Avatar upload stores file in Convex Storage; updates `avatarStorageId`
- [ ] NIN update re-validates 11 digits and re-encrypts
- [ ] Validation errors shown inline
- [ ] Success feedback on save

---

### US-016: View Entity

**As a** user with one or more tax entities  
**I want** to view an entity's details  
**So that** I can verify the information for that entity  

**Trigger:** Settings → Tax Entities → select entity  

**Flow:**
1. Entity list shows: name, type, tax year
2. User taps entity to view details
3. Displays: Name, Type, TIN, RC Number (if business), VAT status, Tax year start
4. "Edit" and "Set as Default" (if not default) actions

**Acceptance Criteria:**
- [ ] Entity details match schema
- [ ] "Set as Default" updates `isDefault` and clears it from others
- [ ] "Edit" opens edit form

---

### US-017: Edit Entity

**As a** user  
**I want** to update an entity's details  
**So that** my tax entity information is correct  

**Trigger:** Tap "Edit" on Entity detail  

**Flow:**
1. Form: Name, Type, TIN, RC Number, VAT registered, VAT threshold exceeded
2. User saves; `entities.update` mutation called
3. Success toast; return to entity list or detail

**Acceptance Criteria:**
- [ ] All fields persist correctly
- [ ] Validation: type-specific rules (e.g. RC Number for LLC)
- [ ] Success feedback

---

### US-018: Create Additional Entity

**As a** user who operates multiple businesses or freelance + business  
**I want** to add another tax entity  
**So that** I can track each entity separately  

**Trigger:** Settings → Tax Entities → "Add Entity"  

**Flow:**
1. User taps "Add Entity"
2. Form: Name, Type (individual/business_name/llc), TIN, RC Number, VAT status
3. User submits
4. `entities.create` mutation; new entity created
5. If first additional entity: entity selector appears in drawer
6. User can switch to new entity from drawer

**Acceptance Criteria:**
- [ ] New entity created and owned by user
- [ ] Only one `isDefault` at a time (new entity is not default unless user sets it)
- [ ] Entity appears in list and drawer selector
- [ ] Switching entities updates context (used by Dashboard, Transactions, etc.)

---

### US-019: Switch Entities

**As a** user with multiple entities  
**I want** to switch the active entity from the side drawer  
**So that** I can view and manage data for different businesses  

**Trigger:** Open side drawer; select different entity from dropdown  

**Flow:**
1. User opens drawer
2. Entity selector dropdown shows current entity
3. User selects different entity
4. Active entity stored in app state (or persisted in userPreferences)
5. All entity-scoped screens (Dashboard, Transactions, etc.) now use new entity
6. Drawer closes; user sees Dashboard for selected entity

**Acceptance Criteria:**
- [ ] Entity selector shows all user entities
- [ ] Selection updates global entity context
- [ ] Navigation to Dashboard (or current screen) refreshes with new entity data
- [ ] Selection persists across app restarts (last-selected or default)
- [ ] Single-entity users: selector hidden or single option

---

### US-019a: Delete Entity

**As a** user with multiple entities  
**I want** to delete an entity I no longer use  
**So that** my entity list stays relevant and I can stop managing obsolete entities  

**Trigger:** Settings → Tax Entities → select entity → "Delete entity"  

**Flow:**
1. User taps "Delete entity" on Entity detail (or from entity list context menu)
2. Confirmation dialog: "Delete {entityName}? All transactions, invoices, and filing records for this entity will be preserved but no longer editable. You cannot undo this."
3. User confirms
4. `entities.delete` mutation (soft-delete) is called
5. If the deleted entity was the default: another entity is auto-selected as default (or the only remaining entity becomes default)
6. User cannot delete their last remaining entity
7. Success toast: "Entity removed"; user returns to entity list

**Acceptance Criteria:**
- [ ] Confirmation dialog required with clear consequence description
- [ ] Soft-delete: entity marked as archived; transactions/invoices retain entityId reference for audit trail
- [ ] Default entity cannot be deleted if it is the user's last entity
- [ ] If deleted entity was default, another entity becomes default
- [ ] Entity no longer appears in entity list or drawer selector
- [ ] Success toast displayed
- [ ] Cascade: existing transactions and invoices remain associated (archived); user cannot create new data for deleted entity

---

### US-020: Manage Preferences

**As a** logged-in user  
**I want** to configure notification and display preferences  
**So that** I get reminders when I want them  

**Trigger:** Settings → Notifications (or Preferences)  

**Flow:**
1. User sees preference form:
   - Filing deadline reminders: toggle, lead days (30/14/7/1)
   - VAT return reminders: toggle
   - Uncategorised transactions alert: toggle, frequency (daily/weekly/off)
   - Invoice overdue alerts: toggle, days after due (1/3/7)
   - Push notifications: toggle, "Enable in Settings" deep link if denied
2. User changes toggles and values; taps "Save"
3. `users.updatePreferences` mutation
4. Success toast

**Acceptance Criteria:**
- [ ] All preferences from `userPreferences` schema editable
- [ ] Default preferences created on first access (or during onboarding)
- [ ] Changes persist
- [ ] Push permission deep link opens device settings on deny

---

### US-021: Log Out

**As a** logged-in user  
**I want** to log out  
**So that** my session is ended and others cannot access my account from this device  

**Trigger:** Side Drawer → Log Out  

**Flow:**
1. User taps "Log Out"
2. Confirmation dialog: "Are you sure you want to log out?"
3. User taps "Log out" (primary) or "Cancel" (secondary)
4. On confirm: `Clerk.signOut()` on client
5. Clerk session invalidated; token cleared
6. Navigate to Welcome screen

**Acceptance Criteria:**
- [ ] Confirmation dialog always shown before logout (consistency with other sensitive actions)
- [ ] Session invalidated on backend
- [ ] Token removed from client storage
- [ ] User cannot access protected routes without re-authenticating
- [ ] Navigate to Welcome

---

### US-022: Delete Account

**As a** user  
**I want** to permanently delete my account  
**So that** my data is removed from TaxEase  

**Trigger:** Profile → Danger zone → "Delete Account"  

**Flow:**
1. User taps "Delete Account"
2. Confirmation dialog: "This will permanently delete your account and all data. This cannot be undone."
3. User must enter password (or confirm email) to proceed
4. User taps "Confirm"
5. Backend: delete all user documents (users, entities, transactions, invoices, etc.), files from Storage
6. Clerk user deleted via Clerk Backend API (or Clerk dashboard handles cascade)
7. Session invalidated; navigate to Welcome
8. Success: "Your account has been deleted."

**Acceptance Criteria:**
- [ ] Confirmation dialog with explicit warning
- [ ] Password (or equivalent) required to confirm
- [ ] All user data deleted per Nigeria Data Protection Act 2023
- [ ] Files in Convex Storage removed
- [ ] Clerk user removed (via Clerk Backend API)
- [ ] User redirected to Welcome
- [ ] Subsequent login attempt fails for that account

---

## 4. UI Specifications

### 4.1 Design Tokens (from Frontend Spec §2)

| Token | Value | Usage |
|-------|-------|-------|
| primary | `#1A7F5E` | Primary buttons, active states |
| primary-light | `#E8F5F0` | Active nav item background |
| accent | `#2B6CB0` | Links, secondary actions |
| success | `#38A169` | Positive, income |
| warning | `#D69E2E` | Alerts, pending |
| danger | `#E53E3E` | Destructive, overdue |
| neutral-900 | `#1A202C` | Body text |
| neutral-500 | `#718096` | Secondary text |
| neutral-100 | `#F7FAFC` | Page backgrounds |
| white | `#FFFFFF` | Card surfaces |

### 4.2 Typography

| Style | Size | Weight |
|-------|------|--------|
| heading-xl | 28px | Bold |
| heading-lg | 22px | SemiBold |
| heading-md | 18px | SemiBold |
| body | 15px | Regular |
| body-sm | 13px | Regular |
| label | 12px | Medium |
| mono | 15px | Monospace |

### 4.3 Screen Layouts

- **Splash:** Full-screen primary green, centred logo, fade-in
- **Welcome:** Hero + headline + subline + primary CTA + secondary link
- **Sign Up / Log In:** Single-column form, logo at top, footer links
- **Onboarding:** Step indicator (1–4), progress bar, form, Back/Continue
- **Dashboard:** Header + scrollable cards (Tax Position, Quick Stats, Recent Transactions, empty states)
- **Side Drawer:** Avatar/name at top, entity selector, nav list, Settings section, Log Out
- **Profile:** Avatar, form fields, danger zone
- **Tax Entities:** List of entity cards, Add Entity CTA
- **Preferences:** Toggle list with labels

### 4.4 Platform Behaviour

| Behaviour | Mobile | Web |
|-----------|--------|-----|
| Drawer | Overlay, slides from left | Persistent sidebar, collapsible |
| Auth storage | Clerk SDK (SecureStore) | Clerk SDK (cookie) |
| Biometric | Face ID / Fingerprint | N/A |
| File upload | Device picker | Drag-and-drop + picker |

### 4.5 Global Components

- **Toast:** Success (green), Warning (amber), Error (red), Info (blue)
- **Empty states:** Illustration + headline + CTA
- **Loading:** Skeleton placeholders preferred over spinners
- **Confirmation dialogs:** Title, consequence, Cancel, Confirm (destructive = red)

---

## 5. Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-001 | App shall support email+password sign-up via Clerk | P0 |
| FR-002 | App shall support Google OAuth sign-up and login via Clerk | P0 |
| FR-003 | App shall support password reset via email | P0 |
| FR-004 | App shall persist session via Clerk SDK (SecureStore on mobile / cookie on web) | P0 |
| FR-005 | App shall support biometric unlock on mobile (client-side, gates token access) | P1 |
| FR-006 | App shall enforce auth for all screens except Splash, Welcome, Sign Up, Log In, Reset | P0 |
| FR-007 | App shall create `users` document on first sign-up with minimal fields | P0 |
| FR-008 | App shall create first `entities` document during onboarding Step 2 | P0 |
| FR-009 | App shall validate NIN as 11 numeric digits before storage | P0 |
| FR-010 | App shall encrypt NIN at rest (AES-256-GCM) | P0 |
| FR-011 | App shall set `onboardingComplete` only after Step 4 "Finish Setup" | P0 |
| FR-012 | App shall seed system categories on first deploy / migration | P0 |
| FR-013 | App shall support multiple entities per user | P0 |
| FR-014 | App shall enforce single default entity per user | P0 |
| FR-015 | App shall persist user preferences (deadline reminders, alerts, push) | P0 |
| FR-016 | App shall create default `userPreferences` for new users | P0 |
| FR-017 | App shall support entity switching from side drawer | P0 |
| FR-018 | App shall support account deletion with password confirmation | P0 |
| FR-019 | App shall delete all user data on account deletion (GDPR/NDPA compliance) | P0 |
| FR-020 | App shall show empty Dashboard with correct layout when no transactions exist | P0 |
| FR-021 | Onboarding Step 4 "Connect Accounts" shall allow skip ("I'll do this later") | P0 |
| FR-022 | App shall display Terms and Privacy links on Sign Up | P0 |

---

## 6. API Requirements (Convex Functions)

### 6.1 Auth (Clerk — client-side + Convex webhook sync)

Authentication is fully managed by Clerk. No Convex auth mutations are needed. The backend handles Clerk webhooks to sync user data.

| Function | Type | Description |
|----------|------|-------------|
| `clerk.webhook` | HTTP Action | Receives Clerk webhooks (`user.created`, `user.updated`, `user.deleted`); verifies signature via `svix`; syncs `users` table |
| `users.getMe` | Query | Current user profile from `users` (uses `ctx.auth.getUserIdentity()`) |
| (Clerk SDK) | Client | `useSignUp()`, `useSignIn()`, `useAuth()`, `useUser()` — Clerk React/React Native SDK handles all auth UI and flows |
| (Clerk Dashboard) | Config | Google OAuth provider, password policy, redirect URLs, webhook endpoints |

### 6.2 Users (`convex/users/`)

| Function | Type | Description |
|----------|------|-------------|
| `users.createProfile` | Mutation | Create `users` doc after sign-up |
| `users.updateProfile` | Mutation | Update name, phone, profession, preferredCurrency, avatar |
| `users.updateNin` | Mutation | Store encrypted NIN; validate 11 digits |
| `users.completeOnboarding` | Mutation | Set `onboardingComplete: true` |
| `users.uploadAvatar` | Mutation | Accept storageId, set avatarStorageId |
| `users.getPreferences` | Query | Return userPreferences for current user |
| `users.updatePreferences` | Mutation | Update notification preferences |
| `users.deleteAccount` | Action | Delete all user data in Convex + delete Clerk user via Clerk Backend API; requires password confirmation |

### 6.3 Entities (`convex/entities/`)

| Function | Type | Description |
|----------|------|-------------|
| `entities.list` | Query | All entities for current user |
| `entities.get` | Query | Single entity by ID (ownership check) |
| `entities.create` | Mutation | Create new entity |
| `entities.update` | Mutation | Update entity fields |
| `entities.setDefault` | Mutation | Set one entity as default |
| `entities.delete` | Mutation | Soft-delete entity (archive) |

### 6.4 Categories (`convex/categories/`)

| Function | Type | Description |
|----------|------|-------------|
| `categories.listAll` | Query | System + user-created categories |
| `categories.seed` | Mutation | One-time seed of system categories (run in migration) |
| `categories.create` | Mutation | User-created category (optional for PRD-0) |

### 6.5 Connected Accounts (`convex/accounts/`)

| Function | Type | Description |
|----------|------|-------------|
| `accounts.list` | Query | All connected accounts for an entity |
| `accounts.add` | Mutation | Create connectedAccounts doc (e.g. "statement_upload" placeholder) |

*Full OAuth/live sync in PRD-1/PRD-8.*

### 6.6 Files (`convex/files/`)

| Function | Type | Description |
|----------|------|-------------|
| `files.generateUploadUrl` | Mutation | Return upload URL for Convex Storage (avatar) |

### 6.7 Dashboard (Stub for PRD-0)

| Function | Type | Description |
|----------|------|-------------|
| `dashboard.getSummary` | Query | Return empty/placeholder summary for entity |
| `dashboard.getDeadlines` | Query | Return filing deadline(s) for current tax year |

---

## 7. Data Models

### 7.1 Tables Required for PRD-0

| Table | Purpose |
|-------|---------|
| `users` | User profile, onboarding state |
| `entities` | Tax entities |
| `categories` | Transaction categories (system seed) |
| `userPreferences` | Notification and display preferences |
| `connectedAccounts` | Optional; placeholder for onboarding Step 4 |
| *(No auth tables)* | User identity managed by Clerk externally; `users` table synced via webhook |

### 7.2 Categories Seed Data

System categories to seed (sample from Backend Spec §4.5):

**Income:** Freelance/Client Income, Foreign Income, Investment Returns, Rental Income  

**Business Expenses (deductible):** Internet & Data, Electricity & Fuel, Software Subscriptions, Equipment Purchase, Professional Development, Workspace/Rent, Transport (Business), Marketing & Advertising, Bank Charges  

**Personal Expenses:** Personal — Groceries, Personal — Entertainment  

**Transfers:** Transfer (Own Account), Loan Disbursement, Refund/Reimbursement  

*Full NTA references to be added in implementation.*

### 7.3 Indexes

- `users`: by_email, by_authUserId  
- `entities`: by_userId  
- `categories`: by_type, by_userId  
- `userPreferences`: by_userId (unique)  
- `connectedAccounts`: by_userId, by_entityId  

---

## 8. Non-Goals

The following are **explicitly out of scope** for PRD-0:

1. **Transaction import:** PDF/CSV parsing, bank linking — PRD-1, PRD-8
2. **AI categorisation:** Claude integration — PRD-2
3. **Tax calculation:** Tax engine, PIT bands, reliefs — PRD-3
4. **Invoicing:** Invoice CRUD, PDF, email — PRD-4
5. **Dashboard data:** Real income/expense/tax figures — PRD-5
6. **Filing module:** Checklist, self-assessment, submission — PRD-6
7. **Reports:** Charts, export — PRD-7
8. **Live bank sync:** OAuth for Mono/Stitch — PRD-8
9. **Push notifications:** FCM/APNs delivery — PRD-9
10. **NIN verification API:** External NIN validation service (optional; validate format only in PRD-0)
11. **Email verification:** Required email verification before full access (optional enhancement)
12. **Two-factor authentication:** 2FA/MFA (future security enhancement)

---

## 9. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Onboarding completion rate** | ≥ 70% of sign-ups complete all 4 steps | Analytics event on Step 4 "Finish Setup" |
| **Time to first entity** | < 5 minutes from sign-up | Timestamp diff |
| **Auth success rate** | ≥ 99% for returning users | Login success / attempts |
| **Profile update rate** | ≥ 20% of users update profile within 30 days | users.updateProfile calls |
| **Multi-entity adoption** | ≥ 10% of users create 2+ entities within 90 days | entities.count per user |
| **Account deletion** | < 1% of active users (low churn indicator) | users.deleteAccount calls |
| **Session persistence** | No unexpected logouts (subjective) | User feedback / support tickets |
| **Category seed load** | 100% of new deployments have categories | categories.listAll returns system list |

---

## 10. Open Questions

1. **Google OAuth:** Configure Google provider in Clerk dashboard; confirm Clerk React Native SDK supports OAuth redirect/deep linking.
2. **NIN verification API:** Is there a sanctioned FIRS/NRS API for NIN validation? If not, format-only validation in PRD-0.
3. **Biometric storage:** Where exactly is the Clerk session token stored? Confirm Clerk React Native SDK uses SecureStore or equivalent secure storage.
4. **Email verification:** Require verified email before onboarding? Or allow unverified with banner?
5. **Entity soft-delete:** **Resolved:** Soft-delete policy: entity marked as archived. Transactions and invoices retain entityId reference for audit trail and remain viewable in read-only mode. User cannot create new transactions, invoices, or filing records for a deleted entity. Entity is excluded from entity list and drawer selector.
6. **Onboarding skip:** Can a user ever skip onboarding (e.g. invite flow)? Current spec: no — onboarding required.
7. **Terms & Privacy:** Do legal documents exist? Placeholder links vs real URLs.
8. **Default preferences:** Exact default values for deadlineReminderDays, uncategorisedAlertFrequency, etc.
9. **Connected account placeholder:** In Step 4, does "Upload bank statement" create a connectedAccounts record with provider "statement_upload" immediately, or only when user actually uploads (PRD-1)?
10. **Multi-entity limit:** Max entities per user? (Suggested: 10 for v1.)

---

*End of PRD-0 — Foundation: Auth (Clerk), Onboarding & Entity Setup*
