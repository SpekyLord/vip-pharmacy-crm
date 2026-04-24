#!/usr/bin/env node
/**
 * Phase 4A — Entity Data Migration
 *
 * Consolidates data from the fake "VIP Pharmacy Inc." entity into the real entities:
 *   - VIOS INTEGRATED PROJECTS (VIP) INC. (parent) — 8 VIP BDMs + Cristina + TEST
 *   - MG AND CO. INC. (subsidiary) — Jake Montero
 *
 * Also:
 *   - Makes Hospital model globally shared (removes entity_id requirement)
 *   - Merges duplicate hospitals
 *   - Deletes the fake entity after verification
 *
 * Safe to run multiple times (idempotent).
 *
 * Usage: cd backend && node erp/scripts/migrateEntityData.js
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// Models
const Entity = require('../models/Entity');
const User = require('../../models/User');
const ProductMaster = require('../models/ProductMaster');
const InventoryLedger = require('../models/InventoryLedger');
const SalesLine = require('../models/SalesLine');
const TransactionEvent = require('../models/TransactionEvent');
const GrnEntry = require('../models/GrnEntry');
const ConsignmentTracker = require('../models/ConsignmentTracker');
const Hospital = require('../models/Hospital');
const ErpAuditLog = require('../models/ErpAuditLog');

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('MONGO_URI not set');
  process.exit(1);
}

// Known MG AND CO. BDM — case-insensitive match
const MG_BDM_NAMES = ['jake montero'];

/**
 * Determine whether a user is an MG BDM based on name matching
 */
function isMgBdm(user) {
  const name = (user.name || '').toLowerCase().trim();
  return MG_BDM_NAMES.some(mg => name.includes(mg));
}

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB\n');

  // ─── Step 1: Find entities ───
  const vipEntity = await Entity.findOne({
    entity_name: { $regex: /VIOS INTEGRATED/i }
  });
  const mgEntity = await Entity.findOne({
    entity_name: { $regex: /MG AND CO/i }
  });

  if (!vipEntity) {
    console.error('VIP (VIOS INTEGRATED) entity not found. Run seedEntities.js first.');
    process.exit(1);
  }
  if (!mgEntity) {
    console.error('MG AND CO. entity not found. Run seedEntities.js first.');
    process.exit(1);
  }

  console.log(`VIP entity: ${vipEntity._id} — ${vipEntity.entity_name}`);
  console.log(`MG  entity: ${mgEntity._id} — ${mgEntity.entity_name}\n`);

  // ─── Step 2: Find all fake/wrong entity IDs ───
  // Any entity_id on Users/Products/Ledger that is NOT vipEntity or mgEntity
  const allEntities = await Entity.find().lean();
  const validIds = new Set([vipEntity._id.toString(), mgEntity._id.toString()]);
  const fakeEntities = allEntities.filter(e => !validIds.has(e._id.toString()));

  console.log(`Found ${fakeEntities.length} entities to clean up:`);
  for (const fe of fakeEntities) {
    console.log(`  - ${fe._id} "${fe.entity_name}" (${fe.entity_type})`);
  }
  const fakeIds = fakeEntities.map(e => e._id);

  // ─── Step 3: Identify and reassign users ───
  const allBdms = await User.find({
    role: { $in: ['employee'] },
    isActive: { $ne: false }
  }).select('name email entity_id role').lean();

  console.log(`\nFound ${allBdms.length} active BDMs:`);

  let vipCount = 0;
  let mgCount = 0;

  for (const bdm of allBdms) {
    const targetEntity = isMgBdm(bdm) ? mgEntity : vipEntity;
    const targetLabel = isMgBdm(bdm) ? 'MG' : 'VIP';
    const currentId = bdm.entity_id?.toString();
    const targetId = targetEntity._id.toString();

    if (currentId === targetId) {
      console.log(`  ✓ ${bdm.name} (${bdm.email}) — already ${targetLabel}`);
    } else {
      await User.updateOne(
        { _id: bdm._id },
        { $set: { entity_id: targetEntity._id } }
      );
      console.log(`  → ${bdm.name} (${bdm.email}) — moved to ${targetLabel}`);
    }
    if (isMgBdm(bdm)) mgCount++;
    else vipCount++;
  }

  // Also assign admin/president/finance users to VIP entity
  const adminUsers = await User.find({
    role: { $in: ['admin', 'president', 'ceo', 'finance'] }
  }).select('name email entity_id role').lean();

  for (const u of adminUsers) {
    if (u.entity_id?.toString() !== vipEntity._id.toString()) {
      await User.updateOne(
        { _id: u._id },
        { $set: { entity_id: vipEntity._id } }
      );
      console.log(`  → ${u.name} (${u.role}) — assigned to VIP`);
    }
  }

  console.log(`\nBDM assignment: ${vipCount} VIP, ${mgCount} MG\n`);

  // ─── Step 4: Migrate ProductMaster ───
  if (fakeIds.length > 0) {
    // Get all BDMs by entity for product assignment
    const mgBdms = allBdms.filter(isMgBdm);
    const mgBdmIds = mgBdms.map(b => b._id);

    // Find products that belong to fake entities
    const fakeProducts = await ProductMaster.find({
      entity_id: { $in: fakeIds }
    }).lean();

    console.log(`Products on fake entities: ${fakeProducts.length}`);

    // Check if these products were created for MG BDMs (via inventory)
    // MG products: those that have inventory ledger entries for MG BDMs
    const mgProductIds = new Set();
    if (mgBdmIds.length > 0) {
      const mgLedger = await InventoryLedger.distinct('product_id', {
        bdm_id: { $in: mgBdmIds }
      });
      for (const pid of mgLedger) mgProductIds.add(pid.toString());
    }

    let movedToVip = 0;
    let movedToMg = 0;
    let skippedDup = 0;

    for (const product of fakeProducts) {
      const targetEntity = mgProductIds.has(product._id.toString()) ? mgEntity : vipEntity;
      const targetLabel = mgProductIds.has(product._id.toString()) ? 'MG' : 'VIP';

      // Check for duplicate item_key in target entity
      const existing = await ProductMaster.findOne({
        entity_id: targetEntity._id,
        item_key: product.item_key
      });

      if (existing) {
        // Update references to point to existing product, then delete duplicate
        await InventoryLedger.updateMany(
          { product_id: product._id },
          { $set: { product_id: existing._id } }
        );
        await SalesLine.updateMany(
          { 'line_items.product_id': product._id },
          { $set: { 'line_items.$.product_id': existing._id } }
        );
        await ProductMaster.deleteOne({ _id: product._id });
        skippedDup++;
      } else {
        await ProductMaster.updateOne(
          { _id: product._id },
          { $set: { entity_id: targetEntity._id } }
        );
        if (targetLabel === 'MG') movedToMg++;
        else movedToVip++;
      }
    }

    console.log(`  Moved to VIP: ${movedToVip}, MG: ${movedToMg}, Merged duplicates: ${skippedDup}`);
  }

  // ─── Step 5: Migrate InventoryLedger ───
  if (fakeIds.length > 0) {
    const mgBdmUsers = await User.find({
      entity_id: mgEntity._id,
      role: { $in: ['staff', 'employee', 'contractor'] }  // Phase S2 (Apr 2026): accept both old + new role names for idempotency
    }).select('_id').lean();
    const mgBdmIdSet = new Set(mgBdmUsers.map(u => u._id.toString()));

    const fakeLedger = await InventoryLedger.find({
      entity_id: { $in: fakeIds }
    }).select('_id bdm_id').lean();

    let ledgerVip = 0;
    let ledgerMg = 0;

    for (const entry of fakeLedger) {
      const target = mgBdmIdSet.has(entry.bdm_id?.toString()) ? mgEntity : vipEntity;
      // InventoryLedger is immutable on save, so use direct updateOne
      await mongoose.connection.collection('erp_inventory_ledger').updateOne(
        { _id: entry._id },
        { $set: { entity_id: target._id } }
      );
      if (target === mgEntity) ledgerMg++;
      else ledgerVip++;
    }

    console.log(`\nInventory Ledger migrated: ${ledgerVip} VIP, ${ledgerMg} MG`);
  }

  // ─── Step 6: Migrate SalesLine ───
  if (fakeIds.length > 0) {
    const mgBdmUsers = await User.find({ entity_id: mgEntity._id, role: { $in: ['staff', 'employee', 'contractor'] } }).select('_id').lean();
    const mgBdmIdSet = new Set(mgBdmUsers.map(u => u._id.toString()));

    const fakeSales = await SalesLine.find({ entity_id: { $in: fakeIds } }).select('_id bdm_id').lean();
    let salesVip = 0, salesMg = 0;

    for (const s of fakeSales) {
      const target = mgBdmIdSet.has(s.bdm_id?.toString()) ? mgEntity : vipEntity;
      await SalesLine.updateOne({ _id: s._id }, { $set: { entity_id: target._id } });
      if (target === mgEntity) salesMg++;
      else salesVip++;
    }

    console.log(`SalesLine migrated: ${salesVip} VIP, ${salesMg} MG`);
  }

  // ─── Step 7: Migrate TransactionEvent ───
  if (fakeIds.length > 0) {
    const mgBdmUsers = await User.find({ entity_id: mgEntity._id, role: { $in: ['staff', 'employee', 'contractor'] } }).select('_id').lean();
    const mgBdmIdSet = new Set(mgBdmUsers.map(u => u._id.toString()));

    // TransactionEvent is immutable, use direct collection update
    const fakeEvents = await mongoose.connection.collection('transactionevents').find({
      entity_id: { $in: fakeIds }
    }).toArray();

    let evVip = 0, evMg = 0;
    for (const ev of fakeEvents) {
      const target = mgBdmIdSet.has(ev.bdm_id?.toString()) ? mgEntity : vipEntity;
      await mongoose.connection.collection('transactionevents').updateOne(
        { _id: ev._id },
        { $set: { entity_id: target._id } }
      );
      if (target === mgEntity) evMg++;
      else evVip++;
    }

    console.log(`TransactionEvent migrated: ${evVip} VIP, ${evMg} MG`);
  }

  // ─── Step 8: Migrate GrnEntry + ConsignmentTracker ───
  if (fakeIds.length > 0) {
    const grnResult = await GrnEntry.updateMany(
      { entity_id: { $in: fakeIds } },
      { $set: { entity_id: vipEntity._id } }
    );
    console.log(`GrnEntry migrated: ${grnResult.modifiedCount}`);

    const ctResult = await ConsignmentTracker.updateMany(
      { entity_id: { $in: fakeIds } },
      { $set: { entity_id: vipEntity._id } }
    );
    console.log(`ConsignmentTracker migrated: ${ctResult.modifiedCount}`);
  }

  // ─── Step 9: Make Hospitals globally shared ───
  console.log('\n─── Making Hospitals Globally Shared ───');

  // Drop the old entity-scoped unique index
  try {
    await mongoose.connection.collection('erp_hospitals').dropIndex('entity_id_1_hospital_name_clean_1');
    console.log('  Dropped old index: entity_id_1_hospital_name_clean_1');
  } catch (e) {
    if (e.code !== 27) console.log('  Old index already removed or not found');
  }

  // Create new global unique index
  try {
    await mongoose.connection.collection('erp_hospitals').createIndex(
      { hospital_name_clean: 1 },
      { unique: true, name: 'hospital_name_clean_1_global' }
    );
    console.log('  Created global unique index: hospital_name_clean_1_global');
  } catch (e) {
    if (e.code === 11000) {
      console.log('  ⚠️ Duplicate hospital_name_clean found — merging...');
      await mergeDuplicateHospitals();
      // Retry index creation
      await mongoose.connection.collection('erp_hospitals').createIndex(
        { hospital_name_clean: 1 },
        { unique: true, name: 'hospital_name_clean_1_global' }
      );
      console.log('  Created global unique index after merge');
    } else {
      console.log(`  Index already exists or error: ${e.message}`);
    }
  }

  // Unset entity_id from all hospitals (make them global)
  const hospResult = await Hospital.updateMany(
    {},
    { $unset: { entity_id: '' } }
  );
  console.log(`  Unset entity_id from ${hospResult.modifiedCount} hospitals`);

  // ─── Step 10: Delete fake entities ───
  if (fakeIds.length > 0) {
    // Verify no orphaned data
    for (const fakeId of fakeIds) {
      const orphanChecks = await Promise.all([
        ProductMaster.countDocuments({ entity_id: fakeId }),
        InventoryLedger.countDocuments({ entity_id: fakeId }),
        SalesLine.countDocuments({ entity_id: fakeId }),
        GrnEntry.countDocuments({ entity_id: fakeId }),
        ConsignmentTracker.countDocuments({ entity_id: fakeId }),
      ]);
      const total = orphanChecks.reduce((a, b) => a + b, 0);

      if (total > 0) {
        console.log(`\n⚠️ Entity ${fakeId} still has ${total} orphaned records — skipping delete`);
      } else {
        await Entity.deleteOne({ _id: fakeId });
        console.log(`\n✓ Deleted fake entity: ${fakeId}`);
      }
    }
  }

  // ─── Step 11: Integrity check ───
  console.log('\n─── Integrity Check ───');
  const remainingEntities = await Entity.find().lean();
  console.log(`Entities: ${remainingEntities.map(e => `${e.entity_name} (${e._id})`).join(', ')}`);

  const vipUsers = await User.countDocuments({ entity_id: vipEntity._id, role: { $in: ['staff', 'employee', 'contractor'] } });
  const mgUsers = await User.countDocuments({ entity_id: mgEntity._id, role: { $in: ['staff', 'employee', 'contractor'] } });
  console.log(`VIP BDMs: ${vipUsers}, MG BDMs: ${mgUsers}`);

  const vipProducts = await ProductMaster.countDocuments({ entity_id: vipEntity._id });
  const mgProducts = await ProductMaster.countDocuments({ entity_id: mgEntity._id });
  console.log(`VIP Products: ${vipProducts}, MG Products: ${mgProducts}`);

  const collections = ['erp_inventory_ledger', 'saleslines', 'transactionevents', 'erp_grn_entries'];
  for (const col of collections) {
    try {
      const orphans = await mongoose.connection.collection(col).countDocuments({
        entity_id: { $nin: [vipEntity._id, mgEntity._id] }
      });
      if (orphans > 0) {
        console.log(`  ⚠️ ${col}: ${orphans} orphaned records with unknown entity_id`);
      } else {
        console.log(`  ✓ ${col}: clean`);
      }
    } catch {
      console.log(`  - ${col}: collection not found (OK)`);
    }
  }

  const hospitalCount = await Hospital.countDocuments();
  const hospWithEntity = await Hospital.countDocuments({ entity_id: { $exists: true, $ne: null } });
  console.log(`\nHospitals: ${hospitalCount} total, ${hospWithEntity} still with entity_id (should be 0)`);

  console.log('\n✅ Migration complete!');
  await mongoose.disconnect();
}

/**
 * Merge duplicate hospitals (same hospital_name_clean, different entity_id).
 * Keeps the first one found, merges tagged_bdms from others.
 */
async function mergeDuplicateHospitals() {
  const duplicates = await Hospital.aggregate([
    { $group: { _id: '$hospital_name_clean', count: { $sum: 1 }, ids: { $push: '$_id' } } },
    { $match: { count: { $gt: 1 } } }
  ]);

  for (const dup of duplicates) {
    const hospitals = await Hospital.find({ _id: { $in: dup.ids } }).sort({ createdAt: 1 });
    const keeper = hospitals[0];
    const toMerge = hospitals.slice(1);

    // Consolidate tagged_bdms
    const existingBdmIds = new Set(keeper.tagged_bdms.map(t => t.bdm_id.toString()));
    for (const h of toMerge) {
      for (const tag of h.tagged_bdms) {
        if (!existingBdmIds.has(tag.bdm_id.toString())) {
          keeper.tagged_bdms.push(tag);
          existingBdmIds.add(tag.bdm_id.toString());
        }
      }
    }
    await keeper.save();

    // Update references in other collections to point to keeper
    const mergeIds = toMerge.map(h => h._id);
    await SalesLine.updateMany(
      { hospital_id: { $in: mergeIds } },
      { $set: { hospital_id: keeper._id } }
    );
    await ConsignmentTracker.updateMany(
      { hospital_id: { $in: mergeIds } },
      { $set: { hospital_id: keeper._id } }
    );

    // Delete merged duplicates
    await Hospital.deleteMany({ _id: { $in: mergeIds } });
    console.log(`    Merged ${toMerge.length} duplicates of "${keeper.hospital_name}" → kept ${keeper._id}`);
  }
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
