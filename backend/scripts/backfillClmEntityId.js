/**
 * Phase 4 — one-time migration.
 *
 * Run with:
 *   node backend/scripts/backfillClmEntityId.js                     # dry-run (default)
 *   node backend/scripts/backfillClmEntityId.js --apply              # resolves entity_id per session's user
 *   node backend/scripts/backfillClmEntityId.js --apply --entity-id=<ObjectId>  # overrides to a single entity
 *
 * Backfills `entity_id` on pre-existing CLMSession rows. Safe to re-run
 * (idempotent — only touches rows missing entity_id).
 *
 * Resolution priority when --entity-id is NOT passed:
 *   session.user → User.entity_id || User.entity_ids[0]
 *
 * Deploy order: ship code first (field is sparse + non-required, so new
 * writes land clean). Then run --dry-run to review counts, --apply to
 * persist. Re-run --dry-run to confirm 0 rows remain.
 *
 * Mirror pattern: backfillMessageInboxEntityId.js (G9.A migration).
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const CLMSession = require('../models/CLMSession');
const User = require('../models/User');

const DRY_RUN = !process.argv.includes('--apply');
const entityArg = process.argv.find((a) => a.startsWith('--entity-id='));
const FORCED_ENTITY_ID = entityArg ? entityArg.split('=')[1] : null;

async function run() {
  if (!process.env.MONGO_URI) {
    console.error('[backfillClm] MONGO_URI not set. Aborting.');
    process.exit(1);
  }
  if (FORCED_ENTITY_ID && !mongoose.isValidObjectId(FORCED_ENTITY_ID)) {
    console.error(`[backfillClm] --entity-id=${FORCED_ENTITY_ID} is not a valid ObjectId. Aborting.`);
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log(`[backfillClm] Connected. DRY_RUN=${DRY_RUN} FORCED_ENTITY_ID=${FORCED_ENTITY_ID || '(resolve per-user)'}`);

  const coll = CLMSession.collection;
  const total = await coll.countDocuments({});
  const missing = await coll.countDocuments({
    $or: [{ entity_id: { $exists: false } }, { entity_id: null }],
  });
  console.log(`[backfillClm] rows=${total} missing_entity=${missing}`);

  if (missing === 0) {
    console.log('[backfillClm] Nothing to do — all rows have entity_id.');
    await mongoose.disconnect();
    return;
  }

  // Cache user → entity_id lookups to avoid N queries on hot rows.
  const userEntityCache = new Map();
  async function resolveEntityIdForUser(userId) {
    if (!userId) return null;
    const key = String(userId);
    if (userEntityCache.has(key)) return userEntityCache.get(key);
    try {
      const u = await User.findById(userId).select('_id entity_id entity_ids').lean();
      const eid = u?.entity_id || (Array.isArray(u?.entity_ids) && u.entity_ids[0]) || null;
      userEntityCache.set(key, eid);
      return eid;
    } catch {
      userEntityCache.set(key, null);
      return null;
    }
  }

  const cursor = coll.find(
    { $or: [{ entity_id: { $exists: false } }, { entity_id: null }] },
    { projection: { _id: 1, user: 1 } }
  );

  let updated = 0;
  let skippedNoEntity = 0;
  const bulkOps = [];
  const FLUSH_AT = 200;

  async function flush() {
    if (bulkOps.length === 0) return;
    if (DRY_RUN) {
      updated += bulkOps.length;
      bulkOps.length = 0;
      return;
    }
    const res = await coll.bulkWrite(bulkOps, { ordered: false });
    updated += res.modifiedCount || 0;
    bulkOps.length = 0;
  }

  // eslint-disable-next-line no-await-in-loop
  while (await cursor.hasNext()) {
    // eslint-disable-next-line no-await-in-loop
    const row = await cursor.next();

    const resolved = FORCED_ENTITY_ID
      ? new mongoose.Types.ObjectId(FORCED_ENTITY_ID)
      // eslint-disable-next-line no-await-in-loop
      : await resolveEntityIdForUser(row.user);

    if (!resolved) {
      skippedNoEntity += 1;
      continue;
    }

    bulkOps.push({
      updateOne: {
        filter: { _id: row._id },
        update: { $set: { entity_id: resolved } },
      },
    });
    if (bulkOps.length >= FLUSH_AT) await flush();
  }
  await flush();

  console.log(`[backfillClm] updated=${updated} skipped_no_entity=${skippedNoEntity} dry_run=${DRY_RUN}`);
  if (DRY_RUN) {
    console.log('[backfillClm] Re-run with --apply to persist.');
  }
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('[backfillClm] fatal:', err);
  process.exit(1);
});
