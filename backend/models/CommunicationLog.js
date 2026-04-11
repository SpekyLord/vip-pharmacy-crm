/**
 * CommunicationLog Model
 *
 * Tracks BDM interactions with VIP Clients (doctors) and Regular Clients
 * outside of formal visits — Viber, Messenger, WhatsApp, Email, Google Chat.
 *
 * Two source modes:
 *   - manual: BDM uploads screenshot proof (like visit photos)
 *   - api:    Auto-logged from messaging API integrations (Phase 2)
 */

const mongoose = require('mongoose');

const communicationLogSchema = new mongoose.Schema(
  {
    // References — at least one of doctor/client is required (pre-validate below)
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
      default: null,
    },
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      default: null,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User (BDM) is required'],
    },

    // Channel and direction (lookup-driven: COMM_CHANNEL, COMM_DIRECTION)
    channel: {
      type: String,
      required: [true, 'Communication channel is required'],
      trim: true,
    },
    direction: {
      type: String,
      enum: {
        values: ['outbound', 'inbound'],
        message: 'Direction must be outbound or inbound',
      },
      default: 'outbound',
    },

    // Content
    notes: {
      type: String,
      maxlength: [2000, 'Notes cannot exceed 2000 characters'],
    },
    contactedAt: {
      type: Date,
      required: [true, 'Contact date is required'],
      default: Date.now,
    },

    // Source mode
    source: {
      type: String,
      enum: {
        values: ['manual', 'api'],
        message: 'Source must be manual or api',
      },
      default: 'manual',
    },

    // API-specific fields (Phase 2)
    messageContent: {
      type: String,
      maxlength: [5000, 'Message content cannot exceed 5000 characters'],
    },
    externalMessageId: {
      type: String,
      trim: true,
    },
    deliveryStatus: {
      type: String,
      enum: {
        values: ['sent', 'delivered', 'read', 'failed'],
        message: 'Delivery status must be sent, delivered, read, or failed',
      },
    },

    // Screenshot proof (same schema as Visit.photos)
    photos: {
      type: [
        {
          url: { type: String, required: true },
          capturedAt: { type: Date, required: true },
          source: { type: String, default: 'gallery' },
          hash: { type: String },
        },
      ],
      default: [],
    },

    // Status
    status: {
      type: String,
      enum: {
        values: ['logged', 'archived'],
        message: 'Status must be logged or archived',
      },
      default: 'logged',
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Pre-validate: at least one of doctor or client must be set ──
communicationLogSchema.pre('validate', function (next) {
  if (!this.doctor && !this.client) {
    this.invalidate('doctor', 'At least one of doctor or client is required');
  }
  // Manual logs require at least 1 screenshot
  if (this.source === 'manual' && (!this.photos || this.photos.length === 0)) {
    this.invalidate('photos', 'At least one screenshot is required for manual logs');
  }
  if (this.source === 'manual' && this.photos && this.photos.length > 10) {
    this.invalidate('photos', 'Maximum 10 screenshots per log');
  }
  // API logs require message content
  if (this.source === 'api' && !this.messageContent) {
    this.invalidate('messageContent', 'Message content is required for API-sent messages');
  }
  next();
});

// ── Indexes ──
communicationLogSchema.index({ user: 1, contactedAt: -1 });
communicationLogSchema.index({ doctor: 1, contactedAt: -1 });
communicationLogSchema.index({ client: 1, contactedAt: -1 });
communicationLogSchema.index({ channel: 1, contactedAt: -1 });
communicationLogSchema.index({ user: 1, status: 1, contactedAt: -1 });
communicationLogSchema.index({ externalMessageId: 1 }, { sparse: true });

// ── Virtuals ──
communicationLogSchema.virtual('clientType').get(function () {
  if (this.doctor) return 'vip';
  if (this.client) return 'regular';
  return null;
});

communicationLogSchema.virtual('clientRef').get(function () {
  return this.doctor || this.client;
});

// ── Statics ──
communicationLogSchema.statics.getByDoctor = function (doctorId, options = {}) {
  const query = { doctor: doctorId, status: 'logged' };
  if (options.channel) query.channel = options.channel;
  return this.find(query)
    .populate('user', 'name email')
    .sort({ contactedAt: -1 });
};

communicationLogSchema.statics.getByClient = function (clientId, options = {}) {
  const query = { client: clientId, status: 'logged' };
  if (options.channel) query.channel = options.channel;
  return this.find(query)
    .populate('user', 'name email')
    .sort({ contactedAt: -1 });
};

communicationLogSchema.statics.getByUser = function (userId, options = {}) {
  const query = { user: userId, status: 'logged' };
  if (options.channel) query.channel = options.channel;
  if (options.startDate || options.endDate) {
    query.contactedAt = {};
    if (options.startDate) query.contactedAt.$gte = new Date(options.startDate);
    if (options.endDate) query.contactedAt.$lte = new Date(options.endDate);
  }
  return this.find(query)
    .populate('doctor', 'firstName lastName specialization')
    .populate('client', 'firstName lastName specialization')
    .sort({ contactedAt: -1 });
};

const CommunicationLog = mongoose.model('CommunicationLog', communicationLogSchema);

module.exports = CommunicationLog;
