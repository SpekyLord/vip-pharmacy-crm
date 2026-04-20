/**
 * Migration Script: Canonicalize SalesLine.doc_ref values on CSI rows
 *
 * Aggressively normalizes every existing CSI SalesLine.doc_ref to digits-only
 * with leading zeros stripped. After this runs:
 *
 *   "4852"         → "4852"
 *   "004852"       → "4852"
 *   "CSI 004852"   → "4852"
 *   "INV 004852"   → "4852"
 *   "#004852"      → "4852"
 *
 * Matches the pre('save') normalization hook on the SalesLine schema — without
 * this backfill, legacy rows would bypass the duplicate-detection rule that
 * now assumes canonical storage.
 *
 * SCOPE: sale_type='CSI' only. CASH_RECEIPT and SERVICE_INVOICE rows have
 * auto-generated doc_refs ("RCT-ILO040326-001") where every character is
 * load-bearing for uniqueness — normalizing them would corrupt the sequence.
 *
 * SAFETY: within each CSI's duplicate-detection scope (entity + source +
 * hospital/customer), if canonicalizing this row would create a collision
 * with another already-canonical row, the row is SKIPPED and logged for
 * manual review. Never silently merges two historical rows.
 *
 * IDEMPOTENT: re-running after the backfill is a no-op because every row is
 * already in canonical form.
 *
 * Usage: node backend/erp/scripts/backfillDocRefNormalization.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const db = require('../../config/db');
const { normalizeDocRef } = require('../utils/normalize');

async function migrate() {
  await db();

  const SalesLine = require('../models/SalesLine');

  // Candidate filter: CSI rows whose stored doc_ref is NOT already canonical.
  // A canonical CSI doc_ref is pure-digits with no leading zeros (except "0"
  // itself). So we match anything that contains a non-digit character OR
  // starts with 0 followed by any character.
  const candidates = await SalesLine.find({
    sale_type: 'CSI',
    doc_ref: { $exists: true, $ne: '' },
    $or: [
      { doc_ref: /\D/ },        // contains non-digit (e.g. "CSI 004852")
      { doc_ref: /^0+\d/ }      // leading zeros followed by digit (e.g. "004852")
    ]
  })
    .select('_id doc_ref entity_id sale_type source hospital_id customer_id status')
    .lean();

  let changed = 0;
  let skipped = 0;
  const collisions = [];

  for (const row of candidates) {
    const canonical = normalizeDocRef(row.doc_ref, row.sale_type);
    if (!canonical || canonical === row.doc_ref) {
      skipped++;
      continue;
    }

    // Collision check within the same duplicate-detection scope (entity +
    // sale_type + source + hospital/customer). If an already-canonical row
    // exists there, do NOT overwrite — flag for human review.
    const collisionFilter = {
      _id: { $ne: row._id },
      entity_id: row.entity_id,
      sale_type: row.sale_type,
      source: row.source,
      doc_ref: canonical
    };
    if (row.hospital_id) collisionFilter.hospital_id = row.hospital_id;
    if (row.customer_id) collisionFilter.customer_id = row.customer_id;
    const conflict = await SalesLine.findOne(collisionFilter)
      .select('_id status doc_ref')
      .lean();

    if (conflict) {
      collisions.push({
        row_id: row._id.toString(),
        stored: row.doc_ref,
        canonical,
        conflicts_with: conflict._id.toString(),
        conflict_status: conflict.status
      });
      skipped++;
      continue;
    }

    // Use save() so the pre('save') hook fires — single normalization path.
    const doc = await SalesLine.findById(row._id);
    if (!doc) { skipped++; continue; }
    doc.doc_ref = canonical;
    await doc.save();
    changed++;
  }

  console.log(`Scanned ${candidates.length} candidate CSI rows.`);
  console.log(`Canonicalized: ${changed}`);
  console.log(`Skipped (already canonical or unchanged): ${skipped}`);
  if (collisions.length) {
    console.warn(`\nWARNING: ${collisions.length} row(s) skipped due to collision within their dup-scope.`);
    console.warn('Review each one and decide: keep both, mark one as deletion-requested, or merge manually.');
    for (const c of collisions) console.warn(' ', JSON.stringify(c));
  }

  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
