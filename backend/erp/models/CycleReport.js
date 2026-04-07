/**
 * Cycle Report Model — Cycle Report Workflow (Phase 15.3)
 * GENERATED → REVIEWED → BDM_CONFIRMED → CREDITED
 */
const mongoose = require('mongoose');

const cycleReportSchema = new mongoose.Schema({
  entity_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', required: true },
  bdm_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  period: { type: String, required: true, trim: true },
  cycle: { type: String, enum: ['C1', 'C2', 'MONTHLY'], default: 'MONTHLY' },

  // Snapshot data
  sales_total: { type: Number, default: 0 },
  collections_total: { type: Number, default: 0 },
  expenses_total: { type: Number, default: 0 },
  commission_total: { type: Number, default: 0 },
  net_income: { type: Number, default: 0 },

  // Detailed breakdowns
  sales_breakdown: { type: mongoose.Schema.Types.Mixed },
  expense_breakdown: { type: mongoose.Schema.Types.Mixed },
  collection_breakdown: { type: mongoose.Schema.Types.Mixed },

  // Workflow status
  status: {
    type: String,
    enum: ['GENERATED', 'REVIEWED', 'BDM_CONFIRMED', 'CREDITED'],
    default: 'GENERATED'
  },

  // Workflow timestamps
  generated_at: { type: Date, default: Date.now },
  generated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  reviewed_at: Date,
  reviewed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  review_notes: { type: String, trim: true },

  bdm_confirmed_at: Date,
  bdm_confirmed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  bdm_notes: { type: String, trim: true },

  credited_at: Date,
  credited_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  credit_reference: { type: String, trim: true }
}, { timestamps: true, collection: 'erp_cycle_reports' });

cycleReportSchema.index({ entity_id: 1, bdm_id: 1, period: 1, cycle: 1 }, { unique: true });
cycleReportSchema.index({ entity_id: 1, status: 1 });
cycleReportSchema.index({ entity_id: 1, period: 1 });

module.exports = mongoose.model('CycleReport', cycleReportSchema);
