/**
 * matrixWalker — Phase VIP-1.B (Apr 2026)
 *
 * Centralized rule-matching helpers for the three rebate / commission
 * matrices. Consumers:
 *   - Collection.js pre-save bridge (Phase 2) — auto-fills md_rebate_lines,
 *     partner_tags[].rebate_pct, settled_csis[].commission_rate
 *   - rebateAccrualEngine (Phase 2) — storefront Order.paid handler
 *   - ecommCommissionEngine (Phase 2) — storefront Order.paid handler
 *   - autoPrfRouting (Phase 2) — period-close PRF generation
 *
 * Design principles:
 *   1. **Read-only.** This module never writes. It returns the matched rule
 *      row or null; the caller decides what to do.
 *   2. **Effective-dating.** Every match honors effective_from <= asOfDate
 *      and (effective_to == null OR asOfDate < effective_to).
 *   3. **Match priority.** Most-specific match wins (more conditions matched);
 *      ties broken by priority asc (lower priority = runs first).
 *   4. **Subscription-safe.** Always entity-scoped. No cross-entity bleed.
 *   5. **Cache-cold safe.** Each matcher does its own query — no in-process
 *      cache that would go stale after admin matrix edits. Cost is one
 *      indexed query per match call; the indexes are defined to cover.
 *
 * BIR_FLAG note (downstream policy reminder):
 *   Consumers feeding rebate JEs MUST stamp bir_flag: 'INTERNAL'.
 *   Consumers feeding commission JEs MUST stamp bir_flag: 'BOTH'.
 *   This module doesn't enforce either — it just returns rules. The
 *   engine layer is the policy enforcer.
 */

const mongoose = require('mongoose');

const MdProductRebate = require('../models/MdProductRebate');
const NonMdPartnerRebateRule = require('../models/NonMdPartnerRebateRule');
const StaffCommissionRule = require('../models/StaffCommissionRule');

/**
 * Effective-dating filter. Builds the Mongo $and clause so an active rule
 * matches when its window covers asOfDate.
 */
function effectiveDatingClause(asOfDate) {
  const date = asOfDate || new Date();
  return {
    is_active: true,
    $and: [
      { $or: [{ effective_from: { $lte: date } }, { effective_from: null }] },
      { $or: [{ effective_to: { $gt: date } }, { effective_to: null }] },
    ],
  };
}

/**
 * matchMdProductRebate — Tier-A lookup (single-match, back-compat).
 *
 * Returns the single most-recently-created active rule row for
 * (entity, doctor, hospital, product) effective at asOfDate, or null.
 *
 * Phase R1 (Apr 29 2026): hospital_id is now required for a match. Callers
 * that need every match (the "multiple partners earn full %" semantics) must
 * call `matchAllMdProductRebates` instead. This single-match API is preserved
 * for storefront Order.paid (one MD attribution per patient → at most one
 * rule at the (doctor, hospital, product) key per the admin UI).
 *
 * @param {Object} opts
 * @param {ObjectId|string} opts.entity_id
 * @param {ObjectId|string} opts.doctor_id
 * @param {ObjectId|string} opts.hospital_id  REQUIRED in Phase R1
 * @param {ObjectId|string} opts.product_id
 * @param {Date} [opts.asOfDate] — defaults to now
 * @returns {Promise<MdProductRebate|null>} lean doc or null
 */
async function matchMdProductRebate({
  entity_id,
  doctor_id,
  hospital_id,
  product_id,
  asOfDate,
} = {}) {
  if (!entity_id || !doctor_id || !hospital_id || !product_id) return null;
  const filter = {
    entity_id,
    doctor_id,
    hospital_id,
    product_id,
    ...effectiveDatingClause(asOfDate),
  };
  return MdProductRebate.findOne(filter).sort({ createdAt: -1 }).lean();
}

/**
 * matchAllMdProductRebates — Phase R1 multi-match Tier-A lookup.
 *
 * Returns ALL active rule rows for (entity, doctor, hospital, product)
 * effective at asOfDate. Locked design (Apr 29 2026): when multiple rules
 * exist at the same key (rare — typically a base rate plus an effective-
 * dated promo), each rule earns full % independently. The Collection bridge
 * pushes one md_rebate_lines entry per matching rule.
 *
 * @returns {Promise<MdProductRebate[]>} lean docs (possibly empty)
 */
async function matchAllMdProductRebates({
  entity_id,
  doctor_id,
  hospital_id,
  product_id,
  asOfDate,
} = {}) {
  if (!entity_id || !doctor_id || !hospital_id || !product_id) return [];
  const filter = {
    entity_id,
    doctor_id,
    hospital_id,
    product_id,
    ...effectiveDatingClause(asOfDate),
  };
  return MdProductRebate.find(filter).sort({ createdAt: -1 }).lean();
}

/**
 * matchNonMdPartnerRebateRule — Phase R1 single-match (back-compat).
 *
 * Returns the most-recently-created active rule row for
 * (entity, partner, hospital). Phase R1 dropped customer_id / product_code /
 * priority — match grain is purely (partner × hospital). For the
 * "multiple partners earn full %" semantics that the Collection bridge
 * needs, call `matchAllNonMdPartnerRebateRules` instead.
 *
 * @param {Object} opts
 * @param {ObjectId|string} opts.entity_id
 * @param {ObjectId|string} opts.partner_id
 * @param {ObjectId|string} opts.hospital_id  REQUIRED in Phase R1
 * @param {Date} [opts.asOfDate]
 * @returns {Promise<NonMdPartnerRebateRule|null>}
 */
async function matchNonMdPartnerRebateRule({
  entity_id,
  partner_id,
  hospital_id,
  asOfDate,
} = {}) {
  if (!entity_id || !partner_id || !hospital_id) return null;
  return NonMdPartnerRebateRule.findOne({
    entity_id,
    partner_id,
    hospital_id,
    ...effectiveDatingClause(asOfDate),
  })
    .sort({ createdAt: -1 })
    .lean();
}

/**
 * matchAllNonMdPartnerRebateRules — Phase R1 multi-match.
 *
 * Returns ALL active rules for (entity, partner, hospital). Used by the
 * Collection bridge so that when multiple non-MD partners (or multiple
 * effective-dated rules for one partner) exist at the same hospital, each
 * earns full % independently per its own calculation_mode.
 *
 * @returns {Promise<NonMdPartnerRebateRule[]>}
 */
async function matchAllNonMdPartnerRebateRules({
  entity_id,
  partner_id,
  hospital_id,
  asOfDate,
} = {}) {
  if (!entity_id || !partner_id || !hospital_id) return [];
  return NonMdPartnerRebateRule.find({
    entity_id,
    partner_id,
    hospital_id,
    ...effectiveDatingClause(asOfDate),
  })
    .sort({ createdAt: -1 })
    .lean();
}

/**
 * matchStaffCommissionRule — picks the most-specific active rule for
 * (entity, payee_role, optional payee_id, territory, product, customer,
 * hospital, amount).
 *
 * Specificity (each adds +1 when matched):
 *   payee_id, territory_id, product_code, customer_code, hospital_id
 *
 * Amount band: rule must have min_amount <= amount AND
 * (max_amount == null OR amount < max_amount). Amount is treated as
 * 0 if not provided (so unbounded rules still match).
 *
 * Ties broken by priority asc, then createdAt desc.
 *
 * @param {Object} opts
 * @param {ObjectId|string} opts.entity_id
 * @param {string} opts.payee_role  ('BDM' | 'ECOMM_REP' | 'AREA_BDM')
 * @param {ObjectId|string} [opts.payee_id]
 * @param {ObjectId|string} [opts.territory_id]
 * @param {string} [opts.product_code]
 * @param {string} [opts.customer_code]
 * @param {ObjectId|string} [opts.hospital_id]
 * @param {number} [opts.amount]
 * @param {Date} [opts.asOfDate]
 * @returns {Promise<StaffCommissionRule|null>}
 */
async function matchStaffCommissionRule({
  entity_id,
  payee_role,
  payee_id,
  territory_id,
  product_code,
  customer_code,
  hospital_id,
  amount,
  asOfDate,
} = {}) {
  if (!entity_id || !payee_role) return null;
  const candidates = await StaffCommissionRule.find({
    entity_id,
    payee_role,
    ...effectiveDatingClause(asOfDate),
  }).lean();
  if (!candidates.length) return null;

  const amt = Number(amount || 0);
  const scored = [];
  for (const c of candidates) {
    let score = 0;
    let dq = false;

    // payee_id: if rule sets one, it MUST match.
    if (c.payee_id) {
      if (!payee_id || String(c.payee_id) !== String(payee_id)) dq = true;
      else score += 1;
    }
    if (!dq && c.territory_id) {
      if (!territory_id || String(c.territory_id) !== String(territory_id)) dq = true;
      else score += 1;
    }
    if (!dq && c.product_code) {
      if (!product_code || c.product_code !== product_code) dq = true;
      else score += 1;
    }
    if (!dq && c.customer_code) {
      if (!customer_code || c.customer_code !== customer_code) dq = true;
      else score += 1;
    }
    if (!dq && c.hospital_id) {
      if (!hospital_id || String(c.hospital_id) !== String(hospital_id)) dq = true;
      else score += 1;
    }
    // Amount-band filter — band membership doesn't add specificity (every rule
    // has implicit min=0, max=null), it's strictly a filter.
    if (!dq) {
      const minA = Number(c.min_amount || 0);
      const maxA = c.max_amount == null ? Infinity : Number(c.max_amount);
      if (amt < minA || amt >= maxA) dq = true;
    }

    if (!dq) scored.push({ score, rule: c });
  }
  if (!scored.length) return null;

  scored.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if ((a.rule.priority || 100) !== (b.rule.priority || 100)) {
      return (a.rule.priority || 100) - (b.rule.priority || 100);
    }
    return new Date(b.rule.createdAt) - new Date(a.rule.createdAt);
  });
  return scored[0].rule;
}

/**
 * getActiveTierAProductIds — returns the set of product_ids that have any
 * active MdProductRebate row for the given (entity, doctor [, hospital])
 * at asOfDate.
 *
 * Phase R1 (Apr 29 2026): hospital_id is now an OPTIONAL filter. When
 * supplied, only rules pinned to that hospital count — this is the
 * Collection bridge's needed semantics: a CSI for hospital A only excludes
 * products with active Tier-A rules pinned to hospital A. When omitted
 * (back-compat for older callers like the MdCapitationRule sync job), every
 * hospital's rules contribute.
 *
 * @param {Object} opts
 * @param {ObjectId|string} opts.entity_id
 * @param {ObjectId|string} opts.doctor_id
 * @param {ObjectId|string} [opts.hospital_id]  Phase R1 — optional filter
 * @param {Date} [opts.asOfDate]
 * @returns {Promise<ObjectId[]>}
 */
async function getActiveTierAProductIds({
  entity_id,
  doctor_id,
  hospital_id,
  asOfDate,
} = {}) {
  if (!entity_id || !doctor_id) return [];
  const filter = {
    entity_id,
    doctor_id,
    ...effectiveDatingClause(asOfDate),
  };
  if (hospital_id) filter.hospital_id = hospital_id;
  const rows = await MdProductRebate.find(filter).select('product_id').lean();
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const key = String(r.product_id);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(r.product_id);
    }
  }
  return out;
}

module.exports = {
  effectiveDatingClause,
  matchMdProductRebate,
  matchAllMdProductRebates,
  matchNonMdPartnerRebateRule,
  matchAllNonMdPartnerRebateRules,
  matchStaffCommissionRule,
  getActiveTierAProductIds,
};
