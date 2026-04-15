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

const LEVELS = { NONE: 0, VIEW: 1, FULL: 2 };

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
  return (req, res, next) => {
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
    // FULL → all subs granted; VIEW → deny (VIEW = read-only, no write sub-functions)
    // Count only truthy entries — stale false values don't count as "defined"
    const moduleSubs = erp_access.sub_permissions?.[module];
    const truthyCount = moduleSubs ? Object.values(moduleSubs).filter(Boolean).length : 0;
    if (!moduleSubs || truthyCount === 0) {
      if (userLevel === 'FULL') return next();
      return res.status(403).json({
        success: false,
        message: `Access denied: ${module}.${subKey} permission required`,
      });
    }

    // Check specific sub-permission
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

module.exports = { erpAccessCheck, erpSubAccessCheck, approvalCheck };
