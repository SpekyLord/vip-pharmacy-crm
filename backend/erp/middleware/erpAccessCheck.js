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
 *   admin w/o access → FULL (backward compat — existing admins keep working)
 */

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
    if (role === 'president') return next();

    // CEO gets view-only — block FULL operations
    if (role === 'ceo') {
      if (requiredLevel === 'FULL') {
        return res.status(403).json({
          success: false,
          message: 'CEO role is view-only for ERP modules',
        });
      }
      return next();
    }

    // Backward compat: admin without erp_access enabled = full access to everything
    if (role === 'admin' && (!erp_access || !erp_access.enabled)) {
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
 * Approval gate — checks erp_access.can_approve
 * President and admin override (always allowed).
 */
const approvalCheck = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  const { role, erp_access } = req.user;

  // President and admin can always approve
  if (role === 'president' || role === 'admin') return next();

  if (erp_access?.can_approve) return next();

  return res.status(403).json({
    success: false,
    message: 'Approval permission required for this action',
  });
};

module.exports = { erpAccessCheck, approvalCheck };
