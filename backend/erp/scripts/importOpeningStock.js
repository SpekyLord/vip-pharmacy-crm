/**
 * Opening Stock Import Script
 *
 * Usage:  cd backend && node erp/scripts/importOpeningStock.js
 *
 * Reads: STOCK ON HAND - MASTER_STOCK_ON_HAND.csv
 *
 * For each row with StockOnHand > 0:
 *   1. Match BDM name → User record
 *   2. Match product → ProductMaster (brand_name_clean + dosage)
 *      → Auto-create if not found
 *   3. Parse & clean batch_lot_no + expiry_date
 *   4. Create InventoryLedger OPENING_BALANCE entry
 *
 * Safe to run multiple times — checks for existing OPENING_BALANCE
 * with same entity+bdm+product+batch to avoid duplicates.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const User = require('../../models/User');
const Entity = require('../models/Entity');
const ProductMaster = require('../models/ProductMaster');
const InventoryLedger = require('../models/InventoryLedger');
const { cleanName } = require('../utils/nameClean');
const { cleanBatchNo, parseExpiry } = require('../utils/normalize');

const STOCK_CSV = path.join('C:', 'Users', 'LENOVO', 'Downloads', 'STOCK ON HAND - MASTER_STOCK_ON_HAND.csv');
const ENTITY_NAME = 'VIP Pharmacy Inc.';

// ═══ CSV Parser (handles quoted fields) ═══
function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function parseCSV(filepath) {
  const raw = fs.readFileSync(filepath, 'utf-8');
  const lines = raw.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h.trim()] = (values[i] || '').trim(); });
    return obj;
  });
}

// ═══ BDM Matcher ═══
function matchBdm(bdmName, users) {
  if (!bdmName) return null;
  const clean = bdmName.toLowerCase().trim();

  // Exact match
  let user = users.find(u => u.name.toLowerCase() === clean);
  if (user) return user;

  // All parts match
  const parts = clean.split(/\s+/);
  user = users.find(u => {
    const uName = u.name.toLowerCase();
    return parts.every(p => uName.includes(p));
  });
  if (user) return user;

  // First name match
  user = users.find(u => u.name.toLowerCase().startsWith(parts[0]));
  return user || null;
}

// ═══ Product Matcher ═══
async function matchOrCreateProduct(row, entityId, adminId, productCache) {
  const brandName = row.BrandName?.trim();
  const dosage = row.DosageStrength?.trim() || '';
  if (!brandName) return null;

  const itemKey = `${brandName}|${dosage}`;
  const cleanKey = `${cleanName(brandName)}|${cleanName(dosage)}`;

  if (productCache.has(cleanKey)) return productCache.get(cleanKey);

  // Try exact item_key
  let product = await ProductMaster.findOne({ entity_id: entityId, item_key: itemKey }).lean();
  if (product) { productCache.set(cleanKey, product); return product; }

  // Try brand_name_clean + dosage fuzzy
  const brandClean = cleanName(brandName);
  const candidates = await ProductMaster.find({ entity_id: entityId, brand_name_clean: brandClean }).lean();

  if (candidates.length === 1) {
    product = candidates[0];
    productCache.set(cleanKey, product);
    return product;
  }

  if (candidates.length > 1) {
    const dosageClean = cleanName(dosage);
    product = candidates.find(c => cleanName(c.dosage_strength || '') === dosageClean);
    if (product) { productCache.set(cleanKey, product); return product; }
    product = candidates[0];
    productCache.set(cleanKey, product);
    return product;
  }

  // Auto-create from CSV data
  const soldPer = row.SoldPer?.trim() || 'PC';
  const purchasePrice = parseFloat((row.PurchasePrice || '0').replace(/,/g, '')) || 0;
  const sellingPrice = parseFloat((row.SellingPrice || '0').replace(/,/g, '')) || 0;

  try {
    product = await ProductMaster.create({
      entity_id: entityId,
      item_key: itemKey,
      brand_name: brandName,
      generic_name: row.GenericName?.trim() || brandName,
      dosage_strength: dosage,
      sold_per: soldPer,
      purchase_price: purchasePrice,
      selling_price: sellingPrice,
      is_active: true,
      added_by: adminId,
    });
    productCache.set(cleanKey, product.toObject());
    return product.toObject();
  } catch (err) {
    if (err.code === 11000) {
      product = await ProductMaster.findOne({ entity_id: entityId, item_key: itemKey }).lean();
      if (product) { productCache.set(cleanKey, product); return product; }
    }
    return null;
  }
}

// ═══ Expiry parser with extra fallbacks for dirty data ═══
function parseExpiryFlexible(raw) {
  if (!raw) return null;

  // Fix common typos: "08/30;/2026" → "08/30/2026"
  let cleaned = raw.replace(/;/g, '').replace(/\/\//g, '/').trim();

  // Try the standard parser first
  let d = parseExpiry(cleaned);
  if (d && !isNaN(d.getTime()) && d.getFullYear() >= 2020) return d;

  // Try MM/DD/YY format (common in PH)
  const parts = cleaned.split('/');
  if (parts.length === 3) {
    let year = parseInt(parts[2]);
    if (year < 100) year += 2000;
    const month = parseInt(parts[0]) - 1;
    const day = parseInt(parts[1]);
    if (year >= 2020 && month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      return new Date(year, month, 1);
    }
  }

  return null;
}

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected\n');

    const entity = await Entity.findOne({ entity_name: ENTITY_NAME });
    if (!entity) {
      console.error('Entity not found. Run seedErpMasterData.js first.');
      process.exit(1);
    }

    // Ensure all users have entity_id
    await User.updateMany(
      { $or: [{ entity_id: { $exists: false } }, { entity_id: null }] },
      { $set: { entity_id: entity._id } }
    );

    const allUsers = await User.find({}, 'name email role entity_id').lean();
    const adminUser = allUsers.find(u => u.role === 'admin') || allUsers[0];

    if (!fs.existsSync(STOCK_CSV)) {
      console.error(`CSV not found: ${STOCK_CSV}`);
      process.exit(1);
    }
    const rows = parseCSV(STOCK_CSV);
    console.log(`Loaded ${rows.length} stock rows\n`);

    const stats = {
      total: rows.length, skippedZero: 0, skippedBadExpiry: 0,
      skippedNoBdm: 0, skippedNoProduct: 0, skippedDuplicate: 0,
      created: 0, productsAutoCreated: 0,
    };
    const bdmNotFound = new Set();
    const expiryErrors = [];
    const productNotFound = [];
    const productCache = new Map();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const lineNum = i + 2;

      // Skip zero stock
      const qty = parseInt((row.StockOnHand || '0').replace(/,/g, '')) || 0;
      if (qty <= 0) { stats.skippedZero++; continue; }

      // Match BDM
      const bdm = matchBdm(row.BDM, allUsers);
      if (!bdm) { stats.skippedNoBdm++; bdmNotFound.add(row.BDM); continue; }

      // Parse expiry
      const expiry = parseExpiryFlexible(row.ExpiryDate);
      if (!expiry) {
        stats.skippedBadExpiry++;
        expiryErrors.push({ line: lineNum, brand: row.BrandName, raw: row.ExpiryDate });
        continue;
      }

      // Clean batch
      const batchClean = cleanBatchNo(row.BatchLotNo) || 'OPENING';

      // Match/create product
      const prevSize = productCache.size;
      const product = await matchOrCreateProduct(row, entity._id, adminUser._id, productCache);
      if (!product) {
        stats.skippedNoProduct++;
        productNotFound.push({ line: lineNum, brand: row.BrandName, dosage: row.DosageStrength });
        continue;
      }
      if (productCache.size > prevSize) stats.productsAutoCreated++;

      // Dedup check
      const existing = await InventoryLedger.findOne({
        entity_id: entity._id, bdm_id: bdm._id, product_id: product._id,
        batch_lot_no: batchClean, transaction_type: 'OPENING_BALANCE',
      });
      if (existing) { stats.skippedDuplicate++; continue; }

      // Create OPENING_BALANCE
      await InventoryLedger.create({
        entity_id: entity._id, bdm_id: bdm._id, product_id: product._id,
        batch_lot_no: batchClean, expiry_date: expiry,
        transaction_type: 'OPENING_BALANCE',
        qty_in: qty, running_balance: qty, recorded_by: adminUser._id,
      });
      stats.created++;

      const expiryStr = expiry.toISOString().slice(0, 7);
      console.log(`  [${bdm.name.split(' ')[0].padEnd(10)}] ${(product.brand_name + ' ' + (product.dosage_strength || '')).padEnd(30)} Batch: ${batchClean.padEnd(16)} Exp: ${expiryStr}  Qty: ${qty}`);
    }

    // ═══ Report ═══
    console.log('\n══════════════════════════════════════════');
    console.log('       OPENING STOCK IMPORT REPORT');
    console.log('══════════════════════════════════════════\n');
    console.log(`Total CSV rows:          ${stats.total}`);
    console.log(`Created (OPENING_BAL):   ${stats.created}`);
    console.log(`Skipped (zero stock):    ${stats.skippedZero}`);
    console.log(`Skipped (bad expiry):    ${stats.skippedBadExpiry}`);
    console.log(`Skipped (no BDM match):  ${stats.skippedNoBdm}`);
    console.log(`Skipped (no product):    ${stats.skippedNoProduct}`);
    console.log(`Skipped (duplicate):     ${stats.skippedDuplicate}`);
    console.log(`Products auto-created:   ${stats.productsAutoCreated}`);

    if (bdmNotFound.size > 0) {
      console.log('\nBDMs NOT matched:');
      for (const name of bdmNotFound) console.log(`   - ${name}`);
    }

    if (expiryErrors.length > 0) {
      console.log(`\nBad expiry dates (${expiryErrors.length}):`);
      for (const e of expiryErrors.slice(0, 20)) {
        console.log(`   Line ${e.line}: ${e.brand} — raw: "${e.raw}"`);
      }
      if (expiryErrors.length > 20) console.log(`   ... and ${expiryErrors.length - 20} more`);
    }

    if (productNotFound.length > 0) {
      console.log(`\nProducts NOT matched (${productNotFound.length}):`);
      for (const p of productNotFound) console.log(`   Line ${p.line}: ${p.brand} ${p.dosage}`);
    }

    // Per-BDM summary
    console.log('\n--- Per-BDM Stock Summary ---');
    const bdmSummary = await InventoryLedger.aggregate([
      { $match: { entity_id: entity._id, transaction_type: 'OPENING_BALANCE' } },
      { $group: { _id: '$bdm_id', lines: { $sum: 1 }, total_qty: { $sum: '$qty_in' } } },
    ]);
    for (const s of bdmSummary) {
      const user = allUsers.find(u => u._id.toString() === s._id.toString());
      console.log(`  ${(user?.name || 'Unknown').padEnd(30)} ${String(s.lines).padStart(4)} lines   ${String(s.total_qty).padStart(8)} units`);
    }

    const totalEntries = await InventoryLedger.countDocuments({
      entity_id: entity._id, transaction_type: 'OPENING_BALANCE',
    });
    console.log(`\nTotal OPENING_BALANCE in DB: ${totalEntries}`);
    console.log('\nDone! BDMs can now see stock at /erp/my-stock and use Sales Entry.');

    process.exit(0);
  } catch (err) {
    console.error('Import error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

run();
