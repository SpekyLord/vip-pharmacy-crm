/**
 * Product Lifecycle Role helper — Phase G7.A.0 (May 05 2026).
 *
 * Lookup-driven role gates for the canonical ProductMaster lifecycle:
 *   - merge tool view / execute / rollback / hard-delete   (G7.A.1)
 *   - carry grant / carry revoke                            (G7.A.4)
 *   - price change (per-entity selling/purchase override)   (G7.A.4)
 *
 * Mirrors `backend/utils/resolveVipClientLifecycleRole.js` exactly. Same TTL,
 * same lazy-seed-from-defaults pattern, same `userCan*` convenience signature,
 * same cache `invalidate()` hook for admin Lookup edits to propagate
 * immediately (Rule #19 hot-config posture).
 *
 * Defaults (narrow on purpose):
 *   - VIEW / EXECUTE / ROLLBACK MERGE  → admin + president
 *   - HARD_DELETE_MERGED                → president only (bypasses 30-day grace)
 *   - CARRY_GRANT / CARRY_REVOKE        → admin + president (carries are
 *     business-policy decisions; finance reviews pricing separately)
 *   - PRICE_CHANGE                       → admin + finance + president (pricing
 *     governance is finance's lane)
 *
 * Subscribers loosen via Control Center → Lookup Tables →
 * PRODUCT_LIFECYCLE_ROLES (Rule #3 + #19).
 */

const Lookup = require('../erp/models/Lookup');
const { ROLES } = require('../constants/roles');

// G7.A.1 — merge tool gates
const DEFAULT_VIEW_MERGE_TOOL    = [ROLES.ADMIN, ROLES.PRESIDENT];
const DEFAULT_EXECUTE_MERGE      = [ROLES.ADMIN, ROLES.PRESIDENT];
const DEFAULT_ROLLBACK_MERGE     = [ROLES.ADMIN, ROLES.PRESIDENT];
const DEFAULT_HARD_DELETE_MERGED = [ROLES.PRESIDENT]; // narrowest — bypasses 30-day grace

// G7.A.4 — carry-list management (forward-compat exports)
const DEFAULT_CARRY_GRANT  = [ROLES.ADMIN, ROLES.PRESIDENT];
const DEFAULT_CARRY_REVOKE = [ROLES.ADMIN, ROLES.PRESIDENT];
const DEFAULT_PRICE_CHANGE = [ROLES.ADMIN, ROLES.FINANCE, ROLES.PRESIDENT];

const TTL_MS = 60_000;
const _cache = new Map();

async function getRolesFor(entityId, code, defaults) {
  const cacheKey = `${entityId || '__GLOBAL__'}::${code}`;
  const hit = _cache.get(cacheKey);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.roles;

  let roles = defaults;
  try {
    const filter = { category: 'PRODUCT_LIFECYCLE_ROLES', code, is_active: true };
    if (entityId) filter.entity_id = entityId;
    const doc = await Lookup.findOne(filter).lean();
    if (doc?.metadata?.roles && Array.isArray(doc.metadata.roles) && doc.metadata.roles.length) {
      roles = doc.metadata.roles;
    }
  } catch (err) {
    console.warn(
      `[resolveProductLifecycleRole] PRODUCT_LIFECYCLE_ROLES lookup failed for ${code}, using defaults:`,
      err.message,
    );
  }

  _cache.set(cacheKey, { ts: Date.now(), roles });
  return roles;
}

const getViewMergeToolRoles    = (entityId) => getRolesFor(entityId, 'VIEW_MERGE_TOOL',    DEFAULT_VIEW_MERGE_TOOL);
const getExecuteMergeRoles     = (entityId) => getRolesFor(entityId, 'EXECUTE_MERGE',      DEFAULT_EXECUTE_MERGE);
const getRollbackMergeRoles    = (entityId) => getRolesFor(entityId, 'ROLLBACK_MERGE',     DEFAULT_ROLLBACK_MERGE);
const getHardDeleteMergedRoles = (entityId) => getRolesFor(entityId, 'HARD_DELETE_MERGED', DEFAULT_HARD_DELETE_MERGED);
const getCarryGrantRoles       = (entityId) => getRolesFor(entityId, 'CARRY_GRANT',        DEFAULT_CARRY_GRANT);
const getCarryRevokeRoles      = (entityId) => getRolesFor(entityId, 'CARRY_REVOKE',       DEFAULT_CARRY_REVOKE);
const getPriceChangeRoles      = (entityId) => getRolesFor(entityId, 'PRICE_CHANGE',       DEFAULT_PRICE_CHANGE);

async function userCanPerformLifecycleAction(user, code, entityId = null) {
  if (!user || !user.role) return false;
  if (user.role === ROLES.PRESIDENT) return true;
  const allowed = await getRolesFor(entityId, code, [ROLES.ADMIN, ROLES.PRESIDENT]);
  return allowed.includes(user.role);
}

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
  getCarryGrantRoles,
  getCarryRevokeRoles,
  getPriceChangeRoles,
  userCanPerformLifecycleAction,
  invalidate,
  DEFAULT_VIEW_MERGE_TOOL,
  DEFAULT_EXECUTE_MERGE,
  DEFAULT_ROLLBACK_MERGE,
  DEFAULT_HARD_DELETE_MERGED,
  DEFAULT_CARRY_GRANT,
  DEFAULT_CARRY_REVOKE,
  DEFAULT_PRICE_CHANGE,
};
