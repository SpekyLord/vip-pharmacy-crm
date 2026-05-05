/**
 * Read-only audit: count how many VIP-owned transactional rows reference
 * MG-and-CO's product_id (the wrong-entity product reference). This is the
 * footprint for the surgical Phase-G7-prelude repoint migration.
 *
 * Two known duplicate item_keys: Viprazole|40mg and Nupira|10mg/10mL.
 * For each, find both rows (VIP's and MG-and-CO's) and count VIP-side
 * refs in: InventoryLedger, Sales (SalesLine), GrnEntry, Undertaking,
 * StockReassignment, PurchaseOrder, SupplierInvoice, ConsignmentTracker,
 * CreditNote, HospitalContractPrice, HospitalPO, MdProductRebate,
 * MdCapitationRule, ProductMapping, TransferPriceList, RebatePayout,
 * SalesBookSCPWD, PnlReport.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const ProductMaster = require('../models/ProductMaster');
const Entity = require('../models/Entity');

const VIP_ID = '69cd76ec7f6beb5888bd1a53';

async function getCount(modelName, query) {
  const Model = require(`../models/${modelName}`);
  return Model.countDocuments(query);
}

(async () => {
  await connectDB();

  const dups = await ProductMaster.aggregate([
    { $group: { _id: '$item_key', count: { $sum: 1 }, ids: { $push: { id: '$_id', entity: '$entity_id', active: '$is_active', brand: '$brand_name', dosage: '$dosage_strength' } } } },
    { $match: { count: { $gt: 1 } } },
  ]);

  console.log('=== Duplicate item_key audit ===\n');

  for (const d of dups) {
    console.log(`── ${d._id} ──`);
    const vipRow = d.ids.find(r => r.entity.toString() === VIP_ID);
    const otherRow = d.ids.find(r => r.entity.toString() !== VIP_ID);

    if (!vipRow || !otherRow) {
      console.log('  Skipping — no VIP/other split');
      continue;
    }

    const otherEnt = await Entity.findById(otherRow.entity).select('entity_name').lean();
    console.log(`  VIP   row = ${vipRow.id}  active=${vipRow.active}`);
    console.log(`  ${otherEnt.entity_name} row = ${otherRow.id}  active=${otherRow.active}`);

    const checks = [
      ['InventoryLedger', { product_id: otherRow.id, entity_id: VIP_ID }],
      ['SalesLine', { product_id: otherRow.id, entity_id: VIP_ID }],
      ['GrnEntry', { 'line_items.product_id': otherRow.id, entity_id: VIP_ID }],
      ['Undertaking', { product_id: otherRow.id, entity_id: VIP_ID }],
      ['StockReassignment', { product_id: otherRow.id, entity_id: VIP_ID }],
      ['PurchaseOrder', { 'line_items.product_id': otherRow.id, entity_id: VIP_ID }],
      ['SupplierInvoice', { 'line_items.product_id': otherRow.id, entity_id: VIP_ID }],
      ['ConsignmentTracker', { product_id: otherRow.id, entity_id: VIP_ID }],
      ['CreditNote', { 'line_items.product_id': otherRow.id, entity_id: VIP_ID }],
      ['HospitalContractPrice', { product_id: otherRow.id, entity_id: VIP_ID }],
      ['HospitalPO', { 'line_items.product_id': otherRow.id, entity_id: VIP_ID }],
      ['MdProductRebate', { product_id: otherRow.id, entity_id: VIP_ID }],
      ['MdCapitationRule', { product_id: otherRow.id, entity_id: VIP_ID }],
      ['ProductMapping', { 'targets.product_id': otherRow.id, entity_id: VIP_ID }],
      ['TransferPriceList', { product_id: otherRow.id, entity_id: VIP_ID }],
      ['RebatePayout', { product_id: otherRow.id, entity_id: VIP_ID }],
      ['SalesBookSCPWD', { product_id: otherRow.id, entity_id: VIP_ID }],
      ['PnlReport', { product_id: otherRow.id, entity_id: VIP_ID }],
      ['InterCompanyTransfer', { product_id: otherRow.id, entity_id: VIP_ID }],
      ['CreditRule', { product_id: otherRow.id, entity_id: VIP_ID }],
    ];

    for (const [model, query] of checks) {
      try {
        const n = await getCount(model, query);
        if (n > 0) console.log(`  ${model.padEnd(28)} ${n} VIP rows reference ${otherEnt.entity_name}'s product_id`);
      } catch (e) {
        console.log(`  ${model.padEnd(28)} (skip: ${e.message.slice(0, 60)})`);
      }
    }
    console.log('');
  }

  await mongoose.disconnect();
})().catch((e) => { console.error(e); mongoose.disconnect(); process.exit(1); });
