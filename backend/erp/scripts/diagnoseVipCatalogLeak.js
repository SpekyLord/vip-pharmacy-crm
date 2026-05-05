/**
 * Read-only: simulate exactly what GET /products?catalog=true returns when
 * the working entity is VIP. Filters by Viprazole only to keep output small.
 *
 * If MG and CO's Viprazole row appears in this output, then the catalog API
 * is leaking foreign-entity products to the parent — a separate bug. If
 * only VIP's row appears, then today's GRN error came from a stale draft
 * or pre-fill, not a dropdown leak.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const ProductMaster = require('../models/ProductMaster');
const Entity = require('../models/Entity');
const Lookup = require('../models/Lookup');

const VIP_ID = '69cd76ec7f6beb5888bd1a53';

async function resolveProductEntityIds(entityId) {
  if (!entityId) return [];
  const entity = await Entity.findById(entityId).select('entity_type parent_entity_id').lean();
  if (!entity) return [entityId];
  if (entity.entity_type !== 'SUBSIDIARY' || !entity.parent_entity_id) return [entityId];
  const accessEntry = await Lookup.findOne({
    entity_id: entityId,
    category: 'PRODUCT_CATALOG_ACCESS',
    code: 'INHERIT_PARENT',
    is_active: true,
  }).lean();
  if (accessEntry) return [entityId, entity.parent_entity_id];
  return [entityId];
}

(async () => {
  await connectDB();

  for (const [name, entityId] of [
    ['VIP', VIP_ID],
    ['MG and CO', '69cd76ec7f6beb5888bd1a56'],
  ]) {
    console.log(`\n── Catalog as working entity = ${name} (${entityId}) ──`);
    const ids = await resolveProductEntityIds(entityId);
    console.log(`  resolveProductEntityIds → ${JSON.stringify(ids)}`);
    const filter = ids.length > 1 ? { entity_id: { $in: ids } } : { entity_id: entityId };
    filter.brand_name = 'Viprazole';
    const rows = await ProductMaster.find(filter).select('_id entity_id brand_name dosage_strength selling_uom unit_code is_active').lean();
    for (const r of rows) {
      const ent = await Entity.findById(r.entity_id).select('entity_name').lean();
      console.log(`  ${r._id}  ${r.brand_name} ${r.dosage_strength} (${r.unit_code || 'PC'})  entity=${ent?.entity_name}  active=${r.is_active}`);
    }
  }

  console.log('\n── Cross-check: how many ProductMaster rows total per entity ──');
  const counts = await ProductMaster.aggregate([
    { $group: { _id: '$entity_id', n: { $sum: 1 } } },
  ]);
  for (const c of counts) {
    const ent = await Entity.findById(c._id).select('entity_name').lean();
    console.log(`  ${ent?.entity_name || c._id}  → ${c.n} products`);
  }

  console.log('\n── Sibling pair check: same item_key, different entities ──');
  const dups = await ProductMaster.aggregate([
    { $group: { _id: '$item_key', count: { $sum: 1 }, ids: { $push: '$_id' }, entities: { $push: '$entity_id' } } },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 20 },
  ]);
  console.log(`  Total item_keys with cross-entity siblings: ${dups.length}`);
  for (const d of dups.slice(0, 10)) {
    console.log(`  ${d._id} appears ${d.count}x across entities`);
  }

  await mongoose.disconnect();
})().catch((e) => { console.error(e); mongoose.disconnect(); process.exit(1); });
