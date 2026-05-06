/**
 * AR / AP Sub-Ledger Maintenance Service — Phase A.4 (May 2026)
 *
 * Materializes `outstanding_amount` on SalesLine + SupplierInvoice so:
 *   1. AR / AP aging reports load O(1) instead of joining Collection per-row.
 *   2. Accounting Integrity Agent's AR/AP recon check is one aggregation
 *      (Σ outstanding_amount per entity) vs a multi-collection scan.
 *   3. Subscriber pharmacies (Year-2 SaaS) get parity with QuickBooks/Xero
 *      day-1 (open-invoices report is table-stakes).
 *
 * Maintenance contract:
 *   • SalesLine.outstanding_amount is initialized to invoice_total when the
 *     row first transitions to POSTED (pre-save hook in SalesLine.js).
 *   • Collection POST → recomputeOutstandingForCollection(coll) reduces it
 *     by Σ settled_csis.invoice_amount on the affected SalesLines.
 *   • Collection reopen → same helper recomputes (additive math because the
 *     POSTED filter on the Collection.aggregate excludes the now-DRAFT row).
 *   • SupplierInvoice — pre-save keeps outstanding_amount = total_amount −
 *     amount_paid; this service exposes a refresh helper for ApPayment-side
 *     callers that mutate amount_paid directly.
 *
 * Direct-cash exclusions (NOT AR — never have outstanding):
 *   • CASH_RECEIPT or SERVICE_INVOICE with petty_cash_fund_id +
 *     payment_mode='CASH' — journalFromSale bypasses AR_TRADE for these.
 *     outstanding_amount is forced to 0 on first POST and never recomputed.
 *
 * Idempotency: every helper recomputes from authoritative sources
 * (Collection.aggregate over POSTED rows). Calling it N times yields the
 * same answer. No drift even if the post hook runs twice.
 *
 * Transactions: helpers accept an optional Mongoose session. Callers that
 * already wrap their own withTransaction pass it; one-shot callers (cron,
 * migration) skip it. Atlas + replica-set required for true atomicity;
 * standalone Mongo (test fixtures) silently degrades to per-doc updates.
 */
const mongoose = require('mongoose');

/**
 * Returns true when this SalesLine bypasses AR_TRADE (direct-cash route).
 * Mirrors the journalFromSale debit-leg logic exactly — keep in sync.
 */
function isCashRoute(salesLine) {
  return Boolean(
    salesLine?.petty_cash_fund_id &&
    salesLine?.payment_mode === 'CASH',
  );
}

/**
 * Recompute outstanding_amount + paid_amount + last_payment_at for ONE
 * SalesLine by aggregating all POSTED Collections that reference it.
 *
 * @param {ObjectId|string} salesLineId
 * @param {object} [opts]
 * @param {ClientSession} [opts.session] — Mongoose transaction session
 * @returns {Promise<{
 *   _id: ObjectId, outstanding_amount: number, paid_amount: number,
 *   last_payment_at: Date|null, skipped?: 'CASH_ROUTE'|'NOT_POSTED'|'NOT_FOUND'
 * }>}
 */
async function recomputeOutstandingForSale(salesLineId, opts = {}) {
  const SalesLine = require('../models/SalesLine');
  const Collection = require('../models/Collection');
  const session = opts.session || null;

  const sl = await SalesLine.findById(salesLineId)
    .session(session || null)
    .select('_id invoice_total status petty_cash_fund_id payment_mode outstanding_amount paid_amount sale_type deletion_event_id')
    .lean();

  if (!sl) return { _id: salesLineId, skipped: 'NOT_FOUND' };
  if (sl.status !== 'POSTED' && sl.status !== 'DELETION_REQUESTED') {
    // DRAFT/VALID/ERROR — outstanding has no meaning yet.
    return { _id: salesLineId, skipped: 'NOT_POSTED' };
  }
  // Phase 28 SAP Storno reversal — the original SalesLine stays POSTED for
  // audit trail but is paired with a `is_reversal: true` JournalEntry that
  // credits AR_TRADE back to zero. From the AR sub-ledger's point of view,
  // the row is effectively closed — Σ outstanding must NOT include these
  // rows or the sweep will alarm against a balanced GL forever.
  // Detection: `deletion_event_id` set + a SALES_LINE_REVERSAL TransactionEvent
  // points at this row. journalEngine.reverseJournal stamps both fields atomically.
  if (sl.deletion_event_id) {
    if (sl.outstanding_amount !== 0 || sl.paid_amount !== sl.invoice_total) {
      await SalesLine.updateOne(
        { _id: sl._id },
        { $set: { outstanding_amount: 0, paid_amount: sl.invoice_total, last_payment_at: null } },
        { session: session || undefined },
      );
    }
    return {
      _id: sl._id,
      outstanding_amount: 0,
      paid_amount: sl.invoice_total,
      last_payment_at: null,
      skipped: 'REVERSED',
    };
  }
  if (isCashRoute(sl)) {
    // Direct-cash sale — never had AR_TRADE exposure. Clamp to 0 if drift.
    if (sl.outstanding_amount !== 0 || sl.paid_amount !== sl.invoice_total) {
      await SalesLine.updateOne(
        { _id: sl._id },
        { $set: { outstanding_amount: 0, paid_amount: sl.invoice_total, last_payment_at: null } },
        { session: session || undefined },
      );
    }
    return {
      _id: sl._id,
      outstanding_amount: 0,
      paid_amount: sl.invoice_total,
      last_payment_at: null,
      skipped: 'CASH_ROUTE',
    };
  }

  // Aggregate the AR closure side: Σ POSTED Collection.settled_csis
  // matching this sales_line_id. settled_csis[].invoice_amount represents
  // the full face-value closure (cash + CWT combined), so subtracting it
  // alone gives the outstanding figure that matches GL AR_TRADE.
  const agg = await Collection.aggregate([
    { $match: { status: 'POSTED' } },
    { $unwind: '$settled_csis' },
    { $match: { 'settled_csis.sales_line_id': new mongoose.Types.ObjectId(String(salesLineId)) } },
    {
      $group: {
        _id: null,
        paid: { $sum: '$settled_csis.invoice_amount' },
        last_payment_at: { $max: '$cr_date' },
      },
    },
  ]).session(session || null);

  const paid = Math.round((agg[0]?.paid || 0) * 100) / 100;
  const lastPaymentAt = agg[0]?.last_payment_at || null;
  const outstanding = Math.round((Number(sl.invoice_total || 0) - paid) * 100) / 100;
  // Clamp negative outstanding (over-collection bug) to zero on the AR side
  // but DO NOT silently swallow — return the over-collected amount so the
  // integrity sweep can flag it.
  const finalOutstanding = outstanding < 0 ? 0 : outstanding;

  await SalesLine.updateOne(
    { _id: sl._id },
    {
      $set: {
        outstanding_amount: finalOutstanding,
        paid_amount: paid,
        last_payment_at: lastPaymentAt,
      },
    },
    { session: session || undefined },
  );

  return {
    _id: sl._id,
    outstanding_amount: finalOutstanding,
    paid_amount: paid,
    last_payment_at: lastPaymentAt,
    over_collected: outstanding < 0 ? Math.abs(outstanding) : 0,
  };
}

/**
 * Recompute every SalesLine referenced in a Collection's settled_csis.
 * Convenience helper for Collection POST/void/reopen — caller passes the
 * full Collection doc and we walk its settled_csis once.
 *
 * @param {object} collection — the Collection doc (or .toObject())
 * @param {object} [opts] — { session }
 * @returns {Promise<Array>} per-sales-line recompute results
 */
async function recomputeOutstandingForCollection(collection, opts = {}) {
  if (!collection?.settled_csis?.length) return [];
  const ids = Array.from(
    new Set(collection.settled_csis.map((c) => c.sales_line_id).filter(Boolean).map((x) => String(x))),
  );
  const out = [];
  for (const id of ids) {
    out.push(await recomputeOutstandingForSale(id, opts));
  }
  return out;
}

/**
 * Recompute outstanding_amount for ONE SupplierInvoice.
 * AP is simpler than AR — SupplierInvoice already tracks amount_paid (set by
 * ApPayment-side controllers); we just keep outstanding_amount in sync.
 *
 * @param {ObjectId|string} siId
 * @param {object} [opts] — { session }
 */
async function recomputeOutstandingForSupplierInvoice(siId, opts = {}) {
  const SupplierInvoice = require('../models/SupplierInvoice');
  const session = opts.session || null;

  const si = await SupplierInvoice.findById(siId)
    .session(session || null)
    .select('_id total_amount amount_paid outstanding_amount status deletion_event_id')
    .lean();
  if (!si) return { _id: siId, skipped: 'NOT_FOUND' };
  if (si.status !== 'POSTED') return { _id: siId, skipped: 'NOT_POSTED' };
  // Phase 28 SAP Storno reversal — see SalesLine note in
  // recomputeOutstandingForSale. SupplierInvoice carries the same
  // deletion_event_id contract.
  if (si.deletion_event_id) {
    if (si.outstanding_amount !== 0) {
      await SupplierInvoice.updateOne(
        { _id: si._id },
        { $set: { outstanding_amount: 0 } },
        { session: session || undefined },
      );
    }
    return { _id: si._id, outstanding_amount: 0, amount_paid: si.amount_paid || 0, skipped: 'REVERSED' };
  }

  const outstanding = Math.round(
    (Number(si.total_amount || 0) - Number(si.amount_paid || 0)) * 100,
  ) / 100;
  const finalOutstanding = outstanding < 0 ? 0 : outstanding;

  if (si.outstanding_amount !== finalOutstanding) {
    await SupplierInvoice.updateOne(
      { _id: si._id },
      { $set: { outstanding_amount: finalOutstanding } },
      { session: session || undefined },
    );
  }
  return {
    _id: si._id,
    outstanding_amount: finalOutstanding,
    amount_paid: si.amount_paid || 0,
    over_paid: outstanding < 0 ? Math.abs(outstanding) : 0,
  };
}

/**
 * Bulk recompute every POSTED SalesLine for an entity. Used by the migration
 * script + the "Recompute AR" admin button. Slow on large datasets — call
 * with care.
 *
 * @param {ObjectId} entityId
 * @param {object} [opts] — { batchSize=200 }
 * @returns {Promise<{ scanned: number, updated: number, skipped: number, over_collected: number[] }>}
 */
async function recomputeAllOutstandingForEntity(entityId, opts = {}) {
  const SalesLine = require('../models/SalesLine');
  const batchSize = opts.batchSize || 200;
  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  const overCollected = [];

  const cursor = SalesLine.find({ entity_id: entityId, status: 'POSTED' })
    .select('_id')
    .cursor({ batchSize });
  for await (const doc of cursor) {
    scanned += 1;
    const r = await recomputeOutstandingForSale(doc._id);
    if (r.skipped) skipped += 1;
    else updated += 1;
    if (r.over_collected > 0) overCollected.push({ _id: r._id, over: r.over_collected });
  }
  return { scanned, updated, skipped, over_collected: overCollected };
}

module.exports = {
  isCashRoute,
  recomputeOutstandingForSale,
  recomputeOutstandingForCollection,
  recomputeOutstandingForSupplierInvoice,
  recomputeAllOutstandingForEntity,
};
