/* eslint-disable vip-tenant/require-entity-filter -- one-shot admin diagnostic; finds CSI #7648 across all entities then probes each entity's data; no req/tenant context */
/**
 * Diagnostic: why does CSI #7648 show in AR Aging but not in Collections "open CSIs"?
 *
 * Run: node backend/scripts/debugCsi7648.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const SalesLine = require('../erp/models/SalesLine');
  const Hospital = require('../erp/models/Hospital');
  const User = require('../models/User');
  const Warehouse = require('../erp/models/Warehouse');
  const Collection = require('../erp/models/Collection');

  const DOC_REF = '7648';
  const HOSPITAL_NAME = 'South Bacolod General Hospital';
  const BDM_EMAIL_HINT = 'mae'; // Mae Navarro

  console.log(`\n=== CSI with doc_ref=${DOC_REF} ===`);
  const csis = await SalesLine.find({ doc_ref: DOC_REF }).lean();
  for (const csi of csis) {
    console.log({
      _id: csi._id,
      doc_ref: csi.doc_ref,
      sale_type: csi.sale_type,
      status: csi.status,
      source: csi.source,
      entity_id: csi.entity_id,
      bdm_id: csi.bdm_id,
      hospital_id: csi.hospital_id,
      customer_id: csi.customer_id,
      petty_cash_fund_id: csi.petty_cash_fund_id,
      deletion_event_id: csi.deletion_event_id,
      csi_date: csi.csi_date,
      invoice_total: csi.invoice_total,
    });
  }

  console.log(`\n=== Hospitals named like "${HOSPITAL_NAME}" ===`);
  const hospitals = await Hospital.find({
    hospital_name: { $regex: HOSPITAL_NAME, $options: 'i' }
  }).lean();
  for (const h of hospitals) {
    console.log({
      _id: h._id,
      hospital_name: h.hospital_name,
      status: h.status,
      warehouse_ids: h.warehouse_ids,
      tagged_bdms: h.tagged_bdms,
    });
  }

  console.log(`\n=== Users matching "${BDM_EMAIL_HINT}" ===`);
  const users = await User.find({
    $or: [
      { email: { $regex: BDM_EMAIL_HINT, $options: 'i' } },
      { name: { $regex: BDM_EMAIL_HINT, $options: 'i' } },
    ]
  }).select('_id name email role entity_id entity_ids').lean();
  for (const u of users) {
    console.log(u);
  }

  // For each candidate BDM, show which warehouses they are assigned to
  console.log(`\n=== Warehouses assigned to matching users ===`);
  for (const u of users) {
    const whs = await Warehouse.find({
      is_active: true,
      $or: [{ manager_id: u._id }, { assigned_users: u._id }]
    }).select('_id warehouse_name warehouse_code manager_id assigned_users').lean();
    console.log(`  User ${u.name} (${u._id}): ${whs.length} warehouses`);
    for (const w of whs) console.log(`    ${w.warehouse_code} ${w.warehouse_name} (${w._id})`);
  }

  // Simulate getOpenCsis for each (user, hospital) combination
  console.log(`\n=== Simulating getOpenCsis per candidate ===`);
  for (const u of users) {
    for (const h of hospitals) {
      const match = {
        status: 'POSTED',
        deletion_event_id: { $exists: false },
        petty_cash_fund_id: null,
        bdm_id: u._id,
        hospital_id: h._id,
      };
      if (u.entity_id) match.entity_id = u.entity_id;
      const count = await SalesLine.countDocuments(match);
      console.log(`  user=${u.name} entity=${u.entity_id} hospital=${h._id} => ${count} CSIs`);
    }
  }

  // Check for any POSTED collections against CSI 7648
  if (csis.length) {
    console.log(`\n=== Collections settling CSI(s) ${csis.map(c => c._id).join(', ')} ===`);
    const colls = await Collection.find({
      status: 'POSTED',
      deletion_event_id: { $exists: false },
      'settled_csis.sales_line_id': { $in: csis.map(c => c._id) }
    }).select('cr_no cr_date cr_amount settled_csis status entity_id').lean();
    console.log(`  Found ${colls.length}`);
    for (const c of colls) console.log(c);
  }

  await mongoose.disconnect();
})().catch(err => { console.error(err); process.exit(1); });
