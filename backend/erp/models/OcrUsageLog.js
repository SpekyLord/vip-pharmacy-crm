/**
 * OcrUsageLog — Phase H3
 *
 * Per-call audit of OCR usage for subscription metering, cost analysis, and
 * monthly quota enforcement. Indexed by entity_id + timestamp for fast
 * "calls this month" queries.
 *
 * Retention: 1-year TTL on timestamp index keeps the collection bounded.
 */
const mongoose = require('mongoose');

const ocrUsageLogSchema = new mongoose.Schema({
  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: true,
  },
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  doc_type: { type: String, required: true },
  // Engines actually invoked for this call
  vision_called: { type: Boolean, default: false },
  ai_fallback_called: { type: Boolean, default: false },
  // Phase H4 — preprocessing applied to the image before Vision
  preprocessing_applied: { type: Boolean, default: false },
  // Phase H4 — why Claude was invoked (NONE | LOW_CLASSIFICATION | MISSING_FIELDS | BOTH)
  ai_trigger_reason: {
    type: String,
    enum: ['NONE', 'LOW_CLASSIFICATION', 'MISSING_FIELDS', 'BOTH'],
    default: 'NONE',
  },
  // Phase H5 — vendor auto-learn outcome for this call. CREATED = new VendorMaster,
  // ALIAS_ADDED = appended new OCR text variation to an existing vendor's aliases,
  // SKIPPED = learner ran but guardrails rejected the candidate, NONE = learner did not run.
  vendor_auto_learn_action: {
    type: String,
    enum: ['NONE', 'CREATED', 'ALIAS_ADDED', 'SKIPPED'],
    default: 'NONE',
  },
  vendor_auto_learned: { type: Boolean, default: false },
  // Result
  success: { type: Boolean, default: true },
  classification_confidence: { type: String, enum: ['HIGH', 'MEDIUM', 'LOW', null], default: null },
  match_method: { type: String, default: null },
  latency_ms: { type: Number, default: 0 },
  error_message: { type: String, default: null },
  // Whether the call was gated (skipped due to settings/quota) — still logged for visibility
  skipped_reason: {
    type: String,
    enum: ['NONE', 'OCR_DISABLED', 'DOC_TYPE_NOT_ALLOWED', 'MONTHLY_QUOTA_EXCEEDED'],
    default: 'NONE',
  },
  // Phase H6 — Claude AI fallback spend-cap gate. When the monthly AI_SPEND_CAPS
  // cap is reached, Vision still runs (and the parser still extracts) but the
  // Claude classifier/field-completion step is skipped. Independent from
  // skipped_reason so entities can tell "Vision + AI both blocked" apart from
  // "Vision ran, AI blocked by budget".
  ai_skipped_reason: {
    type: String,
    enum: ['NONE', 'SPEND_CAP_EXCEEDED'],
    default: 'NONE',
  },
  // Phase H6 — $USD cost of Claude calls invoked during this OCR call.
  // Summed by spendCapService.getCurrentMonthSpend() for AI Budget enforcement.
  // 0 when AI fallback was not invoked (rule-based parser sufficed).
  cost_usd: { type: Number, default: 0, min: 0 },
  timestamp: { type: Date, default: Date.now },
}, {
  timestamps: false,
  collection: 'erp_ocr_usage_logs',
});

// Composite indexes for common queries
ocrUsageLogSchema.index({ entity_id: 1, timestamp: -1 });
ocrUsageLogSchema.index({ entity_id: 1, doc_type: 1, timestamp: -1 });
ocrUsageLogSchema.index({ user_id: 1, timestamp: -1 });
// 1-year TTL — keeps the collection bounded; entities can export to cold storage if longer retention needed
ocrUsageLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

/**
 * Count successful, non-skipped OCR calls for an entity in the current calendar month.
 * Used by ocrController to enforce monthly_call_quota.
 */
ocrUsageLogSchema.statics.countMonthlyForEntity = async function (entityId, refDate = new Date()) {
  const start = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
  const end = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 1);
  return this.countDocuments({
    entity_id: entityId,
    timestamp: { $gte: start, $lt: end },
    skipped_reason: 'NONE',
    vision_called: true,
  });
};

module.exports = mongoose.model('OcrUsageLog', ocrUsageLogSchema);
