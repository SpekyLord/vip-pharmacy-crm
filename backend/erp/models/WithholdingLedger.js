/**
 * WithholdingLedger — Phase VIP-1.J / J2 (Apr 2026).
 *
 * Outbound + (future) inbound + (future) compensation withholding-tax events,
 * one row per (source line × ATC code). Mirrors VatLedger's posting cadence
 * — engine writes happen at document-post time so the GL totals and the
 * sub-ledger totals are always reconciled (per `findAccountingIntegrityIssues`
 * sub-ledger vs. control-account check).
 *
 * Direction semantics (J2 only writes OUTBOUND today; J3/J6 reserved):
 *   • OUTBOUND      — VIP withheld from a payee. Feeds 1601-EQ + 1606 + SAWT
 *                     + outbound 2307 (this phase).
 *   • COMPENSATION  — payroll EWT on regular employees. Feeds 1601-C + 1604-CF
 *                     (Phase J3).
 *   • INBOUND       — hospital withheld from VIP (mirrors CwtLedger semantics
 *                     but with a unified shape). Feeds 1702 income-tax credit
 *                     reconciliation in J6. Today CwtLedger is the source of
 *                     truth for INBOUND; J6 will either migrate or coexist —
 *                     leaving the enum in place keeps the shape stable.
 *
 * Snapshot pattern (`payee_*_snapshot`):
 *   Payee renames or address corrections AFTER a withholding event posted
 *   must NOT rewrite history — BIR auditors compare what we filed against
 *   what the certificate said at the time. We denormalize name + TIN +
 *   address at write time, and the alphalist (1604-E next year) reads from
 *   the snapshot, not the live PeopleMaster/Vendor row.
 *
 * Finance tag (mirrors VatLedger semantics):
 *   PENDING  — engine-created, not yet reviewed
 *   INCLUDE  — finance confirmed for the alphalist
 *   EXCLUDE  — finance disqualified (e.g., reversed transaction, void invoice)
 *   DEFER    — straddles a quarter cutoff; finance pushed to next period
 *
 * ATC-code threshold flips:
 *   WI010 (5%) ↔ WI011 (10%) flip on YTD payout > ₱720k for a given
 *   contractor. Engine consults `getAtcCodeForPayee()` at write time, so
 *   crossing the threshold mid-year shifts subsequent entries to the higher
 *   bucket without rewriting earlier rows. The historical 5% rows stay 5%
 *   in the alphalist (correct — that's what BIR expects).
 *
 * Subscription-readiness:
 *   • Every read is `entity_id`-scoped (Rule #19).
 *   • ATC catalog is lookup-driven via BIR_ATC_CODES — subscribers can
 *     extend per their jurisdiction without code changes (Rule #3).
 *   • finance_tag transition policy lives in finance UI, not the model —
 *     model is shape-only.
 */

const mongoose = require('mongoose');

const DIRECTION_VALUES = ['OUTBOUND', 'INBOUND', 'COMPENSATION'];
const PAYEE_KIND_VALUES = ['PeopleMaster', 'VendorMaster', 'Hospital', 'Doctor', 'Other'];
const SOURCE_MODULE_VALUES = ['EXPENSE', 'PRF_CALF', 'PAYROLL', 'COLLECTION', 'JOURNAL', 'MANUAL'];
const FINANCE_TAG_VALUES = ['PENDING', 'INCLUDE', 'EXCLUDE', 'DEFER'];

const withholdingLedgerSchema = new mongoose.Schema({
  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: true,
  },
  // 'YYYY-MM' to mirror VatLedger.period — same aggregator semantics so the
  // 1601-EQ aggregator can sum three months by `{ period: { $in: [...] } }`.
  period: {
    type: String,
    required: true,
    trim: true,
    match: [/^\d{4}-\d{2}$/, 'period must be YYYY-MM'],
  },
  direction: {
    type: String,
    enum: DIRECTION_VALUES,
    required: true,
    default: 'OUTBOUND',
  },

  // BIR Alphanumeric Tax Code (catalog: BIR_ATC_CODES lookup). Validated by
  // controller layer at write time; not enforced here so subscriber-defined
  // ATC codes can flow through without a model change (Rule #3).
  atc_code: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
  },
  // Form code the row aggregates into (denormalized so the dashboard heatmap
  // can group by form without joining to BIR_ATC_CODES every query).
  form_code: {
    type: String,
    trim: true,
    uppercase: true,
  },

  // Polymorphic payee. ObjectId points to the model named in `payee_kind`.
  payee_kind: {
    type: String,
    enum: PAYEE_KIND_VALUES,
    required: true,
  },
  payee_id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  // Frozen snapshot — see header comment.
  payee_name_snapshot: { type: String, trim: true },
  payee_tin_snapshot: { type: String, trim: true },
  payee_address_snapshot: { type: String, trim: true },

  // Money. Engine sets withholding_rate from BIR_ATC_CODES at write time
  // (subscriber-overridable via lookup metadata). withheld_amount is
  // computed by the engine but stored to avoid reapplying float math on every
  // 1601-EQ aggregation.
  gross_amount: { type: Number, required: true, min: 0 },
  withholding_rate: { type: Number, required: true, min: 0, max: 1 },
  withheld_amount: { type: Number, required: true, min: 0 },

  // Source-document linkage — every row must trace back to a posted document.
  source_module: {
    type: String,
    enum: SOURCE_MODULE_VALUES,
    required: true,
  },
  source_doc_ref: { type: String, trim: true },                                  // human-readable doc ref
  source_event_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TransactionEvent' }, // links to GL
  source_line_id: { type: mongoose.Schema.Types.ObjectId },                      // sub-line on the doc
  bdm_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },                  // who posted the doc

  // Finance posture (mirrors VatLedger).
  finance_tag: {
    type: String,
    enum: FINANCE_TAG_VALUES,
    default: 'PENDING',
  },
  tagged_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  tagged_at: { type: Date },

  // YTD running totals — denormalized for fast threshold flips. Optional.
  ytd_gross_at_post: { type: Number, default: 0 },
  ytd_withheld_at_post: { type: Number, default: 0 },

  // Operational notes (e.g., "Reversed by JE-2026-04-007").
  notes: { type: String, trim: true },

  created_at: {
    type: Date,
    immutable: true,
    default: Date.now,
  },
}, {
  timestamps: false,
  collection: 'erp_withholding_ledger',
});

// Aggregation: 1601-EQ groups by (entity, quarter-of-period, atc_code).
withholdingLedgerSchema.index({ entity_id: 1, period: 1, direction: 1, atc_code: 1 });
// 2307-OUT generation: per-payee per-quarter rollup.
withholdingLedgerSchema.index({ entity_id: 1, payee_kind: 1, payee_id: 1, period: 1 });
// Reversal lookup: when a posted document is reversed, engine deletes by source_event_id.
withholdingLedgerSchema.index({ source_event_id: 1 });
// Finance review queue.
withholdingLedgerSchema.index({ entity_id: 1, finance_tag: 1 });

withholdingLedgerSchema.statics.DIRECTIONS = DIRECTION_VALUES;
withholdingLedgerSchema.statics.PAYEE_KINDS = PAYEE_KIND_VALUES;
withholdingLedgerSchema.statics.SOURCE_MODULES = SOURCE_MODULE_VALUES;
withholdingLedgerSchema.statics.FINANCE_TAGS = FINANCE_TAG_VALUES;

module.exports = mongoose.model('WithholdingLedger', withholdingLedgerSchema);
