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
// commission accruals, per-BDM reports would break). Subscribers with
// different org models (director who also sells, branch manager carrying
// a territory) extend the list per-module via Control Center → Lookup
// Tables → VALID_OWNER_ROLES.
// Phase S2 (Apr 2026): renamed from [CONTRACTOR, 'employee'] → [STAFF].
const DEFAULT_VALID_OWNER_ROLES = [ROLES.STAFF];

const CACHE_TTL_MS = 60_000;
const _proxyRolesCache = new Map();
const _validOwnerRolesCache = new Map();

const DEFAULT_PROXY_ROLES = [ROLES.ADMIN, ROLES.FINANCE, ROLES.PRESIDENT];

// Phase G4.5e — helpers accept an optional `lookupCode` so a module that
// shares a sub-permission namespace with another (e.g. car_logbook + prf_calf
// both live under the `expenses` module) can still have its own role allowlist
// and VALID_OWNER_ROLES row. Falls back to `moduleKey.toUpperCase()` so every
// pre-G4.5e call site stays byte-identical.
function resolveLookupCode(moduleKey, lookupCode) {
  return String(lookupCode || moduleKey || '').toUpperCase();
}

async function getProxyRolesForModule(entityId, moduleKey, lookupCode) {
  const code = resolveLookupCode(moduleKey, lookupCode);
  const cacheKey = `${entityId}::${code}`;
  const cached = _proxyRolesCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.roles;

  let roles = DEFAULT_PROXY_ROLES;
  try {
    const doc = await Lookup.findOne({
      entity_id: entityId,
      category: 'PROXY_ENTRY_ROLES',
      code,
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

async function getValidOwnerRolesForModule(entityId, moduleKey, lookupCode) {
  const code = resolveLookupCode(moduleKey, lookupCode);
  const cacheKey = `${entityId}::${code}`;
  const cached = _validOwnerRolesCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.roles;

  let roles = DEFAULT_VALID_OWNER_ROLES;
  try {
    const doc = await Lookup.findOne({
      entity_id: entityId,
      category: 'VALID_OWNER_ROLES',
      code,
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

async function canProxyEntry(req, moduleKey, subKeyOrOpts = 'proxy_entry', maybeOpts) {
  // Back-compat signature: (req, moduleKey, 'subKey_string')
  //     new signature: (req, moduleKey, { subKey, lookupCode })
  //     either/or:    (req, moduleKey, 'subKey_string', { lookupCode })
  let subKey = 'proxy_entry';
  let lookupCode;
  if (typeof subKeyOrOpts === 'string') {
    subKey = subKeyOrOpts;
    if (maybeOpts && typeof maybeOpts === 'object') lookupCode = maybeOpts.lookupCode;
  } else if (subKeyOrOpts && typeof subKeyOrOpts === 'object') {
    subKey = subKeyOrOpts.subKey || subKey;
    lookupCode = subKeyOrOpts.lookupCode;
  }
  if (!req || !req.user) return { canProxy: false, proxyRoles: DEFAULT_PROXY_ROLES };
  const proxyRoles = await getProxyRolesForModule(req.entityId, moduleKey, lookupCode);
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
async function resolveOwnerForWrite(req, moduleKey, { subKey = 'proxy_entry', lookupCode } = {}) {
  const rawAssigned = req.body?.assigned_to || null;
  const selfId = String(req.user._id);

  // Rule #21 guard (write path, Phase G4.5d). Silent self-fill is only safe
  // when the caller's own role is a VALID_OWNER_ROLES member. For admin /
  // finance / president, stamping their _id onto bdm_id would corrupt per-BDM
  // KPIs, commissions, and Approval Hub hydration. Force them to pick an owner.
  const validOwnerRoles = await getValidOwnerRolesForModule(req.entityId, moduleKey, lookupCode);
  const callerIsValidOwner = validOwnerRoles.includes(req.user.role);

  if (!rawAssigned || String(rawAssigned) === selfId) {
    if (!callerIsValidOwner) {
      const err = new Error(
        `Owner must be selected for ${lookupCode || moduleKey}. Role '${req.user.role}' does not own ` +
        `per-BDM records — pick a BDM in "Record on behalf of". ` +
        `Valid owner roles: ${validOwnerRoles.join(', ')}.`
      );
      err.statusCode = 400;
      throw err;
    }
    return { ownerId: req.user._id, proxiedBy: undefined, isOnBehalf: false };
  }
  const { canProxy } = await canProxyEntry(req, moduleKey, { subKey, lookupCode });
  if (!canProxy) {
    const err = new Error(
      `Proxy entry denied for ${lookupCode || moduleKey}.${subKey}. Your role or Access Template does not grant proxy rights for this module.`
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
  if (!validOwnerRoles.includes(target.role)) {
    const resolvedCode = String(lookupCode || moduleKey).toUpperCase();
    const err = new Error(
      `Proxy target role '${target.role}' is not a valid owner for ${lookupCode || moduleKey}. ` +
      `Configured valid owner roles (VALID_OWNER_ROLES.${resolvedCode}): ${validOwnerRoles.join(', ')}.`
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
async function widenFilterForProxy(req, moduleKey, { subKey = 'proxy_entry', lookupCode } = {}) {
  const base = { ...(req.tenantFilter || {}) };
  const { canProxy } = await canProxyEntry(req, moduleKey, { subKey, lookupCode });
  if (!canProxy) return base;
  const widened = { ...base };
  delete widened.bdm_id;
  return widened;
}

/**
 * Resource-first access check for endpoints opened via `window.open()` (PDF
 * downloads, file links). Those flows bypass the SPA's axios interceptor, so
 * `X-Entity-Id` never reaches the backend and `req.entityId` falls back to the
 * caller's primary entity. Matching that against `resource.entity_id` causes
 * a false 404 whenever the resource lives outside the caller's primary entity
 * (e.g. president's primary is VIP but they want to view an MG and CO CSI).
 *
 * Decision rule:
 *   - president / ceo  → always allowed (cross-entity by design).
 *   - admin / finance  → allowed iff `resource.entity_id ∈ caller.entity_ids`.
 *   - staff (BDM)      → allowed iff caller owns the row OR caller is an
 *                        eligible proxy (PROXY_ENTRY_ROLES + sub-permission).
 *
 * Throws an Error with `.statusCode = 403` on denial — never silently swaps
 * to the caller's working entity (Rule #21).
 *
 * @param {object} req            Express request (post-auth, post-tenantFilter).
 * @param {object} resource       Lean document with `entity_id` and `bdm_id`.
 * @param {object} [opts]
 * @param {string} [opts.moduleKey]   Module for proxy gate (e.g. 'sales').
 * @param {string} [opts.subKey]      Sub-permission key (default 'proxy_entry').
 * @param {string} [opts.lookupCode]  Override for PROXY_ENTRY_ROLES lookup.
 * @param {string} [opts.resourceLabel='record']  Used in the 403 message.
 */
async function assertResourceReadAccess(req, resource, opts = {}) {
  if (!req || !req.user) {
    const err = new Error('Authentication required');
    err.statusCode = 401;
    throw err;
  }
  if (!resource || !resource.entity_id) {
    const err = new Error('Resource missing entity_id');
    err.statusCode = 500;
    throw err;
  }

  // President / CEO: always allowed (cross-entity superusers).
  if (req.isPresident) return;

  const resourceEntity = String(resource.entity_id);
  const userEntities = new Set();
  if (req.user.entity_id) userEntities.add(String(req.user.entity_id));
  if (Array.isArray(req.user.entity_ids)) {
    req.user.entity_ids.forEach((id) => userEntities.add(String(id)));
  }
  const inUserEntities = userEntities.has(resourceEntity);

  const label = opts.resourceLabel || 'record';

  // Admin / Finance: must be assigned to this entity.
  if (req.isAdmin || req.isFinance) {
    if (!inUserEntities) {
      const err = new Error(
        `You do not have access to this ${label}'s entity. Ask the president to add this entity to your assignment.`
      );
      err.statusCode = 403;
      throw err;
    }
    return;
  }

  // Staff (BDM): entity must match AND (own the row OR eligible proxy).
  if (!inUserEntities) {
    const err = new Error(`You do not have access to this ${label}'s entity.`);
    err.statusCode = 403;
    throw err;
  }
  const isOwner = resource.bdm_id && String(resource.bdm_id) === String(req.user._id);
  if (isOwner) return;

  if (!opts.moduleKey) {
    const err = new Error(`You can only view your own ${label}s.`);
    err.statusCode = 403;
    throw err;
  }
  const { canProxy } = await canProxyEntry(req, opts.moduleKey, {
    subKey: opts.subKey || 'proxy_entry',
    lookupCode: opts.lookupCode,
  });
  if (!canProxy) {
    const err = new Error(`You can only view your own ${label}s.`);
    err.statusCode = 403;
    throw err;
  }
}

module.exports = {
  canProxyEntry,
  resolveOwnerForWrite,
  widenFilterForProxy,
  assertResourceReadAccess,
  invalidateProxyRolesCache,
  hasProxySubPermission,
  getProxyRolesForModule,
  getValidOwnerRolesForModule,
  invalidateValidOwnerRolesCache,
};
