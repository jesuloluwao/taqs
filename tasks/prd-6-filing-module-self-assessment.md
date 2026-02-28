# PRD-6: Filing Module & Self-Assessment

**TaxEase Nigeria**  
**Version:** 1.0 — February 2026  
**Status:** Draft  
**Priority:** P0 — Build After PRD-3  
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

PRD-6 delivers the Filing Module — the culmination of the entire TaxEase product. This is the reason users download TaxEase: to actually file their taxes. The module walks users through a guided pre-filing checklist, reviews their tax figures in a condensed summary, generates an immutable self-assessment PDF that mirrors the official FIRS/NRS format, provides step-by-step instructions for TaxPro Max submission, and allows uploading of payment receipts and Tax Clearance Certificates (TCC).

The filing record is the most critical data structure in TaxEase. The `taxSummarySnapshot` field captures the complete `TaxEngineOutput` at the exact moment of self-assessment generation, creating an **immutable audit record** that cannot be retroactively altered by subsequent transaction changes, engine version updates, or user edits.

### 1.2 Scope

| In Scope | Out of Scope |
|----------|--------------|
| Filing Checklist screen (grouped, status indicators, readiness meter) | Direct FIRS/NRS API submission (manual via TaxPro Max) |
| Pre-Filing Review screen (condensed summary, flagged issues) | Payment processing (user pays via bank/NRS portal) |
| Self-Assessment generation (snapshot + PDF via NestJS service) | Automated TCC retrieval from FIRS |
| Self-Assessment Preview screen (document-style view) | Amendment/re-filing after TCC obtained |
| PDF download | Push notification delivery (PRD-9) |
| Submission Guide (5-step with deep links, copy-to-clipboard) | Multi-year bulk filing |
| Payment receipt upload | Filing for entities the user doesn't own |
| TCC upload | Penalty payment processing |
| Filing status lifecycle management | |
| Filing history (past years) | |
| Nil return filing flow | |
| Re-generation of self-assessment before submission | |

### 1.3 Out-of-Box Experience

Upon completion of PRD-6, a user can:

1. **Assess readiness:** View a grouped filing checklist with status indicators showing what's complete, needs attention, or is missing
2. **Resolve issues:** Navigate from checklist items to the relevant screens (transactions, bank accounts, invoices) to fix problems
3. **Review figures:** See a condensed pre-filing summary of all tax figures with flagged exclusions
4. **Generate self-assessment:** Snapshot the current TaxEngineOutput and generate an NRS-format PDF
5. **Preview and download:** View the self-assessment in a document-style preview and download as PDF
6. **Follow submission guide:** Step through TaxPro Max submission instructions with deep links and copy-to-clipboard
7. **Upload proof:** Upload payment receipt and TCC for record-keeping
8. **Track status:** See the filing progress through draft → generated → submitted → payment_pending → payment_confirmed → tcc_obtained
9. **View history:** Access filing records from previous tax years

### 1.4 Dependencies

| Dependency | Type | What It Provides |
|------------|------|------------------|
| PRD-0 (Auth, Entity Setup) | Hard | Users, entities, NIN/TIN data for taxpayer details |
| PRD-1 (Transaction Management) | Soft | Transactions completeness check for checklist |
| PRD-3 (Tax Calculation Engine) | Hard | `TaxEngineOutput` — the tax computation that gets snapshotted |
| PRD-4 (Invoicing & WHT) | Soft | Invoice/WHT reconciliation status for checklist |

### 1.5 Filing Deadline

March 31 of the year following the tax year (e.g., 2026 tax year must be filed by March 31, 2027). Nil returns are required even when no tax is owed. Late filing incurs penalties: ₦100,000 + ₦50,000 per month of default.

---

## 2. Entities (TypeScript Interfaces)

### 2.1 FilingRecord

```typescript
/** Immutable filing record — one per entity per tax year */
interface FilingRecord {
  _id: Id<"filingRecords">;
  _creationTime: number;
  entityId: Id<"entities">;
  userId: Id<"users">;
  taxYear: number;
  status: FilingStatus;

  /** Storage ID of the generated self-assessment PDF (Convex Storage) */
  selfAssessmentPdfId?: string;

  /** Storage ID of the uploaded payment receipt (Convex Storage) */
  paymentReceiptId?: string;

  /** Storage ID of the uploaded Tax Clearance Certificate (Convex Storage) */
  tccDocumentId?: string;

  /** Unix ms — when user marked as submitted to TaxPro Max */
  submittedAt?: number;

  /** Net tax payable amount captured at the moment of self-assessment generation */
  netTaxPayable: number;

  /**
   * JSON.stringify() of the complete TaxEngineOutput at filing time.
   * This is the IMMUTABLE AUDIT RECORD. Once generated, this snapshot
   * is never updated — even if the user subsequently edits transactions,
   * changes reliefs, or the engine version is bumped. The snapshot
   * preserves the exact figures that appeared on the self-assessment PDF.
   *
   * To "amend" a filing, the user must re-generate (which creates a new
   * snapshot, new PDF, and resets status to "generated").
   */
  taxSummarySnapshot: string;

  /** Unix ms — when the self-assessment was last generated */
  generatedAt?: number;

  /** Engine version at time of snapshot (duplicated from snapshot for query convenience) */
  engineVersion?: string;

  /** Whether this is a nil return (duplicated from snapshot for query convenience) */
  isNilReturn: boolean;
}

type FilingStatus =
  | "draft"              // Filing initiated, no self-assessment yet
  | "generated"          // Self-assessment PDF generated with snapshot
  | "submitted"          // User confirmed submission to TaxPro Max
  | "payment_pending"    // Submitted; awaiting payment (or nil return — skip to tcc)
  | "payment_confirmed"  // Payment receipt uploaded and acknowledged
  | "tcc_obtained";      // Tax Clearance Certificate uploaded — filing complete
```

### 2.2 FilingChecklist

```typescript
/** Checklist readiness state returned by tax.getFilingChecklist */
interface FilingChecklist {
  entityId: string;
  taxYear: number;
  readinessPercent: number;
  groups: ChecklistGroup[];
}

interface ChecklistGroup {
  id: string;
  label: string;
  items: ChecklistItem[];
}

interface ChecklistItem {
  id: string;
  label: string;
  status: "done" | "needs_attention" | "missing";
  /** Human-readable detail, e.g. "1 account not yet linked" */
  detail?: string;
  /** Navigation target to fix the issue */
  navigateTo?: string;
}
```

### 2.3 TaxSummarySnapshot

```typescript
/**
 * The snapshot is the complete TaxEngineOutput serialised as JSON.
 * It is stored as a string in filingRecords.taxSummarySnapshot.
 *
 * To read, parse back to TaxEngineOutput:
 *   const snapshot: TaxEngineOutput = JSON.parse(record.taxSummarySnapshot);
 *
 * The snapshot preserves every field from TaxEngineOutput at generation time:
 */
type TaxSummarySnapshot = {
  entityId: string;
  taxYear: number;
  engineVersion: string;
  computedAt: number;
  pit?: PitResult;
  cit?: CitResult;
  cgt?: CgtResult;
  vat?: VatResult;
  totalTaxPayable: number;
  uncategorisedCount: number;
  fxRateApproximated: boolean;
};

// PitResult, CitResult, CgtResult, VatResult — as defined in PRD-3 §2.5
```

### 2.4 PreFilingReview

```typescript
/** Data structure for the Pre-Filing Review screen */
interface PreFilingReview {
  taxSummary: TaxEngineOutput;
  flags: PreFilingFlag[];
  canGenerate: boolean;
}

interface PreFilingFlag {
  severity: "warning" | "info";
  message: string;
  /** Navigation target to fix the issue */
  navigateTo?: string;
}
```

### 2.5 SubmissionGuideStep

```typescript
/** A step in the TaxPro Max submission guide */
interface SubmissionGuideStep {
  stepNumber: number;
  title: string;
  description: string;
  /** Optional deep link URL (e.g. TaxPro Max portal) */
  deepLink?: string;
  /** Fields to display with copy-to-clipboard */
  copyableFields?: { label: string; value: string }[];
  /** Whether the step has an upload action */
  hasUpload?: boolean;
  uploadType?: "payment_receipt" | "tcc";
}
```

---

## 3. User Stories

### 3.1 Filing Checklist

#### US-601: View Filing Checklist

**As a** user preparing to file my annual return  
**I want** to see a grouped checklist of everything I need to complete before filing  
**So that** I know exactly what's ready, what needs attention, and what's missing  

**Trigger:** Navigate to Filing from side drawer  

**Flow:**
1. User opens Filing screen; system calls `tax.getFilingChecklist` for active entity + current tax year
2. Screen shows readiness meter at top (e.g. "78% Ready") with a circular or horizontal progress indicator
3. Below the meter, grouped checklist items render:
   - **Identity & Registration:** NIN/TIN on file, Tax entity type confirmed
   - **Income:** All bank accounts imported, All foreign income converted, Income sources reviewed and confirmed
   - **Expenses & Deductions:** All transactions categorised, Business expenses verified, Rent paid amount confirmed
   - **Invoices:** All issued invoices matched to income, WHT credits recorded
4. Each item shows a status indicator: ✅ Done (green) | ⚠️ Needs attention (amber, with detail text) | ❌ Missing (red)
5. Primary CTA at bottom: "Start Filing Review" — enabled only when readiness ≥ 90%
6. If readiness < 90%: CTA is disabled with helper text "Complete more items to start filing"

**Acceptance Criteria:**
- [ ] Readiness percent computed from checklist item statuses (weighted equally unless specified)
- [ ] Groups render in order: Identity, Income, Expenses, Invoices
- [ ] Status indicators match design tokens: success (`#38A169`), warning (`#D69E2E`), danger (`#E53E3E`)
- [ ] Detail text shown for needs_attention items (e.g. "1 account not yet linked", "12 uncategorised")
- [ ] CTA disabled state is visually distinct (greyed out)
- [ ] CTA enabled at exactly ≥ 90% readiness
- [ ] Checklist data is reactive — updates if user fixes issues and returns

---

#### US-602: Resolve Checklist Items

**As a** user with incomplete checklist items  
**I want** to tap a checklist item to navigate to the screen where I can fix it  
**So that** I can efficiently resolve issues without hunting for the right screen  

**Trigger:** Tap a checklist item with status "needs_attention" or "missing"  

**Flow:**
1. User taps item (e.g. "All transactions categorised ⚠️ 12 uncategorised")
2. App navigates to the relevant screen:
   - "NIN/TIN on file" → Profile edit screen
   - "All bank accounts imported" → Connected Accounts / Import screen
   - "All transactions categorised" → Transactions list filtered to uncategorised
   - "Income sources reviewed" → Income review screen
   - "Rent paid amount confirmed" → Tax declarations form
   - "WHT credits recorded" → WHT / Invoice reconciliation screen
3. User resolves the issue on the target screen
4. User navigates back to Filing; checklist automatically reflects updated status

**Acceptance Criteria:**
- [ ] Tappable items have a chevron or navigation indicator
- [ ] "Done" items are tappable but navigate to view (not edit) mode
- [ ] Navigation target is correct for each item type
- [ ] Returning to checklist shows updated status (reactive query)

---

#### US-603: Start Filing Review (Gate at ≥90%)

**As a** user whose checklist is ≥ 90% complete  
**I want** to proceed to the Pre-Filing Review  
**So that** I can review my final figures before generating the self-assessment  

**Trigger:** Tap "Start Filing Review" CTA (enabled)  

**Flow:**
1. User taps "Start Filing Review"
2. System calls `filing.initiate` to create or retrieve filing record in "draft" status
3. Navigate to Pre-Filing Review screen

**Acceptance Criteria:**
- [ ] Filing record created if none exists for this entity + tax year
- [ ] If filing record already exists (any status), it is retrieved — not duplicated
- [ ] Navigation to Pre-Filing Review only succeeds if readiness ≥ 90%
- [ ] If readiness dropped below 90% between renders (race condition), show toast and keep user on checklist

---

### 3.2 Pre-Filing Review

#### US-604: Review Tax Figures Before Filing

**As a** user about to file  
**I want** to see a condensed, read-only summary of all my tax figures  
**So that** I can verify everything is correct before generating the official self-assessment  

**Trigger:** Navigation from Filing Checklist ("Start Filing Review")  

**Flow:**
1. Screen loads with `tax.getSummary` data for entity + tax year
2. Top: Amber callout box with any flagged issues (e.g. "2 transactions still uncategorised — they have been excluded")
3. Read-only summary sections:
   - **Income:** Total gross income with source breakdown
   - **Deductions:** Business expenses, reliefs with amounts
   - **Taxable Income:** After deductions
   - **Tax Computation:** Band breakdown (condensed — band numbers, income, tax per band)
   - **Credits:** WHT credits total
   - **Net Payable:** Final amount (or "Nil Return — ₦0")
4. Tip card: "Once you generate your self-assessment, you can still make amendments before submitting to TaxPro Max."
5. Footer actions:
   - "Go Back to Fix Issues" (secondary, shown if flags exist) — returns to Checklist
   - "Generate Self-Assessment Form" (primary CTA)

**Acceptance Criteria:**
- [ ] All figures match `tax.getSummary` output
- [ ] Flagged issues shown in amber callout with warning icon
- [ ] Nil return: net payable shows ₦0 with "Nil Return" label; generation still available
- [ ] "Go Back to Fix Issues" only shown when flags exist
- [ ] Figures are read-only — no inline editing on this screen
- [ ] Tip card styled with `primary-light` background

---

#### US-605: Generate Self-Assessment

**As a** user who has reviewed their figures  
**I want** to generate my official self-assessment form  
**So that** I have a PDF matching the FIRS format to submit via TaxPro Max  

**Trigger:** Tap "Generate Self-Assessment Form" on Pre-Filing Review  

**Flow:**
1. User taps "Generate Self-Assessment Form"
2. Confirmation dialog: "This will snapshot your current tax figures and generate a self-assessment PDF. You can re-generate later if you make changes."
3. User confirms
4. Loading state: "Generating your self-assessment…" with progress indicator
5. System executes `filing.generateSelfAssessment`:
   a. Fetches current `TaxEngineOutput` via `tax.getSummary`
   b. Serialises `TaxEngineOutput` to JSON → stores as `taxSummarySnapshot`
   c. Captures `netTaxPayable`, `engineVersion`, `isNilReturn` on filing record
   d. Calls NestJS PDF service (`POST /pdf/self-assessment`) with snapshot JSON
   e. Stores returned PDF in Convex Storage → updates `selfAssessmentPdfId`
   f. Updates filing record status from "draft" to "generated"
   g. Sets `generatedAt` timestamp
6. On success: Navigate to Self-Assessment Preview screen
7. On failure: Error toast "Failed to generate self-assessment. Please try again." — user stays on Pre-Filing Review

**Acceptance Criteria:**
- [ ] Confirmation dialog before generation
- [ ] `taxSummarySnapshot` is `JSON.stringify(TaxEngineOutput)` — complete and immutable
- [ ] Filing record status transitions from "draft" to "generated"
- [ ] PDF service called with correct payload; returned PDF stored in Convex Storage
- [ ] `generatedAt` timestamp set to current time
- [ ] `isNilReturn` flag set correctly on filing record
- [ ] Error handling: PDF service timeout (30s), network failure, storage failure
- [ ] Loading state visible during generation (typically 3–8 seconds)
- [ ] **Navigate-away behavior:** If user navigates away (back, drawer) during generation: generation continues in background. On return to Filing screen, user sees either (a) loading state if still in progress, or (b) success state with link to Preview, or (c) error toast if failed. No data loss; filing record updated when generation completes. User is not blocked from using the app.
- [ ] "Generating…" overlay is non-dismissible during generation (or dismissible with "Continue in background" — user can leave and return)

---

### 3.3 Self-Assessment Preview & Download

#### US-606: Preview Self-Assessment

**As a** user who generated a self-assessment  
**I want** to see a document-style rendered preview of the form  
**So that** I can verify it looks correct before downloading or submitting  

**Trigger:** Successful generation (auto-navigate) or tap from Filing record  

**Flow:**
1. Screen renders a document-style view mirroring NRS/FIRS format
2. Sections visible:
   - **Taxpayer Details:** Full name, NIN (masked in preview, full in PDF), address, entity type, TIN
   - **Income Schedule:** Itemised income by source with totals
   - **Deductions & Reliefs Schedule:** Business expenses, rent relief, pension, NHIS, NHF, life insurance, mortgage interest with amounts and caps
   - **Tax Computation Summary:** Assessable profit, taxable income, band breakdown, gross tax, minimum tax check
   - **Credits (WHT):** Total WHT credits applied
   - **Net Amount Payable:** Final tax due (or ₦0 for nil returns)
3. Footer actions:
   - "Download as PDF" (secondary)
   - "Continue to Submission Guide" (primary CTA)

**Acceptance Criteria:**
- [ ] Preview renders from the stored snapshot (not live data) — ensures PDF and preview match
- [ ] All sections present and populated
- [ ] NIN masked in on-screen preview (e.g. •••••••1234)
- [ ] Nil return preview shows all figures with ₦0 net payable
- [ ] Document-style layout: white background, subtle border, formal typography

---

#### US-607: Download Self-Assessment PDF

**As a** user viewing the self-assessment preview  
**I want** to download the PDF to my device  
**So that** I have a local copy for my records and for uploading to TaxPro Max  

**Trigger:** Tap "Download as PDF" on Preview screen  

**Flow:**
1. User taps "Download as PDF"
2. System fetches PDF from Convex Storage using `selfAssessmentPdfId`
3. Mobile: system share sheet or save to Files
4. Web: browser download dialog
5. File named: `TaxEase_SelfAssessment_{EntityName}_{TaxYear}.pdf`

**Acceptance Criteria:**
- [ ] PDF downloads successfully on both mobile and web
- [ ] File name includes entity name and tax year
- [ ] PDF content matches the preview exactly
- [ ] Download works offline if PDF was previously cached

---

### 3.4 Submission Guide

#### US-608: View Submission Guide

**As a** user ready to submit my self-assessment  
**I want** step-by-step instructions for submitting via TaxPro Max  
**So that** I can complete my filing without confusion  

**Trigger:** Tap "Continue to Submission Guide" from Preview screen  

**Flow:**
1. Screen shows a vertical stepper with 5 steps, each expandable:
   
   **Step 1 — Submit via TaxPro Max**
   - Instructions: "Log in to the FIRS TaxPro Max portal and upload your self-assessment form."
   - Deep link button: "Open TaxPro Max" → opens `https://taxpromax.firs.gov.ng` in external browser
   - After completing: user taps "Mark as Submitted" within the app
   
   **Step 2 — Make Payment**
   - Shows net tax payable amount (from filing record)
   - NRS Collection Account details (bank name, account number, sort code)
   - Copy-to-clipboard buttons for account number and amount
   - Nil return: this step shows "No payment required — nil return" and is auto-marked complete
   
   **Step 3 — Upload Payment Receipt**
   - File upload field (image or PDF)
   - "Upload Receipt" button
   - Nil return: step is skipped/hidden
   
   **Step 4 — Obtain Tax Clearance Certificate**
   - Instructions: "After payment confirmation, apply for your TCC from your FIRS office or via TaxPro Max."
   - Estimated timeline: "Typically 2–6 weeks after confirmed payment"
   
   **Step 5 — Store Your Records**
   - Reminder: "Your self-assessment, payment receipt, and TCC are saved in TaxEase under Documents."
   - Link to Documents screen

2. Steps are collapsible; completed steps show a green checkmark
3. Current active step is expanded by default

**Acceptance Criteria:**
- [ ] All 5 steps render with correct content
- [ ] Deep link opens TaxPro Max in external browser
- [ ] Copy-to-clipboard works for account number and payment amount; shows "Copied!" toast
- [ ] Nil return: payment step shows "No payment required"; upload receipt step hidden
- [ ] Steps visually indicate completion state

---

#### US-609: Mark as Submitted

**As a** user who has uploaded my self-assessment to TaxPro Max  
**I want** to mark my filing as submitted in TaxEase  
**So that** my filing status is updated and I can track the next steps  

**Trigger:** Tap "Mark as Submitted" in Submission Guide Step 1  

**Flow:**
1. User taps "Mark as Submitted"
2. Confirmation: "Have you uploaded your self-assessment to TaxPro Max?"
3. User confirms
4. System calls `filing.markSubmitted`:
   - Sets `status` to "submitted"
   - Sets `submittedAt` to current timestamp
   - For nil returns: transitions to "payment_confirmed" immediately (no payment needed)
5. Step 1 shows green checkmark; Step 2 (or Step 4 for nil returns) becomes active

**Acceptance Criteria:**
- [ ] Confirmation dialog before marking
- [ ] Status transitions: "generated" → "submitted"
- [ ] Nil return: "submitted" → "payment_confirmed" (automatic skip)
- [ ] `submittedAt` timestamp recorded
- [ ] UI updates to reflect new status

---

#### US-610: Upload Payment Receipt

**As a** user who has paid my tax  
**I want** to upload my payment receipt  
**So that** I have proof of payment stored with my filing record  

**Trigger:** Tap "Upload Receipt" in Submission Guide Step 3  

**Flow:**
1. User taps "Upload Receipt"
2. File picker opens (supports: JPG, PNG, PDF; max 10MB)
3. User selects file
4. Upload progress indicator shown
5. System calls `filing.uploadPaymentReceipt`:
   - Stores file in Convex Storage
   - Updates filing record with `paymentReceiptId`
   - Transitions status from "submitted" to "payment_pending" (if not already)
   - Optionally auto-transitions to "payment_confirmed" after upload (or requires manual confirmation)
6. Success toast: "Payment receipt uploaded"
7. Step 3 shows green checkmark; Step 4 becomes active

**Acceptance Criteria:**
- [ ] File picker supports JPG, PNG, PDF
- [ ] File size limit: 10MB; show error if exceeded
- [ ] Upload progress visible
- [ ] Receipt stored in Convex Storage; `paymentReceiptId` set on filing record
- [ ] Status transitions: "submitted" → "payment_pending" → "payment_confirmed"
- [ ] User can re-upload (replaces previous receipt)

---

#### US-611: Upload Tax Clearance Certificate

**As a** user who has received my TCC  
**I want** to upload it to TaxEase  
**So that** my filing record is complete and I have a digital copy  

**Trigger:** Tap "Upload TCC" in Submission Guide Step 4  

**Flow:**
1. User taps "Upload TCC"
2. File picker opens (supports: JPG, PNG, PDF; max 10MB)
3. User selects file
4. Upload progress indicator
5. System calls `filing.uploadTcc`:
   - Stores file in Convex Storage
   - Updates filing record with `tccDocumentId`
   - Transitions status to "tcc_obtained"
6. Success toast: "Tax Clearance Certificate uploaded — filing complete!"
7. All steps show green checkmarks; completion celebration (confetti or success illustration)

**Acceptance Criteria:**
- [ ] File picker supports JPG, PNG, PDF
- [ ] File size limit: 10MB
- [ ] TCC stored in Convex Storage; `tccDocumentId` set on filing record
- [ ] Status transitions to "tcc_obtained" — terminal status
- [ ] Completion state is visually celebratory
- [ ] User can re-upload TCC (replaces previous)

---

### 3.5 Filing History & Status

#### US-612: View Filing History

**As a** user who has filed in previous years  
**I want** to see a list of all my filing records  
**So that** I can review past filings and track current-year progress  

**Trigger:** Filing screen with tax year selector or "Filing History" link  

**Flow:**
1. User opens Filing screen; defaults to current tax year
2. Tax year selector (dropdown or tabs): 2026, 2025, 2024…
3. For each year with a filing record:
   - Tax year label
   - Status badge (colour-coded): Draft | Generated | Submitted | Payment Pending | Payment Confirmed | TCC Obtained
   - Net tax payable (or "Nil Return")
   - Date of last status change
4. Tapping a past filing opens its details (read-only preview of snapshot, documents)
5. For current year without a record: shows the Checklist screen (US-601)

**Acceptance Criteria:**
- [ ] Tax year selector shows years with filing records + current year
- [ ] Status badges use appropriate colours: draft (neutral), generated (accent), submitted (warning), payment_pending (warning), payment_confirmed (success), tcc_obtained (success with checkmark)
- [ ] Past-year filing detail shows the snapshot data (parsed from `taxSummarySnapshot`), not live data
- [ ] Documents (PDF, receipt, TCC) downloadable from filing detail
- [ ] **Empty state (first-year filer):** When user has no prior filing records (only current year, no completed past filings): tax year selector shows current year only; "Filing History" or past-years section shows "No past filings yet. Complete your first filing to see history here." or section hidden until first filing is completed

---

#### US-613: Filing Status Transitions

**As a** user progressing through the filing lifecycle  
**I want** my filing status to automatically advance as I complete each step  
**So that** I always know where I am in the process  

**Status Lifecycle:**

```
draft → generated → submitted → payment_pending → payment_confirmed → tcc_obtained
                                     ↓ (nil return)
                                payment_confirmed → tcc_obtained
```

**Transition Rules:**

| From | To | Trigger |
|------|----|---------|
| (none) | draft | `filing.initiate` called |
| draft | generated | `filing.generateSelfAssessment` succeeds |
| generated | generated | Re-generation (new snapshot, new PDF; stays "generated") |
| generated | submitted | `filing.markSubmitted` called |
| submitted | payment_pending | Payment receipt uploaded |
| submitted | payment_confirmed | Nil return: auto-transition on markSubmitted |
| payment_pending | payment_confirmed | Payment receipt uploaded and acknowledged |
| payment_confirmed | tcc_obtained | TCC uploaded |

**Acceptance Criteria:**
- [ ] Status can only advance forward (no backward transitions except re-generate)
- [ ] Re-generation resets status to "generated" and replaces snapshot + PDF
- [ ] Nil returns skip payment steps
- [ ] Each transition is atomic (Convex mutation)
- [ ] Invalid transitions are rejected with clear error

---

### 3.6 Re-Generation & Amendment

#### US-614: Re-Generate Self-Assessment

**As a** user who made changes after generating a self-assessment  
**I want** to re-generate my self-assessment with updated figures  
**So that** my filing reflects my most current data  

**Trigger:** "Re-Generate" button on Preview screen or Submission Guide (while status is "generated")  

**Flow:**
1. User taps "Re-Generate Self-Assessment"
2. Warning dialog: "This will replace your current self-assessment with updated figures. The previous version will be discarded."
3. User confirms
4. System executes `filing.generateSelfAssessment` again:
   - Takes a new `TaxEngineOutput` snapshot
   - Generates a new PDF
   - Replaces `taxSummarySnapshot`, `selfAssessmentPdfId`, `generatedAt`
   - Status remains (or resets to) "generated"
5. Navigate to updated Preview

**Acceptance Criteria:**
- [ ] Re-generation only allowed when status is "draft" or "generated"
- [ ] Not allowed after "submitted" — user must contact support or a manual override is needed
- [ ] Warning dialog explains the replacement
- [ ] Previous PDF is deleted from Convex Storage (or retained as archive — product decision)
- [ ] New snapshot fully replaces old snapshot

---

### 3.7 Nil Return Filing

#### US-615: File a Nil Return

**As a** user with zero tax liability  
**I want** to complete the filing process for a nil return  
**So that** I comply with the requirement to file even when no tax is owed  

**Trigger:** User reaches Filing with `netTaxPayable = 0`  

**Flow:**
1. Checklist: same as regular flow; all items must still be addressed
2. Pre-Filing Review: shows all figures; net payable = ₦0; "Nil Return" badge
3. Generation: snapshot captured normally (records zero liability); PDF generated with "NIL RETURN" watermark or header
4. Preview: shows complete form with zero amounts; "Nil Return" label prominent
5. Submission Guide:
   - Step 1: same TaxPro Max submission
   - Step 2: "No payment required — nil return" (no account details shown)
   - Step 3: hidden (no payment receipt needed)
   - Step 4: TCC instructions still apply
   - Step 5: same records reminder
6. Mark Submitted: transitions to "submitted" → auto-skips to "payment_confirmed"
7. Upload TCC: transitions to "tcc_obtained"

**Acceptance Criteria:**
- [ ] Nil return detected from `TaxEngineOutput.totalTaxPayable === 0`
- [ ] Self-assessment PDF includes nil return indication
- [ ] Payment steps are hidden or clearly marked as not applicable
- [ ] Status lifecycle correctly skips payment_pending
- [ ] Filing record `isNilReturn = true`

---

### 3.8 Empty, Loading & Error States

#### US-616: Empty State — No Filing Record

**As a** user who has never started filing for this tax year  
**I want** to see a clear empty state on the Filing screen  
**So that** I understand I need to start the process  

**Trigger:** Navigate to Filing; no filing record exists for current entity + tax year  

**Flow:**
1. Screen shows the Filing Checklist (default view for the tax year)
2. No filing record message at top: "You haven't started filing for [Tax Year] yet. Complete the checklist below to begin."
3. Readiness meter and checklist render normally

**Acceptance Criteria:**
- [ ] Empty state is informative, not blank
- [ ] Illustration or icon showing filing process
- [ ] Checklist is immediately actionable

---

#### US-617: Loading States

**As a** user navigating to any Filing screen  
**I want** to see appropriate loading indicators  
**So that** I know the app is working  

**Acceptance Criteria:**
- [ ] Checklist: skeleton placeholders for each group and item
- [ ] Pre-Filing Review: skeleton for summary sections
- [ ] Self-Assessment generation: "Generating your self-assessment…" with animated spinner or progress bar; full-screen or modal overlay
- [ ] Submission Guide — Mark as Submitted: loading state on button during mutation
- [ ] PDF download: progress indicator
- [ ] File upload: upload progress percentage or bar

---

#### US-618: Error States

**As a** user experiencing a failure  
**I want** clear error messages with recovery options  
**So that** I know what went wrong and what to do  

**Error Scenarios:**

| Scenario | Message | Recovery |
|----------|---------|----------|
| PDF generation timeout | "Self-assessment generation timed out. Please try again." | "Retry" button |
| PDF service unavailable | "Our document service is temporarily unavailable. Please try again in a few minutes." | "Retry" button, auto-retry after 30s |
| File upload failure | "Upload failed. Please check your connection and try again." | "Retry" button |
| File too large | "File exceeds the 10MB limit. Please upload a smaller file." | File picker re-opens |
| Unsupported file type | "This file type is not supported. Please upload a JPG, PNG, or PDF." | File picker re-opens |
| Snapshot failure | "Could not capture tax figures. Please ensure your tax data is complete." | "Go to Checklist" button |
| Network error | "No internet connection. Please check your network and try again." | "Retry" button |

**Acceptance Criteria:**
- [ ] All error states have user-friendly messages (no technical jargon)
- [ ] Recovery actions are clear and functional
- [ ] Errors logged for debugging (console + error tracking service)
- [ ] No data loss on error — partial state preserved where possible

---

## 4. UI Specifications

### 4.1 Design Tokens

| Token | Value | Usage in Filing Module |
|-------|-------|----------------------|
| primary | `#1A7F5E` | "Generate" CTA, active stepper steps, progress meter fill |
| primary-light | `#E8F5F0` | Tip card background, completed step background |
| accent | `#2B6CB0` | Deep links (TaxPro Max), secondary actions |
| success | `#38A169` | ✅ Done checklist items, completed steps, "tcc_obtained" badge |
| warning | `#D69E2E` | ⚠️ Needs attention items, flagged issues callout, "submitted" badge |
| danger | `#E53E3E` | ❌ Missing items, error states, overdue deadline |
| neutral-900 | `#1A202C` | Body text, headings |
| neutral-500 | `#718096` | Secondary text, descriptions, timestamps |
| neutral-100 | `#F7FAFC` | Page backgrounds |
| white | `#FFFFFF` | Card surfaces, document preview background |

### 4.2 Filing Checklist Screen

**Layout:** Full-height scrollable screen

**Layout & Scroll Behavior:**
- **Header:** Sticky — "Filing" title and tax year selector remain visible while scrolling
- **Readiness meter:** Visible near top; scrolls with content or stays just below header
- **"Start Filing Review" CTA:** Sticky at bottom — primary action remains accessible without scrolling to end of long checklist. Fixed bottom bar when checklist is long.

```
┌─────────────────────────────────┐
│  ← Filing          2026 ▼      │  (header with tax year selector)
├─────────────────────────────────┤
│  ┌─────────────────────────┐   │
│  │  🟢 78% Ready           │   │  (circular progress / meter)
│  │  ████████░░              │   │
│  └─────────────────────────┘   │
│                                 │
│  IDENTITY & REGISTRATION        │  (group header)
│  ┌─────────────────────────┐   │
│  │ ✅ NIN/TIN on file    › │   │
│  │ ✅ Entity type set    › │   │
│  └─────────────────────────┘   │
│                                 │
│  INCOME                         │
│  ┌─────────────────────────┐   │
│  │ ⚠️ Bank accounts      › │   │
│  │    1 account not linked  │   │
│  │ ✅ Foreign income      › │   │
│  │ ❌ Income reviewed     › │   │
│  └─────────────────────────┘   │
│                                 │
│  EXPENSES & DEDUCTIONS          │
│  ┌─────────────────────────┐   │
│  │ ⚠️ Categorisation     › │   │
│  │    12 uncategorised      │   │
│  │ ✅ Business expenses   › │   │
│  │ ❌ Rent confirmed      › │   │
│  └─────────────────────────┘   │
│                                 │
│  INVOICES                       │
│  ┌─────────────────────────┐   │
│  │ ✅ Invoices matched    › │   │
│  │ ✅ WHT credits         › │   │
│  └─────────────────────────┘   │
│                                 │
│  ┌─────────────────────────┐   │
│  │  Start Filing Review    │   │  (primary CTA, disabled if < 90%)
│  └─────────────────────────┘   │
└─────────────────────────────────┘
```

- Checklist items in card groups with rounded corners on `white` surface
- Group headers in `label` typography, uppercase, `neutral-500`
- Status icons: ✅ = `success`, ⚠️ = `warning`, ❌ = `danger`
- Detail text (e.g. "12 uncategorised") in `body-sm`, `neutral-500`
- Chevron (›) on the right for navigable items

### 4.3 Pre-Filing Review Screen

**Layout:** Scrollable single-column

**Layout & Scroll Behavior:**
- **Footer actions:** "Go Back to Fix Issues" and "Generate Self-Assessment Form" in sticky bottom bar — always visible, never scrolled out of view

```
┌─────────────────────────────────┐
│  ← Pre-Filing Review            │
├─────────────────────────────────┤
│  ┌─ AMBER CALLOUT ────────┐    │
│  │ ⚠️ 2 transactions       │    │
│  │ uncategorised — excluded │    │
│  └─────────────────────────┘    │
│                                  │
│  INCOME                          │
│  Gross Income     ₦7,200,000    │
│    Freelance      ₦6,500,000    │
│    Foreign        ₦700,000      │
│                                  │
│  DEDUCTIONS                      │
│  Business Expenses ₦1,800,000   │
│  Rent Relief       ₦400,000     │
│  Pension           ₦576,000     │
│  Total Deductions  ₦2,776,000   │
│                                  │
│  TAXABLE INCOME   ₦4,424,000    │
│                                  │
│  TAX COMPUTATION                 │
│  Band 1 (0%)      ₦0            │
│  Band 2 (15%)     ₦210,000      │
│  Band 3 (18%)     ₦400,320      │
│  Gross Tax         ₦610,320     │
│                                  │
│  CREDITS                         │
│  WHT Credits      −₦180,000     │
│                                  │
│  NET PAYABLE      ₦430,320      │
│                                  │
│  ┌─ TIP CARD (primary-light) ─┐ │
│  │ 💡 You can still make       │ │
│  │ amendments after generation.│ │
│  └─────────────────────────────┘ │
│                                  │
│  [Go Back to Fix]   [Generate]   │
└──────────────────────────────────┘
```

- Amber callout: `warning` background at 10% opacity, `warning` border-left
- Section headers: `heading-md`, `neutral-900`
- Amounts: `mono` typography, right-aligned
- Net payable: `heading-lg`, `primary` if > 0, `success` if nil return
- Tip card: `primary-light` background, `body-sm` text

### 4.4 Self-Assessment Preview Screen

**Layout:** Document-style with formal appearance

```
┌──────────────────────────────────┐
│  ← Self-Assessment     [⬇ PDF]  │
├──────────────────────────────────┤
│  ┌──────────────────────────┐   │
│  │  FEDERAL INLAND REVENUE  │   │  (document header)
│  │  SERVICE                 │   │
│  │  SELF-ASSESSMENT FORM    │   │
│  │  Tax Year: 2026          │   │
│  │                          │   │
│  │  TAXPAYER DETAILS        │   │
│  │  Name: Amaka Okafor      │   │
│  │  NIN: •••••••1234        │   │
│  │  TIN: 12345678-0001      │   │
│  │  Entity: Individual      │   │
│  │                          │   │
│  │  INCOME SCHEDULE         │   │
│  │  ... (itemised)          │   │
│  │                          │   │
│  │  DEDUCTIONS & RELIEFS    │   │
│  │  ... (itemised)          │   │
│  │                          │   │
│  │  TAX COMPUTATION         │   │
│  │  ... (bands, min tax)    │   │
│  │                          │   │
│  │  CREDITS                 │   │
│  │  WHT: ₦180,000          │   │
│  │                          │   │
│  │  NET TAX PAYABLE         │   │
│  │  ₦430,320               │   │
│  └──────────────────────────┘   │
│                                  │
│  [Download PDF]  [Continue →]    │
└──────────────────────────────────┘
```

- Document container: `white` background, 1px `neutral-100` border, subtle drop shadow
- Formal section headers with horizontal rules
- NIN masked in preview; full NIN in downloadable PDF
- Monospace figures throughout

### 4.5 Submission Guide Screen

**Layout:** Vertical stepper

**Layout & Scroll Behavior:**
- **Step navigation:** Sticky step indicator at top (or collapsible) — user can see progress (Step X of 5) and jump to any step while scrolling long content. Steps remain navigable without losing context.

```
┌──────────────────────────────────┐
│  ← Submission Guide              │
├──────────────────────────────────┤
│                                   │
│  ● Step 1: Submit via TaxPro Max │  (expanded, active)
│  │  Log in and upload your       │
│  │  self-assessment form.        │
│  │                               │
│  │  [Open TaxPro Max ↗]         │
│  │  [Mark as Submitted ✓]       │
│  │                               │
│  ○ Step 2: Make Payment          │  (collapsed)
│  │                               │
│  ○ Step 3: Upload Receipt        │  (collapsed)
│  │                               │
│  ○ Step 4: Obtain TCC            │  (collapsed)
│  │                               │
│  ○ Step 5: Store Records         │  (collapsed)
│                                   │
└──────────────────────────────────┘
```

- Active step: filled circle (`primary`), expanded content
- Completed step: checkmark circle (`success`), collapsed
- Future step: hollow circle (`neutral-500`), collapsed
- Vertical line connecting steps: `neutral-100`
- Deep link buttons: `accent` colour, external link icon
- Copy-to-clipboard: icon button, shows "Copied!" toast on tap

### 4.6 Platform Behaviour

| Behaviour | Mobile | Web |
|-----------|--------|-----|
| PDF Preview | Scrollable card within app | Scrollable card or iframe |
| PDF Download | Share sheet / save to Files | Browser download dialog |
| File Upload | Camera / Files app picker | Drag-and-drop + file picker |
| Deep Links | Opens external browser | New tab |
| Copy to Clipboard | System clipboard + haptic | System clipboard + tooltip |

### 4.7 Status Badges

| Status | Label | Colour | Background |
|--------|-------|--------|------------|
| draft | Draft | `neutral-500` | `neutral-100` |
| generated | Generated | `accent` | `#EBF4FF` (accent at 10%) |
| submitted | Submitted | `warning` | `#FFFFF0` (warning at 10%) |
| payment_pending | Payment Pending | `warning` | `#FFFFF0` |
| payment_confirmed | Payment Confirmed | `success` | `#F0FFF4` (success at 10%) |
| tcc_obtained | TCC Obtained | `success` | `#F0FFF4` |

---

## 5. Functional Requirements

### 5.1 Filing Checklist Logic

| ID | Requirement | Details |
|----|-------------|---------|
| FR-601 | **Checklist computation** | `tax.getFilingChecklist` computes status for each item by querying relevant data: users (NIN/TIN), entities (type), connectedAccounts (import completeness), transactions (uncategorised count, review status), taxDeclarations (rent, reliefs), invoices (match status), whtCredits. |
| FR-602 | **Readiness calculation** | `readinessPercent = (doneItems / totalItems) × 100`, rounded to nearest integer. All items weighted equally. |
| FR-603 | **Gate at ≥90%** | "Start Filing Review" CTA requires `readinessPercent >= 90`. Enforced both client-side (button disable) and server-side (`filing.initiate` validates). |
| FR-604 | **Reactive updates** | Checklist query is reactive — when user fixes an issue (e.g. categorises transactions), returning to checklist shows updated status without manual refresh. |

### 5.2 Checklist Items — Complete Specification

| Item ID | Group | Label | Done When | Needs Attention When | Missing When |
|---------|-------|-------|-----------|---------------------|--------------|
| CK-01 | Identity | NIN/TIN on file | `users.nin` is set | — | `users.nin` is null/empty |
| CK-02 | Identity | Tax entity type confirmed | `entities.type` is set on active entity | — | No active entity or type not set |
| CK-03 | Income | All bank accounts imported | All connectedAccounts have `status: "active"` and `lastSyncedAt` within 30 days | At least 1 account with `status: "error"` or `lastSyncedAt` > 30 days ago | No connected accounts at all |
| CK-04 | Income | All foreign income converted | No transactions with missing `amountNgn` where `currency !== "NGN"` | Some foreign transactions with `fxRateApproximated: true` | Foreign transactions exist without `amountNgn` |
| CK-05 | Income | Income sources reviewed | User has explicitly confirmed income review (flag on filing record or declarations) | — | Income not yet reviewed/confirmed |
| CK-06 | Expenses | All transactions categorised | `uncategorisedCount === 0` | `uncategorisedCount > 0 && uncategorisedCount <= 10` | `uncategorisedCount > 10` |
| CK-07 | Expenses | Business expenses verified | Business expense total confirmed by user | — | Not yet verified |
| CK-08 | Expenses | Rent paid amount confirmed | `taxDeclarations.annualRentPaid` is set (including 0) | — | Rent amount not declared |
| CK-09 | Invoices | All invoices matched | All issued invoices matched to income transactions | Some invoices unmatched | No invoice matching attempted |
| CK-10 | Invoices | WHT credits recorded | WHT credits sum > 0 or user confirmed "no WHT" | — | WHT status unknown |

### 5.3 Filing Record Lifecycle

| ID | Requirement | Details |
|----|-------------|---------|
| FR-605 | **Initiation** | `filing.initiate` creates a filing record with status "draft", `netTaxPayable: 0`, `taxSummarySnapshot: "{}"`, `isNilReturn: false`. If record already exists for entity + taxYear, returns existing record. |
| FR-606 | **Uniqueness** | One filing record per entity per tax year. Enforced by `by_entityId_taxYear` index with unique constraint. |
| FR-607 | **Status transitions** | Only valid transitions allowed (see US-613 table). Invalid transitions throw error. |
| FR-608 | **Immutable snapshot** | Once `taxSummarySnapshot` is written during generation, it is the authoritative record. It can only be overwritten by re-generation (which also generates a new PDF). The snapshot is never modified in-place. |
| FR-609 | **Re-generation rules** | Re-generation allowed only when `status in ["draft", "generated"]`. After "submitted", re-generation is blocked. |

### 5.4 Self-Assessment Generation

| ID | Requirement | Details |
|----|-------------|---------|
| FR-610 | **Snapshot capture** | `taxSummarySnapshot = JSON.stringify(tax.getSummary(entityId, taxYear))`. Captures complete `TaxEngineOutput` including `pit`, `cit`, `cgt`, `vat`, `totalTaxPayable`, `uncategorisedCount`, `fxRateApproximated`, `engineVersion`, `computedAt`. |
| FR-611 | **PDF generation** | Call NestJS service: `POST /pdf/self-assessment` with body `{ snapshot: TaxEngineOutput, taxpayer: { name, nin, tin, address, entityType } }`. Service returns PDF binary. |
| FR-612 | **PDF storage** | Store returned PDF in Convex Storage via `storage.store(pdfBlob)`; set `selfAssessmentPdfId` on filing record. |
| FR-613 | **Timeout handling** | PDF service call timeout: 30 seconds. On timeout: return error, do not update filing record status. Snapshot is still captured (so retry can use it). |
| FR-614 | **Idempotency** | If `filing.generateSelfAssessment` is called again for the same record, it replaces the snapshot and PDF. Previous PDF is deleted from storage. |

### 5.5 Document Uploads

| ID | Requirement | Details |
|----|-------------|---------|
| FR-615 | **File types** | Payment receipts and TCC documents: JPG, PNG, PDF only. |
| FR-616 | **File size** | Maximum 10MB per upload. Enforced client-side and server-side. |
| FR-617 | **Storage** | Files stored in Convex Storage. Storage IDs saved on filing record. |
| FR-618 | **Replacement** | Re-uploading replaces the existing document. Old storage file is deleted. |

### 5.6 Nil Return Handling

| ID | Requirement | Details |
|----|-------------|---------|
| FR-619 | **Detection** | Nil return when `TaxEngineOutput.totalTaxPayable === 0`. |
| FR-620 | **Filing obligation** | Nil returns still require full filing process: checklist, review, generation, submission. |
| FR-621 | **PDF content** | Self-assessment PDF for nil returns includes all figures; clearly marked as nil return. |
| FR-622 | **Payment skip** | Nil returns skip payment steps in Submission Guide. Status transitions: submitted → payment_confirmed (auto). |
| FR-623 | **TCC** | TCC is still obtainable for nil returns; user can upload. |

### 5.7 Filing Deadline & Reminders

| ID | Requirement | Details |
|----|-------------|---------|
| FR-624 | **Deadline** | March 31 of year following tax year. For 2026 tax year: deadline is March 31, 2027. |
| FR-625 | **Countdown** | Filing screen shows "X days to filing deadline" when within 90 days. Colour escalation: > 30 days = `neutral-500`; 14–30 days = `warning`; < 14 days = `danger`. |
| FR-626 | **Overdue indicator** | If current date > deadline and filing status is not "submitted" or beyond: show "OVERDUE — Late filing penalties may apply" in `danger`. |

---

## 6. API Requirements (Convex Functions)

### 6.1 Filing Domain (`convex/filing/`)

| Function | Type | Description |
|----------|------|-------------|
| `filing.getRecord` | **Query** | Returns the current filing record for `entityId` + `taxYear`. Returns `null` if no record exists. |
| `filing.listByEntity` | **Query** | Returns all filing records for an entity, ordered by `taxYear` descending. Used for Filing History. |
| `filing.initiate` | **Mutation** | Creates a new filing record in "draft" status for `entityId` + `taxYear`. If one already exists, returns it unchanged. Validates user owns entity. |
| `filing.generateSelfAssessment` | **Action** | Core generation flow: snapshots tax summary → calls NestJS PDF service → stores PDF → updates record to "generated". See §6.2 for detailed contract. |
| `filing.markSubmitted` | **Mutation** | Sets status to "submitted", records `submittedAt` timestamp. For nil returns, auto-advances to "payment_confirmed". Validates current status is "generated". |
| `filing.uploadPaymentReceipt` | **Mutation** | Accepts `storageId` from client upload. Sets `paymentReceiptId` on filing record. Advances status to "payment_confirmed". Validates current status is "submitted" or "payment_pending". |
| `filing.uploadTcc` | **Mutation** | Accepts `storageId` from client upload. Sets `tccDocumentId` on filing record. Advances status to "tcc_obtained". Validates current status is "payment_confirmed". |
| `filing.getSnapshotData` | **Query** | Parses `taxSummarySnapshot` JSON and returns typed `TaxEngineOutput` for display on Preview screen. Avoids client-side parsing of large JSON. |

### 6.2 filing.generateSelfAssessment — Detailed Contract

**Args:**
```typescript
{
  entityId: Id<"entities">;
  taxYear: number;
}
```

**Returns:**
```typescript
{
  success: boolean;
  filingRecordId: Id<"filingRecords">;
  pdfStorageId: string;
  netTaxPayable: number;
  isNilReturn: boolean;
}
```

**Behaviour (Action — can call external services):**
1. Validate user owns entity
2. Retrieve or create filing record (must be in "draft" or "generated" status)
3. Call `tax.getSummary(entityId, taxYear)` internally to get live `TaxEngineOutput`
4. If `TaxEngineOutput` is null → throw error "No tax data available"
5. Fetch taxpayer details: user name, NIN (decrypted), TIN, entity address, entity type
6. Build PDF request payload:
   ```typescript
   {
     snapshot: TaxEngineOutput,
     taxpayer: {
       fullName: string,
       nin: string,       // decrypted for PDF
       tin?: string,
       entityType: string,
       entityName: string,
       address?: string,
     },
     taxYear: number,
     isNilReturn: boolean,
   }
   ```
7. Call NestJS PDF service: `POST /pdf/self-assessment` with 30s timeout
8. On PDF service success:
   - Store PDF blob in Convex Storage → `pdfStorageId`
   - If previous PDF exists, delete old storage entry
   - Update filing record:
     - `taxSummarySnapshot = JSON.stringify(TaxEngineOutput)`
     - `selfAssessmentPdfId = pdfStorageId`
     - `netTaxPayable = TaxEngineOutput.totalTaxPayable`
     - `isNilReturn = (TaxEngineOutput.totalTaxPayable === 0)`
     - `engineVersion = TaxEngineOutput.engineVersion`
     - `generatedAt = Date.now()`
     - `status = "generated"`
9. On PDF service failure: throw error (filing record unchanged)

### 6.3 Tax Summary Domain (Consumed by Filing — defined in PRD-3)

| Function | Type | Description |
|----------|------|-------------|
| `tax.getSummary` | **Query** | Returns live `TaxEngineOutput` for entity + tax year. Used by Pre-Filing Review and snapshotted during generation. |
| `tax.getFilingChecklist` | **Query** | Returns `FilingChecklist` with readiness percent and grouped items. Queries: users, entities, connectedAccounts, transactions, taxDeclarations, invoices. |
| `tax.getWhtCredits` | **Query** | Returns sum of all WHT credits for entity + tax year. |

### 6.4 tax.getFilingChecklist — Detailed Contract

**Args:**
```typescript
{
  entityId: Id<"entities">;
  taxYear: number;
}
```

**Returns:**
```typescript
FilingChecklist
```

**Computation Logic:**
1. **CK-01 (NIN/TIN):** Query `users` → check `nin` is set
2. **CK-02 (Entity type):** Query `entities` → check `type` is set
3. **CK-03 (Bank accounts):** Query `connectedAccounts` for entity → check all active and recently synced
4. **CK-04 (Foreign income):** Query `transactions` where `currency !== "NGN"` → check all have `amountNgn`
5. **CK-05 (Income reviewed):** Check filing record or taxDeclarations for `incomeReviewed` flag
6. **CK-06 (Categorisation):** Count transactions where category is null → compare to thresholds
7. **CK-07 (Business expenses):** Check filing record or declarations for `expensesVerified` flag
8. **CK-08 (Rent):** Query `taxDeclarations` → check `annualRentPaid` is set
9. **CK-09 (Invoices):** Query invoices → check all have matched transactions
10. **CK-10 (WHT):** Query WHT credits sum or check `whtConfirmed` flag

### 6.5 Files (`convex/files/`)

| Function | Type | Description |
|----------|------|-------------|
| `files.generateUploadUrl` | **Mutation** | Returns a Convex Storage upload URL for client-side file upload (payment receipt, TCC) |

### 6.6 NestJS PDF Service (External)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/pdf/self-assessment` | POST | Accepts tax summary JSON + taxpayer details → returns NRS-format self-assessment PDF |

**Request Body:**
```typescript
{
  snapshot: TaxEngineOutput;
  taxpayer: {
    fullName: string;
    nin: string;
    tin?: string;
    entityType: string;
    entityName: string;
    address?: string;
  };
  taxYear: number;
  isNilReturn: boolean;
}
```

**Response:** Binary PDF (`application/pdf`)

**Timeout:** 30 seconds  
**PDF Format:** Mirrors official FIRS/NRS self-assessment form layout with all schedules.

---

## 7. Data Models

### 7.1 filingRecords Table (Convex Schema)

```typescript
filingRecords: defineTable({
  entityId:              v.id("entities"),
  userId:                v.id("users"),
  taxYear:               v.number(),
  status:                v.union(
                           v.literal("draft"),
                           v.literal("generated"),
                           v.literal("submitted"),
                           v.literal("payment_pending"),
                           v.literal("payment_confirmed"),
                           v.literal("tcc_obtained"),
                         ),
  selfAssessmentPdfId:   v.optional(v.string()),
  paymentReceiptId:      v.optional(v.string()),
  tccDocumentId:         v.optional(v.string()),
  submittedAt:           v.optional(v.number()),
  netTaxPayable:         v.number(),
  taxSummarySnapshot:    v.string(),
  generatedAt:           v.optional(v.number()),
  engineVersion:         v.optional(v.string()),
  isNilReturn:           v.boolean(),
})
  .index("by_entityId_taxYear", ["entityId", "taxYear"])
  .index("by_userId", ["userId"])
  .index("by_status", ["status"]),
```

### 7.2 Status Lifecycle

```
                    ┌─────────┐
                    │  (none)  │
                    └────┬─────┘
                         │ filing.initiate
                         ▼
                    ┌─────────┐
              ┌────►│  draft   │
              │     └────┬─────┘
              │          │ filing.generateSelfAssessment
              │          ▼
              │     ┌───────────┐
              └─────│ generated  │◄──── re-generate (replaces snapshot + PDF)
                    └────┬──────┘
                         │ filing.markSubmitted
                         ▼
                    ┌───────────┐
                    │ submitted  │
                    └────┬──────┘
                         │
              ┌──────────┴──────────┐
              │                     │
         (has payment)        (nil return)
              │                     │
              ▼                     │
     ┌─────────────────┐           │
     │ payment_pending  │           │
     └────┬─────────────┘           │
          │ receipt uploaded         │
          ▼                         ▼
     ┌─────────────────────┐
     │ payment_confirmed    │◄──────┘
     └────┬─────────────────┘
          │ TCC uploaded
          ▼
     ┌──────────────┐
     │ tcc_obtained  │  (terminal)
     └──────────────┘
```

### 7.3 Immutable Snapshot Design

The `taxSummarySnapshot` field is the cornerstone of TaxEase's audit trail:

1. **Creation:** `JSON.stringify(TaxEngineOutput)` at the moment `filing.generateSelfAssessment` executes
2. **Contents:** Complete `TaxEngineOutput` including all PIT bands, reliefs, CIT, CGT, VAT, credits, engine version, and computation timestamp
3. **Immutability:** The snapshot is never modified after creation. If the user re-generates, the entire snapshot is replaced (not patched)
4. **Consistency:** The self-assessment PDF is generated from this exact snapshot data — the PDF and snapshot always match
5. **Independence:** After snapshot creation, changes to transactions, declarations, or engine version do not affect the filing record. The user must explicitly re-generate to pick up changes
6. **Parsing:** `JSON.parse(taxSummarySnapshot)` returns a `TaxEngineOutput` object. The `filing.getSnapshotData` query handles this server-side

**Storage size estimate:** A typical `TaxEngineOutput` JSON is 2–5KB. With 6 PIT bands, reliefs, and optional CIT/CGT/VAT sections, maximum ~10KB.

### 7.4 Indexes

| Index | Fields | Purpose |
|-------|--------|---------|
| `by_entityId_taxYear` | `[entityId, taxYear]` | Primary lookup — one record per entity per year |
| `by_userId` | `[userId]` | List all filings for a user (across entities) |
| `by_status` | `[status]` | Admin/analytics queries by status |

### 7.5 Related Tables (from other PRDs)

| Table | Relationship | Purpose in Filing |
|-------|-------------|-------------------|
| `users` | `userId` → `users._id` | Taxpayer name, NIN, TIN for self-assessment |
| `entities` | `entityId` → `entities._id` | Entity type, name, TIN, VAT status |
| `transactions` | Queried by `entityId` + `taxYear` | Checklist: uncategorised count, categorisation status |
| `connectedAccounts` | Queried by `entityId` | Checklist: import completeness |
| `taxDeclarations` | Queried by `entityId` + `taxYear` | Checklist: rent, reliefs declared |
| `invoices` | Queried by `entityId` + `taxYear` | Checklist: invoice matching, WHT status |
| `taxYearSummaries` | Queried by `entityId` + `taxYear` | Cached tax summary (optional, live query preferred) |

---

## 8. Non-Goals

The following are **explicitly out of scope** for PRD-6:

| Item | Reason |
|------|--------|
| **Direct FIRS/NRS API submission** | No programmatic API to FIRS exists. Users submit manually via TaxPro Max. |
| **Payment processing** | TaxEase does not process tax payments. Users pay via bank transfer or NRS portal. |
| **Automated TCC retrieval** | No API for TCC status. Users upload TCC manually. |
| **Amendment filing after submission** | v1: re-generation only before submission. Post-submission amendments are manual. |
| **Multi-year bulk filing** | Each tax year filed individually. |
| **Filing on behalf of other users** | Tax agents / accountant delegation is a future feature. |
| **Real-time FIRS status tracking** | No integration with FIRS systems for submission status. |
| **E-signature on self-assessment** | PDF is unsigned; user signs on TaxPro Max portal. |
| **Penalty payment via app** | Penalty calculator is informational only (PRD-3). |
| **Push notifications for filing reminders** | Reminder logic defined here; delivery via PRD-9. |

---

## 9. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Filing completion rate** | ≥ 60% of users who start checklist reach "submitted" status | `filingRecords` where status ≥ "submitted" / total records |
| **Checklist to generation time** | Median < 15 minutes from first checklist view to self-assessment generation | Timestamp diff: first `tax.getFilingChecklist` call to `generatedAt` |
| **Self-assessment generation success** | ≥ 98% of generation attempts succeed | Successful `filing.generateSelfAssessment` / total attempts |
| **PDF download rate** | ≥ 80% of users with "generated" status download the PDF | Download event / records with status ≥ "generated" |
| **Submission guide completion** | ≥ 50% of users who generate reach "submitted" | `filingRecords` status "submitted" or beyond / status "generated" or beyond |
| **TCC upload rate** | ≥ 30% of submitted filings reach "tcc_obtained" within 90 days | Status "tcc_obtained" / status ≥ "submitted" (90-day window) |
| **Nil return filing** | 100% of nil-return users can complete the flow without confusion | User testing: nil return flow completes without errors or support tickets |
| **Snapshot integrity** | 0 instances of snapshot modification after generation | Audit log: no updates to `taxSummarySnapshot` outside of `generateSelfAssessment` |
| **Filing before deadline** | ≥ 80% of filings submitted before March 31 | `submittedAt` < deadline timestamp |
| **User confidence** | Post-filing survey: "I felt confident filing with TaxEase" ≥ 85% agree | In-app survey after TCC upload |

---

## 10. Open Questions

| # | Question | Owner |
|---|----------|-------|
| 1 | **FIRS PDF format:** Do we have access to the official NRS self-assessment form template? The PDF service needs to produce an exact replica. If not, design a professional approximation and validate with a tax professional. | Product / Design |
| 2 | **Re-generation after submission:** Should users be able to re-generate after marking as submitted? Current spec blocks it. Consider: user submitted wrong PDF and needs to correct. Possible solution: "Withdraw submission" action that resets to "generated". | Product |
| 3 | **Snapshot archival:** When re-generating, should the previous snapshot be archived (e.g. `snapshotHistory` array) or deleted? Archival provides audit trail of amendments; deletion keeps the record simple. | Engineering / Compliance |
| 4 | **Payment receipt validation:** Should we attempt to extract payment amount from the receipt (OCR) and validate against `netTaxPayable`? Or is manual upload sufficient for v1? | Product |
| 5 | **TaxPro Max deep link:** What is the exact URL for the TaxPro Max filing portal? Does it support pre-filled parameters (TIN, tax year)? | Engineering |
| 6 | **NRS Collection Account details:** What are the official payment account details to display in Step 2? Are there multiple banks? Does it vary by state? | Product / Tax Advisor |
| 7 | **Checklist item weights:** Should all checklist items be weighted equally for readiness calculation? Or should critical items (NIN, categorisation) have higher weight? | Product |
| 8 | **Income review confirmation UX:** How does the user "confirm" they've reviewed their income (CK-05)? Explicit checkbox on a review screen? Or implicit after viewing the breakdown? | Product / Design |
| 9 | **Filing history depth:** How many past tax years should the filing history show? All available? Or limited (e.g. last 6 years per FIRS record retention)? | Product |
| 10 | **Concurrent filing:** Can a user have filing records in progress for multiple entities simultaneously? Current design supports it (one record per entity per year). Confirm UX handles this. | Product / Design |
| 11 | **PDF service hosting:** Is the NestJS PDF service deployed on the same infrastructure as the main app? Latency and reliability implications for the 30s timeout. | Engineering / DevOps |
| 12 | **Offline filing:** Should any part of the filing flow work offline (e.g. viewing a previously generated preview)? Or is online connectivity required throughout? | Product |

---

*End of PRD-6 — Filing Module & Self-Assessment*
