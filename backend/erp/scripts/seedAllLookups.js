/**
 * Seed ALL lookup categories for every entity.
 * Idempotent — uses upsert so existing items are not overwritten.
 *
 * Usage: node backend/erp/scripts/seedAllLookups.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const Lookup = require('../models/Lookup');

// Import SEED_DEFAULTS from the controller
const SEED_DEFAULTS = require('../controllers/lookupGenericController').SEED_DEFAULTS;

async function seedAllLookups() {
  await connectDB();

  // Get all entities (Mongoose model name 'Entity' → collection 'entities')
  const Entity = require('../models/Entity');
  const entities = await Entity.find({}).lean();
  if (!entities.length) {
    console.log('No entities found. Nothing to seed.');
    return;
  }

  const categoryCount = Object.keys(SEED_DEFAULTS).length;
  console.log(`Found ${entities.length} entities. Seeding ${categoryCount} lookup categories for each...\n`);

  for (const entity of entities) {
    const entityId = entity._id;
    console.log(`── Entity: ${entity.name || entity._id} ──`);

    let totalInserted = 0;
    for (const [category, defaults] of Object.entries(SEED_DEFAULTS)) {
      const ops = defaults.map((item, i) => {
        const isObj = typeof item === 'object';
        const label = isObj ? item.label : item;
        const code = isObj ? item.code.toUpperCase() : label.toUpperCase().replace(/[^A-Z0-9]/g, '_');
        return {
          updateOne: {
            filter: { entity_id: entityId, category, code },
            update: { $setOnInsert: { label, sort_order: i * 10, is_active: true, metadata: isObj ? (item.metadata || {}) : {} } },
            upsert: true
          }
        };
      });
      const result = await Lookup.bulkWrite(ops);
      const inserted = result.upsertedCount || 0;
      if (inserted > 0) {
        console.log(`  ✓ ${category}: ${inserted} new items`);
        totalInserted += inserted;
      }
    }

    const populated = await Lookup.distinct('category', { entity_id: entityId });
    console.log(`  → ${populated.length}/${categoryCount} categories populated (${totalInserted} new items)\n`);
  }

  console.log('Done.');
}

if (require.main === module) {
  seedAllLookups()
    .then(() => mongoose.disconnect())
    .catch(err => {
      console.error('Seed error:', err);
      mongoose.disconnect();
      process.exit(1);
    });
}

module.exports = seedAllLookups;
