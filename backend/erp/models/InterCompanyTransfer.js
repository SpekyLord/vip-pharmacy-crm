const mongoose = require('mongoose');
const { cleanBatchNo } = require('../utils/normalize');

const ictLineItemSchema = new mongoose.Schema({
  product_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProductMaster',
    required: true
  },
  item_key: { type: String, trim: true },
  batch_lot_no: { type: String, trim: true },
  expiry_date: { type: Date },
  qty: {
    type: Number,
    required: [true, 'Quantity is required'],
    min: [1, 'Quantity must be at least 1']
  },
  unit: { type: String, trim: true },
  transfer_price: {
    type: Number,
    required: [true, 'Transfer price is required'],
    min: 0
  },
  line_total: { type: Number }
}, { _id: false });

const interCompanyTransferSchema = new mongoose.Schema({
  // Header
  source_entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: [true, 'Source entity is required']
  },
  target_entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: [true, 'Target entity is required']
  },
  transfer_date: {
    type: Date,
    required: [true, 'Transfer date is required']
  },
  transfer_ref: {
    type: String
    // Auto-generated in pre-save hook; unique index defined below via schema.index()
  },
  // CSI reference number — this is a sales transaction, CSI is the proof of sale
  csi_ref: {
    type: String,
    trim: true
  },
  requested_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Source BDM whose stock to deduct (warehouse keeper)
  source_bdm_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // Target BDM who receives the stock
  target_bdm_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  notes: { type: String, trim: true },

  // Line items
  line_items: {
    type: [ictLineItemSchema],
    validate: [arr => arr.length > 0, 'At least one line item is required']
  },

  // Totals (auto-computed)
  total_amount: { type: Number, default: 0 },
  total_items: { type: Number, default: 0 },

  // Status lifecycle
  status: {
    type: String,
    enum: ['DRAFT', 'APPROVED', 'SHIPPED', 'RECEIVED', 'POSTED', 'CANCELLED'],
    default: 'DRAFT'
  },

  // Approval
  approved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approved_at: { type: Date },

  // Shipping
  shipped_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  shipped_at: { type: Date },
  source_event_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TransactionEvent' },

  // Receiving
  received_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  received_at: { type: Date },
  target_event_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TransactionEvent' },

  // Posting
  posted_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  posted_at: { type: Date },

  // Cancellation
  cancelled_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  cancelled_at: { type: Date },
  cancel_reason: { type: String },

  // Audit
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  created_at: {
    type: Date,
    immutable: true,
    default: Date.now
  }
}, {
  timestamps: false,
  collection: 'erp_inter_company_transfers'
});

// Auto-compute line_total and roll up totals
interCompanyTransferSchema.pre('save', function (next) {
  let totalAmount = 0;
  for (const item of this.line_items) {
    if (item.batch_lot_no) {
      item.batch_lot_no = cleanBatchNo(item.batch_lot_no);
    }
    item.line_total = Math.round(item.qty * item.transfer_price * 100) / 100;
    totalAmount += item.line_total;
  }
  this.total_amount = Math.round(totalAmount * 100) / 100;
  this.total_items = this.line_items.reduce((sum, li) => sum + li.qty, 0);

  // Auto-generate transfer_ref if not set
  if (this.isNew && !this.transfer_ref) {
    const d = this.transfer_date || new Date();
    const dateStr = d.toISOString().slice(0, 10).replace(/-/g, '');
    const rand = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
    this.transfer_ref = `ICT-${dateStr}-${rand}`;
  }

  next();
});

// Indexes
interCompanyTransferSchema.index({ source_entity_id: 1, status: 1 });
interCompanyTransferSchema.index({ target_entity_id: 1, status: 1 });
interCompanyTransferSchema.index({ transfer_ref: 1 }, { unique: true });
interCompanyTransferSchema.index({ created_at: -1 });

module.exports = mongoose.model('InterCompanyTransfer', interCompanyTransferSchema);
