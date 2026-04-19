const mongoose = require('mongoose');

/**
 * SalesGoalPlan — Annual sales goal & plan of action container.
 * Created by president/admin per fiscal year per entity.
 * Holds growth drivers, KPI definitions, and incentive programs.
 * All driver/KPI codes reference Lookup categories (GROWTH_DRIVER, KPI_CODE).
 */

const kpiDefinitionSchema = new mongoose.Schema({
  kpi_code:     { type: String, required: true },  // From Lookup KPI_CODE
  kpi_label:    { type: String, default: '' },
  target_value: { type: Number, default: 0 },
  unit:         { type: String, default: '' },      // %, count, days, PHP, ratio
  direction:    { type: String, enum: ['higher_better', 'lower_better'], default: 'higher_better' },
  computation:  { type: String, enum: ['auto', 'manual'], default: 'auto' },
  source_model: { type: String, default: '' },      // Hospital, SalesLine, InventoryLedger, etc.
}, { _id: false });

const growthDriverSchema = new mongoose.Schema({
  driver_code:       { type: String, required: true },  // From Lookup GROWTH_DRIVER
  driver_label:      { type: String, default: '' },
  revenue_target_min: { type: Number, default: 0 },
  revenue_target_max: { type: Number, default: 0 },
  description:       { type: String, default: '' },
  sort_order:        { type: Number, default: 0 },
  kpi_definitions:   [kpiDefinitionSchema],
}, { _id: false });

const incentiveProgramSchema = new mongoose.Schema({
  program_code:        { type: String, required: true },  // From Lookup INCENTIVE_PROGRAM
  program_name:        { type: String, default: '' },
  description:         { type: String, default: '' },
  qualification_metric: { type: String, enum: ['sales', 'collections', 'composite'], default: 'sales' },
  use_tiers:           { type: Boolean, default: true },  // Use INCENTIVE_TIER Lookup for tiered rewards
}, { _id: false });

const salesGoalPlanSchema = new mongoose.Schema({
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
  status: {
    type: String,
    // Phase SG-3R — `REVERSED` is a terminal state produced by the President-
    // Reverse flow (documentReversalService.reverseSalesGoalPlan). Distinct
    // from `CLOSED` (normal lifecycle end): REVERSED always has a
    // `deletion_event_id` + a cascade of reversed IncentivePayout/JE records.
    enum: ['DRAFT', 'ACTIVE', 'CLOSED', 'REJECTED', 'REVERSED'],
    default: 'DRAFT',
  },

  // Rejection (Phase G6)
  rejection_reason: { type: String, trim: true, default: '' },
  rejected_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejected_at: { type: Date },

  // Company-wide targets
  baseline_revenue: { type: Number, default: 0 },  // Previous year actual (e.g., PHP 25M)
  target_revenue:   { type: Number, default: 0 },   // This year target (e.g., PHP 35M)
  collection_target_pct: { type: Number, default: 0.70 },  // 70% default

  // Growth drivers (flexible array — not hardcoded to 5)
  growth_drivers: [growthDriverSchema],

  // Incentive programs attached to this plan
  incentive_programs: [incentiveProgramSchema],

  // Reference number — populated on first activation via generateSalesGoalNumber().
  // Format: SG-{ENTITY_SHORT}{YYMM}-{NNN}. Persistent across reopen/close so the
  // plan keeps one audit identifier for its whole lifecycle.
  reference: { type: String, trim: true, default: '' },

  // Approval
  approved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approved_at: { type: Date },
  reopened_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reopened_at: { type: Date },
  closed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  closed_at: { type: Date },

  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // Phase SG-3R — President-Reverse cascade marker. Set when status → REVERSED.
  // Lets the Reversal Console show "already reversed" and prevents re-entry.
  deletion_event_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TransactionEvent' },
}, {
  timestamps: true,
  collection: 'erp_sales_goal_plans',
});

salesGoalPlanSchema.index({ entity_id: 1, reference: 1 });

// One plan per entity per fiscal year
salesGoalPlanSchema.index({ entity_id: 1, fiscal_year: 1 }, { unique: true });
salesGoalPlanSchema.index({ status: 1 });

module.exports = mongoose.model('SalesGoalPlan', salesGoalPlanSchema);
