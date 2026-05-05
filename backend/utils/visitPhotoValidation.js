/**
 * Visit Photo Validation Threshold Helper — May 2026 (Phase O).
 *
 * Lookup-driven thresholds for the server-side EXIF / screenshot guards
 * that protect the Visit fraud surface. Mirrors clmPerformanceThresholds.js
 * + teamActivityThresholds.js + mdPartnerAccess.js so subscribers can tune
 * the photo trust posture per-entity via Control Center → Lookup Tables →
 * VISIT_PHOTO_VALIDATION_RULES without a code deploy (Rule #3, Rule #19).
 *
 * Thresholds:
 *   - late_log_max_days_old              default 14
 *       Photos with EXIF DateTimeOriginal older than N days are hard-blocked
 *       at upload. 14d covers a BDM who skipped logging through a sick week
 *       AND admin's reasonable "late entries get reviewed individually"
 *       window. Beyond that, the BDM must call admin to request a manual
 *       backfill (audit trail intact).
 *   - cross_week_soft_flag               default true
 *       When EXIF date sits in last week (or earlier) but within
 *       late_log_max_days_old, flag the visit ("photo from last week")
 *       so admin reviewer sees it; the visit still saves and counts. Set
 *       false to suppress the flag (rare — almost always wanted).
 *   - screenshot_block_enabled           default true
 *       Master switch for screenshot detection. When false, screenshots
 *       upload as-is (used during initial rollout while BDMs migrate to
 *       GPS Map Camera). When true, /api/visits returns 422 with a
 *       redirect payload pointing at /bdm/comm-log.
 *   - screenshot_redirect_path           default '/bdm/comm-log'
 *       Where the 422 response tells the client to redirect. Lookup-driven
 *       so a subscriber that hosts CommLog at a different route doesn't
 *       need a code change.
 *   - require_exif_for_camera_source     default false
 *       When true, photos uploaded with source='camera' MUST have EXIF
 *       DateTimeOriginal — falls back to screenshot rejection if missing.
 *       Default false because some Android camera apps strip EXIF for
 *       privacy and the BDM hasn't done anything wrong; the soft flag
 *       'no_exif_timestamp' captures the signal for admin without
 *       blocking. Subscribers with stricter policies flip this to true.
 *
 * Caching: 60s TTL keyed by entityId. Bust via invalidate() when admin
 * edits the lookup row (Lookup Manager save path can wire to this).
 *
 * Design parity with clmPerformanceThresholds.js — same shape, same TTL,
 * same fallback contract. New thresholds added here must follow the same
 * Number.isFinite / typeof guard pattern below or values silently default.
 */

const Lookup = require('../erp/models/Lookup');

const DEFAULTS = Object.freeze({
  late_log_max_days_old: 14,
  cross_week_soft_flag: true,
  screenshot_block_enabled: true,
  screenshot_redirect_path: '/bdm/comm-log',
  require_exif_for_camera_source: false,
});

const TTL_MS = 60_000;
const _cache = new Map();

async function getThresholds(entityId) {
  const cacheKey = entityId || '__GLOBAL__';
  const hit = _cache.get(cacheKey);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.values;

  let values = { ...DEFAULTS };
  try {
    const filter = { category: 'VISIT_PHOTO_VALIDATION_RULES', code: 'DEFAULT', is_active: true };
    if (entityId) filter.entity_id = entityId;
    const doc = await Lookup.findOne(filter).lean();
    if (doc?.metadata) {
      values = {
        late_log_max_days_old: Number.isFinite(doc.metadata.late_log_max_days_old)
          ? doc.metadata.late_log_max_days_old
          : DEFAULTS.late_log_max_days_old,
        cross_week_soft_flag: typeof doc.metadata.cross_week_soft_flag === 'boolean'
          ? doc.metadata.cross_week_soft_flag
          : DEFAULTS.cross_week_soft_flag,
        screenshot_block_enabled: typeof doc.metadata.screenshot_block_enabled === 'boolean'
          ? doc.metadata.screenshot_block_enabled
          : DEFAULTS.screenshot_block_enabled,
        screenshot_redirect_path: typeof doc.metadata.screenshot_redirect_path === 'string' && doc.metadata.screenshot_redirect_path.trim()
          ? doc.metadata.screenshot_redirect_path.trim()
          : DEFAULTS.screenshot_redirect_path,
        require_exif_for_camera_source: typeof doc.metadata.require_exif_for_camera_source === 'boolean'
          ? doc.metadata.require_exif_for_camera_source
          : DEFAULTS.require_exif_for_camera_source,
      };
    }
  } catch (err) {
    console.warn('[visitPhotoValidation] lookup failed, using defaults:', err.message);
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
