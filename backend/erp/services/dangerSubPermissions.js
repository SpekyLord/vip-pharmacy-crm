/**
 * Danger Sub-Permissions — Phase 3a
 *
 * A sub-permission is "danger" when its blast radius is asymmetric: the action
 * reverses journals, mutates ledger state, or voids audit-visible side effects
 * that cannot be cleanly undone. These must NEVER be inherited from a module's
 * FULL access level — they require explicit grant via Access Template, even
 * when `erp_access.modules.<module> === 'FULL'`.
 *
 * Baseline floor (BASELINE_DANGER_SUB_PERMS) is hardcoded — this is the safety
 * invariant of the platform. Subscribers cannot remove baseline entries; they
 * can only ADD more via the `ERP_DANGER_SUB_PERMISSIONS` Lookup category
 * (per-entity, configurable in Control Center → Lookup Tables).
 *
 * Checked only on the FULL-fallback path in `erpSubAccessCheck` and
 * `erpAnySubAccessCheck` (when no specific sub_permission keys are defined
 * for the module). Explicit grants in `erp_access.sub_permissions[module][key]`
 * are honored as-is — this gate only affects the implicit "FULL = all granted"
 * shortcut.
 *
 * President always bypasses (handled upstream in middleware).
 */

const Lookup = require('../models/Lookup');

// Baseline safety floor — always treated as danger across every entity.
// Additions here are a platform-wide change (code release); subscribers cannot opt out.
const BASELINE_DANGER_SUB_PERMS = new Set([
  'accounting.reverse_posted',
]);

const CACHE_TTL_MS = 5 * 60 * 1000;
// entityId (string) -> { keys: Set<string>, expires: number }
const cache = new Map();

async function loadEntityExtras(entityId) {
  const rows = await Lookup.find({
    entity_id: entityId,
    category: 'ERP_DANGER_SUB_PERMISSIONS',
    is_active: true,
  }).select('metadata').lean();
  const keys = new Set();
  for (const row of rows) {
    const mod = row.metadata?.module;
    const key = row.metadata?.key;
    if (mod && key) keys.add(`${mod}.${key}`);
  }
  return keys;
}

/**
 * Returns true if `fullKey` (e.g. "accounting.reverse_posted") is a danger
 * sub-permission for the given entity. Baseline keys always match; additional
 * keys come from the entity's ERP_DANGER_SUB_PERMISSIONS lookup.
 *
 * Baseline checks are in-memory and can never fail. Only the lookup read for
 * subscriber-added extras can throw — and if it does, we rethrow so the caller
 * can fail CLOSED (block the request) rather than silently granting access to
 * what might be a subscriber-marked danger key. The 5-minute cache means a
 * transient outage usually doesn't cascade into repeated failures.
 */
async function isDangerSubPerm(fullKey, entityId) {
  if (BASELINE_DANGER_SUB_PERMS.has(fullKey)) return true;
  if (!entityId) return false;

  const cacheKey = String(entityId);
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > now) {
    return cached.keys.has(fullKey);
  }

  // Let failures propagate — middleware's denyIfDangerFallback catches and 503s.
  // Rethrowing is safer than returning false: a silent false would let a
  // subscriber-marked danger key slip through to the FULL-fallback grant path.
  const keys = await loadEntityExtras(entityId);
  cache.set(cacheKey, { keys, expires: now + CACHE_TTL_MS });
  return keys.has(fullKey);
}

/**
 * Invalidate the per-entity cache. Call from lookup write handlers when the
 * ERP_DANGER_SUB_PERMISSIONS category is touched so the new list is picked up
 * immediately instead of after the 5-minute TTL.
 */
function invalidateDangerCache(entityId) {
  if (entityId) cache.delete(String(entityId));
  else cache.clear();
}

module.exports = {
  BASELINE_DANGER_SUB_PERMS,
  isDangerSubPerm,
  invalidateDangerCache,
};
