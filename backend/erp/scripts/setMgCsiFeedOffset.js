/**
 * Set the MG and CO CSI_TEMPLATE feed_offset to compensate for printers
 * that center small paper inside an A4 print area (e.g. Brother).
 *
 * The MG and CO booklet is 160 × 202 mm. When fed into a Brother that
 * centers it within the A4 paper path:
 *   horizontal centering offset = (210 - 160) / 2 = 25 mm
 *   vertical centering offset   = (297 - 202) / 2 = 47.5 mm
 *
 * Usage:
 *   node backend/erp/scripts/setMgCsiFeedOffset.js          # dry run
 *   node backend/erp/scripts/setMgCsiFeedOffset.js --apply  # commit
 *   node backend/erp/scripts/setMgCsiFeedOffset.js --reset  # back to (0,0)
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const Entity = require('../models/Entity');
const Lookup = require('../models/Lookup');

// Field-tuned 2026-04-27 from booklet #429: Brother centers paper
// horizontally only and feeds it from the top edge, so we need an
// X offset of (210-160)/2 = 25 + 2 mm tuning = 27, and Y offset = 0.
const FEED_OFFSET = { x_mm: 27, y_mm: 0 };

(async () => {
  const apply = process.argv.includes('--apply');
  const reset = process.argv.includes('--reset');
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
  const before = m.feed_offset || null;
  const after = reset ? null : FEED_OFFSET;

  console.log(`feed_offset: ${JSON.stringify(before)} → ${JSON.stringify(after)}`);

  if (!apply) {
    console.log('\n(dry-run) Re-run with --apply to commit.');
    await mongoose.disconnect();
    return;
  }

  if (reset) {
    delete m.feed_offset;
  } else {
    m.feed_offset = after;
  }
  row.metadata = m;
  row.markModified('metadata');
  await row.save();
  console.log('\n✓ MG and CO CSI_TEMPLATE feed_offset updated.');
  await mongoose.disconnect();
})().catch((e) => { console.error(e); mongoose.disconnect(); process.exit(1); });
