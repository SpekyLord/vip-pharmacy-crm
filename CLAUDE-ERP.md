# VIP ERP - Project Context

> **Last Updated**: April 30, 2026
> **Version**: 8.2
> **Status**: Phase **G4.5dd (Apr 30 2026 evening)**: Internal Stock Reassignment Proxy. Closes the gap that an eBDM (back-office staff) had no path to create cross-BDM internal stock reassignments on `/erp/transfers` (Internal tab) — page-level guard `isPresidentOrAdmin` hid the "+ Reassign Stock" button for staff, and the backend route's `inventory.transfers` sub-perm gate alone is too broad (broadly granted for IC visibility). New lookup-driven sub-perm `inventory.internal_transfer_proxy` (sort_order 9.3, sibling to G4.5x batch_metadata_proxy + G4.5y physical_count_proxy) + new `PROXY_ENTRY_ROLES.INTERNAL_TRANSFER` row (default `[admin, finance, president]`, subscriber appends `staff`) + new `VALID_OWNER_ROLES.INTERNAL_TRANSFER` row (`['staff']`). `interCompanyController.createReassignment` now: (a) short-circuits for admin/finance/president; (b) calls `canProxyEntry(req, 'inventory', INTERNAL_TRANSFER_PROXY_OPTS)` for everyone else and returns 403 naming the required sub-perm + lookup row when denied; (c) defense-in-depth — validates BOTH `source_bdm_id` AND `target_bdm_id` against `getValidOwnerRolesForModule(entityId, 'inventory', 'INTERNAL_TRANSFER')` + same-entity (catches a privileged caller accidentally passing an admin _id, which would corrupt FIFO consumption + per-BDM commission). `approveReassignment` gains an explicit `req.isAdmin || req.isFinance || req.isPresident` short-circuit at the top — closes a latent permission gap (any user with `inventory.transfers` could previously hit the approve endpoint via the API and trigger FIFO deduction without admin/finance authorization). **Two-person rule preserved**: proxy can CREATE only; APPROVE — the dispositive action that deducts FIFO stock from source and shifts ownership to target — remains admin/finance/president, non-delegable. Frontend: `TransferOrders.jsx` reads `user.erp_access.sub_permissions.inventory.internal_transfer_proxy` into a `canCreateReassign` boolean; "+ Reassign Stock" button surfaces if `isPresidentOrAdmin || canProxyInternalTransfer`. Adds a small purple "Proxy mode — create only" chip in the header for non-privileged proxies so the operator knows they can't approve their own submission. Approve / Reject buttons stay gated on `isFinanceOrAdmin` (two-person rule UI symmetry). `WorkflowGuide` `transfers` banner rewrites the steps + tip to call out the IC vs Internal split + the proxy authorization chain + the two-person rule on approval. Healthcheck `node backend/scripts/healthcheckInternalTransferProxy.js` PASSES **19/19**; sibling regressions G4.5aa 32/32, G4.5bb 31/31, G4.5cc 29/29, Phase N + G4.5h-A all green; Vite build green (13.78s). Files touched: 2 backend (`lookupGenericController.js` + `interCompanyController.js`) + 2 frontend (`TransferOrders.jsx` + `WorkflowGuide.jsx`) + 1 healthcheck (NEW) + 2 docs = **7**. erp-remote no-push policy in effect — commit cleanly to `dev` only. Phase **UX-Scroll (Apr 30 2026 evening)**: ERP page body-scroll restoration. Closes a UX bug from the Apr 29 layout cleanup — long ERP forms (SMER, Sales Entry, Accounts Receivable, Expenses, etc.) couldn't scroll vertically on laptop when `WorkflowGuide` was visible (Rule #1 banner). Root cause: `.admin-layout { min-height: 0 }` in `frontend/src/index.css` capped the layout at ~100vh − navbar (~932px on laptop), and ~90 ERP pages' `<page>-main { overflow-y: auto }` turned that capped column into an invisible inner scroll context (scrollbars hidden globally per `*::-webkit-scrollbar { display: none }` in index.css:16). User had no scroll affordance and wheel events only fired while the cursor was over the main column — manifested as "page won't scroll." Mobile worked because touch-drag scrolls any container regardless of cursor. **Fix:** dropped `min-height: 0` from `.admin-layout` (one-line root-of-chain fix). With default `min-height: auto`, the layout grows to fit content, body-scroll handles overflow, and the leftover `<page>-main { overflow-y: auto }` rules across ~90 pages become harmless dead weight (each main's height now matches its content, so `overflow-y: auto` never triggers). Plus hygiene cleanup on 30 ERP pages — dropped the now-pointless `overflow-y: auto` (and paired `-webkit-overflow-scrolling: touch`) from each `<page>-main` rule. Affected pages: `AccessTemplateManager`, `AccountsReceivable`, `Collaterals`, `Collections`, `CollectionSession`, `ConsignmentDashboard`, `CustomerList`, `DrEntry`, `ErpDashboard`, `ExecutiveCockpit`, `GrnAuditView`, `GrnEntry`, `HospitalList` (inline JSX), `IcArDashboard`, `IcSettlement`, `MyStock`, `OpeningArList`, `OrgChart`, `PayrollRun`, `PayslipView`, `PeopleList`, `PersonDetail`, `SalesEntry`, `SalesList`, `SoaGenerator`, `ThirteenthMonth`, `TransferOrders`, `UndertakingDetail`, `UndertakingList`, `WarehouseManager`. **Followup hygiene sweep closed same evening (UX-Scroll.6)**: 56 more ERP pages cleaned via atomic Node script — `.ap-main`, `.agd-main`, `.coa-main`, `.po-main`, `.je-main`, `.tb-main`, `.ccl-main`, `.ccm-main`, `.fa-main`, `.income-main`, `.cc-main`, `.my-income-main`, `.vl-main`, `.pmode-main`, `.crm-main`, `.ict-main`, `.oar-main`, `.archive-main`, `.vat-main`, `.bir-main`, `.cycle-main`, `.ipl-main`, `.mec-main`, `.oe-main`, `.va-main`, `.dsp-main`, `.anomaly-main`, `.cr-main`, `.br-main`, `.pm-main`, `.bdv-main`, `.cf-main`, `.govr-main`, `.ba-main`, `.receipt-main`, `.fuel-main`, `.audit-main`, `.tpm-main`, `.ktm-main`, `.ln-main`, `.rx-main`, `.plk-main`, `.pnl-main`, `.rj-main`, `.si-main`, `.sox-main`, `.perf-main`, `.tsk-main`, `.sgd-main`, `.sp-main`, `.sgs-main`, `.ps-main`, `.pl-main`, `.aging-main`, `.booklet-main`, `.archive-main` (MonthlyArchive, second class with same name, distinct file). Post-sweep grep `^\s*\.[a-z][a-z-]*-main\s*\{[^}]*overflow-y:\s*auto` returns ZERO matches across `frontend/src/erp/pages/`. Anti-pattern fully eliminated. Vite build green (10.60s). Playwright smoke on `/erp/accounts-payable` (one of the 56 freshly-cleaned pages) confirms `.ap-main` computed `overflow-y` flipped `auto` → `visible`, body still scrolls past viewport, WorkflowGuide visible, behavior identical to pre-sweep — i.e. the rules being dead weight before is corroborated by zero behavior change after their removal. Total Phase UX-Scroll surface: 1 root (`index.css`) + 30 hygiene Round 1 + 56 hygiene Round 2 + 2 docs = **89 files touched**. OcrTest opt-in preserved exactly. CRM unaffected. AdminDashboard unaffected. **Scope guardrails**: CRM unaffected (`.admin-layout` is exclusively ERP — verified via grep, 0 hits in `frontend/src/pages` + `frontend/src/components`); OcrTest unaffected (re-establishes height cap via its own scoped `.admin-page.ocr-page { height: 100vh; overflow: hidden }` overrides — pages that genuinely need inner-scroll regions follow this opt-in pattern); AdminDashboard unaffected (uses `.admin-content` which keeps its `min-height: 0`). **No backend logic / wiring / lookup config / journal / audit changes** — pure frontend CSS hygiene. WorkflowGuide / PageGuide / DependencyBanner content unchanged. Vite build green (16.49s root-fix; 25.13s 30-page hygiene round). Files touched: 1 root (index.css) + 30 ERP pages + 2 docs = 33. erp-remote no-push policy in effect — commit cleanly to `dev` only. Phase **R2 (Apr 30 2026)**: Sales Discount line-level field shipped. New `line_discount_percent` (0..100) on SalesLine.lineItemSchema with BIR-standard net-method math (VAT base shrinks per RR 16-2005). Pre-save hook computes `line_total = qty × unit_price - discount`, `vat_amount = line_total × 12 / 112`, plus three header aggregates (`total_discount`, `total_gross_before_discount`, plus the existing `invoice_total` which is now AFTER-discount). **autoJournal.journalFromSale unchanged** — already reads after-discount fields, so DR AR / CR SALES (net) / CR VAT math stays correct. CSI Draft Overlay (`csiDraftRenderer.buildTotalsView`) flips `less_discount` from hardcoded 0 → real value; both VIP (cols.description) and MG-and-CO (cols.articles) print templates render via the same totals fields union. Per-line body "Amount" stays at GROSS so booklet `Qty × Price = Amount` reconciles; discount surfaces in the totals block only. POSTED CSI print template (`salesReceipt.js`) renders "Total Sales (VAT Inclusive) → Less: Discount → Net of VAT → VAT → TOTAL" stack when `total_discount > 0`, plus per-line "Less N% (₱X)" chip. SalesEntry.jsx desktop CSS grid widened to 9 cols (Disc% inserted between Price and Total) + mobile card flex row gets the same input. Lookup-driven cap via new `SALES_DISCOUNT_CONFIG` category (`max_percent: 100, default_percent: 0, require_reason_above: 0`, `insert_only_metadata: true`); privileged users (president/admin/finance) bypass the configurable cap, schema's hard 0..100 still applies via Mongoose validators. Helper `backend/utils/salesDiscountConfig.js` (60s cache, mirrors `teamActivityThresholds.js` pattern). WorkflowGuide `sales-entry` banner updated. Healthcheck `node backend/scripts/healthcheckSalesDiscount.js` PASSES **33/33**. Vite build green (12.27s). Backwards-compat: legacy rows default to 0, no recomputation needed. **Future Phase R3 (deferred)**: Hospital Discount Master — per-hospital/per-product BDM-negotiated defaults; `default_percent` and `require_reason_above` config keys are reserved for it. Files touched: 4 backend + 1 helper (NEW) + 1 frontend page + 1 frontend component + 1 lookup seed + 1 healthcheck (NEW) + 2 docs = 11. erp-remote no-push policy in effect — commit cleanly to `dev` only. Phase **G4.5h Part A (Apr 30 2026)**: Idempotent `postSingleUndertaking`. Closes the UT-002 orphan class of bug from G4.5g — when a linked GRN is already APPROVED (manual recovery, future direct-approve, or a half-committed prior cascade), the UT acknowledge no longer dies on `approveGrnCore`'s `expected PENDING` throw. The cascade peeks `GrnEntry.findById(linked_grn_id).select('status event_id')` BEFORE calling `approveGrnCore`; if status is APPROVED, the cascade is skipped (`cascadeSkipped: true`) and the existing GRN is returned with the audit note explicitly saying `cascade skipped, idempotent path; GRN event_id=...`. Atomic `Undertaking.findOneAndUpdate({_id, status: 'SUBMITTED'}, {$set: {status: 'ACKNOWLEDGED', ...}}, {session, new: true})` claim INSIDE `withTransaction` makes the SUBMITTED → ACKNOWLEDGED transition race-safe between the direct `acknowledgeUndertaking` HTTP path and the Approval Hub dispatcher; concurrent acks return `alreadyAcknowledged: true` instead of double-writing or throwing. Audit moved OUTSIDE `withTransaction` (matches A.5.5 doctorMergeService pattern); audit failure no longer rolls back a committed acknowledge. `acknowledgeUndertaking` response message branches on the new flags so operators see exactly which idempotent path ran. `universalApprovalController.approvalHandlers.undertaking` unchanged — destructures `{ undertaking }` from the new superset return. Outer SUBMITTED gates kept at both call sites (clean 400 / clean throw); the atomic claim is defense-in-depth for the race window, not a substitute. Healthcheck `node backend/erp/scripts/healthcheckPostSingleUndertakingIdempotency.js` PASSES **14/14**. G4.5h-W regression `node backend/erp/scripts/healthcheckWaybillRecovery.js` still PASSES 11/11. Vite build green (12.58s). UT-002 reproducer: clicking Acknowledge as president returns HTTP 200 with `data.cascadeSkipped: true` and message "Undertaking acknowledged — linked GRN was already APPROVED (no new stock posted)" — UT flips to ACKNOWLEDGED, GRN unchanged, no new ledger rows. Browser smoke pending. **Parts B + C deferred** — Part B = `recordPhysicalCount` governance (gateApproval / TransactionEvent / period-lock / role gate split, ~8 files, ~1 day); Part C = UT-acknowledge physical-count snapshot gate (Settings-driven, depends on Part B). Plan: `~/.claude/plans/phase-g4-5h-physical-count-governance.md`. Follow-up handoff: `memory/handoff_phase_g4_5h_part_b_c_apr30_2026.md`. Files touched: 1 backend (undertakingController.js) + 1 healthcheck (NEW) + 2 docs (CLAUDE-ERP.md + PHASETASK-ERP.md). erp-remote no-push policy in effect — commit cleanly to `dev` only. Phase **G4.5cc (Apr 29 2026)**: Compute Payroll Proxy + Approval-Hub run cascade. Closes the last "any can CREATE, authority POSTS" gap in the Payroll module — a finance clerk (User.role='staff') with the new `payroll.run_proxy` sub-perm can run Friday-afternoon Compute and Submit the run for posting; admin / finance / president authorize on phone via the Approval Hub and a single approval cascades every matching payslip COMPUTED→REVIEWED→APPROVED→POSTED with auto-emitted payroll JEs. **Design correction during ratification (Apr 29 2026)**: the original design's two-layer gate (sub-perm tick + MODULE_DEFAULT_ROLES.PAYROLL widening) had a hidden conflict — `MODULE_DEFAULT_ROLES.PAYROLL` is also consulted by `gateApproval` to decide "who can direct-post," so adding 'staff' to it would let clerks bypass the Hub entirely. Fixed by (a) dropping Layer 2 from the route gate (sub-perm tick alone is the run-authorization), (b) passing `forceApproval: !isPrivileged` to gateApproval inside `postPayroll` so clerk submissions ALWAYS route through the Hub regardless of authorizer-list membership, (c) `MODULE_DEFAULT_ROLES.PAYROLL` reverts to its pure role: the AUTHORIZER list (defaults to admin/finance/president, untouched by this phase). Mirrors the Phase G4.5a doctrine "proxy entry always routes through Approval Hub." Second design correction: the Hub's existing `doc_id` dedup (universalApprovalService.js:1435-1443) was dropping the run-level ApprovalRequest in favor of the per-payslip raw rows (both share the seed payslip's _id), burying the cascade entry point. Added a run-cover dedup INSIDE `MODULE_QUERIES.PAYROLL.query` that hides per-payslip Hub rows when an active ApprovalRequest covers their (period, cycle) — admin sees ONE row "Post N payslips (total ₱X)" and a single tap fires the cascade. Without this, admin would have walked the per-line review/approve flow and never the single-tap cascade. New lookup row `PAYROLL__RUN_PROXY` (one row, lazy-seeded — `module: 'payroll', key: 'run_proxy', sort_order: 6`). New route gate `payrollRunProxyGate` in [backend/erp/routes/payrollRoutes.js](backend/erp/routes/payrollRoutes.js) replaces the legacy `roleCheck('admin','finance','president')` on POST `/compute` + POST `/post` (per-line `/:id/review`, `/:id/approve`, `/thirteenth-month` keep `roleCheck` — line transitions are statutory and stay admin-owned). Single-layer gate (post-correction): explicit `payroll.run_proxy` sub-perm tick is the only run-authorization for non-privileged callers; admin/finance/president short-circuit. The post-correction design relies on `forceApproval: !isPrivileged` inside `postPayroll` to guarantee Hub routing — `MODULE_DEFAULT_ROLES.PAYROLL` is no longer consulted at the route gate (it stays on its original duty as the AUTHORIZER list inside `gateApproval`). `postPayroll` controller widens the candidate filter for non-privileged callers (`status: { $in: ['COMPUTED','REVIEWED','APPROVED'] }`) so `gateApproval()` has rows to gate, and threads `metadata: { run_period, run_cycle, run_payslip_count, run_total_net }` so the cascade can re-resolve the full run. New cascade handler `approvalHandlers.payroll_run` in [backend/erp/controllers/universalApprovalController.js](backend/erp/controllers/universalApprovalController.js) — registered in `MODULE_AUTO_POST.PAYROLL` so admin's single Hub approval dispatches a bulk transition. The handler re-resolves siblings off the seed payslip's `entity_id` + `period` + `cycle` (defensive against stale metadata), calls `transitionPayslipStatus` for each step, emits `journalFromPayroll` JEs per posted slip, period-locks, and writes a single audit row to `ErpAuditLog` (`field_changed: 'payroll_run_cascade'`). Per-payslip JE failures are logged with `LEDGER_ERROR` audit but do NOT abort the cascade — the approval decision is already persisted. Frontend: `usePayroll.js` exposes `canRunPayroll` / `hasRunProxy` / `isPrivileged`; `PayrollRun.jsx` widens Compute + Post buttons from `isFinance` to `canRunPayroll`, renames the Post button to "Submit Run for Approval" for non-privileged callers, and renders a purple banner above the period bar when `hasRunProxy && !isPrivileged` explaining the authority chain (lookup-driven via MODULE_DEFAULT_ROLES.PAYROLL — admin tunes via Control Center → Lookup Tables, no code deploy). `WorkflowGuide` `payroll-run` block step 6 documents the clerk authority. `PayslipView.jsx` cosmetic fix bundled (literal `—` / `’` / `→` escape sequences in JSX text rendered as raw text — wrapped in JS expressions or replaced with actual unicode chars on lines 414, 438, 440, 445). Healthcheck `node backend/scripts/healthcheckComputePayrollProxy.js` covers **29 checks** (sub-perm seed + MODULE_DEFAULT_ROLES.PAYROLL row + route gate + filter widening + run-cover dedup + cascade handler + MODULE_AUTO_POST + frontend hook + button gating + WorkflowGuide step + docs across CLAUDE-ERP/PHASETASK-ERP/RUNBOOK). Files touched: 8 backend + 2 frontend + 3 docs (CLAUDE-ERP.md / PHASETASK-ERP.md / RUNBOOK.md SECTION 11). erp-remote no-push policy in effect — commit cleanly to `dev` only. Phase **G4.5bb (Apr 29 2026)**: Employee Payslip person-id proxy roster. Closes a follow-up gap from G4.5aa: the new `payroll.payslip_deduction_write` sub-perm opened the route to non-management staff but did NOT constrain WHICH employees a clerk could mutate — entity-wide write was too broad for subscribers who want a clerk constrained to a specific roster of employees or a person_type. New lookup-driven per-clerk roster: `PAYSLIP_PROXY_ROSTER` lookup (one row per clerk, `code = userId-string`, `metadata.scope_mode ∈ {ALL, PERSON_IDS, PERSON_TYPES}`, `insert_only_metadata: true`). New helper `backend/erp/utils/resolvePayslipProxy.js` exports `getEffectiveRoster` / `canWritePayslipDeduction` / `buildRosterFilterFragment` / `invalidatePayslipRosterCache` (60s TTL, lookup hot-reload registered in lookupGenericController). `payrollRoutes.payslipDeductionWriteGate` is now async — peeks `person_id` + `person_type`, calls `canWritePayslipDeduction`, returns 403 with `scope_mode` when out-of-roster. `getPayrollStaging` filters server-side via `buildRosterFilterFragment` (PERSON_IDS → mongo `$in` filter; PERSON_TYPES → post-filter on populated `person_type`). New endpoint `GET /api/erp/payroll/proxy-roster/me` returns the caller's effective scope (with hydrated `people: [{_id, full_name, person_type}]` for PERSON_IDS so the frontend can render names without a second round-trip). Frontend: `usePayroll.getMyPayslipProxyRoster()` hook; `PayrollRun.jsx` renders a purple roster chip ("Payslip Proxy Roster: …") above the period bar when scope_mode is restrictive; `PayslipView.jsx` computes `blockedByRoster` and renders a yellow read-only banner explaining how admin extends the roster (no buttons hidden silently — clerk knows WHY). `WorkflowGuide` `payroll-run` step 5 + `payslip-view` step 6 explain the workflow. No defaults seeded — admins create rows on-demand via Control Center → Lookup Tables. President/admin/finance always bypass (matches G4.5a..G4.5aa policy). Backwards-compatible: clerks with no roster row keep G4.5aa entity-wide behavior. Healthcheck `node backend/scripts/healthcheckPayslipProxyRoster.js` PASSES **31/31**. G4.5aa regression `node backend/scripts/healthcheckIncomeProxy.js` still PASSES 32/32. Vite build green (16.87s). Operational quickstart appended to `docs/RUNBOOK.md`. Files touched: 7 (resolvePayslipProxy.js NEW, lookupGenericController.js, payrollRoutes.js, payrollController.js, usePayroll.js, PayrollRun.jsx, PayslipView.jsx, WorkflowGuide.jsx, healthcheckPayslipProxyRoster.js NEW). Phase **G4.5aa (Apr 29 2026)**: BDM Income & Deduction Schedule Proxy + Payslip Deduction sub-perm gate. Closes the gap that an eBDM (back-office staff) had no path to generate IncomeReports or record DeductionSchedules on behalf of field BDMs (they were locked to `req.bdmId` self-flow). Three new lookup-driven sub-perms (`payroll.income_proxy`, `payroll.deduction_schedule_proxy`, `payroll.payslip_deduction_write`) + two new PROXY_ENTRY_ROLES rows (INCOME, DEDUCTION_SCHEDULE) + two VALID_OWNER_ROLES rows. `incomeController.requestIncomeGeneration / addDeductionLine / removeDeductionLine / getIncomeList / getIncomeBreakdown` now use `resolveOwnerForWrite` + `widenFilterForProxy` + `canProxyEntry` from the shared G4.5a resolver. `deductionScheduleController.createSchedule / getMySchedules / withdrawSchedule / editPendingSchedule` use the same pattern (peek-bdm-id for the existing strict service-level ownership guards). `payrollRoutes` POST/POST-verify/DELETE deduction-line routes now use a `payslipDeductionWriteGate` middleware that admits admin/finance/president OR staff with `payroll.payslip_deduction_write` (no OwnerPicker — Payslips are person_id-owned, not bdm_id). Frontend: `MyIncome.jsx` drops a single `OwnerPicker` per active tab (Payslips → income_proxy, Schedules → deduction_schedule_proxy) sharing a page-level `targetBdmId`; the picker context filters list loads AND stamps `assigned_to` on writes. WorkflowGuide banners updated on `myIncome` (step 8) and `income` (Finance step 7). Healthcheck `node backend/scripts/healthcheckIncomeProxy.js` PASSES 32/32. Vite build green (40.37s, MyIncome bundle 56kB / Income 59kB). Backend syntax OK on all 5 touched files. Phase **G4.5h-W (Apr 29 2026)**: GRN Undertaking waybill-recovery wiring. Closed the false-positive "no waybill is attached — approval will be blocked" warning that the Approval Hub showed even when the linked GRN's populate dropped the field. `buildUndertakingDetails` (documentDetailBuilder.js:194-201) now falls back from linked GRN → UT mirror → null for both `waybill_photo_url` and `undertaking_photo_url`. Undertaking model gained `undertaking_photo_url` field; `autoUndertakingForGrn` (undertakingService.js:114-115) now mirrors BOTH proof URLs at create time. `signLinkedGrnPhotos` (undertakingController.js:54-72) signs the UT's own mirror so the fallback URL renders without S3 AccessDenied. New recovery endpoint `POST /api/erp/undertaking/:id/waybill` patches BOTH the UT AND the linked GRN — the GRN has no edit endpoint of its own, so this is the only path to add a waybill to a legacy receipt without reversing+recreating. Authorization: owner BDM / proxy (lookup-driven via PROXY_ENTRY_ROLES.UNDERTAKING + `inventory.undertaking_proxy` sub-perm) / admin / finance / president. Status gate DRAFT or SUBMITTED only; period-lock enforced by receipt_date; ErpAuditLog `UPDATE` row stamped with old + new URL for traceability. Frontend uploader on `UndertakingDetail.jsx` shown when waybill missing AND `GRN_SETTINGS.WAYBILL_REQUIRED=1` AND user can submit. ApprovalManager warning is gated on the same `GRN_SETTINGS.WAYBILL_REQUIRED` lookup (subscribers who don't capture courier waybills no longer see false-positives) and now links the approver to the UT page for one-click recovery. WorkflowGuide `undertaking-entry` updated. Healthcheck `node backend/erp/scripts/healthcheckWaybillRecovery.js` PASSES 11/11. Vite build green (9.67s). Browser smoke deferred — needs a UT with `null` linked-GRN waybill + live Atlas dev cluster avoidance. Phase **CSI-X1 (Apr 28 2026)**: HospitalContractPrice + HospitalPO/HospitalPOLine + price resolver + SalesLine `po_id` extension. Per-hospital BDM-negotiated contract pricing resolves before ProductMaster.selling_price for sales to that hospital. Hospital purchase order capture with unserved-backlog tracking — PO line `qty_served` auto-decrements/restores atomically inside the existing JE-TX MongoDB transaction on Sales POST/reopen/approveDeletion. 4 new pages at `/erp/hospital-contract-prices`, `/erp/hospital-pos/backlog`, `/erp/hospital-pos/entry`, `/erp/hospital-pos/:id`. Lookup-driven (PRICE_RESOLUTION_RULES, PO_EXPIRY_DAYS, HOSPITAL_PO_STATUS, HOSPITAL_PO_SOURCE_KIND, MODULE_DEFAULT_ROLES.PRICE_LIST, PROXY_ENTRY_ROLES.HOSPITAL_PO, VALID_OWNER_ROLES.HOSPITAL_PO). Iloilo office encoders proxy on behalf of BDMs via existing G4.5a resolveOwnerForWrite. PO# already prints on CSI overlay (csiDraftRenderer.js:271). Healthcheck `node backend/scripts/healthcheckHospitalPoWiring.js` PASSES across 60 checks. Vite build green (43.04s, 4 new lazy bundles). Playwright smoke 4/4 PASS. X2 (paste-parser) + X3 (Cockpit KPI tiles + expiry cron) + X4 (audit polish) deferred — plan `~/.claude/plans/phase-csi-x1-hospital-po-pricing.md`. Phases 0-35 + Phase A-F.1 + Gap 9 + G1-G6 + G6.1 + G1.5 + H1-H5 + Phase 34 + Phase 3a + Phase 3c + Phase EC-1 Complete. **Phase G5 (Customer Globalization) Index Migration applied on dev Apr 27 2026** — `migrateCustomerGlobalUnique.js --apply` dropped 3 legacy compound indexes; Customer is now Hospital-style global. Cross-entity duplicate POST returns 400 with global-unique error; cross-entity read visibility confirmed. Prod apply still pending (gated on Atlas backup — see `memory/handoff_customer_global_migration_apr27_2026.md`). Phase G6.1 (Apr 26, 2026): **People Master Entity Lifecycle** — Transfer Home + Grant/Revoke endpoints + visibility union on People List (home ∪ User.entity_ids span ∪ active FRA holders). Two new danger-baseline sub-perms `people.transfer_entity` + `people.grant_entity`. Lookback days lookup-driven (`PEOPLE_LIFECYCLE_CONFIG.TRANSFER_BLOCK_LOOKBACK_DAYS`, default 90). Three new `AuditLog` enum values for full lineage. Closes the write-side gap left open by Phase G6 (which only made reads honor the entity selector). Phase G6 (Apr 26, 2026): **Master-data entity-scope honoring**. People Master list now respects the top-right entity selector for president-likes (was silently cross-entity). New `resolveEntityScope` helper + `CROSS_ENTITY_VIEW_ROLES` lookup category gate explicit `?cross_entity=true` opt-in by per-module role allowlist (default `['president','ceo']`). 60s cache + bust-on-lookup-write. Pattern ready for vendor/customer/hospital lists. Phase 3c (Apr 18, 2026): **Comprehensive hardcoded-role migration** — 30 destructive endpoints across ~15 modules now use `erpSubAccessCheck(module, key)` instead of `roleCheck('admin','finance','president')`. Baseline danger set grew 1 → 10 keys; 19 new sub-perms appear in the Access Template editor (period force-unlock, year-end, settings write, transfer pricing, people terminate/login mgmt, master data deactivate/delete, lookup deletes, etc.). Phase 3a (Apr 18, 2026): **Lookup-driven Danger Sub-Permission Gate + President-Reverse rollout**. Hardcoded `roleCheck('president')` on destructive endpoints replaced with `erpSubAccessCheck('accounting','reverse_posted')` so subsidiaries can delegate to CFO/Finance via Access Template editor without a code change. Rollout adds per-module `/president-reverse` routes to Expenses (ORE/ACCESS), PRF/CALF, and Petty Cash — on top of the existing Sales + Collection endpoints. Baseline danger set stays hardcoded (platform safety floor); subscribers extend via ERP_DANGER_SUB_PERMISSIONS lookup (5-min cache, busted on lookup write). Phase G5 (Apr 18, 2026): Fixed privileged-user BDM filter fallback bug in 9 ERP endpoints.

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
  - `log` — console.error JSON line; in production, also fires a deduped MessageInbox alert.
  - `throw` — log + throw inside the Mongoose pre-hook (controller's `catchAsync` returns 500).
  - `off`  — plugin not registered (test-only).
  Local dev defaults to `throw` so tenant leaks fail loud during development. Production stays on `log` until Day-4 triage clears all flagged routes.
- **Production alerting** ([backend/middleware/guardAlerter.js](backend/middleware/guardAlerter.js)) routes through the existing multi-channel `notify()` service (`recipient_id: 'ALL_ADMINS'` by default; override via `ENTITY_GUARD_ALERT_RECIPIENT` env var). Dedup window is 1 hour per `(kind, model, request-path)` triple — flooding violations don't spam the inbox.
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

## Phase VIP-1.J — BIR Tax Compliance Suite (J0 + J1 SHIPPED Apr 27-28 2026, J2-J7 deferred)

**Goal**: replace the bookkeeper-as-black-box workflow with a president-facing BIR Compliance Dashboard + per-form copy-paste UX into eBIR Forms + `.dat` exports for Alphalist Data Entry + loose-leaf Books of Accounts PDFs. Covers VIP, Balai Lawaan, online pharmacy, MG, CO, and future SaaS subscribers.

**Status (Apr 28 2026)**: J0 + J1 shipped. J0 (Compliance Dashboard + Foundation + Data Quality Agent + inbound-email parser) is on `origin/dev` (commits `80b2798` + `68c711d`) and live-smoke green — see Apr 27 entry below. **J1 (2550M Monthly + 2550Q Quarterly VAT compute + CSV export) is uncommitted on `dev`** — `vatReturnService` aggregator + 3 new endpoints + `BirVatReturnDetailPage` + heatmap cell-click drill-down + 39-check wiring healthcheck (passing). J2-J7 (~10 working days regulatory tax forms) still deferred — see memory `handoff_vip_1_j_phases_j1_j7_apr27_2026.md` and plan `~/.claude/plans/vip-1-j-bir-compliance.md`.

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
