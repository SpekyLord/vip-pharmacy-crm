# Approval Coverage Audit — Phase 31 (April 2026)

**Goal.** Every controller that calls `gateApproval()` BLOCKS posting until authorized. For each such call site, the pending doc must surface in the Approval Hub inbox (`MODULE_QUERIES` entry in [universalApprovalService.js](../backend/erp/services/universalApprovalService.js)). If the doc is reversible post-posting, it must also appear in the Reversal Console (`REVERSAL_HANDLERS` entry in [documentReversalService.js](../backend/erp/services/documentReversalService.js)). This document is the authoritative map of those four registries.

**How to re-verify later.** From repo root:
```
grep -rn "gateApproval\s*(" backend/erp/controllers/
```
Every call site's `module:` value must exist in both `MODULE_QUERIES` and `MODULE_TO_SUB_KEY`. Cross-check the table below.

---

## Coverage Table (19 gateApproval call sites, 13 controllers)

| # | Controller — function line | module | docType | MODULE_QUERIES? | MODULE_TO_SUB_KEY | REVERSAL_HANDLERS | Gap? |
|---|---|---|---|---|---|---|---|
| 1 | salesController.js:657 | SALES | CSI / CR / etc. | ✓ | approve_sales | SALES_LINE ✓ | — |
| 2 | creditNoteController.js:184 | SALES | CREDIT_NOTE | **✗** (SALES query only reads SalesLine, not CreditNote) | approve_sales | — (CreditNotes use their own reversal path) | **ADD query variant** |
| 3 | collectionController.js:299 | COLLECTION | CR | ✓ | approve_collections | COLLECTION ✓ | — |
| 4 | expenseController.js:231 | EXPENSES | SMER | ✓ (SMER module) | approve_expenses | — | — |
| 5 | expenseController.js:726 | EXPENSES | CAR_LOGBOOK | ✓ (CAR_LOGBOOK module) | approve_expenses | — | — |
| 6 | expenseController.js:1150 | EXPENSES | EXPENSE_ENTRY | ✓ | approve_expenses | EXPENSE ✓ | — |
| 7 | expenseController.js:1643 | EXPENSES | PRF_CALF | ✓ (PRF_CALF module) | approve_expenses | CALF ✓ / PRF ✓ | — |
| 8 | incomeController.js:528 | INCOME | PNL_REPORT | ✓ (INCOME query reads IncomeReport — verify PNL_REPORT included) | approve_income | INCOME_REPORT ✓ | **VERIFY** |
| 9 | payrollController.js:127 | PAYROLL | PAYSLIP | ✓ | approve_payroll | PAYSLIP ✓ | — |
| 10 | inventoryController.js:591 | INVENTORY | GRN | ✓ | approve_inventory | GRN ✓ | — |
| 11 | interCompanyController.js:190 | IC_TRANSFER | IC_TRANSFER | **✗** | approve_ic_transfer | IC_TRANSFER ✓ | **ADD query** |
| 12 | icSettlementController.js:89 | IC_TRANSFER | IC_SETTLEMENT | **✗** | approve_ic_transfer | — (no reversal handler yet) | **ADD query variant** |
| 13 | accountingController.js:51 | JOURNAL | JOURNAL_ENTRY (single post) | **✗** | approve_journal | JOURNAL_ENTRY ✓ | **ADD query** |
| 14 | accountingController.js:92 | JOURNAL | JOURNAL_ENTRY (batch post) | **✗** | approve_journal | JOURNAL_ENTRY ✓ | **ADD query** (same doc type) |
| 15 | accountingController.js:262 | JOURNAL | DEPRECIATION | **✗** | approve_journal | — (batch, no per-doc reversal) | **ADD query** |
| 16 | accountingController.js:320 | JOURNAL | INTEREST | **✗** | approve_journal | — | **ADD query** |
| 17 | bankingController.js:139 | BANKING | BANK_RECON | **✗** | approve_banking | — (no reversal handler yet — deferred) | **ADD query** |
| 18 | pettyCashController.js:290 | PETTY_CASH | DISBURSEMENT / DEPOSIT | **✗** | approve_petty_cash | PETTY_CASH_TXN ✓ | **ADD query** |
| 19 | purchasingController.js:448 | PURCHASING | SUPPLIER_INVOICE | **✗** | approve_purchasing | — (PO reversal via dependent-check only) | **ADD query** |

**Scaffolded approval-sub-keys also defined in MODULE_TO_SUB_KEY but NO `gateApproval()` caller yet** (not a gap — feature deferred):
- `PERDIEM_OVERRIDE` — perdiem-override approval feature was scaffolded in MODULE_QUERIES but gateApproval wiring is pending upstream.

---

## Gap Summary — What Phase 2 Must Close

8 distinct "Add query" entries, consolidated into **5 new `MODULE_QUERIES` blocks** (multiple docTypes share one module key):

| MODULE_QUERIES key (new) | Source collection(s) | Pending status filter | doc_ref field | Detail builder emphasis |
|---|---|---|---|---|
| **JOURNAL** | JournalEntry (status: PENDING_APPROVAL, is_reversal: {$ne:true}) | status enum check | `je_number` | je_date, source_module, lines table (account/debit/credit), totals, memo |
| **BANKING** | BankReconciliation (status: PENDING_APPROVAL) | status enum | `recon_ref` or `RECON-${_id}` | bank_account label, opening/closing balance, variance, attached statement |
| **IC_TRANSFER** | InterCompanyTransfer (status: DRAFT/PENDING_APPROVAL) + IcSettlement (status: PENDING_APPROVAL) | status enum per collection | `transfer_ref` / `cr_no` | source→target entities, line_items (qty/product/batch), total_amount, waybill |
| **PURCHASING** | SupplierInvoice (status: PENDING_APPROVAL) | status enum | `invoice_ref` | vendor, PO reference, line_items, totals, invoice photo |
| **PETTY_CASH** | PettyCashTransaction (status: PENDING_APPROVAL) | status enum | `reference` or `txn_no` | fund label, txn_type, payee, amount, purpose, supporting receipt photo |
| **SALES** (existing — ADD CreditNote variant) | CreditNote (status: PENDING_APPROVAL) | status enum | `cn_number` | original CSI reference, reason, line_items, total credit, approver notes |

---

## Cross-Registry Consistency (after Phase 2)

Once Phase 2 lands, these invariants must hold:

1. **Every `gateApproval(module, ...)` call → `MODULE_QUERIES` has a row whose `.module === module`.** (No silent HTTP 202 that never surfaces to an approver.)
2. **Every `MODULE_QUERIES` row → `MODULE_TO_SUB_KEY[module]` defined.** (Already true; just preserve.)
3. **Every doc type that is POSTABLE and has financial side effects → `REVERSAL_HANDLERS[doc_type]` defined.** (BANK_RECON, DEPRECIATION, INTEREST, PURCHASING invoice, IC_SETTLEMENT are currently NOT reversible; this is a deliberate deferred scope.)
4. **Every `REVERSAL_HANDLERS[doc_type]` → the originating module has a `MODULE_QUERIES` entry.** (Ensures the full lifecycle — submit → approve → post → reverse — is visible end-to-end.)

**Failures of invariant 1 as of pre-Phase-2:** 8 gateApproval calls produce silent 202s. This is the bug Phase 2 fixes.

---

## Maintenance

- When adding a new `gateApproval()` call site, update this table in the same PR.
- When adding a new `MODULE_QUERIES` entry, add the matching row here.
- When adding a new `REVERSAL_HANDLERS` entry, update the column here.
- If any of the 4 cross-registry invariants above is violated, the CI/health-check script (if one exists — see Global Rule #5) should fail.
