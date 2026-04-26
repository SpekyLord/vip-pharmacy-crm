/**
 * PatientMdAttribution — Phase VIP-1.B (Apr 2026), populated by VIP-1.D
 *
 * Stub model for VIP-1.B; the actual storefront patient ↔ MD attribution
 * sync runs in VIP-1.D (Mongo change-stream listener on Order.paid). VIP-1.B
 * defines the schema so the rebateAccrualEngine can reference it; rows are
 * populated empty in dev until VIP-1.D ships.
 *
 * Purpose: establish the patient-level attribution that drives Tier-B
 * (capitation) rebate accrual in the storefront flow. When a patient orders
 * a non-Tier-A product, the engine looks up which MD they're attributed to
 * via this table and applies the matching MdCapitationRule.
 *
 * Attribution sources (lead_source-style enum):
 *   RX_PARSE              — extracted from prescription OCR on the order
 *   CUSTOMER_ATTESTATION  — customer self-reports their MD at checkout
 *   STAFF_ENTRY           — pharmacist tags the order with the MD post-fact
 *   IMPORT                — bulk historical attribution import
 *   OTHER                 — escape hatch
 *
 * Why denormalize ship_to_province:
 *   AREA_BDM commission flow (StaffCommissionRule.payee_role='AREA_BDM') needs
 *   to resolve the geographic territory from the order. Storing province on
 *   the attribution row avoids a cross-document join on every commission
 *   accrual. Updated whenever the patient's primary ship-to changes (sync logic
 *   in VIP-1.D listener).
 *
 * Compound key:
 *   (entity_id, patient_id, doctor_id) — a patient can be attributed to
 *   multiple MDs over time; each (patient, MD) pair is its own row. The
 *   engine queries "give me all attributions for patient X" and applies
 *   priority logic (most recent? most-cited? — TBD in VIP-1.D).
 *
 * Subscription posture:
 *   - entity_id required (Rule #19).
 *   - Cross-DB ref: patient_id is to the storefront DB's Customer/User _id.
 *     We store as ObjectId without ref (mirrors WebsiteProduct cross-DB
 *     pattern, see CLAUDE.md gotcha #6).
 */

const mongoose = require('mongoose');

const patientMdAttributionSchema = new mongoose.Schema(
  {
    entity_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Entity',
      required: [true, 'entity_id is required'],
      index: true,
    },
    // Cross-DB ref to storefront Customer / User _id. No `ref:` because
    // populate() across separate DBs is unsafe (CLAUDE.md gotcha #6 — mirror
    // WebsiteProduct.js convention).
    patient_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, 'patient_id is required'],
      index: true,
    },
    doctor_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
      required: [true, 'doctor_id is required'],
      index: true,
    },

    // Attribution metadata
    source: {
      type: String,
      enum: {
        values: ['RX_PARSE', 'CUSTOMER_ATTESTATION', 'STAFF_ENTRY', 'IMPORT', 'OTHER'],
        message: 'source must be RX_PARSE, CUSTOMER_ATTESTATION, STAFF_ENTRY, IMPORT, or OTHER',
      },
      required: [true, 'source is required'],
    },
    // Confidence is a soft signal for the priority resolver in VIP-1.D
    // (e.g., RX_PARSE = 0.95, CUSTOMER_ATTESTATION = 0.7, STAFF_ENTRY = 0.85).
    // VIP-1.B doesn't consume it; reserved for VIP-1.D logic.
    confidence: { type: Number, default: 1.0, min: 0, max: 1 },

    // Denormalized for AREA_BDM commission lookup (StaffCommissionRule).
    // Updated by VIP-1.D listener when patient's primary ship-to changes.
    ship_to_province: { type: String, trim: true, index: true },
    ship_to_locality: { type: String, trim: true },

    // First / latest attribution timestamps. VIP-1.D priority logic may use
    // recency to break ties when a patient has multiple MD attributions.
    first_seen_date: { type: Date, default: Date.now },
    last_seen_date: { type: Date, default: Date.now },

    // Optional refs back to the storefront artifact that created the row
    // (Order, Prescription scan, etc.). String to avoid cross-DB ObjectId
    // confusion in logs.
    storefront_ref: { type: String, trim: true },

    is_active: { type: Boolean, default: true, index: true },
    notes: { type: String, trim: true, maxlength: 1000 },
  },
  { timestamps: true }
);

// Compound key: a (entity, patient, doctor) tuple is unique. New attribution
// of an existing pair updates last_seen_date + confidence rather than
// inserting a duplicate row (upsert logic in VIP-1.D).
patientMdAttributionSchema.index(
  { entity_id: 1, patient_id: 1, doctor_id: 1 },
  { unique: true }
);

// "Find all MDs attributed to this patient, active, ordered by recency".
patientMdAttributionSchema.index({
  entity_id: 1,
  patient_id: 1,
  is_active: 1,
  last_seen_date: -1,
});

module.exports = mongoose.model('PatientMdAttribution', patientMdAttributionSchema);
