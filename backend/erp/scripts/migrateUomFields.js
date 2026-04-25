/* eslint-disable vip-tenant/require-entity-filter -- standalone admin/migration/diagnostic script: no req context; intentional cross-entity reads/writes for ops work */
/**
 * Migration Script: Backfill UOM fields on ProductMaster
 *
 * Sets selling_uom = unit_code, purchase_uom = unit_code, conversion_factor = 1
 * for all existing products where these fields are not yet set.
 *
 * Safe to run multiple times — only updates documents missing the fields.
 *
 * Usage: node backend/erp/scripts/migrateUomFields.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const db = require('../../config/db');

async function migrate() {
  await db();

  const ProductMaster = require('../models/ProductMaster');

  // Find products where selling_uom or purchase_uom is not set
  const products = await ProductMaster.find({
    $or: [
      { selling_uom: { $exists: false } },
      { selling_uom: null },
      { selling_uom: '' },
      { purchase_uom: { $exists: false } },
      { purchase_uom: null },
      { purchase_uom: '' }
    ]
  }).select('unit_code sold_per selling_uom purchase_uom conversion_factor');

  console.log(`Found ${products.length} products to update`);

  let updated = 0;
  for (const p of products) {
    const baseUnit = p.unit_code || 'PC';
    const changes = {};

    if (!p.selling_uom) changes.selling_uom = baseUnit;
    if (!p.purchase_uom) changes.purchase_uom = baseUnit;
    if (p.conversion_factor == null) changes.conversion_factor = 1;

    if (Object.keys(changes).length > 0) {
      await ProductMaster.updateOne({ _id: p._id }, { $set: changes });
      updated++;
    }
  }

  console.log(`Updated ${updated} products with UOM defaults`);
  console.log('Migration complete');
  await mongoose.disconnect();
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
