/**
 * Warehouse Migration Script — Phase 17
 *
 * 1. Creates 13 warehouse records from territory registry mapping
 * 2. Backfills warehouse_id on existing InventoryLedger, GrnEntry, StockReassignment, InterCompanyTransfer
 *
 * Usage: node backend/erp/scripts/migrateWarehouses.js
 *
 * IMPORTANT: Run this ONCE after deploying Phase 17 code. Idempotent — skips existing warehouses.
 */
/* eslint-disable vip-tenant/require-entity-filter -- one-shot migration CLI: backfills warehouse_id on every entity by design; no req context */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const Warehouse = require('../models/Warehouse');
const InventoryLedger = require('../models/InventoryLedger');
const GrnEntry = require('../models/GrnEntry');
const StockReassignment = require('../models/StockReassignment');
const InterCompanyTransfer = require('../models/InterCompanyTransfer');
const Entity = require('../models/Entity');
const User = require('../../models/User');
const Territory = require('../models/Territory');

/**
 * Warehouse definitions — aligned with TERRITORY_REGISTRY.csv
 * ILO-MAIN is a new code (not in territory registry)
 */
const WAREHOUSE_DEFS = [
  // MAIN warehouse
  { code: 'ILO-MAIN', name: 'Iloilo Main Warehouse', type: 'MAIN', entity: 'VIP', managerEmail: 'yourpartner@viosintegrated.net', city: 'Iloilo City', is_default_receiving: true, can_receive_grn: true, stock_type: 'PHARMA' },
  // VIP BDM territories
  { code: 'DIG', name: 'VIP Davao', type: 'TERRITORY', entity: 'VIP', managerEmail: 's4.vippharmacy@gmail.com', city: 'Davao City', can_receive_grn: true, stock_type: 'PHARMA' },
  { code: 'BAC', name: 'VIP Bacolod', type: 'TERRITORY', entity: 'VIP', managerEmail: 's3.vippharmacy@gmail.com', city: 'Bacolod City', stock_type: 'PHARMA' },
  { code: 'GSC', name: 'VIP Gensan', type: 'TERRITORY', entity: 'VIP', managerEmail: 's8.vippharmacy@gmail.com', city: 'General Santos', stock_type: 'PHARMA' },
  { code: 'OZA', name: 'VIP Ozamiz', type: 'TERRITORY', entity: 'VIP', managerEmail: 's12.vippharmacy@gmail.com', city: 'Ozamiz City', stock_type: 'PHARMA' },
  { code: 'PAN', name: 'VIP Panay', type: 'TERRITORY', entity: 'VIP', managerEmail: 's18.vippharmacy@gmail.com', city: 'Panay', stock_type: 'PHARMA' },
  { code: 'DUM', name: 'VIP Dumaguete', type: 'TERRITORY', entity: 'VIP', managerEmail: 's21.vippharmacy@gmail.com', city: 'Dumaguete City', stock_type: 'PHARMA' },
  { code: 'CDO', name: 'VIP Cagayan de Oro', type: 'TERRITORY', entity: 'VIP', managerEmail: 'austriafrancisgabriel@gmail.com', city: 'Cagayan de Oro', stock_type: 'PHARMA' },
  // eBDMs (draw from ILO-MAIN)
  { code: 'ILO1', name: 'eBDM 1 Iloilo', type: 'TERRITORY', entity: 'VIP', managerEmail: 's22.vippharmacy@gmail.com', city: 'Iloilo City', drawsFrom: 'ILO-MAIN', stock_type: 'PHARMA' },
  { code: 'ILO2', name: 'eBDM 2 Iloilo', type: 'TERRITORY', entity: 'VIP', managerEmail: 's26.vippharmacy@gmail.com', city: 'Iloilo City', drawsFrom: 'ILO-MAIN', stock_type: 'PHARMA' },
  // Shared Services (has selling function)
  { code: 'ACC', name: 'Shared Services', type: 'TERRITORY', entity: 'VIP', managerEmail: 's25.vippharmacy@gmail.com', city: 'Iloilo City', stock_type: 'PHARMA' },
  // MG AND CO subsidiary
  { code: 'MGO', name: 'MG and CO. Iloilo', type: 'TERRITORY', entity: 'MG AND CO.', managerEmail: 's19.vippharmacy@gmail.com', city: 'Iloilo City', drawsFrom: 'ILO-MAIN', stock_type: 'PHARMA' },
  // Balai Lawaan (F&B)
  { code: 'BLW', name: 'Balai Lawaan', type: 'TERRITORY', entity: 'BALAI LAWAAN', managerEmail: 'ame.oticovios@gmail.com', city: 'Iloilo City', stock_type: 'FNB' },
];

async function run() {
  await connectDB();
  console.log('=== Warehouse Migration Script ===\n');

  // 1. Resolve entities
  const entities = await Entity.find({}).lean();
  const entityByName = {};
  for (const e of entities) {
    entityByName[e.entity_name?.toUpperCase()] = e;
    entityByName[e.short_name?.toUpperCase()] = e;
  }

  // 2. Resolve users by email
  const emails = WAREHOUSE_DEFS.map(d => d.managerEmail);
  const users = await User.find({ email: { $in: emails } }).select('_id email name').lean();
  const userByEmail = new Map(users.map(u => [u.email, u]));

  // 3. Create warehouses
  const createdWarehouses = {};
  let created = 0, skipped = 0;

  for (const def of WAREHOUSE_DEFS) {
    // Find entity
    const entitySearch = def.entity.toUpperCase();
    const entity = entityByName[entitySearch];
    if (!entity) {
      console.log(`  SKIP ${def.code}: Entity "${def.entity}" not found`);
      skipped++;
      continue;
    }

    // Check if already exists
    const existing = await Warehouse.findOne({ entity_id: entity._id, warehouse_code: def.code });
    if (existing) {
      console.log(`  EXISTS ${def.code}: ${def.name} (${existing._id})`);
      createdWarehouses[def.code] = existing;
      skipped++;
      continue;
    }

    const manager = userByEmail.get(def.managerEmail);
    if (!manager) {
      console.log(`  WARN ${def.code}: Manager email "${def.managerEmail}" not found — creating without manager`);
    }

    // Resolve territory_id if exists
    const territory = await Territory.findOne({ territory_code: def.code, entity_id: entity._id }).lean();

    const wh = await Warehouse.create({
      entity_id: entity._id,
      warehouse_code: def.code,
      warehouse_name: def.name,
      warehouse_type: def.type,
      location: { city: def.city },
      manager_id: manager?._id,
      territory_id: territory?._id,
      is_default_receiving: def.is_default_receiving || false,
      can_receive_grn: def.can_receive_grn || false,
      can_transfer_out: true,
      stock_type: def.stock_type || 'PHARMA',
      created_by: manager?._id,
    });

    createdWarehouses[def.code] = wh;
    console.log(`  CREATED ${def.code}: ${def.name} (${wh._id})`);
    created++;
  }

  // 3b. Link draws_from references
  for (const def of WAREHOUSE_DEFS) {
    if (!def.drawsFrom || !createdWarehouses[def.code] || !createdWarehouses[def.drawsFrom]) continue;
    const wh = createdWarehouses[def.code];
    if (wh.draws_from) continue; // already set
    await Warehouse.updateOne({ _id: wh._id }, { draws_from: createdWarehouses[def.drawsFrom]._id });
    console.log(`  LINKED ${def.code} draws_from ${def.drawsFrom}`);
  }

  console.log(`\nWarehouses: ${created} created, ${skipped} skipped/existing\n`);

  // 4. Backfill warehouse_id on InventoryLedger
  // Build bdm_id → warehouse_id mapping
  const bdmToWarehouse = new Map();
  for (const [code, wh] of Object.entries(createdWarehouses)) {
    if (wh.manager_id) {
      bdmToWarehouse.set(wh.manager_id.toString(), wh._id);
    }
  }

  console.log('Backfilling InventoryLedger...');
  let ledgerUpdated = 0;
  for (const [bdmId, warehouseId] of bdmToWarehouse) {
    const result = await InventoryLedger.collection.updateMany(
      { bdm_id: new mongoose.Types.ObjectId(bdmId), warehouse_id: { $exists: false } },
      { $set: { warehouse_id: warehouseId } }
    );
    if (result.modifiedCount > 0) {
      console.log(`  BDM ${bdmId} → Warehouse ${warehouseId}: ${result.modifiedCount} entries`);
      ledgerUpdated += result.modifiedCount;
    }
  }
  console.log(`  Total InventoryLedger entries updated: ${ledgerUpdated}`);

  // 5. Backfill GrnEntry
  console.log('Backfilling GrnEntry...');
  let grnUpdated = 0;
  for (const [bdmId, warehouseId] of bdmToWarehouse) {
    const result = await GrnEntry.updateMany(
      { bdm_id: new mongoose.Types.ObjectId(bdmId), warehouse_id: { $exists: false } },
      { $set: { warehouse_id: warehouseId } }
    );
    grnUpdated += result.modifiedCount;
  }
  console.log(`  Total GrnEntry updated: ${grnUpdated}`);

  // 6. Backfill StockReassignment
  console.log('Backfilling StockReassignment...');
  let reassignUpdated = 0;
  for (const [bdmId, warehouseId] of bdmToWarehouse) {
    const r1 = await StockReassignment.updateMany(
      { source_bdm_id: new mongoose.Types.ObjectId(bdmId), source_warehouse_id: { $exists: false } },
      { $set: { source_warehouse_id: warehouseId } }
    );
    const r2 = await StockReassignment.updateMany(
      { target_bdm_id: new mongoose.Types.ObjectId(bdmId), target_warehouse_id: { $exists: false } },
      { $set: { target_warehouse_id: warehouseId } }
    );
    reassignUpdated += r1.modifiedCount + r2.modifiedCount;
  }
  console.log(`  Total StockReassignment updated: ${reassignUpdated}`);

  // 7. Backfill InterCompanyTransfer
  console.log('Backfilling InterCompanyTransfer...');
  let ictUpdated = 0;
  for (const [bdmId, warehouseId] of bdmToWarehouse) {
    const r1 = await InterCompanyTransfer.updateMany(
      { source_bdm_id: new mongoose.Types.ObjectId(bdmId), source_warehouse_id: { $exists: false } },
      { $set: { source_warehouse_id: warehouseId } }
    );
    const r2 = await InterCompanyTransfer.updateMany(
      { target_bdm_id: new mongoose.Types.ObjectId(bdmId), target_warehouse_id: { $exists: false } },
      { $set: { target_warehouse_id: warehouseId } }
    );
    ictUpdated += r1.modifiedCount + r2.modifiedCount;
  }
  console.log(`  Total InterCompanyTransfer updated: ${ictUpdated}`);

  console.log('\n=== Migration Complete ===');
  console.log(`Warehouses: ${created} created`);
  console.log(`InventoryLedger: ${ledgerUpdated} backfilled`);
  console.log(`GrnEntry: ${grnUpdated} backfilled`);
  console.log(`StockReassignment: ${reassignUpdated} backfilled`);
  console.log(`InterCompanyTransfer: ${ictUpdated} backfilled`);

  await mongoose.disconnect();
}

run().catch(err => { console.error('Migration failed:', err); process.exit(1); });
