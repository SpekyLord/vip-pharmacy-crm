/**
 * BirFilingStatus — Phase VIP-1.J (Apr 2026).
 *
 * One row per (entity, form_code, period) tracking the BIR filing lifecycle.
 * Drives the BIR Compliance Dashboard heatmap at /erp/bir.
 *
 * Lifecycle: DATA_INCOMPLETE -> DRAFT -> REVIEWED -> FILED -> CONFIRMED.
 * OVERDUE is a derived status surfaced by the dashboard when status != FILED
 * and status != CONFIRMED past the form's due date — not stored in this enum
 * (computed at read time so it self-corrects when the file marker flips).
 *
 * Period encoding:
 *   - Monthly forms (2550M, 1601-C, 1606): period_month = 1-12, period_quarter = null
 *   - Quarterly forms (2550Q, 1601-EQ, SAWT, QAP): period_quarter = 1-4, period_month = null
 *   - Annual forms (1604-CF, 1604-E, 1701, 1702, BOOKS): both null
 *   - Per-payee forms (2307-OUT, 2307-IN): both null + period_payee_id set
 *
 * Status colors / labels come from BIR_FILING_STATUS lookup; this model only
 * stores the code so subscribers can re-skin labels without a code change.
 */

const mongoose = require('mongoose');

const FORM_CODES = [
  '2550M', '2550Q', '1601-EQ', '1601-C', '1606',
  '2307-OUT', '2307-IN', 'SAWT', 'QAP',
  '1604-CF', '1604-E', 'SCPWD',
  '1702', '1701', 'BOOKS',
  // Phase J3 Part B (May 2026) — per-employee annual compensation cert.
  // Mirrors 2307-OUT shape (per_payee_id required) but year-only periodicity.
  '2316',
];

const STATUS_CODES = ['DATA_INCOMPLETE', 'DRAFT', 'REVIEWED', 'FILED', 'CONFIRMED'];

const exportAuditEntrySchema = new mongoose.Schema({
  exported_at: { type: Date, default: Date.now },
  exported_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  artifact_kind: { type: String, enum: ['CSV', 'PDF', 'DAT', 'XLSX'] },
  filename: { type: String, trim: true },
  // SHA-256 of artifact bytes — re-exports with different content are detectable.
  content_hash: { type: String, trim: true },
  byte_length: { type: Number, min: 0 },
  notes: { type: String, trim: true },
}, { _id: true, timestamps: false });

const birFilingStatusSchema = new mongoose.Schema({
  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: true,
    index: true,
  },
  form_code: {
    type: String,
    enum: FORM_CODES,
    required: true,
  },
  period_year: {
    type: Number,
    required: true,
    min: 2024,
    max: 2099,
  },
  period_month: { type: Number, min: 1, max: 12, default: null },
  period_quarter: { type: Number, min: 1, max: 4, default: null },
  // For per-payee forms (2307 outbound/inbound) — points to the payee record.
  // Polymorphic: PeopleMaster, Vendor, Hospital. Resolver lives in service layer.
  period_payee_id: { type: mongoose.Schema.Types.ObjectId, default: null },
  period_payee_kind: {
    type: String,
    enum: ['PeopleMaster', 'Vendor', 'Hospital', null],
    default: null,
  },

  status: {
    type: String,
    enum: STATUS_CODES,
    default: 'DRAFT',
    required: true,
  },

  // Computed totals at FILED time (frozen for audit). Shape varies per form;
  // controller writes this from the form-specific aggregation service.
  totals_snapshot: { type: mongoose.Schema.Types.Mixed, default: null },

  // BIR confirmation reference number (eBIR / eFPS receipt). Populated on
  // CONFIRMED status. Unique per entity_id (we don't want two rows claiming
  // the same reference) — sparse so DRAFT rows don't conflict.
  bir_reference_number: { type: String, trim: true, default: null },

  // Lifecycle timestamps
  reviewed_at: { type: Date, default: null },
  reviewed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  filed_at: { type: Date, default: null },
  filed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  confirmed_at: { type: Date, default: null },
  confirmed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  // Email confirmation bridge — when BIR confirmation lands and the parser
  // matches this row, the email's MessageInbox _id is stored here for audit.
  // NULL when confirmed manually via MARK_CONFIRMED action.
  confirmation_email_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MessageInbox',
    default: null,
  },

  // Audit log of every export action against this row. Read-only; appended.
  export_audit_log: { type: [exportAuditEntrySchema], default: [] },

  // Free-form notes from finance/admin (e.g., "Skipped — no contractor
  // payments this quarter"). Surfaces on the form detail page.
  notes: { type: String, trim: true, default: '' },
}, {
  timestamps: true,
  collection: 'bir_filing_status',
});

// Compound unique — one row per (entity, form, year, month, quarter, payee).
// Three of the period fields are conditional on form_code; nulls participate
// in the index so each form's natural period uniqueness holds.
birFilingStatusSchema.index(
  { entity_id: 1, form_code: 1, period_year: 1, period_month: 1, period_quarter: 1, period_payee_id: 1 },
  { unique: true, name: 'idx_unique_filing_period' }
);

birFilingStatusSchema.index({ entity_id: 1, status: 1 });
birFilingStatusSchema.index({ entity_id: 1, period_year: 1 });
birFilingStatusSchema.index({ bir_reference_number: 1 }, { sparse: true });

// Period validator — enforce form -> period encoding contract above.
birFilingStatusSchema.pre('validate', function (next) {
  const monthlyForms = ['2550M', '1601-C', '1606'];
  const quarterlyForms = ['2550Q', '1601-EQ', 'SAWT', 'QAP'];
  const annualForms = ['1604-CF', '1604-E', '1702', '1701', 'BOOKS'];
  // Phase J3 Part B — 2316 is per-employee per-year (no month/quarter); same
  // encoding as 2307-OUT/IN but with payee_kind locked to PeopleMaster.
  const perPayeeForms = ['2307-OUT', '2307-IN', '2316'];
  // SCPWD reuses monthly encoding (one row per month, like 2550M).
  const scpwdMonthlyForms = ['SCPWD'];

  if ([...monthlyForms, ...scpwdMonthlyForms].includes(this.form_code)) {
    if (!this.period_month) return next(new Error(`${this.form_code} requires period_month (1-12).`));
    if (this.period_quarter) return next(new Error(`${this.form_code} cannot have period_quarter (use period_month).`));
    if (this.period_payee_id) return next(new Error(`${this.form_code} cannot have period_payee_id.`));
  } else if (quarterlyForms.includes(this.form_code)) {
    if (!this.period_quarter) return next(new Error(`${this.form_code} requires period_quarter (1-4).`));
    if (this.period_month) return next(new Error(`${this.form_code} cannot have period_month (use period_quarter).`));
    if (this.period_payee_id) return next(new Error(`${this.form_code} cannot have period_payee_id.`));
  } else if (annualForms.includes(this.form_code)) {
    if (this.period_month) return next(new Error(`${this.form_code} is annual; period_month must be null.`));
    if (this.period_quarter) return next(new Error(`${this.form_code} is annual; period_quarter must be null.`));
    if (this.period_payee_id) return next(new Error(`${this.form_code} cannot have period_payee_id.`));
  } else if (perPayeeForms.includes(this.form_code)) {
    if (!this.period_payee_id) return next(new Error(`${this.form_code} requires period_payee_id (per-payee scope).`));
    if (!this.period_payee_kind) return next(new Error(`${this.form_code} requires period_payee_kind.`));
  }

  // Lifecycle timestamp consistency — FILED requires filed_at, etc.
  if (this.status === 'FILED' && !this.filed_at) this.filed_at = new Date();
  if (this.status === 'REVIEWED' && !this.reviewed_at) this.reviewed_at = new Date();
  if (this.status === 'CONFIRMED' && !this.confirmed_at) this.confirmed_at = new Date();

  next();
});

birFilingStatusSchema.statics.FORM_CODES = FORM_CODES;
birFilingStatusSchema.statics.STATUS_CODES = STATUS_CODES;

module.exports = mongoose.model('BirFilingStatus', birFilingStatusSchema);
