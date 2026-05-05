/**
 * Capture Lifecycle access helper — Phase P1.2 Slice 1 (May 06 2026).
 *
 * Lookup-driven role gates for the BDM Capture Hub + Proxy Queue + Capture
 * Archive lifecycle. Mirrors the proven `mdPartnerAccess.js` /
 * `resolveVipClientLifecycleRole.js` pattern so subscribers re-route any of
 * the 12 sub-permissions per-entity via Control Center → Lookup Tables →
 * `CAPTURE_LIFECYCLE_ROLES` without a code deployment (Rule #3).
 *
 * The 12 codes carve the capture lifecycle into a layered grid that lets the
 * subscriber decide per-entity which roles get which lever. Defaults match
 * the Phase P1.2 plan locked May 05 2026 evening (BDMs upload + allocate;
 * proxies attest paper + reuse photos; admin/finance reconcile + report;
 * president holds the irreversible levers).
 *
 *   Code                            Default roles                  Surface
 *   UPLOAD_OWN_CAPTURE              [staff]                        BDM hub camera
 *   VIEW_OWN_ARCHIVE                [staff]                        BDM browses own archive
 *   VIEW_ALL_ARCHIVE                [admin,finance,president]      cross-BDM archive view
 *   MARK_PAPER_RECEIVED             [admin,finance]                proxy attests paper arrived
 *   BULK_MARK_RECEIVED              [admin]                        archive multi-select
 *   OVERRIDE_PHYSICAL_STATUS        [president]                    flip RECEIVED ↔ MISSING
 *   GENERATE_CYCLE_REPORT           [admin,finance,president]      cycle audit PDF/CSV
 *   MARK_NO_DRIVE_DAY               [staff]                        BDM clears vacation/sick day
 *   ALLOCATE_PERSONAL_OFFICIAL      [staff]                        BDM personal/official slider
 *   OVERRIDE_ALLOCATION             [admin,president]              correct mistaken allocation
 *   EDIT_CAR_LOGBOOK_DESTINATION    [admin,finance,president]      proxy edits CRM-pulled cell
 *   PROXY_PULL_CAPTURE              [admin,finance]                pending-photos picker
 *
 * Cache TTL is 60s, matches every other lookup-driven access helper in the
 * codebase. Invalidation is wired into `lookupGenericController.create/update/remove`
 * via the `CAPTURE_LIFECYCLE_ROLES_CATEGORIES` set so admin saves take effect
 * immediately, no app restart needed (Rule #19 hot-config posture).
 *
 * Why entityId is optional: VIP CRM today is single-tenant so most callers
 * don't carry req.entityId. The cache namespace falls back to `__GLOBAL__` so
 * the 60s TTL still de-dupes hot-path calls. When the same code runs inside
 * the multi-entity Pharmacy SaaS (Year-2 spin-out per global Rule 0d),
 * passing entityId scopes both the lookup query AND the cache.
 */

const Lookup = require('../erp/models/Lookup');
const { ROLES } = require('../constants/roles');

// ── Inline DEFAULTS — the lookup row is the override mechanism, defaults ship
// with the binary so a Lookup outage never goes dark.
// Narrowness of HARD-action gates (BULK_MARK_RECEIVED, OVERRIDE_*) is
// intentional: these can release held commission or hide proof of paper
// receipt. Subscribers loosen via lookup row when they're sure of the policy.
const DEFAULT_UPLOAD_OWN_CAPTURE          = [ROLES.STAFF];
const DEFAULT_VIEW_OWN_ARCHIVE            = [ROLES.STAFF];
const DEFAULT_VIEW_ALL_ARCHIVE            = [ROLES.ADMIN, ROLES.FINANCE, ROLES.PRESIDENT];
const DEFAULT_MARK_PAPER_RECEIVED         = [ROLES.ADMIN, ROLES.FINANCE];
const DEFAULT_BULK_MARK_RECEIVED          = [ROLES.ADMIN];
const DEFAULT_OVERRIDE_PHYSICAL_STATUS    = [ROLES.PRESIDENT];
const DEFAULT_GENERATE_CYCLE_REPORT       = [ROLES.ADMIN, ROLES.FINANCE, ROLES.PRESIDENT];
const DEFAULT_MARK_NO_DRIVE_DAY           = [ROLES.STAFF];
const DEFAULT_ALLOCATE_PERSONAL_OFFICIAL  = [ROLES.STAFF];
const DEFAULT_OVERRIDE_ALLOCATION         = [ROLES.ADMIN, ROLES.PRESIDENT];
const DEFAULT_EDIT_CAR_LOGBOOK_DESTINATION = [ROLES.ADMIN, ROLES.FINANCE, ROLES.PRESIDENT];
const DEFAULT_PROXY_PULL_CAPTURE          = [ROLES.ADMIN, ROLES.FINANCE];

const TTL_MS = 60_000;
const _cache = new Map();

async function getRolesFor(entityId, code, defaults) {
  const cacheKey = `${entityId || '__GLOBAL__'}::${code}`;
  const hit = _cache.get(cacheKey);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.roles;

  let roles = defaults;
  try {
    const filter = { category: 'CAPTURE_LIFECYCLE_ROLES', code, is_active: true };
    if (entityId) filter.entity_id = entityId;
    const doc = await Lookup.findOne(filter).lean();
    if (doc?.metadata?.roles && Array.isArray(doc.metadata.roles) && doc.metadata.roles.length) {
      roles = doc.metadata.roles;
    }
  } catch (err) {
    // Lookup query failed (DB transient, missing model, etc.) — fall back to
    // inline defaults so the page never goes dark on a Lookup outage. Same
    // posture as mdPartnerAccess.js + resolveOwnerScope.js.
    console.warn(
      `[captureLifecycleAccess] CAPTURE_LIFECYCLE_ROLES lookup failed for ${code}, using defaults:`,
      err.message,
    );
  }

  _cache.set(cacheKey, { ts: Date.now(), roles });
  return roles;
}

// ── 12 individual getters ──
const getUploadOwnCaptureRoles = (entityId) =>
  getRolesFor(entityId, 'UPLOAD_OWN_CAPTURE', DEFAULT_UPLOAD_OWN_CAPTURE);

const getViewOwnArchiveRoles = (entityId) =>
  getRolesFor(entityId, 'VIEW_OWN_ARCHIVE', DEFAULT_VIEW_OWN_ARCHIVE);

const getViewAllArchiveRoles = (entityId) =>
  getRolesFor(entityId, 'VIEW_ALL_ARCHIVE', DEFAULT_VIEW_ALL_ARCHIVE);

const getMarkPaperReceivedRoles = (entityId) =>
  getRolesFor(entityId, 'MARK_PAPER_RECEIVED', DEFAULT_MARK_PAPER_RECEIVED);

const getBulkMarkReceivedRoles = (entityId) =>
  getRolesFor(entityId, 'BULK_MARK_RECEIVED', DEFAULT_BULK_MARK_RECEIVED);

const getOverridePhysicalStatusRoles = (entityId) =>
  getRolesFor(entityId, 'OVERRIDE_PHYSICAL_STATUS', DEFAULT_OVERRIDE_PHYSICAL_STATUS);

const getGenerateCycleReportRoles = (entityId) =>
  getRolesFor(entityId, 'GENERATE_CYCLE_REPORT', DEFAULT_GENERATE_CYCLE_REPORT);

const getMarkNoDriveDayRoles = (entityId) =>
  getRolesFor(entityId, 'MARK_NO_DRIVE_DAY', DEFAULT_MARK_NO_DRIVE_DAY);

const getAllocatePersonalOfficialRoles = (entityId) =>
  getRolesFor(entityId, 'ALLOCATE_PERSONAL_OFFICIAL', DEFAULT_ALLOCATE_PERSONAL_OFFICIAL);

const getOverrideAllocationRoles = (entityId) =>
  getRolesFor(entityId, 'OVERRIDE_ALLOCATION', DEFAULT_OVERRIDE_ALLOCATION);

const getEditCarLogbookDestinationRoles = (entityId) =>
  getRolesFor(entityId, 'EDIT_CAR_LOGBOOK_DESTINATION', DEFAULT_EDIT_CAR_LOGBOOK_DESTINATION);

const getProxyPullCaptureRoles = (entityId) =>
  getRolesFor(entityId, 'PROXY_PULL_CAPTURE', DEFAULT_PROXY_PULL_CAPTURE);

// Map code → defaults so userCanPerformCaptureAction can fall back without
// case-statement explosion. Adding a new code = add one row here + getter +
// inline DEFAULT_* + SEED_DEFAULTS row in lookupGenericController.
const DEFAULTS_BY_CODE = Object.freeze({
  UPLOAD_OWN_CAPTURE:           DEFAULT_UPLOAD_OWN_CAPTURE,
  VIEW_OWN_ARCHIVE:             DEFAULT_VIEW_OWN_ARCHIVE,
  VIEW_ALL_ARCHIVE:             DEFAULT_VIEW_ALL_ARCHIVE,
  MARK_PAPER_RECEIVED:          DEFAULT_MARK_PAPER_RECEIVED,
  BULK_MARK_RECEIVED:           DEFAULT_BULK_MARK_RECEIVED,
  OVERRIDE_PHYSICAL_STATUS:     DEFAULT_OVERRIDE_PHYSICAL_STATUS,
  GENERATE_CYCLE_REPORT:        DEFAULT_GENERATE_CYCLE_REPORT,
  MARK_NO_DRIVE_DAY:            DEFAULT_MARK_NO_DRIVE_DAY,
  ALLOCATE_PERSONAL_OFFICIAL:   DEFAULT_ALLOCATE_PERSONAL_OFFICIAL,
  OVERRIDE_ALLOCATION:          DEFAULT_OVERRIDE_ALLOCATION,
  EDIT_CAR_LOGBOOK_DESTINATION: DEFAULT_EDIT_CAR_LOGBOOK_DESTINATION,
  PROXY_PULL_CAPTURE:           DEFAULT_PROXY_PULL_CAPTURE,
});

/**
 * Convenience: takes a req.user, an action code, and (optionally) an entityId,
 * and returns true/false. Mirrors `userCanPerformLifecycleAction` in
 * resolveVipClientLifecycleRole.js. President always passes — global Rule #20
 * president-bypass posture.
 *
 * Returns false (not throws) for unknown codes so a typo in the controller
 * fails closed rather than 500.
 */
async function userCanPerformCaptureAction(user, code, entityId = null) {
  if (!user || !user.role) return false;
  if (user.role === ROLES.PRESIDENT) return true;
  const defaults = DEFAULTS_BY_CODE[code];
  if (!defaults) {
    console.warn(`[captureLifecycleAccess] Unknown code '${code}' — denying.`);
    return false;
  }
  const allowed = await getRolesFor(entityId, code, defaults);
  return allowed.includes(user.role);
}

/**
 * Bust the role cache. Pass entityId for targeted bust, omit for full clear.
 * Wired into the Lookup Manager save path (lookupGenericController.create /
 * .update / .remove) via CAPTURE_LIFECYCLE_ROLES_CATEGORIES so admin edits to
 * CAPTURE_LIFECYCLE_ROLES rows take effect immediately.
 */
function invalidate(entityId) {
  if (!entityId) {
    _cache.clear();
    return;
  }
  const prefix = `${entityId}::`;
  for (const key of Array.from(_cache.keys())) {
    if (key.startsWith(prefix)) _cache.delete(key);
  }
}

module.exports = {
  // Getters (12 codes)
  getUploadOwnCaptureRoles,
  getViewOwnArchiveRoles,
  getViewAllArchiveRoles,
  getMarkPaperReceivedRoles,
  getBulkMarkReceivedRoles,
  getOverridePhysicalStatusRoles,
  getGenerateCycleReportRoles,
  getMarkNoDriveDayRoles,
  getAllocatePersonalOfficialRoles,
  getOverrideAllocationRoles,
  getEditCarLogbookDestinationRoles,
  getProxyPullCaptureRoles,
  // Convenience helper
  userCanPerformCaptureAction,
  // Cache control
  invalidate,
  // Defaults exported for healthcheck + tests
  DEFAULT_UPLOAD_OWN_CAPTURE,
  DEFAULT_VIEW_OWN_ARCHIVE,
  DEFAULT_VIEW_ALL_ARCHIVE,
  DEFAULT_MARK_PAPER_RECEIVED,
  DEFAULT_BULK_MARK_RECEIVED,
  DEFAULT_OVERRIDE_PHYSICAL_STATUS,
  DEFAULT_GENERATE_CYCLE_REPORT,
  DEFAULT_MARK_NO_DRIVE_DAY,
  DEFAULT_ALLOCATE_PERSONAL_OFFICIAL,
  DEFAULT_OVERRIDE_ALLOCATION,
  DEFAULT_EDIT_CAR_LOGBOOK_DESTINATION,
  DEFAULT_PROXY_PULL_CAPTURE,
  DEFAULTS_BY_CODE,
};
