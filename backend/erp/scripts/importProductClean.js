/* eslint-disable vip-tenant/require-entity-filter -- standalone admin/migration/diagnostic script: no req context; intentional cross-entity reads/writes for ops work */
/**
 * Import Product Cleanup from SMART_ITEM_REVIEW CSV
 *
 * Actions:
 *   USE_NORMALIZED — update brand_name, generic_name, dosage_strength, unit_code
 *   DELETE_DUPLICATE — deactivate (is_active = false)
 *   KEEP_AS_IS — no change
 *
 * Usage: node backend/erp/scripts/importProductClean.js
 */
require('dotenv').config();
const fs = require('fs');
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const { normalizeUnit } = require('../utils/normalize');

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') { inQuotes = !inQuotes; continue; }
    if (line[i] === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue; }
    current += line[i];
  }
  result.push(current.trim());
  return result;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function run() {
  await connectDB();
  const ProductMaster = require('../models/ProductMaster');

  const csvPath = 'C:/Users/LENOVO/Downloads/VIP Accounting - SMART_ITEM_REVIEW.csv';
  const csv = fs.readFileSync(csvPath, 'utf8');
  const lines = csv.split('\n').filter(l => l.trim());
  const headers = parseCSVLine(lines[0]);

  const idx = {};
  headers.forEach((h, i) => { idx[h] = i; });

  console.log('=== Product Cleanup Import ===');
  console.log(`Rows: ${lines.length - 1}`);
  console.log(`Headers: ${headers.join(', ')}\n`);

  let updated = 0, deleted = 0, kept = 0, notFound = 0, skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    const action = cols[idx.Action] || '';
    const approved = cols[idx.AdminApproved] || '';
    const itemKey = cols[idx.ItemKey] || '';
    const normBrand = cols[idx.NormBrand] || '';
    const normGeneric = cols[idx.NormGeneric] || '';
    const normDosage = cols[idx.NormDosage] || '';
    const normSoldPer = cols[idx.NormSoldPer] || '';
    const rawBrand = cols[idx.RawBrandName] || '';

    // Skip unapproved
    if (approved !== 'TRUE') { skipped++; continue; }
    if (!itemKey && !rawBrand) { skipped++; continue; }

    // Find product by item_key first
    let product = await ProductMaster.findOne({ item_key: itemKey });

    // Fallback: match by brand name
    if (!product && rawBrand) {
      product = await ProductMaster.findOne({
        brand_name: new RegExp('^' + escapeRegex(rawBrand) + '$', 'i')
      });
    }

    if (!product) {
      notFound++;
      if (action !== 'DELETE_DUPLICATE') {
        console.log(`  [NOT FOUND] ${itemKey} — ${rawBrand}`);
      }
      continue;
    }

    if (action === 'USE_NORMALIZED') {
      const changes = [];
      if (normBrand && normBrand !== product.brand_name) {
        changes.push(`brand: ${product.brand_name} → ${normBrand}`);
        product.brand_name = normBrand;
      }
      if (normGeneric && normGeneric !== product.generic_name) {
        changes.push(`generic: ${product.generic_name} → ${normGeneric}`);
        product.generic_name = normGeneric;
      }
      if (normDosage && normDosage !== product.dosage_strength) {
        changes.push(`dosage: ${product.dosage_strength} → ${normDosage}`);
        product.dosage_strength = normDosage;
      }
      if (normSoldPer) {
        const normalizedUnit = normalizeUnit(normSoldPer);
        if (normalizedUnit && normalizedUnit !== product.unit_code) {
          changes.push(`unit: ${product.unit_code} → ${normalizedUnit}`);
          product.unit_code = normalizedUnit;
        }
      }

      if (changes.length) {
        await product.save();
        updated++;
        console.log(`  [UPDATED] ${product.brand_name} — ${changes.join(', ')}`);
      } else {
        kept++;
      }
    } else if (action === 'DELETE_DUPLICATE') {
      product.is_active = false;
      await product.save();
      deleted++;
      console.log(`  [DEACTIVATED] ${product.brand_name} (${itemKey})`);
    } else {
      kept++;
    }
  }

  console.log('\n=== Results ===');
  console.log(`  Updated: ${updated}`);
  console.log(`  Deactivated: ${deleted}`);
  console.log(`  Kept as-is: ${kept}`);
  console.log(`  Not found: ${notFound}`);
  console.log(`  Skipped (unapproved): ${skipped}`);

  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
