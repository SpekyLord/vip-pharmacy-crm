const mongoose = require('mongoose');
const deductionLineSchema = require('./schemas/deductionLine');

const payslipSchema = new mongoose.Schema(
  {
    entity_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Entity',
      required: [true, 'Entity is required'],
    },
    person_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PeopleMaster',
      required: [true, 'Person is required'],
    },
    person_type: {
      type: String,
    }, // Lookup: PERSON_TYPE
    period: {
      type: String,
      required: [true, 'Period is required'],
      match: [/^\d{4}-\d{2}$/, 'Period must be YYYY-MM format'],
    },
    cycle: {
      type: String,
      default: 'MONTHLY',
    }, // Lookup: CYCLE

    // ═══ Earnings ═══
    earnings: {
      basic_salary: { type: Number, default: 0 },
      rice_allowance: { type: Number, default: 0 },
      clothing_allowance: { type: Number, default: 0 },
      medical_allowance: { type: Number, default: 0 },
      laundry_allowance: { type: Number, default: 0 },
      transport_allowance: { type: Number, default: 0 },
      incentive: { type: Number, default: 0 },
      overtime: { type: Number, default: 0 },
      holiday_pay: { type: Number, default: 0 },
      night_diff: { type: Number, default: 0 },
      bonus: { type: Number, default: 0 },
      thirteenth_month: { type: Number, default: 0 },
      reimbursements: { type: Number, default: 0 },
      other_earnings: { type: Number, default: 0 },
    },
    total_earnings: { type: Number, default: 0 },

    // ═══ Deduction Lines (Phase G1.3 — transparency parity with IncomeReport) ═══
    // Each line has label + amount + kind badge + optional source ref. Compute
    // service populates these from statutory calcs; flat fields below are
    // derived from the lines to preserve the JE consumer (autoJournal.journalFromPayroll).
    deduction_lines: { type: [deductionLineSchema], default: [] },

    // ═══ Legacy flat deductions (preserved for autoJournal.journalFromPayroll) ═══
    // These remain the canonical source for JE posting — the compute service
    // derives them FROM deduction_lines so the two stay in sync. Kept flat so
    // historical pre-G1.3 payslips and the JE payer code don't need migration.
    deductions: {
      sss_employee: { type: Number, default: 0 },
      philhealth_employee: { type: Number, default: 0 },
      pagibig_employee: { type: Number, default: 0 },
      withholding_tax: { type: Number, default: 0 },
      cash_advance: { type: Number, default: 0 },
      loan_payments: { type: Number, default: 0 },
      other_deductions: { type: Number, default: 0 },
    },
    total_deductions: { type: Number, default: 0 },

    net_pay: { type: Number, default: 0 },

    // ═══ Employer Contributions (not deducted from employee) ═══
    employer_contributions: {
      sss_employer: { type: Number, default: 0 },
      philhealth_employer: { type: Number, default: 0 },
      pagibig_employer: { type: Number, default: 0 },
      ec_employer: { type: Number, default: 0 },
    },

    // ═══ Snapshots for audit ═══
    comp_profile_snapshot: { type: mongoose.Schema.Types.Mixed },
    gov_rates_snapshot: { type: mongoose.Schema.Types.Mixed },

    // ═══ Workflow ═══
    status: {
      type: String,
      enum: ['DRAFT', 'COMPUTED', 'REVIEWED', 'APPROVED', 'REJECTED', 'POSTED'],
      default: 'DRAFT',
    },
    computed_at: { type: Date },
    reviewed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewed_at: { type: Date },
    approved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approved_at: { type: Date },
    posted_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    posted_at: { type: Date },
    rejection_reason: { type: String },

    notes: { type: String, default: '' },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // ═══ Reversal (SAP Storno) ═══
    event_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TransactionEvent' },
    deletion_event_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TransactionEvent' },
    reopen_count: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    collection: 'erp_payslips',
  }
);

// Pre-save: compute totals
//
// Phase G1.3 — prefer deduction_lines when present (sum non-REJECTED lines) so
// a Finance correction on a line is reflected in total_deductions immediately.
// Fall back to flat fields when deduction_lines is empty, covering historical
// pre-G1.3 payslips that were posted before the array existed. Either way,
// flat fields remain populated (derived by payslipCalc) so the JE consumer
// in autoJournal.journalFromPayroll keeps working without changes.
payslipSchema.pre('save', function (next) {
  const e = this.earnings || {};
  this.total_earnings = Math.round(
    ((e.basic_salary || 0) + (e.rice_allowance || 0) + (e.clothing_allowance || 0) +
    (e.medical_allowance || 0) + (e.laundry_allowance || 0) + (e.transport_allowance || 0) +
    (e.incentive || 0) + (e.overtime || 0) + (e.holiday_pay || 0) + (e.night_diff || 0) +
    (e.bonus || 0) + (e.thirteenth_month || 0) + (e.reimbursements || 0) + (e.other_earnings || 0)) * 100
  ) / 100;

  if (this.deduction_lines && this.deduction_lines.length > 0) {
    const active = this.deduction_lines.filter(l => l.status !== 'REJECTED');
    this.total_deductions = Math.round(
      active.reduce((sum, l) => sum + (l.amount || 0), 0) * 100
    ) / 100;
  } else {
    const d = this.deductions || {};
    this.total_deductions = Math.round(
      ((d.sss_employee || 0) + (d.philhealth_employee || 0) + (d.pagibig_employee || 0) +
      (d.withholding_tax || 0) + (d.cash_advance || 0) + (d.loan_payments || 0) +
      (d.other_deductions || 0)) * 100
    ) / 100;
  }

  this.net_pay = Math.round((this.total_earnings - this.total_deductions) * 100) / 100;
  next();
});

payslipSchema.index({ entity_id: 1, person_id: 1, period: 1, cycle: 1 }, { unique: true });
payslipSchema.index({ entity_id: 1, status: 1 });
payslipSchema.index({ person_id: 1, period: 1 });

module.exports = mongoose.model('Payslip', payslipSchema);
