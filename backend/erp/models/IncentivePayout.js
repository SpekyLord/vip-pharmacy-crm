const mongoose = require('mongoose');

/**
 * IncentivePayout — Phase SG-Q2 Week 2
 *
 * One row per (plan, BDM, period) once a tier is qualified. Lifecycle:
 *   ACCRUED → APPROVED → PAID → (optional) REVERSED
 *
 * ACCRUED   — created automatically by salesGoalService.computeBdmSnapshot on
 *             tier qualification. A DR/CR journal is posted the same transaction
 *             (COA_MAP.INCENTIVE_EXPENSE DR, COA_MAP.INCENTIVE_ACCRUAL CR).
 * APPROVED  — president/finance reviews the ledger and marks approved (no JE).
 * PAID      — marks the payout paid, records paid_via (PAYMENT_MODE lookup) +
 *             paid_at. Triggers a settlement JE that DR INCENTIVE_ACCRUAL,
 *             CR funding COA (cash/bank/card resolved via resolveFundingCoa).
 * REVERSED  — calls reverseJournal() on the accrual JE; status becomes REVERSED.
 *
 * Upsert key: (plan_id, bdm_id, period) so recomputing a snapshot twice does
 * not create two accruals. Value fields are refreshed on re-upsert unless the
 * payout has already moved past ACCRUED (service guards that).
 */
const incentivePayoutSchema = new mongoose.Schema({
  entity_id:    { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', required: true },
  plan_id:      { type: mongoose.Schema.Types.ObjectId, ref: 'SalesGoalPlan', required: true },
  bdm_id:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  person_id:    { type: mongoose.Schema.Types.ObjectId, ref: 'PeopleMaster' },
  fiscal_year:  { type: Number, required: true },
  // `period` is the snapshot period that triggered the accrual:
  //   - YTD accruals use the fiscal year (e.g. "2026")
  //   - Monthly accruals use "YYYY-MM"
  period:       { type: String, required: true, trim: true },
  period_type:  { type: String, enum: ['MONTHLY', 'YTD'], default: 'YTD' },
  program_code: { type: String, default: '' },   // Lookup: INCENTIVE_PROGRAM (optional)
  tier_code:    { type: String, required: true, trim: true },
  tier_label:   { type: String, default: '' },
  tier_budget:  { type: Number, default: 0 },    // amount accrued (post-cap)
  uncapped_budget: { type: Number, default: 0 }, // original tier_budget before cap
  attainment_pct: { type: Number, default: 0 },
  sales_target: { type: Number, default: 0 },
  sales_actual: { type: Number, default: 0 },

  status: {
    type: String,
    enum: ['ACCRUED', 'APPROVED', 'PAID', 'REVERSED', 'REJECTED'],
    default: 'ACCRUED',
  },

  // Rejection (Phase G6)
  rejection_reason: { type: String, trim: true, default: '' },
  rejected_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejected_at: { type: Date },

  // Journal linkage
  journal_id:          { type: mongoose.Schema.Types.ObjectId, ref: 'JournalEntry' },
  journal_number:      { type: String, default: '' },
  settlement_journal_id: { type: mongoose.Schema.Types.ObjectId, ref: 'JournalEntry' },
  reversal_journal_id: { type: mongoose.Schema.Types.ObjectId, ref: 'JournalEntry' },

  // Settlement
  paid_via:     { type: String, default: '' },   // Lookup: PAYMENT_MODE
  paid_at:      { type: Date },
  approved_by:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approved_at:  { type: Date },
  paid_by:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reversed_by:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reversed_at:  { type: Date },
  reversal_reason: { type: String, default: '' },

  notes:       { type: String, default: '' },
  created_by:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true,
  collection: 'erp_incentive_payouts',
});

// Idempotency key — matches upsert filter in salesGoalService.accrueIncentive
incentivePayoutSchema.index(
  { plan_id: 1, bdm_id: 1, period: 1, period_type: 1, program_code: 1 },
  { unique: true, partialFilterExpression: { bdm_id: { $exists: true } } }
);
incentivePayoutSchema.index({ entity_id: 1, period: 1, status: 1 });
incentivePayoutSchema.index({ entity_id: 1, bdm_id: 1, period: 1 });
incentivePayoutSchema.index({ status: 1 });

module.exports = mongoose.model('IncentivePayout', incentivePayoutSchema);
