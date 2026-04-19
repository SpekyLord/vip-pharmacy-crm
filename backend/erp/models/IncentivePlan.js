const mongoose = require('mongoose');

/**
 * IncentivePlan — Phase SG-4 (#21, plan versioning header)
 *
 * SuiteCommissions-pattern header that owns the *logical* plan for an
 * entity + fiscal year. Each SalesGoalPlan row is a *version* of this header:
 *   IncentivePlan (header)  1 ─── N  SalesGoalPlan (version 1, 2, 3 …)
 *
 * Why split: mid-year revisions (rate changes, scope changes, new growth
 * drivers) used to require reopening the only plan or starting from scratch.
 * Either path corrupts historical KpiSnapshot/IncentivePayout rows tied to
 * the original plan_id. With versioning, snapshots stay tied to the version
 * that was active at computation time; new compute runs target the new
 * version. Audit trail, payout trail, and accruals all remain truthful.
 *
 * Backward-compat rules (all enforced lazily so no migration is *required*
 * for the API to function):
 *   - Existing SalesGoalPlan rows without `incentive_plan_id` are treated
 *     as version 1 of an implicit header.
 *   - `incentivePlanService.ensureHeader(plan)` upserts the header on first
 *     read/write — idempotent, safe to call repeatedly.
 *   - `current_version_id` is updated only when a version transitions to
 *     ACTIVE (or gets superseded by a newer ACTIVE version). Header itself
 *     never changes status independently — its status mirrors whichever
 *     version is "current".
 *
 * Subscription posture: header is `entity_id`-scoped. New subsidiaries
 * onboard with zero rows; first plan creation auto-creates their header.
 */
const incentivePlanSchema = new mongoose.Schema({
  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: [true, 'Entity is required'],
  },
  fiscal_year: {
    type: Number,
    required: [true, 'Fiscal year is required'],
  },
  plan_name: {
    type: String,
    required: [true, 'Plan name is required'],
    trim: true,
  },
  description: { type: String, default: '' },

  // Mirror of the currently-active SalesGoalPlan version. Updated when a
  // version is activated or superseded. Reads can resolve "the active plan
  // right now" in one round-trip without scanning every version row.
  current_version_no: { type: Number, default: 1 },
  current_version_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SalesGoalPlan',
  },

  // Header-level status — mirrors the current version's status. Useful for
  // dashboards that want a plan-card view without joining version rows.
  // Never set independently; always follows the current version.
  status: {
    type: String,
    enum: ['DRAFT', 'ACTIVE', 'CLOSED', 'REJECTED', 'REVERSED'],
    default: 'DRAFT',
  },

  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true,
  collection: 'erp_incentive_plans',
});

// One header per (entity, fiscal_year). Versions are differentiated by
// `version_no` on SalesGoalPlan, not on the header.
incentivePlanSchema.index({ entity_id: 1, fiscal_year: 1 }, { unique: true });
incentivePlanSchema.index({ entity_id: 1, status: 1 });

module.exports = mongoose.model('IncentivePlan', incentivePlanSchema);
