/**
 * BIR Compliance access helper — Phase VIP-1.J (Apr 2026).
 *
 * Lookup-driven role gates for the BIR Compliance Dashboard at /erp/bir.
 * Mirrors the SCPWD_ROLES lazy-seed-from-defaults pattern in
 * backend/utils/scpwdAccess.js so subscribers configure per-entity gates
 * via Control Center → Lookup Tables → BIR_ROLES without a code deployment
 * (Rule #3, subscription-readiness).
 *
 * Seven scopes, gated independently:
 *   - VIEW_DASHBOARD     — read-only access to /erp/bir + form detail pages
 *   - EXPORT_FORM        — download CSV / PDF / .dat artifacts
 *   - MARK_REVIEWED      — president-style sign-off before bookkeeper files
 *   - MARK_FILED         — bookkeeper records eBIR submission
 *   - MARK_CONFIRMED     — manual confirmation (override email-parser bridge)
 *   - RUN_DATA_AUDIT     — trigger TIN/address completeness scan ad-hoc
 *   - MANAGE_TAX_CONFIG  — edit Entity.tin / rdo_code / tax_type — senior gate
 *
 * Cache TTL is 60s. Invalidated on Lookup save via the standard
 * lookupGenericController BIR_ROLES_CATEGORIES hook so admin role-list edits
 * take effect within one cache cycle (or instantly for the writing instance).
 *
 * IMPORTANT: BIR exports are reportable on government audit. Default roles
 * are admin + finance for the write/export gates; bookkeeper is added to
 * EXPORT_FORM and MARK_FILED so an external bookkeeper can do their job
 * without seeing payroll/commission/incentive data. President is in VIEW
 * + MARK_REVIEWED + MANAGE_TAX_CONFIG but intentionally NOT in EXPORT_FORM
 * — exports travel through accountability roles for traceability.
 */

const Lookup = require('../erp/models/Lookup');
const { ROLES } = require('../constants/roles');

const DEFAULT_VIEW_DASHBOARD    = [ROLES.ADMIN, ROLES.FINANCE, ROLES.PRESIDENT, ROLES.BOOKKEEPER];
const DEFAULT_EXPORT_FORM       = [ROLES.ADMIN, ROLES.FINANCE, ROLES.BOOKKEEPER];
const DEFAULT_MARK_REVIEWED     = [ROLES.ADMIN, ROLES.PRESIDENT];
const DEFAULT_MARK_FILED        = [ROLES.ADMIN, ROLES.FINANCE, ROLES.BOOKKEEPER];
const DEFAULT_MARK_CONFIRMED    = [ROLES.ADMIN, ROLES.FINANCE];
const DEFAULT_RUN_DATA_AUDIT    = [ROLES.ADMIN, ROLES.FINANCE, ROLES.PRESIDENT, ROLES.BOOKKEEPER];
const DEFAULT_MANAGE_TAX_CONFIG = [ROLES.ADMIN, ROLES.PRESIDENT];

const TTL_MS = 60_000;
const _cache = new Map();

async function getRolesFor(entityId, code, defaults) {
  const cacheKey = `${entityId || '__GLOBAL__'}::${code}`;
  const hit = _cache.get(cacheKey);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.roles;

  let roles = defaults;
  try {
    const filter = { category: 'BIR_ROLES', code, is_active: true };
    if (entityId) filter.entity_id = entityId;
    const doc = await Lookup.findOne(filter).lean();
    if (doc?.metadata?.roles && Array.isArray(doc.metadata.roles) && doc.metadata.roles.length) {
      roles = doc.metadata.roles;
    }
  } catch (err) {
    console.warn(`[birAccess] BIR_ROLES lookup failed for ${code}, using defaults:`, err.message);
  }

  _cache.set(cacheKey, { ts: Date.now(), roles });
  return roles;
}

const getViewDashboardRoles    = (entityId) => getRolesFor(entityId, 'VIEW_DASHBOARD',    DEFAULT_VIEW_DASHBOARD);
const getExportFormRoles       = (entityId) => getRolesFor(entityId, 'EXPORT_FORM',       DEFAULT_EXPORT_FORM);
const getMarkReviewedRoles     = (entityId) => getRolesFor(entityId, 'MARK_REVIEWED',     DEFAULT_MARK_REVIEWED);
const getMarkFiledRoles        = (entityId) => getRolesFor(entityId, 'MARK_FILED',        DEFAULT_MARK_FILED);
const getMarkConfirmedRoles    = (entityId) => getRolesFor(entityId, 'MARK_CONFIRMED',    DEFAULT_MARK_CONFIRMED);
const getRunDataAuditRoles     = (entityId) => getRolesFor(entityId, 'RUN_DATA_AUDIT',    DEFAULT_RUN_DATA_AUDIT);
const getManageTaxConfigRoles  = (entityId) => getRolesFor(entityId, 'MANAGE_TAX_CONFIG', DEFAULT_MANAGE_TAX_CONFIG);

/**
 * Helper for express middleware — returns true if the requesting user holds
 * any role allowed by the given scope. No president bypass at the helper
 * level; the lookup decides per gate (president is in VIEW_DASHBOARD by
 * default but not in EXPORT_FORM, by design).
 */
async function userHasBirRole(req, code) {
  const userRole = req.user?.role;
  if (!userRole) return false;
  let roles;
  switch (code) {
    case 'VIEW_DASHBOARD':    roles = await getViewDashboardRoles(req.entityId); break;
    case 'EXPORT_FORM':       roles = await getExportFormRoles(req.entityId); break;
    case 'MARK_REVIEWED':     roles = await getMarkReviewedRoles(req.entityId); break;
    case 'MARK_FILED':        roles = await getMarkFiledRoles(req.entityId); break;
    case 'MARK_CONFIRMED':    roles = await getMarkConfirmedRoles(req.entityId); break;
    case 'RUN_DATA_AUDIT':    roles = await getRunDataAuditRoles(req.entityId); break;
    case 'MANAGE_TAX_CONFIG': roles = await getManageTaxConfigRoles(req.entityId); break;
    default:                  return false;
  }
  return Array.isArray(roles) && roles.includes(userRole);
}

/**
 * Express middleware factory — returns 403 if the user lacks the named
 * BIR_ROLES scope. Use as: router.get('/foo', requireBirRole('EXPORT_FORM'), handler)
 */
function requireBirRole(code) {
  return async (req, res, next) => {
    try {
      const allowed = await userHasBirRole(req, code);
      if (!allowed) {
        return res.status(403).json({
          success: false,
          message: `Forbidden — BIR ${code} permission required for this action.`,
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
 * Bust the role cache. Pass entityId for targeted bust, omit for full clear.
 * Wired into lookupGenericController via BIR_ROLES_CATEGORIES.
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
  getViewDashboardRoles,
  getExportFormRoles,
  getMarkReviewedRoles,
  getMarkFiledRoles,
  getMarkConfirmedRoles,
  getRunDataAuditRoles,
  getManageTaxConfigRoles,
  userHasBirRole,
  requireBirRole,
  invalidate,
  DEFAULT_VIEW_DASHBOARD,
  DEFAULT_EXPORT_FORM,
  DEFAULT_MARK_REVIEWED,
  DEFAULT_MARK_FILED,
  DEFAULT_MARK_CONFIRMED,
  DEFAULT_RUN_DATA_AUDIT,
  DEFAULT_MANAGE_TAX_CONFIG,
};
