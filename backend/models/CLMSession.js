/**
 * CLMSession Model
 *
 * Closed Loop Marketing session — tracks when a BDM presents the
 * Online Pharmacy Partnership pitch to a doctor (VIP Client).
 *
 * Key features:
 * - Slide-level engagement tracking (time per slide, interactions)
 * - Facebook Messenger QR scan conversion tracking
 * - BDM notes and interest-level scoring
 * - Follow-up scheduling
 */
const mongoose = require('mongoose');

const slideEventSchema = new mongoose.Schema(
  {
    slideIndex: { type: Number, required: true },
    slideTitle: { type: String, trim: true },
    enteredAt: { type: Date, required: true },
    exitedAt: { type: Date },
    durationMs: { type: Number, default: 0 },
    interactions: [
      {
        type: { type: String, trim: true },   // 'tap', 'expand', 'calculate', etc.
        timestamp: { type: Date },
        data: { type: mongoose.Schema.Types.Mixed },
      },
    ],
  },
  { _id: false }
);

const clmSessionSchema = new mongoose.Schema(
  {
    // ── References ──────────────────────────────────────────────────
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'BDM user is required'],
    },
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
      required: [true, 'Doctor (VIP Client) is required'],
    },

    // ── Session timing ──────────────────────────────────────────────
    startedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    endedAt: { type: Date },
    totalDurationMs: { type: Number, default: 0 },

    // ── Slide engagement ────────────────────────────────────────────
    slideEvents: [slideEventSchema],
    slidesViewedCount: { type: Number, default: 0 },
    totalSlides: { type: Number, default: 9 },

    // ── Messenger QR conversion ─────────────────────────────────────
    messengerRef: { type: String, trim: true },   // e.g. CLM_<sessionId>_<doctorId>_<userId>
    qrDisplayedAt: { type: Date },
    qrScanned: { type: Boolean, default: false },
    qrScannedAt: { type: Date },

    // ── BDM post-session input ──────────────────────────────────────
    interestLevel: {
      type: Number,
      min: 1,
      max: 5,
    },
    bdmNotes: { type: String, trim: true, maxlength: 2000 },
    followUpDate: { type: Date },
    outcome: {
      type: String,
      enum: ['interested', 'maybe', 'not_interested', 'already_partner', 'reschedule'],
      default: 'maybe',
    },

    // ── Location (from device GPS) ──────────────────────────────────
    location: {
      lat: { type: Number },
      lng: { type: Number },
    },

    // ── Status ──────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ['in_progress', 'completed', 'abandoned'],
      default: 'in_progress',
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for common queries
clmSessionSchema.index({ user: 1, createdAt: -1 });
clmSessionSchema.index({ doctor: 1, createdAt: -1 });
clmSessionSchema.index({ status: 1 });
clmSessionSchema.index({ qrScanned: 1 });

module.exports = mongoose.model('CLMSession', clmSessionSchema);
