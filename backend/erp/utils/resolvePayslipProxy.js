/**
 * Phase G4.5bb (Apr 29, 2026) — Employee Payslip person-id proxy resolver.
 *
 * Sibling of resolveOwnerScope.js (which handles bdm_id-owned records). The
 * payslip proxy is structurally different: payslips are owned by `person_id`
 * (a PeopleMaster employee/consultant/director), NOT by a BDM-shaped User. So
 * this helper does NOT pick a target on a write — the payslip's `id` URL param
 * already implies the target. Instead it constrains WHICH payslips a clerk
 * (staff with `payroll.payslip_deduction_write` sub-perm) is allowed to
 * mutate.
 *
 * Constraint source: PAYSLIP_PROXY_ROSTER lookup, one row per clerk
 * (`code = <userId-string>`). Admin manages via Control Center → Lookup
 * Tables — no per-clerk admin screen needed (Rule #3 alignment).
 *
 *   metadata.scope_mode:
 *     - 'ALL'           → clerk sees every payslip in entity (default if row
 *                         missing — preserves G4.5aa behavior).
 *     - 'PERSON_IDS'    → clerk only mutates payslips whose person_id is in
 *                         metadata.person_ids[].
 *     - 'PERSON_TYPES'  → clerk only mutates payslips whose person_type is in
 *                         metadata.person_types[] (e.g. ['EMPLOYEE'] gates a
 *                         clerk to non-management staff payslips only).
 *
 * Two-layer gate (matches PROXY_ENTRY_ROLES pattern):
 *   1. Sub-permission `payroll.payslip_deduction_write` ticked on the user.
 *   2. Roster scope_mode allows the specific payslip (or row missing → ALL).
 *
 * President/admin/finance always pass — they don't need the sub-perm or the
 * roster row (matches G4.5a..G4.5aa policy).
 */

const Lookup = require('../models/Lookup');
const { ROLES } = require('../../constants/roles');

const CACHE_TTL_MS = 60_000;
const _rosterCache = new Map();

const SUB_KEY = 'payslip_deduction_write';
const MODULE_KEY = 'payroll';

function isPrivileged(req) {
  if (!req?.user) return false;
  return req.user.role === ROLES.PRESIDENT
      || req.user.role === ROLES.ADMIN
      || req.user.role === ROLES.FINANCE;
}

function hasSubPerm(req) {
  if (!req?.user) return false;
  if (req.user.role === ROLES.PRESIDENT) return true;
  const subs = req.user.erp_access?.sub_permissions?.[MODULE_KEY];
  return !!(subs && subs[SUB_KEY]);
}

async function getRosterForUser(entityId, userId) {
  if (!entityId || !userId) return null;
  const cacheKey = `${entityId}::${String(userId)}`;
  const cached = _rosterCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.row;

  let row = null;
  try {
    row = await Lookup.findOne({
      entity_id: entityId,
      category: 'PAYSLIP_PROXY_ROSTER',
      code: String(userId),
      is_active: true,
    }).lean();
  } catch (err) {
    console.warn('[resolvePayslipProxy] PAYSLIP_PROXY_ROSTER lookup failed:', err.message);
  }
  _rosterCache.set(cacheKey, { ts: Date.now(), row });
  return row;
}

function invalidatePayslipRosterCache(entityId = null, userId = null) {
  if (!entityId) {
    _rosterCache.clear();
    return;
  }
  if (userId) {
    _rosterCache.delete(`${entityId}::${String(userId)}`);
    return;
  }
  const prefix = `${entityId}::`;
  for (const key of Array.from(_rosterCache.keys())) {
    if (key.startsWith(prefix)) _rosterCache.delete(key);
  }
}

/**
 * Returns { scope_mode, person_ids, person_types } describing what the caller
 * may write on. For privileged callers returns { scope_mode: 'ALL', privileged: true }.
 * For staff without sub-perm returns { allowed: false, reason }.
 *
 * Pure read — never throws.
 */
async function getEffectiveRoster(req) {
  if (!req?.user) return { allowed: false, reason: 'No authenticated user' };
  if (isPrivileged(req)) {
    return { allowed: true, privileged: true, scope_mode: 'ALL' };
  }
  if (!hasSubPerm(req)) {
    return {
      allowed: false,
      reason: `Requires payroll.${SUB_KEY} sub-permission or admin/finance/president role.`,
    };
  }
  const row = await getRosterForUser(req.entityId, req.user._id);
  // No roster row → broad access (G4.5aa preserved). Subscribers tighten by
  // creating a PAYSLIP_PROXY_ROSTER row keyed on the clerk's user _id.
  if (!row || !row.metadata) {
    return { allowed: true, scope_mode: 'ALL', has_row: false };
  }
  const meta = row.metadata || {};
  const scope_mode = String(meta.scope_mode || 'ALL').toUpperCase();
  return {
    allowed: true,
    scope_mode,
    has_row: true,
    person_ids: Array.isArray(meta.person_ids) ? meta.person_ids.map(String) : [],
    person_types: Array.isArray(meta.person_types) ? meta.person_types.map(s => String(s).toUpperCase()) : [],
    note: meta.note || null,
  };
}

/**
 * Decide whether the caller may mutate this specific payslip's deduction
 * lines. `payslip` must carry at minimum `person_id` (and `person_id.person_type`
 * if available — falls back to top-level `person_type`).
 *
 * Returns { allowed: bool, reason?: string, scope_mode? }.
 */
async function canWritePayslipDeduction(req, payslip) {
  if (!payslip) return { allowed: false, reason: 'Payslip not provided' };
  const eff = await getEffectiveRoster(req);
  if (!eff.allowed) return eff;
  if (eff.privileged) return { allowed: true, scope_mode: 'ALL', privileged: true };
  if (eff.scope_mode === 'ALL') return { allowed: true, scope_mode: 'ALL' };

  // Resolve the payslip's person_id and person_type from either populated or
  // raw shapes — controllers vary in whether they populate before gating.
  const pid = payslip.person_id?._id || payslip.person_id;
  const ptype = String(
    payslip.person_id?.person_type || payslip.person_type || ''
  ).toUpperCase();

  if (eff.scope_mode === 'PERSON_IDS') {
    if (!pid) return { allowed: false, reason: 'Payslip has no person_id', scope_mode: eff.scope_mode };
    const ok = eff.person_ids.includes(String(pid));
    return ok
      ? { allowed: true, scope_mode: eff.scope_mode }
      : { allowed: false, reason: 'Target employee is not on your payslip-proxy roster.', scope_mode: eff.scope_mode };
  }

  if (eff.scope_mode === 'PERSON_TYPES') {
    if (!ptype) return { allowed: false, reason: 'Payslip has no person_type', scope_mode: eff.scope_mode };
    const ok = eff.person_types.includes(ptype);
    return ok
      ? { allowed: true, scope_mode: eff.scope_mode }
      : { allowed: false, reason: `person_type '${ptype}' is not on your payslip-proxy roster.`, scope_mode: eff.scope_mode };
  }

  // Unknown scope_mode in lookup → fail closed with a hint, so misconfiguration
  // doesn't silently widen access.
  return {
    allowed: false,
    reason: `Unknown scope_mode '${eff.scope_mode}' in PAYSLIP_PROXY_ROSTER. Use ALL, PERSON_IDS, or PERSON_TYPES.`,
    scope_mode: eff.scope_mode,
  };
}

/**
 * For list endpoints (e.g. getPayrollStaging). Returns a Mongoose-style filter
 * fragment that constrains payslips to the caller's roster. Privileged callers
 * and ALL-scope clerks get an empty fragment (no extra filter). Callers not
 * eligible at all get `{ _id: null }` which surfaces an empty list — preferred
 * over an entity-wide fetch followed by client-side filtering.
 */
async function buildRosterFilterFragment(req) {
  const eff = await getEffectiveRoster(req);
  if (!eff.allowed) return { _id: null };
  if (eff.privileged || eff.scope_mode === 'ALL') return {};
  if (eff.scope_mode === 'PERSON_IDS') {
    return { person_id: { $in: eff.person_ids } };
  }
  if (eff.scope_mode === 'PERSON_TYPES') {
    // PeopleMaster.person_type lookup happens via populate; we can't filter
    // payslips directly by populated fields. Caller must post-filter the result
    // OR the controller can pre-resolve PeopleMaster ids matching person_types.
    // Returning a sentinel so the controller knows to use the post-filter path.
    return { __scope_mode: 'PERSON_TYPES', __person_types: eff.person_types };
  }
  return { _id: null };
}

module.exports = {
  SUB_KEY,
  MODULE_KEY,
  getEffectiveRoster,
  canWritePayslipDeduction,
  buildRosterFilterFragment,
  invalidatePayslipRosterCache,
  // Exposed for diagnostics / tests
  _internal: { getRosterForUser, isPrivileged, hasSubPerm },
};
