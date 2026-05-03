/**
 * Centralized Role Constants — Frontend Mirror
 *
 * Must stay in sync with backend/constants/roles.js.
 * Both CRM and ERP share the same User model and these constants.
 *
 * Phase S2 (Apr 2026): 'contractor' and 'employee' were both renamed to
 * 'staff'. The legacy symbol ROLES.CONTRACTOR resolves to 'staff' so legacy
 * call sites keep compiling until every reference is swept.
 */

// ── Individual Role Constants ──────────────────────────────────────
export const ROLES = Object.freeze({
  ADMIN: 'admin',
  STAFF: 'staff',             // non-management auth tier (replaces 'contractor' / 'employee')
  // DEPRECATED alias (Phase S2 transition): legacy code still referencing
  // `ROLES.CONTRACTOR` resolves to 'staff' so the symbol keeps working until
  // every call site is swept. New code should use `ROLES.STAFF`.
  CONTRACTOR: 'staff',
  FINANCE: 'finance',
  PRESIDENT: 'president',
  CEO: 'ceo',
  // Phase VIP-1.J — taxes-only auth tier for the external/in-house bookkeeper.
  // Mirrors backend/constants/roles.js. Sees only /erp/bir + form-detail
  // pages; backend select:false on payroll fields.
  BOOKKEEPER: 'bookkeeper',
  MEDREP: 'medrep',           // legacy CRM role (being removed in CRM Phase A, Change 1)
});

// All valid system roles
export const ALL_ROLES = [ROLES.ADMIN, ROLES.STAFF, ROLES.FINANCE, ROLES.PRESIDENT, ROLES.CEO, ROLES.BOOKKEEPER, ROLES.MEDREP];

// ── Named Permission Sets ──────────────────────────────────────────
export const ROLE_SETS = Object.freeze({
  ALL: [...ALL_ROLES],
  ADMIN_LIKE: [ROLES.ADMIN, ROLES.FINANCE, ROLES.PRESIDENT, ROLES.CEO],
  PRESIDENT_ROLES: [ROLES.PRESIDENT, ROLES.CEO],
  ERP_ALL: [ROLES.STAFF, ROLES.ADMIN, ROLES.FINANCE, ROLES.PRESIDENT],
  BDM_ADMIN: [ROLES.STAFF, ROLES.ADMIN],
  ADMIN_ONLY: [ROLES.ADMIN],
  ERP_FINANCE: [ROLES.STAFF, ROLES.ADMIN, ROLES.FINANCE],
  MANAGEMENT: [ROLES.ADMIN, ROLES.FINANCE, ROLES.PRESIDENT],
  // Phase VIP-1.J — BIR Compliance Dashboard guard. Backend layers
  // BIR_ROLES lookup gates per scope (VIEW_DASHBOARD / EXPORT_FORM /
  // MARK_FILED / ...) — frontend route-guard is just the broad set.
  // Pre-J2 this set was undefined which short-circuited the route guard
  // entirely (ProtectedRoute defaults to allowedRoles=[] → no gate).
  BIR_FILING: [ROLES.ADMIN, ROLES.FINANCE, ROLES.PRESIDENT, ROLES.BOOKKEEPER],
});

// ── Helper Functions ───────────────────────────────────────────────
export const isAdminLike = (role) => ROLE_SETS.ADMIN_LIKE.includes(role);
export const isPresidentLike = (role) => ROLE_SETS.PRESIDENT_ROLES.includes(role);
