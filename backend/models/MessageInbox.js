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
      enum: {
        values: ["announcement", "payroll", "leave", "policy", "system", "compliance_alert", "other"],
        message: "Invalid message category",
      },
      default: "announcement",
      index: true,
    },

    // Importance
    priority: {
      type: String,
      enum: {
        values: ["normal", "important"],
        message: "Invalid priority",
      },
      default: "normal",
      index: true,
    },

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

const MessageInbox = mongoose.model("MessageInbox", messageInboxSchema, "messages");


module.exports = MessageInbox;
