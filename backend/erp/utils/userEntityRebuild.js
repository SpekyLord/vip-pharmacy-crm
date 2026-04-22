/**
 * User.entity_ids rebuild helper — Phase FRA-A (April 22, 2026).
 *
 * Rebuilds `User.entity_ids` as:
 *     union(entity_ids_static, activeFraEntityIds)
 *
 * `entity_ids_static`    = admin-direct assignments (BDM Management,
 *                          userController.updateUser). Baseline.
 * `activeFraEntityIds`   = `entity_id` from every active+ACTIVE
 *                          FunctionalRoleAssignment whose `person_id`
 *                          links to a PeopleMaster with `user_id = userId`.
 *
 * Called by:
 *   - functionalRoleController (create / update / deactivate / bulkCreate)
 *   - userController.updateUser (when admin writes entity_ids)
 *   - backfillEntityIdsFromFra.js (migration + drift report)
 *
 * Rule #9 mitigation: `entity_ids` is a thin duplication of
 * (entity_ids_static + FRA rows). We accept the duplication because:
 *   - `tenantFilter` hot path reads `entity_ids` on every authenticated
 *     ERP request — inlining FRA queries there would cost ~1ms × 1000s
 *     of requests/day.
 *   - Duplication is guarded by this single rebuild primitive plus
 *     `checkFraEntityIdsSync` in the health check. No other code path
 *     writes both stores.
 *
 * Rule #19 (cross-entity isolation) alignment: adding an entity to
 * `entity_ids` still requires an explicit X-Entity-Id header to be used
 * — `tenantFilter` validates the header against the allowed set. No
 * silent cross-entity writes.
 *
 * Rule #21 (no silent self-fallback) alignment: `resolveOwnerForWrite`
 * behavior unchanged; still throws 403 on cross-entity target.
 */

const User = require('../../models/User');
const PeopleMaster = require('../models/PeopleMaster');
const FunctionalRoleAssignment = require('../models/FunctionalRoleAssignment');

/**
 * Low-level rebuild for a specific User._id.
 *
 * Returns { userId, entity_ids, added, removed, static, fra } OR null if
 * the user does not exist.
 *
 * Writes only if the effective entity_ids changed (no redundant saves).
 */
async function rebuildUserEntityIdsForUser(userId) {
  if (!userId) return null;

  const user = await User.findById(userId).select('entity_ids entity_ids_static name');
  if (!user) return null;

  // Find every PeopleMaster record linked to this user. In most orgs this
  // is 1:1, but the schema allows 1:N (same user across multiple entities
  // as distinct PeopleMasters). Union all their FRA rows.
  const people = await PeopleMaster.find({ user_id: userId }).select('_id').lean();
  const personIds = people.map((p) => p._id);

  let fraEntityIds = [];
  if (personIds.length) {
    const activeFras = await FunctionalRoleAssignment.find({
      person_id: { $in: personIds },
      is_active: true,
      status: 'ACTIVE',
    })
      .select('entity_id')
      .lean();
    fraEntityIds = activeFras
      .map((f) => f.entity_id)
      .filter(Boolean);
  }

  const staticIds = user.entity_ids_static || [];

  // Dedup union preserving ObjectId type (string-keyed Set for uniqueness).
  const seen = new Set();
  const merged = [];
  for (const id of [...staticIds, ...fraEntityIds]) {
    const k = String(id);
    if (!seen.has(k)) {
      seen.add(k);
      merged.push(id);
    }
  }

  const prevKeys = new Set((user.entity_ids || []).map((id) => String(id)));
  const nextKeys = new Set(merged.map((id) => String(id)));

  const added = [...nextKeys].filter((k) => !prevKeys.has(k));
  const removed = [...prevKeys].filter((k) => !nextKeys.has(k));

  if (added.length || removed.length) {
    user.entity_ids = merged;
    await user.save();
  }

  return {
    userId: String(userId),
    userName: user.name || '',
    entity_ids: merged.map(String),
    static: staticIds.map(String),
    fra: fraEntityIds.map(String),
    added,
    removed,
  };
}

/**
 * Rebuild for the User linked to a given PeopleMaster._id.
 * No-op if the person has no linked user_id (e.g., directors not in the
 * auth system) — returns null silently.
 */
async function rebuildUserEntityIdsFromPerson(personId) {
  if (!personId) return null;
  const person = await PeopleMaster.findById(personId).select('user_id').lean();
  if (!person || !person.user_id) return null;
  return rebuildUserEntityIdsForUser(person.user_id);
}

/**
 * Best-effort wrapper — logs and swallows so an FRA mutation's primary
 * persistence is never blocked by a rebuild hiccup. Drift is surfaced by
 * the health check's live DB drift report.
 */
async function safeRebuildFromPerson(personId, context = '') {
  try {
    return await rebuildUserEntityIdsFromPerson(personId);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[FRA] rebuild failed (${context}):`, err && err.message ? err.message : err);
    return null;
  }
}

module.exports = {
  rebuildUserEntityIdsForUser,
  rebuildUserEntityIdsFromPerson,
  safeRebuildFromPerson,
};
