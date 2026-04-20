/**
 * MessageInbox Model (Aligned to your actual DB fields)
 *
 * Matches your Mongo document keys:
 * - body (NOT "message")
 * - recipientUserId (singular)
 * - readBy: [ObjectId] (simple, per-recipient)
 * - archivedBy: [ObjectId] (per-recipient — was a single `isArchived` bool pre-Apr 2026)
 * - acknowledgedBy: [{user, at}] (per-recipient, timestamped — Apr 2026)
 *
 * Per-recipient archive + acknowledge (Phase G9.R8 — Apr 2026):
 *   - Archive is a per-user action: one recipient archiving only hides the message
 *     from THEIR inbox view. Matches Gmail/Slack semantics. Migration script at
 *     backend/scripts/migrateInboxArchived.js backfills archivedBy from the old
 *     `isArchived` bool.
 *   - must_acknowledge + acknowledgedBy prove a recipient actually clicked
 *     "I acknowledge this" (not just opened the message). Defaulted lookup-driven
 *     by category / requires_action / sender role at pre-save (see hook below).
 *   - Action-gate: frontend (InboxThreadView) disables Approve/Reject/Resolve
 *     buttons until the current user appears in acknowledgedBy.
 *
 * Retention hygiene (Phase G9.R8):
 *   - deletion_candidate + deletion_candidate_at mark soft-delete in stage 1 of
 *     the retention agent (backend/erp/services/messageRetentionAgent.js). Stage 2
 *     hard-deletes after grace period expires. Lookup-driven (INBOX_RETENTION).
 *
 * Also includes a helper static: findVisibleFor({ role, userId })
 */

const mongoose = require("mongoose");

const messageInboxSchema = new mongoose.Schema(
  {
    // Who sent it (display name)
    senderName: {
      type: String,
      trim: true,
      maxlength: [100, "Sender name cannot exceed 100 characters"],
      default: "Admin",
    },

    

    // Optional role string (your DB has senderRole)
    senderRole: {
      type: String,
      trim: true,
      default: "admin",
      index: true,
    },

    senderUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
      default: null,
    },


    // Title/subject
    title: {
      type: String,
      required: [true, "Message title is required"],
      trim: true,
      maxlength: [200, "Title cannot exceed 200 characters"],
    },

    // ✅ MATCH DB FIELD NAME
    body: {
      type: String,
      required: [true, "Message body is required"],
      maxlength: [5000, "Message body cannot exceed 5000 characters"],
    },

    // Category/type (used by chips/filters)
    category: {
      type: String,
      required: [true, "Category is required"],
      default: "announcement",
      index: true,
    }, // Lookup: MESSAGE_CATEGORY

    // Importance
    priority: {
      type: String,
      default: "normal",
      index: true,
    }, // Lookup: MESSAGE_PRIORITY

    


    // Targeting by role
    recipientRole: {
      type: String,
      required: [true, "recipientRole is required"],
      trim: true,
      index: true,
    },

    // ✅ MATCH DB FIELD NAME (singular)
    // If null/undefined => broadcast to all users in recipientRole
    recipientUserId: {
      type: mongoose.Schema.Types.ObjectId, // matches DB ObjectId
      ref: "User",
      index: true,
      default: null,
    },



    // ✅ MATCH DB SHAPE (simple array)
    // Read if currentUserId is inside readBy
    readBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        index: true,
      },
    ],

    // ── Phase G9.R8 — Per-recipient archive (Apr 2026) ──────────────────
    // Replaces the former single `isArchived: Boolean` field. A message is
    // hidden from a given user's inbox iff that user's _id is in archivedBy.
    // Sender-side (SENT folder) is NOT affected by this filter — sent folder
    // always shows every message the user sent.
    archivedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        index: true,
      },
    ],

    // ── Phase G9.R8 — Acknowledge (Apr 2026) ────────────────────────────
    // must_acknowledge: flagged at compose time OR by the pre-save hook
    // (lookup-driven INBOX_ACK_DEFAULTS). When true:
    //   - Recipients see an "I acknowledge this" button in the thread view.
    //   - Approve/Reject/Resolve action buttons are disabled until the
    //     current user appears in acknowledgedBy (frontend gate; server-side
    //     enforcement could be added later if bypass becomes a concern).
    //   - Retention agent never auto-purges unacknowledged must-ack messages
    //     (safety guard in messageRetentionAgent.js).
    must_acknowledge: {
      type: Boolean,
      default: false,
      index: true,
    },
    // Per-recipient ack log. Each entry = {user, at} so we keep an audit
    // trail of WHO ack'd and WHEN (important for compliance broadcasts).
    // Idempotent: controller skips if user is already in the list.
    acknowledgedBy: [
      {
        _id: false,
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          index: true,
        },
        at: { type: Date, default: Date.now },
      },
    ],

    // ── Phase G9.R8 — Retention soft-delete (Apr 2026) ──────────────────
    // Stage 1: nightly retention agent sets deletion_candidate=true and
    // deletion_candidate_at=now on messages matching purge rules.
    // Stage 2: next run hard-deletes rows where deletion_candidate_at is
    // older than INBOX_RETENTION.GRACE_PERIOD_DAYS. Two-stage pattern gives
    // admins a window to review/restore before permanent deletion.
    deletion_candidate: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletion_candidate_at: {
      type: Date,
      default: null,
    },

    // ── Phase G9.A extensions ──
    // Multi-tenant scoping. Nullable for pre-G9 rows (backfilled by
    // backend/scripts/backfillMessageInboxEntityId.js). Required for new
    // writes once migration is green. All list queries filter by this.
    entity_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Entity",
      index: true,
      default: null,
    },

    // Groups replies into one conversation. Usually set to the first
    // message's _id on reply; for approval-linked threads we reuse the
    // ApprovalRequest._id so approve / decision / reopen rows thread
    // together without extra lookups.
    thread_id: {
      type: mongoose.Schema.Types.ObjectId,
      index: true,
      default: null,
    },
    parent_message_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MessageInbox",
      default: null,
    },

    // Action affordance — set when the recipient is expected to DO something
    // (approve, resolve, reply, acknowledge, open a linked page). Drives the
    // red-dot in the inbox UI and the [Approve]/[Resolve] button row.
    requires_action: {
      type: Boolean,
      default: false,
      index: true,
    },
    // Lookup: MESSAGE_ACTIONS — label/variant/confirm/api_path in metadata
    action_type: {
      type: String,
      default: null,
    },
    action_payload: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    action_completed_at: {
      type: Date,
      default: null,
    },
    action_completed_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // Lookup: MESSAGE_FOLDERS — INBOX/ACTION_REQUIRED/APPROVALS/TASKS/
    // AI_AGENT_REPORTS/ANNOUNCEMENTS/CHAT/SENT/ARCHIVE. Derived from
    // category at write time; stored to keep list queries single-index.
    folder: {
      type: String,
      default: "INBOX",
      index: true,
    },
  },
  {
    timestamps: true, // createdAt + updatedAt
  }
);

// Useful indexes for inbox queries.
//
// Note (Phase G9.R8): the old compound indexes keyed on `isArchived` were
// dropped because the field is gone. We don't add compound indexes on
// `archivedBy` because:
//   (a) it's an array — multikey compounds are expensive to maintain, and
//   (b) the `$ne: req.user._id` filter (the common "hide archived from my
//       view" path) already benefits from the simple `archivedBy` index on
//       the array field itself (declared inline above).
messageInboxSchema.index({
  recipientRole: 1,
  recipientUserId: 1,
  createdAt: -1,
});
messageInboxSchema.index({ category: 1, createdAt: -1 });
messageInboxSchema.index({ priority: 1, createdAt: -1 });

// Phase G9.A — entity-scoped primary list index (drives /api/messages for all roles)
messageInboxSchema.index({
  entity_id: 1,
  recipientRole: 1,
  recipientUserId: 1,
  createdAt: -1,
});
// Phase G9.A — folder-scoped list (Inbox / Tasks / Approvals tabs)
messageInboxSchema.index({ entity_id: 1, folder: 1, createdAt: -1 });
// Phase G9.A — Action Required queue
messageInboxSchema.index({
  entity_id: 1,
  requires_action: 1,
  action_completed_at: 1,
  createdAt: -1,
});
// Phase G9.A — thread view
messageInboxSchema.index({ thread_id: 1, createdAt: 1 });

// Phase G9.R8 — must_ack outstanding list (powers read-receipts dashboard +
// unacknowledged folder counts). Partial index keeps it small: only rows
// flagged must_acknowledge are indexed.
messageInboxSchema.index(
  { entity_id: 1, must_acknowledge: 1, createdAt: -1 },
  { partialFilterExpression: { must_acknowledge: true } }
);

// Phase G9.R8 — retention agent pickup index. Partial index on soft-deleted
// rows so the agent's stage-2 hard-delete scan stays O(candidates), not
// O(all messages).
messageInboxSchema.index(
  { deletion_candidate: 1, deletion_candidate_at: 1 },
  { partialFilterExpression: { deletion_candidate: true } }
);

// Text search (title + body + senderName)
messageInboxSchema.index({ title: "text", body: "text", senderName: "text" });

/**
 * Static: find visible messages for a role (and optional userId)
 * - Shows broadcast messages (recipientUserId missing/null)
 * - Shows targeted messages (recipientUserId === userId)
 *
 * Phase G9.R8: archived-filter is now per-user. Given `userId` we exclude
 * messages the caller has archived. Callers without `userId` (system/cron)
 * see everything.
 */
messageInboxSchema.statics.findVisibleFor = function ({ role, userId }) {
  const query = {
    recipientRole: role,
    $or: [
      { recipientUserId: { $exists: false } },
      { recipientUserId: null },
      ...(userId ? [{ recipientUserId: new mongoose.Types.ObjectId(userId) }] : []),
    ],
  };
  if (userId) {
    query.archivedBy = { $ne: new mongoose.Types.ObjectId(userId) };
  }
  return this.find(query).sort({ createdAt: -1 });
};

/**
 * Sent folder — ALL messages user sent, regardless of any recipient's
 * archive state. Sender-side view is independent of per-recipient archive
 * (consistent with Gmail/Slack "Sent" semantics).
 */
messageInboxSchema.statics.findSentBy = function ({ senderUserId }) {
  return this.find({
    senderUserId: new mongoose.Types.ObjectId(senderUserId),
  }).sort({ createdAt: -1 });
};

/**
 * Phase G9.R8 — Pre-save hook: default must_acknowledge based on lookup-driven
 * INBOX_ACK_DEFAULTS rules (per-entity, configurable via Control Center).
 *
 * Rules (evaluated in order; first match flips must_acknowledge=true):
 *   1. category matches an ACK-required category (AI agent report by default)
 *   2. requires_action === true (tasks / approvals)
 *   3. sender role is in the ack-broadcast-roles list (president / admin by default)
 *
 * Callers may explicitly set must_acknowledge (true OR false) at compose time;
 * the hook only fires when the field was not touched by the caller (isModified
 * check). Admin override at compose time wins — subscribers edit defaults via
 * Control Center → Lookup Tables → INBOX_ACK_DEFAULTS.
 */
messageInboxSchema.pre('save', async function preSaveAckDefault(next) {
  try {
    if (!this.isNew) return next();
    // Caller explicitly set must_acknowledge — respect the choice.
    if (this.isModified('must_acknowledge')) return next();

    // Lazy-require to avoid circular imports (the lookup helper also requires
    // the Lookup model which requires mongoose which is... right here).
    const { evaluateAckDefault } = require('../erp/utils/inboxAckDefaults');
    const shouldAck = await evaluateAckDefault({
      entity_id: this.entity_id,
      category: this.category,
      requires_action: this.requires_action,
      senderRole: this.senderRole,
    });
    if (shouldAck) this.must_acknowledge = true;
    next();
  } catch (err) {
    // Pre-save hooks must never block writes on a config read failure.
    // Log and continue with must_acknowledge=false (caller-supplied or default).
    console.warn('[MessageInbox] ack-default hook failed:', err.message);
    next();
  }
});

const MessageInbox = mongoose.models.MessageInbox || mongoose.model("MessageInbox", messageInboxSchema, "messages");

module.exports = MessageInbox;
