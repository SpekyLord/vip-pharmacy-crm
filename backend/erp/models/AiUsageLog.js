/**
 * AiUsageLog — Phase G6.10
 *
 * Generic per-call audit of any Claude-powered AI feature in the ERP. Replaces /
 * supersedes the per-feature OcrUsageLog pattern by adding a `feature_code`
 * dimension so subscription metering, cost analysis, and spend caps can attribute
 * usage to specific lookup-driven features (AI_COWORK_FEATURES, COPILOT_TOOLS,
 * future AI rows). OcrUsageLog stays in place for OCR-specific telemetry.
 *
 * Indexed by (entity_id, feature_code, timestamp) for fast monthly-spend queries.
 * Retention: 1-year TTL on timestamp.
 */
const mongoose = require('mongoose');

const aiUsageLogSchema = new mongoose.Schema({
  entity_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', required: true },
  user_id:   { type: mongoose.Schema.Types.ObjectId, ref: 'User',   required: true },

  // Lookup-driven feature identifier — matches AI_COWORK_FEATURES.code or
  // COPILOT_TOOLS.code or any future AI feature lookup row. Free-form string so
  // adding new features = adding lookup rows, no enum migration.
  feature_code: { type: String, required: true, index: true },

  // Anthropic call metadata
  model:         { type: String, default: '' },
  input_tokens:  { type: Number, default: 0 },
  output_tokens: { type: Number, default: 0 },
  cost_usd:      { type: Number, default: 0 },
  latency_ms:    { type: Number, default: 0 },

  // Outcome
  success:       { type: Boolean, default: true },
  error_message: { type: String,  default: null },

  // Reason the call was gated (still logged so admin sees the surface attempted)
  skipped_reason: {
    type: String,
    enum: ['NONE', 'FEATURE_DISABLED', 'ROLE_DENIED', 'RATE_LIMITED', 'SPEND_CAP_EXCEEDED', 'NO_API_KEY'],
    default: 'NONE',
  },

  // Optional context — small JSON of ids/refs for tracing (not full payload)
  context: { type: mongoose.Schema.Types.Mixed, default: {} },

  timestamp: { type: Date, default: Date.now },
}, {
  timestamps: false,
  collection: 'erp_ai_usage_logs',
});

aiUsageLogSchema.index({ entity_id: 1, timestamp: -1 });
aiUsageLogSchema.index({ entity_id: 1, feature_code: 1, timestamp: -1 });
aiUsageLogSchema.index({ user_id: 1, timestamp: -1 });
// 1-year TTL keeps the collection bounded
aiUsageLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

/**
 * Sum cost for an entity in the current calendar month, optionally scoped to
 * a feature_code (used by spend cap enforcement in G7.8).
 */
aiUsageLogSchema.statics.sumMonthlyCost = async function (entityId, featureCode = null, refDate = new Date()) {
  const start = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
  const end = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 1);
  const match = {
    entity_id: new mongoose.Types.ObjectId(entityId),
    timestamp: { $gte: start, $lt: end },
    success: true,
  };
  if (featureCode) match.feature_code = featureCode;
  const agg = await this.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: '$cost_usd' } } },
  ]);
  return agg[0]?.total || 0;
};

/**
 * Per-user per-minute call count (for rate-limit checks).
 */
aiUsageLogSchema.statics.countRecentByUser = async function (userId, featureCode, withinSeconds = 60) {
  const since = new Date(Date.now() - withinSeconds * 1000);
  return this.countDocuments({
    user_id: userId,
    feature_code: featureCode,
    timestamp: { $gte: since },
  });
};

module.exports = mongoose.model('AiUsageLog', aiUsageLogSchema);
