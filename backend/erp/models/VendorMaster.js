const mongoose = require('mongoose');

const vendorMasterSchema = new mongoose.Schema({
  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: true
  },
  vendor_code: {
    type: String,
    trim: true
  },
  vendor_name: {
    type: String,
    required: [true, 'Vendor name is required'],
    trim: true
  },
  // OCR name variations for fuzzy matching (SAP vendor search terms)
  vendor_aliases: {
    type: [String],
    default: []
  },
  tin: { type: String, trim: true },
  address: { type: String, trim: true },
  contact_person: { type: String, trim: true },
  phone: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },

  // Default COA for automatic account determination (SAP XK01 pattern)
  default_coa_code: { type: String, trim: true },
  default_expense_category: { type: String, trim: true },

  payment_terms_days: { type: Number, default: 0 },
  vat_status: {
    type: String,
    default: 'VATABLE'
  }, // Lookup: VAT_TYPE
  bank_account: {
    bank: { type: String },
    account_no: { type: String },
    account_name: { type: String }
  },
  is_active: { type: Boolean, default: true },

  // ── Phase VIP-1.J / J2 — BIR withholding posture ──
  // Identical pattern to PeopleMaster.withhold_active. Per-vendor toggle on
  // top of entity-level switches. For landlords, set `is_landlord = true` +
  // `default_atc_code = 'WI160'` (individual) or `'WC160'` (corporate) — the
  // engine consults this when posting a PRF rent line. For TWA-eligible
  // suppliers (top-withholding-agent posture), set `default_atc_code = 'WI080'`
  // (goods) or `'WI081'` (services); the engine then withholds 1%/2% on every
  // post-tax expense line tied to this vendor.
  withhold_active: { type: Boolean, default: false },
  default_atc_code: { type: String, trim: true, uppercase: true, default: null },
  is_landlord: { type: Boolean, default: false },
  // Legal-entity classification for ATC bucket choice (individual vs corporate).
  payee_kind: {
    type: String,
    enum: ['INDIVIDUAL', 'CORPORATION', 'PARTNERSHIP', 'OTHER', null],
    default: null,
  },

  // ── Phase H5 — Vendor Auto-Learn from Claude Wins ──
  // When Claude successfully classifies an OR/GAS_RECEIPT that didn't match any existing
  // VendorMaster entry, the OCR pipeline creates a new vendor here (or appends a fresh OCR
  // text variation to an existing vendor's aliases). These fields let admin review and
  // approve/reject machine-learned vendors before they influence future classifications.
  auto_learned_from_ocr: { type: Boolean, default: false, index: true },
  learning_source: {
    type: String,
    enum: ['CLAUDE_AI', 'MANUAL', 'IMPORT', null],
    default: null,
  },
  learned_at: { type: Date, default: null },
  learning_status: {
    type: String,
    enum: ['UNREVIEWED', 'APPROVED', 'REJECTED'],
    default: 'UNREVIEWED',
  },
  // Snapshot of the OCR context that produced this vendor — helps admin judge whether
  // the learning was correct before approving. Rejecting sets is_active = false.
  learning_meta: {
    source_doc_type: { type: String, default: null },    // OR | GAS_RECEIPT
    source_ocr_text: { type: String, default: null },    // the supplier_name string Claude returned
    source_raw_snippet: { type: String, default: null }, // first ~300 chars of raw OCR text
    ai_confidence: { type: String, enum: ['HIGH', 'MEDIUM', 'LOW', null], default: null },
    suggested_coa_code: { type: String, default: null },
    suggested_category: { type: String, default: null },
    learn_count: { type: Number, default: 1 },           // bumped each time an alias is added via auto-learn
  },

  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true,
  collection: 'erp_vendors'
});

// Indexes
vendorMasterSchema.index({ entity_id: 1, vendor_code: 1 }, { unique: true, partialFilterExpression: { vendor_code: { $type: 'string' } } });
vendorMasterSchema.index({ entity_id: 1, is_active: 1 });
vendorMasterSchema.index({ vendor_name: 'text', vendor_aliases: 'text' });
// Phase H5 — admin review queue (unreviewed auto-learned vendors per entity, newest first)
vendorMasterSchema.index({ entity_id: 1, auto_learned_from_ocr: 1, learning_status: 1, learned_at: -1 });

module.exports = mongoose.model('VendorMaster', vendorMasterSchema);
