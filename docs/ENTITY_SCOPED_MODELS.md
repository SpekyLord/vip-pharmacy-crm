# Entity-Scoped Models Inventory

> Built during Week-1 Stabilization Day 3 (2026-04-25) for the entityGuard / bdmGuard
> middleware. Source of truth is [backend/middleware/entityScopedModels.json](../backend/middleware/entityScopedModels.json).
> This document classifies every Mongoose model by tenant boundary; the JSON
> file is consumed by the runtime guard plugin and (Day 5) the ESLint rule.

## Classification

| Bucket | Field shape | Read filter requirement | Day-3 guard behavior |
|---|---|---|---|
| **strict_entity** | `entity_id: { ..., required: true }` | Every find/update/delete must filter by `entity_id` | entityGuard observes |
| **strict_entity_and_bdm** | both `entity_id` and `bdm_id` required | filter by `entity_id` always; `bdm_id` optionally per Rule #21 | entityGuard + bdmGuard both observe |
| **global** | `entity_id` optional (home-label only), or absent | No entity filter expected; reads cross-entity by design | Skip both guards |
| **special_cross_entity** | non-standard pair (e.g. `source_entity_id`/`target_entity_id`) | Special filter, two-sided | Skip both guards |
| **deferred_crm** | CRM-only (`user`/`assignedTo[]`/`recipient_user_id`) | Not entity-scoped | Skip both guards (Week 2 pharmacy greenfield) |

## Strict-entity (53 models)

Entity-scoped only — bdm_id absent, optional, or non-canonical (e.g.
Payslip uses `person_id` per Phase G1.4):

ApPayment, AccessTemplate, AiUsageLog, ApprovalRequest, ApprovalRule, ArchiveBatch, ArchivedDocument, BankAccount, BankStatement, BudgetAllocation, CashflowStatement, ChartOfAccounts, Collateral, CompProfile, CostCenter, CreditCard, CreditCardTransaction, CreditRule, CsiBooklet, FixedAsset, FunctionalRoleAssignment, IncentiveDispute, IncentivePlan, InsurancePolicy, KpiSelfRating, KpiTemplate, LoanMaster, Lookup, OcrSettings, OcrUsageLog, OfficeSupply, OfficeSupplyTransaction, OwnerEquityEntry, PartnerScorecard, Payslip, PeopleMaster, PeriodLock, PettyCashFund, PettyCashRemittance, PettyCashTransaction, ProductMapping, ProductMaster, PurchaseOrder, RecurringJournalTemplate, SalesGoalPlan, StockReassignment, SupplierInvoice, Task, Territory, TransferPriceList, VatLedger, VendorMaster, Warehouse

> **Day-4.5 #4 (2026-04-25)**: `RecurringJournalTemplate` reclassified from `strict_entity_and_bdm` → `strict_entity`. The top-level template schema has no `bdm_id` field — the only `bdm_id` is on the per-line `jeLineSchema` sub-document, which the bdmGuard never observed (Mongoose plugins fire on the parent doc). Original classification overstated the model's bucket; the bdmGuard had no fingerprint to fire on it anyway.

## Strict-entity-and-bdm (29 models)

Both `entity_id` and `bdm_id` declared. **Rule #21 silent-self-fill risk** lives
exclusively in this bucket. bdmGuard observes these.

ActionItem, CaptureSubmission, CarLogbookCycle, CarLogbookEntry,
Collection, ConsignmentTracker, CreditNote, CwtLedger, CycleReport,
DeductionSchedule, DocumentAttachment, ErpAuditLog, ExpenseEntry, GrnEntry,
IncentivePayout, IncomeReport, InventoryLedger, JournalEntry, KpiSnapshot,
MonthlyArchive, PnlReport, PrfCalf, SalesCredit,
SalesGoalTarget, SalesLine, SmerEntry, TransactionEvent, Undertaking,
VarianceAlert

> **Day-4.5 #4 (2026-04-25)**: `CwtLedger.bdm_id` flipped to `required: true`. Both write paths inherit `bdm_id` from a `Collection` (which is itself `bdm_id: required: true`), and `cwtService.createCwtEntry` is the only writer — making the Mongoose schema the static counterpart to the runtime bdmGuard. `IncentivePayout` was audited but kept optional: it intentionally supports `bdm_id` XOR `person_id` per Phase G1.4 (employee deduction path), proven by the partial unique index `partialFilterExpression: { bdm_id: { $exists: true } }`. Forcing `required: true` would break the person_id-only path.

## Global (skip both guards) (10 models)

No tenant boundary applies — system-wide reference data, sequence counters,
singletons, system-level audit, or globally shared masters keyed by
tagged_bdms / aliases.

| Model | Reason |
|---|---|
| `AgentConfig` | Agent enable/disable config keyed by `agent_key`, system-wide. |
| `AgentRun` | System-level agent execution audit. Schema has no `bdm_id`; `entity_id` not populated by callers (agents commonly process multiple entities per run). Reclassified Day-4.5 (was `strict_entity_and_bdm` — original classification was wrong). |
| `Customer` | Phase G5 globalization Apr 2026. Visibility via `tagged_bdms[]`. |
| `DocSequence` | Document number sequence keyed by sequence string, not entity. |
| `Entity` | The tenant boundary itself. |
| `ErpSettings` | Singleton (`Settings.findOne()`); schema has no `entity_id`. Per-entity overrides live in `Lookup` / `OcrSettings` / `CompProfile`. Reclassified Day-4.5 (was `strict_entity` — would have generated alerts on every read in production log mode). |
| `ExpenseComponent` | Static enum-like reference data, no entity scope. |
| `GovernmentRates` | PH tax/regulatory rates — system-wide, same for all subscribers. |
| `Hospital` | Phase 4A.3 global hospitals. `entity_id` optional home-label. |
| `PaymentMode` | Globally-shared payment-mode catalog keyed by `mode_code`. Schema has no `entity_id`. Per-entity COA / CALF rules layered on top via `Settings` and `BankAccount` / `CreditCard`. Reclassified Day-4.5 (was `strict_entity` — would have generated alerts on every PaymentMode read). |

## Special cross-entity (skip both guards) (2 models)

Non-standard scoping that intentionally spans two entities.

| Model | Field shape |
|---|---|
| `InterCompanyTransfer` | `source_entity_id` + `target_entity_id` |
| `IcSettlement` | `creditor_entity_id` + `debtor_entity_id` |

## Deferred (CRM, Week 2)

CRM-side models scoped by `user` / `assignedTo[]` / `recipient_user_id` —
different tenant model entirely. Decision: punt on CRM-side guards until the
pharmacy greenfield repo is structured (Week 2).

Visit, Doctor, Client, ClientVisit, MessageInbox (CRM), MessageTemplate,
CommunicationLog, NotificationPreference, ProductAssignment, Schedule,
Specialization, SupportType, Program, AuditLog, CrmProduct, CLMSession,
DataDeletionRequest, ImportBatch, EmailLog, InviteLink, Report, ScheduledReport,
User, WebsiteProduct.

## How to update

1. Add a model to the right bucket in [entityScopedModels.json](../backend/middleware/entityScopedModels.json).
2. Mirror the change in this document.
3. Boot the API — log line `[entityGuard] attached to N models` should match
   the union of `strict_entity` + `strict_entity_and_bdm`.

## ESLint rule (Day 5)

Static counterpart to the runtime `entityGuard` middleware. Reads the same
`entityScopedModels.json` so the model list never drifts between runtime and
lint time.

- Rule source: [backend/eslint-rules/require-entity-filter.js](../backend/eslint-rules/require-entity-filter.js)
- Rule unit tests: [backend/eslint-rules/require-entity-filter.test.js](../backend/eslint-rules/require-entity-filter.test.js) (25 cases, runs via the existing Jest harness)
- Flat config: [backend/eslint.config.js](../backend/eslint.config.js)

### Run

```bash
cd backend
npm run lint:entity-filter          # warn-severity (visibility, exits 0)
npm run lint:entity-filter:strict   # error-severity (CI-gate-ready, exits non-zero on any flag)
```

The frontend's local ESLint v9 install is reused — no new backend dependency.

### Day-5 baseline (2026-04-25)

First production run produced **647 warnings across 134 files**. Captured
under [docs/week1-baselines/](week1-baselines/):

- `entity-filter-baseline.json` — full ESLint JSON output (one entry per file)
- `entity-filter-baseline.txt` — stylish-format output for human review
- `entity-filter-summary.txt` — top dirs + top files + top model.method patterns
- `summarize.cjs` — re-runnable summarizer (read-only, takes the JSON as input)

Concentration:

| Top directories | Count |
|---|---|
| backend/erp/ | 580 |
| backend/agents/ | 46 |
| backend/scripts/ | 15 |
| backend/controllers/ | 6 |

| Top model.method | Count |
|---|---|
| ProductMaster.find | 30 |
| PeopleMaster.findById | 26 |
| SalesGoalPlan.findById | 21 |
| JournalEntry.find | 20 |
| InventoryLedger.aggregate | 19 |
| ExpenseEntry.findById | 18 |
| DocumentAttachment.updateMany | 14 |
| Warehouse.find | 14 |

### Triage (per the Day-5 handoff §1)

For each unique `(model, method, path)` triple, classify as:

**(a) Legitimate cross-entity** — admin all-entity dashboard, consolidated
finance report, system-level aggregator. Add an inline disable WITH a reason:

```js
// eslint-disable-next-line vip-tenant/require-entity-filter -- admin all-entity dashboard
const all = await Sale.find({});
```

The reason after `--` is the audit trail. Bare disables should be rejected
in code review.

**(b) Bug — missing entity filter.** Add `entity_id: req.entityId` (or spread
`...req.tenantFilter`) to the first argument. Rule #21 silent-self-fill is
the trap to watch for in `strict_entity_and_bdm` controllers.

**(c) Wrong classification.** The model belongs in `global` /
`special_cross_entity` / `deferred_crm`. Move it in the JSON and update this
doc; the rule re-reads on every run.

**Static-only false positives the rule will hit (escape via inline disable):**

- `.where('entity_id').equals(x)` chained calls — entity filter is set after
  the call site the rule inspects.
- Filters built across statements (`const f = {}; f.entity_id = x; Model.find(f)`)
  — runtime guard catches these; static rule passes them through.
- `findById*` always flags. The runtime guard does the same. Triage in
  practice: most calls pair with an upstream `protect` + `tenantFilter`
  middleware, but the static rule cannot prove that. If the route is genuinely
  scoped, an inline disable with reason `-- guarded by tenantFilter middleware`
  is the right answer.

### Rollout

1. ✅ Rule + flat config + tests + baseline shipped (Day 5 §1).
2. ⏳ Triage the 647-violation baseline. Same dispatch pattern as Day-4
   runtime triage (§5 of `HANDOFF-vip-week1-day4-deferred.md`).
3. ⏳ When the baseline is empty (every flag either fixed or annotated with
   a reasoned disable), promote rule severity to `error` in
   `backend/eslint.config.js` and wire `lint:entity-filter:strict` into the
   PR workflow as a blocking check.

The CI-gate flip is intentionally staged behind the triage pass — same
philosophy as the Day-4 prod log→throw flip. Don't gate before triage;
gating an unbounded flood blocks unrelated PRs and trains the team to
silence the rule with bare disables.
