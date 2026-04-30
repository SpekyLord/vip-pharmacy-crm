/**
 * migratePhaseR1RebateSchema.js — Phase R1 (Apr 29 2026)
 *
 * Backfills the schema flips that Phase R1 introduces:
 *   1. MdProductRebate.hospital_id (now REQUIRED).
 *      Strategy for legacy rows missing hospital_id: pull the doctor's
 *      first hospital from Doctor.hospitals[0]. If the doctor has no
 *      hospitals[], the row is flagged as MIGRATION_BLOCKED — admin
 *      must manually edit the row through the Tier-A form (which now
 *      requires hospital_id) before re-running.
 *
 *   2. NonMdPartnerRebateRule.hospital_id (now REQUIRED).
 *      Same fallback as #1 (partner.hospitals[0] when missing).
 *
 *   3. NonMdPartnerRebateRule.calculation_mode (default EXCLUDE_MD_COVERED).
 *      Existing rows get the default — admin can switch via the form.
 *
 *   4. NonMdPartnerRebateRule legacy fields (customer_id, product_code,
 *      priority) — Mongoose ignores schema-removed fields when reading,
 *      but to keep the collection clean we $unset them too. Idempotent.
 *
 * USAGE:
 *   node backend/erp/scripts/migratePhaseR1RebateSchema.js          # dry-run (default)
 *   node backend/erp/scripts/migratePhaseR1RebateSchema.js --apply  # execute
 *   node backend/erp/scripts/migratePhaseR1RebateSchema.js --report # full report only
 *
 * Subscription posture: scans ALL entities. Per-entity rollup at the end.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const mongoose = require('mongoose');
const connectDB = require('../../config/db');

const APPLY = process.argv.includes('--apply');
const REPORT_ONLY = process.argv.includes('--report');

(async () => {
  console.log(`[migratePhaseR1RebateSchema] ${APPLY ? 'APPLY mode' : 'DRY-RUN mode'}`);
  await connectDB();

  // Lazy-load models so connectDB ran first.
  const Doctor = require('../../models/Doctor');
  const MdProductRebate = require('../models/MdProductRebate');
  const NonMdPartnerRebateRule = require('../models/NonMdPartnerRebateRule');

  const summary = {
    md_rebate_total: 0,
    md_rebate_already_set: 0,
    md_rebate_backfilled: 0,
    md_rebate_blocked: 0,
    nonmd_rule_total: 0,
    nonmd_rule_already_set: 0,
    nonmd_rule_backfilled: 0,
    nonmd_rule_blocked: 0,
    nonmd_rule_calc_mode_set: 0,
    nonmd_rule_legacy_unset: 0,
  };

  // ── 1. MdProductRebate.hospital_id backfill ──────────────────────────────
  // Use raw collection (model now requires hospital_id, so bare .find() would
  // not surface the legacy rows when reading via the typed model in apps —
  // but readying-via-find still works because Mongoose allows reading docs
  // that violate required fields, only save() enforces them. Defensive: use
  // the underlying collection so we don't accidentally trip new validators.
  const mdRebatesColl = mongoose.connection.collection('mdproductrebates');
  const mdRebates = await mdRebatesColl.find({}).toArray();
  summary.md_rebate_total = mdRebates.length;

  for (const row of mdRebates) {
    if (row.hospital_id) {
      summary.md_rebate_already_set += 1;
      continue;
    }
    const md = await Doctor.findById(row.doctor_id).select('hospitals firstName lastName').lean();
    const fallback = md?.hospitals?.[0] || null;
    if (!fallback) {
      summary.md_rebate_blocked += 1;
      console.warn(
        `  [BLOCKED] MdProductRebate ${row._id} — Dr. ${md?.firstName || '?'} ${md?.lastName || '?'} ` +
          `(${row.doctor_id}) has no hospitals[]. Manual edit required.`
      );
      continue;
    }
    if (APPLY) {
      await mdRebatesColl.updateOne({ _id: row._id }, { $set: { hospital_id: fallback } });
    }
    summary.md_rebate_backfilled += 1;
  }

  // ── 2 + 3 + 4. NonMdPartnerRebateRule schema flips ───────────────────────
  const nonMdColl = mongoose.connection.collection('nonmdpartnerrebaterules');
  const nonMdRules = await nonMdColl.find({}).toArray();
  summary.nonmd_rule_total = nonMdRules.length;

  for (const row of nonMdRules) {
    const updateSet = {};
    const updateUnset = {};

    if (row.hospital_id) {
      summary.nonmd_rule_already_set += 1;
    } else {
      // partner_id was previously a PeopleMaster ref but Phase R1 flips to
      // Doctor. Existing rows might have a PeopleMaster _id; we still try to
      // resolve hospitals[] via Doctor by _id (works if the same _id happens
      // to match a Doctor row, otherwise blocked). Fresh installs will always
      // resolve cleanly.
      const partner = await Doctor.findById(row.partner_id).select('hospitals firstName lastName').lean();
      const fallback = partner?.hospitals?.[0] || null;
      if (!fallback) {
        summary.nonmd_rule_blocked += 1;
        console.warn(
          `  [BLOCKED] NonMdPartnerRebateRule ${row._id} — partner ${row.partner_id} has no ` +
            `Doctor.hospitals[] (or partner_id refs PeopleMaster from pre-R1). Manual edit required.`
        );
      } else {
        updateSet.hospital_id = fallback;
        summary.nonmd_rule_backfilled += 1;
      }
    }

    if (!row.calculation_mode) {
      updateSet.calculation_mode = 'EXCLUDE_MD_COVERED';
      summary.nonmd_rule_calc_mode_set += 1;
    }

    // Drop legacy fields if present.
    let unsetCount = 0;
    if (row.customer_id !== undefined) {
      updateUnset.customer_id = '';
      unsetCount += 1;
    }
    if (row.product_code !== undefined) {
      updateUnset.product_code = '';
      unsetCount += 1;
    }
    if (row.priority !== undefined) {
      updateUnset.priority = '';
      unsetCount += 1;
    }
    if (unsetCount) summary.nonmd_rule_legacy_unset += unsetCount;

    if (APPLY && (Object.keys(updateSet).length || Object.keys(updateUnset).length)) {
      const op = {};
      if (Object.keys(updateSet).length) op.$set = updateSet;
      if (Object.keys(updateUnset).length) op.$unset = updateUnset;
      await nonMdColl.updateOne({ _id: row._id }, op);
    }
  }

  console.log('\n──────── Phase R1 Migration Summary ────────');
  console.log(JSON.stringify(summary, null, 2));
  console.log(APPLY ? 'APPLIED.' : 'DRY-RUN — pass --apply to execute.');

  if (summary.md_rebate_blocked || summary.nonmd_rule_blocked) {
    console.warn(
      `\n⚠ ${summary.md_rebate_blocked + summary.nonmd_rule_blocked} rows BLOCKED. ` +
        'Open the affected rules in the admin UI and supply hospital_id manually before running --apply again.'
    );
  }

  await mongoose.disconnect();
  process.exit(0);
})().catch((err) => {
  console.error('[migratePhaseR1RebateSchema] FAILED:', err);
  process.exit(1);
});
