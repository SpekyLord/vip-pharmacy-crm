/**
 * Auto-Tag Hospitals with BDMs
 *
 * Scans ALL ERP collections that link hospital_id + bdm_id:
 *   - SalesLine (erp_sales_lines)
 *   - ConsignmentTracker (consignmenttrackers)
 *   - Collection (erp_collections)
 *   - CreditNote (erp_credit_notes)
 *   - CwtLedger (erp_cwt_ledger)
 *
 * Then adds missing tagged_bdms entries to each Hospital so BDMs
 * can see their hospitals in dropdowns.
 *
 * Safe to run multiple times — only adds tags that don't already exist.
 *
 * Usage:
 *   node backend/erp/scripts/autoTagHospitalBdms.js
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const connectDB = require('../../config/db');

// Aggregate unique { hospital_id, bdm_id } pairs from a collection
async function collectPairs(collectionName, hospitalBdmMap) {
  const coll = mongoose.connection.collection(collectionName);
  const pairs = await coll.aggregate([
    { $match: { hospital_id: { $exists: true, $ne: null }, bdm_id: { $exists: true, $ne: null } } },
    { $group: { _id: { hospital_id: '$hospital_id', bdm_id: '$bdm_id' } } }
  ]).toArray();

  for (const p of pairs) {
    const hId = p._id.hospital_id.toString();
    const bId = p._id.bdm_id.toString();
    if (!hospitalBdmMap.has(hId)) hospitalBdmMap.set(hId, new Set());
    hospitalBdmMap.get(hId).add(bId);
  }
  console.log(`  ${collectionName}: ${pairs.length} pair(s)`);
  return pairs.length;
}

async function run() {
  await connectDB();

  const Hospital = require('../models/Hospital');

  // 1. Collect all hospital–BDM pairs from every relevant collection
  const hospitalBdmMap = new Map(); // hospitalId → Set<bdmId>
  console.log('\nScanning collections for hospital–BDM relationships...');

  const sources = [
    'erp_sales_lines',
    'consignmenttrackers',
    'erp_collections',
    'erp_credit_notes',
    'erp_cwt_ledger'
  ];

  let totalPairs = 0;
  for (const src of sources) {
    try {
      totalPairs += await collectPairs(src, hospitalBdmMap);
    } catch (err) {
      // Collection might not exist yet — skip gracefully
      console.log(`  ${src}: skipped (${err.message})`);
    }
  }

  console.log(`\nTotal unique pairs found: ${totalPairs}`);
  console.log(`Unique hospitals with BDM activity: ${hospitalBdmMap.size}`);

  if (hospitalBdmMap.size === 0) {
    console.log('No hospital–BDM pairs found. Nothing to tag.');
    await mongoose.disconnect();
    return;
  }

  // 2. Load hospitals that need tagging
  const hospitalIds = [...hospitalBdmMap.keys()].map(id => new mongoose.Types.ObjectId(id));
  const hospitals = await Hospital.find({ _id: { $in: hospitalIds } })
    .select('_id hospital_name tagged_bdms');

  console.log(`\nHospitals to check: ${hospitals.length}`);

  let totalAdded = 0;
  let hospitalsUpdated = 0;

  for (const h of hospitals) {
    const existingBdmIds = new Set(
      (h.tagged_bdms || []).map(t => t.bdm_id.toString())
    );
    const neededBdmIds = hospitalBdmMap.get(h._id.toString()) || new Set();

    const toAdd = [];
    for (const bdmId of neededBdmIds) {
      if (!existingBdmIds.has(bdmId)) {
        toAdd.push({
          bdm_id: new mongoose.Types.ObjectId(bdmId),
          tagged_at: new Date(),
          is_active: true
        });
      }
    }

    if (toAdd.length > 0) {
      await Hospital.updateOne(
        { _id: h._id },
        { $push: { tagged_bdms: { $each: toAdd } } }
      );
      console.log(`  ✓ ${h.hospital_name}: +${toAdd.length} BDM tag(s) (had ${existingBdmIds.size}, now ${existingBdmIds.size + toAdd.length})`);
      totalAdded += toAdd.length;
      hospitalsUpdated++;
    }
  }

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`Done. Added ${totalAdded} BDM tag(s) across ${hospitalsUpdated} hospital(s).`);
  if (totalAdded === 0) console.log('All hospitals were already correctly tagged.');
  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
