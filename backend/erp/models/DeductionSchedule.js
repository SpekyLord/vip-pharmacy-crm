/**
 * DeductionSchedule Model — Recurring & Non-Recurring Deduction Plans
 *
 * Contractors (BDMs) create deduction schedules for:
 *   - Recurring: CC installment ₱9,000 → ₱990/month × 10 months
 *   - Non-recurring: Purchased goods ₱1,500 → single deduction next month
 *
 * Handles both via term_months: 1 = one-time, >1 = installment plan.
 * Installments[] pre-generated on create, auto-injected into IncomeReport on payslip generation.
 *
 * Workflow: PENDING_APPROVAL → ACTIVE → COMPLETED (or CANCELLED/REJECTED)
 * Pattern follows: LoanMaster.amortization_schedule[] + FixedAsset.depreciation_schedule[]
 */
const mongoose = require('mongoose');

// ── Period Arithmetic Helper ──
function incrementPeriod(period, n) {
  const [year, month] = period.split('-').map(Number);
  const totalMonths = year * 12 + (month - 1) + n;
  const newYear = Math.floor(totalMonths / 12);
  const newMonth = (totalMonths % 12) + 1;
  return `${newYear}-${String(newMonth).padStart(2, '0')}`;
}

// ── Installment Sub-Schema ──
const installmentSchema = new mongoose.Schema({
  period: {
    type: String,
    required: true,
    match: [/^\d{4}-\d{2}$/, 'Period must be YYYY-MM format']
  },
  installment_no: { type: Number, required: true, min: 1 },
  amount: { type: Number, required: true, min: 0 },
  status: {
    type: String,
    enum: ['PENDING', 'INJECTED', 'VERIFIED', 'POSTED', 'CANCELLED'],
    default: 'PENDING'
  },
  income_report_id: { type: mongoose.Schema.Types.ObjectId, ref: 'IncomeReport' },
  deduction_line_id: { type: mongoose.Schema.Types.ObjectId },
  verified_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  verified_at: { type: Date },
  note: { type: String, default: '' }
}, { _id: true });

// ── Main DeductionSchedule Schema ──
const deductionScheduleSchema = new mongoose.Schema({
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
  schedule_code: {
    type: String,
    required: true,
    trim: true
  },
  deduction_type: {
    type: String,
    required: true
  }, // Lookup: INCOME_DEDUCTION_TYPE
  deduction_label: {
    type: String,
    required: true
  },
  description: { type: String, default: '' },
  total_amount: {
    type: Number,
    required: true,
    min: [0.01, 'Total amount must be greater than zero']
  },
  term_months: {
    type: Number,
    required: true,
    min: [1, 'Term must be at least 1 month']
  },
  installment_amount: { type: Number, default: 0 },
  start_period: {
    type: String,
    required: true,
    match: [/^\d{4}-\d{2}$/, 'Start period must be YYYY-MM format']
  },
  remaining_balance: { type: Number, default: 0 },

  // ── Workflow ──
  status: {
    type: String,
    enum: ['PENDING_APPROVAL', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'REJECTED'],
    default: 'PENDING_APPROVAL'
  },
  approved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approved_at: { type: Date },
  reject_reason: { type: String, default: '' },

  installments: [installmentSchema],

  // ── Audit ──
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  created_at: { type: Date, default: Date.now, immutable: true },
  edit_history: [{ type: mongoose.Schema.Types.Mixed }]
}, {
  timestamps: true,
  collection: 'erp_deduction_schedules'
});

// ── Pre-save: generate installments on new + recompute balance ──
deductionScheduleSchema.pre('save', function (next) {
  // On NEW: compute installment_amount and generate installments[]
  if (this.isNew && this.installments.length === 0) {
    const baseAmount = Math.floor(this.total_amount / this.term_months * 100) / 100;
    const lastAmount = Math.round((this.total_amount - baseAmount * (this.term_months - 1)) * 100) / 100;

    this.installment_amount = baseAmount;

    for (let i = 0; i < this.term_months; i++) {
      this.installments.push({
        period: incrementPeriod(this.start_period, i),
        installment_no: i + 1,
        amount: i === this.term_months - 1 ? lastAmount : baseAmount,
        status: 'PENDING'
      });
    }

    this.remaining_balance = this.total_amount;
  }

  // On EVERY save: recompute remaining_balance
  if (this.installments.length > 0) {
    const deducted = this.installments
      .filter(i => ['INJECTED', 'VERIFIED', 'POSTED'].includes(i.status))
      .reduce((sum, i) => sum + (i.amount || 0), 0);
    this.remaining_balance = Math.round((this.total_amount - deducted) * 100) / 100;

    // Auto-complete: all non-CANCELLED installments are POSTED
    const nonCancelled = this.installments.filter(i => i.status !== 'CANCELLED');
    if (nonCancelled.length > 0 && nonCancelled.every(i => i.status === 'POSTED')) {
      if (this.status === 'ACTIVE') {
        this.status = 'COMPLETED';
      }
    }
  }

  next();
});

// ── Indexes ──
deductionScheduleSchema.index({ entity_id: 1, bdm_id: 1, status: 1 });
deductionScheduleSchema.index({ entity_id: 1, schedule_code: 1 }, { unique: true });
deductionScheduleSchema.index({ entity_id: 1, status: 1, 'installments.period': 1, 'installments.status': 1 });

// ── Export helper ──
module.exports = mongoose.model('DeductionSchedule', deductionScheduleSchema);
module.exports.incrementPeriod = incrementPeriod;
