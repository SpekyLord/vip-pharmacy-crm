/**
 * OfficeSupply Model — Consumable office supply item tracking
 * Phase 19 — separate from pharma inventory (no FIFO engine)
 */
const mongoose = require('mongoose');

const officeSupplySchema = new mongoose.Schema({
  entity_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', required: true },
  item_name: { type: String, required: true, trim: true },
  item_code: { type: String, trim: true, uppercase: true },
  category: {
    type: String,
    default: 'OTHER'
  }, // Lookup: OFFICE_SUPPLY_CATEGORY
  unit: { type: String, default: 'PCS', trim: true },
  qty_on_hand: { type: Number, default: 0 },
  reorder_level: { type: Number, default: 0 },
  last_purchase_price: { type: Number, default: 0 },
  warehouse_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },
  cost_center_id: { type: mongoose.Schema.Types.ObjectId, ref: 'CostCenter' },
  notes: { type: String, trim: true },
  is_active: { type: Boolean, default: true },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  created_at: { type: Date, default: Date.now, immutable: true }
}, { timestamps: true, collection: 'erp_office_supplies' });

officeSupplySchema.index({ entity_id: 1, item_code: 1 });
officeSupplySchema.index({ entity_id: 1, category: 1 });
officeSupplySchema.index({ entity_id: 1, is_active: 1 });

module.exports = mongoose.model('OfficeSupply', officeSupplySchema);
