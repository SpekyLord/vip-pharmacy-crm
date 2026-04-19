const mongoose = require('mongoose');

/**
 * SalesGoalTarget — Target assignments at Entity, Territory, or BDM level.
 * President assigns targets that roll up: BDM → Territory → Entity → Plan.
 * System validates sums with warnings (over-allocation allowed for execution buffer).
 */

const monthlyTargetSchema = new mongoose.Schema({
  month:             { type: String, required: true },  // "2026-01"
  sales_target:      { type: Number, default: 0 },
  collection_target: { type: Number, default: 0 },
}, { _id: false });

const driverTargetSchema = new mongoose.Schema({
  driver_code:    { type: String, required: true },
  revenue_target: { type: Number, default: 0 },
}, { _id: false });

// Phase SG-6 #31 — Mid-period target revision history.
// Each entry snapshots the PRE-revision values so downstream snapshots can
// re-compute from the revision point forward without losing the baseline.
// Keeping the history as a sub-document (not a separate collection) avoids
// cross-collection joins on dashboard reads.
const targetRevisionSchema = new mongoose.Schema({
  revised_at:        { type: Date, default: Date.now },
  revised_by:        { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  revision_reason:   { type: String, trim: true, required: true },
  // Snapshot of the prior values BEFORE the revision took effect.
  prior_sales_target:      { type: Number, default: 0 },
  prior_collection_target: { type: Number, default: 0 },
  // Optional: snapshot territory + person_id if those changed (useful for
  // PeopleMaster-originated revisions — SG-6 #30 lifecycle hook writes these).
  prior_territory_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Territory' },
  prior_person_id:    { type: mongoose.Schema.Types.ObjectId, ref: 'PeopleMaster' },
  // Source — discriminates manual president revisions from auto lifecycle hooks.
  source: {
    type: String,
    enum: ['MANUAL', 'PEOPLE_LIFECYCLE', 'SYSTEM'],
    default: 'MANUAL',
  },
  approval_request_id: { type: mongoose.Schema.Types.ObjectId, ref: 'ApprovalRequest' },
}, { _id: true, timestamps: false });

const salesGoalTargetSchema = new mongoose.Schema({
  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: [true, 'Entity is required'],
  },
  plan_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SalesGoalPlan',
    required: [true, 'Plan is required'],
  },
  fiscal_year: { type: Number, required: true },

  // Target level
  target_type: {
    type: String,
    enum: ['ENTITY', 'TERRITORY', 'BDM'],
    required: [true, 'Target type is required'],
  },

  // For ENTITY targets — the entity this target is for
  target_entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    default: null,
  },

  // For BDM targets
  bdm_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  person_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PeopleMaster',
    default: null,
  },

  // For TERRITORY targets
  territory_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Territory',
    default: null,
  },

  // Display label (e.g., "VIP Bacolod (Mae Navarro)")
  target_label: { type: String, trim: true, default: '' },

  // Revenue targets
  sales_target:      { type: Number, default: 0 },
  collection_target: { type: Number, default: 0 },  // Auto: sales_target * plan.collection_target_pct

  // Optional breakdowns
  monthly_targets: [monthlyTargetSchema],
  driver_targets:  [driverTargetSchema],

  // Phase SG-6 #31 — Mid-period revision history (append-only).
  // Historical snapshots stay tied to the value that was active at compute
  // time — revisions only affect future snapshots (see salesGoalService).
  target_revisions: { type: [targetRevisionSchema], default: [] },

  status: {
    type: String,
    enum: ['DRAFT', 'ACTIVE', 'CLOSED'],
    default: 'DRAFT',
  },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true,
  collection: 'erp_sales_goal_targets',
});

// Unique BDM target per plan
salesGoalTargetSchema.index(
  { plan_id: 1, target_type: 1, bdm_id: 1 },
  { unique: true, partialFilterExpression: { target_type: 'BDM', bdm_id: { $type: 'objectId' } } }
);

// Unique entity target per plan
salesGoalTargetSchema.index(
  { plan_id: 1, target_type: 1, target_entity_id: 1 },
  { unique: true, partialFilterExpression: { target_type: 'ENTITY', target_entity_id: { $type: 'objectId' } } }
);

// Unique territory target per plan
salesGoalTargetSchema.index(
  { plan_id: 1, target_type: 1, territory_id: 1 },
  { unique: true, partialFilterExpression: { target_type: 'TERRITORY', territory_id: { $type: 'objectId' } } }
);

// Query indexes
salesGoalTargetSchema.index({ entity_id: 1, fiscal_year: 1, target_type: 1 });
salesGoalTargetSchema.index({ plan_id: 1, status: 1 });
salesGoalTargetSchema.index({ bdm_id: 1, fiscal_year: 1 });

module.exports = mongoose.model('SalesGoalTarget', salesGoalTargetSchema);
