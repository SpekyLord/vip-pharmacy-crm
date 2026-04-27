/**
 * Fix the unit on the CSI-TEST sales (VIP + MG and CO) — set to VIAL
 * since Viprazole 40 mg is an IV omeprazole, not an ampule. Also fix
 * the MG-side doc_ref so it's distinct from the VIP one.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const SalesLine = require('../models/SalesLine');
const Entity = require('../models/Entity');

(async () => {
  await connectDB();
  const sales = await SalesLine.find({ doc_ref: { $in: ['CSI-TEST', 'CSI-TEST-MG'] } });
  for (const s of sales) {
    const ent = await Entity.findById(s.entity_id).select('entity_name').lean();
    const isMg = /MG|MILLIGRAMS/i.test(ent?.entity_name || '');
    s.line_items.forEach((li) => { li.unit = 'VIAL'; });
    if (isMg && s.doc_ref !== 'CSI-TEST-MG') {
      console.log(`  ${s._id}: doc_ref ${s.doc_ref} → CSI-TEST-MG`);
      s.doc_ref = 'CSI-TEST-MG';
    }
    s.markModified('line_items');
    await s.save();
    console.log(`  ✓ ${s._id} (${ent?.entity_name}): unit → VIAL`);
  }
  await mongoose.disconnect();
})().catch((e) => { console.error(e); mongoose.disconnect(); process.exit(1); });
