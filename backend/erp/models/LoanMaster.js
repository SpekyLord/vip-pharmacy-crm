/**
 * LoanMaster Model — Loan register for amortization tracking
 *
 * PRD v5 §11.10 — Monthly interest = outstanding_balance * (annual_rate / 12)
 * Principal split = monthly_payment - interest
 */
const mongoose = require('mongoose');

const interestEntrySchema = new mongoose.Schema({
  period: { type: String, required: true },
  interest_amount: { type: Number, required: true },
  principal_amount: { type: Number, required: true },
  status: { type: String, enum: ['STAGING', 'APPROVED', 'POSTED'], default: 'STAGING' },
  je_id: { type: mongoose.Schema.Types.ObjectId, ref: 'JournalEntry' },
  approved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approved_at: { type: Date },
  computed_at: { type: Date, default: Date.now }
}, { _id: true });

const loanMasterSchema = new mongoose.Schema({
  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: true
  },
  loan_code: {
    type: String,
    required: true,
    trim: true
  },
  lender: {
    type: String,
    required: true,
    trim: true
  },
  purpose: {
    type: String,
    trim: true
  },
  principal: {
    type: Number,
    required: true,
    min: 0
  },
  annual_rate: {
    type: Number,
    required: true,
    min: 0
  },
  term_months: {
    type: Number,
    required: true,
    min: 1
  },
  start_date: {
    type: Date,
    required: true
  },
  monthly_payment: {
    type: Number,
    default: 0
  },
  total_interest: {
    type: Number,
    default: 0
  },
  outstanding_balance: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'PAID', 'RESTRUCTURED'],
    default: 'ACTIVE'
  },
  amortization_schedule: [interestEntrySchema]
}, {
  timestamps: true,
  collection: 'erp_loans'
});

// Pre-save: compute monthly payment if not set
loanMasterSchema.pre('save', function (next) {
  if (this.isNew && this.monthly_payment === 0 && this.principal > 0) {
    const r = this.annual_rate / 12;
    if (r > 0) {
      this.monthly_payment = Math.round(
        (this.principal * r * Math.pow(1 + r, this.term_months)) /
        (Math.pow(1 + r, this.term_months) - 1) * 100
      ) / 100;
    } else {
      this.monthly_payment = Math.round((this.principal / this.term_months) * 100) / 100;
    }
    this.outstanding_balance = this.principal;
  }
  next();
});

loanMasterSchema.index({ entity_id: 1, loan_code: 1 }, { unique: true });
loanMasterSchema.index({ entity_id: 1, status: 1 });

module.exports = mongoose.model('LoanMaster', loanMasterSchema);
