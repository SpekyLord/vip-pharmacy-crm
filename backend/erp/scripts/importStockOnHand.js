/**
 * Stock On Hand Import Script — Phase 17
 *
 * Imports opening stock balances from CSV into InventoryLedger as OPENING_BALANCE entries.
 * Expects CSV with WarehouseCode column (added by user during cleanup).
 *
 * Usage: node backend/erp/scripts/importStockOnHand.js <path-to-csv>
 *
 * CSV columns expected:
 *   SnapshotAt, BDM, Territory, WarehouseCode, ItemKey, GenericName, BrandName,
 *   DosageStrength, BatchLotNo, ExpiryDate, SoldPer, StockOnHand, MinimalStock,
 *   PurchasePrice, SellingPrice, InventoryValue, IsActive, NearExpiryFlag, StockStatus, Remarks
 *
 * If WarehouseCode column missing, falls back to BDM name mapping.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const InventoryLedger = require('../models/InventoryLedger');
const ProductMaster = require('../models/ProductMaster');
const Warehouse = require('../models/Warehouse');
const Entity = require('../models/Entity');
const User = require('../../models/User');

// Fallback BDM name → warehouse code mapping (if WarehouseCode column not in CSV)
const BDM_TO_WAREHOUSE = {
  'Gregg Louie Vios': 'ILO-MAIN',
  'Mae Navarro': 'BAC',
  'Menivie Daniela': 'DIG',
  'Edcel Mae Arespacochaga': 'DUM',
  'Cristina Salila': 'GSC',
  'Roman Mabanag': 'OZA',
  'Romela Shen Herrera': 'PAN',
  'Jake Montero': 'MGO',
  'Jay Ann Protacio': 'ILO1',
  'Jenny Rose Jacosalem': 'ILO2',
  'Judy Mae Patrocinio': 'ACC',
};

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

function parseDate(dateStr) {
  if (!dateStr || dateStr === '0' || dateStr.includes('00/00')) return null;
  // Clean bad dates like "08/30;/2026"
  const cleaned = dateStr.replace(/;/g, '');
  const parsed = new Date(cleaned);
  if (isNaN(parsed.getTime())) return null;
  // Reject dates before 2020 (bad data)
  if (parsed.getFullYear() < 2020) return null;
  return parsed;
}

async function run() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error('Usage: node importStockOnHand.js <path-to-csv>');
    process.exit(1);
  }

  const fullPath = path.resolve(csvPath);
  if (!fs.existsSync(fullPath)) {
    console.error(`File not found: ${fullPath}`);
    process.exit(1);
  }

  await connectDB();
  console.log('=== Stock On Hand Import ===\n');

  // Parse CSV
  const content = fs.readFileSync(fullPath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map(l => {
    const vals = parseCSVLine(l);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
    return obj;
  });

  console.log(`Parsed ${rows.length} rows from CSV`);
  console.log(`Columns: ${headers.join(', ')}\n`);

  const hasWarehouseCode = headers.includes('WarehouseCode');
  if (!hasWarehouseCode) {
    console.log('WARNING: No WarehouseCode column — using BDM name fallback mapping\n');
  }

  // Resolve warehouses
  const warehouses = await Warehouse.find({}).lean();
  const whByCode = new Map(warehouses.map(w => [w.warehouse_code, w]));

  // Resolve entities
  const entities = await Entity.find({}).lean();
  const entityById = new Map(entities.map(e => [e._id.toString(), e]));

  // Stats
  let imported = 0, skipped = 0, productCreated = 0, productUpdated = 0, errors = 0;
  const perWarehouse = {};

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const stockQty = parseInt(row.StockOnHand) || 0;

    // Skip zero-stock inactive items
    if (stockQty <= 0 && row.IsActive === 'FALSE') {
      skipped++;
      continue;
    }

    // Resolve warehouse
    const whCode = hasWarehouseCode ? row.WarehouseCode?.toUpperCase() : BDM_TO_WAREHOUSE[row.BDM];
    if (!whCode) {
      console.log(`  Row ${i + 2}: No warehouse mapping for BDM "${row.BDM}" — SKIPPED`);
      errors++;
      continue;
    }

    const warehouse = whByCode.get(whCode);
    if (!warehouse) {
      console.log(`  Row ${i + 2}: Warehouse "${whCode}" not found — SKIPPED`);
      errors++;
      continue;
    }

    const entityId = warehouse.entity_id;
    const managerId = warehouse.manager_id;

    // Parse batch/expiry
    const batchLotNo = row.BatchLotNo || 'OPENING';
    const expiryDate = parseDate(row.ExpiryDate);

    // Find or create ProductMaster
    const itemKey = row.ItemKey || `${row.BrandName} | ${row.DosageStrength} | ${batchLotNo}`;
    let product = await ProductMaster.findOne({ entity_id: entityId, item_key: itemKey }).lean();

    if (!product) {
      product = await ProductMaster.create({
        entity_id: entityId,
        item_key: itemKey,
        generic_name: row.GenericName || '',
        brand_name: row.BrandName || '',
        dosage_strength: row.DosageStrength || '',
        unit_code: row.SoldPer || 'pc.',
        purchase_price: parseFloat(row.PurchasePrice) || 0,
        selling_price: parseFloat(row.SellingPrice) || 0,
        reorder_min_qty: parseInt(row.MinimalStock) || null,
        is_active: row.IsActive === 'TRUE',
        created_by: managerId,
      });
      productCreated++;
    } else {
      // Update prices if currently zero and CSV has values
      const updates = {};
      if (!product.purchase_price && parseFloat(row.PurchasePrice)) updates.purchase_price = parseFloat(row.PurchasePrice);
      if (!product.selling_price && parseFloat(row.SellingPrice)) updates.selling_price = parseFloat(row.SellingPrice);
      if (!product.reorder_min_qty && parseInt(row.MinimalStock)) updates.reorder_min_qty = parseInt(row.MinimalStock);
      if (Object.keys(updates).length) {
        await ProductMaster.updateOne({ _id: product._id }, { $set: updates });
        productUpdated++;
      }
    }

    // Skip zero-stock but keep product (already created/updated above)
    if (stockQty <= 0) {
      skipped++;
      continue;
    }

    // Create OPENING_BALANCE InventoryLedger entry
    await InventoryLedger.create({
      entity_id: entityId,
      bdm_id: managerId,
      warehouse_id: warehouse._id,
      product_id: product._id,
      batch_lot_no: batchLotNo,
      expiry_date: expiryDate || new Date('2030-12-31'),
      transaction_type: 'OPENING_BALANCE',
      qty_in: stockQty,
      qty_out: 0,
      recorded_by: managerId,
    });

    imported++;
    perWarehouse[whCode] = (perWarehouse[whCode] || 0) + 1;
  }

  console.log('\n=== Import Complete ===');
  console.log(`Imported: ${imported} ledger entries`);
  console.log(`Skipped: ${skipped} (zero stock / inactive)`);
  console.log(`Errors: ${errors}`);
  console.log(`Products created: ${productCreated}`);
  console.log(`Products updated: ${productUpdated}`);
  console.log('\nPer warehouse:');
  for (const [code, count] of Object.entries(perWarehouse).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${code}: ${count} entries`);
  }

  await mongoose.disconnect();
}

run().catch(err => { console.error('Import failed:', err); process.exit(1); });
