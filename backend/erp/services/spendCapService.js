/**
 * spendCapService.js — Phase G7.8
 *
 * Single chokepoint for "should this Claude call proceed". Called BEFORE the
 * actual Anthropic API call by:
 *   - approvalAiService.invokeAiCoworkFeature
 *   - copilotService.runChat
 *   - ocrController.processReceipt (best-effort if wired)
 *
 * Reads the AI_SPEND_CAPS lookup row (entity-scoped, lazy-seeded). If is_active
 * is false → no cap (no-op). If active and current-month spend ≥ cap → blocks.
 *
 * The result is cached for 60s per (entity_id, feature_code) to avoid hammering
 * Mongo on hot paths. Cache busts when the lookup row is updated (handled by
 * lookupGenericController.update via ai-cowork:invalidate side channel — to
 * implement properly we expose `invalidateSpendCapCache()` here).
 *
 * Subscription-safe: fresh subsidiaries inherit the seeded MONTHLY row with
 * is_active: false → cap is OFF until president opts in.
 *
 * Rule #20: this service does NOT touch ledger/period state. Pure read + decision.
 */
'use strict';

const Lookup = require('../models/Lookup');
const AiUsageLog = require('../models/AiUsageLog');

const CACHE_TTL_MS = 60 * 1000;
const _cache = new Map(); // key=`${entityId}:${featureCode}` → { ts, decision }

function makeErr(status, message, extra = {}) {
  const e = new Error(message);
  e.status = status;
  Object.assign(e, extra);
  return e;
}

function cacheKey(entityId, featureCode) {
  return `${String(entityId)}:${featureCode || '_all'}`;
}

function invalidateSpendCapCache(entityId = null) {
  if (!entityId) { _cache.clear(); return; }
  for (const k of _cache.keys()) {
    if (k.startsWith(`${entityId}:`)) _cache.delete(k);
  }
}

/**
 * Load the MONTHLY cap row for the entity. Lazy-seeds via SEED_DEFAULTS.
 * Returns null when no row exists or row is inactive (= no cap enforced).
 */
async function loadCapRow(entityId) {
  if (!entityId) return null;
  let row = await Lookup.findOne({
    entity_id: entityId,
    category: 'AI_SPEND_CAPS',
    code: 'MONTHLY',
  }).lean();

  if (!row) {
    // Lazy-seed once — same pattern as approvalAiService
    try {
      const { SEED_DEFAULTS } = require('../controllers/lookupGenericController');
      const seeds = SEED_DEFAULTS?.AI_SPEND_CAPS || [];
      if (seeds.length) {
        const ops = seeds.map((item, i) => ({
          updateOne: {
            filter: { entity_id: entityId, category: 'AI_SPEND_CAPS', code: item.code.toUpperCase() },
            update: {
              $setOnInsert: {
                label: item.label,
                sort_order: i * 10,
                is_active: false, // SAFETY: caps default OFF
                metadata: item.metadata || {},
              },
            },
            upsert: true,
          },
        }));
        await Lookup.bulkWrite(ops);
        row = await Lookup.findOne({
          entity_id: entityId,
          category: 'AI_SPEND_CAPS',
          code: 'MONTHLY',
        }).lean();
      }
    } catch (e) {
      console.error('[spendCapService] lazy-seed failed:', e.message);
    }
  }

  if (!row || !row.is_active) return null;
  return row;
}

/**
 * Compute monthly spend for the entity, optionally feature-scoped, with separate
 * OCR aggregation (kept in OcrUsageLog for legacy reasons).
 */
async function getCurrentMonthSpend(entityId, featureCode = null) {
  let total = await AiUsageLog.sumMonthlyCost(entityId, featureCode);
  // OCR usage may live in a separate collection (kept for back-compat). Add if available.
  if (!featureCode || featureCode === 'OCR') {
    try {
      const OcrUsageLog = require('../models/OcrUsageLog');
      const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
      const end = new Date(start); end.setMonth(end.getMonth() + 1);
      const agg = await OcrUsageLog.aggregate([
        { $match: { entity_id: entityId, timestamp: { $gte: start, $lt: end }, success: true } },
        { $group: { _id: null, total: { $sum: '$cost_usd' } } },
      ]);
      total += agg[0]?.total || 0;
    } catch {
      // OcrUsageLog model may not exist on every install — silently skip
    }
  }
  return Number((total || 0).toFixed(6));
}

/**
 * Evaluate whether a call should proceed. Returns:
 *   { allowed: true,  spend, cap, pct, warning?: 'NEAR_CAP' }
 *   { allowed: false, spend, cap, pct, reason: 'SPEND_CAP_EXCEEDED', message }
 *
 * `featureCode` lets callers ask both about per-feature overrides AND the global
 * cap — whichever is more restrictive wins.
 */
async function checkSpendCap(entityId, featureCode = null) {
  if (!entityId) return { allowed: true, spend: 0, cap: null, pct: 0 };

  const key = cacheKey(entityId, featureCode);
  const cached = _cache.get(key);
  if (cached && (Date.now() - cached.ts) < CACHE_TTL_MS) return cached.decision;

  const row = await loadCapRow(entityId);
  if (!row) {
    const decision = { allowed: true, spend: 0, cap: null, pct: 0 };
    _cache.set(key, { ts: Date.now(), decision });
    return decision;
  }

  const md = row.metadata || {};
  const overrides = md.feature_overrides || {};
  const featureOverride = featureCode ? overrides[featureCode] : null;

  // Whichever path applies first
  const applicable = [];
  applicable.push({
    scope: 'global',
    cap: Number(md.monthly_budget_usd || 0),
    notifyPct: Number(md.notify_at_pct || 80),
    action: md.action_when_reached || 'disable',
    spendKey: null,
  });
  if (featureOverride && Number(featureOverride.monthly_budget_usd) > 0) {
    applicable.push({
      scope: 'feature',
      cap: Number(featureOverride.monthly_budget_usd),
      notifyPct: Number(featureOverride.notify_at_pct || md.notify_at_pct || 80),
      action: featureOverride.action_when_reached || md.action_when_reached || 'disable',
      spendKey: featureCode,
    });
  }

  // Each applicable cap must pass independently
  let mostRestrictiveDecision = { allowed: true, spend: 0, cap: null, pct: 0 };
  for (const c of applicable) {
    if (!c.cap || c.cap <= 0) continue;
    const spend = await getCurrentMonthSpend(entityId, c.spendKey);
    const pct = c.cap > 0 ? Math.min(100, Math.round((spend / c.cap) * 100)) : 0;
    if (spend >= c.cap && c.action === 'disable') {
      const decision = {
        allowed: false,
        spend, cap: c.cap, pct,
        scope: c.scope,
        feature_code: featureCode,
        reason: 'SPEND_CAP_EXCEEDED',
        message: `Monthly AI spend cap reached for this entity (${c.scope === 'feature' ? `${featureCode} cap` : 'global cap'}: $${c.cap.toFixed(2)}). Increase the cap in Control Center → AI Budget.`,
      };
      _cache.set(key, { ts: Date.now(), decision });
      return decision;
    }
    // Track the most-utilized cap for the warning
    if (!mostRestrictiveDecision.cap || pct > mostRestrictiveDecision.pct) {
      mostRestrictiveDecision = {
        allowed: true,
        spend, cap: c.cap, pct,
        scope: c.scope,
        warning: pct >= c.notifyPct ? 'NEAR_CAP' : undefined,
      };
    }
  }

  _cache.set(key, { ts: Date.now(), decision: mostRestrictiveDecision });
  return mostRestrictiveDecision;
}

/**
 * Helper: throw a 429 if the cap is exceeded. Used inline by services that want
 * fail-fast semantics. Returns the decision so callers can attach warnings.
 */
async function enforceSpendCap(entityId, featureCode = null) {
  const decision = await checkSpendCap(entityId, featureCode);
  if (!decision.allowed) {
    throw makeErr(429, decision.message, {
      reason: decision.reason,
      spend: decision.spend,
      cap: decision.cap,
      pct: decision.pct,
    });
  }
  return decision;
}

module.exports = {
  checkSpendCap,
  enforceSpendCap,
  invalidateSpendCapCache,
  // exported for the AgentSettings AI Budget tab + verifyCopilotWiring
  _internal: { loadCapRow, getCurrentMonthSpend },
};
