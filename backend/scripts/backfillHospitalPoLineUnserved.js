#!/usr/bin/env node
/**
 * One-off: backfill HospitalPOLine.qty_unserved for rows created by the
 * Phase CSI-X1 initial controller version that used insertMany (skips
 * pre('save') hook). Re-runnable safely.
 */
'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const { HospitalPOLine, HospitalPO } = require('../erp/models/HospitalPO');

(async () => {
  if (!process.env.MONGO_URI) { console.error('MONGO_URI missing'); process.exit(1); }
  await mongoose.connect(process.env.MONGO_URI);
  const stale = await HospitalPOLine.find({
    qty_unserved: 0,
    qty_ordered: { $gt: 0 },
    status: { $in: ['OPEN', 'PARTIAL'] }
  });
  console.log(`Found ${stale.length} HospitalPOLine row(s) with stale qty_unserved`);
  const touchedPos = new Set();
  for (const line of stale) {
    if ((line.qty_ordered || 0) - (line.qty_served || 0) > 0) {
      line.qty_unserved = line.qty_ordered - line.qty_served;
      await line.save(); // pre-save recomputes status + unserved going forward
      touchedPos.add(String(line.po_id));
    }
  }
  for (const poId of touchedPos) {
    await HospitalPO.recomputeFromLines(poId);
  }
  console.log(`Updated ${stale.length} line(s) across ${touchedPos.size} PO(s)`);
  await mongoose.disconnect();
})().catch(err => { console.error(err); process.exit(1); });
