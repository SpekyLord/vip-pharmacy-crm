#!/usr/bin/env node
/**
 * migrateCsiTemplateUnitColumn.js — Apr 2026
 *
 * One-off update to existing CSI_TEMPLATE Lookup rows. The seed file
 * (seedCsiTemplates.js) uses $setOnInsert only — admin edits via Lookup
 * Manager survive reseed (Phase 24-C metadata preservation pattern). That
 * means changing the seed defaults does NOT touch existing Lookup rows.
 *
 * This script applies two changes via explicit $set:
 *
 *   1. VIP CSI rows: add `metadata.body.columns.unit = { x: 113, align: 'left' }`
 *      so the booklet's Unit/Sold Per column at x=113mm renders.
 *
 *   2. ALL CSI_TEMPLATE rows (VIP + MG AND CO. + any future): add
 *      `metadata.text.unit_abbreviations`, `unit_abbrev_threshold`,
 *      `unit_abbrev_length` so the abbreviation rule is Lookup-driven
 *      (Rule #3) and tunable per entity.
 *
 * Idempotent: re-running on already-migrated rows is a no-op (the script
 * checks current values before writing).
 *
 * Usage:
 *   node backend/erp/scripts/migrateCsiTemplateUnitColumn.js              (dry-run)
 *   node backend/erp/scripts/migrateCsiTemplateUnitColumn.js --apply      (execute)
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const Lookup = require('../models/Lookup');

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');

const UNIT_ABBREVIATIONS = {
  AMPULE: 'AMP', BOTTLE: 'BOT', CAPSULE: 'CAP',
  TABLET: 'TAB', SACHET: 'SAC', STRIP:  'STR',
};
const UNIT_ABBREV_THRESHOLD = 4;
const UNIT_ABBREV_LENGTH = 3;
const VIP_UNIT_COL = { x: 113, align: 'left' };

async function main() {
  await connectDB();
  console.log(`\n=== migrateCsiTemplateUnitColumn ${APPLY ? '(APPLY)' : '(DRY-RUN)'} ===\n`);

  const rows = await Lookup.find({ category: 'CSI_TEMPLATE' }).lean();
  if (!rows.length) {
    console.log('No CSI_TEMPLATE rows found. Nothing to migrate.');
    return;
  }

  let touched = 0;
  let skipped = 0;

  for (const row of rows) {
    const meta = row.metadata || {};
    const body = meta.body || {};
    const cols = body.columns || {};
    const text = meta.text || {};

    const set = {};
    const reasons = [];

    // Change 1: VIP unit column at x=113
    const isVip = row.code === 'VIP';
    if (isVip && !cols.unit) {
      set['metadata.body.columns.unit'] = VIP_UNIT_COL;
      reasons.push('add VIP unit col @ x=113');
    }

    // Change 2: unit abbreviation Lookup metadata (all rows)
    if (!text.unit_abbreviations) {
      set['metadata.text.unit_abbreviations'] = UNIT_ABBREVIATIONS;
      reasons.push('add unit_abbreviations');
    }
    if (text.unit_abbrev_threshold === undefined) {
      set['metadata.text.unit_abbrev_threshold'] = UNIT_ABBREV_THRESHOLD;
      reasons.push('add threshold');
    }
    if (text.unit_abbrev_length === undefined) {
      set['metadata.text.unit_abbrev_length'] = UNIT_ABBREV_LENGTH;
      reasons.push('add length');
    }

    if (Object.keys(set).length === 0) {
      console.log(`  = ${row.code} (entity=${row.entity_id}): already migrated`);
      skipped++;
      continue;
    }

    console.log(`  → ${row.code} (entity=${row.entity_id}): ${reasons.join(', ')}`);
    if (APPLY) {
      await Lookup.updateOne({ _id: row._id }, { $set: set });
      touched++;
    }
  }

  console.log(`\n${rows.length} row(s) found. ${APPLY ? `Updated ${touched}, skipped ${skipped}.` : `Would update ${rows.length - skipped}, ${skipped} already migrated.`}`);
  if (!APPLY) console.log('\nRe-run with --apply to commit.');
}

main()
  .then(() => mongoose.disconnect())
  .catch((err) => {
    console.error('Migration error:', err);
    mongoose.disconnect();
    process.exit(1);
  });
