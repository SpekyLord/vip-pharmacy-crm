/**
 * One-shot tune of the VIP CSI_TEMPLATE row based on the field test
 * against booklet #004804 (Apr 27 2026).
 *
 * Findings:
 *   - Customer name landed on the "Business Address" line, far below
 *     the actual "Registered Name" line at y≈45 mm. → set name.y = 45.
 *   - Every column landed ~4 mm too far left of its booklet column. →
 *     add +4 mm to every x in the template.
 *
 * Idempotent: only writes when the stored value differs from the target.
 *
 * Usage:
 *   node backend/erp/scripts/tuneVipCsiAlignment.js          # dry run
 *   node backend/erp/scripts/tuneVipCsiAlignment.js --apply  # commit
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const Entity = require('../models/Entity');
const Lookup = require('../models/Lookup');

const X_SHIFT = 4;
const NAME_Y_TARGET = 45;

(async () => {
  const apply = process.argv.includes('--apply');
  await connectDB();

  const vip = await Entity.findOne({ entity_name: { $regex: /VIOS|VIP/i } }).lean();
  if (!vip) throw new Error('VIP entity not found');

  const row = await Lookup.findOne({
    entity_id: vip._id,
    category: 'CSI_TEMPLATE',
    is_active: true,
  });
  if (!row) throw new Error('VIP CSI_TEMPLATE row not found — run seedCsiTemplates.js --apply first.');

  const m = JSON.parse(JSON.stringify(row.metadata || {})); // deep clone

  // 1) name.y → 45
  if (m.header?.name) {
    console.log(`name.y: ${m.header.name.y} → ${NAME_Y_TARGET}`);
    m.header.name.y = NAME_Y_TARGET;
  }

  // 2) every x +4 mm — header, body columns, totals blocks
  ['name', 'date', 'address', 'terms'].forEach((k) => {
    if (m.header?.[k] && typeof m.header[k].x === 'number') {
      const before = m.header[k].x;
      m.header[k].x = before + X_SHIFT;
      console.log(`header.${k}.x: ${before} → ${m.header[k].x}`);
    }
  });
  if (m.body?.columns) {
    Object.entries(m.body.columns).forEach(([k, v]) => {
      if (typeof v.x === 'number') {
        const before = v.x;
        v.x = before + X_SHIFT;
        console.log(`body.columns.${k}.x: ${before} → ${v.x}`);
      }
    });
  }
  ['left', 'right'].forEach((side) => {
    const blk = m.totals?.[side];
    if (blk && typeof blk.x_mm === 'number') {
      const before = blk.x_mm;
      blk.x_mm = before + X_SHIFT;
      console.log(`totals.${side}.x_mm: ${before} → ${blk.x_mm}`);
    }
  });

  if (!apply) {
    console.log('\n(dry-run) Re-run with --apply to commit.');
    await mongoose.disconnect();
    return;
  }

  row.metadata = m;
  row.markModified('metadata');
  await row.save();
  console.log('\n✓ VIP CSI_TEMPLATE updated.');
  await mongoose.disconnect();
})().catch((e) => { console.error(e); mongoose.disconnect(); process.exit(1); });
