/**
 * Executive Cockpit access helper — Phase EC-1 (Apr 2026).
 *
 * Lookup-driven role gates for the Executive Cockpit at /erp/cockpit.
 * Mirrors the BIR_ROLES / SCPWD_ROLES lazy-seed-from-defaults pattern in
 * backend/utils/birAccess.js so subscribers configure per-entity gates via
 * Control Center → Lookup Tables → EXECUTIVE_COCKPIT_ROLES without a code
 * deployment (Rule #3, subscription-readiness).
 *
 * Three scopes, gated independently:
 *   - VIEW_COCKPIT       — base read access to /erp/cockpit. Tier-1 tiles.
 *   - VIEW_FINANCIAL     — Cash, AR aging, AP aging, Period close, Margin.
 *                          Default: admin, finance, president. CFO surface.
 *   - VIEW_OPERATIONAL   — Approval SLA, Inventory turns, Agent health,
 *                          Partnership funnel, BIR calendar. COO/CEO surface.
 *
 * The page itself only requires VIEW_COCKPIT. Tier-2 tiles render conditionally
 * based on VIEW_FINANCIAL / VIEW_OPERATIONAL. A subscriber could therefore have
 * a "branch manager" role that sees the cockpit (VIEW_COCKPIT) and operational
 * tiles (VIEW_OPERATIONAL) but NOT financial tiles — without a code change.
 *
 * Cache TTL is 60s. Invalidated on Lookup save via the standard
 * lookupGenericController EXECUTIVE_COCKPIT_ROLES_CATEGORIES hook so admin
 * role-list edits take effect within one cache cycle (or instantly for the
 * writing instance).
 */

const Lookup = require('../erp/models/Lookup');
const { ROLES } = require('../constants/roles');

const DEFAULT_VIEW_COCKPIT     = [ROLES.ADMIN, ROLES.FINANCE, ROLES.PRESIDENT];
const DEFAULT_VIEW_FINANCIAL   = [ROLES.ADMIN, ROLES.FINANCE, ROLES.PRESIDENT];
const DEFAULT_VIEW_OPERATIONAL = [ROLES.ADMIN, ROLES.FINANCE, ROLES.PRESIDENT];

const TTL_MS = 60_000;
const _cache = new Map();

async function getRolesFor(entityId, code, defaults) {
  const cacheKey = `${entityId || '__GLOBAL__'}::${code}`;
  const hit = _cache.get(cacheKey);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.roles;

  let roles = defaults;
  try {
    const filter = { category: 'EXECUTIVE_COCKPIT_ROLES', code, is_active: true };
    if (entityId) filter.entity_id = entityId;
    const doc = await Lookup.findOne(filter).lean();
    if (doc?.metadata?.roles && Array.isArray(doc.metadata.roles) && doc.metadata.roles.length) {
      roles = doc.metadata.roles;
    }
  } catch (err) {
    console.warn(`[executiveCockpitAccess] lookup failed for ${code}, using defaults:`, err.message);
  }

  _cache.set(cacheKey, { ts: Date.now(), roles });
  return roles;
}

const getViewCockpitRoles     = (entityId) => getRolesFor(entityId, 'VIEW_COCKPIT',     DEFAULT_VIEW_COCKPIT);
const getViewFinancialRoles   = (entityId) => getRolesFor(entityId, 'VIEW_FINANCIAL',   DEFAULT_VIEW_FINANCIAL);
const getViewOperationalRoles = (entityId) => getRolesFor(entityId, 'VIEW_OPERATIONAL', DEFAULT_VIEW_OPERATIONAL);

async function userHasCockpitRole(req, code) {
  const userRole = req.user?.role;
  if (!userRole) return false;
  let roles;
  switch (code) {
    case 'VIEW_COCKPIT':     roles = await getViewCockpitRoles(req.entityId); break;
    case 'VIEW_FINANCIAL':   roles = await getViewFinancialRoles(req.entityId); break;
    case 'VIEW_OPERATIONAL': roles = await getViewOperationalRoles(req.entityId); break;
    default:                 return false;
  }
  return Array.isArray(roles) && roles.includes(userRole);
}

/**
 * Express middleware factory — returns 403 if the user lacks the named scope.
 */
function requireCockpitRole(code) {
  return async (req, res, next) => {
    try {
      const allowed = await userHasCockpitRole(req, code);
      if (!allowed) {
        return res.status(403).json({
          success: false,
          message: `Forbidden — Executive Cockpit ${code} permission required.`,
          required_scope: code,
        });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Bust the role cache. Wired into lookupGenericController via
 * EXECUTIVE_COCKPIT_ROLES_CATEGORIES.
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
  getViewCockpitRoles,
  getViewFinancialRoles,
  getViewOperationalRoles,
  userHasCockpitRole,
  requireCockpitRole,
  invalidate,
  DEFAULT_VIEW_COCKPIT,
  DEFAULT_VIEW_FINANCIAL,
  DEFAULT_VIEW_OPERATIONAL,
};
