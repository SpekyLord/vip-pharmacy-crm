# PRODUCT REQUIREMENTS DOCUMENT
## VIP INTEGRATED PLATFORM (VIP-IP) — ERP MODULE
**Version:** 5.0
**Date:** April 1, 2026
**Based on:** PRD v4.0 (MERN Adaptation) + BDM PNL Central Live System + BDM SOP Guide
**Adapted by:** Development Team
**Tech Stack:** MERN (MongoDB, Express, React, Node.js) — unified with existing VIP CRM
**Classification:** Internal Development Reference

---

## VERSION HISTORY

| Version | Date | Changes |
|---------|------|---------|
| 4.0 | March 28, 2026 | MERN adaptation of Client PRD v3.3 (69 decisions). Modules 9-14 deferred. |
| **5.0** | **April 1, 2026** | **8 integrations from PNL Central live system. Items marked [v5 NEW].** |

### What's New in v5

| # | Addition | Section |
|---|----------|---------|
| 1 | Payslip generation for Admin & Sales/Marketing employees | §10 (People Master & Payroll) |
| 2 | Full accounting: COA, GL, Journal Entries, Trial Balance, Cashflow, 4-view P&L | §11 (VIP Accounting Engine) |
| 3 | BDM + Sales employee performance ranking | §14.6 |
| 4 | Consolidated consignment aging report (all BDMs) | §14.7 |
| 5 | Expense anomaly flags (>30% MoM) with budget tracking | §14.8 |
| 6 | Warehouse stock isolation confirmed (BDM sees own territory only) | §7.2 |
| 7 | Philippine government mandated deductions (SSS, PhilHealth, PagIBIG, Tax) | §10.4 |
| 8 | Document photo vs OCR requirements matrix | §4.2 |
| + | DR upgraded to full OCR (was classification-only in v4) | §4.2, §7.3 |
| + | Purchasing & AP promoted from deferred to full module | §15 |
| + | Banking & Cash module (bank reconciliation, credit card ledger) | §16 |

---

## TABLE OF CONTENTS

1. [System Architecture](#1-system-architecture)
2. [Core Principles](#2-core-principles)
3. [Master Data — MongoDB Collections](#3-master-data)
4. [Module 1 — Document Capture (OCR)](#4-document-capture)
5. [Module 2 — Sales Management](#5-sales-management)
6. [Module 3 — Collections Engine](#6-collections-engine)
7. [Module 4 — Inventory Engine](#7-inventory-engine)
8. [Module 5 — BDM Field Operations](#8-bdm-field-operations)
9. [Module 6 — Commission and Profit Share](#9-commission-profit-share)
10. [Module 7 — People Master & Payroll [v5 NEW]](#10-people-master)
11. [Module 8 — VIP Accounting Engine [v5 NEW]](#11-accounting-engine)
12. [Module 9 — Report Cycle and Income Release](#12-report-cycle)
13. [Module 10 — CRM Integration](#13-crm-integration)
14. [Reports, Analytics & SOA](#14-reports)
15. [Module 12 — Purchasing & AP [v5 NEW]](#15-purchasing-ap)
16. [Module 13 — Banking & Cash [v5 NEW]](#16-banking)
17. [SAP-Equivalent Improvements](#17-sap-improvements)
18. [User Roles and Permissions](#18-roles)
19. [Development Phases](#19-phases)
20. [Success Metrics](#20-metrics)
21. [Decision Log](#21-decisions)

---

## 1. SYSTEM ARCHITECTURE — MERN ADAPTATION

### 1.1 Client PRD Spec vs Implementation

| Client PRD Specifies | We Implement | Why |
|---------------------|-------------|-----|
| PostgreSQL 16 + Cloud SQL | **MongoDB Atlas** | CRM already on MongoDB. Shared database. Shared auth. |
| Fastify + TypeScript | **Express + JavaScript** | CRM backend already built on Express. Same server handles CRM + ERP routes. |
| Prisma ORM | **Mongoose ODM** | CRM models already use Mongoose. ERP models added alongside. |
| Row-level security | **Mongoose middleware + tenant filtering** | `entity_id` and `bdm_id` filters on all queries. |
| INSERT-only trigger | **Mongoose pre-save hooks + schema design** | `immutable: true` on event fields. Corrections = new documents. |
| Google OAuth 2.0 | **JWT httpOnly cookies** | CRM auth already works. Same login for CRM + ERP. |
| React 18 + TypeScript | **React 18 + Vite (JavaScript)** | CRM frontend already built. ERP modules added as new routes/pages. |
| React Native + Expo | **Responsive web (phone-first)** | CRM is already phone-first responsive. Native app not in scope per CRM PRD §6.6. |
| Google Cloud Run | **AWS Lightsail** | CRM deployment target. Single server. |
| Google Drive API | **AWS S3** | CRM uses S3 for photos. ERP documents stored in same bucket with folder structure. |
| Google Vision API | **Google Vision API** | Kept as-is. Best OCR for Philippine documents. Called from Express backend. |
| Redis | **Deferred** | Not needed at current scale. Add when 10+ concurrent BDMs. |
| Socket.io | **Deferred** | Real-time dashboard is Phase 3. Polling sufficient for Phase 1. |
| Bull queue | **Deferred** | OCR processing is Phase 2. Sequential processing sufficient initially. |

### 1.2 Single Platform Architecture

```
vip-system/ (one codebase, one deployment)
│
├── SHARED AUTH (JWT httpOnly cookies)
│   └── Same login → sees CRM tabs + ERP tabs based on role
│
├── CRM (existing — Tier 1)
│   ├── Visit logging, scheduling, CPT
│   ├── VIP Client management
│   └── DCR Summary, engagement tracking
│
├── ERP (replaces PNL Live + ERP Excel)
│   ├── Sales, Inventory, Collections, AR
│   ├── Expenses (SMER, Car Logbook, ORE, ACCESS, PRF/CALF)
│   ├── Income, Profit Sharing, PNL
│   └── Dashboard, Reports, SOA
│
├── OCR ENGINE (Phase 2)
│   └── Google Vision API → pre-fill forms
│
├── PEOPLE & PAYROLL [v5 NEW]
│   ├── People Master (BDMs, employees, consultants, directors)
│   ├── Compensation profiles (fixed salary, hybrid, commission-based)
│   ├── Government mandatories (SSS, PhilHealth, PagIBIG, Tax)
│   └── Payslip generation, 13th month, dividends
│
├── ACCOUNTING [v5 NEW — promoted from deferred]
│   ├── Chart of Accounts, Journal Entries, Trial Balance
│   ├── 4-View P&L (Internal, BIR, VAT, CWT)
│   ├── VAT Filing, CWT 2307
│   ├── Fixed Assets, Loans, Owner Equity
│   └── Month-End Close (29-step SOP)
│
├── PURCHASING & AP [v5 NEW — promoted from deferred]
│   └── Vendors, POs, 3-Way Matching, AP Aging, GRNI
│
└── BANKING & CASH [v5 NEW]
    └── Bank Reconciliation, Credit Card Ledger, Auto-Match
```

### 1.3 Multi-Tenancy via Document-Level Filtering

```javascript
// Every ERP document includes:
{
  entity_id: ObjectId,     // VIP Inc., MG AND CO., future subsidiaries
  bdm_id: ObjectId,        // which BDM's territory
  tenant_id: ObjectId,     // alias for entity_id (client PRD terminology)
  // ... module-specific fields
}

// Mongoose middleware auto-filters all queries:
schema.pre(/^find/, function() {
  if (this._userRole !== 'president') {
    this.where({ entity_id: this._entityId });
    if (this._userRole === 'bdm') {
      this.where({ bdm_id: this._bdmId });
    }
  }
});
```

---

## 2. CORE PRINCIPLES (FROM CLIENT PRD — ALL PRESERVED)

### P1 — Immutable Event Ledger
Every transaction is append-only. No updates or deletes on event data. Corrections create new events referencing original events.

```javascript
const TransactionEventSchema = new Schema({
  entity_id: { type: ObjectId, required: true },
  bdm_id: { type: ObjectId, required: true },
  event_type: { type: String, required: true },
  event_date: { type: Date, required: true },
  document_ref: String,
  source_image_url: { type: String, required: true },
  ocr_raw_json: Schema.Types.Mixed,
  confirmed_fields: { type: Schema.Types.Mixed, required: true },
  payload: { type: Schema.Types.Mixed, required: true },
  status: { type: String, default: 'ACTIVE', enum: ['ACTIVE', 'DELETED'] },
  corrects_event_id: { type: ObjectId, ref: 'TransactionEvent' },
  created_by: { type: ObjectId, required: true },
  created_at: { type: Date, default: Date.now, immutable: true }
});

// Prevent updates on immutable fields
TransactionEventSchema.pre('findOneAndUpdate', function() {
  const update = this.getUpdate();
  const immutableFields = ['event_type', 'event_date', 'document_ref',
    'source_image_url', 'confirmed_fields', 'payload', 'created_by', 'created_at'];
  immutableFields.forEach(f => { delete update[f]; delete update.$set?.[f]; });
});
```

### P2 — OCR-Assisted, Human-Confirmed
OCR pre-fills forms from photos. BDMs always confirm. Low confidence = red highlight = BDM must correct.

### P3 — Zero Hardcoding
Every entity that can change lives in a database collection. BDMs, territories, products, banks, cards, payment modes, tax rates — all admin-managed.

### P4 — Live Date Partition
Each BDM has `live_date` in their profile. CSI dates before `live_date` → OPENING_AR. CSI dates on/after → SALES_LINES with inventory movement. Enforced at application level.

### P5 — One CR Per Hospital
One Collection Receipt = one hospital. System-enforced hard rule.

### P6 — Finance Controls VAT Filing
Every output and input VAT entry starts as PENDING. Finance tags: INCLUDE, EXCLUDE, or DEFER.

### P7 — Four-View Financial Reporting
Every journal entry has BIR_FLAG and VAT_FLAG. Four reports: Internal P&L, BIR Income Tax P&L, VAT Return 2550Q, Withholding Tax Summary.

### P8 — Governance-First, Lookup-Driven Structure
President, Admin, and Finance are the system control layer. They own the setup and maintenance of the structures that all other users depend on.

- Entity structure, subsidiary structure, and inter-entity relationships
- People structure, reporting lines, role assignments, and approval paths
- Master data and lookups such as products, hospitals, vendors, banks, cards, payment modes, tax tables, cost centers, compensation settings, and COA
- Access control boundaries, visibility rules, and approval authority

The ERP must remain scalable and must not depend on hardcoded business options in code or UI. Wherever possible, business choices must come from controlled master data, setup tables, and API lookups maintained by President/Admin/Finance.

Operational users work inside the structure defined above. Transactions, reports, accounting behavior, approvals, and dashboard visibility must inherit from entity structure and people structure rather than one-off logic. If President/Admin/Finance setup is incomplete or inconsistent, downstream modules become unreliable.

### 2.1 ERP Design Reference Standards

**Client Direction (March 31, 2026):** Use SAP, NetSuite, or QuickBooks as standard references for all ERP patterns and workflows.

| VIP-IP Module | SAP Equivalent | NetSuite Equivalent | QuickBooks Equivalent |
|---------------|---------------|--------------------|-----------------------|
| Sales (CSI) | SD Sales Order → Billing Document | Sales Order → Invoice | Invoice / Sales Receipt |
| Collections (CR) | FI-AR Incoming Payment | Customer Payment | Receive Payment |
| Inventory (GRN) | MM Goods Receipt | Item Receipt | Inventory Adjustment |
| Expenses (SMER, ORE) | FI-AP Vendor Invoice | Vendor Bill | Expense / Bill |
| Income / Payslip | HR Payroll Posting | Payroll Journal | Payroll |
| PNL | CO Profitability Analysis | Financial Reports | Profit & Loss |
| Journals | FI General Ledger | GL Impact | Journal Entry |
| **People & Payroll [v5]** | **HR Master Data** | **Employee Center** | **Payroll Module** |
| **AP / Purchasing [v5]** | **MM Purchasing** | **Procurement** | **Bills / Vendors** |
| **Bank Recon [v5]** | **FI Bank Statement** | **Bank Reconciliation** | **Bank Feeds** |

**Document Lifecycle Pattern (all transactional modules):**

| Stage | SAP Term | NetSuite Term | QuickBooks Term | VIP-IP Term |
|-------|----------|---------------|-----------------|-------------|
| Data entry (free typing) | Park | Pending Saved | Draft | **DRAFT** |
| Validation check | Check | Pending Approval | Review | **VALIDATE** |
| Finalized / locked | Post | Approved | Save/Post | **POSTED** |
| Correction after posting | Storno / Reverse | Void + Re-enter | Void + Re-enter | **RE-OPEN** |

**Key design principle:** Validation happens on-demand (when BDM clicks "Validate"), NOT per-keystroke.

**Interpretation note:**
- **Current Live Baseline** = behavior already confirmed in the client's Excel + Apps Script ERP.
- **Webapp Target** = the SAP-oriented design described in this PRD.
- **Upgrade** = a target behavior that intentionally goes beyond the current workbook implementation.

---

## 3. MASTER DATA — MONGODB COLLECTIONS

### 3.1 Settings Collection (Zero Hardcoding)
```javascript
{
  PERDIEM_RATE_DEFAULT: 800,
  PERDIEM_MD_FULL: 8,
  PERDIEM_MD_HALF: 3,
  FUEL_EFFICIENCY_DEFAULT: 12,
  REVOLVING_FUND_AMOUNT: 8000,
  VAT_RATE: 0.12,
  PROFIT_SHARE_BDM_PCT: 0.30,
  PROFIT_SHARE_VIP_PCT: 0.70,
  NEAR_EXPIRY_DAYS: 120,
  DEFAULT_PAYMENT_TERMS: 30,
  PROFIT_SHARE_MIN_PRODUCTS: 5,
  PROFIT_SHARE_MIN_HOSPITALS: 2,
  MD_MAX_PRODUCT_TAGS: 3,
  PS_CONSECUTIVE_MONTHS: 3,
  COLLECTION_OK_THRESHOLD: 0.70,
  SCPWD_DISCOUNT_RATE: 0.20,
  CWT_RATE_WC158: 0.01,
  CONSIGNMENT_AGING_DEFAULT: 90,
  ENFORCE_AUTHORITY_MATRIX: false,
  // [v5 NEW] Expense anomaly threshold
  EXPENSE_ANOMALY_THRESHOLD: 0.30  // 30% month-over-month change triggers ALERT
}
```

### 3.2 Hospital Master (Unified with BDM Tagging)
```javascript
const HospitalSchema = new Schema({
  entity_id: ObjectId,
  hospital_name: { type: String, required: true },
  hospital_name_clean: { type: String, unique: true },
  tin: String,
  address: String,
  contact_person: String,
  payment_terms: { type: Number, default: 30 },
  vat_status: { type: String, enum: ['VATABLE', 'EXEMPT', 'ZERO'], default: 'VATABLE' },
  cwt_rate: { type: Number, default: 0.01 },
  atc_code: { type: String, default: 'WC158' },
  credit_limit: { type: Number, default: null },
  credit_limit_action: { type: String, enum: ['WARN', 'BLOCK'], default: 'WARN' },
  is_top_withholding_agent: { type: Boolean, default: false },
  hospital_type: String,
  bed_capacity: Number,
  level: String,
  purchaser_name: String,
  purchaser_phone: String,
  chief_pharmacist_name: String,
  chief_pharmacist_phone: String,
  key_decision_maker: String,
  engagement_level: { type: Number, min: 1, max: 5 },
  major_events: [String],
  programs_to_level_5: String,
  tagged_bdms: [{
    bdm_id: ObjectId,
    tagged_by: ObjectId,
    tagged_at: { type: Date, default: Date.now },
    is_active: { type: Boolean, default: true }
  }],
  status: { type: String, default: 'ACTIVE' }
});
```

### 3.3 Product Master (Identity Only — No Batch)
```javascript
const ProductMasterSchema = new Schema({
  entity_id: ObjectId,
  item_key: { type: String, unique: true },
  generic_name: { type: String, required: true },
  brand_name: { type: String, required: true },
  dosage_strength: String,
  sold_per: String,
  purchase_price: { type: Number, required: true },
  selling_price: { type: Number, required: true },
  vat_status: { type: String, enum: ['VATABLE', 'EXEMPT', 'ZERO'], default: 'VATABLE' },
  category: String,
  is_active: { type: Boolean, default: true },
  description: String,
  key_benefits: String,
  image_url: String,
  added_by: ObjectId,
  added_at: { type: Date, default: Date.now }
});
```

### 3.4 Inventory Ledger (Batch-Level, Immutable)
```javascript
const InventoryLedgerSchema = new Schema({
  entity_id: { type: ObjectId, required: true },
  bdm_id: { type: ObjectId, required: true },
  product_id: { type: ObjectId, ref: 'ProductMaster', required: true },
  batch_lot_no: { type: String, required: true },
  expiry_date: { type: Date, required: true },
  transaction_type: {
    type: String, required: true,
    enum: ['OPENING_BALANCE', 'GRN', 'CSI', 'DR_SAMPLING',
           'DR_CONSIGNMENT', 'RETURN_IN', 'TRANSFER_OUT',
           'TRANSFER_IN', 'ADJUSTMENT']
  },
  qty_in: { type: Number, default: 0 },
  qty_out: { type: Number, default: 0 },
  running_balance: { type: Number, required: true },
  event_id: { type: ObjectId, ref: 'TransactionEvent' },
  fifo_override: { type: Boolean, default: false },
  override_reason: {
    type: String,
    enum: ['HOSPITAL_POLICY', 'QA_REPLACEMENT', 'DAMAGED_BATCH', 'BATCH_RECALL']
  },
  recorded_at: { type: Date, default: Date.now, immutable: true },
  recorded_by: { type: ObjectId, required: true }
});
```

### 3.5 BDM Profile (Extended User Model)

```javascript
{
  // Existing CRM fields preserved:
  // email, password, role, regions, status, etc.

  // ERP fields:
  territory_id: ObjectId,
  entity_id: ObjectId,
  live_date: Date,
  bdm_stage: {
    type: String, default: 'CONTRACTOR',
    enum: ['CONTRACTOR', 'PS_ELIGIBLE', 'TRANSITIONING', 'SUBSIDIARY', 'SHAREHOLDER']
  },
  compensation: {
    perdiem_rate: Number,
    perdiem_days: { type: Number, default: 22 },
    km_per_liter: Number,
    fuel_overconsumption_threshold: { type: Number, default: 1.30 },
    effective_date: Date
  },
  compensation_history: [{
    perdiem_rate: Number,
    km_per_liter: Number,
    effective_date: Date,
    set_by: ObjectId,
    reason: String,
    created_at: { type: Date, default: Date.now }
  }],
  sss_no: String,
  pagibig_no: String,
  philhealth_no: String,
  date_of_birth: Date,
  contract_type: String,
  date_started: Date
}
```

### 3.6 Admin-Managed Lookup Collections

```javascript
// bank_accounts collection
{ bank_code, bank_name, account_no, account_type, coa_code, is_active }

// credit_cards collection
{ card_code, card_name, card_holder, bank, card_type, coa_code, is_active }

// payment_modes collection
{ mode_code, mode_label, mode_type, requires_calf, coa_code, is_active }

// csi_booklet_master collection
{ entity_id, bir_auth_number, series_start, series_end,
  invoices_per_set, copies_per_set, date_bir_issued, status }

// csi_allocation_batch collection
{ bdm_id, entity_id, booklet_id, week_date, allocation_mode,
  allocated_by, allocated_at, notes }

// csi_allocation collection
{ batch_id, bdm_id, entity_id, invoice_number,
  status: ['AVAILABLE', 'USED', 'VOID', 'RETURNED'],
  used_at, used_on_event_id }

// consignment_terms collection
{ hospital_id, product_id, max_days_before_alert,
  max_days_before_force_csi, set_by, effective_date }

// expense_components collection (configurable)
{ component_code, component_name, or_required, calf_required, is_active }
```

### 3.7 [v5 NEW] Government Rates Collection

Admin-managed, versioned by `effective_date` so rates update without code changes. Covers Philippine government-mandated deductions for employees and employer contributions.

```javascript
const GovernmentRatesSchema = new Schema({
  rate_type: {
    type: String, required: true,
    enum: ['SSS', 'PHILHEALTH', 'PAGIBIG', 'WITHHOLDING_TAX', 'EC', 'DE_MINIMIS']
  },
  effective_date: { type: Date, required: true },
  expiry_date: Date,  // null = currently active
  // Bracket-based rates (SSS, withholding tax)
  brackets: [{
    min_salary: Number,
    max_salary: Number,
    employee_share: Number,
    employer_share: Number,
    ec: Number  // Employees Compensation (employer-only, SSS bracket)
  }],
  // Flat-rate (PhilHealth, PagIBIG)
  flat_rate: Number,         // e.g. 0.05 for PhilHealth 5%
  employee_split: Number,    // e.g. 0.50 for 50/50
  employer_split: Number,
  min_contribution: Number,
  max_contribution: Number,
  // De minimis limits
  benefit_limits: [{
    benefit_code: String,    // RICE, CLOTHING, MEDICAL, LAUNDRY, ACHIEVEMENT
    description: String,
    limit_amount: Number,
    limit_period: String     // MONTHLY, YEARLY
  }],
  set_by: ObjectId,
  notes: String,
  created_at: { type: Date, default: Date.now }
});
```

### 3.8 [v5 NEW] Chart of Accounts Collection

See §11.1 for full schema and account code ranges.

### 3.9 [v5 NEW] Budget Allocation Collection

```javascript
const BudgetAllocationSchema = new Schema({
  entity_id: ObjectId,
  target_type: { type: String, enum: ['BDM', 'DEPARTMENT', 'EMPLOYEE'] },
  target_id: ObjectId,       // bdm_id, dept_id, or person_id
  target_name: String,
  period: String,             // YYYY-MM
  components: [{
    component_code: String,   // SMER, GAS, INSURANCE, ACCESS, COMMISSION
    budgeted_amount: Number
  }],
  total_budget: Number,
  approved_by: ObjectId,
  approved_at: Date,
  status: { type: String, enum: ['DRAFT', 'APPROVED', 'CLOSED'], default: 'DRAFT' }
});
```

---

## 4. MODULE 1 — DOCUMENT CAPTURE (OCR ENGINE)

### 4.1 OCR Implementation

All OCR specifications from Client PRD v3.3 Sections 7.1-7.7 are preserved.

```javascript
router.post('/api/erp/ocr/process', auth, upload.single('photo'), async (req, res) => {
  const s3Url = await uploadToS3(req.file, buildDocPath(req.user, req.body.docType));
  const visionResult = await googleVisionOCR(s3Url);

  let extracted;
  switch (req.body.docType) {
    case 'CSI': extracted = parseCSI(visionResult); break;
    case 'CR':  extracted = parseCR(visionResult); break;
    case 'CWT_2307': extracted = parse2307(visionResult); break;
    case 'DEPOSIT_SLIP': extracted = parseDepositSlip(visionResult); break;
    case 'OR': extracted = parseOR(visionResult); break;
    case 'SHELL_CARD': extracted = parseShellCard(visionResult); break;
    case 'GAS_RECEIPT': extracted = parseGasReceipt(visionResult); break;
    case 'ODOMETER': extracted = parseOdometer(visionResult); break;
    case 'UNDERTAKING': extracted = parseUndertaking(visionResult); break;
    case 'DR': extracted = parseDR(visionResult); break;  // [v5] upgraded to full OCR
    default: extracted = { raw: visionResult.text };
  }

  const withConfidence = addConfidenceFlags(extracted, visionResult);
  res.json({ s3_url: s3Url, extracted: withConfidence, raw_ocr: visionResult });
});
```

### S3 Document Storage Structure
```
s3://vip-pharmacy-crm-devs/
  └── erp-documents/
      └── {bdm_full_name}/
          └── {YYYY-MM}/
              ├── C1/
              │   ├── csi-photos/
              │   ├── cr-photos/
              │   ├── cwt-certificates/
              │   ├── deposit-slips/
              │   ├── or-receipts/
              │   ├── calf-forms/
              │   ├── prf-forms/
              │   ├── car-logbook/
              │   │   ├── odometer-photos/
              │   │   └── gasoline-receipts/
              │   ├── dr-photos/
              │   └── grn/
              │       ├── waybills/
              │       └── undertakings/
              └── C2/
                  └── (same structure)
```

### 4.2 [v5 NEW] Document Requirements Matrix

Single reference table for all document types — which need OCR extraction vs photo-only proof.

#### OCR Documents (10) — Fields Extracted Automatically

| # | Document | OCR Level | Fields Extracted | When Required | Who Uploads | Parser |
|---|----------|-----------|-----------------|---------------|-------------|--------|
| 1 | **CSI (printed)** | Full | Invoice No, Date, Hospital, Products (3-line), Qty, Price, Amount, VAT | Every sale | BDM | `csiParser.js` |
| 2 | **CSI (handwritten)** | Assisted | Same as printed, lower confidence — more red flags | Handwritten invoices | BDM | `csiParser.js` |
| 3 | **Collection Receipt (CR)** | Full | CR No, Date, Hospital, Amount, Check No, Bank, CSI stub list | Every collection | BDM | `crParser.js` |
| 4 | **CWT Certificate 2307** | Full | Payor TIN, Payee TIN, ATC Code, Amount, Tax Withheld | When hospital withholds tax | BDM | `cwtParser.js` |
| 5 | **Deposit Slip** | Full | Bank, Date, Amount, Reference No | Every bank deposit | BDM | `depositParser.js` |
| 6 | **OR (Official Receipt)** | Full | OR No, Date, Supplier, Amount, VAT | Every expense claim (ORE, ACCESS) | BDM | `orParser.js` |
| 7 | **Shell Card / Gas Receipt** | Full | Date, Liters, Price/Liter, Total | Every fuel purchase | BDM | `shellParser.js` |
| 8 | **Odometer** | Partial | Reading, Date (from timestamp) | Twice daily (morning + night) | BDM | `odometerParser.js` |
| 9 | **Undertaking of Receipt** | Full | Brand, Generic, Dosage, Batch, Expiry, Qty | Every GRN (goods received) | BDM | 3-line parser (same as CSI) |
| 10 | **DR (Delivery Receipt)** | **Full [v5 UPGRADE]** | **DR#, Date, Hospital, Products, Qty, Batch/Lot, Type (sampling/consignment)** | **Every delivery to hospital** | **BDM** | **`drParser.js`** |

#### Photo-Only Documents (3) — Stored as Proof, No Field Extraction

| # | Document | OCR | Purpose | When Required | Who Uploads |
|---|----------|-----|---------|---------------|-------------|
| 11 | **Waybill** | None | Proof of goods shipment | Every GRN alongside Undertaking | BDM |
| 12 | **CALF Form** | None | Cash Advance & Liquidation proof | All non-cash payments (except: cash mode, President, ORE) | BDM |
| 13 | **PRF Form** | None | Payment Requisition Form proof | All partner rebate payments | BDM |

#### [v5 NEW] DR OCR Upgrade Rationale

In PRD v4, DR was classified as "Classification only" — detecting sampling vs consignment text but not extracting structured fields. **v5 upgrades DR to full OCR** because:

1. **DR creates inventory movement** — `DR_CONSIGNMENT` deducts items from BDM warehouse into consignment pool
2. **OCR extracts structured data** — DR#, Date, Hospital, Products, Qty, Batch/Lot auto-populate `ConsignmentTracker`
3. **CSI must reference DR** — when hospital consumes consigned items, CSI references the originating DR
4. **Double-deduction prevention** — system knows CSI for consigned items should NOT deduct inventory again (already deducted at DR stage)
5. **Without DR OCR** — consignment pool must be manually entered, risking errors and double-deductions

---

## 5. MODULE 2 — SALES MANAGEMENT

All business rules from Client PRD v3.3 Sections 8.1-8.4 preserved.

### 5.1 Sales Entry Collection
```javascript
const SalesLineSchema = new Schema({
  entity_id: ObjectId,
  bdm_id: ObjectId,
  event_id: { type: ObjectId, ref: 'TransactionEvent' },
  source: { type: String, enum: ['SALES_LINE', 'OPENING_AR'], required: true },
  hospital_id: { type: ObjectId, ref: 'Hospital', required: true },
  csi_date: { type: Date, required: true },
  doc_ref: { type: String, required: true },
  line_items: [{
    product_id: { type: ObjectId, ref: 'ProductMaster' },
    item_key: String,
    batch_lot_no: String,
    qty: { type: Number, required: true },
    unit: String,
    unit_price: { type: Number, required: true },
    line_total: Number,
    vat_amount: Number,
    net_of_vat: Number,
    fifo_override: { type: Boolean, default: false },
    override_reason: String,
    // [v5 NEW] Consignment reference
    consignment_tracker_id: ObjectId,  // if this CSI converts consigned items
    dr_ref: String                      // originating DR number
  }],
  invoice_total: Number,
  total_vat: Number,
  total_net_of_vat: Number,
  status: {
    type: String, default: 'DRAFT',
    enum: ['DRAFT', 'VALID', 'ERROR', 'POSTED', 'DELETION_REQUESTED']
  },
  posted_at: Date,
  posted_by: { type: ObjectId, ref: 'User' },
  reopen_count: { type: Number, default: 0 },
  validation_errors: [{ row_index: Number, field: String, message: String, severity: String }],
  is_reversal: { type: Boolean, default: false },
  reverses_sales_line_id: { type: ObjectId, ref: 'SalesLine' },
  deletion_event_id: ObjectId,
  created_at: { type: Date, default: Date.now, immutable: true }
});

SalesLineSchema.pre('save', async function() {
  const bdm = await User.findById(this.bdm_id);
  this.source = this.csi_date < bdm.live_date ? 'OPENING_AR' : 'SALES_LINE';
});
```

### 5.2 CSI Allocation Validation
At CSI capture, system validates invoice number against BDM's allocation:
1. If CSI date < BDM's live_date → skip allocation check (OPENING_AR)
2. If no allocations exist for this BDM → skip check
3. Otherwise → invoice number must be in BDM's AVAILABLE allocation or BLOCKED

### 5.3 CSI Correction Process
BDM requests deletion → Finance approves → DELETION_EVENT created → BDM re-captures → NEW_EVENT created. Original image retained permanently. Full audit trail.

### 5.4 Consignment Sales
DR → Consignment pool → Partial consumption tracking → CSI for consumed items. See §7.3 for full consignment tracking workflow.

### 5.5 BDM Sales Data Entry Workflow (SAP Park → Check → Post)

#### Step 1 - TYPE FREELY (Status: DRAFT)
- BDM enters sales — no lag, no blocks, no popups
- Auto-fills: BDM/Territory, Unit/Price, LineTotal, TaxTag
- System does NOT validate individual keystrokes

#### Step 2 - EDIT / DELETE (Status: DRAFT)
- BDM can change any cell, delete rows, paste rows
- No ghost rows, no lock errors, no stale data

#### Step 3 - VALIDATE (Status: VALID or ERROR)
- BDM clicks "Validate Sales" when ready
- System rebuilds inventory FRESH from InventoryLedger, then checks EVERY row:
  - Stock available? (FIFO check against rebuilt inventory)
  - No duplicates? (same doc_ref + hospital + product)
  - All required fields filled?
  - No future dates?
  - CSI number in allocation range?
  - **[v5] If CSI references DR: validate qty ≤ remaining consignment qty**
  - DR=CR balance check on computed totals

#### Step 4 - FIX & RE-VALIDATE
- BDM fixes flagged rows, clicks Validate again
- Repeats until ALL rows are VALID

#### Step 5 - SUBMIT (Status: VALID → POSTED)
- Hard gate: only works if ALL rows are VALID
- Creates TransactionEvent + InventoryLedger entries (FIFO consumption)
- **[v5] CSI referencing DR: NO inventory deduction (already deducted at DR stage), only AR created**
- POSTED rows are read-only

#### Step 6 - RE-OPEN (Status: POSTED → DRAFT)
- Clears POSTED flag, rows return to DRAFT
- `reopen_count` increments, audit log records who/when/reason

#### Workflow API Endpoints
```javascript
// POST /api/erp/sales/validate
// POST /api/erp/sales/submit
// POST /api/erp/sales/reopen
```

---

## 6. MODULE 3 — COLLECTIONS ENGINE

All business rules from Client PRD v3.3 Sections 9.1-9.5 preserved.

### 6.1 Collection Session Collection
```javascript
const CollectionSchema = new Schema({
  entity_id: ObjectId,
  bdm_id: ObjectId,
  event_id: { type: ObjectId, ref: 'TransactionEvent' },
  hospital_id: { type: ObjectId, ref: 'Hospital', required: true },
  cr_no: { type: String, required: true },
  cr_date: { type: Date, required: true },
  settled_csis: [{
    sales_line_id: ObjectId,
    doc_ref: String,
    csi_date: Date,
    invoice_amount: Number,
    source: String,
    commission_rate: Number,
    commission_amount: Number,
    partner_tags: [{
      md_name: String,
      md_id: ObjectId,
      rebate_pct: Number,
      rebate_amount: Number
    }]
  }],
  cwt_rate: Number,
  cwt_amount: Number,
  cwt_certificate_url: String,
  cwt_na: { type: Boolean, default: false },
  payment_mode: String,
  check_no: String,
  check_date: Date,
  bank: String,
  deposit_date: Date,
  deposit_slip_url: String,
  total_csi_amount: Number,
  cr_amount: Number,
  status: {
    type: String, default: 'DRAFT',
    enum: ['DRAFT', 'VALID', 'ERROR', 'POSTED', 'DELETION_REQUESTED']
  },
  posted_at: Date,
  posted_by: ObjectId,
  validation_errors: [{ field: String, message: String, severity: String }],
  cr_photo_url: { type: String, required: true },
  created_at: { type: Date, default: Date.now, immutable: true }
});

CollectionSchema.pre('save', function() {
  const expectedCR = this.total_csi_amount - (this.cwt_amount || 0);
  const diff = Math.abs(this.cr_amount - expectedCR);
  if (diff > 1.00) {
    this.validation_flags = this.validation_flags || [];
    this.validation_flags.push({
      type: 'CR_AMOUNT_MISMATCH', expected: expectedCR,
      actual: this.cr_amount, difference: diff
    });
  }
});
```

### 6.2 Collection Session Flow
Two entry modes:
- **Mode A — Hospital-First:** Select hospital → see open CSIs → select which are being paid
- **Mode B — CSI-First:** Capture CSI photo → OCR reads CSI number → auto-match to hospital

Hard gate: CSI photos + CR photo + CWT certificate (or N/A) + Deposit slip — ALL required before submit.

---

## 7. MODULE 4 — INVENTORY ENGINE

All business rules from Client PRD v3.3 Sections 10.1-10.4 preserved.

Inventory movements: GRN (supplier receipt), CSI (sale), DR_SAMPLING, DR_CONSIGNMENT, TRANSFER, ADJUSTMENT. FIFO enforcement with BDM batch-override (4 pre-approved reasons). Stock on hand computed from inventory_ledger aggregation. Reorder alerts per product via `reorder_rules`.

Finance-only actions: add products, approve GRNs, approve physical count adjustments, set reorder thresholds.

### 7.2 [v5 NEW] Stock Visibility Rules

**BDMs can ONLY see stock on hand in their own warehouse/territory.** This is enforced by the Mongoose middleware in §1.3.

| Role | Stock Visibility | Enforcement |
|------|-----------------|-------------|
| **BDM** | **Own territory only** | `bdm_id` filter auto-applied on all InventoryLedger queries |
| **Sales Rep** | Own assigned territory only | Same `bdm_id` filter |
| **Admin** | All territories | `entity_id` filter only (no `bdm_id` restriction) |
| **Finance** | All territories | `entity_id` filter only |
| **President** | All entities, all territories | No filter |

```javascript
// Example: BDM queries stock on hand
// Mongoose middleware automatically adds: .where({ bdm_id: loggedInBdmId })
const stock = await InventoryLedger.aggregate([
  { $match: { entity_id, bdm_id } },  // auto-injected by middleware
  { $group: {
    _id: { product_id: '$product_id', batch_lot_no: '$batch_lot_no' },
    balance: { $last: '$running_balance' }
  }},
  { $match: { balance: { $gt: 0 } } }
]);
// BDM only sees their own warehouse — no cross-territory visibility
```

### 7.3 [v5 EXPANDED] Consignment & DR Tracking

#### 7.3.1 DR Capture & OCR [v5 UPGRADE]

DR (Delivery Receipt) is now **full OCR** (upgraded from classification-only in v4). OCR extracts: DR#, Date, Hospital, Products, Qty, Batch/Lot.

#### 7.3.2 DR Classification

OCR text analysis + BDM confirmation determines type:
- **DR_SAMPLING** — free samples/donations (cost center: marketing expense)
- **DR_CONSIGNMENT** — items placed at hospital for future sale (consignment pool)

#### 7.3.3 Inventory Impact of DR

DR_CONSIGNMENT creates `qty_out` from BDM warehouse → items move to consignment pool. Items are **NOT sold** — no AR, no revenue. Just inventory movement.

#### 7.3.4 Consignment Pool

```javascript
const ConsignmentTrackerSchema = new Schema({
  entity_id: ObjectId,
  bdm_id: ObjectId,
  hospital_id: { type: ObjectId, ref: 'Hospital', required: true },
  hospital_name: String,
  dr_ref: { type: String, required: true },
  dr_date: { type: Date, required: true },
  product_id: { type: ObjectId, ref: 'ProductMaster', required: true },
  item_key: String,
  batch_lot_no: String,
  qty_delivered: { type: Number, required: true },
  qty_consumed: { type: Number, default: 0 },
  qty_remaining: Number,  // auto-computed: qty_delivered - qty_consumed
  conversions: [{
    csi_doc_ref: String,
    csi_date: Date,
    qty_converted: Number,
    sales_line_id: ObjectId
  }],
  days_outstanding: Number,   // auto-computed from dr_date
  aging_status: {
    type: String,
    enum: ['OPEN', 'OVERDUE', 'COLLECTED', 'FORCE_CSI'],
    default: 'OPEN'
  },
  max_days_alert: Number,      // from consignment_terms lookup
  max_days_force_csi: Number,
  dr_photo_url: String,
  status: {
    type: String,
    enum: ['ACTIVE', 'FULLY_CONSUMED', 'RETURNED', 'EXPIRED'],
    default: 'ACTIVE'
  },
  created_at: { type: Date, default: Date.now, immutable: true },
  created_by: ObjectId
});
```

#### 7.3.5 CSI-DR Reference Chain [v5 KEY RULE]

This is the critical rule preventing double inventory deduction:

1. CSI for consigned items **MUST** reference the originating DR (`dr_ref` + `consignment_tracker_id`)
2. **Validation:** CSI qty ≤ remaining consignment qty from referenced DR
3. **Inventory:** CSI for consigned items does **NOT** create additional inventory deduction (already deducted at DR stage)
4. **AR:** CSI creates AR entry (sale recognized) and updates consignment pool (`qty_consumed += CSI qty`)

#### 7.3.6 Partial Consumption

Hospital uses some items → BDM issues CSI for consumed qty only. Remaining qty stays in consignment pool. Multiple CSIs can reference the same DR.

#### 7.3.7 Consignment Aging

Per `consignment_terms` collection — default 90 days, configurable per hospital/product:
- **OPEN** — within alert threshold
- **OVERDUE** — exceeds `max_days_before_alert` (default 90 days)
- **FORCE_CSI** — exceeds `max_days_before_force_csi` → system flags for mandatory CSI issuance

#### 7.3.8 Double-Deduction Prevention Summary

| Scenario | Inventory Deduction | AR Created |
|----------|:------------------:|:----------:|
| Regular CSI (non-consignment) | YES (FIFO from warehouse) | YES |
| DR_CONSIGNMENT | YES (warehouse → consignment pool) | NO |
| CSI referencing DR (consigned items) | **NO** (already out at DR stage) | YES |
| DR_SAMPLING | YES (warehouse → expense) | NO |

**System enforcement:** If `SalesLine.line_items[].consignment_tracker_id` is set, skip inventory deduction during Submit.

---

## 8. MODULE 5 — BDM FIELD OPERATIONS (PNL)

### 8.1 SMER Per Diem
```javascript
const SmerEntrySchema = new Schema({
  entity_id: ObjectId,
  bdm_id: ObjectId,
  cycle: { type: String, enum: ['C1', 'C2'] },
  period: String,
  daily_entries: [{
    day: Number,
    day_of_week: String,
    hospital_covered: String,
    md_count: Number,
    perdiem_tier: String,
    perdiem_amount: Number,
    transpo_p2p: Number,
    transpo_special: Number,
    car_logbook_ref: ObjectId,
    notes: String
  }],
  total_perdiem: Number,
  total_transpo: Number,
  total_special_cases: Number,
  total_ore: Number,
  gasoline_personal: Number,
  total_reimbursable: Number,
  travel_advance: Number,
  balance_on_hand: Number,
  status: { type: String, default: 'DRAFT', enum: ['DRAFT', 'VALID', 'ERROR', 'POSTED'] }
});

function computePerdiemTier(mdCount, settings) {
  if (mdCount >= settings.PERDIEM_MD_FULL) return 'FULL';
  if (mdCount >= settings.PERDIEM_MD_HALF) return 'HALF';
  return 'ZERO';
}
```

### 8.2 Car Logbook
```javascript
const CarLogbookEntrySchema = new Schema({
  entity_id: ObjectId,
  bdm_id: ObjectId,
  date: { type: Date, required: true },
  starting_km: { type: Number, required: true },
  starting_km_photo_url: String,
  ending_km: Number,
  ending_km_photo_url: String,
  total_km: Number,
  personal_km: { type: Number, default: 0 },
  official_km: Number,
  fuel_entries: [{
    station_name: String,
    fuel_type: String,
    liters: Number,
    price_per_liter: Number,
    total_cost: Number,
    receipt_url: String,
    payment_mode: String,
    calf_required: Boolean
  }],
  expected_official_liters: Number,
  expected_personal_liters: Number,
  actual_liters: Number,
  personal_gas_amount: Number,
  efficiency_variance: Number,
  overconsumption_flag: Boolean,
  status: { type: String, default: 'DRAFT', enum: ['DRAFT', 'VALID', 'ERROR', 'POSTED'] }
});
```

### 8.3 Other Expense Modules

- **ORE (Other Reimbursable Expenses):** Date, establishment, particulars, amount, OR photo. Cash-based, no CALF required.
- **ACCESS:** Company-mode payments — credit card, GCash, bank transfer. OR required, CALF required for non-cash.
- **PRF:** Payment requisition form — photo as proof, no OCR. Required for all partner rebate payments.
- **CALF:** Cash advance & liquidation — photo as proof, no OCR. Required for all non-cash payments except: cash mode, President entries, ORE.

All follow: DRAFT → VALID → ERROR → POSTED lifecycle.

### 8.4 Partners' Insurance / Rebates
Entered at collection time per CSI per MD. Rebate = Net of VAT x %. Each MD independent %. PRF required. BIR_FLAG = INTERNAL_ONLY.

### 8.5 Expense Summary
Auto-computed per cycle (C1/C2):
1. SMER Reimbursables (excl. Gasoline Personal)
2. Gasoline less Personal (Car Logbook)
3. Partners' Insurance (sum of rebate entries)
4. ACCESS Total (company-mode expenses)
5. CORE (commission earned)

---

## 9. MODULE 6 — COMMISSION AND PROFIT SHARE ENGINE

All business rules from Client PRD v3.3 Sections 14.1-14.3 preserved exactly.

### 9.1 Commission — Per CSI, Manual Rate
Rate entered by BDM at collection time per CSI. Commission = Net of VAT x rate. Rates: typically 3% standard, 5% premium.

### 9.2 Profit Share — Per Product Eligibility

- **Condition A:** Product ordered by ≥ 2 hospitals
- **Condition B:** ≥ 1 MD tagged per product per collection, max 3 products per MD
- **Condition C:** A + B met for 3 consecutive months. Profit share starts Month 4.

Deficit month → revert to commission, streak maintained. Break in conditions → streak resets.

### 9.3 Profit Share Computation

Net Territory Revenue (PS products only) = Collections (net VAT) − COGS (FIFO) − SMER − Gas less Personal − Partners' Insurance − ACCESS − Sampling DR cost − Depreciation − Loan amortization.

If Net > 0: BDM 30%, VIP 70%. If Net ≤ 0: PS products revert to commission.

---

## 10. [v5 NEW] MODULE 7 — PEOPLE MASTER & PAYROLL

### 10.1 People Master Schema

Covers all person types: BDMs, office staff (Admin, Marketing), sales reps, consultants, directors.

```javascript
const PeopleMasterSchema = new Schema({
  entity_id: { type: ObjectId, required: true },
  person_type: {
    type: String, required: true,
    enum: ['BDM', 'EMPLOYEE', 'SALES_REP', 'CONSULTANT', 'DIRECTOR']
  },
  // Link to CRM User model (if applicable)
  user_id: { type: ObjectId, ref: 'User' },
  // Personal info
  full_name: { type: String, required: true },
  first_name: String,
  last_name: String,
  position: String,
  department: String,
  employment_type: {
    type: String,
    enum: ['REGULAR', 'PROBATIONARY', 'CONTRACTUAL', 'CONSULTANT', 'PARTNERSHIP']
  },
  date_hired: Date,
  date_regularized: Date,
  date_separated: Date,
  date_of_birth: Date,
  civil_status: { type: String, enum: ['SINGLE', 'MARRIED', 'WIDOWED', 'SEPARATED'] },
  // Government IDs
  government_ids: {
    sss_no: String,
    philhealth_no: String,
    pagibig_no: String,
    tin: String
  },
  // Bank account for payroll
  bank_account: {
    bank: String,
    account_no: String,
    account_name: String
  },
  // Compensation profile reference
  comp_profile_id: { type: ObjectId, ref: 'CompProfile' },
  is_active: { type: Boolean, default: true },
  status: { type: String, default: 'ACTIVE', enum: ['ACTIVE', 'ON_LEAVE', 'SEPARATED'] },
  created_at: { type: Date, default: Date.now },
  created_by: ObjectId
});
```

### 10.2 Compensation Profile Schema

Three employee types with different compensation structures:

```javascript
const CompProfileSchema = new Schema({
  person_id: { type: ObjectId, ref: 'PeopleMaster', required: true },
  entity_id: ObjectId,
  effective_date: { type: Date, required: true },
  salary_type: {
    type: String, required: true,
    enum: ['FIXED_SALARY', 'COMMISSION_BASED', 'HYBRID']
  },

  // === FIXED SALARY COMPONENTS (Office staff: Admin, Marketing) ===
  basic_salary: { type: Number, default: 0 },
  rice_allowance: { type: Number, default: 0 },
  clothing_allowance: { type: Number, default: 0 },
  medical_allowance: { type: Number, default: 0 },
  laundry_allowance: { type: Number, default: 0 },
  transport_allowance: { type: Number, default: 0 },

  // === INCENTIVE COMPONENTS (Sales Reps — not BDMs) ===
  incentive_type: {
    type: String,
    enum: ['CASH', 'IN_KIND', 'COMMISSION', 'NONE'],
    default: 'NONE'
  },
  incentive_rate: Number,          // % if commission-based
  incentive_description: String,   // description of in-kind or cash incentive
  incentive_cap: Number,           // max incentive per period (if applicable)

  // === BDM-SPECIFIC (carried from v4) ===
  perdiem_rate: Number,
  perdiem_days: { type: Number, default: 22 },
  km_per_liter: Number,
  fuel_overconsumption_threshold: { type: Number, default: 1.30 },

  // === GOVERNMENT MANDATORY FIELDS ===
  tax_status: {
    type: String,
    enum: ['S', 'S1', 'S2', 'ME', 'ME1', 'ME2', 'ME3', 'ME4'],
    default: 'S'
  },
  // These are looked up from GovernmentRates collection at computation time
  // Stored here for audit trail of what rate was applied

  set_by: ObjectId,
  reason: String,
  created_at: { type: Date, default: Date.now }
});

// Compensation history is maintained by creating new CompProfile documents
// with new effective_date. Query: find latest where effective_date <= target_date.
```

**Employee types:**
| Type | salary_type | Key Fields | Example |
|------|-------------|-----------|---------|
| Office staff (Admin, Marketing) | FIXED_SALARY | basic_salary + allowances | Admin assistant, marketing coordinator |
| Sales reps (not BDMs yet) | HYBRID | basic_salary + incentive (cash/in-kind/commission) | Territory sales rep with base + commission |
| BDMs | COMMISSION_BASED | perdiem + commission + profit share (no basic salary) | Field BDM under partnership agreement |

### 10.3 Payslip Generation

#### BDM Payslip (per cycle C1/C2) — carried from v4
```
Earnings:
  SMER (per diem + transport + reimbursables)
  CORE (commission on collections)
  Bonus (manual)
  Profit Sharing (if applicable)
  Reimbursements

Deductions:
  Cash Advance
  Credit Card Payment
  Credit Payment
  Purchased Goods
  Other Deductions
  Over Payment

Net Pay = Total Earnings - Total Deductions
```

#### Employee Payslip (monthly) — [v5 NEW]
```
Gross Pay:
  Basic Salary
  Rice Allowance (de minimis, tax-exempt up to ₱2,000/mo)
  Clothing Allowance (de minimis, tax-exempt up to ₱6,000/yr)
  Medical Cash Allowance (de minimis, tax-exempt up to ₱1,500/mo)
  Laundry Allowance (de minimis, tax-exempt up to ₱300/mo)
  Transport Allowance
  Incentive / Commission (for HYBRID type)
  Overtime (if applicable)

Employee Deductions:
  SSS Employee Share (based on MSC bracket from GovernmentRates)
  PhilHealth Employee Share (premium × 50%)
  PagIBIG Employee Share (1-2% based on salary)
  Withholding Tax (BIR TRAIN law graduated rates)
  Other Deductions (loans, advances, etc.)

Net Pay = Gross Pay - Total Employee Deductions

Employer Contributions (NOT deducted from employee, recorded separately):
  SSS Employer Share (based on MSC bracket)
  PhilHealth Employer Share (premium × 50%)
  PagIBIG Employer Share (2%)
  EC - Employees Compensation (employer-only, part of SSS bracket)
```

```javascript
const PayslipSchema = new Schema({
  entity_id: ObjectId,
  person_id: { type: ObjectId, ref: 'PeopleMaster', required: true },
  person_type: String,  // BDM, EMPLOYEE, SALES_REP
  period: String,       // YYYY-MM
  cycle: String,        // C1, C2, or MONTHLY
  // Earnings
  earnings: {
    basic_salary: { type: Number, default: 0 },
    rice_allowance: { type: Number, default: 0 },
    clothing_allowance: { type: Number, default: 0 },
    medical_allowance: { type: Number, default: 0 },
    laundry_allowance: { type: Number, default: 0 },
    transport_allowance: { type: Number, default: 0 },
    incentive: { type: Number, default: 0 },
    overtime: { type: Number, default: 0 },
    // BDM-specific
    smer: { type: Number, default: 0 },
    core_commission: { type: Number, default: 0 },
    profit_sharing: { type: Number, default: 0 },
    bonus: { type: Number, default: 0 },
    reimbursements: { type: Number, default: 0 },
    total_earnings: Number
  },
  // Employee deductions
  deductions: {
    sss_employee: { type: Number, default: 0 },
    philhealth_employee: { type: Number, default: 0 },
    pagibig_employee: { type: Number, default: 0 },
    withholding_tax: { type: Number, default: 0 },
    cash_advance: { type: Number, default: 0 },
    cc_payment: { type: Number, default: 0 },
    credit_payment: { type: Number, default: 0 },
    purchased_goods: { type: Number, default: 0 },
    other_deductions: { type: Number, default: 0 },
    over_payment: { type: Number, default: 0 },
    total_deductions: Number
  },
  net_pay: Number,
  // Employer contributions (not deducted from employee)
  employer_contributions: {
    sss_employer: { type: Number, default: 0 },
    philhealth_employer: { type: Number, default: 0 },
    pagibig_employer: { type: Number, default: 0 },
    ec: { type: Number, default: 0 },  // Employees Compensation
    total_employer: Number
  },
  // Computation metadata
  comp_profile_snapshot: Schema.Types.Mixed,  // snapshot of rates used
  gov_rates_snapshot: Schema.Types.Mixed,     // snapshot of gov rates applied
  status: {
    type: String, default: 'DRAFT',
    enum: ['DRAFT', 'COMPUTED', 'REVIEWED', 'APPROVED', 'POSTED']
  },
  computed_at: Date,
  reviewed_by: ObjectId,
  reviewed_at: Date,
  approved_by: ObjectId,
  approved_at: Date,
  posted_at: Date,
  created_at: { type: Date, default: Date.now, immutable: true }
});
```

### 10.4 [v5 NEW] Government Mandatories — Philippine Standard

All rates stored in `GovernmentRates` collection (§3.7) and versioned by `effective_date`.

#### SSS (Social Security System) — RA 11199

| Field | Description |
|-------|-------------|
| Basis | Monthly Salary Credit (MSC) bracket |
| Employee Share | Based on bracket (ranges from ₱180 to ₱1,350+) |
| Employer Share | Based on bracket (ranges from ₱380 to ₱2,850+) |
| EC (Employees Compensation) | Employer-only, based on bracket (₱10-₱30) |
| Contribution Cap | MSC ceiling (currently ₱30,000, increasing per schedule) |

#### PhilHealth — RA 11223 (Universal Health Care)

| Field | Description |
|-------|-------------|
| Premium Rate | 5% of basic salary (as of 2025) |
| Employee Share | 50% of premium |
| Employer Share | 50% of premium |
| Floor | ₱10,000 monthly salary (minimum contribution basis) |
| Ceiling | ₱100,000 monthly salary (maximum contribution basis) |

#### PagIBIG (Home Development Mutual Fund) — RA 9679

| Field | Description |
|-------|-------------|
| Employee Share | 1% (if salary ≤ ₱1,500) or 2% (if salary > ₱1,500) |
| Employer Share | 2% of basic salary |
| Maximum MSC | ₱5,000 (maximum monthly compensation for computation) |

#### Withholding Tax — BIR TRAIN Law (RA 10963)

Graduated rates for compensation income (annual basis, applied monthly):

| Annual Taxable Income | Tax Rate |
|----------------------|----------|
| ₱0 – ₱250,000 | 0% |
| ₱250,001 – ₱400,000 | 15% of excess over ₱250,000 |
| ₱400,001 – ₱800,000 | ₱22,500 + 20% of excess over ₱400,000 |
| ₱800,001 – ₱2,000,000 | ₱102,500 + 25% of excess over ₱800,000 |
| ₱2,000,001 – ₱8,000,000 | ₱402,500 + 30% of excess over ₱2,000,000 |
| Over ₱8,000,000 | ₱2,202,500 + 35% of excess over ₱8,000,000 |

Tax status codes: S (Single), S1/S2 (Single with dependents), ME (Married), ME1-ME4 (Married with dependents).

#### EC (Employees Compensation) — Employer Only

| Field | Description |
|-------|-------------|
| Paid by | Employer only (NOT deducted from employee) |
| Rate | Based on SSS MSC bracket (₱10-₱30 per month) |
| Purpose | Work-related injury/illness coverage |

### 10.5 [v5 NEW] De Minimis Benefits

Tax-exempt benefits per Philippine BIR regulations:

| Benefit | Monthly Limit | Annual Limit | Field in CompProfile |
|---------|:------------:|:------------:|---------------------|
| Rice Subsidy | ₱2,000 | ₱24,000 | `rice_allowance` |
| Clothing Allowance | — | ₱6,000 | `clothing_allowance` |
| Medical Cash Allowance | ₱1,500 | ₱18,000 | `medical_allowance` |
| Laundry Allowance | ₱300 | ₱3,600 | `laundry_allowance` |
| Achievement Awards | — | ₱10,000 | Manual entry |

Amounts within limits are **tax-exempt**. Amounts exceeding limits are added to taxable income for withholding tax computation.

### 10.6 [v5 NEW] 13th Month Pay

```
13th Month Pay = Total Basic Salary Earned During the Year ÷ 12

Rules:
- Mandatory for all employees (including separated employees, pro-rata)
- Deadline: On or before December 24
- Tax-exempt up to ₱90,000 (combined with other benefits)
- Excess over ₱90,000 is taxable
- Includes: basic salary only (NOT allowances, commission, overtime)
- For employees who worked < 12 months: pro-rata computation
```

### 10.7 [v5 NEW] Staging-Then-Post Pattern

All payroll computations follow the PNL Central staging pattern:

1. **Compute** → entries appear in staging (PEOPLE_STAGING equivalent)
2. **Review** → Finance/Admin reviews computed entries
3. **Approve** → Set `Approved = YES` on correct rows
4. **Post** → Approved entries create journal entries in the accounting engine (§11)

Journal entries for payroll:
```
DR: 6000 Salaries Expense       (basic salary)
DR: 6050 Allowances Expense     (de minimis + transport)
DR: 6100 Sales Force Per Diem   (BDM SMER)
DR: 5100 BDM Commission         (commission)
DR: 5200 Profit Share            (profit sharing)
    CR: 2200 SSS Payable         (employee + employer share)
    CR: 2210 PhilHealth Payable  (employee + employer share)
    CR: 2220 PagIBIG Payable     (employee + employer share)
    CR: 2230 Withholding Tax Payable
    CR: 1010-1014 Cash/Bank      (net pay to employee)
```

---

## 11. [v5 NEW] MODULE 8 — VIP ACCOUNTING ENGINE

Full accounting module adapted from BDM PNL Central live system.

### 11.1 Chart of Accounts

```javascript
const ChartOfAccountsSchema = new Schema({
  entity_id: { type: ObjectId, required: true },
  account_code: { type: String, required: true },
  account_name: { type: String, required: true },
  account_type: {
    type: String, required: true,
    enum: ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']
  },
  account_subtype: String,
  normal_balance: { type: String, enum: ['DEBIT', 'CREDIT'], required: true },
  bir_flag: { type: String, enum: ['BOTH', 'INTERNAL', 'BIR'], default: 'BOTH' },
  is_active: { type: Boolean, default: true },
  parent_code: String
});

// Compound unique: one code per entity
ChartOfAccountsSchema.index({ entity_id: 1, account_code: 1 }, { unique: true });
```

#### Account Code Ranges (from PNL Central)

| Range | Category | Examples |
|-------|----------|---------|
| **1000-1014** | Cash & Bank | RCBC (1010), SBC (1011), MBTC (1012), UB (1013), Cash on Hand (1014) |
| **1100-1220** | Receivables | AR Trade (1100), AR BDM (1110), Input VAT (1210), CWT Receivable (1220) |
| **1200** | Inventory | FIFO-costed inventory |
| **2000-2400** | Liabilities | AP Trade (2000), Output VAT (2100), EWT Payable (2200), SSS Payable (2200), PhilHealth Payable (2210), PagIBIG Payable (2220), Withholding Tax Payable (2230), CC lines (2310-2315) |
| **3000-3200** | Equity | Owner Capital (3000), Drawings (3100), Retained Earnings (3200) |
| **4000-4200** | Revenue | Sales Vatable (4000), Sales Exempt (4100), Other Income (4200) |
| **5000-5300** | Cost of Sales | COGS (5000), BDM Commission (5100), Profit Share (5200) |
| **6000-7100** | Operating Expenses | Salaries (6000), Allowances (6050), Per Diem (6100), Marketing (6200), ACCESS (6400/6410), Transport/Gas (6610), Rent, IT, etc. |
| **8000-8200** | BIR-Only | Personal Expense BIR (8000), Owner Advance Exp (8100), BDM Advance Exp (8200) |

### 11.2 Journal Entry Engine

#### 11.2.1 Double-Entry Principle
Every transaction creates balanced debit and credit entries. Total DR must equal Total CR.

```javascript
const JournalEntrySchema = new Schema({
  entity_id: { type: ObjectId, required: true },
  bdm_id: ObjectId,  // optional — null for company-level entries
  je_number: { type: Number, required: true },  // auto-increment per entity
  je_date: { type: Date, required: true },
  period: { type: String, required: true },  // YYYY-MM
  description: { type: String, required: true },
  source_module: {
    type: String,
    enum: ['SALES', 'COLLECTION', 'EXPENSE', 'COMMISSION', 'AP', 'PAYROLL',
           'DEPRECIATION', 'INTEREST', 'PEOPLE_COMP', 'VAT', 'OWNER', 'MANUAL']
  },
  lines: [{
    account_code: { type: String, required: true },
    account_name: String,
    debit: { type: Number, default: 0 },
    credit: { type: Number, default: 0 },
    description: String,
    bdm_id: ObjectId,  // line-level BDM tag for per-territory reporting
    cost_center: String
  }],
  bir_flag: { type: String, enum: ['BOTH', 'INTERNAL', 'BIR'], default: 'BOTH' },
  vat_flag: { type: String, enum: ['VATABLE', 'EXEMPT', 'ZERO', 'N/A'], default: 'N/A' },
  total_debit: { type: Number, required: true },
  total_credit: { type: Number, required: true },
  status: { type: String, default: 'DRAFT', enum: ['DRAFT', 'POSTED', 'VOID'] },
  posted_by: ObjectId,
  posted_at: Date,
  corrects_je_id: { type: ObjectId, ref: 'JournalEntry' },
  is_reversal: { type: Boolean, default: false },
  created_by: { type: ObjectId, required: true },
  created_at: { type: Date, default: Date.now, immutable: true }
});

// Pre-post validation: DR must equal CR
JournalEntrySchema.pre('save', function() {
  if (this.status === 'POSTED') {
    const diff = Math.abs(this.total_debit - this.total_credit);
    if (diff > 0.01) {
      throw new Error(`Journal entry out of balance: DR=${this.total_debit}, CR=${this.total_credit}`);
    }
  }
});
```

#### 11.2.2 BIR Flag System

| BIR Flag | PNL_INTERNAL | PNL_BIR | Meaning |
|----------|:---:|:---:|---------|
| **BOTH** | Yes | Yes | Legitimate business expense — deductible for BIR |
| **INTERNAL** | Yes | No | Real expense but not BIR-deductible (e.g., personal with no OR) |
| **BIR** | No | Yes | Special BIR deductions (e.g., personal expenses with official receipt) |

#### 11.2.3 Auto-Journal Posting from Modules

| Source Module | Debit | Credit | BIR Flag |
|--------------|-------|--------|----------|
| **Sales (CSI)** | 1100 AR Trade | 4000 Sales Revenue + 2100 Output VAT | BOTH |
| **Collections (CR)** | 1010-1014 Cash/Bank | 1100 AR Trade | BOTH |
| **CWT on Collection** | 1220 CWT Receivable | 1100 AR Trade | BOTH |
| **BDM Expenses - SMER** | 6100 Per Diem | 1110 AR BDM Advances | INTERNAL |
| **BDM Expenses - Gas** | 6610 Transportation | 1110 AR BDM Advances | BOTH |
| **BDM Expenses - Insurance** | 6000 (varies) | 1110 AR BDM Advances | BOTH |
| **BDM Expenses - ACCESS** | 6400/6410 ACCESS | 1110 AR BDM Advances | BOTH |
| **Commission** | 5100 BDM Commission | 1110 AR BDM Advances | BOTH |
| **Payroll** | 6000 Salaries + 6050 Allowances | 2200-2230 Payables + Cash | BOTH |
| **AP (Supplier Invoice)** | 1200 Inventory + 1210 Input VAT | 2000 AP Trade | BOTH |
| **Depreciation** | 7000 Depreciation Exp | 1XXX Accumulated Depreciation | BOTH |
| **Interest** | 7050 Interest Expense | 2XXX Loan Payable | BOTH |
| **Owner Infusion** | 1010-1014 Cash/Bank | 3000 Owner Capital | N/A |
| **Owner Drawing** | 3100 Owner Drawings | 1010-1014 Cash/Bank | N/A |

#### 11.2.4 Reversal Journals (SAP Storno)

No deletes — corrections create contra-entries:
1. Original JE stays POSTED (never deleted)
2. Reversal JE: same accounts, opposite amounts, `corrects_je_id` pointing to original
3. New corrective JE created
4. Net effect: original + reversal + correction = correct amount, full audit trail

### 11.3 Trial Balance

- Aggregates all POSTED journal entries by account code
- Shows: Total Debits, Total Credits, Net Balance per account
- Balance Status: **NORMAL** (matches expected DR/CR direction) or **ABNORMAL**
- Bottom line: Total DR must equal Total CR (difference = 0)

### 11.4 Profit & Loss — Four Views

#### 11.4.1 PNL_INTERNAL (Management View)
```
REVENUE
  Sales Vatable (4000)
  Sales Exempt (4100)
  Total Revenue

COST OF SALES
  COGS (5000)
  BDM Commission (5100)
  Profit Share (5200)
  Total Cost of Sales

GROSS PROFIT = Revenue - Cost of Sales (GP Margin %)

OPERATING EXPENSES
  [Grouped by subtype: Salaries, Marketing, Transport, etc.]
  Total Operating Expenses

OPERATING INCOME = Gross Profit - Operating Expenses (OP Margin %)

OTHER INCOME (4200)

NET INCOME (Internal) = Operating Income + Other Income (Net Margin %)
```
Includes entries with BIRFlag = BOTH or INTERNAL.

#### 11.4.2 PNL_BIR (Tax View)
Same structure as Internal, but:
- Excludes entries flagged INTERNAL (not deductible)
- Includes entries flagged BIR (special deductions)
- Adds section: ADDITIONAL BIR DEDUCTIONS (account codes 8000+)

#### 11.4.3 VAT Return 2550Q
Quarterly VAT return computation. See §11.5.

#### 11.4.4 CWT 2307 Summary
Per customer per quarter withholding tax. See §11.5.

### 11.5 VAT & CWT Compliance

#### 11.5.1 VAT Ledger

```javascript
const VatLedgerSchema = new Schema({
  entity_id: ObjectId,
  period: String,  // YYYY-MM
  vat_type: { type: String, enum: ['OUTPUT', 'INPUT'], required: true },
  source_module: { type: String, enum: ['COLLECTION', 'SUPPLIER_INVOICE'] },
  source_doc_ref: String,
  source_event_id: ObjectId,
  hospital_or_vendor: String,
  tin: String,
  gross_amount: Number,
  vat_amount: Number,         // gross × 12/112 for VAT-inclusive
  finance_tag: {
    type: String, default: 'PENDING',
    enum: ['PENDING', 'INCLUDE', 'EXCLUDE', 'DEFER']
  },
  tagged_by: ObjectId,
  tagged_at: Date,
  created_at: { type: Date, default: Date.now, immutable: true }
});
```

**VAT Rules (Cash Basis):**
- Output VAT recognized only on **collections** (not on invoicing)
- Input VAT recognized on supplier invoices
- VAT-inclusive pricing: extract using **12/112** formula
- Filing: Form **2550Q** quarterly
- **Net VAT Payable = Output VAT - Input VAT**

#### 11.5.2 VAT Return 2550Q
Quarterly computation from VAT Ledger entries tagged as INCLUDE.

#### 11.5.3 CWT Ledger

```javascript
const CwtLedgerSchema = new Schema({
  entity_id: ObjectId,
  bdm_id: ObjectId,
  period: String,
  hospital_id: ObjectId,
  hospital_tin: String,
  cr_no: String,
  cr_date: Date,
  cr_amount: Number,
  cwt_rate: { type: Number, default: 0.01 },
  cwt_amount: Number,
  atc_code: { type: String, default: 'WC158' },
  quarter: { type: String, enum: ['Q1', 'Q2', 'Q3', 'Q4'] },
  year: Number,
  created_at: { type: Date, default: Date.now, immutable: true }
});
```

#### 11.5.4 CWT 2307 Summary
Per customer per quarter for BIR Form 2307. Hospitals withhold 1% on goods when they pay. CWT Receivable offsets Income Tax Payable quarterly.

#### 11.5.5 Finance Tagging Workflow
Every VAT entry starts as PENDING. Finance reviews and tags: INCLUDE, EXCLUDE, or DEFER.

### 11.6 Cashflow Statement

```javascript
const CashflowStatementSchema = new Schema({
  entity_id: ObjectId,
  period: String,  // YYYY-MM
  operating: {
    collections: Number,
    supplier_payments: Number,
    expense_payments: Number,
    tax_payments: Number,
    net_operating: Number
  },
  investing: {
    asset_purchases: Number,
    asset_disposals: Number,
    net_investing: Number
  },
  financing: {
    owner_infusions: Number,
    owner_drawings: Number,
    loan_proceeds: Number,
    loan_repayments: Number,
    net_financing: Number
  },
  net_change: Number,
  opening_cash: Number,
  closing_cash: Number,
  generated_at: Date,
  generated_by: ObjectId
});
```

### 11.7 AR Consolidated
All outstanding invoices across all BDMs with aging buckets (CURRENT, 1-30, 31-60, 61-90, 90+). Color-coded: green → yellow → orange → red.

### 11.8 AP Consolidated
All payables by due date from supplier invoices. See §15.

### 11.9 Fixed Assets & Depreciation

```javascript
const FixedAssetSchema = new Schema({
  entity_id: ObjectId,
  asset_code: { type: String, required: true },
  asset_name: { type: String, required: true },
  category: String,
  acquisition_date: Date,
  acquisition_cost: { type: Number, required: true },
  useful_life_months: { type: Number, required: true },
  salvage_value: { type: Number, default: 0 },
  depreciation_method: { type: String, default: 'STRAIGHT_LINE' },
  accumulated_depreciation: { type: Number, default: 0 },
  net_book_value: Number,
  status: { type: String, enum: ['ACTIVE', 'DISPOSED', 'FULLY_DEPRECIATED'], default: 'ACTIVE' }
});
```

**Workflow:**
1. Register assets in FIXED_ASSETS
2. Run **Compute Depreciation** → entries appear in DEPRN_STAGING
3. Review and set **Approved = YES**
4. Run **Post Approved Depreciation** → JEs posted to journal

### 11.10 Loans & Amortization

```javascript
const LoanMasterSchema = new Schema({
  entity_id: ObjectId,
  loan_code: { type: String, required: true },
  lender: String,
  purpose: String,
  principal: { type: Number, required: true },
  annual_rate: { type: Number, required: true },
  term_months: { type: Number, required: true },
  start_date: Date,
  monthly_payment: Number,
  total_interest: Number,
  outstanding_balance: Number,
  status: { type: String, enum: ['ACTIVE', 'PAID', 'RESTRUCTURED'], default: 'ACTIVE' }
});
```

**Workflow:** Same staging pattern as depreciation.

### 11.11 Owner Equity Ledger

Capital infusions (YES) and withdrawals/drawings (NO). Running balance tracked. Bank and BIR flag per entry.

### 11.12 Month-End Close Procedure (29-Step SOP)

Adapted from BDM PNL Central live system.

**Pre-Requisites:**
- CURRENT_PERIOD set (YYYY-MM)
- All BDMs have validated their expense data
- All BDMs have completed C1 and C2 income sheets

#### Phase 1: Data Collection (Steps 1-6)
| Step | Action |
|------|--------|
| 1 | Pull/aggregate journals from all BDM transactions |
| 2 | Pull goods received (GRN) for FIFO |
| 3 | Pull stock on hand |
| 4 | Pull BDM expenses |
| 5 | Pull BDM payslips |
| 6 | Pull BDM commissions |

#### Phase 2: Processing (Steps 7-9)
| Step | Action |
|------|--------|
| 7 | Match GRN to Purchase Orders |
| 8 | Rebuild FIFO cost layers |
| 9 | Consume FIFO (compute COGS) |

#### Phase 3: Journal Posting (Steps 10-13)
| Step | Action |
|------|--------|
| 10 | Post BDM expenses to journal |
| 11 | Post commissions to journal |
| 12 | Post AP entries |
| 13 | Post cash basis VAT |

#### Phase 4: Tax Compliance (Steps 14-15)
| Step | Action |
|------|--------|
| 14 | Build VAT Ledger |
| 15 | Build CWT Ledger |

#### Phase 5: Financial Reports (Steps 16-17)
| Step | Action |
|------|--------|
| 16 | Build Trial Balance |
| 17 | Build P&L (Internal + BIR) + AR + AP + Settlement |

#### Phase 6: Review & Staging (Steps 18-25)
| Step | Action |
|------|--------|
| 18 | Compute Depreciation → review staging |
| 19 | Compute Interest → review staging |
| 20 | Compute People Compensation → review staging |
| 21 | **PAUSE** — Finance reviews all staging sheets |
| 22 | Approve correct rows |
| 23 | Post Approved Depreciation |
| 24 | Post Approved Interest |
| 25 | Post People Compensation |

#### Phase 7: Finalize (Steps 26-29)
| Step | Action |
|------|--------|
| 26 | Build Cashflow Statement |
| 27 | Run Bank Reconciliation per bank |
| 28 | Verify Trial Balance (DR = CR) |
| 29 | **Finalize Month Close** — locks period |

**Automated option:** "Run Full Month Close" executes Steps 1-17 automatically with progress tracking and error logging.

---

## 12. MODULE 9 — REPORT CYCLE AND INCOME RELEASE

### Report Status Workflow
```
GENERATED → REVIEWED → RETURNED → BDM_CONFIRMED → CREDITED
```

### BDM_CONFIRMED Gate (All Required)
- All CSI photos captured
- All CR photos captured
- All CWT certificates (or N/A) confirmed
- All deposit slips captured
- Commission rate entered for each CSI
- All non-cash ORs have CALF attached
- All partner rebate entries have PRF
- BDM digital signature on cycle report

### BDM Income Computation (per cycle)
See §10.3 for full payslip generation.

### Document Deadlines
- C1 physical documents: on or before 23rd of month
- C2 physical documents: on or before 8th of following month
- Late = income credit deferred to next cycle

---

## 13. MODULE 10 — CRM INTEGRATION

### Phase 1 (Before CRM API)
- MD tagged manually in ERP at collection time
- SMER MD count entered manually by BDM

### Phase 3 (After CRM API Connected)
Same MongoDB database — direct database access:
```javascript
const todayVisits = await Visit.find({
  user: bdmId,
  visitDate: { $gte: startOfDay, $lte: endOfDay }
}).populate('doctor');
const mdCount = todayVisits.length;  // auto-populates SMER
```

**CRM → ERP:** Visit count → SMER, VIP Client profiles → MD validation, Hospital profiles → shared master, Product assignments → context, Schedule → Engagements card, Doctor list → VIP Clients tab.

**ERP → CRM:** Stock on hand → BDM sees availability, AR balances per hospital → shown before visit, Partner insurance → linked to VIP Client profile.

---

## 14. [v5 EXPANDED] REPORTS, ANALYTICS & SOA

### 14.1 SOA Generation (3 methods)
- Method 1: Per hospital
- Method 2: From SOA picklist
- Method 3: Bulk SOA (all hospitals with balance)
- Export: PDF, Excel

### 14.2 AR Reports
- AR Aging (Current, 1-30, 31-60, 61-90, 90+)
- AR Ledger per hospital
- AR Consolidated (all territories)
- Collection efficiency (70% threshold)
- CWT Receivable report

### 14.3 Executive Dashboard
Territory performance, company KPIs, alerts (near-expiry, reorder, overdue AR, BIR deadlines).

### 14.4 BDM Performance Reports
Sales by product, collection rate, AR aging, expense breakdown, commission per product, profit share status, combined CRM + ERP metrics.

### 14.5 ERP Dashboard Layout
See PRD v4 §13.5 for full dashboard card layout (Summary Cards, MTD Metrics, Bottom Tabs).

### 14.6 [v5 NEW] Performance Ranking

Adapted from PNL Central RPT_BDM_RANKING + RPT_MOM_TREND.

#### Net Cash Ranking
- Ranks all BDMs and Sales Reps by **Net Cash = Collections - Expenses**
- Also shows: Sales, Collection %, Territory
- **Top 3 highlighted green, bottom 3 highlighted red**
- Filterable by: period, territory, person_type (BDM, SALES_REP)

#### Month-over-Month Trend
- 6-month rolling window per person
- Shows: Sales, Sales Growth %, Collections, Collection Growth %, Expenses, Expense Growth %

#### Sales & Collections Trackers
- Full year (Jan-Dec) by person
- One tracker for sales, one for collections
- Sorted by Year Total descending

### 14.7 [v5 NEW] Consolidated Consignment Aging

Cross-BDM consolidated view for Admin/Finance:

| Column | Source |
|--------|--------|
| BDM Name | ConsignmentTracker.bdm_id |
| Territory | BDM profile |
| Hospital | ConsignmentTracker.hospital_name |
| DR# | ConsignmentTracker.dr_ref |
| DR Date | ConsignmentTracker.dr_date |
| Product | ConsignmentTracker.item_key |
| Qty Delivered | ConsignmentTracker.qty_delivered |
| Qty Consumed | ConsignmentTracker.qty_consumed |
| Qty Remaining | qty_delivered - qty_consumed |
| Days Outstanding | today - dr_date |
| Aging Status | OPEN / OVERDUE / COLLECTED / FORCE_CSI |

**Sort order:** OVERDUE first, then FORCE_CSI, then OPEN, then COLLECTED.
**Drill-down:** Click BDM name → filtered view for that territory.

### 14.8 [v5 NEW] Expense Anomaly Detection

Adapted from PNL Central RPT_EXPENSE_ANOMALIES.

- Compares **current period vs prior period** per person per expense component
- Flags any component with **>30% change** (configurable via SETTINGS.EXPENSE_ANOMALY_THRESHOLD) as **ALERT**
- Components monitored: SMER, GasOfficial, Insurance, ACCESS, CoreComm
- Sorted by absolute change % (biggest swings first)
- **Extends to employees with allocated budgets** (from BudgetAllocation §3.9):
  - Shows: Budgeted vs Actual per component
  - Flags: OVER_BUDGET when actual > budgeted for any component
  - Variance %: (Actual - Budget) / Budget × 100

### 14.9 [v5 NEW] Fuel Efficiency Report

Per-BDM fuel efficiency tracking:
- Reads Car Logbook entries
- Compares actual gas cost vs expected (Official KM ÷ km_per_liter × avg price)
- Flags variance **>30%** as **OVER 30%**

### 14.10 [v5 NEW] Cycle Status Dashboard

Tracks each BDM's payslip cycle through the state machine (§12):
```
PENDING → GENERATED → REVIEWED → RETURNED → BDM_CONFIRMED → CREDITED
```
Dashboard shows: completion %, lists behind-schedule BDMs, auto-timestamps on status changes.

---

## 15. [v5 NEW] MODULE 12 — PURCHASING & AP

Promoted from deferred. Adapted from PNL Central procurement module.

### 15.1 Vendor Master
```javascript
const VendorMasterSchema = new Schema({
  entity_id: ObjectId,
  vendor_code: { type: String, required: true },
  vendor_name: { type: String, required: true },
  tin: String,
  address: String,
  contact_person: String,
  phone: String,
  email: String,
  payment_terms: { type: Number, default: 30 },
  vat_status: { type: String, enum: ['VATABLE', 'EXEMPT', 'ZERO'], default: 'VATABLE' },
  bank_account: { bank: String, account_no: String, account_name: String },
  is_active: { type: Boolean, default: true }
});
```

### 15.2 Purchase Orders
PO headers + line items. Status: DRAFT → APPROVED → RECEIVED → CLOSED.

### 15.3 3-Way Matching
PO line → GRN line → Supplier Invoice line. All three must match (qty, price) before AP is recorded.

### 15.4 AP Ledger & Aging
Outstanding payables aged by due date. Aging buckets: CURRENT, 1-30, 31-60, 61-90, 90+.

### 15.5 GRNI (Goods Received Not Invoiced)
Tracks goods received but not yet invoiced by supplier.

### 15.6 AP Payment Recording
Records payment to supplier. DR: AP Trade (2000) / CR: Cash/Bank (1010-1014).

---

## 16. [v5 NEW] MODULE 13 — BANKING & CASH

### 16.1 Bank Accounts Master
```javascript
{ entity_id, bank_code, bank_name, account_no, account_type, coa_code, is_active }
// Banks: RCBC (1010), SBC (1011), MBTC (1012), UB (1013)
```

### 16.2 Bank Reconciliation
Statement vs book reconciliation. Matches bank statement entries to journal entries. Shows: matched, unmatched (book only), unmatched (bank only).

### 16.3 Credit Card Ledger
CC transaction tracking per card. Links to CALF forms and expense entries.

### 16.4 Bank Import & Auto-Match
Import bank statement CSVs → auto-match to journal entries by amount + date + reference.

---

## 17. SAP-EQUIVALENT IMPROVEMENTS — PRIORITY MATRIX

| # | Improvement | Impact | Effort | SAP Equivalent | Target Phase |
|---|-------------|--------|--------|----------------|--------------|
| 1 | **Reversal journals** | Critical | Medium | FI Storno | §11.2.4 |
| 2 | **Year-end close + retained earnings** | Critical | Medium | FI Year-End Close | §11.12 |
| 3 | **Pre-post DR=CR validation** | Critical | Low | FI Document Check | §11.2 |
| 4 | **Audit log** | High | Low | Change Documents | Phase 1 |
| 5 | **Recurring journal templates** | High | Low | FI Recurring Documents | Phase 3 |
| 6 | **Cost center dimension** | High | Low | CO Cost Centers | Phase 3 |
| 7 | **Budget vs actual** | High | Medium | CO Planning | §14.8 |
| 8 | **Credit limit management** | Medium | Medium | SD Credit Management | §3.2 |
| 9 | **Dunning / collection follow-up** | Medium | Medium | FI-AR Dunning | Phase 2 |
| 10 | **Three-way matching** | Medium | Medium | MM Invoice Verification | §15.3 |
| 11 | **Document flow tracking** | Medium | Low | Document Flow | Phase 2 |
| 12 | **Per-module period locks** | Low | Low | Posting Period Variant | §11.12 |
| 13 | **Batch posting with IDs** | Low | Medium | Batch Input | Phase 3 |
| 14 | **Opening balance migration** | Low | Low | FI Opening Balances | Phase 1 |
| 15 | **Data archival** | Low | Medium | Data Archiving | Phase 3 |

---

## 18. USER ROLES AND PERMISSIONS

| Role | CRM Access | ERP Access | Special Rules |
|------|-----------|-----------|---------------|
| **BDM** | Log visits, manage VIP Clients in own region | Sales, collections, expenses, **own warehouse stock only**, view AR/income | Own territory data only |
| **Sales Rep [v5]** | Same as BDM (if CRM access granted) | Sales, collections, expenses, own territory stock, incentive tracking | Own territory, HYBRID comp |
| **Admin** | All CRM features | All ERP + products, hospitals, settings, profit sharing, approve GRN | All territories |
| **Finance Officer** | Read-only CRM | Full ERP + VAT tagging, AP, **journal posting**, BIR compliance, **payroll approval**, bank recon | VIP Accounting tier |
| **President (GV)** | Full CRM | Full ERP + delete transactions, approve income release | CALF never required, override any gate |
| **CEO** | Read-only CRM | View-only: Dashboard, PNL, summaries | No edit access |

---

## 19. DEVELOPMENT PHASES

### Phase 1 — Core ERP Foundation (Months 1-3)
- Auth & shared (extend User model with ERP fields)
- Master data (Settings, Products, Hospitals, Lookups)
- Sales management (CSI, validation, FIFO, audit trail)
- Inventory engine (GRN, auto-issue, stock on hand, **consignment tracking**)
- Collections engine (CR, CWT, commission, partner tags)
- AR (aging, SOA, opening AR import)
- Expenses (SMER, Car Logbook, ORE, ACCESS, PRF/CALF)
- Income & PNL (BDM payslip, territory PNL)
- Reports (sales, collection, expense summaries)

### Phase 2 — OCR + Advanced Features (Months 4-5)
- Google Vision API integration
- All 10 OCR parsers (including **DR full OCR [v5]**)
- CSI allocation control
- Consignment/DR tracking with **CSI-DR reference chain [v5]**
- Profit share eligibility engine
- Cycle report workflow
- Sampling/transfer flows
- Push notifications

### Phase 3 — Accounting, Payroll, Intelligence (Months 6-8) [v5 PROMOTED]
- **[v5] People Master & Payroll** (§10)
- **[v5] Government mandatories** (SSS, PhilHealth, PagIBIG, Tax)
- **[v5] Chart of Accounts + General Ledger** (§11.1-11.2)
- **[v5] Trial Balance + 4-View P&L** (§11.3-11.4)
- **[v5] VAT Filing with Finance tagging** (§11.5)
- **[v5] Fixed Assets + Depreciation** (§11.9)
- **[v5] Loans + Amortization** (§11.10)
- **[v5] Owner Equity Ledger** (§11.11)
- **[v5] Month-End Close procedure** (§11.12)
- **[v5] Purchasing & AP** (§15)
- **[v5] Banking & Cash** (§16)
- CRM → ERP integration (MD count auto-populate, AR in CRM)
- **[v5] Performance ranking reports** (§14.6)
- **[v5] Consolidated consignment aging** (§14.7)
- **[v5] Expense anomaly detection** (§14.8)
- **[v5] 13th Month Pay, Dividends** (§10.6)
- Full executive analytics dashboard

---

## 20. SUCCESS METRICS

| Metric | Current | Target 12 Months |
|--------|---------|-----------------|
| BDM encoding time per cycle | 30-60 min | < 5 min |
| Consolidation time | 2-4 hours | < 1 minute |
| CSI printing errors/waste | Multiple/month | Zero |
| Human encoding errors | Unknown | < 1% |
| Time to onboard new BDM | 2-3 days | < 30 min |
| Monthly P&L generation | 1-2 days | < 1 minute |
| BDM income disputes | Manual resolution | Zero disputes |
| Audit trail completeness | Partial | 100% (image + data) |
| Inventory accuracy | Spot-checked | Real-time FIFO-exact |
| **[v5] Payroll processing time** | **Manual (Excel)** | **< 10 min per cycle** |
| **[v5] Month-end close time** | **2-4 hours (manual)** | **< 30 min (automated steps 1-17)** |
| **[v5] Government compliance accuracy** | **Manual lookup** | **100% (rate tables in DB)** |

---

## 21. DECISION LOG

All 69 decisions from Client PRD v3.3 Appendix A are honored. Key adaptations:

| # | Client Decision | MERN Adaptation |
|---|----------------|----------------|
| 57 | Immutable events, database trigger | Mongoose schema immutable fields + pre-save hooks |
| 58 | Multi-tenant, row-level security | entity_id on all documents + Mongoose middleware |
| 1 | Cash basis VAT (RR 16-2005) | Deferred output VAT tracked in collection documents |
| 2 | FIFO per batch | inventory_ledger sorted by expiry_date, consume oldest first |
| 54 | CRM integration via REST API | Direct database access (same MongoDB instance) |

### v5 Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| v5-1 | DR upgraded to full OCR | Prevents double-deduction; auto-populates ConsignmentTracker |
| v5-2 | Accounting promoted from deferred | PNL Central already has working COA/GL/TB — replicate in MERN |
| v5-3 | Philippine government rates in DB | Admin-managed, versioned — no code changes when rates update |
| v5-4 | Three employee types in CompProfile | Office staff (fixed), Sales reps (hybrid), BDMs (commission) |
| v5-5 | Purchasing & AP promoted from deferred | Required for complete accounting cycle (AP → JE → TB) |
| v5-6 | Banking module included | Bank reconciliation essential for month-end close |
| v5-7 | CSI-DR reference chain | System enforces: consigned CSI skips inventory deduction |
| v5-8 | Expense anomaly extends to budgeted employees | Managers and staff with allocated budgets get anomaly flags |

---

*Document Version 5.0 — Integrated with PNL Central Live System*
*All 69 client decisions preserved + 8 v5 additions*
*Tech stack: MongoDB + Express + React + Node.js*
*Unified with existing VIP CRM codebase*
*Target launch: August 22, 2026*
