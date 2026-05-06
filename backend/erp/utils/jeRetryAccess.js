/**
 * JE Retry / AR-recompute access helper — Phase A.4 (May 2026)
 *
 * Lookup-driven role gates for the integrity admin endpoints. Mirrors the
 * mdPartnerAccess.js lazy-seed-from-defaults pattern so subscribers can
 * widen or narrow the gate per-entity via Control Center → Lookup Tables →
 * JE_RETRY_ROLES without a code deployment (Rule #3 subscription readiness).
 *
 * Two keys, gated independently:
 *   - RETRY_JE        — re-fire autoJournal for a POSTED-but-FAILED source
 *                       doc (Sale / Collection / PRF/CALF / SupplierInvoice).
 *                       Defaults to admin/finance/president because the
 *                       button writes to the GL — restrict to the books-
 *                       owning roles by default.
 *   - RECOMPUTE_AR    — bulk-refresh outstanding_amount across every POSTED
 *                       SalesLine + SupplierInvoice in the entity. Read-mostly
 *                       (idempotent), but slow on large datasets — kept on
 *                       the same gate set since both endpoints live behind
 *                       the same admin surface.
 */
const Lookup = require('../models/Lookup');
const { ROLES } = require('../../constants/roles');

const DEFAULT_RETRY_JE = [ROLES.ADMIN, ROLES.FINANCE, ROLES.PRESIDENT];
const DEFAULT_RECOMPUTE_AR = [ROLES.ADMIN, ROLES.FINANCE, ROLES.PRESIDENT];

const TTL_MS = 60_000;
const _cache = new Map();

async function getRolesFor(entityId, code, defaults) {
  const cacheKey = `${entityId || '__GLOBAL__'}::${code}`;
  const hit = _cache.get(cacheKey);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.roles;

  let roles = defaults;
  try {
    const filter = { category: 'JE_RETRY_ROLES', code, is_active: true };
    if (entityId) filter.entity_id = entityId;
    const doc = await Lookup.findOne(filter).lean();
    if (doc?.metadata?.roles && Array.isArray(doc.metadata.roles) && doc.metadata.roles.length) {
      roles = doc.metadata.roles;
    }
  } catch (err) {
    console.warn(`[jeRetryAccess] JE_RETRY_ROLES lookup failed for ${code}, using defaults:`, err.message);
  }

  _cache.set(cacheKey, { ts: Date.now(), roles });
  return roles;
}

const getRetryJeRoles = (entityId) => getRolesFor(entityId, 'RETRY_JE', DEFAULT_RETRY_JE);
const getRecomputeArRoles = (entityId) => getRolesFor(entityId, 'RECOMPUTE_AR', DEFAULT_RECOMPUTE_AR);

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

/**
 * Express-compatible role check. Returns true if req.user.role ∈ the lookup
 * roles for the action. President short-circuits regardless of the row.
 */
async function userCanRetryJe(req) {
  if (req.user?.role === ROLES.PRESIDENT || req.isPresident) return true;
  const roles = await getRetryJeRoles(req.entityId);
  return roles.includes(req.user?.role);
}

async function userCanRecomputeAr(req) {
  if (req.user?.role === ROLES.PRESIDENT || req.isPresident) return true;
  const roles = await getRecomputeArRoles(req.entityId);
  return roles.includes(req.user?.role);
}

module.exports = {
  getRetryJeRoles,
  getRecomputeArRoles,
  userCanRetryJe,
  userCanRecomputeAr,
  invalidate,
  DEFAULT_RETRY_JE,
  DEFAULT_RECOMPUTE_AR,
};
