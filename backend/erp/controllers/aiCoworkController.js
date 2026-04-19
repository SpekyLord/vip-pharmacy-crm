/**
 * aiCoworkController.js — Phase G6.10 endpoints
 *
 * Three thin endpoints:
 *   POST /api/erp/ai-cowork/:code/invoke   — generic AI call gated by lookup config
 *   GET  /api/erp/ai-cowork/features       — list active features for current entity (UI uses this to show buttons)
 *   GET  /api/erp/ai-cowork/usage          — recent usage rows for current entity (admin dashboard)
 *
 * The hard logic lives in approvalAiService. This file only does request validation,
 * response shaping, and audit-friendly errors.
 */
'use strict';

const { catchAsync } = require('../../middleware/errorHandler');
const { invokeAiCoworkFeature } = require('../services/approvalAiService');
const Lookup = require('../models/Lookup');
const AiUsageLog = require('../models/AiUsageLog');

// POST /api/erp/ai-cowork/:code/invoke
exports.invoke = catchAsync(async (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  const context = req.body?.context || {};

  try {
    const result = await invokeAiCoworkFeature({
      entityId: req.entityId,
      user: req.user,
      code,
      context,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: err.message || 'AI cowork invocation failed',
      feature_code: code,
    });
  }
});

// GET /api/erp/ai-cowork/features
// Returns active feature rows for the current entity. Frontend uses this to
// decide whether to show buttons in RejectionBanner / ApprovalManager.
exports.listFeatures = catchAsync(async (req, res) => {
  if (!req.entityId) return res.status(400).json({ success: false, message: 'Entity context required' });
  const items = await Lookup.find({
    entity_id: req.entityId,
    category: 'AI_COWORK_FEATURES',
    is_active: true,
  }).select('code label metadata').sort({ sort_order: 1, label: 1 }).lean();
  // Return only what the UI needs — DO NOT leak full system_prompt / user_template
  // to non-admin requesters. Admin/president see prompts via the management page
  // (lookup CRUD), which is gated separately.
  const isPrivileged = ['president', 'admin', 'finance', 'ceo'].includes(req.user.role);
  const sanitized = items.map((row) => {
    const md = row.metadata || {};
    return {
      code: row.code,
      label: row.label,
      metadata: {
        surface: md.surface,
        button_label: md.button_label,
        allowed_roles: md.allowed_roles,
        rate_limit_per_min: md.rate_limit_per_min,
        description: md.description,
        ...(isPrivileged ? {
          model: md.model,
          system_prompt: md.system_prompt,
          user_template: md.user_template,
          max_tokens: md.max_tokens,
          temperature: md.temperature,
          fallback_behavior: md.fallback_behavior,
        } : {}),
      },
    };
  });
  res.json({ success: true, data: sanitized });
});

// GET /api/erp/ai-cowork/usage?days=7
// Recent usage by feature_code — president/admin only.
exports.getUsage = catchAsync(async (req, res) => {
  if (!req.entityId) return res.status(400).json({ success: false, message: 'Entity context required' });
  const isPrivileged = ['president', 'admin', 'finance', 'ceo'].includes(req.user.role);
  if (!isPrivileged) return res.status(403).json({ success: false, message: 'Access denied' });

  const days = Math.min(parseInt(req.query.days, 10) || 30, 90);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const agg = await AiUsageLog.aggregate([
    { $match: { entity_id: req.entityId, timestamp: { $gte: since } } },
    {
      $group: {
        _id: '$feature_code',
        calls: { $sum: 1 },
        success_calls: { $sum: { $cond: ['$success', 1, 0] } },
        total_input: { $sum: '$input_tokens' },
        total_output: { $sum: '$output_tokens' },
        total_cost_usd: { $sum: '$cost_usd' },
        avg_latency_ms: { $avg: '$latency_ms' },
        last_call: { $max: '$timestamp' },
      },
    },
    { $sort: { total_cost_usd: -1 } },
  ]);

  res.json({ success: true, data: agg, since: since.toISOString(), days });
});
