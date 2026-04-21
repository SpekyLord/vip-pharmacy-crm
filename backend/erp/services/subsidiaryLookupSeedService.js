/**
 * Subsidiary Lookup Seed Service
 *
 * Reusable logic for copy-seeding a subsidiary entity's Lookup rows from
 * a reference entity (parent). Used by:
 *   - scripts/seedSubsidiaryLookups.js (CLI, on-demand)
 *   - models/Entity.js post('save') hook (automatic for new subsidiaries)
 *
 * Design: idempotent via upsert on (entity_id, category, code) with
 * $setOnInsert — never overwrites existing target rows. Subscriber-safe.
 *
 * Scope: Lookup model only. Does NOT touch Settings, ErpAccessTemplate,
 * ProductMaster, Warehouse, or any transactional data.
 */
const Lookup = require('../models/Lookup');

/**
 * Seed target entity's Lookup rows from reference.
 *
 * @param {Object} params
 * @param {ObjectId} params.targetEntityId — entity receiving rows
 * @param {ObjectId} params.referenceEntityId — entity to copy from
 * @param {Object} [params.opts]
 * @param {string} [params.opts.category] — restrict to one category
 * @param {boolean} [params.opts.dryRun] — if true, scan only, no writes
 * @returns {Promise<{scanned, missingByCategory, missingTotal, seeded, elapsed_ms}>}
 */
async function seedSubsidiaryLookups({ targetEntityId, referenceEntityId, opts = {} }) {
  const started = Date.now();

  if (!targetEntityId || !referenceEntityId) {
    throw new Error('targetEntityId and referenceEntityId are required');
  }
  if (targetEntityId.toString() === referenceEntityId.toString()) {
    throw new Error('targetEntityId and referenceEntityId must differ');
  }

  const baseFilter = opts.category ? { category: String(opts.category).toUpperCase() } : {};

  const [refRows, tgtRows] = await Promise.all([
    Lookup.find({ ...baseFilter, entity_id: referenceEntityId }).lean(),
    Lookup.find({ ...baseFilter, entity_id: targetEntityId }).lean(),
  ]);

  const tgtIndex = new Set(tgtRows.map(r => `${r.category}::${r.code}`));
  const missing = refRows.filter(r => !tgtIndex.has(`${r.category}::${r.code}`));

  const missingByCategory = {};
  for (const r of missing) {
    missingByCategory[r.category] = (missingByCategory[r.category] || 0) + 1;
  }

  if (opts.dryRun) {
    return {
      scanned: refRows.length,
      missingByCategory,
      missingTotal: missing.length,
      seeded: 0,
      elapsed_ms: Date.now() - started,
    };
  }

  let seeded = 0;
  for (const src of missing) {
    const copy = {
      entity_id: targetEntityId,
      category: src.category,
      code: src.code,
      label: src.label,
      sort_order: src.sort_order,
      is_active: src.is_active,
      metadata: src.metadata || {},
    };
    await Lookup.updateOne(
      { entity_id: targetEntityId, category: src.category, code: src.code },
      { $setOnInsert: copy },
      { upsert: true }
    );
    seeded++;
  }

  return {
    scanned: refRows.length,
    missingByCategory,
    missingTotal: missing.length,
    seeded,
    elapsed_ms: Date.now() - started,
  };
}

/**
 * Resolve the reference (parent) entity for a given target. Uses
 * target.parent_entity_id if set, else falls back to the first PARENT-type
 * entity in the collection. Returns null if none found.
 *
 * @param {Document} targetDoc — Entity mongoose doc
 * @returns {Promise<ObjectId|null>}
 */
async function resolveReferenceEntityId(targetDoc) {
  if (targetDoc.parent_entity_id) return targetDoc.parent_entity_id;
  // lazy require to avoid circular
  const Entity = require('../models/Entity');
  const parent = await Entity.findOne({ entity_type: 'PARENT', status: 'ACTIVE' })
    .select('_id')
    .lean();
  return parent ? parent._id : null;
}

module.exports = { seedSubsidiaryLookups, resolveReferenceEntityId };
