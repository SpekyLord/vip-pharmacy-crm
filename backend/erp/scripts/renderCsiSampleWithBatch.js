/**
 * One-shot: render a VIP CSI overlay PDF with a fully-populated line
 * (description, unit, batch, expiry, qty, unit_price, amount) using the
 * LIVE CSI_TEMPLATE row from the DB. Writes to c:\tmp\csi-vip-batch-sample.pdf
 * so we can verify how batch + expiry land on the booklet without needing
 * a real sale that has batch_lot_no.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const fs = require('fs');
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const Lookup = require('../models/Lookup');
const Entity = require('../models/Entity');
const { renderCsiDraft } = require('../services/csiDraftRenderer');

(async () => {
  await connectDB();
  const vip = await Entity.findOne({ entity_name: { $regex: /VIOS|VIP/i } }).lean();
  if (!vip) throw new Error('VIP entity not found');
  const tpl = await Lookup.findOne({
    entity_id: vip._id,
    category: 'CSI_TEMPLATE',
    is_active: true,
  }).lean();
  if (!tpl) throw new Error('CSI_TEMPLATE for VIP not found — run seedCsiTemplates.js --apply');

  const buf = await renderCsiDraft({
    sale: {
      csi_date: new Date('2026-04-27'),
      invoice_total: 17500,
      total_vat: 1875,
      total_net_of_vat: 15625,
      line_items: [{}],
      po_number: 'PO-12345',
      doc_ref: 'BATCH-TEST',
      _id: 'batch-test',
    },
    entity: vip,
    template: tpl,
    user: {},
    customerLabel: 'Saint Jude Hospital',
    customerAddress: 'Kalibo, Aklan',
    lineDisplay: [
      {
        description: 'Porfever (Paracetamol) 300 mg/2mL',
        qty: 500,
        unit: 'AMPULE',
        unit_price: 35,
        amount: 17500,
        batch_lot_no: '260167',
        exp_date: new Date('2029-01-31'),
      },
    ],
    terms: '30 days',
  });

  const out = 'c:/tmp/csi-vip-batch-sample.pdf';
  fs.writeFileSync(out, buf);
  console.log(`✓ Wrote ${out} (${buf.length} bytes)`);
  console.log(`  template metadata.font: ${JSON.stringify(tpl.metadata?.font || {})}`);
  console.log(`  template metadata.body.first_row_y_mm = ${tpl.metadata?.body?.first_row_y_mm}`);
  console.log(`  template metadata.body.row_height_mm  = ${tpl.metadata?.body?.row_height_mm}`);
  await mongoose.disconnect();
})().catch((e) => { console.error(e); mongoose.disconnect(); process.exit(1); });
