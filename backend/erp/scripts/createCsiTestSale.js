/**
 * Create (or reuse) a DRAFT SalesLine that carries a batch_lot_no
 * matching an existing InventoryLedger row with expiry_date — so the
 * CSI overlay endpoint exercises the batch + expiry rendering path.
 *
 * Idempotent: if a sale with the chosen doc_ref already exists for the
 * target entity, it's reused rather than re-created.
 *
 * Usage:
 *   node backend/erp/scripts/createCsiTestSale.js          # VIP (default)
 *   node backend/erp/scripts/createCsiTestSale.js --mg     # MG and CO
 *   node backend/erp/scripts/createCsiTestSale.js --entity=VIP|MG
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const SalesLine = require('../models/SalesLine');
const InventoryLedger = require('../models/InventoryLedger');
const Entity = require('../models/Entity');
const User = require('../../models/User');
const Hospital = require('../models/Hospital');
const Customer = require('../models/Customer');
const Warehouse = require('../models/Warehouse');
const ProductMaster = require('../models/ProductMaster');

(async () => {
  await connectDB();

  const args = process.argv.slice(2);
  const entityArg = args.find((a) => a.startsWith('--entity='))?.split('=')[1] || (args.includes('--mg') ? 'MG' : 'VIP');
  const target = entityArg.toUpperCase();
  const entityRegex = target === 'MG' ? /MG\s*AND\s*CO|MILLIGRAMS/i : /VIOS|VIP/i;
  const docRef = target === 'MG' ? 'CSI-TEST-MG' : 'CSI-TEST';

  const vip = await Entity.findOne({ entity_name: entityRegex }).lean();
  if (!vip) throw new Error(`${target} entity not found`);
  console.log(`Target entity: ${vip.entity_name} (${vip._id}) → doc_ref=${docRef}`);

  // Reuse if it exists
  const existing = await SalesLine.findOne({ entity_id: vip._id, doc_ref: docRef }).lean();
  if (existing) {
    console.log(`✓ Reusing existing DRAFT sale _id=${existing._id} doc_ref=${existing.doc_ref}`);
    console.log(`   line_items=${existing.line_items.length}`);
    existing.line_items.forEach((li, i) =>
      console.log(`   line[${i}] product=${li.product_id} batch=${li.batch_lot_no} qty=${li.qty} unit=${li.unit}`)
    );
    console.log(`   CSI URL: /api/erp/sales/${existing._id}/csi-draft`);
    await mongoose.disconnect();
    return;
  }

  // Find an InventoryLedger row that has batch_lot_no AND expiry_date AND positive qty_in
  const ledgerRow = await InventoryLedger.findOne({
    entity_id: vip._id,
    batch_lot_no: { $exists: true, $ne: '' },
    expiry_date: { $exists: true, $ne: null },
    qty_in: { $gt: 0 },
  }).sort({ createdAt: -1 }).lean();
  if (!ledgerRow) throw new Error('No suitable InventoryLedger row with batch + expiry found in VIP');
  console.log(`Using ledger row: product=${ledgerRow.product_id} batch=${ledgerRow.batch_lot_no} expiry=${ledgerRow.expiry_date}`);

  const product = await ProductMaster.findById(ledgerRow.product_id).lean();
  if (!product) throw new Error(`Product ${ledgerRow.product_id} not found`);

  const warehouse = await Warehouse.findOne({ entity_id: vip._id }).lean();
  if (!warehouse) throw new Error('No warehouse for VIP');

  // pick a BDM-ish user
  const bdm = await User.findOne({ entity_id: vip._id, isActive: true }).lean()
    || await User.findOne({ entity_ids: vip._id, isActive: true }).lean();
  if (!bdm) throw new Error('No active VIP user to use as bdm');

  // pick a customer or hospital
  const hospital = await Hospital.findOne({}).lean();
  const customer = !hospital ? await Customer.findOne({ entity_id: vip._id }).lean() : null;

  const unitPrice = 75;
  const qty = 30;
  const lineTotal = unitPrice * qty;
  const vatRate = 0.12;
  const netOfVat = lineTotal / (1 + vatRate);
  const vatAmount = lineTotal - netOfVat;

  const sale = await SalesLine.create({
    entity_id: vip._id,
    bdm_id: bdm._id,
    warehouse_id: warehouse._id,
    source: 'SALES_LINE',
    sale_type: 'CSI',
    hospital_id: hospital ? hospital._id : undefined,
    customer_id: !hospital && customer ? customer._id : undefined,
    csi_date: new Date(),
    doc_ref: docRef,
    line_items: [
      {
        product_id: product._id,
        item_key: `${product.brand_name || product.generic_name}|${product.dosage_strength || ''}`,
        qty,
        unit: ledgerRow.unit || product.unit || 'AMPULE',
        unit_price: unitPrice,
        line_total: lineTotal,
        vat_amount: vatAmount,
        net_of_vat: netOfVat,
        product_name: product.brand_name,
        dosage: product.dosage_strength,
        batch_lot_no: ledgerRow.batch_lot_no,
      },
    ],
    invoice_total: lineTotal,
    total_vat: Math.round(vatAmount * 100) / 100,
    total_net_of_vat: Math.round(netOfVat * 100) / 100,
    status: 'DRAFT',
    po_number: `PO-${docRef}`,
    created_by: bdm._id,
    recorded_on_behalf_of: bdm._id,
    created_at: new Date(),
  });

  console.log(`✓ Created DRAFT sale _id=${sale._id} doc_ref=${sale.doc_ref}`);
  console.log(`   product: ${product.brand_name} (${product.generic_name}) ${product.dosage_strength}`);
  console.log(`   batch=${ledgerRow.batch_lot_no} expiry=${ledgerRow.expiry_date}`);
  console.log(`   CSI URL: /api/erp/sales/${sale._id}/csi-draft`);

  await mongoose.disconnect();
})().catch((e) => { console.error(e); mongoose.disconnect(); process.exit(1); });
