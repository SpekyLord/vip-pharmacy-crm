#!/usr/bin/env node
/**
 * Phase R-Storefront Phase 2 — May 8 2026
 *
 * One-shot migration: rebuild the compound unique partial indexes on
 * `RebatePayout` + `CommissionPayout` after fixing the partial filter
 * expression from `$ne: 'VOIDED'` to `$in: ['ACCRUING','READY_TO_PAY','PAID']`.
 *
 * Why this is required:
 *   The original Phase VIP-1.B index definition used `partialFilterExpression:
 *   { status: { $ne: 'VOIDED' } }`. MongoDB Atlas rejects `$ne` in partial
 *   filters (the server returns "Expression not supported in partial index:
 *   $not"), so syncIndexes() silently failed on every boot — the unique
 *   compound index NEVER got created on production or dev clusters.
 *
 *   Phase R-Storefront Phase 2 surfaced this latent bug because the
 *   attachStorefrontRebate endpoint re-triggers routing on every save (post-
 *   POSTED edit path), so duplicate RebatePayout rows started landing.
 *   Collection POST flow also has the same bug latent — re-running auto-
 *   routing on the same Collection (e.g. via the Approval Hub re-approval
 *   path) would also duplicate accruals; users probably haven't hit this
 *   because Collections rarely re-route on the same source.
 *
 * What this script does:
 *   1. Connects to MongoDB via MONGO_URI from backend/.env
 *   2. For each affected collection (RebatePayout, CommissionPayout):
 *      a. Lists current indexes
 *      b. Drops any prior auto-named index using the old compound key
 *         (defensive — none should exist since the original creation failed)
 *      c. Calls syncIndexes() so Mongoose builds the new $in-based index
 *      d. Verifies the new index exists
 *
 *   Idempotent — safe to re-run.
 *
 * Run:
 *   node backend/scripts/migrateRebateCommissionPayoutIndexes.js
 *   node backend/scripts/migrateRebateCommissionPayoutIndexes.js --apply
 *
 *   Without --apply, runs in DRY-RUN mode (logs what it would do).
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');

const RebatePayout = require('../erp/models/RebatePayout');
const CommissionPayout = require('../erp/models/CommissionPayout');

const TARGETS = [
  { name: 'RebatePayout', model: RebatePayout, expectedIndex: 'entity_id_1_payee_id_1_period_1_collection_id_1_sales_line_id_1_order_id_1_source_kind_1' },
  { name: 'CommissionPayout', model: CommissionPayout, expectedIndex: 'entity_id_1_payee_id_1_period_1_collection_id_1_sales_line_id_1_order_id_1_source_kind_1' },
];

(async () => {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI not set — load backend/.env first');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected (${APPLY ? 'APPLY' : 'DRY-RUN'})`);
  console.log('────────────────────────────────────────');

  for (const t of TARGETS) {
    console.log(`\n[${t.name}]`);
    const idxs = await t.model.collection.indexes();
    const idxNames = idxs.map(i => i.name);
    console.log('  current indexes:', idxNames);

    const hasExpected = idxs.some(i => i.name === t.expectedIndex);
    console.log('  has expected idem index:', hasExpected);

    if (hasExpected) {
      const i = idxs.find(idx => idx.name === t.expectedIndex);
      const filter = JSON.stringify(i.partialFilterExpression || {});
      console.log('  current partial filter:', filter);
      // If it's already the new $in form, nothing to do
      if (filter.includes('"$in"')) {
        console.log('  ✓ already using $in form — skipping');
        continue;
      }
      // Old form (probably $ne) — drop and recreate via syncIndexes
      console.log('  has stale partial filter — drop + sync');
      if (APPLY) {
        await t.model.collection.dropIndex(t.expectedIndex);
        console.log('  dropped:', t.expectedIndex);
      } else {
        console.log('  [dry-run] would drop:', t.expectedIndex);
      }
    }

    if (APPLY) {
      const out = await t.model.syncIndexes();
      console.log('  syncIndexes output:', out);
      const after = await t.model.collection.indexes();
      const created = after.find(i => i.name === t.expectedIndex);
      if (created) {
        console.log('  ✓ created:', created.name, JSON.stringify(created.partialFilterExpression || {}));
      } else {
        console.log('  ✗ FAIL — expected index NOT created');
        process.exitCode = 1;
      }
    } else {
      console.log('  [dry-run] would call syncIndexes() to create:', t.expectedIndex);
    }
  }

  console.log('\n────────────────────────────────────────');
  console.log(APPLY ? 'Migration complete.' : 'Dry-run complete. Re-run with --apply to execute.');
  await mongoose.disconnect();
})().catch(err => {
  console.error('Migration FAILED:', err);
  process.exit(1);
});
