/**
 * copilotController.js — Phase G7.2
 *
 * Thin endpoints over copilotService:
 *   POST /api/erp/copilot/chat       { messages, mode? }
 *   POST /api/erp/copilot/execute    { confirmation_payload }
 *   GET  /api/erp/copilot/status      — feature row + enabled tools + spend snapshot for the widget
 *
 * Parent router runs `protect` + `tenantFilter` (see erp/routes/index.js) so
 * req.user + req.entityId are guaranteed present.
 */
'use strict';

const { catchAsync } = require('../../middleware/errorHandler');
const { runChat, executeConfirmation, _internal } = require('../services/copilotService');
const { checkSpendCap } = require('../services/spendCapService');
const Lookup = require('../models/Lookup');
const AiUsageLog = require('../models/AiUsageLog');

// POST /chat
exports.chat = catchAsync(async (req, res) => {
  const { messages, mode = 'normal' } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ success: false, message: 'messages array required' });
  }
  const entityIds = req.user?.entity_ids || (req.user?.entity_id ? [req.user.entity_id] : []);
  try {
    const out = await runChat({
      entityId: req.entityId,
      user: req.user,
      entityIds,
      messages,
      mode: mode === 'quick' ? 'quick' : 'normal',
    });
    return res.json({ success: true, data: out });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({
      success: false,
      message: err.message || 'Copilot call failed',
      reason: err.reason,
    });
  }
});

// POST /execute
exports.execute = catchAsync(async (req, res) => {
  const { confirmation_payload } = req.body || {};
  if (!confirmation_payload || typeof confirmation_payload !== 'object') {
    return res.status(400).json({ success: false, message: 'confirmation_payload required' });
  }
  const entityIds = req.user?.entity_ids || (req.user?.entity_id ? [req.user.entity_id] : []);
  try {
    const out = await executeConfirmation({
      entityId: req.entityId,
      user: req.user,
      entityIds,
      confirmation_payload,
    });
    return res.json({ success: true, data: out });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ success: false, message: err.message || 'Execute failed' });
  }
});

// GET /status — returns visibility snapshot the widget uses to decide whether
// to render itself + which tools are enabled + current monthly spend.
exports.status = catchAsync(async (req, res) => {
  if (!req.entityId) return res.status(400).json({ success: false, message: 'Entity context required' });

  const featureRow = await Lookup.findOne({
    entity_id: req.entityId,
    category: 'AI_COWORK_FEATURES',
    code: _internal.COPILOT_FEATURE_CODE,
  }).select('code label is_active metadata').lean();

  const toolRows = await Lookup.find({
    entity_id: req.entityId,
    category: 'COPILOT_TOOLS',
    is_active: true,
  }).select('code label metadata').sort({ sort_order: 1 }).lean();

  const isPrivileged = ['president', 'admin', 'finance', 'ceo'].includes(req.user.role);
  const spend = isPrivileged ? await checkSpendCap(req.entityId, _internal.COPILOT_FEATURE_CODE) : null;

  // Sanitize: non-privileged users do NOT see system_prompt
  const featureSafe = featureRow ? {
    code: featureRow.code,
    label: featureRow.label,
    is_active: !!featureRow.is_active,
    metadata: {
      surface: featureRow.metadata?.surface,
      button_label: featureRow.metadata?.button_label,
      allowed_roles: featureRow.metadata?.allowed_roles,
      rate_limit_per_min: featureRow.metadata?.rate_limit_per_min,
      max_chat_turns: featureRow.metadata?.max_chat_turns,
      ...(isPrivileged ? {
        model: featureRow.metadata?.model,
        system_prompt: featureRow.metadata?.system_prompt,
        quick_mode_prompt: featureRow.metadata?.quick_mode_prompt,
      } : {}),
    },
  } : null;

  // Determine if the widget should render for THIS user
  const allowedRoles = featureRow?.metadata?.allowed_roles || [];
  const widgetEnabled = !!featureRow
    && featureRow.is_active
    && (
      allowedRoles.length === 0
      || ['president', 'ceo'].includes(req.user.role)
      || allowedRoles.map((r) => String(r).toLowerCase()).includes(String(req.user.role).toLowerCase())
    );

  res.json({
    success: true,
    data: {
      widget_enabled: widgetEnabled,
      feature: featureSafe,
      tools: toolRows.map((r) => ({
        code: r.code,
        label: r.label,
        tool_type: r.metadata?.tool_type,
        allowed_roles: r.metadata?.allowed_roles,
        description_for_claude: r.metadata?.description_for_claude,
      })),
      spend: spend && {
        spend_usd: spend.spend, cap_usd: spend.cap, pct: spend.pct,
        warning: spend.warning, scope: spend.scope, allowed: spend.allowed,
      },
    },
  });
});

// GET /usage?days=N — returns Copilot-specific usage (per-tool + per-day)
exports.usage = catchAsync(async (req, res) => {
  if (!req.entityId) return res.status(400).json({ success: false, message: 'Entity context required' });
  if (!['president', 'admin', 'finance', 'ceo'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }
  const days = Math.min(parseInt(req.query.days, 10) || 30, 90);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const agg = await AiUsageLog.aggregate([
    {
      $match: {
        entity_id: req.entityId,
        timestamp: { $gte: since },
        $or: [
          { feature_code: _internal.COPILOT_FEATURE_CODE },
          { feature_code: { $regex: '^copilot:' } },
        ],
      },
    },
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
