/**
 * Centralized Role Constants — Frontend Mirror
 *
 * Must stay in sync with backend/constants/roles.js.
 * Both CRM and ERP share the same User model and these constants.
 */

// ── Individual Role Constants ──────────────────────────────────────
export const ROLES = Object.freeze({
  ADMIN: 'admin',
  CONTRACTOR: 'contractor',   // was 'employee' — all non-management workers
  FINANCE: 'finance',
  PRESIDENT: 'president',
  CEO: 'ceo',
  MEDREP: 'medrep',           // legacy CRM role (being removed)
});

// All valid system roles
export const ALL_ROLES = [ROLES.ADMIN, ROLES.CONTRACTOR, ROLES.FINANCE, ROLES.PRESIDENT, ROLES.CEO];

// ── Named Permission Sets ──────────────────────────────────────────
export const ROLE_SETS = Object.freeze({
  ALL: [...ALL_ROLES, ROLES.MEDREP],
  ADMIN_LIKE: [ROLES.ADMIN, ROLES.FINANCE, ROLES.PRESIDENT, ROLES.CEO],
  PRESIDENT_ROLES: [ROLES.PRESIDENT, ROLES.CEO],
  ERP_ALL: [ROLES.CONTRACTOR, ROLES.ADMIN, ROLES.FINANCE, ROLES.PRESIDENT],
  BDM_ADMIN: [ROLES.CONTRACTOR, ROLES.ADMIN],
  ADMIN_ONLY: [ROLES.ADMIN],
  ERP_FINANCE: [ROLES.CONTRACTOR, ROLES.ADMIN, ROLES.FINANCE],
  MANAGEMENT: [ROLES.ADMIN, ROLES.FINANCE, ROLES.PRESIDENT],
});

// ── Helper Functions ───────────────────────────────────────────────
export const isAdminLike = (role) => ROLE_SETS.ADMIN_LIKE.includes(role);
export const isPresidentLike = (role) => ROLE_SETS.PRESIDENT_ROLES.includes(role);
