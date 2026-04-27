/**
 * VIP Client Lifecycle Role helper — Phase A.5 (Apr 2026).
 *
 * Lookup-driven role gates for the canonical VIP-Client (Doctor) lifecycle:
 *   - merge / merge-rollback / hard-delete-merged    (A.5.5 — this phase)
 *   - reassign-primary                               (A.5.4 — future, forward-compat)
 *   - join-coverage-auto / join-coverage-approval    (A.5.4 — future, forward-compat)
 *
 * Mirrors `backend/utils/mdPartnerAccess.js` exactly:
 *   - 60s TTL in-memory cache keyed by `${entityId || '__GLOBAL__'}::${code}`
 *   - Lazy-seed-from-inline-defaults: returns DEFAULT_* when the lookup row is
 *     missing/unreachable so the page never goes dark on a Lookup outage.
 *   - Admin-editable per entity via Control Center → Lookup Tables →
 *     VIP_CLIENT_LIFECYCLE_ROLES (Rule #3 + #19, subscription-readiness).
 *
 * Why entityId is optional: VIP CRM is single-tenant today so most callers
 * don't carry req.entityId. The cache namespace falls back to `__GLOBAL__` so
 * the 60s TTL still de-dupes hot-path calls. When the same code is later
 * deployed inside the multi-entity Pharmacy SaaS (Year-2 spin-out per global
 * Rule 0d), passing entityId scopes the lookup query AND the cache properly.
 *
 * EXACT signature parity with mdPartnerAccess.js means the controller layer
 * imports look the same, and developers re-using the lazy-seed pattern across
 * other lifecycle surfaces (Customer/Hospital merge in future) just copy this
 * file as the template.
 */

const Lookup = require('../erp/models/Lookup');
const { ROLES } = require('../constants/roles');

// Defaults — narrow on purpose. A.5.5 merge cascades update FKs across 9 CRM
// models + 6 ERP models (Visit, ProductAssignment, CommunicationLog,
// CLMSession, Schedule, InviteLink, Collection.doctor_id, Collection.md_id,
// MdProductRebate, MdCapitationRule, PrfCalf, PatientMdAttribution). That's a
// privileged operation that creates audit-visible blast radius — admin +
// president only out of the box. Subscribers loosen via Lookup row.
const DEFAULT_VIEW_MERGE_TOOL       = [ROLES.ADMIN, ROLES.PRESIDENT];
const DEFAULT_EXECUTE_MERGE         = [ROLES.ADMIN, ROLES.PRESIDENT];
const DEFAULT_ROLLBACK_MERGE        = [ROLES.ADMIN, ROLES.PRESIDENT];
const DEFAULT_HARD_DELETE_MERGED    = [ROLES.PRESIDENT]; // narrowest — bypasses 30-day grace
// Forward-compat exports for A.5.4 (assignedTo scalar→array flip). Helper file
// won't need a code change when A.5.4 lands — controller just imports the
// matching getter.
const DEFAULT_REASSIGN_PRIMARY      = [ROLES.ADMIN, ROLES.PRESIDENT];
const DEFAULT_JOIN_COVERAGE_AUTO    = [ROLES.ADMIN, ROLES.PRESIDENT];
const DEFAULT_JOIN_COVERAGE_APPROVAL = [ROLES.ADMIN, ROLES.PRESIDENT];

const TTL_MS = 60_000;
const _cache = new Map();

async function getRolesFor(entityId, code, defaults) {
  const cacheKey = `${entityId || '__GLOBAL__'}::${code}`;
  const hit = _cache.get(cacheKey);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.roles;

  let roles = defaults;
  try {
    const filter = { category: 'VIP_CLIENT_LIFECYCLE_ROLES', code, is_active: true };
    if (entityId) filter.entity_id = entityId;
    const doc = await Lookup.findOne(filter).lean();
    if (doc?.metadata?.roles && Array.isArray(doc.metadata.roles) && doc.metadata.roles.length) {
      roles = doc.metadata.roles;
    }
  } catch (err) {
    console.warn(
      `[resolveVipClientLifecycleRole] VIP_CLIENT_LIFECYCLE_ROLES lookup failed for ${code}, using defaults:`,
      err.message,
    );
  }

  _cache.set(cacheKey, { ts: Date.now(), roles });
  return roles;
}

const getViewMergeToolRoles = (entityId) =>
  getRolesFor(entityId, 'VIEW_MERGE_TOOL', DEFAULT_VIEW_MERGE_TOOL);

const getExecuteMergeRoles = (entityId) =>
  getRolesFor(entityId, 'EXECUTE_MERGE', DEFAULT_EXECUTE_MERGE);

const getRollbackMergeRoles = (entityId) =>
  getRolesFor(entityId, 'ROLLBACK_MERGE', DEFAULT_ROLLBACK_MERGE);

const getHardDeleteMergedRoles = (entityId) =>
  getRolesFor(entityId, 'HARD_DELETE_MERGED', DEFAULT_HARD_DELETE_MERGED);

// Forward-compat (A.5.4):
const getReassignPrimaryRoles = (entityId) =>
  getRolesFor(entityId, 'REASSIGN_PRIMARY', DEFAULT_REASSIGN_PRIMARY);

const getJoinCoverageAutoRoles = (entityId) =>
  getRolesFor(entityId, 'JOIN_COVERAGE_AUTO', DEFAULT_JOIN_COVERAGE_AUTO);

const getJoinCoverageApprovalRoles = (entityId) =>
  getRolesFor(entityId, 'JOIN_COVERAGE_APPROVAL', DEFAULT_JOIN_COVERAGE_APPROVAL);

/**
 * Convenience: takes a req.user and an action code, returns true/false. Mirrors
 * the canProxyEntry signature from resolveOwnerScope.js. President always
 * passes (matches global Rule 20 — president bypass is universal).
 */
async function userCanPerformLifecycleAction(user, code, entityId = null) {
  if (!user || !user.role) return false;
  if (user.role === ROLES.PRESIDENT) return true;
  const allowed = await getRolesFor(entityId, code, [ROLES.ADMIN, ROLES.PRESIDENT]);
  return allowed.includes(user.role);
}

/**
 * Bust the role cache. Pass entityId for targeted bust, omit for full clear.
 * Wire into Lookup Manager save path so admin edits to VIP_CLIENT_LIFECYCLE_ROLES
 * take effect immediately, no app restart needed (Rule #19 hot-config posture).
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
  getViewMergeToolRoles,
  getExecuteMergeRoles,
  getRollbackMergeRoles,
  getHardDeleteMergedRoles,
  getReassignPrimaryRoles,
  getJoinCoverageAutoRoles,
  getJoinCoverageApprovalRoles,
  userCanPerformLifecycleAction,
  invalidate,
  DEFAULT_VIEW_MERGE_TOOL,
  DEFAULT_EXECUTE_MERGE,
  DEFAULT_ROLLBACK_MERGE,
  DEFAULT_HARD_DELETE_MERGED,
  DEFAULT_REASSIGN_PRIMARY,
  DEFAULT_JOIN_COVERAGE_AUTO,
  DEFAULT_JOIN_COVERAGE_APPROVAL,
};
