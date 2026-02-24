# TaxEase Nigeria

## Smart Tax Filing for Freelancers & SMEs

**Product Overview Document**

Version 1.0 — February 2026

CONFIDENTIAL

---

## 1. Executive Summary

Nigeria's tax landscape underwent its most significant transformation in decades when President Tinubu signed four landmark tax reform bills into law in June 2025. Effective January 1, 2026, the Nigeria Tax Act (NTA) 2025, the Nigeria Tax Administration Act (NTAA), the Nigeria Revenue Service Act, and the Joint Revenue Board Act have consolidated over 60 disparate taxes into a unified regime. For the first time, freelancers, remote workers, digital creators, and small business owners are squarely within the formal tax net.

Yet for these groups, the path to compliance remains unclear. Most have never filed a tax return. They lack the tools to track income, identify deductible expenses, or compute their progressive tax liability. The government's own digital infrastructure (TaxPro Max) is functional but far from intuitive for first-time filers. There is a clear gap in the market for a purpose-built application that makes tax compliance simple, accessible, and even beneficial for Nigeria's millions of freelancers and SMEs.

TaxEase Nigeria is designed to fill that gap. It is a comprehensive tax management platform that helps freelancers and SMEs track income and expenses year-round, intelligently categorize transactions for tax purposes, calculate tax liability under the new progressive bands, generate compliant invoices, and guide users step-by-step through the self-assessment and filing process.

---

## 2. The Problem

### 2.1 A New Tax Reality for Millions

Under the NTA 2025, every Nigerian resident earning income from any source is required to file an annual self-assessment tax return, even if their taxable income falls below the ₦800,000 threshold and no tax is owed. This applies to salaried workers, freelancers, gig workers, content creators, remote workers earning in foreign currency, and small business owners alike. The filing deadline is March 31 of the following year.

Unlike salaried employees whose employers handle PAYE deductions automatically, freelancers and SME operators have no employer handling their taxes. They must register for a TIN, track all income and expenses, calculate their own tax liability, file the return, and remit payment — all on their own.

### 2.2 The Compliance Burden

The challenges facing this target audience are significant:

- **No prior experience with tax filing:** The majority of Nigerian freelancers and small business owners have never filed a tax return.
- **Complex record-keeping:** Income arrives from multiple sources (local clients, foreign platforms, fintech apps, crypto) in multiple currencies. Expenses are scattered across bank statements, receipts, and mobile money platforms.
- **Difficulty identifying deductibles:** The NTA allows generous deductions for business expenses (data, electricity, software, equipment, even wardrobe for content creators), but most people don't know what qualifies.
- **Progressive tax computation:** The new six-band progressive system is straightforward in principle but confusing to calculate manually, especially after applying reliefs and credits.
- **Fear of penalties:** Late registration carries ₦50,000/month fines, late filing costs ₦100,000 in the first month plus ₦50,000 monthly, and late payment triggers a 10% penalty plus interest at the CBN's monetary policy rate.
- **Government platforms are not user-friendly:** TaxPro Max exists but was designed for tax professionals, not first-time individual filers.

### 2.3 The Enforcement Reality

The government is serious about enforcement. The newly constituted Nigeria Revenue Service (NRS) has statutory powers to request data from financial institutions and payment platform operators. Payments linked to a user's BVN are already visible to tax authorities through data-sharing agreements with NIBSS, NCC, CAC, and other agencies. Digital enforcement, automated penalty assessments, and risk-based audits are replacing the old manual system. The era of invisibility is over.

---

## 3. Target Users

TaxEase Nigeria serves two primary user segments:

### 3.1 Freelancers & Independent Professionals

This includes software developers, designers, writers, consultants, content creators, tutors, photographers, and anyone earning income independently — whether from Nigerian or international clients. Many receive payments through platforms like Paystack, Flutterwave, Payoneer, Wise, or directly into Nigerian bank accounts in naira or foreign currency. Their income is irregular, comes from multiple clients, and is mixed in with personal transactions in their bank accounts.

### 3.2 Small and Medium Enterprises (SMEs)

Registered business names and small limited liability companies with annual turnover up to ₦100 million. These businesses need to track revenue and expenses, manage VAT obligations (if above the threshold), issue proper invoices, and file corporate or personal income tax returns. Many operate with informal bookkeeping or none at all.

---

## 4. Product Vision

TaxEase Nigeria is a year-round tax companion, not just a filing tool. The application is designed around one guiding principle: a freelancer or SME owner with no prior tax knowledge should be able to go from zero to fully compliant, with confidence, in under an hour at filing time — because the app has been quietly organizing their finances all year.

### 4.1 Core Value Propositions

| Value | What It Means for Users |
|---|---|
| **Effortless tracking** | Import bank statements (PDF/CSV) or connect accounts directly. Every transaction appears in one place. |
| **Smart categorization** | AI-assisted classification of income vs. expenses, with suggestions for tax-deductible items based on the NTA. |
| **Real-time tax picture** | A live dashboard showing estimated tax liability, deductions claimed, effective tax rate, and filing deadline countdown. |
| **Guided filing** | Step-by-step walkthrough of the self-assessment process, producing a completed return ready for submission. |
| **Invoice generation** | Create professional invoices for gigs and contracts that automatically feed into income tracking and tax records. |
| **Compliance safety net** | Reminders for deadlines, alerts for missing documentation, and penalty calculators so users never get caught off guard. |

---

## 5. Key Functionality Areas

### 5.1 Transaction Import & Aggregation

The foundation of the application is getting all of a user's financial transactions into one place. The app should support multiple import methods:

- **Bank statement import:** Users upload PDF or CSV bank statements. The app parses these to extract individual transactions with dates, amounts, descriptions, and counterparties.
- **Bank integration (Open Banking):** Where available, direct API connections to Nigerian banks allow automatic, ongoing transaction syncing. This removes the need for manual uploads.
- **Fintech and payment platform integration:** Connections to platforms like Paystack, Flutterwave, Moniepoint, OPay, and others that many freelancers and SMEs use daily.
- **Manual entry:** For cash transactions or income from sources not captured digitally, users can manually log entries.
- **Multi-currency handling:** Foreign currency transactions (USD, GBP, EUR) are automatically converted to naira using the CBN rate on the date of receipt, as required by law.

### 5.2 Transaction Categorization & Expense Identification

Once transactions are imported, the app helps users make sense of them. This is one of the most critical features, since correctly identifying deductible expenses directly reduces tax liability.

- **Automatic categorization:** Using transaction descriptions, amounts, and patterns, the app suggests categories for each transaction (income, business expense, personal expense, transfer, etc.).
- **Deduction-aware tagging:** The app highlights transactions that may qualify as tax-deductible under the NTA — such as internet/data costs, electricity and fuel, software subscriptions, equipment purchases, professional development, and workspace-related expenses.
- **User review interface:** A clean, swipeable UI where users can quickly confirm, reclassify, or annotate transactions. Think of it as a "tax triage" screen where each transaction gets a clear designation.
- **Description enrichment:** Users can add notes or descriptions to transactions to provide context (essential for audit defence). The app prompts for descriptions on ambiguous items.
- **Split transactions:** Support for splitting a single transaction across categories (e.g., a ₦50,000 purchase that is 60% business and 40% personal).

### 5.3 Income Classification

Not all money flowing into an account is taxable income. The app helps users distinguish between:

- **Taxable income:** Freelance payments, consulting fees, contract income, investment returns, rental income, digital asset gains.
- **Non-taxable inflows:** Genuine gifts (exempt under the NTA), loan disbursements, refunds, transfers between own accounts, reimbursements.
- **Foreign income:** Flagged for currency conversion and potential DTA credit claims.
- **Withholding tax already deducted:** When clients have withheld tax at source, users can tag these amounts so they are credited against the final tax liability.

### 5.4 Tax Calculation Engine

At the heart of the application is a calculation engine that applies the NTA's rules to the user's data:

**Personal Income Tax (for freelancers and business name owners)**

1. Sum all taxable income for the year.
2. Subtract allowable business expenses to arrive at assessable profit.
3. Apply personal reliefs: rent relief (20% of annual rent, max ₦500,000), pension contributions, NHIS, NHF, life insurance premiums, mortgage interest.
4. Apply the progressive tax bands (0% on first ₦800k up to 25% above ₦50m).
5. Subtract any withholding tax credits.
6. Calculate final liability.

**Company Income Tax (for LLCs)**

Small companies (₦100m turnover or less, ₦250m fixed assets or less) are exempt from CIT, CGT, and the Development Levy. The app should identify whether a company qualifies and, if not, compute CIT at 30% plus the 4% Development Levy.

**VAT**

If the SME's annual turnover exceeds the small business threshold, the app should track VAT on sales (output VAT) and purchases (input VAT), and calculate the net VAT payable. It should also identify zero-rated and exempt supplies.

**Capital Gains Tax**

If the user has disposed of assets during the year, the app should compute CGT at the applicable rate (progressive PIT rates for individuals, 30% for companies) and identify any exemptions.

### 5.5 Invoice Generation

The invoice module serves a dual purpose: it helps users get paid professionally and it creates a clean paper trail for tax purposes.

- **Professional invoice templates:** Customizable with user's business name, logo, bank details, and contact information.
- **Invoice numbering and tracking:** Automatic sequential numbering, payment status tracking (sent, viewed, paid, overdue).
- **Tax-integrated:** When a payment is received against an invoice, it is automatically logged as taxable income with the correct categorization and client details.
- **Multi-currency support:** Issue invoices in USD, GBP, EUR, or NGN. The app records the naira equivalent at time of payment for tax purposes.
- **Recurring invoices:** For retainer-based freelancers, schedule recurring invoices that auto-generate monthly or at custom intervals.
- **WHT notation:** Invoices can indicate applicable withholding tax rates, so clients know the correct amount to deduct and remit.

### 5.6 Filing & Submission Guidance

The app doesn't just calculate tax — it walks users through the entire filing process:

1. **Pre-filing review:** A checklist that flags missing information, uncategorized transactions, and potential issues before the user commits to filing.
2. **Self-assessment form generation:** The app populates the self-assessment form with all computed figures, ready for submission.
3. **Filing channel guidance:** Clear instructions on how to submit via TaxPro Max (FIRS e-filing portal), the State IRS website, or in person at the nearest tax office. Deep links where possible.
4. **Payment guidance:** Instructions on approved payment channels (bank transfer, online payment) with the correct account details and reference numbers.
5. **Tax Clearance Certificate:** After payment, guidance on obtaining the TCC, which is increasingly required for business opportunities, loan applications, and visa processing.
6. **Receipt and record storage:** Digital storage of all filing confirmations, payment receipts, and tax clearance documents.

### 5.7 Dashboard & Reporting

A year-round dashboard that gives users a real-time view of their tax position:

- **Income tracker:** Running total of taxable income vs. target/projections.
- **Expense tracker:** Categorized breakdown of business expenses and deductions claimed.
- **Estimated tax liability:** Live estimate of tax owed based on current data, updated as transactions are imported.
- **Effective tax rate:** Displayed prominently so users understand their actual burden.
- **Deadline countdown:** Visual countdown to the March 31 filing deadline and other relevant dates (e.g., monthly VAT returns due on the 21st).
- **Year-over-year comparison:** For returning users, compare income, expenses, and tax liability across years.
- **Exportable reports:** Generate PDF summaries for personal records, accountants, or loan applications.

---

## 6. Regulatory Context Summary

The application's logic must be built on a solid understanding of the NTA 2025 and related legislation. The following table summarizes the key rules the app must encode:

| Rule | Detail |
|---|---|
| **Tax-free threshold** | First ₦800,000 of taxable income is exempt (0% rate). |
| **Progressive PIT rates** | 0% / 15% / 18% / 21% / 23% / 25% across six bands up to and above ₦50 million. |
| **Rent relief** | 20% of annual rent paid, capped at ₦500,000. Replaces the old CRA. |
| **Allowable deductions** | All legitimate business expenses, pension contributions, NHIS, NHF, life insurance premiums, mortgage interest. |
| **Filing deadline** | March 31 of the year following the tax year. Nil returns required even if no tax is owed. |
| **TIN requirement** | Mandatory for all taxable persons. NIN serves as Tax ID under the new regime. |
| **Foreign income** | Residents taxed on worldwide income. Convert at CBN rate on date of receipt. DTA credits available for 16 countries. |
| **Digital asset income** | Profits from crypto and virtual asset transactions are expressly taxable. |
| **Small company exemption** | Turnover ≤ ₦100m and fixed assets ≤ ₦250m: exempt from CIT, CGT, Development Levy. |
| **VAT** | 7.5% rate retained. Small businesses exempt. Essential goods zero-rated. Input VAT now recoverable. |
| **Penalties** | Registration: ₦50k/month. Filing: ₦100k first month + ₦50k/month. Payment: 10% + interest at MPR. False declarations: up to ₦1m or 3 years. |

---

## 7. Illustrative User Journey

To ground the product vision, here is how a typical freelance user might interact with TaxEase Nigeria over the course of a year:

### Onboarding (January 2026)

Amaka, a freelance UX designer earning ₦5–8 million annually from Nigerian and international clients, downloads TaxEase. During onboarding, she enters her NIN (which serves as her TIN), connects her primary bank account and her Payoneer account, and uploads a PDF of last year's bank statement for a starting snapshot. The app immediately begins categorizing her transactions.

### Year-Round Tracking (January–December)

Throughout the year, Amaka's transactions sync automatically. When she receives a payment from a client, the app prompts her to confirm it as income and associate it with a specific invoice or project. When she buys a new design tool subscription or pays for electricity, the app suggests it as a deductible business expense. She spends two minutes a week reviewing and confirming categorizations.

When she takes on a new client, she generates an invoice directly from the app. When the client pays, the payment is automatically matched to the invoice and recorded as taxable income.

### Tax Season (February–March 2027)

As the March 31 deadline approaches, TaxEase sends Amaka a notification: her data is 95% ready. She opens the filing module, reviews the pre-filled summary, confirms a few flagged items, and the app generates her completed self-assessment. Her total income was ₦7.2 million, with ₦1.8 million in verified business expenses and ₦400,000 in rent relief. Her taxable income is ₦5 million, and her tax liability is approximately ₦614,000 (minus ₦180,000 in WHT credits already deducted by clients, leaving ₦434,000 to pay).

The app provides a direct link to TaxPro Max with filing instructions, shows the NRS bank account details for payment, and stores her filing receipt once she confirms payment.

---

## 8. Key Considerations & Open Questions

This section captures important areas that will need further exploration as the product moves toward detailed specification:

- **Data security and privacy:** The app will handle sensitive financial data. End-to-end encryption, secure storage, and compliance with Nigeria's Data Protection Act 2023 are non-negotiable.
- **Bank integration feasibility:** Nigeria's Open Banking framework is still maturing. The initial version may need to rely more heavily on PDF/CSV statement import, with bank APIs added incrementally.
- **Regulatory accuracy:** Tax law changes frequently. The calculation engine must be updatable without app-wide releases. A regulatory review process should be built into the product lifecycle.
- **Professional review option:** Some users may want a human tax professional to review their filing. A marketplace or referral feature connecting users with accredited tax agents could add significant value.
- **Monetization model:** Freemium (free tracking, paid filing), subscription-based, or per-filing fee? This will depend on willingness to pay across the target segments.
- **Offline capability:** Many SME users in Nigeria face connectivity challenges. Core tracking and categorization should work offline with syncing when connectivity returns.
- **Multi-entity support:** Some users operate multiple business names or an LLC alongside freelance work. Each entity is taxed separately, and the app should support this.
- **Scalability of categorization:** Machine learning models for auto-categorization will need training data. The initial version may rely more on rule-based categorization with learning improving over time.
- **Regulatory partnerships:** Exploring potential collaboration with the NRS or State IRS offices to enable direct filing through the app (rather than redirecting to TaxPro Max) would be a strong differentiator.

---

## 9. Competitive Landscape

The Nigerian tax-tech space for individuals and SMEs is nascent. The primary alternatives today include TaxPro Max (the government's own e-filing portal, functional but complex), generic accounting tools like Zoho Books or Wave that are not customized for Nigerian tax law, and manual filing with the help of a tax consultant. There are emerging local players in the invoicing and bookkeeping space (such as Bumpa and Prospa), but none offer end-to-end tax filing tailored to the NTA 2025.

TaxEase's differentiation lies in combining transaction intelligence with Nigerian tax-law awareness and a guided filing experience, all in one platform.

---

## 10. How We Will Know It's Working

While detailed KPIs will be defined in the product roadmap, the high-level indicators of success include:

- **User activation:** Percentage of registered users who import at least one month of transactions within the first week.
- **Year-round engagement:** Average transactions categorized per month (indicates ongoing use, not just tax-season spikes).
- **Filing completion rate:** Percentage of users who generate a complete self-assessment form through the app.
- **Time to file:** Average time from opening the filing module to generating a completed return (target: under 30 minutes for a prepared user).
- **Penalty avoidance:** Percentage of active users who file on time and avoid late-filing penalties.
- **Net Promoter Score:** User satisfaction and willingness to recommend, particularly after their first successful filing.

---

*End of Overview Document — Next step: Detailed Product Requirements Document (PRD)*
