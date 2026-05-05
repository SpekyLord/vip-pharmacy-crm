/**
 * CaptureSubmission — Phase P1 (April 23, 2026).
 *
 * Bridges BDM mobile capture (field) → office proxy processing → BDM review.
 * Each row represents a single capture event (one OR scan, one ODO photo pair,
 * one fuel receipt, etc.) that flows through the proxy pipeline.
 *
 * Lifecycle:  PENDING_PROXY → IN_PROGRESS → PROCESSED → AWAITING_BDM_REVIEW → ACKNOWLEDGED
 *                                                    ↘ DISPUTED (terminal — IncentiveDispute filed)
 *             CANCELLED (BDM or admin can cancel before processing)
 *
 * Rule #19: entity_id stamped at create; proxy at Entity A cannot process Entity B's submissions.
 * Rule #21: bdm_id explicit — no silent self-scope fallback.
 * Rule #3: SLA thresholds lookup-driven (PROXY_SLA_THRESHOLDS).
 */

const mongoose = require('mongoose');

const capturedArtifactSchema = new mongoose.Schema({
  kind: {
    type: String,
    enum: [
      'photo',            // generic photo (ODO start/end, waybill, etc.)
      'receipt_scan',     // OR / gas receipt scan
      'csi_scan',         // CSI delivery copy (pink/yellow proof of delivery)
      'paid_csi_scan',    // CSI being paid (digital-only, no paper expected)
      'cr_scan',          // collection receipt (CR) issued to customer
      'deposit_slip',     // bank deposit slip after collection
      'cwt_scan',         // BIR Form 2307 (Certificate of Withholding Tax) inbound
      'barcode_scan',     // product barcode for GRN
      'fuel_receipt',     // fuel pump receipt
    ],
    required: true,
  },
  url: { type: String },                                  // S3 URL after upload
  local_key: { type: String },                            // IndexedDB key (offline reference, cleared after sync)
  ocr_result: { type: mongoose.Schema.Types.Mixed },      // structured OCR output (vendor, amount, date, etc.)
  gps: {
    lat: { type: Number },
    lng: { type: Number },
    accuracy: { type: Number },
  },
  timestamp: { type: Date, default: Date.now },           // capture moment (EXIF or device clock)
  notes: { type: String, maxlength: 500 },                // BDM free-text annotation
}, { _id: true });

const captureSubmissionSchema = new mongoose.Schema({
  // ── Ownership ──
  bdm_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: true,
    index: true,
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },

  // ── Workflow classification ──
  workflow_type: {
    type: String,
    enum: [
      'SMER',           // #1 — ODO photos + km declaration (digital-only)
      'EXPENSE',        // #2 — OR-based expense
      'SALES',          // #3 — CSI delivery copy (pink/yellow proof of delivery)
      'OPENING_AR',     // #4 — opening AR (all proxy)
      'COLLECTION',     // #5 — collection capture; sub_type ∈ {CR, DEPOSIT, PAID_CSI}
      'GRN',            // #6 — product scan + batch/expiry
      'PETTY_CASH',     // #7 — mobile request
      'FUEL_ENTRY',     // #8 — fuel pump receipt
      'CWT_INBOUND',    // #9 — BIR 2307 received from customer (bridges to CwtLedger)
      // Phase P1.2 Slice 1 (May 06 2026) — zero-typing capture path. BDM
      // taps "Quick Capture" → camera → snap → submit; proxy classifies
      // later from /erp/capture-archive or the Pending-Photos picker on
      // ERP entry pages. Defaults physical_required=true (paper expected
      // until proxy reclassifies); the proxy's reclassification flips
      // physical_required + physical_status atomically.
      'UNCATEGORIZED',
    ],
    required: true,
    index: true,
  },

  // ── Sub-classification (used by COLLECTION) ──
  sub_type: {
    type: String,
    enum: ['CR', 'DEPOSIT', 'PAID_CSI', null],
    default: null,
  },

  // ── Physical paper expectation (Slice 3 reconciliation) ──
  // false for digital-only captures (SMER, COLLECTION/PAID_CSI)
  // true for everything else — physical paper must arrive at office
  physical_required: { type: Boolean, default: true },
  physical_status: {
    type: String,
    enum: ['PENDING', 'RECEIVED', 'MISSING', 'N_A'],
    default: 'PENDING',
    index: true,
  },
  physical_received_at: { type: Date },
  physical_received_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },

  // ── Status lifecycle ──
  status: {
    type: String,
    enum: [
      'PENDING_PROXY',         // BDM captured, waiting for proxy pickup
      'IN_PROGRESS',           // proxy has started processing
      'PROCESSED',             // proxy completed, ERP doc created
      'AWAITING_BDM_REVIEW',   // proxied entry needs BDM confirmation
      'ACKNOWLEDGED',          // BDM confirmed the proxied entry
      'DISPUTED',              // BDM disputed — IncentiveDispute filed
      'CANCELLED',             // cancelled before processing
      'AUTO_ACKNOWLEDGED',     // SLA agent auto-acked after threshold
    ],
    default: 'PENDING_PROXY',
    required: true,
    index: true,
  },

  // ── Captured artifacts (BDM side) ──
  captured_artifacts: [capturedArtifactSchema],

  // ── BDM-provided metadata ──
  bdm_notes: { type: String, maxlength: 1000 },
  amount_declared: { type: Number },                      // BDM-entered amount (e.g., OR total)
  payment_mode: { type: String, maxlength: 50 },          // cash / check / online
  access_for: { type: String, maxlength: 200 },           // "who for?" note on ACCESS expenses

  // ── Proxy processing ──
  proxy_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  proxy_started_at: { type: Date },
  proxy_completed_at: { type: Date },
  proxy_notes: { type: String, maxlength: 1000 },

  // ── Linked ERP document (after processing) ──
  linked_doc_kind: {
    type: String,
    enum: [
      'ExpenseEntry', 'SalesLine', 'Collection', 'GrnEntry',
      'SmerEntry', 'PettyCashTransaction', 'CarLogbookEntry',
      'CwtLedgerEntry',
      null,
    ],
  },
  linked_doc_id: {
    type: mongoose.Schema.Types.ObjectId,
  },

  // ── BDM review ──
  bdm_acknowledged_at: { type: Date },
  disputed_at: { type: Date },
  dispute_reason: { type: String, maxlength: 1000 },
  dispute_ref: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'IncentiveDispute',
  },

  // ── SLA tracking ──
  sla_alert_sent_at: { type: Date },                      // when the 24h SLA alert was dispatched
  auto_ack_at: { type: Date },                            // when auto-acknowledged by agent

}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'capture_submissions',
});

// ── Compound indexes for query patterns ──
captureSubmissionSchema.index({ bdm_id: 1, status: 1 });
captureSubmissionSchema.index({ entity_id: 1, status: 1, workflow_type: 1 });
captureSubmissionSchema.index({ created_at: -1 });
captureSubmissionSchema.index({ proxy_id: 1, status: 1 });
captureSubmissionSchema.index({ status: 1, created_at: 1 });  // SLA agent scan
// Slice-3 reconciliation: BDM × cycle × physical_status sweeps
captureSubmissionSchema.index({ bdm_id: 1, physical_status: 1, created_at: 1 });

module.exports = mongoose.model('CaptureSubmission', captureSubmissionSchema);
