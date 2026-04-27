/**
 * One-shot helper: list 10 SalesLine docs whose line_items carry a
 * batch_lot_no, so we can pick a candidate to smoke-test the CSI overlay
 * batch + expiry rendering.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const SalesLine = require('../models/SalesLine');

(async () => {
  await connectDB();
  const sales = await SalesLine.find({ 'line_items.batch_lot_no': { $exists: true, $ne: '' } })
    .select('_id doc_ref status entity_id line_items hospital_id customer_id')
    .populate('hospital_id', 'hospital_name')
    .populate('customer_id', 'customer_name')
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();
  console.log('Sales with batch_lot_no on line items:');
  sales.forEach((s) => {
    const batched = s.line_items.filter((l) => l.batch_lot_no);
    const cust = s.hospital_id?.hospital_name || s.customer_id?.customer_name || '-';
    console.log(`  ${s._id} | doc_ref=${s.doc_ref} | ${s.status} | entity=${s.entity_id} | ${cust} | batched_lines=${batched.length}`);
    batched.slice(0, 3).forEach((l) =>
      console.log(`      qty=${l.qty} unit=${l.unit} batch=${l.batch_lot_no} product_id=${l.product_id}`)
    );
  });
  await mongoose.disconnect();
})().catch((e) => { console.error(e); mongoose.disconnect(); process.exit(1); });
