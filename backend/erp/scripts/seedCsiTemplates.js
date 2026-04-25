/**
 * Phase 15.3 — seed CSI_TEMPLATE lookup rows.
 *
 * One row per entity. Metadata shape drives the mm-precise PDF overlay
 * renderer (backend/erp/services/csiDraftRenderer.js) — coordinates are
 * authoritative for VIP and MG AND CO. from 2026-04-24 field-measurement
 * pass against the physical BIR booklets.
 *
 * $setOnInsert only — admin edits via Lookup Manager survive reseed
 * (Phase 24-C metadata preservation pattern).
 *
 * Usage: node backend/erp/scripts/seedCsiTemplates.js [--apply]
 *   (dry-run by default — no --apply flag = just print what would happen)
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const Entity = require('../models/Entity');
const Lookup = require('../models/Lookup');

// ─── Template definitions ────────────────────────────────────────────
// Each coordinate is in millimeters. PDF renderer converts to points via
// mm * 2.8346. Row indices are 1-based, counted from `first_row_y_mm`.

const VIP_TEMPLATE = {
  page: { width_mm: 210, height_mm: 260 },
  header: {
    name:    { x: 45,  y: 57, label_hint: 'Registered Name' },
    date:    { x: 167, y: 40 },
    address: { x: 45,  y: 53 },
    terms:   { x: 145, y: 53 },
  },
  body: {
    first_row_y_mm: 68,
    row_height_mm: 5,
    row_count: 20,
    max_items_per_page: 3,
    columns: {
      description: { x: 10,  align: 'left' },
      unit:        { x: 113, align: 'left' },
      quantity:    { x: 126, align: 'right' },
      unit_cost:   { x: 142, align: 'right' },
      amount:      { x: 166, align: 'right' },
    },
    po_row_index: 18,
    note_row_start_index: 19,
    note_row_count: 2,
  },
  totals: {
    left: {
      start_y_mm: 182, row_height_mm: 5, x_mm: 42, align: 'right',
      fields: ['vatable_sales', 'vat', 'zero_rated', 'vat_exempt'],
    },
    right: {
      start_y_mm: 182, row_height_mm: 5, x_mm: 167, align: 'right',
      fields: [
        'total_sales_vat_inclusive', 'less_vat', 'amount_net_of_vat',
        'less_discount', 'add_vat', 'less_withholding_tax', 'total_amount_due',
      ],
    },
  },
  text: {
    po_label: 'PO#:',
    note_line_1: 'NOTE: All expired and damaged items will be',
    note_line_2: 'accepted and changed',
    default_terms: '30 days',
    // Lookup-driven unit abbreviation (Rule #3). Admin can edit per entity.
    unit_abbreviations: {
      AMPULE: 'AMP', BOTTLE: 'BOT', CAPSULE: 'CAP',
      TABLET: 'TAB', SACHET: 'SAC', STRIP:  'STR',
    },
    unit_abbrev_threshold: 4,
    unit_abbrev_length: 3,
  },
  font: { family: 'Helvetica-Bold', size_pt: 10 },
};

const MG_TEMPLATE = {
  page: { width_mm: 160, height_mm: 202 },
  header: {
    name:    { x: 25,  y: 39, label_hint: 'Charged to' },
    date:    { x: 125, y: 33 },
    address: { x: 22,  y: 43 },
    terms:   { x: 129, y: 44 },
  },
  body: {
    first_row_y_mm: 65,
    row_height_mm: 5,
    row_count: 13,
    max_items_per_page: 3,
    columns: {
      quantity:    { x: 6,   align: 'left' },
      unit:        { x: 17,  align: 'left' },
      articles:    { x: 28,  align: 'left' },
      unit_price:  { x: 114, align: 'right' },
      amount:      { x: 130, align: 'right' },
    },
    po_row_index: 11,
    note_row_start_index: 12,
    note_row_count: 2,
  },
  totals: {
    left: {
      start_y_mm: 135, row_height_mm: 5, x_mm: 28, align: 'right',
      fields: ['vatable_sales', 'vat_exempt', 'zero_rated', 'vat_amount'],
    },
    right: {
      start_y_mm: 125, row_height_mm: 5, x_mm: 131, align: 'right',
      fields: [
        'total_sales_vat_inclusive', 'less_vat', 'amount_net_of_vat',
        'less_sc_pwd_discount', 'amount_due', 'add_vat', 'total_amount_due',
      ],
    },
  },
  text: {
    po_label: 'PO#:',
    note_line_1: 'NOTE: All expired and damaged items will be',
    note_line_2: 'accepted and changed',
    default_terms: '30 days',
    // Lookup-driven unit abbreviation (Rule #3). Admin can edit per entity.
    unit_abbreviations: {
      AMPULE: 'AMP', BOTTLE: 'BOT', CAPSULE: 'CAP',
      TABLET: 'TAB', SACHET: 'SAC', STRIP:  'STR',
    },
    unit_abbrev_threshold: 4,
    unit_abbrev_length: 3,
  },
  font: { family: 'Helvetica-Bold', size_pt: 10 },
};

// ─── Entity matchers ────────────────────────────────────────────────
// Regex-match on entity_name (case-insensitive) — TINs in seedEntities.js
// don't exactly match the BIR-printed TINs on the booklet scans (VIP has 4 vs 5
// trailing zeros), so we match by name instead.

const TEMPLATES = [
  { match: /VIOS|\bVIP\b/i,                 code: 'VIP',        metadata: VIP_TEMPLATE },
  { match: /MG\s*AND\s*CO|MILLIGRAMS/i,       code: 'MG_AND_CO',  metadata: MG_TEMPLATE },
];

async function run({ apply }) {
  await connectDB();
  const entities = await Entity.find({ status: 'ACTIVE' }).lean();
  if (!entities.length) {
    console.log('No active entities found. Nothing to seed.');
    return;
  }

  let matched = 0;
  let upserted = 0;
  let skipped = 0;

  for (const entity of entities) {
    const tpl = TEMPLATES.find((t) => t.match.test(entity.entity_name || '') || t.match.test(entity.short_name || ''));
    if (!tpl) {
      console.log(`  ⊘ ${entity.entity_name} — no CSI template matcher, skipping`);
      skipped++;
      continue;
    }
    matched++;

    const filter = { entity_id: entity._id, category: 'CSI_TEMPLATE', code: tpl.code };
    const update = {
      $setOnInsert: {
        label: `${tpl.code} — CSI Draft Overlay Template`,
        sort_order: 0,
        is_active: true,
        metadata: tpl.metadata,
      },
    };

    if (!apply) {
      const existing = await Lookup.findOne(filter).lean();
      console.log(`  → ${entity.entity_name}: ${tpl.code} ${existing ? '(exists, preserved)' : '(would insert)'}`);
      continue;
    }

    const result = await Lookup.updateOne(filter, update, { upsert: true });
    if (result.upsertedCount > 0) {
      console.log(`  ✓ ${entity.entity_name}: inserted ${tpl.code}`);
      upserted++;
    } else {
      console.log(`  = ${entity.entity_name}: ${tpl.code} already present (metadata preserved)`);
    }
  }

  console.log(`\nMatched ${matched}/${entities.length} entities. Skipped ${skipped}. ${apply ? `Upserted ${upserted}.` : '(dry-run)'}`);
  if (!apply) console.log('Re-run with --apply to commit.');
}

if (require.main === module) {
  const apply = process.argv.includes('--apply');
  run({ apply })
    .then(() => mongoose.disconnect())
    .catch((err) => {
      console.error('Seed error:', err);
      mongoose.disconnect();
      process.exit(1);
    });
}

module.exports = { run, VIP_TEMPLATE, MG_TEMPLATE, TEMPLATES };
