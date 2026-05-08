require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const SalesLine = require('../erp/models/SalesLine');
  const Hospital = require('../erp/models/Hospital');

  // Find Cecilia Olarte Paderes 
  const hosps = await Hospital.find({ hospital_name: { $regex: /cecilia.*paderes|olarte.*paderes/i } }).lean();
  console.log('Cecilia matches:', hosps.length);
  for (const h of hosps) console.log({ _id: String(h._id), name: h.hospital_name });

  // Find any sales row mentioning Philvan
  const philvan = await SalesLine.find({ 'line_items.item_key': { $regex: /philvan/i } }).sort({ updatedAt: -1 }).limit(10).lean();
  console.log('\nPhilvan sales:', philvan.length);
  for (const r of philvan) {
    console.log({
      _id: String(r._id),
      doc_ref: r.doc_ref,
      sale_number: r.sale_number,
      status: r.status,
      hospital_id: String(r.hospital_id),
      customer_id: String(r.customer_id),
      bdm_id: String(r.bdm_id),
      warehouse_id: String(r.warehouse_id),
      proxy: r.recorded_on_behalf_of,
      validation_errors: r.validation_errors,
      line_items: r.line_items?.map(li => ({ key: li.item_key, qty: li.qty, pid: String(li.product_id) })),
      total: r.invoice_total,
      csi_date: r.csi_date
    });
  }

  // Show schema fields
  console.log('\nSchema field keys:', Object.keys(SalesLine.schema.paths).slice(0,40));
  await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
