#!/usr/bin/env node
/**
 * migrateInboxArchived.js — Phase G9.R8 (Apr 2026)
 *
 * One-shot migration from single-bool `isArchived` to per-recipient
 * `archivedBy: [ObjectId]`.
 *
 * Strategy:
 *   1. For every doc where isArchived === true:
 *        - If recipientUserId is set → archivedBy = [recipientUserId].
 *        - If recipientUserId is null (broadcast) → archivedBy = [].
 *          (We can't know which role-members actually dismissed the broadcast;
 *           leave empty. Message will surface for everyone again — accepted
 *           loss. These are historical admin-dismissed broadcasts that no one
 *           was paying attention to anyway.)
 *   2. Drop the legacy `isArchived` field from every doc.
 *   3. Drop the legacy isArchived-indexed compound indexes (Mongo will ignore
 *      unknown index-drop attempts gracefully).
 *   4. Optionally evaluate must_acknowledge retroactively via the lookup
 *      rules so old messages also pick up the new ack affordance. Only
 *      applied when `--with-ack` flag is passed (by default we leave old
 *      messages as-is to avoid surprising users with sudden ACK-required
 *      chips on already-read items).
 *
 * Usage:
 *   node backend/scripts/migrateInboxArchived.js --dry-run
 *   node backend/scripts/migrateInboxArchived.js               (apply)
 *   node backend/scripts/migrateInboxArchived.js --with-ack    (apply + evaluate must_ack)
 *
 * Safety:
 *   - Idempotent: running twice is safe (second run finds no `isArchived: true`
 *     docs and no legacy field remaining).
 *   - No cascade: does not touch Lookup, Settings, AuditLog, etc.
 *   - No row deletion: only updates in place.
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const WITH_ACK = args.has('--with-ack');

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('[migrate] MONGO_URI missing from env');
    process.exit(1);
  }
  await mongoose.connect(uri);
  console.log(`[migrate] connected (dry_run=${DRY_RUN}, with_ack=${WITH_ACK})`);

  const MessageInbox = require('../models/MessageInbox');

  // ── Count candidates ──────────────────────────────────────────────────
  const totalWithLegacy = await MessageInbox.countDocuments({ isArchived: true });
  const totalDocs = await MessageInbox.countDocuments({});
  console.log(`[migrate] total messages: ${totalDocs}`);
  console.log(`[migrate] legacy isArchived=true: ${totalWithLegacy}`);

  if (!DRY_RUN) {
    // ── Phase 1 — copy isArchived=true into archivedBy ───────────────────
    // Two separate updates because of the conditional on recipientUserId.
    const setArchivedForTargeted = await MessageInbox.updateMany(
      {
        isArchived: true,
        recipientUserId: { $ne: null, $exists: true },
        $or: [{ archivedBy: { $exists: false } }, { archivedBy: { $size: 0 } }],
      },
      [
        { $set: { archivedBy: ['$recipientUserId'] } },
      ]
    );
    console.log(`[migrate] targeted→archivedBy migrated: ${setArchivedForTargeted.modifiedCount}`);

    const setArchivedForBroadcast = await MessageInbox.updateMany(
      {
        isArchived: true,
        $or: [{ recipientUserId: null }, { recipientUserId: { $exists: false } }],
        $or2: [{ archivedBy: { $exists: false } }, { archivedBy: { $size: 0 } }],
      },
      { $set: { archivedBy: [] } }
    );
    console.log(`[migrate] broadcast→archivedBy initialised: ${setArchivedForBroadcast.modifiedCount}`);

    // ── Phase 2 — drop the legacy field from every doc ───────────────────
    const stripLegacy = await MessageInbox.updateMany(
      { isArchived: { $exists: true } },
      { $unset: { isArchived: '' } }
    );
    console.log(`[migrate] legacy isArchived field removed: ${stripLegacy.modifiedCount}`);

    // ── Phase 3 — drop compound indexes that referenced isArchived ───────
    const toDrop = [
      'recipientRole_1_recipientUserId_1_isArchived_1_createdAt_-1',
      'entity_id_1_recipientRole_1_recipientUserId_1_isArchived_1_createdAt_-1',
    ];
    for (const name of toDrop) {
      try {
        await MessageInbox.collection.dropIndex(name);
        console.log(`[migrate] dropped legacy index: ${name}`);
      } catch (err) {
        if (err.codeName === 'IndexNotFound' || /index not found/i.test(err.message)) {
          console.log(`[migrate] legacy index already absent: ${name}`);
        } else {
          console.warn(`[migrate] could not drop ${name}:`, err.message);
        }
      }
    }
    // Rebuild fresh indexes defined on the current schema.
    try {
      await MessageInbox.syncIndexes();
      console.log('[migrate] syncIndexes completed');
    } catch (err) {
      console.warn('[migrate] syncIndexes warning:', err.message);
    }

    // ── Phase 4 — retroactive must_acknowledge ──────────────────────────
    if (WITH_ACK) {
      const { evaluateAckDefault } = require('../erp/utils/inboxAckDefaults');
      const cursor = MessageInbox.find({ must_acknowledge: { $ne: true } })
        .cursor({ batchSize: 500 });
      let flagged = 0;
      for (let doc = await cursor.next(); doc; doc = await cursor.next()) {
        const shouldAck = await evaluateAckDefault({
          entity_id: doc.entity_id,
          category: doc.category,
          requires_action: doc.requires_action,
          senderRole: doc.senderRole,
        });
        if (shouldAck) {
          await MessageInbox.updateOne({ _id: doc._id }, { $set: { must_acknowledge: true } });
          flagged += 1;
        }
      }
      console.log(`[migrate] retroactive must_acknowledge flipped on ${flagged} docs`);
    }
  } else {
    console.log('[migrate] DRY RUN — no writes performed');
    const targetedCount = await MessageInbox.countDocuments({
      isArchived: true,
      recipientUserId: { $ne: null, $exists: true },
    });
    const broadcastCount = await MessageInbox.countDocuments({
      isArchived: true,
      $or: [{ recipientUserId: null }, { recipientUserId: { $exists: false } }],
    });
    console.log(`[migrate] dry-run: targeted archive count = ${targetedCount}`);
    console.log(`[migrate] dry-run: broadcast archive count = ${broadcastCount}`);
  }

  await mongoose.disconnect();
  console.log('[migrate] done');
}

main().catch((err) => {
  console.error('[migrate] fatal:', err);
  process.exit(1);
});
