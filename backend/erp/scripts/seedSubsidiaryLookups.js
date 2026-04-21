/**
 * Subsidiary Lookup Completeness Seeder
 *
 * Diff a subsidiary entity's Lookup rows against a reference (usually VIP)
 * and copy-seed anything missing. Fixes the class of bug where a feature
 * silently disappears on a subsidiary because its per-entity lookup rows
 * were never seeded (the Opening AR / MODULE_DEFAULT_ROLES / etc. problem).
 *
 * Copies ONLY Lookup rows — does NOT touch transactional data, ProductMaster,
 * warehouses, users, or Settings. Safe and idempotent.
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
 *
 * The <target_entity> argument matches against either `short_name` or
 * `entity_name` (case-insensitive, substring).
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const Entity = require('../models/Entity');
const Lookup = require('../models/Lookup');

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
  ent = await Entity.findOne({ $or: [{ short_name: loose }, { entity_name: loose }] }).lean();
  return ent;
}

async function run() {
  await connectDB();

  const target = await resolveEntity(targetArg);
  if (!target) {
    console.error(`Target entity not found: "${targetArg}". Check spelling (try short_name or entity_name).`);
    console.error('Known entities:');
    const all = await Entity.find({}).select('short_name entity_name entity_type').lean();
    for (const e of all) {
      console.error(`  ${e.short_name || '(no short)'} — ${e.entity_name} (${e.entity_type})`);
    }
    return await mongoose.disconnect();
  }

  const reference = await resolveEntity(referenceArg);
  if (!reference) {
    console.error(`Reference entity not found: "${referenceArg}".`);
    return await mongoose.disconnect();
  }

  if (target._id.toString() === reference._id.toString()) {
    console.error(`Target and reference are the same entity (${target.short_name}). Nothing to diff.`);
    return await mongoose.disconnect();
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`  SUBSIDIARY LOOKUP COMPLETENESS`);
  console.log(`${'='.repeat(70)}`);
  console.log(`  Reference: ${reference.short_name} — ${reference.entity_name}`);
  console.log(`  Target:    ${target.short_name} — ${target.entity_name}`);
  console.log(`  Mode:      ${APPLY ? 'APPLY (writes will occur)' : 'DRY-RUN (no writes)'}`);
  if (categoryArg) console.log(`  Filter:    category=${categoryArg}`);
  console.log('');

  // Get all categories that exist on reference
  const categoryFilter = categoryArg
    ? { entity_id: reference._id, category: categoryArg.toUpperCase() }
    : { entity_id: reference._id };

  const refRows = await Lookup.find(categoryFilter).lean();
  const tgtRows = await Lookup.find({ ...categoryFilter, entity_id: target._id }).lean();

  if (!refRows.length) {
    console.log(`Reference ${reference.short_name} has 0 Lookup rows${categoryArg ? ` in category ${categoryArg}` : ''}. Nothing to compare.`);
    return await mongoose.disconnect();
  }

  // Index target by (category, code) for fast lookup
  const tgtIndex = new Map();
  for (const r of tgtRows) tgtIndex.set(`${r.category}::${r.code}`, r);

  // Group by category, find missing
  const byCategory = new Map();
  for (const r of refRows) {
    if (!byCategory.has(r.category)) byCategory.set(r.category, { refCount: 0, tgtCount: 0, missing: [] });
    const entry = byCategory.get(r.category);
    entry.refCount++;
    if (tgtIndex.has(`${r.category}::${r.code}`)) {
      entry.tgtCount++;
    } else {
      entry.missing.push(r);
    }
  }

  // Report
  console.log(`${pad('CATEGORY', 34)}${padNum('REF', 8)}${padNum('TGT', 8)}${padNum('MISSING', 10)}`);
  console.log('-'.repeat(60));
  const categories = [...byCategory.entries()].sort();
  let totalMissing = 0;
  for (const [cat, e] of categories) {
    const missingCount = e.missing.length;
    totalMissing += missingCount;
    const flag = missingCount > 0 ? '  ⚠' : '';
    console.log(`${pad(cat, 34)}${padNum(e.refCount, 8)}${padNum(e.tgtCount, 8)}${padNum(missingCount, 10)}${flag}`);
  }
  console.log('-'.repeat(60));
  console.log(`${pad('TOTAL', 34)}${padNum(refRows.length, 8)}${padNum(tgtRows.length, 8)}${padNum(totalMissing, 10)}`);

  if (totalMissing === 0) {
    console.log('\n✓ Target is complete relative to reference. No action needed.');
    return await mongoose.disconnect();
  }

  // Show sample of missing codes per category (first 5 each)
  console.log('\nMissing codes (sample per category):');
  for (const [cat, e] of categories) {
    if (!e.missing.length) continue;
    const sample = e.missing.slice(0, 5).map(r => r.code).join(', ');
    const more = e.missing.length > 5 ? ` ... +${e.missing.length - 5} more` : '';
    console.log(`  ${cat}: ${sample}${more}`);
  }

  if (!APPLY) {
    console.log(`\nDRY-RUN only. ${totalMissing} row(s) would be seeded. Re-run with --apply to write.`);
    return await mongoose.disconnect();
  }

  // APPLY — upsert missing rows
  console.log(`\nSeeding ${totalMissing} missing row(s) into ${target.short_name}...`);
  let written = 0;
  for (const [cat, e] of categories) {
    for (const src of e.missing) {
      // Idempotent upsert by (entity_id, category, code). $setOnInsert so we
      // never overwrite a row that somehow already exists on target with
      // different values.
      const copy = {
        entity_id: target._id,
        category: src.category,
        code: src.code,
        label: src.label,
        sort_order: src.sort_order,
        is_active: src.is_active,
        metadata: src.metadata || {},
      };
      await Lookup.updateOne(
        { entity_id: target._id, category: src.category, code: src.code },
        { $setOnInsert: copy },
        { upsert: true }
      );
      written++;
    }
    console.log(`  ${cat}: ${e.missing.length} row(s) seeded`);
  }

  console.log(`\n✓ Done. ${written} row(s) upserted into ${target.short_name}.`);
  console.log('  Re-run in dry-run mode to verify gap is closed.');

  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
