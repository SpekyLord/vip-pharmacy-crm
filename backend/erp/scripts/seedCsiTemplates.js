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
//
// Coordinate semantics (Apr 27 2026):
//   x → LEFT edge of the first character (left-aligned fields) OR
//       RIGHT edge of the last character (right-aligned fields).
//   y → BASELINE of the text (the line letters sit on, NOT the top
//       of the bounding box). The renderer subtracts the font ascent
//       so the baseline lands at this value, matching the calibration
//       crosshair point.
//
// Pre-existing rows authored under old "y = top of box" semantics will
// render ~2.5 mm higher than before until re-tuned via the calibration
// grid → My CSI panel. Re-seed is non-destructive ($setOnInsert), so
// admin edits via Lookup Manager remain authoritative.

const VIP_TEMPLATE = {
  // Defaults updated 2026-04-27 from booklet #004804 field test:
  //   • name.y 57 → 45 (booklet "Registered Name" line)
  //   • all x values shifted +4 mm to land on the booklet's columns
  //   • page → A4 so office printers accept it as native paper; the
  //     booklet feeds at the top-left of the A4 area.
  page: { width_mm: 210, height_mm: 297 },
  header: {
    name:    { x: 49,  y: 45, label_hint: 'Registered Name' },
    date:    { x: 171, y: 40 },
    address: { x: 49,  y: 53 },
    terms:   { x: 149, y: 53 },
  },
  body: {
    first_row_y_mm: 68,
    row_height_mm: 5,
    row_count: 20,
    max_items_per_page: 3,
    columns: {
      description: { x: 14,  align: 'left' },
      unit:        { x: 117, align: 'left' },
      quantity:    { x: 130, align: 'right' },
      unit_cost:   { x: 146, align: 'right' },
      amount:      { x: 170, align: 'right' },
    },
    po_row_index: 18,
    note_row_start_index: 19,
    note_row_count: 2,
  },
  totals: {
    // totals.right is right-aligned at x=171 to match the date column
    // (date.x = 171) — so the rightmost digit of every total line stacks
    // exactly under the rightmost character of the date.
    // totals.left sits in the VAT-summary column on the lower left at
    // x=46 (after the +4 mm field-test shift).
    left: {
      start_y_mm: 182, row_height_mm: 5, x_mm: 46, align: 'right',
      fields: ['vatable_sales', 'vat', 'zero_rated', 'vat_exempt'],
    },
    right: {
      start_y_mm: 182, row_height_mm: 5, x_mm: 171, align: 'right',
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
  // Page set to A4 so office printers accept it as native paper. The
  // physical MG and CO booklet (160×202 mm) feeds at the top-left of
  // the A4 sheet; coordinates below are absolute from page top-left,
  // so they remain valid.
  page: { width_mm: 210, height_mm: 297 },
  header: {
    name:    { x: 25,  y: 39, label_hint: 'Charged to' },
    date:    { x: 125, y: 35 },  // +2 mm from booklet #419 field test (Apr 27 2026)
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
