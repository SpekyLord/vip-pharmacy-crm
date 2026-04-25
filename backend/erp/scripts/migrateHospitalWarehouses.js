/* eslint-disable vip-tenant/require-entity-filter -- standalone admin/migration/diagnostic script: no req context; intentional cross-entity reads/writes for ops work */
/**
 * Migrate Hospital Access: tagged_bdms → warehouse_ids
 * Also imports new hospitals for GSC (Gensan) territory.
 *
 * Logic:
 *   1. For each hospital with tagged_bdms, find which warehouse(s) those BDMs belong to
 *   2. Set warehouse_ids on the hospital based on the BDM→warehouse mapping
 *   3. Import new GSC hospitals that don't exist yet
 *   4. Assign GSC warehouse_id to all GSC hospitals
 *
 * Safe to run multiple times — idempotent.
 *
 * Usage: node backend/erp/scripts/migrateHospitalWarehouses.js
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const connectDB = require('../../config/db');

// GSC hospitals (cleaned, deduped, typos fixed)
const GSC_HOSPITALS = [
  'Mindanao Medical Center',
  'Sarangani Bay Specialist',
  'Gensan Medical Center',
  'Nestor Dizon Hospital',
  'Labilla Hospital',
  'Doctors Hospital',
  'St Elizabeth Hospital',
  'Socsargen Hospital',
  'Diangas Medical Center',
  'Royeca Hospital',
  'Teoborsio Hospital',
  'Heramil Hospital',
  'Bontoyan Hospital',
  'Howard Havard Hospital',
  'Adventist Hospital',
  'Tupi Provincial Hospital',
  'Allah Valley Hospital',
  'Socomedics Hospital',
  'Sultan Kudarat Provincial Hospital',
  'Tacurong Doctors Hospital',
  'Sultan Kudarat Doctors Hospital',
  'Quijano Hospital',
  'St. Louis Hospital',
  'Notre Dame Hospital',
  'Cotabato Doctors',
  'Pingoy Hospital'
];

async function run() {
  await connectDB();
  const Hospital = require('../models/Hospital');
  const Warehouse = require('../models/Warehouse');
  const User = require('../../models/User');

  // ── Step 1: Build BDM → warehouse mapping ──
  console.log('\n=== Step 1: Building BDM → warehouse mapping ===');
  const warehouses = await Warehouse.find({ is_active: true }).select('_id warehouse_code warehouse_name manager_id assigned_users').lean();
  const bdmToWarehouse = new Map(); // bdmId → warehouseId

  for (const w of warehouses) {
    if (w.manager_id) {
      bdmToWarehouse.set(w.manager_id.toString(), w._id);
      console.log(`  ${w.warehouse_code}: manager → ${w.manager_id}`);
    }
    for (const uid of (w.assigned_users || [])) {
      bdmToWarehouse.set(uid.toString(), w._id);
      console.log(`  ${w.warehouse_code}: assigned → ${uid}`);
    }
  }
  console.log(`  Total BDM→warehouse mappings: ${bdmToWarehouse.size}`);

  // ── Step 2: Migrate existing hospitals (tagged_bdms → warehouse_ids) ──
  console.log('\n=== Step 2: Migrating tagged_bdms → warehouse_ids ===');
  const allHospitals = await Hospital.find({}).select('_id hospital_name tagged_bdms warehouse_ids');
  let migrated = 0;

  for (const h of allHospitals) {
    const existingWhIds = new Set((h.warehouse_ids || []).map(id => id.toString()));
    const newWhIds = new Set();

    for (const tag of (h.tagged_bdms || []).filter(t => t.is_active !== false)) {
      const whId = bdmToWarehouse.get(tag.bdm_id.toString());
      if (whId && !existingWhIds.has(whId.toString())) {
        newWhIds.add(whId.toString());
      }
    }

    if (newWhIds.size > 0) {
      const toAdd = [...newWhIds].map(id => new mongoose.Types.ObjectId(id));
      await Hospital.updateOne(
        { _id: h._id },
        { $addToSet: { warehouse_ids: { $each: toAdd } } }
      );
      const whCodes = toAdd.map(id => warehouses.find(w => w._id.toString() === id.toString())?.warehouse_code || '?');
      console.log(`  ${h.hospital_name}: +${newWhIds.size} warehouse(s) [${whCodes.join(', ')}]`);
      migrated++;
    }
  }
  console.log(`  Migrated: ${migrated} hospital(s)`);

  // ── Step 3: Import GSC hospitals ──
  console.log('\n=== Step 3: Importing GSC hospitals ===');
  const gscWarehouse = warehouses.find(w => w.warehouse_code === 'GSC');
  if (!gscWarehouse) {
    console.error('  GSC warehouse not found!');
    await mongoose.disconnect();
    return;
  }
  console.log(`  GSC warehouse: ${gscWarehouse.warehouse_name} (${gscWarehouse._id})`);

  let created = 0, alreadyExists = 0, gscTagged = 0;

  for (const name of GSC_HOSPITALS) {
    // Case-insensitive check for existing hospital
    const existing = await Hospital.findOne({
      hospital_name: { $regex: `^${name.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, $options: 'i' }
    });

    if (existing) {
      // Ensure GSC warehouse_id is set
      const hasGsc = (existing.warehouse_ids || []).some(id => id.toString() === gscWarehouse._id.toString());
      if (!hasGsc) {
        await Hospital.updateOne(
          { _id: existing._id },
          { $addToSet: { warehouse_ids: gscWarehouse._id } }
        );
        console.log(`  EXISTS + tagged GSC: ${existing.hospital_name}`);
        gscTagged++;
      } else {
        console.log(`  EXISTS (already GSC): ${existing.hospital_name}`);
      }
      alreadyExists++;
    } else {
      await Hospital.create({
        hospital_name: name,
        warehouse_ids: [gscWarehouse._id],
        status: 'ACTIVE',
        payment_terms: 30,
        vat_status: 'VATABLE',
        cwt_rate: 0.01
      });
      console.log(`  CREATED: ${name}`);
      created++;
    }
  }

  console.log(`\n  GSC summary: ${created} created, ${alreadyExists} existed, ${gscTagged} newly tagged to GSC`);

  // ── Step 4: Summary ──
  console.log('\n=== Final Summary ===');
  const finalCount = await Hospital.countDocuments({ status: 'ACTIVE' });
  const withWh = await Hospital.countDocuments({ status: 'ACTIVE', 'warehouse_ids.0': { $exists: true } });
  const withoutWh = finalCount - withWh;
  console.log(`  Active hospitals: ${finalCount}`);
  console.log(`  With warehouse assignment: ${withWh}`);
  console.log(`  Without warehouse assignment: ${withoutWh}`);

  if (withoutWh > 0) {
    const unassigned = await Hospital.find({ status: 'ACTIVE', $or: [{ warehouse_ids: { $exists: false } }, { warehouse_ids: { $size: 0 } }] }).select('hospital_name').lean();
    console.log('  Unassigned hospitals:');
    for (const h of unassigned) console.log(`    - ${h.hospital_name}`);
  }

  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
