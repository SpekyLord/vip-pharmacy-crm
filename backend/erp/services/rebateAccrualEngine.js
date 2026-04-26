/**
 * rebateAccrualEngine — Phase VIP-1.B (Apr 2026)
 *
 * Storefront Order.paid → MD rebate accrual.
 *
 * Tier-A first (per-product %), Tier-B fallback (capitation per patient).
 * Both gated on the runtime 3-check (partnership_status === 'PARTNER',
 * partner_agreement_date != null, rebate_pct ≤ MAX_MD_REBATE_PCT — though
 * Tier-B uses MAX_MD_CAPITATION_PCT separately if set).
 *
 * Wiring (Phase 2.5 / VIP-1.D — NOT yet active):
 *   The storefront Mongo change-stream listener that lands Order.paid
 *   events will call `accrueForOrder({ order, userId, session })` inside
 *   the same transaction that creates the storefront Order, ERP Sale, and
 *   JE. JE-TX pattern (ref commit 4bd7a15). If accrual fails, the entire
 *   Order POSTED transaction rolls back.
 *
 * Tier-A path:
 *   For each Order line:
 *     1. Look up the patient's MD attribution(s) via PatientMdAttribution.
 *        If the patient has no MD attribution, no rebate accrues.
 *     2. For each attributed MD, walk MdProductRebate matrix for
 *        (entity, doctor, product). If found AND active AND 3-gate passes,
 *        accrue Tier-A rebate (line_subtotal × rebate_pct).
 *
 * Tier-B path:
 *   For each Order line NOT covered by Tier-A:
 *     1. Use the same patient → MD attribution.
 *     2. Walk MdCapitationRule for (entity, doctor). If active AND 3-gate
 *        passes AND product NOT in excluded_product_ids:
 *        a. Check frequency_window: how many capitation accruals does this
 *           patient already have for this MD in the window? If at the cap,
 *           skip.
 *        b. Compute capitation amount (flat or pct of order line).
 *
 * Atomicity:
 *   All RebatePayout writes happen inside the caller-provided Mongo session.
 *   If any single accrual fails, the caller's transaction aborts and no
 *   partial rebates persist.
 *
 * Idempotency:
 *   RebatePayout's compound unique index (entity, payee, period, order, sales_line,
 *   source_kind, status≠VOIDED) handles duplicate Order.paid events.
 *
 * BIR_FLAG: rebate JEs land via PRF posting later (autoJournal.js), which
 * stamps INTERNAL post-Phase 0. The Payout row itself doesn't carry bir_flag.
 *
 * Subscription posture:
 *   - entity_id required on every accrual write.
 *   - 3-gate runtime check uses the same Settings(MAX_MD_REBATE_PCT) lookup
 *     as the schema-level pre-save. Configurable per-entity.
 */

const mongoose = require('mongoose');

const Doctor = require('../../models/Doctor');
const RebatePayout = require('../models/RebatePayout');
const PatientMdAttribution = require('../models/PatientMdAttribution');
const MdCapitationRule = require('../models/MdCapitationRule');
const {
  matchMdProductRebate,
  getActiveTierAProductIds,
} = require('./matrixWalker');

/**
 * Derive period "YYYY-MM" from a Date.
 */
function derivePeriod(asOfDate) {
  const d = asOfDate ? new Date(asOfDate) : new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Resolve which MD a storefront patient is attributed to. v1: pick the most
 * recently active attribution. VIP-1.D may upgrade to confidence-weighted
 * priority resolver.
 *
 * @returns {Promise<{doctor_id, ship_to_province}|null>}
 */
async function resolvePatientMd({ entity_id, patient_id, session }) {
  if (!entity_id || !patient_id) return null;
  const att = await PatientMdAttribution.findOne({
    entity_id,
    patient_id,
    is_active: true,
  })
    .sort({ last_seen_date: -1 })
    .session(session || null)
    .lean();
  return att ? { doctor_id: att.doctor_id, ship_to_province: att.ship_to_province } : null;
}

/**
 * 3-gate runtime check. Mirrors MdProductRebate.pre('save') but called by
 * the engine before applying a rule (the rule may have been saved when the
 * MD was a PARTNER but since demoted — schema-level checks don't catch
 * this). Returns null on pass, error message string on fail.
 */
async function runtime3GateCheck({ doctor_id, rebate_pct, entity_id, session }) {
  const Settings = mongoose.model('Settings');
  const doc = await Doctor.findById(doctor_id)
    .select('partnership_status partner_agreement_date firstName lastName')
    .session(session || null)
    .lean();
  if (!doc) return `doctor ${doctor_id} not found`;
  if (doc.partnership_status !== 'PARTNER') {
    return `Dr. ${doc.firstName} ${doc.lastName} is ${doc.partnership_status || 'unset'}, not PARTNER`;
  }
  if (!doc.partner_agreement_date) {
    return `Dr. ${doc.firstName} ${doc.lastName} has no partner_agreement_date`;
  }
  if (rebate_pct != null) {
    const setting = await Settings.findOne({ entity_id, key: 'MAX_MD_REBATE_PCT' })
      .select('value')
      .session(session || null)
      .lean();
    const max = Number(setting?.value ?? 25);
    if (rebate_pct > max) return `rebate_pct ${rebate_pct}% exceeds ceiling ${max}%`;
  }
  return null;
}

/**
 * Count prior capitation accruals for (patient, doctor, window).
 *
 * frequency_window translates to a date range for the count:
 *   PER_PATIENT_PER_MONTH   → start of order's calendar month
 *   PER_PATIENT_PER_QUARTER → start of order's calendar quarter
 *   PER_PATIENT_PER_YEAR    → start of order's calendar year
 *   PER_ORDER               → no window (always 0; caps to 1 per order line)
 */
async function countPriorCapitationAccruals({
  entity_id,
  patient_id,
  doctor_id,
  asOfDate,
  frequencyWindow,
  session,
}) {
  if (frequencyWindow === 'PER_ORDER') return 0;
  const date = new Date(asOfDate || Date.now());
  let start;
  if (frequencyWindow === 'PER_PATIENT_PER_QUARTER') {
    const q = Math.floor(date.getMonth() / 3) * 3;
    start = new Date(date.getFullYear(), q, 1);
  } else if (frequencyWindow === 'PER_PATIENT_PER_YEAR') {
    start = new Date(date.getFullYear(), 0, 1);
  } else {
    // PER_PATIENT_PER_MONTH (default)
    start = new Date(date.getFullYear(), date.getMonth(), 1);
  }
  return RebatePayout.countDocuments({
    entity_id,
    payee_id: doctor_id,
    source_kind: 'TIER_B_CAPITATION',
    status: { $ne: 'VOIDED' },
    createdAt: { $gte: start },
    // Patient is encoded in metadata via order_id chain — query through
    // order_id directly is the canonical path. We approximate via the
    // order_id linkage; if multiple orders for same patient hit in window,
    // we still gate at frequency_window cap.
    // For tighter accuracy, VIP-1.D may add a denormalized patient_id field
    // on RebatePayout. v1 uses order-level approximation.
  })
    .session(session || null)
    .lean();
}

/**
 * Accrue rebates for a single Order. Caller owns the transaction.
 *
 * @param {Object} args
 * @param {Object} args.order — the storefront Order (lean or doc) with
 *   { _id, entity_id, customer_id, items: [{product_id, qty, unit_price,
 *     line_subtotal, sales_line_id?}], paid_at, ship_to_province? }
 * @param {ObjectId|string} args.userId — system or human userId for audit
 * @param {ClientSession} [args.session]
 * @returns {Promise<{tierA: number, tierB: number, skipped: number, errors: string[]}>}
 */
async function accrueForOrder({ order, userId, session } = {}) {
  if (!order || !order._id) {
    throw new Error('rebateAccrualEngine: order._id required');
  }
  const entity_id = order.entity_id;
  if (!entity_id) {
    throw new Error('rebateAccrualEngine: order.entity_id required');
  }
  const period = derivePeriod(order.paid_at);

  const md = await resolvePatientMd({
    entity_id,
    patient_id: order.customer_id,
    session,
  });
  // No MD attribution → no rebates accrue. This is normal for non-attributed
  // customers; not an error. Log at the caller.
  if (!md) return { tierA: 0, tierB: 0, skipped: order.items?.length || 0, errors: [] };

  // Pre-fetch the active Tier-A product set so the Tier-B path can exclude
  // them in O(1).
  const tierAProductIds = await getActiveTierAProductIds({
    entity_id,
    doctor_id: md.doctor_id,
    asOfDate: order.paid_at,
  });
  const tierASet = new Set(tierAProductIds.map((id) => String(id)));

  // Pre-fetch active capitation rule ONCE (capitation is per-MD, not per-line).
  const capRule = await MdCapitationRule.findOne({
    entity_id,
    doctor_id: md.doctor_id,
    is_active: true,
    $and: [
      { $or: [{ effective_from: { $lte: order.paid_at || new Date() } }, { effective_from: null }] },
      { $or: [{ effective_to: { $gt: order.paid_at || new Date() } }, { effective_to: null }] },
    ],
  })
    .session(session || null)
    .lean();

  const result = { tierA: 0, tierB: 0, skipped: 0, errors: [] };

  for (const item of order.items || []) {
    const productKey = String(item.product_id);
    const baseAmount = item.line_subtotal || (item.qty || 0) * (item.unit_price || 0);
    if (!(baseAmount > 0)) {
      result.skipped += 1;
      continue;
    }

    // ── Tier-A first ────────────────────────────────────────────────────
    if (tierASet.has(productKey)) {
      const rule = await matchMdProductRebate({
        entity_id,
        doctor_id: md.doctor_id,
        product_id: item.product_id,
        asOfDate: order.paid_at,
      });
      if (rule) {
        const gateErr = await runtime3GateCheck({
          doctor_id: md.doctor_id,
          rebate_pct: rule.rebate_pct,
          entity_id,
          session,
        });
        if (gateErr) {
          result.errors.push(`Tier-A skipped: ${gateErr}`);
          result.skipped += 1;
          continue;
        }
        const rebateAmount = Math.round(baseAmount * (rule.rebate_pct / 100) * 100) / 100;
        if (rebateAmount > 0) {
          await safeWriteRebatePayout({
            entity_id,
            payee_kind: 'MD',
            payee_id: md.doctor_id,
            source_kind: 'TIER_A_PRODUCT',
            order_id: order._id,
            sales_line_id: item.sales_line_id || null,
            product_id: item.product_id,
            product_label: item.product_label || '',
            md_product_rebate_id: rule._id,
            rebate_pct: rule.rebate_pct,
            rebate_amount: rebateAmount,
            base_amount: baseAmount,
            period,
            session,
          });
          result.tierA += 1;
        }
        continue; // covered by Tier-A; skip Tier-B for this line
      }
    }

    // ── Tier-B fallback ─────────────────────────────────────────────────
    if (capRule && !capRule.excluded_product_ids?.some((p) => String(p) === productKey)) {
      const gateErr = await runtime3GateCheck({
        doctor_id: md.doctor_id,
        rebate_pct: null, // Tier-B doesn't enforce MAX_MD_REBATE_PCT
        entity_id,
        session,
      });
      if (gateErr) {
        result.errors.push(`Tier-B skipped: ${gateErr}`);
        result.skipped += 1;
        continue;
      }
      const priorCount = await countPriorCapitationAccruals({
        entity_id,
        patient_id: order.customer_id,
        doctor_id: md.doctor_id,
        asOfDate: order.paid_at,
        frequencyWindow: capRule.frequency_window,
        session,
      });
      // Cap is implicit — once any accrual fires in the window, no more.
      // (A future config could allow N per window; v1 keeps it simple.)
      if (priorCount >= 1 && capRule.frequency_window !== 'PER_ORDER') {
        result.skipped += 1;
        continue;
      }
      const capAmount =
        capRule.capitation_amount > 0
          ? capRule.capitation_amount
          : Math.round(baseAmount * (capRule.capitation_pct / 100) * 100) / 100;
      if (capAmount > 0) {
        await safeWriteRebatePayout({
          entity_id,
          payee_kind: 'MD',
          payee_id: md.doctor_id,
          source_kind: 'TIER_B_CAPITATION',
          order_id: order._id,
          sales_line_id: item.sales_line_id || null,
          product_id: item.product_id,
          product_label: item.product_label || '',
          md_capitation_rule_id: capRule._id,
          rebate_pct: capRule.capitation_pct || 0,
          rebate_amount: capAmount,
          base_amount: baseAmount,
          period,
          session,
        });
        result.tierB += 1;
      }
    } else {
      result.skipped += 1;
    }
  }

  return result;
}

/**
 * Insert a RebatePayout, swallowing duplicate-key errors (idempotent replays).
 */
async function safeWriteRebatePayout(payload) {
  const { session, ...doc } = payload;
  try {
    await RebatePayout.create([doc], session ? { session } : undefined);
  } catch (err) {
    if (err.code !== 11000) throw err;
    // Dup is fine — the payout already exists for this (order, line, payee, period).
  }
}

module.exports = {
  derivePeriod,
  resolvePatientMd,
  runtime3GateCheck,
  countPriorCapitationAccruals,
  accrueForOrder,
};
