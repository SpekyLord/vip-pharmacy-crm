const mongoose = require('mongoose');

const periodLockSchema = new mongoose.Schema({
  entity_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', required: true },
  module: {
    type: String,
    // Phase SG-Q2 W4 — added SALES_GOAL (sales-goal plan + KPI period gate),
    // INCENTIVE_PAYOUT (settlement/reversal gate, was wired but missing from
    // enum → silent skip), DEDUCTION (deduction schedules, same orphan bug).
    // Phase VIP-1.H (Apr 2026) — added SCPWD (Senior Citizen / PWD Sales Book
    // register; locks retroactive corrections after monthly BIR filing).
    // Phase VIP-1.J (Apr 2026) — added BIR_FILING. Once a BIR form
    // (2550M/2550Q/1601-EQ/1601-C/1606/SAWT/QAP/1604-CF/1604-E/1702) is
    // marked CONFIRMED for a period, that period is locked against any
    // edit that would change its totals (back-dated JE, sale, expense,
    // payroll). Bookkeeper-tier role can mark FILED but only finance/admin
    // can lock the period.
    // Future migration to a PERIOD_LOCKABLE_MODULES lookup is non-breaking:
    // remove the enum and add a custom validator against the lookup table.
    enum: ['SALES', 'COLLECTION', 'EXPENSE', 'JOURNAL', 'PAYROLL',
           'PURCHASING', 'INVENTORY', 'BANKING', 'PETTY_CASH', 'IC_TRANSFER', 'INCOME',
           'SALES_GOAL', 'INCENTIVE_PAYOUT', 'DEDUCTION', 'SCPWD', 'BIR_FILING'],
    required: true
  },
  year: { type: Number, required: true },
  month: { type: Number, required: true, min: 1, max: 12 },
  is_locked: { type: Boolean, default: false },
  locked_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  locked_at: { type: Date },
  unlocked_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  unlocked_at: { type: Date }
}, {
  timestamps: false,
  collection: 'erp_period_locks'
});

periodLockSchema.index({ entity_id: 1, module: 1, year: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('PeriodLock', periodLockSchema);
