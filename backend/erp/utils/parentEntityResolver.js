/**
 * parentEntityResolver.js
 *
 * Returns the list of ACTIVE PARENT entity IDs for use in notification /
 * approval recipient queries. A "cross-entity superuser" is a president or
 * CEO whose `entity_id` is a PARENT entity — they legitimately see every
 * subsidiary's events. Subsidiary presidents (e.g. BALAI LAWAAN's Angeline)
 * must be scoped to their own entity only, otherwise they receive parent's
 * and siblings' approvals/alerts they have no business seeing.
 *
 * Replaces the broad `{ role: { $in: ROLE_SETS.PRESIDENT_ROLES } }` escape
 * clause that unconditionally matched ALL presidents/CEOs.
 *
 * Cached for 60s per process — parent entities change at most once per
 * subsidiary onboarding; cache drift is harmless.
 */

const Entity = require('../models/Entity');

let _cache = { at: 0, ids: null };

const getParentEntityIds = async () => {
  const now = Date.now();
  if (_cache.ids && now - _cache.at < 60_000) return _cache.ids;
  const rows = await Entity.find({ entity_type: 'PARENT', status: 'ACTIVE' })
    .select('_id').lean();
  const ids = rows.map(r => r._id);
  _cache = { at: now, ids };
  return ids;
};

module.exports = { getParentEntityIds };
