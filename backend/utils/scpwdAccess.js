/**
 * SC/PWD Sales Book access helper — Phase VIP-1.H (Apr 2026).
 *
 * Lookup-driven role gates for the SC/PWD register + BIR exports. Mirrors the
 * MD_PARTNER_ROLES lazy-seed-from-defaults pattern in
 * backend/utils/mdPartnerAccess.js so subscribers configure per-entity gates
 * via Control Center → Lookup Tables → SCPWD_ROLES without a code deployment
 * (Rule #3, subscription-readiness).
 *
 * Four keys, gated independently — same posture as the MD Partner module:
 *   - VIEW_REGISTER       — list + filter the SC/PWD register UI
 *   - CREATE_ENTRY        — manually post or ingest SC/PWD transactions
 *   - EXPORT_MONTHLY      — produce the BIR-format monthly CSV per RR 7-2010
 *   - EXPORT_VAT_RECLAIM  — produce the Input VAT Credit Worksheet (Form 2306)
 *
 * Cache TTL is 60s. Invalidated on Lookup save via the standard Lookup Manager
 * cache-bust path (lookupGenericController DANGER/PROXY/SCPWD category set).
 *
 * IMPORTANT: BIR export operations are reportable on government audit. Default
 * roles are admin + finance — narrower than the MD Partner module because
 * exporting the wrong period, with wrong totals, has real BIR liability.
 * President is intentionally NOT in the default — president action goes via
 * admin/finance for accountability traceability.
 */

const Lookup = require('../erp/models/Lookup');
const { ROLES } = require('../constants/roles');

const DEFAULT_VIEW_REGISTER = [ROLES.ADMIN, ROLES.FINANCE, ROLES.PRESIDENT];
const DEFAULT_CREATE_ENTRY = [ROLES.ADMIN, ROLES.FINANCE];
const DEFAULT_EXPORT_MONTHLY = [ROLES.ADMIN, ROLES.FINANCE];
const DEFAULT_EXPORT_VAT_RECLAIM = [ROLES.ADMIN, ROLES.FINANCE];

const TTL_MS = 60_000;
const _cache = new Map();

async function getRolesFor(entityId, code, defaults) {
  const cacheKey = `${entityId || '__GLOBAL__'}::${code}`;
  const hit = _cache.get(cacheKey);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.roles;

  let roles = defaults;
  try {
    const filter = { category: 'SCPWD_ROLES', code, is_active: true };
    if (entityId) filter.entity_id = entityId;
    const doc = await Lookup.findOne(filter).lean();
    if (doc?.metadata?.roles && Array.isArray(doc.metadata.roles) && doc.metadata.roles.length) {
      roles = doc.metadata.roles;
    }
  } catch (err) {
    // Lookup query failed (DB transient, missing model, etc.) — fall back to inline
    // defaults so the register never goes dark on a Lookup outage.
    console.warn(`[scpwdAccess] SCPWD_ROLES lookup failed for ${code}, using defaults:`, err.message);
  }

  _cache.set(cacheKey, { ts: Date.now(), roles });
  return roles;
}

const getViewRegisterRoles = (entityId) =>
  getRolesFor(entityId, 'VIEW_REGISTER', DEFAULT_VIEW_REGISTER);

const getCreateEntryRoles = (entityId) =>
  getRolesFor(entityId, 'CREATE_ENTRY', DEFAULT_CREATE_ENTRY);

const getExportMonthlyRoles = (entityId) =>
  getRolesFor(entityId, 'EXPORT_MONTHLY', DEFAULT_EXPORT_MONTHLY);

const getExportVatReclaimRoles = (entityId) =>
  getRolesFor(entityId, 'EXPORT_VAT_RECLAIM', DEFAULT_EXPORT_VAT_RECLAIM);

/**
 * Helper for express middleware — returns true if the requesting user holds
 * any role allowed by the given scope. President bypass is NOT applied here
 * because president is in the default for VIEW_REGISTER but not for CREATE/
 * EXPORT — the lookup decides per gate.
 */
async function userHasScpwdRole(req, code) {
  const userRole = req.user?.role;
  if (!userRole) return false;
  let roles;
  switch (code) {
    case 'VIEW_REGISTER':      roles = await getViewRegisterRoles(req.entityId); break;
    case 'CREATE_ENTRY':       roles = await getCreateEntryRoles(req.entityId); break;
    case 'EXPORT_MONTHLY':     roles = await getExportMonthlyRoles(req.entityId); break;
    case 'EXPORT_VAT_RECLAIM': roles = await getExportVatReclaimRoles(req.entityId); break;
    default:                   return false;
  }
  return Array.isArray(roles) && roles.includes(userRole);
}

/**
 * Bust the role cache. Pass entityId for targeted bust, omit for full clear.
 * Wire into the Lookup Manager save path whenever an SCPWD_ROLES row is
 * added/edited/deleted.
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
  getViewRegisterRoles,
  getCreateEntryRoles,
  getExportMonthlyRoles,
  getExportVatReclaimRoles,
  userHasScpwdRole,
  invalidate,
  DEFAULT_VIEW_REGISTER,
  DEFAULT_CREATE_ENTRY,
  DEFAULT_EXPORT_MONTHLY,
  DEFAULT_EXPORT_VAT_RECLAIM,
};
