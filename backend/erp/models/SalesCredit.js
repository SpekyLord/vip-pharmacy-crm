const mongoose = require('mongoose');

/**
 * SalesCredit — Phase SG-4 #22 (audit trail of credit-rule assignments)
 *
 * One row per (sale_line, credited BDM). Multiple rows possible per sale
 * when split rules apply (e.g. 70% to territory primary, 30% to product
 * specialist). The sum of credit_pct across rows for one sale is typically
 * 100, but can be more (manager override) or less (residual not covered by
 * any rule — engine should always backfill the residual to sale.bdm_id, so
 * in practice the sum equals 100 ± rounding).
 *
 * Source field tells where the row came from:
 *   - 'rule'     — produced by creditRuleEngine.assign() matching a CreditRule
 *   - 'fallback' — engine residual (no rule matched, or rules sum < 100)
 *   - 'manual'   — admin-edited override via the Sales Credit ledger UI
 *   - 'reversal' — written by SalesLine reopen/storno (negative credited_amount)
 *
 * Snapshot truth: SalesCredit rows are the source of truth for who-earned-
 * what credit on a given sale. KpiSnapshot/IncentivePayout calcs in SG-5+
 * will read from this collection (currently they still read sale.bdm_id —
 * migration is a SG-5 follow-up). The SG-4 PR ships the audit trail and the
 * engine; the snapshot consumer migration is staged for SG-5 to keep PRs
 * small and reviewable.
 *
 * Immutable on save (matches ErpAuditLog convention) — corrections happen
 * via reversal rows (negative amounts) plus a fresh re-run of the engine.
 */
const salesCreditSchema = new mongoose.Schema({
  entity_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', required: true, index: true },
  sale_line_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SalesLine',
    required: true,
    index: true,
  },
  credit_bdm_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // The CreditRule that produced this row. Null when source=fallback/manual.
  rule_id: { type: mongoose.Schema.Types.ObjectId, ref: 'CreditRule', default: null },
  rule_name: { type: String, default: '' },

  credit_pct: { type: Number, required: true, min: 0 },
  credited_amount: { type: Number, required: true },   // = invoice_total * credit_pct/100

  // Why this rule matched (or why fallback was used) — surfaced in the BDM
  // statement and Sales Credit ledger so disputes have full context.
  credit_reason: { type: String, default: '' },

  // Denormalized facts for ledger queries / leaderboards (avoids joining
  // SalesLine on every dashboard hit).
  invoice_total: { type: Number, default: 0 },
  csi_date: { type: Date },
  fiscal_year: { type: Number },
  period: { type: String },                              // YYYY-MM

  source: {
    type: String,
    enum: ['rule', 'fallback', 'manual', 'reversal'],
    default: 'rule',
    required: true,
  },

  created_at: { type: Date, default: Date.now, immutable: true },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: false,                                     // we manage created_at ourselves
  collection: 'erp_sales_credits',
});

// Append-only — block updates after insert. Mirrors ErpAuditLog discipline.
salesCreditSchema.pre('save', function (next) {
  if (!this.isNew) return next(new Error('SalesCredit rows are immutable. Insert a reversal row to correct.'));
  next();
});

// Common queries:
//   "all credits for this sale"   → { sale_line_id }
//   "credits earned by BDM in FY" → { entity_id, credit_bdm_id, fiscal_year }
//   "credits in a period"          → { entity_id, period }
salesCreditSchema.index({ entity_id: 1, credit_bdm_id: 1, fiscal_year: 1 });
salesCreditSchema.index({ entity_id: 1, period: 1, credit_bdm_id: 1 });
salesCreditSchema.index({ sale_line_id: 1, source: 1 });

module.exports = mongoose.model('SalesCredit', salesCreditSchema);
