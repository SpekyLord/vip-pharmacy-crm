/**
 * Phase SMER-CL — Idempotent backfill for PERDIEM_RATES.metadata new keys.
 *
 * The Phase SMER-CL seed (May 07 2026) added 4 new metadata keys to the BDM /
 * ECOMMERCE_BDM / DELIVERY_DRIVER seed entries:
 *   - include_comm_log
 *   - comm_log_daily_cap
 *   - comm_log_require_outbound
 *   - comm_log_allowed_sources
 *
 * Existing PERDIEM_RATES rows on the dev / prod cluster were created BEFORE
 * Phase SMER-CL and lack these keys. Because the seed entries carry
 * `insert_only_metadata: true`, the re-seed path does NOT overwrite existing
 * rows — they stay missing the new keys, and resolvePerdiemConfig falls back
 * to safe defaults (include_comm_log === true → false unless explicitly set).
 *
 * This script flips the new keys onto existing PERDIEM_RATES.BDM and
 * PERDIEM_RATES.ECOMMERCE_BDM rows across ALL entities. Defaults match the
 * VIP entity's seed posture (include_comm_log: true). DELIVERY_DRIVER rows
 * get the SaaS-OFF posture (include_comm_log: false) because that template is
 * for non-pharma logbook-driven subscribers without admin-in-chat trust.
 *
 * Idempotent: only adds keys that are missing. Pre-existing values (set via
 * Control Center or earlier runs) are preserved.
 *
 * Run:
 *   node backend/scripts/backfillPerdiemRatesCommLog.js          # dry run (default)
 *   node backend/scripts/backfillPerdiemRatesCommLog.js --apply  # write
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

const APPLY = process.argv.includes('--apply');

const VIP_LIKE_DEFAULTS = {
  include_comm_log: true,
  comm_log_daily_cap: null,
  comm_log_require_outbound: false,
  comm_log_allowed_sources: ['manual'],
};

const SAAS_TEMPLATE_DEFAULTS = {
  include_comm_log: false,
  comm_log_daily_cap: null,
  comm_log_require_outbound: false,
  comm_log_allowed_sources: ['manual'],
};

async function main() {
  console.log('━━━ Phase SMER-CL backfill — PERDIEM_RATES.metadata ━━━');
  console.log('Mode:', APPLY ? 'APPLY (writing)' : 'DRY RUN (no writes)');
  await mongoose.connect(process.env.MONGO_URI);

  const Lookup = require('../erp/models/Lookup');

  // Find every PERDIEM_RATES row across all entities.
  const rows = await Lookup.find({ category: 'PERDIEM_RATES' }).lean();
  console.log(`Found ${rows.length} PERDIEM_RATES row(s) across all entities.`);

  let patched = 0;
  let skipped = 0;
  for (const row of rows) {
    const meta = row.metadata || {};
    const isSaasTemplate = row.code === 'DELIVERY_DRIVER';
    const defaults = isSaasTemplate ? SAAS_TEMPLATE_DEFAULTS : VIP_LIKE_DEFAULTS;

    const patch = {};
    for (const [k, v] of Object.entries(defaults)) {
      if (!(k in meta)) patch[`metadata.${k}`] = v;
    }

    if (Object.keys(patch).length === 0) {
      skipped++;
      continue;
    }

    console.log(`  ${row.entity_id} / ${row.code} → adding ${Object.keys(patch).join(', ')}`);
    if (APPLY) {
      await Lookup.updateOne({ _id: row._id }, { $set: patch });
    }
    patched++;
  }

  console.log(`\n${patched} row(s) ${APPLY ? 'patched' : 'WOULD be patched'}, ${skipped} unchanged.`);
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});
