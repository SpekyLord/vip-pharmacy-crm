/**
 * CLMSession Model
 *
 * Closed Loop Marketing session — tracks when a BDM presents the
 * Online Pharmacy Partnership pitch to a doctor (VIP Client).
 *
 * Key features:
 * - Slide-level engagement tracking (time per slide, interactions)
 * - Dynamic product selection from CRM (scalable, not hardcoded)
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

const productPresentedSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CrmProduct',
      required: true,
    },
    // Snapshot fields — so the record remains valid even if the product is later edited/deleted
    productName: { type: String, trim: true },
    productGenericName: { type: String, trim: true },
    productDosage: { type: String, trim: true },
    productImage: { type: String, trim: true },
    // Engagement
    interestShown: { type: Boolean, default: false },
    timeSpentMs: { type: Number, default: 0 },
    notes: { type: String, trim: true, maxlength: 500 },
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

    // ── Products presented (scalable — pulled from CRM) ─────────────
    productsPresented: [productPresentedSchema],

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
    totalSlides: { type: Number, default: 6 },

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

    // ── Offline sync idempotency ────────────────────────────────────
    // Generated client-side when a session is created offline (UUIDv4 shape).
    // Used to detect duplicate sync attempts (BDM syncs same draft twice).
    // Null for sessions created while online (no conflict risk).
    // maxlength bounds a hostile client from writing megabytes into the index.
    idempotencyKey: {
      type: String,
      trim: true,
      maxlength: 128,
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
clmSessionSchema.index({ 'productsPresented.product': 1 });
// Sparse unique index on idempotencyKey — prevents duplicate offline syncs
// Only applies to sessions created offline (key is null for online sessions)
clmSessionSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('CLMSession', clmSessionSchema);
