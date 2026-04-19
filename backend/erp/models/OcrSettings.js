/**
 * OcrSettings — Phase H3
 *
 * Per-entity OCR feature flags + quota controls. Subscription-ready: each
 * subscriber entity can be configured independently (enable OCR, allow Claude
 * AI fallback, restrict allowed document types, set monthly call quota).
 *
 * Manual photo upload (the OCR fallback) is NEVER gated — even when OCR is
 * disabled, users can still upload a plain photo. Disabling OCR only short-
 * circuits the Vision API call so the storefront pays for nothing it doesn't use.
 */
const mongoose = require('mongoose');

// Phase H6 — Sales OCR adds BANK_SLIP (bank deposit slip) and CHECK (received
// check) so BDMs can scan any sales-side document in the field. Existing
// subscriber entities get both new chips enabled by default; admins can
// deselect in the existing OCR Settings panel to restrict.
const ALL_DOC_TYPES = ['CSI', 'CR', 'CWT_2307', 'GAS_RECEIPT', 'ODOMETER', 'OR', 'UNDERTAKING', 'DR', 'BANK_SLIP', 'CHECK'];

const ocrSettingsSchema = new mongoose.Schema({
  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: true,
  },
  // Master switch — when false, OCR endpoint returns photo-upload-only response (no Vision call)
  enabled: { type: Boolean, default: true },
  // Claude AI fallback for LOW-confidence classifier results
  ai_fallback_enabled: { type: Boolean, default: true },
  // Phase H4: when true, Claude is also invoked when critical fields (amount/date/etc.) are missing
  // or LOW even if classification confidence is HIGH. Catches "right vendor, wrong number" cases.
  ai_field_completion_enabled: { type: Boolean, default: true },
  // Phase H4: image preprocessing for Vision (auto-rotate + grayscale + contrast + sharpen).
  // Disable only if a particular receipt format scans worse with grayscale (rare).
  preprocessing_enabled: { type: Boolean, default: true },
  // Phase H5: vendor auto-learn from Claude wins — when Claude successfully classifies
  // an OR/gas receipt, the system either appends the OCR text variation to a similar
  // existing vendor's aliases or creates a new VendorMaster entry (status UNREVIEWED)
  // so the next scan hits EXACT_VENDOR / ALIAS_MATCH without firing Claude again.
  vendor_auto_learn_enabled: { type: Boolean, default: true },
  // Whitelist of doc types this entity is allowed to OCR (empty array = allow all)
  allowed_doc_types: {
    type: [String],
    enum: ALL_DOC_TYPES,
    default: ALL_DOC_TYPES,
  },
  // Monthly call quota (0 = unlimited). When exceeded, OCR is skipped but photo upload still works.
  monthly_call_quota: { type: Number, default: 0, min: 0 },
  // When true, log every OCR call to OcrUsageLog (for billing/audit). Default true.
  usage_logging_enabled: { type: Boolean, default: true },
  updated_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, {
  timestamps: true,
  collection: 'erp_ocr_settings',
});

ocrSettingsSchema.index({ entity_id: 1 }, { unique: true });

ocrSettingsSchema.statics.ALL_DOC_TYPES = ALL_DOC_TYPES;

/**
 * Get effective settings for an entity (creates defaults if none exist).
 * Cached for 5 minutes per entity to avoid DB hits on every OCR call.
 */
const _settingsCache = new Map(); // entityKey → { value, expiry }
const SETTINGS_CACHE_TTL_MS = 5 * 60 * 1000;

ocrSettingsSchema.statics.getForEntity = async function (entityId) {
  const key = String(entityId || '__NONE__');
  const now = Date.now();
  const hit = _settingsCache.get(key);
  if (hit && now < hit.expiry) return hit.value;

  if (!entityId) {
    // No entity = wide-open defaults (used by OCR test endpoint)
    const defaults = {
      enabled: true,
      ai_fallback_enabled: true,
      ai_field_completion_enabled: true,
      preprocessing_enabled: true,
      vendor_auto_learn_enabled: true,
      allowed_doc_types: ALL_DOC_TYPES,
      monthly_call_quota: 0,
      usage_logging_enabled: false,
    };
    _settingsCache.set(key, { value: defaults, expiry: now + SETTINGS_CACHE_TTL_MS });
    return defaults;
  }

  let doc = await this.findOne({ entity_id: entityId }).lean();
  if (!doc) {
    doc = (await this.create({ entity_id: entityId })).toObject();
  }
  _settingsCache.set(key, { value: doc, expiry: now + SETTINGS_CACHE_TTL_MS });
  return doc;
};

ocrSettingsSchema.statics.invalidateCache = function (entityId) {
  if (entityId) _settingsCache.delete(String(entityId));
  else _settingsCache.clear();
};

module.exports = mongoose.model('OcrSettings', ocrSettingsSchema);
