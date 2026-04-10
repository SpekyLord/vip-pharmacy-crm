/**
 * KpiSelfRating Model — Phase 32
 *
 * Universal KPI self-rating & performance review.
 * Any person — regardless of function — can rate themselves on
 * function-specific KPIs + universal competencies, then go through
 * a structured self → manager → approval workflow.
 *
 * KPIs come from KPI_CODE lookup filtered by functional_roles matching
 * the person's FunctionalRoleAssignment(s). Competencies come from
 * COMPETENCY lookup (apply to everyone).
 */

const mongoose = require('mongoose');

const kpiRatingItemSchema = new mongoose.Schema({
  kpi_code:        { type: String, required: true },
  kpi_label:       { type: String, required: true },
  unit:            { type: String, default: '' },
  direction:       { type: String, enum: ['higher_better', 'lower_better'], default: 'higher_better' },
  target_value:    { type: Number, default: null },
  actual_value:    { type: Number, default: null },
  self_score:      { type: Number, min: 1, max: 5, default: null },
  self_comment:    { type: String, default: '' },
  manager_score:   { type: Number, min: 1, max: 5, default: null },
  manager_comment: { type: String, default: '' },
}, { _id: false });

const competencyRatingItemSchema = new mongoose.Schema({
  competency_code:  { type: String, required: true },
  competency_label: { type: String, required: true },
  self_score:       { type: Number, min: 1, max: 5, default: null },
  self_comment:     { type: String, default: '' },
  manager_score:    { type: Number, min: 1, max: 5, default: null },
  manager_comment:  { type: String, default: '' },
}, { _id: false });

const kpiSelfRatingSchema = new mongoose.Schema({
  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: [true, 'Entity is required'],
    index: true,
  },

  person_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PeopleMaster',
    required: [true, 'Person is required'],
    index: true,
  },

  // Manager who will review (from PeopleMaster.reports_to)
  reviewer_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PeopleMaster',
    default: null,
  },

  fiscal_year: {
    type: Number,
    required: [true, 'Fiscal year is required'],
  },

  // Period identifier: "2026-Q1", "2026-04", "2026-H1", "2026"
  period: {
    type: String,
    required: [true, 'Period is required'],
    trim: true,
  },

  period_type: {
    type: String,
    enum: ['MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL'],
    required: [true, 'Period type is required'],
  },

  // ═══ KPI Self-Scores ═══
  kpi_ratings: [kpiRatingItemSchema],

  // ═══ Competency Ratings ═══
  competency_ratings: [competencyRatingItemSchema],

  // ═══ Overall ═══
  overall_self_score:      { type: Number, min: 1, max: 5, default: null },
  overall_self_comment:    { type: String, default: '' },
  overall_manager_score:   { type: Number, min: 1, max: 5, default: null },
  overall_manager_comment: { type: String, default: '' },

  // ═══ Workflow ═══
  status: {
    type: String,
    enum: ['DRAFT', 'SUBMITTED', 'REVIEWED', 'APPROVED', 'RETURNED'],
    default: 'DRAFT',
  },

  submitted_at: { type: Date, default: null },
  reviewed_at:  { type: Date, default: null },
  approved_at:  { type: Date, default: null },
  approved_by:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  return_reason: { type: String, default: '' },

  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true,
  collection: 'erp_kpi_self_ratings',
});

// ═══ Indexes ═══

// Uniqueness: one rating per person per period per type
kpiSelfRatingSchema.index(
  { entity_id: 1, person_id: 1, period: 1, period_type: 1 },
  { unique: true }
);

// Manager's pending reviews
kpiSelfRatingSchema.index({ reviewer_id: 1, status: 1 });

// Status queries within entity
kpiSelfRatingSchema.index({ entity_id: 1, status: 1 });

// Fiscal year + type for reporting
kpiSelfRatingSchema.index({ fiscal_year: 1, period_type: 1 });

module.exports = mongoose.model('KpiSelfRating', kpiSelfRatingSchema);
