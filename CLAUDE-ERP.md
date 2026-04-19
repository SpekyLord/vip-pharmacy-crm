# VIP ERP - Project Context

> **Last Updated**: April 18, 2026
> **Version**: 6.9
> **Status**: Phases 0-35 + Phase A-F.1 + Gap 9 + G1-G5 + H1-H5 + Phase 34 + Phase 3a + Phase 3c Complete. Phase 3c (Apr 18, 2026): **Comprehensive hardcoded-role migration** — 30 destructive endpoints across ~15 modules now use `erpSubAccessCheck(module, key)` instead of `roleCheck('admin','finance','president')`. Baseline danger set grew 1 → 10 keys; 19 new sub-perms appear in the Access Template editor (period force-unlock, year-end, settings write, transfer pricing, people terminate/login mgmt, master data deactivate/delete, lookup deletes, etc.). Phase 3a (Apr 18, 2026): **Lookup-driven Danger Sub-Permission Gate + President-Reverse rollout**. Hardcoded `roleCheck('president')` on destructive endpoints replaced with `erpSubAccessCheck('accounting','reverse_posted')` so subsidiaries can delegate to CFO/Finance via Access Template editor without a code change. Rollout adds per-module `/president-reverse` routes to Expenses (ORE/ACCESS), PRF/CALF, and Petty Cash — on top of the existing Sales + Collection endpoints. Baseline danger set stays hardcoded (platform safety floor); subscribers extend via ERP_DANGER_SUB_PERMISSIONS lookup (5-min cache, busted on lookup write). Phase G5 (Apr 18, 2026): Fixed privileged-user BDM filter fallback bug in 9 ERP endpoints.

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
| F.1 | Lookup-Driven Module Default Roles — Rule #3 Compliance for Approval Hub | ✅ |
| Gap 9 | Rx Correlation — Visit vs Sales + Rebates + Programs | ✅ |
| G1 | BDM Income Projection + Revolving Fund + CALF Bidirectional + Personal Gas | ✅ |
| G2 | Photo Upload Compression + Approval Hub Populate Fixes | ✅ |
| G3 | Approval Hub Inline Quick-Edit (Typo Fix Before Approve) | ✅ |
| G4 | Subsidiary Product Catalog Access (Lookup-Driven) | ✅ |
| G5 | Privileged User BDM Filter Fix — Cross-BDM Visibility for President/Admin/Finance | ✅ |
| H1 | Low-Priority Hardening (#13-#19) — CALF, COA, Expense, Batch Upload | ✅ |
| H2 | OCR Hardening — Lookup-Driven Classification, Entity Scoping, Bugs | ✅ |
| H3 (OCR) | OCR Subscription-Ready — Per-Entity Settings + Usage Logging + Quotas | ✅ |
| H4 | OCR High-Confidence — Image Preprocessing + Claude Field Completion | ✅ |
| H5 | OCR Vendor Auto-Learn from Claude Wins — Self-Improving Classifier | ✅ |
| 34* | Approval Hub Enhancement: Sub-Permissions + Attachments + Line-Item Edit | ✅ |

---

## JE Numbering Format — Human-Readable, Entity-Scoped (Apr 2026)

### Problem
`JournalEntry.je_number` was a raw `Number` assigned via `DocSequence.getNext('JE-{entityId}-{year}')`. UI rendered `JE #47` — no date, no entity hint, no clue which subsidiary. Inconsistent with every other doc number (CALF/PRF/PO use `CALF-ILO040326-001` via `services/docNumbering.js`).

### Solution
JE numbers now follow the project's standard format:

```
JE-{ENTITY_CODE}{MMDDYY}-{NNN}
```

Examples: `JE-VIP041826-001`, `JE-MGC041826-003` (where `VIP` / `MGC` come from `Entity.short_name`).

### Implementation

- **`services/docNumbering.js`** — new `generateJeNumber({ entityId, date })`. Resolves entity code via `Entity.short_name` (admin-editable), sanitizes to ASCII-uppercase alphanumerics clamped to 8 chars, falls back to last 3 chars of entity `_id` if blank. In-memory cache (`_entityCodeCache`) avoids repeated Entity lookups on hot paths like bulk posting. Exports `getEntityCode` and `invalidateEntityCodeCache` for reuse.
- **`models/JournalEntry.js`** — `je_number` field type changed from `Number` to `String`. Legacy numeric values coerced to string on read; no data migration required. Unique index `{entity_id, je_number}` retained.
- **`services/journalEngine.js`** — `createJournal` + `createAndPostJournal` swapped from inline `DocSequence.getNext` to `generateJeNumber()`. Direct `DocSequence` import removed.
- **Sort order** — `getJournalsByPeriod` and `getGeneralLedger` use `je_date + created_at` (chronological) instead of lexical `je_number` sort. MMDDYY doesn't sort across years.
- **Cache invalidation** — `entityController.update` calls `invalidateEntityCodeCache(entity._id)` when `short_name` changes so renamed subsidiaries get the new code on the next JE.

### Authority flow (unchanged)

JE numbering is independent of the approval layer:
- **DRAFT create** — number assigned immediately, no approval needed.
- **POST (DRAFT → POSTED)** — `gateApproval({ module: 'JOURNAL' })` fires (Phase G4 default-roles + Phase 29 authority matrix). Number stays stable across the Approval Hub lifecycle.
- **Reverse POSTED** — `erpSubAccessCheck('accounting', 'reverse_posted')` (Phase 3a danger gate). Reversal JE gets a fresh `generateJeNumber()`; `corrects_je_id` links it to the original.
- **Auto-journals** from source docs (CSI/CR/Expense/PettyCash/ICT/GRN/Depreciation/Interest) bypass `gateApproval` — the source doc's own approval already gated the action.

### Display

Six call sites dropped the `JE #` prefix (the string is self-descriptive):
- `services/documentReversalService.js` (reversal console list)
- `services/journalEngine.js` (reversal description + duplicate-reversal error)
- `pages/CreditCardLedger.jsx` (payment toast)
- `pages/JournalEntries.jsx` (detail header + batch-post error list)
- `pages/RecurringJournals.jsx` (run-now success toast)

Legacy numeric JEs render as bare digits; new JEs render as `JE-VIP041826-001`. No migration pressure.

### Subscription-safe

- Entity code comes from `Entity.short_name` (admin UI field, not hardcoded). New subsidiaries pick a `short_name` on creation and get their own JE prefix immediately. No lookup table needed — Entity master is the canonical source.
- Cache is per-process + per-entity, busted on admin rename. No cross-tenant leakage.

### WorkflowGuide banner

`journal-entries` entry in `WorkflowGuide.jsx` updated with new number format, approval-gate interaction, legacy vs new distinction, and chronological-sort note.

### Extended to Inter-Company Transfers (Apr 2026)

The same entity-code path now powers `InterCompanyTransfer.transfer_ref`:

- **`services/docNumbering.js#generateDocNumber`** accepts an `entityId` option alongside the existing `bdmId` / `territoryCode` inputs. Resolution priority is `territoryCode` → `bdmId` (Territory lookup) → `entityId` (`getEntityCode`) → `fallbackCode`. Territory-scoped callers (CALF/PRF/PO/CN/SVC/PCF/REM/DS) are unchanged.
- **`models/InterCompanyTransfer.js`** pre-save now calls `generateDocNumber({ prefix: 'ICT', entityId: source_entity_id })`. Format: `ICT-VIP041826-001`, `ICT-MGCO041826-001`. Replaces the old `Math.random()` + `YYYYMMDD` scheme that could collide under the `transfer_ref` unique index. Pre-save is now `async` with try/next error handling.
- **Legacy refs** (`ICT-20260418-042`) render untouched — no migration pressure. Downstream display (`TransferOrders.jsx`, `IcArDashboard.jsx`, `IcSettlement.settled_transfers[].transfer_ref`, reversal console) is format-agnostic — plain string equality only.
- **`WorkflowGuide.jsx#transfers`** banner updated with the new format and subsidiary-prefix note.
- **Subscription-ready**: same guarantees as JE — `Entity.short_name` is admin-editable, cache invalidated by `entityController.update` via the shared `invalidateEntityCodeCache`, atomic sequencing via `DocSequence.getNext`.

---

## Phase 3a — Lookup-Driven Danger Sub-Permission Gate + President-Reverse Rollout (Apr 2026)

### Problem
Destructive endpoints (delete petty cash fund, reverse POSTED document) were hardcoded with `roleCheck('president')`. That works for the parent entity, but:

1. **Breaks Access Template abstraction**: Access Template Manager is the canonical place to grant/revoke per-module capabilities. A hardcoded role check is invisible to the template editor — subscribers cannot see, let alone toggle, the capability.
2. **Forecloses subsidiary delegation**: In MG AND CO. (and every future subsidiary), the CFO or Finance Head may legitimately hold reversal authority. Hardcoded President-only means the only path is a code change per tenant — the opposite of a subscription model.
3. **Safety floor vs. flexibility tradeoff**: Purely removing the gate and replacing with a configurable lookup would let a subscriber accidentally grant a junior user ledger-destroying power. We need both: a platform-baseline safety floor AND per-tenant extensibility.

### Solution — Two-layer Danger Gate

**Layer 1 — Baseline Safety Floor (code-enforced, can never be removed)**
- `backend/erp/services/dangerSubPermissions.js` exports `BASELINE_DANGER_SUB_PERMS`: a hardcoded `Set` of sub-permission keys that are treated as "danger" on every entity, regardless of lookup state.
- Currently: `{ 'accounting.reverse_posted' }`. Adding a baseline entry is a platform release — subscribers cannot opt out.

**Layer 2 — Per-Tenant Extension (lookup-driven)**
- `ERP_DANGER_SUB_PERMISSIONS` Lookup category (entity-scoped). Each row's `metadata.{module, key}` tuple (e.g. `{ module: 'vendor_master', key: 'delete' }`) is treated as danger for that entity only.
- Subscribers extend via Control Center → Lookup Tables. Cache TTL 5 min with immediate invalidation on write (`invalidateDangerCache` wired into `lookupGenericController.create/update/remove/seedCategory`).
- Fail-closed: lookup read errors return 503 "Permission system temporarily unavailable" — better than silently granting.

### How it plugs into the existing middleware

`erpSubAccessCheck(module, subKey)` and `erpAnySubAccessCheck(...pairs)` in `backend/erp/middleware/erpAccessCheck.js` gained a `denyIfDangerFallback(module, subKey, entityId)` helper. The helper only runs on the FULL-fallback path (where module = FULL with no explicit `sub_permissions` entry and the middleware was about to grant implicit access). Explicit grants in `user.erp_access.sub_permissions[module][subKey]` bypass the danger gate — the admin who ticked that box took the decision.

**Effect**: A subscriber admin with `erp_access.modules.accounting = 'FULL'` and no sub_permissions entries gets implicit access to every accounting sub-key **except** danger ones. To grant reversal, they must explicitly tick `accounting.reverse_posted` in the Access Template editor. President always bypasses.

### Frontend mirror (`useErpSubAccess`)

`frontend/src/erp/hooks/useErpSubAccess.js` duplicates `BASELINE_DANGER_SUB_PERMS` so the UI can hide buttons the user cannot actually use. Subscriber-added extras are NOT mirrored (the set changes rarely and the backend still rejects anything the UI slips through). Keep these two sets in sync when adding baseline keys.

### Rollout — `/president-reverse` per-module routes

Before Phase 3a only Sales + Collections had per-module president-reverse endpoints. Phase 3a adds three more via a shared factory (`buildPresidentReverseHandler(doc_type)` in `documentReversalService.js`), so the same auth gate + UX pattern (reason + `confirm: 'DELETE'`) applies everywhere:

| Module | Route | Doc_type handler | Side effects reversed |
|---|---|---|---|
| Sales | `POST /api/erp/sales/:id/president-reverse` | SALES_LINE | Inventory, consignment conversions, petty-cash deposit, linked JEs |
| Collection | `POST /api/erp/collections/:id/president-reverse` | COLLECTION | CSI release, petty-cash deposit, VAT/CWT ledger, linked JEs |
| **Expense** | `POST /api/erp/expenses/ore-access/:id/president-reverse` | EXPENSE | Linked JEs, deletion event |
| **PRF/CALF** | `POST /api/erp/expenses/prf-calf/:id/president-reverse` | CALF or PRF (auto-dispatched by `doc_type`) | CALF: clears `calf_id` on non-POSTED expenses; PRF: clears `rebate_prf_id` on Collection; linked JEs |
| **Petty Cash** | `POST /api/erp/petty-cash/transactions/:id/president-reverse` | PETTY_CASH_TXN | Txn VOIDed, fund balance flipped, linked JEs |
| **Sales Goal Plan** (Phase SG-3R) | `POST /api/erp/sales-goals/plans/:id/president-reverse` | SALES_GOAL_PLAN | DRAFT: hard-delete plan + DRAFT targets. Posted: reverse every IncentivePayout accrual + settlement JE (idempotent), flip payouts to REVERSED, delete snapshots, close targets, stamp plan REVERSED + deletion_event_id |
| Central Console | `POST /api/erp/president/reversals/reverse` (body: `{ doc_type, doc_id, reason, confirm }`) | any | Cross-module history, preview dependents |

Plus: `DELETE /api/erp/petty-cash/funds/:id` — hardcoded `roleCheck('president')` swapped for `erpSubAccessCheck('accounting', 'reverse_posted')`. Subsidiaries can now delegate fund-delete to a CFO by ticking one Access Template box.

### Dependent-Doc Blocker

`backend/erp/services/dependentDocChecker.js` runs before every reversal. Returns `{ has_deps, dependents: [{ type, ref, doc_id, message, severity }] }`. Hard blockers abort with HTTP 409 and surface the list so the user knows what to reverse first. Registry covers: GRN, IC Transfer, Consignment, CALF, PRF, Income, Payroll, SalesLine, Collection, Expense, PO. `checkHardBlockers()` filters out `WARN`-severity entries for reversal sites that should proceed despite informational warnings.

### Audit & Period-Lock

Every president-reversal:
1. Writes an `ErpAuditLog` row with `log_type: 'PRESIDENT_REVERSAL'` and full side-effect payload (doc_ref, mode, reversal_event_id, side_effects list).
2. Refuses if the **current** period (where reversal entries will land) is locked for the relevant module — original period is never touched, so only the landing-month lock matters.

### Frontend wiring

- `useCollections.js`, `useSales.js` — already had `presidentReverseX()`.
- `useExpenses.js` — gained `presidentReverseExpense(id, {reason, confirm})` and `presidentReversePrfCalf(id, {reason, confirm})`.
- `usePettyCash.js` — gained `presidentReverseTxn(id, {reason, confirm})`.
- Gate buttons with `useErpSubAccess().hasSubPermission('accounting', 'reverse_posted')`.

### WorkflowGuide banners

Updated `expenses`, `prf-calf`, and `petty-cash` entries in `frontend/src/erp/components/WorkflowGuide.jsx` to document President-Delete semantics, dependent-doc blockers, and the lookup-driven delegation path.

### Files touched (Phase 3a)

Backend:
- `services/dangerSubPermissions.js` (new) — baseline set + lookup reader + cache
- `services/dependentDocChecker.js` (new) — 11 doc-type checkers
- `services/documentReversalService.js` — 12 handlers + `buildPresidentReverseHandler` factory
- `middleware/erpAccessCheck.js` — `denyIfDangerFallback` wired into both `erpSubAccessCheck` and `erpAnySubAccessCheck`
- `controllers/expenseController.js` — `presidentReverseExpense/Calf/Prf/PrfCalf` (doc_type auto-dispatch)
- `controllers/pettyCashController.js` — `presidentReversePettyCashTxn`
- `controllers/collectionController.js` — `presidentReverseCollection` (Phase 3a baseline)
- `controllers/salesController.js` — `presidentReverseSale` (Phase 3a baseline)
- `controllers/lookupGenericController.js` — `invalidateDangerCache` on lookup writes + `ERP_DANGER_SUB_PERMISSIONS` seed
- `routes/{collection,sales,expense,pettyCash,presidentReversal}Routes.js` — gated endpoints

Frontend:
- `hooks/useErpSubAccess.js` — baseline danger set mirror
- `hooks/useCollections.js`, `hooks/useSales.js`, `hooks/useExpenses.js`, `hooks/usePettyCash.js` — `presidentReverse*` methods
- `pages/Collections.jsx` — reverse modal + wiring
- `components/WorkflowGuide.jsx` — banners for collections, expenses, prf-calf, petty-cash

### Future extension (subscription-ready)

To delegate reversal in a subsidiary:
1. Admin ticks `accounting.reverse_posted` in that user's Access Template (Control Center → Access Templates).
2. No deploy needed — backend reads `erp_access.sub_permissions.accounting.reverse_posted === true` on the next request.

To mark a new key as danger (subscriber-specific, no code change):
1. Admin adds a row to `ERP_DANGER_SUB_PERMISSIONS` lookup with `metadata: { module: 'vendor_master', key: 'delete' }`.
2. Cache busts immediately. Users with `vendor_master = FULL` but no explicit `vendor_master.delete` grant get rejected.

---

## Phase 3c — Comprehensive Hardcoded-Role Migration (Apr 2026)

### Problem
After Phase 3a, only `accounting.reverse_posted` was lookup-driven. Most other destructive operations still used hardcoded `roleCheck('admin', 'finance', 'president')` gates spanning 30 endpoints across ~15 modules. These hardcoded unions:
- **Broke the Access Template abstraction** — capabilities invisible to subscribers configuring users
- **Blocked legitimate org structures** — subsidiary CFO / HR Head / Inventory Manager couldn't be granted specific destructive authority without becoming "admin"
- **Created UI/backend drift risk** — every hardcoded role list was another place UI + backend could disagree

### Solution
Same pattern as Phase 3a, expanded:
- `BASELINE_DANGER_SUB_PERMS` grew from 1 → 10 keys (platform safety floor)
- `ERP_DANGER_SUB_PERMISSIONS` lookup seeded with 19 new keys (10 baseline + 9 Tier 2 lookup-only)
- `ERP_SUB_PERMISSION` seed extended in parallel so the keys appear in the Access Template editor
- `ERP_MODULE` gained two new modules — `MASTER` (master data governance) and `ERP_ACCESS` (template management) — to host their respective sub-perms in the editor UI
- 30 routes swapped from `roleCheck(...)` to `erpSubAccessCheck(module, key)`
- 15 frontend pages gated their destructive buttons via `useErpSubAccess().hasSubPermission(module, key)`
- `seedAll` now also calls `invalidateDangerCache(req.entityId)` so a fresh entity gets the editor working immediately after seeding

### Rollout table (route → key)

**Tier 1 — baseline (platform safety floor; subscribers cannot remove via lookup)**

| Route | Key |
|---|---|
| `periodLockRoutes.js` POST `/toggle` | `accounting.period_force_unlock` |
| `incomeRoutes.js` POST `/archive/close-period` | `accounting.period_force_unlock` |
| `incomeRoutes.js` POST `/archive/reopen-period` | `accounting.period_force_unlock` |
| `incomeRoutes.js` POST `/archive/year-end/close` | `accounting.year_end_close` |
| `peopleRoutes.js` POST `/:id/separate` | `people.terminate` |
| `peopleRoutes.js` DELETE `/:id` | `people.terminate` |
| `peopleRoutes.js` POST `/:id/disable-login` | `people.manage_login` |
| `peopleRoutes.js` POST `/:id/unlink-login` | `people.manage_login` |
| `peopleRoutes.js` POST `/:id/change-role` | `people.manage_login` |
| `peopleRoutes.js` POST `/bulk-change-role` | `people.manage_login` |
| `erpAccessRoutes.js` DELETE `/templates/:id` | `erp_access.template_delete` |
| `governmentRatesRoutes.js` DELETE `/:id` | `payroll.gov_rate_delete` |
| `interCompanyRoutes.js` PUT `/prices` | `inventory.transfer_price_set` |
| `interCompanyRoutes.js` PUT `/prices/bulk` | `inventory.transfer_price_set` |
| `settingsRoutes.js` PUT `/` | `accounting.settings_write` |
| `productMasterRoutes.js` DELETE `/:id` | `master.product_delete` |

**Tier 2 — lookup-only (subscriber-extensible; admins can deactivate the lookup row to drop the key from the danger gate)**

| Route | Key |
|---|---|
| `insuranceRoutes.js` DELETE `/:id` | `payroll.insurance_delete` (closes Phase 3a residual) |
| `creditCardRoutes.js` DELETE `/:id` | `accounting.card_delete` |
| `customerRoutes.js` PATCH `/:id/deactivate` | `master.customer_deactivate` |
| `hospitalRoutes.js` PATCH `/:id/deactivate` | `master.hospital_deactivate` |
| `hospitalRoutes.js` DELETE `/:id/alias` | `master.hospital_alias_delete` |
| `productMasterRoutes.js` PATCH `/:id/deactivate` | `master.product_deactivate` |
| `territoryRoutes.js` DELETE `/:id` | `master.territory_delete` |
| `collectionRoutes.js` POST `/:id/approve-deletion` | `accounting.approve_deletion` (legacy; President Reverse preferred) |
| `salesRoutes.js` POST `/:id/approve-deletion` | `accounting.approve_deletion` |
| `lookupRoutes.js` DELETE `/bank-accounts/:id` | `accounting.lookup_delete` |
| `lookupRoutes.js` DELETE `/payment-modes/:id` | `accounting.lookup_delete` |
| `lookupRoutes.js` DELETE `/expense-components/:id` | `accounting.lookup_delete` |
| `lookupGenericRoutes.js` DELETE `/:category/:id` | `accounting.lookup_delete` |
| `warehouseRoutes.js` POST `/` | `inventory.warehouse_manage` |
| `warehouseRoutes.js` PUT `/:id` | `inventory.warehouse_manage` |

### Out of scope (intentionally NOT migrated)
- `entityRoutes.js POST /` — platform-scope subsidiary creation; stays `roleCheck('president')`
- `erpAccessRoutes.js` user GET/SET/apply-template — delegating "the power to delegate" is a separate decision
- `coaRoutes.js`, `approvalRoutes.js`, `monthEndCloseRoutes.js`, `pettyCashRoutes.js` fund-delete — already sub-perm-gated
- All `/president-reverse` routes (Phase 3a) — already gated
- Income/payroll/PnL/GRN workflow steps (generate/compute/review/approve/post) — governed by `gateApproval()` + Authority Matrix
- Status-gated DRAFT deletes (Sales/Collection/Expense/PRF-CALF) — controller-side check, not destructive to ledger
- `inventoryRoutes /seed-stock-on-hand` — one-time migration tool

### Files touched (Phase 3c)

Backend:
- `services/dangerSubPermissions.js` — `BASELINE_DANGER_SUB_PERMS` 1 → 10 keys
- `controllers/lookupGenericController.js` — `ERP_MODULE` (+ MASTER, ERP_ACCESS), `ERP_SUB_PERMISSION` (+19 keys), `ERP_DANGER_SUB_PERMISSIONS` (+19 entries), `seedAll` busts danger cache
- 14 route files — `roleCheck(...)` → `erpSubAccessCheck(module, key)` swaps:
  `periodLockRoutes`, `incomeRoutes`, `settingsRoutes`, `interCompanyRoutes`, `peopleRoutes`, `erpAccessRoutes`, `governmentRatesRoutes`, `productMasterRoutes`, `insuranceRoutes`, `creditCardRoutes`, `customerRoutes`, `hospitalRoutes`, `territoryRoutes`, `warehouseRoutes`, `lookupRoutes`, `lookupGenericRoutes`, `collectionRoutes`, `salesRoutes`

Frontend:
- `hooks/useErpSubAccess.js` — baseline mirror 1 → 10 keys
- 15 pages — destructive-button gates swapped from `isAdmin`/`ROLE_SETS.MANAGEMENT` to `hasSubPermission(module, key)`:
  `PeriodLocks`, `MonthlyArchive`, `ProfitSharing` (year-end close), `PersonDetail`, `PeopleList`, `AccessTemplateManager`, `GovernmentRates`, `TransferPriceManager`, `ErpSettingsPanel`, `ProductMaster`, `CustomerList`, `TerritoryManager`, `SalesList`, `LookupManager`, `WarehouseManager`

### Migration note for existing entities
Two new modules (`master`, `erp_access`) appear in the Access Template editor after `seedAll`. Existing user templates default to `NONE` for these — admins must grant at least `VIEW` on the parent module before the per-key sub-permission has any effect. President bypass and the legacy `admin without erp_access enabled` backward-compat path both remain — only erp_access-enabled non-president users feel the change. Run `Control Center → Lookup Tables → Seed Defaults → ERP_MODULE / ERP_SUB_PERMISSION / ERP_DANGER_SUB_PERMISSIONS` (or `seedAll`) after deploy.

### Future extension (subscription-ready)
- Subsidiary admins delegate any of the 19 new keys via Access Template ticks, no deploy.
- New danger keys can be added Tier 2 via `ERP_DANGER_SUB_PERMISSIONS` lookup row (5-min cache, busted on write).
- New baseline danger keys still require a code release (intentional safety floor); add to both `services/dangerSubPermissions.js` `BASELINE_DANGER_SUB_PERMS` and `frontend/src/erp/hooks/useErpSubAccess.js` mirror.

---

## Phase G5 — Privileged User BDM Filter Fix (AR Aging, Open CSIs, Inventory, Streak, SOA)

### Problem
President/admin/finance users opening AR Aging, Collection Session (Open CSIs dropdown), inventory FIFO/ledger/variance, SOA export, product streak detail, or income projection saw only records whose `bdm_id` equaled their own user `_id` — silently filtering out every other BDM's data. Symptom: AR Aging and Collection Session showed "No open CSIs" for hospitals where CSIs clearly existed under other BDMs.

### Root Cause
`tenantFilter` middleware sets `req.bdmId = req.user._id` for **every** authenticated user (including president — who is not a BDM on any record). Nine endpoints used this ternary:
```js
const bdmId = (privileged && req.query.bdm_id) ? req.query.bdm_id : req.bdmId;
```
Privileged user with no `?bdm_id=` in the URL falls through to `req.bdmId` (their own _id). The query filter `bdm_id = <president>` then matches nothing.

### Fix
Replaced the ternary in all nine endpoints:
```js
const bdmId = privileged ? (req.query.bdm_id || null) : req.bdmId;
```
- Privileged + no query → `bdmId = null` → no BDM filter → sees all BDMs in the working entity
- Privileged + query → scoped to that BDM
- Non-privileged (contractor) → still locked to their own `_id` (unchanged)

### Safeguard
`getProductStreakDetail` passes `bdmId` directly into `new mongoose.Types.ObjectId(bdmId)` — `ObjectId(null)` silently generates a random ID. Added an explicit `if (!bdmId) return 400 'bdm_id is required'` guard (mirroring `getIncomeProjection`).

### Services Verified for Null-Safe bdmId
| Service Function | File | Null Handling |
|---|---|---|
| `getOpenCsis` | arEngine.js | `if (bdmId) match.bdm_id = ...` — skips filter |
| `getArAging` | arEngine.js | Delegates to `getOpenCsis` |
| `getCollectionRate` | arEngine.js | `if (bdmId) match.bdm_id = ...` |
| `generateSoaWorkbook` | soaGenerator.js | `if (bdmId) match.bdm_id = ...` |
| `getAvailableBatches` | fifoEngine.js | `buildStockMatch()` skips bdm_id on null |
| `InventoryLedger` (getLedger/getVariance) | inventoryController inline | `else if (bdmId)` guard |
| `getProductStreakDetail` | profitShareEngine.js | **Not null-safe** — controller returns 400 |
| `projectIncome` | incomeCalc.js | Controller already 400s on null |

### Entity Scoping — Deliberately Different
The same endpoints have an `entity_id` ternary:
```js
const entityId = (privileged && req.query.entity_id) ? req.query.entity_id : req.entityId;
```
This is **left as-is and is correct**: entity isolation is stricter than BDM isolation. For a president, `req.entityId` is the working entity (X-Entity-Id header or primary) — a valid scope. Cross-entity visibility must be an explicit opt-in via `?entity_id=`, never a silent null.

### Banner Updates (Rule #1)
- `ar-aging` — added role visibility clarification to the tip: "President/admin/finance see all BDMs' CSIs across the working entity by default (use the BDM filter to scope); BDMs see only their own."
- `collection-session` — same clarification added.

### Key Files
```
backend/erp/controllers/collectionController.js      # 4 fixed: getOpenCsis, getArAging, getCollectionRate, generateSoa
backend/erp/controllers/inventoryController.js       # 3 fixed: getBatches, getLedger, getVariance
backend/erp/controllers/erpReportController.js       # getProductStreakDetail fixed + null guard
backend/erp/controllers/incomeController.js          # getIncomeProjection fixed
frontend/src/erp/components/WorkflowGuide.jsx        # ar-aging + collection-session role visibility
```

### Follow-up (Optional, Not Blocking)
The pattern `req.isPresident || req.isAdmin || req.isFinance` is repeated in 21+ controllers — candidate for centralization via a `canViewOtherBdms(req)` helper, or (fully Rule #3 compliant) a Lookup-driven `CROSS_BDM_VIEW_ROLES` category that subscribers can configure without code changes. Not required for correctness — the fix is complete as-is.

See global CLAUDE.md Rule 21 for the anti-pattern documented for future projects.

---

## Phase 34* — Approval Hub Enhancement (Sub-Permissions + Attachments + Line-Item Edit)

Divides approval workload per module via sub-permissions, adds attachment/photo viewing, extends quick-edit to line items, removes unnecessary PO approval gates.

### Per-Module Sub-Permissions
- **14 new sub-permissions** under `approvals` module: `approve_sales`, `approve_collections`, `approve_inventory`, `approve_expenses`, `approve_purchasing`, `approve_payroll`, `approve_journal`, `approve_banking`, `approve_petty_cash`, `approve_ic_transfer`, `approve_income`, `approve_deductions`, `approve_kpi`, `approve_perdiem`
- **`MODULE_TO_SUB_KEY` mapping** in `universalApprovalService.js` — maps module keys to sub-permission keys
- **`hasApprovalSub(user, subKey)`** helper — follows `erpSubAccessCheck` convention (FULL with no subs = all granted; president always passes)
- **Layered on top** of existing ApprovalRule + MODULE_DEFAULT_ROLES — sub-permissions are additional filter, not replacement
- **Typical assignment**: admin gets `approve_sales` + `approve_collections` + `approve_inventory`; finance gets `approve_expenses` + `approve_payroll` + `approve_journal` + etc.
- **Contractor support**: contractors with `erp_access.modules.approvals + sub-permissions` can approve their assigned modules

### Attachment/Photo Viewing
Approvers can now see supporting documents directly in the Approval Hub without leaving the page:
- **Sales/CSI**: OCR-scanned or uploaded CSI document photo (`csi_photo_url` on SalesLine model)
- **GRN**: waybill photo, undertaking photo
- **Collection**: deposit slip, CR photo, CWT certificate, CSI photos
- **Car Logbook**: fuel receipt photos per day
- **Expenses**: OR receipt photo per line item (thumbnail in table)
- **PRF/CALF**: supporting document photos
- **Image preview modal**: click thumbnail → full-screen overlay → click to close

### Line-Item Inline Editing
- **New lookup category**: `APPROVAL_EDITABLE_LINE_FIELDS` — lookup-driven per module
- **Supported**: Sales (qty, unit_price), GRN (qty, batch_lot_no, expiry_date), Expenses (amount, expense_category)
- **Auto-recalculation**: line_total and document totals recalculated after line-item changes
- **Audit trail**: all line-item changes logged in `edit_history`

### PO Approval Gate Cleanup
- **Removed** `checkApprovalRequired` from `approvePO` — POs don't move money; `po_approve` sub-permission is sufficient
- **Removed** `gateApproval` from `updatePO` (non-draft minor edits)
- **Kept** `gateApproval` in `postInvoice` (supplier invoice) — records financial liability

### New Lookup Categories
| Category | Purpose |
|---|---|
| `SUB_PERMISSIONS` (additions) | 14 approval sub-permissions under `approvals` module |
| `APPROVAL_EDITABLE_LINE_FIELDS` | Whitelisted line-item fields editable per module in Approval Hub |

### Key Files
```
backend/erp/controllers/lookupGenericController.js   # Sub-permission seeds + APPROVAL_EDITABLE_LINE_FIELDS
backend/erp/services/universalApprovalService.js      # MODULE_TO_SUB_KEY, hasApprovalSub, sub_key mapping, attachment URLs
backend/erp/controllers/universalApprovalController.js # TYPE_TO_MODULE, sub-perm checks in approve/edit, line-item edit support
backend/erp/controllers/purchasingController.js       # PO approval gate removal
frontend/src/erp/pages/ApprovalManager.jsx            # Attachment rendering, image preview modal, line-item edit UI
```

---

## Phase G4 — Subsidiary Product Catalog Access

### Problem
Subsidiary entities (e.g., eBDM Iloilo1, Shared Services) were given access to the Purchasing module but could not add products when creating Purchase Orders. The `ProductMaster.getAll()` query filtered strictly by `entity_id`, so subsidiaries with no products of their own saw an empty catalog.

### Solution
Lookup-driven parent product inheritance. When a subsidiary user accesses products (PO creation, GRN, Product Master), the system checks `PRODUCT_CATALOG_ACCESS` in the Lookup table. If the `INHERIT_PARENT` entry is active, the query includes both the subsidiary's own products AND the parent entity's products.

### Architecture
- **Lookup-driven**: `PRODUCT_CATALOG_ACCESS` category in Lookup table. Per-entity control — admin can enable/disable per subsidiary in Control Center → Lookup Tables.
- **Auto-seed**: On first access by a subsidiary, the lookup entry is auto-created with `is_active: true` (inherit by default). Admin can deactivate to revoke. Uses atomic `updateOne/upsert` with `$setOnInsert` (no race condition).
- **Entity resolution**: `resolveProductEntityIds()` helper in `productMasterController.js` checks Entity model for `entity_type: 'SUBSIDIARY'` + `parent_entity_id`, then queries Lookup for access.
- **Catalog mode**: All product-browsing pages pass `catalog=true` (PO, GRN, Transfer Orders, Product Master). Stock/inventory views remain entity-scoped.
- **Product Master UI**: Inherited parent products show a "Parent" badge and "Managed by parent" in the actions column (read-only). Subsidiary can still add their own products with "+ New Product".
- **Sub-permission access**: Product CRUD gated by `erpSubAccessCheck('purchasing', 'product_manage')` — replaces hardcoded `roleCheck`. Add/edit for purchasing users; deactivate/delete stays admin/finance/president only. Frontend mirrors this: `hasProductManage()` checks `erp_access.sub_permissions.purchasing.product_manage` and gates Add/Edit/Import/Export/Refresh buttons accordingly (VIEW-only users see product list but no write controls).
- **Field whitelisting**: Controller `create`/`update` use `pickFields(req.body, EDITABLE_FIELDS)` — prevents injection of `entity_id`, `is_active`, `added_by`, or other protected fields via raw request body.
- **Schema validation**: `dosage_strength` is `required: true` — all products must have brand_name + dosage_strength. `item_key` is auto-generated as `"BrandName|DosageStrength"` (unique per entity). Pre-save AND pre-findOneAndUpdate hooks keep `item_key`, `brand_name_clean`, and `unit_code` in sync on both creates and edits.
- **Cross-module routes**: Batch Trace and GRN routes accept `requiredErpModule: ["inventory", "purchasing"]` — purchasing users can access without needing inventory module. `ProtectedRoute` now supports array of modules (OR logic).
- **Subscription-ready**: Future subscribers configure per-entity product visibility and sub-permissions without code changes.

### New Lookup Category
| Category | Purpose |
|----------|---------|
| `PRODUCT_CATALOG_ACCESS` | Per-subsidiary product catalog inheritance. `code: INHERIT_PARENT`, `metadata.access_mode: ACTIVE_ONLY`. Auto-seeded, admin-configurable. |

### New Sub-Permission
| Code | Label | Module | Key |
|------|-------|--------|-----|
| `PURCHASING__PRODUCT_MANAGE` | Add/Edit Products | purchasing | product_manage |

### Purchasing Sidebar (for users with `purchasing` module)
| Path | Label | Notes |
|------|-------|-------|
| `/erp/accounts-payable` | Accounts Payable | |
| `/erp/batch-trace` | Batch Trace | Also accessible via inventory module |
| `/erp/grn` | GRN Entry | Also accessible via inventory module |
| `/erp/products` | Product Master | Add/edit via `product_manage`; deactivate/delete admin only |
| `/erp/purchase-orders` | Purchase Orders | |
| `/erp/supplier-invoices` | Supplier Invoices | |
| `/erp/vendors` | Vendors | |

### Affected Pages (5 consumers of `useProducts(catalog=true)`)
| Page | Effect |
|------|--------|
| PurchaseOrders | Product dropdown shows parent products |
| GrnEntry | Product dropdown shows parent products |
| TransferOrders | Product dropdown shows parent products |
| ProductMaster | Shows parent products with "Parent" badge (read-only); own products fully editable |
| OcrTest | OCR product matching includes parent products |

### Key Files
```
backend/erp/controllers/productMasterController.js   # resolveProductEntityIds() + updated getAll()
backend/erp/controllers/lookupGenericController.js    # PRODUCT_CATALOG_ACCESS + PURCHASING__PRODUCT_MANAGE in SEED_DEFAULTS
backend/erp/routes/productMasterRoutes.js             # erpSubAccessCheck for add/edit; roleCheck for deactivate/delete
backend/erp/models/Entity.js                          # entity_type + parent_entity_id (existing)
frontend/src/erp/pages/ProductMaster.jsx              # catalog=true + "Parent" badge + role-based action visibility
frontend/src/components/auth/ProtectedRoute.jsx       # requiredErpModule now supports array (OR logic)
frontend/src/components/common/Sidebar.jsx            # Product Master + Batch Trace + GRN in Purchasing section
frontend/src/App.jsx                                  # GRN + batch-trace routes accept ["inventory", "purchasing"]
frontend/src/erp/components/WorkflowGuide.jsx         # Updated banners: PO, GRN, transfers, product-master
```

### Flow
```
Subsidiary BDM opens PO / GRN / Product Master → useProducts(catalog=true)
  → GET /erp/products?limit=0&catalog=true
    → productMasterController.getAll()
      → resolveProductEntityIds(entityId)
        → Entity.findById() → entity_type === 'SUBSIDIARY'?
          → Lookup.updateOne(upsert) → auto-seed INHERIT_PARENT if missing
            → Lookup.findOne(PRODUCT_CATALOG_ACCESS, INHERIT_PARENT, is_active: true)
              → YES: filter.entity_id = { $in: [subsidiaryId, parentId] }
              → NO (admin disabled): filter.entity_id = subsidiaryId only
```

---

## Phase G3 — Approval Hub Inline Quick-Edit

### Problem
When an approver spots a typo (wrong description, misspelled name, wrong check number) in a pending document, they had to reject → wait for submitter to fix → re-approve. For minor corrections, this round-trip is needlessly slow.

### Solution
Approvers can now click "Edit" on any item in the Approval Hub to fix whitelisted text/number fields directly, then approve immediately. Editable fields are **lookup-driven** via `APPROVAL_EDITABLE_FIELDS` — subscribers can add/remove fields without code changes.

### Architecture
- **Lookup-driven**: `APPROVAL_EDITABLE_FIELDS` category in Lookup table. Each entry's `code` = module type key (e.g., `DEDUCTION_SCHEDULE`), `metadata.fields` = array of editable field names.
- **Backend whitelist**: `PATCH /universal-edit` accepts `{ type, id, updates }`, filters updates to only lookup-whitelisted fields, validates document is in a pending/valid state.
- **Audit trail**: Every edit pushes to `edit_history[]` array on the document: `{ edited_by, edited_at, changes: [{ field, old_value, new_value }], edit_reason }`.
- **Auto-seed**: First access auto-seeds lookup entries from `SEED_DEFAULTS` (same pattern as `MODULE_DEFAULT_ROLES`).

### Editable Fields Per Module (Default Seeds)
| Module Type Key | Fields |
|----------------|--------|
| `DEDUCTION_SCHEDULE` | description, deduction_label, total_amount |
| `INCOME_REPORT` | notes |
| `SALES_LINE` | invoice_number, service_description |
| `COLLECTION` | check_no, notes |
| `SMER_ENTRY` | notes |
| `CAR_LOGBOOK` | notes |
| `EXPENSE_ENTRY` | notes |
| `PRF_CALF` | purpose, check_no, notes |
| `GRN` | notes |

### Editable Document Statuses
| Type Key | Allowed Statuses |
|----------|-----------------|
| deduction_schedule | PENDING_APPROVAL |
| income_report | GENERATED, REVIEWED |
| sales_line, collection, smer_entry, car_logbook, expense_entry, prf_calf | VALID |
| grn | PENDING |

### New Endpoint
| Method | Path | Description |
|--------|------|-------------|
| PATCH | `/api/erp/approvals/universal-edit` | Quick-edit whitelisted fields on pending document |

### Key Files
```
backend/erp/controllers/lookupGenericController.js  # APPROVAL_EDITABLE_FIELDS seed
backend/erp/controllers/universalApprovalController.js  # universalEdit handler + MODEL_MAP + EDITABLE_STATUSES
backend/erp/routes/approvalRoutes.js                # PATCH /universal-edit route
backend/erp/models/*.js (9 models)                  # edit_history field added
frontend/src/erp/hooks/useApprovals.js              # universalEdit method
frontend/src/erp/pages/ApprovalManager.jsx          # Edit button, inline form, editableFieldsMap
frontend/src/erp/components/WorkflowGuide.jsx       # Updated banner step 5
```

---

## Phase G2 — Photo Upload Compression + Approval Hub Populate Fixes

### Problem
BDMs on phones couldn't upload OR receipt photos in Expenses and CALF/PRF pages. Phone cameras produce 5-12MB files that exceeded the 5MB backend limit and were slow over mobile data. Additionally, the Universal Approval Hub showed "Unknown" for payslip names and raw ObjectIds for hospitals/customers due to wrong populate field names.

### Photo Upload — Dual Compression Strategy
**Client-side** (frontend, before upload):
- New utility: `frontend/src/erp/utils/compressImage.js` — `compressImageFile(file, { maxDimension: 1600, quality: 0.7 })`
- Canvas API, OCR-safe settings (1600px / 70% JPEG preserves receipt text)
- Skips files already < 1MB, graceful fallback on error
- Integrated into `ocrService.processDocument()` — fixes BOTH Expenses and CALF since both use this entry point
- Integrated into batch upload flow (`Expenses.jsx` `handleBatchProcess()`)

**Server-side** (backend, before S3 upload):
- `compressImage()` from `middleware/upload.js` (sharp-based, 1920px / 80% JPEG)
- Applied in `ocrController.js` and `expenseController.js` batch upload
- OCR runs on original buffer (best quality), compression only for S3 storage

### Backend Fixes
- `MAX_FILE_SIZE`: 5MB → 15MB (safety net for uncompressed photos)
- Removed global multer `files: 10` limit — was overriding batch route's `maxCount: 20`
- Exported `compressImage` from `middleware/upload.js`

### Upload Timeouts
- `ocrService.processDocument()`: 30s → 120s (mobile uploads)
- `useExpenses.batchUploadExpenses()`: 30s → 180s (up to 20 files)

### Approval Hub Populate Fixes
| Module | Field | Before (wrong) | After (correct) |
|--------|-------|-----------------|------------------|
| PAYROLL, KPI | `person_id` | `name` | `full_name` (PeopleMaster) |
| SALES, COLLECTION | `hospital_id` | `name` | `hospital_name` (Hospital) |
| SALES, COLLECTION | `customer_id` | `name` | `customer_name` (Customer) |

### Key Files
```
frontend/src/erp/utils/compressImage.js         # NEW: Client-side image compression utility
frontend/src/erp/services/ocrService.js          # Compress + timeout for single uploads
frontend/src/erp/pages/Expenses.jsx              # Compress batch files before upload
frontend/src/erp/hooks/useExpenses.js            # 180s timeout for batch uploads
backend/middleware/upload.js                     # 15MB limit, no global files cap, export compressImage
backend/erp/controllers/ocrController.js         # Server-side compress before S3
backend/erp/controllers/expenseController.js     # Server-side compress in batch upload
backend/erp/services/universalApprovalService.js # Populate field fixes (full_name, hospital_name, customer_name)
```

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
frontend/src/components/common/Sidebar.jsx  # My Income section for contractors + Contractor Income link under People & HR (module-driven: hasModule('people') && !contractor)
frontend/src/App.jsx                        # /erp/my-income route (contractor only, requiredErpModule: reports), /erp/income route (ERP_FINANCE, requiredErpModule: people)
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

One page (`/erp/approvals`) where president or any authorized person sees ALL pending transactions across all modules and approves/posts inline. Cross-entity for president. Delegatable via ApprovalRule.

### Architecture
- **universalApprovalService.js**: Queries 12 modules in parallel, normalizes results
  - **Approval modules** (6): ApprovalRequest, DeductionSchedule, IncomeReport, GrnEntry, Payslip, KpiSelfRating — action is Approve/Review/Credit
  - **Posting modules** (6): SalesLine, Collection, SmerEntry, CarLogbookEntry, ExpenseEntry, PrfCalf — action is **Post** (VALID → POSTED)
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
frontend/src/erp/pages/ApprovalManager.jsx           # "All Pending" tab with inline approve + reject modal (replaced browser prompt())
frontend/src/components/common/Sidebar.jsx           # Badge count (60s refresh)
frontend/src/erp/components/WorkflowGuide.jsx        # Updated approval-manager banner
```

### Covered Modules (12 total)
| # | Module Key | Model | Pending Status | Action | Action Key |
|---|-----------|-------|---------------|--------|------------|
| 1 | APPROVAL_REQUEST | ApprovalRequest | PENDING | Approve | APPROVE |
| 2 | DEDUCTION_SCHEDULE | DeductionSchedule | PENDING_APPROVAL | Approve | APPROVE |
| 3 | INCOME | IncomeReport | GENERATED / BDM_CONFIRMED | Review / Credit | REVIEW / CREDIT |
| 4 | INVENTORY | GrnEntry | PENDING | Approve | APPROVE |
| 5 | PAYROLL | Payslip | COMPUTED / REVIEWED | Review / Approve | REVIEW / APPROVE |
| 6 | KPI | KpiSelfRating | SUBMITTED / REVIEWED | Review / Approve | REVIEW / APPROVE |
| 7 | SALES | SalesLine | VALID | Post | POST |
| 8 | COLLECTION | Collection | VALID | Post | POST |
| 9 | SMER | SmerEntry | VALID | Post | POST |
| 10 | CAR_LOGBOOK | CarLogbookEntry | VALID | Post | POST |
| 11 | EXPENSES | ExpenseEntry | VALID | Post | POST |
| 12 | PRF_CALF | PrfCalf | VALID | Post | POST |

### New Lookup Categories
| Category | Purpose |
|----------|---------|
| `UNIVERSAL_APPROVAL_ACTION` | REVIEW, APPROVE, CREDIT, REJECT, POST with color metadata |

---

## Phase F.1 — Lookup-Driven Module Default Roles (Rule #3 Compliance)

Replaces hardcoded `allowed_roles` arrays in `universalApprovalService.js` with a database-driven `MODULE_DEFAULT_ROLES` Lookup category. Admin can now configure who sees which posting/approval modules in the Approval Hub — no code changes required.

### Problem Solved
11 of 12 modules in the Universal Approval Hub had hardcoded `allowed_roles` arrays (e.g., `['admin', 'finance', 'president']`). This violated Rule #3 (no hardcoded business values) and would break for future subscription customers with different role structures.

### Architecture — 3-Layer Authorization
```
Layer 1: ApprovalRules (delegation)  → Admin creates rules per module → overrides everything
Layer 2: MODULE_DEFAULT_ROLES (lookup) → Fallback when no ApprovalRules exist → admin-configurable
Layer 3: President/CEO              → Always sees all modules across all entities
```

**Authorization Flow** in `isAuthorizedForModule()`:
1. President/CEO? → `true` (always)
2. ApprovalRules exist for module? → Check if user matches any rule (ROLE/USER/REPORTS_TO)
3. No rules? → Query `MODULE_DEFAULT_ROLES` Lookup for the module code
4. Lookup entry found with `metadata.roles` array? → Check if userRole is in the array
5. No entry or `metadata.roles` is null? → `true` (open access, e.g., APPROVAL_REQUEST)

### New Lookup Category
| Category | Purpose |
|----------|---------|
| `MODULE_DEFAULT_ROLES` | Per-module default role arrays for Approval Hub visibility. `metadata.roles` = `['admin', 'finance', 'president']` or `null` (open). Auto-seeded on first access. |

### Default Seed Values (18 modules — Phase G4 expanded coverage)
| Code | Label | Default Roles | Used By Gate |
|------|-------|---------------|---------------|
| APPROVAL_REQUEST | Authority Matrix | null (open) | Hub visibility only |
| DEDUCTION_SCHEDULE | Deduction Schedules | admin, finance, president | Hub visibility |
| INCOME | Income Reports | admin, finance, president | gateApproval + Hub |
| INVENTORY | GRN (Goods Receipt) | admin, finance | gateApproval + Hub |
| PAYROLL | Payslips | admin, finance, president | gateApproval + Hub |
| KPI | KPI Ratings | admin, president | Hub visibility |
| SALES | Sales / CSI | admin, finance, president | gateApproval + Hub |
| COLLECTION | Collections / CR | admin, finance, president | gateApproval + Hub |
| SMER | SMER | admin, finance, president | Hub visibility (gate uses EXPENSES) |
| CAR_LOGBOOK | Car Logbook | admin, finance, president | Hub visibility (gate uses EXPENSES) |
| EXPENSES | Expenses (ORE/ACCESS) | admin, finance, president | gateApproval + Hub |
| PRF_CALF | PRF / CALF | admin, finance, president | Hub visibility (gate uses EXPENSES) |
| PERDIEM_OVERRIDE | Per Diem Override | admin, finance, president | gateApproval + Hub |
| **JOURNAL** | Journal Entries | admin, finance, president | gateApproval (Phase G4) |
| **BANKING** | Banking | admin, finance, president | gateApproval (Phase G4) |
| **PETTY_CASH** | Petty Cash | admin, finance, president | gateApproval (Phase G4) |
| **IC_TRANSFER** | Inter-Company Transfer | admin, finance, president | gateApproval (Phase G4) |
| **PURCHASING** | Purchasing | admin, finance, president | gateApproval (Phase G4) |

**Subscription tuning**: each entity edits its own row via Control Center → Lookup Tables → MODULE_DEFAULT_ROLES. Set `metadata.roles = null` to disable the gate for that module (open-post). Lazy-seeded on first submit per entity — no admin pre-action required.

### ApprovalRule Enum Expansion
Added 7 new module values to `ApprovalRule.module` enum so Approval Rules can be created for ALL Universal Hub modules:
`DEDUCTION_SCHEDULE`, `KPI`, `COLLECTION`, `SMER`, `CAR_LOGBOOK`, `PRF_CALF`, `APPROVAL_REQUEST`

### Key Changes
| File | Change |
|------|--------|
| `backend/erp/controllers/lookupGenericController.js` | Added `MODULE_DEFAULT_ROLES` to SEED_DEFAULTS (12 entries) + expanded `APPROVAL_MODULE` seed |
| `backend/erp/services/universalApprovalService.js` | Removed hardcoded `allowed_roles` from all MODULE_QUERIES entries. Added Lookup import. Refactored `isAuthorizedForModule()` to accept `defaultRolesMap`. `getUniversalPending()` fetches MODULE_DEFAULT_ROLES in one query and passes to auth check. |
| `backend/erp/models/ApprovalRule.js` | Expanded `module` enum to include all Universal Hub modules (7 new values) |
| `frontend/src/erp/components/WorkflowGuide.jsx` | Updated approval-manager banner: added step 7 (default roles), updated tip (3-layer system), added Lookup Tables link |

### Subscription Model Readiness
- Future subscribers with custom roles (e.g., `accountant` instead of `finance`) can change MODULE_DEFAULT_ROLES via Control Center
- ApprovalRules provide per-module delegation without code changes
- Entity-scoped: each entity has its own MODULE_DEFAULT_ROLES entries
- Auto-seeded on first access via standard Lookup auto-seed pattern

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
| POST | `/` | contractor | BDM creates schedule (period-lock enforced) |
| GET | `/my` | contractor | BDM lists own schedules (supports `status` filter) |
| POST | `/:id/withdraw` | contractor | BDM withdraws PENDING_APPROVAL schedule |
| PUT | `/:id` | contractor | BDM edits PENDING_APPROVAL schedule (period-lock enforced) |
| GET | `/:id` | any (own or admin) | Get schedule detail |
| GET | `/` | management | List all schedules (supports `status`, `bdm_id` filters) |
| POST | `/:id/approve` | management | Approve schedule |
| POST | `/:id/reject` | management | Reject schedule (with reason) |
| POST | `/:id/cancel` | management | Cancel + cancel PENDING installments |
| POST | `/:id/early-payoff` | management | Lump-sum remaining balance |
| PUT | `/:id/installments/:instId` | management | Adjust installment amount |
| POST | `/finance-create` | management | Create on behalf of BDM (auto-ACTIVE, period-lock enforced) |

### BDM Self-Service Features
- **Withdraw**: BDM can cancel a PENDING_APPROVAL schedule before Finance acts. Ownership-enforced.
- **Edit before approval**: BDM can modify type, amount, term, period, description while PENDING_APPROVAL. Installments regenerated. Edit history tracked.
- **Resubmit rejected**: Frontend pre-fills create form from rejected schedule data. Creates a new schedule (rejected one stays as history).

### Finance UX Features
- **Create for BDM**: Finance can create schedules directly for BDMs (auto-ACTIVE, bypasses approval)
- **Installment adjustment**: Finance can adjust individual PENDING/INJECTED installment amounts with notes
- **Filters**: Status + BDM dropdown filters on schedules tab
- **Bulk approve**: Checkbox selection + "Approve Selected" for multiple PENDING_APPROVAL schedules
- **Proper modals**: Rejection reason and early payoff period use modal dialogs (not prompt())
- **Audit trail**: Detail view shows created_by, created_at, approved_by, approved_at, reject_reason

### Period-Lock Enforcement
- `periodLockCheck('DEDUCTION')` middleware on create, edit, and finance-create routes
- Uses `start_period` field (added to periodLockCheck.js field fallback alongside `period`)

### Key Files
```
backend/erp/models/DeductionSchedule.js           # Model with installments[] + pre-save hook
backend/erp/services/deductionScheduleService.js   # 9 service functions (+ withdraw, editPending)
backend/erp/controllers/deductionScheduleController.js  # 12 endpoints
backend/erp/routes/deductionScheduleRoutes.js      # Routes with role gates + periodLockCheck
backend/erp/routes/index.js                        # Mounted at /deduction-schedules
backend/erp/services/incomeCalc.js                 # Auto-injection logic (step 4b)
backend/erp/controllers/incomeController.js        # Sync on verify + credit
frontend/src/erp/hooks/useDeductionSchedule.js     # 12 hook methods
frontend/src/erp/pages/MyIncome.jsx                # BDM: Payslips + Schedules tabs (self-service)
frontend/src/erp/pages/Income.jsx                  # Finance: Payslips + Schedules tabs (full management)
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

### Phase SG-Q2 — Compliance Floor + Incentive Ledger + Compensation (Apr 2026)

**Phase SG-Q2 Week 1** (compliance floor): reference number on first activation, gateApproval on activate/reopen/close, period locks, idempotent auto-enrollment of BDMs (lookup-driven `SALES_GOAL_ELIGIBLE_ROLES`), state changes wrapped in mongoose transactions.

**Phase SG-Q2 Week 2** (incentive ledger + GL):
- `IncentivePayout` model — lifecycle ACCRUED → APPROVED → PAID → REVERSED
- `journalFromIncentive.js` — accrual JE (DR INCENTIVE_EXPENSE / CR INCENTIVE_ACCRUAL) + settlement JE (DR INCENTIVE_ACCRUAL / CR funding) + reversal (SAP Storno)
- `salesGoalService.accrueIncentive` triggered from YTD KpiSnapshot computation; CompProfile cap enforced
- `kpiSnapshotAgent` — monthly day 1 cron, FREE agent
- Approval Hub integration via `gateApproval(module: 'INCENTIVE_PAYOUT')`, period locks on settle/reverse
- Sub-permissions: `sales_goals.payout_view / payout_approve / payout_pay / payout_reverse`
- Subscriber-configurable COA via `Settings.COA_MAP.INCENTIVE_EXPENSE` + `INCENTIVE_ACCRUAL`

**Phase SG-Q2 Week 3** (compensation statement, notifications, variance agent, mobile — shipped 2026-04-19):
- **Per-accrual transaction wrap.** `mongoose.startSession() + withTransaction` around (re-check) → `postAccrualJournal({ session })` → `IncentivePayout.findOneAndUpdate({ session })`. `DocSequence.getNext`, `generateJeNumber`, `createAndPostJournal` all thread the session through. Concurrent accruals on the same key now resolve to one row + one JE — orphaned-JE risk eliminated.
- **Compensation statement.** `GET /api/erp/incentive-payouts/statement` (controller `getCompensationStatement`) returns `{ summary: {earned, accrued, adjusted, paid}, periods: […], tier: {…}, rows: […] }`. BDMs see their own; privileged users pass `?bdm_id=` (no silent self-id fallback — Rule #21).
- **Print PDF.** `GET /api/erp/incentive-payouts/statement/print` returns printable HTML via `templates/compensationStatement.js`. Browser-print produces the PDF (same pattern as sales receipts). Lookup-driven branding via `COMP_STATEMENT_TEMPLATE` Lookup category (HEADER_TITLE / HEADER_SUBTITLE / DISCLAIMER / SIGNATORY_LINE / SIGNATORY_TITLE — per-entity overrides).
- **My Compensation tab.** `SalesGoalBdmView.jsx` has a Performance | My Compensation tab strip. Compensation tab loads lazily, shows summary cards, tier context, by-period rollup, detail ledger, and a Print button.
- **Notifications.**
  - `notifySalesGoalPlanLifecycle` on activate/reopen/close → management + assigned BDMs (de-duped). Email template: `salesGoalPlanLifecycleTemplate`.
  - `notifyTierReached` from inside `accrueIncentive` (only on a fresh row) → BDM + reports_to chain + president(s). Template: `tierReachedTemplate`.
  - `notifyKpiVariance` from `kpiVarianceAgent` → BDM + reports_to chain + president(s). Template: `kpiVarianceAlertTemplate`.
  - All filtered by `NotificationPreference.compensationAlerts` / `kpiVarianceAlerts` (new fields, default `true`). Master `emailNotifications=false` still wins.
- **kpiVarianceAgent (#V).** New FREE agent; reads YTD KpiSnapshots, classifies deviations against `KPI_VARIANCE_THRESHOLDS` Lookup (per-KPI `metadata.warning_pct` / `metadata.critical_pct`; falls back to GLOBAL row, defaults 20% / 40%). Direction-aware (`LOWER_BETTER_KPIS` set). Cron: `0 6 2 * *` Asia/Manila (day 2, runs after `kpi_snapshot`).
- **360px mobile.** SalesGoalBdmView, SalesGoalDashboard, IncentivePayoutLedger, compensationStatement print template all have `@media(max-width: 360px)` blocks: 1-col summary cards, scrollable tab strip, condensed tables, 96px ring (was 120px), full-width buttons.
- **Banner.** `WORKFLOW_GUIDES.salesGoalCompensation` added to WorkflowGuide.

### SG-Q2 Wiring Map

```
backend/erp/models/IncentivePayout.js                  • Lifecycle: ACCRUED→APPROVED→PAID→REVERSED
backend/erp/models/DocSequence.js                      • getNext supports {session} (W3)
backend/erp/services/docNumbering.js                   • generateJeNumber threads session (W3)
backend/erp/services/journalEngine.js                  • createAndPostJournal threads options.session (W3)
backend/erp/services/salesGoalService.js               • accrueIncentive wraps in txn + fires notifyTierReached (W3)
backend/erp/services/journalFromIncentive.js           • postAccrualJournal / postSettlementJournal / reverseAccrualJournal
backend/erp/services/erpNotificationService.js         • notifySalesGoalPlanLifecycle / notifyTierReached / notifyKpiVariance (W3)
backend/erp/controllers/salesGoalController.js         • activate/reopen/close fire lifecycle notifications (W3)
backend/erp/controllers/incentivePayoutController.js   • getCompensationStatement / printCompensationStatement (W3)
backend/erp/templates/compensationStatement.js         • renderCompensationStatement (W3)
backend/erp/routes/incentivePayoutRoutes.js            • /statement + /statement/print BEFORE /:id (W3)

backend/agents/kpiSnapshotAgent.js                     • Monthly KPI compute + accrual trigger (W2)
backend/agents/kpiVarianceAgent.js                     • Variance detection + alerts (W3)
backend/agents/agentRegistry.js                        • +kpi_snapshot (W2), +kpi_variance (W3)
backend/agents/agentScheduler.js                       • cron 0 5 1 * * (W2), cron 0 6 2 * * (W3)

backend/templates/erpEmails.js                         • +salesGoalPlanLifecycleTemplate / tierReachedTemplate / kpiVarianceAlertTemplate (W3)
backend/models/NotificationPreference.js               • +compensationAlerts / kpiVarianceAlerts (W3)

frontend/src/erp/hooks/useSalesGoals.js                • +getCompensationStatement / compensationStatementPrintUrl (W3)
frontend/src/erp/pages/SalesGoalBdmView.jsx            • Tab strip + My Compensation panel + Print + 360px CSS (W3)
frontend/src/erp/pages/SalesGoalDashboard.jsx          • 360px CSS (W3)
frontend/src/erp/pages/IncentivePayoutLedger.jsx       • Full 360px CSS (W3, expanded from W2 stub)
frontend/src/erp/components/WorkflowGuide.jsx          • +salesGoalCompensation banner (W3)
```

### SG-Q2 Lookup categories (subscription-configurable)
| Category | Purpose | Phase |
|----------|---------|-------|
| `SALES_GOAL_ELIGIBLE_ROLES` | Person-types auto-enrolled on plan activation | W1 |
| `STATUS_PALETTE` | Bar/badge colors per attainment bucket (lazy-seeded) | W1 |
| `MODULE_DEFAULT_ROLES.INCENTIVE_PAYOUT` | Default-Roles Gate for payout lifecycle | W2 |
| `APPROVAL_MODULE.INCENTIVE_PAYOUT` | Authority Matrix routing | W2 |
| `APPROVAL_CATEGORY.FINANCIAL` | Adds INCENTIVE_PAYOUT to financial bucket | W2 |
| `PERIOD_LOCK_MODULES` | Adds INCENTIVE_PAYOUT to lockable modules | W2 |
| `ERP_SUB_PERMISSION` | 4 new keys: payout_view/approve/pay/reverse | W2 |
| `ERP_DANGER_SUB_PERMISSIONS` | +SALES_GOALS__PAYOUT_REVERSE (Tier 2) | W2 |
| `COMP_STATEMENT_TEMPLATE` | Print template branding overrides per entity | W3 |
| `KPI_VARIANCE_THRESHOLDS` | Per-KPI warning/critical % (+ GLOBAL fallback) | W3 |
| `NOTIFICATION_ESCALATION` | Reports_to chain max hops (default 3, lazy-seeded) | W3 follow-ups |
| `NOTIFICATION_CHANNELS` | Per-entity kill-switches for email / in_app / sms | W3 follow-ups |
| `PDF_RENDERER` | `BINARY_ENABLED` flag to flip statements to binary PDF | W3 follow-ups |

### Phase SG-Q2 W3 follow-ups (April 2026) — 6 items closed

Completed the "Known limitations" block from the W3 hand-off plus three immediate polish items.

**#1 In-app + SMS dispatch.** `erpNotificationService.dispatchMultiChannel()` now fans out to three channels per recipient: email (Resend via existing `sendEmail`), in-app (`MessageInbox.create` — shows in BDM + admin inbox UIs), and SMS (Semaphore, reusing the env/API style of `backend/agents/notificationService.js`). Per-user opt-in respects `NotificationPreference.emailNotifications / inAppAlerts / smsNotifications` plus the category-specific `compensationAlerts` / `kpiVarianceAlerts`. Per-entity kill-switches live in the new `NOTIFICATION_CHANNELS` Lookup category (codes `EMAIL` / `IN_APP` / `SMS`, metadata.enabled). SMS is opt-in at both layers (entity + user) and additionally requires `SEMAPHORE_API_KEY` in env — absent configuration silently skips SMS, never throws. `findNotificationRecipients` now also selects `phone` so SMS can fire without extra queries.

**#2 Multi-hop reports_to chain.** `resolveReportsToChain(userId, { maxDepth })` walks `PeopleMaster.reports_to` up to N hops with a cycle-guard Set and inactive-person skip. Depth is lookup-driven via `NOTIFICATION_ESCALATION.REPORTS_TO_MAX_HOPS` (default 3, hard-capped at 10). `buildBdmEscalationAudience()` builds the full BDM + chain + presidents set and is used by both `notifyTierReached` and `notifyKpiVariance`. The old single-hop blocks in those two functions are replaced.

**#3 Binary PDF (graceful fallback).** New service `backend/erp/services/pdfRenderer.js` — `htmlToPdf(html, opts)` uses puppeteer via **dynamic require** so the dependency is optional. Behavior is lookup-gated via `PDF_RENDERER.BINARY_ENABLED` (per-entity, default `false`; `metadata.engine` default `'puppeteer'`). Query override: `?format=pdf` on `/statement/print`. When PDF is requested but puppeteer is not installed, the controller falls back to HTML and sets `X-PDF-Fallback: html` + `X-PDF-Fallback-Reason: puppeteer_not_installed` response headers. Admins enable by: (a) `npm install puppeteer` in `backend/`, (b) toggling the lookup row via Control Center. `getRendererStatus()` exports an introspection helper for a future settings UI.

**#4 Notification Preferences UI toggles.** `frontend/src/pages/common/NotificationPreferences.jsx` now renders two new toggle rows in the Categories card: "Compensation Alerts" (DollarSign/green) and "KPI Variance Alerts" (TrendingDown/amber). `backend/controllers/notificationPreferenceController.js` adds them to `ALLOWED_FIELDS` + default GET payload. `NotificationPreference` schema already had the two Boolean fields (W3 baseline).

**#5 Lazy-seed KPI_VARIANCE_THRESHOLDS.GLOBAL on first activation.** New helper `salesGoalService.ensureKpiVarianceGlobalThreshold(entityId, session)` upserts the `GLOBAL` row (metadata: `warning_pct=20`, `critical_pct=40`) — called from `activatePlan` inside the transaction for fresh entities, AND from `kpiVarianceAgent.loadThresholds` as a safety net for historical entities whose plans were activated before this deploy. Idempotent; on error returns cleanly (agent has in-memory defaults as final fallback).

**#6 Sidebar "My Compensation" entry.** Contractors (BDM role) see a direct entry `{ path: '/erp/sales-goals/my?tab=compensation', label: 'My Compensation', icon: Wallet }` under Sales Goals. `SalesGoalBdmView.jsx` now honors the `?tab=compensation` query param via `useSearchParams` so the link lands directly on the compensation tab (route + page + nav gate unchanged for privileged users).

### W3 follow-up Wiring Map (additions only)
```
backend/erp/services/pdfRenderer.js                    • NEW — optional puppeteer, lookup-gated
backend/erp/services/erpNotificationService.js         • +dispatchMultiChannel / getEscalationConfig / getChannelConfig / resolveReportsToChain / buildBdmEscalationAudience / persistInApp / dispatchSms
backend/erp/services/salesGoalService.js               • +ensureKpiVarianceGlobalThreshold / KPI_VARIANCE_GLOBAL_DEFAULT
backend/erp/controllers/salesGoalController.js         • activatePlan calls ensureKpiVarianceGlobalThreshold(session)
backend/erp/controllers/incentivePayoutController.js   • printCompensationStatement: lookup-gated pdf | html + X-PDF-Fallback header
backend/agents/kpiVarianceAgent.js                     • loadThresholds self-seeds GLOBAL row if missing
backend/controllers/notificationPreferenceController.js • +compensationAlerts / kpiVarianceAlerts in ALLOWED_FIELDS + default payload

frontend/src/components/common/Sidebar.jsx             • +My Compensation entry (CONTRACTOR only)
frontend/src/erp/pages/SalesGoalBdmView.jsx            • +useSearchParams, honors ?tab=compensation
frontend/src/pages/common/NotificationPreferences.jsx  • +Compensation + KPI Variance category rows
```

### Operator notes
- **Enable binary PDF for a subscriber**: `cd backend && npm install puppeteer`, then flip `PDF_RENDERER.BINARY_ENABLED.metadata.enabled=true` in Control Center for that entity. No code deploy.
- **Disable in-app alerts org-wide** for a subsidiary: set `NOTIFICATION_CHANNELS.IN_APP.metadata.enabled=false` in that entity. Email + SMS keep firing.
- **Deepen escalation chain**: set `NOTIFICATION_ESCALATION.REPORTS_TO_MAX_HOPS.metadata.value=5` (capped at 10 in code for safety).
- **SMS pre-reqs**: `SEMAPHORE_API_KEY` in backend env, user must have a `phone`, user pref `smsNotifications=true`, AND entity `NOTIFICATION_CHANNELS.SMS.metadata.enabled=true` (default `false` — SMS is opt-in). Any missing link → SMS silently skipped, other channels unaffected.

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

## Approval Workflow (Phase 29 — Authority Matrix + Phase G4 — Default-Roles Gate)

### Governing Principle
**"Any person can CREATE transactions, but all transactions must route through proper authority for POSTING."**

This is enforced via:
- `gateApproval()` on every submit/post controller (20 functions across 13 controllers)
- **Two-layer authorization** (Phase G4):
  - **Layer 1 — Default-Roles Gate (always enforced, lookup-driven)**: requester's role must be in `MODULE_DEFAULT_ROLES.metadata.roles` for the module. Holds otherwise.
  - **Layer 2 — Authority Matrix (escalation rules, optional)**: when `Settings.ENFORCE_AUTHORITY_MATRIX = true` and matching `ApprovalRule` exists, even authorized posters route through level-1/2/3 approvers (typically for amount thresholds).
- President / CEO bypass both layers (cross-entity superusers).
- APPROVAL_CATEGORY lookup: FINANCIAL vs OPERATIONAL classification
- Frontend 202 handling with `showApprovalPending()` utility
- Period locks prevent posting to closed months

### Subscription-Readiness (Phase G4)
- Each entity configures its own posting authority via Control Center → Lookup Tables → `MODULE_DEFAULT_ROLES`.
- Set `metadata.roles = ['admin', 'finance', 'president']` to gate that module.
- Set `metadata.roles = null` (or remove the entry) to disable the gate (open-post — anyone can post).
- No code changes when subscribers tune. Same lookup is read by both `gateApproval()` (submission side) and `isAuthorizedForModule()` (Hub visibility side) — symmetric configuration.

### Architecture
- **ApprovalRule** — entity-scoped rules: module + doc_type + amount threshold + level + approver config
- **ApprovalRequest** — individual request per document, tracks PENDING → APPROVED/REJECTED with immutable history
- Rules support 3 approver types: `ROLE` (any user with specified roles), `USER` (specific users), `REPORTS_TO` (requester's PeopleMaster.reports_to manager)
- Multi-level: Level 1 must approve before Level 2 is evaluated. Up to 5 levels.

### How It Works
1. Controller calls `gateApproval()` → service runs `checkApprovalRequired()`.
2. **Layer 1 (Default-Roles)**: looks up `MODULE_DEFAULT_ROLES` for the module. If requester's role is not in `metadata.roles` (and not President/CEO), creates `ApprovalRequest(PENDING, level: 0, rule_id: null)`, notifies approvers via email, returns 202 with `approval_pending: true`. Document stays in VALID status — appears in Approval Hub via existing module queries.
3. **Layer 2 (Authority Matrix)**: only checked if requester passed Layer 1 AND `ENFORCE_AUTHORITY_MATRIX = true`. Finds matching rules for entity/module/docType/amount. If rules match, creates `ApprovalRequest(level: 1+)`, notifies approvers, returns 202.
4. Approver opens `/erp/approvals` (Approval Hub) → sees the document via its module query (e.g. SALES with `status: 'VALID'`) → clicks Post / Approve / Reject.
5. `universalApprovalController` invokes the proper post handler (e.g. `postSaleRow`) → document → POSTED.
6. Controller marks any open `ApprovalRequest(PENDING)` for the doc as `APPROVED` / `REJECTED` to close the audit loop.
7. For matrix multi-level: on Layer 2 approve, if next-level rules exist, escalates automatically.

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
All submit/post controllers are wired via `gateApproval()` helper (added to `approvalService.js`):

```javascript
const { gateApproval } = require('../services/approvalService');
const gated = await gateApproval({
  entityId: req.entityId, module: 'MODULE', docType: 'TYPE',
  docId: doc._id, docRef: doc.ref, amount: doc.total,
  description: 'Human-readable description for approver',
  requesterId: req.user._id, requesterName: req.user.name,
}, res);
if (gated) return; // 202 already sent
```

**Wired modules (20 functions across 13 controllers):**

| Module | Controller | Function | Doc Type |
|--------|-----------|----------|----------|
| PURCHASING | purchasingController | approvePO | PO |
| PURCHASING | purchasingController | postInvoice | SUPPLIER_INVOICE |
| SALES | salesController | submitSales | CSI |
| SALES | creditNoteController | submitCreditNotes | CREDIT_NOTE |
| COLLECTION | collectionController | submitCollections | CR |
| EXPENSES | expenseController | submitSmer | SMER |
| EXPENSES | expenseController | submitExpenses | EXPENSE_ENTRY |
| EXPENSES | expenseController | submitCarLogbook | CAR_LOGBOOK |
| EXPENSES | expenseController | submitPrfCalf | PRF_CALF |
| PAYROLL | payrollController | postPayroll | PAYSLIP |
| JOURNAL | accountingController | postJournalEndpoint | JOURNAL_ENTRY |
| JOURNAL | accountingController | batchPostJournals | JOURNAL_ENTRY |
| JOURNAL | accountingController | postDepreciationEndpoint | DEPRECIATION |
| JOURNAL | accountingController | postInterestEndpoint | INTEREST |
| PETTY_CASH | pettyCashController | postTransaction | DISBURSEMENT/DEPOSIT |
| IC_TRANSFER | interCompanyController | approveTransfer | IC_TRANSFER |
| IC_TRANSFER | icSettlementController | postSettlement | IC_SETTLEMENT |
| INVENTORY | inventoryController | approveGrn | GRN |
| BANKING | bankingController | finalizeRecon | BANK_RECON |
| INCOME | incomeController | postPnl | PNL_REPORT |

### Financial vs Operational Categorization

Modules are categorized via `APPROVAL_CATEGORY` lookup for future delegation:

| Category | Modules | Default Approver |
|----------|---------|-----------------|
| **FINANCIAL** | Expenses, Purchasing, Payroll, Journal, Banking, Petty Cash, IC Transfer, Income, PRF/CALF, Per Diem Override, Deductions | President / Finance |
| **OPERATIONAL** | Sales, Collections, Inventory, KPI, SMER, Car Logbook | Can be delegated to Admin / Finance |

Each `APPROVAL_MODULE` lookup entry has `metadata.category` set to FINANCIAL or OPERATIONAL. This is subscription-ready — new entities configure their own rules via Control Center.

### Frontend 202 Handling
All module pages handle `approval_pending` in API responses:
- Success path: check `res?.approval_pending`, show info toast, refresh list
- Error path: check `err?.response?.data?.approval_pending`, show info toast
- Helper: `showApprovalPending()` in `frontend/src/erp/utils/errorToast.js`
- Helper: `isApprovalPending()` for checking both success and error paths

### WorkflowGuide Coverage
- **87/96 ERP pages** have WorkflowGuide banners (90.6%)
- **9 admin/system pages** intentionally excluded (ControlCenter uses DependencyBanner; LookupManager, EntityManager, AgentSettings, ErpSettingsPanel, FoundationHealth, TerritoryManager, PartnerScorecard are config-only pages)
- **6 Phase 28 pages** use camelCase pageKeys (salesGoalDashboard, salesGoalSetup, salesGoalBdmView, kpiLibrary, kpiSelfRating, incentiveTracker)
- Every new ERP page MUST add a WorkflowGuide entry — see "Workflow Guide & Dependency Guide Governance" section

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
| Interest | 7050 Interest Expense | 2250 Interest Payable |
| IC Transfer (sender) | 1150 IC Receivable | 1200 Inventory |
| IC Transfer (receiver) | 1200 Inventory | 2050 IC Payable |
| Commission | 5100 BDM Commission | 1110 AR BDM |
| Inventory Write-Off | 6850 Inventory Write-Off | 1200 Inventory |
| Inventory Adj Gain | 1200 Inventory | 6860 Inventory Adj Gain |
| Petty Cash | 6XXX Expense | 1015 Petty Cash |
| Owner Infusion | Cash/Bank | 3000 Owner Capital |
| Owner Drawing | 3100 Owner Drawings | Cash/Bank |

### OPENING_AR — Pre-Live-Date Sales

Each BDM has a `live_date` on their User/PeopleMaster profile (set at entity onboarding). This partitions CSI entries into two sources:

| Condition | Source | Inventory | COGS JE | AR/Revenue JE |
|-----------|--------|-----------|---------|---------------|
| `csi_date >= live_date` | `SALES_LINE` | FIFO deducted | Yes | Yes |
| `csi_date < live_date` | `OPENING_AR` | **Skipped** | **Skipped** | Yes (AR only) |

**Routing logic** (`salesController.js`):
- `createSale` (line 35-38): auto-sets `source` based on `csi_date` vs `req.user.live_date`
- `updateSale` (line 99-104): re-routes source when `csi_date` changes on edit
- `validateSales` (line 305-317): skips stock allocation check for OPENING_AR (basic field validation still runs)
- `submitSales` (line 465-472): skips FIFO/consignment deduction for OPENING_AR → posts directly
- `autoJournal` (line 562): skips COGS JE for OPENING_AR (no inventory consumed)
- `reopenSales`: safe — queries `InventoryLedger` by `event_id` which returns 0 entries for OPENING_AR

**Approval flow**: When authority matrix is enabled, `gateApproval()` may hold posting. Upon approval, `universalApprovalController.sales_line` calls `postSaleRow()` which handles OPENING_AR identically to direct submit (no FIFO, no COGS, AR journal only).

**Lookup-driven**: `SALE_SOURCE` lookup (values: `SALES_LINE`, `OPENING_AR`) — admin-configurable via Control Center.

**Frontend**:
- `SalesEntry.jsx`: shows amber "Opening AR" badge next to status for pre-live rows
- `SalesList.jsx`: source filter dropdown is lookup-driven via `useLookupOptions('SALE_SOURCE')`; source column shows color-coded badges
- `WorkflowGuide.jsx`: sales-entry and sales-list banners explain OPENING_AR behavior

### Funding COA Resolution

`resolveFundingCoa(doc)` in `autoJournal.js` resolves credit-side COA:
1. `funding_card_id` → CreditCard.coa_code
2. `funding_account_id` or `bank_account_id` → BankAccount.coa_code
3. `payment_mode` → PaymentMode.coa_code
4. Fallback: 1000 (Cash on Hand)

### Settings.COA_MAP — Configurable Account Codes (39 keys)

All auto-journal COA codes are admin-configurable in `Settings.COA_MAP` (ERP Settings → COA Mapping). The `autoJournal.js` service reads these via `getCoaMap()` (cached 60s). If a key is missing, falls back to `'9999'`.

**Asset (1xxx):** AR_TRADE (1100), AR_BDM (1110), IC_RECEIVABLE (1150), CASH_ON_HAND (1000), PETTY_CASH (1015), INVENTORY (1200), INPUT_VAT (1210), CWT_RECEIVABLE (1220), ACCUM_DEPRECIATION (1350)

**Liability (2xxx):** AP_TRADE (2000), IC_PAYABLE (2050), OUTPUT_VAT (2100), SSS_PAYABLE (2200), PHILHEALTH_PAYABLE (2210), PAGIBIG_PAYABLE (2220), WHT_PAYABLE (2230), INTEREST_PAYABLE (2250), LOANS_PAYABLE (2300)

**Equity (3xxx):** OWNER_CAPITAL (3000), OWNER_DRAWINGS (3100)

**Revenue (4xxx):** SALES_REVENUE (4000), SERVICE_REVENUE (4100), INTEREST_INCOME (4200)

**Expense (5xxx-7xxx):** COGS (5000), BDM_COMMISSION (5100), PARTNER_REBATE (5200), SALARIES_WAGES (6000), ALLOWANCES (6050), BONUS_13TH (6060), PER_DIEM (6100), TRANSPORT (6150), SPECIAL_TRANSPORT (6160), OTHER_REIMBURSABLE (6170), FUEL_GAS (6200), INVENTORY_WRITEOFF (6850), INVENTORY_ADJ_GAIN (6860), MISC_EXPENSE (6900), DEPRECIATION (7000), INTEREST_EXPENSE (7050), BANK_CHARGES (7100)

### Settings.ASSORTED_THRESHOLD — Batch Upload Classification

`ASSORTED_THRESHOLD` (default: 3) controls batch upload "Assorted Items" classification. Receipts with N+ OCR-detected line items → establishment = "Assorted Items". Admin-configurable in Settings → Authority & Compliance section.

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
14. **COA_MAP has 39 configurable keys** — all journal COA codes are in `Settings.COA_MAP`, including payroll (SALARIES_WAGES, ALLOWANCES, BONUS_13TH, SSS/PH/PAGIBIG/WHT_PAYABLE) and INTEREST_PAYABLE. `autoJournal.js` reads via `getCoaMap()` (60s cache). Frontend mirrors these in `ErpSettingsPanel.jsx` COA_LABELS. When adding a new COA key: update Settings.js schema + autoJournal.js COA_NAMES + ErpSettingsPanel.jsx COA_LABELS (3-file sync).
15. **ASSORTED_THRESHOLD is Settings-driven** — batch upload "Assorted Items" classification reads `Settings.ASSORTED_THRESHOLD` (default 3) at runtime, not a hardcoded constant. Admin can change in Control Center → Authority & Compliance.
14. **Income projection** is read-only — never creates documents. Use `request-generation` to create the actual IncomeReport.
15. **CALF is bidirectional** in income: positive balance = deduction, negative balance = earnings reimbursement. Not just one-way.
16. **Revolving fund** follows per-person override pattern: `CompProfile.revolving_fund_amount` → `Settings.REVOLVING_FUND_AMOUNT` fallback. 0 = use global.
16b. **Per diem thresholds** follow the same per-person override pattern: `CompProfile.perdiem_engagement_threshold_full/half` → `Settings.PERDIEM_MD_FULL/HALF` fallback. `null/undefined` = use global; **0 IS a valid override**. Threshold logic: Full=0 + Half=0 → always FULL for all activities (Office/Field/Other). Full=8 + Half=3 → MD count from CRM drives the tier (<3 = ZERO). Resolution: `perdiemCalc.resolvePerdiemThresholds(settings, compProfile)`. Frontend: `GET /expenses/perdiem-config` returns resolved thresholds + source. SMER page shows "(per-person)" badge when CompProfile overrides are active.
16d. **"NO_WORK" activity type** — Lookup-driven via `ACTIVITY_TYPE` (OFFICE/FIELD/OTHER/NO_WORK). Lookup codes are uppercase (seed: `'No Work'` → code `'NO_WORK'`). When `activity_type === 'NO_WORK'`: (1) md_count forced to 0, (2) perdiem_tier = ZERO, perdiem_amount = 0, (3) overrides blocked (400 error from backend), (4) hospital fields cleared, (5) does NOT count as a working day in `SmerEntry` pre-save. Backend enforcement: `enforceNoWorkRules()` helper in `expenseController.js` applied in both `createSmer` and `updateSmer`. Validation: `validateSmer` rejects NO_WORK entries with md_count > 0 or perdiem > 0. Frontend: md_count input disabled + dimmed, override button hidden, CRM pull skips NO_WORK entries, per diem recomputes on activity_type change (not just md_count). Activity types are lookup-driven — admin can manage via Control Center > Lookup Tables. **IMPORTANT**: Always compare against the uppercase code `'NO_WORK'`, not the label `'No Work'`.
16c. **Per diem overrides ALWAYS require approval for BDMs** — BDMs/contractors request overrides via the "+" button in SMER. `POST /expenses/smer/:id/override-perdiem` **always creates an ApprovalRequest** for non-management roles (bypasses the global authority matrix setting). Management roles (president/admin/finance) can self-approve overrides directly. Flow: (1) BDM requests → `ApprovalRequest` created with `module: 'PERDIEM_OVERRIDE'`, daily entry gets `override_status: 'PENDING'`, (2) request appears in Approval Hub under PERDIEM_OVERRIDE filter tab, (3) on approve → `universalApprovalController.perdiem_override` handler auto-applies the override, (4) on reject → `override_status: 'REJECTED'`, BDM can retry. Removing overrides (reverting to CRM-computed) does NOT require approval. `POST /expenses/smer/:id/apply-override` endpoint remains as manual fallback. Key files: `expenseController.js`, `universalApprovalController.js`, `universalApprovalService.js`, `SmerEntry.js`, `ApprovalRequest.js`, `Smer.jsx`.
17. **Personal gas auto-deduction** rebuilds fresh on each income generation (like CALF auto-lines). Comes from CarLogbook `personal_gas_amount`, not manual entry.
18. **ORE is paid from revolving fund** — ORE amounts in SMER daily `ore_amount` are already included in `total_reimbursable`. No separate ORE earnings line. `ExpenseEntry` (ORE type) tracks receipts/ORs.
19. **Inventory pages must use WarehousePicker** — All pages that call `getMyStock()` must pass a `warehouseId` parameter (e.g., `getMyStock(null, null, warehouseId)`). Without it, the FIFO engine's `buildStockMatch` has no scope and returns empty for non-admin users. Pattern: add `<WarehousePicker filterType="PHARMA" />` and load stock on warehouse change. See SalesEntry.jsx, BatchTrace.jsx as reference.
20. **getMyStock response nesting** — `getMyStock` returns `{ data: [{ product_id, product: { brand_name, dosage_strength, ... }, batches, total_qty }] }`. Product details are nested under `product` sub-object, NOT at the top level. Access as `item.product.brand_name`, not `item.brand_name`.
21. **Petty Cash models use `custodian_id`, NOT `bdm_id`** — The tenant filter for BDM/contractor users injects `{ entity_id, bdm_id }`, but PettyCashFund/Transaction/Remittance models have no `bdm_id` field. The controller uses `pcFilter()` helper to remap `bdm_id → custodian_id` for fund queries and strip it for transaction/document queries. Never use raw `req.tenantFilter` in petty cash controllers — always wrap with `pcFilter(req.tenantFilter, 'fund'|'transaction'|'document')`.
22. **Petty Cash dropdowns are lookup-driven** — Fund modes from `PETTY_CASH_FUND_TYPE`, fund statuses from `PETTY_CASH_FUND_STATUS`, transaction types from `PETTY_CASH_TXN_TYPE`, expense categories from `PETTY_CASH_EXPENSE_CATEGORY`. All configurable in Control Center > Lookup Tables. Frontend uses `useLookupBatch()`.
22b. **Petty Cash PCV toggle** — Disbursements either have an Official Receipt (OR#) or a Petty Cash Voucher (PCV). `is_pcv: true` means no OR; `pcv_remarks` (required) describes the purchase. Backend validates PCV remarks are non-empty when `is_pcv` is true. Frontend shows OR# field or PCV remarks textarea based on checkbox toggle.
22c. **Petty Cash lifecycle** — Transactions: DRAFT → POSTED or VOIDED (void is DRAFT-only, requires reason). Documents (remittance/replenishment): PENDING → PROCESSED (no signing gate — Process click is sufficient). Fund status SUSPENDED/CLOSED blocks all new transactions, remittances, and replenishments.
22d. **Petty Cash sub-permission gated** — Routes use `erpSubAccessCheck('accounting', 'petty_cash')` instead of `roleCheck`. Admin/finance/president with FULL accounting access pass automatically. Contractors need explicit `accounting.petty_cash` sub-permission in their access template to post, void, process, generate, or manage funds. Frontend mirrors this: `canManage` checks both `ROLE_SETS.MANAGEMENT` and `user.erp_access.sub_permissions.accounting.petty_cash`.
22e. **Collection→Petty Cash auto-deposit** — Full details in "Petty Cash Module > Collection → Petty Cash Auto-Deposit" section. Summary: on submit, a POSTED deposit is created inside the same MongoDB transaction (atomic). On reopen, the deposit is VOIDED and balance decremented (also atomic). Validation checks fund exists, is ACTIVE, entity matches, and fund_mode allows deposits. No separate petty cash approval gate — Collection approval covers it.
23. **COA_MAP cache is cleared on Settings update** — `settingsController.updateSettings` calls both `Settings.clearVatCache()` AND `clearCoaCache()` from `autoJournal.js`. No stale window; journals immediately use new codes after admin changes Settings.
24. **OPENING_AR skips inventory + COGS** — CSI entries with `csi_date < user.live_date` are auto-tagged `source: 'OPENING_AR'`. Validation skips stock check, submission skips FIFO/consignment, and COGS JE is not created. Only AR/Revenue JE posts. Source re-routes on edit if `csi_date` changes. `SALE_SOURCE` lookup is admin-configurable. Frontend shows amber "Opening AR" badge. Reopen is safe (no inventory entries to reverse).
25. **Sales approval handler uses `postSaleRow`** — The `sales_line` handler in `universalApprovalController.js` calls `salesController.postSaleRow()` (shared helper) for full posting with TransactionEvent, inventory, and journals. This ensures approval-flow posts behave identically to direct `submitSales` posts — including OPENING_AR skip logic. Other module handlers (collection, smer, etc.) are still simplified stubs.
24. **COA codes are validated on save** — `Settings.updateSettings` validates all COA_MAP codes against ChartOfAccounts before saving. VendorMaster, BankAccount, CreditCard, and PaymentMode controllers validate `coa_code` via `validateCoaCode()` utility. Invalid codes are rejected with 400.
25. **Reopen reversal is fail-safe** — All `reopen*` functions (SMER, CarLogbook, Expense, PRF/CALF) skip the document if JE reversal fails. The document stays POSTED (ledger balanced) and the failure is reported in the response `failed[]` array. Never mark DRAFT if reversal threw.
25a. **Settled-CSI guard on sales reopen + deletion** — `reopenSales` and `approveDeletion` in `salesController.js` refuse to process a CSI that is referenced by any POSTED `Collection.settled_csis[].sales_line_id` (entity-scoped, excludes collections with `deletion_event_id`). Reopening a settled CSI would leave the Collection's settled amounts pointing at a DRAFT/deleted sale → AR and GL diverge. User must reopen the Collection first (which releases the CSI), then reopen/delete the CSI. `reopenSales` returns the block in `failed[]` with message `"Cannot reopen: settled by Collection CR#..."`; `approveDeletion` returns HTTP 409. Frontend (`SalesList.jsx`, `SalesEntry.jsx`) surfaces `failed[]` via `showWarning` toast. Banner text updated in `WorkflowGuide.jsx` (`sales-list`, `sales-entry`).
25b. **`corrects_je_id` is omitted when absent** — `createAndPostJournal` in `journalEngine.js` spreads `corrects_je_id` only when truthy (line 95 area). Writing `corrects_je_id: null` would be indexed by the `{ corrects_je_id: 1 }, { unique: true, sparse: true }` index — MongoDB sparse treats null as present — and the second non-reversal JE insert would hit E11000. Omit → field absent → sparse excludes → safe.
26. **CALF→Expense auto-submit uses transactions** — `submitPrfCalf` auto-submits linked expenses/carlogbooks inside a MongoDB session. If event creation or journal posting fails, the transaction rolls back — source stays in its previous status, no orphaned events or JEs.
27. **ACCESS expense fallback is AP_TRADE** — `resolveFundingCoa()` for ACCESS (company-funded) lines passes `COA_MAP.AP_TRADE` as fallback, not CASH_ON_HAND. This ensures the credit account is Accounts Payable when no funding source is resolved.
28. **`recorded_on_behalf_of` stores the BDM** — In `saveBatchExpenses`, `recorded_on_behalf_of` = the BDM on whose behalf the record was made (matches field name semantics). The admin/uploader is captured in `created_by`. When set, it signals a delegated action.
29. **Period lock on CALF update** — `PUT /prf-calf/:id` now has `periodLockCheck('EXPENSE')`. Submit and reopen already had it; update was missing.
30. **Approval Manager access is lookup-driven** — The `/erp/approvals` page uses `requiredErpModule="approvals"` (not hardcoded `ROLE_SETS.MANAGEMENT`). Assign the `approvals` module (VIEW or FULL) in Access Templates to grant users access. Sub-permission `rule_manage` controls who can create/edit/delete approval rules. Backend routes use `erpAccessCheck('approvals')` for hub operations and `erpSubAccessCheck('approvals', 'rule_manage')` for rule CRUD. Sidebar shows the Approvals link based on `hasModule('approvals')`. President always has full access (role override).
31. **PeopleList enhanced directory** — Shows 12 columns: Name, Email/Phone, Type, **Role** (system role from linked User, lookup-driven labels via SYSTEM_ROLE), **Login** (active/disabled/none), Position, Department, Employment Type, BDM Code, BDM Stage, Territory, Status. Role filter dropdown (lookup-driven) with "No Login" option. Columns hide responsively: tablet hides Employment/BDM Code/Stage/Territory, mobile hides Role/Login/Position/Department too. Backend populates `user_id` with `isActive` and `territory_id` with `territory_name territory_code`.

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
| Hospital entity_id optional | Hospitals intentionally global (shared across entities) — `warehouse_ids` controls BDM access | By design. BDM access is warehouse-driven (not per-BDM tagged_bdms). See "Hospital-Warehouse Access Pattern" below. |

---

## Hospital-Warehouse Access Pattern

Hospitals are globally shared (no entity_id filter). BDM access is **warehouse-driven** — scalable and lookup-friendly:

1. **Hospital.warehouse_ids** — array of Warehouse ObjectIds. Primary access mechanism.
2. **Hospital.tagged_bdms** — legacy per-BDM tagging. Kept as fallback for edge cases.
3. **hospitalController.getAll()** — for BDMs, finds their warehouse(s) via `Warehouse.find({ $or: [{ manager_id }, { assigned_users }] })`, then filters hospitals by `warehouse_ids $in myWhIds` OR legacy `tagged_bdms`.
4. **Admin/President/Finance** — see all hospitals (no filter).

**Adding a new hospital**: Admin creates hospital → assigns warehouse(s) via Hospital List UI → all BDMs in those warehouses automatically see it.

**Adding a new BDM**: Assign to warehouse (manager_id or assigned_users) → BDM inherits all hospitals in that warehouse.

**Excel import/export**: "Warehouse Codes" column (semicolon-separated, e.g., `GSC;ILO-MAIN`). Resolved to ObjectIds on import.

**Files**: `Hospital.js` (model), `hospitalController.js` (filter logic + import/export), `HospitalList.jsx` (Assign modal + warehouse multi-select in create/edit form).

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

Every user-facing page MUST have a helper banner. Three systems exist — use one per page, never overlap.

### WorkflowGuide — for ERP standalone pages

Used on ERP transaction, reporting, and management pages (Sales, Collections, GRN, Hospitals, etc.).

- **Config**: `frontend/src/erp/components/WorkflowGuide.jsx` → `WORKFLOW_GUIDES` object
- **Structure**: Each pageKey has `title`, `steps[]` (numbered), `next[]` (links), optional `tip`
- **Usage**: Import and render `<WorkflowGuide pageKey="..." />` at top of page content
- **Dismissal**: Session-based via `sessionStorage` (key: `wfg_dismiss_{pageKey}`)

### PageGuide — for CRM standalone pages

Used on CRM pages (Admin Dashboard, BDM Dashboard, VIP Client Management, Visit pages, etc.).

- **Config**: `frontend/src/components/common/PageGuide.jsx` → `PAGE_GUIDES` object
- **Structure**: Same pattern — `title`, `steps[]`, `next[]`, optional `tip`
- **Usage**: Import and render `<PageGuide pageKey="..." />` at top of page content
- **Dismissal**: Session-based via `sessionStorage` (key: `pg_dismiss_{pageKey}`)

### DEPENDENCY_GUIDE — for Control Center panels only

Used on embedded panels inside ControlCenter (Entities, COA, Warehouses, Agent Config, etc.).

- **Config**: `frontend/src/erp/pages/ControlCenter.jsx` → `DEPENDENCY_GUIDE` object
- **Structure**: Each section key has `title`, `items[]` (action → deps → optional section link)
- **Rendered by**: `DependencyBanner` component inside ControlCenter

### Rule: Always Update Guides When Modifying Pages

When creating or modifying any page, you MUST also update the corresponding guide:

1. **New ERP standalone page** → add a pageKey entry to `WORKFLOW_GUIDES` + import WorkflowGuide in the page
2. **New CRM standalone page** → add a pageKey entry to `PAGE_GUIDES` + import PageGuide in the page
3. **New Control Center section** → add entry to `DEPENDENCY_GUIDE` in ControlCenter.jsx
4. **Modified page workflow** → update the steps/tips/next-links in the guide to match the new behavior
5. **Removed page** → remove the guide entry to avoid dead references

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
| `ERP_MODULE` | 12 ERP modules (sales, inventory, collections, expenses, reports, people, payroll, accounting, purchasing, banking, sales_goals, **approvals**) with `metadata.key` (schema field name) and `metadata.short_label` (compact display) |
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

---

## Petty Cash Module (Phase 19 + G4 Hardening)

### Architecture
Petty Cash funds are entity-scoped revolving cash pools managed by custodians (BDMs). Each fund has a ceiling; when balance exceeds it, custodian generates a Remittance. When low, owner generates a Replenishment. All posted transactions create journal entries.

### Custodian Assignment
- Custodians are assigned per-fund via the Fund Form Modal (Create + Edit)
- Custodian dropdown uses `SelectField` (searchable react-select), populated from `usePeople({ limit: 0, status: 'ACTIVE' })`
- `PettyCashFund.custodian_id` references User model (required field)
- BDMs only see funds where they are custodian (enforced by `pcFilter()` in controller)

### pcFilter() — Tenant Filter Adaptation
PettyCash models use `custodian_id`, not `bdm_id`. The default `req.tenantFilter` for BDMs includes `{ bdm_id }` which doesn't exist on PC models. `pcFilter()` helper remaps:
- **Fund queries**: `bdm_id` → `custodian_id` (BDMs see only their funds)
- **Transaction/Document queries**: strips `bdm_id` (entity-level filtering + controller custodian checks)

```javascript
function pcFilter(tenantFilter, modelType = 'fund') {
  const filter = { ...tenantFilter };
  if (filter.bdm_id) {
    if (modelType === 'fund') filter.custodian_id = filter.bdm_id;
    delete filter.bdm_id;
  }
  return filter;
}
```

### Lookup-Driven Dropdowns
| Lookup Category | Used For | Values |
|----------------|----------|--------|
| `PETTY_CASH_FUND_TYPE` | Fund mode dropdown | REVOLVING, EXPENSE_ONLY, DEPOSIT_ONLY |
| `PETTY_CASH_FUND_STATUS` | Fund status dropdown | ACTIVE, SUSPENDED, CLOSED |
| `PETTY_CASH_TXN_TYPE` | Transaction type | DEPOSIT, DISBURSEMENT, REMITTANCE, REPLENISHMENT, ADJUSTMENT |

### Fund Form Fields
| Field | Source | Notes |
|-------|--------|-------|
| Fund Name | free text | Required |
| Fund Code | free text | Required, unique per entity |
| Custodian | People API (ACTIVE) | Searchable SelectField |
| Warehouse | Warehouses API | Optional, links fund to territory |
| Authorized Amount | number | Max amount fund can hold |
| Ceiling Amount | number | Threshold triggering remittance |
| COA Code | free text | Default 1000 (Cash on Hand) |
| Fund Mode | Lookup (PETTY_CASH_FUND_TYPE) | Controls allowed transaction types |
| Status | Lookup (PETTY_CASH_FUND_STATUS) | Only shown on edit |

### Key Files
```
backend/erp/models/PettyCashFund.js              # Fund schema (custodian_id, warehouse_id, fund_mode, status)
backend/erp/models/PettyCashTransaction.js        # Deposit/Disbursement with running_balance
backend/erp/models/PettyCashRemittance.js         # Remittance/Replenishment documents
backend/erp/controllers/pettyCashController.js    # pcFilter(), CRUD, ceiling, remit/replenish, JE posting
backend/erp/routes/pettyCashRoutes.js             # Fund CRUD, Transactions, Documents, Ceiling
frontend/src/erp/pages/PettyCash.jsx              # 3-tab page (Funds, Transactions, Documents)
frontend/src/erp/hooks/usePettyCash.js            # API wrapper
frontend/src/erp/components/WorkflowGuide.jsx     # 'petty-cash' pageKey
```

### Collection → Petty Cash Auto-Deposit

When a Collection with `petty_cash_fund_id` is posted, a POSTED `PettyCashTransaction` (type=DEPOSIT) is auto-created and the fund balance incremented — all inside a single MongoDB transaction for atomicity. On reopen, the deposit is VOIDED and balance decremented (also inside the transaction).

**Full Flow:**
1. **CollectionSession.jsx** — user selects "Deposit To" (Petty Cash Fund or Bank Account). Only ACTIVE funds with REVOLVING or DEPOSIT_ONLY mode shown.
2. **validateCollections** — checks fund exists, is ACTIVE, entity matches, fund_mode allows deposits (not EXPENSE_ONLY), mutual exclusion with bank_account_id.
3. **submitCollections** — inside `session.withTransaction()`: posts collection + creates POSTED PettyCashTransaction + increments fund balance. If fund validation fails, entire batch aborts (no partial post).
4. **reopenCollections** — inside `session.withTransaction()`: reverts collection to DRAFT + voids the linked PettyCashTransaction + decrements fund balance. If fund was deleted, logs LEDGER_ERROR audit entry.

**Design Decisions:**
- **No separate petty cash approval gate** �� the Collection's own `gateApproval(module: 'COLLECTIONS')` covers authorization. The deposit is a downstream side-effect, not an independent action.
- **Defense-in-depth** — validation catches bad fund refs at DRAFT→VALID; submit re-checks fund status/mode at VALID→POSTED to guard against race conditions.
- **Mutual exclusion** — `bank_account_id` and `petty_cash_fund_id` cannot coexist (pre-save hook + validation).

**Traceability Fields:**
- `Collection.petty_cash_fund_id` → which fund receives the deposit
- `PettyCashTransaction.linked_collection_id` → which collection created the deposit
- `PettyCashTransaction.source_description` → "Collection CR-XXXX"

**Key Files:**
- `collectionController.js` — validateCollections (fund checks), submitCollections (atomic deposit), reopenCollections (atomic reversal)
- `CollectionSession.jsx` — fund selector dropdown (filtered by status + mode)
- `Collections.jsx` — destination column showing PC fund or bank
- `PettyCash.jsx` — "CR# xxx" badge on auto-deposit transactions

### Sales → Petty Cash Direct Deposit (CASH_RECEIPT / SERVICE_INVOICE)

For **CASH payment** sales (CASH_RECEIPT and SERVICE_INVOICE), cash can be deposited directly into a petty cash fund at sale-posting time — bypassing the Collection/AR cycle entirely.

**Flow:**
1. **SalesEntry.jsx** — user selects sale type (CASH_RECEIPT or SERVICE_INVOICE). For CASH payment, a "Deposit To" dropdown shows ACTIVE petty cash funds (REVOLVING/DEPOSIT_ONLY only).
2. **validateSales** — checks fund exists, is ACTIVE, entity matches, fund_mode allows deposits, payment_mode is CASH, and sale_type is not CSI.
3. **postSaleRow** — inside `session.withTransaction()`: posts sale + creates POSTED PettyCashTransaction (DEPOSIT) + increments fund balance. All atomic.
4. **reopenSales** — inside `session.withTransaction()`: reverts sale to DRAFT + voids linked deposit + decrements fund balance.

**Journal Entry Difference:**
- **Without fund (AR path):** DR AR_TRADE / CR SALES_REVENUE (or SERVICE_REVENUE)
- **With fund (direct cash):** DR PETTY_CASH / CR SALES_REVENUE (or SERVICE_REVENUE) — cash goes to petty cash, no AR created

**Design Decisions:**
- **CASH payment only** — CHECK, BANK_TRANSFER, etc. always create AR (collected via Collections module)
- **CSI cannot route to petty cash** — CSI is always credit sale with AR; validation blocks it
- **No separate approval gate** — the Sales module's own `gateApproval(module: 'SALES')` covers authorization
- `SalesLine.petty_cash_fund_id` stores the fund reference
- `PettyCashTransaction.linked_sales_line_id` traces back to the source sale

**Key Files:**
- `SalesLine.js` — `petty_cash_fund_id` field
- `salesController.js` — validateSales (fund checks), postSaleRow (atomic deposit), reopenSales (atomic reversal)
- `autoJournal.js` — `journalFromSale` and `journalFromServiceRevenue` use DR PETTY_CASH when fund is set
- `SalesEntry.jsx` — fund selector for CASH_RECEIPT (global) and SERVICE_INVOICE (per-form)
- `PettyCashTransaction.js` — `linked_sales_line_id` field for traceability

### Authorization
| Action | Allowed Roles |
|--------|---------------|
| View funds/transactions | All (filtered by custodian for BDMs) |
| Create/Edit fund | admin, finance, president |
| Delete fund | president only (zero balance, no transactions) |
| Create transaction | Custodian + admin/finance/president |
| Post transaction | admin, finance, president |
| Sign/Process documents | admin, finance, president |

---

## Sub-Permission Gated Inventory Features (CSI Booklets, Office Supplies, Collaterals)

CSI Booklets, Office Supplies, and Collaterals are **not** shown to all BDMs by default. They are gated by `sub_permissions` in the access template system, following the same pattern as petty cash custodian access.

### Access Control Chain
1. **Module-level**: `erpAccessCheck('inventory')` in `routes/index.js` — must have at least VIEW on inventory module
2. **Sub-permission**: `erpSubAccessCheck('inventory', '<key>')` on all routes per feature
3. **Sidebar**: `hasSub('inventory', '<key>')` — items only render when sub-permission is granted
4. **App.jsx**: `requiredErpModule="inventory"` on all three routes

### Lookup Seeds (ERP_SUB_PERMISSION)
| Code | Module | Key | Label |
|------|--------|-----|-------|
| `INVENTORY__CSI_BOOKLETS` | inventory | csi_booklets | CSI Booklets |
| `INVENTORY__OFFICE_SUPPLIES` | inventory | office_supplies | Office Supplies |
| `INVENTORY__COLLATERALS` | inventory | collaterals | Collaterals |

### How to Grant Access
In **Access Templates** (Control Center > Access), set inventory module to VIEW or FULL, then toggle the `csi_booklets`, `office_supplies`, and/or `collaterals` sub-permissions. Apply the template to the user.

### Key Files
- `backend/erp/controllers/lookupGenericController.js` — INVENTORY__* seed entries in ERP_SUB_PERMISSION
- `backend/erp/routes/csiBookletRoutes.js` — all routes gated by `erpSubAccessCheck('inventory', 'csi_booklets')`
- `backend/erp/routes/officeSupplyRoutes.js` — all routes gated by `erpSubAccessCheck('inventory', 'office_supplies')`
- `backend/erp/routes/collateralRoutes.js` — all routes gated by `erpSubAccessCheck('inventory', 'collaterals')`
- `backend/erp/routes/index.js` — all three mounted under `erpAccessCheck('inventory')`
- `frontend/src/components/common/Sidebar.jsx` — `hasSub()` helper gates sidebar visibility
- `frontend/src/App.jsx` — `requiredErpModule="inventory"` on all three routes

### President / Admin Bypass
- President always passes (both module and sub-permission checks)
- Admin with FULL inventory access and no sub_permissions entries = all granted (backward compat)
- Admin with granular sub_permissions = only granted subs are visible

---

## CSI Booklets — Monitoring + Traceability (Phase 15.2 — softened, April 2026)

The CSI Booklet feature is **monitoring-only**: no sales will ever be blocked by it. Its purpose is to give HQ a traceable paper-trail of which BIR-registered CSI number was used on which sale.

### BIR Iloilo HQ workflow

VIP's BIR "Authority to Print" is registered to the Iloilo head office. Per BIR rules, CSI booklets must be drawn from the registered address. BDMs, however, operate across the Philippines:

1. **HQ records the booklet** — code, series range, optional ATP number + registered address.
2. **HQ allocates small ranges** (typically 3–7 numbers) to specific remote BDMs. No dates are required.
3. **The BDM uses the numbers** in the field (Cebu, Manila, Davao, etc.).
4. **When a sale posts**, the number is auto-marked USED so the BDM's available pool updates.
5. **HQ reconciles** via the CsiBooklets page for BIR audit.

**Iloilo-based contractors are NOT monitored.** They hold booklets directly. If a BDM has no allocations on file, `validateCsiNumber` returns `{ valid: true, skipped: true }` and no warning is surfaced. Admin opts each BDM in simply by creating an allocation for them.

### Soft-warning vs hard-error pattern

- **Hard errors** (`rowErrors`): missing doc_ref, stock issues, etc. — row stays ERROR, cannot post.
- **Soft warnings** (`rowWarnings` → `validation_warnings`): CSI number outside allocation, already used, or voided — row still VALID, can post. Surfaced as a yellow panel in SalesEntry.

The pattern mirrors the existing `hospital.credit_limit_action` soft-warn flow at `salesController.js:532-535`.

### Void-with-proof (anti-fraud)

The "no return" policy means allocated numbers stay with the BDM until USED or VOIDED. A contractor may void an unused number (wrong entry, cancelled, torn, misprint) but MUST upload a photo/scan of the physical unused CSI. Without proof, a BDM could claim "voided" and then reuse the physical copy for an off-book sale.

- S3 prefix: `erp-documents/csi-voids/{year}/{month}/`
- Upload middleware: reuses `uploadSingle('proof') + compressImage` from `backend/middleware/upload.js`
- Reader: `GET /:id/allocations/:allocIdx/voids/:voidIdx/proof` returns a 1-hour signed S3 URL
- Reasons are lookup-driven: **`ERP_CSI_VOID_REASONS`** (admin-configurable via Control Center → Lookup Tables)

### Endpoints

| Path | Gate | Purpose |
|------|------|---------|
| `GET /erp/my-csi/available` | `protect` only | **BDM self-service**: my unused CSI numbers (bypasses inventory module gate so BDMs without inventory module access still see their list during Sales Entry) |
| `GET /erp/csi-booklets` | `inventory` module + `inventory.csi_booklets` sub | List all booklets |
| `GET /erp/csi-booklets/available` | same | Admin: look up any BDM's available numbers (Rule #21 — no silent self-ID fallback) |
| `GET /erp/csi-booklets/validate` | same | Monitoring-only pre-check |
| `POST /erp/csi-booklets` | same | Create a booklet |
| `POST /erp/csi-booklets/:id/allocate` | same | Allocate a range to a BDM (dates optional) |
| `POST /erp/csi-booklets/:id/allocations/:allocIdx/void` | same + multipart proof upload | Void a number with proof image |
| `GET /erp/csi-booklets/:id/allocations/:allocIdx/voids/:voidIdx/proof` | same | Fetch signed URL for the proof image |

### Model changes (backward-compatible)

- `CsiBooklet.allocations[].week_start` / `week_end` → **optional** (were required).
- `CsiBooklet.allocations[].assigned_to` → **new**, optional. Per-allocation BDM (falls back to booklet-level `assigned_to`).
- `CsiBooklet.allocations[].voided_numbers[]` → **new**. Per-number void record with reason, proof URL, voided_by, voided_at.
- `CsiBooklet.voided_count` → **new** auto-computed in pre-save.
- `CsiBooklet.atp_number`, `bir_registration_address`, `issued_at`, `source_warehouse_id` → **new**, all optional, subscription-ready BIR metadata.
- `SalesLine.validation_warnings[]` → **new** informational-only strings.

### Wiring summary

- **Sales validate** (`salesController.validateSales`): calls `validateCsiNumber` for CSI rows, pushes to `rowWarnings`. Skips silently when `{ skipped: true }` (Iloilo BDMs).
- **Sales post** (`salesController.submitSales` + `postSaleRow` for approval-hub path): calls `markUsed` per CSI line after POSTED. Non-blocking — any booklet failure is audit-logged but never fails the post.
- **Sales reopen** (`salesController.reopenSales`): calls `unmarkUsed` so the number returns to the BDM's available pool.

### Key files

- **Backend**: `backend/erp/models/CsiBooklet.js`, `backend/erp/services/csiBookletService.js`, `backend/erp/controllers/csiBookletController.js`, `backend/erp/routes/csiBookletRoutes.js`, `backend/erp/routes/csiBookletPublicRoutes.js`, `backend/erp/routes/index.js` (mount), `backend/erp/controllers/salesController.js` (wiring), `backend/erp/controllers/lookupGenericController.js` (seed), `backend/erp/models/SalesLine.js` (validation_warnings).
- **Frontend**: `frontend/src/erp/pages/CsiBooklets.jsx`, `frontend/src/erp/pages/SalesEntry.jsx`, `frontend/src/erp/hooks/useReports.js`, `frontend/src/erp/components/WorkflowGuide.jsx`.

---

## Low-Priority Hardening — Phase H1 (April 2026)

Seven validation and error-handling improvements across CALF, COA, Expenses, and Batch Upload.

### Changes Summary

| # | Issue | Module | Fix |
|---|-------|--------|-----|
| 13 | linked_expense_line_ids not validated | CALF | Validates all line IDs belong to linked expense/logbook in createPrfCalf + validatePrfCalf |
| 14 | No account_code format validation | COA | Mongoose schema + controller enforce `/^\d{4}$/` (exactly 4 digits) |
| 15 | No normal_balance enforcement | JournalEntry | Pre-save hook blocks posting DR to CREDIT-normal accounts and vice versa (reversals exempt) |
| 16 | generateDocNumber failure saves null | PrfCalf | Pre-save hook now throws explicit error instead of saving with null doc number |
| 17 | coa_code=6900 only warns | Expenses | Changed to BLOCKED error in validateExpenses + hard gate in submitExpenses |
| 18 | Missing per-fuel CALF indicators | CarLogbook UI | Shows count badge "CALF (N)" with tooltip, per-entry status in mobile card view |
| 19 | DocumentAttachment errors swallowed | Batch Upload | Errors surfaced in response errors array with type ATTACHMENT_FAILED + summary count |

### Files Modified

**Backend:**
- `backend/erp/models/PrfCalf.js` — #16: pre-save uses next() with error on docNumber failure
- `backend/erp/models/ChartOfAccounts.js` — #14: account_code validator `/^\d{4}$/`
- `backend/erp/models/JournalEntry.js` — #15: normal_balance + is_active enforcement on POSTED
- `backend/erp/controllers/coaController.js` — #14: controller-level 4-digit check
- `backend/erp/controllers/expenseController.js` — #13: line ID validation, #17: 6900 blocking, #19: attachment error surfacing

**Frontend:**
- `frontend/src/erp/pages/CarLogbook.jsx` — #18: per-fuel-entry CALF badges (table + mobile card)
- `frontend/src/erp/components/WorkflowGuide.jsx` — Updated banners for expenses, car-logbook, prf-calf, chart-of-accounts

---

## OCR Hardening — Phase H2 (April 2026)

OCR system audit and governance compliance: lookup-driven classification, entity scoping, bug fixes, and banner compliance.

### Problem
The OCR expense classification system (Step 3: KEYWORD) used hardcoded `KEYWORD_RULES` in `expenseClassifier.js` — 20 rules mapping keywords to COA codes. This violated the "No Hardcoded Business Values" governance principle. Additionally, vendor matching in Steps 1-2 had no `entity_id` filter (cross-entity data leak), the OR parser had a comma-replacement bug for amounts >= 1M, and Layer 3 resolved data (hospital/product/vendor matches) was computed but never returned to the frontend.

### Solution — Lookup-Driven Expense Classification
- **New Lookup category**: `OCR_EXPENSE_RULES` — each entry maps keywords to a COA code and expense category via `metadata.keywords` and `metadata.coa_code`
- **Runtime loading**: `getKeywordRules(entityId)` loads from Lookup table (entity-scoped), cached for 5 minutes
- **Hardcoded fallback**: If Lookup is empty (first boot, no seeds), falls back to `HARDCODED_RULES` (identical to previous behavior)
- **Auto-seed**: Lookup entries are auto-seeded per entity on first access via `SEED_DEFAULTS` in lookupGenericController
- **Subscription-ready**: New subscribers can add/remove/modify OCR keyword rules and COA mappings in Control Center → Lookup Tables without code changes
- **Cache invalidation**: `invalidateRulesCache()` exported for use when admin updates lookups

### Bug Fixes
| # | Issue | Fix |
|---|-------|-----|
| 1 | `resolved` data (Layer 3) not returned to frontend | Added `resolved: processed.resolved` to ocrController response |
| 2 | OR parser `.replace(',', '')` only removes first comma | Changed to `.replace(/,/g, '')` — fixes amounts like "1,000,000" (8 locations) |
| 3 | Expense classifier no entity_id filter (cross-entity vendor leak) | Added `vendorFilter` with `entity_id` scoping to all VendorMaster queries |
| 4 | Empty catch blocks in ocrProcessor suppress diagnostics | Added `console.warn` for product and vendor resolution failures |
| 5 | OcrTest page used wrong WorkflowGuide pageKey ("expenses") | Changed to "ocr-test" with dedicated OCR-specific guide |
| 6 | `classifyExpense` and `classify` endpoint not passing entityId | Added `options.entityId` parameter threading from controller through processor |

### New Lookup Category
| Category | Purpose |
|----------|---------|
| `OCR_EXPENSE_RULES` | Per-entity keyword→COA mapping for OCR expense classification. 20 seeded rules covering courier, fuel, parking, travel, meals, office, utilities, transport, regulatory, IT, repairs, rent, professional fees, F&B, property. Admin-configurable in Control Center. |

### Architecture
```
OCR Pipeline (3-layer):
  Layer 1: Parser (regex + spatial) → extracted fields
  Layer 2: Expense Classification (entity-scoped)
    Step 1: EXACT_VENDOR  → VendorMaster { entity_id, vendor_name }
    Step 2: ALIAS_MATCH   → VendorMaster { entity_id, vendor_aliases }
    Step 3: KEYWORD        → Lookup { OCR_EXPENSE_RULES, entity_id } → fallback HARDCODED_RULES
    Step 4: FALLBACK       → 6900 Miscellaneous (LOW confidence)
    Step 2b: Claude AI     → Haiku fallback when Step 1-4 return LOW
  Layer 3: Master Data Resolution (entity-scoped)
    → resolveCustomer() → Customer/Hospital
    → resolveProduct() → ProductMaster
    → resolveVendor() → VendorMaster
```

### Key Files
```
backend/erp/services/expenseClassifier.js          # Lookup-driven getKeywordRules() + entity-scoped vendorFilter
backend/erp/controllers/lookupGenericController.js  # OCR_EXPENSE_RULES in SEED_DEFAULTS
backend/erp/controllers/ocrController.js            # Added resolved to response
backend/erp/controllers/classificationController.js # Pass entityId to classifyExpense + getCategories
backend/erp/ocr/ocrProcessor.js                     # entityId hoisted, passed to classifyExpense + warn logging
backend/erp/ocr/parsers/orParser.js                 # Comma-replace fix (8 locations)
frontend/src/erp/pages/OcrTest.jsx                  # Correct pageKey "ocr-test"
frontend/src/erp/components/WorkflowGuide.jsx       # New "ocr-test" guide entry
```

## OCR Scan-to-Fill Enhancements (April 2026)

### Sales CSI Photo Persistence
The SalesEntry OCR scan captured CSI photos and uploaded to S3, but the URL was dropped before reaching the database:
- **Model**: Added `csi_photo_url` and `csi_attachment_id` to SalesLine schema
- **Frontend**: `handleScanApply` now carries photo URL; `saveAll` includes it in payload
- **Approval Hub**: SALES approval cards now display CSI document thumbnail (clickable → full-screen preview)
- **Universal Approval Service**: SALES query returns `csi_photo_url` in details

### Collection CR Scan Auto-Fill (`ScanCRModal`)
CollectionSession already uploaded CR photos via OCR but discarded extracted data. Now scanning a CR auto-fills the entire form:
- **"Scan CR to Auto-Fill" button** in page header opens ScanCRModal
- **Hospital fuzzy matching**: OCR "Received from" text → `matchHospital()` against hospital master → auto-selects hospital
- **CR details auto-fill**: CR#, date, amount, payment mode, check#, bank
- **CSI deferred matching**: Extracted CSI numbers are stashed in `pendingCsiMatch` ref; after hospital change triggers open CSI loading, `matchCsis()` auto-selects matching invoices
- **Step 4 CR photo upload**: Also triggers auto-fill when form is empty (no separate scan needed)
- **OCR badges**: Green "OCR" badges on auto-filled field labels so user knows what came from scan
- **Review flow**: Confidence badges (HIGH/MEDIUM/NONE) per field; review acknowledgment required for LOW confidence

### CHECK Payment Bug Fix
`checkNo`, `checkDate`, `bank` state variables had no setters (read-only). Fixed + added visible CHECK-specific input fields in Step 3.

### Shared OCR Matching Utilities
Extracted from SalesEntry into `frontend/src/erp/utils/ocrMatching.js`:
- `normalizeStr`, `matchHospital`, `matchProduct`, `fieldVal`, `fieldConfidence` — shared between SalesEntry and CollectionSession
- `matchCsis` — new: matches OCR-extracted CSI numbers against open invoices by `doc_ref`
- `parseCrDate` — new: normalizes OCR date strings ("03-04 20", "March 31, 2026") to YYYY-MM-DD
- `formatReviewReason` — generic review reason labels

### Key Files
```
frontend/src/erp/utils/ocrMatching.js                # Shared OCR matching utilities
frontend/src/erp/pages/CollectionSession.jsx          # ScanCRModal, auto-fill handler, deferred CSI matching
frontend/src/erp/pages/SalesEntry.jsx                 # Refactored to import from ocrMatching.js
frontend/src/erp/pages/ApprovalManager.jsx            # CSI photo display in SALES approval cards
backend/erp/models/SalesLine.js                       # Added csi_photo_url, csi_attachment_id fields
backend/erp/services/universalApprovalService.js      # SALES details include csi_photo_url
```

## Customer Collection Hardening + autoJournal Extraction — Phase H3 (April 2026)

Phase 18 added `customer_id` as an alternative to `hospital_id` for Sales and Collections, but several backend code paths still assumed hospital-only. This phase completes the customer collection wiring.

### Bug Fixes
| # | Severity | File | Fix |
|---|----------|------|-----|
| 1 | HIGH | autoJournal.js:146 | `journalFromSale()` used non-existent `invoice_date` — changed to `csi_date` (model field) |
| 2 | CRITICAL | collectionController.js:182 | CSI validation query hardcoded `hospital_id` — now builds query dynamically for hospital OR customer |
| 3 | CRITICAL | arEngine.js + collectionController.js:208 | AR balance check only accepted hospitalId — added `getArBalance(entityId, hospitalId, customerId)` |
| 4 | MEDIUM | collectionController.js:321,734 | TransactionEvent payload now includes `customer_id` for audit trail |
| 5 | MEDIUM | collectionController.js:463,805 | VAT status lookup now checks Customer model when hospital_id is absent |

### Refactoring
- Extracted inline PRF/CALF journal logic from `expenseController.js` (batch submit + approval hub single post) into shared `journalFromPrfCalf()` in `autoJournal.js`
- PRF: DR PARTNER_REBATE (5200), CR funding source
- CALF: DR AR_BDM (1110), CR funding source
- Both `submitPrfCalf` and `postSinglePrfCalf` now use the shared function

### Opening AR Recap
- Sales with `csi_date < user.live_date` are auto-routed as OPENING_AR (source field)
- OPENING_AR: skips inventory deduction and COGS journal — only Revenue JE created
- OPENING_AR CSIs are fully collectable via Collections (no special handling needed)
- Collections enforce one-target constraint: all settled CSIs must match the CR's hospital_id OR customer_id

### Key Files
```
backend/erp/services/autoJournal.js          # Fixed csi_date, added journalFromPrfCalf()
backend/erp/services/arEngine.js             # Added getArBalance() (hospital OR customer)
backend/erp/controllers/collectionController.js  # CSI validation, AR balance, TransactionEvent, VAT lookup
backend/erp/controllers/expenseController.js     # Refactored PRF/CALF journal to use shared function
frontend/src/erp/components/WorkflowGuide.jsx    # Updated collection-session + prf-calf tips
```

---

## OCR Vendor Auto-Learn — Phase H5 (April 2026)

Closes the loop on Phase H3+H4: when Claude successfully classifies an OR/gas receipt that the regex classifier didn't recognise, the result was previously used once and discarded, so the next receipt from the same vendor re-paid for another Claude call. Phase H5 captures the win as training data — either by appending the OCR text variation to a similar existing vendor's aliases (next scan hits `ALIAS_MATCH`) or by creating a new `VendorMaster` entry flagged for admin review (next scan hits `EXACT_VENDOR`).

### Governing principle
- **Self-improving, admin-reviewable**: the classifier gets smarter with usage, but every auto-learned vendor starts at `learning_status: 'UNREVIEWED'` so admin can approve/reject. Rejection deactivates the vendor (is_active = false) without deleting it — the audit trail is preserved.
- **Subscription-safe**: strictly entity-scoped via `entity_id` filter. No cross-tenant learning. Per-entity toggle `OcrSettings.vendor_auto_learn_enabled` (default ON) lets subscribers opt out.
- **Non-destructive**: never overwrites an existing vendor's `default_coa_code` (admin-set values win); only appends unique aliases.

### Guardrails (all must pass or action = 'SKIPPED')
Guardrails are **lookup-driven per-entity** (5-min cache, fallbacks only on fresh install). Admins tune them from Control Center → Lookup Tables — `VENDOR_AUTO_LEARN_BLOCKLIST` (generic words to skip) and `VENDOR_AUTO_LEARN_THRESHOLDS` (name length, snippet cap). Changes take effect within 5 minutes of save; `invalidateGuardrailCache()` is wired into all lookup create/update/delete hooks.

1. `entity_id` must be non-null
2. `supplier_name` length ≥ MIN_NAME_LEN, ≤ MAX_NAME_LEN, not purely numeric (defaults 3 / 120; admin-tunable)
3. Name not in the blocklist (defaults: RECEIPT, INVOICE, UNKNOWN, CASHIER, … 23 entries; admin-editable per-entity)
4. Claude `confidence` must be HIGH or MEDIUM (never learn from LOW)
5. Claude must return a `coa_code` — a vendor without COA is noise

### Wiring (Pipeline)
```
orParser / gasReceiptParser
  → classifyExpense (regex cascade EXACT → ALIAS → KEYWORD → FALLBACK)
    → Layer 2b: Claude (LOW classification OR missing fields)
      → Phase H5: vendorAutoLearner.learnFromAiResult()
        ├─ similar vendor exists → $addToSet on vendor_aliases
        └─ no match → VendorMaster.create({ auto_learned_from_ocr: true, learning_status: 'UNREVIEWED' })
```

### Data Model Changes
- **VendorMaster**: `auto_learned_from_ocr`, `learning_source` (CLAUDE_AI|MANUAL|IMPORT), `learned_at`, `learning_status` (UNREVIEWED|APPROVED|REJECTED), `learning_meta` (source_doc_type, source_ocr_text, source_raw_snippet, ai_confidence, suggested_coa_code, suggested_category, learn_count). Composite index on `(entity_id, auto_learned_from_ocr, learning_status, learned_at)` for fast review-queue queries.
- **OcrSettings**: `vendor_auto_learn_enabled` (default true).
- **OcrUsageLog**: `vendor_auto_learned` (bool) + `vendor_auto_learn_action` (NONE|CREATED|ALIAS_ADDED|SKIPPED) for telemetry.

### API
- `GET /api/erp/vendor-learnings?status=UNREVIEWED` — admin review queue (entity-scoped; president sees all entities).
- `GET /api/erp/vendor-learnings/:id` — single entry with populated audit fields.
- `PATCH /api/erp/vendor-learnings/:id` — action: APPROVE | REJECT | UNREVIEW. Optional inline edits: `vendor_name`, `default_coa_code`, `default_expense_category`, `vendor_aliases`. REJECT sets `is_active = false` so the classifier stops matching it.
- `GET /api/erp/ocr-settings/usage` — now returns `auto_learn: { CREATED, ALIAS_ADDED, SKIPPED }` counters.
- All routes require `roleCheck('admin','finance','president')`.

### UI
- ErpOcrSettingsPanel adds a 5th master-switch toggle `Vendor Auto-Learn (Claude wins)` alongside AI fallback / field completion / preprocessing.
- New stat card "Vendor Auto-Learn (all time)" shows CREATED / ALIAS_ADDED / SKIPPED counts from `OcrUsageLog`.
- DependencyBanner (`ocr-settings`) explains both toggle states + references the Auto-Learned Queue.
- **VendorList.jsx** — `Learning Queue (n)` filter chip, `AI-learned` row badge (purple), `Review` row action (only when UNREVIEWED). Modal `VendorLearningReviewModal.jsx` shows Claude's raw snippet + suggested COA (with "use this" link) + COA dropdown (reuses `useAccounting().listAccounts`, filtered to `EXPENSE` type). Three actions: Reject / Approve / Edit + Approve.
- **ControlCenter `DEPENDENCY_GUIDE['lookups']`** — new entry for `VENDOR_AUTO_LEARN_BLOCKLIST / VENDOR_AUTO_LEARN_THRESHOLDS` explaining per-entity tuning and 5-min cache semantics.
- **WorkflowGuide `vendor-list`** — 4th step + tip explaining the review queue and where to toggle the learner / edit the blocklist.

### Key Files
```
backend/erp/services/vendorAutoLearner.js        # learnFromAiResult() + getGuardrails() per-entity cached lookup reader + fallbacks
backend/erp/models/VendorMaster.js               # +5 fields for auto-learn tracking
backend/erp/models/OcrSettings.js                # +vendor_auto_learn_enabled toggle
backend/erp/models/OcrUsageLog.js                # +vendor_auto_learned + vendor_auto_learn_action
backend/erp/ocr/ocrProcessor.js                  # Layer 2b invokes learner after Claude win
backend/erp/controllers/ocrController.js         # Threads flag + logs action to usage
backend/erp/controllers/ocrSettingsController.js # Extended allowed list + auto_learn counters
backend/erp/controllers/vendorLearningController.js  # list/getOne/review
backend/erp/controllers/lookupGenericController.js   # VENDOR_AUTO_LEARN_* seeds + invalidateGuardrailCache() hooks
backend/erp/routes/vendorLearningRoutes.js       # admin/finance/president guard
backend/erp/routes/index.js                      # Mount at /api/erp/vendor-learnings
frontend/src/erp/pages/ErpOcrSettingsPanel.jsx   # Toggle + stat card
frontend/src/erp/pages/VendorList.jsx            # H5.10 — Learning Queue chip, AI-learned badge, Review row action
frontend/src/erp/components/VendorLearningReviewModal.jsx  # H5.10 — review modal with COA dropdown
frontend/src/erp/components/WorkflowGuide.jsx    # vendor-list step + tip for review queue
frontend/src/erp/services/ocrService.js          # list/get/review vendor learnings
frontend/src/erp/hooks/useAccounting.js          # Reused for COA dropdown in modal
frontend/src/erp/pages/ControlCenter.jsx         # DEPENDENCY_GUIDE entries (incl. VENDOR_AUTO_LEARN_* lookups)
```

### Verified
- Syntax check pass on 10 backend files + 3 frontend files
- Require-graph load test (all models, controllers, routes import cleanly)
- Learner unit tests: 8 scenarios (CREATED, ALIAS_ADDED manual + auto-learned, 5 SKIPPED paths including ALIAS_EXISTS, NO_ENTITY, LOW_CONFIDENCE, INVALID_NAME, NO_COA)
- Integration test through `processOcr`: CREATED when no existing, ALIAS_ADDED when similar vendor exists, learner disabled when toggle off, learner not invoked when Claude not fired


---

## President Reversal Console — Phase 31 (April 2026)

Cross-module SAP Storno dispatch UI + service for the President. Replaces the per-module
"approve deletion" trickle with one place to view, audit, and reverse any POSTED
document across Sales, Collections, Expenses, CALF/PRF, GRN, IC Transfers, DR/Consignment,
Income Reports, Payroll, Petty Cash, and manual Journal Entries.

### Architecture

- **Service**: `backend/erp/services/documentReversalService.js`
  - `REVERSAL_HANDLERS` registry — one entry per doc type. Adding a new module = add
    one entry. The cross-module list and the type-filter dropdown are populated from
    this registry, so new modules appear automatically.
  - `presidentReverse({ doc_type, doc_id, reason, user, tenantFilter })` — master
    entrypoint. Loads the doc, runs the dependent-doc blocker, reverses linked JEs,
    creates a reversal `TransactionEvent`, performs domain-specific side effects
    (inventory restore, AR/AP void, petty cash voiding, etc.), and stamps
    `deletion_event_id` on the original.
  - `listReversibleDocs({ doc_types, entityId, fromDate, toDate, page, limit })` —
    cross-module list of POSTED docs eligible for reversal.
  - `listReversalHistory({ entityId, doc_type, fromDate, toDate, page, limit })` —
    audit-log feed of `PRESIDENT_REVERSAL` entries.
  - `previewDependents({ doc_type, doc_id, tenantFilter })` — non-mutating preflight
    so the UI can warn before the user clicks Reverse.
  - `buildPresidentReverseHandler(docType)` — Express handler factory used by every
    per-module controller (avoids 12× copies of the same wrapper).

- **Dependent blocker**: `backend/erp/services/dependentDocChecker.js`
  - One checker per doc type. GRN blocks if any qty_out InventoryLedger entry against
    the GRN's batches resolves to a POSTED non-reversed downstream doc. IC Transfer
    blocks if target-entity SalesLines consumed transferred inventory. DR blocks if
    any conversions exist. CALF blocks if linked Expense or IncomeReport (auto-pulled
    CASH_ADVANCE) is POSTED. Sales blocks if a POSTED Collection settled the CSI.

- **Period-lock landing check**: every reverse asserts the *current* period is open
  for the relevant module before it can land reversal entries. Original period is
  never modified.

- **Controller**: `backend/erp/controllers/presidentReversalController.js`
  - `GET /erp/president/reversals/registry` — drives the type filter dropdown.
  - `GET /erp/president/reversals/reversible` — paginated cross-module list.
  - `GET /erp/president/reversals/history` — paginated audit log.
  - `GET /erp/president/reversals/preview/:doc_type/:doc_id` — dependent preflight.
  - `POST /erp/president/reversals/reverse` — central dispatch; same SAP Storno path
    as per-module endpoints.

- **Frontend**: `frontend/src/erp/pages/PresidentReversalsPage.jsx`
  - Two tabs (Reversible Transactions / Reversal History), filters (type/date),
    type badges per doc kind, "Reverse…" button opens `PresidentReverseModal` which
    prompts for reason + DELETE confirmation. Sidebar link: "Reversal Console" under
    Administration. Route: `/erp/president/reversals` (MANAGEMENT roles).

### Sub-Permissions (lookup-driven, subscription-ready)

| Sub-Permission              | Lookup Code                          | Used For                                     |
|-----------------------------|--------------------------------------|----------------------------------------------|
| `accounting.reverse_posted` | `ACCOUNTING__REVERSE_POSTED`         | Per-module president-reverse endpoints + central reverse |
| `accounting.reversal_console` | `ACCOUNTING__REVERSAL_CONSOLE`     | Read-only access to the cross-module Console (list/history/preview) |

President auto-passes both. Subscribers configure other roles via Access Templates —
no code changes needed per tenant.

### Wired Per-Module Routes

| Module       | Route                                                    | Controller Function                |
|--------------|----------------------------------------------------------|------------------------------------|
| Sales        | `POST /api/erp/sales/:id/president-reverse`              | `salesController.presidentReverseSale` |
| Collection   | `POST /api/erp/collections/:id/president-reverse`        | `collectionController.presidentReverseCollection` |
| Expense      | `POST /api/erp/expenses/ore-access/:id/president-reverse`| `expenseController.presidentReverseExpense` |
| CALF / PRF   | `POST /api/erp/expenses/prf-calf/:id/president-reverse`  | `expenseController.presidentReversePrfCalf` (auto-routes by doc_type) |
| GRN          | `POST /api/erp/inventory/grn/:id/president-reverse`      | `inventoryController.presidentReverseGrn` |
| IC Transfer  | `POST /api/erp/transfers/:id/president-reverse`          | `interCompanyController.presidentReverseIcTransfer` |
| DR / Consignment | `POST /api/erp/consignment/dr/:id/president-reverse` | `consignmentController.presidentReverseDr` |
| Income       | `POST /api/erp/income/:id/president-reverse`             | `incomeController.presidentReverseIncome` |
| Payroll      | `POST /api/erp/payroll/:id/president-reverse`            | `payrollController.presidentReversePayslip` |
| Petty Cash   | (via central console)                                    | `documentReversalService` registry: `PETTY_CASH_TXN` |
| Manual JE    | (via central console)                                    | `documentReversalService` registry: `JOURNAL_ENTRY` |

### Schema Additions

Added `deletion_event_id: ObjectId` (and `reopen_count` where missing) to:
`GrnEntry`, `InterCompanyTransfer`, `PrfCalf`, `IncomeReport`, `Payslip`, `ExpenseEntry`.
`Payslip` also gained `event_id` (reverse handler falls back to JE lookup when missing for legacy rows).
`GrnEntry.status` enum extended with `DELETION_REQUESTED`.

### UX Polish (Phase 6)

`?include_reversed=true` query parameter on list endpoints opts back into showing reversed
rows; default behavior hides them (filter: `deletion_event_id: { $exists: false }`).
Wired into: `getSales`, `getCollections`, `getExpenseList`, `getPrfCalfList`,
`getGrnList`, `getTransfers`, `getIncomeList`, `getPayrollStaging`.

### Common Gotchas (Phase 31)

- **Reversal lands in current period** — if the current month is locked for the
  relevant module key (`PERIOD_LOCK_MODULE` map in documentReversalService), reversal
  is refused with HTTP 403. Unlock the period or wait. Original period is never touched.
- **Idempotent JE reversal** — `reverseLinkedJEs()` skips JEs that already have a
  `corrects_je_id` pointer, so partial-failure retries succeed cleanly.
- **IC Transfer is dual-event** — handler reverses BOTH `source_event_id` and
  `target_event_id`, with separate inventory restoration on each side.
- **DR/Consignment has no JE/event** — handler hard-deletes the tracker row when
  `qty_consumed === 0`; otherwise blocks with the dependent-doc error.
- **The collectionController.approveDeletion path is a partial reversal** (does not
  void petty cash deposit, does not clean up VAT/CWT). For complete reversal, use
  the President Console (which calls `documentReversalService.reverseCollection`).
- **CALF/PRF share one route** (`/prf-calf/:id/president-reverse`) — wrapper peeks
  at `doc_type` and dispatches to the matching handler.

### Shared Detail Panel + Universal Approval Coverage (Phase 31 extension, April 2026)

Two hubs, one detail layer, one coverage invariant.

**Backend**
- `backend/erp/services/documentDetailBuilder.js` — shared per-module detail
  builders (pure functions). Used by BOTH `universalApprovalService.getUniversalPending()`
  (Approval Hub) and `presidentReversalController.getDetail` (Reversal Console).
  17 modules registered: 12 existing (SALES, COLLECTION, EXPENSES, PRF_CALF, INCOME,
  INVENTORY/GRN, PAYROLL, KPI, DEDUCTION_SCHEDULE, SMER, CAR_LOGBOOK, PERDIEM_OVERRIDE)
  + 5 new for the coverage gap (IC_TRANSFER, JOURNAL, BANKING, PURCHASING, PETTY_CASH).
- `REVERSAL_DOC_TYPE_TO_MODULE` map — translates REVERSAL_HANDLERS doc_type
  (SALES_LINE, PAYSLIP, etc.) to the approval module key (SALES, PAYROLL, etc.)
  so the same builder serves both hubs.

**Coverage invariant (see `docs/APPROVAL_COVERAGE_AUDIT.md`).** Every `gateApproval()`
call site must have a matching `MODULE_QUERIES` entry, otherwise the pending doc
silently generates an ApprovalRequest that never surfaces to an approver.
Phase 31 extension closed the 5 gaps identified by the audit.

**How gap-module queries work.** The 5 new entries use `buildGapModulePendingItems()`
helper: queries `ApprovalRequest` filtered by `{module, status: 'PENDING'}`, batches
doc-hydration per docType using the appropriate model, then runs the shared detail
builder. This pattern means adding a 6th gap module = one more entry, no new code.

**Frontend**
- `frontend/src/erp/components/DocumentDetailPanel.jsx` — shared renderer. Two
  modes: `mode="approval"` (inline line-edit UI, Edit buttons per row based on
  `APPROVAL_EDITABLE_LINE_FIELDS` lookup) and `mode="reversal"` (read-only,
  clickable image previews only).
- `frontend/src/erp/pages/ApprovalManager.jsx` — replaced 380 lines of inline
  per-module JSX with one `<DocumentDetailPanel />` call.
- `frontend/src/erp/pages/PresidentReversalsPage.jsx` — expandable rows with
  lazy detail fetch via `GET /api/erp/president/reversals/detail/:doc_type/:doc_id`,
  result cached client-side per `${doc_type}:${doc_id}` key.

**Lifecycle signal.** A doc's path is now fully visible end-to-end:
`Submit → Approval Hub (rich detail) → approve (leaves hub, count decrements)
→ POSTED → Reversal Console (same rich detail, read-only) → reverse (optional)`.
Every module that blocks posting via `gateApproval()` surfaces in the inbox.
The Reversal Console matches the detail fidelity of the Approval Hub.

### Common Gotchas (Phase 31 extension)

- **Detail builders are pure — no DB calls inside.** Callers hydrate the doc
  (populate, lean) then pass to the builder. This lets the reversal detail
  endpoint reuse the SAME builder without running duplicate queries.
- **Gap modules carry data in ApprovalRequest, not on the doc itself.** The
  gap-module pattern reads ApprovalRequest.module=PENDING, maps doc_id to the
  source model, hydrates. If a batch docType has no single doc (DEPRECIATION,
  INTEREST — doc_id is the entity_id), the `fallbackToRequest: true` flag on
  the helper passes the ApprovalRequest itself to the builder.
- **Approval Hub progress signal depends on items leaving on approve.** Do
  NOT move POSTED docs back into the inbox — they belong in the Reversal
  Console for audit. The two hubs serve DIFFERENT stages of the same
  document lifecycle.


---

## Phase G6 — Approval Hub Rejection Feedback (closed loop)

### Why this exists
When an approver rejects a document via the Approval Hub (e.g., a CAR LOGBOOK with note 'wrong entry, per diem is 800'), the contractor previously had no way to see the reason from their module page. 13 modules already wrote `rejection_reason` to the doc; 8 modules routed through the generic `approval_request` handler so the reason lived only on `ApprovalRequest.decision_reason`. Phase G6 closes the loop across all 21 `gateApproval()` modules.

### Architecture (lookup-driven, subscription-ready)
- **Lookup category** `MODULE_REJECTION_CONFIG` (per-entity, lazy-seeded) — each row stores `{ rejected_status, reason_field, resubmit_allowed, editable_statuses, banner_tone, description }`. President can edit any row in Control Center → Lookup Tables without code change. Adding a 21st module = one new lookup row + one frontend page wiring + one backend handler entry. Source-of-truth: `backend/erp/controllers/lookupGenericController.js` SEED_DEFAULTS.
- **Helper** `approvalService.getModuleRejectionConfig(entityId, moduleKey)` — same lazy-seed pattern as Phase G4 `getModulePostingRoles()`. Auto-seeds on first read.
- **Component** `frontend/src/erp/components/RejectionBanner.jsx` — variants `row` (inline compact) and `page` (full banner with Fix & Resubmit button). Returns null when status doesn't match the configured `rejected_status` so it's safe to mount anywhere.
- **Hook** `frontend/src/erp/hooks/useRejectionConfig.js` — wraps `useLookupOptions('MODULE_REJECTION_CONFIG')`, returns `{ config }` for the component.
- **Workflow guidance** `frontend/src/erp/components/WorkflowGuide.jsx` — `PAGES_WITH_REJECTION_FLOW` Set drives a shared red footer note on every module page that's wired for rejection. No per-page editing required to keep guidance in sync.

### Group A vs Group B
- **Group A (13 modules)** — already had dedicated reject handlers in `universalApprovalController.approvalHandlers`. Each writes `status = ERROR | REJECTED | RETURNED` + `rejection_reason | return_reason` directly on the source doc. Phase G6 only added the frontend banner.
- **Group B (7 modules)** — Phase G6.7 added new dedicated reject handlers for PURCHASING, JOURNAL, BANKING, IC_TRANSFER (covers both InterCompanyTransfer + IcSettlement), PETTY_CASH, SALES_GOAL_PLAN, INCENTIVE_PAYOUT. All routed through one shared `buildGroupBReject()` function — adding a new module = one wrapper + one lookup row.

### Group B model schema additions
For every Group B model, the following fields were added (additive only, no removals):
- `status` enum: appended `REJECTED` value
- `rejection_reason: { type: String, trim: true, default: '' }`
- `rejected_by: { type: ObjectId, ref: 'User' }`
- `rejected_at: { type: Date }`

### Rule #20 / Rule #21 protections
- Group B handlers refuse to demote terminal-state docs (POSTED/CLOSED/PAID/REVERSED) — must reverse instead. Period locks remain on submit/post routes; rejection does NOT touch the ledger.
- Handlers accept `id` as either ApprovalRequest._id (gap module path) OR source-doc id directly (fallback). The Hub's `buildGapModulePendingItems` passes `id: req._id` (request, not doc) — handler dereferences via `req.doc_id` and the lookup-driven `modelByDocType` map.
- gateApproval call sites unchanged (baseline 31).

### Verification — `npm run verify:rejection-wiring`
Runs `backend/scripts/verifyRejectionWiering.js` (pure static analysis, no DB connection). Exits 1 on:
1. MODULE_REJECTION_CONFIG row missing source-doc model with the rejected_status in any status enum or the reason_field as a String schema path.
2. (Warning) MODULE_REJECTION_CONFIG row missing matching MODULE_DEFAULT_ROLES seed (G4 ↔ G6 drift).
3. (Warning) Module key not referenced by any frontend page importing RejectionBanner.
4. TYPE_TO_MODULE entry without a matching approvalHandlers handler.

### Common Gotchas (Phase G6)
- **Lookup field-name drift**: DeductionSchedule's source field is `reject_reason` (not `rejection_reason`). The lookup row's `reason_field` was set to match the existing model — the lookup handles the difference, no model migration needed (Rule #3 spirit). New modules can pick either name as long as the seed matches the model.
- **"Fix & Resubmit" semantics**: Banner button calls `onResubmit(row)`. For inline list+form pages this opens the form (`handleEdit`). For pages with separate edit routes, navigate via React Router. For Collections (no edit-by-id route), Resubmit calls `handleValidate([row._id])` to re-run validation. Per-page choice — the banner is callback-driven.
- **Group B id semantics**: When the Approval Hub passes a Group B reject, `id` is the ApprovalRequest._id (not the source doc id). `buildGroupBReject` looks up the request first, dereferences `doc_id`, then loads the source model. Direct calls (id = source doc) still work via the fallback path.
- **IC_TRANSFER covers two models**: The IC_TRANSFER lookup row + handler covers both InterCompanyTransfer AND IcSettlement via the `modelByDocType` map (`IC_TRANSFER → InterCompanyTransfer`, `IC_SETTLEMENT → IcSettlement`). One module key, two physical docs.

---

## Phase G7 — President's Copilot, Spend Caps, Daily Briefing, Cmd+K (April 2026)

**Goal**: Give the President a chat-driven cockpit that wraps every ERP capability in natural-language tool-use. Reads anything in scope; writes only with explicit confirmation. Lookup-driven so subscribers can disable any tool, edit prompts, set spend caps, and add new tools without code changes.

### Architecture (lookup-driven, subscription-ready)

| Layer | File | Lookup category | Purpose |
|---|---|---|---|
| Tool registry | `backend/erp/services/copilotToolRegistry.js` | `COPILOT_TOOLS` | Static `handler_key → JS function` map. Adding a new tool = new lookup row + register one handler. |
| Chat runtime | `backend/erp/services/copilotService.js` | `AI_COWORK_FEATURES.PRESIDENT_COPILOT` | System prompt, model, role gate, rate limit, max chat turns — all from the lookup row. Tool-use loop with recursion cap (`max_chat_turns`, hard ceiling 12). |
| Spend cap | `backend/erp/services/spendCapService.js` | `AI_SPEND_CAPS.MONTHLY` | `enforceSpendCap(entityId, featureCode)` is called BEFORE every Anthropic API call by approvalAiService + copilotService. Per-feature overrides win. Defaults `is_active: false` so existing entities aren't blocked on first deploy. |
| Endpoints | `backend/erp/controllers/copilotController.js` | — | `POST /chat`, `POST /execute`, `GET /status`, `GET /usage`. Mounted at `/api/erp/copilot` in `erp/routes/index.js`. |
| Widget | `frontend/src/erp/components/PresidentCopilot.jsx` | — | Floating bottom-right button on `/erp/*`. Self-hides when widget_enabled=false (lookup gate). 400×600 panel; fullscreen on <768px. Persists last 20 messages in sessionStorage per entity. |
| Cmd+K palette | `frontend/src/erp/components/CommandPalette.jsx` | — | Global Ctrl/Cmd+K. Single-input overlay → POST /chat with `mode='quick'`. Auto-navigates if NAVIGATE_TO is the chosen tool. |
| Daily briefing | `backend/agents/dailyBriefingAgent.js` | `AI_COWORK_FEATURES.PRESIDENT_DAILY_BRIEFING` | Reuses the Copilot infra. Cron 7:00 AM Mon-Fri Manila. Posts to MessageInbox (category=`briefing`) for each entity that has both PRESIDENT_COPILOT and PRESIDENT_DAILY_BRIEFING enabled. |
| Management UI | `frontend/src/erp/pages/AgentSettings.jsx` | — | New tabs: **Copilot Tools** (toggle/edit each tool row) + **AI Budget** (cap, threshold, action). |

### Seeded starter tools (9, all lookup rows)

| Code | Type | Handler | Purpose |
|---|---|---|---|
| `LIST_PENDING_APPROVALS` | read | `listPendingApprovals` | Wraps `getUniversalPending`. |
| `SEARCH_DOCUMENTS` | read | `searchDocuments` | Cross-module text search across 11 collections. |
| `SUMMARIZE_MODULE` | read | `summarizeModule` | Aggregate counts/totals over today/week/month/ytd/custom range. |
| `EXPLAIN_REJECTION` | read | `explainRejection` | Returns reason + history chain for any doc in scope. |
| `NAVIGATE_TO` | read | `navigateTo` | Returns URL + filters; UI auto-navigates (also drives Cmd+K). |
| `COMPARE_ENTITIES` | read | `compareEntities` | President-only cross-entity rollup. |
| `DRAFT_REJECTION_REASON` | write_confirm | `draftRejectionReason` | Preview returns draft + confirmation_payload. Execute calls `universalApprovalController.approvalHandlers[type]` — same path `/universal-approve` uses (Rule #20 compliant). |
| `DRAFT_MESSAGE` | write_confirm | `draftMessage` | Preview returns draft. Execute writes to `MessageInbox` model. |
| `DRAFT_NEW_ENTRY` | write_confirm | `draftNewEntry` | Returns prefilled form route. UI navigates; user reviews + submits via existing form (Rule #20). |

### Lookup configuration shapes

**`COPILOT_TOOLS` row metadata**:
```js
{
  tool_type: 'read' | 'write_confirm',
  handler_key: 'listPendingApprovals',          // must match copilotToolRegistry.HANDLERS
  json_schema: { name, description, input_schema },  // Claude tool-use shape
  allowed_roles: ['president', 'admin'],
  description_for_claude: '...',                // appended to JSON schema description
  confirmation_template: '...',                 // mustache for write_confirm UI
  entity_scoped: true,
  rate_limit_per_min: 30,
}
```

**`AI_COWORK_FEATURES.PRESIDENT_COPILOT` metadata**:
```js
{
  surface: 'copilot',
  system_prompt: '...',                         // top-level system prompt for /chat
  quick_mode_prompt: '...',                     // appended when mode='quick' (Cmd+K)
  model: 'claude-sonnet-4-6',
  max_tokens: 1200, temperature: 0.3,
  allowed_roles: ['president', 'ceo'],
  rate_limit_per_min: 30,
  max_chat_turns: 8,                            // tool-use loop cap (hard ceiling 12)
  history_persist: 'session',
}
```

**`AI_SPEND_CAPS.MONTHLY` metadata**:
```js
{
  monthly_budget_usd: 150,
  notify_at_pct: 80,
  action_when_reached: 'disable' | 'warn_only',
  notify_channels: ['dashboard_banner'],
  feature_overrides: {
    OCR: { monthly_budget_usd: 30, action_when_reached: 'disable' }
  },
}
```

### Rule #20 / Rule #21 / Rule #3 protections

- **Rule #20 (no bypass)**: Write-confirm execute paths route through existing controllers — `DRAFT_REJECTION_REASON` calls `universalApprovalController.approvalHandlers[type]` (same logic `/universal-approve` uses, including terminal-state guard); `DRAFT_MESSAGE` writes via the `MessageInbox` model. **No** Copilot handler implements its own period-lock or gateApproval logic.
- **Rule #21 (no silent self-id fallback)**: All handlers derive `entity_id` from `ctx.entityId` (= `req.entityId`). The verifyCopilotWiring script greps for the anti-pattern `args.entity_id` and fails the build if found. `compareEntities` is the only multi-entity tool; it uses `ctx.entityIds` (= `req.user.entity_ids`) and is gated to privileged roles.
- **Rule #3 (lookup-driven)**: Tool list, prompts, models, role gates, rate limits, spend caps — all in lookup rows. President can disable any tool, change any prompt, raise/lower the cap from Control Center → AI Budget tab without code change.

### Spend cap enforcement points

- `approvalAiService.invokeAiCoworkFeature` — calls `checkSpendCap(entityId, row.code)` BEFORE the Claude API call. On 429, logs `skipped_reason: SPEND_CAP_EXCEEDED` to `AiUsageLog` and returns the friendly cap message.
- `copilotService.runChat` — calls `enforceSpendCap(entityId, 'PRESIDENT_COPILOT')` once per chat turn (before the first Claude call). Daily Briefing inherits this enforcement.
- `copilotService.executeConfirmation` — re-checks the cap at execute time so a payload created earlier in the day can't blow past a cap that was lowered after.

### Audit trail

- **Per Claude turn**: `AiUsageLog` row with `feature_code` = `PRESIDENT_COPILOT` (chat) / `PRESIDENT_DAILY_BRIEFING` (briefing) / one of the AI_COWORK_FEATURES codes (cowork). Includes input/output tokens, cost_usd, latency_ms.
- **Per tool invocation**: `AiUsageLog` row with `feature_code` = `copilot:<TOOL_CODE>` (e.g., `copilot:LIST_PENDING_APPROVALS`). Used by per-tool rate limiting AND the Copilot Tools tab usage breakdown.
- **Per tool call (human-readable)**: `ErpAuditLog` row with `log_type: 'COPILOT_TOOL_CALL'`, `target_ref` = tool code, `note` includes args + duration. Phase G7 added three enum values: `COPILOT_TOOL_CALL`, `AI_BUDGET_CHANGE`, `AI_COWORK_CONFIG_CHANGE` — without these, audit writes fail silently against the existing strict enum.

### Verification — `npm run verify:copilot-wiring`

`backend/scripts/verifyCopilotWiring.js` runs 23 static checks:

1. Every `COPILOT_TOOLS` seed has a registered handler in `copilotToolRegistry.HANDLERS`.
2. Every registered handler has a matching seed (no orphans).
3. `PRESIDENT_COPILOT` row has `system_prompt` (≥50 chars) + `model`.
4. `AI_SPEND_CAPS.MONTHLY` has `monthly_budget_usd > 0` + valid `action_when_reached`.
5. `copilotService` imports + calls `spendCapService` (cap enforced).
6. `approvalAiService` imports + calls `spendCapService` (cap enforced).
7. `ErpAuditLog` enum extended with `COPILOT_TOOL_CALL`, `AI_BUDGET_CHANGE`, `AI_COWORK_CONFIG_CHANGE`.
8. `erp/routes/index.js` mounts `/copilot` and `/ai-cowork`.
9. `App.jsx` references `PresidentCopilot` + `CommandPalette`.
10. `copilotToolRegistry` imports `universalApprovalController` (DRAFT_REJECTION_REASON routes through canonical reject path — Rule #20).
11. `copilotToolRegistry` imports `MessageInbox` model (DRAFT_MESSAGE actually sends).
12. `copilotToolRegistry` doesn't reference `args.entity_id` (Rule #21).
13. Frontend services use `/erp/...` not `/api/erp/...` (regression guard for the pre-G7 baseURL bug).

Run via: `npm run verify:copilot-wiring` (also added to `package.json` scripts alongside `verify:rejection-wiring`).

### Frontend wiring summary

```
App.jsx
└── ErpAddons (renders only on /erp/*)
    ├── PresidentCopilot (floating widget)
    │   ├── useCopilot hook (chat state, sessionStorage persistence)
    │   └── services/copilotService.js → /api/erp/copilot/{status,chat,execute}
    └── CommandPalette (global Ctrl/Cmd+K)
        └── services/copilotService.js (same)
```

### Daily Briefing wiring

```
agentScheduler.js
└── cron '0 7 * * 1-5' → triggerScheduled('daily_briefing')
    └── agentExecutor → require(dailyBriefingAgent.js).run()
        └── for each entity with PRESIDENT_COPILOT + PRESIDENT_DAILY_BRIEFING active
            └── copilotService.runChat(...) — same path as interactive chat
                └── posts to MessageInbox (category='briefing') for the entity's president user
```

The briefing prompt is the lookup row `PRESIDENT_DAILY_BRIEFING.metadata.user_template` rendered with `{{date}}` + `{{entity_name}}` placeholders. President can edit prompt + sections in Control Center → Lookup Tables without code change. Cost counts toward the same `AI_SPEND_CAPS` cap as interactive Copilot calls.

### Common Gotchas (Phase G7)

- **Subscription opt-in**: `PRESIDENT_COPILOT` row defaults `is_active: false`. New subsidiaries get the lookup row seeded but the widget stays hidden until president flips the toggle in the AgentSettings AI Cowork tab. Same for `PRESIDENT_DAILY_BRIEFING` and `AI_SPEND_CAPS.MONTHLY`. **Tools default `is_active: true`** so they're ready to use the moment the parent feature is enabled.
- **`max_chat_turns` cap**: Defaults to 8, hard ceiling at 12 in `copilotService` (`HARD_MAX_TURNS`). Stops a tool-use loop from running away if Claude keeps re-invoking tools.
- **Frontend service URL bug (now caught)**: `aiCoworkService.js` originally used `/api/erp/...` while axios baseURL is already `/api`, producing `/api/api/erp/...` paths. Fixed in G7 + the verify script asserts no service uses `/api/erp/...`.
- **Cmd+K NAVIGATE_TO extraction**: Palette extracts the URL by regex-matching the tool's `result_summary` (`"Open <url>"`) — depends on the `navigateTo` handler's display string format. If you change the handler's display, update the palette's regex too. Verified by manual test only (no unit test).
- **Anthropic SDK version**: `@anthropic-ai/sdk@^0.82.0`. The Copilot uses `client.messages.create({ tools, messages })` directly — falling back to `claudeClient.askClaude` doesn't work because that helper only accepts a single user prompt, not a tool-use conversation. Cost estimation extended to `claude-sonnet-4-6` and `claude-opus-4-7` model IDs in `claudeClient.estimateCost`.
- **Daily briefing prerequisites**: Both `PRESIDENT_COPILOT` AND `PRESIDENT_DAILY_BRIEFING` rows must be `is_active` for an entity, AND a User with role=president/ceo must exist with that entity in their `entity_id` or `entity_ids`. Otherwise the briefing skips that entity (logged in `key_findings`).
- **Spend cap cache**: `spendCapService` caches the cap decision for 60s per `(entity_id, feature_code)` key. After raising/lowering a cap, the change applies on next cache miss (≤60s). Lookup CRUD endpoints don't currently bust the cache — call `invalidateSpendCapCache(entityId)` from a custom hook if you need instant propagation.



---

## Phase SG-4 — Sales Goal Commercial-Grade Features (April 19, 2026)

Closes Section D items 21, 22, 23 (extensions), and 24 from `dreamy-skipping-cookie.md`. Brings VIP Sales Goal to commercial parity with SAP Commissions, SuiteCommissions, Workday ICM, and Oracle Fusion ICM. Net new: plan versioning, credit-rule engine, dispute workflow, comp statement extensions.

### Plan versioning architecture (#21)

```
IncentivePlan (header — one per (entity_id, fiscal_year))
  ├─ current_version_no
  ├─ current_version_id ──→ SalesGoalPlan vN (the active version)
  └─ status (mirrors current version)

SalesGoalPlan v1 ←─supersedes_plan_id─ SalesGoalPlan v2 ←─supersedes_plan_id─ v3 (current)
   effective_to=v2.effective_from         effective_to=v3.effective_from        effective_to=null

KpiSnapshot.plan_id  → ALWAYS the version that was active at compute time (never re-pointed)
IncentivePayout.plan_id → SAME (historical accruals stay tied to v1 even after v2 activates)
```

**Backward compat**: existing pre-SG-4 plans without `incentive_plan_id` are lazy-backfilled by `incentivePlanService.ensureHeader()` on first save/read. The one-time migration `node backend/scripts/migrateSalesGoalVersioning.js` drops the legacy `{entity_id,fiscal_year}` UNIQUE index and replaces it with `{entity_id,fiscal_year,version_no}` UNIQUE so multiple versions per FY can coexist. Old API endpoints (`getPlans`, `activatePlan`, `closePlan`, `reopenPlan`) work unchanged.

### Credit rule engine (#22, SAP Commissions pattern)

```
salesController.postSaleRow(saleLine, userId)
  ├── 1. TransactionEvent created
  ├── 2. SERVICE_INVOICE / OPENING_AR shortcut
  ├── 3. Inventory deduction
  ├── 4. SalesLine.status = 'POSTED'
  ├── 5. Document attachments link
  ├── 6. Auto-journal (revenue + COGS)
  ├── 7. CSI markUsed
  └── 8. **NEW**: creditRuleEngine.assign(saleLine, { userId })  ← non-blocking
        ├── buildContext(saleLine) → product_codes, customer_code, territory_id, etc.
        ├── Load active CreditRule rows for entity, sorted by priority asc
        ├── For each matched rule: append SalesCredit (source='rule') until total = 100%
        └── Residual → SalesCredit (source='fallback', credit_bdm_id=saleLine.bdm_id)

Idempotent: re-running deletes existing source∈{rule,fallback} rows and rewrites them.
Manual + reversal rows survive engine re-runs (audit trail discipline).

Failure mode: errors logged to ErpAuditLog as 'CREDIT_RULE_ERROR'; sale post is NEVER reverted.
```

**Important**: SG-4 produces SalesCredit rows but consumers (KpiSnapshot, IncentivePayout accrual) still read `sale.bdm_id`. SG-5 will migrate snapshot computation to read SalesCredit so credit-split rules drive accruals.

### Dispute workflow state machine (#24, Oracle Fusion pattern)

```
                       (gateApproval at every transition — INCENTIVE_DISPUTE module)

[file]  → OPEN ──(takeReview)──→ UNDER_REVIEW ──(resolve APPROVED)──→ RESOLVED_APPROVED
                                              ──(resolve DENIED)────→ RESOLVED_DENIED
        (filer can self-cancel: OPEN → CLOSED)            ↓                  ↓
                                                       (close)            (close)
                                                          ↓                  ↓
                                                       CLOSED  ←──────  CLOSED

RESOLVED_APPROVED side-effects (cascade reversal):
  - artifact_type='payout'  → reverseAccrualJournal(payout.journal_id) + payout.status=REVERSED
  - artifact_type='credit'  → append SalesCredit row (source='reversal', negative amount)

SLA agent (#DSP daily 06:30):
  for each non-CLOSED dispute:
    if days_in_current_state >= DISPUTE_SLA_DAYS[state].sla_days:
      append sla_breaches[] entry (idempotent — once per state-change cycle)
      dispatch escalation to filer + reports_to + escalate_to_role + presidents
      NEVER auto-transition (Rule #20)
```

### Comp statement extensions (#23 ext, Workday ICM pattern)

```
COMP_STATEMENT_TEMPLATE lookup (per-entity, admin-editable in Control Center):
  HEADER_TITLE / HEADER_SUBTITLE / DISCLAIMER / SIGNATORY_LINE / SIGNATORY_TITLE
  EMAIL_ON_PERIOD_CLOSE.metadata.enabled (true|false) — gates the mass email

GET /incentive-payouts/statement/archive?bdm_id=&from_year=&to_year=
  → aggregated rollup per (fiscal_year, period) for the BDM's "Past Statements" tab
  → BDMs see only their own (Rule #21 — no silent privileged self-id fallback)

POST /incentive-payouts/statements/dispatch { period: "2026-03", entity_id?: }
  → gateApproval('INCENTIVE_PAYOUT', 'STATEMENT_DISPATCH')
  → for each distinct bdm_id with payouts in the period:
       compose totals via _composeStatement (same as single-statement endpoint)
       notifyCompensationStatement → email + in-app + SMS opt-in
  → idempotent at email layer (EmailLog dedup)
```

### Lookup categories added (Phase SG-4)

| Category | Purpose | Per-entity? | Lazy-seed? |
|---|---|---|---|
| `CREDIT_RULE_TEMPLATES` | Starter shapes for CreditRule (TERRITORY_PRIMARY, PRODUCT_SPLIT, KEY_ACCOUNT_OVERRIDE) | yes | yes (on first read) |
| `COMP_STATEMENT_TEMPLATE` | Admin-editable brand chrome (HEADER_TITLE, DISCLAIMER, etc.) + EMAIL_ON_PERIOD_CLOSE toggle | yes | yes (on first read) |
| `DISPUTE_SLA_DAYS` | Per-state SLA (sla_days, escalate_to_role) | yes | yes (on first agent run) |
| `INCENTIVE_DISPUTE_TYPE` | Typology dropdown driving artifact resolution (payout vs credit) | yes | yes (on first read) |
| `MODULE_DEFAULT_ROLES.INCENTIVE_DISPUTE` | gateApproval default-roles gate for dispute lifecycle | yes | yes |
| `APPROVAL_MODULE.INCENTIVE_DISPUTE` | Approval Hub registry entry | yes | yes |

All categories are entity-scoped, lazy-seeded on first miss (Rule #19 cache busting + Rule #20 lookup-driven posture). Subscribers tune via Control Center → Lookup Tables, zero code changes.

**Note on plan-version state**: there is intentionally **no** `ACTIVE_PLAN_VERSION` lookup. An earlier draft mirrored `IncentivePlan.current_version_id` into a Lookup row for an O(1) "fast path", but that mixed operational state into the configuration table. The IncentivePlan header is itself O(1) via the unique index on `{entity_id, fiscal_year}`, and admins shouldn't see a row in Control Center → Lookup Tables that the runtime overwrites on every plan activation. Source of truth: `IncentivePlan.findOne({entity_id, fiscal_year}).current_version_id`. Do **not** reintroduce a lookup mirror.

### gateApproval routing (Phase SG-4 additions)

| Module | docType | Caller | Default roles |
|---|---|---|---|
| `SALES_GOAL_PLAN` | `PLAN_NEW_VERSION` | `salesGoalController.createNewVersion` | president, finance |
| `INCENTIVE_PAYOUT` | `STATEMENT_DISPATCH` | `incentivePayoutController.dispatchStatementsForPeriod` | president, finance |
| `INCENTIVE_DISPUTE` | `DISPUTE_TAKE_REVIEW` | `incentiveDisputeController.takeReview` | president, finance, admin |
| `INCENTIVE_DISPUTE` | `DISPUTE_RESOLVE` | `incentiveDisputeController.resolveDispute` | president, finance, admin |
| `INCENTIVE_DISPUTE` | `DISPUTE_CLOSE` | `incentiveDisputeController.closeDispute` | president, finance, admin |

Filing a dispute (`POST /incentive-disputes`) is NOT gated — it's a request, not a posting. Filer cancellation (`POST /incentive-disputes/:id/cancel`) is also not gated (filer withdraws their own request).

### Common gotchas (Phase SG-4)

- **Migration is required on existing databases.** `node backend/scripts/migrateSalesGoalVersioning.js` MUST be run once before SG-4 deployment. Without it, any attempt to create v2 of an existing plan errors with `E11000 duplicate key` because the legacy `{entity_id,fiscal_year}` UNIQUE index is still active. Fresh installs are unaffected (mongoose autoIndex creates only the composite).
- **Engine never reverts a sale.** `creditRuleEngine.assign()` is wrapped in try/catch inside `postSaleRow`. If the engine fails for any reason (lookup fetch error, DB hiccup), the sale still posts. Failure logged to ErpAuditLog with `target_model='SalesCredit'`. Re-run via `POST /credit-rules/reassign/:saleLineId`.
- **APPROVED dispute ≠ payment denied.** Resolving a dispute as APPROVED on a payout cascades a `reverseAccrualJournal()`, which respects period locks. If the payout's accrual period is locked, the reversal will fail and the dispute still moves to RESOLVED_APPROVED — but with no `reversal_journal_id`. Admin must manually reverse from the Payout Ledger after unlocking the period.
- **Disputes are NOT in the rejection-banner system.** Disputes have their own state machine (OPEN/UNDER_REVIEW/RESOLVED_*/CLOSED), not the gateApproval REJECTED status. The G6 RejectionBanner does not render on the Dispute Center page — by design. SLA breach badges are the visual analog.
- **Credit rules vs sales attribution**: SG-4 introduces SalesCredit but does NOT yet drive incentive accrual math. Snapshot computation still reads `sale.bdm_id`. Until SG-5, credit-split rules are auditable but advisory. Communicate this to subscribers — a 70/30 split rule today produces a SalesCredit ledger but the BDM listed on the sale still gets the full incentive accrual.
- **Plan versioning + KpiTemplate**: Editing a KpiTemplate row never cascades to existing plans (SG-3R immutability discipline). Versioning gives admins a clean path to apply template changes — create v2 of a plan with `template_id` in the body, copy/edit the structure, activate v2 to supersede v1.
- **disputeSlaAgent breach idempotency**: A breach row is appended only when no breach exists for the current state since the last `state_changed_at`. If a dispute transitions to UNDER_REVIEW and back to OPEN (not a current-flow path but theoretically possible via direct DB edit), the breach clock resets — desired behavior because the new state-change effectively gives the chain a fresh chance.
- **Sidebar visibility for Dispute Center**: visible to ALL users with `sales_goals` VIEW (BDMs need to file). Reviewer actions inside the page are gated by `isPrivileged` check + sub-perm check + `gateApproval` — non-reviewers see only their own disputes filtered server-side (Rule #21).
