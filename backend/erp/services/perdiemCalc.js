/**
 * Per Diem Calculator — MD count → tier → amount
 *
 * Threshold resolution (per-person override → per-role → global fallback):
 *   1. CompProfile.perdiem_engagement_threshold_full / _half (per-BDM override)
 *   2. PERDIEM_RATES.metadata.full_tier_threshold / half_tier_threshold (per-role, Phase G1.6)
 *   3. Settings.PERDIEM_MD_FULL / PERDIEM_MD_HALF (global defaults)
 *
 * Tier logic:
 *   ≥ fullThreshold MDs → FULL (100% per diem)
 *   ≥ halfThreshold MDs → HALF (50% per diem)
 *   below halfThreshold  → ZERO (0% per diem)
 *
 * Phase G1.6 — per-role layer lets non-pharma subscribers configure thresholds
 * per role without touching CompProfile or Settings globals. Example: a delivery
 * driver role with full_tier_threshold=1 (any worked day gets full per-diem)
 * without affecting the pharma BDM default of 8. Admin controls this via Control
 * Center → Lookup Tables → PERDIEM_RATES.{role}.metadata.
 *
 * Follows the revolving_fund_amount pattern:
 *   CompProfile value takes precedence; PERDIEM_RATES is the per-role layer;
 *   Settings is the global fallback. Unlike revolving fund (where 0 = use
 *   global), thresholds treat null/undefined as "defer to next layer" — 0 IS
 *   a valid value (means "always at least this tier, regardless of MD count").
 *
 * Phase G4.5ee (Apr 30 2026) — activity-aware tier rule. Lookup-driven
 * ACTIVITY_PERDIEM_RULES per-entity overrides the MD-threshold logic per
 * activity_type. Defaults: OFFICE → AUTO_FULL (admin/office staff get full
 * regardless of MD count), FIELD → USE_THRESHOLDS (current pharma logic),
 * NO_WORK → ZERO. tier_rule values: AUTO_FULL | AUTO_HALF | ZERO | USE_THRESHOLDS.
 * When omitted (no options arg passed), behavior is byte-identical to pre-G4.5ee.
 */

const TIER_MULTIPLIER = {
  FULL: 1.0,
  HALF: 0.5,
  ZERO: 0.0
};

// Phase G4.5ee — activity-aware tier rule resolver.
// Inline defaults are the seed baseline for ACTIVITY_PERDIEM_RULES so the
// resolver works on entities that have not yet been seeded (lazy first-use).
// Cache mirrors the resolveOwnerScope pattern (60s TTL, per-entity bust hook).
const ACTIVITY_PERDIEM_RULE_DEFAULTS = {
  OFFICE: 'AUTO_FULL',
  FIELD: 'USE_THRESHOLDS',
  OTHER: 'USE_THRESHOLDS',
  NO_WORK: 'ZERO',
};
const VALID_TIER_RULES = new Set(['AUTO_FULL', 'AUTO_HALF', 'ZERO', 'USE_THRESHOLDS']);
const ACTIVITY_RULE_CACHE_TTL_MS = 60_000;
const _activityRulesCache = new Map(); // entityId → { ts, rules: { CODE: tier_rule } }

/**
 * Resolve per diem thresholds from CompProfile → PERDIEM_RATES → Settings fallback.
 * null/undefined at any layer = defer to next layer. 0 is a valid override at any layer.
 * @param {Object} settings - ERP Settings document (global defaults)
 * @param {Object} [compProfile] - BDM's active CompProfile (optional, highest precedence)
 * @param {Object} [perdiemConfig] - Per-role config from resolvePerdiemConfig (Phase G1.6)
 * @returns {{ fullThreshold: Number, halfThreshold: Number, source: String }}
 */
function resolvePerdiemThresholds(settings, compProfile, perdiemConfig) {
  const globalFull = settings?.PERDIEM_MD_FULL ?? 8;
  const globalHalf = settings?.PERDIEM_MD_HALF ?? 3;

  // Phase G1.6 — per-role layer from PERDIEM_RATES.metadata. resolvePerdiemConfig
  // already coerces to Number | null, so undefined coercion is safe here.
  const roleFull = perdiemConfig?.full_tier_threshold;
  const roleHalf = perdiemConfig?.half_tier_threshold;

  const personFull = compProfile?.perdiem_engagement_threshold_full;
  const personHalf = compProfile?.perdiem_engagement_threshold_half;

  // Precedence: CompProfile > PERDIEM_RATES > Settings. null/undefined = defer.
  const fullThreshold = (personFull != null) ? personFull
    : (roleFull != null) ? roleFull
    : globalFull;
  const halfThreshold = (personHalf != null) ? personHalf
    : (roleHalf != null) ? roleHalf
    : globalHalf;

  let source = 'SETTINGS';
  if (personFull != null || personHalf != null) source = 'COMP_PROFILE';
  else if (roleFull != null || roleHalf != null) source = 'PERDIEM_RATES';

  return { fullThreshold, halfThreshold, source };
}

/**
 * Determine per diem tier from MD count
 * @param {Number} mdCount - Number of MDs covered that day
 * @param {Object} settings - ERP Settings document
 * @param {Object} [compProfile] - BDM's active CompProfile (optional)
 * @param {Object} [perdiemConfig] - Per-role config from resolvePerdiemConfig (Phase G1.6, optional)
 * @param {Object} [options] - Phase G4.5ee. options.activityRule ∈
 *   {AUTO_FULL, AUTO_HALF, ZERO, USE_THRESHOLDS}. If set to one of the AUTO_*
 *   or ZERO values, the activity rule wins and md_count + thresholds are
 *   ignored. USE_THRESHOLDS or unset → existing MD-threshold logic. Override
 *   paths (admin force-FULL/HALF) intentionally pass NO options, so override
 *   always wins over activity rule.
 * @returns {String} 'FULL' | 'HALF' | 'ZERO'
 */
function computePerdiemTier(mdCount, settings, compProfile, perdiemConfig, options = {}) {
  const activityRule = options && options.activityRule;
  if (activityRule === 'AUTO_FULL') return 'FULL';
  if (activityRule === 'AUTO_HALF') return 'HALF';
  if (activityRule === 'ZERO') return 'ZERO';
  // USE_THRESHOLDS or unset → existing logic (preserves byte-identical behavior
  // for every call site that has not been migrated yet).
  const { fullThreshold, halfThreshold } = resolvePerdiemThresholds(settings, compProfile, perdiemConfig);

  if (mdCount >= fullThreshold) return 'FULL';
  if (mdCount >= halfThreshold) return 'HALF';
  return 'ZERO';
}

/**
 * Compute per diem amount for a day
 * @param {Number} mdCount
 * @param {Number} perdiemRate - BDM's per diem rate (from CompProfile or Settings default)
 * @param {Object} settings
 * @param {Object} [compProfile] - BDM's active CompProfile (optional)
 * @param {Object} [perdiemConfig] - Per-role config from resolvePerdiemConfig (Phase G1.6, optional)
 * @param {Object} [options] - Phase G4.5ee. See computePerdiemTier for shape.
 * @returns {{ tier: String, amount: Number }}
 */
function computePerdiemAmount(mdCount, perdiemRate, settings, compProfile, perdiemConfig, options = {}) {
  const tier = computePerdiemTier(mdCount, settings, compProfile, perdiemConfig, options);
  const multiplier = TIER_MULTIPLIER[tier];
  const amount = Math.round(perdiemRate * multiplier * 100) / 100;
  return { tier, amount };
}

/**
 * Phase G4.5ee — Resolve the per-diem rule for a given activity_type code.
 *
 * Reads ACTIVITY_PERDIEM_RULES Lookup rows for the entity (one row per code,
 * code = activity_type code, metadata.tier_rule = AUTO_FULL | AUTO_HALF | ZERO
 * | USE_THRESHOLDS). Caches the full per-entity rule map for 60s. When a row
 * is missing for an activity, falls back to ACTIVITY_PERDIEM_RULE_DEFAULTS
 * (so OFFICE/FIELD/OTHER/NO_WORK have sane behavior even on un-seeded entities).
 * When the activity code is missing or unknown, returns 'USE_THRESHOLDS' so
 * the legacy MD-threshold logic kicks in (preserves Phase G1.6 contract).
 *
 * @param {ObjectId|String} entityId
 * @param {String} [activityCode] - SmerEntry.activity_type (e.g. 'OFFICE'). Case-insensitive.
 * @returns {Promise<String>} 'AUTO_FULL' | 'AUTO_HALF' | 'ZERO' | 'USE_THRESHOLDS'
 */
async function resolveActivityPerdiemRule(entityId, activityCode) {
  if (!entityId || !activityCode) return 'USE_THRESHOLDS';
  const code = String(activityCode).toUpperCase();

  const cacheKey = String(entityId);
  let rules;
  const cached = _activityRulesCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < ACTIVITY_RULE_CACHE_TTL_MS) {
    rules = cached.rules;
  } else {
    rules = { ...ACTIVITY_PERDIEM_RULE_DEFAULTS };
    try {
      const Lookup = require('../models/Lookup');
      const docs = await Lookup.find({
        entity_id: entityId,
        category: 'ACTIVITY_PERDIEM_RULES',
        is_active: true,
      }).lean();
      for (const d of docs) {
        const rule = d.metadata && d.metadata.tier_rule;
        if (typeof rule === 'string' && VALID_TIER_RULES.has(rule.toUpperCase())) {
          rules[String(d.code).toUpperCase()] = rule.toUpperCase();
        }
      }
    } catch (err) {
      console.warn('[perdiemCalc] ACTIVITY_PERDIEM_RULES lookup failed, using defaults:', err.message);
    }
    _activityRulesCache.set(cacheKey, { ts: Date.now(), rules });
  }

  return rules[code] || 'USE_THRESHOLDS';
}

/**
 * Phase G4.5ee — Bust the activity-rule cache for a given entity (or all
 * entities if no entityId given). Wired from lookupGenericController so
 * admin edits in Control Center propagate immediately instead of waiting
 * up to 60s per running instance.
 */
function invalidateActivityPerdiemRuleCache(entityId = null) {
  if (!entityId) {
    _activityRulesCache.clear();
    return;
  }
  _activityRulesCache.delete(String(entityId));
}

/**
 * Phase G4.5ee — Resolve the FULL activity-rule map for an entity in a single
 * DB call. Returns a plain object: { OFFICE: 'AUTO_FULL', FIELD: 'USE_THRESHOLDS', ... }.
 *
 * Use this when you need to recompute many daily entries in one pass (createSmer,
 * updateSmer, postSmer, recomputeSmerPerdiem) — you await once, then look up
 * sync inside the per-entry .map(). Backward-compat sibling of the per-code
 * resolveActivityPerdiemRule. Same 60s cache key, so calling either function
 * reuses the same cache entry.
 *
 * @param {ObjectId|String} entityId
 * @returns {Promise<Object>} Plain object keyed by uppercase activity code.
 */
async function resolveActivityPerdiemRuleMap(entityId) {
  if (!entityId) return { ...ACTIVITY_PERDIEM_RULE_DEFAULTS };

  const cacheKey = String(entityId);
  const cached = _activityRulesCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < ACTIVITY_RULE_CACHE_TTL_MS) {
    return { ...cached.rules };
  }

  const rules = { ...ACTIVITY_PERDIEM_RULE_DEFAULTS };
  try {
    const Lookup = require('../models/Lookup');
    const docs = await Lookup.find({
      entity_id: entityId,
      category: 'ACTIVITY_PERDIEM_RULES',
      is_active: true,
    }).lean();
    for (const d of docs) {
      const rule = d.metadata && d.metadata.tier_rule;
      if (typeof rule === 'string' && VALID_TIER_RULES.has(rule.toUpperCase())) {
        rules[String(d.code).toUpperCase()] = rule.toUpperCase();
      }
    }
  } catch (err) {
    console.warn('[perdiemCalc] ACTIVITY_PERDIEM_RULES lookup failed, using defaults:', err.message);
  }
  _activityRulesCache.set(cacheKey, { ts: Date.now(), rules });
  return { ...rules };
}

/**
 * Phase G4.5ee — Sync helper for converting a single activity_type into a tier
 * rule, given a pre-resolved rule map (from resolveActivityPerdiemRuleMap).
 * Returns 'USE_THRESHOLDS' if the activity is missing or unknown — preserves
 * legacy MD-threshold behavior for un-mapped activities.
 *
 * @param {Object} rulesMap - Result of resolveActivityPerdiemRuleMap
 * @param {String} [activityCode]
 * @returns {String} 'AUTO_FULL' | 'AUTO_HALF' | 'ZERO' | 'USE_THRESHOLDS'
 */
function getActivityRuleFromMap(rulesMap, activityCode) {
  if (!rulesMap || !activityCode) return 'USE_THRESHOLDS';
  return rulesMap[String(activityCode).toUpperCase()] || 'USE_THRESHOLDS';
}

/**
 * Compute per diem for all daily entries in an SMER
 * @param {Array} dailyEntries - Array of daily entry objects with md_count
 * @param {Number} perdiemRate
 * @param {Object} settings
 * @param {Object} [compProfile] - BDM's active CompProfile (optional)
 * @returns {Array} Updated daily entries with perdiem_tier and perdiem_amount
 */
function computeSmerPerdiem(dailyEntries, perdiemRate, settings, compProfile) {
  return dailyEntries.map(entry => {
    const { tier, amount } = computePerdiemAmount(entry.md_count || 0, perdiemRate, settings, compProfile);
    return {
      ...entry,
      perdiem_tier: tier,
      perdiem_amount: amount
    };
  });
}

/**
 * Phase G1.5 (Apr 2026) — Per-entity × per-role per-diem config resolver.
 * Replaces Settings.PERDIEM_RATE_DEFAULT + hardcoded `|| 800` across the codebase.
 * Rule #3 + #19 + #21: no hardcoded business values, lookup-driven, no silent fallbacks.
 *
 * Reads the PERDIEM_RATES Lookup row (category='PERDIEM_RATES', code=<role>).
 * Missing/invalid row → throws ApiError(400) → caller surfaces to user as
 * "Seed PERDIEM_RATES for role X before running payroll". No silent ₱800 default.
 *
 * @param {Object} args
 * @param {ObjectId|String} args.entityId - The operating entity (req.entityId)
 * @param {String} [args.role] - Role code (e.g. 'BDM', 'ECOMMERCE_BDM'). Defaults to 'BDM'.
 * @returns {Promise<{ rate_php, eligibility_source, skip_flagged, allow_weekend, full_tier_threshold, half_tier_threshold }>}
 */
async function resolvePerdiemConfig({ entityId, role = 'BDM' } = {}) {
  const Lookup = require('../models/Lookup');
  const { ApiError } = require('../../middleware/errorHandler');

  if (!entityId) {
    throw new ApiError(400, 'entity_id is required to resolve per-diem config');
  }
  const normalizedRole = String(role || 'BDM').toUpperCase();

  const row = await Lookup.findOne({
    entity_id: entityId,
    category: 'PERDIEM_RATES',
    code: normalizedRole,
    is_active: true
  }).lean();

  if (!row) {
    throw new ApiError(
      400,
      `PERDIEM_RATES row missing for role "${normalizedRole}" in this entity. Seed it via Control Center → Lookup Tables → PERDIEM_RATES before running payroll (Rule #3 — no hardcoded per-diem rate).`
    );
  }

  const m = row.metadata || {};
  if (typeof m.rate_php !== 'number' || !(m.rate_php > 0)) {
    throw new ApiError(
      400,
      `PERDIEM_RATES.${normalizedRole}.metadata.rate_php invalid for this entity (got ${JSON.stringify(m.rate_php)}). Edit the row in Control Center → Lookup Tables.`
    );
  }

  return {
    rate_php: m.rate_php,
    eligibility_source: m.eligibility_source || 'visit',
    skip_flagged: m.skip_flagged !== false,   // default true (pharma posture)
    allow_weekend: m.allow_weekend === true,  // default false (pharma posture)
    // May 05 2026 — yes-equal-weight: VIP visits + EXTRA calls both count
    // toward the per-diem MD threshold. Default true so existing PERDIEM_RATES
    // rows (which don't carry this key) inherit the corrected behavior. A
    // subscriber that wants strict VIP-only can flip this to false in
    // Control Center → Lookup Tables → PERDIEM_RATES.<role>.metadata.
    include_extra_calls: m.include_extra_calls !== false,
    full_tier_threshold: (m.full_tier_threshold != null) ? Number(m.full_tier_threshold) : null,
    half_tier_threshold: (m.half_tier_threshold != null) ? Number(m.half_tier_threshold) : null,
  };
}

module.exports = {
  computePerdiemTier,
  computePerdiemAmount,
  computeSmerPerdiem,
  resolvePerdiemThresholds,
  resolvePerdiemConfig,
  resolveActivityPerdiemRule,
  resolveActivityPerdiemRuleMap,
  getActivityRuleFromMap,
  invalidateActivityPerdiemRuleCache,
  ACTIVITY_PERDIEM_RULE_DEFAULTS,
  VALID_TIER_RULES,
  TIER_MULTIPLIER
};
