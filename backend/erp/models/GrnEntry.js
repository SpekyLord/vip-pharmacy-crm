const mongoose = require('mongoose');
const { cleanBatchNo } = require('../utils/normalize');

const grnLineItemSchema = new mongoose.Schema({
  product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductMaster', required: true },
  item_key: { type: String },
  batch_lot_no: { type: String, required: [true, 'Batch/Lot number is required'] },
  expiry_date: { type: Date, required: [true, 'Expiry date is required'] },
  qty: { type: Number, required: [true, 'Quantity is required'], min: 1 },
  // UOM conversion: qty is in purchase units; qty_selling_units is computed
  purchase_uom: { type: String, trim: true },
  selling_uom: { type: String, trim: true },
  conversion_factor: { type: Number, default: 1, min: 1 },
  qty_selling_units: { type: Number },   // computed: qty * conversion_factor
  // PO cross-reference: index into PO.line_items[] identifying which PO line this fulfills
  po_line_index: { type: Number }
}, { _id: false });

const grnEntrySchema = new mongoose.Schema({
  entity_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', required: true },
  bdm_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  warehouse_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' }, // Phase 17 — receiving warehouse

  // PO cross-reference (optional — null for standalone/direct-delivery GRNs)
  po_id: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder' },
  po_number: { type: String, trim: true },              // denormalized for display
  vendor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorMaster' }, // inherited from PO

  grn_date: { type: Date, required: [true, 'GRN date is required'] },
  line_items: {
    type: [grnLineItemSchema],
    validate: [arr => arr.length > 0, 'At least one line item is required']
  },

  // Proof documents
  waybill_photo_url: { type: String },
  undertaking_photo_url: { type: String },
  ocr_data: { type: mongoose.Schema.Types.Mixed },

  // Approval workflow
  status: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED'],
    default: 'PENDING'
  },
  notes: { type: String },
  rejection_reason: { type: String },
  reviewed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewed_at: { type: Date },

  // Link to TransactionEvent on approval
  event_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TransactionEvent' },

  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  created_at: { type: Date, default: Date.now, immutable: true }
}, {
  timestamps: false,
  collection: 'erp_grn_entries'
});

// Normalize batch numbers and compute selling-unit quantities on save
grnEntrySchema.pre('save', function (next) {
  for (const item of this.line_items) {
    if (item.batch_lot_no) {
      item.batch_lot_no = cleanBatchNo(item.batch_lot_no);
    }
    // Compute qty in selling units: qty (purchase) * conversion_factor
    item.qty_selling_units = (item.qty || 0) * (item.conversion_factor || 1);
  }
  next();
});

grnEntrySchema.index({ entity_id: 1, bdm_id: 1, status: 1 });
grnEntrySchema.index({ entity_id: 1, status: 1 });
grnEntrySchema.index({ po_id: 1 });
grnEntrySchema.index({ created_at: -1 });

module.exports = mongoose.model('GrnEntry', grnEntrySchema);
