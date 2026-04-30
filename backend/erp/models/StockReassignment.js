const mongoose = require('mongoose');
const { cleanBatchNo } = require('../utils/normalize');

const reassignmentLineItemSchema = new mongoose.Schema({
  product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductMaster', required: true },
  item_key: { type: String },
  batch_lot_no: { type: String, required: [true, 'Batch/Lot number is required'] },
  expiry_date: { type: Date, required: [true, 'Expiry date is required'] },
  qty: { type: Number, required: [true, 'Quantity is required'], min: 1 }
}, { _id: false });

const stockReassignmentSchema = new mongoose.Schema({
  reassignment_ref: {
    type: String
    // Auto-generated: TERRITORY-MMDDYY-SEQ (e.g. ILO-040226-001)
  },
  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: true
  },
  source_bdm_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Source custodian is required']
  },
  target_bdm_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Target custodian is required']
  },
  // Phase 17 — warehouse-to-warehouse transfers
  source_warehouse_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },
  target_warehouse_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },
  reassignment_date: {
    type: Date,
    required: [true, 'Reassignment date is required']
  },
  line_items: {
    type: [reassignmentLineItemSchema],
    validate: [arr => arr.length > 0, 'At least one line item is required']
  },

  // Proof documents (same pattern as GrnEntry)
  undertaking_photo_url: { type: String },
  ocr_data: { type: mongoose.Schema.Types.Mixed },
  notes: { type: String },

  // Approval workflow (same pattern as GrnEntry)
  status: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'AWAITING_GRN', 'COMPLETED', 'REJECTED'],
    default: 'PENDING'
  },
  rejection_reason: { type: String },
  reviewed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewed_at: { type: Date },

  // Link to GRN created by receiving contractor
  grn_id: { type: mongoose.Schema.Types.ObjectId, ref: 'GrnEntry' },

  // Link to TransactionEvent on approval
  event_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TransactionEvent' },

  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  created_at: { type: Date, default: Date.now, immutable: true }
}, {
  timestamps: false,
  collection: 'erp_stock_reassignments'
});

// Normalize batch numbers + auto-generate reassignment_ref on save.
//
// Phase G4.5dd-r1 (Apr 30 2026 evening) — ref generation moved off the
// controller and onto the model, mirroring InterCompanyTransfer.
// Format: IST-{TERRITORY|ENTITY}{MMDDYY}-{NNN}, matching ICT/JE/CALF/PO.
//   - Territory code from source BDM's Territory mapping (CALF/PRF style).
//   - Falls back to source Entity.short_name (admin-editable, cached).
//   - Atomic sequence via DocSequence — collision-safe.
//
// The legacy admin-typed `territory_code` input on the modal is deprecated;
// docNumbering's resolver now handles the prefix automatically.
stockReassignmentSchema.pre('save', async function (next) {
  try {
    for (const item of this.line_items) {
      if (item.batch_lot_no) {
        item.batch_lot_no = cleanBatchNo(item.batch_lot_no);
      }
    }

    if (this.isNew && !this.reassignment_ref) {
      const { generateDocNumber } = require('../services/docNumbering');
      this.reassignment_ref = await generateDocNumber({
        prefix: 'IST',
        bdmId: this.source_bdm_id,
        entityId: this.entity_id,
        date: this.reassignment_date || new Date(),
        fallbackCode: 'STR',
      });
    }

    next();
  } catch (err) {
    next(err);
  }
});

stockReassignmentSchema.index({ entity_id: 1, status: 1 });
stockReassignmentSchema.index({ entity_id: 1, source_bdm_id: 1 });
stockReassignmentSchema.index({ entity_id: 1, target_bdm_id: 1 });
stockReassignmentSchema.index({ created_at: -1 });

module.exports = mongoose.model('StockReassignment', stockReassignmentSchema);
