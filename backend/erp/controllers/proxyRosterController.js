/**
 * Proxy Roster Controller — Phase G4.5ff (May 5, 2026).
 *
 * Returns the narrow list of users a logged-in caller can pick as the OWNER of
 * a proxy-entry transaction (the "Record on behalf of" dropdown). Mounted
 * OUTSIDE the `erpAccessCheck('people')` gate because BDM-shaped callers who
 * have been granted `<module>.proxy_entry` (lookup-driven, Rule #3) don't
 * need full /erp/people read access — they only need the candidate list of
 * proxy targets for the specific module they're working in.
 *
 * Authorization: `canProxyEntry(req, module)` from resolveOwnerScope.js.
 *   1. Caller's role must be in PROXY_ENTRY_ROLES.<MODULE> lookup
 *   2. Caller must have erp_access.sub_permissions.<module>.<subKey> ticked
 *   President always passes. CEO always denied.
 *
 * Returned shape (minimal PII):
 *   { _id, name, role, entity_id }
 *
 * Scoping:
 *   - Always entity-scoped to the caller's working entity (req.entityId).
 *     Rule #21 — cross-entity proxy is blocked at the write layer
 *     (resolveOwnerForWrite), so widening the picker beyond the working entity
 *     would surface candidates the user can't actually file under.
 *   - Filtered by VALID_OWNER_ROLES.<MODULE>.metadata.roles (lookup-driven).
 *
 * Cache: none — the user list changes more often than role allowlists, and
 * the response is small (BDM headcount per entity).
 */

const catchAsync = require('../../middleware/errorHandler').catchAsync;
const User = require('../../models/User');
const {
  canProxyEntry,
  getValidOwnerRolesForModule,
} = require('../utils/resolveOwnerScope');

/**
 * GET /erp/proxy-roster/:moduleLookup?subKey=proxy_entry
 *
 * :moduleLookup — uppercase code matching PROXY_ENTRY_ROLES.<code> and
 *                  VALID_OWNER_ROLES.<code> (e.g. SALES, OPENING_AR, EXPENSES).
 *                  We re-derive moduleKey by lowercasing — the module key is
 *                  the same as the lookup code for every Phase G4.5a-aware
 *                  module so far.
 * ?subKey       — optional sub-permission key, defaults to 'proxy_entry'.
 *                  Modules with split-permission flows (e.g. opening_ar_proxy)
 *                  pass it explicitly.
 */
const getProxyRoster = catchAsync(async (req, res) => {
  const lookupCode = String(req.params.moduleLookup || '').toUpperCase();
  if (!lookupCode) {
    return res.status(400).json({ success: false, message: 'moduleLookup param required' });
  }
  // Module key: convention is lower-cased lookup code. For shared sub-perm
  // namespaces (e.g. CAR_LOGBOOK rides on `expenses` module) the caller can
  // override via ?moduleKey=expenses.
  const moduleKey = String(req.query.moduleKey || lookupCode.toLowerCase());
  const subKey = String(req.query.subKey || 'proxy_entry');

  const { canProxy } = await canProxyEntry(req, moduleKey, { subKey, lookupCode });
  if (!canProxy) {
    return res.status(403).json({
      success: false,
      message: `Proxy entry not authorized for ${lookupCode}.${subKey}. Ask admin to grant the sub-permission via Access Template, or extend PROXY_ENTRY_ROLES.${lookupCode} to your role.`,
    });
  }

  const validOwnerRoles = await getValidOwnerRolesForModule(req.entityId, moduleKey, lookupCode);
  if (!validOwnerRoles?.length) {
    return res.json({ success: true, data: [] });
  }

  // Entity-scoped: include users whose primary entity_id OR multi-entity
  // entity_ids array contains the caller's working entity. Matches the write
  // path's tenant check (resolveOwnerForWrite line 211).
  const entityScope = req.entityId
    ? { $or: [{ entity_id: req.entityId }, { entity_ids: req.entityId }] }
    : {};

  const users = await User.find({
    ...entityScope,
    role: { $in: validOwnerRoles },
    isActive: { $ne: false },
  })
    .select('name role entity_id')
    .sort({ name: 1 })
    .limit(500)
    .lean();

  // Exclude the caller from the roster — picking yourself is the "Self" option
  // already rendered as the empty-value default in OwnerPicker.
  const callerId = String(req.user._id);
  const data = users
    .filter((u) => String(u._id) !== callerId)
    .map((u) => ({
      _id: u._id,
      name: u.name,
      role: u.role,
      entity_id: u.entity_id,
    }));

  res.json({ success: true, data, validOwnerRoles });
});

module.exports = { getProxyRoster };
