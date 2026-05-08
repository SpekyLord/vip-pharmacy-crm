/**
 * autoPrfRoutingForSale — Phase R-Storefront Phase 2 (May 8 2026)
 *
 * Sister of autoPrfRouting.js (Collection version). Generates PRFs (Payment
 * Requisition Forms) + RebatePayout/CommissionPayout accruals from a storefront
 * cash SalesLine's manually-attributed `partner_tags[]` and `commission_pct`.
 *
 * Why a separate service?
 *   Storefront cash sales (CASH_RECEIPT + SERVICE_INVOICE routed through
 *   petty_cash_fund) bypass AR — arEngine.js excludes petty_cash_fund_id != null
 *   — so they never appear in a Collection. The Collection-side rebate engine
 *   never fires for them. This service mirrors the Collection POSTED path but
 *   sources its rebate inputs from SalesLine instead.
 *
 * Phase R1 single-flow lock (Apr 29 2026):
 *   ALL rebate accruals route to PrfCalf, never IncentivePayout PAID_DIRECT.
 *   PRC Code of Ethics kickback exposure is avoided by sourcing all outflows
 *   from PRF — admin reviews, attaches MOA / honoraria documentation, and
 *   POSTs the PRF to release funds. autoPrfRoutingForSale follows this lock.
 *
 * Trigger options (both wired in salesController):
 *   - Real-time on POST: postSaleRow() calls this inside its existing Mongo
 *     transaction. Failure rolls back the whole sale post (FIFO + JE + petty
 *     cash deposit + rebate routing all atomic together).
 *   - Post-POSTED edit: attachStorefrontRebate() calls this in its own session
 *     after the SalesLine save lands. Failure rolls back the attribution edit
 *     so the audit trail and the PRF stay in lockstep.
 *   - Period-close sweep: storefrontRebateSweep() iterates POSTED storefront
 *     sales for an OPEN period and re-routes — idempotent, safe to re-run.
 *
 * Idempotency:
 *   - RebatePayout: composite (entity, payee, period, sales_line_id, source_kind)
 *     is unique via partial index. Re-running on the same sale is a no-op.
 *   - CommissionPayout: same pattern, keyed on sales_line_id.
 *   - PrfCalf: query (entity, doc_type=PRF, period, metadata.source_sales_line_id,
 *     metadata.payee_id). If found, reuse. New sparse index `autoPrfRoutingForSale_idem`
 *     covers this lookup.
 *
 * Approval routing (Rule #20):
 *   PRFs created here ship as DRAFT. Admin/finance reviews the Approval Hub,
 *   attaches CME-grant / honoraria / patient-program documentation, and submits
 *   via the normal PRF lifecycle. autoPrfRoutingForSale does NOT auto-submit.
 *
 * BIR_FLAG: PRFs default 'INTERNAL' — same as Collection-side. Rebate JEs
 * never hit BIR P&L (Phase 0 invariant locked Apr 26 2026).
 *
 * Subscription posture (Rule #19):
 *   - entity_id required; never crosses tenant boundaries.
 *   - Period derived from sale.csi_date (YYYY-MM) — same convention as Collection.
 *   - All thresholds + role gates are lookup-driven (Rule #3).
 */

const mongoose = require('mongoose');

const SalesLine = require('../models/SalesLine');
const PrfCalf = require('../models/PrfCalf');
const RebatePayout = require('../models/RebatePayout');
const CommissionPayout = require('../models/CommissionPayout');

/**
 * Derive the period string ("YYYY-MM") from a SalesLine's csi_date.
 * Same convention as deriveCollectionPeriod.
 */
function deriveSalePeriod(sale) {
  const d = new Date(sale.csi_date || sale.createdAt || Date.now());
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
}

/**
 * Aggregate partner_tags across line_items + top-level into per-payee buckets.
 *
 * For CASH_RECEIPT/CSI: walk line_items[].partner_tags[]. The same MD across
 * different lines collapses into one bucket per (sale, MD) so the PRF rolls
 * up correctly.
 *
 * For SERVICE_INVOICE: walk top-level partner_tags[].
 *
 * Returns Map<doctor_id_str, { payee_id, payee_name, lines: [...], total }>.
 */
function aggregatePartnerTagsByPayee(sale) {
  const buckets = new Map();
  const pushBucket = (tag, lineCtx) => {
    if (!tag.doctor_id || !(tag.rebate_amount > 0)) return;
    const key = String(tag.doctor_id);
    if (!buckets.has(key)) {
      buckets.set(key, {
        payee_id: tag.doctor_id,
        payee_name: tag.doctor_name || '',
        lines: [],
        total: 0,
      });
    }
    const bucket = buckets.get(key);
    bucket.lines.push({
      sales_line_id: sale._id,
      line_item_id: lineCtx.line_item_id || null,
      product_id: lineCtx.product_id || null,
      product_label: lineCtx.product_label || '',
      rebate_pct: tag.rebate_pct || 0,
      rebate_amount: tag.rebate_amount || 0,
      base_amount: lineCtx.base_amount || 0,
    });
    bucket.total += tag.rebate_amount || 0;
  };

  if (sale.sale_type === 'SERVICE_INVOICE') {
    // No line items — top-level partner_tags only.
    for (const tag of sale.partner_tags || []) {
      pushBucket(tag, {
        line_item_id: null,
        product_id: null,
        product_label: sale.service_description || 'Service',
        base_amount: sale.total_net_of_vat || 0,
      });
    }
  } else {
    // CASH_RECEIPT / CSI — per-line partner_tags. Top-level on these sale_types
    // is unused per the Phase 1 schema decision; ignore it defensively.
    for (const item of sale.line_items || []) {
      for (const tag of item.partner_tags || []) {
        pushBucket(tag, {
          line_item_id: item._id,
          product_id: item.product_id,
          product_label: item.item_key || '',
          base_amount: item.net_of_vat || 0,
        });
      }
    }
  }

  return buckets;
}

/**
 * Write RebatePayout(ACCRUING) rows for one payee bucket. Idempotent — partial
 * unique index swallows duplicate inserts (ordered:false continues past dups).
 */
async function writeRebatePayouts({
  entity_id,
  sale,
  period,
  bucket,
  session,
}) {
  const docs = bucket.lines.map((ln) => ({
    entity_id,
    payee_kind: 'MD', // Storefront partner_tags are always Doctors (CRM).
    payee_id: bucket.payee_id,
    payee_name: bucket.payee_name,
    source_kind: 'STOREFRONT_MANUAL',
    collection_id: null,
    sales_line_id: sale._id,
    order_id: null,
    product_id: ln.product_id || null,
    product_label: ln.product_label || '',
    md_product_rebate_id: null,
    md_capitation_rule_id: null,
    non_md_rule_id: null,
    rebate_pct: ln.rebate_pct || 0,
    rebate_amount: ln.rebate_amount || 0,
    base_amount: ln.base_amount || 0,
    period,
    status: 'ACCRUING',
  }));

  if (!docs.length) return [];

  try {
    return await RebatePayout.insertMany(docs, {
      ordered: false,
      session,
    });
  } catch (err) {
    // E11000 dup-key swallowed: prior accruals for the same source-line are
    // expected on idempotent replays. Re-throw anything else.
    if (err.code !== 11000 && (err.writeErrors || []).every((e) => e.code !== 11000)) {
      throw err;
    }
    // Return what's now in the DB for this sale / payee.
    return RebatePayout.find({
      entity_id,
      sales_line_id: sale._id,
      payee_id: bucket.payee_id,
      period,
    })
      .session(session || null)
      .lean();
  }
}

/**
 * Write a CommissionPayout(ACCRUING) row for the sale's BDM. Idempotent — same
 * (entity, payee, period, sales_line_id, source_kind=STOREFRONT_BDM) is unique.
 *
 * Returns the persisted row (created or pre-existing).
 */
async function writeBdmCommissionPayout({
  entity_id,
  sale,
  period,
  session,
}) {
  if (!(sale.commission_amount > 0)) return null;
  if (!sale.bdm_id) return null;

  const doc = {
    entity_id,
    payee_role: 'BDM',
    payee_id: sale.bdm_id,
    payee_name: '', // resolved on read by the consumer (UI joins User on payee_id)
    source_kind: 'STOREFRONT_BDM',
    collection_id: null,
    sales_line_id: sale._id,
    order_id: null,
    territory_id: null,
    staff_commission_rule_id: null,
    comp_profile_id: null,
    commission_pct: sale.commission_pct || 0,
    commission_amount: sale.commission_amount || 0,
    base_amount: sale.total_net_of_vat || 0,
    period,
    status: 'ACCRUING',
  };

  try {
    const created = await CommissionPayout.create(
      [doc],
      session ? { session } : undefined
    );
    return Array.isArray(created) ? created[0] : created;
  } catch (err) {
    if (err.code !== 11000) throw err;
    return CommissionPayout.findOne({
      entity_id,
      payee_id: sale.bdm_id,
      period,
      sales_line_id: sale._id,
      source_kind: 'STOREFRONT_BDM',
    })
      .session(session || null)
      .lean();
  }
}

/**
 * Find or create a DRAFT PrfCalf for this (sale, payee, period). Idempotent
 * via the new autoPrfRoutingForSale_idem index.
 */
async function ensurePrfForBucket({
  entity_id,
  bdm_id,
  sale,
  cycle,
  period,
  bucket,
  userId,
  session,
}) {
  // Idempotency: any PRF whose source already references this (sale, payee, period)?
  const existing = await PrfCalf.findOne({
    entity_id,
    doc_type: 'PRF',
    period,
    'metadata.source_sales_line_id': sale._id,
    'metadata.payee_id': bucket.payee_id,
  })
    .session(session || null)
    .lean();
  if (existing) return { prf: existing, created: false };

  const docRefForPurpose = sale.invoice_number || sale.doc_ref || sale.sale_type;
  const prfPayload = {
    entity_id,
    bdm_id,
    doc_type: 'PRF',
    prf_type: 'PARTNER_REBATE',
    period,
    cycle,
    payee_name: bucket.payee_name,
    partner_id: bucket.payee_id,
    payee_type: 'DOCTOR', // Storefront partner_tags are always Doctors.
    linked_collection_id: null,
    linked_sales_line_id: sale._id,
    rebate_amount: bucket.total,
    amount: bucket.total,
    bir_flag: 'INTERNAL', // explicit — rebate JEs never hit BIR P&L (Phase 0)
    purpose: `MD partner rebate — ${sale.sale_type} ${docRefForPurpose}`,
    status: 'DRAFT',
    created_by: userId,
    metadata: {
      auto_generated_by: 'autoPrfRoutingForSale',
      source_sales_line_id: sale._id,
      source_sale_type: sale.sale_type,
      source_doc_ref: docRefForPurpose,
      payee_id: bucket.payee_id,
      payee_kind: 'MD',
      lines: bucket.lines,
    },
  };

  const created = await PrfCalf.create(
    [prfPayload],
    session ? { session } : undefined
  );
  return { prf: Array.isArray(created) ? created[0] : created, created: true };
}

/**
 * Main entry point. Routes one POSTED SalesLine's storefront attribution into
 * RebatePayout/CommissionPayout accruals + DRAFT PRFs for each MD payee.
 *
 * @param {Object} args
 * @param {ObjectId|string} args.salesLineId — the SalesLine to route
 * @param {ObjectId|string} args.userId — caller (for created_by audit)
 * @param {ClientSession} [args.session] — outer Mongo transaction session
 * @returns {Promise<{ rebatePayouts, commissionPayouts, prfsCreated, prfsExisted, payeesProcessed }>}
 */
async function routePrfsForSale({ salesLineId, userId, session } = {}) {
  if (!salesLineId) {
    throw new Error('autoPrfRoutingForSale.routePrfsForSale: salesLineId required');
  }

  const sale = await SalesLine.findById(salesLineId)
    .session(session || null)
    .lean();
  if (!sale) {
    throw new Error(`autoPrfRoutingForSale: sale ${salesLineId} not found`);
  }
  if (sale.status !== 'POSTED') {
    // Defensive — caller should only invoke on POSTED rows. The real-time
    // path inside postSaleRow flips status='POSTED' BEFORE calling this, so
    // the lean() snapshot above will already reflect that.
    throw new Error(
      `autoPrfRoutingForSale: refusing to route for non-POSTED sale (status=${sale.status})`
    );
  }
  // Defensive — if sale was reversed/deletion-requested, do nothing. The
  // documentReversalService voids dependent payouts via its own cascade.
  if (sale.deletion_event_id) {
    return { rebatePayouts: 0, commissionPayouts: 0, prfsCreated: 0, prfsExisted: 0, payeesProcessed: 0, skipped: 'reversed' };
  }
  if (sale.status === 'DELETION_REQUESTED') {
    return { rebatePayouts: 0, commissionPayouts: 0, prfsCreated: 0, prfsExisted: 0, payeesProcessed: 0, skipped: 'deletion_requested' };
  }

  const period = deriveSalePeriod(sale);
  // Cycle: storefront sales don't have an explicit BDM cycle, so default to
  // M1. Admin can re-tag manually if needed; the field is required by PrfCalf.
  const cycle = 'M1';

  const buckets = aggregatePartnerTagsByPayee(sale);

  let rebatePayoutsCount = 0;
  let prfsCreated = 0;
  let prfsExisted = 0;

  for (const [, bucket] of buckets) {
    if (!(bucket.total > 0)) continue;
    const payouts = await writeRebatePayouts({
      entity_id: sale.entity_id,
      sale,
      period,
      bucket,
      session,
    });
    rebatePayoutsCount += payouts.length;

    const { created } = await ensurePrfForBucket({
      entity_id: sale.entity_id,
      bdm_id: sale.bdm_id,
      sale,
      cycle,
      period,
      bucket,
      userId,
      session,
    });
    if (created) prfsCreated += 1;
    else prfsExisted += 1;
  }

  // BDM commission accrual — sister of rebate accrual, runs even when there
  // are zero partner_tags (commission can be set without MD attribution).
  const commissionRow = await writeBdmCommissionPayout({
    entity_id: sale.entity_id,
    sale,
    period,
    session,
  });

  return {
    rebatePayouts: rebatePayoutsCount,
    commissionPayouts: commissionRow ? 1 : 0,
    prfsCreated,
    prfsExisted,
    payeesProcessed: buckets.size,
  };
}

/**
 * Period-close batch sweep. Idempotent over POSTED storefront cash sales for
 * a given (entity, period). Catches sales attached after their initial POST
 * (the editable-post-POSTED path), where the real-time route may not have
 * fired or had partial attribution.
 *
 * Caller (admin) invokes via POST /api/erp/sales/storefront-rebate-sweep.
 * Period-lock awareness: rejects sweeps on a CLOSED/LOCKED period — admin
 * must reopen the period or sweep before close.
 *
 * @param {Object} args
 * @param {ObjectId|string} args.entityId
 * @param {String} args.period — "YYYY-MM"
 * @param {ObjectId|string} args.userId
 * @returns {Promise<{ scanned, routed, skipped, results }>}
 */
async function storefrontRebateSweep({ entityId, period, userId } = {}) {
  if (!entityId) throw new Error('storefrontRebateSweep: entityId required');
  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    throw new Error('storefrontRebateSweep: period required (YYYY-MM)');
  }

  // Period-lock guard — refuse to write into a closed period. Admin must
  // reopen first; the sweep result accrual would otherwise leak past close.
  const { checkPeriodOpen } = require('../utils/periodLock');
  await checkPeriodOpen(entityId, period);

  // Period range — first to last day of YYYY-MM.
  const [yy, mm] = period.split('-').map(Number);
  const periodStart = new Date(yy, mm - 1, 1);
  const periodEnd = new Date(yy, mm, 1);

  const sales = await SalesLine.find({
    entity_id: entityId,
    sale_type: { $in: ['CASH_RECEIPT', 'SERVICE_INVOICE'] },
    petty_cash_fund_id: { $ne: null },
    status: 'POSTED',
    deletion_event_id: null,
    csi_date: { $gte: periodStart, $lt: periodEnd },
    // Only sweep sales with attribution — bare cash sales without MD/comm
    // skip the routing entirely (nothing to route).
    $or: [
      { total_partner_rebates: { $gt: 0 } },
      { commission_amount: { $gt: 0 } },
    ],
  })
    .select('_id')
    .lean();

  const results = [];
  let routed = 0;
  let skipped = 0;
  for (const s of sales) {
    try {
      const r = await routePrfsForSale({ salesLineId: s._id, userId });
      results.push({ sales_line_id: s._id, ...r });
      if (r.payeesProcessed > 0 || r.commissionPayouts > 0) routed += 1;
      else skipped += 1;
    } catch (err) {
      results.push({ sales_line_id: s._id, error: err.message });
      skipped += 1;
    }
  }

  return { scanned: sales.length, routed, skipped, results };
}

module.exports = {
  deriveSalePeriod,
  aggregatePartnerTagsByPayee,
  writeRebatePayouts,
  writeBdmCommissionPayout,
  ensurePrfForBucket,
  routePrfsForSale,
  storefrontRebateSweep,
};
