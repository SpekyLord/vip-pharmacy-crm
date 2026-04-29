/**
 * Team Activity threshold helper — Apr 2026.
 *
 * Lookup-driven thresholds for the Statistics → Team Activity tab. Mirrors
 * the lazy-cache-with-inline-defaults pattern used by mdPartnerAccess.js +
 * resolveOwnerScope.js so subscribers can tune the COO red-flag rules per-
 * entity via Control Center → Lookup Tables → TEAM_ACTIVITY_THRESHOLDS
 * without a code deployment (Rule #3, Rule #19).
 *
 * Thresholds:
 *   - red_flag_consecutive_workdays  default 2
 *       Number of consecutive Mon-Fri (Manila) the BDM has logged ZERO
 *       visits before the row gets the 🚩 redflag treatment. Two days
 *       chosen as the COO escalation point: a BDM idle one workday is
 *       routine (sick, traffic, doctor cancelled); two is a pattern.
 *   - gap_warning_workdays           default 1
 *       Strictly less-than red_flag triggers a yellow ⚠ warning. Set to 0
 *       to disable the warning state entirely (everything is OK or RED).
 *   - target_call_rate               default 80
 *       Percent target for current-cycle call rate. Below this counts as
 *       "behind schedule" in the row coloring; matches the Overview tab's
 *       on-track ≥80 rule so the two surfaces don't disagree.
 *
 * Caching: 60s TTL keyed by entityId. Bust via invalidate() when admin
 * edits the lookup row (wire into the Lookup Manager save path).
 */

const Lookup = require('../erp/models/Lookup');

const DEFAULTS = Object.freeze({
  red_flag_consecutive_workdays: 2,
  gap_warning_workdays: 1,
  target_call_rate: 80,
});

const TTL_MS = 60_000;
const _cache = new Map();

async function getThresholds(entityId) {
  const cacheKey = entityId || '__GLOBAL__';
  const hit = _cache.get(cacheKey);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.values;

  let values = { ...DEFAULTS };
  try {
    const filter = { category: 'TEAM_ACTIVITY_THRESHOLDS', code: 'DEFAULT', is_active: true };
    if (entityId) filter.entity_id = entityId;
    const doc = await Lookup.findOne(filter).lean();
    if (doc?.metadata) {
      values = {
        red_flag_consecutive_workdays:
          Number.isFinite(doc.metadata.red_flag_consecutive_workdays)
            ? doc.metadata.red_flag_consecutive_workdays
            : DEFAULTS.red_flag_consecutive_workdays,
        gap_warning_workdays:
          Number.isFinite(doc.metadata.gap_warning_workdays)
            ? doc.metadata.gap_warning_workdays
            : DEFAULTS.gap_warning_workdays,
        target_call_rate:
          Number.isFinite(doc.metadata.target_call_rate)
            ? doc.metadata.target_call_rate
            : DEFAULTS.target_call_rate,
      };
    }
  } catch (err) {
    console.warn('[teamActivityThresholds] lookup failed, using defaults:', err.message);
  }

  _cache.set(cacheKey, { ts: Date.now(), values });
  return values;
}

function invalidate(entityId) {
  if (!entityId) {
    _cache.clear();
    return;
  }
  _cache.delete(entityId);
}

module.exports = {
  getThresholds,
  invalidate,
  DEFAULTS,
};
