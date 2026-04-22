/**
 * Undertaking Model — Phase 32
 *
 * Receipt confirmation document, auto-created as a sibling to every GRN.
 * Inventory-domain parallel to CALF (which is financial-domain for expenses).
 *
 * Purpose:
 *   The Undertaking is the receipt-confirmation step. When a BDM creates a GRN
 *   (standalone / PO-based / INTERNAL_TRANSFER), the system auto-creates a
 *   DRAFT Undertaking with line_items copied from GRN. The BDM then scans the
 *   medicine packaging barcode (batch_lot_no) or types it from the package
 *   label, and picks expiry via calendar. On Undertaking acknowledge, the
 *   linked GRN auto-approves inside the same MongoDB session (rule #20).
 *
 * Why not parse the waybill? Waybill is a courier tracking document — it
 * proves delivery but contains NO batch data. Batch/lot is printed on the
 * product packaging itself. Scanning or reading the packaging is the capture
 * action; the waybill is attached evidence only, displayed in the Approval
 * Hub for approver context.
 *
 * Lifecycle: DRAFT → SUBMITTED → ACKNOWLEDGED → (REJECTED via president-reverse)
 *
 * Doc numbering: UT-{TERRITORY}{MMDDYY}-{NNN} (territory-scoped, same as CALF).
 */
const mongoose = require('mongoose');
const { cleanBatchNo } = require('../utils/normalize');

const undertakingLineItemSchema = new mongoose.Schema({
  product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductMaster', required: true },
  item_key: { type: String },
  po_line_index: { type: Number },

  expected_qty: { type: Number, required: true, min: 0 },
  received_qty: { type: Number, required: true, min: 0 },

  batch_lot_no: { type: String, trim: true },
  expiry_date: { type: Date },

  purchase_uom: { type: String, trim: true },
  selling_uom: { type: String, trim: true },
  conversion_factor: { type: Number, default: 1, min: 1 },
  qty_selling_units: { type: Number },

  scan_confirmed: { type: Boolean, default: false },
  variance_flag: {
    type: String,
    enum: [null, 'QTY_UNDER', 'QTY_OVER', 'NEAR_EXPIRY', 'DUPLICATE_BATCH'],
    default: null
  }
}, { _id: false });

const undertakingSchema = new mongoose.Schema({
  entity_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', required: true },
  bdm_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  warehouse_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },

  undertaking_number: { type: String, trim: true },

  linked_grn_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GrnEntry',
    required: true
  },

  receipt_date: { type: Date, required: true },

  waybill_photo_url: { type: String, default: null },

  line_items: {
    type: [undertakingLineItemSchema],
    validate: [arr => arr.length > 0, 'At least one line item is required']
  },

  notes: { type: String, trim: true },
  rejection_reason: { type: String, trim: true },

  status: {
    type: String,
    default: 'DRAFT',
    enum: ['DRAFT', 'SUBMITTED', 'ACKNOWLEDGED', 'REJECTED', 'DELETION_REQUESTED']
  },

  acknowledged_at: { type: Date },
  acknowledged_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  event_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TransactionEvent' },
  deletion_event_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TransactionEvent' },
  reopen_count: { type: Number, default: 0 },

  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  created_at: { type: Date, default: Date.now, immutable: true },
  // Phase G4.5b — Proxy Entry. Mirrored from the parent GRN (autoUndertakingForGrn)
  // so the Approval Hub + BDM Undertaking list can show a "Proxied" pill on the UT
  // even though the GRN is the capture doc. bdm_id is the owner; created_by is the
  // proxy. See resolveOwnerScope.js.
  recorded_on_behalf_of: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: undefined
  },
  edit_history: [{ type: mongoose.Schema.Types.Mixed }]
}, {
  timestamps: false,
  collection: 'erp_undertakings'
});

// Pre-save: auto-generate doc number + normalize batch/qty
undertakingSchema.pre('save', async function (next) {
  try {
    if (this.isNew && !this.undertaking_number) {
      const { generateDocNumber } = require('../services/docNumbering');
      try {
        this.undertaking_number = await generateDocNumber({
          prefix: 'UT',
          bdmId: this.bdm_id,
          date: this.created_at || new Date()
        });
      } catch (err) {
        return next(new Error(`Failed to generate UT number: ${err.message}. Check Territory setup for this BDM.`));
      }
      if (!this.undertaking_number) {
        return next(new Error('UT number generation returned empty. Check DocSequence and Territory configuration.'));
      }
    }

    for (const li of this.line_items) {
      if (li.batch_lot_no) li.batch_lot_no = cleanBatchNo(li.batch_lot_no);
      li.qty_selling_units = (li.received_qty || 0) * (li.conversion_factor || 1);
    }

    next();
  } catch (err) {
    next(err);
  }
});

// Indexes
// linked_grn_id is unique only when the Undertaking is NOT reversed — reversed
// rows keep the ref for audit but free the GRN to get a fresh Undertaking if
// the GRN is also reversed and re-opened. Same partial-index pattern used for
// OfficeSupply.item_code (Phase 31R-OS).
undertakingSchema.index(
  { linked_grn_id: 1 },
  { unique: true, partialFilterExpression: { deletion_event_id: { $exists: false } } }
);
undertakingSchema.index({ entity_id: 1, bdm_id: 1, status: 1 });
undertakingSchema.index({ entity_id: 1, status: 1, created_at: -1 });
undertakingSchema.index({ undertaking_number: 1 });

module.exports = mongoose.model('Undertaking', undertakingSchema);
