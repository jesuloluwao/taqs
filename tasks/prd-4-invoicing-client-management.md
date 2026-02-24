# PRD-4: Invoicing & Client Management

**TaxEase Nigeria**  
**Version:** 1.0 — February 2026  
**Status:** Draft  
**Priority:** P1 — Can Be Built in Parallel  
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

PRD-4 delivers the invoicing and client management layer for TaxEase Nigeria. Invoicing is the primary income-side workflow for freelancers and SMEs: users create professional invoices, send them to clients via email with a PDF attachment, track payment status, and — critically — have paid invoices automatically generate properly categorised income transactions with WHT (Withholding Tax) fields populated. This is the **invoice-to-transaction bridge** that makes TaxEase's invoicing tax-aware rather than just a billing tool.

Client management provides the address book behind invoicing: users maintain a directory of clients with default currency and WHT rate preferences, so invoice creation is fast and consistent.

### 1.2 Scope

| In Scope | Out of Scope |
|----------|--------------|
| Invoice list with filter tabs and summary bar | Online payment collection (Paystack checkout hosted page) — future |
| Create / edit invoice with line items | Multi-currency conversion at payment time (manual NGN entry in v1) |
| Invoice preview (PDF-style rendered view) | Client portal (client-facing login to view invoices) — future |
| Send invoice via email with PDF attachment | Expense invoices / bills payable |
| Mark invoice as paid (manual + webhook) | Partial payments / payment plans |
| Cancel invoice | Invoice templates library |
| Download invoice as PDF | Bulk invoice creation |
| Share invoice (native share sheet) | Credit notes / refunds |
| Invoice-to-transaction bridge (markPaid → auto-create income transaction with WHT) | Tax invoice compliance (FIRS e-invoicing) — future |
| Recurring invoice setup and auto-generation | Invoice approval workflows |
| Client CRUD (create, read, update, delete) | Client-side payment tracking (e.g. "pay now" button on invoice) |
| Invoice number auto-generation (sequential) | |
| Overdue invoice detection (scheduled) | |
| Payment webhook handling (Paystack, Flutterwave) | |
| Empty states for invoice and client lists | |

### 1.3 Out-of-Box Experience

Upon completion of PRD-4, a user can:

1. **Create a client** with name, email, address, default currency, and default WHT rate
2. **Create an invoice** selecting a client (with autocomplete), adding line items, setting WHT rate and VAT, and saving as draft
3. **Preview the invoice** as a rendered document matching the PDF output
4. **Send the invoice** to the client via email with a generated PDF attachment
5. **Track invoices** across statuses: Draft → Sent → Paid / Overdue / Cancelled
6. **Mark an invoice as paid** (manually or via payment webhook), which automatically creates a correctly categorised income transaction with WHT fields
7. **Set up recurring invoices** that auto-generate on a monthly or quarterly schedule
8. **Manage their client directory** — add, edit, and remove clients
9. **Download or share** any invoice as PDF

### 1.4 Dependencies

- **Depends on:** PRD-0 (users, entities, auth) — must be complete
- **Depends on (partial):** PRD-1 (transaction schema) — transaction table must exist for the markPaid bridge; can start before PRD-1 is fully complete as long as the transaction schema is defined
- **Blocks:** PRD-5 (Dashboard reads invoice status, outstanding totals, overdue count), PRD-6 (Filing reads invoice/WHT reconciliation for self-assessment)

---

## 2. Entities (TypeScript Interfaces)

### 2.1 Client

```typescript
/** Client directory entry — used for invoice creation and tracking */
interface Client {
  _id: Id<"clients">;
  _creationTime: number;
  entityId: Id<"entities">;
  userId: Id<"users">;
  name: string;                               // Client or company name
  email?: string;                             // Invoice delivery email
  address?: string;                           // Billing address
  currency: string;                           // Default invoice currency (ISO 4217)
  whtRate?: number;                           // Default WHT rate: 0, 5, or 10
}
```

### 2.2 Invoice

```typescript
/** Invoice issued by the user to a client */
interface Invoice {
  _id: Id<"invoices">;
  _creationTime: number;
  entityId: Id<"entities">;
  userId: Id<"users">;
  clientId?: Id<"clients">;                   // Linked client record
  invoiceNumber: string;                      // Sequential, e.g. "INV-2026-0042"
  status: "draft" | "sent" | "paid" | "overdue" | "cancelled";
  issueDate: number;                          // Unix ms
  dueDate: number;                            // Unix ms
  currency: string;                           // Invoice currency (ISO 4217)
  subtotal: number;                           // Sum of line item totals
  whtAmount: number;                          // Total WHT deducted
  vatAmount: number;                          // VAT charged (if applicable)
  totalDue: number;                           // Amount client should pay (subtotal - whtAmount + vatAmount)
  amountNgn?: number;                         // Naira equivalent at time of payment (for foreign currency invoices)
  paidAt?: number;                            // Unix ms when marked paid
  notes?: string;                             // Free-text note shown on invoice
  isRecurring: boolean;                       // Whether this is a recurring template
  recurringInterval?: "monthly" | "quarterly"; // Recurring schedule
  nextIssueDate?: number;                     // Next auto-generation date (Unix ms)
  pdfStorageId?: string;                      // Convex Storage ID for generated PDF
}
```

### 2.3 InvoiceItem

```typescript
/** Line item on an invoice */
interface InvoiceItem {
  _id: Id<"invoiceItems">;
  _creationTime: number;
  invoiceId: Id<"invoices">;                  // Parent invoice
  description: string;                        // Service or product description
  quantity: number;                           // Quantity
  unitPrice: number;                          // Price per unit in invoice currency
  total: number;                              // quantity × unitPrice
}
```

---

## 3. User Stories

### 3.1 Invoice List & Navigation

#### US-401: View Invoice List

**As a** freelancer or SME owner  
**I want** to see all my invoices in a filterable list with a summary bar  
**So that** I can track my billing activity, outstanding amounts, and payment status at a glance.

**Trigger:** User navigates to Invoices from side drawer or taps "Go to Invoices" from Dashboard.

**Flow:**
1. User lands on Invoice List screen
2. Summary bar loads at the top showing: "Total Outstanding: ₦X" and "Total Paid (This Year): ₦Y"
3. Filter tabs display: All | Draft | Sent | Paid | Overdue
4. Default tab is "All"; invoices load for the active entity, sorted by issue date (newest first)
5. Each invoice row shows: client name + invoice number (left), issue date + due date (centre), amount + status badge (right)
6. Status badges use colour coding: Draft (grey `#718096`), Sent (blue `#2B6CB0`), Paid (green `#38A169`), Overdue (red `#E53E3E`)
7. User can tap a filter tab to narrow the list
8. User can tap an invoice row to navigate to Invoice Preview
9. Header has "+ New Invoice" button (top-right)

**Acceptance Criteria:**
- [ ] Summary bar shows accurate totals computed from invoices for the active entity and current tax year
- [ ] "Total Outstanding" sums `totalDue` for invoices with status "sent" or "overdue"
- [ ] "Total Paid (This Year)" sums `totalDue` for invoices with status "paid" and `paidAt` in current tax year
- [ ] Filter tabs correctly filter invoices by status
- [ ] "All" tab shows all non-cancelled invoices (or includes cancelled with visual distinction)
- [ ] Invoice rows display all required fields: client name, invoice number, issue date, due date, amount, status badge
- [ ] Status badge colours match design tokens
- [ ] Tapping a row navigates to Invoice Preview for that invoice
- [ ] "+ New Invoice" navigates to Create Invoice screen
- [ ] List is paginated (25 per page) with scroll-to-load-more
- [ ] Data is scoped to the active entity

---

#### US-402: View Invoice List — Empty State

**As a** user with no invoices  
**I want** to see a helpful empty state  
**So that** I know how to create my first invoice.

**Trigger:** User has zero invoices for the active entity.

**Flow:**
1. User lands on Invoice List
2. Summary bar shows: "Total Outstanding: ₦0" and "Total Paid (This Year): ₦0"
3. Empty state displays: illustration of a document, headline "No invoices yet", subtext "Create your first invoice to start billing clients and tracking payments.", primary CTA button "Create Invoice"
4. CTA navigates to Create Invoice screen

**Acceptance Criteria:**
- [ ] Empty state appears when invoice count is 0 for the active entity
- [ ] Illustration, headline, subtext, and CTA are displayed
- [ ] "Create Invoice" CTA navigates to Create Invoice screen
- [ ] Summary bar still visible with zero values

---

### 3.2 Invoice CRUD

#### US-403: Create Invoice

**As a** freelancer or SME owner  
**I want** to create a professional invoice with line items, WHT, and VAT  
**So that** I can bill my client accurately and have the tax fields ready for my records.

**Trigger:** User taps "+ New Invoice" on Invoice List or "Create Invoice" on empty state.

**Flow:**
1. User lands on Create Invoice screen — a scrollable form with 5 sections
2. **Section 1 — Invoice Details:**
   - Invoice number auto-populated (e.g. "INV-2026-0001"); user can edit if needed
   - Issue date defaults to today; user can change via date picker
   - Due date defaults to 30 days from issue date; user can change via date picker
   - Currency selector: NGN (default) / USD / GBP / EUR
3. **Section 2 — Client:**
   - Client name field with autocomplete from existing clients
   - If user selects an existing client: email, address, currency, and WHT rate auto-populate from client record
   - If user types a new name: email and address fields appear for manual entry
   - Client email field (required for sending; optional for draft)
   - Client address field (optional)
4. **Section 3 — Line Items:**
   - First row pre-populated (empty): Description | Quantity (default 1) | Unit Price | Total (auto-calculated)
   - User fills in description and unit price; total = quantity × unit price (live calculation)
   - "Add Line Item" button adds another row
   - Each row has a delete (×) button (minimum 1 row required)
   - WHT rate selector below line items: 0% (default) / 5% / 10%
   - If WHT > 0%, WHT amount is computed as: subtotal × (whtRate / 100)
5. **Section 4 — Totals (auto-calculated, live-updating):**
   - Subtotal: sum of all line item totals
   - WHT Deducted: subtotal × whtRate% (shown as negative value if > 0)
   - VAT: if entity is VAT-registered and turnover exceeds threshold, VAT = subtotal × 7.5% (otherwise 0)
   - Total Due: subtotal − whtAmount + vatAmount
6. **Section 5 — Notes:**
   - Optional free-text field for payment terms, thank-you notes, etc.
7. **Footer actions:**
   - "Save as Draft" — saves invoice with status "draft"
   - "Preview Invoice" — saves as draft, navigates to Invoice Preview
   - "Send Invoice" — saves, generates PDF, sends email, status → "sent"
8. On "Save as Draft": `invoices.create` mutation called with all fields + line items; invoice number atomically generated; toast "Invoice saved as draft"
9. On success, user returns to Invoice List or stays on the created invoice

**Acceptance Criteria:**
- [ ] Invoice number auto-generated via `invoices.generateNumber` (format: INV-{YEAR}-{NNNN})
- [ ] Invoice number is editable but validated for uniqueness within the entity
- [ ] Issue date defaults to today; due date defaults to 30 days from issue date
- [ ] Currency selector includes NGN, USD, GBP, EUR
- [ ] Client autocomplete searches existing clients by name
- [ ] Selecting an existing client populates email, address, currency, and WHT rate defaults
- [ ] New client name creates a new client record on invoice save
- [ ] At least 1 line item is required
- [ ] Line item total auto-calculates as quantity × unitPrice
- [ ] Subtotal, WHT, VAT, and Total Due auto-calculate in real-time
- [ ] WHT rate selector allows 0%, 5%, or 10%
- [ ] VAT auto-applied only if entity is VAT-registered (from `entities.vatRegistered` and `entities.vatThresholdExceeded`)
- [ ] VAT rate is 7.5% per Nigerian tax law
- [ ] "Save as Draft" creates invoice with status "draft"
- [ ] "Preview Invoice" saves draft and navigates to preview
- [ ] "Send Invoice" generates PDF, sends email, sets status to "sent"
- [ ] All required fields validated before save (at minimum: issue date, due date, ≥1 line item with description and unitPrice > 0)
- [ ] If client is selected and has no email, "Send Invoice" is disabled with tooltip "Client email required to send"
- [ ] **Validation timing:** Required fields validated on submit; inline errors shown for invalid fields (e.g. empty required, invalid amount). Optional: validate on blur for faster feedback.
- [ ] **Form save behavior:** Explicit save required; no auto-save. Dirty form warning on back/cancel: "You have unsaved changes. Discard?"

---

#### US-404: Edit Invoice (Draft Only)

**As a** user  
**I want** to edit a draft invoice  
**So that** I can correct details before sending.

**Trigger:** User taps "Edit" on Invoice Preview screen (only available for draft invoices).

**Flow:**
1. User taps "Edit" on a draft invoice's preview screen
2. Create/Edit Invoice screen opens pre-populated with all existing invoice data and line items
3. User makes changes to any field (client, line items, dates, WHT rate, notes, etc.)
4. Totals recalculate live
5. User taps "Save as Draft" to update, or "Send Invoice" to save + send
6. `invoices.update` mutation called; line items replaced (delete old, insert new)
7. Success toast: "Invoice updated"

**Acceptance Criteria:**
- [ ] Only invoices with status "draft" are editable
- [ ] "Sent", "paid", "overdue", and "cancelled" invoices show "Edit" as disabled or hidden
- [ ] All fields pre-populated from existing invoice data
- [ ] Line items load correctly and can be added/removed/modified
- [ ] Totals recalculate on any change
- [ ] `invoices.update` persists all changes including replaced line items
- [ ] Invoice number cannot be changed to conflict with an existing number

---

#### US-405: View Invoice Detail / Preview

**As a** user  
**I want** to see a professional preview of my invoice  
**So that** I can verify it looks correct before sending or sharing.

**Trigger:** User taps an invoice row in Invoice List, or taps "Preview Invoice" during creation.

**Flow:**
1. User lands on Invoice Preview screen
2. Rendered document displays:
   - **Header:** Business name (from entity), logo (if uploaded), contact details (user email/phone) — top-right
   - **Invoice heading:** "INVOICE" label, invoice number, issue date, due date — top-left
   - **Client section:** Client name, email, address (if provided)
   - **Line items table:** Description | Qty | Unit Price | Total (for each item)
   - **Totals section:** Subtotal, WHT Deducted (if > 0), VAT (if > 0), Total Due (bold)
   - **Payment details:** Bank name, account number, sort code (from user profile or entity, if configured)
   - **Notes:** Free-text notes (if provided)
   - **Status badge:** Current status displayed prominently
3. Actions bar at bottom:
   - "Edit" (only for draft status)
   - "Download PDF" (always available)
   - "Share" (native share sheet on mobile, copy link on web)
   - "Send to Client" (available for draft and sent statuses; re-sends for sent)
   - "Mark as Paid" (available for sent and overdue statuses)
   - "Cancel Invoice" (available for draft and sent statuses)

**Acceptance Criteria:**
- [ ] Preview renders all invoice sections matching the PDF layout
- [ ] Business name and contact details pulled from the entity/user profile
- [ ] Client details rendered correctly
- [ ] Line items table is formatted and totals align
- [ ] Totals section shows subtotal, WHT (if applicable), VAT (if applicable), and total due
- [ ] Payment details section shows bank info if user has configured it
- [ ] Status badge visible with correct colour
- [ ] Action buttons conditionally visible based on invoice status
- [ ] "Edit" only visible for "draft" status
- [ ] "Mark as Paid" only visible for "sent" or "overdue" status
- [ ] "Cancel Invoice" only visible for "draft" or "sent" status
- [ ] Document is scrollable and resembles PDF output

---

#### US-406: Send Invoice

**As a** user  
**I want** to send an invoice to my client via email  
**So that** the client receives a professional PDF invoice and I can track the sent status.

**Trigger:** User taps "Send Invoice" on Create Invoice form or "Send to Client" on Invoice Preview.

**Flow:**
1. User taps "Send Invoice" or "Send to Client"
2. System validates: client email is present; at least 1 line item exists
3. If validation fails: show inline error (e.g. "Client email is required to send the invoice")
4. If validation passes: loading state shown ("Generating invoice…")
5. `invoices.send` action is called:
   a. Invoice data assembled (invoice fields + line items + entity/user info)
   b. POST to NestJS PDF service (`/pdf/invoice`) with invoice JSON → receive PDF buffer
   c. PDF stored in Convex Storage; `pdfStorageId` set on invoice
   d. Email sent via Resend to client email with:
      - Subject: "Invoice {invoiceNumber} from {entityName}"
      - Body: Brief professional message with invoice summary (amount, due date)
      - PDF attachment
   e. Invoice status updated to "sent"
6. Success toast: "Invoice sent to {clientEmail}"
7. User returns to Invoice Preview (now showing "Sent" status) or Invoice List

**Acceptance Criteria:**
- [ ] Client email validated before send
- [ ] PDF generated via NestJS service and stored in Convex Storage
- [ ] Email sent via Resend with PDF attachment to client email
- [ ] Email subject and body are professional and include invoice number, amount, and due date
- [ ] Invoice status changes from "draft" to "sent"
- [ ] `pdfStorageId` set on invoice document
- [ ] Loading state shown during generation and send
- [ ] Success toast displayed on completion
- [ ] If PDF generation fails: error toast "Failed to generate invoice PDF. Please try again."
- [ ] If email send fails: error toast "Failed to send email. Invoice saved as draft." (status remains "draft")
- [ ] Re-sending a "sent" invoice regenerates and re-sends the email (status remains "sent")

---

#### US-407: Mark Invoice as Paid — Invoice-to-Transaction Bridge

**As a** user  
**I want** to mark an invoice as paid  
**So that** my income is automatically recorded as a transaction with the correct WHT amount for tax calculations.

**Trigger:** User taps "Mark as Paid" on Invoice Preview (for sent or overdue invoices).

**Flow:**
1. User taps "Mark as Paid"
2. Confirmation dialog appears: "Mark this invoice as paid? This will record an income transaction of {totalDue} {currency}."
   - Optional: "Amount received (NGN)" field — pre-filled with `totalDue` for NGN invoices; required for foreign currency invoices to record the Naira equivalent
   - "Confirm" and "Cancel" buttons
3. User taps "Confirm"
4. `invoices.markPaid` mutation is called, which performs the following atomically:
   a. **Update invoice:** status → "paid", `paidAt` → current timestamp, `amountNgn` → entered amount (if foreign currency)
   b. **Create income transaction** in the `transactions` table with:
      - `entityId`: same as invoice
      - `userId`: same as invoice
      - `date`: `paidAt` timestamp
      - `description`: "Invoice {invoiceNumber} — {clientName}"
      - `amount`: invoice `totalDue` (the amount the client actually pays)
      - `currency`: invoice `currency`
      - `amountNgn`: invoice `amountNgn` (Naira equivalent; for NGN invoices, equals `totalDue`)
      - `direction`: "credit"
      - `type`: "income"
      - `categoryId`: system category "Freelance/Client Income" (or most appropriate income category)
      - `isDeductible`: false (income is not deductible)
      - `deductiblePercent`: 0
      - `whtDeducted`: invoice `whtAmount` (the WHT the client withheld)
      - `whtRate`: the WHT rate from the invoice (0, 5, or 10)
      - `invoiceId`: the invoice `_id` (links transaction back to invoice)
      - `notes`: "Auto-created from invoice {invoiceNumber}"
      - `taxYear`: derived from `paidAt` date
      - `reviewedByUser`: true (system-generated, considered reviewed)
      - `isDuplicate`: false
   c. **If client exists and has no email** (payment discovered via webhook), still create the transaction
5. Success toast: "Invoice marked as paid. Income transaction created."
6. Invoice Preview updates to show "Paid" status badge (green)
7. Invoice List summary bar updates: outstanding decreases, paid increases
8. The new transaction appears in the Transaction List (PRD-1)

**Acceptance Criteria:**
- [ ] Confirmation dialog shown before marking paid
- [ ] For foreign currency invoices, user must enter the NGN equivalent amount received
- [ ] Invoice status changes to "paid"
- [ ] `paidAt` timestamp recorded
- [ ] Income transaction created atomically in same mutation
- [ ] Transaction `amount` equals invoice `totalDue`
- [ ] Transaction `whtDeducted` equals invoice `whtAmount`
- [ ] Transaction `whtRate` equals the WHT rate used on the invoice
- [ ] Transaction `invoiceId` links back to the invoice
- [ ] Transaction `type` is "income"
- [ ] Transaction `direction` is "credit"
- [ ] Transaction `categoryId` set to the "Freelance/Client Income" system category
- [ ] Transaction `taxYear` correctly derived from payment date
- [ ] Transaction `amountNgn` set correctly (equals `totalDue` for NGN, or user-entered amount for foreign currency)
- [ ] For NGN invoices, the gross income for tax purposes = `totalDue` + `whtAmount` (the WHT is a credit, not a reduction in income)
- [ ] Already-paid invoices cannot be marked paid again ("Mark as Paid" button hidden)
- [ ] Success toast displayed
- [ ] Invoice List and summary bar reactively update

---

#### US-408: Cancel Invoice

**As a** user  
**I want** to cancel an invoice  
**So that** it is removed from active billing without deleting the record.

**Trigger:** User taps "Cancel Invoice" on Invoice Preview (for draft or sent invoices).

**Flow:**
1. User taps "Cancel Invoice"
2. Confirmation dialog: "Cancel this invoice? This cannot be undone. The invoice will be marked as cancelled." with "Cancel Invoice" (destructive, red) and "Keep Invoice" buttons
3. User taps "Cancel Invoice"
4. `invoices.cancel` mutation: status → "cancelled"
5. Success toast: "Invoice cancelled"
6. User returns to Invoice List; cancelled invoice shows "Cancelled" badge or is filtered out depending on current filter

**Acceptance Criteria:**
- [ ] Only draft and sent invoices can be cancelled
- [ ] Paid and already-cancelled invoices cannot be cancelled
- [ ] Confirmation dialog with destructive styling
- [ ] Status changes to "cancelled"
- [ ] Cancelled invoices still appear in "All" filter but with clear "Cancelled" visual treatment
- [ ] Cancelled invoices do not count toward "Total Outstanding"
- [ ] No transaction is created or removed on cancellation

---

#### US-408a: Delete Draft Invoice

**As a** user  
**I want** to delete a draft invoice I no longer need  
**So that** my invoice list stays clean and I'm not cluttered with unused drafts  

**Trigger:** User taps "Delete" on Invoice Preview (draft invoices only).

**Flow:**
1. User taps "Delete" on a draft invoice's preview screen
2. Confirmation dialog: "Delete this draft invoice? This cannot be undone. The invoice will be permanently removed."
3. User taps "Delete" (destructive, red) or "Cancel"
4. On confirm: `invoices.delete` mutation removes the invoice and its line items (hard delete)
5. Success toast: "Draft invoice deleted"
6. User returns to Invoice List; invoice no longer appears in any filter
7. "Delete" is only visible for draft invoices; sent, paid, overdue, and cancelled invoices show "Cancel" instead (US-408)

**Acceptance Criteria:**
- [ ] Only draft invoices can be deleted
- [ ] Confirmation dialog required with explicit "permanently removed" warning
- [ ] Invoice document and invoiceItems removed from database
- [ ] No transaction created (drafts have no payment)
- [ ] Success toast displayed
- [ ] User returned to Invoice List
- [ ] Deleted invoice does not appear in any filter

---

#### US-409: Download Invoice PDF

**As a** user  
**I want** to download my invoice as a PDF  
**So that** I can share it manually or keep it for my records.

**Trigger:** User taps "Download PDF" on Invoice Preview.

**Flow:**
1. User taps "Download PDF"
2. If `pdfStorageId` exists on the invoice: fetch the signed URL from Convex Storage and initiate download
3. If `pdfStorageId` does not exist (draft invoice never sent): call `invoices.generatePdf` action to generate PDF first, store in Convex Storage, set `pdfStorageId`, then initiate download
4. Mobile: open native share/save sheet with PDF; Web: trigger browser download
5. File name: "{invoiceNumber}.pdf" (e.g. "INV-2026-0042.pdf")

**Acceptance Criteria:**
- [ ] PDF downloads for any invoice status
- [ ] If PDF already generated, download uses cached version
- [ ] If PDF not yet generated, system generates it first (with loading indicator)
- [ ] File named after invoice number
- [ ] PDF content matches the Invoice Preview layout
- [ ] Mobile triggers native share/save; web triggers browser download

---

#### US-410: Share Invoice

**As a** user  
**I want** to share my invoice via other channels (WhatsApp, etc.)  
**So that** I can deliver the invoice however my client prefers.

**Trigger:** User taps "Share" on Invoice Preview.

**Flow:**
1. User taps "Share"
2. If PDF not generated: generate via `invoices.generatePdf` first
3. Mobile: native share sheet opens with PDF file attached
4. Web: options to copy a shareable link or download

**Acceptance Criteria:**
- [ ] Share triggers native share sheet on mobile with PDF file
- [ ] Web provides copy-link or download option
- [ ] PDF content is current (regenerated if invoice was edited since last generation)

---

### 3.3 Recurring Invoices

#### US-411: Set Up Recurring Invoice

**As a** freelancer with retainer clients  
**I want** to set an invoice to recur monthly or quarterly  
**So that** the system automatically creates the next invoice without manual effort.

**Trigger:** User toggles "Recurring" on Create/Edit Invoice form.

**Flow:**
1. On Create/Edit Invoice, user sees a "Make Recurring" toggle at the bottom of Section 1 (Invoice Details)
2. User enables the toggle
3. Recurring interval selector appears: Monthly | Quarterly
4. User selects interval
5. On save: `isRecurring` = true, `recurringInterval` set, `nextIssueDate` calculated as issue date + interval
6. Invoice saved as draft (or sent)
7. The scheduled function `invoices.generateRecurring` (runs daily at 07:00 WAT) checks for invoices where `isRecurring = true` and `nextIssueDate ≤ today`
8. For each match: a new invoice is created by cloning all fields (client, line items, WHT rate, currency, notes) with a new invoice number, new issue date = `nextIssueDate`, new due date = issue date + original (dueDate − issueDate) offset, and status = "draft"
9. The template invoice's `nextIssueDate` is advanced by the recurring interval
10. User receives a notification: "Recurring invoice {newInvoiceNumber} created for {clientName}"

**Acceptance Criteria:**
- [ ] "Make Recurring" toggle available on Create/Edit Invoice
- [ ] Interval options: Monthly, Quarterly
- [ ] `isRecurring`, `recurringInterval`, and `nextIssueDate` persisted on save
- [ ] Scheduled function runs daily and generates new invoices from templates
- [ ] New invoice clones all fields: client, line items, currency, WHT rate, notes
- [ ] New invoice gets a fresh auto-generated invoice number
- [ ] New invoice issue date = template's `nextIssueDate`; due date offset preserved
- [ ] New invoice status = "draft" (user must review and send)
- [ ] Template's `nextIssueDate` advanced to next occurrence
- [ ] Notification created for user when recurring invoice is generated
- [ ] User can disable recurring by editing the template and toggling off

---

### 3.4 Invoice-to-Transaction Bridge (Webhook)

#### US-412: Payment Webhook — Paystack

**As a** system  
**I want** to automatically mark an invoice as paid when a Paystack payment succeeds  
**So that** the user's income is recorded without manual intervention.

**Trigger:** Paystack sends a `charge.success` webhook event to `POST /webhooks/paystack`.

**Flow:**
1. Paystack sends POST request to `/webhooks/paystack` with payment event
2. HTTP Action validates HMAC-SHA512 signature using `PAYSTACK_SECRET_KEY`
3. If signature invalid: return 401; log security warning
4. If signature valid: extract `reference` from payload
5. Look up invoice where `invoiceNumber` matches the payment reference (or a stored payment reference field)
6. If no matching invoice found: return 200 (acknowledge but ignore)
7. If matching invoice found and status is "sent" or "overdue":
   a. Extract amount paid from payload
   b. Call `invoices.markPaid` mutation (same as US-407) with `paidAt` = event timestamp, `amountNgn` = amount from payload (Paystack processes in NGN)
   c. Income transaction auto-created (same bridge logic as US-407)
8. Return 200 to Paystack

**Acceptance Criteria:**
- [ ] Webhook endpoint validates Paystack HMAC-SHA512 signature
- [ ] Invalid signatures rejected with 401
- [ ] Payment matched to invoice by reference
- [ ] Matching invoice marked as paid via `invoices.markPaid`
- [ ] Income transaction auto-created with correct WHT fields
- [ ] Already-paid invoices ignored (idempotent)
- [ ] Unmatched references return 200 (no error)
- [ ] Webhook responds within 5 seconds (Paystack timeout)

---

#### US-413: Payment Webhook — Flutterwave

**As a** system  
**I want** to automatically mark an invoice as paid when a Flutterwave payment succeeds  
**So that** the user's income is recorded without manual intervention.

**Trigger:** Flutterwave sends a payment webhook event to `POST /webhooks/flutterwave`.

**Flow:**
1. Flutterwave sends POST request to `/webhooks/flutterwave`
2. HTTP Action validates `verif-hash` header against `FLUTTERWAVE_SECRET_HASH`
3. If hash invalid: return 401
4. If hash valid: extract `txRef` or `flwRef` from payload
5. Match to invoice by reference
6. If matched and status is "sent" or "overdue":
   a. Call `invoices.markPaid` mutation
   b. Income transaction auto-created
7. Return 200

**Acceptance Criteria:**
- [ ] Webhook validates Flutterwave hash
- [ ] Invalid hash rejected with 401
- [ ] Payment matched to invoice by `txRef` or `flwRef`
- [ ] Invoice marked paid and transaction created
- [ ] Idempotent: already-paid invoices ignored
- [ ] Unmatched references return 200

---

### 3.5 Client Management

#### US-414: View Client List

**As a** user  
**I want** to see all my clients in a list  
**So that** I can manage my client directory and quickly find client details.

**Trigger:** User navigates to Clients from Invoices screen (e.g. "Manage Clients" link) or from Settings.

**Flow:**
1. User lands on Client List screen
2. Clients load for the active entity, sorted alphabetically by name
3. Each row shows: client name, email (if present), default currency, default WHT rate (if set)
4. Header action: "+ New Client" button (top-right)
5. User can tap a client to view/edit details
6. User can search clients by name or email

**Acceptance Criteria:**
- [ ] Client list displays all clients for the active entity
- [ ] Each row shows name, email, currency, and WHT rate
- [ ] Clients sorted alphabetically
- [ ] "+ New Client" button navigates to Create Client form
- [ ] Tapping a client opens edit form
- [ ] Search filters by name and email
- [ ] Data scoped to active entity

---

#### US-415: View Client List — Empty State

**As a** user with no clients  
**I want** to see a helpful empty state  
**So that** I know I can add clients.

**Trigger:** User has zero clients for the active entity.

**Flow:**
1. User lands on Client List
2. Empty state displays: illustration of people/contacts, headline "No clients yet", subtext "Add your first client to get started with invoicing.", CTA "Add Client"
3. CTA navigates to Create Client form

**Acceptance Criteria:**
- [ ] Empty state appears when client count is 0
- [ ] "Add Client" CTA navigates to Create Client form

---

#### US-416: Create Client

**As a** user  
**I want** to add a new client to my directory  
**So that** I can quickly select them when creating invoices.

**Trigger:** User taps "+ New Client" on Client List, or enters a new client name during invoice creation.

**Flow:**
1. User sees a form: Client name (required), Email (optional), Address (optional), Default currency (dropdown: NGN/USD/GBP/EUR, default NGN), Default WHT rate (0%/5%/10%, default 0%)
2. User fills in details and taps "Save Client"
3. `clients.create` mutation called
4. Success toast: "Client added"
5. User returns to Client List (or, if creating inline during invoice, the client is selected in the invoice form)

**Acceptance Criteria:**
- [ ] Client name is required; all other fields optional
- [ ] Currency defaults to NGN
- [ ] WHT rate defaults to 0%
- [ ] Client saved with `entityId` and `userId` from current context
- [ ] Success toast displayed
- [ ] New client appears in Client List and in invoice autocomplete

---

#### US-417: Edit Client

**As a** user  
**I want** to update a client's details  
**So that** their information is current for future invoices.

**Trigger:** User taps a client in Client List.

**Flow:**
1. Client detail/edit form opens with all fields pre-populated
2. User edits name, email, address, currency, or WHT rate
3. User taps "Save Changes"
4. `clients.update` mutation called
5. Success toast: "Client updated"
6. Changes reflected in Client List

**Acceptance Criteria:**
- [ ] All fields editable
- [ ] Client name remains required
- [ ] Changes do not retroactively affect existing invoices for this client
- [ ] Success toast on save

---

#### US-418: Delete Client

**As a** user  
**I want** to remove a client from my directory  
**So that** my client list stays clean.

**Trigger:** User taps "Delete" on client edit screen or swipes to delete on Client List.

**Flow:**
1. User initiates delete
2. Confirmation dialog: "Delete {clientName}? This will not affect existing invoices for this client." with "Delete" (destructive, red) and "Cancel" buttons
3. User confirms
4. `clients.delete` mutation called — removes client record
5. Success toast: "Client deleted"
6. Client removed from list

**Acceptance Criteria:**
- [ ] Confirmation dialog shown before delete
- [ ] Client record removed from `clients` table
- [ ] Existing invoices retain denormalised `clientName` and `clientEmail` (stored on invoice at creation) — display shows actual name, not "Deleted Client"
- [ ] Invoice Preview and List display client name from invoice record when `clientId` references deleted client
- [ ] Client no longer appears in autocomplete for new invoices
- [ ] Success toast displayed
- [ ] User cannot assign a different client to existing invoices — invoices are immutable for client; to change client, create new invoice

---

#### US-418a: View Invoice with Deleted Client

**As a** user  
**I want** to see invoice details correctly even when the client has been deleted  
**So that** I retain a clear record of who the invoice was issued to  

**Trigger:** User views an invoice whose `clientId` references a deleted client.

**Flow:**
1. Invoice Preview loads; `clientId` points to non-existent client
2. Client section displays: client name and email from denormalised fields on the invoice (`clientName`, `clientEmail` stored at invoice creation)
3. No "Edit client" option — client info is read-only for historical invoices
4. If denormalised fields are missing (legacy invoices): display "Client no longer in directory" with invoice number as fallback for identification

**Acceptance Criteria:**
- [ ] Invoices denormalise `clientName` and `clientEmail` at creation/update
- [ ] Deleted-client invoices display stored name and email
- [ ] Invoice List row shows client name from invoice for deleted clients
- [ ] Graceful fallback when denormalised data absent (legacy migration)

---

### 3.6 Overdue Detection

#### US-419: Automatic Overdue Detection

**As a** system  
**I want** to automatically mark sent invoices as overdue when they pass their due date  
**So that** the user can see which invoices need follow-up.

**Trigger:** Scheduled function `invoices.checkOverdue` runs daily at 09:00 WAT.

**Flow:**
1. Scheduled function queries all invoices where `status = "sent"` and `dueDate < now()`
2. For each overdue invoice:
   a. Update status to "overdue"
   b. Create notification: "Invoice {invoiceNumber} for {clientName} is overdue"
3. User sees "Overdue" badge (red) on Invoice List and receives notification

**Acceptance Criteria:**
- [ ] Scheduled function runs daily
- [ ] Only "sent" invoices are checked (not draft, paid, or cancelled)
- [ ] Status changes to "overdue" when `dueDate` has passed
- [ ] Notification created for each newly overdue invoice
- [ ] Invoice List reflects updated status in real-time (Convex reactivity)
- [ ] Invoice already marked overdue is not re-processed

---

## 4. UI Specifications

### 4.1 Design Tokens

| Token | Value | Usage |
|-------|-------|-------|
| primary | `#1A7F5E` | Primary buttons, active states |
| primary-light | `#E8F5F0` | Active nav item background |
| accent | `#2B6CB0` | Links, secondary actions, "Sent" badge |
| success | `#38A169` | Positive, income, "Paid" badge |
| warning | `#D69E2E` | Alerts, pending |
| danger | `#E53E3E` | Destructive, overdue, "Overdue" badge, cancel actions |
| neutral-900 | `#1A202C` | Body text |
| neutral-500 | `#718096` | Secondary text, "Draft" badge |
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

#### Invoice List Screen
- **Header:** Title "Invoices", hamburger (left), notification bell + "+ New Invoice" button (right)
- **Layout & Scroll:** Summary bar and filter tabs sticky at top; invoice list scrolls independently below. Summary bar ("Total Outstanding", "Total Paid This Year") remains visible while scrolling long lists.
- **Summary bar:** Full-width card below header with two metrics: "Total Outstanding" (left) and "Total Paid This Year" (right). Amounts in heading-md, labels in label style.
- **Filter tabs:** Horizontal scrollable tab bar: All | Draft | Sent | Paid | Overdue. Active tab has primary colour underline. Count badge on each tab.
- **List:** Each row is a card with 8px vertical margin. Left column: client name (body, neutral-900) + invoice number (body-sm, neutral-500). Centre column: issue date + due date (body-sm, neutral-500). Right column: amount (body, bold) + status badge (label, pill-shaped with background colour matching status).
- **Pagination:** Infinite scroll; skeleton loading for new rows.

#### Create / Edit Invoice Screen
- **Header:** "New Invoice" (or "Edit Invoice"), back arrow (left), no right action
- **Form layout:** Scrollable vertical form. Sections separated by 24px spacing and section headers (heading-md).
- **Footer — Sticky action bar:** "Save as Draft", "Preview", "Send Invoice" buttons remain visible (fixed/sticky at bottom) while user scrolls. Prevents primary actions from scrolling out of view on long forms. Same spec for Edit mode.
- **Section 1 — Invoice Details:** 2-column grid for dates (issue date left, due date right). Invoice number and currency full-width rows.
- **Section 2 — Client:** Client name field with autocomplete dropdown. Email and address fields below (full-width).
- **Section 3 — Line Items:** Table-style rows. Each row: Description (flex, ~50% width), Quantity (fixed 60px), Unit Price (fixed 100px), Total (fixed 100px, computed, read-only), Delete button (icon, 40px). "Add Line Item" link button below. WHT rate selector below line items as segmented control (0% | 5% | 10%).
- **Section 4 — Totals:** Right-aligned summary. Subtotal, WHT (if > 0, shown in danger colour with minus sign), VAT (if > 0), horizontal rule, Total Due (heading-md, bold).
- **Section 5 — Notes:** Multi-line text area.
- **Recurring toggle:** Below notes section. Toggle + interval selector (appears when toggle is on).
- **Footer:** Fixed bottom bar with 3 buttons: "Save as Draft" (outline), "Preview" (outline), "Send Invoice" (primary filled).

#### Invoice Preview Screen
- **Rendered document:** White card with 16px padding on neutral-100 background. Top: business info (right-aligned) + "INVOICE" heading with number and dates (left-aligned). Below: client billing details block. Below: line items table with headers (Description, Qty, Unit Price, Total). Below: totals section (right-aligned). Below: payment details section. Below: notes section.
- **Status badge:** Top-right corner of the document card, pill-shaped.
- **Actions bar:** Fixed bottom bar with contextual buttons based on status.

#### Client List Screen
- **Header:** "Clients", back arrow (left), "+ New Client" button (right)
- **List:** Alphabetically sorted. Each row: client name (body, bold), email (body-sm, neutral-500), currency + WHT rate badges (label, right-aligned).
- **Search:** Search bar below header.

#### Client Form (Create / Edit)
- **Header:** "New Client" or "Edit Client", back arrow (left)
- **Form:** Single-column. Fields: Name (required, text input), Email (optional, email input), Address (optional, multi-line text), Currency (dropdown), WHT Rate (segmented control: 0% | 5% | 10%).
- **Footer:** "Save Client" (primary) button. Edit mode adds "Delete Client" (destructive, text button) at bottom.

### 4.4 Platform Behaviour

| Behaviour | Mobile | Web |
|-----------|--------|-----|
| Invoice List | Full-screen list, pull-to-refresh | Table view with column headers |
| Create Invoice | Full-screen form, keyboard-aware scroll | Side panel or full-page form |
| Invoice Preview | Full-screen scrollable document | Centre-aligned document with sidebar actions |
| PDF Download | Native share/save sheet | Browser download |
| Share | Native share sheet (WhatsApp, email, etc.) | Copy link or download |
| Client autocomplete | Bottom sheet with search results | Inline dropdown |

### 4.5 Status Badge Component

| Status | Background | Text Colour | Border |
|--------|-----------|-------------|--------|
| Draft | `#EDF2F7` (neutral-100 darker) | `#718096` (neutral-500) | None |
| Sent | `#EBF4FF` (accent-light) | `#2B6CB0` (accent) | None |
| Paid | `#E8F5F0` (primary-light) | `#38A169` (success) | None |
| Overdue | `#FFF5F5` (danger-light) | `#E53E3E` (danger) | None |
| Cancelled | `#EDF2F7` | `#A0AEC0` | Strikethrough text |

### 4.6 Global Components Used

- **Toast:** Success (green), Error (red), Info (blue) — for save/send/delete confirmations
- **Empty states:** Illustration + headline + subtext + CTA
- **Loading:** Skeleton placeholders for list loading; button loading spinners for actions
- **Confirmation dialogs:** Title, consequence description, Cancel (neutral), Confirm (primary or destructive)
- **Autocomplete dropdown:** Search-as-you-type with matching items highlighted
- **Segmented control:** For WHT rate selector (0% | 5% | 10%)
- **Date picker:** Platform-native date picker
- **Currency dropdown:** NGN (default), USD, GBP, EUR

---

## 5. Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-401 | System shall display invoices in a filterable list with tabs: All, Draft, Sent, Paid, Overdue | P0 |
| FR-402 | System shall display a summary bar showing total outstanding and total paid this year | P0 |
| FR-403 | System shall auto-generate sequential invoice numbers in format INV-{YEAR}-{NNNN} | P0 |
| FR-404 | Invoice number generation shall be atomic to prevent duplicates under concurrent creation | P0 |
| FR-405 | System shall allow creating invoices with line items, client selection, WHT rate, and VAT | P0 |
| FR-406 | System shall auto-calculate subtotal, WHT deducted, VAT, and total due in real-time | P0 |
| FR-407 | WHT rate selector shall offer 0%, 5%, and 10% options | P0 |
| FR-408 | VAT shall auto-apply at 7.5% only if entity is VAT-registered and turnover exceeds threshold | P0 |
| FR-409 | System shall support saving invoices as draft | P0 |
| FR-410 | System shall generate PDF via NestJS service and store in Convex Storage | P0 |
| FR-411 | System shall send invoice email via Resend with PDF attachment | P0 |
| FR-412 | System shall update invoice status to "sent" after successful email delivery | P0 |
| FR-413 | Only draft invoices shall be editable | P0 |
| FR-414 | Marking an invoice as paid shall atomically create an income transaction with WHT fields | P0 |
| FR-415 | The auto-created transaction shall have `invoiceId` linking back to the source invoice | P0 |
| FR-416 | The auto-created transaction shall have `whtDeducted` and `whtRate` matching the invoice | P0 |
| FR-417 | The auto-created transaction shall be categorised as "Freelance/Client Income" | P0 |
| FR-418 | For foreign currency invoices, user must provide NGN equivalent when marking paid | P0 |
| FR-419 | System shall support cancelling draft and sent invoices | P0 |
| FR-420 | Cancelled invoices shall not count toward outstanding totals | P0 |
| FR-421 | System shall support downloading any invoice as PDF | P0 |
| FR-422 | System shall support sharing invoices via native share (mobile) or copy link (web) | P1 |
| FR-423 | System shall support recurring invoices on monthly or quarterly intervals | P1 |
| FR-424 | Scheduled function shall auto-generate new invoices from recurring templates daily | P1 |
| FR-425 | Auto-generated recurring invoices shall have status "draft" (not auto-sent) | P1 |
| FR-426 | Scheduled function shall detect overdue invoices daily and update status | P0 |
| FR-427 | Overdue detection shall create notifications for affected users | P0 |
| FR-428 | Paystack webhook shall validate HMAC-SHA512 signature before processing | P0 |
| FR-429 | Flutterwave webhook shall validate `verif-hash` before processing | P0 |
| FR-430 | Payment webhooks shall match payments to invoices and call `markPaid` | P0 |
| FR-431 | Payment webhook processing shall be idempotent (already-paid invoices ignored) | P0 |
| FR-432 | System shall support full client CRUD (create, read, update, delete) | P0 |
| FR-433 | Client autocomplete shall search by name from existing clients | P0 |
| FR-434 | Selecting an existing client during invoice creation shall populate defaults (email, address, currency, WHT rate) | P0 |
| FR-435 | Creating an invoice with a new client name shall auto-create a client record | P1 |
| FR-436 | Deleting a client shall not affect existing invoices referencing that client | P0 |
| FR-437 | All invoice and client data shall be scoped to the active entity | P0 |
| FR-438 | Invoice preview shall render a document matching the PDF layout | P0 |
| FR-439 | Invoice email subject shall follow format: "Invoice {number} from {entityName}" | P1 |
| FR-440 | System shall show empty states with CTAs for both invoice and client lists when empty | P0 |

---

## 6. API Requirements (Convex Functions)

### 6.1 Clients Domain (`convex/clients/`)

| Function | Type | Description |
|----------|------|-------------|
| `clients.list` | Query | Return all clients for an entity, sorted alphabetically by name. Accepts `entityId` argument. Verifies ownership via `ctx.auth`. |
| `clients.get` | Query | Return a single client by `_id`. Ownership check: client's `userId` must match authenticated user. |
| `clients.create` | Mutation | Create a new client. Args: `entityId`, `name` (required), `email`, `address`, `currency` (default "NGN"), `whtRate` (default 0). Sets `userId` from auth. Validates `whtRate` ∈ {0, 5, 10}. |
| `clients.update` | Mutation | Update client fields. Args: `clientId`, and optional `name`, `email`, `address`, `currency`, `whtRate`. Ownership check. Validates `whtRate` if provided. |
| `clients.delete` | Mutation | Delete a client by `_id`. Ownership check. Does not cascade to invoices (existing invoices retain `clientId` as dangling ref). |
| `clients.search` | Query | Search clients by name prefix for autocomplete. Args: `entityId`, `query` (string). Returns matching clients sorted by name. |

### 6.2 Invoices Domain (`convex/invoices/`)

| Function | Type | Description |
|----------|------|-------------|
| `invoices.list` | Query | Paginated invoice list. Args: `entityId`, optional `status` filter, optional `clientId` filter, `cursor` for pagination, `limit` (default 25). Returns invoices sorted by `issueDate` descending. Also returns summary totals (outstanding, paid this year). Ownership check. |
| `invoices.get` | Query | Single invoice by `_id` with its line items joined. Returns invoice fields + array of `InvoiceItem` objects. Ownership check. |
| `invoices.create` | Mutation | Create invoice + line items. Args: `entityId`, `clientId` (optional), `issueDate`, `dueDate`, `currency`, `whtRate`, `notes`, `isRecurring`, `recurringInterval`, `items[]` (each: description, quantity, unitPrice). Calls `invoices.generateNumber` internally. Computes subtotal, whtAmount, vatAmount, totalDue. Creates invoice doc + invoiceItems docs. If `clientId` is null but client name is provided, optionally creates a new client. Sets status to "draft". |
| `invoices.update` | Mutation | Edit invoice (draft only). Args: `invoiceId`, and any updatable fields + `items[]`. Validates status is "draft". Deletes old invoiceItems and inserts new ones. Recalculates totals. |
| `invoices.send` | Action | Generate PDF and send email. Args: `invoiceId`. Flow: 1) Read invoice + items + client + entity + user; 2) POST to NestJS `/pdf/invoice` with assembled data; 3) Store PDF in Convex Storage; 4) Send email via Resend with PDF attachment; 5) Call internal mutation to set status = "sent" and `pdfStorageId`. |
| `invoices.markPaid` | Mutation | Mark invoice as paid and create income transaction. Args: `invoiceId`, optional `amountNgn` (required for foreign currency). Validates status is "sent" or "overdue". Sets status = "paid", `paidAt` = now. Creates transaction in `transactions` table with all required fields (see US-407 for field mapping). Idempotent: if already paid, no-op. |
| `invoices.cancel` | Mutation | Cancel an invoice. Args: `invoiceId`. Validates status is "draft" or "sent". Sets status = "cancelled". |
| `invoices.delete` | Mutation | Delete a draft invoice permanently. Args: `invoiceId`. Validates status is "draft" only. Deletes invoice doc and associated invoiceItems. |
| `invoices.generatePdf` | Action | Generate PDF only (for download/preview). Args: `invoiceId`. Same PDF generation flow as `send` but without email. Stores PDF and sets `pdfStorageId`. Returns `storageId`. |
| `invoices.generateNumber` | Mutation (internal) | Atomically generate next invoice number. Queries the latest invoice for the entity in the current year, extracts the sequence number, increments, and returns formatted string (e.g. "INV-2026-0042"). Uses a counter document or max query to ensure atomicity. |
| `invoices.checkOverdue` | Mutation (scheduled) | Find invoices with status "sent" and `dueDate < now()`. Update each to status "overdue". Create notification for each. |
| `invoices.generateRecurring` | Action (scheduled) | Find invoices where `isRecurring = true` and `nextIssueDate ≤ today`. For each: clone invoice + items with new number and dates; update template's `nextIssueDate`. Create notification for each generated invoice. |
| `invoices.getPdfUrl` | Query | Return a signed download URL for an invoice's PDF. Args: `invoiceId`. Reads `pdfStorageId`, calls `ctx.storage.getUrl()`. Ownership check. |

### 6.3 Webhook Handlers (`convex/http.ts`)

| Function | Type | Description |
|----------|------|-------------|
| `webhooks.paystack` | HTTP Action | `POST /webhooks/paystack`. Validates HMAC-SHA512 signature. Extracts payment reference. Matches to invoice. Calls `invoices.markPaid` internal mutation if match found. Returns 200 always (after validation). |
| `webhooks.flutterwave` | HTTP Action | `POST /webhooks/flutterwave`. Validates `verif-hash` header. Extracts `txRef`/`flwRef`. Matches to invoice. Calls `invoices.markPaid` if match found. Returns 200. |

### 6.4 Files (`convex/files/`)

| Function | Type | Description |
|----------|------|-------------|
| `files.generateUploadUrl` | Mutation | Return upload URL for Convex Storage (reused from PRD-0 for any file upload need) |

### 6.5 Supporting Queries

| Function | Type | Description |
|----------|------|-------------|
| `invoices.getSummary` | Query | Return summary stats for dashboard integration: total outstanding, total paid this year, overdue count, invoices sent this month. Args: `entityId`. |

---

## 7. Data Models

### 7.1 Tables

| Table | Purpose |
|-------|---------|
| `clients` | Client directory for invoicing |
| `invoices` | Invoice records with status lifecycle |
| `invoiceItems` | Line items belonging to invoices |
| `transactions` | *(existing from PRD-1)* — receives auto-created income records from markPaid |
| `notifications` | *(existing from PRD-1)* — receives overdue and recurring generation alerts |

### 7.2 `clients` Table Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `entityId` | `id<"entities">` | Yes | Owning entity |
| `userId` | `id<"users">` | Yes | Owning user |
| `name` | `string` | Yes | Client or company name |
| `email` | `optional<string>` | No | Invoice delivery email |
| `address` | `optional<string>` | No | Billing address |
| `currency` | `string` | Yes | Default invoice currency (ISO 4217). Default: "NGN" |
| `whtRate` | `optional<number>` | No | Default WHT rate: 0, 5, or 10 |

**Indexes:**
- `by_entityId` on `[entityId]`
- `by_userId` on `[userId]`
- `by_entityId_name` on `[entityId, name]` (for search/sort)

### 7.3 `invoices` Table Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `entityId` | `id<"entities">` | Yes | Issuing entity |
| `userId` | `id<"users">` | Yes | Owning user |
| `clientId` | `optional<id<"clients">>` | No | Linked client record |
| `clientName` | `optional<string>` | No | Denormalised client name (stored at create/update for display when client deleted) |
| `clientEmail` | `optional<string>` | No | Denormalised client email (stored at create/update for display when client deleted) |
| `invoiceNumber` | `string` | Yes | Sequential (e.g. "INV-2026-0042") |
| `status` | `string` | Yes | One of: "draft", "sent", "paid", "overdue", "cancelled" |
| `issueDate` | `number` | Yes | Unix ms |
| `dueDate` | `number` | Yes | Unix ms |
| `currency` | `string` | Yes | Invoice currency (ISO 4217) |
| `subtotal` | `number` | Yes | Sum of line item totals |
| `whtAmount` | `number` | Yes | Total WHT deducted (0 if no WHT) |
| `vatAmount` | `number` | Yes | VAT charged (0 if not applicable) |
| `totalDue` | `number` | Yes | subtotal − whtAmount + vatAmount |
| `amountNgn` | `optional<number>` | No | Naira equivalent at time of payment |
| `paidAt` | `optional<number>` | No | Unix ms when marked paid |
| `notes` | `optional<string>` | No | Free-text notes |
| `isRecurring` | `boolean` | Yes | Default false |
| `recurringInterval` | `optional<string>` | No | "monthly" or "quarterly" |
| `nextIssueDate` | `optional<number>` | No | Next generation date (Unix ms) |
| `pdfStorageId` | `optional<string>` | No | Convex Storage ID for generated PDF |

**Indexes:**
- `by_entityId_status` on `[entityId, status]`
- `by_entityId_dueDate` on `[entityId, dueDate]`
- `by_userId` on `[userId]`
- `by_entityId_invoiceNumber` on `[entityId, invoiceNumber]` (for uniqueness checks and number generation)
- `by_entityId_isRecurring` on `[entityId, isRecurring]` (for recurring invoice queries)

### 7.4 `invoiceItems` Table Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `invoiceId` | `id<"invoices">` | Yes | Parent invoice |
| `description` | `string` | Yes | Service/product description |
| `quantity` | `number` | Yes | Quantity (≥ 1) |
| `unitPrice` | `number` | Yes | Price per unit in invoice currency |
| `total` | `number` | Yes | quantity × unitPrice |

**Indexes:**
- `by_invoiceId` on `[invoiceId]`

### 7.5 Invoice-to-Transaction Field Mapping

When `invoices.markPaid` creates an income transaction, the fields map as follows:

| Transaction Field | Source | Value |
|-------------------|--------|-------|
| `entityId` | Invoice | `invoice.entityId` |
| `userId` | Invoice | `invoice.userId` |
| `date` | Computed | `paidAt` timestamp (now or webhook event time) |
| `description` | Computed | `"Invoice {invoiceNumber} — {clientName}"` |
| `amount` | Invoice | `invoice.totalDue` |
| `currency` | Invoice | `invoice.currency` |
| `amountNgn` | Invoice/Input | `invoice.amountNgn` (NGN) or user-entered (foreign) |
| `direction` | Fixed | `"credit"` |
| `type` | Fixed | `"income"` |
| `categoryId` | System lookup | ID of "Freelance/Client Income" system category |
| `isDeductible` | Fixed | `false` |
| `deductiblePercent` | Fixed | `0` |
| `whtDeducted` | Invoice | `invoice.whtAmount` |
| `whtRate` | Invoice | WHT rate from invoice (0, 5, or 10) |
| `invoiceId` | Invoice | `invoice._id` |
| `notes` | Computed | `"Auto-created from invoice {invoiceNumber}"` |
| `taxYear` | Computed | Year extracted from `paidAt` |
| `reviewedByUser` | Fixed | `true` |
| `isDuplicate` | Fixed | `false` |
| `externalRef` | Optional | Payment reference from webhook (if applicable) |

**Tax implication:** The gross income for Personal Income Tax purposes is `invoice.subtotal` (i.e. `totalDue + whtAmount`). The WHT deducted (`whtAmount`) becomes a credit against the final tax liability. The transaction records `amount = totalDue` (what was received) and `whtDeducted = whtAmount` (what was withheld). The tax engine (PRD-3) will add these together to compute gross income and apply the WHT credit.

### 7.6 Scheduled Functions

| Function | Schedule | Description |
|----------|----------|-------------|
| `invoices.checkOverdue` | Daily at 09:00 WAT | Find "sent" invoices past due date → status "overdue" + notification |
| `invoices.generateRecurring` | Daily at 07:00 WAT | Find recurring templates with `nextIssueDate ≤ today` → generate new draft invoices |

### 7.7 Seed Data

No seed data required for PRD-4. Clients and invoices are user-created. System categories ("Freelance/Client Income") are seeded in PRD-0.

---

## 8. Non-Goals

The following are **explicitly out of scope** for PRD-4:

1. **Online payment collection:** Embedding Paystack/Flutterwave payment buttons on invoices for direct client payment — future enhancement
2. **Client portal:** A client-facing login to view/pay invoices — future
3. **Partial payments:** Recording partial payments against an invoice; v1 supports full payment only
4. **Payment plans / installments:** Splitting an invoice into scheduled payments
5. **Credit notes / refunds:** Issuing credit against a previously paid invoice
6. **Invoice templates:** Saving reusable invoice templates with pre-filled items
7. **Bulk invoice creation:** Generating invoices for multiple clients at once
8. **Multi-currency conversion at payment:** Automatic FX conversion when marking foreign invoice paid; v1 requires manual NGN entry
9. **Tax invoice compliance:** FIRS e-invoicing format compliance — future regulatory requirement
10. **Invoice approval workflows:** Multi-user approval before sending
11. **Expense invoices / bills payable:** Tracking invoices received from vendors
12. **Invoice reminders:** Automated follow-up emails for unpaid/overdue invoices — future (nice-to-have)
13. **Public invoice link:** A tokenised URL for clients to view invoices in a browser without authentication — listed in backend spec as future

---

## 9. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Invoice creation rate** | ≥ 60% of active users create at least 1 invoice within 30 days | `invoices.create` calls per unique user |
| **Invoice send rate** | ≥ 80% of created invoices are sent (not left as draft) | Ratio of "sent"+"paid" to total invoices |
| **Invoice-to-transaction accuracy** | 100% of paid invoices create a matching income transaction | Audit: paid invoices without corresponding transaction = 0 |
| **WHT capture rate** | ≥ 50% of invoices sent by freelancers have WHT > 0% | Invoices with `whtAmount > 0` / total freelancer invoices |
| **Time to create invoice** | < 3 minutes from screen entry to save/send | Client-side timing analytics |
| **PDF generation success rate** | ≥ 99% | `invoices.send` and `invoices.generatePdf` error rate |
| **Email delivery rate** | ≥ 98% | Resend delivery reports |
| **Client reuse rate** | ≥ 70% of invoices use an existing client (not new) | Invoices with existing `clientId` / total |
| **Recurring invoice adoption** | ≥ 15% of active invoicing users set up at least 1 recurring invoice | Users with `isRecurring = true` invoices / total invoicing users |
| **Overdue rate** | < 30% of sent invoices become overdue | Overdue invoices / total sent invoices |
| **Webhook payment match rate** | ≥ 95% of webhook payments matched to invoices | Matched / total webhook events |
| **Average payment time** | < 14 days from send to paid | `paidAt - issueDate` for sent invoices |

---

## 10. Open Questions

1. **Invoice number editability:** Should users be allowed to change the auto-generated invoice number, or should it be strictly sequential? Editable numbers risk gaps and duplicates; strict sequential is cleaner for audit trails. **Current decision:** Editable but validated for uniqueness.

2. **Client name on existing invoices after client deletion:** When a client is deleted, existing invoices show `clientId` as a dangling reference. Should we denormalise the client name onto the invoice at creation time, or resolve it from the `clients` table (with "Deleted Client" fallback)? **Recommendation:** Denormalise `clientName` and `clientEmail` onto the invoice for historical accuracy.

3. **VAT applicability:** The 7.5% VAT auto-application depends on `entity.vatRegistered` and `entity.vatThresholdExceeded`. Should there be a per-invoice override? Some invoices may be VAT-exempt even for VAT-registered entities. **Recommendation:** Add a "Apply VAT" toggle on the invoice form, defaulting to on for VAT-registered entities.

4. **Payment reference matching for webhooks:** How is the Paystack/Flutterwave payment reference linked to the invoice? Options: a) Invoice number used as payment reference, b) A separate `paymentReference` field generated when invoice is sent, c) User enters reference manually. **Recommendation:** Generate a unique `paymentReference` on send and use it as the Paystack/Flutterwave transaction reference.

5. **Foreign currency NGN conversion:** When marking a foreign currency invoice as paid, the user enters the NGN equivalent. Should we use the CBN rate (from `fxRates` table) as a default/suggestion? **Recommendation:** Pre-fill with CBN rate × totalDue but allow user override.

6. **PDF template customisation:** Should users be able to customise the invoice PDF appearance (logo position, colours, font)? Or is a single professional template sufficient for v1? **Current decision:** Single template for v1; customisation in a future PRD.

7. **Recurring invoice auto-send:** Should auto-generated recurring invoices be auto-sent, or created as drafts for user review? **Current decision:** Created as drafts. Auto-send is a future toggle.

8. **Invoice payment details section:** The preview spec mentions bank name, account number, sort code. Where is this data stored? It's not in the current user/entity schema. **Recommendation:** Add `paymentDetails` (object with `bankName`, `accountNumber`, `sortCode`) to the `entities` table, editable from Settings.

9. **Maximum line items per invoice:** Is there a practical limit? **Recommendation:** Soft limit of 50 line items per invoice for performance.

10. **Invoice deletion vs cancellation:** Should invoices ever be hard-deleted, or only cancelled? Cancelled invoices maintain audit trail. **Current decision:** No hard delete; cancellation only. Draft invoices could be deleted (no audit requirement for never-sent invoices).

---

*End of PRD-4 — Invoicing & Client Management*
