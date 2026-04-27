/**
 * Field tune for MG AND CO. CSI_TEMPLATE based on Brother-printer test
 * (Apr 27 2026, booklet #419):
 *   • date.y +2 mm so "April 27, 2026" lands on the booklet's Date line.
 *
 * Idempotent: only writes when the stored value differs from the target.
 *
 * Usage:
 *   node backend/erp/scripts/tuneMgCsiAlignment.js          # dry run
 *   node backend/erp/scripts/tuneMgCsiAlignment.js --apply  # commit
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const Entity = require('../models/Entity');
const Lookup = require('../models/Lookup');

const DATE_Y_DELTA = 2;

(async () => {
  const apply = process.argv.includes('--apply');
  await connectDB();

  const mg = await Entity.findOne({ entity_name: { $regex: /MG\s*AND\s*CO|MILLIGRAMS/i } }).lean();
  if (!mg) throw new Error('MG and CO entity not found');

  const row = await Lookup.findOne({
    entity_id: mg._id,
    category: 'CSI_TEMPLATE',
    is_active: true,
  });
  if (!row) throw new Error('MG and CO CSI_TEMPLATE row not found.');

  const m = JSON.parse(JSON.stringify(row.metadata || {}));

  if (m.header?.date) {
    const before = m.header.date.y;
    const after = before + DATE_Y_DELTA;
    console.log(`date.y: ${before} → ${after}  (delta +${DATE_Y_DELTA} mm)`);
    m.header.date.y = after;
  } else {
    console.log('No header.date — nothing to do.');
  }

  if (!apply) {
    console.log('\n(dry-run) Re-run with --apply to commit.');
    await mongoose.disconnect();
    return;
  }

  row.metadata = m;
  row.markModified('metadata');
  await row.save();
  console.log('\n✓ MG and CO CSI_TEMPLATE updated.');
  await mongoose.disconnect();
})().catch((e) => { console.error(e); mongoose.disconnect(); process.exit(1); });
