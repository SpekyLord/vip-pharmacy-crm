const mongoose = require('mongoose');

const conversionSchema = new mongoose.Schema({
  csi_doc_ref: { type: String },
  csi_date: { type: Date },
  qty_converted: { type: Number, required: true },
  sales_line_id: { type: mongoose.Schema.Types.ObjectId }
}, { _id: false });

const consignmentTrackerSchema = new mongoose.Schema({
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
  warehouse_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' }, // Phase 17
  hospital_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital',
    required: true
  },
  hospital_name: { type: String },
  // Phase H6 — Sales OCR: a DR can represent either a standard consignment
  // (converts to CSI when consumed) or a sampling dispatch (free product,
  // never converts to sale). The scanner's drRouter detects the marker on
  // the slip and sets this field. Existing records default to CONSIGNMENT
  // so every downstream query is backward compatible.
  dispatch_type: {
    type: String,
    enum: ['CONSIGNMENT', 'SAMPLING'],
    default: 'CONSIGNMENT',
  },
  dr_ref: { type: String, required: true },
  dr_date: { type: Date, required: true },
  product_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProductMaster',
    required: true
  },
  item_key: { type: String },
  batch_lot_no: { type: String },

  qty_delivered: { type: Number, required: true },
  qty_consumed: { type: Number, default: 0 },
  qty_remaining: { type: Number },

  conversions: [conversionSchema],

  days_outstanding: { type: Number },
  aging_status: {
    type: String,
    default: 'OPEN'
  }, // Lookup: CONSIGNMENT_AGING_STATUS
  max_days_alert: { type: Number, default: 60 },
  max_days_force_csi: { type: Number, default: 90 },

  dr_photo_url: { type: String },
  status: {
    type: String,
    default: 'ACTIVE'
  }, // Lookup: CONSIGNMENT_STATUS
  created_at: {
    type: Date,
    immutable: true,
    default: Date.now
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: false
});

// Auto-compute qty_remaining and days_outstanding
consignmentTrackerSchema.pre('save', function (next) {
  this.qty_remaining = this.qty_delivered - this.qty_consumed;
  if (this.dr_date) {
    this.days_outstanding = Math.floor((Date.now() - this.dr_date.getTime()) / (1000 * 60 * 60 * 24));
  }
  // Auto-update aging_status
  // Phase H6 — SAMPLING dispatches never convert to sale, so skip FORCE_CSI.
  // They still age OPEN → OVERDUE → COLLECTED so unused samples surface in
  // the OVERDUE bucket for BDM follow-up (sample accountability).
  const isSampling = this.dispatch_type === 'SAMPLING';
  if (this.qty_remaining <= 0) {
    this.status = 'FULLY_CONSUMED';
    this.aging_status = 'COLLECTED';
  } else if (!isSampling && this.days_outstanding >= this.max_days_force_csi) {
    this.aging_status = 'FORCE_CSI';
  } else if (this.days_outstanding >= this.max_days_alert) {
    this.aging_status = 'OVERDUE';
  }
  next();
});

// Indexes
consignmentTrackerSchema.index({ entity_id: 1, bdm_id: 1 });
consignmentTrackerSchema.index({ entity_id: 1, hospital_id: 1, status: 1 });
consignmentTrackerSchema.index({ entity_id: 1, aging_status: 1 });
consignmentTrackerSchema.index({ dr_ref: 1 });

module.exports = mongoose.model('ConsignmentTracker', consignmentTrackerSchema);
