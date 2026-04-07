/**
 * DocumentAttachment — Permanent record of scanned/uploaded document photos
 *
 * Phase 9.1b: Every OCR scan or manual upload creates a DocumentAttachment
 * record linking the S3 photo to its source module and (once posted) to
 * the immutable TransactionEvent.
 *
 * Lifecycle: created at OCR/upload time → linked to source record →
 *            event_id set at submit/post time
 */
const mongoose = require('mongoose');

const DOCUMENT_TYPES = [
  'CSI',           // Charge Sales Invoice
  'DR',            // Delivery Receipt
  'CR',            // Collection Receipt
  'CWT_2307',      // BIR 2307 Withholding Tax Certificate
  'DEPOSIT_SLIP',  // Bank deposit slip
  'UNDERTAKING',   // Undertaking of Receipt (GRN)
  'WAYBILL',       // Shipment/courier proof of delivery
  'GAS_RECEIPT',   // Fuel expense proof
  'OR',            // Official Receipt (expense proof)
  'ODOMETER',      // Mileage/odometer photo proof
  'PRF_CALF'       // Payment request / cash advance proof
];

const documentAttachmentSchema = new mongoose.Schema({
  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: true
  },
  bdm_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  event_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TransactionEvent',
    default: null  // set at submit/post time
  },
  source_model: {
    type: String,
    enum: ['SalesLine', 'Collection', 'ExpenseEntry', 'CarLogbookEntry', 'GrnEntry', 'PrfCalf', 'ConsignmentTracker', 'IcSettlement', 'StockReassignment'],
    default: null  // set when form is saved
  },
  source_id: {
    type: mongoose.Schema.Types.ObjectId,
    default: null  // set when form is saved
  },
  document_type: {
    type: String,
    enum: DOCUMENT_TYPES,
    required: true
  },
  ocr_applied: {
    type: Boolean,
    default: false
  },
  storage_url: {
    type: String,
    required: true
  },
  s3_key: {
    type: String
  },
  folder_path: {
    type: String
  },
  original_filename: {
    type: String
  },
  uploaded_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  uploaded_at: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: false,
  collection: 'erp_document_attachments'
});

// Indexes
documentAttachmentSchema.index({ entity_id: 1, document_type: 1, uploaded_at: -1 });
documentAttachmentSchema.index({ event_id: 1 });
documentAttachmentSchema.index({ source_model: 1, source_id: 1 });
documentAttachmentSchema.index({ bdm_id: 1, uploaded_at: -1 });

module.exports = mongoose.model('DocumentAttachment', documentAttachmentSchema);
module.exports.DOCUMENT_TYPES = DOCUMENT_TYPES;
