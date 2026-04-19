const mongoose = require('mongoose');

/**
 * IncentiveDispute — Phase SG-4 #24 (Oracle Fusion dispute workflow pattern)
 *
 * State machine:
 *   OPEN → UNDER_REVIEW → RESOLVED_APPROVED → CLOSED
 *                       ↘ RESOLVED_DENIED   → CLOSED
 *
 * Each transition routes through `gateApproval({ module: 'INCENTIVE_DISPUTE' })`
 * so non-authorized actors are held in the Approval Hub (HTTP 202). RESOLVED_*
 * states optionally post a corrective journal: APPROVED on a payout dispute
 * triggers a `reverseAccrualJournal()` on the linked IncentivePayout (so
 * downstream payment is suppressed); APPROVED on a credit dispute appends a
 * SalesCredit reversal row (negative credited_amount) and re-runs
 * creditRuleEngine.assign() for the affected SalesLine.
 *
 * SLA clock walks via `disputeSlaAgent` (cron) — when current_state has been
 * unchanged for longer than `DISPUTE_SLA_DAYS[state].sla_days`, the agent
 * fires an escalation notification + writes a row to `sla_breaches[]`. Agent
 * never auto-transitions (resolution is always a human decision).
 *
 * Subscription posture: entity-scoped. SLA + dispute-type lookups
 * (DISPUTE_SLA_DAYS, INCENTIVE_DISPUTE_TYPE) live in Lookup with default
 * seeds; subscribers tune per-entity without code changes.
 */

const historyEventSchema = new mongoose.Schema({
  from_state: { type: String },
  to_state:   { type: String, required: true },
  by:         { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  by_role:    { type: String, default: '' },
  at:         { type: Date, default: Date.now },
  reason:     { type: String, default: '' },
  // For RESOLVED_APPROVED with a journal correction:
  reversal_journal_id: { type: mongoose.Schema.Types.ObjectId, ref: 'JournalEntry' },
  reversal_credit_id:  { type: mongoose.Schema.Types.ObjectId, ref: 'SalesCredit' },
}, { _id: false });

const slaBreachSchema = new mongoose.Schema({
  state:       { type: String, required: true },
  breached_at: { type: Date,   default: Date.now },
  detected_by: { type: String, default: 'disputeSlaAgent' },
  // Who got pinged on this breach (escalation chain target role/ids)
  notified_user_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
}, { _id: false });

const incentiveDisputeSchema = new mongoose.Schema({
  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: true,
    index: true,
  },

  // Filer (the BDM who raised it). Not necessarily the BDM whose payout is
  // affected — finance may file on behalf of a BDM.
  filed_by:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  filed_by_name: { type: String, default: '' },
  filed_at:    { type: Date, default: Date.now },

  // Affected BDM (for whose payout/credit the dispute is raised). When
  // filed_by != affected_bdm, the affected BDM gets read access + email on
  // every transition (notification path).
  affected_bdm_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // What's being disputed. dispute_type code drives `artifact` (which
  // collection the dispute attaches to) — see INCENTIVE_DISPUTE_TYPE lookup.
  dispute_type: { type: String, required: true },         // Lookup INCENTIVE_DISPUTE_TYPE
  artifact_type: {
    type: String,
    enum: ['payout', 'credit', 'snapshot', 'plan', 'other'],
    default: 'payout',
  },
  payout_id:      { type: mongoose.Schema.Types.ObjectId, ref: 'IncentivePayout' },
  sales_credit_id:{ type: mongoose.Schema.Types.ObjectId, ref: 'SalesCredit' },
  sale_line_id:   { type: mongoose.Schema.Types.ObjectId, ref: 'SalesLine' },
  plan_id:        { type: mongoose.Schema.Types.ObjectId, ref: 'SalesGoalPlan' },

  // Period context — denormalized so leaderboards can group disputes by
  // period without joining payouts.
  fiscal_year: { type: Number },
  period:      { type: String, trim: true },

  // Free-text claim and evidence
  claim_amount:   { type: Number, default: 0 },           // disputed peso value
  reason:         { type: String, required: true, trim: true },
  evidence_urls:  [{ type: String, trim: true }],          // S3 / external links

  // State
  current_state: {
    type: String,
    enum: ['OPEN', 'UNDER_REVIEW', 'RESOLVED_APPROVED', 'RESOLVED_DENIED', 'CLOSED'],
    default: 'OPEN',
    required: true,
  },
  state_changed_at: { type: Date, default: Date.now },

  // Reviewer assigned at UNDER_REVIEW transition
  reviewer_id:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewer_name: { type: String, default: '' },

  // Resolution outcome
  resolution_summary: { type: String, default: '' },
  resolved_by:        { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  resolved_at:        { type: Date },
  reversal_journal_id:{ type: mongoose.Schema.Types.ObjectId, ref: 'JournalEntry' },
  reversal_credit_id: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesCredit' },

  // Audit
  history:      [historyEventSchema],
  sla_breaches: [slaBreachSchema],

  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true,
  collection: 'erp_incentive_disputes',
});

incentiveDisputeSchema.index({ entity_id: 1, current_state: 1, state_changed_at: 1 });
incentiveDisputeSchema.index({ entity_id: 1, affected_bdm_id: 1, fiscal_year: 1 });
incentiveDisputeSchema.index({ payout_id: 1 });
incentiveDisputeSchema.index({ sales_credit_id: 1 });

module.exports = mongoose.model('IncentiveDispute', incentiveDisputeSchema);
