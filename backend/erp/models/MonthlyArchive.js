/**
 * MonthlyArchive Model — Period Snapshots + Fiscal Year Close
 *
 * Dual purpose:
 * (a) MONTHLY: snapshot of period data at close time (close/restore)
 * (b) FISCAL_YEAR: year-end close record (data capture for Phase 11 journals)
 *
 * PRD §14.2: Year-end close + retained earnings
 * PRD §13: Snapshot close / restore, period open/closed control
 */
const mongoose = require('mongoose');

const bdmSummarySchema = new mongoose.Schema({
  bdm_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  sales: { type: Number, default: 0 },
  collections: { type: Number, default: 0 },
  cogs: { type: Number, default: 0 },
  expenses: { type: Number, default: 0 },
  net_income: { type: Number, default: 0 },
  commission: { type: Number, default: 0 },
  profit_sharing: { type: Number, default: 0 }
}, { _id: false });

const bdmYearSummarySchema = new mongoose.Schema({
  bdm_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  total_revenue: { type: Number, default: 0 },
  total_expenses: { type: Number, default: 0 },
  net_income: { type: Number, default: 0 }
}, { _id: false });

const monthlyArchiveSchema = new mongoose.Schema({
  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: true
  },
  period: {
    type: String,
    required: [true, 'Period is required (e.g. 2026-04 or FY-2025)']
  },
  record_type: {
    type: String,
    enum: ['MONTHLY', 'FISCAL_YEAR'],
    required: true
  },

  // ── Monthly Snapshot (record_type = MONTHLY) ──
  period_status: {
    type: String,
    enum: ['OPEN', 'CLOSED', 'LOCKED'],
    default: 'OPEN'
  },
  closed_at: { type: Date },
  closed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  snapshot: {
    total_sales: { type: Number, default: 0 },
    total_collections: { type: Number, default: 0 },
    total_cogs: { type: Number, default: 0 },
    total_expenses: { type: Number, default: 0 },
    total_net_income: { type: Number, default: 0 },
    bdm_summaries: [bdmSummarySchema]
  },

  // ── Fiscal Year Close (record_type = FISCAL_YEAR) ──
  fiscal_year: { type: Number },
  fy_status: {
    type: String,
    enum: ['OPEN', 'CLOSING', 'CLOSED'],
    default: 'OPEN'
  },

  year_end_data: {
    total_revenue: { type: Number, default: 0 },
    total_expenses: { type: Number, default: 0 },
    net_income: { type: Number, default: 0 },
    retained_earnings_transfer: { type: Number, default: 0 },
    closing_entries_pending: { type: Boolean, default: true },    // Phase 11 sets false
    periods_included: [{ type: String }],
    bdm_year_summaries: [bdmYearSummarySchema]
  },

  fy_closed_at: { type: Date },
  fy_closed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // ── Phase 11: Month-End Close Progress ──
  close_progress: [{
    step: { type: Number },
    name: { type: String },
    phase: { type: Number },
    status: { type: String, enum: ['PENDING', 'RUNNING', 'COMPLETE', 'ERROR'], default: 'PENDING' },
    started_at: { type: Date },
    completed_at: { type: Date },
    error: { type: String }
  }],
  trial_balance_snapshot: { type: mongoose.Schema.Types.Mixed },
  pnl_snapshot: { type: mongoose.Schema.Types.Mixed },

  // ── Audit ──
  notes: { type: String },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  created_at: { type: Date, default: Date.now, immutable: true }
}, {
  timestamps: true,
  collection: 'erp_monthly_archives'
});

// ── Indexes ──
monthlyArchiveSchema.index({ entity_id: 1, period: 1, record_type: 1 }, { unique: true });
monthlyArchiveSchema.index({ entity_id: 1, fiscal_year: 1 }, { sparse: true });
monthlyArchiveSchema.index({ entity_id: 1, period_status: 1 });

module.exports = mongoose.model('MonthlyArchive', monthlyArchiveSchema);
