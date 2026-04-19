const mongoose = require('mongoose');

/**
 * KpiSnapshot — Monthly point-in-time KPI values per BDM.
 * Computed from existing ERP data (SalesLine, Collection, Hospital, etc.).
 * Similar to PartnerScorecard but focused on goal-driver KPIs and incentive tiers.
 */

const driverKpiValueSchema = new mongoose.Schema({
  kpi_code:       { type: String, required: true },
  kpi_label:      { type: String, default: '' },
  target_value:   { type: Number, default: 0 },
  actual_value:   { type: Number, default: 0 },
  attainment_pct: { type: Number, default: 0 },
  data_source:    { type: String, enum: ['auto', 'manual'], default: 'auto' },
}, { _id: false });

const driverKpiGroupSchema = new mongoose.Schema({
  driver_code: { type: String, required: true },
  kpis:        [driverKpiValueSchema],
}, { _id: false });

const incentiveStatusSchema = new mongoose.Schema({
  program_code:      { type: String, required: true },
  qualifying_amount: { type: Number, default: 0 },
  actual_amount:     { type: Number, default: 0 },
  attainment_pct:    { type: Number, default: 0 },
  tier_code:         { type: String, default: '' },      // Current tier from INCENTIVE_TIER Lookup
  tier_label:        { type: String, default: '' },
  tier_budget:       { type: Number, default: 0 },       // Accelerated budget (base * factor)
  // Phase SG-5 #25 — transparency fields so the ledger can show "₱150K base × 1.25 = ₱187.5K"
  tier_base_budget:          { type: Number, default: 0 }, // INCENTIVE_TIER.metadata.budget_per_bdm
  tier_accelerator_factor:   { type: Number, default: 1 }, // INCENTIVE_TIER.metadata.accelerator_factor
  projected_tier_code:  { type: String, default: '' },   // Projected tier at year-end pace
  projected_tier_label: { type: String, default: '' },
  projected_tier_budget: { type: Number, default: 0 },
  projected_tier_accelerator_factor: { type: Number, default: 1 },
  qualified:         { type: Boolean, default: false },
}, { _id: false });

const kpiSnapshotSchema = new mongoose.Schema({
  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: true,
  },
  plan_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SalesGoalPlan',
    required: true,
  },
  fiscal_year:  { type: Number, required: true },
  period:       { type: String, required: true },  // "2026-04" for monthly, "2026" for YTD
  period_type:  { type: String, enum: ['MONTHLY', 'YTD'], default: 'MONTHLY' },

  // BDM identification
  bdm_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  person_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PeopleMaster',
  },
  territory_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Territory',
  },

  // Aggregated financials
  sales_actual:       { type: Number, default: 0 },
  collections_actual: { type: Number, default: 0 },
  collection_rate_pct: { type: Number, default: 0 },

  // Goal attainment (target copied at snapshot time for immutability)
  sales_target:             { type: Number, default: 0 },
  sales_attainment_pct:     { type: Number, default: 0 },
  collection_target:        { type: Number, default: 0 },
  collection_attainment_pct: { type: Number, default: 0 },

  // Per-driver KPI values
  driver_kpis: [driverKpiGroupSchema],

  // Incentive tier status
  incentive_status: [incentiveStatusSchema],

  // Action items summary
  actions_total:     { type: Number, default: 0 },
  actions_completed: { type: Number, default: 0 },

  computed_at: { type: Date, default: Date.now },
  computed_by: { type: String, enum: ['system', 'manual'], default: 'system' },
}, {
  timestamps: true,
  collection: 'erp_kpi_snapshots',
});

// One snapshot per BDM per period per type
kpiSnapshotSchema.index(
  { entity_id: 1, plan_id: 1, bdm_id: 1, period: 1, period_type: 1 },
  { unique: true }
);
kpiSnapshotSchema.index({ entity_id: 1, fiscal_year: 1, period: 1 });
kpiSnapshotSchema.index({ bdm_id: 1, fiscal_year: 1, period: -1 });

module.exports = mongoose.model('KpiSnapshot', kpiSnapshotSchema);
