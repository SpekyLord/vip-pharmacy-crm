/**
 * CwtLedger Model — Creditable Withholding Tax tracking for BIR 2307 inbound.
 *
 * Each row records a 2307 certificate (or expected certificate) for a hospital
 * collection. Auto-created on collection post when `cwt_amount > 0`; bookkeeper
 * later flips PENDING_2307 → RECEIVED when the hospital sends the paper /
 * digital 2307. Aggregated per hospital per quarter for 2307 summary filing
 * and rolled up annually as the 1702 Creditable Tax Withheld credit (Phase J7).
 *
 * Phase VIP-1.J / J6 (May 2026) — Reconciliation fields added:
 *   • status enum (PENDING_2307 / RECEIVED / EXCLUDED)
 *   • received_at + received_by — bookkeeper attestation timestamp + user
 *   • cert_2307_url + cert_filename + cert_content_hash — admin-supplied
 *     reference to the PDF (Drive link / S3 URI / file path). We do NOT
 *     store the PDF bytes — bookkeeper hosts wherever convenient (existing
 *     workflow). Hash is optional; admin pastes if they want tamper-detect.
 *   • cert_notes — free-form (e.g. "Received via email 5/15", "BIR-stamped")
 *   • excluded_reason — finance disqualifies (e.g., duplicate, void)
 *   • tagged_for_1702_year — defaults to `year`; overridable for cross-year
 *     reconciliation (rare — when 2307 arrives after 1702 was already filed).
 *
 * INBOUND vs OUTBOUND separation — CwtLedger is the source-of-truth for
 * INBOUND (hospital→VIP) CWT. WithholdingLedger.DIRECTIONS reserves
 * 'INBOUND' but J2's engine only writes OUTBOUND today. J6 chose to extend
 * CwtLedger (coexist) rather than migrate so live writes from
 * collectionController + journalFromCWT don't change. A future migration
 * to WithholdingLedger is non-breaking — both shapes can be aggregated
 * via a union pipeline if needed.
 */
const mongoose = require('mongoose');

const STATUS_VALUES = ['PENDING_2307', 'RECEIVED', 'EXCLUDED'];

const cwtLedgerSchema = new mongoose.Schema({
  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: true
  },
  // Day-4.5 #4 (2026-04-25): flipped to required:true. Both write paths
  // (collectionController.js:586 + :975) inherit bdm_id from a Collection,
  // and Collection.bdm_id is itself required. cwtService.createCwtEntry is
  // the only writer. Hardening here makes the schema match the runtime
  // bdmGuard's expectation.
  bdm_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  period: {
    type: String,
    required: true,
    trim: true
  },
  hospital_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital'
  },
  hospital_tin: { type: String, trim: true },
  cr_no: { type: String, trim: true },
  cr_date: { type: Date },
  cr_amount: { type: Number, default: 0 },
  cwt_rate: { type: Number, default: 0.02 },
  cwt_amount: { type: Number, default: 0 },
  atc_code: { type: String, trim: true },
  quarter: {
    type: String,
    enum: ['Q1', 'Q2', 'Q3', 'Q4'],
    required: true
  },
  year: {
    type: Number,
    required: true
  },

  // ── Phase VIP-1.J / J6 — Inbound 2307 reconciliation ─────────────────
  // Default PENDING_2307 because every new collection-driven CWT row starts
  // life waiting for the hospital's certificate. Bookkeeper flips to
  // RECEIVED when the cert arrives. EXCLUDED is finance's manual override
  // (duplicate, void, hospital re-issued).
  status: {
    type: String,
    enum: STATUS_VALUES,
    default: 'PENDING_2307',
    required: true,
  },
  received_at: { type: Date, default: null },
  received_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  cert_2307_url: { type: String, trim: true, default: null },
  cert_filename: { type: String, trim: true, default: null },
  cert_content_hash: { type: String, trim: true, default: null },
  cert_notes: { type: String, trim: true, default: null },
  excluded_reason: { type: String, trim: true, default: null },
  excluded_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  excluded_at: { type: Date, default: null },
  tagged_for_1702_year: { type: Number, default: null },

  created_at: {
    type: Date,
    immutable: true,
    default: Date.now
  }
}, {
  timestamps: false,
  collection: 'erp_cwt_ledger'
});

cwtLedgerSchema.index({ entity_id: 1, period: 1 });
cwtLedgerSchema.index({ entity_id: 1, quarter: 1, year: 1 });
cwtLedgerSchema.index({ entity_id: 1, hospital_id: 1 });
// J6 — reconciliation queue + 1702 rollup index
cwtLedgerSchema.index({ entity_id: 1, status: 1, year: 1 });
cwtLedgerSchema.index({ entity_id: 1, tagged_for_1702_year: 1, status: 1 });

cwtLedgerSchema.statics.STATUSES = STATUS_VALUES;

module.exports = mongoose.model('CwtLedger', cwtLedgerSchema);
