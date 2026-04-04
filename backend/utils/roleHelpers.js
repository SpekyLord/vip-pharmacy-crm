/**
 * CRM role helpers
 *
 * These helpers intentionally apply to CRM authorization/access checks.
 * ERP-specific auth remains in ERP middleware/routes.
 */

const CRM_ADMIN_LIKE_ROLES = ['admin', 'finance', 'president', 'ceo'];

const isCrmAdminLike = (role) => CRM_ADMIN_LIKE_ROLES.includes(role);

module.exports = {
  CRM_ADMIN_LIKE_ROLES,
  isCrmAdminLike,
};

