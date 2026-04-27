/**
 * One-shot CSI_TEMPLATE deploy script — brings any cluster (dev or prod)
 * into sync with the canonical, field-tuned values shipped Apr 27 2026.
 *
 * What it does:
 *   1. Ensures VIP + MG and CO each have a CSI_TEMPLATE row (inserts from
 *      seedCsiTemplates.js defaults if missing — admin edits preserved).
 *   2. Force-syncs the field-tuned subset of each metadata block:
 *        VIP        → page, header.{name,date,address,terms}.x, name.y,
 *                     body.columns.*.x, totals.{left,right}.x_mm
 *        MG and CO  → page, header.date.y, feed_offset
 *      Other fields (font, text, row_height_mm, body.first_row_y_mm,
 *      column align flags, etc.) are left untouched so admin edits
 *      survive.
 *
 * Idempotent: every operation writes a target value, never a delta.
 * Running twice is a noop.
 *
 * Usage:
 *   node backend/erp/scripts/deployCsiTemplatesToProd.js                   # dry run, uses backend/.env
 *   node backend/erp/scripts/deployCsiTemplatesToProd.js --apply           # commit
 *   node backend/erp/scripts/deployCsiTemplatesToProd.js --mongo-uri=mongodb+srv://user:pass@prod-host/db
 *   node backend/erp/scripts/deployCsiTemplatesToProd.js --mongo-uri=... --apply
 *
 * Safety:
 *   - Without --apply, prints the planned diff and exits without writing.
 *   - Always prints connected host + db name first so you can confirm
 *     you're hitting the right cluster.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const uriArg = args.find((a) => a.startsWith('--mongo-uri='));
const mongoUri = uriArg ? uriArg.split('=').slice(1).join('=') : process.env.MONGO_URI;

if (!mongoUri) {
  console.error('ERROR: no Mongo URI. Pass --mongo-uri=... or set MONGO_URI in backend/.env');
  process.exit(1);
}

const mongoose = require('mongoose');
const Entity = require('../models/Entity');
const Lookup = require('../models/Lookup');
const { VIP_TEMPLATE, MG_TEMPLATE } = require('./seedCsiTemplates');

// ── Field-tuned canonical state (Apr 27 2026 booklet smoke) ────────────
// These are the values that MUST match across every cluster. Pulled from
// the seed defaults (single source of truth) and re-asserted at deploy.
const TARGETS = {
  VIP: {
    matcher: /VIOS|\bVIP\b/i,
    code: 'VIP',
    fullSeed: VIP_TEMPLATE,
    forceFields: {
      'page.width_mm':                    VIP_TEMPLATE.page.width_mm,
      'page.height_mm':                   VIP_TEMPLATE.page.height_mm,
      'header.name.x':                    VIP_TEMPLATE.header.name.x,
      'header.name.y':                    VIP_TEMPLATE.header.name.y,
      'header.date.x':                    VIP_TEMPLATE.header.date.x,
      'header.date.y':                    VIP_TEMPLATE.header.date.y,
      'header.address.x':                 VIP_TEMPLATE.header.address.x,
      'header.address.y':                 VIP_TEMPLATE.header.address.y,
      'header.terms.x':                   VIP_TEMPLATE.header.terms.x,
      'header.terms.y':                   VIP_TEMPLATE.header.terms.y,
      'body.columns.description.x':       VIP_TEMPLATE.body.columns.description.x,
      'body.columns.unit.x':              VIP_TEMPLATE.body.columns.unit.x,
      'body.columns.quantity.x':          VIP_TEMPLATE.body.columns.quantity.x,
      'body.columns.unit_cost.x':         VIP_TEMPLATE.body.columns.unit_cost.x,
      'body.columns.amount.x':            VIP_TEMPLATE.body.columns.amount.x,
      'totals.left.x_mm':                 VIP_TEMPLATE.totals.left.x_mm,
      'totals.right.x_mm':                VIP_TEMPLATE.totals.right.x_mm,
    },
  },
  MG_AND_CO: {
    matcher: /MG\s*AND\s*CO|MILLIGRAMS/i,
    code: 'MG_AND_CO',
    fullSeed: MG_TEMPLATE,
    forceFields: {
      'page.width_mm':   MG_TEMPLATE.page.width_mm,
      'page.height_mm':  MG_TEMPLATE.page.height_mm,
      'header.date.y':   MG_TEMPLATE.header.date.y,
      'feed_offset.x_mm': 27,
      'feed_offset.y_mm': 0,
    },
  },
};

function getDeep(obj, keyPath) {
  return keyPath.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function setDeep(obj, keyPath, value) {
  const parts = keyPath.split('.');
  const last = parts.pop();
  const parent = parts.reduce((o, k) => {
    if (o[k] == null || typeof o[k] !== 'object') o[k] = {};
    return o[k];
  }, obj);
  parent[last] = value;
}

(async () => {
  await mongoose.connect(mongoUri);
  // The connected host + DB tells you which cluster you actually hit.
  const conn = mongoose.connection;
  console.log('Connected to:');
  console.log(`  host: ${conn.host}`);
  console.log(`  db:   ${conn.name}`);
  console.log(`  mode: ${apply ? 'APPLY (writes)' : 'DRY RUN (no writes)'}`);
  console.log('');

  let inserts = 0;
  let updates = 0;
  let unchanged = 0;
  let missingEntity = 0;

  for (const [label, target] of Object.entries(TARGETS)) {
    const entity = await Entity.findOne({
      $or: [
        { entity_name: target.matcher },
        { short_name: target.matcher },
      ],
      status: 'ACTIVE',
    }).lean();

    if (!entity) {
      console.log(`  ⊘ ${label}: no matching ACTIVE entity in this cluster — skipping`);
      missingEntity++;
      continue;
    }

    const filter = {
      entity_id: entity._id,
      category: 'CSI_TEMPLATE',
      code: target.code,
    };

    let row = await Lookup.findOne(filter);

    if (!row) {
      console.log(`  + ${label} (${entity.entity_name}): would INSERT new CSI_TEMPLATE row`);
      if (apply) {
        await Lookup.create({
          ...filter,
          label: `${target.code} — CSI Draft Overlay Template`,
          sort_order: 0,
          is_active: true,
          metadata: target.fullSeed,
        });
        console.log(`    ✓ inserted`);
      }
      inserts++;
      continue;
    }

    // Existing row — diff each forced field against current value
    const m = JSON.parse(JSON.stringify(row.metadata || {}));
    const diffs = [];
    for (const [keyPath, targetVal] of Object.entries(target.forceFields)) {
      const current = getDeep(m, keyPath);
      if (current !== targetVal) {
        diffs.push({ keyPath, current, target: targetVal });
        setDeep(m, keyPath, targetVal);
      }
    }

    if (!diffs.length) {
      console.log(`  = ${label} (${entity.entity_name}): already canonical`);
      unchanged++;
      continue;
    }

    console.log(`  → ${label} (${entity.entity_name}): ${diffs.length} field(s) drift`);
    diffs.forEach((d) => console.log(`      ${d.keyPath}: ${d.current} → ${d.target}`));

    if (apply) {
      row.metadata = m;
      row.markModified('metadata');
      await row.save();
      console.log(`    ✓ saved`);
    }
    updates++;
  }

  console.log('');
  console.log('Summary:');
  console.log(`  inserts:        ${inserts}`);
  console.log(`  updates:        ${updates}`);
  console.log(`  already-synced: ${unchanged}`);
  console.log(`  missing-entity: ${missingEntity}`);
  if (!apply) {
    console.log('');
    console.log('Re-run with --apply to commit. (Dry-run made no writes.)');
  }

  await mongoose.disconnect();
})().catch((e) => { console.error('Deploy error:', e); mongoose.disconnect(); process.exit(1); });
