/**
 * One-shot: explain why product 69cea0659f33132dd40cb56b cannot be saved on a
 * GRN against entity VIP — by printing its home entity, all sibling rows
 * keyed on the same canonical (brand+dosage+sold_per), and the entity table
 * for cross-reference. Read-only.
 *
 * Run: node backend/erp/scripts/diagnoseGrnProduct.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const ProductMaster = require('../models/ProductMaster');
const Entity = require('../models/Entity');
const InventoryLedger = require('../models/InventoryLedger');

const TARGET_ID = '69cea0659f33132dd40cb56b';

(async () => {
  await connectDB();

  const product = await ProductMaster.findById(TARGET_ID).lean();
  console.log('── ProductMaster row for', TARGET_ID, '──');
  if (!product) {
    console.log('  NOT FOUND in any entity. The id may be from a different cluster or has been deleted.');
    await mongoose.disconnect();
    return;
  }

  const homeEntity = await Entity.findById(product.entity_id).select('entity_name').lean();
  console.log(`  brand         = ${product.brand_name}`);
  console.log(`  generic       = ${product.generic_name}`);
  console.log(`  dosage        = ${product.dosage_strength}`);
  console.log(`  sold_per      = ${product.sold_per}`);
  console.log(`  unit_code     = ${product.unit_code}`);
  console.log(`  selling_uom   = ${product.selling_uom}`);
  console.log(`  selling_price = ${product.selling_price}`);
  console.log(`  vat_status    = ${product.vat_status}`);
  console.log(`  is_active     = ${product.is_active}`);
  console.log(`  entity_id     = ${product.entity_id}  (${homeEntity?.entity_name || '<unknown>'})`);
  console.log(`  item_key      = ${product.item_key}`);

  console.log('\n── Sibling rows with same item_key (cross-entity) ──');
  const siblings = await ProductMaster.find({ item_key: product.item_key }).lean();
  for (const s of siblings) {
    const ent = await Entity.findById(s.entity_id).select('entity_name').lean();
    const me = s._id.toString() === TARGET_ID ? '  ← TARGET' : '';
    console.log(`  ${s._id}  entity=${ent?.entity_name}  selling=${s.selling_price}  unit=${s.selling_uom}${me}`);
  }

  console.log('\n── Entity master ──');
  const entities = await Entity.find().select('entity_name entity_type parent_entity_id').lean();
  for (const e of entities) {
    const tag = e._id.toString() === product.entity_id.toString() ? '  ← HOME of target product' : '';
    console.log(`  ${e._id}  ${e.entity_name}  type=${e.entity_type}  parent=${e.parent_entity_id || '—'}${tag}`);
  }

  console.log('\n── InventoryLedger sample (where stock for this product currently lives) ──');
  const ledger = await InventoryLedger.find({ product_id: TARGET_ID })
    .select('entity_id batch_lot_no qty_in qty_out expiry_date')
    .limit(5)
    .lean();
  for (const l of ledger) {
    const ent = await Entity.findById(l.entity_id).select('entity_name').lean();
    console.log(`  entity=${ent?.entity_name}  batch=${l.batch_lot_no}  qty_in=${l.qty_in}  qty_out=${l.qty_out}  exp=${l.expiry_date?.toISOString?.()?.slice(0,10) || '—'}`);
  }
  if (!ledger.length) console.log('  (no ledger rows yet — product never received)');

  console.log('\n── Conclusion ──');
  const vipEntity = entities.find(e => e.entity_name === 'VIP');
  if (vipEntity && product.entity_id.toString() === vipEntity._id.toString()) {
    console.log('  Target product IS in VIP entity. The GRN error must come from a different cause — investigate further.');
  } else {
    console.log(`  Target product is owned by ${homeEntity?.entity_name}, NOT VIP.`);
    console.log('  The dropdown surfaced it because PRODUCT_CATALOG_ACCESS lookup brings parent products into subsidiary catalog views.');
    console.log('  GRN validator at inventoryController.js:643 strictly filters entity_id=req.entityId, so the save is rejected.');
    console.log('  Quick unblock: clone this product into VIP entity (one row, same brand+dosage+sold_per, fresh _id) and use that.');
  }

  await mongoose.disconnect();
})().catch((e) => { console.error(e); mongoose.disconnect(); process.exit(1); });
