/**
 * Collateral Model — Marketing materials and samples tracking
 * Phase 19 — brochures, samples, banners, giveaways, posters
 */
const mongoose = require('mongoose');

const distributionLogSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  qty: { type: Number, required: true },
  recipient: { type: String, trim: true },
  hospital_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
  customer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  notes: { type: String, trim: true },
  recorded_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { _id: true });

const collateralSchema = new mongoose.Schema({
  entity_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', required: true },
  collateral_name: { type: String, required: true, trim: true },
  collateral_type: {
    type: String,
    default: 'OTHER'
  }, // Lookup: COLLATERAL_TYPE
  item_code: { type: String, trim: true, uppercase: true },
  qty_on_hand: { type: Number, default: 0 },
  unit: { type: String, default: 'PCS', trim: true },
  warehouse_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },
  assigned_to: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  distribution_log: [distributionLogSchema],
  photo_url: { type: String },
  is_active: { type: Boolean, default: true },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  created_at: { type: Date, default: Date.now, immutable: true }
}, { timestamps: true, collection: 'erp_collaterals' });

collateralSchema.index({ entity_id: 1, collateral_type: 1 });
collateralSchema.index({ entity_id: 1, assigned_to: 1 });
collateralSchema.index({ entity_id: 1, is_active: 1 });

module.exports = mongoose.model('Collateral', collateralSchema);
