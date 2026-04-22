const mongoose = require('mongoose');
const { cleanBatchNo } = require('../utils/normalize');

const grnLineItemSchema = new mongoose.Schema({
  product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductMaster', required: true },
  item_key: { type: String },
  // Phase 32R: GRN is the capture surface. batch_lot_no + expiry_date are
  // required at create time (controller enforces — pre-save skips for legacy
  // drafts). scan_confirmed flags OCR-parsed lines vs manual typing so the
  // approver can see capture quality in the Approval Hub.
  batch_lot_no: { type: String, default: '' },
  expiry_date: { type: Date, default: null },
  scan_confirmed: { type: Boolean, default: false },
  qty: { type: Number, required: [true, 'Quantity is required'], min: 1 },
  // Expected qty — for PO/transfer lines this is the remaining receivable
  // (pre-filled, read-only on the UI). For standalone GRNs it mirrors `qty`
  // on submit so the variance validator always has both numbers to compare.
  expected_qty: { type: Number },
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

  // Human-readable doc number — `GRN-{TERR|ENTITY}{MMDDYY}-{NNN}` via
  // services/docNumbering.generateDocNumber. Sparse so pre-numbering legacy
  // rows (no backfill) keep working. Generated in inventoryController.createGrn
  // before save; stays stable across the Undertaking + Approval Hub lifecycle.
  grn_number: { type: String, trim: true, index: { unique: false, sparse: true } },

  // Source type: PO (supplier), INTERNAL_TRANSFER (same-entity reassignment), or standalone
  source_type: {
    type: String,
    enum: ['PO', 'INTERNAL_TRANSFER', 'STANDALONE'],
    default: 'STANDALONE'
  },

  // PO cross-reference (optional — null for standalone/direct-delivery GRNs)
  po_id: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder' },
  po_number: { type: String, trim: true },              // denormalized for display
  vendor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorMaster' }, // inherited from PO

  // Internal transfer cross-reference (when source_type = INTERNAL_TRANSFER)
  reassignment_id: { type: mongoose.Schema.Types.ObjectId, ref: 'StockReassignment' },

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
    enum: ['PENDING', 'APPROVED', 'REJECTED', 'DELETION_REQUESTED'],
    default: 'PENDING'
  },
  notes: { type: String },
  rejection_reason: { type: String },
  reviewed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewed_at: { type: Date },

  // Phase 32 — back-link to auto-created Undertaking (receipt confirmation doc)
  undertaking_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Undertaking' },

  // Link to TransactionEvent on approval
  event_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TransactionEvent' },

  // SAP Storno reversal — set when GRN is reversed; original stays APPROVED for audit trail
  deletion_event_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TransactionEvent' },
  reopen_count: { type: Number, default: 0 },

  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  created_at: { type: Date, default: Date.now, immutable: true },
  // Phase G4.5b — Proxy Entry. Present when the caller (created_by) keyed the
  // row on behalf of another BDM. Value = the proxy's User._id. bdm_id is the
  // owner (assigned_to). Absence means self-entry. See resolveOwnerScope.js.
  recorded_on_behalf_of: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: undefined
  },
  edit_history: [{ type: mongoose.Schema.Types.Mixed }]
}, {
  timestamps: false,
  collection: 'erp_grn_entries'
});

// Normalize batch numbers and compute selling-unit quantities on save.
// Phase 32R: mirror expected_qty from qty when the caller didn't provide it
// (standalone GRNs) so the variance validator always has both numbers.
grnEntrySchema.pre('save', function (next) {
  for (const item of this.line_items) {
    if (item.batch_lot_no) {
      item.batch_lot_no = cleanBatchNo(item.batch_lot_no);
    }
    if (item.expected_qty == null) item.expected_qty = item.qty;
    // Compute qty in selling units: qty (purchase) * conversion_factor
    item.qty_selling_units = (item.qty || 0) * (item.conversion_factor || 1);
  }
  next();
});

grnEntrySchema.index({ entity_id: 1, bdm_id: 1, status: 1 });
grnEntrySchema.index({ entity_id: 1, status: 1 });
grnEntrySchema.index({ po_id: 1 });
grnEntrySchema.index({ reassignment_id: 1 });
grnEntrySchema.index({ created_at: -1 });

module.exports = mongoose.model('GrnEntry', grnEntrySchema);
