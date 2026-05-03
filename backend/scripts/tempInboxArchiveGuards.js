/**
 * TEMP — Archive [GUARD] messages for the president (per-recipient soft-archive).
 *
 * Safety contract:
 *   - DRY-RUN by default. Must pass --apply to write.
 *   - Per-user action only: pushes presidentUserId into archivedBy[]. Sender
 *     and other recipients are unaffected. Reversible — pull from archivedBy
 *     to un-archive.
 *   - Optional --soft-delete: ALSO sets deletion_candidate=true so the existing
 *     INBOX_RETENTION agent garbage-collects on its normal 2-stage schedule.
 *     Without this flag, archived messages stay in the DB indefinitely.
 *   - Scoped: only messages where title starts with "[GUARD]" AND president is
 *     a recipient (recipientUserId === president._id OR broadcast to
 *     ROLE_SETS.ADMIN_LIKE roles). Will NOT touch any other user's inbox.
 *   - Title prefix is overridable via --title-prefix='[GUARD]' if you want to
 *     widen later (e.g. to also archive 'Photo Audit:' digests).
 *
 * Usage (from backend/ on Lightsail):
 *   # Preview only — counts and a sample
 *   node scripts/tempInboxArchiveGuards.js
 *
 *   # Apply: archive + mark for retention-agent purge
 *   node scripts/tempInboxArchiveGuards.js --apply --soft-delete
 *
 *   # Apply: archive only (keeps rows in DB, just hides them from your inbox)
 *   node scripts/tempInboxArchiveGuards.js --apply
 *
 *   # Different recipient or pattern
 *   node scripts/tempInboxArchiveGuards.js --email=other@x.com --title-prefix='Photo Audit:' --apply
 *
 * Delete the script after triage.
 */
// Resolve .env relative to script location, not CWD. The repo's .env lives
// in backend/, so running from /var/www/vip-pharmacy-crm without `cd backend`
// would otherwise leave MONGO_URI undefined and crash on mongoose.connect().
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v === undefined ? true : v];
  })
);

const APPLY = !!args.apply;
const SOFT_DELETE = !!args['soft-delete'];
const EMAIL = args.email || 'yourpartner@viosintegrated.net';
const TITLE_PREFIX = args['title-prefix'] || '[GUARD]';

const ADMIN_LIKE = ['admin', 'finance', 'president', 'ceo'];

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const messages = db.collection('messages');
  const users = db.collection('users');

  const president = await users.findOne({ email: EMAIL });
  if (!president) {
    console.error(`!!! User not found: ${EMAIL}`);
    process.exit(1);
  }

  console.log('================================');
  console.log('Inbox Archive Tool');
  console.log('================================');
  console.log({
    user: EMAIL,
    userId: president._id.toString(),
    titlePrefix: TITLE_PREFIX,
    apply: APPLY,
    softDelete: SOFT_DELETE,
    mode: APPLY ? 'WRITE' : 'DRY-RUN',
  });

  // Build the safe scope: messages whose title starts with the prefix AND that
  // would actually appear in this user's inbox (targeted to them or broadcast
  // to one of the admin-like roles).
  const escapedPrefix = TITLE_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const titleFilter = { title: { $regex: `^${escapedPrefix}` } };
  const recipientFilter = {
    $or: [
      { recipientUserId: president._id },
      { recipientUserId: null, recipientRole: { $in: ADMIN_LIKE } },
    ],
  };
  // Don't double-archive
  const notYetArchived = { archivedBy: { $ne: president._id } };

  const matchFilter = { $and: [titleFilter, recipientFilter, notYetArchived] };

  const matchCount = await messages.countDocuments(matchFilter);
  console.log(`\nMatching messages: ${matchCount}`);

  if (matchCount === 0) {
    console.log('Nothing to do.');
    await mongoose.disconnect();
    return;
  }

  // Show top titles + date range so you know what you're about to archive
  const breakdown = await messages.aggregate([
    { $match: matchFilter },
    {
      $group: {
        _id: '$title',
        count: { $sum: 1 },
        oldest: { $min: '$createdAt' },
        newest: { $max: '$createdAt' },
      },
    },
    { $sort: { count: -1 } },
    { $limit: 20 },
  ]).toArray();

  console.log('\nTop 20 distinct titles in scope:');
  breakdown.forEach((row) => {
    console.log(
      `  ${row.count.toString().padStart(4)}  ${row._id}  (${row.oldest.toISOString().slice(0, 10)} → ${row.newest.toISOString().slice(0, 10)})`
    );
  });

  const range = await messages.aggregate([
    { $match: matchFilter },
    { $group: { _id: null, oldest: { $min: '$createdAt' }, newest: { $max: '$createdAt' } } },
  ]).toArray();
  console.log('\nDate range:', range[0]);

  if (!APPLY) {
    console.log('\n--- DRY RUN — no writes performed. Re-run with --apply to archive. ---');
    await mongoose.disconnect();
    return;
  }

  // WRITE PHASE
  const update = {
    $addToSet: { archivedBy: president._id, readBy: president._id },
  };
  if (SOFT_DELETE) {
    update.$set = { deletion_candidate: true, deletion_candidate_at: new Date() };
  }

  console.log('\nApplying update...');
  const result = await messages.updateMany(matchFilter, update);
  console.log({ matched: result.matchedCount, modified: result.modifiedCount });

  // Verify
  const remaining = await messages.countDocuments(matchFilter);
  console.log({ remainingAfterUpdate: remaining });

  console.log('\n--- DONE. Refresh your inbox. To undo, run: ---');
  console.log(`  db.messages.updateMany(${JSON.stringify(matchFilter)}, { $pull: { archivedBy: ObjectId('${president._id}') }, $set: { deletion_candidate: false, deletion_candidate_at: null } })`);

  await mongoose.disconnect();
})().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});
