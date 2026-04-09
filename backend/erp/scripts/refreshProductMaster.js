/**
 * Refresh Product Master from cleaned CSV — Phase 17
 *
 * Reads the MASTER_ITEM_MASTER.csv, deduplicates by BrandName|DosageStrength,
 * upserts into ProductMaster, deactivates duplicates and stale records.
 *
 * Usage: node backend/erp/scripts/refreshProductMaster.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const ProductMaster = require('../models/ProductMaster');
const Entity = require('../models/Entity');
const { cleanName } = require('../utils/nameClean');
const { normalizeUnit } = require('../utils/normalize');

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') { inQuotes = !inQuotes; }
    else if (line[i] === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
    else { current += line[i]; }
  }
  result.push(current.trim());
  return result;
}

async function run() {
  const csvPath = process.argv[2] || path.resolve(__dirname, '../../../docs/MASTER ITEM MASTER - MASTER_ITEM_MASTER.csv');
  if (!fs.existsSync(csvPath)) {
    console.error('CSV not found:', csvPath);
    process.exit(1);
  }

  await connectDB();
  console.log('=== Product Master Refresh ===\n');

  // Parse CSV
  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map(l => {
    const vals = parseCSVLine(l);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
    return obj;
  });

  console.log(`Parsed ${rows.length} rows from CSV`);

  // Find VIP entity (primary)
  const vipEntity = await Entity.findOne({ short_name: { $regex: /^VIP$/i } }).lean();
  if (!vipEntity) {
    console.error('VIP entity not found!');
    process.exit(1);
  }
  const entityId = vipEntity._id;
  console.log(`Entity: ${vipEntity.entity_name} (${entityId})\n`);

  // Deduplicate CSV by BrandName|DosageStrength
  const dedupMap = new Map();
  for (const row of rows) {
    const brand = (row.BrandName || '').trim();
    const dosage = (row.DosageStrength || '').trim();
    if (!brand) continue;

    const key = `${brand}|${dosage}`;
    const isActive = (row.IsActive || 'TRUE').toUpperCase() !== 'FALSE';

    if (!dedupMap.has(key)) {
      dedupMap.set(key, { row, isActive });
    } else if (!dedupMap.get(key).isActive && isActive) {
      dedupMap.set(key, { row, isActive });
    }
  }

  console.log(`Unique products: ${dedupMap.size} (${rows.length - dedupMap.size} CSV duplicates merged)\n`);

  let updated = 0, created = 0, deactivated = 0, errors = 0;
  const processedCleanKeys = new Set();

  for (const [dedupKey, { row, isActive }] of dedupMap) {
    const brand = (row.BrandName || '').trim();
    const dosage = (row.DosageStrength || '').trim();
    const generic = (row.GenericName || '').trim();
    const soldPer = (row.SoldPer || '').trim();
    const pp = parseFloat((row.DefaultPurchasePrice || '0').replace(/,/g, '')) || 0;
    const sp = parseFloat((row.DefaultSellingPrice || '0').replace(/,/g, '')) || 0;
    const itemKey = `${brand}|${dosage}`;
    const brandClean = cleanName(brand);

    processedCleanKeys.add(`${brandClean}|${dosage.toLowerCase()}`);

    try {
      // Find ALL candidates that could be this product
      const candidates = await ProductMaster.find({
        entity_id: entityId,
        $or: [
          { item_key: itemKey },
          { brand_name_clean: brandClean, dosage_strength: dosage || { $in: [null, ''] } },
        ],
      }).lean();

      if (candidates.length > 0) {
        // Pick keeper (prefer active, then first)
        const keeper = candidates.find(c => c.is_active) || candidates[0];

        // Deactivate duplicates FIRST
        for (const dup of candidates) {
          if (dup._id.toString() !== keeper._id.toString()) {
            await ProductMaster.updateOne({ _id: dup._id }, { $set: { is_active: false } });
            deactivated++;
          }
        }

        // Update keeper
        const update = {
          brand_name: brand,
          brand_name_clean: brandClean,
          dosage_strength: dosage,
          item_key: itemKey,
          is_active: isActive,
        };
        if (generic) update.generic_name = generic;
        if (soldPer) { update.sold_per = soldPer; update.unit_code = normalizeUnit(soldPer); }
        if (pp > 0) update.purchase_price = pp;
        if (sp > 0) update.selling_price = sp;

        await ProductMaster.updateOne({ _id: keeper._id }, { $set: update });
        updated++;
      } else {
        // Create new
        await ProductMaster.create({
          entity_id: entityId,
          item_key: itemKey,
          brand_name: brand,
          brand_name_clean: brandClean,
          generic_name: generic || brand,
          dosage_strength: dosage,
          sold_per: soldPer || 'PC',
          unit_code: normalizeUnit(soldPer),
          purchase_price: pp,
          selling_price: sp,
          is_active: isActive,
        });
        created++;
        console.log(`  + ${brand} ${dosage}`);
      }
    } catch (err) {
      console.log(`  ERROR: ${brand} ${dosage} — ${err.message}`);
      errors++;
    }
  }

  // Deactivate stale products not in CSV
  let staleDeactivated = 0;
  const activeProducts = await ProductMaster.find({ entity_id: entityId, is_active: true }).lean();
  for (const prod of activeProducts) {
    const prodClean = `${cleanName(prod.brand_name)}|${(prod.dosage_strength || '').toLowerCase()}`;
    if (!processedCleanKeys.has(prodClean)) {
      await ProductMaster.updateOne({ _id: prod._id }, { $set: { is_active: false } });
      staleDeactivated++;
      console.log(`  STALE: ${prod.brand_name} ${prod.dosage_strength} — deactivated`);
    }
  }

  // Final counts
  const totalActive = await ProductMaster.countDocuments({ entity_id: entityId, is_active: true });
  const totalInactive = await ProductMaster.countDocuments({ entity_id: entityId, is_active: false });

  console.log('\n=== Refresh Complete ===');
  console.log(`Updated: ${updated}`);
  console.log(`Created: ${created}`);
  console.log(`Duplicates deactivated: ${deactivated}`);
  console.log(`Stale deactivated: ${staleDeactivated}`);
  console.log(`Errors: ${errors}`);
  console.log(`\nFinal: ${totalActive} active, ${totalInactive} inactive`);

  await mongoose.disconnect();
}

run().catch(err => { console.error('Refresh failed:', err); process.exit(1); });
