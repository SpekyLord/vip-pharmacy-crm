/**
 * Quick lookup:
 *  - What unit (AMP vs VIAL) does the Viprazole 40 mg product master + ledger
 *    actually carry? (the test sale picked up "AMPULE" from the ledger row)
 *  - Does the MG and CO test sale exist? print its id and entity.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const ProductMaster = require('../models/ProductMaster');
const InventoryLedger = require('../models/InventoryLedger');
const SalesLine = require('../models/SalesLine');
const Entity = require('../models/Entity');

(async () => {
  await connectDB();
  const product = await ProductMaster.findById('69cea0659f33132dd40cb56b').lean();
  console.log('── ProductMaster: Viprazole ──');
  if (product) {
    console.log(`  brand=${product.brand_name}  generic=${product.generic_name}  dosage=${product.dosage_strength}`);
    console.log(`  unit=${product.unit}  packaging=${product.packaging}  category=${product.category}`);
  } else {
    console.log('  product not found');
  }

  console.log('\n── InventoryLedger rows for that product ──');
  const ledger = await InventoryLedger.find({ product_id: '69cea0659f33132dd40cb56b' })
    .select('entity_id batch_lot_no unit qty_in qty_out expiry_date')
    .limit(10)
    .lean();
  ledger.forEach((l) => console.log(`  entity=${l.entity_id}  batch=${l.batch_lot_no}  unit=${l.unit}  qty_in=${l.qty_in}  qty_out=${l.qty_out}  exp=${l.expiry_date?.toISOString?.()?.slice(0,10)}`));

  console.log('\n── Test sales ──');
  const sales = await SalesLine.find({ doc_ref: { $in: ['CSI-TEST', 'CSI-TEST-MG'] } })
    .select('_id doc_ref entity_id status line_items')
    .lean();
  for (const s of sales) {
    const ent = await Entity.findById(s.entity_id).select('entity_name').lean();
    console.log(`  ${s._id}  doc_ref=${s.doc_ref}  status=${s.status}  entity=${ent?.entity_name}`);
    s.line_items.forEach((li) => console.log(`     unit=${li.unit}  batch=${li.batch_lot_no}  qty=${li.qty}`));
  }

  await mongoose.disconnect();
})().catch((e) => { console.error(e); mongoose.disconnect(); process.exit(1); });
