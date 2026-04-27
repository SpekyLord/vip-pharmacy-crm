/**
 * Inspect CSI_TEMPLATE lookup rows for every active entity.
 *
 * Reports whether the row exists, whether it is_active, and prints the
 * x/y coordinates currently stored. Helpful for diagnosing "MG and CO
 * CSI cannot print" or "alignment off" complaints — confirms exactly
 * what the renderer will see at runtime.
 *
 * Usage: node backend/erp/scripts/inspectCsiTemplates.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const Entity = require('../models/Entity');
const Lookup = require('../models/Lookup');

async function run() {
  await connectDB();
  const entities = await Entity.find({ status: 'ACTIVE' }).lean();
  if (!entities.length) {
    console.log('No active entities found.');
    return;
  }

  for (const entity of entities) {
    console.log(`\n── ${entity.entity_name} (${entity._id}) ─────────────`);
    const rows = await Lookup.find({
      entity_id: entity._id,
      category: 'CSI_TEMPLATE',
    }).lean();

    if (!rows.length) {
      console.log('  ✗ NO CSI_TEMPLATE row — renderer will return 400 CSI_TEMPLATE_NOT_CONFIGURED');
      continue;
    }

    rows.forEach((r) => {
      const m = r.metadata || {};
      console.log(`  ${r.is_active ? '✓' : '✗ INACTIVE'} code=${r.code} label="${r.label}"`);
      console.log(`    page:    ${m.page?.width_mm} x ${m.page?.height_mm} mm`);
      if (m.header) {
        console.log(`    name:    x=${m.header.name?.x}  y=${m.header.name?.y}`);
        console.log(`    date:    x=${m.header.date?.x}  y=${m.header.date?.y}`);
        console.log(`    address: x=${m.header.address?.x}  y=${m.header.address?.y}`);
        console.log(`    terms:   x=${m.header.terms?.x}  y=${m.header.terms?.y}`);
      }
      if (m.body) {
        console.log(`    body.first_row_y_mm=${m.body.first_row_y_mm} row_height=${m.body.row_height_mm}`);
        console.log(`    columns: ${Object.keys(m.body.columns || {}).join(', ')}`);
        const c = m.body.columns || {};
        Object.entries(c).forEach(([k, v]) => {
          console.log(`      ${k.padEnd(12)} x=${v.x}  align=${v.align}`);
        });
      }
      if (m.totals) {
        console.log(`    totals.left:  x=${m.totals.left?.x_mm}  start_y=${m.totals.left?.start_y_mm}`);
        console.log(`    totals.right: x=${m.totals.right?.x_mm}  start_y=${m.totals.right?.start_y_mm}`);
      }
      if (m.font) {
        console.log(`    font: ${m.font.family} @ ${m.font.size_pt}pt`);
      }
      console.log(`    updatedAt: ${r.updatedAt}`);
    });
  }

  console.log('\nDone.');
}

if (require.main === module) {
  run()
    .then(() => mongoose.disconnect())
    .catch((err) => {
      console.error('Inspect error:', err);
      mongoose.disconnect();
      process.exit(1);
    });
}

module.exports = { run };
