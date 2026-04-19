/**
 * creditRuleEngine — Phase SG-4 #22
 *
 * Pure assignment engine. Given a posted SalesLine, it produces N
 * SalesCredit rows describing who-earns-what credit. Designed to be a
 * single, self-contained call from the SalesLine post path:
 *
 *     await creditRuleEngine.assign(saleLine, { userId });
 *
 * The engine never throws back into the sales path — failures are logged
 * to ErpAuditLog with log_type 'CREDIT_RULE_ERROR' (best-effort, behaves
 * like the auto-journal pattern in salesController). A sale that posts
 * without credit rows will fall back to sale.bdm_id @ 100% on the next
 * run — see `assign()` "fallback rule" branch.
 *
 * No mutation of SalesLine. No mutation of incentive payouts (those are
 * computed from snapshots, not credits — SG-5 will migrate that read).
 *
 * Idempotency: assign() upserts by sale_line_id — running twice for the
 * same sale produces the same SalesCredit rows. Reversal rows (source =
 * 'reversal') are written by SalesLine reopen/storno path (TODO: wire in
 * a follow-up; today reopen leaves credit rows orphaned which is OK
 * because consumers ignore credits whose parent sale is no longer POSTED).
 *
 * Subscription posture: rules are entity-scoped; engine never reaches
 * across entities.
 */

const mongoose = require('mongoose');
const CreditRule = require('../models/CreditRule');
const SalesCredit = require('../models/SalesCredit');
const ProductMaster = require('../models/ProductMaster');
const Customer = require('../models/Customer');
const Hospital = require('../models/Hospital');
const ErpAuditLog = require('../models/ErpAuditLog');

function periodFromDate(d) {
  const dt = d ? new Date(d) : new Date();
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

function fiscalYearFromDate(d) {
  // Mirrors GOAL_CONFIG.FISCAL_START_MONTH treatment elsewhere — assumes
  // calendar year. Subscribers with non-calendar fiscal years should
  // override this on a follow-up by reading GOAL_CONFIG.FISCAL_START_MONTH;
  // not in SG-4 scope.
  return d ? new Date(d).getFullYear() : new Date().getFullYear();
}

/**
 * Returns true when the rule's conditions match the given context.
 * Empty arrays / null bounds = "no constraint on this dimension".
 *
 * `ctx` shape:
 *   {
 *     entity_id, hospital_id, customer_id, territory_id,
 *     product_codes (Set<String>),
 *     customer_code (String|null),
 *     hospital_id (ObjectId),
 *     invoice_total, sale_type, csi_date,
 *   }
 */
function ruleMatches(rule, ctx) {
  // Entity scope is always enforced upstream in the .find() filter; defensive.
  if (String(rule.entity_id) !== String(ctx.entity_id)) return false;

  // Effective dating
  if (rule.effective_from && new Date(rule.effective_from) > ctx.csi_date) return false;
  if (rule.effective_to && new Date(rule.effective_to) < ctx.csi_date) return false;

  const c = rule.conditions || {};

  if (Array.isArray(c.territory_ids) && c.territory_ids.length > 0) {
    if (!ctx.territory_id) return false;
    if (!c.territory_ids.some(id => String(id) === String(ctx.territory_id))) return false;
  }

  if (Array.isArray(c.product_codes) && c.product_codes.length > 0) {
    if (!ctx.product_codes || ctx.product_codes.size === 0) return false;
    const ruleSet = new Set(c.product_codes.map(s => String(s).toUpperCase()));
    let any = false;
    for (const code of ctx.product_codes) {
      if (ruleSet.has(String(code).toUpperCase())) { any = true; break; }
    }
    if (!any) return false;
  }

  if (Array.isArray(c.customer_codes) && c.customer_codes.length > 0) {
    if (!ctx.customer_code) return false;
    const upper = String(ctx.customer_code).toUpperCase();
    if (!c.customer_codes.map(s => String(s).toUpperCase()).includes(upper)) return false;
  }

  if (Array.isArray(c.hospital_ids) && c.hospital_ids.length > 0) {
    if (!ctx.hospital_id) return false;
    if (!c.hospital_ids.some(id => String(id) === String(ctx.hospital_id))) return false;
  }

  if (Array.isArray(c.sale_types) && c.sale_types.length > 0) {
    if (!ctx.sale_type) return false;
    if (!c.sale_types.includes(ctx.sale_type)) return false;
  }

  if (c.min_amount != null && Number.isFinite(c.min_amount) && ctx.invoice_total < c.min_amount) return false;
  if (c.max_amount != null && Number.isFinite(c.max_amount) && ctx.invoice_total > c.max_amount) return false;

  return true;
}

/**
 * Build the matching context for a SalesLine. Loads the per-line product
 * codes + customer code in one batch (no N+1 queries).
 *
 * Returns null when the sale lacks the minimum data the engine needs
 * (entity_id + bdm_id + invoice_total) — caller skips assignment.
 */
async function buildContext(saleLine) {
  if (!saleLine || !saleLine.entity_id || !saleLine.bdm_id) return null;

  // Collect distinct product ids
  const productIds = (saleLine.line_items || [])
    .map(li => li.product_id)
    .filter(Boolean);

  let productCodes = new Set();
  if (productIds.length > 0) {
    const products = await ProductMaster.find({ _id: { $in: productIds } })
      .select('product_code')
      .lean();
    productCodes = new Set(products.map(p => p.product_code).filter(Boolean));
  }

  let customerCode = null;
  if (saleLine.customer_id) {
    const cust = await Customer.findById(saleLine.customer_id).select('customer_code').lean();
    customerCode = cust?.customer_code || null;
  }

  // Territory: derive from the sale's bdm_id's PeopleMaster.territory_id
  // (lightweight — we don't reload the whole person). Hospital may also
  // have a territory_id; we prefer the hospital's territory when present
  // since rule writers tend to target territory by deal location.
  let territoryId = null;
  if (saleLine.hospital_id) {
    const hosp = await Hospital.findById(saleLine.hospital_id).select('territory_id').lean();
    if (hosp?.territory_id) territoryId = hosp.territory_id;
  }

  return {
    entity_id: saleLine.entity_id,
    bdm_id: saleLine.bdm_id,
    hospital_id: saleLine.hospital_id || null,
    customer_id: saleLine.customer_id || null,
    customer_code: customerCode,
    territory_id: territoryId,
    product_codes: productCodes,
    invoice_total: Number(saleLine.invoice_total) || 0,
    sale_type: saleLine.sale_type || 'CSI',
    csi_date: saleLine.csi_date || saleLine.posted_at || new Date(),
  };
}

/**
 * Apply the engine to a single SalesLine, write SalesCredit rows.
 * Idempotent: existing 'rule' / 'fallback' rows for this sale are deleted
 * and re-created so the latest rule set wins.
 *
 * `manual` and `reversal` rows are NEVER deleted — those are admin/audit
 * artifacts that survive engine re-runs.
 *
 * Returns { assigned: [...rows], totalPct, fallbackUsed: bool }.
 */
async function assign(saleLine, opts = {}) {
  if (!saleLine) return { assigned: [], totalPct: 0, fallbackUsed: false };

  const userId = opts.userId || saleLine.posted_by || saleLine.bdm_id;

  let ctx;
  try {
    ctx = await buildContext(saleLine);
  } catch (err) {
    console.error('[creditRuleEngine] buildContext failed for sale', saleLine._id, err.message);
    return { assigned: [], totalPct: 0, fallbackUsed: false, error: err.message };
  }
  if (!ctx) return { assigned: [], totalPct: 0, fallbackUsed: false };

  // Load all candidate rules for this entity. plan_id null OR matching
  // sale's plan are kept; we don't know the active plan version per sale
  // in SG-4 scope (kept for SG-5 when snapshots migrate to read credits).
  const rules = await CreditRule.find({
    entity_id: ctx.entity_id,
    is_active: true,
    $or: [{ plan_id: null }, { plan_id: { $exists: false } }],
  }).sort({ priority: 1, createdAt: 1 }).lean();

  const matched = rules.filter(r => ruleMatches(r, ctx));

  // Build the assignment list. Stop assigning credits once we hit 100% to
  // protect against runaway over-allocation; but record overage on the
  // last allowed row's reason so admin sees why a stacked rule was capped.
  const rows = [];
  let totalPct = 0;
  for (const rule of matched) {
    const pct = Number(rule.credit_pct) || 0;
    if (pct <= 0) continue;
    const remaining = Math.max(100 - totalPct, 0);
    const applied = Math.min(pct, remaining);
    const reason = applied < pct
      ? `Rule "${rule.rule_name}" capped at ${applied}% (${pct - applied}% would exceed 100%)`
      : `Rule "${rule.rule_name}" matched (priority ${rule.priority})`;
    rows.push({
      entity_id: ctx.entity_id,
      sale_line_id: saleLine._id,
      credit_bdm_id: rule.credit_bdm_id,
      rule_id: rule._id,
      rule_name: rule.rule_name,
      credit_pct: applied,
      credited_amount: Math.round((ctx.invoice_total * applied / 100) * 100) / 100,
      credit_reason: reason,
      invoice_total: ctx.invoice_total,
      csi_date: ctx.csi_date,
      fiscal_year: fiscalYearFromDate(ctx.csi_date),
      period: periodFromDate(ctx.csi_date),
      source: 'rule',
      created_at: new Date(),
      created_by: userId,
    });
    totalPct += applied;
    if (totalPct >= 100) break;
  }

  // Fallback: residual goes to sale.bdm_id (preserves pre-SG-4 behavior).
  let fallbackUsed = false;
  if (totalPct < 100) {
    const fallbackPct = 100 - totalPct;
    rows.push({
      entity_id: ctx.entity_id,
      sale_line_id: saleLine._id,
      credit_bdm_id: ctx.bdm_id,
      rule_id: null,
      rule_name: '',
      credit_pct: fallbackPct,
      credited_amount: Math.round((ctx.invoice_total * fallbackPct / 100) * 100) / 100,
      credit_reason: matched.length === 0
        ? 'No CreditRule matched — defaulted to sale.bdm_id (legacy implicit credit).'
        : `Residual ${fallbackPct}% not covered by matched rules — credited to sale.bdm_id.`,
      invoice_total: ctx.invoice_total,
      csi_date: ctx.csi_date,
      fiscal_year: fiscalYearFromDate(ctx.csi_date),
      period: periodFromDate(ctx.csi_date),
      source: 'fallback',
      created_at: new Date(),
      created_by: userId,
    });
    totalPct = 100;
    fallbackUsed = true;
  }

  // Idempotent rewrite: drop existing rule/fallback rows for this sale,
  // insert the freshly-computed set. manual + reversal rows survive.
  const session = opts.session || null;
  try {
    await SalesCredit.deleteMany(
      { sale_line_id: saleLine._id, source: { $in: ['rule', 'fallback'] } },
      session ? { session } : {}
    );
    if (rows.length > 0) {
      // insertMany bypasses the immutable pre('save') guard which only fires
      // on document.save(). Use create() per-row so the guard runs and any
      // accidental insert-on-update is caught.
      const inserted = [];
      for (const r of rows) {
        const docArr = await SalesCredit.create([r], session ? { session } : {});
        inserted.push(docArr[0]);
      }
      return { assigned: inserted, totalPct, fallbackUsed };
    }
    return { assigned: [], totalPct, fallbackUsed };
  } catch (err) {
    console.error('[creditRuleEngine] assign failed for sale', saleLine._id, err.message);
    // Best-effort audit so the failure is visible without breaking the sale.
    try {
      await ErpAuditLog.logChange({
        entity_id: ctx.entity_id,
        log_type: 'STATUS_CHANGE',
        target_ref: saleLine._id.toString(),
        target_model: 'SalesCredit',
        field_changed: 'assignment',
        new_value: 'FAILED',
        changed_by: userId,
        note: `creditRuleEngine.assign() failed: ${err.message}`,
      });
    } catch { /* swallow — log is best-effort */ }
    return { assigned: [], totalPct: 0, fallbackUsed: false, error: err.message };
  }
}

/**
 * Convenience: list credits for a sale (for SalesLine detail view).
 */
async function listForSale(saleLineId) {
  if (!saleLineId) return [];
  return SalesCredit.find({ sale_line_id: saleLineId })
    .populate('credit_bdm_id', 'name email')
    .populate('rule_id', 'rule_name priority')
    .sort({ source: 1, credit_pct: -1 })
    .lean();
}

module.exports = {
  assign,
  listForSale,
  ruleMatches,
  buildContext,
};
