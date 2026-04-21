/**
 * IncomeReport Model — BDM Payslip per cycle
 *
 * PRD §10: BDM Income Computation (per cycle)
 * Earnings: SMER + CORE Commission + Bonus + Profit Sharing + Reimbursements
 * Deductions: Lookup-driven deduction_lines[] (BDM enters, Finance verifies)
 * Net Pay = Total Earnings − Total Deductions
 *
 * Workflow: GENERATED → REVIEWED → RETURNED → BDM_CONFIRMED → CREDITED
 *
 * Deduction lines workflow:
 *   BDM adds lines (status: PENDING) → Finance verifies/corrects/rejects each line
 *   CASH_ADVANCE lines auto-pulled from CALF balance
 */
const mongoose = require('mongoose');

// Phase G1.4 — converged onto the shared deduction-line sub-schema
// (backend/erp/models/schemas/deductionLine.js). The shared schema is a
// byte-identical superset of the Phase G1.2 inline shape, giving contractor
// IncomeReport and employee Payslip a single transparency contract. Extending
// auto_source semantics (e.g. a subscriber adding a new auto-injector) now
// only requires a service-layer change; no schema migration.
const deductionLineSchema = require('./schemas/deductionLine');

const incomeReportSchema = new mongoose.Schema({
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
  cycle: {
    type: String,
    required: [true, 'Cycle is required']
  }, // Lookup: CYCLE

  // ── Earnings ──
  earnings: {
    smer: { type: Number, default: 0 },              // total_reimbursable from SmerEntry
    core_commission: { type: Number, default: 0 },    // total_commission from Collections
    bonus: { type: Number, default: 0 },              // manual entry by Finance
    profit_sharing: { type: Number, default: 0 },     // from profitShareEngine (0 if not qualified)
    reimbursements: { type: Number, default: 0 },     // manual (other reimbursements)
    calf_reimbursement: { type: Number, default: 0 }  // negative CALF balance → company reimburses BDM
  },
  total_earnings: { type: Number, default: 0 },

  // ── Deduction Lines (lookup-driven, BDM enters, Finance verifies) ──
  deduction_lines: [deductionLineSchema],

  // ── Legacy flat deductions (preserved for backward compatibility) ──
  deductions: {
    cash_advance: { type: Number, default: 0 },       // CALF pending balance
    credit_card_payment: { type: Number, default: 0 },
    credit_payment: { type: Number, default: 0 },
    purchased_goods: { type: Number, default: 0 },
    other_deductions: { type: Number, default: 0 },
    over_payment: { type: Number, default: 0 }
  },
  total_deductions: { type: Number, default: 0 },

  net_pay: { type: Number, default: 0 },

  // ── Source References ──
  source_refs: {
    smer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'SmerEntry' },
    collection_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Collection' }],
    expense_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ExpenseEntry' }],
    pnl_report_id: { type: mongoose.Schema.Types.ObjectId, ref: 'PnlReport' }
  },

  // ── Workflow ──
  status: {
    type: String,
    enum: ['GENERATED', 'REVIEWED', 'RETURNED', 'BDM_CONFIRMED', 'CREDITED'],
    default: 'GENERATED'
  },
  generated_at: { type: Date },
  reviewed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewed_at: { type: Date },
  return_reason: { type: String },
  confirmed_at: { type: Date },
  credited_at: { type: Date },
  credited_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  notes: { type: String },

  // ── Audit ──
  event_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TransactionEvent' },
  // SAP Storno reversal — set when IncomeReport is reversed; original stays CREDITED for audit trail
  deletion_event_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TransactionEvent' },
  reopen_count: { type: Number, default: 0 },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  created_at: { type: Date, default: Date.now, immutable: true },
  edit_history: [{ type: mongoose.Schema.Types.Mixed }]
}, {
  timestamps: true,
  collection: 'erp_income_reports'
});

// ── Pre-save: compute totals ──
incomeReportSchema.pre('save', function (next) {
  const e = this.earnings || {};
  this.total_earnings = Math.round(
    ((e.smer || 0) + (e.core_commission || 0) + (e.calf_reimbursement || 0) +
     (e.bonus || 0) + (e.profit_sharing || 0) + (e.reimbursements || 0)) * 100
  ) / 100;

  // Deductions: prefer deduction_lines if any exist, otherwise fall back to legacy flat fields
  if (this.deduction_lines && this.deduction_lines.length > 0) {
    // Only sum non-REJECTED lines
    const activeLines = this.deduction_lines.filter(l => l.status !== 'REJECTED');
    this.total_deductions = Math.round(
      activeLines.reduce((sum, l) => sum + (l.amount || 0), 0) * 100
    ) / 100;
  } else {
    const d = this.deductions || {};
    this.total_deductions = Math.round(
      ((d.cash_advance || 0) + (d.credit_card_payment || 0) + (d.credit_payment || 0) +
       (d.purchased_goods || 0) + (d.other_deductions || 0) + (d.over_payment || 0)) * 100
    ) / 100;
  }

  this.net_pay = Math.round((this.total_earnings - this.total_deductions) * 100) / 100;
  next();
});

// ── Indexes ──
incomeReportSchema.index({ entity_id: 1, bdm_id: 1, period: 1, cycle: 1 }, { unique: true });
incomeReportSchema.index({ entity_id: 1, status: 1 });
incomeReportSchema.index({ bdm_id: 1, period: 1 });

module.exports = mongoose.model('IncomeReport', incomeReportSchema);
