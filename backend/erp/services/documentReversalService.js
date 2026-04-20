/**
 * Document Reversal Service — President-Only "Delete & Reverse Everything"
 *
 * Central dispatcher that knows how to reverse + delete any transactional document
 * across all ERP modules. Uses SAP Storno pattern for POSTED documents (original
 * stays POSTED in original period, reversal entries post to current period, audit
 * trail preserved). Hard-deletes DRAFT/ERROR rows since they have no side effects.
 *
 * Subscription/scalability:
 *   - Handlers registered in REVERSAL_HANDLERS map; one entry per module.
 *   - Sub-permission gating is lookup-driven (ERP_SUB_PERMISSION → accounting.reverse_posted),
 *     subscribers configure who can trigger from the Access Template editor.
 *   - Cross-entity isolation: every load() function applies tenantFilter.
 *   - Period-lock landing check: reversal posts to current month; refuses if that
 *     month is locked for the relevant module (lookup-driven module key map).
 *   - Dependent-doc pre-flight blocker prevents reversing an upstream doc whose
 *     stock/funds have been consumed downstream (see dependentDocChecker.js).
 *
 * Authorization: routes must be gated by `erpSubAccessCheck('accounting','reverse_posted')`.
 * President auto-passes that. The cross-module Console list/history routes are gated
 * by `erpSubAccessCheck('accounting','reversal_console')` (read-only).
 *
 * Period-lock policy: the original document is NOT modified in its original period.
 * Reversal entries (JEs, ledger adjustments) are created in the current open period
 * — same behavior as `reverseJournal()` in journalEngine.js.
 */

const mongoose = require('mongoose');

// Models
const SalesLine = require('../models/SalesLine');
const Collection = require('../models/Collection');
const ExpenseEntry = require('../models/ExpenseEntry');
const PrfCalf = require('../models/PrfCalf');
const IncomeReport = require('../models/IncomeReport');
const Payslip = require('../models/Payslip');
const GrnEntry = require('../models/GrnEntry');
const InterCompanyTransfer = require('../models/InterCompanyTransfer');
const ConsignmentTracker = require('../models/ConsignmentTracker');
const PettyCashTransaction = require('../models/PettyCashTransaction');
const PettyCashFund = require('../models/PettyCashFund');
const PurchaseOrder = require('../models/PurchaseOrder');
const InventoryLedger = require('../models/InventoryLedger');
const JournalEntry = require('../models/JournalEntry');
const TransactionEvent = require('../models/TransactionEvent');
const PeriodLock = require('../models/PeriodLock');
const ErpAuditLog = require('../models/ErpAuditLog');
// Phase SG-3R — Sales Goal plan reversal (cascade to targets/snapshots/payouts)
const SalesGoalPlan = require('../models/SalesGoalPlan');
const SalesGoalTarget = require('../models/SalesGoalTarget');
const KpiSnapshot = require('../models/KpiSnapshot');
const IncentivePayout = require('../models/IncentivePayout');
// Phase 31R — SMER, Car Logbook, Supplier Invoice, Credit Note, IC Settlement
const SmerEntry = require('../models/SmerEntry');
const CarLogbookEntry = require('../models/CarLogbookEntry');
const SupplierInvoice = require('../models/SupplierInvoice');
const CreditNote = require('../models/CreditNote');
const IcSettlement = require('../models/IcSettlement');
const ApPayment = require('../models/ApPayment');
// Phase 31R-OS — office supply reversal (master + transactions).
const OfficeSupply = require('../models/OfficeSupply');
const OfficeSupplyTransaction = require('../models/OfficeSupplyTransaction');

const { reverseJournal } = require('./journalEngine');
const { checkHardBlockers } = require('./dependentDocChecker');

// ───────────────────────────────────────────────────────────────────────────────
// Module → period-lock key mapping (matches PeriodLock.module enum)
// ───────────────────────────────────────────────────────────────────────────────

const PERIOD_LOCK_MODULE = {
  SALES_LINE: 'SALES',
  COLLECTION: 'COLLECTION',
  EXPENSE: 'EXPENSE',
  CALF: 'EXPENSE',
  PRF: 'EXPENSE',
  INCOME_REPORT: 'INCOME',
  PAYSLIP: 'PAYROLL',
  GRN: 'INVENTORY',
  IC_TRANSFER: 'IC_TRANSFER',
  CONSIGNMENT_TRANSFER: 'INVENTORY',
  PETTY_CASH_TXN: 'PETTY_CASH',
  JOURNAL_ENTRY: 'JOURNAL',
  // Phase SG-3R — plan reversal cascades through reverseJournal for every
  // linked IncentivePayout, producing reversal JEs in the current period.
  // Gate against the JOURNAL period-lock (the module that actually receives
  // the reversal entries). The route-level `periodLockCheck('INCENTIVE_PAYOUT')`
  // on /incentive-payouts/:id/reverse already covers direct payout reversal;
  // here we only need to protect the journal landing zone for cascades.
  // (Phase SG-Q2 W4: INCENTIVE_PAYOUT is now a valid PeriodLock.module enum
  // value, so future variants could choose it explicitly if needed.)
  SALES_GOAL_PLAN: 'JOURNAL',
  // Phase 31R — SMER + Car Logbook route through the EXPENSE period lock (same
  // as ExpenseEntry/CALF/PRF — see expenseRoutes.js where all four submit/reopen
  // routes use periodLockCheck('EXPENSE')). Supplier Invoice lands in PURCHASING,
  // Credit Note in SALES (its JE is a Sales Returns reversal), and IC Settlement
  // in BANKING (cash receipt from subsidiary).
  SMER_ENTRY:       'EXPENSE',
  CAR_LOGBOOK:      'EXPENSE',
  SUPPLIER_INVOICE: 'PURCHASING',
  CREDIT_NOTE:      'SALES',
  IC_SETTLEMENT:    'BANKING',
};

// ───────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Refuse the reversal if the *current* period (where the reversal entries will
 * land) is locked for the relevant module. Original period is never touched, so
 * this is the only lock that matters for SAP Storno reversal.
 */
async function assertReversalPeriodOpen({ doc_type, entityId }) {
  const moduleKey = PERIOD_LOCK_MODULE[doc_type];
  if (!moduleKey || !entityId) return;
  const now = new Date();
  const lock = await PeriodLock.findOne({
    entity_id: entityId,
    module: moduleKey,
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    is_locked: true,
  }).lean();
  if (lock) {
    const monthName = now.toLocaleString('en', { month: 'long' });
    const err = new Error(
      `Cannot reverse — current period ${monthName} ${now.getFullYear()} is locked for ${moduleKey}. ` +
      `Reversal entries land in the current period, so unlock it first or wait until next open period.`
    );
    err.statusCode = 403;
    throw err;
  }
}

/**
 * Reverse all POSTED non-reversal JournalEntries pointing at a given event_id.
 * Idempotent: skips JEs already reversed (so partial-failure retries succeed).
 * Mirrors the existing reopen pattern in salesController/collectionController.
 */
async function reverseLinkedJEs({ event_id, reason, userId, entityId }) {
  if (!event_id) return { reversed: 0, already: 0 };

  const candidates = await JournalEntry.find({
    source_event_id: event_id,
    status: 'POSTED',
    is_reversal: { $ne: true },
  });
  if (!candidates.length) return { reversed: 0, already: 0 };

  const ids = candidates.map(j => j._id);
  const existing = await JournalEntry.find({
    corrects_je_id: { $in: ids },
  }).select('corrects_je_id').lean();
  const reversedSet = new Set(existing.map(r => r.corrects_je_id.toString()));

  let reversed = 0;
  let already = 0;
  for (const je of candidates) {
    if (reversedSet.has(je._id.toString())) {
      already++;
      continue;
    }
    await reverseJournal(je._id, `President reversal: ${reason}`, userId, entityId);
    reversed++;
  }
  return { reversed, already };
}

/**
 * Create opposite-sign InventoryLedger ADJUSTMENT entries linked to a reversal
 * event. Used by GRN, IC Transfer, Sales reversals. Operates in a session.
 */
async function reverseInventoryFor({ event_id, reversalEventId, userId, session }) {
  const originals = await InventoryLedger.find({ event_id }).session(session);
  for (const e of originals) {
    await InventoryLedger.create([{
      entity_id: e.entity_id,
      bdm_id: e.bdm_id,
      warehouse_id: e.warehouse_id || undefined,
      product_id: e.product_id,
      batch_lot_no: e.batch_lot_no,
      expiry_date: e.expiry_date,
      transaction_type: 'ADJUSTMENT',
      qty_in: e.qty_out,
      qty_out: e.qty_in,
      event_id: reversalEventId,
      recorded_by: userId,
    }], { session });
  }
  return originals.length;
}

/**
 * Create a reversal TransactionEvent. Returns the saved doc.
 */
async function createReversalEvent({ doc, doc_type, entity_id, bdm_id, reason, userId, session }) {
  const docRef =
    doc.doc_ref || doc.invoice_number || doc.cr_no || doc.calf_number || doc.prf_number ||
    doc.transfer_ref || String(doc._id);

  const payload = {
    original_doc_id: doc._id,
    original_event_id: doc.event_id || doc.source_event_id || null,
    secondary_event_id: doc.target_event_id || null,
    reason,
    mode: 'PRESIDENT_REVERSAL',
  };

  const [evt] = await TransactionEvent.create([{
    entity_id,
    bdm_id: bdm_id || null,
    event_type: `${doc_type}_REVERSAL`,
    event_date: new Date(),
    document_ref: `REV-${docRef}`,
    payload,
    corrects_event_id: doc.event_id || doc.source_event_id || null,
    created_by: userId,
  }], { session });
  return evt;
}

// ───────────────────────────────────────────────────────────────────────────────
// SALES_LINE handler
// ───────────────────────────────────────────────────────────────────────────────

async function loadSale({ doc_id, tenantFilter }) {
  const sale = await SalesLine.findOne({ _id: doc_id, ...tenantFilter });
  if (!sale) { const e = new Error('Sales transaction not found in your scope'); e.statusCode = 404; throw e; }
  if (sale.deletion_event_id) { const e = new Error('This sale has already been reversed/deleted'); e.statusCode = 409; throw e; }
  return sale;
}

async function reverseSale({ doc, userId, reason, tenantFilter }) {
  const sideEffects = [];

  if (!doc.event_id) {
    await SalesLine.deleteOne({ _id: doc._id, ...tenantFilter });
    sideEffects.push('hard_deleted');
    return { doc_type: 'SALES_LINE', doc_id: doc._id, doc_ref: doc.doc_ref || doc.invoice_number, mode: 'HARD_DELETE', reversal_event_id: null, side_effects: sideEffects };
  }

  await assertReversalPeriodOpen({ doc_type: 'SALES_LINE', entityId: doc.entity_id });
  const { has_deps, dependents } = await checkHardBlockers({ doc_type: 'SALES_LINE', doc, tenantFilter });
  if (has_deps) {
    const err = new Error(`Cannot reverse — ${dependents.length} downstream POSTED document(s) depend on this sale. Reverse them first.`);
    err.statusCode = 409; err.dependents = dependents; throw err;
  }

  const { reversed, already } = await reverseLinkedJEs({ event_id: doc.event_id, reason, userId, entityId: doc.entity_id });
  if (reversed) sideEffects.push(`journals_reversed=${reversed}`);
  if (already) sideEffects.push(`journals_already_reversed=${already}`);

  const session = await mongoose.startSession();
  let reversalEvent;
  try {
    await session.withTransaction(async () => {
      reversalEvent = await createReversalEvent({ doc, doc_type: 'SALES_LINE', entity_id: doc.entity_id, bdm_id: doc.bdm_id, reason, userId, session });
      const restored = await reverseInventoryFor({ event_id: doc.event_id, reversalEventId: reversalEvent._id, userId, session });
      if (restored) sideEffects.push(`inventory_restored=${restored}`);

      let consignmentTouched = 0;
      for (const item of doc.line_items || []) {
        const consignment = await ConsignmentTracker.findOne({
          entity_id: doc.entity_id, hospital_id: doc.hospital_id, product_id: item.product_id,
          'conversions.sales_line_id': doc._id,
        }).session(session);
        if (consignment) {
          consignment.conversions = consignment.conversions.filter(
            c => !c.sales_line_id || c.sales_line_id.toString() !== doc._id.toString()
          );
          consignment.qty_consumed = Math.max(0, consignment.qty_consumed - item.qty);
          await consignment.save({ session });
          consignmentTouched++;
        }
      }
      if (consignmentTouched) sideEffects.push(`consignment_restored=${consignmentTouched}`);

      if (doc.petty_cash_fund_id) {
        const pcTxn = await PettyCashTransaction.findOne({
          linked_sales_line_id: doc._id, txn_type: 'DEPOSIT', status: 'POSTED',
        }).session(session);
        if (pcTxn) {
          pcTxn.status = 'VOIDED'; pcTxn.voided_at = new Date(); pcTxn.voided_by = userId;
          pcTxn.void_reason = `President-reversed: ${doc.sale_type || 'CSI'} ${doc.invoice_number || doc.doc_ref || ''}`;
          await pcTxn.save({ session });
          await PettyCashFund.findByIdAndUpdate(pcTxn.fund_id, { $inc: { current_balance: -pcTxn.amount } }, { session });
          sideEffects.push('petty_cash_voided');
        }
      }

      doc.deletion_event_id = reversalEvent._id;
      await doc.save({ session });
    });
  } finally { session.endSession(); }

  return { doc_type: 'SALES_LINE', doc_id: doc._id, doc_ref: doc.doc_ref || doc.invoice_number, mode: 'SAP_STORNO', reversal_event_id: reversalEvent?._id, side_effects: sideEffects };
}

// ───────────────────────────────────────────────────────────────────────────────
// COLLECTION handler
// ───────────────────────────────────────────────────────────────────────────────

async function loadCollection({ doc_id, tenantFilter }) {
  const c = await Collection.findOne({ _id: doc_id, ...tenantFilter });
  if (!c) { const e = new Error('Collection not found in your scope'); e.statusCode = 404; throw e; }
  if (c.deletion_event_id) { const e = new Error('Collection already reversed'); e.statusCode = 409; throw e; }
  return c;
}

async function reverseCollection({ doc, userId, reason, tenantFilter }) {
  const sideEffects = [];

  // DELETION_REQUESTED rows still carry a POSTED ledger (event_id + JEs + petty cash
  // deposit + VAT/CWT entries) — they must go through SAP Storno, not hard-delete.
  // Hard-delete only if the row never posted. Mirrors reverseExpense/makeReversePrfCalf.
  if (doc.status !== 'POSTED' && doc.status !== 'DELETION_REQUESTED') {
    await Collection.deleteOne({ _id: doc._id, ...tenantFilter });
    return { doc_type: 'COLLECTION', doc_id: doc._id, doc_ref: doc.cr_no, mode: 'HARD_DELETE', reversal_event_id: null, side_effects: ['hard_deleted'] };
  }

  await assertReversalPeriodOpen({ doc_type: 'COLLECTION', entityId: doc.entity_id });
  const { has_deps, dependents } = await checkHardBlockers({ doc_type: 'COLLECTION', doc, tenantFilter });
  if (has_deps) {
    const err = new Error(`Cannot reverse — POSTED PRF(s) reference this collection's rebate. Reverse them first.`);
    err.statusCode = 409; err.dependents = dependents; throw err;
  }

  const { reversed, already } = await reverseLinkedJEs({ event_id: doc.event_id, reason, userId, entityId: doc.entity_id });
  if (reversed) sideEffects.push(`journals_reversed=${reversed}`);
  if (already) sideEffects.push(`journals_already_reversed=${already}`);

  const session = await mongoose.startSession();
  let reversalEvent;
  try {
    await session.withTransaction(async () => {
      reversalEvent = await createReversalEvent({ doc, doc_type: 'COLLECTION', entity_id: doc.entity_id, bdm_id: doc.bdm_id, reason, userId, session });

      let releasedCsis = 0;
      for (const sc of doc.settled_csis || []) {
        if (!sc.sales_line_id) continue;
        await SalesLine.updateOne(
          { _id: sc.sales_line_id, entity_id: doc.entity_id },
          { $pull: { settled_by_collection_ids: doc._id } },
          { session }
        );
        releasedCsis++;
      }
      if (releasedCsis) sideEffects.push(`csis_released=${releasedCsis}`);

      if (doc.petty_cash_fund_id) {
        const pcTxn = await PettyCashTransaction.findOne({
          linked_collection_id: doc._id, txn_type: 'DEPOSIT', status: 'POSTED',
        }).session(session);
        if (pcTxn) {
          pcTxn.status = 'VOIDED'; pcTxn.voided_at = new Date(); pcTxn.voided_by = userId;
          pcTxn.void_reason = `President-reversed Collection ${doc.cr_no || ''}`;
          await pcTxn.save({ session });
          await PettyCashFund.findByIdAndUpdate(pcTxn.fund_id, { $inc: { current_balance: -pcTxn.amount } }, { session });
          sideEffects.push('petty_cash_voided');
        }
      }

      doc.deletion_event_id = reversalEvent._id;
      await doc.save({ session });
    });
  } finally { session.endSession(); }

  return { doc_type: 'COLLECTION', doc_id: doc._id, doc_ref: doc.cr_no, mode: 'SAP_STORNO', reversal_event_id: reversalEvent?._id, side_effects: sideEffects };
}

// ───────────────────────────────────────────────────────────────────────────────
// EXPENSE handler
// ───────────────────────────────────────────────────────────────────────────────

async function loadExpense({ doc_id, tenantFilter }) {
  const e = await ExpenseEntry.findOne({ _id: doc_id, ...tenantFilter });
  if (!e) { const x = new Error('Expense not found in your scope'); x.statusCode = 404; throw x; }
  if (e.deletion_event_id) { const x = new Error('Expense already reversed'); x.statusCode = 409; throw x; }
  return e;
}

async function reverseExpense({ doc, userId, reason, tenantFilter }) {
  const sideEffects = [];
  if (doc.status !== 'POSTED' && doc.status !== 'DELETION_REQUESTED') {
    await ExpenseEntry.deleteOne({ _id: doc._id, ...tenantFilter });
    return { doc_type: 'EXPENSE', doc_id: doc._id, doc_ref: doc.period, mode: 'HARD_DELETE', reversal_event_id: null, side_effects: ['hard_deleted'] };
  }
  await assertReversalPeriodOpen({ doc_type: 'EXPENSE', entityId: doc.entity_id });

  const { reversed, already } = await reverseLinkedJEs({ event_id: doc.event_id, reason, userId, entityId: doc.entity_id });
  if (reversed) sideEffects.push(`journals_reversed=${reversed}`);
  if (already) sideEffects.push(`journals_already_reversed=${already}`);

  const session = await mongoose.startSession();
  let reversalEvent;
  try {
    await session.withTransaction(async () => {
      reversalEvent = await createReversalEvent({ doc, doc_type: 'EXPENSE', entity_id: doc.entity_id, bdm_id: doc.bdm_id, reason, userId, session });
      doc.deletion_event_id = reversalEvent._id;
      await doc.save({ session });
    });
  } finally { session.endSession(); }

  return { doc_type: 'EXPENSE', doc_id: doc._id, doc_ref: doc.period, mode: 'SAP_STORNO', reversal_event_id: reversalEvent?._id, side_effects: sideEffects };
}

// ───────────────────────────────────────────────────────────────────────────────
// CALF / PRF handler (shared model PrfCalf, doc_type discriminator)
// ───────────────────────────────────────────────────────────────────────────────

function makeLoadPrfCalf(docTypeKey) {
  return async ({ doc_id, tenantFilter }) => {
    const d = await PrfCalf.findOne({ _id: doc_id, doc_type: docTypeKey, ...tenantFilter });
    if (!d) { const e = new Error(`${docTypeKey} not found in your scope`); e.statusCode = 404; throw e; }
    if (d.deletion_event_id) { const e = new Error(`${docTypeKey} already reversed`); e.statusCode = 409; throw e; }
    return d;
  };
}

function makeReversePrfCalf(docTypeKey) {
  return async ({ doc, userId, reason, tenantFilter }) => {
    const sideEffects = [];

    if (doc.status !== 'POSTED' && doc.status !== 'DELETION_REQUESTED') {
      await PrfCalf.deleteOne({ _id: doc._id, ...tenantFilter });
      return { doc_type: docTypeKey, doc_id: doc._id, doc_ref: doc.calf_number || doc.prf_number, mode: 'HARD_DELETE', reversal_event_id: null, side_effects: ['hard_deleted'] };
    }

    await assertReversalPeriodOpen({ doc_type: docTypeKey, entityId: doc.entity_id });
    const { has_deps, dependents } = await checkHardBlockers({ doc_type: docTypeKey, doc, tenantFilter });
    if (has_deps) {
      const err = new Error(`Cannot reverse ${docTypeKey} — ${dependents.length} dependent doc(s) still POSTED.`);
      err.statusCode = 409; err.dependents = dependents; throw err;
    }

    const { reversed, already } = await reverseLinkedJEs({ event_id: doc.event_id, reason, userId, entityId: doc.entity_id });
    if (reversed) sideEffects.push(`journals_reversed=${reversed}`);
    if (already) sideEffects.push(`journals_already_reversed=${already}`);

    const session = await mongoose.startSession();
    let reversalEvent;
    try {
      await session.withTransaction(async () => {
        reversalEvent = await createReversalEvent({ doc, doc_type: docTypeKey, entity_id: doc.entity_id, bdm_id: doc.bdm_id, reason, userId, session });

        if (docTypeKey === 'CALF' && doc.linked_expense_id) {
          await ExpenseEntry.updateOne(
            { _id: doc.linked_expense_id, status: { $ne: 'POSTED' } },
            { $unset: { 'lines.$[].calf_id': '' } },
            { session }
          );
          sideEffects.push('expense_calf_links_cleared');
        }

        if (docTypeKey === 'PRF' && doc.linked_collection_id) {
          await Collection.updateOne(
            { _id: doc.linked_collection_id },
            { $unset: { rebate_prf_id: '' } },
            { session }
          );
          sideEffects.push('collection_prf_link_cleared');
        }

        doc.deletion_event_id = reversalEvent._id;
        await doc.save({ session });
      });
    } finally { session.endSession(); }

    return { doc_type: docTypeKey, doc_id: doc._id, doc_ref: doc.calf_number || doc.prf_number, mode: 'SAP_STORNO', reversal_event_id: reversalEvent?._id, side_effects: sideEffects };
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// GRN handler
// ───────────────────────────────────────────────────────────────────────────────

async function loadGrn({ doc_id, tenantFilter }) {
  const g = await GrnEntry.findOne({ _id: doc_id, ...tenantFilter });
  if (!g) { const e = new Error('GRN not found in your scope'); e.statusCode = 404; throw e; }
  if (g.deletion_event_id) { const e = new Error('GRN already reversed'); e.statusCode = 409; throw e; }
  return g;
}

async function reverseGrn({ doc, userId, reason, tenantFilter }) {
  const sideEffects = [];

  if (doc.status === 'PENDING' || doc.status === 'REJECTED') {
    await GrnEntry.deleteOne({ _id: doc._id, ...tenantFilter });
    return { doc_type: 'GRN', doc_id: doc._id, doc_ref: String(doc._id), mode: 'HARD_DELETE', reversal_event_id: null, side_effects: ['hard_deleted'] };
  }

  await assertReversalPeriodOpen({ doc_type: 'GRN', entityId: doc.entity_id });
  const { has_deps, dependents } = await checkHardBlockers({ doc_type: 'GRN', doc, tenantFilter });
  if (has_deps) {
    const err = new Error(`Cannot reverse GRN — ${dependents.length} downstream POSTED doc(s) consumed batches from this receipt. Reverse them first.`);
    err.statusCode = 409; err.dependents = dependents; throw err;
  }

  const { reversed, already } = await reverseLinkedJEs({ event_id: doc.event_id, reason, userId, entityId: doc.entity_id });
  if (reversed) sideEffects.push(`journals_reversed=${reversed}`);
  if (already) sideEffects.push(`journals_already_reversed=${already}`);

  const session = await mongoose.startSession();
  let reversalEvent;
  try {
    await session.withTransaction(async () => {
      reversalEvent = await createReversalEvent({ doc, doc_type: 'GRN', entity_id: doc.entity_id, bdm_id: doc.bdm_id, reason, userId, session });

      const restored = await reverseInventoryFor({ event_id: doc.event_id, reversalEventId: reversalEvent._id, userId, session });
      if (restored) sideEffects.push(`inventory_returned=${restored}`);

      if (doc.po_id) {
        const po = await PurchaseOrder.findOne({ _id: doc.po_id, entity_id: doc.entity_id }).session(session);
        if (po) {
          for (const li of doc.line_items || []) {
            if (li.po_line_index === undefined || li.po_line_index === null) continue;
            const poLine = po.line_items?.[li.po_line_index];
            if (poLine) {
              poLine.qty_received = Math.max(0, (poLine.qty_received || 0) - (li.qty || 0));
            }
          }
          await po.save({ session });
          sideEffects.push('po_qty_received_rolled_back');
        }
      }

      doc.deletion_event_id = reversalEvent._id;
      await doc.save({ session });
    });
  } finally { session.endSession(); }

  return { doc_type: 'GRN', doc_id: doc._id, doc_ref: `GRN-${doc._id}`, mode: 'SAP_STORNO', reversal_event_id: reversalEvent?._id, side_effects: sideEffects };
}

// ───────────────────────────────────────────────────────────────────────────────
// IC TRANSFER handler (dual-event reversal)
// ───────────────────────────────────────────────────────────────────────────────

async function loadIcTransfer({ doc_id, tenantFilter }) {
  const t = await InterCompanyTransfer.findById(doc_id);
  if (!t) { const e = new Error('IC Transfer not found'); e.statusCode = 404; throw e; }
  if (t.deletion_event_id) { const e = new Error('IC Transfer already reversed'); e.statusCode = 409; throw e; }

  if (tenantFilter?.entity_id) {
    const ent = String(tenantFilter.entity_id);
    if (String(t.source_entity_id) !== ent && String(t.target_entity_id) !== ent) {
      const e = new Error('IC Transfer not in your scope'); e.statusCode = 403; throw e;
    }
  }
  return t;
}

async function reverseIcTransfer({ doc, userId, reason, tenantFilter }) {
  const sideEffects = [];
  if (['DRAFT', 'APPROVED', 'CANCELLED'].includes(doc.status)) {
    await InterCompanyTransfer.deleteOne({ _id: doc._id });
    return { doc_type: 'IC_TRANSFER', doc_id: doc._id, doc_ref: doc.transfer_ref, mode: 'HARD_DELETE', reversal_event_id: null, side_effects: ['hard_deleted'] };
  }

  await assertReversalPeriodOpen({ doc_type: 'IC_TRANSFER', entityId: doc.source_entity_id });
  await assertReversalPeriodOpen({ doc_type: 'IC_TRANSFER', entityId: doc.target_entity_id });
  const { has_deps, dependents } = await checkHardBlockers({ doc_type: 'IC_TRANSFER', doc, tenantFilter });
  if (has_deps) {
    const err = new Error(`Cannot reverse IC Transfer — ${dependents.length} target-entity sale(s) consumed transferred stock. Reverse them first.`);
    err.statusCode = 409; err.dependents = dependents; throw err;
  }

  if (doc.source_event_id) {
    const r1 = await reverseLinkedJEs({ event_id: doc.source_event_id, reason, userId, entityId: doc.source_entity_id });
    if (r1.reversed) sideEffects.push(`source_journals_reversed=${r1.reversed}`);
    if (r1.already) sideEffects.push(`source_journals_already_reversed=${r1.already}`);
  }
  if (doc.target_event_id) {
    const r2 = await reverseLinkedJEs({ event_id: doc.target_event_id, reason, userId, entityId: doc.target_entity_id });
    if (r2.reversed) sideEffects.push(`target_journals_reversed=${r2.reversed}`);
    if (r2.already) sideEffects.push(`target_journals_already_reversed=${r2.already}`);
  }

  const session = await mongoose.startSession();
  let sourceRev, targetRev;
  try {
    await session.withTransaction(async () => {
      if (doc.source_event_id) {
        sourceRev = await createReversalEvent({
          doc: { ...doc.toObject(), event_id: doc.source_event_id },
          doc_type: 'IC_TRANSFER_SOURCE',
          entity_id: doc.source_entity_id,
          bdm_id: doc.source_bdm_id,
          reason, userId, session,
        });
        const restored = await reverseInventoryFor({ event_id: doc.source_event_id, reversalEventId: sourceRev._id, userId, session });
        if (restored) sideEffects.push(`source_inventory_restored=${restored}`);
      }
      if (doc.target_event_id) {
        targetRev = await createReversalEvent({
          doc: { ...doc.toObject(), event_id: doc.target_event_id },
          doc_type: 'IC_TRANSFER_TARGET',
          entity_id: doc.target_entity_id,
          bdm_id: doc.target_bdm_id,
          reason, userId, session,
        });
        const removed = await reverseInventoryFor({ event_id: doc.target_event_id, reversalEventId: targetRev._id, userId, session });
        if (removed) sideEffects.push(`target_inventory_removed=${removed}`);
      }

      doc.deletion_event_id = sourceRev?._id || targetRev?._id;
      await doc.save({ session });
    });
  } finally { session.endSession(); }

  return {
    doc_type: 'IC_TRANSFER', doc_id: doc._id, doc_ref: doc.transfer_ref, mode: 'SAP_STORNO',
    reversal_event_id: sourceRev?._id || targetRev?._id,
    secondary_reversal_event_id: sourceRev && targetRev ? targetRev._id : null,
    side_effects: sideEffects,
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// CONSIGNMENT (DR) handler
// ───────────────────────────────────────────────────────────────────────────────

async function loadConsignment({ doc_id, tenantFilter }) {
  const c = await ConsignmentTracker.findOne({ _id: doc_id, ...tenantFilter });
  if (!c) { const e = new Error('Consignment/DR not found in your scope'); e.statusCode = 404; throw e; }
  return c;
}

async function reverseConsignment({ doc, userId, reason, tenantFilter }) {
  const { has_deps, dependents } = await checkHardBlockers({ doc_type: 'CONSIGNMENT_TRANSFER', doc, tenantFilter });
  if (has_deps) {
    const err = new Error(`Cannot remove DR — ${dependents.length} conversion(s) recorded. Reverse converting CSIs first.`);
    err.statusCode = 409; err.dependents = dependents; throw err;
  }

  await ConsignmentTracker.deleteOne({ _id: doc._id, ...tenantFilter });
  await ErpAuditLog.logChange({
    entity_id: doc.entity_id, log_type: 'PRESIDENT_REVERSAL',
    target_ref: doc._id.toString(), target_model: 'ConsignmentTracker',
    changed_by: userId, note: `DR removed (no conversions): ${reason}`,
  });
  return { doc_type: 'CONSIGNMENT_TRANSFER', doc_id: doc._id, doc_ref: `DR-${doc._id}`, mode: 'HARD_DELETE', reversal_event_id: null, side_effects: ['dr_removed'] };
}

// ───────────────────────────────────────────────────────────────────────────────
// INCOME REPORT handler
// ───────────────────────────────────────────────────────────────────────────────

async function loadIncome({ doc_id, tenantFilter }) {
  const r = await IncomeReport.findOne({ _id: doc_id, ...tenantFilter });
  if (!r) { const e = new Error('IncomeReport not found in your scope'); e.statusCode = 404; throw e; }
  if (r.deletion_event_id) { const e = new Error('IncomeReport already reversed'); e.statusCode = 409; throw e; }
  return r;
}

async function reverseIncome({ doc, userId, reason, tenantFilter }) {
  const sideEffects = [];
  if (!['CREDITED', 'BDM_CONFIRMED'].includes(doc.status)) {
    await IncomeReport.deleteOne({ _id: doc._id, ...tenantFilter });
    return { doc_type: 'INCOME_REPORT', doc_id: doc._id, doc_ref: `${doc.period}/${doc.cycle}`, mode: 'HARD_DELETE', reversal_event_id: null, side_effects: ['hard_deleted'] };
  }

  await assertReversalPeriodOpen({ doc_type: 'INCOME_REPORT', entityId: doc.entity_id });
  const { has_deps, dependents } = await checkHardBlockers({ doc_type: 'INCOME_REPORT', doc, tenantFilter });
  if (has_deps) {
    const err = new Error(`Cannot reverse IncomeReport — ${dependents.length} dependent doc(s).`);
    err.statusCode = 409; err.dependents = dependents; throw err;
  }

  const { reversed, already } = await reverseLinkedJEs({ event_id: doc.event_id, reason, userId, entityId: doc.entity_id });
  if (reversed) sideEffects.push(`journals_reversed=${reversed}`);
  if (already) sideEffects.push(`journals_already_reversed=${already}`);

  const session = await mongoose.startSession();
  let reversalEvent;
  try {
    await session.withTransaction(async () => {
      reversalEvent = await createReversalEvent({ doc, doc_type: 'INCOME_REPORT', entity_id: doc.entity_id, bdm_id: doc.bdm_id, reason, userId, session });
      const calfLines = (doc.deduction_lines || []).filter(l => l.auto_source === 'CALF');
      if (calfLines.length) sideEffects.push(`calf_deduction_lines=${calfLines.length}`);
      doc.deletion_event_id = reversalEvent._id;
      await doc.save({ session });
    });
  } finally { session.endSession(); }

  return { doc_type: 'INCOME_REPORT', doc_id: doc._id, doc_ref: `${doc.period}/${doc.cycle}`, mode: 'SAP_STORNO', reversal_event_id: reversalEvent?._id, side_effects: sideEffects };
}

// ───────────────────────────────────────────────────────────────────────────────
// PAYSLIP handler
// ───────────────────────────────────────────────────────────────────────────────

async function loadPayslip({ doc_id, tenantFilter }) {
  const p = await Payslip.findOne({ _id: doc_id, ...tenantFilter });
  if (!p) { const e = new Error('Payslip not found in your scope'); e.statusCode = 404; throw e; }
  if (p.deletion_event_id) { const e = new Error('Payslip already reversed'); e.statusCode = 409; throw e; }
  return p;
}

async function reversePayslip({ doc, userId, reason, tenantFilter }) {
  const sideEffects = [];
  if (doc.status !== 'POSTED') {
    await Payslip.deleteOne({ _id: doc._id, ...tenantFilter });
    return { doc_type: 'PAYSLIP', doc_id: doc._id, doc_ref: `${doc.period}/${doc.cycle}`, mode: 'HARD_DELETE', reversal_event_id: null, side_effects: ['hard_deleted'] };
  }
  await assertReversalPeriodOpen({ doc_type: 'PAYSLIP', entityId: doc.entity_id });

  // Older payslips may not have event_id (pre-Phase-4 schema). Fall back to
  // looking up the JE by source_module + source_doc_ref.
  let event_id = doc.event_id;
  if (!event_id) {
    const je = await JournalEntry.findOne({
      entity_id: doc.entity_id, source_module: 'PAYROLL',
      source_doc_ref: { $regex: doc.period }, status: 'POSTED',
    }).select('source_event_id').lean();
    event_id = je?.source_event_id;
  }

  const { reversed, already } = await reverseLinkedJEs({ event_id, reason, userId, entityId: doc.entity_id });
  if (reversed) sideEffects.push(`journals_reversed=${reversed}`);
  if (already) sideEffects.push(`journals_already_reversed=${already}`);

  const session = await mongoose.startSession();
  let reversalEvent;
  try {
    await session.withTransaction(async () => {
      reversalEvent = await createReversalEvent({ doc, doc_type: 'PAYSLIP', entity_id: doc.entity_id, bdm_id: null, reason, userId, session });
      doc.deletion_event_id = reversalEvent._id;
      await doc.save({ session });
    });
  } finally { session.endSession(); }

  return { doc_type: 'PAYSLIP', doc_id: doc._id, doc_ref: `${doc.period}/${doc.cycle}`, mode: 'SAP_STORNO', reversal_event_id: reversalEvent?._id, side_effects: sideEffects };
}

// ───────────────────────────────────────────────────────────────────────────────
// PETTY CASH TXN handler
// ───────────────────────────────────────────────────────────────────────────────

async function loadPettyCashTxn({ doc_id, tenantFilter }) {
  const filter = { _id: doc_id };
  if (tenantFilter?.entity_id) filter.entity_id = tenantFilter.entity_id;
  const t = await PettyCashTransaction.findOne(filter);
  if (!t) { const e = new Error('Petty cash transaction not found'); e.statusCode = 404; throw e; }
  if (t.status === 'VOIDED') { const e = new Error('Transaction already voided'); e.statusCode = 409; throw e; }
  return t;
}

async function reversePettyCashTxn({ doc, userId, reason }) {
  const sideEffects = [];
  if (doc.status !== 'POSTED') {
    await PettyCashTransaction.deleteOne({ _id: doc._id });
    return { doc_type: 'PETTY_CASH_TXN', doc_id: doc._id, doc_ref: doc.txn_no || String(doc._id), mode: 'HARD_DELETE', reversal_event_id: null, side_effects: ['hard_deleted'] };
  }

  await assertReversalPeriodOpen({ doc_type: 'PETTY_CASH_TXN', entityId: doc.entity_id });
  const { reversed, already } = await reverseLinkedJEs({ event_id: doc.event_id, reason, userId, entityId: doc.entity_id });
  if (reversed) sideEffects.push(`journals_reversed=${reversed}`);
  if (already) sideEffects.push(`journals_already_reversed=${already}`);

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      doc.status = 'VOIDED';
      doc.voided_at = new Date();
      doc.voided_by = userId;
      doc.void_reason = `President-reversed: ${reason}`;
      await doc.save({ session });
      const sign = doc.txn_type === 'DEPOSIT' ? -1 : 1;
      await PettyCashFund.findByIdAndUpdate(doc.fund_id, { $inc: { current_balance: sign * doc.amount } }, { session });
      sideEffects.push('fund_balance_adjusted');
    });
  } finally { session.endSession(); }

  return { doc_type: 'PETTY_CASH_TXN', doc_id: doc._id, doc_ref: doc.txn_no || String(doc._id), mode: 'VOID', reversal_event_id: null, side_effects: sideEffects };
}

// ───────────────────────────────────────────────────────────────────────────────
// JOURNAL_ENTRY handler — manual JE reversal
// ───────────────────────────────────────────────────────────────────────────────

async function loadJournal({ doc_id, tenantFilter }) {
  const filter = { _id: doc_id };
  if (tenantFilter?.entity_id) filter.entity_id = tenantFilter.entity_id;
  const je = await JournalEntry.findOne(filter);
  if (!je) { const e = new Error('Journal entry not found'); e.statusCode = 404; throw e; }
  const existing = await JournalEntry.findOne({ corrects_je_id: je._id }).select('_id').lean();
  if (existing) { const e = new Error('Journal entry already reversed'); e.statusCode = 409; throw e; }
  return je;
}

async function reverseManualJournal({ doc, userId, reason }) {
  if (doc.status !== 'POSTED') {
    await JournalEntry.deleteOne({ _id: doc._id });
    return { doc_type: 'JOURNAL_ENTRY', doc_id: doc._id, doc_ref: doc.je_number, mode: 'HARD_DELETE', reversal_event_id: null, side_effects: ['hard_deleted'] };
  }
  await assertReversalPeriodOpen({ doc_type: 'JOURNAL_ENTRY', entityId: doc.entity_id });
  const reversal = await reverseJournal(doc._id, `President reversal: ${reason}`, userId, doc.entity_id);
  return { doc_type: 'JOURNAL_ENTRY', doc_id: doc._id, doc_ref: doc.je_number, mode: 'SAP_STORNO', reversal_event_id: null, reversal_je_id: reversal._id, side_effects: [`reversal_je=${reversal.je_number}`] };
}

// ───────────────────────────────────────────────────────────────────────────────
// SALES_GOAL_PLAN handler — Phase SG-3R
//
// Unlike transactional documents, a Sales Goal plan has no JE of its own. The
// financial side-effects live entirely inside linked IncentivePayout rows
// (accrual JE, optional settlement JE). Reversal therefore:
//   - DRAFT plan → hard-delete plan + all DRAFT targets (no side effects).
//   - ACTIVE / CLOSED / REJECTED plan → SAP Storno cascade:
//       * every IncentivePayout with a journal_id → reverseJournal (idempotent)
//       * every IncentivePayout with a settlement_journal_id → reverseJournal
//       * every IncentivePayout row → mark REVERSED (preserves audit, prevents re-accrue)
//       * every KpiSnapshot under this plan → hard-delete (snapshots are
//         derived data, no audit value once the plan itself is reversed)
//       * every SalesGoalTarget under this plan → status = CLOSED (retain for audit)
//       * plan itself → status = REVERSED (new enum value) + deletion_event_id stamp
//   Atomic under one transaction. If any reverseJournal fails the whole thing rolls back.
// ───────────────────────────────────────────────────────────────────────────────

async function loadSalesGoalPlan({ doc_id, tenantFilter }) {
  const filter = { _id: doc_id };
  if (tenantFilter?.entity_id) filter.entity_id = tenantFilter.entity_id;
  const plan = await SalesGoalPlan.findOne(filter);
  if (!plan) { const e = new Error('Sales Goal plan not found in your scope'); e.statusCode = 404; throw e; }
  if (plan.status === 'REVERSED') { const e = new Error('Plan already reversed'); e.statusCode = 409; throw e; }
  return plan;
}

async function reverseSalesGoalPlan({ doc, userId, reason }) {
  const sideEffects = [];

  // DRAFT plans never posted a JE, never accrued; hard-delete with their targets.
  if (doc.status === 'DRAFT') {
    const session = await mongoose.startSession();
    try {
      let deletedTargets = 0;
      await session.withTransaction(async () => {
        const t = await SalesGoalTarget.deleteMany({ plan_id: doc._id }, { session });
        deletedTargets = t.deletedCount || 0;
        await SalesGoalPlan.deleteOne({ _id: doc._id }, { session });
      });
      if (deletedTargets) sideEffects.push(`targets_hard_deleted=${deletedTargets}`);
      sideEffects.push('plan_hard_deleted');
    } finally { session.endSession(); }
    return {
      doc_type: 'SALES_GOAL_PLAN',
      doc_id: doc._id,
      doc_ref: doc.reference || doc.plan_name || String(doc._id),
      mode: 'HARD_DELETE',
      reversal_event_id: null,
      side_effects: sideEffects,
    };
  }

  // Posted-plan path — ensure the period where reversal JEs will land is open
  // (lookup via INCENTIVE_PAYOUT key, matches what IncentivePayout.reverse uses).
  await assertReversalPeriodOpen({ doc_type: 'SALES_GOAL_PLAN', entityId: doc.entity_id });

  // ── Phase 1 — Reverse every IncentivePayout JE BEFORE opening the plan txn ──
  // reverseJournal runs its own session; doing it outside the plan txn keeps
  // the code symmetric with reverseManualJournal's pattern and avoids nested
  // transaction complications. Idempotent: reverseJournal skips already-reversed.
  const payouts = await IncentivePayout.find({
    plan_id: doc._id,
    status: { $in: ['ACCRUED', 'APPROVED', 'PAID'] },
  });
  let accrualJes = 0, settlementJes = 0;
  for (const p of payouts) {
    if (p.journal_id) {
      try {
        await reverseJournal(p.journal_id, `President-reversal of plan ${doc.reference || doc.plan_name}: ${reason}`, userId, doc.entity_id);
        accrualJes++;
      } catch (err) {
        // "already reversed" is fine — surface anything else as a hard failure.
        if (!/already reversed/i.test(err.message || '')) throw err;
      }
    }
    if (p.settlement_journal_id) {
      try {
        await reverseJournal(p.settlement_journal_id, `President-reversal of plan ${doc.reference || doc.plan_name} (settlement): ${reason}`, userId, doc.entity_id);
        settlementJes++;
      } catch (err) {
        if (!/already reversed/i.test(err.message || '')) throw err;
      }
    }
  }
  if (accrualJes) sideEffects.push(`accrual_jes_reversed=${accrualJes}`);
  if (settlementJes) sideEffects.push(`settlement_jes_reversed=${settlementJes}`);

  // ── Phase 2 — Flip payout + snapshot + target state under one transaction ──
  const session = await mongoose.startSession();
  let reversalEvent;
  try {
    await session.withTransaction(async () => {
      reversalEvent = await createReversalEvent({
        doc, doc_type: 'SALES_GOAL_PLAN', entity_id: doc.entity_id, bdm_id: null, reason, userId, session,
      });

      // IncentivePayout → REVERSED (preserve journal_id refs for audit).
      const payoutRes = await IncentivePayout.updateMany(
        { plan_id: doc._id, status: { $in: ['ACCRUED', 'APPROVED', 'PAID'] } },
        { $set: { status: 'REVERSED', reversed_by: userId, reversed_at: new Date(), reversal_reason: `President-reverse plan: ${reason}` } },
        { session }
      );
      if (payoutRes.modifiedCount) sideEffects.push(`payouts_reversed=${payoutRes.modifiedCount}`);

      // KpiSnapshot → delete (derived data — once plan is reversed, snapshots are meaningless).
      const snapRes = await KpiSnapshot.deleteMany({ plan_id: doc._id }, { session });
      if (snapRes.deletedCount) sideEffects.push(`snapshots_deleted=${snapRes.deletedCount}`);

      // SalesGoalTarget → CLOSED (keep for audit, prevent further use).
      const targetRes = await SalesGoalTarget.updateMany(
        { plan_id: doc._id },
        { $set: { status: 'CLOSED' } },
        { session }
      );
      if (targetRes.modifiedCount) sideEffects.push(`targets_closed=${targetRes.modifiedCount}`);

      // Plan itself.
      doc.status = 'REVERSED';
      doc.deletion_event_id = reversalEvent._id;
      await doc.save({ session });
    });
  } finally { session.endSession(); }

  return {
    doc_type: 'SALES_GOAL_PLAN',
    doc_id: doc._id,
    doc_ref: doc.reference || doc.plan_name || String(doc._id),
    mode: 'SAP_STORNO',
    reversal_event_id: reversalEvent?._id,
    side_effects: sideEffects,
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// SMER_ENTRY handler — Phase 31R
//
// SMER posts a multi-line JE (PER_DIEM/TRANSPORT/SPECIAL_TRANSPORT/OTHER_REIMBURSABLE
// debits, AR_BDM credit) via `createAndPostJournal` with source_event_id = event_id.
// Reversal mirrors `reopenSmer` (expenseController.js:315) but is SAP Storno:
// original stays POSTED with deletion_event_id stamped — NOT flipped to DRAFT.
// ───────────────────────────────────────────────────────────────────────────────

async function loadSmer({ doc_id, tenantFilter }) {
  const s = await SmerEntry.findOne({ _id: doc_id, ...tenantFilter });
  if (!s) { const e = new Error('SMER not found in your scope'); e.statusCode = 404; throw e; }
  if (s.deletion_event_id) { const e = new Error('SMER already reversed'); e.statusCode = 409; throw e; }
  return s;
}

async function reverseSmer({ doc, userId, reason, tenantFilter }) {
  const sideEffects = [];
  if (doc.status !== 'POSTED' && doc.status !== 'DELETION_REQUESTED') {
    await SmerEntry.deleteOne({ _id: doc._id, ...tenantFilter });
    return { doc_type: 'SMER_ENTRY', doc_id: doc._id, doc_ref: `SMER-${doc.period}-${doc.cycle}`, mode: 'HARD_DELETE', reversal_event_id: null, side_effects: ['hard_deleted'] };
  }
  await assertReversalPeriodOpen({ doc_type: 'SMER_ENTRY', entityId: doc.entity_id });

  const { reversed, already } = await reverseLinkedJEs({ event_id: doc.event_id, reason, userId, entityId: doc.entity_id });
  if (reversed) sideEffects.push(`journals_reversed=${reversed}`);
  if (already) sideEffects.push(`journals_already_reversed=${already}`);

  const session = await mongoose.startSession();
  let reversalEvent;
  try {
    await session.withTransaction(async () => {
      reversalEvent = await createReversalEvent({ doc, doc_type: 'SMER_ENTRY', entity_id: doc.entity_id, bdm_id: doc.bdm_id, reason, userId, session });
      doc.deletion_event_id = reversalEvent._id;
      await doc.save({ session });
    });
  } finally { session.endSession(); }

  return { doc_type: 'SMER_ENTRY', doc_id: doc._id, doc_ref: `SMER-${doc.period}-${doc.cycle}`, mode: 'SAP_STORNO', reversal_event_id: reversalEvent?._id, side_effects: sideEffects };
}

// ───────────────────────────────────────────────────────────────────────────────
// CAR_LOGBOOK handler — Phase 31R
//
// Logbook posts a JE (FUEL_GAS debit, AR_BDM credit for cash portion, funding COA
// for company-funded portion) via `createAndPostJournal` with source_event_id =
// event_id. Reversal mirrors `reopenCarLogbook` (expenseController.js:837) but is
// SAP Storno — original stays POSTED with deletion_event_id stamped.
// ───────────────────────────────────────────────────────────────────────────────

async function loadCarLogbook({ doc_id, tenantFilter }) {
  const c = await CarLogbookEntry.findOne({ _id: doc_id, ...tenantFilter });
  if (!c) { const e = new Error('Car Logbook not found in your scope'); e.statusCode = 404; throw e; }
  if (c.deletion_event_id) { const e = new Error('Car Logbook already reversed'); e.statusCode = 409; throw e; }
  return c;
}

async function reverseCarLogbook({ doc, userId, reason, tenantFilter }) {
  const sideEffects = [];
  if (doc.status !== 'POSTED' && doc.status !== 'DELETION_REQUESTED') {
    await CarLogbookEntry.deleteOne({ _id: doc._id, ...tenantFilter });
    return { doc_type: 'CAR_LOGBOOK', doc_id: doc._id, doc_ref: `LOGBOOK-${doc.period}-${doc.entry_date?.toISOString?.().slice(0,10) || ''}`, mode: 'HARD_DELETE', reversal_event_id: null, side_effects: ['hard_deleted'] };
  }
  await assertReversalPeriodOpen({ doc_type: 'CAR_LOGBOOK', entityId: doc.entity_id });

  const { reversed, already } = await reverseLinkedJEs({ event_id: doc.event_id, reason, userId, entityId: doc.entity_id });
  if (reversed) sideEffects.push(`journals_reversed=${reversed}`);
  if (already) sideEffects.push(`journals_already_reversed=${already}`);

  const session = await mongoose.startSession();
  let reversalEvent;
  try {
    await session.withTransaction(async () => {
      reversalEvent = await createReversalEvent({ doc, doc_type: 'CAR_LOGBOOK', entity_id: doc.entity_id, bdm_id: doc.bdm_id, reason, userId, session });
      doc.deletion_event_id = reversalEvent._id;
      await doc.save({ session });
    });
  } finally { session.endSession(); }

  return { doc_type: 'CAR_LOGBOOK', doc_id: doc._id, doc_ref: `LOGBOOK-${doc.period}-${doc.entry_date?.toISOString?.().slice(0,10) || ''}`, mode: 'SAP_STORNO', reversal_event_id: reversalEvent?._id, side_effects: sideEffects };
}

// ───────────────────────────────────────────────────────────────────────────────
// SUPPLIER_INVOICE handler — Phase 31R
//
// AP bookings differ from other modules: purchasingController.postInvoice stores
// the JournalEntry._id itself in `invoice.event_id` (not a TransactionEvent id),
// and the JE is written with source_event_id=null. That means the generic
// `reverseLinkedJEs({ event_id })` helper — which searches JournalEntry.source_event_id
// — would find nothing. We reverse by calling `reverseJournal(doc.event_id, ...)`
// directly, treating the stored id as the JE id.
//
// Dependent-doc blocker: refuses if any ApPayment exists against the invoice
// (payment consumed the invoice; need to reverse the payment first to keep AP
// balances consistent).
// ───────────────────────────────────────────────────────────────────────────────

async function loadSupplierInvoice({ doc_id, tenantFilter }) {
  const s = await SupplierInvoice.findOne({ _id: doc_id, ...tenantFilter });
  if (!s) { const e = new Error('Supplier Invoice not found in your scope'); e.statusCode = 404; throw e; }
  if (s.deletion_event_id) { const e = new Error('Supplier Invoice already reversed'); e.statusCode = 409; throw e; }
  return s;
}

async function reverseSupplierInvoice({ doc, userId, reason, tenantFilter }) {
  const sideEffects = [];
  if (doc.status !== 'POSTED') {
    await SupplierInvoice.deleteOne({ _id: doc._id, ...tenantFilter });
    return { doc_type: 'SUPPLIER_INVOICE', doc_id: doc._id, doc_ref: doc.invoice_ref, mode: 'HARD_DELETE', reversal_event_id: null, side_effects: ['hard_deleted'] };
  }
  await assertReversalPeriodOpen({ doc_type: 'SUPPLIER_INVOICE', entityId: doc.entity_id });

  const { has_deps, dependents } = await checkHardBlockers({ doc_type: 'SUPPLIER_INVOICE', doc, tenantFilter });
  if (has_deps) {
    const err = new Error(`Cannot reverse Supplier Invoice — ${dependents.length} AP payment(s) already applied. Reverse the payment(s) first.`);
    err.statusCode = 409; err.dependents = dependents; throw err;
  }

  // invoice.event_id stores the JE._id directly (see purchasingController.postInvoice
  // line 476). reverseJournal is idempotent via its own "already reversed" guard.
  let reversalJeId = null;
  if (doc.event_id) {
    try {
      const rev = await reverseJournal(doc.event_id, `President reversal: ${reason}`, userId, doc.entity_id);
      reversalJeId = rev?._id || null;
      sideEffects.push(`reversal_je=${rev?.je_number || rev?._id || 'created'}`);
    } catch (err) {
      if (!/already reversed/i.test(err.message || '')) throw err;
      sideEffects.push('journal_already_reversed');
    }
  }

  const session = await mongoose.startSession();
  let reversalEvent;
  try {
    await session.withTransaction(async () => {
      reversalEvent = await createReversalEvent({ doc, doc_type: 'SUPPLIER_INVOICE', entity_id: doc.entity_id, bdm_id: null, reason, userId, session });
      doc.deletion_event_id = reversalEvent._id;
      await doc.save({ session });
    });
  } finally { session.endSession(); }

  return { doc_type: 'SUPPLIER_INVOICE', doc_id: doc._id, doc_ref: doc.invoice_ref, mode: 'SAP_STORNO', reversal_event_id: reversalEvent?._id, reversal_je_id: reversalJeId, side_effects: sideEffects };
}

// ───────────────────────────────────────────────────────────────────────────────
// CREDIT_NOTE handler — Phase 31R
//
// CN posts: (1) TransactionEvent, (2) RETURN_IN InventoryLedger entries for
// RESALEABLE lines, (3) JE: DR Sales Returns (4000) / CR AR Trade (1100).
// Reversal removes all three: reverse linked JE (source_event_id path),
// reverse inventory (swap qty_in↔qty_out ADJUSTMENT), stamp deletion_event_id.
// ───────────────────────────────────────────────────────────────────────────────

async function loadCreditNote({ doc_id, tenantFilter }) {
  const c = await CreditNote.findOne({ _id: doc_id, ...tenantFilter });
  if (!c) { const e = new Error('Credit Note not found in your scope'); e.statusCode = 404; throw e; }
  if (c.deletion_event_id) { const e = new Error('Credit Note already reversed'); e.statusCode = 409; throw e; }
  return c;
}

async function reverseCreditNote({ doc, userId, reason, tenantFilter }) {
  const sideEffects = [];
  if (doc.status !== 'POSTED') {
    await CreditNote.deleteOne({ _id: doc._id, ...tenantFilter });
    return { doc_type: 'CREDIT_NOTE', doc_id: doc._id, doc_ref: doc.cn_number || String(doc._id), mode: 'HARD_DELETE', reversal_event_id: null, side_effects: ['hard_deleted'] };
  }
  await assertReversalPeriodOpen({ doc_type: 'CREDIT_NOTE', entityId: doc.entity_id });

  const { has_deps, dependents } = await checkHardBlockers({ doc_type: 'CREDIT_NOTE', doc, tenantFilter });
  if (has_deps) {
    const err = new Error(`Cannot reverse Credit Note — ${dependents.length} downstream doc(s) still reference this return.`);
    err.statusCode = 409; err.dependents = dependents; throw err;
  }

  const { reversed, already } = await reverseLinkedJEs({ event_id: doc.event_id, reason, userId, entityId: doc.entity_id });
  if (reversed) sideEffects.push(`journals_reversed=${reversed}`);
  if (already) sideEffects.push(`journals_already_reversed=${already}`);

  const session = await mongoose.startSession();
  let reversalEvent;
  try {
    await session.withTransaction(async () => {
      reversalEvent = await createReversalEvent({ doc, doc_type: 'CREDIT_NOTE', entity_id: doc.entity_id, bdm_id: doc.bdm_id, reason, userId, session });
      const restored = await reverseInventoryFor({ event_id: doc.event_id, reversalEventId: reversalEvent._id, userId, session });
      if (restored) sideEffects.push(`inventory_adjusted=${restored}`);
      doc.deletion_event_id = reversalEvent._id;
      await doc.save({ session });
    });
  } finally { session.endSession(); }

  return { doc_type: 'CREDIT_NOTE', doc_id: doc._id, doc_ref: doc.cn_number || String(doc._id), mode: 'SAP_STORNO', reversal_event_id: reversalEvent?._id, side_effects: sideEffects };
}

// ───────────────────────────────────────────────────────────────────────────────
// IC_SETTLEMENT handler — Phase 31R
//
// IcSettlement currently does not post a JE (see icSettlementController.postSettlement):
// it creates a TransactionEvent but no createAndPostJournal call. Reversal therefore:
//   - no JE to reverse
//   - create reversal TransactionEvent
//   - stamp deletion_event_id, flip status to REJECTED (existing enum value)
// Scope rule mirrors loadIcTransfer: doc is visible to caller if their entity is
// either creditor or debtor.
// ───────────────────────────────────────────────────────────────────────────────

async function loadIcSettlement({ doc_id, tenantFilter }) {
  const s = await IcSettlement.findById(doc_id);
  if (!s) { const e = new Error('IC Settlement not found'); e.statusCode = 404; throw e; }
  if (s.deletion_event_id) { const e = new Error('IC Settlement already reversed'); e.statusCode = 409; throw e; }

  if (tenantFilter?.entity_id) {
    const ent = String(tenantFilter.entity_id);
    if (String(s.creditor_entity_id) !== ent && String(s.debtor_entity_id) !== ent) {
      const e = new Error('IC Settlement not in your scope'); e.statusCode = 403; throw e;
    }
  }
  return s;
}

async function reverseIcSettlement({ doc, userId, reason /* , tenantFilter */ }) {
  const sideEffects = [];
  if (doc.status !== 'POSTED') {
    await IcSettlement.deleteOne({ _id: doc._id });
    return { doc_type: 'IC_SETTLEMENT', doc_id: doc._id, doc_ref: doc.cr_no, mode: 'HARD_DELETE', reversal_event_id: null, side_effects: ['hard_deleted'] };
  }
  await assertReversalPeriodOpen({ doc_type: 'IC_SETTLEMENT', entityId: doc.creditor_entity_id });

  // IC Settlement does not currently post a JE (postSettlement only creates a
  // TransactionEvent + stamps event_id). If future refactors add a JE, this
  // reverseLinkedJEs call becomes live automatically — idempotent no-op today.
  if (doc.event_id) {
    const { reversed, already } = await reverseLinkedJEs({ event_id: doc.event_id, reason, userId, entityId: doc.creditor_entity_id });
    if (reversed) sideEffects.push(`journals_reversed=${reversed}`);
    if (already) sideEffects.push(`journals_already_reversed=${already}`);
  }

  const session = await mongoose.startSession();
  let reversalEvent;
  try {
    await session.withTransaction(async () => {
      reversalEvent = await createReversalEvent({
        doc, doc_type: 'IC_SETTLEMENT',
        entity_id: doc.creditor_entity_id,
        bdm_id: null, reason, userId, session,
      });
      doc.deletion_event_id = reversalEvent._id;
      // Flip status to REJECTED (existing enum value) so the settlement no
      // longer shows in open-AR lists. Original posted_at/posted_by/event_id
      // preserved for audit.
      doc.status = 'REJECTED';
      doc.rejection_reason = `President-reversed: ${reason}`;
      doc.rejected_by = userId;
      doc.rejected_at = new Date();
      await doc.save({ session });
    });
  } finally { session.endSession(); }

  return { doc_type: 'IC_SETTLEMENT', doc_id: doc._id, doc_ref: doc.cr_no, mode: 'SAP_STORNO', reversal_event_id: reversalEvent?._id, side_effects: sideEffects };
}

// ───────────────────────────────────────────────────────────────────────────────
// OFFICE_SUPPLY_ITEM handler — Phase 31R-OS
// ───────────────────────────────────────────────────────────────────────────────
// Master-data reversal. No JE side-effects today (office supplies have no
// ledger integration), so we use SAP_STORNO: the master row stays in the
// collection with deletion_event_id + is_active=false for audit, and every
// non-reversed child transaction is cascade-stamped with the same event_id.
// If future work posts supply expenses to COA, add a reverseLinkedJEs() branch
// mirroring the EXPENSE handler.

async function loadOfficeSupply({ doc_id, tenantFilter }) {
  const s = await OfficeSupply.findOne({ _id: doc_id, ...tenantFilter });
  if (!s) { const e = new Error('Office supply item not found in your scope'); e.statusCode = 404; throw e; }
  if (s.deletion_event_id) { const e = new Error('Office supply item already reversed'); e.statusCode = 409; throw e; }
  return s;
}

async function reverseOfficeSupply({ doc, userId, reason /* , tenantFilter */ }) {
  const sideEffects = [];
  const session = await mongoose.startSession();
  let reversalEvent;
  let txnCount = 0;
  try {
    await session.withTransaction(async () => {
      reversalEvent = await createReversalEvent({
        doc,
        doc_type: 'OFFICE_SUPPLY_ITEM',
        entity_id: doc.entity_id,
        // OfficeSupply has no bdm_id; TransactionEvent.bdm_id is required:true,
        // so fall back to the original creator, then to the reversing user.
        bdm_id: doc.created_by || userId,
        reason,
        userId,
        session,
      });

      // Cascade: mark every non-reversed transaction for this item.
      const txnRes = await OfficeSupplyTransaction.updateMany(
        { supply_id: doc._id, deletion_event_id: { $exists: false } },
        { $set: { deletion_event_id: reversalEvent._id } },
        { session }
      );
      txnCount = txnRes.modifiedCount || 0;
      if (txnCount) sideEffects.push(`transactions_marked_reversed=${txnCount}`);

      // Stamp the master row. Keep the record for audit (don't hard-delete)
      // so Reversal History + deletion_event_id lookups stay consistent.
      doc.deletion_event_id = reversalEvent._id;
      doc.is_active = false;
      await doc.save({ session });
    });
  } finally { session.endSession(); }

  return {
    doc_type: 'OFFICE_SUPPLY_ITEM',
    doc_id: doc._id,
    doc_ref: doc.item_code || doc.item_name,
    mode: 'SAP_STORNO',
    reversal_event_id: reversalEvent?._id,
    side_effects: sideEffects,
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// OFFICE_SUPPLY_TXN handler — Phase 31R-OS
// ───────────────────────────────────────────────────────────────────────────────
// Reverses a single PURCHASE/ISSUE/RETURN/ADJUSTMENT by restoring the parent
// supply's qty_on_hand. Creates an opposite-sign transaction tagged with
// reversal_event_id (parallels InventoryLedger ADJUSTMENT pattern).

async function loadOfficeSupplyTxn({ doc_id, tenantFilter }) {
  const t = await OfficeSupplyTransaction.findOne({ _id: doc_id, ...tenantFilter });
  if (!t) { const e = new Error('Supply transaction not found in your scope'); e.statusCode = 404; throw e; }
  if (t.deletion_event_id) { const e = new Error('Supply transaction already reversed'); e.statusCode = 409; throw e; }
  return t;
}

async function reverseOfficeSupplyTxn({ doc, userId, reason /* , tenantFilter */ }) {
  const sideEffects = [];
  const adds = ['PURCHASE', 'RETURN']; // same split used by recordTransaction
  const originalDelta = adds.includes(doc.txn_type) ? doc.qty : -doc.qty;
  const restoreDelta = -originalDelta;

  const session = await mongoose.startSession();
  let reversalEvent;
  try {
    await session.withTransaction(async () => {
      reversalEvent = await createReversalEvent({
        doc,
        doc_type: 'OFFICE_SUPPLY_TXN',
        entity_id: doc.entity_id,
        // OfficeSupplyTransaction has no bdm_id; TransactionEvent.bdm_id is
        // required:true, so fall back to the txn creator, then to the reversing user.
        bdm_id: doc.created_by || userId,
        reason,
        userId,
        session,
      });

      // Opposite-sign audit row. qty stays positive; txn_type flips between
      // PURCHASE⇄ISSUE and RETURN⇄ADJUSTMENT so the reversal reads naturally
      // in history. The reversal_event_id link makes it filterable/joinable.
      const flipType = {
        PURCHASE:   'ISSUE',
        ISSUE:      'PURCHASE',
        RETURN:     'ADJUSTMENT',
        ADJUSTMENT: 'RETURN',
      };
      await OfficeSupplyTransaction.create([{
        entity_id: doc.entity_id,
        supply_id: doc.supply_id,
        txn_type: flipType[doc.txn_type] || 'ADJUSTMENT',
        txn_date: new Date(),
        qty: doc.qty,
        unit_cost: doc.unit_cost,
        notes: `Reversal of ${doc.txn_type} on ${doc.txn_date?.toISOString?.().slice(0, 10) || ''} — ${reason}`,
        reversal_event_id: reversalEvent._id,
        created_by: userId,
      }], { session });

      // Restore parent supply qty_on_hand. Guard negative floor (shouldn't fire
      // under normal flows, but the original recordTransaction also guards).
      const parent = await OfficeSupply.findById(doc.supply_id).session(session);
      if (parent) {
        parent.qty_on_hand = Math.max(0, (parent.qty_on_hand || 0) + restoreDelta);
        await parent.save({ session });
        sideEffects.push(`qty_on_hand_restored_by=${restoreDelta}`);
      }

      // Stamp the original as reversed.
      doc.deletion_event_id = reversalEvent._id;
      await doc.save({ session });
    });
  } finally { session.endSession(); }

  return {
    doc_type: 'OFFICE_SUPPLY_TXN',
    doc_id: doc._id,
    doc_ref: `${doc.txn_type} ${doc.qty}`,
    mode: 'SAP_STORNO',
    reversal_event_id: reversalEvent?._id,
    side_effects: sideEffects,
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// Registry — Phase 1-4 complete + Phase 31R + Phase 31R-OS
// ───────────────────────────────────────────────────────────────────────────────

const REVERSAL_HANDLERS = {
  SALES_LINE:           { load: loadSale,           reverse: reverseSale,           label: 'Sales (CSI)',          module: 'sales' },
  COLLECTION:           { load: loadCollection,     reverse: reverseCollection,     label: 'Collection (CR)',       module: 'collections' },
  EXPENSE:              { load: loadExpense,        reverse: reverseExpense,        label: 'Expense (ORE/ACCESS)',  module: 'expenses' },
  CALF:                 { load: makeLoadPrfCalf('CALF'),  reverse: makeReversePrfCalf('CALF'),  label: 'CALF (Cash Advance)',   module: 'expenses' },
  PRF:                  { load: makeLoadPrfCalf('PRF'),   reverse: makeReversePrfCalf('PRF'),   label: 'PRF (Partner Rebate)',  module: 'expenses' },
  GRN:                  { load: loadGrn,            reverse: reverseGrn,            label: 'GRN (Goods Receipt)',   module: 'inventory' },
  IC_TRANSFER:          { load: loadIcTransfer,     reverse: reverseIcTransfer,     label: 'Inter-Company Transfer', module: 'inventory' },
  CONSIGNMENT_TRANSFER: { load: loadConsignment,    reverse: reverseConsignment,    label: 'DR / Consignment',      module: 'inventory' },
  INCOME_REPORT:        { load: loadIncome,         reverse: reverseIncome,         label: 'BDM Income Report',     module: 'income' },
  PAYSLIP:              { load: loadPayslip,        reverse: reversePayslip,        label: 'Payroll Payslip',       module: 'payroll' },
  PETTY_CASH_TXN:       { load: loadPettyCashTxn,   reverse: reversePettyCashTxn,   label: 'Petty Cash Transaction',module: 'petty_cash' },
  JOURNAL_ENTRY:        { load: loadJournal,        reverse: reverseManualJournal,  label: 'Manual Journal Entry',  module: 'accounting' },
  // Phase SG-3R — plan reversal cascades to payouts/snapshots/targets/journals.
  SALES_GOAL_PLAN:      { load: loadSalesGoalPlan,  reverse: reverseSalesGoalPlan,  label: 'Sales Goal Plan',       module: 'sales_goals' },
  // Phase 31R — expense companions + AP/returns/IC cash leg
  SMER_ENTRY:           { load: loadSmer,            reverse: reverseSmer,           label: 'SMER (Monthly Expense)',module: 'expenses' },
  CAR_LOGBOOK:          { load: loadCarLogbook,      reverse: reverseCarLogbook,     label: 'Car Logbook',           module: 'expenses' },
  SUPPLIER_INVOICE:     { load: loadSupplierInvoice, reverse: reverseSupplierInvoice,label: 'Supplier Invoice (AP)', module: 'purchasing' },
  CREDIT_NOTE:          { load: loadCreditNote,      reverse: reverseCreditNote,     label: 'Credit Note (Return)',  module: 'sales' },
  IC_SETTLEMENT:        { load: loadIcSettlement,    reverse: reverseIcSettlement,   label: 'IC Settlement (CR)',    module: 'inter_company' },
  // Phase 31R-OS — master + transactional reversal for office supplies
  OFFICE_SUPPLY_ITEM:   { load: loadOfficeSupply,    reverse: reverseOfficeSupply,    label: 'Office Supply (Item)',  module: 'inventory' },
  OFFICE_SUPPLY_TXN:    { load: loadOfficeSupplyTxn, reverse: reverseOfficeSupplyTxn, label: 'Office Supply (Txn)',   module: 'inventory' },
};

/**
 * Master entry point — call from controllers after auth + sub-permission gating.
 */
async function presidentReverse({ doc_type, doc_id, reason, user, tenantFilter }) {
  const handler = REVERSAL_HANDLERS[doc_type];
  if (!handler) { const err = new Error(`No reversal handler registered for doc_type='${doc_type}'`); err.statusCode = 400; throw err; }
  if (!reason || !reason.trim()) { const err = new Error('Reason is required for president reversal'); err.statusCode = 400; throw err; }
  if (!user || !user._id) { const err = new Error('Authenticated user required'); err.statusCode = 401; throw err; }

  const doc = await handler.load({ doc_id, tenantFilter });
  const result = await handler.reverse({ doc, userId: user._id, reason: reason.trim(), tenantFilter });

  await ErpAuditLog.logChange({
    entity_id: doc.entity_id || doc.source_entity_id,
    bdm_id: doc.bdm_id,
    log_type: 'PRESIDENT_REVERSAL',
    target_ref: result.doc_id.toString(),
    target_model: doc_type,
    changed_by: user._id,
    new_value: {
      doc_ref: result.doc_ref,
      mode: result.mode,
      reversal_event_id: result.reversal_event_id,
      secondary_reversal_event_id: result.secondary_reversal_event_id,
      reversal_je_id: result.reversal_je_id,
      side_effects: result.side_effects,
    },
    note: `President reverse [${doc_type}/${result.doc_ref || result.doc_id}] — reason: ${reason.trim()}`,
  });

  return result;
}

/**
 * Cross-module list of reversible POSTED documents — feeds the Console page's
 * "Reversible Transactions" tab. Caller can filter by doc_type, entity, date.
 */
async function listReversibleDocs({ doc_types, entityId, fromDate, toDate, page = 1, limit = 50 }) {
  const wantedTypes = (doc_types && doc_types.length) ? doc_types : Object.keys(REVERSAL_HANDLERS);

  const dateMatch = {};
  if (fromDate) dateMatch.$gte = new Date(fromDate);
  if (toDate)   dateMatch.$lte = new Date(toDate);
  const dateFilter = Object.keys(dateMatch).length ? dateMatch : null;

  const baseEntity = entityId ? { entity_id: entityId } : {};
  const notReversed = { deletion_event_id: { $exists: false } };
  const out = [];
  let totalCount = 0;
  // Per-type fetch needs to cover the globally-sorted page, not just `limit`.
  // After per-type queries are merged and re-sorted by posted_at, the rows that
  // fall in slice [(page-1)*limit, page*limit] may come from any single source,
  // so each source must provide at least that many rows to guarantee coverage.
  const perTypeFetch = page * limit;

  // Small helper so every type consistently fetches the page-covering slice
  // AND contributes its true count to `total`. Runs find + count in parallel.
  const fetchAndCount = async (Model, q, selectFields, sortField) => {
    const [rows, cnt] = await Promise.all([
      Model.find(q).select(selectFields).sort({ [sortField]: -1 }).limit(perTypeFetch).lean(),
      Model.countDocuments(q),
    ]);
    return { rows, cnt };
  };

  if (wantedTypes.includes('SALES_LINE')) {
    const q = { ...baseEntity, ...notReversed, status: 'POSTED' };
    if (dateFilter) q.posted_at = dateFilter;
    const { rows, cnt } = await fetchAndCount(SalesLine, q, '_id doc_ref invoice_number entity_id bdm_id posted_at status sale_type', 'posted_at');
    totalCount += cnt;
    rows.forEach(r => out.push({ doc_type: 'SALES_LINE', doc_id: r._id, doc_ref: r.doc_ref || r.invoice_number, entity_id: r.entity_id, bdm_id: r.bdm_id, posted_at: r.posted_at, status: r.status, label: REVERSAL_HANDLERS.SALES_LINE.label, sub: r.sale_type }));
  }

  if (wantedTypes.includes('COLLECTION')) {
    const q = { ...baseEntity, ...notReversed, status: 'POSTED' };
    if (dateFilter) q.posted_at = dateFilter;
    const { rows, cnt } = await fetchAndCount(Collection, q, '_id cr_no entity_id bdm_id posted_at status', 'posted_at');
    totalCount += cnt;
    rows.forEach(r => out.push({ doc_type: 'COLLECTION', doc_id: r._id, doc_ref: r.cr_no, entity_id: r.entity_id, bdm_id: r.bdm_id, posted_at: r.posted_at, status: r.status, label: REVERSAL_HANDLERS.COLLECTION.label }));
  }

  if (wantedTypes.includes('EXPENSE')) {
    const q = { ...baseEntity, ...notReversed, status: 'POSTED' };
    if (dateFilter) q.posted_at = dateFilter;
    const { rows, cnt } = await fetchAndCount(ExpenseEntry, q, '_id period entity_id bdm_id posted_at status total_amount', 'posted_at');
    totalCount += cnt;
    rows.forEach(r => out.push({ doc_type: 'EXPENSE', doc_id: r._id, doc_ref: `EXP ${r.period}`, entity_id: r.entity_id, bdm_id: r.bdm_id, posted_at: r.posted_at, status: r.status, label: REVERSAL_HANDLERS.EXPENSE.label, sub: `₱${r.total_amount}` }));
  }

  if (wantedTypes.includes('CALF') || wantedTypes.includes('PRF')) {
    const types = [];
    if (wantedTypes.includes('CALF')) types.push('CALF');
    if (wantedTypes.includes('PRF')) types.push('PRF');
    const q = { ...baseEntity, ...notReversed, status: 'POSTED', doc_type: { $in: types } };
    if (dateFilter) q.posted_at = dateFilter;
    const { rows, cnt } = await fetchAndCount(PrfCalf, q, '_id doc_type calf_number prf_number entity_id bdm_id posted_at status amount', 'posted_at');
    totalCount += cnt;
    rows.forEach(r => out.push({ doc_type: r.doc_type, doc_id: r._id, doc_ref: r.calf_number || r.prf_number, entity_id: r.entity_id, bdm_id: r.bdm_id, posted_at: r.posted_at, status: r.status, label: REVERSAL_HANDLERS[r.doc_type].label, sub: `₱${r.amount}` }));
  }

  if (wantedTypes.includes('GRN')) {
    const q = { ...baseEntity, ...notReversed, status: 'APPROVED' };
    if (dateFilter) q.grn_date = dateFilter;
    const { rows, cnt } = await fetchAndCount(GrnEntry, q, '_id grn_date entity_id bdm_id status po_number', 'grn_date');
    totalCount += cnt;
    rows.forEach(r => out.push({ doc_type: 'GRN', doc_id: r._id, doc_ref: `GRN ${r.grn_date?.toISOString().slice(0,10)}`, entity_id: r.entity_id, bdm_id: r.bdm_id, posted_at: r.grn_date, status: r.status, label: REVERSAL_HANDLERS.GRN.label, sub: r.po_number }));
  }

  if (wantedTypes.includes('IC_TRANSFER')) {
    const q = {
      ...notReversed,
      status: { $in: ['SHIPPED', 'RECEIVED', 'POSTED'] },
      ...(entityId ? { $or: [{ source_entity_id: entityId }, { target_entity_id: entityId }] } : {}),
    };
    if (dateFilter) q.transfer_date = dateFilter;
    const { rows, cnt } = await fetchAndCount(InterCompanyTransfer, q, '_id transfer_ref source_entity_id target_entity_id transfer_date status total_amount', 'transfer_date');
    totalCount += cnt;
    rows.forEach(r => out.push({ doc_type: 'IC_TRANSFER', doc_id: r._id, doc_ref: r.transfer_ref, entity_id: r.source_entity_id, posted_at: r.transfer_date, status: r.status, label: REVERSAL_HANDLERS.IC_TRANSFER.label, sub: `₱${r.total_amount}` }));
  }

  if (wantedTypes.includes('INCOME_REPORT')) {
    const q = { ...baseEntity, ...notReversed, status: { $in: ['CREDITED', 'BDM_CONFIRMED'] } };
    if (dateFilter) q.credited_at = dateFilter;
    const { rows, cnt } = await fetchAndCount(IncomeReport, q, '_id period cycle entity_id bdm_id credited_at status net_pay', 'credited_at');
    totalCount += cnt;
    rows.forEach(r => out.push({ doc_type: 'INCOME_REPORT', doc_id: r._id, doc_ref: `${r.period} / ${r.cycle}`, entity_id: r.entity_id, bdm_id: r.bdm_id, posted_at: r.credited_at, status: r.status, label: REVERSAL_HANDLERS.INCOME_REPORT.label, sub: `Net ₱${r.net_pay}` }));
  }

  if (wantedTypes.includes('PAYSLIP')) {
    const q = { ...baseEntity, ...notReversed, status: 'POSTED' };
    if (dateFilter) q.posted_at = dateFilter;
    const { rows, cnt } = await fetchAndCount(Payslip, q, '_id period cycle entity_id person_id posted_at status net_pay', 'posted_at');
    totalCount += cnt;
    rows.forEach(r => out.push({ doc_type: 'PAYSLIP', doc_id: r._id, doc_ref: `${r.period} / ${r.cycle}`, entity_id: r.entity_id, posted_at: r.posted_at, status: r.status, label: REVERSAL_HANDLERS.PAYSLIP.label, sub: `Net ₱${r.net_pay}` }));
  }

  if (wantedTypes.includes('JOURNAL_ENTRY')) {
    const q = { ...baseEntity, status: 'POSTED', is_reversal: { $ne: true } };
    if (dateFilter) q.je_date = dateFilter;
    const rows = await JournalEntry.find(q).select('_id je_number je_date entity_id source_module status').sort({ je_date: -1 }).limit(perTypeFetch).lean();
    const ids = rows.map(r => r._id);
    const reversed = await JournalEntry.find({ corrects_je_id: { $in: ids } }).select('corrects_je_id').lean();
    const skipIds = new Set(reversed.map(r => r.corrects_je_id.toString()));
    const visible = rows.filter(r => !skipIds.has(r._id.toString()));
    // JE true-total: POSTED-not-reversal that are also not pointed to by any reversal JE.
    // Uses $lookup so the count is accurate even when >perTypeFetch rows exist.
    // `from:` must be the actual collection name on the model, NOT the Mongoose-pluralized
    // default — JournalEntry explicitly uses `erp_journal_entries` (see models/JournalEntry.js).
    const jeCollectionName = JournalEntry.collection.collectionName;
    const jeCountAgg = await JournalEntry.aggregate([
      { $match: q },
      { $lookup: { from: jeCollectionName, localField: '_id', foreignField: 'corrects_je_id', as: 'reversals' } },
      { $match: { 'reversals.0': { $exists: false } } },
      { $count: 'total' },
    ]);
    totalCount += jeCountAgg[0]?.total || 0;
    visible.forEach(r => out.push({ doc_type: 'JOURNAL_ENTRY', doc_id: r._id, doc_ref: String(r.je_number || ''), entity_id: r.entity_id, posted_at: r.je_date, status: r.status, label: REVERSAL_HANDLERS.JOURNAL_ENTRY.label, sub: r.source_module }));
  }

  // ─── Phase 31R ───
  if (wantedTypes.includes('SMER_ENTRY')) {
    const q = { ...baseEntity, ...notReversed, status: 'POSTED' };
    if (dateFilter) q.posted_at = dateFilter;
    const { rows, cnt } = await fetchAndCount(SmerEntry, q, '_id period cycle entity_id bdm_id posted_at status total_reimbursable', 'posted_at');
    totalCount += cnt;
    rows.forEach(r => out.push({ doc_type: 'SMER_ENTRY', doc_id: r._id, doc_ref: `SMER ${r.period}-${r.cycle}`, entity_id: r.entity_id, bdm_id: r.bdm_id, posted_at: r.posted_at, status: r.status, label: REVERSAL_HANDLERS.SMER_ENTRY.label, sub: `₱${r.total_reimbursable || 0}` }));
  }

  if (wantedTypes.includes('CAR_LOGBOOK')) {
    const q = { ...baseEntity, ...notReversed, status: 'POSTED' };
    if (dateFilter) q.posted_at = dateFilter;
    const { rows, cnt } = await fetchAndCount(CarLogbookEntry, q, '_id period cycle entry_date entity_id bdm_id posted_at status total_km total_fuel_amount', 'posted_at');
    totalCount += cnt;
    rows.forEach(r => out.push({ doc_type: 'CAR_LOGBOOK', doc_id: r._id, doc_ref: `LOGBOOK ${r.entry_date?.toISOString?.().slice(0,10) || r.period}`, entity_id: r.entity_id, bdm_id: r.bdm_id, posted_at: r.posted_at, status: r.status, label: REVERSAL_HANDLERS.CAR_LOGBOOK.label, sub: `${r.total_km || 0} km / ₱${r.total_fuel_amount || 0}` }));
  }

  if (wantedTypes.includes('SUPPLIER_INVOICE')) {
    const q = { ...baseEntity, ...notReversed, status: 'POSTED' };
    if (dateFilter) q.invoice_date = dateFilter;
    const { rows, cnt } = await fetchAndCount(SupplierInvoice, q, '_id invoice_ref invoice_date entity_id status total_amount vendor_name', 'invoice_date');
    totalCount += cnt;
    rows.forEach(r => out.push({ doc_type: 'SUPPLIER_INVOICE', doc_id: r._id, doc_ref: r.invoice_ref, entity_id: r.entity_id, posted_at: r.invoice_date, status: r.status, label: REVERSAL_HANDLERS.SUPPLIER_INVOICE.label, sub: `${r.vendor_name || ''} ₱${r.total_amount || 0}`.trim() }));
  }

  if (wantedTypes.includes('CREDIT_NOTE')) {
    const q = { ...baseEntity, ...notReversed, status: 'POSTED' };
    if (dateFilter) q.posted_at = dateFilter;
    const { rows, cnt } = await fetchAndCount(CreditNote, q, '_id cn_number cn_date entity_id bdm_id posted_at status credit_total', 'posted_at');
    totalCount += cnt;
    rows.forEach(r => out.push({ doc_type: 'CREDIT_NOTE', doc_id: r._id, doc_ref: r.cn_number || String(r._id), entity_id: r.entity_id, bdm_id: r.bdm_id, posted_at: r.posted_at, status: r.status, label: REVERSAL_HANDLERS.CREDIT_NOTE.label, sub: `₱${r.credit_total || 0}` }));
  }

  if (wantedTypes.includes('IC_SETTLEMENT')) {
    // IC Settlement has creditor_entity_id, not entity_id. Scope by either side.
    const q = {
      ...notReversed,
      status: 'POSTED',
      ...(entityId ? { $or: [{ creditor_entity_id: entityId }, { debtor_entity_id: entityId }] } : {}),
    };
    if (dateFilter) q.posted_at = dateFilter;
    const { rows, cnt } = await fetchAndCount(IcSettlement, q, '_id cr_no cr_date creditor_entity_id debtor_entity_id posted_at status cr_amount', 'posted_at');
    totalCount += cnt;
    rows.forEach(r => out.push({ doc_type: 'IC_SETTLEMENT', doc_id: r._id, doc_ref: r.cr_no, entity_id: r.creditor_entity_id, posted_at: r.posted_at, status: r.status, label: REVERSAL_HANDLERS.IC_SETTLEMENT.label, sub: `₱${r.cr_amount || 0}` }));
  }

  // ─── Phase 31R-OS ───
  if (wantedTypes.includes('OFFICE_SUPPLY_ITEM')) {
    const q = { ...baseEntity, ...notReversed };
    if (dateFilter) q.createdAt = dateFilter;
    const { rows, cnt } = await fetchAndCount(OfficeSupply, q, '_id item_name item_code category entity_id createdAt qty_on_hand', 'createdAt');
    totalCount += cnt;
    rows.forEach(r => out.push({ doc_type: 'OFFICE_SUPPLY_ITEM', doc_id: r._id, doc_ref: r.item_code || r.item_name, entity_id: r.entity_id, posted_at: r.createdAt, status: 'ACTIVE', label: REVERSAL_HANDLERS.OFFICE_SUPPLY_ITEM.label, sub: `${r.category || ''} · qty ${r.qty_on_hand || 0}`.trim() }));
  }

  if (wantedTypes.includes('OFFICE_SUPPLY_TXN')) {
    const q = { ...baseEntity, ...notReversed, reversal_event_id: { $exists: false } };
    if (dateFilter) q.txn_date = dateFilter;
    const { rows, cnt } = await fetchAndCount(OfficeSupplyTransaction, q, '_id supply_id txn_type qty txn_date entity_id total_cost', 'txn_date');
    totalCount += cnt;
    rows.forEach(r => out.push({ doc_type: 'OFFICE_SUPPLY_TXN', doc_id: r._id, doc_ref: `${r.txn_type} ${r.qty}`, entity_id: r.entity_id, posted_at: r.txn_date, status: 'POSTED', label: REVERSAL_HANDLERS.OFFICE_SUPPLY_TXN.label, sub: r.total_cost ? `₱${r.total_cost}` : '' }));
  }

  out.sort((a, b) => new Date(b.posted_at || 0) - new Date(a.posted_at || 0));
  const start = (page - 1) * limit;
  return { data: out.slice(start, start + limit), total: totalCount, page, limit };
}

/**
 * Reversal history — reads ErpAuditLog where log_type='PRESIDENT_REVERSAL'.
 */
async function listReversalHistory({ entityId, doc_type, fromDate, toDate, page = 1, limit = 50 }) {
  const q = { log_type: 'PRESIDENT_REVERSAL' };
  if (entityId) q.entity_id = entityId;
  if (doc_type) q.target_model = doc_type;
  if (fromDate || toDate) {
    // ErpAuditLog uses `changed_at` (not `created_at`) — see models/ErpAuditLog.js
    q.changed_at = {};
    if (fromDate) q.changed_at.$gte = new Date(fromDate);
    if (toDate)   q.changed_at.$lte = new Date(toDate);
  }
  const skip = (page - 1) * limit;
  const [data, total] = await Promise.all([
    ErpAuditLog.find(q).populate('changed_by', 'name email role').sort({ changed_at: -1 }).skip(skip).limit(limit).lean(),
    ErpAuditLog.countDocuments(q),
  ]);
  return { data, total, page, limit };
}

/**
 * Preview the dependent-doc check for any registered doc type — so the UI can
 * show "this is blocked by X, Y, Z" before the user clicks Reverse.
 */
async function previewDependents({ doc_type, doc_id, tenantFilter }) {
  const handler = REVERSAL_HANDLERS[doc_type];
  if (!handler) { const err = new Error(`Unknown doc_type='${doc_type}'`); err.statusCode = 400; throw err; }
  const doc = await handler.load({ doc_id, tenantFilter });
  const { has_deps, dependents } = await checkHardBlockers({ doc_type, doc, tenantFilter });
  return {
    doc_type, doc_id, doc_ref: doc.doc_ref || doc.cr_no || doc.calf_number || doc.prf_number || doc.transfer_ref || String(doc._id),
    has_deps, dependents,
  };
}

/**
 * Factory: returns an Express handler for `POST /:id/president-reverse` that
 * delegates to `presidentReverse()` for a specific doc_type. Avoids copy-pasting
 * the same wrapper across every controller.
 *
 * Each controller does:
 *   const presidentReverseGrn = buildPresidentReverseHandler('GRN');
 *   module.exports = { ..., presidentReverseGrn };
 */
function buildPresidentReverseHandler(docType) {
  return async function presidentReverseHandler(req, res) {
    const { reason, confirm } = req.body || {};
    if (confirm !== 'DELETE') {
      return res.status(400).json({ success: false, message: 'Type DELETE in the confirmation field to proceed' });
    }
    if (!reason || !String(reason).trim()) {
      return res.status(400).json({ success: false, message: 'Reason is required' });
    }
    try {
      const result = await presidentReverse({
        doc_type: docType,
        doc_id: req.params.id,
        reason,
        user: req.user,
        tenantFilter: req.tenantFilter || {},
      });
      res.json({
        success: true,
        message: result.mode === 'HARD_DELETE'
          ? `Deleted ${result.doc_ref || result.doc_id} (no posting side effects)`
          : `Reversed ${result.doc_ref || result.doc_id} (${result.mode}) — original retained for audit`,
        data: result,
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
        dependents: err.dependents || undefined,
      });
    }
  };
}

module.exports = {
  presidentReverse,
  listReversibleDocs,
  listReversalHistory,
  previewDependents,
  buildPresidentReverseHandler,
  REVERSAL_HANDLERS,
};
