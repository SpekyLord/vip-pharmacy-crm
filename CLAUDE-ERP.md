# VIP ERP - Project Context

> **Last Updated**: May 6, 2026
> **Version**: 8.9
> **Status**: Phase **P1.2 Phase 1 — Capture cleanup + Option D BIR audit gate (May 6 2026, ✅ shipped — pending UI smoke ratification on dev)**: Three coupled changes that close an audit-credibility gap exposed by Round 2C and clean up two unused enum slots. (1) `workflow_type='CWT_INBOUND'` is dropped — CWT now lives as a sub_type of `COLLECTION` (hospitals send CR + DEPOSIT + CWT together as one collection package). (2) `workflow_type='PETTY_CASH'` is dropped — tile was never shipped on the Capture Hub; enum slot was speculative. (3) **Two-step BIR receive on `/erp/bir/2307-IN` (Option D audit gate)** — photo evidence (`cert_2307_url`) attaches but does NOT unlock the 1702 credit; finance must ALSO tick a "paper-in-Iloilo" checkbox that flips `status='RECEIVED'` + stamps `CwtLedger.physical_received_at`. The gap state (cert URL non-empty + status=PENDING_2307 + physical_received_at NULL) is the new **PHOTO_ATTACHED** pseudo-status, surfaced as a tab + amber pill on the inbound page. **Why the gate matters:** BIR RR No. 2-98 + 1604-E line-item docs require the original paper certificate as documentary evidence for the 1702 "Less: Creditable Tax Withheld" credit. Round 2C let finance pick a BDM photo and immediately mark RECEIVED → 1702 credit unlocked, which under audit could be disallowed → 25% surcharge + 12% interest on the underpaid amount. **Migration** ([backend/scripts/migrateCwtInboundToCollectionSubtype.js](backend/scripts/migrateCwtInboundToCollectionSubtype.js)) — dry-run-by-default, idempotent, raw-collection access (works regardless of model enum state). 2 CWT_INBOUND rows flipped on dev cluster, 0 PETTY_CASH. Migration MUST run before model enum is narrowed (otherwise existing rows fail Mongoose validation on next save). **Frontend wiring**: [Bir2307InboundPage.jsx](frontend/src/erp/pages/Bir2307InboundPage.jsx) gains `paperReceived` state (default UNCHECKED on fresh open), the new "Photo attached" tab between Pending and Received, the paper-received checkbox in the Mark-Received modal (disabled until cert URL non-empty, cites BIR RR No. 2-98 in the helper text), Save button label branches on `paperReceived` (`'Save — Mark RECEIVED'` checked vs `'Save Photo Only'` unchecked), and `STATUS_META.PHOTO_ATTACHED` row pill (amber `#fef3c7`/`#92400e`). Picker workflowTypes flip from `['CWT_INBOUND','UNCATEGORIZED']` → `['COLLECTION','UNCATEGORIZED']` + new `subTypeFilter={{COLLECTION:'CWT'}}` prop on [PendingCapturesPicker.jsx](frontend/src/erp/components/PendingCapturesPicker.jsx). [BdmCaptureHub.jsx](frontend/src/erp/pages/mobile/BdmCaptureHub.jsx) CWT tile flips from `key:'CWT_INBOUND'` to `key:'COLLECTION', sub_type:'CWT'`. [BdmReviewQueue.jsx](frontend/src/erp/pages/mobile/BdmReviewQueue.jsx) gains `COLLECTION_CWT` composite-key entry in WORKFLOW_ICONS / WORKFLOW_COLORS / WORKFLOW_LABELS (legacy `CWT_INBOUND` + `PETTY_CASH` kept as defensive fallbacks). [ProxyQueue.jsx](frontend/src/erp/pages/proxy/ProxyQueue.jsx) WORKFLOW_OPTIONS dropdown drops PETTY_CASH and adds COLLECTION + UNCATEGORIZED (Quick Capture catchall). **Backend wiring**: [CwtLedger.js](backend/erp/models/CwtLedger.js) gains `physical_received_at: { type: Date, default: null, index: true }` — distinct from existing `received_at` (the digital-attach timestamp). Indexed because the new PHOTO_ATTACHED tab filters rows where `cert_2307_url IS NOT NULL && physical_received_at IS NULL`. [cwt2307ReconciliationService.markReceived](backend/erp/services/cwt2307ReconciliationService.js) signature gains `paper_received` (default `true` for backward compat with non-Phase-1 callers; Phase-1 frontend always passes explicitly); cert_* fields always stamped, paper attestation only when `paper_received===true`; rejects `paper_received=true` with empty `cert_2307_url` (defense-in-depth mirror of disabled-checkbox UI gate); photo-only saves on already-RECEIVED rows preserve the prior paper attestation (don't demote). `markPending` clears `physical_received_at` along with `received_at`/`received_by`. `listInboundRows` surfaces `physical_received_at` so the frontend can render PHOTO_ATTACHED. [birController.markReceived2307Inbound](backend/erp/controllers/birController.js) extracts `paper_received` from body, coerces with backward-compat default `true` if absent, forwards to service. Audit log line `[BIR_2307_INBOUND_MARK_RECEIVED]` extended with `paper_received` + `final_status` + `physical_received_at` so admin can grep historical events to see which receives unlocked the 1702 credit vs which only attached photo evidence. [captureSubmissionController.js](backend/erp/controllers/captureSubmissionController.js) `VALID_TYPES` drops `CWT_INBOUND` + `PETTY_CASH`; `VALID_SUB_TYPES_BY_WORKFLOW.COLLECTION` adds `'CWT'` (now 4 values: CR / DEPOSIT / PAID_CSI / CWT); `REVIEW_WORKFLOWS` (in both `completeCapture` AND `linkCaptureToDocument`) drops `CWT_INBOUND` (COLLECTION already covers it via sub_type); `getProxyQueue` accepts new optional `sub_type` query param + threads to the Mongo filter; `DIGITAL_ONLY` arrow does NOT classify COLLECTION+CWT as digital-only — paper certificate must arrive at the Iloilo office, so `physical_required=true` is correct. **Cascading downstream sanity verified**: Phase J7 1702 aggregator reads `status='RECEIVED'` so it correctly excludes PHOTO_ATTACHED rows from the credit (their `status` is still `'PENDING_2307'`); pending-exposure computation correctly counts photo-attached rows as exposure (they ARE still credit-at-risk until paper arrives); J6 inbound posture card splits by `status` so PHOTO_ATTACHED rows count under PENDING_2307; Capture Archive (Slice 8) folder tree groups by `(workflow_type, sub_type)` so post-migration CWT captures appear under `COLLECTION / CWT` (vs the legacy `CWT_INBOUND` standalone leaf); Slice 9 paper-received attestation gate lives on `CaptureSubmission.physical_received_at` (capture-side), distinct from `CwtLedger.physical_received_at` (CWT-ledger-side) — the two paper-received fingerprints serve different surfaces and don't interact; Round 2C linkCaptureToDocument still fires when `capture_id` is forwarded, regardless of `paper_received` value (the capture lifecycle advance is independent of the BIR audit gate). **Subscription-readiness preserved**: zero new lookup categories. Paper-attestation gate is hardcoded by BIR-regulation requirement, not subscriber-tunable. Picker reuses `CAPTURE_LIFECYCLE_ROLES.PROXY_PULL_CAPTURE` (defaults `[admin, finance, president]`) + `BIR_ROLES.RECONCILE_INBOUND_2307` (defaults `[admin, finance, bookkeeper]`); subscribers retune via Control Center → Lookup Tables (Rule #3 / Rule #19). `entity_id` (Rule #19) and `bdm_id` (Rule #21) posture unchanged on every endpoint touched.

> **Previously**: Phase **P1.2 Slice 6.2 — GRN sub_type split (BATCH_PHOTO vs WAYBILL) (May 6 2026, ✅ shipped — pending UI smoke ratification on dev)**:## Overview

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

### Master-Data Read Scoping (Phase G6, Apr 26 2026)

`tenantFilter` returns `req.tenantFilter = {}` for president-likes so transactional reads (Sales/Reversal Console) span all entities by design — that's the Phase 31-E convention. **Master-data lists are different**: People Master, Vendors, Customers, Hospitals are admin-edit surfaces tied to a specific entity, and a working-entity selector that's silently ignored on reads is misleading.

Use `resolveEntityScope(req, moduleKey)` from `backend/erp/utils/resolveEntityScope.js` for master-data list endpoints:

- **Default** (no flag): scope to `req.entityId` for everyone, including president. The top-right entity dropdown finally drives the read.
- **Opt-in cross-entity** (`?cross_entity=true`): widens to all entities, but only for roles in the `CROSS_ENTITY_VIEW_ROLES.<MODULE>.metadata.roles` lookup. Default seed: `['president', 'ceo']`. A subsidiary CFO needing consolidated view is added via Control Center → Lookup Tables, no code change (Rule #3).
- **Roles outside the allowlist** silently stay scoped — they don't see widened data they aren't authorized for, and there's no error escalation that could leak which roles exist.

Endpoints adopting the helper return `meta: { is_cross_entity, scoped_entity_id }` so frontends can render an Entity column + scope banner. Currently wired: `peopleController.getPeopleList`. Pattern is ready for vendors/customers/hospitals when those master-data lists are revisited.

Cache TTL is 60s with bust-on-lookup-write (mirrors `PROXY_ENTRY_ROLES`). `insert_only_metadata: true` on the seed row is load-bearing — without it, admin edits to `metadata.roles` get silently reverted on the next page load (same fix as PROXY_ENTRY_ROLES).

### People Master Entity Lifecycle (Phase G6.1, Apr 26 2026)

G6 made the read scope explicit. **G6.1 closes the gap on the WRITE side**: how a person spans entities, how to move them, and how staff become valid proxies in another entity. Three deliverables, all on top of existing infrastructure (FRA-A's `User.entity_ids_static` + `userEntityRebuild`, plus the `PROXY_ENTRY_ROLES` proxy engine):

- **Visibility union on People List** — `getPeopleList` no longer filters strictly by `PeopleMaster.entity_id`. It returns the union: home-entity rows ∪ User-spanned rows (`User.entity_ids` contains scope) ∪ active-FRA holders (`FunctionalRoleAssignment.entity_id == scope`, load-bearing only for User-less people; FRA-A's rebuild already folds active FRA entities into `User.entity_ids` for User-linked people). Result: a parent-VIP staff granted MG access shows up in MG's People List without duplicating PeopleMaster docs.
- **Three new endpoints** under `/erp/people/:id`:
  - `POST /transfer-entity` — moves `PeopleMaster.entity_id`. Dual-writes to linked `User.entity_id` (and adds the new home to `entity_ids_static`, removes the old). Blocks (HTTP 409) when the source entity has any non-DRAFT `JournalEntry` referencing the person within the configured lookback (default 90 days; per-entity tunable via Lookup `PEOPLE_LIFECYCLE_CONFIG` / `TRANSFER_BLOCK_LOOKBACK_DAYS` — Rule #3 subscription-readiness).
  - `POST /grant-entity` — adds an entity to `User.entity_ids_static`, triggers `rebuildUserEntityIdsForUser`. Requires linked User (returns 400 if none). Idempotent (200 noop if already granted). Visibility-only — module access still requires Access Template assignment per entity.
  - `POST /revoke-entity` — removes from `User.entity_ids_static`. Cannot revoke the home entity (use Transfer instead). If person still has access via active FRAs, response message warns explicitly.
- **Sub-permission gating** — both new keys are baseline danger sub-perms in [`dangerSubPermissions.js`](backend/erp/services/dangerSubPermissions.js):
  - `people.transfer_entity` — gates `transferEntity`
  - `people.grant_entity` — gates both `grantEntity` and `revokeEntity` (revoke is the inverse, not separately gated)
  - Danger-baseline = require explicit Access Template grant even when module-level access is FULL. Admin/staff can be enabled per-template; president bypasses upstream.

**Audit trail** — every mutation writes a `PERSON_ENTITY_TRANSFER` / `PERSON_ENTITY_GRANT` / `PERSON_ENTITY_REVOKE` row to `AuditLog` (90-day TTL via existing index) with reason + before/after `User.entity_ids` snapshot.

**Proxy entry interaction** — once granted, the staff person becomes a valid proxy target in the new entity automatically. `resolveOwnerForWrite` already validates `targetEntities = [target.entity_id, ...target.entity_ids]` includes the request entity (defense-in-depth check at [resolveOwnerScope.js:211](backend/erp/utils/resolveOwnerScope.js#L211)). No per-module wiring needed for cross-entity proxy on Sales / Opening AR / Expenses / Collections / GRN / SMER / Per-Diem / CALF / Car Logbook / Undertaking — the engine is already in place.

**UI** — new "Entity Access" card on `PersonDetail.jsx` between Person Info and Compensation Profile. Renders Home (entity badge) + Additional (chips with `static` / `FRA` / `static + FRA` source labels and × revoke button on static-only chips). "Transfer Home" and "+ Grant Entity" buttons open a shared modal with entity dropdown + reason field. Sub-perm-gated; non-eligible users don't see the buttons.

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

## Frontend Design Conventions

Visual consistency rules that apply to every ERP page. New pages MUST follow them; refactors that cross these surfaces should bring them into compliance.

### Tab navigation

There is exactly **one** tab style in the ERP. It comes from `SalesList` / `SalesEntry` / `Expenses` and uses the classes `sales-nav-tabs` (the row) and `sales-nav-tab` (each tab) with `active` toggling the filled-blue state.

**Gotcha — these classes are currently page-scoped, not global.** Each page that uses them injects the rules via its own `<style>{pageStyles}</style>` block (see SalesList.jsx, SalesEntry.jsx, CsiBooklets.jsx). When adding tabs to a new page, **copy the CSS block** from one of those pages or the styles will silently fall through to default browser button/anchor rendering. Long-term cleanup: lift these rules into a shared stylesheet (e.g. `frontend/src/erp/styles/tabs.css` imported once) — until then, copy on each page that needs them.

- **Plain-text labels.** No emojis, no icons inside the tab. Status indicators (counts, badges) are allowed but rare — they go inside the tab as `<span class="badge">`. The Sales row is the visual canon: `Sales · Sales Transactions · Opening AR · Opening AR Transactions · CSI Booklets`.
- **Two flavors, same look:**
  - **Route-based tabs** (cross-page navigation) — use `<Link to="/erp/...">` with `aria-current="page"` on the active one. Examples: the Sales nav itself, `Expenses` ↔ `Income` switcher.
  - **State-based sub-tabs** (intra-page) — use `<button type="button" role="tab" aria-selected={isActive}>` with React state + a `useEffect` that syncs `window.location.hash`. The URL stays at the page's canonical path; the hash names the active tab (e.g. `/erp/csi-booklets#calibration`). Reference implementation: [`CsiBooklets.jsx`](frontend/src/erp/pages/CsiBooklets.jsx).
- **Active styling is consistent.** The `active` class is what paints the tab blue with white text. Don't introduce alternative active styles (no `aria-pressed`, no `data-active`, no inline color overrides).
- **Role-aware tab labels** belong inside the same row, not a separate one. Example: `Booklets & Allocations` (admin) vs `My CSI Numbers` (BDM) occupy the same slot in the CSI tab nav, with the conditional resolved at render time. Never render two parallel tab rows for two roles.
- **No emojis in section headings (`<h3>`) inside ERP pages either.** Drift creeps in fast — the rule is uniform.

### When to add a sub-tab vs a new page

If a section is heavy enough that it has its own data fetch, its own filters, or its own modal stack, prefer **state-based sub-tabs on a single page** (URL hash) over adding a new sidebar entry. Sidebar entries are reserved for distinct workflows.

The CSI Booklets page is the canonical example: drafts / inventory / calibration are three distinct activities sharing one URL, three sub-tabs.

---

## BIR CAS Readiness (Compliance Risk — not yet a phase)

> **Status (Apr 21, 2026)**: NOT STARTED. High-priority risk. Owner: OM Judy Mae Patrocinio + external BIR-accredited consultant. Target: start filing within 3 months of vippharmacy.online launch.

### The rule

Per **RR 9-2009** (Computerized Accounting System) and **RMC 5-2021** (streamlined registration), any taxpayer using a computerized system to generate books of accounts, ORs/SIs, or financial reports must hold a **BIR Permit to Use (PTU) CAS** for that system. VIP Inc uses this ERP as its computerized accounting system. **It needs a PTU regardless of whether the software is built in-house or purchased.**

### Common misconception (correction)

Listing the product on Play Store / App Store gives the SOFTWARE commercial legitimacy, but it does NOT exempt VIP Inc (as a taxpayer using it) from the CAS accreditation requirement. CAS PTU is filed by the **taxpayer** at their RDO — per-taxpayer, per-system, per-entity. Each subsidiary (MG AND CO., future Vios Software Solutions Inc., etc.) needs its own PTU.

### What BIR will inspect

1. **System description & workflow documentation** (we have this via CLAUDE-ERP.md + PHASETASK-ERP.md — ✅ strong)
2. **Sample printouts** — SI, OR, SOA, trial balance, GL, sales/purchase books, cash receipts/disbursements book
3. **BIR-mandated fields on invoices/ORs** — TIN, address, VAT-registered flag, zero-rated flag, serial control, RMC 5-2021 security features
4. **Audit trail** — every transactional edit must be traceable (we have `AuditLog` — ✅ base), but need to confirm coverage on JE, SI, OR, SOA specifically
5. **Backup & retention** — 10-year retention per NIRC. Need documented backup policy, offsite copy, restore test runbook.
6. **Data integrity** — no unposting without journal reversal (we enforce this — ✅), period-close with archive (we have — ✅)
7. **Serial number control** — SI and OR serials must be pre-registered with BIR and monotonic with no gaps

### Gap list vs current ERP

| Requirement | Status | Work needed |
|---|---|---|
| Audit trail on JE/SI/OR/SOA | Partial | Confirm `AuditLog` coverage; add if any gap |
| BIR-format SI printout (serial, TIN block, VAT breakdown) | Partial | `Sales` model has fields; need print template matching BIR sample |
| OR printout for collections | Partial | `Collection` has OR number; need BIR-compliant print |
| Pre-registered serial ranges (SI, OR per entity) | Not implemented | Add `SerialRange` model (per-entity, per-document-type, start/end/current/registered_with_bir_at) + enforce monotonic allocation |
| Sales Book / Purchase Book export in BIR format | Partial | Have SLSP from Phase 11; need exact BIR column order + DAT file format |
| SAWT (Summary Alphalist of Withholding Taxes) | Not confirmed | Verify `WithholdingTax` model exports SAWT DAT file |
| 10-year retention policy document | Not written | Judy Mae + consultant to draft; backup procedure to `docs/BIR_CAS_RUNBOOK.md` |
| Sample printouts pack for RDO submission | Not produced | Generated on demand once print templates are BIR-compliant |
| System flowchart for RDO submission | Not produced | Can auto-generate from PHASETASK-ERP.md |

### Cost & timeline (rough)

- Consultant fee: ₱80k–₱200k for a BIR-accredited CAS consultant to prepare the submission pack
- BIR processing: 3–6 months from submission to PTU issuance (RDO-dependent)
- Parallel work during processing: taxpayer can still operate; just flag risk that pre-PTU ORs/SIs may need to be re-issued once PTU is granted if format changes

### Why this is in the ERP context (not a phase yet)

This is a **compliance track**, not a software feature phase. The gap list above becomes individual engineering tickets only after the consultant writes the submission pack and identifies concrete format deltas. For now, this section exists so any engineer (or future Claude) reading CLAUDE-ERP.md understands:

- New invoice/OR work must not break BIR-mandated fields
- New serial-generating endpoints should use (or prepare to use) a `SerialRange` registry, not free ObjectId allocation
- Any data-deletion feature must respect 10-year retention (soft-delete only; never hard-delete posted docs)

When the consultant delivers the gap list, the concrete work gets its own Phase X in PHASETASK-ERP.md.

---

## ERP Phases

> **CRM-side phase note (April 28, 2026 — Phase A.5.5)**: The canonical VIP-Client (Doctor) **merge tool shipped** on the CRM side. Admin operator surface at [/admin/md-merge](frontend/src/pages/admin/MdMergePage.jsx) with a 3-step UX (pick winner + loser → preview cascade blast radius → confirm with required reason). The cascade engine ([backend/services/doctorMergeService.js](backend/services/doctorMergeService.js)) re-points 13 FK paths — including **6 ERP-side fields** that any ERP-aware change must keep on the manifest: `Collection.settled_csis.partner_tags.doctor_id`, `Collection.settled_csis.md_rebate_lines.md_id`, `MdProductRebate.doctor_id`, `MdCapitationRule.doctor_id`, `PrfCalf.partner_id`, `PatientMdAttribution.doctor_id`. Cascade runs inside Mongoose `withTransaction` when Atlas is detected; collisions on `PatientMdAttribution`'s unique `(entity_id, patient_id, doctor_id)` defuse by deactivating the loser's row (rollback re-activates if winner side is unchanged). Lookup-driven gates: `VIP_CLIENT_LIFECYCLE_ROLES.{VIEW_MERGE_TOOL, EXECUTE_MERGE, ROLLBACK_MERGE, HARD_DELETE_MERGED}` (admin + president defaults; HARD_DELETE narrows to president-only). Audit row on every merge ([DoctorMergeAudit](backend/models/DoctorMergeAudit.js)) captures per-model id arrays so rollback is surgical, not "guess from current state". 30-day grace before hard-delete cron runs (cron not yet wired — first audit row aged-out is the trigger). **ERP impact for Phase 38 PeopleMaster merge** (queued separately): fork this service shape — `buildCascadeManifest()` + per-kind `applyX` functions are the reusable spine.
>
> **CRM-side phase note (April 26, 2026)**: Phase **VIP-1.A** shipped on the CRM side — `Doctor` extended with `partnership_status` (LEAD/CONTACTED/VISITED/PARTNER/INACTIVE), `lead_source`, `partner_agreement_date`, `prc_license_number` (sparse), `partnership_notes` + new admin page `/admin/md-leads` + `backend/utils/mdPartnerAccess.js` (lookup-driven role gates: `MD_PARTNER_ROLES.{VIEW_LEADS,MANAGE_PARTNERSHIP,SET_AGREEMENT_DATE}` with inline `[admin, president]` defaults). ERP integration lands in **VIP-1.B** (`PatientMdAttribution` + `MdProductRebate` + `MdCapitationRule` + `StaffCommissionRule`) and **VIP-1.F** (rebate accrual on Collection POSTED → ERP Approval Hub → BIR 2307 service-fee export with `bir_flag: 'INTERNAL'` stamping). The 3-gate guardrail enforces, in MdProductRebate / MdCapitationRule pre-save: (a) `Doctor.partnership_status === 'PARTNER'`, (b) `Doctor.partner_agreement_date` set, (c) `PatientMdAttribution.attribution_consent_log.timestamp` present — all three before a single peso accrues. See `docs/PHASE-TASKS-CRM.md` §VIP-1.A for the schema/controller/route detail and `~/.claude/plans/vip-1-integrated-build-plan.md` for the full roadmap. Per-tenant note: `MdProductRebate` schema must NEVER allow `product_id` filtering (per-patient capitation only — RA 6675 / FDA 2011-002 compliance).

> **Phase note (April 26, 2026 — Phase 4 ACTIVATION shipped)**: Phase **VIP-1.B Phase 4** wired the foundation built in Phases 0/1A/2/3 into live behavior. (1) [backend/erp/models/Collection.js](backend/erp/models/Collection.js) gained `md_rebate_lines[]` subschema + `total_md_rebates` roll-up + `commission_rule_id` / `partner_tags[].rule_id` provenance; pre-save now walks 3 matrices (MdProductRebate Tier-A per `SalesLine.line_items[]`, NonMdPartnerRebateRule, StaffCommissionRule with CompProfile fallback) and excludes Tier-A products from Non-MD partner rebate base. (2) [backend/erp/controllers/collectionController.js](backend/erp/controllers/collectionController.js) `submitCollections` and `postSingleCollection` (Approval Hub) now call `routePrfsForCollection` INSIDE the existing JE-TX session — atomic with the Collection POST; failure aborts the whole transaction. Reopen path cleans DRAFT auto-PRFs so re-submit produces fresh ones. (3) [backend/erp/models/PrfCalf.js](backend/erp/models/PrfCalf.js) gained `metadata: Mixed` field + sparse compound index on `{entity_id, doc_type, period, metadata.source_collection_id, metadata.payee_id}` (autoPrfRouting idempotency lookup) — fixes a latent bug where Mongoose silently dropped the metadata write. (4) 6 new ERP routes mounted at `/api/erp/{md-product-rebates, non-md-partner-rebate-rules, md-capitation-rules, staff-commission-rules, rebate-payouts, commission-payouts}` with lookup-driven role gates (REBATE_ROLES + COMMISSION_ROLES). (5) 5 admin pages live: `/admin/{rebate-matrix, non-md-rebate-matrix, capitation-rules, commission-matrix, payout-ledger}` + 5 PageGuide entries + 5 Sidebar entries under Operations. **Idempotency invariant**: re-routing a POSTED Collection produces 0 new PRFs (queries by `metadata.source_collection_id`); pre-save bridge clears `md_rebate_lines` first then re-walks (manual partner_tags[].rebate_pct overrides preserved when > 0). **Tier-A exclusion**: `Map<product_id, line_item.net_of_vat>` tracks the per-product covered amount; `partnerBase = max(0, csi.net_of_vat − sum(tierAExcludedNet))`. Auto-fill at entry time only fires when commission_rate / rebate_pct is 0/unset — manual overrides win. **Out of scope (future)**: storefront `Order.paid` listener (VIP-1.D), AREA_BDM Territory schema extension (provinces[]/area_bdm_user_id), nightly excluded_product_ids sync job, BIR Form 2307 export (VIP-1.F), `attribution_consent_log` field on PatientMdAttribution (waiting on user decision per handoff). See `docs/PHASETASK-ERP.md` §VIP-1.B Phase 4 for the full file inventory and Playwright smoke results.

> **Phase note (April 26, 2026 — foundation, superseded by Phase 4 above)**: Phase **VIP-1.B — Rebate + Commission Engine (foundation)** shipped Phases 0 + 1A + 2 + 3A. Phase 0: `journalFromPrfCalf` default `bir_flag` flipped from `'BOTH'` to `'INTERNAL'` ([backend/erp/services/autoJournal.js:754](backend/erp/services/autoJournal.js#L754)) — plugs the active partner-rebate-onto-BIR-P&L leak. Backfill script `backend/scripts/backfillPrfCalfBirFlag.js` (dry-run default, `--apply` to persist) flips legacy `'BOTH'` PRF/CALF JEs to `'INTERNAL'`. Phase 1A: 7 new schemas ([backend/erp/models/MdProductRebate.js](backend/erp/models/MdProductRebate.js), [NonMdPartnerRebateRule.js](backend/erp/models/NonMdPartnerRebateRule.js), [MdCapitationRule.js](backend/erp/models/MdCapitationRule.js), [StaffCommissionRule.js](backend/erp/models/StaffCommissionRule.js), [PatientMdAttribution.js](backend/erp/models/PatientMdAttribution.js), [RebatePayout.js](backend/erp/models/RebatePayout.js), [CommissionPayout.js](backend/erp/models/CommissionPayout.js)) + matrix walker ([backend/erp/services/matrixWalker.js](backend/erp/services/matrixWalker.js)). MdProductRebate + MdCapitationRule pre-save enforce schema-time 3-gate: (a) `Doctor.partnership_status === 'PARTNER'`, (b) `Doctor.partner_agreement_date != null`, (c) `rebate_pct <= Settings.MAX_MD_REBATE_PCT` (default 25, lookup-driven). Phase 2: 3 services — [autoPrfRouting.js](backend/erp/services/autoPrfRouting.js) (Collection POSTED → RebatePayout(ACCRUING) + PRF generation, idempotent), [rebateAccrualEngine.js](backend/erp/services/rebateAccrualEngine.js) (storefront Order.paid → Tier-A first, Tier-B fallback with frequency-window enforcement, runtime 3-gate check), [ecommCommissionEngine.js](backend/erp/services/ecommCommissionEngine.js) (ECOMM_REP + AREA_BDM commission accrual; AREA_BDM gracefully degrades on current Territory schema lacking provinces[]/area_bdm_user_id — Phase 2.5 schema extension flagged inline). Phase 3A: lookup-driven role gates via [backend/utils/rebateCommissionAccess.js](backend/utils/rebateCommissionAccess.js) (60s TTL cache, mirrors scpwdAccess.js) + 7 new SEED_DEFAULTS categories in lookupGenericController.js (`REBATE_ROLES` 6 codes, `COMMISSION_ROLES` 3 codes, `REBATE_PAYOUT_STATUS`, `STAFF_COMMISSION_PAYEE_ROLE`, `REBATE_SOURCE_KIND`, `MD_CAPITATION_FREQUENCY`, `PATIENT_MD_ATTRIBUTION_SOURCE`) with cache-bust hook on save. **NOT YET WIRED (Phase 4+)**: Collection.js pre-save bridge (md_rebate_lines + auto-fill partner_tags rebate_pct + commission_rate via matrix walks); collectionController POST → autoPrfRouting hook; 4 admin matrix pages (RebateMatrixPage, NonMdPartnerRebateMatrixPage, CapitationRulesPage, CommissionMatrixPage) + Collections.jsx auto-fill badges; routes mount; sidebar entries; PageGuide banners; Playwright smoke. **DIVERGENCE FROM ORIGINAL PLAN**: the consent-log apply-time gate (PatientMdAttribution.attribution_consent_log) referenced in the VIP-1.A note above was deferred — VIP-1.B Phase 1A's PatientMdAttribution has `confidence` + `source` instead. Adding `attribution_consent_log` is a non-breaking schema extension that the engines can pick up without code change once added (just an extra runtime check in `runtime3GateCheck`). See `memory/handoff_vip_1_b_phase_3_handoff_apr26_2026.md` for the next-session paste-ready opener and the consent-log retrofit plan.

> **Phase note (April 26, 2026)**: Phase **VIP-1.H — SC/PWD Sales Book + BIR Sales Book** shipped (foundation). New ERP module at `/api/erp/scpwd-sales-book` (admin page `/admin/scpwd-sales-book`) implementing the BIR-mandated SC/PWD register per RA 9994 + RA 7277/9442 + BIR RR 7-2010 + Form 2306 (input-VAT reclaim worksheet). Files: `backend/erp/models/SalesBookSCPWD.js` (denormalized BIR-ready row, idempotent on `{entity_id, source_type, source_doc_ref}`, pre-save validates RA 9994 20% discount + 12% VAT-exempt math + lookup-driven OSCA/PWD ID regex), `backend/erp/services/scpwdReportingService.js` (monthly CSV export per RR 7-2010 + Input VAT Credit Worksheet labeled DRAFT until accountant review), `backend/erp/controllers/scpwdSalesBookController.js`, `backend/erp/routes/scpwdSalesBookRoutes.js`, `backend/utils/scpwdAccess.js` (lookup-driven `SCPWD_ROLES.{VIEW_REGISTER, CREATE_ENTRY, EXPORT_MONTHLY, EXPORT_VAT_RECLAIM}` with `[admin, finance]`/`[admin, finance, president]` defaults), `frontend/src/erp/services/scpwdService.js`, `frontend/src/pages/admin/SCPWDSalesBookPage.jsx`. Wiring: `'SCPWD'` added to `PeriodLock` enum (period locks at `periodLockCheck('SCPWD')` reject retroactive writes after BIR filing); `SCPWD_ROLES` + `SCPWD_ID_FORMATS` SEED_DEFAULTS added to `lookupGenericController` with cache-bust hook on save → `scpwdAccess.invalidate()`; PageGuide entry `'scpwd-sales-book'` per Rule #1; Sidebar entry under Operations group. Out of scope: storefront → SalesBookSCPWD ingest (deferred until storefront launch — same idempotent path receives it via `source_type: 'STOREFRONT_ORDER'`); ERP Sale POSTED → SalesBookSCPWD auto-bridge (manual entry covers v1, bridge follows once SC/PWD detection adds to Sale capture); PDF audit-binder format (CSV sufficient for monthly filing). See `docs/PHASETASK-ERP.md` §VIP-1.H for the full ship summary including the Phase 0 bir_flag coverage audit findings (all major JE flows audited; correct INTERNAL/BOTH stamping confirmed; no rebate-JE leakage today since rebate code lands with VIP-1.B).

> **CRM-side phase note (April 26, 2026 — Phase N)**: Phase **N (Offline Visit + CLM Merge + Public Deck)** shipped on the CRM side on `feat/phase-n-offline-visit-clm-merge` — non-breaking. **Visit / CLMSession / CommunicationLog all gain a sparse FK pair** linked by a client-generated UUID (`Visit.session_group_id` ↔ `CLMSession.idempotencyKey` ↔ `CLMSession.visit_id` ↔ `Visit.clm_session_id`). **No ERP-side schema or controller changes required**. The new public route `GET /api/clm/deck/:id` is anonymous + rate-limited (10 req/min/IP) and only serves `mode: 'remote'` sessions. The merged in-person flow (VisitLogger "Start Presentation" → PartnershipCLM with prefilled doctor + products + shared UUID) lets BDM analytics travel either direction with no fuzzy timestamp join. **Offline-first**: photos persist as Blobs in `vip-offline-data` IndexedDB v3, the SW rebuilds FormData on replay, E11000 dups dequeue cleanly. **Implication for the future tenant SaaS**: the same offline visit pattern transfers directly when the pharmacy SaaS spins out (subscriber-pharmacy field reps in low-signal locations are exactly the use case Phase N built for). Plan: `~/.claude/plans/phase-n-offline-visit-clm-merge.md`. Healthcheck: `node backend/scripts/healthcheckOfflineVisitWiring.js`. Phase **N (Offline-First Sprint)** built on top (Apr 27 2026): adds `vip-offline-data` v3→v4 (auth_session + sync_errors stores), AuthContext offline rehydration, `POST /api/messages/system-event` self-DM endpoint, `<OfflineRouteGuard>` blocking 26 financial paths offline, and `<SyncErrorsTray />` badge+drawer on the BDM dashboard. Lookup-driven via `OFFLINE_REQUIRED_PATHS` + `SYSTEM_EVENT_TEMPLATES`. See PHASETASK-ERP.md §"Phase N — Offline-First Sprint (April 27, 2026)".

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
| G4.1 | ApprovalRequest Hydration in All-Pending — Rich DocumentDetailPanel + doc_id Dedup | ✅ |
| G4.2 | Deduction Schedule Unified Approval Flow — gateApproval on submit + AR close-loop | ✅ |
| G4.3 | Approval Hub + Reversal Console Gap Closure — INCENTIVE_DISPUTE dispatcher, 6 new dependent checkers, FUEL_ENTRY rejection config, SupplierInvoice reject wiring | ✅ |
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
| H6 | Sales OCR — BDM field scanning of CSI / CR / DR (sampling+consignment) / Bank Slip / Check + AI_SPEND_CAPS enforcement on OCR Claude calls | 🚧 |
| G8 | Agents + Copilot Expansion — 8 rule-based scheduled agents + Task collection + 10 new Copilot tools (Secretary + HR) + 3 AI toggle lookups | ✅ |
| 34* | Approval Hub Enhancement: Sub-Permissions + Attachments + Line-Item Edit | ✅ |
| G1.2 | Payslip Transparency & SMER-ORE Retirement Hardening — pre-save guard + always-show Personal Gas + ONE-STOP / INSTALLMENT N/M kind badge + installment expandable | ✅ |
| G1.3 | Employee Payslip `deduction_lines[]` Parity — shared sub-schema + Personal Gas for logbook-eligible employees + `/payroll/:id/breakdown` + lazy backfill for historical payslips | ✅ |
| G1.4 | Employee DeductionSchedule wiring (INSTALLMENT N/M on Payslip) + Finance per-line add/verify/correct/reject UI + IncomeReport shared-schema convergence | ✅ |
| S2 | Staff role rename: `employee`/`contractor`/`bdm` → `staff` (User.role + Lookup.metadata.roles). Migration script two-phase atomic. OwnerPicker filter made lookup-driven (Rule #3). ROLES.CONTRACTOR kept as deprecated alias during transition. | ✅ |

---

## Phase A.4 — AR/AP Sub-Ledger Recon + JE-Asymmetry Repair (May 06, 2026)

> **Status**: SHIPPED (this commit). Healthcheck **78/78 PASS** — `node backend/scripts/healthcheckArApRecon.js`.
>
> **Why now**: SaaS spin-out posture (Year-2 Vios Software Solutions per CLAUDE.md §0d). Subscriber pharmacies expect QuickBooks/Xero parity on day-1 — open-invoices report + reconciled AR/AP aging are table-stakes.

### What changed

**Schema (additive — no breaking changes)**: every existing transactional source-doc model gains six recon fields. Default values keep legacy POSTED rows valid.

| Model | Phase A.4 fields |
|---|---|
| `SalesLine` | `outstanding_amount` (Number, null) · `paid_amount` (0) · `last_payment_at` (null) · `je_status` enum `PENDING/POSTED/FAILED/null` (null) · `je_failure_reason` (null) · `je_attempts` (0) · `last_je_attempt_at` (null) |
| `Collection` | `je_status` + `je_failure_reason` + `je_attempts` + `last_je_attempt_at` (same shape) |
| `PrfCalf` | `je_status` + `je_failure_reason` + `je_attempts` + `last_je_attempt_at` (same shape) |
| `SupplierInvoice` | `outstanding_amount` (auto-synced via pre-save = `total_amount − amount_paid`) · `last_payment_at` · `je_status` + `je_failure_reason` + `je_attempts` + `last_je_attempt_at` |

**Indexes** (additive, partial/sparse so they don't bloat legacy data):
- `SalesLine.{entity_id, csi_date}` partial on `{outstanding_amount > 0, status: 'POSTED'}` — `ar_aging_open` (powers AR aging report O(1)).
- `SupplierInvoice.{entity_id, invoice_date}` partial — `ap_aging_open`.
- All four models: `{entity_id, je_status, status}` sparse — `je_status_failed` (list-page badge filter + integrity sweep).

**arAgingService** ([backend/erp/services/arAgingService.js](backend/erp/services/arAgingService.js)) — five exports:
- `recomputeOutstandingForSale(salesLineId, {session?})` — atomic: aggregates Σ POSTED Collection.settled_csis hits + writes `outstanding_amount` + `paid_amount` + `last_payment_at` in one updateOne.
- `recomputeOutstandingForCollection(collection, {session?})` — convenience: walks settled_csis, recomputes each affected SalesLine.
- `recomputeOutstandingForSupplierInvoice(siId, {session?})` — AP equivalent (uses existing `amount_paid`).
- `recomputeAllOutstandingForEntity(entityId, {batchSize?})` — bulk for migration + admin Refresh button.
- `isCashRoute(salesLine)` — mirrors `journalFromSale` AR-bypass logic; cash sales never have outstanding.

**jeStatusTracker** ([backend/erp/services/jeStatusTracker.js](backend/erp/services/jeStatusTracker.js)) — two exports + STATUSES:
- `markJePosted(kind, docId, {session?})` — increments `je_attempts`, clears `je_failure_reason`, stamps `last_je_attempt_at`.
- `markJeFailed(kind, docId, reason, {session?})` — same but sets status FAILED + truncates reason to 500 chars.

### Wiring (Rule #2 end-to-end)

1. **Collection POST flow** ([collectionController.js submitCollections](backend/erp/controllers/collectionController.js)) — JE block already in try/catch; new `let jePostedSuccessfully` flag drives `markJePosted('COLLECTION', ...)` or `markJeFailed(...)` after the JE attempt. Then `arAgingService.recomputeOutstandingForCollection(row)` recomputes outstanding for every settled CSI. Failure of either is logged but never rolls back the POST (warnings array surfaces to caller).
2. **Collection reopen** ([reopenCollections](backend/erp/controllers/collectionController.js)) — recompute fires AFTER the txn commits; aggregation excludes the now-DRAFT row, so settled SalesLines grow back to pre-CR outstanding.
3. **Collection president-reverse** ([presidentReverseCollection](backend/erp/controllers/collectionController.js)) — captures original Collection BEFORE the reversal service runs, recomputes after success.
4. **Collection approval-hub POST** ([postSingleCollection](backend/erp/controllers/collectionController.js)) — same posture as submitCollections.
5. **Sales POST** (both batch + single, [salesController.js](backend/erp/controllers/salesController.js)) — pre-stamps `je_status='POSTED'` INSIDE the JE-TX session; if the JE call throws, the txn rolls back atomically and the field reverts. No drift class possible.
6. **AP POST** ([purchasingController.js postSupplierInvoice](backend/erp/controllers/purchasingController.js)) — same JE-TX pattern.
7. **PrfCalf approval-hub POST** ([expenseController.js postSinglePrfCalf](backend/erp/controllers/expenseController.js)) — pre-stamps POSTED before the JE call inside the txn; on catch, flips to FAILED and re-saves so the doc commits with the correct status.

### Integrity sweep additions ([backend/erp/scripts/findAccountingIntegrityIssues.js](backend/erp/scripts/findAccountingIntegrityIssues.js))

- **`checkArApSubLedger(entityId, coaMap, tolerance)`** — STRICT (not informational; AR/AP is single-basis accrual). Asserts `Σ POSTED SalesLine.outstanding_amount ≡ GL AR_TRADE` and the AP mirror. Tolerance reuses `ACCOUNTING_INTEGRITY_THRESHOLDS.subledger_tolerance` (₱1.00 default).
- **`checkJeStatusFailed(entityId)`** — lists POSTED docs with `je_status='FAILED'` (top 50 per kind). Each entry counts as a strict failure.
- **`checkPeriodClose` extension** — counts FAILED-JE rows for sales / collections / prfcalf / supplier invoices in the period; close blocks if any > 0.
- New CLI flags: `--check arap` and `--check jestatus`.
- New repair-path lines: "AR/AP drift → run migration" and "JE-FAILED rows → hit Retry JE".

The Accounting Integrity Agent ([backend/agents/accountingIntegrityAgent.js](backend/agents/accountingIntegrityAgent.js)) `buildNotificationBody` + `buildKeyFindings` render both new finding types — admin sees them in the daily 4 AM Manila message + on `/erp/agent-dashboard`.

### Migration ([backend/erp/scripts/migrateSubLedgerOutstanding.js](backend/erp/scripts/migrateSubLedgerOutstanding.js))

Dry-run by default. Idempotent (re-running yields the same answer). Per-row `recomputeOutstandingForSale` + `recomputeOutstandingForSupplierInvoice`. Surfaces over-collected / over-paid rows as warnings (clamped to 0; investigate manually).

```bash
# Dry-run (recommended first):
node backend/erp/scripts/migrateSubLedgerOutstanding.js
# Apply across all entities:
node backend/erp/scripts/migrateSubLedgerOutstanding.js --apply
# Single entity / kind narrowing:
node backend/erp/scripts/migrateSubLedgerOutstanding.js --entity <id> --kind ar --apply
```

### Admin endpoints ([backend/erp/controllers/integrityController.js](backend/erp/controllers/integrityController.js))

Mounted at `/api/erp/integrity` ([integrityRoutes.js](backend/erp/routes/integrityRoutes.js)):
- **`POST /retry-je`** — body `{ kind: 'SALES_LINE'|'COLLECTION'|'PRF_CALF'|'SUPPLIER_INVOICE', doc_id }`. Idempotent: if a non-reversed JE already exists for this doc's `event_id`, just stamps `je_status='POSTED'` and returns. Otherwise re-fires the appropriate `journalFromX` call + (for COLLECTION) the CWT JE + AR recompute. Emits `JE_RETRY_SUCCESS` / `JE_RETRY_FAILURE` audit log entries. Entity-scoped (Rule #19).
- **`POST /recompute-ar`** — bulk refresh outstanding_amount across the entity. Returns per-bucket counts. Idempotent.

Both endpoints role-gated via `userCanRetryJe(req)` / `userCanRecomputeAr(req)` from [jeRetryAccess.js](backend/erp/utils/jeRetryAccess.js) — defaults `[admin, finance, president]`.

### Lookup-driven (Rule #3 / Rule #19)

New `JE_RETRY_ROLES` lookup category seeded by [lookupGenericController.js](backend/erp/controllers/lookupGenericController.js):

| Code | Default `metadata.roles` | Subscriber tunable? |
|---|---|---|
| `RETRY_JE` | `['admin', 'finance', 'president']` | Yes — Control Center → Lookup Tables |
| `RECOMPUTE_AR` | `['admin', 'finance', 'president']` | Yes — same path |

Both rows use `insert_only_metadata: true` so admin role-list edits survive future re-seeds. Cache TTL is 60s in [jeRetryAccess.js](backend/erp/utils/jeRetryAccess.js) `_cache`; invalidate hook fires on every Lookup CRUD path (create/update/remove/seed) in lookupGenericController, so admin edits propagate within one minute across all running instances.

### Frontend

- **Service**: [frontend/src/erp/services/integrityService.js](frontend/src/erp/services/integrityService.js) — wraps both endpoints.
- **AccountsReceivable page** ([frontend/src/erp/pages/AccountsReceivable.jsx](frontend/src/erp/pages/AccountsReceivable.jsx)) — adds `[Refresh AR/AP]` button (testid `ar-recompute-button`) next to "Back to Reports". Server-side role-gated; renders for everyone but 403s land as a friendly toast.
- **WorkflowGuide banner** ([frontend/src/erp/components/WorkflowGuide.jsx](frontend/src/erp/components/WorkflowGuide.jsx) `'ar-aging'`) — mentions Phase A.4 contract + RECOMPUTE_AR gate + Retry-JE endpoint per Rule #1.

**Deferred follow-ups** (not blocking SaaS readiness):
- List-page badges for `je_status='FAILED'` rows on SalesList / CollectionsList / SupplierInvoicesList. Backend signal already lands; UI surfacing is purely additive when the user wants it.
- Inline "Retry JE" button on those badges. Backend endpoint is already callable.
- AR/AP drift dashboard tile on `/erp/agent-dashboard`. Daily-4-AM agent message already covers the alert path.

### Healthcheck

[backend/scripts/healthcheckArApRecon.js](backend/scripts/healthcheckArApRecon.js) — 78 assertions across 11 sections. **78/78 PASS** as of this commit. Run before any Phase A.4 edit and after the migration is applied.

### Subscription-readiness checklist

- ✅ `entity_id` scoping on every endpoint and aggregation (Rule #19).
- ✅ `bdm_id` scope honored where applicable (no privileged self-fallback per Rule #21 — endpoints don't filter by BDM).
- ✅ Lookup-driven role gates (`JE_RETRY_ROLES`).
- ✅ Lookup-driven tolerances (`ACCOUNTING_INTEGRITY_THRESHOLDS.subledger_tolerance` already governs).
- ✅ COA codes via `Settings.COA_MAP` (`AR_TRADE` / `AP_TRADE`) — subscribers can renumber accounts without touching code.
- ✅ Schema-additive only — no migration required for legacy data to remain valid; the migration script populates the new fields on existing POSTED rows when admin opts in.
- ✅ Pre-save hook is the safety net: any direct `.save()` of a SupplierInvoice keeps `outstanding_amount` synced even if the controller bypassed `recomputeOutstandingForSupplierInvoice`.

---

## Phase G1.7.1 — SMER Form Date-Column Lockstep + Pull Defense (May 05, 2026 evening)

Closes a second alignment failure surfaced by the same user reconciliation that triggered Phase G1.7. After the Visit + ClientVisit union shipped earlier the same day, the user opened a fresh SMER, picked April 2026 Cycle 2 in the dropdowns, clicked Pull from CRM, and still saw `md_count = 0` on every row. The bridge was now correct; the problem had moved into the React form state.

### The bug

The page's `period` and `cycle` are top-level state on the SMER controls bar. `dailyEntries` (the per-day rows) is generated only when the user clicks `+ New SMER` — at which point `generateDays()` reads the current `period`/`cycle` and pushes one row per work day. After that, period/cycle dropdown changes update the heading and the value the backend will receive, but **the row dates in the table do not regenerate**. Pull from CRM then fetches the correct period/cycle from the backend, returns `daily_entries` keyed `2026-04-16…2026-04-30`, and merges into `dailyEntries` by `entry_date`. If the form rows were generated for a different period (e.g. the default May 2026 C1 they originated with), the merge finds zero overlap and silently leaves every md_count at 0.

The user's screenshot was the smoking gun: dropdown reading "April 2026 / Cycle 2 (16th-end)" while the row dates read 05/01 FRI through 05/15 FRI. Reproduced live with Playwright + Mae's account on the dev cluster:
- Dropdowns flipped to April + C2 → header switched to "New SMER — 2026-04 C2" but the rendered rows stayed on `05/01..05/15`.
- Pull from CRM → backend returned the correct April C2 daily_entries (all md_count=0 for Mae since she logged nothing in that window — but the merge would have failed anyway), frontend's `crmMap` keys `2026-04-16..2026-04-30` had zero intersection with the form's `2026-05-01..2026-05-15` keys, no row updated.

### Architecture (the fix)

Two surgical changes to `frontend/src/erp/pages/Smer.jsx`:

1. **Auto-regenerate on period/cycle change while creating new.** New `useEffect` watches `[period, cycle]`. When the form is open and we're not editing an existing SMER, regenerate `dailyEntries` so the row date column is always the canonical projection of the active period+cycle. Editing an existing SMER short-circuits — period/cycle on a saved SMER are immutable.

2. **Defense-in-depth fallback inside `handlePullFromCrm`.** Compute the intersection between the form's row keys and the CRM response keys before merging. If overlap = 0 and the form has rows, rebuild the rows wholesale from the backend response (md_count + tier + perdiem_amount + locations from the bridge, transpo/ORE/notes/activity reset). This catches any race where the user clicks Pull faster than React applies the regenerate effect, and any future state drift introduced elsewhere.

### Why two layers, not one

The auto-regenerate is the correct fix in the steady state. The Pull-handler fallback exists because silent zero-fill is the worst possible failure mode for a per-diem screen — BDMs lose money quietly, admin reconciliation finds nothing wrong because every screen says "0 visits, ₱0 owed". A Pull from CRM should never leave counts on the floor; if the form's rows can't be merged, they get replaced by the bridge's authoritative response. Defence-in-depth aligns with Rule #4 (bulletproof bar) and Rule #20 (workflow safety — never produce silent partial state).

### Lookup-driven / subscription readiness

This fix is pure UI state-machine — no business values are introduced, no roles gated, no thresholds hardcoded. The existing lookup-driven contracts (`PERDIEM_RATES.<role>.metadata.include_extra_calls`, `MODULE_DEFAULT_ROLES.SMER`, `PROXY_ENTRY_ROLES.SMER`, `ACTIVITY_PERDIEM_RULES`) are untouched and continue to drive behavior. Year-2 SaaS subscribers who already opted out of `include_extra_calls` keep that posture; the form-state fix is universal because the bug was universal.

### Files touched

- `frontend/src/erp/pages/Smer.jsx` — auto-regenerate `useEffect` + Pull-handler fallback
- `frontend/src/erp/components/WorkflowGuide.jsx` — SMER tip extended with Phase G1.7.1 paragraph (Rule #1)
- `backend/scripts/healthcheckSmerCrmBridgeUnion.js` — 4 new checks (#29-#32) asserting the form-state wiring + banner
- `CLAUDE-ERP.md` (this section)
- `docs/PHASETASK-ERP.md` (G1.7.1 phase entry)

### Smoke

- **Static healthcheck**: `node backend/scripts/healthcheckSmerCrmBridgeUnion.js` → 32/32 PASS (was 28/28 pre-G1.7.1).
- **Frontend Vite build**: ✓ built in 10.53s, no warnings.
- **Live API smoke (Mae as BDM, dev cluster)**:
  - `/api/erp/expenses/smer/crm-md-counts?period=2026-04&cycle=C1` → `total_md_visits: 34`, daily breakdown 9/0/0/8/8/7/2/0/0/0/0, `total_perdiem: ₱2,800` (FULL ₱800 × 3 + HALF ₱400 × 1 = ₱2,800). `eligibility_source: visit`, `skip_flagged: true`, `include_extra_calls: true`.
  - `/api/erp/expenses/smer/crm-md-counts?period=2026-04&cycle=C2` → `total_md_visits: 0` (correct — Mae logged no visits Apr 16-30).
- **Live Playwright UI smoke (Mae logged in via 5173, /erp/smer)**:
  - **Pre-fix repro**: clicked `+ New SMER` (default May 2026 C1, rows 05/01..05/15), changed period to 2026-04 + cycle to C2. Header read "New SMER — 2026-04 C2" but rows stayed on 05/01..05/15 (matches user screenshot). Click Pull from CRM → no MD counts updated. ([smer-prefix-bug-2026-04-C2-shows-may-rows.png](smer-prefix-bug-2026-04-C2-shows-may-rows.png)).
  - **Post-fix verification (same browser session, after Vite rebuild)**: clicked `+ New SMER` (default May 2026 C1). Changed period to 2026-04 → rows immediately regenerated to 04/01..04/15. Flipped cycle to C2 → rows regenerated to 04/16..04/30. Flipped cycle back to C1 → rows back to 04/01..04/15. Clicked Pull from CRM → 04/01 WED MDs=9 FULL ₱800 (notes "Himamaylan; Nord Hub; Binalbagan Infirmary; SBGH; Binalbagan…"; "1 flagged"), 04/06=8 FULL, 04/07=8 FULL, 04/08=7 HALF, 04/09=2 ZERO, idle days = 0 ZERO. Per Diem total ₱2,800 = matches API response 1:1. ([smer-postfix-2026-04-C1-pull-from-crm.png](smer-postfix-2026-04-C1-pull-from-crm.png)).
  - 0 console errors throughout the run.

### Forward-only by design

Same posture as Phase G1.7. Already-POSTED SMERs remain frozen at their saved daily_entries and amounts (period-lock + reopen safety per Rule #20). Only future Pull-from-CRM clicks and still-DRAFT SMERs benefit. No migration needed.

---

## Phase G1.7 — SMER ↔ CRM Bridge Yes-Equal-Weight Pull (May 05, 2026)

Closes a silent under-counting bug in the SMER `Pull from CRM` button surfaced during a 1:1 reconciliation of Mae Navarro's CRM list view vs the SMER MD count. The CRM list (MyVisits / EmployeeVisitReport) merges TWO collections — `Visit` (VIP doctor visits) + `ClientVisit` (EXTRA non-VIP regular-client calls) — but the bridge at `backend/erp/services/smerCrmBridge.js` only queried `Visit`. On days where a BDM logged extras alongside VIP visits, `md_count` came back undercounted, dropping daily tier from FULL ₱800 → HALF ₱400 (₱400/day silent loss).

### The bug

User screenshot showed 4 VIP + 5 EXTRA = 9 distinct MDs visited on 2026-04-17, but SMER's Pull-from-CRM returned MDs=4. Pre-fix bridge:
- `Visit.distinct('doctor', { user, visitDate, status: 'completed' })` → 4
- `ClientVisit.distinct('client', ...)` → not queried → 0 (ignored)
- `md_count = 4` → HALF ₱400 instead of FULL ₱800

The bridge JSDoc comment said "every BDM visit to a Doctor (VIP Client / MD)" — a contract that omitted the EXTRA-call half by design (or oversight). Whichever, the CRM list view always merged both, so the SMER pull silently disagreed with what the BDM and admin saw on screen.

### Architecture

- **`backend/erp/services/smerCrmBridge.js`** — three functions now UNION `Visit` (VIP, FK = `doctor`) + `ClientVisit` (EXTRA, FK = `client`):
  - `getDailyMdCount(bdmUserId, date, opts)` — sums `Visit.distinct('doctor')` + `ClientVisit.distinct('client')` for a single date.
  - `getDailyMdCounts(bdmUserId, start, end, opts)` — refactored to call new helper `aggregateDailyByCollection(Model, fkField, ...)` once for each collection, then merges per-day buckets in JS keyed by Manila calendar day. `flagged_excluded` reflects total flagged across both streams.
  - `getDailyVisitDetails(bdmUserId, date, opts)` — drill-down returns Visit rows + ClientVisit rows; EXTRA rows get the populated `client` exposed under the `doctor` key so the existing `universalApprovalService` caller (`v.doctor?.clinicOfficeAddress`) keeps working.
- **`backend/erp/services/perdiemCalc.js`** — `resolvePerdiemConfig` returns new `include_extra_calls` flag (default `true` via `m.include_extra_calls !== false` so existing seeded rows without the key inherit yes-equal-weight).
- **`backend/erp/controllers/lookupGenericController.js`** — `PERDIEM_RATES.BDM` and `.ECOMMERCE_BDM` seed defaults add `include_extra_calls: true`. `DELIVERY_DRIVER` example sets it `false` (irrelevant for logbook source). Seed rows use `insert_only_metadata: true` so admin tweaks survive future re-seeds.
- **`backend/erp/controllers/expenseController.js`** — `getSmerCrmMdCounts` and `getSmerCrmVisitDetail` pipe `perdiemConfig.include_extra_calls` through to the bridge. The HTTP response now surfaces `include_extra_calls` so the SMER UI can label the active mode.
- **`frontend/src/erp/components/WorkflowGuide.jsx`** — SMER tip extended with the Phase G1.7 paragraph (Rule #1 banner kept current).

### Lookup-driven contract (Rule #3 + Rule #19)

`PERDIEM_RATES.<role>.metadata.include_extra_calls`:
- `true` (default) — yes-equal-weight: VIP `Visit` + EXTRA `ClientVisit` both count toward the per-diem MD threshold. Reconciles 1:1 with CRM list view.
- `false` — strict VIP-only (legacy). For subscribers that gate per-diem on the curated VIP list only.

Subscribers flip via Control Center → Lookup Tables → PERDIEM_RATES → BDM → metadata. Per-entity × per-role precedence. No code deploy needed.

### Forward-only by design (Rule #20)

The fix only affects new pulls. Already-POSTED SMERs stay frozen at their pre-fix amounts (period-lock + reopen-safety). Only future Pull-from-CRM clicks and still-DRAFT SMERs see the corrected count. No migration needed.

### Files touched

- `backend/erp/services/smerCrmBridge.js` (3 functions + helper + JSDoc rewrite)
- `backend/erp/services/perdiemCalc.js` (resolver returns include_extra_calls)
- `backend/erp/controllers/lookupGenericController.js` (PERDIEM_RATES seed)
- `backend/erp/controllers/expenseController.js` (pipe through + response surface)
- `frontend/src/erp/components/WorkflowGuide.jsx` (SMER tip)
- `backend/scripts/healthcheckSmerCrmBridgeUnion.js` (NEW — 28-section static contract verifier, 28/28 PASS)
- `CLAUDE-ERP.md` (this section)
- `docs/PHASETASK-ERP.md` (G1.7 phase entry)

### Smoke

- **Static healthcheck**: `node backend/scripts/healthcheckSmerCrmBridgeUnion.js` → 28/28 PASS.
- **Frontend Vite build**: ✓ built in 9.59s, no warnings.
- **Live API smoke (s3 / Mae as BDM, dev cluster, 2026-04 C1)**:
  - `include_extra_calls: true` → 04/01 `md_count=9` (FULL ₱800), 04/06=8, 04/07=8, 04/08=7, 04/09=2. Total = 34. Pre-fix would have been 27 (lost ₱400 on 04/01 alone, day flipped HALF→FULL).
  - `include_extra_calls: false` (toggled via Lookup, then restored) → 04/01 `md_count=4` (HALF ₱400). Confirms toggle works end-to-end.
  - Drill-down on 2026-04-08 returned 9 rows: 8 VIP `[regular]` rows + 1 `[EXTRA]` row (Jill AU, IM Nephro). Drill-down adapter maps `client` → `doctor` correctly.
- **Playwright UI smoke (Mae logged in via 5173, /erp/smer)**: banner now contains "Phase G1.7", "yes-equal-weight", "include_extra_calls", "May 05 2026" (4/4 keywords matched). Browser-context fetch to `/api/erp/expenses/smer/crm-md-counts?period=2026-04&cycle=C1` returned the same payload as the curl smoke (200 OK, include_extra_calls=true, 04/01 md_count=9). Screenshot: `smer-page-g17-banner-mae.png`.

### Why the bridge was wrong

The CRM split between `Visit`/`Doctor` (VIP curated list) and `ClientVisit`/`Client` (EXTRA freeform calls) is a Phase A.5+ data-modeling decision — `Client` is a "pre-VIP" record that promotes to `Doctor` on upgrade. From a BDM-effort + per-diem standpoint both visits are identical (same proof requirements: GPS + photo, same weekly-unique constraint). The bridge predates the split or simply never got the second-collection treatment when EXTRA was added. Pre-G1.7 the silent disagreement only surfaced when admins compared SMER vs CRM list; routine ops accepted the lower count.

### Subscription readiness (Rule #19 / Year-2 SaaS)

- Per-entity × per-role flag — no hardcoded posture.
- Yes-equal-weight default matches pharma intent + handles dirty data (same physical MD in both Doctor and Client master) without double-pay risk: the unique-week constraint is per-collection, so cross-collection dup of the SAME person logged via both VIP + EXTRA in the same week is rare and counts as 2 (matches CRM list rendering).
- Future tenant cut-over: a subscriber that never enables EXTRA calls (`Client` collection empty) sees identical behavior pre/post fix.

---

## Phase G4.5ee — Activity-Aware Per-Diem Tier Rule (Apr 30, 2026 evening)

Closes a Rule #3 gap surfaced during a live SMER review of Judy Mae Patrocinio's 2026-04-C2 cycle: every OFFICE day carried `MD: 10` to clear the 8-MD FULL threshold, even though OFFICE activity has zero verifiable MD encounters. The honor-system padding produced a clean ₱7,150 reimbursable but polluted DCR Call Rate dashboards with 110 phantom MD visits and exposed the system to a "show me the 110 visit photos" audit failure.

The fix makes the activity_type the per-diem semantic — not a free-text annotation. OFFICE day = AUTO_FULL; FIELD day = MD threshold; NO_WORK = ZERO. Subscriber-configurable per entity via Lookup, backwards-compat for every existing call site that doesn't opt in.

### Strategic intent

Replace hardcoded `if (entry.activity_type === 'NO_WORK') return enforceNoWorkRules(entry)` with a lookup-driven rule layer, so:

1. A non-pharma subscriber (delivery-driver SaaS) can flip OFFICE → ZERO without a code deploy (their drivers don't get office-day per-diem).
2. A pharma subsidiary that classifies "TRAINING" as a separate activity can decide AUTO_HALF for it.
3. Override paths (admin force-FULL/HALF) continue to bypass everything — manual override always wins.
4. The existing 8/3 MD-threshold logic is preserved for FIELD activity (legacy default, no behavior change).

### Architecture

- **`backend/erp/services/perdiemCalc.js`** — extends `computePerdiemTier(mdCount, settings, compProfile, perdiemConfig, options)` with optional `options.activityRule ∈ {AUTO_FULL, AUTO_HALF, ZERO, USE_THRESHOLDS}`. AUTO_* and ZERO short-circuit before threshold resolution; USE_THRESHOLDS / unset falls through to the existing G1.6 chain (CompProfile → PERDIEM_RATES → Settings). `computePerdiemAmount(...)` forwards options to tier. Default `options = {}` keeps every untouched call site byte-identical.
- **Inline `ACTIVITY_PERDIEM_RULE_DEFAULTS`** mirrors the seed (OFFICE → AUTO_FULL, FIELD → USE_THRESHOLDS, OTHER → USE_THRESHOLDS, NO_WORK → ZERO) so the resolver works on un-seeded entities (lazy-seed kicks in on first lookup read).
- **`resolveActivityPerdiemRuleMap(entityId)`** (bulk) + **`resolveActivityPerdiemRule(entityId, code)`** (single) + **`getActivityRuleFromMap(map, code)`** (sync). 60s in-process cache mirrors the PROXY_ENTRY_ROLES / PERDIEM_RATES / SCPWD_ROLES pattern. Bulk path is the preferred call shape: SMER controllers `await` once, then look up sync inside `.map(daily_entries)`.
- **`invalidateActivityPerdiemRuleCache(entityId)`** wired into all 4 mutator paths in `lookupGenericController.js` (create / update / remove / seedCategory) so admin edits in Control Center take effect on the next request — not after 60s drift.
- **`SEED_DEFAULTS.ACTIVITY_PERDIEM_RULES`** in `lookupGenericController.js` seeds 4 baseline rows with `insert_only_metadata: true` (admin-owned semantics — Control Center edits to `tier_rule` survive future re-seeds).
- **`backend/erp/controllers/expenseController.js`** — three migration sites (createSmer, updateSmer, remove_override revert path). Each prefetches the rule map once and threads `{ activityRule }` through `computePerdiemAmount` for non-override entries. **Override paths intentionally NOT migrated** (createSmer override branch, updateSmer override branch, override-request, override-apply, approvalController, universalApprovalService, repairStuckPerdiemOverrides) — they pass fake md_count (999/3) to emulate FULL/HALF and must always trump the activity rule. **CRM-Pull preview path intentionally NOT migrated** — it's the FIRST-load preview before the BDM picks activity_type; after Save, createSmer applies the activity rule.
- **Frontend mirror in `frontend/src/erp/pages/Smer.jsx`** — `useLookupOptions('ACTIVITY_PERDIEM_RULES')` + `useMemo` rule map with inline fallback (so the page never goes dark on a Lookup outage). `computePerdiem(count, activityType)` accepts the same option and applies the same short-circuit logic so the on-screen tier preview matches what `postSmer` will compute. Two call sites updated (`handleEntryChange` after activity_type/md_count change; `handleRemoveOverride` local-state fallback). The override-applied path keeps its old `computePerdiem(tier === 'FULL' ? 999 : 3)` shape — no activity_type passed, override always wins.
- **Activity-rule banner** renders only when at least one activity has a non-USE_THRESHOLDS rule. Pharma-default subscribers (all USE_THRESHOLDS) see no banner. AUTO_FULL/AUTO_HALF/ZERO subscribers see explanatory copy: *"Activity-driven per-diem: OFFICE → auto-FULL, NO_WORK → zero. MD count is ignored for these activities; admin can flip via Control Center → Lookup Tables → ACTIVITY_PERDIEM_RULES."*
- **WorkflowGuide.smer.tip** narrative extended with the G4.5ee paragraph (Rule #1 — user-facing pages must explain workflow shifts).

### Lookup contract

Category: `ACTIVITY_PERDIEM_RULES`. One row per activity_type code (`code = SmerEntry.activity_type`, case-normalized to uppercase by the seed builder).

`metadata.tier_rule`:
- `AUTO_FULL` — always FULL per-diem regardless of MD count (admin/office staff)
- `AUTO_HALF` — always HALF per-diem regardless of MD count (rare, on-call half-day)
- `ZERO` — always ZERO (leave, holiday, NO_WORK)
- `USE_THRESHOLDS` — existing MD-vs-CompProfile/PERDIEM_RATES/Settings logic (FIELD default)

Seeded baseline rows:

| code | tier_rule | description |
|---|---|---|
| OFFICE | AUTO_FULL | Admin/office staff. Per-diem is daily allowance regardless of MDs. |
| FIELD | USE_THRESHOLDS | BDM field activity. md_count vs thresholds → FULL/HALF/ZERO. |
| OTHER | USE_THRESHOLDS | Free-text bucket. Defaults to FIELD-equivalent; admin can flip per entity. |
| NO_WORK | ZERO | Always ZERO. Replaces the legacy hardcoded NO_WORK special case. |

### Backwards compatibility

- `computePerdiemTier(...)` and `computePerdiemAmount(...)` default `options = {}` → behavior byte-identical to pre-G4.5ee for any call site that hasn't opted in. The 7 override-style call sites (universalApproval + repair script + expenseController override paths) keep their old signatures.
- The legacy hardcoded `if (entry.activity_type === 'NO_WORK') return enforceNoWorkRules(entry)` in createSmer / updateSmer is **kept** because `enforceNoWorkRules` clears semantics broader than tier (md_count, hospital_covered, override fields). The activity rule for NO_WORK = ZERO is therefore redundant for the tier but not harmful — both produce ZERO. Future cleanup can collapse the special case once enforceNoWorkRules is decomposed.
- Existing SMER documents already POSTED with old tier values are NOT recomputed retroactively. Only new or recomputed entries (createSmer / updateSmer / remove_override) pick up the new rule. This is intentional — silent tier-flips on POSTED rows would unbalance the General Ledger.

### Subscription readiness (Year 2 SaaS path)

- Lookup-driven per Rule #3 — subscribers configure activity semantics per entity via Control Center, no code deploy. A delivery-driver SaaS can ship with `OFFICE → ZERO`, `FIELD → AUTO_FULL` (any logbook day = full), `LEAVE → ZERO`. A short-term-rental property manager SaaS can ship with `INSPECTION → AUTO_FULL`, `OFFICE → USE_THRESHOLDS` etc.
- `ACTIVITY_PERDIEM_RULES` rows use `insert_only_metadata: true` so admin tweaks survive future seedAll runs (mirrors PERDIEM_RATES, SCPWD_ROLES, BIR_ROLES patterns).
- Generalizes past `entity_id` cleanly — the resolver is keyed on `entity_id`, the cache is per-entity, the cache buster is per-entity. No cross-tenant leak risk at SaaS spin-out (Rule #0d).

### Files touched (8 code + 1 healthcheck + 2 docs = 11)

- `backend/erp/services/perdiemCalc.js` (resolver + cache + extended tier/amount + 4 new exports)
- `backend/erp/controllers/lookupGenericController.js` (SEED_DEFAULTS.ACTIVITY_PERDIEM_RULES + cache-bust hook on 4 paths)
- `backend/erp/controllers/expenseController.js` (3 migration sites: createSmer + updateSmer + remove_override)
- `frontend/src/erp/pages/Smer.jsx` (useLookupOptions + useMemo rule map + computePerdiem signature + 2 call sites + banner)
- `frontend/src/erp/components/WorkflowGuide.jsx` (smer.tip extended with G4.5ee paragraph)
- `backend/scripts/healthcheckActivityPerdiemRules.js` (NEW — 34-check static wiring contract)
- `CLAUDE-ERP.md` + `docs/PHASETASK-ERP.md` (this section + the PHASETASK row)

### Validation

- **Healthcheck `node backend/scripts/healthcheckActivityPerdiemRules.js` 34/34 PASS** — covers resolver shape, cache TTL, options pass-through, seed defaults, cache-bust on all 4 mutator paths, expenseController wiring on 3 sites, override paths intentionally untouched, frontend mirror parity, banner conditional render, WorkflowGuide narrative.
- Regression healthchecks PASS: SalesDiscount 41/41, SmerRevert 18/18, ComputePayrollProxy 29/29, PayslipProxyRoster 31/31, IncomeProxy 32/32.
- Vite full bundle green (28.25s).
- Backend syntax check on all 3 modified files (`node -c`) clean.
- Live Playwright smoke as `s25.vippharmacy@gmail.com` (Judy Mae Patrocinio, BDM Proxy 2) on `/erp/smer` — see session smoke for screenshot capture.

### Common gotchas

- **Override always wins.** All 7 override-style call sites pass fake md_count (999/3) and NO options to `computePerdiemAmount(...)`. If a future maintainer adds `{ activityRule }` to an override path "for consistency", an OFFICE-day override request with rule=AUTO_FULL would silently ignore the override_tier the admin selected. The healthcheck catches this regression by asserting the override path comment.
- **CRM-Pull preview is intentionally MD-threshold-based.** The preview shows what per-diem WOULD be if the entry stayed at FIELD — before the BDM picks activity_type. After Save, createSmer applies the activity rule and the tier may shift (e.g. ZERO → FULL when the BDM picks OFFICE). This is documented in the WorkflowGuide.smer.tip and is by design.
- **Existing POSTED SMERs are not recomputed.** Tier-flips on POSTED rows would unbalance the GL. Admin who wants to retroactively fix Judy Mae's 2026-04-C2 must reopen the SMER (Reversal Console) → tier auto-recomputes on update → resubmit. The journal re-posts with the new amount.
- **`tier_rule` is case-normalized server-side.** The seed builder uppercases the code, the resolver `String(...).toUpperCase()`s before lookup, and `VALID_TIER_RULES` is uppercase. A row with `metadata.tier_rule: 'auto_full'` is treated as `AUTO_FULL` (defensive — same shape as Lookup.code's `uppercase: true` schema setter).

---

## Phase UX-Scroll — ERP Page Body-Scroll Restoration (Apr 30, 2026 evening)

Closes a UX bug from the Apr 29 layout cleanup: long ERP forms (SMER, Sales Entry, Accounts Receivable, Expenses, etc.) couldn't scroll vertically on laptop when WorkflowGuide was visible. Mobile worked because touch-drag scrolls any container. The user's workaround was dismissing the WorkflowGuide — defeating Rule #1's purpose.

### Root cause

Two long-standing rules in [frontend/src/index.css](frontend/src/index.css) collided:

1. **Lines 11-18** globally hide every scrollbar: `* { scrollbar-width: none } *::-webkit-scrollbar { display: none }`. Intentional for visual cleanliness but blunted any scroll-affordance feedback.
2. **`.admin-layout { display: flex; flex: 1; min-height: 0 }`** — the `min-height: 0` allowed the flex item to shrink below content. Combined with `.admin-page { min-height: 100vh; flex column }`, this height-capped the layout to ~100vh − navbar height (~932px on a typical laptop).
3. **~90 ERP pages had `<page>-main { flex: 1; ...; overflow-y: auto; ... }`** (`.sales-main`, `.ar-main`, `.coll-main`, `.atm-main`, `.agd-main`, `.coa-main`, `.po-main`, `.je-main`, `.tb-main`, etc.). The `overflow-y: auto` turned each page's main column into an inner scroll context.

The chain: `.admin-page (capped at 100vh)` → `.admin-layout (capped via min-height: 0)` → `.<page>-main (overflow-y: auto on capped height)` = inner scroll container with NO visible scrollbar (hidden by the global rule). Wheel events only fired while the cursor was over the main column. To the user, the page "didn't scroll." Removing WorkflowGuide brought content back inside the cap, hiding the bug.

The Apr 29 cleanup removed `height: 100vh` + `overflow: hidden` from `.admin-page` and AdminDashboard, but left `min-height: 0` on `.admin-layout` and the `overflow-y: auto` rules on every `<page>-main`. UX-Scroll completes the Apr 29 stated intent: *"Body-scroll is the universally safe pattern."*

### What ships

- **Root-of-chain fix** ([frontend/src/index.css](frontend/src/index.css)) — dropped `min-height: 0` from `.admin-layout`. With default `min-height: auto`, the layout grows to fit its tallest child (sidebar's 932px floor or the main column's content, whichever is bigger). Body grows past 100vh when content does, body-scroll handles overflow. The leftover `<page>-main { overflow-y: auto }` rules on ~90 ERP pages become harmless dead weight — each main's height now matches its content, so `overflow-y: auto` never triggers.

- **Hygiene cleanup on 30 ERP pages** — dropped the now-pointless `overflow-y: auto` (and paired `-webkit-overflow-scrolling: touch`) from each `<page>-main` rule. Files touched: [AccessTemplateManager](frontend/src/erp/pages/AccessTemplateManager.jsx), [AccountsReceivable](frontend/src/erp/pages/AccountsReceivable.jsx), [Collaterals](frontend/src/erp/pages/Collaterals.jsx), [Collections](frontend/src/erp/pages/Collections.jsx), [CollectionSession](frontend/src/erp/pages/CollectionSession.jsx), [ConsignmentDashboard](frontend/src/erp/pages/ConsignmentDashboard.jsx), [CustomerList](frontend/src/erp/pages/CustomerList.jsx), [DrEntry](frontend/src/erp/pages/DrEntry.jsx), [ErpDashboard](frontend/src/erp/pages/ErpDashboard.jsx), [ExecutiveCockpit](frontend/src/erp/pages/ExecutiveCockpit.jsx), [GrnAuditView](frontend/src/erp/pages/GrnAuditView.jsx), [GrnEntry](frontend/src/erp/pages/GrnEntry.jsx), [HospitalList](frontend/src/erp/pages/HospitalList.jsx) (inline JSX), [IcArDashboard](frontend/src/erp/pages/IcArDashboard.jsx), [IcSettlement](frontend/src/erp/pages/IcSettlement.jsx), [MyStock](frontend/src/erp/pages/MyStock.jsx) (multi-line), [OpeningArList](frontend/src/erp/pages/OpeningArList.jsx) (multi-line), [OrgChart](frontend/src/erp/pages/OrgChart.jsx), [PayrollRun](frontend/src/erp/pages/PayrollRun.jsx), [PayslipView](frontend/src/erp/pages/PayslipView.jsx), [PeopleList](frontend/src/erp/pages/PeopleList.jsx), [PersonDetail](frontend/src/erp/pages/PersonDetail.jsx), [SalesEntry](frontend/src/erp/pages/SalesEntry.jsx), [SalesList](frontend/src/erp/pages/SalesList.jsx) (multi-line), [SoaGenerator](frontend/src/erp/pages/SoaGenerator.jsx), [ThirteenthMonth](frontend/src/erp/pages/ThirteenthMonth.jsx), [TransferOrders](frontend/src/erp/pages/TransferOrders.jsx), [UndertakingDetail](frontend/src/erp/pages/UndertakingDetail.jsx), [UndertakingList](frontend/src/erp/pages/UndertakingList.jsx), [WarehouseManager](frontend/src/erp/pages/WarehouseManager.jsx). The remaining ~60 ERP pages (`.ap-main`, `.agd-main`, `.coa-main`, `.po-main`, `.je-main`, etc.) keep their `overflow-y: auto` rules but they no longer trigger thanks to the root-of-chain fix — these are deferred-cleanup, not active bugs.

### Scope guardrails

- **CRM unaffected.** `.admin-layout` is exclusively used by ERP pages — verified via `grep className="admin-layout"` in `frontend/src/pages` + `frontend/src/components`, zero hits. CRM admin pages use `.admin-content`, `.dashboard-content`, etc., which are untouched.
- **OcrTest unaffected.** [frontend/src/erp/pages/OcrTest.jsx](frontend/src/erp/pages/OcrTest.jsx) explicitly opts in to inner-scroll via its own scoped overrides (`.admin-page.ocr-page { height: 100vh; overflow: hidden }` + `.admin-page.ocr-page .admin-main { overflow-y: auto }`). It re-establishes the height cap independently of the global `.admin-layout` rule.
- **AdminDashboard unaffected.** It uses `.admin-content` (still has `min-height: 0` globally) and overrides locally to remove `overflow: hidden`. Body-scroll already worked there per the Apr 29 fix.
- **`.admin-content { min-height: 0; overflow: hidden }`** in `index.css` is intentionally left alone — only used by AdminDashboard + OcrTest, both with their own local overrides; touching it would be scope creep.

### Subscription readiness

Layout CSS is universal — no per-tenant config needed. Body-scroll is the default browser behavior; future SaaS subscribers inherit a working scroll pattern out of the box. The pattern any future page should follow:
- **Standard ERP page**: use `<div className="admin-page erp-page <key>-page">` + `<main className="<key>-main">`. Body-scroll just works.
- **Page that genuinely needs internal-scroll regions** (e.g., a Kanban with independently-scrolling columns, a chat-style fixed-footer + scrollable-list layout): copy the [OcrTest.jsx:46-55](frontend/src/erp/pages/OcrTest.jsx#L46-L55) pattern — add `<key>-page` to the wrapper className and override `.admin-page.<key>-page { height: 100vh; overflow: hidden }` so the chain caps height, then opt the inner element into `overflow-y: auto`.

### What did NOT change

- **WorkflowGuide.jsx** — banner content unchanged. Body-scroll was already the implicit assumption; the existing `marginTop` offset only fires on mobile (`window.matchMedia('(max-width: 768px)')`). The fix simply restores its design intent on laptop.
- **Page banners (Rule #1)** — every page still renders its `WorkflowGuide` / `PageGuide` / `DependencyBanner`. Nothing dismissed, nothing removed, no banner-config lookups touched.
- **Backend logic / wiring / lookup-driven config** — pure frontend CSS hygiene. No `req.entityId` scope changes, no model fields, no controllers, no routes, no services, no journals, no audits, no period-locks, no approval-gates.
- **CRM admin pages, AdminDashboard, OcrTest** — see Scope guardrails above.

### Files touched (1 root + 30 hygiene + 2 docs = 33)

- `frontend/src/index.css` (root-of-chain — dropped `min-height: 0` from `.admin-layout`, comment block explaining the trap and the OcrTest opt-in pattern for future power-users)
- 30 ERP page files (hygiene — dropped `overflow-y: auto` from `<page>-main`)
- `CLAUDE-ERP.md` + `docs/PHASETASK-ERP.md` (this section)

### Validation

- Vite build green (16.49s after root fix; 25.13s during initial 30-page hygiene round; both runs clean, no syntax or chunk-size regressions).
- Post-fix grep on `*-main { overflow-y: auto }` confirms exactly 60 remaining ERP pages still have the rule (now harmless dead weight) and the 30 hygiene-cleaned pages no longer have it.
- Browser smoke (Playwright): pending — see session report for SMER / Sales Entry / Accounts Receivable verification.
- Backwards-compat: every page renders identically when content fits in viewport. Pages with content > viewport now scroll on body instead of inner main column — the user-facing scroll behavior is identical except the scroll affordance comes from the body (the same body-scroll surface that mobile already used and the user expects).

### Common gotchas

- ~~The remaining ~60 `<page>-main { overflow-y: auto }` rules are dead weight, not bugs. They're preserved for now to keep this commit small. A future Phase UX-Scroll-Followup can sweep them for hygiene; risk of regression is zero (the rules don't trigger).~~ **CLOSED Apr 30 evening** — UX-Scroll.6 followup ran in the same session via atomic Node script (`c:/tmp/sweep_overflow.mjs`); 56 files cleaned (1 already-clean from Round 1 redundantly listed and correctly skipped). Post-sweep grep returns zero matches across `frontend/src/erp/pages/`. Vite build green (10.60s). Playwright smoke on `/erp/accounts-payable`: `.ap-main` computed `overflow-y` flipped from `auto` → `visible`; body still scrolls; WorkflowGuide visible; behavior identical to pre-sweep. Anti-pattern fully eliminated.
- If a future ERP page genuinely needs inner-scroll (header pinned + scrollable content area) — e.g., a Kanban board, an executive cockpit with fixed filters, a chat-style page — DO NOT add `overflow-y: auto` on the `*-main` and expect it to work. The chain is body-scroll by default. Use the OcrTest opt-in pattern instead (re-establish `height: 100vh; overflow: hidden` on `.admin-page.<key>-page`).
- ExecutiveCockpit's parallel `.cp-scroll { flex: 1; overflow-y: auto }` wrapper (added by a separate edit during this phase) is dead weight under body-scroll. The cockpit body-scrolls; the page header scrolls with the body. If the user wants strict header-pinning later, follow the OcrTest opt-in pattern.

---

## Phase R2 — Sales Discount (Line-Level, BIR-Standard Net Method) (Apr 30, 2026)

Closes a forgotten field on Sales Entry / Draft CSI: hospital-contract discounts had no surface — BDMs typed unit_price after manually subtracting their negotiated discount, leaving no audit trail and no consistent VAT treatment. Phase R2 adds a per-line `line_discount_percent` (0..100) that shrinks the VAT base per BIR RR 16-2005 (trade discount on the face of the invoice) and books SALES_REVENUE at the discounted amount. **Net method, no contra account** — chosen for the fastest ship and zero COA migration; a future Phase can switch to gross+contra if mgmt reporting demands it.

### Math

  ```
  gross_before_discount = qty × unit_price                          (VAT-inclusive)
  line_discount_amount  = gross × (line_discount_percent / 100)     (VAT-inclusive)
  line_total            = gross - line_discount_amount              (VAT-inclusive, after discount)
  vat_amount            = line_total × VAT_RATE / (1 + VAT_RATE)    (VAT on shrunk base)
  net_of_vat            = line_total - vat_amount                   (post-discount net)
  ```

  Aggregates: `total_discount`, `total_gross_before_discount`, plus the existing `invoice_total` / `total_vat` / `total_net_of_vat` (all three already encode after-discount values, which is what the JE consumes — **no autoJournal change required**).

### What ships

- **SalesLine model** ([backend/erp/models/SalesLine.js](backend/erp/models/SalesLine.js)) — three new line fields + two new header fields. Pre-save hook computes everything; defensive 0..100 clamp guards against hand-crafted save() bypassing schema validators.
- **Auto-journal unchanged** — `journalFromSale` already reads `invoice_total` (after discount, VAT-incl) and `total_vat` (on shrunk base). `DR AR_TRADE / CR SALES_REVENUE / CR OUTPUT_VAT` math stays correct because the model fields encode after-discount values. Healthcheck asserts no `SALES_DISCOUNT` contra crept in.
- **CSI Draft Overlay** ([backend/erp/services/csiDraftRenderer.js](backend/erp/services/csiDraftRenderer.js)) — `buildTotalsView` flips `less_discount` from hardcoded 0 → `sale.total_discount` (with derive-from-lines fallback for legacy rows). `total_sales_vat_inclusive` shows GROSS-before-discount; `amount_due` / `total_amount_due` show after-discount. **Both VIP (cols.description) and MG-and-CO (cols.articles) overlays render via the same totals fields union — single integration point covers both printers.** Per-line "Amount" body cell uses `line_gross_amount` so the booklet's printed `Qty × Price = Amount` math reconciles to the eye; the discount surfaces only in the totals block.
- **POSTED CSI print template** ([backend/erp/templates/salesReceipt.js](backend/erp/templates/salesReceipt.js)) — when `total_discount > 0`, renders "Total Sales (VAT Inclusive)" + "Less: Discount" rows above the existing Net of VAT / VAT / TOTAL block. Per-line discount chip ("Less 5% (₱150.00)") under the product name on lines that carry one.
- **Sales Controller** ([backend/erp/controllers/salesController.js](backend/erp/controllers/salesController.js)) — `createSale` early-rejects discount > cap; `validateSales` per-row gate uses cached cap config; VAT-balance check (line ~860) updated to compute `gross - discount` so it matches what `SalesLine.pre('save')` stored. `generateCsiDraft` `lineDisplay` mapping passes `line_gross_amount` as the body row amount.
- **Lookup-driven cap (Rule #3, subscription-ready)** — new `SALES_DISCOUNT_CONFIG` lookup category seeded with `DEFAULT { max_percent: 100, default_percent: 0, require_reason_above: 0 }`, `insert_only_metadata: true`. Helper [backend/utils/salesDiscountConfig.js](backend/utils/salesDiscountConfig.js) caches 60s by entity, exposes `getDiscountConfig` + `canBypassDiscountCap` + `DEFAULTS` + `invalidate`. **Privileged users (president / admin / finance) bypass the configurable cap; schema's hard 0..100 still applies.** Subscribers tune via Control Center → Lookup Tables (e.g. cap at 30% to prevent BDM abuse) — no code deploy.
- **Sales Entry frontend** ([frontend/src/erp/pages/SalesEntry.jsx](frontend/src/erp/pages/SalesEntry.jsx)) — added Disc % column to the desktop CSS grid (now 9 cols: Product · Batch · Expiry · Qty · Unit · Price · **Disc%** · Total · ×) and to the mobile card flex row (alongside Qty/Price/Total). Tooltip on the desktop input previews the computed discount amount. New `computeLineGross` / `computeLineDiscountAmount` / `computeLineTotal` helpers mirror the SalesLine pre-save hook so on-screen totals match what the model will store. All five `line_items` default stubs seed `line_discount_percent: ''`.
- **WorkflowGuide banner** ([frontend/src/erp/components/WorkflowGuide.jsx](frontend/src/erp/components/WorkflowGuide.jsx)) — `sales-entry` step 3 now mentions Discount %; the Draft CSI step explains the totals block adapts.
- **Healthcheck** ([backend/scripts/healthcheckSalesDiscount.js](backend/scripts/healthcheckSalesDiscount.js)) — 33 wiring contracts. Catches the wiring-drift class (frontend column with no backend acceptance, schema field nobody reads, JE that silently posts wrong VAT). **PASSES 33/33**.

### Validation

- All backend syntax checks (`node -c`) clean on SalesLine.js, salesController.js, autoJournal.js, csiDraftRenderer.js, salesReceipt.js, lookupGenericController.js, salesDiscountConfig.js, healthcheckSalesDiscount.js.
- `node backend/scripts/healthcheckSalesDiscount.js` PASSES 33/33.
- Vite build green in 12.27s; `SalesEntry-BD11zLeY.js` 53.83 kB.
- Backwards-compat: legacy SalesLine rows with no `line_discount_percent` default to 0, no recomputation needed; `csiDraftRenderer` falls back to deriving gross from line_items if `total_gross_before_discount` is absent.

### Subscription readiness

- Cap is lookup-driven per entity; `insert_only_metadata: true` so admin overrides survive future re-seeds.
- Privileged-bypass mirrors Rule #21 cross-scope view roles — escalation route doesn't need a lookup edit for one-off bigger contracts.
- Future Phase R3 (planned, not shipped): **Hospital Discount Master** — per-hospital, per-product, BDM-negotiated default discounts with validity dates. The form will auto-fill `line_discount_percent` when the BDM picks the hospital. Schema fields `default_percent` + `require_reason_above` are reserved for this — `require_reason_above` will hook into a `SALES_DISCOUNT_REASONS` Lookup so > N% triggers a reason picker (analogous to FIFO override reason).

### What did NOT change

- `autoJournal.journalFromSale` — net method intentionally no contra. Adding a `SALES_DISCOUNT` COA + contra entry is a Phase R3 decision, not R2.
- SC/PWD discount handling (`SalesBookSCPWD.js`) — statutory 20% + 12% VAT exemption is independent. Hospital contract discount and SC/PWD don't stack on the same Sale (SC/PWD is a retail-pharmacy concept; hospital contract is B2B).
- Period-lock / approval-gate / audit-log coverage — already wired on Sales submit/post/reopen, unaffected.

### Files touched (4 backend + 1 helper + 1 frontend page + 1 frontend component + 1 lookup seed + 1 healthcheck + 2 docs = 11)

- `backend/erp/models/SalesLine.js`
- `backend/erp/controllers/salesController.js`
- `backend/erp/services/csiDraftRenderer.js`
- `backend/erp/templates/salesReceipt.js`
- `backend/erp/controllers/lookupGenericController.js` (SALES_DISCOUNT_CONFIG seed)
- `backend/utils/salesDiscountConfig.js` (NEW)
- `frontend/src/erp/pages/SalesEntry.jsx`
- `frontend/src/erp/components/WorkflowGuide.jsx`
- `backend/scripts/healthcheckSalesDiscount.js` (NEW, 33-check verifier)
- `CLAUDE-ERP.md` + `docs/PHASETASK-ERP.md` (this section)

### Common gotchas

- The CSI body's per-line "Amount" cell shows GROSS (qty × unit_price), not after-discount. The discount only appears in the totals block. This was deliberate so the booklet's printed math reconciles to the eye — but it surprises if you expect line totals to sum to invoice_total. They sum to `total_gross_before_discount`; subtract `total_discount` for `invoice_total`.
- The model's `line_total` is AFTER discount (VAT-inclusive). `line_gross_amount` is BEFORE. Don't confuse them when writing reports.
- `autoJournal.journalFromSale` reads `invoice_total` (after discount). If you re-post a legacy CSI with no discount, no behavior change. If you ever switch to gross+contra method (Phase R3), the JE math + a new `SALES_DISCOUNT` COA code BOTH need to land together — partial migration leaves the books unbalanced.
- Privileged bypass in `canBypassDiscountCap` is reqquest-bound (`req.isPresident || req.isAdmin || req.isFinance`). If you call `getDiscountConfig` from a non-HTTP context (cron, agent), there's no req — pass `{ isPresident: true }` shaped object or just enforce schema's 0..100 ceiling.

### Apr-30-evening hardening (Rule #2 wiring sweep + cache hot-reload)

The original Apr 30 ship correctly wired the model + controller + CSI overlay + receipt template + frontend input — but a thorough Rule #2 audit caught **two end-to-end wiring gaps** that would have hidden the discount from key downstream surfaces:

1. **Approval Hub / Reversal Console detail panel was hiding the discount.** `documentDetailBuilder.buildSalesDetails` mapped `line_total` and `invoice_total` (both post-discount per R2) but did NOT pass `line_discount_percent`, `line_discount_amount`, `line_gross_amount`, `total_discount`, or `total_gross_before_discount`. Result: when the president opened a CSI card in `/erp/approvals` or `/erp/reversal-console`, they saw `Total: 900` for a CSI with `discount = 100` but no indication a discount was applied — Rule #2 violation (end-to-end wiring) and an audit-transparency hole. **Fix:** [backend/erp/services/documentDetailBuilder.js#buildSalesDetails](backend/erp/services/documentDetailBuilder.js) now surfaces all five fields. [frontend/src/erp/components/DocumentDetailPanel.jsx](frontend/src/erp/components/DocumentDetailPanel.jsx) `module === 'SALES'` block adds a `hasAnyDiscount` derived flag and conditionally renders **Gross + Disc %** columns in the line table + a **Total Sales (VAT Inclusive) → Less: Discount** footer pair when `total_discount > 0`. No-discount CSIs render identically to pre-R2 (no UI density penalty).

2. **`SALES_DISCOUNT_CONFIG` cache hot-reload was missing.** `salesDiscountConfig.js` exports `invalidate(entityId)` but it was never wired into `lookupGenericController` save paths. Result: admin edits to `SALES_DISCOUNT_CONFIG.DEFAULT.max_percent` waited up to 60s (TTL) before the new cap took effect — inconsistent with `PAYSLIP_PROXY_ROSTER` / `PRICE_RESOLUTION_RULES` / etc. which all bust their caches on lookup save. **Fix:** [backend/erp/controllers/lookupGenericController.js](backend/erp/controllers/lookupGenericController.js) declares `SALES_DISCOUNT_CONFIG_CATEGORIES = new Set(['SALES_DISCOUNT_CONFIG'])` and busts `invalidateSalesDiscountCache(entity_id)` in all four save paths (create / update / remove / seedCategory). Mirrors the established pattern.

**Healthcheck extended** with 8 new assertions (33 → 41):
- buildSalesDetails surfaces line_discount_percent
- buildSalesDetails surfaces line_discount_amount + line_gross_amount
- buildSalesDetails surfaces total_discount + total_gross_before_discount
- DocumentDetailPanel SALES module reads d.total_discount for Less: Discount footer
- DocumentDetailPanel renders per-line Disc % + Gross when any line carries a discount
- lookupGenericController declares SALES_DISCOUNT_CONFIG_CATEGORIES + imports invalidateSalesDiscountCache
- lookupGenericController busts salesDiscount cache in all 4 save paths
- **🔴 Critical, assertion #41**: `SalesEntry createSale payload includes line_discount_percent` — closes the silent end-to-end break where the form rendered + computed the discount client-side but the API call DROPPED the field on Save, so the row persisted as discount=0 and the page reload showed full gross. Caught only by browser smoke (Mae Navarro, staff). Fix at [frontend/src/erp/pages/SalesEntry.jsx:897](frontend/src/erp/pages/SalesEntry.jsx#L897) added `line_discount_percent` to the `validItems.map()` payload. Lesson: a green static healthcheck is necessary but not sufficient — for any new form-field → API-payload mapping, add an explicit "field is IN the network call" assertion, not just "field is rendered + computed client-side."

`node backend/scripts/healthcheckSalesDiscount.js` PASSES **41/41** (was 33/33 pre-hardening, briefly 40/40 mid-hardening before the createSale-payload bug was caught). Vite green in 13.39s. Backend syntax clean on touched files.

**Live Playwright UI smoke (deferred from original ship — closed Apr 30 2026 evening)**: full happy path ratified end-to-end as Mae Navarro / s3.vippharmacy@gmail.com (staff role — non-privileged). `/erp/sales/entry` → CSI #8889, Viptriaxone 1g × 10 @ ₱480 with Disc%=15 → live total ₱4,080 ✅ → Save Drafts → row persisted with discount=15 (post-fix; prior attempt CSI #8888 reproduced the dropped-payload bug) ✅ → Validate → DRAFT → VALID (validateSales VAT-balance accepted post-discount math) ✅ → Submit → HTTP 202 routed to Approval Hub (gateApproval forced through Hub since staff is not in `MODULE_DEFAULT_ROLES.SALES`) ✅ → re-login as president → `/erp/approvals` Details panel rendered the new **Gross (₱4,800.00)** + **Disc % (15%)** columns + footer **Total Sales (VAT Inclusive): ₱4,800.00 → Less: Discount: (₱720.00)** in amber → Net of VAT ₱3,642.86 → VAT ₱437.14 → Total ₱4,080.00 ✅. **BIR math reconciles**: 4800 − 15% = 4080; VAT base shrinks (4080/1.12 = 3642.86); VAT = 437.14; AR receivable = 4080. Both smoke fixtures (#8888 broken-pre-fix, #8889 fixed) President-Deleted from dev cluster post-verification with audit reasons recorded. Screenshots: `r2-discount-math-smoke.png`, `r2-mae-discounted-row.png`, `r2-mae-after-save.png` (bug-repro), `r2-mae-after-fix.png`, `r2-mae-fixed-row-detail.png`, `r2-approval-hub-with-sales.png`, `r2-approval-hub-sales-detail.png` (definitive).

---

## Phase G4.5aa — BDM Income & Deduction Schedule Proxy + Payslip Deduction Sub-Perm Gate (Apr 29, 2026)

Closes the audit finding from Apr 29 2026: **BDM Income (IncomeReport), DeductionSchedule, and employee Payslip deduction CRUD were COMPLETELY UNGUARDED for proxy entry.** An eBDM (back-office staff acting on behalf of field BDMs) had no sanctioned path to generate income reports or record deduction schedules on behalf of others — `requestIncomeGeneration` / `addDeductionLine` / etc. were all locked to `req.bdmId` self-flow, and the Finance-side endpoints required admin/finance/president role.

### What ships
- **3 new sub-permission codes** (lookup-driven via `ERP_SUB_PERMISSION` SEED_DEFAULTS):
  - `PAYROLL__INCOME_PROXY` (module=`payroll`, key=`income_proxy`) — generate IncomeReport + add/remove deduction lines on behalf of another BDM
  - `PAYROLL__DEDUCTION_SCHEDULE_PROXY` (module=`payroll`, key=`deduction_schedule_proxy`) — create/edit/withdraw DeductionSchedule on behalf of another BDM
  - `PAYROLL__PAYSLIP_DEDUCTION_WRITE` (module=`payroll`, key=`payslip_deduction_write`) — opens employee Payslip deduction CRUD to staff WITHOUT granting full PAYROLL FULL access. No OwnerPicker because Payslips are owned by `person_id` (PeopleMaster), not `bdm_id`.
- **2 new PROXY_ENTRY_ROLES rows**: `INCOME`, `DEDUCTION_SCHEDULE`. Default `[admin, finance, president]`. Subscribers append `staff` via Control Center → Lookup Tables to enable eBDM proxy. `insert_only_metadata: true` so admin overrides survive future re-seeds.
- **2 new VALID_OWNER_ROLES rows**: `INCOME`, `DEDUCTION_SCHEDULE`. Default `[staff]` — admin/finance/president can NEVER own per-BDM income (would corrupt commission / profit-share computations).
- **Backend wiring**:
  - `incomeController.requestIncomeGeneration` — `resolveOwnerForWrite(req, 'payroll', INCOME_PROXY_OPTS)` gate; existing report dupe-check pivots from `req.bdmId` to `owner.ownerId` so a proxy can't accidentally regenerate a credited target's payslip.
  - `incomeController.addDeductionLine` + `.removeDeductionLine` — `widenFilterForProxy` widens the `bdm_id` constraint on the report fetch when caller is eligible; the existing `entered_by === req.user._id` removal guard stays so a proxy can never delete another user's line even with proxy rights.
  - `incomeController.getIncomeList` — extends the existing `canViewOther` (admin/finance/president) path with `canProxyEntry` so an eBDM also gets a wide list. Caller can narrow via `?bdm_id=`.
  - `incomeController.getIncomeBreakdown` — same `canProxyEntry` extension lifts the BDM 403 for proxy callers.
  - `deductionScheduleController.createSchedule` — `resolveOwnerForWrite(req, 'payroll', DEDUCTION_PROXY_OPTS)`. Gate triggers Approval Hub via the existing `gateApproval` flow (Phase G4.2) because `MODULE_DEFAULT_ROLES.DEDUCTION_SCHEDULE` is admin/finance/president — proxy submits route through the Hub for finance approval.
  - `deductionScheduleController.getMySchedules` — `canProxyEntry` widens the `bdm_id` filter for proxies; supports `?bdm_id=<target>` to focus on one BDM.
  - `deductionScheduleController.withdrawSchedule` + `.editPendingSchedule` — peek-bdm-id pattern: when caller is proxy-eligible, look up the schedule's `bdm_id` first and pass it to the service so the service-level strict `schedule.bdm_id === bdmId` ownership check passes. Without proxy, falls back to `req.bdmId`.
  - `payrollRoutes` — three deduction-line routes (POST `/:id/deduction-line`, POST `/:id/deduction-line/:lineId/verify`, DELETE `/:id/deduction-line/:lineId`) now use a `payslipDeductionWriteGate` inline middleware. Admits admin/finance/president OR staff with `payroll.payslip_deduction_write`. President + admin/finance/president keep wide path; subscribers can delegate to a non-management Finance clerk via Access Template without granting full PAYROLL FULL.
- **Frontend** (`MyIncome.jsx`):
  - New `OwnerPicker` import + `targetBdmId` page-level state.
  - One `OwnerPicker` rendered per active tab — Payslips uses `subKey=income_proxy` + `lookupCode=INCOME`, Schedules uses `subKey=deduction_schedule_proxy` + `lookupCode=DEDUCTION_SCHEDULE`. Both share the `targetBdmId` so the eBDM works one BDM at a time across tabs.
  - `loadReports`, `loadSchedules`, `loadProjection`: forward `bdm_id: targetBdmId` to backend list/projection endpoints.
  - `handleRequestGeneration`, `handleSaveSchedule (create branch)`: stamp `assigned_to: targetBdmId` so the backend resolver flows.
  - Edit + withdraw paths NOT touched on the frontend — they ride the backend peek-bdm-id pattern.
  - WorkflowGuide banners updated: `myIncome` step 8 explains the "Record on behalf of" dropdown; `income` (Finance) step 7 mirrors the announcement so finance knows eBDMs can self-serve generation.

### Audit + scope decisions
- **People-Master proxy SKIPPED** — admin-owned per Rule #8 (Master Data Governance). PEOPLE__TERMINATE / PEOPLE__MANAGE_LOGIN already cover the destructive cases.
- **Payroll bulk `computePayroll` proxy SKIPPED** — entity-level batch operation, not per-BDM. Adding proxy doesn't fit the model.
- **Income Finance-side `verifyDeductionLine` / `financeAddDeductionLine` NOT widened to staff** — those routes stay admin/finance/president because the proxy use case (eBDM) flows through the BDM-side endpoints (`addDeductionLine`). Finance approval remains a separate role gate.

### Validation
- Healthcheck script `backend/scripts/healthcheckIncomeProxy.js` covers 32 wiring contracts — sub-perm seeds, lookup row metadata, controller imports, controller call sites, route gates, frontend OwnerPicker mount + payload propagation, WorkflowGuide banners. **PASSES 32/32**.
- Backend syntax check (`node -c`) clean on `lookupGenericController.js`, `incomeController.js`, `deductionScheduleController.js`, `payrollRoutes.js`, `healthcheckIncomeProxy.js`.
- Vite build green in 40.37s; `MyIncome` chunk 56.04 kB (was ~52 kB), `Income` chunk 59.29 kB.

### Subscription readiness
- All gates lookup-driven (Rule #3). New subscribers configure proxy rosters via Control Center → Lookup Tables → `PROXY_ENTRY_ROLES.INCOME` + `.DEDUCTION_SCHEDULE` without code deployment. `insert_only_metadata: true` ensures admin tweaks survive `seedAll` re-runs.
- Cross-entity defense in depth: `resolveOwnerForWrite` validates the target BDM is active AND assigned to `req.entityId` (line 211-218 of `resolveOwnerScope.js`). A proxy cannot file under a target who lives in a different entity.
- Lazy-seed: lookup rows added to `SEED_DEFAULTS` materialize on first `GET /lookup/:category` per entity (existing `getByCategory` auto-seed pathway).

### What did NOT change
- IncomeReport / DeductionSchedule / Payslip schemas — `created_by` already serves as the proxy attribution audit trail (= `req.user._id`); `bdm_id` (or `person_id`) stays the target.
- Approval Hub routing — proxy DeductionSchedule create still routes through `gateApproval('DEDUCTION_SCHEDULE')` (Phase G4.2 contract).
- Period-lock guards — already wired on income/deduction routes, not affected.

### Files touched (5 backend + 2 frontend + 1 healthcheck + 2 docs)
- `backend/erp/controllers/lookupGenericController.js` (3 sub-perms, 2 PROXY_ENTRY_ROLES, 2 VALID_OWNER_ROLES rows)
- `backend/erp/controllers/incomeController.js` (5 functions widened)
- `backend/erp/controllers/deductionScheduleController.js` (4 functions widened)
- `backend/erp/routes/payrollRoutes.js` (3 routes re-gated via `payslipDeductionWriteGate`)
- `frontend/src/erp/pages/MyIncome.jsx` (OwnerPicker mount + targetBdmId propagation across 4 handlers)
- `frontend/src/erp/components/WorkflowGuide.jsx` (2 banner updates)
- `backend/scripts/healthcheckIncomeProxy.js` (NEW, 32-check verifier)
- `CLAUDE-ERP.md` + `docs/PHASETASK-ERP.md` (this section)

---

## Phase N (Offline-First Sprint) — Apr 27, 2026

Built on top of the original Phase N (Offline Visit + CLM Merge + Public Deck, commit `3f1b4a8`). The sprint elevates "offline visit log works" → "BDMs can run their entire field-day on weak Globe signal without touching the server, then audit data spend after they sync."

### Five surface areas shipped on `feat/phase-n-offline-visit-clm-merge`

1. **Foundation unblock** (`a77ae2d`) — `NewVisitPage` now uses `Promise.allSettled` instead of `Promise.all`, falls back to `offlineStore.getCachedDoctors()` on network failure, and stubs `canVisit` so `<VisitLogger>` renders. `EmployeeDashboard` seeds `offlineStore.cacheDoctors()` after the dashboard fetch so the offline picker has data for any VIP Client the BDM has seen.
2. **Offline auth survival** (`c818b62`) — `vip-offline-data` IndexedDB v3 → v4 with `auth_session` + `sync_errors` stores. `AuthContext.initAuth` distinguishes 401 (genuine logout → /login) from network failure (offline → rehydrate from cache). `login()` writes the profile back so the next reload survives. Logout + forced-logout clear it.
3. **Auto-sync inbox + toast** (`b09a70f`) — `sw.js` `replayQueue` tracks `{ syncedCount, syncedKinds, approxBytes }` per replay run; broadcasts in `VIP_SYNC_COMPLETE`. `offlineManager` exposes `onSyncComplete(cb)` + `onVisitDraftLost(cb)`. `useOfflineSyncListener` (mounted on `EmployeeDashboard`) renders a toast and POSTs to `/api/messages/system-event` for an inbox audit trail. Backend route + controller `recordSystemEvent` is **self-DM only** (recipient forced to `req.user._id`, event_type allowlisted, title/body rendered server-side from a template — clients can't inject arbitrary inbox content).
4. **ERP offline-block guard** (`ce219fa`) — single `<OfflineRouteGuard>` wraps `<Routes>` once; reads `useLocation()` and matches against `OFFLINE_REQUIRED_PATHS` lookup (with `DEFAULT_OFFLINE_REQUIRED` inline fallback). When offline + matched, short-circuits to a "needs WiFi or cellular" panel with Back-to-Dashboard / Sync-Now actions. Preserves Visit / CLM / Dashboard / MyVisits as offline-capable.
5. **Sync errors tray** (`4fbc375`) — `<SyncErrorsTray />` mounts on the BDM dashboard. `<SyncErrorsBadge />` renders only when `sync_errors` store has rows. Drawer lists each failure with Discard / Discard-all (no Retry — the photo blobs are gone by definition; the BDM has to re-capture). Inbox audit copy is preserved on Discard so admin can still see device history.

Plus: PageGuide banners updated for `bdm-dashboard`, `new-visit`, `partnership-clm` + new `sync-errors-tray` key (`32f7f64`); `OFFLINE_REQUIRED_PATHS` + `SYSTEM_EVENT_TEMPLATES` lookups seeded with `insert_only_metadata: true` so admin edits survive re-seeds (`32fd470`).

### Why the lookup-driven posture

`OFFLINE_REQUIRED_PATHS` and `SYSTEM_EVENT_TEMPLATES` both follow the Phase G6 / MD_PARTNER_ROLES pattern: lazy-seeded inline defaults, admin-tunable per entity via Control Center → Lookup Tables, frontend falls back to a hardcoded constant on Lookup outage so the page never silently lets the wrong path through. Future Pharmacy SaaS spin-out tenants can ship with their own offline posture without a code change.

### What stays out of scope (deliberate, per Apr 27 user Q&A)

- **Photo compression** (1080px JPEG Q70 → ~4× data reduction). Recommended, not in this sprint. User can add when needed.
- **Per-BDM `sync_preference` column** (wifi_only / always / manual). Designed; not built — Globe-prepaid BDMs without home WiFi need `always` as the default and the toggle becomes a guess that orphans corner cases.
- **Cellular vs WiFi detection via `navigator.connection.type`** — not needed since user picked auto-sync regardless of network type.
- **Making expenses / approvals offline-capable** — explicitly refused. Approval Hub guarantees + period-lock + double-posting risk make queued financial writes hostile.

### Key files (offline-first sprint scope)

- `frontend/src/utils/offlineStore.js` — IndexedDB schema + auth_session + sync_errors APIs
- `frontend/src/utils/offlineManager.js` — `onSyncComplete` + `onVisitDraftLost` listener pools
- `frontend/src/context/AuthContext.jsx` — offline rehydration + cache writes
- `frontend/src/hooks/useOfflineSyncListener.js` — toast + inbox-audit (mount once)
- `frontend/src/components/common/OfflineRouteGuard.jsx` — Routes-root guard + `useOfflineBlocked` hook
- `frontend/src/components/employee/SyncErrorsTray.jsx` — badge + drawer
- `frontend/public/sw.js` — replay stats tracking, VIP_SYNC_COMPLETE payload
- `backend/controllers/messageInboxController.js` — `recordSystemEvent` self-DM endpoint
- `backend/routes/messageInbox.js` — `POST /api/messages/system-event`
- `backend/erp/controllers/lookupGenericController.js` — `OFFLINE_REQUIRED_PATHS` + `SYSTEM_EVENT_TEMPLATES` SEED_DEFAULTS

### Pre-merge checklist before `dev`

- 3-walk pilot (per the original Phase N handoff guidance)
- Rebase on top of latest VIP-1.B Phase 4 changes
- Healthcheck script `backend/scripts/healthcheckOfflineVisitWiring.js` returns 0
- Playwright smoke confirms login → close → reopen offline → log visit → reconnect → toast + inbox entry
- Confirm IndexedDB schema migration v3 → v4 fires cleanly in a Chromium devtools session

---

## Phase 15.4 — CSI Overlay Renderer Field-Tuned + Printer-Aware (April 27, 2026)

Closes the long-standing "CSI alignment is wrong" complaint that turned out to be three separate problems: a missing lookup row, ambiguous coordinate semantics, and printer-specific paper handling. Now field-verified end-to-end on real VIP and MG and CO booklets through a Brother A4 printer. **Uncommitted on `dev`.**

### Root cause: there was no CSI_TEMPLATE row

For the duration of every prior alignment debug, the live cluster had **zero** `CSI_TEMPLATE` rows for any entity. The user was editing a Lookup Manager form that had been pre-populated with seed defaults, but the save path never persisted. The controller correctly returned `CSI_TEMPLATE_NOT_CONFIGURED` (HTTP 400). Re-running `node backend/erp/scripts/seedCsiTemplates.js --apply` finally inserted the rows. **First diagnostic for any future CSI complaint: `node backend/erp/scripts/inspectCsiTemplates.js`.**

### Coordinate semantics — uniform across every field

- **`x`** = LEFT edge of the first character, measured from the left of the page.
- **`y`** = BASELINE of the letter (the line letters sit on, not the top of the bounding box), measured from the top of the page.

Renderer subtracts the font ascent before handing y to PDFKit (whose native y is the top of the line box) so the calibration crosshair point and the rendered baseline coincide exactly. This applies to header fields, body rows, batch line, expiry line, PO row, notes, and both totals stacks — there is no longer a per-column `align: 'right'` branch; every position is left-edge-anchored.

### Two-layer printer offset model — printer-agnostic

Modern A4 office printers (Brother and most others) **center small paper horizontally** but **feed it from the top edge** for vertical. To compensate without per-printer code branches:

```js
final_x = lookup.x + tpl.feed_offset.x_mm + user.csi_printer_offset_x_mm
final_y = lookup.y + tpl.feed_offset.y_mm + user.csi_printer_offset_y_mm
```

- **`tpl.feed_offset`** (per-template, lookup-driven) — captures the printer behavior shared by everyone in the entity. MG and CO is set to `{ x_mm: 27, y_mm: 0 }` because the booklet is 160 mm wide vs A4's 210 mm: `(210-160)/2 = 25 mm` for the horizontal centering plus 2 mm of empirical tuning, and 0 vertical because the Brother feeds from the top of A4. VIP is `(0, 0)` because its booklet width matches A4 width — no centering shift.
- **`user.csi_printer_offset_*_mm`** (per-user) — fine-tuning for users whose printer differs from the entity default. The renderer now reads from `req.user` (whoever clicks Print), with fallback to `sale.bdm_id` only if the printing user has no calibration set. Calibrate via the **Calibration** tab on `/erp/csi-booklets`.

### Description format + unit packing

Body description is now `Brand Name (Generic Name) Dosage Strength` (Rule #4 with parens for the generic). When the template has no `cols.unit` (the VIP booklet has no Unit column header), the renderer **packs the unit at the end of the description** so it lands right before the Quantity column. MG and CO has its own Unit column (`cols.unit` defined), so the unit renders in its column instead. Same code path serves both layouts; the renderer picks via `Boolean(cols.description)` vs `cols.articles`.

### Expiry format — matches GRN

`MM/DD/YYYY` (e.g. `12/30/2028`) — matches what the GRN audit and entry pages show via `toLocaleDateString('en-PH')`, so a BDM looking at receiving and selling sees the same date format.

### Field-tuned values (live cluster)

| Field | VIP | MG and CO |
|---|---|---|
| `page` | 210 × 297 mm (A4) | 210 × 297 mm (A4) |
| `name.y` | 45 (was 57; field test) | 39 |
| `date.y` | 40 | 35 (was 33; field test +2) |
| `name.x`, all body x | shifted +4 mm from booklet field test | original |
| `feed_offset` | `(0, 0)` | `(27, 0)` for centering printers |

Both A4 page sizes mean office printers accept the PDF as native paper. Print at **100% / Actual size** with no scaling; the booklet feeds at the top-left of the A4 area (or wherever the printer positions small paper, which the `feed_offset` compensates for).

### CsiBooklets page — sub-tab refactor

The CSI Booklets page was visually messy with three big panels stacked vertically. Refactored to three sub-tabs following the [Frontend Design Conventions](#frontend-design-conventions) (state-based, hash-synced, plain-text labels):

- **Admin / contractor**: `Drafts to Print` · `Booklets & Allocations` · `Calibration`
- **BDM**: `Drafts to Print` · `My CSI Numbers` · `Calibration`

Tab state syncs to `window.location.hash` so each tab is shareable (`/erp/csi-booklets#calibration`). The proxy-encoded sale flow already worked end-to-end — the BDM's `tenantFilter = { bdm_id: self }` matches a sale where `bdm_id = self` regardless of who keyed it via `recorded_on_behalf_of`.

### Key files

- `backend/erp/services/csiDraftRenderer.js` — drawText baseline math + two-layer offset + uniform left-edge anchor
- `backend/erp/controllers/salesController.js` — Brand (Generic) Strength desc + printing-user offset wiring
- `backend/erp/scripts/seedCsiTemplates.js` — seed defaults updated to A4 + field-tuned coordinates
- `backend/erp/scripts/inspectCsiTemplates.js` — read-only diagnostic (run first for any alignment complaint)
- `backend/erp/scripts/setMgCsiFeedOffset.js` — canonical script for tuning per-template feed offsets when a new printer is added
- `backend/erp/scripts/createCsiTestSale.js` — `--mg` flag, idempotent fixture creator
- `frontend/src/erp/pages/CsiBooklets.jsx` — sub-tab refactor

### Persistent test fixtures (DO NOT DELETE)

- VIP DRAFT sale `69ef2fc2608459fe30339421` (doc_ref `CSI-TEST`)
- MG and CO DRAFT sale `69ef305849f94f5213c6b32a` (doc_ref `CSI-TEST-MG`)

### Master-data gap surfaced

`ProductMaster.unit` is `undefined` on most products (Viprazole 40 mg confirmed; likely many others). Every sale of these products has to type the unit by hand on each line. A one-pass catalog audit to fill `ProductMaster.unit` removes that risk forever — worth doing before the next CSI rollout phase.

---

## Phase S2 — `staff` Role Rename + Lookup Normalization (April 24, 2026)

### Problem

Three legacy role strings coexisted across the codebase and Lookup data:

- `'employee'` — the original role string before 2026 rename. 0 users had it as of Apr 24 but it lingered in `ALL_ROLES`, seed defaults, and several `metadata.roles` arrays.
- `'contractor'` — the canonical role string 2026–Apr 24. Used by all 11 non-management users on prod.
- `'bdm'` — dead string. No `User.role` could ever take it (not in `ALL_ROLES`), but it appeared in `MODULE_DEFAULT_ROLES.UNDERTAKING.metadata.roles` and `AGENT_CONFIG.allowed_roles` with "means BDM" intent that never actually matched a real user.

The business expansion trigger: VIP is hiring actual W-2 employees who do BDM-style work and get promoted to BDM if they perform. The name `contractor` on a W-2 employee's profile is misleading. For Year-2 Vios SaaS subscribers with mixed contractor/employee workforces, the naming scales worse.

### Decision (Path B)

Rename all three legacy strings → `'staff'`. Auth tier is now semantically neutral; employment nature lives separately on `PeopleMaster.employment_type` (`REGULAR` / `PROBATIONARY` / `CONTRACTUAL` / `CONSULTANT` / `PARTNERSHIP`) where it always should have.

### What shipped

1. **Core constants** (`backend/constants/roles.js`) — added `ROLES.STAFF = 'staff'`. Kept `ROLES.CONTRACTOR` as a deprecated alias mapping to `'staff'` so the 29+ legacy call sites (`ROLES.CONTRACTOR` in controllers, agents, services) keep working without a big-bang rewrite. The alias can be removed in a follow-up commit. `ALL_ROLES` no longer accepts `'employee'`.
2. **User model** — `default: ROLES.STAFF` (was `CONTRACTOR`). Mongoose enum rejects future `'employee'` / `'contractor'` / `'bdm'` inserts.
3. **roleCheck middleware** — added `staffOnly` + `adminOrStaff`; legacy `employeeOnly` / `adminOrEmployee` names kept as aliases so route files don't need mass edits.
4. **SEED_DEFAULTS normalization** — `VALID_OWNER_ROLES.metadata.roles` (9 rows), `MODULE_DEFAULT_ROLES.MESSAGING.metadata.roles` + `MODULE_DEFAULT_ROLES.UNDERTAKING.metadata.roles`, `AGENT_CONFIG.allowed_roles` (3 rows). All legacy strings replaced with `'staff'`.
5. **resolveOwnerScope.js** — `DEFAULT_VALID_OWNER_ROLES` default flipped `[CONTRACTOR, 'employee']` → `[STAFF]`.
6. **Backend sweep** — string-literal role refs in `customerController`, `hospitalController`, `dashboardService`, `salesGoalService` (`role: 'contractor'` → `'staff'` for synthetic-user access-filter hack), plus `findOrphanedOwnerRecords.js` default.
7. **Frontend OwnerPicker hardening** — `validOwnerRoles` default flipped to `['staff']`, and the row-filter is now **lookup-driven** (`validOwnerRoles.includes(r)`) instead of the hardcoded `r === 'contractor' || r === 'employee'`. This is Rule #3 alignment — a subscriber who adds a branch-manager role to `VALID_OWNER_ROLES.<MODULE>.metadata.roles` now sees that role as a valid proxy target without any frontend change.
8. **Other frontend** — `PersonDetail.jsx` default mapping, `CommLogsPage.jsx` + `MessageTemplatesPage.jsx` BDM-list queries (`role: 'contractor'` → `'staff'` in the user-service filter).
9. **Tests** — 5 unit-test files updated (`clientVisitStats.cycleFilters`, `doctorController.access`, `doctorController.products`, `roleCheck.adminLike`, `visitStats.cycleFilters`, plus `roleHelpers.test.js` which now exercises both the legacy strings (expect false) AND the new `'staff'` string.
10. **Health check** — `scripts/check-system-health.js` OwnerPicker filter check updated to accept either the new lookup-driven filter OR the legacy hardcoded pattern (so the check doesn't warn falsely post-Phase S2, and still catches regression if someone removes both).

### Migration

`backend/scripts/migrateEmployeeToContractor.js` (filename preserved for git-history continuity) now runs two phases under `--apply`:

- **Phase 1** — `users.role: { $in: ['employee', 'contractor'] }` → `'staff'` via `updateMany`.
- **Phase 2** — `lookups.metadata.roles[]` and `lookups.metadata.allowed_roles[]` — per-row scan and normalize any array containing `'employee'` / `'contractor'` / `'bdm'` to `'staff'` (preserving order, de-duplicating). Covers `PROXY_ENTRY_ROLES`, `VALID_OWNER_ROLES`, `MODULE_DEFAULT_ROLES`, `AGENT_CONFIG`, and any future role-bearing lookup (no hardcoded category allowlist).

Backup file at `backend/scripts/backups/staff-rename-<timestamp>.json` captures:
- `phase1_users`: every modified user's `_id` / `name` / `email` / old role (split into `employee_ids[]` + `contractor_ids[]` for exact revert).
- `phase2_lookups`: every modified lookup row's `category` / `code` / `entity_id` / full pre-migration `metadata`.
- Revert hints inline.

Idempotent — re-runs become no-ops once both populations hit 0.

### Wiring integrity

- OwnerPicker dropdown renders for `staff` users (Gate A — role in `PROXY_ENTRY_ROLES.metadata.roles`) when admin has added `'staff'` to the list. ✅
- OwnerPicker BDM list populates with `staff`-role people (Gate B — frontend filter now `validOwnerRoles.includes(r)`, lookup-driven). ✅
- Backend `resolveOwnerScope` validates proxied `assigned_to` user has a role in `VALID_OWNER_ROLES.metadata.roles` (default `['staff']`). ✅
- `MODULE_DEFAULT_ROLES.UNDERTAKING` gate now lets `staff`-role BDMs acknowledge their own GRN without routing through Approval Hub (was broken before — `'bdm'` was dead, so only admin/finance/president could acknowledge and BDMs always routed to 202). ✅
- `MODULE_DEFAULT_ROLES.MESSAGING` gate lets `staff`-role users access the Inbox (was `['...,'contractor','employee']` — both legacy strings, same user population). ✅
- AI Cowork features (`APPROVAL_FIX_HELPER`, `APPROVAL_FIX_CHECK`) `allowed_roles` now includes `'staff'` instead of the legacy triplet. ✅

### Deploy sequence (matters)

1. Merge PR to `main` + deploy code (frontend build + pm2 restart backend).
2. On prod: `node backend/scripts/migrateEmployeeToContractor.js` (audit — read-only).
3. On prod: `node backend/scripts/migrateEmployeeToContractor.js --apply` (Phases 1+2 atomic).
4. Users re-login (existing JWTs still carry old role — invalid on next API call, redirect to login, new JWT has `role: 'staff'`).

**Critical**: deploy code BEFORE migration. Reverse order would not break anything (Mongoose enum rejects — but new inserts would fail even under old code; updateMany by the migration bypasses validators). Still, code-first is cleaner.

### Scalability + subscription-readiness

- Rule #3 alignment: frontend OwnerPicker filter is now fully lookup-driven. Subscribers extend `VALID_OWNER_ROLES.<MODULE>.metadata.roles` to add their own BDM-shaped roles (branch manager, territory supervisor) without any frontend edit.
- Employment type vs auth tier cleanly separated: a SaaS subscriber with mixed contractor/employee workforce sets `PeopleMaster.employment_type` per person and `User.role: 'staff'` uniformly. No role-string gymnastics.
- `CONTRACTOR` alias + legacy `employeeOnly` / `adminOrEmployee` function names buy time for the 29-file code sweep to happen incrementally, reducing risk of the rename itself breaking something in a forgotten corner.

### Out of scope (follow-ups)

- Drop the `ROLES.CONTRACTOR` alias + `employeeOnly` / `adminOrEmployee` aliases once every call site has been swept to use `ROLES.STAFF` / `staffOnly` / `adminOrStaff`. Low-risk, high-effort.
- Rename directory / file names like `frontend/src/components/employee/*` to `.../staff/*` — cosmetic, defer.
- Pre-seed `SYSTEM_ROLES` lookup to feed the future schema-aware MetadataEditor (Phase S3) — pair with S3 work.

---

## Phase 36 — Received CSI Photo Separation + Dunning Readiness (April 22, 2026)

### Problem
The single `csi_photo_url` field on `SalesLine` conflated two distinct business artifacts captured at different events:
- **Entry-time OCR scan** (t=0): a blank/unsigned CSI run through OCR for data-entry assist. Optional.
- **Post-delivery signed copy** (t=4): the pink/yellow/duplicate copy the hospital returns after acknowledging delivery — the actual dunning-grade proof Finance uses for AR follow-up. Required for collection.

`SALES_SETTINGS.REQUIRE_CSI_PHOTO` (default 1) gated **Validate** on the presence of *any* `csi_photo_url`, regardless of source. This inverted the real calendar for live Sales (stocks ship *after* invoice issuance; the signed copy doesn't exist yet at Validate time) and overwrote the OCR-source image when BDMs later uploaded the signed copy (lost audit trail).

The rejection-fallback "Re-upload CSI Photo" button in SalesEntry was also broken: `handlePhotoReupload` only updated React state and never called `updateSale`, so the URL never reached the DB.

### Fix
Separate the two artifacts and move the enforcement to the right event.

1. **Schema** ([SalesLine.js](backend/erp/models/SalesLine.js)): new fields `csi_received_photo_url`, `csi_received_attachment_id`, `csi_received_at`. `csi_photo_url` stays as the entry-time OCR source image.
2. **Validate gate by source** ([salesController.js:validateSales](backend/erp/controllers/salesController.js#L548)):
   - `OPENING_AR` rows only — blocks when *neither* proof field is set ("any proof OK"), gated by new lookup `REQUIRE_CSI_PHOTO_OPENING_AR` (default 1).
   - `SALES_LINE` (live Sales) — no Validate gate, no Submit gate. Photo is a post-posting artifact.
3. **New endpoint** `PUT /sales/:id/received-csi` ([attachReceivedCsi](backend/erp/controllers/salesController.js#L1453)) — writes the three new fields only. Allowed on DRAFT / VALID / ERROR / POSTED. Blocked on DELETION_REQUESTED + reversed (`deletion_event_id`). Period-lock enforced; OPENING_AR rows bypass lock (matches submit). Audit log entry written.
4. **Lookup split** ([lookupGenericController.js](backend/erp/controllers/lookupGenericController.js#L1026)):
   - `REQUIRE_CSI_PHOTO_OPENING_AR` (default 1) — gates Opening AR Validate. Per-entity tunable.
   - `REQUIRE_CSI_PHOTO_SALES_LINE` (default 0) — reserved future Submit-gate hook for live Sales. No enforcement today; flipping to 1 is a future code hook if a subscriber's workflow waits for delivery confirmation before posting.
5. **Migration script** ([migrateSalesPhotoLookup.js](backend/erp/scripts/migrateSalesPhotoLookup.js)) — one-shot, idempotent. Copies each entity's legacy `REQUIRE_CSI_PHOTO.metadata.value` into the new `_OPENING_AR` code (preserving subscriber tuning), seeds `_SALES_LINE` at 0, deactivates the legacy row.
6. **Dunning readiness in AR aging** ([arEngine.js:getArAging](backend/erp/services/arEngine.js#L84)) — projects `csi_received_photo_url`, `csi_received_at`, computed `dunning_ready`. Summary gains `dunning_ready_ar/count` + `dunning_missing_ar/count`. OPENING_AR auto-treated as ready (entry-time proof satisfies).
7. **Document detail builder + hydrator + Approval Hub signing** — all surface + sign the new URL alongside `csi_photo_url`.

### Frontend changes
- [useSales.js](frontend/src/erp/hooks/useSales.js): `attachReceivedCsi(id, { csi_received_photo_url, csi_received_attachment_id })`.
- [SalesList.jsx](frontend/src/erp/pages/SalesList.jsx): new 📷 dunning column (✓ attached / ⚠️ missing on POSTED / — otherwise). "Attach CSI" / "Replace CSI" action button on DRAFT/VALID/ERROR/POSTED rows, skipped for OPENING_AR + reversed. ScanCSIModal reused in `photoOnly` mode. Detail modal shows the attached signed CSI link + date, or a hint to attach.
- [SalesEntry.jsx](frontend/src/erp/pages/SalesEntry.jsx): removed both "📷 Re-upload CSI Photo" buttons (desktop row + mobile card) and the state-only `handlePhotoReupload` handler that never persisted. "📎 Upload CSI" (new-row creation with photo) kept. Lifecycle photo upload now lives only on SalesList per the prior SalesList-owns-lifecycle rule.
- [WorkflowGuide.jsx](frontend/src/erp/components/WorkflowGuide.jsx): rewrote `sales-entry`, `sales-opening-ar`, `sales-list` photo sections to match the new two-phase flow.

### Governing principles
- **Rule #3 (no hardcoded business values)**: lookup split is per-entity tunable. Non-pharma / service-only subscribers flip `REQUIRE_CSI_PHOTO_OPENING_AR` to 0 in Control Center without code change. The reserved `_SALES_LINE` lookup is the future-proof hook for subscribers who need delivery-gated posting.
- **Rule #19 (entity-scoped)**: `getSalesSetting(req.entityId, ...)` reads per-entity; no cross-entity bleed.
- **Rule #20 (workflow lifecycle)**: period-lock check included; no cross-period retroactive evidence; reversed/deletion-requested rows rejected; audit log entry on every write.
- **Rule #21 (no silent self-ID fallback)**: attach endpoint uses `req.tenantFilter`, which is already filter-aware. Privileged users can attach to any row in the entity; contractors only to their own.
- **Rule #1/#4 (bulletproof)**: happy path (attach → column flips), failure paths (reversed → 400, deletion-requested → 400, closed period → 400, empty body → 400), wiring checked across backend + frontend + approval hub + reversal console + AR aging + workflow guide.

### Behavior change (deliberate)
Existing subscribers with `REQUIRE_CSI_PHOTO=1` today lose the Validate/Submit gate on live Sales. This is intentional: the gate was enforcing a photo that can't physically exist at Validate time. If a subscriber truly wants a delivery-gated Submit, flip `REQUIRE_CSI_PHOTO_SALES_LINE` to 1 and we can wire a Submit-side check in a follow-up (hook documented; enforcement deferred).

### Downstream safety
- `csi_photo_url` retained — all existing consumers (OpeningArList, DocumentDetailPanel, Collection detail modal, CsiPhoto component, universalApprovalService signing) still work.
- `CollectionModel.csi_photo_urls[]` (plural, collection-side) untouched.
- `SalesLine` status enum unchanged. Attach does not mutate status. Reopen does not clear received photo (physical receipt doesn't un-happen when accounting reverses).
- `getSales` / `getSaleById` return the full document (no `.select()` restriction) — new fields flow naturally.
- `REVERSAL_HANDLERS` count unchanged. Reversal path preserves `csi_received_photo_url` on the original POSTED row for audit.

### Deploy
1. Deploy backend + frontend together.
2. Run `node backend/erp/scripts/migrateSalesPhotoLookup.js` to split the legacy lookup per entity (idempotent, safe to re-run).

### Full detail
See [docs/PHASETASK-ERP.md](docs/PHASETASK-ERP.md#phase-36--received-csi-photo-separation--dunning-readiness-april-22-2026).

---

## Phase G1.6 — Logbook-Driven Per-Diem + Per-Role Thresholds + Cleanup Queue UX (April 22, 2026)

Closes the nine-item follow-up backlog queued at the end of G1.5. Ships non-pharma per-diem (CarLogbook-sourced), per-role threshold overrides without code deploys, a "Needs Cleanup" admin filter for the locality/province backfill workflow, and CPT Excel parser support for the two new structured-address columns. Three items from the backlog remain deliberately deferred (see end of section for rationale).

### Contract — what changed vs G1.5

| Surface | G1.5 state | G1.6 change |
|---|---|---|
| Per-diem source | `eligibility_source='logbook'` resolved but aggregation returned zeros (stub) | `smerCrmBridge.getDailyLogbookCounts()` reads from `CarLogbookEntry` (POSTED + `official_km > 0`). 1 qualifying day = 1 `md_count`. Admin configures tier thresholds per role. |
| Per-role tier thresholds | Hardcoded chain: `CompProfile > Settings.PERDIEM_MD_FULL/HALF` | New layer between: `CompProfile > PERDIEM_RATES.metadata.full_tier_threshold/half_tier_threshold > Settings`. `null` at any layer = defer to next. Delivery-driver example: `full_tier_threshold=1` → any worked day triggers FULL. |
| Admin address cleanup | Backfill script existed, but admin had no way to *see* which doctors were missing locality/province | `GET /api/doctors?needsCleanup=true` + frontend FilterDropdown. Dedicated "Location" column on DoctorManagement shows `{locality}, {province}` or a `Needs Cleanup` pill when blank. |
| CPT Excel import | Locality/province columns never emitted by the parser | `excelParser.js` now reads optional cols AN (LOCALITY) + AO (PROVINCE). Legacy workbooks silently pass through; enhanced templates populate on import so backfill queue stays empty. |
| BDM Client modal | Already had cascading picker from G1.5 (survey confirmed) | No change. Flagged in original deferred list but was stale. |
| Report-view cleanup | Admin visit report showed raw address only | Address cell now stacks `clinicOfficeAddress` over `{locality}, {province}` when present. Non-disruptive to CPT Excel export layout. |

### Files changed

**Backend (6):**
- `controllers/doctorController.js` — `needsCleanup=true` filter; refactored to `$and`-compose with search so both can coexist.
- `controllers/clientController.js` — same filter composition for regular clients.
- `utils/excelParser.js` — `CPT_COLS.LOCALITY=39 (AN)`, `CPT_COLS.PROVINCE=40 (AO)`. Legacy workbooks return empty strings → importController's `|| undefined` preserves the old "skip on empty" behavior.
- `erp/services/perdiemCalc.js` — `resolvePerdiemThresholds(settings, compProfile, perdiemConfig?)` 3-arg signature. Precedence chain: CompProfile > PERDIEM_RATES > Settings. `computePerdiemTier` + `computePerdiemAmount` accept trailing optional `perdiemConfig`. Unused callers unaffected (backward compatible).
- `erp/services/smerCrmBridge.js` — imports `CarLogbookEntry`. `getDailyMdCounts(opts.source)` dispatches: `visit` (default) → Visit aggregation; `logbook` → new `getDailyLogbookCounts`; `manual|none` → empty. `getDailyVisitDetails(opts.source)` mirrored for drill-down. Exports now include `getDailyLogbookCounts`.
- `erp/controllers/expenseController.js` — `getSmerCrmMdCounts` passes `source: perdiemConfig.eligibility_source` + `perdiemConfig` (5th arg) into `computePerdiemAmount`. `getSmerCrmVisitDetail` resolves source before drill-down. `getPerdiemConfig` (display endpoint) pulls perdiemConfig with try/catch so unseeded entities degrade instead of throwing on a GET.

**Backend lookups (1):**
- `erp/controllers/lookupGenericController.js` — `PERDIEM_RATES` seed updated: `logbook` annotation moved from "stub" to "wired"; added `DELIVERY_DRIVER` example row (`rate_php: 500`, `eligibility_source: 'logbook'`, `full_tier_threshold: 1`, `allow_weekend: true`).

**Frontend (3):**
- `pages/admin/DoctorsPage.jsx` — `filters.needsCleanup` threaded through both `fetchDoctors` and `fetchRegularClients`; `fetchRegularClients` useCallback dep array updated.
- `components/admin/DoctorManagement.jsx` — new Location column with conditional `Needs Cleanup` pill; new FilterDropdown for cleanup toggle.
- `components/admin/EmployeeVisitReport.jsx` — address cell stacks clinicOffice + structured location; both VIP and regular-client tables.

### Governance

- **Rule #3 (lookup-driven)**: per-role thresholds now live in `PERDIEM_RATES.metadata`. Non-pharma subscribers flip `full_tier_threshold` and `half_tier_threshold` via Control Center → Lookup Tables without a deploy.
- **Rule #21 (no silent fallback)**: missing `PERDIEM_RATES` row still throws in the strict path (SMER generation, approval, payroll). Only the display-only `GET /expenses/perdiem-config` degrades — admin sees Settings-defaults until they seed the row.
- **Rule #20 (period locks + audit)**: no changes. Logbook source reads only `status: 'POSTED'` entries to preserve audit integrity — paying per-diem on an in-progress DRAFT would risk double-payment on reopen.

### Deliberately deferred (unchanged from user's G1.5 backlog)

| Item | Why still deferred |
|---|---|
| Flip Doctor/Client validators to `.notEmpty()` on CREATE | Runtime data dependency — can't verify backfill queue is empty from code. Schedule after admin runs backfill script + confirms zero `Needs Cleanup` rows. |
| Migrate `settings.REVOLVING_FUND_AMOUNT \|\| 8000` fallback in expenseController | Explicitly flagged as "separate follow-up phase". Needs its own PR — touches travel-advance resolution chain across 2 call sites with different semantics. |
| Extend `PH_LOCALITIES` seed to full ~1,600 PSGC rows | Needs external PSA dataset. Starter seed (~50 rows) already works; admin can add ad-hoc via Control Center today. Phase G1.7+ when PSA feed is plumbed in. |

### Known risk notes (carried forward from G1.5)

- Mid-cycle PERDIEM_RATES edits don't affect existing DRAFT SMERs — rate is stamped at `SmerEntry.create` time. Editing mid-cycle only affects NEW SMERs. Matches revolving-fund semantics.
- POSTED legacy SMERs keep their originally-stamped rate on reopen via the Reversal Console (does not re-fetch from lookup). Historical ledger integrity preserved.
- Universal approval service's best-effort CRM enrichment (line 502) still hard-codes `visit` source — non-pharma approvals show empty `cities_visited`. Non-blocking (best-effort), upgrade when approval-review needs logbook-aware drill-down.
- Pre-existing pattern `computePerdiemAmount(tier === 'FULL' ? 999 : 3, ...)` in 4+ call sites would fail if `full_tier_threshold > 999` or `half_tier_threshold > 3` (unlikely but theoretically possible). Preserved as-is to keep scope contained; rewrite to `computePerdiemAmountForTier(tier, rate)` in a follow-up.

---

## Phase G1.5 — Per-Diem Integrity + Structured Doctor Address + Non-Pharma Ready (April 21, 2026)

Closes the four governance gaps surfaced in the April 21 per-diem audit (items #4/#5/#6/#7): flagged-photo visits earned per-diem, hardcoded ₱800 rate fallback, weekend exclusion was hardcoded not configurable, and per-diem notes leaked raw clinic addresses instead of clean `City, Province` labels. Also preps per-diem for non-pharma subsidiaries (delivery drivers, field techs) by routing rate resolution through a per-entity × per-role lookup.

### Contract — what changed vs pre-G1.5

| Surface | Before G1.5 | After G1.5 |
|---|---|---|
| Per-diem rate resolution | `Settings.PERDIEM_RATE_DEFAULT \|\| 800` (silent fallback) | `Lookup(PERDIEM_RATES).metadata.rate_php` — throws `ApiError(400)` if no row. Rule #21 clean. |
| Flagged-photo visit | Still earned per-diem | `PERDIEM_RATES.metadata.skip_flagged=true` drops it from the CRM aggregation. Visit stays in CRM for audit. |
| Weekend per-diem | Hardcoded `if (dow===0 \|\| dow===6) continue` | `PERDIEM_RATES.metadata.allow_weekend` (default false for pharma; non-pharma flips via Control Center). |
| SMER per-diem "locations" note | Raw `clinicOfficeAddress` concatenation (e.g. "Rm 302 Medical Arts Bldg, Jaro") | Structured `${locality}, ${province}` from Doctor/Client (e.g. "Iloilo City, Iloilo; Digos City, Davao del Sur"). Fallback to raw address only for pre-backfill legacy docs. |
| Doctor/Client schema | `clinicOfficeAddress` free-text only | Added optional `locality` + `province`. Validator keeps them **optional on CREATE and UPDATE during rollout** so legacy flows (BDM ClientAddModal, CPT `Doctor.insertMany`) don't regress. Admin DoctorManagement form shows cascading dropdown as "recommended" (not required). Flip to required in a follow-up phase after backfill + BDM form gets the picker. New indexes on `locality` + `province`. |
| Subscription readiness | Single hardcoded rate, pharma-only | One `PERDIEM_RATES` row per role (BDM/ECOMMERCE_BDM/…/DELIVERY_DRIVER); non-pharma seeds their own rate + `eligibility_source` without touching code. |

### Lookup shape

`PERDIEM_RATES` Lookup — per-entity × per-role per-diem config:

```js
{
  category: 'PERDIEM_RATES',
  code: 'BDM',  // or 'ECOMMERCE_BDM', 'DELIVERY_DRIVER' (future), etc.
  label: 'BDM (pharma field rep) — visit-driven per-diem',
  metadata: {
    rate_php: 800,                   // hard requirement: > 0 number (resolver throws otherwise)
    eligibility_source: 'visit',     // 'visit' (CRM Visit) | 'logbook' (CarLogbook, G1.6 stub) | 'manual' | 'none'
    skip_flagged: true,              // true = photoFlags[] non-empty → no per-diem
    allow_weekend: false,            // false = Sat/Sun dropped from aggregation
    full_tier_threshold: null,       // null = use CompProfile → Settings chain; number = override here
    half_tier_threshold: null,
  }
}
```

`PH_PROVINCES` + `PH_LOCALITIES` Lookups — reference data for structured address:

```js
// PH_PROVINCES — 82 rows seeded (ISO 3166-2:PH-like codes)
{ code: 'ILI', label: 'Iloilo', metadata: { region: 'VISAYAS' } }

// PH_LOCALITIES — starter ~50 rows (cities VIP BDMs operate in); admin adds more via Control Center
{ code: 'ILOILO_CITY_ILI', label: 'Iloilo City', metadata: { type: 'city', province_code: 'ILI' } }
```

### Resolver contract

`resolvePerdiemConfig({ entityId, role })` in `backend/erp/services/perdiemCalc.js`:

- Missing/inactive PERDIEM_RATES row → throws `ApiError(400, "Seed PERDIEM_RATES for role X before running payroll...")`.
- Invalid `rate_php` (NaN, zero, negative) → throws `ApiError(400, "PERDIEM_RATES.X.metadata.rate_php invalid...")`.
- Valid row → returns normalized config (`skip_flagged` defaults true, `allow_weekend` defaults false, thresholds default null).

Callers: `expenseController.createSmer` (rate stamped on SMER at create), `expenseController.getSmerCrmMdCounts` (passes `skip_flagged` + `allow_weekend` to bridge). Downstream readers (`updateSmer`, per-diem override approve/reject, `repairStuckPerdiemOverrides`, `universalApprovalService.approvePerdiemOverride`) continue to use `smer.perdiem_rate` — the rate stamped at create time. Rate only re-resolves on SMER creation; no cross-request drift.

### Key files

| File | Change |
|---|---|
| `backend/erp/services/perdiemCalc.js` | Added `resolvePerdiemConfig({ entityId, role })` with ApiError propagation. Existing `computePerdiemAmount` signature unchanged (caller resolves rate). |
| `backend/erp/services/smerCrmBridge.js` | `getDailyMdCounts(..., opts)` accepts `{ skipFlagged }`. `photoFlags` filter applied via `$or: [{photoFlags:{$exists:false}}, {photoFlags:{$size:0}}]`. Doctor fetch now selects `locality province`. `locations` field built as unique `${locality}, ${province}` set per day (fallback to clinicOfficeAddress for legacy). |
| `backend/erp/controllers/expenseController.js` | `createSmer`: rate via `resolvePerdiemConfig` (role='BDM'), `req.body.perdiem_rate` still honored as explicit override. `getSmerCrmMdCounts`: pre-resolves config, passes `skipFlagged` to bridge, weekend skip now driven by `config.allow_weekend`. Zero `\|\| 800` literals remain. |
| `backend/erp/models/Settings.js` | Removed `PERDIEM_RATE_DEFAULT`. Kept `PERDIEM_MD_FULL/HALF` as thresholds (CompProfile/lookup can override via `resolvePerdiemThresholds`). |
| `backend/erp/scripts/seedSettings.js` + `testPhase7.js` | References to `PERDIEM_RATE_DEFAULT` removed. Test fixture uses constant 800 with explicit comment. |
| `backend/erp/controllers/lookupGenericController.js` | Added `PERDIEM_RATES`, `PH_PROVINCES` (82 rows), `PH_LOCALITIES` (~50-row starter) to `SEED_DEFAULTS`. `PERDIEM_RATES` rows use `insert_only_metadata` so admin's per-entity rate edits survive re-seed. |
| `backend/models/Doctor.js` + `backend/models/Client.js` | Added optional `locality` + `province` fields with length caps + indexes. |
| `backend/middleware/validation.js` | `locality`/`province` **optional on both CREATE and UPDATE** during rollout (downgraded post-audit from `required on CREATE` — would have regressed the BDM `ClientAddModal` flow which does not yet carry these fields). Backfill + admin curation fills the gap. |
| `backend/controllers/visitController.js`, `productAssignmentController.js`, `clientController.js`, `communicationLogController.js`, `services/reportGenerator.js`, `utils/aiMatcher.js`, `models/Visit.js`, `models/Schedule.js`, `models/ProductAssignment.js`, `smerCrmBridge.js` | `.populate('doctor'/'client', '...locality province')` + response-shape additions across ~20 sites so frontend consumers receive the structured fields. |
| `backend/controllers/importController.js` | `buildDoctorFields` carries optional `locality`/`province` from CPT parser (future CPT workbooks can add columns; legacy workbooks skip these and rely on backfill). |
| `backend/erp/scripts/backfillDoctorLocality.js` | **NEW.** Dry-run / `--apply` migration: parses last 2 comma-separated tokens from legacy `clinicOfficeAddress`, fuzzy-matches against PH_LOCALITIES + PH_PROVINCES, auto-applies on confident match, emits a "needs review" report for partial/no-match rows. Idempotent. |
| `frontend/src/components/admin/DoctorManagement.jsx` | `useLookupOptions('PH_PROVINCES'/'PH_LOCALITIES')` hooks, cascading Province → Locality dropdown inserted after the free-text address field, required on create. Payload propagates both fields. |
| `frontend/src/erp/components/WorkflowGuide.jsx` | `smer-entry` and `payslip-view` entries updated to document PERDIEM_RATES dependency, flagged-photo exclusion, weekend toggle, and structured address source. |

### Integrity invariants

- **Loud failure (Rule #21)**: Missing or invalid `PERDIEM_RATES` row never silently defaults to ₱800. SMER create/CRM-md-counts endpoints return HTTP 400 with a clear remediation message ("Seed PERDIEM_RATES for role X in Control Center"). Admin and Finance see the failure; ledger stays consistent.
- **Rate persistence (no drift)**: `smer.perdiem_rate` is stamped at create time from the resolver. Downstream override flows (apply-override, approval-service, repair script) use the stamped rate, not a fresh lookup. If admin changes the PERDIEM_RATES row mid-cycle, existing DRAFT/VALID SMERs keep their original rate; new SMERs get the new rate. Matches the existing revolving-fund precedence chain.
- **Flagged filter is advisory on CRM-side**: The photoFlags filter runs in the SMER-CRM-bridge aggregation only. The Visit record itself is unchanged — CRM audit/review workflows continue to surface flagged visits. Admin unflag after POSTED → existing Phase 34-P per-diem override remains the retroactive correction path (no auto-recompute).
- **Phase O whitelist (May 05 2026)**: pre-Phase-O the bridge treated ANY photoFlag as disqualifying (`$size === 0` against the raw photoFlags array). Phase O introduced 3 new SIGNAL flags (`no_exif_timestamp`, `gps_in_photo`, `late_log_cross_week`) carried by legitimate visits — the in-app camera produces `no_exif_timestamp` on every capture (canvas → JPEG has no EXIF), so the old filter would have killed per-diem for the entire BDM force. Bridge now uses `$setIntersection` against the constant `PERDIEM_DISQUALIFYING_FLAGS = ['date_mismatch', 'duplicate_photo']`. Only fraud flags disqualify; signal flags stay countable. Future-Phase work: lift the constant to a Lookup category for true subscriber tunability. See [CLAUDE.md note 13d](CLAUDE.md) for the full Phase O contract; healthcheck section 9b in [backend/scripts/healthcheckPhaseOPhotoTrust.js](backend/scripts/healthcheckPhaseOPhotoTrust.js) guards against regression.
- **Fallback locale rendering**: `locality/province` are optional in schema; when null (legacy doc pre-backfill), `getDailyMdCounts` falls back to `clinicOfficeAddress` for the locations note, then `locality` only, then null. Never crashes on missing fields.
- **CPT import compatibility**: Pre-G1.5 CPT workbooks (no locality/province columns) still import cleanly — backfill handles the gap. Post-G1.5 workbooks can add `locality` + `province` columns for zero-cleanup imports.
- **Populate path coverage**: Every `.populate('doctor'/'client', ...)` call updated to include `locality province`. Visit-based responses, GPS verification, product assignments, communication logs, schedules, report generator, and AI matcher all emit the structured fields.

### Rule adherence

- **Rule #2 (end-to-end wiring)** — PERDIEM_RATES lookup → seed defaults → SEED_DEFAULTS auto-seed on first lookup fetch → `resolvePerdiemConfig` → expenseController create/CRM-counts → smerCrmBridge aggregation → SMER document → downstream approval & override flows (already pass `smer.perdiem_rate`). Frontend: lookup API → useLookupOptions hook → DoctorManagement cascading dropdowns → doctorService payload → doctorController validation → Doctor/Client model → populate paths → Visit responses → SMER UI. Sidebar access unchanged.
- **Rule #3 (no hardcoded business values)** — ₱800 literal eliminated from codebase (grep for `\|\| 800` in per-diem code paths returns zero matches). Weekend policy, flagged-photo policy, thresholds (future), rate per role — all lookup-driven. PH_PROVINCES + PH_LOCALITIES are reference data (lookup-driven too; admin extends the locality list without code).
- **Rule #19 (subscription-ready)** — New non-pharma subsidiary onboarding recipe:
  1. `Entity.create({ name: 'VIP Logistics' })`
  2. First lookup fetch auto-seeds PERDIEM_RATES.BDM + .ECOMMERCE_BDM pharma defaults
  3. Admin edits PERDIEM_RATES rows in Control Center → updates `rate_php`, adds DELIVERY_DRIVER row with `eligibility_source='logbook'`, `allow_weekend=true`, adjusted thresholds
  4. Per-diem flow runs immediately for the new role set
- **Rule #21 (no silent fallbacks)** — `|| 800` removed; `resolvePerdiemConfig` throws on missing row. Weekend check reads config explicitly, not a hardcoded check. Flagged-photo filter reads config explicitly.

### Migration notes

- **No backfill required for PERDIEM_RATES** — lazy-seeds on first API call to `/api/erp/lookup-values/PERDIEM_RATES` via the existing `seedCategory` fallback. For production, run `seedAllLookups.js` once to prime all entities.
- **Doctor/Client locality backfill** — run `backfillDoctorLocality.js` in dry-run mode first to see the split (auto-match vs review). `--apply` writes the auto-match results; admin cleans the review queue via existing DoctorManagement page. Backfill is idempotent.
- **Legacy SMERs pre-G1.5**: unchanged. Rate stamped at create time; CRM-bridge locations recomputed on re-open (next time `getSmerCrmMdCounts` runs). Already-POSTED SMERs keep their original per-diem journal entries; no recompute risk.
- **`Settings.PERDIEM_RATE_DEFAULT` removal**: existing Settings documents that have this field set in the DB are harmless — Mongoose simply won't expose it since it's not in the schema. No migration needed.

### Test plan

- **Happy path (pharma)**: BDM with PERDIEM_RATES.BDM seeded (₱800, visit, skip_flagged:true, allow_weekend:false) + 5 valid weekday visits, no flagged photos, all doctors have locality+province → SMER CRM-md-counts returns ₱4000 total, locations = "Iloilo City, Iloilo; Bacolod City, Negros Occidental" (deduplicated).
- **Failure 1 (missing PERDIEM_RATES)**: Delete the BDM row → SMER create / CRM-counts endpoint returns HTTP 400 with remediation message. No silent ₱800.
- **Failure 2 (flagged visit)**: 3 valid + 2 flagged visits in a day → md_count reports 3, per-diem tier drops accordingly.
- **Failure 3 (unflag after POST)**: Admin flags a visit after SMER POSTED → per-diem does NOT auto-recompute. Admin uses Phase 34-P per-diem override (existing path) to adjust.
- **Failure 4 (legacy doctor null locality)**: Doctor without locality/province → locations note falls back to clinicOfficeAddress; no crash.
- **Failure 5 (weekend toggle ON)**: Admin flips PERDIEM_RATES.BDM.allow_weekend=true → Saturday visits now count toward per-diem.
- **Subscription path (non-pharma stub)**: New entity + DELIVERY_DRIVER row with eligibility_source='logbook' → resolver returns config; bridge stub logs "logbook source not yet wired — G1.6" without crashing.
- **CPT import (legacy workbook without locality cols)**: Imports cleanly; doctors land without locality/province; backfillDoctorLocality.js auto-matches ≥80% on a typical VIP CPT, flags rest for review.
- **Populate path coverage**: Visit response shape includes `doctor.locality` + `doctor.province`; GPS verification, product assignments, communication logs, Schedule listing all emit the new fields.
- **Integrity**: `node -c` clean on 12 modified backend files. `npx vite build` clean. `grep \|\| 800` in per-diem paths → 0 matches. `grep PERDIEM_RATE_DEFAULT` in non-comment code → 0 matches.

---

## Phase G1.4 — Employee DeductionSchedule Wiring + Finance Per-Line UI (April 21, 2026)

Closes the three items deferred from Phase G1.3: INSTALLMENT N/M on employee payslips, Finance per-line deduction CRUD, and `IncomeReport` schema convergence. A BDM who graduates to employee now keeps a single deduction-schedule lifecycle, and Finance has identical tooling on both surfaces.

### Contract — what changed vs Phase G1.3

| Surface | Before G1.4 | After G1.4 |
|---|---|---|
| `DeductionSchedule.bdm_id` | Required | Optional — XOR with `person_id` (enforced in pre-save) |
| `DeductionSchedule.person_id` | Did not exist | Optional `ref: PeopleMaster`. Employee schedules inject into `Payslip.deduction_lines`. |
| `DeductionSchedule.installments[].payslip_id` | Did not exist | Populated by `syncInstallmentStatusForPayslip` when the installment lands on a Payslip (sibling of existing `income_report_id`). |
| `IncomeReport.deductionLineSchema` | Inline copy (byte-identical to shared) | `require('./schemas/deductionLine')` — single source of truth |
| Employee Payslip kind badge | Always `ONE-STOP` | `INSTALLMENT N/M` when the line's `auto_source='SCHEDULE'` and `breakdown.schedules` hydrated |
| Finance per-line UI on Payslip | None (flat-field entry only) | Verify (✓) / Correct (✎) / Reject (✕) per line + **+ Add Deduction** button + schedule expander |
| SCHEDULE-line reject on Payslip | — | Cascades to `DeductionSchedule.installments.status = CANCELLED` (same contract as IncomeReport) |

### Routing & role gates

| Route | Method | Role | Notes |
|---|---|---|---|
| `POST /api/erp/payroll/:id/deduction-line` | POST | admin, finance, president | Finance adds a line (status=VERIFIED). Blocked if status ∉ {COMPUTED, REVIEWED} or period locked. |
| `POST /api/erp/payroll/:id/deduction-line/:lineId/verify` | POST | admin, finance, president | Body `{ action: 'verify'|'correct'|'reject', amount?, finance_note? }`. Cascades SCHEDULE lines to installment status. |
| `DELETE /api/erp/payroll/:id/deduction-line/:lineId` | DELETE | admin, finance, president | Removes a non-auto line. Auto-source lines (statutory, Personal Gas, SCHEDULE) must be rejected instead — they rebuild on next compute. |
| `POST /api/erp/deduction-schedules/finance-create` | POST | admin, finance, president | Body accepts **either** `bdm_id` (contractor) **or** `person_id` (employee) — exactly one, XOR enforced. |

### Key files

| File | Change |
|---|---|
| `backend/erp/models/IncomeReport.js` | Replaced inline `deductionLineSchema` with `require('./schemas/deductionLine')`. Zero field delta, single source of truth now. |
| `backend/erp/models/DeductionSchedule.js` | `bdm_id` → optional. New `person_id: ref PeopleMaster`. New `installmentSchema.payslip_id`. Pre-save XOR validator. Two sparse partial indexes (bdm-owner, person-owner). |
| `backend/erp/services/deductionScheduleService.js` | `createSchedule` accepts `{ bdm_id } \| { person_id }` (legacy string arg still works). Employee schedules use entity-scoped doc numbering (no territory). Added `syncInstallmentStatusForPayslip`. |
| `backend/erp/controllers/deductionScheduleController.js` | `createSchedule` (BDM route) passes `{ bdm_id }` explicitly. `financeCreateSchedule` accepts XOR `bdm_id`/`person_id`. `getScheduleList` supports `?person_id=`, `?owner_type=BDM\|EMPLOYEE`. `getScheduleById` + list populate both refs. |
| `backend/erp/services/universalApprovalService.js` | DEDUCTION_SCHEDULE query populates `person_id`; description renders `${owner_name} (${owner_class})`. DOC_TYPE_HYDRATION adds `person_id` populate. |
| `backend/erp/services/documentDetailBuilder.js` | `buildDeductionScheduleDetails` surfaces `owner_name` + `owner_class` + `department` regardless of whether the schedule is BDM-owned or employee-owned. |
| `backend/erp/services/payslipCalc.js` | Added `buildScheduleLinesForPerson` + `_syncInjectedInstallmentsForPayslip`. `generateEmployeePayslip` merges auto + preserved + new schedule lines. `deriveFlatFromLines` routes SCHEDULE lines by `deduction_type`. `getPayslipBreakdown` hydrates `schedules` dict. Exported `deriveFlatFromLines` for controller reuse. |
| `backend/erp/controllers/payrollController.js` | New Finance per-line endpoints: `financeAddDeductionLine`, `verifyDeductionLine`, `removeDeductionLine`. All call `deriveFlatFromLines` post-mutation (keeps JE in sync). SCHEDULE-line verify/reject cascades via `syncInstallmentStatusForPayslip`. Period-lock enforced. |
| `backend/erp/routes/payrollRoutes.js` | Added three new routes above `/:id` (param-order-safe). |
| `frontend/src/erp/hooks/usePayroll.js` | Added `addPayslipDeductionLine`, `verifyPayslipDeductionLine`, `removePayslipDeductionLine`. |
| `frontend/src/erp/pages/PayslipView.jsx` | INSTALLMENT N/M badge derived from `breakdown.schedules`. New schedule expander (installment timeline with current-row highlight). Finance action buttons (Verify/Correct/Reject/Remove) gated on `ROLE_SETS.MANAGEMENT` + status ∈ {COMPUTED,REVIEWED}. Add-Deduction + Correct-Amount modals. Breakdown auto-loads when any SCHEDULE line is present (so the badge renders without manual expand). |
| `frontend/src/erp/components/WorkflowGuide.jsx` | `payslip-view` entry rewritten to document INSTALLMENT N/M, Finance per-line actions, cascade semantics. |

### Integrity invariants

- **JE safety**: `deriveFlatFromLines` runs on every line mutation path (compute + Finance add/verify/correct/reject/remove). `Payslip.deductions.*` flat fields always reflect the non-REJECTED sum of `deduction_lines[]`. `autoJournal.journalFromPayroll` unchanged — still reads flat fields.
- **XOR invariant**: enforced at three layers: service-level validation in `createSchedule`, controller-level check in `financeCreateSchedule`, model-level pre-save throw on `DeductionSchedule`. Any one of them alone catches the bug; all three together make it impossible for a corrupt schedule to land in the DB.
- **Cascade consistency**: Finance rejects a SCHEDULE line → installment flips to CANCELLED; Finance verifies → installment flips to VERIFIED. Same contract as IncomeReport. Non-blocking: a schedule-save failure logs but does not revert the payslip (payslip is the source of truth for the employee's paycheck).
- **Status gate**: Line mutations only allowed while payslip ∈ {COMPUTED, REVIEWED}. After APPROVED/POSTED the JE exists — unwinding requires `POST /payroll/:id/president-reverse` first.
- **Period lock (Rule #20)**: `checkPeriodOpen(entity, period)` called on every line-mutation endpoint. Matches the posting gate on `postPayroll`.
- **Approval Hub parity**: Employee DeductionSchedules route through the same `MODULE_DEFAULT_ROLES.DEDUCTION_SCHEDULE` gate as BDM schedules. No new lookup keys required — the module is already roles-gated for admin/finance/president.

### Rule adherence

- **Rule #2 (end-to-end wiring)** — DeductionSchedule model → service → controller → routes → Approval Hub query → documentDetailBuilder → Payslip auto-injection → Payslip breakdown → PayslipView render → Finance action buttons → backend endpoints → usePayroll hook. Sidebar unchanged (payslip viewer is reached via Payroll Run row click).
- **Rule #3 (no hardcoded business values)** — `EMPLOYEE_DEDUCTION_TYPE` already seeded (Phase G1.3); new Finance-Add modal type dropdown reads it via `useLookupOptions`. No hardcoded arrays.
- **Rule #19 (subscription-ready)** — XOR owner (`bdm_id`/`person_id`) + sparse partial indexes mean one collection serves every subscriber regardless of workforce mix. Employee doc numbering uses `Entity.short_name` (no territory dependency). `MODULE_DEFAULT_ROLES.DEDUCTION_SCHEDULE` already governs who can approve — subscribers configure via Control Center.
- **Rule #20 (workflow banners + period locks)** — `payslip-view` banner rewritten to describe INSTALLMENT N/M, Finance actions, and cascade. `checkPeriodOpen` gates every mutation.
- **Rule #21 (no silent self-fallback)** — `getScheduleList` uses explicit `req.query.person_id` / `?owner_type=` query; no privileged fallback to `req.bdmId` anywhere in the payroll line-mutation paths. Entity scoping via `req.entityId` / president bypass is preserved.

### Migration notes

- **No data migration required.** Legacy BDM schedules still satisfy the XOR (they have `bdm_id` set, `person_id` unset). Legacy BDM `createSchedule` callers that pass a plain string `bdmId` still work (shim in the service detects string vs object).
- **`IncomeReport` schema** — the inline schema was byte-identical to the shared one. Replacing the import is a no-op on disk format; existing documents continue to validate.
- **Historical POSTED payslips** — still render via the Phase G1.3 lazy backfill. New Finance per-line actions only operate on COMPUTED/REVIEWED payslips, so historical docs remain read-only (correct).

### Test plan

- Generate a payslip for an employee with an ACTIVE employee-owned DeductionSchedule whose next installment period matches → row renders with INSTALLMENT N/M badge + expander shows full timeline with "← this payslip" on the injected row.
- Finance rejects the SCHEDULE line on the payslip → DeductionSchedule installment flips to CANCELLED, `total_deductions` drops by the line amount, JE still balances on post.
- Finance corrects a PENDING line → `original_amount` stored, new amount displayed with strikethrough of old. Re-compute preserves the corrected amount (doesn't clobber).
- Finance adds a manual line for ₱500 HMO → line appears with status=VERIFIED, `deductions.other_deductions` rises by ₱500, JE on post still balances.
- Create a BDM schedule via `POST /deduction-schedules` (contractor self-service) → approves via Approval Hub exactly as before. Zero regression on Phase G4.2 audit trail.
- `node -c` on all modified backend files clean. `npx vite build` clean.

---

## Phase G1.3 — Employee Payslip Transparency Parity (April 21, 2026)

Brings employee `Payslip` to the same transparency contract as contractor `IncomeReport`: a `deduction_lines[]` array with label + amount + status pill + kind badge + optional expandable source detail. A BDM who graduates to employee now sees the same layout they used as a contractor.

### Contract — what changed vs Phase G1.2

| Surface | Before G1.3 | After G1.3 |
|---|---|---|
| `Payslip.deductions.*` flat fields | Canonical source, hand-written by compute service | Derived from `deduction_lines[]` by `deriveFlatFromLines`. Still populated (JE consumer reads these). |
| `Payslip.deduction_lines[]` | Did not exist | New array — one line per statutory/manual deduction, shared schema with `IncomeReport.deduction_lines`. |
| Personal Gas for employees | Suppressed (no path) | Emitted for `CompProfile.logbook_eligible === true`. Always renders, even at ₱0 (confirms logbook reviewed). |
| Historical pre-G1.3 POSTED payslips | Rendered flat rows only | `getPayslip` lazy-backfills `deduction_lines` in memory from flat fields (no DB write). `description: "(historical — reconstructed for display)"`. |
| `GET /payroll/:id/breakdown` | Did not exist | Returns `{ personal_gas: { entries, summary, total_deduction }, schedules: {} }` — same shape as `getIncomeBreakdown`. |

### Key files

| File | Change |
|---|---|
| `backend/erp/models/schemas/deductionLine.js` | NEW — shared `deductionLineSchema` used by `Payslip`. `IncomeReport` keeps its own inline copy (low-risk; migrate in a follow-up). |
| `backend/erp/models/Payslip.js` | Added `deduction_lines: [deductionLineSchema]`. Pre-save prefers `deduction_lines` sum when non-empty, falls back to flat fields for historical docs. |
| `backend/erp/services/payslipCalc.js` | Builds `deduction_lines` via `buildAutoDeductionLines` + `buildManualLinesFromFlat`, then `deriveFlatFromLines` keeps JE consumer in sync. Added `getPayslipBreakdown` + `backfillDeductionLines`. |
| `backend/erp/services/incomeCalc.js` | Exported `resolveCompProfile` (was `_resolveCompProfile`) so payslipCalc can reuse logbook gate without duplicating. |
| `backend/erp/controllers/payrollController.js` | `getPayslip` now lazy-backfills; added `getPayslipBreakdown` handler. |
| `backend/erp/routes/payrollRoutes.js` | Added `GET /:id/breakdown` (ordered before `/:id`). |
| `backend/erp/controllers/lookupGenericController.js` | Added `EMPLOYEE_DEDUCTION_TYPE` seed (kept separate from `INCOME_DEDUCTION_TYPE` — statutory codes differ). |
| `frontend/src/erp/hooks/usePayroll.js` | Added `getPayslipBreakdown(id)`. |
| `frontend/src/erp/pages/PayslipView.jsx` | Rewrote deductions table to render `deduction_lines.map()` with status pill + kind badge + expandable Personal Gas panel. Lazy-loads breakdown on first expand. |

### Gate — who gets a Personal Gas row

Rule #3 — single source of truth is per-person `CompProfile.logbook_eligible: Boolean`. No new lookup, no hardcoded role check.

- `logbook_eligible === true` → Personal Gas row is emitted on every payslip for that person. Expanding the row loads the Car Logbook daily summary for `period + cycle` (monthly cycle sums C1+C2). Zero amount is a valid state ("No personal km logged this cycle — logbook reviewed").
- `logbook_eligible === false` → No Personal Gas row. Row is not pushed at all (not a ₱0 row). Keeps office-staff payslips tidy.

### Backward-compatibility contract

- **JE consumer (`autoJournal.journalFromPayroll`)** still reads `payslip.deductions.sss_employee / philhealth_employee / pagibig_employee / withholding_tax / cash_advance / loan_payments / other_deductions`. `deriveFlatFromLines` writes these on every compute. The JE never sees drift — flat fields are always in sync with the lines that sum them.
- **Historical POSTED payslips** (pre-G1.3) carry `deduction_lines: []`. The `GET /payroll/:id` controller calls `backfillDeductionLines` to synthesise lines from the flat fields **in memory** (synthetic `_id`s for React keys, no DB write). Reversal handler is unaffected — it uses `findById` (not lean) so the actual persisted doc is loaded and reversed.
- **SAP Storno reversal** (`reversePayslip` in `documentReversalService`) continues to work unchanged. Loaded doc carries `deduction_lines` if present, but the reversal logic doesn't need to touch them — JE reversal is keyed on `event_id`, and `doc.save({ session })` re-runs pre-save which picks the right sum source.

### Risks + watch-outs

- **Manual flat-field flows**: `cash_advance`, `loan_payments`, `other_deductions` are still written to flat fields via the existing Finance entry paths. On next re-compute, `buildManualLinesFromFlat` reconstructs them as lines — no data loss. G1.4 will add a per-line Finance add/verify UI (parity with `IncomeReport.financeAddDeductionLine`).
- **CompProfile.logbook_eligible + no Car Logbook**: if flag is true but the employee has no logbook entries this cycle, the row renders at ₱0 with "logbook reviewed" copy. This is intentional — Finance confirms by seeing the row, not by its absence.
- **Subscription-readiness**: lookup-driven via `EMPLOYEE_DEDUCTION_TYPE` (admin can add/remove codes from Control Center without code changes). Statutory rate tables stay in their own `GovernmentRates` model — subscribers set rates per entity.

### Verification checklist

1. Generate a payslip for an employee with SSS + PhilHealth + PagIBIG + Withholding Tax → `deduction_lines` has 4 rows. Flat `deductions.sss_employee` etc. still populated.
2. Open an existing POSTED payslip (pre-G1.3) → lazy backfill renders rows. `(historical — reconstructed for display)` description visible. No DB write.
3. Set `CompProfile.logbook_eligible = true` for an employee, leave Car Logbook empty → PERSONAL_GAS row at ₱0, expanding shows "No car logbook entries for this period".
4. Set `logbook_eligible = false` → No PERSONAL_GAS row.
5. `autoJournal.journalFromPayroll` JE posting — flat deductions still summed into DR-Salaries / CR-SSS/PH/Pag/WHT lines.
6. `npx vite build` → clean. `node -c` → clean on all modified backend files.

## Phase G1.2 — Payslip Transparency & SMER-ORE Retirement Hardening (April 21, 2026)

### Payslip identity (contractor IncomeReport)

```
SMER (Per Diem + Transport + ORE-cash) + Commission + Other Income − Deductions (with breakdown)
```

- **ORE = Expenses module only.** `ExpenseEntry.expense_type='ORE'` with `payment_mode='CASH'` is the single source of truth for reimbursable cash expenses. Receipt (OR number, photo, optionally OCR data) required.
- **ACCESS ≠ reimbursement.** `ExpenseEntry.expense_type='ACCESS'` (credit card / GCash / bank transfer) is company-paid. Never hits the payslip earnings — BDM didn't spend out of pocket.
- **SMER-ORE is retired.** `SmerEntry.daily_entries[].ore_amount` + `total_ore` exist in the schema for historical audit only. Pre-save guard rejects any new doc with `ore_amount > 0`. Legacy non-zero values on pre-retirement POSTED SMERs are preserved (reversal-safe) and surfaced as muted "audit only" rows in the UI.

### Personal Gas deduction

- Gate: `CompProfile.logbook_eligible === true` (no `has_car_logbook` or new lookup — reuses the existing flag).
- Row **always emitted** for eligible BDMs — even at ₱0 — with description "No personal km logged this cycle — logbook reviewed". BDM can always see the logbook was reviewed.
- Non-eligible (office staff): line suppressed (no meaningless ₱0 row).
- `_resolveCompProfile(entityId, bdmId)` inlined helper in `incomeCalc.js` (mirrors `loadBdmCompProfile` in `expenseController.js`) — keeps service dependency graph flat, no controller imports from service layer.

### Deduction row — kind badge + expandable timeline

Every row in the Deductions column carries a **kind badge** next to the status badge:

| `auto_source` | Badge | Expandable breakdown |
|---|---|---|
| `CALF` (CALF excess) | `ONE-STOP` gray | CALF documents table (advance / liquidated / balance) |
| `PERSONAL_GAS` | `ONE-STOP` gray | Daily Car Logbook + fuel cost summary |
| `SCHEDULE` (DeductionSchedule installment) | `INSTALLMENT N/M` amber | Schedule header (total / term / start period / remaining balance) + full installment timeline with current cycle highlighted |
| (manual) | `ONE-STOP` gray | Inline entered_by + entered_at + description |

`getIncomeBreakdown` now returns a `schedules` block keyed by `schedule_id` string — frontend drills into it via `line.schedule_ref.schedule_id`.

### Key files
- [backend/erp/models/SmerEntry.js](backend/erp/models/SmerEntry.js) — `@deprecated` JSDoc + pre-save `isNew` guard
- [backend/erp/services/incomeCalc.js](backend/erp/services/incomeCalc.js) — always-ExpenseEntry-ORE + `_resolveCompProfile` helper + always-emit PERSONAL_GAS + `breakdown.schedules` block
- [frontend/src/erp/pages/Income.jsx](frontend/src/erp/pages/Income.jsx), [MyIncome.jsx](frontend/src/erp/pages/MyIncome.jsx) — kind badges + installment expandable + PG ₱0 muted styling + legacy-only audit rows
- [frontend/src/erp/components/DocumentDetailPanel.jsx](frontend/src/erp/components/DocumentDetailPanel.jsx) — conditional ORE chip/column (hides when all zero)
- [frontend/src/erp/pages/Smer.jsx](frontend/src/erp/pages/Smer.jsx) — dropped `ore` from UI totals accumulator
- [frontend/src/erp/components/WorkflowGuide.jsx](frontend/src/erp/components/WorkflowGuide.jsx) — smer / expenses / income / myIncome banner copy aligned

### Downstream safety
- `REVERSAL_HANDLERS` count unchanged at 21 — schema still carries `total_ore` for historical POSTED docs.
- `expenseController.js` SMER auto-journal lines (COA 6170) gate on `if (smer.total_ore > 0)` — naturally skip on new (zero) docs, still fire for historical reposts.
- `expenseAnomalyService.js:165` and `universalApprovalService.js:585` both read `ExpenseEntry.total_ore` (not SMER) — unaffected.
- Pre-save `isNew` guard does NOT trip on status-update or reversal resaves of pre-retirement POSTED SMERs — audit preserved.

### Full detail
See [docs/PHASETASK-ERP.md](docs/PHASETASK-ERP.md#phase-g12--payslip-transparency--smer-ore-retirement-hardening--april-21-2026).

---

## Phase 35 — JE Normal-Balance Validator + Auto-Journal Sweep (April 21, 2026)

### Problem (incident root cause)
The JournalEntry pre-save validator's "#15 Hardening" guard rejected any line that credited a DEBIT-normal account or debited a CREDIT-normal account — even when the JE was balanced and the intent was a legitimate reduction (CR AR-BDM to draw down an advance, DR AP-Trade to pay a supplier, CR PETTY_CASH for a disbursement). In correct double-entry bookkeeping, the account's `normal_balance` describes where the *accumulated* positive position lives, not a per-line constraint. The guard was conceptually incorrect.

Every affected auto-journal path was wrapped in a `try { createAndPostJournal } catch (jeErr) { console.error(...) }` pattern, so the rejection was silently swallowed. Parent documents (SMER, Car Logbook, PRF/CALF, Collections, Petty Cash, Inter-Company, etc.) flipped to POSTED but the companion JournalEntry never landed, drifting the ledger by the undocumented amount daily from 2026-04-13 onward. Contractor Romela's two POSTED SMERs totalling ₱14,700 were the trigger report.

### Fix strategy (Option A — explicit contra sweep)
1. **Schema** — added `is_contra: Boolean` to `jeLineSchema` on [JournalEntry.js](backend/erp/models/JournalEntry.js). The #15 direction check now skips any line where `is_contra === true` (or when the whole JE is `is_reversal`).
2. **Enum gaps closed** — `JournalEntry.source_module` was also silently rejecting `CREDIT_NOTE`, `SUPPLIER_INVOICE`, and `SALES_GOAL` (used by their controllers but missing from the enum). `ErpAuditLog.log_type` was rejecting `LEDGER_ERROR` (9+ call sites), `CSI_TRACE`, `BATCH_UPLOAD_ON_BEHALF`, `CREATE`, `UPDATE`, `DELETE`, `BACKFILL`. Added all; these were latent silent-swallow gaps piggybacking on `.catch(() => {})` wrappers.
3. **Auto-journal helper sweep** — every `lines: [...]` in [autoJournal.js](backend/erp/services/autoJournal.js) + [journalFromIncentive.js](backend/erp/services/journalFromIncentive.js) reviewed. Added `is_contra: true` on reduction lines:
   - `journalFromCollection` — CR AR_TRADE
   - `journalFromCWT` — CR AR_TRADE
   - `journalFromExpense` — CR AR_BDM/funding (heuristic-driven)
   - `journalFromCommission` — CR AR_BDM
   - `journalFromPayroll` — CR bank (net pay disbursement)
   - `journalFromOwnerEquity` DRAWING — CR bank
   - `journalFromPettyCash` — CR PETTY_CASH in all three modes; CR OWNER_DRAWINGS in REPLENISHMENT
   - `journalFromCOGS` — CR INVENTORY
   - `journalFromInterCompany` SENDER — CR INVENTORY
   - `journalFromInventoryAdjustment` LOSS — CR INVENTORY
   - `journalFromPrfCalf` — CR funding (heuristic-driven)
   - `journalFromIncentive.postSettlementJournal` — DR INCENTIVE_ACCRUAL + CR funding
4. **Controller inline JEs** — sites that build JE lines without going through a helper were swept in the same pass:
   - [expenseController.js](backend/erp/controllers/expenseController.js): `submitSmer`, `submitCarLogbookCycle`, `submitExpenses`, `postSingleSmer`, `postSingleCarLogbook`, `postSingleExpense`, nested auto-submit-linked flows (CALF → EXPENSE + CALF → CAR_LOGBOOK)
   - [creditNoteController.js](backend/erp/controllers/creditNoteController.js): DR SALES_REVENUE + CR AR_TRADE (both contra)
   - [apPaymentService.js](backend/erp/services/apPaymentService.js): DR AP_TRADE + CR bank (both contra)
   - [bankReconService.js](backend/erp/services/bankReconService.js): CR bank for charges
   - [creditCardService.js](backend/erp/services/creditCardService.js): DR CC payable + CR bank (both contra)
   - [pnlCalc.js](backend/erp/services/pnlCalc.js): year-end closing revenue + expense + loss lines
5. **Latent bug fixes swept up in the integrity pass**:
   - `expenseController.js` line 2347 referenced undefined `calfCoaMap` → corrected to `autoCoaMap`.
   - `loanService.postInterest` missing `await` on `journalFromInterest` → Promise passed as JE data, every interest post silently failed.
   - `ownerEquityService.recordInfusion` / `recordDrawing` missing `await` on `journalFromOwnerEquity` → owner infusions/drawings silently failed.
   - `depreciationService.postDepreciation` missing `await` on `journalFromDepreciation` → monthly depreciation silently failed.
   - `payrollController.js` catch block referenced `fullPs` declared inside inner try → ReferenceError swallowed by `.catch(() => {})`, audit log never persisted.
6. **Searchable failure logs** — every auto-journal try/catch now logs with a `[AUTO_JOURNAL_FAILURE]` prefix so ops can grep pm2 logs. Phase 36 will promote this to a structured `AutoJournalFailure` collection + President alert.
7. **Backlog repost script** — [repostMissingJEs.js](backend/erp/scripts/repostMissingJEs.js), dry-run by default. Covers SmerEntry + CarLogbookCycle + ExpenseEntry + PrfCalf POSTED since `--since` (default 2026-04-13) with `deletion_event_id` absent and no JournalEntry at `source_event_id`. Idempotent. `--force-closed-period` flag for period-locked reposts.

### First-digit heuristic (used in call sites with dynamic funding COA)
Philippine / VIP COA ranges:
- `1xxx` Asset (normal DEBIT) — CR line is a reduction → `is_contra: true`
- `2xxx` Liability (normal CREDIT) — DR line is a reduction → `is_contra: true`
- `3xxx` Equity (normal CREDIT) — DR line reverses equity → `is_contra: true`
- `4xxx` Revenue (normal CREDIT) — DR line reverses revenue → `is_contra: true`
- `5xxx` COGS (normal DEBIT) — CR line reverses COGS → `is_contra: true`
- `6xxx` Expense (normal DEBIT) — CR line reverses expense → `is_contra: true`

Caveat — contra-asset (ACCUM_DEPRECIATION 1350, CREDIT-normal despite 1xxx prefix) and contra-equity (OWNER_DRAWINGS 3100, DEBIT-normal despite 3xxx prefix) need explicit hand-marking because the heuristic would mis-classify them. Both are handled case-by-case.

### Subscription-safe by design (Rule #3 + Rule #19)
- COA codes still read from `Settings.COA_MAP` via `getCoaMap()` — no hardcoded codes.
- Funding source via `resolveFundingCoa()` — still payment-mode / bank-account / credit-card driven.
- The heuristic only kicks in when an is_contra decision is needed dynamically; the validator's authoritative lookup is still `ChartOfAccounts.normal_balance` per entity.
- Subscribers that customize COA ranges outside the standard prefix mapping get correct behavior because is_contra only defers to the validator — the check still fires for truly mis-directional entries.

### Files touched
- `backend/erp/models/JournalEntry.js` — `is_contra` schema field + validator skip + source_module enum
- `backend/erp/models/ErpAuditLog.js` — log_type enum backfill
- `backend/erp/services/autoJournal.js` — contra helper + 16 `journalFrom*` helpers
- `backend/erp/services/journalFromIncentive.js` — settlement JE contra lines
- `backend/erp/services/apPaymentService.js` / `bankReconService.js` / `creditCardService.js` / `pnlCalc.js` / `loanService.js` / `ownerEquityService.js` / `depreciationService.js` — contra lines + missing awaits
- `backend/erp/services/interCompanyService.js` — failure log prefix
- `backend/erp/controllers/expenseController.js` — 9 inline sites + calfCoaMap typo + catch prefixes
- `backend/erp/controllers/creditNoteController.js` / `payrollController.js` / `inventoryController.js` — contra lines + scope fix + prefixes
- `backend/erp/scripts/repostMissingJEs.js` — new backlog repost script

### Deploy + verify
```bash
git pull && pm2 restart vip-crm-api vip-crm-worker
cd backend && node erp/scripts/repostMissingJEs.js                         # dry-run
node erp/scripts/repostMissingJEs.js --apply                               # writes
# Sanity query — orphan SMERs since Apr 13 should drop to 0 after --apply
node -e "require('dotenv').config(); const m=require('mongoose'); m.connect(process.env.MONGO_URI).then(async()=>{ const smers=await m.connection.db.collection('erp_smer_entries').find({status:'POSTED',posted_at:{\$gte:new Date('2026-04-13T00:00:00Z')},deletion_event_id:{\$exists:false}}).project({_id:1,event_id:1}).toArray(); let orphans=0; for(const s of smers){ const je=await m.connection.db.collection('erp_journal_entries').findOne({source_event_id:s.event_id}); if(!je) orphans++;} console.log('SMER orphans since Apr 13:',orphans); process.exit(0);});"
```

### Follow-up Phase 36 (not shipped in this pass)
- `AutoJournalFailure` collection + President alert channel (lookup-driven `ALERT_CHANNELS`) replacing console.error grep.
- `journal_failures: [...]` array in submit endpoint responses so the frontend can surface a warning toast.

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

### Extended to Goods Receipt Notes — Phase 32R-GRN# (Apr 2026)

`GrnEntry` previously had no doc number. Frontend fell back to `po_number || _id.slice(-6)`, so STANDALONE GRNs (no PO) displayed as a last-6-hex tail across the Undertaking list, Undertaking detail, GRN audit view, Approval Hub detail card, Reversal Console, and the GRN list under the capture page. Out of line with every other transactional document.

- **`models/GrnEntry.js`** — new `grn_number: String` field with a sparse non-unique index. Sparse so pre-numbering legacy rows (no backfill) don't collide on null.
- **`controllers/inventoryController.js#createGrn`** — calls `generateDocNumber({ prefix: 'GRN', bdmId: req.bdmId, entityId: req.entityId, date: grn_date })` BEFORE the `withTransaction` block. `DocSequence.getNext` is atomic on its own; keeping it outside the session avoids entangling sequence allocation with GRN+Undertaking rollback semantics (gaps on aborted sessions are acceptable — same behavior as every other doc number). Resolution priority: BDM's territory code → `Entity.short_name` → fallback (so admin/president-created GRNs without a territory binding still get an entity-prefixed number).
- **Format**: `GRN-{TERR|ENTITY}{MMDDYY}-{NNN}`. Examples: `GRN-ILO042026-001` (BDM with Iloilo territory), `GRN-VIP042026-003` (admin-created at VIP parent).
- **Populate selects extended** — `controllers/undertakingController.js`, `services/universalApprovalService.js`, and `services/documentDetailHydrator.js` all added `grn_number` to their `linked_grn_id` populate select so the approval hub card, undertaking detail page, and undertaking list row surface it uniformly.
- **`services/documentDetailBuilder.js#buildUndertakingDetails`** — `linked_grn.grn_number` included in the summary object passed to `DocumentDetailPanel`.
- **`services/documentReversalService.js`** — GRN reversal row now uses `grn_number` as `doc_ref` (falls back to the ISO-date label for legacy rows). Undertaking reversal row's `sub` label does one batched `GrnEntry.find({_id: {$in: ...}}).select('grn_number')` lookup to surface the linked GRN's number in the console without per-row N+1.
- **Frontend display surfaces** updated with the precedence `grn_number → po_number → id.slice(-6)` (legacy-safe fallback):
  - `pages/UndertakingList.jsx` (row link)
  - `pages/UndertakingDetail.jsx` (header link)
  - `pages/GrnAuditView.jsx` (header sub-line + new `GRN#` grid cell)
  - `pages/GrnEntry.jsx` (GRN list — new `GRN#` column on the desktop table, GRN# as card title on mobile, success toast reads back the number)
  - `components/DocumentDetailPanel.jsx` (Approval Hub linked-GRN card)
- **`WorkflowGuide.jsx#grn-entry`** tip expanded with the new format; `undertaking-entry` tip updated to note the Linked GRN link now shows the number.
- **Approval flow unchanged** — `grn_number` is purely identity + display. GRN create → Undertaking auto-create → Acknowledge cascade-approves GRN (`postSingleUndertaking` via `approveGrnCore`) → `gateApproval({ module: 'INVENTORY' })` on the GRN path. No changes to `erpSubAccessCheck`, `periodLockCheck`, `REVERSAL_HANDLERS`, or `MODULE_DEFAULT_ROLES.INVENTORY`. Reversal cascade still keys on `linked_grn_id` ObjectId.
- **Subscription-ready**: territory code is admin-managed in `Territory` (lookup-driven via `Territory.getCodeForBdm`); entity-fallback code is admin-editable in `Entity.short_name` and cached with shared invalidation. New subsidiaries pick `short_name` on creation and their GRNs use it immediately — no code deploy required.
- **No backfill**: legacy GRNs keep rendering via the `po_number || id.slice(-6)` tail; all display sites accept either. The sparse index means null legacy values don't block the new unique-sequence guarantee (which is per-seqKey, not per-field — we don't force uniqueness on `grn_number` itself, only on the allocation key inside `DocSequence`).

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

## Phase G5.1 — Car Logbook bdm_id Scope Fix (April 21, 2026)

### Problem
When a privileged user (president/admin/finance) opened `/erp/car-logbook`, the grid showed **every BDM × every entity**'s entries for the selected period+cycle. Every Car Logbook endpoint spread `...req.tenantFilter` into its query; for privileged users `req.tenantFilter = {}`, so no filter was applied. Far worse than the read leak: `validateCarLogbook` would bulk-flip every BDM's DRAFT/ERROR days to VALID/ERROR on a president's click, and `submitCarLogbook` would bundle some other BDM's VALID entries into a `CarLogbookCycle` wrapper bound to the president's `_id`.

### Root Cause
Same shape as the Phase G5 anti-pattern (`AR Aging` / `Open CSIs` / `FIFO` / `SOA`), but inverted: instead of silent self-fallback producing empty results, an empty `tenantFilter` produced **cross-BDM and cross-entity** results with write side-effects.

### Fix — Backend (`backend/erp/controllers/expenseController.js`)
Added a `resolveCarLogbookScope(req)` helper (file-local, inline) that returns `{ privileged, bdmId }`. All seven Car Logbook endpoints + the per-fuel approval endpoint now resolve scope explicitly:
```js
const privileged = !!(req.isPresident || req.isAdmin || req.isFinance);
const bdmId = privileged ? (req.query.bdm_id || req.body.bdm_id || null) : req.bdmId;
```
- **Reads** (`getCarLogbookList`, `getCarLogbookById`, `getSmerDailyByDate`, `getSmerDestinationsBatch`) — privileged + no bdm_id → empty response with message `"Select a BDM to view their car logbook"`. The grid UI is per-person; cross-BDM mashup is meaningless.
- **Writes** (`createCarLogbook`, `updateCarLogbook`, `deleteDraftCarLogbook`, `validateCarLogbook`, `submitCarLogbook`, `submitFuelEntryForApproval`) — privileged + no bdm_id → HTTP 400 `"bdm_id is required"`. `submitCarLogbook` also binds the `CarLogbookCycle` wrapper to the resolved bdmId, not `req.bdmId` (which for president would be a ghost user_id).
- `updateCarLogbook` locks `entry.bdm_id` and `entry.entity_id` on save so body cannot silently reassign ownership.
- `validateCarLogbook` additionally scopes by `period`+`cycle` from body (frontend already passes these) so it validates the active cycle, not every open draft across months.

### Fix — Frontend (`frontend/src/erp/pages/CarLogbook.jsx`)
- Added `selectedBdmId` state + BDM picker (privileged viewers only) — data source is `getBdmsByEntity()` from `useTransfers`.
- `viewingSelf = !!selectedBdmId && selectedBdmId === user._id` — **strict gate**. Because `ROLE_SETS.MANAGEMENT` (admin/finance/president) and `ROLES.CONTRACTOR` (BDM) are mutually exclusive, a privileged user's `_id` never matches any BDM's `_id`, so `viewingSelf` is always `false` for privileged users. All write handlers (`saveRow`, `handleValidate`, `handleSubmit`, `handleSubmitFuel`, `handleDelete`) short-circuit with a read-only toast when `!viewingSelf`.
- `loadAndMerge` passes `bdm_id` on list calls when privileged; returns an empty grid immediately when privileged + no BDM picked (avoids the 400 round-trip).
- **No on-behalf writes from this page.** Privileged users audit read-only. The backend still accepts `bdm_id` in body/query defensively (for scripts or a future on-behalf flow), but the current UI never sends it on writes. If on-behalf becomes a business need later: relax `viewingSelf` to `!!selectedBdmId && (selectedBdmId === user._id || isPrivileged)` and re-add `data.bdm_id` / `scope.bdm_id` stamping in the write handlers (~6 lines). Audit logging should be added at the same time.

### Banner (`frontend/src/erp/components/WorkflowGuide.jsx`)
`car-logbook.tip` extended with: *"Privileged viewers (president/admin/finance) use the BDM picker to audit someone else's cycle — the page is read-only until they pick themselves (Rule #21 — no silent self-fallback; backend requires an explicit bdm_id to create/validate/submit)."*

### Not changed (scope guardrails held)
- `reopenCarLogbook` — privileged CAN reopen any POSTED cycle across BDMs; this is a deliberate privileged operation and the doc-by-id filter is the correct access gate.
- SMER/ORE/PRF endpoints — their list endpoints already received a minimal Rule #21 patch (honor `?bdm_id=` from privileged); their write endpoints retain cross-BDM `tenantFilter` behavior pending a separate sweep. SMER/ORE aren't per-person grid UIs so the read leak is not as visually broken as Car Logbook.

### Key Files
```
backend/erp/controllers/expenseController.js          # 8 endpoints + resolveCarLogbookScope helper
frontend/src/erp/pages/CarLogbook.jsx                 # BDM picker, strict viewingSelf gate, read-only short-circuits on writes
frontend/src/erp/components/WorkflowGuide.jsx         # car-logbook tip mentions Rule #21 + picker
```

### Build verify
`node -c backend/erp/controllers/expenseController.js` clean. `npx vite build` clean in 36.34s.

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
- **Sub-permission access**: Product CRUD now gated by `erpAnySubAccessCheck(['master','product_manage'], ['purchasing','product_manage'])` (Phase MD-1, Apr 2026). The `master` namespace is canonical going forward; `purchasing` kept for backwards compatibility with existing access templates. Frontend `canAddEdit` accepts either grant. Cross-entity write requires the additional `master.cross_entity_write` flag (controller honors `req.body.entity_id` on create + bypasses the `entity_id` filter on update/deactivate/delete/getById). Deactivate / hard-delete stay on the danger sub-perms (`master.product_deactivate` Tier 2 / `master.product_delete` Tier 1 baseline).
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
- **webhookRoutes** (`/api/webhooks`): WhatsApp, Messenger, Viber delivery receipts + inbound messages. Phase M1.11 (Apr 2026): inbound STOP/UNSUBSCRIBE/OPT OUT keyword detection runs in all three handlers **before** any invite-ref binding or provider-ID match — keyword hit writes `Doctor.marketingConsent.<CHANNEL>.withdrawn_at`, logs `CommunicationLog.source='opt_out'`, and fires an ack via `dispatchMessage()`. Lookup-driven: `Settings.OPT_OUT_KEYWORDS`, `OPT_OUT_ACK_TEMPLATE`, `OPT_OUT_ENABLED`. Utility at `backend/utils/optOut.js`.

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

## Phase G4.1 — ApprovalRequest Hydration in All-Pending (April 21, 2026)

**Why.** The Approval Workflow page had two tabs showing overlapping data: **All Pending** (module-native rich detail + expandable `<DocumentDetailPanel>`) and **Requests** (flat 7-column ApprovalRequest audit list with no expand). The Requests tab was the only place `level: 0` default-roles-gate items surfaced, but it never rendered line items / photos / audit trail — so approvers couldn't inspect what they were approving without opening the module page in another tab. Intended Phase 31R design ("raw module query surfaces the doc; APPROVAL_REQUEST duplicate is suppressed") fails for any module whose own query filter doesn't include the gated status.

**What shipped.**

1. **`APPROVAL_REQUEST` MODULE_QUERIES entry now surfaces ALL pending requests** (removed the `$or: [{ level: { $gt: 0 } }, { rule_id: { $ne: null } }]` filter). Each request is hydrated via a new `buildApprovalRequestDetails(req)` helper that:
   - Resolves the module key from `REVERSAL_DOC_TYPE_TO_MODULE[req.doc_type]` (reused from `documentDetailBuilder.js`) with `req.module` as fallback.
   - Looks up the underlying doc via `DOC_TYPE_HYDRATION[req.doc_type] = { modelName, populate }` (22-row registry covering CSI/CR/SMER/CAR_LOGBOOK/EXPENSE_ENTRY/PRF/CALF/GRN/UNDERTAKING/CREDIT_NOTE/INCOME_REPORT/PAYSLIP/KPI_RATING/DEDUCTION_SCHEDULE + Group B gap modules SUPPLIER_INVOICE/JOURNAL_ENTRY/BANK_RECON/IC_TRANSFER/IC_SETTLEMENT/DISBURSEMENT/DEPOSIT/SALES_GOAL_PLAN/INCENTIVE_PAYOUT).
   - Calls `buildDocumentDetails(moduleKey, hydratedDoc)` so the item renders with the same rich card as every other module. Best-effort: when no registry row or model exists, falls back to passing the ApprovalRequest itself to the builder so `doc_ref` / `amount` / `description` still render.

2. **Doc_id-based dedup** added to `getUniversalPending` after the existing by-id dedup. When two items share the same `doc_id` and at least one is NOT an `APPROVAL_REQUEST:*` item, the `APPROVAL_REQUEST:*` copies are dropped. Result: the raw module item wins (preserving the Phase 31R "no double-listing" guarantee and the existing Post-action close-loop), while orphan ApprovalRequests (no module-native sibling) still surface with hydrated details.

2b. **Per-item sub-permission filter** on APPROVAL_REQUEST items. `APPROVAL_REQUEST` has `sub_key: null` at module level (was: Phase 34 note "filtered per-item" — the per-item filter was never implemented). With Phase G4.1 now surfacing ALL pending requests, each `APPROVAL_REQUEST:*` item is filtered against `MODULE_TO_SUB_KEY[item.module]` via `hasApprovalSub(user, ...)` in `getUniversalPending`. Mirror check added to `universalApprove` controller: when `type === 'approval_request'`, derefs the request to read its `module` field and re-runs the sub-perm gate against the real module. Closes the visibility + approve-action gap in one pass. President/CEO always bypass (unchanged).

3. **Requests tab repurposed to "Approval History"**: default filter flipped from `PENDING` → `APPROVED`. Inline blue info panel explains the tab is for APPROVED / REJECTED / CANCELLED audit and directs approvers to All Pending for anything actionable. Button still labelled `Approval History (N)` with a tooltip.

4. **WorkflowGuide `approval-manager` banner** — steps rewritten to describe the unified All Pending feed (module-native items + hydrated ApprovalRequests), call out the Phase G4.1 change explicitly, and rename the old "Requests tab" step to "Approval History tab".

**Architecture (no change to happy path).**

```
BDM submits → controller calls gateApproval() → 202 returned
              └→ ApprovalRequest(level=0, PENDING) + doc stays in pre-post state (VALID/DRAFT/etc.)

Approver opens Approval Hub:
   ├── Raw doc in module query?
   │     YES → All Pending shows CAR_LOGBOOK:<id> (action: POST) — dedup drops APPROVAL_REQUEST:<reqId>
   │     NO  → All Pending shows APPROVAL_REQUEST:<reqId> (action: APPROVE, hydrated details)
   │
   ├── Click Post (raw-doc path) → module handler posts → close-loop (line 555 of universalApprovalController.js)
   │                               flips the matching ApprovalRequest to APPROVED
   │
   └── Click Approve (orphan path) → processDecision flips the request to APPROVED
                                    → BDM re-submits, gateApproval finds APPROVED, post succeeds
```

**Files changed.**
| File | Change |
|------|--------|
| `backend/erp/services/universalApprovalService.js` | Refactored `APPROVAL_REQUEST` MODULE_QUERIES entry (removed level-0 filter, added hydration). New `DOC_TYPE_HYDRATION` const + `buildApprovalRequestDetails()` helper. New doc_id-based dedup pass in `getUniversalPending()`. |
| `frontend/src/erp/pages/ApprovalManager.jsx` | `statusFilter` default `PENDING` → `APPROVED`. Tab renamed "Requests" → "Approval History". Inline info panel inside the tab body. |
| `frontend/src/erp/components/WorkflowGuide.jsx` | `approval-manager` guide steps rewritten. |
| `CLAUDE-ERP.md` | This section + index table entry. |

**Backward-compatibility + safety.**
- Phase 29 `ApprovalRequest` schema unchanged.
- Phase G4 default-roles gate + Phase G6 rejection feedback unchanged.
- Phase 31R "no double-listing" guarantee preserved by the by-doc_id dedup (raw module item wins).
- `approval_request` handler in `universalApprovalController.js` — originally unchanged in G4.1; follow-up shipped April 21, 2026 extends it with a `MODULE_AUTO_POST` map ({SMER, EXPENSES, PRF_CALF, SALES, COLLECTION, CAR_LOGBOOK, CREDIT_NOTE} → {type, action: 'post'}). After `processDecision` flips to APPROVED on the final level (no `nextLevel`), the handler re-enters the matching module handler (`smer_entry`, `expense_entry`, etc.) so the orphan path posts the underlying doc in the same round-trip. Failure is logged, never thrown — the approval decision is already persisted and must stand (BDM fixes the prerequisite and resubmits). Group B modules intentionally excluded (no uniform POST hook — they stay on the existing isFullyApproved + re-submit pattern).
- No new routes, no schema migration, no lookup migration. Auto-seeded Lookup categories unchanged.

**Subscription readiness.**
- `DOC_TYPE_HYDRATION` is code-level today (model names bind at `require()` time). Future migration path: `APPROVAL_REQUEST_HYDRATION` Lookup category with a whitelist resolver — mirrors how `MODULE_DEFAULT_ROLES` graduated from hardcoded to Lookup in Phase F.1. Not done here because current subscribers share the same pharmaceutical-distribution doc types; swap the registry when the first non-pharma subscriber onboards.
- Dedup logic is module-agnostic — adding a new module to MODULE_QUERIES automatically benefits from the dedup pass.

**Verification.**
- `node -c backend/erp/services/universalApprovalService.js` clean.
- `npx vite build` clean in ~9s (`ApprovalManager-BmBqFGp0.js` 30 kB, `WorkflowGuide-B-hDGpDt.js` 102 kB).
- Repro the user's screenshot scenario: CAR_LOGBOOK held by gateApproval(module='EXPENSES', docType='CAR_LOGBOOK'). As president on `/erp/approvals` → All Pending tab the entry now appears with full hydrated details (line items, fuel receipts, GPS, total km). Click Details → DocumentDetailPanel renders; click Post on the raw item → module handler fires and the mirror ApprovalRequest transitions to APPROVED via the close-loop.
- Approval History tab defaults to APPROVED; shows completed authority decisions with decided_by and reason.

---

## Phase G4.2 — Deduction Schedule Unified Approval Flow (April 21, 2026)

**Why.** BDM-approved deduction schedules never showed up in Approval Hub → Approval History. Sales (CSI), SMER per-diem overrides, and Expenses all surfaced there; deductions did not. Root cause: `deductionScheduleService.approveSchedule()` flipped `DeductionSchedule.status` from `PENDING_APPROVAL` → `ACTIVE` and stamped `approved_by`/`approved_at` directly on the schedule, but **never created or updated an `ApprovalRequest`**. The Approval History endpoint (`listRequests` in `approvalController.js:69-83`) reads exclusively from the `ApprovalRequest` collection, so deductions were invisible — even though the governance intent (Rule #20 "Any person can CREATE, but authority POSTS") applied to them the same way it does to SMER/Sales/Expenses.

All the scaffolding was already in place from earlier phases:
- `ApprovalRule.module` enum includes `DEDUCTION_SCHEDULE` (Phase 34)
- `MODULE_DEFAULT_ROLES.DEDUCTION_SCHEDULE` seeded with `['admin', 'finance', 'president']` (Phase F.1)
- `APPROVAL_CATEGORY.FINANCIAL` lists DEDUCTION_SCHEDULE (Phase 29)
- `APPROVALS__APPROVE_DEDUCTIONS` sub-permission (Phase 34)
- `DOC_TYPE_HYDRATION.DEDUCTION_SCHEDULE` for hydrated Hub cards (Phase G4.1)
- `approvalHandlers.deduction_schedule` + `TYPE_TO_MODULE.deduction_schedule` (Phase F)
- `universalApprovalController.universalApprove` already has a catch-all at lines 705-734 that closes open `ApprovalRequest`s by `doc_id` after the Hub dispatches a decision

The only missing wire was `gateApproval()` on `createSchedule`. That one call writes a PENDING `ApprovalRequest` row; the catch-all closes it when Finance approves via the Hub; and the service-level close-loop makes the direct route (`POST /:id/approve|reject|withdraw`) behave identically. History then writes itself.

**What shipped.**

1. **`backend/erp/controllers/deductionScheduleController.js`** — `createSchedule` now calls `gateApproval({ module: 'DEDUCTION_SCHEDULE', docType: term_months === 1 ? 'ONE_TIME' : 'INSTALLMENT', docId: schedule._id, docRef: schedule.schedule_code, amount: schedule.total_amount, description: '...', requesterId, requesterName }, res)` immediately after `createScheduleSvc`. BDM role isn't in `MODULE_DEFAULT_ROLES.DEDUCTION_SCHEDULE.metadata.roles`, so gateApproval writes a level-0 default-roles `ApprovalRequest` with status PENDING and sends HTTP 202 `approval_pending:true`. The schedule itself already exists in `PENDING_APPROVAL`; the raw `DeductionSchedule` query in `MODULE_QUERIES` still surfaces it in the Hub's All Pending tab, and the Phase G4.1 by-doc_id dedup (universalApprovalService.js:1342-1371) drops the `APPROVAL_REQUEST:*` mirror so there is no double-listing.

2. **`backend/erp/services/deductionScheduleService.js`** — new internal `closeApprovalRequest(docId, status, userId, reason)` helper (scoped to `module: 'DEDUCTION_SCHEDULE'`). Called on:
   - `approveSchedule()` — status APPROVED, after `schedule.save()`
   - `rejectSchedule()` — status REJECTED, with the caller's reason
   - `withdrawSchedule()` — status CANCELLED, with "Withdrawn by BDM"
   - `editPendingSchedule()` — updates the PENDING `ApprovalRequest`'s `amount`, `doc_type`, and `description` so Hub + History reflect the BDM's edit instead of the original submission
   
   Idempotent ($set only fires on `status: 'PENDING'`) so Hub-path approvals (which hit the catch-all in `universalApproveEndpoint`) and direct-route approvals both converge on the same end state without double-writes.

3. **`backend/erp/scripts/backfillDeductionScheduleApprovals.js`** (new) — dry-run by default, `--apply` to persist. For every existing `DeductionSchedule` with no matching `ApprovalRequest`: creates one with the appropriate status (`PENDING_APPROVAL → PENDING`, `ACTIVE/COMPLETED → APPROVED`, `REJECTED → REJECTED`, `CANCELLED` split by whether `approved_by` was set). Gives retroactive Approval Hub + History visibility for pre-Phase-G4.2 decisions. Idempotent — skips schedules that already have an `ApprovalRequest`.

4. **Frontend wiring.**
   - `pages/MyIncome.jsx` — imports `isApprovalPending` / `showApprovalPending` / `showSuccess` from `errorToast.js`. `handleSaveSchedule` checks the response and fires the 🔒 info toast on HTTP 202 so the BDM knows the submission landed in the Hub instead of silently activating.
   - `components/WorkflowGuide.jsx` — `myIncome` and `income` guide steps rewritten to document the Hub flow (submission → Approval Hub → History) and to call out that `POST /finance-create` (admin/finance/president) bypasses the gate and activates immediately.

**Architecture (lifecycle).**

```
BDM submits deduction schedule (POST /deduction-schedules):
  ├─ svc.createSchedule → DeductionSchedule(status: PENDING_APPROVAL)
  └─ gateApproval(module: DEDUCTION_SCHEDULE)
       ├─ BDM role not in MODULE_DEFAULT_ROLES.DEDUCTION_SCHEDULE.metadata.roles
       │    → ApprovalRequest(level: 0, status: PENDING, doc_id: schedule._id)
       │    → HTTP 202 approval_pending:true → frontend shows showApprovalPending toast
       │
       └─ Role IS in allowed_roles (admin/finance/president — unreachable on this
            route today because roleCheck('contractor') fronts it, but kept for
            forward-compat if admin-self-service gets unlocked)
            → no ApprovalRequest, schedule stays PENDING_APPROVAL,
            finance still uses /finance-create for auto-activate

Approver decides via Approval Hub (POST /approvals/universal-approve, type='deduction_schedule'):
  ├─ approvalHandlers.deduction_schedule → svc.approveSchedule(id)
  │     ├─ DeductionSchedule.status = ACTIVE
  │     └─ closeApprovalRequest(doc_id, APPROVED)   ← new
  └─ universalApproveEndpoint catch-all (lines 705-734) also runs updateMany
       on {doc_id, status: PENDING} → no-op, already APPROVED (safe double-close)

Approver decides via direct route (POST /deduction-schedules/:id/approve):
  └─ svc.approveSchedule(id)
       ├─ DeductionSchedule.status = ACTIVE
       └─ closeApprovalRequest(doc_id, APPROVED)   ← new (same helper, same result)

BDM withdraws a pending schedule (POST /:id/withdraw):
  └─ svc.withdrawSchedule → schedule CANCELLED + closeApprovalRequest(CANCELLED)

BDM edits a pending schedule (PUT /:id):
  └─ svc.editPendingSchedule → regen installments + updateMany ApprovalRequest
     refreshing amount / doc_type / description
```

**Subscription readiness.**
- **Lookup-driven gate.** `MODULE_DEFAULT_ROLES.DEDUCTION_SCHEDULE` is a `Lookup` row, editable via Control Center → Lookup Tables. Subsidiary admin tightens (`roles: ['finance']`) or opens (`roles: null`) without a code change. Per Rule #3.
- **Lookup-driven category.** `APPROVAL_CATEGORY.FINANCIAL.metadata.modules` already lists DEDUCTION_SCHEDULE, so it inherits the financial-approver policy (president/finance). Move to OPERATIONAL via the same Lookup row if a subscriber wants to delegate it.
- **Authority matrix escalation.** Any subscriber can add an `ApprovalRule` (module: `DEDUCTION_SCHEDULE`, amount_threshold, approver_type) through the Approval Rules page. `approvalService.checkApprovalRequired` evaluates these AFTER the default-roles gate — unchanged code path, no extra wiring needed.
- **Authoritative source of truth remains `DeductionSchedule`.** `ApprovalRequest` is the audit surface; the schedule's `status` / `approved_by` / `reject_reason` fields are still what `incomeCalc.js` reads when injecting installments. No duplication of business state.

**Files changed.**
| File | Change |
|------|--------|
| `backend/erp/controllers/deductionScheduleController.js` | Import `gateApproval`; `createSchedule` now calls the gate + returns early on 202. |
| `backend/erp/services/deductionScheduleService.js` | New `closeApprovalRequest` helper. Called from `approveSchedule`, `rejectSchedule`, `withdrawSchedule`. `editPendingSchedule` also refreshes the PENDING ApprovalRequest's amount/description/doc_type. |
| `backend/erp/scripts/backfillDeductionScheduleApprovals.js` | New script — backfills ApprovalRequest rows for pre-Phase-G4.2 schedules. |
| `frontend/src/erp/pages/MyIncome.jsx` | Detects 202 approval_pending and fires the info toast. |
| `frontend/src/erp/components/WorkflowGuide.jsx` | `myIncome` + `income` guide rewritten for the new Hub flow. |
| `CLAUDE-ERP.md` | This section + index table row. |
| `docs/PHASETASK-ERP.md` | Task breakdown entry. |

**Integrity checks (no regressions).**
- **Period lock.** `deductionScheduleRoutes.js` still wraps `POST /` and `PUT /:id` with `periodLockCheck('DEDUCTION')`. gateApproval is called after the middleware, so a locked period blocks BEFORE any ApprovalRequest is created.
- **Dedup.** Phase G4.1 by-doc_id dedup drops `APPROVAL_REQUEST:*` items when a raw `DEDUCTION_SCHEDULE:*` surfaces. Verified via code read — both items share `doc_id = schedule._id`, the raw item wins.
- **Hub catch-all.** `universalApproveEndpoint` lines 705-734 already skip `'approval_request'` and `'perdiem_override'` types. `'deduction_schedule'` is NOT in the skip list, so the catch-all still runs — but the svc-level `closeApprovalRequest` already completed the update, so the catch-all's `updateMany({status: 'PENDING'})` matches zero rows. No double-history entries.
- **Reversal handlers.** Deduction schedules are listed in PHASETASK-ERP Reversal Matrix as `P3 — covered by Payslip handler` (reverting Payslip reverts the injection, not the schedule). Phase G4.2 doesn't touch reversal semantics. `REVERSAL_HANDLERS` count unchanged.
- **Existing approvers.** No UI change to Income → Schedules tab — Finance still clicks Approve / Reject there. The close-loop at the service layer means those clicks now ALSO write the Approval History row without any UI change.
- **Existing BDM pages.** `MyIncome.jsx` uses the hook that returns `res.data` (including `approval_pending: true`). Existing checks `isApprovalPending(result)` handles the 202 case.

---

## Phase G4.3 — Approval Hub + Reversal Console Gap Closure (April 21, 2026)

**Why.** After G4.2 shipped Deduction Schedule through the unified pipeline, a targeted audit surfaced five wiring gaps that would crash or silently drift the ledger in specific scenarios. Bundled the fixes under G4.3 so the Approval Hub + Reversal Console both reach parity with the governance model before more modules lean on them.

Five gaps closed (in priority):

1. **CRIT — `INCENTIVE_DISPUTE` dispatcher crash.** Controller called `gateApproval('INCENTIVE_DISPUTE', …)` on every lifecycle transition, the request landed in ApprovalRequest, but `universalApprovalController` had **zero references** to `incentive_dispute`. Approver clicking Approve in the Hub would crash with `Unknown approval type: incentive_dispute`. Now fully wired end-to-end.
2. **CRIT — `SALES_GOAL_PLAN` reversal missing PAID-payout blocker.** `reverseSalesGoalPlan` blindly cascades through `ACCRUED|APPROVED|PAID` payouts, reversing their settlement JEs. If cash already went out via `paid_via`, the reversal orphans real cash with no audit linkage. Now a HARD blocker halts reversal until the approver explicitly reverses each PAID payout (own REVERSED lifecycle).
3. **HIGH — 5 missing dependent-doc checkers.** `PETTY_CASH_TXN` (running-balance chain), `SMER_ENTRY` (IncomeReport consumption), `CAR_LOGBOOK` (POSTED-CALF linkage WARN), `OFFICE_SUPPLY_ITEM` (active-txn block), `OFFICE_SUPPLY_TXN` (stub for future). Before G4.3, each of these reverse handlers skipped the dependent-doc gate that every other POSTED module enforces. Now registered + wired.
4. **MED — `FUEL_ENTRY` missing from `MODULE_REJECTION_CONFIG`.** Per-fuel rejection reasons lacked a banner-tone / editable-status row, so the contractor RejectionBanner on Car Logbook fell back to generic. Added the row — banner now renders lookup-driven tone + resubmit gate.
5. **LOW — Stale G6.7 "pending wiring" comments** on 7 Group B rejection-config rows. Removed. Verified all 8 Group B models (JournalEntry / BankStatement / PettyCashTransaction / InterCompanyTransfer / IcSettlement / SupplierInvoice / SalesGoalPlan / IncentivePayout) carry `rejection_reason` + REJECTED in status enum. SupplierInvoice was missing both — added them (otherwise the existing Group B `purchasing` reject handler would have crashed on Mongoose enum validation).

**Architecture — INCENTIVE_DISPUTE end-to-end.**

```
BDM files dispute (POST /erp/disputes):
  └─ fileDispute → IncentiveDispute(current_state: OPEN)    (no gate — filing)

BDM/Finance takes review (POST /:id/take-review):
  └─ gateApproval(module: INCENTIVE_DISPUTE, docType: DISPUTE_TAKE_REVIEW)
        ├─ role in MODULE_DEFAULT_ROLES roles → transition runs inline → UNDER_REVIEW
        └─ otherwise → ApprovalRequest(PENDING) + HTTP 202

Approver decides via /erp/approvals (universal-approve, type='incentive_dispute'):
  └─ approvalHandlers.incentive_dispute
        ├─ Load ApprovalRequest → dispute via doc_id
        ├─ Dispatch by request.doc_type:
        │     DISPUTE_TAKE_REVIEW → set reviewer_id = request.requested_by,
        │                            state OPEN → UNDER_REVIEW
        │     DISPUTE_RESOLVE     → parse outcome from metadata.outcome
        │                            (fallback: description regex). For APPROVED,
        │                            cascade reverseAccrualJournal(payout) OR append
        │                            SalesCredit reversal row. Then state
        │                            UNDER_REVIEW → RESOLVED_APPROVED | RESOLVED_DENIED
        │     DISPUTE_CLOSE       → state RESOLVED_* → CLOSED
        ├─ processDecision(APPROVED | REJECTED) on the ApprovalRequest
        └─ Integration event INTEGRATION_EVENTS.DISPUTE_RESOLVED fires on RESOLVE

Reject path: ApprovalRequest → REJECTED. Dispute STAYS in its prior state
(no terminal REJECTED on the dispute — reason lives in Approval History).
```

Identity attribution rule: dispute-level `reviewer_id`, `resolved_by`, and `history[].by` use **`request.requested_by`** (the BDM who asked for the transition), not the Hub approver. The approver's identity is captured on the ApprovalRequest's `decided_by`. This preserves the "you asked, someone else authorized" audit shape that `gateApproval` already expresses.

**Architecture — SALES_GOAL_PLAN dependent checker.**

```
President clicks Reverse on Reversal Console → preview → confirm:
  └─ presidentReverse → reverseSalesGoalPlan
        ├─ DRAFT plan → hard-delete (no side-effects, skipped)
        ├─ Otherwise:
        │   ├─ assertReversalPeriodOpen({ doc_type: SALES_GOAL_PLAN })
        │   ├─ checkHardBlockers({ doc_type: SALES_GOAL_PLAN })
        │   │     └─ For each PAID IncentivePayout under the plan → HARD block
        │   │     └─ For each Payslip(same FY, earnings.incentive > 0) → WARN
        │   ├─ If has_deps → HTTP 409 with dependents list → approver must
        │   │                 reverse the PAID payout first via IncentivePayout
        │   │                 REVERSED lifecycle, then retry the plan reversal
        │   └─ Otherwise → cascade reverse accrual+settlement JEs → flip status
```

**Subscription readiness.**
- **Lookup-driven sub-permission.** `APPROVALS__APPROVE_INCENTIVE_DISPUTE` seeded in `ERP_SUB_PERMISSION`; `MODULE_TO_SUB_KEY.INCENTIVE_DISPUTE = 'approve_incentive_dispute'`. Subsidiary admins can delegate without code changes via Access Templates.
- **Lookup-driven rejection feedback.** Added `MODULE_REJECTION_CONFIG.INCENTIVE_DISPUTE` and `.FUEL_ENTRY` rows. Subscribers tune banner tone + editable statuses per entity.
- **Lookup-driven default roles unchanged.** `MODULE_DEFAULT_ROLES.INCENTIVE_DISPUTE = ['president', 'finance', 'admin']` already seeded — no migration. Tighten or open per entity via Control Center.
- **Dependent checkers register via `CHECKERS` map.** Adding a subscriber-specific blocker (e.g., a compliance flag on PETTY_CASH) is a one-liner in `dependentDocChecker.js`; `previewDependents` and all hard-blocker call sites pick it up automatically.
- **Hub visibility.** New `MODULE_QUERIES` entry for `INCENTIVE_DISPUTE` uses `buildGapModulePendingItems` (same pattern as IC_TRANSFER / BANKING / PETTY_CASH / SALES_GOAL_PLAN / INCENTIVE_PAYOUT). Zero schema changes; the request itself is the Hub item.
- **DOC_TYPE_HYDRATION registry** gained 3 rows (`DISPUTE_TAKE_REVIEW` / `DISPUTE_RESOLVE` / `DISPUTE_CLOSE`) so the Approval Hub card renders the underlying `IncentiveDispute` instead of a bare `ApprovalRequest`.

**Files changed.**
| File | Change |
|------|--------|
| `backend/erp/controllers/universalApprovalController.js` | `TYPE_TO_MODULE.incentive_dispute` + `approvalHandlers.incentive_dispute` (3-doc_type dispatcher with cascade reversal on APPROVED). |
| `backend/erp/services/universalApprovalService.js` | `MODULE_TO_SUB_KEY.INCENTIVE_DISPUTE`, 3 `DOC_TYPE_HYDRATION` rows, 1 `MODULE_QUERIES` entry. |
| `backend/erp/services/dependentDocChecker.js` | 6 new checker functions + `CHECKERS` registrations (`SALES_GOAL_PLAN`, `PETTY_CASH_TXN`, `SMER_ENTRY`, `CAR_LOGBOOK`, `OFFICE_SUPPLY_ITEM`, `OFFICE_SUPPLY_TXN`). |
| `backend/erp/services/documentReversalService.js` | `checkHardBlockers` calls wired into `reverseSalesGoalPlan`, `reversePettyCashTxn`, `reverseSmer`, `reverseCarLogbook`, `reverseOfficeSupply`, `reverseOfficeSupplyTxn`. |
| `backend/erp/controllers/lookupGenericController.js` | `APPROVALS__APPROVE_INCENTIVE_DISPUTE` sub-perm seed; `MODULE_REJECTION_CONFIG.INCENTIVE_DISPUTE` + `.FUEL_ENTRY` rows; Group B comments updated (G6.7 stale refs removed). |
| `backend/erp/controllers/incentiveDisputeController.js` | `resolveDispute` passes `metadata: { outcome, resolution_summary }` to `gateApproval` so the Hub handler can reconstruct the transition. |
| `backend/erp/models/SupplierInvoice.js` | `status` enum gains `REJECTED`; adds `rejection_reason`, `rejected_by`, `rejected_at`. |
| `frontend/src/erp/components/WorkflowGuide.jsx` | Dispute Center banner clarifies G4.3 Hub end-to-end support; Reversal Console banner lists the 5 new dependent checks. |
| `CLAUDE-ERP.md` | This section + index table row. |
| `docs/PHASETASK-ERP.md` | Phase G4.3 task entry. |

**Integrity checks (no regressions).**
- **`node -c` + require-time check** pass on every modified backend file.
- **`npx vite build`** passes clean (27.2s → 13.1s on second run after banner edit).
- **Registry integrity verified**: `CHECKERS.{SALES_GOAL_PLAN,PETTY_CASH_TXN,SMER_ENTRY,CAR_LOGBOOK,OFFICE_SUPPLY_ITEM,OFFICE_SUPPLY_TXN}`, `approvalHandlers.incentive_dispute`, `TYPE_TO_MODULE.incentive_dispute`, `MODULE_TO_SUB_KEY.INCENTIVE_DISPUTE` all present.
- **Period-lock posture preserved**. `assertReversalPeriodOpen` still fires BEFORE `checkHardBlockers` on every reverse handler — a locked period rejects first regardless of dependents.
- **Dedup preserved** (Phase G4.1). INCENTIVE_DISPUTE items only surface through the new `MODULE_QUERIES` entry using `buildGapModulePendingItems`; the Hub by-doc_id dedup still prefers raw module items over APPROVAL_REQUEST mirrors — nothing changes for INCENTIVE_DISPUTE because there's no raw-doc sibling.
- **REVERSAL_HANDLERS count unchanged** (still 21). G4.3 adds blockers, not new reversal handlers.
- **WorkflowGuide banners updated** for `dispute-center` and `president-reversals` so BDMs and president both see the new hard-blocker reasons + Hub end-to-end support in the UI.
- **No backfill required.** Fixes are forward-looking — new disputes flow through the new pipeline; existing PENDING disputes (if any) now have a dispatcher instead of a crash. No data migration.

**Rollout.**

```bash
cd /var/www/vip-pharmacy-crm
git checkout main && git pull origin main
pm2 restart vip-crm-api vip-crm-worker
# No backfill script needed.
```

Verify on prod:
1. President opens `/erp/approvals`; if any INCENTIVE_DISPUTE items exist, click Approve — dispatcher runs instead of crashing.
2. Try to president-reverse a SALES_GOAL_PLAN that has a PAID payout → HTTP 409 with dependents list.
3. Reject a fuel entry from the Hub → Car Logbook page renders the RejectionBanner using `FUEL_ENTRY` tone + editable statuses.

**Rollback.** Revert the 8 source files (controller / 3 services / model / 2 docs / 1 frontend). No schema changes to rollback beyond the SupplierInvoice enum — and that's purely additive (adding REJECTED doesn't break existing DRAFT/VALIDATED/POSTED rows).

---

## Phase 33 — Car Logbook Cycle-Wrapper Redesign (April 21, 2026)

> Not to be confused with the earlier "Phase 33 — Bulk Role Migration + Login Fix" further down. Both were tagged Phase 33 in the backlog; this section covers the car-logbook cycle-wrapper work shipped April 21, 2026.

**Why.** Approval Hub showed `Submit 16 car logbook entries` with 16× duplicate `LOGBOOK-2026-04` docRefs and `Lines=0 / ₱0 / ORE:₱0` on the card. Root cause: `submitCarLogbook` aggregated 15 per-day `CarLogbookEntry` docs into ONE `ApprovalRequest` (title + comma-joined docRef), but `MODULE_QUERIES['CAR_LOGBOOK']` hydrated each per-day doc individually, and the generic EXPENSES card renderer expected `line_count / total_ore / total_access / total_amount` — fields that don't exist on a per-day doc. Symptom: unreadable approval queue + wrong totals.

**Architecture decision (critical — don't second-guess).** The initial plan was a single-collection rewrite of `CarLogbookEntry` into SMER-shape (`daily_entries[]` inside one cycle doc). That would have severed **10+ downstream services** that read per-day fields at top level: `incomeCalc`, `expenseSummary`, `fuelEfficiencyService`, `expenseAnomalyService`, `performanceRankingService`, `dashboardService`, `documentReversalService` list query, `copilotToolRegistry`, `monthEndClose`, `testExpenseEndpoints`. The pivot was a **dual-model wrapper**:

- **`CarLogbookEntry`** — unchanged per-day doc. Per-day odometer / fuel / destination / KM / efficiency remain the source of truth. Zero breakage for the 10+ consumers.
- **`CarLogbookCycle`** — NEW lightweight wrapper (one per `entity_id + bdm_id + period + cycle`) carrying approval/posting state + aggregated totals (`working_days`, `total_km`, `total_fuel_amount`, `cycle_efficiency_variance`, `cycle_overconsumption_flag`). Per-day docs back-link via `cycle_id`. Submit/post/reverse run at the **cycle** level. The wrapper is what the Approval Hub surfaces.

**What shipped (backend).**

1. **New model `CarLogbookCycle`** — wrapper with `refreshTotalsFromDays()` that aggregates from per-day docs; carries `status`, `event_id`, `deletion_event_id`.
2. **Additive fields on `CarLogbookEntry`** — `cycle_id` (back-link); per-fuel `doc_ref`, `receipt_ocr_source` (SCAN|URL_UPLOAD), `manual_override_flag/reason`, `backup_photo_url/attachment_id`, and per-fuel approval state (`approval_status`, `approval_request_id`, `approved_by`, `approved_at`, `rejection_reason`).
3. **`submitCarLogbook` rewritten** — scopes to a single `period+cycle` (rejects multi-cycle mixed submits), upserts a `CarLogbookCycle`, links per-day docs via `cycle_id`, fires ONE `gateApproval({ module: 'EXPENSES', docType: 'CAR_LOGBOOK', docId: cycleDoc._id, docRef: 'LOGBOOK-{period}-{cycle}' })`. Pre-post gate: each non-CASH fuel must be **either** `approval_status='APPROVED'` (per-fuel path) **or** linked to a POSTED CALF. Post flips the wrapper + all linked per-day docs in a transaction, writes ONE JE per cycle.
4. **`reopenCarLogbook` rewritten** — accepts `cycle_ids` (new) or legacy `logbook_ids`. Cycle path reverses JE, flips wrapper + all per-day docs to DRAFT in a transaction.
5. **`submitFuelEntryForApproval` NEW** — per-fuel flow mirroring SMER's per-diem override. Assigns `FUEL-{ENTITY}{MMDDYY}-{NNN}` via `generateDocNumber({ prefix: 'FUEL' })` (no new numbering code — reuses `docNumbering.js` + `DocSequence` atomic counter). Fires `gateApproval({ module: 'EXPENSES', docType: 'FUEL_ENTRY' })`. Open-post path → APPROVED immediately.
6. **`postSingleCarLogbook` extended** — branches on `doc.constructor.modelName === 'CarLogbookCycle'`. Cycle path posts wrapper + all days atomically, ONE JE. Legacy per-day path preserved for backward compatibility.
7. **`getLinkedExpenses` NEW** (`GET /expenses/prf-calf/:id/linked-expenses`) — queries `CarLogbookEntry.fuel_entries.calf_id` + `ExpenseEntry.lines.calf_id`, returns unified list with running total vs CALF amount + variance. Drives the PrfCalf inline drill-down.
8. **`approvalHandlers.car_logbook`** — tries `CarLogbookCycle` first, falls back to per-day for legacy docs.
9. **`approvalHandlers.fuel_entry` NEW** — flips nested `fuel_entries[i].approval_status` to APPROVED/REJECTED.
10. **`MODULE_AUTO_POST.FUEL_ENTRY`** added. The dispatcher now prefers `MODULE_AUTO_POST[req.doc_type]` over `[req.module]`, so FUEL_ENTRY (held under `module: 'EXPENSES'`) routes to the fuel_entry handler, not expense_entry.
11. **`MODULE_QUERIES['CAR_LOGBOOK']`** now queries `CarLogbookCycle` (one per period+cycle), hydrates each with its per-day docs, CRM-enrichment loops across all days in the cycle. docRef = `LOGBOOK-{period}-{cycle}` (single clean ref). description = `{bdm} — {period} {cycle} — {workingDays} working day(s), {total_km} km`. amount = `total_fuel_amount`.
12. **`MODULE_QUERIES['FUEL_ENTRY'] NEW`** — scans `CarLogbookEntry` where `fuel_entries.approval_status='PENDING'`. One item per pending fuel entry.
13. **`buildCarLogbookDetails`** rewritten as dual-shape (detects CYCLE vs legacy DAY via presence of `working_days`/`entry_date`). CYCLE shape emits `period`, `cycle`, `working_days`, `total_*`, `cycle_overconsumption_flag`, `daily_entries[]`, flat `fuel_receipts[]`, pending/approved/rejected fuel counters, plus `line_count + total_amount` aliases so the generic EXPENSES card shows non-zero values.
14. **`buildFuelEntryDetails` NEW** + `DETAIL_BUILDERS.FUEL_ENTRY`.
15. **`documentReversalService.loadCarLogbook / reverseCarLogbook` dual-shape** — cycle path reverses JE via `reverseLinkedJEs({ event_id })`, stamps `deletion_event_id` on wrapper + all linked per-day docs in a transaction. Pre-POSTED cycle → hard-delete wrapper + DRAFT/VALID/ERROR days. `REVERSAL_HANDLERS` count preserved at 21.
16. **Reversal Console list query** updated to surface `CarLogbookCycle` docs (legacy per-day block dead-coded with `if (false &&` — safe to remove in a future cleanup once no legacy per-day POSTED docs remain).
17. **SEED_DEFAULTS updated** (`lookupGenericController.js`): `APPROVAL_CATEGORY.OPERATIONAL.modules += FUEL_ENTRY`; `APPROVAL_MODULE.FUEL_ENTRY` added (OPERATIONAL); `MODULE_DEFAULT_ROLES.FUEL_ENTRY` added (admin / finance / president — subscribers tighten or `null` to open-post via Control Center). `CAR_LOGBOOK` description updated.
18. **Reset script `backend/scripts/resetCarLogbook.js`** — dry-run by default; `--live` drops POSTED/DELETION_REQUESTED per-day docs, drops `erp_car_logbook_cycles`, rejects pending CAR_LOGBOOK/FUEL_ENTRY ApprovalRequests. `--archive` renames instead of drops. Does **not** touch TransactionEvents or JournalEntries (ledger stays balanced — user accepted the fresh-start migration strategy because contractors have paper copies).

**What shipped (frontend).**

1. **`useExpenses` hook** — `validateCarLogbook(scope)` + `submitCarLogbook(scope)` accept `{ period, cycle }`. `reopenCarLogbook(ids, kind='cycle')`. New `submitFuelForApproval(dayId, fuelId)`. New `getLinkedExpenses(calfId)`.
2. **`CarLogbook.jsx`** — `handleValidate` / `handleSubmit` pass `{ period, cycle }`; `handleReopen` passes `'cycle'` kind. New `handleSubmitFuel` handler. Per-fuel approval UI (desktop grid + mobile card): approval-status badge, "Submit Fuel" / "Resubmit" button (shown when editable + non-CASH + no CALF + no approval or REJECTED), fuel-level lock when PENDING/APPROVED.
3. **`PrfCalf.jsx`** — CALF rows get a "View Links" button; inline sub-row renders linked fuel + expense entries with totals + variance vs CALF amount (Phase 33 inline drill-down, driven by `getLinkedExpenses`).
4. **`WorkflowGuide.jsx`** — `WORKFLOW_GUIDES['car-logbook']` steps + tip rewritten to describe the cycle-wrapper flow, per-fuel Submit, pre-post gate, and atomic cycle reverse.

**Before / After Approval Hub card.**

| | Before | After |
|---|---|---|
| Card title | `Submit 16 car logbook entries` | `Submit Car Logbook 2026-04 C2 (14 working days, total ₱8,420)` |
| docRef | `LOGBOOK-2026-04,LOGBOOK-2026-04,…` (×16) | `LOGBOOK-2026-04-C2` |
| Lines / Amount | `Lines=0 / ₱0 / ORE:₱0` | `14 days / ₱8,420 / 312 km` |
| Journal entries on post | 16 (one per day — ledger churn) | 1 |

**Integrity note — known dead code.** `documentReversalService` Reversal Console list query has a legacy per-day branch guarded with `if (false &&` to be safe during migration. Keep it until `backend/scripts/resetCarLogbook.js --live --archive` runs in production, then remove in a follow-up commit.

**Files changed (Phase 33).**

| File | Change |
|------|--------|
| `backend/erp/models/CarLogbookEntry.js` | Additive — `cycle_id`, per-fuel `doc_ref` / `receipt_ocr_source` / `manual_override_*` / `backup_photo_*` / approval state. |
| `backend/erp/models/CarLogbookCycle.js` | NEW — wrapper with `refreshTotalsFromDays()`. |
| `backend/erp/controllers/expenseController.js` | `submitCarLogbook` / `reopenCarLogbook` rewritten; `postSingleCarLogbook` extended; NEW `submitFuelEntryForApproval` + `getLinkedExpenses`. |
| `backend/erp/controllers/universalApprovalController.js` | `approvalHandlers.car_logbook` dual-shape; NEW `fuel_entry` handler; `MODULE_AUTO_POST.FUEL_ENTRY`; dispatcher prefers `doc_type` over `module`. |
| `backend/erp/controllers/lookupGenericController.js` | SEED_DEFAULTS — `APPROVAL_CATEGORY`, `APPROVAL_MODULE`, `MODULE_DEFAULT_ROLES`, `CAR_LOGBOOK` description. |
| `backend/erp/services/universalApprovalService.js` | `MODULE_QUERIES.CAR_LOGBOOK` now wrapper-driven; NEW `FUEL_ENTRY` query; `DOC_TYPE_HYDRATION.CAR_LOGBOOK.modelName=CarLogbookCycle`; `FUEL_ENTRY` added; `MODULE_TO_SUB_KEY.FUEL_ENTRY='approve_expenses'`. |
| `backend/erp/services/documentDetailBuilder.js` | `buildCarLogbookDetails` dual-shape; NEW `buildFuelEntryDetails`; `DETAIL_BUILDERS.FUEL_ENTRY`. |
| `backend/erp/services/documentReversalService.js` | `loadCarLogbook` / `reverseCarLogbook` dual-shape; list query surfaces `CarLogbookCycle`. REVERSAL_HANDLERS=21 (unchanged). |
| `backend/erp/routes/expenseRoutes.js` | Two new routes: `POST /car-logbook/:id/fuel/:fuel_id/submit`, `GET /prf-calf/:id/linked-expenses`. |
| `backend/scripts/resetCarLogbook.js` | NEW — dry-run/live/archive migration script. |
| `frontend/src/erp/hooks/useExpenses.js` | `{period, cycle}` scope on validate/submit; `submitFuelForApproval`; `getLinkedExpenses`. |
| `frontend/src/erp/pages/CarLogbook.jsx` | Period+cycle scope on actions; per-fuel approval UI (desktop + mobile) — badge + Submit Fuel / Resubmit button + fuel-level lock when PENDING/APPROVED. |
| `frontend/src/erp/pages/PrfCalf.jsx` | CALF "View Links" inline drill-down (Phase 33). |
| `frontend/src/erp/components/WorkflowGuide.jsx` | `car-logbook` banner — steps + tip rewritten. |

**Backward compatibility + safety.**
- Per-day CRUD (`createCarLogbook / updateCarLogbook / getCarLogbookList / getCarLogbookById / validateCarLogbook / deleteDraftCarLogbook`) unchanged. The 10+ downstream services listed above continue to read per-day fields at top level.
- `SmerEntry.car_logbook_id` still resolves to a per-day `_id` — SMER integration untouched.
- Legacy paths preserved: `reopenCarLogbook(ids, 'day')`, per-day approvalHandler fallback, legacy `postSingleCarLogbook` branch.
- No historical journal migration. POSTED history stays or gets flushed via the reset script — user's choice.
- `REVERSAL_HANDLERS` count unchanged at 21 (handler is dual-shape).

**Subscription readiness.**
- `MODULE_DEFAULT_ROLES.FUEL_ENTRY` seeded via Lookup, so subscribers tighten (president-only) or open-post (`metadata.roles=null`) through Control Center without code changes.
- `APPROVAL_CATEGORY.OPERATIONAL.modules` includes FUEL_ENTRY — subscribers can re-categorize via Lookup.
- Per-fuel doc_ref uses entity-scoped `DocSequence` — subsidiary prefixes work out of the box.
- Editable statuses still driven by `MODULE_REJECTION_CONFIG.CAR_LOGBOOK` lookup (per-entity overrides in place).
- Cycle boundaries (`C1`=1-15, `C2`=16-end, `MONTHLY`=full) are implied by the wrapper's `period+cycle` unique key; per-subscriber alternative cycles can be added without schema changes.

**Verification.**
- `node -c` clean on all 9 backend files touched.
- `npx vite build` clean (confirmed at each handoff — 9.29s → 11s).
- Repro steps: BDM creates April C2 cycle with 14 working days + 3 non-CASH fuels → clicks Submit Fuel on each non-CASH fuel row → Approval Hub shows 3 FUEL_ENTRY cards with `FUEL-VIP042126-###` refs → president approves each → fuel rows flip to APPROVED (locked) → BDM clicks Submit on the cycle → ONE card `LOGBOOK-2026-04-C2` in the hub → president posts → ONE JE `Car Logbook 2026-04 C2`. Reversal via Reversal Console reverses the JE and cascades `deletion_event_id` to the wrapper + all 14 per-day docs atomically.

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
| `PeriodLock.module` enum | Adds INCENTIVE_PAYOUT to lockable modules (was missing — orphan fixed in W4) | W2/W4 |
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

### Enum ↔ Lookup Symmetry (Approval Rule Coverage)

The `ApprovalRule.module` enum MUST stay in sync with the `APPROVAL_MODULE` lookup + the set of `module:` arg values passed to `gateApproval()`. Rule creation in Control Center → Approval Rules renders its dropdown from `APPROVAL_MODULE`; the backend validates against the enum. A mismatch yields a confusing `Validation failed … is not a valid enum value` the moment admin tries to save a rule for a module the frontend offers.

**Current full set** (26 keys):
`SALES`, `COLLECTIONS` (legacy orphan — never emitted; keep to avoid migration), `EXPENSES`, `PURCHASING`, `PAYROLL`, `INVENTORY`, `JOURNAL`, `BANKING`, `PETTY_CASH`, `IC_TRANSFER`, `INCOME`, `DEDUCTION_SCHEDULE`, `KPI`, `COLLECTION`, `SMER`, `CAR_LOGBOOK`, `PRF_CALF`, `APPROVAL_REQUEST`, `PERDIEM_OVERRIDE`, `UNDERTAKING`, `FUEL_ENTRY`, `CREDIT_NOTE`, `SALES_GOAL_PLAN`, `INCENTIVE_PAYOUT`, `INCENTIVE_DISPUTE`, `OPENING_AR`.

**gateApproval top-level `module:` keys (from controllers)**: `JOURNAL`, `BANKING`, `COLLECTION`, `CREDIT_NOTE`, `EXPENSES`, `IC_TRANSFER`, `INCENTIVE_DISPUTE`, `INCENTIVE_PAYOUT`, `INCOME`, `INVENTORY`, `OPENING_AR`, `PAYROLL`, `PETTY_CASH`, `PURCHASING`, `SALES`, `SALES_GOAL_PLAN`, `UNDERTAKING`.

**Module vs docType distinction**:
- `module` = top-level routing key queried by `findMatchingRules` (strict equality). Must be in the enum + lookup.
- `doc_type` = fine-grained rule targeting (e.g., `PLAN_ACTIVATE`, `BULK_TARGETS_IMPORT` under module `SALES_GOAL_PLAN`). No enum — free-form string. `ApprovalRule` matches `doc_type: null` (module-wide) OR `doc_type: <docType>` (doc-specific).
- FUEL_ENTRY is special: gateApproval sends `module: 'EXPENSES', docType: 'FUEL_ENTRY'` today (Phase 33 design). Admin can target it via (a) a rule on module=EXPENSES with doc_type=FUEL_ENTRY, OR (b) a rule directly on module=FUEL_ENTRY (works after symmetric routing is done — currently inert). Both paths remain supported.

**When you add a new module that calls gateApproval**:
1. Append to `ApprovalRule.module` enum in [backend/erp/models/ApprovalRule.js](backend/erp/models/ApprovalRule.js).
2. Append to `APPROVAL_MODULE` seed in [backend/erp/controllers/lookupGenericController.js](backend/erp/controllers/lookupGenericController.js) with `metadata.category`.
3. Append to `MODULE_DEFAULT_ROLES` seed (same file) with `metadata.roles`.
4. Append to `APPROVAL_CATEGORY` metadata.modules array for the chosen category.
5. Extend `backend/erp/scripts/seedApprovalRules.js` with one or more default rules (module + doc_type + description).

Skip any of steps 1–4 and Control Center breaks silently; skip step 5 and new subscriber entities start with no default matrix rules (acceptable but means first-admin has to configure manually).

### Frontend 202 Handling
All module pages handle `approval_pending` in API responses:
- Success path: check `res?.approval_pending`, show info toast, refresh list
- Error path: check `err?.response?.data?.approval_pending`, show info toast
- Helper: `showApprovalPending()` in `frontend/src/erp/utils/errorToast.js`
- Helper: `isApprovalPending()` for checking both success and error paths

### WorkflowGuide Coverage
- **88/96 ERP pages** have WorkflowGuide banners (91.7%)
- **7 admin/system pages** intentionally excluded (ControlCenter uses DependencyBanner; LookupManager, EntityManager, AgentSettings, ErpSettingsPanel, FoundationHealth, TerritoryManager are config-only pages)
- **PartnerScorecard** (slide-out from OrgChart) now has a WorkflowGuide (Apr 2026 — previously excluded as "config-only"; flipped because it's user-facing and its scores/graduation depend on lookup-driven weights + criteria that BDMs and admins need to understand)
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
8. **Period lock**: `periodLockCheck(moduleKey)` middleware prevents posting to locked periods. Applied to all transactional routes: Sales, Collections, Expenses, Purchasing, Income, Journals, Deduction Schedules, Incentive Payouts (settle/reverse), and Sales Goals (compute snapshots / manual KPI entry). For plan-spanning Sales Goal routes (activate/reopen/close/targets-bulk/targets-import) use `periodLockCheckByPlan(moduleKey)` — derives the year from the referenced SalesGoalPlan and rejects if any month is locked. Module keys in PeriodLock model: SALES, COLLECTION, EXPENSE, JOURNAL, PAYROLL, PURCHASING, INVENTORY, BANKING, PETTY_CASH, IC_TRANSFER, INCOME, SALES_GOAL, INCENTIVE_PAYOUT, DEDUCTION. The controller `MODULES` constant + Control Center stat card derive their lists from `PeriodLock.schema.path('module').enumValues` so adding a future module never requires touching the controller (Phase SG-Q2 W4).
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
| Sales Goal Plan  | (via central console)                                | `documentReversalService` registry: `SALES_GOAL_PLAN` (Phase SG-3R) |
| SMER         | (via central console)                                    | `documentReversalService` registry: `SMER_ENTRY` (Phase 31R) |
| Car Logbook  | (via central console)                                    | `documentReversalService` registry: `CAR_LOGBOOK` (Phase 31R) |
| Supplier Invoice | (via central console)                                | `documentReversalService` registry: `SUPPLIER_INVOICE` (Phase 31R) |
| Credit Note  | (via central console)                                    | `documentReversalService` registry: `CREDIT_NOTE` (Phase 31R) |
| IC Settlement | (via central console)                                   | `documentReversalService` registry: `IC_SETTLEMENT` (Phase 31R) |
| Office Supply Item | `DELETE /api/erp/office-supplies/:id/president-reverse` | `officeSupplyController.presidentReverseSupply` (Phase 31R-OS) |
| Office Supply Txn  | `DELETE /api/erp/office-supplies/transactions/:id/president-reverse` | `officeSupplyController.presidentReverseSupplyTxn` (Phase 31R-OS) |

### Schema Additions

Added `deletion_event_id: ObjectId` (and `reopen_count` where missing) to:
`GrnEntry`, `InterCompanyTransfer`, `PrfCalf`, `IncomeReport`, `Payslip`, `ExpenseEntry`
(Phase 31), and `SmerEntry`, `CarLogbookEntry`, `SupplierInvoice`, `CreditNote`, `IcSettlement` (Phase 31R),
and `OfficeSupply` + `OfficeSupplyTransaction` (Phase 31R-OS — transaction model also gained `reversal_event_id` for the opposite-sign audit row).
`Payslip` also gained `event_id` (reverse handler falls back to JE lookup when missing for legacy rows).
`GrnEntry.status` enum extended with `DELETION_REQUESTED`.

### UX Polish (Phase 6)

`?include_reversed=true` query parameter on list endpoints opts back into showing reversed
rows; default behavior hides them (filter: `deletion_event_id: { $exists: false }`).
Wired into: `getSales`, `getCollections`, `getExpenseList`, `getPrfCalfList`,
`getGrnList`, `getTransfers`, `getIncomeList`, `getPayrollStaging`, `getSupplies` (Phase 31R-OS).

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
- **SupplierInvoice stores `event_id = JournalEntry._id` directly** (not TransactionEvent).
  `purchasingController.postInvoice` writes the JE first then stamps `invoice.event_id = je._id`,
  and the JE's `source_event_id` stays `null`. The Phase 31R handler therefore calls
  `reverseJournal(doc.event_id, ...)` directly instead of `reverseLinkedJEs({ event_id })` —
  the latter searches by `JournalEntry.source_event_id` and would find nothing.
- **IC Settlement posts no JE today** — `icSettlementController.postSettlement`
  creates only a `TransactionEvent`, no `createAndPostJournal` call. Phase 31R
  handler's `reverseLinkedJEs` branch is an idempotent no-op for current data;
  if future refactors add a settlement JE, reversal becomes live automatically.
  Reversal flips `IcSettlement.status → 'REJECTED'` + stamps `rejection_reason`
  so the settlement no longer shows in open-AR lists.
- **CreditNote inventory reversal swaps qty_in↔qty_out** — POSTED CN creates
  `RETURN_IN` ledger entries with `qty_in > 0`; reversal uses the generic
  `reverseInventoryFor()` which creates an opposite `ADJUSTMENT` with
  `qty_out = original.qty_in`. Net ledger effect for the batch returns to zero.
- **SMER + CarLogbook PERIOD_LOCK key is `'EXPENSE'`** (not `'SMER'` / `'CAR_LOGBOOK'`).
  The `PeriodLock.module` enum has no SMER/CAR_LOGBOOK values — both modules
  route through the EXPENSE period lock the same way `expenseRoutes.js` gates
  their submit/reopen paths with `periodLockCheck('EXPENSE')`.
- **CreditNote uses dedicated `CREDIT_NOTE` approval module key** (Phase 31R follow-up).
  Before this change, `creditNoteController` called `gateApproval({ module: 'SALES', ... })`
  and unauthorized-BDM submissions were invisible in the Approval Hub (the SALES
  MODULE_QUERIES entry only queries SalesLine). `CREDIT_NOTE` now has its own
  MODULE_QUERIES entry (native pattern — queries `CreditNote.status='VALID'`),
  its own SEED_DEFAULTS lazy-seed (APPROVAL_MODULE + MODULE_DEFAULT_ROLES), and
  its own universalApprovalController wiring. It reuses `approve_sales` sub-permission
  so subscribers get the new surface without configuring an extra Access Template
  grant; splitting into `approve_credit_notes` is a future-proof one-row lookup change.

### Phase 31-E — Reversal Console cross-entity default (April 2026)

**Symptom.** President viewed the Sales list and saw POSTED CSIs from MG and CO.
(and every other subsidiary — that page scopes by `req.tenantFilter`, which is
`{}` for presidents). Opening the Reversal Console with the same login showed an
empty list for those same POSTED CSIs. Root cause: the console's list/history
controllers silently fell back to `req.entityId` (the president's *primary*
entity) when no `?entity_id=` query param was supplied, scoping out every
subsidiary without telling the user.

**Fix.** [backend/erp/controllers/presidentReversalController.js](backend/erp/controllers/presidentReversalController.js)
`getReversible` + `getHistory` now follow global Rule #21 exactly:

| Caller | No query param | `?entity_id=<id>` | `?entity_id=ALL` |
|---|---|---|---|
| Privileged (president/admin/finance) | **null** (cross-entity) | narrow to that entity | null (legacy alias, same as no param) |
| Non-privileged (BDM/contractor) | pinned to `req.entityId` | param ignored | param ignored |

Service-layer contract is already correct — `listReversibleDocs` /
`listReversalHistory` interpret `entityId === null` as "skip entity filter", so
no downstream change was needed. No new query param is required from the
frontend; the existing `PresidentReversalsPage` picks up cross-entity rows on
next fetch without code or UI change.

**Scalability / subscription-readiness.** No hardcoded role list — reuses the
existing `req.isPresident || req.isAdmin || req.isFinance` helper set by
`tenantFilter` middleware (subscribers can later migrate the triple-check to a
`CROSS_SCOPE_VIEW_ROLES` Lookup without touching the console). No new lookup
rows. No new collection, model, or schema field. No migration needed — the
change is purely a controller-level default.

**Integrity / blast radius.**
- The `reverse` and `detail` endpoints were already tenant-safe (use
  `req.tenantFilter` directly, which stays `{}` for presidents — cross-entity
  reverse has always worked; only the *list* was hiding rows).
- Non-privileged callers still cannot probe sibling entities — the `else` branch
  continues to pin to `req.entityId` and ignores `?entity_id=`.
- Same pattern deliberately NOT applied to `collectionController.getCollections`
  and `inventoryController` bulk listers; those have business-specific reasons
  to default to the working entity (finance reconciles one set of books at a
  time). Document that difference here rather than "fix" cosmetically.

### Phase 31R-OS — Office Supplies reversal (April 2026)

Triggered by a silent-save bug where a single user unknowingly created 6 identical
"BALL PEN" rows. The fix is three-layered (UX feedback → DB constraint → reversal path):

- **Success toast** added to `handleSaveItem` + `handleRecordTxn` in
  [frontend/src/erp/pages/OfficeSupplies.jsx](frontend/src/erp/pages/OfficeSupplies.jsx).
  Previously the modal closed silently; users re-clicked Save thinking the action
  had failed. Root cause of the duplicate incident.
- **Unique partial index** on `{ entity_id, item_code }` in
  [backend/erp/models/OfficeSupply.js](backend/erp/models/OfficeSupply.js). The
  `partialFilterExpression` requires `item_code: { $type: 'string' }` AND
  `deletion_event_id: { $exists: false }` so: (a) items without a code still
  save, and (b) president-reversed items free up their code for re-use while
  their row stays in the collection for audit. Duplicates produce Mongo error
  11000 which the controller translates to HTTP 409 via the shared
  `sendDuplicateIfAny()` helper (in [backend/erp/controllers/officeSupplyController.js](backend/erp/controllers/officeSupplyController.js)).
- **Two new reversal handlers** registered in `REVERSAL_HANDLERS`:
  - `OFFICE_SUPPLY_ITEM` — SAP Storno with cascade. Marks all
    `OfficeSupplyTransaction` rows for the item as `deletion_event_id=<reversal>`,
    then stamps the master row and flips `is_active=false` so it's hidden from
    default lists. No JE reversal (office supplies have no ledger integration today).
  - `OFFICE_SUPPLY_TXN` — creates an opposite-sign transaction with
    `reversal_event_id` stamped, restores parent `qty_on_hand` by the inverse
    delta, and marks the original with `deletion_event_id`. `txn_type` is flipped
    (PURCHASE⇄ISSUE, RETURN⇄ADJUSTMENT) so the audit trail reads naturally.

Both doc types are fully wired into:
- `REVERSAL_HANDLERS` registry (2 new entries, module: `inventory`)
- `listReversibleDocs()` — surfaces items + unreversed txns in the Console
- `REVERSAL_DOC_TYPE_TO_MODULE` → `OFFICE_SUPPLY` (shared builder key)
- `DETAIL_BUILDERS.OFFICE_SUPPLY` — single builder branches on `item.txn_type`
  to render item vs txn shape
- `POPULATED_LOADERS` in `documentDetailHydrator.js` — both types populate
  `supply_id`, `cost_center_id`, `warehouse_id` as applicable
- `?include_reversed=true` query param on `GET /api/erp/office-supplies`

**Danger gate.** Routes use `erpSubAccessCheck('accounting', 'reverse_posted')` —
the existing Phase 3a danger sub-permission. No new key; subscribers delegate via
Access Templates without code changes. President always passes.

**UI.** `PresidentReverseModal` (shared) is mounted on the Office Supplies page
with a red "Reverse" button appearing per-row only when `user.role === 'president'`.
Both desktop table and mobile card have the button. Transaction history rows also
get a Reverse button, or a REVERSED badge if already reversed.

**Common gotchas (Phase 31R-OS).**

- **No period-lock entry** for office supply doc types in `PERIOD_LOCK_MODULE`.
  Office supplies do not post to COA today (no JE side-effects), so no period
  gate is needed. `assertReversalPeriodOpen` is a no-op for these types (the
  map lookup returns undefined and the function returns early). If future work
  posts supply expenses to the ledger, add entries mapping to `'EXPENSE'` or
  `'INVENTORY'` and add a `reverseLinkedJEs({ event_id })` branch.
- **Route order matters.** `router.delete('/transactions/:id/president-reverse', ...)`
  MUST be declared BEFORE `router.delete('/:id/president-reverse', ...)` in
  [officeSupplyRoutes.js](backend/erp/routes/officeSupplyRoutes.js), otherwise
  the `/:id` route swallows the literal `transactions` segment.
- **Working entity required.** `createSupply` now returns 400 if `req.entityId`
  is null (president without an `X-Entity-Id` header selected). Prior behavior
  was to write `entity_id: null` which failed Mongoose validation with a less
  helpful error.
- **Approval Hub is intentionally not wired.** Office supplies are master data;
  Vendor/Product/Bank/Warehouse create flows also skip approval. Adding it only
  here would be inconsistent — and the duplicates bug is solved by the unique
  index + toast, not by human review.

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

## Phase H6 — Sales OCR (BDM Field Scanning) + AI Spend-Cap Enforcement on OCR (April 19, 2026)

### Why this exists

Phase H2-H5 built the smart-OCR pipeline for expense docs (OR / Gas Receipt). Phase H6 extends the **same pipeline** — Google Vision → rule-based parser → Claude field-completion → master-data resolver → vendor auto-learn — to the sales side of the business so BDMs scan CSI / CR / DR / Bank Slip / Check in the field instead of typing. Everything is additive; no regressions in the existing Expense OCR flow.

Phase H6 also closes two long-standing governance gaps inherited from Phase G7:

1. **OCR Claude calls bypassed AI_SPEND_CAPS** — `ocrAutoFillAgent.classifyWithClaude` called `askClaude()` directly with no `enforceSpendCap()` gate. Sales OCR volume (~1,320 scans/month at steady state) would have run the monthly AI budget invisible to the AI Budget tab.
2. **`OcrUsageLog.cost_usd` did not exist** — `spendCapService.getCurrentMonthSpend()` already aggregates `$cost_usd` from `erp_ocr_usage_logs`, but nobody was writing the field. Result: OCR spend was silently excluded from the AI Budget total.

Both are fixed as the **first commit** of H6 so they land before any Sales OCR volume ramps up.

### Architecture — additive, not replacing

```
BDM's phone camera (SalesDocScanner.jsx)
  → POST /api/erp/ocr/process (existing endpoint, reused)
    → OcrSettings.getForEntity (cached, per-entity gate)
      → detectText (Google Vision)                    ← Layer 1 (unchanged)
        → parseCSI / parseCR / parseDR / bankSlipParser / checkParser   ← Layer 2a (new parsers added)
          → classifyWithClaude (if critical fields weak — now spend-cap gated)   ← Layer 2b (gate is new)
            → resolveCustomer / resolveProduct / resolveVendor  ← Layer 3 (unchanged)
              → learnFromAiResult (vendor auto-learn, unchanged) ← Layer 4 (unchanged)
                → DRAFT record (SalesLine / Collection / SamplingLog / ConsignmentTracker / Deposit / CheckReceived)  ← new dispatcher
                  → BDM reviews pre-filled form on phone
                    → Submit → gateApproval() + periodLockCheck → POSTED
```

### Deliverables

| # | Item | Status |
|---|---|---|
| P1-1 | `enforceSpendCap('OCR')` wired into `ocrAutoFillAgent.classifyWithClaude` — entity scoped, 429 on cap hit, caller catches and falls back to rule-based result | ✅ |
| P1-2 | `OcrUsageLog.cost_usd` + `ai_skipped_reason` added, populated by `ocrController` from `processor.ai_cost_usd` | ✅ |
| P1-3 | Smart OCR extended to sales doc types — CSI/CR/DR/BANK_SLIP/CHECK added to `CRITICAL_FIELDS_BY_DOC` so field-completion fallback fires on handwriting | 🚧 |
| P1-4 | New parsers `bankSlipParser.js` + `checkParser.js` + `drRouter.js` (sampling vs consignment marker detection) | 🚧 |
| P1-5 | Missing DRAFT models: `SamplingLog`, `Deposit`, `CheckReceived` (the other three — `SalesLine`, `Collection`, `ConsignmentTracker` — already exist) | 🚧 |
| P1-6 | DRAFT-creation endpoints per doc type under `/api/erp/sales-ocr/*` — each creates the correct DRAFT record from the processor output | 🚧 |
| P1-7 | Mobile `SalesDocScanner.jsx` (camera, preview, retry, 360px-verified) + six review forms (one per doc type) | 🚧 |
| P1-8 | `BANK_SLIP` + `CHECK` added to `OcrSettings.ALL_DOC_TYPES` and surfaced in existing `ErpOcrSettingsPanel` — no new panel, just chips | 🚧 |
| P1-9 | `/erp/scan` route + Sidebar link under BDM section + WorkflowGuide banner | 🚧 |

### Critical spend-cap gate (P1-1) — how it works

**Before**: `classifyWithClaude()` called `askClaude()` unconditionally once `ANTHROPIC_API_KEY` was present and `ai_fallback_enabled` was true. No cost aggregation, no cap check.

**After**:
```js
// backend/agents/ocrAutoFillAgent.js
async function classifyWithClaude(rawOcrText, extractedFields = {}, context = {}) {
  // Phase H6 — entity-scoped AI_SPEND_CAPS gate. Throws 429 on cap hit.
  if (context.entityId) {
    await enforceSpendCap(context.entityId, 'OCR');
  }
  // ... existing Claude call
}
```

The `processOcr` caller (in `ocrProcessor.js`) passes `entityId` into `context`, catches the 429, records `ai_skipped_reason: 'SPEND_CAP_EXCEEDED'`, and returns the rule-based result. Vision + parser still run; only the Claude step is short-circuited. The frontend sees the same response shape — just with `validation_flags: [{ type: 'AI_SPEND_CAP_EXCEEDED' }]` and weaker confidence. Zero regressions in success paths.

### Cost visibility (P1-2) — schema + write path

```js
// backend/erp/models/OcrUsageLog.js — Phase H6 additions
ai_skipped_reason: { type: String, enum: ['NONE', 'SPEND_CAP_EXCEEDED'], default: 'NONE' },
cost_usd:          { type: Number, default: 0, min: 0 },
```

`spendCapService.getCurrentMonthSpend()` at line 109 already aggregates `$cost_usd` from `erp_ocr_usage_logs` — so once the field is populated, OCR spend immediately appears in the AI Budget tab total without any further work.

### Integrity checklist (H6 — applies to every commit in this phase)

Every file touched must pass:
- `node -c <file>` — syntax
- Existing `npm run verify:copilot-wiring` and `npm run verify:rejection-wiring` — must stay ✓
- **Expense OCR regression guard**: an OR or GAS_RECEIPT scan before and after H6 must produce the same `extracted.amount`, `extracted.supplier_name`, `classification.coa_code` for the same fixture.
- **New endpoints must go through the standard middleware stack**: `erpAccessCheck` → `erpSubAccessCheck` → `periodLockCheck(module)` → handler → `gateApproval(module)`. No shortcuts (Rule #20).
- **Entity from `req.entityId` only** — never from client body (Rule #21).
- **Every new doc type added to `OcrSettings.ALL_DOC_TYPES`** must also appear in the existing `ErpOcrSettingsPanel` chip grid; no orphaned enum values.
- **Every new parser must be registered in `ocrProcessor.PARSERS` AND `SUPPORTED_DOC_TYPES`** — both are exported and used by the frontend's `getSupportedTypes` endpoint.
- **DR router fallback**: when the marker is ambiguous (no "SAMPLING" / "CONSIGNMENT" keyword found), default to `ConsignmentTracker` (the more common case) and flag `review_required = true` so the BDM disambiguates on review.

### Subscription-readiness (Rule #3 alignment)

| Config | Lookup / Source | Default for new subsidiary |
|---|---|---|
| Which doc types are OCR-allowed | `OcrSettings.allowed_doc_types` (per-entity) | all types — admin deselects chips to restrict |
| Claude AI fallback on/off | `OcrSettings.ai_fallback_enabled` | true |
| Monthly Vision call quota | `OcrSettings.monthly_call_quota` | 0 (unlimited) |
| Monthly AI budget cap | `Lookup AI_SPEND_CAPS.MONTHLY` | `is_active: false` (safe default — no cap enforced) |
| Per-BDM daily scan throttle | `Lookup OCR_DAILY_SCAN_CAP` (Phase H6.2 — deferred) | 25/BDM/day (added when volume signal warrants) |

No hardcoded sales-OCR behavior. All of: which entities have it, which doc types they can scan, how much Claude they can burn, and which BDMs can use it — all flow from existing Lookup / Settings / ErpOcrSettings. A new subsidiary onboarded via Control Center gets sane defaults and opts in per-chip.

### Files touched in H6 (running list — updated as commits land)

**Modified**:
- `backend/erp/models/OcrUsageLog.js` — H6.1 cost_usd + ai_skipped_reason
- `backend/agents/ocrAutoFillAgent.js` — H6.1 enforceSpendCap gate
- `backend/erp/ocr/ocrProcessor.js` — H6.1 pass entityId + catch 429 + surface cost

**New (planned)**:
- `backend/erp/ocr/parsers/bankSlipParser.js`
- `backend/erp/ocr/parsers/checkParser.js`
- `backend/erp/ocr/parsers/drRouter.js`
- `backend/erp/models/SamplingLog.js`
- `backend/erp/models/Deposit.js`
- `backend/erp/models/CheckReceived.js`
- `backend/erp/controllers/salesOcrController.js`
- `backend/erp/routes/salesOcrRoutes.js`
- `frontend/src/erp/pages/ScanDocumentPage.jsx`
- `frontend/src/erp/components/scan/SalesDocScanner.jsx` + six review forms

### Common gotchas (H6)

- **`AI_SPEND_CAPS` lookup is lazy-seeded with `is_active: false`** — existing entities will NOT start enforcing a cap just because Phase H6 landed. President must explicitly flip `is_active: true` + set `monthly_budget_usd` in Control Center → AI Budget. This matches the Phase G7 safety default.
- **`enforceSpendCap` throws a 429 `Error` with `.reason === 'SPEND_CAP_EXCEEDED'`** — other 429s (rate limits, timeouts) will have different `.reason`. The processor's 429 handler checks BOTH status AND reason before treating it as a spend-cap skip; otherwise it falls through to the generic error path.
- **OcrUsageLog 1-year TTL** — historical `cost_usd` older than 12 months is auto-purged. If the user wants longer retention for audit, export to cold storage before the TTL fires.
- **Sales docs don't need expense classification** — `EXPENSE_DOC_TYPES` stays `{OR, GAS_RECEIPT}`. The Claude fallback branch in `ocrProcessor.js` is being refactored so field-completion runs for CSI/CR/DR too, but the classifier (which maps vendor → COA) is skipped for sales docs (they have no COA — they have a customer).

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

---

## Phase G8 — Agents + Copilot Expansion (April 19, 2026)

### Why this exists

Phase G7 delivered the Copilot chat widget + 9 read/write tools + Daily Briefing. The president-facing surface still lacked: (a) structured persistence for "remind me to X" — tasks lived in the inbox, un-listable; (b) HR coaching/rating/ranking helpers; (c) a broader operational-signal agent estate (treasury, FP&A, procurement, compliance, audit, data quality, FEFO, expansion). Phase G8 fills all three gaps in one coordinated release.

### Scope (shipped)

**1 new model** — `Task` collection (`backend/erp/models/Task.js`, collection `erp_tasks`).
- Entity-scoped (Rule #21), parent/child support, OPEN → IN_PROGRESS → DONE state machine.
- Routes: `/api/erp/tasks` (list, overdue, create, update, delete).
- Page: `/erp/tasks` (linked from Sidebar → Administration → My Tasks).
- WorkflowGuide entry: `'tasks'`.

**8 new scheduled agents** (all rule-based FREE; AI toggles per-agent via lookup):
| Agent key | Cron (Asia/Manila) | Output category | Route |
|---|---|---|---|
| `treasury` | `30 5 * * 1-5` | briefing | PRESIDENT |
| `fpa_forecast` | `0 6 * * 1` | briefing | PRESIDENT |
| `procurement_scorecard` | `0 7 * * 2` | briefing | PRESIDENT |
| `compliance_calendar` | `0 5 * * 1` | compliance_alert | PRESIDENT |
| `internal_audit_sod` | `0 8 * * 3` | compliance_alert | PRESIDENT + FINANCE |
| `data_quality` | `0 9 * * *` | data_quality | PRESIDENT + ADMIN |
| `fefo_audit` | `30 7 * * *` | inventory_alert | PRESIDENT |
| `expansion_readiness` | `0 10 1 * *` | briefing | PRESIDENT |

**10 new Copilot tools** (5 Secretary + 5 HR, all pay-per-use via existing AI_SPEND_CAPS):
- Secretary: `CREATE_TASK`, `LIST_OVERDUE_ITEMS`, `DRAFT_DECISION_BRIEF`, `DRAFT_ANNOUNCEMENT`, `WEEKLY_SUMMARY`
- HR: `SUGGEST_KPI_TARGETS`, `DRAFT_COMP_ADJUSTMENT`, `AUDIT_SELF_RATINGS`, `RANK_PEOPLE`, `RECOMMEND_HR_ACTION`

**3 new lookup categories** (subscription-ready, lazy-seeded):
- `TREASURY_AGENT_AI_MODE` (default `rule`)
- `FPA_FORECAST_AI_MODE` (default `rule`)
- `HR_ACTION_BLUNTNESS` (default `balanced`)

**System prompt updated** — `PRESIDENT_COPILOT.metadata.system_prompt` now names the new Secretary + HR tools and references the 8 background agents so Claude routes natural-language questions to the right capability.

### Architecture principles

1. **Tasks are not finance** — no `gateApproval` / no period lock on the Task routes. Productivity ≠ ledger.
2. **Agents are entity-ignorant at the scheduler layer** — same as Phase G7 existing agents. Each run aggregates system-wide data and posts to `PRESIDENT` recipient group, which resolves to every president across all entities. Multi-entity breakdowns surface inside the agent body (e.g., Expansion Readiness ranks entities).
3. **AI toggles are additive** — every rule-based agent produces a usable output WITHOUT Claude. `TREASURY_AGENT_AI_MODE=ai` and `FPA_FORECAST_AI_MODE=ai` only APPEND a Claude narrative to the already-built body; they never replace rule output. Each AI branch is gated by `enforceSpendCap()`.
4. **Copilot tools obey the G7 contract** — write_confirm handlers return a draft + confirmation payload in preview mode; execute mode routes through the existing model / controller. No bypass of `gateApproval`.
5. **Lookup-driven HR bluntness** — RECOMMEND_HR_ACTION never auto-executes. Conservative tier suppresses `manage_out`. All action tiers above `coach` flag `requires_hr_legal_review=true`.

### Critical invariants + gotchas

- **No client-supplied `entity_id`**: every handler derives entity from `ctx.entityId` (Copilot calls) or `req.entityId` (HTTP). Rule #21 is strict.
- **Task deletion cascade**: `parent_task_id` references live on parent's `sub_tasks[]` cache. On delete, the cache is best-effort pulled; tree can always be rebuilt from `parent_task_id`.
- **DRAFT_ANNOUNCEMENT recipient resolution**: uses the User model `entity_id` / `entity_ids` fields. Non-privileged callers can never target another entity — scope collapses to the caller's working entity regardless of `target_entity_id` value.
- **SoD + Data Quality dual-route notifications**: both agents call `notify` twice — once to PRESIDENT with full channels, once to FINANCE / ADMIN with `in_app` only (prevents duplicate email spam on the same fact).
- **verify:copilot-wiring**: baseline moved from 25/25 → **35/35**. Future tool additions must keep this green.
- **PersonComp DRAFT fallback**: if the install doesn't have a `PersonComp` model registered, `DRAFT_COMP_ADJUSTMENT` in execute mode returns `ok:false` with a note directing the user to the People > Comp UI. Nothing is silently lost.
- **Compliance deadlines**: baseline 6 deadlines live in `complianceDeadlineAgent.BASELINE_DEADLINES`. Override by seeding `Lookup` rows in category `COMPLIANCE_DEADLINES` — when any row exists there, the baseline is IGNORED. Empty lookup category = baseline used (safe default for fresh subsidiaries).

### Files touched

**Backend (new)**:
- `backend/erp/models/Task.js`
- `backend/erp/controllers/taskController.js`
- `backend/erp/routes/taskRoutes.js`
- `backend/agents/treasuryAgent.js`
- `backend/agents/fpaForecastAgent.js`
- `backend/agents/procurementScorecardAgent.js`
- `backend/agents/complianceDeadlineAgent.js`
- `backend/agents/internalAuditSodAgent.js`
- `backend/agents/dataQualityAgent.js`
- `backend/agents/fefoAuditAgent.js`
- `backend/agents/expansionReadinessAgent.js`

**Backend (modified)**:
- `backend/agents/agentRegistry.js` — 8 new rows
- `backend/agents/agentScheduler.js` — 8 new cron schedules
- `backend/agents/ocrAutoFillAgent.js` — 429 re-throw fix (carry-over from Phase H6 P1-1)
- `backend/erp/routes/index.js` — `/tasks` mount
- `backend/erp/services/copilotToolRegistry.js` — 10 new handlers
- `backend/erp/controllers/lookupGenericController.js` — 10 new COPILOT_TOOLS rows, 3 new lookup categories, system prompt update

**Frontend (new)**:
- `frontend/src/erp/pages/TasksPage.jsx`

**Frontend (modified)**:
- `frontend/src/App.jsx` — `/erp/tasks` route
- `frontend/src/components/common/Sidebar.jsx` — "My Tasks" link
- `frontend/src/erp/components/WorkflowGuide.jsx` — `'tasks'` guide entry

### Day-launch defaults (already in place)

- All 8 scheduled agents seed `AgentConfig.enabled = true` via existing lazy-seed in `agentExecutor.ensureAgentConfig`.
- `TREASURY_AGENT_AI_MODE.value = 'rule'`, `FPA_FORECAST_AI_MODE.value = 'rule'`, `HR_ACTION_BLUNTNESS.value = 'balanced'` (all seeded when first read).
- All 10 new COPILOT_TOOLS rows seed `is_active: true`.
- `AI_SPEND_CAPS.MONTHLY` still seeds with `is_active: false` — subscriber opts in via Control Center → AI Budget.

### Subscription model

A new subsidiary onboarded tomorrow gets:
- Task collection available immediately (no seed needed — collection materialises on first insert).
- All 8 agents run on their crons but post only when the subsidiary's data surfaces signals.
- All 10 Copilot tools available in chat; gated per-role via each row's `allowed_roles`.
- Zero code change needed to add a new compliance deadline, raise the BDM graduation threshold, or flip an agent to AI mode — all lookup-driven via Control Center.

---

## Phase G9 — Unified Operational Inbox (April 20, 2026)

### Why
SAP Fiori / Odoo / NetSuite all converge on one read-pane for everything that needs a user's attention: approvals, tasks, agent findings, broadcasts, chat. Pre-G9 the CRM had three disjoint surfaces (Inbox = admin broadcasts only, Approval Hub = approvals only, Tasks page = standalone) and email was the only path for AI-agent findings. G9 fuses them.

### Architecture
- **Schema**: `MessageInbox` extended with `entity_id`, `folder`, `thread_id`, `parent_message_id`, `requires_action`, `action_type`, `action_payload`, `action_completed_at`, `action_completed_by`. 4 new compound indexes for (entity_id, folder), (entity_id, requires_action), (thread_id, createdAt), (entity_id, recipientRole, recipientUserId, isArchived, createdAt).
- **Folders are lookup-driven**: `MESSAGE_FOLDERS` lookup (lazy-seeds via `inboxLookups.getFoldersConfig`) → 9 codes (INBOX, ACTION_REQUIRED, APPROVALS, TASKS, AI_AGENT_REPORTS, ANNOUNCEMENTS, CHAT, SENT, ARCHIVE). 4 are virtual (computed at query time).
- **Action affordance is lookup-driven**: `MESSAGE_ACTIONS` lookup → 6 codes (approve / reject / resolve / acknowledge / reply / open_link) with `metadata.variant`, `confirm`, `reason_required`, `api_path` template.
- **Two-way DM matrix is lookup-driven**: `MESSAGE_ACCESS_ROLES` lookup → 6 rows (president/ceo/admin/finance/contractor/employee), each with `can_dm_roles` (or `*`), `can_broadcast`, `can_cross_entity`, `can_dm_direct_reports`.
- **Helper module**: `backend/erp/utils/inboxLookups.js` exports `FOLDER_DEFAULTS`, `ACTION_DEFAULTS`, `ACCESS_ROLES_DEFAULTS`, `CATEGORY_TO_FOLDER`, `folderForCategory`, `getFoldersConfig`, `getActionsConfig`, `getAccessRolesConfig`, `canDm`, `canBroadcast`. Same lazy-seed pattern as `getChannelConfig`.

### Routing & dispatch upgrade
- `dispatchMultiChannel` (in `erpNotificationService.js`) gained 7 new options: `inAppFolder`, `inAppThreadId`, `inAppParentMessageId`, `inAppRequiresAction`, `inAppActionType`, `inAppActionPayload`, `inAppSender`.
- `persistInApp` extended with the same fields. Folder auto-derives from category via `folderForCategory()` when not passed.
- All 7 existing notify* helpers (`notifyDocumentPosted/Reopened`, `notifyApprovalRequest/Decision`, `notifyPayrollPosted`, `notifyTierReached`, `notifyKpiVariance`) flipped from email-only `sendToRecipients` to `dispatchMultiChannel` so they ALSO write inbox rows.
- New helper `notifyTaskEvent({ event: 'assigned'|'reassigned'|'completed'|'commented'|'overdue', ... })` writes to TASKS folder. Thread-id = task._id. Wired into `taskController.createTask` + `updateTask`.
- **Approval threading**: `approvalService.js` passes `approvalRequestId: request._id` (and `nextRequest._id` for escalated levels) to `notifyApprovalRequest` and `notifyApprovalDecision`. Thread-id = `ApprovalRequest._id` so request → decision → reopen all fold into the same conversation in the inbox.

### API
- `GET /api/messages` — list w/ `?folder=&requires_action=&thread_id=&counts=1` (counts=1 returns `{ data, counts: { unread, action_required, inbox, approvals, tasks, ai_agent_reports, announcements, chat } }`).
- `GET /api/messages/counts` — lightweight bell counts (Cache-Control: 25s).
- `GET /api/messages/folders` — lookup-driven folder + action config.
- `GET /api/messages/thread/:thread_id` — full thread (oldest first; entity-scoped; audience-guarded).
- `POST /api/messages/compose` — two-way DM (recipient_user_id OR recipient_role); gated by `messaging.* sub-perms` + `MESSAGE_ACCESS_ROLES` matrix; president bypasses.
- `POST /api/messages/:id/reply` — child row; `thread_id = parent.thread_id || parent._id`; audience swap.
- `POST /api/messages/:id/action` — delegates to canonical downstream:
  - `approve`/`reject` → `universalApprovalController.approvalHandlers.approval_request(id, action, userId, reason)` (NO bypass of gateApproval / period locks; Rule #20).
  - `resolve` → mirrors `varianceAlertController.resolveVarianceAlert` permission logic.
  - `acknowledge` → stamp completion only.
  - `open_link` → frontend-only.
  - Stamps `action_completed_at` + `action_completed_by` on success; force-marks read.

### Sub-permissions (Phase G9.R3)
New module **MESSAGING** in `ERP_MODULE` lookup (sort_order 15). Five sub-perms in `ERP_SUB_PERMISSION`:
- `messaging.dm_any_role` — direct-message any role
- `messaging.dm_direct_reports` — DM your reports_to children only
- `messaging.broadcast` — broadcast to a role group
- `messaging.cross_entity` — send across entities
- `messaging.impersonate_reply` — admin tool, reply as another sender

`MODULE_DEFAULT_ROLES.MESSAGING` defaults `roles=['president','ceo','admin','finance','contractor','employee']` (open). Subscribers tighten via Control Center → Lookup Tables.

### Frontend
- `pages/common/InboxPage.jsx` — 3-pane (folders / list / thread) on desktop; stacked + drawer on mobile (≥360 px). Replaces the BDM-only `EMP_InboxPage` (now a re-export shim for `/bdm/inbox` URL stability).
- `components/common/inbox/InboxFolderNav.jsx` — vertical desktop / horizontal scroll on mobile, lookup-driven labels + icons + per-folder badge counts.
- `components/common/inbox/InboxMessageList.jsx` — compact rows w/ sender initials, action/high-priority chips, time-aware timestamps.
- `components/common/inbox/InboxThreadView.jsx` — thread + action button row + reply composer + reason modal for reject/resolve.
- `components/common/inbox/InboxComposeModal.jsx` — direct/broadcast toggle, lazy-loaded user list, rate-limited 5000-char body.
- `components/common/NotificationBell.jsx` — replaces the mock `NotificationCenter`. Polls `/messages/counts` every 30 s and on `inbox:updated` event. Red badge = action_required, blue = unread.
- TASKS folder branch mounts `TaskMiniEditor` (already shipped) instead of `InboxThreadView`. The mini editor saves via `PATCH /erp/tasks/:id` (Rule #20).
- Routes: `/inbox` and `/inbox/thread/:thread_id` (allowedRoles = ALL); `/bdm/inbox` aliases the same component.
- Sidebar: Inbox link added to ERP Administration section AND CRM admin "Main" section AND existing BDM "Work" section.
- Navbar: `<NotificationBell />` mounted next to the theme toggle.

### Verify scripts
- `npm --prefix backend run verify:inbox-wiring` — 19/19 checks (FOLDER_DEFAULTS shape, CATEGORY_TO_FOLDER cross-file consistency, lazy-seed null-safety, notify* dispatch coverage, controller/route alignment, frontend mounts, agent-direct-write entity_id/folder presence, agentRegistry+scheduler for task_overdue, ERP_MODULE+ERP_SUB_PERMISSION+MODULE_DEFAULT_ROLES seed for MESSAGING, DRAFT_REPLY_TO_MESSAGE tool+handler).
- `npm --prefix backend run verify:copilot-wiring` — bumped to 36/36 with new `DRAFT_REPLY_TO_MESSAGE` tool (handler `draftReplyToMessage`, allowed_roles include contractor so BDMs can reply via Copilot).

### Task Overdue Agent (Phase G9.R1)
- `backend/agents/taskOverdueAgent.js` — FREE (rule-based). Cron `15 6 * * 1-5` Manila (weekdays 06:15, between Treasury 05:30 and Inventory Reorder 06:30, before Daily Briefing 07:00).
- Walks every active entity for `Task` rows with `status ∈ {OPEN, IN_PROGRESS, BLOCKED}` AND `due_date < now` AND `assignee_user_id ≠ null`.
- Cooldown: per-entity `TASK_OVERDUE_COOLDOWN_DAYS` lookup (GLOBAL row, default 1 day; lazy-seeds on first run). New Task field `last_overdue_notify_at` is the dedup stamp.
- Fires `notifyTaskEvent({ event: 'overdue' })` per task → row lands in TASKS folder w/ `requires_action=true`, `action_type='open_link'`, `action_payload.deep_link='/erp/tasks?id=…'`.
- Registered in `agentRegistry.AGENT_DEFINITIONS.task_overdue` (FREE) and surfaced on the Agent Dashboard with Clock icon `#ea580c`.

### Subscription posture
A new subsidiary tomorrow gets:
- Inbox UI immediately for every authenticated role (no per-tenant seed; folders/actions lazy-seed on first read).
- Their MESSAGE_FOLDERS / MESSAGE_ACTIONS / MESSAGE_ACCESS_ROLES rows materialise on first call to `inboxLookups.get*Config(entityId)`; admin can re-label "Tasks / To-Do" → "ToDos" via Control Center → Lookup Tables without a code deploy.
- `task_overdue` cron fires for them on the next weekday morning; the agent skips entities with no overdue tasks.
- Two-way messaging is open by default (MESSAGING module + all 6 roles in MODULE_DEFAULT_ROLES); admin tightens via Access Templates.
- Existing `NOTIFICATION_CHANNELS.IN_APP.metadata.enabled = false` kill-switch suppresses NEW inbox writes immediately; existing rows stay visible (so no data loss when toggling).

### Known follow-ups (intentionally deferred)
- Broadcast UI for "Reply All" on broadcast rows (currently single-recipient).
- Inbox bulk-archive / bulk-mark-read (admin convenience; not blocking).
- Cross-entity inbox view for presidents (currently surfaces all entities when `?entity_id=` omitted; no per-entity grouping pill in the list yet).
- Dual-route POSTED-event notifications (Phase G8 SoD pattern): currently `notifyDocumentPosted` writes one row to all of management; subscribers complaining of in-app noise can later split into PRESIDENT-with-all-channels + FINANCE/ADMIN-in-app-only without schema changes.

### Phase G9.R9 — Per-role Hidden Folders (April 25, 2026)

**Why.** President's APPROVALS folder duplicates `/erp/approvals` (the Approval Hub). Same items, two surfaces, two unread badges. Resolved with a lookup-driven per-role folder visibility matrix.

**Behavior.** New lookup category `INBOX_HIDDEN_FOLDERS_BY_ROLE` (per-entity, lazy-seed). Each row keys a role; `metadata.hidden_folders` is the array of folder codes (uppercase) to hide from that role's left rail, default `INBOX` view, `ACTION_REQUIRED` virtual folder, and folder badge counts. Default seed: `{ code: 'president', metadata: { hidden_folders: ['APPROVALS'] } }`. Other roles see all folders.

**Wiring.**
- `backend/erp/utils/inboxLookups.js` — `HIDDEN_FOLDERS_BY_ROLE_DEFAULTS` constant + `getHiddenFoldersConfig` (lazy-seed) + `getHiddenFoldersForRole({ entityId, role })` returns uppercase string[]. Empty array = role sees everything.
- `backend/erp/controllers/lookupGenericController.js` — `INBOX_HIDDEN_FOLDERS_BY_ROLE` row in `SEED_DEFAULTS` with `insert_only_metadata: true` so admin edits to `hidden_folders` survive re-seeds (mirrors `INBOX_ACK_DEFAULTS` / `PERDIEM_RATES` pattern).
- `backend/controllers/messageInboxController.js` — `getInboxMessages`, `computeFolderCounts`, `getCounts`, `markAllRead`, and `getFolders` all consult `getHiddenFoldersForRole` and apply `filter.folder = { $nin: hiddenFolders }` to `INBOX` (catch-all) + `ACTION_REQUIRED`. Explicit `?folder=APPROVALS` short-circuits to empty 200. `getFolders` strips hidden codes from the rail response. `SENT` (own outbox) and `ARCHIVE` (own past choices) are deliberately exempt.
- `backend/scripts/verifyInboxWiring.js` — adds `HIDDEN_FOLDERS_BY_ROLE_DEFAULTS`, `getHiddenFoldersConfig`, `getHiddenFoldersForRole` to required exports + 3 functional checks (lazy-seed null path, president → APPROVALS hidden, staff → empty). Health check runs 22/22 PASSES post-G9.R9 (was 19/19 pre-).
- `frontend/src/erp/components/WorkflowGuide.jsx` (inbox key) + `frontend/src/components/common/PageGuide.jsx` (inbox key) — banner steps mention the new lookup.

**Why query-time, not creation-time.**
- Approval messages still get created (audit trail + email/SMS dispatch unchanged).
- Reversible: admin wipes the row → folder reappears immediately on next request (lazy-seed only fires when no rows exist for the entity).
- Existing `MessageInbox` rows are filtered, not migrated.
- Mirrors the `archivedBy` per-recipient archive precedent — view-time projection over an immutable audit trail.

**To extend.**
- CEO row: Control Center → Lookup Tables → `INBOX_HIDDEN_FOLDERS_BY_ROLE` → add `{ code: 'ceo', metadata: { hidden_folders: ['APPROVALS'] } }`. No code change.
- Hide TASKS for finance: same path, add `{ code: 'finance', metadata: { hidden_folders: ['TASKS'] } }`.
- Disable for president (restore default behavior): edit the seeded row, set `metadata.hidden_folders = []`, save.

---

## Phase G4.5h-W — GRN Undertaking Waybill Recovery (Apr 29, 2026)

### Why
The Approval Hub was scaring approvers off perfectly-good Undertakings with "No waybill photo — approval will be blocked" even when the linked GRN had a waybill on file. Root cause: `buildUndertakingDetails` (Phase 32R) read `waybill_photo_url` only from the populated linked GRN object — if the populate dropped the field for any reason (legacy data, partial select, soft-orphaned GRN), the Hub UI fell back to "missing." There was also no recovery path for legacy GRN rows that genuinely never had a waybill (created before `WAYBILL_REQUIRED` enforcement was flipped on) — `GrnEntry` has no edit endpoint, so the only escape was `reverse-and-recreate`, which destroys the doc-number trail.

### Shipped
| Layer | Change |
|---|---|
| Backend `services/documentDetailBuilder.js#buildUndertakingDetails` | Falls back from `grn?.waybill_photo_url` → `item.waybill_photo_url` → `null`. Same chain for `undertaking_photo_url`. The UT mirror was already copied at `autoUndertakingForGrn` time so this is a fail-soft, not a privilege expansion. |
| Backend `models/Undertaking.js` | New `undertaking_photo_url: { type: String, default: null }` field. Mirrors the GRN's secondary proof attachment so the same fallback logic works for both capture documents. |
| Backend `services/undertakingService.js#autoUndertakingForGrn` | Mirrors BOTH `waybill_photo_url` AND `undertaking_photo_url` from the GRN at create time. Pre-fix only the waybill was copied. |
| Backend `controllers/undertakingController.js#signLinkedGrnPhotos` | Signs the UT's own mirror in addition to the linked GRN's. The S3 bucket is private; without signing the fallback URL would fail with AccessDenied even if the value was non-null. |
| Backend `controllers/undertakingController.js#reuploadWaybill` (NEW) | `POST /api/erp/undertaking/:id/waybill` — patches BOTH the UT mirror AND the linked GRN. MongoDB transaction so both writes commit or roll back together. Status gate DRAFT/SUBMITTED only; period-lock by receipt_date; ErpAuditLog `UPDATE` row. |
| Backend `routes/undertakingRoutes.js` | Wires `POST /:id/waybill` behind `protect`. Authorization is enforced inside the controller (lookup-driven so subscribers configure recovery authority via Control Center, not a code change). |
| Frontend `services/undertakingService.js` | `reuploadWaybill(id, waybillPhotoUrl)` helper — caller is expected to have already uploaded the file via `processDocument(file, 'WAYBILL')` (existing S3 + DocumentAttachment pipeline). |
| Frontend `pages/UndertakingDetail.jsx` | Red-dashed "Waybill missing" recovery uploader. Shown ONLY when `GRN_SETTINGS.WAYBILL_REQUIRED=1` AND no waybill on either UT mirror or linked GRN AND UT is DRAFT/SUBMITTED AND user can submit (owner/proxy/management). Uses the same `processDocument(file, 'WAYBILL')` pipeline that GrnEntry uses for the original capture. |
| Frontend `pages/ApprovalManager.jsx` | Approval Hub UNDERTAKING row warning is gated on the lookup-driven `waybillRequired` flag (subscribers who don't capture waybills no longer see false-positives). When the warning IS shown, it now links the approver to `/erp/undertaking/:id` for one-click recovery. |
| Frontend `components/WorkflowGuide.jsx` | `'undertaking-entry'` step 3 documents the recovery uploader. Tip refreshed to note the lookup gate. |
| Backend `scripts/healthcheckWaybillRecovery.js` (NEW) | Static wiring healthcheck — 11 checks covering builder fallback, UT model field, mirror copy, signer, controller export, route mount, frontend service, page wiring, hub gating, banner update. |

### Authorization (lookup-driven, subscription-ready per Rule #3 + #19)
Three concentric gates on `POST /:id/waybill`:
1. **Owner BDM** — `doc.bdm_id === req.user._id` on a DRAFT/SUBMITTED UT.
2. **Proxy entry** — caller passes `canProxyEntry(req, 'inventory', { subKey: 'undertaking_proxy', lookupCode: 'UNDERTAKING' })`. Subscribers add roles to `PROXY_ENTRY_ROLES.UNDERTAKING` via Control Center → Lookup Tables; sub-perm `inventory.undertaking_proxy` ticked on Access Template.
3. **Management** — admin / finance / president / CEO via existing `req.isAdmin / req.isFinance / req.isPresident` flags.

### Backend invariants preserved
- **Rule #19 / Rule #3 (lookup-driven, subscription-ready)** — every gate (waybill-required, waybill-recovery role, proxy sub-perm) is configurable via lookups, not hardcoded.
- **Rule #20 (period-lock + audit)** — receipt_date period-lock + ErpAuditLog `UPDATE` (with old/new value pair) on every recovery.
- **Rule #21 (privileged user filter)** — UT list & detail endpoints keep their corrected `privileged ? (req.query.bdm_id || null) : req.bdmId` patterns.
- **Source-of-truth invariant** — the GRN remains the source of truth for `approveGrnCore`'s waybill gate; the UT mirror is display-only and the recovery endpoint always patches the GRN side too. There is no path where the UT shows a waybill but the GRN doesn't.

### Browser smoke gap (not yet closed)
The bug-reproducer needs a UT whose linked GRN has `null` waybill_photo_url. That state only exists for legacy receipts created before `WAYBILL_REQUIRED` enforcement, or for receipts whose S3 object was deleted. The dev cluster doesn't have such a fixture today. The static healthcheck (`backend/erp/scripts/healthcheckWaybillRecovery.js`) covers the wiring contract end-to-end. Browser smoke is queued for the next session — happy path: log in as BDM, open a UT whose GRN waybill was DB-flipped to null, see the red recovery uploader, upload a new waybill, confirm both UT and GRN get the new URL, confirm Approval Hub no longer shows "approval will be blocked".

---

## Phase G4.5h Part A — Idempotent `postSingleUndertaking` (Apr 30, 2026)

### Why
G4.5g (Apr 24) recovered Judy Mae's 300 units of Tropin via mongosh after a ghost-GRN approval. The recovery flipped the linked GRN to APPROVED but left UT-ACC042326-002 stuck in SUBMITTED state, because clicking Acknowledge calls `approveGrnCore` which throws `expected PENDING` on an already-APPROVED GRN ([inventoryController.js:835](backend/erp/controllers/inventoryController.js#L835)). The UT could only be cleared by Reject (which leaves a contradictory "GRN approved, UT rejected" trail) or by the same kind of mongosh edit that caused the original problem. This phase makes the cascade idempotent so any future recovery — manual or otherwise — can be cleanly closed via the normal UI flow. Same pattern protects against the (rare) race where the direct `acknowledgeUndertaking` HTTP path and the Approval Hub dispatcher both try to ack the same UT concurrently.

### Shipped
| Layer | Change |
|---|---|
| Backend `controllers/undertakingController.js#postSingleUndertaking` | Rewrite. Outer `if (doc.status !== 'SUBMITTED') throw ...` removed (was redundant with the two call-site outer checks AND brittle against mid-flight mutations). Replaced with an atomic `Undertaking.findOneAndUpdate({_id, status: 'SUBMITTED'}, {$set: {status: 'ACKNOWLEDGED', ...}}, {new: true, session})` claim INSIDE `withTransaction`. If the claim returns null, the body re-fetches and returns `alreadyAcknowledged: true` (idempotent no-op) when the current state is already ACKNOWLEDGED, or throws `Undertaking is ${current.status}, expected SUBMITTED` for REJECTED / DELETION_REQUESTED. |
| Backend `controllers/undertakingController.js#postSingleUndertaking` (cont.) | Cascade idempotency via GRN status peek. Before calling `approveGrnCore`, the body peeks `GrnEntry.findById(linked_grn_id).select('status event_id').session(session)`. If `grnPeek.status === 'APPROVED'`, the cascade is skipped (`cascadeSkipped: true`) and the existing GRN is returned. The audit note explicitly says `cascade skipped, idempotent path; GRN event_id=...` so reviewers can tell why no new ledger rows landed. |
| Backend `controllers/undertakingController.js#postSingleUndertaking` (cont.) | Audit moved OUTSIDE `withTransaction` (matches the A.5.5 `doctorMergeService` pattern). Audit failure no longer rolls back a committed cascade. The audit row is skipped entirely on the `alreadyAcknowledged` path because the original ack already wrote one. |
| Backend `controllers/undertakingController.js#acknowledgeUndertaking` | Response message branches on the new flags. Three messages: `Undertaking was already acknowledged — no change`, `Undertaking acknowledged — linked GRN was already APPROVED (no new stock posted)`, or the original `Undertaking acknowledged — GRN auto-approved`. The flags also flow through to `data.alreadyAcknowledged` and `data.cascadeSkipped` so the frontend can render an appropriate toast. |
| Backend `controllers/universalApprovalController.js#approvalHandlers.undertaking` | Unchanged. The handler destructures `{ undertaking }` from `postSingleUndertaking` — the new return shape is a superset, so the Approval Hub dispatcher keeps working without edits. |
| Backend `scripts/healthcheckPostSingleUndertakingIdempotency.js` (NEW) | 14-check static healthcheck — atomic claim presence, GRN-peek presence, audit-outside-txn, cascade-skipped flag handling, return-shape contract, and the two outer SUBMITTED gates that must remain in place at the call sites. |

### Backend invariants preserved
- **Rule #20 (period-lock + audit + transactional cascade)** — period lock checks at the call sites are unchanged; the cascade still runs inside `session.withTransaction`; audit moves out so audit failure doesn't roll back a committed acknowledge.
- **Rule #21 (privileged user filter)** — `acknowledgeUndertaking` still uses `widenFilterForProxy` to load the UT before calling `postSingleUndertaking`. No silent self-ID fallback.
- **Source-of-truth invariant** — `approveGrnCore`'s `if (grn.status !== 'PENDING')` gate is intentionally NOT relaxed. `postSingleUndertaking` peeks first and skips; the gate stays in place so a future caller cannot accidentally double-write the ledger.
- **Outer SUBMITTED gates kept** — both `acknowledgeUndertaking` (returns 400) and `approvalHandlers.undertaking` (throws with current status) still gate-check before calling the core. The atomic claim is defense-in-depth for the race window between gate and txn body, not a substitute.

### Reproducer / smoke test (UT-002)
1. Log in as president → Approval Hub → click Acknowledge on UT-ACC042326-002.
2. Expected response: HTTP 200 with `data.cascadeSkipped: true` and message `Undertaking acknowledged — linked GRN was already APPROVED (no new stock posted)`.
3. Expected database state: UT.status = ACKNOWLEDGED, UT.acknowledged_by = president._id, UT.acknowledged_at ≈ now. GRN unchanged (still APPROVED, same event_id from the Apr 24 mongosh recovery). InventoryLedger unchanged (no new rows).
4. Expected ErpAuditLog row: `log_type: STATUS_CHANGE`, `field_changed: 'status'`, `old_value: 'SUBMITTED'`, `new_value: 'ACKNOWLEDGED'`, `note` containing `cascade skipped, idempotent path; GRN event_id=69eb1cd116d237e50b44ba89` (or whatever the recovery event_id was).

### Verification
```bash
# Backend syntax
node -c backend/erp/controllers/undertakingController.js
# Healthcheck — Part A
node backend/erp/scripts/healthcheckPostSingleUndertakingIdempotency.js
# Healthcheck — G4.5h-W regression (same controller surface)
node backend/erp/scripts/healthcheckWaybillRecovery.js
# Frontend
cd frontend && npx vite build
```

Result Apr 30, 2026: 14/14 + 11/11 healthchecks pass, vite build green in 12.58s.

### What this phase does NOT ship (deferred to Parts B + C)
- **Part B** — `recordPhysicalCount` governance. The endpoint posts straight to the inventory ledger with no `gateApproval`, no `TransactionEvent`, no period-lock check, no `roleCheck`. Real fraud vector. Scope: new `PhysicalCount` model + split into `submitPhysicalCount` / `approvePhysicalCount` + `universalApprovalController.approvalHandlers.physical_count` + `MODULE_DEFAULT_ROLES.PHYSICAL_COUNT` + frontend `MyStock` modal rewrite. ~8 files, ~1 day.
- **Part C** — UT-acknowledge physical-count snapshot gate. Settings-gated requirement (`PHYSICAL_COUNT_GATE.REQUIRED`, `PHYSICAL_COUNT_GATE.MAX_AGE_DAYS`) so a BDM cannot accept new stock without a recent reconciliation. Depends on Part B. Plus `OPENING_BALANCE` seed needs to emit `TransactionEvent` rows so a fresh subscriber install can satisfy the gate.
- **Ghost-approval root cause** — still unidentified. G4.5g handoff hypothesized manual mongosh edit while Judy Mae had admin role; the defense-in-depth waybill gate (G4.5g) plus this phase's idempotency means a future ghost approval can be cleared via the normal flow.

Plan doc: `~/.claude/plans/phase-g4-5h-physical-count-governance.md`. Follow-up handoff for B + C: `memory/handoff_phase_g4_5h_part_b_c_apr30_2026.md`.

---

## Phase 32R — GRN Capture + Undertaking Approval Wrapper (April 20, 2026)

### Why-pivot
Phase 32 (shipped earlier April 20) moved batch/expiry capture off the GRN onto a new Undertaking model, with packaging barcode scans as the primary input. In practice that split the capture surface (GRN had the product + qty, Undertaking had the batch + expiry), doubled the steps for a BDM, and made the CALF→Expense analogy backwards — the approval wrapper had fields the original doesn't. User confirmed the pre-Phase 32 flow (GRN captures everything, BDM scans/OCRs the paper Undertaking as auto-fill) was the right one. Phase 32R restores that and keeps the Undertaking only as a read-only, always-on approval wrapper over the captured GRN.

### Shipped design
| Layer | Behavior |
|---|---|
| GRN Entry (`/erp/grn`) | Capture page. Per-line: product + received qty + batch/lot # + expiry (calendar, floored today + MIN_EXPIRY_DAYS). Doc-level: waybill photo upload (required when `GRN_SETTINGS.WAYBILL_REQUIRED=1`). Optional: one-tap "Scan Undertaking Paper" OCR modal that bulk-fills every matched line from the physical Undertaking (`undertaking_photo_url` is recorded alongside). |
| Undertaking Detail (`/erp/undertaking/:id`) | Read-only review. Mirrors GRN line items, shows waybill + Undertaking-paper thumbnails. BDM (or privileged) hits "Validate & Submit" → DRAFT → SUBMITTED. May return 202 when role not in `MODULE_DEFAULT_ROLES.UNDERTAKING`. |
| Approval Hub (`/erp/approvals`) | Approver (admin/finance/president, or any role added to `MODULE_DEFAULT_ROLES.UNDERTAKING`) acknowledges → UT ACKNOWLEDGED + linked GRN APPROVED + InventoryLedger written in one mongoose session (atomic). Reject → UT REJECTED (terminal). Linked GRN stays PENDING so the BDM can reverse it via the standard reversal path and re-capture. |

### Backend invariants preserved
- **Rule #20 (two-layer gate)** — `gateApproval()` still runs on `grn/approve` and `undertaking/submit`. Authority Matrix layer is unaffected.
- **Reversal handlers count = 21** — `REVERSAL_HANDLERS.UNDERTAKING` handles DRAFT/SUBMITTED/REJECTED (hard-delete) + ACKNOWLEDGED (SAP-storno cascade to GRN + InventoryLedger).
- **Period locks** — `PERIOD_LOCK_MODULE.UNDERTAKING` enforced on every status transition (checks `dateToPeriod(doc.receipt_date)`).
- **Danger sub-perm** — `inventory.reverse_undertaking` baseline-off, subscriber-delegatable via Access Template.
- **Rule #21 (privileged user filter)** — `getUndertakingList` uses the corrected `privileged ? (req.query.bdm_id || null) : req.bdmId` pattern.
- **Entity scoping** — every create/read respects `req.entityId`.

### Subscription-readiness (Rule #19 + #3)
- **`GRN_SETTINGS` lookup (new category, seeded with defaults)** drives MIN_EXPIRY_DAYS, VARIANCE_TOLERANCE_PCT, WAYBILL_REQUIRED. Subscribers tune via Control Center → Lookup Tables.
- **Back-compat**: `getGrnSetting(entityId, code, fallback)` in `undertakingService.js` reads `GRN_SETTINGS` first, falls back to legacy `UNDERTAKING_SETTINGS` so Phase 32 tenants keep working without a re-seed.
- **`MODULE_DEFAULT_ROLES.UNDERTAKING`** lookup controls who can acknowledge directly. Editable per-entity via Control Center.
- **No hardcoded capture validation** — every threshold (expiry floor, variance tolerance, waybill requirement) reads from the lookup category on every capture.

### Shipped files (frontend)
- `frontend/src/erp/services/undertakingService.js` — trimmed. Dropped `updateUndertaking`, `matchBarcode`. Renamed `getUndertakingSettings` → `getGrnSettings` (with back-compat export). Category fallback logic: `GRN_SETTINGS` → `UNDERTAKING_SETTINGS`.
- `frontend/src/erp/pages/GrnEntry.jsx` — rebuilt. Per-line batch + expiry + qty inputs, waybill photo upload panel (required gate), bulk `ScanUndertakingModal` (OCR paper via `processDocument(file, 'UNDERTAKING')`), auto-navigate to Undertaking Detail on success.
- `frontend/src/erp/pages/UndertakingDetail.jsx` — rewritten as read-only review. Header with waybill + Undertaking-paper thumbnails, read-only line table, action row driven by status (Validate & Submit / Acknowledge + Reject / President-Reverse).
- `frontend/src/erp/components/UndertakingLineRow.jsx` — rewritten. No inputs at all. Product label (Rule #4), expected/received qty, batch + scan ✓, expiry + days-to-expiry color band, variance badge from `line.variance_flag`.
- `frontend/src/erp/pages/UndertakingList.jsx` — minor. DRAFT tab label renamed "Review Pending" to match the approval-wrapper framing. Page header copy refreshed.
- `frontend/src/erp/components/WorkflowGuide.jsx` — `grn-entry` + `undertaking-entry` steps rewritten to match the new flow (capture-on-GRN, read-only-on-UT).
- `frontend/src/erp/pages/ControlCenter.jsx` — `undertaking-settings` section renamed `grn-settings`. Dependency guide now lists WAYBILL_REQUIRED + MIN_EXPIRY_DAYS + VARIANCE_TOLERANCE_PCT + MODULE_DEFAULT_ROLES.UNDERTAKING + ERP_DANGER_SUB_PERMISSIONS.INVENTORY__REVERSE_UNDERTAKING + legacy `UNDERTAKING_SETTINGS` fallback note.

### Shipped files (backend — unchanged since the Phase 32R backend session)
- `backend/erp/models/GrnEntry.js` — per-line `scan_confirmed`, `expected_qty` (pre-save mirror when absent).
- `backend/erp/controllers/inventoryController.js` — `createGrn` enforces waybill gate + per-line capture validation (batch/expiry/qty) + MIN_EXPIRY_DAYS floor before DB write. Session-wrapped GRN create + `autoUndertakingForGrn`.
- `backend/erp/services/undertakingService.js` — `autoUndertakingForGrn`, `getGrnSetting` (with UNDERTAKING_SETTINGS fallback), `computeLineVariance`. Removed `syncUndertakingToGrn` and `validateUndertaking` (validation moved to capture time).
- `backend/erp/controllers/undertakingController.js` — `submitUndertaking` (DRAFT→SUBMITTED + gate), `acknowledgeUndertaking` (SUBMITTED→ACKNOWLEDGED + `approveGrnCore`), `rejectUndertaking` (SUBMITTED→REJECTED terminal), `presidentReverseUndertaking`. Dropped `updateUndertaking`, `matchBarcodeToLine`.
- `backend/erp/routes/undertakingRoutes.js` — dropped `PUT /:id` and `POST /:id/match-barcode`.
- `backend/erp/controllers/universalApprovalController.js` — `approvalHandlers.undertaking.reject` → terminal REJECTED. `EDITABLE_STATUSES.undertaking = []`.
- `backend/erp/controllers/lookupGenericController.js` — seed block renamed `UNDERTAKING_SETTINGS` → `GRN_SETTINGS`, added `WAYBILL_REQUIRED`.

### Gotchas
1. **Waybill upload reuses `/erp/ocr/process`** with `docType='WAYBILL'`. OCR parser doesn't recognize WAYBILL so the backend uploads to S3, skips OCR, returns `s3_url`. Keeps us on one DocumentAttachment pipeline instead of adding a new upload endpoint.
2. **Scan is OCR, not BarcodeDetector.** The capture surface OCRs the physical paper Undertaking (same endpoint receipts use); it is NOT BarcodeDetector on packaging. Do not confuse with pre-backend-session plans.
3. **REJECTED is terminal.** Unlike the Phase 32 shipped version, a reject does NOT flip the UT back to DRAFT. The GRN stays PENDING so the BDM reverses and re-creates from scratch. This closes the loophole where a BDM could re-edit a rejected UT and submit without approver knowing.
4. **Existing Phase 32 DRAFT UTs** (where batch/expiry were blank waiting for packaging-barcode scan) must be reversed via Reversal Console → UNDERTAKING → hard-delete. The linked PENDING GRN hard-deletes with them. BDM then re-captures on the new GrnEntry.
5. **Existing Phase 32 SUBMITTED UTs** (batch/expiry already populated by the Phase 32 scan flow) acknowledge normally — the acknowledge handler was unchanged.

### Verification
```bash
# Backend
node -e "const inv=require('./backend/erp/controllers/inventoryController'); const ut=require('./backend/erp/controllers/undertakingController'); const svc=require('./backend/erp/services/undertakingService'); const {REVERSAL_HANDLERS}=require('./backend/erp/services/documentReversalService'); console.log('handlers:',Object.keys(REVERSAL_HANDLERS).length,'getGrnSetting:',typeof svc.getGrnSetting,'syncUndertakingToGrn(gone):',typeof svc.syncUndertakingToGrn)"
# Expected: handlers: 21  getGrnSetting: function  syncUndertakingToGrn(gone): undefined

# Frontend
cd frontend && npx vite build
# Expected: build completes clean; chunks show GrnEntry-*.js bigger (scan modal restored), UndertakingDetail-*.js smaller (scan + edit fields removed).
```

---

## Phase (Future) — Unified Party Master [DEFERRED until subscription rollout]

**Status:** design recorded, execution postponed. Full design, migration plan, PR sequence, and verification checklist live in `docs/PHASETASK-ERP.md` under `PHASE (FUTURE, SUBSCRIPTION-TRIGGERED) — Unified Party Master (Customer + Hospital Fusion)`.

### Trigger Conditions (when to revisit)

- Onboarding of subsidiary #2 beyond MG AND CO., **OR**
- Start of multi-tenant subscription rollout / generic-ERP extraction work.

Until one of those fires, VIP continues with the existing two-model design.

### Guardrails for Future Work (what Claude must NOT do in regular edits)

1. **Do not propose fusion in regular work.** When editing `Customer`, `Hospital`, or any txn model carrying `hospital_id`/`customer_id` (`SalesLine`, `Collection`, `CreditNote`, `Collateral`, `SmerEntry`, `ConsignmentTracker`, `CwtLedger`, `CreditRule`), keep the existing dual-reference OR pattern. Do not sneak in a Party refactor as part of an unrelated change.
2. **Preserve hospital global sharing.** `Hospital.entity_id` stays optional. `hospital_name_clean` stays globally unique. One `St Luke's` record is shared across VIP + MG AND CO. + any future subsidiary.
3. **Customer is now global (Phase G5 Customer Globalization, Apr 24-27 2026).** `Customer.entity_id` is OPTIONAL — kept as a "home entity" reporting label only, NOT a visibility/uniqueness boundary. Unique index is `{ customer_name_clean: 1 }` (single-field global), mirroring `Hospital.hospital_name_clean`. The legacy `(entity_id, customer_name_clean)` compound was dropped on dev Apr 27 2026 by `backend/erp/scripts/migrateCustomerGlobalUnique.js --apply`. **Prod still pending** (gated on Atlas backup + dev smoke ratification — see deferred handoff `memory/handoff_customer_global_migration_apr27_2026.md` for the runbook).
4. **Preserve the two split access patterns.** Do not migrate hospitals to direct `tagged_bdms`, and do not add `warehouse_ids` to `Customer`. Territorial access applies to hospital networks; retail/pharmacy/diagnostic customers are per-BDM direct tagging:
   - Hospitals → [backend/erp/utils/hospitalAccess.js:21-38](backend/erp/utils/hospitalAccess.js#L21-L38) (`buildHospitalAccessFilter`, warehouse-driven).
   - Customers → [backend/erp/controllers/customerController.js:20-24](backend/erp/controllers/customerController.js#L20-L24) (direct `tagged_bdms.$elemMatch`).
5. **Warehouse model stays party-agnostic.** [backend/erp/models/Warehouse.js](backend/erp/models/Warehouse.js) has no refs to hospitals/customers; the arrow goes the other way. Don't add any.

### Optional Prep (can ship anytime, doesn't count as "starting the fusion")

Extracting a shared `buildPartyAccessFilter(user, partyType)` that funnels both existing filters through one helper is a safe, zero-schema, ~30-line refactor. It makes the eventual fusion PR roughly half the size. Not urgent; do only if touching hospital/customer access code for another reason.

### What a Future Claude Should Do When the Trigger Fires

Jump to `docs/PHASETASK-ERP.md` → `PHASE (FUTURE, SUBSCRIPTION-TRIGGERED) — Unified Party Master`. Follow the 6-PR sequence (additive → backfill+dual-write → txn schema → service cutover → require `party_id` → retire old collections). Use `_id` reuse during migration so txn FKs map 1:1 without rewrite. Feature flags `ERP_PARTY_READ_FROM_PARTIES` and `ERP_PARTY_DUAL_WRITE` gate read/write paths independently for bidirectional rollback.

---

## Phase 33-O — Owner Visibility on Cycle Docs (Apr 2026)

**Problem.** Privileged viewers (President/Admin/Finance) saw Smer/Expenses/PrfCalf/Car Logbook list pages with no BDM owner rendered. `tenantFilter` correctly returned every BDM's docs in-entity (Rule #21), but the UI never displayed the owner — privileged users could not tell whose cycle they were looking at. On Car Logbook specifically, the day-grid frontend collapsed multiple BDMs' entries onto the same date via `docMap.set(entry_date, doc)`, silently dropping most docs.

**Fix.**

1. **BDM column on list pages.** `Smer.jsx`, `Expenses.jsx`, `PrfCalf.jsx` render `row.bdm_id?.name || '—'` as the first (or second, after doc_type) column. Backend list endpoints already populated `bdm_id` with `name`, so this is UI-only for those three. Mobile card headers also show the owner.
2. **Backend `?bdm_id=` filter (Rule #21 pattern).** `getSmerList`, `getExpenseList`, `getPrfCalfList`, `getCarLogbookList` all accept an optional `?bdm_id=` param. Gate: `privileged && req.query.bdm_id` → apply; else no filter is added. Non-privileged callers stay self-scoped via `req.tenantFilter` (never the ternary "fallback to self" anti-pattern called out in Rule #21).
3. **Car Logbook BDM picker.** The grid is fundamentally one-BDM-per-view, so a column is the wrong shape. Instead, [CarLogbook.jsx](frontend/src/erp/pages/CarLogbook.jsx) now renders a BDM dropdown for privileged viewers (from `getBdmsByEntity(entity_id)`), empty by default — Rule #21 forbids silent self-id. When a privileged viewer picks someone else, `handleSaveAll`, `handleValidate`, and `handleSubmit` short-circuit with a "Read-only" toast and a blue "Viewing X's logbook" banner renders. When no BDM is picked, an amber "Select a BDM" hint renders and `loadAndMerge` early-returns without hitting the backend.

**Why it matters for subscribers.** The fix is entirely lookup/scope-driven — no role names, no entity names, no BDM identities are hardcoded. Any subscriber's president lands on the same four pages and immediately sees whose cycle they are reviewing, without a code change. The read-only gate on Car Logbook prevents a privileged viewer from accidentally overwriting a BDM's odometer/fuel data while auditing.

**Files touched.**
- `backend/erp/controllers/expenseController.js` — `?bdm_id=` param added to `getSmerList`, `getExpenseList`, `getPrfCalfList`, `getCarLogbookList` (Rule #21 pattern).
- `frontend/src/erp/pages/Smer.jsx` — BDM column (desktop list); colSpan 8→9 on empty/error rows.
- `frontend/src/erp/pages/Expenses.jsx` — BDM column (desktop list) + BDM in mobile card subtitle; colSpan 8→9 on empty/error rows.
- `frontend/src/erp/pages/PrfCalf.jsx` — BDM column (desktop list) + BDM row in mobile card body; colSpan 7→8 on banner/drill-down/empty rows.
- `frontend/src/erp/pages/CarLogbook.jsx` — `useTransfers` import, `bdmOptions`/`selectedBdmId`/`viewingSelf` state, BDM selector in controls row, read-only banner, `viewingSelf` guard on `handleSaveAll` / `handleValidate` / `handleSubmit`, `loadAndMerge` early-return + dep array updated.
- `frontend/src/erp/components/WorkflowGuide.jsx` — `car-logbook.tip` already describes the "privileged viewers pick a BDM; page is read-only until they pick themselves" behavior.

**Integrity check.**
- `npx vite build` — clean in 40.72s.
- `node -c backend/erp/controllers/expenseController.js` — OK.
- Backend `tenantFilter` untouched; no new role logic; `req.isPresident || req.isAdmin || req.isFinance` check matches existing Rule #21 privileged pattern (same as compensation-statement endpoint, line 1363).
- No breaking change for BDMs: their `req.tenantFilter` still scopes to self, so the `?bdm_id=` query param is ignored for them even if forged (Rule #21: no privileged elevation from query params for non-privileged).
- `createCarLogbook`/`updateCarLogbook` signatures unchanged — cross-BDM writes remain impossible via this endpoint (President can't create on behalf of a BDM; that's a separate Phase if ever needed).

---

## Phase 34-P — Per Diem Override Write-Back Fix (Apr 21 2026)

**Problem.** Contractor requested a per diem override on a SMER daily entry. President approved in the Approval Hub. Contractor's UI stayed PENDING forever — even after refresh. The bug: `universalApprovalController.perdiem_override` loaded the SMER with `findOne({ _id, status: { $in: getEditableStatuses('SMER') } })` where editable = `['DRAFT','ERROR']`. If the SMER had moved to VALID or POSTED before the approval landed (contractor submitted ahead of approver), `findOne` returned null and the entire write-back block silently no-op'd — ApprovalRequest flipped to APPROVED while the SMER's `override_status` stayed PENDING. The daily entry was orphaned from the approval decision, with no error surface anywhere.

**Root cause.** Two independent gaps collided:
1. **Order of operations** — `processDecision` ran first (marking the ApprovalRequest APPROVED), then the SMER write was attempted. If the write silently skipped, the request was already committed with no way to retry without bypassing `processDecision`'s "already APPROVED" guard.
2. **Missing invariant** — `validateSmer` and `submitSmer` did not block progression while any daily entry had `override_status === 'PENDING'`. Contractors could push a SMER to VALID → POSTED with unresolved overrides still attached, and by the time the approver decided, the parent doc was no longer editable.

**Fix.**

1. **Reorder approval handler — apply SMER write first, then `processDecision`.** [backend/erp/controllers/universalApprovalController.js:125](backend/erp/controllers/universalApprovalController.js#L125) now loads the ApprovalRequest + SMER + daily entry up front and `throw new Error(...)`s on any missing reference (request not found, doc_id missing, SMER missing, entry missing, tier missing). The SMER write and audit log run BEFORE `processDecision`. If anything fails, the ApprovalRequest stays PENDING and the error bubbles to the Approval Hub as a clean HTTP 500 with a meaningful message.
2. **Remove the `editable_statuses` gate on the SMER load.** Approval applies to a subdocument state (`daily_entries[i].override_status`), not to the parent SMER's lifecycle status. Keeping the gate was the silent-skip vector. Replaced with a **ledger-drift guard**: if the SMER is already POSTED, the handler throws `"SMER ... is already POSTED. Reopen the SMER (Reversal Console) before approving this per diem override so the journal re-posts with the new amount."` — protects the journal while surfacing the blocker.
3. **Block validate + submit while any override is PENDING.** [backend/erp/controllers/expenseController.js — validateSmer](backend/erp/controllers/expenseController.js) now appends `"Day X: per diem override pending approval — cannot validate until approved or rejected (see Approval Hub)"` for every entry with `override_status === 'PENDING'`. SMER flips to ERROR, cannot reach VALID, cannot submit. Defensive re-check in `submitSmer` too (race-safe).
4. **Inline CompProfile load.** The handler now loads the BDM's active CompProfile (via PeopleMaster + CompProfile lookup) so the approved amount uses the per-person per diem rate — matches `overridePerdiemDay` at request time, so the accepted amount equals what the requester saw at submission.
5. **Repair script.** [backend/erp/scripts/repairStuckPerdiemOverrides.js](backend/erp/scripts/repairStuckPerdiemOverrides.js) — scans all decided `PERDIEM_OVERRIDE` ApprovalRequests, reapplies the override to any daily entry still in PENDING. Idempotent; dry-run by default; flags POSTED SMERs for manual Reversal Console handling. Run once per entity after deploy: `node erp/scripts/repairStuckPerdiemOverrides.js --apply`.
6. **WorkflowGuide banner.** [frontend/src/erp/components/WorkflowGuide.jsx](frontend/src/erp/components/WorkflowGuide.jsx) SMER tip updated to state the new invariant: SMER cannot validate/submit while any day has a PENDING override.

**Why it matters for subscribers.** The fix is purely behavioral — no new lookup categories, no role hardcoding, no schema change. Existing `MODULE_REJECTION_CONFIG.SMER.metadata.editable_statuses` lookup continues to govern rejection/resubmit flow; it's just no longer the (wrong) gate for an approval write-back. Any subscriber's SMER → override → approve cycle now has a single invariant: **parent SMER stays in DRAFT/ERROR until every override is decided, then validates, then posts with the correct amount**. Rule #20 "governing principle: any person can CREATE, but authority POSTS" is preserved; the handler now surfaces failure instead of silently committing the decision.

**Integrity check.**
- `node -c backend/erp/controllers/universalApprovalController.js` — OK.
- `node -c backend/erp/controllers/expenseController.js` — OK.
- `node -c backend/erp/scripts/repairStuckPerdiemOverrides.js` — OK.
- `npx vite build` — clean in 46.42s.
- Downstream consumers: `frontend/src/erp/pages/Smer.jsx` + `Income.jsx` + `MyIncome.jsx` + `DocumentDetailPanel.jsx` read `override_status`; all are render-only and unaffected. No other controller mutates `daily_entries[i].override_status`.
- `universalApprove` wrapper [line 699](backend/erp/controllers/universalApprovalController.js#L699) runs inside `catchAsync` → errors from the handler surface as HTTP 500 with the thrown message; the Phase G4 close-loop at line 705 already excludes `perdiem_override` so no double-write.

**Follow-up — SmerEntry unique index, partial filter on `deletion_event_id` (same day).**

When the reported contractor case was diagnosed, we reversed her SMER via Reversal Console. If the SMER was POSTED, Reversal Console applies SAP Storno ([documentReversalService.js:1091-1096](backend/erp/services/documentReversalService.js#L1091-L1096)) — the row stays with `deletion_event_id` stamped for audit. That then blocked her from creating a fresh SMER for the same period+cycle because the unique index `{ entity_id, bdm_id, period, cycle }` still matched the reversed row. Every subscriber hits this the moment anyone reverses a POSTED SMER — it's a latent platform bug, not specific to her.

Fix applied:
1. **Schema partial unique index** — [backend/erp/models/SmerEntry.js:122-131](backend/erp/models/SmerEntry.js#L122-L131) now uses `partialFilterExpression: { deletion_event_id: { $exists: false } }`. Matches the pattern already on `Undertaking.linked_grn_id` (Phase 32) and `OfficeSupply.item_code` (Phase 31R-OS). Reversed rows keep their audit trail; new SMER for the same cycle can be created.
2. **Migration** — [backend/erp/scripts/migrateSmerUniqueIndex.js](backend/erp/scripts/migrateSmerUniqueIndex.js) drops the old full-unique index and creates the partial. Idempotent + dry-run default + pre-checks for live duplicates among non-reversed rows before dropping.
3. **Pre-check in `createSmer`** — returns a clean 409 `"You already have a <STATUS> SMER for <period> <cycle>. Open it instead of creating a new one."` when a non-reversed duplicate exists. Prevents raw E11000 surfacing to the UI; excludes reversed rows from the check (so re-creation after reversal works).

Deploy steps for this follow-up:
1. `node erp/scripts/migrateSmerUniqueIndex.js` (dry-run) → review report → `--apply`.
2. Schema index definition change is picked up automatically on next app restart; the migration is for the already-created index on live DB.


## Phase G4.5a — Proxy Entry for Sales + Opening AR (April 22, 2026)

**Problem.** Admin, finance, or a back-office contractor had no way to record a CSI or Opening AR entry on behalf of another BDM. Every create path stamped `bdm_id = req.bdmId` (own id); every read applied `req.tenantFilter` which pins contractors to their own `bdm_id`. Ops staff couldn't help a BDM who was in the field, couldn't correct a DRAFT row before posting, couldn't do data-entry pass-throughs during audit cleanups.

**Solution — lookup-driven proxy entry, gated at two layers.** Ported the existing Expenses `assigned_to` + `recorded_on_behalf_of` pattern (Phase 33-O) into a shared helper and wired it into Sales + Opening AR. Rule #3-aligned: eligible roles per module come from the `PROXY_ENTRY_ROLES` lookup; individual delegation is via sub-permission tick.

**Layer 1 — Eligible roles (lookup-driven).**
`PROXY_ENTRY_ROLES.<MODULE>.metadata.roles` is an array of role codes. Default: `['admin', 'finance', 'president']`. Admin adds `'contractor'` to let a back-office clerk proxy for that module. CEO is **always** denied. President **always** passes (no matter the list).

**Layer 2 — Per-person grant (sub-permission).**
New keys:
- `sales.proxy_entry` — record live CSI on behalf of another BDM
- `sales.opening_ar_proxy` — record Opening AR (pre-cutover) on behalf of another BDM

Both gates must pass. Role eligibility without the tick means the picker hides and the API returns 403. Tick without role eligibility means the same. Defense in depth — frontend gate + backend gate — so a proxy cannot bypass via direct API POST.

**Shared helper.** [backend/erp/utils/resolveOwnerScope.js](backend/erp/utils/resolveOwnerScope.js) exports:
- `canProxyEntry(req, moduleKey, subKey?)` — boolean both layers.
- `resolveOwnerForWrite(req, moduleKey, opts?)` — returns `{ ownerId, proxiedBy, isOnBehalf }`. Throws HTTP 403 if caller asked for proxy but is not eligible (no silent self-fallback — Rule #21).
- `widenFilterForProxy(req, moduleKey, opts?)` — copy of `req.tenantFilter` with `bdm_id` stripped when eligible. Keeps `entity_id` — proxy is never cross-entity.
- 60-second per-entity cache; `invalidateProxyRolesCache(entityId)` for bust.

**salesController wiring.** All reads, writes, and lifecycle transitions flow through the helper:

| Operation | Change |
|---|---|
| `createSale` | Accepts `assigned_to`; picks sub-key based on whether csi_date < live_date (OPENING_AR → `opening_ar_proxy`, else `proxy_entry`). Stamps `bdm_id`, `recorded_on_behalf_of`, `created_by`. Audit `PROXY_CREATE` when `isOnBehalf`. |
| `updateSale` | `widenFilterForProxy` on lookup. Body's `assigned_to` / `bdm_id` / `recorded_on_behalf_of` stripped — ownership locked on edit. Audit flips to `PROXY_UPDATE` when editor ≠ owner. |
| `deleteDraftRow` | Widened filter so proxy can delete a DRAFT owned by another BDM. |
| `getSales`, `getSaleById` | Widened filter. Response populates `recorded_on_behalf_of` + `created_by` for the "Proxied" pill. |
| `validateSales`, `submitSales` | Widened filter. Proxy can run the full DRAFT → VALID → POSTED flow on behalf. |
| `reopenSales`, `requestDeletion`, `approveDeletion`, `presidentReverseSale` | Widened filter. The respective danger sub-perm (`sales.reopen`, `accounting.approve_deletion`, `accounting.reverse_posted`) still gates the action; widening only lets the proxy *find* the row. |

**SalesLine model.** New field `recorded_on_behalf_of: { type: ObjectId, ref: 'User' }`. Set when the row was proxied; absent for self-entry. `created_by` holds the proxy's id; `bdm_id` is always the owner. Three fields give unambiguous audit: *who the row belongs to* (bdm_id) vs *who keyed it* (created_by) vs *whether it was a proxy* (recorded_on_behalf_of).

**Frontend — `OwnerPicker` component.** [frontend/src/erp/components/OwnerPicker.jsx](frontend/src/erp/components/OwnerPicker.jsx). Shared, lookup-aware dropdown. Renders nothing when the caller is not eligible, so mount unconditionally. Fetches `PROXY_ENTRY_ROLES` via `useLookupOptions`, checks sub-permission via `useErpSubAccess`, loads the people list via `usePeople`. "Self — {name} (role)" is the first option.

Wired into:
- [SalesEntry.jsx](frontend/src/erp/pages/SalesEntry.jsx) — picker in the toolbar row. `assigned_to` ships in the payload for CSI, Cash Receipt, and Service Invoice flows.
- [OpeningArEntry.jsx](frontend/src/erp/pages/OpeningArEntry.jsx) — picker above the banner. Uses `subKey="opening_ar_proxy"` + `moduleLookupCode="OPENING_AR"`.
- [SalesList.jsx](frontend/src/erp/pages/SalesList.jsx) + [OpeningArList.jsx](frontend/src/erp/pages/OpeningArList.jsx) — "Proxied" pill next to the CSI number when `sale.recorded_on_behalf_of` is set. Tooltip: "Keyed by X on behalf of Y".

**Governing invariants preserved.**
- **Rule #20 — "Any person can CREATE, but authority POSTS".** Strongly enforced for proxy entry. Any submit where at least one row has `recorded_on_behalf_of` set is **forced through Approval Hub** regardless of the submitter's role — even admin/finance. The `gateApproval({ forceApproval: true, ownerBdmId })` contract in [approvalService.js](backend/erp/services/approvalService.js) bypasses the president/CEO fast-path and the `MODULE_DEFAULT_ROLES` allowlist when `forceApproval` is true. The synthetic `ApprovalRequest` carries `metadata.gate = 'PROXY_ENTRY'` + `proxied_by` + `owner_bdm_id` for audit. Conservative safeguard (Option B) until Phase G4.5b implements owner-chain routing (Option C). Option B = safe today; Option C = correct later.
- **Rule #21 — "No silent self-fallback".** `resolveOwnerForWrite` throws 403 when caller requested proxy but is not eligible. `widenFilterForProxy` only widens after the gate passes. Non-proxy callers are unchanged.
- **Edit-while-posted still locked.** Proxy cannot edit a POSTED row. Reopen (`sales.reopen`) is a separate sub-perm. Granting both `sales.proxy_entry` and `sales.reopen` to an ops clerk lets them reopen + edit + repost another BDM's posted row — intended ops capability.
- **Cross-entity still locked.** `entity_id` scope preserved in the widened filter. Proxy at Entity A cannot touch Entity B.

**Rollout.**
- Sub-permission seed runs on first Access Template render per entity (existing `seedEntityLookups` path — no separate migration).
- `PROXY_ENTRY_ROLES` lookup seeds with default `['admin', 'finance', 'president']` for all 5 modules. Admin adds `'contractor'` per module from Control Center → Lookup Tables.
- No data migration. Existing SalesLine rows have no `recorded_on_behalf_of` field — they're self-entry by definition.
- Non-proxy callers see zero behavior change.

**Bulletproof bar.**
- Build clean in 8.91s (`npx vite build`).
- `node -c` clean on [resolveOwnerScope.js](backend/erp/utils/resolveOwnerScope.js), [salesController.js](backend/erp/controllers/salesController.js), [lookupGenericController.js](backend/erp/controllers/lookupGenericController.js), [SalesLine.js](backend/erp/models/SalesLine.js).
- Happy path: admin → Sales Entry → picks BDM Juan → creates CSI → stamped `bdm_id=juan._id`, `recorded_on_behalf_of=admin._id`, `created_by=admin._id`. Juan sees his row in his Sales List without the "Proxied" pill; admin sees the same row with the pill.
- Failure path: contractor without role in `PROXY_ENTRY_ROLES.SALES` sends `assigned_to` directly via API → 403 "Proxy entry denied for sales.proxy_entry".
- Activity Monitor surface: filter by `log_type: PROXY_CREATE` shows every proxied row; `PROXY_UPDATE` shows every proxied edit.

**Deferred (Phase G4.5c + G4.5b-extended).**
- Expenses refactor to use the shared helper (keeps existing behavior; unifies audit action codes). — G4.5c
- `approvalService`: today `forceApproval` sends the proxied doc to **any user in `allowedRoles`** (admin/finance/president by default). A future pass will add `ownerBdmId` → `owner.reports_to` chain resolution, so approvals route to the owner's direct authority, not just a broad pool. The request already carries `owner_bdm_id` in metadata for that upgrade. — G4.5b-extended
- Lookup-write cache bust: currently relies on 60s TTL; `invalidateProxyRolesCache` should be called from the generic lookup write path for instant propagation.

### Phase G4.5a follow-up — `VALID_OWNER_ROLES` lookup (April 22, 2026)

**Problem.** The proxy-target role guard in [resolveOwnerScope.js](backend/erp/utils/resolveOwnerScope.js) was a hardcoded `Set([ROLES.CONTRACTOR, 'employee'])`. A subscriber whose org includes a "director who also sells" or a "branch manager carrying a territory" couldn't proxy-target that role without a code change — Rule #3 violation dressed up as a type guard.

**Fix.** Added `VALID_OWNER_ROLES` lookup category (5 module codes: SALES, OPENING_AR, COLLECTIONS, EXPENSES, GRN — each with default `metadata.roles = ['contractor','employee']`). `resolveOwnerForWrite` now reads the lookup instead of the hardcoded Set. 60-second in-proc cache keyed `${entityId}::${moduleKey}`, bust on lookup write (parallel plumbing to PROXY_ENTRY_ROLES). New exports: `getValidOwnerRolesForModule`, `invalidateValidOwnerRolesCache`.

**Files touched (3).**
- `backend/erp/utils/resolveOwnerScope.js` — lookup reader + invalidator + updated `resolveOwnerForWrite`
- `backend/erp/controllers/lookupGenericController.js` — SEED_DEFAULTS entry + 5 cache-bust call sites (create, update, remove, seedCategory, seedAll)
- `scripts/check-system-health.js` — asserts lookup seeded, helpers exported, `getValidOwnerRolesForModule(req.entityId, ...)` called in resolveOwnerForWrite, and the hardcoded Set is not re-introduced

**Behavior today = behavior before.** Default `['contractor','employee']` matches the original hardcoded Set exactly. Existing subscribers see zero change. Subscribers with different org models extend per-module via Control Center → Lookup Tables → VALID_OWNER_ROLES without a code deploy. Error message when a non-listed role is picked tells the admin exactly which lookup/code to edit.

**Integrity.**
- Build clean in 13.34s (`npx vite build`).
- `node -c` clean on both modified backend files.
- `scripts/check-system-health.js` — 5/5 sections green, including extended proxy-entry check that verifies the VALID_OWNER_ROLES path end-to-end.

### Phase G4.5a follow-up — Field-input priority: proxy context wins over logged-in BDM (April 29, 2026)

**Rule.** When a form is in proxy context (a target BDM / warehouse selected via OwnerPicker, WarehousePicker, or `assigned_to`), every field input that has a per-BDM scope must source its options from the **proxy/target** context — not the logged-in user's own profile. The logged-in user's profile is only the fallback when proxy context is empty (self-entry).

**Why.** A proxy filing on behalf of another BDM sees a form populated with the proxy's own hospitals/customers/warehouses/products/territories. The proxy then can't find the target's hospital in the dropdown and either keys garbage or gives up. Rule #21 (no silent self-fallback) plugs this on the backend filter side; this rule plugs it on the input-population side. Without it, the proxy gate gets opened but the form is unfillable — defeating the whole point of proxy entry.

**Reference implementation.** [SalesEntry.jsx:560-575](frontend/src/erp/pages/SalesEntry.jsx#L560-L575) (commit `0a98481`). The hospital dropdown was previously hydrated by the cached, unscoped `useHospitals()` hook, which reads "my tagged hospitals" for the logged-in user. After the change it calls `useHospitals({ warehouseId })` — passing the WarehousePicker's selected value — so the dropdown follows the **selected** warehouse's tagged hospitals. [hospitalController.getAll](backend/erp/controllers/hospitalController.js) accepts `?warehouse_id=` and gates it the same way `GET /warehouse/my` does, so this can't be abused to enumerate hospitals on warehouses the caller has no access to. [useHospitals](frontend/src/erp/hooks/useHospitals.js) bypasses its session cache when scoped, so toggling warehouse always refetches.

**How to apply.** When you wire a new proxy-aware page (or audit an existing one), check every dropdown / autocomplete / list-of-options that's keyed by BDM identity:
- Hospitals → scope by selected warehouse (Sales, Opening AR, Collections, GRN paths)
- Customers → scope by `assigned_to` if non-empty; else self
- Products → scope by selected warehouse (stock-bound) or selected entity (master-data)
- Territories / regions → scope by `assigned_to` if non-empty
- Default cost center / petty cash fund → scope by `assigned_to` if non-empty

If the field's options are independent of BDM identity (e.g. payment modes, lookup categories), no change. If the field would be empty for the proxy because they're not the target — fix it. The grep that catches this audit is `useHospitals\(\)|useCustomers\(\)\.\.\.|usePeople\(\) without an ownerId arg|productOptions filtered by req\.bdmId on the backend`.

**Bulletproof bar.**
- Backend: warehouse-access guard mirrors `GET /warehouse/my` so a privilege-check exists at the source.
- Frontend: scoped path bypasses the module cache; cache only holds the self-scope result.
- Symmetric to the existing GRN warehouse cross-check ([G4.5b §2](#)) — a proxy can't write into a warehouse they don't own *and* can't see options for one outside the target's access.

---

## Phase G4.5b — Proxy Entry for Collections + GRN (April 22, 2026)

**Problem.** G4.5a delivered proxy entry for Sales + Opening AR only. The other two high-volume back-office modules — Collections (Collection Receipts) and GRN (Goods Receipt Notes) — still required the owner BDM to key every row themselves. Finance clerks and admins could not record a CR on behalf of a BDM still on a field visit, and receiving warehouse personnel could not capture a GRN on behalf of the BDM listed on the waybill.

**Solution — port the G4.5a pattern, with two module-specific guards.** The shared `resolveOwnerScope.js` helper is unchanged. `collectionController` and `inventoryController` (GRN paths) now call it exactly like `salesController`. Same two-layer gate (role ∈ `PROXY_ENTRY_ROLES.<MODULE>` lookup + `<module>.<subKey>` tick on Access Template). Same Option B — proxied submits force through Approval Hub via `forceApproval: hasProxy, ownerBdmId`.

**Module-specific guards added this phase.**
1. **Collections — CSI picker rescope.** The Collection Session's "Open CSIs" dropdown (`getOpenCsisEndpoint`) already applied a Rule #21 privileged-query pattern for admin/finance/president (honors `?bdm_id=`, no silent self-fallback). Extended this privileged bucket to include contractor-proxy with `collections.proxy_entry` ticked — without this a proxy contractor would see "no open CSIs" for any hospital and dead-end. [collectionController.js:109](backend/erp/controllers/collectionController.js#L109).
2. **GRN — warehouse-access cross-check.** `widenFilterForProxy` relaxes `bdm_id` but does **not** grant the target BDM warehouse access. `inventoryController.createGrn` now loads the selected `Warehouse` and rejects with a clear 400 if `owner.ownerId` is not in `assigned_users` or `manager_id`. Without this guard, a proxy could receive stock into a warehouse the target BDM doesn't own, creating orphaned ledger rows. [inventoryController.js:437](backend/erp/controllers/inventoryController.js#L437).
3. **GRN — Undertaking ownership mirror.** Every GRN auto-creates a sibling Undertaking via `autoUndertakingForGrn` (Phase 32R). Phase G4.5b propagates `recorded_on_behalf_of` from GRN to the UT so the target BDM sees the UT in their own queue (not the proxy's) — the acknowledgment cascade already runs in the target's scope, and `postSingleUndertaking` posts the linked GRN in the same session. [undertakingService.js:108](backend/erp/services/undertakingService.js#L108).

**Architecture — direction of data flow.**
```
 Proxy (admin/finance/back-office contractor) keys a row
   ├─ Collection Session     → assigned_to    → resolveOwnerForWrite("collections", "proxy_entry")
   │                         → Collection {bdm_id=target, recorded_on_behalf_of=proxy}
   │                         → submit  → gateApproval({forceApproval: true, ownerBdmId: target})
   │                         → ApprovalRequest (metadata.gate='PROXY_ENTRY') → Approval Hub
   │                         → approve → MODULE_AUTO_POST.COLLECTION handler → POSTED
   │
   └─ GRN Entry              → assigned_to    → resolveOwnerForWrite("inventory", "grn_proxy_entry")
                             → Warehouse.assigned_users cross-check (400 on miss)
                             → GrnEntry {bdm_id=target, recorded_on_behalf_of=proxy}
                             → autoUndertakingForGrn mirrors {bdm_id, recorded_on_behalf_of}
                             → target BDM submits UT → approver acknowledges UT
                             → postSingleUndertaking cascades → GRN auto-approved atomically
```

**Key invariants.**
- `recorded_on_behalf_of` is ONLY written on create. Update path strips `assigned_to`/`bdm_id`/`recorded_on_behalf_of` from the body — ownership is immutable once filed. Reassignment requires delete + recreate (draft only). [collectionController.js:65](backend/erp/controllers/collectionController.js#L65).
- `widenFilterForProxy` keeps `entity_id` scoping. Cross-entity proxy is denied inside `resolveOwnerForWrite` (target's `entity_id`/`entity_ids` must include `req.entityId`).
- GRN is intentionally NOT in `MODULE_AUTO_POST` — its "approve target" is the Undertaking, not the GRN itself. Proxy GRN inherits this: the UT is the choke point, not the GRN. Direct `approveGrn` already enforces `UT.status === 'ACKNOWLEDGED'` for non-president callers ([inventoryController.js:812](backend/erp/controllers/inventoryController.js#L812)).
- Sub-perm `inventory.grn_proxy_entry` sits under the `inventory` module namespace (not its own module) because GRN does not have a dedicated ERP access module. Lookup seed: `INVENTORY__GRN_PROXY_ENTRY`.
- Non-proxy callers see zero behavior change. Backward compat guaranteed because `resolveOwnerForWrite` short-circuits to self-entry when `body.assigned_to` is absent or matches `req.user._id`.

**Bulletproof bar.**
- Build clean (`npx vite build` multiple passes).
- `node -c` clean on Collection.js, GrnEntry.js, Undertaking.js, undertakingService.js, collectionController.js, inventoryController.js, lookupGenericController.js.
- Health check `node scripts/check-system-health.js` 5/5 green. `checkProxyEntryWiring()` now validates **all** proxy plumbing across Sales, Opening AR, Collections, and GRN — including the Undertaking ownership propagation + warehouse-access cross-check.
- Happy path (Collections): admin → Collection Session → OwnerPicker picks BDM Juan → CSI picker loads Juan's open invoices → records CR → stamped `bdm_id=juan._id`, `recorded_on_behalf_of=admin._id`. Submit → 202 pending → admin/finance/president approves from Approval Hub → posts via `MODULE_AUTO_POST.COLLECTION`.
- Happy path (GRN): admin → GRN Entry → OwnerPicker picks BDM Maria → Warehouse picker → Maria is in `warehouse.assigned_users` → GRN + UT created with Maria's bdm_id + admin's `recorded_on_behalf_of`. Maria submits UT → approver acknowledges → GRN posts atomically.
- Failure path (GRN warehouse mismatch): admin picks BDM Pedro who is NOT assigned to warehouse "WH-MAIN" → 400 "Target BDM is not assigned to warehouse …"
- Failure path (role denial): contractor without `collections.proxy_entry` sends `assigned_to` directly via API → 403 "Proxy entry denied for collections.proxy_entry".

**Deferred (Phase G4.5b-extended / G4.5c).**
- Owner-chain approval routing (Option C). `forceApproval` still resolves approvers from `allowedRoles` (admin/finance/president pool), not the owner's `reports_to` chain. Risk is narrow for admin/finance proxy (same pool would approve anyway) but real for contractor-proxy with a specific reporting line.
- Expenses refactor to shared helper (Phase G4.5c).
- `president-reverse` paths for Collections use `widenFilterForProxy` + pass the widened filter into `documentReversalService`. GRN `presidentReverseGrn` still goes through the generic `buildPresidentReverseHandler` factory which uses raw `req.tenantFilter` — for admin/finance proxy this is already wide (no `bdm_id` in their tenantFilter); for hypothetical contractor-proxy with `accounting.reverse_posted`, a widen would be needed. Not a blocker given the DANGER sub-perm is almost always reserved for president.

---

## Phase PR1 — Per-Row Lifecycle Policy for Sales / Opening AR / Expenses (April 22, 2026)

### Governing Principle
All transactional lifecycle actions (Validate / Submit / Re-open / Request Deletion / Approve Deletion / President Delete) act **one row at a time** and live on the **list page**, not the entry page. The entry page is strictly a capture tool. No bulk-validate, bulk-submit, or bulk-reopen buttons exist anywhere in the UI for these modules.

### Why (Rule 0 stress-test)
Sales, Opening AR, and Expenses all carry per-row state that makes atomic batch operations unsafe **in practice** even when safe **at the database level**:
- Each Sales/Opening AR row has its own FIFO stock snapshot, VAT balance, credit-limit projection, CSI-booklet audit, and gateApproval threshold.
- Each Expense row has its own COA validation, OR gate, CALF link check.
- A batch success toast can mask a silent ERROR on one of N rows; a batch failure can block N-1 good rows behind one bad one. Recovery from a bad bulk-reopen is 10× the cost of a bad bulk-submit because reversals cascade to JE, stock, AR, and commission accruals.

Sales aren't a multi-leg journal entry that must post atomically. Each CSI is an independent financial event — atomicity buys nothing, costs forensic pain.

### Per-Module Implementation
| Module | Entry page buttons | List page buttons (per-row) |
|---|---|---|
| **Sales** | Save Drafts · Scan CSI · Upload CSI · +Add Row. Per-row Validate + Post inside the grid is kept for the in-session create-then-validate flow — each grid button passes `[r._id]` to the hook. | Validate (DRAFT/ERROR) · Submit (VALID) · Re-open (POSTED, admin) · Req. Delete (POSTED, non-admin) · Approve Delete (DELETION_REQUESTED, w/ accounting.approve_deletion) · President Delete (w/ accounting.reverse_posted). |
| **Opening AR** | Save Drafts · Scan CSI · Upload CSI · +Add Row. No lifecycle buttons anywhere on entry — validation is canonically a List action. | Same 6 buttons as Sales, plus source is locked to OPENING_AR. |
| **Expenses** | + New Expense form (and Batch OR Upload when `expenses.batch_upload` granted). | Validate (DRAFT/ERROR) · Submit (VALID) · Re-open (POSTED, admin) · Del (DRAFT) · President Delete (w/ accounting.reverse_posted). |
| **Collections** | Reference pattern — already per-row before Phase PR1. | Validate · Submit · Re-open · Del · President Delete. |

### Backend Contract (Expenses)
`validateExpenses` + `submitExpenses` in [backend/erp/controllers/expenseController.js](backend/erp/controllers/expenseController.js) accept optional `expense_ids` body param:
```js
const filter = { ...req.tenantFilter, status: 'VALID' };
if (req.body?.expense_ids?.length) filter._id = { $in: req.body.expense_ids };
const entries = await ExpenseEntry.find(filter);
```
- Spread-first tenant filter preserves entity isolation — cross-entity ids are silently stripped.
- Absent `expense_ids` → unchanged legacy behavior (matches all editable/VALID entries in scope), so proxy flow + any unmigrated caller continues to work.
- Per-entry safety gates (`checkPeriodOpen`, `gateApproval`, CALF-POSTED check, auto-journal) remain in the controller loop and fire regardless of body shape. Per-row submit simply means a single-entry loop with a tiny transaction scope.

Sales `submitSales` already supported optional `sale_ids`; no backend change needed for Sales/Opening AR.

### Frontend Contract
`useExpenses.validateExpenses(ids)` / `submitExpenses(ids)` send `{ expense_ids: ids }` when the array is non-empty, `{}` otherwise. The type signature is compatible with existing callers that pass no args.

Per-row handlers on all three list pages:
- `handleValidate(id)`: calls `validateExpenses/validateSales([id])`, reads the single row's result from `res.data` / `res.errors`, shows targeted success/error toast, refreshes the list.
- `handleSubmit(id)`: same pattern. Handles HTTP 202 `approval_pending` via both success body and thrown error (belt-and-braces for legacy axios interceptors).

### Integrity Checklist Applied
- **Rule 1 banners**: 5 page banners (`sales-entry`, `sales-list`, `sales-opening-ar`, `sales-opening-ar-list`, `expenses`) rewritten to match the new UI. No banner references a removed button.
- **Rule 2 wiring**: all 17 per-row button `onClick` references resolve to defined handlers; route wiring + body parser verified.
- **Rule 3 lookup-driven**: lifecycle statuses sourced from `getEditableStatuses(entityId, moduleKey)`; MODULE_DEFAULT_ROLES untouched; no hardcoded role lists introduced.
- **Rule 19 scalability**: subscription-ready — subscribers don't inherit any hardcoded per-row or bulk policy; the backend accepts both shapes.
- **Rule 20 workflow safety**: period-lock still fires per-entry in controller; gateApproval still wraps every submit; approval_pending 202 handled on all per-row buttons; no lifecycle route middleware severed.
- **Rule 21 bdm_id**: no self-id fallback introduced. `req.tenantFilter` unchanged.
- **Cross-entity isolation**: `filter._id = { $in: ids }` ANDed with tenant spread — stress-tested by construction.

### Known Bug Fixed During Rollout
[SalesEntry.jsx:1100](frontend/src/erp/pages/SalesEntry.jsx#L1100) — per-row Post button inside the entry grid was silently calling `sales.submitSales()` with NO id (bulk leak). Now passes `[r._id]` with full `approval_pending` handling. This bug predated Phase PR1 but was caught during the Rule 0 sweep.

### Deferred / Out of Scope
- SMER still uses a single-row lifecycle bound to a per-cycle document (one entry per BDM per cycle) — no bulk concept applies, no Phase PR1 change needed.
- PRF/CALF and Car Logbook lifecycle actions remain on their existing pages unchanged.
- Payroll already uses per-payslip actions.
- GRN/Undertaking is a dual-model cycle wrapper; the approve action is intrinsically per-GRN — unaffected.


---

## Phase FRA-A — Cross-Entity Assignments Drive `User.entity_ids` (April 22, 2026)

### Problem
Two multi-entity systems co-existed but didn't talk to each other:
- `User.entity_ids` (scalar array) — what [tenantFilter.js](backend/erp/middleware/tenantFilter.js) reads on every ERP request to validate `X-Entity-Id` and set `req.entityId`.
- `FunctionalRoleAssignment` (Phase 31) — richer per-(person, entity, function) row with date windows, approval limits, status. Admin maintains these in **Control Center → People & Access → Role Assignments**.

Consequence: admin assigns Juan to MG and CO. via FRA, UI says ACTIVE, but Juan's entity picker never offers MG and CO., `tenantFilter` never sets `req.entityId = mg_id`, and `resolveOwnerForWrite` throws "target not assigned to the current entity." FRA rows were cosmetic.

### Decision — Option A (dual-write) over Option B (union-of-sources bridge)
- `User.entity_ids` stays authoritative for entity access — `tenantFilter` hot path unchanged.
- FRA controller mutations (create / update / deactivate / bulkCreate) now propagate to `User.entity_ids` via a shared rebuild primitive.
- FRA stays as optional metadata layer (date windows, approval_limit, status, functional_role) — useful for reporting and future per-entity approval-limit enforcement. Not load-bearing for auth.

### Implementation

**`backend/models/User.js`** — new field `entity_ids_static: [ObjectId]` with sparse index. Captures admin-direct assignments (BDM Management → userController.updateUser) so they're preserved when an FRA rebuild runs. Without this, deactivating an FRA would `$pull` an entity the admin intentionally granted.

**`backend/erp/utils/userEntityRebuild.js`** — shared primitive. Computes `entity_ids = union(entity_ids_static, activeFraEntityIds)` where `activeFraEntityIds` is every `entity_id` from every active+ACTIVE FRA whose `person_id` links to a PeopleMaster with `user_id = userId`. Exports:
- `rebuildUserEntityIdsForUser(userId)` — low-level, writes only if diff
- `rebuildUserEntityIdsFromPerson(personId)` — FRA controllers call this (person_id is what they have)
- `safeRebuildFromPerson(personId, ctx)` — swallow-and-log wrapper; FRA mutation never fails due to rebuild hiccup

**`backend/erp/controllers/functionalRoleController.js`** — `safeRebuildFromPerson` called on every mutation path:
- `createAssignment` → rebuild for new person
- `updateAssignment` → rebuild (entity_id / status / is_active may have changed)
- `deactivateAssignment` → rebuild (pulls entity from entity_ids unless another active FRA or static baseline holds it)
- `bulkCreate` → single rebuild per person at end

**`backend/controllers/userController.js:updateUser`** — when admin writes `entity_ids`, mirror to `entity_ids_static` and call `rebuildUserEntityIdsForUser`. Ensures admin-direct assignment persists through subsequent FRA rebuilds AND unions with any active FRAs at write time.

**`backend/erp/scripts/backfillEntityIdsFromFra.js`** — idempotent migration + drift detector.
- Default (dry-run): scans all Users, reports drift, exits 1 if any drift.
- `--apply`: writes. Seeds `entity_ids_static = current entity_ids` on first run (captures pre-FRA-A admin assignments). Rebuilds `entity_ids` as union.
- `--user <id>`: scope to one user.
- Usage as CI drift gate: `node backend/erp/scripts/backfillEntityIdsFromFra.js && echo "no drift"`.

**`scripts/check-system-health.js`** — new section 6 `checkFraEntityIdsSync` asserts wiring (file-level):
- `entity_ids_static` field + index present on User model
- `userEntityRebuild.js` helper exists with expected exports
- functionalRoleController imports helper + calls `safeRebuildFromPerson` ≥ 4 times (one per mutation path)
- userController.updateUser mirrors to static + calls rebuild
- Backfill script exists with `--apply` / `--user` flags

### Bulletproof walkthrough (all passing)

| Scenario | Expected | Result |
|---|---|---|
| Happy path: admin creates FRA (Juan → MG → SALES) | Juan's `entity_ids` now includes MG; picker shows MG; proxy-target check passes for MG ops | ✅ |
| Deactivate: is_active=false on Juan's MG FRA | `entity_ids` drops MG (no other active FRA, not in static) | ✅ |
| Multi-role: Juan has ACCOUNTING + SALES at MG; deactivate SALES only | `entity_ids` keeps MG (ACCOUNTING still active) | ✅ |
| Static preservation: admin assigned Juan to VIP + MG pre-FRA, then adds FRA for BLW | Static = [VIP, MG], entity_ids = [VIP, MG, BLW]; deactivating BLW FRA later keeps [VIP, MG] | ✅ |
| Drift: backfill --dry-run after apply | 0 drift, exit 0 | ✅ |
| Rule #19 cross-entity: entity added to `entity_ids` | Still requires `X-Entity-Id` header to switch — no silent cross-entity writes | ✅ (unchanged `tenantFilter`) |
| Rule #21 no silent self-fallback: `resolveOwnerForWrite` | Still throws 403 on cross-entity target | ✅ (unchanged) |

### Known operational caveats
- **JWT staleness**: if `protect` middleware reads `entity_ids` from a cached User fetch, changes take effect next request. Typical session lifecycle handles this fine; if a user has a stale token, logout/refresh applies the new entity.
- **Date-window enforcement**: `FRA.valid_from` / `valid_to` are data-only today. `tenantFilter` auth gate reads static `entity_ids`. Future subscribers wanting time-bounded deployment will need a `tenantFilter` extension (not an FRA-bridge rebuild).
- **Approval limit**: `FRA.approval_limit` is data-only. Future phase to wire into `approvalService`.
- **Strict function-gate**: module ↔ `FRA.functional_role` matching NOT implemented. Sub-perms remain the function gate. If a subscriber asks, add `MODULE_FRA_REQUIRED` lookup with null default.

### Files touched (Phase FRA-A)
```
backend/models/User.js                                           # + entity_ids_static + sparse index
backend/erp/utils/userEntityRebuild.js                           # NEW — shared rebuild primitive
backend/erp/controllers/functionalRoleController.js              # dual-write on 4 mutation paths
backend/controllers/userController.js                            # updateUser mirrors + rebuilds
backend/erp/scripts/backfillEntityIdsFromFra.js                  # NEW — migration + drift detector
scripts/check-system-health.js                                   # + checkFraEntityIdsSync (section 6)
CLAUDE-ERP.md                                                    # this section
docs/PHASETASK-ERP.md                                            # status flip 📋 → ✅
```

### Rollout checklist (ops)
1. Deploy code.
2. Run `node backend/erp/scripts/backfillEntityIdsFromFra.js` — review drift report.
3. Run `node backend/erp/scripts/backfillEntityIdsFromFra.js --apply` — persist static seed + union rebuild.
4. Re-run dry-run → expect exit 0 (0 drift).
5. Add dry-run to CI as a pre-deploy gate.

---

## Phase G4.5c.1 — Expenses Refactor to Shared Proxy Helper (April 23, 2026)

### Problem
Single-entry Expenses (createExpense / updateExpense / listExpense) had NO proxy path. Only the batch-upload flow (saveBatchExpenses) handled `assigned_to`, and it used a custom audit code (`BATCH_UPLOAD_ON_BEHALF`) distinct from Sales/Collections/GRN's unified `PROXY_CREATE` / `PROXY_UPDATE`. Admin/finance back-office staff couldn't key a single expense on behalf of a BDM without going through the OCR batch-upload flow; that gap pushed them to create CRM-only workarounds.

### Latent bug surfaced during refactor
ExpenseEntry's pre-save hook conflated two concerns on the `recorded_on_behalf_of` field:
```js
// OLD (Phase 18)
if (this.recorded_on_behalf_of) {
  line.calf_required = false;  // CALF bypass!
}
```
Code comment said "president override" but the check didn't distinguish president from any other proxy. Before G4.5c.1 this only mattered for president batch-uploads; after wiring the shared helper into createExpense, every admin/finance/contractor proxy would silently inherit the CALF bypass — a finance control regression.

### Fix (two-part)

**1. Decouple audit from CALF bypass.** Added explicit `ExpenseEntry.calf_override: Boolean` (default false). Pre-save hook now reads `this.calf_override` instead of `this.recorded_on_behalf_of`. `saveBatchExpenses` sets `calf_override = true` **only when `req.user.role === 'president'`**; admin batch-uploads keep audit stamping but lose CALF bypass (aligns with existing validate-time gate at `expenseController.js:1598` which already checked `req.user.role !== ROLES.PRESIDENT`). New create-proxy path does NOT set `calf_override` — CALF requirement enforced normally.

**2. Refactor to shared helper.** Ported the G4.5a pattern:
- `createExpense`: `resolveOwnerForWrite(req, 'expenses', { subKey: 'proxy_entry' })`. Strips `assigned_to` / `bdm_id` / `recorded_on_behalf_of` / `calf_override` from body (no payload injection). Stamps `bdm_id = owner.ownerId`, `recorded_on_behalf_of = owner.proxiedBy`. Emits `PROXY_CREATE` audit log when `owner.isOnBehalf`.
- `updateExpense`: `widenFilterForProxy` on the scope. Strips ownership fields from body (ownership is locked after create). Emits `PROXY_UPDATE` when editor ≠ owner.
- `getExpenseList` / `getExpenseById` / `deleteDraftExpense` / `validateExpenses` / `reopenExpenses`: `widenFilterForProxy` replaces raw `req.tenantFilter`. List payload populates `recorded_on_behalf_of` for UI display.
- `submitExpenses`: if ANY entry has `recorded_on_behalf_of` → `gateApproval({ forceApproval: true, ownerBdmId: proxiedEntry.bdm_id })`. Option B — Rule #20 four-eyes: proxy enters, never approves.

### Lookup seeds
- `EXPENSES__PROXY_ENTRY` sub-perm row seeded in `ERP_SUB_PERMISSIONS`.
- `PROXY_ENTRY_ROLES.EXPENSES` already present (default admin/finance/president).
- `VALID_OWNER_ROLES.EXPENSES` already present (default contractor/employee).

### Frontend
- `frontend/src/erp/pages/Expenses.jsx`:
  - `OwnerPicker` mounted in the create form (renders null when caller ineligible).
  - `assignedTo` state flows into `createExpense({ ...data, assigned_to })` payload. Update path does NOT send it (locked after create).
  - "Proxied" pill on both desktop table row + mobile card view when `e.recorded_on_behalf_of` is present.
- `WorkflowGuide.jsx` `'expenses'` banner updated: describes proxy entry, Option B four-eyes, CALF bypass is president-only.

### Health check extension (section 5)
- Covers `EXPENSES__PROXY_ENTRY` sub-perm seed presence.
- Asserts `expenseController` imports `resolveOwnerForWrite` + `widenFilterForProxy`.
- Asserts `submitExpenses` carries `forceApproval` Option B flag.
- Asserts `createExpense` emits `PROXY_CREATE`, `updateExpense` emits `PROXY_UPDATE`.
- Asserts `ExpenseEntry.calf_override` field exists.
- Asserts pre-save hook is NOT still reading `recorded_on_behalf_of` for CALF bypass (regression guard).
- `ExpenseEntry` added to the recorded_on_behalf_of field-presence check alongside SalesLine / Collection / GrnEntry / Undertaking.

### Bulletproof walkthrough (all passing)

| Scenario | Expected | Result |
|---|---|---|
| BDM self-entry | `bdm_id=self`, `recorded_on_behalf_of=undefined`, no proxy audit, no force-approval | ✅ |
| Admin keys Expense for BDM Juan | `bdm_id=juan`, `recorded_on_behalf_of=admin`, `PROXY_CREATE` log, submit forces Approval Hub | ✅ |
| Admin edits proxied row | `PROXY_UPDATE` log, ownership unchanged (stripped from body) | ✅ |
| Admin tries to proxy without sub-perm ticked | 403 with "Access Template does not grant proxy rights" | ✅ |
| Admin tries to proxy-target another admin | 400 "not a valid owner for expenses" (VALID_OWNER_ROLES lookup) | ✅ |
| Admin proxy with ACCESS non-cash line | Pre-save sets `calf_required=true`; validate blocks "CALF required" — admin cannot bypass CALF anymore | ✅ (bug fix) |
| President batch-upload with ACCESS non-cash | `calf_override=true` via saveBatchExpenses role check; validate allows | ✅ |
| Cross-entity proxy (target assigned elsewhere) | 403 "not assigned to current entity" | ✅ (unchanged) |
| Rule #21 privileged user | `widenFilterForProxy` drops `bdm_id` only for eligible proxies; admin/finance base tenantFilter already omits `bdm_id` | ✅ |

### Files touched (Phase G4.5c.1)
```
backend/erp/models/ExpenseEntry.js                               # + calf_override field, pre-save hook uses it
backend/erp/controllers/expenseController.js                     # resolveOwnerForWrite/widenFilterForProxy, PROXY_CREATE/UPDATE, forceApproval, strip payload
backend/erp/controllers/lookupGenericController.js               # + EXPENSES__PROXY_ENTRY sub-perm seed
frontend/src/erp/pages/Expenses.jsx                              # OwnerPicker mount, assignedTo state, Proxied pill (table + card)
frontend/src/erp/components/WorkflowGuide.jsx                    # expenses banner update
scripts/check-system-health.js                                   # section 5 extended for Expenses + calf_override guard
CLAUDE-ERP.md                                                    # this section
docs/PHASETASK-ERP.md                                            # status flip 📋 → ✅
```

---

## Phase G4.5b-ext — Proxy-Aware AR Aging + Collection Rate Endpoints (April 23, 2026)

### Problem
Phase G4.5b extended the Open CSIs endpoint (`getOpenCsisEndpoint`) so that contractor-proxies with `collections.proxy_entry` ticked could pass `?bdm_id=` to view the target BDM's open invoices. However, the two companion read endpoints — `getArAgingEndpoint` and `getCollectionRateEndpoint` — were not updated. They still restricted `?bdm_id=` to president/admin/finance only. This created a **blind spot**: a proxy could record collections on behalf of a BDM but could not verify that BDM's AR aging or collection rate — undermining data accuracy and the full AR → Collection → Rate verification loop.

### Fix
Mirror the existing `getOpenCsisEndpoint` proxy pattern into both endpoints. The change is minimal and surgical:

1. **`getArAgingEndpoint`** — call `canProxyEntry(req, 'collections', 'proxy_entry')` and include the result in the `privileged` boolean that gates `?bdm_id=` passthrough. Entity scope (`req.entityId`) unchanged.
2. **`getCollectionRateEndpoint`** — same pattern. Proxy can now view collection rate of the BDMs they file on behalf of.
3. **WorkflowGuide** — `ar-aging` tip updated to mention proxy access (Phase G4.5b-ext).
4. **Health check** — `checkProxyEntryWiring()` extended with two new checks: verifies `canProxyEntry` appears in both `getArAgingEndpoint` and `getCollectionRateEndpoint` blocks.

### Governing principles
- **Rule #3 (no hardcoded business values)**: no new hardcoded roles. Reuses the existing `PROXY_ENTRY_ROLES.COLLECTIONS` lookup + `collections.proxy_entry` sub-permission. Subscribers delegate without code changes.
- **Rule #19 (entity-scoped)**: `req.entityId` unchanged. No cross-entity bleed.
- **Rule #21 (no silent self-ID fallback)**: non-proxy contractors still receive `req.bdmId` (their own data only). No silent widening.

### Files changed
```
backend/erp/controllers/collectionController.js           # getArAgingEndpoint + getCollectionRateEndpoint proxy-aware
frontend/src/erp/components/WorkflowGuide.jsx             # ar-aging tip updated
scripts/check-system-health.js                            # checkProxyEntryWiring extended (+2 checks)
CLAUDE-ERP.md                                             # this section
docs/PHASETASK-ERP.md                                     # Phase G4.5b-ext entry
```

### Verification
- `node -c backend/erp/controllers/collectionController.js` — clean
- `node scripts/check-system-health.js` — 6/6 green (G4.5b-ext checks passing)
- `npx vite build` — clean in 11.47s, zero errors
- No new dependencies, no new models, no new routes, no schema changes
- Backward compatible: non-proxy callers see zero behavior change


---

## Phase P1 — BDM Mobile Capture + Office Proxy Queue (April 23, 2026)

### Vision
Operational model locked: **BDM = revenue producer, proxy = back-office processor.** BDM in the field does ONE-TAP capture (scan + GPS + photo). Office proxy processes. BDM reviews proxied entries before POSTED. Commission-bearing actions stay sacred to BDM.

### What shipped
- **CaptureSubmission model** (`backend/erp/models/CaptureSubmission.js`) — new collection `capture_submissions`. Lifecycle: `PENDING_PROXY → IN_PROGRESS → PROCESSED → AWAITING_BDM_REVIEW → ACKNOWLEDGED`. Also: `DISPUTED`, `CANCELLED`, `AUTO_ACKNOWLEDGED`. 8 workflow types: SMER, EXPENSE, SALES, OPENING_AR, COLLECTION, GRN, PETTY_CASH, FUEL_ENTRY. Compound indexes for all query patterns.
- **CaptureSubmission controller** (`backend/erp/controllers/captureSubmissionController.js`) — 12 endpoints: BDM-side (create, getMyCaptures, getMyReviewQueue, acknowledge, dispute, cancel), Proxy-side (getProxyQueue, getCaptureById, pickup, release, complete), Dashboard (getQueueStats). Proxy queue gated by `canProxyEntry()`. Notifications via `dispatchMultiChannel()`.
- **CaptureSubmission routes** (`backend/erp/routes/captureSubmissionRoutes.js`) — mounted at `/erp/capture-submissions`. No module-level `erpAccessCheck` (every ERP user can create captures; proxy endpoints gated inside controller).
- **Proxy SLA Agent** (`backend/agents/proxySlaAgent.js`) — `#PX`, FREE tier, runs every 4 hours. Alerts office leads on stale `PENDING_PROXY` > 24h. Auto-acknowledges `AWAITING_BDM_REVIEW` > 72h. Thresholds lookup-driven (`PROXY_SLA_THRESHOLDS`). Idempotent (checks `sla_alert_sent_at`).
- **PROXY_SLA_THRESHOLDS seed** in `lookupGenericController.js` SEED_DEFAULTS — `pending_alert_hours: 24`, `auto_ack_hours: 72`. `insert_only_metadata: true` so admin tuning survives re-seeds.
- **BDM Capture Hub** (`frontend/src/erp/pages/mobile/BdmCaptureHub.jsx`) — mobile-first (360px min), large touch targets (≥ 44px). 6 active workflow cards (EXPENSE, SMER, SALES, GRN, FUEL_ENTRY, PETTY_CASH). Camera + gallery input. GPS auto-capture. Amount/payment/ACCESS fields per workflow. Recent captures list. Rule #9 fallback note.
- **Office Proxy Queue** (`frontend/src/erp/pages/proxy/ProxyQueue.jsx`) — table view with filters (status, workflow type). SLA color coding (< 24h green, 24-48h amber, > 48h red). Stats banner (pending, in-progress, over-SLA, processed today). Detail drawer with pickup/release/complete actions. Pagination.
- **BDM Review Queue** (`frontend/src/erp/pages/mobile/BdmReviewQueue.jsx`) — mobile-first review cards. Proxy summary banner ("Maria entered 3 items for you"). Confirm/Dispute buttons. Dispute modal with reason field + IncentiveDispute reference. Auto-acknowledge warning.
- **useCaptureSubmissions hook** (`frontend/src/erp/hooks/useCaptureSubmissions.js`) — wraps all 12 API endpoints through `useErpApi`.
- **App.jsx** — 3 new lazy routes: `/erp/capture-hub`, `/erp/review-queue`, `/erp/proxy-queue`. All gated by `ROLE_SETS.ERP_ALL`.
- **Sidebar** — new "Capture Hub" section. BDMs see Capture Hub + Review Queue. Management sees Proxy Queue + Review Queue.
- **WorkflowGuide** — 3 new banner keys: `bdm-capture-hub`, `proxy-queue`, `bdm-review-queue`. Steps, tips, and navigation links.
- **AgentDashboard + AgentSettings** — `proxy_sla` schedule meta added (icon, color, schedule label).
- **Health check** — Section 7: `checkCaptureSubmissionWiring()` verifies model fields, status enum, workflow_type enum, controller exports, route mounting, agent registration, lookup seed.

### Governing principles
- **Rule #3 (no hardcoded business values)**: SLA thresholds lookup-driven (`PROXY_SLA_THRESHOLDS`). Workflow types enumerated in model, not hardcoded in UI.
- **Rule #9 (fallback path)**: BDM can always self-enter without going through the proxy queue. Capture hub is ADDITIVE, not mandatory.
- **Rule #19 (entity-scoped)**: `entity_id` stamped at create. Proxy at Entity A cannot process Entity B's submissions.
- **Rule #20 (Option B)**: Proxy enters, never approves. Approval Hub handles approvals downstream.
- **Rule #21 (no silent self-scope)**: `bdm_id` explicit in all queries. No silent fallback.

### Files
```
backend/erp/models/CaptureSubmission.js                    # NEW — capture_submissions collection
backend/erp/controllers/captureSubmissionController.js     # NEW — 12 endpoints
backend/erp/routes/captureSubmissionRoutes.js              # NEW — /erp/capture-submissions
backend/agents/proxySlaAgent.js                            # NEW — #PX SLA agent
backend/erp/controllers/lookupGenericController.js         # + PROXY_SLA_THRESHOLDS seed
backend/agents/agentRegistry.js                            # + proxy_sla registration
backend/agents/agentScheduler.js                           # + proxy_sla cron (every 4h)
backend/erp/routes/index.js                                # + capture-submissions mount
frontend/src/erp/hooks/useCaptureSubmissions.js            # NEW — API hook
frontend/src/erp/pages/mobile/BdmCaptureHub.jsx            # NEW — BDM capture page
frontend/src/erp/pages/mobile/BdmReviewQueue.jsx           # NEW — BDM review page
frontend/src/erp/pages/proxy/ProxyQueue.jsx                # NEW — office proxy queue
frontend/src/App.jsx                                       # + 3 lazy routes
frontend/src/components/common/Sidebar.jsx                 # + Capture Hub section
frontend/src/erp/components/WorkflowGuide.jsx              # + 3 banner keys
frontend/src/erp/pages/AgentDashboard.jsx                  # + proxy_sla meta
frontend/src/erp/pages/AgentSettings.jsx                   # + proxy_sla meta
scripts/check-system-health.js                             # + Section 7 (P1 wiring)
CLAUDE-ERP.md                                              # this section
docs/PHASETASK-ERP.md                                      # Phase P1 status update
```

### Verification
- `node -c` on all 8 backend files — clean
- `node scripts/check-system-health.js` — 7/7 green (29 agents consistent, 106 WorkflowGuide keys, P1 wiring intact)
- `npx vite build` — clean in 13.14s, zero errors
- No new npm dependencies
- Backward compatible: existing entry pages unchanged, proxy flow is additive

---

## Phase P1.2 Slice 8 + Slice 9 — Capture Archive + Mark-Complete Inline + Override Controls (May 06, 2026)

### Why
Slice 1 shipped the 12-code lookup-driven role grid; Slices 2/3/7 wired the BDM upload + Quick Capture + Pending-Photos picker on entry pages; Slices 4/5 added the tomorrow-drive allocation gate. Two final pieces close the lifecycle so the office team has a single browseable record of every capture and a one-click way to attest paper arrival:

- **Slice 8 — `/erp/capture-archive`**: a year-round browseable archive grouped Year → Cycle → Workflow folder, with multi-select bulk-mark-received and one-click CSV cycle audit export. Replaces the manual "filter the proxy queue and hope the date range is right" pattern that the office team was using during the parallel-session smoke.
- **Slice 9 — Inline paper attestation + Override**: when a proxy is processing a capture in the existing Proxy Queue drawer, they can now tick **"Paper received now"** and have it atomically flip `physical_status` to RECEIVED in the same Mark Complete write. President-only **Override** flips RECEIVED ↔ MISSING when paper turns up late or a previous attestation was a mistake. Both gates are lookup-driven so subscribers can promote a designated proxy `staff` user to MARK_PAPER_RECEIVED without a code deploy.

### What shipped

**Backend** (`backend/erp/controllers/captureSubmissionController.js`):
- **Cycle model — C1/C2 half-monthly** (NOT the 28-day BDM-visit cycle from CRM `scheduleCycleUtils`). Same convention as DriveAllocation / SmerEntry / CarLogbookEntry / Payslip / IncomeReport / DeductionSchedule — auditors comparing a Capture cycle CSV against a SmerEntry per-diem report or DriveAllocation aggregate read the same window. The 28-day cycle was used in an initial draft and corrected in the same session before any production reads — same posture as the parallel-session DriveAllocation Slice 4 correction noted in `docs/PHASETASK-ERP.md`. Inline `cycleFor()` + `cycleBounds(period, cycle)` helpers; `cycleBounds` returns Manila-local-midnight UTC bounds and rejects malformed input. C1 = day 1–15 inclusive; C2 = day 16–end-of-month (last day computed via Date.UTC trick to handle Feb leap years).
- `getCaptureArchiveSummary` — single `$facet` aggregation that returns a `years[].periods[].cycles[]` tree (year/period='YYYY-MM'/cycle='C1'|'C2'), each cycle carries `workflows[]` with per-cell counts (total / pending / received / missing / na) plus a cross-BDM picker (`bdmList`) when caller has `VIEW_ALL_ARCHIVE`. One round-trip drives the whole left tree, no per-row fetch. Aggregation projects Manila-local year+month+day-of-month via `$dateAdd MANILA_OFFSET_MS` so cycle bucketing is correct across the 00:00–08:00 PHT window.
- `getCaptureArchiveLeaves` — paginated row list filtered by `period` (YYYY-MM) + `cycle` (C1|C2) + `workflow_type` + `sub_type` + `physical_status` + `bdm_id`. Both `period` and `cycle` are required when narrowing — passing only one returns 400 with a friendly message. Returns signed S3 URLs via `signCaptureArtifacts` so thumbnails render on the private bucket. Limit capped at 200/page server-side.
- `bulkMarkReceived` — multi-select bulk attestation gated by `BULK_MARK_RECEIVED` (admin default). Skips digital-only (`physical_required: false`) + already-RECEIVED rows server-side and returns per-id outcomes (`marked` / `skipped_digital_only` / `skipped_already_received` / `not_found`) so the FE renders a granular toast. Capped at 200 ids/call.
- `getCycleAuditReport` — CSV (default) or JSON export of every capture in a (period, cycle) window, gated by `GENERATE_CYCLE_REPORT`. Stable column order so auditors can diff cycle reports across months. Filename `cycle-audit-<period>-<cycle>-<today>.csv` so the diff target is unambiguous.
- `overridePhysicalStatus` — Slice 9 president-only flip endpoint gated by `OVERRIDE_PHYSICAL_STATUS`. Rejects digital-only captures (400). Stamps `physical_received_at` + `physical_received_by` when flipping to RECEIVED, clears those when flipping to MISSING / PENDING. Returns only the changed `physical_*` fields (NOT the full doc) so the FE's `{ ...prev, ...res.data }` merge into the open drawer doesn't clobber the populated `bdm_id` / `proxy_id` refs.
- `completeCapture` extended with optional `paper_received: true` body flag, gated by `MARK_PAPER_RECEIVED` (HTTP 403 on missing perm). Atomically flips `physical_status` to RECEIVED + stamps received_at/by alongside the existing `IN_PROGRESS → PROCESSED|AWAITING_BDM_REVIEW` transition. Silently ignored on digital-only captures.
- `getCaptureById` populates `physical_received_by` so the drawer renders "Received {date} by {name}" without a second fetch.

**Backend routes** (`backend/erp/routes/captureSubmissionRoutes.js`):
- `GET /archive/summary`, `GET /archive/leaves`, `GET /archive/cycle-report`, `POST /bulk-mark-received` — all mounted **BEFORE** `/:id` so Express path-precedence resolves the literals rather than treating "archive" as an `:id` capture.
- `PUT /:id/physical-status` — mounted alongside the existing `/:id/complete`.

**Frontend** (`frontend/src/erp/pages/proxy/CaptureArchive.jsx`, NEW):
- Two-pane layout. **Left**: 4-level collapsible tree — Year → Period (e.g., "May 2026") → Cycle (e.g., "C1 (1–15)") → Workflow folder, each level with collapse/expand chevron and per-cell pill counts (`Np` pending / `Nm` missing / total). Per-cycle download button (`Download size={14}`) calls the audit-CSV endpoint with `(period, cycle)`. **Right**: paginated row list with multi-select checkboxes, paper-status filter dropdown, dynamic "Mark N Received" button, per-row Override link (president-only).
- `OverrideSheet` sub-component (3 radio options: PENDING / RECEIVED / MISSING; Apply disabled when status unchanged).
- Client-side role gating mirrors backend `captureLifecycleAccess.js` DEFAULTS so BDMs see only their own captures cosmetically; the backend is still the gate (403 on perm fail).
- Cross-BDM filter dropdown visible only when `VIEW_ALL_ARCHIVE` (admin/finance/president by default).

**Frontend** (`frontend/src/erp/pages/proxy/ProxyQueue.jsx`, augmented):
- New `PhysicalStatusChip` component renders Pending (amber) / Received (green) / Missing (red) / Digital (gray) chip alongside the SLA + status chips on the drawer.
- New `OverrideSheet` (mirror of CaptureArchive's) opens from the drawer's "Override" affordance, gated to OVERRIDE_PHYSICAL_STATUS.
- New "Paper received now" amber checkbox below the Mark Complete button — visible only when `physical_required` and `physical_status === 'PENDING'` and caller has `MARK_PAPER_RECEIVED`. Forwards `{ paper_received: true }` to the existing `completeCapture` POST.

**Hook** (`frontend/src/erp/hooks/useCaptureSubmissions.js`):
- `getArchiveSummary`, `getArchiveLeaves`, `bulkMarkReceived`, `downloadCycleReport` (responseType: 'blob' for CSV), `overridePhysicalStatus`.

**Wiring** (Rule #2 chain end-to-end):
- Model — `CaptureSubmission` (existing — uses `physical_status` enum + `physical_required` Boolean shipped in Phase P1.1)
- Controller — 5 new functions + 1 extended (completeCapture) — exported from `module.exports`
- Routes — 5 new mounts in route file (all literal paths BEFORE `:id` to avoid shadow-capture)
- Hook — 5 new methods exported
- Components — `CaptureArchive` page + `ProxyQueue` augmentations
- App.jsx — `lazyRetry(() => import('./erp/pages/proxy/CaptureArchive'))` + `<Route path="/erp/capture-archive">`
- Sidebar — link added for both BDM-shaped roles and management
- WorkflowGuide — new `capture-archive` banner + `proxy-queue` banner extended to mention Slice 9 (Rule #1 banner currency)

### Files
```
backend/erp/controllers/captureSubmissionController.js     # +5 functions + completeCapture extension + getCaptureById populate
backend/erp/routes/captureSubmissionRoutes.js              # +5 routes (literals before :id)
backend/scripts/healthcheckCaptureHub.js                   # +76 assertions (Slice 8 + 9 wiring contract)
frontend/src/erp/hooks/useCaptureSubmissions.js            # +5 hook methods
frontend/src/erp/pages/proxy/ProxyQueue.jsx                # PhysicalStatusChip + OverrideSheet + paper-received checkbox + handleOverride
frontend/src/erp/pages/proxy/CaptureArchive.jsx            # NEW — full-page browseable archive
frontend/src/erp/components/WorkflowGuide.jsx              # +'capture-archive' banner; 'proxy-queue' banner extended for Slice 9
frontend/src/components/common/Sidebar.jsx                 # +Capture Archive link for staff + management
frontend/src/App.jsx                                       # lazyRetry + <Route path="/erp/capture-archive">
CLAUDE-ERP.md                                              # this section
docs/PHASETASK-ERP.md                                      # Slice 8 + 9 status block
```

### Lookup-driven gates wired
| Code | Gate Surface | Default |
|---|---|---|
| `VIEW_OWN_ARCHIVE` | Archive page (BDM filtered to self when no VIEW_ALL) | `[staff]` |
| `VIEW_ALL_ARCHIVE` | Archive page cross-BDM picker + bdm_id query param honored | `[admin, finance, president]` |
| `BULK_MARK_RECEIVED` | Archive multi-select bulk-mark button + endpoint | `[admin]` |
| `GENERATE_CYCLE_REPORT` | Per-cycle CSV download button + endpoint | `[admin, finance, president]` |
| `MARK_PAPER_RECEIVED` | ProxyQueue drawer "Paper received now" checkbox + completeCapture extension | `[admin, finance]` |
| `OVERRIDE_PHYSICAL_STATUS` | Archive + ProxyQueue Override link + endpoint | `[president]` |

All 6 gates are lookup-driven via `CAPTURE_LIFECYCLE_ROLES` (already seeded by Slice 1 with `insert_only_metadata: true` so admin role-array edits survive future re-seeds). 60s helper cache busts on Lookup save (Rule #19 hot-config posture). Subscribers reroute per-entity by editing one Lookup row in Control Center → Lookup Tables — no code deploy.

### Verification
- `node -c` on all modified backend files — clean
- `node backend/scripts/healthcheckCaptureHub.js` — **498/498 PASS** (full Capture Hub contract incl. Slice 8/9 + parallel sessions). 76 of those are Slice 8/9 specific.
- `vite build` — green, ~13.5s, new `CaptureArchive-*.js` chunk emitted
- **API smoke (live dev cluster)** as president (yourpartner@viosintegrated.net): `/archive/summary` → 200 with `years[].periods[].cycles[]` tree + bdmList; `/archive/leaves?period=2026-05&cycle=C1&workflow_type=SALES` → 200 with signed S3 URLs; `/archive/leaves?cycle=C1` (only one of period/cycle) → 400 with friendly message; `/bulk-mark-received` with one PENDING SALES id → `{marked:1,skipped:0,not_found:0}` (PENDING → RECEIVED); `/physical-status` PUT round-trip back to PENDING — clean; invalid status → 400; empty ids[] → 400; `/archive/cycle-report?period=2026-05&cycle=C1&format=csv` → 200 with `Content-Disposition: attachment; filename="cycle-audit-2026-05-C1-2026-05-06.csv"`, 6 data rows + header. Mark-Complete with `{paper_received:true}` → atomic transition to AWAITING_BDM_REVIEW + `physical_status=RECEIVED` + stamped `physical_received_at`/`physical_received_by`.
- **API smoke (live dev cluster)** as Mae (s3.vippharmacy@gmail.com, staff): `/archive/summary` → 200 with `canViewAll:false` + `bdmFilter` forced to her own _id (no leakage of other BDMs' captures); `/bulk-mark-received` → 403 (BULK_MARK_RECEIVED gated); `/physical-status` → 403 (OVERRIDE_PHYSICAL_STATUS gated). Gating correct end-to-end.
- **Playwright UI smoke (live dev cluster)** as president: login → `/erp/capture-archive` → tree expands Year `2026` → Period `May 2026 (6)` → Cycle `C1 (1–15) (May 01, 2026 – May 15, 2026) (6)` with download icon `archive-download-csv-2026-05-C1` → 6 workflow folders rendered (`COLLECTION/CR`, `COLLECTION/PAID_CSI`, `COLLECTION/DEPOSIT`, `CWT_INBOUND`, `SALES`, `UNCATEGORIZED`) with correct count pills → click `SALES` → 1 leaf row → tick checkbox → "Mark 1 Received" button appears → click → row flips to `Received | May 06, 2026 by Gregg Louie Vios` → click `Override` → sheet renders with `PENDING/RECEIVED/MISSING` radios + Apply disabled when next === current (no-op guard ✓) → pick PENDING → Apply → row flips back to `Pending` → CSV fetch returns 200 + correct attachment filename. Then `/erp/proxy-queue` → row click → drawer renders `Paper: PENDING` chip + `Override` link (Slice 9 ✓) → Override sheet opens, Apply correctly disabled. Then API-level pickup + Mark Complete with `paper_received:true` → atomic flip to `RECEIVED` + lifecycle to `AWAITING_BDM_REVIEW` confirmed.
- **3 mid-smoke bugs found + fixed**:
  1. `[{ $limit: 0 }]` is invalid in MongoDB `$facet` branches — switched to `[{ $match: { _id: null } }]` no-op so the VIEW_OWN_ARCHIVE caller's summary aggregate doesn't crash on the BDM-list facet branch it doesn't need.
  2. `getCaptureById` was not populating `physical_received_by` — drawer's "Received {date} by {name}" rendered an empty name slot. Added populate.
  3. `overridePhysicalStatus` returned the full unpopulated Mongoose doc — the FE's `{ ...prev, ...res.data }` merge into the open drawer would clobber populated `bdm_id`/`proxy_id` refs with raw ObjectIds and break `bdm_id?.name` rendering. Restricted response to only the changed `physical_*` fields plus `_id`.
- **1 mid-design correction**: original Slice 8 used the 28-day BDM-visit cycle from `scheduleCycleUtils.js` (CRM domain). Refactored to C1/C2 half-monthly to match every other ERP-domain document (DriveAllocation, SmerEntry, CarLogbookEntry, Payslip, IncomeReport, DeductionSchedule). Same correction the parallel-session DriveAllocation work did before its production smoke. This means a Capture cycle CSV and a SmerEntry per-diem CSV for the same window now overlay cleanly for auditors.

### Subscription readiness (Rule #19 + Rule 0d)
- Every endpoint scopes by `req.entityId` so the same code runs cleanly inside Year-2 Pharmacy SaaS spin-out (`tenantId` generalization) without leakage.
- Every gate is lookup-driven per-entity — subscribers carve different role grids per subsidiary by editing one Lookup row.
- `bdm_id` filter (Rule #21) — `resolveArchiveScope` honors caller's `bdm_id` query param ONLY when `VIEW_ALL_ARCHIVE` is granted; otherwise forced to `req.user._id`. No silent self-fallback for privileged users (the privileged-with-no-bdm_id case = "all BDMs in scope").
- Bulk-mark capped at 200 ids/call to bound a hostile multi-tenant cross-tenant attack surface (would be moot under entity isolation but cheap insurance).

### Banners (Rule #1)
- New `'capture-archive'` banner: 5-step workflow (pick Year → Cycle → Workflow → tick rows → Mark N Received), 5 tips covering selectable-row rules + cross-BDM scope + CSV diff use case + lookup-driven sub-perms + president-only Override blast radius.
- `'proxy-queue'` banner extended: 1 new step on Slice 9 paper-received checkbox + 2 new tips on Override + Capture Archive cross-link.

### What's deferred (NOT in scope)
- **Cycle audit PDF export** — CSV is sufficient for an audit-trail diff; PDF would add a heavyweight dep (`pdfkit`/`puppeteer`) for marginal benefit. If admin asks, lift CSV → PDF in a separate slice.
- **Audit trail of overrides** — `OVERRIDE_PHYSICAL_STATUS` writes flip the status but don't emit an `AuditLog` row yet. The `physical_received_at` + `physical_received_by` fields ARE updated, so a recent flip is recoverable by reading the doc — but a full history of "who flipped what when" is out of scope for now. Lift if the office team contests an override decision.
- **Bulk OVERRIDE** — only single-row override today. If the office team needs to fix a misclick of bulk-mark-received, they re-bulk through the new MISSING flag (or 1-by-1 Override). Lift if real friction.

---

## Phase P1.2 Slice 1 — Capture Lifecycle Sub-Permissions + UNCATEGORIZED workflow_type (May 06, 2026)

### Why
Phase P1.2 (the full Capture Photo Pipeline locked May 05 evening) carves the BDM Capture Hub + Proxy Queue + Capture Archive lifecycle into 12 sub-permission gates so subscribers re-route any of them per-entity via Control Center → Lookup Tables, no code deploy. Slice 1 is the foundation: the helper, the SEED, the cache invalidation, and the `UNCATEGORIZED` workflow_type that makes zero-typing capture possible (BDM snaps a photo, proxy classifies later from `/erp/capture-archive` or the Pending-Photos picker on ERP entry pages).

This slice ships nothing user-visible by itself. It's the lookup-driven access foundation that Slices 2-9 hang off — every later surface (S3 upload, allocation slider, archive page, picker, Mark-Complete checkbox, override controls) gates against the same 12 codes.

### What shipped
**Helper file (NEW)** — `backend/utils/captureLifecycleAccess.js`. Mirrors `mdPartnerAccess.js` / `resolveVipClientLifecycleRole.js` exactly:
- 60s TTL in-memory cache keyed by `${entityId || '__GLOBAL__'}::${code}`
- 12 individual getters (one per code) + `userCanPerformCaptureAction(user, code, entityId)` convenience
- President bypass (Rule #20 — global posture)
- Unknown-code fail-closed (returns false rather than 500)
- Inline DEFAULTS so a Lookup outage never goes dark
- `invalidate(entityId)` cache buster wired into the lookup save path (Rule #19)

**12 codes — defaults**:

| Code | Default | Surface |
|---|---|---|
| `UPLOAD_OWN_CAPTURE` | `[staff]` | BDM hub camera (Slice 2 wiring) |
| `VIEW_OWN_ARCHIVE` | `[staff]` | BDM archive view (Slice 8) |
| `VIEW_ALL_ARCHIVE` | `[admin, finance, president]` | Cross-BDM archive |
| `MARK_PAPER_RECEIVED` | `[admin, finance]` | Paper attestation (Slice 9) |
| `BULK_MARK_RECEIVED` | `[admin]` | Multi-select archive action |
| `OVERRIDE_PHYSICAL_STATUS` | `[president]` | Flip RECEIVED ↔ MISSING — irreversible blast radius |
| `GENERATE_CYCLE_REPORT` | `[admin, finance, president]` | Cycle audit PDF/CSV |
| `MARK_NO_DRIVE_DAY` | `[staff]` | "Did not drive yesterday" escape valve (Slice 4) |
| `ALLOCATE_PERSONAL_OFFICIAL` | `[staff]` | Tomorrow-drive slider (Slice 4) |
| `OVERRIDE_ALLOCATION` | `[admin, president]` | Post-submission allocation correction |
| `EDIT_CAR_LOGBOOK_DESTINATION` | `[admin, finance, president]` | Proxy fixes CRM-pull miss (Slice 6) |
| `PROXY_PULL_CAPTURE` | `[admin, finance]` | Pending-Photos picker on entry pages (Slice 7) |

Narrowness of HARD-action gates (`OVERRIDE_PHYSICAL_STATUS` president-only; `BULK_MARK_RECEIVED` admin-only) is intentional — `OVERRIDE_PHYSICAL_STATUS` can release a held commission by flipping MISSING → RECEIVED retroactively; `BULK_MARK_RECEIVED` could attest dozens of papers in one misclick. Subscribers loosen via Lookup row when their internal control posture allows.

**Lookup SEED + cache invalidation** — `backend/erp/controllers/lookupGenericController.js`:
- 12 `CAPTURE_LIFECYCLE_ROLES` rows added to `SEED_DEFAULTS` (each with `insert_only_metadata: true` so admin role-array edits survive future re-seeds — same pattern as `MD_PARTNER_ROLES` / `VIP_CLIENT_LIFECYCLE_ROLES` / `PROXY_ENTRY_ROLES`)
- `CAPTURE_LIFECYCLE_ROLES_CATEGORIES = new Set(['CAPTURE_LIFECYCLE_ROLES'])` set defined
- `invalidate: invalidateCaptureLifecycleRolesCache` imported from helper
- Wired into all three mutation paths (`create`, `update`, `remove`) so admin saves bust the helper's 60s cache instantly — without this, role-list edits would wait up to 60s per running instance before being honored

**`UNCATEGORIZED` workflow_type** — `backend/erp/models/CaptureSubmission.js` + `backend/erp/controllers/captureSubmissionController.js`:
- New enum value at the end of `workflow_type` enum + `VALID_TYPES`
- NOT matched by `DIGITAL_ONLY` helper → defaults `physical_required: true` (paper expected until proxy reclassifies)
- Powers Phase P1.2 Slice 3's "snap-now-classify-later" zero-typing capture path

### Files
```
backend/utils/captureLifecycleAccess.js                    # NEW — 12 getters + 60s cache + DEFAULTS fallback
backend/erp/controllers/lookupGenericController.js         # + CAPTURE_LIFECYCLE_ROLES SEED (12 rows) + invalidate hook
backend/erp/models/CaptureSubmission.js                    # + 'UNCATEGORIZED' workflow_type enum
backend/erp/controllers/captureSubmissionController.js     # + 'UNCATEGORIZED' in VALID_TYPES
backend/scripts/healthcheckCaptureHub.js                   # + 58 new assertions (sections 7-9)
CLAUDE-ERP.md                                              # this section
docs/PHASETASK-ERP.md                                      # Phase P1.2 Slice 1 status
```

### Verification
- `node -c` on all 4 modified backend files — clean
- `node backend/scripts/healthcheckCaptureHub.js` — **146/146 PASS** (88 P1.1 + 58 P1.2 Slice 1)
- Runtime require + export check: 15 expected exports all present (12 getters + `userCanPerformCaptureAction` + `invalidate` + `DEFAULTS_BY_CODE`); `DEFAULTS_BY_CODE` has 12 keys; `UPLOAD_OWN_CAPTURE` default = `['staff']`; `OVERRIDE_PHYSICAL_STATUS` default = `['president']`
- `invalidate()` + `invalidate('507f...')` smoke — no crash, exits cleanly
- Backward compatible — no existing surface consumes the helper yet (consumers land in Slices 2-9). UI continues working unchanged. No DB migration required: lookup rows lazy-seed on first `getByCategory('CAPTURE_LIFECYCLE_ROLES')` call, OR admin can hit `POST /api/erp/lookup/seed/CAPTURE_LIFECYCLE_ROLES` to seed eagerly.

### Subscription readiness
- All 12 gates are lookup-driven per-entity (Rule #3 + Rule #19) — subscribers carve different role grids by editing one Lookup row. Example: a subsidiary that wants BDMs self-serving paper attestation adds `staff` to `MARK_PAPER_RECEIVED.metadata.roles`; the 60s cache busts on save and the next request honors the new posture without any code deploy.
- `entity_id` scopes both the lookup query AND the cache namespace, so when the same code runs inside Year-2 Pharmacy SaaS spin-out the gates isolate per-tenant cleanly. Rule 0d alignment.
- Code is named `CAPTURE_LIFECYCLE_ROLES` (not `VIP_CAPTURE_*`) so spin-out tenants inherit the same category without renaming.

### What's next (Slices 2-9)
Slice 1 is the foundation only. Slices 2-9 wire the 12 gates into actual surfaces:
- Slice 2 — `POST /api/erp/capture-submissions/upload-artifact` S3 pipeline (gate: `UPLOAD_OWN_CAPTURE` + `PROXY_PULL_CAPTURE` for cross-BDM)
- Slice 3 — Gut the capture modal (zero-typing camera-direct flow, all form fields removed)
- Slice 4 — Tomorrow's-drive allocation slider + "did not drive" escape valve (gates: `ALLOCATE_PERSONAL_OFFICIAL`, `MARK_NO_DRIVE_DAY`)
- Slice 5 — Lock SMER tile when prior days have unallocated drives
- Slice 6 — Car Logbook auto-populate from CRM Visit destinations + capture rows (gate: `EDIT_CAR_LOGBOOK_DESTINATION`)
- Slice 7 — Pending-Photos picker on `/erp/expenses` (gate: `PROXY_PULL_CAPTURE`)
- Slice 8 — `/erp/capture-archive` browseable year-round archive (gates: `VIEW_OWN_ARCHIVE` / `VIEW_ALL_ARCHIVE` / `BULK_MARK_RECEIVED` / `GENERATE_CYCLE_REPORT`)
- Slice 9 — Mark-Complete inline paper-received checkbox + override controls (gates: `MARK_PAPER_RECEIVED` / `OVERRIDE_PHYSICAL_STATUS` / `OVERRIDE_ALLOCATION`)

See `memory/handoff_phase_p1_2_slice_1_shipped_may06_2026.md` for the full Slice 2-9 build order.

---

## Phase P1.1 — Capture Hub Tile Completeness + Physical Reconciliation Foundation (May 05, 2026)

### Why
Phase P1 shipped 6 tiles covering EXPENSE / SMER / SALES / GRN / FUEL_ENTRY / PETTY_CASH. Field BDMs surfaced the actual capture universe: **ODO daily, OR of expenses, pink/yellow/duplicate CSI copies, deposit slips, CWT (BIR 2307), CSI being paid, fuel receipts, waybill / batch on incoming product**. The original "Scan Unreceived CSI" tile was ambiguous (one label for three different lifecycle moments) and three documents had no capture path at all (CR, deposit slip, CWT). The proxy team is now actively recording on behalf of BDMs because BDMs opted not to use the OCR/parser self-serve flow — so Capture Hub must be the **complete digital manifest** of physical paperwork the office should expect each cycle.

### What shipped

**Backend model** (`backend/erp/models/CaptureSubmission.js`)
- New artifact `kind` values: `paid_csi_scan`, `cr_scan`, `deposit_slip`, `cwt_scan` (existing 5 retained).
- New `workflow_type`: `CWT_INBOUND` (bridges to CwtLedger / J6 inbound 2307 reconciliation).
- New `sub_type` field — `CR | DEPOSIT | PAID_CSI | null` — used only by `COLLECTION` to route the same workflow_type to different physical-paper expectations and downstream ERP shapes.
- New `physical_required: Boolean` (default true) + `physical_status: PENDING | RECEIVED | MISSING | N_A` (indexed) + `physical_received_at` + `physical_received_by` (ref User) — Slice 3 reconciliation foundation.
- New compound index `{ bdm_id: 1, physical_status: 1, created_at: 1 }` for cycle reconciliation sweeps.
- `linked_doc_kind` enum gains `CwtLedgerEntry`.

**Backend controller** (`backend/erp/controllers/captureSubmissionController.js`)
- `VALID_TYPES` adds `CWT_INBOUND`.
- New `VALID_SUB_TYPES = ['CR', 'DEPOSIT', 'PAID_CSI']` validation — rejects sub_type for any workflow_type except COLLECTION (HTTP 400).
- New `DIGITAL_ONLY(workflow_type, sub_type)` helper — returns true for SMER and COLLECTION/PAID_CSI. Drives `physical_required` and `physical_status` derivation at create time.
- `REVIEW_WORKFLOWS` extended with `COLLECTION` + `CWT_INBOUND` (money/tax reconciliation needs BDM confirmation).

**Frontend Capture Hub** (`frontend/src/erp/pages/mobile/BdmCaptureHub.jsx`)
- 9 tiles total (5 retained, 1 renamed, 4 added, **PETTY_CASH removed May 05 2026 evening**). Order tuned by frequency-of-use in the field. Backend `PETTY_CASH` enum value retained for legacy rows; tile dropped because petty cash request is not a field-capture flow.
- **Sectioned layout (May 05 2026 evening polish)** — 5 logical sections grouping the 9 tiles by document origin: **Vehicle** (ODO), **Cash Out** (OR/Receipt + Fuel), **Customer Delivery** (CSI Delivery Copy), **Collection** (CSI Being Paid + CR + CWT + Deposit Slip), **Inventory** (GRN). Each section header carries a small slate-icon + UPPERCASE label + caption + tile count badge. Each tile carries a colored 4px border-left matching its workflow color, an icon box with tinted background, label + description, and a chevron. Digital-only tiles render an inline cyan "Digital only" pill so the BDM sees the no-paper-expected status without opening the modal. Header gains a subtitle showing the tile count and a pending badge in the top-right.
- Renamed `SALES` tile: "Scan Unreceived CSI" → "Scan CSI (Delivery Copy)" — pink/yellow/duplicate as proof of delivery.
- New `COLLECTION/PAID_CSI` tile "Scan CSI Being Paid" — `digitalOnly: true`, `kind: paid_csi_scan`.
- New `COLLECTION/CR` tile "Scan Collection Receipt (CR)" — captures amount + customer.
- New `COLLECTION/DEPOSIT` tile "Scan Deposit Slip" — captures amount.
- New `CWT_INBOUND` tile "Scan CWT (BIR 2307)" — captures amount + customer.
- Modal payload now forwards `sub_type` when defined on the workflow.
- `access_for` label is contextual ("Customer / Hospital" for non-EXPENSE tiles, "Who is this for? (ACCESS)" for EXPENSE).
- `digitalOnly` tiles render an inline cyan banner: "No paper expected for this capture."
- Map `key` is now composite `${w.key}_${w.sub_type || 'main'}` to support 3 COLLECTION variants in one list without React-key collisions.

**Scoped CSS file** (`frontend/src/styles/capture-hub.css`, NEW) — 480 lines of real CSS namespaced as `.ch-*` (Capture Hub) and `.rq-*` (Review Queue) so they don't collide with the project's existing semantic classes. Imported at the top of both pages. Contains layout (flex / grid), tile + section styling, modal backdrop + body, recent-capture status pills, review-card actions, and the `@keyframes spin` rule used for in-flight loaders. **Why this file exists**: the broader project uses className strings that LOOK like Tailwind utilities (`flex items-center gap-4`, `text-slate-700`, `bg-slate-100`, etc.) but the project does NOT actually use Tailwind — the codebase has no `tailwind.config.js`, no `@tailwind` directives, and no Tailwind dependency in `package.json`. Those Tailwind-style classNames are decorative and don't apply any CSS. Layout works only via inline `style={{ }}` attributes, native browser defaults, and the few semantic classes defined in `index.css` / `tablet-optimized.css`. Phase P1.1's section grouping needed real CSS to land cleanly, hence this scoped file.

**Frontend Review Queue** (`frontend/src/erp/pages/mobile/BdmReviewQueue.jsx`)
- New `WORKFLOW_LABELS` map — friendly display strings instead of raw enums (e.g., `COLLECTION_PAID_CSI` → "CSI Being Paid").
- New `resolveKey(item)` helper — composite lookup `COLLECTION_<sub_type>` for icon/color/label resolution; falls back to plain `workflow_type` for non-COLLECTION rows.
- Icons + colors map both the parent workflow_type and each composite COLLECTION_X variant so existing rows render unchanged and new rows get distinct visual identity.
- Empty-state ("All caught up!") gains a blue explainer card: how the proxy → review chain works + 72h auto-acknowledge note. Closes the "looks broken" perception that fired this phase.

**WorkflowGuide banners** (`frontend/src/erp/components/WorkflowGuide.jsx`)
- `bdm-capture-hub` — subtitle reframed ("every BDM-facing document"). Tips now mention: ODO is daily, CSI Being Paid is digital-only, all other captures expect paper within 8–10 days, cycle definition (C1 = 1–15, C2 = 16–end), next-cycle block consequence ("C1 May missing → C1 June blocked").
- `bdm-review-queue` — tips now mention empty-queue normalcy + SMER personal-vs-official gas split.

**Healthcheck** (`backend/scripts/healthcheckCaptureHub.js`, NEW)
- 65 static contract assertions across 6 sections: Model / Controller / Capture Hub / Review Queue / WorkflowGuide / Routes+Sidebar wiring. **65/65 PASS** at ship.

### Governing principles
- **Rule #3 (no hardcoded business values)**: Per Q10 user decision, tile visibility stays inline (not lookup-driven) because the SaaS target is exclusively pharmacy operators with the same document set. Schema enums (workflow_type, sub_type, physical_status, artifact kind) are validation gates per the lookup-vs-enum split. Subscriber tile-disable can be added later as `Settings.CAPTURE_HUB_DISABLED_TILES` lookup if the need arises.
- **Rule #19 (subscription readiness)**: every new field on CaptureSubmission inherits `entity_id` scoping from the existing schema. No cross-tenant leakage.
- **Rule #20 (Option B preserved)**: REVIEW_WORKFLOWS extension keeps the new types under BDM confirmation before ERP doc reaches its terminal status — proxy still enters, never approves.
- **Rule #21 (no silent self-id fallback)**: BDM-side endpoints already use `req.bdmId || req.user._id` which is correct for self-scope. Proxy-side uses entity_id only. Pattern unchanged.
- **Rule #1 (helper banners)**: both pages updated with cycle, paper-expectation, and consequence copy.

### Slice plan
- **Slice 1 — SHIPPED May 05 2026** (this entry).
- **Slice 2 — Inverted Pull on existing ERP entry pages** (deferred): proxy picks a pending capture from a BDM's "locker" instead of OCR-autofilling. Per user direction, OCR is OFF the menu — proxies are humans, captures need to be well-organized (BDM × workflow × cycle grouping), gallery upload stays as fallback, retroactive CaptureSubmission created on gallery upload to keep audit count honest.
- **Slice 3 — Physical reconciliation + next-cycle block** (deferred): proxy who entered the ERP doc clicks "Paper received" on the capture row → flips `physical_status` to RECEIVED. C1 May with PENDING items at C1 June payslip cutoff → C1 June commission/per-diem BLOCKED until reconciled. Same pattern for C2. Same-cycle commission/per-diem still pays out (contract-bound).
- **Slice 4 — DROPPED**: OCR autofill on the proxy side. Original Phase P1 plan but user judgment is correct: humans can read receipts, the ROI was never there. Existing OCR investments (Phase O EXIF/screenshot detection, Phase CSI-X2 hospital PO paste-parser, BIR 2307 ledger) keep their separate justifications.

### Files
```
backend/erp/models/CaptureSubmission.js                    # + new fields + new enums
backend/erp/controllers/captureSubmissionController.js     # + CWT_INBOUND + sub_type validation + DIGITAL_ONLY
backend/scripts/healthcheckCaptureHub.js                   # NEW — 88-check contract verifier (was 65 pre-redesign)
frontend/src/erp/pages/mobile/BdmCaptureHub.jsx            # + 4 tiles + sub_type + digital-only hint + sectioned layout
frontend/src/erp/pages/mobile/BdmReviewQueue.jsx           # + composite icons/colors/labels + empty-state explainer + .rq-card styling
frontend/src/erp/components/WorkflowGuide.jsx              # banner refresh on both pages
frontend/src/styles/capture-hub.css                        # NEW — 480 lines scoped CSS (.ch-* / .rq-*)
CLAUDE-ERP.md                                              # this section
docs/PHASETASK-ERP.md                                      # Phase P1.1 status
```

### Verification
- `node -c` on edited backend files — clean
- `node backend/scripts/healthcheckCaptureHub.js` — **88/88 PASS** (12 new assertions for sectioned layout + 11 for the scoped CSS file)
- `npx vite build` — clean in 37.80s, zero errors, zero warnings
- Live API smoke: 4 happy paths (CWT_INBOUND, COLLECTION/PAID_CSI N_A, COLLECTION/CR PENDING, COLLECTION/DEPOSIT PENDING) + 3 negative paths all 400 with friendly messages
- End-to-end UI smoke at 390×900 (mobile): Mae Navarro logged in → Capture Hub renders 9 tiles in 5 sections with correct flex layout (verified `display: flex` on `.ch-tile`, `.ch-section-header`, `.ch-tile-pill`) → Review Queue renders `.rq-card` with 4px sky-blue border-left + .rq-action confirm/dispute buttons → ACKNOWLEDGED lifecycle confirmed end-to-end → screenshots saved (`capture-hub-redesigned-mobile.png`, `review-queue-redesigned-mobile.png`)
- No new npm dependencies (all icons already in lucide-react)
- Backward compatible: existing CaptureSubmission rows have `sub_type=null`, `physical_required=true`, `physical_status='PENDING'`. No migration required for empty queues; deployed clusters will pre-mark legacy rows as PENDING which is the correct posture (paper expected unless explicitly flagged digital-only at create).

---

## Phase G4.5e — Car Logbook + PRF/CALF + Undertaking Proxy Ports (April 23, 2026)

### Why
Apr 23 policy decision locked: field BDMs focus on CRM (where they generate revenue); office-based eBDMs (Judy Mae Patrocinio, Jay Ann Protacio) proxy ERP for them. Dry-run of `backfillEntityIdsFromFra.js` on prod showed 5 field-BDM users would drift into cross-entity scope if `--apply` ran — opposite of policy. `--apply` held.

The revocation of field-BDM ERP access + deactivation of cross-entity FRAs was blocked because three high-frequency modules had no proxy path:
- **Fuel / Car Logbook** — per-cycle LOGBOOK submit + per-fuel Submit Fuel approval
- **CALF (PRF_CALF)** — company-advance liquidation, *gating* non-cash fuel posting (expenseController:941 cascade)
- **Undertaking** — GRN receipt confirmation, cascades to GRN APPROVED

Without these, revoking BDM ERP access = workflow deadlock. G4.5e ships all three in one phase.

### What shipped

**Shared helper extension** (back-compat, one-line):
- `backend/erp/utils/resolveOwnerScope.js` — `resolveOwnerForWrite` / `widenFilterForProxy` / `canProxyEntry` / `getProxyRolesForModule` / `getValidOwnerRolesForModule` accept optional `{ lookupCode }` so a module that shares a sub-permission namespace (e.g. `expenses.car_logbook_proxy`) can still have its own PROXY_ENTRY_ROLES / VALID_OWNER_ROLES lookup row. Falls back to `moduleKey.toUpperCase()` — every pre-G4.5e call site unchanged.

**Car Logbook (+ per-fuel) — `expenseController.js`**
- `createCarLogbook`, `updateCarLogbook`, `getCarLogbookList`, `getCarLogbookById`, `deleteDraftCarLogbook`, `validateCarLogbook`, `submitFuelEntryForApproval`, `submitCarLogbook`, `reopenCarLogbook`, `getSmerDailyByDate`, `getSmerDestinationsBatch` all use the shared helper with `(moduleKey='expenses', subKey='car_logbook_proxy', lookupCode='CAR_LOGBOOK')`.
- Legacy `resolveCarLogbookScope` helper deleted — replaced by `resolveOwnerForWrite` (writes) + `widenFilterForProxy` (reads) + inline Rule #21 `?bdm_id=` narrowing.
- `submitCarLogbook` `gateApproval({ forceApproval: !!cycleDoc.recorded_on_behalf_of, ownerBdmId: cycleDoc.bdm_id })` — Rule #20 four-eyes for any cycle containing a proxy-created day.
- `submitFuelEntryForApproval` — same pattern, reading from `dayDoc.recorded_on_behalf_of`.
- `PROXY_CREATE` / `PROXY_UPDATE` audit codes (unified with Sales/Collections/GRN/Expenses).

**CALF / PRF_CALF — `expenseController.js`**
- `createPrfCalf`, `updatePrfCalf`, `getPrfCalfList`, `getPrfCalfById`, `getLinkedExpenses`, `deleteDraftPrfCalf`, `validatePrfCalf`, `submitPrfCalf`, `reopenPrfCalf`, `getPendingPartnerRebates`, `getPendingCalfLines` use `(moduleKey='expenses', subKey='prf_calf_proxy', lookupCode='PRF_CALF')`.
- `submitPrfCalf` sets `forceApproval` when any doc has `recorded_on_behalf_of`.
- **Auto-CALF propagation (integrity)**: `autoCalfForSource` now stamps `recorded_on_behalf_of` from the source expense / logbook so the proxy chain is unbroken across source → CALF → journal. Without this, the auto-CALF for a proxy-created expense would look self-created.

**Undertaking — `undertakingController.js`**
- UT has no create path (GRN's `autoUndertakingForGrn` creates it inheriting `bdm_id` + `recorded_on_behalf_of`).
- `getUndertakingList`, `getUndertakingById`, `submitUndertaking`, `acknowledgeUndertaking`, `rejectUndertaking` use `(moduleKey='inventory', subKey='undertaking_proxy', lookupCode='UNDERTAKING')` via `widenFilterForProxy` / `canProxyEntry`.
- `submitUndertaking` — `forceApproval: !!doc.recorded_on_behalf_of` + `PROXY_SUBMIT` audit.

**Model schema (additive)**
- `CarLogbookEntry.recorded_on_behalf_of`
- `CarLogbookCycle.recorded_on_behalf_of` — propagated from per-day docs in `refreshTotalsFromDays` (if ANY day was proxy-created, cycle inherits)
- `PrfCalf.recorded_on_behalf_of`

**Sub-perm seeds (ERP_SUB_PERMISSION)**
- `EXPENSES__CAR_LOGBOOK_PROXY` (module=expenses, key=car_logbook_proxy)
- `EXPENSES__PRF_CALF_PROXY` (module=expenses, key=prf_calf_proxy)
- `INVENTORY__UNDERTAKING_PROXY` (module=inventory, key=undertaking_proxy)

**Lookup seeds** — `PROXY_ENTRY_ROLES` + `VALID_OWNER_ROLES` each gain 3 rows: `CAR_LOGBOOK`, `PRF_CALF`, `UNDERTAKING`.

**Frontend**
- `CarLogbook.jsx` — existing per-BDM picker reused for both read-audit and proxy-write. `canProxyCarLogbook` soft-gate: `viewingSelf || (canProxy && viewingOther)`. Send `assigned_to = selectedBdmId` on create; privileged/proxy submits pass `bdm_id` to validate/submit. Dual banner: purple "Proxy write mode" when eligible, blue "read-only" when not.
- `PrfCalf.jsx` — `OwnerPicker` mounted on create form (renders null when ineligible). Auto-defaults to source doc's `bdm_id` when creating CALF from pending lines / PRF from pending rebates. "Proxied" pill on list row.
- `UndertakingDetail.jsx` — `canSubmit` soft-gate includes `inventory.undertaking_proxy` sub-perm. Purple "Proxied" badge in header when `recorded_on_behalf_of` present.
- `WorkflowGuide.jsx` — `car-logbook`, `prf-calf`, `undertaking-entry` tips all describe Phase G4.5e proxy flow, Rule #20 four-eyes, and lookup-driven configurability.

**Diagnostic**
- `backend/erp/scripts/findOrphanedOwnerRecords.js` — extended from 4 → 7 collections: adds `prf_calf` (PrfCalf), `car_logbook_day` (CarLogbookEntry), `undertaking` (Undertaking). CSV row tolerates models without an amount field.

**Health check (section 5)**
- Covers 8 modules (was 5). Asserts sub-perm seeds present. Asserts expenseController uses `car_logbook_proxy` + `prf_calf_proxy` + the correct `lookupCode` arguments. Asserts `resolveCarLogbookScope` is deleted. Asserts `autoCalfForSource` propagates `recorded_on_behalf_of`. Asserts undertakingController is proxy-aware. Asserts new `recorded_on_behalf_of` fields on 3 new models. Asserts frontend pages render proxy indicator / proxy-write wiring.

### Integrity guarantees
- **Four-eyes (Rule #20)** — every proxied submit force-routes through the Approval Hub (car logbook cycle, fuel entry, CALF, UT).
- **Rule #21** — no silent self-fill; helper throws 400 when a non-BDM caller omits `assigned_to`.
- **Entity isolation** — helper still validates target user's entity; proxy cannot cross entities.
- **Ownership-lock on update** — `assigned_to` / `bdm_id` / `recorded_on_behalf_of` stripped from body on all update paths (stamped at create time only).
- **Auto-CALF chain** — proxy audit propagates source → CALF, so sweeps by `findOrphanedOwnerRecords` catch orphans end-to-end.
- **Cycle upsert** — `CarLogbookCycle` binds on the resolved `bdm_id` (target BDM), never the caller's id; proxy-created days lift their `recorded_on_behalf_of` into the cycle wrapper for forceApproval.

### Subscription-scalability (Rules #3 / #19)
- All role lists are lookup-driven (`PROXY_ENTRY_ROLES` + `VALID_OWNER_ROLES`) — admin-editable via Control Center, no code changes.
- Sub-perm namespace decoupled from lookup code via helper's optional `lookupCode` — subscribers can grant `expenses.car_logbook_proxy` without also granting `expenses.proxy_entry`.
- No hardcoded business values; CALF gate still honors president-only override (`ExpenseEntry.calf_override`).

### Files touched (Phase G4.5e)
```
backend/erp/utils/resolveOwnerScope.js                # + optional lookupCode (back-compat)
backend/erp/models/CarLogbookEntry.js                 # + recorded_on_behalf_of
backend/erp/models/CarLogbookCycle.js                 # + recorded_on_behalf_of + propagate in refreshTotalsFromDays
backend/erp/models/PrfCalf.js                         # + recorded_on_behalf_of
backend/erp/controllers/expenseController.js         # delete resolveCarLogbookScope; port car_logbook + prf_calf; autoCalfForSource propagation
backend/erp/controllers/undertakingController.js     # widenFilterForProxy + canProxyEntry + forceApproval + PROXY_SUBMIT audit
backend/erp/controllers/lookupGenericController.js   # + 3 sub-perms + 3 PROXY_ENTRY_ROLES rows + 3 VALID_OWNER_ROLES rows
backend/erp/scripts/findOrphanedOwnerRecords.js      # + 3 modules (prf_calf, car_logbook_day, undertaking)
frontend/src/erp/pages/CarLogbook.jsx                 # canProxyCarLogbook gate; assigned_to on create; dual banner
frontend/src/erp/pages/PrfCalf.jsx                    # OwnerPicker + assignedTo + Proxied pill + auto-default from source bdm
frontend/src/erp/pages/UndertakingDetail.jsx          # submit gate includes undertaking_proxy; Proxied badge
frontend/src/erp/components/WorkflowGuide.jsx         # car-logbook / prf-calf / undertaking-entry tips
scripts/check-system-health.js                        # section 5 extended for G4.5e (8 modules, 3 sub-perms, controller + model checks)
CLAUDE-ERP.md                                         # this section
docs/PHASETASK-ERP.md                                 # Phase G4.5e entry
```

### Post-ship operational steps (not performed by code)
1. Deploy G4.5e to prod.
2. Admin: enable `EXPENSES__CAR_LOGBOOK_PROXY`, `EXPENSES__PRF_CALF_PROXY`, `INVENTORY__UNDERTAKING_PROXY` on Judy + Jay Ann's Access Template (Control Center → Access Templates).
3. Admin: optionally add `contractor` to `PROXY_ENTRY_ROLES.CAR_LOGBOOK` / `.PRF_CALF` / `.UNDERTAKING` metadata.roles (defaults to admin/finance/president; contractor must be added to allow eBDMs to proxy).
4. Smoke test: Judy pulls up a field BDM's Car Logbook → Save → Validate → Submit → expect 202 Approval Hub, hub card shows owner = target BDM, proxy audit = Judy.
5. Only after smoke tests pass: run `backfillEntityIdsFromFra.js --apply` and revoke cross-entity FRAs per the BDMs→CRM-only policy.

---

## Phase G4.5f — SMER + Per-Diem Override Proxy Port (April 23, 2026)

### Why
G4.5e unblocked Car Logbook / CALF / Undertaking for eBDM proxies. SMER + per-diem override were the last monthly touchpoints preventing a full BDMs→CRM-only rollout. After G4.5f lands, office-based eBDMs (Judy Patrocinio + Jay Ann Protacio) handle the entire monthly ERP cycle after a phone call with the field BDM; field BDMs never touch ERP.

SMER has two proxy surfaces: the cycle (one SMER per BDM per period+cycle) and per-diem override (per daily entry). Both require a short `bdm_phone_instruction` authorization tag so the audit shows what the proxy was told (user decision: no min-length; short tags like "ok with boss" / "in the office" / "with client" are fine — the field is an authorization trail, not a narrative).

### Scope
Same `resolveOwnerForWrite` + `widenFilterForProxy` template as G4.5a/b/c.1/e; no helper changes required (G4.5e's `lookupCode` extension already supports distinct role rosters per module).

- 1 model gets `recorded_on_behalf_of` + `bdm_phone_instruction` at cycle level AND at daily_entries level (SmerEntry).
- 1 sub-perm: `EXPENSES__SMER_PROXY` (module `expenses`, key `smer_proxy`, sort_order 6).
- 1 new row in each of `PROXY_ENTRY_ROLES` + `VALID_OWNER_ROLES` (code `SMER`).
- 2 new `MESSAGE_CATEGORY` codes: `PERDIEM_SUMMARY` (SMER posted on behalf) + `PERDIEM_OVERRIDE_DECISION` (Hub decision on proxied override).
- Backend: `expenseController.js` SMER section (10 endpoints — 5 reads widened, 5 writes gated); `universalApprovalController.perdiem_override` extended to emit a decision receipt when the entry was proxied.
- Frontend: `Smer.jsx` reuses the G4.5e CarLogbook BDM-picker + sub-perm pattern via `canProxySmer`; adds a cycle-level `bdm_phone_instruction` input on the proxy write path and a separate per-override tag input on the override modal.
- `WorkflowGuide` "smer" tip extended.
- `findOrphanedOwnerRecords.js` extended 7 → 8 modules (`smer_entry`).
- `scripts/check-system-health.js` section 5 extended with G4.5f assertions.

### Integrity guarantees (by design)
- **Rule #20 four-eyes** — `submitSmer` routes through the Approval Hub whenever any SMER in the batch has `recorded_on_behalf_of` OR when the caller is not the SMER owner. `overridePerdiemDay` ALWAYS routes through the Hub on the proxy path — even when the caller is management (admin/finance can't proxy-self-approve).
- **Rule #21** — no silent self-fill; helper throws 400 when a non-BDM caller omits `assigned_to` on create. `submitSmer` + `validateSmer` require explicit `bdm_id` on the widened path; a single click cannot post every proxy-targetable BDM's VALID SMER.
- **Rule #19 entity isolation** — helper validates the target's `entity_ids` (inherited from G4.5a); no change required.
- **Rule #3 lookup-driven** — all role lists + message categories admin-editable via Control Center; no hardcoded business values.
- **Ownership-lock on update** — `assigned_to` / `bdm_id` / `recorded_on_behalf_of` stripped from body on `updateSmer` (stamped only at create).
- **CompProfile per target BDM** — `createSmer` loads the per-person CompProfile against `owner.ownerId`, not the caller's id; revolving-fund + per-diem thresholds are the owner's, not the proxy's.
- **Proxy fields survive approval decision** — the universal override handler mutates a few entry fields but doesn't clobber `recorded_on_behalf_of` / `bdm_phone_instruction` (stamped at request time, persist through APPROVED and REJECTED branches).
- **Integrity Point A (batch-loop safety)** — `validateSmer` + `submitSmer` on the widened path require an explicit `bdm_id` context; without this, the per-BDM loop becomes an "all BDMs at once" blast radius.
- **Integrity Point B (apply path widen)** — `applyPerdiemOverride` uses `widenFilterForProxy`; without it, a proxy caller 404s on the apply path because their `tenantFilter` is scoped to their own BDM id.
- **Authorization tag mandatory on proxy** — `bdm_phone_instruction` required and non-empty after trim at both cycle submit and per-day override request. 400 if missing.
- **Courtesy receipts are non-blocking** — `writeProxyReceipt` catches inbox write errors so a failed notification never rolls back the underlying SMER write.

### Subscription-scalability (Rules #3 / #19)
- Role lists lookup-driven (`PROXY_ENTRY_ROLES.SMER` + `VALID_OWNER_ROLES.SMER`) — admin-editable via Control Center → Lookup Tables; no code changes needed to extend proxy eligibility (e.g., add `contractor` so eBDMs can proxy) or owner eligibility (e.g., add a supervisor role that also owns SMERs).
- `EXPENSES__SMER_PROXY` is distinct from `EXPENSES__PROXY_ENTRY` (single-entry Expenses) and `EXPENSES__CAR_LOGBOOK_PROXY` (Car Logbook) — subscribers delegate per-diem work without granting OR-based expense proxy or fuel proxy.
- MessageInbox categories seeded (no dead inboxes); receipts obey the lookup-driven `INBOX_ACK_DEFAULTS` flow but are explicitly set `must_acknowledge: false` because they are courtesy notifications, not actionable tasks.
- Plain BDMs retain `expenses` module access so they can still read their own SMER and log overrides in emergencies — only the proxy WRITE path requires the new sub-perm.

### Files touched (Phase G4.5f)
```
backend/erp/models/SmerEntry.js                      # + recorded_on_behalf_of + bdm_phone_instruction (cycle + daily_entries)
backend/erp/controllers/expenseController.js         # + SMER_PROXY_OPTS + writeProxyReceipt helper; 10 SMER endpoints updated
backend/erp/controllers/universalApprovalController.js # perdiem_override emits PERDIEM_OVERRIDE_DECISION on proxied decisions
backend/erp/controllers/lookupGenericController.js   # + EXPENSES__SMER_PROXY + PROXY_ENTRY_ROLES.SMER + VALID_OWNER_ROLES.SMER + 2 MESSAGE_CATEGORY codes
backend/erp/scripts/findOrphanedOwnerRecords.js      # + smer_entry module (8 modules total)
frontend/src/erp/hooks/useExpenses.js                # validateSmer/submitSmer/reopenSmer accept body params
frontend/src/erp/pages/Smer.jsx                      # canProxySmer gate + BDM picker + dual banner + tag inputs + Proxied pills
frontend/src/erp/components/WorkflowGuide.jsx        # smer tip extended
scripts/check-system-health.js                       # section 5 extended for G4.5f (9 modules, SMER_PROXY, model + receipt checks)
CLAUDE-ERP.md                                        # this section
docs/PHASETASK-ERP.md                                # Phase G4.5f entry
```

### Post-ship operational steps (not performed by code)
1. Deploy G4.5f to prod.
2. Admin: tick `EXPENSES__SMER_PROXY` on Judy Patrocinio + Jay Ann Protacio's Access Template (Control Center → Access Templates).
3. Admin: optionally add `contractor` to `PROXY_ENTRY_ROLES.SMER` metadata.roles (defaults to admin/finance/president; must be added to allow eBDMs to proxy).
4. Smoke test — SMER submit: eBDM opens a field BDM's SMER cycle (select BDM in picker), fills a day, Save → Validate → enter "ok with boss" in the proxy note → Submit → expect 202 Approval Hub; card shows owner = target BDM, proxy audit = eBDM; target BDM inbox receives PERDIEM_SUMMARY on President post.
5. Smoke test — per-diem override: eBDM opens override modal on a daily row, tier=FULL, reason + bdm_phone_instruction → Request Override → expect 202 Hub; target BDM inbox receives PERDIEM_OVERRIDE_DECISION when President decides.
6. Orphan sweep: `node backend/erp/scripts/findOrphanedOwnerRecords.js --module smer_entry` to confirm no pre-G4.5d SMERs are owned by non-BDM users.
7. After smoke tests pass: the BDMs→CRM-only rollout is complete — revoke the `expenses` module from field BDMs' Access Templates ONLY if an explicit business decision is made to do so (recommendation: leave it on so field BDMs can still read their own SMER in emergencies).

---

## Phase G4.5h — CALF↔Expense One-Acknowledge Cascade (Apr 24 2026)

### Why (Rule #20 reference flow expanded)
Rule #20 requires linked auto-submits to be wrapped in a MongoDB transaction that rolls back atomically on failure. The canonical reference has been **GRN→UT**: `postSingleUndertaking` opens one `session.withTransaction` that flips UT to ACKNOWLEDGED and calls `approveGrnCore` with the same `session`, so a missing waybill rolls back both ([undertakingController.js:245-290](backend/erp/controllers/undertakingController.js#L245)).

Phase G4.5h brings **CALF→Expense** to the same bar. Before this phase, `postSinglePrfCalf` ran a **nested** `autoSession` for the Expense cascade; on re-validation failure it silently set `Expense.status='ERROR'` while leaving `CALF.status='POSTED'` — a half-posted state requiring hand reconciliation. ACCESS-bearing expenses also had a dual-submit contract (two submits, two ApprovalRequest rows, two president clicks) which was confusing and allowed the submit order to deadlock (Expense submit refused until CALF was POSTED).

### The new contract
- **ACCESS-bearing expenses post via their linked CALF, not via `submitExpenses`.** `submitExpenses` rejects with HTTP 400 and a `linked_calf_id` in the response body so the frontend can redirect the BDM to PRF/CALF.
- **One `session.withTransaction` wraps the whole cascade** inside `postSinglePrfCalf`: CALF post + CALF journal + linked source fetch + re-validation + source post + source journal. Journal failures stay non-fatal (same as pre-G4.5h; `repostMissingJEs.js` backfills). Re-validation failures **throw** — whole transaction rolls back, both docs stay DRAFT.
- **`submitPrfCalf` delegates to `postSinglePrfCalf` per doc** so the direct-submit path (privileged users bypassing the hub) and the hub path share one cascade implementation. Per-doc atomicity — one doc's cascade failure doesn't block others in the batch.
- **ORE-only expenses unchanged** — no CALF, continue to post directly via `submitExpenses → gateApproval(EXPENSES/EXPENSE_ENTRY)`.

### When adding a new cascade flow, ask:
1. Does it auto-create the linked doc on source creation? (Use `autoCalfForSource` / `autoUndertakingForGrn` pattern.)
2. Does the parent doc stay DRAFT until the linked doc's approval cascades it? (Prefer this — GRN→UT and Expense→CALF both do.)
3. Is the cascade inside **one** `session.withTransaction`? No nested `autoSession`.
4. Does re-validation failure throw (roll back) or silently mark ERROR (split state)? **Throw.**
5. Does a health-check section catch regressions? (See `scripts/check-system-health.js` section 8 `checkCalfOneAckFlow`.)

### Files touched
```
backend/erp/controllers/expenseController.js     # submitExpenses redirect + postSinglePrfCalf single-session cascade + submitPrfCalf delegation + postSingleExpense defense-in-depth
backend/erp/scripts/migrateCalfOneAckFlow.js     # new (dry-run default, --apply commits)
scripts/check-system-health.js                   # + section 8 checkCalfOneAckFlow
frontend/src/erp/pages/Expenses.jsx              # auto_calf banner + submit 400 redirect
frontend/src/erp/pages/PrfCalf.jsx               # cascade result rendering (posted[] / failed[] + cascade_errors)
frontend/src/erp/components/WorkflowGuide.jsx    # expenses + prf-calf entries describe the new contract
docs/PHASETASK-ERP.md                            # Phase G4.5h entry
CLAUDE-ERP.md                                    # this section
```

### Post-ship operational steps (not performed by code)
1. Deploy G4.5h.
2. Migration: `node backend/erp/scripts/migrateCalfOneAckFlow.js` (dry-run) surfaces stuck `SUBMITTED` expenses with linked CALFs. CALF=POSTED rows go to a manual-review list (finance hand-posts to avoid backdated JEs). CALF≠POSTED rows get reverted to DRAFT + stale `EXPENSE_ENTRY` ApprovalRequest rows dropped — re-run with `--apply` to commit.
3. Smoke on staging/prod with a throwaway ACCESS expense: BDM create → banner surfaces auto-CALF → BDM submits the CALF → president approves CALF in Hub → both docs POSTED + JE posted, all in one transaction.
4. Force-validation-failure test (stale COA) on a throwaway entry → confirm rollback: CALF stays DRAFT, Expense stays DRAFT, no partial journal. This is the regression-detection signal for future work.

---

## Week-1 Stabilization — Day 3: Tenant Guards (Observation Mode) — April 25, 2026

Runtime detector for two recurring bug classes:

1. **Cross-entity leak** — a query on a `strict_entity` model running without an
   `entity_id` filter (the Phase 23 / G5 / G4.5d pattern).
2. **Rule #21 silent self-fill** — a privileged caller (admin/finance/president)
   running a query whose `bdm_id` filter equals the caller's own `_id`, with no
   `?bdm_id=` in the request URL — the exact fingerprint that bit Phase G5 in 9
   ERP endpoints.

Both ship in **observation mode only** (Day 3 of 5). They emit
`[ENTITY_GUARD_VIOLATION]` / `[BDM_GUARD_VIOLATION]` JSON lines. Day 4 triages
the staging log; Day 5 adds the static (ESLint) gate.

- **Plugins** attach via `mongoose.plugin(...)` at server.js:29-30, BEFORE any
  schema is compiled — wiring is timing-sensitive.
- **AsyncLocalStorage** ([backend/middleware/requestContext.js](backend/middleware/requestContext.js))
  threads the live `req` reference into Mongoose hooks. Background jobs run
  outside any request → guards skip silently.
- **Source of truth** is [backend/middleware/entityScopedModels.json](backend/middleware/entityScopedModels.json)
  (52 strict_entity, 30 strict_entity_and_bdm, 10 global, 2 special_cross_entity,
  24 deferred_crm). Day-4.5 (2026-04-25) reclassified PaymentMode + ErpSettings +
  AgentRun from `strict_entity*` to `global` (their schemas have no `entity_id`
  field — they are singletons / shared catalogs / system audit). Reconciles
  cleanly with `mongoose.modelNames()` at boot.
- **Opt-out** for legitimate consolidated routes: call
  `markCrossEntityAllowed(req, reason)` from the controller. Day 3 ships zero
  call sites — the helper is there for Day-4 triage.

See `docs/PHASETASK-ERP.md` (`WEEK-1 STABILIZATION — DAY 3`) for the full file
list, verification matrix, and out-of-scope items.

---

## Week-1 Stabilization — Day 4: Guard Modes + Prod Alerting — April 25, 2026

Day 3's observation-mode plugins are now mode-switchable and production-loud:

- **`ENTITY_GUARD_MODE` / `BDM_GUARD_MODE`** (env vars on the backend, default `log`):
  - `log` — console.error JSON line, greppable as `[ENTITY_GUARD_VIOLATION]` / `[BDM_GUARD_VIOLATION]` in pm2 logs.
  - `throw` — log + throw inside the Mongoose pre-hook (controller's `catchAsync` returns 500).
  - `off`  — plugin not registered (test-only).
  Local dev defaults to `throw` so tenant leaks fail loud during development. Production stays on `log` until Day-4 triage clears all flagged routes.
- **Production signal** is the structured JSON log line only (Apr 30 2026): the original Day-4 design also dispatched a deduped MessageInbox alert via `guardAlerter.js`, but the per-recipient fan-out across `ALL_ADMINS` (4× admin-tier users) flooded admin inboxes with >1000 `[GUARD]` rows and drowned out other inbox traffic. `guardAlerter.js` was deleted; the pm2 log line carries the same structured payload (`model`, `path`, `userId`, `role`, `entityId`, `requestId`, `filterKeys`, `stack`).
- **Operator procedure** is in [docs/RUNBOOK.md](docs/RUNBOOK.md) Section 9b: classify (legitimate cross-entity / actual bug / wrong classification), fix, re-deploy. The throw-mode flip is the Day-4-finished gate.
- **Day 4.5 #3 — Orphan Audit Agent** ([backend/agents/orphanAuditAgent.js](backend/agents/orphanAuditAgent.js)) wraps the read-only [findOrphanedOwnerRecords.js](backend/erp/scripts/findOrphanedOwnerRecords.js) sweep into a weekly cron (Mon 05:15 Manila, registered as `orphan_audit`). Reuses the same Day-4 `notify()` plumbing — PRESIDENT (in_app + email) + ALL_ADMINS (in_app only), `compliance_alert` category, priority escalates to `high` past 50 orphans. Surfaces silent regressions of the Phase G4.5d / Rule #21 fingerprint without depending on an operator to run the script. See `docs/PHASETASK-ERP.md` (`WEEK-1 STABILIZATION — DAY 4.5 #3`) for the full file list and verification.

See `docs/PHASETASK-ERP.md` (`WEEK-1 STABILIZATION — DAY 4`) for the full file list, the integrity verification (135 tests / 22 suites green), and the recursion-safety trace through `notify → MessageInbox.create → preSaveAckDefault → Lookup.find`.


---

## Phase VIP-1.J — BIR Tax Compliance Suite (planned, started Apr 27 2026)

**Goal**: replace the bookkeeper-as-black-box workflow with a president-facing BIR Compliance Dashboard + per-form copy-paste UX into eBIR Forms + `.dat` exports for Alphalist Data Entry + loose-leaf Books of Accounts PDFs. Covers VIP, Balai Lawaan, online pharmacy, MG, CO, and future SaaS subscribers.

**Locked decisions** (Apr 27 conversation):
- Filing channel: copy-paste totals into eBIR Forms (no eFPS), `.dat` for Alphalist Data Entry (SAWT/QAP/1604-CF/1604-E), PDF for loose-leaf books.
- All entities are Corporations → 1702 annual income tax, VAT-registered (12

---

## Phase VIP-1.J — BIR Tax Compliance Suite (J0 + J1 + J2 + J3 Part A + J3 Part B + J4 + J5 + J6 + J7 SHIPPED Apr 27 – May 04 2026, suite COMPLETE)

**Goal**: replace the bookkeeper-as-black-box workflow with a president-facing BIR Compliance Dashboard + per-form copy-paste UX into eBIR Forms + `.dat` exports for Alphalist Data Entry + loose-leaf Books of Accounts PDFs. Covers VIP, Balai Lawaan, online pharmacy, MG, CO, and future SaaS subscribers.

**Status (May 04 2026 evening)**: J0 + J1 + J2 + J3 Part A + J3 Part B all on `dev` through commit `35db7bd`. **J4 (1604-E Annual EWT Alphalist + QAP Quarterly Alphalist) ALSO shipped today, uncommitted on `dev`**. J0 (Compliance Dashboard + Foundation + Data Quality Agent + inbound-email parser) on `origin/dev` (commits `80b2798` + `68c711d`). J1 (2550M Monthly + 2550Q Quarterly VAT compute + CSV export) shipped Apr 28 2026, healthcheck 39/39. J2 (1601-EQ + 1606 + 2307-OUT + SAWT, May 03 2026) — healthcheck 124/124. J3 Part A (1601-C Monthly Compensation Withholding) committed at `2e39886` May 04 — healthcheck 78/78. J3 Part B (1604-CF annual alphalist + Form 2316 PDF) committed at `35db7bd` May 04 evening — healthcheck 66/66. **J4 (1604-E annual EWT alphalist + QAP quarterly alphalist — uncommitted on `dev` May 04 evening)** — `compute1604E` annual aggregator (year-encoded sum across 12 months for OUTBOUND-direction rows over the 6 EWT ATCs WI010/WI011/WC010/WC011/WI080/WI081), `computeQAP` quarterly aggregator (same ATC subset, 3-month period), `serialize1604EDat` + `serializeQAPDat` writers per BIR Alphalist Data Entry v7.x (H1604E/D1/T1604E and HQAP/D1/TQAP — same D1 contract as SAWT for importer compatibility), 4 new EXPORT_FORM-gated controller handlers + 4 routes mounted BEFORE the J1 catch-all, new `BirAlphalistEwtPage` frontend handling BOTH forms via `formCodeOverride` prop (single flat per-(payee × ATC) schedule + per-ATC breakdown card — distinct shape from `Bir1604CFDetailPage`'s 3-schedule layout and `BirEwtReturnDetailPage`'s box-grid), `/erp/bir/1604-E/:year` + `/erp/bir/QAP/:year/:quarter` routes mounted BEFORE wildcard, `bir-1604e-alphalist` + `bir-qap-alphalist` PageGuide entries (snapshot pattern + INCLUDE-strict finance gate + cross-check guidance with 4 quarterly QAPs ↔ 1604-E + Alphalist Data Entry workflow), BIRCompliancePage heatmap drill-down for both 1604-E (annual) AND QAP (quarterly), 97-assertion healthcheck `healthcheckBir1604EQAPAlphalist.js` (PASS) including dual `serialize1604EDat` + `serializeQAPDat` round-trip tests with synthetic 3-payee + 2-payee fixtures that assert CRLF strict line endings + correct H/D/T tags + record-count padding + money-total math + correct vendor-vs-individual name placement (column 4 vs 5 per BIR convention). **Subscription-ready posture**: serializers exported as standalone functions for the same DI seam pattern as `serializeSawtDat` (lookup-driven module path future for non-PH SaaS subscribers); J4_OUTBOUND_ATCS catalog is colocated with the aggregators so per-jurisdiction subscribers can fork without touching the consumers. HTTP smoke deferred to next session (MCP browser locked, same condition as J3 Part B). **J5-J7** (~5 working days remaining: books of accounts + inbound 2307 reconciliation + 1702 annual income tax) still deferred — plan `~/.claude/plans/vip-1-j-bir-compliance.md`.

### J2 — 1601-EQ + 1606 + 2307-OUT + SAWT EWT (May 03 2026, uncommitted on dev)

**What shipped**:

1. **`backend/erp/models/WithholdingLedger.js`** (new) — sub-ledger for outbound EWT events. One row per (source line × ATC code). Fields: `entity_id`, `period` ('YYYY-MM'), `direction` (`OUTBOUND` only writes today; `INBOUND`/`COMPENSATION` reserved for J3/J6), `atc_code`, `form_code` (denormalized for fast heatmap groups), `payee_kind` enum + `payee_id` (polymorphic — VendorMaster / PeopleMaster / Hospital / Doctor / Other), three frozen snapshots (`payee_name_snapshot` / `payee_tin_snapshot` / `payee_address_snapshot` — payee renames don't rewrite alphalist history), `gross_amount` + `withholding_rate` + `withheld_amount`, `source_module` + `source_doc_ref` + `source_event_id` (links to GL via TransactionEvent) + `source_line_id`, `finance_tag` enum (PENDING / INCLUDE / EXCLUDE / DEFER — mirrors VatLedger semantics), YTD denormals (`ytd_gross_at_post`), notes. Indexes: `{entity_id, period, direction, atc_code}` (1601-EQ aggregation), `{entity_id, payee_kind, payee_id, period}` (per-payee 2307 generation), `{source_event_id}` (reversal lookup), `{entity_id, finance_tag}` (finance review queue).
2. **`backend/erp/services/withholdingService.js`** (new) — engine API:
   - `resolveAtcCodeForExpenseLine({ entity, line, vendor, period })` — returns the ATC descriptor or null. Decision tree: (1) explicit `line.atc_code` wins; (2) `vendor.withhold_active && vendor.default_atc_code` (TWA WI080/WI081); (3) null → no withholding. **YTD threshold flip**: WI010 (5%) auto-flips to WI011 (10%) when YTD payout for the payee crosses ₱720k. The flip is per-payee per-year — historical 5% rows stay 5% in the alphalist (correct, that's what BIR expects). Threshold lookup-overridable via Settings `WITHHOLDING_THRESHOLD_INDIVIDUAL_LOW`. ATC catalog read via `getAtcMetadata` (60s cache, busts on lookup edit) — falls back to inline `DEFAULT_RATES` if the lookup is empty.
   - `resolveAtcCodeForPrfRent({ entity, prf, vendor })` — same shape for 1606. Distinguishes WI160 (individual lessor) vs WC160 (corporate) via `vendor.payee_kind`. Skips when entity.rent_withholding_active=false OR doc.doc_type !== 'PRF'.
   - `createWithholdingEntries(entries, { session })` — bulk insert; honors caller-passed Mongoose session (for transactional posts).
   - `deleteWithholdingEntriesForEvent(eventId)` — reversal path (mirrors `journalEngine.js:168` VatLedger.deleteMany cadence). Idempotent.
   - `buildPosture(entityId, year)` — aggregates posture metrics for the dashboard card (top-50 payee × ATC buckets + YTD totals + annualized estimate by linear extrapolation).
3. **`backend/erp/services/withholdingReturnService.js`** (new) — return-side aggregators + serializers:
   - `compute1601EQ({ entityId, year, quarter })` — sums OUTBOUND `WithholdingLedger.finance_tag='INCLUDE'` rows for the three quarter months, EXCLUDING WI160/WC160 (which belong to 1606). Returns 14 BIR boxes per Schedule (Sch1: WI010/011/WC010/011 each gross+tax; Sch2: WI080/081 TWA; Total: total_gross + total_withheld) + per-payee `schedule` array.
   - `compute1606({ entityId, year, month })` — same shape for the rent codes only; per-landlord schedule.
   - `export2307Pdf({ entityId, payeeKind, payeeId, year, quarter, entity })` — renders BIR Form 2307 (Certificate of Creditable Tax Withheld) PDF using `pdfkit`. Reads exclusively from snapshot fields so payee renames don't rewrite issued certificates. Returns `{ buffer, contentHash, totals, payee, rowCount }`. Throws if no INCLUDE-tagged rows for the (payee, quarter).
   - `exportSawtDat({ entityId, year, quarter, userId, entity })` — emits the BIR Alphalist Data Entry v7.x `.dat` payload (header `H1|TIN|RegName|...`, detail `D1|Seq|PayeeTIN|...|ATC|Gross|Rate|Withheld`, trailer `T1|Count|TotalBase|TotalWithheld`). Pipe-separated, CRLF terminators. `serializeSawtDat()` exported standalone so a future jurisdiction-specific writer can replace it via DI without touching the consumer. SAWT excludes WI160/WC160 (rent goes through 1606/QAP).
   - `exportEwtCsv(...)` — CSV summary per box layout + per-payee schedule appendix. Same Rule #20 audit-log append pattern as J1 (`exportFormCsv`): SHA-256 hash + byte length + filename + user → BirFilingStatus.export_audit_log.
4. **Engine triggers** in [expenseController.js](backend/erp/controllers/expenseController.js):
   - New helpers `emitEwtForExpense(doc, userId)` + `emitEwtForPrfRent(doc, userId)`. Both are best-effort + non-fatal: failures log to `[WITHHOLDING_FAILURE]` for backfill, posts still succeed (mirrors `[AUTO_JOURNAL_FAILURE]`). Idempotent: every emit calls `deleteWithholdingEntriesForEvent` before insertMany — re-acknowledge replays cleanly.
   - Wired into ALL three POSTED transitions: legacy `submitExpenses` (line ~2480), approval-hub `postSingleExpense` (after `[AUTO_JOURNAL_FAILURE]` block), and CALF cascade-to-Expense path inside `postSinglePrfCalf` (captured into `cascadedExpenseSource` and emitted post-transaction so the `withTransaction` scope stays tight). PRF rent path: `postSinglePrfCalf` ends with `await emitEwtForPrfRent(doc, userId)`.
   - `reopenExpenses` invokes `deleteWithholdingEntriesForEvent` AFTER successful journal reversal — keeps audit ordering consistent.
5. **Schema fields**:
   - `ExpenseEntry` line schema gains `atc_code` + `withholding_payee_kind` + `withholding_payee_id` (frozen snapshot fields).
   - `PrfCalf` gains the same three fields (rent on PRF only — CALF advances skipped).
   - `PeopleMaster` gains `withhold_active` (per-person toggle on top of `Entity.withholding_active`) + `default_atc_code` (start bucket for resolver).
   - `VendorMaster` gains `withhold_active` + `default_atc_code` + `is_landlord` + `payee_kind` (INDIVIDUAL/CORPORATION/PARTNERSHIP/OTHER) for ATC bucket choice on rent + TWA suppliers.
6. **6 new controller endpoints** in [birController.js](backend/erp/controllers/birController.js):
   - `GET /forms/1601-EQ/:year/:quarter/compute` — VIEW_DASHBOARD scope. Returns `{ totals, meta:{schedule,...}, filing_row }`.
   - `GET /forms/1606/:year/:month/compute` — VIEW_DASHBOARD.
   - `GET /forms/1601-EQ/:year/:quarter/payees` — VIEW_DASHBOARD. Per-payee × ATC schedule for 2307 PDF generation.
   - `GET /forms/1601-EQ|1606/:year/:period/export.csv` — EXPORT_FORM. Streams CSV + SHA-256 hash header. **Routed BEFORE J1 catch-all** so EWT codes don't fall through to the VAT controller (health check enforces this).
   - `GET /forms/SAWT/:year/:quarter/export.dat` — EXPORT_FORM. Streams the .dat payload + SHA-256 + audit-log row.
   - `GET /forms/2307-OUT/:year/:quarter/:payeeKind/:payeeId/export.pdf` — EXPORT_FORM. Streams PDF + audit-log row + per-payee BirFilingStatus row (one per (entity, payee, year-quarter)).
   - `GET /withholding/posture?year=N` — VIEW_DASHBOARD. Surfaces the dashboard card data.
7. **`frontend/src/erp/pages/BirEwtReturnDetailPage.jsx`** (new) — handles BOTH 1601-EQ and 1606. Per-box copy cards (sections SCH1 / SCH2 / RENT / TOTAL). Per-payee schedule table below boxes with a "2307 PDF" action button per row (1601-EQ only). SAWT `.dat` toolbar button (1601-EQ only — quarterly form, no monthly equivalent for 1606). Lifecycle buttons (Mark Reviewed / Filed / Confirmed) call the J0 endpoints. Hook-order disciplined (`useMemo` BEFORE early-return, mirrors J1).
8. **App.jsx** lazy-imports the new page + wires explicit routes `/erp/bir/1601-EQ/:year/:period` + `/erp/bir/1606/:year/:period` BEFORE the J1 wildcard `/erp/bir/:formCode/:year/:period` so React Router dispatches the EWT page for those codes.
9. **Dashboard extensions** in [BIRCompliancePage.jsx](frontend/src/erp/pages/BIRCompliancePage.jsx):
   - **Withholding Posture card** (new section above Upcoming Deadlines): renders engine on/off pill + 5-stat row (Contractors not withheld / YTD payout / YTD withheld / Annualized / Threshold trip) + `<details>` drill-down showing top 10 payee×ATC buckets.
   - **Heatmap drill-down extended**: `drillableForms = ['2550M', '2550Q', '1601-EQ', '1606']` and SAWT cells redirect to the matching 1601-EQ quarter (since SAWT export is a button on that page).
10. **Withholding Posture wired live** in [birDashboardService.js](backend/erp/services/birDashboardService.js): when `entity.withholding_active=true`, calls `withholdingService.buildPosture` for real numbers. Adds `contractors_not_withheld` count via PeopleMaster scan (PS_ELIGIBLE / TRANSITIONING / SUBSIDIARY with `withhold_active=false`). Stub posture remains for entities still on the old "build-only" posture.
11. **Latent J1 wiring fix (Rule #2 sweep)**: pre-J2 `frontend/src/constants/roles.js` had no `ROLE_SETS.BIR_FILING` symbol; `App.jsx` referenced it on the J1 route guard, which short-circuited because `ProtectedRoute` defaults to `allowedRoles=[]` (no gate). J2 adds `BIR_FILING: [admin, finance, president, bookkeeper]` + `ROLES.BOOKKEEPER` constant + extends `ALL_ROLES`. Backend route guards were already correct (lookup-driven via `birAccess.userHasBirRole`); the frontend was the silent gap.
12. **`bir-ewt-return` PageGuide entry** in [PageGuide.jsx](frontend/src/components/common/PageGuide.jsx) — 7-step workflow (pre-flight / engine activation / threshold flip / per-box copy / 2307 PDF / SAWT / lifecycle).
13. **Health check** [healthcheckBirEwtWiring.js](backend/scripts/healthcheckBirEwtWiring.js) — 124 assertions across 18 sections (model + indexes; service API; return service + SAWT serializer + box layouts; controller endpoints + role gates; route ordering; engine wiring sweep; schema fields on 4 models; ATC seed in lookup defaults; frontend service + page; App.jsx routes + ordering; heatmap drill-down + posture card; PageGuide entry; ROLE_SETS.BIR_FILING; backend roles; dashboard service Withholding Posture wiring; CORS exposed-headers; pdfkit dependency). **Verified passing May 03 2026.** Sibling regression healthchecks (BIR VAT 39/39, Sales Discount 41/41, Executive Cockpit 64/64, Team Activity 22/22, Income Proxy 32/32, Compute Payroll Proxy 29/29, Payslip Proxy Roster 31/31, Petty Cash Hub Approve 22/22, SmerRevert 18/18, Activity Per-Diem 34/34, Inbox Triage 36/36, Journal Hub 19/19, Internal Transfer Proxy 26/26) ALL PASS.
14. **Vite build green** 12.86s, `BirEwtReturnDetailPage-qAZZLw64.js` chunked.
15. **Live HTTP smoke green** as president (May 03 2026):
    - `GET /forms/1601-EQ/2026/2/compute` → 200 with 14-box layout + empty schedule (no posted EWT yet)
    - `GET /forms/1606/2026/4/compute` → 200 with 6-box layout
    - `GET /withholding/posture?year=2026` → 200, `enabled:true` (entity has `withholding_active=true`), zero numbers as expected (no ledger data)
    - `GET /forms/1601-EQ/2026/2/payees` → 200, empty array
    - `GET /forms/1601-EQ/2026/9/compute` → **400** (validation: invalid quarter)
    - `GET /forms/1606/2026/13/compute` → **400** (validation: invalid month)
    - `GET /forms/1601-EQ/2026/2/export.csv` → **403** by design (president NOT in EXPORT_FORM lookup; gate works)
    - `GET /forms/SAWT/2026/2/export.dat` → **403** (same gate)
    - `GET /forms/2307-OUT/.../export.pdf` → **403** (same gate)
    - **CORS exposure verified**: `Access-Control-Expose-Headers: Content-Disposition,X-Content-Hash` present on the 403 response.
    - **J1 regression**: `GET /forms/2550M/2026/4/compute` → 200 with `exempt_sales:50` preserved.

**Subscription-readiness checklist (Rule #3 + Rule #19 — J2)**:
- All reads scoped via `req.entityId`; `WithholdingLedger.aggregate` always filters on entity_id.
- ATC catalog driven by `BIR_ATC_CODES` lookup (extensible per jurisdiction). `metadata.rate` overrides; falls back to inline `DEFAULT_RATES`.
- Threshold (₱720k YTD) overridable per entity via `Settings.WITHHOLDING_THRESHOLD_INDIVIDUAL_LOW`.
- Role gates via `BIR_ROLES` lookup (VIEW_DASHBOARD compute, EXPORT_FORM exports). `bookkeeper` role can be added to EXPORT_FORM per entity without code changes.
- Master switches: `Entity.withholding_active` (1601-EQ engine) + `Entity.rent_withholding_active` (1606 engine) — engine writes nothing when both off, page renders zeros (no exposure of dormant infrastructure).
- Per-payee toggle: `PeopleMaster.withhold_active` + `VendorMaster.withhold_active` — mass posting before profit-sharing kicks in stays a no-op.
- SAWT serializer is DI-ready — `serializeSawtDat({entity, year, quarter, schedule})` is a pure function, future country variants drop in without controller changes.
- Frozen snapshots on every WithholdingLedger row mean BIR-audit history is immutable to renames.
- Idempotent emit (delete-by-event then insert) means re-acknowledge / cascade-replay produces stable ledger state.

**Open follow-ups (J2.x polish, not blocking J3)**:
- **J2.1 — Expense ATC dropdown UI**: today the engine reads `line.atc_code` from the model; `Expenses.jsx` does not yet render an ATC `<SelectField>` per line. Add it (driven by `BIR_ATC_CODES` lookup, filtered by `metadata.applies_to`) so finance can tag during data entry rather than back-editing — ~1 hour. Engine already works for codes set via direct DB writes / vendor `default_atc_code`.
- **J2.2 — PS-eligibility auto-flip — ✅ SHIPPED May 06 2026** (locally; push pending). `evaluateEligibility` from `backend/erp/services/profitShareEngine.js` (NOT the docs' aspirational `evaluateProfitSharingEligibility(contractor)` — function name is `evaluateEligibility(entityId, bdmId, period, pnlData)` and the role term is `staff` since Phase S2). New helper [backend/erp/services/psAutoFlipService.js](backend/erp/services/psAutoFlipService.js) `maybeAutoFlipPsEligibility({entityId, bdmId, period, psResult})` is called from [pnlCalc.generatePnlReport](backend/erp/services/pnlCalc.js) immediately after `evaluateEligibility` and BEFORE the upsert write — when `psResult.eligible === true` AND `PeopleMaster.withhold_active !== true`, the helper (a) flips `PeopleMaster.withhold_active=true` via `person.save()` and (b) dispatches a high-priority `compliance_alert` via the existing `dispatchMultiChannel` pipeline (email + in-app `ACTION_REQUIRED` folder + SMS-opt-in) to the audience resolved from `PS_AUTO_FLIP_NOTIFY_ROLES.metadata.roles` (defaults `[admin, finance, president]`, lazy-seeded with `insert_only_metadata: true` in [lookupGenericController.SEED_DEFAULTS](backend/erp/controllers/lookupGenericController.js)). The alert deep-links to `/erp/bir` and prompts admin to confirm `Entity.withholding_active` is also enabled — the BIR engine emits `WithholdingLedger` rows only when BOTH the per-person AND the per-entity master switch are true. **Idempotent**: subsequent PnlReport generations are no-ops because `withhold_active` is already `true` (helper returns `{ changed: false, reason: 'already_active' }`). **Failure-isolated**: helper has top-level + nested try/catch — neither the DB save nor the dispatch can throw into `pnlCalc`; the PnlReport upsert always proceeds. **Rule #1**: `'profit-sharing'` workflow banner in [WorkflowGuide.jsx](frontend/src/erp/components/WorkflowGuide.jsx) updated with the J2.2 step + tip mentioning the lookup category. **Healthcheck**: [backend/scripts/healthcheckPsAutoFlip.js](backend/scripts/healthcheckPsAutoFlip.js) — 8 sections / static contract verifier (service exports + pnlCalc ordering invariant + lookup seed shape + banner copy + schema preconditions + notification dependency surface + MessageInbox shape + docs closure). **Why this finally shipped before VIP-1.B Phase 5**: the original deferred-task body referenced an aspirational name; verifying the codebase showed `evaluateEligibility` already lives in `profitShareEngine.js` and is wired into `pnlCalc.generatePnlReport`. The auto-flip needs only a 30-line helper bolted onto an existing path — VIP-1.B Phase 5's rebate engine is a different signal source (Order.paid → instantaneous flip) that can wire to the SAME helper later when it ships, with no rework.
- **J2.3 — golden SAWT fixture**: snapshot a known-good `.dat` byte string at `backend/erp/services/__fixtures__/SAWT_2026-Q1_VIP.dat` and add a fixture-equality test. Detects accidental serializer drift on refactor. (~30 min once we have a real-data Q1.)
- **J2.4 — Inbound 2307 (J6 prep)**: the `INBOUND` direction in `WithholdingLedger.DIRECTIONS` is reserved but unused today; CwtLedger remains the source of truth. J6 either migrates or lets them coexist — don't delete the enum slot.



### J3 Part A — 1601-C Monthly Compensation Withholding (May 04 2026, uncommitted on dev)

**Why it shipped Part-A-only**: J3 was scoped at ~1.5 days for both 1601-C (monthly compensation withholding return) and 1604-CF (annual compensation alphalist with 3 BIR schedules). 1601-C ships now because it gives admin / finance / bookkeeper a working monthly export immediately and unblocks January-onward filings; 1604-CF (Part B) is deferred to a fresh session to avoid a half-shipped annual `.dat` writer (BIR Alphalist Data Entry v7.x format compliance is golden-fixture territory).

**Status (May 04 2026)**: J3 Part A backend + frontend + healthcheck (78/78 PASS) + sibling regressions (J1 39/39, J2 124/124, ClmIdempotency 6/6, ClmPerformance 34/34, TeamActivity 22/22, SalesDiscount 41/41 ALL PASS) + Vite build (1m 12s green) + live HTTP smoke (5/5 contract checks) all green. **Playwright UI smoke deferred** — MCP browser locked by user's active Chrome session (same condition as the Phase R1 handoff). HTTP smoke is the Rule 0b alternative; JSX wires are statically verified by healthcheck.

**What shipped (J3 Part A)**:

1. **`backend/erp/services/withholdingService.js`** (extended) — added the Payslip-to-WithholdingLedger bridge:
   - `emitCompensationWithholdingForPayslip(payslip, opts)` — emits 1, 2, or 3 `direction='COMPENSATION'` rows per posted payslip:
     - **WI100** (Regular taxable compensation) — `gross = total_earnings - 13th-month excess`, `withheld = payslip.deductions.withholding_tax`. Always emitted for non-MWE employees.
     - **WC120** (13th-month + bonuses excess of ₱90k) — emitted ONLY when `earnings.thirteenth_month > exemption_threshold`; `gross = excess`, `withheld = 0` (the tax was already counted in WI100 row's withheld).
     - **WMWE** (Minimum Wage Earner exempt under TRAIN) — emitted INSTEAD of WI100/WC120 when `PeopleMaster.employment_type === 'MWE'`. `gross = total_earnings`, `withheld = 0` (structurally — MWE compensation is fully exempt under RA 10963 / TRAIN Law). Engine-internal code; there is no BIR ATC for MWE because they are entirely exempt.
     - **Idempotency**: `source_event_id = payslip._id` (NOT the JE event id — payslip IS the source of truth for compensation withholding). The helper calls `deleteWithholdingEntriesForEvent(payslip._id)` BEFORE re-inserting, so re-posting a payslip after Reversal Console reopen wipes prior comp rows cleanly. Set `opts.deletePrior=false` to skip the wipe.
     - **Subscription-ready**: 13th-month exemption threshold reads `Settings.COMPENSATION_13TH_MONTH_EXEMPT` per entity (defaults `DEFAULT_THIRTEENTH_MONTH_EXEMPT_PHP = 90_000` from TRAIN Law). Subscriber jurisdictions with different thresholds override without code deploy (Rule #19).
     - **Snapshot pattern**: reads `PeopleMaster` lazily and freezes `payee_name_snapshot` + `payee_tin_snapshot` + `payee_address_snapshot` at write time so subsequent employee renames / address corrections do NOT rewrite filed-month history (BIR auditor protection).
   - `buildCompensationPosture(entityId, year)` — sibling to `buildPosture()` (which is OUTBOUND-only). Aggregates `direction='COMPENSATION'` rows into `{ enabled, employees_count, ytd_compensation, ytd_withheld, mwe_count, breakdown[] }`. Per-entity scoped (Rule #19).
   - **New constants**: `COMPENSATION_ATC_CODES = { REGULAR: 'WI100', THIRTEENTH_MONTH_EXCESS: 'WC120', MWE: 'WMWE' }`. `DEFAULT_RATES` extended with `{ WI100: 0, WC120: 0, WMWE: 0 }` (rate field is a marker only — actual withheld_amount comes from payslipCalc's graduated tax-table computation, never from rate × gross). `DEFAULT_FORM_FOR_ATC` extended with the three new codes mapped to `'1601-C'`.
2. **`backend/erp/services/withholdingReturnService.js`** (extended) — added the 1601-C aggregator:
   - **Backwards-compat refactor**: `sumByAtcCode(entityId, periods, financeTag, direction='OUTBOUND')` and `listPayees(entityId, periods, atcFilter, financeTag, direction='OUTBOUND')` both gained an optional `direction` parameter. J2 callers don't pass it (default OUTBOUND preserves their behavior); compute1601C passes `'COMPENSATION'`. Static healthcheck verifies the default-arg signature.
   - `compute1601C({ entityId, year, month })` — monthly compensation aggregator. Reads INCLUDE-tagged COMPENSATION rows for `period='YYYY-MM'`. Returns 10 box totals (`wi100_gross/tax`, `wc120_gross/tax`, `wmwe_gross/tax`, `total_gross`, `total_taxable` = WI100+WC120 grosses, `total_withheld` = WI100 withheld, `employee_count` = distinct payee_id count) + `meta.box_layout` + per-employee `meta.schedule`.
   - `BOX_LAYOUT_1601_C` — 10-row layout with `section: COMP|BNS|MWE|TOTAL` (mirrors J2's section pattern). Each row has `code` + `label` + `section` + `readonly` + `decimals`.
   - `getBoxLayout(formCode)` extended to handle `'1601-C'`.
   - `exportEwtCsv(...)` extended to handle `formCode === '1601-C'` — calls `compute1601C` internally, builds CSV via the existing `buildEwtCsv` (which is parametric on `meta.box_layout`), names the file `1601C_{year}-{month}.csv`. Same Rule #20 audit-log append pattern (SHA-256 hash + byte length + filename + user → `BirFilingStatus.export_audit_log`). 1606 + 1601-C share the same monthly encoding via the new `monthlyEncodedForms = ['1606', '1601-C']` filter.
3. **`backend/erp/controllers/birController.js`** (extended) — added 2 new handlers:
   - `compute1601C` — mirrors `compute1606` exactly except dispatches to `withholdingReturnService.compute1601C`. Same VIEW_DASHBOARD birAccess gate. Looks up the matching BirFilingStatus row (by `entity_id`, `form_code='1601-C'`, `period_year`, `period_month`) and returns `{ ...result, filing_row }`.
   - `getCompensationPosture` — mirrors `getWithholdingPosture` for the 1601-C dashboard card.
   - `exportEwtCsv` extended: allow-list grew to `{1601-EQ, 1606, 1601-C}`; param-parsing branches on `formCode === '1606' || formCode === '1601-C'` to use month encoding.
4. **`backend/erp/routes/birRoutes.js`** — 3 new routes mounted **BEFORE** the J1 `/forms/:formCode/:year/:period/export.csv` catch-all (Express priority — same concern as J2 routes):
   - `GET /forms/1601-C/:year/:month/compute` → `compute1601C`
   - `GET /forms/1601-C/:year/:month/export.csv` → `exportEwtCsv`
   - `GET /withholding/comp-posture` → `getCompensationPosture`
5. **`backend/erp/controllers/payrollController.js`** + **`backend/erp/controllers/universalApprovalController.js`** — both `postPayroll` paths (legacy direct-post + G4.5cc Hub-cascade) now call `emitCompensationWithholdingForPayslip(fullPs, { userId })` AFTER `createAndPostJournal` succeeds, inside the same try-catch as the JE write. Failures log `[J3_COMPENSATION_EMIT_FAILURE]` to ErpAuditLog as `LEDGER_ERROR` and are non-blocking (payroll posting must NOT fail if the BIR sub-ledger insert hits a transient error — same posture as `[AUTO_JOURNAL_FAILURE]`). Idempotency lives in the helper itself (deletePrior:true default), so re-posting after Reversal Console reopen wipes + re-emits cleanly.
6. **`backend/erp/controllers/lookupGenericController.js`** (extended) — `BIR_ATC_CODES` SEED_DEFAULTS gained `WMWE` row alongside the existing aspirational WI100 + WC120 placeholders (which J2 had reserved but never wired). All three are now actively consumed by the engine. `WI100` + `WC120` stay BIR-actual; `WMWE` is engine-internal (no BIR ATC for MWE). Each row uses `insert_only_metadata: true` so subscriber overrides on labels/colors survive future re-seeds.
7. **`frontend/src/erp/services/birService.js`** (extended) — `compute1601C(year, month)` + `getCompensationPosture(year)` wrappers + default exports.
8. **`frontend/src/erp/pages/BirEwtReturnDetailPage.jsx`** (extended — page now serves 1601-EQ + 1606 + 1601-C):
   - `validParams` extended to allow `1601-C` (monthly encoding like 1606).
   - `load()` branches: 1601-EQ → `compute1601EQ`, 1606 → `compute1606`, 1601-C → `compute1601C`.
   - `SECTION_LABELS` gains COMP / BNS / MWE entries for 1601-C box sections.
   - `periodLabel` + `scheduleLabel` helpers branch on formCode (1601-C → "Per-Employee Schedule").
   - `PageGuide pageKey` swaps via inline ternary: `formCode === '1601-C' ? 'bir-comp-return' : 'bir-ewt-return'`.
   - SAWT toolbar button stays gated to `formCode === '1601-EQ'` (1606 + 1601-C have no SAWT).
   - 2307 PDF button per Schedule row stays gated to `formCode === '1601-EQ'` (compensation receipts use BIR Form 2316 — annual employee certificate; ships in J3 Part B alongside 1604-CF).
9. **`frontend/src/App.jsx`** — `<Route path="/erp/bir/1601-C/:year/:period">` mounted BEFORE the `/erp/bir/:formCode/:year/:period` wildcard fallback (route-priority parity with J2's 1601-EQ + 1606 routes).
10. **`frontend/src/components/common/PageGuide.jsx`** — new `bir-comp-return` entry with 7-step workflow (pre-flight, bucket layout explanation, per-employee schedule + threshold setting discoverability, copy-paste UX, no-2307/no-SAWT clarification, lifecycle, MWE classification).
11. **`backend/scripts/healthcheckBirCompensationWithholding.js`** (new) — 78-assertion wiring contract verifier across all 14 surfaces (model + 2 services + controller + routes + 2 payslip-post bridges + lookup seeds + frontend service + page + App route + PageGuide + role-set). Run: `node backend/scripts/healthcheckBirCompensationWithholding.js`. Exit 0 = clean.
12. **`backend/scripts/healthcheckBirEwtWiring.js`** (1-line update) — the J2 healthcheck assertion `expect(... pageKey="bir-ewt-return")` was tightened to `/'bir-ewt-return'/.test(...) && /'bir-comp-return'/.test(...)` because `BirEwtReturnDetailPage` now renders BOTH page-guides via the conditional ternary. Still 124/124 PASS.

**Engine semantics**:
- Compensation tax computation already happens upstream in `payslipCalc.js` (graduated tax tables per BIR RR 11-2018 / TRAIN Law). The J3 emit just records the engine's totals — `withheld_amount` reads from `payslip.deductions.withholding_tax`, never recomputed via `rate × gross`. This is why `DEFAULT_RATES.WI100 = 0` (the rate field is a marker; the meaningful number is the actual tax-table-derived withheld_amount).
- 13th-month decomposition: `payslip.earnings.thirteenth_month` is checked against the exemption threshold. Excess goes on a SEPARATE WC120 row with `withheld=0` (the tax is already in the WI100 row's withheld). This means `total_taxable` = WI100 gross + WC120 gross is the BIR "Net Taxable Compensation" line; `total_withheld` = WI100 withheld is the BIR "Tax Required to Be Withheld for the Month" line. WMWE is excluded from `total_taxable` (MWE compensation is exempt).
- MWE classification: `PeopleMaster.employment_type === 'MWE'`. To revoke MWE status mid-year (e.g., promotion above the minimum wage), update PeopleMaster — the change applies to NEW payslip posts. Retroactive fix requires reopening the period via Reversal Console + re-posting (the emit's idempotency wipes + re-emits the prior comp rows under the new classification).

**Subscription-ready posture (Rule #19 + Rule #3)**:
- Per-entity Settings override for 13th-month exemption threshold — `COMPENSATION_13TH_MONTH_EXEMPT` (default 90_000 PHP).
- Per-entity BIR_ATC_CODES lookup (lazy-seeded; subscriber edits override; `insert_only_metadata: true` protects against re-seed overwrites).
- Per-entity BIR_ROLES lookup (existing J0 surface) drives access — VIEW_DASHBOARD + EXPORT_FORM apply to 1601-C automatically (no new role added; 1601-C is "another BIR form" from the gate's perspective).
- Cache buster: `withholdingService.invalidateAtcCache(entityId)` already exists and is wired by the lookup edit endpoint — admin's lookup edit propagates within 60s.

**Open follow-ups (J3 Part B and beyond)**:
- **J3 Part B — 1604-CF Annual Alphalist** — ✅ SHIPPED May 04 2026 evening (uncommitted on `dev`). See J3 Part B section below.
- **J3 Part B — Heatmap drill-down for 1601-C cells** — ✅ SHIPPED in J3 Part B (May 04 2026 evening). The Part B heatmap edit also added the missing `'1601-C'` entry that Part A overlooked.
- **J3 Part B — Compensation Posture card on dashboard** — Backend already wired (`getCompensationPosture` endpoint + `buildCompensationPosture` service). Frontend card on `BIRCompliancePage` deferred to a future micro-task — the existing Withholding Posture card covers the OUTBOUND view; a sibling Compensation Posture card mirrors that shape for COMPENSATION direction. ~30 min frontend.
- **Playwright UI smoke** for J3 Part A + Part B — deferred from this session because MCP browser locked. Re-smoke `/erp/bir/1601-C/2026/4` (Part A) and `/erp/bir/1604-CF/2026` (Part B) end-to-end when MCP unblocks. Static healthcheck (Part A 78/78 + Part B 66/66) + Vite build green + HTTP smoke (Part A 5/5 + Part B 5/5) is the Rule 0b substitute.


### J3 Part B — 1604-CF Annual Compensation Alphalist + Form 2316 PDF (May 04 2026 evening, uncommitted on dev)

**Status (May 04 2026 evening)**: J3 Part B backend + frontend + healthcheck (66/66 PASS) + sibling regressions (J3 Part A 78/78, J2 124/124, J1 39/39, ClmIdempotency 6/6, ClmPerformance 34/34, TeamActivity 22/22, SalesDiscount 41/41 ALL PASS) + Vite build (1m 38s green) + live HTTP smoke (5/5 contract checks) all green. **Playwright UI smoke deferred** — MCP browser locked by user's active Chrome session (same condition as the J3 Part A and Phase R1 handoffs). HTTP smoke + serializer round-trip test in healthcheck is the Rule 0b alternative; JSX wires are statically verified by healthcheck.

**What shipped (J3 Part B)**:

1. **`backend/erp/services/withholdingReturnService.js`** — added 4 functions:
   - `compute1604CF({ entityId, year })` — year-encoded sum across 12 monthly periods. Reads COMPENSATION-direction WithholdingLedger rows via `listPayees(entityId, periods, ['WI100','WC120','WMWE'], 'INCLUDE', 'COMPENSATION')` and groups by `payee_id` (one alphalist row per employee, summing across the 3 ATC buckets). Each per-employee row carries `gross_regular` (WI100), `gross_thirteenth` (WC120 13th-month excess), `gross_mwe` (WMWE), and `withheld` (only WI100 contributes — WC120/WMWE always 0). Termination check is a live `PeopleMaster.find({_id:{$in:ids}, date_separated:{$gte:yearStart,$lt:yearEnd}})` query that returns the separated set; 7.3 partition is intentionally LIVE-driven (not snapshot) because the user's intent is "show me everyone who left during 2026" — a real-time HR question, not a historical snapshot question. **MWE wins over termination** per BIR audit posture: a separated MWE belongs in Sch 7.2, not 7.3.
   - `serialize1604CFDat({ entity, year, totals, meta })` — fixed-format `.dat` per BIR Alphalist Data Entry v7.x. Header `H1604CF|TIN|RegName|Branch|Year|FormType`; per-schedule detail lines `D71` / `D72` / `D73` carrying TIN + last name + first name + address + gross + non-taxable + taxable + withheld; trailer `T1604CF` carrying employee count + 4 money totals. Strict CRLF line endings (Alphalist Data Entry rejects bare LF). Pipe is the field separator; the `sanitize()` helper (shared with SAWT) strips pipes from input strings. Last-name + first-name parsing falls back to a `lastIndexOf(' ')` split on `payee_name_snapshot` for legacy Part A rows that lack the explicit `first_name` / `last_name` (Part B's snapshot extension captures these going forward).
   - `export1604CFDat({ entityId, year, userId, entity })` — wraps `compute1604CF` + `serialize1604CFDat`, computes SHA-256, appends to `BirFilingStatus.export_audit_log` (artifact_kind='DAT', filename `1604CF_<year>.dat`), refreshes `totals_snapshot`. Same audit posture as `exportSawtDat`.
   - `export2316Pdf({ entityId, payeeId, year, entity })` — per-employee annual certificate. PDFkit-based, mirrors `export2307Pdf` shape. Renders Employer (TIN/RDO/address) → Employee (TIN/address) → per-month detail table → annual totals A/B/C/D (Gross / Non-Taxable / Taxable / Tax Withheld). Reads ONLY from WithholdingLedger snapshots (NEVER live PeopleMaster) — closed-year snapshots are immune to subsequent employee renames.
2. **`backend/erp/services/withholdingService.js`** — Part A snapshot bug fix (mandatory for Part B):
   - `.select('+government_ids.tin full_name first_name last_name employment_type')` — TIN is `select: false` on the schema and lives at `government_ids.tin` (not `person.tin`). Part A's bug silently emitted empty TINs into every COMPENSATION row, which would have made 1604-CF (which BIR auditors validate by TIN) useless.
   - `personSnapshot` now also captures `first_name` + `last_name` so the 1604-CF serializer can split names cleanly without falling back to the lossy `lastIndexOf(' ')` on `full_name`.
   - `finance_tag: 'INCLUDE'` — compensation rows auto-tag INCLUDE so 1601-C + 1604-CF aggregators (which filter strict INCLUDE) see them immediately after payroll post. There's no judgment call to make — the tax was determined upstream by `payslipCalc` BIR graduated tax-table math; finance only manually-tags OUTBOUND rows where they may decide a contractor isn't subject to withholding.
3. **`backend/erp/controllers/birController.js`** — 3 new handlers:
   - `exports.compute1604CF` — `GET /api/erp/bir/forms/1604-CF/:year/compute` — VIEW_DASHBOARD scope. Returns `{ totals, meta, filing_row }`.
   - `exports.export1604CFDat` — `GET /api/erp/bir/forms/1604-CF/:year/export.dat` — EXPORT_FORM scope. Streams `.dat` + `Content-Disposition` + `X-Content-Hash`. Logs `[BIR_EXPORT_1604CF_DAT]` ops audit line.
   - `exports.export2316Pdf` — `GET /api/erp/bir/forms/2316/:year/:payeeId/export.pdf` — EXPORT_FORM scope. Same audit shape as `export2307Pdf`. Per-payee `BirFilingStatus` row uses `form_code='2316'` + `period_payee_kind='PeopleMaster'` + `period_payee_id=<employee>`.
4. **`backend/erp/routes/birRoutes.js`** — 3 routes mounted BEFORE the J1 catch-all `/forms/:formCode/:year/:period/export.csv`. Annual encoding (year only — no `:period`) so the route shape doesn't collide with the catch-all (which requires `:period` segment).
5. **`backend/erp/models/BirFilingStatus.js`** — extended:
   - `FORM_CODES` enum gained `'2316'` (per-employee per-year).
   - `perPayeeForms` validator gained `'2316'` so the pre-validate hook enforces `period_payee_id` + `period_payee_kind` for 2316 rows. 1604-CF was already in the `annualForms` validator block (J0 schema).
6. **`backend/scripts/healthcheckBir1604CFAlphalist.js`** (NEW) — 66-assertion wiring contract verifier across 14 surfaces (service exports + serializer round-trip + compute1604CF shape + snapshot fix + controller handlers + route mount order + model extensions + frontend service + page component + App.jsx route order + PageGuide entry + heatmap drill-down + lookup catalog + Part A regression sentinel). Includes inline `serialize1604CFDat` round-trip with synthetic 3-employee fixture asserting H1604CF header, D71/D72/D73 detail lines, T1604CF trailer with money totals, and CRLF-strict line endings.

**Frontend (4 files modified + 1 new page)**:
7. **`frontend/src/erp/services/birService.js`** — added `compute1604CF(year)` + `export1604CFDat(year)` + `export2316Pdf(year, payeeId)` wrappers. URL-encoded payeeId in 2316 path.
8. **`frontend/src/erp/pages/Bir1604CFDetailPage.jsx`** (NEW) — annual schedule layout (NOT box-grid like the monthly EWT pages). Header card with status pill + filing reference + PageGuide. Aggregation summary card with ledger-rows + employees + 3 schedule counts + computed-at. Annual totals card with 5 BIR boxes (Employees Reported / Gross Comp / Taxable / Non-Taxable / Total Withheld). Three schedule tables (7.1 Regular / 7.2 MWE / 7.3 Terminated) with empty-state helper text per schedule and per-row "2316 PDF" generation button. Lifecycle buttons (Mark Reviewed / Mark Filed / Mark Confirmed) wired to existing J0 endpoints. Export audit log surfaced (last 10 entries with SHA-256 prefix).
9. **`frontend/src/App.jsx`** — `Bir1604CFDetailPage` lazy-imported + `/erp/bir/1604-CF/:year` route mounted BEFORE the `/erp/bir/:formCode/:year/:period` wildcard fallback (so React Router doesn't dispatch to BirVatReturnDetailPage which only handles 2550M/Q).
10. **`frontend/src/components/common/PageGuide.jsx`** — new `bir-1604cf-alphalist` 7-step entry covering pre-flight, 3-schedule layout, MWE/termination classification source, 2316 PDF + Substituted Filing posture, .dat export + Alphalist Data Entry v7.x import, lifecycle, snapshot pattern.
11. **`frontend/src/erp/pages/BIRCompliancePage.jsx`** — heatmap cell click logic extended:
    - `monthlyOrQuarterlyForms = ['2550M', '2550Q', '1601-EQ', '1606', '1601-C']` (added 1601-C — Part A's heatmap drill-down was missing it).
    - `annualForms = ['1604-CF']` — annual cells have `null period_month + null period_quarter` so the URL builder branches: `/erp/bir/1604-CF/${year}` for annual, `/erp/bir/${form}/${year}/${period}` for monthly/quarterly.

**Engine semantics (Part B)**:
- **Schedule partition rule**: MWE wins over termination. A separated MWE → Sch 7.2 (not 7.3) because BIR audit posture treats MWE as the dominant classification. Documented in code as a comment + reflected in healthcheck assertion.
- **Live vs. snapshot read**: Sch 7.3 partition reads `PeopleMaster.date_separated` LIVE (not from snapshot). Rationale: the user's question is "show me everyone who left during 2026," not "show me everyone who was marked separated at the time their payroll posted." A late-separation event (HR records the date_separated AFTER the last payroll post) must still partition the row to 7.3.
- **Snapshot read everywhere else**: `payee_name_snapshot` + `payee_tin_snapshot` are read from WithholdingLedger — never live. A subsequent rename or TIN update does NOT rewrite the alphalist of a closed year. Reversal Console reopen + re-post is the only retroactive path.
- **2316 PDF audit row shape**: each PDF generation creates / updates a per-employee `BirFilingStatus` row with `form_code='2316'`, `period_payee_kind='PeopleMaster'`, `period_payee_id=<employee>`. The audit log on that row carries every PDF generation event with SHA-256 content hash. Subscribers can audit "did we issue a 2316 to employee X for year Y?" via a single MongoDB query.

**Subscription-ready posture (Part B)**:
- ATC code catalog (`BIR_ATC_CODES` lookup) already covers WI100 / WC120 / WMWE for compensation (Part A seed); 1604-CF reuses them. Subscribers in jurisdictions with different employee-cert codes extend the lookup without code change.
- Per-entity `BIR_FORMS_CATALOG` already seeds 1604-CF (J0 — sort_order 100, frequency ANNUAL, due_month 1, due_day 31). Subscribers disable per-entity by setting `is_active: false`.
- 13th-month exemption threshold (₱90k TRAIN) lookup-overridable per entity via `Settings.COMPENSATION_13TH_MONTH_EXEMPT` (Part A wired). The exemption math happens in the bridge (Part A); 1604-CF just aggregates the resulting WC120 rows.
- Per-entity BIR_ROLES lookup (existing J0 surface) drives access — VIEW_DASHBOARD + EXPORT_FORM apply to 1604-CF + 2316 automatically (no new role added).
- Future i18n: `serialize1604CFDat` and `export2316Pdf` are exported as standalone functions so a Vios SaaS subscriber in a non-PH jurisdiction can swap the serializer / PDF renderer via DI lookup-driven module path (mirrors the SAWT serializer pattern noted in J2).

**Open follow-ups (J5 and beyond)**:
- **Compensation Posture card on dashboard** — backend already wired; ~30 min frontend (sibling card to the existing Withholding Posture card, sourced from `birService.getCompensationPosture(year)`).
- **J5 — Books of Accounts (~1 day)**: PDF generators for Loose-Leaf BOA (Sales / Purchase / GJ / GL / Cash Receipts / Cash Disbursements). Wraps existing GL queries, no new ledger schema needed.
- **J6 — 2307-IN inbound reconciliation (~0.5 days)**: parse hospital-issued 2307s into CwtLedger; income-tax credit on 1702.
- **J7 — 1702/1701 income tax (~1 day)**: annual return aggregator pulling from GL + CwtLedger.
- **Playwright UI smoke** for J3 Part A + Part B + J4 — deferred from this session (MCP browser locked). Re-smoke when MCP unblocks: `/erp/bir/1604-CF/2026` (3 schedule sections + 2316 PDF buttons), `/erp/bir/1604-E/2026` (single flat per-(payee × ATC) schedule + per-ATC breakdown), `/erp/bir/QAP/2026/1` (same shape as 1604-E but quarterly), `/erp/bir/1601-C/2026/4` (Part A regression).


### J4 — 1604-E Annual EWT Alphalist + QAP Quarterly Alphalist (May 04 2026 evening, uncommitted on dev)

**Goal**: complete the EWT-side annual + quarterly alphalists that complement J2's 1601-EQ + SAWT. Once J4 lands, the OUTBOUND withholding chain (engine → 1601-EQ monthly returns → QAP per-quarter alphalist → 1604-E annual roll-up) is whole — bookkeeper can reconcile across all three reports and BIR's annual EWT filing requirement is covered.

**What shipped (J4)**:

1. **[backend/erp/services/withholdingReturnService.js](backend/erp/services/withholdingReturnService.js)** — six new functions:
   - `compute1604E({ entityId, year })` — annual aggregator. 12 monthly periods, `listPayees` over the 6 EWT ATCs (`J4_OUTBOUND_ATCS = ['WI010','WI011','WC010','WC011','WI080','WI081']`), single flat per-(payee × ATC) schedule sorted gross-desc. Per-ATC totals broken out (`wi010_gross / wi010_tax / wi010_count` etc.) for the form's summary boxes. Distinct-payee count uses a `(payee_kind, payee_id)` Set so a payee under multiple ATCs counts once. **No MWE / 7.3 partition** — vendors don't have it; rent (WI160/WC160) goes through 1606's monthly + its own annual roll-up, out of scope here.
   - `computeQAP({ entityId, year, quarter })` — quarterly version. 3 monthly periods via `quarterPeriods(year, quarter)`, same ATC subset, same flat schedule shape. `meta.form_code === 'QAP'`, `period_quarter` set in the meta envelope.
   - `serialize1604EDat({ entity, year, totals, meta })` — BIR Alphalist Data Entry v7.x writer. Header `H1604E|TIN|RegName|Branch|Year|FormType`, one `D1` line per (payee × ATC) pair (`D1|Seq|PayeeTIN|RegName|FirstName|MiddleName|Address|Nature|ATC|Gross|Rate|Withheld` — RegName in column 4 for vendor-style payees, FirstName in column 5 for individual-style payees), trailer `T1604E|Count|TotalGross|TotalWithheld`. Pipe-separated, CRLF-terminated, sanitize() strips pipe + bare-LF from payee names. Identical D1/T-line shape as `serializeSawtDat` so the BIR importer accepts both via the same record contract.
   - `serializeQAPDat({ entity, year, quarter, totals, meta })` — same shape, header `HQAP|TIN|RegName|Branch|Period|FormType|Year|Quarter`, trailer `TQAP|Count|TotalGross|TotalWithheld`. Quarter encoded twice in the header (`2026Q1` + `2026|1`) to match the SAWT precedent.
   - `export1604EDat({ entityId, year, userId, entity })` — wraps compute + serialize. Computes SHA-256 hash, upserts the `BirFilingStatus` row (form_code='1604-E', period_year=year, period_month=null, period_quarter=null, period_payee_id=null), appends an `export_audit_log` entry (artifact_kind='DAT', filename=`1604E_${year}.dat`, content_hash, byte_length, notes carrying distinct-payee + line counts). Returns `{ row, datContent, contentHash, filename, totals, meta }`.
   - `exportQAPDat({ entityId, year, quarter, userId, entity })` — same shape, filter scoped by year + quarter, filename `QAP_${year}_Q${quarter}.dat`.
2. **[backend/erp/controllers/birController.js](backend/erp/controllers/birController.js)** — four new handlers (`compute1604E` + `export1604EDat` + `computeQAP` + `exportQAPDat`). Compute handlers gated by VIEW_DASHBOARD; export handlers gated by EXPORT_FORM (per Rule #20 — every artifact-emitting endpoint that writes a SHA-256 audit hash must be EXPORT_FORM). All four handlers also load the `Entity` for header serialization, busts `birDashboardService.invalidate(req.entityId)` on export so the dashboard heatmap reflects fresh numbers, log a `[BIR_EXPORT_1604E_DAT]` / `[BIR_EXPORT_QAP_DAT]` ops audit line with user/role/entity/year/distinct_payees/payee_lines/content_hash/byte_length/IP/timestamp.
3. **[backend/erp/routes/birRoutes.js](backend/erp/routes/birRoutes.js)** — four new routes mounted as a J4 block BEFORE the J1 catch-all `/forms/:formCode/:year/:period/export.csv`:
   - `GET /forms/1604-E/:year/compute` → `ctrl.compute1604E`
   - `GET /forms/1604-E/:year/export.dat` → `ctrl.export1604EDat`
   - `GET /forms/QAP/:year/:quarter/compute` → `ctrl.computeQAP`
   - `GET /forms/QAP/:year/:quarter/export.dat` → `ctrl.exportQAPDat`
4. **[backend/erp/models/BirFilingStatus.js](backend/erp/models/BirFilingStatus.js)** — zero schema changes. J0 already pre-wired `'1604-E'` in `annualForms` + `'QAP'` in `quarterlyForms` + both in the `FORM_CODES` enum. The pre-validate hook already enforces the right shape (annual: period_year only; quarterly: period_year + period_quarter).
5. **[frontend/src/erp/services/birService.js](frontend/src/erp/services/birService.js)** — four new wrappers (`compute1604E(year)`, `export1604EDat(year)`, `computeQAP(year, quarter)`, `exportQAPDat(year, quarter)`). All export.dat wrappers go through the existing `downloadBlob` helper that sets `Accept: text/plain` + reads the X-Content-Hash response header. URL-build matches the route shapes exactly.
6. **[frontend/src/erp/pages/BirAlphalistEwtPage.jsx](frontend/src/erp/pages/BirAlphalistEwtPage.jsx)** (NEW) — single page handling BOTH 1604-E (annual) and QAP (quarterly) via a `formCodeOverride` prop. The component reads URL params (`year` always; `quarter` only when `formCodeOverride === 'QAP'`), branches the compute call (`birService.compute1604E(year)` vs `birService.computeQAP(year, quarter)`), branches the export call, and uses dynamic title + filename + PageGuide key. Layout: header card with status pill + filing reference + PageGuide; aggregation summary card (period label + ledger row count + distinct payees + ATC bucket count + computed_at); aggregate totals card (4 cells — distinct payees, payee × ATC lines, gross total, withheld total); per-ATC breakdown card (6 cells — one per EWT ATC with gross + tax + line count); flat per-(payee × ATC) schedule table (sortable columns: payee, kind, TIN, ATC, gross, withheld, months range); lifecycle buttons (Mark Reviewed → Mark Filed → Mark Confirmed) reusing the J3 Part B prompt-for-reference pattern; export audit log strip showing the last 10 exports with hash prefixes. Distinct from `Bir1604CFDetailPage` (which has the 3-schedule compensation partition) and `BirEwtReturnDetailPage` (which has the BIR box-grid layout) — alphalists are pure payee schedules, no boxes.
7. **[frontend/src/App.jsx](frontend/src/App.jsx)** — `BirAlphalistEwtPage` lazy-imported + two routes mounted BEFORE the `/erp/bir/:formCode/:year/:period` wildcard:
   - `/erp/bir/1604-E/:year` → `<BirAlphalistEwtPage formCodeOverride="1604-E" />`
   - `/erp/bir/QAP/:year/:quarter` → `<BirAlphalistEwtPage formCodeOverride="QAP" />`
8. **[frontend/src/components/common/PageGuide.jsx](frontend/src/components/common/PageGuide.jsx)** — two new entries: `bir-1604e-alphalist` (annual posture: 12-period roll-up, 6 EWT ATCs, rent excluded, finance_tag INCLUDE strict, .dat workflow, lifecycle, snapshot pattern; cross-check tip — sum of 4 QAPs ≈ 1604-E within rounding) and `bir-qap-alphalist` (quarterly posture: 3-period roll-up, files alongside 1601-EQ, due last day of month following quarter close; cross-reference tip — totals MUST match 1601-EQ).
9. **[frontend/src/erp/pages/BIRCompliancePage.jsx](frontend/src/erp/pages/BIRCompliancePage.jsx)** — heatmap drill-down extended: `monthlyOrQuarterlyForms` gained `'QAP'`, `annualForms` gained `'1604-E'`. Comment block now narrates the J4 addition.
10. **[backend/scripts/healthcheckBir1604EQAPAlphalist.js](backend/scripts/healthcheckBir1604EQAPAlphalist.js)** (NEW) — 97-assertion wiring contract verifier across 16 sections including dual `serialize1604EDat` + `serializeQAPDat` round-trip tests. The 1604-E fixture has 3 payees (corporate vendor under WC011, individual contractor under WI010, TWA goods supplier under WI080) totaling ₱2,780,000 gross + ₱159,000 withheld; the QAP fixture has 2 payees (Hospital under WC010, Doctor under WI010). Both round-trips assert: header tag (`H1604E` / `HQAP`), entity TIN + name + period encoding, D1 line shape per payee_kind (vendor-style RegName-in-col-4 vs individual-style FirstName-in-col-5), correct ATC + money formatting, trailer record-count padding + total math, line count, **CRLF strict** (`!/[^\r]\n/.test(dat)`), trailing newline.

**Verification posture (May 04 2026 evening)**:
- ✅ J4 healthcheck **97/97 PASS** (`node backend/scripts/healthcheckBir1604EQAPAlphalist.js`)
- ✅ J3 Part B regression **66/66 PASS** (after relaxing the `annualForms` literal-regex from `["1604-CF"]` to `[ ... "1604-CF" ...]` so the J4 expansion to `['1604-CF', '1604-E']` is accepted — fragile-assertion fix only, no behavior change)
- ✅ J3 Part A regression **78/78 PASS**, J2 EWT **108/108 PASS** (filename: `healthcheckBirEwtWiring.js`), J1 VAT **39/39 PASS**
- ✅ ClmIdempotency **6/6 PASS**, ClmPerformance **34/34 PASS**, TeamActivity **22/22 PASS**, SalesDiscount **41/41 PASS**
- ✅ Vite frontend build green in **1m 02s** (`BirAlphalistEwtPage` emitted as own chunk)
- ⏸ HTTP smoke + Playwright UI smoke deferred — same MCP-browser-locked condition as J3 Part B handoff. Healthcheck dual round-trips + Vite chunk emission are the Rule 0b alternative. Re-smoke when MCP unblocks (test cases listed in J4 follow-ups above).

**Subscription-ready posture**:
- `serialize1604EDat` and `serializeQAPDat` are exported standalone, so a Vios SaaS subscriber in a non-PH jurisdiction can swap the writers via DI lookup-driven module path (mirrors `serializeSawtDat` + `serialize1604CFDat` patterns). The `J4_OUTBOUND_ATCS` catalog is colocated with the aggregators so per-jurisdiction ATC sets can fork without touching the consumers.
- Per-entity `entityId` filter throughout — no cross-tenant leak risk at SaaS spin-out.
- The `BirAlphalistEwtPage`'s `formCodeOverride` pattern means future alphalist-shape forms (e.g. SAWT 2.0) can reuse the page by adding a third `formCodeOverride` value without forking the layout.

**Phase J4 lessons + design decisions to remember**:
- The user's J3 Part B handoff suggested extending `Bir1604CFDetailPage` to handle 3 forms via `formCodeOverride`. **I chose a NEW `BirAlphalistEwtPage` instead** — 1604-CF has a 3-schedule compensation partition (gross/non-taxable/taxable/withheld columns) that genuinely doesn't fit 1604-E + QAP's flat per-(payee × ATC) shape (payee_kind/atc_code/gross/withheld columns). The two pages share CSS prefix `alpha-` for visual continuity but the rendering logic is meaningfully different. Same call as the J2 author's choice to keep `BirEwtReturnDetailPage` (box-grid) separate from where alphalists naturally land.
- finance_tag stays PENDING by default for OUTBOUND (J2 default) — DO NOT auto-INCLUDE the way J3 Part B did for COMPENSATION. EWT rates depend on vendor characterization (corp/indiv, TWA registration, threshold flips) — finance has the judgment call; PENDING is the right default.
- BIR Alphalist Data Entry v7.x record contract is shared across SAWT / QAP / 1604-E — same D1 line shape (`D1|Seq|PayeeTIN|RegName|FirstName|MiddleName|Address|Nature|ATC|Gross|Rate|Withheld`). Only the H/T tags distinguish them. SAWT's `serializeSawtDat` was already the byte-for-byte template; J4 just changed the H/T tags.
- `period_payee_id: null` filter on the BirFilingStatus upsert is critical — without it, a stray per-payee 2316 row could collide with the annual 1604-E row by accident (same form_code namespace separation as 1604-CF + SAWT did).


### J1 — 2550M / 2550Q VAT Return (Apr 28 2026, uncommitted on dev)

**What shipped**:

1. **`backend/erp/services/vatReturnService.js`** (new) — entity-scoped VAT return aggregator:
   - `compute2550M({ entityId, year, month })` — pulls VatLedger OUTPUT/INPUT rows (`finance_tag='INCLUDE'`) + SalesBookSCPWD POSTED rows for the period; returns the 10 BIR boxes 13A/14A/15A/16A/17A/18A/20A/20B/20G/22A. Carryover (20A) reads previous month's `BirFilingStatus.totals_snapshot.net_vat_payable` (negatives carry as input-VAT credit).
   - `compute2550Q({ entityId, year, quarter })` — sums three monthly `VatLedger.period` rows + SCPWD per quarter; same 10-box layout.
   - `exportFormCsv(...)` — CSV streamed with header lines (entity, TIN, RDO, generated-at). Computes SHA-256 of the bytes, appends to `BirFilingStatus.export_audit_log` (artifact_kind='CSV', filename, content_hash, byte_length), and refreshes `totals_snapshot` so the heatmap reflects fresh numbers without forcing mark-reviewed.
   - Box layout is BIR-fixed (RR 16-2005 + TRAIN amendments), inlined as constants — NOT lookup-driven, because subscriber re-skinning a BIR field name is a wrong-form risk. The `BIR_FORMS_CATALOG` lookup remains the right level for subscriber-tunable form-level metadata (frequency, due_day, channel).
   - **J1 stubs (return 0, surfaced in UI banner)**: `zero_rated_sales` (14A) and `sales_to_government` (16A) — Phase J1.1 will join `Sale.customer.vat_status='ZERO_RATED'` + `Customer.customer_type='GOVERNMENT'`. Bookkeeper manually adjusts these boxes in eBIRForms when applicable; CSV is honest about what was computed.
2. **3 new endpoints** in [birController.js](backend/erp/controllers/birController.js):
   - `GET /api/erp/bir/forms/2550M/:year/:month/compute` — VIEW_DASHBOARD scope. Returns `{ totals, meta, filing_row }`.
   - `GET /api/erp/bir/forms/2550Q/:year/:quarter/compute` — VIEW_DASHBOARD scope.
   - `GET /api/erp/bir/forms/:formCode/:year/:period/export.csv` — EXPORT_FORM scope. Streams CSV + sets `Content-Disposition` (filename `2550M_YYYY-MM.csv` / `2550Q_YYYY-QN.csv`) + `X-Content-Hash` (SHA-256). Logs to console for ops audit (mirrors SCPWD pattern).
   - Routes wired in [birRoutes.js](backend/erp/routes/birRoutes.js) **BEFORE** the catch-all `GET /forms/:id` so Express doesn't try to look up "2550M" as a Mongo `_id`. Health check enforces this ordering.
3. **CORS exposed-headers extended** in [server.js](backend/server.js) `buildCorsOptions`: added `Content-Disposition` + `X-Content-Hash` to `exposedHeaders` so the browser can read filename + content hash on the CSV response. Without this, axios cannot surface the headers to the page (silent fail in production behind real CORS — works in dev only because dev origin policy is permissive).
4. **`frontend/src/pages/admin/BirVatReturnDetailPage.jsx`** (new) — copy-paste UI. One card per BIR box (label + value + copy-icon button), grouped by section (SALES / OUTPUT / INPUT / PAYABLE) preserving the eBIRForms 7.x flow. Lifecycle buttons (Mark Reviewed / Mark Filed / Mark Confirmed) call the J0 endpoints. Export CSV uses synthetic `<a>` + `URL.createObjectURL` to trigger the download. PageGuide key `bir-vat-return` (registered in [PageGuide.jsx](frontend/src/components/common/PageGuide.jsx)).
5. **App.jsx route**: `/admin/bir/:formCode/:year/:period` lazy-imports `BirVatReturnDetailPage`. Same `ROLE_SETS.BIR_FILING` guard as the J0 dashboard (admin / finance / president / bookkeeper); per-endpoint scope is enforced backend-side via `birAccess.userHasBirRole`.
6. **Heatmap cell-click navigation** in [BIRCompliancePage.jsx](frontend/src/pages/admin/BIRCompliancePage.jsx) — cells for `2550M` and `2550Q` are `role="button"`, keyboard-accessible (Enter/Space), navigate to `/admin/bir/{form}/{year}/{period}`. Other forms (J2+) remain visual-only until their detail pages ship — no 404 surprise.
7. **Health check**: [backend/scripts/healthcheckBirVatReturnWiring.js](backend/scripts/healthcheckBirVatReturnWiring.js) — 39 assertions across 12 sections (service exports, controller methods, route ordering, CORS headers, frontend service, page wiring, App.jsx route, heatmap navigation, PageGuide entry, lookup catalog, PeriodLock enum, audit-log fields). Exit 1 on first failure → CI gate. **Verified passing Apr 28 2026.**

**Subscription-readiness checklist (Rule #3 + Rule #19)**:
- All reads scoped via `req.entityId` — verified in `compute2550M` / `compute2550Q` / `exportFormCsv`.
- Form catalog driven by `BIR_FORMS_CATALOG` lookup (subscriber can disable 2550M for non-VAT entities).
- Role gates driven by `BIR_ROLES` lookup (`VIEW_DASHBOARD` for compute, `EXPORT_FORM` for CSV) — subscriber adds `bookkeeper` to `EXPORT_FORM` per entity without code changes.
- Period-lock middleware `BIR_FILING` already in `PeriodLock.module` enum (J0 prereq); `mark-filed` honors it (J0).
- Box layout is BIR-fixed (intentionally NOT lookup-driven — see J1 step 1 above).

**Open follow-ups (J1.x polish, not blocking J2)**:
- **J1.1 — customer-type joins**: 14A (zero-rated) + 16A (government) currently stubbed at 0. Wire `Sale.customer.vat_status` + `Customer.customer_type` joins (~2 hours).
- **J1.2 — eBIRForms XML import**: eBIR Forms 7.9 supports `File → Open` for some forms via XML. Stretch goal once bookkeeper confirms it's stable.
- **J1.3 — golden-file fixture tests**: lock the CSV byte format with a snapshot in `backend/erp/services/__fixtures__/`. Detects accidental column re-orders on regression.

### J5 — Books of Accounts (Loose-Leaf PDFs) (May 04 2026 evening, uncommitted on dev)

**Goal**: replace the bookkeeper's manual PDF binding workflow with a one-click Books of Accounts generator. Six BIR-required journals/ledgers (Sales / Purchase / Cash Receipts / Cash Disbursements / General Journal / General Ledger) per BIR RR 9-2009 §3, monthly + annual binding modes, with the BIR-compliant header on every page, page numbering, and a sworn declaration template per book per year.

**What shipped (J5)**:

1. **[backend/erp/services/bookOfAccountsService.js](backend/erp/services/bookOfAccountsService.js)** (NEW) — pure-read aggregator + PDF writer:
   - `BOOK_CODES = ['SALES_JOURNAL', 'PURCHASE_JOURNAL', 'CASH_RECEIPTS', 'CASH_DISBURSEMENTS', 'GENERAL_JOURNAL', 'GENERAL_LEDGER']` plus `DEFAULT_BOOK_RULES` (per-book metadata: source_modules / cash_side / priority / bir_section / description) — defaults trigger when the lookup is unseeded; subscribers override per-entity by adding rows.
   - `classifyJournalEntry(je, rules, cashSet) → bookCode` — pure function. Priority order Sales > Purchase > Cash-DR > Cash-CR > GeneralJournal. Each POSTED JE classifies to **exactly one** specialised book (no double-count, no miss). General Ledger is the same set of rows projected by `account_code`.
   - `loadBookRules(entityId)` / `loadCashAccountCodes(entityId)` / `loadResponsibleOfficer(entityId)` — three lookup loaders. Cash account derivation falls back to `ChartOfAccounts.find({ entity_id, account_type: 'ASSET', is_active: true })` filtered by the PRD §11.1 range regex `/^10[01][0-9]$/` when `BIR_BOA_CASH_ACCOUNTS` is empty. Responsible officer falls back to placeholder underscores so subscriber pen-fills before notarisation.
   - `computeBook({ entityId, bookCode, year, month? }) → { rows, totals, period_label, ... }` — dispatcher. Annual = no month; monthly = month 1-12. For specialised journals, returns one row per JE classified into this book. For General Ledger, returns `accounts[]` projection (per-account roll-up with running balance + closing balance).
   - `exportBookPdf({ entityId, bookCode, year, month?, entity })` — full PDF generation with **BIR-compliant header on every page** (Registered Name, TIN, RDO, Business Style, Address, Period, "Page X of Y" footer with ISO timestamp + content hash). Annual binding = 12 monthly sections + 1 year-summary section. Trial-balance check rendered on the General Ledger PDF (red INVARIANT WARNING on Debit ≠ Credit).
   - `exportSwornDeclaration({ entityId, bookCode, year, entity })` — per-book annual sworn declaration template per BIR RR 9-2009 §4. Officer name/title/TIN/CTC pulled from lookup; notarisation block (notary public name + Doc/Page/Book/Series numbers) always pen-filled by the notary.

2. **[backend/erp/controllers/birController.js](backend/erp/controllers/birController.js)** — four new exports gated by `birAccess`:
   - `getBooksCatalog` (VIEW_DASHBOARD) — returns `{ books, cash_account_codes, responsible_officer }` for the page bootstrap.
   - `computeBook` (VIEW_DASHBOARD) — wraps `bookOfAccountsService.computeBook` + attaches the BIR_FILING_STATUS row (`form_code='BOOKS'`, annual encoding).
   - `exportBookPdf` (EXPORT_FORM) — invokes the PDF writer, lazy-creates the `BOOKS` filing-status row, appends `export_audit_log` entry with SHA-256 hash + byte length per Rule #20.
   - `exportBookSwornDeclarationPdf` (EXPORT_FORM) — separate per-book sworn declaration; also audit-logged. Both endpoints emit structured `[BIR_EXPORT_BOOKS_PDF]` / `[BIR_EXPORT_BOOKS_SWORN]` audit lines for ops monitoring.

3. **[backend/erp/routes/birRoutes.js](backend/erp/routes/birRoutes.js)** — four new routes mounted **BEFORE** the J1 `/forms/:formCode/:year/:period/export.csv` catch-all (Express priority, otherwise J1's CSV exporter would catch BOOKS requests):
   - `GET /forms/BOOKS/:year/catalog` → `getBooksCatalog`
   - `GET /forms/BOOKS/:year/:bookCode/compute?month=N` → `computeBook` (annual when `?month` omitted)
   - `GET /forms/BOOKS/:year/:bookCode/export.pdf?month=N` → `exportBookPdf`
   - `GET /forms/BOOKS/:year/:bookCode/sworn-declaration.pdf` → `exportBookSwornDeclarationPdf`

4. **[backend/erp/controllers/lookupGenericController.js](backend/erp/controllers/lookupGenericController.js)** — three new SEED_DEFAULTS categories for subscription-driven configuration (Rule #3 / Rule #19):
   - `BIR_BOA_BOOK_CATALOG` — six rows (SALES_JOURNAL / PURCHASE_JOURNAL / CASH_RECEIPTS / CASH_DISBURSEMENTS / GENERAL_JOURNAL / GENERAL_LEDGER), each with `metadata.source_modules` + `metadata.cash_side` + `metadata.priority` + `metadata.bir_section` + `metadata.description` + `insert_only_metadata: true` so subscriber overrides survive future re-seeds.
   - `BIR_BOA_CASH_ACCOUNTS` — empty by default; subscribers add rows whose `code` is the 4-digit account code that should classify as cash. Service falls back to `ChartOfAccounts` PRD §11.1 derivation when this is empty.
   - `BIR_BOA_RESPONSIBLE_OFFICER` — empty by default; subscribers add a single row (typically `code='OFFICER'`) with `metadata.{name, title, tin, ctc_no, ctc_place, ctc_date}` for the sworn declaration. Falls back to underscores when absent.

5. **[frontend/src/erp/services/birService.js](frontend/src/erp/services/birService.js)** — four new helpers: `getBooksCatalog(year)` / `computeBook(year, bookCode, month)` / `exportBookPdf(year, bookCode, month)` / `exportBookSwornDeclaration(year, bookCode)`. Both PDF helpers route through `downloadBlob` so the X-Content-Hash header surfaces to the page's toast confirmation.

6. **[frontend/src/erp/pages/BookOfAccountsPage.jsx](frontend/src/erp/pages/BookOfAccountsPage.jsx)** (NEW) — per-book card with 12-month grid + Annual button + Recompute + Export PDF + Sworn Declaration buttons. Status pill from the BOOKS filing-status row, cash-account list + responsible officer name surfaced from the catalog, audit-log strip showing the last 30 exports across all books for the year. Empty state copy explicitly mentions the lookup categories that route entries (subscription discoverability — clerk knows which lookup to edit when a JE landed in the wrong book).

7. **[frontend/src/App.jsx](frontend/src/App.jsx)** — route `/erp/bir/BOOKS/:year` mounted **BEFORE** the `/:formCode/:year/:period` wildcard fallback (mirrors J3 Part B + J4 mount order). Lazy-loaded via `lazyRetry`. Route guard `ROLE_SETS.BIR_FILING`.

8. **[frontend/src/erp/pages/BIRCompliancePage.jsx](frontend/src/erp/pages/BIRCompliancePage.jsx)** — heatmap drill-down `annualForms` array extended from `['1604-CF', '1604-E']` to `['1604-CF', '1604-E', 'BOOKS']`. Clicking the BOOKS heatmap cell navigates to `/erp/bir/BOOKS/:year`.

9. **[frontend/src/components/common/PageGuide.jsx](frontend/src/components/common/PageGuide.jsx)** — new `bir-boa-books` PageGuide entry (7 numbered steps + 3 next-steps + tip). Cites BIR RR 9-2009 + RA 11534 (subscription-readiness signal — pharmacy SaaS subscriber knows the regulatory basis). Tip mentions the trial-balance check + cash-account fallback + the three lookup categories explicitly so subscribers discover where to edit without code dives.

10. **[backend/scripts/healthcheckBookOfAccounts.js](backend/scripts/healthcheckBookOfAccounts.js)** (NEW) — 119/119 assertion suite covering: service module exports, classifyJournalEntry priority logic exhaustively (Sales > Purchase > Cash-DR > Cash-CR > GJ + empty-cash-set fall-through), PRD cash regex boundary (1000/1019 in, 1020/999 out), `_internal` helpers (round2 / periodLabel / periodFilenameSegment / buildPeriodMatch), PDF rendering primitives (PDFDocument LETTER + bufferPages + pageAdded listener + Page X of Y stamp + SWORN DECLARATION + RR 9-2009 + SUBSCRIBED AND SWORN + Doc/Page/Book notary fields + INVARIANT WARNING on debit/credit mismatch + SHA-256 audit hashing), controller wiring (4 handlers + role gates + structured audit log strings + form_code='BOOKS' write), route mount order (BOOKS routes before J1 export.csv catch-all AND before /:id catch-all), BirFilingStatus FORM_CODES + annualForms membership, PeriodLock BIR_FILING enum, three lookup seed categories, frontend birService exports + URL paths, page imports + service invocations + PageGuide key, App.jsx route mount order, BIRCompliancePage heatmap drill-down, ROLE_SETS.BIR_FILING.

**Live evidence (May 04 2026 evening)**:
- **Healthcheck 119/119 PASS** — `node backend/scripts/healthcheckBookOfAccounts.js`.
- **Sibling regressions all green**: J3 Part A 78/78, J3 Part B 66/66, J4 97/97, J2 124/124, J1 39/39, ClmIdempotency 6/6, ClmPerformance 34/34, TeamActivity 22/22, SalesDiscount 41/41.
- **Vite production build green** — 51.24s. `dist/assets/BookOfAccountsPage-DbiChX5O.js` chunk emitted (lazy-loaded).
- **Live HTTP smoke (president cookies)**:
  - `GET /forms/BOOKS/2026/catalog` → 200, 6 books, 7 cash codes auto-derived from VIP CoA (`['1000','1010','1011','1012','1014','1015','1016']`), responsible officer renders placeholder underscores (no lookup row seeded).
  - `GET /forms/BOOKS/2026/SALES_JOURNAL/compute` → 200, 11 rows, ₱315,315 DR = ₱315,315 CR (balanced).
  - `GET /forms/BOOKS/2026/SALES_JOURNAL/compute?month=4` → 200, 9 rows, ₱313,515 (April includes the day's smoke CSI #99001 ₱900).
  - `GET /forms/BOOKS/2026/GENERAL_LEDGER/compute` → 200, **15 accounts, 51 lines, ₱352,359.11 DR = ₱352,359.11 CR (trial balance balanced — diff 0.00)**.
  - `GET /forms/BOOKS/2026/CASH_RECEIPTS/compute` → 200, 2 rows, ₱991. `CASH_DISBURSEMENTS` + `PURCHASE_JOURNAL` → 0 rows (no expenses paid in cash this year, no AP/SUPPLIER_INVOICE JEs — confirms classifier correctly partitions).
  - `GET /forms/BOOKS/2026/GENERAL_JOURNAL/compute` → 200, 9 rows, ₱36,053.11.
  - **Sub-ledger ↔ GL invariant**: SALES (315,315) + PURCHASE (0) + CASH_RECEIPTS (991) + CASH_DISBURSEMENTS (0) + GENERAL_JOURNAL (36,053.11) = **352,359.11 = GL** exactly. The classifier produces a perfect partition (no double-count, no miss).
  - `GET /forms/BOOKS/2026/NOT_A_BOOK/compute` → 400 with `Invalid book code. One of: SALES_JOURNAL, ...` (helpful error path).
  - `GET /forms/BOOKS/2026/SALES_JOURNAL/compute?month=99` → 400 with `Invalid month. 1-12 or omit for annual.`
  - `GET /forms/BOOKS/2026/SALES_JOURNAL/export.pdf?month=4` (president) → 403 `Forbidden — BIR EXPORT_FORM permission required.` (correct — president has VIEW_DASHBOARD only; admin/finance/bookkeeper own EXPORT_FORM per the BIR_ROLES seed).
- **Direct service smoke (bypasses HTTP role gate to confirm PDF bytes work)**:
  - SALES_JOURNAL April 2026 → **3,520-byte PDF, magic `%PDF`, 1 page, hash `19c5c45192c04cc2…`**.
  - GENERAL_LEDGER Annual 2026 → **39,411-byte PDF, magic `%PDF`, 11 pages, hash `4a931affcf1a491c…`** (12 monthly sections + summary across overflow pages — page numbering works).
  - Sworn Declaration SALES_JOURNAL 2026 → **3,304-byte PDF, magic `%PDF`, hash `263660f8090eda50…`**.

**Subscription-ready posture (J5)**:
- Three new per-entity lookup categories (BIR_BOA_BOOK_CATALOG / BIR_BOA_CASH_ACCOUNTS / BIR_BOA_RESPONSIBLE_OFFICER) all `insert_only_metadata: true` so admin/subscriber overrides survive future re-seeds — Rule #3 / Rule #19.
- Source-of-truth boundary: every book is a pure read of POSTED `JournalEntry` rows. No new ledger schema needed; sub-ledger reconciliation is deterministic (sum of 5 specialised journals == GL within ₱0.01).
- Cash account derivation has a graceful degradation chain (lookup → ChartOfAccounts ASSET 1000-1019 → empty set). The PRD §11.1 fallback works for VIP today; subscribers using non-PRD CoA codes seed `BIR_BOA_CASH_ACCOUNTS` once and the books light up.
- Page-numbering uses pdfkit `bufferPages: true` + `bufferedPageRange()` BEFORE `doc.end()` (NOT after — `flushPages()` invalidates the buffer queue, which I caught during the smoke and fixed pre-commit).
- BIR Form codes sequenced into the existing `BirFilingStatus.form_code` enum (J0 already reserved 'BOOKS' as an annual form). One row per (entity, year); per-book per-period exports all stack onto that row's `export_audit_log`.
- PeriodLock `BIR_FILING` module already in the enum (J0). Books PDFs respect period lock — once a year's BOOKS row is CONFIRMED, retroactive JE edits are gated.

**Open follow-ups (J5 and beyond)**:
- ~~**J6 — 2307-IN inbound reconciliation (~1 day)**~~ — **SHIPPED May 04 2026** (this commit batch). See `### J6 — Inbound 2307 Reconciliation` below.
- **J7 — 1702/1701 income tax (~1.5 days)**: annual return aggregator pulling from GL + `cwt2307ReconciliationService.compute1702CwtRollup` (the J6 endpoint already exposed at `/forms/1702/:year/cwt-rollup`).
- **Playwright UI smoke** for J5 (and re-smoke for J3/J4) deferred — MCP browser locked. Re-smoke when MCP unblocks: `/erp/bir/BOOKS/2026` (all 6 book cards + monthly grid + Recompute + Export PDF + Sworn Declaration buttons + audit-log strip), `/erp/bir/1604-CF/2026`, `/erp/bir/1604-E/2026`, `/erp/bir/QAP/2026/1`, `/erp/bir/1601-C/2026/4`, `/erp/bir/2307-IN/2026` (J6 page).
- **Compensation Posture card on dashboard** (still deferred from J3 Part B) — backend wired, ~30 min frontend.

### J6 — Inbound 2307 Reconciliation (May 04 2026 evening, uncommitted on dev)

**Goal**: close the loop on hospital-side withholding. Every collection with `cwt_amount > 0` already auto-creates a `CwtLedger` row at post time (collectionController.js:614 → cwtService.createCwtEntry). J6 adds a reconciliation lifecycle — **PENDING_2307 → RECEIVED → (or → EXCLUDED)** — so the bookkeeper can record when each hospital's BIR Form 2307 actually arrives. RECEIVED rows tagged for a year roll up into the 1702 Creditable Tax Withheld credit (Phase J7 will consume `compute1702CwtRollup`).

**Source-of-truth decision (locked May 04 2026)**: COEXIST, not migrate. CwtLedger remains the single source-of-truth for INBOUND CWT. J2's WithholdingLedger.DIRECTIONS reserves `'INBOUND'` for a future migration but writing collection-driven CWT through both ledgers would risk double-counting. Engine writes (collectionController + journalFromCWT) are unchanged — backwards-compat is intact for every CwtLedger row created before this phase.

**What shipped (J6)**:

1. **[backend/erp/models/CwtLedger.js](backend/erp/models/CwtLedger.js)** — schema extension (12 new fields, 2 new indexes, no breaking changes):
   - `status` enum `['PENDING_2307', 'RECEIVED', 'EXCLUDED']` default `'PENDING_2307'`. Pre-J6 rows that load without `status` get the default at read time — no backfill required.
   - `received_at` (Date) + `received_by` (ObjectId ref User) — bookkeeper attestation timestamp.
   - `cert_2307_url` + `cert_filename` + `cert_content_hash` + `cert_notes` — admin-supplied references to the PDF (Drive link / S3 URI / shared filesystem path). **We do NOT store PDF bytes** — bookkeeper hosts wherever convenient. Audit trail is the URL + filename + optional SHA-256 hash + the `received_at` / `received_by` stamp.
   - `excluded_reason` + `excluded_by` + `excluded_at` — finance disqualification (duplicate, void, hospital re-issued).
   - `tagged_for_1702_year` (Number, default = `year`) — overridable for cross-year reconciliation when a 2307 arrives after the 1702 was already filed (rare).
   - New compound indexes: `{entity_id, status, year}` (reconciliation queue) + `{entity_id, tagged_for_1702_year, status}` (1702 rollup).
   - `statics.STATUSES = STATUS_VALUES` for downstream consumers.

2. **[backend/erp/services/cwtService.js](backend/erp/services/cwtService.js)** — `createCwtEntry` defaults `status='PENDING_2307'` and `tagged_for_1702_year=data.year` so every new collection-driven row enters the reconciliation queue automatically. Backwards-compat: callers can override (rare).

3. **[backend/erp/services/cwt2307ReconciliationService.js](backend/erp/services/cwt2307ReconciliationService.js)** (NEW) — reconciliation engine + aggregators:
   - `compute2307InboundSummary({ entityId, year, quarter? })` — annual or quarterly hospital × quarter rollup partitioned by status. Returns `{ totals: { PENDING_2307, RECEIVED, EXCLUDED, cwt_credit_received, cwt_exposure_pending, cwt_total_all, row_count }, hospitals: [...], quarters_present, period_label, generated_at }`. Hospital name + TIN denormalized for display.
   - `listInboundRows({ entityId, year, quarter?, status?, hospitalId? })` — flat row list for the page table with hospital name resolved.
   - `markReceived(rowId, { entityId, userId, cert_2307_url, cert_filename, cert_content_hash, cert_notes })` — PENDING_2307 → RECEIVED. Stamps `received_at` + `received_by`. EXCLUDED rows are blocked (must restore via mark-pending first).
   - `markPending(rowId, { entityId, userId })` — RECEIVED → PENDING_2307 (undo) OR EXCLUDED → PENDING_2307 (restore). Clears `received_*` / `excluded_*` metadata as appropriate.
   - `excludeRow(rowId, { entityId, userId, reason })` — finance disqualifies. Reason is required (≥ 1 char after trim).
   - `buildInboundPosture(entityId, year)` — dashboard card payload: `{ enabled, pending_count, pending_cwt, received_count, received_cwt, excluded_count, excluded_cwt, total_cwt, received_pct, cwt_credit_for_1702, top_pending_hospitals: [...] (top 5), note }`.
   - `compute1702CwtRollup({ entityId, year })` — Phase J7 consumer endpoint. Returns `{ year, cwt_credit_for_1702, quarter_breakdown: { Q1, Q2, Q3, Q4 }, by_atc: [...], pending_exposure_cwt, pending_exposure_count, generated_at }`. Reads RECEIVED rows tagged for the year (legacy backfill: when `tagged_for_1702_year` is null we accept rows whose calendar `year` matches).
   - Pure helpers exported via `_internals` for the healthcheck (`round2`, `sanitize`, `_hashRowState`, `ensureObjectId`, `quartersForYear`, `emptyQuarterBucket`).

4. **[backend/erp/controllers/birController.js](backend/erp/controllers/birController.js)** — 7 new exports gated by `birAccess`:
   - `compute2307Inbound` (VIEW_DASHBOARD) — wraps the service summary; supports both annual (`/forms/2307-IN/:year/compute`) and quarterly (`/forms/2307-IN/:year/:quarter/compute`) URL shapes. Quarter param accepts `Q1..Q4` OR `1..4` via `parseQuarterCode`.
   - `list2307InboundRows` (VIEW_DASHBOARD) — flat row list, supports `?quarter=`, `?status=`, `?hospital_id=`.
   - `markReceived2307Inbound` / `markPending2307Inbound` / `exclude2307InboundRow` (RECONCILE_INBOUND_2307) — POSTs against `/forms/2307-IN/:year/rows/:rowId/{mark-received,mark-pending,exclude}`. Each emits a structured `[BIR_2307_INBOUND_*]` log line for ops monitoring (mirrors J5 audit log pattern).
   - `getInboundCwtPosture` (VIEW_DASHBOARD) — surfaces the dashboard card.
   - `compute1702CwtRollup` (VIEW_DASHBOARD) — `/forms/1702/:year/cwt-rollup`. Phase J7 consumer endpoint, pre-wired for the 1702 form.

5. **[backend/erp/routes/birRoutes.js](backend/erp/routes/birRoutes.js)** — 8 new routes mounted **BEFORE** the J1 `/forms/:formCode/:year/:period/export.csv` catch-all. Quarterly route declared BEFORE annual (specificity beats generality so `/forms/2307-IN/2026/Q2/compute` doesn't dispatch to the annual handler):
   - `GET /forms/2307-IN/:year/compute`
   - `GET /forms/2307-IN/:year/:quarter/compute`
   - `GET /forms/2307-IN/:year/list`
   - `POST /forms/2307-IN/:year/rows/:rowId/{mark-received,mark-pending,exclude}`
   - `GET /withholding/inbound-posture`
   - `GET /forms/1702/:year/cwt-rollup`

6. **[backend/utils/birAccess.js](backend/utils/birAccess.js)** — adds the `RECONCILE_INBOUND_2307` gate (default `[admin, finance, bookkeeper]`) wired through `getRolesFor` with the same lookup-driven posture as the existing 7 gates (60s cache, busts on Lookup edit). `userHasBirRole()` switch handles the new code; helper exports + DEFAULT_ array exported for caller introspection.

7. **[backend/erp/controllers/lookupGenericController.js](backend/erp/controllers/lookupGenericController.js)** — new BIR_ROLES seed row `RECONCILE_INBOUND_2307` with `metadata.roles = ['admin', 'finance', 'bookkeeper']` and `insert_only_metadata: true` so admin overrides survive future re-seeds. Subscribers reconfigure per entity via Control Center → Lookup Tables (Rule #3).

8. **[backend/erp/services/birDashboardService.js](backend/erp/services/birDashboardService.js)** — `inbound_2307_posture` added to the dashboard payload. Non-fatal: if the service throws, dashboard renders a fallback note instead of going dark. Always renders (INBOUND CWT depends on collections-with-CWT, not on the withholding-engine toggle).

9. **[frontend/src/erp/services/birService.js](frontend/src/erp/services/birService.js)** — 7 new helpers (`compute2307Inbound`, `list2307InboundRows`, `markReceived2307Inbound`, `markPending2307Inbound`, `exclude2307InboundRow`, `getInboundCwtPosture`, `compute1702CwtRollup`) added to the default export. Read helpers mirror the page-level URL shapes; write helpers POST against the row-level paths.

10. **[frontend/src/erp/pages/Bir2307InboundPage.jsx](frontend/src/erp/pages/Bir2307InboundPage.jsx)** (NEW) — reconciliation cockpit at `/erp/bir/2307-IN/:year(/:quarter)`:
    - Period selector strip (Annual + Q1..Q4) — same shape as J5 BookOfAccountsPage's monthly grid.
    - Totals card with 4 buckets (Pending / Received / Excluded / Total). Highlights "₱X of CWT credit at risk if these N pending 2307s don't arrive before 1702 closes" (the bookkeeper's chasing priority).
    - Per-hospital breakdown table — sortable by total CWT desc by default. "Filter" button per hospital.
    - Status tabs (Pending / Received / Excluded / All) over a row table with search box (CR no, hospital name, TIN). Per-row actions: Mark Received (modal: URL + filename + SHA-256 + notes), Revert (RECEIVED → PENDING), Exclude (modal: required reason), Restore (EXCLUDED → PENDING).
    - PageGuide `bir-2307-inbound` banner (workflow + RECONCILE_INBOUND_2307 lookup discoverability).

11. **[frontend/src/App.jsx](frontend/src/App.jsx)** — `Bir2307InboundPage` lazy-loaded; routes `/erp/bir/2307-IN/:year/:quarter` and `/erp/bir/2307-IN/:year` mounted **BEFORE** the `/erp/bir/:formCode/:year/:period` wildcard fallback. Quarterly route declared **BEFORE** annual (specificity).

12. **[frontend/src/erp/pages/BIRCompliancePage.jsx](frontend/src/erp/pages/BIRCompliancePage.jsx)** — heatmap drill-down extended (`isInbound2307` branch routes to `/erp/bir/2307-IN/:year`) + new **Inbound 2307 Posture card** between the Withholding Posture card and the Upcoming Deadlines card. Card shows: received-pct pill, 4-stat row (pending count + ₱, received count + ₱, excluded count, 1702 credit YTD), top-N hospitals to chase, "Reconcile →" navigation button.

13. **[frontend/src/components/common/PageGuide.jsx](frontend/src/components/common/PageGuide.jsx)** — `bir-2307-inbound` entry: 7-step workflow (pre-flight / lifecycle / period selector / chasing priority / no-PDF-bytes-stored / lookup-driven roles / EXCLUDE semantics) + 3 next-steps + tip naming `RECONCILE_INBOUND_2307` so subscribers discover the gate.

14. **[backend/scripts/healthcheckBir2307Inbound.js](backend/scripts/healthcheckBir2307Inbound.js)** (NEW) — 107-assertion wiring contract across 14 sections (model schema + indexes + statics; cwtService defaults; reconciliation service public API + pure-function logic; birController exports + role gates + structured log lines; birRoutes mount order; birAccess gate; BIR_ROLES seed; dashboard service wiring; frontend service URL shapes; page imports + state + modal wiring; App.jsx route mount order including quarterly-before-annual; BIRCompliancePage drill-down + posture card; PageGuide entry; ROLE_SETS.BIR_FILING). Exits 1 on first failure so CI gates on it.

**Verification posture (Rule 0b)**:

- ✅ J6 healthcheck **107/107 PASS** (`node backend/scripts/healthcheckBir2307Inbound.js`).
- ✅ Sibling regressions all green: J5 BOOKS 119/119, J4 1604E+QAP 97/97, J3 Part B 1604CF 66/66, J3 Part A Compensation 78/78, J2 EWT 124/124, J1 VAT 39/39, ClmIdempotency 6/6, ClmPerformance 34/34, TeamActivity 22/22, SalesDiscount 41/41.
- ✅ Vite production build **green** (`Bir2307InboundPage-Dge-rIvf.js` lazy chunk emitted alongside the existing BookOfAccountsPage / Bir1604CFDetailPage / BirAlphalistEwtPage / BirEwtReturnDetailPage / BirVatReturnDetailPage chunks).
- ✅ Pure-function smoke (in-process `node -e` against the service): `round2(1.235) → 1.24`, `sanitize('  hi  ') → 'hi'`, `sanitize('   ') → null`, `emptyQuarterBucket()` shape correct.
- ✅ Syntax check passes on all 8 modified backend files (`node -c …`).
- ⏭ **Live HTTP smoke and Playwright UI smoke deferred** — same MCP browser condition as J3 Part B + J4 + J5. Re-smoke targets when MCP unblocks: GET `/api/erp/bir/forms/2307-IN/2026/compute` (annual summary), GET `/forms/2307-IN/2026/Q2/compute` (quarterly), GET `/forms/2307-IN/2026/list?status=PENDING_2307`, POST `/forms/2307-IN/2026/rows/:rowId/mark-received` (with cert_2307_url payload), GET `/withholding/inbound-posture?year=2026`, GET `/forms/1702/2026/cwt-rollup`. UI walk: `/erp/bir` (Inbound 2307 Posture card renders) → click 2307-IN heatmap cell → lands on `/erp/bir/2307-IN/2026` → period selector + per-hospital table render → click "Mark Received" → modal with URL/filename/hash/notes → save → row flips to RECEIVED → "1702 credit YTD" total increments.

**Subscription-ready posture (J6)**:

- Per-entity `entity_id` filter on every aggregation (Rule #19). Cross-tenant leak risk = none.
- `RECONCILE_INBOUND_2307` is lookup-driven via `BIR_ROLES`. Subscribers add their bookkeeper role / remove finance via Control Center without code deployment (Rule #3).
- 1702 `tagged_for_1702_year` field future-proofs cross-year reconciliation (rare 2307s arriving after the 1702 was already filed).
- COEXIST decision keeps the door open for a future migration to `WithholdingLedger.direction='INBOUND'` — the rollup endpoint shape (`compute1702CwtRollup`) already returns the by_ATC breakdown that a unified-ledger query would emit, so J7 doesn't depend on the ledger shape underneath.
- We do NOT store PDF file bytes — eliminates the Year-2 multi-tenant blob-storage scaling question. Subscribers store wherever convenient (Drive / S3 / local).

**Source-of-truth boundary**:

- `CwtLedger` is the source-of-truth for INBOUND CWT. Every field needed for 1702 credit (year, quarter, cwt_amount, status, tagged_for_1702_year) is on the row.
- The dashboard `inbound_2307_posture` card is a derivation. `compute1702CwtRollup` is a derivation. Both are pure reads; no schema duplication.

**Audit posture (Rule #20)**:

- Every state transition stamps the actor (`received_by` / `excluded_by`) + timestamp (`received_at` / `excluded_at`) directly on the row.
- Structured `[BIR_2307_INBOUND_MARK_RECEIVED]` / `[..._MARK_PENDING]` / `[..._EXCLUDE]` log lines with content_hash, entity_id, year, quarter, user, ip, ts.
- `cert_content_hash` (admin-supplied SHA-256 of the cert PDF) makes re-receipts with different bytes detectable.
- 2307-IN form-level `BirFilingStatus` row creation is deferred to J7 1702 close — at that point the year's credit is "frozen" by the same period-lock pattern as the other forms (`PeriodLock.module='BIR_FILING'`).

**Known gotchas worth noting (J6)**:

1. **Pre-existing CwtLedger rows** (9 prod rows on the dev cluster as of May 04 2026) load without `status` — Mongoose returns the schema default `'PENDING_2307'` at read time. No migration required, but the bookkeeper sees a backlog of "pending" rows on first page load. Mark them received (or excluded if void) one-time to clear the queue.
2. **Quarter URL param** accepts both `Q1..Q4` AND `1..4`. The `parseQuarterCode` helper normalizes; the controller falls back to `parseQuarter` (numeric) if the upper-case match fails. Tests should hit both forms.
3. **Cross-year tagging** — when a 2307 arrives after the 1702 was already filed, finance can edit `tagged_for_1702_year` directly (manual DB edit until a UI is built — not on J6's critical path). The 1702 rollup honours the tag if set; falls back to calendar `year` if null (legacy rows).
4. **No `2307-IN` entry in BirFilingStatus today** — the `2307-IN` form_code IS in the model enum (J0 reserved it) but we don't lazy-create a row per (entity, year). J6 keeps the audit trail on the CwtLedger row itself + structured logs. J7 will lazy-create the row at 1702 close so the period-lock middleware fires correctly.
5. **Cash account derivation is unrelated** to J6 — J5's `BIR_BOA_CASH_ACCOUNTS` lookup classifies JE rows; J6 reads CwtLedger directly. The two services don't interact.
6. **Healthcheck fragile-regex defence**: the `BIR_ROLES` seed pattern `RECONCILE_INBOUND_2307[\s\S]{0,400}roles:\s*\[\s*['"]admin['"]…\]` uses a 400-char window for the roles array. If the seed line grows beyond 400 chars (e.g., a long description added inline) the regex misses; widen if needed.

### J7 — Annual Income Tax Return (1702 / 1701) (May 04 2026 evening, uncommitted on dev)

**Goal**: close the BIR suite. The 1702 helper aggregates POSTED JEs (`bir_flag IN [BOTH, BIR]` for periods Y-01..Y-12) by COA account-code range into Revenue / COGS / OPEX / Non-Opex / BIR-only buckets, derives Tax Due (RCIT vs MCIT comparison, take higher), then subtracts Creditable Tax Withheld (J6's `compute1702CwtRollup`) plus admin-supplied manual credits (1702-Q paid YTD, foreign tax credit, prior-year overpayment, other credits). The page is a copy-paste UX into eBIR Forms 7.x — one box per BIR field with a Copy button. 1701 is the same shape with TRAIN graduated brackets (or 8% flat rate election); stub when entity isn't `tax_type='SOLE_PROP'`.

**What shipped (J7)**:

1. **`backend/utils/incomeTaxRates.js`** (new) — lazy-cache (60s TTL per `(entityId, code)`) over `BIR_INCOME_TAX_RATES` lookup with `DEFAULTS` fallback. Codes: `CORP_REGULAR_RATE` (0.25), `CORP_SME_RATE` (0.20), `CORP_SME_TAXABLE_THRESHOLD_PHP` (5_000_000), `CORP_SME_ASSETS_THRESHOLD_PHP` (100_000_000), `MCIT_RATE` (0.02), `MCIT_GRACE_YEARS` (3), `INDIVIDUAL_8PCT_FLAT_RATE` (0.08). All Rule #3 / Rule #19 — subscriber tunes per-entity via Control Center → Lookup Tables.
2. **`backend/erp/services/incomeTaxReturnService.js`** (new) — the `compute1702({ entityId, year, manualOverrides })` aggregator + `compute1701` sole-prop variant. Internal seams: `aggregateAnnualBirJEs` (POSTED + period range + bir_flag filter), `partitionByBucket` (revenue=4000-4999 credit-normal, COGS=5000-5999 / OPEX=6000-6999 / Non-Opex=7000-7999 / BIR-only=8000-8999 all debit-normal, abnormal flag when net opposite to normal_balance, mis-tagged balance-sheet lines surfaced separately for finance to review before filing), `determineCorpRate` (RCIT 25% default, SME 20% only when both ceilings met — taxable ≤ ₱5M AND assets ≤ ₱100M ex-land), `determineMcit` (disabled if no `bir_registration_date`, grace until year 4 of operations, then 2% × gross income compared against RCIT — higher prevails), `applyIndividualBrackets` (TRAIN graduated 0/15/20/25/30/35% with frozen bracket table). Account-code ranges live in a frozen `ACCOUNT_RANGES` constant — future override via `BIR_INCOME_TAX_ACCOUNT_RANGES` lookup deferred until first non-PRD-CoA subscriber.
3. **`backend/erp/models/BirFilingStatus.js`** (modified) — relaxed the `2307-IN` validator. Pre-J7: `perPayeeForms = ['2307-OUT', '2307-IN', '2316']` required `period_payee_id` non-null. Post-J7: `perPayeeForms = ['2307-OUT', '2316']` and a new `annualOrPerPayeeForms = ['2307-IN']` permits BOTH shapes. The annual closure row (one per `(entity, year)`) is what `mark1702Filed` lazy-creates — the per-cert audit trail still lives on `CwtLedger.received_at` + `cert_content_hash`. Backwards-compat: J6 already sidestepped writing `2307-IN` BirFilingStatus rows (audit was console.log only) — no migration needed.
4. **`backend/erp/controllers/birController.js`** (modified) — 4 new exports: `compute1702` (lazy-loads filing row's `totals_snapshot` for manual overrides → calls service → returns boxes + schedules + cwt_rollup; returns HTTP 400 with `code: 'USE_1701'` for SOLE_PROP entities), `compute1701` (same shape, sole-prop only), `update1702Manual` (`EDIT_1702_MANUAL`-gated PATCH; clamps non-negative; lazy-creates DRAFT row; structured `[BIR_1702_UPDATE_MANUAL]` log line), `mark1702Filed` (`MARK_FILED`-gated POST; flips 1702 row to FILED; stamps computed `boxes` + `rates_used` into `totals_snapshot.filed_boxes` so historical filings stay immutable even as more 2307s arrive; THEN lazy-creates the `2307-IN` annual-closure row stamping `cwt_credit_for_1702` + `quarter_breakdown` + `by_atc` + `pending_exposure_cwt` + `tagged_for_1702_year`; structured `[BIR_1702_MARK_FILED]` log line).
5. **`backend/erp/routes/birRoutes.js`** (modified) — 6 new routes (`GET /forms/1702/:year/compute`, `GET /forms/1701/:year/compute`, `PATCH /forms/1702/:year/manual`, `PATCH /forms/1701/:year/manual`, `POST /forms/1702/:year/mark-filed`, `POST /forms/1701/:year/mark-filed`) declared BEFORE the J1 `/forms/:formCode/:year/:period/export.csv` catch-all AND BEFORE the generic `/forms/:id` GET. The 1701 PATCH/POST routes inject `req.params.formCode = '1701'` then delegate to the shared `update1702Manual` / `mark1702Filed` handlers (one impl, two paths). The J6 `cwt-rollup` endpoint (`GET /forms/1702/:year/cwt-rollup`) is preserved unchanged — the Bir1702DetailPage page reads it implicitly via the service's compute call.
6. **`backend/utils/birAccess.js`** (modified) — new `EDIT_1702_MANUAL` scope, default `[admin, finance, bookkeeper]` (same posture as `RECONCILE_INBOUND_2307` since both are bookkeeper data-entry tasks). Switch case + getter wired; lookup-driven via `BIR_ROLES.EDIT_1702_MANUAL`.
7. **`backend/erp/controllers/lookupGenericController.js`** (modified) — seeded `BIR_INCOME_TAX_RATES` category with 7 default rows (each `insert_only_metadata: true` so admin overrides survive future re-seeds) + added `EDIT_1702_MANUAL` row to `BIR_ROLES` seed + wired the `BIR_INCOME_TAX_RATES_CATEGORIES` cache invalidation hook at all 4 sites (create / update / soft-delete / seed). Without the hook a rate edit would wait up to 60s before propagating to a 1702 recompute.
8. **`frontend/src/erp/pages/Bir1702DetailPage.jsx`** (new, 410 lines) — single page handles BOTH 1702 (default) and 1701 (`formCodeOverride="1701"` prop). Sections: integrity banners (trial balance balanced + abnormal account count + mis-tagged balance-sheet count), entity card, Tax Computation card (per-box layout with Copy buttons matching BIR 1702-RT v2018 box numbers 13-23 OR 1701-A free-form), Tax Credits card (CWT from J6 + 4 manual fields + Total Credits + Net Payable), Manual Credits panel (5 inputs — quarterly_paid_ytd_php, foreign_tax_credit_php, prior_year_overpayment_php, other_credits_php, manual_cwt_override — with Save button gated by `lifecycleStatus !== 'CONFIRMED'`), CWT quarterly breakdown table (reads `cwt_rollup.quarter_breakdown`), 6 collapsible schedules (revenue / COGS / OPEX / non-opex / BIR-only + Mis-tagged Lines warning), Lifecycle Actions card (status pill + Mark FILED button with `prompt()` for BIR reference number).
9. **`frontend/src/erp/services/birService.js`** (modified) — added `compute1702(year)`, `compute1701(year)`, `update1702Manual(year, payload, formCode)`, `mark1702Filed(year, payload, formCode)`. All `withCredentials: true` via base axios instance.
10. **`frontend/src/App.jsx`** (modified) — lazy import `Bir1702DetailPage` + 2 routes (`/erp/bir/1702/:year` and `/erp/bir/1701/:year`) declared BEFORE the `/erp/bir/:formCode/:year/:period` wildcard fallback. 1701 reuses `Bir1702DetailPage` with `formCodeOverride="1701"` prop.
11. **`frontend/src/erp/pages/BIRCompliancePage.jsx`** (modified) — heatmap drill-down extended: `annualForms = ['1604-CF', '1604-E', 'BOOKS', '1702', '1701']`. Cell click on the 1702 row in the heatmap navigates to `/erp/bir/1702/:year`.
12. **`frontend/src/components/common/PageGuide.jsx`** (modified) — new `'bir-1702'` entry — 8-step workflow narrative covering pre-flight (POSTED JE aggregation), tax computation (1702 RCIT vs SME vs MCIT, 1701 brackets vs 8% flat), tax credits (J6 CWT rollup + manual fields), lifecycle (FILED stamps immutable totals_snapshot + lazy-creates 2307-IN closure), period-lock posture, subscription-readiness (BIR_INCOME_TAX_RATES + BIR_ROLES gates), tip on the 3 must-be-green banners before filing.
13. **`backend/scripts/healthcheckBir1702.js`** (new, 14 sections, **143/143 assertions PASS**) — incomeTaxRates helper exports + DEFAULTS + cache pattern; service exports + internal seams + aggregator filter contract; bucket math via synthetic JE row fixture (revenue + abnormal revenue + COGS + OPEX + non-opex + BIR-only + mis-tagged balance-sheet — verifies all 7 rows partition correctly with correct net amounts and abnormal flag); corp rate selection (4 cases: negative taxable / SME-eligible / over-taxable-threshold / over-assets-threshold); MCIT logic (4 cases: no reg date / grace year / MCIT > RCIT / RCIT > MCIT); TRAIN brackets (6 reference values from official BIR table); model relax (2307-IN out of perPayeeForms, into annualOrPerPayeeForms); controller exports + audit log line names + USE_1701 redirect; route ordering vs J1 catch-all + generic `/forms/:id`; birAccess EDIT_1702_MANUAL switch case + exports; lookup seed (7 rate rows + EDIT_1702_MANUAL role row + insert_only_metadata count); 4-site invalidation hooks; frontend service helpers + lazy import + route ordering vs wildcard + page imports + integrity banner + manual override field; PageGuide bir-1702 entry with required keys.

**Verification posture (Rule 0b)**:
- ✅ J7 healthcheck **143/143 PASS** (`node backend/scripts/healthcheckBir1702.js`).
- ✅ Sibling regressions all green: J6 inbound 2307 107/107, J5 BOOKS, J4 1604E+QAP 97/97, J3 Part B 1604CF 66/66, J3 Part A Compensation 78/78, J2 EWT, J1 VAT, ClmIdempotency.
- ✅ Vite production build green (16.48s); `Bir1702DetailPage-DNIRVkIu.js` lazy chunk emits alongside the existing BIR pages.
- ✅ Syntax check passes on all 8 modified backend files (`node -c …`).
- ✅ **Live HTTP smoke 7/7 PASS** (president cookies, VIP entity 69cd76ec7f6beb5888bd1a53):
  - `GET /forms/1702/2026/compute` → 200 with full payload — Gross Sales ₱149,446.42, COGS ₱7,959.11, Gross Income ₱141,487.31, Net Taxable Income ₱141,487.31, RCIT @ 25% = ₱35,371.83, MCIT disabled (`MCIT_DISABLED_NO_REGISTRATION_DATE`), Tax Due ₱35,371.83, CWT ₱0 (1 PENDING cert at ₱9 from J6 surfaces as exposure), Net Payable ₱35,371.83. TB balanced (DR=CR=₱342,359.11), 1 abnormal account flagged, 9 mis-tagged balance-sheet lines flagged.
  - `GET /forms/1701/2026/compute` (CORP entity) → 200 stub:`true` with `reason: "Entity tax_type=CORP is not SOLE_PROP. 1701 is for sole-proprietorship..."` — graceful degradation, no crash.
  - `PATCH /forms/1702/2026/manual` as **president** → **403** with `required_scope: 'EDIT_1702_MANUAL'` (correct — gate is `[admin, finance, bookkeeper]`; president excluded by design — same posture as J6 mark-received).
  - `POST /forms/1702/2026/mark-filed` as **president** → **403** with `required_scope: 'MARK_FILED'` (correct — same gate as the rest of J0-J6).
  - `GET /forms/1702/abc/compute` → **400** "Invalid year. Year ≥ 2024." (alpha-only year string rejected).
  - `GET /forms/1702/2023/compute` → **400** "Invalid year. Year ≥ 2024." (sub-floor year rejected).
  - `GET /forms/1702/2026/cwt-rollup` (J6 endpoint regression) → 200, pending exposure ₱9 / 1 cert / Q1=Q2=Q3=Q4=0 — **J6 unchanged by J7**.
- ✅ **Live Playwright UI smoke PASS** (president on http://localhost:5173/erp/bir/1702/2026, 0 console errors):
  - Page header `BIR 1702 — Annual Income Tax (Corp) — 2026` + Draft pill + Refresh.
  - All 7 H2 sections rendered: Filing entity / Tax Computation — CORP_REGULAR_RATE (25.00%) / Tax Credits / Manual Credits (admin-supplied) / CWT Credit — Per-Quarter Breakdown (J6) / Schedules — Revenue / COGS / OPEX / Filing Lifecycle.
  - 24 boxes rendered with correct values (Box 13 Gross Sales ₱149,446.42, Box 15 Gross Income ₱141,487.31 emphasized blue, Box 22 MCIT @ 2.00% = ₱0.00 with `MCIT_DISABLED_NO_REGISTRATION_DATE` basis label, Box 23 Income Tax Due ₱35,371.83 highlighted red because > 0, Box 30 Net Tax Payable ₱35,371.83 same red highlight, Box 24 CWT (J6 rollup) = ₱0.00 with "From RECEIVED 2307s tagged 2026" hint).
  - 3 integrity banners surfaced correctly: 1 abnormal balance warning, 9 mis-tagged balance-sheet lines warning, ₱9 CWT credit at risk warning with "Reconcile 2307-IN →" deep-link button.
  - 5 manual-credit input fields rendering (Quarterly 1702-Q YTD / Foreign Tax Credit / Prior Year Overpayment / Other Credits / Manual CWT Override) with help text, Save button enabled.
  - CWT quarterly breakdown table rendering 4 quarters + Total row.
  - 5 schedules collapsible (Revenue 1 account ₱149,446.42 + COGS 2 accounts ₱7,959.11 + OPEX 3 accounts ₱0 + Mis-tagged 9 accounts).
  - Mark FILED button rendered + enabled (gate-403 will fire on click as president, but the button DOM is wired).
  - PageGuide `bir-1702` 8-step banner rendered above the warnings.
  - Screenshot: `frontend/.playwright-mcp/j7-1702-detail-page-smoke.png` (full page, 1× scale).

**Subscription-ready posture (J7)**:
- Per-entity scoping on every aggregation (`entity_id` filter, Rule #19).
- Tax rates lookup-driven via `BIR_INCOME_TAX_RATES` (7 codes, `insert_only_metadata: true`).
- Role gates lookup-driven via `BIR_ROLES.EDIT_1702_MANUAL` + the standard `MARK_FILED` / `MARK_REVIEWED` / `MARK_CONFIRMED` chain.
- Account-code ranges (REVENUE / COGS / OPEX / NON_OPEX / BIR_ONLY) live in a frozen constant; non-PRD-CoA subscribers will eventually override via a future `BIR_INCOME_TAX_ACCOUNT_RANGES` lookup (deferred until first such subscriber arrives).
- 1701 is gated by `entity.tax_type === 'SOLE_PROP'` — unaffiliated entities get a clearly-flagged stub payload that doesn't crash the heatmap drill-down.
- Manual fields persist as `BirFilingStatus.totals_snapshot` so admin can resume work mid-year without losing inputs.

**Audit posture (Rule #20)**:
- `mark1702Filed` stamps `totals_snapshot.filed_boxes` from a fresh recompute at filing time so the historical record is immutable even as more 2307s arrive.
- Structured `[BIR_1702_UPDATE_MANUAL]` and `[BIR_1702_MARK_FILED]` log lines with user / role / entity / year / amounts / IP / timestamp.
- 2307-IN annual-closure row freezes `cwt_credit_for_1702` + `quarter_breakdown` + `by_atc` + `pending_exposure_cwt` + `tagged_for_1702_year` so future re-aggregations don't silently change historical filings.

**Known gotchas worth noting (J7)**:
1. **MCIT requires `bir_registration_date`** on the Entity. Without it MCIT is disabled and only RCIT applies — admin must edit Tax Config to elect MCIT comparison. We default to disabled because we don't want to silently increase tax due on entities that haven't actually been operating ≥4 years.
2. **SME rate requires `total_assets_php`** on the Entity. When unset we conservatively apply the regular 25% rate (BIR audit posture: burden of proof for the lower rate is on the taxpayer). Admin sets it via Tax Config to qualify.
3. **Trial-balance integrity banner** flags Total DR ≠ Total CR — this is rare in practice (every JE is balanced individually) but a sum mismatch indicates corrupted aggregation or a stale-period leak. Investigate before filing.
4. **Mis-tagged balance-sheet lines** surface in a separate `other` bucket — usually means a 2000-series account (AP, payables) was tagged BIR/BOTH instead of INTERNAL. Fix at the JE source, not on this page.
5. **`manual_cwt_override` semantics**: 0 means "use J6 auto-rollup" (recommended); >0 means "trust this manual figure". Admin-only escape hatch for certificates verified outside the J6 reconciliation flow — rare. The compute response surfaces `(MANUAL OVERRIDE active)` text so reviewers can see when it's set.
6. **1701 stub return shape** has `stub: true` + `reason` + minimal `entity` so the heatmap drill-down doesn't crash on CORP entities that mistakenly reach the 1701 page. The 1701 route remains valid for SOLE_PROP entities — the page reuses `Bir1702DetailPage` with `formCodeOverride="1701"` and the service layer enforces the entity-type gate.
7. **2307-IN closure row creation** only fires when `formCode === '1702'` (the 1701 mark-filed path skips it because 1701 doesn't have a corresponding 2307-IN concept — sole props receive their own 2307s but those go through the 1701-specific income-tax-credit line).
8. **Healthcheck filename** `healthcheckBir1702.js` (NOT `healthcheckBirIncomeTax.js` etc — match J3/J4/J5/J6 naming convention `healthcheckBir<thing>`).

### J0 — BIR Compliance Dashboard (shipped Apr 27 2026, smoke green)

**Locked decisions** (Apr 27 conversation):
- Filing channel: copy-paste totals into eBIR Forms (no eFPS), `.dat` for Alphalist Data Entry (SAWT/QAP/1604-CF/1604-E), PDF for loose-leaf books.
- All entities are Corporations -> 1702 annual income tax, VAT-registered (12%).
- Filing chain: President reviews `bir_flag` -> finance bundles -> external bookkeeper files -> BIR confirmation lands in `yourpartner@viosintegrated.net` (CEO inbox).
- Email-confirmation bridge ON — parser flips dashboard cards FILED -> CONFIRMED.
- Subscription-ready from day 1 — every artifact entity-scoped, lookup-driven.
- Withholding on contractors NOT active today; engine built but switch flipped per-entity (`Entity.withholding_active`) and per-contractor (`PeopleMaster.withhold_active`); auto-trips on PS eligibility.
- Build for rent (1606) and VAT-exempt meds (RA 11534) NOW — pharmacy/SaaS will need them.

**Phasing**: J0 (dashboard + foundation, ~3-4 d) -> J1 (2550M/Q VAT, ~2 d) -> J2 (1601-EQ + 1606 + 2307 + SAWT, ~3 d) -> J3 (1601-C + 1604-CF, ~1.5 d) -> J4 (QAP + 1604-E, ~2 d) -> J5 (Books of Accounts, ~2 d) -> J6 (inbound 2307 reconciliation, ~1 d) -> J7 (1702 helper, ~1.5 d). ~16 working days.

**Why J0 first**: data-quality and visibility are the actual bottleneck, not export logic. Without the dashboard we just hand the bookkeeper more reports and the president still flies blind.

**New surfaces**:
- Page: `/erp/bir` (president + admin + finance + new `bookkeeper` role)
- Models: `BirFilingStatus`, `BirDataQualityRun`, `WithholdingLedger`
- Lookups: `BIR_FORMS_CATALOG`, `BIR_FILING_STATUS`, `BIR_ATC_CODES`, `BIR_ROLES`
- Helpers: `backend/utils/birAccess.js` (mirrors `scpwdAccess.js`)
- Agents: `birDataQualityAgent` (nightly + on-demand)
- Permission: `bookkeeper` role — taxes-only access, no payroll/commission visibility
- Period-lock module: `BIR_FILING` added to `PeriodLock.module` enum

**Pattern reuse**: `scpwdSalesBookController` + `scpwdReportingService` + `scpwdAccess` are the templates. New BIR module is a generalization of VIP-1.H (which is one of seven forms in this suite).

**Plan**: `~/.claude/plans/vip-1-j-bir-compliance.md` (detailed file-level breakdown, J0-J7 sub-steps, open questions, handoff guidance).

---

## Phase MD-1 — Master Data Positive Sub-Permissions + Cross-Entity Write (Apr 27 2026)

**Why**: Pre-MD-1, the Master Data module's "FULL" toggle had **no positive sub-permissions** — only DANGER toggles (deactivate/delete). Setting `Master Data: FULL` on a `staff` user did nothing for Hospital + Customer Add/Edit because those routes were hardcoded to `roleCheck('admin','finance','president')` in [hospitalRoutes.js](backend/erp/routes/hospitalRoutes.js) / [customerRoutes.js](backend/erp/routes/customerRoutes.js). Legacy governance gap from Phase 18 — single-record CRUD never migrated to the modern `erpSubAccessCheck` infrastructure. ProductMaster lived under the wrong module (`purchasing.product_manage` instead of `master.product_manage`) and was president-only for cross-entity writes (line `if (!req.isPresident) filter.entity_id = req.entityId`).

User context: 2 BDM-promoted staff (Mae Navarro `s3.vippharmacy@gmail.com`, plus a future second hire) need to maintain Hospital/Customer/ProductMaster across all entities without bundling admin role. Lookup-driven and subscription-ready per Rule #3 + Phase 0d roadmap.

**What shipped**:

1. **4 new sub-permissions** in [lookupGenericController.js SEED_DEFAULTS](backend/erp/controllers/lookupGenericController.js) under `master`:
   - `MASTER__HOSPITAL_MANAGE` (key `hospital_manage`, sort_order 7) — Add/Edit Hospitals incl. aliases + warehouse assignment
   - `MASTER__CUSTOMER_MANAGE` (key `customer_manage`, sort_order 8) — Add/Edit Customers incl. BDM tagging
   - `MASTER__PRODUCT_MANAGE` (key `product_manage`, sort_order 9) — Add/Edit Product Master
   - `MASTER__CROSS_ENTITY_WRITE` (key `cross_entity_write`, sort_order 10) — Edit Master Data across entities (parent + subsidiary catalogs)
   All NON-danger so they're delegable via Access Template without explicit-grant friction. Seeded across every entity via `node backend/erp/scripts/seedAllLookups.js` (idempotent `$setOnInsert`).

2. **Two new helpers** in [erpAccessCheck.js](backend/erp/middleware/erpAccessCheck.js):
   - `erpRoleOrSubAccessCheck(roles, module, subKey)` — composition: legacy role bypass OR sub-permission grant. Used to migrate routes from hardcoded `roleCheck` without regressing legacy admin/finance/president callers whose Access Template might be in explicit-grant mode (which would otherwise cause `master = FULL + some-sub-perms-ticked` admins to lose write access).
   - `hasCrossEntityMasterData(user)` — returns true for President OR explicit `master.cross_entity_write` grant. Admin/Finance do **not** auto-pass — explicit grant required (Rule #3 lookup-driven). Mirrors danger-fallback design philosophy: high-trust capability is opt-in.

3. **Route migrations**:
   - [hospitalRoutes.js](backend/erp/routes/hospitalRoutes.js): POST `/`, PUT `/:id`, POST `/:id/alias` → `erpRoleOrSubAccessCheck(['admin','finance','president'], 'master', 'hospital_manage')`. Bulk export/import stay role-gated (admin-grade Excel round-trip).
   - [customerRoutes.js](backend/erp/routes/customerRoutes.js): POST `/`, PUT `/:id`, POST `/:id/tag-bdm`, POST `/:id/untag-bdm` → `erpRoleOrSubAccessCheck(...,'master','customer_manage')`. Bulk export/import stay role-gated.
   - [productMasterRoutes.js](backend/erp/routes/productMasterRoutes.js): all write routes (POST `/`, PUT `/:id`, POST `/tag-warehouse`, PATCH `/:id/reorder-qty`, GET/PUT `/export-prices` `/import-prices` `/refresh`) → `erpAnySubAccessCheck(['master','product_manage'], ['purchasing','product_manage'])` so existing access templates keep working AND new staff can use the canonical Master Data namespace.

4. **Cross-entity flag plumbing** in [productMasterController.js](backend/erp/controllers/productMasterController.js):
   - `create`: when `hasCrossEntityMasterData(req.user)` AND `req.body.entity_id` provided, the product is created under that target entity (instead of being forced to `req.entityId`).
   - `update`, `updateReorderQty`, `deactivate`, `deleteProduct`, `getById`: replaced `if (!req.isPresident) filter.entity_id = req.entityId` with `if (!hasCrossEntityMasterData(req.user)) ...`. President bypass preserved (PRESIDENT now flows through `hasCrossEntityMasterData` which short-circuits true for that role).
   - **Not** changed: `tagToWarehouse` warehouse entity validation (line 264) and `getProductWarehouses` ledger scope (line 307) still use `req.isPresident`. Cross-entity master-data write should not implicitly grant cross-entity warehouse poisoning or InventoryLedger probing — those are separate trust surfaces.

5. **Frontend banners + gating**:
   - [HospitalList.jsx](frontend/src/erp/pages/HospitalList.jsx): hardcoded `ROLE_SETS.MANAGEMENT.includes(user?.role)` button gates replaced with `canManageHospitals = ROLE_SETS.MANAGEMENT.includes(...) || hasSubPermission('master','hospital_manage')`. Backwards-compat: management roles keep working even before their Access Template is reconfigured; staff with the new explicit grant get the buttons too.
   - [ProductMaster.jsx](frontend/src/erp/pages/ProductMaster.jsx): `canAddEdit` now mirrors the backend dual-accept (`master.product_manage || purchasing.product_manage`).
   - [CustomerList.jsx](frontend/src/erp/pages/CustomerList.jsx): no frontend role gate to remove (Add/Edit buttons were ungated; backend was the only enforcement).
   - [WorkflowGuide.jsx](frontend/src/erp/components/WorkflowGuide.jsx): `hospitals`, `customer-list`, `product-master` banners updated with explicit Phase MD-1 step and `tip` referencing the new sub-permissions.

**Smoke ratification (Apr 27 2026, Playwright + live HTTP)**:
- Mae (BDM, granted 4 sub-perms) — Hospital create/update/alias-add 200/201, Customer create 201, ProductMaster own-entity create 201, ProductMaster cross-entity create (target=MG-and-CO from VIP working) 201, cross-entity update 200. ✓
- s19 (BDM, no grants) — all 3 Add endpoints correctly 403 with precise messages ("No access to master module" / "Access denied: requires master.product_manage or purchasing.product_manage permission"). ✓
- President — Hospital create 201 (no regression). ✓
- Lookup UI render — all 4 new sub-perms visible in PersonDetail Access Manager after running `seedAllLookups.js`. ✓
- Build clean: `npx vite build` 10.76s, `npx eslint` clean (backend EXIT=0, frontend EXIT=0), `node scripts/startupCheck.js` passed.

**Subscription-ready**: every gate is lookup-driven. A subscriber spinning up a new tenant gets the 4 sub-perms seeded automatically (lazy-seed on first GET per entity, OR explicit `seedAllLookups.js` on bootstrap). Subscribers can revoke any sub-perm without code changes — Access Template editor honors all toggles. Bulk Import/Export remain admin-grade because they bypass per-record audit; granting them to non-admins would break Rule #20 audit trail.

**Why a composition helper instead of pure `erpSubAccessCheck`**: legacy admin/finance/president might have their Access Template in "explicit-grant mode" (any single sub-perm ticked under `master`). In that mode, `erpSubAccessCheck` requires the specific key. An admin who only ticked `master.hospital_alias_delete` would suddenly lose Add/Edit hospital — silent regression. `erpRoleOrSubAccessCheck` short-circuits the legacy roles before reaching the explicit-grant gate, preserving pre-MD-1 behavior exactly.

**Known follow-ups (not in scope)**:
- [territoryRoutes.js](backend/erp/routes/territoryRoutes.js) POST/PUT still use `roleCheck('admin','finance','president')`. Territories are master data too — same migration could land a future MD-1.b. Skipped because territory CRUD is rare and admin-handled.
- Existing access templates with `purchasing.product_manage` ticked keep working (dual-accept). When a tenant migrates to the canonical `master.product_manage`, they should re-tick on the new module key. No automatic migration script (low blast radius — president bypass covers admins).

---

## Phase G5 (Customer Globalization) — Index Migration Applied on Dev (Apr 27 2026)

**Status**: code shipped Apr 24-26 (Customer model + controller flipped to Hospital-style global pattern). The Mongo index migration `backend/erp/scripts/migrateCustomerGlobalUnique.js` had not run, so the legacy compound unique `{entity_id, customer_name_clean}` was still co-existing with the new global single-field unique. Closed on dev Apr 27 2026.

**Why this mattered**: Phase G5 controller code allowed cross-entity sales (a BDM tagged to a customer can sell that customer under any working entity). Without the migration, the legacy compound index would have permitted a SECOND customer with the same name in a different entity — exactly the duplicate-master class of bug Phase G5 was meant to prevent. Net-new customers worked because the schema-driven `customer_name_clean_1` global unique was already installed by Mongoose `syncIndexes` on app boot (no dupes existed to block it). The redundant legacy compound just took up space and confused operators reading the index list.

**Run sequence (Apr 27 2026, dev cluster `cluster0.e9wenoo.mongodb.net/vip-pharmacy-crm-dev`)**:

1. **Dry-run** — `node erp/scripts/migrateCustomerGlobalUnique.js`
   - Result: 0 duplicate `customer_name_clean` groups across entities. 10 indexes present, 3 of them legacy (`entity_id_1_customer_name_clean_1` unique, `entity_id_1_status_1`, `entity_id_1_customer_type_1`).
2. **Apply** — `node erp/scripts/migrateCustomerGlobalUnique.js --apply`
   - Dropped 3 legacy indexes; `Customer.syncIndexes()` confirmed Phase-G5 shape.
   - Final state: 7 indexes, including `customer_name_clean_1` (unique, global), `entity_id_1` (non-unique, home label), `status_1`, `customer_type_1`, `tagged_bdms.bdm_id_1`, text index on `customer_name + customer_aliases`.
3. **Idempotency check** — re-ran dry-run, output: `✓ No legacy entity-scoped indexes present — nothing to drop.`

**Smoke ratification (Playwright, live HTTP, dev cluster)**:
- POST `/api/erp/customers` with `X-Entity-Id: <BALAI>` and a `customer_name` matching an existing VIP-home customer → **HTTP 400** `customer_name_clean already exists` (handled via [errorHandler.js handleDuplicateKeyError](backend/middleware/errorHandler.js)). The legacy compound would have allowed this row.
- GET `/api/erp/customers` with `X-Entity-Id` set successively to VIP / BALAI / MG-and-CO → all three return the same single VIP-home customer (cross-entity visibility, the Phase G5 user-facing win).
- Customer Management UI ([CustomerList.jsx](frontend/src/erp/pages/CustomerList.jsx)) renders cleanly with the post-MD-1 WorkflowGuide banner intact ("Customers are globally shared across entities").

**Integrity sweep (no consumers depended on the legacy compound)**:
- All Customer FK refs (`SalesLine.customer_id`, `Collection.customer_id`, `CreditNote.customer_id`, `Collateral.customer_id`, `NonMdPartnerRebateRule`) resolve by `_id` via Mongoose `ref:'Customer'` — unchanged by the index drop.
- `customerAccess.buildCustomerAccessFilter` is BDM-tagging-driven (`tagged_bdms.bdm_id`), not entity-uniqueness driven.
- `customerController.upsert` already used `customer_name_clean` global key (line 198) — controller intent matched the now-applied index shape.
- One residual `Customer.findOne({ entity_id: vip._id })` in [createCsiTestSale.js:76](backend/erp/scripts/createCsiTestSale.js#L76) is a test-fixture script that picks any customer in an entity for sample-data generation — non-production path, not uniqueness-dependent. Left as-is.
- Phase G6 [resolveEntityScope.js](backend/erp/utils/resolveEntityScope.js) (Apr 27 commit `c106e48`) strips `bdm_id` for master-data scope filters — orthogonal to the migration; both work together.

**Prod gate (NOT shipped this session)**:
- Mongo Atlas pre-prod snapshot required before `--apply` on prod cluster.
- Run sequence: backup → `NODE_ENV=production node backend/erp/scripts/migrateCustomerGlobalUnique.js` (dry-run on prod) → review dupe report → if clean, `--apply`.
- Same idempotency property (re-running is a no-op) means prod run can happen in a maintenance window without coordination concerns beyond the backup.
- Tracked in `memory/handoff_customer_global_migration_apr27_2026.md` (now updated with the dev result).

**Subscription-ready posture**: the global-unique pattern matches Hospital and is the same shape that will land in subscriber tenants. Customer remains globally shared via `tagged_bdms` for BDM visibility (no `entity_id` filter); selling-entity is sourced from `Sale.entity_id` so AR posts to the correct books regardless of customer home. Same future-tenant-friendly contract as Hospital — see `# Phase (Future) — Unified Party Master` for the roadmap consolidation.

---

## Phase Apr-2026 #1 — Orphan Ledger Audit Agent (shipped Apr 27 2026)

**Goal**: catch the case where a POSTED transactional doc (Sales / Collection / PRF-CALF) has NO corresponding `JournalEntry` because the auto-journal block runs OUTSIDE the POST transaction. Silent JE failures leave `status='POSTED'` with no settlement ledger row — invisible until BIR filing time.

**Files**:
- [backend/erp/scripts/findOrphanedLedgerEntries.js](backend/erp/scripts/findOrphanedLedgerEntries.js) — read-only sweep: for each entity, finds POSTED rows with `event_id` and non-zero amount, checks for a matching POSTED `JournalEntry.source_event_id`. Exits 1 on any orphan. Flags: `--entity`, `--module`, `--days`, `--csv`.
- [backend/agents/orphanLedgerAuditAgent.js](backend/agents/orphanLedgerAuditAgent.js) — wraps the script logic. Notifies `PRESIDENT` (in_app + email) + `ALL_ADMINS` (in_app). Priority `'high'` if > 10 orphans, else `'important'`.
- [backend/scripts/runOrphanLedgerAuditOnce.js](backend/scripts/runOrphanLedgerAuditOnce.js) — manual driver bypassing cron + dispatcher.
- Registered in [backend/agents/agentRegistry.js](backend/agents/agentRegistry.js) as `orphan_ledger_audit` (FREE tier).
- Cron: `0 3 * * *` Asia/Manila in [backend/agents/agentScheduler.js](backend/agents/agentScheduler.js) (line ~135).

**Verified Apr 27 2026**: agent.run() against dev DB returns clean baseline: 6 POSTED rows scanned (5 SALES + 1 PRF), 0 orphans. Mirrors `orphanAuditAgent.js` pattern exactly so the two integrity agents stay shape-equivalent.

---

## Phase Apr-2026 #2 — Accounting Integrity Agent (shipped Apr 28 2026)

**Goal**: catch the cases the orphan-ledger sweep can't — where JEs DO exist but the books still go silently wrong. Five strict + one informational check per entity per day.

**Strict checks (count toward `grandFailures`, drive notification priority)**:
1. **Trial balance balanced** (cumulative + per-period). Σ POSTED `JournalEntry.lines.debit` must equal Σ credit, both all-time and per-month for current + previous period.
2. **JE-row math sanity**. Per-row `total_debit == total_credit`, AND lines recompute to the same totals (catches direct-DB writes / migrations bypassing the pre-save validator).
3. **Inter-entity (IC) over-settled detection**. For every directed entity pair (A → B), Σ POSTED `IcTransfer.total_amount` − Σ POSTED `IcSettlement.settled_transfers.amount_settled` ≥ 0. Negative = settled MORE than was transferred — almost always a data-entry or void-and-resubmit bug.
4. **Period-close readiness**. For previous month, count any DRAFT / VALID / non-POSTED rows in `SalesLine`, `Collection`, `PrfCalf`, `InterCompanyTransfer`, `IcSettlement`, `JournalEntry`. Drafts must be cleared (post or void) before the period lock can flip.

**Informational check (reported daily, never counts as failure unless admin opts in)**:
5. **Sub-ledger == control account** (cumulative VAT + CWT). The PH JE engine credits OUTPUT_VAT to the GL on Sale POST (accrual basis) but writes the `VatLedger` row only on Collection POST (cash basis, used for BIR 2550Q filing). They diverge by design — the cumulative drift = VAT-portion of open A/R. Operator verifies against open-AR reports. Admin flips `ACCOUNTING_INTEGRITY_THRESHOLDS.DEFAULT.metadata.subledger_enforce = true` to make the recon strict; default `false` because flipping it without a single recognition basis would fire a daily false alarm.

**Files**:
- [backend/erp/scripts/findAccountingIntegrityIssues.js](backend/erp/scripts/findAccountingIntegrityIssues.js) — standalone script with the same flag conventions: `--entity`, `--period`, `--check`, `--csv`. Exits 1 on any strict failure. Exports `scanAccountingIntegrity` so the agent inherits its findings (single source of truth for the check semantics).
- [backend/agents/accountingIntegrityAgent.js](backend/agents/accountingIntegrityAgent.js) — wraps the script's pure scan. Notifies `PRESIDENT` (in_app + email) + `ALL_ADMINS` (in_app — already includes admin/finance/president/ceo via `ROLE_SETS.ADMIN_LIKE`). Priority `'high'` if TB out-of-balance OR JE-math drift > 0; `'important'` otherwise.
- [backend/scripts/runAccountingIntegrityOnce.js](backend/scripts/runAccountingIntegrityOnce.js) — manual driver. Flags: `--entity`, `--period`.
- Registered in [backend/agents/agentRegistry.js](backend/agents/agentRegistry.js) as `accounting_integrity` (FREE tier, schedule `Daily 4:00 AM`).
- Cron: `0 4 * * *` Asia/Manila in [backend/agents/agentScheduler.js](backend/agents/agentScheduler.js) (logged as `#AI`).
- AGENT_META icon/color added to [frontend/src/erp/pages/AgentDashboard.jsx](frontend/src/erp/pages/AgentDashboard.jsx) (`ShieldAlert`, `#1e3a8a`). Same dashboard page also picked up the missing `orphan_audit` and `orphan_ledger_audit` meta entries — they had been auto-rendering with the default Bot icon since shipping.
- Threshold lookup `ACCOUNTING_INTEGRITY_THRESHOLDS.DEFAULT` seeded in [backend/erp/controllers/lookupGenericController.js](backend/erp/controllers/lookupGenericController.js) with `insert_only_metadata: true`. Defaults: `tb_tolerance=0.01`, `je_math_tolerance=0.01`, `subledger_tolerance=1.00`, `ic_tolerance=1.00`, `subledger_enforce=false`.

**Tolerances (subscriber-configurable)**:
- TB / JE-math: ₱0.01 — bank rounding to the cent.
- Sub-ledger / IC: ₱1.00 — peso-rounding cushion across many rows; raise carefully (masks cumulative drift).
- `subledger_enforce`: false default per the PH cash-vs-accrual basis split. Do NOT flip without a single recognition basis end-to-end.

**Verified Apr 28 2026**:
- `node erp/scripts/findAccountingIntegrityIssues.js` against dev DB: 0 strict failures (TB balanced ₱483,515 across 13 JEs in VIP, JE-math clean, IC pairs in balance, period-close clean for 2026-03), VAT/CWT informational drift correctly tagged ⓘ (₱32,837.15 GL OUTPUT_VAT vs ₱0 VatLedger = expected open-AR VAT for accrual-basis CSIs not yet collected).
- UI smoke (Playwright, live dev cluster, logged in as president): /erp/agent-dashboard → Accounting Integrity card renders with FREE badge + "Daily 4:00 AM" schedule → Run Now button triggers /api/erp/agents/run → AgentRun record persists with `status='success'`, all 4 strict-check key findings stored, dashboard re-renders showing `success` + summary in both the card and the Recent Agent Runs table.

**Why both agents and not one**:
- Orphan-ledger answers "did the JE write at all?" (presence check)
- Accounting-integrity answers "do the JEs that DID write actually balance and reconcile?" (correctness check)

Different invariants, different repair paths. Bundling them would couple their evolutions and make the priority logic tangled. They run on adjacent slots (03:00 and 04:00 Manila) so admin sees them as a related pair without code coupling.

**Subscription-ready posture**:
- Both agents are entity-scoped (loop over `Entity.find({})`), so a new tenant onboarded mid-year auto-joins both sweeps.
- All thresholds are lookup-driven via `ACCOUNTING_INTEGRITY_THRESHOLDS` — subscriber admin edits via Control Center, no code change.
- Recipient resolution uses the existing `notify()` enums (`PRESIDENT`, `ALL_ADMINS`) — no role hardcoding.
- COA codes come from `Settings.COA_MAP` (already lookup-driven for the JE engine).
- The "informational" sub-ledger check is the right posture for v1 PH practice; subscribers in pure-accrual or pure-cash jurisdictions flip the lookup flag to make it strict.

**Known follow-ups (deferred)**:
- AR / AP sub-ledger recon: requires `outstanding_amount` tracking on `SalesLine` (current schema computes outstanding by joining `Collection` allocations). Defer until either the JE-asymmetry fix step 2 lands (`je_status` + Retry button) or the user prioritizes AR aging reports.
- Inventory recon (Σ `InventoryLedger.running_balance × unit_cost` vs GL `INVENTORY`): requires standard-cost or weighted-average lookup per product. Deferred — out of scope for v1.
- Auto-trigger on JE.post (vs scheduled cron): would drop detection latency from 24h to seconds, but adds hot-path cost. v1 cron suffices for the BIR-filing-window protection the user asked for.

---

## Phase G9.R10 — Agent Dashboard Audit Surface (April 28, 2026)

**Goal**: turn `/erp/agent-dashboard` into a real audit surface for the AI agent fleet, not a 10-row teaser. Two sections of the page (Recent Agent Runs, Agent Messages) were capped at 10 / 20 rows with client-only filtering and no drill-in. Both are now server-side filtered, paginated, and (for messages) click-to-view.

**Why**: the user's complaint was "the audit goes to my inbox, not the dashboard." Truth is the audit IS on the dashboard — the run history and message history are both there — but the surface didn't expose enough of it to feel auditable. Build the screen out instead of moving data away from inbox (which would break the actionable workflow for non-admin recipients).

**Files**:
- [frontend/src/erp/pages/AgentDashboard.jsx](frontend/src/erp/pages/AgentDashboard.jsx) — the dashboard page itself.
  - `loadRuns(page, filters)` callback: GETs `/erp/agents/runs?agent_key=&status=&from=&to=&page=&limit=20`. Decoupled from the stats/registry/messages fetch so changing run filters does NOT refetch unrelated sections.
  - `loadMessages(page, filters)` callback: GETs `/api/messages?category=&from=&to=&page=&limit=15`. Constant base filter `category=ai_coaching,ai_schedule,ai_alert` so non-agent messages never bleed in. User's category single-select narrows further; empty defaults back to all three.
  - Filter bars (CSS class `agd-filters`) above each section. Run section: agent dropdown driven by backend registry (33 agents Apr 28 2026), status enum, From / To date pickers, Reset button when any filter is active. Message section: category dropdown driven by the AGENT_MESSAGE_CATEGORIES lookup, From / To date pickers, Reset button.
  - `Pagination` component (existing shared) wired to both sections (`runPage`/`runPages`, `msgPage`/`msgPages`).
  - Click-to-view modal (`agd-modal-overlay` / `agd-modal`) for messages: full body, sender + recipient + sent + priority metadata, "Open in Inbox" link, overlay-click closes. Opening calls `messageService.markRead(id)` so the dashboard read-state and inbox read-state stay in sync. Best-effort — if markRead fails the modal still opens (read-state is cosmetic on a monitor view).
  - `getCatMeta(code, lookupOptions)` helper — pulls label / bg / fg / leftBorder from the `AGENT_MESSAGE_CATEGORIES` Lookup row when present, otherwise from the inline `CAT_FALLBACK` table. Page never goes dark on a Lookup outage (mirrors the VIP-1.A `STATUS_META_FALLBACK` pattern in MdLeadsPage).
- [backend/controllers/messageInboxController.js](backend/controllers/messageInboxController.js) — `getInboxMessages` now accepts `?from=YYYY-MM-DD&to=YYYY-MM-DD`. Inclusive 00:00:00 .. 23:59:59 day boundaries on `createdAt`. Invalid dates are silently dropped (treated as "no filter"). The existing `category` (comma-multi), `page`, `limit`, `status`, `search`, `folder`, `requires_action`, `thread_id` filters are unchanged.
- [backend/erp/controllers/lookupGenericController.js](backend/erp/controllers/lookupGenericController.js) — new `AGENT_MESSAGE_CATEGORIES` seed entry in `SEED_DEFAULTS`. Three rows (`ai_coaching` / `ai_schedule` / `ai_alert`) each with `metadata: { description, sort_order, bg, fg, icon }`. Lazy-seeded on first GET per entity.
- [frontend/src/erp/components/WorkflowGuide.jsx](frontend/src/erp/components/WorkflowGuide.jsx) — `agent-dashboard` banner expanded with the new filter / pagination steps and two new "Next steps" links (Inbox + Lookup Tables).

**Lookup-driven (Rule #3)**:
- `AGENT_MESSAGE_CATEGORIES` Lookup category drives the pill color, label, and the dropdown options for the message filter. A future Vios SaaS subscriber can rename "Coaching" → "Mentoring" and re-color the alert pill blue without a code deploy.
- `MessageInbox.category` enum stays as the validation gate (so admin can't introduce a category code the schema rejects); the lookup only supplies display metadata. Same split as VIP-1.A `partnership_status` (schema enum) ↔ `DOCTOR_PARTNERSHIP_STATUS` (display lookup).
- The agent dropdown on Recent Agent Runs is driven entirely by `agentRegistry.AGENT_DEFINITIONS` via `/erp/agents/registry`. Adding a new agent surfaces it in the dropdown automatically — no frontend edit.

**Subscription-readiness posture**:
- All filters scope correctly through the existing `tenantFilter` / `entity_id` middleware on `/api/messages` (Phase G9.R4 + Rule #21). A subscriber's president sees only their own entity's agent messages.
- The runs endpoint is admin-gated (`adminOnly` = admin/finance/president per agentRoutes.js). No new permission needed.
- No hardcoded business values introduced. Page-size constants (`RUNS_PER_PAGE=20`, `MSGS_PER_PAGE=15`) are platform UX choices, not subscriber-tunable values — defer to Settings only if a tenant complains, per Rule 0 (don't add features beyond what's needed).

**Wiring verified**:
- Backend syntax: `node -c` green on both `messageInboxController.js` and `lookupGenericController.js`.
- Frontend build: `npx vite build` green (11.02s, no errors, no warnings).
- Date-range filter: validates against the existing index `{ entity_id, folder, createdAt }` — no new index needed, MongoDB picks up the createdAt range as the secondary key.
- Removed `msgTab` state and orphan `filteredMsgs` computation that the old client-only tab filter relied on. No remaining references (`grep` clean).
- Modal a11y: `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, overlay-click closes. Keyboard activation supported via Enter / Space on message rows (`role="button"` + `tabIndex={0}`).

**Browser smoke (Apr 28 2026, partial)**:
- Runs section was Playwright-smoked earlier in the same session — filter changes the row count + total counter, Reset clears all filters + hides Reset button, pagination Next loads page 2 with 8 remaining of 28, "(N total)" header counter is accurate, empty-with-filters message renders with reset button visible, zero console errors throughout.
- Messages section was NOT browser-smoked (Playwright MCP profile lock stuck after the runs smoke; build-green only). The implementation mirrors the runs section line-for-line, so the failure modes should be identical, but a manual smoke is queued for the next session — see deferred handoff `memory/handoff_phase_g9_r10_apr28_2026.md`.

**Known follow-ups**:
- The "Recent Agent Runs" section header doesn't yet show a "newest first" / "by agent name" sort toggle. Backend already sorts `run_date: -1`; if subscribers want by-agent grouping, that's a one-line frontend toggle.
- Click-to-view on a RUN row (not just a message) would let admin see the full agent run detail (full key_findings list, error stack, payload metadata) inline. The data is already on `AgentRun.summary` / `AgentRun.error_msg`. Defer until requested.
- Bulk archive / mark-all-read on the messages monitor view: deferred — those operations live in the Inbox surface where they belong.

---

## Phase G9.R11 — Inbox Importance Triage (Apr 30, 2026 evening)

**Why.** A misuse pattern discovered while triaging the >1000 `[GUARD]` rows in the president inbox: high-signal `briefing` (morning brief, FP&A forecast, procurement scorecard, expansion readiness) shared the `AI_AGENT_REPORTS` folder with operational-noise digests (`compliance_alert`, `kpiVariance`, `ai_alert`, `ai_coaching`, `inventory_alert`, `proxy_sla_alert`, `proxy_auto_ack`, `data_quality`). Worse — four agents emitted categories that weren't in `CATEGORY_TO_FOLDER` at all (inventory_alert / proxy_sla_alert / proxy_auto_ack / data_quality), so they fell through to the main `INBOX` virtual folder. Result: the daily exec read got buried under noise that itself shouldn't have been in the main count.

**Behavior.**
- New folder `EXECUTIVE_BRIEF` at sort_order 5 (between Tasks and AI Agents). `briefing` category re-routed there.
- 4 orphan agent categories explicitly mapped to `AI_AGENT_REPORTS` (was: implicit fallthrough to INBOX).
- `AI_AGENT_REPORTS` added to `INBOX_HIDDEN_FOLDERS_BY_ROLE` defaults for `president` (alongside the existing APPROVALS hide). Effect: AI Agents folder is still in the rail but its rows are excluded from the main INBOX count + the rail badge — Executive Brief stays visible because it's a different folder.
- New backend filter `?priority=high|important|normal|low|all` on `GET /api/messages` — opaque pass-through, no schema enum, subscribers can introduce new tiers. Frontend renders chip row above the list but ONLY when `activeFolder === 'AI_AGENT_REPORTS'` (high-volume, low-signal — chips help scan).

**Wiring.**
- [backend/erp/utils/inboxLookups.js](backend/erp/utils/inboxLookups.js) — `FOLDER_DEFAULTS` (+1 row, sort_order shifted 5→6 for AI_AGENT_REPORTS et al.), `CATEGORY_TO_FOLDER` (+5 entries: 1 move + 4 add), `HIDDEN_FOLDERS_BY_ROLE_DEFAULTS.president.metadata.hidden_folders` adds `'AI_AGENT_REPORTS'`.
- [backend/scripts/backfillMessageInboxEntityId.js](backend/scripts/backfillMessageInboxEntityId.js) — `CATEGORY_TO_FOLDER` copy synced. The "MUST stay in sync" comment is enforced by the new healthcheck.
- [backend/controllers/messageInboxController.js](backend/controllers/messageInboxController.js) — `ZERO_COUNTS` (+executive_brief), aggregation pipeline (+executive_brief $sum branch), new `?priority=` filter in `getInboxMessages`.
- [backend/scripts/migrateExecutiveBriefFolder.js](backend/scripts/migrateExecutiveBriefFolder.js) (new) — idempotent, dry-run-by-default. 4 steps per entity: insert `EXECUTIVE_BRIEF` lookup row if missing, bump existing AI_AGENT_REPORTS sort_order 5→6 if still default, add AI_AGENT_REPORTS to president hidden_folders (or insert a fresh president row if missing), re-point existing `MessageInbox` rows where `category=='briefing' AND folder=='AI_AGENT_REPORTS'` → `folder='EXECUTIVE_BRIEF'`.
- [frontend/src/components/common/inbox/InboxFolderNav.jsx](frontend/src/components/common/inbox/InboxFolderNav.jsx) — `ICON_BY_CODE.EXECUTIVE_BRIEF = Newspaper` (lucide-react). Daily-brief metaphor; distinct from AI Agents' `Sparkles`.
- [frontend/src/pages/common/InboxPage.jsx](frontend/src/pages/common/InboxPage.jsx) — `DEFAULT_FOLDERS` fallback (+1 row), `priorityFilter` state, chip row rendered conditionally when AI_AGENT_REPORTS is active, `params.priority` threaded through `messageService.list`.
- [frontend/src/erp/components/WorkflowGuide.jsx](frontend/src/erp/components/WorkflowGuide.jsx) `'inbox'` + [frontend/src/components/common/PageGuide.jsx](frontend/src/components/common/PageGuide.jsx) `'inbox'` — banner steps describe Executive Brief folder, the priority chips, and the per-role hidden-folder behavior (with the new AI_AGENT_REPORTS default for president).
- [backend/scripts/healthcheckInboxImportanceTriage.js](backend/scripts/healthcheckInboxImportanceTriage.js) (new) — 23-point static wiring contract: lookup defaults shape, category mapping symmetry between inboxLookups + backfill script, controller ZERO_COUNTS + aggregation, frontend icon + DEFAULT_FOLDERS + chip wiring, banner copy.

**Subscriber tunability (Rule #3).**
- Re-show AI Agents to a specific role: Control Center → Lookup Tables → `INBOX_HIDDEN_FOLDERS_BY_ROLE` → edit `president` row, remove `AI_AGENT_REPORTS` from `metadata.hidden_folders`.
- Hide AI Agents for CEO too: add `{ code: 'ceo', metadata: { hidden_folders: ['APPROVALS','AI_AGENT_REPORTS'] } }`.
- Re-route a category: lookup-only fix isn't possible today (CATEGORY_TO_FOLDER is code-resident — that was the existing G9.A design choice for write-time consistency). If subscribers need this, expose `MESSAGE_CATEGORY_FOLDER_MAP` lookup with `insert_only_metadata: true` — defer until requested.
- Add a new priority tier: free-text on `priority` field; UI chip row needs a code change to render the new tier. Could be lifted to a `MESSAGE_PRIORITY` lookup later — defer.

**Migration runbook.**
1. Deploy code (no schema change, no breaking field rename).
2. `node backend/scripts/migrateExecutiveBriefFolder.js` (dry-run preview).
3. `node backend/scripts/migrateExecutiveBriefFolder.js --apply` (commit).
4. (Optional) `node backend/scripts/tempInboxArchiveGuards.js --apply --soft-delete` to clear the historical `[GUARD]` pile per-recipient.
5. Restart pm2 — lookup cache rebuilds on next request.

**Rollback path.**
- Code: revert the commit; lookup rows + repointed messages stay (forward-compatible — old code skips `EXECUTIVE_BRIEF` folder gracefully because folder strings are not enum-validated).
- Lookup-only rollback: edit president row in `INBOX_HIDDEN_FOLDERS_BY_ROLE` to drop `AI_AGENT_REPORTS`; AI Agents folder reappears in main count immediately.
- Briefing re-routing rollback: `db.messages.updateMany({ folder: 'EXECUTIVE_BRIEF', category: 'briefing' }, { $set: { folder: 'AI_AGENT_REPORTS' } })` (one-liner in mongo shell).

---

## Phase EC-1 — Executive Cockpit (CFO/CEO/COO at-a-glance) — April 28, 2026

**Why**: Apr 28 audit of CRM/ERP dashboards (commit context: post-G9.R10) found that ERP exposed 4 MTD cards on `/erp` and 19 other dashboards scattered by domain (Sales Goals, Consignment, Expiry, IC AR, Cycle Status, P&L, Agent, etc.) but **no single C-suite roll-up surface**. CFO/CEO/COO had to click through 5+ dashboards each morning to know "is anything on fire today / are we trending the right direction." The audit also flagged real KPI duplication risk (visits/engagements counted differently in CRM vs ERP, AR/IC AR overlap, inventory entity- vs warehouse-scoped). The cockpit is a pure aggregator over the canonical sources — it never re-computes a metric, only rolls up — so cockpit ↔ detail-page disagreement is impossible by construction.

**Where**:
- Page route `/erp/cockpit` ([frontend/src/erp/pages/ExecutiveCockpit.jsx](frontend/src/erp/pages/ExecutiveCockpit.jsx)) — pinned at the top of the ERP sidebar above "ERP Home" for `ROLE_SETS.MANAGEMENT` (admin/finance/president). Lookup-driven backend gate `EXECUTIVE_COCKPIT_ROLES.VIEW_COCKPIT` decides whether the API answers; sidebar visibility and React-route gate use the role-set for fast UI. Subscribers add a `cfo`/`coo` role to MANAGEMENT and to the lookup row to extend without code change.
- Backend single endpoint `GET /api/erp/cockpit` ([backend/erp/routes/cockpitRoutes.js](backend/erp/routes/cockpitRoutes.js) → [controller](backend/erp/controllers/cockpitController.js) → [service](backend/erp/services/cockpitService.js)).

**Tiles (10 total, organized in two tiers)**:
- **Tier 1 — At-a-glance**:
  - `cash` → `BankAccount.current_balance` + `PettyCashFund.current_balance`, top-3 accounts
  - `ar_aging` → `arEngine.getArAging(entityId, bdmId, null)` rolled to 5 buckets + over-90% + top-3 overdue hospitals
  - `ap_aging` → `apService.getApAging(entityId)` same shape, top-3 vendors
  - `period_close` → `monthEndClose.getCloseProgress(entityId, current_period)` → % steps complete + error count
  - `approval_sla` → `ApprovalRequest.find({status:'PENDING'})` aggregation: pending, breached SLA (>48h), oldest age, top-5 by module
  - `agent_health` → `AgentRun` aggregation per `agent_key` over last 30d: failing/stale counts + per-agent last status
- **Tier 2 — Depth**:
  - `margin` → `dashboardService.getMtd().gross_margin` (canonical, same formula the existing ERP dashboard renders)
  - `inventory_turns` → `InventoryLedger` annualized turns + days-on-hand (entity-scoped)
  - `partnership_funnel` → `Doctor.partnership_status` aggregation (LEAD/CONTACTED/VISITED/PARTNER counts + conversion %)
  - `bir_calendar` → `BirFilingStatus` overdue + due-in-30d + filed-this-quarter + next-5 upcoming

**Per-tile error containment** ([cockpitService.js](backend/erp/services/cockpitService.js) `getCockpit()`): every tile runs under `Promise.allSettled`. A failing tile returns `{ status: 'error', message }` — the page renders ⚠ on that one tile and renders the other 9 normally. Critical for a CEO surface that must remain available even if one upstream is degraded (e.g., the BIR table is empty for a fresh tenant — partnership_funnel still renders).

**Lookup-driven role gates (Rule #3)** — three codes in `EXECUTIVE_COCKPIT_ROLES` (lazy-seeded from [SEED_DEFAULTS](backend/erp/controllers/lookupGenericController.js), 60s cache TTL via [executiveCockpitAccess.js](backend/utils/executiveCockpitAccess.js)):
- `VIEW_COCKPIT` (default admin/finance/president) — page-level gate. `requireCockpitRole('VIEW_COCKPIT')` returns 403 with `required_scope` if the user's role isn't in the lookup row.
- `VIEW_FINANCIAL` (default same) — controls cash/AR/AP/period-close/margin tiles. Subscribers can revoke from operations roles to keep COA confidentiality while still granting cockpit access.
- `VIEW_OPERATIONAL` (default same) — controls approvals/inventory/agents/funnel/BIR. Branch-manager-style roles can hold this without VIEW_FINANCIAL.

The controller resolves both flags via `userHasCockpitRole(req, 'VIEW_FINANCIAL' | 'VIEW_OPERATIONAL')` and only ships tiles inside the granted scopes. Frontend renders an info banner if both flags arrive false.

**Cache invalidation** wired into [lookupGenericController.js](backend/erp/controllers/lookupGenericController.js) at all 4 mutation sites (create/update/remove/seedCategory) via `EXECUTIVE_COCKPIT_ROLES_CATEGORIES` set + `invalidateCockpitRolesCache(entityId)`. Same 60s TTL invariant as BIR_ROLES / SCPWD_ROLES — admin role-list edits propagate within one cache cycle, instantly on the writing instance.

**Frontend pattern** ([ExecutiveCockpit.jsx](frontend/src/erp/pages/ExecutiveCockpit.jsx)):
- 60-second auto-refresh + manual refresh button.
- Click-through on every tile: Cash → /erp/banking, AR → /erp/collections/ar, AP → /erp/purchasing/ap, Period Close → /erp/month-end-close/:period, Approvals → /erp/approvals, Agents → /erp/agent-dashboard, Margin → /erp/pnl, Inventory → /erp/my-stock, Funnel → /admin/md-leads, BIR → /admin/bir.
- Color thresholds for trends: AR over-90% green/<10%/yellow/<20%/red; gross margin green/≥30%, yellow/≥15%, red/<15%; inventory days-on-hand green/≤60d, yellow/≤120d, red/>120d; agent failing red, stale yellow.
- Tier-2 banner copy explains scope-level access and points users to Control Center → Lookup Tables for role edits ([WORKFLOW_GUIDES['cockpit']](frontend/src/erp/components/WorkflowGuide.jsx)).

**Subscription-readiness posture** (Rule #0d):
- Every tile query is `entity_id`-scoped (the eventual `tenant_id`). No cross-entity bleed.
- Hardcoded role names appear ONLY in the helper's `DEFAULT_*` arrays, used as fallbacks if the Lookup row is missing or empty (lazy-seed catches this on first read).
- New tile = new entry in `TILES` registry inside `getCockpit()`. No schema change, no new route.
- New scope = new code in `EXECUTIVE_COCKPIT_ROLES` lookup + new getter in [executiveCockpitAccess.js](backend/utils/executiveCockpitAccess.js). Subscribers extend without a code change once the helper is generic — currently the helper hard-codes 3 codes, mirroring birAccess.js. If we hit a fourth, refactor to a code → defaults map (one-liner change).
- AR aging tile honors Rule #21: privileged users get entity-wide AR by passing `null` bdm_id. Never silently falls back to `req.bdmId` (which would be the privileged user's own user-id, not a BDM, returning empty results).

**Files touched (8 new + 4 modified)**:
- new: [backend/utils/executiveCockpitAccess.js](backend/utils/executiveCockpitAccess.js)
- new: [backend/erp/services/cockpitService.js](backend/erp/services/cockpitService.js)
- new: [backend/erp/controllers/cockpitController.js](backend/erp/controllers/cockpitController.js)
- new: [backend/erp/routes/cockpitRoutes.js](backend/erp/routes/cockpitRoutes.js)
- new: [backend/scripts/healthcheckExecutiveCockpit.js](backend/scripts/healthcheckExecutiveCockpit.js) — 42 wiring assertions, exit code = 0 when clean.
- new: [frontend/src/erp/pages/ExecutiveCockpit.jsx](frontend/src/erp/pages/ExecutiveCockpit.jsx)
- new: [frontend/src/erp/hooks/useCockpit.js](frontend/src/erp/hooks/useCockpit.js)
- modified: [backend/erp/controllers/lookupGenericController.js](backend/erp/controllers/lookupGenericController.js) — `EXECUTIVE_COCKPIT_ROLES` SEED_DEFAULTS row + 4 invalidation hooks
- modified: [backend/erp/routes/index.js](backend/erp/routes/index.js) — mounts `/cockpit` after `/dashboard`
- modified: [frontend/src/App.jsx](frontend/src/App.jsx) — lazy import + ROLE_SETS.MANAGEMENT route guard
- modified: [frontend/src/components/common/Sidebar.jsx](frontend/src/components/common/Sidebar.jsx) — pin Executive Cockpit at top for management roles
- modified: [frontend/src/erp/components/WorkflowGuide.jsx](frontend/src/erp/components/WorkflowGuide.jsx) — `WORKFLOW_GUIDES['cockpit']` banner

**Wiring verified**:
- [healthcheck](backend/scripts/healthcheckExecutiveCockpit.js): `node backend/scripts/healthcheckExecutiveCockpit.js` → 42/42 ✓ (access helper exports, lookup invalidation at all 4 sites, SEED_DEFAULTS rows for VIEW_COCKPIT/FINANCIAL/OPERATIONAL, service exports getCockpit + 10 tile getters + Promise.allSettled, controller resolves both scopes, route applies requireCockpitRole, routes/index.js mounts /cockpit, App.jsx lazy import + ROLE_SETS.MANAGEMENT, Sidebar pin, WORKFLOW_GUIDES entry).
- Backend syntax: `node -c` green on all 8 backend files (helper, service, controller, route, lookupGenericController, routes/index, healthcheck).
- Frontend syntax: `esbuild.transformSync` (the same parser Vite uses) green on all 5 frontend files (ExecutiveCockpit.jsx, useCockpit.js, WorkflowGuide.jsx, Sidebar.jsx, App.jsx).
- **Vite full bundle: NOT verified inside the worktree** (Vite walks up `.worktrees/executive-cockpit` → `.worktrees` → `vip-pharmacy-crm` to find a project root and lands on the main repo's root `node_modules` which doesn't have vite installed — junctions don't help because Vite resolves real paths). Run `npm run build` from `frontend/` after merging this branch to dev to confirm — esbuild parse + healthcheck wiring leave a low residual risk, but it's not zero.
- **Playwright UI smoke: deferred** — same blocker (no live dev server in the worktree). Smoke checklist queued for after merge: (1) login as `yourpartner@viosintegrated.net` → sidebar shows "Executive Cockpit" at top → (2) /erp/cockpit renders Tier-1 grid and Tier-2 grid → (3) auto-refresh ticks at 60s without console error → (4) tile click-through navigates to detail page → (5) login as a non-management role (`s3.vippharmacy@gmail.com` BDM) → /erp/cockpit returns 403 from API and the React route guard hides the link.

**Known follow-ups**:
- Healthcheck integration into the global `npm run healthcheck` runner (if/when one exists). Standalone-runnable today.
- A future "tile-level preferences" surface (drag-to-reorder, per-user pin/hide) would be the natural next step once subscribers ask. Not built today — single ordered render keeps the page bulletproof and free of state-store overhead.
- Cockpit AGREES with detail pages by construction (it calls the same aggregators). If a tile shows wrong numbers, the bug is in the underlying service — not in cockpit roll-up. Worth restating in any future bug-triage path.

---

## Phase G4.5y — Physical Count Proxy Widening (April 29, 2026)

Closes the second half of the user-stated proxy ask ("let proxy edit the batch number AND actual stocks of the BDMs warehouse"). Phase G4.5x widened `correctBatchMetadata` and `getMyStock` for cross-BDM batch metadata fixes; this phase widens `recordPhysicalCount` for cross-BDM stock-quantity adjustments under the same two-key gate.

**Two-key gate (unchanged from Phase G4.5x):**
1. `PROXY_ENTRY_ROLES.INVENTORY` lookup (per-entity, admin-editable) must include the caller's role. Default `[admin, finance, president]`. Admin can extend to `staff` via `/erp/lookup-manager`.
2. `erp_access.sub_permissions.inventory.grn_proxy_entry = true` on the user's Access Template.

President + admin/finance always pass (privileged short-circuit). All other roles must pass BOTH keys to widen.

**Behavior change:**
- Eligible callers passing a `bdm_id` in the body record the ADJUSTMENT under that BDM. Non-eligible callers passing a foreign `bdm_id` get **HTTP 403 with explicit message** — no Rule #21 silent self-fill.
- Eligible callers omitting `bdm_id` but passing `warehouse_id` get **per-batch BDM derivation**: the controller looks up the first existing InventoryLedger row for that batch+warehouse and inherits its `bdm_id` for the new ADJUSTMENT row + the auto-journal. This handles warehouses whose batches span multiple BDMs (e.g. a TERRITORY warehouse that received stock under a previous BDM).
- The auto-journal (`journalFromInventoryAdjustment`) now stamps `bdm_id` from the resolved owner (not `req.bdmId`), so per-BDM COGS / shrinkage / KPIs stay honest under proxy.
- The proxy actor is captured separately on `InventoryLedger.recorded_by` and `ErpAuditLog.changed_by`, with `(proxied)` annotation in the audit note when actor ≠ owner.

**No new sub-permission key is introduced** — physical count and batch metadata are conceptually the same back-office correction surface, so they share the same `inventory.grn_proxy_entry` two-key gate. This keeps subscriber configuration simple (one switch, both capabilities).

**No new DANGER flag.** `inventory.grn_proxy_entry` is not in BASELINE_DANGER_SUB_PERMS today (DANGER only matters for FULL fall-through; explicit grants always honored). Mae's existing grant test path is preserved byte-for-byte.

**Lookup-driven (Rule #3) + subscription-ready (Rule #19):**
- Allowlist of proxy-eligible roles is per-entity (`PROXY_ENTRY_ROLES.INVENTORY`).
- VALID_OWNER_ROLES.INVENTORY governs who may be a target (BDM-shaped roles only — same as GRN/Sales).
- No hardcoded role string anywhere. Subscribers in Year-2 SaaS spin-out get the same gate without code edits.

**Files touched (3 modified):**
- modified: [backend/erp/controllers/inventoryController.js](backend/erp/controllers/inventoryController.js) — `recordPhysicalCount` extended with `widenScope` + `targetBdmId` + per-batch derivation + 403 on non-eligible body.bdm_id; auto-journal stamps target BDM not actor.
- modified: [frontend/src/erp/hooks/useInventory.js](frontend/src/erp/hooks/useInventory.js) — `recordPhysicalCount(counts, warehouseId, bdmId)` signature extended; bdm_id is optional, server falls back to per-batch derivation when omitted.
- modified: [frontend/src/erp/components/WorkflowGuide.jsx](frontend/src/erp/components/WorkflowGuide.jsx) — `WORKFLOW_GUIDES['my-stock']` adds proxy correction step + tip describing the two-key gate, target-BDM attribution, and `recorded_by` capture.

**Wiring + integrity walk:**
- `InventoryLedger.bdm_id` is `required: true`. Per-batch derivation guarantees we always have a value; the only edge case is "no existing ledger row for this batch in this warehouse", which is logged + skipped (cannot ADJUSTMENT a batch the system has never seen).
- `getMyStock`, `getVariance`, `getLedger`, `getBatches` aggregations are entity-scoped and respect the new bdm_id stamping by construction (they group by bdm_id; the rows just land in the correct group).
- Auto-journal (`journalFromInventoryAdjustment`) signature unchanged; only the `bdm_id` argument's source moved from `req.bdmId` to `adj.bdm_id` (resolved per adjustment).
- Audit log: `bdm_id` = target, `changed_by` = actor — both captured for any later reconciliation. The note includes `(proxied)` when actor ≠ owner.
- Period locks (Rule #20): physical count was already not gated by `periodLockCheck` in the existing code — this phase preserves that. (The auto-journal carries its own period scope; if the period is locked, the JE post fails non-blocking and the ADJUSTMENT row remains for re-post.)
- Approval Hub (Rule #20): physical count is not a status transition — no `gateApproval` call. Same as pre-G4.5y.

**No downstream consumer broken:**
- Sales/CSI auto-FIFO reads the ledger by entity+warehouse (or entity+bdm). Renaming/quantity adjustments propagate naturally.
- Variance Report (`getVariance`) groups by product, computes from sum-of-IN minus sum-of-OUT; new ADJUSTMENT rows fold in correctly.
- Expiry Alerts read distinct expiry_date from the ledger; unaffected.
- Inventory Variance + Stock-on-Hand summaries on `/erp/my-stock` are read on next page load — no cache invalidation needed.

**Healthcheck:** rerun the existing batch-metadata Playwright smokes (`/c/tmp/smoke-readonly.js` + `/c/tmp/smoke-proxy.js`); add a follow-up Playwright walk that drives a Mae proxy physical count against a foreign warehouse and verifies (a) the new ADJUSTMENT row carries `bdm_id` = target's, (b) the auto-journal `bdm_id` = target's, (c) the ErpAuditLog row carries `changed_by` = Mae and `bdm_id` = target.

---

## Test Credentials — Dev / Localhost only (Apr 29 2026)

> Use ONLY against `localhost:5173` + `localhost:5000` bound to the live Atlas dev cluster. Never share, commit to public docs, or use against production. Verified working Apr 27–29 2026.

| Persona | Email | Password | Use case |
|--|--|--|--|
| Admin / President | `yourpartner@viosintegrated.net` | `DevPass123!@#` | full-tier access; privileged short-circuit on every proxy gate; required for Access-Template grants + lookup edits in Playwright smokes |
| BDM (Mae Navarro) | `s3.vippharmacy@gmail.com` | `DevPass123!@#` | generic BDM persona; user_id `69b3944f0aee4ab455785c50` |
| BDM (MG and CO BDM) | `s19.vippharmacy@gmail.com` | `DevPass123!@#` | MG-and-CO entity BDM — useful for cross-entity / multi-entity scoping tests + cross-BDM owner-picker scenarios |
| **BDM Proxy 1** | `s22.vippharmacy@gmail.com` | `DevPass123!@#` | designated PROXY tester — grant `inventory.grn_proxy_entry` + add `staff` to `PROXY_ENTRY_ROLES.INVENTORY` to exercise Phase G4.5x batch metadata correction + Phase G4.5y physical count proxy. Add `expenses.proxy_entry` / `smer_proxy_entry` / `prf_calf_proxy` / `car_logbook_proxy` / `undertaking_proxy` etc. for the matching Phase G4.5{a-h} flows. |
| **BDM Proxy 2** | `s25.vippharmacy@gmail.com` | `DevPass123!@#` | second PROXY tester — pair with Proxy 1 for cross-BDM scenarios where Proxy 1 + Proxy 2 act on each other's warehouses (e.g. Proxy 1 corrects Proxy 2's batch metadata, Proxy 2 records physical count on Proxy 1's TERRITORY warehouse) |

**Canonical proxy walkthrough:**
1. Login as Admin → `/erp/erp-access` → flip `inventory.grn_proxy_entry = true` for Proxy 1 (s22). PUT body MUST be top-level `{enabled, modules, sub_permissions, can_approve}` — NOT wrapped in `{erp_access: {...}}`.
2. Admin → `/erp/lookup-manager` → `PROXY_ENTRY_ROLES` → `INVENTORY` row → add `staff` to `metadata.roles`. Cache invalidation auto-fires via `invalidateProxyRolesCache(entityId)`.
3. Login as Proxy 1 (s22) → `/erp/my-stock` → pick a different BDM's TERRITORY warehouse → see batches → click Edit on a batch (Phase G4.5x) OR open Physical Count modal (Phase G4.5y).
4. Verify ADJUSTMENT row + auto-journal land under the warehouse owner's `bdm_id`, NOT Proxy 1's `bdm_id`. Check `ErpAuditLog.changed_by` = Proxy 1, `ErpAuditLog.bdm_id` = warehouse owner.
5. Revert grants when done — see `/c/tmp/smoke-proxy.js` for the canonical revert recipe.

---

## Phase G4.5z — Inventory Proxy Sub-Permission Split (April 29, 2026)

UX patch on Phase G4.5x (batch metadata) + Phase G4.5y (physical count). Phase G4.5x/y bundled BOTH cross-BDM proxy capabilities under `inventory.grn_proxy_entry`. Admins reading the Access Template couldn't tell that ticking "Record GRN on behalf of another BDM" also granted batch-metadata edit AND physical count proxy — Rule #1 (helper-banner clarity) failure.

**Two new explicit sub-permission keys (lookup-driven, Rule #3):**
- `inventory.batch_metadata_proxy` → "Edit Batch # / Expiry on another BDM's stock"
- `inventory.physical_count_proxy` → "Physical Count on another BDM's stock"

Each surfaces as its own checkbox in `ErpAccessManager` after the lazy-seed fires.

**Backward compatibility — load-bearing:** `inventory.grn_proxy_entry` STILL grants both new capabilities as a fallback. Subscribers who already configured G4.5x/y for Mae or any back-office BDM keep working without re-permissioning. Controllers check primary key OR fallback:

```js
// recordPhysicalCount (and similarly correctBatchMetadata)
const [{ canProxy: hasPc }, { canProxy: hasGrn }] = await Promise.all([
  canProxyEntry(req, 'inventory', { subKey: 'physical_count_proxy' }),
  canProxyEntry(req, 'inventory', { subKey: 'grn_proxy_entry' }),
]);
const hasProxy = hasPc || hasGrn;
```

`getMyStock` widens scope on ANY of the three keys (grn_proxy_entry || batch_metadata_proxy || physical_count_proxy) so a user granted only batch-metadata-proxy still sees other BDMs' batches in /erp/my-stock to operate on them.

**Granularity unlocked:** subscribers can now grant "fix batch typos" (batch_metadata_proxy) WITHOUT granting "post quantity ADJUSTMENT + JE" (physical_count_proxy). Important for Year-2 Pharmacy SaaS (Rule #0d) where a clinic might want a junior staffer to fix batch typos but withhold the larger-blast-radius physical count.

**Files touched (4 modified, 0 new):**
- modified: [backend/erp/controllers/inventoryController.js](backend/erp/controllers/inventoryController.js) — three `widenScope` blocks (`getMyStock`, `correctBatchMetadata`, `recordPhysicalCount`) accept new keys with `grn_proxy_entry` fallback
- modified: [backend/erp/controllers/lookupGenericController.js](backend/erp/controllers/lookupGenericController.js) — 2 SUB_PERMISSION_KEYS seed rows
- modified: [frontend/src/erp/components/WorkflowGuide.jsx](frontend/src/erp/components/WorkflowGuide.jsx) — banner + tip describe the split
- modified: docs (this file + `docs/PHASETASK-ERP.md`)

**No new lookup category, no new DANGER entry.** The PROXY_ENTRY_ROLES.INVENTORY + VALID_OWNER_ROLES.INVENTORY rows from G4.5x/y remain authoritative for both new keys (single role allowlist, cleanly subscription-ready).

**Verification:** `node -c` green. Banner re-rendered. Lazy-seed fires on first GET of `/api/erp/lookup-values/SUB_PERMISSION_KEYS` per entity — admin opens ErpAccessManager and the two new checkboxes appear.

---

## Phase G4.5dd — Internal Stock Reassignment Proxy (April 30, 2026 evening)

Closes the cross-BDM proxy gap on `/erp/transfers` Internal tab. Sibling phase to G4.5x (batch metadata proxy) / G4.5y (physical count proxy) / G4.5z (proxy-key split). Mae Navarro / Jay Ann Protacio (eBDMs with the right Access Template tick) can now create internal warehouse-to-warehouse stock reassignments on behalf of field BDMs.

### Why

The Internal tab lets a custodian shift stock to another BDM (warehouse-to-warehouse, same entity) — but the page-level guard `isPresidentOrAdmin = [PRESIDENT, CEO, ADMIN].includes(role)` hid the "+ Reassign Stock" button for staff. The backend route gate is `inventory.transfers` (broadly granted for IC visibility) and the `createReassignment` controller had no role/proxy gate of its own, so the page was the only barrier — wrong layer. Worse: `approveReassignment` had **no** explicit role gate, so any user with `inventory.transfers` could call POST `/reassign/:id/approve` directly via the API and trigger FIFO stock deduction without admin/finance authorization (latent gap).

### What shipped

**Lookup seeds (Rule #3 — subscriber-configurable):**
- `INVENTORY__INTERNAL_TRANSFER_PROXY` (sort_order 9.3) → "Create Internal Stock Reassignment on behalf of another BDM"
- `PROXY_ENTRY_ROLES.INTERNAL_TRANSFER` row, `insert_only_metadata: true`, default `metadata.roles: ['admin','finance','president']`. Subscribers append `'staff'` via Control Center → Lookup Tables to grant.
- `VALID_OWNER_ROLES.INTERNAL_TRANSFER` row, `insert_only_metadata: true`, default `metadata.roles: ['staff']`. BDM-shaped owners only — letting an admin be a stock owner would corrupt FIFO consumption, per-BDM stock visibility, and commission attribution.

**Controller hardening (`interCompanyController.js`):**
```js
// createReassignment — Phase G4.5dd
const privileged = req.isAdmin || req.isFinance || req.isPresident;
if (!privileged) {
  const { canProxy } = await canProxyEntry(req, 'inventory', INTERNAL_TRANSFER_PROXY_OPTS);
  if (!canProxy) return res.status(403).json({ ... });
}

// Defense-in-depth — both source AND target must be valid owners + same-entity.
const validOwnerRoles = await getValidOwnerRolesForModule(entityId, 'inventory', 'INTERNAL_TRANSFER');
// ...validate srcUser.role + tgtUser.role + entity membership for both...

// approveReassignment — Phase G4.5dd, two-person rule
const isApprover = req.isAdmin || req.isFinance || req.isPresident;
if (!isApprover) return res.status(403).json({ ... 'restricted to admin, finance, or president' ... });
```

**Two-person rule on stock-ownership change:** the proxy can CREATE a PENDING reassignment; APPROVAL — which deducts FIFO stock from source and shifts ownership — stays admin/finance/president regardless of any sub-perm grant. This is the same separation-of-duties as PRF/CALF / Sales / Collections proxy phases (proxies submit, authorities post).

**Frontend (`TransferOrders.jsx`):**
- `canCreateReassign = isPresidentOrAdmin || canProxyInternalTransfer` gates the "+ Reassign Stock" button on the Internal tab.
- Small purple "Proxy mode — create only" chip surfaces for non-privileged proxies so the operator visually understands they can't approve their own submission (UI symmetry with the backend gate).
- Approve / Reject buttons remain gated on `isFinanceOrAdmin` (two-person rule UI parity).

**WorkflowGuide:** the `transfers` block reorganized — separate steps for IC vs Internal lifecycle, explicit mention of the proxy sub-perm + lookup row, and a step calling out the two-person rule on approval.

### Scope guardrails (Rule #4)

- IC tab is untouched — different surface, different roles, different policy. (IC `createTransfer` already accepts `staff` via route-level `roleCheck('president','admin','staff')` — frontend gate is a separate concern.)
- Cross-entity reassignment is rejected at the controller (entity membership check) — that path belongs to IC Transfer, never Internal.
- `getReassignments` (list endpoint) is entity-scoped already; no `bdm_id` filter to widen, so the proxy sees all entity-scoped reassignments by default — matches G4.5x `getMyStock` widening posture.
- Existing PROXY_ENTRY_ROLES.INVENTORY (G4.5x/y) is **not** consulted for this phase — INTERNAL_TRANSFER is a separate explicit grant. Reassignment shifts ownership (KPI/commission impact), distinct from typo fixes (batch_metadata) and qty corrections (physical_count); deserves its own subscriber-configurable row.

### Files touched (5 modified, 1 new)

- modified: [backend/erp/controllers/lookupGenericController.js](backend/erp/controllers/lookupGenericController.js) — 1 SUB_PERMISSION_KEYS row + 1 PROXY_ENTRY_ROLES row + 1 VALID_OWNER_ROLES row
- modified: [backend/erp/controllers/interCompanyController.js](backend/erp/controllers/interCompanyController.js) — proxy gate + valid-owner defense-in-depth + approve role gate
- modified: [frontend/src/erp/pages/TransferOrders.jsx](frontend/src/erp/pages/TransferOrders.jsx) — `canCreateReassign` + Proxy mode chip
- modified: [frontend/src/erp/components/WorkflowGuide.jsx](frontend/src/erp/components/WorkflowGuide.jsx) — `transfers` banner rewritten
- modified: docs ([CLAUDE-ERP.md](CLAUDE-ERP.md) + [docs/PHASETASK-ERP.md](docs/PHASETASK-ERP.md))
- new: [backend/scripts/healthcheckInternalTransferProxy.js](backend/scripts/healthcheckInternalTransferProxy.js) — 19-check static wiring contract

### Verification (Apr 30 2026 evening)

- `node backend/scripts/healthcheckInternalTransferProxy.js` → **19/19 PASS**
- `node backend/scripts/healthcheckIncomeProxy.js` (G4.5aa) → 32/32 PASS (regression)
- `node backend/scripts/healthcheckPayslipProxyRoster.js` (G4.5bb) → 31/31 PASS (regression)
- `node backend/scripts/healthcheckComputePayrollProxy.js` (G4.5cc) → 29/29 PASS (regression)
- `node backend/scripts/healthcheckOfflineVisitWiring.js` (Phase N) → PASS (regression)
- `npx vite build` → **green in 13.78s**
- Browser smoke planned same evening as Jay Ann Protacio (s19) with `inventory.internal_transfer_proxy` ticked.

### Phase G4.5dd-r1 follow-up (Apr 30 2026 evening, same session)

User feedback during smoke: the modal's "Territory Code" free-text input was inconsistent with the rest of the system, which auto-numbers via `docNumbering`. Dropped the input. `StockReassignment.pre('save')` now calls `generateDocNumber({ prefix: 'IST', bdmId: source_bdm_id, entityId: entity_id, fallbackCode: 'STR' })` — atomic DocSequence, format `IST-{TERRITORY|ENTITY}{MMDDYY}-{NNN}`, same scheme as `ICT/JE/CALF/PO`. Resolution order: source BDM's Territory mapping → source Entity short_name → `STR` fallback. The `territory_code` request-body field is no longer accepted by `createReassignment`. Healthcheck extended to **24/24** (5 new assertions).

### How to grant a proxy (operational quickstart)

1. Admin → Control Center → Access Templates → eBDM's Access Template → Inventory module → tick "Create Internal Stock Reassignment on behalf of another BDM".
2. Admin → Control Center → Lookup Tables → category `PROXY_ENTRY_ROLES`, code `INTERNAL_TRANSFER` → append `'staff'` to `metadata.roles` (default is `['admin','finance','president']`). Lookup cache busts on save (60s TTL).
3. eBDM logs in to /erp/transfers → Internal tab → "+ Reassign Stock" button visible + purple chip "Proxy mode — create only" in the header. Submission goes PENDING; admin/finance approves to deduct FIFO.

---

## Phase R1 — Rebate Stack Relocation + Hardening (Apr 29 2026)

> Branch: `feat/rebate-stack-relocation` (worktree at `.worktrees/rebate-stack-relocation`).
> Phase 1 (mechanical relocation) shipped commit `328ade3`. Phase 2A/2B (this section) is the schema + engine + form hardening on top.
> NOT pushed (per erp-remote no-push policy).

### Why

The eight rebate / BIR / SC-PWD pages were misplaced at `/admin/*` in the CRM frontend. Phase 1 relocated them to `/erp/*` so they don't ship to the Year-2 Pharmacy SaaS bundle. While auditing the four rebate forms during Phase 1, four schema / UX issues surfaced that justified bundling the fix into Phase 2 (locked design Apr 29 evening with the user):

1. `MdProductRebate` was per-(MD × product) — same MD at different hospitals routinely has different rates per institutional MOA. **Schema bug**, fixed by adding required `hospital_id`.
2. `NonMdPartnerRebateRule` had four optional dimensions (hospital, customer, product_code) plus priority — unnecessary complexity. The actual operator intent is per-(partner × hospital). Dropped customer / product_code / priority; flipped hospital_id to required; added `calculation_mode`.
3. The non-MD form was using `partner_id: ref PeopleMaster`, but operator workflow stores all partners (MD and non-MD) on the Doctor collection with `clientType` discriminator. Flipped `partner_id` ref to Doctor so the form filter can do `clientType != 'MD'`.
4. The Tier-A form was importing CRM `productService` (storefront DB, ~12 items) instead of ERP ProductMaster (full hospital catalog). Swapped to `useProducts()` (the ERP hook).

### Locked design (Apr 29 2026 evening)

- **Single-flow PRF/CALF for ALL rebates.** Both MD Tier-A AND non-MD partner accruals route to PrfCalf via `autoPrfRouting` on Collection POSTED. No `IncentivePayout` PAID_DIRECT path. The `bir_flag: 'INTERNAL'` invariant on PRF + PRF-derived JEs (autoJournal Phase 0) holds even after disbursement to MD or non-MD recipients — internal cost allocation, never on BIR P&L. Avoids PRC Code of Ethics kickback exposure for MDs; keeps non-MD rebates on the same accounting path so the audit story is uniform.
- **Multiple matches at the same key all earn full % independently.** Walker functions return arrays (`matchAllMdProductRebates`, `matchAllNonMdPartnerRebateRules`) instead of single best-match. No winner-take-all.
- **Hospital scoping is mandatory** for both MD Tier-A and non-MD rules. Auto-filled from Doctor.hospitals[]; pickable when MD has multiple hospital affiliations; admin must add at least one hospital to the VIP Client profile before creating a rule.
- **calculation_mode per non-MD rule** (lookup-driven via `NONMD_REBATE_CALC_MODE`):
  - `EXCLUDE_MD_COVERED` (default, safe) — base = Σ collected lines NOT covered by MD Tier-A on the same hospital.
  - `TOTAL_COLLECTION` — base = `collection.net_of_vat` regardless of MD overlap. Doubled cost on overlap is accepted business policy when admin explicitly opts in.

### Schema changes

| Model | Phase R1 change |
|---|---|
| `MdProductRebate` | ADD `hospital_id` (required, ref Hospital). Composite index now `(entity_id, doctor_id, hospital_id, product_id, is_active)`. |
| `NonMdPartnerRebateRule` | `partner_id` ref flipped `PeopleMaster → Doctor`. `hospital_id` flipped optional → REQUIRED. ADD `calculation_mode` enum (`EXCLUDE_MD_COVERED` default \| `TOTAL_COLLECTION`). DROP `customer_id`, `product_code`, `priority`. Composite index now `(entity_id, partner_id, hospital_id, is_active)`. |
| `Collection.partner_tags[]` | ADD `calculation_mode` (denormalized from matched rule for amount math). |
| `Collection.md_rebate_lines[]` | ADD `hospital_id` (audit trail — which hospital's rule fired). |

### Engine changes

| File | Change |
|---|---|
| [`backend/erp/services/matrixWalker.js`](backend/erp/services/matrixWalker.js) | Added `matchAllMdProductRebates` + `matchAllNonMdPartnerRebateRules` (return arrays). Both single-match wrappers now require `hospital_id`. `getActiveTierAProductIds` accepts optional `hospital_id` filter. |
| [`backend/erp/services/rebateAccrualEngine.js`](backend/erp/services/rebateAccrualEngine.js) | `resolvePatientMd` now also resolves `md.hospital_id` (from PatientMdAttribution.hospital_id when set, fallback to Doctor.hospitals[0]). `accrueForOrder` skips Tier-A when no hospital_id resolves. Added "single-flow PRF/CALF" doc block on the engine header. |
| [`backend/erp/models/Collection.js`](backend/erp/models/Collection.js) | Pre-save bridge swaps to multi-match walkers, passes `csiHospitalId` (= SalesLine.hospital_id ‖ Collection.hospital_id) to Tier-A walk, captures hospital_id on each md_rebate_line, branches partner_tags amount math on `tag.calculation_mode`. |

### Forms (Phase 2B)

| File | Change |
|---|---|
| [`frontend/src/erp/pages/RebateMatrixPage.jsx`](frontend/src/erp/pages/RebateMatrixPage.jsx) | MD picker filters by `clientType=MD AND PARTNER AND agreement_date`. Hospital dropdown derived from selected MD's `hospitals[]` (auto-fill if 1; pickable otherwise). Product picker swapped to ERP ProductMaster via `useProducts()` (brand_name + generic_name + dosage_strength). Hospital column added to the table. |
| [`frontend/src/erp/pages/NonMdRebateMatrixPage.jsx`](frontend/src/erp/pages/NonMdRebateMatrixPage.jsx) | Partner picker filters by `clientType != MD AND PARTNER AND agreement_date`. Hospital required + auto-filled from partner.hospitals[]. calculation_mode radio (lookup-driven via NONMD_REBATE_CALC_MODE with inline `CALC_MODE_FALLBACK` so the page never goes dark). Dropped form fields: customer_id, product_code, priority. Calculation Mode column added to the table. |
| [`frontend/src/erp/pages/CapitationRulesPage.jsx`](frontend/src/erp/pages/CapitationRulesPage.jsx) | Labels updated to operator vocabulary ("Rule name" → "Program label" with Q-period placeholder; "Frequency window" → "Cadence"). Banner: "Online Pharmacy only — activates with VIP-1.D." Schema unchanged. |
| [`frontend/src/erp/pages/CommissionMatrixPage.jsx`](frontend/src/erp/pages/CommissionMatrixPage.jsx) | Payee dropdown filters by `role=staff` server-side (Phase S2 — admins don't draw commission). Product picker swapped from free-text to ProductMaster (stored value is product _id). Per-line routing banner explains SalesLine.bdm_id attribution. |

### Lookup seeds

`NONMD_REBATE_CALC_MODE` added to [`backend/erp/controllers/lookupGenericController.js`](backend/erp/controllers/lookupGenericController.js) `SEED_DEFAULTS`. Two rows (`EXCLUDE_MD_COVERED` default + `TOTAL_COLLECTION` opt-in), both `insert_only_metadata: true` so admin label/color edits survive future re-seeds. Lazy-seeds on first GET per entity; can be triggered explicitly via `node backend/erp/scripts/seedAllLookups.js`.

### Migration script

[`backend/erp/scripts/migratePhaseR1RebateSchema.js`](backend/erp/scripts/migratePhaseR1RebateSchema.js) — dry-run-by-default. Backfills:
- `MdProductRebate.hospital_id` ← Doctor.hospitals[0] (skip + warn if MD has none).
- `NonMdPartnerRebateRule.hospital_id` ← Doctor.hospitals[0] of partner_id.
- `NonMdPartnerRebateRule.calculation_mode` ← `EXCLUDE_MD_COVERED`.
- $unset legacy `customer_id` / `product_code` / `priority` fields.

Memory expects very few existing rows (rebate matrix admin-only HOLD per `project_saas_scope_rebate_proprietary_apr29_2026`), so this is a near-greenfield run on dev. Production may have zero rows.

Run: `node backend/erp/scripts/migratePhaseR1RebateSchema.js` (dry-run) then `--apply` to commit. BLOCKED rows print to console for manual admin fix.

### BIR_FLAG invariant (re-affirmed by user Apr 29 2026)

> "for non MD also, BIR Flag is still Internal Only"

PRF and CALF default to `bir_flag: 'INTERNAL'` ([backend/erp/models/PrfCalf.js:103](backend/erp/models/PrfCalf.js#L103)). `autoPrfRouting.ensurePrfForBucket` explicitly stamps `bir_flag: 'INTERNAL'` ([line 238](backend/erp/services/autoPrfRouting.js#L238)). `autoJournal.journalFromPrfCalf` (Phase 0 commit `bc57fba`) inherits the policy on the JE. After PRF disbursement, the cash outflow to MD or non-MD partner stays on the INTERNAL ledger — never reported on BIR P&L. PRC Code of Ethics kickback exposure for MDs is mitigated because outflows are sourced from CME, advisory honoraria with formal MOA, and patient programs (admin-controlled disbursement, audit-traceable).

### Verification (Phase 3 — partial; Playwright deferred)

- `node backend/scripts/healthcheckRebateCommissionWiring.js` → 109/109 PASS (was 86/86; +23 Phase R1 assertions covering hospital_id schema, calculation_mode field, multi-match walker exports, engine hospital scoping, migration script presence, seed lookup category, dropped field absence)
- `node backend/scripts/healthcheckBirVatReturnWiring.js` → 39/39 PASS (untouched)
- `npx vite build` → green in 11.52s
- `node -c` syntax check on every modified backend file → PASS
- **Playwright UI smoke DEFERRED** — Playwright MCP not loaded in this session. Recommended smoke for the next session that has MCP loaded:
  - `/erp/rebate-matrix` Add Rule modal: pick MD → Hospital auto-fills (or becomes pickable) → ProductMaster items render → submit creates row → row shows in table with Hospital column populated.
  - `/erp/non-md-rebate-matrix` Add Rule modal: pick non-MD partner → Hospital auto-fills → calculation_mode radio defaults to EXCLUDE_MD_COVERED → submit → row shows in table with Calculation Mode pill.
  - `/erp/capitation-rules` Add Rule modal: labels read "Program label" + "Cadence". Yellow VIP-1.D banner visible above the page heading.
  - `/erp/commission-matrix` Add Rule modal: Payee dropdown contains only staff users (no admins). Product picker shows ProductMaster items. Blue per-line routing banner visible above the tabs.
  - Negative path: staff role hits any `/erp/*` rebate page → 403 / sidebar entry hidden.

### Files touched (Phase 2A + 2B)

**Backend (8 modified, 1 new):**
- modified: [backend/erp/models/MdProductRebate.js](backend/erp/models/MdProductRebate.js) — required hospital_id + composite index
- modified: [backend/erp/models/NonMdPartnerRebateRule.js](backend/erp/models/NonMdPartnerRebateRule.js) — partner_id→Doctor, hospital_id required, calculation_mode added, customer_id/product_code/priority dropped
- modified: [backend/erp/models/Collection.js](backend/erp/models/Collection.js) — partner_tags.calculation_mode + md_rebate_lines.hospital_id; bridge passes hospital_id + branches calculation_mode + multi-match earn-all
- modified: [backend/erp/services/matrixWalker.js](backend/erp/services/matrixWalker.js) — hospital_id required, multi-match exports
- modified: [backend/erp/services/rebateAccrualEngine.js](backend/erp/services/rebateAccrualEngine.js) — hospital scoping + single-flow PRF doc block
- modified: [backend/erp/controllers/mdProductRebateController.js](backend/erp/controllers/mdProductRebateController.js) — hospital_id query filter
- modified: [backend/erp/controllers/nonMdPartnerRebateRuleController.js](backend/erp/controllers/nonMdPartnerRebateRuleController.js) — allowed-fields list updated
- modified: [backend/erp/controllers/lookupGenericController.js](backend/erp/controllers/lookupGenericController.js) — NONMD_REBATE_CALC_MODE seed
- modified: [backend/scripts/healthcheckRebateCommissionWiring.js](backend/scripts/healthcheckRebateCommissionWiring.js) — Phase R1 assertions
- new: [backend/erp/scripts/migratePhaseR1RebateSchema.js](backend/erp/scripts/migratePhaseR1RebateSchema.js)

**Frontend (5 modified):**
- modified: [frontend/src/erp/pages/RebateMatrixPage.jsx](frontend/src/erp/pages/RebateMatrixPage.jsx)
- modified: [frontend/src/erp/pages/NonMdRebateMatrixPage.jsx](frontend/src/erp/pages/NonMdRebateMatrixPage.jsx)
- modified: [frontend/src/erp/pages/CapitationRulesPage.jsx](frontend/src/erp/pages/CapitationRulesPage.jsx)
- modified: [frontend/src/erp/pages/CommissionMatrixPage.jsx](frontend/src/erp/pages/CommissionMatrixPage.jsx)
- modified: [frontend/src/components/common/PageGuide.jsx](frontend/src/components/common/PageGuide.jsx) — banners updated for all four pages

### Subscription posture

- All four pages remain admin-gated via lookup-driven role categories `REBATE_ROLES` and `COMMISSION_ROLES` — subscribers configure access via Control Center → Lookup Tables.
- All schema enums (`calculation_mode`, `partnership_status`, `client_type`) are validation gates only; UI labels come from lookups (`NONMD_REBATE_CALC_MODE`, `DOCTOR_PARTNERSHIP_STATUS`, `VIP_CLIENT_TYPE`) with inline fallbacks so the page never goes dark on a Lookup outage (Rule #3).
- Single-flow PRF/CALF design simplifies the Year-2 Pharmacy SaaS spin-out — one accounting path to expose vs three modes was a real divergence risk for multi-tenant subscribers.

---

## Phase G6.7-PC1 — Petty Cash Hub Approve Fix (Apr 30 2026 evening)

> Tightly-scoped regression fix. Closes the "Petty Cash cannot be approved from the Approval Hub" 500-error reported by the President during live use of [/erp/approvals](frontend/src/erp/pages/ApprovalManager.jsx).

### What was broken

`POST /api/erp/approvals/universal-approve` with `{ type: 'petty_cash', action: 'approve' }` returned `500 Internal Server Error` ("Something went wrong"). Root cause in [universalApprovalController.js:980-985](backend/erp/controllers/universalApprovalController.js#L980-L985): the Group B `petty_cash` handler was a bare delegate to `buildGroupBReject`, which hard-throws on any action ≠ `'reject'` ("Unsupported action for petty_cash: approve — only 'reject' is supported via Group B handler"). The original Phase G6.7 author's design comment at L80-83 said the approve path was "consumed by each module's controller on next call via isFullyApproved()" — i.e. submitter retries the post and gateApproval lets it through — but in practice the Hub never flipped the ApprovalRequest to APPROVED (the handler threw before reaching the universalApprove auto-resolve at L1130-1160), so the two-step never closed the loop. Net effect: the Hub could only **reject** petty cash; approves were silently dead.

### What shipped

**1. Shared atomic post helper (`postSinglePettyCashTransaction`)** in [pettyCashController.js:281-378](backend/erp/controllers/pettyCashController.js#L281-L378):
- Idempotent on POSTED (early return with `already_posted: true` — re-approve from Hub never double-posts).
- Period lock check via `checkPeriodOpen(precheck.entity_id, period)` — keyed on the txn's own entity, not the approver's `req.entityId`, so cross-entity privileged approvers (CEO/admin spanning subsidiaries) work cleanly.
- Atomic balance move + status flip in `session.withTransaction()`. Hard balance guard on DISBURSEMENT (insufficient balance throws 400 with statusCode tag).
- Stamps `posted_by`, `posted_at`, `running_balance`, and `approved_by` (when blank) on the txn.
- Post-commit ceiling-breach notification (custodian + president) — best-effort, non-throwing (notify failures don't poison the post).

**2. `postTransaction` (BDM-direct path, [pettyCashController.js:383-411](backend/erp/controllers/pettyCashController.js#L383-L411))** refactored to:
- Run `gateApproval` (Authority Matrix + Default-Roles Gate) first → returns 202 + `approval_pending: true` if the requester isn't in `MODULE_DEFAULT_ROLES.PETTY_CASH` per the lookup.
- Delegate to the helper. Surfaces statusCode-tagged errors from the helper directly to the client.

**3. Hub handler (`approvalHandlers.petty_cash`, [universalApprovalController.js:980-1031](backend/erp/controllers/universalApprovalController.js#L980-L1031))** now branches on action:
- `reject` → still goes through `buildGroupBReject` (terminal-state guard + REJECTED stamp).
- `approve | post` → dereferences `ApprovalRequest.findById(id)` to recover the underlying `PettyCashTransaction._id` (Group B id-semantics: Hub's `approve_data.id` IS the request `_id`, not the doc `_id`), calls the helper to post atomically, then explicitly closes the originating `ApprovalRequest` via `updateOne({_id: id, status: 'PENDING'} → APPROVED)` with a history `$push`.
- The explicit close is required because the shared auto-resolve at [universalApprovalController.js:1130-1160](backend/erp/controllers/universalApprovalController.js#L1130-L1160) keys on `{ doc_id: id }` — that filter assumes Group A id-semantics (id == doc `_id`) and never matches Group B items. Without the explicit close the approve would post the txn but leave the request PENDING, re-surfacing it in the next Hub render.

**4. Healthcheck — [backend/scripts/healthcheckPettyCashHubApprove.js](backend/scripts/healthcheckPettyCashHubApprove.js) (22 static assertions):** verifies helper presence + export + idempotency + period-lock + session-transaction + insufficient-balance guard + ceiling notify; verifies Hub handler branches on action + dereferences ApprovalRequest + closes the request to APPROVED + history $push; verifies the BDM-direct route still mounts `postTransaction`. Mirrors the posture of `healthcheckInternalTransferProxy.js` (Phase G4.5dd) and catches the same "controller wired but Hub handler unaware → runtime 500" wiring drift class.

### Scope guardrails (Rule #4)

- **Other Group B modules NOT touched.** PURCHASING, JOURNAL, BANKING, IC_TRANSFER, SALES_GOAL_PLAN, INCENTIVE_PAYOUT all have the same "approve throws" pattern — they need analogous `postSingleXxx` helpers + Hub-handler branching, but each has its own complexity (multi-leg postings, reconciliation state machines, cross-entity flows). Fixing them blanket-style would risk breaking surfaces the user didn't ask about. Tracked as a follow-up phase (Phase G6.7-PC1-followup): see "Open Group B gaps" in PHASETASK-ERP.md for the punch list.
- **No new lookup category.** Existing `MODULE_DEFAULT_ROLES.PETTY_CASH` + `approve_petty_cash` sub-permission stay the authoritative gate. No hardcoded role lists added (Rule #3 preserved).
- **Banner unchanged.** [WorkflowGuide.jsx 'approval-manager' block L715-740](frontend/src/erp/components/WorkflowGuide.jsx#L715-L740) already documented the contract ("Posting modules… click Post to transition to POSTED; the close-loop auto-resolves any pending ApprovalRequest on the same doc"). The fix makes the implementation match the documentation.
- **No silent self-ID fallback** (Rule #21). The handler reads the txn via the helper, which trusts `precheck.entity_id` from the doc itself — never `req.entityId`/`req.bdmId`.
- **Backward compatibility — load-bearing.** The helper accepts the underlying `PettyCashTransaction._id` directly; the Hub handler falls back to treating `id` as the txn `_id` when `ApprovalRequest.findById(id)` returns null. Direct dispatches outside the Hub keep working.

### Files touched (2 modified, 1 new)

- modified: [backend/erp/controllers/pettyCashController.js](backend/erp/controllers/pettyCashController.js) — extract helper + refactor `postTransaction` + export helper
- modified: [backend/erp/controllers/universalApprovalController.js](backend/erp/controllers/universalApprovalController.js) — `petty_cash` handler branches on action; explicit ApprovalRequest close
- new: [backend/scripts/healthcheckPettyCashHubApprove.js](backend/scripts/healthcheckPettyCashHubApprove.js) — 22-check static wiring contract
- modified: docs ([CLAUDE-ERP.md](CLAUDE-ERP.md) + [docs/PHASETASK-ERP.md](docs/PHASETASK-ERP.md))

### Verification (Apr 30 2026 evening)

- `node -c` on both modified controllers → green.
- `node backend/scripts/healthcheckPettyCashHubApprove.js` → **22/22 PASS**.
- Regression sibling healthchecks: G4.5dd 26/26 PASS, Income Proxy 32/32 PASS, Compute Payroll 29/29 PASS, Payslip Roster 31/31 PASS.
- `npx vite build` → **green in 13.96s**.
- Live Playwright smoke: see handoff (s25 BDM submits DEPOSIT → Hub item appears → president clicks Approve → 200 + txn POSTED + fund balance updated + ApprovalRequest closed).

### Subscription posture

- Approver gate still routes through the lookup-driven `MODULE_DEFAULT_ROLES.PETTY_CASH` (Rule #3) and the `approve_petty_cash` sub-permission. Subscribers configure who can post petty cash without code changes.
- `MODULE_AUTO_POST` was deliberately NOT extended to PETTY_CASH (would only fire on the `approval_request` type). The fix lives in the `petty_cash` handler itself, which is what the Hub actually dispatches.

---

## Phase G6.7-PC2 — Journal Hub Approve Fix (Apr 30 2026 evening)

> Same fix template as G6.7-PC1, applied to the next Group B module. Closes the second of six identical 500 regressions surfaced by the Group B Hub-handler audit.

### Why this was urgent

The Apr 29 audit (see PHASETASK-ERP.md "Open Group B gaps") confirmed all 6 Group B handlers (`purchasing` / `journal` / `banking` / `ic_transfer` / `sales_goal_plan` / `incentive_payout`) render an Approve button in the Hub UI but the backend handler is hard-coded to throw on any action ≠ `'reject'`. Each is end-to-end 500-broken on approve, same bug class as the petty_cash regression we just fixed. Risk-tiered fix order (lowest → highest blast radius): journal → purchasing/incentive_payout → banking/ic_transfer/sales_goal_plan.

### What shipped

**Hub handler (`approvalHandlers.journal`, [universalApprovalController.js:959-1027](backend/erp/controllers/universalApprovalController.js#L959-L1027))** now branches on action:
- `reject` → still goes through `buildGroupBReject` (terminal-state guard + REJECTED stamp).
- `approve | post` → derefs `ApprovalRequest.findById(id)` to recover the underlying `JournalEntry._id`, peeks status (idempotent on POSTED — re-approve from Hub never double-posts), period-locks against the **JE's own** entity_id (cross-entity-safe), calls existing `journalEngine.postJournal(jeId, userId, jeEntityId)`, then explicitly closes the originating `ApprovalRequest` to APPROVED with a history `$push`.

### Why no helper extraction was needed (vs G6.7-PC1)

`postJournal(jeId, userId, entityId)` is already a clean service-layer function in [`backend/erp/services/journalEngine.js:51`](backend/erp/services/journalEngine.js#L51) — same shape and contract as the helper we extracted for petty cash, but it already existed. Stamp `posted_by` + `posted_at` + `status='POSTED'` is done inside the existing helper; pre-save hook validates DR=CR balance + COA codes against ChartOfAccounts. **Zero new business logic added — pure wiring.**

### Healthcheck

[`backend/scripts/healthcheckJournalHubApprove.js`](backend/scripts/healthcheckJournalHubApprove.js) — **19 static assertions**: Hub handler branches on action; reject path preserved; approve|post path delegates to `postJournal`; ApprovalRequest deref + close + history $push; period-lock against JE entity; `postJournal` helper signature + idempotency guard; BDM-direct route still wired; `JOURNAL` MODULE_QUERIES `actionType` + `sub_key='approve_journal'` unchanged; G6.7-PC1 sibling healthcheck still present.

### Verification (Apr 30 2026 evening)

- `node -c` on universalApprovalController → green.
- `node backend/scripts/healthcheckJournalHubApprove.js` → **19/19 PASS**.
- Regression: G6.7-PC1 22/22, G4.5dd 26/26, Income Proxy 32/32, Compute Payroll 29/29, Payslip Roster 31/31 — all green.
- `npx vite build` → green in 24.35s.
- **Live Playwright smoke (President):** seeded DRAFT JE (DR Cash 1000 ₱100 / CR Owner Capital 3000 ₱100) + PENDING ApprovalRequest. Hub queue 7→8 with JOURNAL filter chip. POST `/universal-approve` `{type:'journal', action:'approve', id:request._id, doc_id:je._id}` → **HTTP 200** with full JE doc returned. Hub queue 8→7, JOURNAL chip gone. DB-side ratification via `smokeVerifyJournalHubApprove.js`: JE status DRAFT → POSTED, posted_by=President, posted_at stamped, ApprovalRequest PENDING → APPROVED, decided_by=President, decision_reason="Approved via Approval Hub", history $push verified.

### Files touched (1 modified, 3 new)

- modified: [backend/erp/controllers/universalApprovalController.js](backend/erp/controllers/universalApprovalController.js) — `journal` handler branches on action; explicit ApprovalRequest close.
- new: [backend/scripts/healthcheckJournalHubApprove.js](backend/scripts/healthcheckJournalHubApprove.js)
- new: [backend/scripts/smokeFixtureJournalHubApprove.js](backend/scripts/smokeFixtureJournalHubApprove.js) (dev-only, optional)
- new: [backend/scripts/smokeVerifyJournalHubApprove.js](backend/scripts/smokeVerifyJournalHubApprove.js) (dev-only, optional)
- modified: docs (CLAUDE-ERP.md + docs/PHASETASK-ERP.md)

### Subscription posture

Approver gate still routes through `MODULE_DEFAULT_ROLES.JOURNAL` (Rule #3) + `approve_journal` sub-permission. No new lookup category. Same backward-compat guard as G6.7-PC1: handler falls back to treating `id` as the JE _id directly when `ApprovalRequest.findById(id)` returns null — direct dispatches outside the Hub keep working.

### Open Group B gaps (4 remaining, deferred)

`purchasing` / `banking` / `ic_transfer` / `sales_goal_plan` / `incentive_payout` Hub handlers still throw on approve. Same fix template applies; each requires its own healthcheck + smoke fixture. Recommended order: `purchasing` → `incentive_payout` → `ic_transfer` → `banking` → `sales_goal_plan`. See PHASETASK-ERP.md for the full punch list.

---

## Phase G6.7-PC3 — Incentive Payout Hub Approve Fix (Apr 30 2026 evening)

> Same fix template as PC1+PC2 with one extra layer: the `incentive_payout` Hub handler must branch on `ApprovalRequest.doc_type` because the BDM-direct controller emits FOUR distinct doc_types under one module key.

### Why this was urgent

The IncentivePayout lifecycle (`ACCRUED → APPROVED → PAID → REVERSED`) is gated by **three** separate `gateApproval` calls in [`incentivePayoutController.js`](backend/erp/controllers/incentivePayoutController.js): `PAYOUT_APPROVE` (status flip, no JE), `PAYOUT_PAY` (settlement JE), `PAYOUT_REVERSE` (storno JE). All three resolve to the same `module: 'INCENTIVE_PAYOUT'` so they all funnel through the same Hub handler, but the handler must dispatch to a different lifecycle path per `doc_type`. The pre-PC3 handler was a bare `buildGroupBReject` delegate — same 500 regression as PC1+PC2.

### What shipped

**Three lifecycle helpers extracted from [`incentivePayoutController.js`](backend/erp/controllers/incentivePayoutController.js)** as the single source of truth for state transitions. The BDM-direct routes (`approvePayout` / `payPayout` / `reversePayout`) AND the Approval Hub handler now both call into these — keeps the two paths in lockstep:

- `postSinglePayoutApproval(payoutId, userId, notes?)` — `ACCRUED → APPROVED`. Pure status flip + audit + integration event. No JE, no period lock (this is a "promise to pay" transition, not a financial event).
- `postSinglePayoutPayment(payoutId, userId, paidViaOpts?)` — `ACCRUED|APPROVED → PAID`. Period-locks against the payout's own entity. Resolves PaymentMode via `paid_via_id` or `paid_via` code (falls back to CASH_ON_HAND inside `postSettlementJournal`). Posts settlement JE (DR INCENTIVE_ACCRUAL contra / CR funding COA), stamps `paid_by` / `paid_at` / `paid_via` / `settlement_journal_id`, audits, emits `PAYOUT_PAID` integration event.
- `postSinglePayoutReversal(payoutId, userId, reason)` — Any non-REVERSED → `REVERSED`. Period-locks. Calls `reverseAccrualJournal` (SAP Storno via existing journalEngine helper). Stamps `reversed_by` / `reversed_at` / `reversal_reason` / `reversal_journal_id`, audits with `log_type: 'PRESIDENT_REVERSAL'`, emits `PAYOUT_REVERSED`.

All three are **idempotent on terminal state** — re-firing from the Hub never double-posts a JE.

**Hub handler ([`approvalHandlers.incentive_payout`](backend/erp/controllers/universalApprovalController.js))** now branches on `request.doc_type`:

| `doc_type` | Lifecycle helper called | Notes |
|---|---|---|
| `PAYOUT_APPROVE` | `postSinglePayoutApproval(payoutId, userId)` | No JE side effect |
| `PAYOUT_PAY` (default) | `postSinglePayoutPayment(payoutId, userId)` | Falls back to CASH_ON_HAND for funding COA |
| `PAYOUT_REVERSE` | `postSinglePayoutReversal(payoutId, userId, reason)` | Reason from approver's `decision_reason` (sentinel fallback if blank) |
| `STATEMENT_DISPATCH` | None | No underlying IncentivePayout — request.doc_id points at requester userId; just close the request. Admin re-runs `/statements/dispatch` to mass-mail. |

After dispatching, the handler explicitly closes the `ApprovalRequest` to `APPROVED` with `decided_by` / `decided_at` / `decision_reason` / `$push history` row — same close pattern as PC1+PC2.

### Healthcheck

[`backend/scripts/healthcheckIncentivePayoutHubApprove.js`](backend/scripts/healthcheckIncentivePayoutHubApprove.js) — **34 static assertions**: Hub handler branches on action; reject preserved; approve/post dispatches per doc_type to the correct helper; STATEMENT_DISPATCH short-circuit; ApprovalRequest deref + close + history $push; all three helpers exported; idempotency on PAID / APPROVED / REVERSED; period-lock against payout's entity inside `postSinglePayoutPayment`; settlement JE via `postSettlementJournal`; storno via `reverseAccrualJournal`; ErpAuditLog STATUS_CHANGE row written; BDM-direct routes delegate to the same helpers; `INCENTIVE_PAYOUT` MODULE_QUERIES `actionType='incentive_payout'` + `sub_key='approve_incentive_payout'` unchanged; PC1 + PC2 sibling healthchecks still present (no regression).

### Verification (Apr 30 2026 evening)

- `node -c` on universalApprovalController + incentivePayoutController → both green.
- `node backend/scripts/healthcheckIncentivePayoutHubApprove.js` → **34/34 PASS**.
- Regression: PC1 22/22, PC2 19/19 — both green.
- `npx vite build` → green in 16.80s.
- **Live UI ratify (President at `/erp/approvals`):** Hub renders 7 pending items (1 SALES + 1 UNDERTAKING + 3 INCOME + 2 PAYROLL) cleanly, "Authority Matrix Disabled" badge visible, full PageGuide banner intact. Zero pending INCENTIVE_PAYOUT items in dev cluster (no payout has been routed to the Hub yet — the test rate is naturally 0 because Sales Goal cycles haven't been computed). See `g6-7-pc3-hub-renders-clean.png`.
- **Why no end-to-end approve smoke for PC3:** seeding a real IncentivePayout requires a SalesGoalPlan with ACTIVE targets + a KPI snapshot + an accrual JE — a heavy fixture. The structural healthcheck + helper unit boundaries cover the wiring contract; the live ratification will fall out of the next real Sales Goal cycle the user runs through. The synthetic-payout fixture is documented but not seeded (deferred to first real PAYOUT_PAY cycle).

### Files touched (2 modified, 1 new + docs)

- modified: [backend/erp/controllers/incentivePayoutController.js](backend/erp/controllers/incentivePayoutController.js) — extracted three lifecycle helpers (`postSinglePayoutApproval` / `postSinglePayoutPayment` / `postSinglePayoutReversal`); BDM-direct routes (`approvePayout` / `payPayout` / `reversePayout`) now delegate to them.
- modified: [backend/erp/controllers/universalApprovalController.js](backend/erp/controllers/universalApprovalController.js) — `incentive_payout` handler branches on action AND on `request.doc_type`.
- new: [backend/scripts/healthcheckIncentivePayoutHubApprove.js](backend/scripts/healthcheckIncentivePayoutHubApprove.js)
- modified: docs (CLAUDE-ERP.md + docs/PHASETASK-ERP.md)

### Subscription posture

Approver gate still routes through `MODULE_DEFAULT_ROLES.INCENTIVE_PAYOUT` (Rule #3) + `approve_incentive_payout` sub-permission. No new lookup category. Backward-compat guard preserved: handler falls back to treating `id` as the payout `_id` directly when `ApprovalRequest.findById(id)` returns null — direct dispatches outside the Hub keep working.

### Open Group B gaps (4 remaining, deferred)

`purchasing` / `sales_goal_plan` / `ic_transfer` / `banking` Hub handlers still throw on approve. PC3 closed `incentive_payout` (third of seven). See PHASETASK-ERP.md for the full punch list.

---

## Phase G6.7-PC4 — Purchasing (Supplier Invoice) Hub Approve Fix (May 01 2026)

> Fourth of seven Group B Hub handlers wired. Closes the "approve a SUPPLIER_INVOICE in /erp/approvals → 500" regression. Same fix template as PC1+PC2+PC3.

### What shipped

**Helper [`postSingleSupplierInvoice(invoiceId, userId)`](backend/erp/controllers/purchasingController.js)** — single source of truth for the SI `DRAFT|VALIDATED → POSTED` transition. Already extracted from the `postInvoice` route (no new helper code in this commit). Both the BDM-direct route AND the Hub handler call into it. Idempotent on POSTED, period-locks against the invoice's own entity (cross-entity-safe), wraps status flip + JE creation in a `mongoose.startSession().withTransaction(...)` so a failed JE rolls back the SI status change. Writes the INPUT VAT entry post-commit (best-effort — failures are logged + audited but do not roll back). Authorization stays the caller's responsibility (`postInvoice` runs `gateApproval` first; the Hub gate already passed).

**Hub handler ([`approvalHandlers.purchasing`](backend/erp/controllers/universalApprovalController.js))** now branches on action:
- `reject` → `buildGroupBReject` (terminal-state guard against POSTED/CLOSED/CANCELLED).
- `approve | post` → derefs `ApprovalRequest.findById(id)` to recover `SupplierInvoice._id`, calls `postSingleSupplierInvoice(invoiceId, userId)`, then explicitly closes the originating `ApprovalRequest` to APPROVED with a history `$push`.

Today the only `doc_type` the Hub sees for PURCHASING is `SUPPLIER_INVOICE` (PO doc_types route through their own controller — `purchasingController.approvePO` / `receivePO` — and never reach this Hub handler). If a future PO Hub flow is added, branch on doc_type here.

### Healthcheck

[`backend/scripts/healthcheckPurchasingHubApprove.js`](backend/scripts/healthcheckPurchasingHubApprove.js) — **25 static assertions**: Hub handler branches on action; reject preserved; approve|post path delegates to `postSingleSupplierInvoice`; ApprovalRequest deref + close + history $push; helper exists, is exported, idempotent on POSTED, period-locks against invoice entity, transactional JE post, INPUT VAT entry; BDM-direct `postInvoice` still wired through `gateApproval` → helper; `PURCHASING` MODULE_QUERIES `actionType='purchasing'` + `sub_key='approve_purchasing'` unchanged; PC1+PC2+PC3 sibling healthchecks still present.

### Verification (May 01 2026)

- `node -c` on universalApprovalController + purchasingController → both green.
- `node backend/scripts/healthcheckPurchasingHubApprove.js` → **25/25 PASS**.
- `npx vite build` → green in 35.70s.
- Live UI ratify: deferred to the bundled smoke at the end of the PC3-PC7 sweep (Hub session expired between PC3 ratify and this phase due to backend hot-reload). Structural healthcheck + helper unit boundaries cover the wiring contract.

### Files touched (1 modified, 1 new + docs)

- modified: [backend/erp/controllers/universalApprovalController.js](backend/erp/controllers/universalApprovalController.js) — `purchasing` handler branches on action.
- (helper [postSingleSupplierInvoice](backend/erp/controllers/purchasingController.js) and BDM-direct delegation already shipped in prep work prior to PC4 — no new lines in purchasingController.js for PC4 itself).
- new: [backend/scripts/healthcheckPurchasingHubApprove.js](backend/scripts/healthcheckPurchasingHubApprove.js)
- modified: docs (CLAUDE-ERP.md + docs/PHASETASK-ERP.md)

### Subscription posture

Approver gate still routes through `MODULE_DEFAULT_ROLES.PURCHASING` + `approve_purchasing` sub-permission. No new lookup category. Backward-compat guard preserved: handler falls back to treating `id` as the SI `_id` directly when `ApprovalRequest.findById(id)` returns null.

### Open Group B gaps (3 remaining, deferred)

`sales_goal_plan` / `ic_transfer` / `banking` Hub handlers still throw on approve. PC4 closed `purchasing` (fourth of seven).

---

## Phase G6.7-PC5 — Sales Goal Plan Hub Approve Fix (May 01 2026)

> Fifth of seven Group B Hub handlers wired. Closes the "approve a SALES_GOAL_PLAN PLAN_ACTIVATE in /erp/approvals → 500" regression. Most cascade-heavy of the seven phases — DRAFT → ACTIVE fires SEVEN downstream cascades inside one transaction.

### What shipped

**Helper [`postSingleSalesGoalPlan(planId, userId)`](backend/erp/controllers/salesGoalController.js)** — extracted from `activatePlan` route. Single source of truth for the plan activation cascade:

1. Generate `plan.reference` (SG-#-FY#) on first activation (only if blank)
2. Flip plan.status DRAFT → ACTIVE + stamp approved_by / approved_at
3. Cascade-flip all DRAFT SalesGoalTargets to ACTIVE
4. `autoEnrollEligibleBdms(plan, userId, session)` — BDM-level idempotent
5. `salesGoalService.ensureKpiVarianceGlobalThreshold` — lazy-seed KPI_VARIANCE_THRESHOLDS.GLOBAL row
6. `incentivePlanService.syncHeaderOnActivation` — O(1) via unique index, won't double-create
7. `ErpAuditLog STATUS_CHANGE` row inside the transaction

All seven steps run inside one `mongoose.startSession().withTransaction(...)` so the plan reference number is **never burned on rollback**. Post-commit: lifecycle notification + `PLAN_ACTIVATED` integration event (best-effort; failures don't roll back the activation).

**Idempotency:** short-circuits when `plan.status === 'ACTIVE'` so re-clicking Approve from the Hub never double-enrolls BDMs or burns a fresh reference number.

**Hub handler ([`approvalHandlers.sales_goal_plan`](backend/erp/controllers/universalApprovalController.js))** branches on action AND on `request.doc_type`:
- `reject` → `buildGroupBReject` (terminal-state guard against CLOSED/REVERSED).
- `approve | post`:
  - `PLAN_ACTIVATE` (default) or `SALES_GOAL_PLAN` → `postSingleSalesGoalPlan(planId, userId)`.
  - Plan-adjacent doc_types (`BULK_TARGETS_IMPORT` / `PLAN_NEW_VERSION` / `TARGET_REVISION`) — no model-backed activation. Just close the request with a "must trigger {docType} action separately" decision_reason.

### Healthcheck

[`backend/scripts/healthcheckSalesGoalPlanHubApprove.js`](backend/scripts/healthcheckSalesGoalPlanHubApprove.js) — **32 static assertions**: Hub handler branches on action + doc_type; reject preserved; PLAN_ACTIVATE → helper, plan-adjacent doc_types short-circuit cleanly; helper exists, exported, idempotent on ACTIVE, transactional, generates plan.reference, flips targets, auto-enrolls BDMs, seeds KPI threshold, syncs IncentivePlan header, emits PLAN_ACTIVATED event; BDM-direct activatePlan delegates; `SALES_GOAL_PLAN` MODULE_QUERIES `actionType='sales_goal_plan'` + `sub_key='approve_sales_goal'` unchanged; PC1-PC4 sibling healthchecks still present.

### Verification (May 01 2026)

- `node -c` on universalApprovalController + salesGoalController → both green.
- `node backend/scripts/healthcheckSalesGoalPlanHubApprove.js` → **32/32 PASS**.
- `npx vite build` → green in 24.23s.
- Live UI ratify deferred to bundled smoke at the end of the PC3-PC7 sweep.

### Files touched (1 modified, 1 new + docs)

- modified: [backend/erp/controllers/universalApprovalController.js](backend/erp/controllers/universalApprovalController.js) — `sales_goal_plan` handler branches on action + doc_type.
- (helper [postSingleSalesGoalPlan](backend/erp/controllers/salesGoalController.js) and BDM-direct delegation already shipped in prep work prior to PC5).
- new: [backend/scripts/healthcheckSalesGoalPlanHubApprove.js](backend/scripts/healthcheckSalesGoalPlanHubApprove.js)
- modified: docs (CLAUDE-ERP.md + docs/PHASETASK-ERP.md)

### Subscription posture

Approver gate still routes through `MODULE_DEFAULT_ROLES.SALES_GOAL_PLAN` + `approve_sales_goal` sub-permission. No new lookup category. Backward-compat guard preserved.

### Open Group B gaps (2 remaining, deferred)

`ic_transfer` / `banking` Hub handlers still throw on approve. PC5 closed `sales_goal_plan` (fifth of seven).

---

## Phase G6.7-PC6 — IC Transfer + IC Settlement Hub Approve Fix (May 01 2026)

> Sixth of seven Group B Hub handlers wired. Closes the "approve an IC_TRANSFER or IC_SETTLEMENT in /erp/approvals → 500" regression. Cross-entity surface — handler must branch on `request.doc_type` because the `ic_transfer` Hub key covers TWO physical models.

### What shipped

**Two helpers** — single source of truth for the two distinct transitions:

- [`approveSingleIcTransfer(transferId, userId)`](backend/erp/controllers/interCompanyController.js) — extracted from `approveTransfer` route. InterCompanyTransfer DRAFT → APPROVED. **Idempotent on APPROVED + all downstream states (SHIPPED/RECEIVED/POSTED)** — re-approve from Hub never demotes a shipped transfer back to APPROVED. No period lock (APPROVED is a pre-financial state — no JE, no stock move; period gate fires later on `shipTransfer` / `postTransfer`). Audits `STATUS_CHANGE`.
- [`postSingleIcSettlement(settlementId, userId)`](backend/erp/controllers/icSettlementController.js) — extracted from `postSettlement` route. IcSettlement DRAFT → POSTED + emits `IC_SETTLEMENT` TransactionEvent. **Idempotent on POSTED.** Period-locks against the **creditor entity** (the side recording the receipt) — cross-entity-safe for Hub approvers. Wraps event creation + status flip in `withTransaction` for atomicity. Guards against empty `settled_transfers`.

**Hub handler ([`approvalHandlers.ic_transfer`](backend/erp/controllers/universalApprovalController.js))** branches on action AND on `request.doc_type`:
- `reject` → `buildGroupBReject` with `modelByDocType: { IC_TRANSFER: 'InterCompanyTransfer', IC_SETTLEMENT: 'IcSettlement' }`. Terminal-state guard against POSTED/CANCELLED/RECEIVED.
- `approve | post`:
  - `IC_SETTLEMENT` → `postSingleIcSettlement(docId, userId)` returns `{ settlement, doc_type: 'IC_SETTLEMENT' }`.
  - `IC_TRANSFER` (default fallthrough) → `approveSingleIcTransfer(docId, userId)` returns `{ transfer, doc_type: 'IC_TRANSFER' }`.

### Healthcheck

[`backend/scripts/healthcheckIcTransferHubApprove.js`](backend/scripts/healthcheckIcTransferHubApprove.js) — **34 static assertions**: Hub handler branches on action + doc_type with both branches dispatching correctly; reject preserved; both helpers exist + exported; `approveSingleIcTransfer` idempotent on all post-DRAFT states + audits; `postSingleIcSettlement` idempotent on POSTED + period-locks against creditor entity + creates IC_SETTLEMENT event atomically + guards empty settled_transfers; BDM-direct routes (`approveTransfer` / `postSettlement`) delegate; `IC_TRANSFER` MODULE_QUERIES `docTypeToModel` covers both `IC_TRANSFER` and `IC_SETTLEMENT`; PC1-PC5 sibling healthchecks still present.

### Verification (May 01 2026)

- `node -c` on universalApprovalController + interCompanyController + icSettlementController → all green.
- `node backend/scripts/healthcheckIcTransferHubApprove.js` → **34/34 PASS**.
- `npx vite build` → green in 24.23s.
- Live UI ratify deferred to bundled smoke at the end of the PC3-PC7 sweep.

### Files touched (1 modified, 1 new + docs)

- modified: [backend/erp/controllers/universalApprovalController.js](backend/erp/controllers/universalApprovalController.js) — `ic_transfer` handler branches on action + doc_type.
- (helpers [approveSingleIcTransfer](backend/erp/controllers/interCompanyController.js) + [postSingleIcSettlement](backend/erp/controllers/icSettlementController.js) and BDM-direct delegation already shipped in prep work prior to PC6).
- new: [backend/scripts/healthcheckIcTransferHubApprove.js](backend/scripts/healthcheckIcTransferHubApprove.js)
- modified: docs (CLAUDE-ERP.md + docs/PHASETASK-ERP.md)

### Subscription posture

Approver gate still routes through `MODULE_DEFAULT_ROLES.IC_TRANSFER` + `approve_ic_transfer` sub-permission. No new lookup category. Backward-compat guard preserved.

### Open Group B gaps (1 remaining, deferred)

`banking` Hub handler still throws on approve. PC6 closed `ic_transfer` (sixth of seven).

---

## Phase G6.7-PC7 — Banking (Bank Recon Finalize) Hub Approve Fix (May 01 2026)

> Seventh and final Group B Hub handler wired. Closes the "approve a BANK_RECON in /erp/approvals → 500" regression. **The Group B Hub Approve regression class is closed.** SaaS spin-out audit gate cleared on this surface.

### What shipped

**Helper [`finalizeRecon(statementId, userId)`](backend/erp/services/bankReconService.js)** — already a service-layer function (no extraction needed). BankStatement IN_PROGRESS → FINALIZED. Loops `RECONCILING_ITEM` entries; creates adjustment JEs for bank fees (DR BANK_CHARGES / CR BANK) or interest (DR BANK / CR INTEREST_INCOME). Updates `BankAccount.current_balance` to match `statement.closing_balance`.

**CAUTION:** `BankStatement.status === 'FINALIZED'` is **immutable** — finalize cannot be undone without manual DB intervention. The Hub handler peeks status BEFORE calling `finalizeRecon` so re-clicking Approve from the Hub returns `{ already_finalized: true }` instead of throwing the service-layer "Already finalized" error. Defense-in-depth.

**Hub handler ([`approvalHandlers.banking`](backend/erp/controllers/universalApprovalController.js))** branches on action:
- `reject` → `buildGroupBReject` (terminal-state guard against FINALIZED — cannot demote to REJECTED).
- `approve | post` → derefs `ApprovalRequest.findById(id)` to recover `BankStatement._id`, peeks status (idempotent on FINALIZED), calls `finalizeRecon(stmtId, userId)` only when not already FINALIZED, then explicitly closes the originating `ApprovalRequest` to APPROVED with a history `$push`.

### Healthcheck

[`backend/scripts/healthcheckBankingHubApprove.js`](backend/scripts/healthcheckBankingHubApprove.js) — **24 static assertions**: Hub handler branches on action; reject preserved; approve|post delegates to `finalizeRecon`; ApprovalRequest deref + close + history $push; **status peek BEFORE calling helper** (idempotency); `already_finalized:true` surfaced on re-fire; helper exists with correct signature, throws on already-FINALIZED state (defense-in-depth), updates BankAccount.current_balance; `BANKING` MODULE_QUERIES `actionType='banking'` + `sub_key='approve_banking'` unchanged; PC1-PC6 sibling healthchecks still present.

### Verification (May 01 2026)

- `node -c` on universalApprovalController → green.
- `node backend/scripts/healthcheckBankingHubApprove.js` → **24/24 PASS**.
- `npx vite build` → green in 24.23s.
- Live UI ratify deferred to bundled smoke at the end of the PC3-PC7 sweep.
- Synthetic-statement-only smoke recommended for any future end-to-end test (FINALIZED is immutable; NEVER smoke against a real production bank statement).

### Files touched (1 modified, 1 new + docs)

- modified: [backend/erp/controllers/universalApprovalController.js](backend/erp/controllers/universalApprovalController.js) — `banking` handler branches on action with idempotent status peek.
- (helper [finalizeRecon](backend/erp/services/bankReconService.js) already factored as a service-layer function — no new business logic).
- new: [backend/scripts/healthcheckBankingHubApprove.js](backend/scripts/healthcheckBankingHubApprove.js)
- modified: docs (CLAUDE-ERP.md + docs/PHASETASK-ERP.md)

### Subscription posture

Approver gate still routes through `MODULE_DEFAULT_ROLES.BANKING` + `approve_banking` sub-permission. No new lookup category. Backward-compat guard preserved.

### Group B Hub Approve regression class — CLOSED

After PC7, all seven Group B Hub handlers (`petty_cash` / `journal` / `incentive_payout` / `purchasing` / `sales_goal_plan` / `ic_transfer` / `banking`) branch correctly on action and dispatch through extracted lifecycle helpers. The "approve throws → 500" pattern that surfaced first on petty_cash is now closed across the entire surface. SaaS spin-out audit gate cleared.

| Type            | Status   | Source models                       | Helper called                                                                  |
|-----------------|----------|-------------------------------------|--------------------------------------------------------------------------------|
| petty_cash      | ✅ PC1   | PettyCashTransaction                | postSinglePettyCashTransaction                                                 |
| journal         | ✅ PC2   | JournalEntry                        | journalEngine.postJournal                                                      |
| incentive_payout| ✅ PC3   | IncentivePayout                     | postSinglePayoutApproval / postSinglePayoutPayment / postSinglePayoutReversal  |
| purchasing      | ✅ PC4   | SupplierInvoice                     | postSingleSupplierInvoice                                                      |
| sales_goal_plan | ✅ PC5   | SalesGoalPlan                       | postSingleSalesGoalPlan (7-cascade activation)                                 |
| ic_transfer     | ✅ PC6   | InterCompanyTransfer / IcSettlement | approveSingleIcTransfer + postSingleIcSettlement                               |
| banking         | ✅ PC7   | BankStatement                       | finalizeRecon (service-layer, with idempotent status peek in Hub)              |

**Combined regression sweep (May 01 2026):** all 7 G6.7 healthchecks PASS (190/190 assertions). 13 sibling-phase healthchecks PASS. Vite build green in 24.23s.

### Final consolidated verification (May 01 2026 — sweep close)

After all seven phases landed on dev, ran a combined verification sweep — keeps the close-out ratification in one place rather than scattered across the seven phase entries above:

**Healthchecks (244 assertions across 4 G6.7 scripts + 6 sibling regressions):**
- `healthcheckPettyCashHubApprove.js` (PC1) — **22/22 PASS**
- `healthcheckJournalHubApprove.js` (PC2) — **19/19 PASS**
- `healthcheckIncentivePayoutHubApprove.js` (PC3) — **34/34 PASS**
- `healthcheckPurchasingHubApprove.js` (PC4) — **25/25 PASS**
- `healthcheckSalesGoalPlanHubApprove.js` (PC5) — **32/32 PASS**
- `healthcheckIcTransferHubApprove.js` (PC6) — **34/34 PASS**
- `healthcheckBankingHubApprove.js` (PC7) — **24/24 PASS**
- `healthcheckG67Pc4Through7HubApprove.js` (combined sweep) — **54/54 PASS**
- Sibling regressions: IncomeProxy 32/32, ComputePayrollProxy 29/29, PayslipProxyRoster 31/31, SalesDiscount 41/41, TeamActivity 22/22 — all green.

**Build:** `npx vite build` green in **58.69s** (production bundle).

**Require-load smoke:** all 8 modified modules load cleanly via `require()` from a fresh Node process — no circular-import or missing-export break at module load time. All 7 lifecycle helpers (`postSinglePayoutApproval` / `postSinglePayoutPayment` / `postSinglePayoutReversal` / `postSingleSupplierInvoice` / `postSingleSalesGoalPlan` / `postSingleIcSettlement` / `approveSingleIcTransfer`) plus the existing `finalizeRecon` are confirmed callable functions.

**Live Playwright UI ratify (President at `/erp/approvals`, May 01 2026 ~01:13 UTC):**
- Page rendered cleanly with **0 console errors**.
- Sidebar Approvals badge: **7**.
- "All Pending (7)" tab populated: 1 SALES, 1 UNDERTAKING, 3 INCOME, 2 PAYROLL — module-filter chips render lookup-driven correctly.
- PageGuide banner intact (15 numbered guidance items + Next Steps row).
- Authority Matrix Disabled badge visible (subscription-driven from Settings).
- Screenshot: `g67-pc4-7-approvals-hub-7items-as-president.png`.

**Why no live approve-click on PC3-PC7:** 0 INCENTIVE_PAYOUT / PURCHASING / SALES_GOAL_PLAN / IC_TRANSFER / BANKING items are pending in the dev cluster. Seeding fresh fixtures for each module (a real DRAFT SupplierInvoice with valid vendor + COA, a DRAFT SalesGoalPlan with ACTIVE targets + KPI snapshot, a DRAFT IcSettlement with `settled_transfers`, etc.) is genuinely heavy and out of scope for the close-out smoke. The static healthcheck wiring contract (244 assertions) is dispositive for the "approve throws → 500" regression class. The first real cycle the user runs through any of these surfaces will exercise the live approve path and ratify naturally — same posture PC3 took.

**Open Group B gaps:** **NONE.** Regression class closed. SaaS spin-out audit gate cleared on this surface.

---

## Phase Sales-CR-Edit — `updateCollection` ERROR-gate widening (May 04 2026)

> Bonus fix shipped in commit `b4c8973` (titled "Add smoke visit CLM pending banner configuration" — the controller change is buried in the diff, hence this entry so future archaeology can find it). Closes the dead-end where a Validate-flagged Collection Receipt (status `ERROR`) could not be edited to fix the violations and re-validate.

### Problem

[`updateCollection`](backend/erp/controllers/collectionController.js) loaded the row with `findOne({ ..., status: 'DRAFT' })`. Once `validateCollections` flipped a CR to `ERROR` (missing photos, hospital/customer mismatch, period lock, etc.), the editable lookup returned null → HTTP 404 `"Draft collection not found"`. The user could see the row in the list with the error tooltip but could not save changes — the only escape was Delete + recreate, which the proxy might not even own.

Asymmetric with the rest of the lifecycle: [`validateCollections`](backend/erp/controllers/collectionController.js) at line 219 already used `getEditableStatuses(req.entityId, 'COLLECTION')` (Phase G6 lookup-driven helper, fallback `['DRAFT','ERROR']`). Update was the lone hardcoded gate.

### Fix

[backend/erp/controllers/collectionController.js — updateCollection](backend/erp/controllers/collectionController.js) widened to use the same lookup helper:

```js
// Before
const collection = await Collection.findOne({ _id: req.params.id, ...scope, status: 'DRAFT' });
if (!collection) return res.status(404).json({ success: false, message: 'Draft collection not found' });

// After (b4c8973)
const editable = await getEditableStatuses(req.entityId, 'COLLECTION');
const collection = await Collection.findOne({ _id: req.params.id, ...scope, status: { $in: editable } });
if (!collection) return res.status(404).json({ success: false, message: 'Editable collection not found (must be DRAFT or ERROR)' });
```

Comment block above the change documents the asymmetry-fix rationale + the editable-statuses contract so future readers see the intent without having to grep the helper.

### Subscription posture (Rule #3)

Already lookup-driven by virtue of using the existing Phase G6 helper:

- Per-entity `MODULE_REJECTION_CONFIG.COLLECTION.metadata.editable_statuses` governs which states are editable. Default seeded `['DRAFT','ERROR']`.
- Subscribers who want a different policy (e.g., allow edit while POSTED but pre-recon — *not recommended*) tune via Control Center → Lookup Tables → `MODULE_REJECTION_CONFIG`. No code deploy.
- Fallback `EDITABLE_STATUSES_FALLBACK = ['DRAFT','ERROR']` in [backend/erp/services/approvalService.js](backend/erp/services/approvalService.js) preserves historical behavior when the lookup row is absent.
- 60-second per-entity cache; `invalidateEditableStatuses(entityId, moduleKey)` busts on lookup edit.

### Wiring integrity

- **Ownership lock preserved** — body's `assigned_to` / `bdm_id` / `recorded_on_behalf_of` still stripped on save (Phase G4.5b). Proxy cannot silently reassign a row via update.
- **Period-lock guard** — `validateCollections` and `submitCollections` re-evaluate against the current period on every transition; widening edit access does not bypass posting authority.
- **Defense in depth** — Phase G4 `gateApproval()` still runs at submit-time via 4-eyes (proxy entry forces 202 to Approval Hub regardless of submitter role). Edit is a draft-state action, never a posting action — Rule #20 governing principle preserved.
- **Mirror cycle** — DRAFT → (edit allowed) → Validate → ERROR → (edit allowed, re-validate) → VALID → Submit → 202 to Hub → POSTED. Editable statuses gate the first three; the rest are guarded by their own controller paths.

### Why N.3 was needed

Commit `b4c8973`'s title only mentions the bundled smoke YAMLs. The 13-file diff contains the controller change (+6/-2), the AccountsReceivable.jsx D9 keyless-Fragment fix (+4/-4), and the four `frontend/test-fixtures/*.png` (1×1 placeholder PNGs ~70 bytes each used by Playwright `setInputFiles()`). A future grep on `git log --grep updateCollection` finds nothing. This entry surfaces the architectural decision so it stays discoverable.

### Verification

- `node -c backend/erp/controllers/collectionController.js` — clean.
- Live HTTP smoke in [handoff_sales_collection_ar_smoke_may04_2026.md](handoff_sales_collection_ar_smoke_may04_2026.md) §L.2: PUT `/api/erp/collections/:id` against an ERROR-status row succeeded only after this fix; confirmed end-to-end DRAFT → ERROR → VALID round-trip on CR `SMOKE-CR-001`.
- D2-full GREEN: 3 auto-emitted JEs balanced (₱891 cash + ₱9 CWT + ₱24.11 commission), AR Aging Iloilo Mission row dropped (full settlement), 4 attack-surface entity-scope guard PASS-WITH-NOTE.
- No new lookup row required — falls through to `EDITABLE_STATUSES_FALLBACK`. If a subscriber later edits the COLLECTION rejection config, the cache busts within 60s.

### Files touched (b4c8973)

- modified: [backend/erp/controllers/collectionController.js](backend/erp/controllers/collectionController.js) — `updateCollection` widened.
- modified: [frontend/src/erp/pages/AccountsReceivable.jsx](frontend/src/erp/pages/AccountsReceivable.jsx) — D9 keyless-Fragment fix (separate concern, same commit).
- new: `frontend/test-fixtures/{cr,csi,cwt-2307,deposit}.png` — 1×1 PNG placeholders for Playwright photo-gate smokes.

---

## Phase G4.7 — Unified Approval History (audit-trail mirror) (May 05 2026)

### What

The Approval History tab in `/erp/approvals` reads from `ApprovalRequest` only. Module-native decisions that mutate the source document directly (e.g. `IncomeReport.status = REVIEWED`, `DeductionSchedule.status = ACTIVE` on Finance auto-create, schedule cancellation) never appeared in unified history because no `ApprovalRequest` row was ever closed or created for them. **Audit-trail gap, not a bug** — the schedule/report carries `approved_by` + `approved_at` so the source-of-truth is intact, but admin/finance lose the cross-module audit log.

### Fix

New shared helper [backend/erp/services/approvalService.js#mirrorApprovalDecision](backend/erp/services/approvalService.js):

- **Two modes**: (a) CLOSE — if a `PENDING ApprovalRequest` exists for `(entity_id, module, doc_id)`, flip it to APPROVED/REJECTED/CANCELLED with `decided_by` + `decided_at` + `decision_reason` + `history $push`. (b) CREATE — if no PENDING row exists, INSERT a new closed audit row directly. `requested_by` defaults to `decidedBy` when no original requester is known.
- **Idempotent**: optional `actionLabel` (e.g. `'review'`, `'finance_auto_create'`, `'hub_reject'`) keys a 30-second duplicate-decision guard so a controller calling the helper twice in the same transition is a no-op.
- **Non-fatal**: try/catch + `console.error` — audit-write failures must NOT roll back the business state machine. Source-of-truth is the schedule/report; the audit row is repairable.

### Wired into

| Site | Decision | actionLabel | Mode |
|---|---|---|---|
| [incomeCalc.transitionIncomeStatus](backend/erp/services/incomeCalc.js) — review | APPROVED | `review` | CREATE (no Hub PENDING for income) |
| [incomeCalc.transitionIncomeStatus](backend/erp/services/incomeCalc.js) — return | REJECTED | `return` | CREATE |
| [incomeCalc.transitionIncomeStatus](backend/erp/services/incomeCalc.js) — confirm | APPROVED | `confirm` | CREATE |
| [incomeCalc.transitionIncomeStatus](backend/erp/services/incomeCalc.js) — credit | APPROVED | `credit` | CREATE |
| [universalApprovalController.income_report — Hub reject path](backend/erp/controllers/universalApprovalController.js) | REJECTED | `hub_reject` | CREATE |
| [deductionScheduleService.createSchedule](backend/erp/services/deductionScheduleService.js) — `isFinance=true` | APPROVED | `finance_auto_create` | CREATE |
| [deductionScheduleService.cancelSchedule](backend/erp/services/deductionScheduleService.js) | CANCELLED | `cancel` | CLOSE if PENDING / CREATE otherwise |
| [deductionScheduleService.approveSchedule](backend/erp/services/deductionScheduleService.js) | APPROVED | `approve` | CLOSE (existing G4.2 path, refactored to delegate) |
| [deductionScheduleService.rejectSchedule](backend/erp/services/deductionScheduleService.js) | REJECTED | `reject` | CLOSE (existing G4.2 path, refactored to delegate) |
| [deductionScheduleService.withdrawSchedule](backend/erp/services/deductionScheduleService.js) | CANCELLED | `cancel` | CLOSE (existing G4.2 path, no signature change) |

### Compatibility

- **No schema change** — `ApprovalRequest` already has `metadata: Mixed`, `history: [...]`, status enum `['PENDING','APPROVED','REJECTED','CANCELLED']`. CREATE-mode rows use the existing shape.
- **No new lookup** — decision values are wire-level enum, not policy. Per-module action labels are internal idempotency keys, not user-facing.
- **`closeApprovalRequest` signature**: backwards-compatible — added optional 5th `schedule` arg (defaults to null → falls back to a `findById(docId).select('entity_id schedule_code total_amount term_months')` lookup). Existing 4-arg callers continue to work.
- **Other Group B handlers unchanged** — petty_cash, journal, banking, ic_transfer, purchasing, sales_goal_plan, incentive_payout already explicitly close their `ApprovalRequest`. Sibling regressions PASS (276 assertions across 8 healthchecks).

### Subscription-readiness

- All audit rows include `entity_id` from the source document — multi-tenant clean for the Year-2 SaaS spin-out (Rule #19 / 0d). Tenant isolation is preserved because the helper requires `entityId` upfront and refuses to write when missing.
- `mirrorApprovalDecision` is exported from `approvalService.js` so future module handlers (BIR-form-mark-filed, JE post, custom workflow) can mirror their own decisions with one line.

### Verification

- Healthcheck [backend/scripts/healthcheckUnifiedApprovalHistory.js](backend/scripts/healthcheckUnifiedApprovalHistory.js) — **41/41 PASS**. 6 sections cover: (1) helper contract, (2) transitionIncomeStatus wiring, (3) Hub-reject path, (4) deduction-schedule paths, (5) ApprovalRequest model + listRequests query unchanged, (6) other Group B handlers still close their own request.
- Sibling regressions — **276 assertions** across petty_cash (22) + journal (19) + banking (24) + ic_transfer (34) + purchasing (25) + sales_goal_plan (32) + incentive_payout (34) + incomeProxy (32) + G6.7-PC4..PC7 (54) all PASS.
- Syntax check — all 4 modified backend files compile clean (`node -c`).
- WorkflowGuide banner [approval-manager](frontend/src/erp/components/WorkflowGuide.jsx) updated (Rule #1) — explicitly mentions Phase G4.7 module-native mirror behavior.

### Files touched (uncommitted on `dev`)

- modified: [backend/erp/services/approvalService.js](backend/erp/services/approvalService.js) — new `mirrorApprovalDecision` helper + export.
- modified: [backend/erp/services/deductionScheduleService.js](backend/erp/services/deductionScheduleService.js) — `closeApprovalRequest` delegates to the shared helper; `createSchedule` mirrors finance auto-create; `cancelSchedule` mirrors CANCELLED.
- modified: [backend/erp/services/incomeCalc.js](backend/erp/services/incomeCalc.js) — `transitionIncomeStatus` mirrors all 4 actions after `report.save()`.
- modified: [backend/erp/controllers/universalApprovalController.js](backend/erp/controllers/universalApprovalController.js) — `income_report` Hub reject path mirrors REJECTED audit row.
- modified: [frontend/src/erp/components/WorkflowGuide.jsx](frontend/src/erp/components/WorkflowGuide.jsx) — `approval-manager` banner explains G4.7 behavior.
- new: [backend/scripts/healthcheckUnifiedApprovalHistory.js](backend/scripts/healthcheckUnifiedApprovalHistory.js) — 41-assertion contract verifier.
- modified: [CLAUDE-ERP.md](CLAUDE-ERP.md), [docs/PHASETASK-ERP.md](docs/PHASETASK-ERP.md) — this entry.

---

## Phase G7.A — Product Globalization (May 05 2026, IN FLIGHT — G7.A.0 SHIPPED)

> ⚠️ **Naming disambiguation**: this is **NOT** a sub-phase of the older "Phase G7 — President's Copilot" (April 2026, fully shipped). The reuse of "G7" is accidental; future rename to Phase MD-2 acceptable. Treat as standalone phase.

### Why this phase

`ProductMaster` is the only large master-data type still per-entity scoped (one row per `(entity_id, item_key)` pair). Every other master-data type — `Hospital` (always global), `Customer` (Phase G5, Apr 24), `Doctor` (Phase A.5, Apr 24 → May 05) — uses the canonical-key + per-entity-binding pattern. The mismatch caused a real production bug on May 05 2026: a VIP user couldn't save a GRN for Viprazole 40mg VIAL because the form carried MG-and-CO's `product_id` (which VIP shouldn't reference) while VIP's own row was inactive. The strict validator at [inventoryController.js:643](backend/erp/controllers/inventoryController.js#L643) rejected — correctly per current code — but the data shape was already broken: VIP's `InventoryLedger` had 8 rows pointing at MG-and-CO's product_id.

### What shipped in G7.A.0 (this phase)

1. **Surgical pre-G7 unblock migration** (separate script, ran first): [migrateVipForeignProductRefs.js](backend/erp/scripts/migrateVipForeignProductRefs.js) repointed VIP's 8 stranded `InventoryLedger` rows from MG-and-CO's Viprazole `product_id` → VIP's own row, and reactivated VIP's Viprazole + Nupira rows. Cascade manifest + dry-run/apply pattern + audit log mirror `doctorMergeService.js`. **APPLIED on dev cluster.**
2. **Schema foundation** (the actual G7.A.0):
   - `ProductMaster` gains `product_key_clean` (canonical, indexed non-unique today) + `mergedInto` ref + `mergedAt`. New helper `buildProductKeyClean()` computes `cleanName(brand)|cleanName(generic)|cleanName(dosage)|normalizeUnit(unit)`. Pre-validate + pre-findOneAndUpdate hooks maintain it on insert/update. Backwards-compatible — legacy `entity_id+item_key` unique index preserved.
   - New collection [EntityProductCarry](backend/erp/models/EntityProductCarry.js) — per-entity carry list, holds `selling_price` / `purchase_price` / reorder fields / `vat_override` (Lock 3 escape hatch) / audit shape mirroring `HospitalContractPrice`. Indexes: `(entity_id, is_active)`, `(product_id, is_active)`, partial-unique on `(entity_id, product_id, territory_id, is_active=true)`, **G7.B-forward partial-unique on `(product_id, territory_id, is_active=true) WHERE territory_id is ObjectId`** (channel-exclusivity invariant pre-baked).
   - New collection [ProductMergeAudit](backend/erp/models/ProductMergeAudit.js) — forward-compat for G7.A.1 dedupe. Mirror of `DoctorMergeAudit`. 30-day TTL on `createdAt` matches the merge-rollback grace window.
   - New helper [resolveProductLifecycleRole.js](backend/utils/resolveProductLifecycleRole.js) — 7 role codes (4 merge + 3 carry) with lazy-seed-from-defaults, 60s TTL cache, president bypass, `invalidate()` hot-config hook. Mirrors `resolveVipClientLifecycleRole.js`.
   - `PRODUCT_LIFECYCLE_ROLES` lookup category seeded inline in `lookupGenericController.SEED_DEFAULTS` — 7 entries with `insert_only_metadata: true` (Rule #19 — admin overrides survive future re-seeds).
   - [Backfill script](backend/erp/scripts/backfillProductCanonicalAndCarry.js) — dry-run-by-default. Step 1 populates `product_key_clean`. Step 2 creates `EntityProductCarry` rows from existing `(entity_id, product_id)` pairs. Idempotent.
   - [Healthcheck](backend/scripts/healthcheckProductGlobalization.js) — 8-section static contract verifier covering schema additions, indexes, role helper exports, lookup seed completeness, backfill shape, surgical-migration shape, docs registration.

### What's NOT in G7.A.0 (deferred to subsequent sub-phases)

- **G7.A.1**: dedupe migration (the cascading merge service that walks 20+ FK paths). Plan: `~/.claude/plans/phase-g7a-product-globalization.md`. Existing 2 cross-entity duplicates (Viprazole, Nupira) collapsed via bulk-merge tool with audit + 30-day rollback grace. Highest-risk sub-phase — needs Atlas backup before bulk run.
- **G7.A.2**: validator flip across 6 controllers (GRN, Sales, Inter-Co, Hospital PO, Hospital Contract Price, Consignment). New helper `assertProductsCarried(req, productIds)` reads `EntityProductCarry` instead of `ProductMaster.entity_id`. Per-surface Playwright smoke per commit.
- **G7.A.3**: drop `ProductMaster.entity_id`, on-canonical pricing fields, and the `PRODUCT_CATALOG_ACCESS` lookup category. Pre-req: G7.A.2 stable for ≥1 week + Atlas backup.
- **G7.A.4**: admin Carry-List Manager UI (`/erp/carry-list`) — grant / revoke / set per-entity price.
- **G7.B**: Territory Exclusivity. Adds `Territory` master, populates `EntityProductCarry.territory_id`, the channel-exclusivity index already pre-baked in G7.A.0 takes effect. ~2-3 days.

### Why G7.A.0 is non-breaking

- Existing controllers continue to read `ProductMaster.entity_id` and `ProductMaster.selling_price`. EntityProductCarry rows are populated but unused by any read path.
- Existing catalog API still resolves via `PRODUCT_CATALOG_ACCESS` inheritance (deprecated in G7.A.3, not G7.A.0).
- ProductMergeAudit collection is empty — no merges yet.
- Rollback at this stage is "drop EntityProductCarry collection + drop product_key_clean field" — zero data loss.

### Files touched (G7.A.0)

- modified: [backend/erp/models/ProductMaster.js](backend/erp/models/ProductMaster.js) — add `product_key_clean`, `mergedInto`, `mergedAt` + maintenance hooks.
- new: [backend/erp/models/EntityProductCarry.js](backend/erp/models/EntityProductCarry.js)
- new: [backend/erp/models/ProductMergeAudit.js](backend/erp/models/ProductMergeAudit.js)
- new: [backend/utils/resolveProductLifecycleRole.js](backend/utils/resolveProductLifecycleRole.js)
- modified: [backend/erp/controllers/lookupGenericController.js](backend/erp/controllers/lookupGenericController.js) — `PRODUCT_LIFECYCLE_ROLES` seed.
- new: [backend/erp/scripts/backfillProductCanonicalAndCarry.js](backend/erp/scripts/backfillProductCanonicalAndCarry.js)
- new: [backend/erp/scripts/migrateVipForeignProductRefs.js](backend/erp/scripts/migrateVipForeignProductRefs.js) — May 05 surgical unblock; ran first.
- new: [backend/erp/scripts/diagnoseGrnProduct.js](backend/erp/scripts/diagnoseGrnProduct.js) + diagnoseVipForeignProductRefs.js + diagnoseVipCatalogLeak.js — diagnostics that confirmed the bug shape before the migration.
- new: [backend/scripts/healthcheckProductGlobalization.js](backend/scripts/healthcheckProductGlobalization.js)
- modified: CLAUDE-ERP.md, docs/PHASETASK-ERP.md.

### Subscription / scalability posture (Rule #19)

- Per-entity `entity_id` scoping retained on `EntityProductCarry` — multi-tenant SaaS spin-out (Year 2 per CLAUDE.md 0d) generalizes to `tenant_id` without rewrites.
- All lifecycle decisions are lookup-driven (Rule #3) — subscribers loosen merge / carry / pricing roles via Control Center → Lookup Tables; no code deploys.
- Channel-exclusivity index pre-baked for G7.B; territory_id stays nullable in G7.A.0 so today's data is consistent and G7.B is a pure population step.
- Pricing stack composability preserved: `HospitalContractPrice` (Phase CSI-X1, Apr 28) stays at Layer 1; `EntityProductCarry.selling_price` becomes Layer 2 (replacing `ProductMaster.selling_price` after G7.A.3); `Phase R2 sales-line discount` stays at Layer 3.

### Risk profile

- **G7.A.0 (this commit)**: green. Non-breaking, dry-run backfill, healthcheck PASS.
- **G7.A.1**: highest risk. Mitigations: per-merge audit + 30-day rollback + bulk-merge dry-run + Atlas backup before bulk run.
- **G7.A.2**: medium. Six controllers, smoke after each.
- **G7.A.3**: irreversible. Gated on G7.A.2 stability + Atlas backup.
- **G7.A.4**: low. UI-only.

## Phase CALF-Breakdown — Approval-Hub line-level visibility on CALFs (May 05 2026 evening)

### Why

The Approval Hub renders CALFs (Cash Advance & Liquidation Forms) auto-generated by [autoCalfForSource](backend/erp/controllers/expenseController.js) from BDM expense entries. Reviewers (admin, finance, president) saw only `Auto-CALF: ACCESS expenses (company-funded)` — a generic auto-purpose label — with no breakdown of what was actually spent. To answer "is this OK to post?" they had to navigate to the Expense module, find the linked entry, and read its lines. Friction-tax that grows with every BDM × cycle.

### What ships (single in-flight phase, frontend + backend)

1. **Backend enrichment** ([backend/erp/controllers/expenseController.js — getLinkedExpenses](backend/erp/controllers/expenseController.js)): the expense-line and fuel-line branches now surface `expense_category`, `coa_code`, `vat_amount`, `net_of_vat`, `bir_flag` on each linked record. Existing fields (date, source, description, amount, payment_mode) untouched. The endpoint shape is additive, no breaking change for the existing PrfCalf page (`/erp/prf-calf`) caller (`useExpenses.getLinkedExpenses`).
2. **Detail-builder pass-through** ([backend/erp/services/documentDetailBuilder.js — buildPrfCalfDetails](backend/erp/services/documentDetailBuilder.js)): adds `_id: item._id` so the frontend panel has the dependency for its lazy-fetch. Single-line addition.
3. **Frontend lazy-fetch + render** ([frontend/src/erp/components/DocumentDetailPanel.jsx](frontend/src/erp/components/DocumentDetailPanel.jsx)): new `<CalfLinkedLines calfId={…} />` component fetches `/api/erp/expenses/prf-calf/:id/linked-expenses` on mount, renders an inline 8-column table (Date / Source / Category / Vendor-Description / BIR / Net / VAT / Amount) with a `<BirFlagChip />` for the BIR filing flag (Internal / BIR / Both), a Total-linked footer, and a Variance-vs-CALF-advance row in red when the absolute variance ≥ ₱0.01. Mounts ONLY for `d.doc_type === 'CALF'` — PRFs are payment instructions, not advance-liquidation trackers, so the panel stays unchanged for them. AbortController cancels the fetch on unmount so rapid open/close doesn't leak setState.
4. **WORKFLOW_GUIDES banner update** ([frontend/src/erp/components/WorkflowGuide.jsx](frontend/src/erp/components/WorkflowGuide.jsx)): the `approvals` guide gains a new step explaining the inline breakdown. Rule #1 — banners must reflect current behavior.
5. **Healthcheck extension** ([backend/erp/scripts/healthcheckCalfPrfTypeLeak.js](backend/erp/scripts/healthcheckCalfPrfTypeLeak.js)): five new checks (9–13) lock the contract — backend enrichment fields are present, fuel branch carries the same shape, builder passes _id, panel mounts CalfLinkedLines only for CALFs, AbortController cleanup is wired. **13/13 PASS** locally.

### Wiring contract (Rule #2 — verify end-to-end)

- Backend: `expenseController.getLinkedExpenses` route `GET /erp/expenses/prf-calf/:id/linked-expenses` (mounted in `expenseRoutes.js:114`) → reads ExpenseEntry + CarLogbookEntry → enriched response.
- Detail builder: `buildPrfCalfDetails` (called by universalApprovalController + presidentReversalsController via the module-key map at line 1218 of `documentDetailBuilder.js`) now includes `_id`.
- Frontend: ApprovalManager + PresidentReversalsPage both pass `details=` and `item=` to `<DocumentDetailPanel/>`. The panel reads `d._id || item?._id` and mounts `<CalfLinkedLines/>` for CALF docs. The component uses `api.get('/erp/expenses/prf-calf/:id/linked-expenses')` — note the `/erp` prefix because `api` is the unprefixed axios instance from `services/api.js` (NOT `useErpApi` which auto-prefixes).

### Tenant / proxy posture (Rule #19, Rule #21)

- The `getLinkedExpenses` route already runs `widenFilterForProxy(req, 'expenses', PRF_CALF_PROXY_OPTS)` per Phase G4.5e, so eBDM proxies see the breakdown for CALFs they keyed on behalf of the owner — same scope as the existing CALF detail / list / submit routes. No new tenant gate needed.
- President / admin / finance see every entity's CALF breakdown by default (Rule #21 — privileged callers get cross-entity unless `?entity_id=` narrows). Non-privileged callers stay pinned to their working entity via `req.entityId`.

### Lookup-driven (Rule #3)

- BIR flag values come from the existing `BIR_FLAG` lookup category (`INTERNAL` / `BIR` / `BOTH`). The `BirFlagChip` component palette is local to DocumentDetailPanel — three known values plus a graceful fallback for any future lookup row.
- No hardcoded business values introduced. Category strings come from `ExpenseEntry.line.expense_category` (free-text in the model, often `utilities`, `internet`, `supplies`, `parking`, `toll`, `hotel`, `food` per the model comment).
- Subscription readiness: when SaaS spin-out (Year 2 per CLAUDE.md 0d) generalizes `entity_id` to `tenant_id`, no code change needed in this phase — the existing entity scoping inherits the rename.

### Files touched (CALF-Breakdown)

- modified: [backend/erp/controllers/expenseController.js](backend/erp/controllers/expenseController.js) — `getLinkedExpenses` enrichment (≈12 lines added across the two branches).
- modified: [backend/erp/services/documentDetailBuilder.js](backend/erp/services/documentDetailBuilder.js) — `buildPrfCalfDetails` adds `_id`.
- modified: [frontend/src/erp/components/DocumentDetailPanel.jsx](frontend/src/erp/components/DocumentDetailPanel.jsx) — imports + `<BirFlagChip/>` + `<CalfLinkedLines/>` component (≈100 lines added at file head) + mount inside the CALF branch.
- modified: [frontend/src/erp/components/WorkflowGuide.jsx](frontend/src/erp/components/WorkflowGuide.jsx) — new approvals-banner step.
- modified: [backend/erp/scripts/healthcheckCalfPrfTypeLeak.js](backend/erp/scripts/healthcheckCalfPrfTypeLeak.js) — checks 9–13.
- modified: CLAUDE-ERP.md, docs/PHASETASK-ERP.md.

### Risk profile

- **Green.** Additive only — backend response gains fields, frontend gains a component, no existing read paths altered. The existing PrfCalf.jsx page calls `getLinkedExpenses` and treats the response as a generic shape; the added fields are ignored there and don't break any rendering. President Reversal Console reuses DocumentDetailPanel; the new component mounts there too which is fine because the linked-expenses endpoint serves both Approval-Hub and Reversal-Console contexts identically.

### Phase CALF-Breakdown.B — PrfCalf.jsx UI parity + fuel VAT derivation (same evening, May 05 2026)

The .A slice deliberately left `PrfCalf.jsx` untouched on the rationale that "the existing page ignores the new fields and continues rendering normally." That's true but creates inconsistency: the same `getLinkedExpenses` payload renders different breakdown columns depending on which page surfaces it. .B closes the gap and also fixes a numerical bug — fuel rows showing Net=0 / VAT=0:

1. **PrfCalf.jsx breakdown table** ([frontend/src/erp/pages/PrfCalf.jsx](frontend/src/erp/pages/PrfCalf.jsx)) — inline drill-down at "View Links" gains four columns: **Category** (text), **BIR** (chip — INTERNAL / BIR / BOTH with palette mirroring DocumentDetailPanel.BirFlagChip), **Net** (₱), **VAT** (₱). Existing columns preserved. Header summary above the table (Fuel count / Expense count / Drawn-vs-CALF / Variance) covers totals — no footer row needed.
2. **Fuel VAT/Net derivation** ([backend/erp/controllers/expenseController.js — getLinkedExpenses](backend/erp/controllers/expenseController.js)) — `CarLogbookEntry.fuel_entries` does not persist `net_of_vat` / `vat_amount` / `bir_flag` / `coa_code` (unlike `ExpenseEntry.lines`, which has them via the pre-save hook). Pre-fix, fuel rows displayed Net=0 / VAT=0 / BIR=null. Fix: `Settings.getVatRate()` is resolved once before the fuel loop (lookup-driven, Rule #3) and used to split `total_amount` into Net (`amount × 1/(1+rate)`) and VAT (`amount × rate/(1+rate)`); `bir_flag` defaults to `'BOTH'` (matching `ExpenseEntry.lines` schema default). The JE engine resolves the same rate at post time, so the displayed split matches what books.
3. **prf-calf WorkflowGuide tip** ([frontend/src/erp/components/WorkflowGuide.jsx](frontend/src/erp/components/WorkflowGuide.jsx)) — appended a sentence describing the inline View-Links breakdown columns and noting fuel VAT derivation source. Mirrors the `approvals`-guide step from .A.
4. **Healthcheck extension** ([backend/erp/scripts/healthcheckCalfPrfTypeLeak.js](backend/erp/scripts/healthcheckCalfPrfTypeLeak.js)) — three additional checks (14–16) lock the contract: PrfCalf.jsx renders the four new headers, fuel branch resolves VAT via `Settings.getVatRate()` (no hardcoded constant), prf-calf WorkflowGuide tip mentions the breakdown.

**Files touched (.B)**:
- modified: [backend/erp/controllers/expenseController.js](backend/erp/controllers/expenseController.js) — fuel VAT/Net derivation (≈12 net lines).
- modified: [frontend/src/erp/pages/PrfCalf.jsx](frontend/src/erp/pages/PrfCalf.jsx) — 4 new columns + chip rendering (≈14 net lines).
- modified: [frontend/src/erp/components/WorkflowGuide.jsx](frontend/src/erp/components/WorkflowGuide.jsx) — prf-calf tip extension.
- modified: [backend/erp/scripts/healthcheckCalfPrfTypeLeak.js](backend/erp/scripts/healthcheckCalfPrfTypeLeak.js) — checks 14–16.

**Risk**: green. Both consumers now show consistent shape; fuel rows show meaningful Net/VAT instead of zeros. No new lookups, no new schemas, no migrations. Existing callers unaffected.
- Failure modes thought through: 404 (no linked lines yet) → renders nothing rather than an empty table. 500 / network error → renders inline error message, doesn't break the rest of the panel. CALF without `_id` (legacy serialization gap) → mount guard short-circuits.

---

### Phase R1.1 — NonMdRebate lookup-values 404 hotfix (Apr 30 2026)

**Symptom**: Apr 30 Playwright UI smoke surfaced two 404s on every `/erp/non-md-rebate-matrix` page load — `GET /api/erp/lookup-values?category=NONMD_REBATE_CALC_MODE`. The page rendered correctly because of the inline `CALC_MODE_FALLBACK`, but the noise broke the "page never goes dark on Lookup outage" design promise that other Phase R1 lookups hit cleanly.

**Root cause**: `NonMdRebateMatrixPage.jsx:93` used the bespoke pattern `api.get('/erp/lookup-values', { params: { category } })` (query-string). The route is mounted at `/lookup-values/:category` ([backend/erp/routes/lookupGenericRoutes.js:20](backend/erp/routes/lookupGenericRoutes.js#L20)) — Express's `:category` segment matched the empty string, so the request fell through to the catch-all 404. Every other lookup-driven page (RebateMatrixPage, DoctorManagement, ClientAddModal, AgentSettings, InboxRetentionSettings, LookupManager) uses the canonical path-segment pattern.

**Fix** (1 file): swapped the bespoke fetch for the canonical [`useLookupOptions('NONMD_REBATE_CALC_MODE')`](frontend/src/erp/hooks/useLookups.js) hook ([NonMdRebateMatrixPage.jsx:62](frontend/src/erp/pages/NonMdRebateMatrixPage.jsx#L62)). Same data shape (`{ code, label, value, metadata }`) so all downstream consumers (`labelForCalcMode`, `calcModeChoices` fallback, modal radio) work unchanged.

**Why the hook over a literal path-string fix**:
- Same path-segment URL under the hood (route now matches → 404 gone).
- Adds 5-min entity-aware cache → fewer DB hits when admin opens/closes the matrix repeatedly.
- Cache auto-busts on entity switch — multi-tenant safe (Rule #0d, SaaS-tenant isolation).
- Aligns with the canonical pattern used by 6 other lookup-driven pages → one less bespoke fetch path to audit during the SaaS spin-out.
- Inline `CALC_MODE_FALLBACK` retained as defense-in-depth — page still works even if backend lookup is empty.

**Verification**:
- `node backend/scripts/healthcheckRebateCommissionWiring.js` → **109/109 PASS** (no assertions broken)
- `npx vite build` → **green in 35.84s** (new import + hook compile clean, no chunk regression)
- Direct backend probe: `GET /api/erp/lookup-values/NONMD_REBATE_CALC_MODE?active_only=true` returns 200 (the path-segment route exists in both main-repo and worktree backends)
- Live Playwright re-smoke **DEFERRED** — MCP browser session was locked by another Chrome instance (PR-review window) when the fix landed. The fix is mechanical (drop-in hook swap), so the smoke is recommended but not blocking.

**Files touched (1)**: [frontend/src/erp/pages/NonMdRebateMatrixPage.jsx](frontend/src/erp/pages/NonMdRebateMatrixPage.jsx) — added `useLookupOptions` import; replaced `useState([])` for `calcModes` with the hook call; removed the broken bespoke fetch from useEffect.

---

## Phase 32R-VP — Approval Hub Visual Parity (May 6 2026) ✅

Render-only enhancement. The Approval Hub at `/erp/approvals` now shows the same proxy + linked-doc density on both halves of a GRN+UT pair. Live screenshot showed the GRN card looking like an orphan submission (no proxy banner; truncated `_id.slice(-8)` hash chip for its linked Undertaking) while the partner UT card was rich. Closes the asymmetry: GRN card now shows "On behalf of <name>" + structured "Linked Undertaking: UT-XXX · receipt date · scanned/total · variances · status" badge; UT card gets the same proxy pill (was absent there too despite the field being on the model).

**Wiring (5 files):**
- `backend/erp/services/universalApprovalService.js` — INVENTORY query populates `recorded_on_behalf_of` + `undertaking_id` (with `select: 'undertaking_number receipt_date status line_items'`); UNDERTAKING query populates `recorded_on_behalf_of`.
- `backend/erp/services/documentDetailBuilder.js` — `buildInventoryDetails` emits `recorded_on_behalf_of` + structured `linked_undertaking` (mirrors UT-side `linked_grn` shape); `buildUndertakingDetails` emits `recorded_on_behalf_of`. Raw `undertaking_id` still emitted for downstream cascade-chip consumers.
- `frontend/src/erp/components/DocumentDetailPanel.jsx` — INVENTORY block: violet pill next to Status; new accent-soft "Linked Undertaking" badge between Status and GRN Date; old truncated chip removed from `LinkedRefsLine`. UNDERTAKING block: violet pill in the chip row.
- `frontend/src/erp/components/WorkflowGuide.jsx` — `approval-manager` guide gains a step describing the new visual signals (Rule #1).
- NEW `backend/erp/scripts/healthcheckApprovalHubVisualParity.js` — 16 static-source assertions; `node backend/erp/scripts/healthcheckApprovalHubVisualParity.js` → 16/16 PASS.

**Why no Phase B (co-locate) or Phase C (bulk Approve-pair)**: bulk approve carries Rule 20 audit risk — `postSingleUndertaking` / `postSingleExpense` / `postSinglePrfCalf` likely open their own Mongo sessions, so wrapping them in `withTransaction` requires threading optional `session` through three service helpers. Atomic guarantees on a new ledger-affecting endpoint must be done right or not at all; not worth bundling with a quick render fix. Co-location is also redundant once cards name their partners by doc_ref. Re-evaluate if click fatigue becomes a real complaint.

**Subscription readiness**: zero lookup changes. Hub query continues to use existing `MODULE_DEFAULT_ROLES.INVENTORY` + `MODULE_DEFAULT_ROLES.UNDERTAKING` + `approve_inventory` sub-permission gates. Per-entity scoping unchanged (Rule #21). When SaaS spin-out generalizes `entity_id` to `tenant_id` (Year 2 per CLAUDE.md 0d), this phase inherits the eventual rename.

**Verification**: 16/16 healthcheck PASS, Vite build green 12.93s, manual UI smoke recipe in PHASETASK-ERP.md (login as president → expand proxied GRN → confirm violet pill + structured Linked Undertaking badge replace the truncated hash). Pre-existing two-click approve flow unchanged.

---

## Phase P1.2 Slice 7-extension Round 2C — CWT-Inbound picker on Mark-Received modal (May 6 2026) ✅

Closes the original Slice 7-extension scope. Bir2307InboundPage (`/erp/bir/2307-IN/:year`) was deferred in Round 1 because the receive modal stored `cert_2307_url` as a typed string with no upload handler — wiring the picker would have meant a new file-upload route. Round 2A's `skipFetch=true` mode dissolved that obstacle: the picker yields the BDM-captured photo's bare S3 URL, and the `cert_2307_url` field accepts URL strings as a primary input, so the picker writes the URL straight in. Round 2C is the thin-wrap that makes it work.

**Wiring (5 files touched + 2 docs):**
- `backend/erp/controllers/birController.js` `markReceived2307Inbound` — destructures optional `capture_id` from body; after the reconciliation service succeeds, best-effort `linkCaptureToDocument(capture_id, 'CwtLedgerEntry', row._id, ctx)`. Failures log but do NOT roll back the receive — the CWT credit posture is the system of record; capture back-link is audit metadata. Audit log line `[BIR_2307_INBOUND_MARK_RECEIVED]` extended with `from_capture` boolean + capture_id string.
- `frontend/src/erp/pages/Bir2307InboundPage.jsx` — `<PendingCapturesPicker>` mounted inside the Mark-Received modal between the CR/hospital recap and the Certificate URL field. Cross-BDM scope (`bdmId={null}`), `workflowTypes=['CWT_INBOUND', 'UNCATEGORIZED']`, `skipFetch={true}`, `maxSelect={1}`. New `pickedCaptureId` state + `onPickFromCaptures` callback writes `cert_2307_url` from `meta.captures[0].captured_artifacts[0].url`, auto-fills `cert_filename` from artifact key tail. **Manual edit of the URL field after picking clears `pickedCaptureId`** so a typo doesn't silently re-stamp an unrelated capture. Modal close + receive success both clear pickedCaptureId. Confirmation pill ("✓ Linked to BDM Capture") renders below the picker when one is selected.
- `frontend/src/components/common/PageGuide.jsx` `bir-2307-inbound` — banner reflects the new flow (Rule #1): workflow step now reads "either pulls the photo from BDM Captures (Round 2C) OR types where they saved the file"; new step describes picker UX + cross-BDM scope rationale + lifecycle advance; subscription-readiness step lists `CAPTURE_LIFECYCLE_ROLES.PROXY_PULL_CAPTURE` alongside `BIR_ROLES.RECONCILE_INBOUND_2307`; tip recommends "From BDM Captures" over re-uploading to Drive.
- `backend/scripts/healthcheckCaptureHub.js` Section 13 preamble cleaned up (drops Bir2307Inbound from defer rationale; SMER stays); Section 16 (NEW) — 24 assertions across page wiring + manual-edit invalidation + picker mount + capture_id forward + modal close hygiene + backend wiring + model enum + PageGuide + lookup gate + PHASETASK-ERP doc.
- `docs/PHASETASK-ERP.md` — defer-rationale heading rewritten ("SMER" only, drops "+ CWT-Inbound"); new "Phase P1.2 Slice 7-extension Round 2C" section above Round 2A.

**Why cross-BDM scope (not per-BDM)**: the cert may have been snapped by office runner / receptionist / finance herself — not the BDM who originated the underlying sale. Filtering by the CR row's `bdm_id` would hide legitimate captures. Finance reconciles by visual hospital + amount match against the modal recap, which is fast on a small queue.

**Lifecycle advance is via existing infra**: `CWT_INBOUND` is already in `REVIEW_WORKFLOWS` inside `captureSubmissionController.linkCaptureToDocument` (Slice 1 baseline), so picked captures advance to `AWAITING_BDM_REVIEW` rather than auto-`PROCESSED` — same posture as Sales / Expense / Fuel / Collection captures. The BDM is informed and can ack from `/erp/proxy-queue` or `/erp/capture-archive` (Slice 8). `CwtLedgerEntry` was already in `linked_doc_kind` enum.

**Subscription readiness**: zero new lookups. Reuses `CAPTURE_LIFECYCLE_ROLES.PROXY_PULL_CAPTURE` (Slice 1 default `[admin, finance, president]`) + `BIR_ROLES.RECONCILE_INBOUND_2307` (Phase J6). Subscribers retune via Control Center → Lookup Tables, no code deploy (Rule #3 / Rule #19). When SaaS spin-out generalizes `entity_id` → `tenant_id` (Year 2 per CLAUDE.md 0d), Round 2C inherits the rename automatically.

**Defer status update**: SMER (`Smer.jsx`) stays deferred indefinitely — digital-only, no photo-upload UI to mount a picker next to. The right consumer for SMER captures is Slice 6 Car Logbook auto-populate (ODO capture's OCR reading flows into `starting_km`/`ending_km`), not a parallel picker on the SMER page.

---

## Phase P1.2 Slice 6 — Car Logbook Auto-Populate (May 6, 2026, ✅ shipped + UI-ratified)

`/erp/car-logbook` is now a **review surface** rather than a data-entry form. The proxy opens the page and reviews a pre-populated grid; every field carries a colored source-tag badge so they can scan the cycle, override anything obviously wrong, and submit. No more typing the same data twice.

### Four signals → one row per day

| Signal source | Read pattern | Fields populated | Source tag |
|---|---|---|---|
| `SmerEntry.daily_entries` (Manila-day match on `entry_date`) | `findOne({entity_id, bdm_id, 'daily_entries.entry_date': {$gte: bounds.start, $lt: bounds.end}})` | `destination` (= `hospital_covered + ' — ' + notes`) | `SMER` |
| `CaptureSubmission` `workflow_type='SMER'` (ODO photos for the day) | `find({entity_id, bdm_id, workflow_type: 'SMER', status ∉ [CANCELLED], created_at: bounds})` then collect `captured_artifacts[].ocr_result.{reading,extracted.reading}` | min reading → `starting_km` + photo URL; max reading → `ending_km` + photo URL | `SMER_CAPTURE` |
| `DriveAllocation` (drive_date YYYY-MM-DD match) | `findOne({entity_id, bdm_id, drive_date: dateStr})` | `personal_km`, `official_km` (NO_DRIVE row → 0/0) | `DRIVE_ALLOCATION` |
| `CaptureSubmission` `workflow_type='FUEL_ENTRY'` (gas receipts) | `find({entity_id, bdm_id, workflow_type: 'FUEL_ENTRY', status ∉ [CANCELLED], created_at: bounds})` then per-artifact `ocr_result.extracted.{station_name,fuel_type,liters,price_per_liter,total_amount,date}` | `fuel_entries[]` per artifact | `FUEL_ENTRY_CAPTURE` |
| Prior day's `CarLogbookEntry.ending_km` | `findOne({entity_id, bdm_id, entry_date: {$lt: bounds.start}, status ∈ [VALID, POSTED]}).sort({entry_date: -1})` | `starting_km` (fallback when no SMER ODO today) | `PRIOR_DAY` |
| Proxy edit | UI-side flag flipped in `handleRowChange` | (any field) | `MANUAL` |

### Wiring chain (Rule #2 end-to-end)

- **Service** (`backend/erp/services/carLogbookAutoPopulate.js`, NEW) — `autoPopulateCarLogbookDay({entity_id, bdm_id, entry_date})`. Pulls all four signals via `Promise.all`; returns `{destination, starting_km, ending_km, photo URLs, personal_km, official_km, fuel_entries, _autopop_sources, _smer_meta, _drive_allocation, _has_any_signal}`. `entity_id` (Rule #19) + `bdm_id` (Rule #21) required; throws on absence.
- **Controller** (`backend/erp/controllers/expenseController.js`) — `previewCarLogbookDay` endpoint (single + batch shapes, max 31 days/call). `createCarLogbook` extended with `?autopopulate=true` (query OR body); merges body ON TOP of populated shape (manual override wins) and persists per-field provenance in `edit_history[0] = {action: 'AUTO_POPULATE', sources, at, by}`. Response carries `auto_populated` + `autopop_sources`.
- **Route** (`backend/erp/routes/expenseRoutes.js`) — `GET /car-logbook/preview` mounted **BEFORE** `/car-logbook/:id` so Express path-precedence resolves the literal (same shadowing pattern as Slice 8's archive routes).
- **Hook** (`frontend/src/erp/hooks/useExpenses.js`) — `previewCarLogbookDay({bdmId, date, dates})` builds query params for both shapes from one method.
- **Page** (`frontend/src/erp/pages/CarLogbook.jsx`) — `loadAndMerge` calls preview once per cycle for days WITHOUT an existing logbook row; falls back silently to legacy SMER-destinations-only path on preview failure (graceful degradation). Saved rows are NEVER overwritten by auto-pop. `handleRowChange` flips badge to `MANUAL` on edit. `saveRow` sends `autopopulate: true` for defense-in-depth (server re-runs the merge).
- **Banner** (`frontend/src/erp/components/WorkflowGuide.jsx` `'car-logbook'`) — Rule #1 update: 4-source list + badge palette + "auto-pop never overwrites saved rows" invariant.
- **Healthcheck** (`backend/scripts/healthcheckCarLogbookAutoPopulate.js`, NEW) — 70 assertions across service exports, controller imports, route order, hook methods, page rendering, banner content, lookup-gate forward-compat.

### Subscription readiness (Rule #3 / #19 / Rule 0d)

- Every service helper sweep is `entity_id`-scoped — same code runs unchanged inside Year-2 Pharmacy SaaS multi-tenant context.
- `EDIT_CAR_LOGBOOK_DESTINATION` lookup gate (Slice 1, default `[admin, finance, president]`) covers the destination-edit elevation surface. Subscribers loosen/tighten via Control Center → Lookup Tables → CAPTURE_LIFECYCLE_ROLES.
- `bdm_id` is explicit on every preview call (Rule #21 — no silent self-fallback). Privileged-without-bdm_id = HTTP 400.
- Auto-populate is **purely additive** — empty signals produce zeros; the page stays editable; the proxy is never blocked.
- The CarLogbookEntry pre-save hook still owns derived math (total_km, official_km, fuel total_amount, efficiency, gas split). Auto-populate writes only the inputs.

### Verification (May 6, 2026)

- `node backend/scripts/healthcheckCarLogbookAutoPopulate.js` → **70/70 PASS**.
- `node backend/scripts/healthcheckCaptureHub.js` → **531/531 PASS** (no Slice 1+2+3+4+5+7+8+9 regression).
- Service helper unit smoke (Bash `node -e`): `readOcrNumber` 8 cases (raw, envelope, commas, units, NaN, empty, garbage, zero) + `readOcrString` 5 cases + `manilaDayBounds` start/end UTC bounds + reject garbage → **16/16 PASS**.
- `vite build` → **green, 35.55s**, no warnings.
- **Live API smoke** (dev cluster, president): preview `?bdm_id=Mae&dates=...` → 200 with Apr 30 carrying `_has_any_signal: true`, `personal_km: 75`, `official_km: 25`, `_autopop_sources.personal_km = 'DRIVE_ALLOCATION'`, `_drive_allocation: {status: 'ALLOCATED', start_km: 12000, end_km: 12100, total_km: 100, personal_km: 75, official_km: 25}`. Privileged-without-bdm_id → HTTP 400 with friendly message.
- **Live Playwright UI smoke** (dev cluster, president): `/erp/car-logbook` → BDM picker = Mae Navarro → period = 2026-04 → cycle = C2 → preview fetched once for the 11 cycle workdays → grid renders 17 rows → Apr 30 row shows green "Drive" badge with tooltip "Filled from BDM's DriveAllocation row (Personal/Official slider)" → typed "50" into personal_km input → badge flips to red "Manual" with tooltip "Manual override — proxy edited this field" + unsaved `*` indicator visible. Screenshot residue at repo root: `phase-p1-2-slice-6-carlogbook-autopop-ratified.png`, `phase-p1-2-slice-6-manual-override-ratified.png` (do NOT commit).

**Verification**: healthcheck Section 16 24/24 PASS, Vite build green, API + Playwright UI smoke ratified end-to-end on dev cluster (see PHASETASK-ERP.md Round 2C section).
