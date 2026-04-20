/**
 * MessageInbox Model (Aligned to your actual DB fields)
 *
 * Matches your Mongo document keys:
 * - body (NOT "message")
 * - recipientUserId (singular)
 * - readBy: [ObjectId] (simple)
 * - isArchived (NOT isActive/expiresAt)
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

    // ✅ MATCH DB FIELD NAME
    isArchived: {
      type: Boolean,
      default: false,
      index: true,
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

// Useful indexes for inbox queries
messageInboxSchema.index({
  recipientRole: 1,
  recipientUserId: 1,
  isArchived: 1,
  createdAt: -1,
});
messageInboxSchema.index({ category: 1, createdAt: -1 });
messageInboxSchema.index({ priority: 1, createdAt: -1 });

// Phase G9.A — entity-scoped primary list index (drives /api/messages for all roles)
messageInboxSchema.index({
  entity_id: 1,
  recipientRole: 1,
  recipientUserId: 1,
  isArchived: 1,
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

// Text search (title + body + senderName)
messageInboxSchema.index({ title: "text", body: "text", senderName: "text" });

/**
 * Static: find visible messages for a role (and optional userId)
 * - Shows broadcast messages (recipientUserId missing/null)
 * - Shows targeted messages (recipientUserId === userId)
 */
messageInboxSchema.statics.findVisibleFor = function ({ role, userId }) {
  const query = {
    recipientRole: role,
    isArchived: false,
    $or: [
      { recipientUserId: { $exists: false } },
      { recipientUserId: null },
      ...(userId ? [{ recipientUserId: new mongoose.Types.ObjectId(userId) }] : []),

    ],
  };

  return this.find(query).sort({ createdAt: -1 });
};

messageInboxSchema.statics.findSentBy = function ({ senderUserId }) {
  return this.find({
    isArchived: false,
    senderUserId: new mongoose.Types.ObjectId(senderUserId),
  }).sort({ createdAt: -1 });
};

const MessageInbox = mongoose.models.MessageInbox || mongoose.model("MessageInbox", messageInboxSchema, "messages");

module.exports = MessageInbox;
