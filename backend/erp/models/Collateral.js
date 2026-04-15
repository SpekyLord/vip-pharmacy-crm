/**
 * Collateral Model — Marketing materials and samples tracking
 * Phase 19 — brochures, samples, banners, giveaways, posters
 *
 * Field alignment (April 2026):
 *   - `name` is the primary display field (was `collateral_name`)
 *   - `collateral_name` kept as virtual alias for backward compat (export/import)
 *   - `assigned_to` is a string (person or department name), not ObjectId
 *   - `description` added for frontend form support
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
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true, default: '' },
  collateral_type: {
    type: String,
    default: 'OTHER'
  }, // Lookup: COLLATERAL_TYPE
  item_code: { type: String, trim: true, uppercase: true },
  qty_on_hand: { type: Number, default: 0 },
  unit: { type: String, default: 'PCS', trim: true },
  warehouse_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },
  assigned_to: { type: String, trim: true, default: '' },
  distribution_log: [distributionLogSchema],
  photo_url: { type: String },
  is_active: { type: Boolean, default: true },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  created_at: { type: Date, default: Date.now, immutable: true }
}, { timestamps: true, collection: 'erp_collaterals', toJSON: { virtuals: true }, toObject: { virtuals: true } });

// Backward-compat virtual: collateral_name → name
collateralSchema.virtual('collateral_name').get(function () { return this.name; });

collateralSchema.index({ entity_id: 1, collateral_type: 1 });
collateralSchema.index({ entity_id: 1, assigned_to: 1 });
collateralSchema.index({ entity_id: 1, is_active: 1 });

module.exports = mongoose.model('Collateral', collateralSchema);
