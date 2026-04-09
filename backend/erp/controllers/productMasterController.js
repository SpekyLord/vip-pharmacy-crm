const ProductMaster = require('../models/ProductMaster');
const Warehouse = require('../models/Warehouse');
const InventoryLedger = require('../models/InventoryLedger');
const ErpAuditLog = require('../models/ErpAuditLog');
const { catchAsync } = require('../../middleware/errorHandler');
const { ROLES } = require('../../constants/roles');

const getAll = catchAsync(async (req, res) => {
  const filter = {};
  if (req.tenantFilter?.entity_id) filter.entity_id = req.tenantFilter.entity_id;
  if (req.query.entity_id) filter.entity_id = req.query.entity_id;
  if (req.query.is_active !== undefined) filter.is_active = req.query.is_active === 'true';
  if (req.query.stock_type) filter.stock_type = req.query.stock_type;
  if (req.query.q) {
    filter.$or = [
      { brand_name: { $regex: req.query.q, $options: 'i' } },
      { generic_name: { $regex: req.query.q, $options: 'i' } }
    ];
  }

  // BDMs only see products that have inventory in their assigned warehouse
  const bdmRoles = [ROLES.CONTRACTOR];
  if (bdmRoles.includes(req.user?.role)) {
    const myWarehouses = await Warehouse.find({
      $or: [{ manager_id: req.user._id }, { assigned_users: req.user._id }]
    }).select('_id').lean();
    const whIds = myWarehouses.map(w => w._id);

    if (whIds.length) {
      const productIds = await InventoryLedger.distinct('product_id', { warehouse_id: { $in: whIds } });
      filter._id = { $in: productIds };
    } else {
      return res.json({ success: true, data: [], pagination: { page: 1, limit: 50, total: 0, pages: 0 } });
    }
  }

  // Optional warehouse filter (admin can filter by warehouse too)
  if (req.query.warehouse_id) {
    const productIds = await InventoryLedger.distinct('product_id', { warehouse_id: req.query.warehouse_id });
    filter._id = filter._id ? { $in: productIds.filter(id => filter._id.$in.some(fid => fid.toString() === id.toString())) } : { $in: productIds };
  }

  const page = parseInt(req.query.page) || 1;
  const rawLimit = parseInt(req.query.limit);
  const limit = rawLimit > 0 ? rawLimit : (rawLimit === 0 ? 0 : 50);
  const skip = limit > 0 ? (page - 1) * limit : 0;

  const query = ProductMaster.find(filter).sort({ brand_name: 1 });
  if (limit > 0) query.skip(skip).limit(limit);

  const [products, total] = await Promise.all([
    query.lean(),
    ProductMaster.countDocuments(filter)
  ]);

  res.json({
    success: true,
    data: products,
    pagination: { page, limit, total, pages: limit > 0 ? Math.ceil(total / limit) : 1 }
  });
});

const getById = catchAsync(async (req, res) => {
  const filter = { _id: req.params.id };
  if (!req.isPresident) filter.entity_id = req.entityId;
  const product = await ProductMaster.findOne(filter).lean();
  if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
  res.json({ success: true, data: product });
});

const create = catchAsync(async (req, res) => {
  req.body.entity_id = req.entityId;
  req.body.added_by = req.user._id;
  const product = await ProductMaster.create(req.body);
  res.status(201).json({ success: true, data: product });
});

const update = catchAsync(async (req, res) => {
  const filter = { _id: req.params.id };
  if (!req.isPresident) filter.entity_id = req.entityId;
  const product = await ProductMaster.findOneAndUpdate(
    filter,
    { $set: req.body },
    { new: true, runValidators: true }
  );
  if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
  res.json({ success: true, data: product });
});

const deactivate = catchAsync(async (req, res) => {
  const filter = { _id: req.params.id };
  // President/CEO can deactivate any product; others scoped to their entity
  if (!req.isPresident) filter.entity_id = req.entityId;
  const product = await ProductMaster.findOneAndUpdate(
    filter,
    { $set: { is_active: false } },
    { new: true }
  );
  if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
  res.json({ success: true, message: 'Product deactivated', data: product });
});

/**
 * PATCH /:id/reorder-qty — Update SAP-level reorder fields (Finance/Admin only)
 */
const updateReorderQty = catchAsync(async (req, res) => {
  const { reorder_min_qty, reorder_qty, safety_stock_qty, lead_time_days } = req.body;

  const reorderFilter = { _id: req.params.id };
  if (!req.isPresident) reorderFilter.entity_id = req.entityId;
  const product = await ProductMaster.findOne(reorderFilter);
  if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

  const changes = {};
  if (reorder_min_qty !== undefined && reorder_min_qty !== product.reorder_min_qty) {
    changes.reorder_min_qty = { old: product.reorder_min_qty, new: reorder_min_qty };
    product.reorder_min_qty = reorder_min_qty;
  }
  if (reorder_qty !== undefined && reorder_qty !== product.reorder_qty) {
    changes.reorder_qty = { old: product.reorder_qty, new: reorder_qty };
    product.reorder_qty = reorder_qty;
  }
  if (safety_stock_qty !== undefined && safety_stock_qty !== product.safety_stock_qty) {
    changes.safety_stock_qty = { old: product.safety_stock_qty, new: safety_stock_qty };
    product.safety_stock_qty = safety_stock_qty;
  }
  if (lead_time_days !== undefined && lead_time_days !== product.lead_time_days) {
    changes.lead_time_days = { old: product.lead_time_days, new: lead_time_days };
    product.lead_time_days = lead_time_days;
  }

  if (Object.keys(changes).length === 0) {
    return res.json({ success: true, message: 'No changes', data: product });
  }

  await product.save();

  // Audit log each changed field
  for (const [field, vals] of Object.entries(changes)) {
    await ErpAuditLog.logChange({
      entity_id: product.entity_id,
      log_type: 'ITEM_CHANGE',
      target_ref: product._id.toString(),
      target_model: 'ProductMaster',
      field_changed: field,
      old_value: vals.old,
      new_value: vals.new,
      changed_by: req.user._id,
      note: `Reorder rule updated: ${field}`
    });
  }

  res.json({ success: true, message: 'Reorder rules updated', data: product });
});

// ═══ Tag products to warehouse (creates inventory link) ═══
const tagToWarehouse = catchAsync(async (req, res) => {
  const { product_ids, warehouse_id, batch_lot_no, expiry_date, qty } = req.body;
  if (!warehouse_id) return res.status(400).json({ success: false, message: 'warehouse_id is required' });
  if (!Array.isArray(product_ids) || !product_ids.length) return res.status(400).json({ success: false, message: 'product_ids array is required' });

  const warehouse = await Warehouse.findById(warehouse_id).select('_id entity_id').lean();
  if (!warehouse) return res.status(404).json({ success: false, message: 'Warehouse not found' });

  let tagged = 0, skipped = 0;
  for (const pid of product_ids) {
    // Check if product already has inventory in this warehouse
    const exists = await InventoryLedger.findOne({ warehouse_id, product_id: pid }).lean();
    if (exists) { skipped++; continue; }

    await InventoryLedger.create({
      entity_id: warehouse.entity_id || req.entityId,
      bdm_id: req.user._id,
      warehouse_id,
      product_id: pid,
      batch_lot_no: batch_lot_no || 'INITIAL',
      expiry_date: expiry_date || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      transaction_type: 'OPENING_BALANCE',
      qty_in: qty || 0,
      running_balance: qty || 0,
      recorded_by: req.user._id
    });
    tagged++;
  }

  res.json({
    success: true,
    message: `Tagged ${tagged} product(s) to warehouse, ${skipped} already existed`,
    data: { tagged, skipped }
  });
});

// ═══ Get warehouses that a product is tagged to ═══
const getProductWarehouses = catchAsync(async (req, res) => {
  const entries = await InventoryLedger.aggregate([
    { $match: { product_id: require('mongoose').Types.ObjectId.createFromHexString(req.params.id) } },
    { $group: { _id: '$warehouse_id' } }
  ]);
  const whIds = entries.map(e => e._id).filter(Boolean);
  const warehouses = await Warehouse.find({ _id: { $in: whIds } }).select('warehouse_code warehouse_name').lean();
  res.json({ success: true, data: warehouses });
});

// ═══ Price Export/Import ═══

/**
 * GET /export-prices — Download XLSX with product prices for editing
 */
const exportPrices = catchAsync(async (req, res) => {
  const XLSX = require('xlsx');

  const entityId = req.query.entity_id || req.entityId;
  const filter = { entity_id: entityId };
  if (req.query.is_active !== undefined) filter.is_active = req.query.is_active === 'true';
  if (req.query.stock_type) filter.stock_type = req.query.stock_type;

  const products = await ProductMaster.find(filter)
    .select('brand_name generic_name dosage_strength sold_per purchase_price selling_price is_active')
    .sort({ brand_name: 1 })
    .lean();

  const rows = products.map(p => ({
    product_id: p._id.toString(),
    brand_name: p.brand_name,
    generic_name: p.generic_name,
    dosage_strength: p.dosage_strength || '',
    sold_per: p.sold_per || '',
    purchase_price: p.purchase_price || 0,
    selling_price: p.selling_price || 0,
    is_active: p.is_active ? 'YES' : 'NO'
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Product Prices');

  // Set column widths
  ws['!cols'] = [
    { wch: 26 }, // product_id
    { wch: 30 }, // brand_name
    { wch: 30 }, // generic_name
    { wch: 15 }, // dosage_strength
    { wch: 10 }, // sold_per
    { wch: 15 }, // purchase_price
    { wch: 15 }, // selling_price
    { wch: 10 }  // is_active
  ];

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Disposition', 'attachment; filename=product_prices.xlsx');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

/**
 * PUT /import-prices — Bulk update prices from XLSX upload
 * Expects multipart/form-data with a file field named 'file'
 */
const importPrices = catchAsync(async (req, res) => {
  const XLSX = require('xlsx');

  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded. Send as multipart/form-data with field name "file".' });
  }

  const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws);

  if (!rows.length) {
    return res.status(400).json({ success: false, message: 'Spreadsheet is empty' });
  }

  const errors = [];
  const ops = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // 1-indexed + header row

    if (!row.product_id) {
      errors.push({ row: rowNum, message: 'Missing product_id' });
      continue;
    }

    const update = {};
    if (row.selling_price != null && row.selling_price !== '') {
      const sp = Number(row.selling_price);
      if (isNaN(sp) || sp < 0) { errors.push({ row: rowNum, message: `Invalid selling_price: ${row.selling_price}` }); continue; }
      update.selling_price = sp;
    }
    if (row.purchase_price != null && row.purchase_price !== '') {
      const pp = Number(row.purchase_price);
      if (isNaN(pp) || pp < 0) { errors.push({ row: rowNum, message: `Invalid purchase_price: ${row.purchase_price}` }); continue; }
      update.purchase_price = pp;
    }

    if (!Object.keys(update).length) continue;

    ops.push({
      updateOne: {
        filter: { _id: row.product_id },
        update: { $set: update }
      }
    });
  }

  let updated = 0;
  if (ops.length) {
    const result = await ProductMaster.bulkWrite(ops);
    updated = result.modifiedCount;
  }

  res.json({
    success: true,
    message: `Updated ${updated} product(s)`,
    data: { updated, total_rows: rows.length, errors }
  });
});

/**
 * PUT /refresh — Full product master refresh from CSV/XLSX upload
 * Reads BrandName + DosageStrength as the dedup key.
 * Upserts matching products, deactivates stale DB records not in the file.
 * Expects columns: ItemKey, GenericName, BrandName, DosageStrength, SoldPer,
 *   DefaultPurchasePrice, DefaultSellingPrice, IsActive
 */
const refreshProducts = catchAsync(async (req, res) => {
  const XLSX = require('xlsx');
  const { cleanName } = require('../utils/nameClean');
  const { normalizeUnit } = require('../utils/normalize');

  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded. Send as multipart/form-data with field name "file".' });
  }

  const entityId = req.entityId || req.tenantFilter?.entity_id;
  if (!entityId) {
    return res.status(400).json({ success: false, message: 'Entity context required' });
  }

  const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

  if (!rows.length) {
    return res.status(400).json({ success: false, message: 'File is empty' });
  }

  // Deduplicate CSV rows by BrandName|DosageStrength (keep first active, or first)
  const dedupMap = new Map();
  for (const row of rows) {
    const brand = (row.BrandName || '').trim();
    const dosage = (row.DosageStrength || '').trim();
    if (!brand) continue;

    const dedupKey = `${brand}|${dosage}`;
    const isActive = String(row.IsActive || 'TRUE').toUpperCase() !== 'FALSE';

    if (!dedupMap.has(dedupKey)) {
      dedupMap.set(dedupKey, { row, isActive });
    } else {
      // Prefer active version
      const existing = dedupMap.get(dedupKey);
      if (!existing.isActive && isActive) {
        dedupMap.set(dedupKey, { row, isActive });
      }
    }
  }

  const errors = [];
  let upserted = 0, updated = 0, created = 0, deactivated = 0, csvDupsSkipped = rows.length - dedupMap.size;
  const processedItemKeys = new Set();

  for (const [dedupKey, { row, isActive }] of dedupMap) {
    const brand = (row.BrandName || '').trim();
    const dosage = (row.DosageStrength || '').trim();
    const generic = (row.GenericName || '').trim();
    const soldPer = (row.SoldPer || '').trim();
    const purchasePrice = parseFloat(String(row.DefaultPurchasePrice || '0').replace(/,/g, '')) || 0;
    const sellingPrice = parseFloat(String(row.DefaultSellingPrice || '0').replace(/,/g, '')) || 0;
    const itemKey = `${brand}|${dosage}`;
    const brandClean = cleanName(brand);

    processedItemKeys.add(itemKey);

    // Try to find existing product by item_key first
    let existing = await ProductMaster.findOne({ entity_id: entityId, item_key: itemKey });

    // If not found by exact key, try brand_name_clean + dosage (catches old format variants)
    if (!existing && brandClean) {
      existing = await ProductMaster.findOne({
        entity_id: entityId,
        brand_name_clean: brandClean,
        dosage_strength: dosage || { $in: [null, ''] },
      });
    }

    // Also find and deactivate any OTHER duplicates with same brand_clean + dosage
    const allDuplicates = await ProductMaster.find({
      entity_id: entityId,
      brand_name_clean: brandClean,
      ...(dosage ? { dosage_strength: dosage } : { dosage_strength: { $in: [null, ''] } }),
    });

    if (existing) {
      // Update existing product
      existing.brand_name = brand;
      existing.generic_name = generic || existing.generic_name;
      existing.dosage_strength = dosage;
      existing.sold_per = soldPer || existing.sold_per;
      existing.item_key = itemKey;
      existing.brand_name_clean = brandClean;
      if (soldPer) existing.unit_code = normalizeUnit(soldPer);
      if (purchasePrice > 0) existing.purchase_price = purchasePrice;
      if (sellingPrice > 0) existing.selling_price = sellingPrice;
      existing.is_active = isActive;
      await existing.save();
      updated++;

      // Deactivate all other duplicates (not this one)
      for (const dup of allDuplicates) {
        if (dup._id.toString() !== existing._id.toString() && dup.is_active) {
          dup.is_active = false;
          await dup.save();
          deactivated++;
        }
      }
    } else {
      // Create new product
      try {
        await ProductMaster.create({
          entity_id: entityId,
          item_key: itemKey,
          brand_name: brand,
          brand_name_clean: brandClean,
          generic_name: generic || brand,
          dosage_strength: dosage,
          sold_per: soldPer || 'PC',
          unit_code: normalizeUnit(soldPer),
          purchase_price: purchasePrice,
          selling_price: sellingPrice,
          is_active: isActive,
        });
        created++;
      } catch (err) {
        if (err.code === 11000) {
          errors.push({ brand, dosage, message: 'Duplicate key — already exists with different format' });
        } else {
          errors.push({ brand, dosage, message: err.message });
        }
      }
    }
    upserted++;
  }

  // Deactivate stale DB products not in the CSV (only within this entity)
  const staleProducts = await ProductMaster.find({
    entity_id: entityId,
    is_active: true,
    item_key: { $nin: [...processedItemKeys] },
  });

  // Also check by brand_name_clean + dosage before deactivating (safety check)
  const processedCleanKeys = new Set();
  for (const key of processedItemKeys) {
    const [b, d] = key.split('|');
    processedCleanKeys.add(`${cleanName(b)}|${(d || '').toLowerCase()}`);
  }

  let staleDeactivated = 0;
  for (const stale of staleProducts) {
    const staleCleanKey = `${(stale.brand_name_clean || '').toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim()}|${(stale.dosage_strength || '').toLowerCase()}`;
    // Only deactivate if brand+dosage truly not in CSV (not just a format variant)
    const staleClean = `${cleanName(stale.brand_name)}|${(stale.dosage_strength || '').toLowerCase()}`;
    if (!processedCleanKeys.has(staleClean)) {
      stale.is_active = false;
      await stale.save();
      staleDeactivated++;
    }
  }

  res.json({
    success: true,
    message: `Refresh complete: ${updated} updated, ${created} created, ${deactivated + staleDeactivated} deactivated`,
    data: {
      csv_rows: rows.length,
      unique_products: dedupMap.size,
      csv_duplicates_merged: csvDupsSkipped,
      updated,
      created,
      duplicates_deactivated: deactivated,
      stale_deactivated: staleDeactivated,
      errors
    }
  });
});

module.exports = { getAll, getById, create, update, deactivate, updateReorderQty, tagToWarehouse, getProductWarehouses, exportPrices, importPrices, refreshProducts };
