/**
 * copilotService.js — Phase G7.2 (President's Copilot chat runtime)
 *
 * One generic /chat endpoint. The runtime:
 *   1) Loads PRESIDENT_COPILOT lookup row (system prompt, model, role gate, rate limit, max turns).
 *   2) Loads enabled COPILOT_TOOLS rows for entity, builds Claude `tools` array from each row's
 *      json_schema. Filters by user role (allowed_roles) and tool type (read vs write_confirm).
 *   3) Calls Claude with system + tools + messages.
 *   4) On stop_reason='tool_use', looks up the handler in copilotToolRegistry, validates per-tool
 *      role + per-tool rate limit + per-tool entity scoping, runs the handler in 'preview' mode,
 *      appends the tool_result, recurses (up to max_chat_turns).
 *   5) Returns final assistant message, plus any pending confirmation_payload(s) for the UI.
 *
 * /execute is a separate endpoint (in copilotController) that takes a confirmation_payload from a
 * write_confirm tool, re-loads the tool, validates role + rate limit + entity again, and runs the
 * handler in 'execute' mode.
 *
 * Rule #20: write_confirm execute paths route through existing controllers/services
 * (see draftRejectionReason / draftMessage in copilotToolRegistry). Never re-implements
 * gateApproval or periodLockCheck.
 *
 * Rule #21: ctx.entityId comes from req.entityId (middleware). Tools NEVER accept entity_id
 * in their args.
 *
 * Rule #3: tools, prompts, role gates, rate limits, model — all from lookup rows, zero
 * hardcoded business config.
 */
'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const Lookup = require('../models/Lookup');
const AiUsageLog = require('../models/AiUsageLog');
const ErpAuditLog = require('../models/ErpAuditLog');
const { getHandler } = require('./copilotToolRegistry');
const { checkSpendCap, enforceSpendCap } = require('./spendCapService');
const { estimateCost } = require('../../agents/claudeClient');

const COPILOT_FEATURE_CODE = 'PRESIDENT_COPILOT';
const DEFAULT_MAX_TURNS = 8;
const HARD_MAX_TURNS = 12;

let _client = null;
function getClient() {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      const e = new Error('ANTHROPIC_API_KEY not configured');
      e.status = 503;
      throw e;
    }
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

function makeErr(status, message, extra = {}) {
  const e = new Error(message);
  e.status = status;
  Object.assign(e, extra);
  return e;
}

function isPrivileged(role) {
  return ['president', 'ceo', 'admin', 'finance'].includes(String(role || '').toLowerCase());
}

function roleAllowed(userRole, allowedRoles) {
  if (!Array.isArray(allowedRoles) || allowedRoles.length === 0) return true;
  if (['president', 'ceo'].includes(String(userRole || '').toLowerCase())) return true;
  return allowedRoles.map((r) => String(r).toLowerCase()).includes(String(userRole || '').toLowerCase());
}

// ── Lazy-seed helper (mirrors approvalAiService) ──
async function lazySeedLookup(entityId, category) {
  try {
    const { SEED_DEFAULTS } = require('../controllers/lookupGenericController');
    const seeds = SEED_DEFAULTS?.[category] || [];
    if (!seeds.length) return;
    const ops = seeds.map((item, i) => ({
      updateOne: {
        filter: { entity_id: entityId, category, code: item.code.toUpperCase() },
        update: {
          $setOnInsert: {
            label: item.label,
            sort_order: i * 10,
            is_active: category === 'COPILOT_TOOLS' ? true : false, // tools default ON; PRESIDENT_COPILOT row defaults OFF
            metadata: item.metadata || {},
          },
        },
        upsert: true,
      },
    }));
    await Lookup.bulkWrite(ops);
  } catch (e) {
    console.error(`[copilotService] lazy-seed ${category} failed:`, e.message);
  }
}

async function loadCopilotFeatureRow(entityId) {
  let row = await Lookup.findOne({
    entity_id: entityId,
    category: 'AI_COWORK_FEATURES',
    code: COPILOT_FEATURE_CODE,
    is_active: true,
  }).lean();
  if (!row) {
    await lazySeedLookup(entityId, 'AI_COWORK_FEATURES');
    row = await Lookup.findOne({
      entity_id: entityId,
      category: 'AI_COWORK_FEATURES',
      code: COPILOT_FEATURE_CODE,
      is_active: true,
    }).lean();
  }
  return row || null;
}

async function loadEnabledToolsForUser(entityId, user) {
  let rows = await Lookup.find({
    entity_id: entityId,
    category: 'COPILOT_TOOLS',
    is_active: true,
  }).sort({ sort_order: 1 }).lean();

  if (!rows.length) {
    await lazySeedLookup(entityId, 'COPILOT_TOOLS');
    rows = await Lookup.find({
      entity_id: entityId,
      category: 'COPILOT_TOOLS',
      is_active: true,
    }).sort({ sort_order: 1 }).lean();
  }

  // Filter by user role + handler must be registered (defence-in-depth)
  return rows
    .filter((r) => roleAllowed(user.role, r.metadata?.allowed_roles))
    .filter((r) => !!getHandler(r.metadata?.handler_key));
}

function buildToolsArrayForClaude(toolRows) {
  return toolRows.map((row) => {
    const md = row.metadata || {};
    const schema = md.json_schema || {};
    return {
      name: schema.name || row.code.toLowerCase(),
      description: [md.description_for_claude, schema.description].filter(Boolean).join(' — '),
      input_schema: schema.input_schema || { type: 'object', properties: {} },
    };
  });
}

// Per-tool, per-user rate limit (uses AiUsageLog with feature_code=`copilot:<tool_code>`)
async function checkToolRateLimit(userId, toolCode, perMinLimit) {
  if (!perMinLimit || perMinLimit <= 0) return;
  const recent = await AiUsageLog.countRecentByUser(userId, `copilot:${toolCode}`, 60);
  if (recent >= perMinLimit) {
    throw makeErr(429, `Rate limit exceeded for tool ${toolCode}: ${perMinLimit}/min`);
  }
}

async function logToolCall({ entityId, userId, toolRow, args, result, durationMs, success, error }) {
  const truncatedArgs = JSON.stringify(args || {}).slice(0, 1000);
  const summary = result?.display
    ? String(result.display).slice(0, 280)
    : (success ? 'OK' : (error || 'failed'));
  // ErpAuditLog (for human audit)
  try {
    await ErpAuditLog.create({
      entity_id: entityId,
      bdm_id: userId,
      log_type: 'COPILOT_TOOL_CALL',
      target_ref: toolRow.code,
      target_model: 'CopilotTool',
      field_changed: toolRow.metadata?.handler_key,
      old_value: '',
      new_value: summary,
      changed_by: userId,
      note: `args=${truncatedArgs}; ${durationMs}ms`,
    });
  } catch (e) {
    console.error('[copilotService] ErpAuditLog write failed:', e.message);
  }
  // AiUsageLog (for spend + rate-limit accounting; cost on Claude turns is logged separately)
  try {
    await AiUsageLog.create({
      entity_id: entityId,
      user_id: userId,
      feature_code: `copilot:${toolRow.code}`,
      success: !!success,
      error_message: error ? String(error).slice(0, 500) : null,
      latency_ms: durationMs,
      context: { handler_key: toolRow.metadata?.handler_key, tool_type: toolRow.metadata?.tool_type, args_summary: truncatedArgs.slice(0, 200) },
    });
  } catch (e) {
    console.error('[copilotService] AiUsageLog write failed:', e.message);
  }
}

/**
 * Main chat loop.
 *
 * @param {Object} input
 * @param {ObjectId} input.entityId
 * @param {Object}   input.user             - req.user
 * @param {Array<ObjectId>} [input.entityIds] - multi-entity scope (for COMPARE_ENTITIES)
 * @param {Array}    input.messages         - Claude message array [{role:'user'|'assistant', content}]
 * @param {string}   [input.mode]           - 'normal' | 'quick' (Cmd+K)
 *
 * @returns {{
 *   reply: string,                                   // final assistant text
 *   tool_calls: Array<{tool_code, args, display, confirmation_payload?}>,
 *   pending_confirmations: Array<confirmation_payload>,
 *   usage: { input_tokens, output_tokens, cost_usd },
 *   turns: number,
 *   spend_warning?: 'NEAR_CAP',
 * }}
 */
async function runChat({ entityId, user, entityIds = [], messages = [], mode = 'normal' }) {
  const startedAt = Date.now();
  if (!entityId) throw makeErr(400, 'Entity context required for Copilot');
  if (!Array.isArray(messages) || messages.length === 0) throw makeErr(400, 'messages required');

  // 1) Feature row (Copilot enabled?)
  const featureRow = await loadCopilotFeatureRow(entityId);
  if (!featureRow) throw makeErr(404, 'Copilot is not enabled for this entity. Enable PRESIDENT_COPILOT in AI Cowork.');
  if (!roleAllowed(user.role, featureRow.metadata?.allowed_roles)) {
    throw makeErr(403, `Role '${user.role}' not allowed for the Copilot`);
  }

  // 2) Per-feature rate limit
  const featureMd = featureRow.metadata || {};
  const featureRate = Number(featureMd.rate_limit_per_min || 0);
  if (featureRate > 0) {
    const recent = await AiUsageLog.countRecentByUser(user._id, COPILOT_FEATURE_CODE, 60);
    if (recent >= featureRate) throw makeErr(429, `Copilot rate limit exceeded (${featureRate}/min)`);
  }

  // 3) Spend cap (G7.8)
  const capDecision = await enforceSpendCap(entityId, COPILOT_FEATURE_CODE);

  // 4) Load enabled tools for this user
  const toolRows = await loadEnabledToolsForUser(entityId, user);
  const claudeTools = buildToolsArrayForClaude(toolRows);

  // 5) System prompt — append quick-mode addendum if requested
  let system = featureMd.system_prompt || '';
  if (mode === 'quick' && featureMd.quick_mode_prompt) {
    system = `${system}\n\n${featureMd.quick_mode_prompt}`;
  }

  const model = featureMd.model || 'claude-sonnet-4-6';
  const maxTokens = Number(featureMd.max_tokens || 1200);
  const temperature = Number(featureMd.temperature ?? 0.3);
  const maxTurns = Math.min(Number(featureMd.max_chat_turns || DEFAULT_MAX_TURNS), HARD_MAX_TURNS);

  // 6) Build initial conversation. Defensive copy.
  const conv = messages.map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: typeof m.content === 'string' ? m.content : m.content,
  }));

  const ctx = {
    user, entityId, entityIds: entityIds && entityIds.length ? entityIds : [entityId], mode: 'preview',
  };

  const toolCallsAccum = [];
  const pendingConfirmations = [];
  let totalInputTokens = 0, totalOutputTokens = 0, totalCost = 0;
  let finalText = '';
  let turns = 0;
  let stopReason = '';

  const client = getClient();

  for (turns = 0; turns < maxTurns; turns++) {
    let response;
    try {
      response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        system: system || undefined,
        tools: claudeTools.length ? claudeTools : undefined,
        messages: conv,
      });
    } catch (err) {
      // Log the failure once and rethrow as a structured error
      try {
        await AiUsageLog.create({
          entity_id: entityId, user_id: user._id, feature_code: COPILOT_FEATURE_CODE,
          model, success: false,
          error_message: (err.message || 'unknown').slice(0, 500),
          latency_ms: Date.now() - startedAt,
        });
      } catch { /* swallow */ }
      throw makeErr(err.status || 502, `Copilot Claude call failed: ${err.message}`);
    }

    const usage = response.usage || {};
    totalInputTokens += usage.input_tokens || 0;
    totalOutputTokens += usage.output_tokens || 0;
    totalCost += estimateCost(model, usage.input_tokens || 0, usage.output_tokens || 0);

    stopReason = response.stop_reason || '';

    // Append assistant message verbatim so Claude sees its own tool_use blocks on the next turn.
    conv.push({ role: 'assistant', content: response.content });

    // Extract any text and tool_use blocks
    const textBlocks = (response.content || []).filter((b) => b.type === 'text').map((b) => b.text);
    const toolUses = (response.content || []).filter((b) => b.type === 'tool_use');

    if (textBlocks.length) finalText = textBlocks.join('\n').trim();

    if (stopReason !== 'tool_use' || toolUses.length === 0) break;

    // 7) Run each tool_use, append tool_result blocks for the next iteration
    const toolResultBlocks = [];
    for (const tu of toolUses) {
      const toolRow = toolRows.find((r) => (r.metadata?.json_schema?.name || r.code.toLowerCase()) === tu.name);
      if (!toolRow) {
        toolResultBlocks.push({
          type: 'tool_result', tool_use_id: tu.id, is_error: true,
          content: `Tool '${tu.name}' is not enabled for your entity or role.`,
        });
        continue;
      }
      const handler = getHandler(toolRow.metadata?.handler_key);
      if (!handler) {
        toolResultBlocks.push({
          type: 'tool_result', tool_use_id: tu.id, is_error: true,
          content: `Tool '${toolRow.code}' has no registered handler.`,
        });
        continue;
      }
      // Per-tool role + rate-limit
      try {
        if (!roleAllowed(user.role, toolRow.metadata?.allowed_roles)) {
          throw makeErr(403, `Role '${user.role}' not allowed for tool ${toolRow.code}`);
        }
        await checkToolRateLimit(user._id, toolRow.code, toolRow.metadata?.rate_limit_per_min);
      } catch (e) {
        toolResultBlocks.push({
          type: 'tool_result', tool_use_id: tu.id, is_error: true, content: e.message,
        });
        await logToolCall({
          entityId, userId: user._id, toolRow, args: tu.input,
          result: null, durationMs: 0, success: false, error: e.message,
        });
        continue;
      }

      // Execute handler in preview mode
      const tStart = Date.now();
      try {
        const out = await handler({ ...ctx, mode: 'preview' }, tu.input || {});
        const display = out?.display || '';
        toolCallsAccum.push({
          tool_code: toolRow.code,
          args: tu.input || {},
          result_summary: display,
          confirmation_payload: out?.result?.confirmation_payload || null,
        });
        if (toolRow.metadata?.tool_type === 'write_confirm' && out?.result?.confirmation_payload) {
          pendingConfirmations.push({
            tool_code: toolRow.code,
            confirmation_payload: out.result.confirmation_payload,
            confirmation_text: out.result.confirmation_text || display,
          });
        }
        toolResultBlocks.push({
          type: 'tool_result', tool_use_id: tu.id,
          content: JSON.stringify(out?.result || {}).slice(0, 8000),
        });
        await logToolCall({
          entityId, userId: user._id, toolRow, args: tu.input,
          result: out, durationMs: Date.now() - tStart, success: true,
        });
      } catch (err) {
        toolResultBlocks.push({
          type: 'tool_result', tool_use_id: tu.id, is_error: true,
          content: `Tool error: ${err.message}`.slice(0, 1000),
        });
        await logToolCall({
          entityId, userId: user._id, toolRow, args: tu.input,
          result: null, durationMs: Date.now() - tStart, success: false, error: err.message,
        });
      }
    }

    conv.push({ role: 'user', content: toolResultBlocks });
    // loop continues for the next assistant turn
  }

  // 8) Log token usage / cost for the chat as a whole
  try {
    await AiUsageLog.create({
      entity_id: entityId,
      user_id: user._id,
      feature_code: COPILOT_FEATURE_CODE,
      model,
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
      cost_usd: totalCost,
      latency_ms: Date.now() - startedAt,
      success: true,
      context: { turns, mode, tool_calls: toolCallsAccum.length },
    });
  } catch (e) {
    console.error('[copilotService] AiUsageLog write failed:', e.message);
  }

  return {
    reply: finalText || '(no reply)',
    tool_calls: toolCallsAccum,
    pending_confirmations: pendingConfirmations,
    usage: { input_tokens: totalInputTokens, output_tokens: totalOutputTokens, cost_usd: Number(totalCost.toFixed(6)) },
    turns,
    stop_reason: stopReason,
    spend_warning: capDecision?.warning || undefined,
  };
}

/**
 * Execute a confirmed write_confirm action.
 *
 * @param {Object} input
 * @param {ObjectId} input.entityId
 * @param {Object}   input.user
 * @param {Array<ObjectId>} [input.entityIds]
 * @param {Object}   input.confirmation_payload   - returned by a write_confirm handler in preview mode
 * @returns {{ ok, result, display }}
 */
async function executeConfirmation({ entityId, user, entityIds = [], confirmation_payload }) {
  if (!entityId) throw makeErr(400, 'Entity context required');
  const payload = confirmation_payload || {};
  const toolCode = String(payload.tool_code || '').toUpperCase();
  if (!toolCode) throw makeErr(400, 'tool_code required in confirmation_payload');

  // Re-load tool row + verify still enabled + role still allowed
  const toolRow = await Lookup.findOne({
    entity_id: entityId,
    category: 'COPILOT_TOOLS',
    code: toolCode,
    is_active: true,
  }).lean();
  if (!toolRow) throw makeErr(404, `Tool '${toolCode}' is not enabled`);
  if (!roleAllowed(user.role, toolRow.metadata?.allowed_roles)) {
    throw makeErr(403, `Role '${user.role}' not allowed for tool ${toolCode}`);
  }
  if (toolRow.metadata?.tool_type !== 'write_confirm') {
    throw makeErr(400, `Tool '${toolCode}' is not a write_confirm tool`);
  }
  await checkToolRateLimit(user._id, toolCode, toolRow.metadata?.rate_limit_per_min);

  // Spend cap (re-check at execute time to honor any changes since chat turn)
  await enforceSpendCap(entityId, COPILOT_FEATURE_CODE);

  const handler = getHandler(toolRow.metadata?.handler_key);
  if (!handler) throw makeErr(500, `No handler for tool '${toolCode}'`);

  const ctx = {
    user, entityId, entityIds: entityIds && entityIds.length ? entityIds : [entityId], mode: 'execute',
  };
  // Strip tool_code key — handler receives the original args
  const { tool_code: _omit, ...args } = payload;
  void _omit;

  const tStart = Date.now();
  let out;
  try {
    out = await handler(ctx, args);
  } catch (err) {
    await logToolCall({
      entityId, userId: user._id, toolRow, args,
      result: null, durationMs: Date.now() - tStart, success: false, error: err.message,
    });
    throw makeErr(err.status || 500, `Tool execute failed: ${err.message}`);
  }

  await logToolCall({
    entityId, userId: user._id, toolRow, args,
    result: out, durationMs: Date.now() - tStart, success: true,
  });

  return { ok: true, tool_code: toolCode, result: out?.result || {}, display: out?.display || '' };
}

module.exports = {
  runChat,
  executeConfirmation,
  // exported for the daily briefing agent + verifyCopilotWiring
  _internal: { loadCopilotFeatureRow, loadEnabledToolsForUser, buildToolsArrayForClaude, COPILOT_FEATURE_CODE },
};
