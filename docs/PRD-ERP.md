# PRODUCT REQUIREMENTS DOCUMENT
## VIP INTEGRATED PLATFORM (VIP-IP)
**Version:** 4.0 — MERN Adaptation
**Date:** March 28, 2026
**Based on:** Client PRD v3.3 (69 Confirmed Decisions) + CRM PRD v4.0
**Adapted by:** Development Team
**Tech Stack:** MERN (MongoDB, Express, React, Node.js) — unified with existing VIP CRM
**Classification:** Internal Development Reference

---

## IMPORTANT: HOW THIS DOCUMENT WORKS

This PRD adapts the client's VIP-IP PRD v3.3 for the **existing MERN stack**. Every business rule, decision, and module from the client's PRD is preserved. Only the technical implementation changes — from PostgreSQL/Fastify/Prisma/Google Cloud to MongoDB/Express/Mongoose/AWS.

**Client's 69 confirmed decisions: ALL honored.**
**Client's business rules: ALL implemented.**
**Client's module structure: ALL preserved.**
**Only change: HOW we build it, not WHAT we build.**

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
| Google Vision API | **Google Vision API** | ✅ Kept as-is. Best OCR for Philippine documents. Called from Express backend. |
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
├── ERP (new — replaces PNL Live + ERP Excel)
│   ├── Sales, Inventory, Collections, AR
│   ├── Expenses (SMER, Car Logbook, ORE, ACCESS, PRF/CALF)
│   ├── Income, Profit Sharing, PNL
│   └── Dashboard, Reports, SOA
│
├── OCR ENGINE (Phase 2)
│   └── Google Vision API → pre-fill forms
│
└── ACCOUNTING (Phase 3 / future)
    └── Chart of Accounts, Journals, 4-View P&L, VAT Filing
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

**MongoDB implementation:**
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

---

## 3. MASTER DATA — MONGODB COLLECTIONS

### 3.1 Settings Collection (Zero Hardcoding)
```javascript
// settings collection — one document, all configurable constants
{
  PERDIEM_RATE_DEFAULT: 800,
  PERDIEM_MD_FULL: 8,        // MD count for 100% per diem
  PERDIEM_MD_HALF: 3,        // MD count for 50% per diem
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
  ENFORCE_AUTHORITY_MATRIX: false
}
```

### 3.2 Hospital Master (Unified with BDM Tagging)
```javascript
const HospitalSchema = new Schema({
  entity_id: ObjectId,
  hospital_name: { type: String, required: true },
  hospital_name_clean: { type: String, unique: true }, // lookup key
  tin: String,
  address: String,
  contact_person: String,
  payment_terms: { type: Number, default: 30 },
  vat_status: { type: String, enum: ['VATABLE', 'EXEMPT', 'ZERO'], default: 'VATABLE' },
  cwt_rate: { type: Number, default: 0.01 },
  atc_code: { type: String, default: 'WC158' },
  is_top_withholding_agent: { type: Boolean, default: false },
  // HEAT fields (from PNL Live)
  hospital_type: String,       // Private, Public
  bed_capacity: Number,
  level: String,               // Primary, Level 2, Tertiary, Training
  purchaser_name: String,
  purchaser_phone: String,
  chief_pharmacist_name: String,
  chief_pharmacist_phone: String,
  key_decision_maker: String,
  engagement_level: { type: Number, min: 1, max: 5 },
  major_events: [String],      // up to 3
  programs_to_level_5: String,
  // BDM tagging (replaces bdm_hospital_tag table)
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
  item_key: { type: String, unique: true }, // "BrandName|DosageStrength"
  generic_name: { type: String, required: true },
  brand_name: { type: String, required: true },
  dosage_strength: String,
  sold_per: String,              // vial, ampoule, bottle, pc, box
  purchase_price: { type: Number, required: true },
  selling_price: { type: Number, required: true },
  vat_status: { type: String, enum: ['VATABLE', 'EXEMPT', 'ZERO'], default: 'VATABLE' },
  category: String,
  is_active: { type: Boolean, default: true },
  // CRM product fields (shared)
  description: String,
  key_benefits: String,
  image_url: String,             // S3
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

The existing CRM User model is extended with ERP fields:

```javascript
// Additional fields on existing User model
{
  // Existing CRM fields preserved:
  // email, password, role, regions, status, etc.

  // NEW ERP fields:
  territory_id: ObjectId,
  entity_id: ObjectId,         // VIP Inc. or subsidiary
  live_date: Date,             // partition date for sales routing
  bdm_stage: {
    type: String, default: 'CONTRACTOR',
    enum: ['CONTRACTOR', 'PS_ELIGIBLE', 'TRANSITIONING', 'SUBSIDIARY', 'SHAREHOLDER']
  },
  // Compensation (replaces comp_profiles)
  compensation: {
    perdiem_rate: Number,      // per-BDM rate (SETTINGS = fallback)
    perdiem_days: { type: Number, default: 22 },
    km_per_liter: Number,      // per-BDM fuel efficiency
    fuel_overconsumption_threshold: { type: Number, default: 1.30 },
    effective_date: Date
  },
  compensation_history: [{     // rate change audit trail
    perdiem_rate: Number,
    km_per_liter: Number,
    effective_date: Date,
    set_by: ObjectId,
    reason: String,
    created_at: { type: Date, default: Date.now }
  }],
  // Government IDs (for payslip)
  sss_no: String,
  pagibig_no: String,
  philhealth_no: String,
  date_of_birth: Date,
  contract_type: String,       // "Partnership Agreement"
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

---

## 4. MODULE 1 — DOCUMENT CAPTURE (OCR ENGINE)

**All OCR specifications from Client PRD v3.3 Sections 7.1-7.7 are preserved exactly.**

### Implementation Notes for MERN:

```javascript
// OCR processing flow (Express route)
router.post('/api/erp/ocr/process', auth, upload.single('photo'), async (req, res) => {
  // 1. Upload photo to S3
  const s3Url = await uploadToS3(req.file, buildDocPath(req.user, req.body.docType));

  // 2. Send to Google Vision API
  const visionResult = await googleVisionOCR(s3Url);

  // 3. Parse based on document type
  let extracted;
  switch (req.body.docType) {
    case 'CSI': extracted = parseCSI(visionResult); break;      // 3-line product parser
    case 'CR':  extracted = parseCR(visionResult); break;
    case 'CWT_2307': extracted = parse2307(visionResult); break;
    case 'GAS_RECEIPT': extracted = parseGasReceipt(visionResult); break;
    case 'ODOMETER': extracted = parseOdometer(visionResult); break;
    case 'UNDERTAKING': extracted = parseUndertaking(visionResult); break;
    default: extracted = { raw: visionResult.text };
  }

  // 4. Add confidence scores, flag low-confidence fields
  const withConfidence = addConfidenceFlags(extracted, visionResult);

  // 5. Return pre-filled data for BDM to confirm
  res.json({ s3_url: s3Url, extracted: withConfidence, raw_ocr: visionResult });
});
```

### S3 Document Storage Structure (replaces Google Drive)
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

### OCR Document Types (from Client PRD — ALL preserved)

| Document | OCR | Fields Extracted | MERN Notes |
|----------|-----|-----------------|------------|
| CSI (printed) | ✅ Full | Invoice No, Date, Hospital, Products (3-line), Qty, Price, Amount, VAT | 3-line parser in `services/ocr/csiParser.js` |
| CSI (handwritten) | ✅ Assisted | Same fields, lower confidence | Same parser, more red flags |
| Collection Receipt | ✅ Full | CR No, Date, Hospital, Amount, Check No, Bank, CSI stub list | `services/ocr/crParser.js` |
| CWT Certificate 2307 | ✅ Full | Payor TIN, Payee TIN, ATC Code, Amount, Tax Withheld | `services/ocr/cwtParser.js` |
| Deposit Slip | ✅ Full | Bank, Date, Amount, Reference No | `services/ocr/depositParser.js` |
| OR (expense) | ✅ Full | OR No, Date, Supplier, Amount, VAT | `services/ocr/orParser.js` |
| Shell Card Receipt | ✅ Full | Date, Liters, Price/Liter, Total | `services/ocr/shellParser.js` |
| Odometer | ✅ Partial | Reading, Date (from timestamp) | `services/ocr/odometerParser.js` |
| DR (Delivery Receipt) | ✅ Classification | Products, Quantities, Type detection | `services/ocr/drParser.js` |
| Undertaking of Receipt | ✅ Full | Brand, Generic, Dosage, Batch, Expiry, Qty | Same 3-line parser as CSI |
| Waybill | ❌ None | Photo as proof only | S3 upload only |
| CALF Form | ❌ None | Photo as proof only | S3 upload only |
| PRF Form | ❌ None | Photo as proof only | S3 upload only |

---

## 5. MODULE 2 — SALES MANAGEMENT

**All business rules from Client PRD v3.3 Sections 8.1-8.4 preserved.**

### 5.1 Sales Entry Collection
```javascript
const SalesLineSchema = new Schema({
  entity_id: ObjectId,
  bdm_id: ObjectId,
  event_id: { type: ObjectId, ref: 'TransactionEvent' },
  // Source routing (P4 — Live Date Partition)
  source: { type: String, enum: ['SALES_LINE', 'OPENING_AR'], required: true },
  // CSI fields
  hospital_id: { type: ObjectId, ref: 'Hospital', required: true },
  csi_date: { type: Date, required: true },
  doc_ref: { type: String, required: true },  // CSI number
  // Line items (embedded array)
  line_items: [{
    product_id: { type: ObjectId, ref: 'ProductMaster' },
    item_key: String,
    batch_lot_no: String,     // from FIFO selection
    qty: { type: Number, required: true },
    unit: String,
    unit_price: { type: Number, required: true },
    line_total: Number,       // qty × unit_price
    vat_amount: Number,       // line_total × 12/112 (if VATABLE)
    net_of_vat: Number,
    fifo_override: { type: Boolean, default: false },
    override_reason: String
  }],
  // Totals
  invoice_total: Number,
  total_vat: Number,
  total_net_of_vat: Number,
  // Status
  status: { type: String, default: 'ACTIVE', enum: ['ACTIVE', 'DELETED'] },
  deletion_event_id: ObjectId,
  created_at: { type: Date, default: Date.now, immutable: true }
});

// Auto-route based on live_date (P4)
SalesLineSchema.pre('save', async function() {
  const bdm = await User.findById(this.bdm_id);
  this.source = this.csi_date < bdm.live_date ? 'OPENING_AR' : 'SALES_LINE';
  // Only create inventory movements for SALES_LINE
  if (this.source === 'SALES_LINE') {
    await createInventoryIssues(this);
  }
});
```

### 5.2 CSI Allocation Validation (Client PRD Section 6.1)

At CSI capture, system validates invoice number against BDM's allocation:
1. If CSI date < BDM's live_date → skip allocation check (OPENING_AR)
2. If no allocations exist for this BDM → skip check (Finance hasn't issued yet)
3. Otherwise → invoice number must be in BDM's AVAILABLE allocation or BLOCKED

### 5.3 CSI Correction Process (Client PRD Section 8.3)

BDM requests deletion → Finance approves → DELETION_EVENT created → BDM re-captures → NEW_EVENT created. Original image retained permanently. Full audit trail.

### 5.4 Consignment Sales (Client PRD Section 8.4)

DR → Consignment pool → Partial consumption tracking → CSI for consumed items. Aging per `consignment_terms` collection.

---

## 6. MODULE 3 — COLLECTIONS ENGINE

**All business rules from Client PRD v3.3 Sections 9.1-9.5 preserved.**

### 6.1 Collection Session Collection
```javascript
const CollectionSchema = new Schema({
  entity_id: ObjectId,
  bdm_id: ObjectId,
  event_id: { type: ObjectId, ref: 'TransactionEvent' },
  // One CR per hospital (P5)
  hospital_id: { type: ObjectId, ref: 'Hospital', required: true },
  cr_no: { type: String, required: true },
  cr_date: { type: Date, required: true },
  // CSIs being settled
  settled_csis: [{
    sales_line_id: ObjectId,
    doc_ref: String,             // CSI number
    csi_date: Date,
    invoice_amount: Number,
    source: String,              // SALES_LINE or OPENING_AR
    // Per-CSI commission
    commission_rate: Number,     // manually entered by BDM
    commission_amount: Number,   // net_of_vat × commission_rate
    // Per-CSI per-MD partner tagging
    partner_tags: [{
      md_name: String,
      md_id: ObjectId,           // CRM VIP Client ref (optional)
      rebate_pct: Number,
      rebate_amount: Number,     // net_of_vat × rebate_pct
    }]
  }],
  // CWT (two input modes — Client PRD Section 9.3)
  cwt_rate: Number,
  cwt_amount: Number,
  cwt_certificate_url: String,   // S3 URL to 2307 photo
  cwt_na: { type: Boolean, default: false },
  // Payment details
  payment_mode: String,          // CHECK, CASH, BANK_TRANSFER
  check_no: String,
  check_date: Date,
  bank: String,
  deposit_date: Date,
  deposit_slip_url: String,      // S3 URL
  // CR totals
  total_csi_amount: Number,      // sum of all CSI amounts
  cr_amount: Number,             // total_csi_amount - cwt_amount
  // Status
  status: { type: String, default: 'ACTIVE' },
  // Document URLs (hard gate — all required)
  cr_photo_url: { type: String, required: true },
  created_at: { type: Date, default: Date.now, immutable: true }
});

// CR formula validation (Client PRD Section 9.4)
CollectionSchema.pre('save', function() {
  const expectedCR = this.total_csi_amount - (this.cwt_amount || 0);
  const diff = Math.abs(this.cr_amount - expectedCR);
  if (diff > 1.00) {
    this.validation_flags = this.validation_flags || [];
    this.validation_flags.push({
      type: 'CR_AMOUNT_MISMATCH',
      expected: expectedCR,
      actual: this.cr_amount,
      difference: diff
    });
  }
});
```

### 6.2 Collection Session Flow (Client PRD Section 9.5)

Two entry modes:
- **Mode A — Hospital-First:** Select hospital → see open CSIs → select which are being paid
- **Mode B — CSI-First:** Capture CSI photo → OCR reads CSI number → auto-match to hospital

Hard gate: CSI photos + CR photo + CWT certificate (or N/A) + Deposit slip — ALL required before submit.

---

## 7. MODULE 4 — INVENTORY ENGINE

**All business rules from Client PRD v3.3 Sections 10.1-10.4 preserved.**

Inventory movements: GRN (supplier receipt), CSI (sale), DR_SAMPLING, DR_CONSIGNMENT, TRANSFER, ADJUSTMENT. FIFO enforcement with BDM batch-override (4 pre-approved reasons). Stock on hand computed from inventory_ledger aggregation. Reorder alerts per product via `reorder_rules` sub-collection.

Finance-only actions: add products, approve GRNs, approve physical count adjustments, set reorder thresholds.

---

## 8. MODULE 5 — BDM FIELD OPERATIONS (PNL)

### 8.1 SMER Per Diem (Client PRD Section 11.1)
```javascript
const SmerEntrySchema = new Schema({
  entity_id: ObjectId,
  bdm_id: ObjectId,
  cycle: { type: String, enum: ['C1', 'C2'] },
  period: String,  // "2026-03"
  daily_entries: [{
    day: Number,           // 1-31
    day_of_week: String,
    hospital_covered: String,
    md_count: Number,       // Manual in Phase 1, CRM-sourced in Phase 3
    perdiem_tier: String,   // FULL, HALF, ZERO (auto-computed)
    perdiem_amount: Number, // auto-computed from tier × BDM rate
    transpo_p2p: Number,
    transpo_special: Number,
    car_logbook_ref: ObjectId,
    notes: String
  }],
  // Totals (auto-computed)
  total_perdiem: Number,
  total_transpo: Number,
  total_special_cases: Number,
  total_ore: Number,
  gasoline_personal: Number,
  total_reimbursable: Number,
  // Travel advance reconciliation
  travel_advance: Number,
  balance_on_hand: Number,  // advance - total_reimbursable
  status: { type: String, default: 'DRAFT' }
});

// Per diem tier logic (Client PRD: MD count method)
function computePerdiemTier(mdCount, settings) {
  if (mdCount >= settings.PERDIEM_MD_FULL) return 'FULL';   // ≥8 MDs = 100%
  if (mdCount >= settings.PERDIEM_MD_HALF) return 'HALF';   // 3-7 MDs = 50%
  return 'ZERO';                                              // 0-2 MDs = 0%
}
```

### 8.2 Car Logbook (Client PRD Section 11.2 — Two Captures Per Day)
```javascript
const CarLogbookEntrySchema = new Schema({
  entity_id: ObjectId,
  bdm_id: ObjectId,
  date: { type: Date, required: true },
  // Morning capture
  starting_km: { type: Number, required: true },
  starting_km_photo_url: String,    // S3 — odometer photo
  // Night capture
  ending_km: Number,
  ending_km_photo_url: String,      // S3 — odometer photo
  // Auto-computed
  total_km: Number,                 // ending_km - starting_km
  // BDM input (mandatory)
  personal_km: { type: Number, default: 0 },
  official_km: Number,              // total_km - personal_km
  // Fuel entries for this day
  fuel_entries: [{
    station_name: String,
    fuel_type: String,
    liters: Number,
    price_per_liter: Number,
    total_cost: Number,
    receipt_url: String,             // S3
    payment_mode: String,            // CASH, SHELL_FLEET_CARD
    calf_required: Boolean
  }],
  // Per-BDM fuel efficiency tracking (Client PRD Section 11.2)
  expected_official_liters: Number,  // official_km ÷ bdm.km_per_liter
  expected_personal_liters: Number,  // personal_km ÷ bdm.km_per_liter
  actual_liters: Number,            // sum of fuel_entries.liters
  personal_gas_amount: Number,       // expected_personal_liters × avg_price
  efficiency_variance: Number,       // actual - (expected_official + expected_personal)
  overconsumption_flag: Boolean      // actual > expected_total × threshold
});
```

### 8.3 Other Expense Modules

- **ORE (Other Reimbursable Expenses):** Date, establishment, particulars, amount, OR photo. Cash-based, no CALF required.
- **ACCESS:** Company-mode payments — credit card, GCash, bank transfer. OR required, CALF required for non-cash.
- **PRF:** Payment requisition form — photo as proof, no OCR. Required for all partner rebate payments.
- **CALF:** Cash advance & liquidation — photo as proof, no OCR. Required for all non-cash payments except: cash mode, President entries, ORE.

### 8.4 Partners' Insurance / Rebates (Client PRD Section 11.4)

Entered at collection time per CSI per MD. Rebate = Net of VAT × %. Each MD independent %. PRF required. BIR_FLAG = INTERNAL_ONLY.

### 8.5 Expense Summary
Auto-computed per cycle (C1/C2):
1. SMER Reimbursables (excl. Gasoline Personal)
2. Gasoline less Personal (Car Logbook)
3. Partners' Insurance (sum of rebate entries)
4. ACCESS Total (company-mode expenses)
5. CORE (commission earned)

---

## 9. MODULE 6 — COMMISSION AND PROFIT SHARE ENGINE

**All business rules from Client PRD v3.3 Sections 14.1-14.3 preserved exactly.**

### 9.1 Commission — Per CSI, Manual Rate
Rate entered by BDM at collection time per CSI. Commission = Net of VAT × rate. Rates: typically 3% standard, 5% premium.

### 9.2 Profit Share — Per Product Eligibility

Each product evaluated independently per month:

- **Condition A:** Product ordered by ≥ 2 hospitals (SETTINGS.PROFIT_SHARE_MIN_HOSPITALS)
- **Condition B:** ≥ 1 MD tagged per product per collection, max 3 products per MD (SETTINGS.MD_MAX_PRODUCT_TAGS)
- **Condition C:** A + B met for 3 consecutive months (SETTINGS.PS_CONSECUTIVE_MONTHS). Profit share starts Month 4.

MD partner name validation: CRM match OR manual entry starting with Dr./Dra./Doctor prefix.

Deficit month → revert to commission, streak maintained. Break in conditions → streak resets.

### 9.3 Profit Share Computation

Net Territory Revenue (PS products only) = Collections on PS products (net VAT) − COGS (FIFO) − SMER − Gas less Personal − Partners' Insurance − ACCESS − Sampling DR cost − Depreciation − Loan amortization.

If Net > 0: BDM 30%, VIP 70%. If Net ≤ 0: PS products revert to commission.

---

## 10. MODULE 7 — REPORT CYCLE AND INCOME RELEASE

**All business rules from Client PRD v3.3 Sections 15.1-15.3 preserved.**

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

### Document Deadlines
- C1 physical documents: on or before 23rd of month
- C2 physical documents: on or before 8th of following month
- Late = income credit deferred to next cycle

---

## 11. MODULE 8 — CRM INTEGRATION

### Phase 1 (Before CRM API)
- MD tagged manually in ERP at collection time
- Stored locally in ERP partner_product_tags
- SMER MD count entered manually by BDM
- Per diem computed from manual count

### Phase 3 (After CRM API Connected)
Both systems share the same MongoDB database and same Express server, so "integration" is direct database access — no REST API needed:

```javascript
// ERP reads CRM visit data directly from same database
const todayVisits = await Visit.find({
  user: bdmId,
  visitDate: { $gte: startOfDay, $lte: endOfDay }
}).populate('doctor');

const mdCount = todayVisits.length;  // auto-populates SMER
```

**CRM → ERP data flows (same database):**
- Visit count per day → SMER MD count (per diem tier)
- VIP Client (Doctor) profiles → MD partner validation for profit share
- Hospital/outlet from Doctor profiles → shared Hospital master
- Product assignments → product catalog context
- **Schedule data → ERP Dashboard "Engagements" card** (completed vs target entries for current cycle)
- **Doctor list → ERP Dashboard "VIP Clients" bottom tab** (filtered by BDM's assigned regions via `Region.getDescendantIds()`)

**ERP → CRM data flows (same database):**
- Stock on hand → BDM sees availability in CRM
- AR balances per hospital → shown before visit ("Hospital X owes ₱66,955")
- Partner insurance payments → linked to VIP Client profile

---

## 12. MODULES 9-12 — DEFERRED TO PHASE 3 / ACCOUNTING

The following client PRD modules are preserved in full but deferred to the Accounting phase:

- **Purchasing and AP** (Client PRD Module 6) — PO, 3-way matching, AP aging, GRNI
- **VIP Accounting Master** (Client PRD Module 7) — 6 books, chart of accounts, general ledger, trial balance, 4-view P&L
- **VAT Filing and BIR Compliance** (Client PRD Module 11) — Finance tagging, 2550Q generation, VAT export
- **BDM Lifecycle and Share Purchase** (Client PRD Module 13) — Stage management, inter-entity pricing, share purchase ledger, dividend register
- **People Master and Compensation** (Client PRD Module 14) — Full HR, insurance register, de minimis, government mandatories

**Database fields for these modules are included in the schema from day one** (entity_id, bdm_stage, vat_status, etc.) so no migration is needed when these modules are built.

---

## 13. REPORTS, ANALYTICS, AND SOA

### SOA Generation (Client PRD Section 18.1 — all 3 methods)
- Method 1: Per hospital (select hospital → generate instantly)
- Method 2: From SOA picklist (select specific invoices)
- Method 3: Bulk SOA (all hospitals with balance)
- Export: PDF, Excel. Google Sheets export deferred.

### AR Reports (Client PRD Section 18.2)
- AR Aging (Current, 1-30, 31-60, 61-90, 90+)
- AR Ledger per hospital
- AR Consolidated (all territories)
- Collection efficiency report (70% threshold)
- CWT Receivable report

### Executive Dashboard (Client PRD Section 18.3)
- Territory performance: sales vs collections, expense ratio, net earnings
- Company KPIs: total sales, collections, collection rate, inventory value, AR outstanding
- Alerts: near-expiry, reorder, overdue AR, BIR deadlines, incomplete reports

### BDM Performance Reports (Client PRD Section 18.4)
- Sales by product, collection rate per hospital, AR aging
- Expense breakdown (5 components), commission per product
- Profit share status per product, streak tracking
- Combined CRM metrics (call rate, visit compliance) + ERP financials

### 13.5 ERP Dashboard Layout (BOSS App Reference)

> **UI Inspiration:** BOSS ERP app (Play Store). Adapted for VIP platform with CRM integration.
> **Client Direction:** Use SAP, NetSuite, or QuickBooks as standard references for ERP patterns.

The ERP dashboard is the central hub for BDMs and Admins. It follows a mobile-first card layout with four distinct sections.

#### Section 1 — Top Action Buttons (4 quick-access)

| Position | Label | Target | Icon Style |
|----------|-------|--------|------------|
| 1 | **CRM** | `/bdm` (BDM) or `/admin` (Admin) — link back to CRM dashboard | Arrow/link icon |
| 2 | **Sales** | `/erp/sales` — Sales entry and list | Cart/invoice icon |
| 3 | **Expenses** | `/erp/expenses` — SMER, Car Logbook, ORE, ACCESS | Wallet/pay icon |
| 4 | **Collections** | `/erp/collections` — Collection session and AR | Receipt/accept icon |

These replace the generic module cards from the Phase 0 placeholder.

#### Section 2 — Summary Cards ("Remainders")

Four key financial indicators displayed as large cards with amounts in PHP.

| Order | Label | Source / Formula | Notes |
|-------|-------|-----------------|-------|
| 1 | **Total Sales** | `SalesLine.aggregate({ status: 'ACTIVE' }, sum: invoice_total)` | All-time or filtered by period |
| 2 | **AR (Accounts Receivable)** | Total Sales − Total Collections | Computed from SalesLine and Collection aggregations |
| 3 | **Value of Stocks on Hand** | `InventoryLedger.aggregate` (sum of running_balance × ProductMaster.purchase_price per BDM) | 3rd position per client request |
| 4 | **Engagements** | Visited vs Target from CRM Schedule (completed entries / total entries for current cycle) | **CRM Integration** — reads from Schedule model |

**Removed from BOSS layout:** "Total net assets" — not applicable to BDM-level view.

#### Section 3 — Month-to-Date Metrics

Four metrics showing current month performance, displayed below the summary cards.

| Metric | Source | Query Filter |
|--------|--------|-------------|
| **Sales** | SalesLine sum (invoice_total) | `csi_date` in current calendar month, status = ACTIVE |
| **Collections** | Collection sum (cr_amount) | `cr_date` in current calendar month, status = ACTIVE |
| **Engagements** | CRM Schedule completed vs target | Current cycle's completed entries / total entries |
| **Income** | Income calculation (earnings − deductions) | Current period (C1 or C2 of current month) |

#### Section 4 — Bottom Navigation Tabs (4 data views)

Persistent bottom tab bar for quick access to master data and reports.

| Tab | Label | Content | Data Source |
|-----|-------|---------|-------------|
| 1 | **Product Master** | Available products in warehouse with stock levels | `ProductMaster` + `InventoryLedger` aggregation |
| 2 | **Customer/Hospital (HEAT)** | Hospital list with HEAT fields (type, bed capacity, level, key contacts, engagement level) | `Hospital` model with HEAT fields |
| 3 | **VIP Clients** | Current CRM client list for BDM's coverage area | **CRM Integration** — reads from `Doctor` model filtered by BDM's assigned regions |
| 4 | **PNL** | Total Sales − Total Expenses (Year-to-Date) | `SalesLine` sum − all expense category sums, filtered by current calendar year |

#### Dashboard API Endpoints (Phase 8)

```javascript
// GET /api/erp/dashboard/summary — Summary cards data
{
  total_sales: Number,           // SalesLine aggregate
  accounts_receivable: Number,   // total_sales - total_collections
  stock_on_hand_value: Number,   // InventoryLedger aggregate
  engagements: {                 // CRM Schedule data
    visited: Number,
    target: Number,
    rate: Number                 // percentage
  }
}

// GET /api/erp/dashboard/mtd — Month-to-date metrics
{
  sales_mtd: Number,
  collections_mtd: Number,
  engagements_mtd: { visited: Number, target: Number, rate: Number },
  income_mtd: Number
}

// GET /api/erp/dashboard/pnl-ytd — Year-to-date PNL
{
  total_sales_ytd: Number,
  total_expenses_ytd: Number,
  net_pnl_ytd: Number
}
```

#### Mobile Layout

- **Phone (primary device):** Single-column stack — action buttons (2×2 grid) → summary cards (scrollable) → MTD section → bottom tab bar (fixed)
- **Tablet:** Two-column layout for summary cards, wider bottom tabs
- **Desktop:** Full dashboard with side-by-side sections

---

## 14. USER ROLES AND PERMISSIONS

| Role | CRM Access | ERP Access | Special Rules |
|------|-----------|-----------|---------------|
| BDM | Log visits, manage VIP Clients in own region, view schedule | Sales, collections, expenses, view stock/AR/income | Own territory data only |
| Admin | All CRM features, manage users, upload Excel CPT | All ERP features + products, hospitals, settings, profit sharing, approve GRN | All territories |
| Finance Officer | Read-only CRM dashboards | Full ERP + VAT tagging, AP, journal posting, BIR compliance | VIP Accounting tier |
| President (GV) | Full CRM | Full ERP + delete transactions, approve income release | CALF never required, can override any gate |
| CEO | Read-only CRM dashboards | View-only: Dashboard, PNL, Monthly Archive, summaries | No edit access |

---

## 15. DEVELOPMENT PHASES

### Phase 1 — Core ERP Foundation (Months 1-3, target Aug 22 2026)

**Auth & Shared:**
- [ ] Extend CRM User model with ERP fields (territory, entity_id, live_date, bdm_stage, compensation)
- [ ] Add entity_id to all new collections (multi-tenancy from day one)
- [ ] Extend Hospital model with HEAT + financial fields (TIN, CWT rate, BDM tagging)
- [ ] Navbar: CRM tabs + ERP tabs based on role

**Master Data:**
- [ ] Settings collection (all configurable constants)
- [ ] Product Master (identity only — no batch)
- [ ] Admin-managed lookups: banks, credit cards, payment modes, expense components
- [ ] BDM compensation profiles with rate history

**Sales (Client PRD Module 2):**
- [ ] Sales entry with live date partition (auto-route OPENING_AR vs SALES_LINE)
- [ ] Immutable transaction events
- [ ] FIFO batch selection with override reasons
- [ ] Sales audit trail
- [ ] CSI validation (duplicate check, stock check)

**Inventory (Client PRD Module 4):**
- [ ] Inventory ledger (batch-level, immutable)
- [ ] Auto-issue on sale (FIFO consumption)
- [ ] GRN — manual stock receiving (Finance approval)
- [ ] Stock on hand aggregation view
- [ ] Reorder alerts, expiry alerts
- [ ] BDM warehouse dashboard

**Collections (Client PRD Module 3):**
- [ ] Collection session (hospital-first + CSI-first modes)
- [ ] One CR per hospital (enforced)
- [ ] CWT entry (amount or rate, both stored)
- [ ] CR formula validation (CR = ΣCSIs - CWT)
- [ ] Commission auto-calc per CSI (manual rate)
- [ ] Partner insurance/rebate per CSI per MD
- [ ] Hard gate: all documents required before submit

**AR:**
- [ ] AR Open (invoice-level balances)
- [ ] AR Aging (Current, 1-30, 31-60, 61-90, 90+)
- [ ] Opening AR import
- [ ] SOA generation (PDF export)

**Expenses (Client PRD Module 5):**
- [ ] SMER with per diem (MD count method, per-BDM rate)
- [ ] Car Logbook (morning/night odometer, fuel, personal km split, fuel efficiency tracking)
- [ ] ORE, ACCESS forms with OR/CALF rules
- [ ] PRF/CALF forms (photo proof)
- [ ] Expense summary (5 categories)

**Income & PNL:**
- [ ] BDM income/payslip generation (per cycle)
- [ ] Territory PNL calculation (simple profit gate)
- [ ] CEO Dashboard
- [ ] Monthly archive (auto-snapshot)

**Reports:**
- [ ] Sales summary, collection summary, expense summary
- [ ] Audit logs (sales edit, price change, item change)
- [ ] System health checks

### Phase 2 — OCR + Advanced Features (Months 4-5)

- [ ] Google Vision API integration
- [ ] CSI OCR (3-line product parser + footer misalignment handling)
- [ ] CR, CWT 2307, Deposit Slip, OR OCR extractors
- [ ] Gas receipt + odometer OCR
- [ ] Undertaking of Receipt OCR (GRN)
- [ ] DR classification (sampling vs consignment text detection)
- [ ] CSI allocation control (booklet tracking, weekly Monday allocation)
- [ ] Consignment/DR tracking (partial consumption, per-hospital aging)
- [ ] Per-product profit share eligibility engine (3 conditions, streak tracking)
- [ ] Cycle report workflow (GENERATED → REVIEWED → BDM_CONFIRMED → CREDITED)
- [ ] Sampling DR flow (BDM initiates, Finance approves)
- [ ] Inter-BDM transfer flow (Finance gates both sides)
- [ ] Push notifications for deadlines

### Phase 3 — Accounting, Intelligence, CRM Integration (Months 6+)

- [ ] CRM data auto-populating SMER (MD count from visit logs)
- [ ] AR balances visible in CRM before hospital visits
- [ ] Stock availability visible in CRM
- [ ] Chart of Accounts + General Ledger
- [ ] Double-entry journal generation (MASTER_JOURNAL)
- [ ] 4-view P&L (Internal, BIR, VAT, CWT)
- [ ] VAT filing with Finance tagging (PENDING/INCLUDE/EXCLUDE/DEFER)
- [ ] 2550Q export (Excel, mirrors BIR format)
- [ ] AP module (PO, 3-way matching, AP aging, GRNI)
- [ ] People Master (full HR — directors, employees)
- [ ] Insurance register (LIFE, KEYMAN, INCOME_LOSS, ACCIDENT)
- [ ] BDM lifecycle stage management
- [ ] Inter-entity pricing, intercompany elimination
- [ ] Share purchase ledger, dividend register
- [ ] Bank reconciliation
- [ ] Fixed assets + depreciation
- [ ] Loans + amortization
- [ ] Full executive analytics dashboard

---

## 16. SUCCESS METRICS (FROM CLIENT PRD — ALL PRESERVED)

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

---

## 17. DECISION LOG

All 69 decisions from Client PRD v3.3 Appendix A are honored. Key implementation adaptations:

| # | Client Decision | MERN Adaptation |
|---|----------------|----------------|
| 57 | Immutable events, database trigger | Mongoose schema immutable fields + pre-save hooks |
| 58 | Multi-tenant, row-level security | entity_id on all documents + Mongoose middleware |
| 1 | Cash basis VAT (RR 16-2005) | Deferred output VAT tracked in collection documents |
| 2 | FIFO per batch | inventory_ledger sorted by expiry_date, consume oldest first |
| 54 | CRM integration via REST API | Direct database access (same MongoDB instance) |

---

*Document Version 4.0 — MERN Adaptation*
*All 69 client decisions preserved*
*Tech stack: MongoDB + Express + React + Node.js*
*Unified with existing VIP CRM codebase*
*Target launch: August 22, 2026*