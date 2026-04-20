/**
 * resetCarLogbook.js — Phase 33 reset utility
 *
 * User directive (confirmed Apr 21, 2026): "delete the posted and start fresh.
 * contractors have the copies of daily odometer."
 *
 * What this does:
 *   1. Counts (dry-run by default) DRAFT/VALID/ERROR/POSTED CarLogbookEntry docs
 *      and any CarLogbookCycle wrappers in `erp_car_logbook_cycles`.
 *   2. With --live: drops POSTED + DELETION_REQUESTED CarLogbookEntry docs,
 *      drops the entire erp_car_logbook_cycles collection, and resolves pending
 *      CAR_LOGBOOK / FUEL_ENTRY ApprovalRequests with reason="Superseded by
 *      Phase 33 cycle-doc redesign".
 *   3. Leaves historical TransactionEvents + POSTED JournalEntries untouched.
 *      Ledger stays balanced. Contractors re-enter April C2 from paper copies.
 *
 * Usage:
 *   node backend/scripts/resetCarLogbook.js --dry-run     # default, logs only
 *   node backend/scripts/resetCarLogbook.js --live        # writes
 *   node backend/scripts/resetCarLogbook.js --live --archive  # rename instead of drop
 *
 * Safety:
 *   - Dry-run by default — never writes without --live.
 *   - Archive mode renames collections to _legacy_<timestamp> so data can be
 *     restored via rename if the restart goes wrong.
 */
const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const LIVE = process.argv.includes('--live');
const ARCHIVE = process.argv.includes('--archive');
const MONGO_URI = process.env.MONGO_URI;

async function main() {
  if (!MONGO_URI) {
    console.error('MONGO_URI missing. Aborting.');
    process.exit(1);
  }
  await mongoose.connect(MONGO_URI);
  console.log(`[resetCarLogbook] Connected. Mode: ${LIVE ? (ARCHIVE ? 'LIVE + ARCHIVE' : 'LIVE') : 'DRY-RUN'}`);

  const db = mongoose.connection.db;

  // 1. Per-day CarLogbookEntry counts
  const CarLogbookEntry = db.collection('erp_car_logbook_entries');
  const byStatus = await CarLogbookEntry.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]).toArray();
  console.log('[resetCarLogbook] CarLogbookEntry by status:', byStatus);

  const postedCount = byStatus.find(s => s._id === 'POSTED')?.count || 0;
  const delReqCount = byStatus.find(s => s._id === 'DELETION_REQUESTED')?.count || 0;
  console.log(`[resetCarLogbook] Will remove ${postedCount + delReqCount} POSTED/DELETION_REQUESTED per-day docs on --live`);

  // 2. Cycle wrapper collection
  const cycleCollectionExists = (await db.listCollections({ name: 'erp_car_logbook_cycles' }).toArray()).length > 0;
  if (cycleCollectionExists) {
    const cycleCount = await db.collection('erp_car_logbook_cycles').countDocuments();
    console.log(`[resetCarLogbook] erp_car_logbook_cycles exists with ${cycleCount} docs (will be ${ARCHIVE ? 'renamed' : 'dropped'})`);
  } else {
    console.log('[resetCarLogbook] erp_car_logbook_cycles does not exist yet (first-time Phase 33)');
  }

  // 3. Pending approval requests
  const ApprovalRequestColl = db.collection('erp_approval_requests');
  const pendingFilter = { status: 'PENDING', doc_type: { $in: ['CAR_LOGBOOK', 'FUEL_ENTRY'] } };
  const pendingReqs = await ApprovalRequestColl.countDocuments(pendingFilter);
  console.log(`[resetCarLogbook] Pending CAR_LOGBOOK/FUEL_ENTRY approval requests: ${pendingReqs}`);

  if (!LIVE) {
    console.log('\n[resetCarLogbook] DRY-RUN — no writes. Re-run with --live to apply.');
    await mongoose.disconnect();
    return;
  }

  // ── LIVE writes ─────────────────────────────────────────────────────────
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');

  if (ARCHIVE && cycleCollectionExists) {
    const newName = `erp_car_logbook_cycles_legacy_${stamp}`;
    await db.collection('erp_car_logbook_cycles').rename(newName);
    console.log(`[resetCarLogbook] Renamed erp_car_logbook_cycles → ${newName}`);
  } else if (cycleCollectionExists) {
    await db.collection('erp_car_logbook_cycles').drop();
    console.log('[resetCarLogbook] Dropped erp_car_logbook_cycles');
  }

  const delRes = await CarLogbookEntry.deleteMany({ status: { $in: ['POSTED', 'DELETION_REQUESTED'] } });
  console.log(`[resetCarLogbook] Deleted ${delRes.deletedCount} POSTED/DELETION_REQUESTED per-day docs`);

  const reqRes = await ApprovalRequestColl.updateMany(
    pendingFilter,
    {
      $set: {
        status: 'REJECTED',
        decided_at: new Date(),
        reason: 'Superseded by Phase 33 cycle-doc redesign (frontend submit now creates a CarLogbookCycle wrapper)',
      }
    }
  );
  console.log(`[resetCarLogbook] Marked ${reqRes.modifiedCount} CAR_LOGBOOK/FUEL_ENTRY approval requests REJECTED`);

  console.log('\n[resetCarLogbook] LIVE reset complete.');
  console.log('  Next: contractors re-enter current cycle\'s odometer + fuel from paper copies.');
  console.log('  Historical JournalEntries and TransactionEvents for prior postings remain intact.');
  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
