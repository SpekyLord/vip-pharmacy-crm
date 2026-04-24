/**
 * Cleanup — Legacy UNDERTAKING_SETTINGS lookup rows (post Phase 32R)
 *
 * Context:
 *   Phase 32 (Apr 20, 2026) introduced the `UNDERTAKING_SETTINGS` Lookup
 *   category for GRN thresholds. Phase 32R renamed it to `GRN_SETTINGS`
 *   because the Undertaking stopped being the validator — the GRN is the
 *   source of truth, so settings moved to where capture/validation runs.
 *
 *   `SEED_DEFAULTS` in lookupGenericController.js only defines `GRN_SETTINGS`
 *   today; there is no `UNDERTAKING_SETTINGS` key in the seed dict. The
 *   reader (`undertakingService.getGrnSetting`) still checks both
 *   categories for back-compat.
 *
 *   Production was seeded after the rename and has only `GRN_SETTINGS`.
 *   Dev was seeded before the rename and still has orphaned
 *   `UNDERTAKING_SETTINGS` rows sitting next to the new ones, which
 *   inflates the Foundation Health Lookup Tables denominator by 1
 *   (153 vs prod's 152).
 *
 * What this script does:
 *   - default (dry-run): report UNDERTAKING_SETTINGS rows and whether
 *     an equivalent (entity_id, code) exists in GRN_SETTINGS. Classifies
 *     each legacy row as SAFE_TO_DELETE (equivalent exists in new cat)
 *     or NEEDS_RENAME (no equivalent — would lose config if just deleted).
 *   - --apply-delete: deletes ALL UNDERTAKING_SETTINGS rows. Run only
 *     after verifying the dry-run shows 0 NEEDS_RENAME rows.
 *   - --apply-rename: flips legacy rows' category to GRN_SETTINGS when
 *     no collision exists, deletes them when a GRN_SETTINGS row already
 *     owns the same (entity_id, code). Lossless.
 *
 * Idempotent: safe to re-run. After cleanup, UNDERTAKING_SETTINGS is
 * gone and the Foundation Health count drops by 1.
 *
 * Usage (from backend/):
 *   node scripts/cleanupLegacyUndertakingSettings.js                  # dry-run
 *   node scripts/cleanupLegacyUndertakingSettings.js --apply-rename   # preserve config
 *   node scripts/cleanupLegacyUndertakingSettings.js --apply-delete   # only if safe
 */
require('dotenv').config();
const mongoose = require('mongoose');

const APPLY_DELETE = process.argv.includes('--apply-delete');
const APPLY_RENAME = process.argv.includes('--apply-rename');

if (APPLY_DELETE && APPLY_RENAME) {
  console.error('Pass only one of --apply-delete / --apply-rename, not both.');
  process.exit(1);
}

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not set. Run from backend/ so dotenv picks up backend/.env');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);
  const mode = APPLY_DELETE ? 'APPLY-DELETE' : APPLY_RENAME ? 'APPLY-RENAME' : 'DRY-RUN';
  console.log(`Connected. Mode: ${mode}\n`);

  const Lookup = require('../erp/models/Lookup');
  const coll = Lookup.collection;

  const legacyRows = await coll
    .find({ category: 'UNDERTAKING_SETTINGS' })
    .toArray();

  if (legacyRows.length === 0) {
    console.log('No UNDERTAKING_SETTINGS rows found. Nothing to do.');
    await mongoose.disconnect();
    return;
  }

  console.log(`Found ${legacyRows.length} legacy UNDERTAKING_SETTINGS row(s).\n`);

  const classified = [];
  for (const row of legacyRows) {
    const twin = await coll.findOne({
      category: 'GRN_SETTINGS',
      entity_id: row.entity_id,
      code: row.code,
    });
    classified.push({ row, twin });
  }

  for (const { row, twin } of classified) {
    const verdict = twin ? 'SAFE_TO_DELETE (twin exists in GRN_SETTINGS)' : 'NEEDS_RENAME (no twin)';
    const val = row?.metadata?.value;
    const twinVal = twin?.metadata?.value;
    console.log(
      `  [${verdict}]  entity=${row.entity_id}  code=${row.code}  ` +
        `legacy.value=${val}  grn.value=${twinVal === undefined ? '—' : twinVal}`
    );
  }

  const needsRename = classified.filter((c) => !c.twin).length;
  const safeDelete = classified.filter((c) => c.twin).length;
  console.log(`\nSummary: ${safeDelete} twin-backed, ${needsRename} orphan.\n`);

  if (!APPLY_DELETE && !APPLY_RENAME) {
    console.log('Dry-run only. Re-run with --apply-rename (safe, preserves orphan config)');
    console.log('or --apply-delete (only if orphan count is 0).');
    await mongoose.disconnect();
    return;
  }

  if (APPLY_DELETE) {
    if (needsRename > 0) {
      console.error(
        `Refusing --apply-delete: ${needsRename} orphan row(s) would lose configuration. ` +
          `Use --apply-rename instead.`
      );
      await mongoose.disconnect();
      process.exit(1);
    }
    const res = await coll.deleteMany({ category: 'UNDERTAKING_SETTINGS' });
    console.log(`Deleted ${res.deletedCount} row(s).`);
  }

  if (APPLY_RENAME) {
    let renamed = 0;
    let deletedDup = 0;
    for (const { row, twin } of classified) {
      if (twin) {
        await coll.deleteOne({ _id: row._id });
        deletedDup++;
      } else {
        await coll.updateOne({ _id: row._id }, { $set: { category: 'GRN_SETTINGS' } });
        renamed++;
      }
    }
    console.log(`Renamed ${renamed} orphan row(s) to GRN_SETTINGS.`);
    console.log(`Deleted ${deletedDup} twin-backed duplicate(s).`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
