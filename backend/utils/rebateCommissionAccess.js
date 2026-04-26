/**
 * Rebate + Commission access helper — Phase VIP-1.B (Apr 2026).
 *
 * Lookup-driven role gates for the rebate matrix + commission matrix +
 * payout-management surfaces. Mirrors the scpwdAccess.js / mdPartnerAccess.js
 * lazy-seed-from-defaults pattern (Rule #3, subscription-readiness) so
 * subscribers configure per-entity gates via Control Center → Lookup Tables
 * (REBATE_ROLES + COMMISSION_ROLES categories) without code deployments.
 *
 * REBATE_ROLES gates:
 *   - MANAGE_MD_MATRIX        — admin can add/edit/deactivate MdProductRebate
 *                               + MdCapitationRule rows.
 *   - MANAGE_NONMD_MATRIX     — admin/finance can edit NonMdPartnerRebateRule.
 *   - VIEW_PAYOUTS            — read-only access to RebatePayout ledger.
 *   - RUN_MONTHLY_CLOSE       — flips ACCRUING → READY_TO_PAY at period close.
 *   - MARK_PAID               — flips READY_TO_PAY → PAID after PRF posting.
 *   - EXPORT_BIR_2307         — Form 2307 (CWT) export for partner rebates if
 *                               jurisdictional withholding applies.
 *
 * COMMISSION_ROLES gates:
 *   - MANAGE_RULES            — admin/finance edit StaffCommissionRule matrix.
 *   - VIEW_PAYOUTS            — read-only on CommissionPayout ledger.
 *   - OVERRIDE_AUTO_RATES     — manual override on Collection auto-filled
 *                               commission_rate per CSI (audit-logged).
 *
 * Default posture: rebate matrix = admin + president (MD-rebate eligibility
 * is a senior decision per Apr 26 strategy memo). Commission management =
 * admin + finance + president (compensation policy is finance-owned).
 *
 * Cache TTL is 60s. Invalidated on Lookup save via the
 * lookupGenericController REBATE_ROLES_CATEGORIES / COMMISSION_ROLES_CATEGORIES
 * cache-bust hook (wired in same commit as the seeds).
 */

const Lookup = require('../erp/models/Lookup');
const { ROLES } = require('../constants/roles');

// REBATE_ROLES defaults
const DEFAULT_MANAGE_MD_MATRIX = [ROLES.ADMIN, ROLES.PRESIDENT];
const DEFAULT_MANAGE_NONMD_MATRIX = [ROLES.ADMIN, ROLES.FINANCE];
const DEFAULT_VIEW_REBATE_PAYOUTS = [ROLES.ADMIN, ROLES.FINANCE, ROLES.PRESIDENT];
const DEFAULT_RUN_MONTHLY_CLOSE = [ROLES.ADMIN, ROLES.FINANCE];
const DEFAULT_MARK_PAID = [ROLES.ADMIN, ROLES.FINANCE];
const DEFAULT_EXPORT_BIR_2307 = [ROLES.ADMIN, ROLES.FINANCE];

// COMMISSION_ROLES defaults
const DEFAULT_MANAGE_COMMISSION_RULES = [ROLES.ADMIN, ROLES.FINANCE, ROLES.PRESIDENT];
const DEFAULT_VIEW_COMMISSION_PAYOUTS = [ROLES.ADMIN, ROLES.FINANCE, ROLES.PRESIDENT];
const DEFAULT_OVERRIDE_AUTO_RATES = [ROLES.ADMIN, ROLES.FINANCE];

const TTL_MS = 60_000;
const _cache = new Map();

async function getRolesFor(entityId, category, code, defaults) {
  const cacheKey = `${entityId || '__GLOBAL__'}::${category}::${code}`;
  const hit = _cache.get(cacheKey);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.roles;

  let roles = defaults;
  try {
    const filter = { category, code, is_active: true };
    if (entityId) filter.entity_id = entityId;
    const doc = await Lookup.findOne(filter).lean();
    if (doc?.metadata?.roles && Array.isArray(doc.metadata.roles) && doc.metadata.roles.length) {
      roles = doc.metadata.roles;
    }
  } catch (err) {
    console.warn(
      `[rebateCommissionAccess] ${category}/${code} lookup failed, using defaults:`,
      err.message
    );
  }

  _cache.set(cacheKey, { ts: Date.now(), roles });
  return roles;
}

// REBATE_ROLES helpers
const getManageMdMatrixRoles = (entityId) =>
  getRolesFor(entityId, 'REBATE_ROLES', 'MANAGE_MD_MATRIX', DEFAULT_MANAGE_MD_MATRIX);

const getManageNonMdMatrixRoles = (entityId) =>
  getRolesFor(entityId, 'REBATE_ROLES', 'MANAGE_NONMD_MATRIX', DEFAULT_MANAGE_NONMD_MATRIX);

const getViewRebatePayoutsRoles = (entityId) =>
  getRolesFor(entityId, 'REBATE_ROLES', 'VIEW_PAYOUTS', DEFAULT_VIEW_REBATE_PAYOUTS);

const getRunMonthlyCloseRoles = (entityId) =>
  getRolesFor(entityId, 'REBATE_ROLES', 'RUN_MONTHLY_CLOSE', DEFAULT_RUN_MONTHLY_CLOSE);

const getMarkPaidRoles = (entityId) =>
  getRolesFor(entityId, 'REBATE_ROLES', 'MARK_PAID', DEFAULT_MARK_PAID);

const getExportBir2307Roles = (entityId) =>
  getRolesFor(entityId, 'REBATE_ROLES', 'EXPORT_BIR_2307', DEFAULT_EXPORT_BIR_2307);

// COMMISSION_ROLES helpers
const getManageCommissionRulesRoles = (entityId) =>
  getRolesFor(entityId, 'COMMISSION_ROLES', 'MANAGE_RULES', DEFAULT_MANAGE_COMMISSION_RULES);

const getViewCommissionPayoutsRoles = (entityId) =>
  getRolesFor(entityId, 'COMMISSION_ROLES', 'VIEW_PAYOUTS', DEFAULT_VIEW_COMMISSION_PAYOUTS);

const getOverrideAutoRatesRoles = (entityId) =>
  getRolesFor(entityId, 'COMMISSION_ROLES', 'OVERRIDE_AUTO_RATES', DEFAULT_OVERRIDE_AUTO_RATES);

/**
 * userHasRebateRole(req, code) / userHasCommissionRole(req, code).
 * Returns true if the requesting user holds any role in the given gate's
 * lookup-driven (or default) role list.
 */
async function userHasRebateRole(req, code) {
  const userRole = req.user?.role;
  if (!userRole) return false;
  let roles;
  switch (code) {
    case 'MANAGE_MD_MATRIX':    roles = await getManageMdMatrixRoles(req.entityId); break;
    case 'MANAGE_NONMD_MATRIX': roles = await getManageNonMdMatrixRoles(req.entityId); break;
    case 'VIEW_PAYOUTS':        roles = await getViewRebatePayoutsRoles(req.entityId); break;
    case 'RUN_MONTHLY_CLOSE':   roles = await getRunMonthlyCloseRoles(req.entityId); break;
    case 'MARK_PAID':           roles = await getMarkPaidRoles(req.entityId); break;
    case 'EXPORT_BIR_2307':     roles = await getExportBir2307Roles(req.entityId); break;
    default:                    return false;
  }
  return Array.isArray(roles) && roles.includes(userRole);
}

async function userHasCommissionRole(req, code) {
  const userRole = req.user?.role;
  if (!userRole) return false;
  let roles;
  switch (code) {
    case 'MANAGE_RULES':        roles = await getManageCommissionRulesRoles(req.entityId); break;
    case 'VIEW_PAYOUTS':        roles = await getViewCommissionPayoutsRoles(req.entityId); break;
    case 'OVERRIDE_AUTO_RATES': roles = await getOverrideAutoRatesRoles(req.entityId); break;
    default:                    return false;
  }
  return Array.isArray(roles) && roles.includes(userRole);
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
  // REBATE_ROLES
  getManageMdMatrixRoles,
  getManageNonMdMatrixRoles,
  getViewRebatePayoutsRoles,
  getRunMonthlyCloseRoles,
  getMarkPaidRoles,
  getExportBir2307Roles,
  // COMMISSION_ROLES
  getManageCommissionRulesRoles,
  getViewCommissionPayoutsRoles,
  getOverrideAutoRatesRoles,
  // gates
  userHasRebateRole,
  userHasCommissionRole,
  // cache
  invalidate,
  // defaults (exported for tests / debugging)
  DEFAULT_MANAGE_MD_MATRIX,
  DEFAULT_MANAGE_NONMD_MATRIX,
  DEFAULT_VIEW_REBATE_PAYOUTS,
  DEFAULT_RUN_MONTHLY_CLOSE,
  DEFAULT_MARK_PAID,
  DEFAULT_EXPORT_BIR_2307,
  DEFAULT_MANAGE_COMMISSION_RULES,
  DEFAULT_VIEW_COMMISSION_PAYOUTS,
  DEFAULT_OVERRIDE_AUTO_RATES,
};
