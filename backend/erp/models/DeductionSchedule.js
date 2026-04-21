/**
 * DeductionSchedule Model — Recurring & Non-Recurring Deduction Plans
 *
 * Owners (XOR):
 *   - `bdm_id` (contractor) — schedule installments auto-inject into `IncomeReport.deduction_lines`
 *   - `person_id` (employee via PeopleMaster — Phase G1.4) — schedule installments auto-inject
 *     into `Payslip.deduction_lines`. Single collection serves both so a BDM who graduates
 *     to employee keeps one schedule lifecycle (no migration, no parallel table).
 *
 * Use cases:
 *   - Recurring: CC installment ₱9,000 → ₱990/month × 10 months
 *   - Non-recurring: Purchased goods ₱1,500 → single deduction next month
 *
 * Handles both via term_months: 1 = one-time, >1 = installment plan.
 * Installments[] pre-generated on create, auto-injected into IncomeReport (BDM) or Payslip (employee)
 * on payslip generation.
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
  // Phase G1.4 — employee schedules inject into Payslip instead of IncomeReport.
  // Exactly one of income_report_id / payslip_id is populated per installment
  // (matches the bdm_id / person_id XOR on the parent schedule).
  payslip_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Payslip' },
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
  // Owner — XOR with person_id (enforced in pre-save). Kept optional so the
  // same collection serves contractor AND employee schedules.
  bdm_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // Phase G1.4 — employee owner. Points at PeopleMaster so payroll knows
  // which payslip to inject into. XOR with bdm_id.
  person_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PeopleMaster'
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
  target_cycle: {
    type: String,
    required: [true, 'Target cycle is required'],
    default: 'C2'
  }, // Lookup: CYCLE — which payroll cycle to inject installments into
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

// Phase G1.4 — enforce bdm_id XOR person_id. Guarding on `pre('validate')` so
// `doc.validate()` and `doc.save()` both catch it; a schema-level `required`
// on both paths would preclude owner-type flexibility at call-time. Anchored
// here (vs pre('save')) means save-path helpers that short-circuit on validate
// can't bypass the invariant.
deductionScheduleSchema.pre('validate', function (next) {
  const hasBdm = !!this.bdm_id;
  const hasPerson = !!this.person_id;
  if (hasBdm === hasPerson) {
    return next(new Error('DeductionSchedule requires exactly one owner: bdm_id (contractor) OR person_id (employee)'));
  }
  next();
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
// `bdm_id` index uses a sparse partial so BDM-owner schedules are fast without
// polluting the index with null entries for employee-owner schedules.
deductionScheduleSchema.index(
  { entity_id: 1, bdm_id: 1, status: 1 },
  { partialFilterExpression: { bdm_id: { $exists: true } } }
);
// Phase G1.4 — mirror index for employee-owner schedules so payslipCalc's
// active-schedule query is as fast as incomeCalc's BDM query.
deductionScheduleSchema.index(
  { entity_id: 1, person_id: 1, status: 1 },
  { partialFilterExpression: { person_id: { $exists: true } } }
);
deductionScheduleSchema.index({ entity_id: 1, schedule_code: 1 }, { unique: true });
deductionScheduleSchema.index({ entity_id: 1, status: 1, 'installments.period': 1, 'installments.status': 1 });

// ── Export helper ──
module.exports = mongoose.model('DeductionSchedule', deductionScheduleSchema);
module.exports.incrementPeriod = incrementPeriod;
