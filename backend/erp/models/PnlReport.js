/**
 * PnlReport Model — Territory P&L per BDM per month
 *
 * PRD §9-10: Revenue − COGS − Expenses = Net Income
 * Includes profit sharing eligibility gate per product.
 * One document per BDM per period (monthly).
 */
const mongoose = require('mongoose');

const psProductSchema = new mongoose.Schema({
  product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductMaster' },
  product_name: { type: String },
  hospital_count: { type: Number, default: 0 },    // Condition A
  md_count: { type: Number, default: 0 },           // Condition B
  consecutive_months: { type: Number, default: 0 },  // Condition C streak
  qualified: { type: Boolean, default: false },
  conditions_met: { type: Boolean, default: false }  // Phase 15.1: A+B met this month
}, { _id: false });

const pnlReportSchema = new mongoose.Schema({
  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: true
  },
  bdm_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  period: {
    type: String,
    required: [true, 'Period is required (e.g. 2026-04)'],
    match: [/^\d{4}-\d{2}$/, 'Period must be YYYY-MM format']
  },

  // ── Revenue ──
  revenue: {
    gross_sales: { type: Number, default: 0 },
    total_vat: { type: Number, default: 0 },
    net_sales: { type: Number, default: 0 },
    collections_net_of_vat: { type: Number, default: 0 }
  },

  // ── Cost of Goods Sold ──
  cogs: {
    total_cogs: { type: Number, default: 0 }
  },

  gross_profit: { type: Number, default: 0 },

  // ── Operating Expenses ──
  expenses: {
    smer_reimbursable: { type: Number, default: 0 },
    gasoline_less_personal: { type: Number, default: 0 },
    partners_insurance: { type: Number, default: 0 },
    access_total: { type: Number, default: 0 },
    ore_total: { type: Number, default: 0 },
    sampling_dr_cost: { type: Number, default: 0 },
    depreciation: { type: Number, default: 0 },          // manual — Finance sets
    loan_amortization: { type: Number, default: 0 }       // manual — Finance sets
  },
  total_expenses: { type: Number, default: 0 },

  // ── Bottom Line ──
  net_income: { type: Number, default: 0 },

  // ── Profit Sharing Gate ──
  profit_sharing: {
    eligible: { type: Boolean, default: false },
    bdm_share: { type: Number, default: 0 },
    vip_share: { type: Number, default: 0 },
    ps_products: [psProductSchema],
    deficit_flag: { type: Boolean, default: false }
  },

  // ── Status ──
  status: {
    type: String,
    enum: ['DRAFT', 'GENERATED', 'REVIEWED', 'POSTED', 'LOCKED'],
    default: 'DRAFT'
  },
  generated_at: { type: Date },
  posted_at: { type: Date },
  posted_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  locked: { type: Boolean, default: false },

  // ── Audit ──
  event_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TransactionEvent' },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  created_at: { type: Date, default: Date.now, immutable: true }
}, {
  timestamps: true,
  collection: 'erp_pnl_reports'
});

// ── Pre-save: compute derived totals ──
pnlReportSchema.pre('save', function (next) {
  const rev = this.revenue || {};
  rev.net_sales = Math.round(((rev.gross_sales || 0) - (rev.total_vat || 0)) * 100) / 100;
  this.revenue = rev;

  this.gross_profit = Math.round(((rev.collections_net_of_vat || 0) - (this.cogs?.total_cogs || 0)) * 100) / 100;

  const exp = this.expenses || {};
  this.total_expenses = Math.round(
    ((exp.smer_reimbursable || 0) + (exp.gasoline_less_personal || 0) +
     (exp.partners_insurance || 0) + (exp.access_total || 0) + (exp.ore_total || 0) +
     (exp.sampling_dr_cost || 0) + (exp.depreciation || 0) + (exp.loan_amortization || 0)) * 100
  ) / 100;

  this.net_income = Math.round((this.gross_profit - this.total_expenses) * 100) / 100;
  next();
});

// ── Indexes ──
pnlReportSchema.index({ entity_id: 1, bdm_id: 1, period: 1 }, { unique: true });
pnlReportSchema.index({ entity_id: 1, period: 1, status: 1 });
pnlReportSchema.index({ bdm_id: 1, period: 1 });

module.exports = mongoose.model('PnlReport', pnlReportSchema);
