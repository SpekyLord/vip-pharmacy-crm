/**
 * ecommCommissionEngine — Phase VIP-1.B (Apr 2026)
 *
 * Storefront Order.paid → ECOMM_REP and AREA_BDM commission accrual.
 *
 * Two payee roles handled here (BDM commission from Collection POSTED is the
 * existing pre-VIP-1.B flow, not this engine):
 *   ECOMM_REP — assigned to specific products / customers / territories
 *   AREA_BDM  — territory-resolved by Order.shipping_address.province
 *
 * Trigger:
 *   Storefront change-stream listener (VIP-1.D) on Order.paid calls
 *   `accrueForOrder({ order, userId, session })` inside the same Mongo
 *   transaction that lands the storefront Order, ERP Sale, JE.
 *
 * BIR_FLAG: Commissions ARE BIR-deductible. The eventual JE on commission
 * payout (via PRF for ECOMM_REP/AREA_BDM, or via payroll for employee
 * classification) MUST stamp 'BOTH'. The engine here writes only the
 * CommissionPayout ledger row; the JE policy is enforced at PRF/payroll
 * post time.
 *
 * Subscription posture:
 *   - entity_id required (Rule #19).
 *   - Lookup-driven matrix; no hardcoded rates.
 *   - Territory-province mapping comes from Territory model, not hardcoded.
 *
 * Atomicity + idempotency: same as rebateAccrualEngine.
 */

const mongoose = require('mongoose');

const CommissionPayout = require('../models/CommissionPayout');
const { matchStaffCommissionRule } = require('./matrixWalker');

let Territory; // lazy require to avoid circular cost when Territory not loaded
function getTerritoryModel() {
  if (!Territory) {
    try {
      Territory = mongoose.model('Territory');
    } catch (e) {
      Territory = require('../models/Territory');
    }
  }
  return Territory;
}

function derivePeriod(asOfDate) {
  const d = asOfDate ? new Date(asOfDate) : new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Resolve the AREA_BDM and Territory for a given province name.
 * Returns { territory_id, payee_id } or null if no match.
 *
 * SCHEMA GAP (deferred Phase 2.5): the existing Territory model
 * (backend/erp/models/Territory.js) does NOT yet carry the `provinces: []`
 * or `area_bdm_user_id` fields needed by AREA_BDM resolution. The CRM uses
 * Territory only for document-numbering (territory_code prefix in CALF-XXX,
 * PRF-XXX). VIP-1.B extends the conceptual model but does NOT add fields to
 * Territory in this commit (the schema modification + admin UI for setting
 * provinces+area_bdm_user_id is its own work item, scheduled for Phase 2.5
 * before storefront live launch).
 *
 * Until Territory is extended, this resolver returns null for all province
 * lookups, so the AREA_BDM path is a no-op. ECOMM_REP path is fully
 * functional today and is the more common storefront flow anyway.
 *
 * Subscriber adapter (post-Phase 2.5):
 *   Territory model gains `provinces: [String]` and `area_bdm_user_id` fields.
 *   Admin sets per-territory province list and area-BDM via Control Center
 *   → Territories. This resolver then walks that data without code change.
 */
async function resolveAreaBdmFromProvince({ entity_id, province, session }) {
  if (!entity_id || !province) return null;
  const TerritoryModel = getTerritoryModel();
  if (!TerritoryModel) return null;
  // Forward-compat query: matches when Territory has been extended with
  // provinces[]; gracefully returns null on the current pre-extension schema.
  const provinceTrim = String(province).trim();
  const t = await TerritoryModel.findOne({
    entity_id,
    is_active: { $ne: false },
    provinces: {
      $elemMatch: { $regex: `^${provinceTrim.replace(/[^\w\s-]/g, '')}$`, $options: 'i' },
    },
  })
    .session(session || null)
    .lean();
  if (!t) return null;
  // Prefer the explicit area-BDM field; fall back to first assigned_bdms[]
  // entry if subscriber has not yet adopted area_bdm_user_id.
  const payee_id = t.area_bdm_user_id || (t.assigned_bdms && t.assigned_bdms[0]) || null;
  return { territory_id: t._id, payee_id };
}

/**
 * Insert a CommissionPayout, swallowing dup-key on idempotent replay.
 */
async function safeWriteCommissionPayout(payload) {
  const { session, ...doc } = payload;
  try {
    await CommissionPayout.create([doc], session ? { session } : undefined);
  } catch (err) {
    if (err.code !== 11000) throw err;
  }
}

/**
 * Accrue ECOMM_REP commission for an order.
 *
 * The ECOMM_REP role is set on the Order itself (Order.ecomm_rep_id, populated
 * by the storefront when a rep handled the order). If no ecomm_rep_id, no
 * commission. Walk StaffCommissionRule for (entity, ECOMM_REP, payee_id).
 */
async function accrueEcommRep({ order, period, session }) {
  if (!order.ecomm_rep_id) return { count: 0, skipped: 0 };
  let count = 0;
  let skipped = 0;
  const orderTotal = order.net_amount || order.total || 0;

  for (const item of order.items || []) {
    const baseAmount = item.line_subtotal || (item.qty || 0) * (item.unit_price || 0);
    if (!(baseAmount > 0)) {
      skipped += 1;
      continue;
    }
    const rule = await matchStaffCommissionRule({
      entity_id: order.entity_id,
      payee_role: 'ECOMM_REP',
      payee_id: order.ecomm_rep_id,
      product_code: item.product_code || '',
      customer_code: order.customer_code || '',
      amount: orderTotal,
      asOfDate: order.paid_at,
    });
    if (!rule) {
      skipped += 1;
      continue; // No fallback for ECOMM_REP — explicit-rule-only
    }
    const commissionAmount = Math.round(baseAmount * (rule.commission_pct / 100) * 100) / 100;
    if (commissionAmount > 0) {
      await safeWriteCommissionPayout({
        entity_id: order.entity_id,
        payee_role: 'ECOMM_REP',
        payee_id: order.ecomm_rep_id,
        payee_name: order.ecomm_rep_name || '',
        source_kind: 'STOREFRONT_ECOMM',
        order_id: order._id,
        staff_commission_rule_id: rule._id,
        commission_pct: rule.commission_pct,
        commission_amount: commissionAmount,
        base_amount: baseAmount,
        period,
        status: 'ACCRUING',
        session,
      });
      count += 1;
    } else {
      skipped += 1;
    }
  }

  return { count, skipped };
}

/**
 * Accrue AREA_BDM commission for an order.
 *
 * Resolves the AREA_BDM via Territory lookup based on
 * order.shipping_address.province, then walks StaffCommissionRule for
 * (entity, AREA_BDM, payee_id, territory_id).
 */
async function accrueAreaBdm({ order, period, session }) {
  const province = order.shipping_address?.province;
  const ab = await resolveAreaBdmFromProvince({
    entity_id: order.entity_id,
    province,
    session,
  });
  if (!ab || !ab.payee_id) return { count: 0, skipped: 0 };

  let count = 0;
  let skipped = 0;
  const orderTotal = order.net_amount || order.total || 0;

  for (const item of order.items || []) {
    const baseAmount = item.line_subtotal || (item.qty || 0) * (item.unit_price || 0);
    if (!(baseAmount > 0)) {
      skipped += 1;
      continue;
    }
    const rule = await matchStaffCommissionRule({
      entity_id: order.entity_id,
      payee_role: 'AREA_BDM',
      payee_id: ab.payee_id,
      territory_id: ab.territory_id,
      product_code: item.product_code || '',
      customer_code: order.customer_code || '',
      amount: orderTotal,
      asOfDate: order.paid_at,
    });
    if (!rule) {
      skipped += 1;
      continue;
    }
    const commissionAmount = Math.round(baseAmount * (rule.commission_pct / 100) * 100) / 100;
    if (commissionAmount > 0) {
      await safeWriteCommissionPayout({
        entity_id: order.entity_id,
        payee_role: 'AREA_BDM',
        payee_id: ab.payee_id,
        source_kind: 'STOREFRONT_AREA_BDM',
        order_id: order._id,
        territory_id: ab.territory_id,
        staff_commission_rule_id: rule._id,
        commission_pct: rule.commission_pct,
        commission_amount: commissionAmount,
        base_amount: baseAmount,
        period,
        status: 'ACCRUING',
        session,
      });
      count += 1;
    } else {
      skipped += 1;
    }
  }

  return { count, skipped };
}

/**
 * Main entry. Caller (storefront listener / VIP-1.D) wraps this in the same
 * transaction as the Order POSTED + ERP Sale + JE.
 *
 * @param {Object} args
 * @param {Object} args.order — storefront Order doc / lean
 * @param {ObjectId|string} args.userId
 * @param {ClientSession} [args.session]
 */
async function accrueForOrder({ order, userId, session } = {}) {
  if (!order || !order._id) {
    throw new Error('ecommCommissionEngine: order._id required');
  }
  if (!order.entity_id) {
    throw new Error('ecommCommissionEngine: order.entity_id required');
  }
  const period = derivePeriod(order.paid_at);

  const ecomm = await accrueEcommRep({ order, period, session });
  const area = await accrueAreaBdm({ order, period, session });

  return {
    ecommRep: ecomm.count,
    areaBdm: area.count,
    skipped: ecomm.skipped + area.skipped,
  };
}

module.exports = {
  derivePeriod,
  resolveAreaBdmFromProvince,
  accrueEcommRep,
  accrueAreaBdm,
  accrueForOrder,
};
