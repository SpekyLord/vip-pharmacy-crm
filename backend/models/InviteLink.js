/**
 * InviteLink Model — Phase M1 (Apr 2026)
 *
 * Tracks branded deep-link invitations sent by BDMs to VIP Clients/Regular Clients.
 * Flow: BDM taps "Invite via Messenger" → server generates `m.me/<page>?ref=doc_<id>`
 * → logs this record → BDM shares the link. When target taps + sends first message,
 * the webhook reads the `ref` param, binds the external ID to the Doctor, stamps
 * consent, and flips this record to `status: converted`.
 *
 * See docs/PHASE-TASKS-CRM.md Phase M1 for the full contract.
 */

const mongoose = require('mongoose');

const inviteLinkSchema = new mongoose.Schema(
  {
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', default: null, index: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null, index: true },

    channel: {
      type: String,
      required: true,
      enum: ['MESSENGER', 'VIBER', 'WHATSAPP', 'EMAIL', 'SMS'],
      index: true,
    },

    // The `ref` / `context` value embedded in the deep link. Format: `doc_<doctorId>` or `cli_<clientId>`.
    ref: { type: String, required: true, index: true },

    // The generated deep link URL (for Messenger/Viber/WhatsApp — shareable m.me / viber:// / wa.me).
    // For EMAIL, this is the rendered email HTML is not stored here; only the tracking pixel URL.
    linkUrl: { type: String, required: true },

    // Template used (from INVITE_TEMPLATES lookup). Null if custom message.
    templateKey: { type: String, default: null },

    // For EMAIL channel, the unsubscribe token embedded in the email footer (JWT).
    unsubscribeToken: { type: String, default: null },

    sentAt: { type: Date, default: Date.now },
    sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // Lifecycle timestamps (nullable; set by webhook)
    openedAt: { type: Date, default: null },
    repliedAt: { type: Date, default: null },

    status: {
      type: String,
      enum: ['sent', 'opened', 'converted', 'expired'],
      default: 'sent',
      index: true,
    },
  },
  { collection: 'invitelinks', timestamps: true }
);

// Auto-expire after 180 days (TTL on sentAt)
inviteLinkSchema.index({ sentAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 });

// Fast lookup by ref (webhook reads every inbound event)
inviteLinkSchema.index({ ref: 1, status: 1 });

module.exports = mongoose.model('InviteLink', inviteLinkSchema);
