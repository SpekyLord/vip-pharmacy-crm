/**
 * CLM Performance threshold helper — May 2026 (Phase D.4c).
 *
 * Lookup-driven thresholds for the Statistics → CLM Performance tab. Mirrors
 * teamActivityThresholds.js + mdPartnerAccess.js + resolveOwnerScope.js so
 * subscribers can tune the pitch-effectiveness flags per-entity via Control
 * Center → Lookup Tables → CLM_PERFORMANCE_THRESHOLDS without a code deploy
 * (Rule #3, Rule #19).
 *
 * Thresholds:
 *   - min_avg_dwell_seconds_per_slide   default 10
 *       Average dwell time per slide (across the BDM's completed sessions).
 *       Below this = "rushing through the deck" — pitch was too shallow to
 *       have changed the doctor's opinion. 10s is the floor for the
 *       BDM to have read out the headline + one supporting bullet.
 *   - target_avg_session_minutes        default 8
 *       Target average completed-session duration. Below = "too rushed",
 *       above = healthy pitch length. 8min lines up with the 6-slide deck
 *       and ~80s per slide (the deck designer's intent).
 *   - target_conversion_rate_pct        default 30
 *       Target % of completed sessions that end with outcome='interested'
 *       OR 'already_partner'. Below = pitch isn't landing OR the BDM is
 *       prospecting MDs poorly. 30% chosen because pitch-to-partner is a
 *       multi-touch sale; one CLM session converting 1-in-3 is realistic.
 *   - min_slides_viewed                 default 4
 *       Minimum slidesViewedCount on a session to count as a "complete"
 *       presentation. Sessions exiting before slide 4 are flagged as
 *       "early exit" (the doctor probably wasn't interested or the BDM
 *       cut it short). The 6-slide deck's first 3 slides are setup; the
 *       partnership ask hits at slide 4.
 *   - flag_below_total_sessions         default 5
 *       Hide the dwell/conversion flags entirely when the BDM has fewer
 *       than N completed sessions in the window. Prevents noise on new
 *       BDMs whose 1-2 sessions can't carry meaningful averages.
 *
 * Caching: 60s TTL keyed by entityId. Bust via invalidate() when admin
 * edits the lookup row (Lookup Manager save path can wire to this).
 */

const Lookup = require('../erp/models/Lookup');

const DEFAULTS = Object.freeze({
  min_avg_dwell_seconds_per_slide: 10,
  target_avg_session_minutes: 8,
  target_conversion_rate_pct: 30,
  min_slides_viewed: 4,
  flag_below_total_sessions: 5,
});

const TTL_MS = 60_000;
const _cache = new Map();

async function getThresholds(entityId) {
  const cacheKey = entityId || '__GLOBAL__';
  const hit = _cache.get(cacheKey);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.values;

  let values = { ...DEFAULTS };
  try {
    const filter = { category: 'CLM_PERFORMANCE_THRESHOLDS', code: 'DEFAULT', is_active: true };
    if (entityId) filter.entity_id = entityId;
    const doc = await Lookup.findOne(filter).lean();
    if (doc?.metadata) {
      values = {
        min_avg_dwell_seconds_per_slide:
          Number.isFinite(doc.metadata.min_avg_dwell_seconds_per_slide)
            ? doc.metadata.min_avg_dwell_seconds_per_slide
            : DEFAULTS.min_avg_dwell_seconds_per_slide,
        target_avg_session_minutes:
          Number.isFinite(doc.metadata.target_avg_session_minutes)
            ? doc.metadata.target_avg_session_minutes
            : DEFAULTS.target_avg_session_minutes,
        target_conversion_rate_pct:
          Number.isFinite(doc.metadata.target_conversion_rate_pct)
            ? doc.metadata.target_conversion_rate_pct
            : DEFAULTS.target_conversion_rate_pct,
        min_slides_viewed:
          Number.isFinite(doc.metadata.min_slides_viewed)
            ? doc.metadata.min_slides_viewed
            : DEFAULTS.min_slides_viewed,
        flag_below_total_sessions:
          Number.isFinite(doc.metadata.flag_below_total_sessions)
            ? doc.metadata.flag_below_total_sessions
            : DEFAULTS.flag_below_total_sessions,
      };
    }
  } catch (err) {
    console.warn('[clmPerformanceThresholds] lookup failed, using defaults:', err.message);
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
