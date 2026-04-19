/**
 * approvalAiService.js — Phase G6.10 (AI Cowork Assistant runtime)
 *
 * One generic endpoint backs every AI Cowork feature. Configuration lives in the
 * `AI_COWORK_FEATURES` lookup category — president manages prompts, model, role
 * gates, rate limits per-entity. Adding a new feature = one new lookup row, no
 * code change. Rule #3 compliant.
 *
 * Flow:
 *   1. Load lookup row by code (entity-scoped, lazy-seeded via getByCategory).
 *   2. Validate is_active, requester role in allowed_roles, per-user rate limit.
 *   3. Render user_template with caller-supplied {{context}} placeholders.
 *   4. Call Claude with system_prompt + model + temperature from the row.
 *   5. Log result to AiUsageLog with feature_code = row.code (cost attribution).
 *
 * Subscription-safe: fresh subsidiaries inherit nothing until president seeds.
 * Rule #20: this service touches NO ledger / period / approval state. It only
 * talks to Claude and logs. Side-effect-free for ERP data.
 */
'use strict';

const Lookup = require('../models/Lookup');
const AiUsageLog = require('../models/AiUsageLog');
const { askClaude } = require('../../agents/claudeClient');
const { checkSpendCap } = require('./spendCapService');

// ── Lookup loader (entity-scoped, lazy-seed via SEED_DEFAULTS auto-merge) ──
async function getCoworkFeature(entityId, code) {
  if (!entityId) throw makeErr(400, 'Entity context required for AI Cowork');
  if (!code) throw makeErr(400, 'AI feature code required');

  let row = await Lookup.findOne({
    entity_id: entityId,
    category: 'AI_COWORK_FEATURES',
    code: code.toUpperCase(),
    is_active: true,
  }).lean();

  if (!row) {
    // Try lazy-seed once: read all of category to trigger SEED_DEFAULTS merge,
    // then re-query. Mirrors the getByCategory auto-seed in lookupGenericController.
    try {
      const { SEED_DEFAULTS } = require('../controllers/lookupGenericController');
      const seeds = SEED_DEFAULTS?.AI_COWORK_FEATURES || [];
      if (seeds.length) {
        const ops = seeds.map((item, i) => ({
          updateOne: {
            filter: { entity_id: entityId, category: 'AI_COWORK_FEATURES', code: item.code.toUpperCase() },
            update: {
              $setOnInsert: {
                label: item.label,
                sort_order: i * 10,
                is_active: false, // SAFETY: default OFF — subscription opt-in
                metadata: item.metadata || {},
              },
            },
            upsert: true,
          },
        }));
        await Lookup.bulkWrite(ops);
        row = await Lookup.findOne({
          entity_id: entityId,
          category: 'AI_COWORK_FEATURES',
          code: code.toUpperCase(),
          is_active: true,
        }).lean();
      }
    } catch (seedErr) {
      console.error('[approvalAiService] lazy-seed failed:', seedErr.message);
    }
  }

  if (!row) throw makeErr(404, `AI feature '${code}' not enabled for this entity`);
  return row;
}

// ── Mustache-style {{var}} renderer (no runtime dep needed) ──
function renderTemplate(template, vars = {}) {
  if (!template) return '';
  return String(template).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const parts = key.split('.');
    let v = vars;
    for (const p of parts) v = v?.[p];
    if (v == null) return '';
    if (Array.isArray(v)) return v.map((x) => `- ${typeof x === 'string' ? x : JSON.stringify(x)}`).join('\n');
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  });
}

// ── Role gate ──
function isRoleAllowed(userRole, allowedRoles) {
  if (!Array.isArray(allowedRoles) || allowedRoles.length === 0) return true; // open
  // president/CEO bypass — they manage the feature, they can always test it
  if (['president', 'ceo'].includes(userRole)) return true;
  return allowedRoles.map((r) => String(r).toLowerCase()).includes(String(userRole).toLowerCase());
}

// ── Rate limit (per user, per feature, per minute) ──
async function checkRateLimit(userId, featureCode, perMinLimit) {
  if (!perMinLimit || perMinLimit <= 0) return; // disabled
  const recent = await AiUsageLog.countRecentByUser(userId, featureCode, 60);
  if (recent >= perMinLimit) {
    throw makeErr(429, `Rate limit exceeded: ${perMinLimit} calls/min for ${featureCode}`);
  }
}

function makeErr(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

/**
 * Public entry point — invoke an AI Cowork feature.
 *
 * @param {Object} args
 * @param {ObjectId} args.entityId - req.entityId
 * @param {Object}   args.user     - req.user (with _id, role)
 * @param {string}   args.code     - AI_COWORK_FEATURES.code
 * @param {Object}   args.context  - placeholder values for user_template
 * @returns {{ text, usage, cost, feature_code, model, latency_ms }}
 */
async function invokeAiCoworkFeature({ entityId, user, code, context = {} }) {
  const startedAt = Date.now();
  const userId = user._id;
  const userRole = user.role;

  // 1) Load lookup row (or 404)
  const row = await getCoworkFeature(entityId, code);
  const md = row.metadata || {};

  // 2) Role gate
  if (!isRoleAllowed(userRole, md.allowed_roles)) {
    await AiUsageLog.create({
      entity_id: entityId, user_id: userId, feature_code: row.code,
      success: false, skipped_reason: 'ROLE_DENIED',
      latency_ms: Date.now() - startedAt,
    });
    throw makeErr(403, `Role '${userRole}' not allowed for AI feature '${row.code}'`);
  }

  // 3) Rate limit
  try {
    await checkRateLimit(userId, row.code, md.rate_limit_per_min);
  } catch (e) {
    await AiUsageLog.create({
      entity_id: entityId, user_id: userId, feature_code: row.code,
      success: false, skipped_reason: 'RATE_LIMITED',
      error_message: e.message, latency_ms: Date.now() - startedAt,
    });
    throw e;
  }

  // 4a) Spend cap (Phase G7.8) — block if entity is over its monthly budget
  try {
    const decision = await checkSpendCap(entityId, row.code);
    if (!decision.allowed) {
      await AiUsageLog.create({
        entity_id: entityId, user_id: userId, feature_code: row.code,
        success: false, skipped_reason: 'SPEND_CAP_EXCEEDED',
        error_message: decision.message, latency_ms: Date.now() - startedAt,
      });
      throw makeErr(429, decision.message);
    }
  } catch (e) {
    if (e.status === 429) throw e;
    // Cap evaluation failed (e.g. lookup query error) — do NOT block; log + proceed.
    console.error('[approvalAiService] spend cap check failed (allowing call):', e.message);
  }

  // 4b) API key present?
  if (!process.env.ANTHROPIC_API_KEY) {
    await AiUsageLog.create({
      entity_id: entityId, user_id: userId, feature_code: row.code,
      success: false, skipped_reason: 'NO_API_KEY',
      latency_ms: Date.now() - startedAt,
    });
    throw makeErr(503, 'Anthropic API key not configured');
  }

  // 5) Render templates
  const systemPrompt = renderTemplate(md.system_prompt || '', context);
  const userPrompt = renderTemplate(md.user_template || '', context);
  if (!userPrompt.trim()) {
    throw makeErr(400, `AI feature '${row.code}' user_template is empty after rendering`);
  }

  // 6) Call Claude
  let result;
  try {
    result = await askClaude({
      system: systemPrompt,
      prompt: userPrompt,
      model: md.model || 'claude-haiku-4-5-20251001',
      maxTokens: md.max_tokens || 600,
      agent: `cowork:${row.code}`,
    });
  } catch (err) {
    await AiUsageLog.create({
      entity_id: entityId, user_id: userId, feature_code: row.code,
      model: md.model, success: false,
      error_message: err.message?.slice(0, 500) || 'unknown',
      latency_ms: Date.now() - startedAt,
    });
    throw makeErr(err.status || 502, `AI call failed: ${err.message}`);
  }

  const latencyMs = Date.now() - startedAt;

  // 7) Log success
  await AiUsageLog.create({
    entity_id: entityId,
    user_id: userId,
    feature_code: row.code,
    model: md.model || result.model || '',
    input_tokens: result.usage?.input_tokens || 0,
    output_tokens: result.usage?.output_tokens || 0,
    cost_usd: result.cost || 0,
    latency_ms: latencyMs,
    success: true,
    context: {
      // Only store small refs to avoid bloating the log
      doc_ref: context.doc_ref,
      module: context.module,
    },
  });

  return {
    text: result.text,
    usage: result.usage,
    cost: result.cost,
    feature_code: row.code,
    model: md.model,
    latency_ms: latencyMs,
  };
}

module.exports = {
  invokeAiCoworkFeature,
  // exported for tests
  _internal: { renderTemplate, isRoleAllowed, getCoworkFeature },
};
