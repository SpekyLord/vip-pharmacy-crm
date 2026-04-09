# VIP ERP - Project Context

> **Last Updated**: April 2026
> **Version**: 5.7
> **Status**: Phases 0-30 Complete. Role Centralization + PeopleMaster Lookup-Driven (April 9, 2026).

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
| Frontend hardcoded dropdowns | ~30 static arrays (expense categories, collateral types, activity types) serve as fallbacks | Phase 24 added Lookup model + LookupManager UI + useLookups hook. Phase 30 migrated PeopleMaster enums. Migration of remaining pages is follow-up |
| Role-People alignment warnings | No toast/warning when User.role doesn't match PeopleMaster.person_type via ROLE_MAPPING | Phase 30 follow-up: add alignment check toast in PersonDetail |
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
8. **System Settings** — ERP Settings (~30 fields) + Lookup Tables (16 categories)

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
├── LookupManager.jsx        # Lookup table manager (16 categories)
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
