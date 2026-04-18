/**
 * Document Reversal Service — President-Only "Delete & Reverse Everything"
 *
 * Central dispatcher that knows how to reverse + delete any transactional document
 * across all ERP modules. Uses SAP Storno pattern for POSTED documents (original
 * stays POSTED in original period, reversal entries post to current period, audit
 * trail preserved). Hard-deletes DRAFT/ERROR rows since they have no side effects.
 *
 * Subscription/scalability: handlers are registered in the REVERSAL_HANDLERS map.
 * Adding a new module = add one handler entry. Sub-permission gating is lookup-driven
 * (ERP_SUB_PERMISSION → accounting.reverse_posted), so subscribers configure who can
 * trigger this from the Access Template editor — no code changes per tenant.
 *
 * Authorization: routes that delegate here must be gated by
 * `erpSubAccessCheck('accounting', 'reverse_posted')`. President auto-passes that.
 *
 * Period-lock policy: original document is NOT modified in its original period.
 * Reversal entries (JEs, ledger adjustments) are created in the current open period
 * — same behavior as `reverseJournal()` in journalEngine.js.
 */

const mongoose = require('mongoose');
const SalesLine = require('../models/SalesLine');
const InventoryLedger = require('../models/InventoryLedger');
const ConsignmentTracker = require('../models/ConsignmentTracker');
const PettyCashTransaction = require('../models/PettyCashTransaction');
const PettyCashFund = require('../models/PettyCashFund');
const JournalEntry = require('../models/JournalEntry');
const TransactionEvent = require('../models/TransactionEvent');
const ErpAuditLog = require('../models/ErpAuditLog');
const { reverseJournal } = require('./journalEngine');

// ───────────────────────────────────────────────────────────────────────────────
// SALES_LINE handler
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Reverse + delete a SalesLine.
 *
 * - DRAFT / ERROR / VALID with no event_id → hard delete (no side effects ever posted)
 * - POSTED / DELETION_REQUESTED → SAP Storno (reversal event + flipped JEs + opposite-
 *   sign inventory + consignment restore + petty cash void + fund decrement). Original
 *   row stays POSTED with `deletion_event_id` set so it's hidden from default views.
 *
 * @returns {Object} { doc_type, doc_id, doc_ref, mode, reversal_event_id, side_effects }
 */
async function reverseSale({ doc, userId, reason, tenantFilter }) {
  const sideEffects = [];

  // CASE 1 — Never posted: hard delete
  if (!doc.event_id) {
    await SalesLine.deleteOne({ _id: doc._id, ...tenantFilter });
    sideEffects.push('hard_deleted');
    return {
      doc_type: 'SALES_LINE',
      doc_id: doc._id,
      doc_ref: doc.doc_ref || doc.invoice_number,
      mode: 'HARD_DELETE',
      reversal_event_id: null,
      side_effects: sideEffects,
    };
  }

  // CASE 2 — Posted: SAP Storno
  // Step 1 — reverse JEs FIRST (outside the doc's transaction so journal cleanup
  // is durable; if it fails we don't touch downstream state). Mirrors `reopenSales`.
  // Idempotent: skip JEs that already have a reversal (so retries after partial
  // failures complete cleanly instead of throwing on the first already-reversed JE).
  let jesReversed = 0;
  let jesAlreadyReversed = 0;
  const candidateJes = await JournalEntry.find({
    source_event_id: doc.event_id,
    status: 'POSTED',
    is_reversal: { $ne: true },
  });
  // Filter out originals that already have a reversal pointing at them
  const candidateIds = candidateJes.map(je => je._id);
  const existingReversals = await JournalEntry.find({
    corrects_je_id: { $in: candidateIds },
  }).select('corrects_je_id').lean();
  const reversedSet = new Set(existingReversals.map(r => r.corrects_je_id.toString()));
  for (const je of candidateJes) {
    if (reversedSet.has(je._id.toString())) {
      jesAlreadyReversed++;
      continue;
    }
    await reverseJournal(je._id, `President reversal: ${reason || 'no reason given'}`, userId);
    jesReversed++;
  }
  if (jesReversed > 0) sideEffects.push(`journals_reversed=${jesReversed}`);
  if (jesAlreadyReversed > 0) sideEffects.push(`journals_already_reversed=${jesAlreadyReversed}`);

  // Step 2 — Create reversal TransactionEvent + reverse inventory/consignment/petty cash
  // in a single Mongo transaction so the storno is atomic.
  const session = await mongoose.startSession();
  let reversalEvent;
  try {
    await session.withTransaction(async () => {
      const [evt] = await TransactionEvent.create([{
        entity_id: doc.entity_id,
        bdm_id: doc.bdm_id,
        event_type: 'SALES_LINE_REVERSAL',
        event_date: new Date(),
        document_ref: `REV-${doc.doc_ref || doc.invoice_number || doc._id}`,
        payload: {
          original_sale_id: doc._id,
          original_event_id: doc.event_id,
          reason: reason || 'President reversal',
          mode: 'PRESIDENT_REVERSAL',
        },
        corrects_event_id: doc.event_id,
        created_by: userId,
      }], { session });
      reversalEvent = evt;

      // Inventory reversal — opposite-sign ADJUSTMENT entries linked to the reversal event
      // (so they don't appear as "consumed" but as restorations).
      const originalEntries = await InventoryLedger.find({ event_id: doc.event_id }).session(session);
      for (const entry of originalEntries) {
        await InventoryLedger.create([{
          entity_id: entry.entity_id,
          bdm_id: entry.bdm_id,
          warehouse_id: entry.warehouse_id || undefined,
          product_id: entry.product_id,
          batch_lot_no: entry.batch_lot_no,
          expiry_date: entry.expiry_date,
          transaction_type: 'ADJUSTMENT',
          qty_in: entry.qty_out,
          qty_out: entry.qty_in,
          event_id: reversalEvent._id,
          recorded_by: userId,
        }], { session });
      }
      if (originalEntries.length > 0) sideEffects.push(`inventory_restored=${originalEntries.length}`);

      // Consignment tracker — remove conversion entry + decrement qty_consumed
      let consignmentTouched = 0;
      for (const item of doc.line_items || []) {
        const consignment = await ConsignmentTracker.findOne({
          entity_id: doc.entity_id,
          hospital_id: doc.hospital_id,
          product_id: item.product_id,
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
      if (consignmentTouched > 0) sideEffects.push(`consignment_restored=${consignmentTouched}`);

      // Petty cash deposit reversal — void txn + decrement fund balance
      if (doc.petty_cash_fund_id) {
        const pcTxn = await PettyCashTransaction.findOne({
          linked_sales_line_id: doc._id,
          txn_type: 'DEPOSIT',
          status: 'POSTED',
        }).session(session);
        if (pcTxn) {
          pcTxn.status = 'VOIDED';
          pcTxn.voided_at = new Date();
          pcTxn.voided_by = userId;
          pcTxn.void_reason = `President-reversed: ${doc.sale_type || 'CSI'} ${doc.invoice_number || doc.doc_ref || ''}`;
          await pcTxn.save({ session });
          const fundResult = await PettyCashFund.findByIdAndUpdate(
            pcTxn.fund_id,
            { $inc: { current_balance: -pcTxn.amount } },
            { session }
          );
          if (!fundResult) {
            // Fund was deleted between sale post and now — log inconsistency, don't fail
            await ErpAuditLog.logChange({
              entity_id: doc.entity_id,
              log_type: 'PRESIDENT_REVERSAL',
              target_ref: pcTxn.fund_id?.toString(),
              target_model: 'PettyCashFund',
              field_changed: 'current_balance',
              old_value: pcTxn.amount.toString(),
              new_value: 'FUND_NOT_FOUND',
              changed_by: userId,
              note: `Fund deleted before president reversal — balance decrement skipped for sale ${doc.invoice_number || doc.doc_ref}`,
            });
          }
          sideEffects.push('petty_cash_voided');
        }
      }

      // Mark the sale as reversed by setting deletion_event_id (consistent with existing
      // approveDeletion pattern). Status stays POSTED so historical reports remain truthful.
      doc.deletion_event_id = reversalEvent._id;
      await doc.save({ session });
    });
  } finally {
    session.endSession();
  }

  return {
    doc_type: 'SALES_LINE',
    doc_id: doc._id,
    doc_ref: doc.doc_ref || doc.invoice_number,
    mode: 'SAP_STORNO',
    reversal_event_id: reversalEvent?._id,
    side_effects: sideEffects,
  };
}

/**
 * Loader for SALES_LINE — fetches the doc with tenant scope and validates state.
 * Throws on not-found, already-reversed, or wrong status.
 */
async function loadSale({ doc_id, tenantFilter }) {
  const sale = await SalesLine.findOne({ _id: doc_id, ...tenantFilter });
  if (!sale) {
    const err = new Error('Sales transaction not found in your scope');
    err.statusCode = 404;
    throw err;
  }
  if (sale.deletion_event_id) {
    const err = new Error('This sale has already been reversed/deleted');
    err.statusCode = 409;
    throw err;
  }
  return sale;
}

// ───────────────────────────────────────────────────────────────────────────────
// Registry — add new modules here as they're rolled out (Collections, Expenses, …)
// Keys are document type identifiers; handlers are { load, reverse }.
// ───────────────────────────────────────────────────────────────────────────────

const REVERSAL_HANDLERS = {
  SALES_LINE: { load: loadSale, reverse: reverseSale },
  // COLLECTION:    { load: loadCollection,    reverse: reverseCollection    },   // TODO Phase 2
  // EXPENSE:       { load: loadExpense,       reverse: reverseExpense       },   // TODO Phase 3
  // PETTY_CASH_TXN:{ load: loadPettyCashTxn,  reverse: reversePettyCashTxn  },   // TODO Phase 3
  // JOURNAL_ENTRY: { load: loadManualJournal, reverse: reverseManualJournal },   // TODO Phase 3
  // STOCK_TRANSFER:{ load: loadStockTransfer, reverse: reverseStockTransfer },   // TODO Phase 4
  // IC_TRANSFER:   { load: loadIcTransfer,    reverse: reverseIcTransfer    },   // TODO Phase 4
  // GRN:           { load: loadGRN,           reverse: reverseGRN           },   // TODO Phase 4
  // CALF:          { load: loadCALF,          reverse: reverseCALF          },   // TODO Phase 5
  // PRF:           { load: loadPRF,           reverse: reversePRF           },   // TODO Phase 5
  // INCOME:        { load: loadIncome,        reverse: reverseIncome        },   // TODO Phase 5
  // PAYROLL:       { load: loadPayroll,       reverse: reversePayroll       },   // TODO Phase 5
};

/**
 * Master entry point — call from controllers after auth + sub-permission gating.
 *
 * @param {Object} args
 * @param {string} args.doc_type      — registered key in REVERSAL_HANDLERS
 * @param {string} args.doc_id        — Mongo ObjectId of the document to reverse
 * @param {string} args.reason        — required user-supplied reason (audit trail)
 * @param {Object} args.user          — req.user (must include _id, name|email)
 * @param {Object} args.tenantFilter  — req.tenantFilter (entity scoping)
 * @returns {Promise<Object>} reversal summary
 */
async function presidentReverse({ doc_type, doc_id, reason, user, tenantFilter }) {
  const handler = REVERSAL_HANDLERS[doc_type];
  if (!handler) {
    const err = new Error(`No reversal handler registered for doc_type='${doc_type}'`);
    err.statusCode = 400;
    throw err;
  }
  if (!reason || !reason.trim()) {
    const err = new Error('Reason is required for president reversal');
    err.statusCode = 400;
    throw err;
  }
  if (!user || !user._id) {
    const err = new Error('Authenticated user required');
    err.statusCode = 401;
    throw err;
  }

  const doc = await handler.load({ doc_id, tenantFilter });
  const result = await handler.reverse({ doc, userId: user._id, reason: reason.trim(), tenantFilter });

  // Single audit-log entry summarizes the whole storno — queryable from console
  await ErpAuditLog.logChange({
    entity_id: doc.entity_id,
    bdm_id: doc.bdm_id,
    log_type: 'PRESIDENT_REVERSAL',
    target_ref: result.doc_id.toString(),
    target_model: doc_type,
    changed_by: user._id,
    new_value: {
      doc_ref: result.doc_ref,
      mode: result.mode,
      reversal_event_id: result.reversal_event_id,
      side_effects: result.side_effects,
    },
    note: `President reverse [${doc_type}/${result.doc_ref || result.doc_id}] — reason: ${reason.trim()}`,
  });

  return result;
}

module.exports = {
  presidentReverse,
  REVERSAL_HANDLERS, // exported for tests / introspection
};
