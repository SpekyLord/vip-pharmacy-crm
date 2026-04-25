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

## Strict-entity (52 models)

Entity-scoped only — bdm_id absent, optional, or non-canonical (e.g.
Payslip uses `person_id` per Phase G1.4):

ApPayment, AccessTemplate, AiUsageLog, ApprovalRequest, ApprovalRule, ArchiveBatch, ArchivedDocument, BankAccount, BankStatement, BudgetAllocation, CashflowStatement, ChartOfAccounts, Collateral, CompProfile, CostCenter, CreditCard, CreditCardTransaction, CreditRule, CsiBooklet, FixedAsset, FunctionalRoleAssignment, IncentiveDispute, IncentivePlan, InsurancePolicy, KpiSelfRating, KpiTemplate, LoanMaster, Lookup, OcrSettings, OcrUsageLog, OfficeSupply, OfficeSupplyTransaction, OwnerEquityEntry, PartnerScorecard, Payslip, PeopleMaster, PeriodLock, PettyCashFund, PettyCashRemittance, PettyCashTransaction, ProductMapping, ProductMaster, PurchaseOrder, SalesGoalPlan, StockReassignment, SupplierInvoice, Task, Territory, TransferPriceList, VatLedger, VendorMaster, Warehouse

## Strict-entity-and-bdm (30 models)

Both `entity_id` and `bdm_id` declared. **Rule #21 silent-self-fill risk** lives
exclusively in this bucket. bdmGuard observes these.

ActionItem, CaptureSubmission, CarLogbookCycle, CarLogbookEntry,
Collection, ConsignmentTracker, CreditNote, CwtLedger, CycleReport,
DeductionSchedule, DocumentAttachment, ErpAuditLog, ExpenseEntry, GrnEntry,
IncentivePayout, IncomeReport, InventoryLedger, JournalEntry, KpiSnapshot,
MonthlyArchive, PnlReport, PrfCalf, RecurringJournalTemplate, SalesCredit,
SalesGoalTarget, SalesLine, SmerEntry, TransactionEvent, Undertaking,
VarianceAlert

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
