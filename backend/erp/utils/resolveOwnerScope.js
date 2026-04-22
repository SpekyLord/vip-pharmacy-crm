/**
 * Proxy Entry ownership resolver — Phase G4.5a (April 22, 2026).
 *
 * Lookup-driven + sub-permission-gated helper for "on-behalf-of" data entry.
 * Admin / finance / (opt-in) back-office contractor can record transactions
 * for another BDM without inheriting that BDM's bdm_id scoping.
 *
 * Gate is two-layer (both must pass):
 *   1. Role in PROXY_ENTRY_ROLES.<MODULE> lookup (per-entity, admin-editable)
 *   2. erp_access.sub_permissions.<module>.<subKey> ticked on Access Template
 *
 * President always passes. CEO is always denied (view-only role).
 *
 * Rule #21 alignment: if caller sends `assigned_to` but is not eligible, we
 * throw 403 — never silently fall back to their own id, which would hide data
 * mis-ownership.
 */

const Lookup = require('../models/Lookup');
const User = require('../../models/User');
const { ROLES } = require('../../constants/roles');

// Default proxy-target ("owner") roles when VALID_OWNER_ROLES lookup is not
// yet seeded for an entity. Proxies file under a BDM-shaped owner; admin /
// finance / president / ceo never own per-BDM transactional records (KPIs,
// commission accruals, per-BDM reports would break). 'employee' is legacy
// code for 'contractor' still present in DB rows — kept in the default for
// back-compat. Subscribers with different org models (director who also
// sells, branch manager carrying a territory) extend the list per-module
// via Control Center → Lookup Tables → VALID_OWNER_ROLES.
const DEFAULT_VALID_OWNER_ROLES = [ROLES.CONTRACTOR, 'employee'];

const CACHE_TTL_MS = 60_000;
const _proxyRolesCache = new Map();
const _validOwnerRolesCache = new Map();

const DEFAULT_PROXY_ROLES = [ROLES.ADMIN, ROLES.FINANCE, ROLES.PRESIDENT];

async function getProxyRolesForModule(entityId, moduleKey) {
  const cacheKey = `${entityId}::${moduleKey}`;
  const cached = _proxyRolesCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.roles;

  let roles = DEFAULT_PROXY_ROLES;
  try {
    const doc = await Lookup.findOne({
      entity_id: entityId,
      category: 'PROXY_ENTRY_ROLES',
      code: String(moduleKey).toUpperCase(),
      is_active: true,
    }).lean();
    if (doc && Array.isArray(doc.metadata?.roles) && doc.metadata.roles.length) {
      roles = doc.metadata.roles;
    }
  } catch (err) {
    console.warn('[resolveOwnerScope] PROXY_ENTRY_ROLES lookup failed, using defaults:', err.message);
  }

  _proxyRolesCache.set(cacheKey, { ts: Date.now(), roles });
  return roles;
}

function invalidateProxyRolesCache(entityId = null) {
  if (!entityId) {
    _proxyRolesCache.clear();
    return;
  }
  const prefix = `${entityId}::`;
  for (const key of Array.from(_proxyRolesCache.keys())) {
    if (key.startsWith(prefix)) _proxyRolesCache.delete(key);
  }
}

async function getValidOwnerRolesForModule(entityId, moduleKey) {
  const cacheKey = `${entityId}::${moduleKey}`;
  const cached = _validOwnerRolesCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.roles;

  let roles = DEFAULT_VALID_OWNER_ROLES;
  try {
    const doc = await Lookup.findOne({
      entity_id: entityId,
      category: 'VALID_OWNER_ROLES',
      code: String(moduleKey).toUpperCase(),
      is_active: true,
    }).lean();
    if (doc && Array.isArray(doc.metadata?.roles) && doc.metadata.roles.length) {
      roles = doc.metadata.roles;
    }
  } catch (err) {
    console.warn('[resolveOwnerScope] VALID_OWNER_ROLES lookup failed, using defaults:', err.message);
  }

  _validOwnerRolesCache.set(cacheKey, { ts: Date.now(), roles });
  return roles;
}

function invalidateValidOwnerRolesCache(entityId = null) {
  if (!entityId) {
    _validOwnerRolesCache.clear();
    return;
  }
  const prefix = `${entityId}::`;
  for (const key of Array.from(_validOwnerRolesCache.keys())) {
    if (key.startsWith(prefix)) _validOwnerRolesCache.delete(key);
  }
}

function hasProxySubPermission(user, moduleKey, subKey) {
  if (!user) return false;
  if (user.role === ROLES.PRESIDENT) return true;
  if (user.role === ROLES.CEO) return false;
  const subs = user.erp_access?.sub_permissions?.[moduleKey];
  return !!(subs && subs[subKey]);
}

async function canProxyEntry(req, moduleKey, subKey = 'proxy_entry') {
  if (!req || !req.user) return { canProxy: false, proxyRoles: DEFAULT_PROXY_ROLES };
  const proxyRoles = await getProxyRolesForModule(req.entityId, moduleKey);
  const role = req.user.role;
  const roleEligible = role === ROLES.PRESIDENT || proxyRoles.includes(role);
  if (!roleEligible) return { canProxy: false, proxyRoles };
  const hasSub = hasProxySubPermission(req.user, moduleKey, subKey);
  return { canProxy: hasSub, proxyRoles };
}

/**
 * WRITE path. If body.assigned_to is present and differs from req.user._id,
 * gate it. Returns { ownerId, proxiedBy, isOnBehalf }.
 *
 * Throws an Error with .statusCode=403 if the caller requested proxy but
 * isn't eligible.
 */
async function resolveOwnerForWrite(req, moduleKey, { subKey = 'proxy_entry' } = {}) {
  const rawAssigned = req.body?.assigned_to || null;
  const selfId = String(req.user._id);
  if (!rawAssigned || String(rawAssigned) === selfId) {
    return { ownerId: req.user._id, proxiedBy: undefined, isOnBehalf: false };
  }
  const { canProxy } = await canProxyEntry(req, moduleKey, subKey);
  if (!canProxy) {
    const err = new Error(
      `Proxy entry denied for ${moduleKey}.${subKey}. Your role or Access Template does not grant proxy rights for this module.`
    );
    err.statusCode = 403;
    throw err;
  }
  // Defense in depth: validate the target is a BDM-shaped user in the same
  // entity. Blocks accidental / malicious assignment to admin/finance/president
  // (who don't own per-BDM records) and cross-entity assignment.
  const target = await User.findById(rawAssigned).select('role entity_id entity_ids isActive name').lean();
  if (!target) {
    const err = new Error('Proxy target user not found');
    err.statusCode = 400;
    throw err;
  }
  if (!target.isActive) {
    const err = new Error(`Proxy target ${target.name || rawAssigned} is inactive`);
    err.statusCode = 400;
    throw err;
  }
  const validOwnerRoles = await getValidOwnerRolesForModule(req.entityId, moduleKey);
  if (!validOwnerRoles.includes(target.role)) {
    const err = new Error(
      `Proxy target role '${target.role}' is not a valid owner for ${moduleKey}. ` +
      `Configured valid owner roles (VALID_OWNER_ROLES.${String(moduleKey).toUpperCase()}): ${validOwnerRoles.join(', ')}.`
    );
    err.statusCode = 400;
    throw err;
  }
  const targetEntities = [target.entity_id, ...(target.entity_ids || [])].filter(Boolean).map(String);
  if (!targetEntities.includes(String(req.entityId))) {
    const err = new Error(
      `Proxy target ${target.name || rawAssigned} is not assigned to the current entity. Cross-entity proxy is not permitted.`
    );
    err.statusCode = 403;
    throw err;
  }
  return { ownerId: rawAssigned, proxiedBy: req.user._id, isOnBehalf: true };
}

/**
 * READ path. Returns a shallow copy of req.tenantFilter with `bdm_id` removed
 * when the caller is an eligible proxy. Entity scope is preserved.
 *
 * For admin/finance the tenantFilter already lacks bdm_id (middleware layer),
 * so this is a no-op for them. It only widens the scope for a contractor who
 * has been granted the sub-permission.
 */
async function widenFilterForProxy(req, moduleKey, { subKey = 'proxy_entry' } = {}) {
  const base = { ...(req.tenantFilter || {}) };
  const { canProxy } = await canProxyEntry(req, moduleKey, subKey);
  if (!canProxy) return base;
  const widened = { ...base };
  delete widened.bdm_id;
  return widened;
}

module.exports = {
  canProxyEntry,
  resolveOwnerForWrite,
  widenFilterForProxy,
  invalidateProxyRolesCache,
  hasProxySubPermission,
  getProxyRolesForModule,
  getValidOwnerRolesForModule,
  invalidateValidOwnerRolesCache,
};
