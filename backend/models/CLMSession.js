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

    // Multi-entity scoping. Sparse + non-required in this PR to survive the
    // backfill window; flip to required in a follow-up after backfillClmEntityId
    // --apply has been run on prod. First CRM-side model with entity scoping —
    // sets the precedent for Doctor/Visit/CommLog/MessageInbox retrofits.
    entity_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Entity',
      index: true,
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

    // ── Phase N — Mode (in-person vs remote shareable deck) ─────────
    // 'in_person'  — BDM presents face-to-face. QR + GPS + photo path applies.
    //                Existing default — preserves backward compat for every
    //                CLM session created before Phase N.
    // 'remote'     — BDM generates a public deck link and shares it via
    //                Viber/Messenger/WhatsApp. No GPS, no photo, no
    //                in-person requirement. The CommunicationLog row is
    //                what carries proof in this case (clm_session_id ref).
    mode: {
      type: String,
      enum: ['in_person', 'remote'],
      default: 'in_person',
    },

    // ── Phase N — Reciprocal FK to Visit ────────────────────────────
    // Set during the merged in-person flow: VisitLogger's "Start Presentation"
    // generates a UUID, CLMSession picks it up as idempotencyKey, then on
    // Visit submit the visitController back-stamps this field. Sparse so
    // remote and standalone CLM sessions don't bloat the index.
    // Note: explicit sparse index declared below (clmSessionSchema.index calls)
    visit_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Visit',
    },

    // ── Phase N — Public deck open tracking (anonymous viewers) ─────
    // Stamped by GET /api/clm/deck/:id whenever an unauthenticated viewer
    // hits the public route. Distinct from qrDisplayedAt (which fires on
    // slide 6 in the BDM's in-person flow). Both can be set on the same
    // session — qrDisplayedAt = "BDM showed it", deckOpenedAt = "remote
    // viewer opened the public link".
    deckOpenedAt: { type: Date },
    deckOpenCount: { type: Number, default: 0 },

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
clmSessionSchema.index({ entity_id: 1, user: 1, createdAt: -1 });
// Sparse unique index on idempotencyKey — prevents duplicate offline syncs
// Only applies to sessions created offline (key is null for online sessions)
clmSessionSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });
// Phase N — sparse so standalone CLM sessions (no merged Visit) don't bloat the index
clmSessionSchema.index({ visit_id: 1 }, { sparse: true });
clmSessionSchema.index({ mode: 1, status: 1 });

module.exports = mongoose.model('CLMSession', clmSessionSchema);
