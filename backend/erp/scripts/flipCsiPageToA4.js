/**
 * Flip every CSI_TEMPLATE row to A4 paper (210 × 297 mm) so the PDF
 * matches what the office printer treats as native paper. Content
 * coordinates (x, y) stay the same — they're absolute from the top-left
 * of the page, so the booklet feeds at the upper-left of the A4 sheet.
 *
 * Idempotent: only writes when page dimensions differ from A4.
 *
 * Usage:
 *   node backend/erp/scripts/flipCsiPageToA4.js          # dry run
 *   node backend/erp/scripts/flipCsiPageToA4.js --apply  # commit
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const Lookup = require('../models/Lookup');

const A4_W = 210;
const A4_H = 297;

(async () => {
  const apply = process.argv.includes('--apply');
  await connectDB();

  const rows = await Lookup.find({ category: 'CSI_TEMPLATE' });
  if (!rows.length) {
    console.log('No CSI_TEMPLATE rows found.');
    await mongoose.disconnect();
    return;
  }

  let touched = 0;
  for (const row of rows) {
    const m = JSON.parse(JSON.stringify(row.metadata || {}));
    const cur = m.page || {};
    if (cur.width_mm === A4_W && cur.height_mm === A4_H) {
      console.log(`  = ${row.code}: already A4 (${A4_W}x${A4_H})`);
      continue;
    }
    console.log(`  → ${row.code}: page ${cur.width_mm}x${cur.height_mm} → ${A4_W}x${A4_H}`);
    m.page = { width_mm: A4_W, height_mm: A4_H };
    if (apply) {
      row.metadata = m;
      row.markModified('metadata');
      await row.save();
      touched++;
    }
  }

  console.log(`\n${apply ? `Updated ${touched}` : 'Would update'} row(s).`);
  if (!apply) console.log('Re-run with --apply to commit.');
  await mongoose.disconnect();
})().catch((e) => { console.error(e); mongoose.disconnect(); process.exit(1); });
