/**
 * Centralized Role Constants — Single Source of Truth
 *
 * All role strings, permission sets, and helper functions live here.
 * Both CRM and ERP share the same User model and these constants.
 *
 * Roles are system access levels, not employment types:
 *   - contractor: BDMs, IT, cleaners, pharmacists, consultants — all independent contractors
 *   - admin: System administrator
 *   - finance: Finance/accounting manager
 *   - president: Company president — full cross-entity access
 *   - ceo: Chief Executive — view-only on ERP
 *
 * Career progression (bdm_stage) is separate and universal:
 *   CONTRACTOR → PS_ELIGIBLE → TRANSITIONING → SUBSIDIARY → SHAREHOLDER
 */

// ── Individual Role Constants ──────────────────────────────────────
const ROLES = Object.freeze({
  ADMIN: 'admin',
  CONTRACTOR: 'contractor',   // was 'employee' — all non-management workers
  FINANCE: 'finance',
  PRESIDENT: 'president',
  CEO: 'ceo',
  MEDREP: 'medrep',           // legacy CRM role (being removed)
});

// All valid system roles (used by User.js enum)
const ALL_ROLES = [ROLES.ADMIN, ROLES.CONTRACTOR, ROLES.FINANCE, ROLES.PRESIDENT, ROLES.CEO];

// ── Named Permission Sets ──────────────────────────────────────────
const ROLE_SETS = Object.freeze({
  // Every role including legacy
  ALL: [...ALL_ROLES, ROLES.MEDREP],

  // Admin-like: roles that behave as administrators (bypass BDM restrictions)
  ADMIN_LIKE: [ROLES.ADMIN, ROLES.FINANCE, ROLES.PRESIDENT, ROLES.CEO],

  // President-level: cross-entity superusers
  PRESIDENT_ROLES: [ROLES.PRESIDENT, ROLES.CEO],

  // ERP All: every role that can access ERP pages
  ERP_ALL: [ROLES.CONTRACTOR, ROLES.ADMIN, ROLES.FINANCE, ROLES.PRESIDENT],

  // BDM + Admin: CRM field routes
  BDM_ADMIN: [ROLES.CONTRACTOR, ROLES.ADMIN],

  // Admin Only: CRM admin-exclusive routes
  ADMIN_ONLY: [ROLES.ADMIN],

  // ERP Finance: contractor + admin + finance
  ERP_FINANCE: [ROLES.CONTRACTOR, ROLES.ADMIN, ROLES.FINANCE],

  // Management: admin + finance + president (write access to config)
  MANAGEMENT: [ROLES.ADMIN, ROLES.FINANCE, ROLES.PRESIDENT],
});

// ── Helper Functions ───────────────────────────────────────────────
const isAdminLike = (role) => ROLE_SETS.ADMIN_LIKE.includes(role);
const isPresidentLike = (role) => ROLE_SETS.PRESIDENT_ROLES.includes(role);

module.exports = { ROLES, ALL_ROLES, ROLE_SETS, isAdminLike, isPresidentLike };
