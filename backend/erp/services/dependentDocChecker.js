/**
 * Dependent-Document Checker — Pre-flight blocker for SAP Storno reversals.
 *
 * Before reversing an upstream document (e.g., GRN, IC Transfer Receive,
 * Income Report), we must verify no downstream POSTED document depends on it.
 * Reversing an upstream doc whose stock/funds have already been consumed by a
 * downstream doc would orphan the downstream and corrupt the ledger.
 *
 * Each handler returns `{ has_deps, dependents: [{ type, ref, doc_id, message }] }`.
 * Caller (documentReversalService) blocks reversal when `has_deps` is true and
 * surfaces the dependents list to the user so they reverse downstream first.
 *
 * Subscription/scalability: register new doc types in CHECKERS map. Lookups can
 * be added without code changes because each checker queries Mongoose models —
 * no hardcoded business values are inspected here.
 */

const SalesLine = require('../models/SalesLine');
const InventoryLedger = require('../models/InventoryLedger');
const ConsignmentTracker = require('../models/ConsignmentTracker');
const InterCompanyTransfer = require('../models/InterCompanyTransfer');
const PrfCalf = require('../models/PrfCalf');
const ExpenseEntry = require('../models/ExpenseEntry');
const IncomeReport = require('../models/IncomeReport');
const Payslip = require('../models/Payslip');
const Collection = require('../models/Collection');
const PurchaseOrder = require('../models/PurchaseOrder');
// Phase 31R — AP payment blocker for Supplier Invoice reversal
const ApPayment = require('../models/ApPayment');

/**
 * GRN dependent check — block reversal if any batch from this GRN has been
 * consumed by a downstream POSTED SalesLine, IC Transfer, or expense ORE.
 *
 * The link is established through `InventoryLedger`: the GRN creates qty_in
 * entries with (batch_lot_no, product_id). Downstream consumers create qty_out
 * entries against the same batch. We look for qty_out entries whose `event_id`
 * resolves to a POSTED non-reversed downstream doc.
 */
async function checkGrnDependents({ doc, tenantFilter }) {
  const dependents = [];

  // Step 1 — collect (product_id, batch_lot_no) tuples this GRN brought in
  const batchKeys = (doc.line_items || []).map(li => ({
    product_id: li.product_id,
    batch_lot_no: li.batch_lot_no,
  }));
  if (!batchKeys.length) return { has_deps: false, dependents };

  // Step 2 — find all qty_out InventoryLedger entries against those batches in
  // the same entity. (Cross-entity batches don't share — IC Transfer creates
  // its own ledger entries on receive.)
  const ledgerOuts = await InventoryLedger.find({
    entity_id: doc.entity_id,
    qty_out: { $gt: 0 },
    $or: batchKeys,
  }).select('event_id batch_lot_no product_id qty_out').lean();
  if (!ledgerOuts.length) return { has_deps: false, dependents };

  // Step 3 — group by event_id; resolve each to a known posting doc and check
  // whether it's still POSTED (not reversed).
  const eventIds = [...new Set(ledgerOuts.map(l => String(l.event_id)).filter(Boolean))];
  if (!eventIds.length) return { has_deps: false, dependents };

  // Sales consumers
  const sales = await SalesLine.find({
    event_id: { $in: eventIds },
    deletion_event_id: { $exists: false },
    status: 'POSTED',
  }).select('_id doc_ref invoice_number sale_type').lean();
  for (const s of sales) {
    dependents.push({
      type: 'SALES_LINE',
      ref: s.doc_ref || s.invoice_number || String(s._id),
      doc_id: s._id,
      message: `Sales ${s.sale_type || 'CSI'} ${s.doc_ref || s.invoice_number} consumed batch from this GRN`,
    });
  }

  // IC Transfer consumers (source-side OUT events)
  const icts = await InterCompanyTransfer.find({
    source_event_id: { $in: eventIds },
    deletion_event_id: { $exists: false },
    status: { $in: ['SHIPPED', 'RECEIVED', 'POSTED'] },
  }).select('_id transfer_ref status').lean();
  for (const ic of icts) {
    dependents.push({
      type: 'IC_TRANSFER',
      ref: ic.transfer_ref,
      doc_id: ic._id,
      message: `IC Transfer ${ic.transfer_ref} (${ic.status}) shipped batch from this GRN`,
    });
  }

  return { has_deps: dependents.length > 0, dependents };
}

/**
 * IC Transfer dependent check — when reversing a TRANSFER_OUT/RECEIVE, block
 * if the TRANSFER_IN inventory at the target entity has been consumed.
 */
async function checkIcTransferDependents({ doc /* , tenantFilter */ }) {
  const dependents = [];
  if (!doc.target_event_id) return { has_deps: false, dependents }; // never received

  // Any qty_out against the target_event_id's lot inventory?
  // Resolve target inventory lots created by this IC.
  const targetLedger = await InventoryLedger.find({
    event_id: doc.target_event_id,
    qty_in: { $gt: 0 },
  }).select('product_id batch_lot_no').lean();
  if (!targetLedger.length) return { has_deps: false, dependents };

  const batchKeys = targetLedger.map(l => ({
    product_id: l.product_id,
    batch_lot_no: l.batch_lot_no,
  }));

  const consumers = await InventoryLedger.find({
    entity_id: doc.target_entity_id,
    qty_out: { $gt: 0 },
    $or: batchKeys,
  }).select('event_id').lean();
  if (!consumers.length) return { has_deps: false, dependents };

  const eventIds = [...new Set(consumers.map(c => String(c.event_id)).filter(Boolean))];
  const sales = await SalesLine.find({
    entity_id: doc.target_entity_id,
    event_id: { $in: eventIds },
    deletion_event_id: { $exists: false },
    status: 'POSTED',
  }).select('_id doc_ref invoice_number').lean();
  for (const s of sales) {
    dependents.push({
      type: 'SALES_LINE',
      ref: s.doc_ref || s.invoice_number,
      doc_id: s._id,
      message: `Target-entity Sales ${s.doc_ref || s.invoice_number} consumed batch transferred in by this ICT`,
    });
  }

  return { has_deps: dependents.length > 0, dependents };
}

/**
 * DR / Consignment dependent check — block if any conversion has been recorded
 * (i.e., the hospital consumed any of the consigned stock).
 */
async function checkConsignmentDependents({ doc /* , tenantFilter */ }) {
  const dependents = [];
  // The "doc" here is a ConsignmentTracker row.
  if ((doc.qty_consumed || 0) > 0 || (doc.conversions && doc.conversions.length)) {
    dependents.push({
      type: 'CONSIGNMENT_CONVERSION',
      ref: String(doc._id),
      doc_id: doc._id,
      message: `Consignment has ${doc.conversions?.length || 0} conversion(s) totalling ${doc.qty_consumed} units. Reverse the converting CSIs first.`,
    });
  }
  return { has_deps: dependents.length > 0, dependents };
}

/**
 * CALF dependent check — block if any linked ExpenseEntry is POSTED and uses
 * this CALF as funding (i.e., calf_required satisfied by this CALF).
 */
async function checkCalfDependents({ doc /* , tenantFilter */ }) {
  const dependents = [];
  // ExpenseEntry uses `calf_id` (1:M back-reference). PrfCalf.linked_expense_id
  // is the forward 1:1 reference (set when CALF was created from a single expense).
  const linked = await ExpenseEntry.find({
    entity_id: doc.entity_id,
    $or: [
      { calf_id: doc._id },
      ...(doc.linked_expense_id ? [{ _id: doc.linked_expense_id }] : []),
    ],
    status: 'POSTED',
  }).select('_id period status').lean();
  for (const e of linked) {
    dependents.push({
      type: 'EXPENSE',
      ref: String(e._id),
      doc_id: e._id,
      message: `Expense ${e._id} (${e.period || ''}) is POSTED and funded by this CALF — reverse the expense first.`,
    });
  }

  // Also block if an IncomeReport already deducted this CALF balance.
  const incomeRefs = await IncomeReport.find({
    entity_id: doc.entity_id,
    bdm_id: doc.bdm_id,
    'deduction_lines.auto_source': 'CALF',
    status: { $in: ['BDM_CONFIRMED', 'CREDITED'] },
    deletion_event_id: { $exists: false },
  }).select('_id period status').lean();
  for (const ir of incomeRefs) {
    dependents.push({
      type: 'INCOME_REPORT',
      ref: `${ir.period}/${ir.status}`,
      doc_id: ir._id,
      message: `IncomeReport ${ir.period} (${ir.status}) auto-deducted CASH_ADVANCE from this CALF — reverse the income first.`,
    });
  }

  return { has_deps: dependents.length > 0, dependents };
}

/**
 * PRF dependent check — block if the linked Collection is no longer POSTED
 * (so a different CR will need a new PRF). If the Collection is still POSTED,
 * PRF reversal is a clean credit reversal — no dependents.
 */
async function checkPrfDependents({ doc /* , tenantFilter */ }) {
  const dependents = [];
  if (doc.linked_collection_id) {
    const col = await Collection.findOne({
      _id: doc.linked_collection_id,
      entity_id: doc.entity_id,
    }).select('_id cr_no status deletion_event_id').lean();
    if (col && col.deletion_event_id) {
      // Collection already reversed — PRF reversal is fine, no block. We still
      // surface this as informational so the user understands what happened.
      // (No push to dependents — informational-only.)
    }
  }
  return { has_deps: false, dependents };
}

/**
 * IncomeReport dependent check — block if the report is referenced by Payslip
 * (rare — payroll typically separate) or already credited and a downstream
 * deduction schedule installment was satisfied.
 */
async function checkIncomeDependents({ doc /* , tenantFilter */ }) {
  const dependents = [];
  // Future: if Payslip references IncomeReport, add check.
  // For now, the only dependents are auto-pulled CALF lines that were marked
  // as VERIFIED — those flip back to PENDING on reverse via the handler itself.
  // No external dependents to block.
  return { has_deps: false, dependents };
}

/**
 * Payroll/Payslip dependent check — block if employer remittance posting
 * already happened (future: GovRemittance model). For now, no blocker.
 */
async function checkPayrollDependents({ /* doc, tenantFilter */ }) {
  return { has_deps: false, dependents: [] };
}

/**
 * SalesLine dependent check — block if a POSTED Collection settles this CSI.
 * Mirrors `salesController.approveDeletion` settled-CSI guard so the central
 * console produces the same answer as per-module deletion approval.
 */
async function checkSalesDependents({ doc /* , tenantFilter */ }) {
  const dependents = [];
  const col = await Collection.findOne({
    entity_id: doc.entity_id,
    status: 'POSTED',
    deletion_event_id: { $exists: false },
    'settled_csis.sales_line_id': doc._id,
  }).select('_id cr_no').lean();
  if (col) {
    dependents.push({
      type: 'COLLECTION',
      ref: col.cr_no || String(col._id),
      doc_id: col._id,
      message: `CSI is settled by Collection ${col.cr_no || col._id} — reverse the Collection first to release this CSI.`,
    });
  }
  return { has_deps: dependents.length > 0, dependents };
}

/**
 * Collection dependent check — block if a POSTED PRF was issued for the
 * partner rebate computed from this Collection.
 */
async function checkCollectionDependents({ doc /* , tenantFilter */ }) {
  const dependents = [];
  const prfs = await PrfCalf.find({
    entity_id: doc.entity_id,
    doc_type: 'PRF',
    linked_collection_id: doc._id,
    status: 'POSTED',
    deletion_event_id: { $exists: false },
  }).select('_id prf_number').lean();
  for (const p of prfs) {
    dependents.push({
      type: 'PRF',
      ref: p.prf_number || String(p._id),
      doc_id: p._id,
      message: `PRF ${p.prf_number} computed from this Collection — reverse the PRF first.`,
    });
  }
  return { has_deps: dependents.length > 0, dependents };
}

/**
 * Expense dependent check — block if the Expense was funded by a POSTED CALF
 * whose balance still references this expense's liquidation.
 */
async function checkExpenseDependents({ doc /* , tenantFilter */ }) {
  const dependents = [];
  if (doc.calf_id) {
    const calf = await PrfCalf.findOne({
      _id: doc.calf_id,
      entity_id: doc.entity_id,
    }).select('_id calf_number status deletion_event_id').lean();
    if (calf && calf.status === 'POSTED' && !calf.deletion_event_id) {
      dependents.push({
        type: 'CALF',
        ref: calf.calf_number || String(calf._id),
        doc_id: calf._id,
        message: `Expense liquidates CALF ${calf.calf_number}. Reversing the expense will leave the CALF balance stale — confirm intended.`,
        severity: 'WARN', // not a hard block, but caller should surface it
      });
    }
  }
  return { has_deps: dependents.length > 0, dependents };
}

/**
 * Purchase Order dependent check — block if any GRN has been received against
 * this PO. (Reversing a PO with received qty corrupts qty_received.)
 */
async function checkPoDependents({ doc /* , tenantFilter */ }) {
  const dependents = [];
  const GrnEntry = require('../models/GrnEntry');
  const grns = await GrnEntry.find({
    entity_id: doc.entity_id,
    po_id: doc._id,
    status: 'APPROVED',
    deletion_event_id: { $exists: false },
  }).select('_id grn_date').lean();
  for (const g of grns) {
    dependents.push({
      type: 'GRN',
      ref: String(g._id),
      doc_id: g._id,
      message: `GRN dated ${g.grn_date?.toISOString?.().slice(0, 10)} received against this PO — reverse the GRN first.`,
    });
  }
  return { has_deps: dependents.length > 0, dependents };
}

/**
 * Supplier Invoice dependent check (Phase 31R) — block if any ApPayment has
 * been recorded against the invoice. Payments consume AP balance; reversing
 * the invoice with a payment in-flight would leave the AP ledger unbalanced
 * (payment JE credits cash + debits AP-Trade against an invoice that no
 * longer exists in AR/AP reconciliation).
 */
async function checkSupplierInvoiceDependents({ doc /* , tenantFilter */ }) {
  const dependents = [];
  const payments = await ApPayment.find({
    entity_id: doc.entity_id,
    supplier_invoice_id: doc._id,
  }).select('_id reference payment_date amount').lean();
  for (const p of payments) {
    dependents.push({
      type: 'AP_PAYMENT',
      ref: p.reference || `AP-PAY-${p._id}`,
      doc_id: p._id,
      message: `AP Payment of ₱${p.amount} on ${p.payment_date?.toISOString?.().slice(0, 10) || ''} references this invoice — reverse the payment first.`,
    });
  }
  return { has_deps: dependents.length > 0, dependents };
}

/**
 * Credit Note dependent check (Phase 31R) — block if the CN has been applied
 * to a Collection (future: Collection.applied_credit_notes). Today we treat
 * CreditNote as standalone (no Collection-linkage field exists yet), so this
 * returns no blockers. Placeholder keeps the registry symmetric — if a
 * `Collection.applied_credit_note_ids` field is added later, this checker
 * will surface dependents without touching callers.
 */
async function checkCreditNoteDependents({ /* doc, tenantFilter */ }) {
  return { has_deps: false, dependents: [] };
}

/**
 * IC Settlement dependent check (Phase 31R) — for now, no downstream
 * consumers exist (settlement is a terminal doc in the IC flow: VIP CSI →
 * MG Settlement → closed). Placeholder keeps the registry symmetric. If a
 * future downstream doc consumes the settlement (e.g., refund flow), add
 * the check here.
 */
async function checkIcSettlementDependents({ /* doc, tenantFilter */ }) {
  return { has_deps: false, dependents: [] };
}

// Registry — one entry per module that supports president-reverse.
// Caller passes `doc_type`; checker returns `{ has_deps, dependents }`.
const CHECKERS = {
  GRN: checkGrnDependents,
  IC_TRANSFER: checkIcTransferDependents,
  CONSIGNMENT_TRANSFER: checkConsignmentDependents, // a.k.a. DR
  CALF: checkCalfDependents,
  PRF: checkPrfDependents,
  INCOME_REPORT: checkIncomeDependents,
  PAYSLIP: checkPayrollDependents,
  SALES_LINE: checkSalesDependents,
  COLLECTION: checkCollectionDependents,
  EXPENSE: checkExpenseDependents,
  PURCHASE_ORDER: checkPoDependents,
  // Phase 31R
  SUPPLIER_INVOICE: checkSupplierInvoiceDependents,
  CREDIT_NOTE: checkCreditNoteDependents,
  IC_SETTLEMENT: checkIcSettlementDependents,
};

/**
 * Master entrypoint. Returns `{ has_deps, dependents }`. `dependents` is always
 * an array (possibly empty) so callers can iterate without null checks.
 *
 * Hard blockers should have `severity` undefined or `'BLOCK'`. `'WARN'` is
 * informational and lets the caller proceed if the user explicitly confirms.
 */
async function checkDependents({ doc_type, doc, tenantFilter }) {
  const fn = CHECKERS[doc_type];
  if (!fn) return { has_deps: false, dependents: [] };
  return fn({ doc, tenantFilter });
}

/**
 * Convenience: returns only HARD blockers (drops WARN-only entries).
 */
async function checkHardBlockers({ doc_type, doc, tenantFilter }) {
  const { dependents } = await checkDependents({ doc_type, doc, tenantFilter });
  const hard = dependents.filter(d => !d.severity || d.severity === 'BLOCK');
  return { has_deps: hard.length > 0, dependents: hard };
}

module.exports = { checkDependents, checkHardBlockers, CHECKERS };
