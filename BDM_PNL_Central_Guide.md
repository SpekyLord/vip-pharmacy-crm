# BDM PNL CENTRAL — LOGIC GUIDE, SOP & NAVIGATION
## VIP Accounting Master — Consolidated Accounting Hub
**Version:** 2026.3 | **Effective:** March 2026

---

## TABLE OF CONTENTS

1. [System Overview](#1-system-overview)
2. [Architecture & Data Flow](#2-architecture--data-flow)
3. [Sheet Directory — How to Navigate](#3-sheet-directory--how-to-navigate)
4. [Menu Guide — VIP Accounting](#4-menu-guide--vip-accounting)
5. [Data Pull Logic](#5-data-pull-logic)
6. [Journal Entry Engine](#6-journal-entry-engine)
7. [Chart of Accounts (COA)](#7-chart-of-accounts-coa)
8. [BDM Compensation Engine](#8-bdm-compensation-engine)
9. [FIFO Inventory Costing](#9-fifo-inventory-costing)
10. [VAT & CWT Compliance](#10-vat--cwt-compliance)
11. [Reports & Dashboards](#11-reports--dashboards)
12. [Fixed Assets, Loans & People](#12-fixed-assets-loans--people)
13. [Month-End Close Procedure (SOP)](#13-month-end-close-procedure-sop)
14. [Troubleshooting & FAQs](#14-troubleshooting--faqs)

---

## 1. SYSTEM OVERVIEW

**BDM PNL Central** is the consolidated accounting master spreadsheet for VIP (Vios Integrated Projects). It serves as the single source of truth for:

- **Financial consolidation** across all 11+ BDM territories
- **Profit & Loss statements** (Internal management view + BIR tax view)
- **BDM compensation** — advances, settlements, profit sharing
- **Tax compliance** — VAT ledger, CWT 2307, quarterly filing
- **Operational reporting** — expense anomalies, performance rankings, AR aging

### What It Is NOT
- It is **not** where BDMs enter data. BDMs use their individual **ERP Hub** (sales, inventory) and **PNL Live** (expenses, payslips) workbooks.
- PNL Central **pulls** from those workbooks. It never writes back to them.

### Who Uses PNL Central?
| Role | Use Case |
|------|----------|
| **Finance / Accounting** | Month-end close, journal posting, trial balance, P&L |
| **Management** | BDM performance ranking, expense anomaly review |
| **Owner** | Capital infusion / drawing, owner ledger, profit share decisions |
| **Tax / Compliance** | VAT 2550Q, CWT 2307, BIR P&L |

---

## 2. ARCHITECTURE & DATA FLOW

```
BDM ERP Hubs (11+ workbooks)          BDM PNL Live (11+ workbooks)
  JOURNAL_ENTRIES                        SUMMARY - EXPENSES
  SALES_LINES                            C1 INCOME / C2 INCOME
  COLLECTIONS                            C1 CORE / C2 CORE
  INV_TXNS / STOCK_ON_HAND               C1/C2 Car Logbook
  CONSIGNMENT_TRACKER                    C1/C2 ORE, C1/C2 ACCESS
        |                                       |
        v                                       v
  =================================================
  |         BDM PNL CENTRAL                       |
  |         (VIP Accounting Master)               |
  |                                               |
  |  MASTER_JOURNAL  <-- journals from ERP Hubs   |
  |  BDM_EXPENSES    <-- expenses from PNL Live   |
  |  BDM_PAYSLIP_SUMMARY <-- payslips from PNL    |
  |  BDM_COMMISSION_LEDGER <-- commissions        |
  |                                               |
  |      |  Post to Journal  |                    |
  |      v                   v                    |
  |  JOURNAL_ENTRIES_MASTER                       |
  |      |                                        |
  |      +---> TRIAL_BALANCE                      |
  |      +---> PNL_INTERNAL (management view)     |
  |      +---> PNL_BIR (tax view)                 |
  |      +---> VAT_LEDGER --> VAT_RETURN_2550Q    |
  |      +---> CWT_LEDGER --> CWT_2307_SUMMARY    |
  |      +---> AR_CONSOLIDATED                    |
  |      +---> AP_AGING                           |
  |      +---> BANK_RECONCILIATION                |
  |      +---> CASHFLOW_STATEMENT                 |
  =================================================
```

### Key Identifiers
- **CURRENT_PERIOD** — Set in `MASTER_CONTROL` sheet (format: `YYYY-MM`, e.g. `2026-03`). Controls which period all operations target.
- **BDM_REGISTRY** — Lists all active BDMs with their ERP Hub IDs, PNL Live IDs, territories, and script IDs.

---

## 3. SHEET DIRECTORY — HOW TO NAVIGATE

### Control & Registry Sheets

| Sheet Name | Purpose | When to Use |
|-----------|---------|-------------|
| **MASTER_CONTROL** | Central settings — CURRENT_PERIOD, timestamps, control flags | Set period before any operation |
| **BDM_REGISTRY** | Master list of all BDMs — file IDs, territories, statuses | When onboarding, verifying BDMs |

### Data Pull Sheets (populated by Pull operations)

| Sheet Name | Source | Contents |
|-----------|--------|----------|
| **MASTER_JOURNAL** | ERP Hub → JOURNAL_ENTRIES | All journal entries from all BDMs |
| **BDM_EXPENSES** | PNL Live → SUMMARY - EXPENSES | SMER, Gas, Insurance, ACCESS, Commission per BDM per cycle |
| **BDM_PAYSLIP_SUMMARY** | PNL Live → C1/C2 INCOME | Earnings, deductions, net pay per BDM per cycle |
| **BDM_COMMISSION_LEDGER** | PNL Live → C1/C2 CORE | Individual CR/CI detail rows with commission amounts |
| **MASTER_STOCK_ON_HAND** | ERP Hub → STOCK_ON_HAND | Current inventory across all BDMs |
| **MASTER_ITEM_MASTER** | ERP Hub → ITEM_MASTER | All products across all BDMs |
| **GOODS_RECEIVED** | ERP Hub → INV_TXNS | Goods received notes for FIFO |

### Accounting Sheets

| Sheet Name | Purpose |
|-----------|---------|
| **CHART_OF_ACCOUNTS** | Full COA (acct code, name, type, subtype, normal balance) |
| **JOURNAL_ENTRIES_MASTER** | All posted journal entries (double-entry) |
| **TRIAL_BALANCE** | Aggregated debit/credit/net per account |
| **PNL_INTERNAL** | Management P&L — includes all expenses (INTERNAL + BOTH flags) |
| **PNL_BIR** | BIR-compliant P&L — only deductible expenses (BIR + BOTH flags) |

### Tax Compliance Sheets

| Sheet Name | Purpose |
|-----------|---------|
| **VAT_LEDGER** | Output VAT (from collections) + Input VAT (from purchases) |
| **VAT_RETURN_2550Q** | Quarterly VAT return computation |
| **CWT_LEDGER** | Creditable withholding tax recorded on collections |
| **CWT_2307_SUMMARY** | Per customer per quarter CWT summary for Form 2307 |

### Receivables & Payables

| Sheet Name | Purpose |
|-----------|---------|
| **AR_CONSOLIDATED** | All outstanding invoices across all BDMs with aging buckets |
| **AP_LEDGER** | Accounts payable from supplier invoices |
| **AP_AGING** | AP aged by due date |
| **GRNI_LEDGER** | Goods received but not yet invoiced |

### Procurement

| Sheet Name | Purpose |
|-----------|---------|
| **VENDOR_MASTER** | Supplier/vendor directory |
| **PURCHASE_ORDERS** | PO headers |
| **PURCHASE_ORDER_LINES** | PO line items |
| **SUPPLIER_INVOICES** | Matched supplier invoices |

### Banking & Cash

| Sheet Name | Purpose |
|-----------|---------|
| **BANK_ACCOUNTS** | Bank account master (RCBC, SBC, MBTC, UB) |
| **BANK_RECONCILIATION** | Statement vs book reconciliation |
| **CREDIT_CARD_LEDGER** | Credit card transaction tracking |

### BDM Compensation

| Sheet Name | Purpose |
|-----------|---------|
| **BDM_SETTLEMENT** | Earnings vs advances per BDM — shows net payable |
| **BDM_ADVANCES_LEDGER** | Running balance of BDM advances and settlements |
| **BDM_ADVANCES_LEDGER_VIEW** | Formatted view grouped by BDM |
| **PROFIT_SHARE_ELIGIBILITY** | Quarterly eligibility check per BDM |

### Owner Equity

| Sheet Name | Purpose |
|-----------|---------|
| **OWNER_LEDGER** | Capital infusions and drawings log |
| **OWNER_LEDGER_VIEW** | Formatted view with running balance |

### Fixed Assets & Loans

| Sheet Name | Purpose |
|-----------|---------|
| **FIXED_ASSETS** | Asset register with acquisition cost, useful life |
| **DEPRN_STAGING** | Computed depreciation entries for review before posting |
| **LOAN_MASTER** | Loan details (principal, rate, term) |
| **AMORT_SCHEDULE** | Loan amortization schedules |
| **INTEREST_STAGING** | Computed interest entries for review before posting |

### People & Payroll

| Sheet Name | Purpose |
|-----------|---------|
| **PEOPLE_MASTER** | Employee/consultant details + compensation |
| **PEOPLE_STAGING** | Computed compensation for review before posting |
| **PAYROLL_SHEET** | Monthly payroll computation |
| **DIVIDEND_DETAIL** | Per-shareholder dividend breakdown |

### Report Sheets (auto-generated)

| Sheet Name | Purpose |
|-----------|---------|
| **RPT_EXPENSE_ANOMALIES** | Flags BDM expenses with >30% month-over-month change |
| **RPT_BDM_RANKING** | BDMs ranked by Net Cash (Collections - Expenses) |
| **RPT_MOM_TREND** | 6-month sales/collections/expenses trend per BDM |
| **RPT_SALES_TRACKER** | BDM sales by month for the year |
| **RPT_COLLECTIONS_TRACKER** | BDM collections by month for the year |
| **RPT_FUEL_EFFICIENCY** | Gas cost vs expected cost based on KM/liter benchmark |
| **RPT_CONSIGNMENT_AGING** | Consignment items outstanding per hospital |
| **RPT_CYCLE_STATUS** | Per BDM x Month x Cycle status tracking (PENDING → CREDITED) |
| **RPT_CYCLE_DASHBOARD** | Summary dashboard for cycle status |
| **CSI_ALLOCATION** | CSI booklet allocation per BDM |
| **CASHFLOW_STATEMENT** | Monthly cash inflows/outflows |
| **MONTH_CLOSE_LOG** | Execution log from full month close runs |

---

## 4. MENU GUIDE — VIP ACCOUNTING

Open the spreadsheet in Chrome. The **VIP Accounting** menu appears in the menu bar.

### Setup & Control
| Menu Item | What It Does |
|-----------|--------------|
| Setup VIP Accounting | Creates all required sheets with headers |
| Setup Master Control | Creates MASTER_CONTROL sheet with default keys |
| Reset Accounting Sheets | Clears accounting data (use with caution) |

### Data Pull — From ERP Hubs
| Menu Item | What It Does |
|-----------|--------------|
| Pull All Journals | Reads JOURNAL_ENTRIES from all BDM ERPs → MASTER_JOURNAL |
| Pull Goods Received (GRN) | Reads inventory receipts for FIFO matching |
| Pull Master Stock On Hand | Reads current stock levels from all ERPs |
| Build Master Item Master | Consolidates all product catalogs |
| Build Item Exceptions | Flags mismatched items across ERPs |

### Data Pull — From PNL Live
| Menu Item | What It Does |
|-----------|--------------|
| Pull BDM Expenses | Reads SUMMARY - EXPENSES from each PNL Live → BDM_EXPENSES |
| Pull BDM Payslips | Reads C1/C2 INCOME from each PNL Live → BDM_PAYSLIP_SUMMARY |
| Pull BDM Commissions | Reads C1/C2 CORE from each PNL Live → BDM_COMMISSION_LEDGER |

### Procurement
| Menu Item | What It Does |
|-----------|--------------|
| Create Purchase Order | Step-by-step PO creation with vendor lookup |
| Match GRN to PO | Links goods received to PO lines |
| Record Supplier Invoice | Records invoice against GRN |
| Record AP Payment | Records payment to supplier |
| Build AP Aging | Generates AP aging report |

### Journal Posting
| Menu Item | What It Does |
|-----------|--------------|
| Post BDM Expenses to Journal | Creates double-entry JEs from BDM_EXPENSES |
| Post Commissions to Journal | Creates JEs from BDM_COMMISSION_LEDGER |
| Post AP to Journal | Posts accounts payable entries |
| Rebuild FIFO Cost Layers | Rebuilds inventory cost layers from GRN data |

### Tax
| Menu Item | What It Does |
|-----------|--------------|
| Build VAT Ledger | Separates Output VAT (collections) and Input VAT (purchases) |
| Build VAT Return 2550Q | Quarterly VAT return computation |
| Build CWT Ledger | CWT amounts from hospital collections |
| Build CWT 2307 Summary | Per customer per quarter for BIR Form 2307 |

### Financial Reports
| Menu Item | What It Does |
|-----------|--------------|
| Build Trial Balance | Debits, credits, net per account — verifies DR = CR |
| Build P&L Internal | Management P&L with all expenses |
| Build P&L BIR | Tax P&L with only BIR-deductible expenses |
| Build AR Consolidated | Outstanding receivables with aging from all BDMs |

### Banking
| Menu Item | What It Does |
|-----------|--------------|
| Build Bank Reconciliation | Matches bank statement to book entries |
| Build Credit Card Ledger | CC transaction consolidation |
| Setup Bank Import Sheet | Import template for bank statement CSVs |
| Run Bank Auto-Match | Automatically matches bank rows to journal entries |

### BDM Compensation
| Menu Item | What It Does |
|-----------|--------------|
| Build BDM Advances Ledger | Running balance of advances per BDM |
| Build BDM Settlement Summary | Net payable per BDM: Earnings - Advances - Deductions |
| Check Profit Share Eligibility | Evaluates 3-month window for profit share rules |
| Onboard New BDM | Creates new ERP Hub + PNL Live from templates |

### Owner
| Menu Item | What It Does |
|-----------|--------------|
| Record Owner Advance/Drawing | Capital in (YES) or withdrawal (NO) with bank + BIR flag |
| Build Owner Ledger | Formatted view with running equity balance |

### Fixed Assets & Loans
| Menu Item | What It Does |
|-----------|--------------|
| Setup Fixed Assets | Creates asset register |
| Compute Depreciation | Calculates monthly depreciation → DEPRN_STAGING |
| Post Approved Depreciation | Posts reviewed depreciation JEs |
| Setup Loans Module | Creates loan and amortization sheets |
| Compute Interest | Calculates monthly interest → INTEREST_STAGING |
| Post Approved Interest | Posts reviewed interest JEs |

### People & Payroll
| Menu Item | What It Does |
|-----------|--------------|
| Setup People Master | Employee/consultant register |
| Compute People Compensation | Monthly comp → PEOPLE_STAGING |
| Post People Compensation | Posts reviewed compensation JEs |
| Compute Monthly Payroll | Payroll computation |
| Declare Dividends | Per-shareholder dividend declaration |
| Compute 13th Month Pay | Annual 13th month computation |

### Operational Reports
| Menu Item | What It Does |
|-----------|--------------|
| Expense Anomaly Flags | Flags >30% month-over-month expense changes per BDM |
| BDM Performance Ranking | Ranks BDMs by Net Cash (Collections - Expenses) |
| Month-over-Month Trend | 6-month sales/collections/expenses trend |
| Monthly Sales Tracker | Jan-Dec sales per BDM |
| Monthly Collections Tracker | Jan-Dec collections per BDM |
| Fuel Efficiency Alert | Flags gas cost vs expected (KM/liter benchmark) |
| Consignment Aging (All BDMs) | Outstanding consignment items per hospital |

### Period Close
| Menu Item | What It Does |
|-----------|--------------|
| Run Full Month Close | 17-step automated month-end sequence |
| Finalize Month Close | Cashflow + period lock (after staging review) |
| Setup Cycle Status Sheet | BDM x Cycle status tracking setup |
| Generate Cycle Status (Month) | Creates PENDING rows for all BDMs x C1+C2 |
| Cycle Status Dashboard | Summary of cycle completion progress |

---

## 5. DATA PULL LOGIC

### 5.1 Pull BDM Expenses
**Source:** Each PNL Live → `SUMMARY - EXPENSES` sheet (cells B5:D10)
**Target:** `BDM_EXPENSES` sheet

| Cell | Component | Description |
|------|-----------|-------------|
| B5 / C5 | SMER | Sales/Marketing Expense Reimbursement (per diem + transport) |
| B6 / C6 | Gasoline | Official gas less personal use |
| B7 / C7 | Insurance | Partners insurance contribution |
| B8 / C8 | ACCESS | ACCESS program expenses (CME, hospital) |
| B9 / C9 | CORE Commission | Commission earned from collections |
| D10 | Total | Total expenses across both cycles |

**Column B = Cycle 1, Column C = Cycle 2**

Each BDM produces **2 rows** (C1 + C2) per period with columns:
`PullDate | BDM | Territory | Period | Cycle | SMER | GasOfficial | Insurance | ACCESS | CoreComm | TotalExpenses | SourceFileID`

**Replace logic:** Existing rows for the same period are removed and replaced (`VIP_appendOrReplacePeriod_`), keeping historical data for other periods intact.

### 5.2 Pull BDM Payslips
**Source:** Each PNL Live → `C1 INCOME` and `C2 INCOME` sheets
**Target:** `BDM_PAYSLIP_SUMMARY` sheet

**Earnings block** (E17:E24):
| Cell | Component |
|------|-----------|
| E17 | SMER |
| E18 | CORE Commission |
| E19 | Bonus |
| E20 | Other Income |
| E21 | Profit Sharing |
| E22 | Reimbursements |
| E24 | Total Earnings |

**Deductions block** (J17:J23):
| Cell | Component |
|------|-----------|
| J17 | Cash Advance |
| J18 | CC Payment |
| J19 | Credit Payment |
| J20 | Purchased Goods |
| J21 | Other Deductions |
| J22 | Over Payment |
| J23 | Total Deductions |

**Net Pay:** Cell C26

Each BDM produces **2 rows** (C1 + C2) with 21 columns including all earnings, deductions, and net pay.

### 5.3 Pull BDM Commissions
**Source:** Each PNL Live → `C1 CORE` and `C2 CORE` sheets
**Target:** `BDM_COMMISSION_LEDGER` sheet

Reads detail rows starting from **row 10** (columns B:L):
| Column | Field |
|--------|-------|
| B | CR# (Collection Receipt number) |
| C | CR Date |
| D | CI/DR# (Customer Invoice / Delivery Receipt) |
| E | CI/DR Date |
| F | Products |
| G | Amount - Cheque |
| H | Amount - Cash |
| I | Date Deposited |
| J | Bank Deposited |
| K | Commission % |
| L | Commission Amount (PHP) |

Skips empty rows and zero-value rows. Each BDM can produce **multiple rows** per cycle.

### 5.4 Pull All Journals (from ERP Hubs)
**Source:** Each ERP Hub → `JOURNAL_ENTRIES` sheet
**Target:** `MASTER_JOURNAL` sheet

Reads all journal entries with 18 columns and prepends BDM name + territory. This forms the base data for Trial Balance, P&L, and AR reports.

---

## 6. JOURNAL ENTRY ENGINE

### Double-Entry Principle
Every transaction creates balanced debit and credit entries. The system uses a JE builder (`VIP_buildJE_`) that produces 19-column rows.

### BIR Flag System
Each journal entry has a **BIRFlag** that controls which P&L view includes it:

| BIR Flag | PNL_INTERNAL | PNL_BIR | Meaning |
|----------|:---:|:---:|---------|
| **BOTH** | Yes | Yes | Legitimate business expense — deductible for BIR |
| **INTERNAL** | Yes | No | Real expense but not BIR-deductible (e.g., personal with no OR) |
| **BIR** | No | Yes | Special BIR deductions (e.g., personal expenses with official receipt) |

### How BDM Expenses Get Posted

When you run **Post BDM Expenses to Journal**, each expense component maps to specific accounts:

| Component | Debit Account | BIR Flag |
|-----------|--------------|----------|
| SMER (per diem) | 6100 Sales Force - Per Diem | INTERNAL |
| Gasoline (official) | 6610 Transportation - Gasoline | BOTH |
| Insurance | 6000 (varies) | BOTH |
| ACCESS | 6400/6410 ACCESS CME/Rep | BOTH |

**Credit side** for all: `1110 AR - BDM Advances` (payable to BDM)

### How Commissions Get Posted

| Entry | Debit | Credit |
|-------|-------|--------|
| Commission expense | 5100 BDM Commission | |
| Payable to BDM | | 1110 AR - BDM Advances |

---

## 7. CHART OF ACCOUNTS (COA)

### Account Code Ranges

| Range | Category | Examples |
|-------|----------|---------|
| **1000-1014** | Cash & Bank | RCBC (1010), SBC (1011), MBTC (1012), UB (1013), Cash on Hand (1014) |
| **1100-1220** | Receivables | AR Trade (1100), AR BDM (1110), Input VAT (1210), CWT Receivable (1220) |
| **1200** | Inventory | FIFO-costed inventory |
| **2000-2400** | Liabilities | AP Trade (2000), Output VAT (2100), EWT Payable (2200), CC lines (2310-2315) |
| **3000-3200** | Equity | Owner Capital (3000), Drawings (3100), Retained Earnings (3200) |
| **4000-4200** | Revenue | Sales Vatable (4000), Sales Exempt (4100), Other Income (4200) |
| **5000-5300** | Cost of Sales | COGS (5000), BDM Commission (5100), Profit Share (5200) |
| **6000-7100** | Operating Expenses | Salaries, per diem, marketing, ACCESS, transport, rent, IT, etc. |
| **8000-8200** | BIR-Only | Personal Expense BIR (8000), Owner Advance Exp (8100), BDM Advance Exp (8200) |

---

## 8. BDM COMPENSATION ENGINE

### 8.1 Settlement Summary Flow
1. Pull payslips (C1 + C2 → earnings and deductions per cycle)
2. Aggregate per BDM across both cycles
3. Look up outstanding advance balance from `BDM_ADVANCES_LEDGER`
4. Calculate: **Net Payable = Net Pay - Outstanding Advance Balance**

| Net Payable | Action |
|-------------|--------|
| >= 0 | **PAY BDM** — company owes BDM |
| < 0 | **BDM OWES VIP** — BDM has outstanding balance |

### 8.2 Advance/Settlement Flow
```
BDM requests advance
  → Record in BDM_ADVANCES_LEDGER (Type: ADVANCE, +amount)
  → DR: AR-BDM / CR: Bank

Cycle ends, payslip computed
  → Pull payslip data

Settlement
  → Net: Earnings - Advances
  → Record settlement (Type: SETTLEMENT, -amount)
  → If positive: DR: Expense / CR: Bank (pay BDM)
  → If negative: BDM carries balance to next cycle
```

### 8.3 Profit Share Eligibility Rules
Checked quarterly with a **3-month rolling window**:

| Rule | Criteria |
|------|----------|
| **Rule 1** | 5+ products with active sales in ALL 3 months |
| **Rule 2** | Those products sold in 2+ hospitals |
| **Rule 3a** | Consistent sales in ALL 3 months |
| **Rule 3b** | Consistent collections in ALL 3 months |

All 4 rules must pass for a BDM to be **ELIGIBLE**.

---

## 9. FIFO INVENTORY COSTING

The system uses **First-In, First-Out (FIFO)** for inventory costing:

1. **Rebuild FIFO Layers** — reads Goods Received (GRN) data, creates cost layers ordered by receipt date
2. **Consume FIFO Layers** — matches sales/dispatches against oldest layers first
3. **Result** — COGS calculated at actual purchase cost per the FIFO method

This is critical for accurate gross profit calculation in the P&L.

---

## 10. VAT & CWT COMPLIANCE

### VAT Rules (Cash Basis)
- **Output VAT** recognized only on **collections** (not on invoicing)
- **Input VAT** recognized on supplier invoices
- VAT-inclusive pricing: extract using **12/112** formula
- Filing: Form **2550Q** quarterly
- **Net VAT Payable = Output VAT - Input VAT**

### CWT (Creditable Withholding Tax)
- Hospitals withhold **1%** on goods when they pay
- BDMs record the CWT amount in their COLLECTIONS sheet
- **CWT Receivable** offsets Income Tax Payable quarterly
- BIR Form **2307** issued per customer per quarter

---

## 11. REPORTS & DASHBOARDS

### 11.1 Trial Balance
- Aggregates all journal entries by account code
- Shows: Total Debits, Total Credits, Net Balance
- **Balance Status**: NORMAL (matches expected DR/CR direction) or ABNORMAL
- Bottom line: DR total should equal CR total (difference = 0)

### 11.2 P&L Internal (Management View)
```
REVENUE
  Sales Vatable (4000)
  Sales Exempt (4100)
  ─────────────────────
  Total Revenue

COST OF SALES
  COGS (5000)
  BDM Commission (5100)
  Profit Share (5200)
  ─────────────────────
  Total Cost of Sales

GROSS PROFIT = Revenue - Cost of Sales
  (GP Margin %)

OPERATING EXPENSES
  [Grouped by subtype: Salaries, Marketing, Transport, etc.]
  ─────────────────────
  Total Operating Expenses

OPERATING INCOME = Gross Profit - Operating Expenses
  (OP Margin %)

OTHER INCOME (4200)
  ─────────────────────

NET INCOME (Internal) = Operating Income + Other Income
  (Net Margin %)
```

Includes entries with BIRFlag = **BOTH** or **INTERNAL**.

### 11.3 P&L BIR (Tax View)
Same structure as Internal, but:
- Excludes entries flagged **INTERNAL** (not deductible)
- Includes entries flagged **BIR** (special deductions like personal with OR)
- Adds section: **ADDITIONAL BIR DEDUCTIONS** (account codes 8000+)

### 11.4 AR Consolidated
- Pulls from every BDM's SALES_LINES + OPENING_AR + COLLECTIONS
- Computes: Balance = Invoice Total - Collected
- Aging buckets: CURRENT, 1-30, 31-60, 61-90, 90+
- Color coded: green (1-30) → yellow (31-60) → orange (61-90) → red (90+)

### 11.5 Expense Anomaly Flags
- Compares current period vs prior period per BDM per component
- Flags any component with **>30% change** as **ALERT**
- Components: SMER, GasOfficial, Insurance, ACCESS, CoreComm
- Sorted by absolute change % (biggest swings first)

### 11.6 BDM Performance Ranking
- Ranks all BDMs by **Net Cash = Collections - Expenses**
- Also shows: Sales, Collection %, Territory
- Top 3 highlighted green, bottom 3 highlighted red

### 11.7 Month-over-Month Trend
- 6-month rolling window per BDM
- Shows: Sales, Sales Growth %, Collections, Collection Growth %, Expenses, Expense Growth %

### 11.8 Sales & Collections Trackers
- Full year (Jan-Dec) by BDM
- One tracker for sales (credits to acct 3000/4000)
- One tracker for collections (debits to acct 1000-1014)
- Sorted by Year Total descending

### 11.9 Fuel Efficiency Alert
- Reads each BDM's Car Logbook sheets
- Compares actual gas cost vs expected (Official KM / KM-per-liter * avg price)
- Flags variance **>30%** as **OVER 30%**

### 11.10 Consignment Aging
- Pulls from CONSIGNMENT_TRACKER in each BDM ERP
- Status: OPEN, OVERDUE (>90 days), COLLECTED
- Sorted: OVERDUE first, then OPEN, then COLLECTED

### 11.11 Report Cycle Status
Tracks each BDM's payslip cycle through a state machine:

```
PENDING → GENERATED → REVIEWED → RETURNED → BDM_CONFIRMED → CREDITED
```

- **PENDING** — cycle created, not yet processed
- **GENERATED** — payslip generated
- **REVIEWED** — finance reviewed
- **RETURNED** — sent back to BDM for corrections
- **BDM_CONFIRMED** — BDM confirmed corrections
- **CREDITED** — funds released

Auto-timestamps when status changes. Dashboard shows completion % and lists behind-schedule BDMs.

---

## 12. FIXED ASSETS, LOANS & PEOPLE

### Fixed Assets
1. Register assets in **FIXED_ASSETS** (cost, useful life, salvage value)
2. Run **Compute Depreciation** → entries appear in **DEPRN_STAGING**
3. Review and set **Approved = YES** for correct rows
4. Run **Post Approved Depreciation** → JEs posted to journal

### Loans
1. Register loans in **LOAN_MASTER** (principal, rate, term, start date)
2. Run **Build Amortization Schedules** → **AMORT_SCHEDULE** populated
3. Run **Compute Interest** → entries in **INTEREST_STAGING**
4. Review and approve → **Post Approved Interest**

### People / Payroll
1. Register in **PEOPLE_MASTER** (role, compensation, tax status)
2. Run **Compute People Compensation** → **PEOPLE_STAGING**
3. Review and approve → **Post People Compensation**
4. Separate payroll function: **Compute Monthly Payroll**
5. Year-end: **Compute 13th Month Pay**
6. Dividends: **Declare Dividends** with per-shareholder detail + **1601-FQ** summary

---

## 13. MONTH-END CLOSE PROCEDURE (SOP)

### Pre-Requisites
- [ ] `CURRENT_PERIOD` is set in MASTER_CONTROL (e.g., `2026-03`)
- [ ] All BDMs have validated their PNL Live data (ORE, ACCESS, Car Logbook)
- [ ] All BDMs have completed C1 and C2 income sheets

### Phase 1: Data Collection (Run individually or via Full Month Close)

| Step | Action | Menu Item |
|------|--------|-----------|
| 1 | Pull journals from all BDM ERPs | Pull All Journals |
| 2 | Pull goods received for FIFO | Pull Goods Received (GRN) |
| 3 | Pull stock on hand | Pull Master Stock On Hand |
| 4 | Pull BDM expenses from PNL Live | Pull BDM Expenses |
| 5 | Pull BDM payslips from PNL Live | Pull BDM Payslips |
| 6 | Pull BDM commissions from PNL Live | Pull BDM Commissions |

### Phase 2: Processing

| Step | Action | Menu Item |
|------|--------|-----------|
| 7 | Match GRN to Purchase Orders | Match GRN to PO |
| 8 | Rebuild FIFO cost layers | Rebuild FIFO Cost Layers |
| 9 | Consume FIFO (compute COGS) | *(automatic in month close)* |

### Phase 3: Journal Posting

| Step | Action | Menu Item |
|------|--------|-----------|
| 10 | Post BDM expenses to journal | Post BDM Expenses to Journal |
| 11 | Post commissions to journal | Post Commissions to Journal |
| 12 | Post AP entries | Post AP to Journal |
| 13 | Post cash basis VAT | *(automatic in month close)* |

### Phase 4: Tax Compliance

| Step | Action | Menu Item |
|------|--------|-----------|
| 14 | Build VAT Ledger | Build VAT Ledger |
| 15 | Build CWT Ledger | Build CWT Ledger |

### Phase 5: Financial Reports

| Step | Action | Menu Item |
|------|--------|-----------|
| 16 | Build Trial Balance | Build Trial Balance |
| 17 | Build P&L Internal + P&L BIR + AR + AP + Settlement | *(automatic in month close)* |

### Phase 6: Review & Staging (Assets, Loans, People)

| Step | Action |
|------|--------|
| 18 | Run Compute Depreciation → review DEPRN_STAGING |
| 19 | Run Compute Interest → review INTEREST_STAGING |
| 20 | Run Compute People Compensation → review PEOPLE_STAGING |
| 21 | **PAUSE** — Finance reviews all 3 staging sheets |
| 22 | Set Approved = YES on correct rows in each staging sheet |
| 23 | Post Approved Depreciation |
| 24 | Post Approved Interest |
| 25 | Post People Compensation |

### Phase 7: Finalize

| Step | Action |
|------|--------|
| 26 | Build Cashflow Statement |
| 27 | Run Bank Reconciliation per bank |
| 28 | Review Trial Balance — verify DR = CR |
| 29 | **Finalize Month Close** — locks period |

### Automated Option: Full Month Close
Run **VIP Accounting → Run Full Month Close** to execute Steps 1-17 automatically. The system will:
1. Run all 17 steps sequentially with progress toasts
2. Log results to **MONTH_CLOSE_LOG**
3. Show summary: steps completed, errors, duration

Then manually proceed with Phase 6 (staging review) and Phase 7 (finalize).

---

## 14. TROUBLESHOOTING & FAQs

### "Set CURRENT_PERIOD in MASTER_CONTROL first"
Every operation requires a period. Go to the **MASTER_CONTROL** sheet, find the row with key `CURRENT_PERIOD`, and set the value to `YYYY-MM` format (e.g., `2026-03`).

### "No PNL_LIVE_ID in registry"
The BDM is missing their PNL Live spreadsheet ID in **BDM_REGISTRY** column H. Open the registry and paste the correct spreadsheet ID.

### "Sheet not found in PNL"
The BDM's PNL Live workbook is missing a required sheet (e.g., `SUMMARY - EXPENSES`, `C1 INCOME`). Check if the workbook was set up correctly or run the PNL Live setup.

### Trial Balance is out of balance
- Check for journal entries with a debit but no corresponding credit (or vice versa)
- Look for VOID entries that may need cleanup
- Re-run **Build Trial Balance** after fixing

### P&L Internal shows different numbers than P&L BIR
This is by design. The BIR Flag system separates:
- **Internal view** includes personal/non-deductible expenses
- **BIR view** includes only tax-deductible expenses
- The difference = expenses flagged as INTERNAL only

### How to add a new BDM?
Use **VIP Accounting → Onboard New BDM**. This creates a new ERP Hub + PNL Live from templates, adds the BDM to the registry, and sets up Drive folders.

### How to re-pull data for a specific BDM?
You cannot pull for a single BDM — pulls always run across all active BDMs. However, the replace logic (`VIP_appendOrReplacePeriod_`) ensures that re-running a pull for the same period replaces the data cleanly without duplicates.

### Report Cycle Status — what does each status mean?

| Status | Meaning | What happens |
|--------|---------|-------------|
| PENDING | Created, not processed | Nothing — waiting |
| GENERATED | Payslip generated | GeneratedAt timestamp set |
| REVIEWED | Finance has reviewed | ReviewedBy + ReviewedAt set |
| RETURNED | Sent back to BDM | Manual: enter ReturnedReason |
| BDM_CONFIRMED | BDM confirmed fixes | ConfirmedAt timestamp set |
| CREDITED | Funds released | CreditedAt + CreditedBy set |

---

## QUICK REFERENCE — COMMON WORKFLOWS

### "I need to see how much we owe each BDM this month"
1. Pull BDM Payslips
2. Build BDM Settlement Summary
3. Open **BDM_SETTLEMENT** sheet → look at column W (Action: PAY BDM or BDM OWES VIP)

### "I need to check which BDMs have unusual expenses"
1. Pull BDM Expenses
2. Run Expense Anomaly Flags
3. Open **RPT_EXPENSE_ANOMALIES** → filter by Flag = ALERT (red rows)

### "I need to prepare the quarterly VAT return"
1. Ensure all 3 months are pulled and posted
2. Build VAT Ledger
3. Build VAT Return 2550Q
4. Open **VAT_RETURN_2550Q** for filing amounts

### "I need to know which BDMs qualify for profit sharing"
1. Set CURRENT_PERIOD to the last month of the quarter
2. Run Check Profit Share Eligibility
3. Open **PROFIT_SHARE_ELIGIBILITY** → look at column O (ELIGIBLE / NOT ELIGIBLE)

### "I need the complete financial picture for this month"
1. Run Full Month Close (Steps 1-17)
2. Review and approve staging sheets
3. Finalize Month Close
4. Open: **TRIAL_BALANCE**, **PNL_INTERNAL**, **PNL_BIR**, **AR_CONSOLIDATED**, **CASHFLOW_STATEMENT**

---

*This guide covers the complete BDM PNL Central system as implemented in the Apps Script codebase. For BDM field operations (how BDMs use their individual ERP Hub and PNL Live), see `BDM_SOP_Guide.md`.*
