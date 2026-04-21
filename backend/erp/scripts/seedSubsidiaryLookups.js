/**
 * Subsidiary Lookup Completeness Seeder (CLI)
 *
 * Manual fallback for the auto-seed hook on Entity model. Copies per-entity
 * Lookup rows from a reference (usually VIP / parent) to a target subsidiary.
 *
 * Use cases:
 *   - Seed Lookups for subsidiaries that existed BEFORE the auto-hook was
 *     added (the hook only fires on new entity creation).
 *   - Re-sync a subsidiary after admin adds a new category to the parent.
 *   - Audit/verification (dry-run by default).
 *
 * For NEW subsidiaries created via the admin UI, the Entity post-save hook
 * in models/Entity.js does this automatically — no manual step needed.
 *
 * Usage (from backend/):
 *   node erp/scripts/seedSubsidiaryLookups.js <target_entity>           # dry-run
 *   node erp/scripts/seedSubsidiaryLookups.js <target_entity> --apply   # writes
 *   node erp/scripts/seedSubsidiaryLookups.js <target_entity> --reference=<code>
 *   node erp/scripts/seedSubsidiaryLookups.js <target_entity> --category=<CAT>
 *
 * Examples:
 *   node erp/scripts/seedSubsidiaryLookups.js "MG and CO."
 *   node erp/scripts/seedSubsidiaryLookups.js BLW --apply
 *   node erp/scripts/seedSubsidiaryLookups.js "MG and CO." --category=ERP_SUB_PERMISSION
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const Entity = require('../models/Entity');
const Lookup = require('../models/Lookup');
const { seedSubsidiaryLookups } = require('../services/subsidiaryLookupSeedService');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const referenceArg = (args.find(a => a.startsWith('--reference=')) || '').split('=')[1] || 'VIP';
const categoryArg = (args.find(a => a.startsWith('--category=')) || '').split('=')[1] || null;
const targetArg = args.find(a => !a.startsWith('--'));

if (!targetArg) {
  console.error('Usage: node erp/scripts/seedSubsidiaryLookups.js <target_entity_name_or_code> [--apply] [--reference=VIP] [--category=<CAT>]');
  process.exit(1);
}

const pad = (s, n) => String(s ?? '').padEnd(n).slice(0, n);
const padNum = (n, w = 6) => String(n ?? 0).padStart(w);

async function resolveEntity(nameOrCode) {
  const re = new RegExp('^' + nameOrCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i');
  let ent = await Entity.findOne({ $or: [{ short_name: re }, { entity_name: re }] }).lean();
  if (ent) return ent;
  const loose = new RegExp(nameOrCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  return Entity.findOne({ $or: [{ short_name: loose }, { entity_name: loose }] }).lean();
}

async function run() {
  await connectDB();

  const target = await resolveEntity(targetArg);
  if (!target) {
    console.error(`Target entity not found: "${targetArg}".`);
    const all = await Entity.find({}).select('short_name entity_name entity_type').lean();
    console.error('Known entities:');
    for (const e of all) {
      console.error(`  ${e.short_name || '(no short)'} — ${e.entity_name} (${e.entity_type})`);
    }
    return mongoose.disconnect();
  }

  const reference = await resolveEntity(referenceArg);
  if (!reference) {
    console.error(`Reference entity not found: "${referenceArg}".`);
    return mongoose.disconnect();
  }

  if (target._id.toString() === reference._id.toString()) {
    console.error(`Target and reference are the same entity (${target.short_name}). Nothing to diff.`);
    return mongoose.disconnect();
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`  SUBSIDIARY LOOKUP COMPLETENESS`);
  console.log(`${'='.repeat(70)}`);
  console.log(`  Reference: ${reference.short_name} — ${reference.entity_name}`);
  console.log(`  Target:    ${target.short_name} — ${target.entity_name}`);
  console.log(`  Mode:      ${APPLY ? 'APPLY (writes will occur)' : 'DRY-RUN (no writes)'}`);
  if (categoryArg) console.log(`  Filter:    category=${categoryArg}`);
  console.log('');

  // Dry-run first to build the per-category report regardless of mode
  const scan = await seedSubsidiaryLookups({
    targetEntityId: target._id,
    referenceEntityId: reference._id,
    opts: { dryRun: true, category: categoryArg },
  });

  // Build per-category count table using a richer query so we can show both
  // reference count and target count per category
  const refFilter = categoryArg
    ? { entity_id: reference._id, category: categoryArg.toUpperCase() }
    : { entity_id: reference._id };
  const refRows = await Lookup.find(refFilter).lean();
  const tgtRows = await Lookup.find({ ...refFilter, entity_id: target._id }).lean();

  const tgtIndex = new Set(tgtRows.map(r => `${r.category}::${r.code}`));
  const byCategory = new Map();
  for (const r of refRows) {
    if (!byCategory.has(r.category)) byCategory.set(r.category, { refCount: 0, tgtCount: 0, missing: [] });
    const entry = byCategory.get(r.category);
    entry.refCount++;
    if (tgtIndex.has(`${r.category}::${r.code}`)) entry.tgtCount++;
    else entry.missing.push(r);
  }

  console.log(`${pad('CATEGORY', 34)}${padNum('REF', 8)}${padNum('TGT', 8)}${padNum('MISSING', 10)}`);
  console.log('-'.repeat(60));
  const categories = [...byCategory.entries()].sort();
  for (const [cat, e] of categories) {
    const flag = e.missing.length > 0 ? '  ⚠' : '';
    console.log(`${pad(cat, 34)}${padNum(e.refCount, 8)}${padNum(e.tgtCount, 8)}${padNum(e.missing.length, 10)}${flag}`);
  }
  console.log('-'.repeat(60));
  console.log(`${pad('TOTAL', 34)}${padNum(refRows.length, 8)}${padNum(tgtRows.length, 8)}${padNum(scan.missingTotal, 10)}`);

  if (scan.missingTotal === 0) {
    console.log('\n✓ Target is complete relative to reference. No action needed.');
    return mongoose.disconnect();
  }

  console.log('\nMissing codes (sample per category):');
  for (const [cat, e] of categories) {
    if (!e.missing.length) continue;
    const sample = e.missing.slice(0, 5).map(r => r.code).join(', ');
    const more = e.missing.length > 5 ? ` ... +${e.missing.length - 5} more` : '';
    console.log(`  ${cat}: ${sample}${more}`);
  }

  if (!APPLY) {
    console.log(`\nDRY-RUN only. ${scan.missingTotal} row(s) would be seeded. Re-run with --apply to write.`);
    return mongoose.disconnect();
  }

  // APPLY via the service
  console.log(`\nSeeding ${scan.missingTotal} missing row(s) into ${target.short_name}...`);
  const result = await seedSubsidiaryLookups({
    targetEntityId: target._id,
    referenceEntityId: reference._id,
    opts: { category: categoryArg },
  });
  console.log(`\n✓ Done. ${result.seeded} row(s) upserted in ${result.elapsed_ms}ms.`);

  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
