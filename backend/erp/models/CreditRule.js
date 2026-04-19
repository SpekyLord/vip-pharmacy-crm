const mongoose = require('mongoose');

/**
 * CreditRule — Phase SG-4 #22 (SAP Commissions credit-rule pattern)
 *
 * One row = one rule that says "for sales matching THESE conditions, give
 * THIS BDM THIS percentage of credit." Replaces the implicit
 * `salesLine.bdm_id` → 100% credit assumption with an auditable, lookup-
 * driven engine. When no rule matches, the engine falls back to the legacy
 * behavior (sale_line.bdm_id @ 100%) so existing sales continue to credit
 * correctly without configuration.
 *
 * Conditions are AND-combined — a rule only matches when *every* listed
 * condition is satisfied. Conditions left empty mean "no constraint on this
 * dimension" (matches anything). At least one of territory_ids /
 * product_codes / customer_codes / hospital_ids should typically be set,
 * otherwise the rule matches every sale (use min/max_amount to scope by
 * invoice size).
 *
 * Priority: lower runs first. The engine evaluates rules in priority order
 * and assigns credit until total credit_pct hits 100%. Any residual is
 * given to sale_line.bdm_id as a fallback "primary BDM" credit. Sums above
 * 100 are allowed (manager override) but logged as a warning on
 * SalesCredit.credit_reason.
 *
 * Effective-dating mirrors plan versioning: effective_from / effective_to
 * gate which rules apply on a given sale's csi_date. Rules with no dates
 * apply forever.
 *
 * Subscription posture: entity-scoped (no cross-entity leak). Rules are
 * created/edited via CreditRuleManager.jsx (admin/finance/president). New
 * subsidiaries onboard with zero rules — fallback behavior preserves the
 * pre-SG-4 implicit credit assignment until the subscriber configures
 * their first rule.
 */
const creditRuleSchema = new mongoose.Schema({
  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: true,
    index: true,
  },
  // Optional: scope a rule to a specific plan version. Most subscribers
  // leave this null (rule applies regardless of plan version).
  plan_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SalesGoalPlan',
    default: null,
  },
  rule_name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  priority: { type: Number, default: 100, min: 0 },
  is_active: { type: Boolean, default: true },

  // Match conditions (AND-combined). Empty = no constraint on that dimension.
  conditions: {
    territory_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Territory' }],
    product_codes: [{ type: String, trim: true }],     // matches ProductMaster.product_code
    customer_codes: [{ type: String, trim: true }],    // matches Customer.customer_code
    hospital_ids:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' }],
    min_amount: { type: Number, default: null },       // >= invoice_total
    max_amount: { type: Number, default: null },       // <= invoice_total
    sale_types: [{ type: String, trim: true }],        // CSI / SERVICE_INVOICE / CASH_RECEIPT
  },

  // Credit assignment
  credit_bdm_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  credit_pct: {
    type: Number,
    default: 100,
    min: 0,
    max: 200,  // allow up to 200 for stacked rules; engine warns when > 100
  },

  effective_from: { type: Date, default: null },
  effective_to: { type: Date, default: null },

  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true,
  collection: 'erp_credit_rules',
});

// Engine reads rules ordered by (entity, plan, priority, createdAt). Index
// keeps the priority scan O(log N) instead of full collection scan per sale.
creditRuleSchema.index({ entity_id: 1, plan_id: 1, is_active: 1, priority: 1 });
creditRuleSchema.index({ entity_id: 1, credit_bdm_id: 1 });

module.exports = mongoose.model('CreditRule', creditRuleSchema);
