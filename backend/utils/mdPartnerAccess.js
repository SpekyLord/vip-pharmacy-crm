/**
 * MD Partner access helper — Phase VIP-1.A (Apr 2026).
 *
 * Lookup-driven role gates for the MD Partner Lead Pipeline. Mirrors the
 * PROXY_ENTRY_ROLES lazy-seed-from-defaults pattern in
 * backend/erp/utils/resolveOwnerScope.js so subscribers can extend or restrict
 * the gates per-entity via Control Center → Lookup Tables → MD_PARTNER_ROLES
 * without a code deployment (Rule #3, subscription-readiness).
 *
 * Three keys, all gated independently:
 *   - VIEW_LEADS          — list the lead pipeline (admin/president by default)
 *   - MANAGE_PARTNERSHIP  — drive LEAD/CONTACTED/VISITED transitions on any record
 *                           (BDM-on-own-record bypass is enforced separately in the
 *                           controller — this gate is for cross-record management)
 *   - SET_AGREEMENT_DATE  — promote to PARTNER + set partner_agreement_date.
 *                           This is the rebate-engine gate #2 trigger; mistakenly
 *                           setting it means a Doctor becomes rebate-eligible.
 *                           Default = president-only would be safer, but the
 *                           field is reversible until VIP-1.B's MdProductRebate
 *                           ships, so admin is acceptable for the foundation.
 *
 * Cache TTL is 60s (matches resolveOwnerScope.js). Invalidated on Lookup save
 * via the standard Lookup Manager controller path (Phase 24).
 */

const Lookup = require('../erp/models/Lookup');
const { ROLES } = require('../constants/roles');

const DEFAULT_VIEW_LEADS = [ROLES.ADMIN, ROLES.PRESIDENT];
const DEFAULT_MANAGE_PARTNERSHIP = [ROLES.ADMIN, ROLES.PRESIDENT];
const DEFAULT_SET_AGREEMENT_DATE = [ROLES.ADMIN, ROLES.PRESIDENT];

const TTL_MS = 60_000;
const _cache = new Map();

async function getRolesFor(entityId, code, defaults) {
  const cacheKey = `${entityId || '__GLOBAL__'}::${code}`;
  const hit = _cache.get(cacheKey);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.roles;

  let roles = defaults;
  try {
    const filter = { category: 'MD_PARTNER_ROLES', code, is_active: true };
    if (entityId) filter.entity_id = entityId;
    const doc = await Lookup.findOne(filter).lean();
    if (doc?.metadata?.roles && Array.isArray(doc.metadata.roles) && doc.metadata.roles.length) {
      roles = doc.metadata.roles;
    }
  } catch (err) {
    // Lookup query failed (DB transient, missing model, etc.) — fall back to inline
    // defaults so the page never goes dark on a Lookup outage. Same posture as
    // resolveOwnerScope.js + expenseClassifier.js.
    console.warn(`[mdPartnerAccess] MD_PARTNER_ROLES lookup failed for ${code}, using defaults:`, err.message);
  }

  _cache.set(cacheKey, { ts: Date.now(), roles });
  return roles;
}

const getViewLeadsRoles = (entityId) =>
  getRolesFor(entityId, 'VIEW_LEADS', DEFAULT_VIEW_LEADS);

const getManagePartnershipRoles = (entityId) =>
  getRolesFor(entityId, 'MANAGE_PARTNERSHIP', DEFAULT_MANAGE_PARTNERSHIP);

const getSetAgreementDateRoles = (entityId) =>
  getRolesFor(entityId, 'SET_AGREEMENT_DATE', DEFAULT_SET_AGREEMENT_DATE);

/**
 * Bust the role cache. Pass entityId for targeted bust, omit for full clear.
 * Wire this into the Lookup Manager save path (Phase 24 ControlCenter)
 * whenever an MD_PARTNER_ROLES row is added/edited/deleted.
 */
function invalidate(entityId) {
  if (!entityId) {
    _cache.clear();
    return;
  }
  const prefix = `${entityId}::`;
  for (const key of Array.from(_cache.keys())) {
    if (key.startsWith(prefix)) _cache.delete(key);
  }
}

module.exports = {
  getViewLeadsRoles,
  getManagePartnershipRoles,
  getSetAgreementDateRoles,
  invalidate,
  DEFAULT_VIEW_LEADS,
  DEFAULT_MANAGE_PARTNERSHIP,
  DEFAULT_SET_AGREEMENT_DATE,
};
