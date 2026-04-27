/**
 * ERP Module Access Check Middleware (Phase 10.0c)
 *
 * Per-user, per-module permission enforcement.
 * Runs AFTER protect + tenantFilter so req.user is available.
 *
 * Permission levels: NONE (0) → VIEW (1) → FULL (2)
 * FULL satisfies VIEW; VIEW does not satisfy FULL.
 *
 * Role overrides:
 *   president        → always FULL (skip check)
 *   ceo              → always VIEW (block FULL operations)
 *   admin w/o access → VIEW only (was FULL — deprecated in Phase 24A)
 */

const { ROLES } = require('../../constants/roles');
const { isDangerSubPerm } = require('../services/dangerSubPermissions');

const LEVELS = { NONE: 0, VIEW: 1, FULL: 2 };

/**
 * Helper: shared danger-perm check for the "FULL = all granted" fallback.
 * Returns `null` if the caller should proceed, or a { statusCode, message }
 * object if the request must be rejected because the sub-key is danger-tagged.
 *
 * Danger sub-permissions require an EXPLICIT grant via Access Template, even
 * when the user has module-level FULL. President is always allowed upstream.
 * See `services/dangerSubPermissions.js` for the list (baseline + lookup-driven).
 */
async function denyIfDangerFallback(module, subKey, entityId) {
  const fullKey = `${module}.${subKey}`;
  try {
    if (await isDangerSubPerm(fullKey, entityId)) {
      return {
        statusCode: 403,
        message: `Access denied: ${fullKey} is a high-risk operation (e.g. reverse posted journals, hard delete). Module-level FULL does not grant it — an admin must explicitly add it via Access Template → Sub-Permissions.`,
      };
    }
  } catch (err) {
    // Fail-closed on danger check errors — safer to block than grant accidentally.
    console.error('[erpAccessCheck] Danger-perm check failed:', err.message);
    return {
      statusCode: 503,
      message: 'Permission system temporarily unavailable. Please retry.',
    };
  }
  return null;
}

/**
 * Middleware factory: check user's erp_access.modules[module] >= requiredLevel
 * @param {string} module - one of the 10 ERP module keys
 * @param {'VIEW'|'FULL'} requiredLevel - minimum access needed (default VIEW)
 */
const erpAccessCheck = (module, requiredLevel = 'VIEW') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { role, erp_access } = req.user;

    // President always gets full access
    if (role === ROLES.PRESIDENT) return next();

    // CEO gets view-only — block FULL operations
    if (role === ROLES.CEO) {
      if (requiredLevel === 'FULL') {
        return res.status(403).json({
          success: false,
          message: 'CEO role is view-only for ERP modules',
        });
      }
      return next();
    }

    // Backward compat: admin without erp_access enabled gets VIEW (was: full access).
    // This allows legacy admins to still see data while templates are being rolled out.
    // Once all admins have erp_access.enabled, remove this block entirely.
    if (role === ROLES.ADMIN && (!erp_access || !erp_access.enabled)) {
      if (requiredLevel === 'FULL') {
        return res.status(403).json({
          success: false,
          message: 'Admin account requires ERP access template for write operations. Contact president to assign one.',
        });
      }
      return next();
    }

    // If erp_access is not enabled for this user, deny
    if (!erp_access || !erp_access.enabled) {
      return res.status(403).json({
        success: false,
        message: 'ERP access not enabled for your account',
      });
    }

    const userLevel = erp_access.modules?.[module] || 'NONE';

    if ((LEVELS[userLevel] || 0) < (LEVELS[requiredLevel] || 0)) {
      return res.status(403).json({
        success: false,
        message: `Access denied: ${module} module requires ${requiredLevel} permission (you have ${userLevel})`,
      });
    }

    next();
  };
};

/**
 * Sub-module access check (Phase 16)
 *
 * Checks a specific sub-permission within a module.
 * Requires at least VIEW on the parent module.
 *
 * Fall-through rules:
 *   - President → always pass
 *   - Admin w/o erp_access enabled → always pass (backward compat)
 *   - Module = FULL with NO sub_permissions entry → all subs granted
 *   - Module = FULL/VIEW with sub_permissions entry → check specific key
 *
 * @param {string} module - one of the 10 ERP module keys
 * @param {string} subKey - specific sub-permission key (e.g. 'po_create')
 */
const erpSubAccessCheck = (module, subKey) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { role, erp_access } = req.user;

    // President always passes
    if (role === ROLES.PRESIDENT) return next();

    // CEO — view-only, block sub-permission writes
    if (role === ROLES.CEO) {
      return res.status(403).json({
        success: false,
        message: 'CEO role is view-only for ERP modules',
      });
    }

    // Backward compat: admin without erp_access — deny sub-permission writes
    if (role === ROLES.ADMIN && (!erp_access || !erp_access.enabled)) {
      return res.status(403).json({
        success: false,
        message: 'Admin account requires ERP access template for this operation. Contact president to assign one.',
      });
    }

    // If erp_access is not enabled, deny
    if (!erp_access || !erp_access.enabled) {
      return res.status(403).json({
        success: false,
        message: 'ERP access not enabled for your account',
      });
    }

    // Must have at least VIEW on the parent module
    const userLevel = erp_access.modules?.[module] || 'NONE';
    if ((LEVELS[userLevel] || 0) < LEVELS['VIEW']) {
      return res.status(403).json({
        success: false,
        message: `No access to ${module} module`,
      });
    }

    // If no sub_permissions defined for this module:
    // FULL → all subs granted (except danger keys); VIEW → deny
    // Count only truthy entries — stale false values don't count as "defined"
    const moduleSubs = erp_access.sub_permissions?.[module];
    const truthyCount = moduleSubs ? Object.values(moduleSubs).filter(Boolean).length : 0;
    if (!moduleSubs || truthyCount === 0) {
      if (userLevel === 'FULL') {
        // Phase 3a: danger sub-perms require explicit grant even when module is FULL
        const denial = await denyIfDangerFallback(module, subKey, req.entityId);
        if (denial) return res.status(denial.statusCode).json({ success: false, message: denial.message });
        return next();
      }
      return res.status(403).json({
        success: false,
        message: `Access denied: ${module}.${subKey} permission required`,
      });
    }

    // Check specific sub-permission (explicit grants bypass the danger gate — admin took the decision)
    if (moduleSubs[subKey]) return next();

    return res.status(403).json({
      success: false,
      message: `Access denied: ${module}.${subKey} permission required`,
    });
  };
};

/**
 * Approval gate — checks erp_access.can_approve
 * President and admin override (always allowed).
 */
const approvalCheck = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  const { role, erp_access } = req.user;

  // President and admin can always approve
  if (role === ROLES.PRESIDENT || role === ROLES.ADMIN) return next();

  if (erp_access?.can_approve) return next();

  return res.status(403).json({
    success: false,
    message: 'Approval permission required for this action',
  });
};

/**
 * Multi-gate sub-access check — passes if ANY of the given module/subKey pairs match.
 * Useful when a feature spans multiple modules (e.g. credit notes → sales OR purchasing).
 *
 * @param  {...[string, string]} pairs  [module, subKey] tuples
 */
const erpAnySubAccessCheck = (...pairs) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { role, erp_access } = req.user;

    if (role === ROLES.PRESIDENT) return next();
    if (role === ROLES.CEO) {
      return res.status(403).json({ success: false, message: 'CEO role is view-only for ERP modules' });
    }
    if (role === ROLES.ADMIN && (!erp_access || !erp_access.enabled)) {
      return res.status(403).json({
        success: false,
        message: 'Admin account requires ERP access template for this operation.',
      });
    }
    if (!erp_access || !erp_access.enabled) {
      return res.status(403).json({ success: false, message: 'ERP access not enabled for your account' });
    }

    // Check each pair — pass if ANY matches (explicit grants bypass the danger gate).
    // Collect every FULL-fallback candidate (not just the first) so we can prefer
    // non-danger pairs: a legitimate non-danger FULL-fallback should grant access
    // even when some OTHER pair in the group happens to be a danger key.
    const fullFallbackCandidates = [];
    for (const [mod, subKey] of pairs) {
      const userLevel = erp_access.modules?.[mod] || 'NONE';
      if ((LEVELS[userLevel] || 0) < LEVELS['VIEW']) continue; // no access to this module

      const moduleSubs = erp_access.sub_permissions?.[mod];
      const truthyCount = moduleSubs ? Object.values(moduleSubs).filter(Boolean).length : 0;
      if (!moduleSubs || truthyCount === 0) {
        if (userLevel === 'FULL') {
          fullFallbackCandidates.push([mod, subKey]);
        }
        continue;
      }
      if (moduleSubs[subKey]) return next();
    }

    // No explicit grant matched — try each FULL-fallback candidate. First non-danger
    // grant wins. If all candidates are danger, the last denial is surfaced.
    let lastDenial = null;
    for (const [mod, subKey] of fullFallbackCandidates) {
      const denial = await denyIfDangerFallback(mod, subKey, req.entityId);
      if (!denial) return next();
      lastDenial = denial;
    }
    if (lastDenial) {
      return res.status(lastDenial.statusCode).json({ success: false, message: lastDenial.message });
    }

    const labels = pairs.map(([m, s]) => `${m}.${s}`).join(' or ');
    return res.status(403).json({
      success: false,
      message: `Access denied: requires ${labels} permission`,
    });
  };
};

/**
 * Phase MD-1 (Apr 2026) — Composition: legacy role bypass OR sub-permission grant.
 *
 * Used during sub-permission migrations to preserve hardcoded role behavior (the
 * old roleCheck('admin','finance','president') ungated everyone in those roles)
 * while adding lookup-driven delegation to other roles.
 *
 * Calls erpSubAccessCheck under the hood when the role does not match — meaning
 * the danger-fallback gate, ADMIN-without-erp_access fallthrough, and CEO block
 * all still apply for non-bypass paths.
 *
 * Use only for NON-DANGER sub-permissions where you want the legacy role list
 * to keep working. Do NOT use for danger keys (hospital_deactivate, product_delete,
 * etc.) — those must always require explicit grant.
 *
 * Example:
 *   router.post('/', erpRoleOrSubAccessCheck(['admin','finance','president'], 'master', 'hospital_manage'), c.create);
 *
 * @param {string[]} roles - bypass roles (typically ['admin','finance','president'])
 * @param {string} module - one of the 10 ERP module keys
 * @param {string} subKey - specific sub-permission key
 */
const erpRoleOrSubAccessCheck = (roles, module, subKey) => {
  const subCheck = erpSubAccessCheck(module, subKey);
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    if (roles.includes(req.user.role)) return next();
    return subCheck(req, res, next);
  };
};

/**
 * Phase MD-1 (Apr 2026) — Cross-Entity Master Data write capability.
 *
 * Returns true when the user is permitted to write Master Data (ProductMaster
 * primarily) outside their working entity's scope. Hospital and Customer are
 * globally shared by design — the flag is informational for those resources.
 *
 * Eligibility:
 *   - President: always (governs every entity by definition)
 *   - Anyone with `erp_access.sub_permissions.master.cross_entity_write === true`
 *
 * Admin/Finance do NOT auto-pass — explicit grant via Access Template is required
 * (Rule #3 lookup-driven). This keeps the high-trust capability opt-in even for
 * management roles, mirroring the danger-fallback design philosophy.
 *
 * Used in productMasterController.create/update/updateReorderQty/deactivate to
 * bypass the `filter.entity_id = req.entityId` clause and to honor an explicit
 * `req.body.entity_id` on create.
 */
function hasCrossEntityMasterData(user) {
  if (!user) return false;
  if (user.role === ROLES.PRESIDENT) return true;
  return user.erp_access?.sub_permissions?.master?.cross_entity_write === true;
}

module.exports = {
  erpAccessCheck,
  erpSubAccessCheck,
  erpAnySubAccessCheck,
  erpRoleOrSubAccessCheck,
  approvalCheck,
  hasCrossEntityMasterData,
};
