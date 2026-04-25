/**
 * OCR Settings Controller — Phase H3
 *
 * Per-entity OCR governance: feature flags, allowed document types, monthly
 * call quota, and usage analytics. Subscription-ready — admins/finance/
 * president can configure per-entity without code changes.
 */
const { catchAsync, ApiError } = require('../../middleware/errorHandler');
const OcrSettings = require('../models/OcrSettings');
const OcrUsageLog = require('../models/OcrUsageLog');

const requireEntity = (req) => {
  if (!req.entityId) throw new ApiError(400, 'Entity context required. President must select a working entity first.');
  return req.entityId;
};

// GET /api/erp/ocr-settings
exports.getSettings = catchAsync(async (req, res) => {
  const entityId = requireEntity(req);
  const settings = await OcrSettings.getForEntity(entityId);
  res.json({
    success: true,
    data: {
      ...settings,
      all_doc_types: OcrSettings.ALL_DOC_TYPES,
    },
  });
});

// PUT /api/erp/ocr-settings
exports.updateSettings = catchAsync(async (req, res) => {
  const entityId = requireEntity(req);
  const allowed = [
    'enabled',
    'ai_fallback_enabled',
    'ai_field_completion_enabled',
    'preprocessing_enabled',
    'vendor_auto_learn_enabled',
    'allowed_doc_types',
    'monthly_call_quota',
    'usage_logging_enabled',
  ];
  const updates = {};
  for (const key of allowed) if (req.body[key] !== undefined) updates[key] = req.body[key];

  // Validate allowed_doc_types members
  if (updates.allowed_doc_types) {
    const valid = new Set(OcrSettings.ALL_DOC_TYPES);
    const bad = updates.allowed_doc_types.filter(t => !valid.has(t));
    if (bad.length) throw new ApiError(400, `Invalid doc types: ${bad.join(', ')}`);
  }
  if (updates.monthly_call_quota !== undefined && updates.monthly_call_quota < 0) {
    throw new ApiError(400, 'monthly_call_quota cannot be negative');
  }

  updates.updated_by = req.user?._id;
  const doc = await OcrSettings.findOneAndUpdate(
    { entity_id: entityId },
    { $set: updates },
    { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
  ).lean();

  // Bust the per-entity settings cache so next OCR call picks up new flags immediately
  OcrSettings.invalidateCache(entityId);

  res.json({ success: true, data: doc, message: 'OCR settings updated.' });
});

// GET /api/erp/ocr-settings/usage?from=YYYY-MM-DD&to=YYYY-MM-DD&group_by=doc_type
exports.getUsage = catchAsync(async (req, res) => {
  const entityId = requireEntity(req);
  const fromStr = req.query.from;
  const toStr = req.query.to;
  const groupBy = req.query.group_by || 'doc_type';

  const match = { entity_id: entityId };
  if (fromStr || toStr) {
    match.timestamp = {};
    if (fromStr) match.timestamp.$gte = new Date(fromStr);
    if (toStr) {
      const end = new Date(toStr);
      end.setHours(23, 59, 59, 999);
      match.timestamp.$lte = end;
    }
  }

  const groupField = groupBy === 'user_id' ? '$user_id'
                   : groupBy === 'skipped_reason' ? '$skipped_reason'
                   : '$doc_type';

  // eslint-disable-next-line vip-tenant/require-entity-filter -- $match: match var built with entity_id at L76; rule requires inline ObjectExpression in $match
  const rows = await OcrUsageLog.aggregate([
    { $match: match },
    {
      $group: {
        _id: groupField,
        total_calls: { $sum: 1 },
        successful: { $sum: { $cond: ['$success', 1, 0] } },
        vision_calls: { $sum: { $cond: ['$vision_called', 1, 0] } },
        ai_fallback_calls: { $sum: { $cond: ['$ai_fallback_called', 1, 0] } },
        vendor_auto_learned: { $sum: { $cond: ['$vendor_auto_learned', 1, 0] } },
        skipped: { $sum: { $cond: [{ $ne: ['$skipped_reason', 'NONE'] }, 1, 0] } },
        avg_latency_ms: { $avg: '$latency_ms' },
      }
    },
    { $sort: { total_calls: -1 } },
  ]);

  const monthlyCount = await OcrUsageLog.countMonthlyForEntity(entityId);
  const settings = await OcrSettings.getForEntity(entityId);

  // Phase H5 — summary counters for vendor auto-learn telemetry
  // eslint-disable-next-line vip-tenant/require-entity-filter -- $match: match var built with entity_id at L76; rule requires inline ObjectExpression in $match
  const learnAgg = await OcrUsageLog.aggregate([
    { $match: match },
    { $group: { _id: '$vendor_auto_learn_action', count: { $sum: 1 } } },
  ]);
  const auto_learn = learnAgg.reduce((acc, r) => ({ ...acc, [r._id || 'NONE']: r.count }), {});

  res.json({
    success: true,
    data: {
      group_by: groupBy,
      rows,
      current_month: {
        vision_calls: monthlyCount,
        quota: settings.monthly_call_quota || 0,
        remaining: settings.monthly_call_quota > 0 ? Math.max(0, settings.monthly_call_quota - monthlyCount) : null,
      },
      auto_learn,
    },
  });
});

// GET /api/erp/ocr-settings/usage/recent?limit=50 — recent calls log (audit trail)
exports.getRecentUsage = catchAsync(async (req, res) => {
  const entityId = requireEntity(req);
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 500);
  const rows = await OcrUsageLog.find({ entity_id: entityId })
    .sort({ timestamp: -1 })
    .limit(limit)
    .populate('user_id', 'name email')
    .lean();
  res.json({ success: true, data: rows });
});
