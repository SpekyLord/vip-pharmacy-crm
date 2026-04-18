/**
 * DataDeletionRequest Model
 *
 * Tracks Facebook Data Deletion Callback requests so users can check status
 * at /data-deletion/status/:code. Spec:
 * https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback
 */

const mongoose = require('mongoose');
const crypto = require('crypto');

const deletedCountsSchema = new mongoose.Schema(
  {
    communicationLogs: { type: Number, default: 0 },
    doctorsUpdated: { type: Number, default: 0 },
    clientsUpdated: { type: Number, default: 0 },
  },
  { _id: false }
);

const dataDeletionRequestSchema = new mongoose.Schema(
  {
    // Short public code returned to Meta and surfaced at /data-deletion/status/:code
    confirmationCode: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // Platform that originated the request (future: viber, whatsapp)
    platform: {
      type: String,
      enum: ['facebook', 'whatsapp', 'viber', 'manual'],
      default: 'facebook',
    },

    // Platform-specific user identifier (PSID for Facebook/Messenger)
    externalUserId: {
      type: String,
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: ['pending', 'completed', 'failed'],
      default: 'pending',
    },

    requestedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },

    deletedCounts: { type: deletedCountsSchema, default: () => ({}) },

    errorMessage: { type: String, default: null },
  },
  { timestamps: true }
);

// Helper for service code
dataDeletionRequestSchema.statics.generateConfirmationCode = function () {
  return crypto.randomBytes(12).toString('hex');
};

module.exports = mongoose.model('DataDeletionRequest', dataDeletionRequestSchema);
