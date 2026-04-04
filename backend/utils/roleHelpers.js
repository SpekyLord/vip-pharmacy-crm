/**
 * CRM role helpers
 *
 * These helpers centralize CRM authorization decisions.
 * ERP-specific authorization remains separate.
 */

const CRM_ADMIN_LIKE_ROLES = ['admin', 'finance', 'president', 'ceo'];

const isCrmAdminLike = (role) => CRM_ADMIN_LIKE_ROLES.includes(role);

module.exports = {
  CRM_ADMIN_LIKE_ROLES,
  isCrmAdminLike,
};
