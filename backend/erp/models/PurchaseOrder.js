/**
 * PurchaseOrder Model — Phase 12.2
 *
 * Per-BDM warehouse PO with territory-based numbering.
 * PO number assigned in controller via docNumbering.generateDocNumber().
 * Pre-save computes line totals and header totals (12% PH VAT).
 */
const mongoose = require('mongoose');

const poLineItemSchema = new mongoose.Schema({
  product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductMaster' },
  item_key: { type: String, trim: true, required: [true, 'Item description is required'] },
  qty_ordered: { type: Number, required: [true, 'Quantity ordered is required'], min: 1 },
  unit_price: { type: Number, required: [true, 'Unit price is required'], min: 0 },
  line_total: { type: Number, default: 0 },
  qty_received: { type: Number, default: 0 },
  qty_invoiced: { type: Number, default: 0 },
  // UOM snapshot from ProductMaster at PO creation time
  uom: { type: String, trim: true },                       // purchase UOM (e.g., CASE)
  selling_uom: { type: String, trim: true },                // selling UOM (e.g., BOX)
  conversion_factor: { type: Number, default: 1, min: 1 }   // 1 uom = N selling_uom
}, { _id: false });

const purchaseOrderSchema = new mongoose.Schema({
  entity_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', required: true },
  bdm_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  warehouse_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },
  po_number: { type: String, trim: true },
  vendor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorMaster', required: [true, 'Vendor is required'] },
  po_date: { type: Date, required: [true, 'PO date is required'] },
  expected_delivery_date: { type: Date },
  line_items: {
    type: [poLineItemSchema],
    validate: [arr => arr.length > 0, 'At least one line item is required']
  },
  total_amount: { type: Number, default: 0 },
  vat_amount: { type: Number, default: 0 },
  net_amount: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['DRAFT', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED'],
    default: 'DRAFT'
  },
  approved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approved_at: { type: Date },
  notes: { type: String, trim: true },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  created_at: { type: Date, default: Date.now, immutable: true }
}, {
  timestamps: false,
  collection: 'erp_purchase_orders'
});

// Pre-save: compute line totals and header totals
purchaseOrderSchema.pre('save', async function () {
  let total = 0;
  for (const item of this.line_items) {
    item.line_total = Math.round((item.qty_ordered * item.unit_price) * 100) / 100;
    total += item.line_total;
  }
  const Settings = require('./Settings');
  const vatRate = await Settings.getVatRate();
  this.total_amount = Math.round(total * 100) / 100;
  this.net_amount = Math.round((total / (1 + vatRate)) * 100) / 100;
  this.vat_amount = Math.round((total - this.net_amount) * 100) / 100;
});

purchaseOrderSchema.index({ entity_id: 1, status: 1 });
purchaseOrderSchema.index({ entity_id: 1, warehouse_id: 1, status: 1 });
purchaseOrderSchema.index({ entity_id: 1, vendor_id: 1, po_date: -1 });
purchaseOrderSchema.index({ entity_id: 1, po_number: 1 }, { unique: true, partialFilterExpression: { po_number: { $type: 'string' } } });
purchaseOrderSchema.index({ created_at: -1 });

module.exports = mongoose.model('PurchaseOrder', purchaseOrderSchema);
