/**
 * Phase G9.A — one-time migration.
 *
 * Run with:   node backend/scripts/backfillMessageInboxEntityId.js
 *   or:       node backend/scripts/backfillMessageInboxEntityId.js --dry-run
 *
 * Backfills the new fields added in G9.A on pre-existing MessageInbox rows:
 *   - entity_id     (derived from recipient user's entity_id, fallback first user's entity)
 *   - folder        (derived from category via CATEGORY_TO_FOLDER map)
 *   - requires_action (false for legacy rows — legacy rows predate action affordances)
 *
 * Idempotent — safe to re-run. Only touches rows that are missing entity_id
 * or folder; action fields are additive with sensible defaults from the
 * schema.
 *
 * Ordering: run this AFTER deploying the MessageInbox.js schema change and
 * BEFORE flipping notifyApprovalRequest / notifyDocumentPosted to
 * dispatchMultiChannel (G9.B). Otherwise first-hour G9.B writes land with
 * entity_id=null and the new composite index on
 * (entity_id, recipientRole, ...) skips them.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const MessageInbox = require('../models/MessageInbox');
const User = require('../models/User');

const DRY_RUN = process.argv.includes('--dry-run');

// Category → Folder mapping. Mirrors the write-time derivation used by
// persistInApp in G9.B. Any category not in this map falls through to INBOX.
// MUST stay in sync with backend/erp/utils/inboxLookups.js CATEGORY_TO_FOLDER.
// Phase G9.R11 (Apr 30 2026) — briefing moved to EXECUTIVE_BRIEF;
// inventory_alert / proxy_sla_alert / proxy_auto_ack / data_quality routed
// to AI_AGENT_REPORTS (previously fell through to INBOX).
const CATEGORY_TO_FOLDER = {
  announcement: 'ANNOUNCEMENTS',
  system: 'ANNOUNCEMENTS',
  policy: 'ANNOUNCEMENTS',

  payroll: 'APPROVALS',
  leave: 'APPROVALS',
  approval_request: 'APPROVALS',
  approval_decision: 'APPROVALS',
  document_posted: 'APPROVALS',

  briefing: 'EXECUTIVE_BRIEF',

  compliance_alert: 'AI_AGENT_REPORTS',
  ai_coaching: 'AI_AGENT_REPORTS',
  ai_schedule: 'AI_AGENT_REPORTS',
  ai_alert: 'AI_AGENT_REPORTS',
  ai_agent_finding: 'AI_AGENT_REPORTS',
  compensation: 'AI_AGENT_REPORTS',
  kpiVariance: 'AI_AGENT_REPORTS',
  inventory_alert: 'AI_AGENT_REPORTS',
  proxy_sla_alert: 'AI_AGENT_REPORTS',
  proxy_auto_ack: 'AI_AGENT_REPORTS',
  data_quality: 'AI_AGENT_REPORTS',

  task_assigned: 'TASKS',
  task_overdue: 'TASKS',
  task_completed: 'TASKS',
  task_reassigned: 'TASKS',
  task_comment: 'TASKS',

  chat: 'CHAT',
  reply: 'CHAT',
};

function folderForCategory(category) {
  if (!category) return 'INBOX';
  return CATEGORY_TO_FOLDER[String(category)] || 'INBOX';
}

async function run() {
  if (!process.env.MONGO_URI) {
    console.error('[backfillMessageInbox] MONGO_URI not set. Aborting.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log(`[backfillMessageInbox] Connected. DRY_RUN=${DRY_RUN}`);

  const coll = MessageInbox.collection;
  const total = await coll.countDocuments({});
  const missingEntity = await coll.countDocuments({
    $or: [{ entity_id: { $exists: false } }, { entity_id: null }],
  });
  const missingFolder = await coll.countDocuments({
    $or: [{ folder: { $exists: false } }, { folder: null }, { folder: '' }],
  });
  console.log(`[backfillMessageInbox] rows=${total} missing_entity=${missingEntity} missing_folder=${missingFolder}`);

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

  // Stream through rows that need backfill; batch the writes.
  const cursor = coll.find(
    {
      $or: [
        { entity_id: { $exists: false } },
        { entity_id: null },
        { folder: { $exists: false } },
        { folder: null },
        { folder: '' },
      ],
    },
    {
      projection: {
        _id: 1,
        recipientUserId: 1,
        senderUserId: 1,
        category: 1,
        folder: 1,
        entity_id: 1,
      },
    }
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
    const update = {};

    if (!row.entity_id) {
      const eid = (await resolveEntityIdForUser(row.recipientUserId))
        || (await resolveEntityIdForUser(row.senderUserId));
      if (eid) update.entity_id = eid;
      else skippedNoEntity += 1;
    }

    if (!row.folder) {
      update.folder = folderForCategory(row.category);
    }

    if (Object.keys(update).length === 0) continue;

    bulkOps.push({
      updateOne: {
        filter: { _id: row._id },
        update: { $set: update },
      },
    });
    if (bulkOps.length >= FLUSH_AT) await flush();
  }
  await flush();

  console.log(`[backfillMessageInbox] updated=${updated} skipped_no_entity=${skippedNoEntity} dry_run=${DRY_RUN}`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('[backfillMessageInbox] fatal:', err);
  process.exit(1);
});
