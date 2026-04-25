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
// Phase G4.3 — Sales Goal plan reversal guards
const IncentivePayout = require('../models/IncentivePayout');
const PettyCashTransaction = require('../models/PettyCashTransaction');
const SmerEntry = require('../models/SmerEntry');
const CarLogbookEntry = require('../models/CarLogbookEntry');
const CarLogbookCycle = require('../models/CarLogbookCycle');
const OfficeSupplyTransaction = require('../models/OfficeSupplyTransaction');

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
  // eslint-disable-next-line vip-tenant/require-entity-filter -- by-event_id cascade: eventIds were collected from entity-scoped InventoryLedger above
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
  // eslint-disable-next-line vip-tenant/require-entity-filter -- by-event_id cascade: target_event_id is the unique IC-receive event (by definition entity-bound)
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

/**
 * Sales Goal Plan dependent check (Phase G4.3) — HARD block when any
 * IncentivePayout under the plan is PAID. Paid payouts moved cash out through
 * the settlement JE (and potentially paid_via Payslip — there's no direct
 * Payslip→Payout link, so we treat PAID as the cash-event-out signal).
 * Reversing the plan rips the accrual+settlement JEs via reverseSalesGoalPlan;
 * that corrupts the ledger if the settlement already landed as real cash. The
 * approver must reverse the PAID payout explicitly (IncentivePayout REVERSED
 * lifecycle) before reversing the plan.
 *
 * Informational WARN: any Payslip in the same fiscal year + bdm_id with
 * `earnings.incentive > 0` is surfaced so the approver can confirm nothing
 * double-booked through payroll. Not a hard block — Payslip.earnings.incentive
 * is a plain number with no programmatic link to IncentivePayout today.
 */
async function checkSalesGoalPlanDependents({ doc }) {
  const dependents = [];
  const paid = await IncentivePayout.find({
    entity_id: doc.entity_id,
    plan_id: doc._id,
    status: 'PAID',
  }).select('_id period bdm_id tier_label tier_budget paid_via paid_at settlement_journal_id').lean();
  for (const p of paid) {
    dependents.push({
      type: 'INCENTIVE_PAYOUT',
      ref: `${p.tier_label || p.tier_code || 'Tier'} · ${p.period || ''}`.trim(),
      doc_id: p._id,
      message: `IncentivePayout ${p._id} is PAID (${p.paid_via || 'unknown channel'}${p.paid_at ? ` on ${p.paid_at.toISOString().slice(0, 10)}` : ''}) — reverse the payout first so the settlement JE unwinds cleanly before reversing the plan.`,
    });
  }

  // WARN — Payslip cross-reference (same fiscal_year + bdm_id with non-zero
  // incentive earnings). Weak link (no schema FK), so advisory only.
  const bdmIds = [...new Set(paid.map(p => String(p.bdm_id)).filter(Boolean))];
  if (bdmIds.length && doc.fiscal_year) {
    const yrPrefix = `${doc.fiscal_year}-`;
    const payslips = await Payslip.find({
      entity_id: doc.entity_id,
      period: { $regex: `^${yrPrefix}` },
      'earnings.incentive': { $gt: 0 },
      status: { $in: ['APPROVED', 'POSTED'] },
    }).select('_id period person_id earnings.incentive status').lean();
    for (const ps of payslips) {
      dependents.push({
        type: 'PAYSLIP',
        ref: `${ps.period}`,
        doc_id: ps._id,
        severity: 'WARN',
        message: `Payslip ${ps.period} (${ps.status}) carries ₱${ps.earnings?.incentive} in incentive earnings — confirm it isn't a duplicate of a PAID payout from this plan before reversing.`,
      });
    }
  }

  return { has_deps: dependents.length > 0, dependents };
}

/**
 * Petty Cash transaction dependent check (Phase G4.3) — block if any LATER
 * POSTED transaction on the same fund exists. Petty cash maintains a running
 * balance; reversing a middle-of-sequence txn without recomputing downstream
 * balances silently corrupts every subsequent `running_balance`. Force the
 * approver to reverse the LIFO tail first (VOID the most-recent POSTED txn,
 * then work backwards) so the balance chain stays intact.
 */
async function checkPettyCashTxnDependents({ doc }) {
  const dependents = [];
  if (!doc.fund_id || !doc.txn_date) return { has_deps: false, dependents };
  // eslint-disable-next-line vip-tenant/require-entity-filter -- by-fund_id cascade: fund is entity-scoped and same-fund txns share the running balance chain
  const later = await PettyCashTransaction.find({
    fund_id: doc.fund_id,
    _id: { $ne: doc._id },
    status: 'POSTED',
    txn_date: { $gte: doc.txn_date },
  }).select('_id txn_number txn_type amount txn_date').sort({ txn_date: -1 }).limit(10).lean();
  for (const l of later) {
    dependents.push({
      type: 'PETTY_CASH_TXN',
      ref: l.txn_number || String(l._id),
      doc_id: l._id,
      message: `Later POSTED ${l.txn_type} ${l.txn_number || l._id} (₱${l.amount}, ${l.txn_date?.toISOString?.().slice(0, 10)}) on the same fund — reverse the most-recent POSTED txn first to preserve the running-balance chain.`,
    });
  }
  return { has_deps: dependents.length > 0, dependents };
}

/**
 * SMER Entry dependent check (Phase G4.3) — block if an IncomeReport has
 * already consumed this SMER's total_reimbursable (via source_refs.smer_id).
 * Reversing the SMER without reversing the IncomeReport leaves the BDM's
 * net_pay crediting a figure that no longer has an underlying ledger entry.
 */
async function checkSmerEntryDependents({ doc }) {
  const dependents = [];
  const incomeRefs = await IncomeReport.find({
    entity_id: doc.entity_id,
    'source_refs.smer_id': doc._id,
    status: { $in: ['GENERATED', 'REVIEWED', 'BDM_CONFIRMED', 'CREDITED'] },
    deletion_event_id: { $exists: false },
  }).select('_id period status').lean();
  for (const ir of incomeRefs) {
    dependents.push({
      type: 'INCOME_REPORT',
      ref: `${ir.period}/${ir.status}`,
      doc_id: ir._id,
      message: `IncomeReport ${ir.period} (${ir.status}) credits the SMER reimbursable — reverse the income report first to release the SMER.`,
    });
  }
  return { has_deps: dependents.length > 0, dependents };
}

/**
 * Car Logbook dependent check (Phase G4.3) — block if any of the cycle's
 * fuel entries reference a POSTED CALF (cycle-funded fuel ties back to a
 * cash advance that has already been expensed). The period-lock gate is the
 * primary safety net; this adds a second-layer check on explicit CALF linkage.
 */
async function checkCarLogbookDependents({ doc }) {
  const dependents = [];
  // Collect per-day docs: either `doc` IS a CarLogbookEntry, or it's a
  // CarLogbookCycle wrapper — in which case we fan out to days.
  const isCycle = doc.constructor && doc.constructor.modelName === 'CarLogbookCycle';
  const dayDocs = isCycle
    // eslint-disable-next-line vip-tenant/require-entity-filter -- by-cycle_id cascade: cycle is the entity-scoped parent doc passed in
    ? await CarLogbookEntry.find({ cycle_id: doc._id }).select('fuel_entries').lean()
    : [doc];

  const calfIds = [];
  for (const day of dayDocs) {
    for (const f of (day.fuel_entries || [])) {
      if (f.calf_id) calfIds.push(f.calf_id);
    }
  }
  if (!calfIds.length) return { has_deps: false, dependents };

  // eslint-disable-next-line vip-tenant/require-entity-filter -- by-_id cascade: calfIds were collected from entity-scoped CarLogbook fuel_entries above
  const calfs = await PrfCalf.find({
    _id: { $in: calfIds },
    doc_type: 'CALF',
    status: 'POSTED',
    deletion_event_id: { $exists: false },
  }).select('_id calf_number amount').lean();
  for (const c of calfs) {
    dependents.push({
      type: 'CALF',
      ref: c.calf_number || String(c._id),
      doc_id: c._id,
      severity: 'WARN',
      message: `Fuel entry linked to POSTED CALF ${c.calf_number || c._id} (₱${c.amount}) — reversing the logbook leaves the CALF liquidation stale. Confirm intended.`,
    });
  }
  return { has_deps: dependents.length > 0, dependents };
}

/**
 * Office Supply Item dependent check (Phase G4.3) — block if the item still
 * has active (non-reversed) transactions. Reversing an item that downstream
 * txns reference would orphan qty math and break inventory reports.
 */
async function checkOfficeSupplyItemDependents({ doc }) {
  const dependents = [];
  const activeTxns = await OfficeSupplyTransaction.find({
    entity_id: doc.entity_id,
    supply_id: doc._id,
    deletion_event_id: { $exists: false },
  }).select('_id txn_type txn_date qty').limit(5).lean();
  for (const t of activeTxns) {
    dependents.push({
      type: 'OFFICE_SUPPLY_TXN',
      ref: `${t.txn_type} ${t.qty}`,
      doc_id: t._id,
      message: `Active ${t.txn_type} txn (qty ${t.qty}, ${t.txn_date?.toISOString?.().slice(0, 10)}) references this item — reverse the transactions first.`,
    });
  }
  return { has_deps: dependents.length > 0, dependents };
}

/**
 * Office Supply Transaction dependent check (Phase G4.3) — no downstream
 * consumers today (txns are terminal). Placeholder keeps the CHECKERS
 * registry symmetric so future linkage (e.g., cost-allocation reports) can
 * attach without touching callers.
 */
async function checkOfficeSupplyTxnDependents({ /* doc */ }) {
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
  // Phase G4.3 — Reversal Console gap closure
  SALES_GOAL_PLAN:    checkSalesGoalPlanDependents,
  PETTY_CASH_TXN:     checkPettyCashTxnDependents,
  SMER_ENTRY:         checkSmerEntryDependents,
  CAR_LOGBOOK:        checkCarLogbookDependents,
  OFFICE_SUPPLY_ITEM: checkOfficeSupplyItemDependents,
  OFFICE_SUPPLY_TXN:  checkOfficeSupplyTxnDependents,
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
