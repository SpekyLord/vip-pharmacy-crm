/**
 * Entity-scope resolver for READ endpoints — Phase G6 (April 26, 2026).
 *
 * Master-data reads (People Master, Vendors, Customers, Hospitals, etc.) should
 * follow the entity selector at the top of the ERP UI. Today, `tenantFilter`
 * sets `req.tenantFilter = {}` for president-likes — controllers that spread
 * that filter end up returning EVERY entity's rows even when the president has
 * a working entity selected via X-Entity-Id. The selector ends up being a
 * "stamp on creates" affordance only, not a true working-context filter, which
 * is misleading.
 *
 * This helper preserves the legacy "president sees all transactional" pattern
 * (Phase 31-E) where it's intentional, but lets master-data controllers opt in
 * to "scope to selected entity by default; explicit ?cross_entity=true widens
 * back to all entities". The widen-back is gated by the
 * CROSS_ENTITY_VIEW_ROLES.<MODULE> lookup — admin/finance/contractor never
 * widen (they're already entity-scoped by tenantFilter).
 *
 * Behavior:
 *   - Non-president: returns existing tenantFilter unchanged (with bdm_id
 *     stripped for admin/finance who are not BDMs — same shape getPeopleList
 *     used to build inline). Contractors keep their bdm_id filter.
 *   - President without ?cross_entity=true: scope to req.entityId (selector).
 *   - President with ?cross_entity=true: only widens if their role is in the
 *     CROSS_ENTITY_VIEW_ROLES.<moduleKey>.metadata.roles allowlist (60s cache,
 *     bust on lookup write — same pattern as PROXY_ENTRY_ROLES).
 *
 * Rule #21 alignment: never silently fall back to a different scope. The flag
 * has to be explicit. Roles outside the allowlist quietly stay scoped (they
 * never see widened data they're not authorized for).
 *
 * Rule #3 alignment: subscribers extend the allowlist via Control Center →
 * Lookup Tables → CROSS_ENTITY_VIEW_ROLES.<MODULE> — no code change needed
 * to grant a CFO consolidated view across subsidiaries, etc.
 */

const Lookup = require('../models/Lookup');
const { ROLES } = require('../../constants/roles');

const CACHE_TTL_MS = 60_000;
const _cache = new Map();

// Default cross-entity-view allowlist when CROSS_ENTITY_VIEW_ROLES.<MODULE>
// is not yet seeded for an entity. President + CEO are top-tier roles that
// already have unscoped read access via tenantFilter; they retain the ability
// to widen explicitly. Subsidiaries with a consolidating finance role extend
// via Control Center.
const DEFAULT_CROSS_ENTITY_ROLES = [ROLES.PRESIDENT, ROLES.CEO];

async function getCrossEntityRolesForModule(entityId, moduleKey) {
  const code = String(moduleKey || '').toUpperCase();
  const cacheKey = `${entityId}::${code}`;
  const cached = _cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.roles;

  let roles = DEFAULT_CROSS_ENTITY_ROLES;
  try {
    const doc = await Lookup.findOne({
      entity_id: entityId,
      category: 'CROSS_ENTITY_VIEW_ROLES',
      code,
      is_active: true,
    }).lean();
    if (doc && Array.isArray(doc.metadata?.roles) && doc.metadata.roles.length) {
      roles = doc.metadata.roles;
    }
  } catch (err) {
    console.warn('[resolveEntityScope] CROSS_ENTITY_VIEW_ROLES lookup failed, using defaults:', err.message);
  }

  _cache.set(cacheKey, { ts: Date.now(), roles });
  return roles;
}

function invalidateCrossEntityRolesCache(entityId = null) {
  if (!entityId) {
    _cache.clear();
    return;
  }
  const prefix = `${entityId}::`;
  for (const key of Array.from(_cache.keys())) {
    if (key.startsWith(prefix)) _cache.delete(key);
  }
}

/**
 * Resolve entity scope for a master-data READ endpoint.
 *
 * @param {object}   req       Express request (must have tenantFilter, isAdmin,
 *                             isFinance, isPresident, entityId, user.role set
 *                             by auth + tenantFilter middleware).
 * @param {string}   moduleKey Lookup code under CROSS_ENTITY_VIEW_ROLES that
 *                             governs the cross-entity allowlist for this
 *                             module (e.g. 'PEOPLE_MASTER').
 * @returns {Promise<{ entityScope: object, isCrossEntity: boolean, scopedEntityId: any }>}
 */
async function resolveEntityScope(req, moduleKey) {
  const base = { ...(req.tenantFilter || {}) };

  // Strip bdm_id for privileged users — they're not BDMs, and master-data
  // tables (PeopleMaster, Vendor, Customer, Hospital) don't carry bdm_id.
  // tenantFilter only sets bdm_id for contractors; for admin/finance the
  // field is already absent. Defensive delete keeps callers honest.
  if (req.isAdmin || req.isFinance || req.isPresident) delete base.bdm_id;

  // Non-president callers: tenantFilter already correctly scopes them by
  // entity_id (admin/finance) or entity_id+bdm_id (contractor). No widening
  // is possible from their seat, so return as-is.
  if (!req.isPresident) {
    return {
      entityScope: base,
      isCrossEntity: false,
      scopedEntityId: req.entityId || null,
    };
  }

  const wantsCrossEntity = String(req.query?.cross_entity || '').toLowerCase() === 'true';

  // President without explicit opt-in: scope to working entity (selector).
  if (!wantsCrossEntity) {
    if (req.entityId) base.entity_id = req.entityId;
    return {
      entityScope: base,
      isCrossEntity: false,
      scopedEntityId: req.entityId || null,
    };
  }

  // President with ?cross_entity=true: must be in the per-module allowlist
  // (default ['president', 'ceo']; subscribers extend via Control Center).
  const allowedRoles = await getCrossEntityRolesForModule(req.entityId, moduleKey);
  if (!allowedRoles.includes(req.user.role)) {
    if (req.entityId) base.entity_id = req.entityId;
    return {
      entityScope: base,
      isCrossEntity: false,
      scopedEntityId: req.entityId || null,
    };
  }

  // Allowed → widen to cross-entity. Drop entity_id so we read across all
  // entities. (We never widen bdm_id for someone outside the allowlist; that
  // never happens here because admin/finance/contractor return earlier.)
  delete base.entity_id;
  return {
    entityScope: base,
    isCrossEntity: true,
    scopedEntityId: null,
  };
}

module.exports = {
  resolveEntityScope,
  getCrossEntityRolesForModule,
  invalidateCrossEntityRolesCache,
};
