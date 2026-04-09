/**
 * Stock Seed Service — Phase 17
 *
 * Reusable logic for importing opening stock balances from parsed CSV rows
 * into InventoryLedger as OPENING_BALANCE entries.
 *
 * Used by:
 *   - importStockOnHand.js (CLI script)
 *   - inventoryController.seedStockOnHand (API endpoint)
 */
const InventoryLedger = require('../models/InventoryLedger');
const ProductMaster = require('../models/ProductMaster');
const Warehouse = require('../models/Warehouse');
const User = require('../../models/User');
const { cleanName } = require('../utils/nameClean');

/**
 * Build BDM name → warehouse code mapping from the database.
 * Resolves manager_id to User.name for each warehouse.
 */
async function buildBdmToWarehouseMap() {
  const warehouses = await Warehouse.find({ is_active: true }).lean();
  const managerIds = warehouses.filter(w => w.manager_id).map(w => w.manager_id);
  const users = await User.find({ _id: { $in: managerIds } }).select('_id name').lean();
  const userMap = new Map(users.map(u => [u._id.toString(), u.name]));

  const mapping = {};
  for (const wh of warehouses) {
    if (wh.manager_id) {
      const name = userMap.get(wh.manager_id.toString());
      if (name) mapping[name] = wh.warehouse_code;
    }
  }
  return mapping;
}

function parseDate(dateStr) {
  if (!dateStr || dateStr === '0' || dateStr.includes('00/00')) return null;
  const cleaned = dateStr.replace(/;/g, '');
  const parsed = new Date(cleaned);
  if (isNaN(parsed.getTime())) return null;
  if (parsed.getFullYear() < 2020) return null;
  return parsed;
}

/**
 * Seed stock from parsed CSV rows.
 * @param {Array<Object>} rows — parsed CSV rows (each row is a key-value object)
 * @param {Object} options
 * @param {boolean} options.hasWarehouseCode — whether rows have WarehouseCode column
 * @returns {Object} { imported, skipped, errors, productUpdated, perWarehouse, unmatchedItems }
 */
async function seedStockFromRows(rows, options = {}) {
  const { hasWarehouseCode = false } = options;

  // Resolve all warehouses from DB
  const warehouses = await Warehouse.find({}).lean();
  const whByCode = new Map(warehouses.map(w => [w.warehouse_code, w]));

  // Build BDM→warehouse fallback from DB (no hardcoding)
  const bdmToWarehouse = await buildBdmToWarehouseMap();

  // Stats
  let imported = 0, skipped = 0, productUpdated = 0, errorCount = 0;
  const perWarehouse = {};
  const unmatchedItems = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const stockQty = parseInt(row.StockOnHand) || 0;

    // Skip zero-stock inactive items
    if (stockQty <= 0 && String(row.IsActive || '').toUpperCase() === 'FALSE') {
      skipped++;
      continue;
    }

    // Resolve warehouse
    const whCode = hasWarehouseCode
      ? (row.WarehouseCode || row['Warehouse Code'] || '')?.toUpperCase()?.trim()
      : bdmToWarehouse[row.BDM];

    if (!whCode) {
      unmatchedItems.push({ row: i + 2, brand: row.BrandName, dosage: row.DosageStrength, reason: `No warehouse mapping for BDM "${row.BDM}"` });
      errorCount++;
      continue;
    }

    const warehouse = whByCode.get(whCode);
    if (!warehouse) {
      unmatchedItems.push({ row: i + 2, brand: row.BrandName, dosage: row.DosageStrength, reason: `Warehouse "${whCode}" not found` });
      errorCount++;
      continue;
    }

    const entityId = warehouse.entity_id;
    const managerId = warehouse.manager_id;

    const batchLotNo = row.BatchLotNo || 'OPENING';
    const expiryDate = parseDate(row.ExpiryDate);

    // Match against ProductMaster — DO NOT auto-create
    const itemKey = row.ItemKey || `${row.BrandName}|${row.DosageStrength}`;
    const csvBrandClean = cleanName(row.BrandName || '');
    const csvDosage = (row.DosageStrength || '').trim();

    // Strategy 1: exact item_key
    let product = await ProductMaster.findOne({ entity_id: entityId, item_key: itemKey }).lean();

    // Strategy 2: brand_name_clean + dosage within entity
    if (!product && csvBrandClean) {
      product = await ProductMaster.findOne({
        entity_id: entityId,
        brand_name_clean: csvBrandClean,
        dosage_strength: csvDosage || { $in: [null, ''] },
      }).lean();
    }

    // Strategy 3: cross-entity
    if (!product && csvBrandClean) {
      product = await ProductMaster.findOne({
        brand_name_clean: csvBrandClean,
        dosage_strength: csvDosage || { $in: [null, ''] },
      }).lean();
    }

    if (!product) {
      unmatchedItems.push({ row: i + 2, brand: row.BrandName, dosage: row.DosageStrength, reason: 'No product match' });
      errorCount++;
      continue;
    }

    // Update prices if currently zero
    const updates = {};
    if (!product.purchase_price && parseFloat(row.PurchasePrice)) updates.purchase_price = parseFloat(row.PurchasePrice);
    if (!product.selling_price && parseFloat(row.SellingPrice)) updates.selling_price = parseFloat(row.SellingPrice);
    if (!product.reorder_min_qty && parseInt(row.MinimalStock)) updates.reorder_min_qty = parseInt(row.MinimalStock);
    if (Object.keys(updates).length) {
      await ProductMaster.updateOne({ _id: product._id }, { $set: updates });
      productUpdated++;
    }

    // Skip zero-stock
    if (stockQty <= 0) {
      skipped++;
      continue;
    }

    // Dedup check
    const existingLedger = await InventoryLedger.findOne({
      entity_id: entityId,
      warehouse_id: warehouse._id,
      product_id: product._id,
      batch_lot_no: batchLotNo,
      transaction_type: 'OPENING_BALANCE',
    }).lean();
    if (existingLedger) {
      skipped++;
      continue;
    }

    // Create OPENING_BALANCE
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

  return { imported, skipped, errors: errorCount, productUpdated, perWarehouse, unmatchedItems };
}

module.exports = { seedStockFromRows, buildBdmToWarehouseMap, parseDate };
