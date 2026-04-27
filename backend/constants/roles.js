/**
 * Centralized Role Constants — Single Source of Truth
 *
 * All role strings, permission sets, and helper functions live here.
 * Both CRM and ERP share the same User model and these constants.
 *
 * ── System roles (auth tier — what ERP/CRM features you can access) ──
 *   - staff:     Non-management workers — BDMs, consultants, pharmacists,
 *                IT, cleaners, actual W-2 employees. The auth tier is the
 *                same regardless of employment type. Employment nature
 *                (contractor vs. employee) lives on PeopleMaster.employment_type
 *                (REGULAR / PROBATIONARY / CONTRACTUAL / CONSULTANT / PARTNERSHIP).
 *   - admin:      System administrator
 *   - finance:    Finance/accounting manager
 *   - president:  Company president — full cross-entity access
 *   - ceo:        Chief Executive — view-only on ERP
 *   - bookkeeper: External or in-house BIR filing operator. Phase VIP-1.J
 *                 (Apr 2026). Sees /erp/bir + Trial Balance + COA. Cannot
 *                 see payroll, payslips, incentive-payouts, rebate-payouts.
 *                 Lookup-driven access via BIR_ROLES so subscribers configure
 *                 per-entity gates without a code deployment.
 *
 * ── Legacy strings (migrated away in Phase S2, Apr 2026) ──
 *   'contractor' and 'employee' were both renamed to 'staff'. The migration
 *   script at backend/scripts/migrateEmployeeToContractor.js normalizes
 *   existing DB records (users.role AND lookups.metadata.roles arrays).
 *   The enum below does NOT accept those strings any more — new inserts
 *   carrying them fail Mongoose validation.
 *
 * ── Career progression (PeopleMaster.bdm_stage) is separate and universal ──
 *   CONTRACTOR → PS_ELIGIBLE → TRANSITIONING → SUBSIDIARY → SHAREHOLDER
 *   (The 'CONTRACTOR' stage code is a career-ladder rung, not the auth role.)
 */

// ── Individual Role Constants ──────────────────────────────────────
const ROLES = Object.freeze({
  ADMIN: 'admin',
  STAFF: 'staff',             // non-management auth tier (replaces 'contractor' / 'employee')
  // DEPRECATED alias (Phase S2 transition): legacy code still referencing
  // `ROLES.CONTRACTOR` resolves to 'staff' so the symbol keeps working until
  // every call site is swept in a follow-up commit. New code should use
  // `ROLES.STAFF`. Both names map to the same enum value, so User.role
  // saves remain correct either way.
  CONTRACTOR: 'staff',
  FINANCE: 'finance',
  PRESIDENT: 'president',
  CEO: 'ceo',
  BOOKKEEPER: 'bookkeeper',   // Phase VIP-1.J — taxes-only auth tier (BIR filing operator)
  MEDREP: 'medrep',           // legacy CRM role (being removed in CRM Phase A, Change 1)
});

// All valid system roles (used by User.js enum — rejects legacy strings).
// STAFF is listed once; CONTRACTOR alias shares the same value so Object.values
// would de-dup to the same set.
const ALL_ROLES = [ROLES.ADMIN, ROLES.STAFF, ROLES.FINANCE, ROLES.PRESIDENT, ROLES.CEO, ROLES.BOOKKEEPER, ROLES.MEDREP];

// ── Named Permission Sets ──────────────────────────────────────────
const ROLE_SETS = Object.freeze({
  // Every role
  ALL: [...ALL_ROLES],

  // Admin-like: roles that behave as administrators (bypass BDM restrictions)
  ADMIN_LIKE: [ROLES.ADMIN, ROLES.FINANCE, ROLES.PRESIDENT, ROLES.CEO],

  // President-level: cross-entity superusers
  PRESIDENT_ROLES: [ROLES.PRESIDENT, ROLES.CEO],

  // ERP All: every role that can access ERP pages
  ERP_ALL: [ROLES.STAFF, ROLES.ADMIN, ROLES.FINANCE, ROLES.PRESIDENT],

  // Staff + Admin: CRM field routes (visit logging, etc.)
  BDM_ADMIN: [ROLES.STAFF, ROLES.ADMIN],

  // Admin Only: CRM admin-exclusive routes
  ADMIN_ONLY: [ROLES.ADMIN],

  // ERP Finance: staff + admin + finance
  ERP_FINANCE: [ROLES.STAFF, ROLES.ADMIN, ROLES.FINANCE],

  // Management: admin + finance + president (write access to config)
  MANAGEMENT: [ROLES.ADMIN, ROLES.FINANCE, ROLES.PRESIDENT],

  // BIR-only auth tiers — sees /erp/bir + Trial Balance + COA, nothing else.
  // Bookkeeper-level read; admin/finance/president retain full access.
  BIR_FILING: [ROLES.ADMIN, ROLES.FINANCE, ROLES.PRESIDENT, ROLES.BOOKKEEPER],
});

// ── Helper Functions ───────────────────────────────────────────────
const isAdminLike = (role) => ROLE_SETS.ADMIN_LIKE.includes(role);
const isPresidentLike = (role) => ROLE_SETS.PRESIDENT_ROLES.includes(role);

module.exports = { ROLES, ALL_ROLES, ROLE_SETS, isAdminLike, isPresidentLike };
