/**
 * BirDataQualityRun — Phase VIP-1.J (Apr 2026).
 *
 * Persists the result of every TIN + address completeness scan run by
 * birDataQualityAgent (nightly + on-demand). Surfaces on the BIR Compliance
 * Dashboard data-quality strip with drill-down to the offending records.
 *
 * Findings are stored as a flat array of { collection, record_id, name,
 * issue_codes[] } so the dashboard can group/filter without re-scanning.
 *
 * Retained 90 days via TTL — same posture as AuditLog.
 */

const mongoose = require('mongoose');

const findingSchema = new mongoose.Schema({
  collection_kind: {
    type: String,
    enum: ['Hospital', 'Customer', 'Vendor', 'PeopleMaster', 'Doctor', 'Entity'],
    required: true,
  },
  record_id: { type: mongoose.Schema.Types.ObjectId, required: true },
  display_name: { type: String, trim: true, required: true },
  // Multi-issue records list every problem so admin can fix in one pass.
  issue_codes: {
    type: [{
      type: String,
      enum: [
        'TIN_MISSING',
        'TIN_INVALID',
        'ADDRESS_MISSING',
        'ADDRESS_INCOMPLETE_BARANGAY',
        'ADDRESS_INCOMPLETE_CITY',
        'ADDRESS_INCOMPLETE_PROVINCE',
        'ADDRESS_INCOMPLETE_ZIP',
        'RDO_MISSING',
        'TAX_TYPE_MISSING',
        'BUSINESS_STYLE_MISSING',
      ],
    }],
    default: [],
  },
  // Optional context — e.g., for PeopleMaster, the linked User._id.
  related_id: { type: mongoose.Schema.Types.ObjectId, default: null },
  blocked_forms: { type: [String], default: [] },
}, { _id: false, timestamps: false });

const birDataQualityRunSchema = new mongoose.Schema({
  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: true,
    index: true,
  },
  triggered_by: {
    type: String,
    enum: ['CRON', 'ON_DEMAND', 'BOOT'],
    required: true,
  },
  triggered_user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  started_at: { type: Date, default: Date.now },
  completed_at: { type: Date, default: null },
  duration_ms: { type: Number, default: 0 },

  // Aggregated counts per collection
  summary: {
    hospital_total:  { type: Number, default: 0 },
    hospital_issues: { type: Number, default: 0 },
    customer_total:  { type: Number, default: 0 },
    customer_issues: { type: Number, default: 0 },
    vendor_total:    { type: Number, default: 0 },
    vendor_issues:   { type: Number, default: 0 },
    people_total:    { type: Number, default: 0 },
    people_issues:   { type: Number, default: 0 },
    doctor_total:    { type: Number, default: 0 },
    doctor_issues:   { type: Number, default: 0 },
    entity_self:     { type: Number, default: 0 },  // 0 or 1
  },
  // Overall posture: OK (0 issues) / WARN (issues but no imminent deadline) /
  // BLOCK (issues block a form due in <= 7 days).
  status: {
    type: String,
    enum: ['OK', 'WARN', 'BLOCK', 'RUNNING'],
    default: 'RUNNING',
  },
  blocked_forms_due_within_7d: { type: [String], default: [] },

  findings: { type: [findingSchema], default: [] },

  // Set if the agent crashed — surfaces on dashboard so a stale cron run
  // is visible.
  error_message: { type: String, default: null },
}, {
  timestamps: true,
  collection: 'bir_data_quality_runs',
});

birDataQualityRunSchema.index({ entity_id: 1, started_at: -1 });
// 90-day TTL — match AuditLog
birDataQualityRunSchema.index({ started_at: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

module.exports = mongoose.model('BirDataQualityRun', birDataQualityRunSchema);
