# VIP ERP - Project Context

> **Last Updated**: April 2026
> **Version**: 6.0
> **Status**: Phases 0-35 + Phase A-F + Gap 9 Complete. Phase F: Universal Approval Hub — cross-entity, delegatable, inline approve from one page (April 13, 2026).

See `CLAUDE.md` for CRM context. See `docs/PHASETASK-ERP.md` for full task breakdown (3000+ lines).

---

## Overview

Full ERP system under `backend/erp/` and `frontend/src/erp/`. Multi-entity pharmaceutical distribution ERP with SAP-inspired patterns.

### Architecture
- **Multi-entity**: VIP (parent) + MG AND CO. (subsidiary). Entity-scoped data via `req.entityId`.
- **Document lifecycle**: DRAFT → VALID → ERROR → POSTED (SAP Park→Check→Post)
- **MongoDB transactions** for all posting operations
- **Double-entry accounting**: JournalEntry model with DR=CR validation on pre-save
- **Period locking**: `checkPeriodOpen()` prevents posting to closed months

---

## Entity Model

VIP is the parent company, supplies subsidiaries (MG AND CO. INC. first). BDMs can graduate to own subsidiary. Scalability is critical — every model is scoped by `entity_id`.

- `req.entityId` — resolved from user's assigned entity (or X-Entity-Id header for multi-entity users)
- `req.bdmId` — the BDM user (for BDM-scoped queries)
- `req.tenantFilter` — `{ entity_id: req.entityId, bdm_id: req.bdmId }` (convenience)

### Multi-Entity Access (Phase 26)

Users can access multiple entities via `entity_ids: [ObjectId]` on the User model. The tenant filter validates the `X-Entity-Id` header against this list. Admin/president assigns entities via the BDM Management UI (checkbox list with primary entity selection).

- **President/CEO**: sees all entities (unchanged)
- **Multi-entity users** (`entity_ids.length > 1`): get an entity switcher in the navbar, can switch working entity
- **Single-entity users**: unchanged, locked to `entity_id`
- Controllers are unaffected — they keep using `req.entityId` and `req.tenantFilter`

## Governance Principles

This ERP is a top-down, lookup-driven business operating system. It must scale across entities, subsidiaries, business lines, departments, and people without relying on hardcoded values in code or UI.

- **President/Admin/Finance own control**: They define and maintain the core business structure for entities, people, roles, reporting lines, cost centers, permissions, funding sources, banks, cards, Chart of Accounts, and other lookup/master data.
- **Master data flows downward**: Employees and operational users work inside the structure created by president/admin/finance. Transactions, approvals, reporting, and visibility all inherit from that structure.
- **No hardcoded business options**: Dropdowns, mappings, permissions, and posting references should come from controlled master data and API lookups wherever possible, not fixed frontend constants or one-off backend conditions.
- **Entity-first design**: All scalable features must respect entity boundaries and support future subsidiaries, inter-company activity, and shared parent oversight.
- **People-first design**: System behavior depends on properly structured people data — who belongs to which entity, who reports to whom, who can approve, and who can view or act on each module.
- **Finance-authoritative outputs**: Posted accounting data, controlled journals, and approved master data are the source of truth for financial reports, compliance, and cross-module reconciliation.

In practice, the system is dependent on president/admin/finance maintaining clean entity structure and people structure. If those foundations are incomplete or inconsistent, downstream modules will become unreliable.

---

## ERP Phases

| Phase | Module | Status |
|-------|--------|--------|
| 0 | ERP Scaffold + Router | ✅ |
| 1 | OCR Engine (Google Vision) | ✅ |
| 2 | Shared Models (Hospital, ProductMaster, Settings) | ✅ |
| 3 | Sales (CSI/DR/Service Invoice) | ✅ |
| 4 | Inventory (FIFO, GRN, Consignment) | ✅ |
| 4A/4B | Entity Migration + Inter-Company Transfers | ✅ |
| 5 | Collections & AR + Dunning + SOA | ✅ |
| 6 | Expenses (SMER, Car Logbook, ORE/ACCESS, PRF/CALF) | ✅ |
| 7 | Income, P&L & Year-End Close | ✅ |
| 8 | Dashboard & Reports (BOSS-Style) | ✅ |
| 9 | Integration, Document Flow & Polish | ✅ |
| 10 | ERP Access Control + People Master + Payroll | ✅ |
| 11 | Accounting Engine (COA, JE, TB, P&L, VAT, Cashflow) | ✅ |
| 12 | Purchasing & AP (PO, SI, 3-Way Match, AP Payment) | ✅ |
| 13 | Banking & Cash (Bank Recon, Credit Cards) | ✅ |
| 14 | New Reports & Analytics | ✅ |
| 15 | SAP-equivalent Improvements (partial) | ✅ |
| 16 | Sub-Module Access (Granular Permissions) | ✅ |
| 17 | Warehouse Model | ✅ |
| 18 | Service Revenue + Cost Center Expenses | ✅ |
| 19 | Petty Cash / Office Supplies / Collaterals | ✅ |
| 20 | Batch Expense Upload + COA Expansion | ✅ |
| 21 | Insurance, Period Locks, Recurring Journals, BIR Calc | ✅ |
| 22 | Accounting Hardening, COA Config, Entity Context | ✅ |
| 23 | System Audit & Governance Hardening | ✅ |
| 24 | ERP Control Center | ✅ |
| 25 | Admin Account Management (BDM Access Preservation) | ✅ |
| 26 | Multi-Entity Access + Stock Import Fix | ✅ |
| 27 | Full System Audit + Period Lock + Banner Compliance | ✅ |
| 28 | Sales Goals, KPI & Partnership Performance | ✅ |
| 29 | Email Notifications + Approval Workflow (Authority Matrix) | ✅ |
| 30 | Role Centralization + PeopleMaster Lookup-Driven Validation | ✅ |
| 31 | Functional Role Assignment (Cross-Entity Deployment) | ✅ |
| 32 | Universal KPI Self-Rating & Performance Review | ✅ |
| 33 | Bulk Role Migration + Login Fix | ✅ |
| 34 | GRN ↔ PO Cross-Reference & Unified Receipt Tracking | ✅ |
| 35 | PO Enhancements — Warehouse Address, Activity Log, Sharing | ✅ |
| A | Frontend Lookup Migration — Zero Hardcoded Fallback Arrays | ✅ |
| B | Frontend Dropdown Lookup Integration | ✅ |
| C | Backend Schema Enum Cleanup — App-Layer Validation | ✅ |
| D | Multi-Channel Engagement — Communication Log + Messaging APIs | ✅ |
| E | BDM Income Deductions — Lookup-Driven, Self-Service + Finance Verification | ✅ |
| E.2 | Deduction Schedules — Recurring (Installment) + Non-Recurring (One-Time) | ✅ |
| F | Universal Approval Hub — Cross-Entity, Delegatable, Inline Approve | ✅ |
| Gap 9 | Rx Correlation — Visit vs Sales + Rebates + Programs | ✅ |
| G1 | BDM Income Projection + Revolving Fund + CALF Bidirectional + Personal Gas | ✅ |

---

## Phase G1 — BDM Income Projection + Revolving Fund + CALF Settlement Fix

### Architecture
- **projectIncome()** in `incomeCalc.js`: Read-only aggregation of all income sources with confidence levels (CONFIRMED/PROJECTED/NONE)
- **CompProfile.revolving_fund_amount**: Per-BDM override → Settings.REVOLVING_FUND_AMOUNT fallback (0 = use global)
- **CALF bidirectional**: Positive balance = deduction, negative balance = reimbursement in earnings
- **Personal gas**: Auto-deduction from CarLogbook `personal_gas_amount` via `auto_source: 'PERSONAL_GAS'`

### Income Projection (read-only, always available)
- Endpoint: `GET /income/projection?period=YYYY-MM&cycle=C1`
- Aggregates: SMER (any status), Collections (by status), PNL, CALF, CarLogbook, DeductionSchedule
- Confidence levels: CONFIRMED (POSTED), PROJECTED (DRAFT/VALID), PARTIAL, NONE
- Does NOT create/modify documents

### BDM Self-Service Generation (repeatable)
- Endpoint: `POST /income/request-generation` (contractor role)
- Allowed when: no report, GENERATED, RETURNED, REVIEWED
- Blocked when: BDM_CONFIRMED, CREDITED (locked)
- Uses existing `generateIncomeReport` upsert pattern (auto-fields recalculated, manual lines preserved)

### Revolving Fund (lookup-driven travel advance)
- CompProfile field: `revolving_fund_amount` (0 = use global Settings.REVOLVING_FUND_AMOUNT)
- SMER auto-populates: `GET /expenses/revolving-fund-amount` → read-only with override toggle
- Follows `perdiem_rate` pattern (per-person with global fallback)

### CALF Settlement Fix (bidirectional)
- Positive balance (advance > liquidation): auto-deduction line `CASH_ADVANCE` with `auto_source: 'CALF'`
- Negative balance (liquidation > advance): `calf_reimbursement` in earnings (company pays BDM back)
- IncomeReport.earnings.calf_reimbursement: new field for shortfall reimbursement

### Personal Gas Auto-Deduction
- `CarLogbookEntry.personal_gas_amount` aggregated per period+cycle (POSTED/VALID)
- Auto-deduction line with `auto_source: 'PERSONAL_GAS'`, `deduction_type: 'PERSONAL_GAS'`
- Added to INCOME_DEDUCTION_TYPE lookup seed

### New/Modified Endpoints
| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/income/projection` | Read-only income projection with confidence levels |
| POST | `/income/request-generation` | BDM self-service payslip generation (contractor, repeatable) |
| GET | `/expenses/revolving-fund-amount` | Resolve per-BDM revolving fund amount |

### Key Files
- `backend/erp/models/CompProfile.js` — `revolving_fund_amount` field
- `backend/erp/models/IncomeReport.js` — `calf_reimbursement` in earnings, updated pre-save
- `backend/erp/services/incomeCalc.js` — `projectIncome()`, CALF bidirectional, personal gas
- `backend/erp/controllers/incomeController.js` — `getIncomeProjection`, `requestIncomeGeneration`
- `backend/erp/controllers/expenseController.js` — `getRevolvingFundAmount`, SMER auto-populate
- `frontend/src/erp/pages/MyIncome.jsx` — projection section + request generation
- `frontend/src/erp/pages/Smer.jsx` — travel advance auto-populate with override toggle
- `frontend/src/erp/pages/PersonDetail.jsx` — `revolving_fund_amount` in CompProfile editor

---

## Phase D — Multi-Channel Engagement

Added communication logging and messaging API integrations for BDM-to-client interactions outside of visits.

### New Lookup Categories
- **COMM_CHANNEL**: Viber, Messenger, WhatsApp, Email, Google Chat (lookup-driven, admin can add more)
- **COMM_DIRECTION**: Outbound, Inbound
- Extended **ENGAGEMENT_TYPE**: Added WhatsApp Call/Msg, Viber Call/Msg, Email Follow-up, SMS Follow-up

### New Models & Routes
- **CommunicationLog** (`backend/models/CommunicationLog.js`): Unified log for screenshot uploads + API messages. Supports both Doctor (VIP) and Client (Regular) references.
- **communicationLogRoutes** (`/api/communication-logs`): CRUD + screenshot upload + API send
- **webhookRoutes** (`/api/webhooks`): WhatsApp, Messenger, Viber delivery receipts + inbound messages

### Doctor/Client Model Extensions
- Added: `whatsappNumber`, `viberId`, `messengerId`, `preferredChannel` to both Doctor and Client models

### Frontend
- **CommLogPage** (`/bdm/comm-log`): Screenshot upload + Send Message tabs
- **CommLogsPage** (`/admin/comm-logs`): Admin overview with BDM/channel filters
- **MessageComposer**: Send messages via API directly from CRM
- **CommLogForm/CommLogList**: Screenshot upload form + filtered log list

---

## Gap 9 — Rx Correlation (Visit vs Sales + Rebates + Programs)

CRM-ERP analytics bridge correlating BDM visit activity with sell-through data to measure ROI of field visits. Two pathways: PS products (MD partner → sales → rebates) and Non-PS products (hospital stakeholder engagement → sales).

### Doctor Model Extensions
- `clientType` (String, default 'MD') — Lookup: `VIP_CLIENT_TYPE` (MD, PHARMACIST, PURCHASER, ADMINISTRATOR, KEY_DECISION_MAKER, OTHER)
- `hospitals[]` — Array of `{ hospital_id, is_primary }` for multi-hospital affiliations

### New Lookup Categories
- **VIP_CLIENT_TYPE**: MD, PHARMACIST, PURCHASER, ADMINISTRATOR, KEY_DECISION_MAKER, OTHER

### New Models
- **ProductMapping** (`backend/erp/models/ProductMapping.js`): Maps CrmProduct ↔ ProductMaster with entity scoping, match_method (MANUAL/AUTO_EXACT/AUTO_FUZZY), confidence level. Collection: `erp_product_mappings`

### New Settings
- `RX_CORRELATION_MIN_VISITS` (default 5), `RX_CORRELATION_MIN_SALES` (default 1000), `RX_CORRELATION_DEFAULT_MONTHS` (default 6)

### Key Files
```
backend/erp/services/rxCorrelationService.js     # Core analytics engine (13 functions)
backend/erp/controllers/rxCorrelationController.js  # 12 endpoints
backend/erp/routes/rxCorrelationRoutes.js         # Mounted at /api/erp/rx-correlation
backend/erp/models/ProductMapping.js              # CRM↔ERP product mapping
backend/scripts/migrateClientType.js              # Migration: set clientType='MD' on existing records
frontend/src/erp/pages/RxCorrelation.jsx          # 7-tab dashboard page
```

### Routes (all under `/api/erp/rx-correlation`, gated by `erpAccessCheck('reports')`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/summary/:period` | Territory correlation summary with filters |
| GET | `/partner-detail/:period` | Per-MD partner rebate correlation |
| GET | `/hospital-stakeholders/:period` | Hospital stakeholder engagement vs sales |
| GET | `/territory/:territoryId/:period` | Territory per-product drill-down |
| GET | `/time-series` | Monthly visit/sales/rebate trend |
| GET | `/program-effectiveness/:period` | Program ROI comparison |
| GET | `/support-effectiveness/:period` | Support type ROI comparison |
| GET | `/product-mappings` | List CRM↔ERP mappings |
| POST | `/product-mappings` | Create manual mapping |
| DELETE | `/product-mappings/:id` | Deactivate mapping |
| POST | `/product-mappings/auto-map` | Auto-map by name matching |
| GET | `/unmapped-products` | CRM products without mapping |

### CRM-Bridge Extensions
- `GET /api/erp/crm-bridge/hospitals` — Role-based hospital list for CRM dropdowns
- `GET /api/erp/crm-bridge/hospital-heat?hospital_id=xxx` — Full HEAT data for hospital

---

## Phase E — BDM Income Deductions (Lookup-Driven, Self-Service + Finance Verification)

Replaces hardcoded flat deduction fields on IncomeReport with a lookup-driven `deduction_lines[]` array. Contractors (BDMs) enter their own deductions from a dropdown, Finance verifies/corrects/rejects each line.

**Contractor-only feature**: employees use the Payroll module (Phase 10), not this.

### Architecture
- **Deduction types** stored in Lookup table: category `INCOME_DEDUCTION_TYPE` (admin adds/removes types via Control Center)
- **deduction_lines[]** sub-document array on IncomeReport model with per-line status: PENDING → VERIFIED / CORRECTED / REJECTED
- **CASH_ADVANCE** lines auto-pulled from CALF balance on generate (auto_source: 'CALF', status: 'VERIFIED')
- **Legacy flat deductions** preserved for backward compatibility — pre-save totals from deduction_lines when lines exist, falls back to flat fields when empty

### Workflow
```
Finance generates payslip (GENERATED)
  → BDM opens My Income, adds deduction lines (dropdown + amount + description)
    → Finance reviews each line: verify ✓ | correct ✎ (preserves original_amount) | reject ✕
      → Finance can also add missing lines (auto-verified)
        → Finance marks REVIEWED
          → BDM confirms
            → Finance credits (paid)
```

### New Lookup Categories
| Category | Purpose |
|----------|---------|
| `INCOME_DEDUCTION_TYPE` | Deduction types: CASH_ADVANCE, CC_PERSONAL, CREDIT_PAYMENT, PURCHASED_GOODS, LOAN_REPAYMENT, UNIFORM, OVERPAYMENT, OTHER (admin-scalable) |
| `DEDUCTION_LINE_STATUS` | PENDING, VERIFIED, CORRECTED, REJECTED |

### New/Modified Endpoints
| Method | Path | Role Gate | Description |
|--------|------|-----------|-------------|
| POST | `/income/:id/deductions` | contractor | BDM adds deduction line |
| DELETE | `/income/:id/deductions/:lineId` | contractor | BDM removes PENDING line |
| POST | `/income/:id/deductions/:lineId/verify` | admin/finance/president | Verify/correct/reject line |
| POST | `/income/:id/deductions/finance-add` | admin/finance/president | Finance adds missing deduction |

### Key Files
```
backend/erp/models/IncomeReport.js          # deduction_lines[] sub-schema added
backend/erp/services/incomeCalc.js          # Auto-creates CASH_ADVANCE line from CALF, preserves BDM lines
backend/erp/controllers/incomeController.js # 4 new endpoints: addDeductionLine, removeDeductionLine, verifyDeductionLine, financeAddDeductionLine
backend/erp/routes/incomeRoutes.js          # 4 new routes with contractor/management role gates
frontend/src/erp/hooks/useIncome.js         # 4 new hook methods
frontend/src/erp/pages/MyIncome.jsx         # NEW: Contractor self-service page (/erp/my-income)
frontend/src/erp/pages/Income.jsx           # Updated: Finance view with line verification UI
frontend/src/erp/components/WorkflowGuide.jsx # myIncome + income banners
frontend/src/components/common/Sidebar.jsx  # My Income section for contractors
frontend/src/App.jsx                        # /erp/my-income route (contractor only, requiredErpModule: reports)
```

### DeductionLine Sub-Schema
```javascript
{
  deduction_type: String,       // Lookup: INCOME_DEDUCTION_TYPE
  deduction_label: String,      // Snapshot of label at entry time
  amount: Number,               // Current amount (may be corrected by Finance)
  description: String,          // BDM explains the deduction
  entered_by: ObjectId,         // Who entered it
  entered_at: Date,
  status: String,               // PENDING → VERIFIED / CORRECTED / REJECTED
  verified_by: ObjectId,        // Finance who reviewed
  verified_at: Date,
  original_amount: Number,      // Preserved when Finance corrects (audit trail)
  finance_note: String,         // Finance explains correction/rejection
  auto_source: String           // 'CALF' for auto-pulled lines (null for manual)
}
```

---

## Phase F — Universal Approval Hub

One page (`/erp/approvals`) where president or any authorized person sees ALL pending transactions across all modules and approves inline. Cross-entity for president. Delegatable via ApprovalRule.

### Architecture
- **universalApprovalService.js**: Queries 6 modules in parallel (ApprovalRequest, DeductionSchedule, IncomeReport, GrnEntry, Payslip, KpiSelfRating), normalizes results
- **MODULE_QUERIES registry**: Scalable — add a new module by adding a query function, no switch/if chains
- **Authorization**: Checks ApprovalRules first (delegation), falls back to role-based, president always sees all
- **Cross-entity**: President queries ALL entities. Multi-entity users query their assigned entities. Single-entity users query their own.
- **Sidebar badge**: Pending count refreshes every 60s, emits `approval:updated` event

### Delegation (via existing ApprovalRule)
President assigns approval authority in Control Center → Approvals → Rules tab:
- `approver_type: 'USER'` + specific person IDs → that person sees the module in their hub
- `approver_type: 'ROLE'` + role names → anyone with that role sees it
- `approver_type: 'REPORTS_TO'` → the submitter's manager

### Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/erp/approvals/universal-pending` | All pending items across all modules |
| POST | `/api/erp/approvals/universal-approve` | Approve/reject any item (routes to module logic) |

### Universal Item Shape
```javascript
{ id, module, doc_type, doc_id, doc_ref, description, amount, submitted_by, submitted_at, status, current_action, action_key, approve_data }
```

### Key Files
```
backend/erp/services/universalApprovalService.js     # Aggregation + authorization
backend/erp/controllers/universalApprovalController.js # 2 endpoints
backend/erp/routes/approvalRoutes.js                 # Routes added
frontend/src/erp/hooks/useApprovals.js               # fetchUniversalPending + universalApprove
frontend/src/erp/pages/ApprovalManager.jsx           # "All Pending" tab with inline approve
frontend/src/components/common/Sidebar.jsx           # Badge count (60s refresh)
frontend/src/erp/components/WorkflowGuide.jsx        # Updated approval-manager banner
```

### New Lookup Categories
| Category | Purpose |
|----------|---------|
| `UNIVERSAL_APPROVAL_ACTION` | REVIEW, APPROVE, CREDIT, REJECT with color metadata |

---

## Phase E.2 — Deduction Schedules (Recurring + Non-Recurring)

Standalone `DeductionSchedule` model for both recurring (CC installment ₱990/month × 10) and non-recurring (one-time ₱1,500 next month) deductions. BDMs create schedules even before payslips exist. Installments auto-inject into payslips when generated.

### Architecture
- **DeductionSchedule** model with `installments[]` sub-array (follows LoanMaster.amortization_schedule pattern)
- `term_months = 1` → one-time deduction; `term_months > 1` → installment plan
- Installments pre-generated on create via pre-save hook with period arithmetic
- Auto-injection: `incomeCalc.js` queries ACTIVE schedules, injects matching installments as deduction_lines with `auto_source: 'SCHEDULE'`
- Bidirectional sync: verify/credit on payslip → updates installment status on schedule

### Workflow
```
BDM creates schedule (PENDING_APPROVAL)
  → Finance approves (ACTIVE) — installments[] all PENDING
    → Payslip generated → matching installment auto-injected (INJECTED)
      → Finance verifies deduction line → installment syncs to VERIFIED
        → Payslip credited → installment syncs to POSTED
          → All installments POSTED → schedule auto-completes (COMPLETED)
```

### New Lookup Categories
| Category | Purpose |
|----------|---------|
| `DEDUCTION_SCHEDULE_STATUS` | PENDING_APPROVAL, ACTIVE, COMPLETED, CANCELLED, REJECTED |

### Endpoints (all under `/api/erp/deduction-schedules`)
| Method | Path | Role | Description |
|--------|------|------|-------------|
| POST | `/` | contractor | BDM creates schedule |
| GET | `/my` | contractor | BDM lists own schedules |
| GET | `/:id` | any (own or admin) | Get schedule detail |
| GET | `/` | management | List all schedules |
| POST | `/:id/approve` | management | Approve schedule |
| POST | `/:id/reject` | management | Reject schedule |
| POST | `/:id/cancel` | management | Cancel + cancel PENDING installments |
| POST | `/:id/early-payoff` | management | Lump-sum remaining balance |
| PUT | `/:id/installments/:instId` | management | Adjust installment amount |
| POST | `/finance-create` | management | Create on behalf of BDM (auto-ACTIVE) |

### Key Files
```
backend/erp/models/DeductionSchedule.js           # Model with installments[] + pre-save hook
backend/erp/services/deductionScheduleService.js   # 7 service functions
backend/erp/controllers/deductionScheduleController.js  # 10 endpoints
backend/erp/routes/deductionScheduleRoutes.js      # Routes with role gates
backend/erp/routes/index.js                        # Mounted at /deduction-schedules
backend/erp/services/incomeCalc.js                 # Auto-injection logic (step 4b)
backend/erp/controllers/incomeController.js        # Sync on verify + credit
frontend/src/erp/hooks/useDeductionSchedule.js     # 10 hook methods
frontend/src/erp/pages/MyIncome.jsx                # BDM: Payslips + Schedules tabs
frontend/src/erp/pages/Income.jsx                  # Finance: Payslips + Schedules tabs
```

---

## Phase C — Backend Enum Cleanup (Rule #3 Compliance)

Removed 78 Mongoose `enum:` constraints from ~35 models. Business values now validated at the app layer via the Lookup table instead of hardcoded schema enums.

### What Changed
- **Models modified**: 35 (PaymentMode, CompProfile, PeopleMaster, Customer, Hospital, ProductMaster, SalesLine, ExpenseEntry, CreditCard, CreditNote, SmerEntry, OfficeSupply, OfficeSupplyTransaction, Collateral, BankAccount, JournalEntry, OwnerEquityEntry, PrfCalf, Warehouse, VendorMaster, Payslip, InsurancePolicy, BudgetAllocation, GovernmentRates, CarLogbookEntry, Collection, InventoryLedger, PettyCashTransaction, PettyCashFund, PettyCashRemittance, CycleReport, IncomeReport, ConsignmentTracker, Visit, ClientVisit, MessageInbox)
- **New utility**: `backend/erp/utils/validateLookup.js` — `assertLookup()` and `assertLookups()` for app-layer validation
- **New seed categories**: 25 new lookup categories added to SEED_DEFAULTS (CYCLE, WAREHOUSE_TYPE, OVERRIDE_REASON, PETTY_CASH_TXN_TYPE, etc.)
- **Controller fixes**: governmentRatesController and officeSupplyController now reference SEED_DEFAULTS instead of hardcoded arrays

### What Was Kept
- Document lifecycle statuses (DRAFT/VALID/ERROR/POSTED) — workflow integrity
- Access levels (NONE/VIEW/FULL) — structural permission system
- Accounting fundamentals (ASSET/LIABILITY/EQUITY/REVENUE/EXPENSE, DEBIT/CREDIT)
- Agent keys and execution states — system-level
- Approval workflow states — structural

### Validation Pattern
```javascript
const { assertLookup, assertLookups } = require('../utils/validateLookup');

// Single field validation
await assertLookup(entityId, 'VAT_TYPE', body.vat_type, 'vat_type');

// Multi-field validation (batched)
await assertLookups(entityId, {
  VAT_TYPE:  { value: body.vat_type,  field: 'vat_type' },
  SALE_TYPE: { value: body.sale_type, field: 'sale_type' },
});
```

Each model field has a `// Lookup: CATEGORY_NAME` comment indicating which lookup category governs it.

---

## Sales Goals, KPI & Partnership Performance (Phase 28)

Database-driven sales goal tracking with tiered incentive programs. Zero hardcoding — all config lives in Lookup tables.

### Architecture
- **SalesGoalPlan** — Annual plan container with growth drivers, KPI definitions, incentive programs
- **SalesGoalTarget** — Hierarchical targets: Plan → Entity → Territory → BDM (rollup with validation)
- **KpiSnapshot** — Monthly auto-computed KPI values from existing ERP data (SalesLine, Collection, Hospital, Inventory, Visit)
- **ActionItem** — Tracked action items tied to growth drivers with polymorphic refs to Hospital/Product/Doctor

### Access Control
- 11th module `sales_goals` in AccessTemplate with 5 sub-permissions: `plan_manage`, `kpi_compute`, `action_manage_all`, `incentive_manage`, `manual_kpi_all`
- BDMs get VIEW (see own goals), delegates get FULL with sub-permissions

### Lookup Categories (6 new)
| Category | Purpose |
|----------|---------|
| `GOAL_CONFIG` | Attainment thresholds, collection %, fiscal start month (metadata.value) |
| `GROWTH_DRIVER` | Driver types: HOSP_ACCRED, PHARMACY_CSR, ZERO_LOST_SALES, STRATEGIC_MD, PRICE_INCREASE |
| `KPI_CODE` | 13 KPI metrics with auto/manual computation, units, direction (metadata) |
| `INCENTIVE_TIER` | Tiered rewards: Platinum/Gold/Silver/Bronze/Participant with attainment_min + budget_per_bdm (metadata) |
| `ACTION_TYPE` | Action item types: ACCREDITATION, FORMULARY_LISTING, MD_ENGAGEMENT, etc. |
| `INCENTIVE_PROGRAM` | Named programs: JAPAN_TRIP_2026 (metadata: fiscal_year, qualification_metric, use_tiers) |

### Key Files
```
backend/erp/models/SalesGoalPlan.js          # Annual plan with growth_drivers[] + incentive_programs[]
backend/erp/models/SalesGoalTarget.js        # ENTITY/TERRITORY/BDM targets with rollup
backend/erp/models/KpiSnapshot.js            # Monthly KPI snapshots with incentive_status[]
backend/erp/models/ActionItem.js             # Tracked actions with polymorphic refs
backend/erp/services/salesGoalService.js     # KPI computation engine + incentive tier logic
backend/erp/controllers/salesGoalController.js  # 20+ endpoints
backend/erp/routes/salesGoalRoutes.js        # Mounted at /api/erp/sales-goals
frontend/src/erp/hooks/useSalesGoals.js      # Frontend hook
frontend/src/erp/pages/SalesGoalDashboard.jsx   # Command center with leaderboard
frontend/src/erp/pages/SalesGoalSetup.jsx       # Plan/target/driver/incentive config (5 tabs)
frontend/src/erp/pages/SalesGoalBdmView.jsx     # Individual BDM detail with attainment ring
frontend/src/erp/pages/IncentiveTracker.jsx     # Tiered leaderboard with budget advisor
```

### Routes
| Method | Path | Description |
|--------|------|-------------|
| GET | `/sales-goals/plans` | List plans |
| POST | `/sales-goals/plans` | Create plan (FULL + plan_manage) |
| POST | `/sales-goals/plans/:id/activate` | Activate plan (FULL + plan_manage) |
| POST | `/sales-goals/targets/bulk` | Bulk create BDM targets (FULL + plan_manage) |
| GET | `/sales-goals/targets/mine` | BDM's own target |
| POST | `/sales-goals/snapshots/compute` | Trigger KPI computation (FULL + kpi_compute) |
| GET | `/sales-goals/dashboard` | Goal dashboard (VIEW+) |
| GET | `/sales-goals/dashboard/incentives` | Incentive leaderboard |
| POST | `/sales-goals/actions` | Create action item |
| POST | `/sales-goals/kpi/manual` | Enter manual KPI value |

### Incentive Tier Logic
- Tiers defined in Lookup INCENTIVE_TIER with `metadata.attainment_min` and `metadata.budget_per_bdm`
- System matches BDM attainment % to highest qualifying tier (sorted descending)
- Projected tier computed from annualized run rate: `(actual / monthsElapsed) * 12 / target`
- Budget advisor reads P&L to suggest sustainable tier budgets
- President adjusts tiers anytime via Control Center → Lookup Tables (no code changes)

---

## ERP Email Notifications (Phase 29)

Non-blocking email notifications on document status changes. All sends are fire-and-forget — notification failure never breaks business logic.

### Notification Types
- **Document Posted**: Sales CSI, Collection CR, Expenses, Supplier Invoices → notifies admin/finance/president
- **Document Reopened**: Sales/Collections reopened → notifies admin/finance (includes JE reversal context)
- **Payroll Posted**: Payslip batch posted → notifies management with count and total net pay
- **Approval Request**: Document requires approval → notifies resolved approvers
- **Approval Decision**: Approved/rejected → notifies the document requester

### Key Files
```
backend/templates/erpEmails.js           # HTML email templates (5 templates)
backend/erp/services/erpNotificationService.js  # Notification orchestration (non-blocking)
backend/models/EmailLog.js               # Extended with 5 new ERP email types
```

### Recipient Resolution
Recipients are resolved dynamically from the database — no hardcoded recipient lists:
- `findManagementRecipients(entityId)` → admin/finance/president users scoped to entity
- `findNotificationRecipients(entityId, filter)` → custom role/entity filter
- Multi-entity users found via `entity_ids` array; president/CEO see all entities

---

## Approval Workflow (Phase 29 — Authority Matrix)

Multi-level, database-driven approval workflow. Controlled by `Settings.ENFORCE_AUTHORITY_MATRIX` (default: `false`).

### Architecture
- **ApprovalRule** — entity-scoped rules: module + doc_type + amount threshold + level + approver config
- **ApprovalRequest** — individual request per document, tracks PENDING → APPROVED/REJECTED with immutable history
- Rules support 3 approver types: `ROLE` (any user with specified roles), `USER` (specific users), `REPORTS_TO` (requester's PeopleMaster.reports_to manager)
- Multi-level: Level 1 must approve before Level 2 is evaluated. Up to 5 levels.

### How It Works
1. When a controller calls `checkApprovalRequired()`, the service checks if `ENFORCE_AUTHORITY_MATRIX` is true
2. If true, finds matching rules for the entity/module/docType/amount
3. If rules match, creates `ApprovalRequest(PENDING)` and notifies approvers via email
4. Controller returns HTTP 202 (Accepted) with `approval_pending: true`
5. Approver visits `/erp/approvals` → approves or rejects (rejection requires reason)
6. On approve, if next-level rules exist, escalates automatically
7. Once fully approved, the controller's next attempt proceeds without blocking

### Key Files
```
backend/erp/models/ApprovalRule.js       # Rule configuration (entity-scoped)
backend/erp/models/ApprovalRequest.js    # Request tracking (immutable history)
backend/erp/services/approvalService.js  # Business logic (check, resolve, decide)
backend/erp/controllers/approvalController.js  # CRUD + approve/reject endpoints
backend/erp/routes/approvalRoutes.js     # Mounted at /api/erp/approvals
frontend/src/erp/hooks/useApprovals.js   # Frontend hook
frontend/src/erp/pages/ApprovalManager.jsx  # Approval management page
```

### Routes
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/erp/approvals/status` | Check if authority matrix is enabled |
| GET | `/api/erp/approvals/my-pending` | Pending approvals for logged-in user |
| GET | `/api/erp/approvals/requests` | List all requests (filterable by status/module) |
| POST | `/api/erp/approvals/requests/:id/approve` | Approve a request |
| POST | `/api/erp/approvals/requests/:id/reject` | Reject a request (reason required) |
| POST | `/api/erp/approvals/requests/:id/cancel` | Cancel a pending request |
| GET | `/api/erp/approvals/rules` | List approval rules |
| POST | `/api/erp/approvals/rules` | Create rule (admin only) |
| PUT | `/api/erp/approvals/rules/:id` | Update rule (admin only) |
| DELETE | `/api/erp/approvals/rules/:id` | Delete rule (admin only) |

### Controller Integration
Currently wired into:
- **PO Approval** (`purchasingController.approvePO`): Calls `checkApprovalRequired()` before approving. Returns 202 if pending.

To add to other controllers, follow the same pattern:
```javascript
const approvalCheck = await checkApprovalRequired({
  entityId: req.entityId, module: 'MODULE', docType: 'TYPE',
  docId: doc._id, docRef: doc.ref, amount: doc.total,
  requesterId: req.user._id, requesterName: req.user.name,
});
if (approvalCheck.required) {
  return res.status(202).json({ success: true, message: approvalCheck.message, approval_pending: true });
}
```

---

## Role Centralization (Phase 30)

### Single Source of Truth
All role strings centralized in two constants files:
- **Backend**: `backend/constants/roles.js` (CommonJS)
- **Frontend**: `frontend/src/constants/roles.js` (ES module)

### Role Rename: `employee` → `contractor`
BDMs, IT professionals, cleaners, pharmacists, consultants are all independent contractors, not employees. The `employee` role is reserved for future actual hires.

### System Roles
| Role | Constant | Description |
|------|----------|-------------|
| `admin` | `ROLES.ADMIN` | System administrator |
| `contractor` | `ROLES.CONTRACTOR` | BDMs, IT, cleaners, pharmacists — all non-management workers |
| `finance` | `ROLES.FINANCE` | Finance/accounting manager |
| `president` | `ROLES.PRESIDENT` | Company president — full cross-entity access |
| `ceo` | `ROLES.CEO` | Chief Executive — view-only on ERP |

### Permission Sets (ROLE_SETS)
| Set | Roles | Used For |
|-----|-------|----------|
| `ADMIN_LIKE` | admin, finance, president, ceo | Admin-level access checks |
| `PRESIDENT_ROLES` | president, ceo | Cross-entity superusers |
| `ERP_ALL` | contractor, admin, finance, president | All ERP page access |
| `BDM_ADMIN` | contractor, admin | CRM field routes |
| `ADMIN_ONLY` | admin | Admin-exclusive routes |
| `ERP_FINANCE` | contractor, admin, finance | Finance-tier routes |
| `MANAGEMENT` | admin, finance, president | Config/write access |

### PeopleMaster Lookup-Driven Validation
`person_type`, `employment_type`, `bdm_stage` no longer use hardcoded enums. They validate against Lookup tables (auto-seeded on first access). President can add new values via Control Center → Lookup Tables.

### Career Path (bdm_stage — universal)
Applies to ALL roles. Everyone can progress:
`CONTRACTOR → PS_ELIGIBLE → TRANSITIONING → SUBSIDIARY → SHAREHOLDER`

### New Lookup Categories (Phase 30)
| Category | Purpose |
|----------|---------|
| `BDM_STAGE` | Career path stages (5 values, editable in Control Center) |
| `ROLE_MAPPING` | Maps person_type → system_role for login creation (6 mappings) |
| `SYSTEM_ROLE` | Documents system roles (informational, editable labels) |

### Retired: `backend/utils/roleHelpers.js`
Replaced by `backend/constants/roles.js`. All importers updated.

---

## Functional Role Assignment (Phase 31)

Enables cross-entity deployment of people — assigning a person to perform specific functions at multiple entities with date ranges and approval limits.

### Model
- **FunctionalRoleAssignment** — maps person_id + entity_id + functional_role with valid_from/to, approval_limit, status
- Collection: `erp_functional_role_assignments`
- Functional roles are lookup-driven via `FUNCTIONAL_ROLE` category (PURCHASING, ACCOUNTING, COLLECTIONS, INVENTORY, SALES, ADMIN, AUDIT, PAYROLL, LOGISTICS)

### Key Queries
- "Who handles ACCOUNTING at Entity X?" → `{ entity_id: X, functional_role: 'ACCOUNTING', is_active: true }`
- "What entities does Person Y serve?" → `{ person_id: Y, is_active: true }`

### Key Files
```
backend/erp/models/FunctionalRoleAssignment.js    # Model with lookup validation
backend/erp/controllers/functionalRoleController.js # 7 CRUD operations + bulk create
backend/erp/routes/functionalRoleRoutes.js          # /api/erp/role-assignments
frontend/src/erp/hooks/useFunctionalRoles.js        # Frontend hook
frontend/src/erp/pages/RoleAssignmentManager.jsx    # Page + ControlCenter panel
```

### Integration Points
- **PersonDetail.jsx** Section F: shows cross-entity assignments for a person
- **ControlCenter.jsx**: embedded under People & Access → Role Assignments
- **App.jsx**: standalone route at `/erp/role-assignments`
- **lookupGenericController.js**: FUNCTIONAL_ROLE added to SEED_DEFAULTS

---

## Universal KPI Self-Rating & Performance Review (Phase 32)

Universal, lookup-driven KPI self-rating system where ALL members — regardless of function — can rate themselves on function-specific KPIs + competencies, go through a structured self → manager → approval workflow, and view their performance trajectory.

### Architecture
- **KpiSelfRating** — Rating document: entity-scoped, person-scoped, period-scoped (unique per person/period/type)
- **KPI_CODE lookup** — Extended with `functional_roles` metadata to map KPIs to functions (SALES, PURCHASING, ACCOUNTING, etc.)
- **COMPETENCY lookup** — Universal competencies (Communication, Teamwork, Leadership, etc.)
- **RATING_SCALE lookup** — 1-5 scale definitions
- **REVIEW_PERIOD_TYPE lookup** — Monthly, Quarterly, Semi-Annual, Annual
- **Auto-draft creation** — System auto-populates KPIs based on person's FunctionalRoleAssignment(s) + universal 'ALL' KPIs

### Workflow
```
DRAFT → SUBMITTED → REVIEWED → APPROVED
                  ↘ RETURNED → (re-edit) → SUBMITTED
```

### Key Files
```
backend/erp/models/KpiSelfRating.js               # Rating document (entity+person+period unique)
backend/erp/controllers/kpiSelfRatingController.js # 10 endpoints (auto-draft, review, approve)
backend/erp/routes/kpiSelfRatingRoutes.js          # Mounted at /api/erp/self-ratings
frontend/src/erp/hooks/useKpiSelfRating.js         # Frontend hook
frontend/src/erp/pages/KpiSelfRating.jsx           # Self-rating form + manager review + history
frontend/src/erp/pages/KpiLibrary.jsx              # Admin SMART goal form (SAP SuccessFactors pattern)
```

### Routes
| Method | Path | Description |
|--------|------|-------------|
| GET | `/self-ratings/my` | Own ratings history |
| GET | `/self-ratings/my/current` | Get or auto-create DRAFT for current period |
| GET | `/self-ratings/review` | Manager's pending reviews |
| GET | `/self-ratings/by-person/:personId` | Admin: all ratings for a person |
| POST | `/self-ratings` | Save draft |
| POST | `/self-ratings/:id/submit` | DRAFT → SUBMITTED |
| PUT | `/self-ratings/:id/review` | Manager adds scores → REVIEWED |
| POST | `/self-ratings/:id/approve` | Admin approves → APPROVED |
| POST | `/self-ratings/:id/return` | Return for revision → RETURNED |
| GET | `/self-ratings/:id` | Single rating (self/manager/admin) |

### New Lookup Categories (Phase 32)
| Category | Purpose |
|----------|---------|
| `RATING_SCALE` | 1-5 performance scale (Needs Improvement → Outstanding) |
| `COMPETENCY` | 8 universal competencies (Communication, Teamwork, Leadership, etc.) |
| `REVIEW_PERIOD_TYPE` | Review period types (Monthly, Quarterly, Semi-Annual, Annual) |

### KPI_CODE Extensions (Phase 32)
- All 13 existing sales KPIs now have `functional_roles: ['SALES']` + `description` in metadata
- 3 new Purchasing KPIs (PO_PROCESSING_TIME, VENDOR_PAYMENT_COMPLIANCE, COST_SAVINGS_PCT)
- 3 new Accounting KPIs (CLOSE_TIMELINESS, JOURNAL_ACCURACY, RECONCILIATION_RATE)
- 2 new Collections KPIs (COLLECTION_EFFICIENCY, AGING_REDUCTION)
- 2 new Inventory KPIs (STOCKOUT_RATE, CYCLE_COUNT_ACCURACY)
- 2 Universal KPIs (ATTENDANCE_RATE, TASK_COMPLETION) — `functional_roles: ['ALL']`

### Integration Points
- **PersonDetail.jsx** Section G: shows latest rating summary (period, status, self/manager scores)
- **ControlCenter.jsx**: embedded under People & Access → KPI Library + KPI Self-Rating
- **App.jsx**: standalone routes at `/erp/kpi-library` (MANAGEMENT) and `/erp/self-rating` (ERP_ALL)
- **WorkflowGuide**: banners for both kpiLibrary and kpiSelfRating pages

---

## Bulk Role Migration + Login Fix (Phase 33)

Fixes a login-blocking bug where users with legacy `medrep` role could not log in (Mongoose enum validation rejected it on `user.save()` during login). Adds admin-facing bulk role migration via Control Center.

### Root Cause
`ALL_ROLES` in `backend/constants/roles.js` excluded `'medrep'`. Login calls `user.save()` to persist refreshToken — Mongoose enum validation rejects the save, returning 500.

### Fix
- Added `ROLES.MEDREP` back to `ALL_ROLES` for backward compatibility
- Added bulk migration endpoint so admins can convert legacy roles via Control Center

### New Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/erp/people/legacy-role-counts` | Returns counts of users with legacy roles (medrep, employee) |
| POST | `/api/erp/people/bulk-change-role` | Bulk-migrates all users from one role to another (admin/president only) |

### PeopleList Migration Banner
A yellow banner auto-appears in People Master when legacy roles (medrep, employee) are detected in the database. Shows user counts per legacy role with one-click "Migrate → contractor" buttons. Banner disappears once no legacy roles remain.

### Key Files
```
backend/constants/roles.js                    # MEDREP added back to ALL_ROLES
backend/erp/controllers/peopleController.js   # bulkChangeSystemRole + getLegacyRoleCounts
backend/erp/routes/peopleRoutes.js            # Two new routes (before /:id params)
frontend/src/erp/hooks/usePeople.js           # getLegacyRoleCounts + bulkChangeRole
frontend/src/erp/pages/PeopleList.jsx         # Migration banner UI
frontend/src/erp/components/WorkflowGuide.jsx # Updated people-list banner
```

### Frontend Cleanup
- `LoginPage.jsx` — removed dead `case 'medrep':` redirect
- `HomePage.jsx` — replaced `medrep: 'MedRep'` with `contractor: 'Contractor'` in role label map

---

## Key ERP Files

### Backend Structure
```
backend/
├── constants/       # roles.js — centralized role constants (single source of truth for CRM+ERP)
└── erp/
    ├── models/          # 30+ models (SalesLine, Collection, ExpenseEntry, PrfCalf, Payslip, JournalEntry, etc.)
    ├── controllers/     # 15+ controllers (sales, collection, expense, payroll, purchasing, accounting, banking, etc.)
    ├── services/        # Business logic (fifoEngine, arEngine, autoJournal, journalEngine, pnlService, etc.)
    ├── routes/          # Mounted under /api/erp/* via erpRouter.js
    ├── middleware/       # erpAccessCheck (entity+module guard)
    ├── scripts/         # Seed scripts (COA, products, hospitals, bank accounts, credit cards)
    └── utils/           # periodLock, docNumbering
```

### Frontend Structure
```
frontend/src/erp/
├── pages/           # 30+ pages (SalesEntry, Collections, Expenses, JournalEntries, ProfitAndLoss, etc.)
├── hooks/           # useErpSubAccess, usePeople, useAccounting, useCustomers, etc.
└── components/      # Shared ERP components
```

---

## Accounting Engine (Phase 11)

### Auto-Journal on POST

Every submit/post controller creates journal entries via `autoJournal.js` → `journalEngine.createAndPostJournal(entityId, jeData)`. JE creation is non-blocking (after MongoDB transaction, wrapped in try/catch).

### JE Reversal on REOPEN

All reopen functions call `journalEngine.reverseJournal()` (SAP Storno pattern: creates a new JE with flipped DR/CR amounts, original stays POSTED, reversal links via `corrects_je_id`). VAT/CWT ledger entries cleaned up on reopen.

### COA Mapping

| Transaction | Debit | Credit |
|-------------|-------|--------|
| Sale (CSI) | 1100 AR Trade | 4000 Revenue + 2100 VAT |
| COGS | 5000 COGS | 1200 Inventory |
| Service Revenue | 1100 AR Trade | 4100 Service Revenue |
| Collection | Cash/Bank (resolved) | 1100 AR Trade |
| CWT | 1220 CWT Receivable | 1100 AR Trade |
| SMER | 6100/6150/6160/6170 | 1110 AR BDM |
| Car Logbook | 6200 Fuel | 1110 or funding COA |
| Expenses ORE | line.coa_code | 1110 AR BDM |
| Expenses ACCESS | line.coa_code | funding COA |
| PRF | 5200 Partner Rebate | funding COA |
| CALF | 1110 AR BDM | funding COA |
| Payroll | 6000/6050/5100/6060 | 2200-2230 + Cash/Bank |
| AP (SI Post) | 1200 Inventory + 1210 VAT | 2000 AP Trade |
| AP Payment | 2000 AP Trade | Cash/Bank |
| Depreciation | 7000 Depreciation | 1350 Accum. Depr. |
| Interest | 7050 Interest | 2300 Loans Payable |
| IC Transfer (sender) | 1150 IC Receivable | 1200 Inventory |
| IC Transfer (receiver) | 1200 Inventory | 2050 IC Payable |
| Commission | 5100 BDM Commission | 1110 AR BDM |
| Inventory Write-Off | 6850 Inventory Write-Off | 1200 Inventory |
| Inventory Adj Gain | 1200 Inventory | 6860 Inventory Adj Gain |
| Petty Cash | 6XXX Expense | 1015 Petty Cash |
| Owner Infusion | Cash/Bank | 3000 Owner Capital |
| Owner Drawing | 3100 Owner Drawings | Cash/Bank |

### Funding COA Resolution

`resolveFundingCoa(doc)` in `autoJournal.js` resolves credit-side COA:
1. `funding_card_id` → CreditCard.coa_code
2. `funding_account_id` or `bank_account_id` → BankAccount.coa_code
3. `payment_mode` → PaymentMode.coa_code
4. Fallback: 1000 (Cash on Hand)

---

## Key Services

| Service | File | Purpose |
|---------|------|---------|
| `autoJournal.js` | `backend/erp/services/autoJournal.js` | 15 `journalFrom*()` functions — return JE data objects (not persisted) |
| `journalEngine.js` | `backend/erp/services/journalEngine.js` | `createAndPostJournal()`, `reverseJournal()`, `getGeneralLedger()` |
| `fifoEngine.js` | `backend/erp/services/fifoEngine.js` | FIFO consumption for sales, returns `{ batch_lot_no, expiry_date, qty_consumed }` |
| `arEngine.js` | `backend/erp/services/arEngine.js` | AR computation from source docs (SalesLine + Collection), NOT from GL |
| `trialBalanceService.js` | `backend/erp/services/trialBalanceService.js` | Aggregates from POSTED JournalEntry lines |
| `pnlService.js` | `backend/erp/services/pnlService.js` | P&L from JournalEntries (GL-based, authoritative) |
| `pnlCalc.js` | `backend/erp/services/pnlCalc.js` | Legacy P&L from source documents (used for year-end close) |
| `vatService.js` | `backend/erp/services/vatService.js` | VAT ledger CRUD, `computeVatReturn2550Q()` |
| `cwtService.js` | `backend/erp/services/cwtService.js` | CWT ledger CRUD, `computeCwt2307Summary()` |
| `monthEndClose.js` | `backend/erp/services/monthEndClose.js` | 29-step SOP (Phases 1-7), depreciation/interest posting works, Phase 3 journal posting is stub |
| `stockSeedService.js` | `backend/erp/services/stockSeedService.js` | Reusable stock seeding logic — matches products via 3-strategy fuzzy match, creates OPENING_BALANCE entries. Used by CLI script and API endpoint. BDM→warehouse mapping resolved from DB (no hardcoding). |

### Product Master & Stock On Hand Import Endpoints

| Method | Path | Description |
|--------|------|-------------|
| PUT | `/erp/products/refresh` | Refresh Product Master from CSV/XLSX. Upserts by brand+dosage, deactivates duplicates and stale products. |
| PUT | `/erp/products/import-prices` | Bulk update prices from XLSX (existing) |
| GET | `/erp/products/export-prices` | Export prices to XLSX (existing) |
| POST | `/erp/inventory/seed-stock-on-hand` | Seed opening stock from CSV. Creates OPENING_BALANCE per warehouse/product/batch. Skips unmatched products. |

**Workflow**: Refresh Master (clean CSV → deduplicated DB) → Import Opening Stock (SOH CSV → OPENING_BALANCE per warehouse)

---

## Common ERP Gotchas

1. **autoJournal functions return data objects** (not persisted). Caller must call `createAndPostJournal(entityId, jeData)`.
2. **`source_event_id`** on JournalEntry links JE to TransactionEvent — used for reversal lookup on reopen.
3. **ProductMaster.purchase_price** drives COGS — if zero, COGS JE will have zero amount.
4. **VAT/CWT ledger entries** are separate from journal entries — they feed VAT Return (2550Q) and CWT Summary (2307) pages.
5. **Dual P&L**: `pnlService.js` (GL-based) vs `pnlCalc.js` (source-doc-based). `pnlService` is authoritative; `pnlCalc` used for legacy year-end close.
6. **AR Engine vs GL mismatch risk**: `arEngine.js` computes from source docs, `trialBalanceService.js` from JEs. They can diverge if JEs fail.
7. **CALF gate**: Expenses with `calf_required=true` cannot be posted until linked CALF is POSTED (enforced in `submitExpenses` and `submitCarLogbook`).
8. **Period lock**: `periodLockCheck(moduleKey)` middleware prevents posting to locked periods. Applied to all transactional routes: Sales, Collections, Expenses, Purchasing, Income, and Journals. Module keys in PeriodLock model: SALES, COLLECTION, EXPENSE, JOURNAL, PAYROLL, PURCHASING, INVENTORY, BANKING, PETTY_CASH, IC_TRANSFER, INCOME.
9. **Product dropdown format**: All dropdowns must show `brand_name dosage — qty unit_code` (dosage required, never omit).
10. **IC_TRANSFER** source_module — added to JournalEntry enum for inter-company transfer JEs.
11. **People dropdowns must filter `status=ACTIVE`** — all people selector dropdowns (Managed By, Reports To, Assign To, Custodian, etc.) must pass `status: 'ACTIVE'` to `getPeopleList()` or rely on `getAsUsers()` which enforces `is_active: true, status: 'ACTIVE'`. Never show SUSPENDED or SEPARATED people in assignment/selection dropdowns.
12. **Position and Department are lookup-driven** — stored as lookup codes from POSITION / DEPARTMENT categories. PersonDetail.jsx renders them as `<select>` dropdowns via `useLookupBatch`. To add new positions, use Control Center > Lookup Tables.
13. **ERP Access modules use Mixed schema** — `AccessTemplate.modules` and `User.erp_access.modules` are `mongoose.Schema.Types.Mixed` (not fixed fields). This allows new modules added via ERP_MODULE lookup to work without schema changes. The controller validates values are `NONE | VIEW | FULL`. Always call `markModified('modules')` or `markModified('erp_access')` after mutation.
14. **Income projection** is read-only — never creates documents. Use `request-generation` to create the actual IncomeReport.
15. **CALF is bidirectional** in income: positive balance = deduction, negative balance = earnings reimbursement. Not just one-way.
16. **Revolving fund** follows per-person override pattern: `CompProfile.revolving_fund_amount` → `Settings.REVOLVING_FUND_AMOUNT` fallback. 0 = use global.
17. **Personal gas auto-deduction** rebuilds fresh on each income generation (like CALF auto-lines). Comes from CarLogbook `personal_gas_amount`, not manual entry.
18. **ORE is paid from revolving fund** — ORE amounts in SMER daily `ore_amount` are already included in `total_reimbursable`. No separate ORE earnings line. `ExpenseEntry` (ORE type) tracks receipts/ORs.

---

## Batch Expense Upload (Phase 20)

President/admin-only feature for bulk receipt processing:
- `POST /expenses/ore-access/batch-upload` — up to 20 images, OCR → classify COA → assorted items (3+ line items)
- `POST /expenses/ore-access/batch-save` — save reviewed lines as DRAFT
- Setup: BIR flag, category, employee, cost center, funding (card/bank), period/cycle
- `bir_flag` passthrough: `submitExpenses` and `submitPrfCalf` use `entry.bir_flag || 'BOTH'`
- President override via `recorded_on_behalf_of` bypasses CALF requirement
- COA dropdown loads from API (`GET /api/erp/coa`) — scalable, not hardcoded

### COA Export/Import
- `GET /api/erp/coa/export?format=xlsx` — Excel download (Google Sheets compatible)
- `GET /api/erp/coa/export?format=json` — JSON download
- `POST /api/erp/coa/import` — accepts Excel file upload OR JSON body, upserts by account_code

### Multi-Business-Line COA (Pharma + F&B + Rental)
VIP runs three business lines under one entity, tracked by cost centers:
- **Pharma**: 4000-4100 Revenue, 5000-5300 COGS, 6000-6600 OpEx
- **F&B (Balai Lawaan)**: 4300 F&B Revenue, 5400 Food Cost, 5500 Beverage Cost, 6830-6840 F&B OpEx
- **Rental (Balai Lawaan)**: 4400-4500 Rental Income (Short/Long), 6870-6890 Property OpEx

---

## Remaining Known Gaps (P2 — Not Critical)

| Gap | Description | Impact |
|-----|-------------|--------|
| Dual P&L deprecation | pnlCalc vs pnlService coexist without reconciliation | Consistency risk |
| Commission controller | No dedicated controller — wired inline in collectionController | Works, not clean |
| VAT 0.12 in pre-save hooks | SalesLine, ExpenseEntry, Collection etc. hardcode 12% in schema hooks | Cannot change per entity; low risk until rate changes |
| ~~Frontend hardcoded dropdowns~~ | ~~Static arrays on non-people pages served as fallbacks~~ | **RESOLVED Phase B (Apr 2026)**: All 17 frontend files migrated — `_FALLBACK` arrays removed, replaced with `useLookupBatch()`/`useLookupOptions()` calls. 9 new seed categories added (ACCOUNT_TYPE, PO_STATUS, GOV_RATE_TYPE, GOV_RATE_BRACKET_TYPE, GOV_RATE_FLAT_TYPE, KPI_DIRECTION, KPI_UNIT, KPI_COMPUTATION). Zero hardcoded business value arrays remain in frontend. |
| ~~Role-People alignment warnings~~ | ~~No toast/warning when User.role doesn't match PeopleMaster.person_type via ROLE_MAPPING~~ | **RESOLVED Phase 30**: alignment check toast in PersonDetail.jsx — fires on load when linked user role mismatches ROLE_MAPPING |
| Hospital entity_id optional | Hospitals intentionally global (shared across entities) | By design, but undocumented in schema |

---

## ERP Routes

All ERP routes mounted under `/api/erp/` via `backend/erp/routes/erpRouter.js`. Sub-module access controlled by `erpAccessCheck(moduleName)` middleware.

| Route Prefix | Controller | Module Key |
|-------------|-----------|------------|
| `/sales` | salesController | sales |
| `/collections` | collectionController | collections |
| `/expenses` | expenseController | expenses |
| `/inventory` | inventoryController | inventory |
| `/purchasing` | purchasingController | purchasing |
| `/payroll` | payrollController | payroll |
| `/accounting` | accountingController | accounting |
| `/banking` | bankingController | banking |
| `/people` | peopleController | people |
| `/reports` | erpReportController | reports |
| `/settings` | settingsController | settings |
| `/entities` | entityController | (shared) |
| `/control-center` | controlCenterController | (shared) |
| `/lookup-values` | lookupGenericController | (shared) |
| `/approvals` | approvalController | (shared) |

---

## ERP Control Center (Phase 24)

Single page at `/erp/control-center` for president/admin/finance. Consolidates all configuration, master data, and governance settings into one place organized by the governance hierarchy.

### Architecture
- Container page with left category sidebar + lazy-loaded content panels
- Each existing config page exports a `*Content` named export (no Navbar/Sidebar wrapper) for embedding
- Standalone routes (`/erp/coa`, `/erp/bank-accounts`, etc.) remain fully functional
- URL sync via `?section=xxx` query params for deep-linking

### Category Structure (8 groups)
1. **Foundation Health** — Overview dashboard showing completeness of each governance layer
2. **Entity & Organization** — Entity CRUD (first-ever UI for managing entities)
3. **People & Access** — People Master + Access Templates
4. **Financial Setup** — COA, Cost Centers, Bank Accounts, Credit Cards, Payment Modes
5. **Tax & Compliance** — Government Rates
6. **Operations** — Warehouses, Transfer Prices, Fixed Assets
7. **Governance Controls** — Period Locks, Recurring Journals, Data Archive
8. **System Settings** — ERP Settings (~30 fields) + Lookup Tables (55 categories)

### New Models
- `Lookup` (`backend/erp/models/Lookup.js`) — generic entity-scoped lookup table (category + code + label + sort_order). Replaces hardcoded frontend arrays with database-driven lookups. Unique index: `{ entity_id, category, code }`.

### New Hooks
- `useLookups(category)` (`frontend/src/erp/hooks/useLookups.js`) — fetches + caches lookup values by category with 5-minute TTL. Returns `{ options, loading }`.

### Key Files
```
frontend/src/erp/pages/
├── ControlCenter.jsx       # Container page (lazy-loads sections)
├── FoundationHealth.jsx     # Governance health dashboard
├── EntityManager.jsx        # Entity CRUD UI
├── ErpSettingsPanel.jsx     # Settings form (~30 fields)
├── LookupManager.jsx        # Lookup table manager (55 categories)
└── [14 existing pages]      # Each now exports *Content for embedding

backend/erp/
├── models/Lookup.js                       # Generic lookup model
├── controllers/entityController.js        # Entity CRUD
├── controllers/controlCenterController.js # Health aggregation
├── controllers/lookupGenericController.js # Lookup CRUD + seed
├── routes/entityRoutes.js
├── routes/controlCenterRoutes.js
└── routes/lookupGenericRoutes.js
```

---

## GRN ↔ PO Cross-Reference & Unified Receipt Tracking (Phase 34)

GRN is now the **single source of truth** for goods receipt. The old `receivePO()` endpoint is deprecated.

### Key Changes
- **GrnEntry model** gains `po_id`, `po_number`, `vendor_id` (all optional — standalone GRNs still work)
- **GRN line items** gain `po_line_index` — identifies which PO line each GRN line fulfills
- **`createGrn()`** validates PO status, product match, and qty does not exceed remaining receivable
- **`approveGrn()`** atomically updates `PO.qty_received` and PO status (PARTIALLY_RECEIVED/RECEIVED) inside the same MongoDB session
- **`receivePO()`** is deprecated — returns 400 with redirect hint to GRN workflow
- **`getPOById()`** returns `linked_grns` alongside `linked_invoices`
- **3-way match** auto-discovers PO from GRN when invoice has `grn_id` but no `po_id`
- **GRNI report** auto-fixed — reads same `PO.qty_received` that GRN approval now updates
- **GRN receipt template** shows PO reference and vendor name

### Document Flow
```
PO (APPROVED) → GRN (PENDING → APPROVED) → PO auto-updates qty_received + status
                                           → InventoryLedger created (FEFO)
                                           → SupplierInvoice 3-way match (PO ↔ GRN ↔ Invoice)
```

### Frontend Flow
- PO "Receive" button navigates to `/erp/grn?po_id={id}` (no more inline receive modal)
- GRN page has optional PO selector dropdown; auto-populates lines from PO remaining receivable qty
- GRN list shows PO ref and vendor columns
- PO detail modal shows linked GRNs section

### Key Files
- `backend/erp/models/GrnEntry.js` — po_id, po_number, vendor_id, po_line_index
- `backend/erp/controllers/inventoryController.js` — createGrn validation, approveGrn PO sync, getGrnForPO
- `backend/erp/controllers/purchasingController.js` — receivePO deprecated, getPOById linked_grns
- `backend/erp/services/threeWayMatch.js` — PO auto-discovery from GRN
- `frontend/src/erp/pages/GrnEntry.jsx` — PO selector, auto-populate
- `frontend/src/erp/pages/PurchaseOrders.jsx` — Receive redirects to GRN

---

## Workflow Guide & Dependency Guide Governance

Every user-facing page MUST have a helper banner. Two systems exist — use one per page, never both.

### WorkflowGuide — for standalone pages

Used on transaction, reporting, and management pages (Sales, Collections, GRN, Hospitals, etc.).

- **Config**: `frontend/src/erp/components/WorkflowGuide.jsx` → `WORKFLOW_GUIDES` object
- **Structure**: Each pageKey has `title`, `steps[]` (numbered), `next[]` (links), optional `tip`
- **Usage**: Import and render `<WorkflowGuide pageKey="..." />` at top of page content
- **Dismissal**: Session-based via `sessionStorage` (key: `wfg_dismiss_{pageKey}`)

### DEPENDENCY_GUIDE — for Control Center panels only

Used on embedded panels inside ControlCenter (Entities, COA, Warehouses, Agent Config, etc.).

- **Config**: `frontend/src/erp/pages/ControlCenter.jsx` → `DEPENDENCY_GUIDE` object
- **Structure**: Each section key has `title`, `items[]` (action → deps → optional section link)
- **Rendered by**: `DependencyBanner` component inside ControlCenter

### Rule: Always Update Guides When Modifying Pages

When creating or modifying any ERP page, you MUST also update the corresponding guide:

1. **New standalone page** → add a pageKey entry to `WORKFLOW_GUIDES` + import WorkflowGuide in the page
2. **New Control Center section** → add entry to `DEPENDENCY_GUIDE` in ControlCenter.jsx
3. **Modified page workflow** → update the steps/tips/next-links in the guide to match the new behavior
4. **Removed page** → remove the guide entry to avoid dead references

### Lint Checks

- `node scripts/check-workflow-guides.js` — verifies all pages have WorkflowGuide or DEPENDENCY_GUIDE coverage
- `node scripts/check-system-health.js` — comprehensive code health check:
  - `$lookup` collection names match actual model definitions (catches typos like `erp_product_masters`)
  - WorkflowGuide pageKeys: defined but unused, or used but undefined
  - ControlCenter SECTIONS → file exports exist
  - Agent enum consistency across AgentRun, AgentConfig, scheduler, dashboard, settings

Run both after modifying ERP pages, agents, or models. Exit code 1 = issues found.

---

## PO Enhancements — Warehouse Address, Activity Log & Multi-Channel Sharing (Phase 35)

### Warehouse Address & Delivery Contact
- **Warehouse model** gains `contact_person` and `contact_phone` fields (lookup-driven, admin-managed per warehouse)
- PO detail modal and print template now show full warehouse address (`location.address, city, region`) and delivery contact
- All PO populate calls expanded to include `location contact_person contact_phone`

### PO Activity Log
- **PurchaseOrder model** gains `activity_log` array of sub-documents:
  - `message` (String, required) — status update text
  - `courier_waybill` (String, optional) — courier tracking/waybill number
  - `status_snapshot` (String) — auto-captured PO status at time of entry
  - `created_by` (User ref), `created_at` (Date, immutable)
- **Works at any PO status** — not restricted to DRAFT like updatePO
- Endpoint: `POST /purchasing/orders/:id/activity` (no sub-module gate — any purchasing user)
- Detail modal shows activity timeline (newest first) with add form
- Print template renders activity log as a table

### Multi-Channel PO Sharing
- **Share Link**: `POST /purchasing/orders/:id/share` generates a `share_token` (crypto.randomBytes). Public route `GET /api/erp/po/share/:token` renders the PO HTML without auth — sharable via Messenger, Viber, SMS, any chat app
- **Email PO**: `POST /purchasing/orders/:id/email` sends PO HTML to a recipient via Resend (existing email config). No additional cost.
- **Copy Link**: Frontend button copies the share URL to clipboard
- `share_token` field on PurchaseOrder: `{ type: String, unique: true, sparse: true }`

### Key Files
- `backend/erp/models/Warehouse.js` — contact_person, contact_phone
- `backend/erp/models/PurchaseOrder.js` — poActivitySchema, activity_log, share_token
- `backend/erp/controllers/purchasingController.js` — addPOActivity, generateShareLink, emailPO
- `backend/erp/routes/purchasingRoutes.js` — 3 new POST routes
- `backend/erp/routes/index.js` — public share route before auth middleware
- `backend/erp/controllers/printController.js` — getSharedPOHtml
- `backend/erp/templates/purchaseOrderPrint.js` — address, contact, activity log table
- `frontend/src/erp/hooks/usePurchasing.js` — addPOActivity, generateShareLink, emailPO
- `frontend/src/erp/pages/PurchaseOrders.jsx` — address display, activity log UI, share/email buttons
- `frontend/src/erp/components/WorkflowGuide.jsx` — updated purchase-orders guide

---

## ERP Access Templates — Lookup-Driven (Phase A)

Eliminates hardcoded module lists and sub-permission keys from frontend and backend. Both are now served from the Lookup system (database-driven, admin-manageable).

### What Changed
- **Module list**: Previously hardcoded as `MODULES` arrays in `AccessTemplateManager.jsx` and `ErpAccessManager.jsx`. Now fetched from `GET /erp-access/module-keys` which reads `ERP_MODULE` lookup category.
- **Sub-permission keys**: Previously hardcoded as `SUB_PERMISSION_KEYS` object in `erpAccessController.js`. Now fetched from `ERP_SUB_PERMISSION` lookup category, grouped by `metadata.module`.
- Both auto-seed on first access (consistent with existing lookup pattern).

### New Lookup Categories
| Category | Purpose |
|----------|---------|
| `ERP_MODULE` | 11 ERP modules (sales, inventory, collections, etc.) with `metadata.key` (schema field name) and `metadata.short_label` (compact display) |
| `ERP_SUB_PERMISSION` | Sub-permission keys grouped by `metadata.module` + `metadata.key`. Admin can add/remove sub-permissions per module without code changes |

### New Endpoint
- `GET /erp-access/module-keys` — returns `[{ key, label, short_label }]` from ERP_MODULE lookups

### Key Files
- `backend/erp/controllers/lookupGenericController.js` — ERP_MODULE + ERP_SUB_PERMISSION in SEED_DEFAULTS
- `backend/erp/controllers/erpAccessController.js` — getSubPermissionKeys + getModuleKeys now lookup-driven
- `backend/erp/routes/erpAccessRoutes.js` — new `/module-keys` route
- `frontend/src/erp/hooks/useErpAccess.js` — getModuleKeys method added
- `frontend/src/erp/pages/AccessTemplateManager.jsx` — fetches modules dynamically (no hardcoded MODULES)
- `frontend/src/erp/components/ErpAccessManager.jsx` — fetches modules dynamically (no hardcoded MODULES)
